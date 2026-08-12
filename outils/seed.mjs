#!/usr/bin/env node
/* ==========================================================================
   ATELIER ZÉRO — Envoi du contenu vers Firestore

   Lit les fichiers de contenu/*.md, sépare l'en-tête des métadonnées du
   markdown, et écrit deux collections :

     lecons/{id}    → { ordre, titre, resume, duree, offre }   (le sommaire)
     contenus/{id}  → { offre, markdown }                      (le cours)

   Ce découpage est imposé par les règles Firestore : voir firestore.rules.

   Usage :
     export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/cle-service.json
     node outils/seed.mjs            # envoie tout
     node outils/seed.mjs --sec      # affiche ce qui serait envoyé, sans écrire

   ⚠️  La clé de service ne doit JAMAIS être commitée.
   ========================================================================== */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// firebase-admin est importé plus bas, à la demande : le mode --sec doit
// pouvoir tourner sans aucune dépendance installée.

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(ICI, '..', 'contenu');
const A_SEC = process.argv.includes('--sec');

/* --- Lecture de l'en-tête ------------------------------------------------ */
function separer(texte) {
  const m = texte.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("en-tête « --- » manquant ou mal formé");

  const meta = {};
  for (const ligne of m[1].split('\n')) {
    const sep = ligne.indexOf(':');
    if (sep === -1) continue;
    const cle = ligne.slice(0, sep).trim();
    let val = ligne.slice(sep + 1).trim();
    meta[cle] = /^\d+$/.test(val) ? Number(val) : val;
  }
  return { meta, markdown: m[2].trim() };
}

function valider(meta, fichier) {
  const requis = ['id', 'ordre', 'titre', 'resume', 'offre'];
  for (const cle of requis) {
    if (meta[cle] === undefined || meta[cle] === '') {
      throw new Error(`${fichier} : champ « ${cle} » manquant`);
    }
  }
  if (!['essentiel', 'complet'].includes(meta.offre)) {
    throw new Error(`${fichier} : offre doit valoir « essentiel » ou « complet »`);
  }
  if (typeof meta.ordre !== 'number') {
    throw new Error(`${fichier} : ordre doit être un nombre`);
  }
}

/* --- Programme ----------------------------------------------------------- */
const fichiers = (await readdir(DOSSIER))
  .filter((f) => f.endsWith('.md'))
  .sort();

if (!fichiers.length) {
  console.error('Aucun fichier .md dans contenu/');
  process.exit(1);
}

const lecons = [];
const ordres = new Set();
const ids = new Set();

for (const fichier of fichiers) {
  const brut = await readFile(join(DOSSIER, fichier), 'utf8');
  let separe;
  try {
    separe = separer(brut);
  } catch (e) {
    console.error(`✗ ${fichier} : ${e.message}`);
    process.exit(1);
  }

  const { meta, markdown } = separe;
  try {
    valider(meta, fichier);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }

  if (ids.has(meta.id))       { console.error(`✗ id en double : ${meta.id}`);       process.exit(1); }
  if (ordres.has(meta.ordre)) { console.error(`✗ ordre en double : ${meta.ordre}`); process.exit(1); }
  ids.add(meta.id);
  ordres.add(meta.ordre);

  lecons.push({ meta, markdown, fichier });
}

lecons.sort((a, b) => a.meta.ordre - b.meta.ordre);

console.log(`\n${lecons.length} module(s) trouvé(s) :\n`);
for (const { meta, markdown } of lecons) {
  const mots = markdown.split(/\s+/).length;
  const marque = meta.offre === 'complet' ? '🔒' : '  ';
  console.log(
    ` ${marque} ${String(meta.ordre).padStart(2, '0')} · ${meta.titre}` +
    `  ${String(mots).padStart(5)} mots`
  );
}

const total = lecons.reduce((n, l) => n + l.markdown.split(/\s+/).length, 0);
console.log(`\n   Total : ${total.toLocaleString('fr-FR')} mots\n`);

if (A_SEC) {
  console.log('Mode --sec : rien n’a été écrit.\n');
  process.exit(0);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS n’est pas défini.\n' +
    'Console Firebase → Paramètres → Comptes de service → Générer une clé,\n' +
    'puis :  export GOOGLE_APPLICATION_CREDENTIALS=/chemin/cle.json\n'
  );
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const bdd = getFirestore();

const lot = bdd.batch();

for (const { meta, markdown } of lecons) {
  lot.set(bdd.doc(`lecons/${meta.id}`), {
    ordre:  meta.ordre,
    titre:  meta.titre,
    resume: meta.resume,
    duree:  meta.duree || '',
    offre:  meta.offre,
  });

  lot.set(bdd.doc(`contenus/${meta.id}`), {
    offre: meta.offre,     // dupliqué : la règle Firestore le lit ici
    markdown,
  });
}

await lot.commit();
console.log(`✓ ${lecons.length} modules envoyés dans Firestore.\n`);
process.exit(0);
