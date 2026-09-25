/* ==========================================================================
   CAPMEDIA CLIENT HUB · qui peut quoi

   Le modèle, en une ligne : utilisateur Firebase, puis rôle, permissions,
   projets autorisés, actions autorisées. Tout ce qui décide d'un accès côté
   serveur passe par ce fichier, et les règles Firestore et Storage disent
   la même chose avec leurs propres mots.

   Trois familles, jamais deux à la fois pour une même adresse :

   - l'ÉQUIPE (equipe/{uid}) : « admin » ou « agent ». Un administrateur
     a toutes les permissions et tous les projets. Un agent a un socle de
     permissions et la liste des projets où il travaille ; un
     administrateur peut lui déléguer d'autres permissions, jamais celle
     d'administrer l'équipe ni les opérations système.

   - le CLIENT, projet par projet (projets/{p}/interlocuteurs/{cle}) :
     « responsable » ou « collaborateur ». L'organisation regroupe des
     projets et des informations commerciales, elle ne donne AUCUN accès :
     organisation != autorisation.

   - le TESTEUR (testeurs/{uid}) : il ne voit que ses campagnes.

   La liste « membres » d'un projet est l'accès effectif du client, et c'est
   elle que lisent les règles. Elle n'est jamais écrite à la main : elle est
   calculée ici, depuis les interlocuteurs actifs, et vide tant que le
   projet est fermé au client.
   ========================================================================== */

const { getAuth } = require('firebase-admin/auth');
const { bdd, FieldValue, normaliserEmail, cleEmail, Refus } = require('./commun');

/* ==========================================================================
   1. Les rôles et les permissions
   ========================================================================== */

const ROLES_EQUIPE = { admin: 'Administrateur', agent: 'Agent' };
const ROLES_CLIENT = { responsable: 'Responsable', collaborateur: 'Collaborateur' };

const PERMISSIONS = {
  'projet.voir': 'consulter un projet',
  'demandes.gerer': 'répondre aux demandes et échanger avec le client',
  'contenu.gerer': 'tenir les tâches, étapes, fichiers, réunions et validations',
  'qa.participer': 'participer à la recette',
  'qa.gerer': 'piloter la recette (testeurs, campagnes, robots)',
  'finance.gerer': 'déposer des devis et des factures, enregistrer des paiements',
  'acces.gerer': 'donner et retirer les accès des clients',
  'projets.creer': 'créer un projet',
  'projets.ouvrir': 'ouvrir un projet au client, le refermer, couper ses e-mails',
  'clients.gerer': 'créer et modifier les fiches clients',
  'equipe.gerer': "administrer l'équipe",
  systeme: 'lancer les opérations système',
};

const SOCLE = {
  admin: Object.keys(PERMISSIONS),
  agent: ['projet.voir', 'demandes.gerer', 'contenu.gerer', 'qa.participer'],
};

/* Ce qu'un administrateur peut ajouter à un agent. Administrer l'équipe et
   les opérations système restent attachés au rôle : un agent ne devient
   pas administrateur par accumulation de cases cochées. */
const DELEGABLES = Object.keys(PERMISSIONS).filter((p) => !['equipe.gerer', 'systeme'].includes(p));

/** Les permissions effectives d'une fiche d'équipe. Vide si inactive. */
function permissionsDe(fiche) {
  if (!fiche || fiche.actif !== true || !ROLES_EQUIPE[fiche.role]) return new Set();
  const socle = SOCLE[fiche.role] || [];
  const deleguees = fiche.role === 'agent' && Array.isArray(fiche.permissions)
    ? fiche.permissions.filter((p) => DELEGABLES.includes(p)) : [];
  return new Set([...socle, ...deleguees]);
}

/** Un membre d'équipe travaille-t-il sur ce projet ? */
function equipeSurProjet(fiche, projetId) {
  if (!fiche || fiche.actif !== true) return false;
  if (fiche.role === 'admin') return true;
  return fiche.role === 'agent' && Boolean(projetId) && Array.isArray(fiche.projets) && fiche.projets.includes(String(projetId));
}

/**
 * La décision, sans rien lire : une fiche d'équipe, une permission, un
 * projet éventuel. Rend { ok } ou { ok: false, code, motif }. C'est elle
 * que les épreuves appellent directement.
 */
function decider({ fiche, permission, projet = null }) {
  if (!fiche) return { ok: false, code: 403, motif: "Cette action est réservée à l'équipe Capmedia." };
  if (fiche.actif !== true) return { ok: false, code: 403, motif: "Votre accès à l'équipe est désactivé." };
  if (!ROLES_EQUIPE[fiche.role]) return { ok: false, code: 403, motif: "Votre fiche d'équipe n'a pas de rôle reconnu." };
  if (permission && !permissionsDe(fiche).has(permission)) {
    return { ok: false, code: 403, motif: `Votre rôle ne vous permet pas de ${PERMISSIONS[permission] || permission}.` };
  }
  if (projet && !equipeSurProjet(fiche, projet)) {
    return { ok: false, code: 403, motif: "Vous n'êtes pas autorisé sur ce projet." };
  }
  return { ok: true };
}

/**
 * Le dernier administrateur actif ne peut être ni désactivé, ni rétrogradé,
 * ni retiré : sans lui, plus personne ne peut administrer l'équipe, et le
 * seul recours serait la console Firebase. `apres` est la fiche après le
 * geste, ou null si la fiche disparaît. Rend un message, ou null.
 */
function controleDernierAdmin(equipe, cibleUid, apres) {
  const estAdminActif = (f) => Boolean(f) && f.actif === true && f.role === 'admin';
  const avant = (equipe || []).find((f) => f.uid === cibleUid);
  if (!estAdminActif(avant) || estAdminActif(apres)) return null;
  const autres = (equipe || []).filter((f) => f.uid !== cibleUid && estAdminActif(f));
  return autres.length ? null : "C'est le dernier administrateur actif : nommez-en un autre avant de retirer celui-ci.";
}

/* ==========================================================================
   2. L'identité de l'appelant
   ========================================================================== */

/**
 * Le jeton Firebase de la requête, vérifié, révocation comprise : une
 * session ouverte avant une désactivation est refusée dès l'instant où
 * les jetons ont été révoqués, sans attendre leur heure d'expiration.
 * Rend { uid, email, fiche } ; `fiche` est la fiche d'équipe, ou null.
 */
async function identifier(req) {
  const entete = String((req.get && req.get('authorization')) || (req.headers && req.headers.authorization) || '');
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
  if (!jeton) throw new Refus(401, 'Connexion requise : ouvrez une session.');
  let decode;
  try {
    decode = await getAuth().verifyIdToken(jeton, true);
  } catch (err) {
    const code = String((err && err.code) || '');
    if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled') throw new Refus(401, 'Cette session a été fermée. Reconnectez-vous.');
    throw new Refus(401, 'Session invalide ou expirée. Reconnectez-vous.');
  }
  if (decode.email_verified !== true) throw new Refus(401, "Cette adresse n'est pas vérifiée. Reconnectez-vous avec votre code.");
  const doc = await bdd.doc(`equipe/${decode.uid}`).get();
  return { uid: decode.uid, email: normaliserEmail(decode.email), fiche: doc.exists ? { uid: doc.id, ...doc.data() } : null };
}

/** Lève un refus lisible si l'identité ne permet pas le geste. */
function exiger(identite, permission, projet = null) {
  const d = decider({ fiche: identite && identite.fiche, permission, projet });
  if (!d.ok) throw new Refus(d.code, d.motif);
}

/* ==========================================================================
   3. L'accès d'un client, projet par projet
   ========================================================================== */

/**
 * L'accès effectif, calculé sans rien lire. Un interlocuteur compte s'il
 * est actif, s'il a un compte et un rôle défini. Le projet fermé ou interne
 * ne donne accès à personne, mais les personnes restent préparées.
 */
function planAcces(projet, interlocuteurs) {
  const actifs = (interlocuteurs || []).filter((i) => i && i.statut === 'actif' && i.uid);
  const personnes = [...new Set(actifs.map((i) => i.uid))];
  const ouvert = Boolean(projet) && projet.ouvert === true && projet.interne !== true;
  const avecRole = actifs.filter((i) => ROLES_CLIENT[i.role]);
  const membres = ouvert ? [...new Set(avecRole.map((i) => i.uid))] : [];
  const roles = {};
  if (ouvert) for (const i of avecRole) roles[i.uid] = roles[i.uid] === 'responsable' ? 'responsable' : i.role;
  return { membres, roles, personnes };
}

/** Le rôle d'une personne sur un projet d'après la fiche projet, ou null. */
const roleClient = (projet, uid) => {
  if (!projet || !uid || !Array.isArray(projet.membres) || !projet.membres.includes(uid)) return null;
  const r = (projet.roles || {})[uid];
  return ROLES_CLIENT[r] ? r : null;
};

/**
 * Les revendications du jeton, relues dans la base. Les règles ne s'y fient
 * plus pour décider (elles relisent la fiche), mais l'écran s'en sert, et
 * « testeur » est posé à la connexion : on le garde.
 */
async function poserRevendications(uid) {
  let existantes = {};
  try { existantes = (await getAuth().getUser(uid)).customClaims || {}; } catch (err) {
    if (err && err.code === 'auth/user-not-found') return null;
    throw err;
  }
  const [fiche, projets] = await Promise.all([
    bdd.doc(`equipe/${uid}`).get(),
    bdd.collection('projets').where('membres', 'array-contains', uid).get(),
  ]);
  const revendications = {
    ...(existantes.testeur === true ? { testeur: true } : {}),
    equipe: fiche.exists && fiche.data().actif === true,
    projets: projets.docs.map((d) => d.id).slice(-200),
  };
  await getAuth().setCustomUserClaims(uid, revendications);
  return revendications;
}

/**
 * Recalcule l'accès d'un projet depuis ses interlocuteurs, l'écrit, puis
 * met à jour les jetons et l'organisation des personnes touchées. C'est le
 * SEUL chemin qui écrit « membres » et « roles ».
 */
async function recalculerAcces(projetId) {
  const ref = bdd.doc(`projets/${projetId}`);
  const doc = await ref.get();
  if (!doc.exists) throw new Refus(404, 'Projet inconnu.');
  const projet = doc.data();
  const interlocuteurs = (await ref.collection('interlocuteurs').get()).docs.map((d) => ({ cle: d.id, ...d.data() }));
  const plan = planAcces(projet, interlocuteurs);
  const avant = Array.isArray(projet.membres) ? projet.membres : [];
  await ref.update({
    membres: plan.membres, roles: plan.roles, personnes: plan.personnes,
    membresOrganisation: [], accesVersion: 2, maj: FieldValue.serverTimestamp(),
  });
  const touches = new Set([...avant, ...plan.membres]);
  for (const uid of touches) {
    try { await poserRevendications(uid); } catch (err) { console.error(`Jeton de ${uid} non recalculé`, err); }
  }
  if (projet.organisation) await recalculerOrganisation(String(projet.organisation));
  return { ...plan, retires: avant.filter((u) => !plan.membres.includes(u)) };
}

/* Les membres d'une organisation : ceux qui ont accès à au moins un de ses
   projets. Ils ne donnent aucun accès ; ils permettent seulement à chacun
   de lire la fiche de sa propre société. */
async function recalculerOrganisation(orgId) {
  const ref = bdd.doc(`organisations/${orgId}`);
  const org = await ref.get();
  if (!org.exists) return [];
  const projets = await bdd.collection('projets').where('organisation', '==', orgId).get();
  const membres = [...new Set(projets.docs.flatMap((p) => p.data().membres || []))];
  const actuels = org.data().membres || [];
  if (actuels.length !== membres.length || actuels.some((u) => !membres.includes(u))) {
    await ref.update({ membres, maj: FieldValue.serverTimestamp() });
  }
  return membres;
}

/* ==========================================================================
   4. Passer un projet d'avant la Gate 2 au modèle par interlocuteurs

   Partagé par l'outil de migration et par le serveur (qui convertit un
   projet à la volée avant d'en toucher les accès). Rien n'est deviné : un
   rôle qu'on ne sait pas déduire devient un arbitrage, pas un choix.
   ========================================================================== */

/**
 * @param projet    la fiche du projet
 * @param org       la fiche de son organisation, ou null
 * @param comptes   { uid: email } des comptes membres
 * @param maintenant une date, pour l'épreuve
 * @returns { champs, interlocuteurs: [{ cle, fiche }], arbitrages: [texte], deja }
 */
function planMigrationProjet(projet, org, comptes = {}) {
  const champs = {};
  const interlocuteurs = [];
  const arbitrages = [];
  if (!projet) return { champs, interlocuteurs, arbitrages, deja: false };
  if (projet.accesVersion === 2) return { champs, interlocuteurs, arbitrages, deja: true };

  const membres = Array.isArray(projet.membres) ? projet.membres : [];
  const roleOrg = (uid, email) => {
    const r = org && org.roles ? org.roles[uid] : null;
    if (r === 'owner') return 'responsable';
    const contact = org && Array.isArray(org.contacts)
      ? org.contacts.find((c) => (uid && c.uid === uid) || (email && normaliserEmail(c.email) === normaliserEmail(email))) : null;
    if (contact && contact.role === 'owner') return 'responsable';
    return null;
  };

  if (projet.interne === true) {
    if (projet.ouvert === undefined) champs.ouvert = false;
    if (projet.emailsClient === undefined) champs.emailsClient = 'actifs';
    champs.accesVersion = 2;
    return { champs, interlocuteurs, arbitrages, deja: false };
  }

  /* L'état d'ouverture : un projet où quelqu'un est déjà membre est ouvert
     de fait. Un projet sans membre est fermé de fait. Mais un projet sans
     membre, qui n'était pas en sourdine et porte une adresse, envoyait
     encore des e-mails à cette adresse : le fermer change ce qu'il envoie,
     et ce changement est une décision, pas un calcul. */
  const adresses = [
    ...((projet.contacts || []).map((c) => ({ email: normaliserEmail(c.email), nom: c.nom || '' }))),
    ...(projet.client && projet.client.email ? [{ email: normaliserEmail(projet.client.email), nom: projet.client.nom || '' }] : []),
  ].filter((a) => a.email);
  if (projet.ouvert === undefined) {
    if (membres.length) {
      champs.ouvert = true;
      /* Déjà ouvert de fait : sa première ouverture est passée. Sans date
         connue, celle de la migration. Une réouverture future ne renverra
         donc pas de lettre d'ouverture à qui est déjà entré. */
      champs.premiereOuverture = projet.ouvertLe || projet.cree || FieldValue.serverTimestamp();
    } else if (projet.silence === true || !adresses.length) {
      champs.ouvert = false;
    } else {
      arbitrages.push('projet sans membre, hors sourdine, avec une adresse de contact : le fermer (plus aucun e-mail) ou l\'ouvrir (invitations) ?');
    }
  } else if (projet.ouvert === true && !projet.premiereOuverture) {
    champs.premiereOuverture = projet.ouvertLe || projet.cree || FieldValue.serverTimestamp();
  }

  /* La sourdine d'un projet ouvert devient « e-mails coupés » : le client
     garde son espace, rien ne part par e-mail, exactement comme avant. Sur
     un projet fermé, la sourdine n'a plus d'objet. */
  if (projet.emailsClient === undefined) {
    const ouvertApres = champs.ouvert !== undefined ? champs.ouvert : projet.ouvert === true;
    champs.emailsClient = ouvertApres && projet.silence === true ? 'coupes' : 'actifs';
  }

  /* Le nom d'une adresse, là où la fiche le connaît déjà. */
  const nomDe = (email) => {
    const c = [...((org && org.contacts) || []), ...(projet.contacts || []), ...(projet.client ? [projet.client] : [])]
      .find((x) => x && normaliserEmail(x.email) === email);
    return (c && c.nom) || '';
  };
  const vus = new Set();
  for (const uid of membres) {
    const email = normaliserEmail(comptes[uid]);
    if (!email) { arbitrages.push(`membre ${uid} sans compte lisible : à retirer ou à rattacher`); continue; }
    const role = roleOrg(uid, email);
    if (!role) { arbitrages.push(`membre ${email} : rôle responsable ou collaborateur à décider`); continue; }
    vus.add(email);
    interlocuteurs.push({ cle: cleEmail(email), fiche: { email, nom: nomDe(email), uid, role, statut: 'actif', origine: 'migration-membre', invitation: { etat: 'acceptee' } } });
  }
  /* Les adresses de contact qui ne sont pas encore membres : préparées,
     jamais invitées ici. Elles ne recevront rien tant qu'on n'aura pas
     ouvert le projet ou renvoyé leur invitation. */
  for (const a of adresses) {
    if (vus.has(a.email)) continue;
    vus.add(a.email);
    const role = roleOrg(null, a.email) || 'a-definir';
    if (role === 'a-definir') arbitrages.push(`contact ${a.email} : rôle à décider avant l'ouverture`);
    interlocuteurs.push({ cle: cleEmail(a.email), fiche: { email: a.email, nom: a.nom, uid: null, role, statut: 'actif', origine: 'migration-contact', invitation: { etat: 'preparee' } } });
  }

  /* Un membre sans rôle déductible garde son accès tant que l'arbitrage
     n'est pas rendu : le projet n'est pas converti, rien n'est retiré. */
  const bloquant = arbitrages.some((a) => a.startsWith('membre ') || a.startsWith('projet sans membre'));
  if (!bloquant) champs.accesVersion = 2;
  return { champs, interlocuteurs, arbitrages, deja: false, bloquant };
}

/**
 * Convertit un projet d'avant la Gate 2, s'il ne l'est pas déjà, puis rend
 * sa fiche. Refuse (409) si un arbitrage humain manque : on ne retire
 * l'accès de personne sur une supposition.
 */
async function assurerModele(projetId) {
  const ref = bdd.doc(`projets/${projetId}`);
  const doc = await ref.get();
  if (!doc.exists) throw new Refus(404, 'Projet inconnu.');
  const projet = doc.data();
  if (projet.accesVersion === 2) return { id: doc.id, ...projet };
  const org = projet.organisation ? await bdd.doc(`organisations/${projet.organisation}`).get() : null;
  const comptes = {};
  for (const uid of projet.membres || []) {
    try { comptes[uid] = (await getAuth().getUser(uid)).email || ''; } catch (err) { comptes[uid] = ''; }
  }
  const plan = planMigrationProjet(projet, org && org.exists ? org.data() : null, comptes);
  if (plan.bloquant) throw new Refus(409, `Ce projet attend un arbitrage avant de changer ses accès : ${plan.arbitrages.join(' ; ')}`);
  for (const i of plan.interlocuteurs) {
    const cible = ref.collection('interlocuteurs').doc(i.cle);
    if (!(await cible.get()).exists) {
      await cible.set({ ...i.fiche, ajoute: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
    }
  }
  if (Object.keys(plan.champs).length) await ref.update({ ...plan.champs, maj: FieldValue.serverTimestamp() });
  await recalculerAcces(projetId);
  return { id: doc.id, ...(await ref.get()).data() };
}

/**
 * Une réponse à un devis engage le client. Elle est légitime si elle vient
 * d'un responsable du projet, ou d'un membre actif de l'équipe qui gère la
 * finance de ce projet (un devis signé hors du Hub, marqué par statutDevis).
 * Décision pure : la fiche d'équipe est passée par l'appelant.
 */
function reponseDevisLegitime({ projet, reponse, ficheEquipe = null }) {
  const r = reponse || {};
  if (!projet || !r.par) return false;
  if (r.cote === 'equipe') return decider({ fiche: ficheEquipe, permission: 'finance.gerer', projet: projet.id }).ok;
  return roleClient(projet, r.par) === 'responsable';
}

/** La même, avec la fiche d'équipe lue quand la réponse s'en réclame. */
async function reponseDevisAcceptee(projet, reponse) {
  const r = reponse || {};
  const ficheEquipe = r.cote === 'equipe' && r.par ? ((await bdd.doc(`equipe/${String(r.par)}`).get()).data() || null) : null;
  return reponseDevisLegitime({ projet, reponse: r, ficheEquipe });
}

module.exports = {
  ROLES_EQUIPE, ROLES_CLIENT, PERMISSIONS, SOCLE, DELEGABLES,
  permissionsDe, equipeSurProjet, decider, controleDernierAdmin,
  identifier, exiger,
  planAcces, roleClient, reponseDevisLegitime, reponseDevisAcceptee, poserRevendications, recalculerAcces, recalculerOrganisation,
  planMigrationProjet, assurerModele, cleEmail,
};
