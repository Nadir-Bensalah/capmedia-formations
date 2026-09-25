/* ==========================================================================
   CAPMEDIA CLIENT HUB · semer des familles de règles métier

   Une famille est UNE règle du produit. Le champ `cas` dit combien
   d'entrées on lui fait essayer : c'est ce nombre qui dit la profondeur,
   pas le nombre de fichiers. Le champ `mutation` garde le même sens que
   pour les parcours.

   Les familles viennent de `donnees-locales/regles.mjs` (non versionné).
   Format : `exemples/regles.exemple.mjs`.

     node fonctions-suivi/outils/semer-regles.mjs <projet> [--vrai]
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chargerDonnees } from './lib/donnees-locales.mjs';

const { REGLES } = await chargerDonnees('regles');

async function main() {
  const [projet] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');
  if (!projet) { console.error('Usage : node semer-regles.mjs <projet> [--vrai]'); process.exit(1); }

  const vues = new Set();
  const doublons = REGLES.map((x) => x[0]).filter((r) => vues.has(r) || (vues.add(r), false));
  if (doublons.length) { console.error(`Références en double : ${doublons.join(', ')}`); process.exit(1); }

  const parFamille = {};
  REGLES.forEach(([, , f, c]) => { parFamille[f] = (parFamille[f] || 0) + c; });
  const cas = REGLES.reduce((n, x) => n + x[3], 0);
  const couverts = new Set(REGLES.flatMap((x) => x[4]));

  console.log(`\n${REGLES.length} familles de règles, ${cas} cas\n`);
  Object.entries(parFamille).sort((a, b) => b[1] - a[1])
    .forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${f}`));
  console.log(`\n  ${couverts.size} scénarios touchés.`);
  console.log(`  Durée attendue : moins d'une minute pour les ${cas}.`);

  if (!vrai) { console.log('\nEssai à blanc : rien écrit. Ajoutez --vrai.\n'); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();
  const lot = bdd.batch();
  REGLES.forEach(([ref, titre, famille, cas2, scenarios, cherche], i) => {
    lot.set(bdd.doc(`projets/${projet}/regles/${ref}`), {
      ref, titre, famille, cas: cas2, scenarios, cherche,
      fichier: `__tests__/${famille}/${ref.toLowerCase()}.test.ts`,
      etat: 'a-ecrire', mutation: false, note: '', ordre: i + 1, actif: true,
      maj: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await lot.commit();
  console.log(`\n  ${REGLES.length} familles (${cas} cas) versées dans projets/${projet}/regles\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
