/* ==========================================================================
   CAPMEDIA CLIENT HUB · Sentry dans le Cockpit et dans le Hub

   Un faux serveur Sentry (lib/faux-sentry.cjs, réponses enregistrées au
   format de la vraie API) tourne à côté des émulateurs. Ce que prouve
   cette suite :
   - relier un projet : l'administrateur seul (un agent du projet, un
     client : refusés) ; le premier relevé coûte six appels, les suivants
     cinq, tous avec le jeton, jamais depuis le navigateur ;
   - le relevé : erreurs du jour par application (Web, iPhone, Android),
     sessions sans plantage par application et par version, erreurs
     ouvertes épurées (ni adresse, ni adresse IP, ni recherche dans les
     liens) ; « Actualiser » deux fois dans la minute n'appelle pas Sentry ;
     une étape en panne garde la valeur d'avant et le dit ;
   - la vue du client : un taux et une tendance par plateforme, rien de
     technique ; lisible par Camille, illisible par Léa, jamais écrite
     depuis un navigateur ;
   - le webhook : sans signature, fausse ou d'un autre corps, refusé ; une
     nouvelle erreur écrit une alerte et sonne la cloche de l'équipe (pas
     celle du client), une fois par six heures ; un pic aussi ; rien de
     l'utilisateur de l'événement n'est gardé ; un projet non relié et une
     assignation sont ignorés ; un relevé suit l'alerte si le dernier est
     ancien ;
   - « Créer un ticket » : un agent d'un autre projet est refusé ; le
     ticket porte le titre et le texte en clair, rien de Sentry ; la note
     interne porte le lien, les occurrences, les versions et les
     plateformes ; Camille ne la lit pas ; deux fois la même erreur : 409 ;
   - le Cockpit (navigateur) : l'onglet Stabilité, les chiffres, le
     tableau des versions, l'alerte qui arrive en direct, « Créer un
     ticket » de bout en bout ;
   - le Hub (navigateur) : l'entrée Stabilité qui apparaît au premier
     relevé, les deux taux, les tendances, les erreurs en cours de
     correction (titres écrits pour le client), qui partent quand le
     ticket est résolu ; aucun mot technique, rien qui déborde à 390 px ;
   - aucune erreur de page, ni « undefined », ni tiret cadratin.

   QA_SENTRY_PARTIE=serveur : sans les navigateurs (banc de mutations).
   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const crypto = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin, jetonPour } = require('./lib/session-banc.cjs');
const fauxSentry = require('./lib/faux-sentry.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const CAPTURES = process.env.CAPTURES_SENTRY || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/sentry';
const PARTIE = process.env.QA_SENTRY_PARTIE || 'tout';
const PORT_FAUX = 9877 + BANC.decalage;
const SECRET = 'banc-sentry-secret';
const WEBHOOK = `${BANC.fonctions}/${PROJET}/europe-west1/sentryWebhook`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) }); const T = (d) => ({ timestampValue: d.toISOString() });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const idDe = (d) => (d && d.name ? d.name.split('/').pop() : '');
/* Une valeur REST de Firestore, en JavaScript. */
const js = (v) => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(js);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, js(x)]));
  return v;
};
const objet = (d) => (d && d.fields ? Object.fromEntries(Object.entries(d.fields).map(([k, x]) => [k, js(x)])) : null);
const lireObjet = async (c) => objet(await lire(c));
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const creerCompte = async (email) => {
  const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=cle-du-banc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `banc-${Date.now()}`, returnSecureToken: true }) });
  const j = await r.json().catch(() => ({}));
  return j.localId || uidDe(email);
};
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })).status;
const statutEcriture = async (chemin, jeton, fields) => (await fetch(bdd(chemin), { method: 'PATCH', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })).status;
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };
const sansDefaut = (texte, ou) => {
  verifier(!/undefined|\bnull\b|NaN|\[object/.test(texte), `${ou} : aucun « undefined », « null » ni « NaN »`, (texte.match(/.{0,40}(undefined|null|NaN|\[object).{0,40}/) || [''])[0]);
  verifier(!texte.includes('\u2014'), `${ou} : aucun tiret cadratin`);
};
const envoyer = async (ressource, corps, { signature, brutAutre } = {}) => {
  const brut = JSON.stringify(corps);
  const signe = brutAutre !== undefined ? brutAutre : brut;
  const sig = signature !== undefined ? signature : crypto.createHmac('sha256', SECRET).update(signe).digest('hex');
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Sentry-Hook-Resource': ressource, 'Sentry-Hook-Timestamp': String(Math.floor(Date.now() / 1000)), 'Request-ID': crypto.randomUUID(), ...(sig ? { 'Sentry-Hook-Signature': sig } : {}) },
    body: brut,
  });
  return { code: r.status, texte: await r.text() };
};
const ISSUE_WEB = { id: '6002', shortId: 'FORGEME-WEB-3', title: 'Error: Échec de la connexion pour jean.dupont@exemple.fr', level: 'error', project: { id: '4512197441683536', slug: 'forgeme-web', name: 'forgeme-web' }, web_url: 'https://forgeme.sentry.io/issues/6002/?query=user.email%3Ajean' };
const alertes = async () => (await docs('sentry/atelier/alertes?pageSize=100')).map(objet);
const cloches = async (uid) => (await docs(`boites/${uid}/notifications?pageSize=300`)).map(objet).filter((n) => n.type === 'sentry');
const vieillirReleve = () => poser('sentry/atelier', { releve: M({ le: T(new Date(Date.now() - 3600e3)), ok: B(true) }) }, ['releve.le']);

const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=200')).filter((d) => (d.fields.modele || {}).stringValue === 'code' && (((d.fields.a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const aller = async (page, hash, attendu) => { await page.evaluate((h) => { location.hash = h; }, hash); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(1200); };
const texteDe = async (page, sel = '#vue') => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/ | /g, ' ');
const erreursPage = [];

(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  const faux = await fauxSentry.demarrer({ port: PORT_FAUX });
  const appelsDepuis = (n) => faux.appels.slice(n);
  for (const c of ['sentryLiaisons', 'sentry', 'projets/atelier/stabilite']) await vider(c);
  const alex = await uidDe('agent.essai@exemple.test');
  const camilleUid = await uidDe('camille.essai@exemple.test');
  /* Deux agents : Sam sur Atelier, Ali sur Boutique seulement. */
  const sam = await creerCompte('sam.sentry@exemple.test');
  const ali = await creerCompte('ali.sentry@exemple.test');
  await poser(`equipe/${sam}`, { nom: S('Sam Agent'), email: S('sam.sentry@exemple.test'), role: S('agent'), actif: B(true), projets: L([S('atelier')]), permissions: L([]) });
  await poser(`equipe/${ali}`, { nom: S('Ali Agent'), email: S('ali.sentry@exemple.test'), role: S('agent'), actif: B(true), projets: L([S('boutique')]), permissions: L([]) });
  await poser(`profils/${camilleUid}`, { accueil: T(new Date()) }, ['accueil']);
  const jC = await jetonPour('camille.essai@exemple.test');
  const jL = await jetonPour('lea.essai@exemple.test');

  /* Camille a son Hub ouvert avant que le projet soit relié : l'entrée
     Stabilité doit apparaître d'elle-même au premier relevé. */
  let nav = null; let pc = null; let pe = null;
  if (PARTIE !== 'serveur') {
    nav = await chromium.launch();
    const ctxC = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    pc = await ctxC.newPage(); pc.on('pageerror', (e) => erreursPage.push(`hub: ${e.message.slice(0, 160)}`));
    await connecter(pc, 'camille.essai@exemple.test');
    await aller(pc, '#/projets/atelier', '#lat-corps');
    verifier(!(await pc.$('#lat-corps [data-chemin="/projets/atelier/stabilite"]')), 'Hub : pas d entrée Stabilité avant le premier relevé');
  }

  console.log('\n== Relier le projet : l administrateur seul');
  const lierCorps = { projet: 'atelier', org: 'forgeme', web: 'forgeme-web', mobile: 'forgeme-mobile', hote: faux.url };
  const parCamille = await appelAdmin('sentryLier', lierCorps, { email: 'camille.essai@exemple.test' });
  verifier(parCamille.code === 403, 'une cliente ne relie pas le projet (403)', `${parCamille.code} ${parCamille.texte}`);
  const parSam = await appelAdmin('sentryLier', lierCorps, { email: 'sam.sentry@exemple.test' });
  verifier(parSam.code === 403, 'un agent du projet non plus : c est un geste d administrateur (403)', `${parSam.code} ${parSam.texte}`);
  verifier((await lire('sentryLiaisons/atelier')) === null, 'rien n est écrit après ces refus');
  const mauvais = await appelAdmin('sentryLier', { ...lierCorps, org: 'Forge Me!' });
  verifier(mauvais.code === 400, 'une organisation mal formée est refusée (400)', mauvais.code);
  const avantLier = faux.appels.length;
  const lie = await appelAdmin('sentryLier', lierCorps);
  verifier(lie.code === 200 && lie.json && lie.json.actif === true && lie.json.releve && lie.json.releve.ok === true, 'l administrateur relie Atelier, le premier relevé est complet', `${lie.code} ${lie.texte}`);
  const premiers = appelsDepuis(avantLier);
  verifier(premiers.length === 6, 'le premier relevé coûte six appels (la liste des projets en plus)', premiers.map((a) => a.etape).join(','));
  verifier(premiers.every((a) => a.autorise), 'chaque appel porte le jeton du serveur');
  const liaison = await lireObjet('sentryLiaisons/atelier');
  verifier(liaison && liaison.ids && liaison.ids.web === '4512197441683536' && liaison.ids.mobile === '4512197449351248', 'la liaison garde les identifiants des deux projets Sentry');

  console.log('\n== Le relevé, pour l équipe');
  const s = await lireObjet('sentry/atelier');
  const j = (s && s.jour) || {};
  verifier(j.web && j.web.erreurs === 31 && j.web.problemes === 2, 'erreurs du jour, Web : 31, dont 2 distinctes', JSON.stringify(j.web));
  verifier(j.ios && j.ios.erreurs === 44 && j.ios.problemes === 2 && j.android && j.android.erreurs === 23, 'iPhone : 44, Android : 23', JSON.stringify({ ios: j.ios, android: j.android }));
  verifier(s.stabilite && s.stabilite.web && s.stabilite.web.taux === 99.7 && s.stabilite.web.tendance === 'mieux' && s.stabilite.mobile.taux === 98.4 && s.stabilite.mobile.tendance === 'moins', 'sessions sans plantage : Web 99,7 % en progrès, mobile 98,4 % en recul');
  verifier((s.versions || []).length === 4 && (s.versions || []).some((v) => v.libelle === '1.1.3 (24)' && v.sansPlantage === 98.4 && v.sessions === 812), 'quatre versions, dont 1.1.3 (24) à 98,4 % sur 812 sessions');
  const p6002 = (s.problemes || []).find((p) => p.id === '6002') || {};
  verifier((s.problemes || []).length === 4 && p6002.app === 'web' && p6002.etat === 'nouvelle', 'quatre erreurs ouvertes, la 6002 est nouvelle, sur le web');
  const brutEquipe = JSON.stringify(s.problemes || []);
  verifier(!/@|192\.168|\?query/.test(brutEquipe), 'aucune adresse, aucune adresse IP, aucune recherche dans les liens', (brutEquipe.match(/.{0,40}(@|192\.168|\?query).{0,40}/) || [''])[0]);

  console.log('\n== La vue du client');
  const resume = await lireObjet('projets/atelier/stabilite/resume');
  verifier(resume && resume.apps.length === 2 && resume.apps[0].taux === 99.7 && resume.apps[0].tendance === 'mieux' && resume.apps[1].taux === 98.4 && resume.apps[1].tauxAvant === 99, 'deux plateformes : 99,7 % (en progrès), 98,4 % (en recul, 99 % avant)', JSON.stringify(resume && resume.apps));
  verifier(!/sentry|FORGEME|version|serie|http|@|TypeError|probleme/i.test(JSON.stringify(resume)), 'rien de technique dans la vue du client', JSON.stringify(resume).slice(0, 240));
  verifier(await statutLecture('projets/atelier/stabilite/resume', jC) === 200, 'Camille lit la vue de son projet, avec son vrai jeton');
  verifier(await statutLecture('sentry/atelier', jC) === 403, 'mais pas le détail de l équipe (403)');
  verifier(await statutLecture('projets/atelier/stabilite/resume', jL) === 403, 'Léa ne lit pas la vue d un projet qui n est pas le sien (403)');
  verifier(await statutEcriture('projets/atelier/stabilite/resume', jC, { apps: L([]) }) === 403, 'Camille n écrit pas la vue (403)');

  console.log('\n== Actualiser, le débit, une panne');
  const parAli = await appelAdmin('sentryActualiser', { projet: 'atelier' }, { email: 'ali.sentry@exemple.test' });
  verifier(parAli.code === 403, 'un agent d un autre projet n actualise pas (403)', parAli.code);
  const avantDeja = faux.appels.length;
  const deja = await appelAdmin('sentryActualiser', { projet: 'atelier' }, { email: 'sam.sentry@exemple.test' });
  verifier(deja.code === 200 && deja.json && deja.json.deja === true && faux.appels.length === avantDeja, 'deux relevés dans la minute : le second n appelle pas Sentry', `${deja.texte} · ${faux.appels.length - avantDeja} appel(s)`);
  await vieillirReleve();
  faux.pannes.add('sessions');
  const avantPanne = faux.appels.length;
  const panne = await appelAdmin('sentryActualiser', { projet: 'atelier' }, { email: 'sam.sentry@exemple.test' });
  verifier(panne.code === 200 && panne.json && panne.json.ok === false && faux.appels.length - avantPanne === 5, 'un relevé ordinaire coûte cinq appels ; les sessions refusées, il le dit', `${panne.texte} · ${faux.appels.length - avantPanne}`);
  const apresPanne = await lireObjet('sentry/atelier');
  verifier(apresPanne.releve.ok === false && apresPanne.releve.erreurs.some((e) => e.etape === 'sessions' && e.code === 403) && apresPanne.stabilite.web.taux === 99.7, 'la panne est notée (sessions, 403), la stabilité d avant reste');
  faux.pannes.clear();

  console.log('\n== Le webhook : la signature');
  const corpsNouvelle = { action: 'created', installation: { uuid: 'banc' }, data: { issue: ISSUE_WEB }, actor: { type: 'application' } };
  const sansSig = await envoyer('issue', corpsNouvelle, { signature: '' });
  verifier(sansSig.code === 401, 'sans signature : refusé (401)', sansSig.code);
  const fausse = await envoyer('issue', corpsNouvelle, { signature: 'ab'.repeat(32) });
  verifier(fausse.code === 401, 'signature fausse : refusé (401)', fausse.code);
  const autre = await envoyer('issue', corpsNouvelle, { brutAutre: JSON.stringify({ action: 'resolved' }) });
  verifier(autre.code === 401, 'signature d un autre corps : refusé (401)', autre.code);
  verifier((await alertes()).length === 0, 'aucune alerte écrite par un envoi refusé');
  const get = await fetch(WEBHOOK);
  verifier(get.status === 405, 'GET : refusé (405)');

  console.log('\n== Le webhook : les alertes');
  const n1 = await envoyer('issue', corpsNouvelle);
  verifier(n1.code === 200, 'une nouvelle erreur signée est acceptée', `${n1.code} ${n1.texte}`);
  const a1 = await attendre(async () => (await alertes()).find((a) => a.type === 'nouvelle'));
  verifier(a1 && a1.titre === 'Nouvelle erreur' && a1.app === 'web' && a1.issue === '6002' && !/@/.test(a1.texte) && a1.lien === 'https://forgeme.sentry.io/issues/6002/', 'l alerte est écrite : nouvelle, web, titre épuré, lien sans la recherche', JSON.stringify(a1));
  const c1 = await attendre(async () => { const c = await cloches(alex); return c.length ? c : null; });
  verifier(c1 && c1.length === 1 && /Nouvelle erreur · Web/.test(c1[0].titre) && c1[0].lien === '#/projets/atelier/stabilite', 'la cloche d Alex sonne, avec le lien vers la page', JSON.stringify(c1 && c1[0]));
  verifier((await cloches(camilleUid)).length === 0, 'la cloche de Camille, cliente, ne sonne pas');
  verifier((await cloches(ali)).length === 0, 'ni celle d un agent d un autre projet');
  const n2 = await envoyer('issue', corpsNouvelle);
  await pause(1500);
  verifier(n2.code === 200 && (await alertes()).filter((a) => a.type === 'nouvelle').length === 2 && (await cloches(alex)).length === 1, 'le même envoi rejoué : l alerte est notée, la cloche ne sonne pas deux fois (six heures)');
  const evenement = { event_id: 'abc', issue_id: '6001', title: 'TypeError: Cannot read property id of undefined', level: 'error', project: 4512197449351248, web_url: 'https://forgeme.sentry.io/issues/6001/events/abc/', user: { email: 'client.final@exemple.fr', ip_address: '10.1.2.3', username: 'clientfinal' }, contexts: { os: { name: 'iOS', version: '18.0' } }, tags: [['user.email', 'client.final@exemple.fr']] };
  const pic = await envoyer('event_alert', { action: 'triggered', data: { event: evenement, triggered_rule: "Pic d'erreurs mobile" } });
  const a2 = await attendre(async () => (await alertes()).find((a) => a.type === 'pic'));
  verifier(pic.code === 200 && a2 && a2.app === 'ios' && a2.titre === "Pic d'erreurs", 'un pic (règle d alerte) : alerte « Pic d erreurs » sur iPhone', JSON.stringify(a2));
  verifier(!/client\.final|10\.1\.2\.3|clientfinal/.test(JSON.stringify(await alertes())), 'rien de l utilisateur de l événement n est gardé');
  verifier(await attendre(async () => (await cloches(alex)).length === 2), 'le pic sonne aussi la cloche');
  const avantIgnore = (await alertes()).length;
  const assigne = await envoyer('issue', { action: 'assigned', data: { issue: ISSUE_WEB } });
  const ailleurs = await envoyer('issue', { action: 'created', data: { issue: { ...ISSUE_WEB, id: '7001', project: { id: '1', slug: 'autre-projet' } } } });
  await pause(1500);
  verifier(assigne.code === 200 && ailleurs.code === 200 && (await alertes()).length === avantIgnore, 'une assignation, un projet Sentry non relié : ignorés');
  await vieillirReleve();
  const avantAuto = faux.appels.length;
  await envoyer('issue', { action: 'unresolved', data: { issue: { ...ISSUE_WEB, id: '6003', shortId: 'FORGEME-MOBILE-4', title: 'Network request failed', project: { id: '4512197449351248', slug: 'forgeme-mobile' } } }, actor: { type: 'application' } });
  verifier(await attendre(async () => (await alertes()).some((a) => a.type === 'regression')), 'une erreur revenue : alerte « Erreur revenue »');
  verifier(await attendre(async () => (await cloches(alex)).length === 3), 'elle sonne la cloche (une autre erreur, un autre type)');
  verifier(await attendre(async () => faux.appels.length - avantAuto === 5, 10000), 'un relevé suit l alerte quand le dernier est ancien', faux.appels.length - avantAuto);

  console.log('\n== Créer un ticket');
  const corpsTicket = { projet: 'atelier', issue: '6001', titre: 'L écran Tâches se ferme parfois à l ouverture (jean.dupont@exemple.fr)', description: 'Nous avons repéré une erreur sur l application mobile et nous la corrigeons.\n\nRien à faire de votre côté.', urgence: 'critique' };
  const tAli = await appelAdmin('sentryVersTicket', corpsTicket, { email: 'ali.sentry@exemple.test' });
  verifier(tAli.code === 403, 'un agent d un autre projet ne crée pas de ticket (403)', tAli.code);
  const tCam = await appelAdmin('sentryVersTicket', corpsTicket, { email: 'camille.essai@exemple.test' });
  verifier(tCam.code === 403, 'une cliente non plus (403)', tCam.code);
  const tInconnu = await appelAdmin('sentryVersTicket', { ...corpsTicket, issue: '9999' }, { email: 'sam.sentry@exemple.test' });
  verifier(tInconnu.code === 404, 'une erreur que Sentry ne connaît pas : 404', tInconnu.code);
  const t = await appelAdmin('sentryVersTicket', corpsTicket, { email: 'sam.sentry@exemple.test' });
  verifier(t.code === 200 && t.json && t.json.id, 'Sam, agent du projet, fait de l erreur 6001 un ticket', `${t.code} ${t.texte}`);
  const tid = t.json ? t.json.id : '';
  const ticket = await attendre(async () => lireObjet(`tickets/${tid}`));
  /* Le numéro vient du déclencheur, derrière la file du semis : patience. */
  verifier(Boolean(await attendre(async () => { const x = await lireObjet(`tickets/${tid}`); return x && /^ATELIER-\d+$/.test(x.numero || ''); }, 90000)), 'le ticket reçoit son numéro (ATELIER-…)');
  verifier(ticket && ticket.projet === 'atelier' && ticket.type === 'bug' && ticket.statut === 'en-cours' && ticket.urgence === 'critique' && ticket.version === '1.1.3 (24)' && ticket.plateforme === '', 'le ticket : bug, en cours, critique, version 1.1.3 (24), deux plateformes', JSON.stringify(ticket && { s: ticket.statut, v: ticket.version, p: ticket.plateforme, n: ticket.numero }));
  verifier(ticket && /\n\nRien à faire/.test(ticket.description) && !/@/.test(ticket.titre), 'le titre et le texte en clair, épurés, paragraphes gardés', ticket && ticket.titre);
  verifier(ticket && !/sentry|FORGEME|TypeError|occurrence/i.test(JSON.stringify(ticket)), 'le ticket (lu par le client) ne porte rien de Sentry');
  const notes = (await docs(`tickets/${tid}/messages?pageSize=20`)).map((d) => ({ id: idDe(d), ...objet(d) }));
  const note = notes.find((m) => m.interne === true) || {};
  verifier(/Sentry : https:\/\/forgeme\.sentry\.io\/issues\/6001\//.test(note.texte) && /Occurrences : 182 · personnes touchées : 37/.test(note.texte) && /Versions : 1\.1\.3 \(24\) \(150\), 1\.1\.2 \(23\) \(32\)/.test(note.texte) && /Plateformes : iPhone \(120\), Android \(62\)/.test(note.texte), 'la note interne : lien Sentry, occurrences, versions, plateformes', note.texte);
  verifier(notes.length === 1 && note.interne === true, 'une seule note, interne');
  verifier(await statutLecture(`tickets/${tid}/messages/${note.id}`, jC) === 403, 'Camille ne lit pas la note interne (403)');
  verifier(await statutLecture(`tickets/${tid}`, jC) === 200, 'mais elle lit son ticket');
  const deux = await appelAdmin('sentryVersTicket', corpsTicket, { email: 'sam.sentry@exemple.test' });
  verifier(deux.code === 409 && /déjà son ticket/.test(deux.texte), 'la même erreur, un second ticket : 409', `${deux.code} ${deux.texte}`);
  const resume2 = await attendre(async () => { const r = await lireObjet('projets/atelier/stabilite/resume'); return r && r.corrections && r.corrections.length ? r : null; });
  verifier(resume2 && resume2.corrections[0].ticket === tid && !/http|sentry/i.test(JSON.stringify(resume2.corrections)), 'la vue du client compte le ticket parmi les corrections, sans lien');

  if (PARTIE !== 'serveur') {
    console.log('\n== Le Cockpit');
    const ctxE = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    pe = await ctxE.newPage(); pe.on('pageerror', (e) => erreursPage.push(`cockpit: ${e.message.slice(0, 160)}`));
    const requetesSentry = [];
    pe.on('request', (r) => { if (/sentry\.io|127\.0\.0\.1:9877|127\.0\.0\.1:19877/.test(r.url())) requetesSentry.push(r.url()); });
    await connecter(pe, 'agent.essai@exemple.test');
    /* Refonte du Cockpit, lot 3 : plus d'onglets ; l'entrée « Santé de
       l'app » de l'arbre du projet relié mène à la page Stabilité. */
    await aller(pe, '#/projets/atelier', '#lat-corps .lat-arbre[data-arbre="atelier"]');
    verifier(Boolean(await pe.$('#lat-corps .lat-arbre[data-arbre="atelier"] a[data-chemin="/projets/atelier/stabilite"][href="#/projets/atelier/stabilite"]')), 'l entrée Santé de l app est dans l arbre du projet relié');
    await aller(pe, '#/projets/atelier/stabilite', '[data-stab-section="erreurs"]');
    const te = await texteDe(pe);
    const metriques = async (sel) => pe.$$eval(`${sel} .metrique`, (els) => els.map((e) => `${e.querySelector('.metrique-libelle').textContent}=${e.querySelector('.metrique-valeur').textContent}`.replace(/\u00a0|\u202f/g, ' ')));
    const jourVu = await metriques('[data-stab-jour]');
    verifier(jourVu.join('|') === 'Web=31|iPhone=44|Android=23', 'erreurs du jour : Web 31, iPhone 44, Android 23', jourVu.join('|'));
    const sessionsVues = await metriques('[data-stab-sessions]');
    verifier(sessionsVues.join('|') === 'Web, sans plantage=99,7 %|Mobile (iPhone et Android), sans plantage=98,4 %' && /\+0,2 pt sur la semaine d'avant/.test(te) && /-0,6 pt sur la semaine d'avant/.test(te), 'sessions sans plantage : 99,7 % et 98,4 %, l écart sur la semaine', sessionsVues.join('|'));
    verifier((await pe.$$('[data-stab-versions] tbody tr')).length === 4 && /1\.1\.3 \(24\)/.test(te), 'le tableau des versions : quatre lignes, 1.1.3 (24)');
    verifier((await pe.$$('[data-stab-erreurs] [data-erreur]')).length === 4, 'quatre erreurs ouvertes');
    verifier(Boolean(await pe.$(`[data-erreur="6001"] [data-stab-ticket="${tid}"]`)) && Boolean(await pe.$('[data-erreur="6003"] [data-stab-action="ticket"]')), 'la 6001 mène à son ticket, la 6003 propose « Créer un ticket »');
    verifier((await pe.$$('[data-stab-alertes] [data-alerte]')).length >= 4, 'les alertes reçues sont listées');
    verifier(!/@|192\.168/.test(te), 'la page ne montre aucune adresse ni adresse IP');
    /* Les titres d'erreurs de Sentry disent « of undefined » : c'est leur texte, pas un trou de la page. */
    sansDefaut(te.replace(/of undefined/g, ''), 'Cockpit');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-stabilite.png`, fullPage: true });
    /* En direct : une alerte arrive pendant que la page est ouverte. */
    await envoyer('issue', { action: 'created', data: { issue: { ...ISSUE_WEB, id: '6099', shortId: 'FORGEME-WEB-9', title: 'RangeError: Maximum call stack size exceeded' } }, actor: { type: 'application' } });
    verifier(await attendre(async () => /RangeError: Maximum call stack/.test(await texteDe(pe, '[data-stab-alertes]')), 15000), 'une nouvelle alerte apparaît en direct, sans recharger');
    verifier(await attendre(async () => (await cloches(alex)).length === 4), 'et la cloche d Alex sonne une quatrième fois');
    /* « Créer un ticket » de bout en bout. */
    await pe.click('[data-erreur="6003"] [data-stab-action="ticket"]');
    await pe.waitForSelector('#ed-titre', { timeout: 10000 }).catch(() => {});
    const modale = await texteDe(pe, '.voile');
    verifier(/FORGEME-MOBILE-4 · Network request failed/.test(modale) && /note interne du ticket, invisible au client/.test(modale), 'la feuille montre l erreur de Sentry et dit où part le technique');
    await pe.click('button[type="submit"][form="ed-forme"]');
    await pause(500);
    verifier(Boolean(await pe.$('#ed-titre[aria-invalid="true"], .erreur-champ')), 'sans titre en clair, la feuille refuse');
    await pe.fill('#ed-titre', 'L application perd parfois la connexion au serveur');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-creer-ticket.png` });
    await pe.click('button[type="submit"][form="ed-forme"]');
    const versTicket = await attendre(async () => /\/demandes\//.test(pe.url()) && pe.url(), 15000);
    verifier(Boolean(versTicket), 'le ticket est créé, la page y mène', pe.url());
    const tid2 = versTicket ? versTicket.split('/').pop() : '';
    const ticket2 = await attendre(async () => lireObjet(`tickets/${tid2}`));
    verifier(ticket2 && ticket2.titre === 'L application perd parfois la connexion au serveur' && ticket2.plateforme === '' && ticket2.version === '', 'son titre est celui écrit pour le client ; sans tags connus, ni version ni plateforme inventées', JSON.stringify(ticket2 && { t: ticket2.titre, v: ticket2.version }));
    await aller(pe, '#/projets/atelier/stabilite', '[data-stab-section="erreurs"]');
    verifier(Boolean(await pe.$(`[data-erreur="6003"] [data-stab-ticket="${tid2}"]`)), 'de retour sur la page, la 6003 mène à son ticket');
    verifier(requetesSentry.length === 0, 'le navigateur du Cockpit n a jamais appelé Sentry', requetesSentry.slice(0, 3).join(' '));
    await pe.setViewportSize({ width: 390, height: 844 });
    await pause(800);
    verifier(await pe.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Cockpit : aucun débordement horizontal à 390 px');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-stabilite-390.png`, fullPage: true });

    console.log('\n== Le Hub');
    verifier(Boolean(await attendre(async () => pc.$('#lat-corps [data-chemin="/projets/atelier/stabilite"]'), 15000)), 'l entrée Stabilité est apparue d elle-même dans le rail');
    await aller(pc, '#/projets/atelier/stabilite', '[data-stab-section="corrections"]');
    const th = await texteDe(pc);
    verifier(/Site web\s*99,7 %\s*des sessions sans plantage/.test(th) && /Application mobile\s*98,4 %/.test(th), 'Site web 99,7 %, Application mobile 98,4 %', th.slice(0, 300));
    verifier(/En progrès par rapport à la semaine précédente \(99,5 %\)/.test(th) && /En recul par rapport à la semaine précédente \(99,0 %\)/.test(th), 'les tendances, dites en une phrase');
    verifier(/L écran Tâches se ferme parfois/.test(th) && /L application perd parfois la connexion/.test(th), 'en cours de correction : les deux tickets, avec leurs titres en clair');
    verifier(!/Sentry|FORGEME|TypeError|Network request|src\/|1\.1\.3|occurrence|version/i.test(th), 'aucun mot technique dans la page du client', (th.match(/.{0,40}(Sentry|FORGEME|TypeError|Network request|src\/|1\.1\.3|occurrence|version).{0,40}/i) || [''])[0]);
    sansDefaut(th, 'Hub');
    await pc.screenshot({ path: `${CAPTURES}/hub-stabilite.png`, fullPage: true });
    /* Le ticket résolu quitte la liste, en direct. */
    await poser(`tickets/${tid}`, { statut: S('resolu'), resolu: T(new Date()) }, ['statut', 'resolu']);
    verifier(await attendre(async () => !/L écran Tâches se ferme parfois/.test(await texteDe(pc)), 15000), 'un ticket résolu quitte « En cours de correction », sans recharger');
    await pc.setViewportSize({ width: 390, height: 844 });
    await pause(900);
    verifier(await pc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Hub : aucun débordement horizontal à 390 px');
    await pc.screenshot({ path: `${CAPTURES}/hub-stabilite-390.png`, fullPage: true });
    verifier(!erreursPage.length, 'aucune erreur de page', erreursPage.join(' | '));
    await nav.close();
  }

  await faux.fermer();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`  ÉCART  la suite s'est arrêtée : ${e.message}`); process.exit(1); });
