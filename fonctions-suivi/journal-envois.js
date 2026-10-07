/* ==========================================================================
   CAPMEDIA CLIENT HUB · le journal des e-mails envoyés

   Ce que l'administrateur lit dans le Cockpit, page « E-mails envoyés » :
   chaque lettre déposée dans la file « envois », qu'elle soit partie, en
   file, en échec ou simulée sur le banc, et la lettre elle-même, telle que
   le destinataire l'a reçue.

   Depuis le 07/10/2026, le facteur (suivi.js, suiviFacteur) enregistre
   dans la lettre, au moment de l'envoi, l'objet, le HTML et le texte
   exacts qui sont partis (champ « rendu », taille bornée, secrets
   masqués). Ce journal montre ce rendu quand il existe. Pour une lettre
   plus ancienne, il refait l'appel du facteur (courriels.rendre sur le
   modèle, les variables et les destinataires figés à la mise en file) :
   seule une retouche de courriels.js faite APRÈS l'envoi ferait alors une
   différence, et l'écran dit laquelle des deux versions il montre.

   Deux choses ne sortent jamais en clair, même vers l'administrateur : le
   code de connexion (il ouvrirait une session) et le jeton d'un lien
   d'invitation (invitations.js n'en garde que l'empreinte, ce journal ne
   le rend pas lisible pour autant).

   Les règles ferment « envois » à tout navigateur : la lecture passe par
   suiviAdmin (actions emailsEnvoyes et emailEnvoye), réservée à
   l'administrateur. Les adresses ne sortent que vers lui.

   Les destinataires écartés (préférences, e-mails coupés, projet fermé)
   ne sont pas écrits dans « envois » : aucune lettre n'existe pour eux, ce
   journal ne peut donc pas les montrer.
   ========================================================================== */

const { bdd, enMillis, normaliserEmail, Refus } = require('./commun');
const courriels = require('./courriels');
const { EQUIPE_EMAIL } = require('./communication');

const PAR_PAGE = 50;

/* À qui la lettre s'adresse. Le modèle le dit le plus souvent ; sinon le
   côté posé dans les variables, ou l'adresse de l'équipe. */
const CONNEXION = new Set(['code', 'connexion-equipe']);
const TESTEURS = new Set(['invitation-testeur', 'campagne-testeur', 'message-testeur-reponse']);
const EQUIPE = new Set(['invitation-equipe', 'assignation', 'devis-reponse', 'reglement-declare', 'tache-reponse',
  'validation-reponse', 'testeur-termine', 'testeur-remarque', 'message-testeur']);
const PUBLICS = { client: 'Clients', equipe: 'Équipe', testeur: 'Testeurs', connexion: 'Codes et connexions' };

function publicDe(envoi) {
  const modele = String(envoi.modele || '');
  const v = envoi.variables || {};
  if (CONNEXION.has(modele)) return 'connexion';
  if (TESTEURS.has(modele)) return 'testeur';
  if (EQUIPE.has(modele) || v.cote === 'equipe') return 'equipe';
  const a = (envoi.a || []).filter((d) => d && d.email);
  if (a.length && a.every((d) => normaliserEmail(d.email) === EQUIPE_EMAIL)) return 'equipe';
  return 'client';
}

/* Le nom de l'événement, lisible. La clé est l'événement noté à la mise en
   file, ou à défaut le modèle. */
const EVENEMENTS = {
  invitation: 'Invitation au projet',
  ouverture: 'Ouverture du projet',
  'ticket-cree': 'Demande enregistrée',
  statut: "Statut d'une demande",
  assignation: 'Demande assignée',
  message: 'Message sur une demande',
  resolu: 'Demande terminée',
  ferme: 'Demande fermée',
  qualification: 'Demande qualifiée',
  devis: 'Devis déposé',
  'devis-reponse': 'Réponse à un devis',
  facture: 'Facture déposée',
  'facture-echeance': 'Échéance de facture',
  'facture-retard': 'Facture en retard',
  'reglement-declare': 'Règlement déclaré',
  'tache-attente': 'Tâche en attente du client',
  'tache-reponse': 'Réponse sur une tâche',
  'blocage-client': 'Point bloquant',
  release: 'Nouvelle version',
  fichier: 'Fichier',
  reunion: 'Réunion',
  'reunion-rappel': 'Rappel de réunion',
  'validation-demandee': 'Validation demandée',
  'validation-reponse': 'Réponse à une validation',
  'message-projet': 'Message du projet',
  preprojet: 'Demande de projet',
  maintenance: 'Maintenance',
  'evolution-statut': "Sort d'une évolution",
  relance: 'Relance hebdomadaire',
  anomalie: 'Anomalie de test',
  campagne: 'Campagne de tests',
  'campagne-testeur': 'Campagne de tests',
  'invitation-testeur': 'Invitation de testeur',
  'message-testeur': "Message d'un testeur",
  'message-testeur-reponse': 'Réponse à un testeur',
  'testeur-termine': 'Fin de test',
  'testeur-remarque': "Remarque d'un testeur",
  'invitation-equipe': "Invitation dans l'équipe",
  code: 'Code de connexion',
  'connexion-equipe': 'Session du Cockpit ouverte',
  /* Plusieurs lettres de la vie des demandes réunies (regroupement.js). */
  recapitulatif: 'Récapitulatif des demandes',
};
const libelleEvenement = (cle) => EVENEMENTS[cle] || '';

const ETATS = { attente: 'En file', envoye: 'Envoyé', echec: 'Échec', simule: 'Simulé' };

/** Les variables, sans ce qui ouvrirait une porte. Pur. */
function masquer(modele, variables) {
  const v = { ...(variables && typeof variables === 'object' ? variables : {}) };
  const masques = [];
  if (modele === 'code' && v.code) { v.code = '••••••'; masques.push('le code de connexion'); }
  for (const cle of ['lien']) {
    if (typeof v[cle] === 'string' && /[?&]i=[^&#]/.test(v[cle])) {
      v[cle] = v[cle].replace(/([?&]i=)[^&#]+/, '$1…');
      masques.push("le jeton du lien d'invitation");
    }
  }
  return { variables: v, masques };
}

/* Le rendu gardé dans la lettre : borné (un document Firestore ne
   dépasse pas un mégaoctet) et sans secret. Au-delà des bornes, seul
   l'objet est gardé, et le journal reconstitue le reste. */
const RENDU_MAX = { objet: 1000, html: 300000, texte: 100000 };
const MASQUE_CODE = '••••••';
const JETON = /([?&]i=)[^&#"'\s<>]+/g;

function masquerTexte(t, code) {
  let s = typeof t === 'string' ? t : '';
  if (code) s = s.split(code).join(MASQUE_CODE);
  return s.replace(JETON, '$1…');
}

/**
 * Ce que le facteur écrit dans « rendu », au moment de l'envoi. Pur.
 * Rend { objet, html, texte, masques, tronque }.
 */
function renduAGarder(envoi, courriel) {
  const e = envoi || {}; const c = courriel || {};
  const code = e.modele === 'code' && e.variables && e.variables.code ? String(e.variables.code) : '';
  const masques = [];
  if (code) masques.push('le code de connexion');
  if (/[?&]i=[^&#"'\s<>]/.test(`${c.objet || ''}${c.html || ''}${c.texte || ''}`)) masques.push("le jeton du lien d'invitation");
  const r = { objet: masquerTexte(c.objet, code), html: masquerTexte(c.html, code), texte: masquerTexte(c.texte, code) };
  const tronque = r.objet.length > RENDU_MAX.objet || r.html.length > RENDU_MAX.html || r.texte.length > RENDU_MAX.texte;
  if (tronque) return { objet: r.objet.slice(0, RENDU_MAX.objet), html: '', texte: '', masques, tronque: true };
  return { ...r, masques, tronque: false };
}

/* Un rendu enregistré utilisable : les trois parties en texte, complet. */
const renduValide = (r) => Boolean(r && typeof r === 'object' && !r.tronque
  && typeof r.objet === 'string' && typeof r.html === 'string' && typeof r.texte === 'string' && (r.html || r.texte));

/** La lettre telle qu'envoyée si le facteur l'a gardée, sinon refaite
 *  comme il l'a faite. Ne lève pas. provenance : 'enregistre' ou
 *  'reconstitue'. */
function rendre(envoi) {
  const r = envoi && envoi.rendu;
  if (renduValide(r)) {
    /* Masqué à l'écriture ; on repasse quand même, par prudence. */
    const code = envoi.modele === 'code' && envoi.variables && envoi.variables.code ? String(envoi.variables.code) : '';
    return {
      objet: masquerTexte(r.objet, code), html: masquerTexte(r.html, code), texte: masquerTexte(r.texte, code),
      masques: Array.isArray(r.masques) ? r.masques.map(String) : [], erreurRendu: '', provenance: 'enregistre', renduTronque: false,
    };
  }
  const { variables, masques } = masquer(envoi.modele, envoi.variables);
  const renduTronque = Boolean(r && r.tronque);
  try {
    return { ...courriels.rendre(envoi.modele, variables, { a: Array.isArray(envoi.a) ? envoi.a : [] }), masques, erreurRendu: '', provenance: 'reconstitue', renduTronque };
  } catch (err) {
    return { objet: '', html: '', texte: '', masques, erreurRendu: String((err && err.message) || err), provenance: 'reconstitue', renduTronque };
  }
}

const quand = (e) => enMillis(e.envoye) || enMillis(e.cree) || 0;
const destinataires = (e) => (Array.isArray(e.a) ? e.a : [])
  .filter((d) => d && d.email)
  .map((d) => ({ email: normaliserEmail(d.email), nom: String(d.nom || '').trim() }));

async function nomsDesProjets() {
  const q = await bdd.collection('projets').select('nom').get();
  return new Map(q.docs.map((d) => [d.id, String(d.data().nom || '')]));
}

/* Le nom du projet : celui de la fiche, sinon celui figé dans la lettre
   (« projet » y est un nom pour la maintenance et la relance). */
const nomProjetDe = (e, noms) => (e.projet && noms.get(e.projet))
  || String((e.variables || {}).projetNom || '').trim()
  || (e.projet ? '' : String((e.variables || {}).projet || '').trim());

/**
 * La liste, du plus récent au plus ancien, filtrée et découpée en pages.
 * filtres : { public, projet, destinataire, statut, page }
 */
async function lister(filtres = {}) {
  /* « Clients » quand rien n'est dit ; « tous » (ou une chaîne vide) pour
     tout voir. */
  const voulu = filtres.public === undefined || filtres.public === null ? 'client' : String(filtres.public);
  const pub = Object.prototype.hasOwnProperty.call(PUBLICS, voulu) ? voulu : '';
  const projet = filtres.projet ? String(filtres.projet) : '';
  const qui = filtres.destinataire ? normaliserEmail(filtres.destinataire) : '';
  const statut = Object.prototype.hasOwnProperty.call(ETATS, filtres.statut) ? filtres.statut : '';

  /* Toute la file, triée ici : une partie des lettres d'avant le 23/09/2026
     portent une date de création vide (le piège sansIndefini), qu'un tri
     par la base aurait écartées ou mal rangées. La file reste petite ;
     au-delà de quelques dizaines de milliers de lettres, il faudra une
     lecture par curseur. */
  const [q, noms] = await Promise.all([bdd.collection('envois').get(), nomsDesProjets()]);
  const toutes = q.docs.map((d) => ({ id: d.id, ...d.data() }))
    .map((e) => ({ e, public: publicDe(e), a: destinataires(e), quand: quand(e) }))
    .sort((x, y) => (y.quand - x.quand) || (x.e.id < y.e.id ? 1 : -1));

  /* Les comptes de chaque filtre se font sur les autres filtres : choisir
     un projet ne vide pas la liste des statuts. */
  const garde = (x, sauf) => (sauf === 'public' || !pub || x.public === pub)
    && (sauf === 'projet' || !projet || x.e.projet === projet)
    && (sauf === 'destinataire' || !qui || x.a.some((d) => d.email === qui))
    && (sauf === 'statut' || !statut || x.e.etat === statut);

  const compter = (sauf, cle) => {
    const n = new Map();
    for (const x of toutes) if (garde(x, sauf)) for (const k of [].concat(cle(x))) if (k) n.set(k, (n.get(k) || 0) + 1);
    return n;
  };
  const parPublic = compter('public', (x) => x.public);
  const parStatut = compter('statut', (x) => x.e.etat);
  const parProjet = compter('projet', (x) => x.e.projet || '');
  const parAdresse = compter('destinataire', (x) => x.a.map((d) => d.email));
  const nomDe = new Map();
  for (const x of toutes) for (const d of x.a) if (d.nom && !nomDe.has(d.email)) nomDe.set(d.email, d.nom);

  const retenues = toutes.filter((x) => garde(x, null));
  const pages = Math.max(1, Math.ceil(retenues.length / PAR_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(filtres.page) || 1)));
  const lignes = retenues.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map((x) => {
    const r = rendre(x.e);
    return {
      id: x.e.id,
      quand: x.quand || null,
      cree: enMillis(x.e.cree) || null,
      envoye: enMillis(x.e.envoye) || null,
      a: x.a,
      objet: r.objet || '',
      erreurRendu: r.erreurRendu,
      projet: x.e.projet || null,
      projetNom: nomProjetDe(x.e, noms),
      evenement: x.e.evenement || x.e.modele || '',
      evenementLibelle: libelleEvenement(x.e.evenement) || libelleEvenement(x.e.modele),
      modele: x.e.modele || '',
      public: x.public,
      etat: x.e.etat || '',
      essais: Number(x.e.essais || 0),
    };
  });

  return {
    ok: true,
    lignes,
    total: retenues.length,
    page,
    pages,
    parPage: PAR_PAGE,
    filtres: { public: pub, projet, destinataire: qui, statut },
    facettes: {
      publics: Object.entries(PUBLICS).map(([cle, libelle]) => ({ cle, libelle, n: parPublic.get(cle) || 0 })),
      statuts: Object.entries(ETATS).map(([cle, libelle]) => ({ cle, libelle, n: parStatut.get(cle) || 0 })),
      projets: [...parProjet.entries()].filter(([id]) => id)
        .map(([id, n]) => ({ id, nom: noms.get(id) || id, n }))
        .sort((x, y) => x.nom.localeCompare(y.nom, 'fr')),
      destinataires: [...parAdresse.entries()]
        .map(([email, n]) => ({ email, nom: nomDe.get(email) || '', n }))
        .sort((x, y) => (y.n - x.n) || x.email.localeCompare(y.email)),
    },
  };
}

/** Une lettre, telle que reçue, avec ses informations d'envoi. */
async function lire(id) {
  const cle = String(id || '');
  if (!cle || cle.includes('/')) throw new Refus(400, 'Identifiant de lettre requis.');
  const doc = await bdd.doc(`envois/${cle}`).get();
  if (!doc.exists) throw new Refus(404, "Cette lettre n'existe plus.");
  const e = { id: doc.id, ...doc.data() };
  const r = rendre(e);
  const noms = e.projet ? await nomsDesProjets() : new Map();
  return {
    ok: true,
    envoi: {
      id: e.id,
      objet: r.objet,
      html: r.html,
      texte: r.texte,
      masques: r.masques,
      erreurRendu: r.erreurRendu,
      provenance: r.provenance,
      renduTronque: r.renduTronque,
      a: destinataires(e),
      etat: e.etat || '',
      etatLibelle: ETATS[e.etat] || '',
      erreur: e.erreur ? String(e.erreur) : '',
      essais: Number(e.essais || 0),
      cree: enMillis(e.cree) || null,
      envoye: enMillis(e.envoye) || null,
      projet: e.projet || null,
      projetNom: nomProjetDe(e, noms),
      evenement: e.evenement || e.modele || '',
      evenementLibelle: libelleEvenement(e.evenement) || libelleEvenement(e.modele),
      modele: e.modele || '',
      public: publicDe(e),
      brevo: e.brevo ? String(e.brevo) : '',
    },
  };
}

module.exports = { lister, lire, publicDe, masquer, rendre, renduAGarder, RENDU_MAX, PUBLICS, ETATS, PAR_PAGE };
