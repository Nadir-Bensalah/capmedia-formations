/* ==========================================================================
   CAPMEDIA TEST · épreuve de la migration « retour testeur »

   Émulateur Firestore seul. Sème trois appréciations (une ancienne avec
   note et remarques, une avec une note déjà rangée à part et différente,
   une propre), puis : à blanc (rien ne bouge), en vrai (déplacé, effacé,
   conflit gardé), une seconde fois (rien n'est réécrit), et le retour
   arrière depuis la sauvegarde.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/migrer-retour-testeurs.test.mjs"
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateur seulement.'); process.exit(2); }
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const SCRIPT = new URL('./migrer-retour-testeurs.mjs', import.meta.url).pathname;
const SAUVEGARDE = join(tmpdir(), `sauvegarde-retour-${process.pid}.json`);
const lancer = (...args) => execFileSync('node', [SCRIPT, ...args], { env: process.env, encoding: 'utf8' });

let ok = 0; const ecarts = [];
const verifier = (c, libelle, detail = '') => { if (c) { ok += 1; console.log('  ok     ' + libelle); } else { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + (detail ? ` · ${detail}` : '')); } };

const A = 'projets/atelier/campagnes/c1/appreciations';
const vider = async () => { for (const c of ['uid-karim', 'uid-sonia', 'uid-marc']) { await bdd.recursiveDelete(bdd.doc(`${A}/${c}`)); } };
await vider();
await bdd.doc(`${A}/uid-karim`).set({ 'esthetique.belle': '4', termine: new Date(), noteTest: { note: 3, commentaire: 'Lien manquant.', le: new Date() }, remarques: [{ texte: 'Le bouton Retour.', le: new Date() }], testeur: 'uid-karim' });
await bdd.doc(`${A}/uid-sonia`).set({ 'libre.garder': 'tout', noteTest: { note: 2, commentaire: 'ancienne', le: new Date() }, testeur: 'uid-sonia' });
await bdd.doc(`${A}/uid-sonia/equipe/retour`).set({ noteTest: { note: 5, commentaire: 'nouvelle', le: new Date() }, testeur: 'uid-sonia' });
await bdd.doc(`${A}/uid-marc`).set({ 'impression.compris': 4, testeur: 'uid-marc' });
const lire = async (c) => (await bdd.doc(c).get()).data() || {};

console.log('\n== À blanc');
const blanc = lancer();
verifier(/3 appréciation\(s\) lue\(s\), 2 à déplacer, 0 déplacée/.test(blanc), 'le bilan dit ce qui serait fait', blanc.trim().split('\n').pop());
verifier((await lire(`${A}/uid-karim`)).noteTest !== undefined, 'et rien n\'a bougé');

console.log('\n== En vrai');
const vrai = lancer('--vrai', `--sauvegarde=${SAUVEGARDE}`);
verifier(existsSync(SAUVEGARDE), 'la sauvegarde est écrite avant tout');
const k = await lire(`${A}/uid-karim`); const kr = await lire(`${A}/uid-karim/equipe/retour`);
verifier(k.noteTest === undefined && k.remarques === undefined, 'le client ne lit plus ni la note ni les remarques');
verifier(k['esthetique.belle'] === '4' && k.termine, 'le reste de l\'appréciation est intact');
verifier(kr.noteTest && kr.noteTest.note === 3 && kr.noteTest.commentaire === 'Lien manquant.', 'la note est rangée à part, telle quelle');
verifier(Array.isArray(kr.remarques) && kr.remarques.length === 1 && kr.remarques[0].texte === 'Le bouton Retour.', 'les remarques aussi');
const sr = await lire(`${A}/uid-sonia/equipe/retour`);
verifier(sr.noteTest.note === 5 && sr.noteTestAvantMigration && sr.noteTestAvantMigration.note === 2, 'en cas de conflit, la récente est gardée et l\'ancienne conservée à côté');
verifier((await lire(`${A}/uid-sonia`)).noteTest === undefined, 'et l\'appréciation est vidée quand même');
verifier(!existsSync(`${A}/uid-marc/equipe/retour`) && !(await bdd.doc(`${A}/uid-marc/equipe/retour`).get()).exists, 'une appréciation propre n\'est pas touchée');
verifier(/2 déplacée\(s\), 1 conflit/.test(vrai), 'le bilan le dit', vrai.trim().split('\n').pop());

console.log('\n== Une seconde fois');
const encore = lancer('--vrai', `--sauvegarde=${SAUVEGARDE}.2`);
verifier(/0 à déplacer, 0 déplacée/.test(encore), 'rien n\'est réécrit', encore.trim().split('\n').pop());

console.log('\n== Retour arrière');
lancer('--vrai', `--annuler=${SAUVEGARDE}`);
const k2 = await lire(`${A}/uid-karim`);
verifier(k2.noteTest && k2.noteTest.note === 3 && Array.isArray(k2.remarques) && k2.remarques.length === 1, 'la sauvegarde remet les champs sur l\'appréciation');
verifier(k2.noteTest.le && typeof k2.noteTest.le.toDate === 'function', 'avec de vraies dates');

rmSync(SAUVEGARDE, { force: true });
await vider();
console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
