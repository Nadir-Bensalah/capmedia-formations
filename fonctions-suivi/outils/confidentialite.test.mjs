/* ==========================================================================
   Aucune donnée réelle dans le dépôt public.

   Le dépôt est public. Les outils y restent, leurs données réelles non :
   elles vivent dans `fonctions-suivi/outils/donnees-locales/`, ignoré par
   Git. Ce test fouille les fichiers SUIVIS du Hub et échoue sur :
   - une adresse e-mail hors des domaines permis (exemple.test, essai.test,
     et capmedia.app, l'expéditeur du produit) ;
   - un chemin personnel du disque ;
   - un lien vers les dépôts privés ;
   - tout terme de `donnees-locales/interdits.txt` (noms réels des
     clients, un par ligne), si ce fichier existe sur la machine.

     node fonctions-suivi/outils/confidentialite.test.mjs
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '..', '..');
const PERIMETRE = ['fonctions-suivi', 'agence/suivi', 'suivi', 'firebase.suivi.json', 'outils/paquet-academy.mjs', 'outils/paquet-academy.test.mjs', '.github'];
const DOMAINES_PERMIS = /@[A-Za-z0-9.-]+\.test\b|@capmedia\.app\b/i;
const MOTIFS = [
  { nom: 'chemin personnel du disque', re: /\/Users\/[A-Za-z]|\/home\/[a-z]+\/|C:\\Users\\/ },
  { nom: 'lien vers un dépôt privé', re: /github\.com\/Nadir-Bensalah\/|nadir-bensalah\.github\.io/i },
  { nom: 'adresse personnelle', re: /nadirbensalah|nadir\.bensalah@/i },
];

let echecs = 0;
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };

const suivis = execFileSync('git', ['ls-files', '-z', '--', ...PERIMETRE], { cwd: racine, encoding: 'utf8' })
  .split('\0').filter(Boolean)
  /* Ce fichier-ci décrit les motifs qu'il cherche. */
  .filter((c) => c !== 'fonctions-suivi/outils/confidentialite.test.mjs')
  .filter((c) => !/\.(png|jpg|jpeg|webp|ico|gif|pdf|woff2?)$/i.test(c));

const interditsLocaux = existsSync(join(ici, 'donnees-locales', 'interdits.txt'))
  ? readFileSync(join(ici, 'donnees-locales', 'interdits.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];

console.log(`\n== ${suivis.length} fichiers suivis du Hub fouillés${interditsLocaux.length ? `, ${interditsLocaux.length} termes réels interdits (liste locale)` : ' (sans liste locale de noms réels)'}`);
let fautes = 0;
for (const chemin of suivis) {
  if (!existsSync(join(racine, chemin))) continue;
  const texte = readFileSync(join(racine, chemin), 'utf8');
  const lignes = texte.split('\n');
  lignes.forEach((ligne, i) => {
    for (const e of ligne.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
      if (!DOMAINES_PERMIS.test(e)) { fautes += 1; dire(`${chemin}:${i + 1} adresse réelle « ${e} »`); }
    }
    for (const m of MOTIFS) if (m.re.test(ligne)) { fautes += 1; dire(`${chemin}:${i + 1} ${m.nom}`); }
    for (const t of interditsLocaux) if (ligne.toLowerCase().includes(t.toLowerCase())) { fautes += 1; dire(`${chemin}:${i + 1} terme réel interdit (liste locale)`); }
  });
}
if (!fautes) console.log('  ok     aucune adresse réelle, aucun chemin personnel, aucun dépôt privé, aucun nom réel listé');

console.log('\n== Les données réelles restent hors du dépôt');
const ignore = execFileSync('git', ['check-ignore', 'fonctions-suivi/outils/donnees-locales/quelconque.mjs'], { cwd: racine, encoding: 'utf8' }).trim();
if (ignore) console.log('  ok     donnees-locales/ est ignoré par Git'); else dire('donnees-locales/ n est pas ignoré par Git');
const suivisLocaux = execFileSync('git', ['ls-files', 'fonctions-suivi/outils/donnees-locales'], { cwd: racine, encoding: 'utf8' }).trim();
if (!suivisLocaux) console.log('  ok     aucun fichier de donnees-locales/ n est suivi'); else dire(`fichiers suivis dans donnees-locales/ : ${suivisLocaux}`);

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
