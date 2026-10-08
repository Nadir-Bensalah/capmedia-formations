/* ==========================================================================
   CAPMEDIA TEST · l'expérience du testeur, lot du 08/10/2026

   Éprouvé dans le navigateur, sur le banc, avec une présentation ForgeMe
   d'exemple (semer-presentation-forgeme.mjs) :
     1. le logo de l'application testée dans les premiers pas, l'en-tête de
        « Ma campagne », « L'application » et « Présentation » ;
     2. l'onglet « Présentation » : le discours, puis les fonctionnalités une
        par une (titre, phrase, écran) ;
     3. la visite guidée sur la vraie page : proposée au dernier écran des
        premiers pas, Ma campagne, la case suivante, une feuille, Mes
        signalements, Mon avis, la bulle ; le clavier, le lecteur d'écran
        (dialogue, titre annoncé), la réduction des animations, le
        téléphone ; rejouable depuis le guide et le menu du compte ;
     4. le questionnaire obligatoire : « J'ai terminé » n'existe qu'après
        l'avis, et les règles refusent la fin posée sans lui ;
     5. le questionnaire anonyme : aucune réponse dans l'appréciation, aucun
        identifiant dans le document rangé par le serveur, rien de lisible
        sous trois réponses (ni par l'écran, ni par la base), l'équipe sait
        seulement qui a répondu ;
     6. la fiche de la campagne dans le Cockpit : logo, discours,
        fonctionnalités.
   Captures : CAPTURES=<dossier> (sinon /tmp/qa-experience-testeur).
   Banc : émulateurs, site local, semer-campagne puis semer-presentation-forgeme.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PID = 'atelier'; const CID = 'c-oct';
const CAPTURES = process.env.CAPTURES || '/tmp/qa-experience-testeur';
try { fs.mkdirSync(CAPTURES, { recursive: true }); } catch (e) { /* rien */ }
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const N = (v) => ({ integerValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() });
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { if (await fn()) return true; await pause(ms); } return false; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul${BANC.numero && BANC.numero > 1 ? `=${BANC.numero}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
const aller = async (p, hash, sel) => { for (let i = 0; i < 8; i += 1) { await p.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, hash); await pause(1200); if (await p.$(sel)) return true; } return false; };
const capture = async (p, nom) => { try { await p.screenshot({ path: `${CAPTURES}/${nom}.png` }); } catch (e) { /* rien */ } };
const texteDe = (p, sel) => p.evaluate((s) => ((document.querySelector(s) || {}).innerText || ''), sel);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
/* Une écriture ou une lecture faite par la page elle-même, avec SON jeton :
   ce sont les règles qui répondent, pas l'écran. */
const essai = (p, geste, args) => p.evaluate(async ({ g, a }) => {
  const m = await import('/suivi/assets/js/noyau.js');
  try {
    if (g === 'terminer') await m.setDoc(m.doc(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'appreciations', a.uid), { termine: m.serverTimestamp(), testeur: a.uid, maj: m.serverTimestamp() }, { merge: true });
    if (g === 'reponseDansAppreciation') await m.setDoc(m.doc(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'appreciations', a.uid), { 'esthetique.belle': 5, testeur: a.uid }, { merge: true });
    if (g === 'aRepondu') await m.setDoc(m.doc(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'appreciations', a.uid), { avisRendus: { apres: true } }, { merge: true });
    if (g === 'reponseAnonyme') await m.setDoc(m.doc(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'avisAnonymes', 'apres', 'reponses', 'faux'), { moment: 'apres', reponses: { 'esthetique.belle': 5 } });
    if (g === 'lireReponses') { const q = await m.getDocs(m.collection(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'avisAnonymes', 'apres', 'reponses')); return `lu ${q.size}`; }
    if (g === 'lireAppreciations') { const q = await m.getDocs(m.collection(m.bdd, 'projets', a.pid, 'campagnes', a.cid, 'appreciations')); return `lu ${q.size}`; }
    return 'passé';
  } catch (e) { return String(e.code || e.message); }
}, { g: geste, a: args });
/* Le questionnaire de fin, rempli : une réponse à chaque question fermée. */
const remplirAvis = async (p, texte) => {
  await p.waitForSelector('.voile [data-question] button[data-avis]', { timeout: 15000 });
  await p.evaluate(() => document.querySelectorAll('.voile [data-question]').forEach((g) => { const b = g.querySelectorAll('button[data-avis]'); if (b.length) b[Math.min(3, b.length - 1)].click(); }));
  if (texte) await p.fill('#av-agace', texte);
};
let page = null;

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const KARIM = 'karim.testeur@essai.test';
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (fiches.find((d) => str(d, 'email') === KARIM) || { name: '' }).name.split('/').pop();
  await vider(`projets/${PID}/campagnes/${CID}/appreciations`);
  for (const m of ['avant', 'apres']) { await vider(`projets/${PID}/campagnes/${CID}/avisAnonymes/${m}/reponses`); await fetch(bdd(`projets/${PID}/campagnes/${CID}/avisAnonymes/${m}`), { method: 'DELETE', headers: prop }); }
  await vider(`projets/${PID}/campagnes/${CID}/passages`);
  const camp0 = await lire(`projets/${PID}/campagnes/${CID}`);
  verifier(str(camp0, 'application') === 'ForgeMe' && champ(camp0, 'logo').mapValue, 'la présentation ForgeMe d exemple est posée sur le banc (logo, discours, fonctionnalités)');

  console.log('\n== 1. Le logo dans les premiers pas, et la visite proposée');
  await connecter(page, KARIM);
  await page.waitForSelector('.accueil-porte', { timeout: 20000 });
  await page.click('[data-accueil="commencer"]'); await page.waitForSelector('.accueil-guide');
  const logoAccueil = await attendre(async () => page.evaluate(() => { const i = document.querySelector('.ecran.actif [data-logo-accueil]'); return Boolean(i && /^http/.test(i.getAttribute('src') || '')); }), 40, 500);
  verifier(logoAccueil, 'le premier écran montre le logo de l application testée');
  verifier(/ForgeMe/.test(await texteDe(page, '.ecran.actif h2')), 'à côté de son nom');
  await capture(page, 'apres-01-accueil-logo');
  for (let i = 0; i < 6 && await page.$('[data-accueil="suivant"]'); i += 1) { await page.click('[data-accueil="suivant"]'); await pause(400); }
  verifier(await page.$('.ecran.actif [data-visite-demandee]'), 'le dernier écran propose la visite guidée');
  await capture(page, 'apres-02-accueil-visite-proposee');
  await page.click('.ecran.actif [data-visite-demandee]');
  const visite = await attendre(async () => page.$('.visite-carte'), 30, 300);
  await page.waitForSelector('.accueil', { state: 'detached', timeout: 5000 }).catch(() => null);
  verifier(visite && !(await page.$('.accueil')), 'l accueil se referme et la visite commence, sur la vraie page');

  console.log('\n== 2. La visite guidée');
  const d1 = await page.evaluate(() => {
    const c = document.querySelector('.visite-carte');
    const t = document.getElementById(c.getAttribute('aria-labelledby'));
    return { role: c.getAttribute('role'), modale: c.getAttribute('aria-modal'), titre: t ? t.innerText : '', focus: document.activeElement === t, sur: document.querySelector('#visite-sur').textContent,
      trou: !document.querySelector('.visite-trou').hidden };
  });
  verifier(d1.role === 'dialog' && d1.modale === 'true' && d1.titre === 'Ma campagne', 'une vraie fenêtre de dialogue, titrée « Ma campagne »', JSON.stringify(d1));
  verifier(d1.focus, 'le titre reçoit le focus : le lecteur d écran l annonce');
  verifier(/^Étape 1 sur 6$/.test(d1.sur), '« Étape 1 sur 6 », en toutes lettres', d1.sur);
  verifier(d1.trou, 'le voile laisse voir l en-tête de la campagne');
  verifier(await attendre(async () => page.evaluate(() => { const i = document.querySelector('.testeur-tete .appli-logo img'); return Boolean(i && /^http/.test(i.getAttribute('src') || '')); }), 30, 500), 'l en-tête de « Ma campagne » porte le logo');
  await capture(page, 'apres-03-visite-ma-campagne');
  await page.keyboard.press('ArrowRight'); await pause(600);
  verifier(/scénario qui vous attend/.test(await texteDe(page, '#visite-titre')), 'flèche droite : la case suivante');
  await capture(page, 'apres-04-visite-case-suivante');
  await page.keyboard.press('Enter'); await pause(1200);
  verifier(/feuille d.un scénario/.test(await texteDe(page, '#visite-titre')) && await page.$('.modale--scenario'), 'Entrée : une vraie feuille de scénario s ouvre');
  await capture(page, 'apres-05-visite-feuille');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  verifier(await page.evaluate(() => document.querySelector('.visite-carte').contains(document.activeElement)), 'la tabulation reste dans la carte de la visite');
  await page.keyboard.press('ArrowRight'); await pause(900);
  verifier(!(await page.$('.modale--scenario')), 'en passant, la feuille se referme');
  const sig = await page.evaluate(() => { const t = document.querySelector('.visite-trou').getBoundingClientRect(); const a = document.querySelector('#lat-corps .lat-lien[data-chemin="/signalements"]').getBoundingClientRect(); return Math.abs(t.top + 6 - a.top) < 3 && Math.abs(t.left + 6 - a.left) < 3; });
  verifier(/Mes signalements/.test(await texteDe(page, '#visite-titre')) && sig, 'Mes signalements : le voile s ouvre sur l entrée du rail');
  await capture(page, 'apres-06-visite-signalements');
  await page.keyboard.press('ArrowLeft'); await pause(1000);
  verifier(/feuille/.test(await texteDe(page, '#visite-titre')), 'flèche gauche : retour à l étape d avant');
  await page.keyboard.press('ArrowRight'); await pause(700); await page.keyboard.press('ArrowRight'); await pause(700);
  verifier(/Mon avis/.test(await texteDe(page, '#visite-titre')) && /sans votre nom/.test(await texteDe(page, '#visite-texte')), 'Mon avis : il part sans nom, avant « J ai terminé »');
  await page.keyboard.press('ArrowRight'); await pause(700);
  verifier(/La bulle/.test(await texteDe(page, '#visite-titre')) && (await texteDe(page, '[data-visite="suivant"]')) === 'Terminer', 'la bulle, dernière étape : « Terminer »');
  await capture(page, 'apres-07-visite-bulle');
  const dessin = await page.evaluate(() => {
    const c = document.querySelector('.visite-carte'); const s = getComputedStyle(c);
    return { svg: c.querySelectorAll('svg, img').length, bordure: [s.borderLeftWidth, s.borderTopWidth].join(' '), tiret: /[—–]/.test(c.innerText) };
  });
  verifier(!dessin.svg && dessin.bordure === '0px 0px' && !dessin.tiret, 'ni pictogramme, ni liseré, ni tiret long dans la carte', JSON.stringify(dessin));
  await page.click('[data-visite="suivant"]'); await pause(600);
  verifier(!(await page.$('.visite')) && !(await page.$('.voile--scenario')), 'Terminer referme tout, rien ne reste ouvert');
  const passages = ((await lire(`projets/${PID}/campagnes/${CID}/passages?pageSize=50`)) || {}).documents || [];
  verifier(passages.length === 0, 'la visite n a rien enregistré', `${passages.length} passage(s)`);
  await aller(page, '#/guide', '[data-visite-relancer]');
  await page.click('[data-visite-relancer]'); await page.waitForSelector('.visite-carte', { timeout: 10000 }).catch(() => null);
  verifier(await page.$('.visite-carte'), 'le guide la rejoue');
  await page.keyboard.press('Escape'); await pause(400);
  verifier(!(await page.$('.visite')), 'Échap l arrête');
  await page.click('#bouton-compte'); await pause(400);
  const entree = await page.$('.menu [data-cle="Visite guidée"]');
  verifier(entree, 'le menu du compte propose « Visite guidée »');
  if (entree) { await entree.click(); await pause(800); verifier(await page.$('.visite-carte'), 'qui la relance'); await page.keyboard.press('Escape'); await pause(300); }
  /* La réduction des animations : forcée la classe animée, rien ne bouge. */
  const transitions = async (p) => p.evaluate(() => { const v = document.createElement('div'); v.className = 'visite visite--animee'; v.innerHTML = '<div class="visite-trou"></div>'; document.body.appendChild(v); const d = getComputedStyle(v.firstChild).transitionDuration; v.remove(); return d; });
  const reduit = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const pr = await reduit.newPage(); await pr.goto(`${SITE}/suivi/?emul`, { waitUntil: "domcontentloaded" }).catch(() => null); await pause(800);
  const dReduit = await transitions(pr); const dNormal = await transitions(page);
  const max = (d) => Math.max(...String(d).split(',').map((x) => parseFloat(x) || 0));
  verifier(max(dReduit) <= 0.01 && max(dNormal) >= 0.2, 'réduction des animations : le voile ne glisse plus', `${dReduit} / ${dNormal}`);
  await reduit.close();

  console.log('\n== 3. L onglet « Présentation »');
  await aller(page, '#/presentation', '.page--presentation');
  await attendre(async () => page.evaluate(() => [...document.querySelectorAll('.pres-capture img')].every((i) => /^http/.test(i.getAttribute('src') || '')) && /^http/.test((document.querySelector('.pres-tete .appli-logo img') || {}).src || '')), 40, 500);
  const pres = await page.evaluate(() => ({
    titre: (document.querySelector('.page--presentation h1') || {}).innerText || '',
    logo: /^http/.test((document.querySelector('.pres-tete .appli-logo img') || {}).src || ''),
    discours: document.querySelectorAll('.pres-discours .prose p').length,
    fonctions: [...document.querySelectorAll('.pres-fonction')].map((f) => ({ n: (f.querySelector('.pres-numero') || {}).innerText, t: (f.querySelector('h3') || {}).innerText, p: (f.querySelector('p') || {}).innerText || '', img: /^http/.test((f.querySelector('.pres-capture img') || {}).src || ''), alt: (f.querySelector('.pres-capture img') || { alt: '' }).alt })),
    icones: document.querySelectorAll('.page--presentation .pres-fonction svg').length,
    tiret: /[—–]/.test(document.querySelector('.page--presentation').innerText),
    rail: !!document.querySelector('#lat-corps .lat-lien[data-chemin="/presentation"]'),
  }));
  verifier(pres.rail, 'l onglet « Présentation » est dans le rail, sous Découvrir');
  verifier(pres.titre === 'ForgeMe' && pres.logo, 'la page porte le nom et le logo de l application', JSON.stringify({ t: pres.titre, l: pres.logo }));
  verifier(pres.discours === 2, 'le discours d abord, en deux paragraphes', String(pres.discours));
  verifier(pres.fonctions.length === 4 && pres.fonctions.map((f) => f.n).join(',') === '01,02,03,04', 'puis quatre fonctionnalités, numérotées dans l ordre', pres.fonctions.map((f) => f.n).join(','));
  verifier(pres.fonctions.every((f) => f.t && f.p), 'chacune avec un titre et une phrase');
  verifier(pres.fonctions.filter((f) => f.img).length === 3 && pres.fonctions.filter((f) => f.img).every((f) => /^Écran : /.test(f.alt)), 'trois avec leur écran, décrit au lecteur d écran', JSON.stringify(pres.fonctions.map((f) => f.img)));
  verifier(!pres.icones && !pres.tiret, 'ni pictogramme ni tiret long');
  await capture(page, 'apres-08-presentation');
  await aller(page, '#/application', '.page-tete');
  verifier(await attendre(async () => page.evaluate(() => /^http/.test((document.querySelector('.page-tete .appli-logo img') || {}).src || '')), 20, 500), '« L application » porte le logo aussi');
  verifier(await page.$('.page a[href="#/presentation"]'), 'et renvoie à la présentation complète');
  await capture(page, 'apres-09-page-application');

  console.log('\n== 4. Le questionnaire obligatoire');
  const cles = await page.evaluate(() => [...document.querySelectorAll('.tb--testeur [data-case]')].map((c) => c.dataset.case));
  await aller(page, '#/', '.tb--testeur');
  const refs = await page.$$eval('.tb--testeur [data-case]', (l) => l.map((c) => c.dataset.case));
  void cles;
  for (const ref of refs) { const [scen, plat] = ref.split('__'); await poser(`projets/${PID}/campagnes/${CID}/passages/${uid}__${ref}`, { scenario: S(scen), testeur: S(uid), plateforme: S(plat), resultat: S('reussi'), commentaire: S(''), preuves: { arrayValue: { values: [] } }, contexte: { mapValue: { fields: {} } }, cree: T(new Date()), maj: T(new Date()) }); }
  await attendre(async () => page.$('[data-fin-avis]'), 40, 500);
  verifier(await page.$('[data-fin-avis] [data-avis="apres"]') && !(await page.$('[data-terminer]')), 'tout déroulé : l avis d abord, pas de « J ai terminé »');
  await capture(page, 'apres-10-fin-avis-d-abord');
  const args = { pid: PID, cid: CID, uid };
  verifier(/permission/.test(await essai(page, 'terminer', args)), 'les règles refusent « J ai terminé » posé sans avis, même hors de l écran');
  verifier(/permission/.test(await essai(page, 'aRepondu', args)), 'le testeur ne se déclare pas « a répondu » lui-même');
  verifier(/permission/.test(await essai(page, 'reponseDansAppreciation', args)), 'il n écrit plus de réponse dans son appréciation');
  verifier(/permission/.test(await essai(page, 'reponseAnonyme', args)), 'ni directement dans les réponses anonymes');

  console.log('\n== 5. Le questionnaire anonyme');
  await page.click('[data-fin-avis] [data-avis="apres"]'); await page.waitForSelector('.voile [data-avis-anonyme]', { timeout: 10000 });
  verifier(/sans votre nom/i.test(await texteDe(page, '.voile [data-avis-anonyme]')) && /ne se relisent plus/.test(await texteDe(page, '.voile [data-avis-anonyme]')), 'la feuille dit l anonymat, et qu un avis envoyé ne se relit plus');
  await page.click('.voile [data-envoyer]'); await pause(800);
  const manque = await page.evaluate(() => ({ n: document.querySelectorAll('.voile [data-question][aria-invalid="true"]').length, alerte: (document.querySelector('#avis-erreur') || {}).innerText || '', focus: !!(document.activeElement && document.activeElement.closest('[data-question][aria-invalid="true"]')) }));
  verifier(manque.n > 0 && /manque/.test(manque.alerte) && manque.focus, 'envoyé vide : les questions manquantes sont marquées, annoncées, et la première reçoit le focus', JSON.stringify(manque));
  const MARQUE = `Marque-${Date.now().toString(36)}`;
  await remplirAvis(page, `Le menu est loin du pouce. ${MARQUE}`);
  await capture(page, 'apres-11-avis-anonyme');
  await page.click('.voile [data-envoyer]');
  await attendre(async () => page.$('[data-terminer]'), 40, 500);
  verifier(await page.$('[data-terminer]'), 'avis envoyé : « J ai terminé » apparaît');
  const app = await lire(`projets/${PID}/campagnes/${CID}/appreciations/${uid}`);
  const champsApp = Object.keys((app || {}).fields || {});
  verifier(((((champ(app, 'avisRendus').mapValue || {}).fields || {}).apres) || {}).booleanValue === true, 'l appréciation dit seulement « a répondu »');
  verifier(!champsApp.some((k) => k.includes('.')), 'et ne porte aucune réponse', champsApp.join(', '));
  const reps = ((await lire(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres/reponses?pageSize=20`)) || {}).documents || [];
  const brut = JSON.stringify(reps);
  verifier(reps.length === 1 && Object.keys(reps[0].fields).sort().join(',') === 'moment,reponses', 'la réponse rangée ne porte que le moment et les réponses', reps.length ? Object.keys(reps[0].fields).join(',') : '(rien)');
  verifier(brut.includes(MARQUE) && !brut.includes(uid) && !/karim|Karim|testeur|timestampValue/.test(brut.replace(/"name":"[^"]*"/g, '')), 'aucun identifiant, aucun prénom, aucune date dans la réponse');
  verifier(!reps[0].name.split('/').pop().includes(uid), 'l identifiant du document ne dit pas qui');
  verifier(str({ fields: (await lire(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres`) || {}).fields }, 'x') === '' && champ(await lire(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres`), 'recus').integerValue === '1', 'le compte du moment passe à 1');
  const deja = await page.evaluate(async (a) => { const m = await import('/suivi/assets/js/noyau.js'); const j = await m.auth.currentUser.getIdToken(); const r = await fetch(`${m.FONCTIONS_EMULATEUR}/capmedia-1f90d/europe-west1/hubAvisTesteur`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j}` }, body: JSON.stringify({ projet: a.pid, campagne: a.cid, moment: 'apres', reponses: { 'esthetique.belle': 1 } }) }); return r.status; }, args);
  verifier(deja === 409 || deja === 400, 'une seconde réponse est refusée par le serveur', String(deja));
  await aller(page, '#/avis', '.avis-moments');
  verifier(/Envoyé, merci/.test(await texteDe(page, '.avis-moments')) && !(await page.$('[data-avis-page="apres"]')), '« Mon avis » dit « Envoyé », sans « Revoir »');
  await capture(page, 'apres-12-mon-avis');

  /* Le client : rien sous trois réponses, ni l écran ni la base. */
  const cl = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  cl.on('pageerror', (e) => erreurs.push(`client : ${e.message.slice(0, 160)}`));
  await connecter(cl, 'camille.essai@exemple.test');
  await aller(cl, '#/tests?projet=atelier', '#avis');
  await attendre(async () => /1 testeur a répondu/.test(await texteDe(cl, '#etage-avis')), 30, 500);
  const avisC1 = await texteDe(cl, '#etage-avis');
  verifier(/1 testeur a répondu/.test(avisC1) && /à partir de 3/.test(avisC1), 'le client lit qu un testeur a répondu, et que les réponses viennent à partir de trois', avisC1.slice(0, 200));
  verifier(!avisC1.includes(MARQUE), 'mais ne lit pas sa réponse');
  verifier(/permission/.test(await essai(cl, 'lireReponses', args)), 'ni par la base : les règles refusent sous trois');
  verifier(/permission/.test(await essai(cl, 'lireAppreciations', args)), 'et le client ne lit plus les appréciations des testeurs');
  await capture(cl, 'apres-13-client-sous-le-seuil');
  /* L équipe : qui a répondu, jamais quoi. */
  const eq = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  eq.on('pageerror', (e) => erreurs.push(`équipe : ${e.message.slice(0, 160)}`));
  await connecter(eq, 'agent.essai@exemple.test');
  await aller(eq, '#/tests?projet=atelier', `[data-action="ouvrir-campagne"][data-id="${CID}"]`);
  await attendre(async () => /1 testeur a répondu/.test(await texteDe(eq, '#etage-avis')), 30, 500);
  verifier(!(await texteDe(eq, '#etage-avis')).includes(MARQUE), 'l équipe ne lit pas non plus une réponse seule');
  verifier(/permission/.test(await essai(eq, 'lireReponses', args)), 'ni par la base');
  await eq.click(`[data-action="ouvrir-campagne"][data-id="${CID}"]`); await pause(1500);
  const ficheEq = await texteDe(eq, '.voile .modale-corps');
  verifier(/Avis : oui/.test(ficheEq), 'la fiche de la campagne dit « Avis : oui » pour Karim', ficheEq.slice(0, 200));
  await capture(eq, 'apres-14-equipe-a-repondu');
  await eq.keyboard.press('Escape'); await pause(400);
  /* Deux autres testeurs répondent (le serveur range comme pour Karim) : le
     seuil est atteint, les trois réponses apparaissent, sans nom. */
  await poser(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres/reponses/z1`, { moment: S('apres'), reponses: { mapValue: { fields: { 'esthetique.belle': N(5), 'facilite.recommande': N(9), 'libre.agace': S('Rien du tout.') } } } });
  await poser(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres/reponses/z2`, { moment: S('apres'), reponses: { mapValue: { fields: { 'esthetique.belle': N(3), 'facilite.recommande': N(6), 'libre.agace': S('Les notifications arrivent en double.') } } } });
  await poser(`projets/${PID}/campagnes/${CID}/avisAnonymes/apres`, { recus: N(3) });
  const vu = await attendre(async () => (await texteDe(cl, '#avis')).includes(MARQUE), 40, 500);
  verifier(vu, 'à trois réponses, le client les lit, sans recharger');
  const avisC2 = await texteDe(cl, '#avis');
  verifier(!/Karim|Testeur \d|25-34|homme|femme/.test(avisC2) && !(await cl.$('#avis .avis-verbatim cite')), 'sans prénom, sans numéro, sans profil à côté');
  verifier(/lu 3/.test(await essai(cl, 'lireReponses', args)), 'et la base les lui ouvre');
  await capture(cl, 'apres-15-client-trois-reponses');
  /* Karim termine : maintenant les règles l acceptent. */
  await page.bringToFront(); await aller(page, '#/', '[data-terminer]');
  await page.click('[data-terminer]'); await page.waitForSelector('[data-note-test="5"]', { timeout: 10000 });
  await page.click('[data-note-test="5"]'); await page.click('[data-valider]');
  verifier(await attendre(async () => /Test terminé le/.test(await texteDe(page, '.fin-test')), 30, 500), 'avec son avis, « J ai terminé » passe');
  verifier(!(await page.$('.voile [data-envoyer]')), 'et l avis n est pas redemandé après');

  console.log('\n== 6. La fiche de la campagne, dans le Cockpit');
  await eq.bringToFront();
  await aller(eq, '#/tests?projet=atelier', `[data-editer-campagne="${CID}"]`);
  await eq.click(`[data-editer-campagne="${CID}"]`); await eq.waitForSelector('#ed-fonctionnalites', { timeout: 15000 });
  const ed = await eq.evaluate(() => ({
    logo: !!document.querySelector('#ed-logo-fichier'), nomLogo: (document.querySelector('#ed-logo-nom') || {}).innerText || '',
    discours: (document.querySelector('[name="discours"]') || {}).value || '',
    lignes: document.querySelectorAll('[data-fonction-ligne]').length,
    ecrans: document.querySelectorAll('[data-fonction-ligne] select[data-fct="capture"] option').length,
  }));
  verifier(ed.logo && /forgeme-logo/.test(ed.nomLogo), 'la fiche a le champ du logo, et nomme celui qui est posé', ed.nomLogo);
  verifier(/promet/.test(ed.discours), 'le discours se modifie depuis la fiche');
  verifier(ed.lignes === 4 && ed.ecrans >= 4, 'les quatre fonctionnalités, chacune avec le choix d un écran', JSON.stringify(ed));
  await capture(eq, 'apres-16-cockpit-fiche-campagne');
  await eq.click('[data-fct-ajouter]'); await pause(300);
  const nTitres = await eq.$$('[data-fonction-ligne] [data-fct="titre"]');
  await nTitres[nTitres.length - 1].fill('Les dates importantes');
  const nPhrases = await eq.$$('[data-fonction-ligne] [data-fct="phrase"]');
  await nPhrases[nPhrases.length - 1].fill('Un anniversaire, une échéance, et le rappel la veille.');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await eq.setInputFiles('#ed-logo-fichier', { name: 'nouveau-logo.png', mimeType: 'image/png', buffer: png });
  await eq.click('.voile button[type="submit"]');
  const enregistre = await attendre(async () => { const c = await lire(`projets/${PID}/campagnes/${CID}`); const f = (((champ(c, 'fonctionnalites').arrayValue) || {}).values) || []; const l = ((champ(c, 'logo').mapValue || {}).fields || {}); return f.length === 5 && /\/logo\/.*nouveau-logo\.png$/.test((l.chemin || {}).stringValue || ''); }, 30, 500);
  verifier(enregistre, 'une cinquième fonctionnalité et un nouveau logo s enregistrent sur la campagne');
  verifier(await attendre(async () => (await page.$$('.pres-fonction')).length === 5 || (await aller(page, '#/presentation', '.page--presentation') && (await page.$$('.pres-fonction')).length === 5), 20, 600), 'et le testeur la voit dans « Présentation »');

  console.log('\n== 7. Sur un téléphone');
  const tel = await (await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })).newPage();
  tel.on('pageerror', (e) => erreurs.push(`téléphone : ${e.message.slice(0, 160)}`));
  await connecter(tel, 'sonia.testeur@essai.test');
  if (await tel.$('.accueil')) { await tel.click('.accueil [data-accueil="passer"]'); await tel.waitForSelector('.accueil', { state: 'detached' }).catch(() => null); }
  await aller(tel, '#/presentation', '.page--presentation'); await pause(1500);
  verifier((await tel.evaluate(() => document.documentElement.scrollWidth)) <= 391, '390 : la présentation sans défilement de côté');
  await capture(tel, 'apres-17-telephone-presentation');
  await aller(tel, '#/guide', '[data-visite-relancer]'); await tel.click('[data-visite-relancer]'); await tel.waitForSelector('.visite-carte', { timeout: 10000 });
  verifier(await tel.waitForSelector('.visite-carte--bas', { timeout: 5000 }).catch(() => null), '390 : la carte de la visite se pose en bas de l écran');
  await tel.click('[data-visite="suivant"]'); await pause(600); await tel.click('[data-visite="suivant"]'); await pause(1200); await tel.click('[data-visite="suivant"]'); await pause(900);
  const telSig = await tel.evaluate(() => ({ titre: document.querySelector('#visite-titre').innerText, texte: document.querySelector('#visite-texte').innerText }));
  verifier(/Mes signalements/.test(telSig.titre) && /dans ce menu/.test(telSig.texte), '390 : le rail replié, la visite montre le bouton du menu', JSON.stringify(telSig));
  verifier((await tel.evaluate(() => document.documentElement.scrollWidth)) <= 391, '390 : la visite sans défilement de côté');
  await capture(tel, 'apres-18-telephone-visite');
  await tel.keyboard.press('Escape');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: `${CAPTURES}/echec.png` }); } catch (err) { /* rien */ } }
  process.exit(2);
});
