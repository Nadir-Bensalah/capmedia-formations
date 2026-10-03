/* ==========================================================================
   CAPMEDIA CLIENT HUB · la fin de test, vue par le testeur, l'équipe et le client

   Les scénarios se suivent (le second attend le premier), le bouton
   « J'ai terminé » n'apparaît que tout déroulé, il fige les résultats,
   ouvre sept jours d'accès, prévient l'équipe (lettre, notification,
   activité) et le client (une ligne sans nom). Le testeur ajoute une
   remarque après coup ; l'équipe la lit et prolonge ou clôt son accès.

   Banc : émulateurs, site local, semer-suivi puis semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PID = 'atelier'; const CID = 'c-oct';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const L = (l) => ({ arrayValue: { values: l } }); const T = (d) => ({ timestampValue: d.toISOString() });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { if (await fn()) return true; await pause(ms); } return false; };
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
const toast = (page) => page.evaluate(() => ((document.querySelector('.toasts') || {}).innerText || '').trim());
const envoisDe = async (modele) => (((await lire('envois?pageSize=300')) || {}).documents || []).filter((d) => str(d, 'modele') === modele);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const karim = 'karim.testeur@essai.test';
  const passages = `projets/${PID}/campagnes/${CID}/passages`;
  await vider(passages); await vider(`projets/${PID}/campagnes/${CID}/appreciations`); await vider('envois'); await vider('activite');
  await poser(`projets/${PID}/campagnes/${CID}`, { termines: { mapValue: { fields: {} } }, fins: { mapValue: { fields: {} } } }, ['termines', 'fins']);

  console.log('\n== Les scénarios se suivent');
  await connecter(page, karim);
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  await page.waitForSelector('.testeur-tete', { timeout: 20000 });
  const fiches = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (fiches.find((d) => str(d, 'email') === karim) || { name: '' }).name.split('/').pop();
  verifier(Boolean(uid), 'Karim a une fiche dans le vivier');
  verifier(/Accès actif/.test(await page.textContent('#lat-etat')), 'le rail dit « Accès actif »');
  const refs = await page.$$eval('.tb--testeur [data-case]', (l) => l.map((c) => c.dataset.case));
  verifier(refs.length >= 3, `ses scénarios sont là (${refs.length})`);
  const [premier, second] = refs;
  verifier(await page.$(`[data-case="${second}"][data-verrou]`), 'le second est verrouillé tant que le premier n a pas de résultat');
  verifier(!(await page.$(`[data-case="${premier}"][data-verrou]`)), 'le premier est ouvrable');
  await page.click(`[data-case="${second}"]`); await pause(700);
  verifier(new RegExp(`${premier} d'abord`).test(await toast(page)), 'toucher le second dit de dérouler le premier', await toast(page));
  verifier(!(await page.$('.modale--scenario, .feuille')), 'et n ouvre pas sa feuille');
  /* La plateforme vient de sa clé : le choix n'apparaît que s'il manque. */
  if (await page.$('[data-sur="ios"]')) { await page.click('[data-sur="ios"]'); await pause(500); }
  await page.click(`[data-case="${premier}"]`); await page.waitForSelector('[data-feuille-poser="ok"]', { timeout: 10000 });
  await page.click('[data-feuille-poser="ok"]'); await pause(1500);
  verifier(!(await page.$(`[data-case="${second}"][data-verrou]`)), 'le premier réussi, le second s ouvre');
  /* Le résultat posé enchaîne sur la feuille du suivant : on la referme. */
  if (await page.$('.modale--scenario')) { await page.keyboard.press('Escape'); await pause(600); }
  verifier(!(await page.$('[data-terminer]')), 'pas de bouton « J ai terminé » tant qu il reste des scénarios');

  console.log('\n== Tout déroulé : « J ai terminé »');
  const dossierPreuve = `campagnes/${PID}/${CID}/${uid}/preuve.png`;
  for (const ref of refs.slice(1)) {
    const ko = ref === refs[2];
    /* Une case est une clé « scénario du plan, plateforme » : le passage
       porte l'une et l'autre, et son résultat en toutes lettres. */
    const [scen, plat] = ref.split('__');
    await poser(`${passages}/${uid}__${ref}`, { scenario: S(scen), testeur: S(uid), plateforme: S(plat), resultat: S(ko ? 'echec' : 'reussi'), commentaire: S(ko ? 'Rien ne se passe.' : ''), preuves: L(ko ? [S(dossierPreuve)] : []), contexte: { mapValue: { fields: {} } }, cree: T(new Date()), maj: T(new Date()) });
  }
  await attendre(async () => page.$('[data-terminer]'), 30, 500);
  verifier(await page.$('[data-terminer]'), 'tout déroulé, le bouton « J ai terminé » apparaît');
  await page.click('[data-terminer]'); await page.waitForSelector('[data-valider]', { timeout: 10000 });
  verifier(/figés/.test(await page.textContent('.modale, .feuille')), 'il prévient que les résultats seront figés');
  /* La note du test est demandée en terminant (qa-fiche-testeur l'éprouve). */
  await page.click('[data-note-test="5"]');
  await page.click('[data-valider]'); await pause(2000);
  if (await page.$('[data-envoyer]')) { await page.keyboard.press('Escape'); await pause(500); }
  verifier(/Test terminé le/.test(await page.textContent('.fin-test')), 'la page dit « Test terminé le … »');
  const campagne = await attendre(async () => { const c = await lire(`projets/${PID}/campagnes/${CID}`); return Boolean(((champ(c, 'termines').mapValue || {}).fields || {})[uid]) && Boolean(((champ(c, 'fins').mapValue || {}).fields || {})[uid]); }, 60, 500);
  verifier(campagne, 'le serveur fige (termines) et ouvre sept jours (fins) sur la campagne');
  const c = await lire(`projets/${PID}/campagnes/${CID}`);
  const fin = new Date((((champ(c, 'fins').mapValue || {}).fields || {})[uid] || {}).timestampValue || 0);
  verifier(Math.abs(fin.getTime() - Date.now() - 7 * 86400000) < 3600000, `la fin d accès est à sept jours (${fin.toISOString().slice(0, 10)})`);
  await attendre(async () => /accès jusqu'au/.test(await page.textContent('#lat-etat').catch(() => '')), 30, 500);
  verifier(/Test terminé · accès jusqu'au/.test(await page.textContent('#lat-etat')), 'le rail dit « Test terminé · accès jusqu au … »', await page.textContent('#lat-etat'));
  verifier((await page.$$('.t-choix:not([disabled])')).length === 0, 'plus aucun bouton de résultat');
  await page.click(`[data-case="${premier}"]`); await page.waitForSelector('.modale--scenario, .feuille', { timeout: 10000 }).catch(() => {});
  verifier(!(await page.$('[data-feuille-poser]')), 'la feuille d un scénario se lit sans pouvoir reposer');
  await page.keyboard.press('Escape'); await pause(400);
  const lettre = await attendre(async () => (await envoisDe('testeur-termine')).length === 1, 60, 500);
  verifier(lettre, 'une lettre « testeur-termine » part à l équipe');
  if (lettre) {
    const v = (((await envoisDe('testeur-termine'))[0].fields.variables || {}).mapValue || {}).fields || {};
    verifier(str({ fields: v }, 'testeur') === 'Karim', 'elle nomme le testeur', str({ fields: v }, 'testeur'));
    verifier((v.ko || {}).integerValue === '1' && Number((v.ok || {}).integerValue) === refs.length - 1, `elle compte ses résultats (${(v.ok || {}).integerValue} ok, ${(v.ko || {}).integerValue} ko)`);
  }
  const act = ((await lire('activite?pageSize=100')) || {}).documents || [];
  const ligne = act.find((d) => str(d, 'type') === 'test' && /a terminé la campagne/.test(str(d, 'texte')));
  verifier(ligne && str(ligne, 'visibilite') === 'client' && !/Karim/.test(str(ligne, 'texte')), 'le client lit qu un testeur a terminé, sans son nom', ligne ? str(ligne, 'texte') : '(rien)');

  console.log('\n== Une remarque après coup');
  await page.fill('#remarque-texte', 'Le bouton Retour est trop petit sur iPhone SE.');
  await page.click('[data-remarque]'); await pause(1500);
  verifier(/Retour est trop petit/.test(await page.textContent('.remarques-fin')), 'la remarque s affiche sous la page');
  const appr = await lire(`projets/${PID}/campagnes/${CID}/appreciations/${uid}`);
  verifier(((champ(appr, 'remarques').arrayValue || {}).values || []).length === 1, 'et vit dans son appréciation');
  verifier(await attendre(async () => (await envoisDe('testeur-remarque')).length === 1, 60, 500), 'une lettre « testeur-remarque » part à l équipe');
  verifier(erreurs.length === 0, `aucune erreur de page côté testeur ${erreurs.join(' | ')}`);

  console.log('\n== Le Cockpit : l état, prolonger, clore');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await connecter(equipe, 'agent.essai@exemple.test');
  await equipe.evaluate(() => { location.hash = '#/tests?projet=atelier'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await equipe.waitForSelector('[data-action="ouvrir-campagne"]', { timeout: 20000 });
  /* Les appréciations arrivent par abonnement, un peu après la page : on
     rouvre la fiche jusqu'à ce qu'elle porte la fin de test. */
  const ouvrirFiche = async (p) => {
    let texte = '';
    for (let i = 0; i < 8; i += 1) {
      await p.click('[data-action="ouvrir-campagne"]'); await pause(900);
      texte = await p.textContent('.feuille .modale-corps').catch(() => '');
      if (/Terminé le/.test(texte)) break;
      await p.keyboard.press('Escape'); await pause(700);
    }
    return texte;
  };
  const fiche = await ouvrirFiche(equipe);
  verifier(/Terminé le/.test(fiche) && /accès jusqu'au/.test(fiche), 'la fiche campagne dit « Terminé le … · accès jusqu au … »');
  verifier(/Retour est trop petit/.test(fiche), 'et montre la remarque');
  await equipe.click(`[data-prolonger="${uid}"]`); await pause(1500);
  const c2 = await lire(`projets/${PID}/campagnes/${CID}`);
  const fin2 = new Date((((champ(c2, 'fins').mapValue || {}).fields || {})[uid] || {}).timestampValue || 0);
  verifier(Math.abs(fin2.getTime() - fin.getTime() - 7 * 86400000) < 3600000, `Prolonger ajoute sept jours (${fin2.toISOString().slice(0, 10)})`);
  await equipe.click('[data-action="ouvrir-campagne"]'); await equipe.waitForSelector(`[data-clore="${uid}"]`, { timeout: 15000 });
  await equipe.click(`[data-clore="${uid}"]`); await pause(1500);
  const c3 = await lire(`projets/${PID}/campagnes/${CID}`);
  const fin3 = new Date((((champ(c3, 'fins').mapValue || {}).fields || {})[uid] || {}).timestampValue || 0);
  verifier(fin3.getTime() <= Date.now() + 5000, 'Clore ramène la fin d accès à maintenant');

  console.log('\n== Accès clos : le testeur ne voit plus la campagne');
  await attendre(async () => /Aucune campagne en cours/.test(await page.textContent('body')), 30, 500);
  verifier(/Aucune campagne en cours/.test(await page.textContent('body')), 'sa page dit « Aucune campagne en cours »');
  verifier((await page.textContent('#lat-etat').catch(() => '')) === '' || await page.$eval('#lat-etat', (el) => el.hidden), 'et le rail ne dit plus rien');

  console.log('\n== Le client : une ligne, pas un nom');
  const client = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await connecter(client, 'camille.essai@exemple.test');
  await client.evaluate(() => { location.hash = '#/tests?projet=atelier'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await client.waitForSelector('[data-action="ouvrir-campagne"]', { timeout: 20000 });
  const ficheClient = await ouvrirFiche(client);
  verifier(/Terminé le/.test(ficheClient) && !/Karim/.test(ficheClient), 'le client voit « Terminé le … » sous le numéro du testeur, sans nom');
  verifier(!/Prolonger/.test(ficheClient) && !/Retour est trop petit/.test(ficheClient), 'ni le bouton Prolonger, ni la remarque');

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-fin-de-test-echec.png' }); console.error('capture : /tmp/qa-fin-de-test-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
