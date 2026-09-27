/* ==========================================================================
   CAPMEDIA CLIENT HUB · qui reçoit quoi

   Une seule question, posée à un seul endroit : doit-on écrire à cette
   personne, pour cet événement, sur ce projet ? Avant la Gate 2, deux
   fichiers y répondaient chacun à leur façon, depuis des adresses posées
   sur la fiche (contact, client, organisation) : un ancien interlocuteur
   continuait donc de recevoir, un projet fermé écrivait encore, et un
   collaborateur recevait les factures.

   La réponse tient désormais compte, dans cet ordre :
     1. du projet : interne, fermé au client (« ouvert » n'est pas vrai) ;
     2. de la personne : interlocuteur actif, membre effectif du projet ;
     3. de son rôle : la finance ne va qu'au responsable ;
     4. des e-mails du projet : coupés, le Hub continue, l'e-mail non ;
     5. de ses préférences : une catégorie désactivée ne part pas.

   Deux canaux, deux décisions :
     - l'e-mail (externe) obéit aux cinq points ;
     - la notification dans le Hub (interne) obéit aux trois premiers :
       couper les e-mails ne coupe pas le Hub.

   Côté équipe : un membre inactif ne reçoit rien, un agent ne reçoit que
   ce qui touche ses projets.
   ========================================================================== */

const { AsyncLocalStorage } = require('node:async_hooks');
const { bdd, FieldValue, normaliserEmail, emailPlausible, sansIndefini, cleEmail, enMillis } = require('./commun');
const acces = require('./acces');

const EQUIPE_EMAIL = 'contact@capmedia.app';
const EQUIPE_NOM = 'Équipe Capmedia';

/* Les événements et ce qu'ils exigent. « categorie » est celle des
   préférences du client (voir parametres.js) ; « responsable » réserve
   l'événement au responsable du projet ; « essentiel » ignore les
   préférences (on ne se désabonne pas de son invitation). */
const EVENEMENTS = {
  'ticket-cree': { categorie: 'demandes' },
  statut: { categorie: 'demandes' },
  resolu: { categorie: 'demandes' },
  ferme: { categorie: 'demandes' },
  qualification: { categorie: 'demandes' },
  demande: { categorie: 'demandes' },
  message: { categorie: 'messages' },
  'message-projet': { categorie: 'messages' },
  tache: { categorie: 'demandes' },
  'tache-attente': { categorie: 'demandes' },
  jalon: { categorie: 'projet' },
  projet: { categorie: 'projet' },
  release: { categorie: 'releases' },
  fichier: { categorie: 'fichiers' },
  reunion: { categorie: 'reunions' },
  'validation-demandee': { categorie: 'validations' },
  validation: { categorie: 'validations' },
  note: { categorie: 'projet' },
  blocage: { categorie: 'projet' },
  maintenance: { categorie: 'projet' },
  relance: { categorie: 'relance' },
  devis: { categorie: 'finances', responsable: true },
  facture: { categorie: 'finances', responsable: true },
  paiement: { categorie: 'finances', responsable: true },
  ouverture: { categorie: 'projet', essentiel: true },
  invitation: { categorie: 'projet', essentiel: true },
  test: { categorie: 'projet' },
  'testeur-termine': { categorie: 'projet' },
  'testeur-remarque': { categorie: 'projet' },
};

const regle = (evenement) => EVENEMENTS[evenement] || { categorie: 'projet' };
const non = (motif) => ({ ok: false, motif });
const oui = { ok: true, motif: '' };

/* ==========================================================================
   1. Les décisions, sans rien lire
   ========================================================================== */

/* Le MOMENT d'un événement. Un déclencheur s'exécute après l'écriture qui
   l'a fait naître, parfois longtemps après quand la file est chargée : un
   fait survenu pendant la préparation (projet fermé) ou pendant la coupure
   des e-mails ne doit pas partir parce que le projet s'est ouvert, ou que
   les e-mails ont repris, entre-temps. Chaque déclencheur s'exécute donc
   « au moment » de son événement (auMoment), et les décisions comparent ce
   moment aux dates de l'ouverture (ouvertLe) et de la reprise des e-mails
   (emailsActifsLe). Un envoi fait hors déclencheur (l'ouverture elle-même,
   la relance) n'a pas de moment : seul l'état actuel compte. */
const moments = new AsyncLocalStorage();
const auMoment = (quand, fn) => moments.run({ quand: quand ? new Date(quand).getTime() : null }, fn);
const momentCourant = () => (moments.getStore() || {}).quand || null;

/** Le projet laisse-t-il sortir quoi que ce soit vers le client ? */
function projetOuvertAuClient(projet, quand = null) {
  if (!projet) return non('projet absent');
  if (projet.interne === true) return non('projet interne');
  if (projet.ouvert !== true) return non('projet fermé au client');
  const ouvertLe = enMillis(projet.ouvertLe);
  if (quand && ouvertLe && quand < ouvertLe) return non('fait antérieur à l ouverture au client');
  return oui;
}

/**
 * Une notification dans le Hub pour ce client ? Le projet, l'accès
 * effectif, le rôle. Ni la coupure des e-mails ni les préférences : le Hub
 * reste complet quand les e-mails sont coupés.
 */
function decisionNotificationClient({ projet, uid, evenement, quand = null }) {
  const p = projetOuvertAuClient(projet, quand);
  if (!p.ok) return p;
  if (!uid || !Array.isArray(projet.membres) || !projet.membres.includes(uid)) return non('sans accès au projet');
  if (regle(evenement).responsable && (projet.roles || {})[uid] !== 'responsable') return non('réservé au responsable');
  return oui;
}

/** Un e-mail pour cet interlocuteur ? Les cinq points, dans l'ordre. */
function decisionEmailClient({ projet, interlocuteur, evenement, preferences = null, quand = null }) {
  const p = projetOuvertAuClient(projet, quand);
  if (!p.ok) return p;
  if (!interlocuteur || interlocuteur.statut !== 'actif') return non('accès retiré');
  if (!emailPlausible(interlocuteur.email)) return non('adresse absente');
  const notif = decisionNotificationClient({ projet, uid: interlocuteur.uid, evenement, quand });
  if (!notif.ok) return notif;
  if (projet.emailsClient === 'coupes') return non('e-mails du projet coupés');
  const reprisLe = enMillis(projet.emailsActifsLe);
  if (quand && reprisLe && quand < reprisLe) return non('fait survenu pendant la coupure des e-mails');
  const r = regle(evenement);
  if (!r.essentiel && preferences && preferences[r.categorie] === 'off') return non('désactivé dans ses préférences');
  return oui;
}

/** Une notification pour ce membre de l'équipe, sur ce projet ? Un
 *  événement financier ne va qu'à qui lit la finance du projet. */
function decisionEquipe({ fiche, projetId, evenement = null }) {
  if (!fiche || fiche.actif !== true) return non('membre inactif');
  const surProjet = fiche.role === 'admin'
    || (fiche.role === 'agent' && projetId && Array.isArray(fiche.projets) && fiche.projets.includes(String(projetId)));
  if (!surProjet) return non('hors de ses projets');
  if (evenement && regle(evenement).responsable && !acces.financeEquipe(fiche, projetId)) return non('finance non autorisée');
  return oui;
}

/* ==========================================================================
   2. Les destinataires, lus dans la base
   ========================================================================== */

const lireProjet = async (projetOuId) => {
  if (!projetOuId) return null;
  if (typeof projetOuId === 'object') return projetOuId;
  const d = await bdd.doc(`projets/${projetOuId}`).get();
  return d.exists ? { id: d.id, ...d.data() } : null;
};

const lireInterlocuteurs = async (projetId) => {
  if (!projetId) return [];
  const q = await bdd.collection(`projets/${projetId}/interlocuteurs`).get();
  return q.docs.map((d) => ({ cle: d.id, ...d.data() }));
};

const lirePreferences = async (uid) => {
  if (!uid) return null;
  try { const d = await bdd.doc(`profils/${uid}`).get(); return d.exists ? (d.data().notifications || null) : null; } catch (err) { return null; }
};

/**
 * Les adresses clientes à qui écrire, pour un événement d'un projet.
 * Rend { destinataires: [{ email, nom, uid }], ecartes: [{ email, motif }] }.
 */
async function destinatairesClients(projetOuId, evenement, { exclureUid = null } = {}) {
  const projet = await lireProjet(projetOuId);
  const ecartes = [];
  const destinataires = [];
  const quand = momentCourant();
  const p = projetOuvertAuClient(projet, quand);
  if (!p.ok) return { destinataires, ecartes: [{ email: '*', motif: p.motif }] };
  for (const i of await lireInterlocuteurs(projet.id)) {
    if (exclureUid && i.uid === exclureUid) continue;
    const d = decisionEmailClient({ projet, interlocuteur: i, evenement, preferences: await lirePreferences(i.uid), quand });
    if (!d.ok) { ecartes.push({ email: i.email, motif: d.motif }); continue; }
    const email = normaliserEmail(i.email);
    if (!destinataires.some((x) => x.email === email)) destinataires.push({ email, nom: i.nom || '', uid: i.uid || null });
  }
  return { destinataires, ecartes };
}

/** Les comptes clients à notifier dans le Hub. */
async function uidsClients(projetOuId, evenement, { exclure = [] } = {}) {
  const projet = await lireProjet(projetOuId);
  if (!projet) return [];
  return [...new Set((projet.membres || []).filter((uid) => !exclure.includes(uid)
    && decisionNotificationClient({ projet, uid, evenement, quand: momentCourant() }).ok))];
}

/** Les membres de l'équipe à notifier pour un projet (ou tous les admins si aucun). */
async function uidsEquipe(projetId, { exclure = [], evenement = null } = {}) {
  const q = await bdd.collection('equipe').get();
  return q.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((f) => !exclure.includes(f.uid))
    .filter((f) => (projetId ? decisionEquipe({ fiche: f, projetId, evenement }).ok : f.actif === true && f.role === 'admin'))
    .map((f) => f.uid);
}

/** La fiche d'un membre de l'équipe, s'il peut recevoir pour ce projet. */
async function contactEquipe(uid, projetId) {
  if (!uid) return null;
  const d = await bdd.doc(`equipe/${String(uid)}`).get();
  if (!d.exists) return null;
  const fiche = { uid: d.id, ...d.data() };
  if (!decisionEquipe({ fiche, projetId }).ok || !emailPlausible(fiche.email)) return null;
  return { email: normaliserEmail(fiche.email), nom: fiche.nom || '', uid: fiche.uid };
}

const contactsEquipe = () => [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }];

/* ==========================================================================
   3. L'envoi
   ========================================================================== */

/**
 * Dépose un e-mail dans la file « envois ». Ne lève jamais : l'appelant est
 * souvent un déclencheur, dont l'échec ferait rejouer une écriture métier.
 * `trace` (projet, evenement) accompagne la lettre, pour le journal.
 */
async function mettreEnFile(modele, destinataires, variables, trace = {}) {
  const a = [];
  for (const d of destinataires || []) {
    if (!d || !emailPlausible(d.email)) continue;
    const email = normaliserEmail(d.email);
    if (a.some((x) => x.email === email)) continue;
    a.push({ email, nom: String(d.nom || '').trim() });
  }
  if (!a.length) return null;
  try {
    const ref = await bdd.collection('envois').add(sansIndefini({
      modele, a, variables: variables || {}, etat: 'attente', erreur: null, essais: 0,
      cree: FieldValue.serverTimestamp(), envoye: null,
      projet: trace.projet || null, evenement: trace.evenement || modele,
    }));
    return ref.id;
  } catch (err) { console.error(`Mise en file impossible pour « ${modele} »`, err); return null; }
}

/** Écrit aux clients d'un projet, d'après la décision centrale. */
async function ecrireAuxClients(projetOuId, evenement, modele, variables, options = {}) {
  const projet = await lireProjet(projetOuId);
  const { destinataires } = await destinatairesClients(projet, evenement, options);
  if (!destinataires.length) return null;
  /* Un montant qui accompagne un événement ordinaire (le prix d'un forfait)
     ne part qu'aux responsables : les autres reçoivent la même lettre, sans
     lui. */
  const enPlus = options.pourResponsable;
  if (enPlus && Object.keys(enPlus).length) {
    const roles = (projet && projet.roles) || {};
    const resp = destinataires.filter((d) => d.uid && roles[d.uid] === 'responsable');
    const autres = destinataires.filter((d) => !resp.includes(d));
    const a = resp.length ? await mettreEnFile(modele, resp, { ...variables, ...enPlus }, { projet: projet && projet.id, evenement }) : null;
    const b = autres.length ? await mettreEnFile(modele, autres, variables, { projet: projet && projet.id, evenement }) : null;
    return a || b;
  }
  return mettreEnFile(modele, destinataires, variables, { projet: projet && projet.id, evenement });
}

/** Une notification dans la boîte de chaque uid. */
async function notifier(uids, { type, titre, texte, lien, projet }) {
  const lot = bdd.batch();
  let n = 0;
  for (const uid of new Set((uids || []).filter(Boolean))) {
    const ref = bdd.collection('boites').doc(uid).collection('notifications').doc();
    lot.set(ref, sansIndefini({ type, titre, texte: texte || '', lien: lien || null, projet: projet || null, lu: false, date: FieldValue.serverTimestamp() }));
    n += 1;
  }
  if (n) { try { await lot.commit(); } catch (err) { console.error('Notifications non écrites', err); } }
  return n;
}

/** Notifie les clients d'un projet dans le Hub, d'après la décision centrale. */
async function notifierClients(projetOuId, evenement, notification, { exclure = [] } = {}) {
  const projet = await lireProjet(projetOuId);
  const uids = await uidsClients(projet, evenement, { exclure });
  return notifier(uids, { ...notification, projet: notification.projet || (projet && projet.id) });
}

/** Notifie l'équipe concernée par un projet. */
async function notifierEquipe(projetId, notification, { exclure = [], evenement = null } = {}) {
  return notifier(await uidsEquipe(projetId, { exclure, evenement: evenement || notification.type || null }), notification);
}

module.exports = {
  EQUIPE_EMAIL, EQUIPE_NOM, EVENEMENTS, auMoment, momentCourant,
  projetOuvertAuClient, decisionNotificationClient, decisionEmailClient, decisionEquipe,
  destinatairesClients, uidsClients, uidsEquipe, contactEquipe, contactsEquipe,
  mettreEnFile, ecrireAuxClients, notifier, notifierClients, notifierEquipe,
  lireInterlocuteurs, cleEmail,
};
