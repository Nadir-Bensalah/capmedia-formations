/* ==========================================================================
   CAPMEDIA TEST · l'accueil du testeur

   Les écrans de la première fois (le moteur est dans accueil.js), courts et
   dans l'ordre du Hub (02/10) : la porte (la mascotte, son prénom, son rôle
   en une phrase), l'application qu'il va tester en grand (ce que l'équipe a
   écrit et déposé dans la campagne : nom, phrase, points forts, captures, et
   le lien d'installation de son téléphone), les trois réponses, Capmedia
   Test à installer sur son ordinateur (seulement sur le web, depuis un Mac
   ou un PC), puis « tout est prêt ». Le déroulé, le bon signalement et le
   temps vivent dans le guide du testeur.

   Tout ce qu'il dit vient de la campagne que l'équipe pilote depuis le
   Cockpit. Ce qui est fait est consigné (testeur.js) : l'équipe voit qui a
   fait ses premiers pas, et le client le lit sans les noms.
   ========================================================================== */

import { echapper, lienPiece } from './noyau.js';
import { icone } from './ui.js';
import { ouvrirAccueil as ouvrirMoteur, accueilVu as vu, marquerAccueilVu as marquer, paragraphes, mascotteHtml, ecranInstallerApp, ecranPret } from './accueil.js';
import { installable } from './installer.js';
import { propositionVisiteHtml } from './visite-testeur.js';

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CLE = (uid) => `suivi:testeur-accueil:${uid || ''}`;

export const accueilVu = (uid) => vu(CLE(uid));
export const marquerAccueilVu = (uid) => marquer(CLE(uid));

/* Le téléphone du testeur, s'il lit l'accueil dessus : le lien
   d'installation de l'application testée qui lui correspond. */
const telephone = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return '';
};
const INSTALLER = { ios: 'Installer sur iPhone', android: 'Installer sur Android' };

/* --------------------------------------------------------------------------
   Les écrans. Chacun reçoit le testeur, la campagne (peut manquer) et les
   adresses des captures déjà résolues.
   -------------------------------------------------------------------------- */

const ecranApplication = (moi, c, liens) => {
  if (!c) {
    return {
      cle: 'application',
      visuel: `<div class="accueil-appli"><span class="accueil-appli-icone accueil-appli-icone--vide">${icone('composants')}</span></div>`,
      texte: `<p class="surtitre">Ce que vous allez tester</p>
        <h2>Votre campagne arrive</h2>
        <p>Dès que l'équipe Capmedia ouvre votre campagne, l'application vous est présentée ici : à quoi elle sert, ses écrans, et le lien pour l'installer.</p>`,
    };
  }
  const nom = c.application || c.titre || 'L\'application';
  const visuels = (c.visuels || []).filter((v) => v && /^image\//.test(v.type || '') && v.chemin);
  const initiale = echapper(nom.trim().slice(0, 1).toUpperCase() || 'A');
  /* Le logo de l'application, s'il est posé sur la campagne : à la place
     de l'initiale, dès que son adresse est arrivée. */
  const logo = c.logo && c.logo.chemin ? liens[c.logo.chemin] : '';
  const marque = logo
    ? `<span class="accueil-appli-icone accueil-appli-icone--logo"><img src="${echapper(logo)}" alt="" data-logo-accueil draggable="false"></span>`
    : `<span class="accueil-appli-icone accueil-appli-icone--initiales">${initiale}</span>`;
  const visuel = visuels.length
    ? `<div class="telephone" aria-hidden="true">
        <div class="telephone-ecran"><span class="telephone-initiale">${initiale}</span>${visuels.map((v, i) => `<img${liens[v.chemin] ? ` src="${echapper(liens[v.chemin])}"` : ''} data-chemin="${echapper(v.chemin)}" alt="" class="${i === 0 ? 'actif' : ''}" draggable="false">`).join('')}</div>
        ${visuels.length > 1 ? `<span class="telephone-points">${visuels.map((v, i) => `<i class="${i === 0 ? 'actif' : ''}"></i>`).join('')}</span>` : ''}
      </div>`
    : `<div class="accueil-appli">${marque}<p class="accueil-appli-nom">${echapper(nom)}</p></div>`;
  const tel = telephone();
  const lien = tel && /^https:\/\/[^\s"'<>]+$/.test(String((c.installation || {})[tel] || '')) ? c.installation[tel] : '';
  const atouts = (c.atouts || []).map((a) => String(a || '').trim()).filter(Boolean).slice(0, 4);
  return {
    cle: 'application',
    visuel,
    texte: `<p class="surtitre">Ce que vous allez tester</p>
      <h2 class="accueil-appli-titre">${visuels.length ? `${marque} ` : ''}<span>${echapper(nom)}</span></h2>
      ${c.accroche ? `<p class="accroche">${echapper(c.accroche)}</p>` : ''}
      ${paragraphes(c.presentation, 1)}
      ${atouts.length ? `<ul class="atouts">${atouts.map((a) => `<li>${icone('check')}<span>${echapper(a)}</span></li>`).join('')}</ul>` : ''}
      ${lien ? `<p class="accueil-telecharger"><a class="btn btn-principal" href="${echapper(lien)}" target="_blank" rel="noopener" data-installer-teste="${tel}">${icone(tel === 'ios' ? 'apple' : 'android')} ${INSTALLER[tel]}</a></p>` : ''}`,
  };
};

const ecranVerdicts = () => ({
  cle: 'verdicts',
  visuel: `<div class="verdicts-accueil">
      <div><b class="verdict verdict--ok">Réussi</b><span>Ce qui devait se passer s'est passé, exactement.</span></div>
      <div><b class="verdict verdict--ko">Échec</b><span>Autre chose s'est passé, ou rien du tout.</span></div>
      <div><b class="verdict verdict--na">Sans objet</b><span>Le scénario ne s'applique pas à votre appareil.</span></div>
    </div>`,
  texte: `<p class="surtitre">Vos réponses</p>
    <h2>Trois réponses possibles</h2>
    <p>Chaque scénario dit ce qui doit se passer. Si ce n'est pas exactement ça, c'est un échec. Un scénario où rien ne se passe est un échec, jamais une réussite.</p>`,
});

/* Capmedia Test sur son ordinateur, et le dernier écran : les mêmes que
   ceux du Hub (accueil.js). */
const ecranOrdinateur = () => ecranInstallerApp('test', { texte: 'Les notifications de votre ordinateur, dès qu\'une campagne vous attend.' });

/* Le dernier écran propose la visite guidée de l'espace, sur la vraie
   page : elle part dès que la fiche du testeur est remplie. */
const ecranFin = (moi, c) => {
  const e = ecranPret({
    prenom: moi.prenom || '',
    texte: `${c ? 'Votre campagne vous attend.' : 'Votre campagne arrive bientôt.'} Le guide du testeur et ces écrans se revoient depuis le menu de votre compte.`,
  });
  return { ...e, texte: `${e.texte}
    <p class="aide">Deux minutes pour voir où tout se trouve, sur votre vraie page : la visite guidée.</p>
    ${propositionVisiteHtml()}` };
};

/* --------------------------------------------------------------------------
   L'ouverture
   -------------------------------------------------------------------------- */

/**
 * Renvoie { el, majCampagne, fermer, entame }. `surFin` est appelé quand le
 * testeur l'a parcouru ou passé ; pas quand on le referme en silence.
 */
export const ouvrirAccueil = ({ moi, campagne = null, surFin = null }) => {
  let c = campagne;
  const liens = {};

  const moteur = ouvrirMoteur({
    service: 'Test',
    prenom: moi.prenom || '',
    classe: 'accueil-porte--test',
    texte: 'Merci d\'avoir rejoint Capmedia Test. Votre regard compte : testez, notez, dites-nous tout.',
    visuel: mascotteHtml(),
    ecrans: () => [ecranApplication(moi, c, liens), ecranVerdicts(), ...(installable() ? [ecranOrdinateur()] : []), ecranFin(moi, c)],
    surFin,
  });

  /* Les captures : leur adresse se résout après coup, et l'écran la reçoit
     dès qu'elle arrive. */
  /* Une adresse qui n'arrive pas du premier coup (le Storage met parfois
     quelques secondes à répondre à froid) se redemande, deux fois, avant
     de laisser l'initiale tenir l'écran. */
  const chargerLiens = async (essai = 0) => {
    const logo = c && c.logo && c.logo.chemin ? [{ chemin: c.logo.chemin, logo: true }] : [];
    const visuels = [...logo, ...((c && c.visuels) || [])].filter((v) => v && v.chemin && !liens[v.chemin]);
    if (!visuels.length) return;
    await Promise.all(visuels.map(async (v) => {
      try { liens[v.chemin] = await lienPiece({ chemin: v.chemin }); } catch (e) { /* pas lisible : l'initiale tient l'écran */ }
    }));
    $$('img[data-chemin]', moteur.el).forEach((img) => {
      const url = liens[img.dataset.chemin];
      if (url && img.getAttribute('src') !== url) img.src = url;
    });
    /* Le logo arrivé après le premier dessin : l'écran se redessine. */
    if (logo.length && liens[logo[0].chemin] && !$$('[data-logo-accueil]', moteur.el).length) moteur.redessiner('application');
    if (visuels.some((v) => !liens[v.chemin]) && essai < 2 && moteur.el.isConnected) setTimeout(() => chargerLiens(essai + 1), 2500 * (essai + 1));
  };
  chargerLiens();

  /* La campagne arrive, ou change, pendant que l'accueil est ouvert :
     l'écran de l'application se redessine avec ce que l'équipe a écrit. */
  const majCampagne = (nouvelle) => {
    c = nouvelle || null;
    moteur.redessiner('application');
    moteur.redessiner('fin');
    chargerLiens();
  };

  /* « Me faire visiter l'espace » ferme l'accueil comme « C'est parti »,
     et laisse la demande à testeur.js (lue dans surFin). */
  let visiteDemandee = false;
  moteur.el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-visite-demandee]')) return;
    visiteDemandee = true;
    moteur.fermer();
  });

  return { el: moteur.el, majCampagne, fermer: moteur.fermer, get entame() { return moteur.entame; }, get visiteDemandee() { return visiteDemandee; } };
};
