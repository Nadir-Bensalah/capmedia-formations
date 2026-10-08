/* ==========================================================================
   CAPMEDIA CLIENT HUB · les liens profonds

   Un lien d'e-mail ou de notification désigne UNE fiche : une demande,
   demain une validation ou une pièce. Il doit l'ouvrir exactement, dans
   l'espace de la personne qui clique, même navigateur fermé, même après
   un passage par la porte de connexion, et même quand Firestore répond
   après le routeur.

   Deux briques, réutilisables pour chaque type de fiche :
   - `resolveur(collection, versChemin)` : une route courte (« /demande/:id »)
     qui lit la fiche elle-même (lecture ponctuelle, donc indépendante des
     abonnements pas encore arrivés), puis remplace l'adresse par la route
     complète de l'espace courant ;
   - `traduireRetour(demande, espace)` (utilisée par la porte) : une adresse
     demandée avant la connexion, qui vise l'espace d'un autre rôle, est
     ramenée dans l'espace du compte en gardant sa route. Un membre de
     l'équipe qui clique un lien « hub#/demande/X » arrive donc sur
     « cockpit#/demande/X », et non sur l'accueil.
   ========================================================================== */

import { bdd, doc, getDoc } from './noyau.js';
import { vide, squelette } from './ui.js';
import { naviguer } from './routeur.js';

/**
 * Une vue de routeur qui lit `collection/{params.id|params.tid}` et remplace
 * l'adresse par `versChemin(id, donnees)`. Introuvable ou refusé : un écran
 * qui le dit, sans laisser croire à une page vide.
 */
export const resolveur = (collection, versChemin, { titre = 'Introuvable', texte = "Elle a peut-être été archivée, ou vous n'y avez plus accès.", texteEquipe = '', retourEquipe = null } = {}) => async (ctx, env = {}) => {
  const id = ctx.params.id || ctx.params.tid;
  ctx.sortie.innerHTML = `<div class="page">${squelette('page', 3)}</div>`;
  try {
    const fiche = await getDoc(doc(bdd, collection, id));
    if (fiche.exists()) {
      const chemin = versChemin(id, fiche.data());
      if (chemin) { naviguer(chemin, { remplacer: true }); return () => {}; }
    }
  } catch (e) { /* refus ou absence : même écran */ }
  /* L'équipe repart vers la liste d'où le lien venait (les tickets), le
     client vers son accueil. */
  const equipe = env.role === 'equipe';
  const action = equipe && retourEquipe
    ? `<a class="btn btn-secondaire" href="#${retourEquipe.chemin}">${retourEquipe.libelle}</a>`
    : '<a class="btn btn-secondaire" href="#/">Retour à l\'accueil</a>';
  ctx.sortie.innerHTML = `<div class="page">${vide({ icone: 'demandes', titre, texte: (equipe && texteEquipe) || texte, action })}</div>`;
  return () => {};
};

/** La demande désignée par un lien : la même route dans le hub et le cockpit. */
export const resoudreDemande = resolveur('tickets', (id, t) => (t.projet ? `/projets/${t.projet}/demandes/${id}` : ''), {
  titre: 'Ticket introuvable',
  texte: "Il a peut-être été archivé, ou vous n'y avez plus accès.",
  texteEquipe: "Ce lien ne mène à aucun ticket : il a peut-être été supprimé. Un ticket archivé se retrouve dans les archives.",
  retourEquipe: { chemin: '/demandes', libelle: 'Voir les tickets' },
});

/* La traduction d'une destination après connexion vit dans retour.js, sans
   dépendance : la porte de connexion l'importe sans charger l'interface. */
export { traduireRetour } from './retour.js';
