/* ==========================================================================
   CAPMEDIA CLIENT HUB · une demande ouverte depuis le Cockpit

   Le défaut vu en production (06/10/2026) : depuis le Cockpit, joindre une
   capture à une nouvelle demande affichait « … n'a pas pu être joint :
   vous n'avez pas accès à ce dossier » (storage/unauthorized). Les pièces
   des demandes passent désormais par le serveur (suiviPieceMessage), comme
   celles de la conversation ; une pièce de note interne y est marquée
   « interne » et n'est jamais remise au client. Le formulaire, ouvert par
   l'équipe, ne parle plus comme au client et dit qui a constaté le
   problème (« constatePar », posé par l'équipe seule).

   Ce que prouve cette suite :
   - le serveur : l'équipe et le client déposent une pièce de demande, chacun
     relit celle de l'autre ; une pièce interne est refusée au client (403),
     une pièce « client » lui est servie ; le marquage est réservé à
     l'équipe ; un client ne pose pas « interne » ; un client d'un autre
     projet ne dépose ni ne lit ; une demande d'un autre projet n'accueille
     rien ; une ancienne pièce interne (déposée avant, sans le serveur)
     reste refusée au client ;
   - l'écran : depuis le Cockpit, une image jointe à une NOUVELLE demande
     part par le serveur et la demande la porte, lisible par l'équipe et le
     client ; le formulaire de l'équipe ne dit plus « Dites-nous… » et
     demande « Qui l'a constaté ? », celui du client garde son texte ;
     « iPhone et Android » et « Application mobile (iPhone et Android) »
     sont proposés sur un projet iOS + Android, et la demande porte
     plateforme « mobile » ; une note interne avec pièce, et une pièce
     remise « client » en changeant de mode avant l'envoi ;
   - les règles : un client n'écrit pas « constatePar », l'équipe oui ;
   - les lettres : une demande ouverte par l'équipe n'alerte pas l'équipe ;
     celle d'un client, oui, même s'il se dit « equipe ».

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour, uidDe } = require('./lib/session-banc.cjs');
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
const sous = (d, n, m) => ((((champ(d, n).mapValue || {}).fields) || {})[m]) || {};
const piecesDe = (m) => ((champ(m, 'pieces').arrayValue || {}).values || []).map((v) => { const f = (v.mapValue || {}).fields || {}; return { nom: (f.nom || {}).stringValue, chemin: (f.chemin || {}).stringValue, type: (f.type || {}).stringValue }; });
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(500); } return null; };
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: v }); const NUL = { nullValue: null };
const M = (fields) => ({ mapValue: { fields } }); const L = (values = []) => ({ arrayValue: values.length ? { values } : {} });
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
const aller = async (page, hash, selecteur, ms = 20000) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(selecteur, { timeout: ms }); await pause(800); };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YJCAFTEMLQkA6qhUAdGXwP0AAAAASUVORK5CYII=', 'base64');

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

/* La porte, au nom de quelqu'un. */
const jetons = {};
const entete = async (email) => { if (!email) return {}; jetons[email] = jetons[email] || await jetonPour(email); return { Authorization: `Bearer ${jetons[email]}` }; };
const deposer = async (email, projet, ticket, nom, { interne = false } = {}) => {
  const r = await fetch(`${PORTE}?projet=${encodeURIComponent(projet)}&ticket=${encodeURIComponent(ticket)}&nom=${encodeURIComponent(nom)}&type=image%2Fpng${interne ? '&interne=1' : ''}`, { method: 'POST', headers: { ...(await entete(email)), 'Content-Type': 'application/octet-stream' }, body: PNG });
  const texte = await r.text(); let json = null; try { json = JSON.parse(texte); } catch (e) { /* un refus en clair */ }
  return { code: r.status, json, texte };
};
const lirePiece = async (email, chemin) => {
  const r = await fetch(`${PORTE}?chemin=${encodeURIComponent(chemin)}`, { headers: await entete(email) });
  const corps = Buffer.from(await r.arrayBuffer());
  return { code: r.status, corps };
};
const marquer = async (email, chemin, visibilite) => (await fetch(`${PORTE}?geste=marquer&chemin=${encodeURIComponent(chemin)}&visibilite=${visibilite}`, { method: 'POST', headers: await entete(email) })).status;
const pareil = (a, b) => Buffer.compare(a, b) === 0;
const erreursAffichees = async (p) => p.$$eval('.toast--erreur span', (els) => els.map((e) => e.textContent));

/* Une demande écrite par REST, au nom d'une personne (les règles jugent). */
const creerParRest = async (email, uid, cote, titre, extra = {}) => {
  const fields = {
    numero: NUL, projet: S('atelier'), composant: S(''), titre: S(titre), description: S('Écrite par REST.'), type: S('bug'), urgence: S('important'),
    statut: S('nouveau'), plateforme: S('mobile'), version: S(''), etapes: S(''), attendu: S(''), obtenu: S(''), contexte: S(''), appareil: S(''),
    liens: L(), assigne: NUL, auteur: M({ uid: S(uid), nom: S(email), email: S(email), cote: S(cote) }), pieces: L(), archive: B(false),
    resolu: NUL, qualification: NUL, devis: NUL, lu: M({}), ...extra,
  };
  const r = await fetch(bdd('tickets'), { method: 'POST', headers: { ...(await entete(email)), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  const j = await r.json().catch(() => ({}));
  return { code: r.status, id: String(j.name || '').split('/').pop() };
};
/* Les lettres « ticket-cree » d'une demande, par titre et par côté. Celle
   du client attend son regroupement (envoisEnAttente, regroupement.js) :
   on la cherche là aussi. */
const lettres = async (titre, cote) => [...await docs('envois?pageSize=300'), ...await docs('envoisEnAttente?pageSize=300')]
  .filter((d) => str(d, 'modele') === 'ticket-cree' && sous(d, 'variables', 'titre').stringValue === titre && sous(d, 'variables', 'cote').stringValue === cote);

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const seau = admin.storage().bucket(SEAU);
  const CAMILLE = 'camille.essai@exemple.test'; const EQUIPE = 'agent.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const uidCamille = await uidDe(CAMILLE); const uidEquipe = await uidDe(EQUIPE);
  const metaDe = async (chemin) => ((await seau.file(chemin).getMetadata().catch(() => [{}]))[0].metadata || {});

  console.log('\n== Le serveur : une pièce de demande, déposée et relue');
  const eqNouveau = await deposer(EQUIPE, 'atelier', 'nouveau', 'capture equipe.png');
  verifier(eqNouveau.code === 200 && /^projets\/atelier\/tickets\/nouveau\/\d+-capture_equipe\.png$/.test((eqNouveau.json || {}).chemin || ''), 'l équipe dépose une capture pour une demande pas encore créée', `${eqNouveau.code} ${eqNouveau.texte}`);
  const cheminEqNouveau = (eqNouveau.json || {}).chemin || 'projets/atelier/tickets/nouveau/absent.png';
  const mEq = await metaDe(cheminEqNouveau);
  verifier(mEq.cote === 'equipe' && mEq.visibilite === 'client' && mEq.par === uidEquipe, 'rangée par le serveur, au nom de l équipe, visible du client', JSON.stringify(mEq));
  const clVeille = await deposer(CAMILLE, 'atelier', 't-veille', 'preuve.png');
  verifier(clVeille.code === 200 && /^projets\/atelier\/tickets\/t-veille\//.test((clVeille.json || {}).chemin || ''), 'la cliente dépose une pièce sous SA demande', `${clVeille.code} ${clVeille.texte}`);
  const cheminClVeille = (clVeille.json || {}).chemin || 'projets/atelier/tickets/t-veille/absent.png';
  const r1 = await lirePiece(CAMILLE, cheminEqNouveau);
  const r2 = await lirePiece(EQUIPE, cheminClVeille);
  verifier(r1.code === 200 && pareil(r1.corps, PNG) && r2.code === 200 && pareil(r2.corps, PNG), 'chacun relit la pièce de l autre, à l octet près', `${r1.code} ${r2.code}`);

  console.log('\n== Le serveur : une pièce de note interne ne sort pas vers le client');
  const interne = await deposer(EQUIPE, 'atelier', 't-veille', 'note interne.png', { interne: true });
  const cheminInterne = (interne.json || {}).chemin || 'projets/atelier/tickets/t-veille/absent-interne.png';
  verifier(interne.code === 200 && (await metaDe(cheminInterne)).visibilite === 'interne', 'l équipe dépose une pièce marquée « interne »', `${interne.code} ${JSON.stringify(await metaDe(cheminInterne))}`);
  const refusInterne = await lirePiece(CAMILLE, cheminInterne);
  verifier(refusInterne.code === 403 && !pareil(refusInterne.corps, PNG), 'la cliente ne la lit pas (403)', `${refusInterne.code}`);
  verifier((await lirePiece(EQUIPE, cheminInterne)).code === 200, 'l équipe la lit');
  const publique = await deposer(EQUIPE, 'atelier', 't-veille', 'reponse.png');
  const cheminPublique = (publique.json || {}).chemin || 'projets/atelier/tickets/t-veille/absent-publique.png';
  const luePublique = await lirePiece(CAMILLE, cheminPublique);
  verifier(luePublique.code === 200 && pareil(luePublique.corps, PNG), 'une pièce « client » de l équipe lui est servie');
  verifier(await marquer(EQUIPE, cheminPublique, 'interne') === 200 && (await lirePiece(CAMILLE, cheminPublique)).code === 403, 'marquée « interne » par l équipe : la cliente ne la lit plus');
  verifier(await marquer(EQUIPE, cheminPublique, 'client') === 200 && (await lirePiece(CAMILLE, cheminPublique)).code === 200, 'remise « client » : elle la relit');
  /* Une pièce d'avant le serveur, déposée directement dans le stockage
     avec la marque « interne » des règles Storage. */
  const ancienne = 'projets/atelier/tickets/t-veille/1700000000000-ancienne_note.png';
  await seau.file(ancienne).save(PNG, { resumable: false, contentType: 'image/png', metadata: { metadata: { visibilite: 'interne' } } });
  verifier((await lirePiece(CAMILLE, ancienne)).code === 403 && (await lirePiece(EQUIPE, ancienne)).code === 200, 'une ancienne pièce interne, déposée sans le serveur, reste refusée au client');

  console.log('\n== Le serveur : le client ne pose ni « interne » ni marque');
  const clInterne = await deposer(CAMILLE, 'atelier', 't-veille', 'se-dit-interne.png', { interne: true });
  const cheminClInterne = (clInterne.json || {}).chemin || 'projets/atelier/tickets/t-veille/absent-cl.png';
  verifier(clInterne.code === 200 && (await metaDe(cheminClInterne)).visibilite === 'client', 'un client qui demande « interne=1 » dépose une pièce « client » (la marque est ignorée)', JSON.stringify(await metaDe(cheminClInterne)));
  verifier(await marquer(CAMILLE, cheminPublique, 'interne') === 403 && (await metaDe(cheminPublique)).visibilite === 'client', 'un client ne marque pas une pièce (403), la marque ne bouge pas');
  verifier(await marquer(CAMILLE, cheminInterne, 'client') === 403 && (await lirePiece(CAMILLE, cheminInterne)).code === 403, 'ni ne rend publique une pièce interne');
  verifier(await marquer(EQUIPE, 'projets/atelier/messages/x.png', 'interne') === 400, 'une pièce hors d une demande ne se marque pas');

  console.log('\n== Le serveur : personne d autre, nulle part ailleurs');
  const lea1 = await deposer(LEA, 'atelier', 'nouveau', 'intrus.png');
  const lea2 = await deposer(LEA, 'atelier', 't-veille', 'intrus.png');
  verifier(lea1.code === 403 && lea2.code === 403, 'une cliente d un autre projet ne dépose rien sur cette demande', `${lea1.code} ${lea2.code}`);
  verifier((await lirePiece(LEA, cheminClVeille)).code === 403 && (await lirePiece(LEA, cheminPublique)).code === 403, 'ni ne lit ses pièces');
  const avant = (await seau.getFiles({ prefix: 'projets/atelier/tickets/t-boutique/' }))[0].length + (await seau.getFiles({ prefix: 'projets/boutique/tickets/t-veille/' }))[0].length;
  const detourne1 = await deposer(CAMILLE, 'atelier', 't-boutique', 'detour.png');
  verifier(detourne1.code === 403, 'la cliente de l atelier ne range rien sous la demande de la boutique (ticket d un autre projet)', `${detourne1.code} ${detourne1.texte}`);
  const detourne2 = await deposer(LEA, 'boutique', 't-veille', 'detour.png');
  verifier(detourne2.code === 403, 'ni la cliente de la boutique sous une demande de l atelier, depuis son propre projet', `${detourne2.code} ${detourne2.texte}`);
  const detourne3 = await deposer(EQUIPE, 'boutique', 't-veille', 'detour.png');
  verifier(detourne3.code === 403, 'l équipe non plus : la demande doit appartenir au projet nommé', `${detourne3.code}`);
  verifier((await deposer(CAMILLE, 'atelier', 'pas-une-demande', 'x.png')).code === 403, 'une demande qui n existe pas n accueille rien');
  verifier((await deposer(CAMILLE, 'atelier', '../messages', 'x.png')).code === 400, 'un identifiant de demande bricolé est refusé');
  const apres = (await seau.getFiles({ prefix: 'projets/atelier/tickets/t-boutique/' }))[0].length + (await seau.getFiles({ prefix: 'projets/boutique/tickets/t-veille/' }))[0].length;
  verifier(apres === avant, 'et rien n est écrit dans le stockage');
  const chezElle = await deposer(LEA, 'boutique', 't-boutique', 'chez-moi.png');
  verifier(chezElle.code === 200, 'chez elle, sous sa propre demande, elle dépose (le refus vient du projet, pas d une panne)');

  console.log('\n== Les règles : « constatePar » est posé par l équipe seule');
  const regleClient = await creerParRest(CAMILLE, uidCamille, 'client', 'Constatée par moi-même', { constatePar: M({ nom: S('Camille Martin'), email: S(CAMILLE) }) });
  verifier(regleClient.code === 403, 'un client n écrit pas « constatePar » (refusé par les règles)', `${regleClient.code}`);
  const regleClientSans = await creerParRest(CAMILLE, uidCamille, 'client', 'Demande mobile de la cliente');
  verifier(regleClientSans.code === 200, 'sans lui, la même demande passe (plateforme « mobile » comprise)', `${regleClientSans.code}`);
  const regleEquipe = await creerParRest(EQUIPE, uidEquipe, 'equipe', 'Constatée par Camille, saisie par l équipe', { constatePar: M({ nom: S('Camille Martin'), email: S(CAMILLE) }) });
  verifier(regleEquipe.code === 200, 'l équipe l écrit', `${regleEquipe.code}`);
  const regleEquipeFaux = await creerParRest(EQUIPE, uidEquipe, 'equipe', 'Constatée par personne', { constatePar: M({ nom: S(''), email: S('') }) });
  verifier(regleEquipeFaux.code === 403, 'mais jamais sans nom');

  console.log('\n== Les lettres : la cliente qui se dit « equipe » alerte quand même l équipe');
  const spoof = await creerParRest(CAMILLE, uidCamille, 'equipe', 'Se dit équipe pour se taire');
  verifier(spoof.code === 200, 'les règles laissent passer le côté écrit par le navigateur', `${spoof.code}`);
  verifier(Boolean(await attendre(async () => (await lettres('Se dit équipe pour se taire', 'equipe')).length > 0, 30000)), 'l équipe reçoit son alerte : le serveur relit la fiche d équipe, il ne croit pas le navigateur');
  verifier(Boolean(await attendre(async () => (await lettres('Demande mobile de la cliente', 'equipe')).length > 0, 30000)), 'une demande d un client alerte l équipe');

  const nav = await chromium.launch();
  const ctxEquipe = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctxEquipe.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== Le Cockpit : le formulaire parle à l équipe');
  await connecter(page, EQUIPE);
  await aller(page, '#/projets/atelier/nouvelle-demande', '#forme-demande');
  const pageEquipe = await page.textContent('.page');
  verifier(!/Dites-nous ce dont vous avez besoin/.test(pageEquipe), 'plus de « Dites-nous ce dont vous avez besoin »');
  verifier(/Qui l'a constaté \?/.test(pageEquipe) && Boolean(await page.$('#constatePar')), '« Qui l a constaté ? » est demandé');
  const temoins = await page.$$eval('#constatePar option', (els) => els.map((e) => e.textContent.trim()));
  verifier(temoins[0] === "L'équipe Capmedia" && temoins.includes('Camille Martin'), 'au choix : l équipe, ou un interlocuteur du projet', temoins.join(' | '));
  verifier(/Quelle partie du projet est en cause \?/.test(pageEquipe) && /Sur quoi l'a-t-on constaté \?/.test(pageEquipe), 'les libellés de la partie et de la plateforme');

  console.log('\n== Le Cockpit : iPhone et Android, ensemble');
  const etiquetteMobile = await page.$eval('input[name="plateforme"][value="mobile"]', (el) => el.closest('label').textContent.trim()).catch(() => '');
  verifier(etiquetteMobile === 'iPhone et Android', 'la plateforme « iPhone et Android » est proposée sur un projet iOS + Android', etiquetteMobile || '(absente)');
  const partieMobile = await page.$eval('#composant option[value="mobile"]', (el) => el.textContent.trim()).catch(() => '');
  verifier(partieMobile === 'Application mobile (iPhone et Android)', 'comme la partie « Application mobile (iPhone et Android) »', partieMobile || '(absente)');
  if (await page.$('#composant option[value="mobile"]')) await page.selectOption('#composant', 'mobile');
  await pause(300);
  verifier(await page.isChecked('input[name="plateforme"][value="mobile"]'), 'choisir la partie propose la plateforme qui va avec');

  console.log('\n== Le Cockpit : une capture jointe à une NOUVELLE demande');
  const TITRE = 'Le bouton Valider ne répond plus sur mobile';
  await page.selectOption('#constatePar', { label: 'Camille Martin' });
  await page.fill('#titre', TITRE);
  await page.fill('#description', 'Camille nous l a dit au téléphone ce matin.');
  await page.setInputFiles('#zone-pieces input[type="file"]', { name: 'capture-cockpit.png', mimeType: 'image/png', buffer: PNG });
  const jointe = await attendre(async () => (await page.$$('#zone-pieces .piece:not(.piece--envoi)')).length === 1 || (await erreursAffichees(page)).length > 0, 20000);
  const refus = await erreursAffichees(page);
  verifier(jointe && refus.length === 0 && (await page.$$('#zone-pieces .piece:not(.piece--envoi)')).length === 1, 'la capture est jointe, sans « vous n avez pas accès à ce dossier »', JSON.stringify(refus));
  verifier(/30 Mo/.test(await page.textContent('#zone-pieces')), 'l aide des pièces dit le plafond du serveur (30 Mo pour une vidéo)');
  await page.click('#forme-demande [type="submit"]');
  await page.waitForURL((u) => /#\/projets\/atelier\/demandes\/[^/?]+$/.test(u.hash), { timeout: 20000 }).catch(() => {});
  const tid = page.url().split('/').pop();
  const fiche = await attendre(async () => { const d = await lire(`tickets/${tid}`); return d && d.fields ? d : null; }, 15000);
  const piecesTicket = piecesDe(fiche);
  verifier(piecesTicket.length === 1 && /^projets\/atelier\/tickets\/nouveau\/\d+-capture-cockpit\.png$/.test(piecesTicket[0].chemin || ''), 'la demande créée porte la pièce', JSON.stringify(piecesTicket));
  const cheminCockpit = (piecesTicket[0] || {}).chemin || 'projets/atelier/tickets/nouveau/absent.png';
  const mCockpit = await metaDe(cheminCockpit);
  verifier(mCockpit.cote === 'equipe' && mCockpit.par === uidEquipe, 'la pièce est passée par le serveur (sa trace, pas un envoi direct au stockage)', JSON.stringify(mCockpit));
  const lueEquipe = await lirePiece(EQUIPE, cheminCockpit);
  const lueCliente = await lirePiece(CAMILLE, cheminCockpit);
  verifier(lueEquipe.code === 200 && pareil(lueEquipe.corps, PNG), 'l équipe la lit');
  verifier(lueCliente.code === 200 && pareil(lueCliente.corps, PNG), 'la cliente la lit');
  verifier(str(fiche, 'plateforme') === 'mobile' && str(fiche, 'composant') === 'mobile', 'la demande porte plateforme « mobile » et la partie « mobile »', `${str(fiche, 'plateforme')} ${str(fiche, 'composant')}`);
  verifier(sous(fiche, 'constatePar', 'nom').stringValue === 'Camille Martin' && sous(fiche, 'constatePar', 'email').stringValue === CAMILLE, 'et « constatePar » : Camille Martin', JSON.stringify(champ(fiche, 'constatePar')));
  verifier(sous(fiche, 'auteur', 'cote').stringValue === 'equipe', 'ouverte au nom de l équipe');
  await page.waitForSelector('.suivi-demande', { timeout: 15000 }).catch(() => {}); await pause(1200);
  const ficheEcran = await page.textContent('.page');
  /* Lot 6 : l'équipe dit « ticket », au masculin. */
  verifier(/Constaté par\s*Camille Martin/.test(ficheEcran), 'la fiche dit « Constaté par Camille Martin »');
  verifier(/Partie concernée\s*Application mobile \(iPhone et Android\)/.test(ficheEcran), 'et nomme la partie « Application mobile (iPhone et Android) »');
  /* L'accusé du client part, l'alerte de l'équipe non : l'équipe ne se
     prévient pas elle-même de son propre geste. */
  verifier(Boolean(await attendre(async () => (await lettres(TITRE, 'client')).length > 0, 30000)), 'le client reçoit l accusé de la demande ouverte pour lui (en attente de regroupement)');
  await pause(4000);
  verifier((await lettres(TITRE, 'equipe')).length === 0, 'l équipe ne reçoit pas d alerte pour une demande qu elle a ouverte');

  console.log('\n== Le Cockpit : une note interne avec sa pièce');
  await aller(page, '#/projets/atelier/demandes/t-veille', '#forme-message');
  await page.check('#mode-interne', { force: true }); await pause(300);
  await page.setInputFiles('#zone-pieces-message input[type="file"]', { name: 'note-equipe.png', mimeType: 'image/png', buffer: PNG });
  await attendre(async () => (await page.$$('#zone-pieces-message .piece:not(.piece--envoi)')).length === 1, 20000);
  await page.fill('#texte-message', 'Note interne avec capture.');
  await page.click('#forme-message [type="submit"]');
  const note = await attendre(async () => (await docs('tickets/t-veille/messages?pageSize=100')).find((m) => str(m, 'texte') === 'Note interne avec capture.'), 15000);
  const pNote = note ? piecesDe(note)[0] || {} : {};
  verifier(note && champ(note, 'interne').booleanValue === true && /^projets\/atelier\/tickets\/t-veille\//.test(pNote.chemin || ''), 'la note interne part avec sa pièce', JSON.stringify(pNote));
  verifier((await metaDe(pNote.chemin || 'x')).visibilite === 'interne' && (await lirePiece(CAMILLE, pNote.chemin || 'x')).code === 403, 'sa pièce est « interne » : la cliente ne la lit pas (403)', JSON.stringify(await metaDe(pNote.chemin || 'x')));
  /* Joindre en « note interne », puis basculer sur « répondre au client »
     avant d'envoyer : la pièce est remise d'accord avec le message. La
     fiche se redessine à l'arrivée de la note : on la laisse finir. */
  await pause(2500);
  await page.check('#mode-interne', { force: true }); await pause(300);
  await page.setInputFiles('#zone-pieces-message input[type="file"]', { name: 'bascule.png', mimeType: 'image/png', buffer: PNG });
  await attendre(async () => (await page.$$('#zone-pieces-message .piece:not(.piece--envoi)')).length === 1, 20000);
  await page.check('#forme-message input[name="mode"][value="client"]', { force: true }); await pause(300);
  await page.fill('#texte-message', 'Réponse au client avec capture.');
  await page.click('#forme-message [type="submit"]');
  const rep = await attendre(async () => (await docs('tickets/t-veille/messages?pageSize=100')).find((m) => str(m, 'texte') === 'Réponse au client avec capture.'), 15000);
  const pRep = rep ? piecesDe(rep)[0] || {} : {};
  verifier(rep && champ(rep, 'interne').booleanValue === false && (await metaDe(pRep.chemin || 'x')).visibilite === 'client', 'jointe en note interne puis envoyée au client : la pièce est remise « client »', JSON.stringify(await metaDe(pRep.chemin || 'x')));
  const lueRep = await lirePiece(CAMILLE, pRep.chemin || 'x');
  verifier(lueRep.code === 200 && pareil(lueRep.corps, PNG), 'et la cliente la lit');
  verifier((await erreursAffichees(page)).length === 0, 'aucun message d erreur à l écran', JSON.stringify(await erreursAffichees(page)));

  console.log('\n== Le Hub : le formulaire du client garde son texte');
  const cliente = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  cliente.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(cliente, CAMILLE);
  await aller(cliente, '#/projets/atelier/nouvelle-demande', '#forme-demande');
  const pageCliente = await cliente.textContent('.page');
  verifier(/Dites-nous ce dont vous avez besoin/.test(pageCliente), 'le client lit toujours « Dites-nous ce dont vous avez besoin »');
  verifier(!/Qui l'a constaté/.test(pageCliente) && !(await cliente.$('#constatePar')), 'et pas « Qui l a constaté ? »');
  verifier(/Sur quoi l'avez-vous constaté \?/.test(pageCliente), 'la plateforme lui parle à la deuxième personne');
  verifier(Boolean(await cliente.$('input[name="plateforme"][value="mobile"]')) && Boolean(await cliente.$('#composant option[value="mobile"]')), 'il a aussi « iPhone et Android » et « Application mobile »');
  await cliente.fill('#titre', 'Capture jointe par la cliente');
  await cliente.fill('#description', 'Voir la capture.');
  await cliente.click('label:has(input[name="plateforme"][value="mobile"])');
  await cliente.setInputFiles('#zone-pieces input[type="file"]', { name: 'cliente.png', mimeType: 'image/png', buffer: PNG });
  await attendre(async () => (await cliente.$$('#zone-pieces .piece:not(.piece--envoi)')).length === 1 || (await erreursAffichees(cliente)).length > 0, 20000);
  verifier((await erreursAffichees(cliente)).length === 0, 'la cliente joint sa capture, sans erreur', JSON.stringify(await erreursAffichees(cliente)));
  await cliente.click('#forme-demande [type="submit"]');
  await cliente.waitForURL((u) => /#\/projets\/atelier\/demandes\/[^/?]+$/.test(u.hash), { timeout: 20000 }).catch(() => {});
  const tidCliente = cliente.url().split('/').pop();
  const ficheCliente = await attendre(async () => { const d = await lire(`tickets/${tidCliente}`); return d && d.fields ? d : null; }, 15000);
  const pCliente = piecesDe(ficheCliente)[0] || {};
  verifier(str(ficheCliente, 'plateforme') === 'mobile' && !champ(ficheCliente, 'constatePar').mapValue, 'sa demande porte « mobile », sans « constatePar »');
  const lueParEquipe = await lirePiece(EQUIPE, pCliente.chemin || 'x');
  verifier(lueParEquipe.code === 200 && pareil(lueParEquipe.corps, PNG) && (await metaDe(pCliente.chemin || 'x')).cote === 'client', 'et l équipe lit sa capture, rangée par le serveur', `${lueParEquipe.code}`);
  verifier(Boolean(await attendre(async () => (await lettres('Capture jointe par la cliente', 'equipe')).length > 0, 30000)), 'une demande ouverte par le client alerte toujours l équipe');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-demande-equipe-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
