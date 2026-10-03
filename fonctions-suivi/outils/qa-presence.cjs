require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la présence des clients, vue du Cockpit

   Ce que l'équipe voit dans l'onglet Accès client d'un projet : la pastille
   « En ligne » d'un interlocuteur dont le Hub est ouvert et visible, « Vu
   il y a » sinon, et l'historique de ses connexions (date, appareil, mode)
   dans le menu de sa ligne. Le client, lui, n'en voit rien et ne lit rien.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-presence.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const crypto = require('crypto');
const PROJET = 'capmedia-1f90d', SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, k) => (((d || {}).fields || {})[k] || {});
const str = (d, k) => champ(d, k).stringValue || '';
const soucis = []; const ok = (m) => console.log('  ok     ' + m); const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, b, m) => (c ? ok(b) : dire(m ? `${b} · ${m}` : b));
const attendre = async (fn, n = 30, ms = 600) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
const { appelAdmin, uidDe, ADMIN_BANC } = require('./lib/session-banc.cjs');

const codeDe = (email) => attendre(async () => {
  const j = await lire('envois?pageSize=100');
  const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code'
    && (((champ(d, 'a').arrayValue || {}).values) || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === email));
  if (!p.length) return null;
  p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
  return ((((champ(p[0], 'variables').mapValue || {}).fields) || {}).code || {}).stringValue || null;
});

/* La porte, franchie par le code, dans un contexte neuf. */
const entrer = async (nav, email) => {
  const contexte = await nav.newContext({ viewport: { width: 1300, height: 1000 } });
  const page = await contexte.newPage();
  const err = []; page.on('pageerror', (e) => err.push(e.message.slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 140)); });
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await codeDe(email) || '');
  await pause(7000);
  return { contexte, page, err };
};

const cleEmail = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 32);
const CAMILLE = 'camille.essai@exemple.test';
const LEA = 'lea.essai@exemple.test';
const iso = (ms) => new Date(ms).toISOString();
const poserPresence = (pid, uid, vuMs, enLigne) => fetch(bdd(`projets/${pid}/presencesClient/${uid}`), {
  method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { vu: { timestampValue: iso(vuMs) }, enLigne: { booleanValue: enLigne } } }),
});
/* Ce que le navigateur du client sait faire avec SA session : on passe par
   les modules de la page, donc par ses jetons, jamais par le propriétaire. */
const essaiClient = (page, geste) => page.evaluate(async (g) => {
  const n = await import('./assets/js/noyau.js');
  try {
    if (g.lire) await n.getDoc(n.doc(n.bdd, g.lire));
    if (g.liste) await n.getDocs(n.collection(n.bdd, g.liste));
    if (g.ecrire) await n.setDoc(n.doc(n.bdd, g.ecrire), { vu: n.serverTimestamp(), enLigne: true });
    return 'permis';
  } catch (e) { return e && e.code ? e.code : String(e); }
}, geste);

(async () => {
  const uidCamille = await uidDe(CAMILLE);
  const uidLea = await uidDe(LEA);
  await vider(`projets/atelier/presencesClient`);
  await vider(`journalConnexions/${uidCamille}/entrees`);
  const nav = await chromium.launch();

  console.log('\n== 1 · Avant toute visite : « Dernière visite inconnue » ou « Jamais connecté »');
  const admin = await entrer(nav, ADMIN_BANC);
  const cockpit = admin.page;
  await cockpit.goto(`${SITE}/suivi/cockpit?emul#/projets/atelier/acces`, { waitUntil: 'domcontentloaded' });
  const sel = `[data-presence="${cleEmail(CAMILLE)}"]`;
  await cockpit.waitForSelector(sel, { timeout: 25000 });
  const libelle = () => cockpit.getAttribute(sel, 'data-libelle');
  verifier(['Dernière visite inconnue', 'Jamais connecté'].includes(await libelle()), 'sans battement, pas de « En ligne »', await libelle());

  console.log('\n== 2 · Camille ouvre son Hub : pastille verte, en direct, sans redessiner la page');
  await cockpit.evaluate(() => { window.__pageAvant = document.querySelector('#onglet-corps'); });
  const client = await entrer(nav, CAMILLE);
  verifier(/\/suivi\/hub/.test(client.page.url()), 'Camille atterrit dans son Hub', client.page.url());
  verifier(await attendre(async () => (await libelle()) === 'En ligne', 40), 'le Cockpit affiche « En ligne » sans recharger', await libelle());
  verifier(await cockpit.$eval(`${sel} .puce`, (e) => e.classList.contains('puce--vert')), 'la pastille est le point vert des états');
  verifier(await cockpit.evaluate(() => window.__pageAvant === document.querySelector('#onglet-corps')), 'la page n a pas été redessinée (pastille patchée en place)');
  const p1 = await lire(`projets/atelier/presencesClient/${uidCamille}`);
  verifier(champ(p1, 'enLigne').booleanValue === true && Boolean(champ(p1, 'vu').timestampValue), 'le battement est en base (vu, enLigne)');
  verifier(Object.keys((p1 || {}).fields || {}).sort().join(',') === 'enLigne,vu', 'et ne porte rien d autre', Object.keys((p1 || {}).fields || {}).join(','));

  console.log('\n== 3 · Rien n en paraît dans le Hub du client');
  const texteHub = await client.page.innerText('body');
  verifier(!/En ligne|Vu il y a|Historique des connexions|Jamais connecté/.test(texteHub), 'aucun mot de présence dans le Hub');
  verifier(!(await client.page.$('[data-presence], .presence-client')), 'aucune pastille de présence dans le Hub');

  /* Les refus qui suivent s'écrivent dans la console du SDK : on relève
     les erreurs du Hub avant eux. */
  const erreursHub = client.err.filter((e) => !/favicon|ERR_|net::/.test(e));
  console.log('\n== 4 · Le client ne lit ni n écrit ce qui ne lui revient pas');
  verifier(await essaiClient(client.page, { lire: `projets/atelier/presencesClient/${uidCamille}` }) === 'permission-denied', 'Camille ne relit pas sa propre présence');
  verifier(await essaiClient(client.page, { liste: 'projets/atelier/presencesClient' }) === 'permission-denied', 'ni la liste des présences de son projet');
  verifier(await essaiClient(client.page, { lire: `projets/boutique/presencesClient/${uidLea}` }) === 'permission-denied', 'ni la présence de Léa');
  verifier(await essaiClient(client.page, { liste: `journalConnexions/${uidCamille}/entrees` }) === 'permission-denied', 'ni son journal de connexions');
  verifier(await essaiClient(client.page, { ecrire: `projets/atelier/presencesClient/${uidLea}` }) === 'permission-denied', 'Camille n écrit pas une présence au nom de Léa');
  verifier(await essaiClient(client.page, { ecrire: `projets/boutique/presencesClient/${uidLea}` }) === 'permission-denied', 'ni sur le projet de Léa');
  const parServeur = await appelAdmin('historiqueConnexions', { projet: 'atelier', cle: cleEmail(CAMILLE) }, { email: CAMILLE });
  verifier(parServeur.code === 403, 'le serveur refuse l historique à Camille (403)', `${parServeur.code} ${parServeur.texte}`);
  const deLea = await appelAdmin('historiqueConnexions', { projet: 'boutique', cle: cleEmail(LEA) }, { email: CAMILLE });
  verifier(deLea.code === 403, 'et celui de Léa aussi', `${deLea.code}`);

  console.log('\n== 5 · Onglet caché : « Vu il y a », tout de suite');
  await client.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  verifier(await attendre(async () => /^Vu /.test(await libelle() || ''), 20), 'le Cockpit passe à « Vu … »', await libelle());
  verifier(/^Vu (à l'instant|il y a)/.test(await libelle() || ''), 'avec l âge du dernier battement', await libelle());
  await client.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  verifier(await attendre(async () => (await libelle()) === 'En ligne', 20), 'de retour au premier plan : « En ligne »', await libelle());

  console.log('\n== 6 · Un battement qui vieillit fait passer la pastille seule');
  await poserPresence('atelier', uidCamille, Date.now() - 3 * 3600 * 1000, true);
  verifier(await attendre(async () => (await libelle()) === 'Vu il y a 3 h', 40), 'un battement de 3 h : « Vu il y a 3 h »', await libelle());
  /* Juste sous le seuil : en ligne, puis plus rien n'arrive, et la minuterie
     du Cockpit la fait passer d'elle-même. Le Hub de Camille est fermé
     d'abord, pour qu'aucun battement ne vienne la rafraîchir. */
  await client.contexte.close();
  await pause(1500);
  await poserPresence('atelier', uidCamille, Date.now() - 100 * 1000, true);
  verifier(await attendre(async () => (await libelle()) === 'En ligne', 20), 'un battement de 100 s : encore « En ligne »', await libelle());
  verifier(await attendre(async () => /^Vu il y a \d+ min$/.test(await libelle() || ''), 60, 1000), 'sans rien de neuf, la pastille passe d elle-même à « Vu il y a … min »', await libelle());

  console.log('\n== 7 · L historique des connexions, dans le menu de la ligne');
  /* Une session reprise : un onglet neuf sur le Hub, sans passer par la
     porte. Le journal ne double pas une reprise de moins de cinq minutes
     sur le même appareil : on vieillit la dernière entrée d'abord. */
  const encore = await entrer(nav, CAMILLE);
  await fetch(bdd(`journalConnexions/${uidCamille}?updateMask.fieldPaths=dernier`), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { dernier: { mapValue: { fields: { le: { timestampValue: iso(Date.now() - 3600000) }, appareil: { stringValue: 'Mac · Chrome' }, mode: { stringValue: 'code' } } } } } }) });
  const onglet = await encore.contexte.newPage();
  await onglet.goto(`${SITE}/suivi/hub?emul`, { waitUntil: 'domcontentloaded' });
  const journal = await attendre(async () => {
    const j = await lire(`journalConnexions/${uidCamille}/entrees?pageSize=50`);
    const docs = (j && j.documents) || [];
    return docs.some((d) => str(d, 'mode') === 'reprise') ? docs : null;
  }, 30);
  verifier(Boolean(journal), 'l onglet rouvert est noté « reprise » par le serveur');
  const modes = ((journal || []).map((d) => str(d, 'mode'))).sort();
  verifier(modes.filter((m) => m === 'code').length >= 2, 'les deux connexions par code sont notées', modes.join(','));
  verifier((journal || []).every((d) => !champ(d, 'ip').stringValue && Object.keys(d.fields).sort().join(',') === 'appareil,le,mode'), 'chaque ligne : date, appareil, mode, et pas d adresse IP');
  await encore.contexte.close();

  await cockpit.click(`[data-action="acces-menu"][data-cle="${cleEmail(CAMILLE)}"]`);
  await cockpit.click('.menu button:has-text("Historique des connexions")');
  await cockpit.waitForSelector('#historique-connexions .liste', { timeout: 20000 });
  const texte = await cockpit.innerText('#historique-connexions');
  verifier(/Code reçu par e-mail/.test(texte), 'le mode « Code reçu par e-mail » s affiche');
  verifier(/Session reprise à l'ouverture/.test(texte), 'le mode « Session reprise » aussi');
  verifier(/Mac · Chrome/.test(texte), 'avec l appareil (Mac · Chrome)', texte.slice(0, 200));
  verifier(!/\d+\.\d+\.\d+\.\d+|127\.0\.0\.1/.test(texte), 'aucune adresse IP affichée');
  verifier(await cockpit.$$eval('#historique-connexions .liste > *', (l) => l.length) >= 3, 'trois lignes au moins, la plus récente en haut');

  console.log('\n== 8 · Le serveur garde l historique pour l équipe du projet seulement');
  const parAdmin = await appelAdmin('historiqueConnexions', { projet: 'atelier', cle: cleEmail(CAMILLE) });
  verifier(parAdmin.code === 200 && (parAdmin.json.entrees || []).length >= 3, 'l administrateur le lit', `${parAdmin.code}`);
  const croise = await appelAdmin('historiqueConnexions', { projet: 'boutique', cle: cleEmail(CAMILLE) });
  verifier(croise.code === 404, 'pas par un autre projet dont elle n est pas l interlocutrice (404)', `${croise.code}`);

  verifier(admin.err.filter((e) => !/favicon|ERR_|net::/.test(e)).length === 0, 'aucune erreur dans la console du cockpit', admin.err.join(' | '));
  verifier(erreursHub.length === 0, 'aucune erreur dans la console du Hub', erreursHub.join(' | '));
  await nav.close();
  console.log(`\n${soucis.length ? soucis.length + ' écart(s)' : 'Aucun écart.'}`);
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
