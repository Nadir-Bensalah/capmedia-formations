/* ==========================================================================
   Les documents : tous les fichiers de tous les projets, avec filtres,
   recherche, tri, dépôt. Partagé par le client et l'équipe. Le client
   retire ce qu'il a lui-même déposé ; l'équipe archive.
   ========================================================================== */

import { echapper, parDateDesc, enDate, CATEGORIES_FICHIER, CATEGORIES_CLIENT } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, fichierHtml, brancherPieces, modale, depot, lireForme, toast, agir, optionsDe, menu, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, nouvelId } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { editer } from './editeurs.js';

/* Les tris : le plus récent d'abord (le défaut), le plus ancien, le nom. */
const TRIS = { recents: 'Plus récents', anciens: 'Plus anciens', nom: 'Nom' };
const trier = (liste, tri) => {
  if (tri === 'nom') return liste.slice().sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }));
  if (tri === 'anciens') return liste.slice().sort((a, b) => (enDate(a.cree) || 0) - (enDate(b.cree) || 0));
  return liste.slice().sort(parDateDesc('cree'));
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const equipe = env.role === 'equipe';
  const uid = session.utilisateur.uid;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Documents');
  filAriane([{ libelle: 'Documents' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const etat = { categorie: '', projet: '', terme: '', tri: 'recents' };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const tous = agreger(session, G.fichiers).filter((f) => !f.archive);
    const terme = etat.terme.toLowerCase();
    const liste = trier(tous.filter((f) => (!etat.categorie || f.categorie === etat.categorie) && (!etat.projet || f.projet === etat.projet) && (!terme || `${f.nom} ${f.description || ''} ${(f.tags || []).join(' ')}`.toLowerCase().includes(terme))), etat.tri);
    const categories = Object.entries(CATEGORIES_FICHIER).filter(([cle]) => tous.some((f) => f.categorie === cle));

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Documents</h1><p class="chapo">Maquettes, contrats, livrables, captures : tous vos fichiers, rangés par catégorie et par projet.</p></div>
        <div class="actions">${equipe ? `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Déposer</button>` : `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Envoyer un fichier</button>`}</div></div>
      <div class="rang" style="margin-bottom:16px;gap:12px">
        <div style="flex:1;min-width:220px;position:relative"><input class="champ" type="search" id="recherche-doc" placeholder="Rechercher un fichier" value="${echapper(etat.terme)}" aria-label="Rechercher"></div>
        ${projets.length > 1 ? `<select class="select" id="filtre-projet" style="width:auto;min-width:180px"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>` : ''}
        <select class="select" id="tri-doc" style="width:auto" aria-label="Trier">${optionsDe(TRIS, etat.tri)}</select>
      </div>
      ${categories.length > 1 ? `<div class="filtres" style="margin-bottom:20px"><button class="filtre${!etat.categorie ? ' actif' : ''}" type="button" data-cat="">Tous<span class="compte">${tous.length}</span></button>${categories.map(([cle, lib]) => `<button class="filtre${etat.categorie === cle ? ' actif' : ''}" type="button" data-cat="${cle}">${echapper(lib)}<span class="compte">${tous.filter((f) => f.categorie === cle).length}</span></button>`).join('')}</div>` : ''}
      ${liste.length ? `<div class="grille grille-2">${liste.map((f) => fichierHtml({ ...f, categorieLibelle: `${CATEGORIES_FICHIER[f.categorie] || f.categorie}${projets.length > 1 ? ` · ${nomProjet(f.projet)}` : ''}` }, { menu: equipe, retirer: !equipe, moi: equipe ? '' : uid })).join('')}</div>`
      : vide({ icone: 'fichiers', titre: tous.length ? 'Rien ne correspond' : 'Aucun document', texte: tous.length ? 'Changez un filtre ou le terme de recherche.' : 'Les fichiers de vos projets apparaîtront ici.' })}
    </div>`;
    const champ = sortie.querySelector('#recherche-doc');
    champ.addEventListener('input', () => { etat.terme = champ.value; const pos = champ.selectionStart; rendre(); const c = sortie.querySelector('#recherche-doc'); c.focus(); c.setSelectionRange(pos, pos); });
    const sel = sortie.querySelector('#filtre-projet');
    if (sel) sel.addEventListener('change', () => { etat.projet = sel.value; rendre(); });
    const tri = sortie.querySelector('#tri-doc');
    if (tri) tri.addEventListener('change', () => { etat.tri = TRIS[tri.value] ? tri.value : 'recents'; rendre(); });
  };

  const gestes = sur(sortie, 'click', '[data-cat], [data-deposer], [data-menu-fichier]', async (el) => {
    if (el.dataset.cat !== undefined) { etat.categorie = el.dataset.cat; rendre(); return; }
    const projets = magasin.lire(K.projets) || session.projets;
    if (el.hasAttribute('data-deposer')) {
      const pid = etat.projet || (projets[0] && projets[0].id);
      if (!pid) { toast('Aucun projet pour ranger ce fichier.', 'erreur'); return; }
      /* « Pour quel projet ? » ne se demande que s'il y a plusieurs projets
         ET aucun filtre projet : sinon le choix est déjà fait. */
      if (projets.length > 1 && !etat.projet) {
        const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
        m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#choix-p').value));
        const choix = await m.fin;
        if (!choix) return;
        return equipe ? editer('fichier', env, { pid: choix }) : depotClient(choix, env);
      }
      return equipe ? editer('fichier', env, { pid }) : depotClient(pid, env);
    }
    if (el.dataset.menuFichier) {
      const f = agreger(session, G.fichiers).find((x) => x.id === el.dataset.menuFichier);
      if (!f) return;
      /* Le client ne retire que ce qu'il a lui-même déposé : la règle le
         vérifie aussi. L'équipe, elle, archive. */
      if (!equipe) {
        if (!f.par || f.par.uid !== uid) return;
        menu(el, [{ libelle: 'Retirer ce fichier', icone: 'corbeille', danger: true, action: async () => { if (await confirmer({ titre: 'Retirer ce fichier ?', texte: 'Il disparaît pour vous et pour Capmedia.', ok: 'Retirer', danger: true })) agir(null, () => ecrire.retirerFichier(f), 'Fichier retiré.'); } }]);
        return;
      }
      menu(el, [
        { libelle: 'Modifier la fiche', icone: 'edit', action: () => editer('fichier', env, { pid: f.projet, fiche: f }) },
        { libelle: 'Archiver', icone: 'archive', danger: true, action: async () => { if (await confirmer({ titre: 'Archiver ce fichier ?', ok: 'Archiver' })) agir(null, () => ecrire.majFichier(f.id, { archive: true }), 'Fichier archivé.'); } },
      ]);
    }
  });
  brancherPieces(sortie);
  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  (session.equipe ? [K.projets, K.fichiersTous] : [K.projets, ...session.projets.map((p) => K.fichiers(p.id))]).forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};

/* Le dépôt du client : les mêmes catégories et les mêmes libellés que
   partout (CATEGORIES_CLIENT, CATEGORIES_FICHIER), le même message de fin
   que sur la fiche du projet. */
const depotClient = (pid, env) => {
  const m = modale({
    titre: 'Envoyer des fichiers', sousTitre: 'Ils arrivent directement chez Capmedia.', feuille: true,
    corps: `<form class="forme" id="forme-depot" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="cat-depot">Catégorie</label><select class="select" id="cat-depot" name="categorie">${optionsDe(Object.fromEntries(CATEGORIES_CLIENT.map((c) => [c, CATEGORIES_FICHIER[c]])), 'captures')}</select></div>
      <div class="groupe"><label class="etiquette-champ" for="desc-depot">Un mot pour nous <span class="facultatif">(facultatif)</span></label><input class="champ" id="desc-depot" name="description" maxlength="200"></div>
      <div id="zone-depot"></div></form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="forme-depot">Envoyer</button>`,
  });
  const boite = depot(m.el.querySelector('#zone-depot'), { chemin: () => `projets/${pid}/fichiers/${nouvelId('fichiers')}`, max: 20 });
  m.el.querySelector('#forme-depot').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const pieces = boite.pieces;
    if (!pieces.length) { toast('Choisissez au moins un fichier.', 'erreur'); return; }
    const d = lireForme(e.target);
    await agir(m.pied.querySelector('[type="submit"]'), async () => { for (const p of pieces) await ecrire.deposerFichier(env.session, pid, p, { categorie: d.categorie, description: d.description }); m.fermer(true); }, pieces.length > 1 ? `${pieces.length} fichiers envoyés.` : 'Fichier envoyé.');
  });
  return m.fin;
};
