/* ==========================================================================
   CAPMEDIA CLIENT HUB · semer un catalogue de parcours automatisés

   Verse dans `projets/<projet>/parcours` un catalogue de parcours
   d'interface (Maestro, Playwright, Test Lab, Jest) : référence, titre,
   outil, plateformes, scénarios couverts, et le drapeau `mutation`, qui dit
   si le parcours a été remis en défaut exprès. Un parcours au vert ne
   prouve rien tant qu'on ne l'a pas vu tomber.

   Le catalogue vient de `donnees-locales/parcours-1.mjs` (non versionné,
   il décrit le produit d'un client). Format : `exemples/parcours-1.exemple.mjs`.

     node fonctions-suivi/outils/semer-parcours.mjs <projet> [--vrai]
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chargerDonnees } from './lib/donnees-locales.mjs';

const { PARCOURS } = await chargerDonnees('parcours-1');

async function main() {
  const [projet] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');
  if (!projet) { console.error('Usage : node semer-parcours.mjs <projet> [--vrai]'); process.exit(1); }

  /* Une référence en double écraserait silencieusement la précédente :
     l'identifiant du document EST la référence. On préfère s'arrêter. */
  const vues = new Set();
  const doublons = PARCOURS.map((x) => x[0]).filter((r) => vues.has(r) || (vues.add(r), false));
  if (doublons.length) { console.error(`Références en double : ${doublons.join(', ')}`); process.exit(1); }

  const parOutil = {};
  PARCOURS.forEach(([, , o]) => { parOutil[o] = (parOutil[o] || 0) + 1; });
  const eprouves = PARCOURS.filter((x) => x[5]).length;
  const couverts = new Set(PARCOURS.flatMap((x) => x[4]));

  console.log(`\n${PARCOURS.length} parcours\n`);
  Object.entries(parOutil).sort((a, b) => b[1] - a[1]).forEach(([o, n]) => console.log(`  ${String(n).padStart(3)}  ${o}`));
  console.log(`\n  ${couverts.size} scénarios couverts, ${eprouves} parcours déjà éprouvés par mutation.`);
  console.log(`  ${PARCOURS.length - eprouves} restent à remettre en défaut : un parcours au vert ne prouve rien tant qu'on n'a pas vérifié qu'il sait tomber.`);

  if (!vrai) { console.log('\nEssai à blanc : rien écrit. Ajoutez --vrai.\n'); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();

  /* Firestore refuse au-delà de cinq cents écritures par lot. On découpe,
     même si la liste tient encore en dessous : elle grandira. */
  const paquets = [];
  for (let i = 0; i < PARCOURS.length; i += 400) paquets.push(PARCOURS.slice(i, i + 400));

  let pose = 0;
  for (const paquet of paquets) {
    const lot = bdd.batch();
    paquet.forEach(([ref, titre, outil, plateformes, scenarios, mutation]) => {
      const i = PARCOURS.findIndex((x) => x[0] === ref);
      lot.set(bdd.doc(`projets/${projet}/parcours/${ref}`), {
        ref, titre, outil, plateformes, scenarios, mutation,
        fichier: outil === 'maestro' ? `.maestro/${ref.toLowerCase()}.yaml`
          : outil === 'playwright' ? `e2e/${ref.toLowerCase()}.spec.ts`
            : outil === 'jest' ? `__tests__/${ref.toLowerCase()}.test.ts` : '',
        etat: 'a-ecrire', note: '', ordre: i + 1, actif: true,
        maj: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await lot.commit();
    pose += paquet.length;
  }
  console.log(`\n  ${pose} parcours versés dans projets/${projet}/parcours\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
