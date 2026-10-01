/* ==========================================================================
   L'activité de tous mes projets. « Tout voir » depuis l'accueil menait au
   premier projet seulement : ici, tout, filtré par projet et par nature,
   par pages de cinquante.
   ========================================================================== */

import { echapper, parDateDesc, pluriel } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, optionsDe } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { activiteHtml } from './accueil.js';

/* Les natures d'activité, dans les mots du client. Une nature absente du
   fil ne s'affiche pas en filtre. */
const NATURES = {
  tache: 'Tâches', jalon: 'Étapes', release: 'Versions', fichier: 'Fichiers', reunion: 'Réunions',
  validation: 'Validations', demande: 'Demandes', message: 'Messages', devis: 'Devis', facture: 'Factures',
  paiement: 'Paiements', note: 'Décisions', blocage: 'Points bloquants', projet: 'Projet', maintenance: 'Maintenance', test: 'Tests',
};
const PAGE = 50;

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Activité');
  filAriane([{ libelle: 'Activité' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  /* Les filtres se lisent dans l'adresse (#/activite?projet=x&nature=y),
     pour qu'un lien de l'accueil puisse arriver déjà filtré. */
  let projetFiltre = (ctx.requete && ctx.requete.projet) || '';
  let nature = (ctx.requete && ctx.requete.nature) || '';
  let pages = 1;

  const rendre = () => {
    const projets = (magasin.lire(K.projets) || session.projets || []).filter((p) => !p.archive);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const toute = agreger(session, G.activite).filter((a) => a.date).sort(parDateDesc('date'));
    const presentes = Object.entries(NATURES).filter(([cle]) => toute.some((a) => a.type === cle));
    if (projetFiltre && !projets.some((p) => p.id === projetFiltre)) projetFiltre = '';
    const filtree = toute.filter((a) => (!projetFiltre || a.projet === projetFiltre) && (!nature || a.type === nature));
    const visibles = filtree.slice(0, pages * PAGE).map((a) => ({ ...a, projetNom: nomProjet(a.projet) }));
    const reste = filtree.length - visibles.length;

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Activité</h1><p class="chapo">${toute.length ? `${pluriel(toute.length, 'mouvement')} sur ${pluriel(projets.length, 'projet')}, du plus récent au plus ancien.` : 'Chaque mouvement de vos projets apparaîtra ici.'}</p></div>
        ${projets.length > 1 ? `<div class="actions"><select class="select" id="filtre-projet" aria-label="Projet">${optionsDe({ '': 'Tous les projets', ...Object.fromEntries(projets.map((p) => [p.id, p.nom])) }, projetFiltre)}</select></div>` : ''}
      </div>
      ${presentes.length > 1 ? `<div class="filtres" style="margin-bottom:16px">
        <button class="filtre${!nature ? ' actif' : ''}" type="button" data-nature="">Tout<span class="compte">${toute.filter((a) => !projetFiltre || a.projet === projetFiltre).length}</span></button>
        ${presentes.map(([cle, lib]) => `<button class="filtre${nature === cle ? ' actif' : ''}" type="button" data-nature="${cle}">${echapper(lib)}<span class="compte">${toute.filter((a) => a.type === cle && (!projetFiltre || a.projet === projetFiltre)).length}</span></button>`).join('')}
      </div>` : ''}
      <section class="section" style="margin-top:0">
        ${visibles.length
    ? `${activiteHtml(visibles, { avecProjet: projets.length > 1 && !projetFiltre, equipe: false })}
          ${reste > 0 ? `<p style="margin-top:16px"><button class="btn btn-secondaire" type="button" data-plus>${icone('plier')} Voir ${Math.min(reste, PAGE)} de plus <span class="t-3">· ${pluriel(reste, 'restant')}</span></button></p>` : `<p class="t-micro t-3" style="margin-top:16px">${filtree.length ? 'Tout est affiché.' : ''}</p>`}`
    : vide({ icone: 'activite', titre: nature || projetFiltre ? 'Rien pour ce filtre' : "Pas encore d'activité", texte: nature || projetFiltre ? 'Essayez un autre projet ou une autre nature.' : 'Chaque mouvement de vos projets apparaîtra ici.', compact: true })}
      </section>
    </div>`;
  };

  const gestes = sur(sortie, 'click', '[data-nature], [data-plus]', (el) => {
    if (el.dataset.nature !== undefined) { nature = el.dataset.nature; pages = 1; }
    if (el.dataset.plus !== undefined) pages += 1;
    rendre();
  });
  const gesteProjet = sur(sortie, 'change', '#filtre-projet', (el) => { projetFiltre = el.value; pages = 1; rendre(); });

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const cles = [K.projets, ...(session.projets || []).map((p) => K.activite(p.id))];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { planifier.arreter(); gestes(); gesteProjet(); lot.fin(); };
};
