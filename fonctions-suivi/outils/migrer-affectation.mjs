/* ==========================================================================
   CAPMEDIA TEST · passer les affectations au nouveau format

   L'ancienne affectation d'une campagne était une liste de références de
   la bibliothèque par testeur ({ uid: ['TA-01', ...] }). Le modèle commun
   est désormais { uid: { telephone, web, cles, vague } }, et les règles
   n'acceptent un passage que si sa clé « scenario__plateforme » figure
   dans « cles ». Une campagne restée à l'ancien format ne permet donc plus
   aucun passage.

   Ce script recalcule, campagne par campagne, l'affectation des testeurs
   de la campagne avec la règle de repartition.js (le même module que la
   page), sur le plan de tests du projet. Seules les campagnes dont au
   moins une entrée est une liste sont touchées. Les passages déjà
   consignés au nouveau format restent chez leur auteur ; les anciens
   passages (référence de la bibliothèque) restent lisibles en historique
   et ne sont pas touchés.

   À BLANC PAR DÉFAUT : la base est lue, le bilan dit ce qui serait écrit,
   rien n'est écrit.
     node migrer-affectation.mjs                          (à blanc, émulateur)
     node migrer-affectation.mjs --vrai                   (émulateur seulement)
     node migrer-affectation.mjs --production             (à blanc, PRODUCTION, lecture seule)
     node migrer-affectation.mjs --vrai --production      (PRODUCTION, sur ordre explicite)
     --projet=<id>   un seul projet

   Avant la première écriture, chaque campagne touchée est sauvegardée en
   JSON hors du dépôt : ~/Capmedia/sauvegardes/affectations/ (ou
   $SAUVEGARDES). Retour arrière : réécrire « affectation » depuis ce
   fichier.
   ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const { repartir, scenariosHumains, controler, chargeParTesteur } = await import(join(ICI, '../../agence/suivi/assets/js/repartition.js'));

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const SEUL = valeur('--projet');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

if (!SUR_EMULATEUR && !PRODUCTION) { console.error('Ni émulateur (FIRESTORE_EMULATOR_HOST) ni --production : rien n\'est lu.'); process.exit(2); }
if (PRODUCTION && SUR_EMULATEUR) { console.error('--production avec FIRESTORE_EMULATOR_HOST : contradictoire, arrêt.'); process.exit(2); }

/* Le rang des groupes, comme « Ce qui va être testé » (vues/plan-tests.js). */
const GROUPES = ['demarrage', 'socle', 'fonctionnalites', 'transverse'];
const rangGroupe = (g) => { const i = GROUPES.indexOf(g); return i < 0 ? 99 : i; };
const ordonner = (docs) => docs.filter((d) => d && d.id !== 'presentation' && d.genre !== 'presentation' && d.aspects)
  .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0));

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ projectId: PROJET_FIREBASE });
const bdd = getFirestore();

console.log(SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE}` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} !!!`);
console.log(VRAI ? 'ÉCRITURE' : 'À BLANC : rien ne sera écrit');

const conv = (v) => {
  if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(conv);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
  return v;
};

const projets = SEUL ? [await bdd.doc(`projets/${SEUL}`).get()].filter((d) => d.exists) : (await bdd.collection('projets').get()).docs;
const aEcrire = [];
let fautes = 0;
for (const p of projets) {
  const campagnes = (await p.ref.collection('campagnes').get()).docs;
  const anciennes = campagnes.filter((c) => Object.values((c.data() || {}).affectation || {}).some(Array.isArray));
  if (!anciennes.length) continue;
  const sections = ordonner((await p.ref.collection('planTests').get()).docs.map((d) => ({ id: d.id, ...d.data() })));
  const scenarios = scenariosHumains(sections);
  for (const c of anciennes) {
    const d = c.data();
    console.log(`\n${p.id} / ${c.id} · « ${d.titre || ''} » (${d.statut || '?'})`);
    if (!scenarios.length) { console.log('  LAISSÉE : le projet n\'a aucun scénario humain dans son plan.'); fautes += 1; continue; }
    const uids = [...new Set([...(d.testeurs || []), ...Object.keys(d.affectation || {})])];
    const fiches = await Promise.all(uids.map((u) => bdd.doc(`testeurs/${u}`).get()));
    const gens = fiches.filter((f) => f.exists && (f.data() || {}).actif !== false).map((f) => {
      const t = f.data(); const siennes = Array.isArray(t.plateformes) ? t.plateformes : [];
      return { id: f.id, mobile: t.mobile || '', web: !siennes.length || siennes.includes('web') };
    });
    const garder = {};
    (await c.ref.collection('passages').get()).docs.forEach((x) => {
      const v = x.data();
      if (v.testeur && v.scenario && v.plateforme && x.id === `${v.testeur}__${v.scenario}__${v.plateforme}`) (garder[v.testeur] = garder[v.testeur] || []).push(`${v.scenario}__${v.plateforme}`);
    });
    const r = repartir(scenarios, gens, { garder });
    const ctl = controler(r.affectation, scenarios);
    if (ctl.enTrop.length) { console.log(`  REFUSÉE : ${ctl.enTrop.length} clé(s) en trop au contrôle.`); fautes += 1; continue; }
    const absents = uids.filter((u) => !gens.some((g) => g.id === u));
    console.log(`  ${uids.length} testeur(s) ; ${r.attendus} clés ; ${Object.values(r.affectation).reduce((n, a) => n + a.cles.length, 0)} affectations`);
    chargeParTesteur(r.affectation, scenarios).forEach((x) => console.log(`    ${x.id}  ${x.telephone.padEnd(8)} total ${x.total}  téléphone ${x.telephoneN}  web ${x.webN}  vague 1 ${x.vague1}  vague 2 ${x.vague2}`));
    if (absents.length) console.log(`  testeur(s) retiré(s) ou disparu(s), sans affectation : ${absents.join(', ')}`);
    if (r.ecartes.length) console.log(`  sans téléphone dans la fiche, écarté(s) : ${r.ecartes.join(', ')}`);
    if (r.manques.length) console.log(`  MANQUES : ${r.manques.length} clé(s) sans tous leurs testeurs (ex. ${r.manques.slice(0, 3).map((m) => `${m.cle} ${m.obtenu}/${m.voulu}`).join(', ')})`);
    aEcrire.push({ ref: c.ref, chemin: c.ref.path, avant: conv(d), affectation: r.affectation, testeurs: Object.keys(r.affectation) });
  }
}

console.log(`\n${aEcrire.length} campagne(s) à passer au nouveau format${fautes ? `, ${fautes} laissée(s) ou refusée(s)` : ''}.`);
if (!VRAI || !aEcrire.length) process.exit(fautes ? 1 : 0);

const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'affectations');
mkdirSync(lieu, { recursive: true });
const fichier = join(lieu, `affectations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(fichier, JSON.stringify({ base: PROJET_FIREBASE, le: new Date().toISOString(), campagnes: aEcrire.map((x) => ({ chemin: x.chemin, donnees: x.avant })) }, null, 2));
console.log(`Sauvegarde : ${fichier}`);
for (const x of aEcrire) {
  await x.ref.update({ affectation: x.affectation, testeurs: x.testeurs, maj: FieldValue.serverTimestamp() });
  console.log(`  écrite : ${x.chemin}`);
}
process.exit(fautes ? 1 : 0);
