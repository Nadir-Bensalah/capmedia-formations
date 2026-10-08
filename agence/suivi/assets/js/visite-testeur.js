/* ==========================================================================
   CAPMEDIA TEST · la visite guidée de l'espace

   Sur la vraie page, pas sur des images : Ma campagne, la case qui attend
   le testeur, la feuille d'un scénario (ouverte pour de vrai, fermée en
   partant), Mes signalements, Mon avis, la bulle. Proposée au dernier écran
   des premiers pas, rejouable depuis le guide et le menu du compte.

   Ce qu'elle tient :
     - le clavier : Entrée ou flèche droite pour suivre, flèche gauche pour
       revenir, Échap pour arrêter ; la tabulation reste dans la carte ;
     - le lecteur d'écran : une vraie fenêtre (role dialog, modale), le
       titre et le texte de chaque étape annoncés, « étape 2 sur 6 » dit en
       toutes lettres ;
     - la réduction des animations : ni glissement ni défilement animé ;
     - le dessin de la suite : un voile qui laisse voir l'élément, une
       carte ; ni pictogramme, ni liseré, ni barre de progression.

   Un élément absent (pas encore de campagne, rail replié sur un téléphone)
   ne casse rien : l'étape se pose au centre, ou montre le bouton du menu.
   ========================================================================== */

import { echapper } from './noyau.js';

const $ = (s, r = document) => r.querySelector(s);
const animee = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver;

/* Visible : dans la page, avec une taille, et pas sous un tiroir fermé. */
const visible = (el) => {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  /* Le rail d'un téléphone : hors de l'écran tant qu'il est replié. */
  return r.right > 0 && r.left < window.innerWidth;
};

const lienRail = (chemin) => $(`#lat-corps .lat-lien[data-chemin="${chemin}"]`);
/* Sur un téléphone, le rail est un tiroir : l'étape montre le bouton du
   menu et dit où trouver l'entrée. */
const railOuMenu = (chemin) => {
  const a = lienRail(chemin);
  if (visible(a)) return { el: a };
  const b = $('#bouton-menu');
  return visible(b) ? { el: b, viaMenu: true } : { el: null };
};

/**
 * Les étapes. `ouvrirExemple()` ouvre la feuille du scénario qui attend le
 * testeur, s'il y en a un, et rend de quoi la fermer.
 */
const etapes = ({ naviguer, ouvrirExemple }) => {
  let fermerFeuille = null;
  const fermerExemple = () => { if (fermerFeuille) { try { fermerFeuille(); } catch (e) { /* déjà fermée */ } fermerFeuille = null; } };
  return [
    {
      cle: 'campagne',
      titre: 'Ma campagne',
      texte: 'Votre point de départ : où vous en êtes, d\'un coup d\'œil. La jauge avance à chaque scénario rendu.',
      avant: () => { fermerExemple(); naviguer('/'); },
      cible: () => $('.testeur-tete') || railOuMenu('/').el,
    },
    {
      cle: 'suivant',
      titre: 'Le scénario qui vous attend',
      texte: '« Commencer », puis « Continuer », ouvre le scénario suivant. Dans le tableau, c\'est la case entourée. Les scénarios se suivent : le suivant s\'ouvre quand le précédent a son résultat.',
      avant: () => { fermerExemple(); naviguer('/'); },
      cible: () => $('.t-suite') || $('.tb--testeur [data-suivant]') || $('.tb--testeur'),
      absent: 'Vos scénarios ne sont pas encore arrivés : ils apparaîtront ici, avec le premier à faire en tête.',
    },
    {
      cle: 'feuille',
      titre: 'La feuille d\'un scénario',
      texte: 'Ce qu\'il faut faire, puis ce qui doit se passer. Vous répondez en bas : Réussi, Échec ou Sans objet. Un échec demande une phrase et une capture. Rien n\'est enregistré pendant la visite.',
      avant: async () => { fermerExemple(); fermerFeuille = await ouvrirExemple(); },
      apres: fermerExemple,
      cible: () => $('.modale--scenario .modale-pied') || $('.modale--scenario'),
      absent: 'Quand vos scénarios seront là, chacun s\'ouvrira dans une feuille : ce qu\'il faut faire, ce qui doit se passer, et vos trois réponses en bas.',
    },
    {
      cle: 'signalements',
      titre: 'Mes signalements',
      texte: 'Chaque échec que vous signalez arrive ici, avec la suite que l\'équipe lui donne. Une case orange : l\'équipe a corrigé, rejouez-la.',
      avant: () => { fermerExemple(); },
      cible: () => railOuMenu('/signalements'),
      viaMenu: 'Sur votre téléphone, l\'entrée « Mes signalements » est dans ce menu.',
    },
    {
      cle: 'avis',
      titre: 'Mon avis',
      texte: 'Une première impression avant de commencer, votre avis sur l\'application à la fin. Il part sans votre nom, et il est demandé avant « J\'ai terminé ».',
      cible: () => railOuMenu('/avis'),
      viaMenu: 'Sur votre téléphone, l\'entrée « Mon avis » est dans ce menu.',
    },
    {
      cle: 'bulle',
      titre: 'La bulle',
      texte: 'Une question, un doute, un lien qui ne marche pas : écrivez à l\'équipe Capmedia ici, elle vous répond dans la même conversation.',
      cible: () => $('.bulle--testeur .bulle-pastille') || $('#bulle-ouvrir'),
      absent: 'La bulle pour écrire à l\'équipe apparaît en bas à droite, une fois votre fiche remplie.',
    },
  ];
};

let enCours = null;

/**
 * Lance la visite. Résout quand elle se termine (true : jusqu'au bout,
 * false : arrêtée). Une seule à la fois.
 */
export const lancerVisite = ({ naviguer, ouvrirExemple = async () => null } = {}) => {
  if (enCours) return enCours.fin;
  const liste = etapes({ naviguer, ouvrirExemple });
  const retourFocus = document.activeElement;
  let i = 0;
  let resoudre;
  const fin = new Promise((r) => { resoudre = r; });

  const el = document.createElement('div');
  el.className = `visite${animee() ? ' visite--animee' : ''}`;
  el.innerHTML = `<div class="visite-voile" aria-hidden="true"></div>
    <div class="visite-trou" aria-hidden="true"></div>
    <section class="visite-carte" role="dialog" aria-modal="true" aria-labelledby="visite-titre" aria-describedby="visite-texte">
      <p class="visite-sur" id="visite-sur"></p>
      <h2 id="visite-titre" tabindex="-1"></h2>
      <p id="visite-texte"></p>
      <div class="visite-gestes">
        <button class="btn btn-fantome btn-petit" type="button" data-visite="arreter">Arrêter la visite</button>
        <span class="visite-pas">
          <button class="btn btn-secondaire btn-petit" type="button" data-visite="precedent">Précédent</button>
          <button class="btn btn-principal btn-petit" type="button" data-visite="suivant">Suivant</button>
        </span>
      </div>
    </section>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('visite-ouverte');
  const carte = $('.visite-carte', el);
  const trou = $('.visite-trou', el);

  /* Le trou suit l'élément ; la carte se pose dessous, ou dessus s'il n'y
     a pas la place. Sur un écran étroit, elle reste en bas. */
  let cible = null;
  const placer = () => {
    const etroit = window.innerWidth < 640;
    /* Sur un écran étroit, la carte reste en bas, qu'il y ait une cible ou
       non : le pouce la trouve toujours au même endroit. */
    carte.classList.toggle('visite-carte--bas', etroit);
    if (!cible || !visible(cible)) {
      trou.hidden = true;
      carte.classList.toggle('visite-carte--centre', !etroit);
      carte.style.top = ''; carte.style.left = '';
      return;
    }
    const r = cible.getBoundingClientRect();
    const marge = 6;
    trou.hidden = false;
    Object.assign(trou.style, { top: `${r.top - marge}px`, left: `${r.left - marge}px`, width: `${r.width + 2 * marge}px`, height: `${r.height + 2 * marge}px` });
    carte.classList.remove('visite-carte--centre');
    if (etroit) { carte.style.top = ''; carte.style.left = ''; return; }
    const h = carte.offsetHeight; const w = carte.offsetWidth;
    const dessous = r.bottom + 14 + h < window.innerHeight;
    const top = dessous ? r.bottom + 14 : Math.max(12, r.top - 14 - h);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
    carte.style.top = `${top}px`; carte.style.left = `${left}px`;
  };

  const montrer = async (n) => {
    const avant = liste[i];
    if (avant && avant.apres && n !== i) { try { avant.apres(); } catch (e) { /* rien */ } }
    i = Math.max(0, Math.min(liste.length - 1, n));
    const e = liste[i];
    el.dataset.etape = e.cle;
    if (e.avant) { try { await e.avant(); } catch (err) { /* l'étape se pose quand même */ } }
    /* La page vient peut-être de se redessiner : on attend une image. */
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const trouve = e.cible ? e.cible() : null;
    const t = trouve && trouve.el !== undefined ? trouve : { el: trouve };
    cible = t.el || null;
    if (cible && visible(cible)) cible.scrollIntoView({ block: 'nearest', behavior: animee() ? 'smooth' : 'auto' });
    const texte = !cible ? (e.absent || e.texte) : (t.viaMenu && e.viaMenu ? `${e.texte} ${e.viaMenu}` : e.texte);
    $('#visite-sur', el).textContent = `Étape ${i + 1} sur ${liste.length}`;
    $('#visite-titre', el).textContent = e.titre;
    $('#visite-texte', el).textContent = texte;
    const prec = $('[data-visite="precedent"]', el);
    prec.hidden = i === 0;
    $('[data-visite="suivant"]', el).textContent = i === liste.length - 1 ? 'Terminer' : 'Suivant';
    placer();
    $('#visite-titre', el).focus({ preventScroll: true });
  };

  const quitter = (jusquauBout) => {
    const e = liste[i];
    if (e && e.apres) { try { e.apres(); } catch (err) { /* rien */ } }
    document.removeEventListener('keydown', surTouche, true);
    window.removeEventListener('resize', placer);
    window.removeEventListener('scroll', placer, true);
    document.documentElement.classList.remove('visite-ouverte');
    el.remove();
    enCours = null;
    if (retourFocus && retourFocus.isConnected && typeof retourFocus.focus === 'function') retourFocus.focus({ preventScroll: true });
    resoudre(jusquauBout);
  };

  const suivant = () => (i === liste.length - 1 ? quitter(true) : montrer(i + 1));

  /* En capture : la visite passe devant la feuille ouverte, qui ne doit
     pas se fermer sur Échap ni recevoir les flèches. */
  const surTouche = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); quitter(false); return; }
    if (ev.target && ev.target.closest && ev.target.closest('button') && ev.key === 'Enter') return;
    if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); suivant(); return; }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); if (i > 0) montrer(i - 1); return; }
    if (ev.key !== 'Tab') return;
    const boutons = [...carte.querySelectorAll('button')].filter((b) => !b.hidden);
    const premier = boutons[0]; const dernier = boutons[boutons.length - 1];
    if (!carte.contains(document.activeElement)) { ev.preventDefault(); premier.focus(); return; }
    if (ev.shiftKey && (document.activeElement === premier || document.activeElement === $('#visite-titre', el))) { ev.preventDefault(); dernier.focus(); }
    else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus(); }
  };
  document.addEventListener('keydown', surTouche, true);
  window.addEventListener('resize', placer);
  window.addEventListener('scroll', placer, true);

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-visite]');
    if (!b) return;
    ev.stopPropagation();
    const g = b.dataset.visite;
    if (g === 'arreter') quitter(false);
    else if (g === 'precedent') montrer(i - 1);
    else if (g === 'suivant') suivant();
  });

  enCours = { fin, quitter };
  montrer(0);
  return fin;
};

/* Pour l'épreuve et la page : la visite est-elle ouverte ? */
export const visiteOuverte = () => Boolean(enCours);

/* Le texte de la proposition, au dernier écran des premiers pas. */
export const propositionVisiteHtml = () => `<p class="accueil-visite"><button class="btn btn-secondaire" type="button" data-visite-demandee>${echapper('Me faire visiter l\'espace')}</button></p>`;
