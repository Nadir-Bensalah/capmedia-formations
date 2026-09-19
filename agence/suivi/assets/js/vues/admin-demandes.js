/* ==========================================================================
   La boîte des demandes : toutes les demandes de tous les clients, par
   étape de traitement, avec filtres par projet, urgence et assignation.
   ========================================================================== */

import { echapper, depuis, pluriel, parDateDesc, STATUTS, TYPES, URGENCES, QUALIFICATIONS, OUVERTS, ATTEND_EQUIPE, ATTEND_CLIENT, age } from '../noyau.js';
import { icone, pastille, puce, pucePlateforme, iconePlateforme, tonPlateforme, ligne, vide, squelette, titrePage, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';

const COLONNES = [
  { cle: 'nouveau', libelle: 'Nouvelles', statuts: ['nouveau'] },
  { cle: 'a-traiter', libelle: 'À traiter', statuts: ['a-analyser', 'acceptee', 'planifiee', 'en-cours', 'en-revue'] },
  { cle: 'client', libelle: 'En attente client', statuts: ATTEND_CLIENT },
  { cle: 'terminees', libelle: 'Terminées', statuts: ['resolu', 'refuse', 'annulee', 'ferme'] },
];

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Demandes');
  filAriane([{ libelle: 'Demandes' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  const etat = { colonne: 'nouveau', projet: '', urgence: '', moi: false, terme: '' };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const tous = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const filtres = (t) => (!etat.projet || t.projet === etat.projet) && (!etat.urgence || t.urgence === etat.urgence) && (!etat.moi || t.assigne === env.session.equipe.uid) && (!etat.terme || `${t.numero || ''} ${t.titre} ${nomProjet(t.projet)}`.toLowerCase().includes(etat.terme.toLowerCase()));
    const colonne = COLONNES.find((c) => c.cle === etat.colonne) || COLONNES[0];
    const liste = tous.filter(filtres).filter((t) => colonne.statuts.includes(t.statut)).sort((a, b) => ((URGENCES[a.urgence] || {}).rang || 9) - ((URGENCES[b.urgence] || {}).rang || 9) || parDateDesc('maj')(a, b));
    const nonLu = (t) => { const l = (t.lu || {}).equipe; return !l || ((t.maj && t.maj.toMillis ? t.maj.toMillis() : 0) > (l.toMillis ? l.toMillis() : 0)); };

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Demandes</h1><p class="chapo">${pluriel(tous.filter((t) => OUVERTS.includes(t.statut)).length, 'demande ouverte', 'demandes ouvertes')}, ${tous.filter((t) => ATTEND_EQUIPE.includes(t.statut)).length} de notre côté.</p></div></div>
      <div class="rang" style="margin-bottom:12px;gap:10px">
        <input class="champ" type="search" id="terme" placeholder="Numéro, titre, projet" value="${echapper(etat.terme)}" style="flex:1;min-width:200px" aria-label="Rechercher">
        <select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>
        <select class="select" id="f-urgence" style="width:auto"><option value="">Toute urgence</option>${Object.entries(URGENCES).map(([c, u]) => `<option value="${c}" ${etat.urgence === c ? 'selected' : ''}>${echapper(u.libelle)}</option>`).join('')}</select>
        <label class="case"><input type="checkbox" id="f-moi" ${etat.moi ? 'checked' : ''}> Assignées à moi</label>
      </div>
      <div class="onglets">${COLONNES.map((c) => `<button class="onglet${etat.colonne === c.cle ? ' actif' : ''}" type="button" data-colonne="${c.cle}">${echapper(c.libelle)}<span class="badge${c.cle === 'nouveau' && tous.filter(filtres).filter((t) => c.statuts.includes(t.statut)).length ? ' badge--vif' : ''}">${tous.filter(filtres).filter((t) => c.statuts.includes(t.statut)).length}</span></button>`).join('')}</div>
      ${liste.length ? `<div class="liste">${liste.map((t) => ligne({
        href: `#/projets/${echapper(t.projet)}/demandes/${echapper(t.id)}`,
        icone: iconePlateforme(t.plateforme) || (TYPES[t.type] || {}).icone || 'inbox',
        ton: tonPlateforme(t.plateforme) || (t.urgence === 'bloquant' || t.urgence === 'critique' ? 'rouge' : ATTEND_CLIENT.includes(t.statut) ? 'ambre' : ''),
        nonLu: nonLu(t) && OUVERTS.includes(t.statut),
        titre: `${t.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(t.numero)}</span> ` : ''}${echapper(t.titre)}`,
        sous: `${echapper(nomProjet(t.projet))} · ${echapper((TYPES[t.type] || {}).libelle || t.type)} · ${echapper(OUVERTS.includes(t.statut) ? `ouverte depuis ${age(t.cree)}` : depuis(t.maj))}${t.plateforme ? ` ${pucePlateforme(t.plateforme, { court: true })}` : ''}${t.qualification ? ` ${pastille(QUALIFICATIONS, t.qualification)}` : ''}`,
        fin: `${puce(URGENCES, t.urgence || 'important')}${pastille(STATUTS, t.statut)}${t.assigne ? '' : '<span class="etiquette">Sans assigné</span>'}`,
      })).join('')}</div>` : vide({ icone: 'inbox', titre: 'Rien dans cette colonne', texte: etat.colonne === 'nouveau' ? 'Aucune nouvelle demande. Tout est pris en charge.' : '', compact: true })}
    </div>`;
    sortie.querySelector('#terme').addEventListener('input', (e) => { etat.terme = e.target.value; const pos = e.target.selectionStart; rendre(); const c = sortie.querySelector('#terme'); c.focus(); c.setSelectionRange(pos, pos); });
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
    sortie.querySelector('#f-urgence').addEventListener('change', (e) => { etat.urgence = e.target.value; rendre(); });
    sortie.querySelector('#f-moi').addEventListener('change', (e) => { etat.moi = e.target.checked; rendre(); });
  };
  const gestes = sur(sortie, 'click', '[data-colonne]', (el) => { etat.colonne = el.dataset.colonne; rendre(); });
  [K.projets, K.ticketsTous].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};

void icone;
