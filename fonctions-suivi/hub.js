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

const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const courriels = require('./courriels');

const bdd = getFirestore();
const REGION = 'europe-west1';
const EQUIPE_EMAIL = 'contact@capmedia.app';
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

async function lireEquipe() {
  try {
    const q = await bdd.collection('equipe').where('actif', '!=', false).get();
    return q.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (err) {
    const q = await bdd.collection('equipe').get();
    return q.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((e) => e.actif !== false);
  }
}

/** Les contacts e-mail du client d'un projet : le contact principal, puis les membres qui ont une adresse. */
async function contactsClient(projet) {
  /* Un projet en sourdine se prépare sans rien envoyer au client. Le
     drapeau se lève depuis le cockpit quand l'espace est prêt. */
  if (projet && projet.silence === true) return [];
  /* Un projet à moi n'a pas de client : rien ne sort. */
  if (projet && projet.interne === true) return [];
  const liste = [];
  /* Un projet peut compter plusieurs interlocuteurs. Ne lire que le contact
     principal laissait le second sans aucun e-mail. */
  for (const c of ((projet && projet.contacts) || [])) {
    if (emailPlausible(c.email) && !liste.some((x) => x.email === normaliserEmail(c.email))) {
      liste.push({ email: normaliserEmail(c.email), nom: c.nom || '' });
    }
  }
  const client = (projet && projet.client) || {};
  if (emailPlausible(client.email) && !liste.some((x) => x.email === normaliserEmail(client.email))) {
    liste.push({ email: normaliserEmail(client.email), nom: client.nom || client.entreprise || '' });
  }
  if (projet && projet.organisation) {
    try {
      const org = await bdd.doc(`organisations/${projet.organisation}`).get();
      for (const c of ((org.exists && org.data().contacts) || [])) {
        if (emailPlausible(c.email) && !liste.some((x) => x.email === normaliserEmail(c.email))) liste.push({ email: normaliserEmail(c.email), nom: c.nom || '' });
      }
    } catch (err) { console.warn('Organisation illisible', err); }
  }
  return liste;
}

/** Les préférences e-mail d'un contact, par catégorie. « off » coupe l'envoi. */
async function accepteEmail(email, categorie) {
  try {
    const q = await bdd.collection('profils').where('email', '==', normaliserEmail(email)).limit(1).get();
    if (q.empty) return true;
    const prefs = q.docs[0].data().notifications || {};
    return prefs[categorie] !== 'off';
  } catch (err) { return true; }
}

async function mettreEnFile(modele, destinataires, variables, categorie) {
  const a = [];
  for (const d of destinataires || []) {
    if (!d || !emailPlausible(d.email)) continue;
    const email = normaliserEmail(d.email);
    if (a.some((x) => x.email === email)) continue;
    if (categorie && !(await accepteEmail(email, categorie))) continue;
    a.push({ email, nom: String(d.nom || '').trim() });
  }
  if (!a.length) return null;
  try {
    const ref = await bdd.collection('envois').add(sansIndefini({
      modele, a, variables: variables || {}, etat: 'attente', erreur: null, essais: 0, cree: FieldValue.serverTimestamp(), envoye: null,
    }));
    return ref.id;
  } catch (err) { console.error(`Mise en file impossible pour « ${modele} »`, err); return null; }
}

/** Une ligne d'activité. `visibilite` : client ou interne. */
async function activite({ projet, organisation, type, texte, par, cible, lien, visibilite = 'client' }) {
  try {
    await bdd.collection('activite').add(sansIndefini({
      projet: projet || null, organisation: organisation || null, type, texte,
      par: par ? { uid: par.uid || null, nom: par.nom || '', cote: par.cote || 'equipe' } : { uid: null, nom: EQUIPE_NOM, cote: 'equipe' },
      cible: cible || null, lien: lien || null, visibilite, date: FieldValue.serverTimestamp(),
    }));
  } catch (err) { console.error('Activité non écrite', err); }
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
}

async function uidsEquipe() { return (await lireEquipe()).map((e) => e.uid); }
const uidsClient = (projet) => ((projet && projet.membres) || []);

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
      await notifier(uidsClient(projet), { type: 'tache', titre: 'Nous attendons votre retour', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
      await mettreEnFile('tache-attente', await contactsClient(projet), { projetNom: nomProjet(projet), titre: apres.titre, description: apres.description, lien: LIEN(lien) }, 'demandes');
    }
    if (apres.statut === 'terminee' && visibilite === 'client') {
      await notifier(uidsClient(projet), { type: 'tache', titre: 'Tâche terminée', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
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
    await notifier(uidsClient(projet), { type: 'jalon', titre: 'Étape terminée', texte: apres.titre, lien: `#${lien}`, projet: projetId });
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
      await notifier(uidsClient(projet), { type: 'release', titre: `Version ${nom} disponible`, texte: apres.titre || '', lien: `#${lien}`, projet: apres.projet });
      await mettreEnFile('release', await contactsClient(projet), { projetNom: nomProjet(projet), version: nom, titre: apres.titre, notes: apres.notes || [], lienStore: (apres.liens || {}).store, lien: LIEN(lien) }, 'releases');
    }
  } else if (avant && avant.statut !== apres.statut) {
    await activite({ projet: apres.projet, type: 'release', texte: `a passé la version ${nom} en ${apres.statut}`, par: auteurDe(apres), lien, visibilite: 'interne' });
  }
});

/* ==========================================================================
   4. Les fichiers
   ========================================================================== */

exports.hubFichierCree = onDocumentCreated({ region: REGION, document: 'fichiers/{fichierId}' }, async (evenement) => {
  const f = evenement.data.data();
  const projet = await lireProjet(f.projet);
  const lien = `/projets/${f.projet}/fichiers`;
  const par = f.par ? { uid: f.par.uid, nom: f.par.nom, cote: f.par.cote } : null;
  await activite({ projet: f.projet, type: 'fichier', texte: `a déposé le fichier « ${f.nom} »`, par, lien, visibilite: f.visibilite === 'interne' ? 'interne' : 'client' });
  if (par && par.cote === 'client') {
    await notifier(await uidsEquipe(), { type: 'fichier', titre: 'Fichier reçu du client', texte: `${f.nom} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: f.projet });
    await mettreEnFile('fichier', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { projetNom: nomProjet(projet), nom: f.nom, par: par.nom, cote: 'equipe', lien: LIEN_ADMIN(lien) });
  } else if (f.visibilite !== 'interne') {
    await notifier(uidsClient(projet), { type: 'fichier', titre: 'Nouveau fichier disponible', texte: f.nom, lien: `#${lien}`, projet: f.projet });
    await mettreEnFile('fichier', await contactsClient(projet), { projetNom: nomProjet(projet), nom: f.nom, categorie: f.categorie, cote: 'client', lien: LIEN(lien) }, 'fichiers');
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
      await notifier(uidsClient(projet), { type: 'reunion', titre: 'Réunion programmée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
      await mettreEnFile('reunion', await contactsClient(projet), { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: apres.lien, ordreDuJour: apres.ordreDuJour, lien: LIEN(lien) }, 'reunions');
    }
  } else if (dateChangee && visibilite === 'client') {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a déplacé la réunion « ${apres.titre} » au ${dateTexte}`, par: auteurDe(apres), lien, visibilite });
    await notifier(uidsClient(projet), { type: 'reunion', titre: 'Réunion déplacée', texte: `${apres.titre} · ${dateTexte}`, lien: `#${lien}`, projet: apres.projet });
    await mettreEnFile('reunion', await contactsClient(projet), { projetNom: nomProjet(projet), titre: apres.titre, date: dateTexte, duree: apres.duree, lienVisio: apres.lien, ordreDuJour: apres.ordreDuJour, lien: LIEN(lien), deplacee: true }, 'reunions');
  } else if (avant && !avant.compteRendu && apres.compteRendu && visibilite === 'client') {
    await activite({ projet: apres.projet, type: 'reunion', texte: `a publié le compte rendu de « ${apres.titre} »`, par: auteurDe(apres), lien, visibilite });
    await notifier(uidsClient(projet), { type: 'reunion', titre: 'Compte rendu disponible', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
  }
});

/* ==========================================================================
   6. Les validations
   ========================================================================== */

exports.hubValidationCreee = onDocumentCreated({ region: REGION, document: 'validations/{validationId}' }, async (evenement) => {
  const v = evenement.data.data();
  const projet = await lireProjet(v.projet);
  const lien = `/valider/${evenement.params.validationId}`;
  await activite({ projet: v.projet, type: 'validation', texte: `a demandé une validation : « ${v.titre} »`, par: v.demandeur ? { uid: v.demandeur.uid, nom: v.demandeur.nom, cote: 'equipe' } : null, lien });
  await notifier(uidsClient(projet), { type: 'validation', titre: 'Votre validation est attendue', texte: v.titre, lien: `#${lien}`, projet: v.projet });
  await mettreEnFile('validation-demandee', await contactsClient(projet), { projetNom: nomProjet(projet), titre: v.titre, description: v.description, type: v.type, lien: LIEN(lien) }, 'validations');
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
    await notifier(await uidsEquipe(), { type: 'validation', titre: apres.statut === 'approuvee' ? 'Validation approuvée' : 'Modifications demandées', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lienAdmin}`, projet: apres.projet });
    await mettreEnFile('validation-reponse', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { projetNom: nomProjet(projet), titre: apres.titre, statut: apres.statut, par: qui.nom, commentaire: qui.commentaire, lien: LIEN_ADMIN(lienAdmin) });
    await audit('validation', { projet: apres.projet, validation: evenement.params.validationId, statut: apres.statut, par: qui.par || null, nom: qui.nom || '' });
  } else if (apres.statut === 'annulee') {
    await activite({ projet: apres.projet, type: 'validation', texte: `a annulé la demande de validation « ${apres.titre} »`, lien: lienAdmin, visibilite: 'interne' });
  }
});

/* ==========================================================================
   7. Les notes, les blocages
   ========================================================================== */

exports.hubNoteCreee = onDocumentCreated({ region: REGION, document: 'notes/{noteId}' }, async (evenement) => {
  const n = evenement.data.data();
  const libelles = { decision: 'a consigné une décision', information: 'a noté une information', idee: 'a noté une idée', risque: 'a signalé un risque', reunion: 'a ajouté une note de réunion' };
  await activite({ projet: n.projet, type: 'note', texte: `${libelles[n.type] || 'a ajouté une note'} : « ${n.titre} »`, par: auteurDe(n), lien: `/projets/${n.projet}/notes`, visibilite: n.visibilite === 'interne' ? 'interne' : 'client' });
  if (n.type === 'decision' && n.visibilite !== 'interne') {
    const projet = await lireProjet(n.projet);
    await notifier(uidsClient(projet), { type: 'note', titre: 'Décision consignée', texte: n.titre, lien: `#/projets/${n.projet}/notes`, projet: n.projet });
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
      await notifier(uidsClient(projet), { type: 'blocage', titre: 'Un point bloque de votre côté', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
    }
  } else if (!avant.resolu && apres.resolu) {
    await activite({ projet: apres.projet, type: 'blocage', texte: `a levé le point bloquant « ${apres.titre} »`, lien, visibilite });
  }
});

/* ==========================================================================
   8. La conversation d'un projet
   ========================================================================== */

exports.hubMessageProjet = onDocumentCreated({ region: REGION, document: 'projets/{projetId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data.data();
  const projetId = evenement.params.projetId;
  const projet = await lireProjet(projetId);
  const de = m.de || {};
  const extrait = String(m.texte || '').slice(0, 140);
  const lienClient = `/messages/${projetId}`;
  await activite({ projet: projetId, type: 'message', texte: `a écrit dans la conversation : « ${extrait}${(m.texte || '').length > 140 ? '…' : ''} »`, par: { uid: de.uid, nom: de.nom, cote: de.cote }, lien: lienClient });
  if (de.cote === 'equipe') {
    await notifier(uidsClient(projet).filter((u) => u !== de.uid), { type: 'message', titre: `Nouveau message de ${de.nom || 'Capmedia'}`, texte: extrait, lien: `#${lienClient}`, projet: projetId });
    await mettreEnFile('message-projet', await contactsClient(projet), { projetNom: nomProjet(projet), auteur: de.nom || 'Capmedia', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN(lienClient) }, 'messages');
  } else {
    await notifier((await uidsEquipe()).filter((u) => u !== de.uid), { type: 'message', titre: `Message de ${de.nom || 'un client'}`, texte: `${nomProjet(projet)} · ${extrait}`, lien: `#${lienClient}`, projet: projetId });
    await mettreEnFile('message-projet', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { projetNom: nomProjet(projet), auteur: de.nom || 'Client', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN_ADMIN(lienClient), cote: 'equipe' });
  }
});

/* ==========================================================================
   9. Les paiements, les pièces comptables (miroir d'activité)
   ========================================================================== */

exports.hubPaiementCree = onDocumentCreated({ region: REGION, document: 'paiements/{paiementId}' }, async (evenement) => {
  const p = evenement.data.data();
  const projet = await lireProjet(p.projet);
  const montant = Number(p.montant) || 0;
  const texteMontant = montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  await activite({ projet: p.projet, type: 'paiement', texte: `a enregistré un paiement de ${texteMontant}`, lien: `/finances/${p.facture || ''}` });
  await notifier(uidsClient(projet), { type: 'paiement', titre: 'Paiement enregistré', texte: `${texteMontant} · merci`, lien: `#/finances/${p.facture || ''}`, projet: p.projet });
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
    const qui = apres.reponse && apres.statut !== avant.statut && ['accepte', 'refuse'].includes(apres.statut) ? { uid: apres.reponse.par, nom: apres.reponse.nom, cote: 'client' } : null;
    const libelles = { accepte: 'a accepté', refuse: 'a refusé', consulte: 'a consulté', payee: 'a réglé', 'a-payer': 'a mis à payer', 'en-retard': 'a marqué en retard', envoye: 'a envoyé', envoyee: 'a envoyé', partielle: 'a réglé en partie', annule: 'a annulé', annulee: 'a annulé', expire: 'a laissé expirer' };
    await activite({ projet: apres.projet, type: genre, texte: `${libelles[apres.statut] || `a passé en ${apres.statut}`} ${genre === 'devis' ? 'le devis' : 'la facture'} ${nom}`, par: qui, lien, visibilite: apres.statut === 'consulte' ? 'interne' : 'client' });
    if (['accepte', 'refuse'].includes(apres.statut)) await audit('devis', { projet: apres.projet, document: evenement.params.documentId, statut: apres.statut, par: (apres.reponse || {}).par || null });
    if (apres.statut === 'payee') { const projet = await lireProjet(apres.projet); await notifier(uidsClient(projet), { type: 'facture', titre: 'Facture réglée', texte: nom, lien: `#${lien}`, projet: apres.projet }); }
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
    if (apres.auteur && apres.auteur.cote === 'client') await notifier(await uidsEquipe(), { type: 'demande', titre: 'Nouvelle demande', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    return;
  }
  if (avant.statut !== apres.statut) {
    const libelles = { nouveau: 'reçue', 'a-analyser': 'à analyser', 'en-attente-client': "en attente d'information", acceptee: 'acceptée', planifiee: 'planifiée', 'en-cours': 'en cours', 'en-revue': 'en revue', 'a-valider': 'à valider', resolu: 'terminée', refuse: 'refusée', annulee: 'annulée', ferme: 'fermée' };
    const parClient = (avant.statut === 'a-valider' && apres.statut === 'resolu') || (avant.statut === 'resolu' && apres.statut === 'en-cours');
    await activite({ projet: apres.projet, type: 'demande', texte: `a passé la demande ${nom} en ${libelles[apres.statut] || apres.statut}`, par: parClient && apres.auteur ? { uid: apres.auteur.uid, nom: apres.auteur.nom, cote: 'client' } : null, lien });
    if (parClient) await notifier(await uidsEquipe(), { type: 'demande', titre: apres.statut === 'resolu' ? 'Correction validée par le client' : 'Demande rouverte par le client', texte: `${apres.titre} · ${nomProjet(projet)}`, lien: `#${lien}`, projet: apres.projet });
    else await notifier(uidsClient(projet), { type: 'demande', titre: `Demande ${libelles[apres.statut] || apres.statut}`, texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
  }
  if (avant.qualification !== apres.qualification && apres.qualification) {
    const libelles = { incluse: 'incluse au contrat', 'hors-perimetre': 'hors périmètre', 'a-chiffrer': 'à chiffrer', offerte: 'offerte' };
    await activite({ projet: apres.projet, type: 'demande', texte: `a qualifié la demande ${nom} : ${libelles[apres.qualification]}`, lien });
    if (apres.qualification === 'hors-perimetre' || apres.qualification === 'a-chiffrer') {
      await notifier(uidsClient(projet), { type: 'demande', titre: apres.qualification === 'a-chiffrer' ? 'Un devis va vous être proposé' : 'Demande hors périmètre', texte: apres.titre, lien: `#${lien}`, projet: apres.projet });
      await mettreEnFile('qualification', await contactsClient(projet), { projetNom: nomProjet(projet), numero: apres.numero, titre: apres.titre, qualification: apres.qualification, lien: LIEN(lien) }, 'demandes');
    }
  }
});

exports.hubMessageTicketBoite = onDocumentCreated({ region: REGION, document: 'tickets/{ticketId}/messages/{messageId}' }, async (evenement) => {
  const m = evenement.data.data();
  if (m.interne) return;
  const ticket = await bdd.doc(`tickets/${evenement.params.ticketId}`).get();
  if (!ticket.exists) return;
  const t = ticket.data();
  const projet = await lireProjet(t.projet);
  const lien = `/projets/${t.projet}/demandes/${evenement.params.ticketId}`;
  const de = m.de || {};
  await activite({ projet: t.projet, type: 'message', texte: `a répondu sur ${t.numero || 'la demande'} « ${t.titre} »`, par: { uid: de.uid, nom: de.nom, cote: de.cote }, lien });
  if (de.cote === 'equipe') await notifier(uidsClient(projet).filter((u) => u !== de.uid), { type: 'message', titre: `Réponse sur ${t.numero || 'votre demande'}`, texte: String(m.texte || '').slice(0, 140), lien: `#${lien}`, projet: t.projet });
  else await notifier((await uidsEquipe()).filter((u) => u !== de.uid), { type: 'message', titre: `${de.nom || 'Le client'} a répondu`, texte: `${t.numero || ''} ${t.titre}`.trim(), lien: `#${lien}`, projet: t.projet });
});

/* ==========================================================================
   11. Les demandes de nouveau projet
   ========================================================================== */

exports.hubDemandeProjetCreee = onDocumentCreated({ region: REGION, document: 'demandesProjet/{demandeId}' }, async (evenement) => {
  const d = evenement.data.data();
  const lien = `/nouveaux-projets/${evenement.params.demandeId}`;
  await activite({ organisation: d.organisation || null, type: 'projet', texte: `a demandé un nouveau projet : « ${d.titre} »`, par: d.par ? { uid: d.par.uid, nom: d.par.nom, cote: 'client' } : null, lien, visibilite: 'interne' });
  await notifier(await uidsEquipe(), { type: 'projet', titre: 'Nouveau projet demandé', texte: `${d.titre} · ${(d.par || {}).nom || ''}`, lien: `#${lien}` });
  await mettreEnFile('preprojet', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { titre: d.titre, par: (d.par || {}).nom, email: (d.par || {}).email, idee: d.idee, type: d.type, budget: d.budget, delai: d.delai, lien: LIEN_ADMIN(lien), cote: 'equipe' });
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
  const m = evenement.data.data();
  const demande = await bdd.doc(`demandesProjet/${evenement.params.demandeId}`).get();
  if (!demande.exists) return;
  const d = demande.data();
  const lien = `/nouveaux-projets/${evenement.params.demandeId}`;
  const de = m.de || {};
  if (de.cote === 'equipe') {
    if (d.par && d.par.uid) await notifier([d.par.uid], { type: 'message', titre: `Réponse de ${de.nom || 'Capmedia'}`, texte: String(m.texte || '').slice(0, 140), lien: `#${lien}` });
    if (d.par && emailPlausible(d.par.email)) await mettreEnFile('message-projet', [{ email: d.par.email, nom: d.par.nom }], { projetNom: d.titre, auteur: de.nom || 'Capmedia', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN(lien) }, 'messages');
  } else {
    await notifier(await uidsEquipe(), { type: 'message', titre: `${de.nom || 'Le client'} a répondu (nouveau projet)`, texte: d.titre, lien: `#${lien}` });
    await mettreEnFile('message-projet', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { projetNom: d.titre, auteur: de.nom || 'Client', texte: m.texte, pieces: (m.pieces || []).length, lien: LIEN_ADMIN(lien), cote: 'equipe' });
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
      await notifier(await uidsEquipe(), { type: 'maintenance', titre: 'Forfait de maintenance demandé', texte: `${nom} · ${par.nom || ''}`, lien: `#${lien}`, projet: projetId });
      await mettreEnFile('maintenance', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { cote: 'equipe', evenement: 'demande', projet: nom, par: par.nom, email: par.email, message: d.message, rythme: d.rythme, lien: LIEN_ADMIN(lien) });
      return;
    }

    /* L'équipe change l'état : le client l'apprend. */
    const LIBELLES = { proposition: 'proposition envoyée', actif: 'en cours', suspendu: 'suspendu', termine: 'terminé' };
    if (!LIBELLES[apres.statut]) return;
    const TITRES = { proposition: 'Une proposition de maintenance vous attend', actif: 'Votre forfait de maintenance est en cours', suspendu: 'Votre forfait de maintenance est suspendu', termine: 'Votre forfait de maintenance est terminé' };
    await activite({ projet: projetId, type: 'maintenance', texte: `a passé le forfait de maintenance en « ${LIBELLES[apres.statut]} »`, lien });
    await notifier(uidsClient(projet), { type: 'maintenance', titre: TITRES[apres.statut], texte: apres.formule || nom, lien: `#${lien}`, projet: projetId });
    await mettreEnFile('maintenance', await contactsClient(projet), { cote: 'client', evenement: apres.statut, projet: nom, formule: apres.formule, montant: apres.montant, jours: apres.jours, periode: apres.reconduction, lien: LIEN(lien) }, 'projet');
    return;
  }

  if (genre === 'evolution') {
    if (apres && !avant) {
      if (apres.origine === 'client') {
        const par = apres.par || {};
        await activite({ projet: projetId, type: 'maintenance', texte: `a proposé une évolution : « ${apres.titre} »`, par: par.uid ? { uid: par.uid, nom: par.nom || '', cote: 'client' } : null, lien });
        await notifier(await uidsEquipe(), { type: 'maintenance', titre: 'Évolution proposée', texte: `${nom} · ${apres.titre}`, lien: `#${lien}`, projet: projetId });
        await mettreEnFile('maintenance', [{ email: EQUIPE_EMAIL, nom: EQUIPE_NOM }], { cote: 'equipe', evenement: 'evolution', projet: nom, par: par.nom, email: par.email, titre: apres.titre, message: apres.description, lien: LIEN_ADMIN(lien) });
      } else {
        await activite({ projet: projetId, type: 'maintenance', texte: `a ajouté l'évolution « ${apres.titre} »`, lien });
      }
      return;
    }
    if (apres && avant && avant.statut !== apres.statut) {
      const L = { proposee: 'remise en proposition', acceptee: 'acceptée', planifiee: 'planifiée', livree: 'livrée', refusee: 'écartée' };
      await activite({ projet: projetId, type: 'maintenance', texte: `a marqué l'évolution « ${apres.titre} » comme ${L[apres.statut] || apres.statut}`, lien });
      await notifier(uidsClient(projet), { type: 'maintenance', titre: `Évolution ${L[apres.statut] || apres.statut}`, texte: apres.titre, lien: `#${lien}`, projet: projetId });
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
  if (avant.statut !== apres.statut) {
    const libelles = { prospect: 'prospect', cadrage: 'en cadrage', planifie: 'planifié', 'en-cours': 'en cours', 'attente-client': 'en attente du client', 'en-revue': 'en revue', livraison: 'en livraison', maintenance: 'en maintenance', termine: 'terminé', suspendu: 'suspendu', archive: 'archivé' };
    await activite({ projet: projetId, type: 'projet', texte: `a passé le projet ${libelles[apres.statut] || apres.statut}`, lien });
    if (['termine', 'livraison', 'attente-client'].includes(apres.statut)) await notifier(apres.membres || [], { type: 'projet', titre: `Projet ${libelles[apres.statut]}`, texte: apres.nom, lien: `#${lien}`, projet: projetId });
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
    await notifier(apres.membres || [], { type: 'projet', titre: 'La date de livraison a changé', texte: `${apres.nom} · ${texte.replace(/^a /, '')}`, lien: `#${lien}`, projet: projetId });
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
  const p = evenement.data.data();
  const projetId = evenement.params.projetId;
  await activite({ projet: projetId, organisation: p.organisation || null, type: 'projet', texte: `a ouvert le projet « ${p.nom} »`, lien: `/projets/${projetId}` });
  await notifier(p.membres || [], { type: 'projet', titre: 'Votre espace projet est ouvert', texte: p.nom, lien: `#/projets/${projetId}`, projet: projetId });
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

  await prendre('validations', (v) => v.statut === 'en-attente',
    (v) => ({ quoi: 'À valider', detail: `${v.titre || ''} · en attente ${depuisJours(v.cree)}` }));
  await prendre('tickets', (t) => !t.archive && ATTEND_LE_CLIENT.includes(t.statut),
    (t) => ({ quoi: t.statut === 'a-valider' ? 'Correction à vérifier' : 'Précision attendue', detail: `${t.numero ? `${t.numero} · ` : ''}${t.titre || ''} · ${depuisJours(t.maj)}` }));
  await prendre('documents', (x) => x.type === 'devis' && ['envoye', 'consulte'].includes(x.statut),
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
  if (projet.silence === true) return { retenu: false, motif: 'en sourdine' };
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

      const destinataires = await contactsClient(projet);
      if (!destinataires.length) { ignorees += 1; continue; }

      for (const d of destinataires) {
        await mettreEnFile('relance', [d], {
          par: d.nom || '', projet: projet.nom || '', points, lien: LIEN('/valider'),
        }, 'relance');
      }
      try { await bdd.doc(`projets/${projet.id}`).update({ relance: FieldValue.serverTimestamp() }); } catch (err) { console.error('Relance non datée', err); }
      envoyees += 1;
    }
    console.log(`Relance hebdomadaire : ${envoyees} projet(s) relancé(s), ${ignorees} laissé(s) tranquilles.`);
  },
);
