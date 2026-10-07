/* ==========================================================================
   CAPMEDIA CLIENT HUB · le socle de navigation du Cockpit (refonte, lot 1)

   Ce que prouve cette suite, dans le Cockpit :
   - le rail : un squelette d'abord, puis UN seul dessin, toutes les
     entrées et leurs chiffres d'un coup, sans « dessin sans attendre » ;
     Équipe et Paramètres épinglés en bas (groupe pied) ;
   - le bouton Retour, comme dans le Hub : caché sur l'accueil, présent
     ailleurs ; il revient à la page d'avant, et, ouvert par un lien, il
     remonte d'un cran dans le fil d'Ariane ;
   - le fil d'Ariane part de l'accueil et passe par « Projets » puis le
     projet, y compris sur la page d'une partie et la fiche d'une demande ;
   - le menu du compte mène à « Mon profil » (/moi), titrée ainsi ;
   - les adresses du Hub : /valider/:id ouvre la validation du Cockpit,
     /projets/:id/versions et /decisions ont leur place ;
   - « En attente du client » (aperçu d'un projet) mène à la fiche de la
     validation dans le Cockpit, plus à l'accueil (D1) ;
   - « Refermer au client » demande projets.ouvrir : l'administrateur l'a,
     un agent du socle non (D2) ;
   - les pages que le rôle n'ouvre pas disent « réservée », sans rien
     montrer, pour un agent ; l'administrateur les a ; un agent à qui la
     permission fine est donnée (finance.lecture) ouvre Finances.
   Le client et le testeur gardent leur coquille (suites du Hub).

   Banc : émulateurs (Functions compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.socle@exemple.test';
const AGENT_FINANCE = 'agent.finance@exemple.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);

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
const railDessine = (page) => page.waitForFunction(() => document.querySelector('#lat-corps .lat-lien[data-chemin="/demandes"]') && !document.querySelector('#lat-corps .lat-squelette'), null, { timeout: 20000 }).catch(() => {});
const aller = async (page, hash, attendu) => { await page.evaluate((h) => { location.hash = h; }, hash); if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {}); await pause(900); };
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const hash = (page) => page.evaluate(() => location.hash);
const retourVisible = (page) => page.$eval('#bouton-retour', (b) => !b.hidden && b.getBoundingClientRect().width > 0).catch(() => false);

(async () => {
  console.log('\n== Les comptes');
  const a1 = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Socle', role: 'agent', projets: ['atelier'] });
  verifier(a1.code === 200, 'un agent du socle, sur Atelier', `${a1.code} ${a1.texte.slice(0, 120)}`);
  const a2 = await appelAdmin('ajouterEquipe', { email: AGENT_FINANCE, nom: 'Agent Finance', role: 'agent', projets: ['atelier'], permissions: ['finance.lecture'] });
  verifier(a2.code === 200, 'un agent à qui la lecture de la finance est confiée', `${a2.code} ${a2.texte.slice(0, 120)}`);

  const nav = await chromium.launch();
  const erreurs = [];
  const contexte = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      window.__rail = { squelette: false, apres: [], avertis: [] };
      const w = console.warn.bind(console);
      console.warn = (...a) => { if (/dessin sans attendre/.test(String(a[0]))) window.__rail.avertis.push(String(a[0])); w(...a); };
      const regarder = () => {
        const corps = document.getElementById('lat-corps');
        if (!corps) return false;
        const noter = () => {
          if (corps.querySelector('.lat-squelette')) { window.__rail.squelette = true; return; }
          if (window.__rail.squelette) window.__rail.apres.push({ liens: corps.querySelectorAll('.lat-lien').length, comptes: corps.querySelectorAll('.compte').length });
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
  console.log('\n== Le rail : un squelette, puis un seul dessin');
  const pa = await contexte();
  await connecter(pa, ADMIN);
  await pa.reload({ waitUntil: 'domcontentloaded' });
  await railDessine(pa); await pause(2500);
  const rail = await pa.evaluate(() => window.__rail);
  verifier(rail && rail.squelette, 'le squelette du rail est posé avant les données', JSON.stringify(rail));
  const final = await pa.evaluate(() => ({ liens: document.querySelectorAll('#lat-corps .lat-lien').length, comptes: document.querySelectorAll('#lat-corps .compte').length }));
  verifier(rail && rail.apres.length === 1 && rail.apres[0].liens === final.liens && rail.apres[0].comptes === final.comptes && final.comptes > 0, 'puis remplacé d un seul dessin : toutes les entrées et leurs chiffres d un coup', `${JSON.stringify(rail && rail.apres)} / ${JSON.stringify(final)}`);
  verifier(rail && rail.avertis.length === 0, 'sans « dessin sans attendre » : toutes ses clés sont arrivées', JSON.stringify(rail && rail.avertis));
  const pied = await pa.$$eval('#lat-corps .lat-groupe--pied .lat-lien', (as) => as.map((a) => a.dataset.chemin));
  verifier(pied.join(',') === '/equipe,/parametres', 'Équipe et Paramètres épinglés en bas du rail', pied.join(','));
  const position = await pa.$eval('#lat-corps .lat-groupe--pied', (g) => getComputedStyle(g).position).catch(() => '');
  verifier(position === 'sticky', 'le pied tient en bas quand le rail défile', position);

  /* ---------------------------------------------------------------- */
  console.log('\n== Le bouton Retour et le fil d Ariane');
  await aller(pa, '#/', '.page h1');
  verifier(Boolean(await pa.$('#bouton-retour')) && !(await retourVisible(pa)), 'sur l accueil : le Retour existe, caché');
  await aller(pa, '#/projets/atelier', '#onglet-corps');
  verifier(await retourVisible(pa), 'sur un projet : le Retour est là');
  const filProjet = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Projets.*Atelier$/.test(filProjet) && Boolean(await pa.$('#ariane a[href="#/"]')), 'fil : Accueil › Projets › Atelier', filProjet);
  await aller(pa, '#/projets/atelier/taches', '#onglet-corps');
  await pa.click('#bouton-retour'); await pause(1500);
  verifier(await hash(pa) === '#/projets/atelier', 'le Retour revient à la page d avant', await hash(pa));
  await aller(pa, '#/projets/atelier/brique/ios', '.page');
  const filPartie = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Projets.*Atelier.*Application iOS$/.test(filPartie), 'la page d une partie : Accueil › Projets › Atelier › la partie', filPartie);
  await aller(pa, '#/projets/atelier/demandes/t-veille', '#ariane .courant');
  const filDemande = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Projets.*Atelier.*Demandes.*ATELIER-004$/.test(filDemande), 'la fiche d une demande : Accueil › Projets › Atelier › Demandes › son numéro', filDemande);
  await aller(pa, '#/demandes', '.page h1');
  verifier(/^Accueil.*Demandes$/.test(await texteDe(pa, '#ariane')), 'une page globale : Accueil › Demandes', await texteDe(pa, '#ariane'));
  /* Une adresse ouverte par un lien (onglet neuf) : pas de page d'avant,
     le Retour remonte d'un cran dans le fil. */
  const direct = await pa.context().newPage();
  direct.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await direct.goto(`${SITE}/suivi/cockpit#/projets/atelier/brique/ios`, { waitUntil: 'domcontentloaded' });
  await direct.waitForSelector('#ariane .courant', { timeout: 30000 }).catch(() => {}); await pause(2000);
  verifier(await retourVisible(direct), 'ouvert par un lien : le Retour est là');
  await direct.click('#bouton-retour'); await pause(1500);
  verifier(await hash(direct) === '#/projets/atelier', 'et il remonte au projet, d un cran dans le fil', await hash(direct));
  await direct.close();

  /* ---------------------------------------------------------------- */
  console.log('\n== Le menu du compte : Mon profil');
  await aller(pa, '#/', '.page h1');
  await pa.click('#bouton-compte'); await pa.waitForSelector('.menu', { timeout: 5000 }).catch(() => {});
  verifier(Boolean(await pa.$('.menu [data-cle="Mon profil"]')) && !(await pa.$('.menu [data-cle="Mon profil et mes préférences"]')), 'le menu propose « Mon profil »');
  await pa.click('.menu [data-cle="Mon profil"]'); await pause(1500);
  verifier(await hash(pa) === '#/moi' && (await texteDe(pa, '.page h1')) === 'Mon profil' && /Mon profil/.test(await texteDe(pa, '#ariane')), 'il mène à /moi, titrée « Mon profil »', `${await hash(pa)} ${await texteDe(pa, '.page h1')}`);
  verifier(Boolean(await pa.$('#section-push')) && Boolean(await pa.$('#forme-profil')), 'avec le profil et le réglage du push');
  await aller(pa, '#/parametres', '.page h1');
  verifier((await texteDe(pa, '.page h1')) === 'Paramètres', 'les Paramètres de la plateforme gardent leur titre');

  /* ---------------------------------------------------------------- */
  console.log('\n== Les adresses du Hub dans le Cockpit');
  await aller(pa, '#/valider/v-maquette', '.voile');
  verifier(await hash(pa) === '#/validations/v-maquette' && Boolean(await pa.$('.voile')), '/valider/:id ouvre la validation du Cockpit', await hash(pa));
  await pa.keyboard.press('Escape'); await pause(500);
  await aller(pa, '#/valider', '.page h1');
  verifier(await hash(pa) === '#/validations', '/valider mène aux validations', await hash(pa));
  await aller(pa, '#/projets/atelier/versions', '#onglet-corps');
  /* Lot 3 : les versions vivent dans « Plateformes et versions ». */
  verifier(await hash(pa) === '#/projets/atelier/composants', '/projets/:id/versions mène aux versions du projet (Plateformes et versions)', await hash(pa));
  await aller(pa, '#/projets/atelier/decisions', '.page');
  verifier(await hash(pa) === '#/projets/atelier/notes', '/projets/:id/decisions mène aux notes', await hash(pa));

  console.log('\n== « En attente du client » ouvre la validation dans le Cockpit (D1)');
  await aller(pa, '#/projets/atelier', '#onglet-corps');
  const lienValidation = await pa.$$eval('#onglet-corps a[href*="valid"]', (as) => as.map((a) => a.getAttribute('href')));
  verifier(lienValidation.includes('#/validations/v-maquette') && !lienValidation.some((h) => /#\/valider\//.test(h)), 'le lien vise /validations/v-maquette', lienValidation.join(' '));
  if (lienValidation.includes('#/validations/v-maquette')) {
    await pa.click('#onglet-corps a[href="#/validations/v-maquette"]'); await pause(2000);
    verifier(await hash(pa) === '#/validations/v-maquette' && Boolean(await pa.$('.voile')), 'et l ouvre, au lieu de l accueil', await hash(pa));
    await pa.keyboard.press('Escape'); await pause(500);
  }

  console.log('\n== « Refermer au client » demande projets.ouvrir (D2)');
  await aller(pa, '#/projets/atelier', '[data-action="menu-projet"]');
  await pa.click('[data-action="menu-projet"]'); await pause(400);
  verifier(Boolean(await pa.$('.menu [data-cle="Refermer au client"]')), 'l administrateur peut refermer Atelier au client');
  await pa.keyboard.press('Escape');

  /* ---------------------------------------------------------------- */
  console.log('\n== Un agent du socle');
  const pg = await contexte();
  await connecter(pg, AGENT);
  await railDessine(pg);
  await aller(pg, '#/projets/atelier', '[data-action="menu-projet"]');
  await pg.click('[data-action="menu-projet"]'); await pause(400);
  verifier(Boolean(await pg.$('.menu [data-cle="Signaler un point bloquant"]')) && !(await pg.$('.menu [data-cle="Refermer au client"]')), 'son menu ⋯ ne propose pas « Refermer au client »');
  await pg.keyboard.press('Escape');
  verifier(await retourVisible(pg), 'il a le Retour lui aussi');
  const pages = [['/clients', 'clients'], ['/clients/atelier-nord', 'clients'], ['/a-faire', 'aFaire'], ['/nouveaux-projets', 'nouveauxProjets'], ['/finances', 'finances'], ['/finances/f-acompte', 'finances'], ['/archives', 'archives'], ['/testeurs-messages', 'testeurs'], ['/annonces', 'annonces']];
  for (const [chemin, regle] of pages) {
    await aller(pg, `#${chemin}`, '.page h1');
    const refus = await pg.$(`[data-refus="${regle}"]`);
    const contenu = await pg.$('#vue .liste, #vue .metriques, #vue [data-deposer], #vue [data-noter], #tm-nouveau, #vue [data-annonce-action], #vue .onglets');
    verifier(Boolean(refus) && !contenu, `${chemin} : « réservée », sans rien montrer`, refus ? '' : (await texteDe(pg, '#vue')).slice(0, 120));
  }
  await aller(pg, '#/emails', '.page h1');
  verifier(Boolean(await pg.$('[data-refus]')), '/emails garde son propre refus');

  console.log('\n== Un agent à qui la finance est confiée');
  const pf = await contexte();
  await connecter(pf, AGENT_FINANCE);
  await railDessine(pf);
  verifier(Boolean(await pf.$('#lat-corps .lat-lien[data-chemin="/finances"]')), 'son rail propose Finances');
  await aller(pf, '#/finances', '.page h1');
  verifier(!(await pf.$('[data-refus]')) && Boolean(await pf.$('#vue .metriques')), 'et la page s ouvre : la permission fine compte, pas seulement le rôle');
  await aller(pf, '#/clients', '.page h1');
  verifier(Boolean(await pf.$('[data-refus="clients"]')), 'Clients reste réservé');

  verifier(erreurs.length === 0, `aucune erreur de page ${[...new Set(erreurs)].join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((er) => { console.error(er); process.exit(2); });
