/* ==========================================================================
   CAPMEDIA CLIENT HUB · la clé d'accès (WebAuthn), de bout en bout

   Un authentificateur virtuel de Chromium (CDP) tient lieu de Touch ID.
   Camille entre par un code, l'espace lui propose la clé, elle ajoute cet
   appareil ; elle sort ; elle revient : son adresse suffit, la porte
   s'ouvre sans code. Puis les refus : une réponse forgée, une clé
   inconnue, une session absente. Enfin elle retire la clé et le code
   revient.

   Le domaine WebAuthn ne peut pas être une adresse IP : cette suite parle
   à http://localhost:8787 (BANC_SITE). Banc : émulateurs, site local,
   semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://localhost:8787';
const PORTE = 'http://127.0.0.1:5001/capmedia-1f90d/europe-west1/suiviConnexion';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const appeler = async (action, corps, jeton = '') => { const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) }, body: JSON.stringify({ action, ...corps }) }); let j = {}; try { j = await r.json(); } catch (e) { /* rien */ } return { code: r.status, ...j }; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  /* Le Touch ID du banc : un authentificateur interne, qui vérifie
     l'utilisateur et tient une clé résidente, comme un vrai. */
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const camille = 'camille.essai@exemple.test';
  await vider('cles'); await vider('defis'); await vider('envois'); await vider('connexions'); await vider('connexionsIp');

  console.log('\n== Entrer par un code, puis ajouter cet appareil');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', camille); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  verifier(true, 'sans clé, la porte demande un code, comme avant');
  await page.fill('#code', await dernierCode(camille));
  await page.waitForURL(/\/suivi\/hub/, { timeout: 40000 });
  await page.waitForSelector('#bouton-compte', { timeout: 20000 }); await pause(1500);
  const toast = await page.textContent('.toasts').catch(() => '');
  verifier(/sans code/.test(toast) && /Ajouter une clé/.test(toast), 'entrée par code : l espace propose une clé, une fois', toast.slice(0, 80));
  await page.click('.toast-geste'); await page.waitForSelector('[data-ajouter-cle]', { timeout: 10000 });
  await page.waitForFunction(() => !/Lecture/.test((document.querySelector('#cles-liste') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
  verifier(/Aucune clé pour l'instant/.test(await page.textContent('#cles-liste')), 'la feuille dit qu il n y a aucune clé');
  await page.click('[data-ajouter-cle]'); await pause(2500);
  const liste = await page.textContent('#cles-liste');
  verifier(/ajoutée le/.test(liste) && /jamais utilisée/.test(liste), 'l appareil est ajouté, daté, jamais utilisé', liste.slice(0, 100));
  const cles = ((await lire('cles?pageSize=10')) || {}).documents || [];
  verifier(cles.length === 1 && str(cles[0], 'email') === camille && Boolean(str(cles[0], 'publicKey')), 'le serveur garde la clé publique, l adresse, le compteur');
  const idCle = cles.length ? cles[0].name.split('/').pop() : '';
  const defis = ((await lire('defis?pageSize=10')) || {}).documents || [];
  verifier(defis.length === 0, 'le défi a été consommé');
  await page.keyboard.press('Escape'); await pause(400);

  console.log('\n== Sortir, revenir : l adresse suffit');
  await page.evaluate(() => { location.hash = '#/parametres'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForSelector('#cles-acces', { timeout: 15000 });
  verifier(await page.$('#cles-acces'), 'les paramètres ont un bouton « Gérer mes clés »');
  await page.click('#deconnexion'); await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await vider('envois');
  await page.fill('#email', camille); await page.click('#envoyer');
  await page.waitForURL(/\/suivi\/hub/, { timeout: 40000 }).catch(() => {});
  verifier(/\/suivi\/hub/.test(page.url()), 'la porte s ouvre par la clé, sans code', page.url());
  verifier((((await lire('envois?pageSize=50')) || {}).documents || []).filter((d) => str(d, 'modele') === 'code').length === 0, 'et aucun code n est parti');
  await page.waitForSelector('#bouton-compte', { timeout: 20000 }); await pause(1200);
  verifier(!/Ajouter une clé/.test(await page.textContent('.toasts').catch(() => '')), 'entrée par clé : rien n est proposé');
  const cle2 = await lire(`cles/${idCle}`);
  verifier(Boolean(champ(cle2, 'dernier').timestampValue), 'la clé est datée de son dernier usage');
  const audit = ((await lire('audit?pageSize=300')) || {}).documents || [];
  verifier(audit.some((d) => str(d, 'action') === 'connexion.ouverte' && str(d, 'mode') === 'cle'), 'l audit dit « connexion ouverte, mode clé »');

  console.log('\n== Les refus');
  const forge = await appeler('cleVerifier', { email: camille, reponse: { id: idCle, rawId: idCle, type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' } } });
  verifier(forge.code === 401 && !forge.lien, 'une réponse forgée sans défi est refusée', `${forge.code}`);
  const opt = await appeler('cleOptionsConnexion', { email: camille });
  verifier(opt.ok && opt.options && opt.options.allowCredentials.length === 1, 'les options de connexion listent sa clé');
  const forge2 = await appeler('cleVerifier', { email: camille, reponse: { id: idCle, rawId: idCle, type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' } } });
  verifier(forge2.code === 401 && !forge2.lien, 'une signature fausse sur un vrai défi est refusée', `${forge2.code}`);
  const inconnue = await appeler('cleOptionsConnexion', { email: 'personne@exemple.test' });
  verifier(inconnue.ok && inconnue.options === null, 'une adresse sans clé reçoit « pas de clé », rien de plus');
  const sansSession = await appeler('clesLister', {});
  verifier(sansSession.code === 401, 'lister les clés exige une session', `${sansSession.code}`);
  const sansSession2 = await appeler('cleRetirer', { id: idCle });
  verifier(sansSession2.code === 401 && (await lire(`cles/${idCle}`)).fields, 'retirer une clé exige une session, et la clé reste');

  console.log('\n== Retirer la clé : le code revient');
  await page.click('#bouton-compte'); await pause(400);
  await page.click('text=Clés d\'accès'); await page.waitForSelector('[data-retirer-cle]', { timeout: 10000 });
  await page.click('[data-retirer-cle]'); await pause(1500);
  verifier(/Aucune clé pour l'instant/.test(await page.textContent('#cles-liste')), 'la feuille ne liste plus rien');
  verifier(!((await lire(`cles/${idCle}`)) || {}).fields, 'la clé a disparu du serveur');
  await page.keyboard.press('Escape'); await pause(300);
  await page.click('#bouton-compte'); await pause(400); await page.click('text=Se déconnecter');
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await vider('envois');
  await page.fill('#email', camille); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  verifier(true, 'sans clé, la porte redemande un code');
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-cle-acces-echec.png' }); console.error('capture : /tmp/qa-cle-acces-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
