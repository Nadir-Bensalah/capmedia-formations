/* ==========================================================================
   ESPACE DE SUIVI · jeu de données pour le banc d'essai local
   Contrat : docs/suivi.md

   Remplit les émulateurs avec un cas réaliste : une équipe, deux clients,
   deux projets, des tickets à tous les stades, des messages dont une note
   interne, un historique, un devis et deux factures.

   Ne fonctionne QUE sur les émulateurs : le script refuse de démarrer si
   les variables d'environnement d'émulation ne sont pas posées. Aucune
   chance d'écrire dans la vraie base par mégarde.

   Usage :
     cd ~/Capmedia/plateforme
     firebase emulators:exec --project demo-capmedia \
       "node fonctions/outils/semer-suivi.mjs"
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refus : ce script ne sert qu aux émulateurs.');
  console.error('Lance-le avec « firebase emulators:exec ».');
  process.exit(1);
}

const PROJET = process.env.GCLOUD_PROJECT || 'demo-capmedia';
initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const auth = getAuth();

const ilYA = (jours, heures = 0) =>
  Timestamp.fromMillis(Date.now() - jours * 86400000 - heures * 3600000);

/** Crée le compte s il manque, puis pose ses revendications. */
const compte = async (email, nom, revendications) => {
  let u;
  try { u = await auth.getUserByEmail(email); }
  catch { u = await auth.createUser({ email, emailVerified: true, displayName: nom }); }
  await auth.setCustomUserClaims(u.uid, revendications);
  return u.uid;
};

const semer = async () => {
  /* --- Les comptes ---------------------------------------------------- */
  const nadir = await compte('nadir@capmedia.app', 'Nadir Ben Salah', { equipe: true });
  const sebastien = await compte('sebastien@[nom retire].eu', '[nom retire] [nom retire]', { projets: ['forgeme'] });
  const autre = await compte('claire@exemple.fr', 'Claire Dupont', { projets: ['menuo'] });

  await bdd.doc(`equipe/${nadir}`).set({
    nom: 'Nadir Ben Salah', email: 'nadir@capmedia.app', role: 'admin', actif: true,
  });

  /* --- Les projets ---------------------------------------------------- */
  await bdd.doc('projets/forgeme').set({
    ref: 'FORGEME', nom: 'ForgeMe',
    client: { nom: '[nom retire] [nom retire]', email: 'sebastien@[nom retire].eu', entreprise: '[nom retire] Capital' },
    membres: [sebastien],
    plateformes: ['ios', 'android', 'web'],
    statut: 'actif', compteur: 4, archive: false,
    cree: ilYA(240), maj: FieldValue.serverTimestamp(),
  });

  await bdd.doc('projets/menuo').set({
    ref: 'MENUO', nom: 'Menuo',
    client: { nom: 'Claire Dupont', email: 'claire@exemple.fr', entreprise: 'Menuo SAS' },
    membres: [autre],
    plateformes: ['ios', 'web'],
    statut: 'actif', compteur: 1, archive: false,
    cree: ilYA(60), maj: FieldValue.serverTimestamp(),
  });

  /* --- Les tickets ---------------------------------------------------- */
  const cote = (uid) => uid === nadir
    ? { uid: nadir, nom: 'Nadir Ben Salah', email: 'nadir@capmedia.app', cote: 'equipe' }
    : { uid: sebastien, nom: '[nom retire] [nom retire]', email: 'sebastien@[nom retire].eu', cote: 'client' };

  const base = {
    projet: 'forgeme', plateforme: 'ios', version: '1.1.2',
    etapes: '', attendu: '', obtenu: '', assigne: null, pieces: [],
    archive: false, resolu: null, lu: { client: null, equipe: null },
  };

  const tickets = [
    {
      id: 't-veille', numero: 'FORGEME-004',
      titre: 'Les validations de tâches de la veille ne fonctionnent plus',
      description: "Je coche une tâche d hier, elle repasse en non validée aussitôt. Sur aujourd hui, tout va bien.",
      etapes: "Ouvrir l écran Tâches, revenir à la veille, cocher une tâche.",
      attendu: 'La tâche reste validée.',
      obtenu: 'Elle revient en non validée dans la seconde.',
      type: 'bug', urgence: 'bloquant', statut: 'en-cours', assigne: nadir,
      auteur: cote(sebastien), cree: ilYA(0, 6), maj: ilYA(0, 2),
      lu: { client: ilYA(0, 5), equipe: ilYA(0, 2) },
    },
    {
      id: 't-anniv', numero: 'FORGEME-003',
      titre: 'La liste des anniversaires reste incomplète après un rafraîchissement',
      description: "Sur la liste des anniversaires, une partie seulement s affiche. En tirant pour rafraîchir, la liste se vide.",
      type: 'demande', urgence: 'important', statut: 'a-valider',
      auteur: cote(sebastien), assigne: nadir, cree: ilYA(9), maj: ilYA(1),
      lu: { client: ilYA(8), equipe: ilYA(1) },
    },
    {
      id: 't-tickets', numero: 'FORGEME-002',
      titre: 'Une tâche visible sur le web et absente de l application',
      description: "La tâche « Tickets restau » apparaît sur la version web mais pas sur mon téléphone.",
      type: 'bug', urgence: 'critique', statut: 'resolu',
      auteur: cote(sebastien), assigne: nadir,
      cree: ilYA(14), maj: ilYA(2), resolu: ilYA(2),
      lu: { client: ilYA(2), equipe: ilYA(2) },
    },
    {
      id: 't-export', numero: 'FORGEME-001',
      titre: 'Pouvoir exporter mes tâches en tableur',
      description: "Ce serait pratique de sortir mes tâches dans un fichier tableur pour ma comptabilité.",
      type: 'demande', urgence: 'mineur', statut: 'ferme', archive: true,
      auteur: cote(sebastien), assigne: nadir,
      cree: ilYA(120), maj: ilYA(100), resolu: ilYA(100),
      lu: { client: ilYA(100), equipe: ilYA(100) },
    },
    {
      id: 't-nouveau', numero: null,
      titre: 'Les notifications arrivent deux fois le matin',
      description: "Depuis deux jours, je reçois chaque rappel en double vers huit heures.",
      type: 'bug', urgence: 'important', statut: 'nouveau',
      auteur: cote(sebastien), cree: ilYA(0, 1), maj: ilYA(0, 1),
      lu: { client: ilYA(0, 1), equipe: null },
    },
  ];

  for (const t of tickets) {
    const { id, ...donnees } = t;
    await bdd.doc(`tickets/${id}`).set({ ...base, ...donnees });
  }

  await bdd.doc('tickets/t-menuo').set({
    ...base, projet: 'menuo', numero: 'MENUO-001', plateforme: 'web', version: '2.4.0',
    titre: 'La carte ne s imprime pas correctement',
    description: "À l impression, la deuxième page est coupée.",
    type: 'bug', urgence: 'important', statut: 'nouveau',
    auteur: { uid: autre, nom: 'Claire Dupont', email: 'claire@exemple.fr', cote: 'client' },
    cree: ilYA(3), maj: ilYA(3), lu: { client: ilYA(3), equipe: null },
  });

  /* --- Les messages, dont une note interne --------------------------- */
  const messages = [
    ['t-veille', { uid: nadir, nom: 'Nadir Ben Salah', cote: 'equipe' },
     "C est bien reproduit de mon côté. La cause est identifiée, la correction part dans la prochaine version.",
     false, ilYA(0, 3)],
    ['t-veille', { uid: nadir, nom: 'Nadir Ben Salah', cote: 'equipe' },
     "Note interne : le parcours du cache jette une erreur sur la requête booléenne du bouton des archivées.",
     true, ilYA(0, 3)],
    ['t-veille', { uid: sebastien, nom: '[nom retire] [nom retire]', cote: 'client' },
     "Merci, je guette la mise à jour.", false, ilYA(0, 2)],
    ['t-anniv', { uid: nadir, nom: 'Nadir Ben Salah', cote: 'equipe' },
     "Corrigé et déposé sur la version d essai. Peux-tu vérifier que la liste est complète chez toi ?",
     false, ilYA(1)],
  ];
  for (const [ticket, de, texte, interne, date] of messages) {
    await bdd.collection(`tickets/${ticket}/messages`).add({ de, texte, pieces: [], interne, date });
  }

  /* --- L historique --------------------------------------------------- */
  const evenements = [
    ['t-veille', 'creation', null, 'nouveau', cote(sebastien), ilYA(0, 6)],
    ['t-veille', 'statut', 'nouveau', 'en-cours', cote(nadir), ilYA(0, 4)],
    ['t-veille', 'assignation', null, 'Nadir Ben Salah', cote(nadir), ilYA(0, 4)],
    ['t-anniv', 'creation', null, 'nouveau', cote(sebastien), ilYA(9)],
    ['t-anniv', 'statut', 'en-cours', 'a-valider', cote(nadir), ilYA(1)],
    ['t-tickets', 'statut', 'a-valider', 'resolu', cote(sebastien), ilYA(2)],
  ];
  for (const [ticket, type, avant, apres, par, date] of evenements) {
    await bdd.collection(`tickets/${ticket}/evenements`).add({ type, avant, apres, par, date });
  }

  /* --- Les devis et les factures ------------------------------------- */
  await bdd.doc('documents/d-qa').set({
    projet: 'forgeme', type: 'devis', numero: 'D-2026-014',
    libelle: 'Campagne de tests QA sur les trois plateformes',
    montant: 5750, statut: 'envoye', date: ilYA(2), echeance: ilYA(-28),
    fichier: { chemin: 'projets/forgeme/documents/d-qa/devis-2026-014.pdf', nom: 'devis-2026-014.pdf', taille: 148213 },
    reponse: null, archive: false,
  });

  await bdd.doc('documents/f-acompte').set({
    projet: 'forgeme', type: 'facture', numero: 'F-2026-031',
    libelle: 'Acompte de 50 % sur la campagne de tests',
    montant: 2875, statut: 'a-payer', date: ilYA(1), echeance: ilYA(-29),
    fichier: { chemin: 'projets/forgeme/documents/f-acompte/facture-2026-031.pdf', nom: 'facture-2026-031.pdf', taille: 96410 },
    reponse: null, archive: false,
  });

  await bdd.doc('documents/f-ancienne').set({
    projet: 'forgeme', type: 'facture', numero: 'F-2026-012',
    libelle: 'Développement de la version 1.1',
    montant: 4200, statut: 'payee', date: ilYA(75), echeance: ilYA(45),
    fichier: { chemin: 'projets/forgeme/documents/f-ancienne/facture-2026-012.pdf', nom: 'facture-2026-012.pdf', taille: 91002 },
    reponse: null, archive: false,
  });

  await bdd.doc('documents/f-menuo').set({
    projet: 'menuo', type: 'facture', numero: 'F-2026-030',
    libelle: 'Refonte de la carte',
    montant: 1800, statut: 'en-retard', date: ilYA(50), echeance: ilYA(20),
    fichier: { chemin: 'projets/menuo/documents/f-menuo/facture-2026-030.pdf', nom: 'facture-2026-030.pdf', taille: 88120 },
    reponse: null, archive: false,
  });

  console.log('Jeu de données posé sur le projet', PROJET);
  console.log('  équipe   nadir@capmedia.app');
  console.log('  clients  sebastien@[nom retire].eu (ForgeMe), claire@exemple.fr (Menuo)');
  console.log('  6 tickets, 4 messages dont 1 note interne, 6 événements, 4 documents');
};

semer().then(() => process.exit(0)).catch((e) => { console.error('Échec :', e); process.exit(1); });
