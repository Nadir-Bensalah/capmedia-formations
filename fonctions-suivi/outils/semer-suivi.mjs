/* ==========================================================================
   CAPMEDIA CLIENT HUB · le jeu de données du banc d'essai
   Émulateurs uniquement : refuse de tourner sans FIRESTORE_EMULATOR_HOST.

   Une équipe, deux clients, deux projets. Le projet Atelier est riche :
   composants, jalons, tâches (dont une interne), demandes, validations,
   fichiers, versions, réunions, notes, un point bloquant, des devis, des
   factures et un paiement. Le projet Boutique est minimal, pour vérifier le
   cloisonnement.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Ce script ne tourne que sur les émulateurs (FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(1);
}

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const auth = getAuth();

const ilYA = (jours, heures = 0) => Timestamp.fromDate(new Date(Date.now() - (jours * 24 + heures) * 3600 * 1000));
const dans = (jours, heures = 0) => Timestamp.fromDate(new Date(Date.now() + (jours * 24 + heures) * 3600 * 1000));

async function compte(email, nom, revendications) {
  let u;
  try { u = await auth.getUserByEmail(email); }
  catch (e) { u = await auth.createUser({ email, emailVerified: true, displayName: nom }); }
  await auth.setCustomUserClaims(u.uid, revendications);
  return u.uid;
}

async function main() {
  const agent = await compte('agent.essai@exemple.test', 'Alex Durand', { equipe: true, projets: [] });
  const camille = await compte('camille.essai@exemple.test', 'Camille Martin', { equipe: false, projets: ['atelier'] });
  const lea = await compte('lea.essai@exemple.test', 'Léa Bernard', { equipe: false, projets: ['boutique'] });
  const cote = (uid, nom, email, cote = 'client') => ({ uid, nom, email, cote });
  const parAgent = { uid: agent, nom: 'Alex Durand' };

  await bdd.doc(`equipe/${agent}`).set({ nom: 'Alex Durand', email: 'agent.essai@exemple.test', role: 'admin', actif: true });

  await bdd.doc('organisations/atelier-nord').set({
    nom: 'Camille Martin', entreprise: 'Atelier Nord', email: 'camille.essai@exemple.test', telephone: '', adresse: 'Bruxelles',
    notesInternes: 'Client fondateur de Atelier. Point hebdo le mardi.', contacts: [{ nom: 'Camille Martin', email: 'camille.essai@exemple.test', role: 'owner', uid: camille }],
    membres: [camille], roles: { [camille]: 'owner' }, cree: ilYA(200), maj: ilYA(1),
  });
  await bdd.doc('organisations/boutique-sud').set({
    nom: 'Léa Bernard', entreprise: 'Boutique Sud', email: 'lea.essai@exemple.test', telephone: '', adresse: '', notesInternes: '',
    contacts: [{ nom: 'Léa Bernard', email: 'lea.essai@exemple.test', role: 'owner', uid: lea }], membres: [lea], roles: { [lea]: 'owner' }, cree: ilYA(60), maj: ilYA(3),
  });

  await bdd.doc('projets/atelier').set({
    nom: 'Atelier', ref: 'ATELIER', description: 'Application de productivité : objectifs, tâches, habitudes, sur iOS, Android et web, avec un tableau de bord.',
    type: 'application-mobile', statut: 'en-cours', organisation: 'atelier-nord',
    client: { nom: 'Camille Martin', email: 'camille.essai@exemple.test', entreprise: 'Atelier Nord' },
    plateformes: ['ios', 'android', 'web', 'admin'], membres: [camille], membresOrganisation: [camille], compteur: 5,
    progression: { mode: 'jalons', valeur: 0 }, debut: ilYA(180), cible: dans(45), responsable: agent,
    pulse: { enCours: 'Corrections des retours Android', derniereLivraison: 'iOS 1.1.2', prochaineEtape: 'Validation TestFlight 1.2', attenteClient: '' },
    sante: 'ok', budget: 28000, budgetNote: 'Forfait par phases', archive: false, cree: ilYA(180), maj: ilYA(0, 2),
  });
  await bdd.doc('projets/boutique').set({
    nom: 'Boutique', ref: 'BOUTIQUE', description: 'Menus de restaurant en ligne.', type: 'site-vitrine', statut: 'cadrage', organisation: 'boutique-sud',
    client: { nom: 'Léa Bernard', email: 'lea.essai@exemple.test', entreprise: 'Boutique Sud' }, plateformes: ['web'], membres: [lea], membresOrganisation: [lea], compteur: 1,
    progression: { mode: 'manuel', valeur: 15 }, responsable: agent, pulse: {}, sante: 'attention', archive: false, cree: ilYA(60), maj: ilYA(3),
  });
  /* Un projet tel que l'ancienne console les creait : statut « actif », sans
     organisation ni progression. Il doit rester visible partout. */
  await bdd.doc('projets/ancien').set({
    nom: 'ANCIEN', ref: 'ANCIEN', client: { nom: 'Léa Bernard', email: 'lea.essai@exemple.test', entreprise: 'Boutique Sud' },
    membres: [lea], plateformes: ['web'], statut: 'actif', compteur: 0, archive: false, cree: ilYA(90), maj: ilYA(90),
  });

  /* --- Les composants ---------------------------------------------------- */
  const composants = [
    ['ios', { nom: 'Application iOS', type: 'ios', statut: 'en-cours', progression: 92, version: '1.1.2', versionPrep: '1.2.0', environnement: 'App Store', techno: ['React Native'], ordre: 1 }],
    ['android', { nom: 'Application Android', type: 'android', statut: 'en-cours', progression: 89, version: '1.0.15', versionPrep: '1.2.0', environnement: 'Google Play', techno: ['React Native'], ordre: 2 }],
    ['web', { nom: 'Application web', type: 'web', statut: 'en-cours', progression: 95, version: '1.1.0', environnement: 'atelier.net', techno: ['React'], ordre: 3 }],
    ['admin', { nom: 'Tableau de bord', type: 'admin', statut: 'livre', progression: 100, version: '2.0', environnement: 'Production', techno: ['React'], ordre: 4 }],
    ['backend', { nom: 'Backend', type: 'backend', statut: 'en-cours', progression: 97, environnement: 'Firebase', techno: ['Cloud Functions', 'Firestore'], ordre: 5 }],
  ];
  for (const [id, c] of composants) await bdd.doc(`projets/atelier/composants/${id}`).set({ ...c, responsable: agent, description: '', cree: ilYA(150), maj: ilYA(1) });

  /* --- La feuille de route ------------------------------------------------ */
  const jalons = [
    ['cadrage', { titre: 'Cadrage', phase: 'Cadrage', statut: 'termine', progression: 100, debut: ilYA(180), fin: ilYA(160), ordre: 1 }],
    ['design', { titre: 'Design', phase: 'Design', statut: 'termine', progression: 100, debut: ilYA(160), fin: ilYA(120), ordre: 2 }],
    ['dev', { titre: 'Développement', phase: 'Développement', statut: 'en-cours', progression: 82, debut: ilYA(120), fin: dans(20), ordre: 3, composants: ['ios', 'android', 'web'] }],
    ['tests', { titre: 'Tests', phase: 'Tests', statut: 'planifie', progression: 0, debut: dans(20), fin: dans(35), ordre: 4 }],
    ['publication', { titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, debut: dans(35), fin: dans(45), ordre: 5 }],
  ];
  for (const [id, j] of jalons) await bdd.doc(`projets/atelier/jalons/${id}`).set({ projet: 'atelier', description: '', composants: [], responsable: agent, dependances: [], ...j, cree: ilYA(150), maj: ilYA(1) });

  /* --- Les liens ---------------------------------------------------------- */
  const liens = [
    { nom: 'Application web', categorie: 'production', url: 'https://app.atelier.net', environnement: 'Production', composant: 'web', visibilite: 'client' },
    { nom: 'App Store', categorie: 'mobile', url: 'https://apps.apple.com/app/atelier', environnement: 'Production', composant: 'ios', visibilite: 'client' },
    { nom: 'TestFlight', categorie: 'test', url: 'https://testflight.apple.com/join/atelier', environnement: 'Test', visibilite: 'client' },
    { nom: 'Maquettes Figma', categorie: 'design', url: 'https://figma.com/file/atelier', visibilite: 'client' },
    { nom: 'Dépôt GitHub', categorie: 'code', url: 'https://github.com/capmedia/atelier', visibilite: 'interne' },
  ];
  for (const l of liens) await bdd.collection('projets/atelier/liens').add({ composant: '', description: '', etat: 'actif', environnement: '', ...l, cree: ilYA(100) });

  /* --- Les tâches ---------------------------------------------------------- */
  const taches = [
    { titre: 'Corriger la validation des tâches de la veille', statut: 'en-cours', priorite: 'bloquante', assigne: agent, echeance: dans(2), composant: 'ios', jalon: 'dev', visibilite: 'client', progression: 60, checklist: [{ texte: 'Reproduire', fait: true }, { texte: 'Corriger le cache', fait: false }, { texte: 'Tester sur TestFlight', fait: false }] },
    { titre: 'Publier la version 1.2 sur TestFlight', statut: 'a-faire', priorite: 'importante', assigne: agent, echeance: dans(6), composant: 'ios', jalon: 'dev', visibilite: 'client', progression: 0, checklist: [] },
    { titre: 'Fournir les captures pour le store', statut: 'attente-client', priorite: 'normale', assigne: agent, echeance: dans(4), composant: 'android', jalon: 'publication', visibilite: 'client', progression: 0, checklist: [] },
    { titre: 'Refactorer le module de cache', statut: 'en-revue', priorite: 'normale', assigne: agent, echeance: null, composant: 'backend', jalon: 'dev', visibilite: 'interne', progression: 80, checklist: [] },
    { titre: 'Écran des anniversaires', statut: 'terminee', priorite: 'normale', assigne: agent, echeance: ilYA(3), composant: 'ios', jalon: 'dev', visibilite: 'client', progression: 100, checklist: [] },
    { titre: 'Relancer Google pour le compte développeur', statut: 'bloquee', priorite: 'importante', assigne: agent, echeance: ilYA(2), composant: 'android', jalon: 'publication', visibilite: 'client', progression: 0, checklist: [] },
  ];
  for (const t of taches) await bdd.collection('taches').add({ projet: 'atelier', ticket: '', description: '', estimation: '', pieces: [], ordre: 0, archive: false, par: parAgent, ...t, cree: ilYA(10), maj: ilYA(1) });

  /* --- Les demandes -------------------------------------------------------- */
  const base = { projet: 'atelier', plateforme: 'ios', version: '1.1.2', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], pieces: [], archive: false, composant: 'ios', qualification: null, devis: null };
  const tickets = [
    { id: 't-veille', numero: 'ATELIER-004', titre: 'Les validations de tâches de la veille ne fonctionnent plus', description: "Je coche une tâche d'hier, elle repasse en non validée aussitôt. Sur aujourd'hui, tout va bien.", etapes: "Ouvrir l'écran Tâches, revenir à la veille, cocher une tâche.", attendu: 'La tâche reste validée.', obtenu: 'Elle revient en non validée dans la seconde.', type: 'bug', urgence: 'bloquant', statut: 'en-cours', auteur: cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), assigne: agent, cree: ilYA(0, 6), maj: ilYA(0, 2), resolu: null, lu: { client: ilYA(0, 5), equipe: ilYA(0, 2) } },
    { id: 't-anniv', numero: 'ATELIER-003', titre: 'La liste des anniversaires reste incomplète après un rafraîchissement', description: 'Sur la liste des anniversaires, une partie seulement s\'affiche.', type: 'bug', urgence: 'important', statut: 'a-valider', auteur: cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), assigne: agent, cree: ilYA(9), maj: ilYA(1), resolu: null, lu: { client: ilYA(8), equipe: ilYA(1) } },
    { id: 't-export', numero: 'ATELIER-002', titre: 'Pouvoir exporter mes tâches en tableur', description: 'Ce serait pratique pour ma comptabilité.', type: 'fonctionnalite', urgence: 'mineur', statut: 'acceptee', qualification: 'a-chiffrer', auteur: cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), assigne: agent, cree: ilYA(20), maj: ilYA(2), resolu: null, lu: { client: ilYA(2), equipe: ilYA(2) } },
    { id: 't-tickets', numero: 'ATELIER-001', titre: 'Une tâche visible sur le web et absente de l\'application', description: 'La tâche « Tickets restau » apparaît sur le web mais pas sur mon téléphone.', type: 'bug', urgence: 'critique', statut: 'resolu', auteur: cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), assigne: agent, cree: ilYA(14), maj: ilYA(2), resolu: ilYA(2), lu: { client: ilYA(2), equipe: ilYA(2) } },
    { id: 't-nouveau', numero: null, titre: 'Les notifications arrivent deux fois le matin', description: 'Depuis deux jours, je reçois chaque rappel en double vers huit heures.', type: 'bug', urgence: 'important', statut: 'nouveau', auteur: cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), assigne: null, cree: ilYA(0, 1), maj: ilYA(0, 1), resolu: null, lu: { client: ilYA(0, 1), equipe: null } },
  ];
  for (const t of tickets) { const { id, ...d } = t; await bdd.doc(`tickets/${id}`).set({ ...base, ...d }); }
  await bdd.doc('tickets/t-boutique').set({ ...base, projet: 'boutique', composant: '', numero: 'BOUTIQUE-001', plateforme: 'web', version: '2.4.0', titre: 'La carte ne s\'imprime pas correctement', description: 'À l\'impression, la deuxième page est coupée.', type: 'bug', urgence: 'important', statut: 'nouveau', auteur: cote(lea, 'Léa Bernard', 'lea.essai@exemple.test'), assigne: null, cree: ilYA(3), maj: ilYA(3), resolu: null, lu: { client: ilYA(3), equipe: null } });

  const messages = [
    ['t-veille', { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, "C'est bien reproduit de mon côté. La cause est identifiée, la correction part dans la prochaine version.", false, ilYA(0, 3)],
    ['t-veille', { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, 'Note interne : le parcours du cache jette une erreur sur la requête booléenne du bouton des archivées.', true, ilYA(0, 3)],
    ['t-veille', { uid: camille, nom: 'Camille Martin', cote: 'client' }, 'Merci, je guette la mise à jour.', false, ilYA(0, 2)],
    ['t-anniv', { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, "Corrigé et déposé sur la version d'essai. Peux-tu vérifier que la liste est complète chez toi ?", false, ilYA(1)],
  ];
  for (const [ticket, de, texte, interne, date] of messages) await bdd.collection(`tickets/${ticket}/messages`).add({ de, texte, pieces: [], interne, date });
  const evenements = [
    ['t-veille', 'creation', null, 'nouveau', cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), ilYA(0, 6)],
    ['t-veille', 'statut', 'nouveau', 'en-cours', cote(agent, 'Alex Durand', 'agent.essai@exemple.test', 'equipe'), ilYA(0, 4)],
    ['t-veille', 'assignation', null, 'Alex Durand', cote(agent, 'Alex Durand', 'agent.essai@exemple.test', 'equipe'), ilYA(0, 4)],
    ['t-anniv', 'creation', null, 'nouveau', cote(camille, 'Camille Martin', 'camille.essai@exemple.test'), ilYA(9)],
    ['t-anniv', 'statut', 'en-cours', 'a-valider', cote(agent, 'Alex Durand', 'agent.essai@exemple.test', 'equipe'), ilYA(1)],
  ];
  for (const [ticket, type, avant, apres, par, date] of evenements) await bdd.collection(`tickets/${ticket}/evenements`).add({ type, avant, apres, par: { uid: par.uid, nom: par.nom, cote: par.cote }, date });

  /* --- La conversation du projet ------------------------------------------ */
  await bdd.collection('projets/atelier/messages').add({ de: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, texte: 'Bonjour, la version 1.2 arrive sur TestFlight cette semaine.', pieces: [], date: ilYA(1, 2) });
  await bdd.collection('projets/atelier/messages').add({ de: { uid: camille, nom: 'Camille Martin', cote: 'client' }, texte: 'Parfait, je teste dès réception.', pieces: [], date: ilYA(1) });

  /* --- Les validations ------------------------------------------------------ */
  await bdd.doc('validations/v-maquette').set({ projet: 'atelier', titre: 'Valider la maquette du nouveau profil', type: 'maquette', description: 'Le profil regroupe désormais les objectifs et les statistiques. Dites-nous si la hiérarchie vous convient.', cible: null, pieces: [], statut: 'en-attente', echeance: dans(3), demandeur: parAgent, reponse: null, cree: ilYA(1), maj: ilYA(1) });
  await bdd.doc('validations/v-logo').set({ projet: 'atelier', titre: 'Nouveau logo sur l\'écran de démarrage', type: 'design', description: 'Le logo a été retravaillé.', cible: null, pieces: [], statut: 'approuvee', demandeur: parAgent, reponse: { par: camille, nom: 'Camille Martin', date: ilYA(8), commentaire: 'Très bien.' }, cree: ilYA(10), maj: ilYA(8) });

  /* --- Les fichiers ---------------------------------------------------------- */
  const fichiers = [
    { categorie: 'design', nom: 'maquettes-profil-v3.pdf', chemin: 'projets/atelier/documents/fichiers/maquettes.pdf', taille: 2400000, type: 'application/pdf', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, visibilite: 'client', version: 'v3' },
    { categorie: 'contrats', nom: 'contrat-atelier-signe.pdf', chemin: 'projets/atelier/documents/fichiers/contrat.pdf', taille: 900000, type: 'application/pdf', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, visibilite: 'client', version: '' },
    { categorie: 'captures', nom: 'capture-anniversaires.png', chemin: 'projets/atelier/documents/client/capture.png', taille: 350000, type: 'image/png', par: { uid: camille, nom: 'Camille Martin', cote: 'client' }, visibilite: 'client', version: '' },
    { categorie: 'technique', nom: 'notes-architecture.md', chemin: 'projets/atelier/documents/fichiers/archi.md', taille: 12000, type: 'text/plain', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, visibilite: 'interne', version: '' },
  ];
  for (const f of fichiers) await bdd.collection('fichiers').add({ projet: 'atelier', composant: '', description: '', tags: [], archive: false, ...f, cree: ilYA(5) });

  /* --- Les versions ---------------------------------------------------------- */
  await bdd.collection('releases').add({ projet: 'atelier', composant: 'ios', plateforme: 'ios', version: '1.1.2', titre: 'Corrections et profil', statut: 'disponible', date: ilYA(6), notes: [{ type: 'correction', texte: 'Connexion Apple' }, { type: 'nouveau', texte: 'Nouveau profil' }, { type: 'amelioration', texte: 'Performance de la liste des tâches' }], liens: { store: 'https://apps.apple.com/app/atelier' }, visibilite: 'client', par: parAgent, cree: ilYA(6), maj: ilYA(6) });
  await bdd.collection('releases').add({ projet: 'atelier', composant: 'ios', plateforme: 'ios', version: '1.2.0', titre: 'Validation des tâches', statut: 'test', date: dans(3), notes: [{ type: 'correction', texte: 'Validation des tâches de la veille' }], liens: { test: 'https://testflight.apple.com/join/atelier' }, visibilite: 'client', par: parAgent, cree: ilYA(1), maj: ilYA(1) });

  /* --- Les réunions ------------------------------------------------------------ */
  await bdd.collection('reunions').add({ projet: 'atelier', titre: 'Point hebdomadaire', date: dans(2, 3), duree: 45, participants: [{ nom: 'Camille Martin' }, { nom: 'Alex Durand' }], lien: 'https://meet.google.com/abc-defg-hij', ordreDuJour: '1. Retours Android\n2. Planning TestFlight\n3. Questions', notes: '', compteRendu: '', decisions: '', actions: [], visibilite: 'client', par: parAgent, cree: ilYA(5), maj: ilYA(5) });
  await bdd.collection('reunions').add({ projet: 'atelier', titre: 'Revue de la version 1.1', date: ilYA(7), duree: 60, participants: [{ nom: 'Camille Martin' }, { nom: 'Alex Durand' }], lien: '', ordreDuJour: 'Revue des écrans livrés.', notes: '', compteRendu: 'Écrans validés. Deux retours sur les couleurs, pris en compte.', decisions: 'Conserver Stripe pour les paiements.', actions: [{ texte: 'Envoyer les captures du store', fait: false }], visibilite: 'client', par: parAgent, cree: ilYA(10), maj: ilYA(7) });

  /* --- Les notes et décisions --------------------------------------------------- */
  await bdd.collection('notes').add({ projet: 'atelier', type: 'decision', titre: 'Conserver Stripe pour les paiements', contenu: 'Après comparaison avec RevenueCat seul, Stripe reste pour le web.', contexte: 'Revue de la version 1.1.', impact: 'Aucun changement de code côté mobile.', decidePar: 'Camille et Alex', date: ilYA(7), visibilite: 'client', par: parAgent, cree: ilYA(7), maj: ilYA(7) });
  await bdd.collection('notes').add({ projet: 'atelier', type: 'risque', titre: 'Compte développeur Google en attente', contenu: 'Sans le compte, la publication Android glisse.', contexte: '', impact: 'Publication Android retardée.', decidePar: '', date: ilYA(2), visibilite: 'interne', par: parAgent, cree: ilYA(2), maj: ilYA(2) });

  /* --- Le point bloquant ---------------------------------------------------------- */
  await bdd.collection('blocages').add({ projet: 'atelier', titre: 'Publication Android bloquée', description: 'Attente du compte développeur Google du client.', responsable: 'client', impact: 'Publication Android retardée.', depuis: ilYA(3), resolu: null, visibilite: 'client', cree: ilYA(3), maj: ilYA(3) });

  /* --- Les pièces comptables et le paiement ---------------------------------------- */
  const docs = [
    ['d-qa', { projet: 'atelier', type: 'devis', numero: 'D-2026-014', libelle: 'Campagne de tests QA sur les trois plateformes', montant: 5750, tva: 0, ttc: 5750, statut: 'envoye', date: ilYA(2), expiration: dans(28), fichier: { chemin: 'projets/atelier/documents/devis/D-2026-014.pdf', nom: 'D-2026-014.pdf', taille: 180000 }, reponse: null, archive: false }],
    ['f-acompte', { projet: 'atelier', type: 'facture', numero: 'F-2026-031', libelle: 'Acompte de 50 % sur la campagne de tests', montant: 2875, tva: 0, ttc: 2875, statut: 'a-payer', date: ilYA(1), echeance: dans(29), fichier: { chemin: 'projets/atelier/documents/facture/F-2026-031.pdf', nom: 'F-2026-031.pdf', taille: 160000 }, reponse: null, archive: false }],
    ['f-v11', { projet: 'atelier', type: 'facture', numero: 'F-2026-012', libelle: 'Développement de la version 1.1', montant: 4200, tva: 0, ttc: 4200, statut: 'payee', date: ilYA(75), echeance: ilYA(45), fichier: { chemin: 'projets/atelier/documents/facture/F-2026-012.pdf', nom: 'F-2026-012.pdf', taille: 150000 }, reponse: null, archive: false }],
    ['f-boutique', { projet: 'boutique', type: 'facture', numero: 'F-2026-030', libelle: 'Acompte cadrage', montant: 1800, tva: 0, ttc: 1800, statut: 'en-retard', date: ilYA(40), echeance: ilYA(10), fichier: null, reponse: null, archive: false }],
  ];
  for (const [id, d] of docs) await bdd.doc(`documents/${id}`).set(d);
  await bdd.collection('paiements').add({ projet: 'atelier', facture: 'f-v11', montant: 4200, date: ilYA(50), moyen: 'virement', reference: 'VIR-88213', note: '', statut: 'valide', cree: ilYA(50) });

  /* --- Un peu d'activité et de notifications ------------------------------------------- */
  const activite = [
    { projet: 'atelier', type: 'release', texte: 'a publié la version iOS 1.1.2', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, lien: '/projets/atelier/releases', visibilite: 'client', date: ilYA(6) },
    { projet: 'atelier', type: 'validation', texte: 'a demandé une validation : « Valider la maquette du nouveau profil »', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, lien: '/valider/v-maquette', visibilite: 'client', date: ilYA(1) },
    { projet: 'atelier', type: 'demande', texte: 'a ouvert la demande « Les notifications arrivent deux fois le matin »', par: { uid: camille, nom: 'Camille Martin', cote: 'client' }, lien: '/projets/atelier/demandes/t-nouveau', visibilite: 'client', date: ilYA(0, 1) },
    { projet: 'atelier', type: 'tache', texte: 'a terminé la tâche « Écran des anniversaires »', par: { uid: agent, nom: 'Alex Durand', cote: 'equipe' }, lien: '/projets/atelier/taches', visibilite: 'client', date: ilYA(3) },
  ];
  for (const a of activite) await bdd.collection('activite').add(a);
  await bdd.collection(`boites/${camille}/notifications`).add({ type: 'validation', titre: 'Votre validation est attendue', texte: 'Valider la maquette du nouveau profil', lien: '#/valider/v-maquette', projet: 'atelier', lu: false, date: ilYA(1) });
  await bdd.collection(`boites/${agent}/notifications`).add({ type: 'demande', titre: 'Nouvelle demande', texte: 'Les notifications arrivent deux fois le matin · Atelier', lien: '#/projets/atelier/demandes/t-nouveau', projet: 'atelier', lu: false, date: ilYA(0, 1) });
  await bdd.doc(`profils/${camille}`).set({ nom: 'Camille Martin', email: 'camille.essai@exemple.test', derniereVisite: ilYA(2), notifications: {}, lus: {} });

  /* --- Une demande de nouveau projet ------------------------------------------------------ */
  await bdd.doc('demandesProjet/dp-boutique-app').set({ organisation: 'boutique-sud', par: { uid: lea, nom: 'Léa Bernard', email: 'lea.essai@exemple.test' }, titre: 'Une application de commande pour Boutique', idee: 'Permettre la commande en ligne depuis le menu.', objectifs: 'Plus de commandes le soir.', type: 'application-mobile', plateformes: ['ios', 'android'], budget: '5 000 à 8 000 €', delai: 'Avant l\'été', description: '', fonctionnalites: 'Panier, paiement, suivi', exemples: '', liens: '', pieces: [], statut: 'discussion', projet: null, cree: ilYA(4), maj: ilYA(2) });

  console.log('Jeu de données posé sur le projet', PROJET);
  console.log('  équipe   agent.essai@exemple.test');
  console.log('  clients  camille.essai@exemple.test (Atelier), lea.essai@exemple.test (Boutique)');
  console.log('  Atelier  5 composants, 5 jalons, 5 liens, 6 tâches, 5 demandes, 2 validations, 4 fichiers, 2 versions, 2 réunions, 2 notes, 1 blocage, 3 pièces, 1 paiement');
}

main().catch((e) => { console.error(e); process.exit(1); });
