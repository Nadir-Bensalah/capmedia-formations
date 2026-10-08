#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les bugs des tests ForgeMe, dans le Cockpit et le Hub

   Règle de Nadir du 04/10/2026 : tout bug trouvé par les tests se montre
   des deux côtés, avec son statut ; ce qui n'est pas confirmé est signalé
   « À confirmer ». Ce script verse ~/ForgeMe-tests/cartes/bugs.json (bugs
   des cartes, fusionnés et dédoublonnés, identifiants stables) dans la
   collection des anomalies du projet, origine « robot » :

     projets/{projet}/anomalies/robot-<id>              ce que lit le client
     projets/{projet}/anomalies/robot-<id>/equipe/note  la piste technique,
                                                        lue par l'équipe seule

   Les textes du client viennent de bugs-en-clair.json (titre, étapes,
   attendu, obtenu, écrits et relus pour lui), et passent en plus la
   relecture de controleTexteClient : aucun chemin de fichier, aucun nom
   d'outil ni d'IA, aucune adresse, aucun nom de compte d'essai, aucun
   tiret cadratin. Un bug sans texte écrit pour le client, ou dont un texte
   échoue, n'est PAS versé : le bilan le dit, avec une proposition tirée du
   bug à reprendre dans bugs-en-clair.json.

   Une faille possible (scénario « -s- » ou section Sécurité du plan) n'est
   versée que si bugs-en-clair.json porte "montrer": true pour elle : Nadir
   tranche au cas par cas (mémoire bugs-visibles-signales).

   IDEMPOTENT, relançable après chaque carte : un bug déjà versé n'est pas
   recréé. Le statut, le ticket et la note libre de l'équipe ne sont
   jamais touchés après la création. Les champs versés (titre, textes,
   gravité, plateformes, sections, scénarios) gardent dans « import » la
   valeur écrite la dernière fois : un champ que Nadir a changé au Cockpit
   n'est plus réécrit. Un bug qui disparaît de la source n'est jamais
   supprimé : le bilan le nomme.

   À BLANC PAR DÉFAUT : la base est LUE (projet, anomalies déjà versées,
   plan de tests), rien n'est écrit ; le bilan va dans
   ~/ForgeMe-tests/hub-envoi/bugs-a-blanc.json.

     cd ~/Capmedia/plateforme/fonctions-suivi && \
     env -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST -u FIREBASE_STORAGE_EMULATOR_HOST \
       node outils/bugs-importer.mjs                      (à blanc, lecture de la production)
       node outils/bugs-importer.mjs --vrai               (sauvegarde, écriture, relecture)
       node outils/bugs-importer.mjs --annuler [fichier]  (remet la dernière sauvegarde)

   Options :
     --projet=<id>        le projet du Hub (ForgeMe par défaut)
     --bugs=<f.json>      la source (défaut ~/ForgeMe-tests/cartes/bugs.json)
     --clair=<f.json>     les textes du client (défaut ~/ForgeMe-tests/hub-envoi/bugs-en-clair.json)
     --sortie=<f.json>    le bilan (défaut ~/ForgeMe-tests/hub-envoi/bugs-a-blanc.json)
     --sauvegardes=<dir>  défaut ~/Capmedia/sauvegardes/bugs
     --emulateur          vise l'émulateur (FIRESTORE_EMULATOR_HOST obligatoire)
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/* --------------------------------------------------------------------------
   1. La relecture des textes du client
   -------------------------------------------------------------------------- */

/* Les mots qu'un client ne doit jamais lire : les outils de test et
   d'agent, le jargon. Comparés en mots entiers, sans accents ni casse
   (« script » ne se trouve pas dans « inscription »). */
const MOTS_INTERDITS = [
  'maestro', 'playwright', 'emulateur', 'emulateurs', 'simulateur', 'simulateurs', 'banc', 'firebase', 'firestore',
  'jest', 'test lab', 'testlab', 'claude', 'anthropic', 'chatgpt', 'openai', 'agent', 'agents', 'script', 'scripts',
  'sigabrt', 'exception', 'stack', 'console', 'token', 'jeton', 'jetons', 'requete', 'requetes', 'base de donnees',
  'en base', 'service worker', 'mise en cache', 'en cache', 'opacite', 'focus', 'sentry', 'json', 'api', 'uid', 'null', 'undefined',
  'crash', 'callback', 'hook', 'composant', 'backend', 'frontend', 'localstorage', 'timeout', 'payload',
];
/* L'IA se dit en capitales : « IA », « AI ». */
const MOTS_INTERDITS_CASSE = ['IA', 'AI', 'iOS', 'LLM'];
/* Les comptes et prénoms des bancs d'essai. */
const NOMS_ESSAI = ['camille', 'paula', 'karim', 'sonia', 'lea', 'marc', 'alex', 'marie', 'nadir', 'sebastien'];
/* Ce qui s'écrit en capitale au milieu d'un mot sans être du code. */
const MOTS_A_CAPITALE = new Set(['iPhone', 'iPhones', 'iPad', 'iPads', 'macOS', 'VoiceOver', 'TalkBack', 'YouTube', 'WhatsApp', 'ForgeMe', 'LinkedIn', 'PayPal', 'TikTok']);

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Les défauts d'un texte destiné au client. Rend une liste de phrases
 * (vide : le texte passe).
 */
export const controleTexteClient = (texte, { max = 2000, requis = false } = {}) => {
  const t = String(texte || '');
  const defauts = [];
  if (requis && !t.trim()) defauts.push('vide');
  if (t.length > max) defauts.push(`trop long (${t.length} > ${max})`);
  if (/[—–]/.test(t)) defauts.push('tiret cadratin ou demi-cadratin');
  if (/@/.test(t)) defauts.push('adresse ou arobase');
  if (/https?:|www\./i.test(t)) defauts.push('adresse web');
  if (/[{}<>[\]`|\\]/.test(t)) defauts.push('caractère de code');
  if (/\b[\w-]+\.(tsx?|jsx?|mjs|cjs|json|ips|png|jpe?g|txt|log|ya?ml|md|py|sh|rules|plist|xml)\b/i.test(t)) defauts.push('nom de fichier');
  if (/(^|[\s(«'"])~?\/[A-Za-z]/.test(t)) defauts.push('chemin ou adresse de page');
  if (/\b[a-z]+\.[a-z]+[\w.]*\b/i.test(t.replace(/\b(etc|ex|cf|env|min|max|n°)\./gi, ''))) defauts.push('identifiant pointé');
  if (/\b\w+_\w+\b/.test(t)) defauts.push('nom en snake_case');
  const camel = t.match(/\b[a-z]+[A-Z][A-Za-z]*\b|\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g) || [];
  const vraisCamel = camel.filter((m) => !MOTS_A_CAPITALE.has(m));
  if (vraisCamel.length) defauts.push(`nom de code (${vraisCamel.slice(0, 3).join(', ')})`);
  if (/\b[A-Z]{1,4}-\d{1,3}\b/.test(t) || /\b[ftus]-\d{3}\b/.test(t)) defauts.push('référence interne');
  if (/\bconstat\s+\d+|\bcarte (web|ios|android)\b|deja consigne/i.test(sansAccents(t))) defauts.push('renvoi interne');
  const plat = ` ${sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const trouves = MOTS_INTERDITS.filter((m) => plat.includes(` ${m} `));
  if (trouves.length) defauts.push(`mot interdit (${trouves.join(', ')})`);
  const casse = MOTS_INTERDITS_CASSE.filter((m) => new RegExp(`(^|[^A-Za-z])${m}([^A-Za-z]|$)`).test(t));
  if (casse.length) defauts.push(`mot interdit (${casse.join(', ')})`);
  const noms = NOMS_ESSAI.filter((m) => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(sansAccents(t).toLowerCase()));
  if (noms.length) defauts.push(`prénom de compte d'essai (${noms.join(', ')})`);
  if (/\bEssai\b/.test(t)) defauts.push('nom de compte d\'essai');
  return defauts;
};

/* --------------------------------------------------------------------------
   2. Du bug de la source à l'anomalie du Hub
   -------------------------------------------------------------------------- */

/* Une seule échelle de gravité, celle des tickets (noyau.js) : « majeur »
   n'existe pas au Hub, il y devient « critique » (une fonction majeure est
   cassée). */
export const GRAVITE_HUB = { bloquant: 'bloquant', majeur: 'critique', critique: 'critique', important: 'important', mineur: 'mineur' };
const PLATEFORMES = ['ios', 'android', 'web'];
const ID_BUG = /^[A-Z]{1,4}(-[A-Z]{1,4})?-\d{1,4}$/;
const ID_SCENARIO = /^[a-z0-9]+(-[a-z0-9]+)*-[ftus]-\d{3}$/;
const ID_SECTION = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/* Les champs que l'import possède : réécrits tant que Nadir n'y a pas touché. */
export const CHAMPS_IMPORT = ['titre', 'etapes', 'attendu', 'obtenu', 'gravite', 'plateformes', 'sections', 'scenarios'];
const BORNES = { titre: 120, etapes: 2000, attendu: 2000, obtenu: 2000 };

export const idAnomalie = (idBug) => `robot-${idBug}`;
const statutInitial = (decision) => {
  const d = sansAccents(decision).toLowerCase();
  if (/fausse alerte|faux positif|pas un bug/.test(d)) return 'sans-suite';
  if (/confirme/.test(d) && !/a confirmer|a trancher/.test(d)) return 'confirmee';
  return 'nouvelle';
};
/* Une faille possible : un scénario de l'aspect sécurité (« -s- »), ou de
   la section Sécurité du plan. */
export const estSecurite = (bug) => (bug.scenarios || []).some((s) => /-s-\d{3}$/.test(String(s)) || String(s).startsWith('securite-'))
  || (bug.sections || []).includes('securite');

/* Le texte de secours, quand bugs-en-clair.json ne dit rien : le bug tel
   qu'il est, entre parenthèses retirées (c'est là que dort le technique).
   Il passe la même relecture, et échoue le plus souvent : c'est voulu. */
const sansParentheses = (t) => String(t || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
const textesDeSecours = (bug) => {
  const c = (bug.constats || [])[0] || {};
  return { titre: String(bug.titre || '').trim(), etapes: sansParentheses(c.reproduction), attendu: sansParentheses(c.attendu), obtenu: sansParentheses(c.obtenu) };
};

/**
 * Ce que l'import veut pour un bug : le document du client, la note
 * interne, et ce qui l'empêcherait d'être versé.
 */
export const preparer = (bug, clair = {}) => {
  const id = String(bug.id || '');
  const refus = [];
  if (!ID_BUG.test(id)) refus.push(`identifiant inattendu « ${id} »`);
  const enClair = clair[id] || null;
  const textes = enClair ? { titre: enClair.titre, etapes: enClair.etapes, attendu: enClair.attendu, obtenu: enClair.obtenu } : textesDeSecours(bug);
  const defauts = {};
  for (const k of ['titre', 'etapes', 'attendu', 'obtenu']) {
    textes[k] = String(textes[k] || '').replace(/\s+\n/g, '\n').trim();
    const d = controleTexteClient(textes[k], { max: BORNES[k], requis: k === 'titre' || k === 'obtenu' });
    if (d.length) defauts[k] = d;
  }
  /* Rien ne part chez le client sans texte écrit et relu pour lui : le
     texte de secours n'est qu'une proposition, montrée dans le bilan. */
  if (!enClair) refus.push('texte client à écrire dans bugs-en-clair.json');
  else if (Object.keys(defauts).length) refus.push('texte client à reprendre');
  const securite = estSecurite(bug);
  const montrer = Boolean(enClair && enClair.montrer === true);
  if (securite && !montrer) refus.push('faille de sécurité : à montrer seulement sur décision de Nadir ("montrer": true)');
  const gravite = GRAVITE_HUB[bug.gravite] || 'important';
  const doc = {
    ...textes,
    gravite,
    plateformes: PLATEFORMES.filter((p) => (bug.plateformes || []).includes(p)),
    sections: [...new Set((bug.sections || []).map(String).filter((s) => ID_SECTION.test(s)))],
    scenarios: [...new Set((bug.scenarios || []).map(String).filter((s) => ID_SCENARIO.test(s)))],
  };
  const note = {
    source: id,
    graviteSource: String(bug.gravite || ''),
    decision: String(bug.decision || ''),
    constats: (bug.constats || []).map((c) => ({
      plateforme: String(c.plateforme || ''), section: String(c.section || ''), titre: String(c.titre || ''),
      reproduction: String(c.reproduction || ''), attendu: String(c.attendu || ''), obtenu: String(c.obtenu || ''),
      preuve: String(c.preuve || ''), piste: String(c.piste || ''),
    })),
  };
  return { id, idDoc: idAnomalie(id), doc, note, statut: statutInitial(bug.decision), refus, defauts, securite, enClair: Boolean(enClair) };
};

const egal = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
export const empreinte = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/**
 * Le geste pour un bug, au vu de ce qui est déjà en base : créer, mettre à
 * jour les seuls champs que personne n'a touchés, ou rien.
 *   avant      le document en base (ou null)
 *   noteAvant  sa note interne (ou null)
 */
export const planifier = (p, avant, noteAvant) => {
  const noteVoulue = { source: p.note.source, graviteSource: p.note.graviteSource, decision: p.note.decision, constats: p.note.constats };
  if (!avant) return { geste: 'creer', champs: { ...p.doc }, note: noteVoulue, gardes: [] };
  const deja = (avant.import && avant.import.champs) || {};
  const champs = {}; const gardes = [];
  for (const k of CHAMPS_IMPORT) {
    if (egal(avant[k], p.doc[k])) continue;
    /* Nadir l'a changé au Cockpit depuis le dernier import : on le garde. */
    if (k in deja && !egal(avant[k], deja[k])) { gardes.push(k); continue; }
    champs[k] = p.doc[k];
  }
  const noteChange = !noteAvant || ['source', 'graviteSource', 'decision', 'constats'].some((k) => !egal(noteAvant[k], noteVoulue[k]));
  if (!Object.keys(champs).length && !noteChange) return { geste: 'rien', champs, note: null, gardes };
  return { geste: 'maj', champs, note: noteChange ? noteVoulue : null, gardes };
};

/* --------------------------------------------------------------------------
   3. Le programme
   -------------------------------------------------------------------------- */

const ARGS = process.argv.slice(2);
const opt = (nom) => { const a = ARGS.find((x) => x.startsWith(`${nom}=`)); return a ? a.slice(nom.length + 1) : null; };
const VRAI = ARGS.includes('--vrai');
const ANNULER = ARGS.includes('--annuler');
const EMULATEUR = ARGS.includes('--emulateur');
const PID = opt('--projet') || '78FhJrmRu0AicxGXOfcM';
const BUGS = resolve(opt('--bugs') || join(homedir(), 'ForgeMe-tests/cartes/bugs.json'));
const CLAIR = resolve(opt('--clair') || join(homedir(), 'ForgeMe-tests/hub-envoi/bugs-en-clair.json'));
const SORTIE = resolve(opt('--sortie') || join(homedir(), 'ForgeMe-tests/hub-envoi/bugs-a-blanc.json'));
const SAUVEGARDES = resolve(opt('--sauvegardes') || join(homedir(), 'Capmedia/sauvegardes/bugs'));
const PROJET_FIREBASE = EMULATEUR ? (process.env.GCLOUD_PROJECT || 'capmedia-1f90d') : 'capmedia-1f90d';

const lireJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const ecrireJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${JSON.stringify(v, null, 1)}\n`); };
const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

let bdd = null; let FS = null;
const ouvrir = async () => {
  if (bdd) return;
  if (EMULATEUR) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) { console.error('--emulateur sans FIRESTORE_EMULATOR_HOST local : refus.'); process.exit(2); }
  } else {
    for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
      if (process.env[v]) { console.error(`${v} est posée : ce script vise ${PROJET_FIREBASE}. Retirez-la (env -u), ou passez --emulateur.`); process.exit(2); }
    }
  }
  const { initializeApp, getApps } = await import('firebase-admin/app');
  FS = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: PROJET_FIREBASE });
  bdd = FS.getFirestore();
};

/* Les marques de temps, aller et retour en JSON (sauvegarde, annulation). */
const versJson = (v) => {
  if (v && FS && v instanceof FS.Timestamp) return { __ts: v.toDate().toISOString(), s: v.seconds, ns: v.nanoseconds };
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
  return v;
};
const depuisJson = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && '__ts' in v) return new FS.Timestamp(v.s, v.ns);
  if (Array.isArray(v)) return v.map(depuisJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depuisJson(x)]));
  return v;
};

const refDoc = (idDoc) => bdd.doc(`projets/${PID}/anomalies/${idDoc}`);
const refNote = (idDoc) => bdd.doc(`projets/${PID}/anomalies/${idDoc}/equipe/note`);

/* Ce qui est en base : le projet, les anomalies versées, leurs notes, et
   les scénarios du plan (une case de test qui n'existe pas ferait un lien
   mort). Lecture seule. */
const lireBase = async () => {
  await ouvrir();
  const projet = await bdd.doc(`projets/${PID}`).get();
  const anos = await bdd.collection(`projets/${PID}/anomalies`).get();
  const robots = anos.docs.filter((d) => d.id.startsWith('robot-'));
  const notes = robots.length ? await bdd.getAll(...robots.map((d) => refNote(d.id))) : [];
  const plan = await bdd.collection(`projets/${PID}/planTests`).get();
  const scenariosPlan = new Set();
  const sectionsPlan = new Set();
  plan.docs.forEach((d) => {
    const x = d.data() || {};
    if (!x.aspects) return;
    sectionsPlan.add(d.id);
    Object.values(x.aspects).forEach((l) => (Array.isArray(l) ? l : []).forEach((sc) => { if (sc && sc.id) scenariosPlan.add(sc.id); }));
  });
  return {
    projet: projet.exists ? { id: projet.id, nom: (projet.data() || {}).nom || '' } : null,
    autres: anos.size - robots.length,
    existants: new Map(robots.map((d) => [d.id, { data: d.data(), maj: d.updateTime }])),
    notes: new Map(notes.map((n, i) => [robots[i].id, n.exists ? n.data() : null])),
    scenariosPlan, sectionsPlan,
  };
};

const compter = (liste, cle) => liste.reduce((n, x) => { const v = cle(x); n[v] = (n[v] || 0) + 1; return n; }, {});

const principal = async () => {
  if (VRAI && ANNULER) { console.error('--vrai et --annuler ensemble : choisir.'); process.exit(2); }
  if (ANNULER) return annuler();

  const source = lireJson(BUGS);
  const clair = existsSync(CLAIR) ? lireJson(CLAIR) : {};
  const bugs = source.bugs || [];
  const prepares = bugs.map((b) => preparer(b, clair));
  const base = await lireBase();
  if (!base.projet) { console.error(`Le projet ${PID} n'existe pas dans ${PROJET_FIREBASE}.`); process.exit(2); }

  const verses = prepares.filter((p) => !p.refus.length);
  const retenus = prepares.filter((p) => p.refus.length);
  const plans = verses.map((p) => ({ p, ...planifier(p, (base.existants.get(p.idDoc) || {}).data || null, base.notes.get(p.idDoc) || null) }));
  const idsSource = new Set(prepares.map((p) => p.idDoc));
  const disparus = [...base.existants.keys()].filter((id) => !idsSource.has(id));
  const casesInconnues = base.scenariosPlan.size
    ? verses.flatMap((p) => p.doc.scenarios.filter((s) => !base.scenariosPlan.has(s)).map((s) => `${p.id} : ${s}`)) : [];

  const bilan = {
    genere: new Date().toISOString(),
    mode: VRAI ? 'vrai' : 'a-blanc',
    cible: `${PROJET_FIREBASE}${EMULATEUR ? ' (émulateur)' : ''} · projets/${PID} (${base.projet.nom})`,
    source: { fichier: BUGS, genere: source.genere, total: bugs.length, parGravite: compter(bugs, (b) => b.gravite) },
    textesEnClair: { fichier: CLAIR, couverts: prepares.filter((p) => p.enClair).length },
    verses: {
      total: verses.length,
      parGraviteHub: compter(verses, (p) => p.doc.gravite),
      parPlateforme: verses.reduce((n, p) => { p.doc.plateformes.forEach((x) => { n[x] = (n[x] || 0) + 1; }); return n; }, {}),
      aCreer: plans.filter((x) => x.geste === 'creer').length,
      aMettreAJour: plans.filter((x) => x.geste === 'maj').length,
      inchanges: plans.filter((x) => x.geste === 'rien').length,
      champsGardesParNadir: plans.filter((x) => x.gardes.length).map((x) => `${x.p.id} : ${x.gardes.join(', ')}`),
    },
    retenus: retenus.map((p) => ({ id: p.id, gravite: p.doc.gravite, securite: p.securite, pourquoi: p.refus, defauts: p.defauts,
      proposition: { titre: p.doc.titre, etapes: p.doc.etapes, attendu: p.doc.attendu, obtenu: p.doc.obtenu } })),
    disparusDeLaSource: disparus,
    casesInconnuesDuPlan: casesInconnues,
    anomaliesNonRobot: base.autres,
    textesClient: verses.map((p) => ({ id: p.id, idDoc: p.idDoc, gravite: p.doc.gravite, plateformes: p.doc.plateformes, sections: p.doc.sections, scenarios: p.doc.scenarios, titre: p.doc.titre, etapes: p.doc.etapes, attendu: p.doc.attendu, obtenu: p.doc.obtenu })),
  };

  const dire = (t) => console.log(t);
  dire(`\nBugs ForgeMe vers le Hub · ${bilan.cible}`);
  dire(`Source : ${bugs.length} bugs (${Object.entries(bilan.source.parGravite).map(([k, n]) => `${n} ${k}`).join(', ')}), textes en clair pour ${bilan.textesEnClair.couverts}.`);
  dire(`Versés : ${verses.length} (${Object.entries(bilan.verses.parGraviteHub).map(([k, n]) => `${n} ${k}`).join(', ')}) · à créer ${bilan.verses.aCreer}, à mettre à jour ${bilan.verses.aMettreAJour}, inchangés ${bilan.verses.inchanges}.`);
  if (bilan.verses.champsGardesParNadir.length) dire(`Champs changés au Cockpit, gardés : ${bilan.verses.champsGardesParNadir.join(' ; ')}`);
  dire(`Retenus : ${retenus.length}${retenus.length ? '' : '.'}`);
  retenus.forEach((r) => dire(`  ${r.id} · ${r.refus.join(' ; ')}${Object.keys(r.defauts).length ? ` · ${Object.entries(r.defauts).map(([k, d]) => `${k} : ${d.join(', ')}`).join(' | ')}` : ''}`));
  if (disparus.length) dire(`Dans le Hub mais plus dans la source (jamais supprimés) : ${disparus.join(', ')}`);
  if (casesInconnues.length) dire(`Cases de test absentes du plan : ${casesInconnues.join(', ')}`);

  if (!VRAI) {
    ecrireJson(SORTIE, bilan);
    dire(`\nÀ BLANC : rien n'est écrit. Bilan complet et textes du client : ${SORTIE}`);
    return;
  }

  /* --vrai : la sauvegarde d'abord, de tout ce qu'on va toucher. */
  const touches = plans.filter((x) => x.geste !== 'rien');
  if (!touches.length) { ecrireJson(SORTIE, bilan); dire('\nRien à écrire : la base est déjà à jour.'); return; }
  const fichier = join(SAUVEGARDES, `bugs-${PID}-${horodatage()}.json`);
  ecrireJson(fichier, {
    projet: PID, firebase: PROJET_FIREBASE, emulateur: EMULATEUR, le: new Date().toISOString(),
    docs: Object.fromEntries(touches.map((x) => [x.p.idDoc, {
      avant: versJson((base.existants.get(x.p.idDoc) || {}).data || null),
      note: versJson(base.notes.get(x.p.idDoc) || null),
    }])),
  });
  dire(`\nSauvegarde : ${fichier}`);

  /* Une transaction par bug : le document et sa note passent ensemble. Un
     document qui a bougé depuis la lecture n'est pas écrit (relancer). */
  const { FieldValue } = FS;
  let ecrits = 0; const sautes = [];
  for (const x of touches) {
    const lu = base.existants.get(x.p.idDoc);
    try {
      await bdd.runTransaction(async (t) => {
        const d = await t.get(refDoc(x.p.idDoc));
        if (lu ? (!d.exists || !d.updateTime.isEqual(lu.maj)) : d.exists) throw new Error('a bougé depuis la lecture');
        const precedent = (lu && lu.data.import && lu.data.import.champs) || {};
        const champsImport = { ...precedent, ...Object.fromEntries(CHAMPS_IMPORT.filter((k) => k in x.champs || !(k in precedent)).map((k) => [k, x.p.doc[k]])) };
        if (x.geste === 'creer') {
          t.set(refDoc(x.p.idDoc), {
            /* interne: false : un bug des robots se montre au client, « À
               confirmer » tant que l'équipe n'a pas tranché (règle du
               04/10/2026) ; seul l'échec d'un testeur naît interne. */
            ...x.champs, origine: 'robot', interne: false, statut: x.p.statut, scenario: '', description: '', passages: [], temoins: [],
            import: { source: x.p.id, champs: champsImport, le: FieldValue.serverTimestamp() },
            cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
          });
        } else if (Object.keys(x.champs).length) {
          t.update(refDoc(x.p.idDoc), { ...x.champs, 'import.champs': champsImport, 'import.le': FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
        }
        /* La note : ses champs versés seulement ; « texte », la note libre
           de l'équipe, n'est jamais touché. */
        if (x.note) t.set(refNote(x.p.idDoc), { ...x.note, maj: FieldValue.serverTimestamp() }, { merge: true });
      });
      ecrits += 1;
    } catch (err) { sautes.push(`${x.p.id} (${err.message})`); }
  }
  dire(`Écrits : ${ecrits} sur ${touches.length}.${sautes.length ? ` Sautés : ${sautes.join(', ')}` : ''}`);

  /* La relecture de contrôle : chaque document versé porte ce qu'on voulait
     (sauf les champs gardés), et le compte est juste. */
  const relu = await lireBase();
  const fautes = [];
  for (const x of plans) {
    const e = relu.existants.get(x.p.idDoc);
    if (!e) { fautes.push(`${x.p.id} absent`); continue; }
    for (const k of CHAMPS_IMPORT) if (!x.gardes.includes(k) && !egal(e.data[k], x.p.doc[k])) fautes.push(`${x.p.id} : ${k}`);
    if (e.data.origine !== 'robot') fautes.push(`${x.p.id} : origine`);
    const n = relu.notes.get(x.p.idDoc);
    if (!n || n.source !== x.p.id) fautes.push(`${x.p.id} : note interne`);
  }
  bilan.relecture = { attendus: plans.length, presents: plans.filter((x) => relu.existants.has(x.p.idDoc)).length, fautes, sauvegarde: fichier };
  ecrireJson(SORTIE, bilan);
  dire(`Relecture : ${bilan.relecture.presents}/${plans.length} présents, ${fautes.length ? `ÉCARTS : ${fautes.join(' ; ')}` : 'aucun écart'}.`);
  dire(`Annuler : node outils/bugs-importer.mjs --annuler ${fichier}${EMULATEUR ? ' --emulateur' : ''}`);
  if (fautes.length || sautes.length) process.exitCode = 1;
};

/* --annuler : remet chaque document touché comme il était. Un document
   que l'import avait créé est retiré, avec sa note. */
const annuler = async () => {
  const donne = ARGS.filter((a) => !a.startsWith('--'))[0];
  let fichier = donne ? resolve(donne) : '';
  if (!fichier) {
    const l = existsSync(SAUVEGARDES) ? readdirSync(SAUVEGARDES).filter((f) => f.startsWith(`bugs-${PID}-`) && f.endsWith('.json')).sort() : [];
    if (!l.length) { console.error(`Aucune sauvegarde dans ${SAUVEGARDES}.`); process.exit(2); }
    fichier = join(SAUVEGARDES, l[l.length - 1]);
  }
  const s = lireJson(fichier);
  if (s.projet !== PID) { console.error(`La sauvegarde vise ${s.projet}, pas ${PID} (--projet=).`); process.exit(2); }
  if (Boolean(s.emulateur) !== EMULATEUR) { console.error(`La sauvegarde a été prise ${s.emulateur ? 'sur l\'émulateur' : 'en production'} : même cible obligatoire.`); process.exit(2); }
  await ouvrir();
  let remis = 0; let retires = 0;
  for (const [idDoc, x] of Object.entries(s.docs || {})) {
    if (!idDoc.startsWith('robot-')) continue;
    if (x.avant) {
      await refDoc(idDoc).set(depuisJson(x.avant));
      if (x.note) await refNote(idDoc).set(depuisJson(x.note)); else await refNote(idDoc).delete();
      remis += 1;
    } else {
      await refNote(idDoc).delete();
      await refDoc(idDoc).delete();
      retires += 1;
    }
  }
  console.log(`Annulation depuis ${fichier} : ${remis} remis comme avant, ${retires} retirés.`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((err) => { console.error(err); process.exit(1); });
}
