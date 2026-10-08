/* ==========================================================================
   CAPMEDIA TEST · l'avis anonyme d'un testeur

   Le questionnaire d'appréciation ne s'écrit plus depuis le navigateur dans
   l'appréciation du testeur (appreciations/{uid}) : l'équipe y lisait son
   prénom, et le client un « Testeur N » reconnaissable par son profil. Le
   testeur envoie ses réponses ici ; le serveur vérifie qui il est, les
   valide avec la même liste que l'écran (questionnaire-avis.mjs, copie
   conforme de agence/suivi/assets/js/questionnaire-avis.js), puis, dans une
   seule transaction :

     - range les réponses dans
       projets/{p}/campagnes/{c}/avisAnonymes/{moment}/reponses/{id au hasard},
       sans identifiant de testeur, sans date, sans appareil ;
     - compte une réponse de plus dans avisAnonymes/{moment}.recus (les
       règles n'ouvrent les réponses qu'à partir de trois) ;
     - pose « avisRendus.{moment} : true » sur l'appréciation : l'équipe
       sait qu'il a répondu, et « J'ai terminé » s'ouvre (les règles le
       vérifient).

   Une fois envoyé, un avis ne se relit pas et ne se modifie pas : plus
   rien ne le relie à son auteur. Une seconde réponse au même moment est
   refusée (409).

   Limite connue : la console Firebase garde l'heure de création de chaque
   document ; un administrateur qui la rapprocherait de l'heure de mise à
   jour de l'appréciation pourrait relier les deux. Aucun écran ne le
   permet, et aucune règle n'ouvre ces métadonnées.

     POST /hubAvisTesteur   { projet, campagne, moment: 'avant'|'apres', reponses }
     Authorization: Bearer <jeton>
   ========================================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const acces = require('./acces');
const { audit, enMillis } = require('./commun');

const bdd = getFirestore();
const REGION = 'europe-west1';
const ID_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

const texte = (res, code, message) => res.status(code).type('text/plain; charset=utf-8').set('X-Content-Type-Options', 'nosniff').send(message);

/* La source du questionnaire est un module ES : chargé une fois. */
let questionnaire = null;
const chargerQuestionnaire = async () => {
  if (!questionnaire) questionnaire = await import('./questionnaire-avis.mjs');
  return questionnaire;
};

/**
 * Le cœur, sans HTTP : vérifie et écrit. Rend { code, message } en cas de
 * refus, { ok: true } sinon. Exposé pour l'épreuve.
 */
async function rendreAvis({ uid, projet, campagne, moment, reponses }) {
  const q = await chargerQuestionnaire();
  if (!ID_VALIDE.test(String(projet || '')) || !ID_VALIDE.test(String(campagne || ''))) return { code: 400, message: 'Campagne inconnue.' };
  if (!q.MOMENTS_ENVOYES.includes(moment)) return { code: 400, message: 'Moment inconnu.' };
  const v = q.validerAvis(moment, reponses);
  if (v.erreur) return { code: 400, message: v.erreur };

  /* Un testeur actif du vivier, affecté à cette campagne en cours, dont
     l'accès court encore : les mêmes conditions que les règles posent à
     tout ce qu'il écrit. */
  const fiche = await bdd.doc(`testeurs/${uid}`).get();
  if (!fiche.exists || fiche.data().actif === false) return { code: 403, message: 'Votre accès de testeur est fermé.' };
  const refCampagne = bdd.doc(`projets/${projet}/campagnes/${campagne}`);
  const refAppreciation = refCampagne.collection('appreciations').doc(uid);
  const refCompteur = refCampagne.collection('avisAnonymes').doc(moment);
  const refReponse = refCompteur.collection('reponses').doc();

  return bdd.runTransaction(async (t) => {
    const [c, a] = await Promise.all([t.get(refCampagne), t.get(refAppreciation)]);
    if (!c.exists) return { code: 404, message: 'Campagne inconnue.' };
    const cd = c.data();
    if (!Array.isArray(cd.testeurs) || !cd.testeurs.includes(uid)) return { code: 403, message: 'Cette campagne ne vous est pas confiée.' };
    if (cd.statut !== 'en-cours') return { code: 403, message: 'La campagne n\'est pas en cours.' };
    const fin = enMillis((cd.fins || {})[uid]);
    if (fin && fin <= Date.now()) return { code: 403, message: 'Votre accès à cette campagne est terminé.' };
    const ad = a.exists ? a.data() : {};
    if ((ad.avisRendus || {})[moment] === true) return { code: 409, message: 'Votre avis est déjà envoyé : il ne se modifie plus.' };

    t.set(refReponse, { moment, reponses: v.reponses });
    t.set(refCompteur, { recus: FieldValue.increment(1) }, { merge: true });
    /* « testeur » : le nom du document le dit déjà ; pas de date, pour ne
       rien offrir à rapprocher. */
    t.set(refAppreciation, { avisRendus: { [moment]: true }, testeur: uid }, { merge: true });
    return { ok: true };
  });
}

exports._rendreAvis = rendreAvis;

exports.hubAvisTesteur = onRequest({ region: REGION, cors: true, secrets: [], invoker: 'public' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return texte(res, 405, 'Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return texte(res, err.code || 401, err.message || 'Connexion requise.'); }
  /* Une personne de l'équipe n'a pas d'avis de testeur à donner. */
  if (qui.fiche) return texte(res, 403, 'Réservé aux testeurs.');
  const { projet, campagne, moment, reponses } = req.body || {};
  try {
    const r = await rendreAvis({ uid: qui.uid, projet, campagne, moment, reponses });
    if (!r.ok) return texte(res, r.code, r.message);
    /* L'audit dit qu'un avis est arrivé, pas de qui : sinon il deviendrait
       la clé qui relie la réponse à son auteur. */
    await audit('test.avis', { projet: String(projet), campagne: String(campagne), moment });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Avis anonyme non enregistré', err);
    return texte(res, 500, 'Votre avis n\'a pas pu être enregistré. Réessayez.');
  }
});
