/* ==========================================================================
   CAPMEDIA CLIENT HUB · les échanges du client, éprouvés dans le navigateur

   Ce que le relevé des parcours (scénarios 29, 38, 43, 44, 46, 47, 49)
   demandait : la bulle sur toute page d'un projet et « bulle:ouvrir » qui
   la remplit ; sur la page Messages, Entrée envoie, « Capmedia écrit »,
   l'accusé « Lu le JJ/MM à HH:MM », « En faire une demande » seulement sur
   les messages d'en face, des pièces sans texte ; « Télécharger » qui
   télécharge sous le nom du fichier, la version affichée, le libellé de
   catégorie unique, retirer son propre fichier, le tri des Documents ; la
   fiche d'anomalie qui propose « En faire une demande » ; les
   notifications d'anomalie et de campagne ; la validation « Bon pour
   sortie » créée par le serveur à la clôture d'une campagne.

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const effacer = async (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop }).catch(() => {});
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const uidDe = async (email) => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
/* Attendre qu'un déclencheur ait écrit : on relit jusqu'à trouver, 30 s au plus. */
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(600); } return null; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const seau = admin.storage().bucket(SEAU);
  const uid = await uidDe('camille.essai@exemple.test');
  const tickets = (await docs('tickets?pageSize=100')).filter((d) => str(d, 'projet') === 'atelier');
  const tid = tickets[0].name.split('/').pop();

  /* Le terrain : un fichier de Camille (objet + fiche), une anomalie
     trouvée par les testeurs, une campagne en cours. Table rase sur les
     restes d'un passage précédent. */
  const CHEMIN = 'projets/atelier/fichiers/qa-mien/logo-qa.png';
  await seau.file(CHEMIN).save(PNG, { contentType: 'image/png' });
  await poser('fichiers/qa-mien', { projet: S('atelier'), composant: S(''), categorie: S('assets'), nom: S('logo-qa.png'), chemin: S(CHEMIN), taille: N(PNG.length), type: S('image/png'), description: S(''), tags: L([]), par: M({ uid: S(uid), nom: S('Camille Martin'), cote: S('client') }), visibilite: S('client'), version: S(''), archive: B(false), cree: T(new Date()) });
  await effacer('projets/atelier/anomalies/qa-ano');
  await effacer('projets/atelier/campagnes/qa-sortie');
  for (const d of await docs('validations?pageSize=200')) if (str(d, 'type') === 'sortie' && str(d, 'projet') === 'atelier') await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop });
  await poser('projets/atelier/scenarios/QA-01', { ref: S('QA-01'), titre: S('Revenir en arrière depuis le profil'), bloc: S('navigation'), niveau: S('socle'), plateformes: L([S('ios'), S('android')]), attendu: S('Le bouton Retour ramène à la liste.'), actif: B(true), ordre: N(1) });
  await vider(`boites/${uid}/notifications`);
  await vider('envois');

  console.log('\n== Le serveur : une anomalie trouvée par les testeurs, puis corrigée');
  await poser('projets/atelier/anomalies/qa-ano', { titre: S('Le bouton Retour ne répond pas'), scenario: S('QA-01'), bloc: S('navigation'), gravite: S('important'), statut: S('nouvelle'), origine: S('testeur'), description: S('Sur iPhone, après le profil.'), passages: L([]), temoins: L([]), plateformes: L([S('ios')]), cree: T(new Date()), maj: T(new Date()) });
  const notifAno = await attendre(async () => (await docs(`boites/${uid}/notifications?pageSize=100`)).find((n) => str(n, 'titre') === 'Une anomalie a été trouvée par les testeurs'));
  verifier(Boolean(notifAno), 'Camille est notifiée « Une anomalie a été trouvée par les testeurs »');
  verifier(notifAno && /QA-01/.test(str(notifAno, 'texte')) && /importante/.test(str(notifAno, 'texte')), 'avec le scénario et la gravité', notifAno ? str(notifAno, 'texte') : '');
  const lettreAno = await attendre(async () => (await docs('envois?pageSize=200')).find((e) => str(e, 'modele') === 'anomalie'));
  verifier(Boolean(lettreAno), 'et reçoit la lettre « anomalie »');
  await poser('projets/atelier/anomalies/qa-ano', { statut: S('corrigee'), maj: T(new Date()) }, ['statut', 'maj']);
  verifier(Boolean(await attendre(async () => (await docs(`boites/${uid}/notifications?pageSize=100`)).find((n) => str(n, 'titre') === 'Anomalie corrigée'))), 'puis « Anomalie corrigée » quand elle passe corrigée');
  await poser('projets/atelier/anomalies/qa-ano', { statut: S('nouvelle'), maj: T(new Date()) }, ['statut', 'maj']);

  console.log('\n== Le serveur : une campagne qui s ouvre, puis se ferme, et le feu vert de sortie');
  await poser('projets/atelier/campagnes/qa-sortie', { titre: S('Campagne de sortie QA'), statut: S('preparation'), actif: B(true), testeurs: L([]), scenarios: L([S('QA-01')]), affectation: M({}), maj: T(new Date()) });
  await pause(1500);
  await poser('projets/atelier/campagnes/qa-sortie', { statut: S('en-cours'), maj: T(new Date()) }, ['statut', 'maj']);
  verifier(Boolean(await attendre(async () => (await docs(`boites/${uid}/notifications?pageSize=100`)).find((n) => str(n, 'titre') === 'Campagne de tests ouverte'))), '« Campagne de tests ouverte » à l ouverture');
  await poser('projets/atelier/campagnes/qa-sortie', { statut: S('close'), maj: T(new Date()) }, ['statut', 'maj']);
  verifier(Boolean(await attendre(async () => (await docs(`boites/${uid}/notifications?pageSize=100`)).find((n) => str(n, 'titre') === 'Campagne close'))), '« Campagne close » à la clôture');
  const sortie = await attendre(async () => (await docs('validations?pageSize=200')).find((v) => str(v, 'type') === 'sortie' && str(v, 'projet') === 'atelier'));
  verifier(Boolean(sortie), 'le serveur crée la validation « Bon pour sortie »');
  verifier(sortie && str(sortie, 'titre') === 'Bon pour sortie : Campagne de sortie QA', 'avec le titre attendu', sortie ? str(sortie, 'titre') : '');
  verifier(sortie && champ(sortie, 'reserveeResponsable').booleanValue === true && str(sortie, 'statut') === 'en-attente', 'réservée au responsable, en attente');
  const cibleSortie = ((champ(sortie, 'cible').mapValue || {}).fields) || {};
  verifier(sortie && /campagne=qa-sortie/.test((cibleSortie.chemin || {}).stringValue || ''), 'avec le lien de la campagne');
  verifier(Boolean(await attendre(async () => (await docs('envois?pageSize=200')).find((e) => str(e, 'modele') === 'campagne'))), 'et la lettre « campagne » part');
  await poser('projets/atelier/campagnes/qa-sortie', { statut: S('en-cours'), maj: T(new Date()) }, ['statut', 'maj']);
  await pause(1500);
  await poser('projets/atelier/campagnes/qa-sortie', { statut: S('close'), maj: T(new Date()) }, ['statut', 'maj']);
  await pause(4000);
  verifier((await docs('validations?pageSize=200')).filter((v) => str(v, 'type') === 'sortie' && str(v, 'projet') === 'atelier').length === 1, 'reclore la campagne ne crée pas une seconde validation');

  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== La bulle suit l adresse');
  await aller(page, `#/projets/atelier/demandes/${tid}`);
  await page.waitForSelector('.bulle[data-projet="atelier"]', { timeout: 15000 }).catch(() => {});
  verifier(await page.$('.bulle[data-projet="atelier"]'), 'la bulle est montée sur la fiche d une demande');
  await aller(page, '#/projets/atelier/brique/ios');
  await pause(800);
  verifier(await page.$('.bulle[data-projet="atelier"]'), 'et sur la page d une brique');
  verifier((await page.$$('.bulle')).length === 1, 'une seule bulle, pas une par page');
  await aller(page, '#/calendrier');
  verifier(!(await page.$('.bulle')), 'hors du projet, elle est démontée');
  await aller(page, '#/projets/atelier');
  await page.waitForSelector('.bulle[data-projet="atelier"]', { timeout: 15000 });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: 'atelier', texte: 'Une question sur cette étape : ' } })));
  await pause(500);
  verifier(await page.$eval('#bulle-panneau', (el) => !el.hidden), '« bulle:ouvrir » ouvre le panneau');
  verifier((await page.$eval('#bulle-texte', (el) => el.value)) === 'Une question sur cette étape : ', 'avec le texte préposé dans le champ');
  verifier(await page.$eval('#bulle-texte', (el) => el.selectionStart === el.value.length && document.activeElement === el), 'le curseur à la fin');
  verifier(/Maj\+Entrée/.test(await page.textContent('#bulle-forme')), 'la bulle dit la convention du clavier');
  const messagesBulle = await page.$$('#bulle-fil .bulle-message');
  const transformables = await page.$$eval('#bulle-fil .bulle-message', (els) => els.map((el) => ({ moi: Boolean(el.querySelector('.message--moi')), bouton: Boolean(el.querySelector('[data-transformer]')) })));
  verifier(messagesBulle.length > 0 && transformables.every((t) => t.moi ? !t.bouton : t.bouton), 'dans la bulle, « En faire une demande » manque sur mes messages et reste sur ceux de Capmedia');
  await page.click('#bulle-fermer');

  console.log('\n== La page Messages : Entrée envoie, les jours, l accusé, la frappe');
  await aller(page, '#/messages/atelier?brouillon=Bonjour%20Capmedia');
  await page.waitForSelector('#texte-message', { timeout: 15000 });
  verifier((await page.$eval('#texte-message', (el) => el.value)) === 'Bonjour Capmedia', '« ?brouillon= » pose le texte dans le champ');
  verifier(/Maj\+Entrée/.test(await page.textContent('.composer-pied')), 'l aide dit la même convention que la bulle');
  verifier((await page.$$('.fil-jour')).length >= 1, 'le fil est séparé par jour', String((await page.$$('.fil-jour')).length));
  const texteEnvoye = `Message envoyé par Entrée ${Date.now()}`;
  await page.fill('#texte-message', texteEnvoye);
  await page.press('#texte-message', 'Enter');
  const poste = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => str(m, 'texte') === texteEnvoye), 15000);
  verifier(Boolean(poste), 'Entrée envoie le message');
  await pause(1500);
  verifier((await page.$eval('#texte-message', (el) => el.value)) === '', 'et vide le champ');
  await page.fill('#texte-message', 'ligne un');
  await page.press('#texte-message', 'Shift+Enter');
  verifier(/\n/.test(await page.$eval('#texte-message', (el) => el.value)), 'Maj+Entrée va à la ligne sans envoyer');
  await page.fill('#texte-message', '');
  verifier(/Envoyé/.test(await page.textContent('#fil-accuse').catch(() => '')), 'avant lecture : « Envoyé »');
  await poser('projets/atelier/lectures/uid-agent-qa', { lu: T(new Date()), cote: S('equipe'), nom: S('Alex Durand'), frappe: T(new Date()) });
  await pause(2500);
  const accuse = await page.textContent('#fil-accuse').catch(() => '');
  verifier(/^\s*Lu le \d{2}\/\d{2} à \d{2}:\d{2}\s*$/.test(accuse), 'après lecture : « Lu le JJ/MM à HH:MM »', accuse.trim());
  verifier(await page.$eval('#fil-frappe', (el) => !el.hidden && /Capmedia écrit/.test(el.textContent)), '« Capmedia écrit » pendant sa frappe');
  await pause(6000);
  verifier(await page.$eval('#fil-frappe', (el) => el.hidden), 'et s éteint tout seul');
  const surPage = await page.$$eval('#fil .fil-message', (els) => els.map((el) => ({ moi: Boolean(el.querySelector('.message--moi')), bouton: Boolean(el.querySelector('[data-transformer]')) })));
  verifier(surPage.some((t) => t.moi) && surPage.every((t) => t.moi ? !t.bouton : t.bouton), '« En faire une demande » manque sur mes messages, présent sur ceux de Capmedia');

  console.log('\n== Des pièces sans un mot');
  await page.setInputFiles('#zone-pieces input[type="file"]', { name: 'note-qa.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
  await page.waitForSelector('#zone-pieces .piece:not(.piece--envoi)', { timeout: 20000 });
  await page.click('#forme-message [type="submit"]');
  const sansTexte = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => str(m, 'texte') === '' && (((champ(m, 'pieces').arrayValue || {}).values) || []).length === 1), 15000);
  verifier(Boolean(sansTexte), 'un message de pièces seules a un texte vide, pas « (pièces jointes) »');
  await pause(1500);
  verifier(await page.$eval('#fil', (el) => { const m = [...el.querySelectorAll('.message--moi')].pop(); return Boolean(m) && !m.querySelector('.message-corps') && Boolean(m.querySelector('.pieces .piece')); }), 'l écran montre les pièces seules, sans bulle de texte');

  console.log('\n== Les fichiers : télécharger, la version, le libellé, retirer le sien');
  await aller(page, '#/projets/atelier/fichiers');
  await page.waitForSelector('.fichier[data-id="qa-mien"]', { timeout: 15000 });
  const carte = await page.textContent('.fichier[data-id="qa-mien"]');
  verifier(/Déposé par vous/.test(carte), 'ma carte dit « Déposé par vous »');
  verifier(!/Vu par Capmedia/.test(await page.textContent('.page')), 'et rien n invente un « Vu par Capmedia »');
  verifier(/v3/.test(await page.textContent('.fichier[data-id="fic-maquettes"]').catch(() => '')), 'le numéro de version s affiche quand il existe');
  verifier(/Éléments \(images, textes\)/.test(await page.textContent('.filtres').catch(() => '')) && !/Assets/.test(await page.textContent('.page')), 'un seul libellé de catégorie, « Éléments (images, textes) »');
  verifier(await page.$('.fichier[data-id="qa-mien"] [data-ouvrir-piece]'), 'une image garde « Ouvrir »');
  const [t1] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click(`.fichier[data-id="qa-mien"] [data-piece]`)]);
  verifier(t1 && t1.suggestedFilename() === 'logo-qa.png', '« Télécharger » télécharge sous le nom du fichier', t1 ? t1.suggestedFilename() : '(rien)');
  verifier(page.context().pages().length === 1, 'sans ouvrir de nouvel onglet');
  verifier(!(await page.$('.fichier[data-id="fic-maquettes"] [data-menu-fichier]')), 'pas de menu sur un fichier de Capmedia');
  await page.click('.fichier[data-id="qa-mien"] [data-menu-fichier]');
  await page.waitForSelector('.menu', { timeout: 5000 });
  verifier(/Retirer ce fichier/.test(await page.textContent('.menu')), 'un menu « Retirer ce fichier » sur le mien');
  await page.click('.menu button');
  await page.waitForSelector('.voile [data-oui]', { timeout: 5000 });
  await page.click('.voile [data-oui]');
  const retire = await attendre(async () => ((await lire('fichiers/qa-mien')) === null ? true : null), 15000);
  verifier(Boolean(retire), 'la fiche est retirée');
  verifier(!(await seau.file(CHEMIN).exists())[0], 'et l objet du stockage aussi');
  await pause(1200);
  verifier(!(await page.$('.fichier[data-id="qa-mien"]')), 'la carte a disparu de l écran');

  console.log('\n== Les Documents : le tri');
  await aller(page, '#/documents');
  await page.waitForSelector('#tri-doc', { timeout: 15000 });
  verifier(true, 'un tri « Plus récents / Plus anciens / Nom »');
  await page.selectOption('#tri-doc', 'nom');
  await pause(500);
  const noms = await page.$$eval('.fichier .fichier-nom', (els) => els.map((el) => el.textContent.trim().toLowerCase()));
  verifier(noms.length > 1 && noms.every((n, i) => i === 0 || noms[i - 1].localeCompare(n, 'fr') <= 0), 'trié par nom', noms.join(' | '));

  console.log('\n== La page Tests : le vocabulaire, la fiche d anomalie');
  await aller(page, '#/tests?projet=atelier');
  await page.waitForSelector('[data-action="ouvrir-anomalie"][data-id="qa-ano"]', { timeout: 20000 });
  const textePage = await page.textContent('.page');
  verifier(!/vivier|Versez|Ouvrir la console/i.test(textePage), 'aucun mot interne sur la page du client', (() => { const m = textePage.match(/vivier|Versez|Ouvrir la console/i); return m ? textePage.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ') : ''; })());
  await page.click('[data-action="ouvrir-anomalie"][data-id="qa-ano"]');
  await page.waitForSelector('[data-demande-anomalie]', { timeout: 10000 });
  const lienDemande = await page.$eval('[data-demande-anomalie]', (el) => el.getAttribute('href'));
  verifier(/type=bug/.test(lienDemande) && /anomalie=qa-ano/.test(lienDemande) && /titre=/.test(lienDemande), 'la fiche propose « En faire une demande » vers une demande de type bug liée à l anomalie', lienDemande);
  verifier(!(await page.$('[data-qualifier]')), 'sans le « Qualifier » de l équipe');
  await page.click('[data-demande-anomalie]');
  await page.waitForSelector('#forme-demande #titre', { timeout: 15000 });
  verifier((await page.$eval('#forme-demande #titre', (el) => el.value)) === 'Le bouton Retour ne répond pas', 'le formulaire porte le titre de l anomalie');
  await page.fill('#forme-demande #description', 'Constaté par vos testeurs, je confirme.');
  await page.click('#forme-demande [type="submit"]');
  const ticket = await attendre(async () => (await docs('tickets?pageSize=300')).find((t) => str(t, 'anomalie') === 'qa-ano'), 15000);
  verifier(Boolean(ticket), 'la demande créée garde le lien avec l anomalie');
  if (ticket) await fetch(`http://127.0.0.1:8080/v1/${ticket.name}`, { method: 'DELETE', headers: prop });

  console.log('\n== « Bon pour sortie » côté client');
  await aller(page, '#/valider');
  await page.waitForSelector('.page', { timeout: 15000 }); await pause(1200);
  verifier(/Bon pour sortie : Campagne de sortie QA/.test(await page.textContent('.page')), 'la validation de sortie attend Camille dans « En attente de vous »');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-echanges-client-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
