/* ==========================================================================
   CAPMEDIA CLIENT HUB · les clés d'accès (WebAuthn)

   Le code à six chiffres reste la porte de tout le monde. La clé d'accès
   est la porte rapide de qui l'a voulue : Touch ID sur Mac, Windows Hello,
   la clé du trousseau dans un navigateur. Une clé est une paire : la
   privée ne quitte jamais l'appareil, la publique vit ici, dans « cles »,
   avec son compteur d'usage. Le serveur ne fait confiance qu'à une
   signature du défi qu'il vient de tirer (« defis », deux minutes), pour
   l'origine et le domaine attendus, et relit l'accès du compte au moment
   d'ouvrir : une clé n'ouvre pas plus qu'un code.

   Enregistrer une clé demande une session ouverte (jeton vérifié) :
   c'est la preuve que l'adresse est à celui qui enrôle l'appareil.
   ========================================================================== */

const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const acces = require('./acces');
const { Refus } = require('./commun');

const bdd = getFirestore();
const SUR_BANC = process.env.FUNCTIONS_EMULATOR === 'true' && Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/* Le domaine et l'origine : le site en production, le banc en local. Une
   adresse IP ne peut pas être un domaine WebAuthn : le banc se sert par
   « localhost ». */
const RP = SUR_BANC
  ? { nom: 'Capmedia (banc)', id: 'localhost', origines: ['http://localhost:8787', 'http://localhost:8788'] }
  : { nom: 'Capmedia', id: 'capmedia.app', origines: ['https://capmedia.app'] };

const VIE_DEFI = 2 * 60 * 1000;
const MAX_CLES = 10;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const deB64 = (s) => new Uint8Array(Buffer.from(String(s || ''), 'base64'));
const enMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : (v instanceof Date ? v.getTime() : 0));

async function clesDe(uid) {
  const q = await bdd.collection('cles').where('uid', '==', uid).get();
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const vueCle = (c) => ({ id: c.id, appareil: c.appareil || '', cree: enMillis(c.cree) || null, dernier: enMillis(c.dernier) || null, sauvegardee: c.sauvegardee === true });

async function poserDefi(cle, donnees) {
  await bdd.doc(`defis/${cle}`).set({ ...donnees, expire: new Date(Date.now() + VIE_DEFI), cree: FieldValue.serverTimestamp() });
}

/* Un défi ne sert qu'une fois : lu, puis effacé, dans la même transaction. */
async function prendreDefi(cle) {
  const ref = bdd.doc(`defis/${cle}`);
  return bdd.runTransaction(async (t) => {
    const d = await t.get(ref);
    if (!d.exists) return null;
    t.delete(ref);
    const v = d.data();
    if (!v.defi || Date.now() > enMillis(v.expire)) return null;
    return v;
  });
}

/* ==========================================================================
   1. Enregistrer une clé (session ouverte)
   ========================================================================== */

async function optionsEnregistrement(req, res, o) {
  const qui = await acces.identifier(req);
  const compte = await getAuth().getUser(qui.uid);
  const existantes = await clesDe(qui.uid);
  if (existantes.length >= MAX_CLES) throw new Refus(400, `Dix clés au plus par compte. Retirez-en une d'abord.`);
  const options = await generateRegistrationOptions({
    rpName: RP.nom, rpID: RP.id,
    userName: qui.email, userDisplayName: compte.displayName || qui.email,
    userID: new TextEncoder().encode(qui.uid),
    attestationType: 'none',
    excludeCredentials: existantes.map((c) => ({ id: c.id, transports: c.transports || undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await poserDefi(`enr_${qui.uid}`, { defi: options.challenge, uid: qui.uid, genre: 'enregistrement' });
  await o.audit('cle.options-enregistrement', { uid: qui.uid, email: qui.email, ip: o.ip(req) });
  return res.json({ ok: true, options });
}

async function enregistrer(req, res, o) {
  const qui = await acces.identifier(req);
  const { reponse, appareil } = req.body || {};
  if (!reponse || typeof reponse !== 'object' || !reponse.id) throw new Refus(400, 'Réponse de la clé incomplète.');
  const defi = await prendreDefi(`enr_${qui.uid}`);
  if (!defi || defi.uid !== qui.uid) throw new Refus(400, 'Le délai est passé. Recommencez l\'ajout de la clé.');
  let verdict;
  try {
    verdict = await verifyRegistrationResponse({ response: reponse, expectedChallenge: defi.defi, expectedOrigin: RP.origines, expectedRPID: RP.id, requireUserVerification: false });
  } catch (err) {
    await o.audit('cle.enregistrement-refuse', { uid: qui.uid, motif: String(err && err.message || err).slice(0, 200) });
    throw new Refus(400, 'Cette clé n\'a pas pu être vérifiée.');
  }
  if (!verdict.verified || !verdict.registrationInfo) throw new Refus(400, 'Cette clé n\'a pas pu être vérifiée.');
  const { credential, credentialBackedUp } = verdict.registrationInfo;
  const fiche = {
    uid: qui.uid, email: qui.email,
    publicKey: b64(credential.publicKey), counter: credential.counter || 0,
    transports: Array.isArray(credential.transports) ? credential.transports : [],
    appareil: String(appareil || '').slice(0, 80), sauvegardee: credentialBackedUp === true,
    cree: FieldValue.serverTimestamp(), dernier: null,
  };
  await bdd.doc(`cles/${credential.id}`).set(fiche);
  await o.audit('cle.enregistree', { uid: qui.uid, email: qui.email, cle: credential.id.slice(0, 12), appareil: fiche.appareil, ip: o.ip(req) });
  return res.json({ ok: true, cle: vueCle({ id: credential.id, ...fiche, cree: new Date() }) });
}

async function lister(req, res) {
  const qui = await acces.identifier(req);
  const cles = await clesDe(qui.uid);
  return res.json({ ok: true, cles: cles.map(vueCle).sort((a, b) => (b.cree || 0) - (a.cree || 0)) });
}

async function retirer(req, res, o) {
  const qui = await acces.identifier(req);
  const id = String((req.body || {}).id || '');
  const d = id ? await bdd.doc(`cles/${id}`).get() : null;
  if (!d || !d.exists || d.data().uid !== qui.uid) throw new Refus(404, 'Cette clé n\'existe pas.');
  await d.ref.delete();
  await o.audit('cle.retiree', { uid: qui.uid, email: qui.email, cle: id.slice(0, 12), ip: o.ip(req) });
  return res.json({ ok: true });
}

/* ==========================================================================
   2. Se connecter avec une clé (aucune session)
   ========================================================================== */

/* Les clés de cette adresse, s'il y en a. Sans clé, on le dit : la page
   demande alors un code. Ce que cela révèle (cette adresse a une clé) ne
   vaut pas grand-chose ; ce que cela évite (une invite Touch ID sans
   rien derrière) vaut beaucoup. */
async function optionsConnexion(req, res, o) {
  const email = o.normaliserEmail((req.body || {}).email);
  if (!o.emailPlausible(email)) throw new Refus(400, "Cette adresse a l'air incomplète.");
  const compte = await o.compteDe(email);
  const cles = compte ? await clesDe(compte.uid) : [];
  if (!cles.length) return res.json({ ok: true, options: null });
  const options = await generateAuthenticationOptions({
    rpID: RP.id, userVerification: 'preferred',
    allowCredentials: cles.map((c) => ({ id: c.id, transports: c.transports && c.transports.length ? c.transports : undefined })),
  });
  await poserDefi(`cnx_${o.clePour(email)}`, { defi: options.challenge, uid: compte.uid, genre: 'connexion' });
  return res.json({ ok: true, options });
}

async function verifier(req, res, o) {
  const email = o.normaliserEmail((req.body || {}).email);
  const reponse = (req.body || {}).reponse;
  const adresseIp = o.ip(req);
  const refus = (message) => res.status(401).json({ ok: false, message });
  if (!o.emailPlausible(email) || !reponse || typeof reponse !== 'object' || !reponse.id) return res.status(400).json({ ok: false, message: 'Réponse de la clé incomplète.' });

  const defi = await prendreDefi(`cnx_${o.clePour(email)}`);
  if (!defi) { await o.audit('connexion.cle-echec', { email, ip: adresseIp, motif: 'defi' }); return refus('Le délai est passé. Réessayez.'); }
  const d = await bdd.doc(`cles/${String(reponse.id)}`).get();
  if (!d.exists || d.data().uid !== defi.uid) { await o.audit('connexion.cle-echec', { email, ip: adresseIp, motif: 'cle-inconnue' }); return refus('Cette clé n\'est pas connue pour cette adresse.'); }
  const cle = d.data();
  let verdict;
  try {
    verdict = await verifyAuthenticationResponse({
      response: reponse, expectedChallenge: defi.defi, expectedOrigin: RP.origines, expectedRPID: RP.id,
      credential: { id: d.id, publicKey: deB64(cle.publicKey), counter: Number(cle.counter || 0), transports: cle.transports || undefined },
      requireUserVerification: false,
    });
  } catch (err) {
    await o.audit('connexion.cle-echec', { email, ip: adresseIp, motif: String(err && err.message || err).slice(0, 200) });
    return refus('La clé n\'a pas pu être vérifiée. Demandez un code.');
  }
  if (!verdict.verified) { await o.audit('connexion.cle-echec', { email, ip: adresseIp, motif: 'signature' }); return refus('La clé n\'a pas pu être vérifiée. Demandez un code.'); }
  await d.ref.update({ counter: verdict.authenticationInfo.newCounter, dernier: FieldValue.serverTimestamp() });

  /* La clé prouve l'appareil ; l'accès, lui, se relit maintenant, comme
     après un code : un compte retiré ne rouvre rien, clé ou pas. */
  return o.ouvrirSession({ uid: defi.uid, email, adresseIp, res, mode: 'cle' });
}

module.exports = { optionsEnregistrement, enregistrer, lister, retirer, optionsConnexion, verifier, clesDe, RP };
