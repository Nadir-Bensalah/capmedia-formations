/* ==========================================================================
   CAPMEDIA CLIENT HUB · la porte d'entrée

   Le lien magique a un défaut qu'on ne peut pas corriger : il doit être
   ouvert dans le navigateur qui l'a demandé, parce que c'est là que
   l'adresse a été mise de côté. Ouvert depuis l'application de courrier,
   ou depuis le téléphone quand la demande venait de l'ordinateur, il
   échoue ou réclame de retaper l'adresse. D'où le code à six chiffres :
   on demande ici, on lit là-bas, on tape ici.

   Six chiffres, c'est un million de combinaisons. Ce n'est pas le code
   qui protège, ce sont les garde-fous autour :

     - dix minutes de validité, cinq essais, puis le code meurt ;
     - un seul usage, effacé dès qu'il a servi ;
     - trois demandes par quart d'heure et par adresse, et un plafond par
       adresse IP, pour qu'on ne puisse pas noyer une boîte ;
     - le code n'est jamais stocké en clair, seulement son empreinte
       salée : lire la base ne donne pas les codes en cours ;
     - la comparaison est à temps constant ;
     - la réponse est rigoureusement la même que l'adresse existe ou non ;
     - chaque demande et chaque essai laissent une trace dans l'audit.

   Un compte d'équipe suit les mêmes règles, en plus strict : cinq minutes,
   trois essais, et une alerte part à chaque ouverture de session.
   ========================================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('node:crypto');
const courriels = require('./courriels');
const invitations = require('./invitations');
const acces = require('./acces');
const cles = require('./cles');

const bdd = getFirestore();
const REGION = 'europe-west1';

/* --- Les réglages, en un seul endroit ----------------------------------- */
const REGLES = {
  client: { validite: 10 * 60 * 1000, essais: 5, parQuart: 3 },
  equipe: { validite: 5 * 60 * 1000, essais: 3, parQuart: 3 },
  /* Un testeur se connecte souvent, depuis un téléphone, entre deux
     scénarios : lui imposer la sévérité d'un compte d'équipe le bloquerait
     en pleine campagne. Il ne voit que son propre travail, le risque n'est
     pas le même. */
  testeur: { validite: 15 * 60 * 1000, essais: 5, parQuart: 4 },
};
const QUART = 15 * 60 * 1000;
const PLAFOND_IP = 12;            // demandes par quart d'heure et par adresse IP
const VIE_INVITATION = 14 * 24 * 3600 * 1000;

const normaliserEmail = (v) => String(v || '').trim().toLowerCase();
const emailPlausible = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliserEmail(v));

/* L'identifiant d'un document de connexion : l'adresse ne sert pas de clé,
   elle contient des caractères que Firestore refuse. */
const clePour = (email) => crypto.createHash('sha256').update(normaliserEmail(email)).digest('hex');

/* Le sel rend l'empreinte inutilisable ailleurs, et propre à cette demande. */
const empreinte = (code, sel) => crypto.createHash('sha256').update(`${sel}:${code}`).digest('hex');

/* Six chiffres tirés au sort par le générateur cryptographique, jamais par
   Math.random : un code devinable ne protège rien. */
const tirerCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/* Comparer sans laisser fuir le temps de réponse : une comparaison qui
   s'arrête au premier caractère faux se mesure, et se remonte. */
const memeEmpreinte = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
};

const ip = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

async function audit(action, details) {
  try {
    await bdd.collection('audit').add({ action, ...details, date: FieldValue.serverTimestamp() });
  } catch (err) { console.error('Audit non écrit', err); }
}

/* --- Le compte, et son rôle --------------------------------------------- */

/** Le compte Auth de cette adresse, s'il existe. Jamais créé ici. */
async function compteDe(email) {
  try { return await getAuth().getUserByEmail(normaliserEmail(email)); }
  catch (err) { if (err.code === 'auth/user-not-found') return null; throw err; }
}

async function estEquipe(uid) {
  try { const d = await bdd.doc(`equipe/${uid}`).get(); return d.exists && d.data().actif === true; }
  catch (err) { return false; }
}

/**
 * Ce que ce compte peut faire AUJOURD'HUI, lu dans la base au moment de la
 * demande, jamais dans le navigateur. C'est lui qui décide si un code part,
 * et vers quel espace la session mène.
 *
 *   { acces: true, espace: 'cockpit' | 'testeur' | 'hub' | 'attente' }
 *   { acces: false, motif: 'desactive' | 'retire' | 'sans-acces' }
 */
async function etatDuCompte(compte) {
  if (!compte) return { acces: false, motif: 'sans-acces' };
  const uid = compte.uid;
  const fiche = await bdd.doc(`equipe/${uid}`).get();
  if (fiche.exists) {
    return fiche.data().actif === true && !compte.disabled
      ? { acces: true, espace: 'cockpit', equipe: true }
      : { acces: false, motif: 'desactive' };
  }
  if (compte.disabled) return { acces: false, motif: 'desactive' };
  const testeur = await bdd.doc(`testeurs/${uid}`).get();
  if (testeur.exists && testeur.data().actif !== false) return { acces: true, espace: 'testeur', testeur: true };
  const membre = await bdd.collection('projets').where('membres', 'array-contains', uid).limit(1).get();
  if (!membre.empty) return { acces: true, espace: 'hub' };
  const demande = await bdd.collection('demandesProjet').where('par.uid', '==', uid).limit(1).get();
  if (!demande.empty) return { acces: true, espace: 'hub' };
  /* Préparé sur un projet encore fermé : il entre, et l'espace lui dit
     qu'il n'est pas encore ouvert. */
  const prepare = await bdd.collection('projets').where('personnes', 'array-contains', uid).limit(1).get();
  if (!prepare.empty) return { acces: true, espace: 'attente' };
  return { acces: false, motif: testeur.exists ? 'retire' : 'sans-acces' };
}

/* Un testeur vit dans le vivier, à la racine : il sert sur plusieurs
   projets sans qu'on lui refasse un compte. Sa fiche porte la liste des
   projets où il est inscrit, et c'est elle qui fonde son accès. */
async function estTesteur(uid) {
  try { const d = await bdd.doc(`testeurs/${uid}`).get(); return d.exists && d.data().actif !== false; }
  catch (err) { return false; }
}

/* --- Le plafond par adresse IP ------------------------------------------ */
async function ipSaturee(adresse) {
  if (!adresse) return false;
  const cle = crypto.createHash('sha256').update(adresse).digest('hex');
  const ref = bdd.doc(`connexionsIp/${cle}`);
  try {
    return await bdd.runTransaction(async (t) => {
      const d = await t.get(ref);
      const maintenant = Date.now();
      const brut = d.exists ? d.data() : {};
      const depuis = brut.depuis && brut.depuis.toMillis ? brut.depuis.toMillis() : 0;
      const neuf = !depuis || maintenant - depuis > QUART;
      const n = neuf ? 1 : Number(brut.n || 0) + 1;
      t.set(ref, { n, depuis: neuf ? FieldValue.serverTimestamp() : brut.depuis || FieldValue.serverTimestamp() }, { merge: true });
      return n > PLAFOND_IP;
    });
  } catch (err) { console.error('Plafond IP illisible', err); return false; }
}

/* ==========================================================================
   La fonction publique
   ========================================================================== */

exports.suiviConnexion = onRequest(
  { region: REGION, cors: true, secrets: [] },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { action } = req.body || {};
    /* Ce que les clés d'accès empruntent à la porte : le compte, l'accès
       du moment, l'ouverture de session, l'audit. */
    const outils = { compteDe, etatDuCompte, ouvrirSession, audit, ip, clePour, normaliserEmail, emailPlausible };
    try {
      if (action === 'invitation') return await lireInvitation(req, res);
      if (action === 'demanderCode') return await demanderCode(req, res);
      if (action === 'verifierCode') return await verifierCode(req, res);
      if (action === 'cleOptionsConnexion') return await cles.optionsConnexion(req, res, outils);
      if (action === 'cleVerifier') return await cles.verifier(req, res, outils);
      if (action === 'cleOptionsEnregistrement') return await cles.optionsEnregistrement(req, res, outils);
      if (action === 'cleEnregistrer') return await cles.enregistrer(req, res, outils);
      if (action === 'clesLister') return await cles.lister(req, res, outils);
      if (action === 'cleRetirer') return await cles.retirer(req, res, outils);
      return res.status(400).json({ ok: false, message: 'action inconnue' });
    } catch (err) {
      if (err && err.refus) return res.status(err.code).json({ ok: false, message: err.message });
      console.error('Porte d entrée :', err);
      return res.status(500).json({ ok: false, message: 'Une erreur est survenue. Réessayez dans un instant.' });
    }
  },
);

/* --- 1. Le lien d'invitation -------------------------------------------- */

/**
 * Le client arrive par le lien que l'admin lui a envoyé. On lui rend son
 * adresse, pour qu'il n'ait pas à la retaper, et le nom du projet pour
 * qu'il sache où il atterrit. Un jeton inconnu ou périmé ne dit rien de
 * plus qu'un jeton valide sur une adresse inconnue.
 */
async function lireInvitation(req, res) {
  const inv = await invitations.lire(String((req.body || {}).jeton || '').trim());
  if (!inv) return res.json({ ok: false });
  return res.json({ ok: true, email: inv.email || '', nom: inv.nom || '', projet: inv.projet || '' });
}

/* --- 2. La demande de code ----------------------------------------------- */

async function demanderCode(req, res) {
  const email = normaliserEmail((req.body || {}).email);
  const adresseIp = ip(req);
  /* La réponse est la même dans tous les cas de figure, sauf saturation
     évidente : dire « cette adresse est inconnue » renseigne un curieux
     sur qui est client de la maison. */
  const muet = () => res.json({ ok: true, envoye: true });

  if (!emailPlausible(email)) return res.status(400).json({ ok: false, message: "Cette adresse a l'air incomplète." });
  if (await ipSaturee(adresseIp)) {
    await audit('connexion.plafond-ip', { email, ip: adresseIp });
    return res.status(429).json({ ok: false, message: 'Trop de demandes depuis ce réseau. Patientez un quart d heure.' });
  }

  const compte = await compteDe(email);
  if (!compte) { await audit('connexion.inconnue', { email, ip: adresseIp }); return muet(); }

  /* Un compte désactivé, retiré ou sans aucun accès ne reçoit pas de code,
     et la réponse ne le dit pas : elle est la même que pour une adresse
     inconnue. Le motif reste dans l'audit. */
  const etat = await etatDuCompte(compte);
  if (!etat.acces) { await audit('connexion.refusee', { email, uid: compte.uid, motif: etat.motif, ip: adresseIp }); return muet(); }

  const equipe = etat.equipe === true;
  const testeur = etat.testeur === true;
  const regles = equipe ? REGLES.equipe : (testeur ? REGLES.testeur : REGLES.client);

  const ref = bdd.doc(`connexions/${clePour(email)}`);
  const maintenant = Date.now();
  const code = tirerCode();
  const sel = crypto.randomBytes(16).toString('hex');

  const trop = await bdd.runTransaction(async (t) => {
    const d = await t.get(ref);
    const brut = d.exists ? d.data() : {};
    const fenetre = brut.fenetre && brut.fenetre.toMillis ? brut.fenetre.toMillis() : 0;
    const neuve = !fenetre || maintenant - fenetre > QUART;
    const envois = neuve ? 1 : Number(brut.envois || 0) + 1;
    if (envois > regles.parQuart) return true;
    t.set(ref, {
      email, uid: compte.uid, equipe, testeur,
      empreinte: empreinte(code, sel), sel,
      expire: new Date(maintenant + regles.validite),
      essais: 0, essaisMax: regles.essais,
      envois, fenetre: neuve ? new Date(maintenant) : brut.fenetre,
      demande: FieldValue.serverTimestamp(), ip: adresseIp,
    }, { merge: true });
    return false;
  });

  if (trop) {
    await audit('connexion.trop-de-demandes', { email, ip: adresseIp });
    return res.status(429).json({ ok: false, message: 'Trois codes ont déjà été envoyés. Patientez un quart d heure.' });
  }

  await bdd.collection('envois').add({
    modele: 'code',
    a: [{ email, nom: compte.displayName || '' }],
    variables: { code, minutes: Math.round(regles.validite / 60000), equipe },
    etat: 'attente', erreur: null, essais: 0, cree: FieldValue.serverTimestamp(), envoye: null,
  });
  await audit('connexion.code-demande', { email, uid: compte.uid, equipe, ip: adresseIp });
  return muet();
}

/* --- 3. La vérification -------------------------------------------------- */

async function verifierCode(req, res) {
  const email = normaliserEmail((req.body || {}).email);
  const code = String((req.body || {}).code || '').replace(/\D/g, '');
  const adresseIp = ip(req);
  const refus = (message) => res.status(401).json({ ok: false, message });

  if (!emailPlausible(email) || code.length !== 6) return refus('Code incomplet.');

  const ref = bdd.doc(`connexions/${clePour(email)}`);
  /* Tout se joue dans une transaction : sans elle, deux essais lancés en
     même temps partageraient le même compteur et six chiffres deviendraient
     devinables à coups de requêtes parallèles. */
  const verdict = await bdd.runTransaction(async (t) => {
    const d = await t.get(ref);
    if (!d.exists) return { etat: 'aucun' };
    const c = d.data();
    const expire = c.expire && c.expire.toMillis ? c.expire.toMillis() : 0;
    if (!c.empreinte || !expire || Date.now() > expire) { t.update(ref, { empreinte: null, sel: null }); return { etat: 'perime' }; }
    const essais = Number(c.essais || 0) + 1;
    if (essais > Number(c.essaisMax || 5)) { t.update(ref, { empreinte: null, sel: null }); return { etat: 'brule' }; }
    if (!memeEmpreinte(c.empreinte, empreinte(code, c.sel || ''))) {
      t.update(ref, { essais });
      return { etat: 'faux', restants: Math.max(0, Number(c.essaisMax || 5) - essais) };
    }
    /* Bon code : il meurt ici, il ne servira pas deux fois. */
    t.update(ref, { empreinte: null, sel: null, essais: 0, ouverte: FieldValue.serverTimestamp() });
    return { etat: 'bon', uid: c.uid, equipe: c.equipe === true, testeur: c.testeur === true };
  });

  if (verdict.etat !== 'bon') {
    await audit('connexion.echec', { email, ip: adresseIp, motif: verdict.etat });
    if (verdict.etat === 'brule') return refus('Trop d essais. Demandez un nouveau code.');
    if (verdict.etat === 'perime' || verdict.etat === 'aucun') return refus('Ce code a expiré. Demandez-en un nouveau.');
    return refus(verdict.restants ? `Code incorrect. Il vous reste ${verdict.restants} essai${verdict.restants > 1 ? 's' : ''}.` : 'Code incorrect.');
  }

  /* Le code est bon : la suite est la même que pour une clé d'accès. */
  return ouvrirSession({ uid: verdict.uid, email, adresseIp, res, mode: 'code' });
}

/* --- 4. L'ouverture de session, commune au code et à la clé ------------- */

/**
 * L'identité est prouvée (code ou clé). L'accès, lui, se relit MAINTENANT :
 * entre la demande et la preuve, le compte a pu être désactivé ou retiré.
 * Ni un code ni une clé ne rouvrent une porte qu'on vient de fermer.
 */
async function ouvrirSession({ uid, email, adresseIp, res, mode }) {
  const verdict = { uid };
  let compte = null;
  try { compte = await getAuth().getUser(verdict.uid); } catch (err) { compte = null; }
  const etat = await etatDuCompte(compte);
  if (!etat.acces) {
    await audit('connexion.refusee', { email, uid: verdict.uid, motif: etat.motif, ip: adresseIp, apresCode: true, mode });
    return res.status(403).json({ ok: false, message: etat.motif === 'desactive'
      ? 'Cet accès a été désactivé. Contactez Capmedia si vous pensez que c\'est une erreur.'
      : "Aucun accès n'est ouvert pour cette adresse. Contactez Capmedia." });
  }
  verdict.equipe = etat.equipe === true;
  verdict.testeur = etat.testeur === true;

  /* L'adresse est prouvée : on le dit à Firebase, ce qui vaut aussi pour
     les règles de sécurité, qui exigent une adresse vérifiée. */
  try { await getAuth().updateUser(verdict.uid, { emailVerified: true }); } catch (err) { console.error('Adresse non marquée vérifiée', err); }

  /*
   * La session s'ouvre par un lien à usage unique que la page consomme
   * tout de suite : il ne part jamais par courriel, il ne s'affiche
   * jamais, il ne sort pas de la réponse à cette requête.
   *
   * Un jeton personnalisé aurait fait la même chose, mais il exige que le
   * compte de service ait le droit de signer un JWT, droit absent ici et
   * qu'il faudrait demander à la console. Le lien passe par le même
   * service d'identité, sans aucune permission supplémentaire, et Firebase
   * le brûle après usage. À garanties égales, on prend la voie qui ne
   * dépend de rien.
   */
  /* La revendication « testeur » vit dans le jeton, parce que c'est lui que
     les règles Firestore lisent. Elle se pose AVANT de fabriquer le lien :
     posée après, le jeton en cours ne la porterait pas et le testeur
     arriverait devant un écran vide sans comprendre pourquoi.

     On la retire aussi quand elle n'a plus lieu d'être : un testeur sorti
     du vivier garderait sinon son accès jusqu'à sa prochaine connexion. */
  /* setCustomUserClaims REMPLACE la totalité des revendications. Poser
     « testeur » seul effaçait donc « equipe » et « projets », les deux que
     lisent les règles de stockage : après chaque connexion, déposer une
     capture dans une demande ou joindre un PDF à un devis était refusé,
     sans le moindre message. On relit donc ce qui existe, et on ne touche
     qu'à « testeur ». */
  try {
    const gardees = { ...((compte && compte.customClaims) || {}) };
    delete gardees.testeur;
    await getAuth().setCustomUserClaims(verdict.uid, verdict.testeur ? { ...gardees, testeur: true } : gardees);
    /* Puis l'équipe et les projets, relus dans la base (testeur gardé). */
    await acces.poserRevendications(verdict.uid);
  } catch (err) {
    console.error('Revendication non posée', err);
    await audit('connexion.revendication-impossible', { email, uid: verdict.uid });
  }

  let lien;
  try {
    lien = await getAuth().generateSignInWithEmailLink(email, { url: `${courriels.BASE}`, handleCodeInApp: true });
  } catch (err) {
    console.error('Lien de session impossible', err);
    await audit('connexion.session-impossible', { email, uid: verdict.uid, motif: String(err && err.message || err).slice(0, 200) });
    return res.status(500).json({ ok: false, message: "Le code était bon, mais la session n'a pas pu s'ouvrir. Prévenez-nous." });
  }
  await audit('connexion.ouverte', { email, uid: verdict.uid, equipe: verdict.equipe, espace: etat.espace, ip: adresseIp, mode });

  /* Une première connexion consomme les invitations de ce compte : le
     cockpit les voit « acceptées », et leur lien ne pré-remplit plus. */
  try { await invitations.accepter(verdict.uid); } catch (err) { console.error('Invitations non marquées acceptées', err); }

  /* Une session d'équipe ouvre le cockpit de tous les projets : elle
     s'annonce, pour qu'une ouverture qu'on n'a pas faite se remarque. */
  if (verdict.equipe) {
    await bdd.collection('envois').add({
      modele: 'connexion-equipe',
      a: [{ email, nom: '' }],
      variables: { quand: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), ip: adresseIp },
      etat: 'attente', erreur: null, essais: 0, cree: FieldValue.serverTimestamp(), envoye: null,
    });
  }

  /* Combien de clés d'accès ce compte a déjà : la page propose d'en
     ajouter une après un code, pas après une clé, et pas deux fois. */
  let nombreCles = 0;
  try { nombreCles = (await cles.clesDe(verdict.uid)).length; } catch (err) { nombreCles = 0; }

  return res.json({ ok: true, lien, espace: etat.espace, mode, cles: nombreCles });
}

/* --- Exposé pour l'épreuve ----------------------------------------------- */
exports._outils = { clePour, empreinte, tirerCode, memeEmpreinte, emailPlausible, REGLES, VIE_INVITATION, estTesteur, etatDuCompte };
