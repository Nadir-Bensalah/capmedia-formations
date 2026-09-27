/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'espace Test, ses pages et ses gestes
   L'accueil de la première fois (la marque, le prénom, les sept écrans,
   l'application de la campagne avec ses écrans), le sombre par défaut, le
   rail, les astuces, le chronomètre, Mon avis, le guide et la recherche,
   vus par un testeur du banc (semer-campagne.mjs).
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const BDD = 'http://127.0.0.1:8080/v1/projects/capmedia-1f90d/databases/(default)/documents';
const prop = { Authorization: 'Bearer owner' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const vider = async (c) => { const j = await (await fetch(`${BDD}/${c}?pageSize=300`, { headers: prop })).json(); for (const d of (j.documents || [])) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const code = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await (await fetch(`${BDD}/envois?pageSize=200`, { headers: prop })).json(); const d = (j.documents || []).filter((x) => (x.fields.modele || {}).stringValue === 'code' && JSON.stringify(x.fields.a).includes(e)).sort((a, b) => new Date(b.fields.cree.timestampValue) - new Date(a.fields.cree.timestampValue))[0]; if (d) return d.fields.variables.mapValue.fields.code.stringValue; await pause(300); } return ''; };
/* Les appréciations de la campagne du banc : c'est là que l'accueil se consigne. */
const appreciations = async () => { const j = await (await fetch(`${BDD}/projets/atelier/campagnes/c-oct/appreciations?pageSize=50`, { headers: prop })).json(); return j.documents || []; };
let ok = 0; const ecarts = [];
const verifier = (c, m) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}`); } };
let page = null;
(async () => {
  const nav = await chromium.launch();
  page = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  /* Les réponses du Storage : si une capture ne se résout pas, on veut savoir pourquoi (403 : règle ; 404 : fichier absent). */
  const stockage = []; page.on('response', (r) => { if (/:9199\//.test(r.url())) stockage.push(`${r.status()} ${r.url().replace(/^.*\/o\//, '').slice(0, 60)}`); });
  page.on('requestfailed', (r) => { if (/:9199\//.test(r.url())) stockage.push(`échec ${r.failure() && r.failure().errorText} ${r.url().slice(-40)}`); });
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') stockage.push(`console ${m.text().slice(0, 100)}`); });
  await vider('connexions'); await vider('connexionsIp');
  /* Un testeur neuf : aucune appréciation, donc aucun accueil consigné. */
  for (const d of await appreciations()) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop });
  await page.goto((process.env.BANC_SITE || 'http://127.0.0.1:8787') + '/suivi/?emul', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)'); await page.fill('#email', 'karim.testeur@essai.test'); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)'); await page.fill('#code', await code('karim.testeur@essai.test'));
  await page.waitForURL(/testeur/); await page.waitForSelector('.accueil-porte', { timeout: 20000 });

  console.log('\n== La première fois : l accueil');
  verifier((await page.getAttribute('html', 'data-theme')) === 'dark', 'l espace Test est sombre par défaut');
  verifier(await page.$('.accueil-logo .feuille--4'), 'la marque en quatre feuilles est au centre');
  verifier(/Bienvenue, Karim/.test(await page.textContent('.accueil-porte h1')), 'la porte dit bienvenue au prénom');
  verifier(/Capmedia\s*Test/.test(await page.textContent('.accueil-marque')), 'et nomme Capmedia Test');
  await page.waitForSelector('.testeur-tete', { state: 'attached', timeout: 20000 });
  await page.click('[data-accueil="commencer"]'); await page.waitForSelector('.accueil-guide'); await pause(500);
  verifier(/Vous testez avant les clients/.test(await page.textContent('.ecran.actif')), 'Commencer ouvre le premier écran, le rôle');
  await page.click('[data-accueil="suivant"]'); await pause(700);
  const appli = await page.textContent('.ecran.actif');
  verifier(/Atelier/.test(appli) && /dans une seule application/.test(appli), 'le deuxième écran présente l application de la campagne, avec sa phrase');
  verifier((await page.$$('.ecran.actif .atouts li')).length === 3, 'et ses trois points forts');
  /* Les adresses des écrans se résolvent après coup (Storage) : on leur
     laisse quelques secondes. */
  /* Les trois, pas seulement la première : le Storage du banc résout
     parfois la dernière plusieurs secondes après les autres. */
  await page.waitForFunction(() => { const l = [...document.querySelectorAll('.ecran.actif .telephone-ecran img')]; return l.length && l.every((i) => /^http/.test(i.getAttribute('src') || '')); }, null, { timeout: 30000 }).catch(() => null);
  await pause(300);
  const captures = await page.$$eval('.ecran.actif .telephone-ecran img', (l) => l.map((i) => i.getAttribute('src') || ''));
  verifier(captures.length === 3 && captures.every((s) => /^http/.test(s)), `dans un téléphone, ses trois écrans (${captures.filter((s) => /^http/.test(s)).length} adresse(s) résolue(s) sur ${captures.length}${stockage.length ? ` · Storage : ${stockage.slice(0, 3).join(' | ')}` : ''})`);
  let n = 2;
  while (await page.$('[data-accueil="suivant"]')) { await page.click('[data-accueil="suivant"]'); n += 1; await pause(350); if (n > 12) break; }
  verifier(n === 7, `sept écrans en tout (${n})`);
  verifier(/Votre campagne vous attend/.test(await page.textContent('.ecran.actif')), 'le dernier sait que la campagne est ouverte');
  await page.click('[data-accueil="fin"]'); await pause(900);
  verifier(!(await page.$('.accueil')), 'C est parti efface l accueil');
  verifier(await page.isVisible('.testeur-tete .tb-barre'), 'et la campagne est là, avec sa jauge');
  verifier(/0 sur 43/.test(await page.textContent('.chapo')), 'le premier chapeau dit la progression');
  await pause(1200);
  verifier((await appreciations()).some((d) => d.fields && d.fields.accueil), 'les premiers pas sont consignés dans son appréciation');
  await page.reload(); await page.waitForSelector('.testeur-tete'); await pause(1200);
  verifier(!(await page.$('.accueil')), 'et ils ne reviennent pas à la visite suivante');

  console.log('\n== Le reste de l espace');
  const a1 = await page.textContent('.astuce-testeur p'); await page.click('[data-astuce-suivante]'); const a2 = await page.textContent('.astuce-testeur p');
  verifier(a1 !== a2, 'Une autre change d astuce');
  await pause(1500);
  verifier(/\d+ min \d+ s|\d+ h \d+/.test(await page.textContent('[data-chrono]')), `le chronomètre compte (${await page.textContent('[data-chrono]')})`);
  await page.evaluate(() => { location.hash = '#/avis'; }); await page.waitForSelector('[data-avis-page="avant"]');
  await page.click('[data-avis-page="avant"]'); await pause(600);
  verifier(await page.$('.feuille, .modale'), 'Mon avis ouvre le questionnaire');
  await page.keyboard.press('Escape'); await pause(300);
  await page.evaluate(() => { location.hash = '#/guide'; }); await page.waitForSelector('[data-accueil="revoir"]');
  await page.click('[data-accueil="revoir"]'); await pause(600);
  verifier(await page.$('.accueil-porte'), 'Revoir les premiers pas rouvre l accueil');
  await page.click('[data-accueil="commencer"]'); await page.waitForSelector('.accueil-guide'); await pause(400);
  await page.keyboard.press('ArrowRight'); await pause(700);
  verifier(/Atelier/.test(await page.textContent('.ecran.actif')), 'la flèche droite passe à l écran suivant');
  await page.click('[data-accueil="passer"]'); await pause(900);
  verifier(!(await page.$('.accueil')), 'Passer referme l accueil');
  await page.click('[data-theme-val="light"]'); await pause(200);
  verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'le testeur peut passer en clair');
  /* On est encore sur le guide : c'est lui qui revient. */
  await page.reload(); await page.waitForSelector('.page--guide'); await pause(400);
  verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'et son choix se retient');
  await page.click('[data-theme-val="dark"]');
  await page.keyboard.press('Meta+k'); await pause(400); await page.keyboard.type('Guide'); await pause(300);
  verifier(/Guide du testeur/.test(await page.textContent('.palette')), '⌘K trouve les pages de l espace');
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  /* Ce que la page montrait au moment de l'échec, pour ne pas deviner. */
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-espace-testeur-echec.png' }); console.error('capture : /tmp/qa-espace-testeur-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
