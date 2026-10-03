/* Le ménage du Hub (demande de Nadir, 02/10/2026), éprouvé dans le
   navigateur, côté client, point par point :
    1. la navigation sur toutes les routes du client : le rail et son
       accueil, le bouton Retour, le fil d'Ariane qui part de l'accueil ;
       Retour depuis Messages ramène à l'accueil ; le rail reste
       utilisable sur un téléphone ;
    2. le bouton Messages de l'accueil porte le nombre de messages non lus,
       qui monte à l'arrivée d'un message de Capmedia et retombe après
       lecture ;
    3. le pavé « En attente de vous » de l'accueil se replie, se ferme (il
       file vers Demandes), se retrouve dans Demandes et s'y réaffiche ; le
       choix est dans le profil et suit la personne dans un second
       navigateur neuf ;
    4. la même chose pour le pavé de l'aperçu d'un projet ;
    5. la tenue des délais : trois faits, deux jauges, aucune pastille ;
    6. les points bloquants en tête de l'aperçu ;
    7. « Collaborateurs sur ce projet » ;
    8. plus de devis ligne par ligne dans la feuille de route du client ;
    9. « Fichiers » à la place de « Documents », sans devis ni facture ;
   10. plus d'onglet Fichiers dans le projet (l'arbre mène à Fichiers) ;
   11. « Tâches en cours de traitement par Capmedia » ;
   12. « Demandes <projet> » ;
   14. l'arbre des projets dans le rail : déplié avec un projet, replié
       avec deux, le clic qui déplie, chaque entrée vers la bonne page du
       bon projet, les chiffres sur les entrées et la somme sur le projet
       replié, plus d'onglets horizontaux chez le client ; le Cockpit, lui,
       ne change pas.
   Puis le rail du 02/10 (rail2) : l'ordre exact de l'arbre, Tickets,
   Planning, Campagne de tests, Notes ; plus de Versions ni de
   Suggestions ; Marketing masqué au client et « À venir » dans le
   Cockpit ; le marqueur « Chiffré » du coffre ; la bulle sur chaque page
   du client ; le squelette du rail avant les données, remplacé d'un seul
   dessin ; « Application web et mobile » ; les anciennes adresses ; et
   chaque version retrouvée dans la page de sa plateforme.
   Et aucune erreur de page.
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
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const effacer = (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=300'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email, espace = /\/suivi\/(hub|cockpit|testeur)/) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul${BANC.numero && BANC.numero > 1 ? `=${BANC.numero}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(espace, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  await pause(2500);
};
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(300); } return false; };
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const aller = async (page, chemin, selecteur = '.page', ms = 20000) => { await page.evaluate((c) => { location.hash = c; }, chemin); await page.waitForSelector(selecteur, { timeout: ms }); await pause(900); };
const hash = (page) => decodeURIComponent(new URL(page.url()).hash);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;
const SECOND = 'second-menage';
const paves = async (uid) => { const f = ((champ(await lire(`profils/${uid}`), 'pavesAttente').mapValue || {}).fields) || {}; return { accueil: (f.accueil || {}).stringValue || '', atelier: ((((f.projets || {}).mapValue || {}).fields || {}).atelier || {}).stringValue || '' }; };
const remettrePaves = (uid) => poser(`profils/${uid}`, { pavesAttente: M({ accueil: S('ouvert'), projets: M({ atelier: S('ouvert') }) }) }, ['pavesAttente']);
const nettoyer = async (uid) => { await effacer(`projets/${SECOND}`).catch(() => {}); if (uid) await remettrePaves(uid).catch(() => {}); };
const avant = (page, a, b) => page.evaluate(([x, y]) => { const ea = document.querySelector(x); const eb = document.querySelector(y); return Boolean(ea && eb && (ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING)); }, [a, b]);
const texteDe = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  const uid = await uidDe('camille.essai@exemple.test');
  const agent = await uidDe('agent.essai@exemple.test');
  await nettoyer(uid);
  const nav = await chromium.launch();
  const ctx1 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx1.newPage();
  const erreurs = []; const garder = (p) => p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  garder(page);
  await connecter(page, 'camille.essai@exemple.test');
  /* L'accueil de la première fois, s'il s'ouvre, ne doit pas masquer l'écran. */
  await poser(`profils/${uid}`, { accueil: T(new Date()) }, ['accueil']);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }); await pause(2500);

  console.log('\n== 14. L arbre des projets dans le rail (un seul projet)');
  const arbre = '#lat-corps .lat-arbre[data-arbre="atelier"]';
  verifier(await attendre(async () => Boolean(await page.$(`${arbre}.deplie`))), 'un seul projet en cours : son arbre est déplié');
  const groupes = await page.$$eval('#lat-corps .lat-groupe', (gs) => gs.map((g) => ({ titre: (g.querySelector('.lat-titre') || {}).textContent || '', chemins: [...g.querySelectorAll('.lat-lien')].map((a) => a.dataset.chemin) })));
  const tous = groupes.flatMap((g) => g.chemins);
  verifier(groupes[0] && groupes[0].chemins[0] === '/', 'en haut : Accueil', JSON.stringify(groupes[0]));
  verifier(!groupes.some((g) => /Suivi/i.test(g.titre)) && !['/demandes', '/messages', '/documents', '/fichiers', '/calendrier'].some((c) => groupes.some((g) => !/projets/i.test(g.titre) && g.chemins.includes(c))), 'plus d entrées globales Demandes, Messages, Calendrier, Documents hors des projets', tous.join(' '));
  const compte = groupes.find((g) => /Compte/i.test(g.titre)) || { chemins: [] };
  verifier(compte.chemins.includes('/nouveau-projet') && compte.chemins.includes('/parametres'), '« Demander un projet » et « Paramètres » restent en bas, hors des projets');
  const entrees = await page.$$eval(`${arbre} .lat-branche a`, (as) => as.map((a) => ({ libelle: a.querySelector('.tronque').textContent, href: a.getAttribute('href') })));
  const libelles = entrees.map((e) => e.libelle);
  verifier(['Aperçu', 'Tickets', 'Messages', 'Planning', 'Tâches', 'Calendrier', 'Axes d\'évolution', 'Coffre-fort', 'Fichiers', 'Notes', 'Devis et factures', 'Maintenance'].every((l) => libelles.includes(l)), 'les entrées du projet sont sous lui', libelles.join(', '));
  verifier(libelles.indexOf('Aperçu') === 0 && libelles.indexOf('Tickets') < libelles.indexOf('Fichiers'), 'dans l ordre d un client : l aperçu d abord', libelles.join(', '));
  const traits = await page.$eval(`${arbre} .lat-branche`, (li) => { const s = getComputedStyle(li, '::before'); return { bord: s.borderLeftWidth, coude: s.borderBottomLeftRadius, couleur: s.borderLeftColor }; }).catch(() => ({}));
  verifier(parseFloat(traits.bord) > 0 && parseFloat(traits.coude) > 0, 'reliées par des traits fins et arrondis', JSON.stringify(traits));
  verifier(!(await page.$('#onglets-projet')), 'pas d onglets horizontaux sur l accueil (évidemment)');
  await aller(page, '#/projets/atelier', '.page-tete--projet');
  verifier(!(await page.$('#onglets-projet')) && !(await page.$('.onglets-enveloppe')), 'plus d onglets horizontaux en haut de la page du projet');
  verifier(/Accueil/.test(await texteDe(page, '#ariane')) && /Atelier/.test(await texteDe(page, '#ariane')) && Boolean(await page.$('.page-tete--projet h1')), 'le titre et le fil d Ariane restent');
  /* Chaque entrée ouvre la bonne page du bon projet, et s'allume. */
  const attendues = {
    'Aperçu': /^#\/projets\/atelier$/, Tickets: /^#\/projets\/atelier\/demandes$/, Messages: /^#\/messages\/atelier$/, Planning: /^#\/projets\/atelier\/etapes$/,
    'Tâches': /^#\/projets\/atelier\/taches$/, Calendrier: /^#\/calendrier\?projet=atelier$/, Fichiers: /^#\/fichiers\?projet=atelier$/, 'Devis et factures': /^#\/finances\?projet=atelier$/, Maintenance: /^#\/maintenance\?projet=atelier$/,
    'Campagne de tests': /^#\/tests\?projet=atelier$/, Ressources: /^#\/projets\/atelier\/liens$/, Notes: /^#\/projets\/atelier\/notes$/, 'Coffre-fort': /^#\/projets\/atelier\/coffre$/,
    'Axes d\'évolution': /^#\/projets\/atelier\/evolutions$/,
  };
  for (const e of entrees) {
    await page.click(`${arbre} .lat-branche a[href="${e.href}"]`);
    await pause(1600);
    const h = hash(page);
    const bon = attendues[e.libelle] ? attendues[e.libelle].test(h) : false;
    const allume = await page.$eval(`${arbre} .lat-branche a[href="${e.href}"]`, (a) => a.classList.contains('actif')).catch(() => false);
    const casse = /n'a pas pu s'ouvrir/.test(await texteDe(page, '#vue'));
    verifier(bon && allume && !casse, `« ${e.libelle} » ouvre ${h} et s allume`, `${bon} ${allume} ${casse}`);
  }

  console.log('\n== 1. La navigation, sur chaque route du client');
  const routes = ['#/projets/atelier', '#/projets/atelier/etapes', '#/projets/atelier/taches', '#/projets/atelier/demandes', '#/projets/atelier/releases', '#/projets/atelier/liens', '#/projets/atelier/reunions', '#/projets/atelier/notes', '#/projets/atelier/activite', '#/projets/atelier/coffre', '#/projets/atelier/nouvelle-demande', '#/projets/atelier/demandes/t-anniv',
    '#/demandes', '#/messages', '#/messages/atelier', '#/calendrier', '#/calendrier?projet=atelier', '#/tests', '#/tests?projet=atelier', '#/finances', '#/finances?projet=atelier', '#/fichiers?projet=atelier', '#/maintenance', '#/activite', '#/parametres', '#/nouveau-projet'];
  for (const r of routes) {
    await aller(page, r, '.page');
    await pause(500);
    const etat = await page.evaluate(() => {
      const retour = document.getElementById('bouton-retour');
      const vu = (el) => Boolean(el) && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      return {
        rail: vu(document.querySelector('#lat-corps a[data-chemin="/"]')),
        retour: Boolean(retour) && !retour.hidden && vu(retour),
        accueil: Boolean(document.querySelector('#ariane a[href="#/"]')),
        casse: /n'a pas pu s'ouvrir/.test(document.getElementById('vue').textContent),
      };
    });
    verifier(etat.rail && etat.retour && etat.accueil && !etat.casse, `${r} : rail avec Accueil, Retour, fil d Ariane qui part de l accueil`, JSON.stringify(etat));
  }
  await aller(page, '#/', '.page-tete');
  verifier(await page.$eval('#bouton-retour', (b) => b.hidden), 'sur l accueil, pas de Retour');
  verifier(Boolean(await page.$('.page-tete a.btn-messages, .page-tete button.btn-messages')), 'l accueil a son bouton « Messages » en haut à droite');
  await page.click('.page-tete .btn-messages');
  await page.waitForSelector('#forme-message', { timeout: 15000 }); await pause(800);
  verifier(/^#\/messages\/atelier/.test(hash(page)), 'il ouvre la conversation');
  verifier(/Accueil.*Atelier.*Messages/.test(await texteDe(page, '#ariane')), 'fil d Ariane : Accueil › Atelier › Messages', await texteDe(page, '#ariane'));
  await page.click('#bouton-retour'); await pause(1500);
  verifier(hash(page) === '#/' || hash(page) === '', 'Retour depuis Messages ramène à l accueil', hash(page));
  await aller(page, '#/messages/atelier', '#forme-message');
  await page.click('#ariane a[href="#/"]'); await pause(1500);
  verifier(hash(page) === '#/', 'et « Accueil » du fil d Ariane aussi');
  /* Une adresse ouverte d'emblée (un e-mail) : Retour remonte d'un cran. */
  const ctxDirect = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const direct = await ctxDirect.newPage(); garder(direct);
  await connecter(direct, 'camille.essai@exemple.test');
  await direct.evaluate(() => { location.replace('#/messages/atelier'); });
  await direct.reload({ waitUntil: 'domcontentloaded' }); await direct.waitForSelector('#forme-message', { timeout: 30000 }); await pause(1500);
  await direct.click('#bouton-retour'); await pause(1500);
  verifier(/^#\/projets\/atelier$|^#\/$/.test(hash(direct)), 'ouverte par son adresse, Messages a aussi un Retour qui reste dans l espace', hash(direct));
  await ctxDirect.close();
  /* Sur un téléphone : le rail est un tiroir, l'arbre y reste utilisable. */
  const ctxTel = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tel = await ctxTel.newPage(); garder(tel);
  await connecter(tel, 'camille.essai@exemple.test');
  await tel.evaluate(() => { location.hash = '#/messages/atelier'; }); await tel.waitForSelector('#forme-message', { timeout: 20000 }); await pause(800);
  verifier(await tel.$eval('#bouton-retour', (b) => !b.hidden && b.getBoundingClientRect().width > 0).catch(() => false) && await tel.$eval('#bouton-menu', (b) => b.getBoundingClientRect().width > 0).catch(() => false), 'téléphone : Retour et le bouton du menu sont là sur Messages');
  await tel.click('#bouton-menu'); await pause(600);
  verifier(await tel.$eval('#lat', (l) => l.classList.contains('ouverte')), 'le menu ouvre le rail');
  const arbreTel = await tel.$eval(`${arbre}`, (a) => a.classList.contains('deplie')).catch(() => false);
  if (!arbreTel) { await tel.click(`${arbre} .lat-arbre-bascule`); await pause(500); }
  await tel.click(`${arbre} .lat-branche a[href="#/projets/atelier/taches"]`); await pause(1500);
  verifier(/^#\/projets\/atelier\/taches$/.test(hash(tel)) && !(await tel.$eval('#lat', (l) => l.classList.contains('ouverte'))), 'une entrée de l arbre mène à sa page et referme le tiroir', hash(tel));
  await ctxTel.close();

  console.log('\n== 2. Le bouton Messages et ses non lus');
  await aller(page, '#/messages/atelier', '#forme-message'); await pause(1500);
  await aller(page, '#/', '.page-tete');
  verifier(await attendre(async () => !(await page.$('#badge-messages')), 8000), 'tout est lu : pas de chiffre');
  for (const t of ['Premier message du banc ménage', 'Second message du banc ménage']) {
    await fetch(bdd('projets/atelier/messages'), { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { de: M({ uid: S(agent), nom: S('Alex Durand'), cote: S('equipe') }), texte: S(t), pieces: L([]), date: T(new Date()) } }) });
    await pause(400);
  }
  verifier(await attendre(async () => (await texteDe(page, '#badge-messages')) === '2'), 'deux messages de Capmedia : le bouton porte « 2 »', await texteDe(page, '#badge-messages'));
  verifier(/2 messages non lus/.test(await page.$eval('.page-tete .btn-messages', (b) => b.getAttribute('aria-label')).catch(() => '')), 'et le dit à un lecteur d écran');
  verifier(await attendre(async () => (await texteDe(page, `${arbre} a[data-chemin="/messages/atelier"] .compte.vif`)) === '2'), 'l entrée Messages du projet porte le même chiffre');
  await page.click('.page-tete .btn-messages');
  await page.waitForSelector('#forme-message', { timeout: 15000 }); await pause(2000);
  await aller(page, '#/', '.page-tete');
  verifier(await attendre(async () => !(await page.$('#badge-messages'))), 'lus : le chiffre retombe');

  console.log('\n== 3. Le pavé de l accueil : replier, fermer, réafficher');
  await remettrePaves(uid); await pause(1200);
  const pave = '[data-pave="accueil"]';
  verifier(await attendre(async () => Boolean(await page.$(`${pave} .liste .ligne`))), 'le pavé est ouvert, avec ses lignes');
  await page.click(`${pave} [data-pave-geste="replier"]`);
  verifier(await attendre(async () => Boolean(await page.$(`${pave}.attente--repliee`)) && !(await page.$(`${pave} .liste .ligne`))), 'replié : le titre et le chiffre restent, les lignes partent');
  verifier(await attendre(async () => (await paves(uid)).accueil === 'replie'), 'le profil dit « replie »');
  await page.click(`${pave} [data-pave-geste="deplier"]`);
  verifier(await attendre(async () => Boolean(await page.$(`${pave} .liste .ligne`)) && (await paves(uid)).accueil === 'ouvert'), 'déplié : tout revient');
  const fantome = page.waitForSelector('.attente--fantome', { timeout: 3000 }).then(() => true).catch(() => false);
  const recu = page.waitForSelector('#lat-corps .pave-recu', { timeout: 4000 }).then((el) => el.evaluate((x) => x.dataset.chemin)).catch(() => '');
  await page.click(`${pave} [data-pave-geste="fermer"]`);
  verifier(await fantome, 'fermer : le pavé file (une copie animée part vers le rail)');
  const cible = await recu;
  verifier(cible === '/projets/atelier/demandes', 'et se range dans l entrée Tickets du projet, qui s allume', cible);
  verifier(await attendre(async () => !(await page.$(pave))), 'il a quitté l accueil');
  verifier(await attendre(async () => (await paves(uid)).accueil === 'ferme'), 'le profil dit « ferme »');
  verifier(/Rangé dans Tickets/.test(await texteDe(page, '.toasts')), 'un mot le dit, avec le chemin pour le retrouver');
  /* Le même choix dans un second navigateur, neuf. */
  const nav2 = await chromium.launch();
  const p2 = await (await nav2.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); garder(p2);
  await connecter(p2, 'camille.essai@exemple.test');
  await p2.waitForSelector('.page-tete', { timeout: 20000 }); await pause(2000);
  verifier(!(await p2.$(pave)) && /points? attend/.test(await texteDe(p2, '.page-tete .chapo')), 'second navigateur neuf : le pavé reste fermé sur son accueil');
  await aller(p2, '#/projets/atelier/demandes', '#en-attente-projet');
  verifier(Boolean(await p2.$('#en-attente-projet .ligne')), 'il retrouve ce qui l attend dans Tickets du projet');
  verifier(Boolean(await p2.$('[data-pave-range="accueil"] [data-pave-geste="reafficher"]')), 'avec le bouton « Réafficher sur l accueil »');
  await aller(p2, '#/demandes', '#en-attente');
  verifier(Boolean(await p2.$('#en-attente [data-pave-range="accueil"]')), 'la page Tickets de tous ses projets le propose aussi');
  await p2.click('#en-attente [data-pave-geste="reafficher"]');
  verifier(await attendre(async () => (await paves(uid)).accueil === 'ouvert'), 'réafficher : le profil dit « ouvert »');
  await aller(p2, '#/', pave);
  verifier(Boolean(await p2.$(`${pave} .liste .ligne`)), 'et le pavé est revenu sur l accueil');
  verifier(await attendre(async () => Boolean(await page.$(pave))), 'dans le premier navigateur aussi, sans recharger');
  /* Moins de mouvement : on ferme sans animation. */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fantomeCalme = page.waitForSelector('.attente--fantome', { timeout: 1500 }).then(() => true).catch(() => false);
  await page.click(`${pave} [data-pave-geste="fermer"]`);
  verifier(!(await fantomeCalme) && await attendre(async () => !(await page.$(pave))), 'avec « réduire les animations » : fermé sans rien qui file');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await remettrePaves(uid); await pause(1000);

  console.log('\n== 4. Le pavé de l aperçu du projet');
  await aller(page, '#/projets/atelier', '[data-pave="projet:atelier"]');
  const paveP = '[data-pave="projet:atelier"]';
  await page.click(`${paveP} [data-pave-geste="replier"]`);
  verifier(await attendre(async () => Boolean(await page.$(`${paveP}.attente--repliee`)) && (await paves(uid)).atelier === 'replie'), 'replié dans l aperçu, et retenu (profil : projets.atelier)');
  await page.click(`${paveP} [data-pave-geste="deplier"]`);
  verifier(await attendre(async () => Boolean(await page.$(`${paveP} .liste .ligne`))), 'déplié');
  const recuP = page.waitForSelector('#lat-corps .pave-recu', { timeout: 4000 }).then((el) => el.evaluate((x) => x.dataset.chemin)).catch(() => '');
  await page.click(`${paveP} [data-pave-geste="fermer"]`);
  verifier((await recuP) === '/projets/atelier/demandes', 'fermé : il se range vers Tickets du projet');
  verifier(await attendre(async () => !(await page.$(paveP)) && (await paves(uid)).atelier === 'ferme'), 'il quitte l aperçu, le profil dit « ferme »');
  verifier(!/Attendu de vous|voir ci-dessus/.test(await texteDe(page, '.pouls')), '« Attendu de vous » a quitté le pouls (lot B2 : une seule place par info)', await texteDe(page, '.pouls'));
  await aller(page, '#/projets/atelier/demandes', '#en-attente-projet');
  await page.click('[data-pave-range="projet:atelier"] [data-pave-geste="reafficher"]');
  verifier(await attendre(async () => (await paves(uid)).atelier === 'ouvert'), 'réafficher dans l aperçu');
  await aller(page, '#/projets/atelier', paveP);
  verifier(Boolean(await page.$(`${paveP} .liste .ligne`)), 'le pavé est revenu dans l aperçu');

  console.log('\n== 5, 6, 7. L aperçu : délais, points bloquants, collaborateurs');
  const delais = await page.evaluate(() => { const t = document.getElementById('tenue-delais'); return t ? { faits: t.querySelectorAll('.delais-fait').length, jauges: t.querySelectorAll('.delais-piste').length, pastilles: t.querySelectorAll('.ligne-icone').length, texte: t.textContent.replace(/\s+/g, ' ') } : null; });
  verifier(delais && delais.faits === 3 && /Livraison prévue/.test(delais.texte) && /Il reste|Retard/.test(delais.texte) && /La date est-elle tenue/.test(delais.texte), 'Tenue des délais : trois faits dans les mots de tous les jours', delais && delais.texte.slice(0, 160));
  verifier(delais && delais.jauges >= 1 && /Temps écoulé/.test(delais.texte), 'et les jauges du temps et du travail', delais && String(delais.jauges));
  verifier(delais && delais.pastilles === 0 && !/null|undefined|NaN/.test(delais.texte), 'sans pictogramme en pastille, sans « null »');
  verifier(await avant(page, '#points-bloquants', paveP) && await avant(page, '#points-bloquants', '#tenue-delais') && await avant(page, '#points-bloquants', '#personnes'), 'les points bloquants sont en haut de l aperçu');
  const premiereSection = await page.evaluate(() => { const s = [...document.querySelectorAll('#onglet-corps > section')].filter((x) => !x.querySelector('#depuis-visite')); return s[0] ? (s[0].id || s[0].textContent.slice(0, 30)) : ''; });
  verifier(premiereSection === 'points-bloquants', 'la toute première section après « Depuis votre dernière visite »', premiereSection);
  verifier((await texteDe(page, '#personnes h2')) === 'Collaborateurs sur ce projet' && !/Les personnes/.test(await texteDe(page, '#vue')), '« Collaborateurs sur ce projet », plus « Les personnes »');

  console.log('\n== 8. La feuille de route du client, sans le devis ligne par ligne');
  await aller(page, '#/projets/atelier/etapes', '#onglet-corps .liste .ligne');
  verifier(!(await page.$('.frise')) && !/ligne par ligne/.test(await texteDe(page, '#vue')), 'pas de frise du devis');
  verifier(Boolean(await page.$('#onglet-corps .liste .ligne')) && !(await page.$('#onglet-corps .route')), 'les étapes restent, en un seul format : la liste par phase');

  console.log('\n== 9, 10. Fichiers');
  await aller(page, '#/documents', '.page h1');
  await pause(800);
  verifier(/^#\/fichiers\?projet=atelier$/.test(hash(page)), 'l ancienne adresse Documents mène à Fichiers du projet', hash(page));
  verifier((await texteDe(page, '.page h1')) === 'Fichiers' && /Fichiers/.test(await texteDe(page, '#ariane')) && !/Documents/.test(await texteDe(page, '#ariane')), 'titre et fil d Ariane : « Fichiers »', await texteDe(page, '#ariane'));
  const pageFichiers = await texteDe(page, '#vue');
  verifier(Boolean(await page.$('.fichier')) && !/F-2026|D-2026|Factures|Avoirs/.test(pageFichiers) && !(await page.$('[data-rayon="devis"], [data-rayon="factures"], [data-genre="devis"]')), 'des fichiers, aucun devis ni facture', pageFichiers.slice(0, 160));
  verifier(!/Documents/.test(await page.title()), 'l onglet du navigateur ne dit plus « Documents »', await page.title());
  verifier(!(await page.$('#lat-corps a[data-chemin="/documents"]')), 'le rail n a plus d entrée Documents');
  await aller(page, '#/projets/atelier/fichiers', '.page h1'); await pause(800);
  verifier(/^#\/fichiers\?projet=atelier$/.test(hash(page)), 'l ancien onglet Fichiers du projet mène à la page Fichiers du projet', hash(page));
  verifier(await page.$eval(`${arbre} a[href="#/fichiers?projet=atelier"]`, (a) => a.classList.contains('actif')).catch(() => false), 'et l entrée Fichiers de l arbre s allume');

  console.log('\n== 11, 12. Les titres des tâches et des demandes');
  await aller(page, '#/projets/atelier/taches', '.section-tete h2');
  verifier((await texteDe(page, '#onglet-corps .section-tete h2')) === 'Tâches en cours de traitement par Capmedia', '« Tâches en cours de traitement par Capmedia »');
  await aller(page, '#/projets/atelier/demandes', '#demandes-projet');
  verifier((await texteDe(page, '#demandes-projet h2')) === 'Tickets Atelier', '« Tickets Atelier »', await texteDe(page, '#demandes-projet h2'));
  verifier(/Nouveau ticket/.test(await texteDe(page, '#demandes-projet .section-tete')), 'et son bouton « Nouveau ticket »');
  /* Le chiffre de Tickets ne compte que les tickets qui attendent le
     client (lot B2) : le filtre « Pour vous » de la page. */
  const rouge = Number(await texteDe(page, `${arbre} a[data-chemin="/projets/atelier/demandes"] .compte.vif`)) || 0;
  const lignes = Number(await texteDe(page, '[data-filtre-demandes="moi"] .compte')) || 0;
  verifier(rouge > 0 && rouge === lignes, 'le chiffre de Tickets = les tickets « Pour vous » du projet', `${rouge} / ${lignes}`);

  console.log('\n== 14. Deux projets : replié, le clic qui déplie, la somme');
  await poser(`projets/${SECOND}`, { nom: S('Second projet ménage'), ref: S('SECONDM'), statut: S('en-cours'), organisation: S('atelier-nord'), membres: L([S(uid)]), roles: M({ [uid]: S('collaborateur') }), personnes: L([S(uid)]), ouvert: B(true), archive: B(false), compteur: N(0), accesVersion: N(2), emailsClient: S('actifs'), plateformes: L([S('web')]), cree: T(new Date()), maj: T(new Date()) });
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('suivi:arbre:')).forEach((k) => localStorage.removeItem(k)); location.hash = '#/'; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#lat-corps .lat-arbre', { timeout: 30000 }); await pause(3500);
  const etatArbres = await page.$$eval('#lat-corps .lat-arbre', (as) => as.map((a) => ({ id: a.dataset.arbre, deplie: a.classList.contains('deplie'), aria: a.querySelector('.lat-arbre-bascule').getAttribute('aria-expanded') })));
  verifier(etatArbres.length === 2 && etatArbres.every((a) => !a.deplie && a.aria === 'false'), 'deux projets en cours : les deux arbres sont repliés', JSON.stringify(etatArbres));
  const somme = Number(await texteDe(page, `${arbre} .lat-projet .compte.vif`)) || 0;
  verifier(somme > 0, 'replié, le projet porte la somme de ce qui attend', String(somme));
  verifier(await page.$eval(`${arbre} .lat-arbre-branches`, (b) => b.getBoundingClientRect().height < 2 && b.inert).catch(() => false), 'ses entrées sont cachées (et hors du clavier)');
  await page.click(`#lat-corps .lat-arbre[data-arbre="${SECOND}"] .lat-arbre-bascule`);
  verifier(await attendre(async () => page.$eval(`#lat-corps .lat-arbre[data-arbre="${SECOND}"]`, (a) => a.classList.contains('deplie') && a.querySelector('.lat-arbre-bascule').getAttribute('aria-expanded') === 'true'), 3000), 'le clic sur le chevron déplie ce projet seulement');
  verifier(!(await page.$eval(arbre, (a) => a.classList.contains('deplie'))), 'l autre reste replié');
  await pause(500);
  const entreeSecond = await page.$eval(`#lat-corps .lat-arbre[data-arbre="${SECOND}"] .lat-branche a[data-chemin="/projets/${SECOND}/demandes"]`, (a) => a.getBoundingClientRect().height > 0).catch(() => false);
  verifier(entreeSecond, 'ses entrées apparaissent');
  verifier(!(await page.$(`#lat-corps .lat-arbre[data-arbre="${SECOND}"] a[href="#/finances?projet=${SECOND}"]`)), 'collaborateur sur ce projet : pas de « Devis et factures » dans son arbre');
  await page.click(`#lat-corps .lat-arbre[data-arbre="${SECOND}"] .lat-branche a[data-chemin="/messages/${SECOND}"]`); await pause(1500);
  verifier(new RegExp(`^#/messages/${SECOND}$`).test(hash(page)) && /Second projet ménage/.test(await texteDe(page, '#ariane')), 'Messages du second projet ouvre SA conversation', `${hash(page)} · ${await texteDe(page, '#ariane')}`);
  verifier(!(await page.$('#vue .grille > .liste')), 'sans la liste des conversations qui répéterait le rail');
  await page.click(`${arbre} .lat-projet`); await pause(1500);
  verifier(hash(page) === '#/projets/atelier' && await page.$eval(arbre, (a) => a.classList.contains('deplie')), 'cliquer le projet ouvre son aperçu et déplie son arbre');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#lat-corps .lat-arbre', { timeout: 30000 }); await pause(2500);
  verifier(await page.$eval(`#lat-corps .lat-arbre[data-arbre="${SECOND}"]`, (a) => a.classList.contains('deplie')), 'le choix se retient d une visite à l autre');
  await effacer(`projets/${SECOND}`);

  console.log('\n== Le rail du 02/10 (rail2)');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector(`${arbre} .lat-branche a`, { timeout: 30000 }); await pause(2500);
  if (!(await page.$eval(arbre, (a) => a.classList.contains('deplie')).catch(() => false))) { await page.click(`${arbre} .lat-arbre-bascule`); await pause(600); }
  const ORDRE = ['Aperçu', 'Tickets', 'Messages', 'Planning', 'Notes', 'Tâches', 'Calendrier', 'Campagne de tests', 'Marketing', 'Coffre-fort', 'Fichiers', 'Ressources', 'Axes d\'évolution', 'Devis et factures', 'Maintenance'];
  const libs = await page.$$eval(`${arbre} .lat-branche a .tronque`, (els) => els.map((e) => e.textContent.trim()));
  const rangs = libs.map((l) => ORDRE.indexOf(l));
  verifier(rangs.every((r) => r >= 0) && rangs.every((r, i) => i === 0 || r > rangs[i - 1]), 'l ordre exact du rail : Aperçu, Tickets, Messages, Planning, Notes, Calendrier, Campagne de tests, Coffre-fort, Fichiers, Ressources, Axes d évolution, Devis et factures, Maintenance', libs.join(' | '));
  verifier(['Aperçu', 'Tickets', 'Messages', 'Planning', 'Calendrier', 'Axes d\'évolution', 'Coffre-fort', 'Fichiers', 'Notes', 'Devis et factures', 'Maintenance'].every((l) => libs.includes(l)), 'les entrées attendues du responsable sont toutes là', libs.join(' | '));
  verifier(libs.indexOf('Coffre-fort') === libs.indexOf('Fichiers') - 1, 'le coffre-fort juste au-dessus de Fichiers');
  /* Captures du rail, sombre et clair, quand on les demande (CAPTURES_RAIL : un dossier). */
  if (process.env.CAPTURES_RAIL) {
    const dossier = process.env.CAPTURES_RAIL; require('node:fs').mkdirSync(dossier, { recursive: true });
    await aller(page, '#/projets/atelier', '.page-tete--projet');
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => { if (window.AZTheme && window.AZTheme.poser) window.AZTheme.poser(t); document.documentElement.setAttribute('data-theme', t); }, theme); await pause(700);
      await page.screenshot({ path: require('node:path').join(dossier, `rail-${theme === 'dark' ? 'sombre' : 'clair'}.png`), clip: { x: 0, y: 0, width: 330, height: 900 } });
      await page.screenshot({ path: require('node:path').join(dossier, `page-${theme === 'dark' ? 'sombre' : 'clair'}.png`) });
    }
    await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); });
  }
  verifier(!libs.some((l) => /^(Demandes|Feuille de route|Tests|Versions|Décisions|Suggestions)$/.test(l)), 'plus de Demandes, Feuille de route, Tests, Versions, Décisions ni Suggestions', libs.join(' | '));
  verifier(!(await page.$('#lat-corps a[href*="/releases"], #lat-corps a[href*="/suggestions"]')), 'aucune entrée vers les versions ni les suggestions');
  verifier(!libs.includes('Marketing') && !(await page.$('#lat-corps a[href$="/marketing"]')), 'Marketing reste masqué au client tant que la page est vide');
  const coffre = await page.$eval(`${arbre} a[href="#/projets/atelier/coffre"]`, (a) => {
    const m = a.querySelector('.lat-marqueur'); if (!m) return null;
    const st = getComputedStyle(m); const svg = m.querySelector('svg');
    return { texte: m.textContent.trim(), couleur: st.color, fond: st.backgroundColor, bord: st.borderTopWidth, svg: Boolean(svg), svgCouleur: svg ? getComputedStyle(svg).color : '', libelle: a.querySelector('.tronque').textContent.trim() };
  }).catch(() => null);
  const vert = (c) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || ''); return Boolean(m) && Number(m[2]) > Number(m[1]) + 40 && Number(m[2]) > Number(m[3]) + 40; };
  /* Lot B2 : « Chiffré » seulement quand le coffre du projet est ouvert. */
  const coffreExiste = Boolean((await lire('coffres/atelier')).fields);
  if (coffreExiste) {
    verifier(coffre && coffre.texte === 'Chiffré' && coffre.svg && vert(coffre.couleur) && vert(coffre.svgCouleur), 'coffre ouvert : le coffre-fort porte le marqueur « Chiffré », vert, avec son cadenas', JSON.stringify(coffre));
    verifier(coffre && /rgba\(0, 0, 0, 0\)|transparent/.test(coffre.fond) && parseFloat(coffre.bord || '0') === 0 && coffre.libelle === 'Coffre-fort', 'un mot et un cadenas, sans pastille ni bordure', JSON.stringify(coffre));
  } else {
    verifier(!coffre && Boolean(await page.$(`${arbre} a[href="#/projets/atelier/coffre"]`)), 'pas encore de coffre : l entrée Coffre-fort, sans « Chiffré »', JSON.stringify(coffre));
  }
  /* Les renommages dans les pages. */
  await aller(page, '#/projets/atelier/etapes', '.section-tete h2');
  verifier((await texteDe(page, '#onglet-corps .section-tete h2')) === 'Planning' && /Planning/.test(await texteDe(page, '#ariane')) && !/Feuille de route/.test(await texteDe(page, '#vue')), '« Planning » à la place de « Feuille de route » (titre, fil d Ariane)', await texteDe(page, '#ariane'));
  await aller(page, '#/demandes', '.page h1');
  verifier((await texteDe(page, '.page h1')) === 'En attente de vous' && /En attente de vous/.test(await texteDe(page, '#ariane')) && !/Tickets/.test(await texteDe(page, '#ariane')) && /Nouveau ticket/.test(await texteDe(page, '.page-tete')), 'la page de tous les projets : « En attente de vous » (titre, fil d Ariane), « Nouveau ticket »');
  await aller(page, '#/projets/atelier/nouvelle-demande', '#forme-demande');
  verifier((await texteDe(page, '.page h1')) === 'Nouveau ticket' && /Tickets/.test(await texteDe(page, '#ariane')), 'le formulaire : « Nouveau ticket », fil d Ariane par « Tickets »', await texteDe(page, '#ariane'));
  await aller(page, '#/tests?projet=atelier', '.page h1');
  verifier((await texteDe(page, '.page h1')) === 'Campagne de tests' && /Campagne de tests/.test(await texteDe(page, '#ariane')), '« Campagne de tests » à la place de « Tests »', await texteDe(page, '.page h1'));
  await aller(page, '#/projets/atelier', '.page-tete--projet');
  const surtitre = await texteDe(page, '.page-tete--projet .surtitre');
  verifier(/Application web et mobile/.test(surtitre), 'un projet web ET mobile : « Application web et mobile » dans l en-tête', surtitre);
  const apercuTexte = await texteDe(page, '#vue');
  verifier(/Planning/.test(apercuTexte) && !/Voir les tickets/.test(apercuTexte) && !/Feuille de route|Voir les demandes/.test(apercuTexte) && !/\bnull\b|\bundefined\b/.test(apercuTexte), 'l aperçu dit Planning, sans la carte Tickets (lot B2) ni « null »');
  /* Les anciennes adresses. */
  const redirections = [['#/projets/atelier/versions', /^#\/projets\/atelier$/], ['#/projets/atelier/releases', /^#\/projets\/atelier$/], ['#/projets/atelier/decisions', /^#\/projets\/atelier\/notes$/], ['#/projets/atelier/suggestions', /^#\/projets\/atelier\/evolutions$/], ['#/projets/atelier/marketing', /^#\/projets\/atelier$/]];
  for (const [de, vers] of redirections) {
    await page.evaluate((c) => { location.hash = c; }, de); await pause(1800);
    verifier(vers.test(hash(page)) && !/n'a pas pu s'ouvrir/.test(await texteDe(page, '#vue')), `${de} mène à ${hash(page)}`);
  }
  await aller(page, '#/projets/atelier/notes', '.page h1');
  verifier((await texteDe(page, '.page h1')) === 'Notes' && await page.$eval(`${arbre} a[href="#/projets/atelier/notes"]`, (a) => a.classList.contains('actif')).catch(() => false), 'Notes a sa page (À venir) et son entrée s allume');
  await aller(page, '#/projets/atelier/evolutions', '.page h1');
  verifier((await texteDe(page, '.page h1')) === 'Axes d\'évolution' && await page.$eval(`${arbre} a[href="#/projets/atelier/evolutions"]`, (a) => a.classList.contains('actif')).catch(() => false), 'Axes d évolution a sa page et son entrée s allume');
  /* Aucune version perdue : chacune se retrouve dans la page de sa plateforme. */
  const composantsAtelier = (((await lire('projets/atelier/composants?pageSize=50')).documents) || []).map((d) => d.name.split('/').pop());
  const versionsAtelier = (((await lire('releases?pageSize=300')).documents) || []).filter((d) => str(d, 'projet') === 'atelier' && str(d, 'visibilite') !== 'interne');
  const orphelines = versionsAtelier.filter((d) => !(str(d, 'composant') ? composantsAtelier.includes(str(d, 'composant')) : str(d, 'plateforme')));
  verifier(versionsAtelier.length > 0 && orphelines.length === 0, `chaque version (${versionsAtelier.length}) a sa partie ou sa plateforme`, orphelines.map((d) => str(d, 'version')).join(', '));
  for (const v of versionsAtelier.slice(0, 4)) {
    const cid = str(v, 'composant') || `p-${str(v, 'plateforme')}`;
    await aller(page, `#/projets/atelier/brique/${cid}`, '.page h1'); await pause(600);
    const bloc = await texteDe(page, '[data-section="versions"]');
    verifier(bloc.includes(str(v, 'version')), `la version ${str(v, 'version')} est dans la page de sa plateforme (${cid})`, bloc.slice(0, 120));
  }
  /* La bulle, sur chaque page du client. */
  const pagesBulle = ['#/', '#/projets/atelier', '#/projets/atelier/demandes', '#/projets/atelier/etapes', '#/calendrier?projet=atelier', '#/tests?projet=atelier', '#/projets/atelier/evolutions', '#/projets/atelier/coffre', '#/fichiers?projet=atelier', '#/projets/atelier/liens', '#/projets/atelier/notes', '#/finances?projet=atelier', '#/maintenance?projet=atelier', '#/demandes', '#/activite', '#/parametres', '#/nouveau-projet', '#/projets/atelier/brique/web'];
  for (const r of pagesBulle) {
    await page.evaluate((c) => { location.hash = c; }, r); await pause(1300);
    const b = await page.evaluate(() => { const el = document.querySelector('.bulle #bulle-ouvrir'); if (!el) return null; const rc = el.getBoundingClientRect(); return { projet: el.closest('.bulle').dataset.projet, vu: rc.width > 0 && rc.height > 0, basDroite: rc.right > window.innerWidth - 120 && rc.bottom > window.innerHeight - 140 }; });
    verifier(b && b.vu && b.basDroite && b.projet === 'atelier', `${r} : la bulle de discussion, en bas à droite`, JSON.stringify(b));
  }
  /* Le squelette du rail, dans un navigateur neuf : visible avant les
     données, puis remplacé d'un seul dessin, sans erreur. */
  const ctxS = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxS.addInitScript(() => {
    window.__rail = { squelette: false, apres: [] };
    const regarder = () => {
      const corps = document.getElementById('lat-corps');
      if (!corps) return false;
      const noter = () => {
        if (corps.querySelector('.lat-squelette')) { window.__rail.squelette = true; return; }
        if (window.__rail.squelette) window.__rail.apres.push(corps.querySelectorAll('.lat-arbre .lat-branche').length);
      };
      noter();
      new MutationObserver(noter).observe(corps, { childList: true });
      return true;
    };
    const mo = new MutationObserver(() => { if (regarder()) mo.disconnect(); });
    document.addEventListener('DOMContentLoaded', () => { if (!regarder()) mo.observe(document.documentElement, { childList: true, subtree: true }); });
  });
  const sq = await ctxS.newPage(); const erreursS = []; sq.on('pageerror', (e) => erreursS.push(e.message.slice(0, 160)));
  await connecter(sq, 'camille.essai@exemple.test');
  await sq.reload({ waitUntil: 'domcontentloaded' }); await sq.waitForSelector('#lat-corps .lat-arbre', { timeout: 30000 }).catch(() => {}); await pause(3000);
  const rail = await sq.evaluate(() => window.__rail);
  verifier(rail && rail.squelette, 'le squelette du rail est posé avant les données', JSON.stringify(rail));
  const finales = await sq.$$eval('#lat-corps .lat-arbre .lat-branche', (els) => els.length);
  verifier(rail && rail.apres.length >= 1 && rail.apres[0] === finales && !(await sq.$('#lat-corps .lat-squelette')), 'puis remplacé d un seul dessin, toutes les entrées d un coup', `${JSON.stringify(rail && rail.apres)} / ${finales}`);
  verifier(erreursS.length === 0, `squelette : aucune erreur de page ${erreursS.join(' | ')}`);
  await ctxS.close();

  console.log('\n== Le Cockpit ne change pas');
  const ctxE = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const eq = await ctxE.newPage(); garder(eq);
  await connecter(eq, 'agent.essai@exemple.test');
  await eq.evaluate(() => { location.hash = '#/projets/atelier'; }); await eq.waitForSelector('#onglets-projet', { timeout: 30000 }).catch(() => {}); await pause(1500);
  verifier(Boolean(await eq.$('#onglets-projet')) && !(await eq.$('#lat-corps .lat-arbre')), 'le Cockpit garde ses onglets horizontaux et son rail');
  verifier(/Les personnes/.test(await texteDe(eq, '#personnes h2')) && !(await eq.$('#bouton-retour')), 'et « Les personnes », sans bouton Retour');
  await eq.evaluate(() => { location.hash = '#/projets/atelier/etapes'; }); await pause(2500);
  verifier(Boolean(await eq.$('.frise')), 'l équipe voit toujours la frise du devis pour cocher');
  await eq.evaluate(() => { location.hash = '#/documents'; }); await pause(2500);
  verifier((await texteDe(eq, '.page h1')) === 'Documents', 'et sa page Documents');
  await eq.evaluate(() => { location.hash = '#/projets/atelier'; }); await eq.waitForSelector('#onglets-projet', { timeout: 30000 }).catch(() => {}); await pause(1500);
  const ongletMarketing = await texteDe(eq, '#onglets-projet a[href="#/projets/atelier/marketing"]');
  verifier(/Marketing/.test(ongletMarketing) && /À venir/.test(ongletMarketing), 'l équipe voit l onglet Marketing, marqué « À venir »', ongletMarketing);
  await eq.click('#onglets-projet a[href="#/projets/atelier/marketing"]'); await pause(1500);
  verifier(/^#\/projets\/atelier\/marketing$/.test(hash(eq)) && /À venir/.test(await texteDe(eq, '#onglet-corps')), 'et sa page, vide pour l instant', hash(eq));
  verifier(/Feuille de route/.test(await texteDe(eq, '#onglets-projet')) && /Demandes/.test(await texteDe(eq, '#onglets-projet')), 'le Cockpit garde ses mots (Demandes, Feuille de route)');
  await ctxE.close();

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav2.close();
  await nav.close();
  await nettoyer(uid);
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'qa-menage-echec.png') }); } catch (err) { /* rien */ } }
  await effacer(`projets/${SECOND}`).catch(() => {});
  process.exit(2);
});
