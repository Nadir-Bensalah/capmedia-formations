/* Le lot B2 (audit UX du 03/10, côté client), éprouvé dans le navigateur :
    1. le chiffre de Tickets ne compte que les tickets qui attendent le
       client ; la page de tous les projets est « En attente de vous » ;
       le même filtre « Pour vous » partout ;
    2. un seul lexique : « ticket » au masculin, « Planning », « iPhone » ;
    3. le téléphone (390 px) et le portable (1440 × 900) : pas de bulle sur
       Messages, la bulle ne couvre pas « Envoyer », le pied du rail reste
       visible, la clé d'accès proposée une seule fois, pas de raccourci
       clavier sur un écran tactile ;
    4. l'aperçu allégé : une seule place par information ;
    5. le rail : « Chiffré » avec un coffre ouvert seulement, plus de repère
       de Maintenance, plus de chiffres gris sur Calendrier et Notes ;
    6. les tâches : ce que Capmedia a en main, les terminées repliées.
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

(async () => {
  const nav = await chromium.launch();
  const erreurs = []; const garder = (p) => p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  const uid = await uidDe('camille.essai@exemple.test');
  await poser(`profils/${uid}`, { accueil: T(new Date()), pavesAttente: M({ accueil: S('ouvert'), projets: M({ atelier: S('ouvert') }) }) }, ['accueil', 'pavesAttente']);
  await poser('tickets/t-anniv', { statut: S('a-valider') }, ['statut']);

  /* ----------------------------------------------------- 1440 × 900 */
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage(); garder(page);
  await connecter(page, 'camille.essai@exemple.test');
  const arbre = '#lat-corps .lat-arbre[data-arbre="atelier"]';
  await attendre(async () => Boolean(await page.$(`${arbre}.deplie`)));

  console.log('\n== 1. Le chiffre de Tickets, « En attente de vous », « Pour vous »');
  await aller(page, '#/projets/atelier/demandes', '#demandes-projet');
  const pourVous = Number(await texteDe(page, '[data-filtre-demandes="moi"] .compte')) || 0;
  const rouge = Number(await texteDe(page, `${arbre} a[data-chemin="/projets/atelier/demandes"] .compte.vif`)) || 0;
  const pointsAttente = (await page.$$('#en-attente-projet .ligne')).length;
  verifier(pourVous > 0 && rouge === pourVous, 'le chiffre orange de Tickets = les tickets « Pour vous »', `${rouge} / ${pourVous}`);
  verifier(pointsAttente > rouge, 'il ne compte plus les validations, tâches et points bloquants', `${pointsAttente} points, ${rouge} tickets`);
  verifier(/Pour vous/.test(await texteDe(page, '#demandes-projet .filtres')), 'le filtre du projet s appelle « Pour vous »');
  await aller(page, '#/demandes', '.page h1');
  verifier((await texteDe(page, '.page h1')) === 'En attente de vous', 'la page de tous les projets s appelle « En attente de vous »', await texteDe(page, '.page h1'));
  verifier(/En attente de vous/.test(await texteDe(page, '#ariane')) && !/Tickets/.test(await texteDe(page, '#ariane')), 'son fil d Ariane aussi', await texteDe(page, '#ariane'));
  verifier(/^En attente de vous/.test(await page.title()), 'et l onglet du navigateur', await page.title());
  verifier(/Pour vous/.test(await texteDe(page, '#vos-demandes .filtres')) && !/À vous/.test(await texteDe(page, '#vos-demandes .filtres')), 'le même filtre « Pour vous », plus « À vous »');

  console.log('\n== 2. Le lexique : ticket au masculin, Planning, iPhone');
  await page.click('[data-filtre="toutes"]'); await pause(500);
  const pastilles = await page.$$eval('#vos-demandes .pastille', (l) => l.map((x) => x.textContent.trim()));
  verifier(pastilles.length > 0 && !pastilles.some((x) => /^(Reçue|Acceptée|Planifiée|Terminée|Refusée|Annulée|Fermée)$/.test(x)), 'les statuts des tickets au masculin', pastilles.join(', '));
  await aller(page, '#/projets/atelier/demandes/t-anniv', '.suivi-demande');
  const fiche = await texteDe(page, '#vue');
  verifier(/Demandé par/.test(fiche) && !/Demandée par|Suivie par|Ouverte depuis|Livrée dans/.test(fiche), '« Demandé par », « Suivi par », « Ouvert depuis »', fiche.match(/(Demandé\S* par|Suivi\S* par)/g) && fiche.match(/(Demandé\S* par|Suivi\S* par)/g).join(' '));
  verifier((fiche.match(/Dernier mouvement/g) || []).length === 1, '« Dernier mouvement » une seule fois sur la fiche', String((fiche.match(/Dernier mouvement/g) || []).length));
  await aller(page, '#/messages/atelier', '.page h1');
  verifier(/préférez un ticket : il est suivi/.test(await texteDe(page, '.page-tete')), 'Messages : « préférez un ticket : il est suivi »', await texteDe(page, '.page-tete .chapo'));
  await aller(page, '#/parametres', '.page h1');
  verifier(/Mouvements de mes tickets/.test(await texteDe(page, '#vue')) && !/Mouvements de mes demandes/.test(await texteDe(page, '#vue')), 'Paramètres : « Mouvements de mes tickets »');
  await aller(page, '#/projets/atelier', '.page-tete--projet');
  const apercu = await texteDe(page, '#vue');
  verifier(/Application iPhone/.test(apercu) && !/feuille de route/i.test(apercu), 'l aperçu dit « Application iPhone » et « Planning », jamais « feuille de route »');
  const typesParties = await page.$$eval('[data-partie] .rang-espace.t-micro span:first-child', (l) => l.map((x) => x.textContent.trim()));
  verifier(typesParties.length > 0 && !typesParties.includes('Application iOS'), 'les cartes des parties : « Application iPhone », plus « Application iOS »', typesParties.join(', '));
  await aller(page, '#/tests?projet=atelier', '.page h1', 25000);
  const pucesTests = await page.$$eval('#vue .puce, #vue [data-plateforme], #vue .onglet, #vue button', (l) => l.map((x) => x.textContent.trim()).filter((t) => /^iOS\b/.test(t)));
  verifier(pucesTests.length === 0, 'la campagne de tests : aucun libellé « iOS » de l interface', pucesTests.slice(0, 5).join(' | '));

  console.log('\n== 4. L aperçu allégé');
  await aller(page, '#/projets/atelier', '#points-bloquants');
  const pouls = await texteDe(page, '.pouls');
  verifier(!/Attendu de vous|voir ci-dessus/.test(pouls), 'le pouls ne répète plus « Attendu de vous »', pouls.slice(0, 120));
  const aside = await page.$$eval('#vue aside .surtitre', (l) => l.map((x) => x.textContent.trim()));
  verifier(!aside.includes('Validations') && !aside.includes('Tickets') && !/Voir les tickets/.test(await texteDe(page, '#vue aside')), 'la colonne de droite ne redit plus les validations ni les tickets', aside.join(', '));
  const vueTexte = await page.$eval('#vue', (el) => el.innerText);
  const fois = (vueTexte.match(/Publication Android bloquée/g) || []).length;
  verifier(fois === 1, 'le point bloquant n apparaît qu une fois', `${fois} fois`);
  verifier(!/point bloquant/.test(await texteDe(page, '.page-tete--projet')), 'l en-tête ne le redit pas');
  verifier(!/Travail fait/.test(vueTexte) && Boolean(await page.$('#source-progression')), 'le pourcentage du travail une seule fois : l anneau, sans la jauge « Travail fait »');
  verifier(/Temps écoulé/.test(vueTexte), 'la jauge du temps reste');
  await aller(page, '#/projets/atelier/etapes', '#onglet-corps .liste');
  verifier(!(await page.$('#onglet-corps .route')) && (await page.$$('#onglet-corps .liste .ligne')).length > 0, 'Planning : un seul format, la liste par phase');

  console.log('\n== 5. Le rail');
  const coffreExiste = Boolean((await lire('coffres/atelier')).fields);
  const marqueur = await page.$(`${arbre} a[href="#/projets/atelier/coffre"] .lat-marqueur`);
  verifier(coffreExiste ? Boolean(marqueur) : !marqueur, `« Chiffré » ${coffreExiste ? 'avec' : 'sans'} coffre ouvert : ${coffreExiste ? 'présent' : 'absent'}`);
  verifier(!(await page.$(`${arbre} .lat-repere`)), 'plus de repère « ⊘ » sur Maintenance');
  const grisCal = await page.$(`${arbre} a[href="#/calendrier?projet=atelier"] .compte`);
  const grisNotes = await page.$(`${arbre} a[href="#/projets/atelier/notes"] .compte`);
  verifier(!grisCal && !grisNotes, 'Calendrier et Notes sans chiffre gris');
  /* Un coffre posé dans la base : le marqueur arrive, sans recharger. */
  if (!coffreExiste) {
    await poser('coffres/atelier', { version: N(1) }, null);
    verifier(await attendre(async () => Boolean(await page.$(`${arbre} a[href="#/projets/atelier/coffre"] .lat-marqueur`)), 8000), 'le coffre ouvert : « Chiffré » apparaît');
    await effacer('coffres/atelier');
    verifier(await attendre(async () => !(await page.$(`${arbre} a[href="#/projets/atelier/coffre"] .lat-marqueur`)), 8000), 'retiré : le marqueur s en va');
  }

  console.log('\n== 6. Les tâches');
  await aller(page, '#/projets/atelier/taches', '#onglet-corps .section-tete h2');
  const principales = await page.$$eval('#onglet-corps > section > .liste .pastille', (l) => l.map((x) => x.textContent.trim()));
  verifier(principales.length > 0 && !principales.some((x) => /^(Terminée|À vous)$/.test(x)), 'la liste ne montre que ce que Capmedia a en main', principales.join(', '));
  const terminees = await page.$eval('#taches-terminees', (d) => ({ ouvert: d.open, n: d.querySelectorAll('.ligne').length, titre: d.querySelector('summary').textContent.trim() })).catch(() => null);
  verifier(terminees && !terminees.ouvert && terminees.n > 0 && /^Terminées/.test(terminees.titre), 'les terminées dans un bloc « Terminées » replié', JSON.stringify(terminees));
  verifier(/En attente de vous/.test(await texteDe(page, '#taches-a-vous')) && Boolean(await page.$('#taches-a-vous a[href="#/projets/atelier/demandes"]')), 'celles « À vous » renvoient vers « En attente de vous »', await texteDe(page, '#taches-a-vous'));

  console.log('\n== 3. Le portable 1440 × 900 : le pied du rail');
  const pied = async (p) => p.evaluate(() => {
    const vu = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; return r.height > 0 && r.bottom <= window.innerHeight + 1 && r.top >= 0 && document.elementFromPoint(x, y) && el.contains(document.elementFromPoint(x, y)); };
    return { parametres: vu('#lat-corps a[data-chemin="/parametres"]'), annonces: vu('#lat-corps a[data-chemin="/annonces"]'), theme: vu('.theme-rail'), defile: document.querySelector('#lat-corps').scrollHeight > document.querySelector('#lat-corps').clientHeight };
  });
  await page.$eval('#lat-corps', (c) => { c.scrollTop = 0; });
  const p1440 = await pied(page);
  verifier(p1440.parametres && p1440.annonces && p1440.theme, '1440 × 900 : Paramètres, Annonces et le thème restent visibles', JSON.stringify(p1440));
  await aller(page, '#/messages/atelier', '.page h1');
  verifier(await attendre(async () => !(await page.$('.bulle #bulle-ouvrir')), 4000), '1440 : pas de bulle sur la page Messages');
  await aller(page, '#/projets/atelier', '.page-tete--projet');
  verifier(await attendre(async () => Boolean(await page.$('.bulle #bulle-ouvrir')), 6000), 'elle revient en quittant Messages');
  await ctx.close();

  console.log('\n== 3. Le téléphone 390 px');
  const tctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const tel = await tctx.newPage(); garder(tel);
  page = tel;
  await connecter(tel, 'camille.essai@exemple.test');
  await aller(tel, '#/messages/atelier', '.page h1');
  verifier(await attendre(async () => !(await tel.$('.bulle #bulle-ouvrir')), 4000), '390 : pas de bulle sur Messages, la conversation n est plus montrée deux fois');
  const envoyer = await tel.$eval('#forme-message [type="submit"]', (b) => { b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width - 6, r.top + r.height / 2); return Boolean(el && b.contains(el)); }).catch(() => false);
  verifier(envoyer, '390 : « Envoyer » n est couvert par rien sur Messages');
  verifier(await tel.$eval('#vue .aide-clavier', (el) => getComputedStyle(el).display === 'none').catch(() => false), '390 tactile : « Entrée pour envoyer, Maj+Entrée » masqué');
  await aller(tel, '#/projets/atelier/demandes/t-anniv', '.suivi-demande');
  const surFiche = await tel.$eval('#forme-message [type="submit"], [data-action="valider-client"], .suivi-demande', (b) => { b.scrollIntoView({ block: 'end' }); return true; }).catch(() => false);
  void surFiche;
  await tel.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await pause(500);
  const libre = await tel.evaluate(() => {
    const bulle = document.querySelector('.bulle #bulle-ouvrir'); if (!bulle) return { bulle: false, ok: true };
    const rb = bulle.getBoundingClientRect();
    const boutons = [...document.querySelectorAll('#vue button[type="submit"], #vue .btn-principal')].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight; });
    const touche = boutons.filter((b) => { const r = b.getBoundingClientRect(); return !(r.right < rb.left || r.left > rb.right || r.bottom < rb.top || r.top > rb.bottom); });
    return { bulle: true, ok: touche.length === 0, touche: touche.map((b) => b.textContent.trim()) };
  });
  verifier(libre.ok, '390 : au bas d un ticket, la bulle ne couvre aucun bouton', JSON.stringify(libre));
  verifier(await tel.$eval('#bouton-recherche kbd', (k) => getComputedStyle(k).display === 'none').catch(() => true), '390 tactile : « ⌘K » masqué');
  await tel.click('#bouton-menu'); await pause(700);
  await tel.$eval('#lat-corps', (c) => { c.scrollTop = 0; });
  const p390 = await pied(tel);
  verifier(p390.parametres && p390.annonces && p390.theme, '390 : rail ouvert, Paramètres, Annonces et le thème visibles, la liste défile au-dessus', JSON.stringify(p390));

  console.log('\n== 3. La clé d accès proposée une seule fois');
  const proposee = async () => {
    await tel.evaluate(() => { sessionStorage.setItem('suivi:proposer-cle', '1'); });
    await tel.reload({ waitUntil: 'domcontentloaded' }); await tel.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }); await pause(2000);
    return /Ajouter une clé d.accès/.test(await texteDe(tel, '.toasts'));
  };
  await tel.evaluate((u) => { try { localStorage.removeItem(`suivi:cle-proposee:${u}`); } catch (e) { /* rien */ } }, uid);
  const premiere = await proposee();
  const seconde = await proposee();
  verifier(premiere && !seconde, 'proposée à la première connexion par code, plus à la suivante', `${premiere} puis ${seconde}`);
  await tctx.close();

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => { console.error('ÉCHEC', e); process.exit(2); });
