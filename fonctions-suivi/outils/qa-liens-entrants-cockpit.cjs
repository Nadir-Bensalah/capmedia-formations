/* ==========================================================================
   CAPMEDIA CLIENT HUB · les liens qui entrent dans le Cockpit (refonte, lot 8)

   Ce que prouve cette suite : chaque adresse qui mène dans le Cockpit
   depuis l'extérieur arrive à la bonne page, après la refonte (L0 à L7).
   La liste vient de hub-lots/audit-cockpit/liens-entrants.md, une adresse
   par ligne :
   - les e-mails (« cockpit#/… », ouverts dans un onglet neuf) : tâche,
     fichiers, validation, message, pièce, demande (« /demande/:t »),
     nouveau projet, maintenance, tests, testeur ;
   - la cloche (« #/… », un clic dans le tiroir des notifications) : les
     mêmes, plus le projet (point bloquant), la fiche d'une demande, les axes,
     l'accès du client, la salle de contrôle, la santé de l'app ;
   - des notifications ANCIENNES, rangées en base avant la refonte :
     « roadmap », les onglets Fichiers et Réunions d'un projet, « /planning »,
     « /documents », « /tableau », « /suggestions », « /valider/:v » ;
   - des activités ANCIENNES (page Activité) : les mêmes routes, plus
     « releases » et l'onglet Activité ;
   - le push : la fenêtre ouverte par le service (onglet neuf) et le message
     du service à une fenêtre déjà ouverte (seules les conversations passent) ;
   - « /suivi/ticket?t= » (lien des e-mails de demande), « /suivi/projet?p= »,
     « /suivi/console », et le Hub ouvert par un membre de l'équipe ;
   - la porte : « ?retour= » après connexion, et une adresse du Cockpit
     ouverte sans session, qui revient à sa page une fois connecté.
   Option : LIENS_BUREAU=1 ouvre aussi l'application de bureau (Electron,
   ~/Capmedia/cockpit-bureau) sur le banc (COCKPIT_ADRESSE) et suit un lien
   de notification comme elle le fait (location.hash).

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne. Écrit en base : des notifications et des activités
   marquées « qa-liens », retirées à la fin.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const admin = require('../node_modules/firebase-admin');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const TRACE = process.env.LIENS_TRACE === '1';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);
const str = (d, k) => (((d.fields || {})[k] || {}).stringValue || '');
const idDe = (d) => d.name.split('/').pop();

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

const dernierCode = async (e) => { for (let i = 0; i < 60; i += 1) { const p = (await docs('envois?pageSize=300')).filter((d) => ((d.fields.modele || {}).stringValue === 'code') && ((((d.fields.a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e))); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const valeur = (page, sel) => page.$eval(sel, (el) => el.value).catch(() => null);
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash)).catch(() => '');
/* Le titre de l'onglet porte « (n) » devant quand quelque chose attend (G-013) : on le lit sans. */
const titre = (page) => page.evaluate(() => document.title.replace(/^\(\d+\)\s*/, '')).catch(() => '');

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  const ilYA = (s) => admin.firestore.Timestamp.fromMillis(Date.now() - s * 1000);

  /* Un compte se connecte plusieurs fois en quelques minutes (porte,
     « ?retour= ») : le plafond de codes par quart d'heure se vide avant
     chaque connexion, comme le fait le semis. */
  const viderPlafond = async () => {
    for (const nom of ['connexions', 'connexionsIp']) {
      const q = await fs.collection(nom).get();
      await Promise.all(q.docs.map((d) => d.ref.delete()));
    }
  };
  const saisirCode = async (page, email) => {
    await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
    await viderPlafond();
    await page.fill('#email', email); await page.click('#envoyer');
    await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
    await page.fill('#code', await dernierCode(email));
    await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
    await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  };

  /* --- Les identifiants du semis --------------------------------------- */
  const adminUid = (await admin.auth().getUserByEmail(ADMIN)).uid;
  const tache = (await docs('taches?pageSize=300')).find((d) => /Corriger la validation des tâches de la veille/.test(str(d, 'titre')));
  const reunion = (await docs('reunions?pageSize=300')).find((d) => str(d, 'projet') === 'atelier' && /Revue de la version 1\.1/.test(str(d, 'titre')));
  const version = (await docs('releases?pageSize=300')).find((d) => str(d, 'projet') === 'atelier' && str(d, 'version') === '1.2.0');
  const testeurs = (await docs('testeurs?pageSize=300')).map((d) => ({ id: idDe(d), prenom: str(d, 'prenom'), email: str(d, 'email') })).filter((t) => t.prenom);
  const testeur = testeurs[0];
  verifier(tache && reunion && version && testeur, 'le semis porte une tâche, une réunion, une version et un testeur', `${Boolean(tache)} ${Boolean(reunion)} ${Boolean(version)} ${Boolean(testeur)}`);
  if (!(tache && reunion && version && testeur)) { console.log(`\n${ok} contrôle(s) conforme(s), ${ecarts.length} ÉCART(S)`); process.exit(1); }
  const T = idDe(tache); const R = idDe(reunion); const V = idDe(version); const U = testeur.id;

  /* --- Les pages d'arrivée : l'adresse finale et une preuve du contenu --- */
  const attendre = async (page, fn, ms = 15000) => { const fin = Date.now() + ms; let r = [false, '']; while (Date.now() < fin) { r = await fn(page).catch((e) => [false, e.message]); if (r[0]) return r; await pause(300); } return r; };
  const h1 = (re) => async (p) => { const t = await texteDe(p, '.page h1'); return [re.test(t), `h1 « ${t} »`]; };
  const DEST = {
    tache: { hash: new RegExp(`^#/projets/atelier/taches/${T}$`), preuve: async (p) => { const t = await texteDe(p, '.voile .feuille'); return [/Corriger la validation des tâches de la veille/.test(t), `fiche « ${t.slice(0, 80)} »`]; } },
    fichiers: { hash: /^#\/fichiers\?projet=atelier$/, preuve: async (p) => { const t = await texteDe(p, '.page h1'); const v = await valeur(p, '#filtre-projet'); return [t === 'Fichiers' && v === 'atelier', `h1 « ${t} », projet ${v}`]; } },
    fichiersTous: { hash: /^#\/fichiers$/, preuve: h1(/^Fichiers$/) },
    validation: { hash: /^#\/validations\/v-maquette$/, preuve: async (p) => { const t = await texteDe(p, '.voile .feuille'); return [/Valider la maquette du nouveau profil/.test(t) && Boolean(await p.$('.voile .feuille [data-annuler]')), `fiche « ${t.slice(0, 80)} »`]; } },
    projet: { hash: /^#\/projets\/atelier$/, preuve: async (p) => { const t = await texteDe(p, '.page h1'); return [t === 'Atelier' && Boolean(await p.$('#onglet-corps')), `h1 « ${t} »`]; } },
    messages: { hash: /^#\/messages\/atelier$/, preuve: async (p) => [Boolean(await p.$('#vue a.ligne.actif[href="#/messages/atelier"]')) && Boolean(await p.$('#forme-message')), await titre(p)] },
    piece: { hash: /^#\/finances\/f-acompte$/, preuve: async (p) => { const t = await texteDe(p, '.voile .feuille .modale-tete h2'); return [/F-2026-031/.test(t), `fiche « ${t} »`]; } },
    demande: { hash: /^#\/projets\/atelier\/demandes\/t-veille$/, preuve: async (p) => { const t = await texteDe(p, '#vue'); return [/Les validations de tâches de la veille ne fonctionnent plus/.test(t) && /ATELIER-004/.test(t), await titre(p)]; } },
    nouveauProjet: { hash: /^#\/nouveaux-projets\/dp-boutique-app$/, preuve: h1(/Une application de commande pour Boutique/) },
    maintenance: { hash: /^#\/maintenance\?projet=atelier$/, preuve: async (p) => { const t = await titre(p); const v = await valeur(p, '#f-projet'); return [/^Maintenance/.test(t) && (v === null || v === 'atelier') && Boolean(await p.$('#vue .page')), `${t}, projet ${v}`]; } },
    tests: { hash: /^#\/tests\?projet=atelier$/, preuve: async (p) => { const t = await texteDe(p, '.page h1'); const a = await texteDe(p, '#ariane'); return [t === 'Tests' && /Atelier/.test(a), `h1 « ${t} », fil « ${a} »`]; } },
    testsTous: { hash: /^#\/tests$/, preuve: h1(/^Tests$/) },
    testeur: { hash: new RegExp(`^#/testeurs-messages/${U}$`), preuve: async (p) => { const t = await texteDe(p, '#tm-nom'); return [t.includes(testeur.prenom) && Boolean(await p.$('#tm-texte')), `#tm-nom « ${t} »`]; } },
    axes: { hash: /^#\/projets\/atelier\/evolutions$/, preuve: async (p) => { const t = await titre(p); return [/^Axes d'évolution · Atelier/.test(t), t]; } },
    acces: { hash: /^#\/projets\/atelier\/acces$/, preuve: async (p) => { const t = await texteDe(p, '#onglet-corps'); const a = await texteDe(p, '#ariane'); return [/Accès client/.test(a) && t.length > 0, `fil « ${a} »`]; } },
    /* Atelier n'est pas relié au suivi des erreurs dans le semis commun : la salle dit qu'elle n'existe pas encore. */
    controle: { hash: /^#\/projets\/atelier\/controle$/, preuve: async (p) => [/^Salle de contrôle · Atelier/.test(await titre(p)) && (Boolean(await p.$('[data-salle]')) || /Pas encore de salle de contrôle/.test(await texteDe(p, '#vue'))), await titre(p)] },
    stabilite: { hash: /^#\/projets\/atelier\/stabilite$/, preuve: async (p) => { const t = await titre(p); return [/^Santé de l'app · Atelier/.test(t), t]; } },
    etapes: { hash: /^#\/projets\/atelier\/(roadmap|etapes)$/, preuve: async (p) => { const t = await texteDe(p, '#onglet-corps'); return [/Planning/.test(t) && /Développement/.test(t), t.slice(0, 80)]; } },
    reunions: { hash: /^#\/calendrier\?projet=atelier$/, preuve: async (p) => { const t = await texteDe(p, '#reunions-projet'); return [/Point hebdomadaire/.test(t) && (await valeur(p, '#f-projet')) === 'atelier', t.slice(0, 80)]; } },
    reunion: { hash: new RegExp(`^#/calendrier\\?projet=atelier&reunion=${R}$`), preuve: async (p) => { const t = await texteDe(p, '.voile .feuille .modale-tete h2'); return [/Revue de la version 1\.1/.test(t), `fiche « ${t} »`]; } },
    calendrier: { hash: /^#\/calendrier$/, preuve: h1(/^Calendrier$/) },
    composants: { hash: /^#\/projets\/atelier\/composants$/, preuve: async (p) => [Boolean(await p.$('#versions-projet')), await titre(p)] },
    version: { hash: new RegExp(`^#/projets/atelier/releases/${V}$`), preuve: async (p) => { const t = await texteDe(p, '.voile .feuille'); return [/1\.2\.0/.test(t) && Boolean(await p.$('#versions-projet')), `fiche « ${t.slice(0, 80)} »`]; } },
    activite: { hash: /^#\/activite\?projet=atelier$/, preuve: async (p) => [(await valeur(p, '#f-projet')) === 'atelier' && Boolean(await p.$('#vue .chrono')), await titre(p)] },
    accueil: { hash: /^(#\/?)?$/, preuve: async (p) => { const t = await titre(p); return [/^Cockpit · /.test(t) && Boolean(await p.$('#vue [data-a-traiter]')), t]; } },
  };
  const arrivee = async (page, cle, nom) => {
    const d = DEST[cle];
    const [okHash, h] = await attendre(page, async (p) => { const x = await hash(p); return [d.hash.test(x), x]; });
    const [okPreuve, detail] = okHash ? await attendre(page, d.preuve) : [false, ''];
    if (TRACE) console.log(`         [${cle}] ${h} · ${detail} · ${await titre(page)}`);
    verifier(okHash && okPreuve, nom, `${h} · ${detail}`);
  };

  /* --- Les notifications et activités à suivre ---------------------------- */
  const NOTIFS = [
    // Cloche d'aujourd'hui (hub.js, suivi.js, controle.js, sentry.js).
    ['tache', `#/projets/atelier/taches/${T}`, 'tache', 'cloche : une tâche (réponse du client)'],
    ['fichiers', '#/projets/atelier/fichiers', 'fichier', 'cloche : un fichier déposé, vers les Fichiers du projet'],
    ['validation', '#/validations/v-maquette', 'validation', 'cloche : une validation'],
    ['projet', '#/projets/atelier', 'blocage', 'cloche : un point bloquant, vers le projet'],
    ['messages', '#/messages/atelier', 'message', 'cloche : un message du projet'],
    ['piece', '#/finances/f-acompte', 'facture', 'cloche : une pièce'],
    ['demande', '#/projets/atelier/demandes/t-veille', 'demande', 'cloche : une demande, sa fiche'],
    ['nouveauProjet', '#/nouveaux-projets/dp-boutique-app', 'projet', 'cloche : une demande de nouveau projet'],
    ['maintenance', '#/maintenance?projet=atelier', 'maintenance', 'cloche : la maintenance d un projet'],
    ['tests', '#/tests?projet=atelier', 'test', 'cloche : les tests d un projet'],
    ['testeur', `#/testeurs-messages/${U}`, 'message', 'cloche : un message de testeur'],
    ['axes', '#/projets/atelier/evolutions', 'axe', 'cloche : un axe d évolution'],
    ['acces', '#/projets/atelier/acces', 'acces', 'cloche : l accès du client à arbitrer'],
    ['controle', '#/projets/atelier/controle', 'alerte', 'cloche : une sonde de la salle de contrôle'],
    ['stabilite', '#/projets/atelier/stabilite', 'alerte', 'cloche : une alerte de la santé de l app'],
    // Notifications anciennes, rangées en base avant la refonte.
    ['etapes', '#/projets/atelier/roadmap', 'jalon', 'cloche ancienne : « roadmap » mène au planning du projet'],
    ['reunions', '#/projets/atelier/reunions', 'reunion', 'cloche ancienne : l onglet Réunions mène au Calendrier du projet'],
    ['reunion', `#/projets/atelier/reunions/${R}`, 'reunion', 'cloche ancienne : une réunion, sa fiche dans le Calendrier'],
    ['calendrier', '#/planning', 'reunion', 'cloche ancienne : « /planning » mène au Calendrier'],
    ['fichiersTous', '#/documents', 'fichier', 'cloche ancienne : « /documents » mène aux Fichiers'],
    ['testsTous', '#/tableau', 'test', 'cloche ancienne : « /tableau » mène aux Tests'],
    ['axes', '#/projets/atelier/suggestions', 'axe', 'cloche ancienne : « /suggestions » mène aux axes'],
    ['validation', '#/valider/v-maquette', 'validation', 'cloche ancienne : « /valider/:v » (adresse du client) ouvre la validation'],
  ];
  const ACTIVITES = [
    ['etapes', '/projets/atelier/roadmap', 'activité ancienne : « roadmap »'],
    ['fichiers', '/projets/atelier/fichiers', 'activité ancienne : l onglet Fichiers'],
    ['reunions', '/projets/atelier/reunions', 'activité ancienne : l onglet Réunions'],
    ['calendrier', '/planning', 'activité ancienne : « /planning »'],
    ['fichiersTous', '/documents', 'activité ancienne : « /documents »'],
    ['testsTous', '/tableau', 'activité ancienne : « /tableau »'],
    ['axes', '/projets/atelier/suggestions', 'activité ancienne : « /suggestions »'],
    ['validation', '/valider/v-maquette', 'activité ancienne : « /valider/:v »'],
    ['composants', '/projets/atelier/releases', 'activité ancienne : « releases » mène à Plateformes et versions'],
    ['activite', '/projets/atelier/activite', 'activité ancienne : l onglet Activité'],
  ];
  const lot = fs.batch();
  NOTIFS.forEach(([, lien, type], i) => lot.set(fs.doc(`boites/${adminUid}/notifications/qa-liens-${i}`), { type, titre: `Lien entrant ${i}`, texte: lien, lien, projet: 'atelier', lu: false, date: ilYA(i + 1) }));
  ACTIVITES.forEach(([, lien], i) => lot.set(fs.doc(`activite/qa-liens-${i}`), { projet: 'atelier', type: 'note', texte: `qa-liens ${i} ${lien}`, par: { uid: 'qa-liens', nom: 'Ancien', cote: 'equipe' }, lien, visibilite: 'interne', date: ilYA(i + 1) }));
  await lot.commit();

  const nav = await chromium.launch();
  const erreurs = [];
  const nouveauContexte = async () => {
    const c = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    return c;
  };
  /* « redirection » et « session absente » : l'arrêt volontaire du script
     d'un espace qui renvoie ailleurs (app.js, admin.js : throw après
     location.replace, vers l'autre espace ou vers la porte), pas une panne. */
  const ARRETS = ['redirection', 'session absente'];
  const surveiller = (p, quoi) => { p.on('pageerror', (e) => { if (!ARRETS.includes(e.message)) erreurs.push(`${quoi}: ${e.message.slice(0, 160)}`); }); return p; };
  const ctx = await nouveauContexte();
  const page = surveiller(await ctx.newPage(), 'cockpit');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await saisirCode(page, ADMIN); await pause(2000);
  verifier(/\/suivi\/cockpit/.test(page.url()), 'l administrateur du banc entre dans le Cockpit', page.url());

  /* ---------------------------------------------------------------- */
  console.log('\n== Les e-mails : « cockpit#/… » dans un onglet neuf');
  const EMAILS = [
    ['tache', `/projets/atelier/taches/${T}`, 'e-mail « tache-reponse » : la tâche'],
    ['fichiers', '/projets/atelier/fichiers', 'e-mail « fichier » : les Fichiers du projet'],
    ['validation', '/validations/v-maquette', 'e-mail « validation-reponse » : la validation'],
    ['messages', '/messages/atelier', 'e-mail « message-projet » : la conversation'],
    ['piece', '/finances/f-acompte', 'e-mail « reglement-declare » / « devis-reponse » : la pièce'],
    ['demande', '/demande/t-veille', 'e-mail d une demande (« /demande/:t ») : sa fiche dans le projet'],
    ['nouveauProjet', '/nouveaux-projets/dp-boutique-app', 'e-mail d une demande de nouveau projet'],
    ['maintenance', '/maintenance?projet=atelier', 'e-mail de maintenance : la maintenance du projet'],
    ['tests', '/tests?projet=atelier', 'e-mail des tests : les tests du projet'],
    ['testeur', `/testeurs-messages/${U}`, 'e-mail d un testeur : sa conversation'],
  ];
  for (const [cle, chemin, nom] of EMAILS) {
    const p = surveiller(await ctx.newPage(), chemin);
    await p.goto(`${SITE}/suivi/cockpit#${chemin}`, { waitUntil: 'domcontentloaded' });
    await arrivee(p, cle, nom);
    await p.close();
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== La cloche : un clic dans le tiroir des notifications');
  for (let i = 0; i < NOTIFS.length; i += 1) {
    const [cle, , , nom] = NOTIFS[i];
    await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.page h1', { timeout: 15000 }).catch(() => {}); await pause(700);
    await page.click('#bouton-notifs').catch(() => {});
    const n = await page.waitForSelector(`[data-notif="qa-liens-${i}"]`, { timeout: 10000 }).catch(() => null);
    if (!n) { verifier(false, nom, 'notification absente du tiroir'); await page.keyboard.press('Escape').catch(() => {}); continue; }
    await n.click();
    await arrivee(page, cle, nom);
    await page.keyboard.press('Escape').catch(() => {}); await pause(300);
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== Les activités anciennes (page Activité du projet)');
  for (let i = 0; i < ACTIVITES.length; i += 1) {
    const [cle, , nom] = ACTIVITES[i];
    await page.evaluate(() => { location.hash = '#/activite?projet=atelier'; });
    const lien = await page.waitForFunction((marque) => [...document.querySelectorAll('#vue .chrono-texte a')].find((a) => a.textContent.includes(marque)) || null, `qa-liens ${i} `, { timeout: 15000 }).catch(() => null);
    if (!lien) { verifier(false, nom, 'activité absente de la page'); continue; }
    await lien.asElement().click();
    await arrivee(page, cle, nom);
    await page.keyboard.press('Escape').catch(() => {}); await pause(300);
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== Le push');
  for (const [cle, chemin, nom] of [['messages', '/messages/atelier', 'push, espace fermé : la fenêtre ouverte sur la conversation du projet'], ['testeur', `/testeurs-messages/${U}`, 'push, espace fermé : la fenêtre ouverte sur la conversation du testeur']]) {
    const p = surveiller(await ctx.newPage(), chemin);
    await p.goto(`${SITE}/suivi/cockpit#${chemin}`, { waitUntil: 'domcontentloaded' });
    await arrivee(p, cle, nom);
    await p.close();
  }
  const envoyerPush = async (lien) => {
    await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.page h1', { timeout: 15000 }).catch(() => {}); await pause(800);
    return page.evaluate((l) => { if (!('serviceWorker' in navigator)) return false; navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'suivi:ouvrir', lien: l } })); return true; }, lien);
  };
  verifier(await envoyerPush('#/messages/atelier'), 'le service des notifications est joignable depuis la page');
  await arrivee(page, 'messages', 'push, fenêtre déjà ouverte : elle va à la conversation du projet');
  await envoyerPush(`#/testeurs-messages/${U}`);
  await arrivee(page, 'testeur', 'push, fenêtre déjà ouverte : elle va à la conversation du testeur');
  await envoyerPush('#/finances/f-acompte'); await pause(1500);
  verifier(DEST.accueil.hash.test(await hash(page)), 'push, fenêtre ouverte : un autre lien est ignoré (seules les conversations passent)', await hash(page));

  /* ---------------------------------------------------------------- */
  console.log('\n== Les anciennes pages de partage et le Hub ouvert par l équipe');
  const PARTAGES = [
    ['demande', '/suivi/ticket?t=t-veille', 'lien des e-mails de demande (« /suivi/ticket?t= ») : la fiche, dans le Cockpit'],
    ['projet', '/suivi/projet?p=atelier', 'ancienne adresse « /suivi/projet?p= » : le projet, dans le Cockpit'],
    ['accueil', '/suivi/console', 'ancienne adresse « /suivi/console » : le Cockpit'],
    ['demande', '/suivi/hub#/projets/atelier/demandes/t-veille', 'le Hub ouvert par l équipe garde la route : la fiche d une demande'],
    ['validation', '/suivi/hub#/valider/v-maquette', 'le Hub ouvert par l équipe : « /valider/:v » ouvre la validation'],
    ['fichiers', '/suivi/hub#/fichiers?projet=atelier', 'le Hub ouvert par l équipe : « /fichiers?projet= »'],
    ['calendrier', '/suivi/hub#/calendrier', 'le Hub ouvert par l équipe : « /calendrier »'],
  ];
  for (const [cle, chemin, nom] of PARTAGES) {
    const p = surveiller(await ctx.newPage(), chemin);
    await p.goto(`${SITE}${chemin}`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/suivi\/cockpit/, { timeout: 20000 }).catch(() => {});
    verifier(/\/suivi\/cockpit/.test(p.url()), `${nom} (dans le Cockpit)`, p.url());
    await arrivee(p, cle, nom);
    await p.close();
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== La porte : « ?retour= » et une adresse ouverte sans session');
  const PORTE = [
    ['fichiers', `/suivi/?emul&retour=${encodeURIComponent('/suivi/cockpit#/projets/atelier/fichiers')}&espace=cockpit`, '« ?retour= » vers le Cockpit : la page visée, une fois connecté'],
    ['validation', `/suivi/?emul&retour=${encodeURIComponent('/suivi/hub#/valider/v-maquette')}&espace=hub`, '« ?retour= » vers le Hub, pour l équipe : la validation dans le Cockpit'],
    ['piece', '/suivi/cockpit#/finances/f-acompte', 'une adresse du Cockpit ouverte sans session : la porte, puis la pièce'],
  ];
  for (const [cle, chemin, nom] of PORTE) {
    const c = await nouveauContexte();
    const p = surveiller(await c.newPage(), `porte ${chemin}`);
    await p.goto(`${SITE}${chemin}`, { waitUntil: 'domcontentloaded' });
    await saisirCode(p, ADMIN);
    await arrivee(p, cle, nom);
    await c.close();
  }

  /* ---------------------------------------------------------------- */
  if (process.env.LIENS_BUREAU === '1') {
    console.log('\n== L application de bureau sur le banc');
    const { _electron: electron } = require('@playwright/test');
    const dossier = `${process.env.HOME}/Capmedia/cockpit-bureau`;
    /* Le binaire (pas le script de node_modules/.bin), et sans
       ELECTRON_RUN_AS_NODE, qu'un outil appelant peut avoir posé : Electron
       démarrerait en simple Node. */
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
    const app = await electron.launch({ executablePath: require(`${dossier}/node_modules/electron`), args: [dossier], env: { ...env, COCKPIT_ADRESSE: `${SITE}/suivi/cockpit?emul=${BANC.numero}`, COCKPIT_DOSSIER: 'Capmedia Cockpit Banc qa-liens' } });
    const fen = surveiller(await app.firstWindow(), 'bureau');
    await fen.waitForLoadState('domcontentloaded');
    await saisirCode(fen, ADMIN);
    verifier(/\/suivi\/cockpit/.test(fen.url()), 'l application de bureau ouvre le Cockpit du banc', fen.url());
    /* Le clic sur une notification du système : l'application pose le lien
       dans la page (principal.js, « capmedia:notifier »). */
    for (const [cle, lien, nom] of [['fichiers', '#/projets/atelier/fichiers', 'bureau : une notification vers les Fichiers du projet'], ['etapes', '#/projets/atelier/roadmap', 'bureau : une notification ancienne « roadmap »']]) {
      await app.evaluate(({ BrowserWindow }, l) => { BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`location.hash = ${JSON.stringify(l)}`); }, lien);
      await arrivee(fen, cle, nom);
    }
    await app.close();
  }

  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
  await nav.close();
  const menage = fs.batch();
  NOTIFS.forEach((x, i) => menage.delete(fs.doc(`boites/${adminUid}/notifications/qa-liens-${i}`)));
  ACTIVITES.forEach((x, i) => menage.delete(fs.doc(`activite/qa-liens-${i}`)));
  await menage.commit().catch(() => {});
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
