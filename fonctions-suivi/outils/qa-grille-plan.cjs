require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'onglet « Tests par robot » rangé par le plan

   Ce que Nadir a demandé le 02/10/2026 : dans le tableau des tests, les
   cartes des robots deviennent les sections du plan (« Ce qui va être
   testé »), et chaque case un scénario que fait un robot, robot seul OU
   humain et robot. Un scénario fait par un humain seul n'a pas de case.
   La couleur vient des tests robot rattachés au scénario (champ
   « parcours »), le pire l'emporte, plateforme par plateforme. Aucun
   résultat ne se perd : un test rattaché à rien reste dans « Hors plan ».

   1. l'outil d'import accepte « parcours », le recopie, et refuse un test
      inconnu des parcours du projet (avec --vrai ou --parcours=) ;
   2. le Cockpit : sans plan, la grille d'avant ; le plan versé, la page
      vivante bascule : une carte par section, dans l'ordre de la page du
      plan, une case par scénario robot ou humain et robot, aucune pour un
      humain seul, le statut repris des tests, le pire l'emporte, le point
      violet ou bleu, le filtre de plateforme, la carte Hors plan, les
      chiffres du haut ; les fiches (un test, plusieurs, aucun) ;
   3. le client : la même grille, sans rien à modifier ;
   4. le plan retiré : la grille d'avant revient, à l'identique.

   Banc : émulateurs, site local, semer-suivi, semer-parcours, semer-regles.
     node fonctions-suivi/outils/qa-grille-plan.cjs
   Captures : $CAPTURES_GRILLE (sinon le dossier temporaire).
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

/* --------------------------------------------------------------------------
   Le semis : des tests robot aux résultats connus, et un petit plan
   -------------------------------------------------------------------------- */

const PARCOURS = [
  // ref, titre, outil, plateformes, etat
  ['GP-IOS', 'Se connecter sur iPhone', 'maestro', ['ios'], 'vert'],
  ['GP-AND', 'Se connecter sur Android', 'maestro', ['android'], 'rouge'],
  ['GP-WEB', 'Se connecter sur le web', 'playwright', ['web'], 'instable'],
  ['GP-NEUF', 'Créer une tâche', 'maestro', ['ios', 'android'], 'ecrit'],
  ['GP-HORS', 'Un test rattaché à rien', 'playwright', ['web'], 'vert'],
  ['GP-HUM', 'Rattaché à un scénario humain seul', 'maestro', ['ios'], 'vert'],
  ['GP-DISPARU', 'Bientôt retiré', 'maestro', ['ios'], 'vert'],
  /* Il échoue exprès sur un défaut déjà connu : défaut connu, pas cassé. */
  ['GP-CONNU', 'Échoue sur un défaut connu', 'maestro', ['android'], 'rouge', true],
];
const sc = (id, qui, plateformes, parcours, titre) => ({
  id, titre: titre || `Scénario ${id}`, etapes: `Ouvrir l'application.\nFaire ${id}.`, attendu: `Le résultat de ${id} s'affiche.`,
  plateformes, type: 'normal', priorite: 'moyenne', refs: [], qui, parcours,
});
const SECTIONS = [
  { id: 'gp-connexion', groupe: 'demarrage', ordre: 1, titre: 'Connexion, grille', resume: 'Se connecter.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [
      sc('gp-connexion-f-001', 'robot', ['ios'], ['GP-IOS'], 'Connexion sur iPhone'),
      sc('gp-connexion-f-002', 'humain', ['ios'], ['GP-HUM'], 'Connexion regardée par un humain'),
      sc('gp-connexion-f-003', 'les-deux', ['ios', 'android', 'web'], ['GP-IOS', 'GP-AND', 'GP-WEB'], 'Connexion partout'),
    ],
    technique: [sc('gp-connexion-t-001', 'robot', ['ios', 'android'], ['GP-DISPARU'], 'Connexion lente')],
    ux: [], securite: [] } },
  { id: 'gp-taches', groupe: 'fonctionnalites', ordre: 2, titre: 'Tâches, grille', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [
      sc('gp-taches-f-001', 'les-deux', ['ios', 'android'], ['GP-NEUF'], 'Créer une tâche'),
      sc('gp-taches-f-002', 'robot', ['ios', 'web'], ['GP-IOS'], 'Tâche sur iPhone et web'),
    ],
    technique: [sc('gp-taches-t-001', 'robot', ['android'], ['GP-CONNU'], 'Tâche lourde sur Android')], ux: [], securite: [] } },
  { id: 'gp-humain', groupe: 'transverse', ordre: 3, titre: 'Seulement des humains', resume: 'Rien pour les robots.', plateformes: ['web'], aspects: {
    fonctionnel: [sc('gp-humain-f-001', 'humain', ['web'], [], 'Lire à voix haute')], technique: [], ux: [], securite: [] } },
  /* Rangée dans le premier groupe malgré son numéro : l'ordre est celui de
     la page du plan (groupe, puis numéro). */
  { id: 'gp-compte', groupe: 'demarrage', ordre: 4, titre: 'Compte, grille', resume: 'Le compte.', plateformes: ['ios'], aspects: {
    fonctionnel: [], technique: [], ux: [], securite: [sc('gp-compte-s-001', 'les-deux', ['ios'], [], 'Supprimer son compte')] } },
];
/* Ce que doit dire chaque case, toutes plateformes puis plateforme par
   plateforme ; absent : pas de case. GP-DISPARU sera retiré avant la vue. */
const ATTENDU = {
  '': { 'gp-connexion-f-001': 'ok', 'gp-connexion-f-003': 'casse', 'gp-connexion-t-001': 'aecrire', 'gp-compte-s-001': 'aecrire', 'gp-taches-f-001': 'jamais', 'gp-taches-f-002': 'aecrire', 'gp-taches-t-001': 'connu' },
  ios: { 'gp-connexion-f-001': 'ok', 'gp-connexion-f-003': 'ok', 'gp-connexion-t-001': 'aecrire', 'gp-compte-s-001': 'aecrire', 'gp-taches-f-001': 'jamais', 'gp-taches-f-002': 'ok' },
  android: { 'gp-connexion-f-003': 'casse', 'gp-connexion-t-001': 'aecrire', 'gp-taches-f-001': 'jamais', 'gp-taches-t-001': 'connu' },
  web: { 'gp-connexion-f-003': 'fragile', 'gp-taches-f-002': 'aecrire' },
};
const QUI = { 'gp-connexion-f-001': 'bleu', 'gp-connexion-f-003': 'violet', 'gp-connexion-t-001': 'bleu', 'gp-compte-s-001': 'violet', 'gp-taches-f-001': 'violet', 'gp-taches-f-002': 'bleu', 'gp-taches-t-001': 'bleu' };
const ORDRE_CARTES = ['Connexion, grille', 'Compte, grille', 'Tâches, grille', 'Seulement des humains'];
const DANS_LE_PLAN = new Set(SECTIONS.flatMap((s) => Object.values(s.aspects).flat()).filter((x) => x.qui !== 'humain').flatMap((x) => x.parcours));

const etatCase = (p) => {
  if (p.enCours) return 'tourne';
  if (p.etat === 'rouge' && p.defautConnu) return 'connu';
  return { vert: 'ok', rouge: 'casse', instable: 'fragile', suspendu: 'suspendu', 'a-ecrire': 'aecrire' }[p.etat] || 'jamais';
};
const surPlat = (p, plat) => !plat || !p.plateformes.length || p.plateformes.includes(plat);

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
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};
/* La page Tests du projet, le tableau déployé, l'onglet des robots. */
const allerRobots = async (page, plateforme = '') => {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, `#/tests?projet=${P}${plateforme ? `&plateforme=${plateforme}` : ''}`);
    if (await page.waitForSelector('[data-deplier]', { timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  if (await page.$eval('[data-deplier]', (b) => b.getAttribute('aria-expanded') !== 'true').catch(() => false)) await page.click('[data-deplier]');
  await page.waitForSelector('[data-voie="machine"]', { timeout: 10000 }).catch(() => {});
  await page.click('[data-voie="machine"]').catch(() => {});
  await page.waitForSelector('.tb-case', { timeout: 20000 }).catch(() => {});
  await pause(900);
};
/* Ce que montre la grille : les cartes, leurs cases, et la ligne du haut. */
const releve = (page) => page.evaluate(() => {
  const cartes = [...document.querySelectorAll('.tb .tb-famille')].map((f) => ({
    nom: f.getAttribute('aria-label'),
    groupe: (f.closest('.tb-groupe') || { dataset: {} }).dataset.groupe || '',
    compte: ((f.querySelector('.tb-compte') || {}).textContent || '').trim(),
    note: ((f.querySelector('.tb-famille-note') || {}).textContent || '').trim(),
    cases: [...f.querySelectorAll('.tb-case')].map((c) => ({ cle: c.dataset.case, e: c.dataset.e, qui: c.dataset.qui || '', label: c.getAttribute('aria-label') || '' })),
  }));
  const ligne = [...document.querySelectorAll('.tb-resume .tb-ligne')].find((l) => /Tests par robot/.test(l.textContent)) || null;
  const legende = ligne ? [...ligne.querySelectorAll('.tb-legende span')].map((s) => [s.querySelector('.tb-puce').dataset.e, Number(s.querySelector('b').textContent)]) : [];
  return {
    cartes,
    groupes: [...document.querySelectorAll('.tb-groupe')].map((g) => g.dataset.groupe),
    meta: ligne ? ligne.querySelector('.tb-ligne-meta').innerText.trim() : '',
    pc: ligne ? Number(ligne.querySelector('.tb-ligne-pc').firstChild.textContent.trim()) : NaN,
    aide: ligne && ligne.querySelector('.tb-ligne-aide') ? ligne.querySelector('.tb-ligne-aide').innerText.trim() : '',
    legende,
    barre: ligne ? (ligne.querySelector('.tb-barre') || {}).getAttribute('aria-label') : '',
    qui: ((document.querySelector('.tb-qui') || {}).innerText || '').trim(),
    deplier: ((document.querySelector('[data-deplier]') || {}).textContent || '').trim(),
    texte: (document.querySelector('.tb-section') || document.body).innerText,
  };
});
const casesPlan = (r) => Object.fromEntries(r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').flatMap((c) => c.cases).map((c) => [c.cle.replace(/^plan:/, ''), c.e]));
const fiche = async (page, cle) => {
  await page.click(`.tb-case[data-case="${cle}"]`);
  await page.waitForSelector('.voile--scenario .modale, .modale--scenario', { timeout: 8000 }).catch(() => {});
  await pause(500);
  const r = await page.evaluate(() => {
    const m = document.querySelector('.modale--scenario') || document.querySelector('.voile--scenario');
    return m ? { texte: m.innerText, titre: ((m.querySelector('h2, .modale-titre') || {}).textContent || '').trim(), modifier: !!m.querySelector('[data-modifier]'), parcours: [...m.querySelectorAll('[data-ouvrir-parcours]')].map((b) => b.dataset.ouvrirParcours) } : null;
  });
  return r || { texte: '', titre: '', modifier: false, parcours: [] };
};
const fermer = async (page) => {
  await page.click('.voile--scenario [data-fermer], .modale--scenario [data-fermer]').catch(() => {});
  await page.waitForSelector('.voile--scenario', { state: 'detached', timeout: 5000 }).catch(() => {});
  await pause(300);
};
/* Le thème choisi dans l'application l'emporte sur celui du système :
   on le pose comme le ferait la personne, par son sélecteur. */
const theme = async (page, valeur) => {
  await page.click(`[data-theme-val="${valeur}"]`).catch(() => {});
  await pause(400);
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
};
const sansHeure = (meta) => meta.replace(/ · dernier résultat [^·]*/, '').replace(/ · jamais exécutés/, '');

/* Les chiffres du haut, recomptés depuis la grille et la base : réussis
   sur (cases du plan + règles), légende qui fait le total, pourcentage. */
const verifierChiffres = (r, regles, quoi) => {
  const plan = r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').flatMap((c) => c.cases);
  const reglesCases = (r.cartes.find((c) => c.nom === 'Règles métier') || { cases: [] }).cases;
  const total = plan.length + reglesCases.length;
  const reussis = [...plan, ...reglesCases].filter((c) => c.e === 'ok').length;
  verifier(reglesCases.length === regles.length, `${quoi} : les règles sur les calculs gardent leur carte (${regles.length})`, String(reglesCases.length));
  verifier(new RegExp(`^${reussis} réussis sur ${total}\\b`).test(r.meta), `${quoi} : « ${reussis} réussis sur ${total} », les cases robot du plan plus les règles`, r.meta);
  verifier(new RegExp(`${plan.length} scénarios? du plan`).test(r.meta), `${quoi} : la ligne dit combien de scénarios du plan`, r.meta);
  const somme = r.legende.reduce((t, [, n]) => t + n, 0);
  const parEtat = Object.fromEntries(r.legende);
  const compte = (e) => [...plan, ...reglesCases].filter((c) => c.e === e).length;
  verifier(somme === total && ['ok', 'fragile', 'casse', 'connu', 'jamais', 'aecrire'].every((e) => (parEtat[e] || 0) === compte(e)), `${quoi} : la légende (réussi, fragile, cassé, défaut connu, jamais lancé, à écrire) recompte les mêmes cases`, JSON.stringify(r.legende));
  verifier(r.pc === Math.round((reussis / (total || 1)) * 100), `${quoi} : le pourcentage suit (${Math.round((reussis / (total || 1)) * 100)} %)`, String(r.pc));
  verifier(new RegExp(`· ${total} tests? par robot`).test(r.deplier) || /Replier/.test(r.deplier), `${quoi} : le bouton du tableau compte pareil`, r.deplier);
};

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (schema = 'light') => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: schema });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`PAGE: ${e.message}`));
    return page;
  };

  console.log('\n== Semis');
  await vider(`projets/${P}/planTests`);
  for (const [ref, titre, outil, plateformes, etat, connu] of PARCOURS) {
    await poser(`projets/${P}/parcours/${ref}`, {
      ...(connu ? { defautConnu: B(true) } : {}),
      ref: S(ref), titre: S(titre), outil: S(outil), plateformes: L(plateformes.map(S)), scenarios: L([]), etat: S(etat),
      actif: B(true), ordre: N(9000), mutation: B(false), note: S(''), fichier: S(''),
      ...(etat !== 'ecrit' ? { dernier: M({ le: T(new Date(Date.now() - 3600000)), resultat: S(etat), plateforme: S(plateformes[0]), execution: S('qa-grille') }) } : {}),
    });
  }
  const tousParcours = (((await lire(`projets/${P}/parcours?pageSize=500`)) || {}).documents || []).map((d) => ({
    ref: champ(d, 'ref').stringValue || d.name.split('/').pop(), etat: champ(d, 'etat').stringValue || '',
    actif: champ(d, 'actif').booleanValue !== false, defautConnu: champ(d, 'defautConnu').booleanValue === true, enCours: Boolean(champ(d, 'enCours').booleanValue || champ(d, 'enCours').stringValue),
    plateformes: valeurs(champ(d, 'plateformes')).map((v) => v.stringValue),
  }));
  const regles = (((await lire(`projets/${P}/regles?pageSize=300`)) || {}).documents || []).filter((d) => champ(d, 'actif').booleanValue !== false);
  verifier(tousParcours.length >= PARCOURS.length && regles.length > 0, `le projet a ses tests robot (${tousParcours.length}) et ses règles (${regles.length})`);

  /* Les fichiers du plan, dans un dossier à part (sans liste de référence). */
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-grille-plan-'));
  const dossierPlan = path.join(racine, 'plan'); fs.mkdirSync(dossierPlan);
  SECTIONS.forEach((s) => fs.writeFileSync(path.join(dossierPlan, `${s.id}.json`), JSON.stringify(s, null, 2)));
  const dossierFaux = path.join(racine, 'faux'); fs.mkdirSync(dossierFaux);
  fs.writeFileSync(path.join(dossierFaux, 'gp-faux.json'), JSON.stringify({ ...SECTIONS[2], id: 'gp-faux', ordre: 9, aspects: { fonctionnel: [sc('gp-faux-f-001', 'robot', ['web'], ['GP-INCONNU'])], technique: [], ux: [], securite: [] } }, null, 2));
  const dossierMal = path.join(racine, 'mal'); fs.mkdirSync(dossierMal);
  fs.writeFileSync(path.join(dossierMal, 'gp-mal.json'), JSON.stringify({ ...SECTIONS[2], id: 'gp-mal', ordre: 8, aspects: { fonctionnel: [{ ...sc('gp-mal-f-001', 'robot', ['web'], []), parcours: 'GP-IOS' }, sc('gp-mal-f-002', 'robot', ['web'], ['GP-IOS', 'GP-IOS'])], technique: [], ux: [], securite: [] } }, null, 2));
  const connus = path.join(racine, 'parcours.json');
  fs.writeFileSync(connus, JSON.stringify({ parcours: [{ ref: 'GP-IOS' }] }));

  console.log('\n== L\'outil d\'import et le champ « parcours »');
  const blanc = importer([P, dossierFaux]);
  verifier(blanc.code === 0 && /1 section valide/.test(blanc.sortie), 'à blanc, sans liste des tests robot : « parcours » est accepté', blanc.sortie.slice(-200));
  const avecListe = importer([P, dossierFaux, `--parcours=${connus}`]);
  verifier(avecListe.code === 1 && /test robot GP-INCONNU inconnu des parcours du projet/.test(avecListe.sortie), 'avec --parcours= : un test robot inconnu est refusé, nommé', avecListe.sortie.slice(-300));
  const mal = importer([P, dossierMal]);
  verifier(mal.code === 1 && /parcours, une liste est attendue/.test(mal.sortie) && /test robot en double/.test(mal.sortie), 'un « parcours » qui n\'est pas une liste, ou un test en double, est refusé', mal.sortie.slice(-300));
  const fauxVrai = importer([P, dossierFaux, '--vrai']);
  verifier(fauxVrai.code === 1 && /GP-INCONNU inconnu des parcours du projet/.test(fauxVrai.sortie) && !(await lire(`projets/${P}/planTests/gp-faux`) || {}).fields, 'avec --vrai : les parcours du projet sont lus, l\'inconnu refusé, rien versé', fauxVrai.sortie.slice(-300));

  console.log('\n== Sans plan : la grille d\'avant');
  const cockpit = await ouvrir('dark');
  await connecter(cockpit, 'agent.essai@exemple.test');
  await allerRobots(cockpit);
  const avant = await releve(cockpit);
  verifier(avant.cartes.length > 0 && !avant.groupes.length && !avant.cartes.some((c) => c.nom === 'Hors plan'), 'des familles, ni groupes du plan ni « Hors plan »', avant.cartes.map((c) => c.nom).join(' | '));
  verifier(avant.cartes.some((c) => /hors scénario/.test(c.nom)) && avant.cartes.some((c) => c.nom === 'Règles métier'), 'les familles d\'outil et les règles métier, comme avant');
  verifier(!avant.aide && !avant.qui && !avant.cartes.flatMap((c) => c.cases).some((c) => c.qui), 'sans plan, ni phrase d\'explication, ni légende humain/robot, ni point de couleur');
  const casesAvant = avant.cartes.flatMap((c) => c.cases);
  verifier(casesAvant.length === tousParcours.filter((p) => p.actif).length + regles.length && new RegExp(`^\\d+ réussis sur ${casesAvant.length}\\b`).test(avant.meta), 'une case par test robot et par règle, comptées en haut', `${casesAvant.length} cases · ${avant.meta}`);

  console.log('\n== Le plan versé : la page bascule d\'elle-même');
  const vrai = importer([P, dossierPlan, '--vrai']);
  verifier(vrai.code === 0 && /4 sections versées/.test(vrai.sortie), 'les quatre sections sont versées, leurs tests robot connus', vrai.sortie.slice(-300));
  const f003 = valeurs(champ(await lire(`projets/${P}/planTests/gp-connexion`), 'aspects').mapValue.fields.fonctionnel).find((v) => v.mapValue.fields.id.stringValue === 'gp-connexion-f-003');
  verifier(f003 && valeurs(f003.mapValue.fields.parcours).map((v) => v.stringValue).join(',') === 'GP-IOS,GP-AND,GP-WEB', '« parcours » est recopié tel quel dans le scénario');
  /* Un test rattaché qui disparaît ensuite (renommé, supprimé). */
  await effacer(`projets/${P}/parcours/GP-DISPARU`);
  const parcoursActifs = tousParcours.filter((p) => p.actif && p.ref !== 'GP-DISPARU');
  const bascule = await attendre(async () => (await cockpit.$$('.tb-groupe')).length > 0, 40, 500);
  verifier(bascule, 'sans recharger, la grille des robots se range par le plan');
  await pause(800);
  const r0 = await releve(cockpit);

  const sections = r0.cartes.filter((c) => c.groupe && c.groupe !== 'autres');
  verifier(sections.map((c) => c.nom).join(' | ') === ORDRE_CARTES.join(' | '), 'une carte par section, dans l\'ordre du plan (groupe, puis numéro)', sections.map((c) => c.nom).join(' | '));
  verifier(r0.groupes.join(',') === 'demarrage,fonctionnalites,transverse,autres', 'regroupées par les groupes du plan, puis les autres tests', r0.groupes.join(','));
  const vus = casesPlan(r0);
  verifier(!('gp-connexion-f-002' in vus) && !('gp-humain-f-001' in vus), 'aucune case pour un scénario fait par un humain seul', Object.keys(vus).join(','));
  verifier(Object.keys(vus).sort().join(',') === Object.keys(ATTENDU['']).sort().join(','), 'une case pour chaque scénario robot seul et chaque humain et robot', Object.keys(vus).join(','));
  for (const [id, e] of Object.entries(ATTENDU[''])) verifier(vus[id] === e, `${id} : ${e}`, `vu ${vus[id]}`);
  verifier(vus['gp-connexion-f-003'] === 'casse', 'trois tests (vert, rouge, instable) : le pire l\'emporte, cassé');
  const humains = sections.find((c) => c.nom === 'Seulement des humains');
  verifier(humains && !humains.cases.length && /Aucun scénario pour les robots/.test(humains.note) && humains.compte === '0/0', 'une section sans scénario pour les robots garde sa carte, et le dit', JSON.stringify(humains));
  const quiVus = Object.fromEntries(sections.flatMap((c) => c.cases).map((c) => [c.cle.replace(/^plan:/, ''), c.qui]));
  verifier(Object.entries(QUI).every(([id, q]) => quiVus[id] === q), 'le point dit qui fait le scénario : violet humain et robot, bleu robot seul', JSON.stringify(quiVus));
  verifier(sections.flatMap((c) => c.cases).every((c) => (c.qui === 'violet' ? /humain et robot/ : /robot seul/).test(c.label)), 'et l\'étiquette lue par le lecteur d\'écran aussi');
  verifier(/3\s*humain et robot/.test(r0.qui) && /4\s*robot seul/.test(r0.qui), 'une légende courte, avec les deux comptes', r0.qui);
  const couleurs = await cockpit.evaluate(() => {
    const point = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, '::after').backgroundColor : ''; };
    const puce = (cls) => { const el = document.querySelector(`.plan-qui-${cls} i`); return el ? getComputedStyle(el).backgroundColor : ''; };
    return { violet: point('.tb-case[data-qui="violet"]'), bleu: point('.tb-case[data-qui="bleu"]'), legendeV: puce('violet'), legendeB: puce('bleu') };
  });
  verifier(couleurs.violet && couleurs.violet === couleurs.legendeV && couleurs.bleu === couleurs.legendeB && couleurs.violet !== couleurs.bleu, 'les couleurs sont celles de la page du plan', JSON.stringify(couleurs));

  console.log('\n== Hors plan : aucun résultat ne disparaît');
  const hors = r0.cartes.find((c) => c.nom === 'Hors plan');
  const horsRefs = new Set((hors || { cases: [] }).cases.map((c) => c.cle));
  const attendusHors = parcoursActifs.filter((p) => !DANS_LE_PLAN.has(p.ref));
  verifier(hors && hors.groupe === 'autres' && horsRefs.size === attendusHors.length && attendusHors.every((p) => horsRefs.has(p.ref)), `la carte « Hors plan » garde les ${attendusHors.length} tests rattachés à aucun scénario robot`, `${horsRefs.size} vus`);
  verifier(horsRefs.has('GP-HORS') && horsRefs.has('GP-HUM'), 'dont un test rattaché à rien, et un rattaché à un scénario humain seul');
  verifier(!horsRefs.has('GP-IOS') && !horsRefs.has('GP-AND') && !horsRefs.has('GP-WEB') && !horsRefs.has('GP-NEUF'), 'un test rattaché à un scénario robot n\'y est pas en double');
  verifier(parcoursActifs.every((p) => horsRefs.has(p.ref) || DANS_LE_PLAN.has(p.ref)), 'chaque test robot actif du projet se lit quelque part');
  verifier((hors || { cases: [] }).cases.every((c) => c.e === etatCase(parcoursActifs.find((p) => p.ref === c.cle))), 'avec son résultat, comme avant');
  verifier(/sans compter/.test((hors || {}).note || '') && /hors plan, montrés à part/.test(r0.meta), 'la carte et la ligne du haut disent qu\'ils ne comptent pas', `${(hors || {}).note} · ${r0.meta}`);
  verifier(r0.cartes[r0.cartes.length - 1].nom === 'Hors plan', 'en fin de grille');

  console.log('\n== Les chiffres du haut');
  verifierChiffres(r0, regles, 'toutes plateformes');
  verifier(/Chaque scénario du plan fait par un robot compte une fois/.test(r0.aide) && /plus mauvais résultat/.test(r0.aide), 'une phrase dit d\'où viennent les chiffres, sans jargon', r0.aide);
  verifier(!/\bundefined\b|\bnull\b|NaN/.test(r0.texte) && !r0.texte.includes('—'), 'ni « undefined », ni « null », ni tiret cadratin');

  console.log('\n== Le filtre de plateforme');
  for (const plat of ['ios', 'android', 'web']) {
    await cockpit.click(`[data-plateforme="${plat}"]`);
    await attendre(async () => (await cockpit.evaluate(() => location.hash)).includes(`plateforme=${plat}`), 20, 200);
    await pause(1200);
    const r = await releve(cockpit);
    const v = casesPlan(r);
    verifier(Object.keys(v).sort().join(',') === Object.keys(ATTENDU[plat]).sort().join(','), `${plat} : seulement les cases de cette plateforme`, Object.keys(v).join(','));
    const faux = Object.entries(ATTENDU[plat]).filter(([id, e]) => v[id] !== e);
    verifier(!faux.length, `${plat} : le résultat de cette plateforme`, faux.map(([id, e]) => `${id} attendu ${e}, vu ${v[id]}`).join(' ; '));
    const horsP = new Set((r.cartes.find((c) => c.nom === 'Hors plan') || { cases: [] }).cases.map((c) => c.cle));
    const attendus = parcoursActifs.filter((p) => !DANS_LE_PLAN.has(p.ref) && surPlat(p, plat));
    verifier(horsP.size === attendus.length && attendus.every((p) => horsP.has(p.ref)), `${plat} : le hors plan suit le filtre`, `${horsP.size} vus, ${attendus.length} attendus`);
    verifier(r.cartes.filter((c) => c.groupe && c.groupe !== 'autres').length === ORDRE_CARTES.length, `${plat} : toutes les sections gardent leur carte`);
    verifierChiffres(r, regles, plat);
  }
  await cockpit.click('[data-plateforme=""]'); await pause(1200);

  console.log('\n== Les fiches');
  let f = await fiche(cockpit, 'plan:gp-connexion-f-001');
  verifier(/Se connecter sur iPhone/.test(f.titre) && /GP-IOS/.test(f.texte), 'un seul test rattaché : la fiche de ce test', f.titre);
  verifier(/Vérifie dans le plan gp-connexion-f-001/.test(f.texte), 'qui dit quel scénario du plan il vérifie', f.texte.slice(0, 300));
  verifier(f.modifier, 'l\'équipe peut le modifier');
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gp-connexion-f-003');
  verifier(/Connexion partout/.test(f.titre), 'plusieurs tests : la fiche du scénario', f.titre);
  verifier(/Ouvrir l'application/.test(f.texte) && /Le résultat de gp-connexion-f-003 s'affiche/.test(f.texte), 'avec ses étapes et ce qui doit se passer');
  verifier(/Humain et robot/.test(f.texte) && /iOS, Android, Web/.test(f.texte), 'qui le fait, et ses plateformes');
  verifier(f.parcours.join(',') === 'GP-IOS,GP-AND,GP-WEB' && /Réussi/.test(f.texte) && /Cassé/.test(f.texte) && /Fragile/.test(f.texte), 'la liste de ses tests, chacun avec son résultat', f.parcours.join(','));
  verifier(/Cassé\./.test(f.texte) && /GP-AND en échec/.test(f.texte) && /le plus mauvais résultat l'emporte/.test(f.texte), 'et pourquoi cette couleur', f.texte.slice(0, 260));
  verifier(/par plateforme/i.test(f.texte) && /Web[\s\S]{0,40}GP-WEB/.test(f.texte), 'plateforme par plateforme', f.texte.slice(0, 600));
  await cockpit.click('[data-ouvrir-parcours="GP-AND"]'); await pause(900);
  const fAnd = await cockpit.evaluate(() => ((document.querySelector('.modale--scenario') || document.querySelector('.voile--scenario') || {}).innerText || ''));
  verifier(/Se connecter sur Android/.test(fAnd), '« Voir » ouvre la fiche du test', fAnd.slice(0, 80));
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gp-connexion-t-001');
  verifier(/Connexion lente/.test(f.titre) && /Pas encore de test robot écrit/.test(f.texte) && /Ouvrir l'application/.test(f.texte), 'sans test : la fiche du scénario, « Pas encore de test robot écrit »', f.texte.slice(0, 200));
  verifier(/Introuvable parmi les tests robot actifs du projet : GP-DISPARU/.test(f.texte), 'l\'équipe apprend qu\'un test rattaché a disparu');
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gp-taches-f-002');
  verifier(/Se connecter sur iPhone/.test(f.titre), 'gp-taches-f-002, un seul test : sa fiche', f.titre);
  await fermer(cockpit);
  f = await fiche(cockpit, 'plan:gp-taches-t-001');
  verifier(/Échoue sur un défaut connu/.test(f.titre) && /Défaut connu/.test(f.texte) && /défaut déjà connu/.test(f.texte), 'un défaut connu se dit comme tel dans la fiche', f.texte.slice(0, 200));
  await fermer(cockpit);
  verifier(r0.legende.some(([e, n]) => e === 'connu' && n === 1) && vus['gp-taches-t-001'] === 'connu', 'la légende compte le défaut connu à part, pas avec les cassés', JSON.stringify(r0.legende));
  f = await fiche(cockpit, 'GP-HORS');
  verifier(/Un test rattaché à rien/.test(f.titre) && !/Vérifie dans le plan/.test(f.texte), 'une case hors plan : la fiche du test, comme avant', f.titre);
  await fermer(cockpit);
  await theme(cockpit, 'dark');
  await cockpit.screenshot({ path: path.join(CAPTURES, 'grille-plan-cockpit-sombre.png'), fullPage: true });
  verifier(fs.existsSync(path.join(CAPTURES, 'grille-plan-cockpit-sombre.png')), `capture du Cockpit en sombre : ${path.join(CAPTURES, 'grille-plan-cockpit-sombre.png')}`);

  console.log('\n== Le client : la même grille, rien à modifier');
  const client = await ouvrir('light');
  await connecter(client, 'camille.essai@exemple.test');
  await allerRobots(client);
  const rc = await releve(client);
  const vc = casesPlan(rc);
  verifier(rc.cartes.filter((c) => c.groupe && c.groupe !== 'autres').map((c) => c.nom).join(' | ') === ORDRE_CARTES.join(' | '), 'les mêmes cartes, dans le même ordre', rc.cartes.map((c) => c.nom).join(' | '));
  verifier(JSON.stringify(vc) === JSON.stringify(casesPlan(r0)), 'les mêmes cases, les mêmes couleurs', JSON.stringify(vc));
  verifier(sansHeure(rc.meta) === sansHeure(r0.meta) && rc.pc === r0.pc, 'les mêmes chiffres en haut', `${rc.meta} / ${r0.meta}`);
  verifier((rc.cartes.find((c) => c.nom === 'Hors plan') || { cases: [] }).cases.length === horsRefs.size, 'et le même « Hors plan »');
  verifier(!(await client.$('[data-robot-neuf], [data-revoquer]')) && !/Les robots/.test(rc.texte), 'ni robots ni jetons chez le client');
  f = await fiche(client, 'plan:gp-connexion-f-001');
  verifier(/Se connecter sur iPhone/.test(f.titre) && !f.modifier, 'la fiche d\'un test, sans « Modifier »', f.titre);
  await fermer(client);
  f = await fiche(client, 'plan:gp-connexion-f-003');
  verifier(/Connexion partout/.test(f.titre) && f.parcours.length === 3 && !f.modifier, 'la fiche d\'un scénario, sans rien à modifier');
  await fermer(client);
  f = await fiche(client, 'plan:gp-connexion-t-001');
  verifier(/Pas encore de test robot écrit/.test(f.texte) && !/Introuvable|GP-DISPARU/.test(f.texte), 'le client ne lit pas la cuisine interne (test disparu)');
  await fermer(client);
  await theme(client, 'light');
  await client.screenshot({ path: path.join(CAPTURES, 'grille-plan-client-clair.png'), fullPage: true });
  verifier(fs.existsSync(path.join(CAPTURES, 'grille-plan-client-clair.png')), `capture du client en clair : ${path.join(CAPTURES, 'grille-plan-client-clair.png')}`);

  console.log('\n== La page du plan, pour comparer');
  await cockpit.evaluate((h) => { location.hash = h; }, `/tests/plan?projet=${P}`);
  await cockpit.waitForSelector('.plan-section', { timeout: 20000 }).catch(() => {});
  await pause(800);
  const titresPlan = await cockpit.$$eval('.plan-section h2', (l) => l.map((x) => x.textContent.trim()));
  verifier(titresPlan.join(' | ') === ORDRE_CARTES.join(' | '), 'la page « Ce qui va être testé » a les mêmes sections, dans le même ordre', titresPlan.join(' | '));

  console.log('\n== Un test change : la case suit en direct');
  await allerRobots(cockpit);
  await poser(`projets/${P}/parcours/GP-AND`, {
    ref: S('GP-AND'), titre: S('Se connecter sur Android'), outil: S('maestro'), plateformes: L([S('android')]), scenarios: L([]), etat: S('vert'),
    actif: B(true), ordre: N(9000), mutation: B(false), note: S(''), fichier: S(''), maj: T(new Date()),
    dernier: M({ le: T(new Date()), resultat: S('vert'), plateforme: S('android'), execution: S('qa-grille-2') }),
  });
  const suivi = await attendre(async () => (await cockpit.$eval('.tb-case[data-case="plan:gp-connexion-f-003"]', (b) => b.dataset.e).catch(() => '')) === 'fragile', 30, 500);
  verifier(suivi, 'GP-AND repasse au vert : gp-connexion-f-003 devient fragile (le pire qui reste, GP-WEB instable)');

  console.log('\n== Le plan retiré : la grille d\'avant revient');
  await vider(`projets/${P}/planTests`);
  await poser(`projets/${P}/parcours/GP-AND`, {
    ref: S('GP-AND'), titre: S('Se connecter sur Android'), outil: S('maestro'), plateformes: L([S('android')]), scenarios: L([]), etat: S('rouge'),
    actif: B(true), ordre: N(9000), mutation: B(false), note: S(''), fichier: S(''), maj: T(new Date()),
    dernier: M({ le: T(new Date(Date.now() - 3600000)), resultat: S('rouge'), plateforme: S('android'), execution: S('qa-grille') }),
  });
  const retour = await attendre(async () => (await cockpit.$$('.tb-groupe')).length === 0, 40, 500);
  verifier(retour, 'sans recharger, les groupes du plan disparaissent');
  await pause(1000);
  const apres = await releve(cockpit);
  const signature = (r) => r.cartes.map((c) => `${c.nom}:${c.cases.filter((x) => x.cle !== 'GP-DISPARU').map((x) => `${x.cle}=${x.e}`).join(',')}`).join('\n');
  verifier(signature(apres) === signature(avant), 'mêmes familles, mêmes cases, mêmes couleurs qu\'avant le plan (au test retiré près)', signature(apres).slice(0, 300));
  verifier(!apres.aide && !apres.qui, 'et plus rien du plan');

  /* Ce qu'on laisse : rien. */
  for (const [ref] of PARCOURS) await effacer(`projets/${P}/parcours/${ref}`);
  await vider(`projets/${P}/planTests`);
  fs.rmSync(racine, { recursive: true, force: true });

  /* Le vrai plan, s'il est fourni (copie hors dépôt : $PLAN_REEL/sections,
     $PLAN_REEL/SECTIONS.md, $PLAN_REEL/etat-reel.json) : les 288 parcours
     du catalogue, leur dernier état réel, la concordance versée, et les
     captures. Rien n'est écrit ailleurs que sur l'émulateur. */
  const REEL = process.env.PLAN_REEL || '';
  if (REEL && fs.existsSync(path.join(REEL, 'sections'))) {
    console.log('\n== Le vrai plan, sur l\'émulateur');
    try { execFileSync(process.execPath, [path.join(__dirname, 'semer-parcours-2.mjs'), P, '--vrai'], { env: process.env, stdio: 'ignore' }); } catch (e) { /* le bilan le dira */ }
    const reel = JSON.parse(fs.readFileSync(path.join(REEL, 'etat-reel.json'), 'utf8'));
    const poserEtat = async (col, x) => {
      const plateforme = Object.keys(x.parNavigateur || {}).find((k) => ['ios', 'android', 'web'].includes(k)) || '';
      const fields = { etat: S(x.etatReel), defautConnu: B(x.defautConnu === true) };
      if (x.le && ['vert', 'rouge', 'instable'].includes(x.etatReel)) fields.dernier = M({ le: T(new Date(x.le)), resultat: S(x.etatReel), plateforme: S(plateforme), execution: S('etat-reel') });
      await fetch(`${bdd(`projets/${P}/${col}/${x.ref}`)}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}&currentDocument.exists=true`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
    };
    for (const x of reel.parcours || []) await poserEtat('parcours', x);
    for (const x of reel.regles || []) await poserEtat('regles', x);
    const imp = importer([P, path.join(REEL, 'sections'), '--vrai']);
    verifier(imp.code === 0 && /46 sections versées/.test(imp.sortie), 'les 46 sections de la concordance sont versées, leurs tests robot tous connus', imp.sortie.slice(-400));
    const fichiers = fs.readdirSync(path.join(REEL, 'sections')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(REEL, 'sections', f), 'utf8')));
    const robotsDuPlan = fichiers.flatMap((x) => Object.values(x.aspects).flat()).filter((x) => x.qui === 'robot' || x.qui === 'les-deux');
    const rattaches = new Set(robotsDuPlan.flatMap((x) => x.parcours || []));
    const tous = ((((await lire(`projets/${P}/parcours?pageSize=500`)) || {}).documents) || []).filter((d) => champ(d, 'actif').booleanValue !== false).map((d) => d.name.split('/').pop());
    const horsAttendu = tous.filter((r) => !rattaches.has(r)).sort();

    const vueC = await ouvrir('dark');
    await connecter(vueC, 'agent.essai@exemple.test');
    await allerRobots(vueC);
    await attendre(async () => (await vueC.$$('.tb-groupe')).length > 0, 40, 500);
    await pause(1500);
    const rr = await releve(vueC);
    const cartes = rr.cartes.filter((c) => c.groupe && c.groupe !== 'autres');
    verifier(cartes.length === 46, 'les 46 sections font les 46 cartes', String(cartes.length));
    verifier(cartes.flatMap((c) => c.cases).length === robotsDuPlan.length, `une case par scénario robot ou humain et robot (${robotsDuPlan.length})`, String(cartes.flatMap((c) => c.cases).length));
    const horsVu = ((rr.cartes.find((c) => c.nom === 'Hors plan') || { cases: [] }).cases.map((c) => c.cle)).sort();
    verifier(horsVu.join(',') === horsAttendu.join(','), `« Hors plan » : les ${horsAttendu.length} parcours rattachés à aucun scénario robot`, `${horsVu.length} vus : ${horsVu.join(' ')}`);
    verifier(rr.legende.some(([e]) => e === 'connu'), 'les rouges sur un défaut connu se comptent en « défaut connu »', JSON.stringify(rr.legende));
    console.log(`  info   ${rr.meta.replace(/<[^>]+>/g, '')}`);
    console.log(`  info   légende : ${rr.legende.map(([e, n]) => `${e} ${n}`).join(', ')}`);
    await theme(vueC, 'dark');
  await vueC.screenshot({ path: path.join(CAPTURES, 'grille-reelle-cockpit-sombre.png'), fullPage: true });
    const vueH = await ouvrir('light');
    await connecter(vueH, 'camille.essai@exemple.test');
    await allerRobots(vueH);
    await attendre(async () => (await vueH.$$('.tb-groupe')).length > 0, 40, 500);
    await pause(1500);
    const rh = await releve(vueH);
    verifier(JSON.stringify(casesPlan(rh)) === JSON.stringify(casesPlan(rr)), 'le client voit la même grille réelle');
    await theme(vueH, 'light');
  await vueH.screenshot({ path: path.join(CAPTURES, 'grille-reelle-client-clair.png'), fullPage: true });
    console.log(`  info   captures : ${path.join(CAPTURES, 'grille-reelle-cockpit-sombre.png')}, ${path.join(CAPTURES, 'grille-reelle-client-clair.png')}`);
  }
  await nav.close();

  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  if (erreurs.length) console.log('  ÉCART  erreurs JavaScript dans la page');
  process.exit(ecarts.length || erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
