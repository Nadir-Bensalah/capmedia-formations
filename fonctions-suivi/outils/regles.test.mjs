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

const AGENT = 'uid-agent';
const CAMILLE = 'uid-camille';
const LEA = 'uid-lea';
const jeton = (uid, email) => ({ email, email_verified: true, sub: uid });
const equipe = () => env.authenticatedContext(AGENT, jeton(AGENT, 'agent.essai@exemple.test')).firestore();
const camille = () => env.authenticatedContext(CAMILLE, jeton(CAMILLE, 'camille.essai@exemple.test')).firestore();
const lea = () => env.authenticatedContext(LEA, jeton(LEA, 'lea.essai@exemple.test')).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

let ok = 0; const ecarts = [];
const doit = async (libelle, promesse) => { try { await assertSucceeds(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (refusé à tort)'); } };
const refuse = async (libelle, promesse) => { try { await assertFails(promesse); ok += 1; console.log('  ok     ' + libelle); } catch (e) { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + ' (AUTORISÉ À TORT)'); } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'equipe', AGENT), { nom: 'Alex Durand', email: 'agent.essai@exemple.test', role: 'admin', actif: true });
  await setDoc(doc(b, 'organisations/atelier-nord'), { nom: 'Camille', membres: [CAMILLE], contacts: [] });
  await setDoc(doc(b, 'organisations/boutique'), { nom: 'Léa', membres: [LEA], contacts: [] });
  await setDoc(doc(b, 'projets/atelier'), { nom: 'Atelier', ref: 'ATELIER', membres: [CAMILLE], organisation: 'atelier-nord', statut: 'en-cours', compteur: 0 });
  await setDoc(doc(b, 'projets/boutique'), { nom: 'Boutique', ref: 'BOUTIQUE', membres: [LEA], organisation: 'boutique', statut: 'cadrage', compteur: 0 });
  await setDoc(doc(b, 'projets/atelier/composants/ios'), { nom: 'iOS' });
  await setDoc(doc(b, 'projets/atelier/jalons/dev'), { projet: 'atelier', titre: 'Dev', statut: 'en-cours' });
  await setDoc(doc(b, 'projets/atelier/liens/public'), { nom: 'Web', url: 'https://x', visibilite: 'client' });
  await setDoc(doc(b, 'projets/atelier/liens/prive'), { nom: 'GitHub', url: 'https://x', visibilite: 'interne' });
  await setDoc(doc(b, 'taches/t-client'), { projet: 'atelier', titre: 'Visible', statut: 'a-faire', priorite: 'normale', visibilite: 'client' });
  await setDoc(doc(b, 'taches/t-interne'), { projet: 'atelier', titre: 'Interne', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' });
  await setDoc(doc(b, 'tickets/t1'), { projet: 'atelier', numero: 'ATELIER-001', titre: 'x', statut: 'a-valider', urgence: 'important', auteur: { uid: CAMILLE }, resolu: null, lu: {} });
  await setDoc(doc(b, 'tickets/t1/messages/m-interne'), { de: { uid: AGENT, cote: 'equipe' }, texte: 'secret', interne: true, pieces: [] });
  await setDoc(doc(b, 'tickets/t1/messages/m-public'), { de: { uid: AGENT, cote: 'equipe' }, texte: 'bonjour', interne: false, pieces: [] });
  await setDoc(doc(b, 'tickets/t-boutique'), { projet: 'boutique', numero: 'BOUTIQUE-001', titre: 'y', statut: 'nouveau', urgence: 'important', auteur: { uid: LEA }, lu: {} });
  await setDoc(doc(b, 'validations/v1'), { projet: 'atelier', titre: 'Maquette', statut: 'en-attente', reponse: null });
  await setDoc(doc(b, 'validations/v-boutique'), { projet: 'boutique', titre: 'Logo', statut: 'en-attente', reponse: null });
  await setDoc(doc(b, 'fichiers/f-client'), { projet: 'atelier', nom: 'a.pdf', chemin: 'projets/atelier/documents/fichiers/a.pdf', visibilite: 'client', archive: false, par: { uid: AGENT } });
  await setDoc(doc(b, 'fichiers/f-interne'), { projet: 'atelier', nom: 'b.md', chemin: 'projets/atelier/documents/fichiers/b.md', visibilite: 'interne', archive: false, par: { uid: AGENT } });
  await setDoc(doc(b, 'releases/r1'), { projet: 'atelier', version: '1.0', statut: 'disponible', visibilite: 'client' });
  await setDoc(doc(b, 'reunions/re1'), { projet: 'atelier', titre: 'Point', visibilite: 'client' });
  await setDoc(doc(b, 'notes/n-interne'), { projet: 'atelier', titre: 'Risque', visibilite: 'interne' });
  await setDoc(doc(b, 'blocages/b1'), { projet: 'atelier', titre: 'Bloque', visibilite: 'client', resolu: null });
  await setDoc(doc(b, 'documents/d1'), { projet: 'atelier', type: 'devis', numero: 'D-1', montant: 100, statut: 'envoye', reponse: null });
  await setDoc(doc(b, 'documents/f1'), { projet: 'atelier', type: 'facture', numero: 'F-1', montant: 100, statut: 'a-payer' });
  await setDoc(doc(b, 'paiements/p1'), { projet: 'atelier', facture: 'f1', montant: 100 });
  await setDoc(doc(b, 'activite/a-client'), { projet: 'atelier', type: 'tache', texte: 'x', visibilite: 'client' });
  await setDoc(doc(b, 'activite/a-interne'), { projet: 'atelier', type: 'tache', texte: 'x', visibilite: 'interne' });
  await setDoc(doc(b, `boites/${CAMILLE}/notifications/n1`), { titre: 'x', lu: false });
  await setDoc(doc(b, 'demandesProjet/dp1'), { par: { uid: LEA, email: 'lea.essai@exemple.test' }, titre: 'Appli', statut: 'nouvelle', projet: null, pieces: [] });
  await setDoc(doc(b, 'contact-messages/c1'), { nom: 'Prospect', email: 'p@x.fr' });
});

console.log('\n== Cloisonnement entre clients');
await doit('Camille lit son projet', getDoc(doc(camille(), 'projets/atelier')));
await refuse('Camille ne lit pas le projet de Léa', getDoc(doc(camille(), 'projets/boutique')));
await refuse('Camille ne liste pas tous les projets', getDocs(collection(camille(), 'projets')));
await doit('Camille liste les projets où il est membre', getDocs(query(collection(camille(), 'projets'), where('membres', 'array-contains', CAMILLE))));
await refuse('Léa ne lit pas la demande de Camille', getDoc(doc(lea(), 'tickets/t1')));
await refuse('Léa ne lit pas la validation de Camille', getDoc(doc(lea(), 'validations/v1')));
await refuse('Léa ne lit pas les tâches de Atelier', getDocs(query(collection(lea(), 'taches'), where('projet', '==', 'atelier'), where('visibilite', '==', 'client'))));
await refuse('Léa ne lit pas les fichiers de Atelier', getDocs(query(collection(lea(), 'fichiers'), where('projet', '==', 'atelier'), where('visibilite', '==', 'client'))));
await refuse('Léa ne lit pas la conversation de Atelier', getDocs(collection(lea(), 'projets/atelier/messages')));
await refuse('Léa ne lit pas les factures de Atelier', getDoc(doc(lea(), 'documents/f1')));
await refuse("Léa ne lit pas l'organisation de Camille", getDoc(doc(lea(), 'organisations/atelier-nord')));
await refuse('Anonyme ne lit rien', getDoc(doc(anonyme(), 'projets/atelier')));
await refuse('Camille ne lit pas la boîte de Léa', getDocs(collection(camille(), `boites/${LEA}/notifications`)));

console.log('\n== Interne contre client');
await refuse('Camille ne lit pas une tâche interne', getDoc(doc(camille(), 'taches/t-interne')));
await doit('Camille lit une tâche visible', getDoc(doc(camille(), 'taches/t-client')));
await refuse('Camille ne liste pas les tâches sans le filtre de visibilité', getDocs(query(collection(camille(), 'taches'), where('projet', '==', 'atelier'))));
await doit('Camille liste les tâches visibles', getDocs(query(collection(camille(), 'taches'), where('projet', '==', 'atelier'), where('visibilite', '==', 'client'))));
await refuse('Camille ne lit pas une note interne', getDoc(doc(camille(), 'notes/n-interne')));
await refuse('Camille ne lit pas un fichier interne', getDoc(doc(camille(), 'fichiers/f-interne')));
await refuse('Camille ne lit pas un lien interne', getDoc(doc(camille(), 'projets/atelier/liens/prive')));
await doit('Camille lit un lien public', getDoc(doc(camille(), 'projets/atelier/liens/public')));
await refuse("Camille ne lit pas l'activité interne", getDoc(doc(camille(), 'activite/a-interne')));
await doit("Camille lit l'activité client", getDoc(doc(camille(), 'activite/a-client')));
await refuse('Camille ne lit pas une note interne de demande', getDoc(doc(camille(), 'tickets/t1/messages/m-interne')));
await doit('Camille lit un message public de demande', getDoc(doc(camille(), 'tickets/t1/messages/m-public')));
await doit("L'équipe lit tout, interne compris", getDoc(doc(equipe(), 'taches/t-interne')));

console.log('\n== Les accusés de lecture');
await doit('Camille pose son accusé de lecture', setDoc(doc(camille(), 'projets/atelier/lectures/' + CAMILLE), { lu: serverTimestamp(), frappe: null, cote: 'client', nom: 'Camille' }));
await doit("L'équipe lit les accusés du projet", getDocs(collection(equipe(), 'projets/atelier/lectures')));
await doit('Camille lit les accusés de son projet', getDocs(collection(camille(), 'projets/atelier/lectures')));
await refuse("Camille ne pose pas l'accusé de quelqu'un d'autre", setDoc(doc(camille(), 'projets/atelier/lectures/' + AGENT), { lu: serverTimestamp(), cote: 'equipe', nom: 'Agent' }));
await refuse("Camille ne glisse pas de texte dans un accusé", setDoc(doc(camille(), 'projets/atelier/lectures/' + CAMILLE), { lu: serverTimestamp(), cote: 'client', nom: 'Camille', texte: 'coucou' }));
await refuse("Léa ne lit pas les accusés de Atelier", getDocs(collection(lea(), 'projets/atelier/lectures')));

console.log('\n== Ce que le client peut écrire');
await doit('Camille crée une demande', addDoc(collection(camille(), 'tickets'), { numero: null, projet: 'atelier', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await refuse('Camille ne crée pas une demande sur le projet de Léa', addDoc(collection(camille(), 'tickets'), { numero: null, projet: 'boutique', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await refuse('Camille ne se donne pas un numéro', addDoc(collection(camille(), 'tickets'), { numero: 'ATELIER-999', projet: 'atelier', composant: '', titre: 'Bug', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null }));
await doit('Camille valide une correction livrée', updateDoc(doc(camille(), 'tickets/t1'), { statut: 'resolu', resolu: serverTimestamp(), maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
await refuse("Camille ne change pas l'urgence", updateDoc(doc(camille(), 'tickets/t1'), { urgence: 'bloquant' }));
await refuse("Camille ne s'assigne pas la demande", updateDoc(doc(camille(), 'tickets/t1'), { assigne: CAMILLE }));
await doit('Camille écrit dans la conversation', addDoc(collection(camille(), 'projets/atelier/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, texte: 'Bonjour', pieces: [], date: serverTimestamp() }));
await refuse("Camille ne se fait pas passer pour l'équipe", addDoc(collection(camille(), 'projets/atelier/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'equipe' }, texte: 'Bonjour', pieces: [], date: serverTimestamp() }));
await refuse("Camille n'écrit pas une note interne", addDoc(collection(camille(), 'tickets/t1/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, texte: 'x', pieces: [], interne: true, date: serverTimestamp() }));
await doit('Camille approuve une validation', updateDoc(doc(camille(), 'validations/v1'), { statut: 'approuvee', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: 'ok' }, maj: serverTimestamp() }));
await refuse('Camille ne répond pas deux fois', updateDoc(doc(camille(), 'validations/v1'), { statut: 'modifications', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: 'non' }, maj: serverTimestamp() }));
await refuse('Camille ne crée pas une validation', addDoc(collection(camille(), 'validations'), { projet: 'atelier', titre: 'x', statut: 'en-attente' }));
await doit('Camille dépose une capture', addDoc(collection(camille(), 'fichiers'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/atelier/documents/client/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse('Camille ne dépose pas dans « contrats »', addDoc(collection(camille(), 'fichiers'), { projet: 'atelier', composant: '', categorie: 'contrats', nom: 'c.pdf', chemin: 'projets/atelier/documents/client/c.pdf', taille: 1, type: 'application/pdf', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse("Camille ne dépose pas sous le chemin d'un autre projet", addDoc(collection(camille(), 'fichiers'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/boutique/documents/client/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await doit('Camille accepte un devis', updateDoc(doc(camille(), 'documents/d1'), { statut: 'accepte', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: '' } }));
await refuse('Camille ne touche pas au montant', updateDoc(doc(camille(), 'documents/d1'), { montant: 1 }));
await refuse('Camille ne marque pas une facture payée', updateDoc(doc(camille(), 'documents/f1'), { statut: 'payee' }));
await doit('Camille marque une notification lue', updateDoc(doc(camille(), `boites/${CAMILLE}/notifications/n1`), { lu: true }));
await refuse('Camille ne se crée pas une notification', addDoc(collection(camille(), `boites/${CAMILLE}/notifications`), { titre: 'x', lu: false }));
await doit('Camille écrit son profil', setDoc(doc(camille(), `profils/${CAMILLE}`), { nom: 'Camille', notifications: { messages: 'off' } }, { merge: true }));
await refuse("Camille n'écrit pas le profil de Léa", setDoc(doc(camille(), `profils/${LEA}`), { nom: 'x' }));
await doit('Léa décrit un nouveau projet', addDoc(collection(lea(), 'demandesProjet'), { organisation: 'boutique', par: { uid: LEA, nom: 'Léa', email: 'lea.essai@exemple.test' }, titre: 'Appli', idee: 'x', objectifs: '', type: 'autre', plateformes: [], budget: '', delai: '', description: '', fonctionnalites: '', exemples: '', liens: '', pieces: [], statut: 'nouvelle', projet: null, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse("Camille ne lit pas la demande de projet de Léa", getDoc(doc(camille(), 'demandesProjet/dp1')));

console.log('\n== Ce que personne ne fait depuis le navigateur');
await refuse("Camille n'écrit pas l'activité", addDoc(collection(camille(), 'activite'), { projet: 'atelier', type: 'x', texte: 'x', visibilite: 'client' }));
await refuse("L'équipe n'écrit pas l'activité non plus", addDoc(collection(equipe(), 'activite'), { projet: 'atelier', type: 'x', texte: 'x', visibilite: 'client' }));
await refuse("L'équipe ne crée pas un projet en direct", setDoc(doc(equipe(), 'projets/pirate'), { nom: 'x', ref: 'X', membres: [] }));
await refuse("L'équipe ne change pas les membres d'un projet", updateDoc(doc(equipe(), 'projets/atelier'), { membres: [CAMILLE, LEA] }));
await refuse("L'équipe ne change pas la référence", updateDoc(doc(equipe(), 'projets/atelier'), { ref: 'AUTRE' }));
await refuse("L'équipe n'écrit pas une fiche d'équipe", setDoc(doc(equipe(), 'equipe/pirate'), { nom: 'x', role: 'admin' }));
await refuse("L'équipe ne crée pas une facture en direct", addDoc(collection(equipe(), 'documents'), { projet: 'atelier', type: 'facture', montant: 1, statut: 'a-payer' }));
await refuse("L'équipe n'enregistre pas un paiement en direct", addDoc(collection(equipe(), 'paiements'), { projet: 'atelier', montant: 1 }));
await refuse("L'équipe ne lit pas la file d'e-mails", getDocs(collection(equipe(), 'envois')));
await refuse("L'équipe ne supprime pas une demande", deleteDoc(doc(equipe(), 'tickets/t1')));
await refuse("L'équipe ne réécrit pas l'audit d'une demande", addDoc(collection(equipe(), 'tickets/t1/evenements'), { type: 'x' }));

console.log("\n== Ce que l'équipe fait");
await doit("L'équipe pilote le projet", updateDoc(doc(equipe(), 'projets/atelier'), { statut: 'en-revue', pulse: { enCours: 'x' }, maj: serverTimestamp() }));
await doit("L'équipe crée une tâche interne", addDoc(collection(equipe(), 'taches'), { projet: 'atelier', titre: 'x', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' }));
await doit("L'équipe crée une validation", addDoc(collection(equipe(), 'validations'), { projet: 'atelier', titre: 'x', statut: 'en-attente' }));
await doit("L'équipe crée un jalon", setDoc(doc(equipe(), 'projets/atelier/jalons/tests'), { projet: 'atelier', titre: 'Tests', statut: 'a-venir' }));
await doit("L'équipe lit les jalons en groupe", getDocs(query(collection(equipe(), 'projets/atelier/jalons'))));
await doit("L'équipe lit les prospects du site", getDoc(doc(equipe(), 'contact-messages/c1')));
await refuse('Camille ne lit pas les prospects du site', getDoc(doc(camille(), 'contact-messages/c1')));
await doit('Un visiteur dépose un message de contact', addDoc(collection(anonyme(), 'contact-messages'), { nom: 'x', email: 'x@y.fr' }));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
