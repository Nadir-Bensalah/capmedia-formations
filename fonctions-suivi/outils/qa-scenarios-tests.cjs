/* ==========================================================================
   CAPMEDIA CLIENT HUB · la bibliothèque de scénarios à l'épreuve

   Écrire un scénario, le corriger, l'effacer, et vérifier que le client
   voit la liste sans pouvoir y toucher. Deux pièges sont gardés ici parce
   qu'ils ne se voient pas à l'œil : une référence déjà prise écraserait un
   scénario existant en silence, et les passages consignés sous cette
   référence changeraient de sens ; une feuille qui se ferme sur un refus
   efface la saisie de celui qui vient de se tromper.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/importer-scenarios.mjs atelier <plan.md> --vrai
     node fonctions-suivi/outils/qa-scenarios-tests.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d';
const SITE = 'http://127.0.0.1:8787';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const proprietaire = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => { const r = await fetch(bdd(c), { headers: proprietaire }); return r.ok ? r.json() : null; };
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

  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, '/projets/atelier/tests', '.scenario');

  const compte = () => page.evaluate(() => document.querySelectorAll('.scenario').length);
  const avant = await compte();

  console.log('\n== Créer');
  await page.click('[data-action="nouveau"][data-genre="scenario"]'); await pause(900);
  // Reference invalide d'abord : la garde doit tenir.
  await page.fill('#ed-ref', 'nimporte'); await page.fill('#ed-titre', 'Essai');
  await page.fill('#ed-attendu', 'Rien'); await page.click('button[type="submit"][form="ed-forme"]'); await pause(700);
  verifier(await page.evaluate(() => !!document.querySelector('.voile')), 'une référence invalide ne passe pas', 'la feuille s\'est fermée');

  await page.fill('#ed-ref', 'ZZ-01');
  await page.fill('#ed-titre', 'Scénario écrit à la main');
  await page.fill('#ed-options', 'Poser **deux** options');
  await page.fill('#ed-attendu', 'Le résultat se voit tout de suite');
  await page.selectOption('#ed-niveau', 'socle');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  verifier(await compte() === avant + 1, `créé : ${avant} puis ${await compte()}`, `attendu ${avant + 1}`);
  const enBase = await lire('projets/atelier/scenarios/ZZ-01');
  verifier(!!enBase, 'ZZ-01 est en base');
  verifier(enBase && enBase.fields.niveau.stringValue === 'socle', 'son niveau est bien socle');

  console.log('\n== Le doublon');
  await page.click('[data-action="nouveau"][data-genre="scenario"]'); await pause(900);
  await page.fill('#ed-ref', 'ZZ-01'); await page.fill('#ed-titre', 'Un autre');
  await page.fill('#ed-attendu', 'Autre chose');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(500);
  const refus = await page.evaluate(() => ({
    feuilleOuverte: !!document.querySelector('.voile'),
    toast: ((document.querySelector('.toasts') || {}).innerText || '').trim(),
  }));
  await pause(900);
  verifier(refus.feuilleOuverte, 'la feuille reste ouverte sur un doublon', 'elle s\'est fermée');
  verifier(/existe déjà/i.test(refus.toast), 'le refus est annoncé', `message vu : « ${refus.toast || 'aucun'} »`);
  const apresDoublon = await lire('projets/atelier/scenarios/ZZ-01');
  verifier(apresDoublon && apresDoublon.fields.titre.stringValue === 'Scénario écrit à la main', 'le scénario d\'origine est intact');
  await page.keyboard.press('Escape'); await pause(700);

  console.log('\n== Modifier');
  const ligne = '[data-action="ouvrir-scenario"][data-ref="ZZ-01"]';
  await page.hover(ligne);
  await page.click('[data-action="editer"][data-genre="scenario"][data-id="ZZ-01"]'); await pause(1000);
  verifier(await page.evaluate(() => { const c = document.querySelector('#ed-ref'); return !!c && c.hasAttribute('readonly'); }), 'la référence est en lecture seule', 'on peut la changer');
  await page.fill('#ed-titre', 'Titre corrigé');
  await page.selectOption('#ed-niveau', 'reparti');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  const apres = await lire('projets/atelier/scenarios/ZZ-01');
  verifier(apres && apres.fields.titre.stringValue === 'Titre corrigé', 'le titre est enregistré');
  verifier(apres && apres.fields.niveau.stringValue === 'reparti', 'le niveau est enregistré');
  verifier(await page.evaluate(() => !document.querySelector('.scenario--double [data-ref="ZZ-01"]')), 'le liseré a disparu avec le niveau');

  console.log('\n== Supprimer');
  await page.hover(ligne);
  await page.click('[data-action="supprimer"][data-genre="scenario"][data-id="ZZ-01"]'); await pause(900);
  const oui = await page.$$('.voile [data-oui]');
  if (oui.length) { await oui[oui.length - 1].click(); await pause(2200); }
  verifier(!(await lire('projets/atelier/scenarios/ZZ-01')), 'ZZ-01 est supprimé de la base');
  verifier(await compte() === avant, `la liste est revenue à ${avant}`, `elle est à ${await compte()}`);

  console.log('\n== Le client');
  const nav2 = await chromium.launch();
  const client = await (await nav2.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await connecter(client, 'camille.essai@exemple.test');
  await aller(client, '/projets/atelier/tests', '.scenario');
  await pause(1200);
  const vueClient = await client.evaluate(() => ({
    scenarios: document.querySelectorAll('.scenario').length,
    boutonNouveau: document.querySelectorAll('[data-action="nouveau"][data-genre="scenario"]').length,
    boutonsEdition: document.querySelectorAll('.scenario [data-action="editer"]').length,
  }));
  verifier(vueClient.scenarios === avant, `le client voit les ${avant} scénarios`, `il en voit ${vueClient.scenarios}`);
  verifier(vueClient.boutonNouveau === 0, 'le client n\'a pas le bouton de création');
  verifier(vueClient.boutonsEdition === 0, 'le client n\'a pas les boutons de modification');

  console.log('\n' + (soucis.length ? `${soucis.length} ÉCART(S)` : 'tout est conforme'));
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length ? 1 : 0);
})();
