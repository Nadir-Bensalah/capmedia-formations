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

exports.suiviPiece = onRequest({ region: REGION, cors: true, secrets: [] }, async (req, res) => {
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
