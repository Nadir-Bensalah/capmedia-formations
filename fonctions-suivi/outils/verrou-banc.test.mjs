/* ==========================================================================
   CAPMEDIA CLIENT HUB · le verrou de pose du banc, éprouvé

   Un événement né pendant la pose d'une base de test ne fait rien, même
   servi après la levée du verrou ; un événement né après, si. C'est ce qui
   rend les bancs (préflight, copie de production, ordre de déploiement)
   indépendants du rythme de la file des émulateurs.

     (émulateurs avec les fonctions)
     node fonctions-suivi/outils/verrou-banc.test.mjs
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { barriere, verrouSemis } from './lib/barriere.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
let ok = 0; const ecarts = [];
const verifier = (c, m) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}`); } };
const traces = async (id) => (await bdd.collection('activite').where('projet', '==', id).get()).size;
const id = `verrou-${Date.now()}`;

/* Pendant la pose : les déclencheurs tournent, et pourtant rien ne se fait. */
await verrouSemis(bdd, true);
await bdd.doc(`projets/${id}-pendant`).set({ nom: 'pendant', ref: 'VP', interne: true, membres: [] });
/* Servi avant ou après la levée du verrou, peu importe : il est né avant. */
await verrouSemis(bdd, false);
await bdd.doc(`projets/${id}-apres`).set({ nom: 'après', ref: 'VA', interne: true, membres: [] });
await barriere({ bdd });
verifier((await traces(`${id}-pendant`)) === 0, 'un événement né pendant la pose ne fait rien');
verifier((await traces(`${id}-apres`)) === 1, 'un événement né après la levée du verrou est servi normalement');
for (const s of ['pendant', 'apres']) await bdd.doc(`projets/${id}-${s}`).delete();
for (const d of (await bdd.collection('activite').where('projet', '>=', id).where('projet', '<', `${id}~`).get()).docs) await d.ref.delete();
await bdd.doc('_banc/semis').delete();

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
