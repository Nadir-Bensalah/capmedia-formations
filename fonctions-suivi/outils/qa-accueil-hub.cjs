/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'accueil de la première fois, côté client
   La marque, le prénom, les sept écrans (ses projets tels qu'ils sont), le
   sombre par défaut, la trace dans le profil, le rejeu depuis le menu du
   compte, vus par Camille (semer-suivi.mjs, dont le semis dit qu'elle a
   déjà fait ses premiers pas : la suite efface d'abord cette trace).
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const BDD = 'http://127.0.0.1:8080/v1/projects/capmedia-1f90d/databases/(default)/documents';
const prop = { Authorization: 'Bearer owner' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const vider = async (c) => { const j = await (await fetch(`${BDD}/${c}?pageSize=300`, { headers: prop })).json(); for (const d of (j.documents || [])) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const code = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await (await fetch(`${BDD}/envois?pageSize=200`, { headers: prop })).json(); const d = (j.documents || []).filter((x) => (x.fields.modele || {}).stringValue === 'code' && JSON.stringify(x.fields.a).includes(e)).sort((a, b) => new Date(b.fields.cree.timestampValue) - new Date(a.fields.cree.timestampValue))[0]; if (d) return d.fields.variables.mapValue.fields.code.stringValue; await pause(300); } return ''; };
const CAMILLE = 'camille.essai@exemple.test';
/* Le profil de Camille, par son adresse. */
const profil = async () => { const j = await (await fetch(`${BDD}/profils?pageSize=100`, { headers: prop })).json(); return (j.documents || []).find((d) => ((d.fields.email || {}).stringValue) === CAMILLE); };
let ok = 0; const ecarts = [];
const verifier = (c, m) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}`); } };
let page = null;
(async () => {
  const nav = await chromium.launch();
  page = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  await vider('connexions'); await vider('connexionsIp');
  /* Une cliente qui n'a jamais fait ses premiers pas : on efface la trace du semis. */
  const p0 = await profil();
  if (p0) await fetch(`http://127.0.0.1:8080/v1/${p0.name}?updateMask.fieldPaths=accueil`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
  verifier(p0 && !(((await profil()) || {}).fields || {}).accueil, 'le profil de Camille ne porte plus de premiers pas');

  await page.goto((process.env.BANC_SITE || 'http://127.0.0.1:8787') + '/suivi/?emul', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)'); await page.fill('#email', CAMILLE); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)'); await page.fill('#code', await code(CAMILLE));
  await page.waitForURL(/hub/); await page.waitForSelector('.accueil-porte', { timeout: 20000 });

  console.log('\n== La première fois : l accueil du Hub');
  verifier((await page.getAttribute('html', 'data-theme')) === 'dark', 'le Hub est sombre par défaut');
  verifier(await page.$('.accueil-logo .feuille--4'), 'la marque en quatre feuilles est au centre');
  verifier(/Bienvenue, Camille/.test(await page.textContent('.accueil-porte h1')), 'la porte dit bienvenue au prénom');
  verifier(/Capmedia\s*Hub/.test(await page.textContent('.accueil-marque')), 'et nomme Capmedia Hub');
  await page.waitForSelector('.lat-lien[href="#/projets/atelier"]', { state: 'attached', timeout: 20000 });
  await page.click('[data-accueil="commencer"]'); await page.waitForSelector('.accueil-guide'); await pause(500);
  verifier(/Atelier Nord/.test(await page.textContent('.ecran.actif')), 'Commencer ouvre le premier écran, au nom de sa société');
  await page.click('[data-accueil="suivant"]'); await pause(700);
  const projets = await page.$$eval('.ecran.actif .projets-accueil li', (l) => l.map((x) => x.textContent));
  verifier(projets.length >= 1 && projets.some((x) => /Atelier/.test(x)), `le deuxième écran liste ses projets tels qu ils sont (${projets.length})`);
  verifier(await page.$('.ecran.actif .projets-accueil .pastille'), 'avec leur état');
  let n = 2;
  while (await page.$('[data-accueil="suivant"]')) { await page.click('[data-accueil="suivant"]'); n += 1; await pause(350); if (n > 12) break; }
  verifier(n === 7, `sept écrans en tout (${n})`);
  verifier(/Vos projets vous attendent/.test(await page.textContent('.ecran.actif')), 'le dernier sait qu elle a des projets');
  await page.click('[data-accueil="fin"]'); await pause(900);
  verifier(!(await page.$('.accueil')), 'C est parti efface l accueil');
  verifier(await page.isVisible('#vue .page'), 'et son espace est là');
  await pause(1200);
  verifier(Boolean((((await profil()) || {}).fields || {}).accueil), 'les premiers pas sont consignés dans son profil');
  await page.reload(); await page.waitForSelector('#vue .page'); await pause(1200);
  verifier(!(await page.$('.accueil')), 'et ils ne reviennent pas à la visite suivante');

  console.log('\n== À la demande');
  await page.click('#bouton-compte'); await pause(300);
  const item = await page.$('.menu button:has-text("Revoir les premiers pas")');
  verifier(item, 'le menu du compte propose de revoir les premiers pas');
  if (item) { await item.click(); await pause(600); }
  verifier(await page.$('.accueil-porte'), 'et l accueil se rouvre');
  await page.click('.accueil [data-accueil="passer"]'); await pause(900);
  verifier(!(await page.$('.accueil')), 'Aller directement à mon espace le referme');
  await page.click('[data-theme-val="light"]'); await pause(200);
  verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'le client peut passer en clair');
  await page.reload(); await page.waitForSelector('#vue .page'); await pause(400);
  verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'et son choix se retient');
  await page.click('[data-theme-val="dark"]');
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-accueil-hub-echec.png' }); console.error('capture : /tmp/qa-accueil-hub-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
