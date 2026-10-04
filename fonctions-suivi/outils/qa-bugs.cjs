require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les bugs des tests, montrés et signalés

   Règle de Nadir du 04/10/2026 : tout bug trouvé par les tests se voit au
   Cockpit ET au Hub du client, avec un statut visible (« À confirmer »
   tant que l'équipe n'a pas tranché, puis « Confirmé », « Fausse alerte »,
   « À revérifier », et l'état de la correction : ticket ouvert, corrigé).
   Ce que prouve cette suite :

   1. l'outil d'import (bugs-importer.mjs, sur l'émulateur) : à blanc il
      n'écrit rien ; un texte client technique, une faille de sécurité, un
      bug sans texte écrit pour le client restent dehors ; --vrai sauvegarde,
      écrit le problème et sa note interne à part, relit ; relancé, il ne
      crée aucun doublon ; un statut et une gravité posés au Cockpit
      survivent à l'import suivant, un texte que personne n'a touché suit
      la source ; --annuler remet la base comme avant ;
   2. les règles : le client lit le problème, jamais la note interne, et ne
      change pas un statut ; l'équipe lit et écrit les deux ;
   3. le Cockpit : l'onglet Problèmes, rangé par gravité puis date, les
      filtres (gravité, plateforme, statut, section), la fiche avec la note
      interne (fichier, ligne), « Confirmer », « Fausse alerte »,
      « À revérifier », « Créer un ticket » de bout en bout, la case de test
      ouverte depuis la fiche, et le problème dans la fiche de la case ; les
      relevés des robots ne se mêlent pas aux campagnes ;
   4. le Hub : la même liste, le statut écrit, « À confirmer » expliqué en
      une phrase, aucune piste technique, aucun chemin, aucun nom d'outil,
      ni note ni bouton de décision, « Voir le ticket », la case de test ;
      rien ne déborde à 390 px ;
   5. aucune erreur de page, ni « undefined », ni tiret cadratin.

   Banc : émulateurs, site local, semer-suivi (Alex administrateur, Camille
   cliente d'« atelier »).
     node fonctions-suivi/outils/qa-bugs.cjs
   Captures : $CAPTURES_BUGS (sinon le dossier temporaire).
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d';
const SITE = BANC.site;
const P = 'atelier';
const ADMIN = 'agent.essai@exemple.test';
const CLIENT = 'camille.essai@exemple.test';
const CAPTURES = process.env.CAPTURES_BUGS || fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bugs-captures-'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(`${c}${c.includes('?') ? '&' : '?'}pageSize=300`)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(col)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) }); const N = (v) => ({ integerValue: String(v) });
const T = (d) => ({ timestampValue: d.toISOString() }); const L = (xs) => ({ arrayValue: { values: xs } }); const M = (o) => ({ mapValue: { fields: o } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const js = (v) => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(js);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, js(x)]));
  return v;
};
const objet = (d) => (d && d.fields ? Object.fromEntries(Object.entries(d.fields).map(([k, x]) => [k, js(x)])) : null);
const lireObjet = async (c) => objet(await lire(c));
const champ = (d, k) => (((d || {}).fields || {})[k]) || {};
const idDe = (d) => (d && d.name ? d.name.split('/').pop() : '');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };

/* Ce qu'un client ne doit jamais lire : la piste, un chemin, un outil. */
const TECHNIQUE = /src\/|\.tsx?\b|\/Users\/|~\/|Playwright|Maestro|émulateur|Firestore|Firebase|Note interne|Piste|QB-BUG|robot-QB/;
/* La fiche d'une case de test nomme l'outil du test (voulu par Nadir le
   01/10) : on n'y cherche que la piste et la note. */
const TECHNIQUE_CASE = /src\/|\.tsx?:\d|\/Users\/|Note interne|Piste|QB-BUG/;

/* --------------------------------------------------------------------------
   Le semis : deux sections de plan, deux tests robot, et la source des bugs
   -------------------------------------------------------------------------- */

const sc = (id, qui, plateformes, parcours, titre) => ({ id, titre, etapes: `Ouvrir l'application.\nFaire ${titre}.`, attendu: `${titre} marche.`, plateformes, type: 'normal', priorite: 'haute', refs: [], qui, parcours });
const SECTIONS = [
  { id: 'qb-taches', groupe: 'fonctionnalites', ordre: 1, titre: 'Tâches du banc', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [sc('qb-taches-f-001', 'robot', ['web'], ['QB-WEB'], 'Ouvrir la page Tâches'), sc('qb-taches-f-002', 'les-deux', ['ios', 'web'], ['QB-WEB'], 'Créer une tâche')],
    technique: [], ux: [], securite: [] } },
  { id: 'qb-connexion', groupe: 'demarrage', ordre: 2, titre: 'Connexion du banc', resume: 'Se connecter.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [sc('qb-connexion-f-001', 'robot', ['ios', 'android'], ['QB-IOS', 'QB-WEB'], 'Se connecter sur téléphone')],
    technique: [], ux: [], securite: [sc('qb-connexion-s-001', 'robot', ['ios'], ['QB-IOS'], 'Garder la session')] } },
];
const constat = (plateforme, section, piste, extra = {}) => ({ section, plateforme, titre: 'technique', gravite: 'mineur', reproduction: 'Ouvrir /tasks avec users/{uid}.', attendu: 'ok', obtenu: 'TypeError: x.toLowerCase', preuve: '/Users/izicode/ForgeMe-tests/web/rapport.json', piste, ...extra });
const BUGS = (titre01 = 'Titre technique 01', gravite01 = 'bloquant') => ({ genere: new Date().toISOString(), bugs: [
  { id: 'QB-BUG-01', titre: titre01, gravite: gravite01, plateformes: ['web'], sections: ['qb-taches'], scenarios: ['qb-taches-f-001'], constats: [constat('web', 'qb-taches', 'src/pages/tasks.tsx:42 (filtre sans garde)')], decision: 'à trancher par Nadir' },
  { id: 'QB-BUG-02', titre: 'Titre technique 02', gravite: 'majeur', plateformes: ['ios', 'android'], sections: ['qb-connexion'], scenarios: ['qb-connexion-f-001'], constats: [constat('ios', 'qb-connexion', 'src/App.tsx:329'), constat('android', 'qb-connexion', 'src/App.tsx:338')], decision: 'à trancher par Nadir' },
  { id: 'QB-BUG-03', titre: 'Titre technique 03', gravite: 'mineur', plateformes: ['web'], sections: ['qb-taches'], scenarios: ['qb-taches-f-002'], constats: [constat('web', 'qb-taches', 'src/pages/tasks.tsx:7')], decision: 'à trancher par Nadir' },
  { id: 'QB-BUG-04', titre: 'Faille', gravite: 'majeur', plateformes: ['ios'], sections: ['qb-connexion'], scenarios: ['qb-connexion-s-001'], constats: [constat('ios', 'qb-connexion', 'firestore.rules:12')], decision: 'à trancher par Nadir' },
  { id: 'QB-BUG-05', titre: 'Sans texte pour le client', gravite: 'mineur', plateformes: ['web'], sections: ['qb-taches'], scenarios: ['qb-taches-f-001'], constats: [constat('web', 'qb-taches', 'src/x.ts:1')], decision: 'à trancher par Nadir' },
] });
const CLAIR = (titre01 = 'La page Tâches ne s\'ouvre plus', texte03 = 'Le bouton Ajouter ne réagit pas.') => ({
  'QB-BUG-01': { titre: titre01, etapes: 'Sur le site, ouvrir la page Tâches.', attendu: 'La liste des tâches s\'affiche.', obtenu: 'Un écran d\'erreur s\'affiche à la place de la liste.' },
  'QB-BUG-02': { titre: 'La connexion reste bloquée sur téléphone', etapes: 'Sur iPhone ou Android, se connecter avec un compte existant.', attendu: 'L\'accueil s\'ouvre.', obtenu: 'L\'écran de connexion reste affiché sans message.' },
  'QB-BUG-03': { titre: 'Créer une tâche : le bouton Ajouter ne réagit pas', etapes: 'Sur le site, ouvrir la page Tâches et toucher Ajouter.', attendu: 'Le formulaire s\'ouvre.', obtenu: texte03 },
  'QB-BUG-04': { titre: 'La session reste ouverte trop longtemps', etapes: 'Sur iPhone, se connecter puis attendre.', attendu: 'La session se ferme.', obtenu: 'La session reste ouverte.' },
});

const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bugs-'));
const F_BUGS = path.join(DOSSIER, 'bugs.json');
const F_CLAIR = path.join(DOSSIER, 'bugs-en-clair.json');
const F_SORTIE = path.join(DOSSIER, 'bilan.json');
const D_SAUV = path.join(DOSSIER, 'sauvegardes');
const ecrireSource = (bugs, clair) => { fs.writeFileSync(F_BUGS, JSON.stringify(bugs, null, 1)); fs.writeFileSync(F_CLAIR, JSON.stringify(clair, null, 1)); };
const importer = (...args) => {
  try {
    const sortie = execFileSync(process.execPath, [path.join(__dirname, 'bugs-importer.mjs'), '--emulateur', `--projet=${P}`, `--bugs=${F_BUGS}`, `--clair=${F_CLAIR}`, `--sortie=${F_SORTIE}`, `--sauvegardes=${D_SAUV}`, ...args],
      { encoding: 'utf8', env: { ...process.env, GCLOUD_PROJECT: PROJET }, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, sortie };
  } catch (e) { return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` }; }
};
const robots = async () => (await docs(`projets/${P}/anomalies`)).filter((d) => idDe(d).startsWith('robot-'));

/* --------------------------------------------------------------------------
   Le navigateur
   -------------------------------------------------------------------------- */

const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const pour = (await docs('envois')).filter((d) => JSON.stringify((d.fields || {}).a || {}).includes(email));
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
const aller = async (page, hash, sel) => {
  for (let i = 0; i < 8; i += 1) {
    await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, hash);
    if (await page.waitForSelector(sel, { timeout: 4000 }).then(() => true).catch(() => false)) return true;
  }
  return false;
};
/* La liste des problèmes, telle qu'on la lit. */
const liste = (page) => page.evaluate(() => [...document.querySelectorAll('#problemes [data-probleme]')].map((l) => {
  const ligne = l.closest('.ligne') || l;
  return { id: l.dataset.id, texte: ligne.innerText.replace(/\s+/g, ' ').trim(), pastilles: [...ligne.querySelectorAll('.pastille')].map((p) => p.textContent.trim()) };
}));
const ouvrirFiche = async (page, id) => {
  await page.click(`#problemes [data-probleme][data-id="${id}"]`);
  await page.waitForSelector('.voile .feuille', { timeout: 8000 }).catch(() => {});
  await pause(900);
  return page.evaluate(() => { const v = [...document.querySelectorAll('.voile')].pop(); return v ? v.innerText : ''; });
};
/* Une capture lisible : la liste en haut de l'écran, sans les toasts. */
const capturer = async (page, nom, liste = true) => {
  await page.evaluate((l) => { document.querySelectorAll('.toasts').forEach((t) => t.remove()); if (l) { const x = document.querySelector('#problemes'); if (x) x.scrollIntoView({ block: 'start' }); } }, liste);
  await pause(400);
  await page.screenshot({ path: path.join(CAPTURES, nom) });
};
const fermerFiche = async (page) => { await page.click('.voile [data-fermer]').catch(() => {}); await pause(700); };
const filtrer = async (page, nom, valeur) => {
  await page.selectOption(`[data-filtre-probleme="${nom}"]`, valeur);
  await pause(1300);
};

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (largeur = 1440) => {
    const ctx = await nav.newContext({ viewport: { width: largeur, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`PAGE: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
    return page;
  };

  console.log('\n== Semis : le plan et ses tests robot');
  await vider(`projets/${P}/planTests`);
  for (const [ref, titre, plateformes, etat] of [['QB-WEB', 'Tâches sur le site', ['web'], 'rouge'], ['QB-IOS', 'Connexion sur téléphone', ['ios', 'android'], 'rouge']]) {
    await poser(`projets/${P}/parcours/${ref}`, {
      ref: S(ref), titre: S(titre), outil: S(ref === 'QB-WEB' ? 'playwright' : 'maestro'), plateformes: L(plateformes.map(S)), scenarios: L([]), etat: S(etat),
      actif: B(true), ordre: N(9100), mutation: B(false), note: S(''), fichier: S(''),
      dernier: M({ le: T(new Date(Date.now() - 3600000)), resultat: S(etat), plateforme: S(plateformes[0]), execution: S('qa-bugs') }),
    });
  }
  const dossierPlan = path.join(DOSSIER, 'plan');
  fs.mkdirSync(dossierPlan);
  SECTIONS.forEach((s) => fs.writeFileSync(path.join(dossierPlan, `${s.id}.json`), JSON.stringify(s, null, 2)));
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'plan-tests-importer.mjs'), P, dossierPlan, '--vrai'], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { console.log(`    [plan] ${(e.stdout || '').slice(-400)} ${(e.stderr || '').slice(-400)}`); }
  verifier((await docs(`projets/${P}/planTests`)).filter((d) => ['qb-taches', 'qb-connexion'].includes(idDe(d))).length === 2, 'le plan du banc est versé (deux sections)');
  for (const d of await robots()) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop });
  for (let i = 1; i <= 5; i += 1) await fetch(bdd(`projets/${P}/anomalies/robot-QB-BUG-0${i}/equipe/note`), { method: 'DELETE', headers: prop });
  /* Un ticket d'un passage précédent, né d'un de ces problèmes, fausserait
     « Créer un ticket » : on repart sans. */
  for (const d of await docs('tickets')) if (/^robot-QB/.test(js(champ(d, 'anomalie')) || '')) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop });

  console.log('\n== 1. L\'outil d\'import');
  ecrireSource(BUGS(), CLAIR('La page Tâches ne s\'ouvre plus', 'Le test Playwright voit un écran blanc.'));
  {
    const r = importer();
    const bilan = JSON.parse(fs.readFileSync(F_SORTIE, 'utf8'));
    verifier(r.code === 0 && /À BLANC/.test(r.sortie), 'à blanc par défaut', r.sortie.slice(-300));
    verifier((await robots()).length === 0, 'à blanc, rien n\'est écrit');
    verifier(bilan.verses.total === 2 && bilan.verses.aCreer === 2, 'deux bugs à verser', JSON.stringify(bilan.verses));
    const retenu = (id) => (bilan.retenus.find((x) => x.id === id) || { pourquoi: [] }).pourquoi.join(' ');
    verifier(/reprendre/.test(retenu('QB-BUG-03')) && /Playwright|playwright/.test(JSON.stringify((bilan.retenus.find((x) => x.id === 'QB-BUG-03') || {}).defauts)), 'un texte client qui nomme un outil de test reste dehors', retenu('QB-BUG-03'));
    verifier(/sécurité/.test(retenu('QB-BUG-04')), 'une faille de sécurité reste dehors sans la décision de Nadir', retenu('QB-BUG-04'));
    verifier(/à écrire/.test(retenu('QB-BUG-05')), 'un bug sans texte écrit pour le client reste dehors', retenu('QB-BUG-05'));
    verifier(bilan.verses.parGraviteHub.critique === 1 && bilan.verses.parGraviteHub.bloquant === 1, '« majeur » devient « critique », l\'échelle du Hub', JSON.stringify(bilan.verses.parGraviteHub));
  }
  {
    const r = importer('--vrai');
    verifier(r.code === 0 && /Relecture : 2\/2 présents, aucun écart/.test(r.sortie), '--vrai écrit puis relit sans écart', r.sortie.slice(-400));
    const sauv = fs.existsSync(D_SAUV) ? fs.readdirSync(D_SAUV) : [];
    verifier(sauv.length === 1, 'une sauvegarde est prise avant d\'écrire', sauv.join(','));
    const a = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01`);
    verifier(a && a.origine === 'robot' && a.statut === 'nouvelle' && a.gravite === 'bloquant' && a.titre === 'La page Tâches ne s\'ouvre plus', 'le problème est versé : origine robot, « À confirmer », son titre pour le client', JSON.stringify(a || {}).slice(0, 300));
    verifier(a && a.scenario === '' && (a.scenarios || []).join() === 'qb-taches-f-001' && (a.sections || []).join() === 'qb-taches', 'rattaché à sa case du plan, pas au verdict des testeurs', JSON.stringify({ s: a && a.scenario, ss: a && a.scenarios }));
    verifier(a && !TECHNIQUE.test(JSON.stringify({ t: a.titre, e: a.etapes, at: a.attendu, o: a.obtenu })) && !('piste' in a) && !('constats' in a), 'le document lu par le client ne porte aucune piste technique');
    const n = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01/equipe/note`);
    verifier(n && n.source === 'QB-BUG-01' && /tasks\.tsx:42/.test(JSON.stringify(n.constats)), 'la piste (fichier:ligne) est dans la note interne, à part');
    const b = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-02`);
    verifier(b && b.gravite === 'critique' && (b.plateformes || []).join() === 'ios,android', 'le second : critique, iPhone et Android');
  }
  {
    const r = importer('--vrai');
    verifier(r.code === 0 && /Rien à écrire/.test(r.sortie) && (await robots()).length === 2, 'relancé, il ne crée aucun doublon et n\'écrit rien', r.sortie.slice(-200));
  }
  /* Nadir tranche au Cockpit : confirmé, gravité ramenée à mineur. */
  await poser(`projets/${P}/anomalies/robot-QB-BUG-01`, { statut: S('confirmee'), gravite: S('mineur') }, ['statut', 'gravite']);
  await poser(`projets/${P}/anomalies/robot-QB-BUG-01/equipe/note`, { texte: S('Reproduit sur Chrome.') }, ['texte']);
  ecrireSource(BUGS('Titre technique 01 bis', 'majeur'), CLAIR('La page Tâches reste vide', 'Le bouton Ajouter ne réagit pas.'));
  {
    const r = importer('--vrai');
    const a = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01`);
    verifier(a && a.statut === 'confirmee', 'le statut posé par Nadir survit à l\'import suivant', a && a.statut);
    verifier(a && a.gravite === 'mineur', 'la gravité changée au Cockpit n\'est pas réécrite', a && a.gravite);
    verifier(/gravite/.test(r.sortie) && /gardés/.test(r.sortie), 'le bilan dit quel champ il a gardé', r.sortie.slice(-500));
    verifier(a && a.titre === 'La page Tâches reste vide', 'un texte que personne n\'a touché suit la source', a && a.titre);
    const n = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01/equipe/note`);
    verifier(n && n.texte === 'Reproduit sur Chrome.' && n.graviteSource === 'majeur', 'la note libre de l\'équipe reste, la note versée suit la source');
    const tous = await robots();
    verifier(tous.length === 3 && tous.some((d) => idDe(d) === 'robot-QB-BUG-03'), 'le texte corrigé, le bug retenu entre à son tour, sans doublon', tous.map(idDe).join(','));
  }
  {
    const r = importer('--annuler');
    const a = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01`);
    verifier(r.code === 0 && !(await lire(`projets/${P}/anomalies/robot-QB-BUG-03`)) && a && a.titre === 'La page Tâches ne s\'ouvre plus' && a.statut === 'confirmee', '--annuler retire ce que l\'import a créé et remet le reste comme avant', r.sortie.slice(-200));
    const r2 = importer('--vrai');
    verifier(r2.code === 0 && (await robots()).length === 3, 'et l\'import se rejoue ensuite');
  }

  console.log('\n== 2. Les règles');
  {
    const jC = await jetonPour(CLIENT);
    const jA = await jetonPour(ADMIN);
    const avec = (j) => ({ Authorization: `Bearer ${j}` });
    const note = bdd(`projets/${P}/anomalies/robot-QB-BUG-01/equipe/note`);
    verifier((await fetch(bdd(`projets/${P}/anomalies/robot-QB-BUG-01`), { headers: avec(jC) })).status === 200, 'la cliente lit le problème et son statut');
    verifier((await fetch(note, { headers: avec(jC) })).status === 403, 'la cliente ne lit pas la note interne');
    const patch = await fetch(`${bdd(`projets/${P}/anomalies/robot-QB-BUG-01`)}?updateMask.fieldPaths=statut`, { method: 'PATCH', headers: { ...avec(jC), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { statut: S('sans-suite') } }) });
    verifier(patch.status === 403 && (await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-01`)).statut === 'confirmee', 'la cliente ne change pas un statut', String(patch.status));
    verifier((await fetch(note, { headers: avec(jA) })).status === 200, 'l\'équipe lit la note interne');
  }

  console.log('\n== 3. Le Cockpit');
  /* Une date différente pour chacun : la liste les range par gravité, puis
     du plus récent au plus ancien. */
  /* 03 est le plus récent mais mineur : il vient en dernier ; 01 et 02,
     critiques tous deux, se rangent du plus récent au plus ancien. */
  await poser(`projets/${P}/anomalies/robot-QB-BUG-02`, { cree: T(new Date(Date.now() - 2 * 86400000)) }, ['cree']);
  await poser(`projets/${P}/anomalies/robot-QB-BUG-03`, { cree: T(new Date(Date.now() - 3600000)), statut: S('nouvelle') }, ['cree', 'statut']);
  await poser(`projets/${P}/anomalies/robot-QB-BUG-01`, { cree: T(new Date(Date.now() - 86400000)), gravite: S('critique') }, ['cree', 'gravite']);
  const page = await ouvrir();
  await connecter(page, ADMIN);
  verifier(await aller(page, `#/tests?projet=${P}&onglet=problemes`, '#problemes [data-probleme]'), 'l\'onglet Problèmes s\'ouvre sur la liste');
  {
    const l = (await liste(page)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.map((x) => x.id).join() === 'robot-QB-BUG-01,robot-QB-BUG-02,robot-QB-BUG-03', 'rangés par gravité, puis du plus récent au plus ancien', l.map((x) => x.id).join());
    verifier(l[0] && l[0].pastilles.includes('Critique') && l[0].pastilles.includes('Confirmé'), 'chaque ligne dit sa gravité et son statut', l[0] && l[0].pastilles.join('|'));
    verifier(l[2] && l[2].pastilles.includes('À confirmer') && /Tests automatiques/.test(l[2].texte) && /Tâches du banc/.test(l[2].texte), 'un relevé des robots : « À confirmer », son origine et sa section en clair', l[2] && l[2].texte);
    const tete = await page.evaluate(() => (document.querySelector('#problemes') || {}).innerText || '');
    verifier(/À confirmer : relevé par les tests automatiques, en cours de vérification par l'équipe\./.test(tete.replace(/\s+/g, ' ')), '« À confirmer » expliqué en une phrase en tête de liste');
    const onglet = await page.evaluate(() => ((document.querySelector('[data-onglet="problemes"] .badge') || {}).textContent || '').trim());
    verifier(Number(onglet) >= 3, 'l\'onglet compte les problèmes ouverts', onglet);
  }
  await capturer(page, 'cockpit-liste.png');
  {
    await filtrer(page, 'gravite', 'mineur');
    let l = (await liste(page)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.map((x) => x.id).join() === 'robot-QB-BUG-03' && /gravite=mineur/.test(await page.evaluate(() => location.hash)), 'filtre gravité : les mineurs seuls, gardé dans l\'adresse', l.map((x) => x.id).join());
    await filtrer(page, 'gravite', '');
    await filtrer(page, 'statut', 'confirmee');
    l = (await liste(page)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.map((x) => x.id).join() === 'robot-QB-BUG-01', 'filtre statut : les confirmés seuls', l.map((x) => x.id).join());
    await filtrer(page, 'statut', '');
    await filtrer(page, 'section', 'qb-connexion');
    l = (await liste(page)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.map((x) => x.id).join() === 'robot-QB-BUG-02', 'filtre section : la connexion seule', l.map((x) => x.id).join());
    await filtrer(page, 'section', '');
    await filtrer(page, 'plateforme', 'ios');
    l = (await liste(page)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.map((x) => x.id).join() === 'robot-QB-BUG-02', 'filtre plateforme : iPhone seul', l.map((x) => x.id).join());
    await filtrer(page, 'plateforme', '');
  }
  {
    const f = await ouvrirFiche(page, 'robot-QB-BUG-03');
    await attendre(() => page.evaluate(() => /src\/pages/.test(((document.querySelector('[data-note-interne]') || {}).innerText) || '')), 20, 300);
    const note = await page.evaluate(() => ((document.querySelector('[data-note-interne]') || {}).innerText) || '');
    verifier(/Ce qui se passe/.test(f) && /Ce qui devrait se passer/.test(f) && /Pour le voir/.test(f), 'la fiche : ce qui se passe, ce qui devrait se passer, pour le voir');
    verifier(/Note interne/.test(note) && /src\/pages\/tasks\.tsx:7/.test(note), 'la note interne porte la piste (fichier:ligne), pour l\'équipe', note.slice(0, 200));
    verifier(/À confirmer : relevé par les tests automatiques/.test(f.replace(/\s+/g, ' ')), 'la fiche dit ce que veut dire « À confirmer »');
    await capturer(page, 'cockpit-fiche.png', false);
    await page.click('.voile [data-statut-anomalie="a-reverifier"]');
    verifier(await attendre(async () => (await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-03`)).statut === 'a-reverifier'), '« À revérifier » change le statut en base');
    await pause(900);
    await ouvrirFiche(page, 'robot-QB-BUG-03');
    await page.click('.voile [data-statut-anomalie="sans-suite"]');
    verifier(await attendre(async () => (await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-03`)).statut === 'sans-suite'), '« Fausse alerte » aussi');
    await pause(900);
    await ouvrirFiche(page, 'robot-QB-BUG-03');
    await page.click('.voile [data-statut-anomalie="confirmee"]');
    verifier(await attendre(async () => (await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-03`)).statut === 'confirmee'), '« Confirmer » aussi');
    await pause(1200);
    const l = (await liste(page)).find((x) => x.id === 'robot-QB-BUG-03');
    verifier(l && l.pastilles.includes('Confirmé'), 'et la liste suit, sans recharger', l && l.pastilles.join('|'));
  }
  {
    await ouvrirFiche(page, 'robot-QB-BUG-02');
    await attendre(() => page.evaluate(() => /App\.tsx/.test(((document.querySelector('[data-note-interne]') || {}).innerText) || '')), 20, 300);
    await page.click('.voile [data-creer-ticket]');
    const a = await attendre(async () => { const x = await lireObjet(`projets/${P}/anomalies/robot-QB-BUG-02`); return x && x.ticket ? x : null; });
    verifier(Boolean(a), '« Créer un ticket » relie le ticket au problème');
    const t = a ? await lireObjet(`tickets/${a.ticket}`) : null;
    verifier(t && t.type === 'bug' && t.urgence === 'critique' && t.anomalie === 'robot-QB-BUG-02' && t.titre === 'La connexion reste bloquée sur téléphone', 'le ticket : un bug critique, le titre écrit pour le client', JSON.stringify(t || {}).slice(0, 300));
    verifier(t && !TECHNIQUE.test(`${t.titre} ${t.description} ${t.etapes} ${t.attendu} ${t.obtenu}`), 'rien de technique dans ce que le client lira du ticket');
    const msgs = a ? (await docs(`tickets/${a.ticket}/messages`)).map(objet) : [];
    verifier(msgs.some((m) => m.interne === true && /App\.tsx:329/.test(m.texte)), 'la piste part en message interne du ticket', JSON.stringify(msgs).slice(0, 200));
    await pause(1500);
    verifier(/\/demandes\//.test(await page.evaluate(() => location.hash)), 'et la page mène au ticket');
  }
  {
    await aller(page, `#/tests?projet=${P}&onglet=problemes`, '#problemes [data-probleme]');
    await pause(800);
    const l = (await liste(page)).find((x) => x.id === 'robot-QB-BUG-02');
    verifier(l && l.pastilles.includes('Ticket ouvert'), 'la ligne dit « Ticket ouvert »', l && l.pastilles.join('|'));
    await ouvrirFiche(page, 'robot-QB-BUG-01');
    await page.click('.voile [data-voir-case="qb-taches-f-001"]');
    await page.waitForSelector('.modale--scenario', { timeout: 10000 }).catch(() => {});
    await pause(900);
    const caseTexte = await page.evaluate(() => ((document.querySelector('.modale--scenario') || {}).innerText) || '');
    verifier(/Ouvrir la page Tâches|Tâches sur le site/.test(caseTexte) && /La page Tâches reste vide/.test(caseTexte), 'la fiche mène à la case de test, qui montre le problème relevé', caseTexte.slice(0, 300));
    await capturer(page, 'cockpit-case.png', false);
    const voir = await page.$('.modale--scenario [data-ouvrir-probleme="robot-QB-BUG-01"]');
    if (voir) { await voir.click(); await pause(1100); }
    const retour = await page.evaluate(() => { const v = [...document.querySelectorAll('.voile')].pop(); return v ? v.innerText : ''; });
    verifier(Boolean(voir) && /La page Tâches reste vide/.test(retour) && /Note interne/.test(retour), 'et de la case on revient à la fiche du problème');
    await fermerFiche(page);
    /* Une case à deux tests robot : la fiche du scénario (et non celle du
       test) montre aussi le problème. */
    await ouvrirFiche(page, 'robot-QB-BUG-02');
    await page.click('.voile [data-voir-case="qb-connexion-f-001"]');
    await page.waitForSelector('.modale--scenario', { timeout: 10000 }).catch(() => {});
    await pause(900);
    const plan = await page.evaluate(() => ((document.querySelector('.modale--scenario') || {}).innerText) || '');
    verifier(/Se connecter sur téléphone/.test(plan) && /Les tests robot/i.test(plan) && /La connexion reste bloquée sur téléphone/.test(plan), 'la fiche d\'un scénario à plusieurs tests montre le problème relevé', plan.slice(0, 300));
    await page.click('.modale--scenario [data-fermer]').catch(() => {});
    await pause(700);
    await aller(page, `#/tests?projet=${P}`, '#anomalies');
    const humains = await page.evaluate(() => ((document.querySelector('#anomalies') || {}).innerHTML) || '');
    verifier(!/robot-QB/.test(humains), 'les relevés des robots ne se mêlent pas aux problèmes des campagnes');
  }

  console.log('\n== 4. Le Hub du client');
  const hub = await ouvrir();
  await connecter(hub, CLIENT);
  verifier(await aller(hub, `#/tests?projet=${P}&onglet=problemes`, '#problemes [data-probleme]'), 'la cliente ouvre l\'onglet Problèmes');
  {
    const l = (await liste(hub)).filter((x) => x.id.startsWith('robot-QB'));
    verifier(l.length === 3, 'elle voit les trois problèmes, confirmés ou non', l.map((x) => x.id).join());
    verifier(l.some((x) => x.pastilles.includes('Confirmé')) && l.some((x) => x.pastilles.includes('Ticket ouvert')), 'avec leur statut et l\'état de la correction', JSON.stringify(l.map((x) => x.pastilles)));
    const tout = await hub.evaluate(() => (document.querySelector('#problemes') || {}).innerText || '');
    verifier(/À confirmer : relevé par les tests automatiques, en cours de vérification par l'équipe\./.test(tout.replace(/\s+/g, ' ')), '« À confirmer » expliqué en une phrase');
    verifier(!TECHNIQUE.test(tout), 'aucune piste, aucun chemin, aucun nom d\'outil sur la page', (tout.match(TECHNIQUE) || [''])[0]);
    verifier(!/undefined|\bnull\b|—/.test(tout), 'ni « undefined », ni « null », ni tiret cadratin');
  }
  await capturer(hub, 'hub-liste.png');
  {
    await poser(`projets/${P}/anomalies/robot-QB-BUG-01`, { statut: S('nouvelle') }, ['statut']);
    await pause(1500);
    const f = await ouvrirFiche(hub, 'robot-QB-BUG-01');
    verifier(/À confirmer : relevé par les tests automatiques, en cours de vérification par l'équipe\./.test(f.replace(/\s+/g, ' ')), 'la fiche dit « À confirmer » et ce que cela veut dire');
    verifier(!TECHNIQUE.test(f) && !(await hub.$('.voile [data-note-interne]')) && !(await hub.$('.voile [data-statut-anomalie]')) && !(await hub.$('.voile [data-creer-ticket]')), 'ni note interne, ni piste, ni bouton de décision', (f.match(TECHNIQUE) || [''])[0]);
    verifier(Boolean(await hub.$('.voile [data-voir-case="qb-taches-f-001"]')), 'la case de test concernée est proposée');
    await capturer(hub, 'hub-fiche.png', false);
    await hub.click('.voile [data-voir-case="qb-taches-f-001"]');
    await hub.waitForSelector('.modale--scenario', { timeout: 10000 }).catch(() => {});
    await pause(800);
    const c = await hub.evaluate(() => ((document.querySelector('.modale--scenario') || {}).innerText) || '');
    verifier(/La page Tâches reste vide/.test(c) && !TECHNIQUE_CASE.test(c), 'elle ouvre la case, qui montre le problème, en clair', (c.match(TECHNIQUE_CASE) || [''])[0]);
    await hub.click('.modale--scenario [data-fermer]').catch(() => {});
    await pause(700);
    const g = await ouvrirFiche(hub, 'robot-QB-BUG-02');
    verifier(/Voir le ticket/.test(g) && /Ticket ouvert/.test(g), 'un problème qui a son ticket mène à lui');
    await fermerFiche(hub);
  }
  {
    const tel = await ouvrir(390);
    await connecter(tel, CLIENT);
    await aller(tel, `#/tests?projet=${P}&onglet=problemes`, '#problemes [data-probleme]');
    await pause(800);
    const deborde = await tel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'rien ne déborde à 390 px');
    await capturer(tel, 'hub-telephone.png');
    const ligneTel = await tel.$('#problemes [data-probleme]');
    if (ligneTel) { await ligneTel.click(); await pause(1200); await capturer(tel, 'hub-telephone-fiche.png', false); }
  }

  console.log('\n== 5. Les erreurs de page');
  verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 4).join(' | '));

  await nav.close();
  console.log(`\nCaptures : ${CAPTURES}`);
  console.log(`\n${ok} contrôles passés, ${ecarts.length} ÉCART(S)${ecarts.length ? ` :\n  - ${ecarts.join('\n  - ')}` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
