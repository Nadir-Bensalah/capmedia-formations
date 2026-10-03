/* ==========================================================================
   CAPMEDIA CLIENT HUB · le journal des connexions d'un client

   Ce que l'équipe lit dans le menu d'un interlocuteur (onglet Accès
   client) : quand il est entré, depuis quel appareil, et comment (code
   reçu par e-mail, clé d'accès, session reprise à l'ouverture du Hub).

   Une ligne par entrée, sous journalConnexions/{uid}/entrees. Le serveur
   seul écrit et lit ici : les règles ferment tout au navigateur, client
   comme équipe. L'équipe lit par la fonction suiviAdmin
   (historiqueConnexions), qui vérifie qu'elle travaille sur le projet et
   que la personne en est l'interlocutrice.

   Pas d'adresse IP : elle reste dans l'audit, elle n'a rien à faire ici.
   On garde les 200 dernières entrées par personne.
   ========================================================================== */

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const bdd = getFirestore();
const GARDEES = 200;
/* On ne nettoie pas à chaque entrée : la marge évite une requête de plus
   à chaque connexion. */
const MARGE = 20;
/* Une même session reprise deux fois de suite sur le même appareil (deux
   onglets, un rechargement sans mémoire) ne fait qu'une ligne. */
const ECART_REPRISE_MS = 5 * 60 * 1000;

const MODES = ['code', 'cle', 'reprise', 'lien'];

/**
 * L'appareil en clair, depuis l'agent du navigateur : « Mac · Safari »,
 * « iPhone · Safari », « Android · Chrome », « Windows · Edge », ou
 * « App Mac » dans l'application Capmedia. Rien de plus fin : le modèle
 * exact ne se lit pas, et ce n'est pas la question.
 */
function appareilDepuis(agent, bureau) {
  const ua = String(agent || '');
  const systeme = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows'
            : /CrOS/.test(ua) ? 'ChromeOS'
              : /Linux/.test(ua) ? 'Linux' : '';
  if (bureau === true || /Electron\//.test(ua)) return `App ${systeme === 'Windows' ? 'Windows' : (systeme || 'Mac')}`;
  const navigateur = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
          : /CriOS\/|Chrome\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) ? 'Safari' : '';
  return [systeme, navigateur].filter(Boolean).join(' · ') || 'Appareil inconnu';
}

/**
 * Note une entrée. `mode` : code, cle, reprise ou lien. Ne lève jamais :
 * un journal qui ne s'écrit pas ne doit pas empêcher d'entrer.
 * Rend true si une ligne a été écrite.
 */
async function noter(uid, { mode, agent = '', bureau = false, le = null } = {}) {
  if (!uid || !MODES.includes(mode)) return false;
  const appareil = appareilDepuis(agent, bureau);
  const parent = bdd.doc(`journalConnexions/${uid}`);
  try {
    const ecrite = await bdd.runTransaction(async (t) => {
      const d = await t.get(parent);
      const avant = d.exists ? d.data() : {};
      const dernier = avant.dernier || {};
      const quand = dernier.le && dernier.le.toMillis ? dernier.le.toMillis() : 0;
      if (mode === 'reprise' && dernier.appareil === appareil && Date.now() - quand < ECART_REPRISE_MS) return false;
      const n = Number(avant.n || 0) + 1;
      t.set(parent.collection('entrees').doc(), { le: le || FieldValue.serverTimestamp(), mode, appareil });
      t.set(parent, { n, dernier: { le: Timestamp.now(), appareil, mode } }, { merge: true });
      return n;
    });
    if (ecrite && ecrite > GARDEES + MARGE) await elaguer(uid);
    return Boolean(ecrite);
  } catch (err) {
    console.error('Journal des connexions non écrit', err);
    return false;
  }
}

/** Ne garde que les GARDEES dernières entrées. */
async function elaguer(uid) {
  const parent = bdd.doc(`journalConnexions/${uid}`);
  const vieilles = await parent.collection('entrees').orderBy('le', 'desc').offset(GARDEES).get();
  const lot = bdd.batch();
  vieilles.docs.forEach((d) => lot.delete(d.ref));
  lot.set(parent, { n: GARDEES }, { merge: true });
  await lot.commit();
}

/** Les entrées d'une personne, de la plus récente à la plus ancienne. */
async function lire(uid, limite = GARDEES) {
  if (!uid) return [];
  const q = await bdd.collection(`journalConnexions/${uid}/entrees`).orderBy('le', 'desc').limit(Math.min(GARDEES, limite)).get();
  return q.docs.map((d) => {
    const x = d.data();
    return { le: x.le && x.le.toMillis ? x.le.toMillis() : null, mode: x.mode || '', appareil: x.appareil || '' };
  });
}

module.exports = { noter, lire, elaguer, appareilDepuis, MODES, GARDEES };
