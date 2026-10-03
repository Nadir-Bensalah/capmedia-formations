/* ==========================================================================
   CAPMEDIA CLIENT HUB · les axes d'évolution (remplacent les suggestions)

   Ce que prouve cette suite :
   - l'import : à blanc il n'écrit rien, un fichier fautif est refusé en
     entier, --vrai verse les axes en brouillon et l'introduction ; le
     fichier ForgeMe passe la validation ;
   - la conversion des suggestions : à blanc rien, --vrai fait de chaque
     suggestion un axe de sa plateforme (« general » si plusieurs), publié
     si elle l'était, avec son prix (montants/, au responsable seul) et la
     réponse « intéressé » du client ; relancée, elle ne double rien ;
   - le Cockpit : l'équipe voit les blocs par plateforme et les brouillons,
     publie, ordonne, modifie un axe (prix compris), écrit l'introduction,
     et lit la réponse du client sur la ligne ;
   - le Hub, responsable : cocher fait apparaître les trois gestes, chacun
     enregistre (qui, quand) et prévient l'équipe (boîte + activité), « On
     en parle » ouvre une demande, une seule, liée à l'axe ; le compteur
     de la plateforme suit ; décocher retire le choix ; le prix se lit ;
   - le Hub, collaborateur : ni case, ni prix, et la phrase qui dit que le
     responsable coche ;
   - les règles, avec le vrai jeton de chacun (REST) : le client n'écrit
     pas d'axe (403), le collaborateur ne répond pas (403), une autre
     cliente ne lit rien (403) ; puis regles.test.mjs en entier ;
   - aucune erreur de page.

   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
const CAPTURES = process.env.CAPTURES_AXES || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/axes';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const num = (d, n) => Number(champ(d, n).integerValue || champ(d, n).doubleValue || 0);
const S = (v) => ({ stringValue: String(v) }); const I = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } }); const T = (d) => ({ timestampValue: d.toISOString() });
const NUL = { nullValue: null };
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const uidDe = async (email) => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const ouvrirCompte = async (email) => {
  if (await uidDe(email)) return uidDe(email);
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=cle-du-banc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `Banc-${Date.now()}-x`, returnSecureToken: true }) });
  return ((await r.json()) || {}).localId || '';
};
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

const AXES = 'projets/atelier/axes';
const OUTILS = __dirname;
const importer = (args) => spawnSync('node', [join(OUTILS, 'axes-importer.mjs'), ...args], { cwd: OUTILS, env: process.env, encoding: 'utf8' });
const reponse = async (id) => (champ(await lire(`${AXES}/${id}`), 'reponse').mapValue || {}).fields || null;
const choixDe = async (id) => (((await reponse(id)) || {}).choix || {}).stringValue || '';
const notifications = async (uid) => (await docs(`boites/${uid}/notifications?pageSize=300`)).filter((n) => str(n, 'type') === 'axe');
const activitesAxe = async () => (await docs('activite?pageSize=500')).filter((a) => str(a, 'type') === 'axe');

/* Une suggestion d'avant, telle que l'écrivait le Cockpit. */
const suggestion = (o) => ({
  famille: S('developpement'), titre: S(o.titre), resume: S(o.resume || ''), texte: S(o.texte || ''), benefice: S(''),
  plateformes: L((o.plateformes || []).map(S)), duree: S(''), prix: o.prix == null ? NUL : I(o.prix), tva: I(20), devis: S(''),
  statut: S(o.statut || 'proposee'), publication: S(o.publication), ordre: I(o.ordre || 1), aLaUne: B(false),
  reponse: o.reponse || NUL, jalon: S(''), vues: M({}), cree: T(new Date()), maj: T(new Date()),
});
const axeRest = (id, o = {}) => ({ update: { name: nomDoc(`${AXES}/${id}`), fields: {
  plateforme: S('ios'), titre: S(o.titre || 'Axe'), description: S(''), detail: S(''), apport: S(''), ampleur: S(''), etat: S('propose'),
  publication: S('publiee'), publieLe: NUL, ordre: I(9), devis: S(''), reponse: NUL, cree: T(new Date()), maj: T(new Date()),
} }, currentDocument: { exists: false } });
const repondreRest = (id, uid, choix) => ({
  update: { name: nomDoc(`${AXES}/${id}`), fields: { reponse: M({ par: S(uid), nom: S('X'), choix: S(choix), demande: S('') }) } },
  updateMask: { fieldPaths: ['reponse', 'maj'] },
  updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'reponse.le', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: true },
});

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.axes@exemple.test';
  mkdirSync(CAPTURES, { recursive: true });
  await vider(AXES); await vider('projets/atelier/axesIntro'); await vider('projets/atelier/suggestions');
  for (const t of await docs('tickets?pageSize=300')) if (str(t, 'axe')) await fetch(`http://127.0.0.1:8080/v1/${t.name}`, { method: 'DELETE', headers: prop });

  const uidCollab = await ouvrirCompte(COLLAB);
  const uidCamille = await uidDe(CAMILLE);
  const uidAdmin = await uidDe(ADMIN);
  const atelier = await lire('projets/atelier');
  const membres = ((champ(atelier, 'membres').arrayValue || {}).values || []).map((v) => v.stringValue);
  const rolesAvant = (champ(atelier, 'roles').mapValue || {}).fields || {};
  const roles = async (r) => poser('projets/atelier', { membres: L([...new Set([...membres, uidCollab])].map(S)), roles: M(Object.fromEntries(Object.entries(r).map(([u, v]) => [u, S(v)]))) }, ['membres', 'roles']);
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });
  const jC = await jetonPour(CAMILLE); const jCo = await jetonPour(COLLAB); const jL = await jetonPour(LEA);

  console.log('\n== L import : à blanc, fichier fautif, puis --vrai');
  const blanc = importer(['atelier', 'exemples/axes/exemple.json']);
  verifier(blanc.status === 0 && /5 axes valides/.test(blanc.stdout), 'à blanc : le fichier d exemple est lu et validé (5 axes)', blanc.stdout.slice(-200));
  verifier((await docs(`${AXES}?pageSize=50`)).length === 0, 'à blanc : rien n est écrit');
  const fautif = importer(['atelier', 'exemples/axes/invalide.json', '--vrai']);
  verifier(fautif.status === 1 && /tiret cadratin/.test(fautif.stdout) && /plateforme inconnue/.test(fautif.stdout), 'un fichier fautif est refusé en entier, en disant pourquoi', fautif.stdout.slice(-300));
  verifier((await docs(`${AXES}?pageSize=50`)).length === 0, 'et n écrit rien, pas même ses axes justes');
  const forgeme = join(process.env.HOME || '', 'ForgeMe-tests', 'axes-evolution', 'forgeme.json');
  if (existsSync(forgeme)) {
    const f = importer(['forgeme', forgeme]);
    verifier(f.status === 0 && /0 erreur/.test(f.stdout), 'le fichier ForgeMe passe la validation, à blanc', (f.stdout.match(/\d+ axes? valides?.*/) || [''])[0]);
  }
  const vrai = importer(['atelier', 'exemples/axes/exemple.json', '--vrai']);
  verifier(vrai.status === 0, '--vrai sur l émulateur se termine sans erreur', (vrai.stderr || vrai.stdout).slice(-300));
  const verses = await docs(`${AXES}?pageSize=50`);
  verifier(verses.length === 5 && verses.every((d) => str(d, 'publication') === 'brouillon' && str(d, 'etat') === 'propose'), '--vrai verse les 5 axes, en brouillon', `${verses.length}`);
  verifier(str(await lire(`${AXES}/android-widgets`), 'apport') === 'fidelite', 'l apport « fidélité » du fichier est rangé « fidelite »');
  verifier(/pistes/.test(str(await lire('projets/atelier/axesIntro/texte'), 'texte')), 'l introduction est posée');
  const encore = importer(['atelier', 'exemples/axes/exemple.json', '--vrai']);
  verifier(encore.status === 0 && /0 axe créé, 5 mis à jour/.test(encore.stdout) && (await docs(`${AXES}?pageSize=50`)).length === 5, 'relancé, l import met à jour sans doubler', encore.stdout.slice(-160));

  console.log('\n== La conversion des suggestions');
  await poser('projets/atelier/suggestions/s-widgets', suggestion({ titre: 'Des widgets partout', resume: 'Sur iPhone et Android.', plateformes: ['ios', 'android'], prix: 1200, publication: 'publiee', statut: 'a-l-etude', reponse: M({ par: S(uidCamille), nom: S('Camille Martin'), choix: S('interesse'), raison: S(''), demande: S(''), le: T(new Date()) }) }));
  await poser('projets/atelier/suggestions/s-pwa', suggestion({ titre: 'Le web hors connexion', resume: 'Votre service marche dans le métro.', plateformes: ['web'], publication: 'publiee', statut: 'refusee', reponse: M({ par: S(uidCamille), nom: S('Camille Martin'), choix: S('pas-interesse'), raison: S('Plus tard'), demande: S(''), le: T(new Date()) }) }));
  await poser('projets/atelier/suggestions/s-brouillon', suggestion({ titre: 'Une idée en brouillon', publication: 'brouillon' }));
  const cBlanc = importer(['atelier', '--convertir']);
  verifier(cBlanc.status === 0 && /3 suggestions \(2 publiées\) ; 3 à convertir/.test(cBlanc.stdout), 'à blanc : les trois suggestions sont listées', cBlanc.stdout.slice(-240));
  verifier(!(await lire(`${AXES}/sugg-s-widgets`)), 'à blanc : aucun axe n est créé');
  const cVrai = importer(['atelier', '--convertir', '--vrai']);
  verifier(cVrai.status === 0, '--convertir --vrai se termine sans erreur', (cVrai.stderr || cVrai.stdout).slice(-300));
  const sw = await lire(`${AXES}/sugg-s-widgets`);
  verifier(str(sw, 'plateforme') === 'general' && str(sw, 'publication') === 'publiee', 'une suggestion sur deux plateformes devient un axe « Général », publié');
  verifier(await choixDe('sugg-s-widgets') === 'interesse', 'la réponse « intéressé » du client est gardée');
  verifier(num(await lire('projets/atelier/montants/axe-sugg-s-widgets'), 'montant') === 1200, 'son prix part dans montants/ (responsable seul)');
  const pwa = await lire(`${AXES}/sugg-s-pwa`);
  verifier(str(pwa, 'plateforme') === 'web' && str(pwa, 'publication') === 'publiee' && !(await reponse('sugg-s-pwa')), 'une suggestion web devient un axe Web publié ; « pas intéressé » ne coche rien');
  verifier(str((champ(pwa, 'origine').mapValue || {}).fields ? { fields: champ(pwa, 'origine').mapValue.fields } : null, 'raison') === 'Plus tard', 'et la raison donnée reste dans l origine de l axe');
  verifier(str(await lire(`${AXES}/sugg-s-brouillon`), 'publication') === 'brouillon', 'un brouillon reste un brouillon');
  verifier(Boolean(await lire('projets/atelier/suggestions/s-widgets')), 'les suggestions restent en base, intactes');
  const cDeux = importer(['atelier', '--convertir', '--vrai']);
  verifier(/0 à convertir/.test(cDeux.stdout) && (await docs(`${AXES}?pageSize=50`)).length === 8, 'relancée, la conversion ne double rien', cDeux.stdout.slice(-120));

  console.log('\n== Les règles, avec le vrai jeton de chacun');
  verifier(await statutCommit(jC, [axeRest('a-cliente')]) === 403, 'la cliente responsable n écrit pas d axe (403)');
  verifier(await statutCommit(jC, [{ update: { name: nomDoc(`${AXES}/sugg-s-pwa`), fields: { titre: S('Retouché') } }, updateMask: { fieldPaths: ['titre'] }, currentDocument: { exists: true } }]) === 403, 'ni ne retouche un titre (403)');
  verifier(await statutLecture(`${AXES}/ios-widgets`, jC) === 403, 'un brouillon ne se lit pas côté client (403)');
  verifier(await statutLecture(`${AXES}/sugg-s-pwa`, jL) === 403, 'une cliente d un autre projet ne lit rien (403)');
  verifier(await statutCommit(jCo, [repondreRest('sugg-s-pwa', uidCollab, 'interesse')]) === 403, 'le collaborateur ne répond pas quand le projet a un responsable (403)');
  verifier(await statutCommit(jC, [repondreRest('sugg-s-pwa', uidCamille, 'a-prevoir')]) === 200, 'la responsable répond par REST, datée par le serveur');
  await poser(`${AXES}/sugg-s-pwa`, { reponse: NUL }, ['reponse']);

  const nav = await chromium.launch();
  const erreurs = [];
  console.log('\n== L équipe, dans le Cockpit');
  const ctxEquipe = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctxEquipe.addInitScript(() => { try { localStorage.setItem('suivi:cockpit-theme', 'dark'); } catch (e) { /* rien */ } });
  const equipe = await ctxEquipe.newPage();
  page = equipe;
  equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  await connecter(equipe, ADMIN);
  await aller(equipe, '#/projets/atelier/evolutions');
  await equipe.waitForSelector('[data-axes-plateforme]', { timeout: 20000 }).catch(() => {});
  const blocs = await equipe.$$eval('[data-axes-plateforme]', (els) => els.map((e) => e.dataset.axesPlateforme));
  verifier(['ios', 'android', 'web', 'admin', 'backend', 'general'].every((p) => blocs.includes(p)), 'un bloc par plateforme du projet, plus « Général »', blocs.join(', '));
  verifier((await equipe.$$('.axe--equipe')).length === 8, 'l équipe voit les huit axes, brouillons compris');
  verifier(/brouillon/.test(await equipe.textContent('[data-axes-plateforme="ios"] [data-axes-compteur]')), 'le compteur de l équipe compte les brouillons');
  await equipe.click('[data-axe-action="publier"][data-id="ios-widgets"]');
  verifier(await attendre(async () => str(await lire(`${AXES}/ios-widgets`), 'publication') === 'publiee'), '« Publier » publie l axe');
  for (const id of ['ios-raccourcis', 'android-widgets', 'web-notifications', 'web-installable']) await poser(`${AXES}/${id}`, { publication: S('publiee') }, ['publication']);
  await pause(1200);
  await equipe.click('[data-axe-action="descendre"][data-id="ios-widgets"]');
  verifier(await attendre(async () => num(await lire(`${AXES}/ios-widgets`), 'ordre') > num(await lire(`${AXES}/ios-raccourcis`), 'ordre')), '« Descendre » passe l axe après son voisin');
  await pause(1000);
  await equipe.click('[data-axe-action="editer"][data-id="web-notifications"]');
  await equipe.waitForSelector('#ed-forme #ed-titre', { timeout: 8000 });
  verifier(/Notifications web/.test(await equipe.inputValue('#ed-titre')), 'le crayon ouvre l éditeur, rempli');
  await equipe.fill('#ed-description', 'Prévenir vos utilisateurs dans leur navigateur, même quand l onglet est fermé.');
  const prixChamp = await equipe.$('#ed-prix');
  if (prixChamp) await equipe.fill('#ed-prix', '900');
  await equipe.click('.voile button[type="submit"]');
  verifier(await attendre(async () => /onglet est fermé/.test(str(await lire(`${AXES}/web-notifications`), 'description'))), 'l éditeur enregistre la phrase du client');
  verifier(Boolean(prixChamp) && await attendre(async () => num(await lire('projets/atelier/montants/axe-web-notifications'), 'montant') === 900), 'et le prix, dans montants/');
  await pause(800);
  await equipe.click('[data-axe-action="intro"]');
  await equipe.waitForSelector('#ed-texte', { timeout: 8000 });
  await equipe.fill('#ed-texte', 'Nos pistes pour faire grandir Atelier. Cochez ce qui vous parle.');
  await equipe.click('.voile button[type="submit"]');
  verifier(await attendre(async () => /grandir Atelier/.test(str(await lire('projets/atelier/axesIntro/texte'), 'texte'))), 'l introduction se modifie depuis le Cockpit');

  console.log('\n== La responsable, dans le Hub');
  const ctxClient = await nav.newContext({ viewport: { width: 1280, height: 1100 } });
  await ctxClient.addInitScript(() => { try { localStorage.setItem('suivi:hub-theme', 'light'); } catch (e) { /* rien */ } });
  page = await ctxClient.newPage();
  page.on('pageerror', (e) => erreurs.push(`hub: ${e.message.slice(0, 160)}`));
  await connecter(page, CAMILLE);
  await aller(page, '#/projets/atelier/suggestions');
  verifier(await attendre(async () => /\/evolutions$/.test(page.url())), 'l ancienne adresse des suggestions mène aux axes');
  await page.waitForSelector('[data-axes-plateforme]', { timeout: 20000 }).catch(() => {});
  verifier(/grandir Atelier/.test(await page.textContent('[data-axes-intro]')), 'l introduction écrite dans le Cockpit s affiche');
  const lignes = await page.$$eval('.axe[data-axe]', (els) => els.map((e) => e.dataset.axe));
  verifier(lignes.length === 7 && !lignes.includes('sugg-s-brouillon'), 'la cliente voit les sept axes publiés, pas le brouillon', lignes.join(', '));
  verifier(!(await page.isVisible('.axe[data-axe="ios-raccourcis"] .axe-gestes')), 'avant de cocher, aucun geste n est visible');
  await page.check('[data-axe-case="ios-raccourcis"]');
  await pause(300);
  const gestes = await page.$$eval('.axe[data-axe="ios-raccourcis"] [data-axe-geste]', (els) => els.filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  verifier(gestes.length === 3, 'cocher fait apparaître les trois gestes', gestes.join(' | '));
  const notifAvant = (await notifications(uidAdmin)).length;
  await page.click('[data-axe-geste="interesse"][data-id="ios-raccourcis"]');
  verifier(await attendre(async () => await choixDe('ios-raccourcis') === 'interesse'), '« Ça m intéresse » enregistre le choix');
  const r1 = await reponse('ios-raccourcis');
  verifier(r1 && (r1.par || {}).stringValue === uidCamille && Boolean((r1.le || {}).timestampValue), 'à son nom, daté par le serveur');
  verifier(await attendre(async () => (await notifications(uidAdmin)).length > notifAvant, 30000), 'et prévient l équipe dans sa boîte');
  verifier(await attendre(async () => (await activitesAxe()).some((a) => /raccourcis siri/i.test(str(a, 'texte'))), 20000), 'et reste dans l activité du projet');
  await pause(800);
  const n2 = (await notifications(uidAdmin)).length;
  await page.click('[data-axe-geste="a-prevoir"][data-id="ios-raccourcis"]');
  verifier(await attendre(async () => await choixDe('ios-raccourcis') === 'a-prevoir'), '« À prévoir » remplace le choix');
  verifier(await attendre(async () => (await notifications(uidAdmin)).length > n2, 30000), 'et prévient l équipe à son tour');
  verifier(await attendre(async () => /1 sur 2/.test(await page.textContent('[data-axes-plateforme="ios"] [data-axes-compteur]'))), 'le compteur de la plateforme suit : 1 sur 2');
  await page.check('[data-axe-case="web-installable"]');
  await pause(300);
  const n3 = (await notifications(uidAdmin)).length;
  await page.click('[data-axe-geste="en-parler"][data-id="web-installable"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  const demandes = async () => (await docs('tickets?pageSize=300')).filter((t) => str(t, 'axe') === 'web-installable');
  verifier(await attendre(async () => (await demandes()).length === 1 && await choixDe('web-installable') === 'en-parler'), '« On en parle » ouvre une demande liée à l axe');
  const r3 = await reponse('web-installable');
  const tickets3 = await demandes();
  verifier(r3 && tickets3[0] && (r3.demande || {}).stringValue === tickets3[0].name.split('/').pop(), 'la réponse pointe la demande');
  verifier(await attendre(async () => (await notifications(uidAdmin)).length > n3, 30000), 'et l équipe est prévenue');
  /* La réponse effacée, un second « On en parle » reprend la demande ouverte. */
  await poser(`${AXES}/web-installable`, { reponse: NUL }, ['reponse']);
  await pause(1500);
  await page.check('[data-axe-case="web-installable"]').catch(() => {});
  await pause(300);
  await page.click('[data-axe-geste="en-parler"][data-id="web-installable"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  await attendre(async () => await choixDe('web-installable') === 'en-parler');
  await pause(1200);
  verifier((await demandes()).length === 1, 'un second « On en parle » n ouvre pas une seconde demande');
  verifier(await attendre(async () => /\d/.test((await page.textContent('.axe[data-axe="web-installable"] [data-axe-fait]')) || '')), 'la ligne redit le choix et sa date');
  const prixVus = await page.$$eval('[data-axe-prix]', (els) => els.map((e) => e.textContent));
  verifier(prixVus.length === 2 && prixVus.some((p) => /900/.test(p)) && prixVus.some((p) => /1\s?200/.test(p)), 'la responsable voit les prix', prixVus.join(' | '));
  verifier(await page.isChecked('[data-axe-case="sugg-s-widgets"]'), 'la suggestion convertie arrive cochée « intéressé »');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(CAPTURES, 'axes-client-clair.png'), fullPage: true });
  /* Décocher retire le choix. */
  await page.uncheck('[data-axe-case="sugg-s-widgets"]').catch(() => page.click('[data-axe-case="sugg-s-widgets"]'));
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  verifier(await attendre(async () => !(await reponse('sugg-s-widgets'))), 'décocher, puis confirmer, retire le choix');

  console.log('\n== L équipe lit la réponse sur la ligne');
  await equipe.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  await aller(equipe, '#/projets/atelier/evolutions');
  await equipe.waitForSelector('[data-axes-plateforme]', { timeout: 20000 }).catch(() => {});
  const ligneEq = await attendre(async () => { const t = await equipe.textContent('.axe[data-axe="ios-raccourcis"] [data-axe-reponse]'); return /à prévoir/.test(t) ? t : null; });
  verifier(Boolean(ligneEq), 'la ligne de l axe dit qui a répondu et quoi', ligneEq || '');
  verifier(/réponse/.test(await equipe.textContent('[data-axes-plateforme="ios"] [data-axes-compteur]')), 'le compteur de l équipe compte les réponses');
  await equipe.evaluate(() => window.scrollTo(0, 0));
  await equipe.screenshot({ path: join(CAPTURES, 'axes-cockpit-sombre.png'), fullPage: true });

  console.log('\n== Un collaborateur, dans le Hub : ni case, ni prix');
  await roles({ [uidCamille]: 'collaborateur', [uidCollab]: 'responsable' });
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  await aller(page, '#/projets/atelier/evolutions');
  await page.waitForSelector('[data-axes-plateforme]', { timeout: 20000 }).catch(() => {});
  await pause(1000);
  const texte = await page.textContent('.page-axes');
  verifier((await page.$$('.axe[data-axe]')).length === 7, 'le collaborateur lit les sept axes publiés');
  verifier((await page.$$('[data-axe-case]')).length === 0 && (await page.$$('[data-axe-geste]')).length === 0, 'mais sans case ni geste');
  verifier((await page.$$('[data-axe-prix]')).length === 0 && !/€/.test(texte), 'et sans aucun prix', texte.slice(0, 160));
  verifier(Boolean(await page.$('[data-axes-reserve]')), 'la page lui dit que le responsable coche');
  verifier(!/undefined|null|NaN/.test(texte), 'aucun « undefined », « null » ni « NaN » à l écran');
  verifier(!texte.includes('—'), 'aucun tiret cadratin à l écran');

  console.log('\n== Le filtre de plateforme, les couleurs et le temps estimé (03/10)');
  verifier(Boolean(await page.$('.axes-filtre [data-axe-filtre=""][aria-pressed="true"]')), 'le filtre est sur « Tout » par défaut');
  const blocsTout = (await page.$$('[data-axes-plateforme]')).length;
  await page.click('.axes-filtre [data-axe-filtre="ios"]'); await pause(500);
  const blocsIos = await page.$$eval('[data-axes-plateforme]', (l) => l.map((x) => x.dataset.axesPlateforme));
  verifier(blocsTout > 1 && blocsIos.length === 1 && blocsIos[0] === 'ios', `« iPhone » ne garde que l iPhone (${blocsTout} puis ${blocsIos.join(',')})`);
  await page.click('.axes-filtre [data-axe-filtre=""]'); await pause(500);
  verifier((await page.$$('[data-axes-plateforme]')).length === blocsTout, 'et « Tout » les remontre toutes');
  verifier(/≈\s*3 jours/.test(await page.textContent('[data-axe="ios-widgets"] [data-axe-jours]').catch(() => '')), 'le temps estimé se lit « ≈ 3 jours »');
  verifier(Boolean(await page.$('[data-axe="ios-widgets"] .axe-apport.axe-apport--bleu')) && Boolean(await page.$('.axe-ampleur--moyen')), 'l apport et l ampleur ont leur couleur douce');

  await poser('projets/atelier', { roles: M(rolesAvant), membres: L(membres.map(S)) }, ['roles', 'membres']);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();

  console.log('\n== regles.test.mjs, en entier');
  let sortie = '';
  try { sortie = execFileSync('node', [join(OUTILS, 'regles.test.mjs')], { cwd: OUTILS, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { sortie = `${e.stdout || ''}${e.stderr || ''}`; }
  const bilanRegles = (sortie.match(/\d+ contrôle\(s\) conforme\(s\).*/) || [''])[0];
  const axesRegles = (sortie.split('== Les axes d évolution')[1] || '').split('\n').filter((l) => /^\s+(ok|ÉCART)/.test(l));
  verifier(!/ÉCART/.test(sortie) && /conforme/.test(sortie), `regles.test.mjs : ${bilanRegles}`, sortie.split('\n').filter((l) => /ÉCART/.test(l)).slice(0, 5).join(' | '));
  verifier(axesRegles.length >= 30 && axesRegles.every((l) => /ok/.test(l)), `dont ${axesRegles.length} essais sur les axes`);

  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: join(CAPTURES, 'qa-axes-echec.png') }); } catch (err) { /* rien */ } }
  process.exit(2);
});
