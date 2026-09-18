/* ==========================================================================
   CAPMEDIA CLIENT HUB · la coquille
   La barre latérale, la barre haute, le tiroir des notifications, la
   palette de commande. Identique pour le client et pour l'équipe, seule la
   navigation change.
   ========================================================================== */

import {
  $, $$, echapper, initiales, depuis, quitter, nomAffiche,
  bdd, collection, query, orderBy, limit, doc, updateDoc, writeBatch,
} from './noyau.js';
import { icone } from './icones.js';
import { modale, toast, sur } from './ui.js';
import * as magasin from './magasin.js';
import { naviguer, surChangement, courant, actif } from './routeur.js';

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
    : ((session.organisations[0] && (session.organisations[0].entreprise || session.organisations[0].nom)) || 'Client');

  sortie.innerHTML = `
    <a class="saut" href="#vue">Aller au contenu</a>
    <div class="coq">
      <aside class="lat" id="lat" aria-label="Navigation principale">
        <div class="lat-tete">
          <a class="lat-marque" href="#/">
            <img src="../assets/img/capmedia-digital.png" alt="" width="24" height="24">
            Capmedia <span class="service">${role === 'equipe' ? 'Cockpit' : 'Hub'}</span>
          </a>
          <button class="btn-plier" type="button" id="bouton-plier" aria-label="Replier la navigation" data-astuce="Replier">${icone('plier')}</button>
        </div>
        <div class="lat-corps" id="lat-corps"></div>
        <div class="lat-pied">
          <button class="lat-compte" type="button" id="bouton-compte" aria-haspopup="menu">
            <span class="avatar${role === 'equipe' ? ' avatar--equipe' : ''}">${echapper(initiales(nom))}</span>
            <span style="min-width:0">
              <span class="nom tronque" style="display:block">${echapper(nom)}</span>
              <span class="role tronque" style="display:block">${echapper(sousNom)}</span>
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
          <nav class="ariane" id="ariane" aria-label="Fil d'Ariane"></nav>
          <div class="fin">
            <button class="btn-recherche" type="button" id="bouton-recherche">${icone('recherche')}<span>Rechercher</span><kbd>⌘K</kbd></button>
            <button class="btn-icone" type="button" id="bouton-recherche-mobile" aria-label="Rechercher" style="display:inline-grid">${icone('recherche')}</button>
            <button class="btn-icone" type="button" id="bouton-notifs" aria-label="Notifications" data-astuce="Notifications">${icone('notifications')}<span class="point masque" id="point-notifs"></span></button>
          </div>
        </header>
        <main id="vue" tabindex="-1"></main>
      </div>
    </div>`;

  rendreNavigation();
  brancherTiroir();
  brancherHaut();
  brancherCompte();
  brancherNotifications();
  brancherPalette();
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

const compteHtml = (valeur) => {
  if (!valeur) return '';
  const n = typeof valeur === 'object' ? valeur.n : valeur;
  const vif = typeof valeur === 'object' ? valeur.vif : false;
  if (!n) return '';
  return `<span class="compte${vif ? ' vif' : ''}">${echapper(n)}</span>`;
};

export const rendreNavigation = () => {
  const corps = $('#lat-corps');
  if (!corps) return;
  corps.innerHTML = contexte.groupes.map((g) => `
    <div class="lat-groupe">
      ${g.titre ? `<p class="lat-titre">${echapper(g.titre)}</p>` : ''}
      ${g.items.map((it) => `
        <a class="lat-lien${it.sous ? ' lat-sous-lien' : ''}" href="#${echapper(it.chemin)}" data-chemin="${echapper(it.chemin)}"${it.exact ? ' data-exact' : ''}>
          ${it.icone ? icone(it.icone) : ''}<span class="tronque">${echapper(it.libelle)}</span>${compteHtml(typeof it.compte === 'function' ? it.compte() : it.compte)}
        </a>`).join('')}
    </div>`).join('');
  marquerActif();
};

export const definirNavigation = (groupes) => { contexte.groupes = groupes; rendreNavigation(); };

const marquerActif = () => {
  const c = courant().chemin;
  let meilleur = null;
  $$('#lat-corps .lat-lien').forEach((a) => {
    a.classList.remove('actif');
    a.removeAttribute('aria-current');
    const chemin = a.dataset.chemin;
    const correspond = a.hasAttribute('data-exact') ? c === chemin : (c === chemin || c.startsWith(`${chemin}/`));
    if (correspond && (!meilleur || chemin.length > meilleur.dataset.chemin.length)) meilleur = a;
  });
  if (meilleur) { meilleur.classList.add('actif'); meilleur.setAttribute('aria-current', 'page'); }
};

/** Le fil d'Ariane : [{libelle, chemin?}]. Le dernier est la page courante. */
export const filAriane = (items) => {
  const fil = $('#ariane');
  if (!fil) return;
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
    menu($('#bouton-compte'), [
      { libelle: 'Mon profil et mes préférences', icone: 'utilisateur', action: () => naviguer('/parametres') },
      { libelle: 'Apparence', icone: 'soleil', action: m },
      '-',
      { libelle: 'Retour au site capmedia.app', icone: 'externe', action: () => { location.href = '../'; } },
      { libelle: 'Se déconnecter', icone: 'dehors', action: quitter, danger: true },
    ]);
    void items;
  });
};

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

const brancherNotifications = () => {
  const uid = contexte.session.utilisateur.uid;
  magasin.abonner(CLE_NOTIFS, () => query(collection(bdd, 'boites', uid, 'notifications'), orderBy('date', 'desc'), limit(60)));
  magasin.sur(CLE_NOTIFS, (liste) => {
    notifications = Array.isArray(liste) ? liste : [];
    const nonLues = notifications.filter((n) => !n.lu).length;
    const point = $('#point-notifs');
    if (point) point.classList.toggle('masque', nonLues === 0);
    document.title = document.title.replace(/^\(\d+\) /, '');
    if (nonLues) document.title = `(${nonLues}) ${document.title}`;
  });
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
        <a class="notif${n.lu ? '' : ' non-lu'}" href="${echapper(n.lien || '#/')}" data-notif="${echapper(n.id)}">
          <i aria-hidden="true"></i>
          <span>
            <span class="titre">${echapper(n.titre || '')}</span>
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
