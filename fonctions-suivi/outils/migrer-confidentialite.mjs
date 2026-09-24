/* ==========================================================================
   CAPMEDIA CLIENT HUB · migration « confidentialité » (Release Gate 1)

   Les règles de la Release Gate 1 ne servent plus au client ce qui est
   interne. Mais une règle ne masque pas un CHAMP : tant qu'une donnée
   interne reste posée sur une fiche que le client lit, il la lit. Cette
   migration déplace donc l'existant vers le nouveau rangement :

     1. projets.budget, budgetNote, sante     -> projetsInternes/{p}
     2. organisations.notesInternes           -> organisationsInternes/{o}
     3. paiements.note                        -> paiementsInternes/{id}
     4. testeurs/{uid}/public/profil          -> projets/{p}/profilsTesteurs/{uid}
     5. equipe/{uid}.nom                      -> annuaire/{uid}
     6. Storage, fichiers d'un projet         projets/{p}/documents/... -> projets/{p}/fichiers/{fichierId}/...
     7. Storage, PDF comptables               projets/{p}/documents/... -> projets/{p}/pieces/{documentId}/...
     8. Storage, pièces des notes internes    métadonnée visibilite = interne

   Rejouable : une donnée déjà déplacée n'est pas touchée deux fois.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait.
     node fonctions-suivi/outils/migrer-confidentialite.mjs              (émulateur ou production : lecture seule)
     node fonctions-suivi/outils/migrer-confidentialite.mjs --vrai       (émulateur seulement)
     node fonctions-suivi/outils/migrer-confidentialite.mjs --vrai --production   (PRODUCTION, sur ordre explicite)

   Les anciens objets Storage ne sont supprimés qu'avec --supprimer-anciens,
   une fois les nouveaux vérifiés.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const VRAI = process.argv.includes('--vrai');
const PRODUCTION = process.argv.includes('--production');
const SUPPRIMER = process.argv.includes('--supprimer-anciens');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const BUCKET = process.env.BUCKET || `${PROJET}.firebasestorage.app`;

if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}
if (!SUR_EMULATEUR) console.log(`\n!!! Base de PRODUCTION ${PROJET}${VRAI ? ' : ÉCRITURE' : ' : lecture seule'} !!!\n`);

initializeApp({ projectId: PROJET, storageBucket: BUCKET });
const bdd = getFirestore();
const seau = getStorage().bucket(BUCKET);
const bilan = {};
const compter = (cle) => { bilan[cle] = (bilan[cle] || 0) + 1; };
const ecrire = async (fn) => { if (VRAI) await fn(); };

/* 1. Projets */
for (const d of (await bdd.collection('projets').get()).docs) {
  const p = d.data();
  const champs = ['budget', 'budgetNote', 'sante'].filter((k) => k in p);
  if (!champs.length) continue;
  const interne = Object.fromEntries(champs.map((k) => [k, p[k] ?? null]));
  await ecrire(async () => {
    await bdd.doc(`projetsInternes/${d.id}`).set({ ...interne, maj: FieldValue.serverTimestamp() }, { merge: true });
    await d.ref.update(Object.fromEntries(champs.map((k) => [k, FieldValue.delete()])));
  });
  compter('projets : budget, note, santé déplacés');
}

/* 2. Organisations */
for (const d of (await bdd.collection('organisations').get()).docs) {
  if (!('notesInternes' in d.data())) continue;
  const notes = String(d.data().notesInternes || '');
  await ecrire(async () => {
    if (notes) await bdd.doc(`organisationsInternes/${d.id}`).set({ notesInternes: notes, maj: FieldValue.serverTimestamp() }, { merge: true });
    await d.ref.update({ notesInternes: FieldValue.delete() });
  });
  compter('organisations : notes internes déplacées');
}

/* 3. Paiements */
for (const d of (await bdd.collection('paiements').get()).docs) {
  if (!('note' in d.data())) continue;
  const note = String(d.data().note || '');
  await ecrire(async () => {
    if (note) await bdd.doc(`paiementsInternes/${d.id}`).set({ note, maj: FieldValue.serverTimestamp() }, { merge: true });
    await d.ref.update({ note: FieldValue.delete() });
  });
  compter('paiements : note interne déplacée');
}

/* 4. Profils des testeurs, un par projet */
for (const d of (await bdd.collection('testeurs').get()).docs) {
  const t = d.data();
  const ancien = bdd.doc(`testeurs/${d.id}/public/profil`);
  const aUnAncien = (await ancien.get()).exists;
  if (t.actif !== false) {
    for (const p of [...new Set((t.projets || []).map(String))]) {
      const cible = bdd.doc(`projets/${p}/profilsTesteurs/${d.id}`);
      if ((await cible.get()).exists) continue;
      const profil = t.profil || {};
      await ecrire(() => cible.set({ sexe: profil.sexe || '', age: profil.age || '', fonction: profil.fonction || '', aisance: profil.aisance || '', langue: profil.langue || '', mobile: t.mobile || '', plateformes: t.plateformes || [], maj: FieldValue.serverTimestamp() }));
      compter('testeurs : profil recopié sous un projet');
    }
  }
  if (aUnAncien) { await ecrire(() => ancien.delete()); compter('testeurs : ancien profil commun effacé'); }
}

/* 5. Annuaire */
for (const d of (await bdd.collection('equipe').get()).docs) {
  const e = d.data();
  const cible = bdd.doc(`annuaire/${d.id}`);
  if (e.actif === false) continue;
  if ((await cible.get()).exists) continue;
  await ecrire(() => cible.set({ nom: String(e.nom || ''), maj: FieldValue.serverTimestamp() }));
  compter('annuaire : nom recopié');
}

/* 6 et 7. Storage : déplacer un objet sous l'identifiant de sa fiche */
const deplacer = async (ancienChemin, nouveauChemin) => {
  const source = seau.file(ancienChemin);
  const [existe] = await source.exists();
  if (!existe) { compter('storage : objet introuvable (fiche corrigée quand même)'); return; }
  await ecrire(async () => {
    await source.copy(seau.file(nouveauChemin));
    if (SUPPRIMER) await source.delete();
  });
};
const nomDe = (chemin) => chemin.split('/').pop();

for (const d of (await bdd.collection('fichiers').get()).docs) {
  const f = d.data();
  const chemin = String(f.chemin || '');
  if (!f.projet || chemin.startsWith(`projets/${f.projet}/fichiers/${d.id}/`)) continue;
  if (!chemin.startsWith(`projets/${f.projet}/`)) { compter('fichiers : chemin hors projet, laissé tel quel'); continue; }
  const nouveau = `projets/${f.projet}/fichiers/${d.id}/${nomDe(chemin)}`;
  await deplacer(chemin, nouveau);
  await ecrire(() => d.ref.update({ chemin: nouveau }));
  compter('fichiers : rangés sous leur fiche');
}

for (const d of (await bdd.collection('documents').get()).docs) {
  const x = d.data();
  const chemin = String((x.fichier && x.fichier.chemin) || '');
  if (!chemin || !x.projet || chemin.startsWith(`projets/${x.projet}/pieces/${d.id}/`)) continue;
  const nouveau = `projets/${x.projet}/pieces/${d.id}/${nomDe(chemin)}`;
  await deplacer(chemin, nouveau);
  await ecrire(() => d.ref.update({ 'fichier.chemin': nouveau }));
  compter('pièces comptables : PDF rangés sous leur pièce');
}

/* 8. Pièces des notes internes d'une demande */
for (const t of (await bdd.collection('tickets').get()).docs) {
  const internes = await t.ref.collection('messages').where('interne', '==', true).get();
  for (const m of internes.docs) {
    for (const piece of (m.data().pieces || [])) {
      if (!piece || !piece.chemin) continue;
      const objet = seau.file(piece.chemin);
      const [existe] = await objet.exists();
      if (!existe) { compter('notes internes : pièce introuvable'); continue; }
      const [meta] = await objet.getMetadata();
      if ((meta.metadata || {}).visibilite === 'interne') continue;
      await ecrire(() => objet.setMetadata({ metadata: { visibilite: 'interne' } }));
      compter('notes internes : pièce marquée interne');
    }
  }
}

console.log(`\n${VRAI ? 'Migration faite' : 'Essai à blanc (rien écrit, ajoutez --vrai)'} sur ${SUR_EMULATEUR ? "l'émulateur" : `la PRODUCTION ${PROJET}`} :`);
if (!Object.keys(bilan).length) console.log('  rien à migrer.');
for (const [cle, n] of Object.entries(bilan)) console.log(`  ${String(n).padStart(4)}  ${cle}`);
if (VRAI && !SUPPRIMER) console.log('\nLes anciens objets Storage sont conservés. Relancez avec --supprimer-anciens une fois vérifié.');
process.exit(0);
