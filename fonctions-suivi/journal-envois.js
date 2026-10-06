/* ==========================================================================
   CAPMEDIA CLIENT HUB · le journal des e-mails envoyés

   Ce que l'administrateur lit dans le Cockpit, page « E-mails envoyés » :
   chaque lettre déposée dans la file « envois », qu'elle soit partie, en
   file, en échec ou simulée sur le banc, et la lettre elle-même, telle que
   le destinataire l'a reçue.

   Le corps n'est pas gardé dans « envois » : le facteur (suivi.js,
   suiviFacteur) le fabrique au moment d'envoyer, avec courriels.rendre,
   depuis le modèle et les variables figés à la mise en file. Ce journal
   refait exactement le même appel sur les mêmes données. La lettre montrée
   sort donc du même gabarit que celle qui est partie ; seule une
   modification de courriels.js faite APRÈS l'envoi ferait une différence,
   et l'écran le dit.

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

/** La lettre, refaite comme le facteur l'a faite. Ne lève pas. */
function rendre(envoi) {
  const { variables, masques } = masquer(envoi.modele, envoi.variables);
  try {
    return { ...courriels.rendre(envoi.modele, variables), masques, erreurRendu: '' };
  } catch (err) {
    return { objet: '', html: '', texte: '', masques, erreurRendu: String((err && err.message) || err) };
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

module.exports = { lister, lire, publicDe, masquer, rendre, PUBLICS, ETATS, PAR_PAGE };
