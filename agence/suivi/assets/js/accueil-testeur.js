/* ==========================================================================
   CAPMEDIA TEST · l'accueil du testeur

   Les sept écrans de la première fois (le moteur est dans accueil.js) : son
   rôle, l'application qu'il va tester (ce que l'équipe a écrit et déposé
   dans la campagne : nom, phrase, points forts, captures), le déroulé, les
   trois réponses, un bon signalement, le temps et l'avis, puis la campagne.

   Tout ce qu'il dit vient de la campagne que l'équipe pilote depuis le
   Cockpit. Ce qui est fait est consigné (testeur.js) : l'équipe voit qui a
   fait ses premiers pas, et le client le lit sans les noms.
   ========================================================================== */

import { echapper, lienPiece } from './noyau.js';
import { icone } from './ui.js';
import { ouvrirAccueil as ouvrirMoteur, accueilVu as vu, marquerAccueilVu as marquer, logoHtml, paragraphes } from './accueil.js';

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CLE = (uid) => `suivi:testeur-accueil:${uid || ''}`;

export const accueilVu = (uid) => vu(CLE(uid));
export const marquerAccueilVu = (uid) => marquer(CLE(uid));

const visuelIcone = (nom) => `<div class="visuel-icone">${icone(nom)}</div>`;

/* --------------------------------------------------------------------------
   Les sept écrans. Chacun reçoit le testeur, la campagne (peut manquer) et
   les adresses des captures déjà résolues.
   -------------------------------------------------------------------------- */

const ecranRole = (moi) => ({
  cle: 'role',
  visuel: visuelIcone('cible'),
  texte: `<p class="surtitre">Votre rôle</p>
    <h2>Vous testez avant les clients</h2>
    <p>Chaque défaut que vous trouvez, ${moi.prenom ? echapper(moi.prenom) : 'vous'}, c'est un client qui ne le trouvera pas. Ce qui compte, c'est votre regard de nouvel utilisateur : personne ne vous demande d'être un expert.</p>`,
});

const ecranApplication = (moi, c, liens) => {
  if (!c) {
    return {
      cle: 'application',
      visuel: `<div class="appli-icone appli-icone--vide">${icone('composants')}</div>`,
      texte: `<p class="surtitre">Ce que vous allez tester</p>
        <h2>Votre campagne arrive</h2>
        <p>Dès que l'équipe Capmedia ouvre votre campagne, l'application vous est présentée ici : à quoi elle sert, ses écrans, et le lien pour l'installer.</p>`,
    };
  }
  const nom = c.application || c.titre || 'L\'application';
  const visuels = (c.visuels || []).filter((v) => v && /^image\//.test(v.type || '') && v.chemin);
  const initiale = echapper(nom.trim().slice(0, 1).toUpperCase() || 'A');
  const visuel = visuels.length
    ? `<div class="telephone" aria-hidden="true">
        <div class="telephone-ecran"><span class="telephone-initiale">${initiale}</span>${visuels.map((v, i) => `<img${liens[v.chemin] ? ` src="${echapper(liens[v.chemin])}"` : ''} data-chemin="${echapper(v.chemin)}" alt="" class="${i === 0 ? 'actif' : ''}" draggable="false">`).join('')}</div>
        ${visuels.length > 1 ? `<span class="telephone-points">${visuels.map((v, i) => `<i class="${i === 0 ? 'actif' : ''}"></i>`).join('')}</span>` : ''}
      </div>`
    : `<div class="appli-icone">${initiale}</div>`;
  const atouts = (c.atouts || []).map((a) => String(a || '').trim()).filter(Boolean).slice(0, 4);
  return {
    cle: 'application',
    visuel,
    texte: `<p class="surtitre">Ce que vous allez tester</p>
      <h2>${echapper(nom)}</h2>
      ${c.accroche ? `<p class="accroche">${echapper(c.accroche)}</p>` : ''}
      ${paragraphes(c.presentation, 1)}
      ${atouts.length ? `<ul class="atouts">${atouts.map((a) => `<li>${icone('check')}<span>${echapper(a)}</span></li>`).join('')}</ul>` : ''}`,
  };
};

const ecranDeroule = () => ({
  cle: 'deroule',
  visuel: `<ol class="frise-accueil">
      <li><span class="frise-accueil-n">01</span><span class="frise-accueil-i">${icone('telecharger')}</span><span>Installez l'application<small>Le lien est dans « L'application », pour votre appareil.</small></span></li>
      <li><span class="frise-accueil-n">02</span><span class="frise-accueil-i">${icone('smartphone')}</span><span>Dites sur quoi vous testez<small>iPhone, Android ou le web. Changez-le si vous changez d'appareil.</small></span></li>
      <li><span class="frise-accueil-n">03</span><span class="frise-accueil-i">${icone('coeur')}</span><span>Donnez votre première impression<small>Deux minutes, avant de toucher à quoi que ce soit.</small></span></li>
      <li><span class="frise-accueil-n">04</span><span class="frise-accueil-i">${icone('taches')}</span><span>Déroulez vos scénarios<small>Un par un, à votre rythme. Tout est enregistré.</small></span></li>
    </ol>`,
  texte: `<p class="surtitre">Le déroulé</p>
    <h2>Quatre gestes, dans l'ordre</h2>
    <p>Votre campagne les reprend en tête de page. Rien n'est à retenir : l'espace vous dit à chaque instant ce qu'il reste à faire.</p>`,
});

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

const ecranSignalement = () => ({
  cle: 'signalement',
  visuel: `<div class="capture-accueil" aria-hidden="true">
      <span class="capture-accueil-image">${icone('image')}</span>
      <i style="width:88%"></i><i style="width:64%"></i><i style="width:76%"></i>
    </div>`,
  texte: `<p class="surtitre">Un échec</p>
    <h2>Un bon signalement</h2>
    <p>Ce que vous avez fait, ce que vous avez vu, et une capture. Décrivez ce que vous voyez, pas ce que vous en pensez : l'équipe cherche la cause, et c'est la capture qui lui permet de reproduire.</p>`,
});

const ecranTemps = () => ({
  cle: 'temps',
  visuel: `<div class="chrono-accueil" aria-hidden="true"><b data-chrono-demo>0 min 00 s</b><small>3 sessions additionnées</small></div>`,
  texte: `<p class="surtitre">Votre temps, votre avis</p>
    <h2>Chaque minute compte</h2>
    <p>Le chronomètre additionne vos sessions : arrêtez-vous quand vous voulez, rien n'est perdu. À la fin, votre avis sur l'application. Les scénarios disent si elle marche ; votre avis dit si elle plaît.</p>`,
});

const ecranFin = (moi, c) => ({
  cle: 'fin',
  visuel: logoHtml(true),
  texte: `<p class="surtitre">Tout est prêt</p>
    <h2>${c ? 'Votre campagne vous attend' : 'Votre espace est prêt'}</h2>
    <p>Le guide du testeur reste à portée de main, dans le rail à gauche, et vous pouvez revoir ces écrans quand vous voulez. Bonne découverte${moi.prenom ? `, ${echapper(moi.prenom)}` : ''}.</p>`,
});

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
    texte: 'Vous êtes sur Capmedia Test, l\'espace où l\'on découvre une application avant tout le monde. Laissez-nous vous présenter votre rôle, et ce que vous allez tester.',
    ecrans: () => [ecranRole(moi), ecranApplication(moi, c, liens), ecranDeroule(), ecranVerdicts(), ecranSignalement(), ecranTemps(), ecranFin(moi, c)],
    surFin,
  });

  /* Les captures : leur adresse se résout après coup, et l'écran la reçoit
     dès qu'elle arrive. */
  /* Une adresse qui n'arrive pas du premier coup (le Storage met parfois
     quelques secondes à répondre à froid) se redemande, deux fois, avant
     de laisser l'initiale tenir l'écran. */
  const chargerLiens = async (essai = 0) => {
    const visuels = ((c && c.visuels) || []).filter((v) => v && v.chemin && !liens[v.chemin]);
    if (!visuels.length) return;
    await Promise.all(visuels.map(async (v) => {
      try { liens[v.chemin] = await lienPiece({ chemin: v.chemin }); } catch (e) { /* pas lisible : l'initiale tient l'écran */ }
    }));
    $$('img[data-chemin]', moteur.el).forEach((img) => {
      const url = liens[img.dataset.chemin];
      if (url && img.getAttribute('src') !== url) img.src = url;
    });
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

  return { el: moteur.el, majCampagne, fermer: moteur.fermer, get entame() { return moteur.entame; } };
};
