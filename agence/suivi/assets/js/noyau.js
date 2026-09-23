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

/*
 * `suite` dit ce qui va se passer ensuite, et `chez` qui tient la balle.
 * Sans ces deux-là, le client lisait un mot d'état et écrivait un message
 * pour savoir la seule chose qui l'intéresse : et maintenant ?
 */
export const STATUTS = {
  'nouveau':           { libelle: 'Reçue',                voile: 'bleu',   ordre: 1,  chez: 'capmedia', suite: 'Nous la lisons et revenons vers vous.' },
  'a-analyser':        { libelle: 'À analyser',           voile: 'bleu',   ordre: 2,  chez: 'capmedia', suite: 'Nous regardons ce que cela implique, puis nous vous disons quand.' },
  'en-attente-client': { libelle: "Besoin d'information", voile: 'ambre',  ordre: 3,  chez: 'client',   client: 'Une réponse est attendue de vous', suite: 'Répondez ci-dessous : la demande repart dès votre réponse.' },
  'acceptee':          { libelle: 'Acceptée',             voile: 'violet', ordre: 4,  chez: 'capmedia', suite: 'Elle entre dans le planning. Vous verrez la date apparaître ici.' },
  'planifiee':         { libelle: 'Planifiée',            voile: 'violet', ordre: 5,  chez: 'capmedia', suite: 'Le travail va commencer.' },
  'en-cours':          { libelle: 'En cours',             voile: 'bleu',   ordre: 6,  chez: 'capmedia', suite: 'Nous y travaillons. La prochaine étape est une version à essayer.' },
  'en-revue':          { libelle: 'En revue',             voile: 'violet', ordre: 7,  chez: 'capmedia', suite: 'Fait, en cours de relecture chez nous avant de vous être livré.' },
  'a-valider':         { libelle: 'À valider',            voile: 'ambre',  ordre: 8,  chez: 'client',   client: 'À valider par vous', suite: 'Vérifiez de votre côté, puis validez ou dites-nous ce qui manque.' },
  'resolu':            { libelle: 'Terminée',             voile: 'vert',   ordre: 9,  chez: '',         suite: 'Vous pouvez la rouvrir pendant sept jours.' },
  'refuse':            { libelle: 'Refusée',              voile: 'gris',   ordre: 10, chez: '',         suite: '' },
  'annulee':           { libelle: 'Annulée',              voile: 'gris',   ordre: 11, chez: '',         suite: '' },
  'ferme':             { libelle: 'Fermée',               voile: 'gris',   ordre: 12, chez: '',         suite: '' },
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
  'admin':   { libelle: 'Tableau de bord', court: 'Tableau',   icone: 'kanban',   voile: 'violet', composant: 'admin' },
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

/*
 * Le cycle d'un projet, du brouillon à l'archive. Les trois premiers
 * états sont commerciaux et vivent avant tout travail : un projet se
 * prépare en brouillon, invisible du client, puis se propose, puis se
 * signe. Ce n'est qu'ensuite qu'il s'ouvre et que le travail commence.
 */
export const STATUTS_PROJET = {
  'brouillon':      { libelle: 'En préparation',    voile: 'gris',   equipe: 'Brouillon' },
  'prospect':       { libelle: 'Prospect',          voile: 'gris' },
  'devis-envoye':   { libelle: 'Devis à signer',    voile: 'ambre',  client: 'Devis à signer' },
  'devis-signe':    { libelle: 'Devis signé',       voile: 'vert' },
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
export const PROJETS_ACTIFS = ['devis-envoye', 'devis-signe', 'cadrage', 'planifie', 'en-cours', 'attente-client', 'en-revue', 'livraison', 'maintenance'];
/* Un projet est actif tant qu'il n'est pas terminé, suspendu ou archivé.
   Dire ce qui sort de la liste, plutôt qu'énumérer ce qui y entre : un
   statut inconnu ne fait ainsi jamais disparaître un projet de l'écran. */
export const PROJETS_CLOS = ['termine', 'suspendu', 'archive'];

/* Les états d'avant le travail : le projet se prépare ou se négocie. */
export const PROJETS_AVANT_TRAVAIL = ['brouillon', 'prospect', 'devis-envoye'];

/* La portée d'un devis. Le devis fondateur ouvre le projet et le fait
   passer en « signé » quand le client l'accepte ; un devis complémentaire
   étend un projet déjà lancé et ne touche jamais à son état. */
export const PORTEES_DEVIS = {
  'initial':        { libelle: 'Devis initial',       court: 'Initial',  aide: 'Le devis qui lance le projet. Sa signature fait démarrer le travail.' },
  'complementaire': { libelle: 'Devis complémentaire', court: 'Avenant', aide: "Une extension d'un projet déjà lancé. Sa signature ne change pas l'état du projet." },
};

/* --- La maintenance continue -------------------------------------------

   Un forfait par projet, dans « projets/{p}/maintenance/contrat ». Autour
   de lui, dans la même collection : les séquences (une période, un
   nombre de jours compris), les journées (un jour travaillé, ce qu'on y
   a fait) et les évolutions (ce qu'on ajoute au fil du forfait).

   Le client lit tout. Il n'écrit que deux choses : sa demande de forfait
   et ses propositions d'évolution. Les modalités, c'est l'équipe. */
export const STATUTS_MAINTENANCE = {
  'demande':     { libelle: 'Demandé',             voile: 'ambre', ordre: 1, aide: 'Le client a demandé un forfait. Une proposition lui est due.' },
  'proposition': { libelle: 'Proposition envoyée', voile: 'bleu',  ordre: 2, aide: 'Les modalités sont posées. Le devis est chez le client.' },
  'actif':       { libelle: 'En cours',            voile: 'vert',  ordre: 3, aide: 'Le forfait tourne : des jours sont travaillés à chaque période.' },
  'suspendu':    { libelle: 'Suspendu',            voile: 'gris',  ordre: 4, aide: 'En pause, d\'un commun accord. Rien n\'est perdu.' },
  'termine':     { libelle: 'Terminé',             voile: 'gris',  ordre: 5, aide: 'Le forfait est arrivé à son terme. Son histoire reste lisible.' },
};

export const RECONDUCTIONS_MAINTENANCE = {
  'mensuelle':     { libelle: 'Chaque mois',      periode: 'mois' },
  'trimestrielle': { libelle: 'Chaque trimestre', periode: 'trimestre' },
  'annuelle':      { libelle: 'Chaque année',     periode: 'an' },
};

/* Les quatre pas d'un forfait, dans l'ordre. La frise les coche d'après
   le statut du contrat et la réponse au devis : rien à cocher à la main. */
export const ETAPES_FORFAIT = [
  { cle: 'demande',     libelle: 'Demande reçue',        detail: 'Le client a dit ce dont il a besoin.' },
  { cle: 'proposition', libelle: 'Proposition envoyée',  detail: 'Les modalités et le devis sont dans son espace.' },
  { cle: 'accord',      libelle: 'Devis accepté',        detail: 'Le client a accepté le devis du forfait.' },
  { cle: 'actif',       libelle: 'Forfait en cours',     detail: 'Les séquences s\'enchaînent, les jours se comptent.' },
];

export const STATUTS_SEQUENCE = {
  'a-venir':  { libelle: 'À venir',  voile: 'gris', ordre: 2 },
  'en-cours': { libelle: 'En cours', voile: 'bleu', ordre: 1 },
  'close':    { libelle: 'Close',    voile: 'vert', ordre: 3 },
};

export const STATUTS_JOURNEE = {
  'prevue': { libelle: 'Prévue', voile: 'gris' },
  'faite':  { libelle: 'Faite',  voile: 'vert' },
};

/* Une journée se compte en fractions : un quart pour une correction
   rapide, la journée entière pour une évolution. */
export const DUREES_JOURNEE = {
  '0.25': 'Un quart de journée',
  '0.5':  'Une demi-journée',
  '1':    'Une journée',
  '1.5':  'Une journée et demie',
  '2':    'Deux journées',
  '3':    'Trois journées',
};

export const STATUTS_EVOLUTION = {
  'proposee':  { libelle: 'Proposée',  voile: 'ambre', ordre: 1, aide: 'Quelqu\'un l\'a suggérée. Rien n\'est décidé.' },
  'acceptee':  { libelle: 'Acceptée',  voile: 'bleu',  ordre: 2, aide: 'On la fera. Reste à dire quand.' },
  'planifiee': { libelle: 'Planifiée', voile: 'bleu',  ordre: 3, aide: 'Elle a sa séquence.' },
  'livree':    { libelle: 'Livrée',    voile: 'vert',  ordre: 4, aide: 'Elle est dans l\'application.' },
  'refusee':   { libelle: 'Écartée',   voile: 'gris',  ordre: 5, aide: 'On ne la fera pas, et on a dit pourquoi.' },
};

/* Le nombre de jours, dit en français : « 1,5 jour », « une demi-journée ». */
export const joursEnClair = (n) => {
  const v = Number(n) || 0;
  if (v === 0.25) return 'un quart de journée';
  if (v === 0.5) return 'une demi-journée';
  if (v === 1) return 'une journée';
  const texte = Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  return `${texte} jours`;
};

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
  'landing':        'Site vitrine',
  'backend':        'Serveur et API',
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
/* « Jalon » ne se dit pas. Une étape est une étape : le mot est le même
   dans la bouche du client, dans le nôtre et à l'écran. */

export const STATUTS_ETAPE = {
  'a-venir':  { libelle: 'À venir',  voile: 'gris' },
  'planifie': { libelle: 'Planifié', voile: 'bleu' },
  'en-cours': { libelle: 'En cours', voile: 'bleu' },
  'bloque':   { libelle: 'Bloqué',   voile: 'rouge' },
  'termine':  { libelle: 'Terminé',  voile: 'vert' },
};

/*
 * La tenue des délais. Une date brute ne dit rien : le client la lit, la
 * compare mentalement à aujourd'hui, et nous écrit pour savoir. Le verdict
 * dit à sa place, et « à risque » ne sort jamais d'une intuition : il faut
 * un fait nommable, un point bloquant ouvert ou une étape déjà dépassée.
 */
export const VERDICTS = {
  'livre':    { libelle: 'Livré',          voile: 'vert',  icone: 'check' },
  'tenu':     { libelle: 'Dans les temps', voile: 'vert',  icone: 'check' },
  'risque':   { libelle: 'À risque',       voile: 'ambre', icone: 'alerte' },
  'depasse':  { libelle: 'Dépassée',       voile: 'rouge', icone: 'alerte' },
  'sans':     { libelle: 'Pas de date',    voile: 'gris',  icone: 'horloge' },
};

/* Les motifs d'un report. Un report sans motif est un report qu'on relit
   six mois plus tard sans savoir pourquoi. */
export const MOTIFS_REPORT = {
  'attente-client':  'En attente du client',
  'perimetre':       'Le périmètre a changé',
  'technique':       'Obstacle technique',
  'tiers':           'Dépendance à un tiers',
  'magasin':         "Délai d'un magasin d'applications",
  'capmedia':        'De notre fait',
  'autre':           'Autre',
};

/* --- Les tâches --------------------------------------------------------- */

/* ==========================================================================
   La plateforme de tests
   ========================================================================== */

/* Le niveau de couverture décide combien de personnes passent un scénario.
   « socle » : le comportement dépend du système, donc un testeur iOS et un
   testeur Android le passent tous les deux. « transversal » : il touche la
   synchronisation ou les langues, donc il demande deux appareils par
   construction. « reparti » : il se comporte pareil partout, une personne
   suffit. Passer un scénario deux fois coûte le double : on ne le fait que
   là où la réponse peut différer. */
export const NIVEAUX_SCENARIO = {
  'socle':       { libelle: 'Socle',       court: 'Socle',  voile: 'bleu',   double: true,  aide: 'Le comportement dépend du système : un testeur iOS et un testeur Android le passent.' },
  'transversal': { libelle: 'Transversal', court: 'Transv', voile: 'violet', double: true,  aide: 'Synchronisation, langues, abonnement : il demande deux appareils.' },
  'reparti':     { libelle: 'Réparti',     court: 'Simple', voile: 'gris',   double: false, aide: 'Se comporte pareil partout : une seule personne le passe.' },
};

export const BLOCS_SCENARIO = {
  'dates-importantes': { libelle: 'Dates importantes' },
  'taches':            { libelle: 'Tâches' },
  'rituels':           { libelle: 'Rituels' },
  'objectifs':         { libelle: 'Objectifs' },
  'voyages':           { libelle: 'Voyages' },
  'journal':           { libelle: 'Journal' },
  'idees':             { libelle: 'Idées' },
  'transversal':       { libelle: 'Transversal' },
  'compte-charge':     { libelle: 'Compte chargé et archivées' },
  'statistiques':      { libelle: 'Statistiques' },
  'parametres':        { libelle: 'Paramètres et compte' },
  'premium':           { libelle: 'Abonnement Premium' },
  'divers':            { libelle: 'Divers' },
};

export const PLATEFORMES_TEST = {
  'ios':     { libelle: 'iOS',     court: 'iOS' },
  'android': { libelle: 'Android', court: 'Android' },
  'web':     { libelle: 'Web',     court: 'Web' },
};

export const STATUTS_CAMPAGNE = {
  'preparation': { libelle: 'En préparation', voile: 'gris',  ordre: 1 },
  'en-cours':    { libelle: 'En cours',       voile: 'bleu',  ordre: 2 },
  'close':       { libelle: 'Close',          voile: 'vert',  ordre: 3 },
};

export const RESULTATS_PASSAGE = {
  'ok': { libelle: 'OK', voile: 'vert' },
  'ko': { libelle: 'KO', voile: 'rouge' },
  'na': { libelle: 'NA', voile: 'gris' },
};

/* Les quatre mots sont ceux de la proposition remise au client, et ceux
   des URGENCES d'un ticket : bloquante, critique, importante, mineure. Un
   client qui lit « majeur » dans le Hub alors qu'il a acheté « critique »
   se demande s'il s'agit de la même échelle. C'en est une seule. */
export const GRAVITES_ANOMALIE = {
  'bloquant':  { libelle: 'Bloquant',  voile: 'rouge', rang: 1, aide: 'Le testeur ne peut pas continuer.' },
  'critique':  { libelle: 'Critique',  voile: 'rouge', rang: 2, aide: 'Une fonction majeure est cassée.' },
  'important': { libelle: 'Important', voile: 'ambre', rang: 3, aide: 'Gênant, mais on peut contourner.' },
  'mineur':    { libelle: 'Mineur',    voile: 'gris',  rang: 4, aide: 'Détail, confort ou apparence.' },
};

export const STATUTS_ANOMALIE = {
  'nouvelle':   { libelle: 'Nouvelle',   voile: 'ambre',  ordre: 1 },
  'confirmee':  { libelle: 'Confirmée',  voile: 'rouge',  ordre: 2 },
  'corrigee':   { libelle: 'Corrigée',   voile: 'vert',   ordre: 3 },
  'sans-suite': { libelle: 'Sans suite', voile: 'gris',   ordre: 4 },
};

/* Une référence de scénario : deux lettres, un tiret, un numéro. Le « R »
   des régressions est admis (« DI-R1 »), parce que le plan les nomme ainsi
   et que c'est la référence qui fait foi dans les rapports. */
export const REF_SCENARIO = /^[A-Z]{2}-R?\d{1,3}$/;

/* Les parcours automatisés.

   Un parcours est rejoué par une machine à chaque version : c'est ce qui
   empêche un défaut corrigé de revenir. Il ne remplace pas un testeur, il
   remplace la partie répétitive de son travail.

   Le dernier état vient de l'outil, pas d'une saisie : Maestro et
   Playwright rendent un verdict, et le recopier à la main serait la
   première chose qu'on oublierait de faire. */
export const ETATS_PARCOURS = {
  'a-ecrire':  { libelle: 'À écrire',   voile: 'gris',   ordre: 1 },
  'ecrit':     { libelle: 'Écrit',      voile: 'bleu',   ordre: 2 },
  'vert':      { libelle: 'Vert',       voile: 'vert',   ordre: 3 },
  'rouge':     { libelle: 'Rouge',      voile: 'rouge',  ordre: 4 },
  'instable':  { libelle: 'Instable',   voile: 'ambre',  ordre: 5 },
  'suspendu':  { libelle: 'Suspendu',   voile: 'gris',   ordre: 6 },
};

export const OUTILS_PARCOURS = {
  'maestro':    { libelle: 'Maestro',    court: 'Maestro',    ou: 'iOS et Android' },
  'playwright': { libelle: 'Playwright', court: 'Playwright', ou: 'Web' },
  'testlab':    { libelle: 'Firebase Test Lab', court: 'Test Lab', ou: 'Matrice Android' },
  'jest':       { libelle: 'Jest',       court: 'Jest',       ou: 'Règles métier' },
};

/* Un parcours instable est pire qu'un parcours rouge : le rouge dit qu'il
   y a un défaut, l'instable n'apprend rien et on finit par l'ignorer.
   C'est la raison d'être de ce compte. */
export const PARCOURS_A_REGARDER = ['rouge', 'instable'];

/* Les règles métier ne se comptent pas comme les parcours d'interface.
   Un parcours Maestro met une minute et se lit à l'unité ; une règle Jest
   met une milliseconde, et on en écrit mille. Les aligner ligne à ligne
   noierait les parcours sous les règles. On les groupe donc par FAMILLE :
   une famille est une règle du produit, et elle porte le nombre de cas
   qu'on lui fait essayer. C'est ce nombre qui dit la profondeur. */
export const FAMILLES_REGLE = {
  'recurrences':   { libelle: 'Récurrences',            aide: 'Le dépliage d\'une répétition sur une période donnée.' },
  'dates':         { libelle: 'Dates et rappels',       aide: 'Le calcul d\'une échéance et de ses alertes.' },
  'calendrier':    { libelle: 'Calendrier et fuseaux',  aide: 'Bissextiles, heure d\'été, fuseaux, minuit.' },
  'statistiques':  { libelle: 'Statistiques',           aide: 'Totaux, taux, séries, moyennes.' },
  'limites':       { libelle: 'Limites et abonnement',  aide: 'Quotas du gratuit, droits du Premium.' },
  'validation':    { libelle: 'Validation des saisies', aide: 'Ce que le produit accepte, et ce qu\'il refuse.' },
  'tri':           { libelle: 'Tri et filtres',         aide: 'L\'ordre des listes, et ce qu\'un filtre retient.' },
  'donnees':       { libelle: 'Cohérence des données',  aide: 'Ce qui doit rester vrai après plusieurs écritures.' },
};

/* Une famille de règles est à l'un de ces trois états. Il n'y a pas
   d'« instable » ici : une règle pure est déterministe, si elle vacille
   c'est le test qui est faux, pas le produit. */
export const ETATS_REGLE = {
  'a-ecrire': { libelle: 'À écrire', voile: 'gris',  ordre: 1 },
  'vert':     { libelle: 'Vert',     voile: 'vert',  ordre: 2 },
  'rouge':    { libelle: 'Rouge',    voile: 'rouge', ordre: 3 },
};

/* Le questionnaire d'appréciation.

   Les 173 scénarios disent si l'application MARCHE. Ceci dit si elle
   PLAÎT, et c'est la seconde question qui décide du chiffre d'affaires.

   La première famille se remplit AVANT de commencer : une fois qu'on
   connaît une application, on ne retrouve plus ce regard-là. Tout le reste
   après avoir tout déroulé.

   Les quatre questions de prix ne sont pas de moi : c'est une méthode
   connue, et elle donne un intervalle acceptable au lieu d'un chiffre en
   l'air. Avec six réponses on n'a pas une étude de marché, mais on a une
   direction. */
export const FAMILLES_AVIS = {
  'impression': {
    libelle: 'Première impression', quand: 'avant',
    aide: "Deux minutes, avant de commencer. C'est le seul regard qu'on ne peut pas retrouver ensuite.",
    questions: [
      { cle: 'sert-a-quoi', type: 'texte', libelle: "Rien qu'en voyant le premier écran, à quoi sert cette application ?" },
      { cle: 'compris', type: 'echelle', libelle: 'En vingt secondes, avez-vous compris ce qu\'elle propose ?', bas: 'Pas du tout', haut: 'Tout de suite' },
      { cle: 'oeil', type: 'texte', libelle: "Qu'est-ce qui vous a attiré l'œil en premier ?" },
    ],
  },
  'esthetique': {
    libelle: 'L\'esthétique', quand: 'apres',
    questions: [
      { cle: 'belle', type: 'echelle', libelle: 'Belle ou pas ?', bas: 'Pas belle', haut: 'Très belle' },
      { cle: 'moderne', type: 'echelle', libelle: 'Moderne ou datée ?', bas: 'Datée', haut: 'Moderne' },
      { cle: 'couleurs', type: 'choix', libelle: 'Les couleurs', options: ['Agréables', 'Neutres', 'Fatigantes', 'Trop nombreuses'] },
      { cle: 'lisible', type: 'echelle', libelle: 'La lisibilité des textes', bas: 'Difficile', haut: 'Très lisible' },
      { cle: 'aere', type: 'echelle', libelle: "L'aération des écrans", bas: 'Étouffant', haut: 'Bien aéré' },
      { cle: 'coherent', type: 'echelle', libelle: "La cohérence d'un écran à l'autre", bas: 'Décousu', haut: 'Très cohérent' },
      { cle: 'reussi', type: 'texte', libelle: "L'écran le plus réussi, et le plus raté" },
    ],
  },
  'facilite': {
    libelle: 'La facilité', quand: 'apres',
    questions: [
      { cle: 'trouve', type: 'echelle', libelle: 'Trouve-t-on ce qu\'on cherche ?', bas: 'Jamais', haut: 'Toujours' },
      { cle: 'vocabulaire', type: 'echelle', libelle: 'Le vocabulaire est-il clair ?', bas: 'Obscur', haut: 'Très clair' },
      { cle: 'bloque', type: 'choix', libelle: 'Combien de fois avez-vous été bloqué sans savoir quoi faire ?', options: ['Jamais', 'Une ou deux fois', 'Plusieurs fois', 'Tout le temps'] },
      { cle: 'erreurs', type: 'echelle', libelle: 'Les messages d\'erreur vous ont-ils aidé ?', bas: 'Pas du tout', haut: 'Beaucoup' },
      { cle: 'recommande', type: 'note10', libelle: 'Recommanderiez-vous cette application ?', aide: 'De 0 à 10.' },
    ],
  },
  'utilite': {
    libelle: "L'utilité", quand: 'apres',
    questions: [
      { cle: 'probleme', type: 'echelle', libelle: 'Est-ce que ça résout un vrai problème ?', bas: 'Aucun', haut: 'Un vrai' },
      { cle: 'vraie-vie', type: 'choix', libelle: "L'utiliseriez-vous dans votre vraie vie ?", options: ['Oui, tous les jours', 'Oui, de temps en temps', 'Non', 'Je ne sais pas'] },
      { cle: 'plus-utile', type: 'texte', libelle: 'La fonction la plus utile' },
      { cle: 'inutile', type: 'texte', libelle: 'Celle qui ne sert à rien' },
      { cle: 'manque', type: 'texte', libelle: 'Ce qui manque' },
    ],
  },
  'argent': {
    libelle: "L'argent", quand: 'apres',
    aide: "La famille la plus importante. Les quatre derniers montants donnent une fourchette, pas un chiffre isolé.",
    questions: [
      { cle: 'paierait', type: 'choix', libelle: 'Paieriez-vous pour cette application ?', options: ['Oui', 'Peut-être', 'Non'] },
      { cle: 'spontane', type: 'euros', libelle: 'Combien par mois, spontanément ?' },
      { cle: 'trop-cher', type: 'euros', libelle: 'À quel prix est-ce trop cher ?' },
      { cle: 'cher', type: 'euros', libelle: 'À quel prix est-ce cher, mais vous réfléchissez ?' },
      { cle: 'bonne-affaire', type: 'euros', libelle: 'À quel prix est-ce une bonne affaire ?' },
      { cle: 'suspect', type: 'euros', libelle: 'À quel prix est-ce si peu cher que vous vous méfiez de la qualité ?' },
      { cle: 'gratuit', type: 'choix', libelle: "L'offre gratuite", options: ['Suffit largement', 'Convient', 'Pousse trop vite à payer'] },
    ],
  },
  'performance': {
    libelle: 'La performance ressentie', quand: 'apres',
    questions: [
      { cle: 'rapide', type: 'echelle', libelle: 'Rapide ou lente ?', bas: 'Très lente', haut: 'Très rapide' },
      { cle: 'attentes', type: 'choix', libelle: 'Des attentes sans savoir ce qui se passe ?', options: ['Jamais', 'Parfois', 'Souvent'] },
      { cle: 'plantages', type: 'choix', libelle: 'Des plantages ?', options: ['Aucun', 'Un ou deux', 'Plusieurs'] },
      { cle: 'comparee', type: 'echelle', libelle: 'Comparée aux applications que vous utilisez tous les jours', bas: 'Bien moins bien', haut: 'Bien mieux' },
    ],
  },
  'libre': {
    libelle: 'Le libre', quand: 'apres',
    aide: "C'est ici qu'est la vraie information. Elle est restituée mot pour mot, jamais résumée.",
    questions: [
      { cle: 'garder', type: 'texte', libelle: 'Les trois choses à garder absolument' },
      { cle: 'changer', type: 'texte', libelle: 'Les trois à changer en premier' },
      { cle: 'une-phrase', type: 'texte', libelle: 'Résumez l\'application en une phrase, comme à un ami' },
      { cle: 'agace', type: 'texte', libelle: "Qu'est-ce qui vous a agacé, même un détail ?" },
    ],
  },
};

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
  'jalon':          'Étape',
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
  'revue':         { libelle: 'En validation',    voile: 'bleu' },
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
/* Une facture envoyée est déjà due : la laisser hors de cette liste la
   rendait invisible du client, qui découvrait le retard un mois plus tard. */
export const FACTURES_DUES = ['envoyee', 'a-payer', 'partielle', 'en-retard'];
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
    if (!utilisateur) return resolve({ utilisateur: null, equipe: null, testeur: null, projets: [], organisations: [], profil: null });

    // Le rôle vient de Firestore, jamais du navigateur : un document
    // equipe/{uid} n'est écrit que par l'Admin SDK.
    let equipe = null;
    try {
      const fiche = await getDoc(doc(bdd, 'equipe', utilisateur.uid));
      if (fiche.exists()) equipe = { uid: utilisateur.uid, ...fiche.data() };
    } catch (e) { /* pas de fiche : c'est un client */ }

    /* Un testeur se reconnaît à la revendication de son jeton, celle-là
       même que lisent les règles Firestore : la fiche du vivier ne lui est
       pas lisible autrement, et se fier à elle ferait boucler le contrôle
       sur lui-même. Le serveur pose la revendication à la connexion. */
    let testeur = null;
    if (!equipe) {
      try {
        const { claims } = await utilisateur.getIdTokenResult();
        if (claims && claims.testeur === true) {
          const fiche = await getDoc(doc(bdd, 'testeurs', utilisateur.uid));
          testeur = { uid: utilisateur.uid, ...(fiche.exists() ? fiche.data() : {}) };
        }
      } catch (e) { /* pas un testeur */ }
    }

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

    resolve({ utilisateur, equipe, testeur, projets, organisations, profil, erreur });
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

/**
 * Le verdict d'une échéance.
 * `clos` : la chose est livrée, la date n'a plus d'objet.
 * `risques` : les faits qui menacent la date, en clair. Le premier est
 * affiché ; sans aucun fait, une date à venir est tenue, point.
 */
export const verdictDelai = (cible, { clos = false, risques = [] } = {}) => {
  if (clos) return { cle: 'livre', ...VERDICTS.livre, detail: '' };
  const n = joursAvant(cible);
  if (n === null) return { cle: 'sans', ...VERDICTS.sans, detail: '' };
  if (n < 0) return { cle: 'depasse', ...VERDICTS.depasse, detail: `de ${-n} j` };
  if (risques.length) return { cle: 'risque', ...VERDICTS.risque, detail: risques[0] };
  if (n === 0) return { cle: 'tenu', ...VERDICTS.tenu, detail: "c'est aujourd'hui" };
  return { cle: 'tenu', ...VERDICTS.tenu, detail: `dans ${n} j` };
};

/** La liste des reports d'une fiche, du plus ancien au plus récent. */
export const reportsDe = (fiche) => (Array.isArray(fiche && fiche.reports) ? fiche.reports : [])
  .slice().sort((a, b) => (enDate(a.le) || 0) - (enDate(b.le) || 0));

/** La date d'origine : celle du premier report, sinon la date actuelle. */
export const dateOrigine = (fiche, champ = 'cible') => {
  const r = reportsDe(fiche);
  return r.length ? r[0].de : (fiche ? fiche[champ] : null);
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
/* L'âge d'une chose, en clair et en court : « 12 j », « 3 mois ». C'est le
   chiffre qui dit s'il faut relancer, et il manquait partout. */
export const age = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  const jours = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 31) return `${jours} j`;
  const mois = Math.round(jours / 30);
  return mois < 12 ? `${mois} mois` : `${Math.round(jours / 365)} an${jours >= 730 ? 's' : ''}`;
};

/* Le retard d'une échéance, toujours positif, ou une chaîne vide. */
export const retard = (valeur) => {
  const n = joursAvant(valeur);
  return n !== null && n < 0 ? `${Math.abs(n)} j` : '';
};

export const nombre = (valeur) => (typeof valeur === 'number' && Number.isFinite(valeur)
  ? valeur.toLocaleString('fr-FR')
  : String(valeur || ''));

export const montant = (valeur, decimales = 0) => (typeof valeur === 'number' && Number.isFinite(valeur))
  ? valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimales, maximumFractionDigits: Math.max(decimales, 2) })
  : '';

/* Un montant SANS sa mention est un piège à virement : le client lit
   « Reste à payer 2 875 € » sous un chiffre hors taxes, et vire 575 € de
   moins que le dû. La mention n'est donc pas décorative, elle fait partie
   du montant, et c'est pour ça qu'elle vit ici et pas dans chaque écran.

   « TTC » quand la pièce porte une TVA, « HT » quand elle n'en porte pas :
   dire « TTC » sur un montant sans taxe serait exact mais trompeur. */
export const montantHT = (valeur, decimales = 0) => (montant(valeur, decimales) ? `${montant(valeur, decimales)} HT` : '');
export const montantTTC = (valeur, decimales = 0) => (montant(valeur, decimales) ? `${montant(valeur, decimales)} TTC` : '');

/* Le TTC d'une pièce : le champ s'il existe, sinon le calcul. Trois écrans
   en avaient chacun leur copie, avec trois comportements différents sur un
   montant absent. */
export const ttcDe = (d) => (typeof (d || {}).ttc === 'number'
  ? d.ttc
  : (Number((d || {}).montant) || 0) * (1 + (Number((d || {}).tva) || 0) / 100));

/* Le montant d'une pièce, avec la mention qui va avec. Une pièce sans TVA
   n'a qu'un seul montant : on l'annonce « HT », ce qui est ce qu'elle est. */
export const montantPiece = (d, decimales = 0) => {
  const avecTaxe = Number((d || {}).tva) > 0 || (typeof (d || {}).ttc === 'number' && (d || {}).ttc !== Number((d || {}).montant));
  return avecTaxe ? montantTTC(ttcDe(d), decimales) : montantHT(Number((d || {}).montant) || ttcDe(d), decimales);
};

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
