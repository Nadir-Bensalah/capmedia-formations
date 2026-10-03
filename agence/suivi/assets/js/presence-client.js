/* ==========================================================================
   CAPMEDIA CLIENT HUB · la présence du client, vue de l'équipe

   Tant que le Hub est ouvert ET visible, un battement par minute dit à
   l'équipe que le client est là : un document par projet dont il est
   membre (projets/{p}/presencesClient/{uid}), l'heure du serveur et rien
   d'autre. Onglet caché, fenêtre fermée : un dernier battement « pas en
   ligne », et le Cockpit passe à « Vu il y a ». Le client n'en voit rien
   et ne relit rien : les règles ne lui ouvrent que l'écriture de SON
   document, sur SES projets.

   Au démarrage, une session reprise (le Hub rouvert sans passer par la
   porte) s'inscrit au journal des connexions, par le serveur.
   ========================================================================== */

import { bdd, doc, setDoc, serverTimestamp, auth, surEmulateur, FONCTIONS_EMULATEUR } from './noyau.js';

const BATTEMENT_MS = 60000;

const PORTE = surEmulateur
  ? `${FONCTIONS_EMULATEUR}/capmedia-1f90d/europe-west1/suiviConnexion`
  : 'https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviConnexion';

/**
 * Lance le battement. `projets()` rend les identifiants des projets dont
 * la personne est membre, relus à chaque battement (un accès donné ou
 * retiré en cours de route est suivi sans recharger).
 */
export const demarrerPresenceClient = ({ uid, projets }) => {
  if (!uid) return () => {};
  let dernierEtat = null;
  const battre = (enLigne) => {
    const ids = [...new Set((projets() || []).filter(Boolean))];
    /* Un projet refusé (accès retiré à l'instant) ne retient pas les autres. */
    ids.forEach((pid) => {
      setDoc(doc(bdd, 'projets', pid, 'presencesClient', uid), { vu: serverTimestamp(), enLigne })
        .catch((e) => console.warn('[presence] battement perdu', pid, e && e.code));
    });
    dernierEtat = enLigne;
  };
  const visible = () => document.visibilityState === 'visible';
  if (visible()) battre(true);
  const minuterie = setInterval(() => { if (visible()) battre(true); }, BATTEMENT_MS);
  const surVisibilite = () => {
    if (visible()) battre(true);
    else if (dernierEtat !== false) battre(false);
  };
  const surDepart = () => { if (dernierEtat !== false) battre(false); };
  document.addEventListener('visibilitychange', surVisibilite);
  window.addEventListener('pagehide', surDepart);
  return () => {
    clearInterval(minuterie);
    document.removeEventListener('visibilitychange', surVisibilite);
    window.removeEventListener('pagehide', surDepart);
  };
};

/**
 * Inscrit l'ouverture de cette session au journal des connexions, une fois
 * par onglet. La porte pose « suivi:session-neuve » quand elle vient
 * d'ouvrir la session : le serveur l'a déjà notée (code, clé), sauf pour
 * l'ancien lien, qu'elle signale par « lien ».
 */
export const noterOuverture = async () => {
  let marque = '';
  try {
    if (sessionStorage.getItem('suivi:ouverture-notee')) return;
    sessionStorage.setItem('suivi:ouverture-notee', '1');
    marque = sessionStorage.getItem('suivi:session-neuve') || '';
    sessionStorage.removeItem('suivi:session-neuve');
  } catch (e) { /* stockage refusé : on note quand même */ }
  if (marque === '1') return;
  const u = auth.currentUser;
  if (!u) return;
  try {
    await fetch(PORTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
      body: JSON.stringify({ action: 'noterConnexion', mode: marque === 'lien' ? 'lien' : 'reprise', bureau: Boolean(window.capmediaBureau) }),
    });
  } catch (e) { /* le journal ne doit jamais gêner l'entrée */ }
};
