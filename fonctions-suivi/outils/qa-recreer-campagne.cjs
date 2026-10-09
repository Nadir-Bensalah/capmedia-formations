require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · remplacer une campagne de l'ancienne bibliothèque
   (recreer-campagne-forgeme.mjs), sur le banc

   - à blanc, le script n'écrit rien ;
   - --vrai : la sauvegarde existe, l'ancienne campagne disparaît, la
     nouvelle est sur le plan, à la règle du socle, plafond 120, sans
     testeur, en préparation ;
   - le Cockpit l'ouvre sans le message « ancienne bibliothèque », avec le
     socle coché et le plafond ;
   - « Répartir » pour deux testeurs (un iPhone, un Android) montre
     l'aperçu : socle, reste, total sous le plafond, sans rien écrire ;
   - aucune notification, lettre ni activité visible du client ;
   - --annuler remet l'ancienne et retire la nouvelle.

   Banc : émulateurs (Functions compris), site local, semis communs.
     node fonctions-suivi/outils/qa-recreer-campagne.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d', SITE = BANC.site, P = 'atelier', ANCIENNE = 'c-ancienne';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, n) => ((((d || {}).fields || {})[n]) || {}).stringValue || '';
const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && JSON.stringify((d.fields || {}).a || {}).includes(e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForSelector('.page h1, .page--testeur, .accueil', { timeout: 30000 }).catch(() => {}); await pause(2000);
};
const aller = async (page, hash, attendu) => { for (let i = 0; i < 8; i++) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1500);
  if (!attendu || await page.evaluate((s) => !!document.querySelector(s), attendu)) return; } };

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const SCRIPT = path.join(__dirname, 'recreer-campagne-forgeme.mjs');
const SAUVEGARDES = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-recreer-'));
const lancer = (args) => {
  try { return { code: 0, sortie: execFileSync('node', [SCRIPT, `--projet=${P}`, ...args], { env: { ...process.env, SAUVEGARDES, ATTENTE_SERVEUR_MS: '12000' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` }; }
};

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const db = admin.firestore();
  const camille = await admin.auth().getUserByEmail('camille.essai@exemple.test');

  console.log('\n== Le terrain : une seule campagne, sur l\'ancienne bibliothèque');
  for (const d of (await db.collection(`projets/${P}/campagnes`).get()).docs) await d.ref.delete();
  await pause(3000);
  await db.doc(`projets/${P}/campagnes/${ANCIENNE}`).set({
    titre: 'Campagne d\'octobre 2026, avant mise en ligne', statut: 'preparation', scenarios: ['CC-01', 'DI-01', 'TA-01'],
    builds: { ios: '', android: '', web: '' }, testeurs: [], affectation: {},
    debut: new Date('2026-10-01'), fin: new Date('2026-11-08'), cree: admin.firestore.FieldValue.serverTimestamp(), maj: admin.firestore.FieldValue.serverTimestamp(),
  });
  await pause(3000);
  await db.collection(`boites/${camille.uid}/notifications`).get().then((q) => Promise.all(q.docs.map((d) => d.ref.delete())));
  await vider('envois');

  console.log('\n== À blanc, rien n\'est écrit');
  const blanc = lancer(['--aujourdhui=2026-10-09']);
  verifier(blanc.code === 0 && /À blanc : rien n'a été écrit/.test(blanc.sortie), 'le script à blanc se termine sans écrire', blanc.sortie.slice(-300));
  verifier(/Socle proposé : \d+ scénario/.test(blanc.sortie) && /Plafond : 120/.test(blanc.sortie), 'il annonce le socle et le plafond');
  const apresBlanc = (await db.collection(`projets/${P}/campagnes`).get()).docs.map((d) => d.id);
  verifier(apresBlanc.length === 1 && apresBlanc[0] === ANCIENNE, 'l ancienne campagne est toujours seule', apresBlanc.join(','));

  console.log('\n== --vrai : sauvegarde, création, suppression');
  const vrai = lancer(['--vrai', '--aujourdhui=2026-10-09']);
  console.log(vrai.sortie.split('\n').filter((l) => /Sauvegarde|Créée|Relue|Supprimée|Notifications|Activités|Lettres|Validations|Aucune|ATTENTION/.test(l)).map((l) => `         ${l}`).join('\n'));
  verifier(vrai.code === 0, 'le script --vrai réussit', vrai.sortie.slice(-400));
  const fichier = (/Sauvegarde : (.+\.json)/.exec(vrai.sortie) || [])[1] || '';
  const sauvegarde = fichier && fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : {};
  verifier(sauvegarde.ancienne && sauvegarde.ancienne.id === ANCIENNE && sauvegarde.ancienne.donnees && sauvegarde.ancienne.donnees.titre === 'Campagne d\'octobre 2026, avant mise en ligne', 'la sauvegarde garde l ancienne campagne', fichier);
  verifier(sauvegarde.ancienne && sauvegarde.ancienne.donnees.debut && Array.isArray(sauvegarde.ancienne.donnees.debut.__ts), 'avec ses horodatages');
  const restent = (await db.collection(`projets/${P}/campagnes`).get()).docs;
  verifier(restent.length === 1 && restent[0].id !== ANCIENNE && restent[0].id === sauvegarde.nouvelle, 'l ancienne a disparu, la nouvelle est seule', restent.map((d) => d.id).join(','));
  const nouvelle = restent[0] ? { id: restent[0].id, ...restent[0].data() } : {};
  const CID = nouvelle.id;
  verifier(nouvelle.titre === 'Campagne ForgeMe, octobre 2026' && nouvelle.statut === 'preparation', 'titre et statut', `${nouvelle.titre} ${nouvelle.statut}`);
  verifier(nouvelle.plan === true && nouvelle.regle === 'socle' && nouvelle.plafond === 120, 'sur le plan, règle du socle, plafond 120');
  verifier(Array.isArray(nouvelle.socle) && nouvelle.socle.length > 0 && nouvelle.socle.every((id) => nouvelle.scenarios.includes(id)), 'un socle pris parmi ses scénarios', `${(nouvelle.socle || []).length}`);
  verifier(!(nouvelle.testeurs || []).length && !Object.keys(nouvelle.affectation || {}).length, 'aucun testeur attribué');
  verifier(nouvelle.application === 'ForgeMe', 'l application est ForgeMe');
  verifier(nouvelle.debut && nouvelle.debut.toDate().toISOString() === '2026-10-09T00:00:00.000Z' && nouvelle.fin && nouvelle.fin.toDate().toISOString() === '2026-10-24T00:00:00.000Z', 'du 9 au 24 octobre', `${nouvelle.debut && nouvelle.debut.toDate().toISOString()} ${nouvelle.fin && nouvelle.fin.toDate().toISOString()}`);
  verifier(/Aucune notification, activité, lettre ni validation vers le client/.test(vrai.sortie), 'le script ne voit rien partir vers le client');

  console.log('\n== Le Cockpit l\'ouvre comme une campagne sur le plan');
  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const err = []; page.on('pageerror', (e) => err.push(`PAGE: ${e.message.slice(0, 160)}`));
  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, `/tests?projet=${P}`, `[data-action="ouvrir-campagne"][data-id="${CID}"]`);
  verifier(await page.evaluate((id) => !!document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`), CID), 'la nouvelle campagne est listée');
  verifier(await page.evaluate((id) => !document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`), ANCIENNE), 'l ancienne ne l est plus');
  await page.evaluate((id) => { const b = document.querySelector(`[data-editer-campagne="${id}"]`); if (b) b.click(); }, CID);
  await page.waitForSelector('[data-socle-groupe]', { timeout: 15000 }).catch(() => null);
  const ed = await page.evaluate(() => ({
    ancienne: !!document.querySelector('[data-ancienne]'),
    texte: document.body.innerText,
    groupe: !!document.querySelector('[data-socle-groupe]'),
    coches: [...document.querySelectorAll('[data-socle]')].filter((c) => c.checked).map((c) => c.dataset.socle),
    sections: [...document.querySelectorAll('[data-section]')].map((c) => c.checked),
    plafond: (document.querySelector('[name="plafond"]') || {}).value,
  }));
  verifier(!ed.ancienne && !/reprend l'ancienne bibliothèque/.test(ed.texte), 'pas de message « ancienne bibliothèque » dans la feuille');
  verifier(ed.sections.length > 0 && ed.sections.every(Boolean), 'toutes les sections du plan sont cochées', `${ed.sections.filter(Boolean).length}/${ed.sections.length}`);
  verifier(ed.groupe && JSON.stringify(ed.coches) === JSON.stringify(nouvelle.socle), 'le socle coché est celui de la campagne, dans l ordre des cases', `${ed.coches.length} / ${(nouvelle.socle || []).length}`);
  verifier(ed.plafond === '120', 'le plafond est 120', ed.plafond);
  await page.keyboard.press('Escape'); await pause(800);

  console.log('\n== Répartir pour deux testeurs : l\'aperçu');
  await page.evaluate((id) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`); if (b) b.click(); }, CID);
  await page.waitForSelector('[data-repartir]', { timeout: 15000 });
  const fiche = await page.evaluate(() => document.body.innerText);
  verifier(!/reprend l'ancienne bibliothèque/.test(fiche), 'pas de message « ancienne bibliothèque » dans la fiche');
  const vivier = (await db.collection('testeurs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const deux = [vivier.find((t) => t.prenom === 'Karim'), vivier.find((t) => t.prenom === 'Sonia')].filter(Boolean);
  await page.evaluate((ids) => document.querySelectorAll('[data-testeur]').forEach((c) => { c.checked = ids.includes(c.dataset.testeur); }), deux.map((t) => t.id));
  await page.click('[data-repartir]');
  await page.waitForSelector('[data-apercu-charges]', { timeout: 20000 }).catch(() => null);
  const a = await page.evaluate(() => ({
    intro: ((document.querySelector('[data-apercu-charges]') || {}).previousElementSibling || {}).innerText || '',
    entetes: [...document.querySelectorAll('[data-apercu-charges] th')].map((x) => x.textContent.trim()),
    lignes: [...document.querySelectorAll('[data-charge]')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())),
    robots: (document.querySelector('[data-apercu-robots]') || {}).innerText || '',
    bloque: !!(document.querySelector('[data-enregistrer-repartition]') || {}).disabled,
  }));
  console.log(`         ${a.lignes.map((l) => l.join(' | ')).join('\n         ')}`);
  verifier(a.lignes.length === 2, 'l aperçu montre les deux testeurs', `${a.lignes.length}`);
  verifier(['Socle', 'Reste', 'Total'].every((h) => a.entetes.includes(h)), 'avec le socle, le reste et le total', a.entetes.join(','));
  verifier(a.lignes.length === 2 && a.lignes.every((l) => Number(l[2]) > 0 && Number(l[2]) + Number(l[3]) === Number(l[5]) && Number(l[5]) <= 120), 'socle + reste = total, sous le plafond de 120', JSON.stringify(a.lignes));
  verifier(/Le socle \(\d+ scénarios?\) chez tous/.test(a.intro) && /jusqu'à 120 tests par testeur \(10 h\)/.test(a.intro), 'l aperçu rappelle le socle et le plafond', a.intro);
  verifier(/laissés? aux robots/.test(a.robots), 'et ce qui reste aux robots', a.robots);
  verifier(!a.bloque, 'l enregistrement serait possible');
  await page.click('[data-fermer]').catch(() => {}); await pause(1000);
  const apres = (await db.doc(`projets/${P}/campagnes/${CID}`).get()).data() || {};
  verifier(!Object.keys(apres.affectation || {}).length && !(apres.testeurs || []).length, 'rien n est écrit en fermant l aperçu');
  verifier(!err.length, 'aucune erreur de page', err.slice(0, 3).join(' | '));
  await nav.close();

  console.log('\n== Le client n\'a rien reçu');
  const cloches = (await db.collection(`boites/${camille.uid}/notifications`).get()).docs.map((d) => d.data());
  verifier(!cloches.length, 'aucune notification chez le client', JSON.stringify(cloches).slice(0, 160));
  const lettres = ((await lire('envois?pageSize=200')) || {}).documents || [];
  /* Les codes et l'alerte de connexion de l'équipe ne portent pas de projet. */
  const auClient = lettres.filter((e) => str(e, 'projet') === P || JSON.stringify((e.fields || {}).a || {}).includes('camille.essai@exemple.test'));
  verifier(!auClient.length, 'aucune lettre au client ni sur le projet', auClient.map((e) => str(e, 'modele')).join(','));

  console.log('\n== --annuler remet l\'ancienne');
  const annule = lancer(['--annuler', fichier]);
  verifier(annule.code === 0, 'le script --annuler réussit', annule.sortie.slice(-300));
  const ids = (await db.collection(`projets/${P}/campagnes`).get()).docs.map((d) => d.id);
  verifier(ids.length === 1 && ids[0] === ANCIENNE, 'l ancienne est revenue, la nouvelle est retirée', ids.join(','));
  const revenue = (await db.doc(`projets/${P}/campagnes/${ANCIENNE}`).get()).data() || {};
  verifier(revenue.debut && revenue.debut.toDate().toISOString() === '2026-10-01T00:00:00.000Z' && revenue.plan === undefined && (revenue.scenarios || []).length === 3, 'telle qu elle était, horodatages compris');

  fs.rmSync(SAUVEGARDES, { recursive: true, force: true });
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
