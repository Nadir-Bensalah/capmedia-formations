/* ==========================================================================
   CAPMEDIA CLIENT HUB · les automatisations
   Contrat : docs/suivi.md

   Chaque événement métier produit trois choses, selon le cas : une ligne
   d'activité (la mémoire du projet), une notification dans la boîte des
   personnes concernées, un e-mail mis en file. Aucune de ces écritures
   n'est possible depuis le navigateur : c'est ce qui rend l'activité et
   l'audit dignes de confiance.

   Les déclencheurs des demandes (numéro, audit, e-mails) vivent dans
   suivi.js. Ici : tâches, jalons, versions, fichiers, réunions,
   validations, notes, blocages, conversation, paiements, nouveaux projets,
   et le miroir des demandes dans l'activité.
   ========================================================================== */

const v2firestore = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const courriels = require('./courriels');
const communication = require('./communication');
/* Chaque déclencheur décide « au moment » de son événement : un fait
   survenu projet fermé, ou e-mails coupés, ne part pas plus tard parce que
   l'état a changé entre-temps (voir communication.auMoment). */
const { evenementDuSemis, instantEvenement, enMillis } = require('./commun');
const auMomentDe = (fn) => async (evenement) => {
  /* Banc d'essai seulement : un événement né pendant la pose d'une base de
     test n'a rien à faire (voir commun.evenementDuSemis). */
  if (await evenementDuSemis(evenement)) return undefined;
  return communication.auMoment(instantEvenement(evenement), () => fn(evenement));
};
const onDocumentCreated = (o, fn) => v2firestore.onDocumentCreated(o, auMomentDe(fn));
const onDocumentUpdated = (o, fn) => v2firestore.onDocumentUpdated(o, auMomentDe(fn));
const onDocumentWritten = (o, fn) => v2firestore.onDocumentWritten(o, auMomentDe(fn));
const acces = require('./acces');

const bdd = getFirestore();
const REGION = 'europe-west1';
const EQUIPE_NOM = 'Équipe Capmedia';

/* ==========================================================================
   0. Outils
   ========================================================================== */

const normaliserEmail = (v) => String(v || '').trim().toLowerCase();
const emailPlausible = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliserEmail(v));

/* Une valeur que Firestore doit recevoir telle quelle : la marque « date du
   serveur », une suppression de champ, un incrément, une union de tableau.
   Ce sont des objets, et les parcourir les remplace par un objet vide.

   C'est exactement ce qui est arrivé : toute l'activité et toutes les
   notifications ont été écrites avec « date: {} », donc sans date, et le
   fil du client se triait au hasard. Un document déjà lu par Firestore
   (Timestamp, GeoPoint, DocumentReference) porte les mêmes cicatrices. */
const marqueServeur = (v) => v instanceof Date
  || (v && typeof v === 'object'
      && (typeof v.toDate === 'function'
          || typeof v.isEqual === 'function'
          || v.constructor === undefined
          || (v.constructor && v.constructor.name && v.constructor.name !== 'Object')));

function sansIndefini(valeur) {
  if (Array.isArray(valeur)) return valeur.map(sansIndefini).filter((v) => v !== undefined);
  if (valeur && typeof valeur === 'object' && !marqueServeur(valeur)) {
    const propre = {};
    for (const [k, v] of Object.entries(valeur)) { const n = sansIndefini(v); if (n !== undefined) propre[k] = n; }
    return propre;
  }
  return valeur;
}

async function lireProjet(projetId) {
  if (!projetId) return null;
  try {
    const d = await bdd.doc(`projets/${projetId}`).get();
    return d.exists ? { id: d.id, ...d.data() } : null;
  } catch (err) { console.error(`Projet ${projetId} illisible`, err); return null; }
}

/* Qui reçoit quoi : communication.js, et nulle part ailleurs. Un client
   ne se lit plus sur la fiche du projet (contact, organisation) mais dans
   ses interlocuteurs actifs ; la finance ne va qu'au responsable ; un
   projet fermé n'écrit à personne ; des e-mails coupés laissent le Hub
   vivre ; un membre d'équipe inactif ne reçoit rien. */
const { mettreEnFile, notifier, notifierClients, notifierEquipe, ecrireAuxClients, contactsEquipe } = communication;

/** Une ligne d'activité. `visibilite` : client ou interne. */
/* Ce qui touche l'argent (devis, facture, paiement) ne se lit, côté
   client, que par le responsable du projet : « responsable » au lieu de
   « client ». Les règles relisent ce mot. */
const TYPES_FINANCE = ['devis', 'facture', 'paiement'];

async function activite({ projet, organisation, type, texte, par, cible, lien, visibilite = 'client' }) {
  const public_ = visibilite === 'client' && TYPES_FINANCE.includes(type) ? 'responsable' : visibilite;
  try {
    await bdd.collection('activite').add(sansIndefini({
      projet: projet || null, organisation: organisation || null, type, texte,
      par: par ? { uid: par.uid || null, nom: par.nom || '', cote: par.cote || 'equipe' } : { uid: null, nom: EQUIPE_NOM, cote: 'equipe' },
      cible: cible || null, lien: lien || null, visibilite: public_, date: FieldValue.serverTimestamp(),
    }));
  } catch (err) { console.error('Activité non écrite', err); }
}

async function audit(action, details) {
  try {
    await bdd.collection('audit').add(sansIndefini({ action, ...details, date: FieldValue.serverTimestamp() }));
  } catch (err) { console.error('Audit non écrit', err); }
}

const LIEN = (chemin) => `${courriels.BASE}hub#${chemin}`;
const LIEN_ADMIN = (chemin) => `${courriels.BASE}cockpit#${chemin}`;
/* Le lien d'une visioconférence ne part dans un e-mail (bouton, href) que
   s'il commence par https:// : ni javascript:, ni data:, ni http en clair. */
const lienVisioSur = (l) => { const t = String(l || '').trim(); return /^https:\/\/\S+$/i.test(t) ? t : ''; };
const nomProjet = (p) => ((p && p.nom) || '');
const auteurDe = (doc, defaut = 'equipe') => ((doc && doc.par) ? { uid: doc.par.uid, nom: doc.par.nom, cote: doc.par.cote || defaut } : null);

/* ==========================================================================
   1. Les tâches
   ========================================================================== */

/* Le passage d'un état à un autre, en une phrase juste : « en cours » et
   « à faire » se suivent de « a passé … » sans « en » de trop (« en en
   cours »), un état qui est un participe se dit « a marqué … comme … ». */
const phraseStatut = (sujet, libelle) => (/^(en|à) /.test(String(libelle))
  ? `a passé ${sujet} ${libelle}`
  : `a marqué ${sujet} comme ${libelle}`);

exports.hubTacheEcrite = onDocumentWritten({ region: REGION, document: 'taches/{tacheId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const projet = await lireProjet(apres.projet);
  const lien = `/projets/${apres.projet}/taches/${evenement.params.tacheId}`;
  const par = auteurDe(apres);
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';

  if (!avant) {
    await activite({ projet: apres.projet, type: 'tache', texte: `a créé la tâche « ${apres.titre} »`, par, lien, visibilite });
    return;
  }
  if (avant.statut !== apres.statut) {
    const libelles = { 'a-faire': 'à faire', 'en-cours': 'en cours', 'en-revue': 'en revue', 'bloquee': 'bloquée', 'attente-client': 'en attente du client', 'repondu': 'répondue', 'terminee': 'terminée' };
    /* La réponse du client depuis la fiche de la tâche : l'activité est à
       son nom, l'équipe est prévenue (notification et lettre). */
    const reponse = apres.statut === 'repondu' && avant.statut === 'attente-client' && apres.reponseClient ? apres.reponseClient : null;
    if (reponse) {
      const parClient = { uid: reponse.par || null, nom: reponse.nom || 'Le client', cote: 'client' };
      await activite({ projet: apres.projet, type: 'tache', texte: `a répondu sur la tâche « ${apres.titre} »`, par: parClient, lien, visibilite });
      await notifierEquipe(apres.projet, { type: 'tache', titre: 'Réponse du client sur une tâche', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
      await mettreEnFile('tache-reponse', contactsEquipe(), { projetNom: nomProjet(projet), titre: apres.titre, par: reponse.nom || '', texte: reponse.texte || '', pieces: Array.isArray(reponse.pieces) ? reponse.pieces.length : 0, lien: LIEN_ADMIN(lien) }, { projet: apres.projet, evenement: 'tache-reponse' });
      return;
    }
    await activite({ projet: apres.projet, type: 'tache', texte: phraseStatut(`la tâche « ${apres.titre} »`, libelles[apres.statut] || apres.statut), par, lien, visibilite });
    if (apres.statut === 'attente-client' && visibilite === 'client') {
      await notifierClients(projet, 'tache', { type: 'tache', titre: 'Nous attendons votre retour', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'tache-attente', 'tache-attente', { projetNom: nomProjet(projet), titre: apres.titre, description: apres.description, lien: LIEN(lien) });
    }
    if (apres.statut === 'terminee' && visibilite === 'client') {
      await notifierClients(projet, 'tache', { type: 'tache', titre: 'Tâche terminée', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
    }
  }
  if (avant.archive !== apres.archive) {
    await activite({ projet: apres.projet, type: 'tache', texte: `${apres.archive ? 'a archivé' : 'a restauré'} la tâche « ${apres.titre} »`, par, lien, visibilite: 'interne' });
  }
});

/* ==========================================================================
   2. Les jalons : activité, et progression du projet si elle est calculée
   ========================================================================== */

async function recalculerProgression(projetId) {
  const ref = bdd.doc(`projets/${projetId}`);
  const doc = await ref.get();
  if (!doc.exists) return;
  const p = doc.data();
  if (!p.progression || p.progression.mode !== 'jalons') return;
  const jalons = await ref.collection('jalons').get();
  if (jalons.empty) return;
  const total = jalons.docs.reduce((s, j) => { const d = j.data(); return s + (d.statut === 'termine' ? 100 : Math.max(0, Math.min(100, Number(d.progression) || 0))); }, 0);
  const valeur = Math.round(total / jalons.size);
  if (valeur !== Number(p.progression.valeur)) await ref.update({ 'progression.valeur': valeur, maj: FieldValue.serverTimestamp() });
}

/* Le devis d'une étape et le montant HT de sa ligne (projets/{p}/montants/
   jalon-{id}), quand elle en a. Rien n'est levé : une étape sans devis
   rend simplement vide. */
const euros = (n) => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
async function ligneDeDevis(projetId, jalonId, jalon) {
  if (!jalon || !jalon.devis) return { numero: '', montant: null, taxe: false };
  let numero = '';
  let montant = null;
  let taxe = false;
  try { const d = await bdd.doc(`documents/${jalon.devis}`).get(); if (d.exists) { numero = String(d.data().numero || ''); taxe = Number(d.data().tva) > 0; } } catch (err) { console.error('Devis de l étape illisible', err); }
  try { const m = await bdd.doc(`projets/${projetId}/montants/jalon-${jalonId}`).get(); if (m.exists && Number.isFinite(Number(m.data().montant))) montant = Number(m.data().montant); } catch (err) { console.error('Montant de l étape illisible', err); }
  return { numero, montant, taxe };
}

exports.hubJalonEcrit = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/jalons/{jalonId}' }, async (evenement) => {
  const projetId = evenement.params.projetId;
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  await recalculerProgression(projetId);
  const lien = `/projets/${projetId}/roadmap`;
  if (apres && !avant) await activite({ projet: projetId, type: 'jalon', texte: `a ajouté l'étape « ${apres.titre} »`, lien });
  else if (apres && avant && avant.statut !== apres.statut && apres.statut === 'termine') {
    await activite({ projet: projetId, type: 'jalon', texte: `a terminé l'étape « ${apres.titre} »`, lien });
    const projet = await lireProjet(projetId);
    /* Une étape née d'une ligne de devis : la notification nomme le devis,
       et dit le montant HT de la ligne aux seuls responsables, puisque la
       finance n'est qu'à eux. Les autres lisent le devis sans le chiffre. */
    const { numero, montant, taxe } = await ligneDeDevis(projetId, evenement.params.jalonId, apres);
    const texteBase = numero ? `${apres.titre} · devis ${numero}` : apres.titre;
    const uids = await communication.uidsClients(projet, 'jalon');
    const roles = (projet && projet.roles) || {};
    const responsables = uids.filter((u) => roles[u] === 'responsable');
    const autres = uids.filter((u) => roles[u] !== 'responsable');
    const notif = { type: 'jalon', titre: 'Étape terminée', lien: `#${lien}`, projet: projetId };
    if (responsables.length) await notifier(responsables, { ...notif, texte: numero && montant !== null ? `${texteBase} · ${euros(montant)}${taxe ? ' HT' : ''}` : texteBase });
    if (autres.length) await notifier(autres, { ...notif, texte: texteBase });
  } else if (apres && avant && avant.statut !== apres.statut && apres.statut === 'bloque') {
    await activite({ projet: projetId, type: 'jalon', texte: `a marqué l'étape « ${apres.titre} » comme bloqué`, lien, visibilite: 'interne' });
  } else if (!apres && avant) await activite({ projet: projetId, type: 'jalon', texte: `a retiré l'étape « ${avant.titre} »`, lien, visibilite: 'interne' });
});

/* ==========================================================================
   3. Les versions
   ========================================================================== */

exports.hubReleaseEcrite = onDocumentWritten({ region: REGION, document: 'releases/{releaseId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const projet = await lireProjet(apres.projet);
  const nom = `${({ ios: 'iPhone', android: 'Android', web: 'Web', backend: 'Serveur', admin: 'Tableau de bord', landing: 'Site vitrine' })[apres.plateforme] || apres.plateforme || ''} ${apres.version || ''}`.trim();
  /* La fiche de la version, pas la liste : un clic, et tout y est. */
  const lien = `/projets/${apres.projet}/releases/${evenement.params.releaseId}`;
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';
  const devientDisponible = apres.statut === 'disponible' && (!avant || avant.statut !== 'disponible');
  if (!avant) await activite({ projet: apres.projet, type: 'release', texte: `a créé la version ${nom}`, par: auteurDe(apres), lien, visibilite: devientDisponible ? visibilite : 'interne' });
  if (devientDisponible) {
    await activite({ projet: apres.projet, type: 'release', texte: `a publié la version ${nom}`, par: auteurDe(apres), lien, visibilite });
    if (visibilite === 'client') {
      await notifierClients(projet, 'release', { type: 'release', titre: `Version ${nom} disponible`, texte: apres.titre || '', lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'release', 'release', { projetNom: nomProjet(projet), version: nom, titre: apres.titre, notes: apres.notes || [], lienStore: (apres.liens || {}).store, lien: LIEN(lien) });
    }
  } else if (avant && avant.statut !== apres.statut) {
    await activite({ projet: apres.projet, type: 'release', texte: `a passé la version ${nom} en ${apres.statut}`, par: auteurDe(apres), lien, visibilite: 'interne' });
  }
});

/* ==========================================================================
   4. Les fichiers
   ========================================================================== */

exports.hubFichierCree = onDocumentCreated({ region: REGION, document: 'fichiers/{fichierId}' }, async (evenement) => {
  const f = evenement.data && evenement.data.data();
  if (!f) return;
  const projet = await lireProjet(f.projet);
  const lien = `/projets/${f.projet}/fichiers`;
  const par = f.par ? { uid: f.par.uid, nom: f.par.nom, cote: f.par.cote } : null;
  await activite({ projet: f.projet, type: 'fichier', texte: `a déposé le fichier « ${f.nom} »`, par, lien, visibilite: f.visibilite === 'interne' ? 'interne' : 'client' });
  if (par && par.cote === 'client') {
    await notifierEquipe(f.projet, { type: 'fichier', titre: 'Fichier reçu du client', texte: `${f.nom} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: f.projet });
    await mettreEnFile('fichier', contactsEquipe(), { projetNom: nomProjet(projet), nom: f.nom, par: par.nom, cote: 'equipe', lien: LIEN_ADMIN(lien) });
  } else if (f.visibilite !== 'interne') {
    await notifierClients(projet, 'fichier', { type: 'fichier', titre: 'Nouveau fichier disponible', texte: f.nom, lien: `#${lien}`, projet: f.projet });
    await ecrireAuxClients(projet, 'fichier', 'fichier', { projetNom: nomProjet(projet), nom: f.nom, categorie: f.categorie, cote: 'client', lien: LIEN(lien) });
  }
});

/* Le client retire un fichier qu'il avait déposé (les règles ne laissent
   effacer que cela) : l'équipe le sait, l'activité le garde. */
exports.hubFichierRetire = v2firestore.onDocumentDeleted({ region: REGION, document: 'fichiers/{fichierId}' }, async (evenement) => {
  const f = evenement.data && evenement.data.data();
  if (!f || !f.projet) return;
  const par = f.par ? { uid: f.par.uid, nom: f.par.nom, cote: f.par.cote } : null;
  if (!par || par.cote !== 'client') return;
  const projet = await lireProjet(f.projet);
  const lien = `/projets/${f.projet}/fichiers`;
  await activite({ projet: f.projet, type: 'fichier', texte: `a retiré le fichier « ${f.nom} »`, par, lien, visibilite: 'client' });
  await notifierEquipe(f.projet, { type: 'fichier', titre: 'Fichier retiré par le client', texte: `${f.nom} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: f.projet });
});

/* ==========================================================================
   5. Les réunions
   ========================================================================== */

exports.hubReunionEcrite = onDocumentWritten({ region: REGION, document: 'reunions/{reunionId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const projet = await lireProjet(apres.projet);
  /* La fiche de la réunion, pas la liste : rejoindre, agenda, compte rendu. */
  const lien = `/projets/${apres.projet}/reunions/${evenement.params.reunionId}`;
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';
  const quand = apres.date && apres.date.toDate ? apres.date.toDate() : null;
  const dateTexte = quand ? quand.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '';
  const dateChangee = avant && avant.date && apres.date && avant.date.toMillis && avant.date.toMillis() !== apres.date.toMillis();
  if (!avant) {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a programmé la réunion « ${apres.titre} » le ${dateTexte}`, par: auteurDe(apres), lien, visibilite });
    if (visibilite === 'client') {
      await notifierClients(projet, 'reunion', { type: 'reunion', titre: 'Réunion programmée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'reunion', 'reunion', { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: lienVisioSur(apres.lien), ordreDuJour: apres.ordreDuJour, lien: LIEN(lien) });
    }
  } else if (dateChangee && visibilite === 'client') {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a déplacé la réunion « ${apres.titre} » au ${dateTexte}`, par: auteurDe(apres), lien, visibilite });
    await notifierClients(projet, 'reunion', { type: 'reunion', titre: 'Réunion déplacée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
    await ecrireAuxClients(projet, 'reunion', 'reunion', { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: lienVisioSur(apres.lien), ordreDuJour: apres.ordreDuJour, lien: LIEN(lien), deplacee: true });
  } else if (avant && !avant.compteRendu && apres.compteRendu && visibilite === 'client') {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a publié le compte rendu de « ${apres.titre} »`, par: auteurDe(apres), lien, visibilite });
    await notifierClients(projet, 'reunion', { type: 'reunion', titre: 'Compte rendu disponible', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
  }
});

/* ==========================================================================
   6. Les validations
   ========================================================================== */

exports.hubValidationCreee = onDocumentCreated({ region: REGION, document: 'validations/{validationId}' }, async (evenement) => {
  const v = evenement.data && evenement.data.data();
  if (!v) return;
  const projet = await lireProjet(v.projet);
  const lien = `/valider/${evenement.params.validationId}`;
  await activite({ projet: v.projet, type: 'validation', texte: `a demandé une validation : « ${v.titre} »`, par: v.demandeur ? { uid: v.demandeur.uid, nom: v.demandeur.nom, cote: 'equipe' } : null, lien });
  await notifierClients(projet, 'validation', { type: 'validation', titre: 'Votre validation est attendue', texte: v.titre, lien: `#${lien}`, projet: v.projet });
  await ecrireAuxClients(projet, 'validation-demandee', 'validation-demandee', { projetNom: nomProjet(projet), titre: v.titre, description: v.description, type: v.type, lien: LIEN(lien) });
});

exports.hubValidationModifiee = onDocumentUpdated({ region: REGION, document: 'validations/{validationId}' }, async (evenement) => {
  const avant = evenement.data.before.data();
  const apres = evenement.data.after.data();
  if (avant.statut === apres.statut) return;
  const projet = await lireProjet(apres.projet);
  const lienAdmin = `/validations/${evenement.params.validationId}`;
  const lienClient = `/valider/${evenement.params.validationId}`;
  if (apres.statut === 'approuvee' || apres.statut === 'modifications') {
    const qui = apres.reponse || {};
    const approuvee = apres.statut === 'approuvee';
    const texte = approuvee ? `a approuvé « ${apres.titre} »` : `a demandé des modifications sur « ${apres.titre} »`;
    await activite({ projet: apres.projet, type: 'validation', texte, par: { uid: qui.par, nom: qui.nom, cote: 'client' }, lien: lienAdmin });
    await notifierEquipe(apres.projet, { type: 'validation', titre: approuvee ? 'Validation approuvée' : 'Modifications demandées', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lienAdmin}`, projet: apres.projet });
    await mettreEnFile('validation-reponse', contactsEquipe(), { projetNom: nomProjet(projet), titre: apres.titre, statut: apres.statut, par: qui.nom, commentaire: qui.commentaire, lien: LIEN_ADMIN(lienAdmin) });
    await audit('validation', { projet: apres.projet, validation: evenement.params.validationId, statut: apres.statut, par: qui.par || null, nom: qui.nom || '' });
    /* Un accusé à celui qui a répondu, et ses collègues du projet sont
       prévenus (lui exclu) : avant, rien ne revenait à personne. */
    if (qui.par) await notifier([qui.par], { type: 'validation', titre: approuvee ? 'Merci, c\'est validé' : 'Vos remarques sont transmises', texte: apres.titre, lien: `#${lienClient}`, projet: apres.projet });
    await notifierClients(projet, 'validation', { type: 'validation', titre: `${qui.nom || 'Un collègue'} a ${approuvee ? 'approuvé' : 'demandé des modifications sur'} « ${apres.titre} »`, texte: nomProjet(projet), lien: `#${lienClient}`, projet: apres.projet }, { exclure: [qui.par].filter(Boolean) });
  } else if (apres.statut === 'annulee') {
    await activite({ projet: apres.projet, type: 'validation', texte: `a annulé la demande de validation « ${apres.titre} »`, lien: lienAdmin, visibilite: 'interne' });
    /* Le client l'apprend, et la notification « Votre validation est
       attendue » qui pointait vers elle est marquée lue : elle ne
       renvoie plus vers une validation annulée. */
    await notifierClients(projet, 'validation', { type: 'validation', titre: 'Validation retirée', texte: `${apres.titre} : vous n'avez plus rien à faire.`, lien: `#${lienClient}`, projet: apres.projet });
    await marquerLuesParLien((projet && projet.membres) || [], `#${lienClient}`, { saufTitre: 'Validation retirée' });
  }
});

/* Marque lues, dans la boîte de chaque uid, les notifications qui mènent
   à ce lien, sauf celle qui vient d'être écrite (son titre). */
async function marquerLuesParLien(uids, lien, { saufTitre = '' } = {}) {
  for (const uid of new Set((uids || []).filter(Boolean))) {
    try {
      const q = await bdd.collection(`boites/${uid}/notifications`).where('lien', '==', lien).where('lu', '==', false).get();
      const lot = bdd.batch();
      let n = 0;
      for (const d of q.docs) { if (saufTitre && d.data().titre === saufTitre) continue; lot.update(d.ref, { lu: true }); n += 1; }
      if (n) await lot.commit();
    } catch (err) { console.error(`Notifications de ${uid} non marquées lues`, err); }
  }
}

/* ==========================================================================
   7. Les notes, les blocages
   ========================================================================== */

exports.hubNoteCreee = onDocumentCreated({ region: REGION, document: 'notes/{noteId}' }, async (evenement) => {
  const n = evenement.data && evenement.data.data();
  if (!n) return;
  const libelles = { decision: 'a consigné une décision', information: 'a noté une information', idee: 'a noté une idée', risque: 'a signalé un risque', reunion: 'a ajouté une note de réunion', proposition: 'a proposé à la validation' };
  await activite({ projet: n.projet, type: 'note', texte: `${libelles[n.type] || 'a ajouté une note'} : « ${n.titre} »`, par: auteurDe(n), lien: `/projets/${n.projet}/notes`, visibilite: n.visibilite === 'interne' ? 'interne' : 'client' });
  if (n.type === 'decision' && n.visibilite !== 'interne') {
    const projet = await lireProjet(n.projet);
    await notifierClients(projet, 'note', { type: 'note', titre: 'Décision consignée', texte: n.titre, lien: `#/projets/${n.projet}/notes`, projet: n.projet });
  }
  /* Une proposition de l'équipe attend la réponse du client : il est
     prévenu. Celle d'un client prévient l'équipe par la conversation
     (écrite par la page Notes, hubMessageProjet). */
  if (n.etat === 'a-valider' && n.origine === 'equipe') {
    const projet = await lireProjet(n.projet);
    await notifierClients(projet, 'note', { type: 'note', titre: 'Une proposition attend votre validation', texte: n.titre, lien: `#/projets/${n.projet}/notes`, projet: n.projet });
  }
});

exports.hubBlocageEcrit = onDocumentWritten({ region: REGION, document: 'blocages/{blocageId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const lien = `/projets/${apres.projet}`;
  /* La fiche du point bloquant s'ouvre à l'arrivée : « ?blocage=<id> ». */
  const lienFiche = `/projets/${apres.projet}?blocage=${evenement.params.blocageId}`;
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';
  if (!avant) {
    await activite({ projet: apres.projet, type: 'blocage', texte: `a signalé un point bloquant : « ${apres.titre} »`, lien, visibilite });
    if (visibilite === 'client' && apres.responsable === 'client') {
      const projet = await lireProjet(apres.projet);
      await notifierClients(projet, 'blocage', { type: 'blocage', titre: 'Un point bloque de votre côté', texte: apres.titre, lien: `#${lienFiche}`, projet: apres.projet });
      /* Une lettre, avec ce qu'on attend de lui : la notification seule ne
         disait ni quoi faire, ni pour quand. */
      await ecrireAuxClients(projet, 'blocage-client', 'blocage-client', { projetNom: nomProjet(projet), titre: apres.titre, description: apres.description || '', attendu: apres.attendu || '', echeance: apres.echeance || null, lien: LIEN(lienFiche) }, { parDestinataire: true });
    }
  } else if (!avant.resolu && apres.resolu) {
    await activite({ projet: apres.projet, type: 'blocage', texte: `a levé le point bloquant « ${apres.titre} »`, lien, visibilite });
  } else if (!avant.signaleFait && apres.signaleFait) {
    /* « C'est fait », dit le client : l'équipe vérifie et lève. */
    const qui = apres.signaleFait;
    const projet = await lireProjet(apres.projet);
    await activite({ projet: apres.projet, type: 'blocage', texte: `a dit que le point bloquant « ${apres.titre} » est réglé de son côté`, par: { uid: qui.par || null, nom: qui.nom || 'Le client', cote: 'client' }, lien, visibilite });
    await notifierEquipe(apres.projet, { type: 'blocage', titre: 'Point bloquant : le client dit que c\'est fait', texte: `${apres.titre} · ${nomProjet(projet)}${qui.texte ? ` · ${String(qui.texte).slice(0, 120)}` : ''}`, lien: `#${lien}`, projet: apres.projet });
  }
});

/* ==========================================================================
   8. La conversation d'un projet
   ========================================================================== */

/* Le texte d'une ligne d'activité de la conversation. */
function texteActiviteMessage(m) {
  if (m.supprime) return 'a supprimé un message de la conversation';
  const nbPieces = (m.pieces || []).length;
  const extrait = String(m.texte || '').trim().slice(0, 140) || (nbPieces > 1 ? `${nbPieces} pièces jointes` : 'Pièce jointe');
  return String(m.texte || '').trim()
    ? `a écrit dans la conversation : « ${extrait}${(m.texte || '').length > 140 ? '…' : ''} »`
    : `a envoyé ${extrait.toLowerCase()} dans la conversation`;
}

exports.hubMessageProjet = onDocumentCreated({ region: REGION, document: 'projets/{projetId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  const projetId = evenement.params.projetId;
  const projet = await lireProjet(projetId);
  const de = m.de || {};
  const nbPieces = (m.pieces || []).length;
  /* Un message sans texte n'est que des pièces : on le dit, plutôt que de
     citer un mot vide. */
  const extrait = String(m.texte || '').trim().slice(0, 140) || (nbPieces > 1 ? `${nbPieces} pièces jointes` : 'Pièce jointe');
  const lienClient = `/messages/${projetId}`;
  const messageId = evenement.params.messageId;
  /* La ligne d'activité et les notifications gardent l'identifiant du
     message : supprimé, il est effacé d'elles aussi (hubMessageProjetModifie). */
  await activite({ projet: projetId, type: 'message', texte: texteActiviteMessage(m), par: { uid: de.uid, nom: de.nom, cote: de.cote }, lien: lienClient, cible: { type: 'message', id: messageId } });
  if (de.cote === 'equipe') {
    await notifierClients(projet, 'message', { type: 'message', titre: `Nouveau message de ${de.nom || 'Capmedia'}`, texte: extrait, lien: `#${lienClient}`, projet: projetId, message: messageId }, { exclure: [de.uid] });
    await ecrireAuxClients(projet, 'message-projet', 'message-projet', { projetNom: nomProjet(projet), auteur: de.nom || 'Capmedia', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN(lienClient) });
  } else {
    await notifierEquipe(projetId, { type: 'message', titre: `Message de ${de.nom || 'un client'}`, texte: `${nomProjet(projet)} · ${extrait}`, lien: `#${lienClient}`, projet: projetId, message: messageId }, { exclure: [de.uid] });
    await mettreEnFile('message-projet', contactsEquipe(), { projetNom: nomProjet(projet), auteur: de.nom || 'Client', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN_ADMIN(lienClient), cote: 'equipe' });
  }
});

/* Un message modifié ou supprimé par son auteur (les règles ne laissent
   faire que lui). Modifié : la ligne d'activité suit le nouveau texte.
   Supprimé : son texte ne doit plus se lire nulle part. La ligne
   d'activité et les notifications qu'il a fait naître le perdent, les
   réponses qui le citaient aussi, et ses pièces jointes sont effacées du
   stockage (seulement celles de la conversation de ce projet, déposées
   par lui : une pièce d'autrui citée par son chemin n'est jamais touchée).
   Les e-mails déjà partis ne se rattrapent pas. */
exports.hubMessageProjetModifie = onDocumentUpdated({ region: REGION, document: 'projets/{projetId}/messages/{messageId}' }, async (evenement) => {
  const avant = evenement.data.before.data() || {};
  const apres = evenement.data.after.data() || {};
  const { projetId, messageId } = evenement.params;
  const supprime = Boolean(apres.supprime) && !avant.supprime;
  const modifie = !supprime && !apres.supprime && String(avant.texte || '') !== String(apres.texte || '');
  if (!supprime && !modifie) return;
  try {
    const lignes = await bdd.collection('activite').where('cible.id', '==', messageId).get();
    for (const l of lignes.docs) {
      if (l.data().projet !== projetId) continue;
      await l.ref.update({ texte: texteActiviteMessage(apres) });
    }
  } catch (err) { console.error('Activité du message non mise à jour', err); }
  if (!supprime) return;
  const auteur = (avant.de || {}).uid || '';
  /* Les notifications : dans la boîte des membres du projet et de l'équipe. */
  try {
    const projet = await lireProjet(projetId);
    const equipe = await bdd.collection('equipe').get();
    const uids = new Set([...((projet && projet.membres) || []), ...equipe.docs.map((d) => d.id)]);
    for (const uid of uids) {
      const q = await bdd.collection(`boites/${uid}/notifications`).where('message', '==', messageId).get();
      for (const d of q.docs) await d.ref.update({ texte: 'Message supprimé' });
    }
  } catch (err) { console.error('Notifications du message non effacées', err); }
  try {
    const reponses = await bdd.collection(`projets/${projetId}/messages`).where('reponseA.id', '==', messageId).get();
    for (const r of reponses.docs) await r.ref.update({ 'reponseA.extrait': '', 'reponseA.supprime': true });
  } catch (err) { console.error('Citations du message non effacées', err); }
  const { getStorage } = require('firebase-admin/storage');
  const dossier = `projets/${projetId}/messages/`;
  for (const p of avant.pieces || []) {
    const chemin = String((p && p.chemin) || '');
    if (!chemin.startsWith(dossier) || chemin.includes('..')) continue;
    try {
      const fichier = getStorage().bucket().file(chemin);
      const [existe] = await fichier.exists();
      if (!existe) continue;
      const [meta] = await fichier.getMetadata();
      const par = ((meta && meta.metadata) || {}).par || '';
      if (par && par !== auteur) { console.warn(`Pièce ${chemin} déposée par un autre : gardée`); continue; }
      /* Une pièce d'avant le dépôt par le serveur ne dit pas qui l'a posée :
         on la garde si un autre message la cite encore. */
      if (!par) {
        const autres = await bdd.collection(`projets/${projetId}/messages`).where('pieces', 'array-contains', p).limit(1).get();
        if (!autres.empty) continue;
      }
      await fichier.delete({ ignoreNotFound: true });
    } catch (err) { console.error(`Pièce ${chemin} non effacée`, err); }
  }
  await audit('message.supprime', { projet: projetId, message: messageId, par: auteur, pieces: (avant.pieces || []).length });
});

/* ==========================================================================
   9. Les paiements, les pièces comptables (miroir d'activité)
   ========================================================================== */

exports.hubPaiementCree = onDocumentCreated({ region: REGION, document: 'paiements/{paiementId}' }, async (evenement) => {
  const p = evenement.data && evenement.data.data();
  if (!p) return;
  const projet = await lireProjet(p.projet);
  const montant = Number(p.montant) || 0;
  const texteMontant = montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  await activite({ projet: p.projet, type: 'paiement', texte: `a enregistré un paiement de ${texteMontant}`, lien: `/finances/${p.facture || ''}` });
  await notifierClients(projet, 'paiement', { type: 'paiement', titre: 'Paiement enregistré', texte: `${texteMontant} · merci`, lien: `#/finances/${p.facture || ''}`, projet: p.projet });
  await audit('paiement', { projet: p.projet, facture: p.facture || null, montant, moyen: p.moyen || '' });
});

exports.hubDocumentActivite = onDocumentWritten({ region: REGION, document: 'documents/{documentId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const genre = apres.type === 'devis' ? 'devis' : 'facture';
  const nom = `${apres.numero || ''}`.trim();
  const lien = `/finances/${evenement.params.documentId}`;
  /* La demande de devis née du calculateur des axes : le client l'envoie,
     l'équipe est prévenue dans le Cockpit ; il l'annule, elle l'apprend ;
     l'équipe y joint le devis, c'est un devis déposé. */
  const photo = apres.photo || {};
  const nbLignes = (photo.lignes || []).length;
  const estimation = photo.periode && Number.isFinite(Number(photo.periode.ht)) ? `≈ ${euros(Number(photo.periode.ht))}${Number(photo.tva) > 0 ? ' HT' : ''}` : '';
  const parClient = apres.par && apres.par.uid ? { uid: apres.par.uid, nom: apres.par.nom || '', cote: 'client' } : null;
  if (!avant && apres.statut === 'demande') {
    const projet = await lireProjet(apres.projet);
    await activite({ projet: apres.projet, type: 'devis', texte: `a demandé un devis pour ${nbLignes > 1 ? `${nbLignes} axes d'évolution` : 'un axe d\'évolution'}`, par: parClient, lien });
    await notifierEquipe(apres.projet, { type: 'devis', titre: 'Demande de devis', texte: [`${nbLignes} axe${nbLignes > 1 ? 's' : ''}`, estimation, nomProjet(projet)].filter(Boolean).join(' · '), lien: `#${lien}`, projet: apres.projet });
    return;
  }
  if (avant && avant.statut === 'demande' && apres.statut === 'annule') {
    const parClientAnnule = apres.annuleLe ? parClient : null;
    await activite({ projet: apres.projet, type: 'devis', texte: parClientAnnule ? 'a annulé sa demande de devis' : 'a écarté la demande de devis', par: parClientAnnule, lien });
    if (parClientAnnule) {
      const projet = await lireProjet(apres.projet);
      await notifierEquipe(apres.projet, { type: 'devis', titre: 'Demande de devis annulée', texte: [`${nbLignes} axe${nbLignes > 1 ? 's' : ''}`, nomProjet(projet)].filter(Boolean).join(' · '), lien: `#${lien}`, projet: apres.projet });
    }
    return;
  }
  if (avant && avant.statut === 'demande' && apres.statut === 'envoye') {
    await activite({ projet: apres.projet, type: 'devis', texte: `a déposé le devis ${nom}, en réponse à la demande`, lien });
    return;
  }
  if (!avant) { await activite({ projet: apres.projet, type: genre, texte: `a déposé ${genre === 'devis' ? 'le devis' : 'la facture'} ${nom}`, lien }); return; }
  /* « J'ai réglé cette facture » : le client déclare, le serveur prévient
     l'équipe (boîte du Cockpit et lettre) et l'écrit dans l'activité. La
     confirmation (par l'enregistrement du paiement) ne redéclenche rien. */
  const declare = apres.reglementDeclare || null;
  const declareAvant = (avant && avant.reglementDeclare) || null;
  if (genre === 'facture' && declare && (!declareAvant || enMillis(declareAvant.le) !== enMillis(declare.le))) {
    const projet = await lireProjet(apres.projet);
    const somme = Number(declare.montant) || 0;
    const texteMontant = `${somme.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}${Number(apres.tva) > 0 ? ' TTC' : ''}`;
    const par = { uid: declare.par || null, nom: declare.nom || '', cote: 'client' };
    await activite({ projet: apres.projet, type: 'paiement', texte: `a déclaré un règlement de ${texteMontant} sur la facture ${nom}`, par, lien });
    await notifierEquipe(apres.projet, { type: 'paiement', titre: 'Règlement déclaré', texte: `${nom} · ${texteMontant} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    const ttc = typeof apres.ttc === 'number' ? apres.ttc : (Number(apres.montant) || 0) * (1 + (Number(apres.tva) || 0) / 100);
    let reste = ttc;
    try {
      const q = await bdd.collection('paiements').where('facture', '==', evenement.params.documentId).get();
      reste = Math.max(0, ttc - q.docs.reduce((t, d) => t + (d.data().statut !== 'annule' ? Number(d.data().montant) || 0 : 0), 0));
    } catch (err) { console.error('Paiements illisibles pour le reste à payer', err); }
    const MOYENS = { virement: 'Virement', carte: 'Carte', stripe: 'Stripe', cheque: 'Chèque', especes: 'Espèces', autre: 'Autre' };
    await mettreEnFile('reglement-declare', contactsEquipe(), {
      numero: apres.numero, libelle: apres.libelle, projetNom: nomProjet(projet), par: declare.nom || '',
      montant: somme, tva: apres.tva, date: declare.date || null, moyen: MOYENS[declare.moyen] || declare.moyen || '', reference: declare.reference || '',
      reste, lien: LIEN_ADMIN(lien), cote: 'equipe',
    }, { projet: apres.projet, evenement: 'reglement-declare' });
  }
  if (avant.statut !== apres.statut) {
    /* Le retard et l'expiration posés par la fonction quotidienne portent
       leur marque (retardSignale, expireSignale) : elle a déjà écrit la
       ligne d'activité qui va avec, on ne la double pas. */
    if ((apres.statut === 'en-retard' && apres.retardSignale && !avant.retardSignale)
        || (apres.statut === 'expire' && apres.expireSignale && !avant.expireSignale)) return;
    /* Une réponse à un devis qui ne vient ni d'un responsable, ni de
       l'équipe qui gère la finance, est défaite par suiviDocumentModifie :
       elle ne laisse aucune trace d'activité. */
    if (apres.type === 'devis' && ['accepte', 'refuse'].includes(apres.statut)) {
      const projetDoc = await lireProjet(apres.projet);
      if (!(await acces.reponseDevisAcceptee(projetDoc, apres.reponse))) return;
    }
    const qui = apres.reponse && apres.statut !== avant.statut && ['accepte', 'refuse'].includes(apres.statut) ? { uid: apres.reponse.par, nom: apres.reponse.nom, cote: apres.reponse.cote === 'equipe' ? 'equipe' : 'client' } : null;
    const libelles = { accepte: 'a accepté', refuse: 'a refusé', consulte: 'a consulté', payee: 'a réglé', 'a-payer': 'a mis à payer', 'en-retard': 'a marqué en retard', envoye: 'a envoyé', envoyee: 'a envoyé', partielle: 'a réglé en partie', annule: 'a annulé', annulee: 'a annulé', expire: 'a laissé expirer' };
    /* Une seule ligne pour une acceptation, la plus parlante : le devis
       fondateur fait démarrer le projet, un avenant s'accepte. */
    const signature = apres.type === 'devis' && apres.statut === 'accepte' && (apres.portee || 'initial') === 'initial';
    /* Un règlement : l'équipe ne « règle » pas la facture, elle reçoit le
       paiement. Le client qui l'a déclaré en est le sujet ; sinon la ligne
       dit que le paiement est reçu. */
    const regle = genre === 'facture' && ['payee', 'partielle'].includes(apres.statut);
    const payeur = regle && declare && declare.nom ? { uid: declare.par || null, nom: declare.nom, cote: 'client' } : null;
    const texte = signature ? `a signé le devis ${nom} : le projet démarre`
      : regle && !payeur ? `a reçu ${apres.statut === 'payee' ? 'le paiement' : 'un paiement partiel'} de la facture ${nom}`
        : `${libelles[apres.statut] || `a passé en ${apres.statut}`} ${genre === 'devis' ? 'le devis' : 'la facture'} ${nom}`;
    await activite({ projet: apres.projet, type: genre, texte, par: payeur || qui, cible: signature ? evenement.params.documentId : undefined, lien, visibilite: apres.statut === 'consulte' ? 'interne' : 'client' });
    if (['accepte', 'refuse'].includes(apres.statut)) {
      await audit('devis', { projet: apres.projet, document: evenement.params.documentId, statut: apres.statut, par: (apres.reponse || {}).par || null });
      /* L'équipe l'apprend dans le Cockpit, pas seulement par la lettre. */
      if (apres.type === 'devis' && qui && qui.cote === 'client') {
        const projet = await lireProjet(apres.projet);
        await notifierEquipe(apres.projet, { type: 'devis', titre: apres.statut === 'accepte' ? 'Devis accepté' : 'Devis refusé', texte: `${nom} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
      }
    }
    if (apres.statut === 'payee') { const projet = await lireProjet(apres.projet); await notifierClients(projet, 'facture', { type: 'facture', titre: 'Facture réglée', texte: nom, lien: `#${lien}`, projet: apres.projet }); }
  }
});

/* ==========================================================================
   10. Les demandes (miroir d'activité et notifications dans la boîte)
   ========================================================================== */

exports.hubTicketActivite = onDocumentWritten({ region: REGION, document: 'tickets/{ticketId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const projet = await lireProjet(apres.projet);
  const lien = `/projets/${apres.projet}/demandes/${evenement.params.ticketId}`;
  const nom = apres.numero ? `${apres.numero} « ${apres.titre} »` : `« ${apres.titre} »`;
  if (!avant) {
    await activite({ projet: apres.projet, type: 'demande', texte: `a ouvert la demande ${nom}`, par: apres.auteur ? { uid: apres.auteur.uid, nom: apres.auteur.nom, cote: apres.auteur.cote } : null, lien });
    if (apres.auteur && apres.auteur.cote === 'client') await notifierEquipe(apres.projet, { type: 'demande', titre: 'Nouvelle demande', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    /* « Suite de » : l'ancienne demande apprend laquelle la poursuit. Le
       client ne peut pas écrire « suivant » (règles) : le serveur le fait. */
    if (apres.suite && typeof apres.suite === 'string') {
      try { await bdd.doc(`tickets/${apres.suite}`).update({ suivant: evenement.params.ticketId }); } catch (err) { console.error(`La demande ${apres.suite} n'a pas reçu sa suite`, err); }
    }
    return;
  }
  if (avant.statut !== apres.statut) {
    const libelles = { nouveau: 'reçue', 'a-analyser': 'à analyser', 'en-attente-client': "en attente d'information", acceptee: 'acceptée', planifiee: 'planifiée', 'en-cours': 'en cours', 'en-revue': 'en revue', 'a-valider': 'à valider', resolu: 'terminée', refuse: 'refusée', annulee: 'annulée', ferme: 'fermée' };
    const conteste = avant.statut === 'a-valider' && apres.statut === 'en-cours';
    /* La marque « repart » distingue la réponse du client (posée par le
       serveur) du même passage fait à la main par l'équipe. */
    const repondu = avant.statut === 'en-attente-client' && apres.statut === 'en-cours' && Boolean(apres.repart) && String(avant.repart || '') !== String(apres.repart);
    /* « Je n'en ai plus besoin » : le client retire sa demande. Sa marque
       « lu.client » bouge avec le statut ; l'équipe, qui annule depuis le
       pilotage, ne la touche pas. */
    const retiree = ['nouveau', 'a-analyser', 'acceptee', 'planifiee'].includes(avant.statut) && apres.statut === 'annulee'
      && String((avant.lu || {}).client || '') !== String((apres.lu || {}).client || '');
    const parClient = (avant.statut === 'a-valider' && apres.statut === 'resolu') || (avant.statut === 'resolu' && apres.statut === 'en-cours') || conteste || repondu || retiree;
    await activite({ projet: apres.projet, type: 'demande', texte: repondu ? `a répondu : la demande ${nom} repart` : retiree ? `a retiré la demande ${nom}` : phraseStatut(`la demande ${nom}`, libelles[apres.statut] || apres.statut), par: parClient && apres.auteur ? { uid: apres.auteur.uid, nom: apres.auteur.nom, cote: 'client' } : null, lien });
    /* La réponse elle-même a déjà prévenu l'équipe (le message) : pas de
       seconde notification pour la demande qui repart. */
    if (!repondu && parClient) await notifierEquipe(apres.projet, { type: 'demande', titre: apres.statut === 'resolu' ? 'Correction validée par le client' : conteste ? 'Correction contestée par le client' : retiree ? 'Demande retirée par le client' : 'Demande rouverte par le client', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    else if (!repondu) await notifierClients(projet, 'demande', { type: 'demande', titre: `Demande ${libelles[apres.statut] || apres.statut}`, texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
  }
  if (avant.qualification !== apres.qualification && apres.qualification) {
    const libelles = { incluse: 'incluse au contrat', 'hors-perimetre': 'hors périmètre', 'a-chiffrer': 'à chiffrer', offerte: 'offerte' };
    await activite({ projet: apres.projet, type: 'demande', texte: `a qualifié la demande ${nom} : ${libelles[apres.qualification]}`, lien });
    if (apres.qualification === 'hors-perimetre' || apres.qualification === 'a-chiffrer') {
      await notifierClients(projet, 'demande', { type: 'demande', titre: apres.qualification === 'a-chiffrer' ? 'Un devis va vous être proposé' : 'Demande hors périmètre', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'qualification', 'qualification', { projetNom: nomProjet(projet), numero: apres.numero, titre: apres.titre, qualification: apres.qualification, lien: LIEN(lien) }, { objet: evenement.params.ticketId });
    }
  }
});

exports.hubMessageTicketBoite = onDocumentCreated({ region: REGION, document: 'tickets/{ticketId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  if (m.interne) return;
  const ticket = await bdd.doc(`tickets/${evenement.params.ticketId}`).get();
  if (!ticket.exists) return;
  const t = ticket.data();
  const projet = await lireProjet(t.projet);
  const lien = `/projets/${t.projet}/demandes/${evenement.params.ticketId}`;
  const de = m.de || {};
  await activite({ projet: t.projet, type: 'message', texte: `a répondu sur ${t.numero || 'la demande'} « ${t.titre} »`, par: { uid: de.uid, nom: de.nom, cote: de.cote }, lien });
  /* On lui avait demandé une précision : sa réponse fait repartir la
     demande, comme l'écran le lui promet. Avant, elle restait « en
     attente de vous » jusqu'à ce que l'équipe change le statut à la main. */
  if (de.cote !== 'equipe' && t.statut === 'en-attente-client') {
    try { await ticket.ref.update({ statut: 'en-cours', repart: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(), 'lu.client': FieldValue.serverTimestamp() }); } catch (err) { console.error('La demande n\'a pas pu repartir', err); }
  }
  if (de.cote === 'equipe') await notifierClients(projet, 'message', { type: 'message', titre: `Réponse sur ${t.numero || 'votre demande'}`, texte: String(m.texte || '').slice(0, 140), lien: `#${lien}`, projet: t.projet }, { exclure: [de.uid] });
  else {
    await notifierEquipe(t.projet, { type: 'message', titre: `${de.nom || 'Le client'} a répondu`, texte: `${t.numero || ''} ${t.titre}`.trim(), lien: `#${lien}`, projet: t.projet }, { exclure: [de.uid] });
    /* Ses collègues du projet le savent aussi (lui exclu) : avant, seul
       l'auteur suivait ce qu'il avait écrit. */
    await notifierClients(projet, 'message', { type: 'message', titre: `${de.nom || 'Un collègue'} a répondu sur ${t.numero || 'une demande'}`, texte: String(m.texte || '').slice(0, 140), lien: `#${lien}`, projet: t.projet }, { exclure: [de.uid] });
  }
});

/* ==========================================================================
   11. Les demandes de nouveau projet
   ========================================================================== */

exports.hubDemandeProjetCreee = onDocumentCreated({ region: REGION, document: 'demandesProjet/{demandeId}' }, async (evenement) => {
  const d = evenement.data && evenement.data.data();
  if (!d) return;
  const lien = `/nouveaux-projets/${evenement.params.demandeId}`;
  await activite({ organisation: d.organisation || null, type: 'projet', texte: `a demandé un nouveau projet : « ${d.titre} »`, par: d.par ? { uid: d.par.uid, nom: d.par.nom, cote: 'client' } : null, lien, visibilite: 'interne' });
  await notifierEquipe(null, { type: 'projet', titre: 'Nouveau projet demandé', texte: `${d.titre} · ${(d.par || {}).nom || ''}`, lien: `#${lien}` });
  await mettreEnFile('preprojet', contactsEquipe(), { titre: d.titre, par: (d.par || {}).nom, email: (d.par || {}).email, idee: d.idee, type: d.type, budget: d.budget, delai: d.delai, lien: LIEN_ADMIN(lien), cote: 'equipe' });
  if (d.par && emailPlausible(d.par.email)) {
    await mettreEnFile('preprojet', [{ email: d.par.email, nom: d.par.nom }], { titre: d.titre, par: d.par.nom, lien: LIEN(lien), cote: 'client' });
  }
});

exports.hubDemandeProjetModifiee = onDocumentUpdated({ region: REGION, document: 'demandesProjet/{demandeId}' }, async (evenement) => {
  const avant = evenement.data.before.data();
  const apres = evenement.data.after.data();
  if (avant.statut === apres.statut) return;
  const lien = `/nouveaux-projets/${evenement.params.demandeId}`;
  const libelles = { nouvelle: 'reçue', discussion: 'en discussion', qualification: 'en qualification', estimation: 'en estimation', devis: 'au stade du devis', acceptee: 'acceptée', projet: 'transformée en projet', refusee: 'close' };
  if (apres.par && apres.par.uid) await notifier([apres.par.uid], { type: 'projet', titre: `Votre demande est ${libelles[apres.statut] || apres.statut}`, texte: apres.titre, lien: apres.projet && apres.statut === 'projet' ? `#/projets/${apres.projet}` : `#${lien}` });
});

exports.hubMessageDemandeProjet = onDocumentCreated({ region: REGION, document: 'demandesProjet/{demandeId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  const demande = await bdd.doc(`demandesProjet/${evenement.params.demandeId}`).get();
  if (!demande.exists) return;
  const d = demande.data();
  const lien = `/nouveaux-projets/${evenement.params.demandeId}`;
  const de = m.de || {};
  if (de.cote === 'equipe') {
    if (d.par && d.par.uid) await notifier([d.par.uid], { type: 'message', titre: `Réponse de ${de.nom || 'Capmedia'}`, texte: String(m.texte || '').slice(0, 140), lien: `#${lien}` });
    if (d.par && emailPlausible(d.par.email)) await mettreEnFile('message-projet', [{ email: d.par.email, nom: d.par.nom }], { projetNom: d.titre, auteur: de.nom || 'Capmedia', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN(lien) }, { evenement: 'message-projet' });
  } else {
    await notifierEquipe(null, { type: 'message', titre: `${de.nom || 'Le client'} a répondu (nouveau projet)`, texte: d.titre, lien: `#${lien}` });
    await mettreEnFile('message-projet', contactsEquipe(), { projetNom: d.titre, auteur: de.nom || 'Client', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN_ADMIN(lien), cote: 'equipe' });
  }
});

/* ==========================================================================
   11 bis. La maintenance continue
   Le client demande : l'équipe est prévenue. L'équipe change l'état du
   forfait, tranche une évolution, consigne une journée : le client le
   lit dans son activité, et reçoit une lettre quand l'état change.
   ========================================================================== */

const joursEnClair = (n) => {
  const v = Number(n) || 0;
  if (v === 0.25) return 'un quart de journée';
  if (v === 0.5) return 'une demi-journée';
  if (v === 1) return 'une journée';
  return `${String(v).replace('.', ',')} jours`;
};

exports.hubMaintenanceEcrite = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/maintenance/{docId}' }, async (evenement) => {
  const projetId = evenement.params.projetId;
  const docId = evenement.params.docId;
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  const genre = (apres || avant || {}).genre || (docId === 'contrat' ? 'contrat' : '');
  const lien = `/maintenance?projet=${projetId}`;
  const projet = await lireProjet(projetId);
  const nom = nomProjet(projet);

  if (genre === 'contrat') {
    if (!apres) { await activite({ projet: projetId, type: 'maintenance', texte: 'a retiré le forfait de maintenance', lien, visibilite: 'interne' }); return; }
    const statutAvant = avant ? avant.statut : null;
    if (statutAvant === apres.statut) return;

    /* Le client demande : c'est à nous de répondre. */
    if (apres.statut === 'demande') {
      const d = apres.demande || {};
      const par = d.par || {};
      await activite({ projet: projetId, type: 'maintenance', texte: 'a demandé un forfait de maintenance continue', par: par.uid ? { uid: par.uid, nom: par.nom || '', cote: 'client' } : null, lien });
      await notifierEquipe(projetId, { type: 'maintenance', titre: 'Forfait de maintenance demandé', texte: `${nom} · ${par.nom || ''}`, lien: `#${lien}`, projet: projetId });
      await mettreEnFile('maintenance', contactsEquipe(), { cote: 'equipe', evenement: 'demande', projet: nom, par: par.nom, email: par.email, message: d.message, rythme: d.rythme, lien: LIEN_ADMIN(lien) });
      return;
    }

    /* L'équipe change l'état : le client l'apprend. */
    const LIBELLES = { proposition: 'proposition envoyée', actif: 'en cours', suspendu: 'suspendu', termine: 'terminé' };
    if (!LIBELLES[apres.statut]) return;
    const TITRES = { proposition: 'Une proposition de maintenance vous attend', actif: 'Votre forfait de maintenance est en cours', suspendu: 'Votre forfait de maintenance est suspendu', termine: 'Votre forfait de maintenance est terminé' };
    await activite({ projet: projetId, type: 'maintenance', texte: `a passé le forfait de maintenance en « ${LIBELLES[apres.statut]} »`, lien });
    await notifierClients(projet, 'maintenance', { type: 'maintenance', titre: TITRES[apres.statut], texte: apres.formule || nom, lien: `#${lien}`, projet: projetId });
    /* Le prix du forfait vit à part (montants/maintenance) : il ne part
       qu'aux responsables. */
    const tarif = await bdd.doc(`projets/${projetId}/montants/maintenance`).get();
    const prix = tarif.exists ? tarif.data().montant : null;
    await ecrireAuxClients(projet, 'maintenance', 'maintenance', { cote: 'client', evenement: apres.statut, projet: nom, formule: apres.formule, jours: apres.jours, periode: apres.reconduction, lien: LIEN(lien) },
      { pourResponsable: prix != null ? { montant: prix } : null });
    return;
  }

  if (genre === 'evolution') {
    if (apres && !avant) {
      if (apres.origine === 'client') {
        const par = apres.par || {};
        await activite({ projet: projetId, type: 'maintenance', texte: `a proposé une évolution : « ${apres.titre} »`, par: par.uid ? { uid: par.uid, nom: par.nom || '', cote: 'client' } : null, lien });
        await notifierEquipe(projetId, { type: 'maintenance', titre: 'Évolution proposée', texte: `${nom} · ${apres.titre}`, lien: `#${lien}`, projet: projetId });
        await mettreEnFile('maintenance', contactsEquipe(), { cote: 'equipe', evenement: 'evolution', projet: nom, par: par.nom, email: par.email, titre: apres.titre, message: apres.description, lien: LIEN_ADMIN(lien) });
      } else {
        await activite({ projet: projetId, type: 'maintenance', texte: `a ajouté l'évolution « ${apres.titre} »`, lien });
      }
      return;
    }
    if (apres && avant && avant.statut !== apres.statut) {
      const L = { proposee: 'remise en proposition', acceptee: 'acceptée', planifiee: 'planifiée', livree: 'livrée', refusee: 'écartée' };
      await activite({ projet: projetId, type: 'maintenance', texte: `a marqué l'évolution « ${apres.titre} » comme ${L[apres.statut] || apres.statut}`, lien });
      await notifierClients(projet, 'maintenance', { type: 'maintenance', titre: `Évolution ${L[apres.statut] || apres.statut}`, texte: apres.titre, lien: `#${lien}`, projet: projetId });
      /* Une lettre aussi : le Hub seul ne prévient que ceux qui l'ouvrent.
         Le nom de la séquence, s'il y en a une, se lit sur sa fiche. */
      let sequence = '';
      if (apres.sequence) { try { const sq = await bdd.doc(`projets/${projetId}/maintenance/${apres.sequence}`).get(); sequence = sq.exists ? (sq.data().titre || '') : ''; } catch (err) { sequence = ''; } }
      await ecrireAuxClients(projet, 'evolution-statut', 'evolution-statut', { projet: nom, titre: apres.titre, statut: apres.statut, reponse: apres.reponse || '', sequence, version: apres.version || '', lien: LIEN(lien) });
      return;
    }
    if (!apres && avant) await activite({ projet: projetId, type: 'maintenance', texte: `a retiré l'évolution « ${avant.titre} »`, lien, visibilite: 'interne' });
    return;
  }

  if (genre === 'journee') {
    const faiteApres = Boolean(apres && apres.statut === 'faite');
    const faiteAvant = Boolean(avant && avant.statut === 'faite');
    if (faiteApres && !faiteAvant) await activite({ projet: projetId, type: 'maintenance', texte: `a travaillé ${joursEnClair(apres.duree)} en maintenance${apres.objet ? ` : ${String(apres.objet).slice(0, 140)}` : ''}`, lien });
    return;
  }

  if (genre === 'sequence') {
    if (apres && !avant) await activite({ projet: projetId, type: 'maintenance', texte: `a ouvert la séquence de maintenance « ${apres.titre} »`, lien });
    else if (apres && avant && avant.statut !== apres.statut && apres.statut === 'close') await activite({ projet: projetId, type: 'maintenance', texte: `a clos la séquence de maintenance « ${apres.titre} »`, lien });
    else if (!apres && avant) await activite({ projet: projetId, type: 'maintenance', texte: `a retiré la séquence « ${avant.titre} »`, lien, visibilite: 'interne' });
  }
});

/* ==========================================================================
   11 ter. Les personnes du projet, vues par le client

   Les interlocuteurs (adresse, invitation) ne se lisent que par l'équipe.
   Pour que le client sache qui est qui de son côté, le serveur tient sur
   la fiche du projet un miroir « personnesClient » : le nom et le rôle des
   interlocuteurs actifs, rien d'autre. Ni le client ni l'équipe ne
   l'écrivent depuis un écran (règles), seul ce déclencheur.

   Le champ « personnes » (les identifiants, préparés compris) existait
   avant : il sert au registre des rôles et aux requêtes du serveur, on
   n'y touche pas.
   ========================================================================== */

const ROLES_CLIENT_MIROIR = ['responsable', 'collaborateur'];
const miroirPersonnes = (interlocuteurs) => {
  const vus = new Set();
  return interlocuteurs
    .filter((i) => i && i.statut === 'actif' && i.uid && ROLES_CLIENT_MIROIR.includes(i.role))
    .filter((i) => { if (vus.has(i.uid)) return false; vus.add(i.uid); return true; })
    .map((i) => ({ uid: String(i.uid), nom: String(i.nom || i.email || '').slice(0, 120), role: i.role }))
    .sort((a, b) => (a.role === b.role ? a.nom.localeCompare(b.nom) : (a.role === 'responsable' ? -1 : 1)));
};

exports.hubInterlocuteurEcrit = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/interlocuteurs/{cle}' }, async (evenement) => {
  const projetId = evenement.params.projetId;
  const ref = bdd.doc(`projets/${projetId}`);
  const projet = await ref.get();
  if (!projet.exists) return;
  const interlocuteurs = (await ref.collection('interlocuteurs').get()).docs.map((d) => d.data());
  const miroir = miroirPersonnes(interlocuteurs);
  /* Rien à écrire si rien n'a changé : une écriture pour rien réveillerait
     les écoutes du client et le déclencheur du projet. */
  const actuel = Array.isArray(projet.data().personnesClient) ? projet.data().personnesClient : [];
  if (JSON.stringify(actuel) === JSON.stringify(miroir)) return;
  /* « maj » bouge aussi : c'est elle que les écrans regardent pour savoir
     s'il y a quelque chose de neuf à redessiner. */
  try { await ref.update({ personnesClient: miroir, maj: FieldValue.serverTimestamp() }); } catch (err) { console.error(`Miroir des personnes non écrit sur ${projetId}`, err); }
});

/* ==========================================================================
   12. Le projet lui-même
   ========================================================================== */

exports.hubProjetModifie = onDocumentUpdated({ region: REGION, document: 'projets/{projetId}' }, async (evenement) => {
  const avant = evenement.data.before.data();
  const apres = evenement.data.after.data();
  const projetId = evenement.params.projetId;
  const lien = `/projets/${projetId}`;
  /* Un projet qui change de société : les deux fiches tiennent à jour leurs
     projets et leurs membres (lecture d'un agent, d'un client). */
  if (String(avant.organisation || '') !== String(apres.organisation || '')) {
    for (const o of [avant.organisation, apres.organisation].filter(Boolean)) await acces.recalculerOrganisation(String(o));
  }
  if (avant.statut !== apres.statut) {
    const libelles = { prospect: 'prospect', cadrage: 'en cadrage', planifie: 'planifié', 'en-cours': 'en cours', 'attente-client': 'en attente du client', 'en-revue': 'en revue', livraison: 'en livraison', maintenance: 'en maintenance', termine: 'terminé', suspendu: 'suspendu', archive: 'archivé' };
    await activite({ projet: projetId, type: 'projet', texte: `a passé le projet ${libelles[apres.statut] || apres.statut}`, lien });
    if (['termine', 'livraison', 'attente-client'].includes(apres.statut)) await notifierClients({ id: projetId, ...apres }, 'projet', { type: 'projet', titre: `Projet ${libelles[apres.statut]}`, texte: apres.nom, lien: `#${lien}`, projet: projetId });
  }
  const pa = avant.pulse || {}; const pb = apres.pulse || {};
  if (pb.prochaineEtape && pa.prochaineEtape !== pb.prochaineEtape) await activite({ projet: projetId, type: 'projet', texte: `a fixé la prochaine étape : ${pb.prochaineEtape}`, lien });
  if (pb.derniereLivraison && pa.derniereLivraison !== pb.derniereLivraison) await activite({ projet: projetId, type: 'projet', texte: `a livré : ${pb.derniereLivraison}`, lien });
  if (avant.archive !== apres.archive) await activite({ projet: projetId, type: 'projet', texte: apres.archive ? 'a archivé le projet' : 'a restauré le projet', lien, visibilite: 'interne' });
  /* Ranger un projet dans les projets à faire, ou l'en sortir : une affaire
     interne, que le client n'a pas à lire dans son fil. */
  if (Boolean(avant.aFaire) !== Boolean(apres.aFaire)) await activite({ projet: projetId, type: 'projet', texte: apres.aFaire ? 'a rangé le projet dans les projets à faire' : 'a sorti le projet des projets à faire', lien, visibilite: 'interne' });

  /* Une date de livraison qui bouge est l'événement que le client cherchait
     en nous écrivant. Elle laisse une trace datée, avec son motif, et une
     notification : on ne la découvre plus en relisant la fiche. */
  const dateDe = (v) => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : (v ? new Date(v).getTime() : 0));
  if (dateDe(avant.cible) !== dateDe(apres.cible)) {
    const reports = Array.isArray(apres.reports) ? apres.reports : [];
    const dernier = reports.length ? reports[reports.length - 1] : null;
    const motifs = { 'attente-client': 'en attente du client', perimetre: 'le périmètre a changé', technique: 'obstacle technique', tiers: 'dépendance à un tiers', magasin: "délai d'un magasin d'applications", capmedia: 'de notre fait', autre: 'autre motif' };
    const jour = (v) => { const d = v && typeof v.toDate === 'function' ? v.toDate() : (v ? new Date(v) : null); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'sans date'; };
    const texte = avant.cible && apres.cible
      ? `a reporté la livraison du ${jour(avant.cible)} au ${jour(apres.cible)}${dernier && dernier.motif ? ` · ${motifs[dernier.motif] || dernier.motif}` : ''}`
      : apres.cible ? `a fixé la livraison au ${jour(apres.cible)}` : 'a retiré la date de livraison';
    await activite({ projet: projetId, type: 'projet', texte, lien });
    await notifierClients({ id: projetId, ...apres }, 'projet', { type: 'projet', titre: 'La date de livraison a changé', texte: `${apres.nom} · ${texte.replace(/^a /, '')}`, lien: `#${lien}`, projet: projetId });
  }
});

exports.hubComposantEcrit = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/composants/{composantId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  const projetId = evenement.params.projetId;
  const lien = `/projets/${projetId}`;
  if (apres && !avant) await activite({ projet: projetId, type: 'projet', texte: `a ajouté la partie « ${apres.nom} »`, lien });
  else if (apres && avant && avant.statut !== apres.statut && apres.statut === 'livre') await activite({ projet: projetId, type: 'projet', texte: `a livré la partie « ${apres.nom} »`, lien });
  else if (apres && avant && avant.version !== apres.version && apres.version) await activite({ projet: projetId, type: 'projet', texte: `a passé « ${apres.nom} » en version ${apres.version}`, lien });
});

/* Un projet qui s'ouvre laisse une trace, comme tout le reste. */
exports.hubProjetCree = onDocumentCreated({ region: REGION, document: 'projets/{projetId}' }, async (evenement) => {
  /* Un projet créé puis effacé avant que l'événement soit servi n'a plus
     de contenu : rien à tracer. */
  const p = evenement.data && evenement.data.data();
  if (!p) return;
  const projetId = evenement.params.projetId;
  await activite({ projet: projetId, organisation: p.organisation || null, type: 'projet', texte: `a ouvert le projet « ${p.nom} »`, lien: `/projets/${projetId}` });
  if (p.organisation) await acces.recalculerOrganisation(String(p.organisation));
  /* L'annonce « votre espace est ouvert » part à l'ouverture, pas à la
     création : un projet naît fermé (voir ouvrirAuClient). */
});

/* ==========================================================================
   12 bis. Les tests avant la sortie, vus du client

   Décision de Nadir du 08/10/2026 : AUCUNE notification au client pour
   les tests. Ni lettre, ni push, ni cloche, ni activité visible quand une
   campagne s'ouvre ou se ferme, quand un testeur termine, ni pour un
   échec. Le client voit les résultats dans son Hub, c'est tout. Un échec
   de testeur naît en anomalie interne « À confirmer » (suiviPassageKo) :
   l'équipe est prévenue ; le client ne la lit qu'une fois l'équipe l'a
   confirmée (confirmée ou corrigée), et le serveur la lui ouvre alors sans
   bruit. Une anomalie déjà visible qui passe corrigée le dit encore au
   client, comme avant. À la clôture d'une campagne, le serveur crée la
   validation « Bon pour sortie », réservée au responsable : c'est le feu
   vert du client pour la mise en ligne, et lui seul le donne.
   ========================================================================== */


exports.hubAnomalieEcrite = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/anomalies/{anomalieId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const { projetId, anomalieId } = evenement.params;
  const lien = `/tests?projet=${projetId}&anomalie=${anomalieId}`;
  const variables = { projetNom: '', titre: apres.titre || '', scenario: apres.scenario || '', gravite: apres.gravite || '', description: apres.description || '', lien: LIEN(lien) };
  if (!avant) {
    /* Une anomalie posée à la main par l'équipe n'est pas une nouvelle ;
       celle d'un testeur est pour l'équipe seule, à confirmer. */
    if (apres.origine !== 'testeur') return;
    const projet = await lireProjet(projetId);
    await activite({ projet: projetId, type: 'test', texte: `Les testeurs ont signalé un échec à confirmer : « ${apres.titre || apres.scenario || ''} »`, par: { uid: null, nom: 'Capmedia Test', cote: 'equipe' }, lien, visibilite: 'interne' });
    await notifierEquipe(projetId, { type: 'test', titre: 'Un échec à confirmer', texte: [apres.scenario, apres.titre, nomProjet(projet), (apres.bugsConnus || []).length ? 'bug déjà connu' : ''].filter(Boolean).join(' · '), lien: `#${lien}`, projet: projetId });
    return;
  }
  /* L'équipe a tranché : confirmée ou corrigée, l'anomalie d'un testeur
     s'ouvre au client, sans notification. Fausse alerte : elle reste
     interne. */
  if (apres.interne === true && avant.statut !== apres.statut && ['confirmee', 'corrigee'].includes(apres.statut)) {
    try { await evenement.data.after.ref.update({ interne: false }); } catch (err) { console.error('Anomalie non ouverte au client', err); }
    return;
  }
  if (apres.interne === true) return;
  if (avant.statut === apres.statut || apres.statut !== 'corrigee') return;
  const projet = await lireProjet(projetId);
  await activite({ projet: projetId, type: 'test', texte: `a corrigé l'anomalie « ${apres.titre || apres.scenario || ''} »`, lien, visibilite: 'client' });
  await notifierClients(projet, 'anomalie', { type: 'test', titre: 'Anomalie corrigée', texte: [apres.scenario, apres.titre].filter(Boolean).join(' · '), lien: `#${lien}`, projet: projetId });
  await ecrireAuxClients(projet, 'anomalie', 'anomalie', { ...variables, projetNom: nomProjet(projet), evenement: 'corrigee' });
});

exports.hubCampagneEcrite = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/campagnes/{campagneId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  /* Un testeur choisi pour la campagne doit la voir : l'espace Test
     n'écoute que les projets de sa fiche, et lui ne peut pas les écrire.
     Quand les testeurs ou l'affectation changent (« Répartir »), chacun
     est inscrit au projet. Un testeur retiré du vivier ou disparu ne
     l'est pas. */
  const testeursApres = Array.isArray(apres.testeurs) ? apres.testeurs : [];
  const empreinte = (d) => JSON.stringify([(d && d.testeurs) || [], (d && d.affectation) || {}]);
  if (empreinte(apres) !== empreinte(avant)) {
    for (const uid of testeursApres) {
      if (typeof uid !== 'string' || !uid) continue;
      try {
        const ref = bdd.doc(`testeurs/${uid}`);
        const fiche = await ref.get();
        const t = fiche.exists ? fiche.data() || {} : null;
        if (!t || t.actif === false || (Array.isArray(t.projets) && t.projets.includes(evenement.params.projetId))) continue;
        await ref.update({ projets: FieldValue.arrayUnion(evenement.params.projetId), maj: FieldValue.serverTimestamp() });
      } catch (err) { console.error('Testeur non inscrit au projet', uid, err); }
    }
  }
  const statutAvant = avant ? avant.statut : null;
  if (statutAvant === apres.statut || !['en-cours', 'close'].includes(apres.statut)) return;
  const { projetId, campagneId } = evenement.params;
  const titre = apres.titre || 'Campagne de tests';
  const lien = `/tests?projet=${projetId}&campagne=${campagneId}`;
  const close = apres.statut === 'close';
  /* Rien pour le client (08/10/2026) : une trace interne, c'est tout. */
  await activite({ projet: projetId, type: 'test', texte: close ? `a clos la campagne de tests « ${titre} »` : `a ouvert la campagne de tests « ${titre} »`, lien, visibilite: 'interne' });
  if (!close) return;
  /* Le feu vert de sortie : une validation par campagne close, jamais deux
     (rouvrir puis reclore la campagne ne redemande pas ce qui est déjà
     demandé ou déjà donné). Sa création déclenche la notification et la
     lettre « Votre validation est attendue » comme toute validation. */
  try {
    const deja = await bdd.collection('validations').where('projet', '==', projetId).where('type', '==', 'sortie').where('cible.id', '==', campagneId).limit(1).get();
    if (!deja.empty) return;
    await bdd.collection('validations').add(sansIndefini({
      projet: projetId, titre: `Bon pour sortie : ${titre}`, type: 'sortie',
      description: 'Les tests de la campagne sont terminés. En approuvant, vous donnez votre accord pour la mise en ligne.',
      cible: { id: campagneId, libelle: titre, chemin: lien }, pieces: [], statut: 'en-attente', echeance: null,
      reserveeResponsable: true, demandeur: { uid: null, nom: 'Capmedia Test' }, reponse: null,
      cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
    }));
  } catch (err) { console.error('Validation de sortie non créée', err); }
});

/* ==========================================================================
   13. La fin de test

   Le testeur dit « j'ai terminé » en posant « termine » sur son
   appréciation (le document qu'il écrit déjà). Ici, le serveur fait le
   reste : il fige ses résultats (« termines » sur la campagne, que les
   règles relisent), lui ouvre sept jours d'accès (« fins »), compose son
   bilan pour l'équipe, et dit au client qu'un testeur a fini, sans le
   nommer. Une remarque ajoutée pendant ces sept jours part à l'équipe
   telle quelle.
   ========================================================================== */

const JOURS_APRES_TEST = 7;

const dureeLisible = (ms) => {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

const VERDICT_BILAN = { reussi: 'ok', echec: 'ko', 'sans-objet': 'na', ok: 'ok', ko: 'ko', na: 'na' };

/* Le titre d'un scénario : dans le plan de tests (« <section>-<f|t|u|s>-<nnn> »,
   rangé dans planTests/<section> sous son aspect, comme le lit suiviPassageKo),
   sinon dans l'ancienne bibliothèque. */
const ASPECT_BILAN = { f: 'fonctionnel', t: 'technique', u: 'ux', s: 'securite' };
async function titreDuScenario(pid, id) {
  const plan = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([ftus])-\d{3}$/.exec(String(id || ''));
  if (plan) {
    const section = await bdd.doc(`projets/${pid}/planTests/${plan[1]}`).get();
    const liste = section.exists ? (((section.data() || {}).aspects || {})[ASPECT_BILAN[plan[2]]] || []) : [];
    const x = Array.isArray(liste) ? liste.find((y) => y && y.id === id) : null;
    if (x) return String(x.titre || '');
  }
  if (!id || String(id).includes('/')) return '';
  const s = await bdd.doc(`projets/${pid}/scenarios/${id}`).get();
  return s.exists ? (s.data().titre || '') : '';
}

/* Le bilan d'un testeur sur une campagne : ses résultats, ses échecs avec
   le titre du scénario, le temps donné. Tout est compté, rien n'est deviné. */
async function bilanTesteur(pid, cid, uid) {
  const [passages, sessions] = await Promise.all([
    bdd.collection(`projets/${pid}/campagnes/${cid}/passages`).where('testeur', '==', uid).get(),
    bdd.collection(`presences/${uid}/sessions`).where('campagne', '==', cid).get().catch(() => ({ docs: [] })),
  ]);
  const compte = { ok: 0, ko: 0, na: 0 };
  const echecs = [];
  for (const d of passages.docs) {
    const p = d.data();
    /* Les verdicts du plan (reussi, echec, sans-objet) et ceux d'avant
       (ok, ko, na) se comptent ensemble. */
    const r = VERDICT_BILAN[p.resultat];
    if (r) compte[r] += 1;
    if (r === 'ko') echecs.push({ ref: p.scenario, commentaire: p.commentaire || '', plateforme: p.plateforme || '' });
  }
  const titres = new Map();
  for (const e of echecs.slice(0, 20)) {
    try { const t = await titreDuScenario(pid, e.ref); if (t) titres.set(e.ref, t); } catch (err) { /* sans titre */ }
  }
  let temps = 0;
  for (const d of sessions.docs) {
    const s = d.data();
    const debut = enMillis(s.debut); const vu = enMillis(s.vu);
    if (debut && vu && vu > debut) temps += vu - debut;
  }
  return { compte, echecs: echecs.map((e) => ({ ...e, titre: titres.get(e.ref) || '' })), temps, total: passages.size };
}

exports.hubAppreciationEcrite = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/campagnes/{campagneId}/appreciations/{uid}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const { projetId: pid, campagneId: cid, uid } = evenement.params;
  const vientDeTerminer = Boolean(apres.termine) && !(avant && avant.termine);
  const remarquesAvant = (avant && Array.isArray(avant.remarques)) ? avant.remarques.length : 0;
  const remarquesApres = Array.isArray(apres.remarques) ? apres.remarques.length : 0;
  if (!vientDeTerminer && remarquesApres <= remarquesAvant) return;

  const [projet, campagneDoc, testeurDoc] = await Promise.all([
    lireProjet(pid),
    bdd.doc(`projets/${pid}/campagnes/${cid}`).get(),
    bdd.doc(`testeurs/${uid}`).get(),
  ]);
  if (!campagneDoc.exists) return;
  const campagne = campagneDoc.data();
  const testeur = testeurDoc.exists ? testeurDoc.data() : {};
  const nomTesteur = testeur.prenom || testeur.email || 'Un testeur';
  const lienAdmin = `/tests?projet=${pid}`;

  if (vientDeTerminer) {
    const quand = enMillis(apres.termine) || Date.now();
    const fin = new Date(quand + JOURS_APRES_TEST * 24 * 3600 * 1000);
    /* Figer d'abord : entre l'écriture du testeur et ce déclencheur, il ne
       doit rien pouvoir changer de plus. L'équipe garde la main sur la date
       de fin : on ne la recule jamais si elle l'a déjà posée plus loin. */
    const dejaFin = enMillis((campagne.fins || {})[uid]);
    const maj = { [`termines.${uid}`]: new Date(quand), maj: FieldValue.serverTimestamp() };
    if (!dejaFin || dejaFin < fin.getTime()) maj[`fins.${uid}`] = fin;
    try { await bdd.doc(`projets/${pid}/campagnes/${cid}`).update(maj); } catch (err) { console.error('Fin de test : campagne non mise à jour', err); }

    const bilan = await bilanTesteur(pid, cid, uid);
    /* La note du test vit à part (equipe/retour), réservée à l'équipe ;
       une ancienne fin de test l'avait encore sur l'appréciation. */
    const retour = await bdd.doc(`projets/${pid}/campagnes/${cid}/appreciations/${uid}/equipe/retour`).get().catch(() => null);
    const noteTest = (retour && retour.exists && retour.data().noteTest) || apres.noteTest || null;
    const termines = Object.keys(campagne.termines || {}).length + 1;
    const total = (campagne.testeurs || []).length;
    const titreCampagne = campagne.titre || 'la campagne';

    /* Pour l'équipe seule (08/10/2026) : le client ne reçoit rien des
       tests, il lit les résultats dans son Hub. */
    await activite({ projet: pid, type: 'test', texte: `Un testeur a terminé la campagne « ${titreCampagne} » (${termines} sur ${total})`, par: { uid: null, nom: 'Capmedia Test', cote: 'equipe' }, lien: lienAdmin, visibilite: 'interne' });
    await notifierEquipe(pid, { type: 'test', titre: `${nomTesteur} a terminé le test`, texte: `${titreCampagne} · ${bilan.compte.ok} réussis, ${bilan.compte.ko} échecs, ${bilan.compte.na} sans objet`, lien: `#${lienAdmin}`, projet: pid });
    await mettreEnFile('testeur-termine', contactsEquipe(), {
      projetNom: nomProjet(projet), campagne: titreCampagne, testeur: nomTesteur, email: testeur.email || '',
      ok: bilan.compte.ok, ko: bilan.compte.ko, na: bilan.compte.na, total: bilan.total, temps: dureeLisible(bilan.temps),
      finAcces: fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
      echecs: bilan.echecs.map((e) => `${e.ref}${e.titre ? ` · ${e.titre}` : ''}${e.plateforme ? ` (${e.plateforme})` : ''}${e.commentaire ? ` : ${e.commentaire.slice(0, 200)}` : ''}`),
      avisDonne: ((apres.avisRendus || {}).apres === true || Object.keys(apres).some((k) => k.startsWith('esthetique.'))) ? 'oui' : 'pas encore',
      noteTest: noteTest && noteTest.note ? `${noteTest.note} sur 5` : '',
      noteTestCommentaire: noteTest ? String(noteTest.commentaire || '').slice(0, 2000) : '',
      lien: LIEN_ADMIN(lienAdmin),
    }, { projet: pid, evenement: 'testeur-termine' });
    await audit('test.termine', { projet: pid, campagne: cid, testeur: uid, ok: bilan.compte.ok, ko: bilan.compte.ko, na: bilan.compte.na, finAcces: fin });
  }

  if (remarquesApres > remarquesAvant) {
    const nouvelles = apres.remarques.slice(remarquesAvant).map((r) => String((r && r.texte) || '').slice(0, 4000)).filter(Boolean);
    if (!nouvelles.length) return;
    const titreCampagne = campagne.titre || 'la campagne';
    await activite({ projet: pid, type: 'test', texte: `${nomTesteur} a ajouté une remarque après son test sur « ${titreCampagne} »`, par: { uid: null, nom: 'Capmedia Test', cote: 'equipe' }, lien: lienAdmin, visibilite: 'interne' });
    await notifierEquipe(pid, { type: 'test', titre: `Remarque de ${nomTesteur}`, texte: nouvelles[0].slice(0, 140), lien: `#${lienAdmin}`, projet: pid });
    await mettreEnFile('testeur-remarque', contactsEquipe(), {
      projetNom: nomProjet(projet), campagne: titreCampagne, testeur: nomTesteur, email: testeur.email || '',
      remarques: nouvelles, lien: LIEN_ADMIN(lienAdmin),
    }, { projet: pid, evenement: 'testeur-remarque' });
  }
});

/* Une remarque libre d'un testeur (campagnes/{c}/remarques) : écrite à
   tout moment, sur un scénario ou en général. L'équipe est prévenue comme
   pour une remarque d'après test ; le client la lit dans le Hub, sans nom,
   et ne reçoit rien de plus. */
exports.hubRemarqueTesteur = onDocumentCreated({ region: REGION, document: 'projets/{projetId}/campagnes/{campagneId}/remarques/{remarqueId}' }, async (evenement) => {
  const r = evenement.data ? evenement.data.data() : null;
  if (!r || !r.texte) return;
  const { projetId: pid, campagneId: cid } = evenement.params;
  const [projet, campagneDoc, testeurDoc] = await Promise.all([
    lireProjet(pid),
    bdd.doc(`projets/${pid}/campagnes/${cid}`).get(),
    bdd.doc(`testeurs/${r.testeur}`).get(),
  ]);
  if (!campagneDoc.exists) return;
  const campagne = campagneDoc.data();
  const testeur = testeurDoc.exists ? testeurDoc.data() : {};
  const nomTesteur = testeur.prenom || testeur.email || 'Un testeur';
  const titreCampagne = campagne.titre || 'la campagne';
  const lienAdmin = `/tests?projet=${pid}`;
  const texte = String(r.texte).slice(0, 2000);
  const scenario = String(r.scenario || '').slice(0, 80);
  await activite({ projet: pid, type: 'test', texte: `${nomTesteur} a écrit une remarque${scenario ? ` sur ${scenario}` : ''} (« ${titreCampagne} »)`, par: { uid: null, nom: 'Capmedia Test', cote: 'equipe' }, lien: lienAdmin, visibilite: 'interne' });
  await notifierEquipe(pid, { type: 'test', titre: `Remarque de ${nomTesteur}`, texte: `${scenario ? `${scenario} · ` : ''}${texte.slice(0, 140)}`, lien: `#${lienAdmin}`, projet: pid });
  await mettreEnFile('testeur-remarque', contactsEquipe(), {
    projetNom: nomProjet(projet), campagne: titreCampagne, testeur: nomTesteur, email: testeur.email || '',
    remarques: [texte], scenario, libre: true, lien: LIEN_ADMIN(lienAdmin),
  }, { projet: pid, evenement: 'testeur-remarque' });
});

/* ==========================================================================
   13 bis. La conversation d'un testeur avec l'équipe

   Une bulle dans l'espace Test, une page dans le Cockpit. À part des
   messages de projet : un testeur n'est membre d'aucun projet, et ce qu'il
   dit ne regarde que l'équipe. Le serveur tient le document de la
   conversation (dernier message, compteurs de non lus) et prévient : la
   notification et la lettre à l'équipe quand le testeur écrit, la
   notification et la lettre au testeur quand l'équipe répond (le push part
   de push.js, hubPushMessageTesteur). Depuis octobre 2026, la messagerie
   commune : un message peut n'être que des pièces, et un message supprimé
   est effacé partout où il se lisait (hubMessageTesteurModifie).
   ========================================================================== */

/* Le débit des lettres à l'équipe : une par testeur et par dix minutes au
   plus. Une rafale de messages (ou un compte qui en abuse) ne remplit pas
   la boîte de l'agence ; la cloche et le push, eux, suivent chaque message.
   La place se prend dans une transaction, sur la conversation (champ
   « lettreEquipe », que seul le serveur écrit). */
const PAUSE_LETTRE_EQUIPE = 10 * 60 * 1000;
async function reserverLettreEquipe(uid) {
  const ref = bdd.doc(`conversationsTesteurs/${uid}`);
  try {
    return await bdd.runTransaction(async (tx) => {
      const c = await tx.get(ref);
      const avant = enMillis(c.exists ? (c.data() || {}).lettreEquipe : null);
      if (avant && Date.now() - avant < PAUSE_LETTRE_EQUIPE) return false;
      tx.set(ref, { lettreEquipe: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
  } catch (err) { console.error('Débit des lettres du testeur illisible : la lettre part', err); return true; }
}

exports.hubMessageTesteur = onDocumentCreated({ region: REGION, document: 'conversationsTesteurs/{testeurId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  const { testeurId: uid } = evenement.params;
  const de = m.de || {};
  const duTesteur = de.cote === 'testeur';
  const nbPieces = (m.pieces || []).length;
  const extrait = String(m.texte || '').trim().slice(0, 140) || (nbPieces > 1 ? `${nbPieces} pièces jointes` : (nbPieces ? 'Pièce jointe' : ''));
  const messageId = evenement.params.messageId;
  let testeur = {};
  try { const t = await bdd.doc(`testeurs/${uid}`).get(); testeur = t.exists ? t.data() : {}; } catch (err) { testeur = {}; }
  const prenom = testeur.prenom || de.nom || 'Un testeur';

  try {
    await bdd.doc(`conversationsTesteurs/${uid}`).set(sansIndefini({
      testeur: uid, prenom: testeur.prenom || '', email: testeur.email || '',
      dernier: { id: messageId, texte: extrait, cote: de.cote || '', nom: de.nom || '', date: m.date || FieldValue.serverTimestamp() },
      nonLusEquipe: duTesteur ? FieldValue.increment(1) : 0,
      nonLusTesteur: duTesteur ? 0 : FieldValue.increment(1),
      maj: FieldValue.serverTimestamp(),
    }), { merge: true });
  } catch (err) { console.error('Conversation du testeur non mise à jour', err); }

  const lienAdmin = `/testeurs-messages/${uid}`;
  if (duTesteur) {
    await notifierEquipe(null, { type: 'message', titre: `Message de ${prenom} (testeur)`, texte: extrait, lien: `#${lienAdmin}`, message: messageId });
    if (await reserverLettreEquipe(uid)) {
      await mettreEnFile('message-testeur', contactsEquipe(), { testeur: prenom, email: testeur.email || '', texte: m.texte, lien: LIEN_ADMIN(lienAdmin) }, { evenement: 'message-testeur' });
    }
  } else {
    await notifier([uid], { type: 'message', titre: `Réponse de ${de.nom || 'Capmedia'}`, texte: extrait, lien: '#/messages', message: messageId });
    if (testeur.email) {
      await mettreEnFile('message-testeur-reponse', [{ email: testeur.email, nom: testeur.prenom || '' }], { prenom: testeur.prenom || '', auteur: de.nom || 'Capmedia', texte: m.texte, lien: `${courriels.BASE}testeur#/messages` }, { evenement: 'message-testeur-reponse' });
    }
  }
});

/* Un message de la conversation d'un testeur, supprimé par son auteur (les
   règles ne laissent faire que lui) : comme pour un projet
   (hubMessageProjetModifie), son texte ne se lit plus nulle part. Les
   notifications qu'il a fait naître, les réponses qui le citaient et le
   dernier message de la conversation le perdent ; ses pièces sont effacées
   du stockage (seulement celles de CETTE conversation, déposées par lui).
   Les e-mails déjà partis ne se rattrapent pas. */
exports.hubMessageTesteurModifie = onDocumentUpdated({ region: REGION, document: 'conversationsTesteurs/{testeurId}/messages/{messageId}' }, async (evenement) => {
  const avant = evenement.data.before.data() || {};
  const apres = evenement.data.after.data() || {};
  const { testeurId, messageId } = evenement.params;
  const supprime = Boolean(apres.supprime) && !avant.supprime;
  const modifie = !supprime && !apres.supprime && String(avant.texte || '') !== String(apres.texte || '');
  if (!supprime && !modifie) return;
  const conv = bdd.doc(`conversationsTesteurs/${testeurId}`);
  try {
    const c = await conv.get();
    if (c.exists && ((c.data() || {}).dernier || {}).id === messageId) {
      await conv.update({ 'dernier.texte': supprime ? 'Message supprimé' : String(apres.texte || '').trim().slice(0, 140) });
    }
  } catch (err) { console.error('Dernier message de la conversation non mis à jour', err); }
  if (!supprime) return;
  const auteur = (avant.de || {}).uid || '';
  try {
    const equipe = await bdd.collection('equipe').get();
    for (const uid of new Set([testeurId, ...equipe.docs.map((d) => d.id)])) {
      const q = await bdd.collection(`boites/${uid}/notifications`).where('message', '==', messageId).get();
      for (const d of q.docs) await d.ref.update({ texte: 'Message supprimé' });
    }
  } catch (err) { console.error('Notifications du message non effacées', err); }
  try {
    const reponses = await bdd.collection(`conversationsTesteurs/${testeurId}/messages`).where('reponseA.id', '==', messageId).get();
    for (const r of reponses.docs) await r.ref.update({ 'reponseA.extrait': '', 'reponseA.supprime': true });
  } catch (err) { console.error('Citations du message non effacées', err); }
  const { getStorage } = require('firebase-admin/storage');
  const dossier = `conversationsTesteurs/${testeurId}/`;
  for (const p of avant.pieces || []) {
    const chemin = String((p && p.chemin) || '');
    if (!chemin.startsWith(dossier) || chemin.includes('..')) continue;
    try {
      const fichier = getStorage().bucket().file(chemin);
      const [existe] = await fichier.exists();
      if (!existe) continue;
      const [meta] = await fichier.getMetadata();
      const par = ((meta && meta.metadata) || {}).par || '';
      if (par !== auteur) { console.warn(`Pièce ${chemin} déposée par un autre : gardée`); continue; }
      await fichier.delete({ ignoreNotFound: true });
    } catch (err) { console.error(`Pièce ${chemin} non effacée`, err); }
  }
  await audit('message-testeur.supprime', { testeur: testeurId, message: messageId, par: auteur, pieces: (avant.pieces || []).length });
});

/* ==========================================================================
   14. La relance hebdomadaire

   Tout, dans l'espace, attendait que le client vienne. S'il ne l'ouvre pas
   pendant trois semaines, personne ne lui dit que six choses l'attendent.
   Ce rendez-vous du lundi matin va le chercher, mais seulement s'il y a
   vraiment quelque chose, et jamais deux fois dans la même semaine.
   ========================================================================== */

const { onSchedule } = require('firebase-functions/v2/scheduler');

const SEMAINE = 7 * 24 * 3600 * 1000;
const ATTEND_LE_CLIENT = ['en-attente-client', 'a-valider'];
const FACTURES_DUES = ['envoyee', 'a-payer', 'partielle', 'en-retard'];

const enDateFn = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const ageEnJours = (v) => { const d = enDateFn(v); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; };
const depuisJours = (v) => { const n = ageEnJours(v); return n === null ? '' : n <= 0 ? "aujourd'hui" : n === 1 ? 'depuis hier' : `depuis ${n} jours`; };

/** Ce qui, sur un projet, ne peut pas avancer sans le client. */
async function pointsEnAttente(projetId) {
  const points = [];
  const prendre = async (collection, filtre, fabrique) => {
    try {
      const q = await bdd.collection(collection).where('projet', '==', projetId).get();
      for (const d of q.docs) {
        const x = { id: d.id, ...d.data() };
        if (filtre(x)) points.push(fabrique(x));
      }
    } catch (err) { console.error(`Relance : ${collection} illisible pour ${projetId}`, err); }
  };

  /* Une validation réservée au responsable n'attend pas un collaborateur :
     la lettre de chacun ne compte que ce qui est à lui. */
  await prendre('validations', (v) => v.statut === 'en-attente',
    (v) => ({ quoi: 'À valider', detail: `${v.titre || ''} · en attente ${depuisJours(v.cree)}`, reserve: v.reserveeResponsable === true }));
  await prendre('tickets', (t) => !t.archive && ATTEND_LE_CLIENT.includes(t.statut),
    (t) => ({ quoi: t.statut === 'a-valider' ? 'Correction à vérifier' : 'Précision attendue', detail: `${t.numero ? `${t.numero} · ` : ''}${t.titre || ''} · ${depuisJours(t.maj)}` }));
  /* Un devis dont la validité est passée n'est plus à décider. */
  const expire = (x) => { const d = enDateFn(x.expiration); return Boolean(d) && d.getTime() < Date.now(); };
  await prendre('documents', (x) => x.type === 'devis' && ['envoye', 'consulte'].includes(x.statut) && !expire(x),
    (x) => ({ quoi: 'Devis à décider', detail: `${x.numero || ''} ${x.libelle || ''}`.trim(), reserve: true }));
  /* Chaque facture avec ce qu'elle vaut et quand : « F-2026-0031 ·
     1 200,00 € TTC · échéance 30/09 ». Sans montant ni date, la ligne ne
     disait pas de quoi il retournait. */
  const ttcDe = (x) => (typeof x.ttc === 'number' ? x.ttc : (Number(x.montant) || 0) * (1 + (Number(x.tva) || 0) / 100));
  const jourMois = (v) => { const d = enDateFn(v); return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''; };
  await prendre('documents', (x) => x.type === 'facture' && FACTURES_DUES.includes(x.statut),
    (x) => {
      const j = ageEnJours(x.echeance);
      const quand = x.echeance ? (j !== null && j > 0 ? `en retard de ${j} jour${j > 1 ? 's' : ''} (échéance ${jourMois(x.echeance)})` : `échéance ${jourMois(x.echeance)}`) : '';
      /* Franchise en base de TVA (TVA 0) : le montant seul, sans « TTC ». */
      const somme = `${ttcDe(x).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}${Number(x.tva) > 0 ? ' TTC' : ''}`;
      /* La finance est au responsable : un collaborateur n'en reçoit rien. */
      return { quoi: 'Facture à régler', detail: [x.numero || x.libelle || '', somme, quand].filter(Boolean).join(' · '), reserve: true };
    });
  await prendre('taches', (x) => !x.archive && x.statut === 'attente-client' && x.visibilite === 'client',
    (x) => ({ quoi: 'Tâche en attente de vous', detail: `${x.titre || ''} · ${depuisJours(x.maj)}` }));
  await prendre('blocages', (b) => !b.resolu && b.responsable === 'client' && b.visibilite === 'client',
    (b) => ({ quoi: 'Point bloquant', detail: `${b.titre || ''} · ${depuisJours(b.depuis)}` }));

  return points;
}

/*
 * Faut-il relancer ce projet ? La question est séparée de l'envoi pour
 * pouvoir être posée à l'épreuve sans déclencheur ni file d'attente.
 * Elle ne dit jamais oui sur une impression : archive, projet à moi,
 * sourdine, projet clos, lettre déjà partie cette semaine.
 */
function relanceRetenue(projet, maintenant = Date.now()) {
  if (!projet) return { retenu: false, motif: 'projet absent' };
  if (projet.archive) return { retenu: false, motif: 'archivé' };
  if (projet.interne === true) return { retenu: false, motif: 'projet à moi' };
  /* Un projet fermé au client ne lui écrit pas ; des e-mails coupés non
     plus : la relance est un e-mail, et rien d'autre. */
  if (projet.ouvert !== true) return { retenu: false, motif: 'fermé au client' };
  if (projet.emailsClient === 'coupes') return { retenu: false, motif: 'e-mails coupés' };
  if (['termine', 'suspendu', 'archive'].includes(String(projet.statut || ''))) return { retenu: false, motif: 'projet clos' };
  const derniere = enDateFn(projet.relance);
  if (derniere && maintenant - derniere.getTime() < SEMAINE) return { retenu: false, motif: 'déjà relancé cette semaine' };
  /* Sans membre, personne ne peut ouvrir le lien : écrire « des points vous
     attendent » à quelqu'un qui n'a pas encore d'accès serait une faute.
     C'est le cas des prospects, qui portent une adresse mais pas de compte. */
  if (!Array.isArray(projet.membres) || !projet.membres.length) return { retenu: false, motif: 'aucun accès ouvert' };
  return { retenu: true, motif: '' };
}

/* Exposées pour l'épreuve : la décision, et le relevé de ce qui attend. */
exports._relanceRetenue = relanceRetenue;
exports._pointsEnAttente = pointsEnAttente;

/* ==========================================================================
   L'annuaire : le seul NOM d'un membre de l'équipe, lisible par un client
   pour mettre un nom sur le responsable de son projet. La fiche d'équipe
   (adresse, rôle) n'est plus lisible hors de l'équipe. Un membre retiré ou
   inactif disparaît de l'annuaire.
   ========================================================================== */

exports.hubEquipeAnnuaire = onDocumentWritten({ region: REGION, document: 'equipe/{uid}' }, async (evenement) => {
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  const cible = bdd.doc(`annuaire/${evenement.params.uid}`);
  if (!apres || apres.actif === false) { try { await cible.delete(); } catch (err) { /* déjà parti */ } return; }
  await cible.set({ nom: String(apres.nom || '').slice(0, 120), maj: FieldValue.serverTimestamp() });
});

exports.hubRelanceHebdo = onSchedule(
  { region: REGION, schedule: 'every monday 09:00', timeZone: 'Europe/Paris' },
  async () => {
    let projets = [];
    try {
      const q = await bdd.collection('projets').get();
      projets = q.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error('Relance : projets illisibles', err); return; }

    let envoyees = 0; let ignorees = 0;
    for (const projet of projets) {
      /* La sourdine est le verrou qui a permis de remplir le portefeuille
         sans réveiller personne : il tient ici aussi. */
      if (!relanceRetenue(projet).retenu) { ignorees += 1; continue; }

      const points = await pointsEnAttente(projet.id);
      if (!points.length) { ignorees += 1; continue; }

      const { destinataires } = await communication.destinatairesClients(projet, 'relance');
      if (!destinataires.length) { ignorees += 1; continue; }

      const roles = projet.roles || {};
      let quelquUn = false;
      for (const d of destinataires) {
        const siens = points.filter((p) => !p.reserve || (d.uid && roles[d.uid] === 'responsable'));
        if (!siens.length) continue;
        quelquUn = true;
        await mettreEnFile('relance', [d], {
          par: d.nom || '', projet: projet.nom || '', points: siens.map(({ quoi, detail }) => ({ quoi, detail })), lien: LIEN('/demandes'),
        }, { projet: projet.id, evenement: 'relance' });
      }
      if (!quelquUn) { ignorees += 1; continue; }
      try { await bdd.doc(`projets/${projet.id}`).update({ relance: FieldValue.serverTimestamp() }); } catch (err) { console.error('Relance non datée', err); }
      envoyees += 1;
    }
    console.log(`Relance hebdomadaire : ${envoyees} projet(s) relancé(s), ${ignorees} laissé(s) tranquilles.`);
  },
);

/* ==========================================================================
   15. Les échéances, chaque matin

   Le retard d'une facture et l'expiration d'un devis se posaient à la
   main, quand l'équipe y pensait ; le client ne l'apprenait qu'au lundi
   suivant, s'il lui restait des points. Chaque matin à 8 h, cette fonction
   pose ce que le calendrier a déjà décidé :
     - trois jours avant l'échéance d'une facture due, un rappel au client
       (« Facture à régler avant le … »), une seule fois (echeanceSignalee) ;
     - l'échéance passée, la facture passe « en retard », le client en est
       averti (notification et lettre), une seule fois (retardSignale) ;
     - la validité passée, le devis passe « expiré » (activité, pas de
       lettre : on lui en propose un à jour de vive voix).
   Le déclencheur d'activité (hubDocumentActivite) reconnaît les marques et
   n'écrit pas une seconde ligne.
   ========================================================================== */

const JOUR = 24 * 3600 * 1000;
const RAPPEL_AVANT_JOURS = 3;

/* Le calendrier se lit en jours pleins, dans le fuseau de l'agence : une
   échéance « le 30 » est passée le 1er au matin, pas à minuit UTC. */
const debutDuJour = (d) => new Date(new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }));
const joursAvantEcheance = (v, maintenant) => { const d = enDateFn(v); return d ? Math.round((debutDuJour(d) - debutDuJour(maintenant)) / JOUR) : null; };
const ttcDuDocument = (x) => (typeof x.ttc === 'number' ? x.ttc : (Number(x.montant) || 0) * (1 + (Number(x.tva) || 0) / 100));
const dateFrCourte = (v) => { const d = enDateFn(v); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : ''; };
const resteSurFacture = async (id, x) => {
  try {
    const q = await bdd.collection('paiements').where('facture', '==', id).get();
    return Math.max(0, ttcDuDocument(x) - q.docs.reduce((t, d) => t + (d.data().statut !== 'annule' ? Number(d.data().montant) || 0 : 0), 0));
  } catch (err) { console.error('Paiements illisibles', err); return ttcDuDocument(x); }
};

/** Le passage d'un matin. Séparé de la planification pour l'épreuve. */
async function passerLesEcheances(maintenant = new Date()) {
  const bilan = { rappels: 0, retards: 0, expires: 0 };
  let factures = [];
  let devis = [];
  try {
    factures = (await bdd.collection('documents').where('type', '==', 'facture').where('statut', 'in', FACTURES_DUES).get()).docs;
    devis = (await bdd.collection('documents').where('type', '==', 'devis').where('statut', 'in', ['envoye', 'consulte']).get()).docs;
  } catch (err) { console.error('Échéances : documents illisibles', err); return bilan; }

  for (const d of factures) {
    const x = d.data();
    if (x.archive === true || !x.echeance) continue;
    const jours = joursAvantEcheance(x.echeance, maintenant);
    if (jours === null) continue;
    const nom = `${x.numero || ''}`.trim();
    const lien = `/finances/${d.id}`;
    const projet = await lireProjet(x.projet);
    if (jours < 0 && !x.retardSignale) {
      /* La facture passe en retard, et le client l'apprend une fois. */
      const reste = await resteSurFacture(d.id, x);
      try { await d.ref.update({ statut: 'en-retard', retardSignale: FieldValue.serverTimestamp() }); } catch (err) { console.error(`Retard non posé sur ${d.id}`, err); continue; }
      /* Sans auteur : c'est le calendrier qui parle, pas quelqu'un. */
      await activite({ projet: x.projet, type: 'facture', texte: `La facture ${nom} est passée en retard (échéance du ${dateFrCourte(x.echeance)})`, par: { uid: null, nom: '', cote: 'equipe' }, lien });
      await notifierClients(projet, 'facture-retard', { type: 'facture', titre: 'Facture en retard', texte: `${nom} · ${reste.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}${Number(x.tva) > 0 ? ' TTC' : ''}`, lien: `#${lien}`, projet: x.projet });
      await ecrireAuxClients(projet, 'facture-retard', 'facture-retard', { numero: x.numero, libelle: x.libelle, reste, tva: x.tva, echeance: x.echeance, projetNom: nomProjet(projet), clientNom: (projet && projet.client && projet.client.nom) || '', lien: LIEN(lien) });
      bilan.retards += 1;
    } else if (jours >= 0 && jours <= RAPPEL_AVANT_JOURS && !x.echeanceSignalee && x.statut !== 'en-retard') {
      /* Trois jours avant, un rappel, une fois. */
      const reste = await resteSurFacture(d.id, x);
      try { await d.ref.update({ echeanceSignalee: FieldValue.serverTimestamp() }); } catch (err) { console.error(`Rappel non marqué sur ${d.id}`, err); continue; }
      await notifierClients(projet, 'facture-echeance', { type: 'facture', titre: `Facture à régler avant le ${dateFrCourte(x.echeance)}`, texte: `${nom} · ${reste.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}${Number(x.tva) > 0 ? ' TTC' : ''}`, lien: `#${lien}`, projet: x.projet });
      await ecrireAuxClients(projet, 'facture-echeance', 'facture-echeance', { numero: x.numero, libelle: x.libelle, reste, tva: x.tva, echeance: x.echeance, projetNom: nomProjet(projet), clientNom: (projet && projet.client && projet.client.nom) || '', lien: LIEN(lien) });
      bilan.rappels += 1;
    }
  }

  for (const d of devis) {
    const x = d.data();
    if (x.archive === true || !x.expiration) continue;
    const jours = joursAvantEcheance(x.expiration, maintenant);
    if (jours === null || jours >= 0) continue;
    const nom = `${x.numero || ''}`.trim();
    try { await d.ref.update({ statut: 'expire', expireSignale: FieldValue.serverTimestamp() }); } catch (err) { console.error(`Expiration non posée sur ${d.id}`, err); continue; }
    await activite({ projet: x.projet, type: 'devis', texte: `Le devis ${nom} est arrivé au bout de sa validité (${dateFrCourte(x.expiration)})`, par: { uid: null, nom: '', cote: 'equipe' }, lien: `/finances/${d.id}` });
    bilan.expires += 1;
  }
  console.log(`Échéances du matin : ${bilan.rappels} rappel(s), ${bilan.retards} facture(s) passée(s) en retard, ${bilan.expires} devis expiré(s).`);
  return bilan;
}

/* Exposée pour l'épreuve, sans la planification. */
exports._passerLesEcheances = passerLesEcheances;

exports.hubEcheancesQuotidien = onSchedule(
  { region: REGION, schedule: 'every day 08:00', timeZone: 'Europe/Paris' },
  async () => { await passerLesEcheances(new Date()); },
);

/* ==========================================================================
   Le rappel de la veille pour les réunions

   Rien ne rappelait une réunion avant l'heure. À 17 h (Europe/Paris),
   chaque réunion visible du client qui a lieu demain reçoit une
   notification et une lettre « reunion-rappel », une seule fois : la
   réunion garde la marque « rappelEnvoye ». La lettre suit la préférence
   « reunions » du client, comme la programmation. Séparé de la
   planification pour l'épreuve.
   ========================================================================== */

/* Minuit à Paris pour un jour du calendrier (année, mois de 0 à 11, jour) :
   minuit UTC moins le décalage de Paris à cet instant, en deux passes pour
   tenir le jour du changement d'heure. */
const decalageParis = (d) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(d).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - d.getTime();
};
const minuitParis = (annee, mois, jour) => {
  let t = Date.UTC(annee, mois, jour);
  t = Date.UTC(annee, mois, jour) - decalageParis(new Date(t));
  t = Date.UTC(annee, mois, jour) - decalageParis(new Date(t));
  return new Date(t);
};

/** La fenêtre « demain » à Paris : [début, fin[. */
function fenetreDemain(maintenant = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(maintenant).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  return {
    debut: minuitParis(Number(p.year), Number(p.month) - 1, Number(p.day) + 1),
    fin: minuitParis(Number(p.year), Number(p.month) - 1, Number(p.day) + 2),
  };
}

async function rappelerLesReunions(maintenant = new Date()) {
  const { debut, fin } = fenetreDemain(maintenant);
  const bilan = { envoyes: 0, ignores: 0 };
  let reunions = [];
  try { reunions = (await bdd.collection('reunions').where('date', '>=', debut).where('date', '<', fin).get()).docs; }
  catch (err) { console.error('Rappels : réunions illisibles', err); return bilan; }

  for (const d of reunions) {
    const r = d.data();
    if (r.visibilite === 'interne' || r.rappelEnvoye) { bilan.ignores += 1; continue; }
    const projet = await lireProjet(r.projet);
    if (!projet) { bilan.ignores += 1; continue; }
    /* On marque avant d'envoyer : si le passage rejoue, rien ne repart. */
    try { await d.ref.update({ rappelEnvoye: FieldValue.serverTimestamp() }); } catch (err) { console.error(`Rappel non marqué sur ${d.id}`, err); continue; }
    const quand = enDateFn(r.date);
    const heure = quand ? quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '';
    const dateTexte = quand ? quand.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '';
    const lien = `/projets/${r.projet}/reunions/${d.id}`;
    await notifierClients(projet, 'reunion-rappel', {
      type: 'reunion', titre: `Demain : ${r.titre || 'réunion'}${heure ? ` à ${heure}` : ''}`,
      texte: [r.lieu, r.lien ? 'en visioconférence' : ''].filter(Boolean).join(' · ') || nomProjet(projet),
      lien: `#${lien}`, projet: r.projet,
    });
    await ecrireAuxClients(projet, 'reunion-rappel', 'reunion-rappel', {
      projetNom: nomProjet(projet), titre: r.titre, date: dateTexte, heure, duree: r.duree, lieu: r.lieu, lienVisio: lienVisioSur(r.lien), ordreDuJour: r.ordreDuJour, lien: LIEN(lien),
    });
    bilan.envoyes += 1;
  }
  console.log(`Rappels de réunions : ${bilan.envoyes} envoyé(s), ${bilan.ignores} laissé(s).`);
  return bilan;
}

/* Exposés pour l'épreuve, sans la planification. */
exports._fenetreDemain = fenetreDemain;
exports._rappelerLesReunions = rappelerLesReunions;

exports.hubRappelsReunions = onSchedule(
  { region: REGION, schedule: 'every day 17:00', timeZone: 'Europe/Paris' },
  async () => { await rappelerLesReunions(new Date()); },
);

/* ==========================================================================
   Les axes d'évolution
   Le client coche une piste et dit ce qu'il en veut : l'équipe est
   prévenue dans sa boîte, et le geste reste dans l'activité du projet
   (qui, quand, quoi). Un axe créé (import, conversion) ne prévient
   personne : seul un geste sur un axe existant compte.
   ========================================================================== */

const GESTES_AXE = {
  interesse: { texte: 's\'intéresse à l\'axe', titre: 'Un axe intéresse le client' },
  'a-prevoir': { texte: 'veut prévoir l\'axe', titre: 'Le client veut prévoir un axe' },
  'en-parler': { texte: 'aimerait parler de l\'axe', titre: 'Le client veut parler d\'un axe' },
};
const cleReponseAxe = (r) => (r && r.choix ? `${r.par || ''}|${r.choix}|${r.demande || ''}` : '');

exports.hubAxeEcrit = onDocumentWritten({ region: REGION, document: 'projets/{projetId}/axes/{axeId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!avant || !apres) return;
  const ra = avant.reponse || null;
  const rb = apres.reponse || null;
  if (cleReponseAxe(ra) === cleReponseAxe(rb)) return;
  const projetId = evenement.params.projetId;
  const lien = `/projets/${projetId}/evolutions`;
  const titre = String(apres.titre || '').slice(0, 120);
  if (!rb || !GESTES_AXE[rb.choix]) {
    await activite({ projet: projetId, type: 'axe', texte: `a retiré son choix sur l'axe « ${titre} »`, par: ra && ra.par ? { uid: ra.par, nom: ra.nom || '', cote: 'client' } : null, lien, visibilite: 'interne' });
    return;
  }
  /* Un axe passé « À prévoir » par une demande de devis du calculateur :
     la demande prévient déjà l'équipe (hubDocumentActivite), une ligne
     par axe en plus ferait doublon. */
  if (rb.devis) return;
  const projet = await lireProjet(projetId);
  const geste = GESTES_AXE[rb.choix];
  await activite({ projet: projetId, type: 'axe', texte: `${geste.texte} « ${titre} »`, par: { uid: rb.par || null, nom: rb.nom || '', cote: 'client' }, cible: evenement.params.axeId, lien });
  await notifierEquipe(projetId, { type: 'axe', titre: geste.titre, texte: `${titre} · ${rb.nom || 'le client'} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: projetId });
});

/* ==========================================================================
   Les annonces de Capmedia
   À la publication d'une annonce, une notification dans la boîte de chaque
   client visé : tous les clients des projets ouverts, ou ceux que l'annonce
   nomme (cible.uids, dépliée par le Cockpit). Une annonce ne prévient
   qu'une fois : la marque annoncesNotifiees/{id}, créée avant d'écrire,
   arrête une seconde publication comme un déclencheur rejoué. Pas d'e-mail.
   ========================================================================== */

const TITRES_ANNONCE = {
  tarif: 'Capmedia annonce un changement de tarifs',
  indisponibilite: 'Capmedia vous prévient d\'une absence',
  nouveaute: 'Une nouveauté chez Capmedia',
  competence: 'Une nouvelle compétence chez Capmedia',
  changement: 'Un changement chez Capmedia',
};

/** Les comptes clients visés par une annonce, sur les projets ouverts. */
async function destinatairesAnnonce(a) {
  const cible = a.cible || {};
  const nommes = cible.tous === false ? new Set((cible.uids || []).map(String)) : null;
  const uids = new Set();
  const projets = await bdd.collection('projets').where('ouvert', '==', true).get();
  for (const d of projets.docs) {
    for (const uid of await communication.uidsClients({ id: d.id, ...d.data() }, 'annonce')) {
      if (!nommes || nommes.has(uid)) uids.add(uid);
    }
  }
  return [...uids];
}

exports.hubAnnonceEcrite = onDocumentWritten({ region: REGION, document: 'annonces/{annonceId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres || apres.publication !== 'publiee') return;
  if (avant && avant.publication === 'publiee') return;
  const id = evenement.params.annonceId;
  try {
    await bdd.doc(`annoncesNotifiees/${id}`).create({ le: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) return;
    console.error(`Annonce ${id} : marque de notification impossible`, err);
    return;
  }
  const uids = await destinatairesAnnonce(apres);
  await notifier(uids, {
    type: 'annonce', titre: TITRES_ANNONCE[apres.type] || 'Une annonce de Capmedia',
    texte: String(apres.titre || '').slice(0, 140), lien: '#/annonces', projet: null,
  });
});
