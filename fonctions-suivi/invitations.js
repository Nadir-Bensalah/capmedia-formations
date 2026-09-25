/* ==========================================================================
   CAPMEDIA CLIENT HUB · les invitations

   Une seule mécanique pour les trois familles (équipe, client, testeur).
   Une invitation ne donne AUCUN accès par elle-même : l'accès vient de la
   fiche d'équipe, de l'interlocuteur du projet ou de la fiche de testeur.
   Elle porte le lien qui pré-remplit l'adresse, et elle raconte où en est
   la personne : préparée, en attente, envoyée, acceptée, expirée, révoquée.

   Le jeton du lien n'est jamais gardé en clair : le document porte son
   empreinte pour identifiant. Lire la base ne donne donc aucun lien.

   Les états :
     preparee    la personne est ajoutée, rien n'est parti (projet fermé)
     en-attente  le lien existe, l'e-mail n'est pas parti (e-mails coupés)
     envoyee     l'e-mail est en file
     acceptee    la personne s'est connectée : le lien ne pré-remplit plus
     expiree     quatorze jours sont passés sans connexion
     revoquee    le lien a été coupé (renvoi, retrait, fermeture)
   ========================================================================== */

const crypto = require('node:crypto');
const { bdd, FieldValue, normaliserEmail, sansIndefini, enMillis, cleEmail } = require('./commun');
const courriels = require('./courriels');

const VIE = 14 * 24 * 3600 * 1000;
const TYPES = ['equipe', 'client', 'testeur'];
const ETATS = ['preparee', 'en-attente', 'envoyee', 'acceptee', 'expiree', 'revoquee'];

const nouveauJeton = () => crypto.randomBytes(24).toString('base64url');
const idDe = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('hex');
const lienDe = (jeton) => `${courriels.BASE}?i=${jeton}`;

/** L'état lisible d'une invitation, à un instant donné. Pur. */
function etatInvitation(inv, maintenant = Date.now()) {
  if (!inv) return null;
  if (inv.revoquee === true || inv.etat === 'revoquee') return 'revoquee';
  if (inv.etat === 'acceptee') return 'acceptee';
  const expire = enMillis(inv.expire);
  if (expire && maintenant > expire) return 'expiree';
  return ETATS.includes(inv.etat) ? inv.etat : 'en-attente';
}

/** Une invitation encore capable de pré-remplir une adresse. */
const utilisable = (inv, maintenant = Date.now()) => ['en-attente', 'envoyee'].includes(etatInvitation(inv, maintenant));

/**
 * Crée une invitation, en révoquant celles, encore vivantes, de la même
 * personne pour la même cible : un renvoi ne laisse pas deux liens
 * valides derrière lui.
 * @returns { id, jeton, lien, expire }
 */
async function creer({ type, email, nom = '', uid, role = '', projet = null, projetNom = '', projets = [], par = null, envoyee = false }) {
  if (!TYPES.includes(type)) throw new Error(`type d'invitation inconnu : ${type}`);
  await revoquerCelles({ type, uid, projet });
  const jeton = nouveauJeton();
  const id = idDe(jeton);
  const expire = new Date(Date.now() + VIE);
  await bdd.doc(`invitations/${id}`).set(sansIndefini({
    type, email: normaliserEmail(email), nom: String(nom || '').trim(), uid, role,
    projet: projet ? String(projet) : null, projetNom: String(projetNom || ''), projets: (projets || []).map(String),
    etat: envoyee ? 'envoyee' : 'en-attente', expire,
    cree: FieldValue.serverTimestamp(), envoyee: envoyee ? FieldValue.serverTimestamp() : null,
    acceptee: null, revoquee: false, par: par || null,
  }));
  return { id, jeton, lien: lienDe(jeton), expire };
}

async function marquerEnvoyee(id) {
  await bdd.doc(`invitations/${id}`).update({ etat: 'envoyee', envoyee: FieldValue.serverTimestamp() });
}

/** Révoque les invitations vivantes d'une personne pour une cible donnée. */
async function revoquerCelles({ type, uid, projet = undefined }) {
  if (!uid) return 0;
  const q = await bdd.collection('invitations').where('uid', '==', uid).get();
  let n = 0;
  for (const d of q.docs) {
    const inv = d.data();
    if (type && inv.type !== type) continue;
    if (projet !== undefined && (inv.projet || null) !== (projet ? String(projet) : null)) continue;
    if (!utilisable(inv)) continue;
    await d.ref.update({ etat: 'revoquee', revoquee: true, maj: FieldValue.serverTimestamp() });
    n += 1;
  }
  return n;
}

async function revoquer(id) {
  const ref = bdd.doc(`invitations/${id}`);
  if (!(await ref.get()).exists) return false;
  await ref.update({ etat: 'revoquee', revoquee: true, maj: FieldValue.serverTimestamp() });
  return true;
}

/**
 * Une connexion réussie consomme les invitations vivantes de ce compte :
 * elles passent « acceptées », leur lien ne pré-remplit plus rien, et
 * l'interlocuteur du projet le dit dans le cockpit.
 */
async function accepter(uid) {
  if (!uid) return [];
  const q = await bdd.collection('invitations').where('uid', '==', uid).get();
  const acceptees = [];
  for (const d of q.docs) {
    const inv = d.data();
    if (!utilisable(inv)) continue;
    await d.ref.update({ etat: 'acceptee', acceptee: FieldValue.serverTimestamp() });
    acceptees.push({ id: d.id, ...inv });
    if (inv.type === 'client' && inv.projet) {
      const cible = bdd.doc(`projets/${inv.projet}/interlocuteurs/${cleEmail(inv.email)}`);
      try {
        const i = await cible.get();
        if (i.exists && i.data().statut === 'actif') {
          await cible.update({ 'invitation.etat': 'acceptee', 'invitation.acceptee': FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
        }
      } catch (err) { console.error('Interlocuteur non marqué accepté', err); }
    }
  }
  return acceptees;
}

/**
 * Le lien arrive à la porte : on rend l'adresse à pré-remplir, ou rien.
 * Les anciens liens (le jeton comme identifiant du document) restent lus.
 */
async function lire(jeton) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(jeton || ''))) return null;
  let d = await bdd.doc(`invitations/${idDe(jeton)}`).get();
  if (!d.exists) d = await bdd.doc(`invitations/${jeton}`).get();
  if (!d.exists) return null;
  const inv = d.data();
  /* Un ancien lien n'a pas d'état : il vaut « envoyé » tant qu'il n'est ni
     révoqué ni expiré. */
  const etat = etatInvitation({ ...inv, etat: inv.etat || 'envoyee' });
  if (!['en-attente', 'envoyee'].includes(etat)) return null;
  return { email: inv.email || '', nom: inv.nom || '', projet: inv.projetNom || '', projetId: inv.projet || null, type: inv.type || 'client' };
}

module.exports = { VIE, TYPES, ETATS, etatInvitation, utilisable, creer, marquerEnvoyee, revoquerCelles, revoquer, accepter, lire, idDe, lienDe };
