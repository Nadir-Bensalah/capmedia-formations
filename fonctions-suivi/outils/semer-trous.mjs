/* ==========================================================================
   CAPMEDIA CLIENT HUB · semer des scénarios complémentaires

   Ajoute à la bibliothèque d'un projet des scénarios écrits hors du plan
   markdown (domaines vendus mais absents du plan). Le niveau suit la règle
   du Hub : `socle` pour ce que deux testeurs d'OS différents refont,
   `transversal` pour ce qui traverse les écrans, `reparti` pour le reste.

   Les scénarios viennent de `donnees-locales/scenarios-complementaires.mjs`
   (non versionné). Format : `exemples/scenarios-complementaires.exemple.mjs`.

     node fonctions-suivi/outils/semer-trous.mjs <projet> [--vrai]
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chargerDonnees } from './lib/donnees-locales.mjs';

const { SCENARIOS } = await chargerDonnees('scenarios-complementaires');

async function main() {
  const [projet] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');
  if (!projet) { console.error('Usage : node semer-trous.mjs <projet> [--vrai]'); process.exit(1); }

  const vues = new Set();
  const doublons = SCENARIOS.map((x) => x[0]).filter((r) => vues.has(r) || (vues.add(r), false));
  if (doublons.length) { console.error(`Références en double : ${doublons.join(', ')}`); process.exit(1); }

  const parBloc = {};
  SCENARIOS.forEach(([, , b]) => { parBloc[b] = (parBloc[b] || 0) + 1; });
  const parNiveau = {};
  SCENARIOS.forEach(([, , , n]) => { parNiveau[n] = (parNiveau[n] || 0) + 1; });

  console.log(`\n${SCENARIOS.length} scénarios\n`);
  Object.entries(parBloc).forEach(([b, n]) => console.log(`  ${String(n).padStart(3)}  ${b}`));
  console.log('');
  Object.entries(parNiveau).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));

  if (!vrai) { console.log('\nEssai à blanc : rien écrit. Ajoutez --vrai.\n'); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();
  const lot = bdd.batch();
  SCENARIOS.forEach(([ref, titre, bloc, niveau, options, attendu, plateformes], i) => {
    lot.set(bdd.doc(`projets/${projet}/scenarios/${ref}`), {
      ref, titre, bloc, niveau, options, attendu, plateformes,
      ordre: 1000 + i, actif: true, maj: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await lot.commit();
  console.log(`\n  ${SCENARIOS.length} scénarios versés dans projets/${projet}/scenarios\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
