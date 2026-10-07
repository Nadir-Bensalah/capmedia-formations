/* ==========================================================================
   CAPMEDIA CLIENT HUB · Aujourd'hui et l'aperçu d'un projet, côté équipe
   (refonte du Cockpit, lot 5)

   Ce que prouve cette suite, dans le Cockpit :
   - Aujourd'hui : le pavé « À traiter » dit le même nombre que l'entrée À
     traiter du rail, montre au plus huit lignes et « Tout voir » ; il se
     REPLIE (pas de Fermer côté équipe), le choix va dans le profil
     (pavesAttente.accueil), survit au rechargement, et le geste repeint la
     page une seule fois, sans squelette ; même chose pour « Attendent le
     client » (pavesAttente.projets['*']) ;
   - « Depuis mon passage » : les gestes des CLIENTS depuis la dernière
     visite, type par type, comptés comme la base, chacun vers sa page ;
     ni les gestes de l'équipe, ni ce qui précède le passage ; rien quand
     rien n'a bougé ;
   - Messages : le nombre de messages non lus, qui monte quand un client
     écrit et retombe une fois la conversation lue ; un seul fil concerné,
     le bouton y mène ;
   - les chiffres : ceux qui portent une action, chacun un lien vers sa
     liste ; plus de « Projets clients », « Mes projets » ni « Attendent le
     client » en tuile (la phrase d'accueil et le pavé les disent) ;
   - « + Projet » et « + Client » sous leur permission ;
   - l'aperçu d'un projet : « En attente du client » se replie (profil :
     projets.<pid>), « N autres points » mène aux tickets du projet, les
     textes parlent à l'équipe (« Le projet en un coup d'œil », « attendent
     le client ») ; la page d'une partie dit « Côté client » ;
   - un agent sans finance : ni + Projet, ni + Client, ni Impayé, et sa
     page n'attend plus les pièces qu'il ne reçoit jamais (aucun « dessin
     sans attendre ») ;
   - le client garde son pavé tel quel (Fermer compris).

   Banc : émulateurs (Functions compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin, uidDe } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.jour@exemple.test';
const CLIENTE = 'camille.essai@exemple.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail !== undefined ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

const dernierCode = async (e) => { for (let i = 0; i < 60; i += 1) { const p = (await docs('envois?pageSize=300')).filter((d) => ((d.fields.modele || {}).stringValue === 'code') && ((((d.fields.a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e))); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  await pause(2000);
};
const aller = async (page, h, attendu) => { await page.evaluate((x) => { location.hash = x; }, h); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(800); };
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const attendre = async (fn, ms = 12000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* encore */ } await pause(250); } return false; };
const nombre = async (page, sel) => Number(((await page.$eval(sel, (el) => el.textContent).catch(() => '')) || '').replace(/\D/g, '')) || 0;
const rougeBoite = (page) => nombre(page, '#lat-corps .lat-arbre[data-arbre=":a-traiter"] .lat-projet .compte.vif');
const PAVE = '[data-pave="accueil"]';
const PAVE_CLIENT = '[data-pave="projet:*"]';
const PAVE_PROJET = '[data-pave="projet:atelier"]';
const replie = (page, sel) => page.$eval(sel, (el) => el.classList.contains('attente--repliee')).catch(() => null);
const choixPaves = async (fs, uid) => ((await fs.doc(`profils/${uid}`).get()).data() || {}).pavesAttente || {};
/* Combien de fois la page est remplacée, et si un squelette passe. */
const sonder = (page) => page.evaluate(() => {
  window.__dessins = 0; window.__squelette = 0;
  if (window.__obs) window.__obs.disconnect();
  window.__obs = new MutationObserver((ms) => { for (const m of ms) { if (m.target.id === 'vue' && m.addedNodes.length) { window.__dessins += 1; if (document.querySelector('#vue .squelette')) window.__squelette += 1; } } });
  window.__obs.observe(document.querySelector('#vue'), { childList: true });
});
const releve = (page) => page.evaluate(() => ({ dessins: window.__dessins, squelette: window.__squelette }));
/* Rouvrir le Cockpit sans réécrire la dernière visite : quitter la page
   la pose (pagehide), on la remet ensuite à la main. */
const rouvrir = async (page, url, avant) => {
  await page.goto('about:blank'); await pause(1500);
  if (avant) await avant();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#vue .page h1', { timeout: 30000 }).catch(() => {});
  await pause(2000);
};

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  const T = admin.firestore.Timestamp;
  const ilYA = (h) => T.fromMillis(Date.now() - h * 3600000);
  const a1 = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Jour', role: 'agent', projets: ['atelier'] });
  verifier(a1.code === 200, 'un agent du socle sur Atelier seul (sans finance)', `${a1.code} ${a1.texte.slice(0, 120)}`);
  const uidAdmin = await uidDe(ADMIN);
  const uidCamille = await uidDe(CLIENTE);

  /* Au moins six points attendent le client sur Atelier : « N autres
     points » a de quoi s'afficher dans l'aperçu. */
  for (let i = 1; i <= 6; i += 1) {
    await fs.doc(`taches/jour-client-${i}`).set({ projet: 'atelier', titre: `Retour attendu ${i}`, statut: 'attente-client', priorite: 'normale', visibilite: 'client', archive: false, ordre: i, pieces: [], cree: ilYA(30), maj: ilYA(30) });
  }
  /* Un point bloquant du côté du client, sur la partie iOS. */
  await fs.doc('blocages/jour-blocage').set({ projet: 'atelier', composant: 'ios', titre: 'Compte développeur à créer', description: '', responsable: 'client', depuis: ilYA(48), resolu: null, visibilite: 'client', cree: ilYA(48), maj: ilYA(48) });
  /* La dernière visite : dans le futur d'abord, rien n'a « bougé ». */
  await fs.doc(`profils/${uidAdmin}`).set({ derniereVisite: T.fromMillis(Date.now() + 3600000) }, { merge: true });

  const nav = await chromium.launch();
  const erreurs = [];
  const avertissements = [];
  const contexte = async (nom) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`${nom} : ${e.message.slice(0, 160)}`));
    page.on('console', (m) => { const t = m.text(); if (t.includes('[magasin] dessin sans attendre')) avertissements.push({ nom, t: t.slice(0, 300), h: page.url() }); });
    return page;
  };

  /* ---------------------------------------------------------------- */
  console.log('\n== Aujourd hui, l administrateur');
  const pa = await contexte('admin');
  await connecter(pa, ADMIN);
  await aller(pa, '#/', `${PAVE}`);
  const url = pa.url();
  verifier(/Bonjour/.test(await texteDe(pa, '.page h1')), 'la page dit bonjour');
  verifier(!(await pa.$('#depuis-passage')), 'dernière visite à venir : pas de « Depuis mon passage »');
  verifier(Boolean(await pa.$('.page-tete .actions a[href="#/projets/nouveau"]')) && Boolean(await pa.$('.page-tete .actions a[href="#/clients/nouveau"]')), '« + Projet » et « + Client » pour l administrateur');
  verifier(await attendre(async () => (await nombre(pa, `${PAVE} .attente-tete .badge`)) === (await rougeBoite(pa)) && (await rougeBoite(pa)) > 0), 'le pavé À traiter dit le même nombre que l entrée À traiter du rail', `${await nombre(pa, `${PAVE} .attente-tete .badge`)} / ${await rougeBoite(pa)}`);
  const lignesPave = await pa.$$eval(`${PAVE} a.ligne[data-pave-item]`, (as) => as.length).catch(() => 0);
  verifier(lignesPave > 0 && lignesPave <= 8, 'au plus huit lignes', lignesPave);
  verifier(Boolean(await pa.$(`${PAVE} .attente-gestes a[href="#/a-traiter"]`)), '« Tout voir » mène à À traiter');
  verifier(!(await pa.$('[data-pave-geste="fermer"]')) && !(await pa.$('[data-pave-geste="reafficher"]')), 'côté équipe, un pavé ne se ferme pas : il se replie');
  const libelles = await pa.$$eval('#vue .metriques .metrique', (ms) => ms.map((m) => `${m.tagName}:${m.getAttribute('href') || ''}:${m.querySelector('.metrique-libelle').textContent.trim()}`));
  verifier(libelles.length === 5 && libelles.every((x) => /^A:#\//.test(x)), 'cinq chiffres, chacun un lien', libelles.join(' | '));
  verifier(!libelles.some((x) => /Projets clients|Mes projets|Attendent le client/.test(x)), 'ni « Projets clients », ni « Mes projets », ni « Attendent le client » en chiffre');
  verifier(/projets? clients? actifs?/.test(await texteDe(pa, '.page-tete .chapo')) && /projets? à moi/.test(await texteDe(pa, '.page-tete .chapo')), 'la phrase d accueil garde les projets clients et les miens', await texteDe(pa, '.page-tete .chapo'));
  await pa.click('#vue .metriques a[data-tuile="retard"]');
  verifier(await attendre(async () => (await hash(pa)) === '#/taches?retard=1', 5000), '« Tâches en retard » ouvre les tâches en retard', await hash(pa));
  await aller(pa, '#/', PAVE);
  await pa.click('#vue .metriques a[data-tuile="validations"]');
  verifier(await attendre(async () => (await hash(pa)) === '#/validations', 5000), '« Validations attendues » ouvre les validations', await hash(pa));
  await aller(pa, '#/', PAVE);

  console.log('\n== Le pavé À traiter se replie, le choix se retient');
  await sonder(pa);
  await pa.click(`${PAVE} [data-pave-geste="replier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE)) === true && !(await pa.$(`${PAVE} a.ligne`)), 5000), 'replié : le titre, le chiffre et « Tout voir » restent, les lignes partent');
  verifier(Boolean(await pa.$(`${PAVE} .attente-gestes a[href="#/a-traiter"]`)), '« Tout voir » reste visible replié');
  verifier(await attendre(async () => (await choixPaves(fs, uidAdmin)).accueil === 'replie'), 'le choix va dans le profil (pavesAttente.accueil)');
  await pause(1200);
  const r1 = await releve(pa);
  verifier(r1.dessins === 1 && r1.squelette === 0, 'le geste repeint la page une fois, sans squelette', JSON.stringify(r1));
  await pa.reload({ waitUntil: 'domcontentloaded' }); await pa.waitForSelector(PAVE, { timeout: 30000 }).catch(() => {}); await pause(1500);
  verifier((await replie(pa, PAVE)) === true, 'rechargé : toujours replié');
  await pa.click(`${PAVE} [data-pave-geste="deplier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE)) === false && Boolean(await pa.$(`${PAVE} a.ligne`))) && await attendre(async () => (await choixPaves(fs, uidAdmin)).accueil === 'ouvert'), 'déplié : les lignes reviennent, le profil dit « ouvert »');

  console.log('\n== « Attendent le client » se replie aussi');
  verifier(Boolean(await pa.$(`aside ${PAVE_CLIENT}`)) && /Attendent le client/.test(await texteDe(pa, `${PAVE_CLIENT} .attente-titre`)), '« Attendent le client » est un pavé, à droite');
  verifier((await nombre(pa, `${PAVE_CLIENT} .attente-tete .badge`)) >= 6, 'il compte les points qui attendent le client', await nombre(pa, `${PAVE_CLIENT} .attente-tete .badge`));
  await pa.click(`${PAVE_CLIENT} [data-pave-geste="replier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE_CLIENT)) === true && ((await choixPaves(fs, uidAdmin)).projets || {})['*'] === 'replie'), 'replié, et retenu (profil : projets[*])');
  verifier((await replie(pa, PAVE)) === false, 'l autre pavé ne bouge pas');
  await pa.click(`${PAVE_CLIENT} [data-pave-geste="deplier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE_CLIENT)) === false && ((await choixPaves(fs, uidAdmin)).projets || {})['*'] === 'ouvert'), 'déplié, et retenu');

  console.log('\n== Messages, avec les non lus');
  const badge = () => nombre(pa, '#vue .btn-messages #badge-messages');
  /* Toutes les conversations lues d'abord : le compte part de zéro. */
  const lus = {}; for (const p of (await fs.collection('projets').get()).docs) lus[`messages:${p.id}`] = T.now();
  await fs.doc(`profils/${uidAdmin}`).set({ lus }, { merge: true });
  verifier(await attendre(async () => !(await pa.$('#vue .btn-messages #badge-messages'))), 'tout lu : pas de pastille');
  await fs.collection('projets/atelier/messages').add({ de: { uid: uidCamille, nom: 'Camille Martin', cote: 'client' }, texte: 'Une question sur la maquette.', pieces: [], date: T.now() });
  verifier(await attendre(async () => (await badge()) === 1), 'Camille écrit : 1 non lu sur le bouton', await badge());
  verifier((await pa.$eval('#vue .btn-messages', (a) => a.getAttribute('href')).catch(() => '')) === '#/messages/atelier', 'un seul fil concerné : le bouton y mène');
  verifier(/1 message non lu/.test(await pa.$eval('#vue .btn-messages', (a) => a.getAttribute('aria-label')).catch(() => '')) && /1 message non lu/.test(await texteDe(pa, '.page-tete .chapo')), 'et le dit en toutes lettres (bouton, phrase d accueil)');
  await pa.click('#vue .btn-messages');
  await pa.waitForSelector('#texte-message', { timeout: 15000 }).catch(() => {}); await pause(2000);
  await aller(pa, '#/', PAVE);
  verifier(await attendre(async () => !(await pa.$('#vue .btn-messages #badge-messages'))), 'la conversation lue, la pastille retombe');

  console.log('\n== Depuis mon passage');
  const passage = Date.now() - 2 * 3600000;
  /* Ce que les clients ont fait depuis, et ce qui ne compte pas. */
  const act = (id, d) => fs.doc(`activite/${id}`).set({ organisation: null, cible: null, lien: null, visibilite: 'client', ...d });
  await act('jour-f1', { projet: 'atelier', type: 'fichier', texte: 'a déposé le fichier « brief.pdf »', par: { uid: uidCamille, nom: 'Camille Martin', cote: 'client' }, date: ilYA(1) });
  await act('jour-f2', { projet: 'atelier', type: 'fichier', texte: 'a déposé le fichier « logo.png »', par: { uid: uidCamille, nom: 'Camille Martin', cote: 'client' }, date: ilYA(0.5) });
  await act('jour-d1', { projet: 'boutique', type: 'demande', texte: 'a ouvert la demande BOUT-9', par: { uid: 'uid-lea', nom: 'Léa Bernard', cote: 'client' }, date: ilYA(0.7) });
  await act('jour-e1', { projet: 'atelier', type: 'fichier', texte: 'a déposé le fichier « interne.pdf »', par: { uid: uidAdmin, nom: 'Alex Durand', cote: 'equipe' }, date: ilYA(0.4) });
  await act('jour-v1', { projet: 'atelier', type: 'fichier', texte: 'a déposé le fichier « ancien.pdf »', par: { uid: uidCamille, nom: 'Camille Martin', cote: 'client' }, date: ilYA(5) });
  await rouvrir(pa, url, () => fs.doc(`profils/${uidAdmin}`).set({ derniereVisite: T.fromMillis(passage) }, { merge: true }));
  verifier(await attendre(async () => Boolean(await pa.$('#depuis-passage'))), '« Depuis mon passage » paraît quand des clients ont agi');
  /* La base fait foi : les gestes des clients depuis le passage, par type. */
  /* Le semis a ses propres gestes de clients (fichiers, tickets) : on
     compare à la base, et l'on prouve que ceux de l'équipe et ceux d'avant
     le passage n'y sont pas (le compte « naïf » diffère). */
  const attendus = {}; const naifs = {}; const projetsDe = {};
  for (const d of await docs('activite?pageSize=300')) {
    const f = d.fields || {}; const par = ((f.par || {}).mapValue || {}).fields || {};
    const date = new Date((f.date || {}).timestampValue || 0).getTime();
    const t = (f.type || {}).stringValue;
    naifs[t] = (naifs[t] || 0) + 1;
    if ((par.cote || {}).stringValue !== 'client' || date <= passage || (par.uid || {}).stringValue === uidAdmin) continue;
    attendus[t] = (attendus[t] || 0) + 1;
    (projetsDe[t] = projetsDe[t] || new Set()).add((f.projet || {}).stringValue || '');
  }
  const vus = await pa.$$eval('#depuis-passage a[data-passage]', (as) => as.map((a) => ({ type: a.dataset.passage, n: Number((a.textContent.match(/\d+/) || ['0'])[0]), href: a.getAttribute('href') })));
  const parType = Object.fromEntries(vus.map((v) => [v.type, v]));
  verifier((parType.fichier || {}).n === attendus.fichier && attendus.fichier >= 2 && naifs.fichier >= attendus.fichier + 2, 'les fichiers déposés par les clients depuis le passage, ni celui de l équipe, ni celui d avant', `${JSON.stringify(parType.fichier)} / ${attendus.fichier} / ${naifs.fichier}`);
  const versDe = (t, seul, tous) => ((projetsDe[t] || new Set()).size === 1 ? seul([...projetsDe[t]][0]) : tous);
  verifier((parType.fichier || {}).href === versDe('fichier', (p) => `#/fichiers?projet=${p}`, '#/fichiers'), 'le lien des fichiers : le projet s il est seul, sinon tous', (parType.fichier || {}).href);
  verifier((parType.demande || {}).n === attendus.demande && (parType.demande || {}).href === versDe('demande', (p) => `#/projets/${p}/demandes`, '#/demandes'), 'les tickets, vers les tickets du projet ou de tous', JSON.stringify(parType.demande));
  const connus = vus.filter((v) => v.type !== 'autre');
  verifier(connus.every((v) => v.n === attendus[v.type]), 'chaque compte est celui de la base', `${JSON.stringify(vus)} / ${JSON.stringify(attendus)}`);
  verifier(/Depuis mon passage/.test(await texteDe(pa, '#depuis-passage strong')), 'l encart s appelle « Depuis mon passage »');
  await pa.click('#depuis-passage a[data-passage="fichier"]');
  verifier(await attendre(async () => (await hash(pa)) === '#/fichiers?projet=atelier', 5000), 'un clic mène à la page', await hash(pa));
  await aller(pa, '#/', PAVE);
  verifier(Boolean(await pa.$('#depuis-passage')), 'la date gardée vaut pour toute la session : l encart reste après un clic');

  /* ---------------------------------------------------------------- */
  console.log('\n== L aperçu d un projet, côté équipe');
  await aller(pa, '#/projets/atelier', PAVE_PROJET);
  verifier(/En attente du client/.test(await texteDe(pa, `${PAVE_PROJET} .attente-titre`)), '« En attente du client » est un pavé');
  verifier(!(await pa.$(`${PAVE_PROJET} [data-pave-geste="fermer"]`)), 'qui se replie sans se fermer');
  verifier((await pa.$eval(`${PAVE_PROJET} a[data-autres-points]`, (a) => a.getAttribute('href')).catch(() => '')) === '#/projets/atelier/demandes', '« N autres points » mène aux tickets du projet');
  verifier((await pa.$$eval('#onglet-corps .section-tete h2', (hs) => hs.map((h) => h.textContent))).some((t) => /^Le projet en un coup d.œil$/.test(t.trim())), '« Le projet en un coup d œil », pas « Votre projet »');
  const apercu = await texteDe(pa, '#onglet-corps');
  verifier(!/de votre côté|Votre projet en un coup|Nous attendons votre retour/i.test(apercu), 'aucun « de votre côté », « Votre projet » ni « Nous attendons votre retour » dans l aperçu de l équipe', (apercu.match(/.{0,60}(de votre côté|Votre projet en un coup|Nous attendons votre retour).{0,40}/i) || [''])[0]);
  verifier(/Retour du client attendu/.test(apercu), 'les tâches en attente disent « Retour du client attendu »');
  await sonder(pa);
  await pa.click(`${PAVE_PROJET} [data-pave-geste="replier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE_PROJET)) === true && ((await choixPaves(fs, uidAdmin)).projets || {}).atelier === 'replie'), 'replié dans l aperçu, et retenu (profil : projets.atelier)');
  await pause(1200);
  const r2 = await releve(pa);
  verifier(r2.squelette === 0 && r2.dessins <= 1, 'sans remonter la page ni repeindre de squelette', JSON.stringify(r2));
  await aller(pa, '#/projets/atelier/taches', '#onglet-corps');
  await aller(pa, '#/projets/atelier', PAVE_PROJET);
  verifier((await replie(pa, PAVE_PROJET)) === true, 'revenu sur l aperçu : toujours replié');
  await pa.click(`${PAVE_PROJET} [data-pave-geste="deplier"]`);
  verifier(await attendre(async () => (await replie(pa, PAVE_PROJET)) === false && ((await choixPaves(fs, uidAdmin)).projets || {}).atelier === 'ouvert'), 'déplié');
  await pa.click(`${PAVE_PROJET} a[data-autres-points]`);
  verifier(await attendre(async () => (await hash(pa)) === '#/projets/atelier/demandes', 5000), 'et « N autres points » ouvre les tickets d Atelier', await hash(pa));

  console.log('\n== La page d une partie, dans les mots de l équipe');
  await aller(pa, '#/projets/atelier/brique/ios', '.page-partie');
  const partie = await texteDe(pa, '.page-partie');
  verifier(/Côté client/.test(partie) && !/De votre côté/.test(partie), 'le point bloquant est « Côté client », pas « De votre côté »');
  verifier(/Nouveau ticket/.test(partie) && !/Nouvelle demande/.test(partie), '« Nouveau ticket », comme partout');

  /* ---------------------------------------------------------------- */
  console.log('\n== Un agent sans finance');
  const pg = await contexte('agent');
  await connecter(pg, AGENT);
  await aller(pg, '#/', PAVE);
  await pause(4500);
  verifier(!avertissements.some((a) => a.nom === 'agent'), 'sa page n attend plus les pièces : aucun « dessin sans attendre »', JSON.stringify(avertissements.filter((a) => a.nom === 'agent')));
  verifier(!(await pg.$('.page-tete .actions a[href="#/projets/nouveau"]')) && !(await pg.$('.page-tete .actions a[href="#/clients/nouveau"]')), 'ni « + Projet » ni « + Client » sans la permission');
  const chiffresAgent = await pg.$$eval('#vue .metriques a.metrique', (ms) => ms.map((m) => m.dataset.tuile));
  verifier(chiffresAgent.length === 4 && !chiffresAgent.includes('impaye') && !/Impayé|Devis en attente|Paiements récents/.test(await texteDe(pg, '#vue')), 'quatre chiffres, aucun chiffre financier', chiffresAgent.join(','));
  verifier(await attendre(async () => Boolean(await pg.$(PAVE)) && (await nombre(pg, `${PAVE} .attente-tete .badge`)) === (await rougeBoite(pg)) && (await rougeBoite(pg)) > 0), 'son pavé À traiter, au compte de son rail', `${await nombre(pg, `${PAVE} .attente-tete .badge`)} / ${await rougeBoite(pg)}`);
  await pg.click(`${PAVE} [data-pave-geste="replier"]`);
  const uidAgent = await uidDe(AGENT);
  verifier(await attendre(async () => (await replie(pg, PAVE)) === true && (await choixPaves(fs, uidAgent)).accueil === 'replie'), 'il le replie, dans SON profil');
  verifier((await choixPaves(fs, uidAdmin)).accueil === 'ouvert', 'le choix de l administrateur ne bouge pas');

  /* ---------------------------------------------------------------- */
  console.log('\n== Le client garde son pavé');
  const pc = await contexte('cliente');
  await connecter(pc, CLIENTE);
  await aller(pc, '#/', '[data-pave="accueil"]');
  verifier(Boolean(await pc.$('[data-pave="accueil"] [data-pave-geste="fermer"]')) && /En attente de vous/.test(await texteDe(pc, '[data-pave="accueil"] .attente-titre')), 'Camille : « En attente de vous », avec Fermer, comme avant');
  verifier(!(await pc.$('[data-pave="accueil"] .attente-gestes a')), 'sans le « Tout voir » de l équipe');

  verifier(erreurs.length === 0, `aucune erreur de page ${[...new Set(erreurs)].join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((er) => { console.error(er); process.exit(2); });
