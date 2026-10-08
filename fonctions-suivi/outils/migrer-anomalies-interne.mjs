/* ==========================================================================
   CAPMEDIA TEST · poser « interne » sur les anomalies existantes

   Depuis le 08/10/2026, un échec de testeur naît en anomalie interne
   (« interne: true ») que le client ne lit pas avant que l'équipe la
   confirme. Les règles n'ouvrent au client que « interne == false », et sa
   requête ne demande que celles-là : une anomalie SANS le champ lui
   devient invisible. Ce script pose donc « interne: false » sur toutes les
   anomalies qui n'ont pas le champ, pour que le client continue de lire
   exactement ce qu'il lisait (bugs des robots « À confirmer », anomalies
   de l'équipe, échecs déjà montrés).

   À lancer AVANT de déployer les règles et le site. Sans risque avec
   l'ancien code (le champ y est ignoré). Il ne touche ni « maj » ni le
   statut : aucun déclencheur ne prévient personne.

   À BLANC PAR DÉFAUT : la base est lue, le bilan dit ce qui serait écrit.
     node migrer-anomalies-interne.mjs                         (à blanc, émulateur)
     node migrer-anomalies-interne.mjs --vrai                  (émulateur seulement)
     node migrer-anomalies-interne.mjs --production            (à blanc, PRODUCTION, lecture seule)
     node migrer-anomalies-interne.mjs --vrai --production     (PRODUCTION, sur ordre explicite)
     node migrer-anomalies-interne.mjs --annuler <fichier> [--production]
                                                                (retire le champ posé)
     --projet=<id>   un seul projet

   Avant la première écriture, la liste des anomalies touchées est
   sauvegardée hors du dépôt : ~/Capmedia/sauvegardes/anomalies-interne/
   (ou $SAUVEGARDES). --annuler la relit et retire « interne » de ces
   documents seulement.
   ========================================================================== */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = arg('--annuler');
const SEUL = valeur('--projet');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

if (!SUR_EMULATEUR && !PRODUCTION) { console.error('Ni émulateur (FIRESTORE_EMULATOR_HOST) ni --production : rien n\'est lu.'); process.exit(2); }
if (PRODUCTION && SUR_EMULATEUR) { console.error('--production avec FIRESTORE_EMULATOR_HOST : contradictoire, arrêt.'); process.exit(2); }

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ projectId: PROJET_FIREBASE });
const bdd = getFirestore();

console.log(SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE}` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} !!!`);

if (ANNULER) {
  const fichier = process.argv[process.argv.indexOf('--annuler') + 1];
  if (!fichier || fichier.startsWith('--')) { console.error('--annuler <fichier> : le fichier de sauvegarde manque.'); process.exit(2); }
  const { chemins = [] } = JSON.parse(readFileSync(fichier, 'utf8'));
  console.log(`${chemins.length} anomalie(s) à remettre sans « interne ».`);
  for (const c of chemins) {
    const d = await bdd.doc(c).get();
    if (!d.exists || d.data().interne !== false) { console.log(`  laissée (absente ou changée depuis) : ${c}`); continue; }
    await bdd.doc(c).update({ interne: FieldValue.delete() });
    console.log(`  remise : ${c}`);
  }
  process.exit(0);
}

console.log(VRAI ? 'ÉCRITURE' : 'À BLANC : rien ne sera écrit');
const projets = SEUL ? [await bdd.doc(`projets/${SEUL}`).get()].filter((d) => d.exists) : (await bdd.collection('projets').get()).docs;
const aPoser = [];
let deja = 0;
for (const p of projets) {
  const anomalies = (await p.ref.collection('anomalies').get()).docs;
  const sans = anomalies.filter((a) => !('interne' in (a.data() || {})));
  deja += anomalies.length - sans.length;
  if (!sans.length) continue;
  const parOrigine = {};
  sans.forEach((a) => { const o = (a.data() || {}).origine || 'sans origine'; parOrigine[o] = (parOrigine[o] || 0) + 1; });
  console.log(`  ${p.id} : ${sans.length} à poser (${Object.entries(parOrigine).map(([o, n]) => `${o} ${n}`).join(', ')})`);
  sans.forEach((a) => aPoser.push(a.ref));
}
console.log(`\n${aPoser.length} anomalie(s) recevront « interne: false » ; ${deja} l'ont déjà.`);
if (!VRAI || !aPoser.length) process.exit(0);

const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'anomalies-interne');
mkdirSync(lieu, { recursive: true });
const fichier = join(lieu, `anomalies-interne-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(fichier, JSON.stringify({ base: PROJET_FIREBASE, le: new Date().toISOString(), chemins: aPoser.map((r) => r.path) }, null, 2));
console.log(`Sauvegarde : ${fichier}`);
for (let i = 0; i < aPoser.length; i += 400) {
  const lot = bdd.batch();
  aPoser.slice(i, i + 400).forEach((r) => lot.update(r, { interne: false }));
  await lot.commit();
}
const relus = await Promise.all(aPoser.map((r) => r.get()));
const ratees = relus.filter((d) => d.exists && d.data().interne !== false);
console.log(ratees.length ? `RELECTURE : ${ratees.length} sans le champ !` : `Relecture : ${relus.length} posée(s).`);
process.exit(ratees.length ? 1 : 0);
