/* ==========================================================================
   CAPMEDIA CLIENT HUB · la fiche du testeur, la note du test, les
   identifiants et les magasins

   Karim arrive pour la première fois : sa fiche passe devant tout, il ne
   peut pas l'esquiver, l'appareil est relevé par la machine, il complète
   et valide ; la base porte sa validation, le Cockpit la lit, le client
   lit un profil enrichi sans nom. Puis : « L'application » montre les
   instructions et les identifiants posés par l'équipe ; « J'ai terminé »
   demande une note du test, que l'équipe reçoit ; après, les fiches des
   magasins sont proposées.

   Banc : émulateurs, site local, semer-suivi puis semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PID = 'atelier'; const CID = 'c-oct';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const L = (l) => ({ arrayValue: { values: l } }); const T = (d) => ({ timestampValue: d.toISOString() });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
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
const toast = (page) => page.evaluate(() => ((document.querySelector('.toasts') || {}).innerText || '').trim());
const envoisDe = async (modele) => (((await lire('envois?pageSize=300')) || {}).documents || []).filter((d) => str(d, 'modele') === modele);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const karim = 'karim.testeur@essai.test';
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (fiches.find((d) => str(d, 'email') === karim) || { name: '' }).name.split('/').pop();
  verifier(Boolean(uid), 'Karim a une fiche dans le vivier');
  /* Karim redevient neuf : fiche à valider. Et la campagne reçoit ce que
     l'équipe y pose pour lui : instructions, identifiants, magasins. */
  await fetch(`${bdd(`testeurs/${uid}`)}?updateMask.fieldPaths=ficheValidee&updateMask.fieldPaths=nom&updateMask.fieldPaths=appareils`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
  await poser(`projets/${PID}/campagnes/${CID}`, {
    acces: { mapValue: { fields: { instructions: S('Ouvrez l\'application, touchez « Créer un compte », entrez le code TESTEUR.'), identifiants: S('test1@exemple.test · Banc2026!') } } },
    magasins: { mapValue: { fields: { ios: S('https://apps.apple.com/fr/app/exemple/id000'), android: S('https://play.google.com/store/apps/details?id=exemple') } } },
    termines: { mapValue: { fields: {} } }, fins: { mapValue: { fields: {} } },
  }, ['acces', 'magasins', 'termines', 'fins']);
  await vider(`projets/${PID}/campagnes/${CID}/passages`); await vider(`projets/${PID}/campagnes/${CID}/appreciations`); await vider('envois');

  console.log('\n== La première connexion : l accueil, puis la fiche');
  await connecter(page, karim);
  await page.waitForSelector('.accueil [data-accueil="passer"]', { timeout: 20000 }).catch(() => null);
  verifier(await page.$('.accueil') && !(await page.$('#ft-prenom')), 'l accueil passe d abord : il sait ce qu est Capmedia Test avant qu on lui demande son âge');
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('#ft-prenom', { timeout: 20000 });
  verifier(true, 'puis la fiche s ouvre');
  verifier(!/Bienvenue/.test(await page.textContent('.feuille h2')), 'sans redire « Bienvenue »', await page.textContent('.feuille h2'));
  verifier(await page.$('.feuille [data-sortir-fiche]'), 'avec une sortie : « Se déconnecter »');
  verifier(await page.$('#ft-sexe option[value="non-dit"]'), 'et le droit de ne pas dire son sexe');
  verifier(/65 ans et plus/.test(await page.textContent('#ft-age')), 'la dernière tranche se lit « 65 ans et plus »');
  verifier(!(await page.$('.modale [data-fermer], .feuille [data-fermer]')), 'et ne se ferme pas sans être validée');
  await page.keyboard.press('Escape'); await pause(300);
  verifier(await page.$('#ft-prenom'), 'même avec Échap');
  verifier((await page.inputValue('#ft-prenom')) === 'Karim', 'le prénom vient du Cockpit');
  const releve = await page.textContent('.appareil-releve');
  verifier(/Chrome|Chromium|Navigateur/.test(releve) && /Écran \d+×\d+/.test(releve), 'l appareil est relevé par la machine (système, navigateur, écran)', releve.slice(0, 80));
  await page.click('[data-valider]'); await pause(500);
  verifier(/prénom et votre nom|nom/.test(await toast(page)), 'valider sans nom est refusé', await toast(page));
  await page.fill('#ft-nom', 'Benali');
  await page.selectOption('#ft-sexe', 'homme'); await page.selectOption('#ft-age', '25-34');
  await page.fill('#ft-expertise', 'Pharmacien'); await page.selectOption('#ft-aisance', 'À l\'aise');
  await page.fill('#ft-modele', 'MacBook Air M2');
  await page.click('[data-valider]');
  await page.waitForSelector('#ft-prenom', { state: 'detached', timeout: 10000 });
  verifier(true, 'validée, la fiche se referme');
  const f2 = await lire(`testeurs/${uid}`);
  verifier(Boolean(champ(f2, 'ficheValidee').timestampValue) && str(f2, 'nom') === 'Benali', 'la base porte la validation et le nom');
  const profil = (champ(f2, 'profil').mapValue || {}).fields || {};
  verifier((profil.expertise || {}).stringValue === 'Pharmacien' && (profil.age || {}).stringValue === '25-34', 'et le profil qu il a rempli');
  const appareils = (champ(f2, 'appareils').arrayValue || {}).values || [];
  const a0 = appareils.length ? (appareils[0].mapValue || {}).fields || {} : {};
  verifier(appareils.length === 1 && (a0.modele || {}).stringValue === 'MacBook Air M2' && Boolean((a0.os || {}).stringValue), 'et son appareil, modèle complété, système relevé', JSON.stringify(a0).slice(0, 120));
  const recopie = await attendre(async () => { const p = await lire(`projets/${PID}/profilsTesteurs/${uid}`); return str(p, 'expertise') === 'Pharmacien' && Boolean(champ(p, 'ficheValidee').timestampValue); }, 60, 500);
  verifier(recopie, 'le serveur recopie le profil enrichi sous le projet, pour le client');
  await page.waitForSelector('.testeur-tete', { timeout: 20000 });
  verifier(!(await page.$('.accueil')), 'puis la campagne, sans repasser par l accueil');

  console.log('\n== L application : instructions, identifiants, copie');
  await page.evaluate(() => { location.hash = '#/application'; }); await page.waitForSelector('#identifiants-bloc', { timeout: 10000 });
  verifier(/code TESTEUR/.test(await page.textContent('.page')), 'les instructions d inscription sont là');
  verifier(/Banc2026!/.test(await page.textContent('#identifiants-bloc')), 'et les identifiants de test');
  await page.click('[data-copier-identifiants]'); await pause(400);
  verifier(/copi/i.test(await toast(page)), 'le bouton copie', await toast(page));
  verifier(!/Noter sur/.test(await page.textContent('.page')), 'les magasins ne sont pas proposés avant la fin du test');

  console.log('\n== J ai terminé : la note du test, puis les magasins');
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.tb--testeur [data-case]', { timeout: 10000 });
  const refs = await page.$$eval('.tb--testeur [data-case]', (l) => l.map((c) => c.dataset.case));
  /* Une case est une clé « scénario du plan, plateforme » (03/10/2026). */
  for (const ref of refs) { const [scen, plat] = ref.split('__'); await poser(`projets/${PID}/campagnes/${CID}/passages/${uid}__${ref}`, { scenario: S(scen), testeur: S(uid), plateforme: S(plat), resultat: S('reussi'), commentaire: S(''), preuves: L([]), contexte: { mapValue: { fields: {} } }, cree: T(new Date()), maj: T(new Date()) }); }
  /* L'avis de fin d'abord : obligatoire depuis le 08/10/2026. */
  await attendre(async () => page.$('[data-fin-avis] [data-avis="apres"]'), 30, 500);
  await page.click('[data-fin-avis] [data-avis="apres"]');
  await page.waitForSelector('.voile [data-question] button[data-avis]', { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('.voile [data-question]').forEach((g) => { const b = g.querySelectorAll('button[data-avis]'); if (b.length) b[Math.min(3, b.length - 1)].click(); }));
  await page.click('.voile [data-envoyer]');
  await attendre(async () => page.$('[data-terminer]'), 30, 500);
  await page.click('[data-terminer]'); await page.waitForSelector('[data-note-test]', { timeout: 10000 });
  await page.click('[data-valider]'); await pause(400);
  verifier(/note au test/.test(await toast(page)), 'sans note, on ne termine pas', await toast(page));
  await page.click('[data-note-test="4"]'); await page.fill('#note-test-texte', 'Le scénario DI-15 manquait d une capture d exemple.');
  await page.click('[data-valider]'); await pause(2000);
  if (await page.$('[data-envoyer]')) { await page.keyboard.press('Escape'); await pause(500); }
  /* La note du test vit à part (equipe/retour), que le client ne lit pas. */
  const appr = await lire(`projets/${PID}/campagnes/${CID}/appreciations/${uid}/equipe/retour`);
  const nt = (champ(appr, 'noteTest').mapValue || {}).fields || {};
  verifier((nt.note || {}).integerValue === '4' && /DI-15/.test((nt.commentaire || {}).stringValue || ''), 'la note du test est enregistrée avec ses mots');
  verifier(/Noter sur l'App Store/.test(await page.textContent('.page')) && /Noter sur l'Play Store|Play Store/.test(await page.textContent('.page')), 'les deux magasins sont proposés une fois le test fini');
  const hrefs = await page.$$eval('[data-magasin]', (l) => l.map((a) => a.getAttribute('href')));
  verifier(hrefs.length === 2 && hrefs.every((h) => /^https:\/\//.test(h)), 'avec leurs adresses');
  const lettre = await attendre(async () => (await envoisDe('testeur-termine')).length === 1, 60, 500);
  const v = lettre ? ((((await envoisDe('testeur-termine'))[0].fields.variables || {}).mapValue || {}).fields || {}) : {};
  verifier(lettre && (v.noteTest || {}).stringValue === '4 sur 5', 'la lettre du bilan porte la note du test', JSON.stringify(v.noteTest));
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  console.log('\n== Le Cockpit et le Hub lisent la fiche');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.evaluate(() => { location.hash = '#/tests?projet=atelier'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-action="ouvrir-testeur"]', { timeout: 20000 });
  const ouvrirKarim = async () => {
    for (let i = 0; i < 6; i += 1) {
      const b = await equipe.$(`[data-action="ouvrir-testeur"][data-id="${uid}"]`);
      if (b) { await b.scrollIntoViewIfNeeded().catch(() => null); await b.click({ force: true }).catch(() => null); }
      await pause(900);
      const t = await equipe.textContent('.feuille .modale-corps').catch(() => '');
      if (/Fiche validée/.test(t)) return t;
      await equipe.keyboard.press('Escape'); await pause(500);
    }
    return equipe.textContent('.feuille .modale-corps').catch(() => '');
  };
  const ficheCockpit = await ouvrirKarim();
  verifier(/Fiche validée par Karim Benali/.test(ficheCockpit), 'le Cockpit dit « Fiche validée par Karim Benali le … »');
  const expertiseCockpit = await equipe.inputValue('#t-expertise').catch(() => '');
  verifier(/MacBook Air M2/.test(ficheCockpit) && expertiseCockpit === 'Pharmacien', 'avec son appareil et son domaine', `${expertiseCockpit} · ${(ficheCockpit.match(/MacBook[^·]*/) || [''])[0]}`);
  await equipe.keyboard.press('Escape'); await pause(300);
  let fc = '';
  for (let i = 0; i < 6; i += 1) { await equipe.click('[data-action="ouvrir-campagne"]'); await pause(900); fc = await equipe.textContent('.feuille .modale-corps').catch(() => ''); if (/Note du test/.test(fc)) break; await equipe.keyboard.press('Escape'); await pause(600); }
  verifier(/Note du test\s*:\s*4\/5/.test(fc) && /DI-15/.test(fc), 'la fiche campagne montre la note du test et ses mots');

  const client = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await connecter(client, 'camille.essai@exemple.test');
  await client.evaluate(() => { location.hash = '#/tests?projet=atelier'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await client.waitForSelector('[data-action="ouvrir-campagne"]', { timeout: 20000 });
  let fcl = '';
  for (let i = 0; i < 6; i += 1) { await client.click('[data-action="ouvrir-campagne"]'); await pause(900); fcl = await client.textContent('.feuille .modale-corps').catch(() => ''); if (/Pharmacien/.test(fcl)) break; await client.keyboard.press('Escape'); await pause(600); }
  /* Depuis le 03/10/2026, la note du test (la clarté des consignes) est
     une affaire d'équipe : le client la lirait comme une note de son
     application. */
  verifier(fcl.length > 0 && !/Note du test|Clarté des consignes/.test(fcl) && !/manquait d une capture/.test(fcl) && !/Karim/.test(fcl), 'le client ne lit ni la note du test, ni ses mots, ni le nom', fcl.match(/Note du test[^\n]{0,40}/) ? fcl.match(/Note du test[^\n]{0,40}/)[0] : '');
  await client.click('[data-voir-avis]').catch(() => null); await pause(900);
  const avisClient = await client.textContent('body');
  verifier(/Pharmacien/.test(avisClient) && /MacBook Air M2/.test(avisClient) && !/Benali/.test(avisClient), 'et un profil enrichi (domaine, appareil) sous un numéro, sans nom', avisClient.match(/Testeur \d[^\n]{0,80}/) ? avisClient.match(/Testeur \d[^\n]{0,80}/)[0] : '(rien)');

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-fiche-testeur-echec.png' }); console.error('capture : /tmp/qa-fiche-testeur-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
