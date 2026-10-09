/* ==========================================================================
   CAPMEDIA TEST · le compte ForgeMe de test d'un testeur

   Depuis son espace, un testeur agit sur LE compte de test que l'équipe
   lui a attribué (campagnes/{c}/acces/{uid}.compteTest), et sur lui seul :

     etat          lire le plan et le nombre de tâches (ne compte pas)
     gratuit       revenir au plan gratuit
     premium       passer en Premium (plan manuel, comme adminSetUserPlan)
     ultra         passer en Premium Ultra
     remplir       un compte de tous les jours, fictif, en français
     remplir-fond  1 500 tâches et le reste en proportion (rapidité)
     zero          tout vider : le compte, son profil minimal, le plan gratuit
                   (confirmation « REMETTRE A ZERO » exigée)

   Les écritures partent dans le projet Firebase forgeme-test, et nulle part
   ailleurs, par une seconde application Admin initialisée avec la clé du
   secret FORGEME_TEST_SA. Gardes dures, dans cet ordre :

     1. l'appelant est un testeur actif, la campagne lui est confiée, elle
        est en cours et son accès court encore ;
     2. le compte visé est celui que l'équipe LUI a attribué, une adresse
        fictive @exemple.test, attribuée à personne d'autre sur la campagne ;
     3. la clé vise exactement le projet forgeme-test (project_id et adresse
        du compte de service), et l'application ouverte aussi ;
     4. vingt gestes par heure et par testeur, un seul à la fois ;
     5. chaque document écrit est sous users/{uid du compte} ou est
        subscriptions/{uid du compte}.

   Rien du testeur ne part dans forgeme-test : ni son adresse, ni son uid.
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
const DOMAINE_FICTIF = '@exemple.test';
const COMPTE_VALIDE = /^[a-z0-9._+-]{1,64}@exemple\.test$/;
const PLAFOND_HEURE = 20;
const VERROU_MS = 5 * 60 * 1000;
const CONFIRMATION_ZERO = 'REMETTRE A ZERO';
const FIN_ILLIMITEE = new Date('2099-12-31T23:59:59Z');
const GESTES = ['etat', 'gratuit', 'premium', 'ultra', 'remplir', 'remplir-fond', 'zero'];
const PLANS = { gratuit: 'free', premium: 'premium', ultra: 'premium_ultra' };
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

/** L'adresse du compte de test attribuée, ou null si elle n'est pas fictive. */
const compteFictif = (v) => {
  const e = normaliserEmail(v);
  return COMPTE_VALIDE.test(e) && e.endsWith(DOMAINE_FICTIF) ? e : null;
};

/**
 * Le compte que l'équipe a attribué à CE testeur sur CETTE campagne.
 * Lève un refus lisible sinon.
 */
async function compteAttribue({ uid, projet, campagne }) {
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
  const brut = sien ? (sien.data() || {}).compteTest : '';
  if (!brut) throw new Refus(404, 'Aucun compte de test ne vous est encore attribué. Écrivez à l\'équipe.');
  const email = compteFictif(brut);
  if (!email) throw new Refus(403, 'Ce compte n\'est pas un compte de test : l\'équipe doit le corriger.');
  const autres = tous.docs.filter((d) => d.id !== uid && normaliserEmail((d.data() || {}).compteTest) === email);
  if (autres.length) throw new Refus(409, 'Ce compte de test est attribué à deux testeurs : l\'équipe doit le corriger.');
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

/** Le plan effectif, comme l'application le lit. */
const planDe = (abo) => {
  if (!abo) return 'free';
  const fin = enMillis(abo.endDate);
  return ['active', 'trialing'].includes(abo.status) && fin > Date.now() ? (abo.plan || 'free') : 'free';
};

async function poserPlan(db, uidCompte, cle) {
  const plan = PLANS[cle];
  const ref = db.doc(`subscriptions/${uidCompte}`);
  verifierChemins([{ chemin: ref.path }], uidCompte);
  const maintenant = FieldValue.serverTimestamp();
  const payload = plan === 'free'
    ? { plan: 'free', status: 'expired', platform: 'manual', renewalType: null, trialUsed: true, willRenew: false,
      endDate: Timestamp.now(), updatedAt: maintenant, manualOverride: FieldValue.delete(), grantedBy: FieldValue.delete(), grantedAt: FieldValue.delete() }
    : { plan, status: 'active', platform: 'manual', renewalType: null, trialUsed: true, willRenew: false,
      startDate: Timestamp.now(), endDate: Timestamp.fromDate(FIN_ILLIMITEE), updatedAt: maintenant,
      manualOverride: true, grantedBy: 'capmedia-test', grantedAt: maintenant };
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    t.set(ref, s.exists ? payload : { ...payload, createdAt: maintenant }, { merge: true });
  });
  return plan;
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
async function gesteCompteTest({ uid, projet, campagne, geste, confirmation }, { fournirCle } = {}) {
  if (!GESTES.includes(geste)) throw new Refus(400, 'Geste inconnu.');
  const email = await compteAttribue({ uid, projet, campagne });
  if (geste === 'zero' && confirmation !== CONFIRMATION_ZERO) throw new Refus(400, `Confirmation requise : tapez « ${CONFIRMATION_ZERO} ».`);
  const app = await appTest(fournirCle);
  const db = getFirestore(app);
  let u;
  try { u = await getAuth(app).getUserByEmail(email); } catch (e) { u = null; }
  if (!u || normaliserEmail(u.email) !== email) throw new Refus(404, 'Ce compte de test n\'existe pas encore dans le projet de test. Écrivez à l\'équipe.');
  const profil = (await db.doc(`users/${u.uid}`).get()).data() || {};
  const morceaux = String(u.displayName || '').split(' ');
  const compte = { uid: u.uid, email, prenom: profil.firstName || morceaux[0] || 'Testeur', nom: profil.lastName || morceaux.slice(1).join(' ') || '' };

  if (geste === 'etat') {
    const abo = (await db.doc(`subscriptions/${compte.uid}`).get()).data();
    const taches = (await db.collection(`users/${compte.uid}/tasks`).count().get()).data().count;
    return { ok: true, geste, compte: email, plan: planDe(abo), taches };
  }

  await prendreUnGeste(uid);
  try {
    verifierApp(app);
    if (PLANS[geste]) return { ok: true, geste, compte: email, plan: await poserPlan(db, compte.uid, geste) };
    if (geste === 'zero') {
      await remettreAZero(db, compte);
      return { ok: true, geste, compte: email, plan: 'free', taches: 0 };
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
exports._compteFictif = compteFictif;
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
    const r = await gesteCompteTest({ uid: qui.uid, projet, campagne, geste, confirmation });
    if (geste !== 'etat') await audit('test.compte', { ...trace, compte: r.compte, plan: r.plan || null, documents: r.documents || 0 });
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
