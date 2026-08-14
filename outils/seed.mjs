#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA ACADEMY · Envoi du contenu vers Firestore (multi-formations)

   Structure des fichiers :  contenu/<slug>/<module>.md
   Structure Firestore    :  formations/<slug>/lecons/<id>    (sommaire)
                             formations/<slug>/contenus/<id>  (markdown)

   Usage :
     node outils/seed.mjs             envoie tout
     node outils/seed.mjs --sec       aperçu sans écrire
     node outils/seed.mjs github      une seule formation

   Purge automatique : les documents dont l'id ne correspond plus à aucun
   fichier sont supprimés, formation par formation. Les anciennes
   collections racine lecons/ et contenus/ (avant multi-formations) sont
   nettoyées si présentes.
   ========================================================================== */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const EN = ARGS.includes('--en');
const DOSSIER = join(ICI, '..', EN ? 'contenu-en' : 'contenu');
const PREFIXE = EN ? 'formations-en' : 'formations';
const A_SEC = ARGS.includes('--sec');
const CIBLE = ARGS.find((a) => !a.startsWith('--')) || null;

/* --- Lecture de l'en-tête ------------------------------------------------ */
function separer(texte) {
  const m = texte.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('en-tête manquant ou mal formé');
  const meta = {};
  for (const ligne of m[1].split('\n')) {
    const sep = ligne.indexOf(':');
    if (sep === -1) continue;
    const cle = ligne.slice(0, sep).trim();
    let val = ligne.slice(sep + 1).trim();
    // Tolérer les guillemets YAML autour des valeurs (titres avec deux-points)
    if (val.length > 1 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    meta[cle] = /^\d+$/.test(val) ? Number(val) : val;
  }
  return { meta, markdown: m[2].trim() };
}

function valider(meta, fichier) {
  for (const cle of ['id', 'ordre', 'titre', 'resume', 'offre']) {
    if (meta[cle] === undefined || meta[cle] === '') {
      throw new Error(`${fichier} : champ « ${cle} » manquant`);
    }
  }
  if (!['essentiel', 'complet'].includes(meta.offre)) {
    throw new Error(`${fichier} : offre invalide`);
  }
}

/* --- Collecte ------------------------------------------------------------ */
const formations = {};
for (const entree of (await readdir(DOSSIER)).sort()) {
  const chemin = join(DOSSIER, entree);
  if (!(await stat(chemin)).isDirectory()) continue;
  if (CIBLE && entree !== CIBLE) continue;

  const lecons = [];
  const ids = new Set(); const ordres = new Set();
  for (const f of (await readdir(chemin)).filter((x) => x.endsWith('.md')).sort()) {
    const { meta, markdown } = separer(await readFile(join(chemin, f), 'utf8'));
    valider(meta, `${entree}/${f}`);
    if (ids.has(meta.id))       throw new Error(`${entree} : id en double ${meta.id}`);
    if (ordres.has(meta.ordre)) throw new Error(`${entree} : ordre en double ${meta.ordre}`);
    ids.add(meta.id); ordres.add(meta.ordre);
    lecons.push({ meta, markdown });
  }
  lecons.sort((a, b) => a.meta.ordre - b.meta.ordre);
  if (lecons.length) formations[entree] = lecons;
}

let totalModules = 0, totalMots = 0;
for (const [slug, lecons] of Object.entries(formations)) {
  const mots = lecons.reduce((n, l) => n + l.markdown.split(/\s+/).length, 0);
  totalModules += lecons.length; totalMots += mots;
  console.log(`  ${slug.padEnd(16)} ${String(lecons.length).padStart(2)} module(s)  ${String(mots).padStart(6)} mots`);
}
console.log(`\n  Total : ${totalModules} modules, ${totalMots.toLocaleString('fr-FR')} mots\n`);

if (A_SEC) { console.log('Mode --sec : rien écrit.'); process.exit(0); }

/* --- Écriture ------------------------------------------------------------ */
const PROJET = process.env.FIREBASE_PROJECT || 'capmedia-academy';
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: PROJET });
const bdd = getFirestore();
console.log(`Projet : ${PROJET}`);

for (const [slug, lecons] of Object.entries(formations)) {
  const lot = bdd.batch();
  for (const { meta, markdown } of lecons) {
    lot.set(bdd.doc(`${PREFIXE}/${slug}/lecons/${meta.id}`), {
      ordre: meta.ordre, titre: meta.titre, resume: meta.resume,
      duree: meta.duree || '', offre: meta.offre,
      ...(meta.famille ? { famille: meta.famille } : {}),
    });
    lot.set(bdd.doc(`${PREFIXE}/${slug}/contenus/${meta.id}`), {
      offre: meta.offre, markdown,
    });
  }
  await lot.commit();

  // Purge des orphelins de cette formation
  const idsActuels = new Set(lecons.map((l) => l.meta.id));
  for (const col of ['lecons', 'contenus']) {
    for (const ref of await bdd.collection(`${PREFIXE}/${slug}/${col}`).listDocuments()) {
      if (!idsActuels.has(ref.id)) {
        await ref.delete();
        console.log(`  - supprimé formations/${slug}/${col}/${ref.id}`);
      }
    }
  }
  console.log(`  ok ${slug}`);
}

/* --- Nettoyage de l'ancienne structure racine ----------------------------- */
if (!CIBLE) {
  for (const col of ['lecons', 'contenus']) {
    const anciens = await bdd.collection(col).listDocuments();
    for (const ref of anciens) await ref.delete();
    if (anciens.length) console.log(`  - ancienne collection ${col}/ nettoyée (${anciens.length})`);
  }
}

console.log('Terminé.');
process.exit(0);
