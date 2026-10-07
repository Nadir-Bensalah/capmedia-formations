/* ==========================================================================
   CAPMEDIA CLIENT HUB · les pages de tous les projets, filtrables et
   fidèles à l'adresse (refonte du Cockpit, lot 2)

   Ce que prouve cette suite, dans le Cockpit (administrateur du banc) :
   - les anciennes adresses mènent à la nouvelle place : #/planning vers
     #/calendrier, #/documents vers #/fichiers, et les onglets Fichiers,
     Réunions et Activité d'un projet vers la page de tous les projets
     filtrée sur lui (?projet=) ; la fiche d'une réunion
     (#/projets/:p/reunions/:r) s'ouvre dans le Calendrier du projet ;
   - « ?projet= » est lu par Fichiers, Calendrier, Finances et Activité :
     la page ne montre que ce projet ;
   - les filtres vivent dans l'adresse (Demandes, Tâches, Finances,
     Fichiers, Activité, Axes) : le Retour et un rechargement les
     retrouvent ; le terme de recherche s'y réécrit sans empiler
     d'historique ;
   - /finances/:did et /validations/:vid ouvrent leur fiche même quand les
     données arrivent après le premier dessin (D4), aussi sur place ;
   - les anciennes adresses du tableau gardent leurs paramètres (T-006) ;
   - une adresse /tests ouverte depuis une autre /tests ouvre la campagne
     ou l'anomalie qu'elle vise, une seule fois (défaut relevé au lot 1) ;
   - le client garde sa page Fichiers telle quelle (filtres sur place).

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const CLIENTE = 'camille.essai@exemple.test';
const ANOMALIE = 'qa-l2-anomalie';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);
const str = (d, k) => (((d.fields || {})[k] || {}).stringValue || '');
const vrai = (d, k) => Boolean(((d.fields || {})[k] || {}).booleanValue);
const idDe = (d) => d.name.split('/').pop();

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

const dernierCode = async (e) => { for (let i = 0; i < 60; i += 1) { const p = (await docs('envois?pageSize=300')).filter((d) => ((d.fields.modele || {}).stringValue === 'code') && ((((d.fields.a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e))); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  await pause(2000);
};
const aller = async (page, h, attendu) => { await page.evaluate((x) => { location.hash = x; }, h); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(1000); };
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const valeur = (page, sel) => page.$eval(sel, (el) => el.value).catch(() => null);
const attendreHash = async (page, re, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (re.test(await hash(page))) return true; await pause(200); } return false; };
const fermer = async (page) => { await page.keyboard.press('Escape').catch(() => {}); await pause(300); await page.evaluate(() => document.querySelectorAll('.voile [data-fermer]').forEach((b) => b.click())).catch(() => {}); await pause(600); };
const egaux = (a, b) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  /* Une anomalie à viser par l'adresse (aucune dans le semis commun). */
  await fs.doc(`projets/atelier/anomalies/${ANOMALIE}`).set({
    projet: 'atelier', titre: 'Le rappel du lot 2 ne part jamais', gravite: 'majeur', statut: 'nouvelle', origine: 'equipe', plateformes: ['ios'],
    scenario: '', bloc: '', scenarios: [], temoins: [], description: 'Posée par la suite du lot 2.', obtenu: '', attendu: '', etapes: '',
    cree: admin.firestore.Timestamp.now(), maj: admin.firestore.Timestamp.now(),
  });
  const fichiersAtelier = (await docs('fichiers?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier' && !vrai(d, 'archive')).map(idDe);
  const facturesAtelier = (await docs('documents?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier' && str(d, 'type') === 'facture' && !vrai(d, 'archive')).map(idDe);
  const facturesAutres = (await docs('documents?pageSize=300')).filter((d) => str(d, 'projet') !== 'atelier' && str(d, 'type') === 'facture' && !vrai(d, 'archive')).map(idDe);
  const reunions = (await docs('reunions?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier');
  const revue = reunions.find((d) => /Revue de la version/.test(str(d, 'titre')));
  verifier(fichiersAtelier.length >= 2 && facturesAtelier.length >= 1 && revue, 'le semis porte des fichiers, des factures et une réunion passée sur Atelier', `${fichiersAtelier.length} ${facturesAtelier.length} ${Boolean(revue)}`);

  const nav = await chromium.launch();
  const erreurs = [];
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, ADMIN);
  verifier(/\/suivi\/cockpit/.test(page.url()), 'l administrateur du banc entre dans le Cockpit', page.url());

  /* ---------------------------------------------------------------- */
  console.log('\n== Le rail : Calendrier et Fichiers');
  const rail = await page.$$eval('#lat-corps .lat-lien', (as) => as.map((a) => `${a.dataset.chemin}=${a.textContent.replace(/\s+/g, ' ').trim()}`));
  verifier(rail.some((x) => /^\/calendrier=Calendrier/.test(x)) && rail.some((x) => /^\/fichiers=Fichiers/.test(x)), 'les entrées Calendrier et Fichiers', rail.join(' | '));
  verifier(!rail.some((x) => /^\/(planning|documents)=/.test(x)), 'plus d entrée Planning ni Documents', rail.join(' | '));

  /* ---------------------------------------------------------------- */
  console.log('\n== Les anciennes adresses mènent à leur nouvelle place');
  await aller(page, '#/planning', '.calendrier');
  verifier(await attendreHash(page, /^#\/calendrier$/) && (await texteDe(page, '.page h1')) === 'Calendrier', '#/planning ouvre le Calendrier', await hash(page));
  verifier(await page.$('#lat-corps .lat-lien.actif[data-chemin="/calendrier"]') !== null, 'et l entrée Calendrier du rail s allume');
  await aller(page, '#/documents', '#recherche-doc');
  verifier(await attendreHash(page, /^#\/fichiers$/) && (await texteDe(page, '.page h1')) === 'Fichiers', '#/documents ouvre les Fichiers', await hash(page));
  await aller(page, '#/documents?projet=atelier', '#recherche-doc');
  verifier(await attendreHash(page, /^#\/fichiers\?projet=atelier$/), '#/documents?projet= garde son projet', await hash(page));

  await aller(page, '#/projets/atelier/fichiers', '#recherche-doc');
  verifier(await attendreHash(page, /^#\/fichiers\?projet=atelier$/), 'l onglet Fichiers d un projet mène aux Fichiers filtrés sur lui', await hash(page));
  verifier((await valeur(page, '#filtre-projet')) === 'atelier', 'le projet est choisi dans la page', await valeur(page, '#filtre-projet'));
  const cartes = await page.$$eval('#vue .fichier[data-id]', (els) => els.map((e) => e.dataset.id));
  verifier(egaux(cartes, fichiersAtelier), 'la page montre les fichiers d Atelier, et eux seuls', `${cartes.join(',')} / ${fichiersAtelier.join(',')}`);
  verifier(Boolean(await page.$('#vue [data-cat]')) && Boolean(await page.$('#vue [data-deposer]')), 'avec les catégories et « Déposer », comme l onglet');
  await aller(page, '#/projets/atelier/fichiers?f=fic-maquettes', '#recherche-doc');
  verifier(await attendreHash(page, /^#\/fichiers\?projet=atelier&f=fic-maquettes$/) && Boolean(await page.$('#vue .fichier--montre[data-id="fic-maquettes"]')), 'un lien vers un fichier l éclaire dans la page', await hash(page));

  await aller(page, '#/projets/atelier/reunions', '#reunions-projet');
  verifier(await attendreHash(page, /^#\/calendrier\?projet=atelier$/), 'l onglet Réunions mène au Calendrier du projet', await hash(page));
  const blocReunions = await texteDe(page, '#reunions-projet');
  verifier(/À venir/i.test(blocReunions) && /Point hebdomadaire/.test(blocReunions) && /Passées/i.test(blocReunions) && /Revue de la version 1\.1/.test(blocReunions), 'ses réunions, à venir et passées, comme l onglet', blocReunions.slice(0, 200));
  verifier((await valeur(page, '#f-projet')) === 'atelier' && /Atelier/.test(await texteDe(page, '.page .chapo')), 'le Calendrier est celui d Atelier');
  if (revue) {
    await aller(page, `#/projets/atelier/reunions/${idDe(revue)}`, '.voile .feuille');
    verifier(await attendreHash(page, new RegExp(`^#/calendrier\\?projet=atelier&reunion=${idDe(revue)}$`)), 'l adresse d une réunion mène au Calendrier du projet', await hash(page));
    verifier(/Revue de la version 1\.1/.test(await texteDe(page, '.voile .feuille .modale-tete h2')) && Boolean(await page.$('.voile .feuille [data-action-reunion]')) && Boolean(await page.$('.voile .feuille [data-suppr]')) && Boolean(await page.$('.voile .feuille [data-editer]')), 'et ouvre sa fiche entière : actions, Modifier, Supprimer');
    await fermer(page);
    verifier(await attendreHash(page, /^#\/calendrier\?projet=atelier$/) && !(await page.$('.voile')), 'refermée, l adresse redevient celle du Calendrier', await hash(page));
  }
  /* « Ouvrir la fiche » depuis le détail d'une pastille : la fiche s'ouvre sur place. */
  const pastille = await page.$('#vue a.evt[data-evt^="reunion:"]');
  if (pastille) {
    await pastille.click(); await page.waitForSelector('.modale--cal [data-fiche]', { timeout: 8000 }).catch(() => {});
    await page.click('.modale--cal [data-fiche]').catch(() => {}); await pause(1500);
    verifier(/^#\/calendrier\?projet=atelier&reunion=/.test(await hash(page)) && Boolean(await page.$('.voile .feuille .modale-pied [data-editer]')) && !(await page.$('.modale--cal')), '« Ouvrir la fiche » d une réunion l ouvre dans le Calendrier, le détail refermé', await hash(page));
    await fermer(page);
  }

  await aller(page, '#/projets/atelier/activite', '#vue .chrono');
  verifier(await attendreHash(page, /^#\/activite\?projet=atelier$/) && (await valeur(page, '#f-projet')) === 'atelier' && Boolean(await page.$('#vue .chrono')), 'l onglet Activité mène à l Activité filtrée sur le projet', await hash(page));
  await aller(page, '#/projets/atelier', '#onglet-corps');
  verifier(Boolean(await page.$('#onglet-corps a.lien[href="#/activite?projet=atelier"]')), '« Tout voir » de l aperçu mène à l Activité du projet');

  /* ---------------------------------------------------------------- */
  console.log('\n== « ?projet= » est lu');
  await aller(page, '#/finances?projet=atelier', '#vue .metriques');
  const lignesFactures = await page.$$eval('#vue .liste [data-id]', (els) => els.map((e) => e.dataset.id));
  verifier((await valeur(page, '#f-projet')) === 'atelier' && egaux(lignesFactures, facturesAtelier), 'Finances : les factures d Atelier, et elles seules', `${lignesFactures.join(',')} / ${facturesAtelier.join(',')}`);
  verifier(!facturesAutres.some((id) => lignesFactures.includes(id)), 'aucune facture d un autre projet');

  /* ---------------------------------------------------------------- */
  console.log('\n== Les filtres vivent dans l adresse');
  await aller(page, '#/taches', '#f-projet');
  await page.selectOption('#f-projet', 'atelier'); await pause(800);
  await page.check('#f-retard'); await pause(800);
  verifier(/^#\/taches\?projet=atelier&retard=1$/.test(await hash(page)), 'Tâches : projet et retard dans l adresse', await hash(page));
  await aller(page, '#/projets', '.page h1');
  await page.goBack(); await pause(1500);
  verifier(/^#\/taches\?projet=atelier&retard=1$/.test(await hash(page)) && (await valeur(page, '#f-projet')) === 'atelier' && await page.$eval('#f-retard', (c) => c.checked).catch(() => false), 'le Retour les retrouve', await hash(page));

  await aller(page, '#/demandes', '#terme');
  await page.click('[data-colonne="a-traiter"]'); await pause(800);
  verifier(/^#\/demandes\?colonne=a-traiter$/.test(await hash(page)) && Boolean(await page.$('.onglet.actif[data-colonne="a-traiter"]')), 'Demandes : la colonne dans l adresse', await hash(page));
  const longueur = await page.evaluate(() => history.length);
  await page.fill('#terme', 'zzz'); await pause(600);
  verifier(/terme=zzz/.test(await hash(page)) && (await page.evaluate(() => history.length)) === longueur, 'le terme de recherche s y écrit sans empiler l historique', `${await hash(page)} ${longueur}`);
  await aller(page, '#/', '.page h1');
  await page.goBack(); await pause(1500);
  verifier((await valeur(page, '#terme')) === 'zzz' && Boolean(await page.$('.onglet.actif[data-colonne="a-traiter"]')), 'le Retour retrouve colonne et terme', await hash(page));

  await aller(page, '#/finances', '#vue .metriques');
  await page.click('#vue .onglets [data-onglet="devis"]'); await pause(800);
  verifier(/^#\/finances\?onglet=devis$/.test(await hash(page)), 'Finances : l onglet dans l adresse', await hash(page));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#vue .metriques', { timeout: 30000 }).catch(() => {}); await pause(1500);
  verifier(Boolean(await page.$('#vue .onglet.actif[data-onglet="devis"]')), 'un rechargement le retrouve');

  await aller(page, '#/activite', '#f-interne');
  await page.click('[data-nature="tache"]'); await pause(700);
  await page.uncheck('#f-interne'); await pause(700);
  verifier(/^#\/activite\?nature=tache&interne=0$/.test(await hash(page)), 'Activité : nature et interne dans l adresse', await hash(page));
  await page.goBack(); await pause(1200);
  verifier(/^#\/activite\?nature=tache$/.test(await hash(page)) && await page.$eval('#f-interne', (c) => c.checked).catch(() => false) && Boolean(await page.$('.filtre.actif[data-nature="tache"]')), 'le Retour revient d un cran', await hash(page));

  await aller(page, '#/fichiers?projet=atelier', '#recherche-doc');
  await page.click('#vue [data-cat="design"]'); await pause(800);
  const design = await page.$$eval('#vue .fichier[data-id]', (els) => els.map((e) => e.dataset.id));
  verifier(/^#\/fichiers\?projet=atelier&categorie=design$/.test(await hash(page)) && design.includes('fic-maquettes') && !design.includes('fic-contrat'), 'Fichiers : la catégorie dans l adresse, la liste suit', `${await hash(page)} ${design.join(',')}`);

  await aller(page, '#/projets/atelier/evolutions', '.page');
  const plateforme = await page.$$eval('[data-axe-filtre]', (bs) => bs.map((b) => b.dataset.axeFiltre).filter(Boolean)[0] || '').catch(() => '');
  if (plateforme) {
    await page.click(`[data-axe-filtre="${plateforme}"]`); await pause(800);
    const blocs = await page.$$eval('[data-axes-plateforme]', (els) => els.map((e) => e.dataset.axesPlateforme));
    verifier(new RegExp(`^#/projets/atelier/evolutions\\?plateforme=${plateforme}$`).test(await hash(page)) && blocs.length === 1 && blocs[0] === plateforme && Boolean(await page.$(`[data-axe-filtre="${plateforme}"][aria-pressed="true"]`)), 'Axes : la plateforme dans l adresse', `${await hash(page)} ${blocs.join(',')}`);
  } else console.log('  (Atelier n a qu une plateforme d axes ici : filtre non montré)');

  /* ---------------------------------------------------------------- */
  console.log('\n== Les liens vers une fiche attendent leurs données (D4)');
  const neuve = async (h) => {
    const p = await ctx.newPage(); p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    await p.goto(`${SITE}/suivi/cockpit?emul${h}`, { waitUntil: 'domcontentloaded' });
    return p;
  };
  const p1 = await neuve('#/finances/f-acompte');
  await p1.waitForSelector('.voile .feuille .modale-tete h2', { timeout: 25000 }).catch(() => {});
  verifier(/F-2026-031/.test(await texteDe(p1, '.voile .feuille .modale-tete h2')), '/finances/:did ouvert à froid : la fiche s ouvre');
  await fermer(p1);
  verifier(await attendreHash(p1, /^#\/finances$/), 'refermée, l adresse redevient /finances', await hash(p1));
  await p1.evaluate(() => { location.hash = '#/finances/f-acompte'; }); await p1.waitForSelector('.voile .feuille', { timeout: 10000 }).catch(() => {}); await pause(600);
  verifier(/F-2026-031/.test(await texteDe(p1, '.voile .feuille .modale-tete h2')), 'et depuis la page Finances, sur place');
  await p1.close();
  const p2 = await neuve('#/validations/v-maquette');
  await p2.waitForSelector('.voile .feuille [data-annuler]', { timeout: 25000 }).catch(() => {});
  verifier(Boolean(await p2.$('.voile .feuille [data-annuler]')), '/validations/:vid ouvert à froid : la fiche s ouvre');
  await p2.close();
  const p3 = await neuve('#/finances/piece-qui-n-existe-pas');
  await pause(6000);
  verifier(/^#\/finances$/.test(await hash(p3)) && !(await p3.$('.voile .feuille')), 'une pièce inconnue : retour à Finances, sans fiche', await hash(p3));
  await p3.close();

  /* ---------------------------------------------------------------- */
  console.log('\n== Les anciennes adresses du tableau gardent leurs paramètres (T-006)');
  await aller(page, '#/tableau?projet=atelier&onglet=automatises', '#onglets-tests');
  verifier(await attendreHash(page, /^#\/tests\?projet=atelier&onglet=automatises$/) && Boolean(await page.$('#onglets-tests .onglet.actif[data-onglet="automatises"]')), '#/tableau garde l onglet', await hash(page));
  await aller(page, '#/tests/tableau?projet=atelier&plateforme=ios', '#onglets-tests');
  verifier(await attendreHash(page, /^#\/tests\?projet=atelier&plateforme=ios$/) && Boolean(await page.$('[data-plateforme="ios"][aria-pressed="true"]')), '#/tests/tableau garde la plateforme', await hash(page));

  /* ---------------------------------------------------------------- */
  console.log('\n== Une adresse /tests ouverte depuis une autre /tests');
  await aller(page, '#/tests?projet=atelier', '#onglets-tests');
  await page.evaluate(() => { location.hash = '#/tests?projet=atelier&campagne=c-oct'; });
  await page.waitForSelector('.voile .modale-tete h2', { timeout: 15000 }).catch(() => {});
  verifier(/Campagne du banc/.test(await texteDe(page, '.voile .modale-tete h2')), '« &campagne= » ouvre la campagne sur place');
  verifier(!/campagne=/.test(await hash(page)), 'puis quitte l adresse', await hash(page));
  await fermer(page);
  await page.click('[data-plateforme="android"]').catch(() => {}); await pause(1800);
  verifier(!(await page.$('.voile')), 'un filtre ensuite ne la rouvre pas');
  await page.evaluate((id) => { location.hash = `#/tests?projet=atelier&onglet=automatises&anomalie=${id}`; }, ANOMALIE);
  await page.waitForSelector('.voile .feuille', { timeout: 15000 }).catch(() => {});
  verifier(/rappel du lot 2/.test(await texteDe(page, '.voile .feuille')) && Boolean(await page.$('#onglets-tests .onglet.actif[data-onglet="problemes"]')), '« &anomalie= » ouvre l anomalie sur place, dans Problèmes', await texteDe(page, '.voile .feuille .modale-tete'));
  await fermer(page);

  /* ---------------------------------------------------------------- */
  console.log('\n== Le client garde sa page Fichiers');
  const ctxC = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const cl = await ctxC.newPage(); cl.on('pageerror', (e) => erreurs.push(`client: ${e.message.slice(0, 160)}`));
  await connecter(cl, CLIENTE);
  await aller(cl, '#/fichiers?projet=atelier', '#recherche-doc');
  verifier(!(await cl.$('#filtre-projet')) && (await texteDe(cl, '.page h1')) === 'Fichiers', 'pas de choix de projet chez le client, le titre Fichiers');
  const avant = await hash(cl);
  const cat = await cl.$('#vue [data-cat]:not([data-cat=""])');
  if (cat) { await cat.click(); await pause(800); }
  verifier((await hash(cl)) === avant, 'une catégorie se choisit sur place, l adresse ne bouge pas', `${avant} -> ${await hash(cl)}`);
  await ctxC.close();

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await ctx.close();
  await nav.close();
  await fs.doc(`projets/atelier/anomalies/${ANOMALIE}`).delete().catch(() => {});
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
