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
import { composerPaquet, construire, fichiersSuivis, INTERDITS, DOSSIERS, FICHIERS_RACINE, FICHIERS_VIDES } from './paquet-academy.mjs';

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
verifier(surDisque.every((c) => FICHIERS_RACINE.includes(c) || FICHIERS_VIDES.includes(c) || DOSSIERS.some((d) => c.startsWith(d))), 'tout fichier vient de la liste blanche');
verifier(surDisque.length === 76, `le paquet compte exactement 76 fichiers (${surDisque.length})`);
verifier(FICHIERS_VIDES.every((c) => surDisque.includes(c) && statSync(join(sortie, c)).size === 0), 'le .gitkeep du dossier des cours est dans le paquet, et vide');
verifier(surDisque.filter((c) => /(^|\/)\.git/.test(c)).join() === 'assets/img/cours/.gitkeep', 'aucun autre fichier .git* n entre dans le paquet');
for (const attendu of ['index.html', '.htaccess', 'assets/js/app.js', 'formations/index.html']) verifier(surDisque.includes(attendu), `le site est complet : ${attendu}`);
for (const interdit of ['fonctions-suivi/suivi.js', 'suivi/firestore.rules', 'firebase.suivi.json', 'package.json', 'storage.rules', 'firestore.indexes.json', 'README.md']) {
  verifier(!surDisque.includes(interdit), `absent du paquet : ${interdit}`);
}
verifier(!surDisque.some((c) => c.startsWith('fonctions-suivi/') || c.startsWith('suivi/') || c.startsWith('outils/') || c.startsWith('docs/')), 'aucun dossier interne (fonctions-suivi, suivi, outils, docs)');

console.log('\n== Chaque lien local du paquet mène à un fichier du paquet');
/* Le serveur sert /page par page.html et /dossier/ par dossier/index.html
   (.htaccess) : un lien se résout comme lui. Un lien qui ne mène à rien
   dans le paquet est une page ou un fichier que le déploiement ne publie
   pas, ou qu'il va SUPPRIMER du serveur. */
const present = new Set(surDisque);
const resoudre = (depuis, lien) => {
  const net = lien.split('#')[0].split('?')[0];
  if (!net) return true;
  const base = net.startsWith('/') ? net.slice(1) : join(depuis.split('/').slice(0, -1).join('/'), net).replace(/\\/g, '/');
  const c = base.replace(/^\.\//, '').replace(/\/$/, '/index.html').replace(/^$/, 'index.html');
  return [c, `${c}.html`, `${c}/index.html`].some((x) => present.has(x.replace(/^\//, '')));
};
const casses = [];
let liens = 0;
for (const f of surDisque.filter((c) => /\.(html|css|js)$/.test(c))) {
  const src = readFileSync(join(sortie, f), 'utf8');
  const trouves = f.endsWith('.html')
    ? [...src.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    : f.endsWith('.css')
      ? [...src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1])
      : [...src.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
  for (const l of trouves) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\$\{|\{)/.test(l) || l.includes('${')) continue;
    liens += 1;
    if (!resoudre(f, l)) casses.push(`${f} -> ${l}`);
  }
}
verifier(liens > 50, `les liens locaux sont lus (${liens})`);
verifier(!resoudre('index.html', '/fonctions-suivi/suivi.js') && !resoudre('formations/index.html', '../page-absente') && resoudre('formations/index.html', '../assets/css/az.css') && resoudre('index.html', '/formations/'), 'la résolution distingue un lien mort d un lien vivant');
verifier(!casses.length, 'aucun lien local cassé', casses.slice(0, 8).join(' | '));
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
