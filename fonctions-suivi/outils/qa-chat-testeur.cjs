/* ==========================================================================
   CAPMEDIA CLIENT HUB · la bulle du testeur et la page Testeurs du Cockpit

   Karim écrit depuis la bulle en bas à droite ; l'équipe reçoit une
   notification, une lettre, et voit la conversation dans « Testeurs » avec
   le compte des non lus ; elle répond ; Karim voit la réponse en direct,
   sa pastille, sa notification, et une lettre part. Deux navigateurs,
   tout en même temps.

   Banc : émulateurs, site local, semer-suivi puis semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { if (await fn()) return true; await pause(ms); } return false; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
const envoisDe = async (modele) => (((await lire('envois?pageSize=300')) || {}).documents || []).filter((d) => str(d, 'modele') === modele);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160))); equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  const karim = 'karim.testeur@essai.test';
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (fiches.find((d) => str(d, 'email') === karim) || { name: '' }).name.split('/').pop();
  await vider(`conversationsTesteurs/${uid}/messages`); await vider('conversationsTesteurs'); await vider('envois'); await vider('boites');

  console.log('\n== Le testeur écrit depuis sa bulle');
  await connecter(page, karim);
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('.bulle--testeur #bulle-ouvrir', { timeout: 20000 });
  verifier(true, 'la bulle est en bas à droite de l espace Test');
  await page.click('.bulle--testeur #bulle-ouvrir'); await pause(500);
  verifier(await page.isVisible('.bulle--testeur #bulle-panneau'), 'elle s ouvre');
  verifier(/Équipe Capmedia/.test(await page.textContent('.bulle--testeur .bulle-tete')), 'face à l équipe Capmedia');
  await page.fill('.bulle--testeur #bulle-texte', 'Le lien TestFlight me dit « non disponible ».');
  await page.keyboard.press('Enter'); await pause(1500);
  verifier(/non disponible/.test(await page.textContent('.bulle--testeur #bulle-fil')), 'son message s affiche dans le fil');
  const conv = await attendre(async () => { const c = await lire(`conversationsTesteurs/${uid}`); return (champ(c, 'nonLusEquipe').integerValue || '0') === '1'; }, 60, 500);
  verifier(conv, 'le serveur ouvre la conversation et compte un non lu côté équipe');
  verifier(await attendre(async () => (await envoisDe('message-testeur')).length === 1, 60, 500), 'une lettre « message-testeur » part à l équipe');

  console.log('\n== Le Cockpit : la page Testeurs, la réponse');
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.waitForSelector('#lat-corps', { timeout: 20000 });
  const railOk = await attendre(async () => /Testeurs/.test(await equipe.textContent('#lat-corps').catch(() => '')), 30, 500);
  verifier(railOk, 'le rail du Cockpit a une entrée « Testeurs »');
  const pastille = await attendre(async () => { const t = await equipe.$eval('#lat-corps a[href="#/testeurs-messages"], #lat-corps [data-chemin="/testeurs-messages"]', (a) => a.textContent).catch(() => ''); return /1/.test(t); }, 20, 500);
  verifier(pastille, 'avec le non lu en pastille');
  await equipe.evaluate(() => { location.hash = '#/testeurs-messages'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-conv]', { timeout: 15000 });
  verifier(/Karim/.test(await equipe.textContent('.tm-liste')) && /non disponible/.test(await equipe.textContent('.tm-liste')), 'la liste montre Karim et son dernier message');
  await equipe.click('[data-conv]'); await equipe.waitForSelector('#tm-texte', { timeout: 15000 }); await pause(800);
  verifier(/non disponible/.test(await equipe.textContent('#tm-fil')), 'le fil s ouvre avec son message');
  verifier(await attendre(async () => (champ(await lire(`conversationsTesteurs/${uid}`), 'nonLusEquipe').integerValue || '0') === '0', 20, 500), 'ouvrir le fil remet le compteur de l équipe à zéro');
  const notifs = ((await lire('boites?pageSize=50')) || {}).documents || [];
  void notifs;
  await equipe.fill('#tm-texte', 'On regarde tout de suite. Réessayez dans dix minutes.');
  await equipe.keyboard.press('Enter'); await pause(1500);
  verifier(/dix minutes/.test(await equipe.textContent('#tm-fil')), 'la réponse s affiche chez l équipe');

  console.log('\n== Le testeur reçoit la réponse en direct');
  verifier(await attendre(async () => /dix minutes/.test(await page.textContent('.bulle--testeur #bulle-fil').catch(() => '')), 30, 500), 'la réponse arrive dans sa bulle, sans recharger');
  await page.click('.bulle--testeur #bulle-fermer'); await pause(300);
  await equipe.fill('#tm-texte', 'Deuxième message, bulle fermée.'); await equipe.keyboard.press('Enter'); await pause(500);
  const pastilleT = await attendre(async () => { const c = await page.$('.bulle--testeur #bulle-compte'); return c && !(await c.evaluate((el) => el.hidden)) && /1/.test(await c.textContent()); }, 30, 500);
  verifier(pastilleT, 'bulle fermée, la pastille compte un non lu');
  verifier(await attendre(async () => (await envoisDe('message-testeur-reponse')).length >= 1, 60, 500), 'une lettre « message-testeur-reponse » part au testeur');
  const boite = await attendre(async () => { const j = await lire(`boites/${uid}/notifications?pageSize=20`); return ((j && j.documents) || []).some((d) => /Réponse de/.test(str(d, 'titre'))); }, 40, 500);
  verifier(boite, 'et une notification dans sa cloche');
  await page.click('.bulle--testeur #bulle-ouvrir'); await pause(1200);
  verifier(await attendre(async () => (champ(await lire(`conversationsTesteurs/${uid}`), 'nonLusTesteur').integerValue || '0') === '0', 20, 500), 'rouvrir la bulle remet son compteur à zéro');
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-chat-testeur-echec.png' }); console.error('capture : /tmp/qa-chat-testeur-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
