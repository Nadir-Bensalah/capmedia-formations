/* ==========================================================================
   CAPMEDIA TEST · migration « retour testeur » (lot avis, M2)

   Le client lit l'appréciation d'un testeur (projets/{p}/campagnes/{c}/
   appreciations/{uid}). Deux champs n'y ont rien à faire : « noteTest »
   (la note du test et ses mots, écrits pour l'équipe) et « remarques »
   (les anciennes remarques d'après test, écrites « à l'équipe »). Une règle
   ne masque pas un champ : on les déplace dans
   appreciations/{uid}/equipe/retour, que seule l'équipe lit.

   GARANTIES
   - Rejouable : une appréciation sans ces deux champs n'est pas touchée ;
     un second passage n'écrit rien.
   - Sans perte : si equipe/retour porte déjà une note DIFFÉRENTE (écrite
     par la nouvelle page pendant la bascule), la sienne est gardée et
     l'ancienne est conservée sous « noteTestAvantMigration ». Les
     remarques s'ajoutent à celles déjà rangées, sans doublon.
   - Sans exposition : la copie et l'effacement sur l'appréciation partent
     dans le MÊME lot.
   - Sauvegarde : avant toute écriture, chaque appréciation concernée est
     écrite telle quelle dans un fichier JSON (--sauvegarde=chemin, sinon
     ./sauvegarde-retour-testeurs-<date>.json). --annuler=<fichier> remet
     les champs depuis ce fichier.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait.
     node fonctions-suivi/outils/migrer-retour-testeurs.mjs                       (lecture seule)
     node fonctions-suivi/outils/migrer-retour-testeurs.mjs --vrai                (émulateur seulement)
     node fonctions-suivi/outils/migrer-retour-testeurs.mjs --vrai --production   (PRODUCTION, sur ordre explicite)
     ... --annuler=<sauvegarde.json>                                              (retour arrière)
   ========================================================================== */

import { writeFileSync, readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = valeur('--annuler');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}

initializeApp({ projectId: PROJET });
const bdd = getFirestore();

/* Les dates passent en JSON sous une forme qu'on sait relire. */
const versJson = (v) => (v instanceof Timestamp ? { __date: v.toDate().toISOString() }
  : Array.isArray(v) ? v.map(versJson)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)])) : v);
const depuisJson = (v) => ((v && typeof v === 'object' && !Array.isArray(v) && v.__date) ? Timestamp.fromDate(new Date(v.__date))
  : Array.isArray(v) ? v.map(depuisJson)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depuisJson(x)])) : v);
const memeTexte = (a, b) => JSON.stringify(versJson(a)) === JSON.stringify(versJson(b));

const bilan = { vues: 0, aDeplacer: 0, deplacees: 0, conflits: 0, restaurees: 0 };

if (ANNULER) {
  const sauvegarde = JSON.parse(readFileSync(ANNULER, 'utf8'));
  for (const e of sauvegarde.appreciations) {
    const champs = {};
    if (e.noteTest !== undefined) champs.noteTest = depuisJson(e.noteTest);
    if (e.remarques !== undefined) champs.remarques = depuisJson(e.remarques);
    console.log(`  ${VRAI ? 'remis' : 'à remettre'}  ${e.chemin} (${Object.keys(champs).join(', ')})`);
    if (VRAI) { await bdd.doc(e.chemin).set(champs, { merge: true }); bilan.restaurees += 1; }
  }
  console.log(`\n${sauvegarde.appreciations.length} appréciation(s) dans la sauvegarde, ${bilan.restaurees} remise(s).${VRAI ? '' : ' À blanc : ajoutez --vrai.'}`);
  console.log('Les documents equipe/retour restent en place : la page relit l\'appréciation tant qu\'ils ne portent rien.');
  process.exit(0);
}

const concernees = [];
const appreciations = await bdd.collectionGroup('appreciations').get();
for (const d of appreciations.docs) {
  bilan.vues += 1;
  const a = d.data();
  const aNote = a.noteTest !== undefined;
  const aRemarques = a.remarques !== undefined;
  if (!aNote && !aRemarques) continue;
  bilan.aDeplacer += 1;
  concernees.push({ ref: d.ref, a, aNote, aRemarques });
}

const fichier = valeur('--sauvegarde') || `./sauvegarde-retour-testeurs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
if (VRAI && concernees.length) {
  writeFileSync(fichier, JSON.stringify({
    projet: PROJET, le: new Date().toISOString(),
    appreciations: concernees.map(({ ref, a, aNote, aRemarques }) => ({
      chemin: ref.path, ...(aNote ? { noteTest: versJson(a.noteTest) } : {}), ...(aRemarques ? { remarques: versJson(a.remarques) } : {}),
    })),
  }, null, 2));
  console.log(`Sauvegarde : ${fichier}`);
}

for (const { ref, a, aNote, aRemarques } of concernees) {
  const cible = ref.collection('equipe').doc('retour');
  const deja = (await cible.get()).data() || {};
  const champs = { testeur: a.testeur || ref.id, maj: FieldValue.serverTimestamp() };
  if (aNote) {
    if (deja.noteTest && !memeTexte(deja.noteTest, a.noteTest)) { champs.noteTestAvantMigration = a.noteTest; bilan.conflits += 1; }
    else champs.noteTest = a.noteTest;
  }
  if (aRemarques && Array.isArray(a.remarques)) {
    const avant = Array.isArray(deja.remarques) ? deja.remarques : [];
    champs.remarques = [...avant, ...a.remarques.filter((r) => !avant.some((x) => memeTexte(x, r)))];
  }
  console.log(`  ${VRAI ? 'déplacé' : 'à déplacer'}  ${ref.path} : ${[aNote ? 'noteTest' : '', aRemarques ? `${(a.remarques || []).length} remarque(s)` : ''].filter(Boolean).join(', ')}`);
  if (!VRAI) continue;
  const lot = bdd.batch();
  lot.set(cible, champs, { merge: true });
  lot.update(ref, { ...(aNote ? { noteTest: FieldValue.delete() } : {}), ...(aRemarques ? { remarques: FieldValue.delete() } : {}) });
  await lot.commit();
  bilan.deplacees += 1;
}

console.log(`\n${bilan.vues} appréciation(s) lue(s), ${bilan.aDeplacer} à déplacer, ${bilan.deplacees} déplacée(s), ${bilan.conflits} conflit(s) gardé(s) sous noteTestAvantMigration.${VRAI ? '' : ' À blanc : rien n\'est écrit, ajoutez --vrai.'}`);
process.exit(0);
