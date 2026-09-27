/* ==========================================================================
   Télécharger le PDF d'une pièce (devis, facture) : le serveur le remet,
   après avoir vérifié qui demande (suiviPiece). La page le reçoit en
   mémoire et le pose dans les téléchargements sous son nom, sans ouvrir
   de nouvel onglet ni passer par les règles du stockage.
   ========================================================================== */

import { auth, surEmulateur } from './noyau.js';
import { toast } from './ui.js';

const PROJET = (window.AZ_SUIVI && window.AZ_SUIVI.firebase && window.AZ_SUIVI.firebase.projectId) || 'capmedia-1f90d';
const URL_PIECE = surEmulateur
  ? `http://127.0.0.1:5001/${PROJET}/europe-west1/suiviPiece`
  : `https://europe-west1-${PROJET}.cloudfunctions.net/suiviPiece`;

export const telechargerPiece = async (d) => {
  if (!d || !d.fichier || !d.fichier.chemin) { toast('Cette pièce n\'a pas encore de PDF.', 'erreur'); return false; }
  const utilisateur = auth.currentUser;
  if (!utilisateur) { toast('Votre session est fermée. Reconnectez-vous.', 'erreur'); return false; }
  let jeton;
  try { jeton = await utilisateur.getIdToken(); } catch (e) { toast('Votre session a expiré. Reconnectez-vous.', 'erreur'); return false; }
  let r;
  try { r = await fetch(`${URL_PIECE}?document=${encodeURIComponent(d.id)}`, { headers: { Authorization: `Bearer ${jeton}` } }); }
  catch (e) { toast('Le serveur est injoignable. Réessayez.', 'erreur'); return false; }
  if (!r.ok) { toast((await r.text().catch(() => '')) || 'Le PDF n\'a pas pu être téléchargé.', 'erreur'); return false; }
  const blob = await r.blob();
  const nom = d.fichier.nom || `${d.numero || (d.type === 'devis' ? 'devis' : 'facture')}.pdf`;
  const adresse = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = adresse; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 60000);
  return true;
};
