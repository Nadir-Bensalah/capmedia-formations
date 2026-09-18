/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles à l'épreuve
   Émulateur Firestore uniquement. Chaque essai est une tentative d'abus
   ou un droit attendu ; la sortie liste ce qui passe et ce qui casse.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/regles.test.mjs"
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: PROJET,
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const NADIR = 'uid-nadir';
const SEB = 'uid-seb';
const CLAIRE = 'uid-claire';
const jeton = (uid, email) => ({ email, email_verified: true, sub: uid });
const equipe = () => env.authenticatedContext(NADIR, jeton(NADIR, 'nadir.essai@exemple.test')).firestore();
const seb = () => env.authenticatedContext(SEB, jeton(SEB, 'sebastien.essai@exemple.test')).firestore();
const claire = () => env.authenticatedContext(CLAIRE, jeton(CLAIRE, 'claire.essai@exemple.test')).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

let ok = 0; const ecarts = [];
const doit = async (libelle, promesse) => { try { await assertSucceeds(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (refusé à tort)'); } };
const refuse = async (libelle, promesse) => { try { await assertFails(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (AUTORISÉ À TORT)'); } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'equipe', NADIR), { nom: 'Nadir', email: 'nadir.essai@exemple.test', role: 'admin', actif: true });
  await setDoc(doc(b, 'organisations/perseus'), { nom: 'Seb', membres: [SEB], contacts: [] });
  await setDoc(doc(b, 'organisations/menuo'), { nom: 'Claire', membres: [CLAIRE], contacts: [] });
  await setDoc(doc(b, 'projets/forgeme'), { nom: 'ForgeMe', ref: 'FORGEME', membres: [SEB], organisation: 'perseus', statut: 'en-cours', compteur: 0 });
  await setDoc(doc(b, 'projets/menuo'), { nom: 'Menuo', ref: 'MENUO', membres: [CLAIRE], organisation: 'menuo', statut: 'cadrage', compteur: 0 });
  await setDoc(doc(b, 'projets/forgeme/composants/ios'), { nom: 'iOS' });
  await setDoc(doc(b, 'projets/forgeme/jalons/dev'), { projet: 'forgeme', titre: 'Dev', statut: 'en-cours' });
  await setDoc(doc(b, 'projets/forgeme/liens/public'), { nom: 'Web', url: 'https://x', visibilite: 'client' });
  await setDoc(doc(b, 'projets/forgeme/liens/prive'), { nom: 'GitHub', url: 'https://x', visibilite: 'interne' });
  await setDoc(doc(b, 'taches/t-client'), { projet: 'forgeme', titre: 'Visible', statut: 'a-faire', priorite: 'normale', visibilite: 'client' });
  await setDoc(doc(b, 'taches/t-interne'), { projet: 'forgeme', titre: 'Interne', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' });
  await setDoc(doc(b, 'tickets/t1'), { projet: 'forgeme', numero: 'FORGEME-001', titre: 'x', statut: 'a-valider', urgence: 'important', auteur: { uid: SEB }, resolu: null, lu: {} });
  await setDoc(doc(b, 'tickets/t1/messages/m-interne'), { de: { uid: NADIR, cote: 'equipe' }, texte: 'secret', interne: true, pieces: [] });
  await setDoc(doc(b, 'tickets/t1/messages/m-public'), { de: { uid: NADIR, cote: 'equipe' }, texte: 'bonjour', interne: false, pieces: [] });
  await setDoc(doc(b, 'tickets/t-menuo'), { projet: 'menuo', numero: 'MENUO-001', titre: 'y', statut: 'nouveau', urgence: 'important', auteur: { uid: CLAIRE }, lu: {} });
  await setDoc(doc(b, 'validations/v1'), { projet: 'forgeme', titre: 'Maquette', statut: 'en-attente', reponse: null });
  await setDoc(doc(b, 'validations/v-menuo'), { projet: 'menuo', titre: 'Logo', statut: 'en-attente', reponse: null });
  await setDoc(doc(b, 'fichiers/f-client'), { projet: 'forgeme', nom: 'a.pdf', chemin: 'projets/forgeme/documents/fichiers/a.pdf', visibilite: 'client', archive: false, par: { uid: NADIR } });
  await setDoc(doc(b, 'fichiers/f-interne'), { projet: 'forgeme', nom: 'b.md', chemin: 'projets/forgeme/documents/fichiers/b.md', visibilite: 'interne', archive: false, par: { uid: NADIR } });
  await setDoc(doc(b, 'releases/r1'), { projet: 'forgeme', version: '1.0', statut: 'disponible', visibilite: 'client' });
  await setDoc(doc(b, 'reunions/re1'), { projet: 'forgeme', titre: 'Point', visibilite: 'client' });
  await setDoc(doc(b, 'notes/n-interne'), { projet: 'forgeme', titre: 'Risque', visibilite: 'interne' });
  await setDoc(doc(b, 'blocages/b1'), { projet: 'forgeme', titre: 'Bloque', visibilite: 'client', resolu: null });
  await setDoc(doc(b, 'documents/d1'), { projet: 'forgeme', type: 'devis', numero: 'D-1', montant: 100, statut: 'envoye', reponse: null });
  await setDoc(doc(b, 'documents/f1'), { projet: 'forgeme', type: 'facture', numero: 'F-1', montant: 100, statut: 'a-payer' });
  await setDoc(doc(b, 'paiements/p1'), { projet: 'forgeme', facture: 'f1', montant: 100 });
  await setDoc(doc(b, 'activite/a-client'), { projet: 'forgeme', type: 'tache', texte: 'x', visibilite: 'client' });
  await setDoc(doc(b, 'activite/a-interne'), { projet: 'forgeme', type: 'tache', texte: 'x', visibilite: 'interne' });
  await setDoc(doc(b, `boites/${SEB}/notifications/n1`), { titre: 'x', lu: false });
  await setDoc(doc(b, 'demandesProjet/dp1'), { par: { uid: CLAIRE, email: 'claire.essai@exemple.test' }, titre: 'Appli', statut: 'nouvelle', projet: null, pieces: [] });
  await setDoc(doc(b, 'contact-messages/c1'), { nom: 'Prospect', email: 'p@x.fr' });
});

console.log('\n== Cloisonnement entre clients');
await doit('Sébastien lit son projet', getDoc(doc(seb(), 'projets/forgeme')));
await refuse('Sébastien ne lit pas le projet de Claire', getDoc(doc(seb(), 'projets/menuo')));
await refuse('Sébastien ne liste pas tous les projets', getDocs(collection(seb(), 'projets')));
await doit('Sébastien liste les projets où il est membre', getDocs(query(collection(seb(), 'projets'), where('membres', 'array-contains', SEB))));
await refuse('Claire ne lit pas la demande de Sébastien', getDoc(doc(claire(), 'tickets/t1')));
await refuse('Claire ne lit pas la validation de Sébastien', getDoc(doc(claire(), 'validations/v1')));
await refuse('Claire ne lit pas les tâches de ForgeMe', getDocs(query(collection(claire(), 'taches'), where('projet', '==', 'forgeme'), where('visibilite', '==', 'client'))));
await refuse('Claire ne lit pas les fichiers de ForgeMe', getDocs(query(collection(claire(), 'fichiers'), where('projet', '==', 'forgeme'), where('visibilite', '==', 'client'))));
await refuse('Claire ne lit pas la conversation de ForgeMe', getDocs(collection(claire(), 'projets/forgeme/messages')));
await refuse('Claire ne lit pas les factures de ForgeMe', getDoc(doc(claire(), 'documents/f1')));
await refuse("Claire ne lit pas l'organisation de Sébastien", getDoc(doc(claire(), 'organisations/perseus')));
await refuse('Anonyme ne lit rien', getDoc(doc(anonyme(), 'projets/forgeme')));
await refuse('Sébastien ne lit pas la boîte de Claire', getDocs(collection(seb(), `boites/${CLAIRE}/notifications`)));

console.log('\n== Interne contre client');
await refuse('Sébastien ne lit pas une tâche interne', getDoc(doc(seb(), 'taches/t-interne')));
await doit('Sébastien lit une tâche visible', getDoc(doc(seb(), 'taches/t-client')));
await refuse('Sébastien ne liste pas les tâches sans le filtre de visibilité', getDocs(query(collection(seb(), 'taches'), where('projet', '==', 'forgeme'))));
await doit('Sébastien liste les tâches visibles', getDocs(query(collection(seb(), 'taches'), where('projet', '==', 'forgeme'), where('visibilite', '==', 'client'))));
await refuse('Sébastien ne lit pas une note interne', getDoc(doc(seb(), 'notes/n-interne')));
await refuse('Sébastien ne lit pas un fichier interne', getDoc(doc(seb(), 'fichiers/f-interne')));
await refuse('Sébastien ne lit pas un lien interne', getDoc(doc(seb(), 'projets/forgeme/liens/prive')));
await doit('Sébastien lit un lien public', getDoc(doc(seb(), 'projets/forgeme/liens/public')));
await refuse("Sébastien ne lit pas l'activité interne", getDoc(doc(seb(), 'activite/a-interne')));
await doit("Sébastien lit l'activité client", getDoc(doc(seb(), 'activite/a-client')));
await refuse('Sébastien ne lit pas une note interne de demande', getDoc(doc(seb(), 'tickets/t1/messages/m-interne')));
await doit('Sébastien lit un message public de demande', getDoc(doc(seb(), 'tickets/t1/messages/m-public')));
await doit("L'équipe lit tout, interne compris", getDoc(doc(equipe(), 'taches/t-interne')));

console.log('\n== Ce que le client peut écrire');
await doit('Sébastien crée une demande', addDoc(collection(seb(), 'tickets'), { numero: null, projet: 'forgeme', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: SEB, nom: 'Seb', email: 'sebastien.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await refuse('Sébastien ne crée pas une demande sur le projet de Claire', addDoc(collection(seb(), 'tickets'), { numero: null, projet: 'menuo', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: SEB, nom: 'Seb', email: 'sebastien.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await refuse('Sébastien ne se donne pas un numéro', addDoc(collection(seb(), 'tickets'), { numero: 'FORGEME-999', projet: 'forgeme', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: SEB, nom: 'Seb', email: 'sebastien.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await doit('Sébastien valide une correction livrée', updateDoc(doc(seb(), 'tickets/t1'), { statut: 'resolu', resolu: serverTimestamp(), maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
await refuse("Sébastien ne change pas l'urgence", updateDoc(doc(seb(), 'tickets/t1'), { urgence: 'bloquant' }));
await refuse("Sébastien ne s'assigne pas la demande", updateDoc(doc(seb(), 'tickets/t1'), { assigne: SEB }));
await doit('Sébastien écrit dans la conversation', addDoc(collection(seb(), 'projets/forgeme/messages'), { de: { uid: SEB, nom: 'Seb', cote: 'client' }, texte: 'Bonjour', pieces: [], date: serverTimestamp() }));
await refuse("Sébastien ne se fait pas passer pour l'équipe", addDoc(collection(seb(), 'projets/forgeme/messages'), { de: { uid: SEB, nom: 'Seb', cote: 'equipe' }, texte: 'Bonjour', pieces: [], date: serverTimestamp() }));
await refuse("Sébastien n'écrit pas une note interne", addDoc(collection(seb(), 'tickets/t1/messages'), { de: { uid: SEB, nom: 'Seb', cote: 'client' }, texte: 'x', pieces: [], interne: true, date: serverTimestamp() }));
await doit('Sébastien approuve une validation', updateDoc(doc(seb(), 'validations/v1'), { statut: 'approuvee', reponse: { par: SEB, nom: 'Seb', date: serverTimestamp(), commentaire: 'ok' }, maj: serverTimestamp() }));
await refuse('Sébastien ne répond pas deux fois', updateDoc(doc(seb(), 'validations/v1'), { statut: 'modifications', reponse: { par: SEB, nom: 'Seb', date: serverTimestamp(), commentaire: 'non' }, maj: serverTimestamp() }));
await refuse('Sébastien ne crée pas une validation', addDoc(collection(seb(), 'validations'), { projet: 'forgeme', titre: 'x', statut: 'en-attente' }));
await doit('Sébastien dépose une capture', addDoc(collection(seb(), 'fichiers'), { projet: 'forgeme', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/forgeme/documents/client/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: SEB, nom: 'Seb', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse('Sébastien ne dépose pas dans « contrats »', addDoc(collection(seb(), 'fichiers'), { projet: 'forgeme', composant: '', categorie: 'contrats', nom: 'c.pdf', chemin: 'projets/forgeme/documents/client/c.pdf', taille: 1, type: 'application/pdf', description: '', tags: [], par: { uid: SEB, nom: 'Seb', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse("Sébastien ne dépose pas sous le chemin d'un autre projet", addDoc(collection(seb(), 'fichiers'), { projet: 'forgeme', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/menuo/documents/client/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: SEB, nom: 'Seb', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await doit('Sébastien accepte un devis', updateDoc(doc(seb(), 'documents/d1'), { statut: 'accepte', reponse: { par: SEB, nom: 'Seb', date: serverTimestamp(), commentaire: '' } }));
await refuse('Sébastien ne touche pas au montant', updateDoc(doc(seb(), 'documents/d1'), { montant: 1 }));
await refuse('Sébastien ne marque pas une facture payée', updateDoc(doc(seb(), 'documents/f1'), { statut: 'payee' }));
await doit('Sébastien marque une notification lue', updateDoc(doc(seb(), `boites/${SEB}/notifications/n1`), { lu: true }));
await refuse('Sébastien ne se crée pas une notification', addDoc(collection(seb(), `boites/${SEB}/notifications`), { titre: 'x', lu: false }));
await doit('Sébastien écrit son profil', setDoc(doc(seb(), `profils/${SEB}`), { nom: 'Seb', notifications: { messages: 'off' } }, { merge: true }));
await refuse("Sébastien n'écrit pas le profil de Claire", setDoc(doc(seb(), `profils/${CLAIRE}`), { nom: 'x' }));
await doit('Claire décrit un nouveau projet', addDoc(collection(claire(), 'demandesProjet'), { organisation: 'menuo', par: { uid: CLAIRE, nom: 'Claire', email: 'claire.essai@exemple.test' }, titre: 'Appli', idee: 'x', objectifs: '', type: 'autre', plateformes: [], budget: '', delai: '', description: '', fonctionnalites: '', exemples: '', liens: '', pieces: [], statut: 'nouvelle', projet: null, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse("Sébastien ne lit pas la demande de projet de Claire", getDoc(doc(seb(), 'demandesProjet/dp1')));

console.log('\n== Ce que personne ne fait depuis le navigateur');
await refuse("Sébastien n'écrit pas l'activité", addDoc(collection(seb(), 'activite'), { projet: 'forgeme', type: 'x', texte: 'x', visibilite: 'client' }));
await refuse("L'équipe n'écrit pas l'activité non plus", addDoc(collection(equipe(), 'activite'), { projet: 'forgeme', type: 'x', texte: 'x', visibilite: 'client' }));
await refuse("L'équipe ne crée pas un projet en direct", setDoc(doc(equipe(), 'projets/pirate'), { nom: 'x', ref: 'X', membres: [] }));
await refuse("L'équipe ne change pas les membres d'un projet", updateDoc(doc(equipe(), 'projets/forgeme'), { membres: [SEB, CLAIRE] }));
await refuse("L'équipe ne change pas la référence", updateDoc(doc(equipe(), 'projets/forgeme'), { ref: 'AUTRE' }));
await refuse("L'équipe n'écrit pas une fiche d'équipe", setDoc(doc(equipe(), 'equipe/pirate'), { nom: 'x', role: 'admin' }));
await refuse("L'équipe ne crée pas une facture en direct", addDoc(collection(equipe(), 'documents'), { projet: 'forgeme', type: 'facture', montant: 1, statut: 'a-payer' }));
await refuse("L'équipe n'enregistre pas un paiement en direct", addDoc(collection(equipe(), 'paiements'), { projet: 'forgeme', montant: 1 }));
await refuse("L'équipe ne lit pas la file d'e-mails", getDocs(collection(equipe(), 'envois')));
await refuse("L'équipe ne supprime pas une demande", deleteDoc(doc(equipe(), 'tickets/t1')));
await refuse("L'équipe ne réécrit pas l'audit d'une demande", addDoc(collection(equipe(), 'tickets/t1/evenements'), { type: 'x' }));

console.log("\n== Ce que l'équipe fait");
await doit("L'équipe pilote le projet", updateDoc(doc(equipe(), 'projets/forgeme'), { statut: 'en-revue', pulse: { enCours: 'x' }, maj: serverTimestamp() }));
await doit("L'équipe crée une tâche interne", addDoc(collection(equipe(), 'taches'), { projet: 'forgeme', titre: 'x', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' }));
await doit("L'équipe crée une validation", addDoc(collection(equipe(), 'validations'), { projet: 'forgeme', titre: 'x', statut: 'en-attente' }));
await doit("L'équipe crée un jalon", setDoc(doc(equipe(), 'projets/forgeme/jalons/tests'), { projet: 'forgeme', titre: 'Tests', statut: 'a-venir' }));
await doit("L'équipe lit les jalons en groupe", getDocs(query(collection(equipe(), 'projets/forgeme/jalons'))));
await doit("L'équipe lit les prospects du site", getDoc(doc(equipe(), 'contact-messages/c1')));
await refuse('Sébastien ne lit pas les prospects du site', getDoc(doc(seb(), 'contact-messages/c1')));
await doit('Un visiteur dépose un message de contact', addDoc(collection(anonyme(), 'contact-messages'), { nom: 'x', email: 'x@y.fr' }));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
