/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'import des fiches des parties d'un projet

   Lit un dossier de fiches, un fichier JSON par partie (<id>.json, id parmi
   ios, android, web, admin, backend, landing...), et les verse sur
   projets/{projet}/composants/{id}. Le format est celui de FORMAT.md
   (~/ForgeMe-tests/parties-hub/FORMAT.md) ; la validation est celle de la
   page et de l'éditeur du Cockpit (agence/suivi/assets/js/partie-format.js).
   Chaque fichier est vérifié en entier avant toute écriture ; un fichier
   invalide est refusé en disant pourquoi, les autres passent.

   EN FUSION : seuls les champs présents dans le fichier sont écrits. Un
   champ de la partie absent du fichier (progression, responsable, ordre,
   lien, description...) n'est jamais touché ni retiré.

   La partie visée : le document qui porte l'identifiant du fichier, sinon
   celui dont le type est cet identifiant (une partie créée dans le Cockpit
   porte un identifiant tiré au hasard), sinon une partie neuve
   composants/<id>, de ce type.

   À BLANC PAR DÉFAUT : rien n'est lu ni écrit dans une base.

     node parties-importer.mjs <projet> [dossier]                      (à blanc)
     node parties-importer.mjs <projet> [dossier] --vrai               (émulateur seulement)
     node parties-importer.mjs <projet> [dossier] --vrai --production  (PRODUCTION, sur ordre explicite)

   Dossier par défaut : ~/ForgeMe-tests/parties-hub.
   --ecraser : réécrit aussi une partie retouchée dans le Cockpit depuis le
   dernier import (sinon elle est laissée telle quelle, et le bilan le dit).

   En production, toutes les parties du projet sont sauvegardées en JSON,
   hors du dépôt, AVANT la première écriture : ~/Capmedia/sauvegardes/parties/
   (ou $SAUVEGARDES).
   ========================================================================== */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { validerPartie, versDocumentPartie, CHAMPS_FICHE } from '../../agence/suivi/assets/js/partie-format.js';

const arg = (nom) => process.argv.includes(nom);
const [PROJET_CIBLE, DOSSIER_ARG] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DOSSIER = DOSSIER_ARG || join(homedir(), 'ForgeMe-tests', 'parties-hub');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ECRASER = arg('--ecraser');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const CONNUS = ['ios', 'android', 'web', 'admin', 'backend', 'landing'];

const resumeFiche = (p) => [
  p.nom ? `« ${p.nom} »` : '',
  Array.isArray(p.fonctions) ? `${p.fonctions.length} fonctions` : '',
  Array.isArray(p.historique) ? `${p.historique.length} dates` : '',
  Array.isArray(p.technologies) ? `${p.technologies.length} technologies` : '',
  `${CHAMPS_FICHE.filter((c) => p[c] !== undefined).length}/${CHAMPS_FICHE.length} champs`,
].filter(Boolean).join(', ');

async function main() {
  if (!PROJET_CIBLE) {
    console.error('Usage : node parties-importer.mjs <projet> [dossier] [--vrai [--production]] [--ecraser]');
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

  console.log(VRAI
    ? (SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE} : ÉCRITURE` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} : ÉCRITURE !!!\n`)
    : 'À blanc : aucune base n\'est lue ni écrite.');
  console.log(`Fiches lues dans ${dossier}`);
  console.log(`Destination : projets/${PROJET_CIBLE}/composants (en fusion)\n`);

  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort();
  const valides = [];
  const refuses = [];
  for (const f of fichiers) {
    const id = basename(f, '.json');
    let p;
    try { p = JSON.parse(readFileSync(join(dossier, f), 'utf8')); } catch (e) {
      refuses.push({ f, erreurs: [`JSON illisible : ${e.message}`] });
      continue;
    }
    const { erreurs, avis } = validerPartie(p, { fichier: true, attenduId: id });
    if (!CONNUS.includes(id)) avis.push(`identifiant « ${id} » hors des six parties habituelles (${CONNUS.join(', ')})`);
    if (erreurs.length) { refuses.push({ f, erreurs }); continue; }
    valides.push({ f, p, avis });
  }
  for (const v of valides) {
    console.log(`  ok       ${v.p.id.padEnd(10)} ${resumeFiche(v.p)}`);
    v.avis.forEach((a) => console.log(`             note : ${a}`));
  }
  for (const r of refuses) {
    console.log(`  REFUSÉ   ${r.f}`);
    r.erreurs.slice(0, 40).forEach((e) => console.log(`             ${e}`));
    if (r.erreurs.length > 40) console.log(`             ... et ${r.erreurs.length - 40} autres erreurs`);
  }
  console.log(`\n${valides.length} ${valides.length > 1 ? 'fiches valides' : 'fiche valide'} ; ${refuses.length} ${refuses.length > 1 ? 'fichiers refusés' : 'fichier refusé'}.`);

  if (!VRAI) {
    console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour verser sur l\'émulateur.');
    process.exit(refuses.length ? 1 : 0);
  }
  if (!valides.length) { console.log('\nRien à verser.'); process.exit(refuses.length ? 1 : 0); }

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJET_FIREBASE });
  const bdd = getFirestore();

  const projet = await bdd.doc(`projets/${PROJET_CIBLE}`).get();
  if (!projet.exists) { console.error(`\nLe projet ${PROJET_CIBLE} n'existe pas dans cette base. Rien n'est écrit.`); process.exit(2); }
  console.log(`\nProjet visé : ${projet.get('nom') || PROJET_CIBLE}`);
  const col = bdd.collection(`projets/${PROJET_CIBLE}/composants`);
  const existants = (await col.get()).docs.map((d) => ({ id: d.id, donnees: d.data() }));

  /* La sauvegarde, AVANT la première écriture, en production. */
  if (PRODUCTION) {
    const versJson = (v) => {
      if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
      if (Array.isArray(v)) return v.map(versJson);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
      return v;
    };
    const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'parties');
    mkdirSync(lieu, { recursive: true });
    const fichier = join(lieu, `${PROJET_CIBLE}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(fichier, JSON.stringify({ projet: PROJET_CIBLE, base: PROJET_FIREBASE, le: new Date().toISOString(), documents: existants.map((d) => ({ id: d.id, donnees: versJson(d.donnees) })) }, null, 2));
    console.log(`Sauvegarde de l'existant (${existants.length} parties) : ${fichier}`);
  }

  const date = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
  let ecrites = 0;
  let creees = 0;
  const epargnees = [];
  const ordreMax = existants.reduce((m, d) => Math.max(m, Number(d.donnees.ordre) || 0), 0);
  for (const v of valides) {
    const cible = existants.find((d) => d.id === v.p.id) || existants.find((d) => d.donnees.type === v.p.id) || null;
    if (cible && date(cible.donnees.editeLe) > date(cible.donnees.importeLe) && !ECRASER) { epargnees.push(`${v.p.id} (composants/${cible.id})`); continue; }
    const donnees = { ...versDocumentPartie(v.p), maj: FieldValue.serverTimestamp(), importeLe: FieldValue.serverTimestamp() };
    if (cible) {
      await col.doc(cible.id).set(donnees, { merge: true });
      console.log(`  versée   ${v.p.id.padEnd(10)} sur composants/${cible.id}${cible.id !== v.p.id ? ` (type ${v.p.id})` : ''}`);
    } else {
      await col.doc(v.p.id).set({
        type: v.p.id, statut: 'en-cours', progression: 0, ordre: ordreMax + creees + 1, techno: [], description: '',
        ...donnees, cree: FieldValue.serverTimestamp(),
      }, { merge: true });
      creees += 1;
      console.log(`  créée    ${v.p.id.padEnd(10)} composants/${v.p.id} (aucune partie de ce type)`);
    }
    ecrites += 1;
  }
  console.log(`\n${ecrites} ${ecrites > 1 ? 'fiches versées' : 'fiche versée'}${creees ? `, dont ${creees} ${creees > 1 ? 'parties créées' : 'partie créée'}` : ''}.`);
  if (epargnees.length) console.log(`Retouchées dans le Cockpit depuis le dernier import, laissées telles quelles (--ecraser pour les remplacer) : ${epargnees.join(', ')}`);
  process.exit(refuses.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
