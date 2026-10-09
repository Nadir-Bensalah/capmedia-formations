/* ==========================================================================
   CAPMEDIA TEST · remplacer l'ancienne campagne ForgeMe par une campagne
   sur le plan de tests (Nadir, 09/10/2026)

   L'ancienne campagne (« Campagne d'octobre 2026, avant mise en ligne »)
   reprend l'ancienne bibliothèque : sans « plan », le Cockpit refuse de la
   répartir. On la remplace par EXACTEMENT ce que produirait le Cockpit
   (vues/editeurs.js, éditeur « campagne », puis ecrire.creerCampagne dans
   donnees.js) avec :
     - toutes les sections du plan cochées (scénarios humains du plan,
       campagne-plan.js scenariosHumainsDuPlan) et « plan: true » ;
     - la règle du socle, le socle proposé (repartition.js proposerSocle,
       après les retraits connus des robots et des anomalies du projet,
       dans l'ordre des cases de la feuille) et le plafond de 120 ;
     - le titre « Campagne ForgeMe, octobre 2026 », début aujourd'hui, fin
       dans quinze jours (dates de la feuille : minuit UTC), l'application
       « ForgeMe » ; les textes pour les testeurs repris de l'ancienne
       campagne quand elle en a ;
     - aucun testeur, aucune affectation, statut « preparation ».
   Créée ainsi, la campagne ne déclenche rien côté client : le serveur
   (hubCampagneEcrite, hubCampagneTesteurs) n'agit qu'au passage en cours
   ou close, ou quand des testeurs entrent.

   À BLANC PAR DÉFAUT : la base est lue, le bilan dit ce qui serait écrit.
     node recreer-campagne-forgeme.mjs                          (à blanc, émulateur)
     node recreer-campagne-forgeme.mjs --vrai                   (émulateur)
     node recreer-campagne-forgeme.mjs --production             (à blanc, PRODUCTION, lecture seule)
     node recreer-campagne-forgeme.mjs --vrai --production      (PRODUCTION, sur ordre explicite)
     node recreer-campagne-forgeme.mjs --annuler <fichier> [--production]
                     remet l'ancienne campagne telle que sauvegardée, et retire
                     la nouvelle si personne n'y a touché (toujours en
                     préparation, sans testeur)
     --projet=<id>         le projet (ForgeMe par défaut)
     --ancienne=<id>       la campagne à remplacer (sinon : la seule du projet)
     --aujourdhui=AAAA-MM-JJ  la date de début (aujourd'hui par défaut)

   Avant toute écriture, l'ancienne campagne (document et sous-collections,
   horodatages compris) est sauvegardée hors du dépôt :
   ~/Capmedia/sauvegardes/campagnes/ (ou $SAUVEGARDES). Puis la nouvelle est
   créée, relue, et l'ancienne supprimée. Enfin, le script attend la
   réaction du serveur et vérifie qu'aucune notification, activité ou
   lettre ne part vers le client.
   ========================================================================== */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const { scenariosHumainsDuPlan } = await import(join(ICI, '../../agence/suivi/assets/js/campagne-plan.js'));
const { proposerSocle, retraitsConnus, PLAFOND_DEFAUT, SECTIONS_CRITIQUES } = await import(join(ICI, '../../agence/suivi/assets/js/repartition.js'));

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = arg('--annuler');
const PID = valeur('--projet') || '78FhJrmRu0AicxGXOfcM';
const ANCIENNE = valeur('--ancienne');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

const TITRE = 'Campagne ForgeMe, octobre 2026';
const APPLICATION = 'ForgeMe';
const DUREE_JOURS = 15;
const ATTENTE_SERVEUR_MS = Number(process.env.ATTENTE_SERVEUR_MS || 30000);

if (!SUR_EMULATEUR && !PRODUCTION) { console.error('Ni émulateur (FIRESTORE_EMULATOR_HOST) ni --production : rien n\'est lu.'); process.exit(2); }
if (PRODUCTION && SUR_EMULATEUR) { console.error('--production avec FIRESTORE_EMULATOR_HOST : contradictoire, arrêt.'); process.exit(2); }

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
initializeApp({ projectId: PROJET_FIREBASE });
const bdd = getFirestore();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE}` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} !!!`);

/* --------------------------------------------------------------------------
   La sauvegarde : un horodatage s'écrit { __ts: [secondes, nanos] } pour
   revenir tel quel ; le reste est du JSON ordinaire.
   -------------------------------------------------------------------------- */
const versJson = (v) => {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') {
    if (typeof v.path === 'string' && typeof v.firestore === 'object') return { __ref: v.path };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
  }
  return v;
};
const depuisJson = (v) => {
  if (Array.isArray(v)) return v.map(depuisJson);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return new Timestamp(v.__ts[0], v.__ts[1]);
    if (typeof v.__ref === 'string' && Object.keys(v).length === 1) return bdd.doc(v.__ref);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depuisJson(x)]));
  }
  return v;
};
const lireArbre = async (ref) => {
  const d = await ref.get();
  const sous = {};
  for (const c of await ref.listCollections()) {
    sous[c.id] = [];
    for (const x of (await c.get()).docs) sous[c.id].push({ id: x.id, ...(await lireArbre(x.ref)) });
  }
  return { donnees: d.exists ? versJson(d.data()) : null, sous };
};
const ecrireArbre = async (ref, arbre) => {
  if (arbre.donnees) await ref.set(depuisJson(arbre.donnees));
  for (const [nom, docs] of Object.entries(arbre.sous || {})) for (const x of docs) await ecrireArbre(ref.collection(nom).doc(x.id), x);
};
const compterArbre = (arbre) => Object.values(arbre.sous || {}).reduce((n, l) => n + l.reduce((m, x) => m + 1 + compterArbre(x), 0), 0);
const supprimerArbre = async (ref) => {
  for (const c of await ref.listCollections()) for (const x of (await c.get()).docs) await supprimerArbre(x.ref);
  await ref.delete();
};

const campagnes = (pid) => bdd.collection(`projets/${pid}/campagnes`);

/* --------------------------------------------------------------------------
   --annuler : l'ancienne revient, la nouvelle part si personne n'y a touché.
   -------------------------------------------------------------------------- */
if (ANNULER) {
  const fichier = process.argv[process.argv.indexOf('--annuler') + 1];
  if (!fichier || fichier.startsWith('--')) { console.error('--annuler <fichier> : le fichier de sauvegarde manque.'); process.exit(2); }
  const s = JSON.parse(readFileSync(fichier, 'utf8'));
  if (s.base !== PROJET_FIREBASE || (PRODUCTION ? s.emulateur : !s.emulateur)) { console.error(`Cette sauvegarde vient de ${s.base}${s.emulateur ? ' (émulateur)' : ''} : elle ne se remet pas ici.`); process.exit(2); }
  const refA = bdd.doc(`projets/${s.projet}/campagnes/${s.ancienne.id}`);
  if ((await refA.get()).exists) console.log(`L'ancienne campagne ${s.ancienne.id} existe déjà : laissée telle quelle.`);
  else { await ecrireArbre(refA, s.ancienne); console.log(`Ancienne campagne remise : ${refA.path} (${compterArbre(s.ancienne)} document(s) dessous).`); }
  if (s.nouvelle) {
    const refN = bdd.doc(`projets/${s.projet}/campagnes/${s.nouvelle}`);
    const n = await refN.get();
    const x = n.exists ? n.data() : null;
    if (!x) console.log(`La nouvelle campagne ${s.nouvelle} n'existe plus.`);
    else if ((x.statut || 'preparation') !== 'preparation' || (x.testeurs || []).length || Object.keys(x.affectation || {}).length || (await refN.listCollections()).length) {
      console.log(`La nouvelle campagne ${s.nouvelle} a servi depuis (statut, testeurs ou passages) : laissée, à retirer à la main si besoin.`);
    } else { await refN.delete(); console.log(`Nouvelle campagne retirée : ${refN.path}`); }
  }
  process.exit(0);
}

/* --------------------------------------------------------------------------
   Lire : le projet, l'ancienne campagne, le plan, les robots, les anomalies.
   -------------------------------------------------------------------------- */
console.log(VRAI ? 'ÉCRITURE' : 'À BLANC : rien ne sera écrit');
const projet = await bdd.doc(`projets/${PID}`).get();
if (!projet.exists) { console.error(`Projet ${PID} introuvable.`); process.exit(1); }
console.log(`Projet ${PID} : ${projet.data().nom || '(sans nom)'}`);

const toutes = (await campagnes(PID).get()).docs;
const visee = ANCIENNE ? toutes.find((d) => d.id === ANCIENNE) : (toutes.length === 1 ? toutes[0] : null);
if (!visee) {
  console.error(ANCIENNE ? `Campagne ${ANCIENNE} introuvable.` : `${toutes.length} campagnes dans le projet : précisez --ancienne=<id>. ${toutes.map((d) => `${d.id} « ${d.data().titre || ''} »`).join(', ')}`);
  process.exit(1);
}
const ancienne = visee.data();
console.log(`Ancienne : ${visee.id} « ${ancienne.titre || ''} », statut ${ancienne.statut || 'preparation'}, plan ${ancienne.plan === true ? 'oui' : 'non'}, ${(ancienne.scenarios || []).length} références, ${(ancienne.testeurs || []).length} testeur(s).`);
/* Prudence : on ne remplace qu'une campagne qui n'a pas commencé. */
const refus = [];
if ((ancienne.statut || 'preparation') !== 'preparation') refus.push(`statut « ${ancienne.statut} »`);
if ((ancienne.testeurs || []).length || Object.keys(ancienne.affectation || {}).length) refus.push('des testeurs y sont attribués');
if (ancienne.titre === TITRE && ancienne.plan === true) refus.push('c\'est déjà la nouvelle campagne');
if (ancienne.logo || (ancienne.visuels || []).length) refus.push('elle a un logo ou des captures, à reprendre à la main');
const arbre = await lireArbre(visee.ref);
const dessous = compterArbre(arbre);
if (dessous) refus.push(`${dessous} document(s) dessous (${Object.keys(arbre.sous).join(', ')})`);
if (refus.length) { console.error(`Refusé : ${refus.join(' ; ')}.`); process.exit(1); }

/* Le plan, rangé comme la page des tests (vues/plan-tests.js,
   ordonnerSections : groupe, puis numéro), lu comme le magasin le lit. */
const GROUPES_PLAN = ['demarrage', 'socle', 'fonctionnalites', 'transverse'];
const rangGroupe = (g) => { const i = GROUPES_PLAN.indexOf(g); return i < 0 ? 99 : i; };
const docsPlan = (await bdd.collection(`projets/${PID}/planTests`).get()).docs.map((d) => ({ id: d.id, ...d.data(), _parent: PID }));
const sections = docsPlan
  .filter((d) => d && !(d.id === 'presentation' || d.genre === 'presentation') && d.aspects)
  .slice()
  .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
const humains = scenariosHumainsDuPlan(sections);
if (!humains.length) { console.error('Le plan de tests n\'a aucun scénario pour un humain : rien à créer.'); process.exit(1); }

/* Les retraits, comme l'éditeur : parcours et anomalies du projet. */
const parcours = (await bdd.collection(`projets/${PID}/parcours`).get()).docs.map((d) => ({ id: d.id, ...d.data(), _parent: PID }))
  .filter((x, i, l) => l.findIndex((y) => y.ref === x.ref) === i);
const anomalies = (await bdd.collection(`projets/${PID}/anomalies`).get()).docs.map((d) => ({ id: d.id, ...d.data(), _parent: PID }));
const retraits = retraitsConnus({ scenarios: humains, parcours, anomalies });
const propose = new Set(proposerSocle(humains, { retraits }));
/* Le socle s'écrit dans l'ordre des cases de la feuille : les sections
   critiques d'abord, chacune dans l'ordre du plan. */
const candidats = humains.filter((x) => x.priorite === 'haute' || propose.has(x.id));
const groupes = [];
candidats.forEach((x) => { let g = groupes.find((y) => y.cle === x.section); if (!g) { g = { cle: x.section, items: [] }; groupes.push(g); } g.items.push(x); });
const rangCritique = (k) => { const i = SECTIONS_CRITIQUES.indexOf(k); return i < 0 ? 99 : i; };
groupes.sort((a, b) => rangCritique(a.cle) - rangCritique(b.cle));
const socle = groupes.flatMap((g) => g.items).filter((x) => propose.has(x.id)).map((x) => x.id);

/* Les dates, comme un champ « date » de la feuille : new Date('AAAA-MM-JJ'),
   soit minuit UTC. */
const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aujourdhui = valeur('--aujourdhui') || jourLocal(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(aujourdhui)) { console.error('--aujourdhui=AAAA-MM-JJ'); process.exit(2); }
const debut = new Date(aujourdhui);
const fin = new Date(debut.getTime() + DUREE_JOURS * 86400000);

/* Les textes pour les testeurs : ceux de l'ancienne campagne s'il y en a. */
const texte = (k) => String(ancienne[k] || '').trim();
const passagesTelephone = humains.reduce((n, x) => n + x.plateformes.filter((p) => p !== 'web').length, 0);
const passagesWeb = humains.filter((x) => x.plateformes.includes('web')).length;

/* Le document, champ pour champ comme l'éditeur puis creerCampagne. */
const nouvelle = {
  titre: TITRE, statut: 'preparation',
  debut, fin,
  builds: { ios: ((ancienne.builds || {}).ios) || '', android: ((ancienne.builds || {}).android) || '', web: ((ancienne.builds || {}).web) || '' },
  testeurs: [], affectation: {},
  scenarios: humains.map((x) => x.id),
  regle: 'socle', socle, plafond: PLAFOND_DEFAUT,
  plan: true,
  application: texte('application') || APPLICATION,
  accroche: texte('accroche').slice(0, 140),
  presentation: texte('presentation'),
  discours: texte('discours').slice(0, 6000),
  atouts: Array.isArray(ancienne.atouts) ? ancienne.atouts.slice(0, 4) : [],
  fonctionnalites: Array.isArray(ancienne.fonctionnalites) ? ancienne.fonctionnalites.map((f) => ({ ...f, capture: '' })) : [],
  consignes: texte('consignes'),
  acces: { instructions: String(((ancienne.acces || {}).instructions) || '').trim().slice(0, 4000) },
  magasins: { ios: String(((ancienne.magasins || {}).ios) || '').trim(), android: String(((ancienne.magasins || {}).android) || '').trim() },
  installation: { ios: String(((ancienne.installation || {}).ios) || '').trim(), android: String(((ancienne.installation || {}).android) || '').trim(), web: String(((ancienne.installation || {}).web) || '').trim() },
  visuels: [],
};

console.log(`\nLe plan : ${sections.length} sections, ${humains.length} scénarios pour un humain (${passagesTelephone} passages au téléphone, ${passagesWeb} sur le web).`);
console.log(`Retraits connus : ${retraits.size} passage(s) (${[...new Set(retraits.values())].map((m) => `${m} ${[...retraits.values()].filter((x) => x === m).length}`).join(', ') || 'aucun'}).`);
console.log(`Socle proposé : ${socle.length} scénario(s) : ${socle.join(', ')}`);
console.log(`Plafond : ${PLAFOND_DEFAUT}. Du ${jourLocal(debut)} au ${fin.toISOString().slice(0, 10)}. Application « ${nouvelle.application} ».`);
console.log(`Textes repris de l'ancienne : ${['application', 'accroche', 'presentation', 'discours', 'consignes'].filter((k) => texte(k)).concat((ancienne.atouts || []).length ? ['atouts'] : [], (ancienne.fonctionnalites || []).length ? ['fonctionnalites'] : []).join(', ') || 'aucun (elle n\'en a pas)'}.`);
console.log(`Nouvelle campagne : « ${TITRE} », préparation, aucun testeur.`);
if (!VRAI) { console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour remplacer.'); process.exit(0); }

/* --------------------------------------------------------------------------
   Écrire : sauvegarde, création, relecture, suppression, vérification.
   -------------------------------------------------------------------------- */
const depart = Timestamp.now();
const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'campagnes');
mkdirSync(lieu, { recursive: true });
const fichier = join(lieu, `campagne-${PID}-${visee.id}-${new Date().toISOString().replace(/[:.]/g, '-')}${SUR_EMULATEUR ? '-emulateur' : ''}.json`);
const sauvegarde = { base: PROJET_FIREBASE, emulateur: SUR_EMULATEUR, le: new Date().toISOString(), projet: PID, ancienne: { id: visee.id, ...arbre }, nouvelle: null };
writeFileSync(fichier, JSON.stringify(sauvegarde, null, 2));
const relue = JSON.parse(readFileSync(fichier, 'utf8'));
if (JSON.stringify(relue.ancienne.donnees) !== JSON.stringify(arbre.donnees)) { console.error('La sauvegarde relue ne correspond pas : arrêt, rien n\'est écrit.'); process.exit(1); }
console.log(`\nSauvegarde : ${fichier}`);

const ref = await campagnes(PID).add({ ...nouvelle, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
sauvegarde.nouvelle = ref.id;
writeFileSync(fichier, JSON.stringify(sauvegarde, null, 2));
console.log(`Créée : ${ref.path}`);

const lue = (await ref.get()).data() || {};
const ecarts = [];
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (lue.titre !== TITRE || lue.statut !== 'preparation' || lue.plan !== true || lue.regle !== 'socle') ecarts.push('titre, statut, plan ou règle');
if (!memes(lue.scenarios, nouvelle.scenarios)) ecarts.push('scénarios');
if (!memes(lue.socle, socle) || lue.plafond !== PLAFOND_DEFAUT) ecarts.push('socle ou plafond');
if ((lue.testeurs || []).length || Object.keys(lue.affectation || {}).length) ecarts.push('testeurs');
if (!lue.debut || lue.debut.toMillis() !== debut.getTime() || !lue.fin || lue.fin.toMillis() !== fin.getTime()) ecarts.push('dates');
if (lue.application !== nouvelle.application) ecarts.push('application');
if (ecarts.length) { console.error(`RELECTURE : écart sur ${ecarts.join(', ')}. L'ancienne campagne est gardée.`); process.exit(1); }
console.log(`Relue : ${lue.scenarios.length} scénarios, socle ${lue.socle.length}, plafond ${lue.plafond}, plan, règle du socle.`);

await supprimerArbre(visee.ref);
if ((await visee.ref.get()).exists) { console.error('L\'ancienne campagne est toujours là !'); process.exit(1); }
console.log(`Supprimée : ${visee.ref.path}`);

/* La réaction du serveur : rien ne doit partir vers le client. */
console.log(`\nAttente de la réaction du serveur (${Math.round(ATTENTE_SERVEUR_MS / 1000)} s)…`);
await pause(ATTENTE_SERVEUR_MS);
const membres = Array.isArray(projet.data().membres) ? projet.data().membres : [];
const cloches = [];
for (const uid of membres) {
  const q = await bdd.collection(`boites/${uid}/notifications`).where('date', '>=', depart).get();
  q.docs.forEach((d) => cloches.push(`${uid}: ${d.data().titre || ''}`));
}
const activites = (await bdd.collection('activite').where('projet', '==', PID).get()).docs
  .map((d) => d.data()).filter((x) => x.date && x.date.toMillis() >= depart.toMillis());
const lettres = (await bdd.collection('envois').where('cree', '>=', depart).get()).docs
  .map((d) => d.data()).filter((x) => x.projet === PID);
const validations = (await bdd.collection('validations').where('projet', '==', PID).get()).docs
  .map((d) => d.data()).filter((x) => x.cree && x.cree.toMillis() >= depart.toMillis());
console.log(`Notifications aux ${membres.length} membre(s) client : ${cloches.length}${cloches.length ? ` (${cloches.join(' | ')})` : ''}`);
console.log(`Activités du projet : ${activites.length}${activites.length ? ` (${activites.map((a) => `${a.visibilite}: ${a.texte}`).join(' | ')})` : ''}`);
console.log(`Lettres du projet : ${lettres.length}${lettres.length ? ` (${lettres.map((l) => l.modele).join(', ')})` : ''}`);
console.log(`Validations nouvelles : ${validations.length}`);
const versClient = cloches.length + activites.filter((a) => a.visibilite !== 'interne').length + lettres.length + validations.length;
console.log(versClient ? `\nATTENTION : ${versClient} trace(s) vers le client.` : '\nAucune notification, activité, lettre ni validation vers le client.');
console.log(`\nAnnuler : node outils/recreer-campagne-forgeme.mjs --annuler ${fichier}${PRODUCTION ? ' --production' : ''}`);
process.exit(versClient ? 1 : 0);
