/* ==========================================================================
   CAPMEDIA CLIENT HUB · les lignes d'un devis, en étapes à cocher

   Chaque ligne d'un devis devient une étape de la feuille de route
   rattachée au devis, avec son montant : c'est ce que le client a acheté,
   et c'est ce qu'il voit cocher.

   Les lignes viennent de `donnees-locales/etapes-devis.mjs` (non versionné :
   ce sont des montants réels). Format : `exemples/etapes-devis.exemple.mjs`.

     node fonctions-suivi/outils/semer-etapes-devis.mjs <projet> <devisId> [--vrai]
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chargerDonnees } from './lib/donnees-locales.mjs';

const { LIGNES } = await chargerDonnees('etapes-devis');

async function main() {
  const [projet, devis] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');
  if (!projet || !devis) { console.error('Usage : node semer-etapes-devis.mjs <projet> <devisId> [--vrai]'); process.exit(1); }

  const total = LIGNES.reduce((n, l) => n + l[2], 0);
  console.log(`\n${LIGNES.length} lignes, ${total} € HT, sur le devis ${devis} du projet ${projet}\n`);
  LIGNES.forEach(([, t, m, st, p], i) => console.log(`  ${String(i + 1).padStart(2, '0')}  ${t.padEnd(32)} ${String(m).padStart(5)} €  ${st}${p ? ` ${p} %` : ''}`));

  if (!vrai) { console.log('\nEssai à blanc : rien écrit. Ajoutez --vrai.\n'); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();
  const doc = await bdd.doc(`documents/${devis}`).get();
  if (!doc.exists || doc.data().type !== 'devis' || doc.data().projet !== projet) {
    console.error(`Le document ${devis} n'est pas un devis du projet ${projet}. Rien écrit.`); process.exit(1);
  }
  const lot = bdd.batch();
  LIGNES.forEach(([id, titre, montant, statut, progression, description], i) => {
    lot.set(bdd.doc(`projets/${projet}/jalons/${id}`), {
      titre, montant, statut, progression, description,
      devis, ordre: 100 + i + 1, phase: 'Campagne de tests',
      maj: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await lot.commit();
  console.log(`\n  ${LIGNES.length} étapes posées dans projets/${projet}/jalons\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
