/* La fiche projet côté client, éprouvée dans le navigateur (agent C,
   27/09/2026) : les cartes plateformes lisent les versions réelles (15, 18),
   le pouls est daté et « Attendu de vous » calculé (14), la tenue des
   délais reste sans date (14, 16), « Une question sur cette étape » ouvre
   la bulle (17), le calendrier ouvre la fiche d'une réunion en un clic et
   donne le fichier d'agenda (41, 42), la cliente coche son action (41), la
   page Activité (19), la fiche d'une version par son adresse (15), un lien
   « Accès » avec identifiant copiable (45).
   Banc : émulateurs, site local, semer-suivi. */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const M = (fields) => ({ mapValue: { fields } }); const A = (values) => ({ arrayValue: { values } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const supprimer = async (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop });
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
const ilYA = (j) => new Date(Date.now() - j * 86400000);
const dans = (j, h = 0) => new Date(Date.now() + j * 86400000 + h * 3600000);
const agent = M({ uid: S('uid-agent'), nom: S('Alex Durand') });
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;
let cibleAvant = '';
const remettre = async () => {
  if (cibleAvant) await poser('projets/atelier', { cible: T(new Date(cibleAvant)) }, ['cible']);
  for (const c of ['releases/r-and-dispo', 'releases/r-and-test', 'reunions/re-demain', 'projets/atelier/liens/acces-test']) await supprimer(c);
};

(async () => {
  /* --- Le semis de l'épreuve : deux versions Android, un pouls daté, un
     projet sans date cible, un lien d'accès, une réunion demain. ------- */
  await poser('releases/r-and-dispo', { projet: S('atelier'), composant: S('android'), plateforme: S('android'), version: S('1.4.1'), titre: S('Corrections'), statut: S('disponible'), date: T(ilYA(15)), notes: A([M({ type: S('correction'), texte: S('Connexion Google') })]), liens: M({ store: S('https://play.google.com/store/apps/details?id=atelier') }), visibilite: S('client'), par: agent, cree: T(ilYA(15)), maj: T(ilYA(15)) });
  await poser('releases/r-and-test', { projet: S('atelier'), composant: S('android'), plateforme: S('android'), version: S('1.4.2'), titre: S('Nouveau profil'), statut: S('test'), date: T(ilYA(5)), build: S('87'), notes: A([M({ type: S('nouveau'), texte: S('Profil') })]), liens: M({ test: S('https://play.google.com/apps/internaltest/atelier') }), visibilite: S('client'), par: agent, cree: T(ilYA(5)), maj: T(ilYA(5)) });
  await poser('projets/atelier', { pulse: M({ enCours: S('Écran de profil'), derniereLivraison: S(''), prochaineEtape: S(''), attenteClient: S('Un texte périmé') }), pulseMaj: T(new Date()), pulsePar: S('Alex Durand') }, ['pulse', 'pulseMaj', 'pulsePar']);
  cibleAvant = champ(await lire('projets/atelier'), 'cible').timestampValue || '';
  await poser('projets/atelier', {}, ['cible']);
  await poser('projets/atelier/liens/acces-test', { nom: S('Compte de test'), url: S('https://app.atelier.net/connexion'), categorie: S('acces'), identifiants: S('test@atelier.net'), composant: S(''), description: S('Pour essayer avant la sortie'), environnement: S('Test'), visibilite: S('client'), etat: S('actif'), cree: T(new Date()) });
  await poser('reunions/re-demain', { projet: S('atelier'), titre: S('Point de livraison'), date: T(dans(1, 2)), duree: N(45), participants: A([M({ nom: S('Camille Martin') }), M({ nom: S('Alex Durand') })]), lien: S('https://meet.google.com/xyz-abcd-efg'), lieu: S('Dans vos locaux, 12 rue des Lilas'), ordreDuJour: S('1. Retours\n2. Suite'), notes: S(''), compteRendu: S(''), decisions: S(''), actions: A([M({ texte: S('Envoyer les captures'), fait: B(false) })]), visibilite: S('client'), par: agent, cree: T(new Date()), maj: T(new Date()) });
  await pause(1000);

  const nav = await chromium.launch();
  const contexte = await nav.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  page = await contexte.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== 15 et 18 : les cartes plateformes lisent les versions réelles');
  await page.evaluate(() => { location.hash = '#/projets/atelier'; });
  await page.waitForSelector('[data-plateforme="android"]', { timeout: 20000 }); await pause(800);
  /* La carte dit le numéro en entier (« En ligne 1.4.1 », « En préparation
     1.4.2 ») ; la date et le build passent dans l'infobulle et sur la page
     de la partie : le texte n'est plus coupé (02/10/2026). */
  const carte = await page.$eval('[data-plateforme="android"]', (el) => el.textContent.replace(/\s+/g, ' '));
  const bulles = await page.$$eval('[data-plateforme="android"] .carte-plateforme-etat[title]', (l) => l.map((e) => e.getAttribute('title')));
  verifier(/En ligne 1\.4\.1/.test(carte) && /^depuis le \d{1,2}(\/\d{2}| \S+)/.test(bulles[0] || ''), 'Android : « En ligne 1.4.1 », daté dans l infobulle', `${carte.trim().slice(0, 160)} | ${bulles.join(' | ')}`);
  verifier(/En préparation 1\.4\.2/.test(carte) && /^En test · depuis le \d{1,2}(\/\d{2}| \S+)/.test(bulles[1] || '') && /build 87/.test(bulles[1] || ''), 'Android : « En préparation 1.4.2 », « en test depuis le … · build 87 » dans l infobulle', `${carte.trim().slice(0, 160)} | ${bulles.join(' | ')}`);
  verifier(Boolean(await page.$('[data-plateforme="android"] a[href*="play.google.com/store"]')) && Boolean(await page.$('[data-plateforme="android"] a[href*="internaltest"]')), 'les boutons « Store » et « Test » sont là');
  const brut = await page.$eval('.cartes-plateformes', (el) => el.textContent);
  verifier(!/\bios\b|\bandroid\b/.test(brut), 'aucune clé brute de plateforme sur les cartes');

  console.log('\n== 14 : le pouls daté, « Attendu de vous » calculé, la tenue des délais sans date');
  const pouls = await page.$eval('.pouls', (el) => el.textContent.replace(/\s+/g, ' '));
  verifier(/mis à jour le \d{1,2}(\/\d{2}| \S+)/.test(pouls) && /par Alex/.test(pouls), 'le pouls dit « mis à jour le … par Alex »', pouls.slice(0, 200));
  verifier(!/Un texte périmé/.test(pouls), '« Attendu de vous » ne lit plus le texte libre de l équipe');
  verifier(Boolean(await page.$('#source-progression')), 'la source de la progression est lisible sous l anneau');
  const tenue = await page.$eval('#tenue-delais', (el) => el.textContent).catch(() => '');
  verifier(/Aucune date de livraison n'est fixée pour l'instant/.test(tenue), 'la section « Tenue des délais » reste et dit qu aucune date n est fixée', tenue.trim().slice(0, 120));
  verifier((await page.$$('a[data-partie]')).length > 0, 'les cartes « Les parties du projet » mènent à la brique');
  /* Les sections du projet sont dans son arbre, dans le rail (02/10/2026). */
  const onglets = await page.$$eval('#lat-corps .lat-arbre[data-arbre="atelier"] .lat-branche .tronque', (els) => els.map((e) => e.textContent.trim()));
  const scenarios = ((await lire('projets/atelier/scenarios?pageSize=5')).documents || []).length;
  const campagnes = ((await lire('projets/atelier/campagnes?pageSize=5')).documents || []).length;
  verifier(onglets.some((t) => /^Campagne de tests/.test(t)) === Boolean(scenarios || campagnes), `l entrée Campagne de tests ${scenarios || campagnes ? 'est là, des scénarios existent' : 'est absente, aucun scénario ni campagne'}`, onglets.join(' | '));

  console.log('\n== 17 : « Une question sur cette étape » ouvre la bulle, sans quitter la page');
  await page.evaluate(() => { location.hash = '#/projets/atelier/etapes'; });
  await page.waitForSelector('[data-action="ouvrir-etape"]', { timeout: 20000 }); await pause(500);
  verifier(!(await page.$('.frise-pct')), 'la frise du devis n affiche plus de pourcentage');
  await page.evaluate(() => { window.__bulle = null; document.addEventListener('bulle:ouvrir', (e) => { window.__bulle = e.detail; }); });
  await page.click('[data-action="ouvrir-etape"]');
  await page.waitForSelector('[data-question]', { timeout: 10000 });
  const adresseAvant = page.url();
  await page.click('[data-question]'); await pause(400);
  const detail = await page.evaluate(() => window.__bulle);
  verifier(Boolean(detail) && detail.projet === 'atelier' && /^À propos de l'étape « /.test(detail.texte || ''), 'l événement bulle:ouvrir part avec le projet et le début de phrase', JSON.stringify(detail));
  verifier(page.url() === adresseAvant, 'et la page ne change pas');

  console.log('\n== 42 et 41 : le calendrier ouvre la fiche d une réunion en un clic, et donne le fichier d agenda');
  await page.evaluate(() => { location.hash = '#/calendrier'; });
  await page.waitForSelector('.calendrier', { timeout: 20000 }); await pause(800);
  verifier(Boolean(await page.$('a.evt[href*="/reunions/re-demain"]')), 'l événement de la grille mène à la fiche de la réunion');
  /* La bulle de discussion est sur toutes les pages (02/10) : on amène le
     bouton au milieu de l'écran, comme on le ferait, pour qu'elle ne le couvre pas. */
  /* Une conversation restée ouverte dans la bulle couvre la droite de la
     page : on la referme d'abord, comme le ferait la personne. */
  if (await page.$('#bulle-panneau:not([hidden])')) { await page.click('#bulle-ouvrir').catch(() => {}); await pause(400); }
  await page.$eval('[data-ics="re-demain"]', (b) => b.scrollIntoView({ block: 'center' })); await pause(300);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('[data-ics="re-demain"]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  verifier(/\.ics$/.test(dl.suggestedFilename()), 'un fichier .ics se télécharge depuis le calendrier', dl.suggestedFilename());
  verifier(/BEGIN:VEVENT/.test(ics) && /LOCATION:Dans vos locaux\\, 12 rue des Lilas/.test(ics), 'avec le lieu, virgule échappée', ics.slice(0, 400));
  verifier(/DESCRIPTION:.*Participants : Camille Martin/.test(ics), 'et les participants dans la description');
  const [dlTout] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('[data-ics-tout]')]);
  const icsTout = fs.readFileSync(await dlTout.path(), 'utf8');
  verifier((icsTout.match(/BEGIN:VEVENT/g) || []).length >= 1, '« Tout mettre dans mon agenda » donne toutes les réunions à venir en un fichier');
  /* Depuis le 01/10/2026, « À venir » ouvre d'abord le détail dans le
     calendrier (agenda, Rejoindre, et le lien vers la fiche). */
  await page.click('.liste [data-action="detail"][data-chemin*="re-demain"]');
  await page.waitForSelector('.modale--cal [data-fiche]', { timeout: 15000 });
  verifier(/Dans vos locaux/.test(await page.$eval('.modale--cal', (el) => el.textContent)) && Boolean(await page.$('.modale--cal [data-ics="re-demain"]')), 'le détail de la réunion s ouvre dans le calendrier, avec le lieu et l agenda');
  await page.click('.modale--cal [data-fiche]');
  await page.waitForURL(/\/projets\/atelier\/reunions\/re-demain/, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.modale-corps', { timeout: 15000 }); await pause(900);
  verifier(/\/projets\/atelier\/reunions\/re-demain/.test(page.url()), 'l adresse est celle de la fiche de la réunion', page.url());
  const fiche = await page.$eval('.modale-corps', (el) => el.textContent);
  verifier(/Dans vos locaux/.test(fiche) && /Ajouter à mon agenda/.test(fiche), 'la fiche s ouvre, avec le lieu et son bouton d agenda');
  verifier(!/Pas encore de contenu/.test(fiche), '« Pas encore de contenu » n apparaît pas quand il y a un ordre du jour');
  await page.click('[data-action-reunion="0"]');
  const coche = await (async () => { const fin = Date.now() + 10000; while (Date.now() < fin) { const r = await lire('reunions/re-demain'); const v = ((((champ(r, 'actions').arrayValue || {}).values || [])[0] || {}).mapValue || {}).fields || {}; if (v.fait && v.fait.booleanValue === true) return true; await pause(400); } return false; })();
  verifier(coche, 'la cliente coche son action, la règle laisse passer et rien d autre ne bouge');
  await page.keyboard.press('Escape'); await pause(300);

  console.log('\n== 19 : la page Activité de tous mes projets');
  await page.evaluate(() => { location.hash = '#/activite'; });
  await page.waitForSelector('.page h1', { timeout: 20000 }); await pause(800);
  verifier(/^Activité/.test(await page.$eval('.page h1', (el) => el.textContent.trim())), 'la page Activité s ouvre');
  verifier((await page.$$('.chrono-item')).length > 0, 'elle liste des mouvements');
  verifier(Boolean(await page.$('[data-nature]')), 'avec des filtres par nature');
  if (await page.$('[data-nature="release"]')) { await page.click('[data-nature="release"]'); await pause(300); verifier((await page.$$('.chrono-item')).length > 0, 'le filtre « Versions » garde des lignes'); }

  console.log('\n== 15 : la fiche d une version par son adresse');
  await page.evaluate(() => { location.hash = '#/projets/atelier/releases/r-and-test'; });
  await page.waitForSelector('.modale-corps', { timeout: 20000 }); await pause(500);
  const version = await page.$eval('.voile', (el) => el.textContent.replace(/\s+/g, ' '));
  verifier(/Android 1\.4\.2/.test(version) && /87/.test(version) && /Version de test/.test(version), 'la fiche « Android 1.4.2 » s ouvre avec son build et son lien de test', version.slice(0, 200));
  await page.keyboard.press('Escape'); await pause(300);

  console.log('\n== 45 : un lien « Accès » avec identifiant copiable');
  await page.evaluate(() => { location.hash = '#/projets/atelier/liens'; });
  await page.waitForSelector('[data-groupe-liens="acces"]', { timeout: 20000 }); await pause(400);
  verifier(/test@atelier\.net/.test(await page.$eval('[data-groupe-liens="acces"]', (el) => el.textContent)), 'le groupe « Accès » montre l identifiant');
  await page.click('[data-action="copier-identifiants"]'); await pause(500);
  const presse = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  verifier(presse === 'test@atelier.net' || /Copié/.test(await page.textContent('body')), 'le bouton « Copier » copie l identifiant', presse);
  verifier(!/\bundefined\b|\bnull\b/.test(await page.textContent('.page')), 'jamais « null » ni « undefined » à l écran');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await remettre();
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-projet-client-echec.png' }); } catch (err) { /* rien */ } }
  try { await remettre(); } catch (err) { /* rien */ }
  process.exit(2);
});
