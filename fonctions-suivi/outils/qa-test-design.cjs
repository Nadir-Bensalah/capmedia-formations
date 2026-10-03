/* ==========================================================================
   CAPMEDIA TEST · le dessin et l'interface au niveau du Hub (03/10)

   Ce que le Hub client a reçu depuis le 02/10, refait dans l'espace Test,
   éprouvé dans le navigateur par Karim (semer-campagne.mjs) :
     1. l'accueil court du Hub : la mascotte sur la porte, le prénom, le
        rôle en une phrase, l'application testée en grand, les trois
        réponses, Capmedia Test à installer selon le système (ordinateur
        seulement), « tout est prêt » avec la mascotte ; sur un téléphone,
        le lien d'installation de l'application testée pour CE téléphone ;
     2. la coquille : « Bêta » à gauche des notifications, le bouton Retour
        sur toutes les pages sauf la campagne, un fil d'Ariane qui part de
        « Ma campagne », le squelette de page pendant le chargement ;
     3. le lexique « iPhone », jamais « iOS » ;
     4. les états en texte courant (Mes signalements), aucun texte coupé ;
     5. le téléphone 390 px : pas de défilement de côté, la bulle ne couvre
        aucun bouton au bas des pages, le pied du rail visible, pas de ⌘K.
   Captures : CAPTURES=<dossier> (sinon /tmp/qa-test-design).
   Banc : émulateurs, site local, semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const fs = require('fs');
const PROJET = 'capmedia-1f90d';
const BDD = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const prop = { Authorization: 'Bearer owner' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const CAPTURES = process.env.CAPTURES || '/tmp/qa-test-design';
try { fs.mkdirSync(CAPTURES, { recursive: true }); } catch (e) { /* rien */ }
const capture = async (p, nom) => { try { await p.screenshot({ path: `${CAPTURES}/${nom}.png` }); } catch (e) { /* rien */ } };
const lire = async (c) => (await fetch(`${BDD}/${c}`, { headers: prop })).json();
const vider = async (c) => { const j = await lire(`${c}?pageSize=300`); for (const d of (j.documents || [])) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const code = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const d = (j.documents || []).filter((x) => (x.fields.modele || {}).stringValue === 'code' && JSON.stringify(x.fields.a).includes(e)).sort((a, b) => new Date(b.fields.cree.timestampValue) - new Date(a.fields.cree.timestampValue))[0]; if (d) return d.fields.variables.mapValue.fields.code.stringValue; await pause(300); } return ''; };
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(300); } return false; };
const texteDe = (p, sel) => p.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const KARIM = 'karim.testeur@essai.test';
const CAMPAGNE = 'projets/atelier/campagnes/c-oct';
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const connecter = async (p) => {
  await vider('connexions'); await vider('connexionsIp');
  await p.goto(`${BANC.site}/suivi/?emul${BANC.numero && BANC.numero > 1 ? `=${BANC.numero}` : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await p.fill('#email', KARIM); await p.click('#envoyer');
  await p.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await p.fill('#code', await code(KARIM));
  await p.waitForURL(/testeur/, { timeout: 40000 });
};
/* Un testeur neuf : son appréciation (où l'accueil se consigne) effacée. */
const oublierAccueil = async () => { const j = await lire(`${CAMPAGNE}/appreciations?pageSize=50`); for (const d of (j.documents || [])) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const aller = async (p, chemin, sel = '#vue .page') => { await p.evaluate((c) => { location.hash = c; }, chemin); await p.waitForSelector(sel, { timeout: 20000 }); await pause(800); };
/* Les écrans de l'accueil, après la porte : leurs clés, dans l'ordre. */
const parcourirAccueil = async (p, nom) => {
  const cles = [];
  for (let i = 0; i < 12; i += 1) {
    const cle = await p.getAttribute('.ecran.actif', 'data-cle').catch(() => '');
    cles.push(cle || '?');
    await capture(p, `${nom}-${i + 1}-${cle}`);
    if (!(await p.$('[data-accueil="suivant"]'))) break;
    await p.click('[data-accueil="suivant"]'); await pause(700);
  }
  return cles;
};
/* Les textes coupés par des points de suspension dans la page. */
const coupes = (p) => p.evaluate(() => [...document.querySelectorAll('#vue *')].filter((el) => {
  const s = getComputedStyle(el); return s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.offsetParent !== null;
}).map((el) => el.textContent.trim().slice(0, 40)));

(async () => {
  const nav = await chromium.launch();
  const erreurs = []; const garder = (p) => p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  /* Deux échecs signalés par Karim, dont un que l'équipe a corrigé. */
  const uid = await uidDe(KARIM);
  const camp = await lire(CAMPAGNE);
  const aff = ((((camp.fields || {}).affectation || {}).mapValue || {}).fields || {})[uid] || {};
  const refs = ((aff.arrayValue || {}).values || []).map((v) => v.stringValue);
  const cles = (((((aff.mapValue || {}).fields || {}).cles || {}).arrayValue || {}).values || []).map((v) => v.stringValue);
  const echecs = (refs.length ? refs.slice(0, 2).map((r) => ({ id: `${uid}__${r}`, ref: r, plateforme: 'ios' }))
    : cles.slice(0, 2).map((k) => { const [r, pl] = k.split('__'); return { id: `${uid}__${r}__${pl}`, ref: r, plateforme: pl }; }));
  for (const [i, e] of echecs.entries()) {
    await fetch(`${BDD}/${CAMPAGNE}/passages/${e.id}`, {
      method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { scenario: { stringValue: e.ref }, testeur: { stringValue: uid }, plateforme: { stringValue: e.plateforme }, resultat: { stringValue: 'ko' }, commentaire: { stringValue: 'Rien ne se passe quand je valide.' }, preuves: { arrayValue: { values: [] } }, aRevoir: { booleanValue: i === 0 }, le: { timestampValue: new Date().toISOString() } } }),
    });
  }
  verifier(echecs.length === 2, 'deux échecs posés pour Karim', `${echecs.length}`);
  await oublierAccueil();

  /* ------------------------------------------------------------ 1440 × 900 */
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage(); garder(page);
  await connecter(page);
  await page.waitForSelector('.accueil-porte', { timeout: 20000 });

  console.log('\n== 1. L accueil court, comme celui du Hub');
  verifier(await page.$('.accueil-porte .accueil-mascotte'), 'la mascotte est sur la porte, à la place de la marque assemblée');
  verifier(/Bienvenue, Karim/.test(await texteDe(page, '.accueil-porte h1')), 'la porte dit bienvenue au prénom');
  verifier(/Capmedia\s*Test/.test(await texteDe(page, '.accueil-porte .accueil-marque')) && await page.$('.accueil-porte.accueil-porte--test'), 'et nomme Capmedia Test, au dessin de la porte du Hub');
  verifier(/regard de nouvel utilisateur/.test(await texteDe(page, '.accueil-porte .texte')), 'son rôle en une phrase', await texteDe(page, '.accueil-porte .texte'));
  await pause(2600); await capture(page, '1440-accueil-0-porte');
  await page.click('[data-accueil="commencer"]'); await page.waitForSelector('.accueil-guide'); await pause(900);
  verifier(/Atelier/.test(await texteDe(page, '.ecran.actif h2')), 'le premier écran montre l application testée en grand');
  verifier(!(await page.$('.ecran.actif [data-installer-teste]')), 'sur un ordinateur, pas de lien de téléphone sur cet écran');
  const ecrans1440 = await parcourirAccueil(page, '1440-accueil');
  verifier(JSON.stringify(ecrans1440) === JSON.stringify(['application', 'verdicts', 'application-test', 'fin']), 'quatre écrans : l application, les trois réponses, Capmedia Test pour Mac, tout est prêt', ecrans1440.join(', '));
  const dmg = await page.getAttribute('.ecran[data-cle="application-test"] .accueil-telecharger a', 'href').catch(() => '');
  verifier(/capmedia-test-mac\.dmg$/.test(dmg || ''), 'sur un Mac, le bouton vise l installeur de Capmedia Test pour Mac', dmg);
  const fin = await texteDe(page, '.ecran.actif');
  verifier(/Tout est prêt, Karim/.test(fin) && await page.$('.ecran.actif .accueil-mascotte--fin'), 'le dernier dit que tout est prêt, avec la mascotte');
  verifier(/menu de votre compte/.test(fin) && !/rail à gauche/.test(fin), 'il renvoie au menu du compte, pas au rail à gauche', fin.slice(0, 160));
  await page.click('[data-accueil="fin"]'); await pause(1200);
  verifier(!(await page.$('.accueil')), 'C est parti efface l accueil');

  console.log('\n== 2. La coquille');
  await page.waitForSelector('#vue .page', { timeout: 20000 }); await pause(1500);
  const beta = await page.evaluate(() => { const b = document.querySelector('#haut .pastille-beta'); if (!b) return null; const r = b.getBoundingClientRect(); return { texte: b.textContent.trim(), astuce: b.dataset.astuce || '', suivant: (b.nextElementSibling || {}).id || '', vu: r.width > 0 && r.height > 0 }; });
  verifier(beta && beta.vu && beta.texte === 'Bêta' && beta.suivant === 'bouton-notifs', '« Bêta » à gauche des notifications', JSON.stringify(beta));
  verifier(beta && /Capmedia Test/.test(beta.astuce), 'son info-bulle parle de Capmedia Test', beta && beta.astuce);
  verifier(await page.$('#bouton-retour') && !(await page.isVisible('#bouton-retour')), 'le bouton Retour existe, caché sur Ma campagne');
  await capture(page, '1440-campagne');
  verifier(!/\biOS\b/.test(await texteDe(page, '#vue')), 'la campagne dit « iPhone », jamais « iOS »');
  verifier((await coupes(page)).length === 0, 'aucun texte coupé sur la campagne', (await coupes(page)).join(' | '));
  await page.click('#lat-corps a[href="#/guide"]'); await page.waitForSelector('.page--guide'); await pause(800);
  verifier(await page.isVisible('#bouton-retour'), 'sur le guide, le bouton Retour est là');
  const fil = await texteDe(page, '#ariane');
  verifier(/^Ma campagne.*Guide du testeur$/.test(fil) && await page.$('#ariane a[href="#/"]'), 'le fil d Ariane part de « Ma campagne »', fil);
  await capture(page, '1440-guide');
  /* Sans bouton Retour, le contrôle tombe au lieu d'arrêter la suite. */
  const retour = async () => { if (await page.isVisible('#bouton-retour').catch(() => false)) { await page.click('#bouton-retour'); await pause(1000); return true; } return false; };
  verifier(await retour() && ['', '#/'].includes(new URL(page.url()).hash) && await page.$('#vue .page--testeur'), 'Retour ramène à la campagne');
  /* Une adresse ouverte d'un e-mail ou d'un favori : Retour remonte le fil. */
  await page.evaluate(() => { location.hash = '#/application'; }); await pause(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#vue .page-tete', { timeout: 30000 }); await pause(1500);
  verifier(!/\biOS\b/.test(await texteDe(page, '#vue')), 'L application dit « iPhone », jamais « iOS »');
  verifier((await coupes(page)).length === 0, 'aucun texte coupé sur L application', (await coupes(page)).join(' | '));
  await capture(page, '1440-application');
  verifier(await retour() && ['', '#/'].includes(new URL(page.url()).hash), 'ouverte directement, Retour remonte à Ma campagne', new URL(page.url()).hash);

  console.log('\n== 4. Mes signalements : les états en texte courant');
  await aller(page, '#/signalements', '#vue .page .liste, #vue .vide');
  const etats = await page.$$eval('#vue .ligne-fin', (l) => l.map((x) => ({ pastille: Boolean(x.querySelector('.pastille')), courant: Boolean(x.querySelector('.etat-courant i')), texte: x.textContent.trim() })));
  verifier(etats.length === 2, 'les deux échecs sont listés', JSON.stringify(etats));
  verifier(etats.length && etats.every((e) => !e.pastille && e.courant), 'chacun dit son état en texte courant, un point de couleur, sans pastille', JSON.stringify(etats));
  verifier(etats.some((e) => /Corrigé, à rejouer/.test(e.texte)) && etats.some((e) => /Transmis à l.équipe/.test(e.texte)), '« Corrigé, à rejouer » et « Transmis à l équipe »');
  await capture(page, '1440-signalements');

  console.log('\n== 2. Le squelette pendant le chargement');
  /* Les écoutes de Firestore retenues trois secondes : la page a le temps
     de montrer ce qu'elle affiche en attendant. */
  await page.route(/Firestore\/(Listen|Write)/, async (r) => { await pause(3000); r.continue().catch(() => {}); });
  /* Un vrai rechargement : un goto qui ne change que l'ancre n'en est pas un. */
  await page.evaluate(() => { location.hash = '#/'; }); await pause(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  let phrase = false;
  const squeletteVu = await attendre(async () => {
    if (/Chargement de votre campagne/.test(await texteDe(page, '#vue'))) phrase = true;
    return Boolean(await page.$('#vue .page--testeur .squelette .os'));
  }, 30000);
  verifier(squeletteVu, 'la campagne en chargement montre le squelette de page du Hub');
  verifier(!phrase, 'plus de phrase « Chargement de votre campagne… »');
  await capture(page, '1440-squelette');
  await page.unroute(/Firestore\/(Listen|Write)/);
  await ctx.close();

  /* ------------------------------------------------------------ 390 px */
  console.log('\n== 5. Le téléphone 390 px');
  await oublierAccueil();
  const tctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const tel = await tctx.newPage(); garder(tel); page = tel;
  await connecter(tel);
  await tel.waitForSelector('.accueil-porte', { timeout: 20000 });
  await pause(2600); await capture(tel, '390-accueil-0-porte');
  await tel.click('[data-accueil="commencer"]'); await tel.waitForSelector('.accueil-guide'); await pause(900);
  const installer = await tel.getAttribute('.ecran.actif [data-installer-teste="ios"]', 'href').catch(() => '');
  verifier(/testflight/.test(installer || ''), 'sur un iPhone, l écran de l application propose de l installer sur iPhone', installer);
  const ecrans390 = await parcourirAccueil(tel, '390-accueil');
  verifier(JSON.stringify(ecrans390) === JSON.stringify(['application', 'verdicts', 'fin']), 'sur un téléphone, pas d application de bureau à installer : trois écrans', ecrans390.join(', '));
  await tel.click('[data-accueil="fin"]'); await pause(1200);
  await tel.waitForSelector('#vue .page--testeur', { timeout: 20000 }); await pause(1500);
  verifier(await tel.isVisible('#haut .pastille-beta'), '390 : « Bêta » reste visible');
  verifier(await tel.$eval('#bouton-recherche kbd', (k) => getComputedStyle(k).display === 'none').catch(() => true), '390 tactile : « ⌘K » masqué');
  for (const [chemin, nom, sel] of [['#/', 'campagne', '#vue .page--testeur'], ['#/application', 'application', '#vue .page-tete'], ['#/signalements', 'signalements', '#vue .page-tete'], ['#/guide', 'guide', '.page--guide']]) {
    await aller(tel, chemin, sel);
    const large = await tel.evaluate(() => document.documentElement.scrollWidth);
    verifier(large <= 391, `390 : ${nom} sans défilement de côté`, `${large} px`);
    if (chemin !== '#/') verifier(await tel.isVisible('#bouton-retour'), `390 : ${nom}, le bouton Retour est là`);
    await capture(tel, `390-${nom}`);
    await tel.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await pause(500);
    const libre = await tel.evaluate(() => {
      const bulle = document.querySelector('.bulle #bulle-ouvrir'); if (!bulle) return { bulle: false, ok: true };
      const rb = bulle.getBoundingClientRect();
      const gestes = [...document.querySelectorAll('#vue button, #vue a.btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight; });
      const touche = gestes.filter((b) => { const r = b.getBoundingClientRect(); return !(r.right < rb.left || r.left > rb.right || r.bottom < rb.top || r.top > rb.bottom); });
      return { bulle: true, ok: touche.length === 0, touche: touche.map((b) => b.textContent.trim().slice(0, 30)) };
    });
    verifier(libre.ok, `390 : au bas de ${nom}, la bulle ne couvre aucun bouton`, JSON.stringify(libre));
    await capture(tel, `390-${nom}-bas`);
  }
  await tel.click('#bouton-menu'); await pause(700);
  const pied = await tel.evaluate(() => {
    const vu = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; return r.height > 0 && r.bottom <= window.innerHeight + 1 && r.top >= 0 && el.contains(document.elementFromPoint(x, y)); };
    return { theme: vu('.theme-rail'), compte: vu('#bouton-compte') };
  });
  verifier(pied.theme && pied.compte, '390 : rail ouvert, le thème et le compte visibles en bas', JSON.stringify(pied));
  await capture(tel, '390-rail');
  await tctx.close();

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-test-design-echec.png' }); console.error('capture : /tmp/qa-test-design-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
