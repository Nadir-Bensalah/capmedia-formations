/* ==========================================================================
   CAPMEDIA TEST · l'application testée : son logo et sa présentation

   Le logo : déposé par l'équipe sur la campagne (champ « logo », un fichier
   de projets/{p}/campagnes/{c}/logo/, storage.rules), montré dans les
   premiers pas, l'en-tête de « Ma campagne », la page « L'application » et
   la présentation. Sans logo, ou tant que son adresse n'est pas arrivée,
   l'initiale du nom tient la place : jamais une case vide.

   La présentation : le discours de l'équipe, puis les fonctionnalités une
   par une (un titre, une phrase, une capture prise parmi les écrans de la
   campagne). Tout se remplit depuis la fiche de la campagne, dans le
   Cockpit.
   ========================================================================== */

import { echapper, lienPiece } from './noyau.js';

/* Les adresses déjà résolues, d'une page à l'autre. */
const adresses = new Map();
const enCours = new Map();

export const nomAppli = (c) => String((c && (c.application || c.titre)) || 'L\'application');
export const initialeAppli = (c) => (nomAppli(c).trim().slice(0, 1).toUpperCase() || 'A');

const cheminLogo = (c) => (c && c.logo && typeof c.logo.chemin === 'string' && /^projets\/[^/]+\/campagnes\/[^/]+\/logo\/[^/]+$/.test(c.logo.chemin) ? c.logo.chemin : '');

/* L'adresse d'un fichier de la campagne, une seule demande à la fois. */
export const adresseDe = (chemin) => {
  if (!chemin) return Promise.resolve('');
  if (adresses.has(chemin)) return Promise.resolve(adresses.get(chemin));
  if (!enCours.has(chemin)) {
    enCours.set(chemin, lienPiece({ chemin })
      .then((u) => { adresses.set(chemin, u); return u; })
      .catch(() => '')
      .finally(() => enCours.delete(chemin)));
  }
  return enCours.get(chemin);
};

/**
 * Le logo de l'application testée, ou son initiale. `classe` : la taille
 * (« appli-logo--petit », « --grand »). Le logo est décoratif : le nom de
 * l'application est toujours écrit à côté.
 */
export const logoAppliHtml = (c, { classe = '' } = {}) => {
  const chemin = cheminLogo(c);
  const url = chemin ? adresses.get(chemin) : '';
  return `<span class="appli-logo${classe ? ` ${classe}` : ''}${url ? ' appli-logo--image' : ''}" aria-hidden="true"${chemin ? ` data-logo-chemin="${echapper(chemin)}"` : ''}>${url
    ? `<img src="${echapper(url)}" alt="" draggable="false">`
    : `<span class="appli-logo-initiale">${echapper(initialeAppli(c))}</span>`}</span>`;
};

/* Les logos posés dans la page reçoivent leur image dès qu'elle arrive. */
export const resoudreLogos = (racine = document) => {
  racine.querySelectorAll('.appli-logo[data-logo-chemin]:not(.appli-logo--image)').forEach(async (el) => {
    const url = await adresseDe(el.dataset.logoChemin);
    if (!url || !el.isConnected) return;
    el.classList.add('appli-logo--image');
    el.innerHTML = `<img src="${echapper(url)}" alt="" draggable="false">`;
  });
};

/* L'adresse du logo, pour l'accueil (qui garde ses propres images). */
export const adresseLogo = (c) => adresseDe(cheminLogo(c));

/* --------------------------------------------------------------------------
   La présentation
   -------------------------------------------------------------------------- */

const paragraphes = (t) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
  .map((x) => `<p>${echapper(x).replace(/\n/g, '<br>')}</p>`).join('');

/* Les fonctionnalités qui ont au moins un titre, dans l'ordre de l'équipe. */
export const fonctionnalitesDe = (c) => (Array.isArray(c && c.fonctionnalites) ? c.fonctionnalites : [])
  .filter((f) => f && String(f.titre || '').trim()).slice(0, 12);

/* La capture d'une fonctionnalité : un écran de la campagne (son chemin),
   une image seulement. */
const captureDe = (c, f) => {
  const chemin = String((f && f.capture) || '');
  if (!chemin) return null;
  return (c.visuels || []).find((v) => v && v.chemin === chemin && /^image\//.test(v.type || '')) || null;
};

export const pagePresentationHtml = (c) => {
  if (!c) return '';
  const fonctions = fonctionnalitesDe(c);
  const discours = String(c.discours || c.presentation || '').trim();
  const numero = (i) => String(i + 1).padStart(2, '0');
  return `<div class="page page--presentation">
    <div class="page-tete"><div class="pres-tete">
      ${logoAppliHtml(c, { classe: 'appli-logo--grand' })}
      <div><p class="surtitre">Présentation</p><h1>${echapper(nomAppli(c))}</h1>
        ${c.accroche ? `<p class="chapo">${echapper(c.accroche)}</p>` : ''}</div>
    </div></div>
    <section class="pres-discours" aria-label="Le discours">
      ${discours ? `<div class="prose">${paragraphes(discours)}</div>`
        : '<p class="t-2">L\'équipe Capmedia n\'a pas encore écrit la présentation. Découvrez l\'application comme un nouvel utilisateur : c\'est justement ce regard-là qui compte.</p>'}
    </section>
    ${fonctions.length ? `<section class="pres-fonctions" aria-label="Les fonctionnalités">
      <div class="section-tete"><h2>Les fonctionnalités, une par une</h2></div>
      <ol class="pres-liste">${fonctions.map((f, i) => {
        const cap = captureDe(c, f);
        const url = cap ? adresses.get(cap.chemin) : '';
        return `<li class="pres-fonction${cap ? '' : ' pres-fonction--sans-capture'}" data-fonction="${i}">
          <div class="pres-fonction-texte">
            <span class="pres-numero" aria-hidden="true">${numero(i)}</span>
            <h3>${echapper(String(f.titre).trim())}</h3>
            ${String(f.phrase || '').trim() ? `<p>${echapper(String(f.phrase).trim())}</p>` : ''}
          </div>
          ${cap ? `<figure class="pres-capture"><img${url ? ` src="${echapper(url)}"` : ''} data-capture="${echapper(cap.chemin)}" alt="Écran : ${echapper(String(f.titre).trim())}" loading="lazy" draggable="false"></figure>` : ''}
        </li>`;
      }).join('')}</ol>
    </section>` : '<p class="aide pres-attente">Les fonctionnalités arrivent : l\'équipe les présente ici une par une, avec un écran pour chacune.</p>'}
  </div>`;
};

/* Les captures de la page reçoivent leur adresse dès qu'elle arrive. */
export const resoudreCaptures = (racine = document) => {
  racine.querySelectorAll('img[data-capture]:not([src])').forEach(async (img) => {
    const url = await adresseDe(img.dataset.capture);
    if (url && img.isConnected) img.src = url;
  });
  resoudreLogos(racine);
};
