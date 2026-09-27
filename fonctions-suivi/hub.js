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
const nomProjet = (p) => ((p && p.nom) || '');
const auteurDe = (doc, defaut = 'equipe') => ((doc && doc.par) ? { uid: doc.par.uid, nom: doc.par.nom, cote: doc.par.cote || defaut } : null);

/* ==========================================================================
   1. Les tâches
   ========================================================================== */

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
    const libelles = { 'a-faire': 'à faire', 'en-cours': 'en cours', 'en-revue': 'en revue', 'bloquee': 'bloquée', 'attente-client': 'en attente du client', 'terminee': 'terminée' };
    await activite({ projet: apres.projet, type: 'tache', texte: `a passé la tâche « ${apres.titre} » en ${libelles[apres.statut] || apres.statut}`, par, lien, visibilite });
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
    await notifierClients(projet, 'jalon', { type: 'jalon', titre: 'Étape terminée', texte: apres.titre, lien: `#${lien}`, projet: projetId });
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
  const nom = `${({ ios: 'iOS', android: 'Android', web: 'Web', backend: 'Backend', admin: 'Tableau de bord' })[apres.plateforme] || apres.plateforme || ''} ${apres.version || ''}`.trim();
  const lien = `/projets/${apres.projet}/releases`;
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

/* ==========================================================================
   5. Les réunions
   ========================================================================== */

exports.hubReunionEcrite = onDocumentWritten({ region: REGION, document: 'reunions/{reunionId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const projet = await lireProjet(apres.projet);
  const lien = `/projets/${apres.projet}/reunions`;
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';
  const quand = apres.date && apres.date.toDate ? apres.date.toDate() : null;
  const dateTexte = quand ? quand.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '';
  const dateChangee = avant && avant.date && apres.date && avant.date.toMillis && avant.date.toMillis() !== apres.date.toMillis();
  if (!avant) {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a programmé la réunion « ${apres.titre} » le ${dateTexte}`, par: auteurDe(apres), lien, visibilite });
    if (visibilite === 'client') {
      await notifierClients(projet, 'reunion', { type: 'reunion', titre: 'Réunion programmée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'reunion', 'reunion', { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: apres.lien, ordreDuJour: apres.ordreDuJour, lien: LIEN(lien) });
    }
  } else if (dateChangee && visibilite === 'client') {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a déplacé la réunion « ${apres.titre} » au ${dateTexte}`, par: auteurDe(apres), lien, visibilite });
    await notifierClients(projet, 'reunion', { type: 'reunion', titre: 'Réunion déplacée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
    await ecrireAuxClients(projet, 'reunion', 'reunion', { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: apres.lien, ordreDuJour: apres.ordreDuJour, lien: LIEN(lien), deplacee: true });
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
  if (apres.statut === 'approuvee' || apres.statut === 'modifications') {
    const qui = apres.reponse || {};
    const texte = apres.statut === 'approuvee' ? `a approuvé « ${apres.titre} »` : `a demandé des modifications sur « ${apres.titre} »`;
    await activite({ projet: apres.projet, type: 'validation', texte, par: { uid: qui.par, nom: qui.nom, cote: 'client' }, lien: lienAdmin });
    await notifierEquipe(apres.projet, { type: 'validation', titre: apres.statut === 'approuvee' ? 'Validation approuvée' : 'Modifications demandées', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lienAdmin}`, projet: apres.projet });
    await mettreEnFile('validation-reponse', contactsEquipe(), { projetNom: nomProjet(projet), titre: apres.titre, statut: apres.statut, par: qui.nom, commentaire: qui.commentaire, lien: LIEN_ADMIN(lienAdmin) });
    await audit('validation', { projet: apres.projet, validation: evenement.params.validationId, statut: apres.statut, par: qui.par || null, nom: qui.nom || '' });
  } else if (apres.statut === 'annulee') {
    await activite({ projet: apres.projet, type: 'validation', texte: `a annulé la demande de validation « ${apres.titre} »`, lien: lienAdmin, visibilite: 'interne' });
  }
});

/* ==========================================================================
   7. Les notes, les blocages
   ========================================================================== */

exports.hubNoteCreee = onDocumentCreated({ region: REGION, document: 'notes/{noteId}' }, async (evenement) => {
  const n = evenement.data && evenement.data.data();
  if (!n) return;
  const libelles = { decision: 'a consigné une décision', information: 'a noté une information', idee: 'a noté une idée', risque: 'a signalé un risque', reunion: 'a ajouté une note de réunion' };
  await activite({ projet: n.projet, type: 'note', texte: `${libelles[n.type] || 'a ajouté une note'} : « ${n.titre} »`, par: auteurDe(n), lien: `/projets/${n.projet}/notes`, visibilite: n.visibilite === 'interne' ? 'interne' : 'client' });
  if (n.type === 'decision' && n.visibilite !== 'interne') {
    const projet = await lireProjet(n.projet);
    await notifierClients(projet, 'note', { type: 'note', titre: 'Décision consignée', texte: n.titre, lien: `#/projets/${n.projet}/notes`, projet: n.projet });
  }
});

exports.hubBlocageEcrit = onDocumentWritten({ region: REGION, document: 'blocages/{blocageId}' }, async (evenement) => {
  const avant = evenement.data.before.exists ? evenement.data.before.data() : null;
  const apres = evenement.data.after.exists ? evenement.data.after.data() : null;
  if (!apres) return;
  const lien = `/projets/${apres.projet}`;
  const visibilite = apres.visibilite === 'interne' ? 'interne' : 'client';
  if (!avant) {
    await activite({ projet: apres.projet, type: 'blocage', texte: `a signalé un point bloquant : « ${apres.titre} »`, lien, visibilite });
    if (visibilite === 'client' && apres.responsable === 'client') {
      const projet = await lireProjet(apres.projet);
      await notifierClients(projet, 'blocage', { type: 'blocage', titre: 'Un point bloque de votre côté', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
    }
  } else if (!avant.resolu && apres.resolu) {
    await activite({ projet: apres.projet, type: 'blocage', texte: `a levé le point bloquant « ${apres.titre} »`, lien, visibilite });
  }
});

/* ==========================================================================
   8. La conversation d'un projet
   ========================================================================== */

exports.hubMessageProjet = onDocumentCreated({ region: REGION, document: 'projets/{projetId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  const projetId = evenement.params.projetId;
  const projet = await lireProjet(projetId);
  const de = m.de || {};
  const extrait = String(m.texte || '').slice(0, 140);
  const lienClient = `/messages/${projetId}`;
  await activite({ projet: projetId, type: 'message', texte: `a écrit dans la conversation : « ${extrait}${(m.texte || '').length > 140 ? '…' : ''} »`, par: { uid: de.uid, nom: de.nom, cote: de.cote }, lien: lienClient });
  if (de.cote === 'equipe') {
    await notifierClients(projet, 'message', { type: 'message', titre: `Nouveau message de ${de.nom || 'Capmedia'}`, texte: extrait, lien: `#${lienClient}`, projet: projetId }, { exclure: [de.uid] });
    await ecrireAuxClients(projet, 'message-projet', 'message-projet', { projetNom: nomProjet(projet), auteur: de.nom || 'Capmedia', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN(lienClient) });
  } else {
    await notifierEquipe(projetId, { type: 'message', titre: `Message de ${de.nom || 'un client'}`, texte: `${nomProjet(projet)} · ${extrait}`, lien: `#${lienClient}`, projet: projetId }, { exclure: [de.uid] });
    await mettreEnFile('message-projet', contactsEquipe(), { projetNom: nomProjet(projet), auteur: de.nom || 'Client', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN_ADMIN(lienClient), cote: 'equipe' });
  }
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
  if (!avant) { await activite({ projet: apres.projet, type: genre, texte: `a déposé ${genre === 'devis' ? 'le devis' : 'la facture'} ${nom}`, lien }); return; }
  if (avant.statut !== apres.statut) {
    /* Une réponse à un devis qui ne vient ni d'un responsable, ni de
       l'équipe qui gère la finance, est défaite par suiviDocumentModifie :
       elle ne laisse aucune trace d'activité. */
    if (apres.type === 'devis' && ['accepte', 'refuse'].includes(apres.statut)) {
      const projetDoc = await lireProjet(apres.projet);
      if (!(await acces.reponseDevisAcceptee(projetDoc, apres.reponse))) return;
    }
    const qui = apres.reponse && apres.statut !== avant.statut && ['accepte', 'refuse'].includes(apres.statut) ? { uid: apres.reponse.par, nom: apres.reponse.nom, cote: apres.reponse.cote === 'equipe' ? 'equipe' : 'client' } : null;
    const libelles = { accepte: 'a accepté', refuse: 'a refusé', consulte: 'a consulté', payee: 'a réglé', 'a-payer': 'a mis à payer', 'en-retard': 'a marqué en retard', envoye: 'a envoyé', envoyee: 'a envoyé', partielle: 'a réglé en partie', annule: 'a annulé', annulee: 'a annulé', expire: 'a laissé expirer' };
    await activite({ projet: apres.projet, type: genre, texte: `${libelles[apres.statut] || `a passé en ${apres.statut}`} ${genre === 'devis' ? 'le devis' : 'la facture'} ${nom}`, par: qui, lien, visibilite: apres.statut === 'consulte' ? 'interne' : 'client' });
    if (['accepte', 'refuse'].includes(apres.statut)) await audit('devis', { projet: apres.projet, document: evenement.params.documentId, statut: apres.statut, par: (apres.reponse || {}).par || null });
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
    return;
  }
  if (avant.statut !== apres.statut) {
    const libelles = { nouveau: 'reçue', 'a-analyser': 'à analyser', 'en-attente-client': "en attente d'information", acceptee: 'acceptée', planifiee: 'planifiée', 'en-cours': 'en cours', 'en-revue': 'en revue', 'a-valider': 'à valider', resolu: 'terminée', refuse: 'refusée', annulee: 'annulée', ferme: 'fermée' };
    const conteste = avant.statut === 'a-valider' && apres.statut === 'en-cours';
    /* La marque « repart » distingue la réponse du client (posée par le
       serveur) du même passage fait à la main par l'équipe. */
    const repondu = avant.statut === 'en-attente-client' && apres.statut === 'en-cours' && Boolean(apres.repart) && String(avant.repart || '') !== String(apres.repart);
    const parClient = (avant.statut === 'a-valider' && apres.statut === 'resolu') || (avant.statut === 'resolu' && apres.statut === 'en-cours') || conteste || repondu;
    await activite({ projet: apres.projet, type: 'demande', texte: repondu ? `a répondu : la demande ${nom} repart` : `a passé la demande ${nom} en ${libelles[apres.statut] || apres.statut}`, par: parClient && apres.auteur ? { uid: apres.auteur.uid, nom: apres.auteur.nom, cote: 'client' } : null, lien });
    /* La réponse elle-même a déjà prévenu l'équipe (le message) : pas de
       seconde notification pour la demande qui repart. */
    if (!repondu && parClient) await notifierEquipe(apres.projet, { type: 'demande', titre: apres.statut === 'resolu' ? 'Correction validée par le client' : conteste ? 'Correction contestée par le client' : 'Demande rouverte par le client', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    else if (!repondu) await notifierClients(projet, 'demande', { type: 'demande', titre: `Demande ${libelles[apres.statut] || apres.statut}`, texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
  }
  if (avant.qualification !== apres.qualification && apres.qualification) {
    const libelles = { incluse: 'incluse au contrat', 'hors-perimetre': 'hors périmètre', 'a-chiffrer': 'à chiffrer', offerte: 'offerte' };
    await activite({ projet: apres.projet, type: 'demande', texte: `a qualifié la demande ${nom} : ${libelles[apres.qualification]}`, lien });
    if (apres.qualification === 'hors-perimetre' || apres.qualification === 'a-chiffrer') {
      await notifierClients(projet, 'demande', { type: 'demande', titre: apres.qualification === 'a-chiffrer' ? 'Un devis va vous être proposé' : 'Demande hors périmètre', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
      await ecrireAuxClients(projet, 'qualification', 'qualification', { projetNom: nomProjet(projet), numero: apres.numero, titre: apres.titre, qualification: apres.qualification, lien: LIEN(lien) });
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
  else await notifierEquipe(t.projet, { type: 'message', titre: `${de.nom || 'Le client'} a répondu`, texte: `${t.numero || ''} ${t.titre}`.trim(), lien: `#${lien}`, projet: t.projet }, { exclure: [de.uid] });
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
    if (compte[p.resultat] !== undefined) compte[p.resultat] += 1;
    if (p.resultat === 'ko') echecs.push({ ref: p.scenario, commentaire: p.commentaire || '', plateforme: p.plateforme || '' });
  }
  const titres = new Map();
  for (const e of echecs.slice(0, 20)) {
    try { const s = await bdd.doc(`projets/${pid}/scenarios/${e.ref}`).get(); if (s.exists) titres.set(e.ref, s.data().titre || ''); } catch (err) { /* sans titre */ }
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
  const lienClient = '/tests';

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
    const termines = Object.keys(campagne.termines || {}).length + 1;
    const total = (campagne.testeurs || []).length;
    const titreCampagne = campagne.titre || 'la campagne';

    await activite({ projet: pid, type: 'test', texte: `Un testeur a terminé la campagne « ${titreCampagne} » (${termines} sur ${total})`, par: { uid: null, nom: 'Capmedia Test', cote: 'equipe' }, lien: lienClient, visibilite: 'client' });
    await notifierEquipe(pid, { type: 'test', titre: `${nomTesteur} a terminé le test`, texte: `${titreCampagne} · ${bilan.compte.ok} réussis, ${bilan.compte.ko} échecs, ${bilan.compte.na} sans objet`, lien: `#${lienAdmin}`, projet: pid });
    await notifierClients(projet, 'test', { type: 'test', titre: 'Un testeur a terminé', texte: `${titreCampagne} · ${termines} sur ${total} testeurs ont fini`, lien: `#${lienClient}`, projet: pid });
    await mettreEnFile('testeur-termine', contactsEquipe(), {
      projetNom: nomProjet(projet), campagne: titreCampagne, testeur: nomTesteur, email: testeur.email || '',
      ok: bilan.compte.ok, ko: bilan.compte.ko, na: bilan.compte.na, total: bilan.total, temps: dureeLisible(bilan.temps),
      finAcces: fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
      echecs: bilan.echecs.map((e) => `${e.ref}${e.titre ? ` · ${e.titre}` : ''}${e.plateforme ? ` (${e.plateforme})` : ''}${e.commentaire ? ` : ${e.commentaire.slice(0, 200)}` : ''}`),
      avisDonne: Object.keys(apres).some((k) => k.startsWith('esthetique.')) ? 'oui' : 'pas encore',
      noteTest: apres.noteTest && apres.noteTest.note ? `${apres.noteTest.note} sur 5` : '',
      noteTestCommentaire: apres.noteTest ? String(apres.noteTest.commentaire || '').slice(0, 2000) : '',
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

/* ==========================================================================
   13 bis. La conversation d'un testeur avec l'équipe

   Une bulle dans l'espace Test, une page dans le Cockpit. À part des
   messages de projet : un testeur n'est membre d'aucun projet, et ce qu'il
   dit ne regarde que l'équipe. Le serveur tient le document de la
   conversation (dernier message, compteurs de non lus) et prévient : la
   notification et la lettre à l'équipe quand le testeur écrit, la
   notification et la lettre au testeur quand l'équipe répond.
   ========================================================================== */

exports.hubMessageTesteur = onDocumentCreated({ region: REGION, document: 'conversationsTesteurs/{testeurId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data && evenement.data.data();
  if (!m) return;
  const { testeurId: uid } = evenement.params;
  const de = m.de || {};
  const duTesteur = de.cote === 'testeur';
  const extrait = String(m.texte || '').slice(0, 140);
  let testeur = {};
  try { const t = await bdd.doc(`testeurs/${uid}`).get(); testeur = t.exists ? t.data() : {}; } catch (err) { testeur = {}; }
  const prenom = testeur.prenom || de.nom || 'Un testeur';

  try {
    await bdd.doc(`conversationsTesteurs/${uid}`).set(sansIndefini({
      testeur: uid, prenom: testeur.prenom || '', email: testeur.email || '',
      dernier: { texte: extrait, cote: de.cote || '', nom: de.nom || '', date: m.date || FieldValue.serverTimestamp() },
      nonLusEquipe: duTesteur ? FieldValue.increment(1) : 0,
      nonLusTesteur: duTesteur ? 0 : FieldValue.increment(1),
      maj: FieldValue.serverTimestamp(),
    }), { merge: true });
  } catch (err) { console.error('Conversation du testeur non mise à jour', err); }

  const lienAdmin = `/testeurs-messages/${uid}`;
  if (duTesteur) {
    await notifierEquipe(null, { type: 'message', titre: `Message de ${prenom} (testeur)`, texte: extrait, lien: `#${lienAdmin}` });
    await mettreEnFile('message-testeur', contactsEquipe(), { testeur: prenom, email: testeur.email || '', texte: m.texte, lien: LIEN_ADMIN(lienAdmin) }, { evenement: 'message-testeur' });
  } else {
    await notifier([uid], { type: 'message', titre: `Réponse de ${de.nom || 'Capmedia'}`, texte: extrait, lien: '#/messages' });
    if (testeur.email) {
      await mettreEnFile('message-testeur-reponse', [{ email: testeur.email, nom: testeur.prenom || '' }], { prenom: testeur.prenom || '', auteur: de.nom || 'Capmedia', texte: m.texte, lien: `${courriels.BASE}testeur#/messages` }, { evenement: 'message-testeur-reponse' });
    }
  }
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
    (x) => ({ quoi: 'Devis à décider', detail: `${x.numero || ''} ${x.libelle || ''}`.trim() }));
  await prendre('documents', (x) => x.type === 'facture' && FACTURES_DUES.includes(x.statut),
    (x) => ({ quoi: 'Facture à régler', detail: `${x.numero || ''} ${x.libelle || ''}`.trim() }));
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
          par: d.nom || '', projet: projet.nom || '', points: siens.map(({ quoi, detail }) => ({ quoi, detail })), lien: LIEN('/valider'),
        }, { projet: projet.id, evenement: 'relance' });
      }
      if (!quelquUn) { ignorees += 1; continue; }
      try { await bdd.doc(`projets/${projet.id}`).update({ relance: FieldValue.serverTimestamp() }); } catch (err) { console.error('Relance non datée', err); }
      envoyees += 1;
    }
    console.log(`Relance hebdomadaire : ${envoyees} projet(s) relancé(s), ${ignorees} laissé(s) tranquilles.`);
  },
);
