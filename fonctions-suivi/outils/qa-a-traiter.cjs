/* ==========================================================================
   CAPMEDIA CLIENT HUB · la boîte « À traiter » et le rail global du
   Cockpit (refonte, lot 4)

   Ce que prouve cette suite, dans le Cockpit :
   - la page À traiter (#/a-traiter) : chaque genre APPARAÎT quand une
     chose attend l'équipe, puis DISPARAÎT quand elle est traitée, sans
     recharger : un ticket nouveau (résolu), une tâche en retard (faite),
     un point bloquant de notre côté (levé), un problème des tests à
     confirmer (confirmé), un devis demandé par le calculateur (écarté), un
     forfait de maintenance demandé (proposé), une demande de nouveau
     projet (devis envoyé), un accès à arbitrer (tranché), une note
     partagée par un client (plus partagée) ; le compte rouge de l'entrée
     À traiter suit, au point près ;
   - le filtre par genre vit dans l'adresse (?genre=) et redessine en
     place, sans squelette ; le Retour le retrouve ;
   - le rail : Aujourd'hui, À traiter (Tickets, Tâches, Validations),
     Messages (Clients, Testeurs), Calendrier, Tests ; Portefeuille,
     Finances et Pilotage repliés d'office, chacun portant la somme de ses
     rouges ; la page ouverte déplie son groupe ; le choix se retient ;
     Équipe et Paramètres au pied ;
   - les comptes corrigés (D5) : Fichiers sans les archivés, Messages
     autant que de conversations listées, le rouge de Devis et factures
     les seules factures dues ;
   - « Nouveau ticket » depuis Tickets et depuis ⌘K, avec le choix du
     projet ; la palette alignée sur le Hub (Actions, Pages, Tickets,
     Validations, Versions) ;
   - un agent : ni les entrées de l'administration, ni la demande de
     nouveau projet dans sa boîte.

   Banc : émulateurs (Functions compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.boite@exemple.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail !== undefined ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

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
const railDessine = (page) => page.waitForFunction(() => document.querySelector('#lat-corps .lat-lien[data-chemin="/demandes"]') && !document.querySelector('#lat-corps .lat-squelette'), null, { timeout: 20000 }).catch(() => {});
const aller = async (page, h, attendu) => { await page.evaluate((x) => { location.hash = x; }, h); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(800); };
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const attendre = async (fn, ms = 12000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* encore */ } await pause(250); } return false; };
const groupe = (id) => `#lat-corps .lat-arbre[data-arbre="${id}"]`;
const deplie = (page, id) => page.$eval(groupe(id), (a) => a.classList.contains('deplie')).catch(() => null);
const rougeBoite = (page) => page.$eval(`${groupe(':a-traiter')} .lat-projet .compte.vif`, (el) => Number(el.textContent)).catch(() => 0);
const lignesDe = (page, genre) => page.$$eval(`#vue section[data-genre="${genre}"] a.ligne`, (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
const toutesLignes = (page) => page.$$eval('#vue a.ligne[data-genre-item]', (as) => as.length).catch(() => -1);

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  const T = admin.firestore.Timestamp;
  const ilYA = (j) => T.fromMillis(Date.now() - j * 86400000);
  const a1 = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Boîte', role: 'agent', projets: ['atelier'] });
  verifier(a1.code === 200, 'un agent sur Atelier seul', `${a1.code} ${a1.texte.slice(0, 120)}`);

  const nav = await chromium.launch();
  const erreurs = [];
  const contexte = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    return page;
  };

  /* ---------------------------------------------------------------- */
  console.log('\n== Le rail global');
  const pa = await contexte();
  await connecter(pa, ADMIN);
  await railDessine(pa); await pause(1500);
  const haut = await pa.$$eval('#lat-corps .lat-groupe:first-child > .lat-lien, #lat-corps .lat-groupe:first-child > .lat-arbre > .lat-arbre-tete > .lat-lien', (as) => as.map((a) => a.dataset.chemin));
  verifier(JSON.stringify(haut) === JSON.stringify(['/', '/a-traiter', '/messages', '/calendrier', '/tests']), 'en haut : Aujourd hui, À traiter, Messages, Calendrier, Tests', haut.join(' '));
  verifier(/Aujourd'hui/.test(await texteDe(pa, '#lat-corps .lat-lien[data-chemin="/"]')), '« Accueil » s appelle « Aujourd hui »');
  const sousATraiter = await pa.$$eval(`${groupe(':a-traiter')} .lat-branche .lat-lien`, (as) => as.map((a) => `${a.dataset.chemin}=${a.querySelector('.tronque').textContent.trim()}`));
  verifier(JSON.stringify(sousATraiter) === JSON.stringify(['/demandes=Tickets', '/taches=Tâches', '/validations=Validations']), 'sous À traiter : Tickets, Tâches, Validations', sousATraiter.join(' '));
  const sousMessages = await pa.$$eval(`${groupe(':messages')} .lat-branche .lat-lien`, (as) => as.map((a) => `${a.dataset.chemin}=${a.querySelector('.tronque').textContent.trim()}`));
  verifier(JSON.stringify(sousMessages) === JSON.stringify(['/messages=Clients', '/testeurs-messages=Testeurs']), 'sous Messages : Clients, Testeurs', sousMessages.join(' '));
  verifier(await deplie(pa, ':a-traiter') === true && await deplie(pa, ':messages') === true, 'À traiter et Messages dépliés d office');
  const replies = await Promise.all([':portefeuille', ':finances', ':pilotage'].map((g) => deplie(pa, g)));
  verifier(replies.every((x) => x === false), 'Portefeuille, Finances, Pilotage repliés d office', JSON.stringify(replies));
  const contenu = await pa.$$eval('#lat-corps .lat-arbre--groupe', (gs) => gs.map((g) => `${g.dataset.arbre}:${[...g.querySelectorAll('.lat-branche .lat-lien')].map((a) => a.dataset.chemin).join(',')}`));
  verifier(JSON.stringify(contenu) === JSON.stringify([':portefeuille:/clients,/nouveaux-projets,/a-faire,/fichiers,/archives', ':finances:/finances,/maintenance', ':pilotage:/controle,/emails,/activite,/annonces']), 'leurs entrées, à leur place', contenu.join(' | '));
  const pied = await pa.$$eval('#lat-corps .lat-groupe--pied .lat-lien', (as) => as.map((a) => a.dataset.chemin));
  verifier(pied.join(',') === '/equipe,/parametres', 'Équipe et Paramètres épinglés au pied', pied.join(','));
  /* Un groupe replié porte la somme de ses rouges. */
  const sommes = await pa.$$eval('#lat-corps .lat-arbre--groupe:not(.deplie)', (gs) => gs.map((g) => {
    const tete = Number((g.querySelector('.lat-groupe-tete .compte.vif') || {}).textContent || 0);
    const enfants = [...g.querySelectorAll('.lat-branche .compte.vif')].reduce((n, x) => n + Number(x.textContent), 0);
    return { id: g.dataset.arbre, tete, enfants };
  }));
  verifier(sommes.length === 3 && sommes.every((s) => s.tete === s.enfants) && sommes.some((s) => s.tete > 0), 'replié, chaque groupe porte la somme des rouges de ses entrées', JSON.stringify(sommes));

  console.log('\n== Les comptes corrigés (D5)');
  const fichiersBase = (await docs('fichiers?pageSize=300')).filter((d) => !(((d.fields || {}).archive || {}).booleanValue));
  const nb = async (sel) => Number(((await pa.$eval(sel, (el) => el.textContent).catch(() => '')) || '').trim()) || 0;
  verifier(await nb('#lat-corps .lat-lien[data-chemin="/fichiers"]:not([data-projet]) .compte') === fichiersBase.length, 'Fichiers : les fichiers non archivés, comme la page', `${await nb('#lat-corps .lat-lien[data-chemin="/fichiers"]:not([data-projet]) .compte')} / ${fichiersBase.length}`);
  const projetsBase = (await docs('projets?pageSize=300')).filter((d) => !(((d.fields || {}).archive || {}).booleanValue)).length;
  await aller(pa, '#/messages', '#liste-conversations');
  const conversations = await pa.$$eval('#liste-conversations a.ligne', (as) => as.length).catch(() => -1);
  const grisMessages = await nb(`${groupe(':messages')} .lat-branche .lat-lien[data-chemin="/messages"] .compte:not(.vif)`);
  verifier(conversations === projetsBase && (grisMessages === conversations || grisMessages === 0), 'Messages › Clients : autant que de conversations listées, projets internes compris', `${grisMessages} / ${conversations} / ${projetsBase}`);
  const facturesDues = (await docs('documents?pageSize=300')).filter((d) => { const f = d.fields || {}; return (f.type || {}).stringValue === 'facture' && ['envoyee', 'a-payer', 'partielle', 'en-retard'].includes((f.statut || {}).stringValue) && !((f.archive || {}).booleanValue); }).length;
  const rougeFinances = await nb('#lat-corps .lat-lien[data-chemin="/finances"]:not([data-projet]) .compte.vif');
  verifier(rougeFinances === facturesDues && !(await pa.$('#lat-corps .lat-lien[data-chemin="/finances"]:not([data-projet]) .compte:not(.vif)')), 'Devis et factures : le rouge compte les factures dues, rien d autre', `${rougeFinances} / ${facturesDues}`);

  /* ---------------------------------------------------------------- */
  console.log('\n== La boîte À traiter');
  await aller(pa, '#/a-traiter', '.page-a-traiter');
  verifier((await texteDe(pa, '.page h1')) === 'À traiter' && /À traiter$/.test(await texteDe(pa, '#ariane')), 'la page À traiter, et son fil', await texteDe(pa, '#ariane'));
  verifier(await pa.$eval(`${groupe(':a-traiter')} .lat-projet`, (a) => a.classList.contains('actif') && a.getAttribute('aria-current') === 'page').catch(() => false), 'son entrée s allume dans le rail');
  verifier(await attendre(async () => (await rougeBoite(pa)) === (await toutesLignes(pa)) && (await toutesLignes(pa)) > 0), 'le rouge d À traiter compte les lignes de la boîte', `${await rougeBoite(pa)} / ${await toutesLignes(pa)}`);
  verifier((await lignesDe(pa, 'tickets')).includes('#/projets/atelier/demandes/t-nouveau'), 'le ticket nouveau du banc y est, sous Tickets');
  verifier((await lignesDe(pa, 'projets')).includes('#/nouveaux-projets/dp-boutique-app'), 'la demande de projet du banc, sous Nouveaux projets');

  /* Chaque genre : semé, il apparaît (et le rouge monte d'un) ; traité, il
     sort (et le rouge redescend). */
  const genres = [
    {
      genre: 'tickets', nom: 'un ticket nouveau', lien: '#/projets/atelier/demandes/boite-ticket',
      semer: () => fs.doc('tickets/boite-ticket').set({ projet: 'atelier', titre: 'Ticket de la boîte', description: '', type: 'bug', urgence: 'important', statut: 'nouveau', numero: null, archive: false, auteur: { cote: 'client', nom: 'Camille Martin' }, assigne: null, liens: [], pieces: [], cree: T.now(), maj: T.now(), resolu: null, lu: {} }),
      traiter: () => fs.doc('tickets/boite-ticket').update({ statut: 'resolu', maj: T.now() }), traitement: 'résolu',
    },
    {
      genre: 'taches', nom: 'une tâche en retard', lien: '#/projets/atelier/taches/boite-tache',
      semer: () => fs.doc('taches/boite-tache').set({ projet: 'atelier', titre: 'Tâche en retard de la boîte', statut: 'a-faire', priorite: 'normale', echeance: ilYA(3), archive: false, ordre: 0, pieces: [], cree: ilYA(5), maj: ilYA(5) }),
      traiter: () => fs.doc('taches/boite-tache').update({ statut: 'terminee', maj: T.now() }), traitement: 'faite',
    },
    {
      genre: 'blocages', nom: 'un point bloquant de notre côté', lien: '#/projets/boutique',
      semer: () => fs.doc('blocages/boite-blocage').set({ projet: 'boutique', titre: 'Blocage de la boîte', description: '', responsable: 'capmedia', depuis: ilYA(2), resolu: null, visibilite: 'client', cree: ilYA(2), maj: ilYA(2) }),
      traiter: () => fs.doc('blocages/boite-blocage').update({ resolu: T.now(), maj: T.now() }), traitement: 'levé',
    },
    {
      genre: 'problemes', nom: 'un problème des tests à confirmer', lien: '#/tests?projet=atelier&anomalie=boite-pb',
      semer: () => fs.doc('projets/atelier/anomalies/boite-pb').set({ projet: 'atelier', titre: 'Problème de la boîte', statut: 'nouvelle', origine: 'testeur', date: T.now(), cree: T.now(), maj: T.now() }),
      traiter: () => fs.doc('projets/atelier/anomalies/boite-pb').update({ statut: 'confirmee', maj: T.now() }), traitement: 'confirmé',
    },
    {
      genre: 'devis', nom: 'un devis demandé par le calculateur', lien: '#/finances/boite-devis',
      semer: () => fs.doc('documents/boite-devis').set({ projet: 'atelier', type: 'devis', statut: 'demande', libelle: 'Devis demandé par la boîte', numero: '', montant: 0, archive: false, par: { nom: 'Camille Martin' }, date: T.now(), cree: T.now(), maj: T.now() }),
      traiter: () => fs.doc('documents/boite-devis').update({ statut: 'annule', maj: T.now() }), traitement: 'écarté',
    },
    {
      genre: 'devis', nom: 'un forfait de maintenance demandé', lien: '#/maintenance?projet=boutique',
      semer: () => fs.doc('projets/boutique/maintenance/contrat').set({ statut: 'demande', demande: { par: { nom: 'Léa Bernard' }, le: T.now(), message: 'Un forfait, svp.' }, maj: T.now() }, { merge: true }),
      traiter: () => fs.doc('projets/boutique/maintenance/contrat').update({ statut: 'proposition', maj: T.now() }), traitement: 'proposé',
    },
    {
      genre: 'projets', nom: 'une demande de nouveau projet', lien: '#/nouveaux-projets/boite-prepa',
      semer: () => fs.doc('demandesProjet/boite-prepa').set({ organisation: 'boutique-sud', par: { nom: 'Léa Bernard' }, titre: 'Projet demandé à la boîte', statut: 'nouvelle', projet: null, cree: T.now(), maj: T.now() }),
      traiter: () => fs.doc('demandesProjet/boite-prepa').update({ statut: 'devis', maj: T.now() }), traitement: 'devis envoyé',
    },
    {
      genre: 'acces', nom: 'un accès à arbitrer', lien: '#/projets/boutique/acces',
      semer: () => fs.doc('projetsInternes/boutique').set({ rolesADefinir: 1 }, { merge: true }),
      traiter: () => fs.doc('projetsInternes/boutique').set({ rolesADefinir: 0 }, { merge: true }), traitement: 'tranché',
    },
    {
      genre: 'notes', nom: 'une note partagée par un client', lien: '#/projets/atelier/notes',
      semer: () => fs.doc('notesClient/boite-note').set({ projet: 'atelier', uid: 'boite-client', texte: 'Note partagée de la boîte', partagee: true, cree: T.now(), maj: T.now() }),
      traiter: () => fs.doc('notesClient/boite-note').update({ partagee: false, maj: T.now() }), traitement: 'plus partagée',
    },
  ];
  for (const g of genres) {
    const avant = await rougeBoite(pa);
    const deja = (await lignesDe(pa, g.genre)).filter((h) => h === g.lien).length;
    await g.semer();
    const vu = await attendre(async () => (await lignesDe(pa, g.genre)).filter((h) => h === g.lien).length === deja + 1);
    verifier(vu, `${g.nom} apparaît sous « ${g.genre} »`, (await lignesDe(pa, g.genre)).join(' '));
    verifier(await attendre(async () => (await rougeBoite(pa)) === avant + 1, 6000), `et le rouge d À traiter monte d un (${avant} → ${avant + 1})`, await rougeBoite(pa));
    await g.traiter();
    const parti = await attendre(async () => (await lignesDe(pa, g.genre)).filter((h) => h === g.lien).length === deja);
    verifier(parti, `${g.traitement}, il sort de la boîte`, (await lignesDe(pa, g.genre)).join(' '));
    verifier(await attendre(async () => (await rougeBoite(pa)) === avant, 6000), 'et le rouge redescend', await rougeBoite(pa));
  }

  console.log('\n== Le filtre par genre, dans l adresse');
  await aller(pa, '#/a-traiter?genre=projets', '.page-a-traiter');
  const sections = await pa.$$eval('#vue section[data-genre]', (s) => s.map((x) => x.dataset.genre));
  verifier(JSON.stringify(sections) === JSON.stringify(['projets']) && Boolean(await pa.$('.filtres a.filtre.actif[data-genre-filtre="projets"]')), '?genre=projets : la seule section des nouveaux projets', sections.join(','));
  await pa.evaluate(() => { window.__noeud = document.querySelector('#vue'); window.__squelette = 0; new MutationObserver(() => { if (document.querySelector('#vue .os, #vue .squelette')) window.__squelette += 1; }).observe(document.querySelector('#vue'), { childList: true, subtree: true }); });
  await pa.click('.filtres a[data-genre-filtre="tickets"]');
  verifier(await attendre(async () => /^#\/a-traiter\?genre=tickets$/.test(await hash(pa)) && JSON.stringify(await pa.$$eval('#vue section[data-genre]', (s) => s.map((x) => x.dataset.genre))) === '["tickets"]', 5000), 'un clic sur « Tickets » : l adresse et la section changent', await hash(pa));
  verifier(await pa.evaluate(() => window.__squelette === 0 && window.__noeud === document.querySelector('#vue')), 'en place, sans squelette');
  await pa.click('#bouton-retour'); await pause(1200);
  verifier(/^#\/a-traiter\?genre=projets$/.test(await hash(pa)) && Boolean(await pa.$('#vue section[data-genre="projets"]')), 'le Retour retrouve le filtre d avant', await hash(pa));
  await pa.click('.filtres a[data-genre-filtre="tout"]'); await pause(800);
  verifier(/^#\/a-traiter$/.test(await hash(pa)) && (await pa.$$('#vue section[data-genre]')).length >= 2, '« Tout » : toutes les sections qui ont quelque chose', await hash(pa));

  /* ---------------------------------------------------------------- */
  console.log('\n== Les groupes du rail suivent la page, et le choix se retient');
  await aller(pa, '#/emails', '.page h1');
  verifier(await attendre(async () => (await deplie(pa, ':pilotage')) === true, 5000), 'ouvrir E-mails envoyés déplie Pilotage');
  verifier(await pa.$eval('#lat-corps .lat-lien.actif', (a) => a.dataset.chemin).catch(() => '') === '/emails', 'et son entrée s allume');
  await aller(pa, '#/finances?projet=atelier', '.page h1');
  verifier((await deplie(pa, ':finances')) === false, 'une page filtrée sur un projet ne déplie pas Finances : elle est au projet');
  await aller(pa, '#/', '.page h1');
  await pa.click(`${groupe(':a-traiter')} .lat-arbre-bascule`); await pause(600);
  verifier((await deplie(pa, ':a-traiter')) === false, 'le chevron replie À traiter');
  verifier(await pa.$eval(`${groupe(':a-traiter')} .lat-projet .compte.vif`, () => true).catch(() => false), 'replié, il garde son rouge');
  await pa.click(`${groupe(':portefeuille')} .lat-groupe-tete`); await pause(600);
  verifier((await deplie(pa, ':portefeuille')) === true && await pa.$eval(`${groupe(':portefeuille')} .lat-groupe-tete`, (b) => b.getAttribute('aria-expanded')).catch(() => '') === 'true', 'la ligne Portefeuille déplie son groupe');
  await pa.reload({ waitUntil: 'domcontentloaded' }); await railDessine(pa); await pause(2000);
  verifier((await deplie(pa, ':a-traiter')) === false && (await deplie(pa, ':portefeuille')) === true, 'les deux choix se retiennent au rechargement');
  await pa.click(`${groupe(':a-traiter')} .lat-arbre-bascule`); await pause(400);

  /* ---------------------------------------------------------------- */
  console.log('\n== « Nouveau ticket », avec le choix du projet');
  await aller(pa, '#/demandes', '.page h1');
  verifier((await texteDe(pa, '.page h1')) === 'Tickets' && /Tickets$/.test(await texteDe(pa, '#ariane')), 'la page s appelle Tickets', await texteDe(pa, '#ariane'));
  await pa.click('[data-nouveau-ticket]');
  await pa.waitForSelector('.voile #choix-p', { timeout: 5000 }).catch(() => {});
  verifier(Boolean(await pa.$('.voile #choix-p option[value="atelier"]')), 'il demande le projet');
  await pa.selectOption('.voile #choix-p', 'atelier'); await pa.click('.voile [data-ok]');
  verifier(await attendre(async () => /^#\/projets\/atelier\/nouvelle-demande$/.test(await hash(pa)) && Boolean(await pa.$('#forme-demande')), 10000), 'puis ouvre le formulaire du projet choisi', await hash(pa));
  await aller(pa, '#/demandes?projet=boutique', '.page h1');
  await pa.click('[data-nouveau-ticket]');
  verifier(await attendre(async () => /^#\/projets\/boutique\/nouvelle-demande$/.test(await hash(pa)), 5000), 'filtrée sur un projet, la page va droit au sien', await hash(pa));

  console.log('\n== La palette (⌘K), alignée sur le Hub');
  await aller(pa, '#/', '.page h1');
  await pa.click('#bouton-recherche'); await pa.waitForSelector('.palette .palette-item', { timeout: 5000 }).catch(() => {});
  const groupesVides = await pa.$$eval('.palette .palette-groupe', (g) => g.map((x) => x.textContent.trim()));
  verifier(groupesVides[0] === 'Actions' && groupesVides.includes('Pages'), 'sans terme : les actions, puis les pages', groupesVides.join(' | '));
  const actions = await pa.$$eval('.palette .palette-item', (as) => as.map((a) => a.textContent.trim()));
  verifier(actions.some((x) => /^Nouveau ticket/.test(x)) && actions.some((x) => /^À traiter/.test(x)) && actions.some((x) => /^Envoyer un message/.test(x)), '« Nouveau ticket », « Envoyer un message », la page À traiter', actions.slice(0, 12).join(' | '));
  await pa.click('.palette .palette-item:has-text("Nouveau ticket")');
  await pa.waitForSelector('.voile #choix-p', { timeout: 5000 }).catch(() => {});
  await pa.selectOption('.voile #choix-p', 'atelier'); await pa.click('.voile [data-ok]');
  verifier(await attendre(async () => /^#\/projets\/atelier\/nouvelle-demande$/.test(await hash(pa)), 5000), '« Nouveau ticket » de la palette : le projet, puis le formulaire', await hash(pa));
  const chercher = async (terme) => { await aller(pa, '#/', '.page h1'); await pa.click('#bouton-recherche'); await pa.waitForSelector('.palette input', { timeout: 5000 }); await pa.fill('.palette input', terme); await pause(400); return pa.$$eval('.palette .palette-groupe', (g) => g.map((x) => x.textContent.trim())); };
  verifier((await chercher('notifications arrivent')).includes('Tickets'), 'un ticket est rangé sous « Tickets »');
  await pa.keyboard.press('Escape');
  verifier((await chercher('Valider la maquette')).includes('Validations'), 'une validation attendue, sous « Validations »');
  await pa.click('.palette .palette-item:has-text("Valider la maquette")');
  verifier(await attendre(async () => /^#\/validations\/v-maquette$/.test(await hash(pa)) || Boolean(await pa.$('.voile [data-annuler]')), 5000), 'et mène à sa fiche', await hash(pa));
  await pa.keyboard.press('Escape'); await pause(300);
  verifier((await chercher('1.2.0')).includes('Versions'), 'une version, sous « Versions »');
  await pa.keyboard.press('Escape');

  /* ---------------------------------------------------------------- */
  console.log('\n== Un agent');
  await fs.doc('demandesProjet/boite-agent').set({ organisation: 'boutique-sud', par: { nom: 'Léa Bernard' }, titre: 'Projet que l agent ne voit pas', statut: 'nouvelle', projet: null, cree: T.now(), maj: T.now() });
  const pg = await contexte();
  await connecter(pg, AGENT);
  await railDessine(pg); await pause(1500);
  const railAgent = await pg.$$eval('#lat-corps .lat-lien', (as) => as.map((a) => a.dataset.chemin).filter(Boolean));
  verifier(!['/clients', '/nouveaux-projets', '/a-faire', '/archives', '/emails', '/controle', '/annonces', '/testeurs-messages'].some((c) => railAgent.includes(c)), 'ni Clients, ni Nouveaux projets, ni Projets à faire, ni Archives, ni E-mails, ni Salle de contrôle, ni Annonces, ni Testeurs', railAgent.join(' '));
  verifier(JSON.stringify(await pg.$$eval(`${groupe(':portefeuille')} .lat-branche .lat-lien`, (as) => as.map((a) => a.dataset.chemin)).catch(() => [])) === '["/fichiers"]', 'son Portefeuille : Fichiers seulement');
  verifier(!(await pg.$(groupe(':messages'))) && Boolean(await pg.$('#lat-corps .lat-lien[data-chemin="/messages"]')), 'sans la recette : Messages, une seule entrée');
  await aller(pg, '#/a-traiter', '.page-a-traiter');
  await pause(1500);
  verifier((await lignesDe(pg, 'tickets')).includes('#/projets/atelier/demandes/t-nouveau') && !(await pg.$('#vue section[data-genre="projets"]')) && !(await pg.$('.filtres a[data-genre-filtre="projets"]')), 'sa boîte : les tickets de son projet, pas les demandes de nouveau projet', (await pg.$$eval('#vue section[data-genre]', (s) => s.map((x) => x.dataset.genre))).join(','));
  verifier(!(await lignesDe(pg, 'tickets')).includes('#/projets/boutique/demandes/t-boutique'), 'ni les tickets d un projet hors de sa portée');

  verifier(erreurs.length === 0, `aucune erreur de page ${[...new Set(erreurs)].join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((er) => { console.error(er); process.exit(2); });
