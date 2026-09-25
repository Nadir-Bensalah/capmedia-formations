/* ==========================================================================
   CAPMEDIA CLIENT HUB · une session du banc, sans navigateur

   Depuis la Gate 2, la fonction suiviAdmin ne connaît plus de clé
   partagée : elle lit le jeton Firebase de la personne qui appelle, et
   décide d'après son rôle. Les suites et les outils du banc appellent
   donc AU NOM de quelqu'un, comme le cockpit.

   Sur l'émulateur d'authentification, un jeton se fabrique sans rien
   signer : un jeton personnalisé non signé, échangé contre un jeton
   d'identité. Ce fichier refuse de parler à autre chose qu'un émulateur
   local : il ne peut pas ouvrir de session sur la production.

     const { appelAdmin, jetonPour } = require('./lib/session-banc.cjs');
     await appelAdmin('creerProjet', { ref: 'ESSAI', nom: 'Essai' });
     await appelAdmin('ajouterEquipe', { ... }, { email: 'autre.admin@exemple.test' });
   ========================================================================== */

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const HOTE_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const AUTH = `http://${HOTE_AUTH}`;
const FONCTIONS = `http://127.0.0.1:5001/${PROJET}/europe-west1`;
/* L'administrateur du jeu de données (semer-suivi.mjs). */
const ADMIN_BANC = process.env.ADMIN_BANC || 'agent.essai@exemple.test';

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOTE_AUTH)) {
  throw new Error(`session-banc : ${HOTE_AUTH} n'est pas un émulateur local. Aucune session hors du banc.`);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** L'uid d'une adresse sur l'émulateur, ou null. */
async function uidDe(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ email: [String(email).trim().toLowerCase()] }),
  });
  const j = await r.json().catch(() => ({}));
  return ((j.users || [])[0] || {}).localId || null;
}

/**
 * Un jeton d'identité neuf pour une adresse qui a un compte. Une vraie
 * personne passe par le code à six chiffres, qui prouve son adresse : on
 * marque donc l'adresse vérifiée, comme le fait la porte d'entrée, sans
 * toucher à rien d'autre (un compte suspendu le reste).
 */
async function jetonPour(email) {
  const uid = await uidDe(email);
  if (!uid) throw new Error(`session-banc : aucun compte pour ${email}`);
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  const maintenant = Math.floor(Date.now() / 1000);
  const perso = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com',
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: maintenant, exp: maintenant + 3600, uid,
  })}.`;
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=cle-du-banc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: perso, returnSecureToken: true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.idToken) throw new Error(`session-banc : session impossible pour ${email} (${JSON.stringify(j).slice(0, 160)})`);
  return j.idToken;
}

/**
 * Appelle suiviAdmin au nom d'une personne (l'administrateur du banc par
 * défaut). Rend { code, texte, json }.
 */
async function appelAdmin(action, corps = {}, { email = ADMIN_BANC, jeton = null } = {}) {
  const j = jeton || (email ? await jetonPour(email) : '');
  const r = await fetch(`${FONCTIONS}/suiviAdmin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(j ? { Authorization: `Bearer ${j}` } : {}) },
    body: JSON.stringify({ action, ...corps }),
  });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { json = null; }
  return { code: r.status, texte, json };
}

module.exports = { jetonPour, appelAdmin, uidDe, ADMIN_BANC, FONCTIONS, PROJET };
