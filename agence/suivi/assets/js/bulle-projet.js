/* ==========================================================================
   La bulle suit l'adresse.

   Une seule bulle à la fois, montée dès que l'adresse est celle d'un
   projet (« /projets/{id}… » : la fiche, une demande, une nouvelle demande,
   une brique, une tâche), démontée dès qu'on en sort, et remplacée quand
   on passe d'un projet à l'autre. Chez le client (demande de Nadir,
   02/10), elle est sur TOUTES les pages : hors d'un projet, celle du
   projet que nomme l'adresse (« /messages/{id} », « ?projet= »), sinon
   celle que l'espace désigne (projetParDefaut). Elle vit hors des vues : changer
   d'onglet ou de page dans le même projet ne la referme pas et
   n'interrompt pas la frappe.

   N'importe quelle page peut lui demander de s'ouvrir avec un texte déjà
   écrit (« Une question sur cette étape ») :
     document.dispatchEvent(new CustomEvent('bulle:ouvrir',
       { detail: { projet: pid, texte: 'À propos de…' } }));
   ========================================================================== */

import { surChangement, courant } from './routeur.js';
import { monterBulle } from './bulle.js';
import { projetDeLAdresse } from './coquille.js';

/* Le projet d'une adresse, ou rien. « /nouveaux-projets/{id} » porte aussi
   un id, mais ce n'est pas un projet : on regarde le chemin, pas seulement
   le paramètre. */
const projetDe = (route) => {
  if (!route || !String(route.chemin || '').startsWith('/projets/')) return '';
  return String((route.params || {}).id || '');
};

/* `projetParDefaut` (le client seul) : le projet de la bulle sur une page
   qui n'en nomme aucun. Sans lui (le Cockpit), rien ne change. */
/* `sansBulle` (le client seul) : les pages où la bulle n'a rien à faire.
   Sur Messages, la conversation est déjà la page : la bulle la montrait
   une seconde fois et couvrait « Envoyer » sur un téléphone (03/10). */
/* `pagesFiltrees` (le Cockpit, lot 3) : la bulle suit aussi le projet que
   nomme l'adresse hors de « /projets/… » (« ?projet= »), sans projet par
   défaut. `accepte(pid)` : le projet a-t-il une bulle ? Le Cockpit n'en
   monte pas sur un projet sans client (interne, D9). `revoir()`, rendu,
   repose la bulle quand ce que lit `accepte` arrive ou change. */
export const brancherBulle = (env, { projetParDefaut = null, sansBulle = null, pagesFiltrees = false, accepte = null } = {}) => {
  let bulle = null;
  const voulu = (route) => {
    if (sansBulle && sansBulle(route || {})) return '';
    const pid = projetDe(route) || (projetParDefaut || pagesFiltrees ? (projetDeLAdresse(route || {}) || (projetParDefaut ? projetParDefaut() : '') || '') : '');
    return pid && (!accepte || accepte(pid)) ? pid : '';
  };

  const poser = (voulu) => {
    if (bulle && bulle.pid === voulu) return;
    if (bulle) { bulle.fin(); bulle = null; }
    if (voulu) bulle = monterBulle({ pid: voulu, env });
  };

  const surOuvrir = (e) => {
    const d = (e && e.detail) || {};
    if (!d.projet) return;
    /* Demandée depuis la page Messages (« Écrire » d'un autre bloc) : la
       page a déjà son fil, on n'y monte pas de bulle. */
    if (sansBulle && sansBulle(courant() || {})) return;
    if (accepte && !accepte(String(d.projet))) return;
    poser(String(d.projet));
    if (bulle) bulle.ouvrirAvec(d.texte || '');
  };

  const arret = surChangement((route) => poser(voulu(route)));
  document.addEventListener('bulle:ouvrir', surOuvrir);
  poser(voulu(courant()));

  return {
    fin: () => { arret(); document.removeEventListener('bulle:ouvrir', surOuvrir); poser(''); },
    revoir: () => poser(voulu(courant())),
  };
};
