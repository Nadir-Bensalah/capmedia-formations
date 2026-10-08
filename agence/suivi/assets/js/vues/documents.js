/* ==========================================================================
   Les fichiers : maquettes, photos, contrats, livrables, captures. Dans le
   Cockpit, la page « Fichiers » de tous les projets (#/fichiers), filtrable
   par projet dans l'adresse (#/fichiers?projet=<p>, l'entrée Fichiers d'un
   projet ; les filtres y vivent aussi). Chez le client, la
   page « Fichiers » D'UN projet (l'entrée Fichiers de son arbre, adresse
   #/fichiers?projet=<p>) : les devis et les factures n'y sont plus, ils ont
   leur seule place dans « Devis et factures » (jamais la même information
   à deux endroits). Recherche, catégories, tri, dépôt. Le client retire ce
   qu'il a lui-même déposé ; l'équipe archive.

   ========================================================================== */

import { echapper, enDate, CATEGORIES_FICHIER, CATEGORIES_CLIENT } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, fichierHtml, brancherPieces, modale, depot, lireForme, toast, agir, optionsDe, menu, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, nouvelId } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer, reecrire, adresseAvec } from '../routeur.js';
import { editer } from './editeurs.js';

/* Les tris : le plus récent d'abord (le défaut), le plus ancien, le nom.
   Un fichier se date à son dépôt. */
const TRIS = { recents: 'Plus récents', anciens: 'Plus anciens', nom: 'Nom' };
const quand = (x) => enDate(x.cree || x.date) || 0;
const nomDe = (x) => String(x.nom || '');
const trier = (liste, tri) => {
  if (tri === 'nom') return liste.slice().sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'fr', { sensitivity: 'base' }));
  if (tri === 'anciens') return liste.slice().sort((a, b) => quand(a) - quand(b));
  return liste.slice().sort((a, b) => quand(b) - quand(a));
};

/**
 * Ce que la page Fichiers montre : les fichiers non archivés. Les pièces
 * comptables n'y sont plus (elles vivent dans « Devis et factures ») :
 * leurs rayons Factures, Devis et Avoirs, toujours vides, sont retirés
 * (refonte du Cockpit, lot 6).
 */
export const documentsVisibles = (session) => ({ fichiers: agreger(session, G.fichiers).filter((f) => !f.archive) });

export const vue = async (ctx, env) => {
  const { session } = env;
  const equipe = env.role === 'equipe';
  const uid = session.utilisateur.uid;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const nomPage = 'Fichiers';
  titrePage(nomPage);
  filAriane([{ libelle: nomPage }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  /* Chez le client, la page est celle d'un projet : le projet vient de
     l'adresse et ne se change pas ici (l'arbre du rail le fait). */
  const projetFixe = equipe ? '' : String((ctx.requete || {}).projet || '');
  /* Dans le Cockpit, le projet, la catégorie, le tri et le terme vivent
     dans l'adresse : l'entrée Fichiers d'un projet y mène filtrée, le
     Retour et un lien copié les retrouvent. Changer un filtre change
     l'adresse, le routeur rend la main par « maj » (un dessin, en place) ;
     le terme se réécrit sans redessiner. Chez le client, rien ne change. */
  const lireFiltres = (requete = {}) => ({ projet: String(requete.projet || ''), categorie: String(requete.categorie || ''), tri: TRIS[requete.tri] ? requete.tri : 'recents', terme: String(requete.terme || '') });
  const etat = { categorie: '', projet: projetFixe, terme: '', tri: 'recents', ...(equipe ? lireFiltres(ctx.requete) : {}) };
  const adresse = (f = etat) => adresseAvec('/fichiers', { projet: f.projet, categorie: f.categorie, tri: f.tri === 'recents' ? '' : f.tri, terme: f.terme });
  /* Un filtre : dans l'adresse pour l'équipe, sur place pour le client. */
  const filtrer = (changes) => { if (equipe) { naviguer(adresse({ ...etat, ...changes })); return; } Object.assign(etat, changes); rendre(); };
  /* « ?f=<id> » (la recherche) : le fichier se montre et s'éclaire. */
  let aMontrer = String((ctx.requete || {}).f || '');
  let dernierHtml = '';

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const { fichiers: tousFichiers } = documentsVisibles(session);
    const terme = etat.terme.toLowerCase();
    const duProjet = (x) => !etat.projet || x.projet === etat.projet;
    const trouve = (x) => !terme || `${x.nom} ${x.description || ''} ${(x.tags || []).join(' ')}`.toLowerCase().includes(terme);
    /* Les comptes des puces suivent le projet choisi, pas la recherche :
       ils disent ce qu'il y a, la liste dit ce qui correspond. */
    const fichiersProjet = tousFichiers.filter(duProjet);
    const total = fichiersProjet.length;
    const categories = Object.entries(CATEGORIES_FICHIER).filter(([cle]) => fichiersProjet.some((f) => f.categorie === cle));
    if (etat.categorie && !categories.some(([cle]) => cle === etat.categorie)) etat.categorie = '';
    const liste = trier(fichiersProjet.filter((x) => trouve(x) && (!etat.categorie || x.categorie === etat.categorie)), etat.tri);
    const blocFichiers = (l) => `<div class="grille grille-2">${l.map((f) => fichierHtml({ ...f, categorieLibelle: `${CATEGORIES_FICHIER[f.categorie] || f.categorie}${projets.length > 1 && !projetFixe ? ` · ${nomProjet(f.projet)}` : ''}` }, { menu: equipe, retirer: !equipe, moi: equipe ? '' : uid })).join('')}</div>`;
    /* Rien à montrer : la phrase dit pourquoi, le bouton propose la suite
       (effacer la recherche, ou déposer le premier fichier). */
    const actionVide = total
      ? (equipe ? `<a class="btn btn-secondaire" href="#${adresse({ ...etat, categorie: '', terme: '' })}">Effacer les filtres</a>` : '')
      : `<button class="btn btn-secondaire" type="button" data-deposer>${equipe ? 'Déposer un fichier' : 'Envoyer un fichier'}</button>`;
    const corps = !liste.length
      ? vide({ icone: 'fichiers', titre: total ? 'Rien ne correspond' : 'Aucun fichier', texte: total ? 'Changez un filtre ou le terme de recherche.' : (equipe ? (etat.projet ? 'Déposez maquettes, livrables, documents.' : 'Les fichiers des projets apparaîtront ici.') : 'Les fichiers de ce projet apparaîtront ici. Vous pouvez aussi nous envoyer des captures, des logos ou des photos.'), action: actionVide })
      : blocFichiers(liste);

    const html = `<div class="page">
      <div class="page-tete"><div><h1>${echapper(nomPage)}</h1><p class="chapo">${equipe ? (etat.projet && nomProjet(etat.projet) ? `Maquettes, contrats, livrables, captures : les fichiers de ${echapper(nomProjet(etat.projet))}, rangés par catégorie.` : 'Maquettes, contrats, livrables, captures : tous les fichiers, rangés par catégorie et par projet.') : 'Maquettes, photos, contrats, livrables, captures : les fichiers de ce projet, rangés par catégorie. Les devis et les factures sont dans « Devis et factures ».'}</p></div>
        <div class="actions">${equipe ? `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Déposer</button>` : `<button class="btn btn-principal" type="button" data-deposer>${icone('plus')} Envoyer un fichier</button>`}</div></div>
      <div class="rang" style="margin-bottom:16px;gap:12px">
        <div style="flex:1;min-width:220px;position:relative"><input class="champ" type="search" id="recherche-doc" placeholder="Rechercher un fichier" value="${echapper(etat.terme)}" aria-label="Rechercher"></div>
        ${projets.length > 1 && !projetFixe ? `<select class="select" id="filtre-projet" style="width:auto;min-width:180px"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>` : ''}
        <select class="select" id="tri-doc" style="width:auto" aria-label="Trier">${optionsDe(TRIS, etat.tri)}</select>
      </div>
      ${categories.length > 1 ? `<div class="filtres" style="margin-bottom:20px"><button class="filtre${!etat.categorie ? ' actif' : ''}" type="button" data-cat="">Tous<span class="compte">${fichiersProjet.length}</span></button>${categories.map(([cle, lib]) => `<button class="filtre${etat.categorie === cle ? ' actif' : ''}" type="button" data-cat="${cle}">${echapper(lib)}<span class="compte">${fichiersProjet.filter((f) => f.categorie === cle).length}</span></button>`).join('')}</div>` : ''}
      ${corps}
    </div>`;
    /* Une donnée qui revient à l'identique ne repeint pas la page : sinon
       chaque clé qui se réveille la ferait rejouer, et l'œil la voit
       clignoter. */
    if (html === dernierHtml && sortie.querySelector('#recherche-doc')) return;
    dernierHtml = html;
    sortie.innerHTML = html;
    if (aMontrer) {
      const carte = sortie.querySelector(`.fichier[data-id="${CSS.escape(aMontrer)}"]`);
      if (carte) {
        aMontrer = '';
        carte.classList.add('fichier--montre');
        carte.scrollIntoView({ block: 'center' });
        setTimeout(() => carte.classList.remove('fichier--montre'), 2400);
      }
    }
    const champ = sortie.querySelector('#recherche-doc');
    champ.addEventListener('input', () => { etat.terme = champ.value; if (equipe) reecrire(adresse()); const pos = champ.selectionStart; rendre(); const c = sortie.querySelector('#recherche-doc'); c.focus(); c.setSelectionRange(pos, pos); });
    const sel = sortie.querySelector('#filtre-projet');
    if (sel) sel.addEventListener('change', () => { filtrer({ projet: sel.value, categorie: '' }); });
    const tri = sortie.querySelector('#tri-doc');
    if (tri) tri.addEventListener('change', () => { filtrer({ tri: TRIS[tri.value] ? tri.value : 'recents' }); });
  };

  const gestes = sur(sortie, 'click', '[data-cat], [data-deposer], [data-menu-fichier]', async (el) => {
    if (el.dataset.cat !== undefined) { filtrer({ categorie: el.dataset.cat }); return; }
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
  const gestesPieces = () => {};
  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là.
     Le client attend aussi les pièces des projets dont il est responsable,
     et seulement celles-là : les autres ne sont pas abonnées, attendre leur
     clé retarderait la page pour rien. */
  const cles = (session.equipe ? [K.projets, K.fichiersTous] : [K.projets, ...session.projets.flatMap((p) => [K.fichiers(p.id)])]);
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return {
    fin: () => { planifier.arreter(); gestes(); gestesPieces(); lot.fin(); },
    /* Même page, autres filtres (Cockpit : la route a une clé) : un
       dessin, en place. Un « ?f= » nouveau éclaire son fichier. */
    maj: (suite) => {
      if (!equipe) return;
      const f = lireFiltres(suite.requete);
      const montrer = String((suite.requete || {}).f || '');
      const memes = ['projet', 'categorie', 'tri', 'terme'].every((k) => f[k] === etat[k]);
      if (montrer) aMontrer = montrer;
      if (memes && !montrer) return;
      Object.assign(etat, f);
      if (montrer) dernierHtml = '';
      rendre();
    },
  };
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
