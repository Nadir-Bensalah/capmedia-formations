/* ==========================================================================
   L'activité de tous les projets, filtrable par projet et par nature.
   ========================================================================== */

import { echapper, parDateDesc } from '../noyau.js';
import { squelette, titrePage, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { activiteHtml } from './accueil.js';

const NATURES = { '': 'Tout', demande: 'Demandes', tache: 'Tâches', message: 'Messages', validation: 'Validations', fichier: 'Fichiers', release: 'Versions', reunion: 'Réunions', devis: 'Devis', facture: 'Factures', paiement: 'Paiements', jalon: 'Jalons', note: 'Notes', blocage: 'Blocages', projet: 'Projets' };

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Activité');
  filAriane([{ libelle: 'Activité' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 8)}</div>`;
  const etat = { projet: '', nature: '', interne: true };
  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const activite = (magasin.lire(K.activiteToute) || []).filter((a) => (!etat.projet || a.projet === etat.projet) && (!etat.nature || a.type === etat.nature) && (etat.interne || a.visibilite !== 'interne')).sort(parDateDesc('date')).map((a) => ({ ...a, projetNom: nomProjet(a.projet) }));
    sortie.innerHTML = `<div class="page" style="max-width:900px">
      <div class="page-tete"><div><h1>Activité</h1><p class="chapo">Chaque mouvement, issu des vrais événements des projets.</p></div>
        <div class="actions"><select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><label class="case"><input type="checkbox" id="f-interne" ${etat.interne ? 'checked' : ''}> Inclure l'interne</label></div></div>
      <div class="filtres" style="margin-bottom:20px">${Object.entries(NATURES).map(([c, l]) => `<button class="filtre${etat.nature === c ? ' actif' : ''}" type="button" data-nature="${c}">${l}</button>`).join('')}</div>
      ${activiteHtml(activite.slice(0, 200), { avecProjet: true })}
    </div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
    sortie.querySelector('#f-interne').addEventListener('change', (e) => { etat.interne = e.target.checked; rendre(); });
  };
  const gestes = sur(sortie, 'click', '[data-nature]', (el) => { etat.nature = el.dataset.nature; rendre(); });
  [K.projets, K.activiteToute].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
