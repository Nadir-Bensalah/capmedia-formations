/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles de la Gate 2 à l'épreuve

   La matrice des accès, contre les vraies règles Firestore, sur l'émulateur :
   équipe (administrateur, agent autorisé ou non, membre désactivé), client
   (responsable, collaborateur, même société sans le projet, deux projets
   sur trois, accès retiré, projet fermé), testeur (campagne assignée ou
   non, testeur retiré). Chaque ligne est un droit attendu ou un abus.

   Les sessions « anciennes » sont des jetons qui portent encore ce qu'ils
   portaient avant le retrait : les règles doivent relire la base, pas le
   jeton.

     (émulateur Firestore)
     node fonctions-suivi/outils/regles-gate2.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, collectionGroup, query, where, serverTimestamp } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: `${PROJET}-g2`,
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const jeton = (uid, extra = {}) => ({ email: `${uid}@exemple.test`, email_verified: true, sub: uid, ...extra });
const qui = (uid, extra) => env.authenticatedContext(uid, jeton(uid, extra)).firestore();
const ADMIN = qui('g2-admin', { equipe: true });
const AGENT = qui('g2-agent', { equipe: true });
const AGENT_B = qui('g2-agent-b', { equipe: true });
/* Désactivé : son jeton porte encore « equipe », sa fiche dit « inactif ». */
const INACTIF = qui('g2-inactif', { equipe: true });
const RESP = qui('g2-resp', { projets: ['pa'] });
const COLLAB = qui('g2-collab', { projets: ['pa'] });
const MEME_SOCIETE = qui('g2-voisin', { projets: ['pb'] });
const MULTI = qui('g2-multi', { projets: ['pa', 'pc'] });
/* Retiré du projet A : son jeton porte encore « pa ». */
const RETIRE = qui('g2-retire', { projets: ['pa'] });
const PREPARE = qui('g2-prepare', {});
const T1 = qui('g2-t1', { testeur: true });
const T2 = qui('g2-t2', { testeur: true });
const T_RETIRE = qui('g2-t-retire', { testeur: true });

let ok = 0; const ecarts = [];
const doit = async (l, p) => { try { await assertSucceeds(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (refusé à tort)'); } };
const refuse = async (l, p) => { try { await assertFails(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (AUTORISÉ À TORT)'); } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const s = (chemin, d) => setDoc(doc(b, chemin), d);
  await s('equipe/g2-admin', { nom: 'Admin', role: 'admin', actif: true });
  await s('equipe/g2-agent', { nom: 'Agent', role: 'agent', actif: true, projets: ['pa'] });
  await s('equipe/g2-agent-b', { nom: 'Agent B', role: 'agent', actif: true, projets: ['pb'] });
  await s('equipe/g2-inactif', { nom: 'Ancien', role: 'admin', actif: false });
  await s('organisations/o1', { nom: 'Société', membres: ['g2-resp', 'g2-collab', 'g2-voisin', 'g2-multi'] });
  await s('organisationsInternes/o1', { notesInternes: 'commercial' });
  await s('projets/pa', { nom: 'A', ref: 'A', statut: 'en-cours', organisation: 'o1', ouvert: true, compteur: 0,
    membres: ['g2-resp', 'g2-collab', 'g2-multi'], roles: { 'g2-resp': 'responsable', 'g2-collab': 'collaborateur', 'g2-multi': 'collaborateur' }, personnes: ['g2-resp', 'g2-collab', 'g2-multi'] });
  await s('projets/pb', { nom: 'B', ref: 'B', statut: 'en-cours', organisation: 'o1', ouvert: true, compteur: 0, membres: ['g2-voisin'], roles: { 'g2-voisin': 'responsable' } });
  await s('projets/pc', { nom: 'C', ref: 'C', statut: 'en-cours', organisation: 'o1', ouvert: true, compteur: 0, membres: ['g2-multi'], roles: { 'g2-multi': 'responsable' } });
  await s('projets/pf', { nom: 'Fermé', ref: 'F', statut: 'brouillon', organisation: 'o1', ouvert: false, compteur: 0, membres: [], roles: {}, personnes: ['g2-prepare'] });
  await s('projets/pa/interlocuteurs/k1', { email: 'g2-resp@exemple.test', uid: 'g2-resp', role: 'responsable', statut: 'actif' });
  await s('projetsInternes/pa', { sante: 'ok' });
  await s('budgets/pa', { budget: 1000, budgetNote: 'forfait' });
  await s('projets/pa/jalons/j1', { projet: 'pa', titre: 'Étape', statut: 'en-cours' });
  await s('projets/pb/jalons/j1', { projet: 'pb', titre: 'Étape B', statut: 'en-cours' });
  await s('projets/pa/scenarios/DI-1', { ref: 'DI-1', titre: 'Scénario' });
  await s('projets/pa/campagnes/c1', { titre: 'Campagne', statut: 'en-cours', testeurs: ['g2-t1', 'g2-t-retire'] });
  await s('testeurs/g2-t1', { prenom: 'T1', actif: true, projets: ['pa'] });
  await s('testeurs/g2-t2', { prenom: 'T2', actif: true, projets: [] });
  await s('testeurs/g2-t-retire', { prenom: 'T3', actif: false, projets: ['pa'] });
  await s('tickets/ta', { projet: 'pa', numero: 'A-001', titre: 'x', statut: 'nouveau', urgence: 'important', auteur: { uid: 'g2-resp' }, lu: {} });
  await s('tickets/tb', { projet: 'pb', numero: 'B-001', titre: 'y', statut: 'nouveau', urgence: 'important', auteur: { uid: 'g2-voisin' }, lu: {} });
  await s('tickets/ta/messages/m1', { de: { uid: 'g2-admin', cote: 'equipe' }, texte: 'bonjour', interne: false, pieces: [] });
  await s('taches/tache-a', { projet: 'pa', titre: 'Tâche', statut: 'a-faire', priorite: 'normale', visibilite: 'client' });
  await s('taches/tache-a-interne', { projet: 'pa', titre: 'Interne', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' });
  await s('taches/tache-b', { projet: 'pb', titre: 'Tâche B', statut: 'a-faire', priorite: 'normale', visibilite: 'client' });
  await s('documents/devis-a', { projet: 'pa', type: 'devis', numero: 'D-1', montant: 100, statut: 'envoye', reponse: null });
  await s('documents/devis-a2', { projet: 'pa', type: 'devis', numero: 'D-2', montant: 100, statut: 'envoye', reponse: null });
  await s('documents/facture-a', { projet: 'pa', type: 'facture', numero: 'F-1', montant: 100, statut: 'a-payer' });
  await s('documents/devis-b', { projet: 'pb', type: 'devis', numero: 'D-B', montant: 100, statut: 'envoye', reponse: null });
  await s('paiements/pay-a', { projet: 'pa', facture: 'facture-a', montant: 50 });
  await s('validations/v-ordinaire', { projet: 'pa', titre: 'Ordinaire', statut: 'en-attente', reponse: null });
  await s('validations/v-reservee', { projet: 'pa', titre: 'Réservée', statut: 'en-attente', reponse: null, reserveeResponsable: true });
  await s('validations/v-reservee-2', { projet: 'pa', titre: 'Réservée 2', statut: 'en-attente', reponse: null, reserveeResponsable: true });
  await s('activite/act-client', { projet: 'pa', type: 'tache', texte: 'x', visibilite: 'client' });
  await s('activite/act-finance', { projet: 'pa', type: 'paiement', texte: 'a enregistré un paiement de 50 €', visibilite: 'responsable' });
  await s('activite/act-interne', { projet: 'pa', type: 'tache', texte: 'x', visibilite: 'interne' });
  await s('audit/au1', { action: 'x' });
  await s('demandesProjet/dp1', { par: { uid: 'g2-voisin' }, titre: 'Nouveau', statut: 'nouvelle' });
});

const lire = (db, chemin) => getDoc(doc(db, chemin));
const docsVisibles = (visibilites) => query(collection(RESP, 'activite'), where('projet', '==', 'pa'), where('visibilite', 'in', visibilites));
const reponse = (uid) => ({ par: uid, nom: uid, date: serverTimestamp(), commentaire: '' });

console.log('\n== Équipe : administrateur');
await doit('lit tous les projets (liste)', getDocs(collection(ADMIN, 'projets')));
await doit('lit un projet dont il n est pas l agent', lire(ADMIN, 'projets/pb'));
await doit('lit les notes internes commerciales', lire(ADMIN, 'organisationsInternes/o1'));
await doit('lit l audit', lire(ADMIN, 'audit/au1'));
await doit('lit les demandes de nouveaux projets', lire(ADMIN, 'demandesProjet/dp1'));
await doit('lit toutes les étapes en groupe', getDocs(collectionGroup(ADMIN, 'jalons')));
await doit('change le nom d un projet', updateDoc(doc(ADMIN, 'projets/pa'), { nom: 'A bis' }));
await refuse('mais pas ses membres (le serveur seul)', updateDoc(doc(ADMIN, 'projets/pa'), { membres: ['g2-admin'] }));
await refuse('ni ses rôles', updateDoc(doc(ADMIN, 'projets/pa'), { roles: { 'g2-collab': 'responsable' } }));
await refuse('ni son ouverture', updateDoc(doc(ADMIN, 'projets/pa'), { ouvert: false }));
await refuse('ni les e-mails du client (tracés par le serveur)', updateDoc(doc(ADMIN, 'projets/pa'), { emailsClient: 'coupes' }));
await refuse('ni n écrit un interlocuteur', setDoc(doc(ADMIN, 'projets/pa/interlocuteurs/k2'), { email: 'x@exemple.test', role: 'responsable', statut: 'actif' }));

console.log('\n== Équipe : agent autorisé sur A');
await doit('lit le projet A', lire(AGENT, 'projets/pa'));
await doit('lit les demandes de A', getDocs(query(collection(AGENT, 'tickets'), where('projet', '==', 'pa'))));
await doit('lit les tâches internes de A', lire(AGENT, 'taches/tache-a-interne'));
await doit('lit les interlocuteurs de A', getDocs(collection(AGENT, 'projets/pa/interlocuteurs')));
await doit('lit la santé de A', lire(AGENT, 'projetsInternes/pa'));
await refuse('ne lit PAS le budget de A (finance)', lire(AGENT, 'budgets/pa'));
await refuse('ne lit PAS les devis de A sans « finance.lecture »', lire(AGENT, 'documents/devis-a'));
await doit('crée une tâche sur A', addDoc(collection(AGENT, 'taches'), { projet: 'pa', titre: 'Nouvelle', statut: 'a-faire', priorite: 'normale', visibilite: 'client' }));
await doit('tient l avancement de A', updateDoc(doc(AGENT, 'projets/pa'), { pulse: { enCours: 'x' } }));
await doit('règle la santé de A', setDoc(doc(AGENT, 'projetsInternes/pa'), { sante: 'attention' }, { merge: true }));
await doit('répond sur une demande de A', addDoc(collection(AGENT, 'tickets/ta/messages'), { de: { uid: 'g2-agent', nom: 'Agent', cote: 'equipe' }, texte: 'réponse', pieces: [], interne: false, date: serverTimestamp() }));
await doit('lit l équipe (qui est qui)', getDocs(collection(AGENT, 'equipe')));
await refuse('ne change pas le nom du projet (identité : administrateur)', updateDoc(doc(AGENT, 'projets/pa'), { nom: 'Renommé' }));
await refuse('ne range pas le projet en interne', updateDoc(doc(AGENT, 'projets/pa'), { interne: true }));
await refuse('ne touche pas au budget', setDoc(doc(AGENT, 'projetsInternes/pa'), { budget: 1 }, { merge: true }));

console.log('\n== Équipe : agent NON autorisé sur A (autorisé sur B)');
await refuse('ne lit pas le projet A', lire(AGENT_B, 'projets/pa'));
await refuse('ne lit pas les demandes de A', getDocs(query(collection(AGENT_B, 'tickets'), where('projet', '==', 'pa'))));
await refuse('ni une demande de A par son adresse', lire(AGENT_B, 'tickets/ta'));
await refuse('ni les tâches de A', lire(AGENT_B, 'taches/tache-a'));
await refuse('ni les devis de A', lire(AGENT_B, 'documents/devis-a'));
await refuse('ni les interlocuteurs de A', getDocs(collection(AGENT_B, 'projets/pa/interlocuteurs')));
await refuse('ni la santé de A', lire(AGENT_B, 'projetsInternes/pa'));
await refuse('ne crée pas de tâche sur A', addDoc(collection(AGENT_B, 'taches'), { projet: 'pa', titre: 'Intruse', statut: 'a-faire', priorite: 'normale', visibilite: 'client' }));
await refuse('ne lit pas la liste de tous les projets', getDocs(collection(AGENT_B, 'projets')));
await refuse('ne lit pas les étapes de tous les projets en groupe', getDocs(collectionGroup(AGENT_B, 'jalons')));
await refuse('ne lit pas les notes commerciales', lire(AGENT_B, 'organisationsInternes/o1'));
await refuse('ni l audit', lire(AGENT_B, 'audit/au1'));
await refuse('ni les demandes de nouveaux projets', lire(AGENT_B, 'demandesProjet/dp1'));
await doit('mais lit son projet B', lire(AGENT_B, 'projets/pb'));

console.log('\n== Équipe : membre désactivé (session encore ouverte)');
await refuse('ne lit plus aucun projet', lire(INACTIF, 'projets/pa'));
await refuse('ni la liste des projets', getDocs(collection(INACTIF, 'projets')));
await refuse('ni une demande', lire(INACTIF, 'tickets/ta'));
await refuse('ni l audit', lire(INACTIF, 'audit/au1'));
await refuse('ni la liste de l équipe', getDocs(collection(INACTIF, 'equipe')));
await refuse('n écrit plus rien', addDoc(collection(INACTIF, 'taches'), { projet: 'pa', titre: 'X', statut: 'a-faire', priorite: 'normale', visibilite: 'client' }));
await refuse('ne se fait pas passer pour l équipe dans un message', addDoc(collection(INACTIF, 'projets/pa/messages'), { de: { uid: 'g2-inactif', nom: 'X', cote: 'equipe' }, texte: 'x', pieces: [], date: serverTimestamp() }));

console.log('\n== Client : responsable du projet A');
await doit('lit son projet', lire(RESP, 'projets/pa'));
await doit('lit ses devis (requête des statuts visibles)', getDocs(query(collection(RESP, 'documents'), where('projet', '==', 'pa'), where('statut', 'in', ['envoye', 'consulte', 'accepte', 'refuse', 'a-payer', 'payee']))));
await doit('lit ses paiements', getDocs(query(collection(RESP, 'paiements'), where('projet', '==', 'pa'))));
await doit('lit l activité, finance comprise', getDocs(docsVisibles(['client', 'responsable'])));
await doit('accepte un devis', updateDoc(doc(RESP, 'documents/devis-a'), { statut: 'accepte', reponse: reponse('g2-resp') }));
await doit('répond à une validation réservée', updateDoc(doc(RESP, 'validations/v-reservee'), { statut: 'approuvee', reponse: reponse('g2-resp') }));
await refuse('ne lit pas les interlocuteurs (équipe seule)', getDocs(collection(RESP, 'projets/pa/interlocuteurs')));
await refuse('ne lit pas l activité interne', lire(RESP, 'activite/act-interne'));

console.log('\n== Client : collaborateur du projet A');
await doit('lit le projet', lire(COLLAB, 'projets/pa'));
await doit('lit les demandes', getDocs(query(collection(COLLAB, 'tickets'), where('projet', '==', 'pa'))));
await doit('crée une demande', addDoc(collection(COLLAB, 'tickets'), {
  numero: null, projet: 'pa', composant: '', titre: 'Une demande', description: 'Détail', type: 'bug', urgence: 'important', statut: 'nouveau',
  plateforme: '', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null,
  auteur: { uid: 'g2-collab', nom: 'Collab', email: 'g2-collab@exemple.test', cote: 'client' }, pieces: [], archive: false,
  cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: {}, qualification: null, devis: null,
}));
await doit('écrit dans la conversation', addDoc(collection(COLLAB, 'projets/pa/messages'), { de: { uid: 'g2-collab', nom: 'Collab', cote: 'client' }, texte: 'bonjour', pieces: [], date: serverTimestamp() }));
await doit('répond à une validation ordinaire', updateDoc(doc(COLLAB, 'validations/v-ordinaire'), { statut: 'approuvee', reponse: reponse('g2-collab') }));
await doit('lit l activité publique du projet', getDocs(query(collection(COLLAB, 'activite'), where('projet', '==', 'pa'), where('visibilite', '==', 'client'))));
await refuse('ne répond pas à une validation réservée au responsable', updateDoc(doc(COLLAB, 'validations/v-reservee-2'), { statut: 'approuvee', reponse: reponse('g2-collab') }));
await refuse('ne lit pas un devis', lire(COLLAB, 'documents/devis-a2'));
await refuse('ne lit pas la liste des pièces comptables', getDocs(query(collection(COLLAB, 'documents'), where('projet', '==', 'pa'), where('statut', 'in', ['envoye', 'a-payer']))));
await refuse('n accepte pas un devis, même en écrivant directement', updateDoc(doc(COLLAB, 'documents/devis-a2'), { statut: 'accepte', reponse: reponse('g2-collab') }));
await refuse('ne le passe même pas en « consulté »', updateDoc(doc(COLLAB, 'documents/devis-a2'), { statut: 'consulte' }));
await refuse('ne lit pas les paiements', lire(COLLAB, 'paiements/pay-a'));
await refuse('ne lit pas une ligne d activité financière', lire(COLLAB, 'activite/act-finance'));
await refuse('ni ne la demande par une requête', getDocs(query(collection(COLLAB, 'activite'), where('projet', '==', 'pa'), where('visibilite', 'in', ['client', 'responsable']))));

console.log('\n== Client : même société, sans accès au projet A');
await refuse('ne lit pas le projet A', lire(MEME_SOCIETE, 'projets/pa'));
await refuse('ni ses demandes', getDocs(query(collection(MEME_SOCIETE, 'tickets'), where('projet', '==', 'pa'))));
await refuse('ni une demande par son adresse', lire(MEME_SOCIETE, 'tickets/ta'));
await refuse('ne crée pas de demande sur A', addDoc(collection(MEME_SOCIETE, 'tickets'), {
  numero: null, projet: 'pa', composant: '', titre: 'Intrusion', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau',
  plateforme: '', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null,
  auteur: { uid: 'g2-voisin', nom: 'V', email: 'g2-voisin@exemple.test', cote: 'client' }, pieces: [], archive: false,
  cree: serverTimestamp(), maj: serverTimestamp(), resolu: null, lu: {}, qualification: null, devis: null,
}));
await doit('lit la fiche de sa société (sans y gagner d accès)', lire(MEME_SOCIETE, 'organisations/o1'));
await doit('lit son propre projet B', lire(MEME_SOCIETE, 'projets/pb'));

console.log('\n== Client : accès à A et C, pas à B');
await doit('lit A', lire(MULTI, 'projets/pa'));
await doit('lit C', lire(MULTI, 'projets/pc'));
await refuse('ne lit pas B', lire(MULTI, 'projets/pb'));
await refuse('ni les demandes de B', lire(MULTI, 'tickets/tb'));
await refuse('ni les devis de B', lire(MULTI, 'documents/devis-b'));
await doit('ses projets par la requête des membres : A et C', getDocs(query(collection(MULTI, 'projets'), where('membres', 'array-contains', 'g2-multi'))));

console.log('\n== Client : accès retiré (session encore ouverte)');
await refuse('ne lit plus le projet', lire(RETIRE, 'projets/pa'));
await refuse('ni ses demandes', getDocs(query(collection(RETIRE, 'tickets'), where('projet', '==', 'pa'))));
await refuse('ni la conversation', getDocs(collection(RETIRE, 'projets/pa/messages')));
await refuse('n écrit plus dans la conversation', addDoc(collection(RETIRE, 'projets/pa/messages'), { de: { uid: 'g2-retire', nom: 'R', cote: 'client' }, texte: 'encore là', pieces: [], date: serverTimestamp() }));

console.log('\n== Client : préparé sur un projet fermé');
await refuse('ne lit pas le projet fermé', lire(PREPARE, 'projets/pf'));
await refuse('ni ses étapes', getDocs(collection(PREPARE, 'projets/pf/jalons')));

console.log('\n== Testeur');
await doit('lit sa campagne', lire(T1, 'projets/pa/campagnes/c1'));
await doit('lit un scénario de son projet', lire(T1, 'projets/pa/scenarios/DI-1'));
await doit('consigne son passage', setDoc(doc(T1, 'projets/pa/campagnes/c1/passages/g2-t1__DI-1'), { scenario: 'DI-1', testeur: 'g2-t1', plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));
await refuse('ne lit pas le projet', lire(T1, 'projets/pa'));
await refuse('ni ses demandes', lire(T1, 'tickets/ta'));
await refuse('ni ses devis (commercial)', lire(T1, 'documents/devis-a'));
await refuse('ni les données internes', lire(T1, 'projetsInternes/pa'));
await refuse('ni les interlocuteurs', getDocs(collection(T1, 'projets/pa/interlocuteurs')));
await refuse('ni l équipe', getDocs(collection(T1, 'equipe')));
await refuse('Un testeur non assigné ne lit pas la campagne', lire(T2, 'projets/pa/campagnes/c1'));
await refuse('ni le scénario', lire(T2, 'projets/pa/scenarios/DI-1'));
await refuse('Un testeur retiré (session ouverte) ne lit plus sa campagne', lire(T_RETIRE, 'projets/pa/campagnes/c1'));
await refuse('ni ne consigne de passage', setDoc(doc(T_RETIRE, 'projets/pa/campagnes/c1/passages/g2-t-retire__DI-1'), { scenario: 'DI-1', testeur: 'g2-t-retire', plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
