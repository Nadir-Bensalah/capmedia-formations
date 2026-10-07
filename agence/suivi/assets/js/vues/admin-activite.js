/* ==========================================================================
   L'activité de tous les projets, filtrable par projet et par nature.
   ========================================================================== */

import { echapper, parDateDesc } from '../noyau.js';
import { squelette, titrePage, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, abonnerActiviteProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer, adresseAvec } from '../routeur.js';
import { activiteHtml } from './accueil.js';

const NATURES = { '': 'Tout', demande: 'Demandes', tache: 'Tâches', message: 'Messages', validation: 'Validations', fichier: 'Fichiers', release: 'Versions', reunion: 'Réunions', devis: 'Devis', facture: 'Factures', paiement: 'Paiements', jalon: 'Étapes', note: 'Notes', blocage: 'Blocages', projet: 'Projets', test: 'Tests' };

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Activité');
  filAriane([{ libelle: 'Activité' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 8)}</div>`;
  /* Les filtres vivent dans l'adresse (#/activite?projet=…&nature=…) : le
     « Tout voir » d'un projet y mène filtré, le Retour les retrouve. En
     changer redessine en place (« maj »). « interne=0 » retire l'interne. */
  const lireFiltres = (requete = {}) => ({ projet: requete.projet || '', nature: Object.prototype.hasOwnProperty.call(NATURES, requete.nature || '') ? (requete.nature || '') : '', interne: requete.interne !== '0' });
  const etat = lireFiltres(ctx.requete);
  const poser = (changes) => { const f = { ...etat, ...changes }; naviguer(adresseAvec('/activite', { projet: f.projet, nature: f.nature, interne: f.interne ? '' : '0' })); };
  let dernierHtml = '';
  let attente = null;
  const rendre = () => {
    clearTimeout(attente); attente = null;
    const projets = magasin.lire(K.projets) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    /* Un projet choisi : son propre fil, complet (celui de tous les projets
       s'arrête aux 200 derniers mouvements). Tant qu'il n'est pas arrivé,
       ce que le fil de tous en sait. */
    const duProjet = etat.projet ? magasin.lire(K.activite(etat.projet)) : undefined;
    const source = duProjet || magasin.lire(K.activiteToute) || [];
    const activite = source.filter((a) => (!etat.projet || a.projet === etat.projet) && (!etat.nature || a.type === etat.nature) && (etat.interne || a.visibilite !== 'interne')).sort(parDateDesc('date')).map((a) => ({ ...a, projetNom: nomProjet(a.projet) }));
    const html = `<div class="page" style="max-width:900px">
      <div class="page-tete"><div><h1>Activité</h1><p class="chapo">Chaque mouvement, issu des vrais événements des projets.</p></div>
        <div class="actions"><select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><label class="case"><input type="checkbox" id="f-interne" ${etat.interne ? 'checked' : ''}> Inclure l'interne</label></div></div>
      <div class="filtres" style="margin-bottom:20px">${Object.entries(NATURES).map(([c, l]) => `<button class="filtre${etat.nature === c ? ' actif' : ''}" type="button" data-nature="${c}">${l}</button>`).join('')}</div>
      ${activiteHtml(activite.slice(0, 200), { avecProjet: true, equipe: true })}
    </div>`;
    /* La même page, à l'identique : rien à repeindre. */
    if (html === dernierHtml && sortie.querySelector('#f-projet')) return;
    dernierHtml = html;
    sortie.innerHTML = html;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { poser({ projet: e.target.value }); });
    sortie.querySelector('#f-interne').addEventListener('change', (e) => { poser({ interne: e.target.checked }); });
  };
  const gestes = sur(sortie, 'click', '[data-nature]', (el) => { poser({ nature: el.dataset.nature }); });
  /* Le fil d'un projet choisi : on s'y abonne à la demande (une fois par
     projet), et le premier dessin l'attend. */
  const suivis = new Set();
  const suivreProjet = () => {
    if (!etat.projet || suivis.has(etat.projet)) return;
    suivis.add(etat.projet);
    abonnerActiviteProjet(lot, etat.projet, 'equipe');
    lot.sur(K.activite(etat.projet), planifier);
  };
  const cles = () => [K.projets, K.activiteToute, ...(etat.projet ? [K.activite(etat.projet)] : [])];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  [K.projets, K.activiteToute].forEach((c) => lot.sur(c, planifier));
  suivreProjet();
  planifier();
  return {
    fin: () => { clearTimeout(attente); planifier.arreter(); gestes(); lot.fin(); },
    /* Même page, autres filtres : un dessin, en place. */
    maj: (suite) => {
      const f = lireFiltres(suite.requete);
      if (f.projet === etat.projet && f.nature === etat.nature && f.interne === etat.interne) return;
      Object.assign(etat, f);
      suivreProjet();
      /* Le fil d'un projet pas encore arrivé : on l'attend (un peu) pour ne
         peindre qu'une fois, avec la liste complète. */
      if (etat.projet && magasin.lire(K.activite(etat.projet)) === undefined && !magasin.erreur(K.activite(etat.projet))) {
        clearTimeout(attente);
        attente = setTimeout(rendre, 1500);
        return;
      }
      rendre();
    },
  };
};
