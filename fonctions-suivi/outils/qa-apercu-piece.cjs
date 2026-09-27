/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'aperçu d'une pièce (devis, facture) sur le côté

   Le client ouvre « Devis et factures », clique « Voir » sur une pièce qui
   a son PDF : la feuille large s'ouvre, le PDF se lit en mémoire et
   s'affiche depuis une adresse locale, Télécharger et Imprimer sont là.
   Depuis la fiche aussi (« Voir le PDF »). Une pièce sans PDF n'a pas de
   bouton. L'équipe a le même aperçu dans le Cockpit.

   Banc : émulateurs (Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
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
/* Un PDF d'une page, blanc : ce qu'il faut pour être lu comme un PDF. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  /* Le devis d-qa du semis reçoit un vrai PDF dans le rangement des pièces ;
     f-v11 n'en a plus : il ne doit pas proposer « Voir ». */
  const chemin = 'projets/atelier/pieces/d-qa/D-2026-014.pdf';
  await admin.storage().bucket(SEAU).file(chemin).save(PDF, { contentType: 'application/pdf' });
  await poser('documents/d-qa', { fichier: { mapValue: { fields: { chemin: S(chemin), nom: S('D-2026-014.pdf'), taille: N(PDF.length) } } } }, ['fichier']);
  await fetch(`${bdd('documents/f-v11')}?updateMask.fieldPaths=fichier`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });

  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== Le client : « Voir » dans la liste');
  await connecter(page, 'camille.essai@exemple.test');
  await page.evaluate(() => { location.hash = '#/finances'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForSelector('[data-voir="d-qa"]', { timeout: 20000 });
  verifier(true, 'la pièce qui a son PDF montre un bouton « Voir »');
  verifier(!(await page.$('[data-voir="f-v11"]')), 'une pièce sans PDF n en a pas');
  await page.click('[data-voir="d-qa"]'); await page.waitForSelector('.feuille--apercu', { timeout: 10000 });
  verifier(true, 'Voir ouvre la feuille d aperçu sur le côté, sans passer par la fiche');
  verifier(!(await page.$('#forme-devis')), 'et pas la fiche du devis');
  const tete = await page.textContent('.feuille--apercu .apercu-tete');
  verifier(/5\s?750/.test(tete) && /HT/.test(tete), 'l en-tête dit le montant', tete.slice(0, 80));
  await page.waitForSelector('iframe.apercu-pdf', { timeout: 20000 });
  const src = await page.getAttribute('iframe.apercu-pdf', 'src');
  verifier(/^blob:/.test(src || ''), 'le PDF est lu en mémoire et affiché depuis une adresse locale', String(src).slice(0, 40));
  await page.waitForFunction(() => { const b = document.querySelector('[data-telecharger]'); return b && !b.disabled; }, null, { timeout: 10000 }).catch(() => null);
  verifier(!(await page.$eval('[data-telecharger]', (b) => b.disabled)) && !(await page.$eval('[data-imprimer]', (b) => b.disabled)), 'Télécharger et Imprimer sont prêts');
  const [telechargement] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.click('[data-telecharger]')]);
  verifier(telechargement && telechargement.suggestedFilename() === 'D-2026-014.pdf', 'Télécharger donne le PDF sous son nom', telechargement ? telechargement.suggestedFilename() : '(rien)');
  verifier(!(await page.$('.feuille--apercu [data-enregistrer], .feuille--apercu input, .feuille--apercu textarea')), 'rien ne se modifie : c est une vue');
  await page.click('.feuille--apercu [data-fermer]'); await pause(400);
  verifier(!(await page.$('.feuille--apercu')), 'Fermer referme l aperçu');

  console.log('\n== Depuis la fiche');
  await page.click('[data-action="ouvrir"][data-id="d-qa"]'); await page.waitForSelector('[data-voir-piece]', { timeout: 10000 });
  verifier(await page.$('[data-piece]'), 'la fiche garde le téléchargement direct');
  await page.click('[data-voir-piece]'); await page.waitForSelector('.feuille--apercu iframe.apercu-pdf', { timeout: 20000 });
  verifier(true, '« Voir le PDF » ouvre l aperçu par-dessus la fiche');
  await page.keyboard.press('Escape'); await pause(400);
  verifier(await page.$('[data-voir-piece]'), 'Échap referme l aperçu et laisse la fiche');
  await page.keyboard.press('Escape'); await pause(300);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  console.log('\n== L équipe, dans le Cockpit');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.evaluate(() => { location.hash = '#/finances'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-onglet="devis"]', { timeout: 20000 });
  await equipe.click('[data-onglet="devis"]');
  await equipe.waitForSelector('[data-action="ouvrir"][data-id="d-qa"]', { timeout: 20000 });
  await equipe.click('[data-action="ouvrir"][data-id="d-qa"]'); await equipe.waitForSelector('[data-voir-piece]', { timeout: 10000 });
  await equipe.click('[data-voir-piece]'); await equipe.waitForSelector('.feuille--apercu iframe.apercu-pdf', { timeout: 20000 });
  verifier(/^blob:/.test((await equipe.getAttribute('iframe.apercu-pdf', 'src')) || ''), 'l équipe lit le même aperçu depuis le Cockpit');

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-apercu-piece-echec.png' }); console.error('capture : /tmp/qa-apercu-piece-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
