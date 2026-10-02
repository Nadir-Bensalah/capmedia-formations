/* ==========================================================================
   CAPMEDIA CLIENT HUB · les photos et les documents dans les messages

   Le défaut vu en production (01/10/2026) : le client joint une photo dans
   Messages et lit « Firebase Storage: User does not have permission... ».
   La règle Storage de la conversation relit le projet dans Firestore, et
   cette lecture répond 403 en production (rôle manquant au compte des
   règles). Les pièces de la conversation passent désormais par le serveur
   (suiviPieceMessage), qui vérifie qui envoie et qui lit.

   Ce que prouve cette suite :
   - le serveur : le client du projet et l'équipe envoient une photo et un
     PDF, et relisent ceux de l'autre, à l'octet près ; un client d'un autre
     projet, un testeur, une session absente sont refusés ; un chemin hors
     de la conversation ou un format refusé aussi ;
   - l'écran : le client joint une photo et un PDF dans Messages et dans la
     bulle, l'équipe aussi depuis le Cockpit, chacun ouvre la photo de
     l'autre ; un refus se dit en français, jamais avec le texte de Firebase.

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const PORTE = `${BANC.fonctions}/${PROJET}/europe-west1/suiviPieceMessage`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const piecesDe = (m) => ((champ(m, 'pieces').arrayValue || {}).values || []).map((v) => { const f = (v.mapValue || {}).fields || {}; return { nom: (f.nom || {}).stringValue, chemin: (f.chemin || {}).stringValue, type: (f.type || {}).stringValue }; });
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(500); } return null; };
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

/* Une vraie image (8 x 8, PNG) et un vrai PDF : l'écran doit pouvoir les ouvrir. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YJCAFTEMLQkA6qhUAdGXwP0AAAAASUVORK5CYII=', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n');

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

/* Envoyer et lire par la porte, au nom de quelqu'un ('' : sans session). */
const jetons = {};
const entete = async (email) => { if (!email) return {}; jetons[email] = jetons[email] || await jetonPour(email); return { Authorization: `Bearer ${jetons[email]}` }; };
const envoyer = async (email, projet, nom, type, corps) => {
  const r = await fetch(`${PORTE}?projet=${encodeURIComponent(projet)}&nom=${encodeURIComponent(nom)}&type=${encodeURIComponent(type)}`, { method: 'POST', headers: { ...(await entete(email)), 'Content-Type': 'application/octet-stream' }, body: corps });
  const texte = await r.text();
  let json = null; try { json = JSON.parse(texte); } catch (e) { /* un refus en clair */ }
  return { code: r.status, json, texte, type: r.headers.get('content-type') || '', nosniff: r.headers.get('x-content-type-options') || '' };
};
const lirePiece = async (email, chemin) => {
  const r = await fetch(`${PORTE}?chemin=${encodeURIComponent(chemin)}`, { headers: await entete(email) });
  const corps = Buffer.from(await r.arrayBuffer());
  return { code: r.status, type: r.headers.get('content-type') || '', corps, texte: r.status === 200 ? '' : corps.toString('utf8') };
};
const pareil = (a, b) => Buffer.compare(a, b) === 0;
const enClair = (t) => Boolean(t) && !/firebase|storage\/|permission to access|error/i.test(t);

/* Ouvrir une pièce d'un message : la photo s'ouvre dans un onglet (son
   contenu, lu par le serveur), le PDF dans un onglet ou en téléchargement
   selon le navigateur. Rend ce qui est arrivé. */
const ouvrirPiece = async (p, selecteur) => {
  const [arrivee] = await Promise.all([
    Promise.race([
      p.context().waitForEvent('page', { timeout: 15000 }).then(async (o) => { await o.waitForLoadState('load').catch(() => {}); await attendre(async () => /^blob:/.test(o.url()), 8000); return { onglet: o }; }),
      p.waitForEvent('download', { timeout: 15000 }).then((d) => ({ telechargement: d })),
    ]).catch(() => null),
    p.click(selecteur),
  ]);
  return arrivee || {};
};
/* Une photo de conversation se voit en vignette dans le fil, puis s'agrandit
   dans une fenêtre au clic : on attend l'image chargée, on clique, on lit. */
const vignetteVue = async (p, chemin) => {
  const sel = `#fil img[data-vignette="${chemin}"]`;
  const petite = await attendre(async () => p.evaluate((s) => { const i = document.querySelector(s); return Boolean(i && i.complete && i.naturalWidth > 0); }, sel), 20000);
  if (!petite) return { petite: false, grande: false };
  await p.click(`#fil [data-agrandir-piece="${chemin}"]`);
  const grande = await attendre(async () => p.evaluate(() => { const i = document.querySelector('.voile img.piece-agrandie'); return Boolean(i && i.complete && i.naturalWidth > 0); }), 15000);
  await p.keyboard.press('Escape'); await pause(500);
  return { petite: true, grande };
};
const imageVue = async (onglet) => onglet.evaluate(async () => {
  const img = document.querySelector('img');
  if (!img) return 0;
  if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
  return img.naturalWidth;
}).catch(() => 0);
const erreursAffichees = async (p) => p.$$eval('.toast--erreur span', (els) => els.map((e) => e.textContent));

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const seau = admin.storage().bucket(SEAU);
  await vider('audit');

  console.log('\n== Le serveur : le client du projet et l équipe envoient une photo et un PDF');
  const photoClient = await envoyer('camille.essai@exemple.test', 'atelier', 'capture écran.png', 'image/png', PNG);
  verifier(photoClient.code === 200 && /^projets\/atelier\/messages\/\d+-capture_ecran\.png$/.test((photoClient.json || {}).chemin || ''), 'la cliente envoie une photo, rangée dans la conversation de SON projet', JSON.stringify(photoClient.json || photoClient.texte));
  verifier(photoClient.json && photoClient.json.nom === 'capture écran.png' && photoClient.json.taille === PNG.length && photoClient.json.type === 'image/png', 'le serveur rend la fiche de la pièce, nom d origine compris');
  const pdfClient = await envoyer('camille.essai@exemple.test', 'atelier', 'cahier.pdf', 'application/pdf', PDF);
  verifier(pdfClient.code === 200, 'la cliente envoie un PDF');
  const photoEquipe = await envoyer('agent.essai@exemple.test', 'atelier', 'maquette.png', 'image/png', PNG);
  const pdfEquipe = await envoyer('agent.essai@exemple.test', 'atelier', 'devis.pdf', 'application/pdf', PDF);
  verifier(photoEquipe.code === 200 && pdfEquipe.code === 200, 'l équipe envoie une photo et un PDF');
  const cheminPhotoClient = (photoClient.json || {}).chemin || 'projets/atelier/messages/absent.png';
  const cheminPdfEquipe = (pdfEquipe.json || {}).chemin || 'projets/atelier/messages/absent.pdf';
  const [meta] = await seau.file(cheminPhotoClient).getMetadata().catch(() => [{}]);
  verifier(meta.contentType === 'image/png' && ((meta.metadata || {}).cote === 'client') && Boolean((meta.metadata || {}).par), 'l objet garde son type et la trace de qui l a déposé', JSON.stringify(meta.metadata || {}));

  console.log('\n== Le serveur : chacun relit les pièces de l autre');
  const a = await lirePiece('camille.essai@exemple.test', cheminPhotoClient);
  verifier(a.code === 200 && /image\/png/.test(a.type) && pareil(a.corps, PNG), 'la cliente relit sa photo, à l octet près', `${a.code} ${a.type}`);
  const b = await lirePiece('camille.essai@exemple.test', cheminPdfEquipe);
  verifier(b.code === 200 && /application\/pdf/.test(b.type) && pareil(b.corps, PDF), 'la cliente lit le PDF de l équipe');
  const c = await lirePiece('agent.essai@exemple.test', cheminPhotoClient);
  verifier(c.code === 200 && pareil(c.corps, PNG), 'l équipe lit la photo de la cliente');
  const c2 = await lirePiece('agent.essai@exemple.test', (pdfClient.json || {}).chemin || 'x');
  verifier(c2.code === 200 && pareil(c2.corps, PDF), 'l équipe lit le PDF de la cliente');

  console.log('\n== Le serveur : personne d autre');
  const lea1 = await envoyer('lea.essai@exemple.test', 'atelier', 'intrus.png', 'image/png', PNG);
  verifier(lea1.code === 403 && enClair(lea1.texte), 'une cliente d un autre projet ne dépose rien dans cette conversation', `${lea1.code} ${lea1.texte}`);
  const lea2 = await lirePiece('lea.essai@exemple.test', cheminPhotoClient);
  verifier(lea2.code === 403 && !pareil(lea2.corps, PNG), 'ni ne lit la photo de la cliente', `${lea2.code}`);
  const lea3 = await lirePiece('lea.essai@exemple.test', cheminPdfEquipe);
  verifier(lea3.code === 403, 'ni le PDF de l équipe');
  const leaChez = await envoyer('lea.essai@exemple.test', 'boutique', 'chez-moi.png', 'image/png', PNG);
  verifier(leaChez.code === 200 && /^projets\/boutique\/messages\//.test((leaChez.json || {}).chemin || ''), 'chez elle, dans son propre projet, elle dépose (le refus vient du projet, pas d une panne)');
  const camChez = await lirePiece('camille.essai@exemple.test', (leaChez.json || {}).chemin || 'projets/boutique/messages/x.png');
  verifier(camChez.code === 403, 'et la cliente de l atelier ne lit pas la pièce de la boutique');
  const k1 = await envoyer('karim.testeur@essai.test', 'atelier', 'testeur.png', 'image/png', PNG);
  const k2 = await lirePiece('karim.testeur@essai.test', cheminPhotoClient);
  verifier(k1.code === 403 && k2.code === 403, 'un testeur n envoie ni ne lit', `${k1.code} ${k2.code}`);
  const sans1 = await envoyer('', 'atelier', 'anonyme.png', 'image/png', PNG);
  const sans2 = await lirePiece('', cheminPhotoClient);
  verifier(sans1.code === 401 && sans2.code === 401, 'sans session : refusé');
  const faux = await fetch(`${PORTE}?chemin=${encodeURIComponent(cheminPhotoClient)}`, { headers: { Authorization: 'Bearer pas-un-jeton' } });
  verifier(faux.status === 401, 'un faux jeton : refusé');

  console.log('\n== Le serveur : rien hors de la conversation, rien d inattendu');
  const hors = await lirePiece('camille.essai@exemple.test', 'projets/atelier/pieces/d-qa/D-2026-014.pdf');
  verifier(hors.code === 400, 'un chemin hors de la conversation n est pas servi (pièces comptables)');
  const detour = await lirePiece('lea.essai@exemple.test', `projets/boutique/../${cheminPhotoClient.replace(/^projets\//, '')}`);
  verifier(detour.code === 400, 'un détour par « .. » est refusé');
  const sousDossier = await lirePiece('camille.essai@exemple.test', 'projets/atelier/messages/a/b.png');
  verifier(sousDossier.code === 400, 'un sous-dossier inventé est refusé');
  const exe = await envoyer('camille.essai@exemple.test', 'atelier', 'outil.exe', 'application/x-msdownload', PNG);
  verifier(exe.code === 400 && enClair(exe.texte), 'un format refusé par le dépôt est refusé par le serveur, en clair', exe.texte);
  const vide = await envoyer('camille.essai@exemple.test', 'atelier', 'vide.png', 'image/png', Buffer.alloc(0));
  verifier(vide.code === 400, 'un fichier vide est refusé');
  const gros = await envoyer('camille.essai@exemple.test', 'atelier', 'gros.png', 'image/png', Buffer.alloc(10 * 1024 * 1024 + 1, 1));
  verifier(gros.code === 413 && /10 Mo/.test(gros.texte), 'une image de plus de 10 Mo est refusée', `${gros.code} ${gros.texte}`);
  const projetFaux = await envoyer('camille.essai@exemple.test', 'atelier/../boutique', 'x.png', 'image/png', PNG);
  verifier(projetFaux.code === 400, 'un identifiant de projet bricolé est refusé');

  console.log('\n== Le serveur : un refus est du texte brut, jamais une page');
  const piege = await envoyer('camille.essai@exemple.test', 'atelier', '<img src=x onerror=alert(1)>.exe', 'application/x-msdownload', PNG);
  verifier(piege.code === 400 && /^text\/plain/.test(piege.type) && piege.nosniff === 'nosniff', 'un refus qui recopie le nom du fichier part en text/plain, nosniff', `${piege.code} ${piege.type} ${piege.nosniff}`);
  const piegeLecture = await lirePiece('lea.essai@exemple.test', cheminPhotoClient);
  verifier(/^text\/plain/.test(piegeLecture.type), 'un refus de lecture aussi', piegeLecture.type);
  const sansJeton = await fetch(`${PORTE}?chemin=x`);
  verifier(/^text\/plain/.test(sansJeton.headers.get('content-type') || ''), 'et le refus sans session aussi', sansJeton.headers.get('content-type') || '');

  console.log('\n== Le serveur : un plafond de dépôts par personne et par jour');
  const uidCamille = (await admin.auth().getUserByEmail('camille.essai@exemple.test')).uid;
  const compteur = admin.firestore().doc(`depotsPieces/${uidCamille}_${new Date().toISOString().slice(0, 10)}`);
  const lu = (await compteur.get()).data() || {};
  verifier(lu.fichiers === 2 && lu.octets === PNG.length + PDF.length, 'le serveur compte les dépôts acceptés de la journée, et eux seuls', JSON.stringify({ fichiers: lu.fichiers, octets: lu.octets }));
  const jC = await jetonPour('camille.essai@exemple.test');
  const statutDoc = async (methode, jeton) => (await fetch(`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/depotsPieces/${uidCamille}_${new Date().toISOString().slice(0, 10)}${methode === 'PATCH' ? '?updateMask.fieldPaths=fichiers' : ''}`, { method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, ...(methode === 'PATCH' ? { body: JSON.stringify({ fields: { fichiers: { integerValue: '0' } } }) } : {}) })).status;
  verifier(await statutDoc('GET', jC) === 403 && await statutDoc('PATCH', jC) === 403, 'la cliente ne lit ni ne remet à zéro son compteur (403)');
  await compteur.set({ fichiers: 200 }, { merge: true });
  const avantPlafond = (await seau.getFiles({ prefix: 'projets/atelier/messages/' }))[0].length;
  const trop = await envoyer('camille.essai@exemple.test', 'atelier', 'un-de-trop.png', 'image/png', PNG);
  verifier(trop.code === 429 && /200 fichiers/.test(trop.texte) && /demain/.test(trop.texte) && enClair(trop.texte), 'au 201e fichier du jour : refusé, avec un message clair', `${trop.code} ${trop.texte}`);
  verifier(/^text\/plain/.test(trop.type), 'en texte brut');
  verifier((await seau.getFiles({ prefix: 'projets/atelier/messages/' }))[0].length === avantPlafond, 'et rien n est écrit dans le stockage');
  await compteur.set({ fichiers: 3, octets: 1024 * 1024 * 1024 - 10 }, { merge: true });
  const tropLourd = await envoyer('camille.essai@exemple.test', 'atelier', 'lourd.png', 'image/png', PNG);
  verifier(tropLourd.code === 429 && /1 Go/.test(tropLourd.texte), 'au-delà de 1 Go dans la journée : refusé aussi', `${tropLourd.code} ${tropLourd.texte}`);
  const autre = await envoyer('agent.essai@exemple.test', 'atelier', 'equipe-libre.png', 'image/png', PNG);
  verifier(autre.code === 200, 'le plafond est par personne : l équipe dépose toujours');
  await compteur.delete();
  const repris = await envoyer('camille.essai@exemple.test', 'atelier', 'apres-plafond.png', 'image/png', PNG);
  verifier(repris.code === 200, 'le compteur remis (le jour suivant), la cliente dépose de nouveau');
  await compteur.delete();
  await vider('audit');
  await envoyer('lea.essai@exemple.test', 'atelier', 'intrus.png', 'image/png', PNG);
  await lirePiece('lea.essai@exemple.test', cheminPhotoClient);

  const traces = await docs('audit?pageSize=200');
  verifier(traces.some((t) => str(t, 'action') === 'piece-message.refusee' && str(t, 'geste') === 'envoi') && traces.some((t) => str(t, 'action') === 'piece-message.refusee' && str(t, 'geste') === 'lecture'), 'chaque refus laisse une trace');

  const nav = await chromium.launch();
  const contexte = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page = await contexte.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== La cliente, dans Messages : une photo et un PDF');
  await connecter(page, 'camille.essai@exemple.test');
  await aller(page, '#/messages/atelier');
  await page.waitForSelector('#zone-pieces input[type="file"]', { timeout: 20000 });
  await page.setInputFiles('#zone-pieces input[type="file"]', [
    { name: 'photo-chantier.png', mimeType: 'image/png', buffer: PNG },
    { name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF },
  ]);
  const deux = await attendre(async () => (await page.$$('#zone-pieces .piece:not(.piece--envoi)')).length === 2, 20000);
  verifier(deux, 'les deux pièces sont jointes, sans erreur', JSON.stringify(await erreursAffichees(page)));
  verifier((await erreursAffichees(page)).length === 0, 'aucun message d erreur à l écran');
  await page.fill('#texte-message', 'Voici la photo et le plan.');
  await page.click('#forme-message [type="submit"]');
  const message = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => str(m, 'texte') === 'Voici la photo et le plan.'), 15000);
  const pieces = message ? piecesDe(message) : [];
  verifier(pieces.length === 2 && pieces.every((p) => /^projets\/atelier\/messages\/[^/]+$/.test(p.chemin)), 'le message part avec ses deux pièces, rangées dans la conversation du projet', JSON.stringify(pieces));
  const photo = pieces.find((p) => p.type === 'image/png');
  const plan = pieces.find((p) => p.type === 'application/pdf');
  const [objPhoto] = photo ? await seau.file(photo.chemin).download().catch(() => [Buffer.alloc(0)]) : [Buffer.alloc(0)];
  verifier(pareil(objPhoto, PNG), 'la photo est bien dans le stockage, entière');
  const vue1 = await vignetteVue(page, photo ? photo.chemin : 'x');
  verifier(vue1.petite, 'la cliente voit sa photo en vignette dans le fil, pas un nom de fichier');
  verifier(vue1.grande, 'et la photo s agrandit dans une fenêtre au clic');
  const vue2 = await ouvrirPiece(page, `#fil [data-ouvrir-piece="${plan ? plan.chemin : 'x'}"]`);
  verifier(Boolean(vue2.onglet || vue2.telechargement), 'elle rouvre son PDF');
  if (vue2.onglet) await vue2.onglet.close();
  verifier((await erreursAffichees(page)).length === 0, 'toujours aucun message d erreur');

  console.log('\n== La cliente, dans la bulle d une page du projet');
  await aller(page, '#/projets/atelier');
  await page.waitForSelector('.bulle[data-projet="atelier"]', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: 'atelier', texte: '' } })));
  await page.waitForSelector('#bulle-pieces input[type="file"]', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.setInputFiles('#bulle-pieces input[type="file"]', { name: 'bulle.png', mimeType: 'image/png', buffer: PNG });
  const dansBulle = await attendre(async () => (await page.$$('#bulle-pieces .piece:not(.piece--envoi)')).length === 1, 20000);
  verifier(dansBulle && (await erreursAffichees(page)).length === 0, 'la bulle joint une photo aussi, sans erreur', JSON.stringify(await erreursAffichees(page)));
  await page.fill('#bulle-texte', 'Depuis la bulle.');
  await page.press('#bulle-texte', 'Enter');
  const parBulle = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => str(m, 'texte') === 'Depuis la bulle.'), 15000);
  verifier(parBulle && piecesDe(parBulle).length === 1 && /^projets\/atelier\/messages\//.test(piecesDe(parBulle)[0].chemin), 'et l envoie avec son message');

  console.log('\n== L équipe, dans le Cockpit');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  await connecter(equipe, 'agent.essai@exemple.test');
  await aller(equipe, '#/messages/atelier');
  const vue3 = await vignetteVue(equipe, photo ? photo.chemin : 'x');
  verifier(vue3.petite && vue3.grande, 'l équipe voit la photo de la cliente en vignette, et l agrandit');
  await equipe.setInputFiles('#zone-pieces input[type="file"]', [
    { name: 'retour-equipe.png', mimeType: 'image/png', buffer: PNG },
    { name: 'compte-rendu.pdf', mimeType: 'application/pdf', buffer: PDF },
  ]);
  const deuxEquipe = await attendre(async () => (await equipe.$$('#zone-pieces .piece:not(.piece--envoi)')).length === 2, 20000);
  verifier(deuxEquipe && (await erreursAffichees(equipe)).length === 0, 'l équipe joint une photo et un PDF, sans erreur');
  await equipe.fill('#texte-message', 'Notre retour en pièces jointes.');
  await equipe.click('#forme-message [type="submit"]');
  const retour = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => str(m, 'texte') === 'Notre retour en pièces jointes.'), 15000);
  const piecesEquipe = retour ? piecesDe(retour) : [];
  verifier(piecesEquipe.length === 2, 'le message de l équipe part avec ses deux pièces');

  console.log('\n== La cliente relit les pièces de l équipe');
  const photoEq = piecesEquipe.find((p) => p.type === 'image/png');
  const pdfEq = piecesEquipe.find((p) => p.type === 'application/pdf');
  await aller(page, '#/messages/atelier');
  const vue4 = await vignetteVue(page, photoEq ? photoEq.chemin : 'x');
  verifier(vue4.petite && vue4.grande, 'la cliente voit la photo de l équipe en vignette, et l agrandit');
  const vue5 = await ouvrirPiece(page, `#fil [data-ouvrir-piece="${pdfEq ? pdfEq.chemin : 'x'}"]`);
  verifier(Boolean(vue5.onglet || vue5.telechargement), 'et le PDF de l équipe');
  if (vue5.onglet) await vue5.onglet.close();

  console.log('\n== Un refus se dit en français');
  /* Le pire cas : une réponse qui porterait le texte brut de Firebase (celui
     vu en production). L'écran le remplace par une phrase. */
  await page.route(/suiviPieceMessage\?projet=/, (r) => r.fulfill({ status: 403, contentType: 'text/plain', body: "Firebase Storage: User does not have permission to access 'projets/atelier/messages/x.png'. (storage/unauthorized)" }));
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.setInputFiles('#zone-pieces input[type="file"]', { name: 'refusee.png', mimeType: 'image/png', buffer: PNG });
  const refus = await attendre(async () => (await erreursAffichees(page))[0], 15000);
  verifier(refus && enClair(refus) && /refusee\.png/.test(refus), 'le refus s affiche en français, avec le nom du fichier', refus || '(rien)');
  verifier(!(await page.$$eval('.toast', (els) => els.some((e) => /Firebase|storage\/|permission/.test(e.textContent)))), 'aucun texte brut de Firebase à l écran');
  verifier((await page.$$('#zone-pieces .piece')).length === 0, 'la pièce refusée ne reste pas dans la liste');
  await page.unroute(/suiviPieceMessage\?projet=/);
  /* Et le vrai refus du serveur, pour une pièce d'un autre projet ouverte à la main. */
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.evaluate((c) => { const a = document.createElement('a'); a.href = '#'; a.dataset.piece = c; a.dataset.nom = 'x.png'; a.textContent = 'x.png'; document.querySelector('#fil').appendChild(a); a.click(); }, (leaChez.json || {}).chemin || 'projets/boutique/messages/x.png');
  const refusLecture = await attendre(async () => (await erreursAffichees(page))[0], 15000);
  verifier(refusLecture && enClair(refusLecture), 'une pièce d un autre projet : refusée, en français', refusLecture || '(rien)');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-pieces-messages-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
