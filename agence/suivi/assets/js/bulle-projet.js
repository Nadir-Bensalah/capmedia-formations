/* ==========================================================================
   La bulle suit l'adresse.

   Une seule bulle à la fois, montée dès que l'adresse est celle d'un
   projet (« /projets/{id}… » : la fiche, une demande, une nouvelle demande,
   une brique, une tâche), démontée dès qu'on en sort, et remplacée quand
   on passe d'un projet à l'autre. Elle vit hors des vues : changer
   d'onglet ou de page dans le même projet ne la referme pas et
   n'interrompt pas la frappe.

   N'importe quelle page peut lui demander de s'ouvrir avec un texte déjà
   écrit (« Une question sur cette étape ») :
     document.dispatchEvent(new CustomEvent('bulle:ouvrir',
       { detail: { projet: pid, texte: 'À propos de…' } }));
   ========================================================================== */

import { surChangement, courant } from './routeur.js';
import { monterBulle } from './bulle.js';

/* Le projet d'une adresse, ou rien. « /nouveaux-projets/{id} » porte aussi
   un id, mais ce n'est pas un projet : on regarde le chemin, pas seulement
   le paramètre. */
const projetDe = (route) => {
  if (!route || !String(route.chemin || '').startsWith('/projets/')) return '';
  return String((route.params || {}).id || '');
};

export const brancherBulle = (env) => {
  let bulle = null;

  const poser = (voulu) => {
    if (bulle && bulle.pid === voulu) return;
    if (bulle) { bulle.fin(); bulle = null; }
    if (voulu) bulle = monterBulle({ pid: voulu, env });
  };

  const surOuvrir = (e) => {
    const d = (e && e.detail) || {};
    if (!d.projet) return;
    poser(String(d.projet));
    if (bulle) bulle.ouvrirAvec(d.texte || '');
  };

  const arret = surChangement((route) => poser(projetDe(route)));
  document.addEventListener('bulle:ouvrir', surOuvrir);
  poser(projetDe(courant()));

  return {
    fin: () => { arret(); document.removeEventListener('bulle:ouvrir', surOuvrir); poser(''); },
  };
};
