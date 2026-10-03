/* ==========================================================================
   CAPMEDIA TEST · le parcours du testeur sur un téléphone (390 × 844)

   Ce que l'audit du 03/10/2026 (PARCOURS.md) a trouvé, gardé une fois
   corrigé :
     G10  le premier geste (« Commencer / Continuer ») se voit sans défiler ;
     B3   la liste ouvre la feuille et ne pose aucun résultat ; les mots du
          testeur sont « Réussi / Échec / Sans objet » et « iPhone » ;
     B4   la plateforme est préremplie (iPhone sur un iPhone), jamais vide ;
     G12  un résultat posé ouvre le scénario suivant ;
     G18  l'échec se prouve par un vrai sélecteur : vignettes, plusieurs
          captures, toutes enregistrées ;
     B1   « J'ai terminé » n'apparaît pas tant qu'un échec corrigé attend
          d'être rejoué, puis un seul bouton de fin ;
     B2   après la fin, une case « à rejouer » ne demande plus de refaire ce
          qu'on ne peut plus poser.

   La suite verse elle-même un petit plan (deux sections, cinq scénarios)
   et confie à Karim, sur la campagne du banc, des clés « scénario du plan,
   plateforme » au modèle commun : la plateforme vient de la clé.

   Banc : émulateurs, site local, semer-suivi puis semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PID = 'atelier'; const CID = 'c-oct';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const L = (l) => ({ arrayValue: { values: l } }); const T = (d) => ({ timestampValue: d.toISOString() });
const B = (v) => ({ booleanValue: v }); const N = (v) => ({ integerValue: String(v) }); const M = (o) => ({ mapValue: { fields: o } });
/* Le plan de la suite : deux sections, cinq scénarios faits par un humain. */
const sc = (id, titre) => ({ id, titre, etapes: `Ouvrir l'application.\nFaire ${titre.toLowerCase()}.`, attendu: `${titre} : le résultat s'affiche.`, plateformes: ['ios', 'android', 'web'], type: 'normal', priorite: 'haute', refs: [], qui: 'humain', parcours: [] });
const vides = { fonctionnel: [], technique: [], ux: [], securite: [] };
const SECTIONS = [
  { id: 'pp-dates', groupe: 'demarrage', ordre: 1, titre: 'Dates importantes', resume: 'Les dates.', plateformes: ['ios', 'android', 'web'], aspects: { ...vides,
    fonctionnel: [sc('pp-dates-f-001', 'Créer une date'), sc('pp-dates-f-002', 'Modifier une date'), sc('pp-dates-f-003', 'Supprimer une date')] } },
  { id: 'pp-taches', groupe: 'fonctionnalites', ordre: 2, titre: 'Tâches', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: { ...vides,
    fonctionnel: [sc('pp-taches-f-001', 'Créer une tâche'), sc('pp-taches-f-002', 'Cocher une tâche')] } },
];
const CLES = ['pp-dates-f-001__ios', 'pp-dates-f-002__ios', 'pp-dates-f-003__ios', 'pp-taches-f-001__ios', 'pp-taches-f-002__ios'];
const verserPlan = () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-parcours-testeur-'));
  SECTIONS.forEach((s) => fs.writeFileSync(path.join(racine, `${s.id}.json`), JSON.stringify(s, null, 2)));
  try { return execFileSync(process.execPath, [path.join(__dirname, 'plan-tests-importer.mjs'), PID, racine, '--vrai'], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return `ÉCHEC ${e.stdout || ''}${e.stderr || ''}`; } finally { fs.rmSync(racine, { recursive: true, force: true }); }
};
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { if (await fn()) return true; await pause(ms); } return false; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
/* Une capture d'un pixel, écrite à la volée. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const karim = 'karim.testeur@essai.test';
  const passages = `projets/${PID}/campagnes/${CID}/passages`;
  await vider(passages); await vider(`projets/${PID}/campagnes/${CID}/appreciations`);
  await poser(`projets/${PID}/campagnes/${CID}`, { termines: { mapValue: { fields: {} } }, fins: { mapValue: { fields: {} } } }, ['termines', 'fins']);
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (fiches.find((d) => str(d, 'email') === karim) || { name: '' }).name.split('/').pop();
  verifier(Boolean(uid), 'Karim a une fiche dans le vivier');
  const verse = verserPlan();
  verifier(/2 sections versées/.test(verse), 'le petit plan est versé', verse.slice(-200));
  await poser(`projets/${PID}/campagnes/${CID}`, { plan: B(true), affectation: M({ [uid]: M({ telephone: S('ios'), web: B(false), cles: L(CLES.map(S)), vague: N(1) }) }) }, ['plan', 'affectation']);

  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', karim); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(karim));
  await page.waitForURL(/testeur/, { timeout: 40000 });
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 25000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('[data-continuer]', { timeout: 25000 }); await pause(1200);

  console.log('\n== Le premier jour, sur un iPhone');
  const bas = await page.evaluate(() => { const b = document.querySelector('[data-continuer]'); const r = b.getBoundingClientRect(); return { bas: Math.round(r.bottom), scroll: Math.round((document.scrollingElement || {}).scrollTop || 0) }; });
  verifier(bas.scroll === 0 && bas.bas > 0 && bas.bas <= 844, `« Commencer » se voit sans défiler (bas du bouton à ${bas.bas} px sur 844)`);
  const refs = await page.$$eval('.tb--testeur [data-case]', (l) => l.map((c) => c.dataset.case));
  verifier(refs.length >= 4, `ses scénarios sont là (${refs.length})`);
  verifier((await page.getAttribute('[data-continuer]', 'data-continuer')) === refs[0], 'le geste suivant est son premier scénario');
  verifier(await page.$(`.tb--testeur [data-case="${refs[0]}"][data-suivant]`), 'et sa case est marquée dans le tableau');
  verifier(refs.join('|') === CLES.join('|'), 'ses cases sont ses clés, dans l ordre du plan', refs.join('|'));
  verifier((await page.$$('[data-sur]')).length === 0, 'aucun choix de plateforme : elle vient de sa clé');
  verifier(/sur iPhone/.test(await page.textContent('.t-suite')) && !/\biOS\b/.test(await page.textContent('.page--testeur')), 'le geste suivant dit « sur iPhone », jamais « iOS »', await page.textContent('.t-suite'));
  verifier(!(await page.$('[data-terminer]')), 'pas de bouton de fin le premier jour');

  console.log('\n== La liste ne pose rien');
  await page.click('[data-vue="liste"]'); await pause(600);
  verifier((await page.$$('.t-scenario')).length > 0, 'la liste montre ses scénarios');
  verifier((await page.$$('[data-poser], .t-choix')).length === 0, 'aucun bouton de résultat sur une ligne');
  await page.click(`.t-scenario [data-ouvrir="${refs[0]}"]`); await page.waitForSelector('.modale--scenario', { timeout: 10000 });
  verifier(true, 'toucher une ligne ouvre la feuille du scénario');
  const verdicts = await page.$$eval('[data-feuille-poser]', (l) => l.map((b) => b.textContent.trim()));
  verifier(verdicts.join('|') === 'Réussi|Échec|Sans objet', `la feuille dit Réussi, Échec, Sans objet (${verdicts.join('|')})`);
  const feuille = await page.textContent('.modale--scenario');
  verifier(/À faire sur iPhone/.test(feuille), 'la feuille dit sur quoi le faire : iPhone');
  verifier(/Ce qu'il faut faire/i.test(feuille) && /Ouvrir l'application/.test(feuille) && /Priorité haute/i.test(feuille), 'et montre les étapes et la priorité du plan', feuille.slice(0, 160));
  await page.keyboard.press('Escape'); await pause(500);
  await page.click('[data-vue="grille"]'); await pause(500);

  console.log('\n== Un résultat ouvre le suivant');
  await page.click('[data-continuer]'); await page.waitForSelector('[data-feuille-poser]', { timeout: 10000 });
  await page.click('[data-feuille-poser]:first-child'); await pause(1800);
  const p0 = await lire(`${passages}/${uid}__${refs[0]}`);
  verifier(str(p0, 'plateforme') === 'ios' && str(p0, 'resultat') === 'reussi', `le passage est écrit, sur iPhone, « reussi » (${str(p0, 'plateforme')} ${str(p0, 'resultat')})`);
  await page.waitForSelector('.modale--scenario .fs-enchaine', { timeout: 10000 }).catch(() => null);
  const id = (k) => k.split('__')[0];
  const titreSuivant = await page.evaluate(() => ((document.querySelector('.modale--scenario .modale-tete p') || {}).textContent || ''));
  verifier(titreSuivant.startsWith(id(refs[1])), `la feuille du suivant s'ouvre toute seule (${titreSuivant.slice(0, 30)})`);
  verifier(new RegExp(`${id(refs[0])} enregistré`).test(await page.textContent('.fs-enchaine').catch(() => '')), 'et confirme le résultat posé');

  console.log('\n== Un échec, avec deux captures');
  await page.click('.modale--scenario [data-feuille-poser]:nth-child(2)'); await page.waitForSelector('.t-preuves', { timeout: 10000 });
  const natif = await page.$eval('.t-preuve-fichier', (i) => { const r = i.getBoundingClientRect(); return { multiple: i.multiple, large: r.width > 2 || r.height > 2 }; });
  verifier(natif.multiple && !natif.large, 'le champ fichier du navigateur est caché sous « Ajouter une capture », et accepte plusieurs pièces');
  verifier(/Photothèque/.test(await page.textContent('.voile--feuille')), 'l aide parle des gestes de l iPhone');
  await page.setInputFiles('.t-preuve-fichier', [{ name: 'notes.zip', mimeType: 'application/zip', buffer: PNG }]); await pause(400);
  verifier((await page.$$('.t-preuve')).length === 0 && /MP4|PNG/.test(await page.evaluate(() => ((document.querySelector('.toasts') || {}).innerText || ''))), 'un fichier que le dossier des preuves refuse est écarté, avec la raison');
  await page.setInputFiles('.t-preuve-fichier', [{ name: 'ecran-1.png', mimeType: 'image/png', buffer: PNG }, { name: 'ecran-2.png', mimeType: 'image/png', buffer: PNG }]);
  await pause(500);
  verifier((await page.$$('.t-preuve img')).length === 2, 'deux vignettes, chacune avec son aperçu');
  await page.click('[data-retirer-preuve="1"]'); await pause(300);
  verifier((await page.$$('.t-preuve')).length === 1, 'une capture se retire');
  await page.setInputFiles('.t-preuve-fichier', [{ name: 'ecran-3.png', mimeType: 'image/png', buffer: PNG }]); await pause(300);
  await page.fill('#t-quoi', 'Rien ne se passe quand je valide.');
  await page.click('.voile--feuille [data-valider]');
  await page.waitForSelector('.voile--feuille', { state: 'detached', timeout: 20000 }).catch(() => null);
  await pause(1500);
  const p1 = await lire(`${passages}/${uid}__${refs[1]}`);
  const preuves = ((champ(p1, 'preuves').arrayValue || {}).values || []).map((v) => v.stringValue);
  verifier(preuves.length === 2 && preuves.every((x) => /ecran-[13]\.png$/.test(x)), `les deux captures sont enregistrées avec l échec (${preuves.length})`);
  verifier(Boolean(await page.$('.modale--scenario .fs-enchaine')), 'et le scénario suivant s ouvre');
  await page.keyboard.press('Escape'); await pause(600);

  console.log('\n== Un échec à rejouer retient la fin');
  for (const ref of refs.slice(2)) await poser(`${passages}/${uid}__${ref}`, { scenario: S(id(ref)), testeur: S(uid), plateforme: S('ios'), resultat: S('reussi'), commentaire: S(''), preuves: L([]), contexte: { mapValue: { fields: {} } }, cree: T(new Date()), maj: T(new Date()) });
  await poser(`${passages}/${uid}__${refs[1]}`, { aRevoir: { booleanValue: true } }, ['aRevoir']);
  await attendre(async () => /À rejouer/i.test(await page.textContent('.t-suite').catch(() => '')), 30, 500);
  verifier(/À rejouer/i.test(await page.textContent('.t-suite').catch(() => '')) && (await page.getAttribute('[data-continuer]', 'data-continuer')) === refs[1], 'le geste suivant est l échec corrigé, à rejouer');
  verifier(!(await page.$('[data-terminer]')), 'pas de « J ai terminé » tant qu il reste un scénario à rejouer');
  await page.click('[data-continuer]'); await page.waitForSelector('[data-feuille-poser]', { timeout: 10000 });
  verifier(/Refaites-le/.test(await page.textContent('.modale--scenario')), 'sa feuille demande de le refaire');
  await page.click('[data-feuille-poser]:first-child');
  const fin = await attendre(async () => page.$('[data-terminer]'), 30, 500);
  verifier(fin, 'rejoué, le bouton de fin apparaît');
  verifier(/Terminer et donner mon avis/.test(await page.textContent('[data-terminer]').catch(() => '')) && !(await page.$('.page--testeur [data-avis="apres"]')), 'un seul bouton à la fin : « Terminer et donner mon avis »');
  if (await page.$('.voile')) { await page.keyboard.press('Escape'); await pause(500); }

  console.log('\n== Après la fin, plus rien à refaire');
  await poser(`projets/${PID}/campagnes/${CID}/appreciations/${uid}`, { termine: T(new Date()), testeur: S(uid) });
  await poser(`${passages}/${uid}__${refs[1]}`, { resultat: S('echec'), aRevoir: { booleanValue: true }, commentaire: S('Toujours rien.'), preuves: L([S(preuves[0])]) }, ['resultat', 'aRevoir', 'commentaire', 'preuves']);
  await page.reload(); await page.waitForSelector('.fin-test--faite', { timeout: 25000 }).catch(() => null); await pause(1200);
  verifier(await page.$('.fin-test--faite'), 'la page dit que le test est terminé');
  await page.click(`.tb--testeur [data-case="${refs[1]}"]`); await page.waitForSelector('.modale--scenario', { timeout: 10000 });
  const fige = await page.textContent('.modale--scenario');
  verifier(!/Refaites-le/.test(fige) && /rien à refaire/.test(fige), 'la case corrigée ne demande plus de la refaire', fige.slice(0, 120));
  verifier(!(await page.$('[data-feuille-poser]')), 'et ne propose aucun résultat');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await page.screenshot({ path: '/tmp/qa-parcours-testeur-fin.png' }).catch(() => {});
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-parcours-testeur-echec.png' }); console.error('capture : /tmp/qa-parcours-testeur-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
