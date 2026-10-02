/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'import du plan de tests (« ce qui va être testé »)

   Lit un dossier de sections, un fichier JSON par section, et les verse
   dans projets/{projet}/planTests/{section}. Le format est celui de
   SCHEMA.md (voir la description en tête de validerSection, plus bas) :
   chaque fichier est vérifié en entier avant toute écriture, et un fichier
   invalide est refusé en disant pourquoi, ligne par ligne. Les autres
   passent.

   À BLANC PAR DÉFAUT : rien n'est lu ni écrit dans une base, le bilan dit
   ce qui serait versé.

     node plan-tests-importer.mjs <projet> <dossier>                       (à blanc)
     node plan-tests-importer.mjs <projet> <dossier> --vrai                (émulateur seulement)
     node plan-tests-importer.mjs <projet> <dossier> --vrai --production   (PRODUCTION, sur ordre explicite)

   Options :
     --sections=<SECTIONS.md>  la liste de référence des sections (id,
                               groupe, ordre). Par défaut <dossier>/../SECTIONS.md
                               s'il existe. Une section absente de la liste,
                               ou rangée ailleurs, est refusée.
     --refs=<fichier.json>     les scénarios existants ({ scenarios: [{ ref }] }) :
                               une référence inconnue devient une erreur.
                               Avec --vrai, la bibliothèque du projet visé est
                               lue de toute façon, et une référence inconnue
                               y est signalée.
     --ecraser                 écrase aussi une section retouchée dans le
                               Cockpit depuis le dernier import (sinon elle
                               est laissée telle quelle, et le bilan le dit).

   En production, l'existant (toute la collection planTests du projet) est
   sauvegardé en JSON sur le disque, hors du dépôt, AVANT la première
   écriture : ~/Capmedia/sauvegardes/plan-tests/ (ou $SAUVEGARDES).

   Rejouable : une section porte son identifiant comme nom de document, un
   second passage réécrit la même section. Une section qui n'est plus dans
   le dossier n'est jamais supprimée (les fichiers arrivent au fil de
   l'eau) : le bilan la nomme, c'est tout.
   ========================================================================== */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const [PROJET_CIBLE, DOSSIER] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ECRASER = arg('--ecraser');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

/* --------------------------------------------------------------------------
   Le format
   -------------------------------------------------------------------------- */

export const GROUPES = ['demarrage', 'socle', 'fonctionnalites', 'transverse'];
export const ASPECTS = ['fonctionnel', 'technique', 'ux', 'securite'];
const LETTRE = { fonctionnel: 'f', technique: 't', ux: 'u', securite: 's' };
const PLATEFORMES = ['ios', 'android', 'web'];
const TYPES = ['normal', 'limite', 'erreur'];
const PRIORITES = ['haute', 'moyenne', 'basse'];
const CLES_SECTION = ['id', 'groupe', 'ordre', 'titre', 'resume', 'plateformes', 'aspects'];
const CLES_SCENARIO = ['id', 'titre', 'etapes', 'attendu', 'plateformes', 'type', 'priorite', 'refs'];
const REF = /^[A-Z]{2}-R?\d{1,3}$/;
const CADRATIN = '—';
/* Un document Firestore pèse au plus 1 Mio : on garde une marge. */
const TAILLE_MAX = 900 * 1024;

const texte = (v, nom, max, erreurs, { requis = true } = {}) => {
  if (typeof v !== 'string') { erreurs.push(`${nom} : un texte est attendu`); return; }
  if (requis && !v.trim()) erreurs.push(`${nom} : vide`);
  if (v.length > max) erreurs.push(`${nom} : ${v.length} caractères, ${max} au plus`);
  if (v.includes(CADRATIN)) erreurs.push(`${nom} : contient un tiret cadratin`);
};

const sousEnsemble = (v, nom, permis, erreurs, { requis = true } = {}) => {
  if (!Array.isArray(v)) { erreurs.push(`${nom} : une liste est attendue`); return; }
  if (requis && !v.length) erreurs.push(`${nom} : vide`);
  const inconnus = v.filter((x) => !permis.includes(x));
  if (inconnus.length) erreurs.push(`${nom} : valeur inconnue ${inconnus.map((x) => JSON.stringify(x)).join(', ')} (permis : ${permis.join(', ')})`);
  if (new Set(v).size !== v.length) erreurs.push(`${nom} : doublon`);
};

/**
 * Une section : { id, groupe, ordre, titre, resume, plateformes, aspects }.
 * aspects : { fonctionnel, technique, ux, securite }, chacun une liste de
 * scénarios { id, titre, etapes, attendu, plateformes, type, priorite, refs }.
 * L'identifiant d'un scénario est <section>-<f|t|u|s>-<3 chiffres>, la
 * lettre étant celle de son aspect. Rend { erreurs, avis }.
 */
export const validerSection = (s, { attenduId = '', reference = null, refsConnues = null } = {}) => {
  const erreurs = [];
  const avis = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { erreurs: ['le fichier ne contient pas un objet'], avis };
  const inconnues = Object.keys(s).filter((k) => !CLES_SECTION.includes(k));
  if (inconnues.length) erreurs.push(`champ inconnu : ${inconnues.join(', ')}`);
  if (typeof s.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) erreurs.push('id : minuscules, chiffres et tirets seulement');
  else {
    if (attenduId && s.id !== attenduId) erreurs.push(`id « ${s.id} » différent du nom du fichier (« ${attenduId} »)`);
    if (s.id === 'presentation') erreurs.push('id : « presentation » est réservé à la page');
  }
  if (!GROUPES.includes(s.groupe)) erreurs.push(`groupe : ${JSON.stringify(s.groupe)} inconnu (permis : ${GROUPES.join(', ')})`);
  if (!Number.isInteger(s.ordre) || s.ordre < 1) erreurs.push('ordre : un entier à partir de 1 est attendu');
  texte(s.titre, 'titre', 200, erreurs);
  texte(s.resume, 'resume', 2000, erreurs);
  sousEnsemble(s.plateformes, 'plateformes', PLATEFORMES, erreurs);

  if (reference) {
    const r = reference.get(s.id);
    if (!r) erreurs.push(`la section « ${s.id} » n'est pas dans la liste de référence`);
    else {
      if (r.groupe !== s.groupe) erreurs.push(`groupe : « ${s.groupe} », la liste de référence dit « ${r.groupe} »`);
      if (r.ordre !== s.ordre) erreurs.push(`ordre : ${s.ordre}, la liste de référence dit ${r.ordre}`);
    }
  }

  if (!s.aspects || typeof s.aspects !== 'object' || Array.isArray(s.aspects)) {
    erreurs.push('aspects : un objet est attendu');
    return { erreurs, avis };
  }
  const aspectsInconnus = Object.keys(s.aspects).filter((k) => !ASPECTS.includes(k));
  if (aspectsInconnus.length) erreurs.push(`aspects : inconnu ${aspectsInconnus.join(', ')} (permis : ${ASPECTS.join(', ')})`);
  const vus = new Set();
  for (const a of ASPECTS) {
    const liste = s.aspects[a];
    if (!Array.isArray(liste)) { erreurs.push(`aspects.${a} : une liste est attendue`); continue; }
    if (!liste.length) avis.push(`aspects.${a} : aucun scénario`);
    if (liste.length > 400) erreurs.push(`aspects.${a} : ${liste.length} scénarios, 400 au plus`);
    liste.forEach((x, i) => {
      const ou = `${a}[${i}]${x && x.id ? ` ${x.id}` : ''}`;
      if (!x || typeof x !== 'object' || Array.isArray(x)) { erreurs.push(`${ou} : un objet est attendu`); return; }
      const autres = Object.keys(x).filter((k) => !CLES_SCENARIO.includes(k));
      if (autres.length) erreurs.push(`${ou} : champ inconnu ${autres.join(', ')}`);
      const motif = new RegExp(`^${String(s.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${LETTRE[a]}-\\d{3}$`);
      if (typeof x.id !== 'string' || !motif.test(x.id)) erreurs.push(`${ou} : id attendu de la forme ${s.id}-${LETTRE[a]}-001`);
      else if (vus.has(x.id)) erreurs.push(`${ou} : id en double`);
      else vus.add(x.id);
      texte(x.titre, `${ou} titre`, 300, erreurs);
      texte(x.etapes, `${ou} etapes`, 3000, erreurs);
      texte(x.attendu, `${ou} attendu`, 2000, erreurs);
      sousEnsemble(x.plateformes, `${ou} plateformes`, PLATEFORMES, erreurs);
      if (Array.isArray(x.plateformes) && Array.isArray(s.plateformes)) {
        const hors = x.plateformes.filter((p) => PLATEFORMES.includes(p) && !s.plateformes.includes(p));
        if (hors.length) avis.push(`${ou} : plateforme ${hors.join(', ')} absente de la section`);
      }
      if (!TYPES.includes(x.type)) erreurs.push(`${ou} : type ${JSON.stringify(x.type)} inconnu (permis : ${TYPES.join(', ')})`);
      if (!PRIORITES.includes(x.priorite)) erreurs.push(`${ou} : priorite ${JSON.stringify(x.priorite)} inconnue (permis : ${PRIORITES.join(', ')})`);
      if (!Array.isArray(x.refs)) erreurs.push(`${ou} : refs, une liste est attendue (vide si aucune)`);
      else {
        x.refs.forEach((r) => {
          if (typeof r !== 'string' || !REF.test(r)) erreurs.push(`${ou} : référence ${JSON.stringify(r)} mal formée (par exemple TA-12)`);
          else if (refsConnues && !refsConnues.has(r)) erreurs.push(`${ou} : référence ${r} inconnue de la bibliothèque`);
        });
        if (new Set(x.refs).size !== x.refs.length) erreurs.push(`${ou} : référence en double`);
      }
    });
  }
  const taille = Buffer.byteLength(JSON.stringify(s), 'utf8');
  if (taille > TAILLE_MAX) erreurs.push(`la section pèse ${Math.round(taille / 1024)} Kio, ${Math.round(TAILLE_MAX / 1024)} au plus`);
  return { erreurs, avis };
};

/* La liste de référence : « Groupe `cle` (...) » puis « 17 taches : Tâches ». */
export const lireReference = (markdown) => {
  const ref = new Map();
  let groupe = '';
  for (const ligne of markdown.split('\n')) {
    const g = ligne.match(/^Groupe\s+`([a-z-]+)`/);
    if (g) { groupe = g[1]; continue; }
    const s = ligne.match(/^(\d+)\s+([a-z0-9-]+)\s*:/);
    if (s && groupe) ref.set(s[2], { ordre: Number(s[1]), groupe });
  }
  return ref;
};

/* Ce qui est versé : la section telle quelle, les quatre aspects toujours
   présents, rien d'autre (les règles refusent un champ inconnu). */
const versDocument = (s) => ({
  id: s.id, groupe: s.groupe, ordre: s.ordre, titre: s.titre.trim(), resume: s.resume.trim(),
  plateformes: s.plateformes,
  aspects: Object.fromEntries(ASPECTS.map((a) => [a, (s.aspects[a] || []).map((x) => ({
    id: x.id, titre: x.titre.trim(), etapes: x.etapes.trim(), attendu: x.attendu.trim(),
    plateformes: x.plateformes, type: x.type, priorite: x.priorite, refs: x.refs,
  }))])),
});

const compte = (s) => ASPECTS.map((a) => (Array.isArray((s.aspects || {})[a]) ? s.aspects[a].length : 0));

/* --------------------------------------------------------------------------
   Le passage
   -------------------------------------------------------------------------- */

async function main() {
  if (!PROJET_CIBLE || !DOSSIER) {
    console.error('Usage : node plan-tests-importer.mjs <projet> <dossier-des-sections> [--sections=<SECTIONS.md>] [--refs=<fichier.json>] [--vrai [--production]] [--ecraser]');
    process.exit(1);
  }
  if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
    console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
    process.exit(2);
  }
  if (PRODUCTION && SUR_EMULATEUR) {
    console.error('--production avec FIRESTORE_EMULATOR_HOST posé : contradictoire, rien n\'est fait.');
    process.exit(2);
  }
  const dossier = resolve(DOSSIER);
  if (!existsSync(dossier)) { console.error(`Dossier introuvable : ${dossier}`); process.exit(1); }

  const cheminRef = valeur('--sections') || join(dirname(dossier), 'SECTIONS.md');
  const reference = existsSync(cheminRef) ? lireReference(readFileSync(cheminRef, 'utf8')) : null;
  let refsConnues = null;
  if (valeur('--refs')) {
    const j = JSON.parse(readFileSync(valeur('--refs'), 'utf8'));
    refsConnues = new Set((j.scenarios || []).map((x) => x.ref || x._id).filter(Boolean));
  }

  console.log(VRAI
    ? (SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE} : ÉCRITURE` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} : ÉCRITURE !!!\n`)
    : 'À blanc : aucune base n\'est lue ni écrite.');
  console.log(`Sections lues dans ${dossier}`);
  console.log(reference ? `Liste de référence : ${cheminRef} (${reference.size} sections)` : 'Pas de liste de référence : identifiants, groupes et ordres non recoupés.');
  console.log(`Destination : projets/${PROJET_CIBLE}/planTests\n`);

  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort();
  const valides = [];
  const refuses = [];
  for (const f of fichiers) {
    const id = basename(f, '.json');
    let s;
    try { s = JSON.parse(readFileSync(join(dossier, f), 'utf8')); } catch (e) {
      refuses.push({ f, erreurs: [`JSON illisible : ${e.message}`] });
      continue;
    }
    const { erreurs, avis } = validerSection(s, { attenduId: id, reference, refsConnues });
    if (erreurs.length) { refuses.push({ f, erreurs }); continue; }
    valides.push({ f, s, avis });
  }
  /* Deux fichiers ne peuvent pas porter le même ordre : le sommaire les
     confondrait. */
  const parOrdre = new Map();
  valides.forEach((v) => { const k = v.s.ordre; parOrdre.set(k, [...(parOrdre.get(k) || []), v.s.id]); });
  [...parOrdre].filter(([, ids]) => ids.length > 1).forEach(([o, ids]) => console.log(`  attention  ordre ${o} porté par ${ids.join(' et ')}`));

  for (const v of valides) {
    const [nf, nt, nu, ns] = compte(v.s);
    console.log(`  ok       ${v.s.id.padEnd(20)} ${String(v.s.ordre).padStart(2)} ${v.s.groupe.padEnd(15)} ${String(nf + nt + nu + ns).padStart(4)} scénarios (fonctionnel ${nf}, technique ${nt}, expérience ${nu}, sécurité ${ns})`);
    v.avis.forEach((a) => console.log(`             note : ${a}`));
  }
  for (const r of refuses) {
    console.log(`  REFUSÉ   ${r.f}`);
    r.erreurs.slice(0, 40).forEach((e) => console.log(`             ${e}`));
    if (r.erreurs.length > 40) console.log(`             ... et ${r.erreurs.length - 40} autres erreurs`);
  }
  const total = valides.reduce((t, v) => t + compte(v.s).reduce((a, b) => a + b, 0), 0);
  console.log(`\n${valides.length} ${valides.length > 1 ? 'sections valides' : 'section valide'}, ${total} scénarios ; ${refuses.length} ${refuses.length > 1 ? 'fichiers refusés' : 'fichier refusé'}.`);
  if (reference) {
    const manquent = [...reference.keys()].filter((id) => !valides.some((v) => v.s.id === id));
    if (manquent.length) console.log(`Encore absentes ou refusées (${manquent.length}) : ${manquent.join(', ')}`);
  }

  if (!VRAI) {
    console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour verser sur l\'émulateur.');
    process.exit(refuses.length ? 1 : 0);
  }
  if (!valides.length) { console.log('\nRien à verser.'); process.exit(refuses.length ? 1 : 0); }

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJET_FIREBASE });
  const bdd = getFirestore();
  const col = bdd.collection(`projets/${PROJET_CIBLE}/planTests`);
  const projet = await bdd.doc(`projets/${PROJET_CIBLE}`).get();
  if (!projet.exists) { console.error(`\nLe projet ${PROJET_CIBLE} n'existe pas dans cette base. Rien n'est écrit.`); process.exit(2); }
  console.log(`\nProjet visé : ${projet.get('nom') || PROJET_CIBLE}`);

  const existants = new Map((await col.get()).docs.map((d) => [d.id, d.data()]));

  /* La sauvegarde, AVANT la première écriture, en production. */
  if (PRODUCTION) {
    const versJson = (v) => {
      if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
      if (Array.isArray(v)) return v.map(versJson);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
      return v;
    };
    const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'plan-tests');
    mkdirSync(lieu, { recursive: true });
    const fichier = join(lieu, `${PROJET_CIBLE}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(fichier, JSON.stringify({ projet: PROJET_CIBLE, base: PROJET_FIREBASE, le: new Date().toISOString(), documents: [...existants].map(([id, d]) => ({ id, donnees: versJson(d) })) }, null, 2));
    console.log(`Sauvegarde de l'existant (${existants.size} documents) : ${fichier}`);
  }

  /* La bibliothèque du projet : une référence qu'elle ne connaît pas est
     signalée (sans bloquer, la liste de référence peut avoir été passée). */
  const biblio = new Set((await bdd.collection(`projets/${PROJET_CIBLE}/scenarios`).select().get()).docs.map((d) => d.id));
  const inconnues = new Set(valides.flatMap((v) => ASPECTS.flatMap((a) => v.s.aspects[a].flatMap((x) => x.refs))).filter((r) => !biblio.has(r)));
  if (inconnues.size) console.log(`Références absentes de la bibliothèque du projet : ${[...inconnues].join(', ')}`);

  const date = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
  let ecrites = 0;
  const epargnees = [];
  for (const v of valides) {
    const avant = existants.get(v.s.id);
    if (avant && date(avant.editeLe) > date(avant.importeLe) && !ECRASER) { epargnees.push(v.s.id); continue; }
    await col.doc(v.s.id).set({ ...versDocument(v.s), maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp() });
    ecrites += 1;
  }
  /* La présentation : elle dit au client que le plan existe. Créée une
     fois, jamais réécrite ici (l'équipe la retouche dans le Cockpit). */
  if (!existants.has('presentation')) {
    await col.doc('presentation').set({ genre: 'presentation', maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp() });
    console.log('Présentation de la page créée.');
  }
  console.log(`${ecrites} ${ecrites > 1 ? 'sections versées' : 'section versée'} dans projets/${PROJET_CIBLE}/planTests.`);
  if (epargnees.length) console.log(`Retouchées dans le Cockpit depuis le dernier import, laissées telles quelles (--ecraser pour les remplacer) : ${epargnees.join(', ')}`);
  const horsDossier = [...existants.keys()].filter((id) => id !== 'presentation' && !valides.some((v) => v.s.id === id) && !refuses.some((r) => basename(r.f, '.json') === id));
  if (horsDossier.length) console.log(`En base mais absentes du dossier (non touchées) : ${horsDossier.join(', ')}`);
  process.exit(refuses.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
