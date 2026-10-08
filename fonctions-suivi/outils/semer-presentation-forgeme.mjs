/* ==========================================================================
   CAPMEDIA TEST · une présentation ForgeMe d'exemple, SUR LE BANC SEULEMENT

   Pose sur une campagne de l'émulateur ce que l'équipe remplira depuis le
   Cockpit : le logo de l'application (l'icône de ForgeMe, copiée dans
   donnees-locales/visuels-banc/forgeme-logo.png, hors du dépôt), le
   discours, et quatre fonctionnalités, chacune avec un écran pris parmi les
   captures déjà déposées sur la campagne quand il y en a.

   Refuse de tourner sans émulateurs : rien de ceci ne part en production.
   Les vrais textes de la campagne ForgeMe s'écrivent dans le Cockpit.

     FIRESTORE_EMULATOR_HOST=… FIREBASE_STORAGE_EMULATOR_HOST=… \
       node fonctions-suivi/outils/semer-presentation-forgeme.mjs [projet] [campagne]
   ========================================================================== */

import { existsSync, statSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Banc seulement : FIRESTORE_EMULATOR_HOST et FIREBASE_STORAGE_EMULATOR_HOST sont requis. Rien n\'est écrit.');
  process.exit(2);
}

const PROJET_FB = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initializeApp({ projectId: PROJET_FB, storageBucket: `${PROJET_FB}.firebasestorage.app` });
const bdd = getFirestore();
const [pid = 'atelier', cid = 'c-oct'] = process.argv.slice(2);
const ref = bdd.doc(`projets/${pid}/campagnes/${cid}`);
const c = await ref.get();
if (!c.exists) { console.error(`Campagne ${pid}/${cid} introuvable sur le banc.`); process.exit(1); }

/* Le logo : l'icône de ForgeMe, si elle a été copiée en local. */
let logo = null;
const source = new URL('./donnees-locales/visuels-banc/forgeme-logo.png', import.meta.url).pathname;
if (existsSync(source)) {
  const chemin = `projets/${pid}/campagnes/${cid}/logo/forgeme-logo.png`;
  await getStorage().bucket().upload(source, { destination: chemin, contentType: 'image/png' });
  logo = { chemin, nom: 'forgeme-logo.png', type: 'image/png', taille: statSync(source).size };
}

/* Les écrans déjà déposés sur la campagne, dans l'ordre. */
const ecrans = (c.data().visuels || []).filter((v) => v && v.chemin && /^image\//.test(v.type || ''));
const ecran = (i) => (ecrans[i] ? ecrans[i].chemin : '');

await ref.update({
  application: 'ForgeMe',
  accroche: 'Vos tâches, vos rituels et vos objectifs, au même endroit.',
  discours: "ForgeMe aide chacun à tenir ce qu'il se promet : les tâches du jour, les rituels qui reviennent, les objectifs qu'on suit dans le temps.\n\nCette campagne vérifie la nouvelle version sur iPhone, Android et le web, avant qu'elle n'arrive chez tout le monde. Votre regard de nouvel utilisateur est ce qui compte le plus.",
  fonctionnalites: [
    { titre: 'Les tâches du jour', phrase: "Ce qu'il y a à faire aujourd'hui, coché d'un geste, avec un rappel si besoin.", capture: ecran(0) },
    { titre: 'Les rituels', phrase: 'Une habitude qui revient chaque jour ou chaque semaine, et la série qui s\'allonge.', capture: ecran(1) },
    { titre: 'Les objectifs', phrase: "Un but découpé en étapes, et l'avancée qui se voit.", capture: ecran(2) },
    { titre: 'Le journal', phrase: 'Quelques lignes chaque soir, retrouvées par date.', capture: '' },
  ],
  ...(logo ? { logo } : {}),
  maj: FieldValue.serverTimestamp(),
});
console.log(`Présentation ForgeMe posée sur ${pid}/${cid} (banc) : ${logo ? 'logo, ' : 'sans logo, '}4 fonctionnalités, ${Math.min(3, ecrans.length)} écran(s).`);
process.exit(0);
