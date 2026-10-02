/* ==========================================================================
   CAPMEDIA CLIENT HUB · le pavé « En attente de vous »

   Sur l'accueil et sur l'aperçu d'un projet, ce qui attend la main du
   client tient dans un grand pavé. Il gênait : le client peut maintenant
   le REPLIER (il ne garde que son titre et son chiffre) ou le FERMER. Fermé,
   le pavé se range dans « Demandes » : l'entrée Demandes de l'arbre du
   projet, dans le rail (pour l'accueil, celle du premier projet visible).
   On l'y voit filer, on y retrouve tout, et un bouton l'y réaffiche.

   Le choix est celui de la personne, sur tous ses appareils : il vit dans
   son profil (profils/{uid}.pavesAttente, voir suivi/firestore.rules) :
     { accueil: 'ouvert' | 'replie' | 'ferme', projets: { <pid>: idem } }
   Les clés de ce module : 'accueil', ou 'projet:<pid>'.
   ========================================================================== */

import { echapper } from './noyau.js';
import { icone, sur, toast } from './ui.js';
import * as magasin from './magasin.js';
import { K, ecrire } from './donnees.js';
import { naviguer } from './routeur.js';

const ETATS = ['ouvert', 'replie', 'ferme'];

/* Le choix qu'on vient de faire, gardé ici le temps que le profil le
   rapporte : la page se redessine tout de suite, sans attendre le réseau. */
const locaux = new Map();

const pidDe = (cle) => (String(cle).startsWith('projet:') ? String(cle).slice(7) : '');

const etatServeur = (cle) => {
  const p = (magasin.lire(K.profil) || {}).pavesAttente || {};
  const v = cle === 'accueil' ? p.accueil : (p.projets || {})[pidDe(cle)];
  return ETATS.includes(v) ? v : 'ouvert';
};

/** L'état du pavé : 'ouvert', 'replie' ou 'ferme'. */
export const etatPave = (cle) => {
  const serveur = etatServeur(cle);
  if (locaux.has(cle)) {
    if (locaux.get(cle) === serveur) locaux.delete(cle);
    else return locaux.get(cle);
  }
  return serveur;
};

const poser = (uid, cle, etat) => {
  locaux.set(cle, etat);
  magasin.reveiller(K.profil);
  const changement = cle === 'accueil' ? { accueil: etat } : { projets: { [pidDe(cle)]: etat } };
  return ecrire.majProfil(uid, { pavesAttente: changement }).catch(() => {
    locaux.delete(cle);
    magasin.reveiller(K.profil);
    toast('Ce choix n\'a pas pu être enregistré. Réessayez.', 'erreur');
  });
};

/**
 * Le pavé, ouvert ou replié ; rien s'il est fermé. `corps` : ses lignes
 * (le pavé replié ne les montre pas). `rangement` dit où il ira.
 */
export const paveHtml = ({ cle, etat, titre = 'En attente de vous', nombre, corps, rangement, premier = true }) => {
  if (etat === 'ferme') return '';
  const replie = etat === 'replie';
  const id = `pave-${String(cle).replace(/[^\w-]/g, '-')}`;
  return `<section class="section"${premier ? ' style="margin-top:0"' : ''}>
    <div class="attente${replie ? ' attente--repliee' : ''}" data-pave="${echapper(cle)}">
      <div class="attente-tete">
        ${icone('alerte')}<span class="attente-titre">${echapper(titre)}</span><span class="badge badge--vif">${echapper(nombre)}</span>
        <span class="attente-gestes">
          <button class="btn btn-fantome btn-petit" type="button" data-pave-geste="${replie ? 'deplier' : 'replier'}" data-pave-cle="${echapper(cle)}" aria-expanded="${replie ? 'false' : 'true'}" aria-controls="${id}">${icone(replie ? 'chevron' : 'chevronHaut')}${replie ? 'Déplier' : 'Replier'}</button>
          <button class="btn btn-fantome btn-petit" type="button" data-pave-geste="fermer" data-pave-cle="${echapper(cle)}" data-astuce="${echapper(rangement)}">${icone('fermer')}Fermer</button>
        </span>
      </div>
      <div id="${id}"${replie ? ' hidden' : ''}>${replie ? '' : corps}</div>
    </div>
  </section>`;
};

/** Dans Demandes : le pavé est rangé ici, un bouton le réaffiche. */
export const reafficherHtml = ({ cle, texte, bouton }) => `<div class="pave-range" data-pave-range="${echapper(cle)}">
    <p class="t-petit t-2">${echapper(texte)}</p>
    <button class="btn btn-secondaire btn-petit" type="button" data-pave-geste="reafficher" data-pave-cle="${echapper(cle)}">${echapper(bouton)}</button>
  </div>`;

/* Ce qui est vraiment à l'écran : le rail replié, ou caché dans son tiroir
   sur un téléphone, n'est pas une cible. */
const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || r.right <= 0 || r.left >= window.innerWidth) return false;
  const lat = el.closest('#lat');
  if (lat) {
    const coq = document.querySelector('.coq');
    if (coq && coq.classList.contains('pliee')) return false;
    if (Number(getComputedStyle(lat).opacity) === 0) return false;
  }
  return true;
};

/* Où le pavé se range : l'entrée Demandes de l'arbre du projet, dans le
   rail ; à défaut la ligne du projet (son arbre est replié) ; sinon le
   bouton qui ouvre le rail (rail replié, téléphone). */
const cibleDe = (cle) => {
  const pid = pidDe(cle);
  const candidats = pid
    ? [document.querySelector(`#lat-corps a[data-chemin="/projets/${CSS.escape(pid)}/demandes"]`), document.querySelector(`#lat-corps a.lat-projet[data-chemin="/projets/${CSS.escape(pid)}"]`)]
    : [...document.querySelectorAll('#lat-corps a[data-chemin$="/demandes"]'), ...document.querySelectorAll('#lat-corps a.lat-projet')];
  candidats.push(document.querySelector('#bouton-deplier'), document.querySelector('#bouton-menu'));
  return candidats.find(visible) || null;
};

/* Le pavé file vers sa cible en rétrécissant, puis la cible s'allume un
   instant. Rien de tout cela quand le système demande moins de mouvement. */
const ranger = (el, cible) => new Promise((fini) => {
  const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (cible) {
    cible.classList.remove('pave-recu');
    void cible.offsetWidth;
    if (calme) cible.classList.add('pave-recu');
  }
  if (!el || !cible || calme || typeof el.animate !== 'function') { if (cible) setTimeout(() => cible.classList.remove('pave-recu'), 900); fini(); return; }
  const a = el.getBoundingClientRect();
  const b = cible.getBoundingClientRect();
  const fantome = el.cloneNode(true);
  fantome.classList.add('attente--fantome');
  fantome.setAttribute('aria-hidden', 'true');
  fantome.removeAttribute('data-pave');
  Object.assign(fantome.style, {
    position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: '0', zIndex: '900', pointerEvents: 'none', transformOrigin: 'top left', overflow: 'hidden',
  });
  document.body.appendChild(fantome);
  el.style.visibility = 'hidden';
  const sx = Math.max(b.width / a.width, 0.04);
  const sy = Math.max(b.height / a.height, 0.04);
  const anim = fantome.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${sx}, ${sy})`, opacity: 0.1 },
  ], { duration: 520, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  const fin = () => {
    fantome.remove();
    cible.classList.add('pave-recu');
    setTimeout(() => cible.classList.remove('pave-recu'), 900);
    fini();
  };
  anim.onfinish = fin;
  anim.oncancel = fin;
});

/**
 * Les gestes du pavé (replier, déplier, fermer) et de son rangement
 * (réafficher), dans une zone. Renvoie de quoi les débrancher.
 */
export const brancherPaves = (racine, env) => sur(racine, 'click', '[data-pave-geste]', async (el) => {
  const cle = el.dataset.paveCle;
  const geste = el.dataset.paveGeste;
  const uid = env.session.utilisateur.uid;
  if (!cle) return;
  if (geste === 'replier') { poser(uid, cle, 'replie'); return; }
  if (geste === 'deplier') { poser(uid, cle, 'ouvert'); return; }
  if (geste === 'fermer') {
    await ranger(el.closest('.attente'), cibleDe(cle));
    poser(uid, cle, 'ferme');
    const pid = pidDe(cle);
    toast(cle === 'accueil' ? 'Rangé dans Demandes. Vous pouvez le réafficher depuis là.' : 'Rangé dans l\'onglet Demandes du projet. Vous pouvez le réafficher depuis là.', 'ok',
      { libelle: 'Voir', action: () => naviguer(cle === 'accueil' ? '/demandes' : `/projets/${pid}/demandes`), duree: 6000 });
    return;
  }
  if (geste === 'reafficher') {
    poser(uid, cle, 'ouvert');
    toast(cle === 'accueil' ? 'Le bloc « En attente de vous » est de retour sur votre accueil.' : 'Le bloc « En attente de vous » est de retour dans l\'aperçu du projet.');
  }
});
