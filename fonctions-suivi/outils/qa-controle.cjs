/* ==========================================================================
   CAPMEDIA CLIENT HUB · la salle de contrôle, Cockpit et Hub

   Deux faux serveurs tournent à côté des émulateurs : Sentry
   (lib/faux-sentry.cjs) et quatre faux sites (lib/faux-sites.cjs : l'app
   web, la landing, la fonction publique, le Hub). Le battement
   (sentryReleve) est déclenché comme Cloud Scheduler le fait : un appel
   HTTP à son déclencheur. Ce que prouve cette suite :
   - relier un projet avec ses adresses : l'administrateur seul ; une
     adresse IP, du http, des identifiants : refusés ;
   - le battement : chaque adresse sondée d'un GET, sans jeton, sans
     cookie, sans corps, sans suivre une redirection ; les voyants, l'état global, la vue du client ;
     le relevé rapide de Sentry quand il est dû, et pas autrement ;
   - la présence : un écran ouvert relève Sentry à la minute ; personne
     devant, aucun appel à Sentry ; une cliente et un agent d'un autre
     projet ne signalent rien ;
   - un site qui tombe : un échec n'est pas une panne, deux le sont
     (incident, alerte « Site en panne », cloche de l'équipe, pas du
     client) ; le premier succès le referme (« Site rétabli ») ; une
     seconde panne dans la demi-heure ne resonne pas la cloche ; deux
     réponses lentes font « lente » ;
   - un incident devient un ticket (note interne : adresse, code) ; 409 la
     seconde fois ; une alerte de Sentry passe le voyant à l'orange sans
     attendre la minute ;
   - le Cockpit (navigateur) : voyants, tuiles, courbes, fil en direct,
     disponibilité, versions, erreurs ouvertes ; une valeur qui change
     clignote ; le son coupé par défaut, puis activé et mémorisé ; « Créer
     un ticket » depuis une alerte du fil et depuis une erreur, « Ticket
     déjà ouvert » sur un 409 ; le plein écran (mode télé qui défile seul,
     ticket créé en plein écran, sortie par Échap et par le bouton) ; le
     navigateur n'appelle jamais Sentry ni les sites ;
   - le Hub (navigateur) : l'entrée du rail, les voyants en phrases, la
     disponibilité, les sessions, les corrections ; aucun mot technique ;
     une panne arrive en direct ; plein écran ;
   - 390 px sans débordement ; aucune erreur de page, ni « undefined »,
     ni tiret cadratin. Captures 1440 x 900, 1920 x 1080, 390 px.

   QA_CONTROLE_PARTIE=serveur : sans les navigateurs (banc de mutations).
   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const crypto = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin, jetonPour } = require('./lib/session-banc.cjs');
const fauxSentry = require('./lib/faux-sentry.cjs');
const fauxSites = require('./lib/faux-sites.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const CAPTURES = process.env.CAPTURES_CONTROLE || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/controle';
const PARTIE = process.env.QA_CONTROLE_PARTIE || 'tout';
const PORT_SENTRY = 9877 + BANC.decalage;
const PORT_SITES = 9878 + BANC.decalage;
const DECLENCHEUR = `${BANC.fonctions}/functions/projects/${PROJET}/triggers/europe-west1-sentryReleve-0`;
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
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } }); const I = (n) => ({ integerValue: String(n) });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const idDe = (d) => (d && d.name ? d.name.split('/').pop() : '');
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
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };
const sansDefaut = (texte, ou) => {
  verifier(!/undefined|\bnull\b|NaN|\[object/.test(texte), `${ou} : aucun « undefined », « null » ni « NaN »`, (texte.match(/.{0,40}(undefined|null|NaN|\[object).{0,40}/) || [''])[0]);
  verifier(!texte.includes('\u2014'), `${ou} : aucun tiret cadratin`);
};
const envoyer = async (ressource, corps) => {
  const brut = JSON.stringify(corps);
  const sig = crypto.createHmac('sha256', SECRET).update(brut).digest('hex');
  const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sentry-Hook-Resource': ressource, 'Sentry-Hook-Signature': sig }, body: brut });
  return { code: r.status, texte: await r.text() };
};
const ISSUE = (id, titre, mobile = false) => ({ id, shortId: `FORGEME-${mobile ? 'MOBILE' : 'WEB'}-${id.slice(-2)}`, title: titre, level: 'error', project: mobile ? { id: '4512197449351248', slug: 'forgeme-mobile' } : { id: '4512197441683536', slug: 'forgeme-web' }, web_url: `https://forgeme.sentry.io/issues/${id}/` });
const alertes = async () => (await docs('sentry/atelier/alertes?pageSize=100')).map((d) => ({ id: idDe(d), ...objet(d) }));
const cloches = async (uid) => (await docs(`boites/${uid}/notifications?pageSize=300`)).map(objet).filter((n) => n.type === 'sentry');

/* Le battement, déclenché comme Cloud Scheduler le fait : un appel HTTP
   à son déclencheur (l'émulateur ne relaie pas un sujet Pub/Sub vers une
   fonction planifiée de seconde génération). */
const battre = async () => {
  const avant = await lireObjet('controle/atelier');
  const t0 = avant && avant.calcule ? Date.parse(avant.calcule) : 0;
  const r = await fetch(DECLENCHEUR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`battement ${r.status} ${(await r.text()).slice(0, 200)}`);
  return attendre(async () => { const c = await lireObjet('controle/atelier'); return c && c.calcule && Date.parse(c.calcule) > t0 ? c : null; }, 40000);
};
const vieillir = (champs) => poser('controle/atelier', Object.fromEntries(champs.map(([k, v]) => [k, v])), champs.map(([k]) => k));
const ilYa = (ms) => T(new Date(Date.now() - ms));

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
const texteDe = async (page, sel = '#vue') => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\u00a0|\u202f/g, ' ');
const erreursPage = [];
/* Le son, compté sans haut-parleur : chaque note jouée lance un oscillateur. */
const fauxAudio = () => {
  window.__sons = 0;
  class FauxAudio {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { window.__sons += 1; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  window.AudioContext = FauxAudio; window.webkitAudioContext = FauxAudio;
};

(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  const faux = await fauxSentry.demarrer({ port: PORT_SENTRY });
  const sites = await fauxSites.demarrer({ port: PORT_SITES });
  const appelsSentryDepuis = (n) => faux.appels.slice(n);
  for (const c of ['sentryLiaisons', 'sentry/atelier/alertes', 'sentry/atelier/tickets', 'sentry/atelier/debits', 'sentry', 'controle/atelier/incidents', 'controle', 'projets/atelier/stabilite']) await vider(c);
  const alex = await uidDe('agent.essai@exemple.test');
  const camilleUid = await uidDe('camille.essai@exemple.test');
  const sam = await creerCompte('sam.controle@exemple.test');
  const ali = await creerCompte('ali.controle@exemple.test');
  await poser(`equipe/${sam}`, { nom: S('Sam Agent'), email: S('sam.controle@exemple.test'), role: S('agent'), actif: B(true), projets: L([S('atelier')]), permissions: L([]) });
  await poser(`equipe/${ali}`, { nom: S('Ali Agent'), email: S('ali.controle@exemple.test'), role: S('agent'), actif: B(true), projets: L([S('boutique')]), permissions: L([]) });
  await poser(`profils/${camilleUid}`, { accueil: T(new Date()) }, ['accueil']);
  const jC = await jetonPour('camille.essai@exemple.test');
  const jL = await jetonPour('lea.essai@exemple.test');

  /* Camille a son Hub ouvert avant la liaison : l'entrée viendra d'elle-même. */
  let nav = null; let pc = null;
  if (PARTIE !== 'serveur') {
    nav = await chromium.launch();
    const ctxC = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    pc = await ctxC.newPage(); pc.on('pageerror', (e) => erreursPage.push(`hub: ${e.message.slice(0, 160)}`));
    await connecter(pc, 'camille.essai@exemple.test');
    await aller(pc, '#/projets/atelier', '#lat-corps');
    verifier(!(await pc.$('#lat-corps [data-chemin="/projets/atelier/controle"]')), 'Hub : pas d entrée « Salle de contrôle » avant la liaison');
  }

  console.log('\n== Relier le projet avec ses adresses : l administrateur seul');
  const adresses = { sondeWeb: `${sites.url}/web`, sondeLanding: `${sites.url}/landing`, sondeFonctions: `${sites.url}/fonctions?type=legal-mentions&locale=fr`, sondeHub: `${sites.url}/hub` };
  const lierCorps = { projet: 'atelier', org: 'forgeme', web: 'forgeme-web', mobile: 'forgeme-mobile', hote: faux.url, ...adresses };
  const parCamille = await appelAdmin('sentryLier', lierCorps, { email: 'camille.essai@exemple.test' });
  verifier(parCamille.code === 403, 'une cliente ne pose pas les adresses (403)', parCamille.code);
  const parSam = await appelAdmin('sentryLier', lierCorps, { email: 'sam.controle@exemple.test' });
  verifier(parSam.code === 403, 'un agent du projet non plus (403)', parSam.code);
  for (const [libelle, adresse] of [['une adresse IP', 'https://169.254.169.254/computeMetadata/v1/'], ['du http', 'http://forgeme.net/'], ['des identifiants', 'https://moi:secret@forgeme.net/'], ['un nom local', 'https://localhost/']]) {
    const r = await appelAdmin('sentryLier', { ...lierCorps, sondeLanding: adresse });
    verifier(r.code === 400, `${libelle} à sonder : refusé (400)`, `${r.code} ${r.texte}`);
  }
  verifier((await lire('sentryLiaisons/atelier')) === null, 'rien n est écrit après ces refus');
  const lie = await appelAdmin('sentryLier', lierCorps);
  verifier(lie.code === 200 && lie.json && lie.json.actif === true, 'l administrateur relie Atelier avec ses quatre adresses', `${lie.code} ${lie.texte}`);
  const liaison = await lireObjet('sentryLiaisons/atelier');
  verifier(liaison && liaison.sondes && Object.keys(liaison.sondes).sort().join(',') === 'fonctions,hub,landing,web', 'la liaison garde les adresses à sonder', JSON.stringify(liaison && liaison.sondes));

  console.log('\n== Le premier battement');
  const appelsAvant = faux.appels.length;
  const sitesAvant = sites.appels.length;
  const c1 = await battre();
  verifier(Boolean(c1), 'le battement tourne (déclenché comme par Cloud Scheduler)');
  const sondes1 = (c1 && c1.sondes) || {};
  verifier(['web', 'landing', 'fonctions', 'hub'].every((k) => sondes1[k] && sondes1[k].etat === 'ok' && sondes1[k].code === (k === 'hub' ? 302 : 200) && typeof sondes1[k].ms === 'number' && sondes1[k].n.length === 288), 'quatre sondes : un code, un temps de réponse, 288 cases (une redirection compte comme une réponse)', JSON.stringify(Object.fromEntries(Object.entries(sondes1).map(([k, v]) => [k, `${v.etat}/${v.code}`]))));
  const visites = sites.appels.slice(sitesAvant);
  verifier(visites.length === 4 && visites.every((a) => a.methode === 'GET' && !a.autorisation && !a.cookie && a.taille === 0), 'chaque adresse reçoit un GET, sans jeton, sans cookie, sans corps', JSON.stringify(visites.map((a) => `${a.cle}:${a.methode}:${a.autorisation ? 'jeton' : ''}`)));
  verifier(!sites.appels.some((a) => a.cle === 'piege'), 'la redirection du Hub n est pas suivie');
  verifier(visites.find((a) => a.cle === 'fonctions').requete === '?type=legal-mentions&locale=fr', 'la fonction publique est appelée en lecture, avec ses paramètres');
  const rapides = appelsSentryDepuis(appelsAvant);
  verifier(rapides.length === 3 && rapides.filter((a) => a.etape === 'heures').length === 2 && rapides.some((a) => a.etape === 'sessions' && /statsPeriod=24h/.test(a.requete)), 'le relevé rapide : deux séries d erreurs et les sessions des 24 h (trois appels)', rapides.map((a) => a.etape).join(','));
  const v1 = (c1 && c1.voyants) || {};
  verifier(Object.keys(v1).sort().join(',') === 'android,fonctions,hub,ios,landing,web', 'six voyants : app web, landing, iPhone, Android, fonctions, Hub', Object.keys(v1).join(','));
  verifier(v1.web && v1.web.etat === 'vert' && /3 erreurs dans l'heure/.test(v1.web.raison) && v1.ios && v1.ios.etat === 'orange' && /Pic : 14 erreurs/.test(v1.ios.raison), 'web vert (3 erreurs dans l heure), iPhone orange (pic de 14)', JSON.stringify({ web: v1.web, ios: v1.ios }));
  verifier(c1 && c1.global && c1.global.phrase === '1 point à surveiller', 'état global : « 1 point à surveiller »', c1 && JSON.stringify(c1.global));
  const e1 = (c1 && c1.erreurs) || {};
  verifier(e1.web && e1.web.valeurs.length === 144 && e1.web.valeurs.reduce((a, b) => a + b, 0) === 39 && e1.android.valeurs.reduce((a, b) => a + b, 0) === 21, 'les erreurs des 24 h par tranche : web 39, Android 21');
  verifier(c1 && c1.sessions24 && c1.sessions24.web.utilisateurs === 184 && c1.sessions24.mobile.taux === 99.32, 'les sessions des 24 h : 184 utilisateurs web, mobile 99,32 %');
  const salle1 = await lireObjet('projets/atelier/stabilite/salle');
  verifier(salle1 && salle1.services.length === 6 && salle1.global.phrase === 'Tout fonctionne, un point est suivi de près', 'la vue du client : six services, sa phrase', salle1 && salle1.global.phrase);
  verifier(salle1 && !/127\.0\.0\.1|http|HTTP|\bms\b|Sentry|FORGEME|Pic :|erreurs dans l'heure|Répond/.test(JSON.stringify(salle1)), 'rien de technique dans la vue du client', JSON.stringify(salle1).slice(0, 300));
  verifier(await statutLecture('projets/atelier/stabilite/salle', jC) === 200, 'Camille lit sa salle, avec son vrai jeton');
  verifier(await statutLecture('controle/atelier', jC) === 403, 'mais pas celle de l équipe (403)');
  verifier(await statutLecture('projets/atelier/stabilite/salle', jL) === 403, 'Léa ne lit pas la salle d Atelier (403)');

  console.log('\n== La présence : Sentry à la minute seulement devant un écran ouvert');
  const preC = await appelAdmin('controleEcran', { projet: 'atelier' }, { email: 'camille.essai@exemple.test' });
  verifier(preC.code === 403, 'une cliente ne signale pas d écran (403)', preC.code);
  const preA = await appelAdmin('controleEcran', { projet: 'atelier' }, { email: 'ali.controle@exemple.test' });
  verifier(preA.code === 403, 'un agent d un autre projet non plus (403)', preA.code);
  const preB = await appelAdmin('controleEcran', { projet: 'boutique' });
  verifier(preB.code === 404, 'un projet non relié : 404', preB.code);
  await vieillir([['rapideReserve', I(Date.now())]]);
  const avantPresence = faux.appels.length;
  const preS = await appelAdmin('controleEcran', { projet: 'atelier' }, { email: 'sam.controle@exemple.test' });
  verifier(preS.code === 200 && preS.json && preS.json.rapide === false && faux.appels.length === avantPresence, 'Sam ouvre l écran : présence notée ; relevé fait il y a moins d une minute, Sentry n est pas rappelé', `${preS.texte} · ${faux.appels.length - avantPresence}`);
  const apresPresence = await lireObjet('controle/atelier');
  verifier(apresPresence && apresPresence.ecranVu && Date.now() - Date.parse(apresPresence.ecranVu) < 30000, 'le signal de présence est écrit par le serveur');
  await vieillir([['rapideReserve', I(Date.now() - 70000)], ['rapide', M({ le: ilYa(70000), ok: B(true) })]]);
  const avantMinute = faux.appels.length;
  await battre();
  verifier(faux.appels.length - avantMinute === 2, 'un écran ouvert et un relevé vieux d une minute : le battement relève les erreurs (deux appels, sessions gardées cinq minutes)', faux.appels.slice(avantMinute).map((a) => a.etape).join(','));
  await vieillir([['ecranVu', ilYa(10 * 60000)], ['rapideReserve', I(Date.now() - 120000)], ['rapide', M({ le: ilYa(120000), ok: B(true) })]]);
  const avantPersonne = faux.appels.length;
  await battre();
  verifier(faux.appels.length === avantPersonne, 'personne devant l écran : aucun appel à Sentry pendant le quart d heure', faux.appels.slice(avantPersonne).map((a) => a.etape).join(','));

  console.log('\n== Un site qui tombe, qui revient');
  sites.regler('landing', { code: 503 });
  const p1 = await battre();
  verifier(p1 && p1.sondes.landing.etat === 'echec' && p1.voyants.landing.etat === 'orange' && !(await alertes()).some((a) => a.type === 'panne'), 'un échec : orange, revérifié, pas encore de panne ni d alerte');
  const p2 = await battre();
  verifier(p2 && p2.sondes.landing.etat === 'panne' && p2.voyants.landing.etat === 'rouge' && p2.voyants.landing.raison === 'HTTP 503' && p2.global.phrase.startsWith('1 incident'), 'deux échecs : panne, voyant rouge « HTTP 503 », « 1 incident »', p2 && JSON.stringify({ v: p2.voyants.landing, g: p2.global }));
  const incidents = (await docs('controle/atelier/incidents?pageSize=20')).map((d) => ({ id: idDe(d), ...objet(d) }));
  const inc = incidents[0] || {};
  verifier(incidents.length === 1 && inc.cible === 'landing' && inc.code === 503 && inc.fin === null && p2.sondes.landing.incident === inc.id, 'un incident s ouvre, daté du premier échec', JSON.stringify(inc));
  const aPanne = await attendre(async () => (await alertes()).find((a) => a.type === 'panne'));
  verifier(aPanne && aPanne.titre === 'Site en panne' && aPanne.texte === 'Landing : HTTP 503' && aPanne.incident === inc.id && aPanne.app === 'landing', 'l alerte « Site en panne » entre dans le fil, avec son incident', JSON.stringify(aPanne));
  verifier(await attendre(async () => (await cloches(alex)).some((n) => /Site en panne · Landing/.test(n.titre) && n.lien === '#/projets/atelier/controle')), 'la cloche d Alex sonne, avec le lien vers la salle');
  verifier((await cloches(camilleUid)).length === 0, 'celle de Camille, cliente, ne sonne pas');
  const salle2 = await lireObjet('projets/atelier/stabilite/salle');
  const landingClient = (salle2.services || []).find((x) => x.cle === 'landing') || {};
  verifier(landingClient.etat === 'rouge' && /^Inaccessible depuis \d{2} h \d{2}\. Nous sommes dessus\.$/.test(landingClient.phrase) && salle2.global.phrase === 'Un service perturbé, nous sommes dessus', 'le client lit « Inaccessible depuis 14 h 02. Nous sommes dessus. »', JSON.stringify(landingClient));
  const p3 = await battre();
  verifier(p3 && p3.sondes.landing.etat === 'panne' && (await alertes()).filter((a) => a.type === 'panne').length === 1, 'un troisième échec : la même panne, pas de seconde alerte');

  console.log('\n== Un incident devient un ticket');
  const corpsT = { projet: 'atelier', incident: inc.id, titre: 'Le site vitrine a été inaccessible quelques minutes (jean.dupont@exemple.fr)', description: 'Nous avons repéré que le site vitrine ne répondait plus.\n\nRien à faire de votre côté.', urgence: 'critique' };
  verifier((await appelAdmin('controleVersTicket', corpsT, { email: 'ali.controle@exemple.test' })).code === 403, 'un agent d un autre projet ne crée pas ce ticket (403)');
  verifier((await appelAdmin('controleVersTicket', corpsT, { email: 'camille.essai@exemple.test' })).code === 403, 'une cliente non plus (403)');
  verifier((await appelAdmin('controleVersTicket', { ...corpsT, incident: 'inconnuMaisBienForme' }, { email: 'sam.controle@exemple.test' })).code === 404, 'un incident inconnu : 404');
  verifier((await appelAdmin('controleVersTicket', { ...corpsT, incident: '../../tickets/x' }, { email: 'sam.controle@exemple.test' })).code === 400, 'un identifiant d incident mal formé : 400');
  const tInc = await appelAdmin('controleVersTicket', corpsT, { email: 'sam.controle@exemple.test' });
  verifier(tInc.code === 200 && tInc.json && tInc.json.id, 'Sam fait de l incident un ticket', `${tInc.code} ${tInc.texte}`);
  const tidInc = tInc.json ? tInc.json.id : '';
  const ticketInc = await attendre(async () => lireObjet(`tickets/${tidInc}`));
  verifier(ticketInc && ticketInc.titre === 'Le site vitrine a été inaccessible quelques minutes ([adresse])' && ticketInc.statut === 'en-cours' && ticketInc.plateforme === 'web' && !/127\.0\.0\.1|HTTP|503/.test(JSON.stringify(ticketInc)), 'le ticket porte le titre écrit pour le client, rien de technique');
  const noteInc = (await docs(`tickets/${tidInc}/messages?pageSize=10`)).map((d) => ({ id: idDe(d), ...objet(d) })).find((m) => m.interne === true) || {};
  verifier(/incident de disponibilité : Landing \(127\.0\.0\.1:\d+\)/.test(noteInc.texte) && /Réponse : HTTP 503/.test(noteInc.texte) && /toujours en cours/.test(noteInc.texte), 'la note interne : l adresse, le code, l incident en cours', noteInc.texte);
  verifier(await statutLecture(`tickets/${tidInc}/messages/${noteInc.id}`, jC) === 403, 'Camille ne lit pas la note interne (403)');
  const deuxInc = await appelAdmin('controleVersTicket', corpsT, { email: 'sam.controle@exemple.test' });
  verifier(deuxInc.code === 409 && /déjà son ticket/.test(deuxInc.texte), 'le même incident, un second ticket : 409', `${deuxInc.code} ${deuxInc.texte}`);
  verifier((await lireObjet(`controle/atelier/incidents/${inc.id}`)).ticket === tidInc, 'l incident garde son ticket');
  const resumeInc = await attendre(async () => { const r = await lireObjet('projets/atelier/stabilite/resume'); return r && (r.corrections || []).some((x) => x.ticket === tidInc) ? r : null; });
  verifier(Boolean(resumeInc) && !/http|127\.0\.0\.1/.test(JSON.stringify(resumeInc.corrections)), 'le client le compte parmi les corrections en cours, sans lien');

  console.log('\n== Le retour, la lenteur');
  sites.regler('landing', { code: 200 });
  const r1 = await battre();
  verifier(r1 && r1.sondes.landing.etat === 'ok' && r1.voyants.landing.etat === 'vert' && !r1.sondes.landing.incident, 'le premier succès referme la panne : vert');
  const incFini = await lireObjet(`controle/atelier/incidents/${inc.id}`);
  verifier(incFini && incFini.fin && incFini.minutes >= 1, 'l incident est fermé, avec sa durée', JSON.stringify(incFini && { fin: incFini.fin, m: incFini.minutes }));
  const aRetour = await attendre(async () => (await alertes()).find((a) => a.type === 'retabli'));
  verifier(aRetour && aRetour.titre === 'Site rétabli' && /^Landing, après \d+ min$/.test(aRetour.texte) && aRetour.incident === inc.id, 'l alerte « Site rétabli » entre dans le fil', JSON.stringify(aRetour));
  /* Une seconde panne dans la demi-heure : l alerte, oui ; la cloche, non. */
  sites.regler('landing', { code: 500 });
  await battre(); await battre();
  verifier((await attendre(async () => ((await alertes()).filter((a) => a.type === 'panne').length === 2 ? true : null), 10000)) && (await cloches(alex)).filter((n) => /Site en panne/.test(n.titre)).length === 1, 'une seconde panne dans la demi-heure : une alerte de plus, pas de seconde cloche');
  sites.regler('landing', { code: 200 });
  await battre();
  sites.regler('web', { delai: 3300 });
  await battre();
  const l2 = await battre();
  verifier(l2 && l2.sondes.web.etat === 'lent' && l2.voyants.web.etat === 'orange' && /^Lente : 3,\d\ss/.test(l2.voyants.web.raison), 'deux réponses en plus de trois secondes : l app web est « lente »', l2 && JSON.stringify(l2.voyants.web));
  sites.regler('web', { delai: 0 });
  await battre();

  console.log('\n== Une alerte de Sentry : le voyant passe à l orange sans attendre la minute');
  const avantAlerte = await lireObjet('controle/atelier');
  verifier(avantAlerte.voyants.web.etat === 'vert', 'le voyant web est vert');
  await envoyer('issue', { action: 'created', data: { issue: ISSUE('6101', 'TypeError: Cannot read properties of undefined (reading map)') }, actor: { type: 'application' } });
  const apresAlerte = await attendre(async () => { const c = await lireObjet('controle/atelier'); return c.voyants.web.etat === 'orange' ? c : null; }, 15000);
  verifier(apresAlerte && /^Nouvelle erreur à \d{2} h \d{2}/.test(apresAlerte.voyants.web.raison), 'une nouvelle erreur : voyant web orange aussitôt', apresAlerte && apresAlerte.voyants.web.raison);

  if (PARTIE !== 'serveur') {
    console.log('\n== Le Cockpit, la salle de contrôle');
    const ctxE = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    await ctxE.addInitScript(fauxAudio);
    const pe = await ctxE.newPage(); pe.on('pageerror', (e) => erreursPage.push(`cockpit: ${e.message.slice(0, 160)}`));
    const fuites = [];
    pe.on('request', (r) => { if (/sentry\.io|127\.0\.0\.1:(9877|19877|9878|19878)/.test(r.url())) fuites.push(r.url()); });
    await connecter(pe, 'agent.essai@exemple.test');
    await aller(pe, '#/projets/atelier', '#onglets-projet');
    verifier(Boolean(await pe.$('#onglets-projet a[href="#/projets/atelier/controle"]')), 'l onglet « Salle de contrôle » est sur la page du projet relié');
    verifier(Boolean(await pe.$('#lat-corps [data-chemin="/controle"]')), 'et l entrée « Salle de contrôle » dans la barre de l administrateur');
    const ecranAvant = Date.parse((await lireObjet('controle/atelier')).ecranVu || 0) || 0;
    await aller(pe, '#/projets/atelier/controle', '[data-salle] .voyant');
    await pe.waitForSelector('[data-region="tuiles"] .tuile', { timeout: 15000 }).catch(() => {});
    verifier(Boolean(await attendre(async () => { const c = await lireObjet('controle/atelier'); return Date.parse(c.ecranVu || 0) > ecranAvant; }, 15000)), 'l écran ouvert se signale au serveur');
    const voyants = await pe.$$eval('[data-voyant]', (els) => els.map((e) => `${e.dataset.voyant}:${e.dataset.etat}`));
    verifier(voyants.join(',') === 'web:orange,landing:vert,ios:orange,android:vert,fonctions:vert,hub:vert', 'six voyants, dans l ordre, avec leur état', voyants.join(','));
    const global = await texteDe(pe, '[data-region="global"]');
    verifier(global === '2 points à surveiller', 'l état global en gros : « 2 points à surveiller »', global);
    const tuileWeb = await pe.$$eval('[data-tuile="web"] .schiffre-v', (els) => els.map((e) => e.textContent.replace(/ | /g, ' ')));
    verifier(tuileWeb[0] === '3' && tuileWeb[1] === '39' && tuileWeb[2] === '99,6 %' && tuileWeb[3] === '184', 'tuile App web : 3 dans l heure, 39 sur 24 h, 99,6 % sans plantage, 184 utilisateurs', tuileWeb.join('|'));
    const tuileIos = await pe.$$eval('[data-tuile="ios"] .schiffre-v', (els) => els.map((e) => e.textContent));
    verifier(tuileIos[0] === '14' && tuileIos[1] === '47', 'tuile iPhone : 14 dans l heure, 47 sur 24 h', tuileIos.join('|'));
    verifier((await pe.$$('[data-tuile] svg.courbe polyline')).length === 3, 'une courbe des 24 h par application');
    verifier((await pe.$$('[data-region="dispo"] .dispo')).length === 4 && (await pe.$$('[data-region="dispo"] svg.courbe--reponse')).length === 4, 'quatre lignes de disponibilité, chacune sa courbe de temps de réponse');
    verifier((await pe.$$('[data-region="dispo"] .courbe-ko')).length >= 1, 'les échecs de la landing sont marqués sur sa courbe');
    const tc = await texteDe(pe);
    const dispoLanding = (await texteDe(pe, '[data-v="d-landing-pct"]')).replace(/\u00a0|\u202f/g, ' ');
    verifier(/^\d{2},\d{2} %$/.test(dispoLanding) && parseFloat(dispoLanding.replace(',', '.')) < 100, 'la disponibilité des 24 h de la landing, au centième, sous 100 % après sa panne', dispoLanding);
    verifier((await pe.$$('[data-region="fil"] [data-alerte]')).length >= 4 && /Site en panne/.test(tc) && /Site rétabli/.test(tc), 'le fil en direct : les alertes, la panne et le retour');
    verifier((await pe.$$('[data-region="erreurs"] [data-erreur]')).length === 4, 'quatre erreurs ouvertes');
    verifier(/Versions en service/i.test(tc) && /1\.1\.3 \(24\)/.test(tc), 'les versions en service, avec leur date de mise en ligne');
    verifier((await pe.$$('[data-region="incidents"] [data-incident]')).length === 2, 'les deux incidents de la landing, fermés');
    verifier(Boolean(await pe.$(`[data-region="fil"] [data-salle-ticket-ouvert="${tidInc}"]`)) && /Ticket déjà ouvert/.test(await texteDe(pe, '[data-region="fil"]')), 'l alerte de panne mène à son ticket : « Ticket déjà ouvert »');
    verifier((await pe.$$('[data-region="fil"] [data-salle-ticket="alerte"]')).length >= 1 && (await pe.$$('[data-region="erreurs"] [data-salle-ticket="erreur"]')).length === 4, 'chaque alerte d une erreur et chaque erreur ouverte a son « Créer un ticket »');
    const son = await pe.$eval('[data-salle-action="son"]', (b) => `${b.getAttribute('aria-pressed')}|${b.textContent}`);
    verifier(son === 'false|Son : coupé', 'le son est coupé par défaut', son);
    sansDefaut(tc.replace(/of undefined/g, ''), 'Cockpit');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-salle-1440.png`, fullPage: true });

    console.log('\n== En direct : une alerte arrive, une valeur change');
    await envoyer('issue', { action: 'created', data: { issue: ISSUE('6102', 'RangeError: Maximum call stack size exceeded') }, actor: { type: 'application' } });
    const arrivee = await attendre(async () => pe.$('[data-region="fil"] [data-alerte].neuf'), 15000);
    verifier(Boolean(arrivee) && /RangeError: Maximum call stack/.test(await texteDe(pe, '[data-region="fil"]')), 'la nouvelle alerte entre dans le fil, en glissant, sans recharger');
    verifier(await pe.evaluate(() => window.__sons) === 0, 'son coupé : aucune note jouée');
    await pe.click('[data-salle-action="son"]');
    const sonsActives = await pe.evaluate(() => window.__sons);
    verifier(await pe.$eval('[data-salle-action="son"]', (b) => b.getAttribute('aria-pressed')) === 'true' && sonsActives === 2, 'activer le son : une note de confirmation', sonsActives);
    await envoyer('issue', { action: 'created', data: { issue: ISSUE('6103', 'Error: Network request failed', true) }, actor: { type: 'application' } });
    verifier(Boolean(await attendre(async () => (await pe.evaluate(() => window.__sons)) > sonsActives, 15000)), 'son activé : une nouvelle erreur sonne');
    await pe.reload({ waitUntil: 'domcontentloaded' });
    await pe.waitForSelector('[data-salle-action="son"]', { timeout: 20000 }).catch(() => {});
    verifier(await pe.$eval('[data-salle-action="son"]', (b) => b.getAttribute('aria-pressed')).catch(() => '') === 'true', 'la préférence du son est mémorisée');
    await pe.click('[data-salle-action="son"]');
    await pe.waitForSelector('[data-tuile="web"] [data-v="t-web-h"]', { timeout: 15000 }).catch(() => {});
    await pause(800);
    const c2 = await lireObjet('controle/atelier');
    const valeurs = c2.erreurs.web.valeurs.slice(); valeurs[143] += 5;
    await poser('controle/atelier', { erreurs: M({ ...Object.fromEntries(Object.entries(c2.erreurs).filter(([k]) => k !== 'web').map(([k, v]) => [k, M({ fin: I(v.fin), valeurs: L(v.valeurs.map((x) => I(x))) })])), web: M({ fin: I(c2.erreurs.web.fin), valeurs: L(valeurs.map((x) => I(x))) }) }), maj: T(new Date()) }, ['erreurs', 'maj']);
    const clignote = await attendre(async () => pe.$('[data-v="t-web-h"].clignote'), 10000);
    verifier(Boolean(clignote) && (await texteDe(pe, '[data-v="t-web-h"]')) === '8', 'une valeur qui change (3 devient 8) clignote une fois, sans redessiner la page');
    verifier(Boolean(await attendre(async () => !(await pe.$('[data-v="t-web-h"].clignote')), 5000)), 'et cesse de clignoter');

    console.log('\n== Créer un ticket depuis la salle');
    /* Une erreur que Sentry connaît (le serveur la relit avant d'en faire un ticket). */
    await envoyer('issue', { action: 'unresolved', data: { issue: ISSUE('6004', 'ResizeObserver loop limit exceeded') }, actor: { type: 'application' } });
    const id6102 = (await attendre(async () => (await alertes()).find((a) => a.issue === '6004'))).id;
    const ligne6102 = await attendre(async () => pe.$(`[data-alerte="${id6102}"] [data-salle-ticket="alerte"]`), 15000);
    await pe.click(`[data-alerte="${id6102}"] [data-salle-ticket="alerte"]`);
    await pe.waitForSelector('#ed-titre', { timeout: 10000 }).catch(() => {});
    const feuille = await texteDe(pe, '.voile');
    verifier(Boolean(ligne6102) && /FORGEME-WEB-1 · ResizeObserver loop limit exceeded/.test(feuille) && /note interne du ticket, invisible au client/.test(feuille), 'la feuille de la page Stabilité : l erreur, et où part le technique', feuille.slice(0, 200));
    await pe.fill('#ed-titre', 'Une page du site se bloque parfois');
    await pe.click('button[type="submit"][form="ed-forme"]');
    const lien6102 = await attendre(async () => (await lireObjet('sentry/atelier/tickets/6004')), 15000);
    verifier(Boolean(lien6102) && lien6102.ticket, 'le ticket est créé, relié à l erreur');
    verifier(/#\/projets\/atelier\/controle$/.test(pe.url()), 'la salle reste à l écran (pas de navigation)');
    verifier(Boolean(await attendre(async () => pe.$(`[data-alerte="${id6102}"] [data-salle-ticket-ouvert="${lien6102 && lien6102.ticket}"]`), 15000)), 'la ligne du fil devient « Ticket déjà ouvert », avec son lien');
    const t6102 = lien6102 ? await lireObjet(`tickets/${lien6102.ticket}`) : null;
    verifier(t6102 && t6102.titre === 'Une page du site se bloque parfois', 'son titre est celui écrit pour le client');
    /* Le 409 : la même erreur reçoit son ticket ailleurs pendant que la feuille est ouverte. */
    await pe.click('[data-erreur="6003"] [data-salle-ticket="erreur"]');
    await pe.waitForSelector('#ed-titre', { timeout: 10000 }).catch(() => {});
    const ailleurs = await appelAdmin('sentryVersTicket', { projet: 'atelier', issue: '6003', titre: 'Connexion perdue par moments', description: 'Nous corrigeons.', urgence: 'important' }, { email: 'sam.controle@exemple.test' });
    await pe.fill('#ed-titre', 'Doublon qui ne doit pas naître');
    await pe.click('button[type="submit"][form="ed-forme"]');
    const toast409 = await attendre(async () => { const t = await texteDe(pe, '.toasts'); return /Ticket déjà ouvert/.test(t) ? t : null; }, 10000);
    verifier(ailleurs.code === 200 && Boolean(toast409), 'un ticket ouvert entre-temps : 409, « Ticket déjà ouvert »', toast409);
    verifier(Boolean(await attendre(async () => !(await pe.$('#ed-titre')), 5000)), 'la feuille se referme');
    verifier(Boolean(await attendre(async () => pe.$(`[data-erreur="6003"] [data-salle-ticket-ouvert="${ailleurs.json && ailleurs.json.id}"]`), 15000)), 'et la ligne mène au ticket existant');
    verifier(!(await docs('tickets?pageSize=300')).map(objet).some((t) => t.titre === 'Doublon qui ne doit pas naître'), 'aucun doublon créé');

    console.log('\n== Le plein écran, mode télé');
    await pe.setViewportSize({ width: 1920, height: 1080 });
    await pause(600);
    await pe.click('[data-salle-action="plein"]');
    await pause(900);
    const etatPlein = await pe.evaluate(() => ({ classe: document.documentElement.classList.contains('salle-plein'), tv: Boolean(document.querySelector('.salle--tv')), api: Boolean(document.fullscreenElement), bouton: document.querySelector('[data-salle-action="plein"]').textContent }));
    verifier(etatPlein.classe && etatPlein.tv && etatPlein.bouton === 'Quitter le plein écran', 'le bouton passe la salle en plein écran, mode télé', JSON.stringify(etatPlein));
    const couvre = await pe.evaluate(() => [[12, 12], [120, 400], [window.innerWidth - 12, window.innerHeight - 12]].every(([x, y]) => { const el = document.elementFromPoint(x, y); return Boolean(el && el.closest('[data-salle]')); }));
    verifier(couvre, 'la salle couvre tout l écran : ni barre, ni rail, ni bulle par-dessus');
    const visibles = async () => pe.$$eval('[data-tuile]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.tuile));
    const premiere = await visibles();
    verifier(premiere.length === 1, 'une application à la fois, en gros', premiere.join(','));
    const tailleChiffre = await pe.$eval('.tv-actif .schiffre--grand .schiffre-v', (e) => parseFloat(getComputedStyle(e).fontSize)).catch(() => 0);
    verifier(tailleChiffre >= 80, 'des chiffres lisibles de loin', tailleChiffre);
    await pe.screenshot({ path: `${CAPTURES}/cockpit-salle-plein-1920.png` });
    await pause(8600);
    const seconde = await visibles();
    verifier(seconde.length === 1 && seconde[0] !== premiere[0], 'elle défile seule (une autre application après huit secondes)', `${premiere} puis ${seconde}`);
    /* Un ticket, en plein écran : la feuille passe au-dessus de la salle. */
    await envoyer('issue', { action: 'created', data: { issue: ISSUE('6001', "TypeError: Cannot read property 'id' of undefined", true) }, actor: { type: 'application' } });
    const id6104 = (await attendre(async () => (await alertes()).find((a) => a.issue === '6001'))).id;
    await pe.waitForSelector(`[data-alerte="${id6104}"] [data-salle-ticket="alerte"]`, { timeout: 15000 });
    await pe.click(`[data-alerte="${id6104}"] [data-salle-ticket="alerte"]`);
    await pe.waitForSelector('#ed-titre', { timeout: 10000 }).catch(() => {});
    const dessus = await pe.evaluate(() => { const f = document.querySelector('#ed-titre'); if (!f) return false; const r = f.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(el && el.closest('.voile')); });
    verifier(dessus, 'en plein écran, la feuille du ticket est au-dessus de la salle');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-salle-plein-ticket-1920.png` });
    await pe.fill('#ed-titre', 'Le paiement échoue parfois sur mobile');
    await pe.click('button[type="submit"][form="ed-forme"]');
    const lien6104 = await attendre(async () => lireObjet('sentry/atelier/tickets/6001'), 15000);
    verifier(Boolean(lien6104) && (await pe.evaluate(() => document.documentElement.classList.contains('salle-plein'))), 'ticket créé en plein écran, sans en sortir');
    await pe.keyboard.press('Escape');
    await pause(700);
    const sorti = await pe.evaluate(() => ({ classe: document.documentElement.classList.contains('salle-plein'), api: Boolean(document.fullscreenElement) }));
    verifier(!sorti.classe && !sorti.api, 'Échap sort du plein écran', JSON.stringify(sorti));
    await pe.click('[data-salle-action="plein"]');
    await pause(500);
    await pe.click('[data-salle-action="plein"]');
    await pause(500);
    verifier(!(await pe.evaluate(() => document.documentElement.classList.contains('salle-plein'))) && (await visibles()).length === 3, 'le bouton en sort aussi, les trois applications reviennent');
    verifier(fuites.length === 0, 'le navigateur n a jamais appelé Sentry ni les sites sondés', fuites.slice(0, 3).join(' '));

    await pe.setViewportSize({ width: 390, height: 844 });
    await pause(900);
    verifier(await pe.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Cockpit : aucun débordement horizontal à 390 px');
    await pe.screenshot({ path: `${CAPTURES}/cockpit-salle-390.png`, fullPage: true });

    console.log('\n== Le Hub, la salle du client');
    verifier(Boolean(await attendre(async () => pc.$('#lat-corps [data-chemin="/projets/atelier/controle"]'), 15000)), 'l entrée « Salle de contrôle » est apparue d elle-même dans le rail');
    await aller(pc, '#/projets/atelier/controle', '[data-salle] .voyant');
    await pc.waitForSelector('[data-region="corrections"] .salle-bloc-tete', { timeout: 15000 }).catch(() => {});
    const th = await texteDe(pc);
    verifier(/Application web/.test(th) && /Site vitrine/.test(th) && /Application iPhone/.test(th) && /Votre espace Capmedia/.test(th) && /Fonctionne normalement/.test(th), 'les voyants, dans les mots du client');
    verifier(/Quelques erreurs repérées, nous les suivons/.test(th), 'l iPhone : « Quelques erreurs repérées, nous les suivons »');
    verifier((await pc.$$('[data-region="dispo"] .bande')).length === 3 && (await pc.$$('[data-region="dispo"] .bande i')).length === 144, 'la disponibilité sur 24 h : trois bandes de 48 demi-heures');
    verifier(/Site web\s*99,7 %/.test(th) && /Application mobile\s*98,4 %/.test(th), 'les utilisations sans plantage, sur sept jours');
    verifier(/Le site vitrine a été inaccessible quelques minutes/.test(th) && /Une page du site se bloque parfois/.test(th), 'en cours de correction : les titres écrits pour lui');
    verifier(!/Sentry|FORGEME|TypeError|RangeError|HTTP|127\.0\.0\.1|\bms\b|Répond en|erreurs dans l'heure|forgeme\.net/i.test(th), 'aucun mot technique dans la salle du client', (th.match(/.{0,40}(Sentry|FORGEME|TypeError|RangeError|HTTP|127\.0\.0\.1|\bms\b|Répond en|forgeme\.net).{0,40}/i) || [''])[0]);
    verifier(!(await pc.$('[data-salle-action="son"]')), 'pas de son chez le client');
    sansDefaut(th, 'Hub');
    await pc.screenshot({ path: `${CAPTURES}/hub-salle-1440.png`, fullPage: true });
    /* En direct : la landing tombe, le client le lit sans recharger. */
    sites.regler('landing', { code: 502 });
    await battre(); await battre();
    verifier(Boolean(await attendre(async () => /Inaccessible depuis \d{2} h \d{2}\. Nous sommes dessus\./.test(await texteDe(pc)), 15000)), 'une panne arrive chez le client en direct : « Inaccessible depuis… »');
    verifier(Boolean(await attendre(async () => (await texteDe(pc, '[data-region="global"]')) === 'Un service perturbé, nous sommes dessus', 10000)), 'et la phrase globale change');
    await pc.setViewportSize({ width: 1920, height: 1080 });
    await pause(500);
    await pc.click('[data-salle-action="plein"]');
    await pause(900);
    verifier(await pc.evaluate(() => document.documentElement.classList.contains('salle-plein') && Boolean(document.querySelector('.salle--tv')) && [[12, 12], [window.innerWidth - 12, window.innerHeight - 12]].every(([x, y]) => { const el = document.elementFromPoint(x, y); return Boolean(el && el.closest('[data-salle]')); })), 'le client a son plein écran aussi, qui couvre tout');
    await pc.screenshot({ path: `${CAPTURES}/hub-salle-plein-1920.png` });
    await pc.keyboard.press('Escape');
    await pause(600);
    verifier(!(await pc.evaluate(() => document.documentElement.classList.contains('salle-plein'))), 'Échap l en sort');
    sites.regler('landing', { code: 200 });
    await battre();
    await pc.setViewportSize({ width: 390, height: 844 });
    await pause(900);
    verifier(await pc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Hub : aucun débordement horizontal à 390 px');
    await pc.screenshot({ path: `${CAPTURES}/hub-salle-390.png`, fullPage: true });
    verifier(!erreursPage.length, 'aucune erreur de page', erreursPage.join(' | '));
    await nav.close();
  }

  await faux.fermer();
  await sites.fermer();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`  ÉCART  la suite s'est arrêtée : ${e.message}`); process.exit(1); });
