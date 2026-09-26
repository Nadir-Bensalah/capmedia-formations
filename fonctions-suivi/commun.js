/* ==========================================================================
   CAPMEDIA CLIENT HUB · les petits outils partagés du serveur

   Ce que acces.js, invitations.js et communication.js ont en commun. Les
   anciens modules (suivi.js, hub.js) gardent leurs propres copies : elles
   sont identiques, et les déplacer n'apporterait que du risque.
   ========================================================================== */

const crypto = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();
const bdd = getFirestore();

const REGION = 'europe-west1';

const normaliserEmail = (valeur) => String(valeur || '').trim().toLowerCase();
const emailPlausible = (valeur) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliserEmail(valeur));

/* L'identifiant d'une personne sous un projet : l'adresse ne peut pas
   servir de clé (Firestore refuse certains de ses caractères), son
   empreinte si. Deux ajouts de la même adresse tombent donc sur le même
   document : un ajout rejoué ne crée pas de doublon. */
const cleEmail = (email) => crypto.createHash('sha256').update(normaliserEmail(email)).digest('hex').slice(0, 32);

/* Une marque du serveur (date, incrément, union) est un objet qu'il ne faut
   surtout pas parcourir : on l'écrirait vide. Voir hub.js. */
const marqueServeur = (v) => v instanceof Date
  || (v && typeof v === 'object'
      && (typeof v.toDate === 'function'
          || typeof v.isEqual === 'function'
          || v.constructor === undefined
          || (v.constructor && v.constructor.name && v.constructor.name !== 'Object')));

function sansIndefini(valeur) {
  if (Array.isArray(valeur)) return valeur.map(sansIndefini).filter((v) => v !== undefined);
  if (valeur && typeof valeur === 'object' && !marqueServeur(valeur)) {
    const propre = {};
    for (const [k, v] of Object.entries(valeur)) { const n = sansIndefini(v); if (n !== undefined) propre[k] = n; }
    return propre;
  }
  return valeur;
}

/** La trace d'un geste. Ne lève jamais : l'audit ne casse pas l'action. */
async function audit(action, details) {
  try {
    await bdd.collection('audit').add(sansIndefini({ action, ...details, date: FieldValue.serverTimestamp() }));
  } catch (err) { console.error('Audit non écrit', err); }
}

/** Une date Firestore, une Date ou rien, en millisecondes (0 si rien). */
const enMillis = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/*
 * Le verrou du banc d'essai, et lui seul. Sur les émulateurs, poser une
 * base de test déclenche les fonctions, et leurs événements peuvent être
 * servis bien après (la file de l'émulateur se vide à son rythme) : ils
 * écrivaient alors dans la base de l'essai suivant. Le banc pose donc un
 * verrou (_banc/semis) : pendant la pose, et pour tout événement né avant
 * sa fin, les déclencheurs ne font rien. Hors émulateur, ce code ne lit
 * rien et ne décide rien.
 */
/* L'instant d'un événement Firestore : celui de l'écriture qui l'a fait
   naître (updateTime du document), pas celui où il est servi. « time »
   seulement à défaut (un effacement). */
function instantEvenement(evenement) {
  const d = evenement && evenement.data;
  const snap = d && (d.after !== undefined ? (d.after && d.after.exists ? d.after : null) : d);
  const t = snap && (snap.updateTime || snap.createTime);
  if (t) return enMillis(t);
  return evenement && evenement.time ? new Date(evenement.time).getTime() : 0;
}

const SUR_BANC = process.env.FUNCTIONS_EMULATOR === 'true' && Boolean(process.env.FIRESTORE_EMULATOR_HOST);
async function evenementDuSemis(evenement) {
  if (!SUR_BANC) return false;
  try {
    const v = (await bdd.doc('_banc/semis').get()).data();
    if (!v) return false;
    if (v.enCours === true) return true;
    const quand = instantEvenement(evenement);
    return Boolean(quand && enMillis(v.jusqua) && quand <= enMillis(v.jusqua));
  } catch (err) { return false; }
}

/** Une erreur qui porte sa réponse HTTP : un refus n'est pas une panne. */
class Refus extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.refus = true;
  }
}

module.exports = {
  bdd, REGION, FieldValue,
  normaliserEmail, emailPlausible, cleEmail, sansIndefini, marqueServeur, audit, enMillis, Refus, evenementDuSemis, instantEvenement,
};
