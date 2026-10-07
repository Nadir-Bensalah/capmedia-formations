/* ==========================================================================
   CAPMEDIA CLIENT HUB · Tests et testeurs dans le Cockpit (refonte, lot 7)

   Ce que prouve cette suite, dans le Cockpit :
   - le fil d'Ariane de la page Tests suit le projet choisi : « Accueil ›
     Projets › Atelier › Tests », et revient à « Accueil › Tests » sur tous
     les projets, par le sélecteur comme par l'adresse (T-009). Le titre
     reste « Tests » ;
   - sur tous les projets, le crayon d'un robot ou d'une règle ouvre son
     éditeur, dans son projet (D11) ;
   - l'onglet « Ce qu'on vérifie » propose « Nouveau scénario » à
     l'équipe, et le scénario écrit arrive dans la liste (P-220, T-145) ;
     le client ne voit pas le bouton ;
   - Messages › Testeurs mène à la fiche du testeur et à ses campagnes
     (T-115) ; un testeur qui n'est plus au vivier le dit ;
   - la fiche d'une case du tableau dit « Réussi », « Sans objet », jamais
     la clé brute d'un passage, ancien (ok) ou nouveau (reussi) (D12) ;
   - un projet relié à Sentry sans relevé dit « Pas encore de relevé »,
     plus de squelette sans fin (D13).

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne, semer-parcours, semer-regles (semis communs du banc).
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const ADMIN = 'agent.essai@exemple.test';
const CLIENTE = 'lea.essai@exemple.test';
const P = 'atelier';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => ((((await lire(c)) || {}).documents) || []);
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const effacer = async (c) => fetch(bdd(c), { method: 'DELETE', headers: prop });
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: v });
const T = (d) => ({ timestampValue: d.toISOString() }); const L = (xs) => ({ arrayValue: { values: xs } });
const M = (o) => ({ mapValue: { fields: o } });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
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
/* Une adresse ouverte depuis /moi : une page Tests ouverte depuis une
   autre se met à jour sur place et ignore « &testeur= », « &campagne= ». */
const aller = async (page, h, attendu) => {
  await page.evaluate(() => { location.hash = '#/moi'; });
  await page.waitForFunction(() => location.hash === '#/moi', null, { timeout: 5000 }).catch(() => {});
  await pause(500);
  await page.evaluate((x) => { location.hash = x; }, h);
  if (attendu) await page.waitForSelector(attendu, { timeout: 20000 }).catch(() => {});
  await pause(900);
};
const texteDe = async (page, sel) => ((await page.$eval(sel, (el) => el.innerText).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const fermer = async (page) => { await page.keyboard.press('Escape').catch(() => {}); await pause(500); };

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return page;
  };
  const pa = await ouvrir();
  await connecter(pa, ADMIN);
  verifier(/\/suivi\/cockpit/.test(pa.url()), 'l administrateur entre dans le Cockpit', pa.url());

  /* ---------------------------------------------------------------- */
  console.log('\n== Le fil d Ariane de la page Tests (T-009)');
  await aller(pa, '#/tests', '#etage-projets');
  const filTous = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Tests$/.test(filTous) && !(await pa.$('#ariane a[href="#/projets/atelier"]')), 'tous les projets : Accueil › Tests', filTous);
  await aller(pa, `#/tests?projet=${P}`, '#onglets-tests');
  await pa.waitForSelector('#ariane a[href="#/projets/atelier"]', { timeout: 8000 }).catch(() => {});
  const filProjet = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Projets.*Atelier.*Tests$/.test(filProjet), 'un projet choisi : Accueil › Projets › Atelier › Tests', filProjet);
  verifier(Boolean(await pa.$('#ariane a[href="#/projets"]')) && Boolean(await pa.$('#ariane a[href="#/projets/atelier"]')) && (await texteDe(pa, '#ariane .courant')) === 'Tests', 'Projets et le projet sont des liens, Tests la page courante');
  verifier((await texteDe(pa, '.page h1')) === 'Tests', 'le titre de la page reste « Tests »', await texteDe(pa, '.page h1'));
  /* Changer de projet par le sélecteur : la page se met à jour sur place,
     le fil suit. */
  await pa.selectOption('#f-projet', '');
  await pa.waitForFunction(() => !document.querySelector('#ariane a[href="#/projets/atelier"]'), null, { timeout: 8000 }).catch(() => {});
  const filRetour = await texteDe(pa, '#ariane');
  verifier(/^Accueil.*Tests$/.test(filRetour) && !/Atelier/.test(filRetour), 'revenir à tous les projets : le fil redevient Accueil › Tests', filRetour);
  await pa.selectOption('#f-projet', P);
  await pa.waitForSelector('#ariane a[href="#/projets/atelier"]', { timeout: 8000 }).catch(() => {});
  verifier(/Atelier.*Tests$/.test(await texteDe(pa, '#ariane')), 'puis rechoisir Atelier : le fil le reprend', await texteDe(pa, '#ariane'));
  await pa.click('#ariane a[href="#/projets/atelier"]', { timeout: 5000 }).catch(() => {});
  await pa.waitForFunction(() => location.hash === '#/projets/atelier', null, { timeout: 8000 }).catch(() => {});
  verifier(await pa.evaluate(() => location.hash) === '#/projets/atelier', 'le projet du fil mène à sa page', await pa.evaluate(() => location.hash));

  /* ---------------------------------------------------------------- */
  console.log('\n== Tous les projets : le crayon d un robot et d une règle (D11)');
  await aller(pa, '#/tests', '#etage-machine');
  await pa.click('#etage-machine [data-plier-parcours]').catch(() => {}); await pause(400);
  const crayonP = await pa.$eval('#etage-machine [data-editer-parcours]', (b) => ({ ref: b.dataset.editerParcours, projet: b.dataset.projetRobot || '' })).catch(() => null);
  verifier(crayonP && crayonP.projet === P, 'le crayon d un robot dit son projet', JSON.stringify(crayonP));
  if (crayonP) {
    await pa.click(`#etage-machine [data-editer-parcours="${crayonP.ref}"]`);
    await pa.waitForSelector('.voile .feuille #ed-outil', { timeout: 8000 }).catch(() => {});
    const ref = await pa.$eval('.voile .feuille #ed-ref', (e) => ({ v: e.value, ro: e.readOnly })).catch(() => null);
    verifier(ref && ref.v === crayonP.ref && ref.ro, 'il ouvre l éditeur de CE robot (référence en lecture seule)', JSON.stringify(ref));
    await fermer(pa);
  }
  await pa.click('#etage-machine [data-plier-regles]').catch(() => {}); await pause(400);
  const crayonR = await pa.$eval('#etage-machine [data-editer-regle]', (b) => ({ ref: b.dataset.editerRegle, projet: b.dataset.projetRobot || '' })).catch(() => null);
  verifier(crayonR && crayonR.projet === P, 'le crayon d une règle dit son projet', JSON.stringify(crayonR));
  if (crayonR) {
    await pa.click(`#etage-machine [data-editer-regle="${crayonR.ref}"]`);
    await pa.waitForSelector('.voile .feuille #ed-famille', { timeout: 8000 }).catch(() => {});
    const ref = await pa.$eval('.voile .feuille #ed-ref', (e) => e.value).catch(() => '');
    verifier(ref === crayonR.ref, 'il ouvre l éditeur de CETTE règle', ref);
    await fermer(pa);
  }

  /* ---------------------------------------------------------------- */
  console.log('\n== « Nouveau scénario » dans Ce qu on vérifie (P-220, T-145)');
  await effacer(`projets/${P}/scenarios/ZZ-77`);
  await aller(pa, `#/tests?projet=${P}&onglet=bibliotheque`, '#scenarios');
  const bouton = await texteDe(pa, '#scenarios [data-action="nouveau"][data-genre="scenario"]');
  verifier(/Nouveau scénario/.test(bouton), 'l équipe a le bouton « Nouveau scénario »', bouton);
  await pa.click('#scenarios [data-action="nouveau"][data-genre="scenario"]').catch(() => {});
  await pa.waitForSelector('.voile .feuille #ed-ref', { timeout: 8000 }).catch(() => {});
  verifier(Boolean(await pa.$('.voile .feuille #ed-niveau')), 'il ouvre l éditeur de scénario');
  await pa.fill('#ed-ref', 'ZZ-77').catch(() => {});
  await pa.fill('#ed-titre', 'Scénario écrit depuis la page Tests').catch(() => {});
  await pa.fill('#ed-attendu', 'Il arrive dans la liste').catch(() => {});
  await pa.click('button[type="submit"][form="ed-forme"]').catch(() => {});
  const enBase = await attendre(async () => { const d = await lire(`projets/${P}/scenarios/ZZ-77`); return d && d.fields ? d : null; }, 30, 500);
  verifier(enBase && champ(enBase, 'titre').stringValue === 'Scénario écrit depuis la page Tests', 'le scénario est écrit dans le projet', JSON.stringify(enBase && enBase.fields).slice(0, 200));
  await pa.click('#scenarios [data-plier-scenarios]').catch(() => {});
  const arrive = await attendre(async () => Boolean(await pa.$('#bibliotheque [data-scenario="ZZ-77"]')), 20, 500);
  verifier(arrive, 'et il arrive dans la liste, sans recharger');

  /* ---------------------------------------------------------------- */
  console.log('\n== Messages › Testeurs : la fiche et les campagnes (T-115)');
  const gens = await docs('testeurs?pageSize=100');
  const karimDoc = gens.find((x) => champ(x, 'email').stringValue === 'karim.testeur@essai.test');
  const karim = karimDoc ? karimDoc.name.split('/').pop() : '';
  verifier(Boolean(karim), 'Karim est au vivier du banc');
  await aller(pa, `#/testeurs-messages/${karim}`, '#tm-liens [data-fiche-testeur]');
  const liens = await pa.evaluate(() => ({
    fiche: (document.querySelector('#tm-liens [data-fiche-testeur]') || {}).getAttribute ? document.querySelector('#tm-liens [data-fiche-testeur]').getAttribute('href') : '',
    campagnes: [...document.querySelectorAll('#tm-liens [data-campagne-testeur]')].map((a) => ({ id: a.dataset.campagneTesteur, href: a.getAttribute('href'), texte: a.textContent.trim() })),
    texte: (document.querySelector('#tm-liens') || {}).innerText || '',
  }));
  verifier(liens.fiche === `#/tests?testeur=${karim}`, 'un lien vers sa fiche', liens.fiche);
  const coct = liens.campagnes.find((c) => c.id === 'c-oct');
  verifier(coct && coct.href === `#/tests?projet=${P}&campagne=c-oct` && coct.texte === 'Campagne du banc' && /Atelier/.test(liens.texte), 'et ses campagnes, chacune vers sa fiche dans son projet', JSON.stringify(liens));
  await pa.click('#tm-liens [data-fiche-testeur]', { timeout: 5000 }).catch(() => {});
  await pa.waitForSelector('.voile .feuille #t-aisance', { timeout: 15000 }).catch(() => {});
  const prenom = await pa.$eval('.voile .feuille #t-prenom', (e) => e.value).catch(() => '');
  verifier(prenom === 'Karim', 'la fiche du testeur s ouvre dans la page Tests', `${prenom} ${await pa.evaluate(() => location.hash)}`);
  await fermer(pa);
  await aller(pa, `#/testeurs-messages/${karim}`, '#tm-liens [data-campagne-testeur="c-oct"]');
  await pa.click('#tm-liens [data-campagne-testeur="c-oct"]', { timeout: 5000 }).catch(() => {});
  await pa.waitForSelector('.voile .feuille .chiffres-tests', { timeout: 15000 }).catch(() => {});
  verifier(Boolean(await pa.$('.voile .feuille .chiffres-tests')) && /projet=atelier/.test(await pa.evaluate(() => location.hash)), 'la campagne s ouvre, dans son projet', await pa.evaluate(() => location.hash));
  await fermer(pa);
  await aller(pa, '#/testeurs-messages/reg-inconnu', '#tm-liens');
  await pa.waitForFunction(() => /Plus au vivier/.test((document.querySelector('#tm-liens') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const inconnu = await texteDe(pa, '#tm-liens');
  verifier(/Plus au vivier/.test(inconnu) && /Aucune campagne/.test(inconnu) && !(await pa.$('#tm-liens [data-fiche-testeur]')), 'un testeur sorti du vivier : pas de lien mort, la page le dit', inconnu);

  /* ---------------------------------------------------------------- */
  console.log('\n== La fiche d une case : les résultats en mots (D12)');
  const sections = (await docs(`projets/${P}/planTests?pageSize=100`)).filter((d) => d.name.split('/').pop() !== 'presentation');
  /* Le premier scénario du plan, et une plateforme où il a un sens. */
  const { premier, plat } = (() => {
    for (const d of sections) {
      const f = (((champ(d, 'aspects').mapValue || {}).fields || {}).fonctionnel || {}).arrayValue;
      const v = (((f || {}).values || [])[0] || {}).mapValue;
      if (v) {
        const plats = ((((v.fields || {}).plateformes || {}).arrayValue || {}).values || []).map((x) => x.stringValue);
        return { premier: v.fields.id.stringValue, plat: plats[0] || 'web' };
      }
    }
    return { premier: '', plat: '' };
  })();
  verifier(Boolean(premier), 'le plan du banc a un scénario', premier);
  const sonia = (gens.find((x) => champ(x, 'email').stringValue === 'sonia.testeur@essai.test') || { name: '' }).name.split('/').pop();
  const marc = (gens.find((x) => champ(x, 'email').stringValue === 'marc.testeur@essai.test') || { name: '' }).name.split('/').pop();
  const passage = (qui, resultat) => poser(`projets/${P}/campagnes/c-oct/passages/${qui}__${premier}__${plat}`, {
    scenario: S(premier), testeur: S(qui), plateforme: S(plat), resultat: S(resultat), commentaire: S(''),
    preuves: L([]), contexte: M({}), cree: T(new Date()), maj: T(new Date()),
  });
  await passage(karim, 'reussi');
  await passage(sonia, 'sans-objet');
  await passage(marc, 'ok');
  await pause(1500);
  await aller(pa, `#/tests?projet=${P}`, '.tb [data-deplier]');
  if (await pa.$eval('.tb [data-deplier]', (b) => b.getAttribute('aria-expanded') !== 'true').catch(() => false)) await pa.click('.tb [data-deplier]');
  await pa.waitForSelector('.tb-controles [data-voie="humains"]', { timeout: 10000 }).catch(() => {});
  await pa.click('.tb-controles [data-voie="humains"]').catch(() => {});
  await pa.waitForSelector(`.tb-case[data-case="plan:${premier}"]`, { timeout: 15000 }).catch(() => {});
  await pa.click(`.tb-case[data-case="plan:${premier}"]`).catch(() => {});
  await pa.waitForSelector('.modale--scenario .tb-passage .pastille', { timeout: 10000 }).catch(() => {});
  const pastilles = await pa.$$eval('.modale--scenario .tb-passage .pastille', (ps) => ps.map((p) => p.textContent.trim()));
  verifier(pastilles.includes('Réussi') && pastilles.includes('Sans objet'), 'les résultats d aujourd hui se lisent en mots : Réussi, Sans objet', pastilles.join(','));
  verifier(pastilles.filter((x) => x === 'Réussi').length >= 2, 'l ancien « ok » se lit aussi « Réussi »', pastilles.join(','));
  verifier(!pastilles.some((x) => /^(reussi|echec|sans-objet|OK|KO|NA)$/.test(x)), 'aucune clé brute dans la fiche', pastilles.join(','));
  await fermer(pa);

  /* ---------------------------------------------------------------- */
  console.log('\n== Stabilité reliée sans relevé (D13)');
  await effacer('sentry/boutique');
  await poser('sentryLiaisons/boutique', { actif: B(true), org: S('banc'), web: S('boutique-web'), mobile: S(''), maj: T(new Date()) });
  await aller(pa, '#/projets/boutique/stabilite', '.page-stabilite');
  await pause(4000);
  const etat = await pa.evaluate(() => ({
    attente: Boolean(document.querySelector('.page-stabilite[data-stab-attente]')),
    titre: ((document.querySelector('.page-stabilite .vide-titre') || {}).textContent || '').trim(),
    squelette: Boolean(document.querySelector('#vue .squelette')),
    actualiser: Boolean(document.querySelector('.page-stabilite [data-stab-action="actualiser"]')),
  }));
  verifier(etat.attente && etat.titre === 'Pas encore de relevé' && !etat.squelette, 'relié sans relevé : la page le dit, plus de squelette sans fin', JSON.stringify(etat));
  verifier(etat.actualiser, 'avec « Actualiser » pour lancer le relevé', JSON.stringify(etat));
  await effacer('sentryLiaisons/boutique');

  /* ---------------------------------------------------------------- */
  console.log('\n== La cliente : pas de bouton d équipe');
  const cl = await ouvrir();
  await connecter(cl, CLIENTE);
  await aller(cl, `#/tests?projet=${P}&onglet=bibliotheque`, '#scenarios');
  await pause(1000);
  const vueCliente = await cl.evaluate(() => ({
    bouton: document.querySelectorAll('[data-action="nouveau"][data-genre="scenario"]').length,
    h1: ((document.querySelector('.page h1') || {}).textContent || '').trim(),
  }));
  verifier(vueCliente.bouton === 0, 'la cliente n a pas « Nouveau scénario »', JSON.stringify(vueCliente));
  verifier(vueCliente.h1 === 'Campagne de tests', 'et sa page garde son titre', vueCliente.h1);

  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
