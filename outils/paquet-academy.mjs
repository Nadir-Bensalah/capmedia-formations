/* ==========================================================================
   Le paquet de l'Academy : ce qui part sur le serveur, et rien d'autre.

   Le déploiement envoyait autrefois TOUT le dépôt vers /academy, moins une
   liste d'exclusions. Chaque dossier ajouté à la racine partait donc en
   ligne sans que personne ne l'ait décidé : c'est ainsi que le code des
   fonctions du Hub, ses règles et ses outils se sont retrouvés servis
   publiquement.

   Le paquet se construit désormais par LISTE BLANCHE : un fichier n'est
   publié que s'il figure dans les fichiers suivis par Git ET sous une
   entrée ci-dessous ET avec une extension de site. Un nouveau dossier
   n'est jamais publié tant qu'on ne l'ajoute pas ici, à la main.

     node outils/paquet-academy.mjs <dossier-de-sortie>
     node outils/paquet-academy.mjs --liste      (affiche le paquet sans rien copier)
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Les pages et fichiers de la racine du site, un par un. */
export const FICHIERS_RACINE = [
  '.htaccess', 'index.html', 'acces.html', 'apps.html', 'cgv.html', 'compte.html',
  'confidentialite.html', 'cookies.html', 'mentions.html', 'merci.html', 'robots.txt', 'sitemap.xml',
];

/* Un dossier vide du site, tenu par un .gitkeep (vide). Le déploiement FTP garde
   l'état du dernier envoi : sans ce fichier, il cherchait à supprimer le dossier
   « assets/img/cours », absent du serveur, échouait (550) et s'arrêtait avant
   de retirer les anciens fichiers. Nommé un par un, jamais par extension. */
export const FICHIERS_VIDES = ['assets/img/cours/.gitkeep'];

/* Les dossiers du site, publiés avec leur contenu (filtré par extension). */
export const DOSSIERS = ['app/', 'assets/', 'en/', 'formations/'];

/* Ce qu'un site sert. Un script d'outil, une règle ou une donnée n'en fait pas partie. */
export const EXTENSIONS = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.gif', '.woff', '.woff2', '.txt', '.xml'];

/* Ce qui ne doit JAMAIS entrer dans le paquet, quoi que dise la liste blanche.
   C'est le filet du test : si une entrée de la liste blanche l'attrapait un
   jour, la construction échouerait au lieu de publier. */
export const INTERDITS = [
  /(^|\/)fonctions-suivi\//, /(^|\/)fonctions\//, /(^|\/)suivi\//, /(^|\/)agence\//,
  /(^|\/)outils\//, /(^|\/)docs\//, /(^|\/)promo\//, /(^|\/)contenu(-en)?\//, /(^|\/)\.github\//,
  /(^|\/)node_modules\//, /(^|\/)donnees-locales\//, /(^|\/)qa\//,
  /(^|\/)firebase[^/]*\.json$/, /\.rules$/, /(^|\/)firestore\.indexes\.json$/, /(^|\/)package(-lock)?\.json$/,
  /\.secret/, /\.env/, /\.(mjs|cjs|py|pyc|tsv|md|log)$/, /serviceAccount|service-account/i, /\.(pem|p8|p12|key)$/,
];

const racineDepot = () => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Les fichiers suivis par Git, relatifs à la racine du dépôt. */
export const fichiersSuivis = (racine = racineDepot()) => execFileSync('git', ['ls-files', '-z'], { cwd: racine, encoding: 'utf8' })
  .split('\0').filter(Boolean);

/** Le contenu du paquet, calculé à partir d'une liste de chemins. Lève si un interdit y entre.
    `liste` ne sert qu'aux tests, pour éprouver le filet avec une liste blanche fautive. */
export const composerPaquet = (chemins, liste = { fichiers: [...FICHIERS_RACINE, ...FICHIERS_VIDES], dossiers: DOSSIERS }) => {
  const dansListeBlanche = (c) => liste.fichiers.includes(c) || liste.dossiers.some((d) => c.startsWith(d));
  const extensionPermise = (c) => liste.fichiers.includes(c) || EXTENSIONS.some((e) => c.toLowerCase().endsWith(e));
  const paquet = chemins.filter((c) => dansListeBlanche(c) && extensionPermise(c)).sort();
  const fautifs = paquet.filter((c) => INTERDITS.some((r) => r.test(c)));
  if (fautifs.length) throw new Error(`Chemins interdits dans le paquet Academy : ${fautifs.join(', ')}`);
  return paquet;
};

/** Construit le paquet dans `sortie` (vidé d'abord). Rend la liste copiée. */
export const construire = (sortie, racine = racineDepot()) => {
  const paquet = composerPaquet(fichiersSuivis(racine));
  const cible = resolve(sortie);
  if (existsSync(cible)) rmSync(cible, { recursive: true, force: true });
  for (const chemin of paquet) {
    const dest = join(cible, chemin);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(racine, chemin), dest);
  }
  return paquet;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--liste')) {
    for (const c of composerPaquet(fichiersSuivis())) console.log(c);
  } else {
    const sortie = process.argv[2];
    if (!sortie) { console.error('Usage : node outils/paquet-academy.mjs <dossier-de-sortie>'); process.exit(2); }
    const paquet = construire(sortie);
    console.log(`${paquet.length} fichiers dans le paquet Academy (${sortie}).`);
  }
}
