/* ==========================================================================
   CAPMEDIA CLIENT HUB · le chiffrement du coffre-fort

   Tout se passe ici, dans le navigateur, avec WebCrypto. La base ne reçoit
   que du chiffré : ni un secret en clair, ni la phrase, ni une clé qu'on
   pourrait en tirer sans elle.

     phrase (7 mots tirés au hasard)
       └─ PBKDF2-SHA256, 600 000 tours, sel aléatoire de 16 octets
            └─ clé d'enveloppe AES-256-GCM (jamais stockée)
                 └─ enveloppe la CLÉ DU COFFRE (32 octets aléatoires)
                      └─ chaque entrée : AES-256-GCM, IV de 12 octets neuf

   Changer la phrase renouvelle aussi la clé du coffre : une clé neuve est
   tirée, toutes les entrées sont rechiffrées avec elle dans le même lot
   d'écriture, et l'ancienne clé ne déchiffre plus rien de ce qui est en
   base. Ce que quelqu'un a lu ou recopié avant, en revanche, il le garde :
   aucun chiffrement ne reprend un secret déjà vu. Un appareil à empreinte
   (WebAuthn, extension PRF) garde sa propre enveloppe, tirée de la sortie
   PRF par HKDF-SHA256 : voir coffre-appareil.js.

   Chaque chiffré est lié à sa place par ses données associées : projet,
   identifiant, génération de la clé (g) et numéro de version de l'entrée
   (n). Une entrée recopiée ailleurs, ou remise à une version antérieure,
   ne se déchiffre plus.

   Ce module ne parle ni à Firestore ni à l'écran : il se teste seul
   (fonctions-suivi/outils/coffre-chiffre.test.mjs).
   ========================================================================== */

import { MOTS_COFFRE } from './mots-coffre.js';

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('Ce navigateur ne sait pas chiffrer ici (connexion non sécurisée ou navigateur trop ancien).');
  return c.subtle;
};

export const VERSION = 1;
export const KDF = 'PBKDF2-SHA256';
/* Le plancher recommandé pour PBKDF2-SHA256 (OWASP, 2023). Le nombre est
   enregistré avec le coffre : on pourra le relever sans rien casser. */
export const ITERATIONS = 600000;
/* Le plafond : au-delà, une enveloppe piégée ferait tourner le navigateur
   de qui l'ouvre pendant des minutes. Les règles imposent la même borne. */
export const ITERATIONS_MAX = 2000000;
export const MOTS_PAR_PHRASE = 7;

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

/* --------------------------------------------------------------------------
   Octets et texte : base64url sans remplissage, partout
   -------------------------------------------------------------------------- */

export const versB64 = (octets) => {
  const u = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let bin = '';
  for (let i = 0; i < u.length; i += 1) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const deB64 = (texte) => {
  const s = String(texte || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u;
};

export const aleatoire = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/* --------------------------------------------------------------------------
   La phrase
   -------------------------------------------------------------------------- */

/* Un indice uniforme dans [0, n) : on rejette le haut de l'intervalle qui
   avantagerait les premiers mots (biais du modulo). */
const indiceUniforme = (n) => {
  const plafond = Math.floor(0x100000000 / n) * n;
  const tampon = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(tampon);
    if (tampon[0] < plafond) return tampon[0] % n;
  }
};

/** Une phrase neuve : des mots distincts, tirés par crypto.getRandomValues. */
export const genererPhrase = (n = MOTS_PAR_PHRASE, liste = MOTS_COFFRE) => {
  if (liste.length < 2048) throw new Error('La liste de mots est trop courte.');
  const mots = [];
  while (mots.length < n) {
    const m = liste[indiceUniforme(liste.length)];
    if (!mots.includes(m)) mots.push(m);
  }
  return mots.join(' ');
};

/* Ce que la personne tape devient la forme canonique : minuscules, sans
   accent, un seul espace entre les mots. Un tiret, une majuscule ou un
   accent ajouté de bonne foi ne bloquent pas l'ouverture. */
export const normaliserPhrase = (texte) => String(texte || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** Ce qu'apporte une phrase, en bits : pour la page, et pour les tests. */
export const entropiePhrase = (n = MOTS_PAR_PHRASE, taille = MOTS_COFFRE.length) => {
  let bits = 0;
  for (let i = 0; i < n; i += 1) bits += Math.log2(taille - i);
  return bits;
};

/* --------------------------------------------------------------------------
   Les clés
   -------------------------------------------------------------------------- */

const aad = (pid, ...suite) => encodeur.encode(['capmedia-coffre', `v${VERSION}`, pid, ...suite].join('/'));

/* La clé d'enveloppe tirée de la phrase. Non extractible : elle ne sert
   qu'à ouvrir ou fermer l'enveloppe, puis disparaît avec la fonction. */
const cleDePhrase = async (phrase, sel, iterations) => {
  const s = subtle();
  const brute = await s.importKey('raw', encodeur.encode(normaliserPhrase(phrase)), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations },
    brute, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
};

/* La clé du coffre, rechargée depuis ses 32 octets. Elle reste extractible
   parce qu'il faut pouvoir la ré-envelopper (nouvelle phrase, nouvel
   appareil) ; elle ne vit qu'en mémoire, le temps du déverrouillage. */
const importerCleCoffre = (octets) => subtle().importKey('raw', octets, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

const chiffrer = async (cle, clair, donneesAssociees) => {
  const iv = aleatoire(12);
  const chiffre = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: donneesAssociees, tagLength: 128 }, cle, clair);
  return { iv: versB64(iv), donnees: versB64(new Uint8Array(chiffre)) };
};

const dechiffrer = async (cle, { iv, donnees }, donneesAssociees) => new Uint8Array(await subtle().decrypt(
  { name: 'AES-GCM', iv: deB64(iv), additionalData: donneesAssociees, tagLength: 128 }, cle, deB64(donnees),
));

/** La phrase ne correspond pas (ou l'enveloppe a été abîmée). */
export class PhraseRefusee extends Error {
  constructor() { super('Cette phrase n\'ouvre pas le coffre. Vérifiez chaque mot.'); this.name = 'PhraseRefusee'; }
}

/* Enveloppe la clé du coffre sous une phrase, avec un sel neuf. Rend les
   champs publics du document du coffre. */
export const envelopperPourPhrase = async (pid, cleCoffre, phrase, iterations = ITERATIONS) => {
  if (normaliserPhrase(phrase).split(' ').length < 6) throw new Error('La phrase doit compter au moins six mots.');
  const sel = aleatoire(16);
  const kek = await cleDePhrase(phrase, sel, iterations);
  const octets = new Uint8Array(await subtle().exportKey('raw', cleCoffre));
  try {
    const { iv, donnees } = await chiffrer(kek, octets, aad(pid, 'cle'));
    return { version: VERSION, kdf: KDF, iterations, sel: versB64(sel), iv, cle: donnees };
  } finally { octets.fill(0); }
};

/** Une clé de coffre neuve, tirée au hasard. */
export const nouvelleCle = async () => {
  const octets = aleatoire(32);
  try { return await importerCleCoffre(octets); } finally { octets.fill(0); }
};

/** Un coffre neuf : une clé aléatoire, enveloppée sous la phrase donnée. */
export const creerCoffre = async (pid, phrase) => {
  const cleCoffre = await nouvelleCle();
  const enveloppe = await envelopperPourPhrase(pid, cleCoffre, phrase);
  return { enveloppe, cleCoffre };
};

/** Ouvre le coffre avec la phrase. Lève PhraseRefusee si elle est fausse. */
export const ouvrirAvecPhrase = async (pid, meta, phrase) => {
  if (!meta || meta.version !== VERSION || meta.kdf !== KDF) throw new Error('Ce coffre a un format que cette page ne connaît pas.');
  if (!(meta.iterations >= ITERATIONS)) throw new Error('Ce coffre annonce un réglage trop faible : il est refusé.');
  if (meta.iterations > ITERATIONS_MAX) throw new Error('Ce coffre annonce un réglage hors bornes : il est refusé.');
  const kek = await cleDePhrase(phrase, deB64(meta.sel), meta.iterations);
  let octets;
  try { octets = await dechiffrer(kek, { iv: meta.iv, donnees: meta.cle }, aad(pid, 'cle')); }
  catch (e) { throw new PhraseRefusee(); }
  try {
    if (octets.length !== 32) throw new PhraseRefusee();
    return await importerCleCoffre(octets);
  } finally { octets.fill(0); }
};

/* --------------------------------------------------------------------------
   Les entrées
   -------------------------------------------------------------------------- */

const CHAMPS_ENTREE = ['service', 'lien', 'identifiant', 'motDePasse', 'note'];
/* Le clair est complété par des espaces jusqu'au multiple de 256 octets :
   la longueur du chiffré ne trahit plus celle d'un mot de passe. */
const BLOC = 256;

const entier = (x) => Number.isInteger(x) && x >= 1;

/* g : la génération de la clé du coffre (le numéro de son enveloppe) ;
   n : la version de l'entrée, 1 à la création, +1 à chaque écriture (les
   règles l'imposent). Les deux sont authentifiés : remettre en base un
   ancien chiffré sous un n plus grand ne passe pas le déchiffrement. */
export const chiffrerEntree = async (pid, id, cleCoffre, entree, { g, n }) => {
  if (!entier(g) || !entier(n)) throw new Error('Génération ou version d\'entrée invalide.');
  const propre = {};
  for (const k of CHAMPS_ENTREE) propre[k] = String((entree || {})[k] || '');
  let json = JSON.stringify(propre);
  const longueur = encodeur.encode(json).length;
  json += ' '.repeat((BLOC - (longueur % BLOC)) % BLOC);
  const { iv, donnees } = await chiffrer(cleCoffre, encodeur.encode(json), aad(pid, 'entree', id, `g${g}`, `n${n}`));
  return { v: VERSION, g, n, iv, donnees };
};

export const dechiffrerEntree = async (pid, id, cleCoffre, docChiffre) => {
  if (!entier(docChiffre.g) || !entier(docChiffre.n)) throw new Error('Entrée sans génération ni version.');
  const clair = await dechiffrer(cleCoffre, docChiffre, aad(pid, 'entree', id, `g${docChiffre.g}`, `n${docChiffre.n}`));
  const objet = JSON.parse(decodeur.decode(clair));
  const propre = {};
  for (const k of CHAMPS_ENTREE) propre[k] = String(objet[k] || '');
  return propre;
};

/* --------------------------------------------------------------------------
   Un appareil à empreinte : la sortie PRF de l'authentificateur
   -------------------------------------------------------------------------- */

const cleDAppareil = async (sortiePrf, selPrf) => {
  const s = subtle();
  const base = await s.importKey('raw', sortiePrf, 'HKDF', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: selPrf, info: encodeur.encode(`capmedia-coffre/v${VERSION}/appareil`) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
};

export const envelopperPourAppareil = async (pid, aid, cleCoffre, sortiePrf, selPrf) => {
  const k = await cleDAppareil(sortiePrf, selPrf);
  const octets = new Uint8Array(await subtle().exportKey('raw', cleCoffre));
  try {
    const { iv, donnees } = await chiffrer(k, octets, aad(pid, 'appareil', aid));
    return { iv, cle: donnees };
  } finally { octets.fill(0); }
};

export const ouvrirAvecAppareil = async (pid, aid, fiche, sortiePrf) => {
  const k = await cleDAppareil(sortiePrf, deB64(fiche.selPrf));
  let octets;
  try { octets = await dechiffrer(k, { iv: fiche.iv, donnees: fiche.cle }, aad(pid, 'appareil', aid)); }
  catch (e) { throw new Error('Cet appareil n\'ouvre plus le coffre. Utilisez la phrase.'); }
  try { return await importerCleCoffre(octets); } finally { octets.fill(0); }
};
