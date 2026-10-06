/* ==========================================================================
   CAPMEDIA CLIENT HUB · le téléchargement d'une pièce (devis, facture)

   Le PDF ne passe pas par les règles Storage : c'est le serveur qui le
   remet, après avoir vérifié lui-même qui demande. Le responsable du
   projet et la finance de l'équipe, personne d'autre ; jamais un brouillon
   ni une archive. Le fichier est lu par l'Admin SDK et renvoyé tel quel,
   en pièce jointe, sous son nom.

     GET /suiviPiece?document=<id>      Authorization: Bearer <jeton>
   ========================================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const acces = require('./acces');
const { audit } = require('./commun');

const bdd = getFirestore();
const REGION = 'europe-west1';

/* Toute réponse en texte part en text/plain, jamais en text/html (le
   défaut d'Express pour une chaîne) : un message qui recopie le nom d'un
   fichier ne peut pas devenir une page qui exécute ce nom. */
const texte = (res, code, message) => res.status(code).type('text/plain; charset=utf-8').set('X-Content-Type-Options', 'nosniff').send(message);

/* Qui peut lire cette pièce : la finance de l'équipe, ou le responsable du
   projet. La même règle que le stockage, écrite une seule fois ici. */
async function peutLire(qui, document) {
  if (qui.fiche) return acces.financeEquipe(qui.fiche, document.projet);
  const p = await bdd.doc(`projets/${document.projet}`).get();
  if (!p.exists) return false;
  const projet = p.data();
  return Array.isArray(projet.membres) && projet.membres.includes(qui.uid)
    && (projet.roles || {})[qui.uid] === 'responsable';
}

/* « invoker: public » : la porte est ouverte à tous au niveau du réseau,
   comme la porte de connexion ; c'est le jeton, vérifié ici, qui décide.
   Sans ce mot, le déploiement laisse la fonction fermée (401 avant même
   d'arriver au code). */
exports.suiviPiece = onRequest({ region: REGION, cors: true, secrets: [], invoker: 'public' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return texte(res, 405, 'Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return texte(res, err.code || 401, err.message || 'Connexion requise.'); }
  const id = String(req.query.document || '').trim();
  if (!id) return texte(res, 400, 'document requis');
  const d = await bdd.doc(`documents/${id}`).get();
  if (!d.exists) return texte(res, 404, 'Pièce inconnue.');
  const document = d.data();
  if (document.statut === 'brouillon' || document.archive === true) return texte(res, 404, 'Pièce inconnue.');
  if (!document.fichier || !document.fichier.chemin) return texte(res, 404, 'Cette pièce n\'a pas de PDF.');
  if (!(await peutLire(qui, document))) {
    await audit('piece.refusee', { document: id, uid: qui.uid, email: qui.email });
    return texte(res, 403, 'Cette pièce ne vous est pas ouverte.');
  }
  const fichier = getStorage().bucket().file(String(document.fichier.chemin));
  const [existe] = await fichier.exists();
  if (!existe) return texte(res, 404, 'Le PDF n\'est plus là. Prévenez-nous.');
  const nom = String(document.fichier.nom || `${document.numero || 'piece'}.pdf`).replace(/[^\w.\- ]+/g, '_');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${nom}"`);
  res.set('Cache-Control', 'private, no-store');
  await audit('piece.telechargee', { document: id, numero: document.numero || '', uid: qui.uid, email: qui.email, cote: qui.fiche ? 'equipe' : 'client' });
  return new Promise((resoudre) => {
    fichier.createReadStream()
      .on('error', (err) => { console.error('Pièce illisible', err); if (!res.headersSent) texte(res, 500, 'Le PDF n\'a pas pu être lu.'); resoudre(); })
      .on('end', resoudre)
      .pipe(res);
  });
});

/* ==========================================================================
   Les pièces de la conversation du projet (photos, PDF, documents)

   Elles ne passent pas non plus par les règles Storage : en production,
   la règle qui les couvre relit le projet dans Firestore, et cette lecture
   répond 403 tant que le compte des règles n'a pas son rôle. Le serveur
   reçoit donc le fichier, vérifie lui-même qui l'envoie, et l'écrit ; il
   le remet de la même façon. La règle est celle du stockage, écrite une
   seule fois ici : l'équipe autorisée sur le projet, ou un client membre
   effectif du projet (projets/{p}.membres, calculé par le serveur). Un
   client d'un autre projet, un testeur, une session fermée : refusés.

     POST /suiviPieceMessage?projet=<p>&nom=<nom>&type=<type>   corps : le fichier
     GET  /suiviPieceMessage?chemin=projets/<p>/messages/<objet>
     POST /suiviPieceMessage?projet=<p>&ticket=<t|nouveau>&nom=..&type=..[&interne=1]   pièce d'une demande
     GET  /suiviPieceMessage?chemin=projets/<p>/tickets/<t>/<objet>
     POST /suiviPieceMessage?geste=marquer&chemin=projets/<p>/tickets/<t>/<objet>&visibilite=interne|client   (équipe)
     Authorization: Bearer <jeton>
   ========================================================================== */

/* Les formats et les plafonds du dépôt (noyau.js, storage.rules). Une
   requête vers une fonction ne dépasse pas 32 Mo : une vidéo jointe à un
   message s'arrête donc à 30 Mo. */
/* Liste FERMÉE : jamais d'image/svg+xml (un SVG porte du script, et ouvert
   dans un onglet blob: il aurait l'origine du Hub). */
const TYPES_MESSAGE = /^(image\/(png|jpeg|gif|webp|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf|text\/plain|application\/zip|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;
const MAX_MESSAGE = 10 * 1024 * 1024;
const MAX_VIDEO_MESSAGE = 30 * 1024 * 1024;
const CHEMIN_MESSAGE = /^projets\/([A-Za-z0-9_-]{1,128})\/messages\/([A-Za-z0-9_.-]{1,300})$/;
const PROJET_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;
/* Les pièces des demandes passent par la même porte (06/10/2026) : depuis
   le Cockpit, joindre une capture à une demande répondait « vous n'avez
   pas accès à ce dossier » par les règles Storage. Le dossier porte la
   demande (« nouveau » avant sa création). Une pièce de note interne est
   marquée « interne » et n'est jamais remise au client. */
const CHEMIN_TICKET = /^projets\/([A-Za-z0-9_-]{1,128})\/tickets\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_.-]{1,300})$/;
const TICKET_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

/* Une demande déjà créée doit appartenir au projet nommé : sans ce
   contrôle, un membre d'un projet rangerait une pièce sous la demande
   d'un autre. « nouveau » est le dossier d'avant la création. */
async function ticketDuProjet(ticketId, projetId) {
  if (ticketId === 'nouveau') return true;
  const t = await bdd.doc(`tickets/${ticketId}`).get();
  return t.exists && t.data().projet === projetId;
}

/* L'équipe se vérifie contre sa fiche, le client contre les membres du
   projet : jamais les deux pour la même personne, comme dans les règles. */
async function peutEchanger(qui, projetId) {
  if (qui.fiche) return acces.equipeSurProjet(qui.fiche, projetId);
  const p = await bdd.doc(`projets/${projetId}`).get();
  if (!p.exists) return false;
  const membres = p.data().membres;
  return Array.isArray(membres) && membres.includes(qui.uid);
}

/* Le plafond de dépôt, par personne et par jour (UTC) : 200 fichiers ou
   1 Go, le premier atteint. Le compteur vit dans Firestore, sous
   depotsPieces/{uid}_{AAAA-MM-JJ}, que les règles ferment à tout le
   monde (match /{document=**}) : seul ce serveur l'écrit. Le dépôt est
   réservé dans une transaction AVANT l'écriture du fichier, et rendu si
   l'écriture échoue : deux envois simultanés ne passent pas à deux sous le
   plafond. */
const PLAFOND_FICHIERS_JOUR = 200;
const PLAFOND_OCTETS_JOUR = 1024 * 1024 * 1024;
const refDepotsDuJour = (uid) => bdd.doc(`depotsPieces/${uid}_${new Date().toISOString().slice(0, 10)}`);

/** Réserve un dépôt de `taille` octets. Rend null si c'est accordé, sinon le message à afficher. */
async function reserverDepot(uid, taille) {
  const ref = refDepotsDuJour(uid);
  return bdd.runTransaction(async (t) => {
    const d = await t.get(ref);
    const brut = d.exists ? d.data() : {};
    const fichiers = Number(brut.fichiers || 0);
    const octets = Number(brut.octets || 0);
    if (fichiers + 1 > PLAFOND_FICHIERS_JOUR) {
      return `Vous avez déjà envoyé ${PLAFOND_FICHIERS_JOUR} fichiers aujourd'hui, le maximum pour une journée. Vous pourrez en joindre d'autres demain ; en attendant, écrivez-nous si c'est urgent.`;
    }
    if (octets + taille > PLAFOND_OCTETS_JOUR) {
      return 'Vous avez déjà envoyé près de 1 Go de fichiers aujourd\'hui, le maximum pour une journée. Vous pourrez en joindre d\'autres demain ; en attendant, écrivez-nous si c\'est urgent.';
    }
    t.set(ref, { uid, fichiers: fichiers + 1, octets: octets + taille, maj: FieldValue.serverTimestamp() }, { merge: true });
    return null;
  });
}

/** Rend un dépôt réservé dont le fichier n'a pas pu être écrit. */
const rendreDepot = (uid, taille) => refDepotsDuJour(uid)
  .set({ fichiers: FieldValue.increment(-1), octets: FieldValue.increment(-taille) }, { merge: true })
  .catch((err) => console.error('Dépôt non rendu', err));

const nomPropre = (nom) => String(nom || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'fichier';

exports.suiviPieceMessage = onRequest({ region: REGION, cors: true, secrets: [], invoker: 'public', memory: '512MiB' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET' && req.method !== 'POST') return texte(res, 405, 'Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return texte(res, err.code || 401, err.message || 'Connexion requise.'); }
  res.set('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'POST' && req.query.geste === 'marquer') {
      /* Note interne ou réponse au client : l'équipe seule remet la marque
         d'une pièce de demande d'accord avec le message qui la porte. */
      const chemin = String(req.query.chemin || '').trim();
      const visibilite = String(req.query.visibilite || '');
      const m = CHEMIN_TICKET.exec(chemin);
      if (!m || !['interne', 'client'].includes(visibilite)) return texte(res, 400, 'Cette pièce ne se marque pas.');
      if (!qui.fiche || !acces.equipeSurProjet(qui.fiche, m[1])) {
        await audit('piece-message.refusee', { projet: m[1], geste: 'marquer', chemin, uid: qui.uid, email: qui.email });
        return texte(res, 403, 'Seule l\'équipe du projet marque une pièce.');
      }
      const fichier = getStorage().bucket().file(chemin);
      const [existe] = await fichier.exists();
      if (!existe) return texte(res, 404, 'Ce fichier n\'est plus là.');
      await fichier.setMetadata({ metadata: { visibilite } });
      return res.status(200).json({ chemin, visibilite });
    }

    if (req.method === 'POST') {
      const projetId = String(req.query.projet || '').trim();
      const type = String(req.query.type || '').trim().toLowerCase();
      const nom = String(req.query.nom || '').trim();
      const ticketId = req.query.ticket === undefined ? null : String(req.query.ticket).trim();
      if (!PROJET_VALIDE.test(projetId)) return texte(res, 400, 'Projet inconnu.');
      if (ticketId !== null && !TICKET_VALIDE.test(ticketId)) return texte(res, 400, 'Demande inconnue.');
      if (!(await peutEchanger(qui, projetId)) || (ticketId !== null && !(await ticketDuProjet(ticketId, projetId)))) {
        await audit('piece-message.refusee', { projet: projetId, geste: 'envoi', ...(ticketId !== null ? { ticket: ticketId } : {}), uid: qui.uid, email: qui.email });
        return texte(res, 403, ticketId !== null ? 'Vous ne pouvez pas joindre de fichier à cette demande.' : 'Vous ne pouvez pas joindre de fichier à cette conversation.');
      }
      if (!TYPES_MESSAGE.test(type)) return texte(res, 400, `« ${nom || 'Ce fichier'} » : ce type de fichier n'est pas accepté.`);
      const corps = Buffer.isBuffer(req.rawBody) ? req.rawBody : (Buffer.isBuffer(req.body) ? req.body : null);
      if (!corps || !corps.length) return texte(res, 400, 'Le fichier est vide.');
      const plafond = type.startsWith('video/') ? MAX_VIDEO_MESSAGE : MAX_MESSAGE;
      if (corps.length > plafond) return texte(res, 413, `« ${nom || 'Ce fichier'} » dépasse ${Math.round(plafond / 1024 / 1024)} Mo.`);
      const refus = await reserverDepot(qui.uid, corps.length);
      if (refus) {
        await audit('piece-message.plafond', { projet: projetId, uid: qui.uid, email: qui.email, taille: corps.length });
        return texte(res, 429, refus);
      }
      /* Seule l'équipe pose la marque « interne » ; venant d'un client, elle
         est ignorée. */
      const interne = Boolean(qui.fiche) && req.query.interne === '1';
      const chemin = ticketId !== null
        ? `projets/${projetId}/tickets/${ticketId}/${Date.now()}-${nomPropre(nom)}`
        : `projets/${projetId}/messages/${Date.now()}-${nomPropre(nom)}`;
      try {
        await getStorage().bucket().file(chemin).save(corps, {
          resumable: false,
          contentType: type,
          metadata: { metadata: { par: qui.uid, cote: qui.fiche ? 'equipe' : 'client', ...(ticketId !== null ? { visibilite: interne ? 'interne' : 'client' } : {}) } },
        });
      } catch (err) {
        await rendreDepot(qui.uid, corps.length);
        throw err;
      }
      return res.status(200).json({ nom: nom || nomPropre(nom), chemin, taille: corps.length, type });
    }

    const chemin = String(req.query.chemin || '').trim();
    const m = CHEMIN_MESSAGE.exec(chemin) || CHEMIN_TICKET.exec(chemin);
    if (!m) return texte(res, 400, 'Ce fichier n\'est pas une pièce de conversation.');
    if (!(await peutEchanger(qui, m[1]))) {
      await audit('piece-message.refusee', { projet: m[1], geste: 'lecture', chemin, uid: qui.uid, email: qui.email });
      return texte(res, 403, 'Ce fichier ne vous est pas ouvert.');
    }
    const fichier = getStorage().bucket().file(chemin);
    const [existe] = await fichier.exists();
    if (!existe) return texte(res, 404, 'Ce fichier n\'est plus là.');
    const [meta] = await fichier.getMetadata();
    /* Une pièce de note interne ne sort jamais vers le client (même règle
       que pieceInterne() du stockage). */
    if (!qui.fiche && ((meta.metadata || {}).visibilite === 'interne')) {
      await audit('piece-message.refusee', { projet: m[1], geste: 'lecture', chemin, uid: qui.uid, email: qui.email, interne: true });
      return texte(res, 403, 'Ce fichier ne vous est pas ouvert.');
    }
    /* Le type servi est relu contre la liste fermée : un fichier déposé
       avant elle, ou par un autre chemin, sort en octets bruts. */
    res.set('Content-Type', TYPES_MESSAGE.test(meta.contentType || '') ? meta.contentType : 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `attachment; filename="${chemin.split('/').pop()}"`);
    return new Promise((resoudre) => {
      fichier.createReadStream()
        .on('error', (err) => { console.error('Pièce de message illisible', err); if (!res.headersSent) texte(res, 500, 'Le fichier n\'a pas pu être lu. Réessayez.'); resoudre(); })
        .on('end', resoudre)
        .pipe(res);
    });
  } catch (err) {
    console.error('Pièce de message', err);
    if (!res.headersSent) return texte(res, 500, 'Le fichier n\'a pas pu être traité. Réessayez dans un instant.');
    return undefined;
  }
});
