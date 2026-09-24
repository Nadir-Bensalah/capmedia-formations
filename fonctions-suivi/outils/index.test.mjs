/* ==========================================================================
   Les index composites sont versionnés.

   L'émulateur n'exige AUCUN index : une requête qui combine un filtre et un
   tri sur deux champs passe au banc et échoue en production. C'est arrivé :
   la conversation d'une demande côté client (`interne == false` trié par
   `date`) ne s'affichait pas, faute d'index. Ce test garde donc :

   1. la liste des index nécessaires, chacun avec la requête qui l'exige,
      présente dans `suivi/firestore.indexes.json` ;
   2. une fouille du code du navigateur : toute requête qui, sur une même
      ligne, filtre un champ et trie sur un autre doit avoir son index.

     node fonctions-suivi/outils/index.test.mjs
   ========================================================================== */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fichierIndex = JSON.parse(readFileSync(join(racine, 'suivi/firestore.indexes.json'), 'utf8'));
let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };

const aIndex = (collection, champs) => (fichierIndex.indexes || []).some((i) => i.collectionGroup === collection
  && i.fields.length >= champs.length && champs.every((c, k) => i.fields[k] && i.fields[k].fieldPath === c));

/* Les index nécessaires, et la requête qui les exige (fichier, motif). */
const NECESSAIRES = [
  { collection: 'messages', champs: ['interne', 'date'], fichier: 'agence/suivi/assets/js/vues/demande.js',
    motif: /where\('interne', '==', false\), orderBy\('date', 'asc'\)/, pourquoi: 'la conversation d une demande, côté client' },
  { collection: 'documents', champs: ['projet', 'statut'], fichier: 'agence/suivi/assets/js/donnees.js',
    motif: /where\('projet', '==', pid\), where\('statut', 'in', STATUTS_PIECE_VISIBLES\)/, pourquoi: 'les pièces visibles d un projet, côté client (sans brouillon)' },
];

console.log('\n== Les index nécessaires sont versionnés');
for (const n of NECESSAIRES) {
  const source = readFileSync(join(racine, n.fichier), 'utf8');
  if (!n.motif.test(source)) dire(`la requête « ${n.pourquoi} » a changé dans ${n.fichier} : revoir cet index`);
  if (aIndex(n.collection, n.champs)) ok(`${n.collection} (${n.champs.join(', ')}) : ${n.pourquoi}`);
  else dire(`index absent de suivi/firestore.indexes.json : ${n.collection} (${n.champs.join(', ')}), ${n.pourquoi}`);
}

console.log('\n== Aucune requête « filtre + tri » sans son index dans le navigateur');
const dossier = join(racine, 'agence/suivi/assets/js');
const fichiers = [...readdirSync(dossier).filter((f) => f.endsWith('.js')).map((f) => join(dossier, f)),
  ...readdirSync(join(dossier, 'vues')).filter((f) => f.endsWith('.js')).map((f) => join(dossier, 'vues', f))];
let vues = 0;
for (const f of fichiers) {
  readFileSync(f, 'utf8').split('\n').forEach((ligne, i) => {
    if (!/query\(/.test(ligne) || !/orderBy\(/.test(ligne) || !/where\(/.test(ligne)) return;
    const collection = (ligne.match(/(?:collection|col)\([^)]*?'([A-Za-z]+)'\s*\)/) || [])[1] || (ligne.match(/'([A-Za-z]+)'\)\s*,\s*where/) || [])[1];
    const filtres = [...ligne.matchAll(/where\('([\w.]+)'\s*,\s*'(==|in|array-contains)'/g)].map((m) => m[1]);
    const tri = (ligne.match(/orderBy\('([\w.]+)'/) || [])[1];
    if (!tri || !filtres.length || filtres.every((c) => c === tri)) return;
    vues += 1;
    const champs = [...filtres.filter((c) => c !== tri), tri];
    if (collection && aIndex(collection, champs)) ok(`${f.replace(`${racine}/`, '')}:${i + 1} ${collection} (${champs.join(', ')})`);
    else dire(`${f.replace(`${racine}/`, '')}:${i + 1} requête ${collection || '?'} (${champs.join(', ')}) sans index versionné`);
  });
}
if (!vues) dire('aucune requête composée trouvée : la fouille ne voit plus rien, à revoir');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
