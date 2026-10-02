/* ==========================================================================
   CAPMEDIA CLIENT HUB · la fonction serveur
   Les écritures que les règles refusent au navigateur passent par ici :
   créer un projet ou une organisation, donner un accès, ouvrir un projet
   au client, déposer une pièce comptable, enregistrer un paiement,
   administrer l'équipe.

   Plus aucune clé partagée : l'appel porte le jeton Firebase de la
   personne connectée, et le serveur décide d'après SON rôle, SES
   permissions et SES projets. Le navigateur ne détient aucun secret qui
   donnerait un privilège.
   ========================================================================== */

import { surEmulateur, FONCTIONS_EMULATEUR, auth } from './noyau.js';

const PROJET = (window.AZ_SUIVI && window.AZ_SUIVI.firebase && window.AZ_SUIVI.firebase.projectId) || 'capmedia-1f90d';
export const URL_SUIVI = surEmulateur
  ? `${FONCTIONS_EMULATEUR}/${PROJET}/europe-west1/suiviAdmin`
  : `https://europe-west1-${PROJET}.cloudfunctions.net/suiviAdmin`;

/* L'ancienne clé d'administration a pu rester dans ce navigateur : elle ne
   sert plus à rien, on l'efface au passage. */
try { localStorage.removeItem('suivi:cle-admin'); } catch (e) { /* stockage refusé */ }

/**
 * Appelle la fonction serveur au nom de la personne connectée. Toute
 * réponse qui n'est pas un succès franc lève une erreur lisible :
 * l'interface ne doit jamais annoncer une réussite qu'elle n'a pas
 * constatée.
 */
export const appelServeur = async (action, parametres = {}) => {
  const utilisateur = auth.currentUser;
  if (!utilisateur) throw new Error('Votre session est fermée. Reconnectez-vous.');
  let jeton;
  try { jeton = await utilisateur.getIdToken(); } catch (e) { throw new Error('Votre session a expiré. Reconnectez-vous.'); }
  let reponse;
  try {
    reponse = await fetch(URL_SUIVI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ action, ...parametres }),
    });
  } catch (e) {
    throw new Error('La fonction de suivi est injoignable.');
  }
  const brut = await reponse.text();
  if (reponse.status === 401) throw new Error(brut || 'Votre session a été fermée. Reconnectez-vous.');
  if (!reponse.ok) throw new Error(brut || `La fonction a répondu ${reponse.status}.`);
  if (!brut) return {};
  try { return JSON.parse(brut); } catch (e) { return { texte: brut }; }
};
