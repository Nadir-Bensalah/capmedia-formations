require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · la règle du socle (Nadir, 08/10/2026), dans la vraie page
   et sur le vrai serveur

   La règle elle-même est éprouvée sans navigateur dans
   repartition-socle.test.mjs. Ici, ce que seuls la page, les règles et le
   serveur peuvent prouver :
   - « Répartir » lit les retraits dans le Hub (parcours des robots et
     anomalies du projet), pas dans un fichier ;
   - l'aperçu dit la charge (socle, reste, heures), ce qui reste aux robots
     et ce qui est retiré, et n'écrit rien avant « Enregistrer » ;
   - l'affectation écrite : le socle chez les six, le plafond tenu, chaque
     passage hors socle une seule fois, la priorité respectée, les retraits
     appliqués (jamais à un « humain » seul), le web partagé ;
   - la feuille de l'éditeur montre le socle et le plafond ;
   - chez le testeur : le socle d'abord ;
   - aucune notification au client : ni au lancement, ni pour un échec ;
     l'échec devient une anomalie interne « À confirmer », rattachée au bug
     connu, que le client ne lit (règles et page) qu'une fois confirmée.

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne (six testeurs, campagne « c-oct »).

     node fonctions-suivi/outils/qa-repartition-socle.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d', SITE = BANC.site, P = 'atelier', CID = 'c-oct';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, n) => ((((d || {}).fields || {})[n]) || {}).stringValue || '';
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const attendre = async (fn, n = 60, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
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

/* --------------------------------------------------------------------------
   Le plan de la suite, et ce que les robots en savent déjà
   - qsins : le socle (deux scénarios de priorité haute) ;
   - qsjou-f-001..008 : priorité haute, humain et robot, trois plateformes ;
     f-001 rouge chez un robot sur iPhone, f-002 vert partout chez un robot,
     f-003 visé par un bug connu sur le web ;
   - qsjou-f-009..014 : priorité moyenne, humain et robot ;
   - qsnot-f-001..006 : priorité basse, humain seul ; qsnot-f-007 humain
     seul, iPhone, rouge chez un robot : jamais retiré.
   Plafond 8. Le socle fait 3 tests chez chacun (2 au téléphone, 1 au web).
   -------------------------------------------------------------------------- */
const TROIS = ['ios', 'android', 'web'];
const sc = (id, qui, priorite, plateformes = TROIS, extra = {}) => ({ id, titre: `Scénario ${id}`, etapes: 'Ouvrir l\'application.', attendu: 'Ça marche.', plateformes, type: 'normal', priorite, refs: [], qui, parcours: [], ...extra });
const vides = { fonctionnel: [], technique: [], ux: [], securite: [] };
const n3 = (i) => String(i).padStart(3, '0');
const SECTIONS = [
  { id: 'qsins', groupe: 'demarrage', ordre: 1, titre: 'Inscription du banc', resume: 'S inscrire.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: [sc('qsins-f-001', 'les-deux', 'haute'), sc('qsins-f-002', 'humain', 'haute', ['ios', 'android'])] } },
  { id: 'qsjou', groupe: 'fonctionnalites', ordre: 2, titre: 'Journal du banc', resume: 'Le journal.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: [
      ...Array.from({ length: 8 }, (_, i) => sc(`qsjou-f-${n3(i + 1)}`, 'les-deux', 'haute', TROIS, i === 0 ? { parcours: ['QS-ROUGE-IOS'] } : i === 1 ? { parcours: ['QS-VERT'] } : {})),
      ...Array.from({ length: 6 }, (_, i) => sc(`qsjou-f-${n3(i + 9)}`, 'les-deux', 'moyenne')),
      sc('qsjou-f-015', 'robot', 'haute', ['ios']),
    ] } },
  { id: 'qsnot', groupe: 'fonctionnalites', ordre: 3, titre: 'Notes du banc', resume: 'Les notes.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: [
      ...Array.from({ length: 6 }, (_, i) => sc(`qsnot-f-${n3(i + 1)}`, 'humain', 'basse')),
      sc('qsnot-f-007', 'humain', 'basse', ['ios'], { parcours: ['QS-ROUGE-HUMAIN'] }),
    ] } },
];
const SOCLE = ['qsins-f-001', 'qsins-f-002'];
const PLAFOND = 8;
const TOUS = SECTIONS.flatMap((s) => Object.values(s.aspects).flat());
const PRIO = { haute: 0, moyenne: 1, basse: 2 };
const RETIREES = ['qsjou-f-001__ios', 'qsjou-f-002__web', 'qsjou-f-003__web'];

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;

  console.log('\n== Le terrain : le plan, les robots, un bug connu, la campagne');
  for (const d of (await db.collection(`projets/${P}/planTests`).get()).docs) await d.ref.delete();
  for (const s of SECTIONS) await db.doc(`projets/${P}/planTests/${s.id}`).set(s);
  await db.doc(`projets/${P}/planTests/presentation`).set({ genre: 'presentation', intro: 'Le plan du banc.', plateformes: TROIS, aspects: [] });
  await db.doc(`projets/${P}/parcours/QS-ROUGE-IOS`).set({ ref: 'QS-ROUGE-IOS', titre: 'Robot rouge', plateformes: ['ios'], etat: 'rouge', actif: true, projet: P });
  await db.doc(`projets/${P}/parcours/QS-VERT`).set({ ref: 'QS-VERT', titre: 'Robot vert', plateformes: [], etat: 'vert', actif: true, projet: P });
  await db.doc(`projets/${P}/parcours/QS-ROUGE-HUMAIN`).set({ ref: 'QS-ROUGE-HUMAIN', titre: 'Robot rouge sur un humain seul', plateformes: ['ios'], etat: 'rouge', actif: true, projet: P });
  await db.doc(`projets/${P}/anomalies/robot-QS-BUG-01`).set({ titre: 'Le journal ne s ouvre pas sur le web', statut: 'nouvelle', origine: 'robot', interne: false, gravite: 'important', scenarios: ['qsjou-f-003'], plateformes: ['web'], scenario: '', passages: [], temoins: [] });
  await db.doc(`projets/${P}/anomalies/robot-QS-BUG-02`).set({ titre: 'L inscription par code échoue sur iPhone', statut: 'nouvelle', origine: 'robot', interne: false, gravite: 'critique', scenarios: ['qsins-f-002'], plateformes: ['ios'], scenario: '', passages: [], temoins: [] });
  await db.doc(`projets/${P}/anomalies/ko-qsins-f-002`).delete().catch(() => {});
  for (const d of (await db.collection(`projets/${P}/campagnes/${CID}/passages`).get()).docs) await d.ref.delete();
  await db.doc(`projets/${P}/campagnes/${CID}`).update({
    statut: 'preparation', plan: true, scenarios: TOUS.filter((x) => x.qui !== 'robot').map((x) => x.id),
    regle: 'socle', socle: SOCLE, plafond: PLAFOND, testeurs: [], affectation: {},
    retraits: admin.firestore.FieldValue.delete(), repartition: admin.firestore.FieldValue.delete(),
  });
  const vivier = (await db.collection('testeurs').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.actif !== false);
  const telDe = Object.fromEntries(vivier.map((t) => [t.id, t.mobile]));
  verifier(vivier.length === 6, 'six testeurs au vivier', `${vivier.length}`);
  const camille = await admin.auth().getUserByEmail('camille.essai@exemple.test');
  const agent = await admin.auth().getUserByEmail('agent.essai@exemple.test');
  await pause(3000);

  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const err = []; page.on('pageerror', (e) => err.push(`PAGE: ${e.message.slice(0, 160)}`));
  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, `/tests?projet=${P}`, `[data-action="ouvrir-campagne"][data-id="${CID}"]`);

  console.log('\n== L\'éditeur montre le socle et le plafond');
  await page.evaluate((id) => { const b = document.querySelector(`[data-editer-campagne="${id}"]`); if (b) b.click(); }, CID);
  await page.waitForSelector('[data-socle-groupe]', { timeout: 15000 }).catch(() => null);
  const ed = await page.evaluate(() => ({
    groupe: !!document.querySelector('[data-socle-groupe]'),
    coches: [...document.querySelectorAll('[data-socle]')].filter((c) => c.checked).map((c) => c.dataset.socle),
    candidats: document.querySelectorAll('[data-socle]').length,
    plafond: (document.querySelector('[name="plafond"]') || {}).value,
    compte: (document.querySelector('#compte-socle') || {}).textContent || '',
  }));
  verifier(ed.groupe, 'la feuille de la campagne a son « socle décisif »');
  verifier(ed.coches.sort().join(',') === SOCLE.join(','), 'le socle de la campagne y est coché', ed.coches.join(','));
  verifier(ed.candidats === 10, 'les candidats sont les scénarios de priorité haute', `${ed.candidats}`);
  verifier(ed.plafond === String(PLAFOND), 'le plafond de la campagne y est', ed.plafond);
  verifier(/2 scénarios dans le socle, soit 3 tests au plus par testeur/.test(ed.compte), 'le compte du socle dit ce qu il coûte', ed.compte);
  await page.keyboard.press('Escape'); await pause(800);

  console.log('\n== Répartir : l\'aperçu, avant toute écriture');
  await page.evaluate((id) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`); if (b) b.click(); }, CID);
  await page.waitForSelector('[data-repartir]', { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('[data-testeur]').forEach((c) => { c.checked = true; }));
  await page.click('[data-repartir]');
  await page.waitForSelector('[data-apercu-charges]', { timeout: 20000 }).catch(() => null);
  const a = await page.evaluate(() => ({
    lignes: [...document.querySelectorAll('[data-charge]')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())),
    robots: (document.querySelector('[data-apercu-robots]') || {}).innerText || '',
    retires: (document.querySelector('[data-apercu-retires]') || {}).innerText || '',
    bloque: !!(document.querySelector('[data-enregistrer-repartition]') || {}).disabled,
  }));
  verifier(a.lignes.length === 6, 'l aperçu montre les six', `${a.lignes.length}`);
  verifier(a.lignes.every((l) => l[2] === '3' && l[5] === String(PLAFOND)), `chacun : socle 3, total ${PLAFOND}`, JSON.stringify(a.lignes));
  verifier(a.lignes.every((l) => /0,7 h/.test(l[6])), 'et le temps que ça représente', a.lignes.map((l) => l[6]).join('/'));
  verifier(/tests laissés aux robots/.test(a.robots) && /« humain » seuls ne trouvent pas de place/.test(a.robots), 'il dit ce qui reste aux robots, et les « humain » seuls sans place', a.robots);
  verifier(/3 passages retirés/.test(a.retires) && /1 déjà rouge ou en défaut connu chez les robots/.test(a.retires) && /1 bug déjà connu/.test(a.retires) && /1 déjà validé au vert/.test(a.retires), 'il dit ce qui est retiré, et pourquoi', a.retires);
  verifier(!a.bloque, 'l enregistrement est possible');
  await pause(800);
  verifier(Object.keys(((await db.doc(`projets/${P}/campagnes/${CID}`).get()).data() || {}).affectation || {}).length === 0, 'rien n est écrit tant que l aperçu est ouvert');

  console.log('\n== Enregistrer, puis examiner l\'affectation');
  await page.click('[data-enregistrer-repartition]');
  const c = await attendre(async () => { const x = (await db.doc(`projets/${P}/campagnes/${CID}`).get()).data() || {}; return Object.keys(x.affectation || {}).length ? x : null; }, 40, 500) || {};
  const aff = c.affectation || {};
  const uids = Object.keys(aff);
  verifier(uids.length === 6, 'six testeurs ont leur lot', `${uids.length}`);
  verifier(uids.every((u) => aff[u].telephone === telDe[u]), 'le téléphone imposé est celui de la fiche');
  const scDe = new Map(TOUS.map((x) => [x.id, x]));
  const porteurs = new Map();
  const horsPlateforme = [];
  uids.forEach((u) => (aff[u].cles || []).forEach((k) => {
    const [id, p] = k.split('__');
    if (p !== 'web' && p !== aff[u].telephone) horsPlateforme.push(`${u}:${k}`);
    porteurs.set(k, [...(porteurs.get(k) || []), u]);
  }));
  verifier(!horsPlateforme.length, 'chacun ne reçoit que son téléphone et le web', horsPlateforme.slice(0, 3).join(', '));
  const socleCles = TOUS.filter((x) => SOCLE.includes(x.id)).flatMap((x) => x.plateformes.map((p) => `${x.id}__${p}`));
  verifier(socleCles.every((k) => (porteurs.get(k) || []).length === uids.filter((u) => k.endsWith('__web') || k.endsWith(`__${aff[u].telephone}`)).length), 'le socle est fait par tous (trois iPhone, trois Android, six sur le web)', socleCles.map((k) => `${k}:${(porteurs.get(k) || []).length}`).join(' '));
  verifier(uids.every((u) => aff[u].cles.length <= PLAFOND), `personne au-delà de ${PLAFOND}`, uids.map((u) => aff[u].cles.length).join('/'));
  const doubles = [...porteurs.entries()].filter(([k, l]) => !SOCLE.includes(k.split('__')[0]) && l.length > 1).map(([k]) => k);
  verifier(!doubles.length, 'hors socle, chaque passage une seule fois', doubles.join(', '));
  verifier(RETIREES.every((k) => !porteurs.has(k)), 'les passages connus des robots ou du bug sont retirés', RETIREES.filter((k) => porteurs.has(k)).join(', '));
  verifier(porteurs.has('qsjou-f-001__android') && porteurs.has('qsjou-f-002__ios'), 'mais pas sur les autres plateformes');
  const prisHors = [...porteurs.keys()].filter((k) => !SOCLE.includes(k.split('__')[0]));
  const plusBas = Math.max(...prisHors.map((k) => PRIO[scDe.get(k.split('__')[0]).priorite]));
  const hauteToutes = TOUS.filter((x) => x.priorite === 'haute' && x.qui !== 'robot' && !SOCLE.includes(x.id)).flatMap((x) => x.plateformes.map((p) => `${x.id}__${p}`)).filter((k) => !RETIREES.includes(k));
  verifier(hauteToutes.every((k) => porteurs.has(k)), 'toute la priorité haute est prise avant le reste', hauteToutes.filter((k) => !porteurs.has(k)).join(', '));
  verifier(plusBas === PRIO.moyenne, 'la moyenne entre ensuite, la basse attend', `pire prise : ${plusBas}`);
  /* Le web n'est à personne en particulier : ses passages hors socle vont
     aux iPhone comme aux Android, au moins chargé. */
  const webHors = [...porteurs.entries()].filter(([k]) => k.endsWith('__web') && !SOCLE.includes(k.split('__')[0])).flatMap(([, l]) => l);
  verifier(webHors.some((u) => aff[u].telephone === 'ios') && webHors.some((u) => aff[u].telephone === 'android') && new Set(webHors).size >= 4, 'le web est partagé entre iPhone et Android', [...new Set(webHors)].map((u) => aff[u].telephone).join('/'));
  verifier(c.regle === 'socle' && JSON.stringify(c.socle) === JSON.stringify(SOCLE) && c.plafond === PLAFOND, 'la campagne garde sa règle, son socle et son plafond');
  verifier(JSON.stringify((c.retraits || []).slice().sort()) === JSON.stringify(RETIREES.slice().sort()), 'et la liste de ce qui est retiré', JSON.stringify(c.retraits));
  const laisses = (c.repartition || {}).laissesAuxRobots;
  verifier(Number.isFinite(laisses) && laisses > 0 && (c.repartition || {}).sansPersonne === 19, `le bilan : ${laisses} laissés aux robots, 19 « humain » seuls sans place`, JSON.stringify(c.repartition));

  console.log('\n== La fiche de la campagne le dit');
  await pause(1500);
  await page.evaluate((id) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`); if (b) b.click(); }, CID);
  await page.waitForSelector('[data-regle-socle]', { timeout: 15000 }).catch(() => null);
  const fiche = await page.evaluate(() => ({
    robots: ((document.querySelector('[data-chiffre-robots]') || {}).innerText || '').replace(/\s+/g, ' '),
    regle: (document.querySelector('[data-regle-socle]') || {}).innerText || '',
    pret: ((document.querySelector('[data-pret="repartition"]') || {}).innerText || '').replace(/\s+/g, ' '),
    ok: (document.querySelector('[data-pret="repartition"]') || {}).dataset ? document.querySelector('[data-pret="repartition"]').dataset.ok : '',
  }));
  verifier(new RegExp(`^${laisses} laissés aux robots`).test(fiche.robots), 'un chiffre dit combien de tests sont laissés aux robots', fiche.robots);
  verifier(/Socle de 2 scénarios, fait par tous\. Plafond de 8 tests par testeur/.test(fiche.regle), 'la règle est rappelée en une phrase', fiche.regle);
  verifier(fiche.ok === '1' && /laissés aux robots/.test(fiche.pret), '« Prête à lancer » juge la répartition conforme', fiche.pret);
  await page.keyboard.press('Escape'); await pause(500);

  console.log('\n== Lancer ne dit rien au client');
  await db.collection(`boites/${camille.uid}/notifications`).get().then((q) => Promise.all(q.docs.map((d) => d.ref.delete())));
  await vider('envois');
  await db.doc(`projets/${P}/campagnes/${CID}`).update({ statut: 'en-cours' });
  const trace = await attendre(async () => (await docs('activite?pageSize=300')).find((x) => /a ouvert la campagne de tests/.test(str(x, 'texte'))), 40, 500);
  verifier(trace && str(trace, 'visibilite') === 'interne', 'le lancement laisse une trace interne', trace ? str(trace, 'visibilite') : '(rien)');
  await pause(2500);
  const clochesClient = async () => (await db.collection(`boites/${camille.uid}/notifications`).get()).docs.map((d) => d.data()).filter((n) => n.type === 'test' || /campagne|anomalie|testeur/i.test(n.titre || ''));
  verifier(!(await clochesClient()).length, 'aucune notification de test chez le client', JSON.stringify(await clochesClient()).slice(0, 160));
  verifier(!(await docs('envois?pageSize=200')).some((e) => ['campagne', 'anomalie'].includes(str(e, 'modele'))), 'aucune lettre au client');

  console.log('\n== Un échec de testeur : interne, rattaché au bug connu');
  await db.collection(`boites/${agent.uid}/notifications`).get().then((q) => Promise.all(q.docs.map((d) => d.ref.delete())));
  const iphone = uids.find((u) => aff[u].telephone === 'ios');
  await db.doc(`projets/${P}/campagnes/${CID}/passages/${iphone}__qsins-f-002__ios`).set({
    scenario: 'qsins-f-002', testeur: iphone, plateforme: 'ios', resultat: 'echec', commentaire: 'Le code n arrive jamais.', preuves: [], contexte: {}, cree: T.now(), maj: T.now(),
  });
  const ano = await attendre(async () => { const d = await db.doc(`projets/${P}/anomalies/ko-qsins-f-002`).get(); return d.exists ? d.data() : null; }, 60, 500) || {};
  verifier(ano.interne === true && ano.statut === 'nouvelle', 'l échec devient une anomalie interne « À confirmer »', JSON.stringify({ interne: ano.interne, statut: ano.statut }));
  verifier(Array.isArray(ano.bugsConnus) && ano.bugsConnus.includes('robot-QS-BUG-02'), 'rattachée au bug connu sur ce scénario et ce téléphone', JSON.stringify(ano.bugsConnus));
  verifier(Boolean(await attendre(async () => (await db.collection(`boites/${agent.uid}/notifications`).get()).docs.some((d) => d.data().titre === 'Un échec à confirmer'), 40, 500)), 'l équipe est prévenue');
  await pause(2500);
  verifier(!(await clochesClient()).length, 'le client, non', JSON.stringify(await clochesClient()).slice(0, 160));
  verifier(!(await docs('envois?pageSize=200')).some((e) => str(e, 'modele') === 'anomalie'), 'ni lettre');
  verifier(!(await docs('activite?pageSize=300')).some((x) => str(x, 'type') === 'test' && str(x, 'visibilite') === 'client'), 'ni activité de test visible du client');
  const jC = await jetonPour('camille.essai@exemple.test');
  const avecC = { Authorization: `Bearer ${jC}` };
  verifier((await fetch(bdd(`projets/${P}/anomalies/ko-qsins-f-002`), { headers: avecC })).status === 403, 'les règles refusent l anomalie interne au client');
  verifier((await fetch(bdd(`projets/${P}/anomalies/robot-QS-BUG-02`), { headers: avecC })).status === 200, 'le bug des robots, lui, se lit (« À confirmer »)');

  console.log('\n== Le Hub du client, avant et après confirmation');
  const nav2 = await chromium.launch();
  const cl = await (await nav2.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const errC = []; cl.on('pageerror', (e) => errC.push(e.message.slice(0, 160)));
  cl.on('console', (m) => { if (m.type() === 'error' && /permission|insufficient/i.test(m.text())) errC.push(m.text().slice(0, 160)); });
  await connecter(cl, 'camille.essai@exemple.test');
  await aller(cl, `/tests?projet=${P}&onglet=problemes`, '.page');
  await pause(2500);
  const avantTexte = await cl.evaluate(() => document.body.innerText);
  verifier(/L inscription par code échoue sur iPhone/.test(avantTexte), 'le client voit les bugs des robots', avantTexte.slice(0, 200).replace(/\s+/g, ' '));
  verifier(!/Scénario qsins-f-002/.test(avantTexte), 'pas l échec du testeur avant confirmation');
  await db.doc(`projets/${P}/anomalies/ko-qsins-f-002`).update({ statut: 'confirmee' });
  verifier(Boolean(await attendre(async () => ((await db.doc(`projets/${P}/anomalies/ko-qsins-f-002`).get()).data() || {}).interne === false, 40, 500)), 'confirmée, le serveur l ouvre au client');
  verifier((await fetch(bdd(`projets/${P}/anomalies/ko-qsins-f-002`), { headers: avecC })).status === 200, 'les règles la lui laissent lire');
  verifier(Boolean(await attendre(async () => /Scénario qsins-f-002/.test(await cl.evaluate(() => document.body.innerText)), 40, 500)), 'elle apparaît dans son Hub, en direct');
  await pause(2000);
  verifier(!(await clochesClient()).length, 'toujours sans notification');
  verifier(!errC.length, 'aucune erreur de droits chez le client', errC.join(' | '));

  console.log('\n== Chez le testeur : le socle d\'abord');
  const karimUid = vivier.find((t) => t.prenom === 'Karim').id;
  const nav3 = await chromium.launch();
  const tp = await (await nav3.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await connecter(tp, 'karim.testeur@essai.test');
  if (await tp.$('.accueil [data-accueil="passer"]')) { await tp.click('.accueil [data-accueil="passer"]'); await pause(800); }
  await tp.waitForSelector('.tb--testeur [data-case]', { timeout: 25000 }).catch(() => null); await pause(1500);
  const cases = await tp.$$eval('.tb--testeur [data-case]', (l) => l.map((x) => x.dataset.case));
  const ordreCles = aff[karimUid] ? aff[karimUid].cles : [];
  const premier = await tp.getAttribute('[data-continuer]', 'data-continuer').catch(() => '');
  verifier(SOCLE.includes(String(premier).split('__')[0]), `son premier scénario est dans le socle (${premier})`);
  verifier(cases.length === ordreCles.length, `il a ses ${ordreCles.length} cases`, `${cases.length}`);
  await tp.click('[data-vue="liste"]').catch(() => {}); await pause(600);
  const liste = await tp.$$eval('.t-scenario [data-ouvrir]', (l) => l.map((x) => x.dataset.ouvrir));
  const rangs = liste.map((k) => (SOCLE.includes(k.split('__')[0]) ? -1 : PRIO[scDe.get(k.split('__')[0]).priorite]));
  verifier(rangs.length > 0 && rangs[0] === -1, 'la liste commence par le socle', liste.slice(0, 4).join(' '));

  verifier(!err.length, 'aucune erreur de page côté équipe', err.slice(0, 3).join(' | '));
  await nav.close(); await nav2.close(); await nav3.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
