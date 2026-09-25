/* ==========================================================================
   CAPMEDIA CLIENT HUB · semer un second catalogue de parcours automatisés

   Même outil que `semer-parcours.mjs`, pour un second lot (croisements,
   domaines ajoutés, web). Le catalogue vient de
   `donnees-locales/parcours-2.mjs` (non versionné). Format :
   `exemples/parcours-2.exemple.mjs`.

     node fonctions-suivi/outils/semer-parcours-2.mjs <projet> [--vrai]
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chargerDonnees } from './lib/donnees-locales.mjs';

const { PARCOURS } = await chargerDonnees('parcours-2');

async function main() {
  const [projet] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');
  if (!projet) { console.error('Usage : node semer-parcours-2.mjs <projet> [--vrai]'); process.exit(1); }

  const vues = new Set();
  const doublons = PARCOURS.map((x) => x[0]).filter((r) => vues.has(r) || (vues.add(r), false));
  if (doublons.length) { console.error(`Références en double : ${doublons.join(', ')}`); process.exit(1); }

  const parOutil = {};
  PARCOURS.forEach(([, , o]) => { parOutil[o] = (parOutil[o] || 0) + 1; });
  const couverts = new Set(PARCOURS.flatMap((x) => x[4]));

  console.log(`\n${PARCOURS.length} parcours dans ce lot\n`);
  Object.entries(parOutil).sort((a, b) => b[1] - a[1]).forEach(([o, n]) => console.log(`  ${String(n).padStart(3)}  ${o}`));
  console.log(`\n  ${couverts.size} scénarios touchés par ce lot.`);

  if (!vrai) { console.log('\nEssai à blanc : rien écrit. Ajoutez --vrai.\n'); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();
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
          : outil === 'playwright' ? `e2e/${ref.toLowerCase()}.spec.ts` : '',
        etat: 'a-ecrire', note: '', ordre: 500 + i, actif: true,
        maj: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await lot.commit();
    pose += paquet.length;
  }
  console.log(`\n  ${pose} parcours versés dans projets/${projet}/parcours\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
