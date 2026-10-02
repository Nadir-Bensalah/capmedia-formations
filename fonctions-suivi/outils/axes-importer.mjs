/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'import des axes d'évolution d'un projet

   Deux usages.

   1. VERSER UN FICHIER. Lit un fichier JSON au format de
      ~/ForgeMe-tests/axes-evolution/FORMAT.md ({ intro, plateformes: { ios:
      [AXE...], ... } }), le vérifie EN ENTIER avant toute écriture (la
      validation est celle de la page : agence/suivi/assets/js/axes-format.js),
      puis écrit projets/{projet}/axes/{id} et l'introduction
      (projets/{projet}/axesIntro/texte).
      - Un axe déjà présent n'est mis à jour que dans son contenu (titre,
        phrase, apport, ampleur, plateforme, ordre) : sa réponse, son état,
        son devis et sa publication ne bougent pas.
      - Un axe retouché dans le Cockpit depuis le dernier import est laissé
        tel quel (le bilan le dit) ; --ecraser le réécrit.
      - Un axe neuf naît en BROUILLON : l'équipe relit puis publie depuis le
        Cockpit. --publier le publie d'office (et publie aussi les axes déjà
        là que le fichier contient).
      - Rien n'est jamais supprimé : un axe en base absent du fichier reste.

   2. CONVERTIR LES SUGGESTIONS (--convertir). Chaque suggestion du projet
      devient l'axe « sugg-<id> » de sa plateforme (« general » si aucune ou
      plusieurs), publié si elle l'était (sauf retirée), avec son texte, son
      devis, son prix (montants/axe-sugg-<id>, lu par le responsable seul)
      et la réponse « intéressé » du client. Les suggestions restent en base,
      intactes. Un axe déjà converti n'est pas réécrit.

   À BLANC PAR DÉFAUT : rien n'est écrit ; la conversion à blanc ne lit rien
   non plus, sauf sur l'émulateur.

     node axes-importer.mjs <projet> [fichier.json]                      (à blanc)
     node axes-importer.mjs <projet> [fichier.json] --vrai               (émulateur seulement)
     node axes-importer.mjs <projet> [fichier.json] --vrai --production  (PRODUCTION, sur ordre explicite)
     node axes-importer.mjs <projet> --convertir [--vrai [--production]]

   Fichier par défaut : ~/ForgeMe-tests/axes-evolution/forgeme.json.
   En production, les axes, l'introduction et (pour --convertir) les
   suggestions du projet sont sauvegardés en JSON, hors du dépôt, AVANT la
   première écriture : ~/Capmedia/sauvegardes/axes/ (ou $SAUVEGARDES).
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { validerFichierAxes, versDocumentAxe, axeDepuisSuggestion } from '../../agence/suivi/assets/js/axes-format.js';

const arg = (nom) => process.argv.includes(nom);
const [PROJET_CIBLE, FICHIER_ARG] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FICHIER = FICHIER_ARG || join(homedir(), 'ForgeMe-tests', 'axes-evolution', 'forgeme.json');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ECRASER = arg('--ecraser');
const PUBLIER = arg('--publier');
const CONVERTIR = arg('--convertir');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

const ouvrirBase = async () => {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJET_FIREBASE });
  return { bdd: getFirestore(), FieldValue, Timestamp };
};

const versJson = (Timestamp) => function conv(v) {
  if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(conv);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
  return v;
};

/* La sauvegarde, AVANT la première écriture, en production. */
const sauvegarder = async (bdd, Timestamp, collections) => {
  const conv = versJson(Timestamp);
  const contenu = { projet: PROJET_CIBLE, base: PROJET_FIREBASE, le: new Date().toISOString(), collections: {} };
  for (const c of collections) {
    const q = await bdd.collection(`projets/${PROJET_CIBLE}/${c}`).get();
    contenu.collections[c] = q.docs.map((d) => ({ id: d.id, donnees: conv(d.data()) }));
  }
  const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'axes');
  mkdirSync(lieu, { recursive: true });
  const fichier = join(lieu, `${PROJET_CIBLE}-${CONVERTIR ? 'conversion' : 'import'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(fichier, JSON.stringify(contenu, null, 2));
  console.log(`Sauvegarde de l'existant (${collections.map((c) => `${contenu.collections[c].length} ${c}`).join(', ')}) : ${fichier}`);
};

const garde = () => {
  if (!PROJET_CIBLE) {
    console.error('Usage : node axes-importer.mjs <projet> [fichier.json] [--vrai [--production]] [--publier] [--ecraser]\n        node axes-importer.mjs <projet> --convertir [--vrai [--production]]');
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
  if (PRODUCTION && !VRAI) {
    console.error('--production sans --vrai : rien à faire (à blanc, aucune base n\'est touchée).');
    process.exit(2);
  }
  console.log(VRAI
    ? (SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE} : ÉCRITURE` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} : ÉCRITURE !!!\n`)
    : 'À blanc : rien n\'est écrit.');
};

/* ==========================================================================
   1. Verser un fichier
   ========================================================================== */

async function importer() {
  const chemin = resolve(FICHIER);
  if (!existsSync(chemin)) { console.error(`Fichier introuvable : ${chemin}`); process.exit(1); }
  console.log(`Fichier : ${chemin}`);
  console.log(`Destination : projets/${PROJET_CIBLE}/axes (en fusion)${PUBLIER ? ', axes publiés' : ', axes neufs en brouillon'}\n`);
  let f;
  try { f = JSON.parse(readFileSync(chemin, 'utf8')); } catch (e) { console.error(`JSON illisible : ${e.message}`); process.exit(1); }
  const { erreurs, avis, axes } = validerFichierAxes(f);
  const parPlateforme = axes.reduce((m, a) => ({ ...m, [a.plateforme]: (m[a.plateforme] || 0) + 1 }), {});
  Object.entries(parPlateforme).forEach(([p, n]) => console.log(`  ok       ${p.padEnd(9)} ${n} axe${n > 1 ? 's' : ''}`));
  if (typeof f.intro === 'string' && !erreurs.some((e) => e.startsWith('intro'))) console.log(`  ok       intro     ${f.intro.length} caractères`);
  avis.forEach((a) => console.log(`  note     ${a}`));
  erreurs.slice(0, 60).forEach((e) => console.log(`  REFUSÉ   ${e}`));
  if (erreurs.length > 60) console.log(`  ... et ${erreurs.length - 60} autres erreurs`);
  console.log(`\n${axes.length} axe${axes.length > 1 ? 's' : ''} valide${axes.length > 1 ? 's' : ''} ; ${erreurs.length} erreur${erreurs.length > 1 ? 's' : ''}.`);
  /* Tout ou rien : un fichier fautif n'écrit rien, pas même ses axes justes. */
  if (erreurs.length) { console.log('\nLe fichier a des erreurs : rien n\'est écrit. Corrigez-le, puis relancez.'); process.exit(1); }
  if (!VRAI) { console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour verser sur l\'émulateur.'); process.exit(0); }

  const { bdd, FieldValue, Timestamp } = await ouvrirBase();
  const projet = await bdd.doc(`projets/${PROJET_CIBLE}`).get();
  if (!projet.exists) { console.error(`\nLe projet ${PROJET_CIBLE} n'existe pas dans cette base. Rien n'est écrit.`); process.exit(2); }
  console.log(`\nProjet visé : ${projet.get('nom') || PROJET_CIBLE}`);
  if (PRODUCTION) await sauvegarder(bdd, Timestamp, ['axes', 'axesIntro']);

  const col = bdd.collection(`projets/${PROJET_CIBLE}/axes`);
  const existants = new Map((await col.get()).docs.map((d) => [d.id, d.data()]));
  const date = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
  const epargnes = [];
  let crees = 0; let maj = 0;
  const lot = bdd.batch();
  for (const a of axes) {
    const doc = versDocumentAxe(a);
    const avant = existants.get(a.id);
    if (avant) {
      if (date(avant.editeLe) > date(avant.importeLe) && !ECRASER) { epargnes.push(a.id); continue; }
      lot.set(col.doc(a.id), {
        ...doc, maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp(),
        ...(PUBLIER && avant.publication !== 'publiee' ? { publication: 'publiee', publieLe: FieldValue.serverTimestamp() } : {}),
      }, { merge: true });
      maj += 1;
    } else {
      lot.set(col.doc(a.id), {
        ...doc, etat: 'propose', publication: PUBLIER ? 'publiee' : 'brouillon', publieLe: PUBLIER ? FieldValue.serverTimestamp() : null,
        devis: '', reponse: null, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp(),
      });
      crees += 1;
    }
  }
  if (typeof f.intro === 'string') lot.set(bdd.doc(`projets/${PROJET_CIBLE}/axesIntro/texte`), { texte: f.intro.trim(), maj: FieldValue.serverTimestamp() });
  await lot.commit();
  const absents = [...existants.keys()].filter((id) => !axes.some((a) => a.id === id));
  console.log(`\n${crees} axe${crees > 1 ? 's' : ''} créé${crees > 1 ? 's' : ''}, ${maj} mis à jour${typeof f.intro === 'string' ? ', introduction posée' : ''}.`);
  if (epargnes.length) console.log(`Retouchés dans le Cockpit depuis le dernier import, laissés tels quels (--ecraser pour les remplacer) : ${epargnes.join(', ')}`);
  if (absents.length) console.log(`En base mais absents du fichier, laissés en place : ${absents.join(', ')}`);
  process.exit(0);
}

/* ==========================================================================
   2. Convertir les suggestions
   ========================================================================== */

async function convertir() {
  console.log(`Conversion : projets/${PROJET_CIBLE}/suggestions vers projets/${PROJET_CIBLE}/axes (axes « sugg-<id> »)\n`);
  if (!VRAI && !SUR_EMULATEUR) {
    console.log('À blanc hors émulateur : aucune base n\'est lue. Lancez sur l\'émulateur pour voir le détail, ou --vrai --production sur ordre explicite.');
    process.exit(0);
  }
  const { bdd, FieldValue, Timestamp } = await ouvrirBase();
  const projet = await bdd.doc(`projets/${PROJET_CIBLE}`).get();
  if (!projet.exists) { console.error(`Le projet ${PROJET_CIBLE} n'existe pas dans cette base.`); process.exit(2); }
  const suggestions = (await bdd.collection(`projets/${PROJET_CIBLE}/suggestions`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const axesCol = bdd.collection(`projets/${PROJET_CIBLE}/axes`);
  const deja = new Set((await axesCol.get()).docs.map((d) => d.id));
  const aFaire = [];
  for (const s of suggestions) {
    const id = `sugg-${s.id}`.slice(0, 60);
    const { doc, prix } = axeDepuisSuggestion(s);
    const etat = deja.has(id) ? 'déjà converti' : 'à convertir';
    console.log(`  ${etat.padEnd(14)} ${s.id.padEnd(22)} ${doc.plateforme.padEnd(8)} ${doc.publication.padEnd(9)} « ${doc.titre} »${doc.reponse ? ` · réponse ${doc.reponse.choix} de ${doc.reponse.nom || doc.reponse.par}` : ''}${prix != null ? ' · prix' : ''}`);
    if (!deja.has(id)) aFaire.push({ id, s, doc, prix });
  }
  const publiees = suggestions.filter((s) => s.publication === 'publiee').length;
  console.log(`\n${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''} (${publiees} publiée${publiees > 1 ? 's' : ''}) ; ${aFaire.length} à convertir.`);
  if (!VRAI) { console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour convertir sur l\'émulateur.'); process.exit(0); }
  if (!aFaire.length) { console.log('Rien à convertir.'); process.exit(0); }
  if (PRODUCTION) await sauvegarder(bdd, Timestamp, ['axes', 'axesIntro', 'suggestions', 'montants']);
  const lot = bdd.batch();
  for (const { id, s, doc, prix } of aFaire) {
    lot.set(axesCol.doc(id), {
      ...doc, ordre: 100 + (Number(doc.ordre) || 0),
      reponse: doc.reponse ? { ...doc.reponse, le: doc.reponse.le || FieldValue.serverTimestamp() } : null,
      publieLe: doc.publication === 'publiee' ? (s.publieLe || FieldValue.serverTimestamp()) : null,
      cree: s.cree || FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp(),
    });
    if (prix != null) lot.set(bdd.doc(`projets/${PROJET_CIBLE}/montants/axe-${id}`), { projet: PROJET_CIBLE, montant: prix, maj: FieldValue.serverTimestamp() });
  }
  await lot.commit();
  console.log(`${aFaire.length} axe${aFaire.length > 1 ? 's' : ''} créé${aFaire.length > 1 ? 's' : ''} depuis les suggestions. Les suggestions restent en base, intactes.`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  garde();
  (CONVERTIR ? convertir() : importer()).catch((e) => { console.error(e); process.exit(1); });
}
