/* ==========================================================================
   CAPMEDIA CLIENT HUB · la page Documents du client, éprouvée dans le
   navigateur

   La page Documents porte TOUS les documents du client : les fichiers des
   projets, et pour le responsable ses factures, devis et avoirs, avec la
   date, le projet, le montant HT et TTC, l'état. La ligne d'une pièce, sa
   fiche et son téléchargement (par suiviPiece, sans aperçu) sont ceux de
   « Devis et factures ». Un collaborateur qui n'est pas responsable ne
   voit pas la finance. Le badge de la barre compte ce que la page montre.
   Un seul dessin à l'arrivée, sans clé qui traîne.

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   La suite pose ses pièces par REST, les retire à la fin, et rend à Léa
   son rôle de responsable.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const retirer = async (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop }).catch(() => {});
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const M = (fields) => ({ mapValue: { fields } });
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
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const J = (n) => new Date(Date.now() + n * 86400000);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const PIECES = ['documents/f-doc-ttc', 'documents/a-doc-avoir', 'documents/f-doc-archive', 'documents/d-doc-brouillon'];
const CHEMIN = 'projets/atelier/pieces/f-doc-ttc/F-DOC-TTC.pdf';

/* Ce que la page montre : les lignes de pièces et les cartes de fichiers. */
const releverPage = (p) => p.evaluate(() => ({
  pieces: [...document.querySelectorAll('.page [data-action="ouvrir"][data-id]')].map((el) => el.dataset.id),
  fichiers: [...document.querySelectorAll('.page .fichier[data-id]')].map((el) => el.dataset.id),
  sections: [...document.querySelectorAll('.page section[data-rayon]')].map((el) => el.dataset.rayon),
  genres: [...document.querySelectorAll('.page [data-genre]')].map((el) => el.dataset.genre),
  texte: (document.querySelector('.page') || {}).innerText || '',
  badge: (() => { const l = document.querySelector('.lat-lien[data-chemin="/documents"]'); const c = l && l.querySelector('.compte'); return c ? Number(c.textContent.trim()) : 0; })(),
}));

/* La sonde du rebond : combien d'images peignent du contenu dans #vue. */
const sonder = (p) => p.evaluate(() => {
  const s = { ev: [], image: 0 }; window.__sondeDoc = s;
  const tourner = () => { s.image += 1; requestAnimationFrame(tourner); }; requestAnimationFrame(tourner);
  new MutationObserver((ms) => { for (const m of ms) { if (m.type !== 'childList' || m.target.id !== 'vue') continue; for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; s.ev.push({ image: s.image, squelette: n.classList.contains('squelette') || Boolean(n.querySelector && n.querySelector('.squelette')) }); } } })
    .observe(document.querySelector('#vue'), { childList: true, subtree: true });
});

const nettoyer = async () => { for (const c of PIECES) await retirer(c); };

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const lea = await uidDe('lea.essai@exemple.test');

  /* Le terrain : sur Atelier, une facture avec TVA et son PDF, un avoir,
     une facture archivée et un devis brouillon qui ne doivent pas se
     montrer. Les pièces du semis (d-qa, f-acompte, f-v11) restent. */
  await nettoyer();
  await admin.storage().bucket(SEAU).file(CHEMIN).save(PDF, { contentType: 'application/pdf' });
  await poser('documents/f-doc-ttc', { projet: S('atelier'), type: S('facture'), numero: S('F-DOC-TTC'), libelle: S('Recette de la version 1.2'), montant: N(1000), tva: N(20), ttc: N(1200), statut: S('a-payer'), archive: B(false), date: T(J(-3)), echeance: T(J(27)), fichier: M({ chemin: S(CHEMIN), nom: S('F-DOC-TTC.pdf'), taille: N(PDF.length) }) });
  await poser('documents/a-doc-avoir', { projet: S('atelier'), type: S('facture'), numero: S('A-DOC-01'), libelle: S('Avoir sur la recette'), montant: N(200), tva: N(20), ttc: N(240), statut: S('avoir'), archive: B(false), date: T(J(-1)) });
  await poser('documents/f-doc-archive', { projet: S('atelier'), type: S('facture'), numero: S('F-DOC-ARCHIVE'), libelle: S('Facture archivée'), montant: N(50), tva: N(0), ttc: N(50), statut: S('payee'), archive: B(true), date: T(J(-90)) });
  await poser('documents/d-doc-brouillon', { projet: S('atelier'), type: S('devis'), numero: S('D-DOC-BROUILLON'), libelle: S('Brouillon interne'), montant: N(10), tva: N(0), ttc: N(10), statut: S('brouillon'), archive: B(false), date: T(J(-1)) });
  await pause(1200);

  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const magasinLent = []; page.on('console', (m) => { const t = m.text(); if (t.includes('[magasin]')) magasinLent.push(t.slice(0, 200)); });
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== La responsable : un seul dessin à l arrivée');
  await sonder(page);
  /* La connexion a ses propres attentes (l'accueil) : on ne relève que ce
     qui arrive une fois sur Documents. */
  await pause(2000); magasinLent.length = 0; await page.evaluate(() => { window.__sondeDoc.ev = []; });
  await page.evaluate(() => { location.hash = '#/documents'; });
  await page.waitForSelector('[data-action="ouvrir"][data-id="f-doc-ttc"]', { timeout: 20000 }); await pause(1500);
  const rebond = await page.evaluate(() => { const s = window.__sondeDoc; return { contenus: new Set(s.ev.filter((e) => !e.squelette).map((e) => e.image)).size, images: s.ev.map((e) => `${e.image}${e.squelette ? 's' : ''}`).join(',') }; });
  verifier(rebond.contenus === 1, 'la page peint son contenu une seule fois', JSON.stringify(rebond));
  verifier(magasinLent.length === 0, 'aucune clé du magasin qui traîne', magasinLent.join(' | '));

  console.log('\n== La responsable : tous ses documents, rangés par genre');
  const r = await releverPage(page);
  verifier(['factures', 'devis', 'avoirs', 'fichiers'].every((g) => r.sections.includes(g)), 'une section par genre : Factures, Devis, Avoirs, Fichiers du projet', r.sections.join(','));
  verifier(['f-doc-ttc', 'f-acompte', 'f-v11', 'd-qa', 'a-doc-avoir'].every((id) => r.pieces.includes(id)), 'les factures, le devis et l avoir sont là', r.pieces.join(','));
  verifier(!r.pieces.includes('f-doc-archive') && !r.pieces.includes('d-doc-brouillon'), 'ni la pièce archivée, ni le brouillon');
  verifier(!r.pieces.includes('f-boutique'), 'ni la pièce d un autre client');
  verifier(r.fichiers.includes('fic-maquettes') && r.fichiers.includes('fic-contrat') && !r.fichiers.includes('fic-archi'), 'les fichiers du projet, sans le fichier interne', r.fichiers.join(','));
  verifier(new Set(r.pieces).size === r.pieces.length, 'aucune pièce en double');
  const ligneTtc = await page.$eval('[data-action="ouvrir"][data-id="f-doc-ttc"]', (el) => el.closest('.ligne').innerText);
  verifier(/1\s200,00\s€\sTTC/.test(ligneTtc) && /1\s000,00\s€\sHT/.test(ligneTtc), 'la facture dit son montant TTC et son HT', ligneTtc.replace(/\s+/g, ' '));
  verifier(/À payer/.test(ligneTtc), 'et son état « À payer »');
  verifier(/Atelier/i.test(ligneTtc) && /\d{1,2}\s\S+/.test(ligneTtc), 'le projet et la date', ligneTtc.replace(/\s+/g, ' '));
  const ligneV11 = await page.$eval('[data-action="ouvrir"][data-id="f-v11"]', (el) => el.closest('.ligne').innerText);
  verifier(/Payée/.test(ligneV11) && /4\s200,00\s€\sHT/.test(ligneV11), 'une facture sans TVA se lit « HT », état « Payée »', ligneV11.replace(/\s+/g, ' '));
  const ligneDevis = await page.$eval('[data-action="ouvrir"][data-id="d-qa"]', (el) => el.closest('.ligne').innerText);
  verifier(/À votre décision/.test(ligneDevis), 'le devis dit « À votre décision »');
  const ligneAvoir = await page.$eval('section[data-rayon="avoirs"]', (el) => el.innerText);
  verifier(/A-DOC-01/.test(ligneAvoir) && /Avoir/.test(ligneAvoir), 'l avoir est rangé dans « Avoirs »');
  verifier(!/\bnull\b|\bundefined\b|NaN/.test(r.texte), 'jamais « null », « undefined » ni « NaN » à l écran');
  verifier(!/\u2014/.test(r.texte), 'aucun tiret cadratin');

  console.log('\n== Le badge de la barre compte ce que la page montre');
  verifier(r.badge === r.pieces.length + r.fichiers.length, 'badge Documents = pièces + fichiers affichés', `badge ${r.badge}, page ${r.pieces.length} + ${r.fichiers.length}`);

  console.log('\n== Les filtres par genre');
  await page.click('[data-genre="factures"]'); await pause(400);
  let f = await releverPage(page);
  verifier(f.fichiers.length === 0 && f.pieces.includes('f-doc-ttc') && !f.pieces.includes('d-qa') && !f.pieces.includes('a-doc-avoir'), 'Factures : les factures seules', f.pieces.join(','));
  await page.click('[data-genre="devis"]'); await pause(400);
  f = await releverPage(page);
  verifier(f.fichiers.length === 0 && f.pieces.length >= 1 && f.pieces.every((id) => id.startsWith('d-')), 'Devis : les devis seuls', f.pieces.join(','));
  await page.click('[data-genre="fichiers"]'); await pause(400);
  f = await releverPage(page);
  verifier(f.pieces.length === 0 && f.fichiers.length >= 2, 'Fichiers du projet : les fichiers seuls');
  verifier(Boolean(await page.$('[data-cat=""]')), 'et leurs catégories se proposent');
  await page.click('[data-genre=""]'); await pause(400);
  await page.fill('#recherche-doc', 'F-DOC'); await pause(400);
  f = await releverPage(page);
  verifier(f.pieces.length === 1 && f.pieces[0] === 'f-doc-ttc' && f.fichiers.length === 0, 'la recherche trouve une pièce par son numéro', f.pieces.join(','));
  await page.fill('#recherche-doc', ''); await pause(400);

  console.log('\n== Télécharger : le PDF par le serveur, sans aperçu');
  const [t1] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('[data-telecharger="f-doc-ttc"]')]);
  verifier(t1 && t1.suggestedFilename() === 'F-DOC-TTC.pdf', 'un clic, le PDF se pose sous son nom', t1 ? t1.suggestedFilename() : '(rien)');
  verifier(ctx.pages().length === 1, 'sans nouvel onglet');
  verifier(!(await page.$('.modale-corps')), 'sans ouvrir la fiche');
  verifier(!(await page.$('[data-voir], [data-voir-piece], .feuille--apercu')), 'aucun aperçu');

  console.log('\n== La fiche : celle de « Devis et factures »');
  await page.click('[data-action="ouvrir"][data-id="f-doc-ttc"]');
  await page.waitForSelector('.modale-corps', { timeout: 10000 }); await pause(400);
  const fiche = await page.textContent('.voile');
  verifier(/Facture F-DOC-TTC/.test(fiche) && /Hors taxes/.test(fiche) && /TTC/.test(fiche), 'la fiche de la facture s ouvre, HT et TTC');
  verifier(Boolean(await page.$('[data-telecharger-piece]')) && Boolean(await page.$('[data-declarer]')), 'avec « Télécharger le PDF » et « J ai réglé cette facture »');
  await page.keyboard.press('Escape'); await pause(500);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  console.log('\n== Un collaborateur ne voit pas la finance');
  /* Léa passe collaboratrice sur Boutique le temps de la suite. */
  await poser('projets/boutique', { roles: M({ [lea]: S('collaborateur') }) }, ['roles']);
  await pause(800);
  const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pageLea = await ctx2.newPage();
  const erreursLea = []; pageLea.on('pageerror', (e) => erreursLea.push(e.message.slice(0, 160)));
  try {
    await connecter(pageLea, 'lea.essai@exemple.test');
    await pageLea.evaluate(() => { location.hash = '#/documents'; });
    await pageLea.waitForSelector('#recherche-doc', { timeout: 20000 }); await pause(1500);
    const rl = await releverPage(pageLea);
    verifier(rl.pieces.length === 0, 'aucune pièce comptable sur sa page', rl.pieces.join(','));
    verifier(!/F-2026-030|Acompte cadrage/.test(rl.texte), 'la facture de Boutique n apparaît nulle part');
    verifier(!rl.genres.some((g) => ['factures', 'devis', 'avoirs'].includes(g)), 'pas de filtre Factures, Devis ou Avoirs', rl.genres.join(','));
    verifier(!/devis|factures/i.test((await pageLea.textContent('.page .chapo')) || ''), 'le chapeau ne lui parle pas de devis ni de factures');
    verifier(rl.badge === rl.fichiers.length, 'son badge compte ses fichiers seuls', `badge ${rl.badge}, fichiers ${rl.fichiers.length}`);
    verifier(!(await pageLea.$('.lat-lien[data-chemin="/finances"]')), 'et l entrée « Devis et factures » lui reste cachée');
    verifier(!/\bnull\b|\bundefined\b/.test(rl.texte), 'jamais « null » ni « undefined »');
    verifier(erreursLea.length === 0, `aucune erreur de page ${erreursLea.join(' | ')}`);
  } finally {
    await poser('projets/boutique', { roles: M({ [lea]: S('responsable') }) }, ['roles']);
  }

  await nav.close();
  await nettoyer();
  await admin.storage().bucket(SEAU).file(CHEMIN).delete().catch(() => {});
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-documents-client-echec.png' }); } catch (err) { /* rien */ } }
  try { const lea = await uidDe('lea.essai@exemple.test'); await poser('projets/boutique', { roles: M({ [lea]: S('responsable') }) }, ['roles']); await nettoyer(); } catch (err) { /* rien */ }
  process.exit(2);
});
