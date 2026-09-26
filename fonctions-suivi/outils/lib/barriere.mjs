/* ==========================================================================
   La barrière des déclencheurs : attendre un ÉTAT OBSERVABLE, jamais une
   durée au jugé.

   Sur les émulateurs, une écriture Firestore ne déclenche pas les fonctions
   tout de suite : l'événement part dans une file (celle de l'émulateur
   Firestore, puis celle de l'émulateur des fonctions), et s'exécute plus
   tard, d'autant plus tard que la file est chargée. Une photographie prise
   « après six secondes » peut donc manquer un effet, ou en voir un qui
   vient d'une écriture PRÉCÉDENTE : c'est ce qui rendait instable la
   section 4 du préflight de la Gate 1 (des lignes d'activité du semis,
   livrées après la remise en route des déclencheurs, apparaissaient dans
   la base de l'essai suivant).

   La barrière :
     1. écrit une sentinelle (un projet interne jetable) ;
     2. attend le DOCUMENT que sa fonction écrit (hubProjetCree : une ligne
        d'activité à son nom). Les événements sont livrés dans l'ordre : la
        sentinelle servie, tout ce qui a été écrit avant a été livré ;
     3. vide la file des fonctions (l'API du hub attend que TOUTES les
        exécutions en cours soient terminées) ;
     4. efface la sentinelle et sa trace, déclencheurs coupés, puis les
        rallume.
   À la sortie, tout ce qui a été écrit avant l'appel a été servi, jusqu'au
   bout, et la base ne garde rien de la barrière.
   ========================================================================== */

const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export const declencheurs = async (allumes) => {
  const r = await fetch(`http://${HUB}/functions/${allumes ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
  if (!r.ok) throw new Error(`hub des émulateurs : ${allumes ? 'remise en route' : 'vidange'} refusée (${r.status})`);
};

let rang = 0;
export async function barriere({ bdd, limite = 300000 }) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('barriere : émulateurs seulement');
  rang += 1;
  const id = `_barriere-${process.pid}-${Date.now()}-${rang}`;
  await bdd.doc(`projets/${id}`).set({ nom: 'Barrière du banc', ref: 'BARRIERE', interne: true, membres: [] });
  const debut = Date.now();
  let traces = [];
  for (;;) {
    traces = (await bdd.collection('activite').where('projet', '==', id).get()).docs;
    if (traces.length) break;
    if (Date.now() - debut > limite) throw new Error(`barrière : la sentinelle ${id} n a pas été servie en ${limite} ms (file bloquée ?)`);
    await pause(100);
  }
  await declencheurs(false);
  try {
    await bdd.doc(`projets/${id}`).delete();
    for (const t of traces) await t.ref.delete();
  } finally { await declencheurs(true); }
  return Date.now() - debut;
}

/**
 * Le verrou de pose (voir commun.evenementDuSemis, côté fonctions). Posé
 * (`true`) avant d'écrire une base de test, levé (`false`) après : tout
 * événement né entre les deux est ignoré par les déclencheurs, à quelque
 * moment qu'il soit servi : la pose ne dépend plus du rythme de la file.
 */
export async function verrouSemis(bdd, pose) {
  const { FieldValue } = await import('firebase-admin/firestore');
  await bdd.doc('_banc/semis').set(pose ? { enCours: true } : { enCours: false, jusqua: FieldValue.serverTimestamp() });
}

