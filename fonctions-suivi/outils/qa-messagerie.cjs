/* ==========================================================================
   CAPMEDIA CLIENT HUB · la messagerie, éprouvée des deux côtés

   Deux navigateurs à la fois : Camille dans le Hub, Alex (l'équipe) dans
   le Cockpit, sur la même conversation. Ce que prouve cette suite :
   - le message de l'équipe arrive en direct chez Camille ; « Lu le … » chez
     l'équipe ; « Camille Martin écrit » pendant sa frappe ;
   - une réaction posée par Camille se voit dans le Cockpit, et se retire
     d'un geste ; un seul dessin du fil d'en face par changement ;
   - « Répondre » : la citation part avec le message, se voit de l'autre
     côté, et ramène au message d'origine ;
   - « Modifier » : le texte change des deux côtés, avec « modifié » ;
     plus de « Modifier » après quinze minutes, « Supprimer » toujours ;
   - « Supprimer » : « Message supprimé » des deux côtés, la pièce jointe
     effacée du stockage, l'extrait effacé de l'activité et des
     notifications ;
   - les règles avec le vrai jeton de la page : personne ne modifie ni ne
     supprime le message d'un autre ;
   - l'appui long ouvre le menu d'un message sur un téléphone ; la bulle
     réagit comme la page ;
   - aucune erreur de page, aucun tiret cadratin.

   Banc : émulateurs (Functions et Storage compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
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
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const carte = (d, n) => ((champ(d, n).mapValue || {}).fields) || {};
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const idDe = (d) => (d && d.name ? d.name.split('/').pop() : '');
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
const aller = async (page, hash, attendu) => { await page.evaluate((h) => { location.hash = h; }, hash); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(1200); };
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(500); } return null; };
const messages = async () => docs('projets/atelier/messages?pageSize=300');
const messageDeTexte = async (texte) => (await messages()).find((m) => str(m, 'texte') === texte);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const erreurs = [];
const garder = (page, nom) => page.on('pageerror', (e) => erreurs.push(`${nom}: ${e.message.slice(0, 160)}`));

(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) { console.error('FIREBASE_STORAGE_EMULATOR_HOST requis'); process.exit(2); }
  admin.initializeApp({ projectId: PROJET, storageBucket: SEAU });
  const seau = admin.storage().bucket(SEAU);
  const camille = await uidDe('camille.essai@exemple.test');
  const alex = await uidDe('agent.essai@exemple.test');

  /* ---------------------------------------------------------------------
     Deux navigateurs sur la même conversation
     --------------------------------------------------------------------- */
  const nav = await chromium.launch();
  const ctxC = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pc = await ctxC.newPage(); garder(pc, 'hub');
  const ctxE = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pe = await ctxE.newPage(); garder(pe, 'cockpit');
  await connecter(pc, 'camille.essai@exemple.test');
  await connecter(pe, 'agent.essai@exemple.test');
  verifier(/\/suivi\/hub/.test(pc.url()) && /\/suivi\/cockpit/.test(pe.url()), 'Camille est dans le Hub, Alex dans le Cockpit', `${pc.url()} · ${pe.url()}`);
  await aller(pc, '#/messages/atelier', '#forme-message');
  await aller(pe, '#/messages/atelier', '#forme-message');

  console.log('\n== En direct : le message, « Lu », la frappe');
  const t1 = `Bonjour Camille, la maquette est prête ${Date.now()}`;
  await pe.fill('#texte-message', t1); await pe.press('#texte-message', 'Enter');
  const m1 = await attendre(() => messageDeTexte(t1), 15000);
  const id1 = idDe(m1);
  verifier(Boolean(m1), 'Alex envoie depuis le Cockpit');
  verifier(Boolean(await attendre(async () => (await pc.$(`#fil [data-msg="${id1}"]`)) && /maquette est prête/.test(await pc.textContent(`#fil [data-msg="${id1}"]`)), 10000)), 'Camille le voit arriver sans recharger');
  verifier(Boolean(await attendre(async () => /^\s*Lu le \d{2}\/\d{2} à \d{2}:\d{2}\s*$/.test(await pe.textContent('#fil-accuse').catch(() => '')), 10000)), 'Alex lit « Lu le JJ/MM à HH:MM » sous son message', await pe.textContent('#fil-accuse').catch(() => ''));
  await pc.type('#texte-message', 'Je regarde');
  verifier(Boolean(await attendre(async () => pe.$eval('#fil-frappe', (el) => !el.hidden && /Camille Martin écrit/.test(el.textContent)).catch(() => false), 8000)), 'Alex voit « Camille Martin écrit »');
  await pc.fill('#texte-message', '');

  console.log('\n== Réagir');
  /* Le fil d'Alex compté : un seul dessin par réaction, pas d'écho. */
  await pe.evaluate(() => { window.__dessins = 0; const fil = document.querySelector('#fil'); new MutationObserver((l) => { if (l.some((r) => r.target === fil && r.addedNodes.length)) window.__dessins += 1; }).observe(fil, { childList: true }); });
  await pc.hover(`#fil [data-msg="${id1}"] .message`);
  await pc.click(`#fil [data-msg="${id1}"] [data-menu-message]`);
  await pc.waitForSelector('.menu-message', { timeout: 5000 });
  const menuEnFace = await pc.textContent('.menu-message');
  verifier(/Répondre/.test(menuEnFace) && !/Modifier|Supprimer/.test(menuEnFace) && /En faire un ticket/.test(menuEnFace), 'sur le message d en face : Répondre, En faire un ticket, ni Modifier ni Supprimer', menuEnFace.replace(/\s+/g, ' '));
  verifier((await pc.$$('.menu-message [data-reaction]')).length === 6, 'une palette de six réactions');
  await pc.click('.menu-message [data-reaction="pouce"]');
  const reaction = await attendre(async () => { const m = await lire(`projets/atelier/messages/${id1}`); return carte(m, 'reactions')[`pouce_${camille}`] ? m : null; }, 10000);
  verifier(Boolean(reaction) && (carte(reaction, 'reactions')[`pouce_${camille}`] || {}).stringValue === 'Camille Martin', 'la réaction est rangée sous Camille, à son nom');
  verifier(Boolean(await attendre(async () => /👍/.test(await pe.textContent(`#fil [data-msg="${id1}"] .message-reactions`).catch(() => '')), 10000)), 'Alex voit le 👍 de Camille sur son message');
  await pause(2500);
  verifier((await pe.evaluate(() => window.__dessins)) === 1, 'un seul dessin du fil d Alex pour cette réaction', String(await pe.evaluate(() => window.__dessins)));
  verifier(/Camille Martin/.test(await pe.getAttribute(`#fil [data-msg="${id1}"] .reaction`, 'title').catch(() => '')), 'son nom s affiche au survol');
  await pc.click(`#fil [data-msg="${id1}"] .reaction[data-reagir="pouce"]`);
  verifier(Boolean(await attendre(async () => !(await pe.$(`#fil [data-msg="${id1}"] .reaction`)), 10000)), 'un second geste la retire, chez Alex aussi');

  console.log('\n== Répondre');
  await pc.hover(`#fil [data-msg="${id1}"] .message`);
  await pc.click(`#fil [data-msg="${id1}"] [data-menu-message]`);
  await pc.click('.menu-message [data-cle="repondre"]');
  verifier(/Répondre à Alex Durand/.test(await pc.textContent('#contexte-message').catch(() => '')), 'la barre « Répondre à Alex Durand » se pose au-dessus du champ');
  const t2 = `Merci, je la valide demain ${Date.now()}`;
  await pc.fill('#texte-message', t2); await pc.press('#texte-message', 'Enter');
  const m2 = await attendre(() => messageDeTexte(t2), 15000);
  const id2 = idDe(m2);
  verifier(m2 && str({ fields: carte(m2, 'reponseA') }, 'id') === id1 && /maquette est prête/.test(str({ fields: carte(m2, 'reponseA') }, 'extrait')), 'la réponse cite le message d origine (id, extrait)');
  verifier(!(await pc.textContent('#contexte-message').catch(() => 'x')).trim(), 'et la barre disparaît après l envoi');
  verifier(Boolean(await attendre(async () => /Alex Durand|Vous/.test(await pe.textContent(`#fil [data-msg="${id2}"] .message-citation`).catch(() => '')), 10000)), 'Alex voit la citation au-dessus de la réponse');
  await pe.evaluate((id) => { const f = document.querySelector('#fil'); f.scrollTop = f.scrollHeight; document.querySelector(`#fil [data-msg="${id}"]`).dataset.vu = ''; }, id1);
  await pe.click(`#fil [data-msg="${id2}"] .message-citation`);
  verifier(Boolean(await attendre(async () => pe.$eval(`#fil [data-msg="${id1}"]`, (el) => el.classList.contains('message-repere')).catch(() => false), 3000)), 'un clic sur la citation ramène au message d origine');

  console.log('\n== Modifier');
  await pc.hover(`#fil [data-msg="${id2}"] .message`);
  await pc.click(`#fil [data-msg="${id2}"] [data-menu-message]`);
  const menuMien = await pc.textContent('.menu-message');
  verifier(/Modifier/.test(menuMien) && /Supprimer/.test(menuMien) && !/En faire/.test(menuMien), 'sur mon message : Modifier et Supprimer, pas « En faire un ticket »', menuMien.replace(/\s+/g, ' '));
  await pc.click('.menu-message [data-cle="modifier"]');
  verifier((await pc.$eval('#texte-message', (el) => el.value)) === t2 && /Modifier votre message/.test(await pc.textContent('#contexte-message')), 'le champ reprend le texte, sous « Modifier votre message »');
  verifier(await pc.$eval('#zone-pieces', (el) => getComputedStyle(el).display === 'none'), 'une modification ne joint pas de pièce');
  const t2b = `Merci, je la valide dès ce soir ${Date.now()}`;
  await pc.fill('#texte-message', t2b); await pc.press('#texte-message', 'Enter');
  const modifie = await attendre(async () => { const m = await lire(`projets/atelier/messages/${id2}`); return str(m, 'texte') === t2b && champ(m, 'modifie').timestampValue ? m : null; }, 10000);
  verifier(Boolean(modifie), 'le texte est corrigé, avec la marque « modifie » du serveur');
  verifier(Boolean(await attendre(async () => { const t = await pe.textContent(`#fil [data-msg="${id2}"]`).catch(() => ''); return /dès ce soir/.test(t) && /modifié/.test(t); }, 10000)), 'Alex lit le nouveau texte, « modifié » à côté de l heure');
  verifier((await pc.$eval('#texte-message', (el) => el.value)) === '', 'le champ retrouve son brouillon (vide)');
  verifier(Boolean(await attendre(async () => (await docs('activite?pageSize=300')).find((a) => (carte(a, 'cible').id || {}).stringValue === id2 && /dès ce soir/.test(str(a, 'texte'))), 15000)), 'la ligne d activité suit le nouveau texte');
  await poser('projets/atelier/messages/qa-vieux', { de: M({ uid: S(camille), nom: S('Camille Martin'), cote: S('client') }), texte: S('Un message de vingt minutes'), pieces: L([]), date: T(new Date(Date.now() - 20 * 60000)) });
  await attendre(() => pc.$('#fil [data-msg="qa-vieux"]'), 10000);
  await pc.hover('#fil [data-msg="qa-vieux"] .message');
  await pc.click('#fil [data-msg="qa-vieux"] [data-menu-message]');
  const menuVieux = await pc.textContent('.menu-message');
  verifier(!/Modifier/.test(menuVieux) && /Supprimer/.test(menuVieux), 'après quinze minutes : plus de « Modifier », « Supprimer » reste', menuVieux.replace(/\s+/g, ' '));
  await pc.keyboard.press('Escape');

  console.log('\n== Les règles, avec le vrai jeton de la page');
  const tenter = (page, id, changement) => page.evaluate(async ({ id: mid, changement: c }) => {
    const m = await import('./assets/js/noyau.js');
    const donnees = c === 'supprimer'
      ? { texte: '', pieces: [], supprime: m.serverTimestamp(), reactions: m.deleteField(), reponseA: m.deleteField() }
      : { texte: 'Réécrit par un autre', modifie: m.serverTimestamp() };
    try { await m.updateDoc(m.doc(m.bdd, 'projets', 'atelier', 'messages', mid), donnees); return 'ecrit'; } catch (e) { return String(e.code || e.message); }
  }, { id, changement });
  verifier((await tenter(pc, id1, 'modifier')) === 'permission-denied', 'Camille ne modifie pas le message d Alex');
  verifier((await tenter(pc, id1, 'supprimer')) === 'permission-denied', 'ni ne le supprime');
  verifier((await tenter(pe, id2, 'modifier')) === 'permission-denied', 'Alex ne modifie pas le message de Camille');
  verifier((await tenter(pe, id2, 'supprimer')) === 'permission-denied', 'ni ne le supprime');
  verifier((await tenter(pc, 'qa-vieux', 'modifier')) === 'permission-denied', 'Camille ne corrige plus son message de vingt minutes');
  verifier(str(await lire(`projets/atelier/messages/${id1}`), 'texte') === t1, 'le message d Alex est intact');

  console.log('\n== Supprimer, pièce jointe comprise');
  const t5 = `Voici la capture ${Date.now()}`;
  await pc.setInputFiles('#zone-pieces input[type="file"]', { name: 'capture-qa.txt', mimeType: 'text/plain', buffer: Buffer.from('capture') });
  await pc.waitForSelector('#zone-pieces .piece:not(.piece--envoi)', { timeout: 20000 });
  await pc.fill('#texte-message', t5); await pc.press('#texte-message', 'Enter');
  const m5 = await attendre(() => messageDeTexte(t5), 15000);
  const id5 = idDe(m5);
  const chemin5 = m5 ? str({ fields: ((((champ(m5, 'pieces').arrayValue || {}).values || [])[0] || {}).mapValue || {}).fields }, 'chemin') : '';
  verifier(Boolean(chemin5) && (await seau.file(chemin5).exists())[0], 'le message part avec sa pièce, rangée dans le stockage', chemin5);
  const notifAlex = await attendre(async () => (await docs(`boites/${alex}/notifications?pageSize=100`)).find((n) => str(n, 'message') === id5), 20000);
  verifier(Boolean(notifAlex) && /capture/.test(str(notifAlex, 'texte')), 'Alex est notifié, la notification garde l identifiant du message');
  await attendre(() => pc.$(`#fil [data-msg="${id5}"] [data-menu-message]`), 10000);
  await pc.hover(`#fil [data-msg="${id5}"] .message`);
  await pc.click(`#fil [data-msg="${id5}"] [data-menu-message]`);
  await pc.click('.menu-message [data-cle="supprimer"]');
  await pc.waitForSelector('.voile [data-oui]', { timeout: 5000 });
  verifier(/pièces jointes seront effacées/.test(await pc.textContent('.voile')), 'la confirmation dit que la pièce sera effacée');
  await pc.click('.voile [data-oui]');
  const supprime = await attendre(async () => { const m = await lire(`projets/atelier/messages/${id5}`); return champ(m, 'supprime').timestampValue ? m : null; }, 10000);
  verifier(supprime && str(supprime, 'texte') === '' && !((champ(supprime, 'pieces').arrayValue || {}).values || []).length, 'le message reste en place, vidé de son texte et de ses pièces');
  verifier(Boolean(await attendre(async () => /Message supprimé/.test(await pe.textContent(`#fil [data-msg="${id5}"]`).catch(() => '')), 10000)), 'Alex lit « Message supprimé » à sa place');
  verifier(/Message supprimé/.test(await pc.textContent(`#fil [data-msg="${id5}"]`).catch(() => '')) && !(await pc.$(`#fil [data-msg="${id5}"] [data-menu-message]`)), 'Camille aussi, sans menu dessus');
  verifier(Boolean(await attendre(async () => !(await seau.file(chemin5).exists())[0], 30000)), 'la pièce est effacée du stockage par le serveur');
  verifier(Boolean(await attendre(async () => { const n = (await docs(`boites/${alex}/notifications?pageSize=100`)).find((x) => str(x, 'message') === id5); return n && str(n, 'texte') === 'Message supprimé'; }, 20000)), 'la notification d Alex ne cite plus le texte');
  verifier(Boolean(await attendre(async () => { const a = (await docs('activite?pageSize=300')).find((x) => (carte(x, 'cible').id || {}).stringValue === id5); return a && !/capture/.test(str(a, 'texte')) && /supprimé/.test(str(a, 'texte')); }, 20000)), 'la ligne d activité non plus');
  verifier((await tenter(pc, id5, 'modifier')) === 'permission-denied', 'un message supprimé ne revient pas');

  console.log('\n== La bulle, comme la page');
  await aller(pc, '#/projets/atelier', '.bulle[data-projet="atelier"]');
  if (await pc.$eval('#bulle-panneau', (el) => el.hidden).catch(() => true)) await pc.click('#bulle-ouvrir');
  await attendre(() => pc.$(`#bulle-fil [data-msg="${id1}"]`), 8000);
  await pc.hover(`#bulle-fil [data-msg="${id1}"] .message`);
  await pc.click(`#bulle-fil [data-msg="${id1}"] [data-menu-message]`);
  await pc.click('.menu-message [data-reaction="merci"]');
  verifier(Boolean(await attendre(async () => /🙏/.test(await pe.textContent(`#fil [data-msg="${id1}"] .message-reactions`).catch(() => '')), 10000)), 'une réaction posée depuis la bulle se voit dans le Cockpit');
  verifier(Boolean(await attendre(async () => /Message supprimé/.test(await pc.textContent(`#bulle-fil [data-msg="${id5}"]`).catch(() => '')), 5000)), 'la bulle montre aussi « Message supprimé »');
  await pc.click('#bulle-fermer').catch(() => {});

  console.log('\n== Le téléphone : l appui long');
  const ctxT = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pt = await ctxT.newPage(); garder(pt, 'téléphone');
  await connecter(pt, 'camille.essai@exemple.test');
  await aller(pt, '#/messages/atelier', '#forme-message');
  await attendre(() => pt.$(`#fil [data-msg="${id1}"] .message-corps`), 10000);
  verifier(await pt.$eval(`#fil [data-msg="${id1}"] .message-gestes`, (el) => getComputedStyle(el).display === 'none').catch(() => false), 'pas de bouton au survol sur un écran tactile');
  await pt.$eval(`#fil [data-msg="${id1}"] .message-corps`, (el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: r.left + 10, clientY: r.top + 10 })); });
  await pause(800);
  verifier(Boolean(await pt.$('.menu-message')), 'un appui long ouvre le menu du message');
  const boite = await pt.$eval('.menu-message', (el) => { const r = el.getBoundingClientRect(); return { g: r.left, d: r.right, l: window.innerWidth }; }).catch(() => null);
  verifier(boite && boite.g >= 0 && boite.d <= boite.l, 'le menu tient dans l écran du téléphone', JSON.stringify(boite));
  await pt.$eval(`#fil [data-msg="${id1}"] .message-corps`, (el) => el.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true })));
  await pt.tap('.menu-message [data-reaction="rire"]');
  verifier(Boolean(await attendre(async () => /😂/.test(await pe.textContent(`#fil [data-msg="${id1}"] .message-reactions`).catch(() => '')), 10000)), 'et la réaction choisie au doigt arrive chez Alex');
  verifier(await pt.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun débordement horizontal à 390 px');
  await ctxT.close();

  const textes = `${await pc.textContent('body').catch(() => '')}${await pe.textContent('body').catch(() => '')}`;
  verifier(!/—/.test(textes), 'aucun tiret cadratin à l écran');
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC', e); process.exit(2); });
