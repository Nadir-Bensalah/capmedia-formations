/* ==========================================================================
   Le paquet de l'Academy ne publie que la liste blanche.

   Rien ne doit jamais partir sur /academy qui ne soit une page du site :
   ni le code des fonctions, ni les règles, ni les outils, ni les données.
   Ce test construit le vrai paquet et le fouille, éprouve la liste blanche
   sur des chemins inventés (dont un dossier « ajouté demain »), et vérifie
   que le déploiement passe bien par ce paquet.

     node outils/paquet-academy.test.mjs
   ========================================================================== */

import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { composerPaquet, construire, fichiersSuivis, INTERDITS, DOSSIERS, FICHIERS_RACINE } from './paquet-academy.mjs';

let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };
const verifier = (c, m, detail = '') => (c ? ok(m) : dire(detail ? `${m} · ${detail}` : m));

console.log('\n== Le vrai paquet, construit sur le disque');
const sortie = mkdtempSync(join(tmpdir(), 'paquet-academy-'));
const paquet = construire(sortie);
const surDisque = [];
const parcourir = (d) => { for (const n of readdirSync(d)) { const c = join(d, n); if (statSync(c).isDirectory()) parcourir(c); else surDisque.push(relative(sortie, c)); } };
parcourir(sortie);
verifier(surDisque.length === paquet.length && surDisque.every((c) => paquet.includes(c)), 'le dossier construit contient exactement la liste calculée', `${surDisque.length} contre ${paquet.length}`);
const fautifs = surDisque.filter((c) => INTERDITS.some((r) => r.test(c)));
verifier(!fautifs.length, 'aucun chemin interdit dans le dossier construit', fautifs.join(', '));
verifier(surDisque.every((c) => FICHIERS_RACINE.includes(c) || DOSSIERS.some((d) => c.startsWith(d))), 'tout fichier vient de la liste blanche');
for (const attendu of ['index.html', '.htaccess', 'assets/js/app.js', 'formations/index.html']) verifier(surDisque.includes(attendu), `le site est complet : ${attendu}`);
for (const interdit of ['fonctions-suivi/suivi.js', 'suivi/firestore.rules', 'firebase.suivi.json', 'package.json', 'storage.rules', 'firestore.indexes.json', 'README.md']) {
  verifier(!surDisque.includes(interdit), `absent du paquet : ${interdit}`);
}
verifier(!surDisque.some((c) => c.startsWith('fonctions-suivi/') || c.startsWith('suivi/') || c.startsWith('outils/') || c.startsWith('docs/')), 'aucun dossier interne (fonctions-suivi, suivi, outils, docs)');
rmSync(sortie, { recursive: true, force: true });

console.log('\n== La liste blanche éprouvée sur des chemins inventés');
const inventes = ['index.html', 'assets/js/nouveau.js', 'nouveau-dossier/secret.json', 'nouveau-dossier/page.html',
  'fonctions-suivi/suivi.js', 'fonctions-suivi/outils/donnees-locales/pieces.mjs', 'suivi/storage.rules', 'firebase.suivi.json',
  'assets/outil.mjs', 'app/donnees.tsv', 'formations/brouillon.md', 'en/index.html'];
const choisis = composerPaquet(inventes);
verifier(JSON.stringify(choisis) === JSON.stringify(['assets/js/nouveau.js', 'en/index.html', 'index.html']), 'seules les pages de la liste blanche passent', JSON.stringify(choisis));
verifier(!choisis.some((c) => c.startsWith('nouveau-dossier/')), 'un dossier ajouté demain à la racine n est jamais publié');

console.log('\n== Le filet : une liste blanche fautive fait échouer la construction');
let leve = false;
try { composerPaquet(['fonctions-suivi/suivi.js'], { fichiers: FICHIERS_RACINE, dossiers: [...DOSSIERS, 'fonctions-suivi/'] }); } catch (e) { leve = /interdits/.test(e.message); }
verifier(leve, 'élargir la liste blanche à fonctions-suivi/ lève une erreur au lieu de publier');
leve = false;
try { composerPaquet(['firebase.suivi.json'], { fichiers: [...FICHIERS_RACINE, 'firebase.suivi.json'], dossiers: DOSSIERS }); } catch (e) { leve = true; }
verifier(leve, 'ajouter firebase.suivi.json aux fichiers de la racine lève aussi');

console.log('\n== Le déploiement passe par le paquet');
const flux = readFileSync(new URL('../.github/workflows/deploiement.yml', import.meta.url), 'utf8');
verifier(/node outils\/paquet-academy\.test\.mjs/.test(flux), 'le déploiement lance ce test avant d envoyer');
verifier(/node outils\/paquet-academy\.mjs\s+paquet-academy/.test(flux), 'le déploiement construit le paquet');
verifier(/local-dir:\s*\.\/paquet-academy\//.test(flux), 'le FTP envoie le paquet et lui seul');
verifier(!/^\s*exclude:/m.test(flux), 'plus aucune logique d exclusion (liste noire)');
verifier(fichiersSuivis().length > 0, 'la liste vient des fichiers suivis par Git (un fichier non suivi ne part jamais)');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
