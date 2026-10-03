require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'onglet « Testeurs humains » rangé par le plan

   Ce que Nadir a demandé le 02/10/2026 : « Pour les tests humains, fais
   comme ici ! Mais uniquement Cockpit et Hub. » Le pendant de
   qa-grille-plan : dans le tableau des tests, les cartes des humains
   deviennent les sections du plan, et chaque case un scénario que fait un
   humain, humain seul (point vert) OU humain et robot (point violet). Un
   scénario fait par un robot seul n'a pas de case ici.

   La couleur vient de ce que les testeurs ont rendu dans la campagne :
   - par les scénarios de la bibliothèque que cite le champ « refs »
     (aujourd'hui, les testeurs reçoivent GH-01, TA-01…) ;
   - par l'identifiant du scénario du plan lui-même (demain, la répartition
     enverra gh-taches-f-001).
   Le pire l'emporte. Aucun résultat ne se perd : un scénario de la
   bibliothèque testé mais repris par aucun scénario humain du plan reste
   dans « Hors plan ».

   1. sans plan : la grille d'avant ;
   2. le plan versé : cartes = sections, cases humaines seulement, points
      vert et violet, statut hérité par refs ou par identifiant, le pire
      l'emporte, filtre de plateforme, fiches, Hors plan, chiffres du haut ;
   3. le client : la même grille, rien à modifier, testeurs numérotés ;
   4. l'espace testeur : une campagne d'avant (sur la bibliothèque) ne lui
      propose plus rien, ses scénarios arrivent avec la répartition du plan
      (voir qa-testeur-plan) ;
   5. le plan retiré : la grille d'avant, à l'identique ;
   6. le vrai plan ForgeMe sur l'émulateur ($PLAN_REEL_HUMAINS, sinon
      ~/ForgeMe-tests/plan-tests s'il existe) : les chiffres relevés.

   Banc : émulateurs, site local, semer-suivi, semer-campagne, semer-parcours.
     node fonctions-suivi/outils/qa-grille-humains.cjs
   Captures : $CAPTURES_GRILLE (sinon le dossier temporaire).
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin } = require('./lib/session-banc.cjs');
const { remplirFiche } = require('./lib/fiche-banc.cjs');

const PROJET = 'capmedia-1f90d';
const SITE = BANC.site;
const P = 'atelier';
const CID = 'qa-humains';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const effacer = async (c) => fetch(bdd(c), { method: 'DELETE', headers: prop });
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const S = (v) => ({ stringValue: String(v) }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const T = (d) => ({ timestampValue: d.toISOString() }); const L = (xs) => ({ arrayValue: { values: xs } });
const M = (o) => ({ mapValue: { fields: o } });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const valeurs = (v) => ((v || {}).arrayValue || {}).values || [];
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
const CAPTURES = process.env.CAPTURES_GRILLE || os.tmpdir();
const REEL = process.env.PLAN_REEL_HUMAINS || path.join(os.homedir(), 'ForgeMe-tests', 'plan-tests');

/* --------------------------------------------------------------------------
   Le semis : une bibliothèque, une campagne, des résultats connus, un plan
   -------------------------------------------------------------------------- */

const BIBLIO = [
  // ref, bloc, titre
  ['GH-01', 'taches', 'Se connecter'],
  ['GH-02', 'taches', 'Se connecter sans réseau'],
  ['GH-03', 'taches', 'Connexion vue par un robot seul'],
  ['GH-04', 'dates-importantes', 'Créer une tâche'],
  ['GH-05', 'dates-importantes', 'Tâche jamais testée'],
  ['GH-06', 'objectifs', 'Tâche en mode sombre'],
  ['GH-07', 'objectifs', 'Supprimer son compte'],
  ['GH-08', 'objectifs', 'Testé, repris par rien'],
];
const sc = (id, qui, plateformes, refs, titre) => ({
  id, titre: titre || `Scénario ${id}`, etapes: `Ouvrir l'application.\nFaire ${id}.`, attendu: `Le résultat de ${id} s'affiche.`,
  plateformes, type: 'normal', priorite: 'moyenne', refs, qui, parcours: [],
});
const SECTIONS = [
  { id: 'gh-connexion', groupe: 'demarrage', ordre: 1, titre: 'Connexion, humains', resume: 'Se connecter.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [
      sc('gh-connexion-f-001', 'les-deux', ['ios', 'android'], ['GH-01'], 'Connexion partout'),
      sc('gh-connexion-f-002', 'humain', ['ios', 'android'], ['GH-01', 'GH-02'], 'Connexion, avec et sans réseau'),
      sc('gh-connexion-f-003', 'robot', ['ios'], ['GH-03'], 'Connexion par un robot seul'),
    ],
    technique: [sc('gh-connexion-t-001', 'humain', ['web'], [], 'Connexion lente sur le site')],
    ux: [],
    securite: [sc('gh-connexion-s-001', 'les-deux', ['ios', 'android'], ['GH-07'], 'Supprimer son compte')] } },
  { id: 'gh-taches', groupe: 'fonctionnalites', ordre: 2, titre: 'Tâches, humains', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [
      sc('gh-taches-f-001', 'les-deux', ['ios', 'android', 'web'], ['GH-04'], 'Créer une tâche partout'),
      sc('gh-taches-f-002', 'humain', ['ios'], ['GH-05'], 'Une tâche que personne n\'a testée'),
    ],
    technique: [], ux: [sc('gh-taches-u-001', 'les-deux', ['ios', 'android'], ['GH-06'], 'Tâches en mode sombre')], securite: [] } },
  { id: 'gh-robots', groupe: 'transverse', ordre: 3, titre: 'Seulement des robots', resume: 'Rien pour les humains.', plateformes: ['web'], aspects: {
    fonctionnel: [sc('gh-robots-f-001', 'robot', ['web'], [], 'Charger mille tâches')], technique: [], ux: [], securite: [] } },
  /* Rangée dans le premier groupe malgré son numéro : l'ordre est celui de
     la page du plan (groupe, puis numéro). */
  { id: 'gh-compte', groupe: 'demarrage', ordre: 4, titre: 'Compte, humains', resume: 'Le compte.', plateformes: ['ios'], aspects: {
    fonctionnel: [], technique: [], ux: [], securite: [sc('gh-compte-s-001', 'humain', ['ios'], ['GH-01'], 'Se déconnecter')] } },
];
/* Ce que doit dire chaque case, toutes plateformes puis plateforme par
   plateforme ; absent : pas de case.
   - gh-connexion-f-001 : GH-01 réussi sur iOS et Android ;
   - gh-connexion-f-002 : GH-01 réussi, GH-02 un KO sur Android : le pire ;
   - gh-connexion-t-001 : rien dans la bibliothèque, un OK rendu sur
     l'identifiant du plan ;
   - gh-connexion-s-001 : GH-07, un KO sur iOS ET un sur Android : cassé
     (deux sur deux), fragile sur chaque plateforme seule (un sur un) ;
   - gh-taches-f-001 : GH-04 réussi sur iOS, un KO rendu sur l'identifiant
     du plan sur Android, rien sur le web : fragile ;
   - gh-taches-f-002 : GH-05 jamais passé : pas encore testé ;
   - gh-taches-u-001 : GH-06 réussi sur iOS, rien sur Android : en cours ;
   - gh-compte-s-001 : GH-01, réussi. */
const ATTENDU = {
  '': { 'gh-connexion-f-001': 'ok', 'gh-connexion-f-002': 'fragile', 'gh-connexion-t-001': 'ok', 'gh-connexion-s-001': 'casse', 'gh-compte-s-001': 'ok', 'gh-taches-f-001': 'fragile', 'gh-taches-f-002': 'nonteste', 'gh-taches-u-001': 'cours' },
  ios: { 'gh-connexion-f-001': 'ok', 'gh-connexion-f-002': 'ok', 'gh-connexion-s-001': 'fragile', 'gh-compte-s-001': 'ok', 'gh-taches-f-001': 'ok', 'gh-taches-f-002': 'nonteste', 'gh-taches-u-001': 'ok' },
  android: { 'gh-connexion-f-001': 'ok', 'gh-connexion-f-002': 'fragile', 'gh-connexion-s-001': 'fragile', 'gh-taches-f-001': 'fragile', 'gh-taches-u-001': 'nonteste' },
  web: { 'gh-connexion-t-001': 'ok', 'gh-taches-f-001': 'nonteste' },
};
const HORS = { '': ['GH-03', 'GH-08'], ios: ['GH-03'], android: [], web: ['GH-08'] };
const QUI = { 'gh-connexion-f-001': 'violet', 'gh-connexion-f-002': 'vert', 'gh-connexion-t-001': 'vert', 'gh-connexion-s-001': 'violet', 'gh-compte-s-001': 'vert', 'gh-taches-f-001': 'violet', 'gh-taches-f-002': 'vert', 'gh-taches-u-001': 'violet' };
const ORDRE_CARTES = ['Connexion, humains', 'Compte, humains', 'Tâches, humains', 'Seulement des robots'];
const TRANCHES = ['ok', 'fragile', 'casse', 'na'];

const importer = (args) => {
  try {
    const sortie = execFileSync(process.execPath, [path.join(__dirname, 'plan-tests-importer.mjs'), ...args], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, sortie };
  } catch (e) { return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` }; }
};

/* --------------------------------------------------------------------------
   Le navigateur
   -------------------------------------------------------------------------- */

const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=100');
    const pour = ((j && j.documents) || []).filter((d) => JSON.stringify((d.fields || {}).a || {}).includes(email));
    if (pour.length) {
      pour.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
      const v = (((pour[0].fields.variables || {}).mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
const connecter = async (page, email) => {
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('.page h1, .testeur-tete, #ft-prenom, .accueil', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};
/* La page Tests du projet, le tableau déployé, l'onglet des humains, la
   campagne choisie. */
const allerHumains = async (page, campagne = CID) => {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, `#/tests?projet=${P}`);
    if (await page.waitForSelector('[data-deplier]', { timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  if (await page.$eval('[data-deplier]', (b) => b.getAttribute('aria-expanded') !== 'true').catch(() => false)) await page.click('[data-deplier]');
  await page.waitForSelector('[data-voie="humains"]', { timeout: 10000 }).catch(() => {});
  await page.click('[data-voie="humains"]').catch(() => {});
  await page.waitForSelector('#tb-campagne', { timeout: 5000 }).catch(() => {});
  if (await page.$('#tb-campagne')) {
    await page.selectOption('#tb-campagne', campagne).catch(() => {});
  }
  await page.waitForSelector('.tb-case', { timeout: 20000 }).catch(() => {});
  await pause(1000);
};
const releve = (page) => page.evaluate(() => {
  const cartes = [...document.querySelectorAll('.tb .tb-famille')].map((f) => ({
    nom: f.getAttribute('aria-label'),
    groupe: (f.closest('.tb-groupe') || { dataset: {} }).dataset.groupe || '',
    compte: ((f.querySelector('.tb-compte') || {}).textContent || '').trim(),
    note: ((f.querySelector('.tb-famille-note') || {}).textContent || '').trim(),
    cases: [...f.querySelectorAll('.tb-case')].map((c) => ({ cle: c.dataset.case, e: c.dataset.e, qui: c.dataset.qui || '', label: c.getAttribute('aria-label') || '' })),
  }));
  const ligne = [...document.querySelectorAll('.tb-resume .tb-ligne')].find((l) => /Testeurs humains/.test(l.textContent)) || null;
  const legende = ligne ? [...ligne.querySelectorAll('.tb-legende span')].map((s) => [s.querySelector('.tb-puce').dataset.e, Number(s.querySelector('b').textContent)]) : [];
  return {
    cartes,
    groupes: [...document.querySelectorAll('.tb-groupe')].map((g) => g.dataset.groupe),
    meta: ligne ? ligne.querySelector('.tb-ligne-meta').innerText.trim() : '',
    pc: ligne ? Number(ligne.querySelector('.tb-ligne-pc').firstChild.textContent.trim()) : NaN,
    aide: ligne && ligne.querySelector('.tb-ligne-aide') ? ligne.querySelector('.tb-ligne-aide').innerText.trim() : '',
    legende,
    qui: ((document.querySelector('.tb-qui') || {}).innerText || '').trim(),
    gens: !!document.querySelector('.tb-gens .tb-personne'),
    texte: (document.querySelector('.tb-section') || document.body).innerText,
  };
});
const casesPlan = (r) => Object.fromEntries(r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').flatMap((c) => c.cases).map((c) => [c.cle.replace(/^plan:/, ''), c.e]));
const horsDe = (r) => ((r.cartes.find((c) => c.nom === 'Hors plan') || { cases: [] }).cases.map((c) => c.cle));
const fiche = async (page, cle) => {
  await page.click(`.tb-case[data-case="${cle}"]`);
  await page.waitForSelector('.voile--scenario .modale, .modale--scenario', { timeout: 8000 }).catch(() => {});
  await pause(500);
  const r = await page.evaluate(() => {
    const m = document.querySelector('.modale--scenario') || document.querySelector('.voile--scenario');
    return m ? {
      texte: m.innerText, titre: ((m.querySelector('h2, .modale-titre') || {}).textContent || '').trim(),
      qualifier: !!m.querySelector('[data-qualifier]'), modifier: !!m.querySelector('[data-modifier]'),
      preuves: m.querySelectorAll('[data-piece]').length,
    } : null;
  });
  return r || { texte: '', titre: '', qualifier: false, modifier: false, preuves: 0 };
};
const fermer = async (page) => {
  await page.click('.voile--scenario [data-fermer], .modale--scenario [data-fermer]').catch(() => {});
  await page.waitForSelector('.voile--scenario', { state: 'detached', timeout: 5000 }).catch(() => {});
  await pause(300);
};
const theme = async (page, valeur) => {
  await page.click(`[data-theme-val="${valeur}"]`).catch(() => {});
  await pause(400);
};
const plateforme = async (page, plat) => {
  await page.click(`[data-plateforme="${plat}"]`);
  await attendre(async () => (await page.evaluate(() => location.hash)).includes(plat ? `plateforme=${plat}` : '#/tests'), 20, 200);
  await pause(1300);
};

/* Les chiffres du haut, recomptés depuis la grille : vérifications faites
   sur les cases humaines du plan, légende qui fait le total, pourcentage. */
const verifierChiffres = (r, quoi) => {
  const plan = r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').flatMap((c) => c.cases);
  const faits = plan.filter((c) => TRANCHES.includes(c.e)).length;
  verifier(new RegExp(`\\b${faits} vérifications faites sur ${plan.length}\\b`).test(r.meta), `${quoi} : « ${faits} vérifications faites sur ${plan.length} », les cases humaines du plan`, r.meta);
  const somme = r.legende.reduce((t, [, n]) => t + n, 0);
  const parEtat = Object.fromEntries(r.legende);
  const compte = (e) => plan.filter((c) => c.e === e).length;
  verifier(somme === plan.length && ['ok', 'fragile', 'casse', 'cours', 'na', 'nonteste'].every((e) => (parEtat[e] || 0) === compte(e)), `${quoi} : la légende recompte les mêmes cases`, JSON.stringify(r.legende));
  verifier(r.pc === Math.round((faits / (plan.length || 1)) * 100), `${quoi} : le pourcentage suit (${Math.round((faits / (plan.length || 1)) * 100)} %)`, String(r.pc));
};

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (schema = 'light', largeur = 1440) => {
    const ctx = await nav.newContext({ viewport: { width: largeur, height: 1000 }, colorScheme: schema });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`PAGE: ${e.message}`));
    return page;
  };

  console.log('\n== Semis');
  await vider(`projets/${P}/planTests`);
  const vivier = await lire('testeurs?pageSize=200');
  for (const d of ((vivier && vivier.documents) || [])) {
    if (/humains@exemple\.test$/.test(champ(d, 'email').stringValue || '')) await appelAdmin('retirerTesteur', { testeur: d.name.split('/').pop(), definitif: true });
  }
  await vider(`projets/${P}/campagnes/${CID}/passages`); await effacer(`projets/${P}/campagnes/${CID}`);
  const inscrire = async (email, prenom, plateformes) => {
    const r = await appelAdmin('inscrireTesteur', { email, prenom, plateformes, projets: [P] });
    try { return JSON.parse(r.texte).uid || ''; } catch (e) { return ''; }
  };
  const alma = await inscrire('alma.humains@exemple.test', 'Alma', ['ios']);
  const bruno = await inscrire('bruno.humains@exemple.test', 'Bruno', ['android']);
  const celia = await inscrire('celia.humains@exemple.test', 'Celia', ['web']);
  verifier(alma && bruno && celia, 'trois testeurs inscrits (iOS, Android, web)');
  for (const [i, [ref, bloc, titre]] of BIBLIO.entries()) {
    await poser(`projets/${P}/scenarios/${ref}`, { ref: S(ref), titre: S(titre), bloc: S(bloc), niveau: S('reparti'), ordre: N(950 + i), actif: B(true), attendu: S('Ça marche.') });
    await effacer(`projets/${P}/anomalies/ko-${ref}`);
  }
  for (const s of SECTIONS) for (const x of Object.values(s.aspects).flat()) await effacer(`projets/${P}/anomalies/ko-${x.id}`);
  const affect = { [alma]: ['GH-01', 'GH-03', 'GH-04', 'GH-05', 'GH-06', 'GH-07'], [bruno]: ['GH-01', 'GH-02', 'GH-07'], [celia]: ['GH-08', 'GH-05'] };
  await poser(`projets/${P}/campagnes/${CID}`, {
    titre: S('Passe des humains'), statut: S('en-cours'), testeurs: L([S(alma), S(bruno), S(celia)]),
    scenarios: L(BIBLIO.map(([r]) => S(r))),
    affectation: M(Object.fromEntries(Object.entries(affect).map(([u, refs]) => [u, L(refs.map(S))]))),
    debut: T(new Date(Date.now() - 2 * 86400000)), fin: T(new Date(Date.now() + 10 * 86400000)), cree: T(new Date()),
  });
  const appareil = { [alma]: 'iPhone 15', [bruno]: 'Pixel 8', [celia]: 'Firefox 131' };
  const passage = async (uid, ref, resultat, plat, il = 0) => poser(`projets/${P}/campagnes/${CID}/passages/${uid}__${ref}`, {
    scenario: S(ref), testeur: S(uid), plateforme: S(plat), resultat: S(resultat), commentaire: S(resultat === 'ko' ? `Rien ne se passe sur ${ref}` : ''),
    preuves: L(resultat === 'ko' ? [S(`campagnes/${P}/${CID}/${uid}/preuve-${ref}.png`)] : []),
    contexte: M({ appareil: S(appareil[uid]) }), le: T(new Date(Date.now() - il * 60000)),
  });
  await passage(alma, 'GH-01', 'ok', 'ios', 50); await passage(bruno, 'GH-01', 'ok', 'android', 49);
  await passage(bruno, 'GH-02', 'ko', 'android', 48);
  await passage(alma, 'GH-03', 'ok', 'ios', 47);
  await passage(alma, 'GH-04', 'ok', 'ios', 46);
  await passage(alma, 'GH-06', 'ok', 'ios', 45);
  await passage(alma, 'GH-07', 'ko', 'ios', 44); await passage(bruno, 'GH-07', 'ko', 'android', 43);
  await passage(celia, 'GH-08', 'ok', 'web', 42);
  /* Demain : la répartition enverra les scénarios du plan eux-mêmes. */
  /* Depuis la garde serveur (03/10/2026), un échec ne fait une anomalie
     que sur un scénario connu : le KO sur l'identifiant du plan se pose
     donc avec la section en place, retirée aussitôt (la grille d'avant,
     juste après, se lit sans plan). */
  const avantPlan = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-grille-humains-avant-'));
  SECTIONS.forEach((x) => fs.writeFileSync(path.join(avantPlan, `${x.id}.json`), JSON.stringify(x, null, 2)));
  importer([P, avantPlan, '--vrai']);
  fs.rmSync(avantPlan, { recursive: true, force: true });
  await passage(bruno, 'gh-taches-f-001', 'ko', 'android', 41);
  await passage(celia, 'gh-connexion-t-001', 'ok', 'web', 40);
  const anos = await attendre(async () => {
    const a = await Promise.all(['ko-GH-02', 'ko-GH-07', 'ko-gh-taches-f-001'].map((x) => lire(`projets/${P}/anomalies/${x}`)));
    return a.every((x) => x && x.fields) && valeurs(champ(a[1], 'temoins')).length === 2;
  }, 60, 500);
  verifier(anos, 'les KO font naître leurs anomalies, y compris sur un identifiant du plan');
  await vider(`projets/${P}/planTests`);

  console.log('\n== Sans plan : la grille d\'avant');
  const cockpit = await ouvrir('dark');
  await connecter(cockpit, 'agent.essai@exemple.test');
  await allerHumains(cockpit);
  const avant = await releve(cockpit);
  verifier(avant.cartes.length > 0 && !avant.groupes.length && !avant.cartes.some((c) => c.nom === 'Hors plan'), 'des familles, ni groupes du plan ni « Hors plan »', avant.cartes.map((c) => c.nom).join(' | '));
  const casesAvant = avant.cartes.flatMap((c) => c.cases);
  verifier(casesAvant.length === BIBLIO.length && BIBLIO.every(([r]) => casesAvant.some((c) => c.cle === r)), 'une case par scénario de la campagne', casesAvant.map((c) => c.cle).join(','));
  verifier(!avant.aide && !avant.qui && !casesAvant.some((c) => c.qui), 'sans plan, ni phrase d\'explication, ni légende humain/robot, ni point de couleur');
  verifier(/vérifications faites sur 11\b/.test(avant.meta), 'la ligne du haut compte les passages attendus, comme avant', avant.meta);

  console.log('\n== Le plan versé : la page bascule d\'elle-même');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-grille-humains-'));
  const dossierPlan = path.join(racine, 'plan'); fs.mkdirSync(dossierPlan);
  SECTIONS.forEach((s) => fs.writeFileSync(path.join(dossierPlan, `${s.id}.json`), JSON.stringify(s, null, 2)));
  const imp = importer([P, dossierPlan, '--vrai']);
  verifier(imp.code === 0 && /4 sections versées/.test(imp.sortie), 'les quatre sections sont versées', imp.sortie.slice(-300));
  const bascule = await attendre(async () => (await cockpit.$$('.tb-groupe')).length > 0, 40, 500);
  verifier(bascule, 'sans recharger, la grille des humains se range par le plan');
  await pause(900);
  const r0 = await releve(cockpit);

  const sections = r0.cartes.filter((c) => c.groupe && c.groupe !== 'autres');
  verifier(sections.map((c) => c.nom).join(' | ') === ORDRE_CARTES.join(' | '), 'une carte par section, dans l\'ordre du plan (groupe, puis numéro)', sections.map((c) => c.nom).join(' | '));
  verifier(r0.groupes.join(',') === 'demarrage,fonctionnalites,transverse,autres', 'regroupées par les groupes du plan, puis les autres résultats', r0.groupes.join(','));
  const vus = casesPlan(r0);
  verifier(!('gh-connexion-f-003' in vus) && !('gh-robots-f-001' in vus), 'aucune case pour un scénario fait par un robot seul', Object.keys(vus).join(','));
  verifier(Object.keys(vus).sort().join(',') === Object.keys(ATTENDU['']).sort().join(','), 'une case pour chaque scénario humain seul et chaque humain et robot', Object.keys(vus).join(','));
  for (const [id, e] of Object.entries(ATTENDU[''])) verifier(vus[id] === e, `${id} : ${e}`, `vu ${vus[id]}`);
  verifier(vus['gh-connexion-f-001'] === 'ok' && vus['gh-compte-s-001'] === 'ok', 'statut hérité par refs (GH-01)');
  verifier(vus['gh-connexion-t-001'] === 'ok', 'statut rendu sur l\'identifiant du plan (gh-connexion-t-001)');
  verifier(vus['gh-connexion-f-002'] === 'fragile' && vus['gh-taches-f-001'] === 'fragile', 'le pire l\'emporte : un réussi et un échec font un fragile, par refs comme par identifiant');
  verifier(vus['gh-connexion-s-001'] === 'casse', 'deux KO, un sur iOS et un sur Android : cassé, comme la grille d\'avant');
  verifier(vus['gh-taches-u-001'] === 'cours', 'réussi sur iOS, personne sur Android : en cours, pas réussi');
  const robots = sections.find((c) => c.nom === 'Seulement des robots');
  verifier(robots && !robots.cases.length && /Aucun scénario pour les humains/.test(robots.note) && robots.compte === '0/0', 'une section sans scénario pour les humains garde sa carte, et le dit', JSON.stringify(robots));
  const quiVus = Object.fromEntries(sections.flatMap((c) => c.cases).map((c) => [c.cle.replace(/^plan:/, ''), c.qui]));
  verifier(Object.entries(QUI).every(([id, q]) => quiVus[id] === q), 'le point dit qui fait le scénario : vert humain seul, violet humain et robot', JSON.stringify(quiVus));
  verifier(sections.flatMap((c) => c.cases).every((c) => (c.qui === 'violet' ? /humain et robot/ : /humain seul/).test(c.label)), 'et l\'étiquette lue par le lecteur d\'écran aussi');
  verifier(/4\s*humain et robot/.test(r0.qui) && /4\s*humain seul/.test(r0.qui) && /robot seul n'a pas de case/.test(r0.qui), 'une légende courte, avec les deux comptes', r0.qui);
  const couleurs = await cockpit.evaluate(() => {
    const point = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, '::after').backgroundColor : ''; };
    const puce = (cls) => { const el = document.querySelector(`.tb-qui .plan-qui-${cls} i`); return el ? getComputedStyle(el).backgroundColor : ''; };
    return { violet: point('.tb-case[data-qui="violet"]'), vert: point('.tb-case[data-qui="vert"]'), legendeViolet: puce('violet'), legendeVert: puce('vert') };
  });
  verifier(couleurs.vert && couleurs.vert === couleurs.legendeVert && couleurs.violet === couleurs.legendeViolet && couleurs.vert !== couleurs.violet, 'les couleurs sont celles de la page du plan', JSON.stringify(couleurs));
  verifier(r0.gens && /Les testeurs/i.test(r0.texte), 'les cartes des testeurs de la campagne restent sous la grille');

  console.log('\n== Hors plan : aucun résultat humain ne disparaît');
  const hors = r0.cartes.find((c) => c.nom === 'Hors plan');
  verifier(hors && hors.groupe === 'autres' && horsDe(r0).sort().join(',') === HORS[''].join(','), 'la carte « Hors plan » garde GH-03 (repris seulement par un robot seul) et GH-08 (repris par rien)', horsDe(r0).join(','));
  verifier((hors || { cases: [] }).cases.every((c) => c.e === 'ok'), 'avec leur résultat, comme avant');
  verifier(/sans compter/.test((hors || {}).note || '') && /2 hors plan, montrés à part/.test(r0.meta), 'la carte et la ligne du haut disent qu\'ils ne comptent pas', `${(hors || {}).note} · ${r0.meta}`);
  verifier(r0.cartes[r0.cartes.length - 1].nom === 'Hors plan', 'en fin de grille');
  const signatureAvant = Object.fromEntries(casesAvant.map((c) => [c.cle, c.e]));
  const tous = new Set([...BIBLIO.map(([r]) => r).filter((r) => r !== 'GH-05')]);
  const repris = new Set(SECTIONS.flatMap((s) => Object.values(s.aspects).flat()).filter((x) => x.qui !== 'robot').flatMap((x) => x.refs));
  verifier([...tous].every((r) => repris.has(r) || horsDe(r0).includes(r)), 'chaque scénario testé de la bibliothèque se lit quelque part (repris, ou hors plan)');
  verifier(horsDe(r0).every((r) => (hors.cases.find((c) => c.cle === r) || {}).e === signatureAvant[r]), 'les cases hors plan ont la couleur de la grille d\'avant');

  console.log('\n== Les chiffres du haut');
  verifierChiffres(r0, 'toutes plateformes');
  verifier(/^Passe des humains · En cours · 6 vérifications faites sur 8 · 2 hors plan, montrés à part · 3 testeurs · jour 3 sur 13/.test(r0.meta), 'la campagne, les vérifications, le hors plan, les testeurs et le jour, dans cet ordre', r0.meta);
  verifier(/Chaque scénario du plan fait par un humain compte une fois/.test(r0.aide) && /plus mauvais résultat/.test(r0.aide) && /reprend/.test(r0.aide), 'une phrase dit d\'où viennent les chiffres', r0.aide);
  verifier(!/\bundefined\b|\bnull\b|NaN/.test(r0.texte) && !r0.texte.includes('—'), 'ni « undefined », ni « null », ni tiret cadratin');
  const deplier = await cockpit.$eval('[data-deplier]', (b) => b.textContent.trim()).catch(() => '');
  verifier(/Replier/.test(deplier), 'le tableau reste déplié');

  console.log('\n== Le filtre de plateforme');
  for (const plat of ['ios', 'android', 'web']) {
    await plateforme(cockpit, plat);
    const r = await releve(cockpit);
    const v = casesPlan(r);
    verifier(Object.keys(v).sort().join(',') === Object.keys(ATTENDU[plat]).sort().join(','), `${plat} : seulement les cases de cette plateforme`, Object.keys(v).join(','));
    const faux = Object.entries(ATTENDU[plat]).filter(([id, e]) => v[id] !== e);
    verifier(!faux.length, `${plat} : le résultat de cette plateforme`, faux.map(([id, e]) => `${id} attendu ${e}, vu ${v[id]}`).join(' ; '));
    verifier(horsDe(r).sort().join(',') === HORS[plat].join(','), `${plat} : le hors plan suit le filtre`, horsDe(r).join(','));
    verifier(r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').length === ORDRE_CARTES.length, `${plat} : toutes les sections gardent leur carte`);
    verifierChiffres(r, plat);
  }
  await plateforme(cockpit, '');

  console.log('\n== Les fiches');
  let f = await fiche(cockpit, 'plan:gh-taches-f-001');
  verifier(/Créer une tâche partout/.test(f.titre), 'la fiche du scénario du plan', f.titre);
  verifier(/Ouvrir l'application/.test(f.texte) && /Le résultat de gh-taches-f-001 s'affiche/.test(f.texte), 'avec ses étapes et ce qui doit se passer');
  verifier(/Humain et robot/.test(f.texte) && /iOS, Android, Web/.test(f.texte), 'qui le fait, et ses plateformes');
  verifier(/Alma · iOS · iPhone 15/.test(f.texte) && /Bruno · Android · Pixel 8/.test(f.texte), 'chaque résultat : le testeur nommé, la plateforme, l\'appareil', f.texte.slice(0, 900));
  verifier(/Hérité de GH-04/.test(f.texte) && (f.texte.match(/Hérité de/g) || []).length === 1, '« Hérité de GH-04 » pour le résultat de la bibliothèque, rien pour celui rendu sur le plan');
  verifier(/Rien ne se passe sur gh-taches-f-001/.test(f.texte) && f.preuves === 1, 'la remarque et la preuve du KO');
  verifier(/\d{1,2} \S+ à \d{2}:\d{2}/.test(f.texte), 'la date du passage', f.texte.slice(0, 600));
  verifier(/Fragile\./.test(f.texte) && /Pas encore testé sur Web/.test(f.texte), 'pourquoi cette couleur, et la plateforme qui attend', f.texte.slice(0, 300));
  verifier(/Par plateforme/i.test(f.texte) && /Android[\s\S]{0,60}gh-taches-f-001/.test(f.texte), 'plateforme par plateforme, d\'où vient chaque résultat');
  verifier(/Anomalies/i.test(f.texte) && f.qualifier, 'l\'anomalie née du KO, que l\'équipe peut qualifier');
  verifier(!/\bundefined\b|\bnull\b|NaN/.test(f.texte) && !f.texte.includes('—'), 'la fiche : ni « undefined », ni « null », ni tiret cadratin');
  await theme(cockpit, 'dark');
  await cockpit.screenshot({ path: path.join(CAPTURES, 'grille-humains-fiche-cockpit-sombre.png') });
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gh-taches-f-002');
  verifier(/Une tâche que personne/.test(f.titre) && /Pas encore testé par un humain/.test(f.texte) && /Humain seul/.test(f.texte), 'sans résultat : « Pas encore testé par un humain »', f.texte.slice(0, 300));
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gh-connexion-s-001');
  verifier(/Cassé\./.test(f.texte) && /GH-07/.test(f.texte) && (f.texte.match(/Hérité de GH-07/g) || []).length === 2 && f.preuves === 2, 'cassé : les deux KO, hérités de GH-07, chacun avec sa preuve', f.texte.slice(0, 400));
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gh-connexion-t-001');
  verifier(/Celia · Web · Firefox 131/.test(f.texte) && !/Hérité de/.test(f.texte), 'rendu sur l\'identifiant du plan : pas de « Hérité de »', f.texte.slice(0, 400));
  await fermer(cockpit);
  f = await fiche(cockpit, 'GH-08');
  verifier(/Testé, repris par rien/.test(f.titre) && /Celia/.test(f.texte), 'une case hors plan : la fiche d\'avant', f.titre);
  await fermer(cockpit);
  await cockpit.screenshot({ path: path.join(CAPTURES, 'grille-humains-cockpit-sombre.png'), fullPage: true });
  verifier(fs.existsSync(path.join(CAPTURES, 'grille-humains-cockpit-sombre.png')), `capture du Cockpit en sombre : ${path.join(CAPTURES, 'grille-humains-cockpit-sombre.png')}`);

  console.log('\n== Un résultat arrive : la case suit en direct');
  await passage(bruno, 'GH-06', 'ok', 'android', 1);
  const suivi = await attendre(async () => (await cockpit.$eval('.tb-case[data-case="plan:gh-taches-u-001"]', (b) => b.dataset.e).catch(() => '')) === 'ok', 30, 500);
  verifier(suivi, 'GH-06 réussi sur Android : gh-taches-u-001 passe au vert, sans recharger');
  await effacer(`projets/${P}/campagnes/${CID}/passages/${bruno}__GH-06`);
  await attendre(async () => (await cockpit.$eval('.tb-case[data-case="plan:gh-taches-u-001"]', (b) => b.dataset.e).catch(() => '')) === 'cours', 30, 500);

  console.log('\n== Le robot : son onglet ne change pas');
  await cockpit.click('[data-voie="machine"]'); await pause(1200);
  const machine = await cockpit.evaluate(() => [...document.querySelectorAll('.tb-case[data-qui]')].map((c) => c.dataset.qui));
  verifier(machine.length && machine.every((q) => q === 'bleu' || q === 'violet'), 'chez les robots, toujours des points bleus et violets, jamais de vert', machine.join(','));
  await cockpit.click('[data-voie="humains"]'); await pause(1000);

  console.log('\n== Le client : la même grille, rien à modifier');
  const client = await ouvrir('light');
  await connecter(client, 'camille.essai@exemple.test');
  await allerHumains(client);
  const rc = await releve(client);
  verifier(rc.cartes.filter((c) => c.groupe && c.groupe !== 'autres').map((c) => c.nom).join(' | ') === ORDRE_CARTES.join(' | '), 'les mêmes cartes, dans le même ordre', rc.cartes.map((c) => c.nom).join(' | '));
  verifier(JSON.stringify(casesPlan(rc)) === JSON.stringify(casesPlan(r0)), 'les mêmes cases, les mêmes couleurs', JSON.stringify(casesPlan(rc)));
  verifier(rc.meta.replace(/ · jour.*$/, '').replace(/ · \d+ testeurs?/, '') === r0.meta.replace(/ · jour.*$/, '').replace(/ · \d+ testeurs?/, '') && rc.pc === r0.pc, 'les mêmes chiffres en haut', `${rc.meta} / ${r0.meta}`);
  verifier(horsDe(rc).sort().join(',') === HORS[''].join(','), 'et le même « Hors plan »');
  verifier(!rc.gens && !/Alma|Bruno|Celia/.test(rc.texte), 'ni cartes des testeurs, ni prénoms chez le client');
  f = await fiche(client, 'plan:gh-taches-f-001');
  verifier(/Créer une tâche partout/.test(f.titre) && /Testeur \d/.test(f.texte) && !/Alma|Bruno/.test(f.texte), 'la fiche : les testeurs numérotés, comme dans la grille d\'avant', f.texte.slice(0, 500));
  verifier(!f.qualifier && !f.modifier, 'sans rien à modifier ni qualifier');
  verifier(/Hérité de GH-04/.test(f.texte), 'et d\'où vient chaque résultat');
  await fermer(client);
  await theme(client, 'light');
  await client.screenshot({ path: path.join(CAPTURES, 'grille-humains-client-clair.png'), fullPage: true });
  verifier(fs.existsSync(path.join(CAPTURES, 'grille-humains-client-clair.png')), `capture du client en clair : ${path.join(CAPTURES, 'grille-humains-client-clair.png')}`);

  console.log('\n== L\'espace testeur : la bibliothèque n\'est plus proposée');
  const testeur = await ouvrir('light', 390);
  await connecter(testeur, 'celia.humains@exemple.test');
  await remplirFiche(testeur, { prenom: 'Celia', modele: 'PC du banc' });
  await testeur.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await testeur.$('.accueil')) { await testeur.click('.accueil [data-accueil="passer"]'); await testeur.waitForSelector('.accueil', { state: 'detached' }).catch(() => {}); }
  await testeur.waitForSelector('.tb-case, .vide-titre', { timeout: 30000 }).catch(() => {});
  await pause(800);
  const t = await testeur.evaluate(() => ({
    cases: Object.fromEntries([...document.querySelectorAll('.tb-case')].map((c) => [c.dataset.case, c.dataset.e])),
    groupes: document.querySelectorAll('.tb-groupe').length, points: document.querySelectorAll('.tb-case[data-qui]').length,
    texte: document.body.innerText,
  }));
  verifier(/\/suivi\/testeur/.test(testeur.url()), 'Celia arrive dans son espace', testeur.url());
  verifier(!Object.keys(t.cases).length && /Vos scénarios arrivent/.test(t.texte), 'une campagne sur la bibliothèque ne lui propose plus rien : ses scénarios arrivent', Object.keys(t.cases).join(','));
  verifier(!t.groupes && !t.points && !/Hors plan|humain seul|humain et robot/.test(t.texte), 'ni sections du plan, ni points, ni « Hors plan »');
  verifier(!/Alma|Bruno/.test(t.texte), 'et jamais les autres testeurs');

  console.log('\n== Le plan retiré : la grille d\'avant revient');
  await vider(`projets/${P}/planTests`);
  const retour = await attendre(async () => (await cockpit.$$('.tb-groupe')).length === 0, 40, 500);
  verifier(retour, 'sans recharger, les groupes du plan disparaissent');
  await pause(1000);
  const apres = await releve(cockpit);
  const signature = (r) => r.cartes.map((c) => `${c.nom}:${c.cases.map((x) => `${x.cle}=${x.e}`).join(',')}`).join('\n');
  verifier(signature(apres) === signature(avant), 'mêmes familles, mêmes cases, mêmes couleurs qu\'avant le plan', signature(apres).slice(0, 300));
  verifier(apres.meta.replace(/ · jour.*$/, '') === avant.meta.replace(/ · jour.*$/, '') && apres.pc === avant.pc && !apres.aide && !apres.qui, 'les mêmes chiffres, et plus rien du plan', `${apres.meta} / ${avant.meta}`);

  /* Ce qu'on laisse : rien de ce petit plan. */
  await vider(`projets/${P}/campagnes/${CID}/passages`); await effacer(`projets/${P}/campagnes/${CID}`);
  for (const [ref] of BIBLIO) { await effacer(`projets/${P}/scenarios/${ref}`); await effacer(`projets/${P}/anomalies/ko-${ref}`); }
  for (const s of SECTIONS) for (const x of Object.values(s.aspects).flat()) await effacer(`projets/${P}/anomalies/ko-${x.id}`);
  fs.rmSync(racine, { recursive: true, force: true });

  /* Le vrai plan, lu dans ~/ForgeMe-tests (lecture seule) : versé sur
     l'émulateur avec les parcours du catalogue, puis des résultats humains
     semés sur la campagne du banc (c-oct, la bibliothèque du plan de tests
     de l'outil). Rien n'est écrit ailleurs que sur l'émulateur. */
  if (fs.existsSync(path.join(REEL, 'sections'))) {
    console.log('\n== Le vrai plan, sur l\'émulateur');
    try { execFileSync(process.execPath, [path.join(__dirname, 'semer-parcours-2.mjs'), P, '--vrai'], { env: process.env, stdio: 'ignore' }); } catch (e) { /* le bilan le dira */ }
    const impR = importer([P, path.join(REEL, 'sections'), '--vrai']);
    verifier(impR.code === 0 && /46 sections versées/.test(impR.sortie), 'les 46 sections sont versées', impR.sortie.slice(-400));
    const fichiers = fs.readdirSync(path.join(REEL, 'sections')).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(fs.readFileSync(path.join(REEL, 'sections', x), 'utf8')));
    const humainsDuPlan = fichiers.flatMap((x) => Object.values(x.aspects).flat()).filter((x) => x.qui === 'humain' || x.qui === 'les-deux');
    const reprisReel = new Set(humainsDuPlan.flatMap((x) => [...(x.refs || []), x.id]));

    /* Des résultats humains : chaque testeur de c-oct rend ses scénarios,
       un KO tous les neuf, un sans objet tous les treize. */
    /* Ce qui est éprouvé ici, c'est l'héritage d'une campagne d'avant le
       plan (des résultats rendus sur la bibliothèque, lus par les refs).
       Depuis le 03/10/2026, le semis met c-oct sur le plan du banc : on la
       repasse à l'ancienne, références de la bibliothèque réparties entre
       ses testeurs, le temps de cette partie. */
    const biblioRefs = ((((await lire(`projets/${P}/scenarios?pageSize=400`)) || {}).documents) || []).map((d) => d.name.split('/').pop()).filter((r) => !/^GH-/.test(r));
    const campAvant = await lire(`projets/${P}/campagnes/c-oct`);
    const ids = valeurs(champ(campAvant, 'testeurs')).map((v) => v.stringValue);
    const ancienne = Object.fromEntries(ids.map((u) => [u, []]));
    biblioRefs.forEach((r, i) => ancienne[ids[i % ids.length]].push(r));
    await fetch(`${bdd(`projets/${P}/campagnes/c-oct`)}?updateMask.fieldPaths=affectation&updateMask.fieldPaths=scenarios&updateMask.fieldPaths=plan`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { plan: B(false), scenarios: L(biblioRefs.map(S)), affectation: M(Object.fromEntries(Object.entries(ancienne).map(([u, r]) => [u, L(r.map(S))]))) } }) });
    const camp = await lire(`projets/${P}/campagnes/c-oct`);
    const aff = (champ(camp, 'affectation').mapValue || {}).fields || {};
    const gens = (((await lire('testeurs?pageSize=100')) || {}).documents || []);
    const mobile = Object.fromEntries(gens.map((d) => [d.name.split('/').pop(), champ(d, 'mobile').stringValue || 'ios']));
    let n = 0; const rendus = new Set();
    for (const [uid, refs] of Object.entries(aff)) {
      for (const v of valeurs(refs)) {
        const ref = v.stringValue; n += 1;
        const resultat = n % 9 === 0 ? 'ko' : n % 13 === 0 ? 'na' : 'ok';
        await poser(`projets/${P}/campagnes/c-oct/passages/${uid}__${ref}`, {
          scenario: S(ref), testeur: S(uid), plateforme: S(mobile[uid] || 'ios'), resultat: S(resultat), commentaire: S(resultat === 'ko' ? 'Échec du banc' : ''),
          preuves: L([]), contexte: M({ appareil: S(mobile[uid] === 'android' ? 'Pixel 8' : 'iPhone 15') }), le: T(new Date(Date.now() - n * 60000)),
        });
        rendus.add(ref);
      }
    }
    verifier(n > 0, `${n} résultats humains semés sur c-oct`);
    await pause(4000);
    const vueC = await ouvrir('dark');
    await connecter(vueC, 'agent.essai@exemple.test');
    await allerHumains(vueC, 'c-oct');
    await attendre(async () => (await vueC.$$('.tb-groupe')).length > 0, 40, 500);
    await pause(2500);
    const rr = await releve(vueC);
    const cartes = rr.cartes.filter((c) => c.groupe && c.groupe !== 'autres');
    verifier(cartes.length === 46, 'les 46 sections font les 46 cartes', String(cartes.length));
    const casesR = cartes.flatMap((c) => c.cases);
    verifier(casesR.length === humainsDuPlan.length && humainsDuPlan.length === 947, `une case par scénario humain seul ou humain et robot (${humainsDuPlan.length})`, String(casesR.length));
    const vert = casesR.filter((c) => c.qui === 'vert').length; const violet = casesR.filter((c) => c.qui === 'violet').length;
    verifier(vert === humainsDuPlan.filter((x) => x.qui === 'humain').length && violet === humainsDuPlan.filter((x) => x.qui === 'les-deux').length, `${vert} points verts, ${violet} violets`);
    const horsR = horsDe(rr).sort();
    const horsAttendu = [...rendus].filter((r) => !reprisReel.has(r)).sort();
    verifier(horsR.join(',') === horsAttendu.join(','), `« Hors plan » : les ${horsAttendu.length} scénarios testés que ne reprend aucun scénario humain`, `${horsR.length} vus`);
    verifierChiffres(rr, 'vrai plan');
    const allumees = casesR.filter((c) => c.e !== 'nonteste').length;
    console.log(`  info   ${rr.meta}`);
    console.log(`  info   légende : ${rr.legende.map(([e, k]) => `${e} ${k}`).join(', ')}`);
    console.log(`  info   cases : ${casesR.length} (${vert} humain seul, ${violet} humain et robot), ${allumees} avec au moins un résultat, ${casesR.length - allumees} pas encore testées`);
    console.log(`  info   références des scénarios humains du plan : ${new Set(humainsDuPlan.flatMap((x) => x.refs || [])).size}, scénarios humains qui en citent au moins une : ${humainsDuPlan.filter((x) => (x.refs || []).length).length}`);
    console.log(`  info   scénarios de la bibliothèque rendus sur c-oct : ${rendus.size}, hors plan : ${horsR.length}`);
    await theme(vueC, 'dark');
    await vueC.screenshot({ path: path.join(CAPTURES, 'grille-humains-reelle-cockpit-sombre.png'), fullPage: true });
    const vueH = await ouvrir('light');
    await connecter(vueH, 'camille.essai@exemple.test');
    await allerHumains(vueH, 'c-oct');
    await attendre(async () => (await vueH.$$('.tb-groupe')).length > 0, 40, 500);
    await pause(2500);
    const rh = await releve(vueH);
    verifier(JSON.stringify(casesPlan(rh)) === JSON.stringify(casesPlan(rr)), 'le client voit la même grille réelle');
    await theme(vueH, 'light');
    await vueH.screenshot({ path: path.join(CAPTURES, 'grille-humains-reelle-client-clair.png'), fullPage: true });
    console.log(`  info   captures : ${path.join(CAPTURES, 'grille-humains-reelle-cockpit-sombre.png')}, ${path.join(CAPTURES, 'grille-humains-reelle-client-clair.png')}`);
    await vider(`projets/${P}/planTests`); await vider(`projets/${P}/campagnes/c-oct/passages`);
  }
  await nav.close();

  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  if (erreurs.length) console.log('  ÉCART  erreurs JavaScript dans la page');
  process.exit(ecarts.length || erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
