/* ==========================================================================
   Page temporaire : la page « Axes d'évolution » d'un projet (#/projets/{p}/evolutions), qui absorbe les suggestions.
   Un autre lot la construit ; ce module tient seulement l'adresse et
   l'entrée du rail en attendant la fusion, qui le remplace.
   ========================================================================== */

import { echapper } from '../noyau.js';
import { titrePage } from '../ui.js';
import { filAriane } from '../coquille.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  const projet = (magasin.lire(K.projets) || env.session.projets || []).find((p) => p.id === pid) || {};
  titrePage(`Axes d'évolution${projet.nom ? ` · ${projet.nom}` : ''}`);
  filAriane([{ libelle: 'Axes d\'évolution' }]);
  ctx.sortie.innerHTML = `<div class="page">
    <div class="page-tete"><div style="min-width:0">${projet.nom ? `<p class="surtitre">${echapper(projet.nom)}</p>` : ''}<h1>Axes d'évolution</h1><p class="chapo">À venir.</p></div></div>
  </div>`;
};
