/* ==========================================================================
   CAPMEDIA TEST · les règles des remarques libres et de la note du test

   projets/{p}/campagnes/{c}/remarques/{id} = { testeur, texte, scenario,
   plateforme, cree }. Le testeur écrit les siennes, à tout moment de la
   campagne ouverte et tant que son accès court ; l'équipe et le client du
   projet lisent tout ; personne ne modifie ni n'efface une remarque.

   L'avis anonyme (avisAnonymes/{moment}/reponses) : écrit par le serveur
   seul, lu par l'équipe et le client du projet à partir de trois réponses.
   « J'ai terminé » n'est possible qu'une fois l'avis de fin rendu.

   La note du test (appreciations/{uid}/equipe/retour) ne regarde que
   l'équipe : le client ne la lit pas, le testeur l'écrit avant d'avoir
   terminé et ne touche pas aux anciennes remarques qu'on y range.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/regles-avis.test.mjs"
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: PROJET,
  firestore: { rules: readFileSync(process.env.REGLES_FIRESTORE || new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: Number(String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':')[1]) || 8080 },
});

const AGENT = 'uid-agent'; const CAMILLE = 'uid-camille'; const LEA = 'uid-lea';
const KARIM = 'uid-karim'; const SONIA = 'uid-sonia'; const MARC = 'uid-marc';
const jeton = (uid, email, testeur = false) => ({ email, email_verified: true, sub: uid, ...(testeur ? { testeur: true } : {}) });
const equipe = () => env.authenticatedContext(AGENT, jeton(AGENT, 'agent.essai@exemple.test')).firestore();
const camille = () => env.authenticatedContext(CAMILLE, jeton(CAMILLE, 'camille.essai@exemple.test')).firestore();
const lea = () => env.authenticatedContext(LEA, jeton(LEA, 'lea.essai@exemple.test')).firestore();
const karim = () => env.authenticatedContext(KARIM, jeton(KARIM, 'karim.essai@exemple.test', true)).firestore();
const sonia = () => env.authenticatedContext(SONIA, jeton(SONIA, 'sonia.essai@exemple.test', true)).firestore();
const marc = () => env.authenticatedContext(MARC, jeton(MARC, 'marc.essai@exemple.test', true)).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

let ok = 0; const ecarts = [];
const doit = async (libelle, promesse) => { try { await assertSucceeds(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (refusé à tort)'); } };
const refuse = async (libelle, promesse) => { try { await assertFails(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (AUTORISÉ À TORT)'); } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'equipe', AGENT), { nom: 'Alex Durand', email: 'agent.essai@exemple.test', role: 'admin', actif: true });
  await setDoc(doc(b, 'projets/atelier'), { nom: 'Atelier', membres: [CAMILLE], roles: { [CAMILLE]: 'responsable' }, statut: 'en-cours', ouvert: true });
  await setDoc(doc(b, 'projets/boutique'), { nom: 'Boutique', membres: [LEA], roles: { [LEA]: 'responsable' }, statut: 'en-cours', ouvert: true });
  await setDoc(doc(b, 'testeurs', KARIM), { prenom: 'Karim', projets: ['atelier'] });
  await setDoc(doc(b, 'testeurs', SONIA), { prenom: 'Sonia', projets: ['atelier'] });
  await setDoc(doc(b, 'testeurs', MARC), { prenom: 'Marc', projets: ['atelier'] });
  await setDoc(doc(b, 'projets/atelier/campagnes/c1'), { titre: 'Passe 1.2.0', statut: 'en-cours', testeurs: [KARIM, SONIA] });
  await setDoc(doc(b, 'projets/atelier/campagnes/close'), { titre: 'Passe 1.1.0', statut: 'close', testeurs: [KARIM] });
  /* Karim a fini : ses sept jours courent encore. Sonia a fini il y a
     longtemps : son accès est passé. */
  await setDoc(doc(b, 'projets/atelier/campagnes/c-fin'), { titre: 'Passe finie', statut: 'en-cours', testeurs: [KARIM, SONIA],
    termines: { [KARIM]: new Date(), [SONIA]: new Date(Date.now() - 9 * 86400000) },
    fins: { [KARIM]: new Date(Date.now() + 5 * 86400000), [SONIA]: new Date(Date.now() - 2 * 86400000) } });
  await setDoc(doc(b, 'projets/atelier/campagnes/c1/remarques/r-sonia'), { testeur: SONIA, texte: 'La police est petite.', cree: new Date() });
  await setDoc(doc(b, 'projets/atelier/campagnes/c1/remarques/r-karim'), { testeur: KARIM, texte: 'Le bouton Retour est loin.', scenario: 'DI-01', plateforme: 'ios', cree: new Date() });
});

const C1 = 'projets/atelier/campagnes/c1/remarques';
const R = (extra = {}) => ({ testeur: KARIM, texte: 'Le calendrier met du temps à s\'ouvrir.', cree: serverTimestamp(), ...extra });

console.log('\n== Le testeur écrit les siennes');
await doit('Karim écrit une remarque en général', addDoc(collection(karim(), C1), R()));
await doit('Karim écrit une remarque sur un scénario, avec la plateforme', addDoc(collection(karim(), C1), R({ scenario: 'DI-15', plateforme: 'android' })));
await refuse('Karim n écrit pas au nom de Sonia', addDoc(collection(karim(), C1), R({ testeur: SONIA })));
await refuse('Marc, hors de la campagne, n écrit rien', addDoc(collection(marc(), C1), R({ testeur: MARC })));
await refuse('Une remarque vide ne part pas', addDoc(collection(karim(), C1), R({ texte: '' })));
await refuse('Une remarque de plus de 2 000 caractères ne part pas', addDoc(collection(karim(), C1), R({ texte: 'x'.repeat(2001) })));
await doit('À 2 000 caractères, elle part', addDoc(collection(karim(), C1), R({ texte: 'x'.repeat(2000) })));
await refuse('Une plateforme inconnue est refusée', addDoc(collection(karim(), C1), R({ plateforme: 'mac' })));
await refuse('Un scénario démesuré est refusé', addDoc(collection(karim(), C1), R({ scenario: 'x'.repeat(81) })));
await refuse('Un champ de plus est refusé', addDoc(collection(karim(), C1), R({ note: 5 })));
await refuse('Une date inventée est refusée', addDoc(collection(karim(), C1), R({ cree: new Date(Date.now() - 86400000) })));
await refuse('Sans date, refusée', addDoc(collection(karim(), C1), { testeur: KARIM, texte: 'sans date' }));
await refuse('Pas sur une campagne close', addDoc(collection(karim(), 'projets/atelier/campagnes/close/remarques'), R()));
await doit('Après sa fin de test, pendant ses sept jours, encore', addDoc(collection(karim(), 'projets/atelier/campagnes/c-fin/remarques'), R()));
await refuse('Accès passé : plus de remarque', addDoc(collection(sonia(), 'projets/atelier/campagnes/c-fin/remarques'), R({ testeur: SONIA })));
await refuse('Le client n écrit pas de remarque de testeur', addDoc(collection(camille(), C1), R({ testeur: CAMILLE })));
await refuse('Un inconnu non plus', addDoc(collection(anonyme(), C1), R()));

console.log('\n== Une remarque ne se reprend pas');
await refuse('Karim ne modifie pas la sienne', updateDoc(doc(karim(), `${C1}/r-karim`), { texte: 'autre chose' }));
await refuse('ni ne la réécrit', setDoc(doc(karim(), `${C1}/r-karim`), R()));
await refuse('ni ne l efface', deleteDoc(doc(karim(), `${C1}/r-karim`)));
await refuse('L équipe ne la modifie pas', updateDoc(doc(equipe(), `${C1}/r-karim`), { texte: 'corrigé' }));
await refuse('ni ne l efface', deleteDoc(doc(equipe(), `${C1}/r-karim`)));

console.log('\n== Qui lit');
await doit('Karim relit les siennes', getDocs(query(collection(karim(), C1), where('testeur', '==', KARIM))));
await refuse('Karim ne lit pas celles de Sonia', getDoc(doc(karim(), `${C1}/r-sonia`)));
await refuse('ni toutes d un coup', getDocs(collection(karim(), C1)));
await doit('L équipe lit tout', getDocs(collection(equipe(), C1)));
await doit('Le client du projet lit tout (l écran les anonymise)', getDocs(collection(camille(), C1)));
await refuse('Le client d un autre projet, non', getDocs(collection(lea(), C1)));
await refuse('Un inconnu, non', getDocs(collection(anonyme(), C1)));

console.log('\n== La note du test : l équipe seule');
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`), { noteTest: { note: 2, commentaire: 'Le client n a pas fourni de compte.', le: new Date() }, testeur: KARIM, remarques: [{ texte: 'ancienne', le: new Date() }] });
});
const RETOUR = (uid) => `projets/atelier/campagnes/c1/appreciations/${uid}/equipe/retour`;
const NOTE = (extra = {}) => ({ noteTest: { note: 4, commentaire: 'Clair.', le: serverTimestamp() }, testeur: SONIA, maj: serverTimestamp(), ...extra });
await doit('Sonia note le test en terminant', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE()));
await doit('et se corrige avant que la fin soit posée', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE({ noteTest: { note: 5, commentaire: '', le: serverTimestamp() } }), { merge: true }));
await refuse('Sonia n écrit pas la note de Karim', setDoc(doc(sonia(), RETOUR(KARIM)), NOTE()));
await refuse('Une note hors de 1 à 5 ne passe pas', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE({ noteTest: { note: 9, commentaire: '', le: serverTimestamp() } })));
await refuse('Un commentaire de plus de 2 000 caractères non plus', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE({ noteTest: { note: 3, commentaire: 'x'.repeat(2001), le: serverTimestamp() } })));
await refuse('Une date inventée non plus', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE({ noteTest: { note: 3, commentaire: '', le: new Date(Date.now() - 86400000) } })));
await refuse('Le testeur n y glisse pas de remarques', setDoc(doc(sonia(), RETOUR(SONIA)), NOTE({ remarques: [{ texte: 'x' }] }), { merge: true }));
await refuse('Un autre nom de document est refusé', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}/equipe/autre`), NOTE()));
await refuse('Test terminé : Karim ne réécrit plus sa note', setDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`), { noteTest: { note: 5, commentaire: '', le: serverTimestamp() }, testeur: KARIM, maj: serverTimestamp() }, { merge: true }));
await refuse('Personne ne l efface', deleteDoc(doc(equipe(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));
await doit('L équipe lit la note et ses mots', getDoc(doc(equipe(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));
await doit('Karim relit la sienne', getDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));
await refuse('Le client ne la lit pas', getDoc(doc(camille(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));
await refuse('Sonia ne lit pas celle de Karim', getDoc(doc(sonia(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));
await refuse('Un inconnu non plus', getDoc(doc(anonyme(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}/equipe/retour`)));

console.log('\n== L avis anonyme : personne ne l écrit depuis un navigateur');
/* Les réponses au questionnaire (08/10/2026) : rangées par le serveur
   (hubAvisTesteur) dans avisAnonymes/{moment}/reponses, sans identifiant ni
   date. Le compte du moment se lit ; les réponses, seulement à partir de
   trois. */
const AVIS = (m) => `projets/atelier/campagnes/c1/avisAnonymes/${m}`;
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, AVIS('avant')), { recus: 2 });
  await setDoc(doc(b, `${AVIS('avant')}/reponses/x1`), { moment: 'avant', reponses: { 'impression.compris': 4 } });
  await setDoc(doc(b, `${AVIS('avant')}/reponses/x2`), { moment: 'avant', reponses: { 'impression.compris': 2 } });
  await setDoc(doc(b, AVIS('apres')), { recus: 3 });
  for (const [i, n] of [[1, 5], [2, 4], [3, 3]]) await setDoc(doc(b, `${AVIS('apres')}/reponses/y${i}`), { moment: 'apres', reponses: { 'esthetique.belle': n } });
});
await refuse('Karim n écrit pas une réponse anonyme lui-même', setDoc(doc(karim(), `${AVIS('apres')}/reponses/moi`), { moment: 'apres', reponses: { 'esthetique.belle': 5 } }));
await refuse('ni n ajoute au compte', setDoc(doc(karim(), AVIS('apres')), { recus: 4 }));
await refuse('L équipe n écrit pas de réponse à sa place', setDoc(doc(equipe(), `${AVIS('apres')}/reponses/faux`), { moment: 'apres', reponses: { 'esthetique.belle': 5 } }));
await refuse('ni n efface une réponse', deleteDoc(doc(equipe(), `${AVIS('apres')}/reponses/y1`)));
await refuse('Le client n écrit rien non plus', setDoc(doc(camille(), `${AVIS('apres')}/reponses/faux`), { moment: 'apres', reponses: {} }));

console.log('\n== L avis anonyme : rien sous trois réponses');
await doit('Le client lit le compte d un moment', getDoc(doc(camille(), AVIS('avant'))));
await refuse('Deux réponses : le client ne les lit pas', getDocs(collection(camille(), `${AVIS('avant')}/reponses`)));
await refuse('ni une à une', getDoc(doc(camille(), `${AVIS('avant')}/reponses/x1`)));
await refuse('L équipe non plus, sous trois', getDocs(collection(equipe(), `${AVIS('avant')}/reponses`)));
await doit('Trois réponses : le client les lit', getDocs(collection(camille(), `${AVIS('apres')}/reponses`)));
await doit('l équipe aussi', getDocs(collection(equipe(), `${AVIS('apres')}/reponses`)));
await refuse('Le client d un autre projet, jamais', getDocs(collection(lea(), `${AVIS('apres')}/reponses`)));
await refuse('Un testeur ne lit pas les réponses des autres', getDocs(collection(sonia(), `${AVIS('apres')}/reponses`)));
await refuse('ni le compte', getDoc(doc(sonia(), AVIS('apres'))));
await refuse('Un inconnu, rien', getDoc(doc(anonyme(), AVIS('apres'))));

console.log('\n== Le testeur n écrit que ses traces, et « J ai terminé » attend son avis');
const APP = (uid, c = 'c1') => `projets/atelier/campagnes/${c}/appreciations/${uid}`;
await doit('Sonia consigne ses premiers pas', setDoc(doc(sonia(), APP(SONIA)), { accueil: serverTimestamp(), testeur: SONIA, maj: serverTimestamp() }, { merge: true }));
await refuse('Sonia n écrit plus de réponse dans son appréciation', setDoc(doc(sonia(), APP(SONIA)), { 'esthetique.belle': 5 }, { merge: true }));
await refuse('ni « a répondu » à la place du serveur', setDoc(doc(sonia(), APP(SONIA)), { avisRendus: { apres: true } }, { merge: true }));
await refuse('Sans avis de fin, pas de « J ai terminé »', setDoc(doc(sonia(), APP(SONIA)), { termine: serverTimestamp(), testeur: SONIA, maj: serverTimestamp() }, { merge: true }));
await refuse('ni dès la création de l appréciation', setDoc(doc(karim(), APP(KARIM)), { termine: serverTimestamp(), testeur: KARIM }));
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), APP(SONIA)), { avisRendus: { apres: true }, testeur: SONIA }, { merge: true }); });
await refuse('Avis rendu, mais une date inventée : refusé', setDoc(doc(sonia(), APP(SONIA)), { termine: new Date(Date.now() - 3600000), testeur: SONIA }, { merge: true }));
await doit('Avis de fin rendu : Sonia dit « J ai terminé »', setDoc(doc(sonia(), APP(SONIA)), { termine: serverTimestamp(), testeur: SONIA, maj: serverTimestamp() }, { merge: true }));
await refuse('Sonia ne retire pas son « a répondu »', updateDoc(doc(sonia(), APP(SONIA)), { avisRendus: {} }));
await doit('L équipe voit qui a répondu', getDoc(doc(equipe(), APP(SONIA))));
await refuse('Le client ne lit pas l appréciation d un testeur', getDoc(doc(camille(), APP(SONIA))));
await refuse('ni la liste', getDocs(collection(camille(), 'projets/atelier/campagnes/c1/appreciations')));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
