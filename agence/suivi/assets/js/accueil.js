/* ==========================================================================
   CAPMEDIA · l'accueil d'un espace, la première fois

   Le même moteur pour l'espace Test (accueil-testeur.js) et le Hub des
   clients (accueil-client.js) : la marque qui s'assemble au centre de
   l'écran, un mot de bienvenue au prénom, puis des écrans qui se lisent
   l'un après l'autre, comme l'accueil d'une application de téléphone.
   Chaque espace apporte ses écrans ; le moteur apporte la porte, la piste
   qui glisse (souris, doigt, flèches), les points, la barre, le clavier, et
   la sortie : l'accueil s'efface en s'agrandissant pendant que le rail
   glisse en place et que les cartes de la page se posent.

   Rien ne bloque : « Passer » mène droit à l'espace. Le même sur le web,
   sur Mac et sur Windows.
   ========================================================================== */

import { echapper } from './noyau.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const anime = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const accueilVu = (cle) => { try { return localStorage.getItem(cle) === 'vu'; } catch (e) { return true; } };
export const marquerAccueilVu = (cle) => { try { localStorage.setItem(cle, 'vu'); } catch (e) { /* stockage refusé */ } };

/* Chaque forme d'une icône reçoit une longueur de 1 : le trait se dessine
   alors de 0 à 1, quelle que soit sa longueur réelle (suite.css, tracer). */
export const tracable = (el) => {
  $$('svg :is(path, circle, rect, line, polyline)', el).forEach((f) => f.setAttribute('pathLength', '1'));
  return el;
};

/* La marque en quatre feuilles, pour qu'elles s'assemblent. */
export const logoHtml = (petit = false) => `<div class="accueil-logo${petit ? ' accueil-logo--petit' : ''}" aria-hidden="true">${[1, 2, 3, 4].map((n) => `<i class="feuille feuille--${n}"></i>`).join('')}<span class="halo"></span></div>`;

export const paragraphes = (texte, max = 1) => String(texte || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).slice(0, max)
  .map((x) => `<p>${echapper(x).replace(/\n/g, '<br>')}</p>`).join('');

/* Le chronomètre de démonstration : ce qu'il affiche en comptant. */
const duree = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
};

/**
 * Ouvre l'accueil par-dessus l'espace.
 *   service : « Test » ou « Hub », à côté de la marque ;
 *   prenom  : celui qu'on salue ;
 *   texte   : la phrase de la porte ;
 *   ecrans  : () => [{ cle, visuel, texte }], relue à chaque redessin ;
 *   surFin  : appelé quand la personne a parcouru ou passé l'accueil, pas
 *             quand on le referme en silence.
 * Renvoie { el, redessiner(cle), fermer({ silencieux }), entame }.
 */
export const ouvrirAccueil = ({ service, prenom = '', texte, ecrans, surFin = null }) => {
  let etape = 0;
  let entame = false;
  let ferme = false;
  let minuterieVisuels = null;
  let minuterieChrono = null;

  const el = document.createElement('div');
  el.className = 'accueil';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `Bienvenue sur Capmedia ${service}`);
  el.innerHTML = `<div class="accueil-fond" aria-hidden="true"></div>
    <section class="accueil-porte">
      ${logoHtml()}
      <p class="accueil-marque">Capmedia<span>${echapper(service)}</span></p>
      <h1>Bienvenue${prenom ? `, ${echapper(prenom)}` : ''}</h1>
      <p class="texte">${texte}</p>
      <button class="btn btn-principal" type="button" data-accueil="commencer">Commencer</button>
      <button class="btn btn-fantome btn-petit" type="button" data-accueil="passer">Aller directement à mon espace</button>
    </section>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('accueil-ouvert');
  setTimeout(() => {
    const b = $('[data-accueil="commencer"]', el);
    if (b && !ferme && !entame) b.focus({ preventScroll: true });
  }, anime() ? 1700 : 30);

  const ecranHtml = (e) => `<div class="ecran-visuel">${e.visuel}</div><div class="ecran-texte">${e.texte}</div>`;

  const construireGuide = () => {
    const liste = ecrans();
    const guide = document.createElement('section');
    guide.className = 'accueil-guide';
    guide.innerHTML = `
      <div class="accueil-piste">${liste.map((e, i) => `
        <article class="ecran ecran--${echapper(e.cle)}${i === 0 ? ' actif' : ''}" data-i="${i}" data-cle="${echapper(e.cle)}" aria-hidden="${i !== 0}">${ecranHtml(e)}</article>`).join('')}</div>
      <div class="accueil-pied">
        <button class="btn btn-fantome btn-petit" type="button" data-accueil="passer">Passer</button>
        <span class="accueil-points" aria-hidden="true">${liste.map((e, i) => `<i class="${i === 0 ? 'actif' : ''}"></i>`).join('')}</span>
        <button class="btn btn-secondaire btn-petit" type="button" data-accueil="precedent" hidden>Précédent</button>
        <button class="btn btn-principal btn-petit" type="button" data-accueil="suivant">Suivant</button>
      </div>`;
    return tracable(guide);
  };

  /* Ce qui bouge sur l'écran courant : les captures qui défilent, le
     chronomètre qui compte. Rien ne tourne sur un écran qu'on ne voit pas. */
  const animerEcran = () => {
    clearInterval(minuterieVisuels); minuterieVisuels = null;
    clearInterval(minuterieChrono); minuterieChrono = null;
    const ecran = $(`.ecran[data-i="${etape}"]`, el);
    if (!ecran) return;
    const images = $$('.telephone-ecran img', ecran);
    if (images.length > 1) {
      let i = 0;
      minuterieVisuels = setInterval(() => {
        i = (i + 1) % images.length;
        images.forEach((img, k) => img.classList.toggle('actif', k === i));
        $$('.telephone-points i', ecran).forEach((p, k) => p.classList.toggle('actif', k === i));
      }, 2800);
    }
    const chrono = $('[data-chrono-demo]', ecran);
    if (chrono) {
      const cible = 47 * 60 + 12;
      if (!anime()) { chrono.textContent = duree(cible); return; }
      const depart = performance.now();
      minuterieChrono = setInterval(() => {
        const t = Math.min(1, (performance.now() - depart) / 1800);
        const e = 1 - Math.pow(1 - t, 3);
        chrono.textContent = duree(Math.round(cible * e));
        if (t >= 1) { clearInterval(minuterieChrono); minuterieChrono = null; }
      }, 40);
    }
  };

  const aller = (i) => {
    const guide = $('.accueil-guide', el);
    if (!guide) return;
    const articles = $$('.ecran', guide);
    etape = Math.max(0, Math.min(articles.length - 1, i));
    $('.accueil-piste', guide).style.transform = `translateX(-${etape * 100}%)`;
    articles.forEach((e, k) => {
      e.classList.toggle('actif', k === etape);
      e.setAttribute('aria-hidden', String(k !== etape));
      if (k === etape) e.scrollTop = 0;
    });
    $$('.accueil-points i', guide).forEach((p, k) => p.classList.toggle('actif', k === etape));
    $('[data-accueil="precedent"]', guide).hidden = etape === 0;
    const dernier = etape === articles.length - 1;
    const suivant = $('[data-accueil="suivant"], [data-accueil="fin"]', guide);
    suivant.textContent = dernier ? 'C\'est parti' : 'Suivant';
    suivant.dataset.accueil = dernier ? 'fin' : 'suivant';
    $('[data-accueil="passer"]', guide).hidden = dernier;
    animerEcran();
  };

  const commencer = () => {
    if (entame || ferme) return;
    entame = true;
    const porte = $('.accueil-porte', el);
    porte.classList.add('part');
    const guide = construireGuide();
    setTimeout(() => {
      if (ferme) return;
      porte.remove();
      el.appendChild(guide);
      aller(0);
      const s = $('[data-accueil="suivant"]', guide);
      if (s) s.focus({ preventScroll: true });
    }, anime() ? 380 : 0);
  };

  /* Les écrans se redessinent quand ce qu'ils montrent arrive après coup
     (la campagne, les projets). Un seul, par sa clé, ou tous. */
  const redessiner = (cle = '') => {
    const guide = $('.accueil-guide', el);
    if (!guide) return;
    const liste = ecrans();
    liste.forEach((e) => {
      if (cle && e.cle !== cle) return;
      const article = $(`.ecran[data-cle="${e.cle}"]`, guide);
      if (!article) return;
      article.innerHTML = ecranHtml(e);
      tracable(article);
      if (article.classList.contains('actif')) animerEcran();
    });
  };

  /* La sortie : l'accueil s'efface en s'agrandissant, le rail glisse en
     place et les cartes de la page se posent l'une après l'autre. */
  const fermer = ({ silencieux = false } = {}) => {
    if (ferme) return;
    ferme = true;
    clearInterval(minuterieVisuels);
    clearInterval(minuterieChrono);
    document.removeEventListener('keydown', surTouche);
    document.documentElement.classList.remove('accueil-ouvert');
    el.classList.add('sort');
    const coq = $('.coq');
    if (coq && !silencieux) { coq.classList.add('arrivee-suite'); setTimeout(() => coq.classList.remove('arrivee-suite'), 1500); }
    const vue = $('#vue');
    if (vue && !silencieux) { vue.classList.add('arrivee'); setTimeout(() => vue.classList.remove('arrivee'), 1200); }
    setTimeout(() => el.remove(), anime() ? 700 : 0);
    if (!silencieux && surFin) surFin();
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accueil]');
    if (!b) return;
    const geste = b.dataset.accueil;
    if (geste === 'commencer') commencer();
    else if (geste === 'suivant') aller(etape + 1);
    else if (geste === 'precedent') aller(etape - 1);
    else if (geste === 'passer' || geste === 'fin') fermer();
  });

  /* Les flèches passent d'un écran à l'autre ; la tabulation reste dedans. */
  const surTouche = (e) => {
    if (ferme) return;
    if (entame && e.key === 'ArrowRight') { e.preventDefault(); aller(etape + 1); return; }
    if (entame && e.key === 'ArrowLeft') { e.preventDefault(); aller(etape - 1); return; }
    if (e.key !== 'Tab') return;
    const focalisables = $$('button:not([hidden]), a[href]', el).filter((x) => x.offsetParent !== null);
    if (!focalisables.length) return;
    const premier = focalisables[0];
    const dernier = focalisables[focalisables.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };
  document.addEventListener('keydown', surTouche);

  /* Le doigt, ou la souris : on tire la piste, elle suit, et elle bascule
     si le geste est franc. */
  let glisse = null;
  el.addEventListener('pointerdown', (e) => {
    const piste = e.target.closest('.accueil-piste');
    if (!piste || e.button !== 0) return;
    glisse = { x: e.clientX, dx: 0, piste };
    piste.classList.add('glisse');
    try { piste.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!glisse) return;
    glisse.dx = e.clientX - glisse.x;
    glisse.piste.style.transform = `translateX(calc(-${etape * 100}% + ${glisse.dx}px))`;
  });
  const finGlisse = () => {
    if (!glisse) return;
    const { dx, piste } = glisse;
    glisse = null;
    piste.classList.remove('glisse');
    if (dx < -60) aller(etape + 1);
    else if (dx > 60) aller(etape - 1);
    else aller(etape);
  };
  el.addEventListener('pointerup', finGlisse);
  el.addEventListener('pointercancel', finGlisse);

  return { el, redessiner, fermer, get entame() { return entame; } };
};
