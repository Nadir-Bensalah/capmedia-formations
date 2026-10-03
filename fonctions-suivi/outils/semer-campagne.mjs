/* ==========================================================================
   CAPMEDIA CLIENT HUB · une campagne en cours, pour le banc

   Ce qu'attendent qa-testeur et les suites de l'espace testeur : la
   bibliothèque importée sur « atelier », et depuis le 03/10/2026 son plan
   de tests (planTests), six testeurs au vivier, une campagne « c-oct »
   EN COURS sur le plan, et une affectation au modèle commun
   ({ telephone, web, cles, vague }) calculée par la vraie règle
   (repartition.js). Le plan reprend la bibliothèque, une section par
   bloc et un scénario par référence (même identifiant) : un scénario
   doublé (socle, transversal) devient « humain » seul, passé par deux
   testeurs ; les autres « les-deux », passés par un seul.

   ÉMULATEUR SEULEMENT. Le script refuse de tourner sans
   FIRESTORE_EMULATOR_HOST : le 18/09/2026, un script lancé sans garde a
   écrit de vraies données.

     node fonctions-suivi/outils/semer-campagne.mjs <plan.md>
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { repartir, scenariosHumains } from '../../agence/suivi/assets/js/repartition.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusé : FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST sont requis. Ce script ne touche que les émulateurs.');
  process.exit(2);
}
const plan = process.argv[2];
if (!plan) { console.error('Usage : node semer-campagne.mjs <plan.md>'); process.exit(2); }

execFileSync('node', [new URL('./importer-scenarios.mjs', import.meta.url).pathname, 'atelier', plan, '--vrai'], { stdio: 'ignore', env: process.env });

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d', storageBucket: `${process.env.GCLOUD_PROJECT || 'capmedia-1f90d'}.firebasestorage.app` });
const bdd = getFirestore();
const auth = getAuth();

/* Les écrans de l'application, tels que l'équipe les dépose depuis le
   Cockpit : trois dessins d'une application inventée, dans le dossier de la
   campagne. Sans émulateur Storage, la campagne n'en a pas, et l'accueil
   montre l'initiale à la place. */
const visuels = [];
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  const seau = getStorage().bucket();
  for (const nom of ['semaine.svg', 'dates.svg', 'courses.svg']) {
    const source = new URL(`./donnees-locales/visuels-banc/${nom}`, import.meta.url).pathname;
    const chemin = `projets/atelier/campagnes/c-oct/visuels/${nom}`;
    await seau.upload(source, { destination: chemin, contentType: 'image/svg+xml' });
    visuels.push({ nom, chemin, taille: statSync(source).size, type: 'image/svg+xml' });
  }
}

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
  /* La fiche est validée d'avance : les suites entrent directement dans la
     campagne. Celle de la fiche (qa-fiche-testeur) la remet à blanc. */
  await bdd.doc(`testeurs/${u.uid}`).set({
    prenom, nom: `${prenom}ov`, email, plateformes: [mobile, 'web'], mobile, projets: ['atelier'], actif: true,
    profil: { sexe: mobile === 'ios' ? 'homme' : 'femme', age: '25-34', fonction: 'Testeur', expertise: 'Commerce', aisance: 'À l\'aise', langue: 'fr' },
    appareils: [], ficheValidee: new Date(Date.now() - 86400000),
  });
  uids.push(u.uid);
}

const biblio = (await bdd.collection('projets/atelier/scenarios').get()).docs
  .map((d) => ({ ref: d.id, ...d.data() })).filter((s) => s.actif !== false)
  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

/* Le plan, tiré de la bibliothèque : une section par bloc, dans l'ordre. */
const DOUBLES = ['socle', 'transversal'];
const sections = [];
biblio.forEach((s) => {
  let sec = sections.find((x) => x.bloc === s.bloc);
  if (!sec) {
    sec = { bloc: s.bloc, id: `banc-${s.bloc || 'divers'}`, groupe: 'fonctionnalites', ordre: sections.length + 1,
      titre: s.blocLibelle || s.bloc || 'Divers', resume: 'Section du banc, tirée de la bibliothèque.',
      plateformes: ['ios', 'android', 'web'], aspects: { fonctionnel: [], technique: [], ux: [], securite: [] } };
    sections.push(sec);
  }
  sec.aspects.fonctionnel.push({
    id: s.ref, titre: s.titre || s.ref, etapes: s.options || '', attendu: s.attendu || '',
    plateformes: (s.plateformes && s.plateformes.length) ? s.plateformes : ['ios', 'android', 'web'],
    type: 'normal', priorite: s.niveau === 'socle' ? 'haute' : 'moyenne', refs: [s.ref],
    qui: DOUBLES.includes(s.niveau) ? 'humain' : 'les-deux', parcours: [],
  });
});
const anciens = await bdd.collection('projets/atelier/planTests').get();
for (const d of anciens.docs) await d.ref.delete();
for (const { bloc, ...sec } of sections) await bdd.doc(`projets/atelier/planTests/${sec.id}`).set({ ...sec, maj: FieldValue.serverTimestamp() });
await bdd.doc('projets/atelier/planTests/presentation').set({ genre: 'presentation', intro: 'Le plan du banc, tiré de la bibliothèque.', plateformes: ['ios', 'android', 'web'], aspects: [], maj: FieldValue.serverTimestamp() });

/* La répartition, par la règle de la page. */
const humains = scenariosHumains(sections);
const refs = humains.map((s) => s.id);
const { affectation, manques } = repartir(humains, GENS.map(([, , mobile], i) => ({ id: uids[i], mobile, web: true })));
if (manques.length) { console.error(`Répartition incomplète : ${manques.length} passage(s) sans testeur.`); process.exit(1); }

await bdd.doc('projets/atelier/campagnes/c-oct').set({
  titre: 'Campagne du banc', statut: 'en-cours', testeurs: uids, scenarios: refs, plan: true, affectation,
  builds: { ios: '24', android: '31', web: 'qa-1.2.0' },
  /* Ce que le testeur lit dans « L'application » : de quoi découvrir, et
     de quoi installer. Des liens d'exemple, jamais de vrais. */
  application: 'Atelier',
  accroche: 'L\'organisation de la famille, dans une seule application.',
  atouts: ['Les tâches de la semaine, réparties entre tous', 'Les dates importantes, avec un rappel la veille', 'La liste de courses, partagée en direct'],
  visuels,
  presentation: "Atelier aide une famille à s'organiser : les tâches de la semaine, les dates importantes, les courses.\n\nCette version ajoute les rappels et la validation des tâches de la veille.",
  consignes: "Déroulez vos scénarios dans l'ordre. Signalez tout ce qui vous surprend, même un détail.",
  installation: { ios: 'https://testflight.apple.com/join/EXEMPLE', android: 'https://play.google.com/apps/testing/app.exemple', web: 'https://atelier.exemple.test' },
  fin: new Date(Date.now() + 10 * 24 * 3600 * 1000),
  cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
});
console.log(`${sections.length} sections, ${refs.length} scénarios, ${uids.length} testeurs, Karim a ${affectation[uids[0]].cles.length} passages, ${visuels.length} écran(s) déposé(s).`);
