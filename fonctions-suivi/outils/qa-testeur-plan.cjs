require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'espace testeur et la grille humaine sur le plan

   Le modèle du 03/10/2026 : un testeur ne reçoit plus la bibliothèque, il
   reçoit des clés « scénario du plan, plateforme » dans son affectation
   (affectation.{uid}.cles), et un passage porte l'identifiant
   `${uid}__${scénario}__${plateforme}`.

   1. le testeur : ses clés et rien d'autre, rangées par section dans
      l'ordre du plan (le téléphone avant le web), chaque clé avec SON
      résultat (un échec sur le web ne peint pas l'iPhone) ; le téléphone
      ne lit que les sections de ses clés ;
   2. un testeur de la campagne sans affectation : « Vos scénarios
      arrivent », jamais toute la campagne ;
   3. le Cockpit : la case suit les passages rendus sur l'identifiant du
      plan, plateforme par plateforme, contre le nombre attendu de
      l'affectation ; « non affecté » quand personne n'a reçu une
      plateforme ; l'avancement en passages ; la carte de chaque testeur
      compte ses clés ; la fiche dit qui est encore attendu ;
   4. le client : la même grille, sans « non affecté » ni prénoms ; la
      page du projet prend ses chiffres dans le plan, plus dans la
      bibliothèque.

   Banc : émulateurs, site local, semer-suivi, semer-campagne.
     node fonctions-suivi/outils/qa-testeur-plan.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');

const PROJET = 'capmedia-1f90d';
const SITE = BANC.site;
const P = 'atelier';
const CID = 'qa-plan';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const effacer = async (c) => fetch(bdd(c), { method: 'DELETE', headers: prop });
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: v }); const N = (v) => ({ integerValue: String(v) });
const T = (d) => ({ timestampValue: d.toISOString() }); const L = (xs) => ({ arrayValue: { values: xs } });
const M = (o) => ({ mapValue: { fields: o } });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };

/* --------------------------------------------------------------------------
   Le plan : quatre sections, dont deux que Karim n'a pas à lire
   -------------------------------------------------------------------------- */
const sc = (id, qui, plateformes, titre) => ({
  id, titre, etapes: `Ouvrir l'application.\nFaire ${id}.`, attendu: `Le résultat de ${id} s'affiche.`,
  plateformes, type: 'normal', priorite: 'haute', refs: [], qui, parcours: [],
});
const vides = { fonctionnel: [], technique: [], ux: [], securite: [] };
const SECTIONS = [
  { id: 'tp-taches', groupe: 'fonctionnalites', ordre: 1, titre: 'Tâches, plan', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: { ...vides,
    fonctionnel: [sc('tp-taches-f-001', 'les-deux', ['ios', 'android', 'web'], 'Créer une tâche')],
    ux: [sc('tp-taches-u-001', 'humain', ['android'], 'Tâches en sombre')] } },
  { id: 'tp-compte', groupe: 'demarrage', ordre: 2, titre: 'Compte, plan', resume: 'Le compte.', plateformes: ['ios', 'android', 'web'], aspects: { ...vides,
    fonctionnel: [sc('tp-compte-f-001', 'humain', ['ios', 'web'], 'Se connecter'), sc('tp-compte-f-002', 'robot', ['ios'], 'Connexion par un robot')],
    securite: [sc('tp-compte-s-001', 'les-deux', ['ios', 'android'], 'Supprimer son compte')] } },
  { id: 'tp-courses', groupe: 'fonctionnalites', ordre: 3, titre: 'Courses, plan', resume: 'Les courses.', plateformes: ['ios'], aspects: { ...vides,
    fonctionnel: [sc('tp-courses-f-001', 'humain', ['ios'], 'Ajouter un article')] } },
  { id: 'tp-rien', groupe: 'transverse', ordre: 4, titre: 'Personne, plan', resume: 'Confié à personne.', plateformes: ['web'], aspects: { ...vides,
    fonctionnel: [sc('tp-rien-f-001', 'humain', ['web'], 'Un scénario que personne n\'a reçu')] } },
];
const importer = (args) => {
  try { return { code: 0, sortie: execFileSync(process.execPath, [path.join(__dirname, 'plan-tests-importer.mjs'), ...args], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` }; }
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
  await page.waitForSelector('.page h1, .testeur-tete, .accueil, .vide-titre', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};
const passerAccueil = async (page) => {
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete, .vide-titre', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]').catch(() => {}); await page.waitForSelector('.accueil', { state: 'detached' }).catch(() => {}); }
};
const allerHumains = async (page) => {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, `#/tests?projet=${P}`);
    if (await page.waitForSelector('[data-deplier]', { timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  if (await page.$eval('[data-deplier]', (b) => b.getAttribute('aria-expanded') !== 'true').catch(() => false)) await page.click('[data-deplier]');
  await page.click('[data-voie="humains"]').catch(() => {});
  if (await page.waitForSelector('#tb-campagne', { timeout: 4000 }).then(() => true).catch(() => false)) await page.selectOption('#tb-campagne', CID).catch(() => {});
  await page.waitForSelector('.tb-groupe .tb-case', { timeout: 20000 }).catch(() => {});
  await pause(1000);
};
const plateforme = async (page, plat) => {
  await page.click(`[data-plateforme="${plat}"]`);
  await attendre(async () => (await page.evaluate(() => location.hash)).includes(plat ? `plateforme=${plat}` : '#/tests'), 20, 200);
  await pause(1300);
};
const cases = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tb-groupe .tb-case')]
  .map((c) => [String(c.dataset.case || '').replace(/^plan:/, ''), c.dataset.e])));
const meta = (page) => page.evaluate(() => {
  const l = [...document.querySelectorAll('.tb-resume .tb-ligne')].find((x) => /Testeurs humains/.test(x.textContent));
  return l ? l.querySelector('.tb-ligne-meta').innerText.trim() : '';
});
const fiche = async (page, cle) => {
  await page.click(`.tb-case[data-case="${cle}"]`);
  await page.waitForSelector('.voile--scenario .modale, .modale--scenario', { timeout: 8000 }).catch(() => {});
  await pause(400);
  const t = await page.evaluate(() => { const m = document.querySelector('.modale--scenario') || document.querySelector('.voile--scenario'); return m ? m.innerText : ''; });
  await page.click('.voile--scenario [data-fermer], .modale--scenario [data-fermer]').catch(() => {});
  await page.waitForSelector('.voile--scenario', { state: 'detached', timeout: 5000 }).catch(() => {});
  return t;
};

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (largeur = 1440) => {
    const ctx = await nav.newContext({ viewport: { width: largeur, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`PAGE: ${e.message}`));
    return page;
  };

  console.log('\n== Semis');
  await vider(`projets/${P}/planTests`);
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-testeur-plan-'));
  SECTIONS.forEach((s) => fs.writeFileSync(path.join(racine, `${s.id}.json`), JSON.stringify(s, null, 2)));
  const imp = importer([P, racine, '--vrai']);
  verifier(imp.code === 0 && /4 sections versées/.test(imp.sortie), 'le plan de quatre sections est versé', imp.sortie.slice(-300));
  fs.rmSync(racine, { recursive: true, force: true });

  const gens = ((await lire('testeurs?pageSize=100')) || {}).documents || [];
  const uid = (email) => { const d = gens.find((x) => champ(x, 'email').stringValue === email); return d ? d.name.split('/').pop() : ''; };
  const karim = uid('karim.testeur@essai.test'); const sonia = uid('sonia.testeur@essai.test');
  const marc = uid('marc.testeur@essai.test'); const hugo = uid('hugo.testeur@essai.test');
  verifier(karim && sonia && marc && hugo, 'les testeurs du banc sont là');
  /* Une seule campagne en cours : celle du plan. */
  await vider(`projets/${P}/campagnes/c-oct/passages`); await effacer(`projets/${P}/campagnes/c-oct`);
  await vider(`projets/${P}/campagnes/${CID}/passages`);
  const aff = (telephone, web, cles, vague) => M({ telephone: S(telephone), web: B(web), cles: L(cles.map(S)), vague: N(vague) });
  const CLES_KARIM = ['tp-taches-f-001__web', 'tp-taches-f-001__ios', 'tp-compte-f-001__ios', 'tp-compte-f-001__web', 'tp-compte-s-001__ios'];
  await poser(`projets/${P}/campagnes/${CID}`, {
    titre: S('Campagne sur le plan'), statut: S('en-cours'), plan: B(true),
    testeurs: L([karim, sonia, marc, hugo].map(S)),
    affectation: M({
      [karim]: aff('ios', true, CLES_KARIM, 1),
      [sonia]: aff('android', true, ['tp-taches-f-001__android', 'tp-taches-u-001__android', 'tp-compte-s-001__android', 'tp-compte-f-001__web'], 1),
      [marc]: aff('ios', false, ['tp-compte-f-001__ios', 'tp-courses-f-001__ios', 'tp-courses-f-001__ios'], 2),
    }),
    debut: T(new Date(Date.now() - 86400000)), fin: T(new Date(Date.now() + 10 * 86400000)), cree: T(new Date()),
  });
  const passage = (qui, id, plat, resultat, il) => poser(`projets/${P}/campagnes/${CID}/passages/${qui}__${id}__${plat}`, {
    scenario: S(id), testeur: S(qui), plateforme: S(plat), resultat: S(resultat), commentaire: S(resultat === 'echec' ? `Rien ne se passe sur ${id}` : ''),
    preuves: L(resultat === 'echec' ? [S(`campagnes/${P}/${CID}/${qui}/preuve.png`)] : []), contexte: M({}), le: T(new Date(Date.now() - il * 60000)),
  });
  await passage(karim, 'tp-compte-f-001', 'ios', 'reussi', 30);
  await passage(karim, 'tp-compte-f-001', 'web', 'echec', 29);
  await passage(marc, 'tp-compte-f-001', 'ios', 'ok', 28);
  await passage(sonia, 'tp-taches-f-001', 'android', 'reussi', 27);
  await pause(1500);

  console.log('\n== Le testeur : ses clés, rangées par section');
  const t = await ouvrir(390);
  const lectures = new Set();
  t.on('request', (r) => {
    if (!/Firestore\/(Listen|Write)|documents/.test(r.url())) return;
    let corps = ''; try { corps = decodeURIComponent((r.postData() || '').replace(/\+/g, ' ')); } catch (e) { corps = r.postData() || ''; }
    for (const m of `${r.url()} ${corps}`.matchAll(/planTests\/([A-Za-z0-9_-]+)/g)) lectures.add(m[1]);
    /* Une requête sur toute la collection du plan : tout le plan descend. */
    if (/"collectionId"\s*:\s*"planTests"/.test(corps)) lectures.add('*collection*');
  });
  await connecter(t, 'karim.testeur@essai.test');
  await passerAccueil(t);
  await t.waitForSelector('.tb--testeur .tb-case', { timeout: 30000 }).catch(() => {});
  await pause(1000);
  const vu = await t.evaluate(() => ({
    familles: [...document.querySelectorAll('.tb--testeur .tb-famille')].map((f) => ({ nom: f.getAttribute('aria-label'), cases: [...f.querySelectorAll('.tb-case')].map((c) => [c.dataset.case, c.dataset.e]) })),
    texte: document.body.innerText,
  }));
  const toutes = vu.familles.flatMap((f) => f.cases.map(([c]) => c));
  verifier(toutes.slice().sort().join(',') === CLES_KARIM.slice().sort().join(','), 'Karim voit ses cinq clés, et aucune autre', toutes.join(','));
  verifier(vu.familles.map((f) => f.nom).join(' | ') === 'Compte, plan | Tâches, plan', 'rangées par section, dans l\'ordre du plan (Démarrage avant Fonctionnalités)', vu.familles.map((f) => f.nom).join(' | '));
  verifier(vu.familles[0] && vu.familles[0].cases.map(([c]) => c).join(',') === 'tp-compte-f-001__ios,tp-compte-s-001__ios,tp-compte-f-001__web', 'dans une section : le téléphone d\'abord, le web ensuite, puis l\'ordre du plan', vu.familles[0] && vu.familles[0].cases.map(([c]) => c).join(','));
  const etat = Object.fromEntries(vu.familles.flatMap((f) => f.cases));
  verifier(etat['tp-compte-f-001__ios'] === 'ok' && etat['tp-compte-f-001__web'] === 'ko', 'chaque clé a son résultat : réussi sur iPhone, échec sur le web', JSON.stringify(etat));
  verifier(etat['tp-taches-f-001__ios'] === 'vide' && etat['tp-taches-f-001__web'] === 'vide', 'et ce qu\'il n\'a pas rendu reste à faire', JSON.stringify(etat));
  verifier(/2 sur 5/.test(vu.texte), 'son avancement compte ses clés : 2 sur 5', (vu.texte.match(/\d+ sur \d+[^\n]*/) || [''])[0]);
  verifier(lectures.has('tp-compte') && lectures.has('tp-taches'), 'le téléphone lit les sections de ses clés', [...lectures].join(','));
  verifier(!lectures.has('tp-courses') && !lectures.has('tp-rien') && !lectures.has('*collection*'), 'et jamais les autres, ni tout le plan d\'un coup', [...lectures].join(','));
  /* Poser un résultat depuis la feuille : le passage s'écrit au modèle
     commun (identifiant par clé, résultat en toutes lettres, heures du
     serveur), et les règles l'acceptent. */
  await t.click('.tb-case[data-case="tp-compte-s-001__ios"]').catch(() => {});
  await t.waitForSelector('[data-feuille-poser="ok"]', { timeout: 8000 }).catch(() => {});
  await t.click('[data-feuille-poser="ok"]').catch(() => {});
  const ecrit = await attendre(async () => { const d = await lire(`projets/${P}/campagnes/${CID}/passages/${karim}__tp-compte-s-001__ios`); return d && d.fields ? d : null; }, 30, 500);
  const fx = (ecrit || {}).fields || {};
  verifier(ecrit && (fx.resultat || {}).stringValue === 'reussi' && (fx.scenario || {}).stringValue === 'tp-compte-s-001' && (fx.plateforme || {}).stringValue === 'ios',
    'Réussi depuis la feuille : le passage <uid>__tp-compte-s-001__ios, résultat « reussi »', JSON.stringify(fx).slice(0, 300));
  verifier(ecrit && fx.cree && fx.maj && !fx.le, 'avec cree et maj, sans l\'ancien « le »', Object.keys(fx).join(','));
  const apres = await attendre(async () => (await t.$eval('.tb-case[data-case="tp-compte-s-001__ios"]', (x) => x.dataset.e).catch(() => '')) === 'ok', 20, 500);
  verifier(apres, 'et la case passe au vert chez lui');
  await t.click('[data-vue="liste"]').catch(() => {}); await pause(600);
  const liste = await t.evaluate(() => ({ titres: [...document.querySelectorAll('.bloc-tete')].map((h) => h.firstChild.textContent.trim()), filtre: ((document.querySelector('#f-bloc option') || {}).textContent || '').trim() }));
  verifier(liste.filtre === 'Toutes les sections', 'la vue Liste parle de sections', liste.filtre);
  await t.click('#f-reste').catch(() => {}); await pause(500);
  const liste2 = await t.evaluate(() => [...document.querySelectorAll('.bloc-tete')].map((h) => h.firstChild.textContent.trim()));
  verifier(liste2.join(' | ') === 'Compte, plan | Tâches, plan', 'ses titres de sections, ceux du plan', liste2.join(' | '));
  await t.click('[data-vue="grille"]').catch(() => {});

  console.log('\n== Un testeur sans affectation');
  const h = await ouvrir(390);
  await connecter(h, 'hugo.testeur@essai.test');
  await passerAccueil(h);
  await h.waitForSelector('.vide-titre', { timeout: 20000 }).catch(() => {});
  const hTexte = await h.evaluate(() => document.body.innerText);
  verifier(/Vos scénarios arrivent/.test(hTexte), 'Hugo lit « Vos scénarios arrivent »', hTexte.slice(0, 300));
  verifier(!(await h.$('.tb-case')), 'et ne reçoit pas toute la campagne');

  console.log('\n== Le Cockpit');
  const c = await ouvrir();
  await connecter(c, 'agent.essai@exemple.test');
  await allerHumains(c);
  let v = await cases(c);
  const attendu = { 'tp-compte-f-001': 'fragile', 'tp-compte-s-001': 'cours', 'tp-taches-f-001': 'cours', 'tp-taches-u-001': 'nonteste', 'tp-courses-f-001': 'nonteste', 'tp-rien-f-001': 'trou' };
  const faux = Object.entries(attendu).filter(([k, e]) => v[k] !== e);
  verifier(!faux.length && !('tp-compte-f-002' in v), 'les cases suivent les passages du plan : fragile, en cours, pas encore testé, non affecté ; pas de case robot', JSON.stringify(v));
  const m = await meta(c);
  verifier(/\b5 passages faits sur 11\b/.test(m), 'l\'avancement en passages : 5 faits sur les 11 de l\'affectation (dont celui posé par Karim)', m);
  await plateforme(c, 'ios'); v = await cases(c);
  verifier(v['tp-taches-f-001'] === 'nonteste' && v['tp-compte-f-001'] === 'ok', 'sur iPhone : le réussi d\'Android ne colore pas la case ; deux réussis sur deux', JSON.stringify(v));
  await plateforme(c, 'android'); v = await cases(c);
  verifier(v['tp-taches-f-001'] === 'ok', 'sur Android : réussi', JSON.stringify(v));
  await plateforme(c, 'web'); v = await cases(c);
  verifier(v['tp-compte-f-001'] === 'fragile' && v['tp-taches-f-001'] === 'nonteste' && v['tp-rien-f-001'] === 'trou', 'sur le web : l\'échec de Karim, et le scénario que personne n\'a reçu', JSON.stringify(v));
  await plateforme(c, '');
  const carte = await c.evaluate(() => [...document.querySelectorAll('.tb-gens .tb-personne')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  verifier(carte.some((x) => /Karim/.test(x) && /3\/5 faits/.test(x) && /1 en échec/.test(x)), 'la carte de Karim compte ses clés : 3/5 faits, 1 en échec', carte.join(' | '));
  verifier(carte.some((x) => /Marc/.test(x) && /1\/2 faits/.test(x)), 'une clé en double ne compte qu\'une fois : Marc, 1/2', carte.join(' | '));
  let f = await fiche(c, 'plan:tp-compte-f-001');
  verifier(/Sonia[^\n]*· Web[\s\S]{0,40}attendu/i.test(f), 'la fiche dit qui est encore attendu, et sur quoi', f.slice(0, 800));
  verifier(!/Hérité|Reprend les résultats/.test(f), 'sur le plan, rien d\'hérité', f.slice(0, 400));
  f = await fiche(c, 'plan:tp-rien-f-001');
  verifier(/Personne n'a reçu ce scénario sur Web/.test(f), 'la case non affectée dit pourquoi', f.slice(0, 300));

  console.log('\n== Le client');
  const k = await ouvrir();
  await connecter(k, 'camille.essai@exemple.test');
  await allerHumains(k);
  const vk = await cases(k);
  verifier(vk['tp-rien-f-001'] === 'nonteste' && vk['tp-compte-f-001'] === 'fragile', 'la même grille, sans « non affecté » chez le client', JSON.stringify(vk));
  const kt = await k.evaluate(() => (document.querySelector('.tb-section') || document.body).innerText);
  verifier(!/Karim|Sonia|Marc/.test(kt), 'ni prénoms de testeurs');
  const biblio = ((await lire(`projets/${P}/scenarios?pageSize=300`)) || {}).documents || [];
  await k.evaluate((h2) => { location.hash = h2; }, `#/projets/${P}/tests`);
  await attendre(async () => /pour de vraies personnes/.test(await k.evaluate(() => document.body.innerText)), 30, 500);
  const pt = await k.evaluate(() => ({ texte: document.body.innerText, chiffres: [...document.querySelectorAll('.chiffres-tests .chiffre')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()) }));
  verifier(/6 scénarios à dérouler/.test(pt.texte) && !new RegExp(`\\b${biblio.length} scénarios à dérouler`).test(pt.texte), `la page du projet compte les scénarios humains du plan (6), plus la bibliothèque (${biblio.length})`, (pt.texte.match(/[^\n]*à dérouler[^\n]*/) || [''])[0]);
  verifier(pt.chiffres[0] === '6 scénarios pour de vraies personnes' && pt.chiffres[1] === '2 testés sur iPhone et Android', 'ses chiffres viennent du plan', pt.chiffres.join(' | '));

  await vider(`projets/${P}/campagnes/${CID}/passages`); await effacer(`projets/${P}/campagnes/${CID}`); await vider(`projets/${P}/planTests`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  if (erreurs.length) console.log('  ÉCART  erreurs JavaScript dans la page');
  process.exit(ecarts.length || erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
