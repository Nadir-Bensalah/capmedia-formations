/* ==========================================================================
   Le marketing d'un projet (#/projets/{p}/marketing).

   La page est vide pour l'instant : Nadir dira quoi y mettre. Tant qu'elle
   n'a rien à montrer, le client ne voit ni l'entrée du rail ni la page
   (son adresse le ramène à l'aperçu) ; l'équipe voit l'onglet dans le
   Cockpit, marqué « À venir » (projet.js).
   ========================================================================== */

import { naviguer } from '../routeur.js';

/** Vrai quand la page a quelque chose à montrer au client sur ce projet. */
export const aDuContenu = (projet) => { void projet; return false; };

export const vue = async (ctx) => {
  naviguer(`/projets/${encodeURIComponent(ctx.params.id)}`, { remplacer: true });
  return null;
};
