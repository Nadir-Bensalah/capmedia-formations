/* ==========================================================================
   ESPACE DE SUIVI CLIENT · Fonctions serveur
   Contrat : docs/suivi.md

   suiviTicketCree       numérotation atomique, audit, accusé et alerte
   suiviTicketModifie    audit du changement réel, e-mail au bon public
   suiviMessageCree      e-mail à l'autre partie, jamais sur une note interne
   suiviDocumentCree     devis ou facture déposé, e-mail au client
   suiviDocumentModifie  réponse du client à un devis, e-mail à l'équipe
   suiviFacteur          la file « envois » partie chez Brevo
   suiviAdmin            ce que le navigateur n'a pas le droit de faire

   Deux principes gouvernent ce fichier.

   1. Une panne d'e-mail ne casse jamais une écriture métier. Les
      déclencheurs n'envoient rien eux-mêmes : ils déposent une ligne dans
      « envois », et le facteur s'en occupe. Un Brevo indisponible laisse
      donc le ticket intact, avec une trace exploitable.
   2. Tout ce qui engage (numéro, journal d'audit, revendications du jeton)
      est refusé au navigateur par les règles, et ne s'écrit qu'ici.
   ========================================================================== */

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const courriels = require('./courriels');

/* index.js initialise déjà l'application ; la garde permet de charger ce
   module seul (script de vérification, émulateur, test unitaire). */
if (!getApps().length) initializeApp();
const bdd = getFirestore();

const REGION = 'europe-west1';

const BREVO_CLE = defineSecret('BREVO_CLE');
const ADMIN_CLE = defineSecret('ADMIN_CLE');

/* L'adresse qui reçoit toutes les alertes internes. */
const EQUIPE_EMAIL = 'contact@capmedia.app';
const EQUIPE_NOM   = 'Équipe Capmedia';

const EXPEDITEUR = { email: 'contact@capmedia.app', nom: 'Capmedia Digital' };

/* Trois essais, pas un de plus : un modèle cassé ou une adresse morte ne
   doit jamais boucler aux frais du projet. */
const ESSAIS_MAX = 3;

const STATUTS_CONNUS = ['nouveau', 'en-cours', 'en-attente-client', 'a-valider',
  'resolu', 'ferme', 'refuse'];

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
function sansIndefini(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map(sansIndefini).filter((v) => v !== undefined);
  }
  if (valeur && typeof valeur === 'object'
      && !(valeur instanceof Date) && typeof valeur.toDate !== 'function') {
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
async function mettreEnFile(modele, destinataires, variables) {
  const a = (destinataires || [])
    .filter((d) => d && emailPlausible(d.email))
    .map((d) => ({ email: normaliserEmail(d.email), nom: String(d.nom || '').trim() }))
    /* Une même adresse deux fois enverrait deux e-mails identiques. */
    .filter((d, i, liste) => liste.findIndex((x) => x.email === d.email) === i);

  if (!a.length) {
    console.warn(`Aucun destinataire valable pour « ${modele} », e-mail abandonné`,
      JSON.stringify(destinataires || []));
    return null;
  }

  try {
    const ref = await bdd.collection('envois').add(sansIndefini({
      modele,
      a,
      variables: variables || {},
      etat: 'attente',
      erreur: null,
      essais: 0,
      cree: FieldValue.serverTimestamp(),
      envoye: null,
    }));
    return ref.id;
  } catch (err) {
    console.error(`Mise en file impossible pour « ${modele} »`, err);
    return null;
  }
}

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

/**
 * Qui prévenir côté client : le contact du projet, et l'auteur du ticket
 * s'il s'agit d'une autre personne (une équipe cliente à plusieurs mains).
 */
function contactsClient(projet, auteur) {
  /* Un projet en sourdine se prépare sans rien envoyer au client. Le
     drapeau se lève depuis le cockpit quand l'espace est prêt. */
  if (projet && projet.silence === true) return [];
  const liste = [];
  const client = (projet && projet.client) || {};
  if (client.email) {
    liste.push({ email: client.email, nom: client.nom || client.entreprise || '' });
  }
  if (auteur && auteur.cote === 'client' && auteur.email
      && !liste.some((d) => memeEmail(d.email, auteur.email))) {
    liste.push({ email: auteur.email, nom: auteur.nom || '' });
  }
  return liste;
}

const contactsEquipe = () => [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }];

/** La fiche d'un membre de l'équipe, pour lui écrire nommément. */
async function contactMembreEquipe(uid) {
  if (!uid) return null;
  try {
    const doc = await bdd.doc(`equipe/${String(uid)}`).get();
    if (!doc.exists) {
      console.warn(`Assignation vers un uid hors équipe : ${uid}`);
      return null;
    }
    const fiche = doc.data();
    if (!fiche.email) {
      console.warn(`Fiche équipe ${uid} sans adresse e-mail`);
      return null;
    }
    return { email: fiche.email, nom: fiche.nom || '' };
  } catch (err) {
    console.error(`Lecture de la fiche équipe ${uid} impossible`, err);
    return null;
  }
}

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
       parce que les deux lettres ne disent pas la même chose. */
    await mettreEnFile('ticket-cree', contactsClient(projet, auteur), {
      ...communes,
      cote: 'client',
      clientNom: auteur.nom || nomClient(projet),
    });

    await mettreEnFile('ticket-cree', contactsEquipe(), {
      ...communes,
      cote: 'equipe',
      auteurNom: auteur.nom || '',
      auteurEmail: auteur.email || '',
    });

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
  ['a-valider', 'resolu'],  // le client valide la correction livrée
  ['resolu', 'en-cours'],   // le client rouvre dans les sept jours
];

const changementDuClient = (avant, apres) =>
  TRANSITIONS_CLIENT.some(([de, vers]) => avant === de && apres === vers);

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
    const parLeClient = Boolean(changeStatut)
      && changementDuClient(changeStatut.avant, changeStatut.apres);
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
        await notifierStatut(apres, changement, { projet, communes, parLeClient });
        continue;
      }

      if (changement.type === 'assignation') {
        /* Un désassignement ne s'annonce à personne : l'audit suffit. */
        if (!changement.apres) continue;
        const assigne = await contactMembreEquipe(changement.apres);
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
  const { projet, communes, parLeClient } = contexte;

  if (!STATUTS_CONNUS.includes(String(changement.apres))) {
    console.error(`Statut inconnu sur le ticket ${ticket.numero || ''} : ${changement.apres}`);
    return;
  }

  /* Le client vient d'agir lui-même : c'est l'équipe qu'il faut prévenir. */
  if (parLeClient) {
    await mettreEnFile('statut', contactsEquipe(), {
      ...communes,
      cote: 'equipe',
      statutAvant: changement.avant,
      statutApres: changement.apres,
      clientNom: nomClient(projet),
    });
    return;
  }

  const destinataires = contactsClient(projet, ticket.auteur);

  if (changement.apres === 'resolu') {
    await mettreEnFile('resolu', destinataires, {
      ...communes,
      clientNom: nomClient(projet),
      date: ticket.resolu || null,
    });
    return;
  }

  if (changement.apres === 'ferme') {
    await mettreEnFile('ferme', destinataires, {
      ...communes,
      clientNom: nomClient(projet),
      date: ticket.maj || null,
    });
    return;
  }

  await mettreEnFile('statut', destinataires, {
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
    const destinataires = versEquipe
      ? contactsEquipe()
      : contactsClient(projet, ticket.auteur);

    await mettreEnFile('message', destinataires, {
      numero: ticket.numero,
      titre: ticket.titre,
      statut: ticket.statut,
      projetNom: nomProjet(projet),
      auteurNom: de.nom || '',
      cote: versEquipe ? 'equipe' : 'client',
      texte: message.texte,
      lien: courriels.lienTicket(ticketId),
    });
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
    if (document.type !== 'devis' && document.type !== 'facture') {
      console.error(`Document ${evenement.params.documentId} de type inattendu : ${document.type}`);
      return;
    }

    const projet = await lireProjet(document.projet);
    const destinataires = contactsClient(projet, null);

    await mettreEnFile(document.type, destinataires, {
      numero: document.numero,
      libelle: document.libelle,
      montant: document.montant,
      echeance: document.echeance || null,
      projetNom: nomProjet(projet),
      clientNom: nomClient(projet),
      lien: courriels.lienProjet(document.projet),
    });

    console.log(`${document.type === 'devis' ? 'Devis' : 'Facture'} ${document.numero || evenement.params.documentId} déposé`);
  },
);

exports.suiviDocumentModifie = onDocumentUpdated(
  { region: REGION, document: 'documents/{documentId}' },
  async (evenement) => {
    const avant = evenement.data.before.data();
    const apres = evenement.data.after.data();
    if (!avant || !apres) return;

    /* Seul cas notable : le client répond à un devis qui lui était soumis.
       Les changements de statut d'une facture viennent de nous, nous n'avons
       pas besoin de nous les annoncer. */
    const repondu = apres.type === 'devis'
      && avant.statut === 'envoye'
      && (apres.statut === 'accepte' || apres.statut === 'refuse');
    if (!repondu) return;

    const projet = await lireProjet(apres.projet);
    const reponse = apres.reponse || {};

    await mettreEnFile('devis-reponse', contactsEquipe(), {
      numero: apres.numero,
      libelle: apres.libelle,
      montant: apres.montant,
      projetNom: nomProjet(projet),
      clientNom: nomClient(projet),
      reponse: apres.statut,
      date: reponse.le || apres.date || null,
      lien: courriels.lienProjet(apres.projet),
    });

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
      'content-type': 'application/json',
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
      await ref.update({ etat: 'simule', envoye: FieldValue.serverTimestamp(), erreur: null });
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
      try {
        const identifiant = await envoyerParBrevo(cle, courriel, destinataires);
        await ref.update({
          etat: 'envoye',
          erreur: null,
          essais,
          brevo: identifiant,
          envoye: FieldValue.serverTimestamp(),
        });
        console.log(`E-mail « ${envoi.modele} » envoyé à ${destinataires.map((d) => d.email).join(', ')}`);
        return;
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
      }
    }

    await marquerEchec(ref, essais, derniere);
  },
);

/* ==========================================================================
   6. suiviAdmin

   Calquée sur la fonction « admin » : POST { cle, action, ...params }, la
   clé du secret ADMIN_CLE fait loi. On trouve ici tout ce que les règles
   refusent au navigateur : créer un projet, toucher aux membres, déposer un
   devis ou une facture, écrire une fiche d'équipe.
   ========================================================================== */

/**
 * Recalcule les revendications du jeton depuis Firestore, jamais depuis les
 * paramètres de l'appel. Les règles de stockage lisent « equipe » et
 * « projets » dans le jeton, parce qu'elles ne savent pas interroger la
 * liste des membres. Les noms sont donc imposés par storage.rules.
 *
 * setCustomUserClaims remplace la totalité des revendications : les deux
 * champs sont toujours réécrits ensemble. Le jeton du navigateur ne les voit
 * qu'après un rafraîchissement (reconnexion, ou getIdToken(true)).
 */
async function poserRevendications(uid) {
  const [ficheEquipe, projetsDuClient] = await Promise.all([
    bdd.doc(`equipe/${uid}`).get(),
    bdd.collection('projets').where('membres', 'array-contains', uid).get(),
  ]);

  const revendications = {
    equipe: ficheEquipe.exists && ficheEquipe.data().actif !== false,
    projets: projetsDuClient.docs.map((d) => d.id),
  };
  /* La liste « projets » du jeton est bornee par la taille d un jeton :
     au-dela de deux cents projets, on garde les plus recents. */
  if (revendications.projets.length > 200) revendications.projets = revendications.projets.slice(-200);

  await getAuth().setCustomUserClaims(uid, revendications);
  console.log(`Revendications posées pour ${uid} :`, JSON.stringify(revendications));
  return revendications;
}

/** Le compte Auth de cette adresse, créé au besoin. */
async function compteAuth(email, nom) {
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


/**
 * Un membre d'organisation est membre de chacun de ses projets. Cette
 * fonction realigne la liste « membres » des projets sur celle de
 * l'organisation, puis recalcule les jetons des personnes touchees.
 */
async function synchroniserMembres(orgId) {
  const org = await bdd.doc(`organisations/${orgId}`).get();
  if (!org.exists) return [];
  const membres = org.data().membres || [];
  const projets = await bdd.collection('projets').where('organisation', '==', orgId).get();
  const touches = new Set(membres);
  for (const p of projets.docs) {
    const actuels = p.data().membres || [];
    actuels.forEach((u) => touches.add(u));
    const fusion = Array.from(new Set([...actuels.filter((u) => !(p.data().membresOrganisation || []).includes(u)), ...membres]));
    await p.ref.update({ membres: fusion, membresOrganisation: membres, maj: FieldValue.serverTimestamp() });
  }
  for (const uid of touches) { try { await poserRevendications(uid); } catch (err) { console.error(`Jeton de ${uid} non recalcule`, err); } }
  return membres;
}

const STATUTS_FACTURE = ['brouillon', 'envoyee', 'a-payer', 'partielle', 'payee', 'en-retard', 'annulee', 'avoir'];
const STATUTS_DEVIS = ['brouillon', 'envoye', 'consulte', 'accepte', 'refuse', 'expire', 'annule'];
const MOYENS = ['virement', 'carte', 'stripe', 'cheque', 'especes', 'autre'];
const PLATEFORMES_CONNUES = ['ios', 'android', 'web', 'admin', 'backend', 'landing'];

exports.suiviAdmin = onRequest(
  { region: REGION, secrets: [ADMIN_CLE], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { cle, action, projet, email, nom, uid, ref, client, plateformes,
      type, numero, libelle, montant, echeance, fichier, id, statut, role,
      entreprise, telephone, adresse, notesInternes, organisation, description, responsable,
      debut, cible, budget, budgetNote, inviter, demandeProjet, tva, date, facture, moyen, reference, note, archive } = req.body || {};

    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) return res.status(403).send('interdit');

    try {
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

        /* Le client : une organisation existante, ou une nouvelle creee a la volee. */
        let orgId = organisation ? String(organisation) : null;
        let ficheClient = client && typeof client === 'object' ? client : {};
        if (orgId) {
          const org = await bdd.doc(`organisations/${orgId}`).get();
          if (!org.exists) return res.status(404).send('organisation inconnue');
          const o = org.data();
          ficheClient = { nom: o.nom || '', email: o.email || '', entreprise: o.entreprise || '' };
        } else {
          if (!emailPlausible(ficheClient.email)) return res.status(400).send('email du client requis');
          const orgRef = await bdd.collection('organisations').add({
            nom: String(ficheClient.nom || '').trim(), entreprise: String(ficheClient.entreprise || '').trim(),
            email: normaliserEmail(ficheClient.email), telephone: '', adresse: '', notesInternes: '',
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
          type: String(type || 'application-mobile'), statut: String(statut || 'cadrage'),
          organisation: orgId, client: ficheClient, plateformes: plateformesValides,
          membres: [], membresOrganisation: [], compteur: 0,
          progression: { mode: 'manuel', valeur: 0 },
          debut: enDate(debut), cible: enDate(cible), responsable: String(responsable || ''),
          budget: Number.isFinite(Number(budget)) && budget !== null && budget !== '' ? Number(budget) : null, budgetNote: String(budgetNote || ''),
          pulse: { enCours: '', derniereLivraison: '', prochaineEtape: '', attenteClient: '' }, sante: 'ok',
          archive: false, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }));

        /* Les membres de l'organisation deviennent membres du projet. */
        await synchroniserMembres(orgId);

        /* L'invitation du contact principal, si demandee. */
        if (inviter !== false && emailPlausible(ficheClient.email)) {
          const { utilisateur } = await compteAuth(ficheClient.email, ficheClient.nom);
          await bdd.doc(`organisations/${orgId}`).update({ membres: FieldValue.arrayUnion(utilisateur.uid), [`roles.${utilisateur.uid}`]: 'owner', maj: FieldValue.serverTimestamp() });
          const org = await bdd.doc(`organisations/${orgId}`).get();
          const contacts = (org.data().contacts || []).map((c) => (memeEmail(c.email, ficheClient.email) ? { ...c, uid: utilisateur.uid } : c));
          await org.ref.update({ contacts });
          await synchroniserMembres(orgId);
          await mettreEnFile('invitation', [{ email: ficheClient.email, nom: ficheClient.nom || '' }], {
            projetNom: String(nom).trim(), clientNom: ficheClient.nom || '', email: normaliserEmail(ficheClient.email), lien: `${courriels.BASE}app#/projets/${nouveau.id}`,
          });
        }

        /* Une demande de nouveau projet transformee garde son fil. */
        if (demandeProjet) {
          try { await bdd.doc(`demandesProjet/${String(demandeProjet)}`).update({ statut: 'projet', projet: nouveau.id, maj: FieldValue.serverTimestamp() }); } catch (err) { console.warn('Demande de projet non liee', err); }
        }

        await bdd.collection('audit').add({ action: 'projet-cree', projet: nouveau.id, ref: reference, organisation: orgId, date: FieldValue.serverTimestamp() });
        console.log(`Projet ${reference} cree : ${nouveau.id}`);
        return res.status(200).json({ ok: true, id: nouveau.id, organisation: orgId });
      }

      /* --- Inviter un client sur un projet -------------------------------- */
      if (action === 'inviterClient') {
        if (!projet || !emailPlausible(email)) {
          return res.status(400).send('projet et email valides requis');
        }
        const refProjet = bdd.doc(`projets/${String(projet)}`);
        const docProjet = await refProjet.get();
        if (!docProjet.exists) return res.status(404).send('projet inconnu');
        const ficheProjet = { id: docProjet.id, ...docProjet.data() };

        const { utilisateur, cree } = await compteAuth(email, nom);

        await refProjet.update({
          membres: FieldValue.arrayUnion(utilisateur.uid),
          maj: FieldValue.serverTimestamp(),
        });
        const revendications = await poserRevendications(utilisateur.uid);

        await mettreEnFile('invitation', [{ email, nom: String(nom || '').trim() || nomClient(ficheProjet) }], {
          projetNom: ficheProjet.nom || '',
          clientNom: String(nom || '').trim() || nomClient(ficheProjet),
          email: normaliserEmail(email),
          lien: courriels.lienEspace(),
        });

        console.log(`${normaliserEmail(email)} invité sur ${ficheProjet.nom || projet}`);
        return res.status(200).json({ ok: true, uid: utilisateur.uid, compteCree: cree, revendications });
      }

      /* --- Retirer un client d'un projet ---------------------------------- */
      if (action === 'retirerClient') {
        if (!projet) return res.status(400).send('projet requis');
        let identifiant = String(uid || '').trim();
        if (!identifiant) {
          if (!emailPlausible(email)) return res.status(400).send('uid ou email requis');
          const { utilisateur } = await compteAuth(email, null);
          identifiant = utilisateur.uid;
        }

        const refProjet = bdd.doc(`projets/${String(projet)}`);
        if (!(await refProjet.get()).exists) return res.status(404).send('projet inconnu');

        await refProjet.update({
          membres: FieldValue.arrayRemove(identifiant),
          maj: FieldValue.serverTimestamp(),
        });
        /* Le retrait doit fermer l'accès aux fichiers, donc le jeton se
           recalcule tout de suite. */
        const revendications = await poserRevendications(identifiant);
        console.log(`${identifiant} retiré du projet ${projet}`);
        return res.status(200).json({ ok: true, uid: identifiant, revendications });
      }

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

        const fiche = sansIndefini({
          projet: String(projet), type, numero: String(numero).trim(), libelle: String(libelle).trim().slice(0, 160),
          description: String(description || '').slice(0, 2000),
          montant: somme, tva: taux, ttc: Math.round(somme * (1 + taux / 100) * 100) / 100,
          statut: type === 'devis' ? 'envoye' : 'a-payer',
          date: enDate(date) || FieldValue.serverTimestamp(),
          echeance: type === 'facture' ? dateEcheance : null,
          expiration: type === 'devis' ? dateEcheance : null,
          fichier: fichier && fichier.chemin ? { chemin: String(fichier.chemin).trim(), nom: String(fichier.nom || '').trim(), taille: Number(fichier.taille || 0) || 0 } : null,
          reponse: null, archive: false,
        });
        const nouveau = await bdd.collection('documents').add(fiche);
        console.log(`${type} ${fiche.numero} depose sur le projet ${projet} : ${nouveau.id}`);
        return res.status(200).json({ ok: true, id: nouveau.id });
      }

      /* --- Changer le statut d'un devis (equipe) ---------------------------- */
      if (action === 'statutDevis') {
        if (!id) return res.status(400).send('id requis');
        if (!STATUTS_DEVIS.includes(statut)) return res.status(400).send(`statut requis parmi : ${STATUTS_DEVIS.join(', ')}`);
        const refDocument = bdd.doc(`documents/${String(id)}`);
        const doc = await refDocument.get();
        if (!doc.exists) return res.status(404).send('document inconnu');
        if (doc.data().type !== 'devis') return res.status(400).send('ce document n est pas un devis');
        await refDocument.update({ statut });
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
          reference: String(reference || '').slice(0, 80), note: String(note || '').slice(0, 200), statut: 'valide',
          cree: FieldValue.serverTimestamp(),
        }));
        /* Le statut de la facture suit le total paye. */
        const tous = await bdd.collection('paiements').where('facture', '==', String(facture)).get();
        const paye = tous.docs.reduce((t, d) => t + (d.data().statut !== 'annule' ? Number(d.data().montant) || 0 : 0), 0);
        const du = typeof f.ttc === 'number' ? f.ttc : Number(f.montant) || 0;
        await refFacture.update({ statut: paye + 0.005 >= du ? 'payee' : 'partielle' });
        return res.status(200).json({ ok: true, id: paiement.id, paye, statut: paye + 0.005 >= du ? 'payee' : 'partielle' });
      }

      /* --- Les organisations ----------------------------------------------- */
      if (action === 'creerOrganisation') {
        if (!String(entreprise || nom || '').trim()) return res.status(400).send('nom requis');
        if (!emailPlausible(email)) return res.status(400).send('email valide requis');
        const orgRef = await bdd.collection('organisations').add(sansIndefini({
          nom: String(nom || '').trim(), entreprise: String(entreprise || '').trim(), email: normaliserEmail(email),
          telephone: String(telephone || '').trim(), adresse: String(adresse || '').trim(), notesInternes: String(notesInternes || ''),
          contacts: [{ nom: String(nom || '').trim(), email: normaliserEmail(email), role: 'owner', uid: null }],
          membres: [], roles: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
        }));
        await bdd.collection('audit').add({ action: 'organisation-creee', organisation: orgRef.id, date: FieldValue.serverTimestamp() });
        return res.status(200).json({ ok: true, id: orgRef.id });
      }

      if (action === 'majOrganisation') {
        if (!id) return res.status(400).send('id requis');
        const orgRef = bdd.doc(`organisations/${String(id)}`);
        if (!(await orgRef.get()).exists) return res.status(404).send('organisation inconnue');
        if (email && !emailPlausible(email)) return res.status(400).send('email invalide');
        await orgRef.update(sansIndefini({
          nom: nom !== undefined ? String(nom).trim() : undefined, entreprise: entreprise !== undefined ? String(entreprise).trim() : undefined,
          email: email !== undefined ? normaliserEmail(email) : undefined, telephone: telephone !== undefined ? String(telephone).trim() : undefined,
          adresse: adresse !== undefined ? String(adresse).trim() : undefined, notesInternes: notesInternes !== undefined ? String(notesInternes) : undefined,
          maj: FieldValue.serverTimestamp(),
        }));
        return res.status(200).json({ ok: true });
      }

      if (action === 'inviterMembreOrganisation') {
        if (!id || !emailPlausible(email)) return res.status(400).send('organisation et email valides requis');
        const orgRef = bdd.doc(`organisations/${String(id)}`);
        const org = await orgRef.get();
        if (!org.exists) return res.status(404).send('organisation inconnue');
        const { utilisateur, cree } = await compteAuth(email, nom);
        const fonction = role === 'owner' ? 'owner' : 'member';
        const contacts = (org.data().contacts || []).filter((c) => !memeEmail(c.email, email));
        contacts.push({ nom: String(nom || '').trim(), email: normaliserEmail(email), role: fonction, uid: utilisateur.uid });
        await orgRef.update({ membres: FieldValue.arrayUnion(utilisateur.uid), [`roles.${utilisateur.uid}`]: fonction, contacts, maj: FieldValue.serverTimestamp() });
        await synchroniserMembres(String(id));
        const premierProjet = await bdd.collection('projets').where('organisation', '==', String(id)).limit(1).get();
        const projetNom = premierProjet.empty ? '' : premierProjet.docs[0].data().nom;
        await mettreEnFile('invitation', [{ email, nom: String(nom || '').trim() }], {
          projetNom, clientNom: String(nom || '').trim(), email: normaliserEmail(email), lien: `${courriels.BASE}app`,
        });
        await bdd.collection('audit').add({ action: 'membre-invite', organisation: String(id), uid: utilisateur.uid, email: normaliserEmail(email), date: FieldValue.serverTimestamp() });
        return res.status(200).json({ ok: true, uid: utilisateur.uid, compteCree: cree });
      }

      if (action === 'retirerMembreOrganisation') {
        if (!id) return res.status(400).send('organisation requise');
        let identifiant = String(uid || '').trim();
        if (!identifiant) {
          if (!emailPlausible(email)) return res.status(400).send('uid ou email requis');
          const { utilisateur } = await compteAuth(email, null);
          identifiant = utilisateur.uid;
        }
        const orgRef = bdd.doc(`organisations/${String(id)}`);
        const org = await orgRef.get();
        if (!org.exists) return res.status(404).send('organisation inconnue');
        const contacts = (org.data().contacts || []).filter((c) => c.uid !== identifiant && !(email && memeEmail(c.email, email)));
        await orgRef.update({ membres: FieldValue.arrayRemove(identifiant), [`roles.${identifiant}`]: FieldValue.delete(), contacts, maj: FieldValue.serverTimestamp() });
        /* Retire aussi des projets, puis recalcule le jeton : l'acces aux fichiers se ferme tout de suite. */
        const projets = await bdd.collection('projets').where('organisation', '==', String(id)).get();
        for (const p of projets.docs) await p.ref.update({ membres: FieldValue.arrayRemove(identifiant), membresOrganisation: FieldValue.arrayRemove(identifiant), maj: FieldValue.serverTimestamp() });
        await poserRevendications(identifiant);
        await bdd.collection('audit').add({ action: 'membre-retire', organisation: String(id), uid: identifiant, date: FieldValue.serverTimestamp() });
        return res.status(200).json({ ok: true, uid: identifiant });
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

        await refDocument.update({ statut });
        console.log(`Facture ${doc.data().numero || id} passée à ${statut}`);
        return res.status(200).json({ ok: true, statut });
      }

      /* --- Ajouter un membre d'équipe -------------------------------------
         La fiche « equipe » ouvre l'accès à tous les projets côté Firestore,
         la revendication « equipe » fait de même côté stockage. */
      if (action === 'ajouterEquipe') {
        if (!emailPlausible(email)) return res.status(400).send('email valide requis');
        if (!String(nom || '').trim()) return res.status(400).send('nom requis');
        const fonction = role === 'admin' ? 'admin' : 'agent';

        const { utilisateur, cree } = await compteAuth(email, nom);
        await bdd.doc(`equipe/${utilisateur.uid}`).set({
          nom: String(nom).trim(),
          email: normaliserEmail(email),
          role: fonction,
          actif: true,
        }, { merge: true });
        const revendications = await poserRevendications(utilisateur.uid);

        console.log(`Membre d'équipe ${normaliserEmail(email)} (${fonction}) : ${utilisateur.uid}`);
        return res.status(200).json({ ok: true, uid: utilisateur.uid, compteCree: cree, revendications });
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
          if (!p.sante) changements.sante = 'ok';
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
                email, telephone: '', adresse: '', notesInternes: '',
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
      if (action === 'diagnostic') {
        const [projets, organisations, equipe] = await Promise.all([
          bdd.collection('projets').get(), bdd.collection('organisations').get(), bdd.collection('equipe').get(),
        ]);
        return res.status(200).json({
          ok: true,
          projets: projets.docs.map((d) => { const p = d.data(); return { id: d.id, nom: p.nom, ref: p.ref, statut: p.statut, archive: Boolean(p.archive), organisation: p.organisation || null, membres: (p.membres || []).length, client: (p.client || {}).email || null, progression: p.progression || null, silence: p.silence === true, plateformes: p.plateformes || [] }; }),
          organisations: organisations.docs.map((d) => ({ id: d.id, nom: d.data().entreprise || d.data().nom, email: d.data().email, membres: (d.data().membres || []).length })),
          equipe: equipe.docs.map((d) => ({ uid: d.id, email: d.data().email, role: d.data().role })),
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
            sante: p.sante, budget: p.budget, budgetNote: p.budgetNote, silence: p.silence,
            maj: FieldValue.serverTimestamp(),
          }));
          compte.projet = 1;
        }

        /* Chaque collection est reecrite a l identique si l element porte un
           identifiant : relancer l outil ne cree pas de doublon. */
        const poser = async (liste, chemin, transforme) => {
          if (!Array.isArray(liste) || !liste.length) return 0;
          for (const item of liste) {
            const donnees = sansIndefini({ ...transforme(item), maj: FieldValue.serverTimestamp() });
            if (item.id) await bdd.doc(`${chemin}/${item.id}`).set({ ...donnees, cree: donnees.cree || FieldValue.serverTimestamp() }, { merge: true });
            else await bdd.collection(chemin).add({ ...donnees, cree: FieldValue.serverTimestamp() });
          }
          return liste.length;
        };

        compte.composants = await poser(c.composants, `projets/${id}/composants`, (x) => ({
          nom: x.nom, type: x.type, statut: x.statut || 'en-cours', progression: Number(x.progression) || 0,
          version: x.version || '', versionPrep: x.versionPrep || '', environnement: x.environnement || '',
          techno: x.techno || [], responsable: x.responsable || '', description: x.description || '', ordre: Number(x.ordre) || 0,
        }));
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
      console.error(`suiviAdmin, action « ${action} »`, err);
      return res.status(500).send('erreur interne');
    }
  },
);
