/* ==========================================================================
   CAPMEDIA TEST · l'avis anonyme, côté serveur (hubAvisTesteur)

   Le cœur de la fonction (avis._rendreAvis), sur l'émulateur Firestore :
     - ce qu'il écrit ne porte ni identifiant de testeur, ni date, ni
       appareil : seulement le moment et les réponses ;
     - il compte, et pose « avisRendus » sur l'appréciation, rien d'autre ;
     - il refuse une seconde réponse, un testeur hors de la campagne, une
       campagne close, un accès passé, une réponse hors bornes.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/avis-serveur.test.mjs"
   ========================================================================== */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('FIRESTORE_EMULATOR_HOST requis : jamais contre la production.'); process.exit(2); }
const { getFirestore } = require('../node_modules/firebase-admin/lib/firestore/index.js');
const avis = require('../avis.js');
const bdd = getFirestore();

let ok = 0; const ecarts = [];
const verifier = (c, libelle, detail = '') => {
  if (c) { ok += 1; console.log('  ok     ' + libelle); }
  else { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + (detail ? ` · ${detail}` : '')); }
};

const P = 'av-projet';
const KARIM = 'av-karim'; const SONIA = 'av-sonia'; const LEA = 'av-lea'; const MARC = 'av-marc'; const NINA = 'av-nina';
const C = (c) => `projets/${P}/campagnes/${c}`;

await bdd.recursiveDelete(bdd.doc(`projets/${P}`));
for (const [u, actif] of [[KARIM, true], [SONIA, true], [LEA, true], [MARC, false], [NINA, true]]) await bdd.doc(`testeurs/${u}`).set({ prenom: u, actif, projets: [P] });
await bdd.doc(C('c1')).set({ statut: 'en-cours', testeurs: [KARIM, SONIA, LEA, MARC] });
await bdd.doc(C('close')).set({ statut: 'close', testeurs: [KARIM] });
await bdd.doc(C('passee')).set({ statut: 'en-cours', testeurs: [KARIM], fins: { [KARIM]: new Date(Date.now() - 60000) } });
/* Une ancienne appréciation nominative : elle ne bouge pas. */
await bdd.doc(`${C('c1')}/appreciations/${SONIA}`).set({ 'esthetique.belle': 2, accueil: new Date(), testeur: SONIA });

const APRES = (n = 4) => ({
  'esthetique.belle': n, 'esthetique.moderne': 4, 'esthetique.couleurs': 'Agréables', 'esthetique.lisible': 5, 'esthetique.aere': 4, 'esthetique.coherent': 4,
  'facilite.trouve': 4, 'facilite.vocabulaire': 5, 'facilite.bloque': 'Jamais', 'facilite.erreurs': 3, 'facilite.recommande': 8,
  'utilite.probleme': 4, 'utilite.vraie-vie': 'Oui, de temps en temps',
  'argent.paierait': 'Peut-être', 'argent.gratuit': 'Convient', 'argent.spontane': '3,5',
  'performance.rapide': 4, 'performance.attentes': 'Parfois', 'performance.plantages': 'Aucun', 'performance.comparee': 4,
  'libre.agace': 'Le menu est loin du pouce.',
});
const rendre = (uid, extra = {}) => avis._rendreAvis({ uid, projet: P, campagne: 'c1', moment: 'apres', reponses: APRES(), ...extra });

console.log('\n== Ce qui est écrit ne dit pas qui');
const r1 = await rendre(KARIM);
verifier(r1.ok === true, 'Karim rend son avis de fin', JSON.stringify(r1));
const reps = await bdd.collection(`${C('c1')}/avisAnonymes/apres/reponses`).get();
verifier(reps.size === 1, 'une réponse rangée');
const d = reps.docs[0].data();
verifier(JSON.stringify(Object.keys(d).sort()) === JSON.stringify(['moment', 'reponses']), 'la réponse ne porte que le moment et les réponses', Object.keys(d).join(', '));
const tout = JSON.stringify(d);
verifier(!tout.includes(KARIM) && !/testeur|uid|email|prenom|agent|appareil/i.test(Object.keys(d.reponses).join(' ')), 'aucun identifiant, aucun champ de profil dans les réponses');
verifier(!Object.values(d).some((v) => v && typeof v.toDate === 'function'), 'aucune date');
verifier(!reps.docs[0].id.includes(KARIM), 'l identifiant du document ne dit pas qui');
verifier(d.reponses['argent.spontane'] === 3.5, 'les valeurs sont nettoyées par la source (3,5 devient 3.5)');
const compteur = (await bdd.doc(`${C('c1')}/avisAnonymes/apres`).get()).data();
verifier(compteur && compteur.recus === 1 && Object.keys(compteur).length === 1, 'le compte du moment passe à 1, et ne porte rien d autre');
const a = (await bdd.doc(`${C('c1')}/appreciations/${KARIM}`).get()).data();
verifier(a && a.avisRendus && a.avisRendus.apres === true, '« avisRendus.apres » posé sur l appréciation de Karim');
verifier(!Object.keys(a).some((k) => k.includes('.') || ['maj', 'reponses'].includes(k)), 'et pas une réponse, ni une date', Object.keys(a).join(', '));

console.log('\n== Ce qui est refusé');
const r2 = await rendre(KARIM, { reponses: APRES(1) });
verifier(r2.code === 409, 'une seconde réponse au même moment : 409', JSON.stringify(r2));
verifier((await bdd.collection(`${C('c1')}/avisAnonymes/apres/reponses`).get()).size === 1, 'et rien de plus n est rangé');
verifier((await rendre(NINA)).code === 403, 'Nina, hors de la campagne : 403');
verifier((await rendre(MARC)).code === 403, 'Marc, retiré du vivier : 403');
verifier((await rendre('av-inconnu')).code === 403, 'un compte sans fiche de testeur : 403');
verifier((await avis._rendreAvis({ uid: KARIM, projet: P, campagne: 'close', moment: 'apres', reponses: APRES() })).code === 403, 'une campagne close : 403');
verifier((await avis._rendreAvis({ uid: KARIM, projet: P, campagne: 'passee', moment: 'apres', reponses: APRES() })).code === 403, 'un accès passé : 403');
verifier((await rendre(SONIA, { reponses: { ...APRES(), testeur: SONIA } })).code === 400, 'un « testeur » glissé dans les réponses : 400');
verifier((await rendre(SONIA, { reponses: { ...APRES(), 'esthetique.belle': 7 } })).code === 400, 'une note hors bornes : 400');
verifier((await rendre(SONIA, { reponses: { 'libre.agace': 'seulement un texte' } })).code === 400, 'des questions requises manquantes : 400');
verifier((await rendre(SONIA, { moment: 'fin' })).code === 400, 'le moment « fin » (note du test) : 400');
verifier((await avis._rendreAvis({ uid: SONIA, projet: '../x', campagne: 'c1', moment: 'apres', reponses: APRES() })).code === 400, 'un chemin de projet piégé : 400');

console.log('\n== Le compte, et l ancienne appréciation');
verifier((await rendre(SONIA)).ok === true, 'Sonia rend le sien');
verifier((await rendre(LEA, { reponses: APRES(5) })).ok === true, 'Léa aussi');
verifier((await bdd.doc(`${C('c1')}/avisAnonymes/apres`).get()).data().recus === 3, 'le compte arrive à 3 : les réponses deviennent lisibles (règles)');
const s = (await bdd.doc(`${C('c1')}/appreciations/${SONIA}`).get()).data();
verifier(s['esthetique.belle'] === 2 && s.avisRendus.apres === true, 'l ancienne réponse nominative de Sonia n est ni migrée ni effacée');
verifier((await avis._rendreAvis({ uid: KARIM, projet: P, campagne: 'c1', moment: 'avant', reponses: { 'impression.compris': 5 } })).ok === true, 'la première impression se rend à part');
verifier((await bdd.doc(`${C('c1')}/avisAnonymes/avant`).get()).data().recus === 1, 'avec son propre compte');

await bdd.recursiveDelete(bdd.doc(`projets/${P}`));
console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
