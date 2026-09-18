/* ==========================================================================
   ESPACE DE SUIVI · le noyau
   Contrat : docs/suivi.md

   Tout ce que les écrans partagent : l'accès à Firebase, la session, le
   rôle, et les petits outils de rendu. Aucun écran ne parle à Firebase
   sans passer par ici.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getStorage, ref as refStockage, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

/* --- Le raccordement ---------------------------------------------------- */

const config = (window.AZ || {}).firebase;
if (!config) throw new Error('config-agence.js doit être chargé avant le noyau');

export const app = getApps().length ? getApps()[0] : initializeApp(config);
export const auth = getAuth(app);
export const bdd = getFirestore(app);
export const stockage = getStorage(app);

/* Banc d'essai local. Deux verrous : la machine doit être la machine de
   développement, et le branchement doit être demandé explicitement. En
   production, le premier verrou suffit à rendre ce bloc inerte. */
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
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query,
  where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  refStockage, uploadBytes, getDownloadURL, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
};

/* --- Le vocabulaire ----------------------------------------------------- */

export const STATUTS = {
  'nouveau':           { libelle: 'Nouveau',            voile: 'bleu',   ordre: 1 },
  'en-cours':          { libelle: 'En cours',           voile: 'orange', ordre: 2 },
  'en-attente-client': { libelle: 'En attente de toi',  voile: 'jaune',  ordre: 3 },
  'a-valider':         { libelle: 'À valider',          voile: 'vert',   ordre: 4 },
  'resolu':            { libelle: 'Résolu',             voile: 'vert',   ordre: 5 },
  'ferme':             { libelle: 'Fermé',              voile: 'gris',   ordre: 6 },
  'refuse':            { libelle: 'Hors périmètre',     voile: 'gris',   ordre: 7 },
};

export const URGENCES = {
  'bloquant':  { libelle: 'Bloquant',  rang: 1, couleur: 'var(--danger)' },
  'critique':  { libelle: 'Critique',  rang: 2, couleur: '#E8590C' },
  'important': { libelle: 'Important', rang: 3, couleur: '#B8860B' },
  'mineur':    { libelle: 'Mineur',    rang: 4, couleur: 'var(--texte-3)' },
};

export const TYPES = {
  'bug':      { libelle: 'Anomalie' },
  'demande':  { libelle: 'Demande' },
  'question': { libelle: 'Question' },
};

export const PLATEFORMES = {
  'ios':     'iPhone',
  'android': 'Android',
  'web':     'Web',
  '':        'Non précisée',
};

/* Ce qui attend une action de notre côté, et de l'autre. */
export const ATTEND_EQUIPE = ['nouveau', 'en-cours'];
export const ATTEND_CLIENT = ['en-attente-client', 'a-valider'];
export const OUVERTS = ['nouveau', 'en-cours', 'en-attente-client', 'a-valider'];

/* --- La session --------------------------------------------------------- */

/**
 * Attend que la session soit connue, puis résout le rôle.
 * Renvoie { utilisateur, equipe, projets } ; `utilisateur` vaut null hors session.
 */
export const session = () => new Promise((resolve) => {
  const arret = onAuthStateChanged(auth, async (utilisateur) => {
    arret();
    if (!utilisateur) return resolve({ utilisateur: null, equipe: null, projets: [] });

    // Le rôle vient de Firestore, jamais du navigateur : un document
    // equipe/{uid} n'est écrit que par l'Admin SDK.
    let equipe = null;
    try {
      const fiche = await getDoc(doc(bdd, 'equipe', utilisateur.uid));
      if (fiche.exists()) equipe = { uid: utilisateur.uid, ...fiche.data() };
    } catch (e) { /* pas de fiche : c'est un client */ }

    const projets = [];
    let erreur = null;
    try {
      const requete = equipe
        ? query(collection(bdd, 'projets'), orderBy('nom'))
        : query(collection(bdd, 'projets'), where('membres', 'array-contains', utilisateur.uid));
      (await getDocs(requete)).forEach((d) => projets.push({ id: d.id, ...d.data() }));
    } catch (e) {
      // Une liste vide et un accès refusé ne veulent pas dire la même chose :
      // on remonte l’erreur pour ne pas afficher « aucun projet » à tort.
      erreur = e && e.code ? e.code : 'indisponible';
      console.error('[suivi] lecture des projets impossible :', erreur);
    }

    resolve({ utilisateur, equipe, projets, erreur });
  });
});

/** Renvoie vers la connexion si la session manque. */
export const exigerSession = async () => {
  const s = await session();
  if (!s.utilisateur) {
    const retour = encodeURIComponent(location.pathname + location.search);
    location.replace(`./?retour=${retour}`);
    return null;
  }
  return s;
};

export const quitter = async () => {
  await signOut(auth);
  location.replace('./');
};

/* --- Les petits outils -------------------------------------------------- */

export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => Array.from(racine.querySelectorAll(sel));

/** Échappe le texte avant toute insertion dans le HTML. Aucune exception. */
export const echapper = (valeur) => String(valeur ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texte libre rendu avec ses retours à la ligne, sans HTML injecté. */
export const enParagraphes = (texte) => echapper(texte)
  .split(/\n{2,}/).map((bloc) => `<p>${bloc.replace(/\n/g, '<br>')}</p>`).join('');

const enDate = (valeur) => {
  if (!valeur) return null;
  if (typeof valeur.toDate === 'function') return valeur.toDate();
  if (valeur instanceof Date) return valeur;
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? null : d;
};

export const dateCourte = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

export const dateHeure = (valeur) => {
  const d = enDate(valeur);
  return d ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
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

export const montant = (valeur) => (typeof valeur === 'number')
  ? valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  : '';

export const poids = (octets) => {
  if (!octets) return '';
  const ko = octets / 1024;
  return ko < 1024 ? `${Math.round(ko)} ko` : `${(ko / 1024).toFixed(1)} Mo`;
};

export const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .slice(0, 2).map((m) => m[0] || '').join('').toUpperCase();

/* --- Les briques d'affichage -------------------------------------------- */

export const pastilleStatut = (statut) => {
  const s = STATUTS[statut] || { libelle: statut, voile: 'gris' };
  return `<span class="pastille pastille--${s.voile}">${echapper(s.libelle)}</span>`;
};

export const pastilleUrgence = (urgence) => {
  const u = URGENCES[urgence] || { libelle: urgence, rang: 4 };
  return `<span class="urgence urgence--${echapper(urgence)}"><i aria-hidden="true"></i>${echapper(u.libelle)}</span>`;
};

export const etiquetteType = (type) => {
  const t = TYPES[type] || { libelle: type };
  return `<span class="etiquette">${echapper(t.libelle)}</span>`;
};

/** Message court en haut d'écran. Disparaît seul. */
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

/** Bloc vide, honnête : on ne fait jamais croire qu'il y a des données. */
export const rienAAfficher = (titre, texte = '') => `
  <div class="vide">
    <p class="vide-titre">${echapper(titre)}</p>
    ${texte ? `<p class="vide-texte">${echapper(texte)}</p>` : ''}
  </div>`;

/* --- Les pièces jointes ------------------------------------------------- */

export const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_ACCEPTES = /^(image\/|application\/pdf$)/;

/**
 * Envoie un fichier et renvoie la fiche à ranger dans `pieces`.
 * Refuse tout ce que les règles de stockage refuseraient, pour donner
 * l'erreur à l'écran plutôt qu'un échec silencieux.
 */
export const envoyerPiece = async (fichier, chemin) => {
  if (!TYPES_ACCEPTES.test(fichier.type)) {
    throw new Error('Seules les images et les PDF sont acceptés.');
  }
  if (fichier.size > TAILLE_MAX) {
    throw new Error(`« ${fichier.name} » dépasse 10 Mo.`);
  }
  const nom = `${Date.now()}-${fichier.name.replace(/[^\w.\-]/g, '_')}`;
  const cible = refStockage(stockage, `${chemin}/${nom}`);
  await uploadBytes(cible, fichier, { contentType: fichier.type });
  return { nom: fichier.name, chemin: cible.fullPath, taille: fichier.size, type: fichier.type };
};

export const lienPiece = (piece) => getDownloadURL(refStockage(stockage, piece.chemin));
