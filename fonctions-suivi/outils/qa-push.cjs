/* ==========================================================================
   CAPMEDIA CLIENT HUB · les notifications push des messages, éprouvées

   Le serveur (push.js, sur l'émulateur : chaque envoi est chiffré pour de
   vrai avec les clés de l'abonnement, puis consigné dans _banc/push/envois
   au lieu de partir) :
     - un message de l'équipe pousse vers les appareils du client, jamais
       vers l'auteur ni vers un client d'un autre projet ;
     - un message du client pousse vers l'équipe, lien du Cockpit ;
     - le texte : nom de l'auteur, début du message, rien d'une pièce ;
     - des e-mails coupés sur le projet n'arrêtent pas le push ;
     - un projet fermé au client ne pousse rien ;
     - un abonnement disparu (410) est effacé.
   Le navigateur (Chrome, pas le Chromium sans tête, qui refuse toute
   notification) :
     - rien n'est demandé ni enregistré à l'ouverture ;
     - la proposition vient après le premier message envoyé, une fois ;
     - « Activer » enregistre l'abonnement dans profils/{uid}/pushs ;
     - la fonction pousse vers CET abonnement (clés du navigateur) ;
     - le service (sw.js) reçoit le push et montre la notification, pas
       de doublon quand l'espace est au premier plan ;
     - le clic ouvre la bonne conversation ;
     - Paramètres : activé, puis désactivé (copie effacée) ;
     - rien n'est proposé là où le push n'existe pas (application de
       bureau, iPhone hors application installée).
   Le service de push du navigateur n'est pas joint : l'abonnement est
   fabriqué dans la page (vraies clés P-256), et le push est remis au
   service par le protocole de débogage de Chrome.

   Banc : émulateurs (Functions compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const B = (v) => ({ booleanValue: v });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const existe = async (c) => (await fetch(bdd(c), { headers: prop })).ok;
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
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(600); } return null; };
/* La proposition des push, et pas une autre (la clé d'accès propose aussi la sienne). */
const PROPOSITION = '.toast:has-text("prévenu sur cet appareil") .toast-geste';
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* Un abonnement plausible : de vraies clés P-256, comme un navigateur. */
const b64u = (b) => Buffer.from(b).toString('base64url');
const clesNavigateur = () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) }; };
const empreinte = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
const abonner = async (uid, endpoint) => {
  const c = clesNavigateur();
  await poser(`profils/${uid}/pushs/${empreinte(endpoint)}`, { endpoint: S(endpoint), cles: M({ p256dh: S(c.p256dh), auth: S(c.auth) }), appareil: S('Banc'), maj: T(new Date()) });
  return empreinte(endpoint);
};
const envois = async () => (await docs('_banc/push/envois?pageSize=300')).map((d) => {
  const ch = ((champ(d, 'charge').mapValue || {}).fields) || {};
  return { uid: str(d, 'uid'), endpoint: str(d, 'endpoint'), statut: Number(champ(d, 'statut').integerValue || 0), erreur: str(d, 'erreur'), titre: (ch.titre || {}).stringValue || '', corps: (ch.corps || {}).stringValue || '', lien: (ch.lien || {}).stringValue || '', tag: (ch.tag || {}).stringValue || '', brut: JSON.stringify(ch) };
});
const message = async (pid, id, de, texte, pieces = []) => poser(`projets/${pid}/messages/${id}`, {
  de: M({ uid: S(de.uid), nom: S(de.nom), cote: S(de.cote) }), texte: S(texte), date: T(new Date()),
  pieces: L(pieces.map((p) => M({ nom: S(p.nom), chemin: S(p.chemin), taille: { integerValue: '10' }, type: S('application/pdf') }))),
});

/* Dans la page : un abonnement fabriqué, avec de vraies clés (le service de
   push du navigateur n'est pas joint sur le banc). */
const fauxAbonnement = () => {
  const P = window.PushManager && window.PushManager.prototype;
  if (!P) return;
  const CLE = 'qa:push:abonnement';
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fabriquer = (j) => ({ endpoint: j.endpoint, options: { userVisibleOnly: true, applicationServerKey: null }, expirationTime: null, toJSON: () => j, getKey: () => null, unsubscribe: async () => { localStorage.removeItem(CLE); return true; } });
  P.subscribe = async function subscribe(opts) {
    const paire = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const brut = await crypto.subtle.exportKey('raw', paire.publicKey);
    const j = { endpoint: `https://fcm.googleapis.com/fcm/send/qa-navigateur-${Math.random().toString(36).slice(2)}`, expirationTime: null, keys: { p256dh: b64(brut), auth: b64(crypto.getRandomValues(new Uint8Array(16))) } };
    localStorage.setItem(CLE, JSON.stringify(j));
    localStorage.setItem('qa:push:cle', b64((opts || {}).applicationServerKey || new Uint8Array()));
    return fabriquer(j);
  };
  P.getSubscription = async function getSubscription() { const s = localStorage.getItem(CLE); return s ? fabriquer(JSON.parse(s)) : null; };
};

let nav = null;
(async () => {
  const camille = await uidDe('camille.essai@exemple.test');
  const lea = await uidDe('lea.essai@exemple.test');
  const agent = await uidDe('agent.essai@exemple.test');
  const ALEX = { uid: agent, nom: 'Alex Durand', cote: 'equipe' };
  const CAMILLE = { uid: camille, nom: 'Camille Martin', cote: 'client' };
  const projetAtelier = await lire('projets/atelier');
  const nomAtelier = str(projetAtelier, 'nom');

  console.log('\n== Les clés');
  const racine = path.join(__dirname, '..', '..');
  const cleClient = (fs.readFileSync(path.join(racine, 'agence/suivi/assets/js/config-suivi.js'), 'utf8').match(/vapid:\s*'([^']+)'/) || [])[1];
  const cleServeur = require('../push.js').VAPID_PUBLIQUE;
  verifier(Boolean(cleClient) && cleClient === cleServeur, 'la clé publique VAPID est la même côté page et côté serveur');
  verifier(Buffer.from(cleServeur, 'base64url').length === 65, 'et c est une clé P-256 non compressée (65 octets)');

  console.log('\n== Le serveur : un message de l équipe pousse vers le client');
  for (const uid of [camille, lea, agent]) await vider(`profils/${uid}/pushs`);
  await vider('_banc/push/envois');
  const abCamille = await abonner(camille, 'https://fcm.googleapis.com/fcm/send/qa-camille-1');
  const abExpire = await abonner(camille, 'https://updates.push.services.mozilla.com/wpush/v2/qa-expire');
  await abonner(agent, 'https://fcm.googleapis.com/fcm/send/qa-alex-1');
  await abonner(lea, 'https://fcm.googleapis.com/fcm/send/qa-lea-1');
  await message('atelier', 'qa-push-1', ALEX, 'Bonjour Camille, la version 1.3 est prête à tester sur TestFlight.');
  const versCamille = await attendre(async () => (await envois()).find((e) => e.endpoint.endsWith('qa-camille-1')));
  verifier(Boolean(versCamille), 'Camille reçoit le push sur son appareil');
  verifier(versCamille && versCamille.statut === 201 && !versCamille.erreur, 'chiffré avec les clés de l abonnement, sans erreur', versCamille && `${versCamille.statut} ${versCamille.erreur}`);
  verifier(versCamille && versCamille.titre === 'Alex Durand', 'le titre est le nom de l auteur', versCamille && versCamille.titre);
  verifier(versCamille && versCamille.corps === 'Bonjour Camille, la version 1.3 est prête à tester sur TestFlight.', 'le corps est le début du message', versCamille && versCamille.corps);
  verifier(versCamille && versCamille.lien === 'hub#/messages/atelier', 'le lien ouvre la conversation dans le Hub', versCamille && versCamille.lien);
  verifier(versCamille && versCamille.tag === 'messages-atelier', 'une notification par conversation (tag)', versCamille && versCamille.tag);
  await attendre(async () => (await envois()).some((e) => e.endpoint.endsWith('qa-expire')));
  await pause(2500);
  const tous1 = await envois();
  verifier(tous1.some((e) => e.endpoint.endsWith('qa-expire') && e.statut === 410), 'l abonnement disparu répond 410');
  verifier(!(await existe(`profils/${camille}/pushs/${abExpire}`)), 'et il est effacé du profil');
  verifier(await existe(`profils/${camille}/pushs/${abCamille}`), 'l abonnement valide, lui, reste');
  verifier(!tous1.some((e) => e.uid === agent), 'rien vers l auteur (Alex)');
  verifier(!tous1.some((e) => e.uid === lea), 'rien vers une cliente d un autre projet (Léa)');

  console.log('\n== Le serveur : un message du client pousse vers l équipe');
  await vider('_banc/push/envois');
  const long = `Merci ! J'ai testé sur mon iPhone et tout fonctionne, sauf le retour depuis le profil qui reste bloqué. ${'Détail '.repeat(20)}`;
  await message('atelier', 'qa-push-2', CAMILLE, long);
  const versAlex = await attendre(async () => (await envois()).find((e) => e.uid === agent));
  verifier(Boolean(versAlex), 'Alex (équipe) reçoit le push');
  verifier(versAlex && versAlex.titre === `Camille Martin · ${nomAtelier}`, 'le titre dit qui et sur quel projet', versAlex && versAlex.titre);
  verifier(versAlex && versAlex.corps.length <= 120 && versAlex.corps.endsWith('…') && versAlex.corps.startsWith('Merci !'), 'un long message est coupé à 120 caractères', versAlex && `${versAlex.corps.length} car.`);
  verifier(versAlex && versAlex.lien === 'cockpit#/messages/atelier', 'le lien ouvre la conversation dans le Cockpit', versAlex && versAlex.lien);
  await pause(2500);
  verifier(!(await envois()).some((e) => e.uid === camille), 'rien vers l autrice (Camille)');

  console.log('\n== Le serveur : des pièces sans texte, rien de leur contenu');
  await vider('_banc/push/envois');
  await message('atelier', 'qa-push-3', ALEX, '', [{ nom: 'facture-secrete-2026.pdf', chemin: 'projets/atelier/messages/qa/facture-secrete-2026.pdf' }, { nom: 'contrat.pdf', chemin: 'projets/atelier/messages/qa/contrat.pdf' }]);
  const pieces = await attendre(async () => (await envois()).find((e) => e.uid === camille));
  verifier(pieces && pieces.corps === '2 pièces jointes', '« 2 pièces jointes », rien d autre', pieces && pieces.corps);
  verifier(pieces && !/facture-secrete|contrat\.pdf|projets\//.test(pieces.brut), 'ni le nom ni le chemin d une pièce ne part', pieces && pieces.brut);

  console.log('\n== Le serveur : e-mails coupés, le push part quand même');
  await poser('projets/atelier', { emailsClient: S('coupes') }, ['emailsClient']);
  await vider('_banc/push/envois');
  await message('atelier', 'qa-push-4', ALEX, 'Message pendant la coupure des e-mails.');
  verifier(Boolean(await attendre(async () => (await envois()).find((e) => e.uid === camille))), 'Camille reçoit le push malgré emailsClient « coupes »');
  await poser('projets/atelier', { emailsClient: S('actifs') }, ['emailsClient']);

  console.log('\n== Le serveur : un projet fermé au client ne pousse rien');
  const prepa = await lire('projets/prepa');
  verifier(prepa && champ(prepa, 'ouvert').booleanValue === false, 'le projet « prepa » est bien fermé au client');
  await vider('_banc/push/envois');
  await message('prepa', 'qa-push-5', ALEX, 'Préparation interne.');
  await attendre(async () => (await docs('activite?pageSize=300')).some((a) => str(a, 'projet') === 'prepa' && /Préparation interne/.test(str(a, 'texte'))), 20000);
  await pause(4000);
  verifier(!(await envois()).length, 'aucun push pour un message d un projet fermé');
  for (const uid of [camille, lea, agent]) await vider(`profils/${uid}/pushs`);

  console.log('\n== Le navigateur : rien à l ouverture, la proposition après un message');
  nav = await chromium.launch({ channel: 'chrome' });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(fauxAbonnement);
  const erreurs = [];
  let page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');
  await aller(page, '#/accueil');
  await pause(1500);
  verifier(await page.evaluate(() => Notification.permission) === 'default', 'au départ, rien n est décidé (permission « default »)');
  verifier((await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))) === 0, 'aucun service enregistré à l ouverture');
  verifier(!(await page.$(PROPOSITION)), 'aucune proposition à l ouverture');
  const manifeste = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; const r = await fetch(l.href); return { ok: r.ok, j: await r.json().catch(() => null), href: l.href }; });
  verifier(manifeste && manifeste.ok && manifeste.j && manifeste.j.display === 'standalone' && new URL(manifeste.j.start_url, manifeste.href).pathname === '/suivi/hub', 'le Hub porte un manifeste (application installable, start_url /suivi/hub)', JSON.stringify(manifeste && manifeste.j));
  const icones = await page.evaluate(async (m) => Promise.all((m.j.icons || []).map((i) => fetch(new URL(i.src, m.href)).then((r) => r.ok))), manifeste || { j: {} });
  verifier(icones.length >= 1 && icones.every(Boolean), 'ses icônes répondent');

  await aller(page, '#/messages/atelier');
  await page.waitForSelector('#texte-message', { timeout: 15000 });
  await page.fill('#texte-message', 'Premier message depuis ce navigateur.');
  await page.press('#texte-message', 'Enter');
  const proposition = await page.waitForSelector(PROPOSITION, { timeout: 8000 }).catch(() => null);
  verifier(Boolean(proposition), 'après le premier message envoyé, « Activer » est proposé');
  const texteProposition = proposition ? await proposition.evaluate((b) => b.closest('.toast').textContent) : '';
  verifier(/Capmedia vous répond/.test(texteProposition), 'avec la phrase du client', texteProposition);
  await ctx.grantPermissions(['notifications'], { origin: SITE });
  if (proposition) await proposition.click();
  const id = await attendre(async () => { const l = await docs(`profils/${camille}/pushs?pageSize=20`); return l.length ? l[0] : null; }, 20000);
  verifier(Boolean(id), 'l abonnement est enregistré dans profils/{uid}/pushs');
  const abonnementPage = JSON.parse(await page.evaluate(() => localStorage.getItem('qa:push:abonnement')) || '{}');
  verifier(id && str(id, 'endpoint') === abonnementPage.endpoint && id.name.endsWith(empreinte(abonnementPage.endpoint)), 'sous l empreinte de son adresse d envoi', id && id.name.split('/').pop());
  const cles = id ? ((champ(id, 'cles').mapValue || {}).fields || {}) : {};
  verifier(id && (cles.p256dh || {}).stringValue === abonnementPage.keys.p256dh && (cles.auth || {}).stringValue === abonnementPage.keys.auth, 'avec les clés du navigateur');
  verifier(await page.evaluate(() => localStorage.getItem('qa:push:cle')) === cleClient, 'l abonnement est demandé avec la clé publique du Hub');
  verifier((await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => (r && r.active ? r.active.scriptURL : '')))).endsWith('/suivi/sw.js'), 'le service des notifications est actif (/suivi/sw.js)');
  await page.fill('#texte-message', 'Second message.');
  await page.press('#texte-message', 'Enter');
  await pause(2500);
  verifier(!(await page.$(PROPOSITION)), 'la proposition ne revient pas au message suivant');

  console.log('\n== De la fonction au service : le push arrive et s affiche');
  await vider('_banc/push/envois');
  await message('atelier', 'qa-push-6', ALEX, 'Votre retour est bien noté, merci.');
  const versNavigateur = await attendre(async () => (await envois()).find((e) => e.endpoint === abonnementPage.endpoint));
  verifier(versNavigateur && versNavigateur.statut === 201 && !versNavigateur.erreur, 'la fonction chiffre pour CET abonnement (clés du navigateur)', versNavigateur && `${versNavigateur.statut} ${versNavigateur.erreur}`);
  const cdp = await ctx.newCDPSession(page);
  const enregistrements = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => enregistrements.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await pause(1000);
  const reg = enregistrements.find((r) => /\/suivi\/$/.test(r.scopeURL) && !r.isDeleted);
  const origine = new URL(SITE).origin;
  const donnees = JSON.stringify(versNavigateur ? { titre: versNavigateur.titre, corps: versNavigateur.corps, lien: versNavigateur.lien, tag: versNavigateur.tag } : {});
  /* Le service peut s'endormir entre deux push : on le retrouve à chaque fois. */
  const leService = () => ctx.serviceWorkers().filter((w) => w.url().endsWith('/suivi/sw.js')).pop();
  const notifications = async () => { const w = leService(); return w ? w.evaluate(() => self.registration.getNotifications().then((l) => l.map((n) => ({ titre: n.title, corps: n.body, lien: (n.data || {}).lien, tag: n.tag })))).catch(() => []) : []; };
  /* Le Hub au premier plan : il montre déjà le message, pas de doublon. */
  await page.bringToFront();
  const devant = await page.evaluate(() => document.hasFocus() && document.visibilityState === 'visible');
  if (reg) await cdp.send('ServiceWorker.deliverPushMessage', { origin: origine, registrationId: reg.registrationId, data: donnees });
  await pause(1500);
  if (devant) verifier((await notifications()).length === 0, 'Hub au premier plan : pas de notification en double');
  else console.log('  (le navigateur sans tête ne dit pas le Hub au premier plan : contrôle du doublon sauté)');
  /* Le Hub fermé : la notification s'affiche. */
  const autre = await ctx.newPage();
  await autre.goto('about:blank');
  await page.close();
  const cdp2 = await ctx.newCDPSession(autre);
  await cdp2.send('ServiceWorker.enable');
  await pause(800);
  if (reg) await cdp2.send('ServiceWorker.deliverPushMessage', { origin: origine, registrationId: reg.registrationId, data: donnees });
  const affichees = await attendre(async () => { const l = await notifications(); return l.length ? l : null; }, 8000);
  verifier(Boolean(reg) && Boolean(affichees), 'Hub fermé : le service reçoit le push et montre la notification');
  const n0 = (affichees || [])[0] || {};
  verifier(n0.titre === 'Alex Durand' && n0.corps === 'Votre retour est bien noté, merci.', 'titre et texte de la notification', JSON.stringify(n0));
  verifier(n0.lien === 'hub#/messages/atelier' && n0.tag === 'messages-atelier', 'avec le lien de la conversation', JSON.stringify(n0));

  console.log('\n== Le clic sur la notification ouvre la conversation');
  page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await page.goto(`${SITE}/suivi/hub?emul#/accueil`, { waitUntil: 'domcontentloaded' });
  await pause(5000);
  await autre.close();
  const sw = leService();
  if (sw) await sw.evaluate(async () => { const [n] = await self.registration.getNotifications(); if (n) self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n })); }).catch(() => {});
  const arrive = await attendre(async () => (/#\/messages\/atelier$/.test(page.url()) ? page.url() : null), 8000);
  verifier(Boolean(arrive), 'la fenêtre ouverte va à la conversation du projet', page.url());
  verifier((await notifications()).length === 0, 'et la notification est refermée');

  console.log('\n== Paramètres : activé, puis désactivé');
  await aller(page, '#/parametres');
  await page.waitForSelector('#section-push:not([hidden]) [data-push-etat]', { timeout: 10000 }).catch(() => {});
  verifier(await page.$('#section-push:not([hidden]) [data-push-etat="actif"]'), 'la section « Notifications sur cet appareil » dit « activées »');
  const boutonD = await page.$('#push-basculer');
  verifier(boutonD && (await boutonD.textContent()).trim() === 'Désactiver', 'avec « Désactiver »');
  if (boutonD) await boutonD.click();
  await page.waitForSelector('[data-push-etat="inactif"]', { timeout: 10000 }).catch(() => {});
  verifier(Boolean(await attendre(async () => (await docs(`profils/${camille}/pushs?pageSize=20`)).length === 0, 10000)), 'désactiver efface la copie du profil');
  const boutonA = await page.$('#push-basculer');
  verifier(boutonA && (await boutonA.textContent()).trim() === 'Activer les notifications', 'et le bouton redevient « Activer les notifications »');
  if (boutonA) await boutonA.click();
  verifier(Boolean(await attendre(async () => (await docs(`profils/${camille}/pushs?pageSize=20`)).length === 1, 10000)), 'le bouton des Paramètres réactive (un abonnement)');
  verifier(!erreurs.length, 'aucune erreur dans la page', erreurs.join(' | '));
  await ctx.close();

  console.log('\n== Là où le push n existe pas, rien n est proposé');
  const essais = [
    ['dans l application de bureau Capmedia', () => { window.capmediaBureau = { plateforme: 'mac', application: 'hub', notifier() {}, compte() {} }; }],
    ['sur iPhone hors application installée (sans PushManager)', () => { try { delete window.PushManager; } catch (e) { /* rien */ } }],
  ];
  for (const [ou, script] of essais) {
    const c = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    await c.addInitScript(script);
    const p = await c.newPage();
    await connecter(p, 'camille.essai@exemple.test');
    await aller(p, '#/parametres');
    await pause(1500);
    verifier(Boolean(await p.$('#section-push[hidden]')), `${ou} : pas de réglage dans Paramètres`);
    await aller(p, '#/messages/atelier');
    await p.waitForSelector('#texte-message', { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => localStorage.removeItem('suivi:push:propose'));
    await p.fill('#texte-message', `Un message ${ou}.`);
    await p.press('#texte-message', 'Enter');
    await pause(3000);
    verifier(!(await p.$(PROPOSITION)), `${ou} : aucune proposition après un message`);
    verifier((await p.evaluate(() => (navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0))) === 0, `${ou} : aucun service enregistré`);
    await c.close();
  }

  console.log('\n== Le Cockpit : le réglage existe pour l équipe');
  const ce = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ce.addInitScript(fauxAbonnement);
  const pe = await ce.newPage();
  await connecter(pe, 'agent.essai@exemple.test');
  verifier(/\/suivi\/cockpit/.test(pe.url()), 'Alex arrive dans le Cockpit', pe.url());
  verifier(await pe.evaluate(() => Boolean(document.querySelector('link[rel="manifest"][href$="cockpit.webmanifest"]'))), 'le Cockpit porte son manifeste');
  await aller(pe, '#/moi');
  await pe.waitForSelector('#section-push:not([hidden]) [data-push-etat]', { timeout: 10000 }).catch(() => {});
  verifier(await pe.$('#section-push:not([hidden]) [data-push-etat="inactif"]'), 'la section des notifications est là, inactive');
  await ce.close();

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => { console.error('ÉCHEC', e); if (nav) await nav.close().catch(() => {}); process.exit(1); });
