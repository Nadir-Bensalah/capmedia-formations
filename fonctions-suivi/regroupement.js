/* ==========================================================================
   CAPMEDIA CLIENT HUB · le regroupement des lettres aux clients

   Ouvrir sept demandes d'un coup envoyait sept e-mails au client, puis sept
   autres au premier changement de statut. Les lettres de la vie des
   demandes (communication.REGROUPES : demande créée, statut, terminée,
   fermée, message de l'équipe, qualification) attendent donc dans
   « envoisEnAttente », une file par destinataire et par projet.

   Une file part quand elle est MÛRE : aucun nouvel événement depuis
   CALME_MS (fenêtre glissante), ou PLAFOND_MS écoulé depuis le premier
   (on ne retarde pas indéfiniment un client très actif). Alors :
     - un seul événement : la lettre d'aujourd'hui, inchangée (même modèle,
       mêmes variables) ;
     - plusieurs : UN récapitulatif (courriels.js, « recapitulatif »), une
       ligne par demande, qui dit son état final.

   La décision centrale (communication.decisionEmailClient) est reprise au
   moment de l'envoi, pour chaque événement, à son propre moment : un accès
   retiré, un projet refermé, des e-mails coupés ou une préférence éteinte
   pendant l'attente écartent l'événement. Chaque écart est tracé dans
   l'audit (« envoi.ecarte ») et sur la lettre qui part (« ecartes »).

   Sûreté. Tout se joue dans UNE transaction par file : relire la file,
   écrire la lettre dans « envois » (identifiant fixe, créé et jamais
   écrasé), effacer les événements. Deux passages simultanés ne produisent
   donc qu'une lettre, et une lettre écrite est une lettre qui suivra le
   cycle ordinaire du facteur (suiviFacteur : essais, échec, journal). Si
   la transaction échoue, rien n'est effacé : la file repart au passage
   suivant.
   ========================================================================== */

const crypto = require('node:crypto');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { bdd, REGION, FieldValue, normaliserEmail, sansIndefini, enMillis } = require('./commun');
const courriels = require('./courriels');
const communication = require('./communication');

/* La fenêtre : dix minutes de calme, une heure au plus. */
const CALME_MS = 10 * 60 * 1000;
const PLAFOND_MS = 60 * 60 * 1000;
/* Au-delà, le récapitulatif renvoie à l'espace pour le reste. */
const LIGNES_MAX = 30;
/* Le rythme de la fonction planifiée : le retard ajouté à la fenêtre. */
const RYTHME = 'every 2 minutes';

const ATTENTE = communication.ATTENTE;

/* ==========================================================================
   1. Les décisions pures
   ========================================================================== */

/** Une file est-elle mûre ? `deposes` : les dates de dépôt, en ms. */
function estMur(deposes, maintenant = Date.now()) {
  const d = (deposes || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (!d.length) return false;
  const premier = Math.min(...d);
  const dernier = Math.max(...d);
  return maintenant - dernier >= CALME_MS || maintenant - premier >= PLAFOND_MS;
}

/* La demande d'un événement : l'objet noté au dépôt, sinon son numéro ou
   son lien. Un événement sans rien de tout cela fait sa propre ligne. */
const objetDe = (e) => String(e.objet || (e.variables || {}).numero || (e.variables || {}).lien || e.id || '');

/**
 * Les lignes du récapitulatif : une par demande, dans l'ordre de leur
 * premier événement, avec leur état FINAL. Pur.
 */
function fusionner(evenements) {
  const tries = [...(evenements || [])].sort((a, b) => enMillis(a.depose) - enMillis(b.depose));
  const parObjet = new Map();
  for (const e of tries) {
    const v = e.variables || {};
    const cle = objetDe(e);
    const l = parObjet.get(cle) || { numero: '', titre: '', lien: '', cree: false, parLEquipe: false, statut: null, messages: 0, qualification: null };
    if (v.numero) l.numero = String(v.numero);
    if (v.titre) l.titre = String(v.titre);
    /* Le lien direct de la demande (ticket?t=) d'abord ; celui de la
       qualification (hub#) à défaut. */
    if (v.lien && (!l.lien || /\/ticket\?t=/.test(String(v.lien)))) l.lien = String(v.lien);
    switch (e.modele) {
      case 'ticket-cree':
        l.cree = true;
        l.parLEquipe = v.parLEquipe === true;
        break;
      case 'statut': if (v.statutApres) l.statut = String(v.statutApres); break;
      case 'resolu': l.statut = 'resolu'; break;
      case 'ferme': l.statut = 'ferme'; break;
      case 'message': l.messages += 1; break;
      case 'qualification': if (v.qualification) l.qualification = String(v.qualification); break;
      default: break;
    }
    parObjet.set(cle, l);
  }
  return [...parObjet.values()];
}

/**
 * La lettre qui sort d'une file, sans rien lire ni écrire. Pur.
 *   gardes : les événements qui passent la décision (triés ou non)
 *   rend   : { modele, variables, evenement } ou null
 */
function composer(gardes, { projetId = '', projetNom = '', nom = '' } = {}) {
  const liste = [...(gardes || [])].sort((a, b) => enMillis(a.depose) - enMillis(b.depose));
  if (!liste.length) return null;
  /* Seul : la lettre d'aujourd'hui, à l'identique. */
  if (liste.length === 1) return { modele: liste[0].modele, variables: liste[0].variables || {}, evenement: liste[0].evenement || liste[0].modele };
  const lignes = fusionner(liste);
  const premier = liste[0].variables || {};
  return {
    modele: 'recapitulatif',
    evenement: 'recapitulatif',
    variables: {
      projetNom: projetNom || String(premier.projetNom || ''),
      par: nom || '',
      lien: projetId ? `${courriels.BASE}hub#/projets/${encodeURIComponent(projetId)}/demandes` : courriels.lienEspace(),
      lignes: lignes.slice(0, LIGNES_MAX),
      total: lignes.length,
      nouvelles: lignes.filter((l) => l.cree).length,
    },
  };
}

/* ==========================================================================
   2. L'envoi d'une file, dans une transaction
   ========================================================================== */

const trace = (e) => sansIndefini({
  attente: e.id, modele: e.modele, evenement: e.evenement || e.modele, objet: e.objet || null,
  numero: String((e.variables || {}).numero || ''), titre: String((e.variables || {}).titre || ''),
  depose: e.depose || null,
});

/* L'identifiant de la lettre : fixé par la file et son premier événement.
   Un second passage sur la même file tomberait sur le même document, que
   « create » refuse d'écraser. */
const idLettre = (cle, premierId) => `regroupe-${crypto.createHash('sha256').update(`${cle}/${premierId}`).digest('hex').slice(0, 32)}`;

/**
 * Envoie une file si elle est mûre. Rend { etat, envoi?, gardes, ecartes }.
 * etat : 'vide' (déjà partie), 'pas-mur', 'envoye', 'ecarte' (tout écarté).
 */
async function expedierFile(cle, { maintenant = Date.now() } = {}) {
  try {
    return await bdd.runTransaction(async (t) => {
      const q = await t.get(bdd.collection(ATTENTE).where('cle', '==', cle));
      if (q.empty) return { etat: 'vide' };
      const evts = q.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
        .sort((a, b) => enMillis(a.depose) - enMillis(b.depose) || a.id.localeCompare(b.id));
      if (!estMur(evts.map((e) => enMillis(e.depose)), maintenant)) return { etat: 'pas-mur' };

      /* Toutes les lectures avant la première écriture. */
      const email = normaliserEmail(evts[0].email);
      const projetId = String(evts[0].projet || '');
      const projetDoc = projetId ? await t.get(bdd.doc(`projets/${projetId}`)) : null;
      const projet = projetDoc && projetDoc.exists ? { id: projetDoc.id, ...projetDoc.data() } : null;
      const personnes = projet ? (await t.get(bdd.collection(`projets/${projetId}/interlocuteurs`))).docs.map((d) => ({ cle: d.id, ...d.data() })) : [];
      const memes = personnes.filter((i) => normaliserEmail(i.email) === email);
      const interlocuteur = memes.find((i) => i.statut === 'actif') || memes[0] || null;
      let preferences = null;
      if (interlocuteur && interlocuteur.uid) {
        const profil = await t.get(bdd.doc(`profils/${interlocuteur.uid}`));
        preferences = profil.exists ? (profil.data().notifications || null) : null;
      }

      const gardes = []; const ecartes = [];
      for (const e of evts) {
        const d = communication.decisionEmailClient({ projet, interlocuteur, evenement: e.evenement || e.modele, preferences, quand: enMillis(e.moment) || null });
        if (d.ok) gardes.push(e); else ecartes.push({ ...e, motif: d.motif });
      }

      const nom = String((interlocuteur && interlocuteur.nom) || evts[0].nom || '').trim();
      const lettre = composer(gardes, { projetId, projetNom: (projet && projet.nom) || '', nom });
      let envoi = null;
      if (lettre) {
        envoi = bdd.collection('envois').doc(idLettre(cle, evts[0].id));
        t.create(envoi, sansIndefini({
          modele: lettre.modele, a: [{ email, nom }], variables: lettre.variables, etat: 'attente', erreur: null, essais: 0,
          cree: FieldValue.serverTimestamp(), envoye: null,
          projet: projetId || null, evenement: lettre.evenement,
          /* Ce que la page « E-mails envoyés » peut montrer : la lettre est
             passée par l'attente ; ce qu'elle réunit ; ce qui a été écarté. */
          attente: { premier: evts[0].depose || null, dernier: evts[evts.length - 1].depose || null, nombre: evts.length },
          regroupe: gardes.map(trace),
          ...(ecartes.length ? { ecartes: ecartes.map((e) => ({ ...trace(e), motif: e.motif })) } : {}),
        }));
      }
      for (const e of ecartes) {
        t.create(bdd.collection('audit').doc(), sansIndefini({
          action: 'envoi.ecarte', email, projet: projetId || null, ...trace(e), motif: e.motif,
          lettre: envoi ? envoi.id : null, date: FieldValue.serverTimestamp(),
        }));
      }
      for (const e of evts) t.delete(e.ref);
      return { etat: envoi ? 'envoye' : 'ecarte', envoi: envoi ? envoi.id : null, modele: lettre ? lettre.modele : null, gardes: gardes.length, ecartes: ecartes.length };
    });
  } catch (err) {
    /* La lettre existe déjà : un autre passage l'a faite. Rien à refaire. */
    if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) return { etat: 'vide' };
    throw err;
  }
}

/**
 * Le passage : relit toute l'attente, envoie chaque file mûre. Une file en
 * panne n'arrête pas les autres. Rend le bilan, pour les journaux.
 */
async function viderLaFile({ maintenant = Date.now() } = {}) {
  const q = await bdd.collection(ATTENTE).get();
  const files = new Map();
  for (const d of q.docs) {
    const e = d.data();
    if (!e.cle) continue;
    const l = files.get(e.cle) || [];
    l.push(enMillis(e.depose));
    files.set(e.cle, l);
  }
  const bilan = { files: files.size, envoyees: 0, ecartees: 0, attente: 0, erreurs: 0 };
  for (const [cle, deposes] of files) {
    if (!estMur(deposes, maintenant)) { bilan.attente += 1; continue; }
    try {
      const r = await expedierFile(cle, { maintenant });
      if (r.etat === 'envoye') bilan.envoyees += 1;
      else if (r.etat === 'ecarte') bilan.ecartees += 1;
      else if (r.etat === 'pas-mur') bilan.attente += 1;
    } catch (err) {
      bilan.erreurs += 1;
      console.error(`Regroupement : la file ${cle.slice(0, 8)} n'est pas partie, elle repartira`, err);
    }
  }
  return bilan;
}

/* ==========================================================================
   3. La fonction planifiée
   ========================================================================== */

exports.hubRegroupementEnvois = onSchedule(
  { region: REGION, schedule: RYTHME, timeZone: 'Europe/Paris', timeoutSeconds: 120, retryCount: 0 },
  async () => {
    const bilan = await viderLaFile();
    if (bilan.envoyees || bilan.ecartees || bilan.erreurs) console.log('Regroupement des e-mails', JSON.stringify(bilan));
  },
);

exports.CALME_MS = CALME_MS;
exports.PLAFOND_MS = PLAFOND_MS;
exports.LIGNES_MAX = LIGNES_MAX;
exports.estMur = estMur;
exports.fusionner = fusionner;
exports.composer = composer;
exports.expedierFile = expedierFile;
exports.viderLaFile = viderLaFile;
