/* ==========================================================================
   CAPMEDIA TEST · la campagne commence, chaque testeur est prévenu

   Jusqu'ici, un testeur ne recevait que l'invitation, à son inscription au
   vivier, parfois des semaines avant, et rien quand sa campagne s'ouvrait.
   Ici, quand une campagne passe « en cours » (ou qu'on y ajoute un testeur
   alors qu'elle l'est déjà), chacun de ses testeurs reçoit :
     - la lettre « Votre campagne commence » (campagne-testeur, marque
       Capmedia Test) : l'application, le nombre de SES scénarios, la fin
       prévue, le lien de son espace ;
     - une notification dans sa cloche ;
     - un push sur ses appareils abonnés (push.js).

   Une seule fois par testeur et par campagne, même si la campagne est
   rouverte ou si l'événement est rejoué : la marque
   projets/{p}/campagnes/{c}/lettresTesteurs/{uid}, créée avant d'écrire
   (create échoue si elle existe). Un testeur retiré (actif false) ou sans
   adresse ne reçoit rien. Le banc qui sème ne déclenche rien.
   ========================================================================== */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { bdd, REGION, FieldValue, evenementDuSemis } = require('./commun');
const communication = require('./communication');
const courriels = require('./courriels');
const push = require('./push');

/** Le nombre de scénarios confiés à ce testeur, quel que soit le modèle de l'affectation. */
function nombreDeScenarios(affectation, uid) {
  const a = (affectation || {})[uid];
  if (Array.isArray(a)) return a.length;
  if (a && Array.isArray(a.cles)) return a.cles.length;
  return 0;
}

/** Les testeurs à prévenir : ceux qui entrent dans une campagne en cours. */
function aPrevenir(avant, apres) {
  if (!apres || apres.statut !== 'en-cours') return [];
  const deja = avant && avant.statut === 'en-cours' ? new Set(avant.testeurs || []) : new Set();
  return [...new Set((apres.testeurs || []).filter((u) => typeof u === 'string' && u && !deja.has(u)))];
}

async function prevenir({ projetId, campagneId, campagne, uid }) {
  const t = await bdd.doc(`testeurs/${uid}`).get();
  const fiche = t.exists ? t.data() : null;
  if (!fiche || fiche.actif === false) return false;
  try {
    await bdd.doc(`projets/${projetId}/campagnes/${campagneId}/lettresTesteurs/${uid}`).create({ cree: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) return false;
    throw err;
  }
  let application = String(campagne.application || '').trim();
  if (!application) {
    try { const p = await bdd.doc(`projets/${projetId}`).get(); application = p.exists ? String(p.data().nom || '').trim() : ''; } catch (err) { application = ''; }
  }
  const n = nombreDeScenarios(campagne.affectation, uid);
  const fin = courriels.dateFr(((campagne.fins || {})[uid]) || campagne.fin);
  const titre = String(campagne.titre || '').trim() || 'Campagne de tests';
  if (fiche.email) {
    await communication.mettreEnFile('campagne-testeur', [{ email: fiche.email, nom: fiche.prenom || '' }], {
      prenom: fiche.prenom || '', titre, application, scenarios: n, fin, lien: `${courriels.BASE}testeur`,
    }, { projet: projetId, evenement: 'campagne-testeur' });
  }
  await communication.notifier([uid], { type: 'test', titre: 'Votre campagne commence', texte: application ? `${application} · ${titre}` : titre, lien: '#/' });
  try {
    await push.pousserAvecCle([uid], {
      titre: 'Votre campagne de tests commence',
      corps: n ? `${application || titre} : ${n > 1 ? `${n} scénarios vous attendent` : 'un scénario vous attend'}.` : `${application || titre} : vos scénarios arrivent.`,
      lien: 'testeur#/',
      tag: `campagne-${campagneId}`.slice(0, 120),
    });
  } catch (err) { console.error(`Push de début de campagne non envoyé à ${uid}`, err); }
  return true;
}

exports.hubCampagneTesteurs = onDocumentWritten(
  { region: REGION, document: 'projets/{projetId}/campagnes/{campagneId}', secrets: [push.VAPID_PRIVEE] },
  async (evenement) => {
    if (await evenementDuSemis(evenement)) return null;
    const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
    const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
    const uids = aPrevenir(avant, apres);
    if (!uids.length) return null;
    const { projetId, campagneId } = evenement.params;
    let prevenus = 0;
    for (const uid of uids) {
      try { if (await prevenir({ projetId, campagneId, campagne: apres, uid })) prevenus += 1; } catch (err) { console.error(`Testeur ${uid} non prévenu du début de campagne`, err); }
    }
    return { prevenus };
  },
);

/* Pour les essais. */
exports._aPrevenir = aPrevenir;
exports._nombreDeScenarios = nombreDeScenarios;
