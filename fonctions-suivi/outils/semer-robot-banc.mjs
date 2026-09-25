/* ==========================================================================
   CAPMEDIA CLIENT HUB · un passage de robot, sur le banc

   La page des tests fait remonter ce qui ne va pas : un parcours ROUGE, un
   parcours INSTABLE (vert au deuxième essai). Ces états ne s'écrivent pas à
   la main : ils arrivent par la porte des robots, comme en production. Ce
   semis crée donc un jeton de robot sur le projet (par la console), puis
   rend un passage fictif par suiviRobot : R-04 rouge, C-02 vert au second
   essai. Il pose enfin la note que l'équipe écrirait sur l'instable.

   Émulateurs seulement (sinon il s'arrête), après semer-parcours.mjs.
     node fonctions-suivi/outils/semer-robot-banc.mjs <projet>
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateur requis : ce semis ne touche jamais la production.'); process.exit(2); }
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const projet = process.argv[2];
if (!projet) { console.error('Usage : node semer-robot-banc.mjs <projet>'); process.exit(2); }
const FONCTIONS = `http://127.0.0.1:5001/${PROJET}/europe-west1`;
const CLE = process.env.ADMIN_CLE_ESSAI || 'cle-essai-locale';

const appeler = async (url, corps, entetes = {}) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${url} : ${r.status} ${texte.slice(0, 160)}`);
  try { return JSON.parse(texte); } catch { return {}; }
};

initializeApp({ projectId: PROJET });
const bdd = getFirestore();
for (const ref of ['R-04', 'C-02']) {
  if (!(await bdd.doc(`projets/${projet}/parcours/${ref}`).get()).exists) { console.error(`Le parcours ${ref} manque : lancez semer-parcours.mjs ${projet} --vrai avant.`); process.exit(2); }
}

const { jeton } = await appeler(`${FONCTIONS}/suiviAdmin`, { cle: CLE, action: 'creerJetonRobot', projet, nom: 'Robot du banc' });
const robot = { Authorization: `Bearer ${jeton}` };
const execution = `banc-${Date.now()}`;
await appeler(`${FONCTIONS}/suiviRobot`, { evenement: 'debut', execution, outil: 'maestro', plateforme: 'android', branche: 'banc', commit: 'banc', parcours: ['R-04', 'C-02'] }, robot);
await appeler(`${FONCTIONS}/suiviRobot`, { evenement: 'resultats', execution, resultats: [
  { ref: 'R-04', resultat: 'rouge', duree: 12.4, essais: 1, message: 'Échec fictif du banc' },
  { ref: 'C-02', resultat: 'vert', duree: 30.1, essais: 2, message: '' },
] }, robot);
await appeler(`${FONCTIONS}/suiviRobot`, { evenement: 'fin', execution }, robot);
await bdd.doc(`projets/${projet}/parcours/C-02`).update({ note: 'Tombe une fois sur trois sur le banc : à stabiliser avant de s y fier.' });

const etats = await Promise.all(['R-04', 'C-02'].map(async (r) => `${r} ${(await bdd.doc(`projets/${projet}/parcours/${r}`).get()).data().etat}`));
console.log(`Passage de robot rendu sur ${projet} : ${etats.join(', ')}`);
process.exit(0);
