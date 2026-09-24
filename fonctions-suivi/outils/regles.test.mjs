/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles à l'épreuve
   Émulateur Firestore uniquement. Chaque essai est une tentative d'abus
   ou un droit attendu ; la sortie liste ce qui passe et ce qui casse.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/regles.test.mjs"
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, collectionGroup, query, where, serverTimestamp } from 'firebase/firestore';

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

/* Les testeurs. Ils ne sont membres d'aucun projet : leur accès tient
   entièrement à la revendication « testeur » et à la liste des campagnes.
   Karim et Sonia sont affectés à la campagne en cours, Marc ne l'est pas. */
const KARIM = 'uid-karim';
const SONIA = 'uid-sonia';
const MARC = 'uid-marc';
const jetonTesteur = (uid, email) => ({ email, email_verified: true, sub: uid, testeur: true });
const karim = () => env.authenticatedContext(KARIM, jetonTesteur(KARIM, 'karim.essai@exemple.test')).firestore();
const sonia = () => env.authenticatedContext(SONIA, jetonTesteur(SONIA, 'sonia.essai@exemple.test')).firestore();
const marc = () => env.authenticatedContext(MARC, jetonTesteur(MARC, 'marc.essai@exemple.test')).firestore();

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
  /* Un projet rideau baissé : préparé, chiffré, mais sans personne dedans. */
  await setDoc(doc(b, 'projets/ferme'), { nom: 'En préparation', ref: 'FERME', membres: [], organisation: 'atelier-nord', statut: 'brouillon', ouvert: false, compteur: 0 });
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
  await setDoc(doc(b, 'contact-messages/c1'), { nom: 'Prospect', email: 'p@x.test' });

  /* La plateforme de tests. Une campagne en cours où figurent Karim et
     Sonia, une campagne close, et un passage de chacun. */
  await setDoc(doc(b, 'testeurs', KARIM), { prenom: 'Karim', email: 'karim.essai@exemple.test', profil: { age: '25-34' }, projets: ['atelier'] });
  await setDoc(doc(b, 'testeurs', SONIA), { prenom: 'Sonia', email: 'sonia.essai@exemple.test', profil: { age: '35-44' }, projets: ['atelier'] });
  await setDoc(doc(b, 'testeurs', MARC), { prenom: 'Marc', email: 'marc.essai@exemple.test', profil: { age: '45-54' }, projets: [] });
  await setDoc(doc(b, 'projets/atelier/scenarios/DI-15'), { ref: 'DI-15', bloc: 'dates-importantes', titre: 'Rappel fin de mois', niveau: 'socle', actif: true });
  await setDoc(doc(b, 'projets/atelier/scenarios/ID-01'), { ref: 'ID-01', bloc: 'idees', titre: 'Idee minimale', niveau: 'reparti', actif: true });
  await setDoc(doc(b, 'projets/atelier/campagnes/c1'), { titre: 'Passe 1.2.0', statut: 'en-cours', testeurs: [KARIM, SONIA], builds: { ios: '24' } });
  await setDoc(doc(b, 'projets/atelier/campagnes/close'), { titre: 'Passe 1.1.0', statut: 'close', testeurs: [KARIM], builds: { ios: '22' } });
  await setDoc(doc(b, `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`), { scenario: 'DI-15', testeur: KARIM, plateforme: 'ios', resultat: 'ko', commentaire: 'rappel le 3 mars', preuves: ['p/1.mp4'], contexte: { modele: 'iPhone 13' } });
  await setDoc(doc(b, `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`), { scenario: 'DI-15', testeur: SONIA, plateforme: 'android', resultat: 'ok', commentaire: '', preuves: [], contexte: { modele: 'Pixel 8' } });
  await setDoc(doc(b, `projets/atelier/campagnes/close/passages/${KARIM}__ID-01`), { scenario: 'ID-01', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {} });
  await setDoc(doc(b, `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { beaute: 4, prix: 5 });
  await setDoc(doc(b, 'projets/atelier/anomalies/a1'), { titre: 'Rappel decale', gravite: 'critique', statut: 'confirmee', passages: [`${KARIM}__DI-15`] });
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

console.log('\n== La fiche technique reste côté équipe');
await doit("L'équipe écrit une fiche technique", setDoc(doc(equipe(), 'projets/atelier/technique/ios'), { lignes: 100, acces: [{ nom: 'App Store Connect', compte: 'capmedia' }] }));
await doit("L'équipe relit la fiche technique", getDoc(doc(equipe(), 'projets/atelier/technique/ios')));
await refuse('Camille ne lit pas la fiche technique de son projet', getDoc(doc(camille(), 'projets/atelier/technique/ios')));
await refuse('Camille ne liste pas les fiches techniques', getDocs(collection(camille(), 'projets/atelier/technique')));
await refuse("Camille n'écrit pas de fiche technique", setDoc(doc(camille(), 'projets/atelier/technique/ios'), { lignes: 1 }));

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
await doit('Camille dépose une capture', setDoc(doc(camille(), 'fichiers/fc-1'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/atelier/fichiers/fc-1/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse('Camille ne dépose pas dans « contrats »', setDoc(doc(camille(), 'fichiers/fc-2'), { projet: 'atelier', composant: '', categorie: 'contrats', nom: 'c.pdf', chemin: 'projets/atelier/fichiers/fc-2/c.pdf', taille: 1, type: 'application/pdf', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse("Camille ne dépose pas sous le chemin d'un autre projet", setDoc(doc(camille(), 'fichiers/fc-3'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/boutique/fichiers/fc-3/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse("Une fiche ne pointe pas le fichier rangé sous une AUTRE fiche", setDoc(doc(camille(), 'fichiers/fc-4'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/atelier/fichiers/fc-1/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
await refuse("L'ancien rangement (documents/client) n'est plus accepté", setDoc(doc(camille(), 'fichiers/fc-5'), { projet: 'atelier', composant: '', categorie: 'captures', nom: 'c.png', chemin: 'projets/atelier/documents/client/c.png', taille: 1, type: 'image/png', description: '', tags: [], par: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, visibilite: 'client', version: '', archive: false, cree: serverTimestamp() }));
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
await doit('Un visiteur dépose un message de contact', addDoc(collection(anonyme(), 'contact-messages'), { nom: 'x', email: 'x@y.test' }));

console.log("\n== L'histoire d'une date, la version d'une correction, l'adresse d'un profil");
/* L'histoire de la date cible est écrite par l'équipe et lue par le client :
   c'est tout son objet. Le client ne la réécrit jamais. */
await doit("L'équipe inscrit un report de la date cible",
  updateDoc(doc(equipe(), 'projets/atelier'), { cible: new Date('2026-12-01'), reports: [{ de: new Date('2026-11-03'), vers: new Date('2026-12-01'), motif: 'attente-client', note: '', le: new Date(), par: 'Agent' }], maj: serverTimestamp() }));
await refuse('Camille ne réécrit pas l\'histoire de la date',
  updateDoc(doc(camille(), 'projets/atelier'), { reports: [] }));
await refuse("L'équipe n'empile pas plus de vingt reports",
  updateDoc(doc(equipe(), 'projets/atelier'), { reports: Array.from({ length: 21 }, () => ({ motif: 'autre' })), maj: serverTimestamp() }));

/* Le pilotage envoie toujours la qualification : la règle l'exige, et un
   champ absent y vaut refus. Le formulaire fait pareil. */
await doit("L'équipe nomme la version qui porte la correction",
  updateDoc(doc(equipe(), 'tickets/t1'), { release: 'r1', qualification: 'incluse', maj: serverTimestamp() }));
/* Une valeur différente de celle déjà posée : écrire la même ne change
   aucune clé, et une écriture qui ne change rien passe partout. */
await refuse('Camille ne choisit pas la version qui porte la correction',
  updateDoc(doc(camille(), 'tickets/t1'), { release: 'r2-invente' }));

/* L'adresse recopiée dans le profil sert au serveur à couper les envois.
   Elle ne peut être que la sienne, sinon on coupe ceux d'un autre. */
await doit('Camille recopie son adresse dans son profil',
  setDoc(doc(camille(), 'profils/uid-camille'), { nom: 'Camille', email: 'camille.essai@exemple.test', notifications: { relance: 'off' } }, { merge: true }));
await refuse("Camille ne pose pas l'adresse de quelqu'un d'autre",
  setDoc(doc(camille(), 'profils/uid-camille'), { email: 'lea.essai@exemple.test' }, { merge: true }));

console.log('\n== Le rideau');
/* Un projet fermé n'a personne dans « membres » : ce n'est pas un masque
   à l'écran, c'est l'absence d'accès. Et lever le rideau n'appartient
   qu'au serveur : c'est lui qui rattache les comptes et refait les jetons. */
await refuse('Camille ne lit pas un projet fermé', getDoc(doc(camille(), 'projets/ferme')));
await refuse('Camille ne lit pas les étapes d un projet fermé', getDocs(collection(camille(), 'projets/ferme/jalons')));
await refuse("L'équipe ne lève pas le rideau depuis le navigateur", updateDoc(doc(equipe(), 'projets/ferme'), { ouvert: true, maj: serverTimestamp() }));
await refuse("L'équipe n'ajoute pas un membre depuis le navigateur", updateDoc(doc(equipe(), 'projets/atelier'), { membres: [CAMILLE, LEA], maj: serverTimestamp() }));
await doit("L'équipe garnit un projet fermé", setDoc(doc(equipe(), 'projets/ferme/jalons/x'), { projet: 'ferme', titre: 'Cadrage', statut: 'a-venir' }));
await doit("L'équipe pose un projet en brouillon", updateDoc(doc(equipe(), 'projets/atelier'), { statut: 'brouillon', maj: serverTimestamp() }));
await doit("L'équipe pose un projet en devis à signer", updateDoc(doc(equipe(), 'projets/atelier'), { statut: 'devis-envoye', maj: serverTimestamp() }));
await doit("L'équipe pose un projet en devis signé", updateDoc(doc(equipe(), 'projets/atelier'), { statut: 'devis-signe', maj: serverTimestamp() }));
await refuse("Un état inventé est refusé", updateDoc(doc(equipe(), 'projets/atelier'), { statut: 'devis-peut-etre', maj: serverTimestamp() }));

console.log("\n== La porte d'entrée");
/* Les empreintes de codes, les compteurs d'essais et les jetons
   d'invitation ne se lisent ni ne s'écrivent depuis un navigateur : c'est
   ce qui rend les garde-fous infranchissables. Pas même pour l'équipe. */
await refuse('Camille ne lit pas les codes en cours', getDoc(doc(camille(), 'connexions/x')));
await refuse("L'équipe non plus", getDoc(doc(equipe(), 'connexions/x')));
await refuse("Personne n'écrit une empreinte de code", setDoc(doc(camille(), 'connexions/x'), { empreinte: 'a' }));
await refuse('Camille ne remet pas son compteur d essais à zéro', updateDoc(doc(camille(), 'connexions/x'), { essais: 0 }));
await refuse('Camille ne lit pas les compteurs par adresse IP', getDoc(doc(camille(), 'connexionsIp/x')));
await refuse('Camille ne lit pas un jeton d invitation', getDoc(doc(camille(), 'invitations/x')));
await refuse("L'équipe ne fabrique pas un jeton d'invitation depuis le navigateur", setDoc(doc(equipe(), 'invitations/x'), { email: 'a@b.test' }));
await refuse('Un visiteur ne lit pas les jetons', getDocs(collection(anonyme(), 'invitations')));

console.log('\n== La plateforme de tests : le vivier');
/* Le nom, l'âge et la fonction d'un testeur ne regardent que l'équipe.
   Un testeur lit sa propre fiche, jamais celle d'un autre : c'est la
   première barrière du cloisonnement. */
await doit("L'équipe lit le vivier", getDocs(collection(equipe(), 'testeurs')));
await doit('Karim lit sa propre fiche', getDoc(doc(karim(), 'testeurs', KARIM)));
await refuse('Karim ne lit pas la fiche de Sonia', getDoc(doc(karim(), 'testeurs', SONIA)));
await refuse('Karim ne lit pas le vivier entier', getDocs(collection(karim(), 'testeurs')));
await refuse('Camille ne lit pas le vivier', getDocs(collection(camille(), 'testeurs')));
await refuse("Karim ne se fabrique pas une fiche", setDoc(doc(karim(), 'testeurs', KARIM), { prenom: 'Karim', projets: ['atelier', 'boutique'] }));
await refuse("L'équipe n'inscrit pas un testeur depuis le navigateur", setDoc(doc(equipe(), 'testeurs', MARC), { prenom: 'Marc', projets: ['atelier'] }));

console.log('\n== La plateforme de tests : le profil sans le nom');
/* Le client doit savoir QUI a donné un avis sans savoir QUI c'est : il lit
   le profil sans nom des testeurs de SON projet, recopié sous le projet
   (projets/<p>/profilsTesteurs/<uid>). L'ancien profil commun
   (testeurs/<uid>/public/profil), lisible par tout compte connecté avec la
   liste des projets de tous les clients, ne se lit plus que par l'équipe. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), `testeurs/${KARIM}/public/profil`), { sexe: 'homme', age: '25-34', fonction: 'QA freelance', mobile: 'ios', projets: ['atelier', 'boutique'] });
  await setDoc(doc(ctx.firestore(), `projets/atelier/profilsTesteurs/${KARIM}`), { sexe: 'homme', age: '25-34', fonction: 'QA freelance', mobile: 'ios' });
});
await doit('Camille lit le profil sans nom d un testeur de SON projet', getDoc(doc(camille(), `projets/atelier/profilsTesteurs/${KARIM}`)));
await doit('et la liste des testeurs de son projet', getDocs(collection(camille(), 'projets/atelier/profilsTesteurs')));
await refuse('Léa ne lit pas les testeurs du projet de Camille', getDocs(collection(lea(), 'projets/atelier/profilsTesteurs')));
await refuse('mais pas sa fiche, qui porte son nom', getDoc(doc(camille(), 'testeurs', KARIM)));
await refuse('Camille ne lit plus l ancien profil commun (il listait les projets de tous les clients)', getDoc(doc(camille(), `testeurs/${KARIM}/public/profil`)));
await refuse('Karim ne lit pas les profils des testeurs', getDocs(collection(karim(), 'projets/atelier/profilsTesteurs')));
await refuse('Personne n écrit un profil depuis le navigateur', setDoc(doc(equipe(), `projets/atelier/profilsTesteurs/${KARIM}`), { age: '55-64' }));
await refuse('Un visiteur ne lit aucun profil', getDoc(doc(anonyme(), `projets/atelier/profilsTesteurs/${KARIM}`)));

console.log('\n== La plateforme de tests : la bibliothèque');
/* Le client lit les scénarios pour savoir ce qui sera vérifié, le testeur
   pour lire l'énoncé de ce qu'il doit dérouler. Ni l'un ni l'autre n'écrit. */
await doit('Camille lit les scénarios de son projet', getDocs(collection(camille(), 'projets/atelier/scenarios')));
await doit('Karim lit un scénario', getDoc(doc(karim(), 'projets/atelier/scenarios/DI-15')));
await doit("L'équipe verse un scénario", setDoc(doc(equipe(), 'projets/atelier/scenarios/TA-01'), { ref: 'TA-01', bloc: 'taches', titre: 'Tâche minimale', niveau: 'reparti', actif: true }));
await refuse('Karim ne réécrit pas un scénario', updateDoc(doc(karim(), 'projets/atelier/scenarios/DI-15'), { attendu: 'ce que je veux' }));
await refuse('Camille ne réécrit pas un scénario', updateDoc(doc(camille(), 'projets/atelier/scenarios/DI-15'), { niveau: 'reparti' }));
await refuse('Léa ne lit pas les scénarios d un autre projet', getDocs(collection(lea(), 'projets/atelier/scenarios')));

console.log('\n== La plateforme de tests : les campagnes');
/* Un testeur ne lit que les campagnes où il figure : il ne doit pas
   déduire du nombre de campagnes ce que l'agence fait ailleurs. */
await doit('Camille suit la campagne de son projet', getDoc(doc(camille(), 'projets/atelier/campagnes/c1')));
await doit('Karim lit la campagne où il figure', getDoc(doc(karim(), 'projets/atelier/campagnes/c1')));
await refuse("Marc ne lit pas une campagne où il n'est pas", getDoc(doc(marc(), 'projets/atelier/campagnes/c1')));
await refuse('Karim ne s ajoute pas à une campagne', updateDoc(doc(karim(), 'projets/atelier/campagnes/c1'), { testeurs: [KARIM, SONIA, MARC] }));
await refuse('Camille ne crée pas une campagne', setDoc(doc(camille(), 'projets/atelier/campagnes/c2'), { titre: 'La mienne', statut: 'en-cours', testeurs: [] }));
await doit("L'équipe crée une campagne", setDoc(doc(equipe(), 'projets/atelier/campagnes/c2'), { titre: 'Passe 1.3.0', statut: 'preparation', testeurs: [KARIM] }));

console.log('\n== La plateforme de tests : le cloisonnement des passages');
/* Le cœur du dispositif. Un testeur qui verrait les réponses des autres
   cocherait comme eux, et la campagne ne vaudrait plus rien. L'identifiant
   du document porte l'uid, ce qui rend le refus vérifiable sans lire le
   document : la demande est écartée avant d'être servie. */
await doit('Karim relit son propre passage', getDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`)));
await refuse('Karim ne lit pas le passage de Sonia', getDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`)));
await refuse('Karim ne liste pas tous les passages', getDocs(collection(karim(), 'projets/atelier/campagnes/c1/passages')));
await doit('Karim liste les siens', getDocs(query(collection(karim(), 'projets/atelier/campagnes/c1/passages'), where('testeur', '==', KARIM))));
await refuse('Karim ne liste pas ceux de Sonia par requête', getDocs(query(collection(karim(), 'projets/atelier/campagnes/c1/passages'), where('testeur', '==', SONIA))));
await doit("L'équipe lit tous les passages", getDocs(collection(equipe(), 'projets/atelier/campagnes/c1/passages')));
await doit('Camille lit les passages de son projet', getDocs(collection(camille(), 'projets/atelier/campagnes/c1/passages')));
await refuse('Léa ne lit pas les passages d un autre projet', getDocs(collection(lea(), 'projets/atelier/campagnes/c1/passages')));

console.log('\n== La plateforme de tests : écrire un passage');
await doit('Karim consigne un résultat', setDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${KARIM}__ID-01`), { scenario: 'ID-01', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: { modele: 'iPhone 13' }, le: serverTimestamp() }));
await refuse("Karim ne consigne pas au nom de Sonia", setDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${SONIA}__ID-01`), { scenario: 'ID-01', testeur: SONIA, plateforme: 'android', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse("Karim ne déguise pas son identifiant", setDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${KARIM}__ID-01`), { scenario: 'ID-01', testeur: SONIA, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse("Un identifiant qui ne colle pas au scénario est refusé", setDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${KARIM}__ID-01`), { scenario: 'DI-15', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse("Marc ne consigne rien sur une campagne où il n'est pas", setDoc(doc(marc(), `projets/atelier/campagnes/c1/passages/${MARC}__ID-01`), { scenario: 'ID-01', testeur: MARC, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
/* Un échec sans preuve n'est pas un rapport, c'est une opinion. */
await refuse('Un échec sans preuve est refusé', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/passages/${SONIA}__ID-01`), { scenario: 'ID-01', testeur: SONIA, plateforme: 'android', resultat: 'ko', commentaire: 'ça marche pas', preuves: [], contexte: {}, le: serverTimestamp() }));
await doit('Un échec avec preuve passe', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/passages/${SONIA}__ID-01`), { scenario: 'ID-01', testeur: SONIA, plateforme: 'android', resultat: 'ko', commentaire: 'rien ne se passe', preuves: ['p/2.mp4'], contexte: {}, le: serverTimestamp() }));
await refuse('Un résultat inventé est refusé', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`), { scenario: 'DI-15', testeur: SONIA, plateforme: 'android', resultat: 'peut-etre', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse('Une plateforme inventée est refusée', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`), { scenario: 'DI-15', testeur: SONIA, plateforme: 'windows-phone', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse('Un champ en trop est refusé', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`), { scenario: 'DI-15', testeur: SONIA, plateforme: 'android', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp(), note: 'payez-moi plus' }));
await refuse('Camille ne consigne pas de résultat', setDoc(doc(camille(), `projets/atelier/campagnes/c1/passages/${CAMILLE}__DI-15`), { scenario: 'DI-15', testeur: CAMILLE, plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
/* Un passage ne s'efface pas : c'est la mémoire de la campagne. */
await refuse('Karim n efface pas son passage', deleteDoc(doc(karim(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`)));
await refuse("L'équipe n'efface pas un passage", deleteDoc(doc(equipe(), `projets/atelier/campagnes/c1/passages/${SONIA}__DI-15`)));

console.log('\n== La plateforme de tests : la campagne close est figée');
/* Une campagne close est un document d'archive. Plus personne n'y écrit,
   pas même celui qui l'a remplie : sans cela on perd l'historique, et on
   retombe dans le défaut du tableur. */
await doit('Karim relit une campagne close', getDoc(doc(karim(), 'projets/atelier/campagnes/close')));
await refuse('Karim ne corrige pas un passage d une campagne close', updateDoc(doc(karim(), `projets/atelier/campagnes/close/passages/${KARIM}__ID-01`), { resultat: 'ko', preuves: ['p/3.mp4'] }));
await refuse('Karim n ajoute pas un passage à une campagne close', setDoc(doc(karim(), `projets/atelier/campagnes/close/passages/${KARIM}__DI-15`), { scenario: 'DI-15', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse('Karim ne dépose pas son appréciation sur une campagne close', setDoc(doc(karim(), `projets/atelier/campagnes/close/appreciations/${KARIM}`), { beaute: 5 }));

console.log('\n== La plateforme de tests : l appréciation');
/* Ce que le testeur pense de l'application. Une par testeur et par
   campagne, et l'identifiant est son propre uid. */
await doit('Sonia dépose son appréciation', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { beaute: 3, prix: 7, utile: 'oui' }));
await doit('Karim relit la sienne', getDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`)));
await refuse("Karim ne lit pas l'appréciation de Sonia", getDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`)));
await refuse("Karim n'écrit pas au nom de Sonia", setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { beaute: 1 }));
await doit("Camille lit les appréciations de son projet", getDocs(collection(camille(), 'projets/atelier/campagnes/c1/appreciations')));
await doit("L'équipe lit les appréciations", getDocs(collection(equipe(), 'projets/atelier/campagnes/c1/appreciations')));

console.log('\n== La plateforme de tests : les anomalies');
/* Le testeur rapporte, il ne juge pas : le tri des échecs en anomalies
   est un geste d'équipe, et le client en voit le résultat. */
await doit('Camille lit les anomalies', getDocs(collection(camille(), 'projets/atelier/anomalies')));
await doit("L'équipe classe une anomalie", updateDoc(doc(equipe(), 'projets/atelier/anomalies/a1'), { statut: 'corrigee' }));
await refuse('Karim ne lit pas les anomalies', getDocs(collection(karim(), 'projets/atelier/anomalies')));
await refuse('Camille ne classe pas une anomalie', updateDoc(doc(camille(), 'projets/atelier/anomalies/a1'), { statut: 'sans-suite' }));
await refuse('Léa ne lit pas les anomalies d un autre projet', getDocs(collection(lea(), 'projets/atelier/anomalies')));

console.log('\n== La plateforme de tests : ce que la page testeur demande');
/* Les requêtes exactes que fait l'espace testeur. Une règle peut être
   juste sur un document et refuser la requête qui le cherche : Firestore
   évalue la requête AVANT de servir, et une liste que rien ne restreint
   est refusée en bloc, pas filtrée. */
await doit('Karim cherche les campagnes où il figure', getDocs(query(collection(karim(), 'projets/atelier/campagnes'), where('testeurs', 'array-contains', KARIM))));
await refuse('Karim ne liste pas toutes les campagnes du projet', getDocs(collection(karim(), 'projets/atelier/campagnes')));
await refuse("Karim ne cherche pas les campagnes d'un autre", getDocs(query(collection(karim(), 'projets/atelier/campagnes'), where('testeurs', 'array-contains', SONIA))));
await doit('Karim lit la bibliothèque de son projet', getDocs(collection(karim(), 'projets/atelier/scenarios')));
await doit('Karim relit ses propres passages', getDocs(query(collection(karim(), 'projets/atelier/campagnes/c1/passages'), where('testeur', '==', KARIM))));

console.log('\n== La plateforme de tests : les angles morts');
/* Trois trous trouvés en auditant, et qui avaient tous la même cause : la
   garde existait, mais rien ne l'éprouvait sous le bon angle.

   1. Un titre de scénario nomme un client, une fonctionnalité, un
      prestataire. « estTesteur() » seul ouvrait la bibliothèque de tout le
      hub à quiconque porte la revendication. */
await doit('Karim lit les scénarios du projet où il est inscrit', getDocs(collection(karim(), 'projets/atelier/scenarios')));
await refuse('Karim ne lit pas les scénarios d un projet où il n est pas', getDocs(collection(karim(), 'projets/boutique/scenarios')));
await refuse('Marc non plus, même par adresse directe', getDoc(doc(marc(), 'projets/boutique/scenarios/DI-15')));

/* 2. Firestore fait l'union des règles : la plus permissive gagne. Un
      « allow update: if estEquipe() » nu dans le même bloc annulait les
      quarante lignes de garde-fous posées au-dessus, gel de la campagne
      close compris. C'est le pire cas, parce que le fichier a l'air juste
      à la lecture. */
await doit("L'équipe rattache un passage à une anomalie", updateDoc(doc(equipe(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`), { anomalie: 'a1' }));
await refuse("L'équipe ne réécrit pas le résultat d'un passage", updateDoc(doc(equipe(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`), { resultat: 'ok' }));
await refuse("L'équipe ne déplace pas un passage vers un autre testeur", updateDoc(doc(equipe(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`), { testeur: SONIA }));
await refuse("L'équipe n'ajoute pas un champ à un passage", updateDoc(doc(equipe(), `projets/atelier/campagnes/c1/passages/${KARIM}__DI-15`), { bidon: 'x' }));
await doit("Le tri se fait aussi après la clôture", updateDoc(doc(equipe(), `projets/atelier/campagnes/close/passages/${KARIM}__ID-01`), { anomalie: 'a1' }));
await refuse("Mais rien d'autre sur une campagne close", updateDoc(doc(equipe(), `projets/atelier/campagnes/close/passages/${KARIM}__ID-01`), { resultat: 'ko', preuves: ['p/x.mp4'] }));

/* 3. L'appréciation n'avait ni borne ni protection contre l'effacement,
      alors que le passage voisin refuse les deux. Une appréciation est une
      donnée de campagne au même titre : se raviser après coup la falsifie. */
await doit('Sonia dépose une appréciation bornée', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { beaute: 3, prix: 7, libre: 'Rien à signaler' }));
await refuse('Un texte libre sans fin est refusé', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { beaute: 3, libre: 'x'.repeat(9000) }));
await refuse('Une appréciation ne s efface pas', deleteDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`)));
await refuse("L'équipe non plus n'efface pas une appréciation", deleteDoc(doc(equipe(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`)));

console.log('\n== La plateforme de tests : le questionnaire tient dans les bornes');
/* Le questionnaire porte 35 questions en 7 familles, plus l'auteur et la
   date : 37 champs. Le plafond est à 60, et cette marge doit rester
   vérifiée, pas supposée. Une famille ajoutée sans y penser ferait
   refuser l'enregistrement du testeur au dernier moment, après qu'il a
   tout rempli. */
const avisComplet = { testeur: KARIM, maj: new Date() };
for (let f = 0; f < 7; f += 1) for (let q = 0; q < 5; q += 1) avisComplet[`f${f}.q${q}`] = q % 2 ? 'texte de réponse' : 4;
await doit(`Karim dépose un questionnaire de ${Object.keys(avisComplet).length} champs`, setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), avisComplet));

const trop = { testeur: KARIM };
for (let i = 0; i < 70; i += 1) trop[`q${i}`] = i;
await refuse('Un questionnaire démesuré est refusé', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), trop));

/* Les deux moments écrivent dans le même document : l'après ne doit pas
   effacer l'avant, et la règle doit accepter la fusion. */
await doit('La première impression se dépose seule', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { 'impression.compris': 4, testeur: SONIA }, { merge: true }));
await doit('Le reste vient s y ajouter', setDoc(doc(sonia(), `projets/atelier/campagnes/c1/appreciations/${SONIA}`), { 'esthetique.belle': 5, testeur: SONIA }, { merge: true }));

console.log('\n== La plateforme de tests : les parcours automatisés');
/* Le client les lit : savoir que quarante-huit parcours sont rejoués à
   chaque version fait partie de ce qu'il paie. Le testeur, lui, n'a rien
   à y faire : lui montrer ce que la machine couvre l'inciterait à
   survoler les mêmes chemins, qui sont justement les plus critiques. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'projets/atelier/parcours/P-01'), { ref: 'P-01', titre: 'Créer une tâche', outil: 'maestro', etat: 'vert', actif: true });
});
await doit("L'équipe lit les parcours", getDocs(collection(equipe(), 'projets/atelier/parcours')));
await doit('Camille les lit aussi', getDocs(collection(camille(), 'projets/atelier/parcours')));
await refuse('Karim ne lit pas les parcours', getDocs(collection(karim(), 'projets/atelier/parcours')));
await refuse('Léa ne lit pas ceux d un autre projet', getDocs(collection(lea(), 'projets/atelier/parcours')));
await refuse('Camille n écrit pas un parcours', setDoc(doc(camille(), 'projets/atelier/parcours/P-02'), { ref: 'P-02', titre: 'Inventé' }));
await doit("L'équipe en écrit un", setDoc(doc(equipe(), 'projets/atelier/parcours/P-02'), { ref: 'P-02', titre: 'Cocher une tâche', outil: 'playwright', etat: 'a-ecrire', actif: true }));
await doit("L'équipe les lit en groupe", getDocs(collectionGroup(equipe(), 'parcours')));
await refuse('Camille ne les lit pas en groupe', getDocs(collectionGroup(camille(), 'parcours')));

console.log('\n== La plateforme de tests : les familles de règles');
/* Mêmes droits que les parcours, et pour la même raison : le client paie
   une base de tests, il a le droit d'en voir la profondeur. Le testeur
   n'y a rien à faire, et un projet voisin encore moins. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'projets/atelier/regles/RG-01'), { ref: 'RG-01', titre: 'Recurrences', famille: 'recurrences', cas: 127, etat: 'vert', actif: true });
});
await doit("L'équipe lit les règles", getDocs(collection(equipe(), 'projets/atelier/regles')));
await doit('Camille les lit aussi', getDocs(collection(camille(), 'projets/atelier/regles')));
await refuse('Karim ne lit pas les règles', getDocs(collection(karim(), 'projets/atelier/regles')));
await refuse('Léa ne lit pas celles d un autre projet', getDocs(collection(lea(), 'projets/atelier/regles')));
await refuse('Camille n écrit pas une règle', setDoc(doc(camille(), 'projets/atelier/regles/RG-02'), { ref: 'RG-02', titre: 'Inventee' }));
await refuse('Camille ne supprime pas une règle', deleteDoc(doc(camille(), 'projets/atelier/regles/RG-01')));
await doit("L'équipe en écrit une", setDoc(doc(equipe(), 'projets/atelier/regles/RG-02'), { ref: 'RG-02', titre: 'Dates', famille: 'dates', cas: 96, etat: 'a-ecrire', actif: true }));
await doit("L'équipe les lit en groupe", getDocs(collectionGroup(equipe(), 'regles')));
await refuse('Camille ne les lit pas en groupe', getDocs(collectionGroup(camille(), 'regles')));
await refuse('Karim ne les lit pas en groupe', getDocs(collectionGroup(karim(), 'regles')));

console.log('\n== Les profils, lus en groupe : l équipe seule');
/* Lus en groupe, les profils de TOUS les projets : c'est une vue d'équipe.
   L'ancien comportement (tout connecté lisait le groupe « public ») est la
   fuite fermée par la Release Gate 1 : un client y lisait les testeurs et
   les identifiants de projets des autres clients. */
await doit("L'équipe lit les profils en groupe", getDocs(collectionGroup(equipe(), 'profilsTesteurs')));
await refuse('Camille ne lit pas les profils en groupe', getDocs(collectionGroup(camille(), 'profilsTesteurs')));
await refuse('ni l ancien groupe « public »', getDocs(collectionGroup(camille(), 'public')));
await refuse('Karim non plus', getDocs(collectionGroup(karim(), 'public')));
await refuse('Un anonyme ne les lit pas', getDocs(collectionGroup(env.unauthenticatedContext().firestore(), 'profilsTesteurs')));

console.log('\n== La plateforme de tests : les lectures en groupe');
/* La console regarde tous les projets d'un coup. C'est un privilège
   d'équipe : ouvert plus largement, il donnerait à un client la liste des
   campagnes de tous les autres, ce qui est exactement ce qu'on refuse
   partout ailleurs dans ce fichier. */
await doit("L'équipe lit toutes les campagnes en groupe", getDocs(collectionGroup(equipe(), 'campagnes')));
await doit("L'équipe lit toutes les anomalies en groupe", getDocs(collectionGroup(equipe(), 'anomalies')));
await doit("L'équipe lit tous les scénarios en groupe", getDocs(collectionGroup(equipe(), 'scenarios')));
await refuse('Camille ne lit pas les campagnes de tous les projets', getDocs(collectionGroup(camille(), 'campagnes')));
await refuse('Camille ne lit pas les anomalies de tous les projets', getDocs(collectionGroup(camille(), 'anomalies')));
await refuse('Camille ne lit pas les scénarios de tous les projets', getDocs(collectionGroup(camille(), 'scenarios')));
await refuse('Karim ne lit pas les campagnes en groupe', getDocs(collectionGroup(karim(), 'campagnes')));
await refuse('Karim ne lit pas les scénarios en groupe', getDocs(collectionGroup(karim(), 'scenarios')));
await refuse('Un visiteur ne lit rien en groupe', getDocs(collectionGroup(anonyme(), 'campagnes')));

console.log('\n== La plateforme de tests : le testeur reste dehors');
/* Un testeur n'est pas membre du projet. Il n'a rien à faire dans les
   demandes, les factures, les messages ou les fichiers. */
await refuse('Karim ne lit pas le projet', getDoc(doc(karim(), 'projets/atelier')));
await refuse('Karim ne lit pas les demandes', getDocs(query(collection(karim(), 'tickets'), where('projet', '==', 'atelier'))));
await refuse('Karim ne lit pas les devis et factures', getDocs(query(collection(karim(), 'documents'), where('projet', '==', 'atelier'))));
await refuse('Karim ne lit pas les messages du projet', getDocs(collection(karim(), 'projets/atelier/messages')));
await refuse('Karim ne lit pas les fichiers', getDocs(query(collection(karim(), 'fichiers'), where('projet', '==', 'atelier'))));
await refuse('Karim ne lit pas les tâches', getDocs(query(collection(karim(), 'taches'), where('projet', '==', 'atelier'))));
await refuse('Karim ne lit pas les étapes du projet', getDocs(collection(karim(), 'projets/atelier/jalons')));
await refuse('Karim ne liste pas l équipe', getDocs(collection(karim(), 'equipe')));

console.log('\n== La maintenance continue : le client demande, l équipe configure');
/* Le contrat n'existe pas encore. Camille le fait naître avec sa seule
   demande ; toute modalité glissée dedans est refusée. */
const demande = { par: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test' }, message: 'Un suivi chaque mois, avec les mises à jour iOS.', rythme: 'mensuelle', le: serverTimestamp() };
await refuse('Camille ne pose pas un contrat avec un montant', setDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'demande', demande, montant: 1, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('Camille ne pose pas un contrat déjà « en cours »', setDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'actif', demande, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('Camille ne signe pas la demande d un autre', setDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'demande', demande: { ...demande, par: { uid: LEA, nom: 'Léa', email: 'x' } }, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('Léa ne demande rien sur le projet de Camille', setDoc(doc(lea(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'demande', demande: { ...demande, par: { uid: LEA, nom: 'Léa', email: 'x' } }, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('Karim ne demande rien non plus', setDoc(doc(karim(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'demande', demande: { ...demande, par: { uid: KARIM } }, cree: serverTimestamp(), maj: serverTimestamp() }));
await doit('Camille demande un forfait', setDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut: 'demande', demande, cree: serverTimestamp(), maj: serverTimestamp() }));
await doit('Camille lit son contrat', getDoc(doc(camille(), 'projets/atelier/maintenance/contrat')));
await doit('Camille corrige sa demande', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: { ...demande, message: 'Plutôt chaque trimestre.' }, maj: serverTimestamp() }));
await refuse('Camille ne passe pas son forfait « en cours »', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'actif', maj: serverTimestamp() }));
await refuse('Camille ne se pose pas des jours', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { jours: 10, maj: serverTimestamp() }));
await refuse('Léa ne lit pas le contrat de Camille', getDoc(doc(lea(), 'projets/atelier/maintenance/contrat')));
await refuse('Karim ne lit pas le contrat', getDoc(doc(karim(), 'projets/atelier/maintenance/contrat')));
await doit("L'équipe configure le forfait", updateDoc(doc(equipe(), 'projets/atelier/maintenance/contrat'), { statut: 'proposition', formule: 'Sérénité', montant: 900, jours: 2, reconduction: 'mensuelle', maj: serverTimestamp() }));
await refuse('Une fois proposé, Camille ne le remet plus en « demandé »', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande, maj: serverTimestamp() }));
await refuse('Camille ne supprime pas le contrat', deleteDoc(doc(camille(), 'projets/atelier/maintenance/contrat')));
await doit("L'équipe ouvre une séquence", setDoc(doc(equipe(), 'projets/atelier/maintenance/seq-1'), { genre: 'sequence', titre: 'Octobre', statut: 'en-cours', jours: 2 }));
await doit("L'équipe consigne une journée", setDoc(doc(equipe(), 'projets/atelier/maintenance/j-1'), { genre: 'journee', sequence: 'seq-1', duree: 0.5, statut: 'faite', objet: 'Mise à jour iOS 27' }));
await doit('Camille lit les séquences et les journées', getDocs(collection(camille(), 'projets/atelier/maintenance')));
await refuse('Camille n ouvre pas une séquence', setDoc(doc(camille(), 'projets/atelier/maintenance/seq-2'), { genre: 'sequence', titre: 'Novembre', statut: 'a-venir' }));
await refuse('Camille ne consigne pas une journée', addDoc(collection(camille(), 'projets/atelier/maintenance'), { genre: 'journee', sequence: 'seq-1', duree: 1, statut: 'faite', objet: 'x' }));
await refuse('Camille ne coche pas une journée', updateDoc(doc(camille(), 'projets/atelier/maintenance/j-1'), { statut: 'prevue' }));
const evolution = { genre: 'evolution', titre: 'Exporter mes tâches en tableur', description: 'Pour ma comptabilité.', statut: 'proposee', origine: 'client', par: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test' }, cree: serverTimestamp(), maj: serverTimestamp() };
await doit('Camille propose une évolution', addDoc(collection(camille(), 'projets/atelier/maintenance'), evolution));
await refuse('Camille ne la pose pas déjà acceptée', addDoc(collection(camille(), 'projets/atelier/maintenance'), { ...evolution, statut: 'acceptee' }));
await refuse('Camille ne se fait pas passer pour l équipe', addDoc(collection(camille(), 'projets/atelier/maintenance'), { ...evolution, origine: 'equipe' }));
await refuse('Camille ne lui met pas une estimation', addDoc(collection(camille(), 'projets/atelier/maintenance'), { ...evolution, estimation: 3 }));
await refuse('Camille ne propose pas sans titre', addDoc(collection(camille(), 'projets/atelier/maintenance'), { ...evolution, titre: '' }));
await refuse('Léa ne propose rien chez Camille', addDoc(collection(lea(), 'projets/atelier/maintenance'), { ...evolution, par: { uid: LEA, nom: 'Léa', email: 'x' } }));
await doit("L'équipe tranche une évolution", setDoc(doc(equipe(), 'projets/atelier/maintenance/ev-1'), { ...evolution, origine: 'equipe', statut: 'acceptee', estimation: 1 }));
await refuse('Camille ne tranche pas', updateDoc(doc(camille(), 'projets/atelier/maintenance/ev-1'), { statut: 'livree' }));
await doit("L'équipe lit la maintenance en groupe", getDocs(collectionGroup(equipe(), 'maintenance')));
await refuse('Camille ne la lit pas en groupe', getDocs(collectionGroup(camille(), 'maintenance')));
await refuse('Karim ne la lit pas en groupe', getDocs(collectionGroup(karim(), 'maintenance')));
await doit("L'équipe retire un élément", deleteDoc(doc(equipe(), 'projets/atelier/maintenance/j-1')));


console.log('\n== Le tableau des tests : présence, exécutions, robots');
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projets/atelier/executions/ci-1'), { outil: 'maestro', branche: 'main', commit: 'abc', statut: 'finie' });
  await setDoc(doc(b, 'projets/atelier/executions/ci-1/resultats/R-01'), { resultat: 'rouge', message: 'Trace interne' });
  await setDoc(doc(b, 'robots/empreinte-1'), { projet: 'atelier', nom: 'Maestro', fin: 'abcd' });
});
const presence = (extra = {}) => ({ campagne: 'c1', projet: 'atelier', plateforme: 'ios', scenario: 'DI-15', vue: 'grille', session: 's1', debut: serverTimestamp(), vu: serverTimestamp(), enLigne: true, ...extra });
await doit('Karim signale sa présence, dates du serveur', setDoc(doc(karim(), `presences/${KARIM}`), presence()));
await doit('Karim la rafraîchit', updateDoc(doc(karim(), `presences/${KARIM}`), { vu: serverTimestamp(), scenario: 'DI-16', enLigne: true }));
await refuse('Karim ne signale pas la présence de Sonia', setDoc(doc(karim(), `presences/${SONIA}`), presence()));
await refuse('Karim n antidate pas le début de sa présence', setDoc(doc(karim(), `presences/${KARIM}`), presence({ debut: new Date(Date.now() - 3 * 3600000) })));
await refuse('Karim ne recule pas son dernier signe', updateDoc(doc(karim(), `presences/${KARIM}`), { vu: new Date(Date.now() + 3600000) }));
await refuse('Karim ne glisse pas de champ en plus', setDoc(doc(karim(), `presences/${KARIM}`), presence({ note: 'x' })));
await refuse('Karim ne pose pas un scénario sans borne', updateDoc(doc(karim(), `presences/${KARIM}`), { vu: serverTimestamp(), scenario: 'x'.repeat(200) }));
await refuse('Camille, cliente, ne se déclare pas présente', setDoc(doc(camille(), `presences/${CAMILLE}`), presence()));
await doit('Karim ouvre une session', setDoc(doc(karim(), `presences/${KARIM}/sessions/s1`), { debut: serverTimestamp(), vu: serverTimestamp(), campagne: 'c1', projet: 'atelier', plateforme: 'ios', agent: 'Safari' }));
await doit('Karim prolonge sa session', updateDoc(doc(karim(), `presences/${KARIM}/sessions/s1`), { vu: serverTimestamp() }));
await refuse('Karim n allonge pas une session en reculant son début', updateDoc(doc(karim(), `presences/${KARIM}/sessions/s1`), { debut: new Date(Date.now() - 5 * 3600000), vu: serverTimestamp() }));
await refuse('Karim n ouvre pas une session antidatée', setDoc(doc(karim(), `presences/${KARIM}/sessions/s2`), { debut: new Date(Date.now() - 3600000), vu: serverTimestamp(), campagne: 'c1', projet: 'atelier', plateforme: 'ios', agent: '' }));
await refuse('Karim ne supprime pas une session', deleteDoc(doc(karim(), `presences/${KARIM}/sessions/s1`)));
await doit("L'équipe lit qui est là", getDocs(collection(equipe(), 'presences')));
await doit("L'équipe lit les sessions d un testeur", getDocs(collection(equipe(), `presences/${KARIM}/sessions`)));
await refuse('Camille ne lit pas qui est connecté', getDocs(collection(camille(), 'presences')));
await refuse('Camille ne lit pas la présence de Karim', getDoc(doc(camille(), `presences/${KARIM}`)));
await refuse('Camille ne lit pas les sessions de Karim', getDocs(collection(camille(), `presences/${KARIM}/sessions`)));
await refuse('Sonia ne lit pas la présence de Karim', getDoc(doc(sonia(), `presences/${KARIM}`)));
await refuse('Karim ne relit pas même la sienne', getDoc(doc(karim(), `presences/${KARIM}`)));
await doit("L'équipe lit les exécutions des robots", getDocs(collection(equipe(), 'projets/atelier/executions')));
await doit("L'équipe lit le message d erreur d un parcours", getDoc(doc(equipe(), 'projets/atelier/executions/ci-1/resultats/R-01')));
await refuse('Camille ne lit pas la branche ni le commit', getDocs(collection(camille(), 'projets/atelier/executions')));
await refuse('Camille ne lit pas les messages d erreur', getDoc(doc(camille(), 'projets/atelier/executions/ci-1/resultats/R-01')));
await refuse('Karim ne lit pas les exécutions', getDocs(collection(karim(), 'projets/atelier/executions')));
await refuse("Même l'équipe n'écrit pas une exécution à la main", setDoc(doc(equipe(), 'projets/atelier/executions/ci-2'), { statut: 'finie' }));
await doit("L'équipe voit les jetons de robot (leur empreinte)", getDocs(collection(equipe(), 'robots')));
await refuse('Camille ne voit pas les jetons', getDocs(collection(camille(), 'robots')));
await refuse("Personne ne pose un jeton depuis le navigateur", setDoc(doc(equipe(), 'robots/x'), { projet: 'atelier' }));

console.log('\n== Les projets à faire : le drapeau, et la note hors du projet');
await doit("L'équipe range un projet dans les projets à faire", updateDoc(doc(equipe(), 'projets/atelier'), { aFaire: true }));
await doit("L'équipe le remet dans les projets actuels", updateDoc(doc(equipe(), 'projets/atelier'), { aFaire: false }));
await refuse("Le drapeau n'est qu'un oui ou un non", updateDoc(doc(equipe(), 'projets/atelier'), { aFaire: 'oui' }));
await refuse('Camille ne range pas son projet dans les projets à faire', updateDoc(doc(camille(), 'projets/atelier'), { aFaire: true }));
await doit("L'équipe note une idée", setDoc(doc(equipe(), 'idees/atelier'), { texte: '## Vision\nUne fortune virtuelle.', par: AGENT, maj: serverTimestamp() }));
await doit("L'équipe la relit", getDoc(doc(equipe(), 'idees/atelier')));
await doit("L'équipe liste toutes ses idées", getDocs(collection(equipe(), 'idees')));
await doit("Une note longue de 60 000 signes passe", setDoc(doc(equipe(), 'idees/atelier'), { texte: 'x'.repeat(60000), par: AGENT, maj: serverTimestamp() }));
await refuse('Une note sans fin ne passe pas', setDoc(doc(equipe(), 'idees/atelier'), { texte: 'x'.repeat(60001), par: AGENT, maj: serverTimestamp() }));
await refuse('Une note ne porte pas de champ en plus', setDoc(doc(equipe(), 'idees/atelier'), { texte: 'x', par: AGENT, maj: serverTimestamp(), client: 'camille' }));
await refuse('Camille ne lit pas la note, même sur son propre projet', getDoc(doc(camille(), 'idees/atelier')));
await refuse('Camille ne liste pas les idées', getDocs(collection(camille(), 'idees')));
await refuse("Camille n'écrit pas de note", setDoc(doc(camille(), 'idees/atelier'), { texte: 'x', par: CAMILLE, maj: serverTimestamp() }));
await refuse('Karim, testeur, ne lit pas les idées', getDocs(collection(karim(), 'idees')));
await refuse('Un visiteur ne lit pas les idées', getDoc(doc(anonyme(), 'idees/atelier')));

console.log('\n== Release Gate 1 : les données internes hors des fiches lues par le client');
/* Firestore sert un document ENTIER. Chacune de ces lectures était permise
   avant la Release Gate 1, parce que la donnée vivait sur une fiche que le
   client lit : notes internes de l'organisation, budget et santé du projet,
   note d'un paiement, devis en brouillon, liste de l'équipe. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projetsInternes/atelier'), { budget: 12000, budgetNote: 'Négocié bas', sante: 'attention' });
  await setDoc(doc(b, 'organisationsInternes/atelier-nord'), { notesInternes: 'Client difficile' });
  await setDoc(doc(b, 'paiementsInternes/p1'), { note: 'Payé en retard, relancé deux fois' });
  await setDoc(doc(b, 'documents/d-brouillon'), { projet: 'atelier', type: 'devis', numero: 'D-BR', montant: 9, statut: 'brouillon' });
  await setDoc(doc(b, `annuaire/${AGENT}`), { nom: 'Alex Durand' });
});
const VISIBLES = ['envoye', 'consulte', 'accepte', 'refuse', 'expire', 'annule', 'envoyee', 'a-payer', 'partielle', 'payee', 'en-retard', 'annulee', 'avoir'];
await refuse('Camille ne lit pas le budget, la note de budget ni la santé', getDoc(doc(camille(), 'projetsInternes/atelier')));
await refuse('Camille ne liste pas les données internes des projets', getDocs(collection(camille(), 'projetsInternes')));
await refuse('Camille ne lit pas les notes internes de son organisation', getDoc(doc(camille(), 'organisationsInternes/atelier-nord')));
await refuse('Camille ne lit pas la note interne d un paiement', getDoc(doc(camille(), 'paiementsInternes/p1')));
await doit("L'équipe lit le budget et la santé", getDoc(doc(equipe(), 'projetsInternes/atelier')));
await doit("L'équipe lit les notes internes", getDoc(doc(equipe(), 'organisationsInternes/atelier-nord')));
await doit("L'équipe lit la note d un paiement", getDoc(doc(equipe(), 'paiementsInternes/p1')));
await doit("L'équipe règle la santé à part", setDoc(doc(equipe(), 'projetsInternes/atelier'), { sante: 'bloque' }, { merge: true }));
await refuse('La santé ne prend qu une valeur connue', setDoc(doc(equipe(), 'projetsInternes/atelier'), { sante: 'excellente' }, { merge: true }));
await refuse('Rien d autre ne se glisse dans les données internes', setDoc(doc(equipe(), 'projetsInternes/atelier'), { client: 'x' }, { merge: true }));
await refuse('Camille n écrit pas les données internes', setDoc(doc(camille(), 'projetsInternes/atelier'), { sante: 'ok' }, { merge: true }));
await refuse('Le navigateur n écrit pas les notes internes (serveur seul)', setDoc(doc(equipe(), 'organisationsInternes/atelier-nord'), { notesInternes: 'x' }));
await refuse("L'équipe ne remet pas le budget sur la fiche projet lue par le client", updateDoc(doc(equipe(), 'projets/atelier'), { budget: 1 }));
await refuse('ni la note de budget', updateDoc(doc(equipe(), 'projets/atelier'), { budgetNote: 'x' }));
await refuse('ni la santé', updateDoc(doc(equipe(), 'projets/atelier'), { sante: 'ok' }));
await refuse('Camille ne lit pas un devis en brouillon', getDoc(doc(camille(), 'documents/d-brouillon')));
await refuse('ni la liste des pièces de son projet sans filtre de statut', getDocs(query(collection(camille(), 'documents'), where('projet', '==', 'atelier'))));
await doit('Camille lit les pièces visibles de son projet', getDocs(query(collection(camille(), 'documents'), where('projet', '==', 'atelier'), where('statut', 'in', VISIBLES))));
await refuse('une liste qui inclurait le brouillon est refusée', getDocs(query(collection(camille(), 'documents'), where('projet', '==', 'atelier'), where('statut', 'in', ['envoye', 'brouillon']))));
await doit("L'équipe lit le brouillon", getDoc(doc(equipe(), 'documents/d-brouillon')));
await refuse('Camille ne liste pas l équipe', getDocs(collection(camille(), 'equipe')));
await refuse('ni la fiche d un membre (adresse, rôle)', getDoc(doc(camille(), `equipe/${AGENT}`)));
await doit('Camille lit sa propre fiche d équipe (elle n existe pas : c est ainsi que la session sait qu elle est cliente)', getDoc(doc(camille(), `equipe/${CAMILLE}`)));
await doit('Camille lit l annuaire (le seul nom)', getDocs(collection(camille(), 'annuaire')));
await refuse('Un visiteur ne lit pas l annuaire', getDocs(collection(anonyme(), 'annuaire')));
await refuse('Personne n écrit l annuaire depuis le navigateur', setDoc(doc(equipe(), `annuaire/${AGENT}`), { nom: 'x' }));
await doit("L'équipe liste l équipe", getDocs(collection(equipe(), 'equipe')));
await doit('Camille lit toujours son organisation (sans les notes)', getDoc(doc(camille(), 'organisations/atelier-nord')));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
