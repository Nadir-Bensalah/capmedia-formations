/* ==========================================================================
   CAPMEDIA CLIENT HUB · la matrice des permissions (préflight Gate 2)

   Pas des parcours heureux : une grille. Chaque catégorie de personne
   passe devant CHAQUE opération (lecture et écriture), et la politique
   attendue est écrite ici, en clair, indépendamment des règles. Une case
   autorisée à tort est une permission accidentelle ; une case refusée à
   tort, une fonction cassée. Les deux font échouer l'épreuve.

   Chaque catégorie part d'une base neuve : une écriture permise à l'une
   ne fausse pas la suivante.

     (émulateur Firestore)
     node fonctions-suivi/outils/matrice-gate2.test.mjs [--tableau]
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: `${PROJET}-matrice`,
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const TABLEAU = process.argv.includes('--tableau');

/* ---- Les personnes --------------------------------------------------- */
const CATEGORIES = [
  ['admin', 'Administrateur', { equipe: true }],
  ['agent-a', 'Agent du projet A', { equipe: true }],
  ['agent-b', 'Agent hors projet A', { equipe: true }],
  ['agent-fin', 'Agent A avec finance.lecture', { equipe: true }],
  ['inactif', 'Administrateur désactivé', { equipe: true }],
  ['resp', 'Responsable de A', { projets: ['pa'] }],
  ['collab', 'Collaborateur de A', { projets: ['pa'] }],
  ['voisin', 'Même société, sans accès à A', { projets: ['pb'] }],
  ['retire', 'Retiré de A (jeton d avant)', { projets: ['pa'] }],
  ['adefinir', 'Contact de A, rôle à définir', {}],
  ['t-assigne', 'Testeur assigné sur A', { testeur: true }],
  ['t-autre', 'Testeur non assigné', { testeur: true }],
];

const semer = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const b = ctx.firestore();
    const s = (c, d) => setDoc(doc(b, c), d);
    await s('equipe/admin', { nom: 'Admin', email: 'admin@exemple.test', role: 'admin', actif: true });
    await s('equipe/agent-a', { nom: 'Agent A', email: 'agent-a@exemple.test', role: 'agent', actif: true, projets: ['pa'] });
    await s('equipe/agent-b', { nom: 'Agent B', email: 'agent-b@exemple.test', role: 'agent', actif: true, projets: ['pz'] });
    await s('equipe/agent-fin', { nom: 'Agent finance', email: 'agent-fin@exemple.test', role: 'agent', actif: true, projets: ['pa'], permissions: ['finance.lecture'] });
    await s('equipe/inactif', { nom: 'Ancien', email: 'inactif@exemple.test', role: 'admin', actif: false });
    await s('organisations/o1', { nom: 'Société A', membres: ['resp', 'collab', 'voisin'], projets: ['pa', 'pb'], contacts: [{ nom: 'R', email: 'resp@exemple.test' }] });
    await s('organisations/o2', { nom: 'Société Z', membres: [], projets: ['pz'] });
    await s('organisationsInternes/o1', { notesInternes: 'commercial' });
    const commun = { statut: 'en-cours', compteur: 1, ouvert: true, emailsClient: 'actifs', accesVersion: 2 };
    await s('projets/pa', { nom: 'A', ref: 'A', organisation: 'o1', ...commun,
      membres: ['resp', 'collab'], roles: { resp: 'responsable', collab: 'collaborateur' }, personnes: ['resp', 'collab', 'adefinir'] });
    await s('projets/pb', { nom: 'B', ref: 'B', organisation: 'o1', ...commun, membres: ['voisin'], roles: { voisin: 'responsable' }, personnes: ['voisin'] });
    await s('projets/pz', { nom: 'Z', ref: 'Z', organisation: 'o2', ...commun, membres: [], roles: {}, personnes: [] });
    await s('projets/pa/interlocuteurs/k-resp', { email: 'resp@exemple.test', uid: 'resp', role: 'responsable', statut: 'actif' });
    await s('projets/pa/interlocuteurs/k-retire', { email: 'retire@exemple.test', uid: 'retire', role: 'collaborateur', statut: 'retire' });
    await s('projets/pa/interlocuteurs/k-adefinir', { email: 'adefinir@exemple.test', uid: 'adefinir', role: 'a-definir', statut: 'actif' });
    await s('projetsInternes/pa', { sante: 'ok', rolesADefinir: 1 });
    await s('budgets/pa', { budget: 9000, budgetNote: 'marge' });
    await s('idees/pa', { texte: 'idée', par: 'admin' });
    await s('projets/pa/technique/c1', { pile: 'x' });
    await s('projets/pa/jalons/j1', { projet: 'pa', titre: 'Étape', statut: 'en-cours', devis: 'devis-a' });
    await s('projets/pa/montants/jalon-j1', { projet: 'pa', montant: 1200 });
    /* Une étape qui porte encore un montant d'avant la migration. */
    await s('projets/pa/jalons/j-ancien', { projet: 'pa', titre: 'Ancienne ligne', statut: 'a-venir', devis: 'devis-a', montant: 500 });
    await s('projets/pa/maintenance/contrat', { genre: 'contrat', statut: 'actif', formule: 'Sérénité', jours: 2 });
    await s('projets/pa/scenarios/DI-1', { ref: 'DI-1', titre: 'Scénario' });
    await s('projets/pa/campagnes/c1', { titre: 'Campagne', statut: 'en-cours', testeurs: ['t-assigne'] });
    await s('testeurs/t-assigne', { prenom: 'T', email: 't-assigne@exemple.test', actif: true, projets: ['pa'] });
    await s('testeurs/t-autre', { prenom: 'U', email: 't-autre@exemple.test', actif: true, projets: ['pz'] });
    await s('tickets/ta', { projet: 'pa', numero: 'A-001', titre: 'x', statut: 'nouveau', urgence: 'important', type: 'bug', auteur: { uid: 'resp', cote: 'client' }, lu: {} });
    await s('tickets/ta/messages/m-public', { de: { uid: 'admin', cote: 'equipe' }, texte: 'bonjour', interne: false, pieces: [] });
    await s('tickets/ta/messages/m-interne', { de: { uid: 'admin', cote: 'equipe' }, texte: 'entre nous', interne: true, pieces: [] });
    await s('fichiers/f-client', { projet: 'pa', nom: 'maquette.png', visibilite: 'client', archive: false });
    await s('fichiers/f-interne', { projet: 'pa', nom: 'notes.txt', visibilite: 'interne', archive: false });
    await s('validations/v-ordinaire', { projet: 'pa', titre: 'Ordinaire', statut: 'en-attente', reponse: null });
    await s('validations/v-reservee', { projet: 'pa', titre: 'Réservée', statut: 'en-attente', reponse: null, reserveeResponsable: true });
    await s('documents/devis-a', { projet: 'pa', type: 'devis', numero: 'D-1', montant: 100, statut: 'envoye', reponse: null });
    await s('paiements/pay-a', { projet: 'pa', facture: 'f-a', montant: 50 });
    await s('activite/act-finance', { projet: 'pa', type: 'paiement', texte: 'paiement de 50 €', visibilite: 'responsable' });
    await s('activite/act-interne', { projet: 'pa', type: 'tache', texte: 'x', visibilite: 'interne' });
    await s('activite/act-client', { projet: 'pa', type: 'tache', texte: 'x', visibilite: 'client' });
    await s('profils/resp', { notifications: {}, lus: {} });
    await s('audit/au1', { action: 'x' });
    await s('envois/e1', { modele: 'code', a: [{ email: 'resp@exemple.test' }] });
  });
};

/* ---- Les opérations, et qui doit pouvoir -------------------------------- */
const EQUIPE_A = ['admin', 'agent-a', 'agent-fin'];
const CLIENTS_A = ['resp', 'collab'];
const FINANCE = ['admin', 'agent-fin', 'resp'];
const lire = (c) => (db) => getDoc(doc(db, c));
const reponse = (uid) => ({ par: uid, nom: uid, date: serverTimestamp(), commentaire: '' });

const OPS = [
  // Le projet
  ['projet', 'lire la fiche du projet A', lire('projets/pa'), [...EQUIPE_A, ...CLIENTS_A]],
  ['projet', 'tenir l avancement de A', (db) => updateDoc(doc(db, 'projets/pa'), { pulse: { enCours: 'x' } }), EQUIPE_A],
  ['projet', 's ajouter aux membres de A', (db, uid) => updateDoc(doc(db, 'projets/pa'), { membres: ['resp', 'collab', uid] }), []],
  ['projet', 'ouvrir ou fermer A', (db) => updateDoc(doc(db, 'projets/pa'), { ouvert: false }), []],
  // Les données internes
  ['interne', 'lire la santé de A', lire('projetsInternes/pa'), EQUIPE_A],
  ['interne', 'lire le budget de A', lire('budgets/pa'), ['admin', 'agent-fin']],
  ['interne', 'lire la note d idée de A', lire('idees/pa'), ['admin']],
  ['interne', 'lire la fiche technique de A', lire('projets/pa/technique/c1'), EQUIPE_A],
  ['interne', 'lire l audit', lire('audit/au1'), ['admin']],
  ['interne', 'lire la file des e-mails', lire('envois/e1'), []],
  ['interne', 'lire le profil d un client', lire('profils/resp'), ['admin', 'resp']],
  // L'organisation
  ['organisation', 'lire la fiche de la société de A', lire('organisations/o1'), ['admin', 'agent-a', 'agent-fin', 'resp', 'collab', 'voisin']],
  ['organisation', 'lire les notes commerciales', lire('organisationsInternes/o1'), ['admin']],
  ['organisation', 'modifier la société', (db) => updateDoc(doc(db, 'organisations/o1'), { nom: 'x' }), []],
  // Les demandes et les messages
  ['tickets', 'lire une demande de A', lire('tickets/ta'), [...EQUIPE_A, ...CLIENTS_A]],
  ['tickets', 'lister les demandes de A', (db) => getDocs(query(collection(db, 'tickets'), where('projet', '==', 'pa'))), [...EQUIPE_A, ...CLIENTS_A]],
  ['messages', 'lire un message public', lire('tickets/ta/messages/m-public'), [...EQUIPE_A, ...CLIENTS_A]],
  ['messages', 'lire une note interne', lire('tickets/ta/messages/m-interne'), EQUIPE_A],
  ['messages', 'écrire dans la conversation de A', (db, uid) => addDoc(collection(db, 'projets/pa/messages'), { de: { uid, nom: uid, cote: EQUIPE_A.includes(uid) ? 'equipe' : 'client' }, texte: 'x', pieces: [], date: serverTimestamp() }), [...EQUIPE_A, ...CLIENTS_A]],
  // Les fichiers
  ['fichiers', 'lire un fichier client', lire('fichiers/f-client'), [...EQUIPE_A, ...CLIENTS_A]],
  ['fichiers', 'lire un fichier interne', lire('fichiers/f-interne'), EQUIPE_A],
  // Les validations
  ['validations', 'lire une validation', lire('validations/v-ordinaire'), [...EQUIPE_A, ...CLIENTS_A]],
  ['validations', 'répondre à une validation ordinaire', (db, uid) => updateDoc(doc(db, 'validations/v-ordinaire'), { statut: 'approuvee', reponse: reponse(uid), maj: serverTimestamp() }), CLIENTS_A],
  ['validations', 'répondre à une validation réservée', (db, uid) => updateDoc(doc(db, 'validations/v-reservee'), { statut: 'approuvee', reponse: reponse(uid), maj: serverTimestamp() }), ['resp']],
  ['validations', 'annuler une validation', (db) => updateDoc(doc(db, 'validations/v-ordinaire'), { statut: 'annulee', maj: serverTimestamp() }), EQUIPE_A],
  // La finance
  ['devis', 'lire un devis de A', lire('documents/devis-a'), FINANCE],
  ['devis', 'lister les devis de A', (db) => getDocs(query(collection(db, 'documents'), where('projet', '==', 'pa'))), ['admin', 'agent-fin']],
  ['devis', 'accepter le devis', (db, uid) => updateDoc(doc(db, 'documents/devis-a'), { statut: 'accepte', reponse: reponse(uid) }), ['resp']],
  ['paiements', 'lire un paiement de A', lire('paiements/pay-a'), FINANCE],
  ['paiements', 'lire le montant d une étape de devis', lire('projets/pa/montants/jalon-j1'), FINANCE],
  ['paiements', 'lister les montants de A', (db) => getDocs(collection(db, 'projets/pa/montants')), FINANCE],
  ['paiements', 'poser un montant', (db) => setDoc(doc(db, 'projets/pa/montants/jalon-j1'), { projet: 'pa', montant: 1 }), ['admin']],
  ['paiements', 'poser un montant sur une étape', (db) => updateDoc(doc(db, 'projets/pa/jalons/j1'), { montant: 1 }), []],
  ['paiements', 'changer le montant d avant d une étape', (db) => updateDoc(doc(db, 'projets/pa/jalons/j-ancien'), { montant: 1 }), []],
  ['contenu', 'modifier une étape qui porte un montant d avant', (db) => updateDoc(doc(db, 'projets/pa/jalons/j-ancien'), { titre: 'Revue' }), EQUIPE_A],
  ['paiements', 'poser un prix sur le forfait', (db) => updateDoc(doc(db, 'projets/pa/maintenance/contrat'), { montant: 1 }), []],
  ['paiements', 'lire une ligne d activité financière', lire('activite/act-finance'), FINANCE],
  ['paiements', 'lister l activité de A sans filtre', (db) => getDocs(query(collection(db, 'activite'), where('projet', '==', 'pa'))), ['admin', 'agent-fin']],
  ['paiements', 'lister l activité de A hors finance (agent)', (db) => getDocs(query(collection(db, 'activite'), where('projet', '==', 'pa'), where('visibilite', 'in', ['client', 'interne']))), EQUIPE_A],
  ['activite', 'lire une ligne interne', lire('activite/act-interne'), EQUIPE_A],
  // La recette
  ['qa', 'lire la campagne de A', lire('projets/pa/campagnes/c1'), [...EQUIPE_A, ...CLIENTS_A, 't-assigne']],
  ['qa', 'lire un scénario de A', lire('projets/pa/scenarios/DI-1'), [...EQUIPE_A, ...CLIENTS_A, 't-assigne']],
  ['qa', 'consigner son passage', (db, uid) => setDoc(doc(db, `projets/pa/campagnes/c1/passages/${uid}__DI-1`), { scenario: 'DI-1', testeur: uid, plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], contexte: {}, le: serverTimestamp() }), ['t-assigne']],
  ['qa', 'lire la fiche du testeur assigné', lire('testeurs/t-assigne'), ['admin', 'agent-a', 'agent-fin', 't-assigne']],
  ['qa', 'lire la fiche d un testeur d un autre projet', lire('testeurs/t-autre'), ['admin', 'agent-b', 't-autre']],
  // Les interlocuteurs et l'équipe
  ['interlocuteurs', 'lire les interlocuteurs de A', (db) => getDocs(collection(db, 'projets/pa/interlocuteurs')), EQUIPE_A],
  ['interlocuteurs', 'écrire un interlocuteur', (db) => setDoc(doc(db, 'projets/pa/interlocuteurs/k-x'), { email: 'x@exemple.test', role: 'responsable', statut: 'actif' }), []],
  ['equipe', 'lister l équipe', (db) => getDocs(collection(db, 'equipe')), ['admin', 'agent-a', 'agent-b', 'agent-fin']],
  ['equipe', 'lire la fiche d un administrateur', lire('equipe/admin'), ['admin', 'agent-a', 'agent-b', 'agent-fin']],
  ['equipe', 'se faire administrateur', (db, uid) => setDoc(doc(db, `equipe/${uid}`), { role: 'admin', actif: true }), []],
];

/* ---- L'épreuve ---------------------------------------------------------- */
let ok = 0; const ecarts = [];
const grille = {};
for (const [uid, libelle, jeton] of CATEGORIES) {
  if (!TABLEAU) console.log(`\n== ${libelle}`);
  grille[uid] = {};
  for (const [famille, nom, faire, autorises] of OPS) {
    await semer();
    const db = env.authenticatedContext(uid, { email: `${uid}@exemple.test`, email_verified: true, ...jeton }).firestore();
    const attendu = autorises.includes(uid);
    let obtenu;
    try { await assertSucceeds(faire(db, uid)); obtenu = true; } catch (e) {
      try { await assertFails(faire(db, uid)); obtenu = false; } catch (e2) { obtenu = null; }
    }
    grille[uid][nom] = obtenu;
    if (obtenu === attendu) { ok += 1; if (!TABLEAU) console.log(`  ok     ${attendu ? 'peut ' : 'ne peut pas '}${nom}`); }
    else {
      const m = `${libelle} : ${nom} (${attendu ? 'refusé à tort' : 'AUTORISÉ À TORT'})`;
      ecarts.push(m); console.log(`  ÉCART  ${m}`);
    }
    void famille;
  }
}

if (TABLEAU) {
  const tete = CATEGORIES.map(([u]) => u);
  console.log(`\n| Opération | ${tete.join(' | ')} |\n|---|${tete.map(() => '---').join('|')}|`);
  for (const [, nom] of OPS) console.log(`| ${nom} | ${tete.map((u) => (grille[u][nom] === true ? 'oui' : grille[u][nom] === false ? 'non' : '?')).join(' | ')} |`);
}
await env.cleanup();
console.log(`\n${ok} case(s) conforme(s) sur ${CATEGORIES.length * OPS.length}${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
