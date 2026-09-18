/* ==========================================================================
   Toutes les tâches, tous projets : liste ou kanban, filtres, création.
   ========================================================================== */

import { echapper, dateCourte, pluriel, joursAvant, echeance as calcEcheance, parDateAsc, STATUTS_TACHE, PRIORITES } from '../noyau.js';
import { icone, pastille, puce, avatar, ligne, vide, squelette, titrePage, sur, agir, echeanceHtml, modale, toast } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, parStatut } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { editer } from './editeurs.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Tâches');
  filAriane([{ libelle: 'Tâches' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  const etat = { mode: (() => { try { return localStorage.getItem('suivi:taches-vue-admin') || 'liste'; } catch (e) { return 'liste'; } })(), projet: '', assigne: '', retard: false, terminees: false };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const equipe = magasin.lire(K.equipe) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const nomEquipe = (uid) => ((equipe.find((e) => e.id === uid) || {}).nom || '');
    const toutes = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
    const liste = toutes.filter((t) => (!etat.projet || t.projet === etat.projet) && (!etat.assigne || t.assigne === etat.assigne) && (!etat.retard || (t.echeance && joursAvant(t.echeance) < 0 && t.statut !== 'terminee')) && (etat.terminees || t.statut !== 'terminee'))
      .sort((a, b) => ((STATUTS_TACHE[a.statut] || {}).ordre || 9) - ((STATUTS_TACHE[b.statut] || {}).ordre || 9) || ((PRIORITES[a.priorite] || {}).rang || 9) - ((PRIORITES[b.priorite] || {}).rang || 9) || parDateAsc('echeance')(a, b));
    const enRetard = toutes.filter((t) => t.echeance && joursAvant(t.echeance) < 0 && t.statut !== 'terminee').length;

    const carte = (t) => { const f = t.echeance && t.statut !== 'terminee' ? calcEcheance(t.echeance) : null; return ligne({
      href: `#/projets/${echapper(t.projet)}/taches/${echapper(t.id)}`, icone: t.statut === 'terminee' ? 'check' : t.statut === 'bloquee' ? 'alerte' : 'taches', ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : t.statut === 'attente-client' ? 'ambre' : t.statut === 'en-cours' ? 'bleu' : '',
      titre: `${echapper(t.titre)}${t.visibilite === 'interne' ? ' <span class="etiquette">Interne</span>' : ''}`, sous: `${echapper(nomProjet(t.projet))}${t.assigne ? ` · ${echapper(nomEquipe(t.assigne))}` : ' · sans assigné'}${f ? ` ${echeanceHtml(f)}` : ''}`,
      fin: `${puce(PRIORITES, t.priorite || 'normale')}${pastille(STATUTS_TACHE, t.statut || 'a-faire')}`,
    }); };

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Tâches</h1><p class="chapo">${pluriel(toutes.filter((t) => t.statut !== 'terminee').length, 'tâche ouverte', 'tâches ouvertes')}${enRetard ? `, ${enRetard} en retard` : ''}.</p></div>
        <div class="actions"><div class="segments"><button type="button" data-mode="liste" aria-pressed="${etat.mode === 'liste'}">${icone('liste')} Liste</button><button type="button" data-mode="kanban" aria-pressed="${etat.mode === 'kanban'}">${icone('kanban')} Kanban</button></div><button class="btn btn-principal" type="button" data-nouvelle>${icone('plus')} Nouvelle tâche</button></div></div>
      <div class="rang" style="margin-bottom:16px;gap:10px">
        <select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>
        <select class="select" id="f-assigne" style="width:auto"><option value="">Toute l'équipe</option>${equipe.map((e) => `<option value="${echapper(e.id)}" ${etat.assigne === e.id ? 'selected' : ''}>${echapper(e.nom || e.email)}</option>`).join('')}</select>
        <label class="case"><input type="checkbox" id="f-retard" ${etat.retard ? 'checked' : ''}> En retard</label>
        <label class="case"><input type="checkbox" id="f-terminees" ${etat.terminees ? 'checked' : ''}> Voir les terminées</label>
      </div>
      ${!liste.length ? vide({ icone: 'taches', titre: 'Aucune tâche', texte: 'Créez-en une, ou changez un filtre.', compact: true })
      : etat.mode === 'kanban' ? `<div class="kanban">${parStatut(liste, STATUTS_TACHE).map((col) => `<div class="kanban-col"><div class="kanban-tete"><span class="puce puce--${col.fiche.voile}"><i></i></span>${echapper(col.fiche.libelle)}<span class="badge">${col.items.length}</span></div>${col.items.map((t) => `<a class="kanban-carte" href="#/projets/${echapper(t.projet)}/taches/${echapper(t.id)}" style="display:block;text-decoration:none;color:inherit"><p class="titre">${echapper(t.titre)}</p><div class="sous"><span>${echapper(nomProjet(t.projet))}</span>${t.echeance ? `<span>${echapper(dateCourte(t.echeance))}</span>` : ''}${t.assigne ? avatar(nomEquipe(t.assigne) || 'C', { equipe: true, taille: 'petit' }) : ''}</div></a>`).join('')}</div>`).join('')}</div>`
      : `<div class="liste">${liste.map(carte).join('')}</div>`}
    </div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
    sortie.querySelector('#f-assigne').addEventListener('change', (e) => { etat.assigne = e.target.value; rendre(); });
    sortie.querySelector('#f-retard').addEventListener('change', (e) => { etat.retard = e.target.checked; rendre(); });
    sortie.querySelector('#f-terminees').addEventListener('change', (e) => { etat.terminees = e.target.checked; rendre(); });
  };

  const gestes = sur(sortie, 'click', '[data-mode], [data-nouvelle]', async (el) => {
    if (el.dataset.mode) { etat.mode = el.dataset.mode; try { localStorage.setItem('suivi:taches-vue-admin', etat.mode); } catch (e) { /* rien */ } rendre(); return; }
    const projets = magasin.lire(K.projets) || [];
    let pid = etat.projet;
    if (!pid) {
      if (!projets.length) { toast('Créez d\'abord un projet.', 'erreur'); return; }
      const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
      m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#choix-p').value));
      pid = await m.fin;
      if (!pid) return;
    }
    editer('tache', env, { pid });
  });
  [K.projets, K.equipe, K.tachesToutes].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};

void agir; void naviguer; void ecrire;
