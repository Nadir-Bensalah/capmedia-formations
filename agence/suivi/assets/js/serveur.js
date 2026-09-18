/* ==========================================================================
   CAPMEDIA CLIENT HUB · la fonction serveur
   Les écritures que les règles refusent au navigateur passent par ici :
   créer un projet ou une organisation, inviter, déposer une pièce
   comptable, enregistrer un paiement, écrire une fiche d'équipe. La clé
   d'administration voyage uniquement vers la fonction, et reste dans ce
   navigateur.
   ========================================================================== */

import { surEmulateur, $, echapper } from './noyau.js';
import { modale, toast } from './ui.js';

const PROJET = (window.AZ_SUIVI && window.AZ_SUIVI.firebase && window.AZ_SUIVI.firebase.projectId) || 'capmedia-1f90d';
export const URL_SUIVI = surEmulateur
  ? `http://127.0.0.1:5001/${PROJET}/europe-west1/suiviAdmin`
  : `https://europe-west1-${PROJET}.cloudfunctions.net/suiviAdmin`;

const CLE_STOCKAGE = 'suivi:cle-admin';
let cle = '';
try { cle = localStorage.getItem(CLE_STOCKAGE) || ''; } catch (e) { cle = ''; }

const ecouteurs = new Set();
const prevenir = () => ecouteurs.forEach((fn) => fn(Boolean(cle)));

export const cleEstPosee = () => Boolean(cle);
export const surCle = (fn) => { ecouteurs.add(fn); fn(Boolean(cle)); return () => ecouteurs.delete(fn); };

export const poserCle = (valeur) => {
  cle = String(valeur || '').trim();
  try { localStorage.setItem(CLE_STOCKAGE, cle); } catch (e) { /* stockage refusé */ }
  prevenir();
};

export const verrouiller = () => {
  cle = '';
  try { localStorage.removeItem(CLE_STOCKAGE); } catch (e) { /* rien */ }
  prevenir();
};

/** Ouvre la boîte de saisie de la clé. Résout true si une clé a été posée. */
export const demanderCle = () => {
  const m = modale({
    titre: "Clé d'administration",
    sousTitre: "Elle ne sert qu'aux actions que le navigateur n'a pas le droit de faire.",
    corps: `
      <form class="forme" id="forme-cle" novalidate>
        <p class="t-petit t-2">Créer un projet, inviter un client, déposer un devis ou une facture, enregistrer un paiement. La clé reste dans ce navigateur et ne part que vers la fonction de suivi.</p>
        <div class="groupe">
          <label class="etiquette-champ" for="champ-cle">Clé</label>
          <input class="champ" id="champ-cle" name="cle" type="password" autocomplete="off" spellcheck="false">
        </div>
      </form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
           <button class="btn btn-principal" type="submit" form="forme-cle">Garder la clé</button>`,
  });
  $('#forme-cle', m.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#champ-cle', m.el).value.trim();
    if (!v) { toast('La clé est vide.', 'erreur'); return; }
    poserCle(v);
    m.fermer(true);
  });
  return m.fin.then((v) => v === true);
};

/** Vrai si une clé est disponible, en la demandant au besoin. */
export const assurerCle = async () => (cleEstPosee() ? true : demanderCle());

/**
 * Appelle la fonction serveur. Toute réponse qui n'est pas un succès franc
 * lève une erreur : l'interface ne doit jamais annoncer une réussite qu'elle
 * n'a pas constatée.
 */
export const appelServeur = async (action, parametres = {}) => {
  if (!cle) {
    const ok = await demanderCle();
    if (!ok) throw new Error("Cette action demande la clé d'administration.");
  }
  let reponse;
  try {
    reponse = await fetch(URL_SUIVI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cle, action, ...parametres }),
    });
  } catch (e) {
    throw new Error('La fonction de suivi est injoignable.');
  }
  if (reponse.status === 401 || reponse.status === 403) {
    verrouiller();
    throw new Error('Clé refusée. Reposez-la pour réessayer.');
  }
  const brut = await reponse.text();
  if (!reponse.ok) throw new Error(brut || `La fonction a répondu ${reponse.status}.`);
  if (!brut) return {};
  try { return JSON.parse(brut); } catch (e) { return { texte: brut }; }
};

/** Le petit indicateur d'état de la clé, pour la barre latérale. */
export const etatCleHtml = () => (cleEstPosee()
  ? `<span class="puce puce--vert"><i aria-hidden="true"></i>Clé posée</span>`
  : `<span class="puce"><i aria-hidden="true"></i>Aucune clé sur cet appareil</span>`);

export const nomCle = () => echapper(cle ? 'Clé posée' : 'Sans clé');
