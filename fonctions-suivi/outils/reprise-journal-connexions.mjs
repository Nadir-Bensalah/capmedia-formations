/* ==========================================================================
   CAPMEDIA CLIENT HUB · reprendre le passé des connexions

   Le journal des connexions (journal-connexions.js) commence le jour de sa
   mise en ligne. Les connexions d'avant sont dans l'audit : chaque session
   ouverte y a laissé « connexion.ouverte » (uid, mode, date, espace). On
   les recopie, pour les clients seulement (espace « hub » ou « attente »),
   sans l'adresse IP, avec un appareil inconnu : l'audit ne le notait pas.

   Une ligne d'audit donne une entrée dont l'identifiant est celui de la
   ligne : relancer l'outil ne crée pas de doublon. On garde les 200
   dernières par personne, comme le serveur.

   En passant, la présence : un client qui n'a pas encore de document de
   présence sur un projet dont il est membre en reçoit un, daté de sa
   dernière connexion, « pas en ligne ». Sinon le Cockpit dirait
   « Dernière visite inconnue » jusqu'à sa prochaine visite. Un document
   déjà là n'est jamais touché.

   Sans « --vrai », rien n'est écrit : le compte sort à l'écran.

     node fonctions-suivi/outils/reprise-journal-connexions.mjs           (à blanc)
     node fonctions-suivi/outils/reprise-journal-connexions.mjs --vrai    (pour de vrai)

   Sur les émulateurs, poser FIRESTORE_EMULATOR_HOST ; sans lui, l'outil
   parle à la PRODUCTION, le dit, et refuse d'écrire sans « --prod » en plus.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const VRAI = process.argv.includes('--vrai');
const PROD_ASSUMEE = process.argv.includes('--prod');
const EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const GARDEES = 200;
const MODES = { code: 'code', cle: 'cle' };

if (!EMULATEUR) {
  console.log('ATTENTION : pas de FIRESTORE_EMULATOR_HOST, cet outil lit la PRODUCTION (capmedia-1f90d).');
  if (VRAI && !PROD_ASSUMEE) { console.log('Écriture refusée : ajoutez « --prod » si c\'est bien voulu.'); process.exit(2); }
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();

const instant = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : null);

const lignes = await bdd.collection('audit').where('action', '==', 'connexion.ouverte').get();
const parUid = new Map();
let ignorees = 0;
for (const d of lignes.docs) {
  const a = d.data();
  const quand = instant(a.date);
  if (!a.uid || !quand || a.equipe === true || !['hub', 'attente'].includes(a.espace)) { ignorees += 1; continue; }
  if (!parUid.has(a.uid)) parUid.set(a.uid, []);
  parUid.get(a.uid).push({ id: d.id, le: quand, mode: MODES[a.mode] || 'code' });
}

console.log(`${lignes.size} connexion(s) dans l'audit, ${ignorees} hors clients ou sans date, ${parUid.size} client(s).`);

let entrees = 0; let presences = 0;
for (const [uid, liste] of parUid) {
  liste.sort((x, y) => y.le - x.le);
  const gardees = liste.slice(0, GARDEES);
  const parent = bdd.doc(`journalConnexions/${uid}`);
  const deja = await parent.collection('entrees').get();
  const n = Math.min(GARDEES, deja.size + gardees.filter((e) => !deja.docs.some((x) => x.id === e.id)).length);
  entrees += gardees.length;
  if (VRAI) {
    for (let i = 0; i < gardees.length; i += 400) {
      const lot = bdd.batch();
      gardees.slice(i, i + 400).forEach((e) => lot.set(parent.collection('entrees').doc(e.id), { le: Timestamp.fromDate(e.le), mode: e.mode, appareil: 'Appareil inconnu', reprise: true }));
      await lot.commit();
    }
    await parent.set({ n }, { merge: true });
  }

  /* La présence, sur les projets dont il est membre, si elle manque. */
  const projets = await bdd.collection('projets').where('membres', 'array-contains', uid).get();
  for (const p of projets.docs) {
    const ref = bdd.doc(`projets/${p.id}/presencesClient/${uid}`);
    if ((await ref.get()).exists) continue;
    presences += 1;
    if (VRAI) await ref.set({ vu: Timestamp.fromDate(gardees[0].le), enLigne: false });
  }
}

console.log(`${entrees} entrée(s) de journal, ${presences} présence(s) à poser. ${VRAI ? 'Écrit.' : 'À blanc : rien d\'écrit (ajoutez --vrai).'}`);
process.exit(0);
