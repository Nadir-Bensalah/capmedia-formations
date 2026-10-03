/* ==========================================================================
   CAPMEDIA CLIENT HUB · les notifications push des messages

   Deux conversations : celle d'un projet (ci-dessous), et celle d'un
   testeur avec l'équipe (hubPushMessageTesteur, en bas). La campagne qui
   commence pousse aussi vers ses testeurs (testeurs-lettres.js).

   Un message dans la conversation d'un projet (projets/{p}/messages) part
   aussi en push vers les appareils abonnés de ceux qui le reçoivent dans
   leur cloche : les mêmes personnes, décidées au même endroit
   (communication.uidsClients, communication.uidsEquipe), jamais l'auteur.

   Le push est une notification de l'espace, pas un e-mail : des e-mails
   coupés sur le projet (emailsClient « coupes ») ne l'arrêtent pas, comme
   ils n'arrêtent pas la cloche. Un projet fermé au client, un client qui
   n'est plus membre, un membre d'équipe inactif ne reçoivent rien.

   Ce qui part : le nom de l'auteur, le début du message, le lien de la
   conversation. Jamais le contenu d'une pièce jointe, ni son nom.

   Les abonnements vivent dans profils/{uid}/pushs/{id} (écrits par la
   personne elle-même, voir assets/js/notifications-push.js) ; un
   abonnement que le service de push dit disparu (404, 410) est effacé.

   La clé privée VAPID est le secret VAPID_PRIVEE ; la clé publique est
   ci-dessous et dans agence/suivi/assets/js/config-suivi.js (les deux
   doivent être identiques : qa-push.cjs le vérifie). Sur le banc d'essai,
   rien ne part : chaque envoi est chiffré pour de vrai (preuve que
   l'abonnement est utilisable), puis consigné dans _banc/push/envois.
   ========================================================================== */

const v2firestore = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { bdd, REGION, FieldValue, evenementDuSemis, instantEvenement } = require('./commun');
const communication = require('./communication');

const VAPID_PRIVEE = defineSecret('VAPID_PRIVEE');
const VAPID_PUBLIQUE = 'BHivZYATTn5OIoeOyLL1G1Gkb9ywP6GGQlez1ekUoX0_5r6T1pWI6Fu0fwDsMHeo5Kzi2Q5w20vidtjHqDFDzUs';
const SUJET = 'mailto:contact@capmedia.app';
const SUR_BANC = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const ABONNEMENTS_MAX = 20;

/* Chargé à la demande : un démarrage à froid des autres fonctions n'en paie pas le prix. */
let webpush = null;
const lib = () => { if (!webpush) webpush = require('web-push'); return webpush; };

/** Le corps : le début du message, ou ce qu'il porte quand il n'a pas de texte. */
function extrait(m) {
  const texte = String((m && m.texte) || '').replace(/\s+/g, ' ').trim();
  if (texte) return texte.length > 120 ? `${texte.slice(0, 119)}…` : texte;
  const n = Array.isArray(m && m.pieces) ? m.pieces.length : 0;
  return n > 1 ? `${n} pièces jointes` : 'Pièce jointe';
}

/** Ce que reçoit l'appareil : { titre, corps, lien, tag }. */
function charge({ m, projet, projetId, versEquipe }) {
  const de = (m && m.de) || {};
  const nom = String(de.nom || '').trim() || (de.cote === 'equipe' ? 'Capmedia' : 'Le client');
  const projetNom = String((projet && projet.nom) || '').trim();
  return {
    titre: (versEquipe && projetNom ? `${nom} · ${projetNom}` : nom).slice(0, 120),
    corps: extrait(m),
    lien: `${versEquipe ? 'cockpit' : 'hub'}#/messages/${encodeURIComponent(projetId)}`,
    tag: `messages-${projetId}`.slice(0, 120),
  };
}

async function abonnementsDe(uid) {
  const q = await bdd.collection(`profils/${uid}/pushs`).limit(ABONNEMENTS_MAX).get();
  return q.docs.filter((d) => {
    const a = d.data() || {};
    return /^https:\/\//.test(String(a.endpoint || '')) && a.cles && a.cles.p256dh && a.cles.auth;
  });
}

/* Les clés du banc : une paire jetable, pour chiffrer sans jamais envoyer. */
let clesBanc = null;

/** Un envoi. Rend le code HTTP du service de push (ou celui simulé sur le banc). */
async function envoyerA(docAbonnement, donnees, clePrivee) {
  const a = docAbonnement.data();
  const abonnement = { endpoint: a.endpoint, keys: { p256dh: a.cles.p256dh, auth: a.cles.auth } };
  const texte = JSON.stringify(donnees);
  if (SUR_BANC) {
    if (!clesBanc) clesBanc = lib().generateVAPIDKeys();
    let statut = 201;
    let erreur = null;
    try {
      lib().generateRequestDetails(abonnement, texte, { vapidDetails: { subject: SUJET, publicKey: clesBanc.publicKey, privateKey: clesBanc.privateKey }, TTL: 86400 });
    } catch (err) { statut = 0; erreur = String(err && err.message || err).slice(0, 200); }
    /* Une adresse d'envoi qui dit « expire » joue l'abonnement disparu. */
    if (!erreur && /expire/.test(a.endpoint)) statut = 410;
    await bdd.collection('_banc/push/envois').add({
      uid: docAbonnement.ref.parent.parent.id, abonnement: docAbonnement.id, endpoint: a.endpoint,
      charge: donnees, statut, erreur, date: FieldValue.serverTimestamp(),
    });
    if (erreur) throw Object.assign(new Error(erreur), { statusCode: 0 });
    if (statut >= 400) throw Object.assign(new Error('abonnement disparu'), { statusCode: statut });
    return statut;
  }
  const r = await lib().sendNotification(abonnement, texte, {
    vapidDetails: { subject: SUJET, publicKey: VAPID_PUBLIQUE, privateKey: clePrivee },
    TTL: 86400,
    urgency: 'high',
    timeout: 10000,
  });
  return r.statusCode;
}

/** Pousse un message aux appareils de ces personnes ; efface les abonnements disparus. */
async function pousser(uids, donnees, clePrivee) {
  let envoyes = 0;
  let effaces = 0;
  for (const uid of uids) {
    let abonnements = [];
    try { abonnements = await abonnementsDe(uid); } catch (err) { console.error(`Abonnements push de ${uid} illisibles`, err); continue; }
    const resultats = await Promise.allSettled(abonnements.map((d) => envoyerA(d, donnees, clePrivee)));
    for (let i = 0; i < resultats.length; i += 1) {
      const r = resultats[i];
      if (r.status === 'fulfilled') { envoyes += 1; continue; }
      const code = r.reason && r.reason.statusCode;
      if (code === 404 || code === 410) {
        await abonnements[i].ref.delete().catch(() => {});
        effaces += 1;
      } else {
        console.error(`Push non remis (${code || 'erreur'}) à un appareil de ${uid} : ${String((r.reason && r.reason.message) || r.reason).slice(0, 200)}`);
      }
    }
  }
  return { envoyes, effaces };
}

/** Les destinataires d'un message : ceux de la cloche, sans l'auteur. */
async function destinataires(m, projet, projetId) {
  const de = (m && m.de) || {};
  const versEquipe = de.cote !== 'equipe';
  const exclure = [de.uid].filter(Boolean);
  const uids = versEquipe
    ? await communication.uidsEquipe(projetId, { exclure, evenement: 'message' })
    : await communication.uidsClients(projet, 'message', { exclure });
  return { versEquipe, uids: uids.filter((u) => u && u !== de.uid) };
}

async function surMessage(evenement) {
  const m = evenement.data && evenement.data.data();
  if (!m || !m.de) return null;
  const projetId = evenement.params.projetId;
  const lu = await bdd.doc(`projets/${projetId}`).get();
  if (!lu.exists) return null;
  const projet = { id: lu.id, ...lu.data() };
  const { versEquipe, uids } = await destinataires(m, projet, projetId);
  if (!uids.length) return null;
  const clePrivee = SUR_BANC ? '' : String(VAPID_PRIVEE.value() || '').trim();
  if (!SUR_BANC && !clePrivee) { console.error('Push non envoyé : secret VAPID_PRIVEE absent'); return null; }
  return pousser(uids, charge({ m, projet, projetId, versEquipe }), clePrivee);
}

exports.hubPushMessage = v2firestore.onDocumentCreated(
  { region: REGION, document: 'projets/{projetId}/messages/{messageId}', secrets: [VAPID_PRIVEE] },
  async (evenement) => {
    /* Banc d'essai : un message né pendant la pose d'une base de test ne pousse rien. */
    if (await evenementDuSemis(evenement)) return null;
    /* Les décisions (projet ouvert, membre) au moment du message, comme la cloche. */
    return communication.auMoment(instantEvenement(evenement), () => surMessage(evenement));
  },
);

/* ==========================================================================
   L'espace Test : la conversation d'un testeur avec l'équipe

   Un testeur écrit : l'équipe qui reçoit sa cloche (les administrateurs
   actifs, comme hubMessageTesteur) est poussée, lien du Cockpit. L'équipe
   répond : le testeur est poussé, s'il est encore actif, lien de sa bulle.
   ========================================================================== */

/** Pousse `donnees` vers ces personnes, avec le secret ; rien sans lui. */
async function pousserAvecCle(uids, donnees) {
  if (!uids.length) return null;
  const clePrivee = SUR_BANC ? '' : String(VAPID_PRIVEE.value() || '').trim();
  if (!SUR_BANC && !clePrivee) { console.error('Push non envoyé : secret VAPID_PRIVEE absent'); return null; }
  return pousser(uids, donnees, clePrivee);
}

/** Ce que reçoit l'appareil pour un message de la conversation d'un testeur. */
function chargeTesteur({ m, testeurId, prenom, versEquipe }) {
  const de = (m && m.de) || {};
  return versEquipe
    ? { titre: `${String(prenom || de.nom || '').trim() || 'Un testeur'} (testeur)`.slice(0, 120), corps: extrait(m), lien: `cockpit#/testeurs-messages/${encodeURIComponent(testeurId)}`, tag: `testeur-${testeurId}`.slice(0, 120) }
    : { titre: (String(de.nom || '').trim() || 'Capmedia').slice(0, 120), corps: extrait(m), lien: 'testeur#/messages', tag: 'messages-testeur' };
}

async function surMessageTesteur(evenement) {
  const m = evenement.data && evenement.data.data();
  if (!m || !m.de) return null;
  const testeurId = evenement.params.testeurId;
  const lu = await bdd.doc(`testeurs/${testeurId}`).get();
  const fiche = lu.exists ? lu.data() : null;
  const versEquipe = m.de.cote === 'testeur';
  let uids = [];
  if (versEquipe) uids = await communication.uidsEquipe(null, { exclure: [m.de.uid] });
  else if (fiche && fiche.actif !== false) uids = [testeurId];
  uids = uids.filter((u) => u && u !== m.de.uid);
  return pousserAvecCle(uids, chargeTesteur({ m, testeurId, prenom: fiche && fiche.prenom, versEquipe }));
}

exports.hubPushMessageTesteur = v2firestore.onDocumentCreated(
  { region: REGION, document: 'conversationsTesteurs/{testeurId}/messages/{messageId}', secrets: [VAPID_PRIVEE] },
  async (evenement) => {
    if (await evenementDuSemis(evenement)) return null;
    return surMessageTesteur(evenement);
  },
);

/* Pour les autres déclencheurs (la campagne qui commence) : le même secret. */
exports.VAPID_PRIVEE = VAPID_PRIVEE;
exports.pousserAvecCle = pousserAvecCle;

/* Pour les essais. */
exports.chargeTesteur = chargeTesteur;
exports.VAPID_PUBLIQUE = VAPID_PUBLIQUE;
exports.extrait = extrait;
exports.charge = charge;
