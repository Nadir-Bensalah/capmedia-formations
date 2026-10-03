/* ==========================================================================
   CAPMEDIA CLIENT HUB · la coquille
   La barre latérale, la barre haute, le tiroir des notifications, la
   palette de commande. Identique pour le client et pour l'équipe, seule la
   navigation change.
   ========================================================================== */

import {
  $, $$, echapper, initiales, depuis, quitter, nomAffiche, enDate,
  bdd, collection, query, orderBy, limit, doc, updateDoc, writeBatch,
} from './noyau.js';
import { icone } from './icones.js';
import { modale, toast, sur } from './ui.js';
import * as magasin from './magasin.js';
import { naviguer, surChangement, courant, actif } from './routeur.js';
import { entreeMenuInstaller } from './installer.js';

let contexte = { session: null, role: 'client', groupes: [] };
const fournisseurs = [];

/* ==========================================================================
   1. Le montage
   ========================================================================== */

export const monterCoquille = ({ session, role, groupes, sortie }) => {
  contexte = { session, role, groupes };
  const nom = nomAffiche(session);
  const sousNom = role === 'equipe'
    ? (session.equipe.role === 'admin' ? 'Administrateur' : 'Équipe Capmedia')
    : role === 'testeur' ? 'Testeur'
      : (((session.organisations || [])[0] && (session.organisations[0].entreprise || session.organisations[0].nom)) || 'Client');

  /* Le dessin de la suite Capmedia (suite.css), le même que Capmedia Desk :
     la marque en toutes lettres avec son trait, la recherche dans le rail,
     le choix de l'apparence en bas. Chaque page qui charge suite.css le
     déclare par <html data-suite>. */
  const suite = document.documentElement.hasAttribute('data-suite');
  const service = role === 'equipe' ? 'Cockpit' : (role === 'testeur' ? 'Test' : 'Hub');
  const enseigne = role === 'equipe' ? 'Capmedia Digital' : (role === 'testeur' ? 'Espace testeur' : sousNom);
  const theme = (window.AZTheme && window.AZTheme.lire()) || 'auto';
  const marque = suite
    ? `<a class="lat-marque lat-marque--suite" href="#/" aria-label="Capmedia ${service}, accueil">
            <span class="lat-mot"><img class="lat-logo" src="../assets/img/capmedia-digital.png" alt="" width="22" height="22">Capmedia<span class="service">${service}</span></span>
            <svg class="lat-trait" viewBox="0 0 86 8" fill="none" aria-hidden="true"><path d="M1.5 5.2C14 3.1 30 2.4 44 3.3c12 .8 26 1.5 40.5-.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            <span class="lat-enseigne tronque">${echapper(enseigne)}</span>
          </a>`
    : `<a class="lat-marque" href="#/">
            <img src="../assets/img/capmedia-digital.png" alt="" width="24" height="24">
            Capmedia <span class="service">${service}</span>
          </a>`;
  const recherche = `<button class="${suite ? 'cherche' : 'btn-recherche'}" type="button" id="bouton-recherche">${icone('recherche')}<span>Rechercher</span><kbd>⌘K</kbd></button>`;
  const apparence = suite
    ? `<div class="theme-rail" role="group" aria-label="Apparence">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button type="button" data-theme-val="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>`
    : '';

  sortie.innerHTML = `
    <a class="saut" href="#vue">Aller au contenu</a>
    <div class="coq">
      <aside class="lat" id="lat" aria-label="Navigation principale">
        <div class="lat-tete">
          ${marque}
          <button class="btn-plier" type="button" id="bouton-plier" aria-label="Replier la navigation" data-astuce="Replier">${icone('plier')}</button>
        </div>
        ${suite ? recherche : ''}
        <div class="lat-corps" id="lat-corps"></div>
        <div class="lat-pied">
          <p class="lat-etat" id="lat-etat" hidden></p>
          ${apparence}
          <button class="lat-compte" type="button" id="bouton-compte" aria-haspopup="menu">
            <span class="avatar${role === 'equipe' ? ' avatar--equipe' : ''}">${echapper(initiales(nom))}</span>
            <span style="min-width:0">
              <span class="nom tronque" style="display:block">${echapper(nom)}</span>
              <span class="role tronque" style="display:block">${echapper(suite ? (session.utilisateur.email || sousNom) : sousNom)}</span>
              <span class="role tronque" style="display:block" id="lat-role-projet" hidden></span>
            </span>
            <span class="pousse" style="color:var(--encre-3)">${icone('chevron')}</span>
          </button>
        </div>
      </aside>
      <div class="voile-lat" id="voile-lat"></div>
      <div style="min-width:0">
        <header class="haut" id="haut">
          <button class="btn-icone btn-menu" type="button" id="bouton-menu" aria-label="Ouvrir la navigation" aria-controls="lat" aria-expanded="false">${icone('menu')}</button>
          <button class="btn-icone btn-deplier" type="button" id="bouton-deplier" aria-label="Déplier la navigation" data-astuce="Déplier">${icone('hub')}</button>
          ${role === 'client' ? `<button class="btn btn-fantome btn-petit btn-retour" type="button" id="bouton-retour" hidden>${icone('retour')}<span>Retour</span></button>` : ''}
          <nav class="ariane" id="ariane" aria-label="Fil d'Ariane"></nav>
          <div class="fin">
            ${suite ? '' : recherche}
            <button class="btn-icone" type="button" id="bouton-recherche-mobile" aria-label="Rechercher" style="display:inline-grid">${icone('recherche')}</button>
            ${role === 'client' ? '<span class="pastille-beta" data-beta data-astuce="Votre espace est en version bêta : il s\'améliore chaque semaine. Une remarque ? Écrivez-nous.">Bêta</span>' : ''}
            <button class="btn-icone" type="button" id="bouton-notifs" aria-label="Notifications" data-astuce="Notifications">${icone('notifications')}<span class="point masque" id="point-notifs"></span></button>
          </div>
        </header>
        <main id="vue" tabindex="-1"></main>
      </div>
    </div>`;

  rendreNavigation();
  brancherTiroir();
  brancherHaut();
  if (role === 'client') brancherRetour();
  brancherCompte();
  brancherNotifications();
  brancherPalette();
  /* Entré par un code sans aucune clé : proposer la clé d'accès, une fois. */
  import('./cles-acces.js').then((c) => c.proposerCle(session.utilisateur && session.utilisateur.uid)).catch(() => {});
  surChangement(() => { marquerActif(); fermerTiroir(); });

  // Sur grand écran, le bouton loupe de la barre est redondant.
  const mq = window.matchMedia('(min-width: 1024px)');
  const ajuster = () => { $('#bouton-recherche-mobile').style.display = mq.matches ? 'none' : 'inline-grid'; };
  mq.addEventListener('change', ajuster); ajuster();

  return { vue: $('#vue') };
};

/* ==========================================================================
   2. La navigation
   ========================================================================== */

/*
 * Deux chiffres par entrée, jamais confondus : le total, en gris, dit
 * combien il y en a ; la pastille rouge dit combien attendent une action.
 * L'ancienne forme { n, vif } reste comprise.
 */
const compteHtml = (valeur) => {
  if (!valeur) return '';
  const v = typeof valeur === 'object' ? valeur : { total: valeur };
  const total = Number(v.total !== undefined ? v.total : (v.vif ? 0 : v.n)) || 0;
  const neuf = Number(v.neuf !== undefined ? v.neuf : (v.vif ? v.n : 0)) || 0;
  if (!total && !neuf) return '';
  /* Quand les deux chiffres sont les mêmes, le gris ne dit rien de plus
     que le rouge : il ne fait que voler la place du libellé. */
  const gris = total && total !== neuf;
  return `<span class="comptes">${gris ? `<span class="compte">${echapper(total)}</span>` : ''}${neuf ? `<span class="compte vif" aria-label="${echapper(neuf)} à traiter">${echapper(neuf > 99 ? '99+' : neuf)}</span>` : ''}</span>`;
};

/* Un repère à la place des chiffres, quand il n'y a rien à compter mais
   quelque chose à dire (« aucun forfait en cours ») : une icône fine, sans
   fond, dans la couleur discrète des totaux. Le texte est son nom pour un
   lecteur d'écran, et son infobulle au survol. */
const repereHtml = (repere) => {
  if (!repere || !repere.texte) return '';
  return `<span class="comptes"><span class="lat-repere" role="img" aria-label="${echapper(repere.texte)}" data-astuce="${echapper(repere.texte)}">${icone(repere.icone || 'aucun')}</span></span>`;
};

/* L'arbre d'un projet, dans le rail du client : le projet (son écusson,
   son nom, son chevron) et, dessous, reliées par des traits fins et
   arrondis comme les réponses d'une conversation, SES entrées. Déplié par
   défaut quand il n'y a qu'un projet en cours, replié sinon ; chaque projet
   se déplie et se replie au clic, et le choix se retient par personne sur
   cet appareil. Replié, le projet porte la somme de ce qui attend. */
const CLE_ARBRE = () => `suivi:arbre:${(contexte.session && contexte.session.utilisateur && contexte.session.utilisateur.uid) || ''}`;
const lireArbre = () => { try { return JSON.parse(localStorage.getItem(CLE_ARBRE()) || '{}') || {}; } catch (e) { return {}; } };
const ecrireArbre = (etat) => { try { localStorage.setItem(CLE_ARBRE(), JSON.stringify(etat)); } catch (e) { /* stockage refusé */ } };
const arbreDeplie = (it) => { const e = lireArbre(); return typeof e[it.arbre] === 'boolean' ? e[it.arbre] : Boolean(it.deplieParDefaut); };
/** Déplie (ou replie) un projet de l'arbre et retient le choix. */
export const deplierArbre = (id, oui = true) => {
  const e = lireArbre();
  if (e[id] === oui) return;
  e[id] = oui; ecrireArbre(e);
  const bloc = document.querySelector(`#lat-corps .lat-arbre[data-arbre="${CSS.escape(id)}"]`);
  if (bloc) basculerBloc(bloc, oui);
};
const basculerBloc = (bloc, oui) => {
  bloc.classList.toggle('deplie', oui);
  const bouton = bloc.querySelector('.lat-arbre-bascule');
  if (bouton) { bouton.setAttribute('aria-expanded', String(oui)); bouton.setAttribute('aria-label', `${oui ? 'Replier' : 'Déplier'} ${bouton.dataset.nom || ''}`.trim()); }
  const branches = bloc.querySelector('.lat-arbre-branches');
  if (branches) branches.inert = !oui;
  /* Le chiffre du projet : la somme quand il est replié, rien quand ses
     entrées le portent. Le bloc n'est pas redessiné : ses branches glissent. */
  const it = contexte.groupes.flatMap((g) => g.items || []).find((x) => x.arbre === bloc.dataset.arbre);
  const ligneProjet = bloc.querySelector('.lat-projet');
  if (it && ligneProjet) {
    const ancien = ligneProjet.querySelector(':scope > .comptes');
    if (ancien) ancien.remove();
    const neuf = compteHtml(oui ? null : it.compteReplie);
    if (neuf) ligneProjet.insertAdjacentHTML('beforeend', neuf);
  }
  railRendu = htmlNavigation();
};

/* Un marqueur écrit, sans fond ni bordure, à la place des chiffres : le
   coffre-fort dit « Chiffré », en vert, avec son cadenas. Le même principe
   que le repère de Maintenance, mais avec le mot. */
const marqueHtml = (marque) => {
  if (!marque || !marque.texte) return '';
  return `<span class="comptes"><span class="lat-marqueur${marque.ton ? ` lat-marqueur--${echapper(marque.ton)}` : ''}"${marque.titre ? ` data-astuce="${echapper(marque.titre)}"` : ''}>${marque.icone ? icone(marque.icone) : ''}${echapper(marque.texte)}</span></span>`;
};

const lienHtml = (it, classe = '') => `
        <a class="lat-lien${classe}${it.sous ? ' lat-sous-lien' : ''}${it.enCours ? ' lat-lien--en-cours' : ''}" href="#${echapper(it.lien || it.chemin)}" data-chemin="${echapper(it.chemin)}"${it.projet ? ` data-projet="${echapper(it.projet)}"` : ''}${it.exact ? ' data-exact' : ''}>
          ${it.ecusson || (it.icone ? icone(it.icone) : '')}<span class="tronque">${echapper(it.libelle)}</span>${it.enCours ? `<span class="sr-only">, ${echapper(it.enCours)}</span>` : ''}${compteHtml(typeof it.compte === 'function' ? it.compte() : it.compte)}${repereHtml(it.repere)}${marqueHtml(it.marque)}
        </a>`;

const arbreHtml = (it) => {
  const ouvert = arbreDeplie(it);
  const id = `arbre-${String(it.arbre).replace(/[^\w-]/g, '-')}`;
  return `
    <div class="lat-arbre${ouvert ? ' deplie' : ''}" data-arbre="${echapper(it.arbre)}">
      <div class="lat-arbre-tete">
        ${lienHtml({ ...it, compte: ouvert ? null : it.compteReplie }, ' lat-projet')}
        <button class="lat-arbre-bascule" type="button" data-bascule-arbre="${echapper(it.arbre)}" data-nom="${echapper(it.libelle)}" aria-expanded="${ouvert}" aria-controls="${id}" aria-label="${ouvert ? 'Replier' : 'Déplier'} ${echapper(it.libelle)}">${icone('chevron')}</button>
      </div>
      <div class="lat-arbre-branches" id="${id}"${ouvert ? '' : ' inert'}>
        <ul role="list">${it.enfants.map((e) => `<li class="lat-branche">${lienHtml(e)}</li>`).join('')}</ul>
      </div>
    </div>`;
};

/* Le squelette du rail, le temps que les projets et leur arbre arrivent :
   des lignes de la hauteur des vraies (un projet, puis ses entrées sous
   lui quand il sera déplié), qui chatoient comme les squelettes des pages.
   Le vrai rail le remplace d'un seul dessin (app.js, magasin.dessinateur). */
const LARGEURS_OS = [58, 46, 64, 52, 40, 70, 50, 62, 44, 56, 48, 60];
const squeletteHtml = ({ projets = 1, branches = 0 } = {}) => `
    <div class="lat-squelette" aria-busy="true" aria-label="Chargement des projets">
      ${Array.from({ length: projets }, (_, i) => `
      <div class="lat-os"><span class="os lat-os-pastille"></span><span class="os lat-os-texte" style="width:${LARGEURS_OS[(i * 3) % LARGEURS_OS.length]}%"></span></div>
      ${i === 0 && branches ? `<ul role="list" class="lat-os-branches">${Array.from({ length: branches }, (__, j) => `<li class="lat-branche"><div class="lat-os"><span class="os lat-os-pastille"></span><span class="os lat-os-texte" style="width:${LARGEURS_OS[j % LARGEURS_OS.length]}%"></span></div></li>`).join('')}</ul>` : ''}`).join('')}
    </div>`;

const htmlNavigation = () => contexte.groupes.map((g) => `
    <div class="lat-groupe${g.pied ? ' lat-groupe--pied' : ''}">
      ${g.titre ? `<p class="lat-titre">${echapper(g.titre)}</p>` : ''}
      ${g.squelette ? squeletteHtml(g.squelette) : g.items.map((it) => (it.enfants ? arbreHtml(it) : lienHtml(it))).join('')}
    </div>`).join('');

/* Le rail ne se réécrit que s'il change vraiment. Chaque page le
   redemandait, et réécrire les mêmes lignes les faisait toutes rejouer
   leur entrée : le rail entier tressautait à chaque clic. */
let railRendu = '';
let arbreBranche = false;
export const rendreNavigation = () => {
  const corps = $('#lat-corps');
  if (!corps) return;
  const html = htmlNavigation();
  if (html !== railRendu) { corps.innerHTML = html; railRendu = html; }
  if (!arbreBranche) {
    arbreBranche = true;
    corps.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-bascule-arbre]');
      if (!b) return;
      ev.preventDefault();
      const bloc = b.closest('.lat-arbre');
      const oui = !bloc.classList.contains('deplie');
      const e = lireArbre(); e[b.dataset.basculeArbre] = oui; ecrireArbre(e);
      basculerBloc(bloc, oui);
    });
  }
  marquerActif();
};

export const definirNavigation = (groupes) => { contexte.groupes = groupes; rendreNavigation(); };

/* L'état de son accès, en bas du rail : « Accès actif », « Terminé · accès
   jusqu'au 4 octobre ». Un texte et un ton, jamais une pastille : la
   couleur dit le ton, les mots disent le fait. Sans état, la ligne
   disparaît. */
export const definirEtat = (etat) => {
  const el = document.getElementById('lat-etat');
  if (!el) return;
  if (!etat || !etat.texte) { el.hidden = true; el.textContent = ''; el.className = 'lat-etat'; return; }
  el.hidden = false;
  el.textContent = etat.texte;
  el.className = `lat-etat${etat.ton ? ` lat-etat--${etat.ton}` : ''}`;
  if (etat.titre) el.title = etat.titre; else el.removeAttribute('title');
};

/* Le rôle du client sur le projet ouvert (« Vous êtes responsable »),
   sous le nom de l'entreprise, seulement dans une fiche projet : ailleurs,
   la ligne disparaît. C'est l'espace client (app.js) qui la pose à chaque
   changement d'adresse. */
export const definirRoleProjet = (texte) => {
  const el = document.getElementById('lat-role-projet');
  if (!el) return;
  el.hidden = !texte;
  el.textContent = texte || '';
};

/* Le projet de l'adresse courante : /projets/{p}/..., /messages/{p}, ou
   « ?projet= » d'une page filtrée sur un projet (calendrier, tests...). */
export const projetDeLAdresse = (route = courant()) => {
  const c = route.chemin || '';
  const m = /^\/(?:projets|messages)\/([^/]+)/.exec(c);
  if (m) return m[1];
  return (route.requete && route.requete.projet) || '';
};

const marquerActif = () => {
  const route = courant();
  const c = route.chemin;
  const projet = projetDeLAdresse(route);
  let meilleur = null;
  $$('#lat-corps .lat-lien').forEach((a) => {
    a.classList.remove('actif', 'lat-projet--courant');
    a.removeAttribute('aria-current');
    /* La ligne d'un projet qui a ses entrées dessous ne s'allume pas : c'est
       l'entrée qui le fait. Elle dit seulement « vous êtes dans ce projet ». */
    if (a.classList.contains('lat-projet')) {
      if (projet && a.dataset.chemin === `/projets/${projet}`) a.classList.add('lat-projet--courant');
      return;
    }
    const chemin = a.dataset.chemin;
    if (a.dataset.projet && a.dataset.projet !== projet) return;
    const correspond = a.hasAttribute('data-exact') ? c === chemin : (c === chemin || c.startsWith(`${chemin}/`));
    if (correspond && (!meilleur || chemin.length > meilleur.dataset.chemin.length)) meilleur = a;
  });
  if (meilleur) {
    meilleur.classList.add('actif');
    meilleur.setAttribute('aria-current', 'page');
    /* La barre défile seule quand elle est plus haute que l'écran : l'entrée
       active reste en vue, même la dernière. */
    if (meilleur.scrollIntoView) meilleur.scrollIntoView({ block: 'nearest' });
  }
};

/** Le fil d'Ariane : [{libelle, chemin?}]. Le dernier est la page courante. */
let retoucheAriane = null;
/** L'espace peut compléter chaque fil (le Hub y met l'accueil et le projet). */
export const definirRetoucheAriane = (fn) => { retoucheAriane = fn; };
let filCourant = [];
export const filAriane = (brut) => {
  const fil = $('#ariane');
  if (!fil) return;
  const items = retoucheAriane ? (retoucheAriane(brut) || brut) : brut;
  filCourant = items;
  majRetour();
  fil.innerHTML = items.map((it, i) => {
    const dernier = i === items.length - 1;
    const texte = `<span class="${dernier ? 'courant' : ''} tronque">${echapper(it.libelle)}</span>`;
    return (dernier || !it.chemin)
      ? texte
      : `<a href="#${echapper(it.chemin)}">${echapper(it.libelle)}</a><span class="sep">${icone('chevronDroite')}</span>`;
  }).join('');
};

/* ==========================================================================
   3. Le tiroir mobile, la barre haute, le compte
   ========================================================================== */

const ouvrirTiroir = () => {
  $('#lat').classList.add('ouverte');
  $('#voile-lat').classList.add('visible');
  $('#bouton-menu').setAttribute('aria-expanded', 'true');
};
const fermerTiroir = () => {
  const lat = $('#lat');
  if (!lat) return;
  lat.classList.remove('ouverte');
  $('#voile-lat').classList.remove('visible');
  $('#bouton-menu').setAttribute('aria-expanded', 'false');
};

const CLE_PLIEE = 'suivi:lat-pliee';

const brancherTiroir = () => {
  $('#bouton-menu').addEventListener('click', () => ($('#lat').classList.contains('ouverte') ? fermerTiroir() : ouvrirTiroir()));
  $('#voile-lat').addEventListener('click', fermerTiroir);

  /* Sur grand écran, la barre se replie pour laisser toute la place au
     contenu. Le choix se retient d'une visite à l'autre. */
  const coq = $('.coq');
  const plier = (oui) => {
    coq.classList.toggle('pliee', oui);
    try { localStorage.setItem(CLE_PLIEE, oui ? '1' : '0'); } catch (e) { /* stockage refusé */ }
  };
  try { if (localStorage.getItem(CLE_PLIEE) === '1') coq.classList.add('pliee'); } catch (e) { /* rien */ }
  $('#bouton-plier').addEventListener('click', () => plier(true));
  $('#bouton-deplier').addEventListener('click', () => plier(false));
};

/* Le retour, sur toutes les pages du client sauf l'accueil. Il revient à
   la page d'avant quand on l'a vue dans cette visite ; sinon (une adresse
   ouverte depuis un e-mail, un favori), il remonte d'un cran dans le fil
   d'Ariane, et au pire à l'accueil. Jamais hors de l'espace. */
const pile = [];
const adresseDe = (route) => {
  const q = Object.entries(route.requete || {}).map(([k, v]) => `${k}=${v}`).join('&');
  return `${route.chemin}${q ? `?${q}` : ''}`;
};
const parentDuFil = () => {
  const avant = filCourant.slice(0, -1).filter((it) => it.chemin);
  return avant.length ? avant[avant.length - 1].chemin : '/';
};
const majRetour = () => {
  const b = document.getElementById('bouton-retour');
  if (!b) return;
  const ici = courant().chemin || '/';
  b.hidden = ici === '/';
  const versLAccueil = pile.length < 2 && parentDuFil() === '/';
  b.setAttribute('aria-label', versLAccueil ? 'Retour à l\'accueil' : 'Retour à la page précédente');
};
const brancherRetour = () => {
  surChangement((route) => {
    const ici = adresseDe(route);
    if (pile[pile.length - 1] === ici) { majRetour(); return; }
    if (pile.length > 1 && pile[pile.length - 2] === ici) pile.pop();
    else if (route.remplace && pile.length) pile[pile.length - 1] = ici;
    else { pile.push(ici); if (pile.length > 60) pile.shift(); }
    majRetour();
  });
  $('#bouton-retour').addEventListener('click', () => {
    if (pile.length > 1) { history.back(); return; }
    const parent = parentDuFil();
    naviguer(parent && parent !== courant().chemin ? parent : '/');
  });
};

const brancherHaut = () => {
  const haut = $('#haut');
  const surDefilement = () => haut.classList.toggle('decollee', window.scrollY > 4);
  window.addEventListener('scroll', surDefilement, { passive: true });
  surDefilement();
};

const brancherCompte = () => {
  $('#bouton-compte').addEventListener('click', async () => {
    const { menu } = await import('./ui.js');
    const items = [
      { libelle: 'Mon profil et mes préférences', icone: 'utilisateur', action: () => naviguer('/parametres') },
      { libelle: 'Thème', titre: true },
    ];
    const m = modaleTheme;
    /* Un testeur n'a ni profil ni préférences à régler ici : son guide,
       l'apparence, et la sortie. */
    /* Les clés d'accès (Touch ID, Windows Hello) : pour tout le monde, le
       testeur compris, qui n'a pas de page de paramètres. */
    const clesAcces = async () => { const { ouvrirClesAcces } = await import('./cles-acces.js'); await ouvrirClesAcces(); };
    /* Installer l'application de CET espace (une seule, pour ce système) :
       sur le web seulement, jamais dans l'application elle-même. */
    const appDe = { testeur: 'test', client: 'hub', equipe: 'cockpit' }[contexte.role] || 'hub';
    const installer = entreeMenuInstaller(appDe);
    if (contexte.role === 'testeur') {
      menu($('#bouton-compte'), [
        { libelle: 'Guide du testeur', icone: 'ampoule', action: () => naviguer('/guide') },
        { libelle: 'Revoir les premiers pas', icone: 'sparkle', action: revoirAccueil },
        ...installer,
        { libelle: 'Clés d\'accès', icone: 'cle', action: clesAcces },
        { libelle: 'Apparence', icone: 'soleil', action: modaleTheme },
        '-',
        { libelle: 'Se déconnecter', icone: 'dehors', action: quitter, danger: true },
      ]);
      return;
    }
    menu($('#bouton-compte'), [
      { libelle: 'Mon profil et mes préférences', icone: 'utilisateur', action: () => naviguer('/parametres') },
      ...(contexte.role === 'client' ? [{ libelle: 'Revoir les premiers pas', icone: 'sparkle', action: revoirAccueil }] : []),
      ...installer,
      { libelle: 'Clés d\'accès', icone: 'cle', action: clesAcces },
      { libelle: 'Apparence', icone: 'soleil', action: m },
      '-',
      { libelle: 'Retour au site capmedia.app', icone: 'externe', action: () => { location.href = '../'; } },
      { libelle: 'Se déconnecter', icone: 'dehors', action: quitter, danger: true },
    ]);
    void items;
  });
};

/* L'accueil de la première fois (accueil.js) se rejoue à la demande :
   l'espace qui l'a monté écoute cet événement. */
const revoirAccueil = () => document.dispatchEvent(new CustomEvent('suivi:accueil-revoir'));

const modaleTheme = () => {
  const m = modale({
    titre: 'Apparence',
    corps: `<div class="selecteur-theme" role="group" aria-label="Thème" style="display:flex">
      <button type="button" data-theme-val="light">Clair</button>
      <button type="button" data-theme-val="dark">Sombre</button>
      <button type="button" data-theme-val="auto">Automatique</button>
    </div>
    <p class="t-petit t-2" style="margin-top:12px">Automatique suit le réglage de votre appareil.</p>`,
  });
  const courantTheme = document.documentElement.getAttribute('data-theme') || 'auto';
  $$('[data-theme-val]', m.el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeVal === courantTheme)));
};

/* ==========================================================================
   4. Les notifications
   ========================================================================== */

const CLE_NOTIFS = 'notifications';
let notifications = [];

/* Une icône par type de notification, en trait fin dans la couleur du
   texte : elle dit de quoi il s'agit sans pastille de couleur. */
const ICONE_NOTIF = {
  demande: 'demandes', validation: 'valider', message: 'messages', facture: 'euro', paiement: 'paiement',
  reunion: 'reunions', release: 'releases', tache: 'taches', blocage: 'alerte', test: 'bug',
  maintenance: 'sante', projet: 'projets', jalon: 'drapeau', fichier: 'fichiers', note: 'note', devis: 'receipt',
};
const nomProjetNotif = (n) => {
  if (!n || !n.projet) return '';
  const projets = magasin.lire('projets') || (contexte.session && contexte.session.projets) || [];
  return ((projets.find((p) => p.id === n.projet) || {}).nom || '');
};

/* Une notification dont l'objet est sous les yeux n'a plus rien à
   annoncer : à chaque changement d'adresse, celles dont le lien est la page
   ouverte (ou la page ouverte avec ses paramètres) passent lues. */
const lireSurPlace = () => {
  const uid = contexte.session && contexte.session.utilisateur ? contexte.session.utilisateur.uid : '';
  if (!uid) return;
  const chemin = courant().chemin || '';
  if (!chemin || chemin === '/') return;
  const vise = (lien) => {
    const brut = String(lien || '').replace(/^#/, '');
    if (!brut.startsWith('/')) return false;
    const sansRequete = brut.split('?')[0].replace(/\/+$/, '');
    return sansRequete === chemin.replace(/\/+$/, '');
  };
  const aLire = notifications.filter((n) => !n.lu && vise(n.lien));
  if (!aLire.length) return;
  const lotEcriture = writeBatch(bdd);
  aLire.forEach((n) => lotEcriture.update(doc(bdd, 'boites', uid, 'notifications', n.id), { lu: true }));
  lotEcriture.commit().catch(() => { /* la prochaine ouverture réessaiera */ });
};

/* Le titre de l'onglet n'est réécrit qu'ici. Deux comptes s'y posent : les
   notifications non lues, et les messages non lus que la bulle annonce par
   l'événement « titre:non-lus » (detail.compte). Un message fait aussi une
   notification : les deux se recouvrent, on montre le plus grand, jamais
   la somme. */
let nonLuesNotifs = 0;
let nonLusMessages = 0;
const majTitre = () => {
  const n = Math.max(nonLuesNotifs, nonLusMessages);
  document.title = document.title.replace(/^\(\d+\) /, '');
  if (n) document.title = `(${n}) ${document.title}`;
};
document.addEventListener('titre:non-lus', (e) => {
  nonLusMessages = Number(e.detail && e.detail.compte) || 0;
  majTitre();
});

const brancherNotifications = () => {
  const uid = contexte.session.utilisateur.uid;
  magasin.abonner(CLE_NOTIFS, () => query(collection(bdd, 'boites', uid, 'notifications'), orderBy('date', 'desc'), limit(60)));
  /* Dans les applications Mac et Windows (window.capmediaBureau) : chaque
     notification qui arrive pendant que l'espace est ouvert devient une
     notification du système, et le nombre de non lues se pose sur l'icône.
     Celles qui étaient déjà là à l'ouverture ne sonnent pas : on ne réveille
     personne avec l'historique. Dans un navigateur, rien ne change. */
  const bureau = window.capmediaBureau;
  const ouverture = Date.now();
  const sonnees = new Set();
  const quand = (n) => { const d = enDate(n.date); return d ? d.getTime() : 0; };
  magasin.sur(CLE_NOTIFS, (liste) => {
    notifications = Array.isArray(liste) ? liste : [];
    const nonLues = notifications.filter((n) => !n.lu).length;
    if (bureau) {
      notifications.filter((n) => !n.lu && !sonnees.has(n.id) && quand(n) > ouverture - 5000).slice(0, 3)
        .forEach((n) => { sonnees.add(n.id); bureau.notifier({ titre: n.titre || '', texte: n.texte || '', lien: n.lien || '' }); });
      bureau.compte(nonLues);
    }
    const point = $('#point-notifs');
    if (point) point.classList.toggle('masque', nonLues === 0);
    nonLuesNotifs = nonLues;
    majTitre();
    lireSurPlace();
  });
  surChangement(lireSurPlace);
  $('#bouton-notifs').addEventListener('click', ouvrirNotifications);
};

const ouvrirNotifications = () => {
  const uid = contexte.session.utilisateur.uid;
  const m = modale({ titre: 'Notifications', feuille: true, corps: '' });

  const rendre = () => {
    const nonLues = notifications.filter((n) => !n.lu).length;
    m.corps.innerHTML = `
      <div class="rang-espace" style="margin-bottom:12px">
        <span class="t-petit t-2">${nonLues ? `${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Tout est lu'}</span>
        ${nonLues ? '<button class="btn btn-fantome btn-petit" type="button" data-tout-lu>Tout marquer comme lu</button>' : ''}
      </div>
      ${notifications.length ? notifications.map((n) => `
        <a class="notif${n.lu ? '' : ' non-lu'}" href="${echapper(n.lien || '#/')}" data-notif="${echapper(n.id)}" data-type="${echapper(n.type || '')}">
          <i aria-hidden="true"></i>
          <span>
            <span class="titre rang" style="gap:6px;align-items:center"><span style="display:inline-flex;width:14px;height:14px;color:var(--encre-3);flex:none">${icone(ICONE_NOTIF[n.type] || 'notifications')}</span><span class="tronque">${echapper(n.titre || '')}</span>${nomProjetNotif(n) ? `<span class="t-3 notif-projet" style="font-weight:400">· ${echapper(nomProjetNotif(n))}</span>` : ''}</span>
            ${n.texte ? `<span class="texte" style="display:block">${echapper(n.texte)}</span>` : ''}
            <span class="date" style="display:block">${echapper(depuis(n.date))}</span>
          </span>
        </a>`).join('')
      : `<div class="vide vide--compact"><span class="vide-icone">${icone('notifications')}</span><p class="vide-titre">Rien pour le moment</p><p class="vide-texte">Vous serez prévenu ici à chaque mouvement qui vous concerne.</p></div>`}`;
  };
  rendre();
  const retirer = magasin.sur(CLE_NOTIFS, () => { if (m.el.isConnected) rendre(); });
  m.fin.then(retirer);

  sur(m.el, 'click', '[data-notif]', async (el) => {
    const id = el.dataset.notif;
    const n = notifications.find((x) => x.id === id);
    if (n && !n.lu) {
      try { await updateDoc(doc(bdd, 'boites', uid, 'notifications', id), { lu: true }); } catch (e) { /* rien */ }
    }
    m.fermer();
  });
  sur(m.el, 'click', '[data-tout-lu]', async () => {
    const lotEcriture = writeBatch(bdd);
    notifications.filter((n) => !n.lu).forEach((n) => lotEcriture.update(doc(bdd, 'boites', uid, 'notifications', n.id), { lu: true }));
    try { await lotEcriture.commit(); } catch (e) { toast('Impossible de marquer comme lu.', 'erreur'); }
  });
};

/* ==========================================================================
   5. La palette de commande (⌘K)
   ========================================================================== */

/** Un fournisseur reçoit le terme et renvoie [{groupe, libelle, sous, icone, chemin, action}]. */
export const enregistrerRecherche = (fn) => { fournisseurs.push(fn); return () => { const i = fournisseurs.indexOf(fn); if (i >= 0) fournisseurs.splice(i, 1); }; };

const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const ouvrirPalette = () => {
  const m = modale({ titre: 'Rechercher', corps: '', fermable: true });
  m.el.classList.add('voile--palette');
  const boite = $('.modale', m.el);
  boite.className = 'palette';
  boite.innerHTML = `
    <div class="palette-champ">${icone('recherche')}<input type="search" placeholder="Projet, demande, tâche, fichier, facture..." aria-label="Rechercher" autocomplete="off"></div>
    <div class="palette-liste" role="listbox"></div>`;
  const champ = $('input', boite);
  const liste = $('.palette-liste', boite);
  let cible = 0;
  let resultats = [];

  const rendre = () => {
    const terme = normal(champ.value.trim());
    resultats = [];
    for (const f of fournisseurs) {
      try { resultats.push(...(f(terme) || [])); } catch (e) { console.error(e); }
    }
    if (terme) {
      resultats = resultats
        .map((r) => ({ r, score: normal(r.libelle).indexOf(terme) === 0 ? 3 : normal(r.libelle).includes(terme) ? 2 : normal(r.sous).includes(terme) ? 1 : 0 }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.r);
    }
    resultats = resultats.slice(0, 40);
    cible = 0;
    if (!resultats.length) {
      liste.innerHTML = `<div class="palette-vide">${terme ? 'Rien ne correspond.' : 'Tapez pour chercher, ou choisissez une action.'}</div>`;
      return;
    }
    let groupeCourant = null;
    liste.innerHTML = resultats.map((r, i) => {
      const tete = r.groupe !== groupeCourant ? `<div class="palette-groupe">${echapper(r.groupe)}</div>` : '';
      groupeCourant = r.groupe;
      return `${tete}<button type="button" class="palette-item${i === 0 ? ' cible' : ''}" role="option" data-i="${i}">${icone(r.icone || 'chevronDroite')}<span class="tronque">${echapper(r.libelle)}</span>${r.sous ? `<span class="sous">${echapper(r.sous)}</span>` : ''}</button>`;
    }).join('');
  };

  const choisir = (i) => {
    const r = resultats[i];
    if (!r) return;
    m.fermer();
    if (r.action) r.action();
    else if (r.chemin) naviguer(r.chemin);
  };

  champ.addEventListener('input', rendre);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cible = Math.min(resultats.length - 1, cible + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cible = Math.max(0, cible - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choisir(cible); return; }
    else return;
    $$('.palette-item', liste).forEach((b, i) => b.classList.toggle('cible', i === cible));
    const el = $(`.palette-item[data-i="${cible}"]`, liste);
    if (el) el.scrollIntoView({ block: 'nearest' });
  });
  sur(liste, 'click', '.palette-item', (el) => choisir(Number(el.dataset.i)));
  rendre();
  setTimeout(() => champ.focus(), 20);
};

const brancherPalette = () => {
  $('#bouton-recherche').addEventListener('click', ouvrirPalette);
  $('#bouton-recherche-mobile').addEventListener('click', ouvrirPalette);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ouvrirPalette(); }
  });
};

/* ==========================================================================
   6. Utilitaires de page
   ========================================================================== */

/** L'en-tête standard d'une page. */
export const enTete = ({ surtitre = '', titre, chapo = '', actions = '' }) => `
  <div class="page-tete">
    <div style="min-width:0">
      ${surtitre ? `<p class="surtitre">${echapper(surtitre)}</p>` : ''}
      <h1>${echapper(titre)}</h1>
      ${chapo ? `<p class="chapo">${echapper(chapo)}</p>` : ''}
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;

export const contexteCoquille = () => contexte;
export { actif };
