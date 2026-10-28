/* ==========================================================================
   CAPMEDIA TEST · le compte ForgeMe de test d'un testeur
   Depuis son espace, un testeur agit sur SON compte du serveur de test, et
   sur lui seul : par défaut celui qui porte l'adresse de sa connexion à
   Capmedia Test (Gmail, Hotmail ou autre, depuis le 28/10/2026), sinon
   l'adresse que l'équipe a notée dans sa place
   (campagnes/{c}/acces/{uid}.compteTest) :
     etat          lire l'accès et le nombre de tâches (ne compte pas)
     essai         14 jours d'essai, à partir de maintenant
     abonne        abonné, sans limite (plan manuel)
     lecture_seule plus d'accès : le compte voit ses données sans écrire
     remplir       un compte de tous les jours, fictif, en français
     remplir-fond  1 500 tâches et le reste en proportion (rapidité)
     zero          tout vider : le compte, son profil minimal, plus d'accès
                   (confirmation « REMETTRE A ZERO » exigée)
   Les trois états passent par le serveur de test lui-même : Capmedia Test
   dépose subscriptions/{uid}.demandeOutilTest, la fonction outilTestDemande
   de forgeme-test recalcule l'accès comme pour un achat et répond dans
   demandeOutilTestFaite. L'app et le site le voient aussitôt. Les anciens
   noms (gratuit, premium, ultra) restent compris.
   Les écritures partent dans le projet Firebase forgeme-test, et nulle part
   ailleurs, par une seconde application Admin initialisée avec la clé du
   secret FORGEME_TEST_SA. Gardes dures, dans cet ordre :
     1. l'appelant est un testeur actif, la campagne lui est confiée, elle
        est en cours et son accès court encore ;
     2. le compte visé est le sien : son adresse de connexion, ou celle que
        l'équipe LUI a attribuée, à personne d'autre sur la campagne ;
     3. la clé vise exactement le projet forgeme-test (project_id et adresse
        du compte de service), et l'application ouverte aussi ;
     4. vingt gestes par heure et par testeur, un seul à la fois ;
     5. chaque document écrit est sous users/{uid du compte} ou est
        subscriptions/{uid du compte}.
   Rien du Hub n'est écrit dans forgeme-test : l'adresse du testeur sert à
   trouver son compte, rien de plus.
   Chaque geste, accepté ou refusé, laisse une ligne d'audit dans le Hub.
     POST /hubCompteTest   { projet, campagne, geste, confirmation? }
     Authorization: Bearer <jeton>
   Banc d'essai : sur l'émulateur seulement, la clé vient de _banc/compteTest
   (une fausse clé posée par la suite) et non du secret ; l'application de
   test parle alors à l'émulateur, sous le projet forgeme-test.
   ========================================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const acces = require('./acces');
const { bdd, audit, enMillis, normaliserEmail, Refus } = require('./commun');
const donnees = require('./compte-test-donnees');

const REGION = 'europe-west1';
const FORGEME_TEST_SA = defineSecret('FORGEME_TEST_SA');
const PROJET_TEST = 'forgeme-test';
const NOM_APP = 'capmedia-compte-test';
const ID_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;
const COMPTE_VALIDE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const PLAFOND_HEURE = 20;
const VERROU_MS = 5 * 60 * 1000;
const CONFIRMATION_ZERO = 'REMETTRE A ZERO';
const ETATS_ACCES = ['essai', 'abonne', 'lecture_seule'];
/* Les anciens noms des boutons, encore compris (une page ouverte avant la mise à jour). */
const ALIAS = { gratuit: 'lecture_seule', premium: 'abonne', ultra: 'abonne' };
const GESTES = ['etat', ...ETATS_ACCES, ...Object.keys(ALIAS), 'remplir', 'remplir-fond', 'zero'];
const ATTENTE_SERVEUR_MS = 12000;
const SUR_BANC = process.env.FUNCTIONS_EMULATOR === 'true' && Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const texte = (res, code, message) => res.status(code).type('text/plain; charset=utf-8').set('X-Content-Type-Options', 'nosniff').send(message);

/* --------------------------------------------------------------------------
   1. La clé et l'application de test
   -------------------------------------------------------------------------- */

/** La clé du compte de service, refusée si elle ne vise pas forgeme-test. */
function verifierCle(brut) {
  let sa = brut;
  if (typeof brut === 'string') {
    try { sa = JSON.parse(brut); } catch (e) { sa = null; }
  }
  if (!sa || typeof sa !== 'object') throw new Refus(503, 'Le compte de test n\'est pas encore branché. Prévenez l\'équipe.');
  if (sa.project_id !== PROJET_TEST) throw new Refus(503, 'Clé refusée : elle ne vise pas le projet de test.');
  const email = String(sa.client_email || '');
  if (!email.endsWith(`@${PROJET_TEST}.iam.gserviceaccount.com`)) throw new Refus(503, 'Clé refusée : elle ne vise pas le projet de test.');
  return sa;
}

/** L'application ouverte doit viser forgeme-test, rien d'autre. */
function verifierApp(app) {
  if (!app || !app.options || app.options.projectId !== PROJET_TEST) throw new Refus(503, 'Application refusée : elle ne vise pas le projet de test.');
  return app;
}

/** La clé brute : le secret en production, la fausse clé du banc sur l'émulateur. */
async function cleBrute() {
  if (SUR_BANC) {
    const d = (await bdd.doc('_banc/compteTest').get()).data();
    return (d && d.cle) || '';
  }
  try { return FORGEME_TEST_SA.value() || ''; } catch (e) { return ''; }
}

let appOuverte = null;
let empreinteOuverte = '';
async function appTest(fournirCle = cleBrute) {
  const brut = await fournirCle();
  const sa = verifierCle(brut);
  const empreinte = `${sa.project_id}|${sa.client_email}|${sa.private_key_id || ''}`;
  if (appOuverte && empreinteOuverte === empreinte) return verifierApp(appOuverte);
  const ancienne = getApps().find((a) => a.name === NOM_APP);
  if (ancienne) await ancienne.delete();
  appOuverte = initializeApp({ credential: cert(sa), projectId: sa.project_id }, NOM_APP);
  empreinteOuverte = empreinte;
  return verifierApp(appOuverte);
}

/* --------------------------------------------------------------------------
   2. Qui demande, et pour quel compte
   -------------------------------------------------------------------------- */

/** Une adresse e-mail lisible, ou null. */
const adresseValide = (v) => {
  const e = normaliserEmail(v);
  return e && COMPTE_VALIDE.test(e) ? e : null;
};

/**
 * Le compte que l'équipe a attribué à CE testeur sur CETTE campagne.
 * Lève un refus lisible sinon.
 */
async function compteAttribue({ uid, email: emailConnexion, projet, campagne }) {
  if (!ID_VALIDE.test(String(projet || '')) || !ID_VALIDE.test(String(campagne || ''))) throw new Refus(400, 'Campagne inconnue.');
  const fiche = await bdd.doc(`testeurs/${uid}`).get();
  if (!fiche.exists || fiche.data().actif === false) throw new Refus(403, 'Votre accès de testeur est fermé.');
  const refCampagne = bdd.doc(`projets/${projet}/campagnes/${campagne}`);
  const c = await refCampagne.get();
  if (!c.exists) throw new Refus(404, 'Campagne inconnue.');
  const cd = c.data();
  if (!Array.isArray(cd.testeurs) || !cd.testeurs.includes(uid)) throw new Refus(403, 'Cette campagne ne vous est pas confiée.');
  if (cd.statut !== 'en-cours') throw new Refus(403, 'La campagne n\'est pas en cours.');
  const fin = enMillis((cd.fins || {})[uid]);
  if (fin && fin <= Date.now()) throw new Refus(403, 'Votre accès à cette campagne est terminé.');

  const tous = await refCampagne.collection('acces').get();
  const sien = tous.docs.find((d) => d.id === uid);
  /* L'adresse notée par l'équipe pour ce testeur, sinon celle de sa connexion. */
  const brut = sien ? String((sien.data() || {}).compteTest || '').trim() : '';
  const email = brut ? adresseValide(brut) : adresseValide(emailConnexion);
  if (!email) throw new Refus(brut ? 403 : 404, brut ? 'L\'adresse notée pour votre compte de test est illisible : l\'équipe doit la corriger.' : 'Votre adresse de connexion est illisible. Écrivez à l\'équipe.');
  const autres = tous.docs.filter((d) => d.id !== uid && normaliserEmail((d.data() || {}).compteTest) === email);
  if (autres.length) throw new Refus(409, 'Ce compte est attribué à un autre testeur : l\'équipe doit le corriger.');
  return email;
}

/* --------------------------------------------------------------------------
   3. Le plafond : vingt gestes par heure, un seul à la fois
   -------------------------------------------------------------------------- */

async function prendreUnGeste(uid, maintenant = Date.now()) {
  const ref = bdd.doc(`compteTestGestes/${uid}`);
  return bdd.runTransaction(async (t) => {
    const s = await t.get(ref);
    const d = s.exists ? s.data() : {};
    const recents = (Array.isArray(d.instants) ? d.instants : []).filter((x) => typeof x === 'number' && x > maintenant - 3600e3);
    if (d.enCours && enMillis(d.enCours) > maintenant - VERROU_MS) throw new Refus(409, 'Un geste est déjà en cours sur votre compte. Patientez un instant.');
    if (recents.length >= PLAFOND_HEURE) throw new Refus(429, `Vingt gestes par heure au plus. Réessayez dans ${Math.max(1, Math.ceil((Math.min(...recents) + 3600e3 - maintenant) / 60000))} min.`);
    t.set(ref, { instants: [...recents, maintenant], enCours: Timestamp.fromMillis(maintenant) });
    return true;
  });
}
const rendreLeGeste = (uid) => bdd.doc(`compteTestGestes/${uid}`).set({ enCours: null }, { merge: true }).catch(() => null);

/* --------------------------------------------------------------------------
   4. Les gestes, dans forgeme-test
   -------------------------------------------------------------------------- */

/** Chaque chemin doit appartenir au compte : sinon rien ne part. */
function verifierChemins(docs, uidCompte) {
  for (const d of docs) {
    const ok = d.chemin === `users/${uidCompte}` || d.chemin.startsWith(`users/${uidCompte}/`) || d.chemin === `subscriptions/${uidCompte}`;
    if (!ok) throw new Refus(500, 'Écriture refusée : un document sortait de votre compte de test.');
  }
}

async function ecrireParLots(db, docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch();
    for (const d of docs.slice(i, i + 400)) b.set(db.doc(d.chemin), d.donnees, d.fusion ? { merge: true } : {});
    await b.commit();
  }
}

/** Les compteurs d'usage, recomptés sur ce qui est vraiment en base. */
async function recompter(db, uidCompte) {
  const n = async (coll, ...filtres) => {
    let q = db.collection(`users/${uidCompte}/${coll}`);
    for (const [champ, valeur] of filtres) q = q.where(champ, '==', valeur);
    return (await q.count().get()).data().count;
  };
  const actives = (coll) => n(coll, ['isArchived', false]);
  const [taches, tachesFaites, objectifs, objectifsFaits] = await Promise.all([
    actives('tasks'), n('tasks', ['isArchived', false], ['status', 'completed']),
    actives('goals'), n('goals', ['isArchived', false], ['status', 'completed']),
  ]);
  const usage = {
    tasks: taches - tachesFaites, goals: objectifs - objectifsFaits,
    rituals: await actives('rituals'), journals: await actives('journals'), ideas: await actives('ideas'),
    trips: await actives('trips'), photos: 0, importantDates: await actives('importantDates'), subtasks: await actives('subtasks'),
    lastUpdated: new Date(),
  };
  await db.doc(`users/${uidCompte}/stats/usage`).set(usage);
  return usage;
}

/** Les millisecondes d'une date Firestore, d'un nombre ou de rien. */
const ms = (v) => (v == null ? null : typeof v === 'number' ? v : enMillis(v));

/**
 * L'accès tel que l'application et le site le lisent (subscriptions/{uid}.acces, écrit par le serveur
 * de test) : essai, actif, grâce ou lecture seule, avec sa fin. Un compte sans document est en lecture seule.
 */
const accesDe = (abo) => {
  const a = abo && abo.acces;
  if (!a || typeof a !== 'object') return { etat: 'lecture_seule', jusquA: null, source: null };
  const jusquA = ms(a.jusquA);
  const etat = a.etat !== 'lecture_seule' && jusquA && jusquA > Date.now() ? a.etat : 'lecture_seule';
  return { etat, jusquA: etat === 'lecture_seule' ? null : jusquA, source: a.source || null };
};

/** Le plan des anciens écrans (compte-test-donnees.js remplit selon le plan). */
const planDe = (abo) => (accesDe(abo).etat === 'lecture_seule' ? 'free' : 'premium_ultra');

/**
 * Un état d'accès, appliqué par le serveur de test lui-même (outilTestDemande) : on dépose la demande
 * sur le document, puis on attend sa réponse. Sans réponse à temps, la demande reste posée et le
 * serveur l'appliquera : on le dit au testeur.
 */
async function demanderAcces(db, uidCompte, action, { attente = ATTENTE_SERVEUR_MS } = {}) {
  const ref = db.doc(`subscriptions/${uidCompte}`);
  verifierChemins([{ chemin: ref.path }], uidCompte);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await ref.set({ demandeOutilTest: { id, action, le: FieldValue.serverTimestamp() } }, { merge: true });
  const limite = Date.now() + attente;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 600));
    const abo = (await ref.get()).data() || {};
    const faite = abo.demandeOutilTestFaite;
    if (faite && faite.id === id) return { applique: true, acces: accesDe(abo) };
  }
  return { applique: false, acces: accesDe((await ref.get()).data()) };
}

/** Tout vider sous users/{uid}, puis le profil minimal ; plus d'abonnement. */
async function remettreAZero(db, compte) {
  const racine = db.doc(`users/${compte.uid}`);
  verifierChemins([{ chemin: racine.path }], compte.uid);
  for (const coll of await racine.listCollections()) {
    verifierChemins([{ chemin: coll.path }], compte.uid);
    await db.recursiveDelete(coll);
  }
  await db.doc(`subscriptions/${compte.uid}`).delete();
  const p = donnees.profilMinimal(compte, new Date());
  verifierChemins([p], compte.uid);
  await racine.set(p.donnees);
}

/**
 * Le cœur, sans HTTP : vérifie, puis agit. Rend { ok, ... } ou lève un
 * Refus. `fournirCle` remplace la clé (épreuves) ; `maintenant` aussi.
 */
async function gesteCompteTest({ uid, email: emailConnexion, projet, campagne, geste: demande, confirmation }, { fournirCle, attente } = {}) {
  if (!GESTES.includes(demande)) throw new Refus(400, 'Geste inconnu.');
  const geste = ALIAS[demande] || demande;
  const email = await compteAttribue({ uid, email: emailConnexion, projet, campagne });
  if (geste === 'zero' && confirmation !== CONFIRMATION_ZERO) throw new Refus(400, `Confirmation requise : tapez « ${CONFIRMATION_ZERO} ».`);
  const app = await appTest(fournirCle);
  const db = getFirestore(app);
  let u;
  try { u = await getAuth(app).getUserByEmail(email); } catch (e) { u = null; }
  if (!u || normaliserEmail(u.email) !== email) throw new Refus(404, `Aucun compte ${email} dans l'application de test. Créez-le d'abord en vous inscrivant dans l'application de test avec cette adresse, puis revenez ici.`);
  const profil = (await db.doc(`users/${u.uid}`).get()).data() || {};
  const morceaux = String(u.displayName || '').split(' ');
  const compte = { uid: u.uid, email, prenom: profil.firstName || morceaux[0] || 'Testeur', nom: profil.lastName || morceaux.slice(1).join(' ') || '' };

  if (geste === 'etat') {
    const abo = (await db.doc(`subscriptions/${compte.uid}`).get()).data();
    const taches = (await db.collection(`users/${compte.uid}/tasks`).count().get()).data().count;
    return { ok: true, geste, compte: email, acces: accesDe(abo), plan: planDe(abo), taches };
  }

  await prendreUnGeste(uid);
  try {
    verifierApp(app);
    if (ETATS_ACCES.includes(geste)) {
      const r = await demanderAcces(db, compte.uid, geste, attente ? { attente } : {});
      return { ok: true, geste, compte: email, applique: r.applique, acces: r.acces, plan: r.acces.etat === 'lecture_seule' ? 'free' : 'premium_ultra' };
    }
    if (geste === 'zero') {
      await remettreAZero(db, compte);
      /* Comme un compte neuf : lecture seule, écrite par le serveur de test pour que l'app la lise. */
      const r = await demanderAcces(db, compte.uid, 'lecture_seule', attente ? { attente } : {});
      return { ok: true, geste, compte: email, applique: r.applique, acces: r.acces, plan: 'free', taches: 0 };
    }
    const abo = (await db.doc(`subscriptions/${compte.uid}`).get()).data();
    const plan = planDe(abo);
    const docs = (geste === 'remplir-fond' ? donnees.remplirAFond : donnees.remplir)(compte, new Date(), plan);
    verifierChemins(docs, compte.uid);
    await ecrireParLots(db, docs);
    const usage = await recompter(db, compte.uid);
    const taches = (await db.collection(`users/${compte.uid}/tasks`).count().get()).data().count;
    return { ok: true, geste, compte: email, plan, documents: docs.length, taches, usage: { taches: usage.tasks, objectifs: usage.goals } };
  } finally {
    await rendreLeGeste(uid);
  }
}

exports._gesteCompteTest = gesteCompteTest;
exports._verifierCle = verifierCle;
exports._verifierApp = verifierApp;
exports._adresseValide = adresseValide;
exports._accesDe = accesDe;
exports.CONFIRMATION_ZERO = CONFIRMATION_ZERO;

exports.hubCompteTest = onRequest({ region: REGION, cors: true, secrets: [FORGEME_TEST_SA], invoker: 'public', timeoutSeconds: 300, memory: '512MiB' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return texte(res, 405, 'Method Not Allowed');
  let qui;
  try { qui = await acces.identifier(req); } catch (err) { return texte(res, err.code || 401, err.message || 'Connexion requise.'); }
  /* L'équipe agit depuis la console Firebase ou les scripts : ici, les testeurs seuls. */
  if (qui.fiche) return texte(res, 403, 'Réservé aux testeurs.');
  const { projet, campagne, geste, confirmation } = req.body || {};
  const trace = { testeur: qui.uid, projet: String(projet || '').slice(0, 128), campagne: String(campagne || '').slice(0, 128), geste: String(geste || '').slice(0, 20) };
  try {
    const r = await gesteCompteTest({ uid: qui.uid, email: qui.email, projet, campagne, geste, confirmation });
    if (geste !== 'etat') await audit('test.compte', { ...trace, compte: r.compte, plan: r.plan || null, acces: (r.acces && r.acces.etat) || null, documents: r.documents || 0 });
    return res.json(r);
  } catch (err) {
    if (err && err.refus) {
      await audit('test.compte.refus', { ...trace, code: err.code, motif: String(err.message || '').slice(0, 200) });
      return texte(res, err.code, err.message);
    }
    console.error('Geste sur le compte de test non abouti', err);
    await audit('test.compte.echec', trace);
    return texte(res, 500, 'Le geste n\'a pas abouti. Réessayez dans un instant.');
  }
});
