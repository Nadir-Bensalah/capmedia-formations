/* ==========================================================================
   Les documents : tout ce que le client a reçu ou déposé, au même endroit.
   Les fichiers des projets (dépôts de Capmedia et les siens) et, pour le
   responsable d'un projet, ses pièces comptables : factures, devis,
   avoirs. Filtres par genre, par projet, recherche, tri, dépôt. Partagé
   par le client et l'équipe (qui n'y voit que les fichiers : la finance a
   sa page). Le client retire ce qu'il a lui-même déposé ; l'équipe archive.

   Les pièces ne sont pas redessinées ici : la ligne, la fiche et le
   téléchargement (par le serveur, suiviPiece) sont ceux de « Devis et
   factures » (lignePiece, brancherPiecesComptables).
   ========================================================================== */

import { echapper, enDate, estResponsable, CATEGORIES_FICHIER, CATEGORIES_CLIENT } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, fichierHtml, brancherPieces, modale, depot, lireForme, toast, agir, optionsDe, menu, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, nouvelId } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { editer } from './editeurs.js';
import { lignePiece, brancherPiecesComptables } from './finances.js';

/* Les tris : le plus récent d'abord (le défaut), le plus ancien, le nom.
   Un fichier se date à son dépôt, une pièce à son émission. */
const TRIS = { recents: 'Plus récents', anciens: 'Plus anciens', nom: 'Nom' };
const quand = (x) => enDate(x.cree || x.date) || 0;
const nomDe = (x) => (x.type === 'devis' || x.type === 'facture' ? `${x.numero || ''} ${x.libelle || ''}`.trim() : String(x.nom || ''));
const trier = (liste, tri) => {
  if (tri === 'nom') return liste.slice().sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'fr', { sensitivity: 'base' }));
  if (tri === 'anciens') return liste.slice().sort((a, b) => quand(a) - quand(b));
  return liste.slice().sort((a, b) => quand(b) - quand(a));
};

/* Les genres de la page, dans leur ordre d'affichage. Un avoir est une
   facture dont le statut dit « avoir » : il a son propre rayon. */
const GENRES = { factures: 'Factures', devis: 'Devis', avoirs: 'Avoirs', fichiers: 'Fichiers du projet' };
const genreDe = (x) => (x.type === 'devis' ? 'devis' : x.type === 'facture' ? (x.statut === 'avoir' ? 'avoirs' : 'factures') : 'fichiers');

/**
 * Ce que la page Documents montre, la même source pour la page et pour le
 * badge de la barre. Les fichiers non archivés ; les pièces seulement pour
 * le client, et seulement sur les projets dont il est responsable (un
 * collaborateur ne lit pas la finance : il ne s'y abonne pas, et l'écran
 * ne compte pas sur ce seul fait). Jamais un brouillon ni une archive.
 */
export const documentsVisibles = (session) => {
  const fichiers = agreger(session, G.fichiers).filter((f) => !f.archive);
  if (session.equipe) return { fichiers, pieces: [] };
  const projets = magasin.lire(K.projets) || session.projets || [];
  const miens = new Set(projets.filter((p) => estResponsable(session, p)).map((p) => p.id));
  const pieces = agreger(session, G.documents)
    .filter((d) => (d.type === 'devis' || d.type === 'facture') && !d.archive && d.statut !== 'brouillon' && miens.has(d.projet));
  return { fichiers, pieces };
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
  const etat = { genre: '', categorie: '', projet: '', terme: '', tri: 'recents' };
  let dernierHtml = '';

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const { fichiers: tousFichiers, pieces: toutesPieces } = documentsVisibles(session);
    const terme = etat.terme.toLowerCase();
    const duProjet = (x) => !etat.projet || x.projet === etat.projet;
    const trouve = (x) => !terme || (x.type === 'devis' || x.type === 'facture'
      ? `${x.numero || ''} ${x.libelle || ''} ${nomProjet(x.projet)}`
      : `${x.nom} ${x.description || ''} ${(x.tags || []).join(' ')}`).toLowerCase().includes(terme);
    /* Les comptes des puces suivent le projet choisi, pas la recherche :
       ils disent ce qu'il y a, la liste dit ce qui correspond. */
    const fichiersProjet = tousFichiers.filter(duProjet);
    const piecesProjet = toutesPieces.filter(duProjet);
    const parGenre = { factures: [], devis: [], avoirs: [], fichiers: fichiersProjet };
    piecesProjet.forEach((d) => parGenre[genreDe(d)].push(d));
    const genres = Object.keys(GENRES).filter((g) => parGenre[g].length);
    if (etat.genre && !genres.includes(etat.genre)) etat.genre = '';
    const total = fichiersProjet.length + piecesProjet.length;
    const categories = Object.entries(CATEGORIES_FICHIER).filter(([cle]) => fichiersProjet.some((f) => f.categorie === cle));
    if (etat.categorie && !categories.some(([cle]) => cle === etat.categorie)) etat.categorie = '';
    /* La liste d'un genre, filtrée et triée. */
    const listeDe = (g) => trier(parGenre[g].filter((x) => trouve(x) && (g !== 'fichiers' || !etat.categorie || x.categorie === etat.categorie)), etat.tri);
    const blocFichiers = (liste) => `<div class="grille grille-2">${liste.map((f) => fichierHtml({ ...f, categorieLibelle: `${CATEGORIES_FICHIER[f.categorie] || f.categorie}${projets.length > 1 ? ` · ${nomProjet(f.projet)}` : ''}` }, { menu: equipe, retirer: !equipe, moi: equipe ? '' : uid })).join('')}</div>`;
    const blocPieces = (liste) => `<div class="liste">${liste.map((d) => lignePiece(d, nomProjet, { detailHT: true })).join('')}</div>`;
    const bloc = (g, liste) => (g === 'fichiers' ? blocFichiers(liste) : blocPieces(liste));
    const avecPieces = toutesPieces.length > 0;
    /* Le client responsable d'au moins un projet : la page lui parle aussi
       de ses devis et factures, même avant la première pièce. */
    const finance = !equipe && projets.some((p) => estResponsable(session, p));
    const montres = etat.genre ? [etat.genre] : genres;
    const listes = montres.map((g) => [g, listeDe(g)]);
    const rien = listes.every(([, l]) => !l.length);
    /* Un seul genre à l'écran : sa liste, sans titre de section. Plusieurs :
       une section par genre, dans l'ordre de GENRES, les vides tues. */
    const corps = rien
      ? vide({ icone: 'fichiers', titre: total ? 'Rien ne correspond' : 'Aucun document', texte: total ? 'Changez un filtre ou le terme de recherche.' : (finance ? 'Les fichiers, devis et factures de vos projets apparaîtront ici.' : 'Les fichiers de vos projets apparaîtront ici.') })
      : (listes.length === 1 ? bloc(listes[0][0], listes[0][1])
        : listes.filter(([, l]) => l.length).map(([g, l]) => `<section class="section" data-rayon="${g}"><div class="section-tete"><h2>${echapper(GENRES[g])}</h2><span class="t-petit t-3">${l.length}</span></div>${bloc(g, l)}</section>`).join(''));

    const html = `<div class="page">
      <div class="page-tete"><div><h1>Documents</h1><p class="chapo">${finance ? 'Factures, devis, maquettes, contrats, livrables : tous vos documents, rangés par genre et par projet.' : 'Maquettes, contrats, livrables, captures : tous vos fichiers, rangés par catégorie et par projet.'}</p></div>
        <div class="actions">${equipe ? `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Déposer</button>` : `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Envoyer un fichier</button>`}</div></div>
      <div class="rang" style="margin-bottom:16px;gap:12px">
        <div style="flex:1;min-width:220px;position:relative"><input class="champ" type="search" id="recherche-doc" placeholder="${finance ? 'Rechercher un document' : 'Rechercher un fichier'}" value="${echapper(etat.terme)}" aria-label="Rechercher"></div>
        ${projets.length > 1 ? `<select class="select" id="filtre-projet" style="width:auto;min-width:180px"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>` : ''}
        <select class="select" id="tri-doc" style="width:auto" aria-label="Trier">${optionsDe(TRIS, etat.tri)}</select>
      </div>
      ${genres.length > 1 ? `<div class="filtres" id="filtre-genre" style="margin-bottom:12px"><button class="filtre${!etat.genre ? ' actif' : ''}" type="button" data-genre="">Tous<span class="compte">${total}</span></button>${genres.map((g) => `<button class="filtre${etat.genre === g ? ' actif' : ''}" type="button" data-genre="${g}">${echapper(GENRES[g])}<span class="compte">${parGenre[g].length}</span></button>`).join('')}</div>` : ''}
      ${(!avecPieces || etat.genre === 'fichiers') && categories.length > 1 ? `<div class="filtres" style="margin-bottom:20px"><button class="filtre${!etat.categorie ? ' actif' : ''}" type="button" data-cat="">${avecPieces ? 'Tous les fichiers' : 'Tous'}<span class="compte">${fichiersProjet.length}</span></button>${categories.map(([cle, lib]) => `<button class="filtre${etat.categorie === cle ? ' actif' : ''}" type="button" data-cat="${cle}">${echapper(lib)}<span class="compte">${fichiersProjet.filter((f) => f.categorie === cle).length}</span></button>`).join('')}</div>` : (genres.length > 1 ? '<div style="height:8px"></div>' : '')}
      ${corps}
    </div>`;
    /* Une donnée qui revient à l'identique ne repeint pas la page : sinon
       chaque clé qui se réveille la ferait rejouer, et l'œil la voit
       clignoter. */
    if (html === dernierHtml && sortie.querySelector('#recherche-doc')) return;
    dernierHtml = html;
    sortie.innerHTML = html;
    const champ = sortie.querySelector('#recherche-doc');
    champ.addEventListener('input', () => { etat.terme = champ.value; const pos = champ.selectionStart; rendre(); const c = sortie.querySelector('#recherche-doc'); c.focus(); c.setSelectionRange(pos, pos); });
    const sel = sortie.querySelector('#filtre-projet');
    if (sel) sel.addEventListener('change', () => { etat.projet = sel.value; rendre(); });
    const tri = sortie.querySelector('#tri-doc');
    if (tri) tri.addEventListener('change', () => { etat.tri = TRIS[tri.value] ? tri.value : 'recents'; rendre(); });
  };

  const gestes = sur(sortie, 'click', '[data-genre], [data-cat], [data-deposer], [data-menu-fichier]', async (el) => {
    if (el.dataset.genre !== undefined) { etat.genre = el.dataset.genre; etat.categorie = ''; rendre(); return; }
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
  /* Les pièces comptables : la fiche et le PDF de « Devis et factures ». */
  const gestesPieces = equipe ? () => {} : brancherPiecesComptables(sortie, env);
  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là.
     Le client attend aussi les pièces des projets dont il est responsable,
     et seulement celles-là : les autres ne sont pas abonnées, attendre leur
     clé retarderait la page pour rien. */
  const cles = (session.equipe ? [K.projets, K.fichiersTous] : [K.projets, ...session.projets.flatMap((p) => [K.fichiers(p.id), ...(estResponsable(session, p) ? [K.documents(p.id)] : [])])]);
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { planifier.arreter(); gestes(); gestesPieces(); lot.fin(); };
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
