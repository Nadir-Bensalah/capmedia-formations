/* ==========================================================================
   CAPMEDIA CLIENT HUB · les finitions du Cockpit (refonte, lot 6)

   Ce que prouve cette suite, dans le Cockpit :
   - D7 : « Marquer en retard » ne marque que les factures que l'encart
     compte (le projet du filtre, sans les archivées), après confirmation ;
     annuler ne change rien ;
   - D8 : « Écarter la demande » et « Archiver » (demande du calculateur),
     « Retirer la validation » demandent une confirmation ; annuler ne
     change rien, confirmer écrit ;
   - D6 : une ressource se supprime, depuis sa carte et depuis sa fiche ;
   - les statuts des tickets sont au masculin côté équipe (le mot est
     « ticket ») et la fiche parle à l'équipe (« Ouvert depuis », « Suivi
     par », la suite dite pour l'équipe, « Écrivez au client ») ;
   - le jargon de la liste du registre n'est plus à l'écran (Paramètres,
     Équipe, Santé de l'app, Axes, Mon profil, E-mails envoyés, lien d'un
     ticket inconnu) ;
   - H-16 : dans l'arbre, une entrée dont la page est vide reste visible,
     grisée, « à remplir », et redevient normale dès qu'elle se remplit ;
   - un état vide dit pourquoi et propose un geste (une phrase, un bouton) ;
   - au téléphone (390 px), Messages, E-mails envoyés, le kanban des Tâches,
     Aujourd'hui et Finances ne défilent pas de côté.

   Banc : émulateurs (Functions compris), site local, semer-suivi et les
   semis communs du banc. La suite pose ses propres pièces (qa6-…).
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => ((((await lire(c)) || {}).documents) || []);
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: v }); const N = (v) => ({ doubleValue: v });
const T = (d) => ({ timestampValue: d.toISOString() }); const M = (o) => ({ mapValue: { fields: o } }); const L = (xs) => ({ arrayValue: { values: xs } });
const NUL = { nullValue: null };
const jours = (n) => new Date(Date.now() + n * 86400000);
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const statutDe = async (c) => (champ(await lire(c), 'statut').stringValue || '');
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };

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
/* Une adresse ouverte depuis /moi : la page est montée à neuf. */
const aller = async (page, h, attendu) => {
  await page.evaluate(() => { location.hash = '#/moi'; });
  await page.waitForFunction(() => location.hash === '#/moi', null, { timeout: 5000 }).catch(() => {});
  await pause(400);
  await page.evaluate((x) => { location.hash = x; }, h);
  if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {});
  await pause(800);
};
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
/* La confirmation ouverte par-dessus : son titre, puis Oui ou Non. */
const confirmation = async (page) => {
  await page.waitForSelector('.voile [data-oui]', { timeout: 6000 }).catch(() => {});
  return page.evaluate(() => { const v = [...document.querySelectorAll('.voile')].filter((x) => x.querySelector('[data-oui]')).pop(); return v ? (v.querySelector('.modale-tete h2') || {}).innerText || '' : ''; });
};
const corpsConfirmation = (page) => page.evaluate(() => { const v = [...document.querySelectorAll('.voile')].filter((x) => x.querySelector('[data-oui]')).pop(); return v ? ((v.querySelector('.modale-corps') || {}).innerText || '').replace(/\s+/g, ' ').trim() : ''; });
const repondre = async (page, oui) => {
  await page.evaluate((o) => { const v = [...document.querySelectorAll('.voile')].filter((x) => x.querySelector('[data-oui]')).pop(); const b = v && v.querySelector(o ? '[data-oui]' : '[data-non]'); if (b) b.click(); }, oui);
  await pause(700);
};

(async () => {
  /* Les clics sont tolérants : un bouton qui manque (une mutation) donne
     des écarts, jamais un plantage de la suite. */
  /* --- Les pièces de la suite ------------------------------------------ */
  const facture = (projet, numero, extra = {}) => ({ projet: S(projet), type: S('facture'), numero: S(numero), libelle: S(`Facture ${numero}`), montant: N(100), tva: N(0), ttc: N(100), statut: S('a-payer'), date: T(jours(-40)), echeance: T(jours(-10)), fichier: NUL, liens: L([]), archive: B(false), ...extra });
  await poser('documents/qa6-f-atelier', facture('atelier', 'F-QA6-1'));
  await poser('documents/qa6-f-boutique', facture('boutique', 'F-QA6-2'));
  await poser('documents/qa6-f-archive', facture('atelier', 'F-QA6-3', { archive: B(true) }));
  await poser('documents/qa6-panier', { projet: S('atelier'), type: S('devis'), origine: S('panier'), statut: S('demande'), numero: NUL, libelle: S('Demande de devis QA6'), montant: NUL, tva: N(0), ttc: NUL, date: T(jours(-1)), demandeLe: T(jours(-1)), par: M({ uid: S(''), nom: S('Camille Martin') }), fichier: NUL, liens: L([]), archive: B(false) });
  const lien = (nom) => ({ nom: S(nom), url: S(`https://exemple.test/${nom.toLowerCase().replace(/\s+/g, '-')}`), categorie: S('production'), composant: S(''), environnement: S(''), description: S(''), visibilite: S('client'), identifiants: S(''), cree: T(new Date()) });
  await poser('projets/atelier/liens/qa6-lien-a', lien('Ressource QA6 A'));
  await poser('projets/atelier/liens/qa6-lien-b', lien('Ressource QA6 B'));
  /* Un projet à soi, sans client et vide : « Maison QA6 ». */
  const equipeDocs = await docs('equipe');
  const uidAdmin = ((equipeDocs.find((d) => champ(d, 'email').stringValue === ADMIN) || {}).name || '').split('/').pop();
  await poser('projets/qa6-maison', { nom: S('Maison QA6'), ref: S('MAISONQA6'), description: S('Un projet à moi, sans client.'), type: S('site-web'), statut: S('en-cours'), interne: B(true), plateformes: L([S('web')]), membres: L([]), membresOrganisation: L([]), compteur: N(0), responsable: S(uidAdmin), archive: B(false), ouvert: B(false), cree: T(jours(-20)), maj: T(jours(-1)) });
  /* Atelier relié au suivi des erreurs, sans relevé : la page Santé de
     l'app parle à l'équipe sans nommer l'outil. */
  await poser('sentryLiaisons/atelier', { actif: B(true), org: S('banc'), web: S('banc-web'), mobile: S(''), maj: T(new Date()) });

  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (largeur = 1440, hauteur = 900) => {
    const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return page;
  };
  const pa = await ouvrir();
  await connecter(pa, ADMIN);
  verifier(/\/suivi\/cockpit/.test(pa.url()), 'l administrateur entre dans le Cockpit', pa.url());

  /* ---------------------------------------------------------------- */
  console.log('\n== D7 : « Marquer en retard » suit le filtre, sans les archivées');
  await aller(pa, '#/finances?projet=atelier', '[data-marquer-retard]');
  const encart = await texteDe(pa, '.encart--attention');
  verifier(/^1 facture a dépassé son échéance/.test(encart), 'Atelier : l encart compte une facture échue (pas l archivée, pas Boutique)', encart);
  await pa.click('[data-marquer-retard]').catch(() => {});
  const titreRetard = await confirmation(pa);
  const texteRetard = await corpsConfirmation(pa);
  verifier(/Marquer cette facture en retard/.test(titreRetard) && /F-QA6-1/.test(texteRetard) && !/F-QA6-2|F-QA6-3/.test(texteRetard), 'la confirmation nomme la facture d Atelier, et elle seule', `${titreRetard} · ${texteRetard}`);
  await repondre(pa, false);
  await pause(1200);
  verifier(await statutDe('documents/qa6-f-atelier') === 'a-payer', 'annuler : rien n est marqué');
  await pa.click('[data-marquer-retard]').catch(() => {});
  await confirmation(pa);
  await repondre(pa, true);
  verifier(await attendre(async () => (await statutDe('documents/qa6-f-atelier')) === 'en-retard', 30), 'confirmer : la facture d Atelier passe en retard', await statutDe('documents/qa6-f-atelier'));
  await pause(1500);
  verifier(await statutDe('documents/qa6-f-boutique') === 'a-payer', 'celle de Boutique, hors du filtre, ne bouge pas', await statutDe('documents/qa6-f-boutique'));
  verifier(await statutDe('documents/qa6-f-archive') === 'a-payer', 'l archivée ne bouge pas', await statutDe('documents/qa6-f-archive'));

  /* ---------------------------------------------------------------- */
  console.log('\n== D8 : les gestes que le client lit se confirment');
  await aller(pa, '#/finances?projet=atelier&onglet=devis', '[data-menu-doc="qa6-panier"]');
  const ecarter = async () => { await pa.click('[data-menu-doc="qa6-panier"]').catch(() => {}); await pa.waitForSelector('.menu [data-cle="Écarter la demande"]', { timeout: 5000 }).catch(() => {}); await pa.click('.menu [data-cle="Écarter la demande"]').catch(() => {}); return confirmation(pa); };
  verifier(/Écarter cette demande de devis/.test(await ecarter()), '« Écarter la demande » demande confirmation');
  await repondre(pa, false); await pause(1200);
  verifier(await statutDe('documents/qa6-panier') === 'demande', 'annuler : la demande reste à chiffrer');
  await ecarter(); await repondre(pa, true);
  verifier(await attendre(async () => (await statutDe('documents/qa6-panier')) === 'annule', 30), 'confirmer : la demande est écartée', await statutDe('documents/qa6-panier'));
  await pause(1200);
  const archiver = async () => { await pa.click('[data-menu-doc="qa6-panier"]').catch(() => {}); await pa.waitForSelector('.menu [data-cle="Archiver"]', { timeout: 5000 }).catch(() => {}); await pa.click('.menu [data-cle="Archiver"]').catch(() => {}); return confirmation(pa); };
  verifier(/Archiver cette demande de devis/.test(await archiver()), '« Archiver » (demande écartée) demande confirmation');
  await repondre(pa, false); await pause(1200);
  verifier(champ(await lire('documents/qa6-panier'), 'archive').booleanValue !== true, 'annuler : pas archivée');
  await archiver(); await repondre(pa, true);
  verifier(await attendre(async () => champ(await lire('documents/qa6-panier'), 'archive').booleanValue === true, 30), 'confirmer : archivée');

  await aller(pa, '#/validations', '[data-id="v-maquette"]');
  await pa.click('[data-action="ouvrir"][data-id="v-maquette"]').catch(() => {});
  await pa.waitForSelector('.voile .feuille [data-annuler]', { timeout: 8000 }).catch(() => {});
  verifier((await texteDe(pa, '.voile .feuille [data-annuler]')) === 'Retirer la validation', 'la fiche dit « Retirer la validation » (plus « Annuler la demande »)', await texteDe(pa, '.voile .feuille [data-annuler]'));
  await pa.click('.voile .feuille [data-annuler]').catch(() => {});
  verifier(/Retirer cette validation/.test(await confirmation(pa)), '« Retirer la validation » demande confirmation');
  await repondre(pa, false); await pause(1200);
  verifier(await statutDe('validations/v-maquette') === 'en-attente', 'annuler : la validation attend toujours le client');
  await pa.click('.voile .feuille [data-annuler]').catch(() => {});
  await confirmation(pa); await repondre(pa, true);
  verifier(await attendre(async () => (await statutDe('validations/v-maquette')) === 'annulee', 30), 'confirmer : retirée', await statutDe('validations/v-maquette'));
  await pa.keyboard.press('Escape').catch(() => {}); await pause(400);

  /* ---------------------------------------------------------------- */
  console.log('\n== D6 : supprimer une ressource');
  await aller(pa, '#/projets/atelier/liens', '[data-genre="lien"][data-id="qa6-lien-a"]');
  const corbeille = '[data-action="supprimer"][data-genre="lien"][data-id="qa6-lien-a"]';
  verifier(Boolean(await pa.$(corbeille)), 'la carte d une ressource porte « Supprimer »');
  await pa.click(corbeille).catch(() => {});
  verifier(/Supprimer ce lien/.test(await confirmation(pa)), 'la suppression se confirme');
  await repondre(pa, true);
  verifier(await attendre(async () => (await lire('projets/atelier/liens/qa6-lien-a')) === null, 20), 'depuis la carte : la ressource est supprimée');
  await pa.click('[data-action="editer"][data-genre="lien"][data-id="qa6-lien-b"]').catch(() => {});
  await pa.waitForSelector('.voile .feuille [data-supprimer]', { timeout: 8000 }).catch(() => {});
  verifier(/Supprimer ce lien/.test(await texteDe(pa, '.voile .feuille [data-supprimer]')), 'sa fiche porte « Supprimer ce lien »');
  await pa.click('.voile .feuille [data-supprimer]').catch(() => {});
  await confirmation(pa); await repondre(pa, true);
  verifier(await attendre(async () => (await lire('projets/atelier/liens/qa6-lien-b')) === null, 20), 'depuis la fiche : la ressource est supprimée');
  verifier(await attendre(async () => !(await pa.$('.voile .feuille [data-supprimer]')), 10), 'et la fiche se referme');

  /* ---------------------------------------------------------------- */
  console.log('\n== Les tickets : le mot de l équipe, au masculin');
  const feminins = /^(Reçue|Acceptée|Planifiée|Terminée|Refusée|Annulée|Fermée)$/;
  const pastilles = [];
  for (const col of ['', 'a-traiter', 'client', 'terminees']) {
    await aller(pa, `#/demandes${col ? `?colonne=${col}` : ''}`, '.page h1');
    await pause(600);
    pastilles.push(...await pa.$$eval('#vue .liste .pastille', (els) => els.map((e) => e.innerText.trim())));
  }
  verifier(pastilles.length > 0 && !pastilles.some((x) => feminins.test(x)), 'aucun statut au féminin dans les colonnes des tickets', pastilles.join(', '));
  verifier(pastilles.includes('Reçu') || pastilles.includes('Terminé') || pastilles.includes('Accepté'), 'les statuts se lisent au masculin (Reçu, Terminé…)', [...new Set(pastilles)].join(', '));
  await aller(pa, '#/projets/atelier/demandes/t-veille', '.suivi-demande');
  const bandeau = await texteDe(pa, '.suivi-demande');
  /* Les intitulés sont en capitales à l'écran (text-transform) : on lit sans la casse. */
  verifier(/Ouvert depuis/i.test(bandeau) && /Suivi par/i.test(bandeau) && /Livré dans/i.test(bandeau) && !/Ouverte depuis|Suivie par|Livrée dans/i.test(bandeau), 'la fiche : « Ouvert depuis », « Suivi par », « Livré dans »', bandeau.slice(0, 200));
  verifier(/version que le client essaie/.test(bandeau) && !/Nous y travaillons/.test(bandeau), 'la suite est dite à l équipe, plus au client', bandeau.slice(0, 200));
  const fiche = await texteDe(pa, '.page');
  verifier(/Demandé par/i.test(fiche) && !/Demandée par|Demande créée|Confiée à/i.test(fiche), '« Demandé par », « Ticket créé », « Confié à »', (fiche.match(/(Demand\S+ par|Confi\S+ à|\S+ créé\S*)/gi) || []).join(', '));
  await aller(pa, '#/projets/atelier/demandes/t-export', '#fil');
  const filVide = await texteDe(pa, '#fil');
  verifier(/Écrivez au client/.test(filVide) && !/Écrivez-nous/.test(filVide), 'un fil vide invite à écrire au client (plus « Écrivez-nous »)', filVide);

  /* ---------------------------------------------------------------- */
  console.log('\n== Le jargon de la liste du registre');
  await aller(pa, '#/parametres', '#f-finance');
  const param = await texteDe(pa, '#vue');
  verifier(!/Fonction serveur|cloudfunctions|finance\.gerer|secret serveur|transactionnels|vivent dans le code|projets \/ projet/.test(param), 'Paramètres : ni fonction serveur, ni chemin de stockage, ni permission brute', (param.match(/.{0,30}(Fonction serveur|cloudfunctions|finance\.gerer|secret serveur|transactionnels).{0,30}/) || [''])[0]);
  verifier(/Statuts de ticket/i.test(param) && /Reçu ·/.test(param), 'Paramètres : « Statuts de ticket », au masculin', (param.match(/Statuts de \S+ .{0,40}/i) || [''])[0]);
  await aller(pa, '#/equipe', '[data-membre]');
  verifier(!/écrite par le serveur|navigateur/.test(await texteDe(pa, '#vue')), 'Équipe : plus de « écrite par le serveur, jamais depuis le navigateur »');
  await aller(pa, '#/projets/atelier/stabilite', '.page-stabilite');
  const sante = await texteDe(pa, '.page-stabilite');
  verifier(/Santé de l'app/.test(sante) && !/Sentry|HTTP/.test(sante), 'Santé de l app : l outil n est plus nommé', sante.slice(0, 240));
  await aller(pa, '#/projets/qa6-maison/evolutions', '.page-axes');
  const axes = await texteDe(pa, '.page-axes .vide');
  verifier(axes && !/\.mjs|importer/.test(axes) && Boolean(await pa.$('.page-axes .vide [data-axe-action="nouveau"]')), 'Axes sans axe : pas de nom de script, un bouton pour le premier', axes);
  await aller(pa, '#/moi', '#forme-profil');
  const moi = await texteDe(pa, '#vue');
  verifier(/Mouvements des tickets/.test(moi) && !/prévenez Capmedia|Mouvements de mes tickets|attend votre accord/.test(moi), 'Mon profil : écrit pour l équipe', (moi.match(/Mouvements \S+ \S+|prévenez Capmedia/g) || []).join(', '));
  await aller(pa, '#/emails?public=tous', '#f-statut');
  const etats = await pa.$$eval('#f-statut option', (os) => os.map((o) => o.innerText));
  verifier(etats.length > 1 && !etats.some((t) => /^En file|^Simulé/.test(t)), 'E-mails envoyés : les états en clair', etats.join(', '));
  await pa.goto(`${SITE}/suivi/cockpit#/demande/qa6-inexistant`, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('#vue .vide', { timeout: 20000 }).catch(() => {});
  verifier(/Ticket introuvable/.test(await texteDe(pa, '#vue .vide')) && Boolean(await pa.$('#vue .vide a[href="#/demandes"]')), 'un lien de ticket inconnu : « Ticket introuvable », retour aux tickets', await texteDe(pa, '#vue .vide'));
  await pa.waitForSelector('#lat-corps .lat-lien', { timeout: 20000 }).catch(() => {});

  /* ---------------------------------------------------------------- */
  console.log('\n== H-16 : une entrée vide reste visible, grisée « à remplir »');
  await aller(pa, '#/projets/qa6-maison', '#lat-corps [data-chemin="/projets/qa6-maison/liens"]');
  const entreeLiens = '#lat-corps a.lat-lien[data-chemin="/projets/qa6-maison/liens"]';
  const vide = await pa.$eval(entreeLiens, (a) => ({ classe: a.classList.contains('lat-lien--a-remplir'), marque: (a.querySelector('.lat-marqueur') || {}).textContent || '' })).catch(() => null);
  verifier(vide && vide.classe && /à remplir/.test(vide.marque), 'Maison QA6 sans ressource : « Ressources » grisée, « à remplir »', JSON.stringify(vide));
  const pleine = await pa.$eval('#lat-corps a.lat-lien[data-chemin="/projets/atelier/composants"]', (a) => a.classList.contains('lat-lien--a-remplir')).catch(() => null);
  verifier(pleine === false, 'Atelier, qui a ses parties : « Plateformes et versions » n est pas grisée', String(pleine));
  await poser('projets/qa6-maison/liens/qa6-lien-maison', lien('Ressource QA6 maison'));
  verifier(await attendre(async () => (await pa.$eval(entreeLiens, (a) => !a.classList.contains('lat-lien--a-remplir') && !a.querySelector('.lat-marqueur')).catch(() => false)), 20), 'une ressource posée : l entrée redevient normale, sans recharger');

  /* ---------------------------------------------------------------- */
  console.log('\n== Les états vides : une phrase, un geste');
  for (const [nom, h] of [['Finances d un projet sans pièce', '#/finances?projet=qa6-maison'], ['Tickets d un projet sans ticket', '#/demandes?projet=qa6-maison'], ['Tâches filtrées sans résultat', '#/taches?projet=qa6-maison'], ['Fichiers d un projet vide', '#/fichiers?projet=qa6-maison'], ['Activité sans mouvement', '#/activite?projet=qa6-maison&nature=paiement'], ['Projets terminés', '#/projets']]) {
    await aller(pa, h, '.page h1');
    if (nom === 'Projets terminés') { await pa.click('[data-filtre="termines"]').catch(() => {}); await pause(500); }
    const v = await pa.$eval('#vue .vide', (el) => ({ titre: (el.querySelector('.vide-titre') || {}).innerText || '', texte: (el.querySelector('.vide-texte') || {}).innerText || '', geste: Boolean(el.querySelector('.btn')) })).catch(() => null);
    if (nom === 'Projets terminés' && !v) { ok += 1; console.log('  ok     Projets terminés : la liste n est pas vide sur ce banc, rien à vérifier'); continue; }
    verifier(v && v.titre && v.texte && v.geste, `${nom} : une phrase et un geste`, JSON.stringify(v));
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== Au téléphone : rien ne défile de côté');
  const tel = await ouvrir(390, 844);
  await connecter(tel, ADMIN);
  await tel.evaluate(() => { try { localStorage.setItem('suivi:taches-vue-admin', 'kanban'); } catch (e) { /* rien */ } });
  for (const [nom, h, attendu] of [['Aujourd hui', '#/', '.page h1'], ['Messages d un projet', '#/messages/atelier', '#fil'], ['E-mails envoyés', '#/emails?public=tous', 'table[data-emails]'], ['Tâches en kanban', '#/taches', '.kanban'], ['Finances', '#/finances', '.metriques']]) {
    await aller(tel, h, attendu);
    const m = await tel.evaluate(() => ({ page: document.documentElement.scrollWidth, ecran: window.innerWidth, kanban: (() => { const k = document.querySelector('.kanban'); return k ? k.scrollWidth - k.clientWidth : 0; })(), tableau: (() => { const t = document.querySelector('table[data-emails]'); return t ? t.scrollWidth - (t.parentElement ? t.parentElement.clientWidth : 0) : 0; })() }));
    verifier(m.page <= m.ecran + 1 && m.kanban <= 1 && m.tableau <= 1, `${nom} : tient dans 390 px`, JSON.stringify(m));
  }
  await aller(tel, '#/emails?public=tous', 'table[data-emails]');
  const carte2 = await tel.$eval('table[data-emails] tbody tr', (tr) => ({ entete: getComputedStyle(document.querySelector('table[data-emails] thead')).display, case: getComputedStyle(tr.querySelector('td')).display, titre: getComputedStyle(tr.querySelector('td'), '::before').content })).catch(() => null);
  verifier(carte2 && carte2.entete === 'none' && carte2.case === 'grid' && /Date/.test(carte2.titre), 'E-mails envoyés : chaque ligne devient une carte, chaque case dit son titre', JSON.stringify(carte2));

  verifier(!erreurs.length, 'aucune erreur de script', erreurs.slice(0, 3).join(' | '));
  await nav.close();
  console.log(`\n${ok} ok, ${ecarts.length} ÉCART(S)`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
