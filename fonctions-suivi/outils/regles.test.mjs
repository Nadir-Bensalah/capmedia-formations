/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles à l'épreuve
   Émulateur Firestore uniquement. Chaque essai est une tentative d'abus
   ou un droit attendu ; la sortie liste ce qui passe et ce qui casse.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/regles.test.mjs"
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, collectionGroup, query, where, serverTimestamp, Timestamp, writeBatch, deleteField } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: PROJET,
  /* Le port de l'émulateur : celui de FIRESTORE_EMULATOR_HOST quand il est
     posé (second banc, émulateur à part), sinon 8080. */
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: Number(String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':')[1]) || 8080 },
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
  /* Depuis la Gate 2, le rôle du client est posé par le serveur à côté des
     membres : Camille et Léa sont responsables de leur projet. */
  await setDoc(doc(b, 'projets/atelier'), { nom: 'Atelier', ref: 'ATELIER', membres: [CAMILLE], roles: { [CAMILLE]: 'responsable' }, organisation: 'atelier-nord', statut: 'en-cours', compteur: 0, ouvert: true });
  await setDoc(doc(b, 'projets/boutique'), { nom: 'Boutique', ref: 'BOUTIQUE', membres: [LEA], roles: { [LEA]: 'responsable' }, organisation: 'boutique', statut: 'cadrage', compteur: 0, ouvert: true });
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
  await setDoc(doc(b, 'documents/d-perime'), { projet: 'atelier', type: 'devis', numero: 'D-2', montant: 100, statut: 'envoye', reponse: null, expiration: Timestamp.fromDate(new Date(Date.now() - 86400000)) });
  await setDoc(doc(b, 'documents/d-valide'), { projet: 'atelier', type: 'devis', numero: 'D-3', montant: 100, statut: 'consulte', reponse: null, expiration: Timestamp.fromDate(new Date(Date.now() + 30 * 86400000)) });
  await setDoc(doc(b, 'tickets/t-livre'), { projet: 'atelier', numero: 'ATELIER-002', titre: 'y', statut: 'a-valider', urgence: 'important', auteur: { uid: CAMILLE }, resolu: null, lu: {} });
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

console.log('\n== La fiche d\'une partie : lue par le client, bornée, écrite par l\'équipe');
const ficheIos = {
  sousTitre: 'Atelier sur l App Store', resume: 'Deux phrases.', etatActuel: 'En validation.', hebergement: 'Firebase, Europe.',
  versionEnLigne: { numero: '1.1.2', date: '2026-09-10', ou: 'App Store' }, versionEnPreparation: { numero: '1.1.3', etat: 'Chez Apple' },
  liens: [{ libelle: 'App Store', url: 'https://apps.apple.com/app/id1' }], chiffres: [{ valeur: '6', libelle: 'langues' }],
  fonctions: ['Réserver'], technologies: [{ nom: 'React Native', role: 'une base de code' }],
  historique: [{ date: '2026-09-10', titre: 'Version 1.1.2', detail: '' }], prochainesEtapes: ['Publier'], pointsAttention: [],
};
await doit("L'équipe pose la fiche d'une partie", updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), ficheIos));
await doit('Camille la lit', getDoc(doc(camille(), 'projets/atelier/composants/ios')));
await refuse("Camille ne l'écrit pas", updateDoc(doc(camille(), 'projets/atelier/composants/ios'), { sousTitre: 'Piraté' }));
await refuse('Léa ne la lit pas', getDoc(doc(lea(), 'projets/atelier/composants/ios')));
await refuse('un sous-titre de 161 caractères est refusé', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { sousTitre: 'x'.repeat(161) }));
await refuse('un résumé de 1 501 caractères aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { resume: 'x'.repeat(1501) }));
await refuse('un état actuel qui n est pas un texte aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { etatActuel: 12 }));
await refuse('trente et une dates d historique aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { historique: Array.from({ length: 31 }, () => ({ date: '2026-01-01', titre: 'x' })) }));
await refuse('vingt et une fonctions aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { fonctions: Array.from({ length: 21 }, () => 'x') }));
await refuse('une version en ligne avec une clé inconnue aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { versionEnLigne: { numero: '1', pirate: 'x' } }));
await refuse('un numéro de version de 31 caractères aussi', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { versionEnPreparation: { numero: 'x'.repeat(31) } }));
await doit('une version effacée (null) passe', updateDoc(doc(equipe(), 'projets/atelier/composants/ios'), { versionEnPreparation: null }));
await refuse('une partie créée trop bavarde est refusée', setDoc(doc(equipe(), 'projets/atelier/composants/neuve'), { nom: 'Neuve', resume: 'x'.repeat(1501) }));
await doit('une partie créée bien formée passe', setDoc(doc(equipe(), 'projets/atelier/composants/neuve'), { nom: 'Neuve', ...ficheIos }));

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
await doit('Camille renvoie une correction qui ne tient pas (« Pas tout à fait »)', updateDoc(doc(camille(), 'tickets/t-livre'), { statut: 'en-cours', maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
await refuse('Camille ne termine pas une demande qui est chez nous', updateDoc(doc(camille(), 'tickets/t-livre'), { statut: 'resolu', resolu: serverTimestamp(), maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
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
await refuse("Camille n'accepte pas un devis dont la validité est passée", updateDoc(doc(camille(), 'documents/d-perime'), { statut: 'accepte', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: '' } }));
await doit('Camille accepte un devis encore valable', updateDoc(doc(camille(), 'documents/d-valide'), { statut: 'accepte', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: '' } }));
await refuse('Camille ne marque pas une facture payée', updateDoc(doc(camille(), 'documents/f1'), { statut: 'payee' }));
await doit('Camille marque une notification lue', updateDoc(doc(camille(), `boites/${CAMILLE}/notifications/n1`), { lu: true }));
await refuse('Camille ne se crée pas une notification', addDoc(collection(camille(), `boites/${CAMILLE}/notifications`), { titre: 'x', lu: false }));
await doit('Camille écrit son profil', setDoc(doc(camille(), `profils/${CAMILLE}`), { nom: 'Camille', notifications: { messages: 'off' } }, { merge: true }));
await refuse("Camille n'écrit pas le profil de Léa", setDoc(doc(camille(), `profils/${LEA}`), { nom: 'x' }));
await doit('Camille consigne ses premiers pas dans son profil', setDoc(doc(camille(), `profils/${CAMILLE}`), { accueil: new Date() }, { merge: true }));
await refuse('mais pas n importe quoi à la place d une date', setDoc(doc(camille(), `profils/${CAMILLE}`), { accueil: 'oui' }, { merge: true }));
/* Le pavé « En attente de vous » replié ou fermé (ménage du 02/10/2026). */
await doit('Camille ferme le pavé de son accueil', setDoc(doc(camille(), `profils/${CAMILLE}`), { pavesAttente: { accueil: 'ferme' } }, { merge: true }));
await doit('et replie celui d un projet', setDoc(doc(camille(), `profils/${CAMILLE}`), { pavesAttente: { projets: { atelier: 'replie' } } }, { merge: true }));
await refuse('mais pas un état inventé', setDoc(doc(camille(), `profils/${CAMILLE}`), { pavesAttente: { accueil: 'cache' } }, { merge: true }));
await refuse('ni une autre clé dans le choix', setDoc(doc(camille(), `profils/${CAMILLE}`), { pavesAttente: { role: 'admin' } }, { merge: true }));
await refuse('ni autre chose qu une carte', setDoc(doc(camille(), `profils/${CAMILLE}`), { pavesAttente: 'ferme' }, { merge: true }));
await refuse("Camille ne range pas le pavé de Léa", setDoc(doc(camille(), `profils/${LEA}`), { pavesAttente: { accueil: 'ferme' } }, { merge: true }));

// Les abonnements push (notifications des messages, espace fermé) : les siens seulement, champs fermés.
const PUSH_ID = 'a'.repeat(40);
const abonnementPush = (d = {}) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/essai-1', cles: { p256dh: 'B'.repeat(87), auth: 'c'.repeat(22) }, appareil: 'Chrome sur Mac', maj: serverTimestamp(), ...d });
await doit('Camille enregistre l abonnement push de son appareil', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush()));
await doit('le réécrit (même appareil, nouvelles clés)', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ cles: { p256dh: 'D'.repeat(87), auth: 'e'.repeat(22) } })));
await doit('et le relit', getDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
await doit('et liste les siens', getDocs(collection(camille(), `profils/${CAMILLE}/pushs`)));
await refuse('Léa ne lit pas les abonnements de Camille', getDoc(doc(lea(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
await refuse('ni ne les liste', getDocs(collection(lea(), `profils/${CAMILLE}/pushs`)));
await refuse('ni n en écrit un chez Camille', setDoc(doc(lea(), `profils/${CAMILLE}/pushs/${'b'.repeat(40)}`), abonnementPush()));
await refuse('ni n efface le sien', deleteDoc(doc(lea(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
await refuse('L administrateur ne lit pas les abonnements d une cliente', getDoc(doc(equipe(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
await refuse('ni ne les liste', getDocs(collection(equipe(), `profils/${CAMILLE}/pushs`)));
await refuse('Un anonyme non plus', getDoc(doc(anonyme(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
await refuse('ni en groupe (aucune lecture de toutes les pushs)', getDocs(collectionGroup(equipe(), 'pushs')));
await refuse('Un champ de plus est refusé', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ uid: LEA })));
await refuse('une adresse d envoi qui n est pas https aussi', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ endpoint: 'http://exemple.test/push' })));
await refuse('des clés incomplètes aussi', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ cles: { p256dh: 'B'.repeat(87) } })));
await refuse('une clé en trop dans les clés aussi', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ cles: { p256dh: 'B'.repeat(87), auth: 'c'.repeat(22), autre: 'x' } })));
await refuse('une date qui n est pas celle du serveur aussi', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`), abonnementPush({ maj: new Date(Date.now() - 86400000) })));
await refuse('un identifiant qui n est pas une empreinte aussi', setDoc(doc(camille(), `profils/${CAMILLE}/pushs/mon-appareil`), abonnementPush()));
await doit('Camille efface son abonnement', deleteDoc(doc(camille(), `profils/${CAMILLE}/pushs/${PUSH_ID}`)));
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
/* Depuis la Gate 2, le prix ne vit plus sur le contrat (montants/maintenance). */
await doit("L'équipe configure le forfait", updateDoc(doc(equipe(), 'projets/atelier/maintenance/contrat'), { statut: 'proposition', formule: 'Sérénité', jours: 2, reconduction: 'mensuelle', maj: serverTimestamp() }));
await refuse("mais n'y écrit pas de prix (réservé à la finance, à part)", updateDoc(doc(equipe(), 'projets/atelier/maintenance/contrat'), { montant: 900, maj: serverTimestamp() }));
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
await doit('Karim relit ses sessions, pour son chronomètre', getDocs(collection(karim(), `presences/${KARIM}/sessions`)));
await refuse('Sonia ne lit pas les sessions de Karim', getDocs(collection(sonia(), `presences/${KARIM}/sessions`)));
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

console.log('\n== La fin de test : terminer, figer, remarquer, expirer');
/* Le testeur dit « j'ai terminé » en posant la date du serveur sur son
   appréciation, une fois. Le serveur pose alors « termines » et « fins »
   sur la campagne ; les règles les relisent : plus un passage après la
   fin, plus rien du tout après la date de fin d'accès. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projets/atelier/campagnes/c-fin'), { titre: 'Passe finie', statut: 'en-cours', testeurs: [KARIM, SONIA], termines: { [KARIM]: new Date() }, fins: { [KARIM]: new Date(Date.now() + 5 * 86400000) } });
  await setDoc(doc(b, 'projets/atelier/campagnes/c-expiree'), { titre: 'Passe expirée', statut: 'en-cours', testeurs: [KARIM, SONIA], termines: { [KARIM]: new Date(Date.now() - 9 * 86400000) }, fins: { [KARIM]: new Date(Date.now() - 2 * 86400000) } });
  await setDoc(doc(b, `projets/atelier/campagnes/c-fin/passages/${KARIM}__DI-15`), { scenario: 'DI-15', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {} });
  await setDoc(doc(b, `projets/atelier/campagnes/c-fin/appreciations/${KARIM}`), { termine: new Date(Date.now() - 3600000), remarques: [{ texte: 'première', le: new Date() }] });
});
await refuse('Karim ne date pas sa fin de test lui-même', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { termine: new Date(Date.now() - 86400000) }, { merge: true }));
await doit('Karim dit « j ai terminé » avec la date du serveur', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { termine: serverTimestamp(), testeur: KARIM, maj: serverTimestamp() }, { merge: true }));
await refuse('Karim ne redate pas sa fin de test', updateDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { termine: serverTimestamp() }));
await refuse('Karim ne retire pas sa fin de test', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { beaute: 4, prix: 5, testeur: KARIM }));
await doit('Karim ajoute une remarque après coup', updateDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}`), { remarques: [{ texte: 'première', le: new Date() }, { texte: 'Le bouton Retour est trop petit.', le: new Date() }], maj: serverTimestamp() }));
await refuse('Karim n efface pas une remarque', updateDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}`), { remarques: [] }));
await refuse('Une remarque tient en 4 000 caractères', updateDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}`), { remarques: [{ texte: 'première', le: new Date() }, { texte: 'Le bouton Retour est trop petit.', le: new Date() }, { texte: 'x'.repeat(4001), le: new Date() }] }));
await refuse('Une remarque vide ne passe pas', updateDoc(doc(karim(), `projets/atelier/campagnes/c-fin/appreciations/${KARIM}`), { remarques: [{ texte: 'première', le: new Date() }, { texte: 'Le bouton Retour est trop petit.', le: new Date() }, { texte: '', le: new Date() }] }));
await refuse('Test terminé : Karim ne pose plus de passage', setDoc(doc(karim(), `projets/atelier/campagnes/c-fin/passages/${KARIM}__DI-16`), { scenario: 'DI-16', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse('ni ne corrige un passage', updateDoc(doc(karim(), `projets/atelier/campagnes/c-fin/passages/${KARIM}__DI-15`), { resultat: 'ko', preuves: ['p/2.png'], commentaire: 'finalement non', le: serverTimestamp() }));
await doit('Sonia, elle, pose encore sur la même campagne', setDoc(doc(sonia(), `projets/atelier/campagnes/c-fin/passages/${SONIA}__DI-16`), { scenario: 'DI-16', testeur: SONIA, plateforme: 'android', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await doit('Karim lit encore la campagne pendant ses sept jours', getDoc(doc(karim(), 'projets/atelier/campagnes/c-fin')));
await refuse('Accès expiré : Karim n écrit plus son appréciation', setDoc(doc(karim(), `projets/atelier/campagnes/c-expiree/appreciations/${KARIM}`), { remarques: [{ texte: 'trop tard', le: new Date() }], testeur: KARIM }, { merge: true }));
await refuse('ni un passage', setDoc(doc(karim(), `projets/atelier/campagnes/c-expiree/passages/${KARIM}__DI-15`), { scenario: 'DI-15', testeur: KARIM, plateforme: 'ios', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await doit('Sonia, sans date de fin, écrit encore', setDoc(doc(sonia(), `projets/atelier/campagnes/c-expiree/appreciations/${SONIA}`), { 'libre.garder': 'tout', testeur: SONIA }, { merge: true }));
await refuse('Karim ne déplace pas sa propre date de fin', updateDoc(doc(karim(), 'projets/atelier/campagnes/c-expiree'), { [`fins.${KARIM}`]: new Date(Date.now() + 86400000) }));
await doit("L'équipe prolonge l accès d un testeur", updateDoc(doc(equipe(), 'projets/atelier/campagnes/c-expiree'), { [`fins.${KARIM}`]: new Date(Date.now() + 7 * 86400000) }));

console.log('\n== La fiche du testeur, ses appareils, sa note du test, sa conversation');
/* Le testeur complète SA fiche (nom, profil, plateformes, appareils, date
   de validation), jamais son adresse ni ses projets. Sa conversation avec
   l'équipe est à part : lui et l'équipe seulement. */
await doit('Karim valide sa fiche', updateDoc(doc(karim(), 'testeurs', KARIM), { nom: 'Benali', prenom: 'Karim', profil: { sexe: 'homme', age: '25-34', fonction: 'QA', expertise: 'Santé', aisance: 'À l aise', langue: 'fr' }, plateformes: ['ios', 'web'], mobile: 'ios', appareils: [{ cle: 'a1', plateforme: 'ios', modele: 'iPhone 13', os: 'iOS 18', navigateur: 'Safari 18', ecran: '390×844', reseau: '4g', agent: 'x', vu: new Date(), confirme: true }], ficheValidee: serverTimestamp(), maj: serverTimestamp() }));
await refuse('Karim ne redate pas sa validation', updateDoc(doc(karim(), 'testeurs', KARIM), { ficheValidee: serverTimestamp() }));
await refuse('Karim ne change pas son adresse', updateDoc(doc(karim(), 'testeurs', KARIM), { email: 'autre@exemple.test' }));
await refuse('Karim ne s ajoute pas un projet', updateDoc(doc(karim(), 'testeurs', KARIM), { projets: ['atelier', 'boutique'] }));
await refuse('Karim ne se réactive pas', updateDoc(doc(karim(), 'testeurs', KARIM), { actif: true }));
await refuse('Karim ne coche pas une plateforme inconnue', updateDoc(doc(karim(), 'testeurs', KARIM), { plateformes: ['ios', 'windows'] }));
await refuse('Karim ne vide pas ses plateformes', updateDoc(doc(karim(), 'testeurs', KARIM), { plateformes: [] }));
await refuse('Karim ne glisse pas un champ de profil inconnu', updateDoc(doc(karim(), 'testeurs', KARIM), { profil: { sexe: 'homme', note: 'admin' } }));
await doit('Karim ajoute l appareil du jour', updateDoc(doc(karim(), 'testeurs', KARIM), { appareils: [{ cle: 'a1', plateforme: 'ios', modele: 'iPhone 13', os: 'iOS 18', navigateur: 'Safari 18', ecran: '390×844', reseau: '', agent: 'x', vu: new Date(), confirme: true }, { cle: 'a2', plateforme: 'web', modele: 'Mac', os: 'macOS 15', navigateur: 'Chrome 129', ecran: '1440×900', reseau: '', agent: 'y', vu: new Date(), confirme: true }], maj: serverTimestamp() }));
await refuse('Sonia ne touche pas la fiche de Karim', updateDoc(doc(sonia(), 'testeurs', KARIM), { nom: 'X' }));
await refuse("L'équipe n écrit pas une fiche depuis le navigateur", updateDoc(doc(equipe(), 'testeurs', KARIM), { nom: 'X' }));
await doit('Karim note le test en terminant', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { noteTest: { note: 4, commentaire: 'Clair.', le: new Date() }, testeur: KARIM, maj: serverTimestamp() }, { merge: true }));
await refuse('Une note hors de 1 à 5 ne passe pas', setDoc(doc(karim(), `projets/atelier/campagnes/c1/appreciations/${KARIM}`), { noteTest: { note: 9, commentaire: '', le: new Date() } }, { merge: true }));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), `conversationsTesteurs/${KARIM}`), { testeur: KARIM, nonLusEquipe: 2, nonLusTesteur: 1, maj: new Date() });
  await setDoc(doc(ctx.firestore(), `conversationsTesteurs/${SONIA}`), { testeur: SONIA, nonLusEquipe: 0, nonLusTesteur: 0, maj: new Date() });
});
await doit('Karim écrit à l équipe', addDoc(collection(karim(), `conversationsTesteurs/${KARIM}/messages`), { de: { uid: KARIM, nom: 'Karim', cote: 'testeur' }, texte: 'Le lien TestFlight ne marche pas.', pieces: [], date: serverTimestamp() }));
await refuse('Karim n écrit pas dans la conversation de Sonia', addDoc(collection(karim(), `conversationsTesteurs/${SONIA}/messages`), { de: { uid: KARIM, nom: 'Karim', cote: 'testeur' }, texte: 'x', pieces: [], date: serverTimestamp() }));
await refuse('Karim ne se fait pas passer pour l équipe', addDoc(collection(karim(), `conversationsTesteurs/${KARIM}/messages`), { de: { uid: KARIM, nom: 'Karim', cote: 'equipe' }, texte: 'x', pieces: [], date: serverTimestamp() }));
await refuse('Karim ne joint pas de pièce dans la bulle', addDoc(collection(karim(), `conversationsTesteurs/${KARIM}/messages`), { de: { uid: KARIM, nom: 'Karim', cote: 'testeur' }, texte: 'x', pieces: ['p/1.png'], date: serverTimestamp() }));
await doit('Karim lit sa conversation', getDoc(doc(karim(), `conversationsTesteurs/${KARIM}`)));
await refuse('Karim ne lit pas celle de Sonia', getDoc(doc(karim(), `conversationsTesteurs/${SONIA}`)));
await refuse('Karim ne liste pas les conversations', getDocs(collection(karim(), 'conversationsTesteurs')));
await doit('Karim remet son compteur à zéro', updateDoc(doc(karim(), `conversationsTesteurs/${KARIM}`), { nonLusTesteur: 0 }));
await refuse('mais pas celui de l équipe', updateDoc(doc(karim(), `conversationsTesteurs/${KARIM}`), { nonLusEquipe: 0 }));
await doit("L'équipe liste les conversations", getDocs(collection(equipe(), 'conversationsTesteurs')));
await doit("L'équipe répond à Karim", addDoc(collection(equipe(), `conversationsTesteurs/${KARIM}/messages`), { de: { uid: AGENT, nom: 'Agent', cote: 'equipe' }, texte: 'On regarde.', pieces: [], date: serverTimestamp() }));
await doit("L'équipe remet son compteur à zéro", updateDoc(doc(equipe(), `conversationsTesteurs/${KARIM}`), { nonLusEquipe: 0 }));
await refuse("L'équipe ne touche pas au compteur du testeur", updateDoc(doc(equipe(), `conversationsTesteurs/${KARIM}`), { nonLusTesteur: 5 }));
await refuse('Camille ne lit pas les conversations des testeurs', getDocs(collection(camille(), 'conversationsTesteurs')));
await refuse('Camille ne lit pas un fil de testeur', getDocs(collection(camille(), `conversationsTesteurs/${KARIM}/messages`)));

console.log('\n== Finances : « J\'ai réglé cette facture » et les coordonnées de règlement');
/* Le responsable déclare un règlement sur une facture due, et rien
   d'autre : pas sur une payée, pas sur un autre projet, pas au nom d'un
   autre, pas avec un champ en plus. Les coordonnées de règlement se lisent
   par tout client connecté (une seule agence) et s'écrivent par la finance. */
const AGENT_SANS_FINANCE = 'uid-agent-sans-finance';
const agentSansFinance = () => env.authenticatedContext(AGENT_SANS_FINANCE, jeton(AGENT_SANS_FINANCE, 'agent2.essai@exemple.test')).firestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'documents/f-due'), { projet: 'atelier', type: 'facture', numero: 'F-DUE', montant: 1000, tva: 20, ttc: 1200, statut: 'a-payer', reponse: null, archive: false });
  await setDoc(doc(b, 'documents/f-due-retard'), { projet: 'atelier', type: 'facture', numero: 'F-RETARD', montant: 500, tva: 0, ttc: 500, statut: 'en-retard', reponse: null, archive: false });
  await setDoc(doc(b, 'documents/f-payee'), { projet: 'atelier', type: 'facture', numero: 'F-PAYEE', montant: 100, tva: 0, ttc: 100, statut: 'payee', reponse: null, archive: false });
  await setDoc(doc(b, 'documents/f-due-boutique'), { projet: 'boutique', type: 'facture', numero: 'F-BOUT', montant: 100, tva: 0, ttc: 100, statut: 'a-payer', reponse: null, archive: false });
  await setDoc(doc(b, 'documents/d-pour-reglement'), { projet: 'atelier', type: 'devis', numero: 'D-REGL', montant: 100, statut: 'envoye', reponse: null });
  await setDoc(doc(b, 'equipe', AGENT_SANS_FINANCE), { nom: 'Sam Agent', email: 'agent2.essai@exemple.test', role: 'agent', actif: true, projets: ['atelier'], permissions: [] });
});
const reglement = (extra = {}) => ({ par: CAMILLE, nom: 'Camille Martin', date: Timestamp.fromDate(new Date()), moyen: 'virement', reference: 'VIR-1', montant: 1200, le: serverTimestamp(), ...extra });
await doit('Camille déclare un règlement sur sa facture due', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement() }));
await doit('et sur une facture en retard, qui reste due', updateDoc(doc(camille(), 'documents/f-due-retard'), { reglementDeclare: reglement({ montant: 500, reference: '' }) }));
await refuse('pas sur une facture payée', updateDoc(doc(camille(), 'documents/f-payee'), { reglementDeclare: reglement({ montant: 100 }) }));
await refuse('pas sur la facture d un autre projet', updateDoc(doc(camille(), 'documents/f-due-boutique'), { reglementDeclare: reglement({ montant: 100 }) }));
await refuse('pas au nom d une autre personne', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement({ par: LEA }) }));
await refuse('pas sans la date du serveur', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement({ le: new Date() }) }));
await refuse('pas avec un montant nul', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement({ montant: 0 }) }));
await refuse('pas avec un moyen inconnu', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement({ moyen: 'troc' }) }));
await refuse('pas avec un champ en plus', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement({ confirme: new Date() }) }));
await refuse('pas en changeant le statut en même temps', updateDoc(doc(camille(), 'documents/f-due'), { reglementDeclare: reglement(), statut: 'payee' }));
await refuse('pas sur un devis', updateDoc(doc(camille(), 'documents/d-pour-reglement'), { reglementDeclare: reglement({ montant: 100 }) }));
await refuse('Léa ne déclare rien sur la facture de Camille', updateDoc(doc(lea(), 'documents/f-due'), { reglementDeclare: reglement({ par: LEA }) }));
await refuse("L'équipe ne déclare pas un règlement depuis le navigateur", updateDoc(doc(equipe(), 'documents/f-due'), { reglementDeclare: reglement({ par: AGENT }) }));
const coordonnees = { titulaire: 'Capmedia Digital', iban: 'FR7630001007941234567890185', bic: 'BDFEFRPP', banque: 'Banque de France', mention: 'Le numéro de la facture en libellé.', maj: serverTimestamp() };
await doit("L'administrateur écrit les coordonnées de règlement", setDoc(doc(equipe(), 'reglages/finance'), coordonnees));
await refuse('Un agent sans permission finance ne les écrit pas', setDoc(doc(agentSansFinance(), 'reglages/finance'), coordonnees));
await refuse('Camille ne les écrit pas', setDoc(doc(camille(), 'reglages/finance'), coordonnees));
await refuse('Rien d autre ne se glisse dans les réglages', setDoc(doc(equipe(), 'reglages/finance'), { ...coordonnees, stripe: 'sk_live' }));
await refuse('Un IBAN de 41 caractères ne passe pas', setDoc(doc(equipe(), 'reglages/finance'), { ...coordonnees, iban: 'F'.repeat(41) }));
await refuse('Un autre réglage que « finance » ne s écrit pas ainsi', setDoc(doc(equipe(), 'reglages/autre'), coordonnees));
await doit('Camille lit les coordonnées de règlement', getDoc(doc(camille(), 'reglages/finance')));
await doit('Léa aussi : il n y a qu une agence', getDoc(doc(lea(), 'reglages/finance')));
await doit("L'agent sans finance les lit", getDoc(doc(agentSansFinance(), 'reglages/finance')));
await refuse('Un visiteur ne les lit pas', getDoc(doc(anonyme(), 'reglages/finance')));

console.log('\n== Se repérer, plusieurs projets, le rôle (agent D, 27/09/2026)');
/* Le miroir « personnesClient » (nom + rôle, lu par le client) et le registre
   « personnes » ne s'écrivent que par le serveur : ni depuis l'écran du
   client, ni depuis celui de l'équipe. */
await refuse('Camille n écrit pas le miroir des personnes', updateDoc(doc(camille(), 'projets/atelier'), { personnesClient: [{ uid: CAMILLE, nom: 'Camille', role: 'responsable' }] }));
await refuse('Camille n écrit pas le registre des personnes', updateDoc(doc(camille(), 'projets/atelier'), { personnes: [CAMILLE, LEA] }));
await refuse("L'équipe n écrit pas le miroir des personnes depuis l écran", updateDoc(doc(equipe(), 'projets/atelier'), { personnesClient: [{ uid: LEA, nom: 'Léa', role: 'responsable' }], maj: serverTimestamp() }));
await refuse('Camille ne se donne pas un rôle', updateDoc(doc(camille(), 'projets/atelier'), { roles: { [CAMILLE]: 'responsable', [LEA]: 'collaborateur' } }));
/* La demande de forfait se modifie tant qu elle est « demande », se
   renouvelle après une suspension ou un terme, jamais sur une proposition. */
const demandeD = { par: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test' }, message: 'Un suivi chaque mois.', rythme: 'Chaque mois', le: serverTimestamp() };
const poserContrat = (statut) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'projets/atelier/maintenance/contrat'), { genre: 'contrat', statut, demande: { ...demandeD, le: new Date() }, cree: new Date(), maj: new Date() }));
await poserContrat('demande');
await doit('Camille modifie sa demande de forfait tant qu elle est « demande »', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: { ...demandeD, message: 'Plutôt chaque trimestre.' }, maj: serverTimestamp() }));
await poserContrat('proposition');
await refuse('mais plus une fois la proposition envoyée', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: demandeD, maj: serverTimestamp() }));
await poserContrat('suspendu');
await doit('Camille reprend un forfait suspendu (nouvelle demande)', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: demandeD, maj: serverTimestamp() }));
await poserContrat('termine');
await doit('Camille reprend un forfait terminé', updateDoc(doc(camille(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: demandeD, maj: serverTimestamp() }));
await refuse('Léa ne reprend pas le forfait de Camille', updateDoc(doc(lea(), 'projets/atelier/maintenance/contrat'), { statut: 'demande', demande: { ...demandeD, par: { uid: LEA, nom: 'Léa', email: 'x' } }, maj: serverTimestamp() }));
/* Une évolution proposée se retire par son auteur, tant qu elle est
   « proposée » ; elle peut porter des pièces jointes, dix au plus. */
const evolutionD = { genre: 'evolution', titre: 'Un export en tableur', description: '', statut: 'proposee', origine: 'client', par: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test' }, cree: serverTimestamp(), maj: serverTimestamp() };
await doit('Camille propose une évolution avec des pièces', setDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-pieces'), { ...evolutionD, pieces: [{ nom: 'croquis.png', chemin: 'projets/atelier/maintenance/ev-d-pieces/croquis.png', taille: 12, type: 'image/png' }] }));
await refuse('mais pas onze pièces', setDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-onze'), { ...evolutionD, pieces: Array.from({ length: 11 }, (_, i) => ({ nom: `${i}.png`, chemin: `p/${i}.png` })) }));
await refuse('ni des pièces qui ne sont pas une liste', setDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-faux'), { ...evolutionD, pieces: 'croquis.png' }));
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projets/atelier/maintenance/ev-d-proposee'), { ...evolutionD, cree: new Date(), maj: new Date() });
  await setDoc(doc(b, 'projets/atelier/maintenance/ev-d-acceptee'), { ...evolutionD, statut: 'acceptee', cree: new Date(), maj: new Date() });
  await setDoc(doc(b, 'projets/atelier/maintenance/ev-d-equipe'), { ...evolutionD, origine: 'equipe', par: { uid: AGENT, nom: 'Agent' }, cree: new Date(), maj: new Date() });
  await setDoc(doc(b, 'projets/atelier/maintenance/ev-d-autre'), { ...evolutionD, par: { uid: LEA, nom: 'Léa', email: 'x' }, cree: new Date(), maj: new Date() });
});
await doit('Camille retire son évolution « proposée »', deleteDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-proposee')));
await refuse('mais pas une évolution acceptée', deleteDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-acceptee')));
await refuse('ni une évolution posée par l équipe', deleteDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-equipe')));
await refuse('ni celle d une autre personne', deleteDoc(doc(camille(), 'projets/atelier/maintenance/ev-d-autre')));
await refuse('Léa ne retire rien chez Camille', deleteDoc(doc(lea(), 'projets/atelier/maintenance/ev-d-pieces')));
await refuse('Camille ne retire pas le contrat en passant par la règle des évolutions', deleteDoc(doc(camille(), 'projets/atelier/maintenance/contrat')));
/* La demande de projet porte le devis envoyé : l équipe le rattache, le
   client ne touche pas à sa fiche. */
await doit("L'équipe rattache un devis à une demande de projet", updateDoc(doc(equipe(), 'demandesProjet/dp1'), { statut: 'devis', devis: 'd1', maj: serverTimestamp() }));
await refuse('Léa ne rattache pas un devis à sa propre demande', updateDoc(doc(lea(), 'demandesProjet/dp1'), { devis: 'd1', maj: serverTimestamp() }));
await refuse("L'équipe ne glisse pas un autre champ avec le devis", updateDoc(doc(equipe(), 'demandesProjet/dp1'), { devis: 'd1', titre: 'Autre', maj: serverTimestamp() }));

console.log('\n== Les échanges : des pièces sans un mot, retirer son fichier, une demande née d une anomalie');
/* Un message peut n'être que des pièces (texte vide), jamais rien du tout.
   Le client retire ce qu'il a lui-même déposé, pas le fichier de l'équipe,
   pas celui d'un autre client ; l'équipe archive, elle n'efface pas. Une
   demande née d'une anomalie de test porte son identifiant, borné. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'fichiers/f-camille'), { projet: 'atelier', nom: 'logo.png', chemin: 'projets/atelier/fichiers/f-camille/logo.png', visibilite: 'client', archive: false, par: { uid: CAMILLE, nom: 'Camille', cote: 'client' } });
  await setDoc(doc(b, 'fichiers/f-camille-2'), { projet: 'atelier', nom: 'logo2.png', chemin: 'projets/atelier/fichiers/f-camille-2/logo2.png', visibilite: 'client', archive: false, par: { uid: CAMILLE, nom: 'Camille', cote: 'client' } });
  await setDoc(doc(b, 'fichiers/f-lea'), { projet: 'boutique', nom: 'carte.pdf', chemin: 'projets/boutique/fichiers/f-lea/carte.pdf', visibilite: 'client', archive: false, par: { uid: LEA, nom: 'Léa', cote: 'client' } });
});
await doit('Camille envoie des pièces sans un mot', addDoc(collection(camille(), 'projets/atelier/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, texte: '', pieces: [{ nom: 'a.png', chemin: 'projets/atelier/messages/a.png', taille: 1, type: 'image/png' }], date: serverTimestamp() }));
await refuse('mais pas un message sans texte ni pièces', addDoc(collection(camille(), 'projets/atelier/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, texte: '', pieces: [], date: serverTimestamp() }));
await refuse('ni un texte vide avec des pièces qui ne sont pas une liste', addDoc(collection(camille(), 'projets/atelier/messages'), { de: { uid: CAMILLE, nom: 'Camille', cote: 'client' }, texte: '', pieces: 'a.png', date: serverTimestamp() }));
await doit("L'équipe aussi envoie des pièces seules", addDoc(collection(equipe(), 'projets/atelier/messages'), { de: { uid: AGENT, nom: 'Agent', cote: 'equipe' }, texte: '', pieces: [{ nom: 'b.pdf', chemin: 'projets/atelier/messages/b.pdf', taille: 1, type: 'application/pdf' }], date: serverTimestamp() }));
await doit('Camille retire le fichier qu elle a déposé', deleteDoc(doc(camille(), 'fichiers/f-camille')));
await refuse('Camille ne retire pas un fichier de l équipe', deleteDoc(doc(camille(), 'fichiers/f-client')));
await refuse('ni celui de Léa', deleteDoc(doc(camille(), 'fichiers/f-lea')));
await refuse('Léa ne retire pas le fichier de Camille', deleteDoc(doc(lea(), 'fichiers/f-camille-2')));
await refuse("L'équipe n efface pas un fichier : elle archive", deleteDoc(doc(equipe(), 'fichiers/f-camille-2')));
const demandeDepuisAnomalie = (anomalie) => ({ numero: null, projet: 'atelier', composant: '', titre: 'Le bouton Retour ne répond pas', description: 'Constaté par les testeurs.', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: 'ios', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: CAMILLE, nom: 'Camille', email: 'camille.essai@exemple.test', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: null, equipe: null }, qualification: null, devis: null, anomalie });
await doit('Camille crée une demande née d une anomalie de test', addDoc(collection(camille(), 'tickets'), demandeDepuisAnomalie('ko-QA-01')));
await refuse('mais l identifiant de l anomalie est borné', addDoc(collection(camille(), 'tickets'), demandeDepuisAnomalie('x'.repeat(81))));
await refuse('et doit être un texte', addDoc(collection(camille(), 'tickets'), demandeDepuisAnomalie(12)));

console.log('\n== La fiche projet : le pouls daté, les actions d une réunion, les accès, le build (agent C, 27/09/2026)');
/* Le pouls est daté et signé par l'équipe ; le client ne le touche pas.
   Le client coche une action de réunion : la liste « actions » seule, à la
   même taille, sur une réunion qui lui est visible. Un lien d'accès porte
   un identifiant borné, écrit par l'équipe. Une version porte un build. */
await doit("L'équipe date et signe le pouls du projet", updateDoc(doc(equipe(), 'projets/atelier'), { pulse: { enCours: 'Écran de profil' }, pulseMaj: serverTimestamp(), pulsePar: 'Alex Durand', maj: serverTimestamp() }));
await refuse('Camille ne réécrit pas le pouls', updateDoc(doc(camille(), 'projets/atelier'), { pulse: { enCours: 'x' }, pulseMaj: serverTimestamp(), pulsePar: 'Camille' }));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'reunions/re-actions'), { projet: 'atelier', titre: 'Revue', visibilite: 'client', actions: [{ texte: 'Envoyer les captures', fait: false }, { texte: 'Valider les couleurs', fait: false }] });
  await setDoc(doc(ctx.firestore(), 'reunions/re-interne'), { projet: 'atelier', titre: 'Interne', visibilite: 'interne', actions: [{ texte: 'x', fait: false }] });
});
await doit('Camille coche une action de sa réunion', updateDoc(doc(camille(), 'reunions/re-actions'), { actions: [{ texte: 'Envoyer les captures', fait: true }, { texte: 'Valider les couleurs', fait: false }] }));
await refuse('Camille ne change pas le titre en passant', updateDoc(doc(camille(), 'reunions/re-actions'), { titre: 'Autre', actions: [{ texte: 'Envoyer les captures', fait: true }, { texte: 'Valider les couleurs', fait: false }] }));
await refuse('Camille ne touche pas au compte rendu', updateDoc(doc(camille(), 'reunions/re-actions'), { compteRendu: 'x' }));
await refuse('Camille n ajoute pas une action', updateDoc(doc(camille(), 'reunions/re-actions'), { actions: [{ texte: 'Envoyer les captures', fait: true }, { texte: 'Valider les couleurs', fait: false }, { texte: 'Une de plus', fait: false }] }));
await refuse('Camille ne retire pas une action', updateDoc(doc(camille(), 'reunions/re-actions'), { actions: [{ texte: 'Envoyer les captures', fait: true }] }));
await refuse('Camille ne coche rien sur une réunion interne', updateDoc(doc(camille(), 'reunions/re-interne'), { actions: [{ texte: 'x', fait: true }] }));
await refuse('Léa ne coche pas une action chez Camille', updateDoc(doc(lea(), 'reunions/re-actions'), { actions: [{ texte: 'Envoyer les captures', fait: true }, { texte: 'Valider les couleurs', fait: true }] }));
await doit("L'équipe date le compte rendu", updateDoc(doc(equipe(), 'reunions/re-actions'), { compteRendu: 'Écrans validés.', compteRenduLe: serverTimestamp(), lieu: 'Dans vos locaux', maj: serverTimestamp() }));
await doit("L'équipe pose un lien d'accès avec son identifiant", setDoc(doc(equipe(), 'projets/atelier/liens/acces-store'), { nom: 'Compte App Store Connect', url: 'https://appstoreconnect.apple.com', categorie: 'acces', identifiants: 'atelier@exemple.test', visibilite: 'client' }));
await refuse('Camille ne pose pas de lien d accès', setDoc(doc(camille(), 'projets/atelier/liens/mien'), { nom: 'x', url: 'https://x', categorie: 'acces', identifiants: 'a', visibilite: 'client' }));
await refuse('Un identifiant démesuré ne passe pas', setDoc(doc(equipe(), 'projets/atelier/liens/acces-long'), { nom: 'x', url: 'https://x', categorie: 'acces', identifiants: 'a'.repeat(301), visibilite: 'client' }));
await doit("L'équipe enregistre une version avec son build", setDoc(doc(equipe(), 'releases/r-build'), { projet: 'atelier', version: '1.4.2', plateforme: 'android', statut: 'test', build: '87', visibilite: 'client' }));
await refuse('Un build démesuré ne passe pas', setDoc(doc(equipe(), 'releases/r-build-long'), { projet: 'atelier', version: '1.4.3', plateforme: 'android', statut: 'test', build: 'b'.repeat(41), visibilite: 'client' }));
await refuse('Camille ne touche pas à une version', updateDoc(doc(camille(), 'releases/r1'), { build: '99' }));

console.log('\n== Brief B : répondre sur une tâche, dire « c est fait », retirer une demande, les pièces d une validation, la suite d une demande');
/* Camille répond sur une tâche à elle depuis sa fiche, jamais sur une tâche
   interne ni sur une tâche qui ne l'attend pas, jamais deux fois. Elle dit
   « c'est fait » sur un point bloquant de son côté, pas sur un point de
   notre côté, une seule fois. Elle retire sa demande tant qu'elle est chez
   nous, pas une fois le travail commencé. Ses remarques sur une validation
   portent dix pièces au plus. Une demande peut en poursuivre une autre
   (« suite ») ; « suivant » est au serveur. Le motif d'un refus est à
   l'équipe. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'taches/t-attente'), { projet: 'atelier', titre: 'Captures', statut: 'attente-client', priorite: 'normale', visibilite: 'client' });
  await setDoc(doc(b, 'taches/t-attente-interne'), { projet: 'atelier', titre: 'Interne', statut: 'attente-client', priorite: 'normale', visibilite: 'interne' });
  await setDoc(doc(b, 'taches/t-en-cours'), { projet: 'atelier', titre: 'En cours', statut: 'en-cours', priorite: 'normale', visibilite: 'client' });
  await setDoc(doc(b, 'blocages/b-client'), { projet: 'atelier', titre: 'Compte Google', responsable: 'client', visibilite: 'client', resolu: null, signaleFait: null });
  await setDoc(doc(b, 'blocages/b-nous'), { projet: 'atelier', titre: 'Serveur', responsable: 'capmedia', visibilite: 'client', resolu: null, signaleFait: null });
  await setDoc(doc(b, 'tickets/t-neuf'), { projet: 'atelier', numero: 'ATELIER-010', titre: 'x', statut: 'nouveau', urgence: 'important', auteur: { uid: CAMILLE }, resolu: null, lu: {} });
  await setDoc(doc(b, 'tickets/t-commence'), { projet: 'atelier', numero: 'ATELIER-011', titre: 'x', statut: 'en-cours', urgence: 'important', auteur: { uid: CAMILLE }, resolu: null, lu: {} });
  await setDoc(doc(b, 'validations/v-pieces'), { projet: 'atelier', titre: 'Écran', statut: 'en-attente', reponse: null });
});
const reponseTache = (texte, pieces = []) => ({ par: CAMILLE, nom: 'Camille', texte, pieces, date: serverTimestamp() });
await refuse('Camille ne répond pas sur une tâche interne', updateDoc(doc(camille(), 'taches/t-attente-interne'), { statut: 'repondu', reponseClient: reponseTache('fait'), maj: serverTimestamp() }));
await refuse('ni sur une tâche qui ne l attend pas', updateDoc(doc(camille(), 'taches/t-en-cours'), { statut: 'repondu', reponseClient: reponseTache('fait'), maj: serverTimestamp() }));
await refuse('ni au nom d un autre', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'repondu', reponseClient: { ...reponseTache('fait'), par: LEA }, maj: serverTimestamp() }));
await refuse('ni vers un autre statut que « réponse reçue »', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'terminee', reponseClient: reponseTache('fait'), maj: serverTimestamp() }));
await refuse('ni sans un mot ni une pièce', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'repondu', reponseClient: reponseTache(''), maj: serverTimestamp() }));
await refuse('ni avec onze pièces', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'repondu', reponseClient: reponseTache('x', Array.from({ length: 11 }, (_, i) => ({ nom: `${i}.png`, chemin: 'p' }))), maj: serverTimestamp() }));
await refuse('Léa ne répond pas sur une tâche de Atelier', updateDoc(doc(lea(), 'taches/t-attente'), { statut: 'repondu', reponseClient: { ...reponseTache('fait'), par: LEA }, maj: serverTimestamp() }));
await doit('Camille répond sur une tâche à elle', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'repondu', reponseClient: reponseTache('Voici les captures.', [{ nom: 'a.png', chemin: 'projets/atelier/taches/t-attente/reponse/a.png', taille: 10, type: 'image/png' }]), maj: serverTimestamp() }));
await refuse('mais pas deux fois', updateDoc(doc(camille(), 'taches/t-attente'), { statut: 'repondu', reponseClient: reponseTache('encore'), maj: serverTimestamp() }));
await refuse('et ne touche pas au reste de la tâche', updateDoc(doc(camille(), 'taches/t-attente'), { titre: 'Autre' }));
await doit('L équipe passe une tâche en « réponse reçue »', updateDoc(doc(equipe(), 'taches/t-en-cours'), { statut: 'repondu', maj: serverTimestamp() }));
const cestFait = (texte) => ({ par: CAMILLE, nom: 'Camille', date: serverTimestamp(), texte });
await refuse('Camille ne dit pas « c est fait » sur un point de notre côté', updateDoc(doc(camille(), 'blocages/b-nous'), { signaleFait: cestFait(''), maj: serverTimestamp() }));
await refuse('ni au nom d un autre', updateDoc(doc(camille(), 'blocages/b-client'), { signaleFait: { ...cestFait(''), par: LEA }, maj: serverTimestamp() }));
await refuse('ni ne lève le point elle-même', updateDoc(doc(camille(), 'blocages/b-client'), { resolu: serverTimestamp(), maj: serverTimestamp() }));
await doit('Camille dit « c est fait » sur un point de son côté', updateDoc(doc(camille(), 'blocages/b-client'), { signaleFait: cestFait('Compte créé.'), maj: serverTimestamp() }));
await refuse('mais pas deux fois', updateDoc(doc(camille(), 'blocages/b-client'), { signaleFait: cestFait('Encore.'), maj: serverTimestamp() }));
await refuse('Léa ne dit rien sur un point de Atelier', updateDoc(doc(lea(), 'blocages/b-client'), { signaleFait: { ...cestFait(''), par: LEA }, maj: serverTimestamp() }));
await doit('Camille retire sa demande reçue', updateDoc(doc(camille(), 'tickets/t-neuf'), { statut: 'annulee', maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
await refuse('mais pas une demande en cours', updateDoc(doc(camille(), 'tickets/t-commence'), { statut: 'annulee', maj: serverTimestamp(), 'lu.client': serverTimestamp() }));
await refuse('ni ne pose le motif d un refus', updateDoc(doc(camille(), 'tickets/t-commence'), { motifRefus: 'x', maj: serverTimestamp() }));
await doit('L équipe refuse avec un motif', updateDoc(doc(equipe(), 'tickets/t-commence'), { statut: 'refuse', motifRefus: 'Hors du périmètre.', maj: serverTimestamp() }));
await refuse('mais pas un motif de deux mille et un caractères', updateDoc(doc(equipe(), 'tickets/t-commence'), { motifRefus: 'x'.repeat(2001), maj: serverTimestamp() }));
await doit('Camille marque la demande lue, à son nom', updateDoc(doc(camille(), 'tickets/t-commence'), { 'lu.client': serverTimestamp(), [`lu.clients.${CAMILLE}`]: serverTimestamp() }));
await refuse('Camille ne joint pas onze pièces à ses remarques', updateDoc(doc(camille(), 'validations/v-pieces'), { statut: 'modifications', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: 'x', pieces: Array.from({ length: 11 }, (_, i) => ({ nom: `${i}.png` })) }, maj: serverTimestamp() }));
await doit('Camille joint des pièces à ses remarques', updateDoc(doc(camille(), 'validations/v-pieces'), { statut: 'modifications', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: 'Voir la capture.', pieces: [{ nom: 'a.png', chemin: 'projets/atelier/validations/v-pieces/reponse/a.png', taille: 10, type: 'image/png' }] }, maj: serverTimestamp() }));
const demandeSuite = (extra) => ({ numero: null, projet: 'atelier', composant: '', titre: 'Suite', description: 'd', type: 'bug', urgence: 'important', statut: 'nouveau', plateforme: '', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: CAMILLE, email: 'camille.essai@exemple.test', nom: 'Camille', cote: 'client' }, pieces: [], archive: false, cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: { client: serverTimestamp(), equipe: null, clients: { [CAMILLE]: serverTimestamp() } }, qualification: null, devis: null, ...extra });
await doit('Camille ouvre une demande qui en poursuit une autre', addDoc(collection(camille(), 'tickets'), demandeSuite({ suite: 't1' })));
await doit('ou sans suite', addDoc(collection(camille(), 'tickets'), demandeSuite({ suite: null })));
await refuse('mais une suite est un identifiant, pas un nombre', addDoc(collection(camille(), 'tickets'), demandeSuite({ suite: 12 })));
await refuse('et elle n écrit pas « suivant » elle-même', addDoc(collection(camille(), 'tickets'), demandeSuite({ suivant: 't1' })));

/* La page Notes d'un projet : des propositions « à valider ». L'équipe
   propose et rédige ; un membre du projet propose à son nom ; seul le
   responsable valide (la proposition devient une décision datée par le
   serveur, à son nom) ou refuse avec un motif. Personne ne réécrit la
   réponse ; le texte d'une décision actée reste à l'équipe. */
console.log('\n== Notes : propositions, validation, décisions');
const COLIN = 'uid-colin';
const colin = () => env.authenticatedContext(COLIN, jeton(COLIN, 'colin.essai@exemple.test')).firestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projets/atelier-notes'), { nom: 'Atelier notes', ref: 'ATN', membres: [CAMILLE, COLIN], roles: { [CAMILLE]: 'responsable', [COLIN]: 'collaborateur' }, organisation: 'atelier-nord', statut: 'en-cours', compteur: 0, ouvert: true });
  const ilYa = Timestamp.fromDate(new Date(Date.now() - 3 * 86400000));
  const prop = (titre) => ({ projet: 'atelier-notes', type: 'proposition', etat: 'a-valider', origine: 'equipe', visibilite: 'client', titre, contenu: '', date: ilYa, cree: ilYa, maj: ilYa, par: { uid: AGENT, nom: 'Alex Durand' } });
  await setDoc(doc(b, 'notes/p-a'), prop('Garder la connexion par e-mail'));
  await setDoc(doc(b, 'notes/p-b'), prop('Retirer l export PDF'));
  await setDoc(doc(b, 'notes/p-c'), prop('Une seule langue en V1'));
  await setDoc(doc(b, 'notes/d-ancienne'), { projet: 'atelier-notes', type: 'decision', titre: 'Conserver Stripe', contenu: 'x', date: ilYa, visibilite: 'client', cree: ilYa, maj: ilYa, par: { uid: AGENT, nom: 'Alex Durand' } });
});
const propClient = (uid, extra = {}) => ({ projet: 'atelier-notes', type: 'proposition', etat: 'a-valider', origine: 'client', visibilite: 'client', titre: 'Un mode sombre', contenu: 'Le soir surtout.', par: { uid, nom: 'Moi', cote: 'client' }, date: serverTimestamp(), cree: serverTimestamp(), maj: serverTimestamp(), ...extra });
const reponseNote = (etat, extra = {}) => ({ etat, reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), motif: '', ...extra }, maj: serverTimestamp() });

await doit('L équipe propose à la validation (visible du client)', addDoc(collection(equipe(), 'notes'), { projet: 'atelier-notes', type: 'proposition', etat: 'a-valider', origine: 'equipe', visibilite: 'client', titre: 'Un widget', date: serverTimestamp(), cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('mais pas une proposition interne', addDoc(collection(equipe(), 'notes'), { projet: 'atelier-notes', type: 'proposition', etat: 'a-valider', origine: 'equipe', visibilite: 'interne', titre: 'x' }));
await refuse('ni une proposition déjà « validée »', addDoc(collection(equipe(), 'notes'), { projet: 'atelier-notes', type: 'proposition', etat: 'validee', origine: 'equipe', visibilite: 'client', titre: 'x' }));
await refuse('ni une réponse du client toute faite', addDoc(collection(equipe(), 'notes'), { projet: 'atelier-notes', type: 'decision', visibilite: 'client', titre: 'x', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), motif: '' } }));
await doit('L équipe consigne toujours une décision', addDoc(collection(equipe(), 'notes'), { projet: 'atelier-notes', type: 'decision', visibilite: 'client', titre: 'Garder iOS 16', date: serverTimestamp(), cree: serverTimestamp(), maj: serverTimestamp() }));

await doit('Camille propose à son nom', setDoc(doc(camille(), 'notes/c-camille'), propClient(CAMILLE)));
await doit('Colin, collaborateur, propose aussi', setDoc(doc(colin(), 'notes/c-colin'), propClient(COLIN)));
await refuse('Camille ne propose pas au nom de Colin', setDoc(doc(camille(), 'notes/c-usurpe'), propClient(COLIN)));
await refuse('ni une proposition déjà validée', setDoc(doc(camille(), 'notes/c-validee'), propClient(CAMILLE, { etat: 'validee' })));
await refuse('ni une décision directe', setDoc(doc(camille(), 'notes/c-decision'), propClient(CAMILLE, { type: 'decision' })));
await refuse('ni une note interne', setDoc(doc(camille(), 'notes/c-interne'), propClient(CAMILLE, { visibilite: 'interne' })));
await refuse('ni une proposition « de l équipe »', setDoc(doc(camille(), 'notes/c-equipe'), propClient(CAMILLE, { origine: 'equipe' })));
await refuse('ni avec une date choisie', setDoc(doc(camille(), 'notes/c-datee'), propClient(CAMILLE, { date: Timestamp.fromDate(new Date(2020, 0, 1)) })));
await refuse('ni un titre de cent soixante et un caractères', setDoc(doc(camille(), 'notes/c-long'), propClient(CAMILLE, { titre: 'x'.repeat(161) })));
await refuse('ni avec une réponse déjà posée', setDoc(doc(camille(), 'notes/c-rep'), propClient(CAMILLE, { reponse: { par: CAMILLE, nom: 'C', date: serverTimestamp(), motif: '' } })));
await refuse('Léa ne propose rien sur un projet qui n est pas le sien', setDoc(doc(lea(), 'notes/c-lea'), propClient(LEA)));
await refuse('un testeur non plus', setDoc(doc(karim(), 'notes/c-karim'), propClient(KARIM)));
await doit('Camille lit la proposition de l équipe', getDoc(doc(camille(), 'notes/p-a')));
await refuse('Léa ne la lit pas', getDoc(doc(lea(), 'notes/p-a')));

await refuse('Colin, collaborateur, ne valide pas', updateDoc(doc(colin(), 'notes/p-a'), { ...reponseNote('validee'), reponse: { par: COLIN, nom: 'Colin', date: serverTimestamp(), motif: '' } }));
await refuse('Léa ne valide pas', updateDoc(doc(lea(), 'notes/p-a'), { ...reponseNote('validee'), reponse: { par: LEA, nom: 'Léa', date: serverTimestamp(), motif: '' } }));
await refuse('Camille ne valide pas au nom de Colin', updateDoc(doc(camille(), 'notes/p-a'), { ...reponseNote('validee'), reponse: { par: COLIN, nom: 'Colin', date: serverTimestamp(), motif: '' } }));
await refuse('ni avec une date choisie', updateDoc(doc(camille(), 'notes/p-a'), reponseNote('validee', { date: Timestamp.fromDate(new Date(2020, 0, 1)) })));
await refuse('ni en changeant le titre au passage', updateDoc(doc(camille(), 'notes/p-a'), { ...reponseNote('validee'), titre: 'Autre chose' }));
await refuse('ni vers un autre état', updateDoc(doc(camille(), 'notes/p-a'), reponseNote('a-valider')));
await doit('Camille, responsable, valide : c est une décision datée à son nom', updateDoc(doc(camille(), 'notes/p-a'), reponseNote('validee')));
await refuse('mais pas deux fois', updateDoc(doc(camille(), 'notes/p-a'), reponseNote('refusee', { motif: 'Finalement non' })));
await refuse('et elle ne réécrit pas la décision', updateDoc(doc(camille(), 'notes/p-a'), { titre: 'Autre', maj: serverTimestamp() }));
await refuse('Camille ne refuse pas sans un mot', updateDoc(doc(camille(), 'notes/p-b'), reponseNote('refusee')));
await refuse('ni avec un motif de mille et un caractères', updateDoc(doc(camille(), 'notes/p-b'), reponseNote('refusee', { motif: 'x'.repeat(1001) })));
await doit('Camille refuse avec un motif', updateDoc(doc(camille(), 'notes/p-b'), reponseNote('refusee', { motif: 'Nos clients l utilisent.' })));
await refuse('Camille ne répond pas sur une décision consignée par l équipe', updateDoc(doc(camille(), 'notes/d-ancienne'), reponseNote('validee')));

await doit('L équipe corrige le texte d une décision validée', updateDoc(doc(equipe(), 'notes/p-a'), { titre: 'Garder la connexion par e-mail seule', maj: serverTimestamp() }));
await refuse('mais ne réécrit pas qui a validé', updateDoc(doc(equipe(), 'notes/p-a'), { 'reponse.par': AGENT }));
await refuse('ni ne remet la décision « à valider »', updateDoc(doc(equipe(), 'notes/p-a'), { etat: 'a-valider' }));
await refuse('ni ne valide à la place du client', updateDoc(doc(equipe(), 'notes/p-c'), { etat: 'validee', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), motif: '' } }));
await refuse('ni ne rend interne une proposition qui attend', updateDoc(doc(equipe(), 'notes/p-c'), { visibilite: 'interne' }));
await doit('L équipe corrige une proposition qui attend', updateDoc(doc(equipe(), 'notes/p-c'), { titre: 'Une seule langue, le français, en V1', maj: serverTimestamp() }));

await refuse('Camille ne retire pas une proposition de l équipe', deleteDoc(doc(camille(), 'notes/p-c')));
await refuse('ni la proposition de Colin', deleteDoc(doc(camille(), 'notes/c-colin')));
await refuse('ni une décision', deleteDoc(doc(camille(), 'notes/p-a')));
await doit('Colin retire sa proposition tant qu elle attend', deleteDoc(doc(colin(), 'notes/c-colin')));
await doit('L équipe retire une proposition', deleteDoc(doc(equipe(), 'notes/p-c')));
/* Une idée du carnet passe dans « À valider » : la proposition naît, la note part, d'une seule écriture. */
await doit('Camille garde une idée dans son carnet', setDoc(doc(camille(), 'notesClient/idee-1'), { uid: CAMILLE, nom: 'Camille', projet: 'atelier-notes', texte: 'Un mode sombre', epinglee: false, partagee: false, cree: serverTimestamp(), maj: serverTimestamp() }));
await doit('et la propose à la validation (la note quitte le carnet)', (async () => {
  const db = camille();
  const b = writeBatch(db);
  b.set(doc(db, 'notes/c-idee'), propClient(CAMILLE, { titre: 'Un mode sombre' }));
  b.delete(doc(db, 'notesClient/idee-1'));
  await b.commit();
})());
await doit('Camille garde une autre idée, privée', setDoc(doc(camille(), 'notesClient/idee-2'), { uid: CAMILLE, nom: 'Camille', projet: 'atelier-notes', texte: 'Privé', epinglee: false, partagee: false, cree: serverTimestamp(), maj: serverTimestamp() }));
await refuse('l équipe ne lit pas une note privée du carnet', getDoc(doc(equipe(), 'notesClient/idee-2')));
console.log('\n== Les axes d évolution');
const axe = (o = {}) => ({ plateforme: 'ios', titre: 'Widgets', description: 'Vos tâches sans ouvrir l app.', detail: '', apport: 'engagement', ampleur: 'moyen', etat: 'propose', publication: 'publiee', publieLe: null, ordre: 1, devis: '', reponse: null, cree: serverTimestamp(), maj: serverTimestamp(), ...o });
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  await setDoc(doc(b, 'projets/atelier/axes/a-pub'), axe());
  await setDoc(doc(b, 'projets/atelier/axes/a-brouillon'), axe({ publication: 'brouillon', titre: 'Dynamic Island' }));
  await setDoc(doc(b, 'projets/atelier/axes/a-livre'), axe({ etat: 'livre', titre: 'Mode sombre' }));
  await setDoc(doc(b, 'projets/atelier/axesIntro/texte'), { texte: 'Nos pistes.', maj: serverTimestamp() });
  /* Un projet à deux : Léa responsable, Camille collaboratrice. */
  await setDoc(doc(b, 'projets/duo'), { nom: 'Duo', ref: 'DUO', membres: [CAMILLE, LEA], roles: { [LEA]: 'responsable', [CAMILLE]: 'collaborateur' }, statut: 'en-cours', compteur: 0, ouvert: true });
  await setDoc(doc(b, 'projets/duo/axes/d1'), axe());
});
const reponseAxe = (choix, o = {}) => ({ reponse: { par: CAMILLE, nom: 'Camille', choix, demande: '', le: serverTimestamp(), ...o }, maj: serverTimestamp() });
await doit('L équipe crée un axe dans les bornes', setDoc(doc(equipe(), 'projets/atelier/axes/a-neuf'), axe({ plateforme: 'general' })));
await refuse('mais pas sur une plateforme inconnue', setDoc(doc(equipe(), 'projets/atelier/axes/a-x'), axe({ plateforme: 'montre' })));
await refuse('ni sans titre', setDoc(doc(equipe(), 'projets/atelier/axes/a-x'), axe({ titre: '' })));
await refuse('ni avec un champ inconnu', setDoc(doc(equipe(), 'projets/atelier/axes/a-x'), axe({ prix: 1200 })));
await refuse('ni avec une ampleur inconnue', setDoc(doc(equipe(), 'projets/atelier/axes/a-x'), axe({ ampleur: 'immense' })));
await doit('L équipe change l ordre et l état', updateDoc(doc(equipe(), 'projets/atelier/axes/a-neuf'), { ordre: 4, etat: 'prevu', maj: serverTimestamp() }));
await doit('Camille lit un axe publié', getDoc(doc(camille(), 'projets/atelier/axes/a-pub')));
await refuse('mais pas un brouillon', getDoc(doc(camille(), 'projets/atelier/axes/a-brouillon')));
await doit('Camille liste les axes publiés', getDocs(query(collection(camille(), 'projets/atelier/axes'), where('publication', '==', 'publiee'))));
await refuse('mais pas tous les axes', getDocs(collection(camille(), 'projets/atelier/axes')));
await refuse('Léa ne lit pas les axes de Atelier', getDoc(doc(lea(), 'projets/atelier/axes/a-pub')));
await refuse('Camille ne crée pas d axe', setDoc(doc(camille(), 'projets/atelier/axes/a-cliente'), axe()));
await refuse('ni ne réécrit le titre', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), { titre: 'Autre', maj: serverTimestamp() }));
await refuse('ni ne publie un brouillon', updateDoc(doc(camille(), 'projets/atelier/axes/a-brouillon'), { publication: 'publiee', maj: serverTimestamp() }));
await refuse('ni ne supprime un axe', deleteDoc(doc(camille(), 'projets/atelier/axes/a-pub')));
await doit('Camille, responsable, dit « Ça m intéresse »', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('interesse')));
await doit('puis « À prévoir »', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('a-prevoir')));
await doit('puis « On en parle », avec sa demande', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('en-parler', { demande: 't1' })));
await doit('et décoche : sa réponse s efface', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), { reponse: null, maj: serverTimestamp() }));
await refuse('un choix inconnu est refusé', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('pas-interesse')));
await refuse('une réponse au nom d un autre aussi', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('interesse', { par: LEA })));
await refuse('une date choisie par le client aussi', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('interesse', { le: Timestamp.fromDate(new Date('2020-01-01')) })));
await refuse('une clé de trop dans la réponse aussi', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), reponseAxe('interesse', { prix: 1 })));
await refuse('répondre en touchant l ordre aussi', updateDoc(doc(camille(), 'projets/atelier/axes/a-pub'), { ...reponseAxe('interesse'), ordre: 0 }));
await refuse('pas de réponse sur un axe déjà en place', updateDoc(doc(camille(), 'projets/atelier/axes/a-livre'), reponseAxe('interesse')));
await refuse('ni sur un brouillon', updateDoc(doc(camille(), 'projets/atelier/axes/a-brouillon'), reponseAxe('interesse')));
await refuse('Camille, collaboratrice sur Duo, lit sans répondre', updateDoc(doc(camille(), 'projets/duo/axes/d1'), reponseAxe('interesse')));
await doit('elle lit pourtant l axe publié de Duo', getDoc(doc(camille(), 'projets/duo/axes/d1')));
await doit('Léa, responsable de Duo, répond', updateDoc(doc(lea(), 'projets/duo/axes/d1'), { reponse: { par: LEA, nom: 'Léa', choix: 'interesse', demande: '', le: serverTimestamp() }, maj: serverTimestamp() }));
await refuse('Camille n efface pas la réponse de sa responsable', updateDoc(doc(camille(), 'projets/duo/axes/d1'), { reponse: null, maj: serverTimestamp() }));
await doit('Camille lit l introduction des axes', getDoc(doc(camille(), 'projets/atelier/axesIntro/texte')));
await refuse('mais ne l écrit pas', setDoc(doc(camille(), 'projets/atelier/axesIntro/texte'), { texte: 'Moi', maj: serverTimestamp() }));
await refuse('Léa ne la lit pas', getDoc(doc(lea(), 'projets/atelier/axesIntro/texte')));
await doit('L équipe écrit l introduction', setDoc(doc(equipe(), 'projets/atelier/axesIntro/texte'), { texte: 'Nos pistes pour vous.', maj: serverTimestamp() }));
await refuse('mais pas de mille et un caractères', setDoc(doc(equipe(), 'projets/atelier/axesIntro/texte'), { texte: 'x'.repeat(1001), maj: serverTimestamp() }));
await refuse('ni sous un autre nom de document', setDoc(doc(equipe(), 'projets/atelier/axesIntro/autre'), { texte: 'x', maj: serverTimestamp() }));
await doit('Camille ouvre une demande née d un axe', addDoc(collection(camille(), 'tickets'), demandeSuite({ axe: 'a-pub' })));
await refuse('mais l identifiant de l axe reste borné', addDoc(collection(camille(), 'tickets'), demandeSuite({ axe: 'x'.repeat(81) })));

console.log('\n== Le calculateur des axes et la demande de devis');
const photoPanier = () => ({ lignes: [{ axe: 'a-pub', titre: 'Widgets', plateforme: 'ios', jours: 3 }], jours: 3, long: true, tva: 20,
  periode: { debut: '2026-01-01', tjm: 380, ht: 1140, tva: 228, ttc: 1368 }, suivante: { debut: '2027-01-01', tjm: 420, ht: 1260, tva: 252, ttc: 1512 } });
const demandePanier = (o = {}) => ({ projet: 'atelier', type: 'devis', statut: 'demande', origine: 'panier', numero: '', libelle: 'Axes d évolution : Widgets', description: '', portee: 'complementaire',
  montant: null, tva: 20, ttc: null, date: serverTimestamp(), expiration: null, echeance: null, fichier: null, liens: [], reponse: null, archive: false,
  par: { uid: CAMILLE, nom: 'Camille' }, photo: photoPanier(), ...o });
await doit('Camille, responsable, garde son panier', setDoc(doc(camille(), `projets/atelier/paniers/${CAMILLE}`), { axes: ['a-pub'], maj: serverTimestamp() }));
await doit('et le relit', getDoc(doc(camille(), `projets/atelier/paniers/${CAMILLE}`)));
await refuse('pas avec une clé de trop', setDoc(doc(camille(), `projets/atelier/paniers/${CAMILLE}`), { axes: ['a-pub'], prix: 1, maj: serverTimestamp() }));
await refuse('ni au nom d une autre', setDoc(doc(camille(), `projets/atelier/paniers/${LEA}`), { axes: ['a-pub'], maj: serverTimestamp() }));
await refuse('ni avec plus de quarante axes', setDoc(doc(camille(), `projets/atelier/paniers/${CAMILLE}`), { axes: Array.from({ length: 41 }, (_, i) => `a${i}`), maj: serverTimestamp() }));
await refuse('Camille, collaboratrice sur Duo, n a pas de panier', setDoc(doc(camille(), `projets/duo/paniers/${CAMILLE}`), { axes: ['d1'], maj: serverTimestamp() }));
await refuse('Léa ne lit pas le panier de Camille', getDoc(doc(lea(), `projets/atelier/paniers/${CAMILLE}`)));
await refuse('l équipe non plus : il est à Camille', getDoc(doc(equipe(), `projets/atelier/paniers/${CAMILLE}`)));
await doit('Camille demande un devis : fiche, axe « À prévoir » et panier vidé d une seule écriture', (async () => {
  const db = camille();
  const b = writeBatch(db);
  b.set(doc(db, 'documents/dem-1'), demandePanier());
  b.update(doc(db, 'projets/atelier/axes/a-pub'), { reponse: { par: CAMILLE, nom: 'Camille', choix: 'a-prevoir', demande: '', devis: 'dem-1', le: serverTimestamp() }, maj: serverTimestamp() });
  b.delete(doc(db, `projets/atelier/paniers/${CAMILLE}`));
  await b.commit();
})());
await doit('elle lit sa demande', getDoc(doc(camille(), 'documents/dem-1')));
await refuse('une demande avec un montant est refusée', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ montant: 10 })));
await refuse('une demande déjà « envoyée » aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ statut: 'envoye' })));
await refuse('une demande au nom d une autre aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ par: { uid: LEA, nom: 'Léa' } })));
await refuse('une demande avec un PDF aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ fichier: { chemin: 'x' } })));
await refuse('une demande datée par le client aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ date: Timestamp.fromDate(new Date('2020-01-01')) })));
await refuse('une demande sans ligne aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ photo: { ...photoPanier(), lignes: [] } })));
await refuse('une facture créée par le client aussi', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ type: 'facture' })));
await refuse('Léa ne demande pas de devis sur Atelier', setDoc(doc(lea(), 'documents/dem-x'), demandePanier({ par: { uid: LEA, nom: 'Léa' } })));
await refuse('Camille, collaboratrice sur Duo, non plus', setDoc(doc(camille(), 'documents/dem-x'), demandePanier({ projet: 'duo' })));
await refuse('Camille ne retouche pas la photo', updateDoc(doc(camille(), 'documents/dem-1'), { 'photo.jours': 1 }));
await refuse('ni ne passe sa demande en « envoyé »', updateDoc(doc(camille(), 'documents/dem-1'), { statut: 'envoye' }));
await refuse('ni ne l accepte', updateDoc(doc(camille(), 'documents/dem-1'), { statut: 'accepte', reponse: { par: CAMILLE, nom: 'Camille', date: serverTimestamp(), commentaire: '' } }));
await refuse('ni n y pose un montant', updateDoc(doc(camille(), 'documents/dem-1'), { montant: 1 }));
await refuse('Léa ne l annule pas', updateDoc(doc(lea(), 'documents/dem-1'), { statut: 'annule', annuleLe: serverTimestamp() }));
await doit('Camille l annule, datée par le serveur', updateDoc(doc(camille(), 'documents/dem-1'), { statut: 'annule', annuleLe: serverTimestamp() }));
await refuse('une demande annulée ne revient pas', updateDoc(doc(camille(), 'documents/dem-1'), { statut: 'demande' }));
await refuse('un devis envoyé ne s annule pas côté client', updateDoc(doc(camille(), 'documents/d-perime'), { statut: 'annule', annuleLe: serverTimestamp() }));
console.log('\n== Les annonces de Capmedia');
const annonce = (o = {}) => ({
  type: 'information', titre: 'Nouveau : les applications de bureau', texte: 'Deux lignes.', dateEffet: '', publication: 'publiee', publieLe: serverTimestamp(),
  epinglee: false, cible: { tous: true, organisations: [], uids: [] }, tarif: null, indisponibilite: null, cree: serverTimestamp(), maj: serverTimestamp(), ...o,
});
const tarif = { texteLong: '', texteCourt: 'Votre projet {projet} : {evolution}.' };
const conge = { du: '2026-12-21', au: '2027-01-03', message: 'réponses sous 48 h' };
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const fixe = (o) => ({ ...annonce(o), publieLe: Timestamp.now(), cree: Timestamp.now(), maj: Timestamp.now() });
  await setDoc(doc(b, 'annonces/an-tous'), fixe({}));
  await setDoc(doc(b, 'annonces/an-camille'), fixe({ cible: { tous: false, organisations: ['atelier-nord'], uids: [CAMILLE] } }));
  await setDoc(doc(b, 'annonces/an-brouillon'), fixe({ publication: 'brouillon', publieLe: null }));
});
await doit('L administrateur crée une annonce dans les bornes', setDoc(doc(equipe(), 'annonces/an-neuve'), annonce()));
await doit('et une annonce « tarif » avec ses deux phrases', setDoc(doc(equipe(), 'annonces/an-tarif'), annonce({ type: 'tarif', dateEffet: '2027-01-01', tarif })));
await doit('ou sans phrase (celles de la page reviennent)', setDoc(doc(equipe(), 'annonces/an-tarif-nu'), annonce({ type: 'tarif', dateEffet: '2027-01-01' })));
await doit('et une indisponibilité avec sa période', setDoc(doc(equipe(), 'annonces/an-conge'), annonce({ type: 'indisponibilite', indisponibilite: conge })));
await refuse('mais pas de prix dans l annonce : ils vivent dans la grille', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ type: 'tarif', tarif: { ...tarif, tjmLong: 420 } })));
await refuse('ni des phrases de tarif sur une autre annonce', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ tarif })));
await refuse('ni une phrase de plus de 400 caractères', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ type: 'tarif', tarif: { ...tarif, texteLong: 'x'.repeat(401) } })));
await refuse('ni une période à l envers', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ type: 'indisponibilite', indisponibilite: { ...conge, au: '2026-12-01' } })));
await refuse('ni une date qui n en est pas une', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ dateEffet: 'lundi' })));
await refuse('ni un type inconnu', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ type: 'promo' })));
await refuse('ni sans titre', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ titre: '' })));
await refuse('ni un champ inconnu', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ couleur: 'rouge' })));
await refuse('ni une cible qui n est pas bornée', setDoc(doc(equipe(), 'annonces/an-x'), annonce({ cible: { tous: false, organisations: [], uids: [], role: 'admin' } })));
await doit('L administrateur épingle et retire', updateDoc(doc(equipe(), 'annonces/an-neuve'), { epinglee: true, publication: 'brouillon', publieLe: null, maj: serverTimestamp() }));
await doit('et supprime', deleteDoc(doc(equipe(), 'annonces/an-neuve')));
await doit('Camille lit une annonce pour tous', getDoc(doc(camille(), 'annonces/an-tous')));
await doit('et celle qui la nomme', getDoc(doc(camille(), 'annonces/an-camille')));
await refuse('mais pas un brouillon', getDoc(doc(camille(), 'annonces/an-brouillon')));
await refuse('Léa ne lit pas celle qui nomme Camille', getDoc(doc(lea(), 'annonces/an-camille')));
await doit('Camille liste les publiées pour tous', getDocs(query(collection(camille(), 'annonces'), where('publication', '==', 'publiee'), where('cible.tous', '==', true))));
await doit('et les publiées qui la nomment', getDocs(query(collection(camille(), 'annonces'), where('publication', '==', 'publiee'), where('cible.uids', 'array-contains', CAMILLE))));
await refuse('mais pas toutes les annonces', getDocs(collection(camille(), 'annonces')));
await refuse('ni les publiées sans dire lesquelles la visent', getDocs(query(collection(camille(), 'annonces'), where('publication', '==', 'publiee'))));
await refuse('ni celles qui nomment Léa', getDocs(query(collection(camille(), 'annonces'), where('publication', '==', 'publiee'), where('cible.uids', 'array-contains', LEA))));
await refuse('Un testeur ne lit pas une annonce pour tous', getDoc(doc(karim(), 'annonces/an-tous')));
await refuse('Un anonyme non plus', getDoc(doc(anonyme(), 'annonces/an-tous')));
await refuse('Camille n écrit pas d annonce', setDoc(doc(camille(), 'annonces/an-cliente'), annonce()));
await refuse('ni ne retouche un titre', updateDoc(doc(camille(), 'annonces/an-tous'), { titre: 'Autre', maj: serverTimestamp() }));
await refuse('ni ne supprime une annonce', deleteDoc(doc(camille(), 'annonces/an-tous')));
await refuse('ni ne lit les marques de notification', getDoc(doc(camille(), 'annoncesNotifiees/an-tous')));
await doit('Camille marque ses annonces lues (une date)', setDoc(doc(camille(), `profils/${CAMILLE}`), { annoncesLues: serverTimestamp(), maj: serverTimestamp() }, { merge: true }));
await refuse('mais pas autre chose qu une date', setDoc(doc(camille(), `profils/${CAMILLE}`), { annoncesLues: ['an-tous'] }, { merge: true }));
await refuse('ni dans le profil de Léa', setDoc(doc(camille(), `profils/${LEA}`), { annoncesLues: serverTimestamp() }, { merge: true }));
await doit('Camille lit l introduction des annonces', getDoc(doc(camille(), 'reglages/annonces')));
await refuse('mais ne l écrit pas', setDoc(doc(camille(), 'reglages/annonces'), { intro: 'Moi', maj: serverTimestamp() }));
await doit('L administrateur écrit l introduction', setDoc(doc(equipe(), 'reglages/annonces'), { intro: 'Nos nouvelles.', maj: serverTimestamp() }));
await refuse('mais pas plus de 600 caractères', setDoc(doc(equipe(), 'reglages/annonces'), { intro: 'x'.repeat(601), maj: serverTimestamp() }));
const grilleTarifs = { seuilMois: 3, tva: 20, devise: 'EUR', periodes: [{ debut: '2026-01-01', long: 380, court: 420 }, { debut: '2027-01-01', long: 420, court: 480 }], maj: serverTimestamp() };
await doit('L administrateur écrit la grille de tarifs', setDoc(doc(equipe(), 'reglages/tarifs'), grilleTarifs));
await doit('Camille lit la grille (l encart de l annonce en a besoin)', getDoc(doc(camille(), 'reglages/tarifs')));
await refuse('mais ne l écrit pas', setDoc(doc(camille(), 'reglages/tarifs'), grilleTarifs));
await refuse('Un anonyme ne la lit pas', getDoc(doc(anonyme(), 'reglages/tarifs')));
await refuse('Une grille avec un champ inconnu est refusée', setDoc(doc(equipe(), 'reglages/tarifs'), { ...grilleTarifs, remise: 5 }));

/* ==========================================================================
   La messagerie d'un projet (octobre 2026) : réagir, répondre, modifier,
   supprimer.
   ========================================================================== */
console.log('\n== La messagerie : réagir, répondre, modifier, supprimer');
const msg = (contexte, id) => doc(contexte, `projets/atelier/messages/${id}`);
const deCamille = { uid: CAMILLE, nom: 'Camille', cote: 'client' };
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  /* Un message de Camille écrit il y a vingt minutes : trop tard pour le
     corriger, jamais trop tard pour le supprimer. */
  await setDoc(doc(b, 'projets/atelier/messages/m-vieux'), { de: deCamille, texte: 'Ancien', pieces: [{ nom: 'v.png', chemin: 'projets/atelier/messages/v.png', taille: 1, type: 'image/png' }], date: Timestamp.fromDate(new Date(Date.now() - 20 * 60000)) });
  await setDoc(doc(b, 'projets/atelier/messages/m-equipe'), { de: { uid: AGENT, nom: 'Agent', cote: 'equipe' }, texte: 'Une question ?', pieces: [], date: Timestamp.fromDate(new Date(Date.now() - 60000)) });
});
await doit('Camille écrit un message (heure du serveur)', setDoc(msg(camille(), 'm-camille'), { de: deCamille, texte: 'Bonjour à tous', pieces: [], date: serverTimestamp() }));
await refuse('mais pas avec une date choisie (elle rouvrirait la fenêtre de modification)', setDoc(msg(camille(), 'm-date'), { de: deCamille, texte: 'x', pieces: [], date: Timestamp.fromDate(new Date(Date.now() + 3600000)) }));
await doit('Camille répond en citant un message', setDoc(msg(camille(), 'm-reponse'), { de: deCamille, texte: 'Oui, bien sûr', pieces: [], date: serverTimestamp(), reponseA: { id: 'm-equipe', nom: 'Agent', extrait: 'Une question ?' } }));
await refuse('une citation ne porte rien d autre que id, nom, extrait', setDoc(msg(camille(), 'm-reponse-2'), { de: deCamille, texte: 'x', pieces: [], date: serverTimestamp(), reponseA: { id: 'm-equipe', nom: 'Agent', extrait: 'x', texte: 'tout le message' } }));
await refuse('ni un extrait de plus de 200 caractères', setDoc(msg(camille(), 'm-reponse-3'), { de: deCamille, texte: 'x', pieces: [], date: serverTimestamp(), reponseA: { id: 'm-equipe', nom: 'Agent', extrait: 'x'.repeat(201) } }));
await refuse('un message ne naît pas avec des réactions', setDoc(msg(camille(), 'm-reac'), { de: deCamille, texte: 'x', pieces: [], date: serverTimestamp(), reactions: { [`pouce_${AGENT}`]: 'Agent' } }));

await doit('Camille réagit au message de l équipe', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.pouce_${CAMILLE}`]: 'Camille' }));
await doit('et ajoute un second emoji', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.coeur_${CAMILLE}`]: 'Camille' }));
await doit('l équipe réagit au même message', updateDoc(msg(equipe(), 'm-equipe'), { [`reactions.pouce_${AGENT}`]: 'Agent' }));
await doit('Camille retire sa réaction (bascule)', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.coeur_${CAMILLE}`]: deleteField() }));
await refuse('Camille ne retire pas la réaction de l équipe', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.pouce_${AGENT}`]: deleteField() }));
await refuse('ni ne réagit au nom de l équipe', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.rire_${AGENT}`]: 'Agent' }));
await refuse('ni avec un emoji hors de la palette', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.feu_${CAMILLE}`]: 'Camille' }));
await refuse('ni avec autre chose qu un nom', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.rire_${CAMILLE}`]: true }));
await refuse('une réaction ne glisse pas une retouche du texte', updateDoc(msg(camille(), 'm-equipe'), { [`reactions.rire_${CAMILLE}`]: 'Camille', texte: 'Autre chose' }));
await refuse('Léa ne réagit pas dans la conversation d Atelier', updateDoc(msg(lea(), 'm-equipe'), { [`reactions.pouce_${LEA}`]: 'Léa' }));

await doit('Camille corrige son message dans les quinze minutes', updateDoc(msg(camille(), 'm-camille'), { texte: 'Bonjour à toutes et à tous', modifie: serverTimestamp() }));
await refuse('mais pas sans la marque « modifié » du serveur', updateDoc(msg(camille(), 'm-camille'), { texte: 'Encore' }));
await refuse('ni en changeant son auteur', updateDoc(msg(camille(), 'm-camille'), { texte: 'Encore', modifie: serverTimestamp(), de: { uid: CAMILLE, nom: 'Capmedia', cote: 'client' } }));
await refuse('ni en déplaçant sa date', updateDoc(msg(camille(), 'm-camille'), { texte: 'Encore', modifie: serverTimestamp(), date: serverTimestamp() }));
await refuse('ni en le vidant', updateDoc(msg(camille(), 'm-camille'), { texte: '', modifie: serverTimestamp() }));
await refuse('Camille ne corrige plus un message de vingt minutes', updateDoc(msg(camille(), 'm-vieux'), { texte: 'Corrigé trop tard', modifie: serverTimestamp() }));
await refuse('L équipe ne modifie pas le message de Camille', updateDoc(msg(equipe(), 'm-camille'), { texte: 'Réécrit par l équipe', modifie: serverTimestamp() }));
await refuse('Camille ne modifie pas le message de l équipe', updateDoc(msg(camille(), 'm-equipe'), { texte: 'Réécrit par Camille', modifie: serverTimestamp() }));

const suppression = { texte: '', pieces: [], supprime: serverTimestamp(), reactions: deleteField(), reponseA: deleteField() };
await refuse('L équipe ne supprime pas le message de Camille', updateDoc(msg(equipe(), 'm-camille'), suppression));
await refuse('Camille ne supprime pas le message de l équipe', updateDoc(msg(camille(), 'm-equipe'), suppression));
await refuse('personne n efface un message pour de bon (même l auteur)', deleteDoc(msg(camille(), 'm-camille')));
await refuse('ni l équipe', deleteDoc(msg(equipe(), 'm-camille')));
await refuse('une suppression ne garde pas le texte', updateDoc(msg(camille(), 'm-camille'), { pieces: [], supprime: serverTimestamp() }));
await refuse('ni les pièces', updateDoc(msg(camille(), 'm-vieux'), { texte: '', supprime: serverTimestamp() }));
await doit('Camille supprime son message de vingt minutes (toujours permis)', updateDoc(msg(camille(), 'm-vieux'), suppression));
await doit('et son message récent', updateDoc(msg(camille(), 'm-camille'), suppression));
await refuse('un message supprimé ne se corrige plus', updateDoc(msg(camille(), 'm-camille'), { texte: 'Revenu', modifie: serverTimestamp() }));
await refuse('ne reçoit plus de réaction', updateDoc(msg(equipe(), 'm-camille'), { [`reactions.pouce_${AGENT}`]: 'Agent' }));
await refuse('et ne se « supprime » pas une seconde fois', updateDoc(msg(camille(), 'm-camille'), suppression));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
