/* Les points cassés du relevé des parcours (section 0), éprouvés dans le
   navigateur : C1 la réponse du client fait repartir la demande, C2 « Pas
   tout à fait » la renvoie chez nous, C12 un devis périmé n'est plus à
   décider, C15 lire sur la page Messages pose les deux accusés.
   Banc : émulateurs, site local, semer-suivi. */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
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
const attendreStatut = async (chemin, voulu, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const d = await lire(chemin); if (str(d, 'statut') === voulu) return true; await pause(500); } return false; };
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const tickets = ((await lire('tickets?pageSize=100')).documents || []).filter((d) => str(d, 'projet') === 'atelier' && !['resolu', 'ferme', 'refuse', 'annulee'].includes(str(d, 'statut')));
  const tid = tickets[0].name.split('/').pop();
  const uid = await uidDe('camille.essai@exemple.test');
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== C1 : on lui demande une précision, sa réponse fait repartir la demande');
  await poser(`tickets/${tid}`, { statut: S('en-attente-client') }, ['statut']);
  await page.evaluate((c) => { location.hash = c; }, `#/projets/atelier/demandes/${tid}`);
  await page.waitForSelector('#texte-message', { timeout: 20000 }); await pause(800);
  verifier(/attendue de vous/i.test(await page.textContent('.page')), 'la fiche dit qu une réponse est attendue de lui');
  await page.fill('#texte-message', 'Voici la précision demandée.');
  await page.click('#forme-message [type="submit"]');
  verifier(await attendreStatut(`tickets/${tid}`, 'en-cours'), 'sa réponse envoyée, la demande repasse en cours (serveur)');
  await pause(1500);
  verifier(!/attendue de vous/i.test(await page.textContent('.page')) && /nous de jouer/i.test(await page.textContent('.page')), 'et l écran dit que c est à nous de jouer');

  console.log('\n== C2 : « Pas tout à fait » renvoie la correction chez nous, avec un mot');
  await poser(`tickets/${tid}`, { statut: S('a-valider') }, ['statut']);
  await page.waitForSelector('[data-action="pas-regle"]', { timeout: 20000 });
  await page.click('[data-action="pas-regle"]');
  await page.waitForSelector('#texte-conteste', { timeout: 10000 });
  await page.click('[data-renvoyer]'); await pause(400);
  verifier(await page.$('#texte-conteste'), 'sans un mot, rien ne part');
  await page.fill('#texte-conteste', 'Le bouton reste gris sur Android.');
  await page.click('[data-renvoyer]');
  verifier(await attendreStatut(`tickets/${tid}`, 'en-cours'), 'avec son mot, la demande repasse en cours');
  await pause(1500);
  const messages = ((await lire(`tickets/${tid}/messages?pageSize=50`)).documents || []).map((m) => str(m, 'texte'));
  verifier(messages.some((t) => /reste gris/.test(t)), 'et son mot est dans les échanges');
  verifier(!(await page.$('[data-action="pas-regle"]')), 'le bouton a disparu');

  console.log('\n== C12 : un devis périmé n est plus à décider');
  await poser('documents/d-perime', { projet: S('atelier'), type: S('devis'), numero: S('D-PERIME'), libelle: S('Vieux devis'), montant: N(500), statut: S('envoye'), archive: B(false), date: T(new Date(Date.now() - 40 * 86400000)), expiration: T(new Date(Date.now() - 5 * 86400000)) });
  await pause(800);
  await page.evaluate(() => { location.hash = '#/finances'; });
  await page.waitForSelector('[data-action="ouvrir"][data-id="d-perime"]', { timeout: 20000 }); await pause(500);
  const ligne = await page.$eval('[data-action="ouvrir"][data-id="d-perime"]', (el) => el.textContent);
  verifier(/Expiré/.test(ligne), 'la ligne dit « Expiré » sans qu on l ait posé à la main', ligne.trim().slice(0, 120));
  const attente = await page.$eval('.attente', (el) => el.textContent).catch(() => '');
  verifier(!/Vieux devis/.test(attente), 'il n est pas dans « Devis en attente de votre décision »');
  await page.click('[data-action="ouvrir"][data-id="d-perime"]'); await page.waitForSelector('.modale-corps', { timeout: 10000 }); await pause(400);
  verifier(!(await page.$('[data-accepter]')) && !(await page.$('[data-refuser]')), 'sa fiche ne propose ni Accepter ni Refuser');
  verifier(/plus valable/i.test(await page.textContent('body')), 'et dit qu il n est plus valable');
  await page.keyboard.press('Escape'); await pause(300);
  verifier(!/Vieux devis/.test((await page.textContent('#lat').catch(() => '')) || ''), 'rien ne le compte dans le rail');

  console.log('\n== C15 : lire sur la page Messages pose les deux accusés');
  await fetch(bdd('projets/atelier/messages'), { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { de: { mapValue: { fields: { uid: S('uid-agent'), nom: S('Agent'), cote: S('equipe') } } }, texte: S('Un mot de l équipe'), pieces: { arrayValue: {} }, date: T(new Date()) } }) });
  await pause(800);
  await page.evaluate(() => { location.hash = '#/messages/atelier'; });
  await page.waitForSelector('.page', { timeout: 20000 }); await pause(2500);
  const profil = await lire(`profils/${uid}`);
  const lus = ((champ(profil, 'lus').mapValue || {}).fields || {})['messages:atelier'];
  verifier(Boolean(lus && lus.timestampValue), 'le compteur du rail (profil.lus) est posé');
  const lecture = await lire(`projets/atelier/lectures/${uid}`);
  verifier(Boolean(champ(lecture, 'lu').timestampValue), 'et l accusé « Lu » pour l équipe (lectures) aussi');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-casses-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
