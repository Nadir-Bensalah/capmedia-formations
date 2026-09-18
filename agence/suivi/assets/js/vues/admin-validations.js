/* ==========================================================================
   Les validations côté équipe : ce qui attend le client, ce qu'il a
   répondu, et la création d'une nouvelle demande de validation.
   ========================================================================== */

import { echapper, dateCourte, depuis, parDateDesc, STATUTS_VALIDATION, TYPES_VALIDATION } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, echeanceHtml } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { editer } from './editeurs.js';
import { ouvrirValidation } from './valider.js';
import { echeance } from '../noyau.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Validations');
  filAriane([{ libelle: 'Validations' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  let ouvert = ctx.params.vid || null;

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const validations = magasin.lire(K.validationsToutes) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const attente = validations.filter((v) => v.statut === 'en-attente').sort(parDateDesc('cree'));
    const repondues = validations.filter((v) => v.statut !== 'en-attente').sort(parDateDesc('maj'));
    const bloc = (v) => ligne({ icone: v.statut === 'approuvee' ? 'check' : v.statut === 'modifications' ? 'edit' : 'valider', ton: v.statut === 'approuvee' ? 'vert' : v.statut === 'modifications' ? 'ambre' : 'violet', titre: echapper(v.titre), sous: `${echapper(TYPES_VALIDATION[v.type] || '')} · ${echapper(nomProjet(v.projet))} · ${echapper(depuis(v.cree))}${v.echeance && v.statut === 'en-attente' ? ` ${echeanceHtml(echeance(v.echeance))}` : ''}${v.reponse && v.reponse.nom ? ` · ${echapper(v.reponse.nom)} le ${echapper(dateCourte(v.reponse.date))}` : ''}`, fin: pastille(STATUTS_VALIDATION, v.statut), action: 'ouvrir', attrs: `data-id="${echapper(v.id)}"` });
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Validations</h1><p class="chapo">${attente.length ? `${attente.length} en attente du client.` : 'Rien n\'attend le client.'}</p></div><div class="actions"><button class="btn btn-principal" type="button" data-nouvelle>${icone('plus')} Demander une validation</button></div></div>
      ${attente.length ? `<section class="section" style="margin-top:0"><div class="section-tete"><h2>En attente</h2></div><div class="liste">${attente.map(bloc).join('')}</div></section>` : vide({ icone: 'valider', titre: 'Aucune validation en attente', compact: true })}
      ${repondues.length ? `<section class="section"><div class="section-tete"><h2>Répondues</h2></div><div class="liste">${repondues.slice(0, 30).map(bloc).join('')}</div></section>` : ''}
    </div>`;
    if (ouvert) { const v = validations.find((x) => x.id === ouvert); ouvert = null; if (v) ouvrirValidation(v, env, projets).then(() => naviguer('/validations', { remplacer: true })); }
  };
  const gestes = sur(sortie, 'click', '[data-action="ouvrir"], [data-nouvelle]', async (el) => {
    const projets = magasin.lire(K.projets) || [];
    if (el.hasAttribute('data-nouvelle')) {
      if (!projets.length) { toast('Créez d\'abord un projet.', 'erreur'); return; }
      const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
      m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#choix-p').value));
      const pid = await m.fin;
      if (pid) editer('validation', env, { pid });
      return;
    }
    const v = (magasin.lire(K.validationsToutes) || []).find((x) => x.id === el.dataset.id);
    if (v) ouvrirValidation(v, env, projets);
  });
  [K.projets, K.validationsToutes].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
