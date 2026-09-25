require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la bibliothèque de scénarios à l'épreuve

   Depuis la console de tests (22/09/2026, commit 505796f), la liste des
   scénarios d'un projet se LIT dans la console, en lecture seule, et
   s'alimente par importer-scenarios.mjs. L'onglet Tests d'un projet ne
   garde qu'une porte d'écriture : « Nouveau scénario », sur un projet qui
   n'a encore ni scénario ni campagne. La modification et la suppression
   depuis l'écran n'existent plus ; la suite ne les éprouve donc plus.

   Ce qu'elle garde, parce que ça ne se voit pas à l'œil : une référence
   déjà prise écraserait un scénario existant en silence (et les passages
   consignés sous elle changeraient de sens) ; une feuille qui se ferme sur
   un refus efface la saisie de celui qui vient de se tromper. Puis la
   console montre le scénario, en lecture seule, à l'équipe et au client.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/qa-scenarios-tests.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d';
const SITE = 'http://127.0.0.1:8787';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const proprietaire = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), proprietaire);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: proprietaire }); };
const soucis = []; const ok = (m) => console.log('  ok     ' + m);
const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, bien, mal) => (c ? ok(bien) : dire(mal ? `${bien} · ${mal}` : bien));

const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=100');
    const pour = ((j && j.documents) || []).filter((d) => {
      const a = ((((d.fields || {}).a || {}).arrayValue) || {}).values || [];
      return a.some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === email);
    });
    if (pour.length) {
      pour.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
      const v = (((pour[0].fields.variables || {}).mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
/* Les courriels de code ne sont jamais purgés par l'application, et la
   lecture REST rend les cent premiers par identifiant, pas par date :
   passé cent envois, le code le plus récent peut manquer à la page, et la
   suite tape un code périmé. On vide donc AVANT d'en demander un neuf. */
const connecter = async (page, email) => {
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};
/* Poser l'adresse ne suffit pas : juste après la connexion le document
   vient d'être remplacé, et le routeur peut manquer l'événement natif. On
   repose l'adresse jusqu'à ce que la PAGE ait changé, pas seulement le
   hash : c'est la leçon du banc d'essai existant, et j'avais posé la
   sortie sur le mauvais critère. */
const aller = async (page, hash, attendu) => {
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    await pause(1500);
    const bon = await page.evaluate((sel) => location.hash && (!sel || !!document.querySelector(sel)), attendu || null);
    if (bon) return;
  }
};

(async () => {
  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('PAGE: ' + e.message));
  /* Le projet « boutique » du semis n'a ni scénario ni campagne : c'est le
     seul cas où l'onglet Tests propose encore d'en écrire un. */
  const P = 'boutique';
  await fetch(`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/projets/${P}/scenarios/ZZ-01`, { method: 'DELETE', headers: proprietaire });

  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, `/projets/${P}/tests`, '[data-action="nouveau"][data-genre="scenario"]');

  console.log('\n== Créer, sur un projet encore vide');
  verifier(await page.evaluate(() => !!document.querySelector('[data-action="nouveau"][data-genre="scenario"]')), 'l onglet Tests d un projet vide propose « Nouveau scénario »');
  await page.click('[data-action="nouveau"][data-genre="scenario"]'); await pause(900);
  /* Une référence invalide d'abord : la garde doit tenir, et la saisie rester. */
  await page.fill('#ed-ref', 'nimporte'); await page.fill('#ed-titre', 'Essai');
  await page.fill('#ed-attendu', 'Rien'); await page.click('button[type="submit"][form="ed-forme"]'); await pause(700);
  verifier(await page.evaluate(() => !!document.querySelector('#ed-forme')), 'une référence invalide ne passe pas', 'la feuille s\'est fermée');
  verifier(await page.$eval('#ed-titre', (e) => e.value).catch(() => '') === 'Essai', 'et la saisie est gardée');

  await page.fill('#ed-ref', 'ZZ-01');
  await page.fill('#ed-titre', 'Scénario écrit à la main');
  await page.fill('#ed-options', 'Poser **deux** options');
  await page.fill('#ed-attendu', 'Le résultat se voit tout de suite');
  await page.selectOption('#ed-niveau', 'socle');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  verifier(!(await page.$('#ed-forme')), 'la feuille se ferme après la création');
  const enBase = await lire(`projets/${P}/scenarios/ZZ-01`);
  verifier(!!enBase, 'ZZ-01 est en base');
  verifier(enBase && enBase.fields.niveau.stringValue === 'socle', 'son niveau est bien socle');

  console.log('\n== Le doublon');
  /* L'onglet ne propose plus d'écrire (le projet a un scénario) : on ouvre
     l'éditeur par le module, comme le fait le bouton, pour éprouver la garde. */
  const proposeEncore = await page.evaluate(() => !!document.querySelector('[data-action="nouveau"][data-genre="scenario"]'));
  verifier(!proposeEncore, 'une fois un scénario écrit, l onglet renvoie à la console');
  await page.evaluate(async (pid) => { const m = await import('./assets/js/vues/editeurs.js'); const s = await (await import('./assets/js/noyau.js')).session(); m.editer('scenario', { session: s, role: 'equipe' }, { pid }); }, P);
  await page.waitForSelector('#ed-ref', { timeout: 8000 }).catch(() => {});
  await page.fill('#ed-ref', 'ZZ-01'); await page.fill('#ed-titre', 'Un autre');
  await page.fill('#ed-attendu', 'Autre chose');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(500);
  const refus = await page.evaluate(() => ({
    feuilleOuverte: !!document.querySelector('#ed-forme'),
    toast: ((document.querySelector('.toasts') || {}).innerText || '').trim(),
  }));
  await pause(900);
  verifier(refus.feuilleOuverte, 'la feuille reste ouverte sur un doublon', 'elle s\'est fermée');
  verifier(/existe déjà/i.test(refus.toast), 'le refus est annoncé', `message vu : « ${refus.toast || 'aucun'} »`);
  const apresDoublon = await lire(`projets/${P}/scenarios/ZZ-01`);
  verifier(apresDoublon && apresDoublon.fields.titre.stringValue === 'Scénario écrit à la main', 'le scénario d\'origine est intact');
  await page.keyboard.press('Escape'); await pause(700);

  console.log('\n== La console le montre, en lecture seule');
  await aller(page, `/tests?projet=${P}`, '[data-scenario="ZZ-01"]');
  verifier(await page.evaluate(() => !!document.querySelector('[data-scenario="ZZ-01"]')), 'ZZ-01 est dans la console du projet');
  /* La bibliothèque est repliée sous « Voir la bibliothèque » : on la déplie, comme on le ferait. */
  await page.click('[data-plier-scenarios]'); await pause(700);
  await page.click('[data-scenario="ZZ-01"]'); await pause(900);
  const feuille = await page.evaluate(() => { const v = [...document.querySelectorAll('.voile')].pop(); return v ? { texte: v.innerText, edition: v.querySelectorAll('[data-action="editer"], [data-action="supprimer"], form').length } : null; });
  verifier(feuille && /Le résultat se voit tout de suite/.test(feuille.texte), 'sa fiche s ouvre avec le résultat attendu');
  verifier(feuille && feuille.edition === 0, 'sans rien pour la modifier ni la supprimer');
  await page.keyboard.press('Escape'); await pause(500);

  console.log('\n== Le client');
  const nav2 = await chromium.launch();
  const client = await (await nav2.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await connecter(client, 'lea.essai@exemple.test');
  await aller(client, `/tests?projet=${P}`, '[data-scenario="ZZ-01"]');
  await pause(1200);
  const vueClient = await client.evaluate(() => ({
    scenario: !!document.querySelector('[data-scenario="ZZ-01"]'),
    boutonNouveau: document.querySelectorAll('[data-action="nouveau"][data-genre="scenario"]').length,
    boutonsEdition: document.querySelectorAll('[data-action="editer"][data-genre="scenario"], [data-action="supprimer"][data-genre="scenario"]').length,
  }));
  verifier(vueClient.scenario, 'le client voit le scénario de son projet');
  verifier(vueClient.boutonNouveau === 0, 'le client n\'a pas le bouton de création');
  verifier(vueClient.boutonsEdition === 0, 'le client n\'a pas les boutons de modification');

  /* Ménage : le scénario d'essai ne reste pas au banc. */
  await fetch(`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/projets/${P}/scenarios/ZZ-01`, { method: 'DELETE', headers: proprietaire });

  console.log('\n' + (soucis.length ? `${soucis.length} ÉCART(S)` : 'tout est conforme'));
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length || erreurs.length ? 1 : 0);
})();
