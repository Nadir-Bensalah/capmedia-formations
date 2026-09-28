/* ==========================================================================
   Mes demandes, tous projets confondus. À plusieurs projets, l'onglet
   Demandes de chaque projet obligeait à faire le tour : ici, la même liste,
   les mêmes filtres, plus un filtre par projet. À un seul projet, la page
   reste utile : c'est l'entrée « Demandes » du rail.
   ========================================================================== */

import { echapper, parDateDesc, age, depuis, OUVERTS, ATTEND_CLIENT, STATUTS, TYPES, URGENCES, QUALIFICATIONS } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur, pastille, puce, iconePlateforme, tonPlateforme } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { choisirProjet } from './accueil.js';

const CLE_FILTRE = 'suivi:filtre-demandes:*';
const CLE_PROJET = 'suivi:filtre-demandes-projet:*';
const lireMemoire = (cle, defaut) => { try { return sessionStorage.getItem(cle) || defaut; } catch (e) { return defaut; } };
const retenir = (cle, valeur) => { try { sessionStorage.setItem(cle, valeur); } catch (e) { /* stockage refusé */ } };

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Demandes');
  filAriane([{ libelle: 'Demandes' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const etat = { filtre: lireMemoire(CLE_FILTRE, 'ouvertes'), projet: (ctx.requete && ctx.requete.projet) || lireMemoire(CLE_PROJET, '') };

  const rendre = () => {
    const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
    if (etat.projet && !projets.some((p) => p.id === etat.projet)) etat.projet = '';
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const tous = agreger(session, G.tickets)
      .filter((t) => !t.archive && projets.some((p) => p.id === t.projet))
      .filter((t) => !etat.projet || t.projet === etat.projet)
      .sort(parDateDesc('maj'));
    const groupes = {
      ouvertes: tous.filter((t) => OUVERTS.includes(t.statut)),
      moi: tous.filter((t) => ATTEND_CLIENT.includes(t.statut)),
      terminees: tous.filter((t) => !OUVERTS.includes(t.statut)),
      toutes: tous,
    };
    const liste = groupes[etat.filtre] || groupes.ouvertes;
    const nonLu = (t) => { const marque = (t.lu || {}).client; return !marque || ((t.maj && t.maj.toMillis ? t.maj.toMillis() : 0) > (marque.toMillis ? marque.toMillis() : 0)); };

    sortie.innerHTML = `<div class="page">
      <div class="page-tete">
        <div><h1>Demandes</h1><p class="chapo">${projets.length > 1 ? 'Toutes vos demandes, sur tous vos projets. ' : ''}Ce qui est chez nous, ce qui attend votre réponse, ce qui est terminé.</p></div>
        <div class="actions">${projets.length ? `<button class="btn btn-principal" type="button" data-nouvelle-demande>${icone('plus')} Nouvelle demande</button>` : ''}</div>
      </div>
      <div class="rang" style="margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div class="filtres">
          ${[['ouvertes', 'Ouvertes'], ['moi', 'À vous'], ['terminees', 'Terminées'], ['toutes', 'Toutes']].map(([cle, lib]) => `<button class="filtre${etat.filtre === cle ? ' actif' : ''}" type="button" data-filtre="${cle}">${lib}<span class="compte">${groupes[cle].length}</span></button>`).join('')}
        </div>
        ${projets.length > 1 ? `<select class="select" id="filtre-projet" style="width:auto;min-width:180px" aria-label="Projet"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}"${etat.projet === p.id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>` : ''}
      </div>
      ${liste.length ? `<div class="liste">${liste.map((t) => ligne({
        href: `#/projets/${echapper(t.projet)}/demandes/${echapper(t.id)}`,
        icone: iconePlateforme(t.plateforme) || (TYPES[t.type] || {}).icone || 'inbox',
        ton: tonPlateforme(t.plateforme) || (ATTEND_CLIENT.includes(t.statut) ? 'ambre' : t.statut === 'resolu' ? 'vert' : ''),
        nonLu: nonLu(t) && OUVERTS.includes(t.statut),
        titre: `${t.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(t.numero)}</span> ` : ''}${echapper(t.titre)}`,
        sous: `${projets.length > 1 ? `${echapper(nomProjet(t.projet))} · ` : ''}${echapper((TYPES[t.type] || {}).libelle || t.type)} · ${puce(URGENCES, t.urgence || 'important')} · ${echapper(OUVERTS.includes(t.statut) ? `ouverte depuis ${age(t.cree)}` : `close ${depuis(t.maj)}`)}${t.qualification ? ` · ${pastille(QUALIFICATIONS, t.qualification)}` : ''}`,
        fin: `${(() => {
          const chez = (STATUTS[t.statut] || {}).chez;
          if (chez === 'client') return '<span class="puce puce--ambre"><i></i>À vous</span>';
          if (chez === 'capmedia') return '<span class="puce"><i></i>Chez Capmedia</span>';
          return '';
        })()}${pastille(STATUTS, t.statut, { client: true })}`,
      })).join('')}</div>`
      : vide({ icone: 'demandes', titre: etat.filtre === 'ouvertes' ? 'Aucune demande en cours' : 'Rien ici', texte: etat.filtre === 'ouvertes' ? 'Tout semble en ordre pour le moment.' : '', action: projets.length ? '<button class="btn btn-secondaire" type="button" data-nouvelle-demande>Créer une demande</button>' : '' })}
    </div>`;
    const sel = sortie.querySelector('#filtre-projet');
    if (sel) sel.addEventListener('change', () => { etat.projet = sel.value; retenir(CLE_PROJET, etat.projet); rendre(); });
  };

  const gestes = sur(sortie, 'click', '[data-filtre], [data-nouvelle-demande]', async (el) => {
    if (el.dataset.filtre !== undefined) { etat.filtre = el.dataset.filtre; retenir(CLE_FILTRE, etat.filtre); rendre(); return; }
    const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
    /* Le filtre projet vaut choix : sinon, à plusieurs projets, on demande. */
    const pid = etat.projet || await choisirProjet(projets);
    if (pid) naviguer(`/projets/${pid}/nouvelle-demande`);
  });

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  [K.projets, ...session.projets.map((p) => K.tickets(p.id))].forEach((c) => lot.sur(c, planifier));
  /* Un projet ouvert après le montage amène ses demandes sur une clé que la
     vue ne connaissait pas : on l'écoute dès qu'il apparaît. */
  const suivis = new Set(session.projets.map((p) => p.id));
  lot.sur(K.projets, (liste) => (liste || []).forEach((p) => { if (!suivis.has(p.id)) { suivis.add(p.id); lot.sur(K.tickets(p.id), planifier); } }));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};
