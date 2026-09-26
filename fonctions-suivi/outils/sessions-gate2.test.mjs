/* ==========================================================================
   CAPMEDIA CLIENT HUB · les anciennes sessions (préflight Gate 2)

   Une session DÉJÀ OUVERTE, avec le SDK web comme le navigateur (jeton en
   cache, écoutes Firestore en cours), puis on retire l'accès côté serveur.
   Sans se déconnecter ni se reconnecter, plus rien ne doit passer :

     - l'écoute ouverte ne reçoit plus les changements suivants ;
     - une nouvelle lecture, une nouvelle écriture : refusées ;
     - la fonction HTTP du serveur, avec l'ancien jeton : refusée ;
     - le stockage : ni lecture, ni dépôt ;
     - les notifications : plus aucune.

   Deux cas : un agent désactivé, un collaborateur retiré d'un projet.

     (émulateurs avec les fonctions, semis du banc)
     node fonctions-suivi/outils/sessions-gate2.test.mjs
   ========================================================================== */

import { barriere } from './lib/barriere.mjs';
import { createRequire } from 'node:module';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as bddAdmin, FieldValue } from 'firebase-admin/firestore';
import { getAuth as authAdmin } from 'firebase-admin/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, addDoc, collection, onSnapshot, query, where, serverTimestamp, terminate } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadString, getBytes } from 'firebase/storage';

const require = createRequire(import.meta.url);
const { appelAdmin, uidDe, FONCTIONS } = require('./lib/session-banc.cjs');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initAdmin({ projectId: PROJET, storageBucket: `${PROJET}.firebasestorage.app` });
const bdd = bddAdmin();

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 240)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const compteurs = async () => `${(await bdd.collection('envois').count().get()).data().count}/${(await bdd.collectionGroup('notifications').count().get()).data().count}/${(await bdd.collection('activite').count().get()).data().count}`;
/* Attendre que les déclencheurs aient TOUT servi : une barrière (état
   observable), pas une durée au jugé (voir lib/barriere.mjs). */
const calme = () => barriere({ bdd });
/* Attendre qu'une écoute ait vu un état, ou constater qu'elle ne le voit pas. */
const attendre = async (cond, n = 20) => { for (let i = 0; i < n; i += 1) { if (cond()) return true; await pause(300); } return cond(); };
const refuse = async (p) => { try { await p; return false; } catch (e) { return /permission|unauthorized|403/i.test(`${e.code} ${e.message}`); } };
const notifs = async (uid) => (await bdd.collection(`boites/${uid}/notifications`).get()).size;

/* Une session web, comme celle du navigateur : jeton en cache, écoutes. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ouvrirSession = async (email, nom) => {
  const uid = await uidDe(email);
  /* Comme une vraie personne : la porte par code (qui vérifie l'adresse et
     pose les revendications du jeton), puis la session du SDK web. */
  for (const c of ['connexions', 'connexionsIp']) for (const d of (await bdd.collection(c).get()).docs) await d.ref.delete();
  const porte = (corps) => fetch(`${FONCTIONS}/suiviConnexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then((r) => r.json());
  await porte({ action: 'demanderCode', email });
  await calme();
  const code = (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.map((d) => d.data()).filter((d) => d.a[0].email === email)
    .sort((x, y) => (y.cree ? y.cree.toMillis() : 0) - (x.cree ? x.cree.toMillis() : 0))[0];
  const v = await porte({ action: 'verifierCode', email, code: code && code.variables.code });
  if (!v.ok) throw new Error(`porte refusée pour ${email} : ${JSON.stringify(v)}`);
  await authAdmin().updateUser(uid, { emailVerified: true });
  const app = initializeApp({ apiKey: 'cle-du-banc', projectId: PROJET, storageBucket: `${PROJET}.firebasestorage.app` }, nom);
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app); const [h, p] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); connectFirestoreEmulator(db, h, Number(p));
  const st = getStorage(app); const [sh, sp] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':'); connectStorageEmulator(st, sh, Number(sp));
  const t = Math.floor(Date.now() / 1000);
  const jeton = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: t, exp: t + 3600, uid })}.`;
  await signInWithCustomToken(auth, jeton);
  const idToken = await auth.currentUser.getIdToken(true);
  return { app, auth, db, st, uid, idToken };
};
const serveur = (idToken, action, corps = {}) => fetch(`${FONCTIONS}/suiviAdmin`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ action, ...corps }) }).then((r) => r.status);

const AGENT = 'ses.agent@exemple.test';
const RESP = 'ses.resp@exemple.test';
const COLLAB = 'ses.collab@exemple.test';

const cree = await appelAdmin('creerProjet', { ref: 'SESG2', nom: 'Sessions Gate 2', client: { nom: 'Rose', email: RESP, entreprise: 'Société S' },
  interlocuteurs: [{ email: RESP, nom: 'Rose', role: 'responsable' }, { email: COLLAB, nom: 'Colin', role: 'collaborateur' }] });
const pid = cree.json.id;
await appelAdmin('ouvrirAuClient', { id: pid });
await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Aline', role: 'agent', projets: [pid] });
await calme();
const tid = (await appelAdmin('creerDemande', { projet: pid, titre: 'Une demande', description: 'x', type: 'bug' })).json.id;
await bdd.collection('fichiers').doc('ses-fichier').set({ projet: pid, nom: 'a.png', chemin: `projets/${pid}/fichiers/ses-fichier/a.png`, visibilite: 'client', archive: false, cree: FieldValue.serverTimestamp() });
const { getStorage: stAdmin } = await import('firebase-admin/storage');
await stAdmin().bucket().file(`projets/${pid}/fichiers/ses-fichier/a.png`).save(Buffer.from('x'), { contentType: 'image/png' });
await calme();

for (const [titre, email, retirer, quiEcrit] of [
  ['Un agent désactivé', AGENT, async (uid) => appelAdmin('desactiverEquipe', { uid }), 'equipe'],
  ['Un collaborateur retiré du projet', COLLAB, async () => appelAdmin('retirerInterlocuteur', { projet: pid, email: COLLAB }), 'client'],
]) {
  console.log(`\n== ${titre}, session déjà ouverte`);
  const s = await ouvrirSession(email, `session-${quiEcrit}`);
  const vu = { projet: [], demandes: [], erreurs: [] };
  const arret1 = onSnapshot(doc(s.db, 'projets', pid), (x) => vu.projet.push(String((x.data() || {}).description || '')), (e) => vu.erreurs.push(`projet:${e.code}`));
  const arret2 = onSnapshot(query(collection(s.db, 'tickets'), where('projet', '==', pid)), (x) => vu.demandes.push(x.size), (e) => vu.erreurs.push(`demandes:${e.code}`));
  verifier(await attendre(() => vu.projet.length > 0 && vu.demandes.length > 0), 'avant : ses écoutes reçoivent le projet et ses demandes');
  verifier((await getDoc(doc(s.db, 'tickets', tid))).exists(), 'avant : il lit une demande');
  const de = { uid: s.uid, nom: email, cote: quiEcrit };
  verifier(Boolean(await addDoc(collection(s.db, 'projets', pid, 'messages'), { de, texte: 'Avant.', pieces: [], date: serverTimestamp() })), 'avant : il écrit dans la conversation');
  verifier(Boolean(await getBytes(ref(s.st, `projets/${pid}/fichiers/ses-fichier/a.png`))), 'avant : il télécharge un fichier du projet');
  const statutAvant = await serveur(s.idToken, 'moi');
  verifier(quiEcrit === 'equipe' ? statutAvant === 200 : statutAvant === 403, `avant : le serveur le reconnaît (${statutAvant})`);
  const n0 = await notifs(s.uid);
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'autre', nom: 'Autre', cote: quiEcrit === 'equipe' ? 'client' : 'equipe' }, texte: 'Pour vous.', pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  verifier((await notifs(s.uid)) > n0, 'avant : il est notifié');

  await retirer(s.uid);
  await calme();

  /* Sans se déconnecter : le jeton en cache est toujours valable une heure. */
  const nProjet = vu.projet.length; const nDemandes = vu.demandes.length;
  await bdd.doc(`projets/${pid}`).update({ description: 'Changé après le retrait' });
  await appelAdmin('creerDemande', { projet: pid, titre: 'Après le retrait', description: 'y', type: 'bug' });
  await attendre(() => vu.erreurs.length >= 2, 15);
  verifier(!vu.projet.slice(nProjet).some((x) => /après le retrait/i.test(x)), 'après : l écoute ouverte ne reçoit pas le changement suivant', JSON.stringify(vu));
  verifier(vu.demandes.length === nDemandes || vu.erreurs.some((e) => e.startsWith('demandes:')), 'ni la nouvelle demande', JSON.stringify(vu));
  verifier(vu.erreurs.some((e) => /permission-denied/.test(e)), `les écoutes sont coupées par les règles (${vu.erreurs.join(', ')})`);
  verifier(await refuse(getDoc(doc(s.db, 'tickets', tid))), 'après : une nouvelle lecture est refusée');
  verifier(await refuse(addDoc(collection(s.db, 'projets', pid, 'messages'), { de, texte: 'Après.', pieces: [], date: serverTimestamp() })), 'après : une nouvelle écriture est refusée');
  verifier(await refuse(getBytes(ref(s.st, `projets/${pid}/fichiers/ses-fichier/a.png`))), 'après : le stockage refuse le téléchargement');
  verifier(await refuse(uploadString(ref(s.st, `projets/${pid}/fichiers/ses-neuf/b.png`), 'x', 'raw', { contentType: 'image/png' })), 'et le dépôt');
  const statutApres = await serveur(s.idToken, quiEcrit === 'equipe' ? 'moi' : 'creerDemande', { projet: pid, titre: 'x' });
  verifier(statutApres === 401 || statutApres === 403, `après : le serveur refuse l ancien jeton (${statutApres})`);
  const n1 = await notifs(s.uid);
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'autre', nom: 'Autre', cote: quiEcrit === 'equipe' ? 'client' : 'equipe' }, texte: 'Encore pour vous ?', pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  verifier((await notifs(s.uid)) === n1, 'après : plus aucune notification');
  arret1(); arret2();
  await terminate(s.db); await deleteApp(s.app);
}

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
