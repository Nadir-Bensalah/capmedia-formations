/* ==========================================================================
   CAPMEDIA CLIENT HUB · télécharger une pièce (devis, facture), direct

   Le client clique « Télécharger » dans la liste ou « Télécharger le PDF »
   dans la fiche : le PDF arrive par le serveur (suiviPiece), qui vérifie
   qui demande, et se pose sous son nom. Une pièce sans PDF n'a pas de
   bouton. Le serveur refuse un collaborateur, un inconnu, un brouillon.
   L'équipe télécharge depuis le Cockpit.

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const PIECE = `${BANC.fonctions}/${PROJET}/europe-west1/suiviPiece`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const N = (v) => ({ integerValue: String(v) });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
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
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const chemin = 'projets/atelier/pieces/d-qa/D-2026-014.pdf';
  await admin.storage().bucket(SEAU).file(chemin).save(PDF, { contentType: 'application/pdf' });
  await poser('documents/d-qa', { fichier: { mapValue: { fields: { chemin: S(chemin), nom: S('D-2026-014.pdf'), taille: N(PDF.length) } } } }, ['fichier']);
  await fetch(`${bdd('documents/f-v11')}?updateMask.fieldPaths=fichier`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
  await vider('audit');

  console.log('\n== Le serveur : qui peut, qui ne peut pas');
  const demander = async (email, doc = 'd-qa') => { const j = email ? await jetonPour(email) : ''; const r = await fetch(`${PIECE}?document=${doc}`, { headers: email ? { Authorization: `Bearer ${j}` } : {} }); return { code: r.status, type: r.headers.get('content-type') || '', nom: r.headers.get('content-disposition') || '', taille: (await r.arrayBuffer()).byteLength }; };
  const camille = await demander('camille.essai@exemple.test');
  verifier(camille.code === 200 && /pdf/.test(camille.type) && /D-2026-014\.pdf/.test(camille.nom) && camille.taille === PDF.length, 'la responsable reçoit le PDF, sous son nom, entier', JSON.stringify(camille));
  const agent = await demander('agent.essai@exemple.test');
  verifier(agent.code === 200 && agent.taille === PDF.length, 'l administrateur aussi');
  verifier((await demander('lea.essai@exemple.test')).code === 403, 'un client d un autre projet est refusé');
  verifier((await demander('karim.testeur@essai.test')).code === 403, 'un testeur est refusé');
  verifier((await demander('')).code === 401, 'sans session : refusé');
  verifier((await demander('camille.essai@exemple.test', 'f-v11')).code === 404, 'une pièce sans PDF : introuvable');
  verifier((await demander('camille.essai@exemple.test', 'nexistepas')).code === 404, 'une pièce inconnue : introuvable');
  const traces = ((await lire('audit?pageSize=100')) || {}).documents || [];
  verifier(traces.some((t) => str(t, 'action') === 'piece.telechargee') && traces.some((t) => str(t, 'action') === 'piece.refusee'), 'chaque téléchargement et chaque refus laissent une trace');

  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== Le client : « Télécharger » dans la liste, puis dans la fiche');
  await connecter(page, 'camille.essai@exemple.test');
  await page.evaluate(() => { location.hash = '#/finances'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForSelector('[data-telecharger="d-qa"]', { timeout: 20000 });
  verifier(true, 'la pièce qui a son PDF montre « Télécharger »');
  verifier(!(await page.$('[data-telecharger="f-v11"]')), 'une pièce sans PDF n en a pas');
  verifier((await page.$$('.piece-fin')).length >= 2, 'les fins de ligne sont en colonnes fixes');
  const [t1] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('[data-telecharger="d-qa"]')]);
  verifier(t1 && t1.suggestedFilename() === 'D-2026-014.pdf', 'un clic, le PDF se pose sous son nom', t1 ? t1.suggestedFilename() : '(rien)');
  verifier(!(await page.$('#forme-devis')), 'sans ouvrir la fiche');
  await page.click('[data-action="ouvrir"][data-id="d-qa"]'); await page.waitForSelector('[data-telecharger-piece]', { timeout: 10000 });
  const [t2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('[data-telecharger-piece]')]);
  verifier(t2 && t2.suggestedFilename() === 'D-2026-014.pdf', 'depuis la fiche aussi');
  verifier(!(await page.$('[data-voir], [data-voir-piece], .feuille--apercu')), 'plus d aperçu nulle part');
  await page.keyboard.press('Escape'); await pause(300);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  console.log('\n== L équipe, dans le Cockpit');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.evaluate(() => { location.hash = '#/finances'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-onglet="devis"]', { timeout: 20000 }); await equipe.click('[data-onglet="devis"]');
  await equipe.waitForSelector('[data-action="ouvrir"][data-id="d-qa"]', { timeout: 20000 });
  await equipe.click('[data-action="ouvrir"][data-id="d-qa"]'); await equipe.waitForSelector('[data-telecharger-piece]', { timeout: 10000 });
  const [t3] = await Promise.all([equipe.waitForEvent('download', { timeout: 15000 }).catch(() => null), equipe.click('[data-telecharger-piece]')]);
  verifier(t3 && t3.suggestedFilename() === 'D-2026-014.pdf', 'l équipe télécharge depuis la fiche du Cockpit');

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-telecharger-piece-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
