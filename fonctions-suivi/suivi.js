/* ==========================================================================
   ESPACE DE SUIVI CLIENT · Fonctions serveur
   Contrat : docs/suivi.md

   suiviTicketCree       numérotation atomique, audit, accusé et alerte
   suiviTicketModifie    audit du changement réel, e-mail au bon public
   suiviMessageCree      e-mail à l'autre partie, jamais sur une note interne
   suiviDocumentCree     devis ou facture déposé, e-mail au client
   suiviDocumentModifie  réponse du client à un devis, e-mail à l'équipe
   suiviFacteur          la file « envois » partie chez Brevo
   suiviAdmin            ce que le navigateur n'a pas le droit de faire,
                         sur l'identité Firebase de l'appelant (acces.js)

   Deux principes gouvernent ce fichier.

   1. Une panne d'e-mail ne casse jamais une écriture métier. Les
      déclencheurs n'envoient rien eux-mêmes : ils déposent une ligne dans
      « envois », et le facteur s'en occupe. Un Brevo indisponible laisse
      donc le ticket intact, avec une trace exploitable.
   2. Tout ce qui engage (numéro, journal d'audit, revendications du jeton)
      est refusé au navigateur par les règles, et ne s'écrit qu'ici.
   ========================================================================== */

const v2firestore = require('firebase-functions/v2/firestore');
const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const courriels = require('./courriels');
const robot = require('./robot');
const acces = require('./acces');
const communication = require('./communication');
/* Chaque déclencheur décide « au moment » de son événement : un fait
   survenu projet fermé, ou e-mails coupés, ne part pas plus tard parce que
   l'état a changé entre-temps (voir communication.auMoment). */
const { evenementDuSemis, instantEvenement } = require('./commun');
const auMomentDe = (fn) => async (evenement) => {
  /* Banc d'essai seulement : un événement né pendant la pose d'une base de
     test n'a rien à faire (voir commun.evenementDuSemis). */
  if (await evenementDuSemis(evenement)) return undefined;
  return communication.auMoment(instantEvenement(evenement), () => fn(evenement));
};
const onDocumentCreated = (o, fn) => v2firestore.onDocumentCreated(o, auMomentDe(fn));
const onDocumentUpdated = (o, fn) => v2firestore.onDocumentUpdated(o, auMomentDe(fn));
const onDocumentWritten = (o, fn) => v2firestore.onDocumentWritten(o, auMomentDe(fn));
const invitations = require('./invitations');
const { Refus, cleEmail } = require('./commun');

/* index.js initialise déjà l'application ; la garde permet de charger ce
   module seul (script de vérification, émulateur, test unitaire). */
if (!getApps().length) initializeApp();
const bdd = getFirestore();

const REGION = 'europe-west1';

const BREVO_CLE = defineSecret('BREVO_CLE');

/* L'adresse qui reçoit toutes les alertes internes. */
const EQUIPE_EMAIL = 'contact@capmedia.app';
const EQUIPE_NOM   = 'Équipe Capmedia';

const EXPEDITEUR = { email: 'contact@capmedia.app', nom: 'Capmedia Digital' };

/* Trois essais, pas un de plus : un modèle cassé ou une adresse morte ne
   doit jamais boucler aux frais du projet. */
const ESSAIS_MAX = 3;

/* Les DOUZE statuts de noyau.js, pas sept. Les cinq qui manquaient
   (« à analyser », « acceptée », « planifiée », « en revue », « annulée »)
   n'envoyaient aucune lettre et écrivaient « Statut inconnu » en erreur :
   le client ne savait donc rien des cinq étapes du milieu. */
const STATUTS_CONNUS = ['nouveau', 'a-analyser', 'en-attente-client', 'acceptee',
  'planifiee', 'en-cours', 'en-revue', 'a-valider', 'resolu', 'refuse',
  'annulee', 'ferme'];

/* ==========================================================================
   0. Outils communs
   ========================================================================== */

const normaliserEmail = (valeur) => String(valeur || '').trim().toLowerCase();
const emailPlausible = (valeur) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliserEmail(valeur));
const memeEmail = (a, b) => normaliserEmail(a) === normaliserEmail(b);
const patienter = (ms) => new Promise((suite) => setTimeout(suite, ms));

/**
 * Firestore refuse une valeur indéfinie. Les variables d'un e-mail sont
 * assemblées à partir de champs facultatifs : on les nettoie avant l'écriture
 * plutôt que de multiplier les « || null » à l'appel.
 */
/* Voir hub.js : une marque du serveur (date, incrément, union) est un objet
   qu'il ne faut surtout pas parcourir, sous peine de l'écrire vide. */
const marqueServeur = (v) => v instanceof Date
  || (v && typeof v === 'object'
      && (typeof v.toDate === 'function'
          || typeof v.isEqual === 'function'
          || v.constructor === undefined
          || (v.constructor && v.constructor.name && v.constructor.name !== 'Object')));

function sansIndefini(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map(sansIndefini).filter((v) => v !== undefined);
  }
  if (valeur && typeof valeur === 'object' && !marqueServeur(valeur)) {
    const propre = {};
    for (const [clef, v] of Object.entries(valeur)) {
      const nettoye = sansIndefini(v);
      if (nettoye !== undefined) propre[clef] = nettoye;
    }
    return propre;
  }
  return valeur;
}

/**
 * Dépose un e-mail dans la file. Ne lève jamais : l'appelant est un
 * déclencheur dont l'échec ferait rejouer une écriture métier déjà faite.
 */
/* La trace d'un geste d'administration. Les invitations en laissent une :
   un lien qui pre-remplit une adresse doit pouvoir se retrouver. */
async function audit(action, details) {
  try {
    await bdd.collection('audit').add({ action, ...details, date: FieldValue.serverTimestamp() });
  } catch (err) { console.error('Audit non écrit', err); }
}

/* La file d'envoi, et la décision de qui reçoit quoi, vivent dans
   communication.js : un seul endroit répond à « doit-on écrire à cette
   personne, pour cet événement ? ». */
const mettreEnFile = (modele, destinataires, variables, trace) => communication.mettreEnFile(modele, destinataires, variables, trace);

/** Le journal d'audit est la mémoire du ticket : son échec doit se voir. */
async function journaliser(ticketId, evenement) {
  try {
    await bdd.collection(`tickets/${ticketId}/evenements`).add(sansIndefini({
      type: evenement.type,
      avant: evenement.avant ?? null,
      apres: evenement.apres ?? null,
      par: evenement.par || { uid: null, nom: EQUIPE_NOM, cote: 'equipe' },
      date: FieldValue.serverTimestamp(),
    }));
  } catch (err) {
    console.error(`Audit « ${evenement.type} » non écrit sur le ticket ${ticketId}`, err);
  }
}

/** Le projet, ou null. Un projet manquant est une anomalie, pas un silence. */
async function lireProjet(projetId) {
  if (!projetId) return null;
  try {
    const doc = await bdd.doc(`projets/${String(projetId)}`).get();
    if (!doc.exists) {
      console.error(`Projet inconnu : ${projetId}`);
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error(`Lecture du projet ${projetId} impossible`, err);
    return null;
  }
}

async function lireTicket(ticketId) {
  try {
    const doc = await bdd.doc(`tickets/${ticketId}`).get();
    if (!doc.exists) {
      console.error(`Ticket inconnu : ${ticketId}`);
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error(`Lecture du ticket ${ticketId} impossible`, err);
    return null;
  }
}

/* L'adresse de l'équipe, pour ses alertes. Les clients, eux, ne se
   lisent plus sur la fiche du projet : voir communication.js. */
const contactsEquipe = () => communication.contactsEquipe();

/** Le nom du client, pour l'en-tête d'un e-mail. */
const nomClient = (projet) => ((projet && projet.client && projet.client.nom) || '');
const nomProjet = (projet) => ((projet && projet.nom) || '');

/* ==========================================================================
   1. Création d'un ticket : le numéro, l'audit, les deux e-mails
   ========================================================================== */

/**
 * Attribue REF-NNN dans une transaction. Le compteur du projet est la seule
 * source de vérité : deux tickets créés à la même seconde ne peuvent pas
 * porter le même numéro, et un déclencheur rejoué n'en consomme pas un
 * deuxième (le ticket déjà numéroté est rendu tel quel).
 */
async function attribuerNumero(ticketId, projetId) {
  const ticketRef = bdd.doc(`tickets/${ticketId}`);
  const projetRef = bdd.doc(`projets/${projetId}`);

  return bdd.runTransaction(async (t) => {
    const [ticketDoc, projetDoc] = await Promise.all([t.get(ticketRef), t.get(projetRef)]);
    if (!ticketDoc.exists) throw new Error(`Ticket ${ticketId} disparu avant numérotation`);
    if (!projetDoc.exists) throw new Error(`Projet ${projetId} inconnu, numérotation impossible`);

    const projet = { id: projetDoc.id, ...projetDoc.data() };
    const dejaNumerote = ticketDoc.data().numero;
    if (dejaNumerote) return { numero: dejaNumerote, projet, nouveau: false };

    const suivant = Number(projet.compteur || 0) + 1;
    const prefixe = String(projet.ref || 'PROJET').trim().toUpperCase();
    const numero = `${prefixe}-${String(suivant).padStart(3, '0')}`;

    t.update(projetRef, { compteur: suivant, maj: FieldValue.serverTimestamp() });
    t.update(ticketRef, { numero, maj: FieldValue.serverTimestamp() });
    return { numero, projet, nouveau: true };
  });
}

exports.suiviTicketCree = onDocumentCreated(
  { region: REGION, document: 'tickets/{ticketId}' },
  async (evenement) => {
    const instantane = evenement.data;
    if (!instantane) return;

    const ticketId = evenement.params.ticketId;
    const ticket = instantane.data();
    if (!ticket) return;
    const auteur = ticket.auteur || {};

    /* Le numéro d'abord : c'est lui qui donne son identité au ticket, et il
       figure dans l'objet des deux e-mails. */
    let numero = ticket.numero || null;
    let projet = null;
    try {
      const resultat = await attribuerNumero(ticketId, ticket.projet);
      numero = resultat.numero;
      projet = resultat.projet;
    } catch (err) {
      console.error(`Numérotation du ticket ${ticketId} échouée`, err);
      projet = await lireProjet(ticket.projet);
    }

    await journaliser(ticketId, {
      type: 'creation',
      avant: null,
      apres: numero || ticketId,
      par: { uid: auteur.uid || null, nom: auteur.nom || '', cote: auteur.cote || 'client' },
    });

    const lien = courriels.lienTicket(ticketId);
    const communes = {
      numero,
      titre: ticket.titre,
      description: ticket.description,
      type: ticket.type,
      urgence: ticket.urgence,
      plateforme: ticket.plateforme,
      version: ticket.version,
      projetNom: nomProjet(projet),
      lien,
    };

    /* L'accusé au client, puis l'alerte à l'équipe : deux envois distincts,
       parce que les deux lettres ne disent pas la même chose.

       Une demande ouverte DEPUIS LE COCKPIT porte l'équipe comme auteur :
       la lettre disait alors au client « Bonjour Équipe Capmedia, nous
       avons bien reçu votre demande ». On la lui adresse à son nom, et on
       dit ce qui s'est vraiment passé. */
    /* Une lettre par interlocuteur, qui salue chacun par son nom : avant,
       l'accusé saluait l'auteur et partait tel quel à tous ses collègues. */
    await communication.ecrireAuxClients(projet, 'ticket-cree', 'ticket-cree', {
      ...communes,
      parLEquipe: (auteur && auteur.cote) === 'equipe',
      cote: 'client',
      clientNom: auteur.nom || nomClient(projet),
    }, { parDestinataire: true });

    await mettreEnFile('ticket-cree', contactsEquipe(), {
      ...communes,
      cote: 'equipe',
      auteurNom: auteur.nom || '',
      auteurEmail: auteur.email || '',
    }, { projet: projet && projet.id, evenement: 'ticket-cree' });

    console.log(`Ticket ${numero || ticketId} créé sur ${nomProjet(projet) || ticket.projet}`);
  },
);

/* ==========================================================================
   2. Modification d'un ticket : un audit par changement réel
   ========================================================================== */

/**
 * Les deux seules transitions que les règles autorisent au client. Les
 * reconnaître évite de lui annoncer par e-mail ce qu'il vient de faire, et
 * permet au contraire de prévenir l'équipe.
 */
const TRANSITIONS_CLIENT = [
  ['a-valider', 'resolu'],   // le client valide la correction livrée
  ['a-valider', 'en-cours'], // « pas tout à fait » : elle ne tient pas
  ['resolu', 'en-cours'],    // le client rouvre dans les sept jours
];

/* La demande qui repart après la réponse du client : le serveur pose la
   marque « repart » en même temps que le statut. L'équipe peut faire le
   même passage à la main, sans la marque : ce n'est alors pas le client. */
const repartParClient = (avant, apres) => avant.statut === 'en-attente-client' && apres.statut === 'en-cours'
  && Boolean(apres.repart) && String(avant.repart || '') !== String(apres.repart);

const changementDuClient = (avant, apres) =>
  TRANSITIONS_CLIENT.some(([de, vers]) => avant === de && apres === vers);

/* « Je n'en ai plus besoin » : le client retire sa demande tant qu'elle
   est chez nous. Sa marque « lu.client » bouge avec le statut ; l'équipe,
   qui annule depuis le pilotage, ne la touche pas (même repère que hub.js). */
const retireeParClient = (avant, apres) => ['nouveau', 'a-analyser', 'acceptee', 'planifiee'].includes(avant.statut) && apres.statut === 'annulee'
  && String((avant.lu || {}).client || '') !== String((apres.lu || {}).client || '');

/**
 * Le document de ticket ne garde pas la trace de qui l'a écrit : l'auteur
 * du changement est donc déduit de la transition. Hors transition réservée
 * au client, seule l'équipe a le droit d'écrire, d'après les règles.
 */
function auteurChangement(ticket, parLeClient) {
  if (parLeClient) {
    const auteur = ticket.auteur || {};
    return { uid: auteur.uid || null, nom: auteur.nom || 'Client', cote: 'client' };
  }
  return { uid: null, nom: EQUIPE_NOM, cote: 'equipe' };
}

exports.suiviTicketModifie = onDocumentUpdated(
  { region: REGION, document: 'tickets/{ticketId}' },
  async (evenement) => {
    const avant = evenement.data.before.data();
    const apres = evenement.data.after.data();
    if (!avant || !apres) return;

    const ticketId = evenement.params.ticketId;

    /* Ce qui a bougé, et rien d'autre. Poser le numéro, marquer comme lu ou
       joindre un fichier ne sont pas des changements notables : ils ne
       produisent ni audit ni e-mail, ce qui évite aussi que l'écriture du
       numéro par la fonction précédente déclenche une notification. */
    const changements = [];
    if (avant.statut !== apres.statut) {
      changements.push({ type: 'statut', avant: avant.statut || null, apres: apres.statut || null });
    }
    if (avant.urgence !== apres.urgence) {
      changements.push({ type: 'urgence', avant: avant.urgence || null, apres: apres.urgence || null });
    }
    if ((avant.assigne || null) !== (apres.assigne || null)) {
      changements.push({ type: 'assignation', avant: avant.assigne || null, apres: apres.assigne || null });
    }
    if (Boolean(avant.archive) !== Boolean(apres.archive)) {
      changements.push({ type: 'archive', avant: String(Boolean(avant.archive)), apres: String(Boolean(apres.archive)) });
    }
    if (!changements.length) return;

    const changeStatut = changements.find((c) => c.type === 'statut');
    const repart = Boolean(changeStatut) && repartParClient(avant, apres);
    const parLeClient = Boolean(changeStatut)
      && (changementDuClient(changeStatut.avant, changeStatut.apres) || repart || retireeParClient(avant, apres));
    const par = auteurChangement(apres, parLeClient);

    for (const changement of changements) {
      await journaliser(ticketId, { ...changement, par });
    }

    const projet = await lireProjet(apres.projet);
    const lien = courriels.lienTicket(ticketId);
    const communes = {
      numero: apres.numero,
      titre: apres.titre,
      type: apres.type,
      urgence: apres.urgence,
      statut: apres.statut,
      projetNom: nomProjet(projet),
      lien,
    };

    for (const changement of changements) {
      /* L'urgence et l'archive sont des réglages internes : le client n'a
         pas à recevoir un e-mail parce que nous avons reclassé son ticket. */
      if (changement.type === 'urgence' || changement.type === 'archive') continue;

      if (changement.type === 'statut') {
        await notifierStatut(apres, changement, { projet, communes, parLeClient, repart });
        continue;
      }

      if (changement.type === 'assignation') {
        /* Un désassignement ne s'annonce à personne : l'audit suffit. */
        if (!changement.apres) continue;
        /* Un membre désactivé, ou un agent hors de ce projet, ne reçoit
           rien : l'assignation reste dans le journal, sans lettre. */
        const assigne = await communication.contactEquipe(changement.apres, apres.projet);
        if (!assigne) continue;
        await mettreEnFile('assignation', [assigne], {
          ...communes,
          assigneNom: assigne.nom,
        });
      }
    }
  },
);

/** Le bon modèle pour un changement de statut, vers le bon public. */
async function notifierStatut(ticket, changement, contexte) {
  const { projet, communes, parLeClient, repart } = contexte;

  if (!STATUTS_CONNUS.includes(String(changement.apres))) {
    console.error(`Statut inconnu sur le ticket ${ticket.numero || ''} : ${changement.apres}`);
    return;
  }

  /* Le client vient d'agir lui-même : c'est l'équipe qu'il faut prévenir. */
  if (parLeClient) {
    /* Sa réponse a déjà prévenu l'équipe (lettre du message) : la demande
       qui repart ne mérite pas une seconde lettre. */
    if (repart) return;
    await mettreEnFile('statut', contactsEquipe(), {
      ...communes,
      cote: 'equipe',
      statutAvant: changement.avant,
      statutApres: changement.apres,
      clientNom: nomClient(projet),
    });
    return;
  }

  if (changement.apres === 'resolu') {
    await communication.ecrireAuxClients(projet, 'resolu', 'resolu', {
      ...communes,
      clientNom: nomClient(projet),
      date: ticket.resolu || null,
    });
    return;
  }

  if (changement.apres === 'ferme') {
    await communication.ecrireAuxClients(projet, 'ferme', 'ferme', {
      ...communes,
      clientNom: nomClient(projet),
      date: ticket.maj || null,
    });
    return;
  }

  await communication.ecrireAuxClients(projet, 'statut', 'statut', {
    ...communes,
    cote: 'client',
    statutAvant: changement.avant,
    statutApres: changement.apres,
    clientNom: nomClient(projet),
  });
}

/* ==========================================================================
   3. Nouveau message : l'autre partie est prévenue
   ========================================================================== */

exports.suiviMessageCree = onDocumentCreated(
  { region: REGION, document: 'tickets/{ticketId}/messages/{messageId}' },
  async (evenement) => {
    const instantane = evenement.data;
    if (!instantane) return;

    const message = instantane.data();
    if (!message) return;
    const ticketId = evenement.params.ticketId;

    /* Une note interne reste entre nous : aucun e-mail, dans aucun sens. */
    if (message.interne === true) {
      console.log(`Note interne sur le ticket ${ticketId}, aucun e-mail`);
      return;
    }

    const ticket = await lireTicket(ticketId);
    if (!ticket) return;
    const projet = await lireProjet(ticket.projet);

    const de = message.de || {};
    const versEquipe = de.cote === 'client';
    const variables = {
      numero: ticket.numero,
      titre: ticket.titre,
      statut: ticket.statut,
      projetNom: nomProjet(projet),
      auteurNom: de.nom || '',
      cote: versEquipe ? 'equipe' : 'client',
      texte: message.texte,
      lien: courriels.lienTicket(ticketId),
    };
    if (versEquipe) await mettreEnFile('message', contactsEquipe(), variables, { projet: projet && projet.id, evenement: 'message' });
    else await communication.ecrireAuxClients(projet, 'message', 'message', variables);
  },
);

/* ==========================================================================
   4. Devis et factures
   ========================================================================== */

exports.suiviDocumentCree = onDocumentCreated(
  { region: REGION, document: 'documents/{documentId}' },
  async (evenement) => {
    const instantane = evenement.data;
    if (!instantane) return;

    const document = instantane.data();
    if (!document) return;
    if (document.type !== 'devis' && document.type !== 'facture') {
      console.error(`Document ${evenement.params.documentId} de type inattendu : ${document.type}`);
      return;
    }
    /* Une demande de devis née du calculateur des axes vient du client :
       c'est l'équipe qu'on prévient (hubDocumentActivite), pas lui. Le
       client sera prévenu quand le vrai devis y sera joint. */
    if (document.statut === 'demande') return;
    await annoncerPiece(document, evenement.params.documentId);
  },
);

/* « Nouveau devis », « Nouvelle facture » : la boîte et la lettre des
   responsables du projet. À la création d'une pièce, et quand l'équipe
   joint le devis d'une demande du calculateur. */
async function annoncerPiece(document, documentId) {
  /* Une pièce comptable engage : elle ne part qu'aux responsables du
     projet, jamais à un collaborateur (voir communication.js). */
  const projet = await lireProjet(document.projet);
  const lienPiece = `/finances/${documentId}`;
  /* Dans le Hub aussi, et aux responsables seulement (l'événement
     « devis » ou « facture » est réservé au responsable) : sans cette
     notification, le client ne découvrait la pièce que par la lettre. */
  await communication.notifierClients(projet, document.type, {
    type: document.type,
    titre: document.type === 'devis' ? 'Nouveau devis' : 'Nouvelle facture',
    texte: `${document.numero || ''} · ${document.libelle || ''}`.replace(/^ · /, ''),
    lien: `#${lienPiece}`, projet: document.projet,
  });
  await communication.ecrireAuxClients(projet, document.type, document.type, {
    numero: document.numero,
    libelle: document.libelle,
    montant: document.montant,
    tva: document.tva,
    /* La lettre annonce le TTC, ce que le client doit vraiment ; le HT
       reste entre parenthèses. */
    ttc: typeof document.ttc === 'number' ? document.ttc : (Number(document.montant) || 0) * (1 + (Number(document.tva) || 0) / 100),
    /* Un devis range sa date de validité dans « expiration », une facture
       dans « echeance » : la lettre lisait toujours « echeance », donc la
       ligne « Valable jusqu'au » d'un devis était toujours vide. */
    echeance: (document.type === 'devis' ? document.expiration : document.echeance) || null,
    projetNom: nomProjet(projet),
    clientNom: nomClient(projet),
    /* La lettre mène à la pièce elle-même, dans « Devis et factures » :
       la page du projet n'a pas les boutons Accepter et Refuser. */
    lien: `${courriels.BASE}hub#/finances/${encodeURIComponent(documentId)}`,
    avecPdf: Boolean(document.fichier && document.fichier.chemin),
  });

  console.log(`${document.type === 'devis' ? 'Devis' : 'Facture'} ${document.numero || documentId} déposé`);
}

/* Le devis d'une demande du calculateur est accepté : chaque ligne de la
   photo devient une étape de la feuille de route, rattachée au devis
   (les mêmes étapes que « les lignes du devis » du Cockpit), avec sa part
   du montant HT au prorata des jours ; chaque axe passe « Au programme ».
   Rejouée, elle ne double rien. */
async function etapesDuPanier(documentId, devis) {
  const projetId = devis.projet;
  const lignes = ((devis.photo || {}).lignes || []).filter((l) => l && l.titre);
  if (!projetId || !lignes.length) return;
  const etapes = bdd.collection(`projets/${projetId}/jalons`);
  const deja = await etapes.get();
  if (deja.docs.some((j) => j.data().devis === documentId)) return;
  const totalJours = lignes.reduce((n, l) => n + (Number(l.jours) || 0), 0);
  const ht = Number(devis.montant);
  let reste = Number.isFinite(ht) ? Math.round(ht) : null;
  const avecJours = lignes.filter((l) => Number(l.jours) > 0);
  const lot = bdd.batch();
  lignes.forEach((l, k) => {
    const ref = etapes.doc();
    lot.set(ref, {
      projet: projetId, titre: String(l.titre).slice(0, 120), description: '', phase: String(devis.libelle || 'Axes d\'évolution').slice(0, 160),
      statut: 'a-venir', progression: 0, debut: null, fin: null, composants: [], responsable: '', dependances: [],
      ordre: deja.size + k + 1, devis: documentId, axe: String(l.axe || ''), reports: [],
      cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
    });
    /* La part de la ligne : au prorata des jours ; la dernière ligne
       chiffrée prend l'arrondi, pour que la somme fasse le devis. */
    if (reste !== null && totalJours > 0 && Number(l.jours) > 0) {
      const derniere = avecJours[avecJours.length - 1] === l;
      const part = derniere ? reste : Math.round(ht * (Number(l.jours) / totalJours));
      reste -= part;
      lot.set(bdd.doc(`projets/${projetId}/montants/jalon-${ref.id}`), { projet: projetId, montant: part, maj: FieldValue.serverTimestamp() });
    }
  });
  for (const l of lignes) {
    if (!l.axe) continue;
    const axe = bdd.doc(`projets/${projetId}/axes/${String(l.axe)}`);
    // eslint-disable-next-line no-await-in-loop
    if ((await axe.get()).exists) lot.update(axe, { etat: 'prevu', devis: documentId, maj: FieldValue.serverTimestamp() });
  }
  await lot.commit();
  console.log(`Devis ${devis.numero || documentId} accepté : ${lignes.length} étape(s) posée(s) depuis le calculateur`);
}

/*
 * Le profil public d'un testeur.
 *
 * Le client doit pouvoir lire QUI a donné un avis sans savoir QUI c'est :
 * un avis de 22 ans et un avis de 55 ans ne disent pas la même chose, et
 * masquer le profil le priverait de l'essentiel. Mais il n'a aucune raison
 * de connaître le nom ni l'adresse de qui teste pour lui.
 *
 * On recopie donc le seul profil dans une sous-collection lisible, et
 * jamais le reste. La recopie vaut mieux qu'une règle qui filtrerait les
 * champs : Firestore sert un document entier ou rien, et une règle ne
 * masque pas un champ.
 */
exports.suiviProfilTesteur = onDocumentWritten(
  { region: REGION, document: 'testeurs/{testeurId}' },
  async (evenement) => {
    const id = evenement.params.testeurId;
    const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
    const apres = evenement.data.after.exists ? evenement.data.after.data() : null;

    /* Le profil sans nom vit désormais SOUS CHAQUE PROJET où le testeur est
       inscrit (projets/<p>/profilsTesteurs/<uid>) : le client d'un projet
       ne lit que les testeurs de son projet, et le document ne dit rien des
       autres projets du testeur. L'ancien profil commun, lisible par tout
       compte connecté avec la liste des projets de tous les clients, est
       effacé à chaque passage. */
    try { await bdd.doc(`testeurs/${id}/public/profil`).delete(); } catch (err) { /* déjà parti */ }

    /* Un testeur retiré (fiche inactive) ou supprimé n'a plus de profil
       nulle part : le client ne le compte plus parmi ceux qui testent. */
    const actif = Boolean(apres) && apres.actif !== false;
    const projetsApres = actif ? (Array.isArray(apres.projets) ? apres.projets.filter(Boolean).map(String) : []) : [];
    const projetsAvant = avant && Array.isArray(avant.projets) ? avant.projets.filter(Boolean).map(String) : [];
    const aRetirer = [...new Set(projetsAvant)].filter((p) => !projetsApres.includes(p));

    for (const p of aRetirer) {
      try { await bdd.doc(`projets/${p}/profilsTesteurs/${id}`).delete(); } catch (err) { /* déjà parti */ }
    }
    if (!actif) return;
    const profil = apres.profil || {};
    for (const p of [...new Set(projetsApres)]) {
      try {
        /* Le profil que le client lit : ce que le testeur est, jamais qui il
           est. Ses appareils, résumés (une plateforme, un modèle, un
           système), disent sur quoi les résultats ont été obtenus. */
        const appareils = (Array.isArray(apres.appareils) ? apres.appareils : [])
          .filter((a) => a && a.confirme !== false)
          .slice(0, 10)
          .map((a) => ({ plateforme: String(a.plateforme || ''), modele: String(a.modele || '').slice(0, 80), os: String(a.os || '').slice(0, 80) }));
        await bdd.doc(`projets/${p}/profilsTesteurs/${id}`).set({
          sexe: profil.sexe || '', age: profil.age || '', fonction: profil.fonction || '',
          expertise: profil.expertise || '',
          aisance: profil.aisance || '', langue: profil.langue || '',
          mobile: apres.mobile || '',
          plateformes: apres.plateformes || [],
          appareils,
          ficheValidee: apres.ficheValidee || null,
          maj: FieldValue.serverTimestamp(),
        });
      } catch (err) { console.error(`Profil du testeur ${id} non recopié sur ${p}`, err); }
    }
  },
);

/**
 * Un échec de testeur devient une anomalie, tout seul.
 *
 * Le testeur répond KO, joint sa capture, et s'arrête là : ce n'est pas
 * son travail de qualifier. Ici, l'échec est rangé sous une anomalie par
 * SCÉNARIO : plusieurs testeurs qui échouent au même endroit font une
 * seule anomalie avec plusieurs témoins, pas trois lignes qui disent la
 * même chose. C'est ce que la page promet au client.
 *
 * L'anomalie naît « nouvelle », gravité « important » : c'est à l'équipe
 * de la reproduire puis de trancher, et la proposition dit que rien n'est
 * validé sans reproduction. Un KO qui revient sur une anomalie déjà
 * corrigée la rouvre : c'est une régression, et c'est la pire nouvelle,
 * donc la plus visible.
 *
 * Les témoins sont recopiés dans l'anomalie (qui, sur quoi, quand, le
 * commentaire, les preuves) pour que le Hub n'ait rien d'autre à lire.
 */
/* L'identifiant d'un passage : « <uid>__<scénario>__<plateforme> » (le
   modèle du plan), ou « <uid>__<scénario> » (avant le plan). */
const passageCoherent = (passageId, p) => {
  const base = `${p.testeur || ''}__${p.scenario}`;
  return Boolean(p.testeur) && (passageId === `${base}__${p.plateforme || ''}` || passageId === base);
};

/* Le scénario d'un passage, s'il existe : dans le plan de tests
   (« <section>-<f|t|u|s>-<nnn> », rangé dans planTests/<section> sous son
   aspect), sinon dans l'ancienne bibliothèque. Rend { titre, bloc } ou null. */
const ASPECT_DE_LETTRE = { f: 'fonctionnel', t: 'technique', u: 'ux', s: 'securite' };
const scenarioConnu = async (projetId, p) => {
  const plan = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([ftus])-\d{3}$/.exec(p.scenario);
  if (plan) {
    const section = await bdd.doc(`projets/${projetId}/planTests/${plan[1]}`).get();
    const liste = section.exists ? (((section.data() || {}).aspects || {})[ASPECT_DE_LETTRE[plan[2]]] || []) : [];
    const x = Array.isArray(liste) ? liste.find((y) => y && y.id === p.scenario) : null;
    if (x) return { titre: String(x.titre || ''), bloc: plan[1] };
  }
  if (p.scenario.includes('/')) return null;
  const ancien = await bdd.doc(`projets/${projetId}/scenarios/${p.scenario}`).get();
  return ancien.exists ? { titre: ancien.data().titre || '', bloc: ancien.data().bloc || '' } : null;
};

exports.suiviPassageKo = onDocumentWritten(
  { region: REGION, document: 'projets/{projetId}/campagnes/{campagneId}/passages/{passageId}' },
  async (evenement) => {
    const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
    /* « echec » : le verdict du modèle des passages ; « ko » : l'ancien,
       encore porté par les passages d'avant le plan. */
    if (!apres || !['echec', 'ko'].includes(apres.resultat) || typeof apres.scenario !== 'string' || !apres.scenario) return;
    /* Seul un geste du TESTEUR fait un témoin, et un testeur qui écrit
       pose toujours une date neuve (« maj », ou « le » sur un ancien
       passage). Le serveur qui marque le passage « à rejouer », ou
       l'équipe qui le rattache à une anomalie, laisse la date intacte :
       sans cette garde, marquer un KO corrigé rouvrait aussitôt
       l'anomalie en régression. */
    const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
    const dateAvant = avant && (avant.maj || avant.le);
    const dateApres = apres.maj || apres.le;
    if (dateAvant && dateApres && typeof dateAvant.isEqual === 'function' && dateAvant.isEqual(dateApres)) return;
    const { projetId, campagneId, passageId } = evenement.params;

    /* La garde serveur. Une anomalie part chez le client (activité,
       courriel, notification) : elle ne naît que d'un passage dont
       l'identifiant colle au testeur et au scénario, et d'un scénario qui
       existe vraiment, dans le plan ou dans l'ancienne bibliothèque. Un
       texte inventé n'invente plus « Échec sur … ». */
    const scenario = await scenarioConnu(projetId, apres);
    if (!passageCoherent(passageId, apres) || !scenario) {
      console.warn('Passage en échec ignoré : scénario inconnu ou identifiant incohérent', projetId, campagneId, passageId);
      return;
    }

    const ref = bdd.doc(`projets/${projetId}/anomalies/ko-${apres.scenario}`);
    const le = dateApres && dateApres.toDate ? dateApres.toDate() : new Date();
    const temoin = {
      passage: `${campagneId}/${passageId}`, campagne: campagneId,
      testeur: apres.testeur || '', plateforme: apres.plateforme || '',
      commentaire: apres.commentaire || '', preuves: apres.preuves || [],
      appareil: (apres.contexte && apres.contexte.appareil) || '', le,
    };

    try {
      await bdd.runTransaction(async (t) => {
        const d = await t.get(ref);
        if (!d.exists) {
          t.set(ref, {
            titre: scenario.titre || apres.scenario,
            scenario: apres.scenario, bloc: scenario.bloc || '',
            gravite: 'important', statut: 'nouvelle', origine: 'testeur',
            description: '', passages: [temoin.passage], temoins: [temoin],
            plateformes: temoin.plateforme ? [temoin.plateforme] : [],
            cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
          });
          return;
        }
        const x = d.data();
        const deja = (x.passages || []).includes(temoin.passage);
        const maj = { maj: FieldValue.serverTimestamp(), passages: FieldValue.arrayUnion(temoin.passage) };
        if (temoin.plateforme) maj.plateformes = FieldValue.arrayUnion(temoin.plateforme);
        /* Le même testeur qui corrige son commentaire ne fait pas un second
           témoin : on remplace le sien. */
        maj.temoins = (x.temoins || []).filter((w) => w.passage !== temoin.passage).concat([temoin]);
        if (['corrigee', 'sans-suite'].includes(x.statut)) {
          maj.statut = 'nouvelle';
          maj.retours = FieldValue.increment(1);
        }
        void deja;
        t.update(ref, maj);
      });
    } catch (err) { console.error('Anomalie non posée depuis le passage', err); }
  },
);

/**
 * Une anomalie corrigée se rejoue.
 *
 * Quand l'équipe passe une anomalie en « corrigée », chaque KO qui en
 * témoigne dans une campagne EN COURS est marqué « à rejouer ». Le testeur
 * le voit en orange sur son tableau, sans jamais lire l'anomalie : la
 * marque arrive sur SON passage, pas sur la campagne, où il lirait les
 * échecs des autres. En rejouant, il réécrit son passage et la marque
 * tombe ; un nouveau KO rouvre l'anomalie en régression.
 *
 * Si l'équipe revient sur sa décision, la marque est retirée.
 */
exports.suiviAnomalieCorrigee = onDocumentUpdated(
  { region: REGION, document: 'projets/{projetId}/anomalies/{anomalieId}' },
  async (evenement) => {
    const avant = evenement.data.before.data() || {};
    const apres = evenement.data.after.data() || {};
    const corrigee = apres.statut === 'corrigee';
    if ((avant.statut === 'corrigee') === corrigee) return;
    const { projetId } = evenement.params;

    const campagnes = new Map();
    for (const t of apres.temoins || []) {
      if (!t.passage || !t.campagne) continue;
      if (!campagnes.has(t.campagne)) {
        const c = await bdd.doc(`projets/${projetId}/campagnes/${t.campagne}`).get();
        campagnes.set(t.campagne, c.exists && c.data().statut === 'en-cours');
      }
      if (!campagnes.get(t.campagne)) continue;
      const ref = bdd.doc(`projets/${projetId}/campagnes/${t.passage.replace('/', '/passages/')}`);
      try {
        const p = await ref.get();
        if (!p.exists || !['echec', 'ko'].includes(p.data().resultat)) continue;
        await ref.update(corrigee ? { aRevoir: true } : { aRevoir: FieldValue.delete() });
      } catch (err) { console.error('Passage à rejouer non marqué', t.passage, err); }
    }
  },
);

exports.suiviDocumentModifie = onDocumentUpdated(
  { region: REGION, document: 'documents/{documentId}' },
  async (evenement) => {
    const avant = evenement.data.before.data();
    const apres = evenement.data.after.data();
    if (!avant || !apres) return;

    /* L'équipe a joint le devis d'une demande du calculateur : pour le
       client, c'est un nouveau devis (boîte et lettre). */
    if (apres.type === 'devis' && avant.statut === 'demande' && apres.statut === 'envoye') {
      await annoncerPiece(apres, evenement.params.documentId);
      return;
    }

    /* Seul cas notable : le client répond à un devis qui lui était soumis.
       Les changements de statut d'une facture viennent de nous, nous n'avons
       pas besoin de nous les annoncer. */
    /* Ouvrir le devis le passe en « consulté » avant même que le bouton
       Accepter n'existe à l'écran : ne guetter que « envoyé » faisait rater
       toutes les réponses. */
    const repondu = apres.type === 'devis'
      && ['envoye', 'consulte'].includes(avant.statut)
      && (apres.statut === 'accepte' || apres.statut === 'refuse');
    if (!repondu) return;

    const projet = await lireProjet(apres.projet);
    const reponse = apres.reponse || {};

    /* Accepter ou refuser un devis engage le client : seul un responsable
       du projet le peut. L'écran ne propose pas le bouton aux autres, les
       règles refusent l'écriture ; si une réponse arrive quand même (règles
       anciennes, accès retiré entre-temps), le serveur la défait au lieu
       d'en tirer les conséquences. */
    /* L'équipe peut aussi le marquer signé hors du Hub (statutDevis) : la
       signature est alors celle d'un membre actif qui gère la finance du
       projet. La règle est une seule, dans acces.js. */
    if (!(await acces.reponseDevisAcceptee(projet, reponse))) {
      console.error(`Réponse au devis ${evenement.params.documentId} refusée : ${reponse.par || 'inconnu'} n'est pas responsable du projet`);
      try {
        await evenement.data.after.ref.update({ statut: avant.statut, reponse: avant.reponse || null });
      } catch (err) { console.error('Réponse au devis non défaite', err); }
      await audit('devis.reponse-refusee', { projet: apres.projet, document: evenement.params.documentId, par: reponse.par || null, statut: apres.statut });
      return;
    }

    /*
     * La signature du devis fondateur fait demarrer le projet. Un avenant
     * signe, lui, ne change rien a l'etat : le projet est deja lance, il
     * s'etend. C'est toute la difference entre « on commence » et « on
     * continue plus loin », et elle se lit dans le journal du projet.
     */
    const portee = apres.portee || 'initial';
    if (projet && apres.statut === 'accepte') {
      try {
        if (portee === 'initial' && ['brouillon', 'prospect', 'devis-envoye', 'cadrage'].includes(String(projet.statut || ''))) {
          await bdd.doc(`projets/${apres.projet}`).update({ statut: 'devis-signe', maj: FieldValue.serverTimestamp() });
        }
      } catch (err) { console.error('Suite du devis non ecrite', err); }
      if (apres.origine === 'panier' && apres.photo) {
        try { await etapesDuPanier(evenement.params.documentId, apres); } catch (err) { console.error('Étapes du calculateur non posées', err); }
      }
    }
    /* La ligne d'activité (« a signé le devis X : le projet démarre » ou
       « a accepté le devis X ») est écrite une seule fois, par
       hubDocumentActivite : deux lignes pour une acceptation, c'était une
       de trop. */

    await mettreEnFile('devis-reponse', contactsEquipe(), {
      numero: apres.numero,
      libelle: apres.libelle,
      montant: apres.montant,
      tva: apres.tva,
      ttc: typeof apres.ttc === 'number' ? apres.ttc : (Number(apres.montant) || 0) * (1 + (Number(apres.tva) || 0) / 100),
      projetNom: nomProjet(projet),
      clientNom: nomClient(projet),
      reponse: apres.statut,
      /* Le motif du refus, ou le mot laissé avec l'acceptation. */
      commentaire: String(reponse.commentaire || ''),
      portee,
      date: reponse.date || reponse.le || apres.date || null,
      /* Vers la pièce elle-même, dans le Cockpit. */
      lien: `${courriels.BASE}cockpit#/finances/${encodeURIComponent(evenement.params.documentId)}`,
    }, { projet: apres.projet, evenement: 'devis-reponse' });

    console.log(`Devis ${apres.numero || evenement.params.documentId} ${apres.statut} par le client`);
  },
);

/* ==========================================================================
   5. Le facteur

   Un déclencheur à la création d'un document « envois ». Il ne s'observe
   pas lui-même : aucun déclencheur n'écoute les modifications de cette
   collection, donc les écritures d'état ne peuvent pas boucler. Le compteur
   d'essais vit dans le document, ce qui rend la limite visible en console et
   résistante à un rejeu de la fonction par la plateforme.
   ========================================================================== */

let sdkBrevo;
/**
 * Le client officiel s'il est installé, sinon l'API HTTP. Les deux parlent
 * au même point d'entrée : garder la seconde voie évite qu'une dépendance
 * absente bloque toutes les notifications du projet.
 */
function chargerSdkBrevo() {
  if (sdkBrevo !== undefined) return sdkBrevo;
  try {
    sdkBrevo = require('@getbrevo/brevo');
  } catch (err) {
    console.warn('Client Brevo absent, envoi par l\'API HTTP v3 :', err.message);
    sdkBrevo = null;
  }
  return sdkBrevo;
}

/** @returns {Promise<string>} l'identifiant de message rendu par Brevo */
async function envoyerParBrevo(cle, courriel, destinataires) {
  const charge = {
    sender: { email: EXPEDITEUR.email, name: EXPEDITEUR.nom },
    replyTo: { email: EXPEDITEUR.email, name: EXPEDITEUR.nom },
    to: destinataires.map((d) => (d.nom ? { email: d.email, name: d.nom } : { email: d.email })),
    subject: courriel.objet,
    htmlContent: courriel.html,
    textContent: courriel.texte,
  };

  const brevo = chargerSdkBrevo();
  if (brevo && brevo.TransactionalEmailsApi) {
    const api = new brevo.TransactionalEmailsApi();
    api.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, cle);
    const reponse = await api.sendTransacEmail(charge);
    const corps = (reponse && (reponse.body || reponse)) || {};
    return String(corps.messageId || corps.messageIds || 'envoye');
  }

  const reponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': cle,
      /* Le corps est du JSON en UTF-8 ; Brevo encode lui-même l'objet dans
         l'en-tête du courriel (RFC 2047) et pose le jeu de caractères des
         deux corps. Rien n'est transcodé ici : les accents passent tels quels. */
      'content-type': 'application/json; charset=utf-8',
      'accept': 'application/json',
    },
    body: JSON.stringify(charge),
  });

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Brevo ${reponse.status} : ${texte.slice(0, 300)}`);
  }
  try {
    const corps = JSON.parse(texte || '{}');
    return String(corps.messageId || corps.messageIds || 'envoye');
  } catch (err) {
    return 'envoye';
  }
}

/** Un échec définitif reste lisible : l'état, le nombre d'essais, le motif. */
async function marquerEchec(ref, essais, err) {
  const motif = String((err && err.message) || err || 'motif inconnu').slice(0, 900);
  try {
    await ref.update({ etat: 'echec', erreur: motif, essais });
  } catch (autre) {
    console.error('État « echec » non écrit sur l\'envoi', autre);
  }
  console.error(`Envoi abandonné après ${essais} essai(s) : ${motif}`);
}

exports.suiviFacteur = onDocumentCreated(
  { region: REGION, document: 'envois/{envoiId}', secrets: [BREVO_CLE] },
  async (evenement) => {
    const instantane = evenement.data;
    if (!instantane) return;

    const ref = instantane.ref;
    const envoi = instantane.data();
    if (!envoi) return;
    if (envoi.etat !== 'attente') return;

    let courriel;
    try {
      courriel = courriels.rendre(envoi.modele, envoi.variables);
    } catch (err) {
      /* Modèle inconnu : rien à réessayer, c'est une erreur de code. */
      await marquerEchec(ref, Number(envoi.essais || 0), err);
      return;
    }

    const destinataires = (envoi.a || []).filter((d) => d && d.email);
    if (!destinataires.length) {
      await marquerEchec(ref, Number(envoi.essais || 0), new Error('aucun destinataire'));
      return;
    }

    /* Verrou absolu : sur le banc d'essai, aucun e-mail ne part jamais, quelle
       que soit la cle disponible. Les envois sont marques « simule ». */
    if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIRESTORE_EMULATOR_HOST) {
      /* Une lettre effacée entre sa création et ce marquage (un ménage, un
         retrait) n'a plus rien à marquer. Laisser l'erreur remonter tuait
         le processus des fonctions, et les déclencheurs livrés au même
         moment étaient perdus. */
      try {
        await ref.update({ etat: 'simule', envoye: FieldValue.serverTimestamp(), erreur: null });
      } catch (err) {
        if (err && err.code === 5) { console.warn(`Envoi ${ref.id} effacé avant d'être marqué : rien à faire`); return; }
        throw err;
      }
      console.log(`E-mail « ${envoi.modele} » simule sur le banc d essai (aucun envoi)`);
      return;
    }
    const cle = String(BREVO_CLE.value() || '').trim();
    if (!cle) {
      await marquerEchec(ref, Number(envoi.essais || 0), new Error('secret BREVO_CLE absent'));
      return;
    }

    let essais = Number(envoi.essais || 0);
    let derniere = new Error(`plafond de ${ESSAIS_MAX} essais déjà atteint`);

    while (essais < ESSAIS_MAX) {
      essais += 1;
      let identifiant;
      try {
        identifiant = await envoyerParBrevo(cle, courriel, destinataires);
      } catch (err) {
        derniere = err;
        console.error(`Envoi « ${envoi.modele} » en échec (essai ${essais} sur ${ESSAIS_MAX})`, err);
        try {
          await ref.update({ essais, erreur: String(err.message || err).slice(0, 900) });
        } catch (autre) {
          console.error('Compteur d\'essais non écrit', autre);
        }
        /* Une attente courte et croissante : le temps qu'une coupure réseau
           ou une limitation de débit passe, sans immobiliser la fonction. */
        if (essais < ESSAIS_MAX) await patienter(essais * 2000);
        continue;
      }
      /* Le courriel EST parti. Le marquer peut échouer (lettre effacée,
         Firestore indisponible un instant) : ce n'est jamais une raison de
         le renvoyer. Avant, l'échec du marquage relançait la boucle, et le
         destinataire recevait le même e-mail jusqu'à ESSAIS_MAX fois. */
      try {
        await ref.update({ etat: 'envoye', erreur: null, essais, brevo: identifiant, envoye: FieldValue.serverTimestamp() });
      } catch (err) {
        console.error(`E-mail « ${envoi.modele} » envoyé, mais non marqué comme tel (${ref.id})`, err);
      }
      console.log(`E-mail « ${envoi.modele} » envoyé à ${destinataires.map((d) => d.email).join(', ')}`);
      return;
    }

    await marquerEchec(ref, essais, derniere);
  },
);

/* ==========================================================================
   6. suiviAdmin

   POST { action, ...params }, avec « Authorization: Bearer <jeton Firebase> ».
   Plus aucune clé partagée : l'appelant est la personne connectée, et le
   serveur vérifie, dans cet ordre, que son jeton est valide et non révoqué,
   qu'il est membre ACTIF de l'équipe, que son rôle porte la permission de
   l'action, et qu'il est autorisé sur le projet visé (acces.js). On trouve
   ici tout ce que les règles refusent au navigateur : créer un projet,
   donner ou retirer un accès, ouvrir un projet au client, déposer un devis
   ou une facture, administrer l'équipe.
   ========================================================================== */

/* Les revendications du jeton se recalculent dans acces.js, depuis la base,
   jamais depuis les paramètres de l'appel. */
const poserRevendications = (uid) => acces.poserRevendications(uid);

/*
 * UNE ADRESSE, UN SEUL RÔLE.
 *
 * Une adresse est soit de l'équipe, soit testeur, soit cliente, jamais deux
 * à la fois. Le mélange a coûté cher le 23/09/2026 : une adresse inscrite
 * au vivier alors qu'elle était déjà cliente atterrissait tantôt sur un
 * espace, tantôt sur l'autre, et supprimer le testeur a effacé le compte
 * de connexion du client, qui était le même.
 *
 * Le rôle se lit dans la base, jamais dans la demande : le compte de
 * connexion d'abord (fiche d'équipe, fiche de testeur, membre d'un projet
 * ou d'une organisation), puis les contacts, parce qu'une adresse peut être
 * cliente avant même d'avoir un compte.
 */
const LIBELLES_ROLE = { equipe: "l'équipe", testeur: 'un testeur', client: 'un client' };

async function roleDeLAdresse(email) {
  const adresse = normaliserEmail(email);
  if (!adresse) return null;
  let uid = null;
  try { uid = (await getAuth().getUserByEmail(adresse)).uid; } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }
  if (uid) {
    if ((await bdd.doc(`equipe/${uid}`).get()).exists) return 'equipe';
    if ((await bdd.doc(`testeurs/${uid}`).get()).exists) return 'testeur';
    if (!(await bdd.collection('projets').where('membres', 'array-contains', uid).limit(1).get()).empty) return 'client';
    /* Un interlocuteur préparé sur un projet encore fermé est déjà client :
       il n'est pas membre, mais il figure parmi les personnes du projet. */
    if (!(await bdd.collection('projets').where('personnes', 'array-contains', uid).limit(1).get()).empty) return 'client';
    if (!(await bdd.collection('organisations').where('membres', 'array-contains', uid).limit(1).get()).empty) return 'client';
  }
  const memeAdresse = (x) => normaliserEmail(x) === adresse;
  const orgs = await bdd.collection('organisations').get();
  if (orgs.docs.some((o) => memeAdresse(o.data().email) || (o.data().contacts || []).some((c) => memeAdresse(c.email)))) return 'client';
  const projets = await bdd.collection('projets').get();
  if (projets.docs.some((p) => memeAdresse((p.data().client || {}).email) || (p.data().contacts || []).some((c) => memeAdresse(c.email)))) return 'client';
  return null;
}

/** Refuse une adresse qui porte déjà un autre rôle que celui voulu. */
async function exigerRole(email, voulu) {
  const actuel = await roleDeLAdresse(email);
  if (actuel && actuel !== voulu) {
    const e = new Error(`Cette adresse appartient déjà à ${LIBELLES_ROLE[actuel]}. Une adresse ne peut avoir qu'un seul rôle : utilisez-en une autre.`);
    e.conflitDeRole = true;
    throw e;
  }
}

/** Le compte Auth de cette adresse, créé au besoin. Avec `role`, l'adresse
 *  ne doit porter aucun autre rôle. */
async function compteAuth(email, nom, role) {
  if (role) await exigerRole(email, role);
  const adresse = normaliserEmail(email);
  try {
    const existant = await getAuth().getUserByEmail(adresse);
    return { utilisateur: existant, cree: false };
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    const nouveau = await getAuth().createUser({
      email: adresse,
      /* La connexion se fait par lien e-mail : la vérification de l'adresse
         se produit au premier clic, pas ici. */
      emailVerified: false,
      ...(nom ? { displayName: String(nom).trim() } : {}),
    });
    return { utilisateur: nouveau, cree: true };
  }
}


/* Avant la Gate 2, un membre d'organisation devenait membre de TOUS ses
   projets : l'appartenance à une société donnait l'accès. C'est fini.
   L'accès se donne projet par projet (interlocuteurs), et les membres
   d'une organisation se déduisent de ces accès : ils permettent seulement
   de lire la fiche de sa société. */
const synchroniserMembres = (orgId) => acces.recalculerOrganisation(orgId);

/** Les notes internes d'une organisation : hors de la fiche que ses membres
    lisent en entier, dans organisationsInternes (équipe seule). */
async function ecrireNotesInternes(orgId, notes) {
  if (notes === undefined || notes === null) return;
  await bdd.doc(`organisationsInternes/${orgId}`).set({ notesInternes: String(notes).slice(0, 8000), maj: FieldValue.serverTimestamp() }, { merge: true });
}

/** Des liens de piece : un nom, une adresse, rien d autre, dix au plus. */
function nettoyerLiens(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((l) => l && typeof l.url === 'string' && /^https?:\/\/\S+$/.test(l.url.trim()))
    .slice(0, 10)
    .map((l) => ({ nom: String(l.nom || '').trim().slice(0, 80) || l.url.trim(), url: l.url.trim() }));
}

const STATUTS_FACTURE = ['brouillon', 'envoyee', 'a-payer', 'partielle', 'payee', 'en-retard', 'annulee', 'avoir'];
const STATUTS_DEVIS = ['brouillon', 'envoye', 'consulte', 'accepte', 'refuse', 'expire', 'annule'];
const MOYENS = ['virement', 'carte', 'stripe', 'cheque', 'especes', 'autre'];
const PLATEFORMES_CONNUES = ['ios', 'android', 'web', 'admin', 'backend', 'landing'];

/* ==========================================================================
   6 bis. Les accès des clients, projet par projet

   Un interlocuteur (projets/{p}/interlocuteurs/{cle}) est une personne,
   un rôle (responsable ou collaborateur) et un statut. Il peut être
   préparé sur un projet fermé : il n'a alors aucun accès et ne reçoit
   rien. L'accès effectif (« membres », « roles ») est recalculé par
   acces.recalculerAcces à chaque geste, jamais écrit à la main.
   ========================================================================== */

const LIBELLE_ROLE_CLIENT = acces.ROLES_CLIENT;

/** La fiche d'un interlocuteur, par sa clé ou son adresse. */
async function lireInterlocuteur(projetId, { cle, email }) {
  const id = cle ? String(cle) : (email ? cleEmail(email) : '');
  if (!id) throw new Refus(400, 'Interlocuteur requis : sa clé ou son adresse.');
  const ref = bdd.doc(`projets/${projetId}/interlocuteurs/${id}`);
  const doc = await ref.get();
  return { ref, cle: id, fiche: doc.exists ? doc.data() : null };
}

/* Ce qui attend déjà le client dans son espace, au moment où il y entre.
   Un résumé, pas l'historique : on ne rejoue pas la préparation. La partie
   financière n'est comptée que pour un responsable. */
async function resumeInitial(projetId) {
  const compter = async (collection, filtre) => {
    try {
      const q = await bdd.collection(collection).where('projet', '==', projetId).get();
      return q.docs.map((d) => d.data()).filter(filtre).length;
    } catch (err) { return 0; }
  };
  const jalons = (await bdd.collection(`projets/${projetId}/jalons`).get()).docs.map((d) => d.data());
  const enCours = jalons.find((j) => j.statut === 'en-cours') || jalons.find((j) => ['planifie', 'a-venir'].includes(j.statut));
  const aValider = await compter('validations', (v) => v.statut === 'en-attente');
  const taches = await compter('taches', (t) => !t.archive && t.visibilite === 'client' && t.statut !== 'terminee');
  const fichiers = await compter('fichiers', (f) => !f.archive && f.visibilite === 'client');
  const devis = await compter('documents', (d) => d.type === 'devis' && ['envoye', 'consulte'].includes(d.statut) && !d.archive);
  const factures = await compter('documents', (d) => d.type === 'facture' && ['envoyee', 'a-payer', 'partielle', 'en-retard'].includes(d.statut) && !d.archive);
  const reunions = (await bdd.collection('reunions').where('projet', '==', projetId).get()).docs.map((d) => d.data())
    .filter((r) => r.visibilite === 'client' && r.date && r.date.toDate && r.date.toDate() > new Date())
    .sort((a, b) => a.date.toMillis() - b.date.toMillis());
  const commun = [];
  if (jalons.length) commun.push({ quoi: 'Feuille de route', detail: `${jalons.length} étape${jalons.length > 1 ? 's' : ''}${enCours ? `, en cours : ${enCours.titre || ''}` : ''}` });
  if (taches) commun.push({ quoi: 'Tâches visibles', detail: `${taches} en cours ou à venir` });
  if (aValider) commun.push({ quoi: 'À valider', detail: `${aValider} demande${aValider > 1 ? 's' : ''} de validation` });
  if (fichiers) commun.push({ quoi: 'Fichiers', detail: `${fichiers} disponible${fichiers > 1 ? 's' : ''}` });
  if (reunions[0]) commun.push({ quoi: 'Prochaine réunion', detail: `${reunions[0].titre || ''} · ${reunions[0].date.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` });
  const finance = [];
  if (devis) finance.push({ quoi: 'Devis à décider', detail: `${devis}` });
  if (factures) finance.push({ quoi: 'Factures à régler', detail: `${factures}` });
  return { commun, finance };
}

/**
 * Invite un interlocuteur d'un projet OUVERT : une invitation neuve (les
 * précédentes sont révoquées), puis l'e-mail si la décision centrale le
 * permet. Les e-mails coupés laissent l'invitation « en attente » : le
 * lien existe, on le copie à la main.
 */
async function inviterInterlocuteur(projetId, cle, { par, modele = 'invitation', resume = null, prevenir = true } = {}) {
  const projet = { id: projetId, ...(await bdd.doc(`projets/${projetId}`).get()).data() };
  const ref = bdd.doc(`projets/${projetId}/interlocuteurs/${cle}`);
  const i = (await ref.get()).data();
  if (!i || i.statut !== 'actif') throw new Refus(409, "Cette personne n'a pas d'accès actif sur ce projet.");
  if (projet.ouvert !== true) throw new Refus(409, "Le projet est fermé au client : rien ne part tant qu'il n'est pas ouvert.");
  const evenement = modele === 'ouverture' ? 'ouverture' : 'invitation';
  const decision = communication.decisionEmailClient({ projet, interlocuteur: i, evenement });
  const envoyer = prevenir && decision.ok;
  const inv = await invitations.creer({
    type: 'client', email: i.email, nom: i.nom, uid: i.uid, role: i.role,
    projet: projetId, projetNom: projet.nom || '', par, envoyee: envoyer,
  });
  if (envoyer) {
    const points = resume ? [...resume.commun, ...(i.role === 'responsable' ? resume.finance : [])] : [];
    await mettreEnFile(modele, [{ email: i.email, nom: i.nom }], {
      projetNom: projet.nom || '', clientNom: i.nom || '', email: i.email, role: i.role, lien: inv.lien, points,
    }, { projet: projetId, evenement });
  }
  await ref.update({
    invitation: { id: inv.id, etat: envoyer ? 'envoyee' : 'en-attente', envoyee: envoyer ? FieldValue.serverTimestamp() : null, expire: inv.expire },
    maj: FieldValue.serverTimestamp(),
  });
  return { lien: inv.lien, envoyee: envoyer, motif: envoyer ? '' : (prevenir ? decision.motif : 'envoi non demandé') };
}

/* Au moins un responsable doit rester sur un projet ouvert : sans lui,
   personne ne peut plus accepter un devis ni une validation réservée. */
async function controleDernierResponsable(projetId, cle, roleApres) {
  const projet = (await bdd.doc(`projets/${projetId}`).get()).data() || {};
  if (projet.ouvert !== true) return;
  const inter = (await bdd.collection(`projets/${projetId}/interlocuteurs`).get()).docs.map((d) => ({ cle: d.id, ...d.data() }));
  const restants = inter.filter((i) => i.statut === 'actif' && i.role === 'responsable' && i.cle !== cle);
  if (roleApres !== 'responsable' && !restants.length) {
    throw new Refus(409, "C'est le dernier responsable de ce projet ouvert : nommez-en un autre avant, ou refermez le projet.");
  }
}

async function ajouterInterlocuteur(identite, { projet: projetId, email, nom, role }) {
  const adresse = normaliserEmail(email);
  if (!emailPlausible(adresse)) throw new Refus(400, "L'adresse de l'interlocuteur a l'air incomplète.");
  if (!LIBELLE_ROLE_CLIENT[role]) throw new Refus(400, 'Rôle requis : responsable ou collaborateur.');
  const projet = await acces.assurerModele(String(projetId));
  if (projet.interne === true) throw new Refus(409, "Un projet interne n'a pas de client.");
  const { utilisateur } = await compteAuth(adresse, nom, 'client');
  const { ref, cle, fiche } = await lireInterlocuteur(projet.id, { email: adresse });
  const reprise = !fiche || fiche.statut !== 'actif';
  /* Ré-ajouter une adresse déjà active change son rôle : ce geste ne doit
     jamais retirer le dernier responsable d'un projet ouvert. */
  if (!reprise && fiche.role !== role) await controleDernierResponsable(projet.id, cle, role);
  await ref.set(sansIndefini({
    email: adresse, nom: String(nom || (fiche && fiche.nom) || '').trim().slice(0, 120), uid: utilisateur.uid, role, statut: 'actif',
    ajoute: fiche && fiche.ajoute ? fiche.ajoute : FieldValue.serverTimestamp(), ajoutePar: identite.uid,
    retireLe: null, retirePar: null,
    invitation: reprise ? { etat: 'preparee' } : (fiche.invitation || { etat: 'preparee' }),
    maj: FieldValue.serverTimestamp(),
  }), { merge: true });
  await acces.recalculerAcces(projet.id);
  let invitation = { etat: reprise ? 'preparee' : ((fiche.invitation || {}).etat || 'preparee') };
  if (projet.ouvert === true && reprise) {
    const r = await inviterInterlocuteur(projet.id, cle, { par: identite.uid });
    invitation = { etat: r.envoyee ? 'envoyee' : 'en-attente', lien: r.lien, motif: r.motif };
  }
  await audit('acces.interlocuteur-ajoute', { projet: projet.id, cle, uid: utilisateur.uid, role, par: identite.uid });
  return { ok: true, cle, uid: utilisateur.uid, role, invitation };
}

/* Le responsable du projet, côté client, invite un collègue : toujours
   comme collaborateur (le moindre droit ; un second responsable se nomme
   depuis le cockpit). Le contrôle est ici, pas dans le registre des
   permissions : l'appelant est un client, membre du projet, et son rôle
   sur la fiche est « responsable ». L'équipe est prévenue. */
async function inviterCollegue(identite, { projet: projetId, email, nom }) {
  if (identite.fiche) throw new Refus(403, "Cette action est celle du responsable du projet côté client : l'équipe passe par « Accès client ».");
  if (!projetId) throw new Refus(400, 'Projet requis.');
  const projet = await lireProjet(String(projetId));
  if (!projet) throw new Refus(404, 'Projet inconnu.');
  if (!Array.isArray(projet.membres) || !projet.membres.includes(identite.uid)) throw new Refus(403, "Vous n'avez pas accès à ce projet.");
  if ((projet.roles || {})[identite.uid] !== 'responsable') throw new Refus(403, 'Seul le responsable du projet peut inviter un collègue.');
  const adresse = normaliserEmail(email);
  if (!emailPlausible(adresse)) throw new Refus(400, "L'adresse de votre collègue a l'air incomplète.");
  if (memeEmail(adresse, identite.email)) throw new Refus(409, "C'est votre propre adresse.");
  /* Une adresse qui a déjà accès n'est pas un nouveau collègue : l'inviter
     comme collaborateur rétrograderait un responsable. */
  const deja = await lireInterlocuteur(projet.id, { email: adresse });
  if (deja.fiche && deja.fiche.statut === 'actif') throw new Refus(409, 'Cette personne a déjà accès au projet.');
  const r = await ajouterInterlocuteur(identite, { projet: projet.id, email: adresse, nom, role: 'collaborateur' });
  const auteur = await bdd.collection(`projets/${projet.id}/interlocuteurs`).where('uid', '==', identite.uid).limit(1).get();
  const nomAuteur = auteur.empty ? identite.email : (auteur.docs[0].data().nom || identite.email);
  await communication.notifierEquipe(projet.id, { type: 'projet', titre: 'Le responsable a invité un collègue', texte: `${nomProjet(projet)} · ${String(nom || adresse).trim()} par ${nomAuteur}`, lien: `#/projets/${projet.id}/acces`, projet: projet.id });
  await audit('acces.collegue-invite', { projet: projet.id, cle: r.cle, uid: r.uid, par: identite.uid });
  return r;
}

async function modifierInterlocuteur(identite, { projet: projetId, cle, email, role, nom }) {
  const projet = await acces.assurerModele(String(projetId));
  const { ref, cle: id, fiche } = await lireInterlocuteur(projet.id, { cle, email });
  if (!fiche || fiche.statut !== 'actif') throw new Refus(404, "Cet interlocuteur n'a pas d'accès actif sur ce projet.");
  const changements = { maj: FieldValue.serverTimestamp() };
  if (role !== undefined) {
    if (!LIBELLE_ROLE_CLIENT[role]) throw new Refus(400, 'Rôle requis : responsable ou collaborateur.');
    if (fiche.role === 'responsable' && role !== 'responsable') await controleDernierResponsable(projet.id, id, role);
    changements.role = role;
  }
  const nomPropre = nom === undefined ? undefined : String(nom).trim().slice(0, 120);
  if (nomPropre !== undefined) {
    if (!nomPropre) throw new Refus(400, 'Le nom ne peut pas être vide.');
    changements.nom = nomPropre;
  }
  await ref.update(changements);
  /* Le nom corrigé doit se lire partout : le « Bonjour » du Hub et des
     e-mails vient du profil, puis du compte. */
  if (nomPropre !== undefined && fiche.uid) {
    await getAuth().updateUser(fiche.uid, { displayName: nomPropre }).catch(() => {});
    const profil = bdd.doc(`profils/${fiche.uid}`);
    if ((await profil.get()).exists) await profil.set({ nom: nomPropre, maj: FieldValue.serverTimestamp() }, { merge: true });
  }
  await acces.recalculerAcces(projet.id);
  await audit('acces.interlocuteur-modifie', { projet: projet.id, cle: id, role: changements.role || fiche.role, ...(nomPropre !== undefined ? { nom: nomPropre } : {}), par: identite.uid });
  return { ok: true, cle: id, role: changements.role || fiche.role };
}

async function retirerInterlocuteur(identite, { projet: projetId, cle, email, uid }) {
  const projet = await acces.assurerModele(String(projetId));
  let cible = { cle, email };
  if (!cle && !email && uid) {
    const trouve = (await bdd.collection(`projets/${projet.id}/interlocuteurs`).where('uid', '==', String(uid)).limit(1).get()).docs[0];
    if (trouve) cible = { cle: trouve.id };
  }
  const { ref, cle: id, fiche } = await lireInterlocuteur(projet.id, cible);
  if (!fiche) throw new Refus(404, "Cet interlocuteur n'existe pas sur ce projet.");
  if (fiche.statut === 'actif' && fiche.role === 'responsable') await controleDernierResponsable(projet.id, id, null);
  await ref.update({ statut: 'retire', retireLe: FieldValue.serverTimestamp(), retirePar: identite.uid, 'invitation.etat': 'revoquee', maj: FieldValue.serverTimestamp() });
  if (fiche.uid) await invitations.revoquerCelles({ type: 'client', uid: fiche.uid, projet: projet.id });
  const r = await acces.recalculerAcces(projet.id);
  await audit('acces.interlocuteur-retire', { projet: projet.id, cle: id, uid: fiche.uid || null, par: identite.uid });
  return { ok: true, cle: id, uid: fiche.uid || null, retires: r.retires };
}

async function ouvrirAuClient(identite, { id, prevenir }) {
  const projet = await acces.assurerModele(String(id));
  if (projet.interne === true) throw new Refus(409, "Un projet interne n'a pas de client à qui ouvrir.");
  const tous = (await bdd.collection(`projets/${projet.id}/interlocuteurs`).get()).docs.map((d) => ({ cle: d.id, ...d.data() }));
  const actifs = tous.filter((i) => i.statut === 'actif');
  if (!actifs.length) throw new Refus(409, "Aucun interlocuteur sur ce projet : ajoutez au moins un responsable avant d'ouvrir.");
  const sansRole = actifs.filter((i) => !LIBELLE_ROLE_CLIENT[i.role]);
  if (sansRole.length) throw new Refus(409, `Rôle à définir avant d'ouvrir : ${sansRole.map((i) => i.email).join(', ')}.`);
  if (!actifs.some((i) => i.role === 'responsable')) throw new Refus(409, "Il faut au moins un responsable avant d'ouvrir le projet.");

  /* Un interlocuteur repris d'avant la Gate 2 peut ne pas avoir de compte. */
  for (const i of actifs.filter((x) => !x.uid)) {
    const { utilisateur } = await compteAuth(i.email, i.nom, 'client');
    await bdd.doc(`projets/${projet.id}/interlocuteurs/${i.cle}`).update({ uid: utilisateur.uid, maj: FieldValue.serverTimestamp() });
    i.uid = utilisateur.uid;
  }

  /* La première ouverture est un événement : une lettre par personne, avec
     ce qui l'attend. Les suivantes (après une fermeture) rendent l'accès
     sans rien renvoyer à ceux qui sont déjà entrés. */
  const premiere = !projet.premiereOuverture;
  const deja = projet.ouvert === true;
  await bdd.doc(`projets/${projet.id}`).update({
    ouvert: true, ouvertLe: FieldValue.serverTimestamp(),
    ...(premiere ? { premiereOuverture: FieldValue.serverTimestamp() } : {}),
    maj: FieldValue.serverTimestamp(),
  });
  await acces.recalculerAcces(projet.id);

  const resume = premiere ? await resumeInitial(projet.id) : null;
  const bilan = [];
  for (const i of actifs) {
    if (deja || (i.invitation && i.invitation.etat === 'acceptee')) { bilan.push({ email: i.email, etat: 'acceptee' }); continue; }
    const r = await inviterInterlocuteur(projet.id, i.cle, { par: identite.uid, modele: premiere ? 'ouverture' : 'invitation', resume, prevenir: prevenir !== false });
    bilan.push({ email: i.email, etat: r.envoyee ? 'envoyee' : 'en-attente', motif: r.motif });
  }
  if (premiere) {
    await communication.notifierClients(projet.id, 'ouverture', {
      type: 'projet', titre: 'Votre espace projet est ouvert', texte: projet.nom || '', lien: `#/projets/${projet.id}`,
    });
  }
  await audit('projet-ouvert', { projet: projet.id, premiere, par: identite.uid, invitations: bilan.map((b) => b.etat) });
  return { ok: true, ouvert: true, premiere, invitations: bilan };
}

async function fermerAuClient(identite, { id }) {
  const projet = await acces.assurerModele(String(id));
  await bdd.doc(`projets/${projet.id}`).update({ ouvert: false, maj: FieldValue.serverTimestamp() });
  const r = await acces.recalculerAcces(projet.id);
  /* Les liens encore vivants sont coupés : on n'invite pas dans un espace fermé. */
  const inter = (await bdd.collection(`projets/${projet.id}/interlocuteurs`).get()).docs;
  for (const d of inter) {
    const i = d.data();
    if (!i.uid) continue;
    const n = await invitations.revoquerCelles({ type: 'client', uid: i.uid, projet: projet.id });
    if (n && i.invitation && i.invitation.etat !== 'acceptee') await d.ref.update({ 'invitation.etat': 'revoquee', maj: FieldValue.serverTimestamp() });
  }
  await audit('projet-referme', { projet: projet.id, retires: r.retires.length, par: identite.uid });
  return { ok: true, ouvert: false, retires: r.retires.length };
}

async function reglerEmailsClient(identite, { id, emailsClient }) {
  if (!['actifs', 'coupes'].includes(emailsClient)) throw new Refus(400, 'emailsClient : actifs ou coupes.');
  const ref = bdd.doc(`projets/${String(id)}`);
  if (!(await ref.get()).exists) throw new Refus(404, 'Projet inconnu.');
  /* La reprise est datée : ce qui s'est passé pendant la coupure ne part
     pas après coup (voir communication.auMoment). */
  const avant = (await ref.get()).data().emailsClient;
  await ref.update({ emailsClient, ...(emailsClient === 'actifs' && avant === 'coupes' ? { emailsActifsLe: FieldValue.serverTimestamp() } : {}), maj: FieldValue.serverTimestamp() });
  await audit('projet.emails-client', { projet: String(id), emailsClient, par: identite.uid });
  return { ok: true, emailsClient };
}

/* ==========================================================================
   6 ter. L'équipe

   Ajouter, modifier (rôle, projets d'un agent, permissions déléguées),
   désactiver, réactiver, retirer. La désactivation ferme TOUT, tout de
   suite : fiche inactive (les règles la relisent à chaque lecture), jetons
   révoqués (le serveur refuse l'ancienne session), compte suspendu (plus
   de reconnexion). Le dernier administrateur actif est intouchable.
   ========================================================================== */

async function lireEquipe() {
  return (await bdd.collection('equipe').get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
}

const projetsValides = async (liste) => {
  const ids = [...new Set((Array.isArray(liste) ? liste : []).map(String).filter(Boolean))].slice(0, 200);
  const connus = [];
  for (const id of ids) if ((await bdd.doc(`projets/${id}`).get()).exists) connus.push(id);
  return connus;
};

async function ajouterMembreEquipe(identite, { email, nom, role, projets, permissions }) {
  const adresse = normaliserEmail(email);
  if (!emailPlausible(adresse)) throw new Refus(400, 'Adresse valide requise.');
  if (!String(nom || '').trim()) throw new Refus(400, 'Nom requis.');
  const fonction = role === 'admin' ? 'admin' : 'agent';
  const { utilisateur, cree } = await compteAuth(adresse, nom, 'equipe');
  const ref = bdd.doc(`equipe/${utilisateur.uid}`);
  if ((await ref.get()).exists) throw new Refus(409, "Cette personne fait déjà partie de l'équipe : modifiez sa fiche.");
  await ref.set({
    nom: String(nom).trim().slice(0, 120), email: adresse, role: fonction, actif: true,
    projets: fonction === 'agent' ? await projetsValides(projets) : [],
    permissions: fonction === 'agent' ? (Array.isArray(permissions) ? permissions.filter((p) => acces.DELEGABLES.includes(p)) : []) : [],
    cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(), par: identite.uid,
  });
  try { await getAuth().updateUser(utilisateur.uid, { disabled: false }); } catch (err) { /* compte déjà actif */ }
  const revendications = await poserRevendications(utilisateur.uid);
  const inv = await invitations.creer({ type: 'equipe', email: adresse, nom, uid: utilisateur.uid, role: fonction, par: identite.uid, envoyee: true });
  await mettreEnFile('invitation-equipe', [{ email: adresse, nom }], { nom: String(nom).trim(), email: adresse, role: fonction, lien: inv.lien }, { evenement: 'invitation-equipe' });
  await audit('equipe.ajoute', { uid: utilisateur.uid, role: fonction, par: identite.uid });
  return { ok: true, uid: utilisateur.uid, compteCree: cree, revendications };
}

async function modifierMembreEquipe(identite, { uid, role, projets, permissions, nom }) {
  const equipe = await lireEquipe();
  const avant = equipe.find((f) => f.uid === String(uid));
  if (!avant) throw new Refus(404, "Ce membre n'existe pas.");
  const apres = { ...avant };
  if (role !== undefined) { if (!acces.ROLES_EQUIPE[role]) throw new Refus(400, 'Rôle : admin ou agent.'); apres.role = role; }
  if (projets !== undefined) apres.projets = await projetsValides(projets);
  if (permissions !== undefined) apres.permissions = Array.isArray(permissions) ? permissions.filter((p) => acces.DELEGABLES.includes(p)) : [];
  if (nom !== undefined) apres.nom = String(nom).trim().slice(0, 120);
  if (apres.role === 'admin') { apres.projets = []; apres.permissions = []; }
  const garde = acces.controleDernierAdmin(equipe, avant.uid, apres);
  if (garde) throw new Refus(409, garde);
  await bdd.doc(`equipe/${avant.uid}`).update(sansIndefini({
    role: apres.role, projets: apres.projets || [], permissions: apres.permissions || [], nom: apres.nom, maj: FieldValue.serverTimestamp(),
  }));
  await poserRevendications(avant.uid);
  await audit('equipe.modifie', { uid: avant.uid, role: apres.role, par: identite.uid });
  return { ok: true, uid: avant.uid, role: apres.role };
}

async function desactiverMembreEquipe(identite, { uid }) {
  const equipe = await lireEquipe();
  const avant = equipe.find((f) => f.uid === String(uid));
  if (!avant) throw new Refus(404, "Ce membre n'existe pas.");
  const garde = acces.controleDernierAdmin(equipe, avant.uid, { ...avant, actif: false });
  if (garde) throw new Refus(409, garde);
  await bdd.doc(`equipe/${avant.uid}`).update({ actif: false, desactiveLe: FieldValue.serverTimestamp(), desactivePar: identite.uid, maj: FieldValue.serverTimestamp() });
  await poserRevendications(avant.uid);
  try { await getAuth().revokeRefreshTokens(avant.uid); } catch (err) { console.error('Jetons non révoqués', err); }
  try { await getAuth().updateUser(avant.uid, { disabled: true }); } catch (err) { console.error('Compte non suspendu', err); }
  await invitations.revoquerCelles({ type: 'equipe', uid: avant.uid });
  await audit('equipe.desactive', { uid: avant.uid, par: identite.uid });
  return { ok: true, uid: avant.uid, actif: false };
}

async function reactiverMembreEquipe(identite, { uid }) {
  const ref = bdd.doc(`equipe/${String(uid)}`);
  if (!(await ref.get()).exists) throw new Refus(404, "Ce membre n'existe pas.");
  await ref.update({ actif: true, desactiveLe: null, maj: FieldValue.serverTimestamp() });
  try { await getAuth().updateUser(String(uid), { disabled: false }); } catch (err) { console.error('Compte non rétabli', err); }
  await poserRevendications(String(uid));
  await audit('equipe.reactive', { uid: String(uid), par: identite.uid });
  return { ok: true, uid: String(uid), actif: true };
}

async function retirerMembreEquipe(identite, { uid }) {
  const equipe = await lireEquipe();
  const avant = equipe.find((f) => f.uid === String(uid));
  if (!avant) throw new Refus(404, "Ce membre n'existe pas.");
  const garde = acces.controleDernierAdmin(equipe, avant.uid, null);
  if (garde) throw new Refus(409, garde);
  await bdd.doc(`equipe/${avant.uid}`).delete();
  try { await getAuth().revokeRefreshTokens(avant.uid); } catch (err) { /* compte parti */ }
  /* Le compte ne sert qu'à l'équipe (une adresse, un rôle) : il part avec
     elle. L'adresse redevient libre pour un autre rôle. */
  try { await getAuth().deleteUser(avant.uid); } catch (err) { /* déjà parti */ }
  await invitations.revoquerCelles({ type: 'equipe', uid: avant.uid });
  await audit('equipe.retire', { uid: avant.uid, par: identite.uid });
  return { ok: true, uid: avant.uid, retire: true };
}

/* ==========================================================================
   6 quater. Le registre des actions

   Chaque action nomme la permission qu'elle exige et, s'il y a lieu, le
   projet qu'elle touche : le contrôle se fait UNE fois, avant l'action,
   et il est le même pour toutes. Une action retirée répond 410 en disant
   ce qui la remplace, plutôt que de se taire.
   ========================================================================== */

const projetDuDocument = async (id) => {
  if (!id) return null;
  const d = await bdd.doc(`documents/${String(id)}`).get();
  return d.exists ? d.data().projet || null : null;
};

const ACTIONS = {
  moi: { permission: null },
  creerProjet: { permission: 'projets.creer' },
  ajouterInterlocuteur: { permission: 'acces.gerer', projet: (c) => c.projet },
  /* La seule action ouverte à un client : le contrôle (membre, responsable)
     est dans l'action elle-même, pas dans le registre des permissions. */
  inviterCollegue: { client: true },
  modifierInterlocuteur: { permission: 'acces.gerer', projet: (c) => c.projet },
  retirerInterlocuteur: { permission: 'acces.gerer', projet: (c) => c.projet },
  renvoyerInvitation: { permission: 'acces.gerer', projet: (c) => c.projet },
  inviterClient: { permission: 'acces.gerer', projet: (c) => c.projet },
  retirerClient: { permission: 'acces.gerer', projet: (c) => c.projet },
  creerInvitation: { permission: 'acces.gerer', projet: (c) => c.projet },
  revoquerInvitation: { permission: 'acces.gerer' },
  ouvrirAuClient: { permission: 'projets.ouvrir', projet: (c) => c.id },
  fermerAuClient: { permission: 'projets.ouvrir', projet: (c) => c.id },
  reglerEmailsClient: { permission: 'projets.ouvrir', projet: (c) => c.id },
  classerArbitrageAcces: { permission: 'acces.gerer', projet: (c) => c.id },
  /* Le journal des connexions d'un interlocuteur : l'équipe du projet. */
  historiqueConnexions: { permission: 'projet.voir', projet: (c) => c.projet },
  deposerDocument: { permission: 'finance.gerer', projet: (c) => c.projet },
  majDocument: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.id) },
  joindreDevis: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.id) },
  statutDevis: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.id) },
  archiverDocument: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.id) },
  statutFacture: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.id) },
  enregistrerPaiement: { permission: 'finance.gerer', projet: (c) => projetDuDocument(c.facture) },
  poserLogo: { permission: 'contenu.gerer', projet: (c) => c.id },
  creerDemande: { permission: 'demandes.gerer', projet: (c) => c.projet },
  creerOrganisation: { permission: 'clients.gerer' },
  majOrganisation: { permission: 'clients.gerer' },
  inviterMembreOrganisation: { retiree: "L'accès ne se donne plus par organisation : ouvrez le projet, onglet « Accès client », et ajoutez la personne au projet voulu." },
  retirerMembreOrganisation: { retiree: "L'accès ne se retire plus par organisation : ouvrez chaque projet, onglet « Accès client »." },
  ajouterEquipe: { permission: 'equipe.gerer' },
  modifierEquipe: { permission: 'equipe.gerer' },
  desactiverEquipe: { permission: 'equipe.gerer' },
  reactiverEquipe: { permission: 'equipe.gerer' },
  retirerEquipe: { permission: 'equipe.gerer' },
  inscrireTesteur: { permission: 'qa.gerer' },
  majTesteur: { permission: 'qa.gerer' },
  inviterTesteur: { permission: 'qa.gerer' },
  retirerTesteur: { permission: 'qa.gerer' },
  creerJetonRobot: { permission: 'qa.gerer', projet: (c) => c.projet },
  revoquerJetonRobot: { permission: 'qa.gerer' },
  migrerProjets: { permission: 'systeme' },
  verifierSignature: { permission: 'systeme' },
  diagnostic: { permission: 'systeme' },
  remplirProjet: { permission: 'systeme', projet: (c) => c.id },
};

/* Exposé pour l'épreuve : le registre, sans rien exécuter. */
exports._actions = ACTIONS;

exports.suiviAdmin = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { action, projet, email, nom, uid, ref, client, plateformes,
      type, numero, libelle, montant, echeance, fichier, liens, id, statut, role,
      entreprise, telephone, adresse, notesInternes, organisation, description, responsable,
      debut, cible, budget, budgetNote, inviter, demandeProjet, tva, date, facture, moyen, reference, note, archive,
      prenom, mobile, profil, testeur } = req.body || {};

    /* Qui appelle, et a-t-il le droit ? Une seule porte, avant toute action. */
    let identite;
    try {
      identite = await acces.identifier(req);
      const definition = ACTIONS[action];
      if (!definition) return res.status(400).send('action inconnue');
      if (definition.retiree) return res.status(410).send(definition.retiree);
      const projetVise = definition.projet ? await definition.projet(req.body || {}) : null;
      if (definition.client) {
        /* Une action du client : pas de fiche d'équipe à exiger, l'action
           vérifie elle-même le rôle sur le projet. */
      } else if (definition.projet && !projetVise && definition.permission !== 'systeme') {
        /* Une action sur un projet sans projet désigné : l'action dira
           elle-même ce qui manque, mais un agent ne passe pas sans projet. */
        acces.exiger(identite, definition.permission, identite.fiche && identite.fiche.role === 'admin' ? null : '__aucun__');
      } else {
        acces.exiger(identite, definition.permission, projetVise);
      }
    } catch (err) {
      if (err && err.refus) {
        await audit('admin.refus', { action: String(action || ''), uid: identite ? identite.uid : null, code: err.code, motif: err.message });
        return res.status(err.code).send(err.message);
      }
      console.error('suiviAdmin, contrôle d accès', err);
      return res.status(500).send('erreur interne');
    }

    try {
      /* --- Qui suis-je : ce que l'écran doit proposer, et rien de plus. */
      if (action === 'moi') {
        const f = identite.fiche;
        return res.json({ ok: true, uid: identite.uid, email: identite.email, role: f.role, actif: f.actif === true, projets: f.projets || [], permissions: [...acces.permissionsDe(f)] });
      }

      /* --- Créer un projet ------------------------------------------------
         La référence sert de préfixe à tous les numéros de ticket : elle est
         en majuscules, et unique, sinon deux projets produiraient des
         numéros identiques. */
      if (action === 'creerProjet') {
        const reference = String(ref || '').trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9]{1,15}$/.test(reference)) {
          return res.status(400).send('ref requise : 2 a 16 lettres ou chiffres, sans espace');
        }
        if (!String(nom || '').trim()) return res.status(400).send('nom du projet requis');

        const deja = await bdd.collection('projets').where('ref', '==', reference).limit(1).get();
        if (!deja.empty) return res.status(409).send(`la reference ${reference} est deja prise`);

        /* Un projet interne n'a ni client ni organisation : c'est un projet
           de la maison, suivi dans le cockpit et invisible cote client. */
        const estInterne = req.body.interne === true;
        let orgId = organisation ? String(organisation) : null;
        let ficheClient = client && typeof client === 'object' ? client : {};
        if (estInterne) {
          orgId = null;
          ficheClient = {};
        } else if (orgId) {
          const org = await bdd.doc(`organisations/${orgId}`).get();
          if (!org.exists) return res.status(404).send('organisation inconnue');
          const o = org.data();
          ficheClient = { nom: o.nom || '', email: o.email || '', entreprise: o.entreprise || '' };
        } else if (!emailPlausible(ficheClient.email) && inviter === false && String(ficheClient.nom || ficheClient.entreprise || '').trim()) {
          /* Un client connu dont on n'a pas encore l'adresse : l'organisation
             existe, l'invitation partira quand l'adresse sera renseignee. */
          const orgRef = await bdd.collection('organisations').add({
            nom: String(ficheClient.nom || '').trim(), entreprise: String(ficheClient.entreprise || '').trim(),
            email: '', telephone: '', adresse: '',
            contacts: [], membres: [], roles: {},
            cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
          });
          orgId = orgRef.id;
          await ecrireNotesInternes(orgId, ficheClient.notesInternes);
        } else {
          if (!emailPlausible(ficheClient.email)) return res.status(400).send('email du client requis');
          const orgRef = await bdd.collection('organisations').add({
            nom: String(ficheClient.nom || '').trim(), entreprise: String(ficheClient.entreprise || '').trim(),
            email: normaliserEmail(ficheClient.email), telephone: '', adresse: '',
            contacts: [{ nom: String(ficheClient.nom || '').trim(), email: normaliserEmail(ficheClient.email), role: 'owner', uid: null }],
            membres: [], roles: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
          });
          orgId = orgRef.id;
        }

        const plateformesValides = Array.isArray(plateformes)
          ? plateformes.filter((p) => PLATEFORMES_CONNUES.includes(p)) : [];
        const enDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

        const nouveau = await bdd.collection('projets').add(sansIndefini({
          nom: String(nom).trim(), ref: reference, description: String(description || '').trim(),
          type: String(type || 'application-mobile'), statut: String(statut || (estInterne ? 'en-cours' : 'brouillon')),
          organisation: orgId, client: ficheClient, plateformes: plateformesValides,
          interne: estInterne, contacts: Array.isArray(req.body.contacts) ? req.body.contacts : [],
          /* Les e-mails au client : actifs par défaut. Les couper laisse le
             Hub vivre, sans rien envoyer par e-mail (l'ancienne sourdine). */
          emailsClient: req.body.emailsClient === 'coupes' || req.body.silence === true ? 'coupes' : 'actifs',
          /* Une idée notée pour plus tard : le projet existe, mais se range
             dans les projets à faire, hors du portefeuille en cours. */
          aFaire: req.body.aFaire === true,
          /* Le rideau. Un projet se prepare, se garnit, se chiffre, et
             seulement ensuite s'ouvre au client. Tant qu'il est ferme,
             personne n'est dans « membres » : ce n'est pas un masque a
             l'ecran, c'est l'absence d'acces, refusee par les regles. */
          ouvert: false, ouvertLe: null, premiereOuverture: null,
          membres: [], roles: {}, personnes: [], membresOrganisation: [], accesVersion: 2, compteur: 0,
          progression: { mode: 'manuel', valeur: 0 },
          debut: enDate(debut), cible: enDate(cible), responsable: String(responsable || ''),
          pulse: { enCours: '', derniereLivraison: '', prochaineEtape: '', attenteClient: '' },
          archive: false, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }));

        /* La santé : réservée à l'équipe, hors de la fiche projet que le
           client lit en entier. Le budget et sa note : à la finance seule. */
        await bdd.doc(`projetsInternes/${nouveau.id}`).set({ sante: 'ok', maj: FieldValue.serverTimestamp() });
        await bdd.doc(`budgets/${nouveau.id}`).set({
          budget: Number.isFinite(Number(budget)) && budget !== null && budget !== '' ? Number(budget) : null,
          budgetNote: String(budgetNote || ''), maj: FieldValue.serverTimestamp(),
        });

        /* La note d'une idée vit hors du projet, là où seule l'équipe lit :
           un client membre lit toute la fiche de son projet. */
        if (req.body.aFaire === true && typeof req.body.idee === 'string' && req.body.idee.trim()) {
          await bdd.doc(`idees/${nouveau.id}`).set({ texte: req.body.idee.slice(0, 60000), par: String(responsable || ''), maj: FieldValue.serverTimestamp() });
        }

        /* Les interlocuteurs du projet, préparés : ils n'ont aucun accès et
           ne reçoivent rien tant que le projet n'est pas ouvert. L'ancien
           appel « inviter » vaut un responsable (le contact de la fiche)
           suivi de l'ouverture. */
        const aPreparer = Array.isArray(req.body.interlocuteurs) ? req.body.interlocuteurs.slice(0, 20) : [];
        if (inviter === true && emailPlausible(ficheClient.email) && !aPreparer.some((i) => memeEmail(i.email, ficheClient.email))) {
          aPreparer.unshift({ email: ficheClient.email, nom: ficheClient.nom || '', role: 'responsable' });
        }
        const prepares = [];
        for (const i of aPreparer) {
          if (!i || !emailPlausible(i.email)) continue;
          prepares.push(await ajouterInterlocuteur(identite, { projet: nouveau.id, email: i.email, nom: i.nom, role: acces.ROLES_CLIENT[i.role] ? i.role : 'collaborateur' }));
        }
        let ouverture = null;
        if ((inviter === true || req.body.ouvrir === true) && prepares.length) {
          ouverture = await ouvrirAuClient(identite, { id: nouveau.id, prevenir: req.body.prevenir !== false });
        }
        if (orgId) await synchroniserMembres(orgId);

        /* Une demande de nouveau projet transformee garde son fil. */
        if (demandeProjet) {
          try { await bdd.doc(`demandesProjet/${String(demandeProjet)}`).update({ statut: 'projet', projet: nouveau.id, maj: FieldValue.serverTimestamp() }); } catch (err) { console.warn('Demande de projet non liee', err); }
        }

        await audit('projet-cree', { projet: nouveau.id, ref: reference, organisation: orgId, par: identite.uid });
        console.log(`Projet ${reference} cree : ${nouveau.id}`);
        return res.status(200).json({ ok: true, id: nouveau.id, organisation: orgId, interlocuteurs: prepares.length, ouvert: Boolean(ouverture) });
      }

      /* --- Les accès des clients, projet par projet ----------------------
         « inviterClient » et « retirerClient » sont les anciens noms : ils
         passent par le même chemin. Un ancien appel sans rôle ajoute un
         collaborateur (le moindre droit) ou garde le rôle déjà donné. */
      if (action === 'ajouterInterlocuteur' || action === 'inviterClient') {
        if (!projet || !emailPlausible(email)) return res.status(400).send('projet et email valides requis');
        let roleVoulu = role;
        if (!acces.ROLES_CLIENT[roleVoulu]) {
          const existant = await bdd.doc(`projets/${String(projet)}/interlocuteurs/${cleEmail(email)}`).get();
          roleVoulu = existant.exists && acces.ROLES_CLIENT[existant.data().role] ? existant.data().role : 'collaborateur';
        }
        return res.json(await ajouterInterlocuteur(identite, { projet, email, nom, role: roleVoulu }));
      }
      if (action === 'modifierInterlocuteur') {
        if (!projet) return res.status(400).send('projet requis');
        return res.json(await modifierInterlocuteur(identite, { projet, cle: req.body.cle, email, role, nom }));
      }
      /* --- Le journal des connexions d'un interlocuteur du projet : la
         personne doit en être (fiche d'accès), sinon on ne dit rien. */
      if (action === 'historiqueConnexions') {
        if (!projet) return res.status(400).send('projet requis');
        const { fiche } = await lireInterlocuteur(String(projet), { cle: req.body.cle });
        if (!fiche) return res.status(404).send("Cette personne n'est pas un interlocuteur de ce projet.");
        const entrees = fiche.uid ? await require('./journal-connexions').lire(fiche.uid) : [];
        return res.json({ ok: true, entrees });
      }
      if (action === 'inviterCollegue') {
        return res.json(await inviterCollegue(identite, { projet, email, nom }));
      }
      if (action === 'retirerInterlocuteur' || action === 'retirerClient') {
        if (!projet) return res.status(400).send('projet requis');
        return res.json(await retirerInterlocuteur(identite, { projet, cle: req.body.cle, email, uid }));
      }
      if (action === 'renvoyerInvitation') {
        if (!projet) return res.status(400).send('projet requis');
        const { cle: cleI, fiche } = await lireInterlocuteur(String(projet), { cle: req.body.cle, email });
        if (!fiche || fiche.statut !== 'actif') return res.status(404).send("Cet interlocuteur n'a pas d'accès actif sur ce projet.");
        const r = await inviterInterlocuteur(String(projet), cleI, { par: identite.uid, prevenir: req.body.envoyer !== false });
        await audit('acces.invitation-renvoyee', { projet: String(projet), cle: cleI, envoyee: r.envoyee, par: identite.uid });
        return res.json({ ok: true, ...r });
      }
      /* Un point laissé par la migration (ancien membre sans compte,
         adresse d'un autre rôle) : le classer le retire de la liste, sans
         donner ni retirer aucun accès. */
      if (action === 'classerArbitrageAcces') {
        const ref = bdd.doc(`projetsInternes/${String(id || '')}`);
        const d = await ref.get();
        const points = d.exists ? (d.data().arbitragesAcces || []) : [];
        const restants = points.filter((x) => !(x.type === req.body.type && x.detail === req.body.detail));
        if (restants.length === points.length) return res.status(404).send('Ce point n est plus dans la liste.');
        await ref.update({ arbitragesAcces: restants, maj: FieldValue.serverTimestamp() });
        await audit('acces.arbitrage-classe', { projet: String(id), type: String(req.body.type || ''), par: identite.uid });
        return res.json({ ok: true, restants: restants.length });
      }

      if (action === 'reglerEmailsClient') {
        return res.json(await reglerEmailsClient(identite, { id, emailsClient: req.body.emailsClient }));
      }

      /* --- L'équipe -------------------------------------------------------- */
      if (action === 'ajouterEquipe') return res.json(await ajouterMembreEquipe(identite, { email, nom, role, projets: req.body.projets, permissions: req.body.permissions }));
      if (action === 'modifierEquipe') return res.json(await modifierMembreEquipe(identite, { uid, role, projets: req.body.projets, permissions: req.body.permissions, nom }));
      if (action === 'desactiverEquipe') return res.json(await desactiverMembreEquipe(identite, { uid }));
      if (action === 'reactiverEquipe') return res.json(await reactiverMembreEquipe(identite, { uid }));
      if (action === 'retirerEquipe') return res.json(await retirerMembreEquipe(identite, { uid }));

      /* --- Déposer un devis ou une facture --------------------------------
         Le fichier est déjà dans le stockage (règles : écriture réservée à
         l'équipe). Ici on crée la fiche, et le déclencheur envoie l'e-mail. */
      if (action === 'deposerDocument') {
        if (type !== 'devis' && type !== 'facture') return res.status(400).send('type requis : devis ou facture');
        if (!projet) return res.status(400).send('projet requis');
        if (!String(numero || '').trim()) return res.status(400).send('numero requis');
        if (!String(libelle || '').trim()) return res.status(400).send('libelle requis');
        const somme = Number(montant);
        if (!Number.isFinite(somme) || somme < 0) return res.status(400).send('montant requis, en euros hors taxes');
        const taux = Number(tva) || 0;
        if (taux < 0 || taux > 100) return res.status(400).send('tva entre 0 et 100');
        const projetDoc = await bdd.doc(`projets/${String(projet)}`).get();
        if (!projetDoc.exists) return res.status(404).send('projet inconnu');
        const enDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
        const dateEcheance = enDate(echeance);
        if (echeance && !dateEcheance) return res.status(400).send('echeance illisible');

        /*
         * La portee d'un devis. Le premier devis d'un projet le fonde : sa
         * signature fait demarrer le travail. Les suivants sont des
         * avenants, qui etendent un projet deja lance sans jamais toucher a
         * son etat. Confondre les deux ferait redemarrer un projet a chaque
         * rallonge, ou n'en ferait jamais demarrer aucun.
         */
        let portee = String(req.body.portee || '').trim();
        if (type === 'devis' && !['initial', 'complementaire'].includes(portee)) {
          const deja = await bdd.collection('documents')
            .where('projet', '==', String(projet)).where('type', '==', 'devis').get();
          const fondateur = deja.docs.some((d) => (d.data().portee || 'initial') === 'initial' && d.data().archive !== true);
          portee = fondateur ? 'complementaire' : 'initial';
        }

        const fiche = sansIndefini({
          projet: String(projet), type, numero: String(numero).trim(), libelle: String(libelle).trim().slice(0, 160),
          portee: type === 'devis' ? portee : undefined,
          description: String(description || '').slice(0, 2000),
          montant: somme, tva: taux, ttc: Math.round(somme * (1 + taux / 100) * 100) / 100,
          statut: type === 'devis' ? 'envoye' : 'a-payer',
          date: enDate(date) || FieldValue.serverTimestamp(),
          echeance: type === 'facture' ? dateEcheance : null,
          expiration: type === 'devis' ? dateEcheance : null,
          fichier: fichier && fichier.chemin ? { chemin: String(fichier.chemin).trim(), nom: String(fichier.nom || '').trim(), taille: Number(fichier.taille || 0) || 0 } : null,
          liens: nettoyerLiens(liens),
          reponse: null, archive: false,
        });
        /* Une facture peut porter le devis dont elle découle : le client
           remonte du montant à ce qu'il a accepté. Le devis doit exister et
           être du même projet, sinon on n'écrit rien. */
        if (type === 'facture' && String(req.body.devis || '').trim()) {
          const refDevis = await bdd.doc(`documents/${String(req.body.devis).trim()}`).get();
          if (!refDevis.exists || refDevis.data().type !== 'devis' || refDevis.data().projet !== String(projet)) return res.status(400).send('devis inconnu sur ce projet');
          fiche.devis = refDevis.id;
        }
        /* L'identifiant de la pièce peut être tiré d'avance par l'interface :
           le PDF est alors déjà rangé sous « projets/<p>/pieces/<id>/ », où
           les règles Storage relisent le statut de CETTE pièce. */
        let nouveau;
        const idTire = String(req.body.idDocument || '').trim();
        if (idTire) {
          if (!/^[A-Za-z0-9]{15,40}$/.test(idTire)) return res.status(400).send('idDocument illisible');
          nouveau = bdd.doc(`documents/${idTire}`);
          if ((await nouveau.get()).exists) return res.status(409).send('cette piece existe deja');
          await nouveau.set(fiche);
        } else {
          nouveau = await bdd.collection('documents').add(fiche);
        }

        /* Un devis fondateur pose le projet en attente de signature, s'il
           n'a pas encore commence. Un avenant ne touche a rien. */
        if (type === 'devis' && portee === 'initial'
            && ['brouillon', 'prospect', 'cadrage'].includes(String(projetDoc.data().statut || ''))) {
          await projetDoc.ref.update({ statut: 'devis-envoye', maj: FieldValue.serverTimestamp() });
        }
        console.log(`${type} ${fiche.numero} depose sur le projet ${projet} : ${nouveau.id}${type === 'devis' ? ` (${portee})` : ''}`);
        return res.status(200).json({ ok: true, id: nouveau.id, portee: fiche.portee });
      }

      /* --- Le logo d un projet ---------------------------------------------
         Recu en base64, ecrit dans le stockage, rendu lisible par tous : le
         logo s affiche dans un <img>, sans jeton ni appel supplementaire. */
      if (action === 'poserLogo') {
        if (!id) return res.status(400).send('id du projet requis');
        const refProjet = bdd.doc(`projets/${String(id)}`);
        if (!(await refProjet.get()).exists) return res.status(404).send('projet inconnu');
        if (req.body.retirer === true) {
          await refProjet.update({ logo: null, maj: FieldValue.serverTimestamp() });
          return res.status(200).json({ ok: true, logo: null });
        }
        const { donnees, typeFichier } = req.body || {};
        if (typeof donnees !== 'string' || !donnees) return res.status(400).send('donnees du logo requises, en base64');
        if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(String(typeFichier || ''))) return res.status(400).send('image png, jpeg, webp ou svg attendue');
        const octets = Buffer.from(donnees, 'base64');
        if (octets.length > 2 * 1024 * 1024) return res.status(400).send('logo trop lourd : 2 Mo au maximum');
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[typeFichier];
        const chemin = `projets/${id}/logo-${Date.now()}.${extension}`;
        const fichierStockage = getStorage().bucket().file(chemin);
        await fichierStockage.save(octets, { contentType: typeFichier, metadata: { cacheControl: 'public, max-age=86400' } });
        await fichierStockage.makePublic();
        const url = `https://storage.googleapis.com/${fichierStockage.bucket.name}/${encodeURI(chemin)}`;
        await refProjet.update({ logo: url, maj: FieldValue.serverTimestamp() });
        console.log(`Logo pose sur le projet ${id} : ${url}`);
        return res.status(200).json({ ok: true, logo: url });
      }

      /* --- Completer une piece : son PDF, ses liens, son detail -------------
         Un devis renvoie souvent vers une proposition en ligne, une facture
         vers son justificatif. Les montants et le numero, eux, ne bougent
         pas ici : une piece comptable ne se reecrit pas. */
      if (action === 'majDocument') {
        if (!id) return res.status(400).send('id requis');
        const refDocument = bdd.doc(`documents/${String(id)}`);
        if (!(await refDocument.get()).exists) return res.status(404).send('document inconnu');
        const changements = sansIndefini({
          description: description !== undefined ? String(description).slice(0, 2000) : undefined,
          liens: liens !== undefined ? nettoyerLiens(liens) : undefined,
          fichier: fichier !== undefined
            ? (fichier && fichier.chemin ? { chemin: String(fichier.chemin).trim(), nom: String(fichier.nom || '').trim(), taille: Number(fichier.taille || 0) || 0 } : null)
            : undefined,
          libelle: libelle !== undefined ? String(libelle).trim().slice(0, 160) : undefined,
          echeance: echeance !== undefined ? (echeance ? new Date(echeance) : null) : undefined,
        });
        if (!Object.keys(changements).length) return res.status(400).send('rien a changer');
        await refDocument.update(changements);
        return res.status(200).json({ ok: true, changements: Object.keys(changements) });
      }

      /* --- Joindre le devis d'une demande du calculateur -----------------------
         La demande du client (statut « demande ») devient le devis : numéro,
         montant, TVA, validité, PDF fait ailleurs. Elle garde sa photo. Le
         client la lit « À votre décision » et l'accepte comme tout devis. */
      if (action === 'joindreDevis') {
        if (!id) return res.status(400).send('id requis');
        if (!String(numero || '').trim()) return res.status(400).send('numero requis');
        const somme = Number(montant);
        if (!Number.isFinite(somme) || somme < 0) return res.status(400).send('montant requis, en euros hors taxes');
        const taux = Number(tva) || 0;
        if (taux < 0 || taux > 100) return res.status(400).send('tva entre 0 et 100');
        const refDocument = bdd.doc(`documents/${String(id)}`);
        const doc = await refDocument.get();
        if (!doc.exists) return res.status(404).send('document inconnu');
        if (doc.data().type !== 'devis' || doc.data().statut !== 'demande') return res.status(409).send('cette piece n est pas une demande de devis en attente');
        const enDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
        if (echeance && !enDate(echeance)) return res.status(400).send('echeance illisible');
        await refDocument.update(sansIndefini({
          numero: String(numero).trim().slice(0, 40),
          libelle: libelle !== undefined && String(libelle).trim() ? String(libelle).trim().slice(0, 160) : undefined,
          montant: somme, tva: taux, ttc: Math.round(somme * (1 + taux / 100) * 100) / 100,
          expiration: enDate(echeance),
          fichier: fichier && fichier.chemin ? { chemin: String(fichier.chemin).trim(), nom: String(fichier.nom || '').trim(), taille: Number(fichier.taille || 0) || 0 } : null,
          statut: 'envoye', date: FieldValue.serverTimestamp(), demandeLe: doc.data().date || null,
          recu: { par: identite.uid, nom: (identite.fiche && identite.fiche.nom) || '', le: FieldValue.serverTimestamp() },
        }));
        return res.status(200).json({ ok: true, id: refDocument.id, statut: 'envoye' });
      }

      /* --- Changer le statut d'un devis (equipe) ---------------------------- */
      if (action === 'statutDevis') {
        if (!id) return res.status(400).send('id requis');
        if (!STATUTS_DEVIS.includes(statut)) return res.status(400).send(`statut requis parmi : ${STATUTS_DEVIS.join(', ')}`);
        const refDocument = bdd.doc(`documents/${String(id)}`);
        const doc = await refDocument.get();
        if (!doc.exists) return res.status(404).send('document inconnu');
        if (doc.data().type !== 'devis') return res.status(400).send('ce document n est pas un devis');
        /* Un devis signé hors du Hub (papier, e-mail) se marque ici : la
           réponse porte alors la signature de la personne de l'équipe, que
           le déclencheur vérifie comme il vérifie celle d'un client. */
        const repondu = statut === 'accepte' || statut === 'refuse';
        await refDocument.update(repondu
          ? { statut, reponse: { par: identite.uid, nom: (identite.fiche && identite.fiche.nom) || '', cote: 'equipe', date: FieldValue.serverTimestamp(), commentaire: '' } }
          : { statut });
        return res.status(200).json({ ok: true, statut });
      }

      /* --- Archiver ou restaurer une piece --------------------------------- */
      if (action === 'archiverDocument') {
        if (!id) return res.status(400).send('id requis');
        const refDocument = bdd.doc(`documents/${String(id)}`);
        if (!(await refDocument.get()).exists) return res.status(404).send('document inconnu');
        await refDocument.update({ archive: archive !== false });
        return res.status(200).json({ ok: true, archive: archive !== false });
      }

      /* --- Enregistrer un paiement ----------------------------------------- */
      if (action === 'enregistrerPaiement') {
        if (!facture) return res.status(400).send('facture requise');
        const somme = Number(montant);
        if (!Number.isFinite(somme) || somme <= 0) return res.status(400).send('montant requis');
        const refFacture = bdd.doc(`documents/${String(facture)}`);
        const docFacture = await refFacture.get();
        if (!docFacture.exists || docFacture.data().type !== 'facture') return res.status(404).send('facture inconnue');
        const f = docFacture.data();
        const enDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
        const paiement = await bdd.collection('paiements').add(sansIndefini({
          projet: f.projet, facture: String(facture), montant: Math.round(somme * 100) / 100,
          date: enDate(date) || FieldValue.serverTimestamp(), moyen: MOYENS.includes(moyen) ? moyen : 'autre',
          reference: String(reference || '').slice(0, 80), statut: 'valide',
          cree: FieldValue.serverTimestamp(),
        }));
        /* La note d'un paiement est interne : le client lit la fiche du
           paiement en entier, la note vit donc à part. */
        if (String(note || '').trim()) {
          await bdd.doc(`paiementsInternes/${paiement.id}`).set({ note: String(note).slice(0, 200), maj: FieldValue.serverTimestamp() });
        }
        /* Le statut de la facture suit le total paye. */
        const tous = await bdd.collection('paiements').where('facture', '==', String(facture)).get();
        const paye = tous.docs.reduce((t, d) => t + (d.data().statut !== 'annule' ? Number(d.data().montant) || 0 : 0), 0);
        /* Sans champ ttc, la TVA se recalcule : la retomber au HT faisait
           passer une facture pour payée alors qu'il restait la taxe. */
        const du = typeof f.ttc === 'number' ? f.ttc : (Number(f.montant) || 0) * (1 + (Number(f.tva) || 0) / 100);
        /* Le client avait déclaré ce règlement : l'enregistrer le confirme,
           et sa fiche passe de « en attente de confirmation » à « Confirmé ». */
        const confirmation = f.reglementDeclare && !f.reglementDeclare.confirme ? { 'reglementDeclare.confirme': FieldValue.serverTimestamp() } : {};
        await refFacture.update({ statut: paye + 0.005 >= du ? 'payee' : 'partielle', ...confirmation });
        return res.status(200).json({ ok: true, id: paiement.id, paye, statut: paye + 0.005 >= du ? 'payee' : 'partielle' });
      }

      /* --- Les organisations ----------------------------------------------- */
      if (action === 'creerOrganisation') {
        if (!String(entreprise || nom || '').trim()) return res.status(400).send('nom requis');
        if (!emailPlausible(email)) return res.status(400).send('email valide requis');
        await exigerRole(email, 'client');
        const orgRef = await bdd.collection('organisations').add(sansIndefini({
          nom: String(nom || '').trim(), entreprise: String(entreprise || '').trim(), email: normaliserEmail(email),
          telephone: String(telephone || '').trim(), adresse: String(adresse || '').trim(),
          contacts: [{ nom: String(nom || '').trim(), email: normaliserEmail(email), role: 'owner', uid: null }],
          membres: [], roles: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }));
        await ecrireNotesInternes(orgRef.id, notesInternes);
        await bdd.collection('audit').add({ action: 'organisation-creee', organisation: orgRef.id, date: FieldValue.serverTimestamp() });
        return res.status(200).json({ ok: true, id: orgRef.id });
      }

      if (action === 'majOrganisation') {
        if (!id) return res.status(400).send('id requis');
        const orgRef = bdd.doc(`organisations/${String(id)}`);
        if (!(await orgRef.get()).exists) return res.status(404).send('organisation inconnue');
        if (email && !emailPlausible(email)) return res.status(400).send('email invalide');
        /* L'adresse d'une fiche client est celle à qui l'on écrit : elle ne
           peut pas être celle d'un testeur ou d'un membre de l'équipe. Elle
           ne déplace AUCUN accès pour autant : l'accès appartient aux comptes
           invités, pas à l'adresse affichée sur la fiche. */
        if (email) await exigerRole(email, 'client');
        await orgRef.update(sansIndefini({
          nom: nom !== undefined ? String(nom).trim() : undefined, entreprise: entreprise !== undefined ? String(entreprise).trim() : undefined,
          email: email !== undefined ? normaliserEmail(email) : undefined, telephone: telephone !== undefined ? String(telephone).trim() : undefined,
          adresse: adresse !== undefined ? String(adresse).trim() : undefined,
          maj: FieldValue.serverTimestamp(),
        }));
        /* Les notes internes ne viennent que du nouveau cockpit
           (versionInterne 2), qui les lit dans organisationsInternes. Un
           ONGLET RESTÉ OUVERT sur l'ancien cockpit envoie ce qu'il lit sur
           la fiche : après la migration, une chaîne vide, qui effacerait la
           vraie note. Avant la migration, la fiche porte encore la note :
           on l'y écrit, comme avant, et la migration la déplacera. */
        if (notesInternes !== undefined) {
          if (req.body.versionInterne === 2) await ecrireNotesInternes(String(id), notesInternes);
          else if ('notesInternes' in ((await orgRef.get()).data() || {})) await orgRef.update({ notesInternes: String(notesInternes).slice(0, 8000) });
          else console.warn(`majOrganisation ${id} : notes d'un ancien cockpit ignorées (déjà migrées)`);
        }
        return res.status(200).json({ ok: true });
      }

      /* --- Changer le statut d'une facture -------------------------------- */
      if (action === 'statutFacture') {
        if (!id) return res.status(400).send('id requis');
        if (!STATUTS_FACTURE.includes(statut)) {
          return res.status(400).send(`statut requis parmi : ${STATUTS_FACTURE.join(', ')}`);
        }
        const refDocument = bdd.doc(`documents/${String(id)}`);
        const doc = await refDocument.get();
        if (!doc.exists) return res.status(404).send('document inconnu');
        if (doc.data().type !== 'facture') return res.status(400).send('ce document n\'est pas une facture');

        /* Marquer payée à la main confirme aussi un règlement déclaré par le client. */
        const declare = doc.data().reglementDeclare;
        await refDocument.update(statut === 'payee' && declare && !declare.confirme
          ? { statut, 'reglementDeclare.confirme': FieldValue.serverTimestamp() }
          : { statut });
        console.log(`Facture ${doc.data().numero || id} passée à ${statut}`);
        return res.status(200).json({ ok: true, statut });
      }

      /* --- Remettre d aplomb les projets d avant le hub ---------------------
         Les projets crees par l ancienne console portent « actif », un statut
         qui n existe plus, et n ont pas d organisation. Sans cela ils
         disparaissent du filtre des projets actifs et de la fiche client. */
      if (action === 'migrerProjets') {
        const STATUTS_PROJET = ['prospect', 'cadrage', 'planifie', 'en-cours', 'attente-client',
          'en-revue', 'livraison', 'maintenance', 'termine', 'suspendu', 'archive'];
        const ALIAS = { actif: 'en-cours', inactif: 'suspendu', 'en-pause': 'suspendu' };
        const projets = await bdd.collection('projets').get();
        const rapport = [];

        for (const doc of projets.docs) {
          const p = doc.data();
          const changements = {};

          const statutActuel = String(p.statut || '');
          if (!STATUTS_PROJET.includes(statutActuel)) {
            changements.statut = ALIAS[statutActuel] || 'en-cours';
          }
          if (!p.progression || typeof p.progression !== 'object') changements.progression = { mode: 'manuel', valeur: 0 };
          if (!p.pulse || typeof p.pulse !== 'object') changements.pulse = { enCours: '', derniereLivraison: '', prochaineEtape: '', attenteClient: '' };
          if (!p.type) changements.type = 'application-mobile';
          if (!Array.isArray(p.membresOrganisation)) changements.membresOrganisation = [];
          if (typeof p.description !== 'string') changements.description = '';
          if (p.archive === undefined) changements.archive = false;

          /* L organisation : celle qui porte deja cette adresse, sinon une neuve. */
          let orgId = p.organisation || null;
          const email = normaliserEmail((p.client || {}).email);
          if (!orgId && emailPlausible(email)) {
            const deja = await bdd.collection('organisations').where('email', '==', email).limit(1).get();
            if (!deja.empty) orgId = deja.docs[0].id;
            else {
              const orgRef = await bdd.collection('organisations').add({
                nom: String((p.client || {}).nom || '').trim(),
                entreprise: String((p.client || {}).entreprise || '').trim(),
                email, telephone: '', adresse: '',
                contacts: [{ nom: String((p.client || {}).nom || '').trim(), email, role: 'owner', uid: null }],
                membres: [], roles: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
              });
              orgId = orgRef.id;
            }
            changements.organisation = orgId;
          }

          if (Object.keys(changements).length) {
            changements.maj = FieldValue.serverTimestamp();
            await doc.ref.update(changements);
          }

          /* Les membres deja presents sur le projet deviennent membres de
             l organisation, pour que la fiche client soit juste. */
          if (orgId && (p.membres || []).length) {
            const orgRef = bdd.doc(`organisations/${orgId}`);
            const org = await orgRef.get();
            if (org.exists) {
              const contacts = org.data().contacts || [];
              const roles = org.data().roles || {};
              for (const uid of p.membres) {
                roles[uid] = roles[uid] || 'owner';
                if (!contacts.some((c) => c.uid === uid)) {
                  let fiche = {};
                  try { const u = await getAuth().getUser(uid); fiche = { nom: u.displayName || '', email: normaliserEmail(u.email) }; } catch (err) { fiche = {}; }
                  if (fiche.email) contacts.push({ nom: fiche.nom, email: fiche.email, role: 'owner', uid });
                }
              }
              await orgRef.update({ membres: FieldValue.arrayUnion(...p.membres), roles, contacts, maj: FieldValue.serverTimestamp() });
            }
          }
          if (orgId) await synchroniserMembres(orgId);

          rapport.push({
            id: doc.id, nom: p.nom, ref: p.ref,
            statutAvant: statutActuel || '(vide)', statutApres: changements.statut || statutActuel,
            organisation: orgId, membres: (p.membres || []).length,
            champsAjoutes: Object.keys(changements).filter((c) => c !== 'maj'),
          });
        }

        console.log(`Migration de ${rapport.length} projet(s)`);
        return res.status(200).json({ ok: true, projets: rapport });
      }

      /* --- Un etat des lieux, pour verifier sans deviner -------------------- */
      /* --- Poser une demande depuis le cockpit -----------------------------
         Une anomalie remontée par message ou par téléphone doit rejoindre
         le fil des demandes, sinon elle vit dans une boîte mail et le
         client ne peut pas la suivre. L'auteur est Capmedia : c'est nous
         qui l'inscrivons, au nom de ce qu'on nous a dit. */
      if (action === 'creerDemande') {
        if (!projet) return res.status(400).send('projet requis');
        const titre = String(req.body.titre || '').trim();
        if (!titre) return res.status(400).send('titre requis');
        const projetDoc = await bdd.doc(`projets/${String(projet)}`).get();
        if (!projetDoc.exists) return res.status(404).send('projet inconnu');

        const TYPES_DEMANDE = ['bug', 'modification', 'fonctionnalite', 'amelioration', 'question', 'technique', 'contenu', 'devis', 'demande', 'autre'];
        const URGENCES_DEMANDE = ['bloquant', 'critique', 'important', 'mineur'];
        const typeDemande = TYPES_DEMANDE.includes(String(req.body.typeDemande || '')) ? String(req.body.typeDemande) : 'demande';
        const urgence = URGENCES_DEMANDE.includes(String(req.body.urgence || '')) ? String(req.body.urgence) : 'important';

        const nouveau = await bdd.collection('tickets').add(sansIndefini({
          numero: null, projet: String(projet), composant: String(req.body.composant || ''),
          titre: titre.slice(0, 120), description: String(description || '').slice(0, 6000),
          type: typeDemande, urgence, statut: String(req.body.statut || 'nouveau'),
          plateforme: PLATEFORMES_CONNUES.includes(String(req.body.plateforme || '')) ? String(req.body.plateforme) : '',
          version: String(req.body.version || ''), etapes: String(req.body.etapes || ''),
          attendu: String(req.body.attendu || ''), obtenu: String(req.body.obtenu || ''),
          contexte: String(req.body.contexte || ''), appareil: String(req.body.appareil || ''),
          liens: Array.isArray(liens) ? liens.filter((l) => typeof l === 'string' && /^https?:\/\//.test(l)).slice(0, 10) : [],
          assigne: null, auteur: { uid: null, nom: String(nom || EQUIPE_NOM), email: '', cote: 'equipe' },
          pieces: [], archive: false, resolu: null, qualification: req.body.qualification || null, devis: null,
          lu: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }));
        await audit('demande-creee-cockpit', { projet: String(projet), ticket: nouveau.id, titre });
        return res.json({ ok: true, id: nouveau.id });
      }

      /* --- Ouvrir le projet au client, le refermer --------------------------
         Voir ouvrirAuClient et fermerAuClient plus haut : la première
         ouverture est un événement (une lettre et un résumé par personne),
         jamais une avalanche de ce qui s'est accumulé pendant la préparation. */
      if (action === 'ouvrirAuClient') {
        if (!id) return res.status(400).send('id du projet requis');
        return res.json(await ouvrirAuClient(identite, { id, prevenir: req.body.prevenir }));
      }
      if (action === 'fermerAuClient') {
        if (!id) return res.status(400).send('id du projet requis');
        return res.json(await fermerAuClient(identite, { id }));
      }

      /* --- Un lien d'invitation -------------------------------------------
         Le client n'a rien a retenir ni a retaper : il clique, son adresse
         est deja la, il demande son code. Le jeton ne porte aucun pouvoir
         par lui-meme, il ne fait que pre-remplir l'adresse ; c'est le code
         recu dans la boite qui ouvre la session. */
      /* --- Le vivier de testeurs ------------------------------------------
         Un testeur n'est pas un client : il n'est membre d'aucun projet, il
         ne voit que son propre travail, et son accès tient à la revendication
         que la connexion lui pose. On crée donc son compte ici, on l'inscrit
         au vivier, et c'est tout : aucun rattachement à un projet au sens des
         membres, sans quoi il verrait les demandes et les devis. */
      if (action === 'inscrireTesteur') {
        const adresse = normaliserEmail(email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse)) return res.status(400).send('adresse invalide');
        if (!String(prenom || '').trim()) return res.status(400).send('prenom requis');
        const surQuoi = Array.isArray(req.body.plateformes) ? req.body.plateformes.map(String) : [];
        if (!surQuoi.length) return res.status(400).send('plateformes requises');
        if (surQuoi.some((x) => !['ios', 'android', 'web'].includes(x))) return res.status(400).send('plateforme inconnue');

        /* Une adresse déjà cliente ou d'équipe ne devient pas testeur : le
           refus AVANT de créer quoi que ce soit, pour ne rien laisser derrière. */
        await exigerRole(adresse, 'testeur');

        let compte;
        try { compte = await getAuth().getUserByEmail(adresse); }
        catch (err) { compte = await getAuth().createUser({ email: adresse, emailVerified: true, displayName: String(prenom).trim() }); }

        const projets = Array.isArray(req.body.projets) ? req.body.projets.map(String) : (projet ? [String(projet)] : []);
        await bdd.doc(`testeurs/${compte.uid}`).set({
          prenom: String(prenom).trim(), email: adresse,
          /* Le mobile à côté des plateformes : c'est lui que la répartition
             regarde pour décider qui voit quoi sur iOS et sur Android. Un
             testeur qui ne fait que le web n'en a pas. */
          plateformes: surQuoi,
          mobile: surQuoi.find((x) => x !== 'web') || '',
          projets, actif: true,
          profil: {
            sexe: String((profil || {}).sexe || ''),
            age: String((profil || {}).age || ''),
            fonction: String((profil || {}).fonction || ''),
            aisance: String((profil || {}).aisance || ''),
            langue: String((profil || {}).langue || 'fr'),
            certifie: Boolean((profil || {}).certifie),
          },
          cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }, { merge: true });

        /* L'invitation, sans quoi le testeur ne sait pas qu'il est attendu :
           l'inscription créait son compte en silence, et il n'avait aucun
           moyen de deviner ni l'adresse de son espace, ni son rôle.

           Un envoi qui échoue ne doit pas faire échouer l'inscription : le
           testeur existe, et la lettre se renvoie. On le consigne. */
        let invite = false;
        try {
          const premier = projets[0] || '';
          const fiche = premier ? await lireProjet(premier) : null;
          const inv = await invitations.creer({ type: 'testeur', email: adresse, nom: String(prenom).trim(), uid: compte.uid, role: 'testeur', projets, projetNom: fiche ? (fiche.nom || '') : '', par: identite.uid, envoyee: true });
          await mettreEnFile('invitation-testeur', [{ email: adresse, nom: String(prenom).trim() }], {
            prenom: String(prenom).trim(),
            email: adresse,
            projetNom: fiche ? (fiche.nom || '') : '',
            plateformes: surQuoi,
            lien: inv.lien,
          }, { projet: premier || null, evenement: 'invitation-testeur' });
          invite = true;
        } catch (err) {
          console.error(`Invitation du testeur ${adresse} non mise en file`, err);
        }

        await audit('testeur.inscrit', { uid: compte.uid, email: adresse, projets, invite });
        return res.json({ ok: true, uid: compte.uid, invite });
      }

      if (action === 'majTesteur') {
        const tid = String(testeur || uid || '');
        if (!tid) return res.status(400).send('testeur requis');
        const fiche = await bdd.doc(`testeurs/${tid}`).get();
        if (!fiche.exists) return res.status(404).send('testeur inconnu');

        const changements = { maj: FieldValue.serverTimestamp() };
        if (prenom !== undefined) changements.prenom = String(prenom).trim();
        if (Array.isArray(req.body.plateformes)) {
          const liste = req.body.plateformes.map(String);
          if (!liste.length) return res.status(400).send('plateformes requises');
          if (liste.some((x) => !['ios', 'android', 'web'].includes(x))) return res.status(400).send('plateforme inconnue');
          changements.plateformes = liste;
          changements.mobile = liste.find((x) => x !== 'web') || '';
        } else if (mobile !== undefined) changements.mobile = String(mobile);
        if (archive !== undefined) changements.actif = archive !== true;
        if (Array.isArray(req.body.projets)) changements.projets = req.body.projets.map(String);
        if (profil) changements.profil = { ...(fiche.data().profil || {}), ...profil };

        await bdd.doc(`testeurs/${tid}`).set(changements, { merge: true });
        await audit('testeur.modifie', { uid: tid, champs: Object.keys(changements) });
        return res.json({ ok: true });
      }

      /* Renvoyer l'invitation. Utile pour les testeurs inscrits avant que la
         lettre existe, et pour ceux dont la boîte l'a perdue : sans elle, ils
         ne savent pas qu'ils sont attendus. */
      if (action === 'inviterTesteur') {
        const tid = String(testeur || uid || '');
        if (!tid) return res.status(400).send('testeur requis');
        const fiche = await bdd.doc(`testeurs/${tid}`).get();
        if (!fiche.exists) return res.status(404).send('testeur inconnu');
        const t = fiche.data();
        if (t.actif === false) return res.status(409).send('ce testeur est retire du vivier');

        const premier = (t.projets || [])[0] || '';
        const p = premier ? await lireProjet(premier) : null;
        const inv = await invitations.creer({ type: 'testeur', email: t.email, nom: t.prenom || '', uid: tid, role: 'testeur', projets: t.projets || [], projetNom: p ? (p.nom || '') : '', par: identite.uid, envoyee: true });
        const envoi = await mettreEnFile('invitation-testeur', [{ email: t.email, nom: t.prenom || '' }], {
          prenom: t.prenom || '',
          email: t.email,
          projetNom: p ? (p.nom || '') : '',
          plateformes: t.plateformes || (t.mobile ? [t.mobile, 'web'] : []),
          lien: inv.lien,
        }, { projet: premier || null, evenement: 'invitation-testeur' });
        if (!envoi) return res.status(502).send('invitation non mise en file');
        await audit('testeur.invite', { uid: tid, email: t.email });
        return res.json({ ok: true });
      }

      /* Retirer un testeur du vivier ne supprime pas ses passages : ils sont
         la mémoire de la campagne, et les effacer falsifierait le rapport.
         On ferme l'accès, on ne réécrit pas l'histoire. */
      if (action === 'retirerTesteur') {
        const tid = String(testeur || uid || '');
        if (!tid) return res.status(400).send('testeur requis');

        /* Deux gestes différents, et le second ne se rattrape pas.

           « Retirer » ferme l'accès et garde la fiche : les passages d'une
           campagne portent l'identifiant du testeur, et sans sa fiche le
           rapport ne sait plus de qui il parle. C'est le geste courant.

           « Supprimer » efface tout, y compris le compte : pour un essai,
           une erreur de saisie, ou quelqu'un qui demande son effacement.
           Il est refusé si le testeur a consigné le moindre passage, parce
           qu'une campagne amputée de ses résultats ment. */
        const definitif = req.body.definitif === true;
        const fiche = await bdd.doc(`testeurs/${tid}`).get();

        if (definitif) {
          /* Supprimer, c'est TOUT effacer : pour une adresse d'essai, une
             erreur de saisie, ou quelqu'un qui demande son effacement. Le
             geste prudent, qui garde les résultats, reste « Retirer ».

             La version précédente refusait si le testeur avait consigné un
             passage, et le vérifiait par une requête en groupe qui exige un
             index absent en production : la requête échouait, et TOUTE
             suppression était refusée, même d'un testeur sans aucune
             entrée. On parcourt donc projet par projet, campagne par
             campagne : aucune requête en groupe, aucun index requis. */
          const email = fiche.exists ? String(fiche.data().email || '') : '';
          const bilan = { passages: 0, avis: 0, campagnes: 0, temoins: 0, preuves: 0 };

          const projets = await bdd.collection('projets').get();
          for (const p of projets.docs) {
            const campagnes = await p.ref.collection('campagnes').get();
            for (const c of campagnes.docs) {
              /* Ses passages : l'identifiant commence par son uid. */
              const passages = await c.ref.collection('passages').get();
              for (const x of passages.docs) {
                if (x.id.startsWith(`${tid}__`) || x.data().testeur === tid) { await x.ref.delete(); bilan.passages += 1; }
              }
              /* Son avis. */
              const avis = c.ref.collection('appreciations').doc(tid);
              if ((await avis.get()).exists) { await avis.delete(); bilan.avis += 1; }
              /* Sa place dans la campagne et son affectation. */
              const cd = c.data();
              if ((cd.testeurs || []).includes(tid) || (cd.affectation && cd.affectation[tid])) {
                await c.ref.update({ testeurs: FieldValue.arrayRemove(tid), [`affectation.${tid}`]: FieldValue.delete() });
                bilan.campagnes += 1;
              }
            }
            /* Ses témoignages dans les anomalies : une anomalie qui n'a plus
               aucun témoin et qui venait d'un testeur disparaît avec lui. */
            const anomalies = await p.ref.collection('anomalies').get();
            for (const a of anomalies.docs) {
              const d = a.data();
              const temoins = Array.isArray(d.temoins) ? d.temoins : [];
              const restants = temoins.filter((t) => t.testeur !== tid);
              if (restants.length === temoins.length) continue;
              bilan.temoins += temoins.length - restants.length;
              if (!restants.length && d.origine === 'testeur') { await a.ref.delete(); continue; }
              await a.ref.update({
                temoins: restants,
                passages: (d.passages || []).filter((x) => !String(x).startsWith(`${tid}__`)),
                plateformes: [...new Set(restants.map((t) => t.plateforme).filter(Boolean))],
                maj: FieldValue.serverTimestamp(),
              });
            }
          }

          /* Ses preuves : campagnes/{projet}/{campagne}/{uid}/... */
          try {
            const [fichiers] = await getStorage().bucket().getFiles({ prefix: 'campagnes/' });
            for (const f of fichiers.filter((x) => x.name.split('/')[3] === tid)) { await f.delete().catch(() => {}); bilan.preuves += 1; }
          } catch (err) { console.error('Preuves du testeur non effacées', err); }

          /* Sa fiche, son profil public, son compte, et sa file de connexion. */
          await invitations.revoquerCelles({ type: 'testeur', uid: tid });
          await bdd.doc(`testeurs/${tid}/public/profil`).delete().catch(() => {});
          await bdd.doc(`testeurs/${tid}`).delete().catch(() => {});

          /* Le compte de connexion ne part que s'il ne sert à RIEN d'autre.
             Le 23/09/2026, supprimer un testeur a effacé le compte d'un client
             qui portait la même adresse : le client a perdu son accès. La
             règle d'un seul rôle l'empêche désormais, mais des données
             d'avant peuvent encore mélanger les rôles. Dans ce cas on retire
             seulement la revendication de testeur, et le compte reste. */
          const sertAilleurs = (await bdd.doc(`equipe/${tid}`).get()).exists
            || !(await bdd.collection('projets').where('membres', 'array-contains', tid).limit(1).get()).empty
            || !(await bdd.collection('organisations').where('membres', 'array-contains', tid).limit(1).get()).empty;
          bilan.compte = sertAilleurs ? 'garde' : 'efface';
          if (sertAilleurs) {
            try {
              const u = await getAuth().getUser(tid);
              const gardees = { ...(u.customClaims || {}) };
              delete gardees.testeur;
              await getAuth().setCustomUserClaims(tid, gardees);
              await getAuth().revokeRefreshTokens(tid);
            } catch (err) { /* compte parti */ }
          } else {
            try { await getAuth().deleteUser(tid); } catch (err) { /* compte deja parti */ }
          }
          /* Les lettres en file ne partent que pour un compte effacé : celles
             d'un client qui garde son compte lui appartiennent encore. */
          if (email && !sertAilleurs) {
            const envois = await bdd.collection('envois').get();
            for (const e of envois.docs) {
              if ((e.data().a || []).some((x) => normaliserEmail(x.email) === normaliserEmail(email))) await e.ref.delete().catch(() => {});
            }
          }

          await audit('testeur.supprime', { uid: tid, email, ...bilan });
          return res.json({ ok: true, supprime: true, ...bilan });
        }

        /* Le retrait : l'accès se ferme, la fiche reste, les résultats
           aussi. La revendication part, et les jetons en cours sont
           révoqués, sinon l'accès survivrait jusqu'à leur expiration. */
        await bdd.doc(`testeurs/${tid}`).set({ actif: false, maj: FieldValue.serverTimestamp() }, { merge: true });
        /* Ses liens d'invitation encore vivants ne pré-remplissent plus rien. */
        await invitations.revoquerCelles({ type: 'testeur', uid: tid });
        try {
          const compte = await getAuth().getUser(tid);
          const gardees = { ...(compte.customClaims || {}) };
          delete gardees.testeur;
          await getAuth().setCustomUserClaims(tid, gardees);
          await getAuth().revokeRefreshTokens(tid);
        } catch (err) { /* compte parti */ }
        await audit('testeur.retire', { uid: tid });
        return res.json({ ok: true, supprime: false });
      }

      /* Le lien d'invitation d'un interlocuteur, à copier dans un message.
         Il ne donne aucun accès par lui-même : il pré-remplit l'adresse,
         c'est le code reçu dans la boîte qui ouvre la session. Il n'existe
         que pour une personne qui a déjà un accès actif sur un projet
         ouvert : on n'invite pas dans un espace fermé. */
      if (action === 'creerInvitation') {
        const adresse = normaliserEmail(email);
        if (!projet) return res.status(400).send("Projet requis : un lien d'invitation mène à un projet.");
        if (!emailPlausible(adresse)) return res.status(400).send('adresse invalide');
        /* Le conflit de rôle d'abord : c'est le motif le plus utile à lire. */
        await exigerRole(adresse, 'client');
        const { cle: cleI, fiche } = await lireInterlocuteur(String(projet), { email: adresse });
        if (!fiche || fiche.statut !== 'actif') {
          return res.status(409).send("Ajoutez d'abord cette personne aux accès du projet (onglet Accès client), avec son rôle.");
        }
        const r = await inviterInterlocuteur(String(projet), cleI, { par: identite.uid, prevenir: req.body.envoyer === true });
        await audit('invitation.creee', { projet: String(projet), cle: cleI, envoyee: r.envoyee, par: identite.uid });
        return res.json({ ok: true, lien: r.lien, envoyee: r.envoyee, motif: r.motif, expire: '14 jours' });
      }

      /* Couper un lien qui a fuité, sans toucher à l'accès. Le jeton, ou
         l'identifiant de l'invitation (son empreinte). */
      if (action === 'revoquerInvitation') {
        const jeton = String(req.body.jeton || '').trim();
        const idInv = String(req.body.invitation || '').trim() || (jeton ? invitations.idDe(jeton) : '');
        if (!idInv) return res.status(400).send('jeton ou invitation requis');
        const fait = await invitations.revoquer(idInv) || (jeton ? await invitations.revoquer(jeton) : false);
        if (!fait) return res.status(404).send('invitation inconnue');
        await audit('invitation.revoquee', { invitation: idInv, par: identite.uid });
        return res.json({ ok: true });
      }

      /* Les jetons des robots de tests. Un jeton ouvre un seul projet, en
         écriture de verdicts : il ne se relit jamais, on ne garde que son
         empreinte. */
      if (action === 'creerJetonRobot') {
        try { return res.json({ ok: true, ...(await robot.creerJetonRobot({ projet, nom })) }); }
        catch (err) { if (err.code === 404) return res.status(404).send(err.message); throw err; }
      }
      if (action === 'revoquerJetonRobot') {
        try { return res.json(await robot.revoquerJetonRobot({ id })); }
        catch (err) { if (err.code === 404) return res.status(404).send(err.message); throw err; }
      }

      /* La porte d'entrée par code repose sur des jetons signés par le
         compte de service. Si la permission de signature manque, personne
         ne peut plus entrer : on le vérifie sans rien envoyer à personne. */
      if (action === 'verifierSignature') {
        const cible = String(uid || '').trim();
        const adresse = normaliserEmail(email);
        const bilan = {};
        if (cible) {
          try { const j = await getAuth().createCustomToken(cible); bilan.jetonPersonnalise = typeof j === 'string' && j.length > 100; }
          catch (err) { bilan.jetonPersonnalise = false; bilan.motifJeton = String(err && err.message || err).slice(0, 200); }
        }
        /* La voie reellement empruntee par la porte : un acces a usage
           unique. On ne rend jamais le lien, seulement s il se fabrique. */
        if (adresse) {
          try { const l = await getAuth().generateSignInWithEmailLink(adresse, { url: courriels.BASE, handleCodeInApp: true }); bilan.accesUnique = typeof l === 'string' && l.includes('oobCode='); }
          catch (err) { bilan.accesUnique = false; bilan.motifAcces = String(err && err.message || err).slice(0, 200); }
        }
        return res.json({ ok: true, ...bilan });
      }

      if (action === 'diagnostic') {
        const [projets, organisations, equipe] = await Promise.all([
          bdd.collection('projets').get(), bdd.collection('organisations').get(), bdd.collection('equipe').get(),
        ]);
        return res.status(200).json({
          ok: true,
          projets: projets.docs.map((d) => { const p = d.data(); return { id: d.id, nom: p.nom, ref: p.ref, statut: p.statut, archive: Boolean(p.archive), organisation: p.organisation || null, membres: (p.membres || []).length, client: (p.client || {}).email || null, progression: p.progression || null, ouvert: p.ouvert === true, emailsClient: p.emailsClient || null, plateformes: p.plateformes || [], interne: p.interne === true, contacts: (p.contacts || []).length }; }),
          organisations: organisations.docs.map((d) => ({ id: d.id, nom: d.data().entreprise || d.data().nom, email: d.data().email, membres: (d.data().membres || []).length })),
          equipe: equipe.docs.map((d) => ({ uid: d.id, email: d.data().email, role: d.data().role })),
          documents: (await bdd.collection('documents').get()).docs.map((d) => { const x = d.data(); return { id: d.id, projet: x.projet, type: x.type, numero: x.numero, montant: x.montant, statut: x.statut, pdf: Boolean(x.fichier && x.fichier.chemin), liens: (x.liens || []).length }; }),
        });
      }

      /* --- Amorcer un projet avec son contenu ------------------------------
         Un outil d ouverture : il ecrit composants, jalons, liens, versions,
         reunions, notes, blocages et taches d un coup. Le garde-fou est
         volontairement strict : l appel doit enumerer les adresses attendues
         sur le projet, et l action refuse si une autre apparait. On ne
         remplit pas l espace d un client par accident. */
      if (action === 'remplirProjet') {
        const { contenu, adressesAttendues } = req.body || {};
        if (!id) return res.status(400).send('id du projet requis');
        if (!Array.isArray(adressesAttendues) || !adressesAttendues.length) {
          return res.status(400).send('adressesAttendues requises : la liste des adresses autorisees sur ce projet');
        }
        const refProjet = bdd.doc(`projets/${String(id)}`);
        const docProjet = await refProjet.get();
        if (!docProjet.exists) return res.status(404).send('projet inconnu');
        const projet = docProjet.data();

        const permises = adressesAttendues.map(normaliserEmail);
        const presentes = [];
        if (projet.client && projet.client.email) presentes.push(normaliserEmail(projet.client.email));
        for (const c of (projet.contacts || [])) if (c && c.email) presentes.push(normaliserEmail(c.email));
        for (const i of (await refProjet.collection('interlocuteurs').get()).docs) if (i.data().statut === 'actif') presentes.push(normaliserEmail(i.data().email));
        for (const uid of (projet.membres || [])) {
          try { const u = await getAuth().getUser(uid); if (u.email) presentes.push(normaliserEmail(u.email)); }
          catch (err) { return res.status(409).send(`membre ${uid} illisible, remplissage refuse`); }
        }
        const intruses = presentes.filter((e) => !permises.includes(e));
        if (intruses.length) {
          return res.status(409).send(`remplissage refuse : ${intruses.join(', ')} n est pas dans la liste attendue`);
        }

        const c = contenu && typeof contenu === 'object' ? contenu : {};
        const enDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
        const compte = {};

        if (c.projet && typeof c.projet === 'object') {
          const p = c.projet;
          await refProjet.update(sansIndefini({
            nom: p.nom, description: p.description, type: p.type, statut: p.statut,
            plateformes: Array.isArray(p.plateformes) ? p.plateformes.filter((x) => PLATEFORMES_CONNUES.includes(x)) : undefined,
            debut: enDate(p.debut), cible: enDate(p.cible), progression: p.progression, pulse: p.pulse,
            emailsClient: p.emailsClient || (p.silence === true ? 'coupes' : undefined),
            interne: p.interne, contacts: Array.isArray(p.contacts) ? p.contacts : undefined,
            client: p.client, organisation: p.organisation, ref: p.ref, logo: p.logo,
            maj: FieldValue.serverTimestamp(),
          }));
          compte.projet = 1;
          /* La santé dans projetsInternes, le budget dans budgets : jamais
             dans la fiche lue par le client, et le budget à la finance seule. */
          const interne = sansIndefini({ sante: p.sante });
          if (Object.keys(interne).length) await bdd.doc(`projetsInternes/${String(id)}`).set({ ...interne, maj: FieldValue.serverTimestamp() }, { merge: true });
          const budget = sansIndefini({ budget: p.budget, budgetNote: p.budgetNote });
          if (Object.keys(budget).length) await bdd.doc(`budgets/${String(id)}`).set({ ...budget, maj: FieldValue.serverTimestamp() }, { merge: true });
        }

        /* Chaque collection est reecrite a l identique si l element porte un
           identifiant : relancer l outil ne cree pas de doublon. */
        const poser = async (liste, chemin, transforme) => {
          if (!Array.isArray(liste) || !liste.length) return 0;
          for (const item of liste) {
            const donnees = sansIndefini({ ...transforme(item), maj: FieldValue.serverTimestamp() });
            /* Les identifiants du catalogue ne sont uniques qu'à l'intérieur
               d'une fiche : dans une collection globale, « client » écrasait
               la note d'un autre projet. Le projet préfixe donc l'identifiant. */
            const global = !chemin.includes('/');
            const cle = global ? `${id}-${item.id}` : item.id;
            if (item.id) await bdd.doc(`${chemin}/${cle}`).set({ ...donnees, cree: donnees.cree || FieldValue.serverTimestamp() }, { merge: true });
            else await bdd.collection(chemin).add({ ...donnees, cree: FieldValue.serverTimestamp() });
          }
          return liste.length;
        };

        compte.composants = await poser(c.composants, `projets/${id}/composants`, (x) => ({
          nom: x.nom, type: x.type, statut: x.statut || 'en-cours', progression: Number(x.progression) || 0,
          version: x.version || '', versionPrep: x.versionPrep || '', environnement: x.environnement || '',
          techno: x.techno || [], responsable: x.responsable || '', description: x.description || '', ordre: Number(x.ordre) || 0,
          lien: x.lien || '',
        }));
        /* Les fiches techniques se posent sur des briques existantes : on
           fusionne, sans toucher au reste du composant. */
        if (Array.isArray(c.fichesTechniques) && c.fichesTechniques.length) {
          let n = 0;
          const tous = await bdd.collection(`projets/${id}/composants`).get();
          for (const f of c.fichesTechniques) {
            const vises = Array.isArray(f.composants) && f.composants.length
              ? tous.docs.filter((d) => f.composants.includes(d.id))
              : tous.docs;
            for (const d of vises) {
              /* Hors du composant : la fiche porte des comptes et des accès,
                 et le composant, lui, est lisible par le client. */
              await bdd.doc(`projets/${id}/technique/${d.id}`).set(
                sansIndefini({ ...f.technique, releve: enDate(f.technique && f.technique.releve), maj: FieldValue.serverTimestamp() }),
                { merge: true },
              );
              n += 1;
            }
          }
          compte.fichesTechniques = n;
        }

        compte.jalons = await poser(c.jalons, `projets/${id}/jalons`, (x) => ({
          projet: String(id), titre: x.titre, description: x.description || '', phase: x.phase || '',
          statut: x.statut || 'a-venir', progression: Number(x.progression) || 0,
          debut: enDate(x.debut), fin: enDate(x.fin), composants: x.composants || [], dependances: [], ordre: Number(x.ordre) || 0,
        }));
        compte.liens = await poser(c.liens, `projets/${id}/liens`, (x) => ({
          nom: x.nom, categorie: x.categorie || 'autre', url: x.url, environnement: x.environnement || '',
          composant: x.composant || '', description: x.description || '', visibilite: x.visibilite || 'client', etat: 'actif',
        }));
        compte.releases = await poser(c.releases, 'releases', (x) => ({
          projet: String(id), composant: x.composant || '', plateforme: x.plateforme, version: x.version,
          titre: x.titre || '', statut: x.statut || 'disponible', date: enDate(x.date), notes: x.notes || [],
          liens: x.liens || {}, visibilite: x.visibilite || 'client', par: { uid: null, nom: EQUIPE_NOM },
        }));
        compte.reunions = await poser(c.reunions, 'reunions', (x) => ({
          projet: String(id), titre: x.titre, date: enDate(x.date), duree: Number(x.duree) || 60,
          participants: x.participants || [], lien: x.lien || '', ordreDuJour: x.ordreDuJour || '',
          notes: '', compteRendu: x.compteRendu || '', decisions: x.decisions || '', actions: x.actions || [],
          visibilite: x.visibilite || 'client', par: { uid: null, nom: EQUIPE_NOM },
        }));
        compte.notes = await poser(c.notes, 'notes', (x) => ({
          projet: String(id), type: x.type || 'information', titre: x.titre, contenu: x.contenu || '',
          contexte: x.contexte || '', impact: x.impact || '', decidePar: x.decidePar || '',
          date: enDate(x.date) || FieldValue.serverTimestamp(), visibilite: x.visibilite || 'client', par: { uid: null, nom: EQUIPE_NOM },
        }));
        compte.blocages = await poser(c.blocages, 'blocages', (x) => ({
          projet: String(id), titre: x.titre, description: x.description || '', responsable: x.responsable || 'client',
          impact: x.impact || '', depuis: enDate(x.depuis) || FieldValue.serverTimestamp(), resolu: enDate(x.resolu),
          visibilite: x.visibilite || 'client',
        }));
        compte.taches = await poser(c.taches, 'taches', (x) => ({
          projet: String(id), composant: x.composant || '', jalon: x.jalon || '', ticket: '',
          titre: x.titre, description: x.description || '', statut: x.statut || 'a-faire', priorite: x.priorite || 'normale',
          assigne: x.assigne || '', echeance: enDate(x.echeance), estimation: x.estimation || '',
          progression: Number(x.progression) || 0, checklist: x.checklist || [], pieces: [],
          visibilite: x.visibilite || 'client', ordre: Number(x.ordre) || 0, archive: false, par: { uid: null, nom: EQUIPE_NOM },
        }));

        await bdd.collection('audit').add({ action: 'projet-rempli', projet: String(id), compte, date: FieldValue.serverTimestamp() });
        console.log(`Projet ${id} rempli :`, JSON.stringify(compte));
        return res.status(200).json({ ok: true, compte, adressesVues: presentes });
      }

      return res.status(400).send('action inconnue');
    } catch (err) {
      /* Un conflit de rôle n'est pas une panne : c'est une réponse, et elle
         dit quoi faire. Elle part telle quelle vers l'écran. */
      if (err && err.conflitDeRole) return res.status(409).send(err.message);
      if (err && err.refus) return res.status(err.code).send(err.message);
      console.error(`suiviAdmin, action « ${action} »`, err);
      return res.status(500).send('erreur interne');
    }
  },
);
