/* ==========================================================================
   CAPMEDIA CLIENT HUB · les adresses du banc, en un seul endroit

   Deux bancs peuvent tourner en même temps sur la machine. Le banc 1 garde
   les ports historiques (Firestore 8080, Auth 9099, Functions 5001,
   Storage 9199, Pub/Sub 8085, hub 4400, site 8787). Le banc N décale tous
   ses ports de (N - 1) x 10000 : le banc 2 parle à 18080, 19099, 15001,
   19199, 18085, 14400 et sert le site sur 18787.

   Réglages (variables d'environnement) :
     BANC_NUMERO                    1 (défaut) ou 2 ;
     FIRESTORE_EMULATOR_HOST,
     FIREBASE_AUTH_EMULATOR_HOST,
     FIREBASE_STORAGE_EMULATOR_HOST,
     FIREBASE_EMULATOR_HUB          l'emportent sur le calcul ;
     BANC_FONCTIONS_HOTE            l'hôte des fonctions (127.0.0.1:5001) ;
     BANC_PORT_SITE, BANC_SITE      le port et l'adresse du site local.

   La page, elle, lit le numéro du banc dans « ?emul=2 » ou dans
   localStorage « suivi:emul » (posé par la garde du banc) : voir noyau.js.
   ========================================================================== */

const brut = Number(process.env.BANC_NUMERO || 1);
const numero = Number.isInteger(brut) && brut >= 1 && brut <= 5 ? brut : 1;
const decalage = (numero - 1) * 10000;
const hote = (variable, port) => process.env[variable] || `127.0.0.1:${port + decalage}`;

const firestoreHote = hote('FIRESTORE_EMULATOR_HOST', 8080);
const authHote = hote('FIREBASE_AUTH_EMULATOR_HOST', 9099);
const stockageHote = hote('FIREBASE_STORAGE_EMULATOR_HOST', 9199);
const fonctionsHote = hote('BANC_FONCTIONS_HOTE', 5001);
const hubHote = hote('FIREBASE_EMULATOR_HUB', 4400);
const portSite = Number(process.env.BANC_PORT_SITE) || 8787 + decalage;

module.exports = {
  numero,
  decalage,
  firestoreHote,
  authHote,
  stockageHote,
  fonctionsHote,
  hubHote,
  portSite,
  /* Les adresses complètes, sans barre finale. */
  firestore: `http://${firestoreHote}`,
  auth: `http://${authHote}`,
  stockage: `http://${stockageHote}`,
  fonctions: `http://${fonctionsHote}`,
  hub: `http://${hubHote}`,
  site: process.env.BANC_SITE || `http://127.0.0.1:${portSite}`,
};
