/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'arbre des projets du Cockpit (refonte, lot 3)

   Ce que prouve cette suite, dans le Cockpit :
   - le rail : un squelette, puis UN seul dessin, arbre compris, sans
     « dessin sans attendre » ; le temps du premier dessin est mesuré ;
   - « Projets en cours » : un arbre par projet en cours (ni archivé, ni
     « à faire », ni terminé), triés par dernière activité (en direct),
     puis « Tous les projets » ; un projet ouvert hors des projets en
     cours y entre le temps de sa visite ;
   - les entrées d'un projet, dans l'ordre, et leurs adresses : les pages
     filtrées (?projet=) directement, jamais une redirection ;
   - les comptes, comparés à la base : Demandes (ouvertes / chez nous),
     Notes (à valider seulement, D10), Tâches, Tests (anomalies ouvertes,
     sans visite préalable, D10), Fichiers, Plateformes et versions ;
     « Chiffré » sur le coffre (en direct), « À venir » sur Marketing,
     « fermé » sur l'accès d'un projet fermé, Tests animé pendant une
     campagne, et le projet replié porte la somme de ce qui attend ;
   - un projet interne n'a ni Messages ni Accès client, et pas de bulle
     (D9) ; la bulle suit les pages filtrées sur un projet client (H-21) ;
   - le dépliage : seul le projet ouvert se déplie, le choix au chevron se
     retient au rechargement ;
   - l'entrée active : celle du projet, pas celle de tous les projets ;
     la page d'une partie allume « Plateformes et versions » ;
   - la page d'un projet n'a plus d'onglets horizontaux : en-tête complet
     sur l'aperçu, compact ailleurs (Modifier, menu ⋯) ;
   - « Plateformes et versions » : chaque partie mène à sa page, toutes
     les versions dessous ; /releases y mène, /releases/:rid y ouvre la
     fiche ; /tests mène à la console du projet, sauf un projet sans test ;
   - le fil d'Ariane des pages filtrées, de Messages, d'une partie, de
     Santé de l'app et de la Salle de contrôle ;
   - tous les anciens onglets s'ouvrent encore ;
   - un agent : ses projets seulement, pas de « Devis et factures » sans
     finance.lecture, Santé de l'app sur un projet relié.

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.arbre@exemple.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);
const str = (d, k) => (((d.fields || {})[k] || {}).stringValue || '');
const vrai = (d, k) => Boolean(((d.fields || {})[k] || {}).booleanValue);
const idDe = (d) => d.name.split('/').pop();
const ATTEND_EQUIPE = ['nouveau', 'a-analyser', 'acceptee', 'planifiee', 'en-cours', 'en-revue'];
const OUVERTS = [...ATTEND_EQUIPE, 'en-attente-client', 'a-valider'];

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
const aller = async (page, h, attendu) => { await page.evaluate((x) => { location.hash = x; }, h); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(1000); };
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const attendre = async (fn, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* encore */ } await pause(250); } return false; };
const attendreHash = (page, re, ms = 10000) => attendre(async () => re.test(await hash(page)), ms);
const arbre = (pid) => `#lat-corps .lat-arbre[data-arbre="${pid}"]`;
const entree = (pid, chemin) => `${arbre(pid)} .lat-branche a[data-chemin="${chemin}"]`;
const nombre = async (page, sel) => Number(((await page.$eval(sel, (el) => el.textContent).catch(() => '')) || '').trim()) || 0;
const arbres = (page) => page.$$eval('#lat-corps .lat-arbre', (as) => as.map((a) => a.dataset.arbre));
const deplie = (page, pid) => page.$eval(arbre(pid), (a) => a.classList.contains('deplie')).catch(() => null);
const actif = (page) => page.$eval('#lat-corps .lat-lien.actif', (a) => ({ chemin: a.dataset.chemin, projet: a.dataset.projet || '', courant: a.getAttribute('aria-current') })).catch(() => null);

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  const maintenant = admin.firestore.Timestamp.now();
  const ilYA = (j) => admin.firestore.Timestamp.fromMillis(Date.now() - j * 86400000);

  console.log('\n== Le semis de la suite');
  /* Un projet interne en cours, et trois projets qui ne sont PAS en cours :
     archivé, rangé « à faire », terminé. */
  await fs.doc('projets/perso-arbre').set({ nom: 'Perso arbre', ref: 'PERSO', interne: true, statut: 'en-cours', plateformes: ['web'], membres: [], archive: false, cree: ilYA(20), maj: ilYA(20) });
  await fs.doc('projets/vieux-arbre').set({ nom: 'Vieux arbre', ref: 'VIEUX', statut: 'archive', archive: true, membres: [], cree: ilYA(400), maj: ilYA(300) });
  await fs.doc('projets/idee-arbre').set({ nom: 'Idée arbre', ref: 'IDEE', statut: 'brouillon', aFaire: true, archive: false, membres: [], cree: ilYA(10), maj: ilYA(10) });
  await fs.doc('projets/fini-arbre').set({ nom: 'Fini arbre', ref: 'FINI', statut: 'termine', archive: false, membres: [], cree: ilYA(200), maj: ilYA(100) });
  /* Les notes d'Atelier : une à valider (comptée), une refusée et une
     interne (pas comptées, D10). */
  await fs.doc('notes/arbre-a-valider').set({ projet: 'atelier', type: 'proposition', etat: 'a-valider', titre: 'Proposition de la suite', contenu: '', visibilite: 'client', date: maintenant, cree: maintenant, maj: maintenant });
  await fs.doc('notes/arbre-refusee').set({ projet: 'atelier', type: 'proposition', etat: 'refusee', titre: 'Refusée par la suite', contenu: '', visibilite: 'client', date: maintenant, cree: maintenant, maj: maintenant });
  /* Atelier relié à Sentry : Santé de l'app. */
  await fs.doc('sentryLiaisons/atelier').set({ actif: true, organisation: 'banc', projets: [], maj: maintenant });
  const tickets = (await docs('tickets?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier' && !vrai(d, 'archive'));
  const ouvertes = tickets.filter((d) => OUVERTS.includes(str(d, 'statut'))).length;
  const chezNous = tickets.filter((d) => ATTEND_EQUIPE.includes(str(d, 'statut'))).length;
  const anomalies = (await docs('projets/atelier/anomalies?pageSize=300')).filter((d) => !['corrigee', 'sans-suite'].includes(str(d, 'statut'))).length;
  const notesAValider = (await docs('notes?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier' && str(d, 'etat') === 'a-valider').length;
  const parties = (await docs('projets/atelier/composants?pageSize=50')).length;
  const fichiers = (await docs('fichiers?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier' && !vrai(d, 'archive')).length;
  const versions = (await docs('releases?pageSize=300')).filter((d) => str(d, 'projet') === 'atelier');
  const campagnes = (await docs('projets/atelier/campagnes?pageSize=50')).filter((d) => str(d, 'statut') === 'en-cours').length;
  const boutiqueTests = (await docs('projets/boutique/scenarios?pageSize=5')).length + (await docs('projets/boutique/campagnes?pageSize=5')).length + (await docs('projets/boutique/anomalies?pageSize=5')).length;
  verifier(ouvertes > 0 && chezNous > 0 && notesAValider === 1 && parties >= 3 && versions.length >= 1 && campagnes >= 1 && boutiqueTests === 0,
    'le banc porte des demandes, une note à valider, des parties, des versions, une campagne en cours sur Atelier, rien de testé sur Boutique',
    `${ouvertes}/${chezNous} notes ${notesAValider} parties ${parties} versions ${versions.length} campagnes ${campagnes} boutique ${boutiqueTests}`);
  const a1 = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Arbre', role: 'agent', projets: ['atelier'] });
  verifier(a1.code === 200, 'un agent sur Atelier seul', `${a1.code} ${a1.texte.slice(0, 120)}`);
  await pause(1500);

  const nav = await chromium.launch();
  const erreurs = [];
  const contexte = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(() => {
      window.__rail = { squelette: false, apres: [], avertis: [], premier: 0 };
      const w = console.warn.bind(console);
      console.warn = (...a) => { if (/dessin sans attendre/.test(String(a[0]))) window.__rail.avertis.push(String(a.join(' '))); w(...a); };
      const regarder = () => {
        const corps = document.getElementById('lat-corps');
        if (!corps) return false;
        const noter = () => {
          if (corps.querySelector('.lat-squelette')) { window.__rail.squelette = true; return; }
          if (window.__rail.squelette) {
            if (!window.__rail.premier) window.__rail.premier = Math.round(performance.now());
            window.__rail.apres.push({ liens: corps.querySelectorAll('.lat-lien').length, arbres: corps.querySelectorAll('.lat-arbre').length, branches: corps.querySelectorAll('.lat-branche').length, comptes: corps.querySelectorAll('.compte').length });
          }
        };
        noter();
        new MutationObserver(noter).observe(corps, { childList: true });
        return true;
      };
      const mo = new MutationObserver(() => { if (regarder()) mo.disconnect(); });
      document.addEventListener('DOMContentLoaded', () => { if (!regarder()) mo.observe(document.documentElement, { childList: true, subtree: true }); });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    return page;
  };

  /* ---------------------------------------------------------------- */
  console.log('\n== Le rail : un squelette, puis un seul dessin, arbre compris');
  const pa = await contexte();
  await connecter(pa, ADMIN);
  await pa.reload({ waitUntil: 'domcontentloaded' });
  await railDessine(pa); await pause(3000);
  const rail = await pa.evaluate(() => window.__rail);
  const final = await pa.evaluate(() => { const c = document.getElementById('lat-corps'); return { liens: c.querySelectorAll('.lat-lien').length, arbres: c.querySelectorAll('.lat-arbre').length, branches: c.querySelectorAll('.lat-branche').length, comptes: c.querySelectorAll('.compte').length }; });
  verifier(rail && rail.squelette, 'le squelette du rail est posé avant les données');
  verifier(rail && rail.apres.length === 1 && JSON.stringify(rail.apres[0]) === JSON.stringify(final) && final.arbres >= 4, 'puis remplacé d un seul dessin : les arbres, leurs entrées et leurs chiffres d un coup', `${JSON.stringify(rail && rail.apres)} / ${JSON.stringify(final)}`);
  verifier(rail && rail.avertis.length === 0, 'sans « dessin sans attendre » : les clés des arbres sont attendues', JSON.stringify(rail && rail.avertis));
  console.log(`  mesure  premier dessin du rail (administrateur) : ${rail && rail.premier} ms après le début de la page, ${final.arbres} arbres, ${final.branches} entrées`);
  verifier(rail && rail.premier > 0 && rail.premier < 4000, 'le premier dessin arrive sous la patience du rail (4 s)', rail && rail.premier);

  /* ---------------------------------------------------------------- */
  console.log('\n== « Projets en cours » : les projets en cours seulement, puis « Tous les projets »');
  const groupe = await pa.$$eval('#lat-corps .lat-groupe', (gs) => gs.map((g) => ({ titre: ((g.querySelector('.lat-titre') || {}).textContent || '').trim(), arbres: [...g.querySelectorAll('.lat-arbre')].map((a) => a.dataset.arbre), dernier: (([...g.querySelectorAll(':scope > .lat-lien')].pop() || {}).dataset || {}).chemin || '' })).find((g) => /Projets en cours/i.test(g.titre)));
  const enCours = ['atelier', 'boutique', 'prepa', 'ancien', 'perso-arbre'];
  verifier(groupe && enCours.every((p) => groupe.arbres.includes(p)), 'un arbre pour chaque projet en cours, client ou interne', groupe && groupe.arbres.join(','));
  verifier(groupe && !['vieux-arbre', 'idee-arbre', 'fini-arbre'].some((p) => groupe.arbres.includes(p)), 'ni l archivé, ni le projet à faire, ni le terminé', groupe && groupe.arbres.join(','));
  verifier(groupe && groupe.dernier === '/projets' && /Tous les projets/.test(await texteDe(pa, '#lat-corps .lat-lien[data-chemin="/projets"]')), '« Tous les projets » ferme la liste', groupe && groupe.dernier);

  console.log('\n== Triés par dernière activité, en direct');
  await fs.collection('activite').add({ projet: 'ancien', type: 'note', titre: 'Mouvement de la suite (arbre)', texte: '', visibilite: 'interne', date: admin.firestore.Timestamp.now(), par: { nom: 'Suite' } });
  verifier(await attendre(async () => (await arbres(pa))[0] === 'ancien', 12000), 'un mouvement sur ANCIEN le fait passer en tête', (await arbres(pa)).join(','));
  await pause(500);
  await fs.collection('activite').add({ projet: 'boutique', type: 'note', titre: 'Mouvement de la suite (arbre)', texte: '', visibilite: 'interne', date: admin.firestore.Timestamp.now(), par: { nom: 'Suite' } });
  verifier(await attendre(async () => { const a = await arbres(pa); return a[0] === 'boutique' && a[1] === 'ancien'; }, 12000), 'puis un mouvement sur Boutique la met devant', (await arbres(pa)).join(','));

  /* ---------------------------------------------------------------- */
  console.log('\n== Les entrées d Atelier, dans l ordre, et leurs adresses');
  await aller(pa, '#/projets/atelier', '#onglet-corps');
  verifier(await attendre(async () => deplie(pa, 'atelier')), 'ouvrir Atelier déplie son arbre');
  const entrees = await pa.$$eval(`${arbre('atelier')} .lat-branche a`, (as) => as.map((a) => ({ chemin: a.dataset.chemin, href: a.getAttribute('href'), texte: a.querySelector('.tronque').textContent.trim() })));
  const attendues = [
    ['Aperçu', '#/projets/atelier'], ['Demandes', '#/projets/atelier/demandes'], ['Messages', '#/messages/atelier'], ['Feuille de route', '#/projets/atelier/etapes'],
    ['Notes', '#/projets/atelier/notes'], ['Tâches', '#/projets/atelier/taches'], ['Calendrier', '#/calendrier?projet=atelier'], ['Tests', '#/tests?projet=atelier'],
    ['Marketing', '#/projets/atelier/marketing'], ['Coffre-fort', '#/projets/atelier/coffre'], ['Fichiers', '#/fichiers?projet=atelier'], ['Ressources', '#/projets/atelier/liens'],
    ['Axes d\'évolution', '#/projets/atelier/evolutions'], ['Devis et factures', '#/finances?projet=atelier'], ['Maintenance', '#/maintenance?projet=atelier'],
    ['Santé de l\'app', '#/projets/atelier/stabilite'], ['Plateformes et versions', '#/projets/atelier/composants'], ['Accès client', '#/projets/atelier/acces'],
  ];
  verifier(JSON.stringify(entrees.map((e) => [e.texte, e.href])) === JSON.stringify(attendues), 'les dix-huit entrées, dans l ordre du client puis celles de l équipe, vers leur page directe', entrees.map((e) => `${e.texte}=${e.href}`).join(' '));

  console.log('\n== Les comptes, comparés à la base');
  const demandes = entree('atelier', '/projets/atelier/demandes');
  const grisDemandes = await nombre(pa, `${demandes} .compte:not(.vif)`);
  const rougeDemandes = await nombre(pa, `${demandes} .compte.vif`);
  verifier(rougeDemandes === chezNous && (grisDemandes === ouvertes || (ouvertes === chezNous && !grisDemandes)), 'Demandes : ouvertes en gris, chez nous en rouge', `${grisDemandes}/${rougeDemandes} attendu ${ouvertes}/${chezNous}`);
  verifier(await nombre(pa, `${entree('atelier', '/projets/atelier/notes')} .compte`) === notesAValider, 'Notes : les propositions à valider seulement, ni refusées ni internes (D10)', await texteDe(pa, entree('atelier', '/projets/atelier/notes')));
  const tests = `${arbre('atelier')} .lat-branche a[data-chemin="/tests"]`;
  verifier((await nombre(pa, `${tests} .compte.vif`)) === anomalies, 'Tests : les anomalies ouvertes, sans avoir ouvert la page (D10)', `${await nombre(pa, `${tests} .compte.vif`)} / ${anomalies}`);
  verifier(await pa.$eval(tests, (a) => a.classList.contains('lat-lien--en-cours')).catch(() => false), 'Tests est animé : une campagne tourne sur Atelier');
  verifier((await nombre(pa, `${entree('atelier', '/fichiers')} .compte`)) === fichiers, 'Fichiers : les fichiers non archivés du projet', `${await nombre(pa, `${entree('atelier', '/fichiers')} .compte`)} / ${fichiers}`);
  verifier((await nombre(pa, `${entree('atelier', '/projets/atelier/composants')} .compte`)) === parties, 'Plateformes et versions : les parties', `${await nombre(pa, `${entree('atelier', '/projets/atelier/composants')} .compte`)} / ${parties}`);
  verifier(/À venir/.test(await texteDe(pa, `${entree('atelier', '/projets/atelier/marketing')} .lat-marqueur`)), 'Marketing : « À venir »');
  verifier(!(await pa.$(`${entree('atelier', '/projets/atelier/coffre')} .lat-marqueur`)), 'Coffre-fort : pas de « Chiffré » tant qu il n est pas créé');
  await fs.doc('coffres/atelier').set({ g: 1, porteurs: [], maj: maintenant });
  verifier(await attendre(async () => /Chiffré/.test(await texteDe(pa, `${entree('atelier', '/projets/atelier/coffre')} .lat-marqueur--vert`)), 10000), 'puis « Chiffré », en vert, dès qu il existe (en direct)');
  verifier(await pa.$eval(`${arbre('prepa')} .lat-branche a[data-chemin="/projets/prepa/acces"]`, (a) => /fermé/.test(a.textContent)).catch(() => false), 'Accès client d un projet pas encore ouvert : « fermé »');
  const messagesRouge = await nombre(pa, `${entree('atelier', '/messages/atelier')} .compte.vif`);
  await pa.click(`${arbre('atelier')} .lat-arbre-bascule`); await pause(600);
  verifier((await deplie(pa, 'atelier')) === false, 'le chevron replie Atelier');
  verifier((await nombre(pa, `${arbre('atelier')} .lat-projet .compte.vif`)) === chezNous + messagesRouge, 'replié, il porte la somme : les demandes chez nous et les messages non lus', `${await nombre(pa, `${arbre('atelier')} .lat-projet .compte.vif`)} / ${chezNous}+${messagesRouge}`);

  /* ---------------------------------------------------------------- */
  console.log('\n== Un projet interne : ni Messages, ni Accès client, ni bulle (D9)');
  await aller(pa, '#/projets/perso-arbre', '#onglet-corps');
  const interne = await pa.$$eval(`${arbre('perso-arbre')} .lat-branche a`, (as) => as.map((a) => a.dataset.chemin));
  verifier(interne.length > 10 && !interne.includes('/messages/perso-arbre') && !interne.includes('/projets/perso-arbre/acces'), 'son arbre n a ni Messages ni Accès client', interne.join(','));
  verifier(!(await pa.$('.bulle')), 'pas de bulle sur un projet sans client');
  await aller(pa, '#/fichiers?projet=perso-arbre', '.page h1');
  verifier(!(await pa.$('.bulle')), 'ni sur ses pages filtrées');
  await aller(pa, '#/fichiers?projet=atelier', '.page h1');
  verifier(await attendre(async () => Boolean(await pa.$('.bulle[data-projet="atelier"]'))), 'la bulle d Atelier suit ses pages filtrées (Fichiers)');
  await aller(pa, '#/messages/atelier', '#fil');
  verifier(!(await pa.$('.bulle')), 'et s efface sur Messages, où la conversation est la page');

  /* ---------------------------------------------------------------- */
  console.log('\n== Le dépliage : seul le projet ouvert');
  await aller(pa, '#/projets/atelier/taches', '#onglet-corps');
  verifier(await attendre(async () => (await deplie(pa, 'atelier')) === true), 'revenir dans Atelier le redéplie');
  await aller(pa, '#/projets/boutique/taches', '#onglet-corps');
  verifier(await attendre(async () => (await deplie(pa, 'boutique')) === true && (await deplie(pa, 'atelier')) === false), 'entrer dans Boutique la déplie et replie Atelier');
  await aller(pa, '#/taches', '.page h1');
  verifier((await deplie(pa, 'boutique')) === true, 'une page de tous les projets ne replie rien');
  await pa.click(`${arbre('atelier')} .lat-arbre-bascule`); await pause(600);
  verifier((await deplie(pa, 'atelier')) === true && (await deplie(pa, 'boutique')) === true, 'le chevron déplie Atelier sans toucher Boutique');
  await pa.reload({ waitUntil: 'domcontentloaded' }); await railDessine(pa); await pause(2500);
  verifier((await deplie(pa, 'atelier')) === true && (await deplie(pa, 'boutique')) === true && (await deplie(pa, 'prepa')) === false, 'le choix se retient au rechargement');

  /* ---------------------------------------------------------------- */
  console.log('\n== L entrée active');
  await aller(pa, '#/fichiers?projet=atelier', '.page h1');
  let a = await actif(pa);
  verifier(a && a.chemin === '/fichiers' && a.projet === 'atelier' && a.courant === 'page', 'sur Fichiers filtrée sur Atelier : l entrée Fichiers d Atelier, pas celle de tous les projets', JSON.stringify(a));
  await aller(pa, '#/fichiers', '.page h1');
  a = await actif(pa);
  verifier(a && a.chemin === '/fichiers' && !a.projet, 'sans filtre : l entrée de tous les projets', JSON.stringify(a));
  await aller(pa, '#/projets/atelier/brique/ios', '.page');
  a = await actif(pa);
  verifier(a && a.chemin === '/projets/atelier/composants', 'la page d une partie allume « Plateformes et versions »', JSON.stringify(a));
  await aller(pa, '#/projets/atelier/demandes/t-veille', '.page h1');
  a = await actif(pa);
  verifier(a && a.chemin === '/projets/atelier/demandes', 'la fiche d une demande allume Demandes', JSON.stringify(a));

  /* ---------------------------------------------------------------- */
  console.log('\n== La page d un projet, sans onglets horizontaux');
  await aller(pa, '#/projets/atelier', '#onglet-corps');
  verifier(!(await pa.$('#onglets-projet')) && !(await pa.$('.onglets-enveloppe')), 'plus de barre d onglets sur l aperçu');
  verifier(Boolean(await pa.$('.page-tete--projet .tete-suivi')) && Boolean(await pa.$('.cartes-plateformes')) && Boolean(await pa.$('.page-tete--projet a[href="#/projets/atelier/nouvelle-demande"]')), 'l aperçu garde l en-tête complet, les cartes et « Nouvelle demande »');
  await aller(pa, '#/projets/atelier/taches', '#onglet-corps');
  verifier(!(await pa.$('#onglets-projet')), 'ni sur une autre page du projet');
  verifier((await texteDe(pa, '.page-tete--compacte h1')) === 'Atelier' && Boolean(await pa.$('.page-tete--compacte [data-action="editer-projet"]')) && Boolean(await pa.$('.page-tete--compacte [data-action="menu-projet"]')) && !(await pa.$('.cartes-plateformes')) && !(await pa.$('.tete-suivi')), 'ailleurs, un en-tête compact : le nom, Modifier, le menu ⋯', await texteDe(pa, '.page-tete'));
  await pa.click('.page-tete--compacte [data-action="menu-projet"]'); await pause(400);
  verifier(Boolean(await pa.$('.menu [data-cle="Archiver le projet"]')) && Boolean(await pa.$('.menu [data-cle="Signaler un point bloquant"]')) && Boolean(await pa.$('.menu [data-cle="Note d\'idée"]')), 'le menu ⋯ garde ses entrées, « Note d idée » comprise');
  await pa.keyboard.press('Escape'); await pause(300);

  console.log('\n== Plateformes et versions');
  await aller(pa, '#/projets/atelier/composants', '#onglet-corps');
  verifier(Boolean(await pa.$('#onglet-corps a[data-partie-lien="ios"][href="#/projets/atelier/brique/ios"]')), 'chaque partie mène à sa page');
  verifier((await pa.$$('#versions-projet .carte[data-release]')).length === versions.length && Boolean(await pa.$('#versions-projet [data-action="nouveau"][data-genre="release"]')), 'toutes les versions dessous, et « Nouvelle version »', (await pa.$$('#versions-projet .carte[data-release]')).length);
  await pa.click('#onglet-corps a[data-partie-lien="ios"]');
  verifier(await attendreHash(pa, /^#\/projets\/atelier\/brique\/ios$/), 'le nom de la partie ouvre sa page', await hash(pa));
  await aller(pa, '#/projets/atelier/releases', null);
  verifier(await attendreHash(pa, /^#\/projets\/atelier\/composants$/), '/releases mène à Plateformes et versions', await hash(pa));
  await aller(pa, `#/projets/atelier/releases/${idDe(versions[0])}`, '.voile .feuille');
  verifier(Boolean(await pa.$('.voile .feuille .modale-tete h2')) && Boolean(await pa.$('#versions-projet')), '/releases/:rid ouvre la fiche de la version sur cette page');
  await pa.keyboard.press('Escape'); await pause(400);

  console.log('\n== Tests : la console du projet');
  await aller(pa, '#/projets/atelier/tests', null);
  verifier(await attendreHash(pa, /^#\/tests\?projet=atelier$/), '/projets/atelier/tests mène à la console filtrée sur Atelier', await hash(pa));
  await aller(pa, '#/projets/boutique/tests', '#onglet-corps');
  verifier(/^#\/projets\/boutique\/tests$/.test(await hash(pa)) && Boolean(await pa.$('#onglet-corps [data-action="nouveau"][data-genre="scenario"]')), 'un projet sans aucun test garde sa page, d où l on écrit le premier scénario', await hash(pa));
  verifier(await pa.$eval(`${arbre('boutique')} .lat-branche a[data-chemin="/projets/boutique/tests"]`, (x) => x.getAttribute('href') === '#/projets/boutique/tests').catch(() => false), 'et son entrée Tests y mène');

  /* ---------------------------------------------------------------- */
  console.log('\n== Le fil d Ariane des pages d un projet');
  const fils = [
    ['#/fichiers?projet=atelier', /^Accueil.*Projets.*Atelier.*Fichiers$/],
    ['#/calendrier?projet=atelier', /^Accueil.*Projets.*Atelier.*Calendrier$/],
    ['#/maintenance?projet=atelier', /^Accueil.*Projets.*Atelier.*Maintenance$/],
    ['#/messages/atelier', /^Accueil.*Projets.*Atelier.*Messages$/],
    ['#/projets/atelier/brique/ios', /^Accueil.*Projets.*Atelier.*Plateformes et versions.*Application iOS$/],
    ['#/projets/atelier/composants', /^Accueil.*Projets.*Atelier.*Plateformes et versions$/],
    ['#/projets/atelier/stabilite', /^Accueil.*Projets.*Atelier.*Santé de l'app$/],
    ['#/projets/atelier/controle', /^Accueil.*Projets.*Atelier.*Santé de l'app.*Salle de contrôle$/],
  ];
  for (const [h, re] of fils) {
    await aller(pa, h, '#ariane .courant'); await pause(400);
    verifier(re.test(await texteDe(pa, '#ariane')), `${h} : ${re.source.replace(/\.\*/g, ' › ').replace(/[\^$]/g, '')}`, await texteDe(pa, '#ariane'));
  }
  await aller(pa, '#/calendrier?projet=atelier', '#f-projet');
  await pa.selectOption('#f-projet', ''); await pause(1500);
  verifier(/^Accueil.*Calendrier$/.test(await texteDe(pa, '#ariane')) && !/Atelier/.test(await texteDe(pa, '#ariane')), 'changer de projet sur place met le fil à jour', await texteDe(pa, '#ariane'));

  /* ---------------------------------------------------------------- */
  console.log('\n== Un projet ouvert hors des projets en cours');
  await aller(pa, '#/projets/fini-arbre/taches', '#onglet-corps');
  verifier(await attendre(async () => (await arbres(pa)).includes('fini-arbre') && (await deplie(pa, 'fini-arbre')) === true), 'il entre dans l arbre, déplié, le temps de la visite');
  await aller(pa, '#/taches', '.page h1');
  verifier(await attendre(async () => !(await arbres(pa)).includes('fini-arbre')), 'et en sort quand on le quitte');

  console.log('\n== Les anciens onglets s ouvrent encore');
  for (const o of ['etapes', 'taches', 'demandes', 'liens', 'coffre', 'marketing', 'composants', 'acces', 'roadmap', 'notes', 'evolutions', 'stabilite', 'controle', 'fichiers', 'reunions', 'activite', 'releases', 'tests', 'versions', 'decisions', 'suggestions', 'apercu']) {
    await aller(pa, `#/projets/atelier/${o}`, null); await pause(800);
    const h = await hash(pa);
    /* La Salle de contrôle n'a pas de h1 : son en-tête sombre la nomme. */
    const titre = await texteDe(pa, '#vue h1, #vue [data-salle] .salle-surtitre');
    verifier(h !== '#/' && titre && !/introuvable/i.test(await texteDe(pa, '#vue')), `/projets/atelier/${o} → ${h}`, `${h} ${titre}`);
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== Un agent : ses projets seulement');
  const pg = await contexte();
  await connecter(pg, AGENT);
  /* Rechargé sur Tâches : la page d'accueil a son propre dessinateur, qui
     attend les pièces de l'agent (avertissement hors du rail, lot 5). */
  await aller(pg, '#/taches', '.page h1');
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await railDessine(pg); await pause(3000);
  const railAgent = await pg.evaluate(() => window.__rail);
  verifier(railAgent && railAgent.apres.length === 1 && railAgent.avertis.length === 0, 'son rail aussi : un squelette, un seul dessin, sans dessin sans attendre', JSON.stringify(railAgent));
  console.log(`  mesure  premier dessin du rail (agent) : ${railAgent && railAgent.premier} ms`);
  verifier(JSON.stringify(await arbres(pg)) === JSON.stringify(['atelier']), 'un seul arbre : Atelier', (await arbres(pg)).join(','));
  verifier((await deplie(pg, 'atelier')) === true, 'son seul projet en cours est déplié d office');
  const branchesAgent = await pg.$$eval(`${arbre('atelier')} .lat-branche a`, (as) => as.map((x) => x.dataset.chemin));
  verifier(!branchesAgent.includes('/finances') && branchesAgent.includes('/projets/atelier/stabilite') && branchesAgent.includes('/projets/atelier/acces'), 'pas de « Devis et factures » sans finance.lecture ; Santé de l app et Accès client y sont', branchesAgent.join(','));
  verifier(Boolean(await pg.$('#lat-corps .lat-lien[data-chemin="/projets"]')), '« Tous les projets » aussi');
  await aller(pg, '#/projets/atelier/taches', '#onglet-corps');
  verifier(!(await pg.$('#onglets-projet')) && Boolean(await pg.$('.page-tete--compacte [data-action="menu-projet"]')), 'sa page de projet : sans onglets, avec l en-tête compact');

  verifier(erreurs.length === 0, `aucune erreur de page ${[...new Set(erreurs)].join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((er) => { console.error(er); process.exit(2); });
