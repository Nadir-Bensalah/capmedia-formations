/* ==========================================================================
   CAPMEDIA CLIENT HUB · le noyau
   Contrat : docs/suivi.md

   Tout ce que les écrans partagent : l'accès à Firebase, la session, le
   rôle, le vocabulaire métier et les petits outils de rendu. Aucun écran
   ne parle à Firebase sans passer par ici.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, collectionGroup, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, arrayUnion, arrayRemove, increment, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getStorage, ref as refStockage, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

/* --- Le raccordement ---------------------------------------------------- */

const config = (window.AZ_SUIVI || {}).firebase;
if (!config) throw new Error('config-suivi.js doit être chargé avant le noyau');

export const app = getApps().length ? getApps()[0] : initializeApp(config);
export const auth = getAuth(app);
export const bdd = getFirestore(app);
export const stockage = getStorage(app);

/* Banc d'essai local. Deux verrous : la machine doit être la machine de
   développement, et le branchement doit être demandé explicitement. */
const surPosteLocal = ['127.0.0.1', 'localhost', '::1'].includes(location.hostname);
const emulationDemandee = () => {
  try {
    if (new URLSearchParams(location.search).has('emul')) {
      localStorage.setItem('suivi:emul', '1');
      return true;
    }
    return localStorage.getItem('suivi:emul') === '1';
  } catch (e) { return false; }
};

export const surEmulateur = surPosteLocal && emulationDemandee();

if (surEmulateur) {
  const { connectAuthEmulator } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js');
  const { connectFirestoreEmulator } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
  const { connectStorageEmulator } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js');
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(bdd, '127.0.0.1', 8080);
  connectStorageEmulator(stockage, '127.0.0.1', 9199);
  console.info('[suivi] branché sur les émulateurs locaux');
}

export {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, collectionGroup, query,
  where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, arrayUnion, arrayRemove, increment, writeBatch,
  refStockage, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
};

/* ==========================================================================
   Le vocabulaire métier. Une seule source, partagée par tous les écrans et
   alignée sur les règles de sécurité : une valeur absente d'ici est refusée
   par Firestore.
   ========================================================================== */

/* --- Les demandes (collection « tickets ») ------------------------------ */

export const STATUTS = {
  'nouveau':           { libelle: 'Reçue',                voile: 'bleu',   ordre: 1 },
  'a-analyser':        { libelle: 'À analyser',           voile: 'bleu',   ordre: 2 },
  'en-attente-client': { libelle: "Besoin d'information", voile: 'ambre',  ordre: 3,  client: 'Une réponse est attendue de vous' },
  'acceptee':          { libelle: 'Acceptée',             voile: 'violet', ordre: 4 },
  'planifiee':         { libelle: 'Planifiée',            voile: 'violet', ordre: 5 },
  'en-cours':          { libelle: 'En cours',             voile: 'bleu',   ordre: 6 },
  'en-revue':          { libelle: 'En revue',             voile: 'violet', ordre: 7 },
  'a-valider':         { libelle: 'À valider',            voile: 'ambre',  ordre: 8,  client: 'À valider par vous' },
  'resolu':            { libelle: 'Terminée',             voile: 'vert',   ordre: 9 },
  'refuse':            { libelle: 'Refusée',              voile: 'gris',   ordre: 10 },
  'annulee':           { libelle: 'Annulée',              voile: 'gris',   ordre: 11 },
  'ferme':             { libelle: 'Fermée',               voile: 'gris',   ordre: 12 },
};

export const TYPES = {
  'bug':            { libelle: 'Anomalie',                court: 'Anomalie',  icone: 'bug',     aide: 'Quelque chose ne fonctionne pas comme prévu.' },
  'modification':   { libelle: 'Modification',            court: 'Modif.',    icone: 'edit',    aide: 'Changer quelque chose qui existe déjà.' },
  'fonctionnalite': { libelle: 'Nouvelle fonctionnalité', court: 'Fonction.', icone: 'sparkle', aide: "Ajouter quelque chose qui n'existe pas encore." },
  'amelioration':   { libelle: 'Amélioration',            court: 'Amélio.',   icone: 'trend',   aide: 'Rendre plus simple, plus rapide, plus agréable.' },
  'question':       { libelle: 'Question',                court: 'Question',  icone: 'help',    aide: 'Un point à éclaircir, sans changement à faire.' },
  'technique':      { libelle: 'Demande technique',       court: 'Technique', icone: 'code',    aide: 'Accès, configuration, environnement, données.' },
  'contenu':        { libelle: 'Demande de contenu',      court: 'Contenu',   icone: 'file',    aide: 'Textes, images, traductions à mettre en place.' },
  'devis':          { libelle: 'Demande de devis',        court: 'Devis',     icone: 'receipt', aide: 'Chiffrer un besoin avant de décider.' },
  'demande':        { libelle: 'Demande',                 court: 'Demande',   icone: 'inbox',   aide: 'Autre demande.' },
  'autre':          { libelle: 'Autre',                   court: 'Autre',     icone: 'inbox',   aide: 'Tout ce qui ne rentre pas ailleurs.' },
};

export const URGENCES = {
  'bloquant':  { libelle: 'Bloquant',  rang: 1, voile: 'rouge' },
  'critique':  { libelle: 'Critique',  rang: 2, voile: 'rouge' },
  'important': { libelle: 'Important', rang: 3, voile: 'ambre' },
  'mineur':    { libelle: 'Mineur',    rang: 4, voile: 'gris' },
};

export const PLATEFORMES = {
  'ios':     { libelle: 'iPhone',          court: 'iOS',       icone: 'apple',    voile: 'gris',   composant: 'ios' },
  'android': { libelle: 'Android',         court: 'Android',   icone: 'android',  voile: 'vert',   composant: 'android' },
  'web':     { libelle: 'Web',             court: 'Web',       icone: 'globe',    voile: 'bleu',   composant: 'web' },
  'admin':   { libelle: 'Tableau de bord', court: 'Dashboard', icone: 'kanban',   voile: 'violet', composant: 'admin' },
  'backend': { libelle: 'Serveur',         court: 'Serveur',   icone: 'serveur',  voile: 'ambre',  composant: 'backend' },
  'landing': { libelle: 'Site vitrine',    court: 'Vitrine',   icone: 'etincelle', voile: 'rouge', composant: 'landing' },
};
/* Le sélecteur d'une demande ajoute « non précisée » ; la fiche d'un projet
   n'énumère que de vraies plateformes. */
export const PLATEFORMES_CHOIX = { ...PLATEFORMES, '': { libelle: 'Non précisée', court: '', icone: 'help', voile: 'gris' } };
/* Les interlocuteurs d'un projet : la liste si elle existe, sinon le
   contact unique d'avant. Un projet interne n'en a aucun. */
export const contactsProjet = (projet) => {
  if (!projet || projet.interne) return [];
  const liste = Array.isArray(projet.contacts) ? projet.contacts.filter((c) => c && (c.email || c.nom)) : [];
  if (liste.length) return liste;
  const c = projet.client || {};
  return c.email || c.nom ? [{ nom: c.nom || '', email: c.email || '' }] : [];
};
export const nomsContacts = (projet) => contactsProjet(projet).map((c) => c.nom || c.email).filter(Boolean).join(' et ');

export const libellePlateforme = (cle) => ((PLATEFORMES_CHOIX[cle] || {}).libelle || cle || '');

export const QUALIFICATIONS = {
  'incluse':        { libelle: 'Incluse au contrat', voile: 'vert' },
  'hors-perimetre': { libelle: 'Hors périmètre',     voile: 'ambre' },
  'a-chiffrer':     { libelle: 'À chiffrer',         voile: 'violet' },
  'offerte':        { libelle: 'Offerte',            voile: 'vert' },
};

/* Ce qui attend une action de notre côté, et de l'autre. */
export const ATTEND_EQUIPE = ['nouveau', 'a-analyser', 'acceptee', 'planifiee', 'en-cours', 'en-revue'];
export const ATTEND_CLIENT = ['en-attente-client', 'a-valider'];
export const OUVERTS = [...ATTEND_EQUIPE, ...ATTEND_CLIENT];
export const TERMINES = ['resolu', 'refuse', 'annulee', 'ferme'];

/* --- Les projets -------------------------------------------------------- */

export const STATUTS_PROJET = {
  'prospect':       { libelle: 'Prospect',          voile: 'gris' },
  'cadrage':        { libelle: 'Cadrage',           voile: 'bleu' },
  'planifie':       { libelle: 'Planifié',          voile: 'bleu' },
  'en-cours':       { libelle: 'En cours',          voile: 'bleu' },
  'attente-client': { libelle: 'En attente client', voile: 'ambre' },
  'en-revue':       { libelle: 'En revue',          voile: 'violet' },
  'livraison':      { libelle: 'Livraison',         voile: 'violet' },
  'maintenance':    { libelle: 'Maintenance',       voile: 'vert' },
  'termine':        { libelle: 'Terminé',           voile: 'vert' },
  'suspendu':       { libelle: 'Suspendu',          voile: 'gris' },
  'archive':        { libelle: 'Archivé',           voile: 'gris' },
};
export const PROJETS_ACTIFS = ['cadrage', 'planifie', 'en-cours', 'attente-client', 'en-revue', 'livraison', 'maintenance'];
/* Un projet est actif tant qu'il n'est pas terminé, suspendu ou archivé.
   Dire ce qui sort de la liste, plutôt qu'énumérer ce qui y entre : un
   statut inconnu ne fait ainsi jamais disparaître un projet de l'écran. */
export const PROJETS_CLOS = ['termine', 'suspendu', 'archive'];

/* Les projets créés avant le Client Hub portent « actif », un statut qui
   n'existe plus. On le traduit à la lecture, sans attendre la migration. */
const ALIAS_STATUT_PROJET = { actif: 'en-cours', inactif: 'suspendu', 'en-pause': 'suspendu' };
export const statutProjet = (p) => {
  const brut = (p && p.statut) || '';
  if (STATUTS_PROJET[brut]) return brut;
  return ALIAS_STATUT_PROJET[brut] || 'en-cours';
};
export const projetEstActif = (p) => Boolean(p) && !p.archive && !PROJETS_CLOS.includes(statutProjet(p));

export const TYPES_PROJET = {
  'application-mobile': 'Application mobile',
  'site-vitrine':       'Site vitrine',
  'e-commerce':         'E-commerce',
  'saas':               'SaaS',
  'backend':            'Backend',
  'api':                'API',
  'infrastructure':     'Infrastructure',
  'design':             'Design',
  'maintenance':        'Maintenance',
  'marketing':          'Marketing',
  'autre':              'Autre',
};

export const TYPES_COMPOSANT = {
  'ios':            'Application iOS',
  'android':        'Application Android',
  'web':            'Application web',
  'admin':          'Tableau de bord',
  'landing':        'Landing page',
  'backend':        'Backend / API',
  'infrastructure': 'Infrastructure',
  'design':         'Design',
  'autre':          'Autre',
};

export const STATUTS_COMPOSANT = {
  'a-venir':  { libelle: 'À venir',  voile: 'gris' },
  'en-cours': { libelle: 'En cours', voile: 'bleu' },
  'en-test':  { libelle: 'En test',  voile: 'violet' },
  'livre':    { libelle: 'Livré',    voile: 'vert' },
  'en-pause': { libelle: 'En pause', voile: 'ambre' },
};

export const SANTES = {
  'ok':        { libelle: 'Sur la bonne voie', voile: 'vert' },
  'attention': { libelle: 'Attention',         voile: 'ambre' },
  'bloque':    { libelle: 'Bloqué',            voile: 'rouge' },
};

/* --- La feuille de route ------------------------------------------------ */

export const STATUTS_JALON = {
  'a-venir':  { libelle: 'À venir',  voile: 'gris' },
  'planifie': { libelle: 'Planifié', voile: 'bleu' },
  'en-cours': { libelle: 'En cours', voile: 'bleu' },
  'bloque':   { libelle: 'Bloqué',   voile: 'rouge' },
  'termine':  { libelle: 'Terminé',  voile: 'vert' },
};

/* --- Les tâches --------------------------------------------------------- */

export const STATUTS_TACHE = {
  'a-faire':        { libelle: 'À faire',           voile: 'gris',   ordre: 1 },
  'en-cours':       { libelle: 'En cours',          voile: 'bleu',   ordre: 2 },
  'en-revue':       { libelle: 'En revue',          voile: 'violet', ordre: 3 },
  'bloquee':        { libelle: 'Bloquée',           voile: 'rouge',  ordre: 4 },
  'attente-client': { libelle: 'En attente client', voile: 'ambre',  ordre: 5 },
  'terminee':       { libelle: 'Terminée',          voile: 'vert',   ordre: 6 },
};

export const PRIORITES = {
  'faible':     { libelle: 'Faible',     voile: 'gris',  rang: 4 },
  'normale':    { libelle: 'Normale',    voile: 'bleu',  rang: 3 },
  'importante': { libelle: 'Importante', voile: 'ambre', rang: 2 },
  'bloquante':  { libelle: 'Bloquante',  voile: 'rouge', rang: 1 },
};

/* --- Les validations ---------------------------------------------------- */

export const TYPES_VALIDATION = {
  'design':         'Design',
  'fonctionnalite': 'Fonctionnalité',
  'jalon':          'Jalon',
  'contenu':        'Contenu',
  'maquette':       'Maquette',
  'release':        'Version',
  'document':       'Document',
  'devis':          'Devis',
  'changement':     'Changement',
  'autre':          'Autre',
};
export const STATUTS_VALIDATION = {
  'en-attente':    { libelle: 'À valider',               voile: 'ambre' },
  'approuvee':     { libelle: 'Approuvée',               voile: 'vert' },
  'modifications': { libelle: 'Modifications demandées', voile: 'violet' },
  'annulee':       { libelle: 'Annulée',                 voile: 'gris' },
};

/* --- Les fichiers et les liens ------------------------------------------ */

export const CATEGORIES_FICHIER = {
  'design':    'Design',
  'contrats':  'Contrats',
  'devis':     'Devis',
  'factures':  'Factures',
  'cahier':    'Cahier des charges',
  'assets':    'Assets',
  'logos':     'Logos',
  'captures':  'Captures',
  'livrables': 'Livrables',
  'technique': 'Documents techniques',
  'reunions':  'Réunions',
  'autres':    'Autres',
};
/* Ce qu'un client peut déposer lui-même. */
export const CATEGORIES_CLIENT = ['assets', 'logos', 'captures', 'cahier', 'autres'];

export const CATEGORIES_LIEN = {
  'production':     'Production',
  'mobile':         'Applications mobiles',
  'test':           'Test',
  'code':           'Code',
  'design':         'Design',
  'infrastructure': 'Infrastructure',
  'documentation':  'Documentation',
  'autre':          'Autre',
};

/* --- Les versions ------------------------------------------------------- */

export const STATUTS_RELEASE = {
  'developpement': { libelle: 'En développement', voile: 'gris' },
  'test':          { libelle: 'En test',          voile: 'violet' },
  'soumise':       { libelle: 'Soumise',          voile: 'bleu' },
  'revue':         { libelle: 'En review',        voile: 'bleu' },
  'disponible':    { libelle: 'Disponible',       voile: 'vert' },
  'retiree':       { libelle: 'Retirée',          voile: 'gris' },
};
export const TYPES_CHANGEMENT = {
  'nouveau':      { libelle: 'Nouveau',      voile: 'vert' },
  'amelioration': { libelle: 'Amélioration', voile: 'bleu' },
  'correction':   { libelle: 'Correction',   voile: 'ambre' },
  'technique':    { libelle: 'Technique',    voile: 'gris' },
};

/* --- Les notes et décisions --------------------------------------------- */

export const TYPES_NOTE = {
  'decision':    { libelle: 'Décision',        voile: 'violet' },
  'information': { libelle: 'Information',     voile: 'bleu' },
  'idee':        { libelle: 'Idée',            voile: 'vert' },
  'risque':      { libelle: 'Risque',          voile: 'rouge' },
  'reunion':     { libelle: 'Note de réunion', voile: 'gris' },
};

/* --- Les pièces comptables ---------------------------------------------- */

export const STATUTS_DEVIS = {
  'brouillon': { libelle: 'Brouillon',        voile: 'gris' },
  'envoye':    { libelle: 'À votre décision', voile: 'ambre', equipe: 'Envoyé' },
  'consulte':  { libelle: 'Consulté',         voile: 'bleu' },
  'accepte':   { libelle: 'Accepté',          voile: 'vert' },
  'refuse':    { libelle: 'Refusé',           voile: 'gris' },
  'expire':    { libelle: 'Expiré',           voile: 'gris' },
  'annule':    { libelle: 'Annulé',           voile: 'gris' },
};
export const STATUTS_FACTURE = {
  'brouillon': { libelle: 'Brouillon',           voile: 'gris' },
  'envoyee':   { libelle: 'Envoyée',             voile: 'bleu' },
  'a-payer':   { libelle: 'À payer',             voile: 'ambre' },
  'partielle': { libelle: 'Partiellement payée', voile: 'ambre' },
  'payee':     { libelle: 'Payée',               voile: 'vert' },
  'en-retard': { libelle: 'En retard',           voile: 'rouge' },
  'annulee':   { libelle: 'Annulée',             voile: 'gris' },
  'avoir':     { libelle: 'Avoir',               voile: 'gris' },
};
export const FACTURES_DUES = ['a-payer', 'partielle', 'en-retard'];
export const MOYENS_PAIEMENT = { 'virement': 'Virement', 'carte': 'Carte', 'stripe': 'Stripe', 'cheque': 'Chèque', 'especes': 'Espèces', 'autre': 'Autre' };

/* --- Les demandes de nouveau projet ------------------------------------- */

export const STATUTS_PREPROJET = {
  'nouvelle':      { libelle: 'Nouvelle demande', voile: 'bleu' },
  'discussion':    { libelle: 'En discussion',    voile: 'bleu' },
  'qualification': { libelle: 'Qualification',    voile: 'violet' },
  'estimation':    { libelle: 'Estimation',       voile: 'violet' },
  'devis':         { libelle: 'Devis envoyé',     voile: 'ambre' },
  'acceptee':      { libelle: 'Acceptée',         voile: 'vert' },
  'projet':        { libelle: 'Projet créé',      voile: 'vert' },
  'refusee':       { libelle: 'Sans suite',       voile: 'gris' },
};

/* ==========================================================================
   La session
   ========================================================================== */

const memeEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Attend que la session soit connue, puis résout le rôle et l'accès.
 * Renvoie { utilisateur, equipe, projets, organisations, profil, erreur }.
 * `utilisateur` vaut null hors session.
 */
export const session = () => new Promise((resolve) => {
  const arret = onAuthStateChanged(auth, async (utilisateur) => {
    arret();
    if (!utilisateur) return resolve({ utilisateur: null, equipe: null, projets: [], organisations: [], profil: null });

    // Le rôle vient de Firestore, jamais du navigateur : un document
    // equipe/{uid} n'est écrit que par l'Admin SDK.
    let equipe = null;
    try {
      const fiche = await getDoc(doc(bdd, 'equipe', utilisateur.uid));
      if (fiche.exists()) equipe = { uid: utilisateur.uid, ...fiche.data() };
    } catch (e) { /* pas de fiche : c'est un client */ }

    let profil = null;
    try {
      const fiche = await getDoc(doc(bdd, 'profils', utilisateur.uid));
      if (fiche.exists()) profil = fiche.data();
    } catch (e) { /* pas encore de profil */ }

    const projets = [];
    const organisations = [];
    let erreur = null;
    try {
      const requete = equipe
        ? query(collection(bdd, 'projets'), orderBy('nom'))
        : query(collection(bdd, 'projets'), where('membres', 'array-contains', utilisateur.uid));
      (await getDocs(requete)).forEach((d) => projets.push({ id: d.id, ...d.data() }));
      const requeteOrg = equipe
        ? query(collection(bdd, 'organisations'), orderBy('nom'))
        : query(collection(bdd, 'organisations'), where('membres', 'array-contains', utilisateur.uid));
      (await getDocs(requeteOrg)).forEach((d) => organisations.push({ id: d.id, ...d.data() }));
    } catch (e) {
      // Une liste vide et un accès refusé ne veulent pas dire la même chose :
      // on remonte l'erreur pour ne pas afficher « aucun projet » à tort.
      erreur = e && e.code ? e.code : 'indisponible';
      console.error('[suivi] lecture des projets impossible :', erreur);
    }

    resolve({ utilisateur, equipe, projets, organisations, profil, erreur });
  });
});

/** Renvoie vers la connexion si la session manque. */
export const exigerSession = async () => {
  const s = await session();
  if (!s.utilisateur) {
    const retour = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`./?retour=${retour}`);
    return null;
  }
  return s;
};

export const quitter = async () => {
  await signOut(auth);
  location.replace('./');
};

/** Le nom à afficher pour la personne connectée. */
export const nomAffiche = (s) => {
  if (!s || !s.utilisateur) return '';
  if (s.equipe && s.equipe.nom) return s.equipe.nom;
  if (s.profil && s.profil.nom) return s.profil.nom;
  if (s.utilisateur.displayName) return s.utilisateur.displayName;
  for (const org of s.organisations || []) {
    const c = (org.contacts || []).find((x) => x.uid === s.utilisateur.uid || memeEmail(x.email, s.utilisateur.email));
    if (c && c.nom) return c.nom;
  }
  for (const p of s.projets || []) {
    if (p.client && memeEmail(p.client.email, s.utilisateur.email) && p.client.nom) return p.client.nom;
  }
  return s.utilisateur.email || '';
};
export const prenom = (nom) => String(nom || '').trim().split(/\s+/)[0] || '';

/* ==========================================================================
   Les petits outils
   ========================================================================== */

export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => Array.from(racine.querySelectorAll(sel));

/** Échappe le texte avant toute insertion dans le HTML. Aucune exception. */
export const echapper = (valeur) => String(valeur ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texte libre rendu avec ses retours à la ligne, sans HTML injecté. */
export const enParagraphes = (texte) => echapper(texte)
  .split(/\n{2,}/).map((bloc) => `<p>${bloc.replace(/\n/g, '<br>')}</p>`).join('');

/** Texte libre où les adresses http deviennent des liens, rien d'autre. */
export const avecLiens = (texte) => enParagraphes(texte)
  .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

export const enDate = (valeur) => {
  if (!valeur) return null;
  if (typeof valeur.toDate === 'function') return valeur.toDate();
  if (valeur instanceof Date) return valeur;
  if (typeof valeur === 'object' && typeof valeur.seconds === 'number') return new Date(valeur.seconds * 1000);
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? null : d;
};

export const dateCourte = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};
export const dateLongue = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
};
export const dateHeure = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
};
export const heure = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
};
/** Pour un champ <input type="date">. */
export const dateISO = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
};
/** Pour un champ <input type="datetime-local">. */
export const dateHeureISO = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  return `${dateISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const debutDeJour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const JOUR = 24 * 3600 * 1000;

/** Nombre de jours entre aujourd'hui et la date, négatif si passé. */
export const joursAvant = (valeur) => {
  const d = enDate(valeur);
  if (!d) return null;
  return Math.round((debutDeJour(d) - debutDeJour(new Date())) / JOUR);
};

/** « Aujourd'hui », « Demain », « Dans 3 jours », « En retard de 2 jours ». */
export const echeance = (valeur) => {
  const n = joursAvant(valeur);
  if (n === null) return { texte: '', ton: 'gris', retard: false };
  if (n < -1) return { texte: `En retard de ${-n} jours`, ton: 'rouge', retard: true };
  if (n === -1) return { texte: "En retard d'un jour", ton: 'rouge', retard: true };
  if (n === 0) return { texte: "Aujourd'hui", ton: 'ambre', retard: false };
  if (n === 1) return { texte: 'Demain', ton: 'ambre', retard: false };
  if (n <= 7) return { texte: `Dans ${n} jours`, ton: 'bleu', retard: false };
  return { texte: dateCourte(valeur), ton: 'gris', retard: false };
};

/** « il y a 3 heures », pour les listes. */
export const depuis = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24); if (j < 31) return `il y a ${j} j`;
  return dateCourte(d);
};

/** Le libellé de jour pour grouper une chronologie. */
export const jourRelatif = (valeur) => {
  const n = joursAvant(valeur);
  if (n === 0) return "Aujourd'hui";
  if (n === -1) return 'Hier';
  return dateCourte(valeur);
};

/* Un nombre lisible : les milliers séparés, sans unité. */
export const nombre = (valeur) => (typeof valeur === 'number' && Number.isFinite(valeur)
  ? valeur.toLocaleString('fr-FR')
  : String(valeur || ''));

export const montant = (valeur, decimales = 0) => (typeof valeur === 'number' && Number.isFinite(valeur))
  ? valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimales, maximumFractionDigits: Math.max(decimales, 2) })
  : '';

export const poids = (octets) => {
  if (!octets) return '';
  const ko = octets / 1024;
  return ko < 1024 ? `${Math.round(ko)} ko` : `${(ko / 1024).toFixed(1)} Mo`;
};

export const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .slice(0, 2).map((m) => m[0] || '').join('').toUpperCase();

export const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? (plusieurs || `${un}s`) : un}`;
export const borner = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
export const pourcent = (v) => `${borner(v)} %`;

/** Tri stable par date décroissante, quelle que soit la forme de la date. */
export const parDateDesc = (champ = 'date') => (a, b) => {
  const da = enDate(a[champ]); const db = enDate(b[champ]);
  return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
};
export const parDateAsc = (champ = 'date') => (a, b) => -parDateDesc(champ)(a, b);

/* --- Les briques d'affichage héritées (les anciens écrans les importent) - */

export const pastilleStatut = (statut) => {
  const s = STATUTS[statut] || { libelle: statut, voile: 'gris' };
  return `<span class="pastille pastille--${s.voile}">${echapper(s.libelle)}</span>`;
};
export const pastilleUrgence = (urgence) => {
  const u = URGENCES[urgence] || { libelle: urgence, voile: 'gris' };
  return `<span class="puce puce--${u.voile}"><i aria-hidden="true"></i>${echapper(u.libelle)}</span>`;
};
export const etiquetteType = (type) => {
  const t = TYPES[type] || { libelle: type };
  return `<span class="etiquette">${echapper(t.libelle)}</span>`;
};

/** Message court, disparaît seul. Conservé pour les anciens écrans. */
export const avis = (texte, genre = 'ok') => {
  let zone = $('#avis');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'avis';
    zone.className = 'avis';
    zone.setAttribute('role', 'status');
    zone.setAttribute('aria-live', 'polite');
    document.body.appendChild(zone);
  }
  zone.className = `avis avis--${genre} avis--visible`;
  zone.textContent = texte;
  clearTimeout(avis._minuteur);
  avis._minuteur = setTimeout(() => zone.classList.remove('avis--visible'), 4500);
};

export const rienAAfficher = (titre, texte = '') => `
  <div class="vide">
    <p class="vide-titre">${echapper(titre)}</p>
    ${texte ? `<p class="vide-texte">${echapper(texte)}</p>` : ''}
  </div>`;

/* --- Les pièces jointes ------------------------------------------------- */

export const TAILLE_MAX = 10 * 1024 * 1024;
const TAILLE_MAX_VIDEO = 100 * 1024 * 1024;
const TYPES_ACCEPTES = /^(image\/|video\/(mp4|quicktime|webm)$|application\/pdf$|text\/plain$|application\/zip$|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))$)/;

/**
 * Envoie un fichier et renvoie la fiche à ranger dans `pieces`.
 * Refuse tout ce que les règles de stockage refuseraient, pour donner
 * l'erreur à l'écran plutôt qu'un échec silencieux. `surProgres` reçoit un
 * pourcentage.
 */
export const envoyerPiece = async (fichier, chemin, surProgres) => {
  if (!TYPES_ACCEPTES.test(fichier.type)) {
    throw new Error(`« ${fichier.name} » : ce type de fichier n'est pas accepté.`);
  }
  const plafond = /^video\//.test(fichier.type) ? TAILLE_MAX_VIDEO : TAILLE_MAX;
  if (fichier.size > plafond) {
    throw new Error(`« ${fichier.name} » dépasse ${Math.round(plafond / 1024 / 1024)} Mo.`);
  }
  const nom = `${Date.now()}-${fichier.name.replace(/[^\w.\-]/g, '_')}`;
  const cible = refStockage(stockage, `${chemin}/${nom}`);
  await new Promise((ok, ko) => {
    const tache = uploadBytesResumable(cible, fichier, { contentType: fichier.type });
    tache.on('state_changed',
      (s) => { if (surProgres) surProgres(Math.round((s.bytesTransferred / s.totalBytes) * 100)); },
      ko, ok);
  });
  return { nom: fichier.name, chemin: cible.fullPath, taille: fichier.size, type: fichier.type };
};

export const lienPiece = (piece) => getDownloadURL(refStockage(stockage, piece.chemin));
