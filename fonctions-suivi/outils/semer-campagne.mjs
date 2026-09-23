/* ==========================================================================
   CAPMEDIA CLIENT HUB · une campagne en cours, pour le banc

   Ce qu'attendent qa-testeur et les suites de l'espace testeur : le plan
   de tests importé sur « atelier », six testeurs au vivier, une campagne
   « c-oct » EN COURS, et Karim avec 43 scénarios.

   ÉMULATEUR SEULEMENT. Le script refuse de tourner sans
   FIRESTORE_EMULATOR_HOST : le 18/09/2026, un script lancé sans garde a
   écrit de vraies données.

     node fonctions-suivi/outils/semer-campagne.mjs <plan.md>
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusé : FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST sont requis. Ce script ne touche que les émulateurs.');
  process.exit(2);
}
const plan = process.argv[2];
if (!plan) { console.error('Usage : node semer-campagne.mjs <plan.md>'); process.exit(2); }

execFileSync('node', [new URL('./importer-scenarios.mjs', import.meta.url).pathname, 'atelier', plan, '--vrai'], { stdio: 'ignore', env: process.env });

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
const auth = getAuth();

const GENS = [
  ['karim.testeur@essai.test', 'Karim', 'ios'],
  ['sonia.testeur@essai.test', 'Sonia', 'android'],
  ['marc.testeur@essai.test', 'Marc', 'ios'],
  ['ines.testeur@essai.test', 'Ines', 'android'],
  ['hugo.testeur@essai.test', 'Hugo', 'ios'],
  ['leila.testeur@essai.test', 'Leila', 'android'],
];
const uids = [];
for (const [email, prenom, mobile] of GENS) {
  let u;
  try { u = await auth.getUserByEmail(email); } catch (e) { u = await auth.createUser({ email, emailVerified: true, displayName: prenom }); }
  await auth.setCustomUserClaims(u.uid, { testeur: true });
  await bdd.doc(`testeurs/${u.uid}`).set({ prenom, email, plateformes: [mobile, 'web'], mobile, projets: ['atelier'], actif: true, profil: {} });
  uids.push(u.uid);
}

const refs = (await bdd.collection('projets/atelier/scenarios').get()).docs
  .map((d) => ({ ref: d.id, ...d.data() })).filter((s) => s.actif !== false)
  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((s) => s.ref);
const affectation = {};
uids.forEach((u) => { affectation[u] = []; });
affectation[uids[0]] = refs.slice(0, 43);
refs.slice(43).forEach((r, i) => { affectation[uids[1 + (i % 5)]].push(r); });

await bdd.doc('projets/atelier/campagnes/c-oct').set({
  titre: 'Campagne Octobre 2026', statut: 'en-cours', testeurs: uids, scenarios: refs, affectation,
  builds: { ios: '24' }, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
});
console.log(`${refs.length} scénarios, ${uids.length} testeurs, Karim en a ${affectation[uids[0]].length}.`);
