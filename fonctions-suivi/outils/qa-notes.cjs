/* ==========================================================================
   CAPMEDIA CLIENT HUB · les notes partagées par le client, côté Cockpit

   La revue de sécurité du 02/10/2026 : le nom affiché sous une note
   partagée venait du champ « nom » du document, que le client écrit
   lui-même. Une cliente pouvait signer « Alex Durand (Capmedia) ». Le nom
   vient désormais de l'annuaire des interlocuteurs du projet, retrouvé par
   uid (comme le coffre) ; une personne qu'on n'y trouve pas est « Un
   client ».

   Ce que prouve cette suite :
   - les règles, par REST avec les vrais jetons : la cliente écrit une note
     à son nom (uid), partagée sur SON projet ; une autre cliente ne la lit
     pas et ne partage rien sur un projet qui n'est pas le sien ; l'équipe
     lit la note partagée, pas la note privée ; elle n'écrit pas de carnet ;
   - l'écran, côté Cockpit (accueil et aperçu du projet) : le nom affiché
     est celui de l'annuaire, jamais celui du document ; « En faire une
     demande » porte ce même nom.

   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) }); const T = (d) => ({ timestampValue: d.toISOString() });
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })).status;
const statutCommit = async (jeton, writes) => (await fetch(`${RACINE}:commit`, { method: 'POST', headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=200')).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await pause(1500); };
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const FAUX_NOM = 'Alex Durand (Capmedia)';
/* Une note du carnet, telle que l'écran l'écrit : cree et maj datées par le serveur. */
const note = (id, { uid, nom = FAUX_NOM, projet = 'atelier', texte, partagee = true }) => ({
  update: { name: nomDoc(`notesClient/${id}`), fields: { uid: S(uid), nom: S(nom), projet: S(projet), texte: S(texte), epinglee: B(false), partagee: B(partagee) } },
  updateTransforms: [{ fieldPath: 'cree', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  await vider('notesClient');
  const uidCamille = await uidDe(CAMILLE); const uidLea = await uidDe(LEA);
  const jA = await jetonPour(ADMIN); const jC = await jetonPour(CAMILLE); const jL = await jetonPour(LEA);

  /* L'annuaire du projet : le miroir « personnesClient », tenu par le serveur. */
  const miroir = await attendre(async () => (((champ(await lire('projets/atelier'), 'personnesClient').arrayValue || {}).values) || [])
    .some((v) => ((((v.mapValue || {}).fields || {}).uid) || {}).stringValue === uidCamille), 30000);
  verifier(miroir, 'l annuaire du projet connaît Camille (miroir personnesClient)');

  console.log('\n== Les règles, avec les vrais jetons');
  verifier(await statutCommit(jC, [note('n-signee', { uid: uidCamille, texte: 'Et si la liste se triait par date ?' })]) === 200, 'la cliente partage une note sur son projet (signée d un faux nom : le champ est libre)');
  verifier(await statutCommit(jC, [note('n-privee', { uid: uidCamille, texte: 'Idée privée du banc', partagee: false })]) === 200, 'et garde une note privée');
  verifier(await statutCommit(jL, [note('n-lea', { uid: uidLea, nom: 'Léa', texte: 'Chez les voisins', projet: 'atelier' })]) === 403, 'une cliente d un autre projet ne partage rien sur Atelier (403)');
  verifier(await statutCommit(jL, [note('n-usurpee', { uid: uidCamille, texte: 'Au nom de Camille' })]) === 403, 'ni n écrit une note au nom (uid) de Camille (403)');
  verifier(await statutCommit(jA, [note('n-equipe', { uid: await uidDe(ADMIN), texte: 'Carnet de l équipe' })]) === 403, 'l équipe n a pas de carnet (403)');
  verifier(await statutLecture('notesClient/n-signee', jL) === 403 && await statutLecture('notesClient/n-privee', jL) === 403, 'l autre cliente ne lit aucune note de Camille (403)');
  verifier(await statutLecture('notesClient/n-signee', jA) === 200, 'l équipe du projet lit la note partagée');
  verifier(await statutLecture('notesClient/n-privee', jA) === 403, 'mais pas la note privée (403)');
  /* Une note partagée par quelqu'un qu'on ne trouve pas dans l'annuaire du
     projet (un ancien interlocuteur) : posée par le banc. */
  await poser('notesClient/n-inconnu', { uid: S('uid-hors-annuaire'), nom: S('Directeur Capmedia'), projet: S('atelier'), texte: S('Note d une personne partie'), epinglee: B(false), partagee: B(true), cree: T(new Date()), maj: T(new Date()) });

  const nav = await chromium.launch();
  const erreurs = [];
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, ADMIN);
  const lignes = async () => page.$$eval('#notes-partagees .note-partagee', (els) => els.map((e) => ({ id: e.dataset.note, qui: (e.querySelector('.t-micro') || {}).textContent || '' })));

  console.log('\n== Cockpit, accueil : le nom vient de l annuaire');
  await aller(page, '#/');
  const accueil = await attendre(async () => { const l = await lignes(); return l.some((x) => x.id === 'n-signee') ? l : null; }, 20000) || [];
  const signee = accueil.find((x) => x.id === 'n-signee') || { qui: '' };
  verifier(/Camille Martin/.test(signee.qui), 'la note est signée Camille Martin, le nom de l annuaire', signee.qui);
  verifier(!/Alex Durand|Capmedia/.test(signee.qui), 'jamais le nom que la cliente a écrit dans le document', signee.qui);
  const inconnu = accueil.find((x) => x.id === 'n-inconnu') || { qui: '' };
  verifier(/Un client/.test(inconnu.qui) && !/Directeur/.test(inconnu.qui), 'hors de l annuaire : « Un client »', inconnu.qui);
  verifier(!accueil.some((x) => x.id === 'n-privee'), 'la note privée n apparaît pas');
  verifier(!/Alex Durand \(Capmedia\)|Directeur Capmedia/.test(await page.$eval('#notes-partagees', (e) => e.textContent).catch(() => '')), 'aucun nom écrit par le client dans le bloc');

  console.log('\n== Cockpit, aperçu du projet');
  await aller(page, '#/projets/atelier');
  const projet = await attendre(async () => { const l = await lignes(); return l.some((x) => x.id === 'n-signee') ? l : null; }, 20000) || [];
  const p1 = projet.find((x) => x.id === 'n-signee') || { qui: '' };
  verifier(/Camille Martin/.test(p1.qui) && !/Alex Durand|Capmedia/.test(p1.qui), 'sur l aperçu aussi : Camille Martin, pas le nom du document', p1.qui);
  const p2 = projet.find((x) => x.id === 'n-inconnu') || { qui: '' };
  verifier(/Un client/.test(p2.qui), 'et « Un client » pour une personne hors de l annuaire', p2.qui);

  console.log('\n== « En faire une demande » porte le nom de l annuaire');
  await page.evaluate(() => {
    window.__depuis = '';
    const avant = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('suivi:demande-depuis:')) window.__depuis = v; return avant.call(this, k, v); };
  });
  await page.click('#notes-partagees [data-note-demande="n-signee"]');
  await page.waitForSelector('.menu button', { timeout: 8000 });
  await page.click('.menu button');
  const depuis = await attendre(async () => page.evaluate(() => window.__depuis), 8000);
  let auteur = ''; try { auteur = JSON.parse(depuis).auteur; } catch (e) { /* vide */ }
  verifier(auteur === 'Camille Martin', 'la demande préremplie est au nom de Camille Martin', auteur);

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  await vider('notesClient');
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-notes-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
