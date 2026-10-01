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
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const acces = require('./acces');
const { audit } = require('./commun');

const bdd = getFirestore();
const REGION = 'europe-west1';

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
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return res.status(err.code || 401).send(err.message || 'Connexion requise.'); }
  const id = String(req.query.document || '').trim();
  if (!id) return res.status(400).send('document requis');
  const d = await bdd.doc(`documents/${id}`).get();
  if (!d.exists) return res.status(404).send('Pièce inconnue.');
  const document = d.data();
  if (document.statut === 'brouillon' || document.archive === true) return res.status(404).send('Pièce inconnue.');
  if (!document.fichier || !document.fichier.chemin) return res.status(404).send('Cette pièce n\'a pas de PDF.');
  if (!(await peutLire(qui, document))) {
    await audit('piece.refusee', { document: id, uid: qui.uid, email: qui.email });
    return res.status(403).send('Cette pièce ne vous est pas ouverte.');
  }
  const fichier = getStorage().bucket().file(String(document.fichier.chemin));
  const [existe] = await fichier.exists();
  if (!existe) return res.status(404).send('Le PDF n\'est plus là. Prévenez-nous.');
  const nom = String(document.fichier.nom || `${document.numero || 'piece'}.pdf`).replace(/[^\w.\- ]+/g, '_');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${nom}"`);
  res.set('Cache-Control', 'private, no-store');
  await audit('piece.telechargee', { document: id, numero: document.numero || '', uid: qui.uid, email: qui.email, cote: qui.fiche ? 'equipe' : 'client' });
  return new Promise((resoudre) => {
    fichier.createReadStream()
      .on('error', (err) => { console.error('Pièce illisible', err); if (!res.headersSent) res.status(500).send('Le PDF n\'a pas pu être lu.'); resoudre(); })
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
     Authorization: Bearer <jeton>
   ========================================================================== */

/* Les formats et les plafonds du dépôt (noyau.js, storage.rules). Une
   requête vers une fonction ne dépasse pas 32 Mo : une vidéo jointe à un
   message s'arrête donc à 30 Mo. */
const TYPES_MESSAGE = /^(image\/[\w.+-]+|video\/(mp4|quicktime|webm)|application\/pdf|text\/plain|application\/zip|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;
const MAX_MESSAGE = 10 * 1024 * 1024;
const MAX_VIDEO_MESSAGE = 30 * 1024 * 1024;
const CHEMIN_MESSAGE = /^projets\/([A-Za-z0-9_-]{1,128})\/messages\/([A-Za-z0-9_.-]{1,300})$/;
const PROJET_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;

/* L'équipe se vérifie contre sa fiche, le client contre les membres du
   projet : jamais les deux pour la même personne, comme dans les règles. */
async function peutEchanger(qui, projetId) {
  if (qui.fiche) return acces.equipeSurProjet(qui.fiche, projetId);
  const p = await bdd.doc(`projets/${projetId}`).get();
  if (!p.exists) return false;
  const membres = p.data().membres;
  return Array.isArray(membres) && membres.includes(qui.uid);
}

const nomPropre = (nom) => String(nom || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'fichier';

exports.suiviPieceMessage = onRequest({ region: REGION, cors: true, secrets: [], invoker: 'public', memory: '512MiB' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return res.status(err.code || 401).send(err.message || 'Connexion requise.'); }
  res.set('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'POST') {
      const projetId = String(req.query.projet || '').trim();
      const type = String(req.query.type || '').trim().toLowerCase();
      const nom = String(req.query.nom || '').trim();
      if (!PROJET_VALIDE.test(projetId)) return res.status(400).send('Projet inconnu.');
      if (!(await peutEchanger(qui, projetId))) {
        await audit('piece-message.refusee', { projet: projetId, geste: 'envoi', uid: qui.uid, email: qui.email });
        return res.status(403).send('Vous ne pouvez pas joindre de fichier à cette conversation.');
      }
      if (!TYPES_MESSAGE.test(type)) return res.status(400).send(`« ${nom || 'Ce fichier'} » : ce type de fichier n'est pas accepté.`);
      const corps = Buffer.isBuffer(req.rawBody) ? req.rawBody : (Buffer.isBuffer(req.body) ? req.body : null);
      if (!corps || !corps.length) return res.status(400).send('Le fichier est vide.');
      const plafond = type.startsWith('video/') ? MAX_VIDEO_MESSAGE : MAX_MESSAGE;
      if (corps.length > plafond) return res.status(413).send(`« ${nom || 'Ce fichier'} » dépasse ${Math.round(plafond / 1024 / 1024)} Mo.`);
      const chemin = `projets/${projetId}/messages/${Date.now()}-${nomPropre(nom)}`;
      await getStorage().bucket().file(chemin).save(corps, {
        resumable: false,
        contentType: type,
        metadata: { metadata: { par: qui.uid, cote: qui.fiche ? 'equipe' : 'client' } },
      });
      return res.status(200).json({ nom: nom || nomPropre(nom), chemin, taille: corps.length, type });
    }

    const chemin = String(req.query.chemin || '').trim();
    const m = CHEMIN_MESSAGE.exec(chemin);
    if (!m) return res.status(400).send('Ce fichier n\'est pas une pièce de conversation.');
    if (!(await peutEchanger(qui, m[1]))) {
      await audit('piece-message.refusee', { projet: m[1], geste: 'lecture', chemin, uid: qui.uid, email: qui.email });
      return res.status(403).send('Ce fichier ne vous est pas ouvert.');
    }
    const fichier = getStorage().bucket().file(chemin);
    const [existe] = await fichier.exists();
    if (!existe) return res.status(404).send('Ce fichier n\'est plus là.');
    const [meta] = await fichier.getMetadata();
    res.set('Content-Type', meta.contentType || 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `attachment; filename="${m[2]}"`);
    return new Promise((resoudre) => {
      fichier.createReadStream()
        .on('error', (err) => { console.error('Pièce de message illisible', err); if (!res.headersSent) res.status(500).send('Le fichier n\'a pas pu être lu. Réessayez.'); resoudre(); })
        .on('end', resoudre)
        .pipe(res);
    });
  } catch (err) {
    console.error('Pièce de message', err);
    if (!res.headersSent) return res.status(500).send('Le fichier n\'a pas pu être traité. Réessayez dans un instant.');
    return undefined;
  }
});
