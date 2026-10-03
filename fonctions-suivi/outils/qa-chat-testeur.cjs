/* ==========================================================================
   CAPMEDIA CLIENT HUB · la bulle du testeur et la page Testeurs du Cockpit

   Karim écrit depuis la bulle en bas à droite ; l'équipe reçoit une
   notification, une lettre, un push, et voit la conversation dans
   « Testeurs » avec le compte des non lus ; elle répond ; Karim voit la
   réponse en direct, sa pastille, sa notification, un push et une lettre
   signée Capmedia Test. Deux navigateurs, tout en même temps.

   Depuis octobre 2026, la messagerie commune (messagerie.js) des deux
   côtés : « Lu le », réagir, répondre en citant, modifier, supprimer avec
   sa pièce jointe (effacée du stockage par le serveur) ; l'équipe écrit la
   première à un testeur qui n'a rien écrit ; l'espace Test porte son
   manifeste ; une campagne qui s'ouvre prévient chacun de ses testeurs
   (lettre « Votre campagne commence », cloche, push), une seule fois.

   Banc : émulateurs (Storage et Functions compris), site local,
   semer-suivi puis semer-campagne. Les push ne partent pas : push.js les
   consigne dans _banc/push/envois.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const crypto = require('node:crypto');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const SEAU = 'capmedia-1f90d.firebasestorage.app';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const carte = (d, n) => ((champ(d, n).mapValue || {}).fields) || {};
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const idDe = (d) => (d && d.name ? d.name.split('/').pop() : '');
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
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
const envoisDe = async (modele) => (((await lire('envois?pageSize=300')) || {}).documents || []).filter((d) => str(d, 'modele') === modele);
const pushs = async () => (await docs('_banc/push/envois?pageSize=300')).map((d) => { const ch = carte(d, 'charge'); return { uid: str(d, 'uid'), statut: Number(champ(d, 'statut').integerValue || 0), titre: (ch.titre || {}).stringValue || '', corps: (ch.corps || {}).stringValue || '', lien: (ch.lien || {}).stringValue || '', tag: (ch.tag || {}).stringValue || '' }; });
const b64u = (b) => Buffer.from(b).toString('base64url');
const abonner = async (uid, endpoint) => {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
  await poser(`profils/${uid}/pushs/${id}`, { endpoint: S(endpoint), cles: M({ p256dh: S(b64u(e.getPublicKey())), auth: S(b64u(crypto.randomBytes(16))) }), appareil: S('Banc'), maj: T(new Date()) });
};
const messagesDe = async (uid) => docs(`conversationsTesteurs/${uid}/messages?pageSize=300`);
const messageDeTexte = async (uid, texte) => (await messagesDe(uid)).find((m) => str(m, 'texte') === texte);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const seau = admin.storage().bucket(SEAU);
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160))); equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  const karim = 'karim.testeur@essai.test';
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uidDeTesteur = (email) => (fiches.find((d) => str(d, 'email') === email) || { name: '' }).name.split('/').pop();
  const uid = uidDeTesteur(karim);
  const uidSonia = uidDeTesteur('sonia.testeur@essai.test');
  const alexDoc = (await docs('equipe?pageSize=50')).find((d) => str(d, 'email') === 'agent.essai@exemple.test');
  const alex = idDe(alexDoc);
  await vider(`conversationsTesteurs/${uid}/messages`); await vider(`conversationsTesteurs/${uidSonia}/messages`); await vider('conversationsTesteurs'); await vider('envois'); await vider('boites');
  await vider('_banc/push/envois'); await vider(`profils/${uid}/pushs`); await vider(`profils/${alex}/pushs`);
  await abonner(uid, 'https://fcm.googleapis.com/fcm/send/qa-karim-1');
  await abonner(alex, 'https://fcm.googleapis.com/fcm/send/qa-alex-1');

  console.log('\n== Le testeur écrit depuis sa bulle');
  await connecter(page, karim);
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('.bulle--testeur #bulle-ouvrir', { timeout: 20000 });
  verifier(true, 'la bulle est en bas à droite de l espace Test');
  const manifeste = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; const r = await fetch(l.href); const j = await r.json().catch(() => null); const icones = j ? await Promise.all((j.icons || []).map((i) => fetch(new URL(i.src, l.href)).then((x) => x.ok))) : []; return { ok: r.ok, j, icones, href: l.href }; });
  verifier(manifeste && manifeste.ok && manifeste.j && manifeste.j.name === 'Capmedia Test' && new URL(manifeste.j.start_url, manifeste.href).pathname === '/suivi/testeur' && manifeste.icones.length && manifeste.icones.every(Boolean), 'l espace Test porte son manifeste (Capmedia Test, installable, icônes servies)', JSON.stringify(manifeste && manifeste.j));
  await page.click('.bulle--testeur #bulle-ouvrir'); await pause(500);
  verifier(await page.isVisible('.bulle--testeur #bulle-panneau'), 'elle s ouvre');
  verifier(/Équipe Capmedia/.test(await page.textContent('.bulle--testeur .bulle-tete')), 'face à l équipe Capmedia');
  verifier(Boolean(await page.$('.bulle--testeur #bulle-joindre')), 'avec « Joindre », comme la bulle d un projet');
  const t1 = 'Le lien TestFlight me dit « non disponible ».';
  await page.fill('.bulle--testeur #bulle-texte', t1);
  await page.keyboard.press('Enter'); await pause(1500);
  verifier(/non disponible/.test(await page.textContent('.bulle--testeur #bulle-fil')), 'son message s affiche dans le fil');
  verifier(/Aujourd'hui/.test(await page.textContent('.bulle--testeur #bulle-fil')) && /Envoyé/.test(await page.textContent('.bulle--testeur #bulle-fil')), 'le fil est daté (« Aujourd hui ») et dit « Envoyé »');
  const conv = await attendre(async () => { const c = await lire(`conversationsTesteurs/${uid}`); return (champ(c, 'nonLusEquipe').integerValue || '0') === '1'; }, 60, 500);
  verifier(conv, 'le serveur ouvre la conversation et compte un non lu côté équipe');
  verifier(await attendre(async () => (await envoisDe('message-testeur')).length === 1, 60, 500), 'une lettre « message-testeur » part à l équipe');
  const pushEquipe = await attendre(async () => (await pushs()).find((p) => p.uid === alex), 60, 500);
  verifier(pushEquipe && pushEquipe.statut === 201 && pushEquipe.titre === 'Karim (testeur)' && pushEquipe.lien === `cockpit#/testeurs-messages/${uid}`, 'un push part vers l équipe, lien de sa conversation dans le Cockpit', JSON.stringify(pushEquipe));
  verifier(!(await pushs()).some((p) => p.uid === uid), 'rien vers l auteur (Karim)');
  const m1 = await messageDeTexte(uid, t1); const id1 = idDe(m1);

  console.log('\n== Le Cockpit : la page Testeurs, la réponse');
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.waitForSelector('#lat-corps', { timeout: 20000 });
  const railOk = await attendre(async () => /Testeurs/.test(await equipe.textContent('#lat-corps').catch(() => '')), 30, 500);
  verifier(railOk, 'le rail du Cockpit a une entrée « Testeurs »');
  const pastille = await attendre(async () => { const t = await equipe.$eval('#lat-corps a[href="#/testeurs-messages"], #lat-corps [data-chemin="/testeurs-messages"]', (a) => a.textContent).catch(() => ''); return /1/.test(t); }, 20, 500);
  verifier(pastille, 'avec le non lu en pastille');
  await equipe.evaluate(() => { location.hash = '#/testeurs-messages'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-conv]', { timeout: 15000 });
  verifier(/Karim/.test(await equipe.textContent('.tm-liste')) && /non disponible/.test(await equipe.textContent('.tm-liste')), 'la liste montre Karim et son dernier message');
  await equipe.click('[data-conv]'); await equipe.waitForSelector('#tm-texte', { timeout: 15000 }); await pause(800);
  verifier(/non disponible/.test(await equipe.textContent('#tm-fil')), 'le fil s ouvre avec son message');
  verifier(await attendre(async () => (champ(await lire(`conversationsTesteurs/${uid}`), 'nonLusEquipe').integerValue || '0') === '0', 20, 500), 'ouvrir le fil remet le compteur de l équipe à zéro');
  verifier(Boolean(await attendre(async () => /Lu le \d\d\/\d\d à \d\d:\d\d/.test(await page.textContent('.bulle--testeur #bulle-fil').catch(() => '')), 30, 500)), 'Karim lit « Lu le JJ/MM à HH:MM » sous son message');
  await equipe.fill('#tm-texte', 'Brouillon en cours');
  await poser(`conversationsTesteurs/${uid}`, { maj: T(new Date()) }, ['maj']); await pause(1200);
  verifier(await equipe.inputValue('#tm-texte') === 'Brouillon en cours', 'un changement des conversations n efface pas la réponse en cours de frappe');
  await equipe.fill('#tm-texte', '');
  const t2 = 'On regarde tout de suite. Réessayez dans dix minutes.';
  await equipe.fill('#tm-texte', t2);
  await equipe.keyboard.press('Enter'); await pause(1500);
  verifier(/dix minutes/.test(await equipe.textContent('#tm-fil')), 'la réponse s affiche chez l équipe');

  console.log('\n== Le testeur reçoit la réponse en direct');
  verifier(await attendre(async () => /dix minutes/.test(await page.textContent('.bulle--testeur #bulle-fil').catch(() => '')), 30, 500), 'la réponse arrive dans sa bulle, sans recharger');
  const pushTesteur = await attendre(async () => (await pushs()).find((p) => p.uid === uid), 60, 500);
  verifier(pushTesteur && pushTesteur.statut === 201 && pushTesteur.titre === 'Alex Durand' && pushTesteur.lien === 'testeur#/messages' && /dix minutes/.test(pushTesteur.corps), 'un push part vers Karim, lien de sa bulle', JSON.stringify(pushTesteur));
  await page.click('.bulle--testeur #bulle-fermer'); await pause(300);
  await equipe.fill('#tm-texte', 'Deuxième message, bulle fermée.'); await equipe.keyboard.press('Enter'); await pause(500);
  const pastilleT = await attendre(async () => { const c = await page.$('.bulle--testeur #bulle-compte'); return c && !(await c.evaluate((el) => el.hidden)) && /1/.test(await c.textContent()); }, 30, 500);
  verifier(pastilleT, 'bulle fermée, la pastille compte un non lu');
  const reponses = await attendre(async () => { const l = await envoisDe('message-testeur-reponse'); return l.length ? l : null; }, 60, 500);
  verifier(Boolean(reponses), 'une lettre « message-testeur-reponse » part au testeur');
  const boite = await attendre(async () => { const j = await lire(`boites/${uid}/notifications?pageSize=20`); return ((j && j.documents) || []).some((d) => /Réponse de/.test(str(d, 'titre'))); }, 40, 500);
  verifier(boite, 'et une notification dans sa cloche');
  await page.click('.bulle--testeur #bulle-ouvrir'); await pause(1200);
  verifier(await attendre(async () => (champ(await lire(`conversationsTesteurs/${uid}`), 'nonLusTesteur').integerValue || '0') === '0', 20, 500), 'rouvrir la bulle remet son compteur à zéro');
  verifier(await attendre(async () => Boolean(champ(await lire(`conversationsTesteurs/${uid}`), 'luTesteur').timestampValue), 20, 500), 'avec l heure de lecture (« Lu le » côté équipe)');

  console.log('\n== Réagir, répondre, modifier');
  const m2 = await messageDeTexte(uid, t2); const id2 = idDe(m2);
  await equipe.hover(`#tm-fil [data-msg="${id1}"] .message`).catch(() => {});
  await equipe.click(`#tm-fil [data-msg="${id1}"] [data-menu-message]`);
  await equipe.waitForSelector('.menu-message', { timeout: 5000 });
  const menuEquipe = await equipe.textContent('.menu-message');
  verifier(/Répondre/.test(menuEquipe) && !/En faire/.test(menuEquipe) && !/Modifier|Supprimer/.test(menuEquipe), 'le menu d un message du testeur : Répondre, sans « En faire une demande », ni Modifier ni Supprimer', menuEquipe.replace(/\s+/g, ' '));
  await equipe.click('.menu-message [data-reaction="pouce"]');
  verifier(Boolean(await attendre(async () => (carte(await lire(`conversationsTesteurs/${uid}/messages/${id1}`), 'reactions')[`pouce_${alex}`] || {}).stringValue === 'Alex Durand', 20, 500)), 'l équipe réagit, la réaction est rangée sous son nom');
  verifier(Boolean(await attendre(async () => /👍/.test(await page.textContent(`#bulle-fil [data-msg="${id1}"] .message-reactions`).catch(() => '')), 20, 500)), 'Karim voit le 👍 sur son message, en direct');
  await page.hover(`#bulle-fil [data-msg="${id2}"] .message`).catch(() => {});
  await page.click(`#bulle-fil [data-msg="${id2}"] [data-menu-message]`);
  await page.click('.menu-message [data-cle="repondre"]');
  verifier(/Répondre à Alex Durand/.test(await page.textContent('.bulle--testeur #bulle-contexte')), 'Karim répond en citant : la barre « Répondre à Alex Durand »');
  const t3 = 'Toujours pareil après dix minutes.';
  await page.fill('.bulle--testeur #bulle-texte', t3); await page.keyboard.press('Enter');
  const m3 = await attendre(async () => messageDeTexte(uid, t3), 30, 500);
  verifier(m3 && (carte(m3, 'reponseA').id || {}).stringValue === id2, 'la citation part avec le message (reponseA)');
  const id3 = idDe(m3);
  verifier(Boolean(await attendre(async () => /dix minutes/.test(await equipe.textContent(`#tm-fil [data-msg="${id3}"] .message-citation`).catch(() => '')), 20, 500)), 'l équipe lit la citation au-dessus de la réponse');
  await page.hover(`#bulle-fil [data-msg="${id3}"] .message`).catch(() => {});
  await page.click(`#bulle-fil [data-msg="${id3}"] [data-menu-message]`);
  const menuMien = await page.textContent('.menu-message');
  verifier(/Modifier/.test(menuMien) && /Supprimer/.test(menuMien), 'sur son message : Modifier et Supprimer', menuMien.replace(/\s+/g, ' '));
  await page.click('.menu-message [data-cle="modifier"]');
  await page.fill('.bulle--testeur #bulle-texte', 'Toujours pareil, même après vingt minutes.'); await page.keyboard.press('Enter');
  verifier(Boolean(await attendre(async () => { const t = await equipe.textContent(`#tm-fil [data-msg="${id3}"]`).catch(() => ''); return /vingt minutes/.test(t) && /modifié/.test(t); }, 30, 500)), 'l équipe lit le texte corrigé, « modifié » à côté de l heure');

  console.log('\n== Joindre une capture, puis la supprimer');
  await page.setInputFiles('.bulle--testeur #bulle-pieces input[type="file"]', { name: 'capture-qa.txt', mimeType: 'text/plain', buffer: Buffer.from('capture') });
  await page.waitForSelector('.bulle--testeur #bulle-pieces .piece:not(.piece--envoi)', { timeout: 20000 }).catch(() => {});
  const t4 = `Voici la capture ${Date.now()}`;
  await page.fill('.bulle--testeur #bulle-texte', t4); await page.keyboard.press('Enter');
  const m4 = await attendre(async () => messageDeTexte(uid, t4), 30, 500);
  const id4 = idDe(m4);
  const piece4 = m4 ? ((((champ(m4, 'pieces').arrayValue || {}).values || [])[0] || {}).mapValue || {}).fields || {} : {};
  const chemin4 = (piece4.chemin || {}).stringValue || '';
  verifier(chemin4.startsWith(`conversationsTesteurs/${uid}/`) && (await seau.file(chemin4).exists())[0], 'la capture part avec le message, rangée dans le dossier de sa conversation', chemin4);
  const meta4 = chemin4 ? (await seau.file(chemin4).getMetadata().catch(() => [{}]))[0] : {};
  verifier(((meta4 || {}).metadata || {}).par === uid, 'elle dit qui l a posée (métadonnée « par »)');
  verifier(Boolean(await attendre(async () => /capture-qa\.txt/.test(await equipe.textContent(`#tm-fil [data-msg="${id4}"]`).catch(() => '')), 20, 500)), 'l équipe voit la pièce dans le fil');
  await page.hover(`#bulle-fil [data-msg="${id4}"] .message`).catch(() => {});
  await page.click(`#bulle-fil [data-msg="${id4}"] [data-menu-message]`);
  await page.click('.menu-message [data-cle="supprimer"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 5000 });
  await page.click('.voile [data-oui]');
  const supprime = await attendre(async () => { const m = await lire(`conversationsTesteurs/${uid}/messages/${id4}`); return champ(m, 'supprime').timestampValue ? m : null; }, 20, 500);
  verifier(supprime && str(supprime, 'texte') === '' && !((champ(supprime, 'pieces').arrayValue || {}).values || []).length, 'le message reste en place, vidé');
  verifier(Boolean(await attendre(async () => /Message supprimé/.test(await equipe.textContent(`#tm-fil [data-msg="${id4}"]`).catch(() => '')), 20, 500)), 'l équipe lit « Message supprimé » à sa place');
  verifier(Boolean(await attendre(async () => !(await seau.file(chemin4).exists())[0], 60, 500)), 'la capture est effacée du stockage par le serveur');
  verifier(Boolean(await attendre(async () => (carte(await lire(`conversationsTesteurs/${uid}`), 'dernier').texte || {}).stringValue === 'Message supprimé', 40, 500)), 'la liste du Cockpit ne cite plus son texte');
  verifier(Boolean(await attendre(async () => { const n = (await docs(`boites/${alex}/notifications?pageSize=100`)).find((x) => str(x, 'message') === id4); return n && str(n, 'texte') === 'Message supprimé'; }, 40, 500)), 'ni la notification de l équipe');

  console.log('\n== Le débit des lettres à l équipe');
  const lettresEquipe = (await envoisDe('message-testeur')).length;
  const clocheEquipe = (await docs(`boites/${alex}/notifications?pageSize=200`)).filter((n) => /\(testeur\)/.test(str(n, 'titre'))).length;
  verifier(lettresEquipe === 1 && clocheEquipe >= 3, 'trois messages de Karim en quelques minutes : une seule lettre à l équipe, mais chaque message dans la cloche', `${lettresEquipe} lettre(s), ${clocheEquipe} notification(s)`);

  console.log('\n== L équipe écrit la première');
  await equipe.selectOption('#tm-nouveau', uidSonia);
  await equipe.waitForURL(new RegExp(`testeurs-messages/${uidSonia}`), { timeout: 10000 }).catch(() => {});
  await equipe.waitForSelector('#tm-texte', { timeout: 15000 });
  verifier(/Sonia/.test(await equipe.textContent('#tm-nom').catch(() => '')), 'choisir Sonia dans « Écrire à un testeur » ouvre son fil, vide');
  await equipe.fill('#tm-texte', 'Bonjour Sonia, votre campagne commence demain.'); await equipe.keyboard.press('Enter');
  verifier(Boolean(await attendre(async () => (carte(await lire(`conversationsTesteurs/${uidSonia}`), 'dernier').texte || {}).stringValue === 'Bonjour Sonia, votre campagne commence demain.', 40, 500)), 'la conversation de Sonia naît du premier message de l équipe');
  verifier(await attendre(async () => (await envoisDe('message-testeur-reponse')).some((d) => /sonia/.test(JSON.stringify(d.fields.a || {}))), 40, 500), 'et Sonia reçoit la lettre');

  console.log('\n== La campagne commence : chaque testeur est prévenu');
  await vider('_banc/push/envois'); await vider('envois');
  const cid = `qa-commence-${Date.now()}`;
  const campagne = (statut, testeurs, titre = 'Campagne qui commence') => ({
    titre: S(titre), statut: S(statut), application: S('Atelier'), testeurs: L(testeurs.map(S)),
    affectation: M({ [uid]: L(['s1', 's2', 's3'].map(S)), [uidSonia]: M({ telephone: S('android'), web: { booleanValue: true }, cles: L(['s1__android', 's1__web'].map(S)), vague: { integerValue: '1' } }) }),
    fin: T(new Date(Date.UTC(2026, 9, 20, 12))), scenarios: L([]), cree: T(new Date()), maj: T(new Date()),
  });
  await poser(`projets/atelier/campagnes/${cid}`, campagne('preparation', [uid]));
  await pause(2500);
  verifier(!(await envoisDe('campagne-testeur')).length, 'en préparation : aucune lettre');
  await poser(`projets/atelier/campagnes/${cid}`, campagne('en-cours', [uid]));
  const lettre = await attendre(async () => (await envoisDe('campagne-testeur'))[0], 60, 500);
  const vars = lettre ? carte(lettre, 'variables') : {};
  verifier(Boolean(lettre) && /karim/.test(JSON.stringify(lettre.fields.a || {})), 'à l ouverture, Karim reçoit « Votre campagne commence »');
  verifier(vars.scenarios && vars.scenarios.integerValue === '3' && (vars.application || {}).stringValue === 'Atelier' && /20 octobre 2026/.test((vars.fin || {}).stringValue || '') && /\/suivi\/testeur$/.test((vars.lien || {}).stringValue || ''), 'avec ses 3 scénarios, l application, la fin prévue et le lien de son espace', JSON.stringify(vars));
  verifier(Boolean(await attendre(async () => (await docs(`boites/${uid}/notifications?pageSize=50`)).some((n) => str(n, 'titre') === 'Votre campagne commence'), 40, 500)), 'une notification dans sa cloche');
  const pushCampagne = await attendre(async () => (await pushs()).find((p) => p.uid === uid), 60, 500);
  verifier(pushCampagne && pushCampagne.lien === 'testeur#/' && /3 scénarios vous attendent/.test(pushCampagne.corps), 'et un push sur ses appareils', JSON.stringify(pushCampagne));
  await poser(`projets/atelier/campagnes/${cid}`, campagne('en-cours', [uid, uidSonia]));
  verifier(Boolean(await attendre(async () => (await envoisDe('campagne-testeur')).some((d) => /sonia/.test(JSON.stringify(d.fields.a || {})) && (carte(d, 'variables').scenarios || {}).integerValue === '2'), 60, 500)), 'Sonia, ajoutée campagne en cours, la reçoit à son tour (ses 2 passages, affectation par plateforme)');
  await poser(`projets/atelier/campagnes/${cid}`, campagne('close', [uid, uidSonia]));
  await pause(1500);
  await poser(`projets/atelier/campagnes/${cid}`, campagne('en-cours', [uid, uidSonia], 'Campagne rouverte'));
  await pause(6000);
  const toutes = await envoisDe('campagne-testeur');
  verifier(toutes.length === 2, 'retouchée, close puis rouverte : personne ne la reçoit deux fois', `${toutes.length} lettre(s)`);

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-chat-testeur-echec.png' }); console.error('capture : /tmp/qa-chat-testeur-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
