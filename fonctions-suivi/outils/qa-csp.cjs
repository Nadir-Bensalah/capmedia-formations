/* Cette suite provoque des violations exprès et fait ses propres comptes. */
require('./lib/garde-banc.cjs').cspVoulue = true;
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la politique de sécurité du contenu (CSP)

   Un coffre chiffré arrive dans le Hub : une seule XSS sur capmedia.app
   lirait la phrase de passe. Chaque page de /suivi porte donc une CSP
   stricte (en <meta>, et en en-tête par le .htaccess en production).

   Cette suite ouvre chaque page, connectée quand il le faut (client,
   équipe, testeur), recueille TOUTE violation de la politique (message de
   la console et événement securitypolicyviolation) et échoue s'il y en a
   une. Elle vérifie ensuite que la politique mord : un script en ligne, un
   gestionnaire onerror, un script d'un hôte inconnu, une balise <style>
   injectés sont refusés. Enfin, les fichiers eux-mêmes : plus aucun script
   en ligne, plus aucun onclick=, la même politique dans chaque page, et
   l'en-tête du .htaccess aligné sur elle.

   Banc : émulateurs (Functions et Storage compris), site local, semis.
     node fonctions-suivi/outils/qa-csp.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { lireRest } = require('./lib/rest-banc.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
const AGENCE = path.resolve(__dirname, '../../agence');
const SUIVI = path.join(AGENCE, 'suivi');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* --- Le recueil des violations ------------------------------------------- */
/* Deux sources, pour ne rien laisser passer : le message que Chromium écrit
   dans la console, et l'événement que la page reçoit (écouteur posé avant
   tout script de la page, à chaque navigation). */
const violations = [];
const brancherRecueil = async (contexte) => {
  await contexte.exposeBinding('__signalerCSP', ({ page }, v) => { violations.push({ source: 'evenement', page: page.url(), ...v }); });
  await contexte.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__signalerCSP({ directive: e.effectiveDirective, bloque: String(e.blockedURI || ''), ligne: `${e.sourceFile || ''}:${e.lineNumber || 0}`, extrait: String(e.sample || '').slice(0, 80) }); } catch (err) { /* page en train de partir */ }
    });
  });
};
const surveiller = (page) => {
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy/i.test(t)) violations.push({ source: 'console', page: page.url(), texte: t.slice(0, 260) }); });
};
const resume = (liste) => liste.slice(0, 6).map((v) => (v.texte || `${v.directive} ${v.bloque} ${v.ligne} ${v.extrait}`)).join(' | ');
const sansViolation = (depuis, libelle) => {
  const nouvelles = violations.slice(depuis);
  verifier(nouvelles.length === 0, `${libelle} : aucune violation de la politique`, resume(nouvelles));
};

const ouvrir = async (page, hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await pause(1800);
};

const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(3000);
};

(async () => {
  /* --- 1. Les fichiers ---------------------------------------------------- */
  console.log('\n== Les fichiers : pas de script en ligne, une seule politique');
  const pages = fs.readdirSync(SUIVI).filter((f) => f.endsWith('.html'));
  const politiques = new Set();
  for (const f of pages) {
    const html = fs.readFileSync(path.join(SUIVI, f), 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    verifier(!!m, `${f} porte la politique en <meta>`);
    if (m) politiques.add(m[1]);
    const enLigne = (html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []);
    verifier(enLigne.length === 0, `${f} n a aucun script en ligne`, enLigne.join(' '));
    const tete = html.indexOf('<head>'), meta = html.indexOf('Content-Security-Policy'), script = html.indexOf('<script');
    verifier(tete >= 0 && meta > tete && (script < 0 || meta < script), `${f} : la politique précède le premier script`);
  }
  verifier(politiques.size === 1, 'la même politique dans toutes les pages', [...politiques].join(' /// ').slice(0, 200));
  const meta = [...politiques][0] || '';
  const directives = Object.fromEntries(meta.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  verifier(!(directives['script-src'] || []).some((v) => /unsafe-(inline|eval)|^\*$|^https:$|^data:$|^blob:$/.test(v)), 'script-src sans unsafe-inline, sans unsafe-eval, sans joker', (directives['script-src'] || []).join(' '));
  verifier((directives['object-src'] || []).join() === "'none'" && (directives['base-uri'] || []).join() === "'none'", "object-src et base-uri à 'none'");

  const js = [];
  const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) parcourir(p); else if (/\.js$/.test(e.name)) js.push(p); } };
  parcourir(path.join(SUIVI, 'assets'));
  const gestionnaires = [];
  for (const f of js) {
    const t = fs.readFileSync(f, 'utf8');
    const trouve = t.match(/<[a-z][^<>]*\son[a-z]{3,}=["'\\]/gi) || [];
    if (trouve.length) gestionnaires.push(`${path.relative(SUIVI, f)} : ${trouve[0].slice(0, 60)}`);
    if (/javascript:/i.test(t.replace(/\/\*[\s\S]*?\*\//g, ''))) gestionnaires.push(`${path.relative(SUIVI, f)} : javascript:`);
  }
  verifier(gestionnaires.length === 0, 'aucun gestionnaire en ligne (onclick=…) ni lien javascript: dans le HTML fabriqué', gestionnaires.join(' | '));

  /* L'en-tête de production : la même politique, sans le banc (127.0.0.1),
     plus ce qu'une <meta> ne sait pas porter. */
  const htaccess = fs.readFileSync(path.join(AGENCE, '.htaccess'), 'utf8');
  const entete = (htaccess.match(/Header always set Content-Security-Policy "([^"]+)"/) || [])[1] || '';
  const attendu = `${meta.replace(/ http:\/\/127\.0\.0\.1:\*/g, '')}; frame-ancestors 'none'; upgrade-insecure-requests`;
  verifier(entete === attendu, 'l en-tête du .htaccess = la politique des pages, sans 127.0.0.1, avec frame-ancestors', entete ? '' : 'en-tête absent');
  verifier(/<If "%\{REQUEST_URI\} =~ m#\^\/suivi\(\/\|\$\)#">/.test(htaccess), 'les en-têtes ne visent que /suivi');
  for (const h of ['X-Frame-Options "DENY"', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy "strict-origin-when-cross-origin"', 'publickey-credentials-get=(self)', 'Strict-Transport-Security "max-age=31536000"']) {
    verifier(htaccess.includes(h), `le .htaccess pose ${h.split(' ')[0]}`);
  }

  /* --- 2. Les pages, dans le navigateur ----------------------------------- */
  const nav = await chromium.launch();
  const contexte = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await brancherRecueil(contexte);
  /* Les liens externes ouverts par la suite ne sortent pas du banc. */
  await contexte.route(/^https:\/\/(meet\.google\.com|app\.atelier\.net|apps\.apple\.com|testflight\.apple\.com|figma\.com|github\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>externe</p>' }));
  contexte.on('page', surveiller);
  const page = await contexte.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== La porte et les anciennes adresses, sans session');
  let d = violations.length;
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  verifier(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'la porte s ouvre en sombre (theme-avant.js, sorti du <head>)');
  await pause(1500);
  sansViolation(d, 'la porte');

  const visitees = [];
  const suivreNav = (f) => { if (f === page.mainFrame()) visitees.push(f.url()); };
  page.on('framenavigated', suivreNav);
  d = violations.length;
  await page.goto(`${SITE}/suivi/projet?p=atelier`, { waitUntil: 'domcontentloaded' }); await pause(2500);
  verifier(visitees.some((u) => /\/suivi\/hub#\/projets\/atelier$/.test(u)), 'projet?p=… renvoie vers hub#/projets/…', visitees.join(' > '));
  visitees.length = 0;
  await page.goto(`${SITE}/suivi/ticket?t=T-12`, { waitUntil: 'domcontentloaded' }); await pause(2500);
  verifier(visitees.some((u) => /\/suivi\/hub#\/demande\/T-12$/.test(u)), 'ticket?t=… renvoie vers hub#/demande/…', visitees.join(' > '));
  visitees.length = 0;
  await page.goto(`${SITE}/suivi/console`, { waitUntil: 'domcontentloaded' }); await pause(2500);
  verifier(visitees.some((u) => /\/suivi\/cockpit$/.test(u)), 'console renvoie vers le cockpit', visitees.join(' > '));
  page.off('framenavigated', suivreNav);
  sansViolation(d, 'les trois redirections');

  console.log('\n== Le Hub, connecté en cliente');
  /* Sans session, app.js et admin.js renvoient vers la porte puis lèvent
     « session absente » pour arrêter le module : voulu, et hors sujet ici. */
  erreurs.length = 0;
  d = violations.length;
  await connecter(page, 'camille.essai@exemple.test');
  verifier(/\/suivi\/hub/.test(page.url()), 'la cliente arrive sur le hub', page.url());
  verifier(await page.evaluate(() => !!document.querySelector('.lat-marque, nav, aside')), 'le hub est monté (les modules Firebase sont chargés)');
  for (const h of ['#/', '#/projets/atelier', '#/projets/atelier/etapes', '#/projets/atelier/taches', '#/projets/atelier/demandes', '#/projets/atelier/fichiers', '#/projets/atelier/releases', '#/projets/atelier/liens', '#/projets/atelier/reunions', '#/projets/atelier/notes', '#/projets/atelier/activite', '#/demandes', '#/messages', '#/valider', '#/calendrier', '#/tests', '#/tableau', '#/finances', '#/documents', '#/maintenance', '#/activite', '#/parametres']) await ouvrir(page, h);
  /* Le lien « Rejoindre » d'une réunion ouvre la visio sans ouvrir la fiche
     (ex-onclick="event.stopPropagation()"). */
  await ouvrir(page, '#/projets/atelier/reunions');
  const rejoindre = await page.$('a[data-sans-propagation]');
  verifier(!!rejoindre, 'la réunion à venir montre « Rejoindre »');
  if (rejoindre) {
    const [onglet] = await Promise.all([contexte.waitForEvent('page', { timeout: 8000 }).catch(() => null), rejoindre.click()]);
    await pause(800);
    verifier(!!onglet, 'Rejoindre ouvre la visio dans un onglet');
    verifier(!(await page.$('.voile[role="dialog"]')), 'sans ouvrir la fiche de la réunion');
    if (onglet) await onglet.close();
  }
  await pause(1000);
  sansViolation(d, 'le hub (22 écrans)');
  verifier(erreurs.length === 0, 'aucune erreur de script dans le hub', erreurs.join(' | '));

  console.log('\n== La politique mord');
  const avant = violations.length;
  const sondes = await page.evaluate(async () => {
    const r = {};
    const s = document.createElement('script'); s.textContent = 'window.__injecte = 1;'; document.head.appendChild(s);
    r.scriptEnLigne = window.__injecte === 1;
    const div = document.createElement('div'); div.innerHTML = '<img src="./assets/rien.png" onerror="window.__gestionnaire = 1">'; document.body.appendChild(div);
    const ext = document.createElement('script'); ext.src = 'https://exemple-hostile.test/vol.js';
    r.externe = await new Promise((ok) => { ext.onload = () => ok(true); ext.onerror = () => ok(false); document.head.appendChild(ext); });
    const st = document.createElement('style'); st.textContent = 'body{outline:3px solid red}'; document.head.appendChild(st);
    await new Promise((ok) => setTimeout(ok, 600));
    r.gestionnaire = window.__gestionnaire === 1;
    r.style = getComputedStyle(document.body).outlineStyle === 'solid';
    let evalPasse = false; try { (0, setTimeout)('window.__chaine = 1', 0); await new Promise((ok) => setTimeout(ok, 100)); evalPasse = window.__chaine === 1; } catch (e) { evalPasse = false; }
    r.chaine = evalPasse;
    div.remove(); st.remove();
    return r;
  });
  await pause(800);
  const sondees = violations.slice(avant);
  const vu = (dir) => sondees.some((v) => (v.directive || '').startsWith(dir) || (v.texte || '').includes(dir));
  verifier(!sondes.scriptEnLigne && vu('script-src'), 'un script injecté en ligne est bloqué, et la violation est signalée', JSON.stringify(sondes));
  verifier(!sondes.gestionnaire, 'un gestionnaire onerror= injecté ne s exécute pas');
  verifier(!sondes.externe, 'un script d un hôte inconnu est refusé');
  verifier(!sondes.style && vu('style-src'), 'une balise <style> injectée est refusée');
  verifier(!sondes.chaine, 'un setTimeout sur une chaîne (une forme d eval) ne s exécute pas');
  violations.length = avant; // les violations voulues ne comptent pas

  console.log('\n== Le Cockpit, connecté en équipe');
  const contexte2 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await brancherRecueil(contexte2);
  contexte2.on('page', surveiller);
  const p2 = await contexte2.newPage();
  const erreurs2 = []; p2.on('pageerror', (e) => erreurs2.push(e.message.slice(0, 160)));
  d = violations.length;
  await connecter(p2, 'agent.essai@exemple.test');
  verifier(/\/suivi\/cockpit/.test(p2.url()), 'l équipe arrive sur le cockpit', p2.url());
  for (const h of ['#/', '#/clients', '#/projets', '#/a-faire', '#/projets/atelier', '#/projets/atelier/fichiers', '#/projets/atelier/liens', '#/projets/atelier/reunions', '#/projets/atelier/tests', '#/projets/atelier/acces', '#/nouveaux-projets', '#/demandes', '#/taches', '#/tests', '#/tests/tableau', '#/tableau', '#/planning', '#/messages', '#/testeurs-messages', '#/validations', '#/documents', '#/finances', '#/maintenance', '#/activite', '#/archives', '#/equipe', '#/parametres']) await ouvrir(p2, h);
  /* Le crayon d'une ressource est posé dans le lien : il ouvre l'éditeur
     sans suivre le lien (ex-onclick="event.preventDefault()"). */
  await ouvrir(p2, '#/projets/atelier/liens');
  const crayon = await p2.$('a.lien-env [data-sans-lien][data-action="editer"]');
  verifier(!!crayon, 'le crayon d une ressource est là');
  if (crayon) {
    const avantPages = contexte2.pages().length;
    await crayon.click(); await pause(1200);
    verifier(contexte2.pages().length === avantPages, 'le crayon ne suit pas le lien');
    verifier(!!(await p2.$('.voile[role="dialog"]')), 'il ouvre l éditeur de la ressource');
    const fermer = await p2.$('.voile [data-fermer]'); if (fermer) await fermer.click();
  }
  await pause(1000);
  sansViolation(d, 'le cockpit (27 écrans)');
  verifier(erreurs2.length === 0, 'aucune erreur de script dans le cockpit', erreurs2.join(' | '));
  await contexte2.close();

  console.log('\n== L espace Test, connecté en testeur');
  const contexte3 = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await brancherRecueil(contexte3);
  contexte3.on('page', surveiller);
  const p3 = await contexte3.newPage();
  const erreurs3 = []; p3.on('pageerror', (e) => erreurs3.push(e.message.slice(0, 160)));
  d = violations.length;
  await connecter(p3, 'karim.testeur@essai.test');
  verifier(/\/suivi\/testeur/.test(p3.url()), 'le testeur arrive sur son espace', p3.url());
  await pause(2500);
  verifier(await p3.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'l espace Test s ouvre en sombre');
  sansViolation(d, 'l espace Test');
  verifier(erreurs3.length === 0, 'aucune erreur de script dans l espace Test', erreurs3.join(' | '));
  await contexte3.close();

  await nav.close();
  console.log(`\n${ok} vérifications`);
  console.log(ecarts.length ? `${ecarts.length} ÉCART(S)` : 'qa-csp : tout est conforme');
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
