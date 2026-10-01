/* ==========================================================================
   CAPMEDIA CLIENT HUB · ouvrir le coffre-fort avec l'empreinte ou Face ID

   WebAuthn sait signer, pas chiffrer. Son extension PRF, elle, rend un
   secret de 32 octets propre à une clé d'accès et à un « sel » donné, et
   seulement après Touch ID, Face ID ou Windows Hello. Ce secret ne quitte
   jamais la page : il enveloppe une copie de la clé du coffre, propre à
   cet appareil (coffre-chiffre.js, HKDF puis AES-GCM).

   Rien n'est vérifié par le serveur, et rien n'a besoin de l'être : sans
   l'authentificateur et le geste de la personne, pas de sortie PRF, donc
   pas de clé. Le défi est tiré ici, au hasard.

   Safari 18 et plus, Chrome et Edge récents savent faire, sur un appareil
   qui a un capteur. Ailleurs, on le dit, et la phrase reste la seule clé.
   ========================================================================== */

import { versB64, deB64, aleatoire } from './coffre-chiffre.js';
import { nomAppareil } from './cles-acces.js';

export { nomAppareil };

export class PrfIndisponible extends Error {
  constructor(message) { super(message); this.name = 'PrfIndisponible'; }
}

const MESSAGE_NAVIGATEUR = "Ce navigateur ne sait pas encore ouvrir un coffre avec l'empreinte. Safari 18 et plus, Chrome ou Edge récents le savent, sur un appareil avec Touch ID, Face ID ou Windows Hello.";

/**
 * Ce que ce navigateur permet, sans rien demander à la personne.
 *   { etat: 'oui' }          PRF annoncé et capteur présent
 *   { etat: 'peut-etre' }    capteur présent, PRF non annoncé : on le saura à l'activation
 *   { etat: 'non', raison }  pas de WebAuthn, pas de capteur, ou PRF refusé
 */
export const detecterPrf = async () => {
  const w = typeof window !== 'undefined' ? window : {};
  if (!w.isSecureContext || !w.PublicKeyCredential || !navigator.credentials) {
    return { etat: 'non', raison: MESSAGE_NAVIGATEUR };
  }
  let capteur = false;
  try { capteur = await w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { capteur = false; }
  if (!capteur) return { etat: 'non', raison: "Cet appareil n'a pas de Touch ID, Face ID ou Windows Hello prêt à servir dans ce navigateur." };
  if (typeof w.PublicKeyCredential.getClientCapabilities === 'function') {
    try {
      const c = await w.PublicKeyCredential.getClientCapabilities();
      if (c && c['extension:prf'] === true) return { etat: 'oui' };
      if (c && c['extension:prf'] === false) return { etat: 'non', raison: MESSAGE_NAVIGATEUR };
    } catch (e) { /* on le saura à l'activation */ }
  }
  return { etat: 'peut-etre' };
};

/* Une sortie PRF pour une clé donnée. evalByCredential : chaque appareil
   a son propre sel, le navigateur prend celui de la clé présente. */
const evaluer = async (appareils) => {
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: {
      challenge: aleatoire(32),
      allowCredentials: appareils.map((a) => ({ type: 'public-key', id: deB64(a.credId) })),
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { evalByCredential: Object.fromEntries(appareils.map((a) => [a.credId, { first: deB64(a.selPrf) }])) } },
    } });
  } catch (e) {
    if (e && e.name === 'NotAllowedError') throw new Error('Geste annulé, ou aucune clé de ce coffre sur cet appareil.');
    throw new Error("L'appareil n'a pas pu confirmer votre identité.");
  }
  const prf = ((cred && cred.getClientExtensionResults && cred.getClientExtensionResults()) || {}).prf || {};
  const sortie = prf.results && prf.results.first;
  if (!sortie) throw new PrfIndisponible(MESSAGE_NAVIGATEUR);
  return { credId: versB64(new Uint8Array(cred.rawId)), sortie: new Uint8Array(sortie) };
};

/**
 * Crée la clé d'accès du coffre sur cet appareil et rend sa première
 * sortie PRF. La clé porte le nom du projet : c'est ce que la personne
 * verra dans son trousseau.
 */
export const activerAppareil = async ({ projetNom }) => {
  const selPrf = aleatoire(32);
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      challenge: aleatoire(32),
      rp: { name: 'Capmedia · coffre-fort' },
      user: { id: aleatoire(16), name: `Coffre-fort ${projetNom}`.slice(0, 60), displayName: `Coffre-fort ${projetNom}`.slice(0, 60) },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: 60000,
      extensions: { prf: { eval: { first: selPrf } } },
    } });
  } catch (e) {
    if (e && e.name === 'NotAllowedError') throw new Error('Activation annulée.');
    throw new Error("L'appareil n'a pas pu créer la clé du coffre.");
  }
  const prf = ((cred.getClientExtensionResults && cred.getClientExtensionResults()) || {}).prf || {};
  if (prf.enabled !== true && !(prf.results && prf.results.first)) throw new PrfIndisponible(MESSAGE_NAVIGATEUR);
  const credId = versB64(new Uint8Array(cred.rawId));
  /* Chrome rend la sortie dès la création ; Safari demande un second geste. */
  const sortie = prf.results && prf.results.first
    ? new Uint8Array(prf.results.first)
    : (await evaluer([{ credId, selPrf: versB64(selPrf) }])).sortie;
  return { credId, selPrf: versB64(selPrf), sortie };
};

/** Le geste d'ouverture : rend { credId, sortie } pour la clé présente. */
export const ouvrirParAppareil = (appareils) => evaluer(appareils);
