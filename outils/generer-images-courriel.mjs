/* ==========================================================================
   Les images des e-mails du Hub, en PNG.

   Un e-mail ne lit pas le SVG (Gmail et Outlook l'ignorent) : chaque image
   du gabarit (fonctions-suivi/courriels.js) est donc un PNG au double de sa
   taille d'affichage, publié avec le site sous
   https://capmedia.app/assets/img/courriel/.

   Les icônes sont celles du Hub (agence/suivi/assets/js/icones.js), au trait,
   dans un gris lisible sur fond clair comme sur fond sombre. Le logo vient
   de agence/assets/img/capmedia-digital.png ; le trait de la marque, du
   chemin dessiné dans coquille.js.

     node outils/generer-images-courriel.mjs
   Demande rsvg-convert (Homebrew : librsvg) et sips (macOS).
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'agence/assets/img/courriel');
const { ICONES } = await import(pathToFileURL(join(RACINE, 'agence/suivi/assets/js/icones.js')).href);

/* Le gris des icônes : #8E8E93, le gris système d'Apple, lisible sur le
   blanc de la lettre comme sur son fond sombre. Une seule image suffit. */
const GRIS = '#8E8E93';
/* Les icônes du gabarit (ICONES_FAITS et les liens de courriels.js). */
const NOMS = [
  'projets', 'demandes', 'etiquette', 'alerte', 'smartphone', 'releases', 'activite', 'euro',
  'documents', 'receipt', 'calendrier', 'horloge', 'pin', 'video', 'cadenas', 'globe', 'mail',
  'utilisateur', 'utilisateurs', 'fichiers', 'trombone', 'dossier', 'taches', 'valider', 'check',
  'aucun', 'liste', 'cible', 'ampoule', 'paiement', 'info', 'note', 'route', 'composants', 'bug',
  'messages', 'edit', 'sparkle',
];

mkdirSync(SORTIE, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'courriel-'));
const rendre = (svg, nom, largeur, hauteur) => {
  const fichier = join(tmp, `${nom}.svg`);
  writeFileSync(fichier, svg);
  execFileSync('rsvg-convert', ['-w', String(largeur), '-h', String(hauteur), '-o', join(SORTIE, `${nom}.png`), fichier]);
};

/* 1. Les icônes : 32 × 32 pour un affichage à 16 px. */
for (const nom of NOMS) {
  const svg = ICONES[nom];
  if (!svg) throw new Error(`Icône inconnue : ${nom}`);
  const pur = svg
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ')
    .replace(/stroke="currentColor"/g, `stroke="${GRIS}"`)
    .replace(/ aria-hidden="true"| focusable="false"/g, '');
  rendre(pur, `i-${nom}`, 32, 32);
}

/* 2. La flèche des liens, à la couleur du lien : bleu du Hub en clair,
   bleu éclairci en sombre (les deux images s'échangent par le style). */
const fleche = (couleur) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${couleur}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`;
rendre(fleche('#0075DE'), 'fleche', 28, 28);
rendre(fleche('#409CFF'), 'fleche-sombre', 28, 28);

/* 3. Le trait de la marque, tracé à la main (coquille.js), 2 fois 86 × 8. */
const trait = (couleur) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 8" width="86" height="8" fill="none"><path d="M1.5 5.2C14 3.1 30 2.4 44 3.3c12 .8 26 1.5 40.5-.6" stroke="${couleur}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
rendre(trait('#8E1D42'), 'trait', 172, 16);
rendre(trait('#D65A82'), 'trait-sombre', 172, 16);

/* 4. Le logo, ramené au carré puis à 96 px (affiché à 32 px). */
const logo = join(RACINE, 'agence/assets/img/capmedia-digital.png');
execFileSync('sips', ['-p', '309', '309', logo, '--out', join(tmp, 'carre.png')], { stdio: 'ignore' });
execFileSync('sips', ['-z', '96', '96', join(tmp, 'carre.png'), '--out', join(SORTIE, 'capmedia.png')], { stdio: 'ignore' });

rmSync(tmp, { recursive: true, force: true });
console.log(`${NOMS.length + 5} images écrites dans ${SORTIE}`);
