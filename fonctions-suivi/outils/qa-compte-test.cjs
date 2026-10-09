/* ==========================================================================
   CAPMEDIA TEST · « Mon compte de test », vu du testeur et du serveur

   Le banc émule DEUX projets dans les mêmes émulateurs : le Hub
   (capmedia-1f90d) et le projet de test de ForgeMe (forgeme-test). La
   fonction hubCompteTest lit sa clé dans _banc/compteTest (une fausse clé
   tirée ici) au lieu du secret, et son application Admin parle à
   l'émulateur sous forgeme-test. Un troisième projet, forgeme-project (la
   production de ForgeMe), sert de témoin : rien ne doit jamais y arriver.

     A  les six gestes sur le compte de Karim, chacun relu dans forgeme-test
     B  Karim ne peut viser que SON compte (celui de Sonia reste intact)
     C  la garde du projet : une clé qui vise un autre projet est refusée
     D  le plafond (vingt par heure) et le verrou (un geste à la fois)
     E  rien sans campagne en cours, sans compte attribué, ni pour l'équipe
     F  l'écran : la boîte, les boutons, la confirmation, la feuille du
        scénario avec son geste, la détection
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const admin = require('../node_modules/firebase-admin');

const HUB = 'capmedia-1f90d';
const PID = 'atelier'; const CID = 'c-oct';
const URL_FN = `${BANC.fonctions}/${HUB}/europe-west1/hubCompteTest`;
const BDD = `${BANC.firestore}/v1/projects/${HUB}/databases/(default)/documents`;
const prop = { Authorization: 'Bearer owner' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

admin.initializeApp({ projectId: HUB });
const hub = admin.firestore(); const hubAuth = admin.auth();
const ft = admin.initializeApp({ projectId: 'forgeme-test' }, 'ft');
const ftDb = ft.firestore(); const ftAuth = ft.auth();
const prod = admin.initializeApp({ projectId: 'forgeme-project' }, 'prod');
const prodDb = prod.firestore();

/* Une fausse clé de compte de service : une vraie paire RSA, tirée ici. */
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const fausseCle = (projet, domaine = projet) => JSON.stringify({ type: 'service_account', project_id: projet, private_key_id: `banc-${projet}-${domaine}`, private_key: privateKey, client_email: `banc@${domaine}.iam.gserviceaccount.com`, client_id: '1' });
const poserCle = (cle) => hub.doc('_banc/compteTest').set({ cle });

/* Le jeton d'un utilisateur du banc : un jeton personnalisé non signé, que
   l'émulateur d'authentification accepte. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jetonDe = async (uid) => {
  const t = Math.floor(Date.now() / 1000);
  const perso = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: t, exp: t + 3600, uid })}.`;
  const r = await (await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=banc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: perso, returnSecureToken: true }) })).json();
  return r.idToken;
};
const appel = async (jeton, corps) => {
  const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify({ projet: PID, campagne: CID, ...corps }) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* texte */ }
  return { code: r.status, j, t };
};
const nb = async (chemin) => (await ftDb.collection(chemin).count().get()).data().count;
const abo = async (uid) => (await ftDb.doc(`subscriptions/${uid}`).get()).data() || null;
const viderGestes = async (uid) => hub.doc(`compteTestGestes/${uid}`).delete();
const code = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await (await fetch(`${BDD}/envois?pageSize=200`, { headers: prop })).json(); const d = (j.documents || []).filter((x) => (x.fields.modele || {}).stringValue === 'code' && JSON.stringify(x.fields.a).includes(e)).sort((a, b) => new Date(b.fields.cree.timestampValue) - new Date(a.fields.cree.timestampValue))[0]; if (d) return d.fields.variables.mapValue.fields.code.stringValue; await pause(300); } return ''; };

let page = null;
(async () => {
  /* ---------- Le décor ---------- */
  const uidDe = async (e) => (await hubAuth.getUserByEmail(e)).uid;
  const karim = await uidDe('karim.testeur@essai.test');
  const sonia = await uidDe('sonia.testeur@essai.test');
  const marc = await uidDe('marc.testeur@essai.test');
  const refC = hub.doc(`projets/${PID}/campagnes/${CID}`);
  await refC.collection('acces').doc(karim).set({ identifiants: 'karim@exemple.test · Test-1', compteTest: 'karim@exemple.test', maj: new Date() });
  await refC.collection('acces').doc(sonia).set({ identifiants: 'sonia@exemple.test · Test-2', compteTest: 'sonia@exemple.test', maj: new Date() });
  await refC.collection('acces').doc(marc).delete();
  await refC.update({ fins: {}, gestesCompte: admin.firestore.FieldValue.delete() });
  await poserCle(fausseCle('forgeme-test'));
  for (const u of [karim, sonia, marc]) await viderGestes(u);
  for (const [uid, email, prenom] of [['ft-karim', 'karim@exemple.test', 'Karim'], ['ft-sonia', 'sonia@exemple.test', 'Sonia']]) {
    try { await ftAuth.deleteUser(uid); } catch (e) { /* absent */ }
    await ftAuth.createUser({ uid, email, emailVerified: true, displayName: `${prenom} Test`, password: 'Banc-Test-1' });
    await ftDb.recursiveDelete(ftDb.doc(`users/${uid}`));
    await ftDb.doc(`subscriptions/${uid}`).delete();
    await ftDb.doc(`users/${uid}`).set({ uid, email, firstName: prenom, lastName: 'Test', profileCompleted: true, onboardingCompleted: true });
  }
  await ftDb.doc('users/ft-sonia/tasks/temoin').set({ userId: 'ft-sonia', title: 'La tâche de Sonia', status: 'pending', isArchived: false });
  const jk = await jetonDe(karim); const js = await jetonDe(sonia); const jm = await jetonDe(marc);
  verifier(jk && js && jm, 'les jetons de Karim, Sonia et Marc sont tirés');

  console.log('\n== A. Les six gestes sur le compte de Karim');
  let r = await appel(jk, { geste: 'etat' });
  verifier(r.code === 200 && r.j.plan === 'free' && r.j.taches === 0 && r.j.compte === 'karim@exemple.test', 'état : son compte, gratuit, aucune tâche', r.t.slice(0, 120));
  r = await appel(jk, { geste: 'premium' });
  let a = await abo('ft-karim');
  verifier(r.code === 200 && a && a.plan === 'premium' && a.status === 'active' && a.manualOverride === true && a.platform === 'manual', 'Premium : subscriptions/{uid} actif, manuel, manualOverride (la forme d adminSetUserPlan)', JSON.stringify(a || r.t).slice(0, 160));
  verifier(a && a.endDate && a.endDate.toDate().getUTCFullYear() === 2099, 'Premium sans fin (31/12/2099), comme le plan manuel');
  verifier(a && !JSON.stringify(a).includes('essai.test') && !JSON.stringify(a).includes(karim), 'rien du testeur n est parti dans forgeme-test (ni son adresse, ni son uid)');
  r = await appel(jk, { geste: 'ultra' }); a = await abo('ft-karim');
  verifier(r.code === 200 && a.plan === 'premium_ultra' && a.status === 'active', 'Ultra : premium_ultra actif');
  r = await appel(jk, { geste: 'gratuit' }); a = await abo('ft-karim');
  verifier(r.code === 200 && a.plan === 'free' && a.status === 'expired' && a.manualOverride === undefined, 'Gratuit : plan free, expiré, sans manualOverride');
  r = await appel(jk, { geste: 'remplir' });
  const comptes = {};
  for (const c of ['tasks', 'subtasks', 'rituals', 'ritual_completions', 'goals', 'subgoals', 'journals', 'importantDates', 'trips', 'ideas', 'quickNotes', 'shoppingLists', 'user_data', 'data_values']) comptes[c] = await nb(`users/ft-karim/${c}`);
  verifier(r.code === 200 && Object.values(comptes).every((n) => n > 0), `Remplir : toutes les collections reçoivent des données (${JSON.stringify(comptes)})`, r.t.slice(0, 120));
  const uneTache = (await ftDb.collection('users/ft-karim/tasks').limit(1).get()).docs[0].data();
  verifier(uneTache.userId === 'ft-karim' && typeof uneTache.title === 'string' && uneTache.scheduledDate, 'une tâche porte le modèle de l app (userId, titre, date)');
  const usage = (await ftDb.doc('users/ft-karim/stats/usage').get()).data() || {};
  verifier(usage.tasks > 0 && usage.ideas === comptes.ideas, `les compteurs d usage sont recomptés (${usage.tasks} tâches en cours, ${usage.ideas} idées)`);
  const profil = (await ftDb.doc('users/ft-karim').get()).data() || {};
  verifier(profil.firstName === 'Karim' && profil.onboardingCompleted === true, 'le profil garde son prénom, l accueil passé');
  r = await appel(jk, { geste: 'remplir' });
  verifier(r.code === 200 && (await nb('users/ft-karim/tasks')) === comptes.tasks, 'un second Remplir réécrit sans doubler');
  const t0 = Date.now();
  r = await appel(jk, { geste: 'remplir-fond' });
  const nt = await nb('users/ft-karim/tasks');
  const archivees = (await ftDb.collection('users/ft-karim/tasks').where('isArchived', '==', true).count().get()).data().count;
  verifier(r.code === 200 && nt >= 1500 && archivees === 400, `Remplir à fond : ${nt} tâches dont ${archivees} archivées, en ${Math.round((Date.now() - t0) / 1000)} s`, r.t.slice(0, 120));
  verifier((await nb('users/ft-karim/ideas')) >= 80 && (await nb('users/ft-karim/journals')) >= 120, 'et le reste en proportion (80 idées, 120 journaux)');
  r = await appel(jk, { geste: 'zero' });
  verifier(r.code === 400 && (await nb('users/ft-karim/tasks')) === nt, 'Remettre à zéro sans confirmation : refusé, rien d effacé', r.t);
  r = await appel(jk, { geste: 'zero', confirmation: 'REMETTRE A ZERO' });
  const restes = (await ftDb.doc('users/ft-karim').listCollections()).map((c) => c.id);
  const p2 = (await ftDb.doc('users/ft-karim').get()).data() || {};
  verifier(r.code === 200 && restes.length === 0, `Remettre à zéro : plus aucune collection sous le compte (${restes.join(', ') || 'aucune'})`, r.t.slice(0, 120));
  verifier(p2.email === 'karim@exemple.test' && p2.firstName === 'Karim' && p2.onboardingCompleted === false && !p2.onboardingAnswers, 'le compte reste, profil minimal, accueil à refaire');
  verifier(!(await abo('ft-karim')), 'et plus d abonnement : gratuit');
  try { await ftAuth.getUser('ft-karim'); verifier(true, 'le compte d authentification est gardé'); } catch (e) { verifier(false, 'le compte d authentification est gardé'); }

  console.log('\n== B. Karim ne vise que son compte');
  r = await appel(jk, { geste: 'premium', compte: 'sonia@exemple.test', uid: 'ft-sonia', email: 'sonia@exemple.test' });
  verifier(r.code === 200 && r.j.compte === 'karim@exemple.test' && !(await abo('ft-sonia')), 'nommer le compte de Sonia dans la demande ne change rien : c est le sien qui bouge');
  verifier((await nb('users/ft-sonia/tasks')) === 1, 'la tâche de Sonia est intacte après tous les gestes de Karim');
  await refC.collection('acces').doc(karim).update({ compteTest: 'sonia@exemple.test' });
  r = await appel(jk, { geste: 'remplir' });
  verifier(r.code === 409 && (await nb('users/ft-sonia/tasks')) === 1, 'un compte attribué à deux testeurs est refusé (409)', `${r.code} ${r.t}`);
  await refC.collection('acces').doc(karim).update({ compteTest: 'karim.vrai@gmail.com' });
  r = await appel(jk, { geste: 'premium' });
  verifier(r.code === 403, 'une adresse qui n est pas @exemple.test est refusée (403)', `${r.code} ${r.t}`);
  await refC.collection('acces').doc(karim).update({ compteTest: 'personne@exemple.test' });
  r = await appel(jk, { geste: 'premium' });
  verifier(r.code === 404, 'un compte absent du projet de test : 404, rien de créé', `${r.code} ${r.t}`);
  await refC.collection('acces').doc(karim).update({ compteTest: 'karim@exemple.test' });
  r = await appel(jm, { geste: 'premium' });
  verifier(r.code === 404 && /attribu/.test(r.t), 'Marc, sans compte attribué : 404, il est invité à écrire à l équipe', `${r.code} ${r.t}`);
  r = await appel(js, { geste: 'ultra' });
  verifier(r.code === 200 && (await abo('ft-sonia')).plan === 'premium_ultra' && (await abo('ft-karim')).plan === 'premium', 'Sonia agit sur le sien, celui de Karim ne bouge pas');

  console.log('\n== C. La garde du projet');
  await poserCle(fausseCle('forgeme-project'));
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 503 && (await abo('ft-karim')).plan === 'premium', 'une clé de forgeme-project est refusée (503), rien n est écrit', `${r.code} ${r.t}`);
  verifier(!(await prodDb.doc('subscriptions/ft-karim').get()).exists && (await prodDb.collection('users').limit(1).get()).empty, 'et rien n arrive dans forgeme-project');
  await poserCle(fausseCle('forgeme-project', 'forgeme-test'));
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 503, 'un project_id forgeme-project est refusé, même avec un compte de service de forgeme-test', `${r.code} ${r.t}`);
  await poserCle(fausseCle('forgeme-test', 'forgeme-project'));
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 503, 'un compte de service d un autre projet est refusé, même avec project_id forgeme-test', `${r.code} ${r.t}`);
  await poserCle('pas une clé');
  r = await appel(jk, { geste: 'etat' });
  verifier(r.code === 503, 'une clé illisible : 503, le compte n est pas branché', `${r.code} ${r.t}`);
  await poserCle(fausseCle('forgeme-test'));

  console.log('\n== D. Le plafond et le verrou');
  const maintenant = Date.now();
  await hub.doc(`compteTestGestes/${karim}`).set({ instants: Array.from({ length: 19 }, (_, i) => maintenant - (i + 1) * 60000), enCours: null });
  r = await appel(jk, { geste: 'gratuit' });
  verifier(r.code === 200, 'le vingtième geste de l heure passe');
  r = await appel(jk, { geste: 'premium' });
  verifier(r.code === 429 && (await abo('ft-karim')).plan === 'free', 'le vingt et unième est refusé (429), rien n est écrit', `${r.code} ${r.t}`);
  r = await appel(jk, { geste: 'etat' });
  verifier(r.code === 200, 'lire l état ne compte pas dans le plafond');
  await hub.doc(`compteTestGestes/${karim}`).set({ instants: Array.from({ length: 20 }, (_, i) => maintenant - 2 * 3600e3 - i * 1000), enCours: null });
  r = await appel(jk, { geste: 'premium' });
  verifier(r.code === 200, 'les gestes de plus d une heure ne comptent plus');
  await hub.doc(`compteTestGestes/${karim}`).set({ instants: [], enCours: admin.firestore.Timestamp.now() });
  r = await appel(jk, { geste: 'gratuit' });
  verifier(r.code === 409, 'un geste déjà en cours : le suivant attend (409)', `${r.code} ${r.t}`);
  await viderGestes(karim);
  const auditOk = (await hub.collection('audit').where('action', '==', 'test.compte').get()).docs.map((d) => d.data());
  const auditRefus = (await hub.collection('audit').where('action', '==', 'test.compte.refus').get()).docs.map((d) => d.data());
  verifier(auditOk.some((x) => x.testeur === karim && x.geste === 'remplir-fond' && x.compte === 'karim@exemple.test'), `chaque geste est journalisé (${auditOk.length} gestes)`);
  verifier(auditRefus.some((x) => x.testeur === karim && x.code === 429) && auditRefus.some((x) => x.code === 503), `et chaque refus aussi (${auditRefus.length})`);

  console.log('\n== E. Rien sans campagne en cours');
  await refC.update({ statut: 'preparation' });
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 403 && (await abo('ft-karim')).plan === 'premium', 'campagne en préparation : 403', `${r.code} ${r.t}`);
  await refC.update({ statut: 'terminee' });
  r = await appel(jk, { geste: 'etat' });
  verifier(r.code === 403, 'campagne terminée : 403, même pour lire');
  await refC.update({ statut: 'en-cours', [`fins.${karim}`]: new Date(Date.now() - 60000) });
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 403, 'accès du testeur clos : 403');
  await refC.update({ fins: {} });
  r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jk}` }, body: JSON.stringify({ projet: PID, campagne: 'c-inconnue', geste: 'ultra' }) });
  verifier(r.status === 404, 'une campagne inconnue : 404');
  await hub.doc(`testeurs/${karim}`).update({ actif: false });
  r = await appel(jk, { geste: 'ultra' });
  verifier(r.code === 403, 'un testeur retiré du vivier : 403');
  await hub.doc(`testeurs/${karim}`).update({ actif: true });
  const equipe = (await hub.collection('equipe').where('role', '==', 'admin').limit(1).get()).docs[0];
  if (equipe) {
    const je = await jetonDe(equipe.id);
    r = await appel(je, { geste: 'ultra' });
    verifier(r.code === 403 && /testeurs/.test(r.t), 'une personne de l équipe : 403, réservé aux testeurs', `${r.code} ${r.t}`);
    /* Les règles : l'équipe attribue le compte depuis le Cockpit (le même
       document que les identifiants), une adresse fictive seulement. */
    const ecrireAcces = (compteTest) => fetch(`${BDD}/projets/${PID}/campagnes/${CID}/acces/${marc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${je}` },
      body: JSON.stringify({ fields: { identifiants: { stringValue: 'marc@exemple.test · Test-3' }, compteTest: { stringValue: compteTest }, maj: { timestampValue: new Date().toISOString() } } }) }).then((x) => x.status);
    verifier((await ecrireAcces('marc@exemple.test')) === 200, 'l équipe attribue un compte @exemple.test (règles)');
    verifier((await ecrireAcces('marc@gmail.com')) === 403, 'les règles refusent une adresse qui n est pas fictive');
    verifier((await fetch(`${BDD}/projets/${PID}/campagnes/${CID}/acces/${marc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jm}` }, body: JSON.stringify({ fields: { compteTest: { stringValue: 'sonia@exemple.test' } } }) })).status === 403, 'un testeur ne s attribue pas un compte lui-même');
    await refC.collection('acces').doc(marc).delete();
  } else verifier(false, 'une fiche d équipe admin existe au banc');
  r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projet: PID, campagne: CID, geste: 'ultra' }) });
  verifier(r.status === 401, 'sans jeton : 401');
  r = await appel(jk, { geste: 'supprimer-tout' });
  verifier(r.code === 400, 'un geste inconnu : 400');

  console.log('\n== F. L écran du testeur');
  await viderGestes(karim);
  await ftDb.doc('subscriptions/ft-karim').delete();
  const nav = await chromium.launch();
  page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  for (const c of ['connexions', 'connexionsIp']) { const j = await (await fetch(`${BDD}/${c}?pageSize=300`, { headers: prop })).json(); for (const d of (j.documents || [])) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); }
  await page.goto(`${BANC.site}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', 'karim.testeur@essai.test'); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await code('karim.testeur@essai.test'));
  await page.waitForURL(/testeur/, { timeout: 40000 });
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 25000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('[data-continuer]', { timeout: 25000 });
  await page.evaluate(() => { location.hash = '#/application'; });
  await page.waitForSelector('[data-compte-test]', { timeout: 20000 }).catch(() => null);
  verifier(await page.$('[data-compte-test]'), 'la page L application montre « Mon compte de test »');
  await page.waitForFunction(() => /Plan actuel/.test((document.querySelector('[data-compte-etat]') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => null);
  verifier(/karim@exemple\.test/.test(await page.textContent('[data-compte-test]')), 'avec l adresse de SON compte de test');
  verifier(/Plan actuel : Gratuit/.test(await page.textContent('[data-compte-etat]')), `et son état : ${(await page.textContent('[data-compte-etat]')).trim()}`);
  const libelles = await page.$$eval('[data-compte-test] [data-compte-geste]', (l) => l.map((b) => b.textContent.trim()));
  verifier(libelles.join('|') === 'Gratuit|Premium|Ultra|Remplir mon compte|Remplir à fond|Remettre à zéro', `six boutons, dans l ordre (${libelles.join('|')})`);
  verifier((await page.getAttribute('[data-compte-test] [data-compte-geste="gratuit"]', 'aria-pressed')) === 'true', 'le plan en vigueur est enfoncé');
  const html = await page.innerHTML('[data-compte-test]');
  verifier(!/—/.test(html) && !/<svg/.test(html), 'ni tiret cadratin, ni pictogramme dans la boîte');
  await page.click('[data-compte-test] [data-compte-geste="premium"]');
  await page.waitForFunction(() => /Plan actuel : Premium/.test((document.querySelector('[data-compte-etat]') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => null);
  verifier((await abo('ft-karim') || {}).plan === 'premium', 'cliquer Premium passe SON compte en Premium dans forgeme-test');
  verifier(/Plan actuel : Premium/.test(await page.textContent('[data-compte-etat]')), 'et la boîte le dit aussitôt');
  await page.click('[data-compte-test] [data-compte-geste="remplir"]');
  await page.waitForFunction(() => /Plan actuel : Premium · [1-9]/.test((document.querySelector('[data-compte-etat]') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => null);
  verifier((await nb('users/ft-karim/tasks')) > 0, `Remplir mon compte remplit (${await nb('users/ft-karim/tasks')} tâches)`);
  await page.click('[data-compte-test] [data-compte-geste="zero"]');
  await page.waitForSelector('[data-oui]');
  verifier(/Remettre votre compte à zéro/.test(await page.textContent('.modale')), 'Remettre à zéro demande confirmation');
  await page.click('[data-non]'); await pause(800);
  verifier((await nb('users/ft-karim/tasks')) > 0, 'Annuler ne touche à rien');
  await page.click('[data-compte-test] [data-compte-geste="zero"]'); await page.waitForSelector('[data-oui]'); await page.click('[data-oui]');
  await page.waitForFunction(() => /Plan actuel : Gratuit · 0/.test((document.querySelector('[data-compte-etat]') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => null);
  verifier((await nb('users/ft-karim/tasks')) === 0 && !(await abo('ft-karim')), 'confirmer vide le compte et le remet en gratuit');

  /* La feuille d'un scénario : la table de la campagne impose un geste. */
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('[data-continuer]');
  const ref = await page.getAttribute('[data-continuer]', 'data-continuer');
  await refC.update({ gestesCompte: { [ref]: ['remplir-fond', 'ultra'] } });
  await pause(2500);
  await page.click('[data-continuer]');
  await page.waitForSelector('.modale--scenario', { timeout: 10000 }).catch(() => null);
  const bloc = await page.$('.modale--scenario [data-compte-scenario]');
  const textesBloc = bloc ? await bloc.textContent() : '';
  verifier(bloc && /Remplissez à fond votre compte pour ce test/.test(textesBloc) && /Passez en Ultra pour ce test/.test(textesBloc), 'la feuille du scénario montre ses gestes, imposés par la table', textesBloc.slice(0, 160));
  if (bloc) {
    await page.click('.modale--scenario [data-compte-geste="ultra"]');
    for (let i = 0; i < 20 && (((await abo('ft-karim')) || {}).plan !== 'premium_ultra'); i += 1) await pause(500);
    verifier(((await abo('ft-karim')) || {}).plan === 'premium_ultra', 'et le bouton agit depuis la feuille');
    verifier(await page.$('.modale--scenario'), 'sans fermer la feuille');
  }
  await page.keyboard.press('Escape'); await pause(400);

  /* La détection, sur des scénarios rédigés comme ceux du plan. */
  const det = await page.evaluate(async () => {
    const m = await import('/suivi/assets/js/compte-test.js');
    const b = (titre, etapes = '', attendu = '') => m.besoinsDuScenario({ id: `x-${titre}`, titre, etapes, attendu }).join('+');
    return {
      premium: b('Créer un voyage illimité', 'Avec un compte Premium, créer un sixième voyage'),
      ultra: b('Module Données', 'Compte abonné Premium Ultra : ouvrir les statistiques'),
      limite: b('Limites d abonnement', 'Atteindre la limite du plan gratuit'),
      souscrire: b('Souscrire', 'Ouvrir l écran des offres et souscrire à Premium'),
      neuf: b('Premier lancement', 'Avec un compte neuf, ouvrir l application'),
      charge: b('Rapidité', 'Sur un compte chargé de 1 500 tâches, ouvrir la liste'),
      rien: b('Changer la langue', 'Réglages, puis Langue'),
      table: m.besoinsDuScenario({ id: 'x', titre: 'Premium' }, { gestesCompte: { x: [] } }).length,
    };
  });
  verifier(det.premium === 'premium', `« compte Premium » propose Premium (${det.premium})`);
  verifier(det.ultra === 'ultra', `« Premium Ultra » propose Ultra, pas les deux (${det.ultra})`);
  verifier(det.limite === 'gratuit', `« limite du plan gratuit » propose Gratuit (${det.limite})`);
  verifier(det.souscrire === 'gratuit', `souscrire part du gratuit (${det.souscrire})`);
  verifier(det.neuf === 'zero', `« compte neuf » propose la remise à zéro (${det.neuf})`);
  verifier(det.charge === 'remplir-fond', `« 1 500 tâches » propose Remplir à fond (${det.charge})`);
  verifier(det.rien === '', `un scénario sans besoin ne montre rien (${det.rien || 'rien'})`);
  verifier(det.table === 0, 'une liste vide dans la table fait taire la détection');
  verifier(!erreurs.length, `aucune erreur de page${erreurs.length ? ` : ${erreurs[0]}` : ''}`);
  await nav.close();

  console.log(`\n${ok} ok, ${ecarts.length} ÉCART(S)`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.log(`  ÉCART  la suite a planté : ${e.message}`);
  process.exit(1);
});
