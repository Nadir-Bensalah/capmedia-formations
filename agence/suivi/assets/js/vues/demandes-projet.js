/* ==========================================================================
   Mes demandes de projet. Une fois la page du formulaire quittée, le client
   ne retrouvait sa demande que par l'e-mail ou la notification : la liste
   était chargée, aucun écran ne l'affichait. Ici, ses demandes, celles en
   cours d'abord, puis celles qui ont abouti ou sont restées sans suite.
   ========================================================================== */

import { echapper, depuis, parDateDesc, TYPES_PROJET, STATUTS_PREPROJET } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';

/* Une demande « en cours » attend encore quelque chose de nous ou du
   client ; les autres sont devenues un projet, ou sont sans suite. */
export const CLOSES = ['projet', 'refusee'];

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Mes demandes de projet');
  filAriane([{ libelle: 'Accueil', chemin: '/' }, { libelle: 'Mes demandes de projet' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;

  const rendre = () => {
    const demandes = (magasin.lire(K.demandesProjet) || []).slice().sort(parDateDesc('maj'));
    const enCours = demandes.filter((d) => !CLOSES.includes(d.statut));
    const closes = demandes.filter((d) => CLOSES.includes(d.statut));
    const bloc = (d) => ligne({
      href: `#/nouveaux-projets/${echapper(d.id)}`, icone: 'sparkle', ton: d.statut === 'devis' ? 'ambre' : CLOSES.includes(d.statut) ? '' : 'violet',
      titre: echapper(d.titre),
      sous: `${echapper(TYPES_PROJET[d.type] || d.type || '')} · ${echapper(d.statut === 'projet' ? 'projet ouvert' : `dernier mouvement ${depuis(d.maj)}`)}`,
      fin: pastille(STATUTS_PREPROJET, d.statut),
    });
    sortie.innerHTML = `<div class="page">
      <div class="page-tete">
        <div><h1>Mes demandes de projet</h1><p class="chapo">Chaque idée que vous nous avez décrite, et où elle en est : discussion, chiffrage, devis, puis le projet lui-même.</p></div>
        <div class="actions"><a class="btn btn-principal" href="#/nouveau-projet">${icone('plus')} Demander un projet</a></div>
      </div>
      ${enCours.length ? `<section class="section" style="margin-top:0"><div class="section-tete"><h2>En cours</h2></div><div class="liste">${enCours.map(bloc).join('')}</div></section>` : ''}
      ${closes.length ? `<section class="section"${enCours.length ? '' : ' style="margin-top:0"'}><div class="section-tete"><h2>Terminées</h2></div><div class="liste">${closes.map(bloc).join('')}</div></section>` : ''}
      ${!demandes.length ? vide({ icone: 'sparkle', titre: 'Aucune demande de projet', texte: 'Décrivez-nous une idée : nous en discutons ici, puis nous la chiffrons.', action: '<a class="btn btn-principal" href="#/nouveau-projet">Demander un projet</a>' }) : ''}
    </div>`;
  };
  lot.sur(K.demandesProjet, rendre);
  /* Le même délai de garde que les autres pages : passé 600 ms, on montre
     ce qu'on a plutôt qu'un squelette. */
  const garde = setTimeout(() => { if (magasin.lire(K.demandesProjet) === undefined) rendre(); }, 600);
  return () => { clearTimeout(garde); lot.fin(); };
};
