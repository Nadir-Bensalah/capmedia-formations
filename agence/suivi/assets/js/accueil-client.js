/* ==========================================================================
   CAPMEDIA HUB · l'accueil du client

   Les écrans de la première fois (le moteur est dans accueil.js), courts et
   dans l'ordre d'un fil : la porte (bienvenue, au nom de son entreprise),
   son projet, l'application à installer sur son ordinateur (seulement s'il
   est sur le web, depuis un Mac ou un PC), puis « tout est prêt ».

   Ce qui est fait est consigné dans son profil (app.js, champ « accueil ») :
   l'accueil ne se rejoue pas sur un autre appareil ni dans l'application,
   et l'administrateur voit sur la fiche du client qui a fait ses premiers pas.
   ========================================================================== */

import { echapper, prenom, nomAffiche, TYPES_PROJET } from './noyau.js';
import { icone } from './ui.js';
import { ouvrirAccueil as ouvrirMoteur, accueilVu as vu, marquerAccueilVu as marquer } from './accueil.js';
import { installable, systemeCourant, lienInstalleur } from './installer.js';

const prenomDe = (session) => prenom(nomAffiche(session));
const societeDe = (session) => { const o = (session.organisations || [])[0] || {}; return String(o.entreprise || o.nom || '').trim(); };

const CLE = (uid) => `suivi:client-accueil:${uid || ''}`;

export const accueilVu = (uid) => vu(CLE(uid));
export const marquerAccueilVu = (uid) => marquer(CLE(uid));

const initialesDe = (nom) => String(nom || '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '·';
const iconeProjet = (p) => (p.logo
  ? `<span class="accueil-appli-icone"><img src="${echapper(p.logo)}" alt=""></span>`
  : `<span class="accueil-appli-icone accueil-appli-icone--initiales">${echapper(initialesDe(p.nom))}</span>`);
const typeDe = (p) => { const t = TYPES_PROJET[p.type]; return typeof t === 'string' ? t : (t && t.libelle) || ''; };

/* --------------------------------------------------------------------------
   Les écrans
   -------------------------------------------------------------------------- */

const ecranProjets = (projets) => {
  const liste = (projets || []).filter((p) => !p.archive);
  if (!liste.length) {
    return {
      cle: 'projets',
      visuel: `<div class="accueil-appli"><span class="accueil-appli-icone accueil-appli-icone--vide">${icone('projets')}</span></div>`,
      texte: `<p class="surtitre">Votre projet</p>
        <h2>Il arrive bientôt</h2>
        <p>Dès que l'équipe l'ouvre, il apparaît ici.</p>`,
    };
  }
  if (liste.length === 1) {
    const p = liste[0];
    return {
      cle: 'projets',
      visuel: `<div class="accueil-appli">${iconeProjet(p)}<p class="accueil-appli-nom">${echapper(p.nom || '')}</p>${typeDe(p) ? `<p class="accueil-appli-type">${echapper(typeDe(p))}</p>` : ''}</div>`,
      texte: `<p class="surtitre">Votre projet</p>
        <h2>Tout votre projet, au même endroit</h2>
        <p>Son avancement, ses versions, vos demandes et vos documents.</p>`,
    };
  }
  return {
    cle: 'projets',
    visuel: `<div class="accueil-applis">${liste.slice(0, 4).map((p) => `<div class="accueil-appli accueil-appli--petite">${iconeProjet(p)}<p class="accueil-appli-nom">${echapper(p.nom || '')}</p></div>`).join('')}</div>`,
    texte: `<p class="surtitre">Vos projets</p>
      <h2>${liste.length} projets, au même endroit</h2>
      <p>Pour chacun : son avancement, ses versions, vos demandes et vos documents.</p>`,
  };
};

/* L'application, pour qui peut l'installer : sur le web, depuis un Mac ou
   un PC. Le bouton vise directement le bon fichier pour son système. */
const ecranApplication = () => {
  const systeme = systemeCourant();
  const libelle = systeme === 'mac' ? 'Mac' : 'Windows';
  return {
    cle: 'application-hub',
    visuel: `<div class="accueil-appli">
        <span class="accueil-appli-icone accueil-appli-icone--app"><img src="./assets/img/app-hub.png" alt=""></span>
        <p class="accueil-appli-nom">Capmedia Hub</p>
        <p class="accueil-appli-type">pour ${echapper(libelle)}</p>
      </div>`,
    texte: `<p class="surtitre">L'application</p>
      <h2>Installez-la sur votre ${echapper(libelle)}</h2>
      <p>Les notifications de votre ordinateur, à chaque nouveauté.</p>
      <p class="accueil-telecharger"><a class="btn btn-principal" href="${echapper(lienInstalleur('hub', systeme))}" download data-installer="hub" data-systeme="${echapper(systeme)}">${icone(systeme === 'mac' ? 'apple' : 'composants')} Télécharger pour ${echapper(libelle)}</a></p>`,
  };
};

const ecranFin = (session) => ({
  cle: 'fin',
  visuel: '<img class="accueil-mascotte accueil-mascotte--fin" src="./assets/img/hub-pret.png" alt="" width="260" height="260">',
  texte: `<p class="surtitre">C'est fait</p>
    <h2>Tout est prêt${prenomDe(session) ? `, ${echapper(prenomDe(session))}` : ''}</h2>
    <p>Ces écrans se revoient depuis le menu de votre compte.</p>`,
});

/* --------------------------------------------------------------------------
   L'ouverture
   -------------------------------------------------------------------------- */

/**
 * Renvoie { el, majProjets, fermer, entame }. `projets` est une fonction :
 * la liste peut arriver pendant que l'accueil est ouvert. `avecTests` est
 * gardé pour l'appelant (app.js) mais l'écran des tests n'existe plus.
 */
export const ouvrirAccueil = ({ session, projets, surFin = null }) => {
  const societe = societeDe(session);
  const moteur = ouvrirMoteur({
    service: 'Hub',
    classe: 'accueil-porte--hub',
    prenom: prenomDe(session) || '',
    titre: societe ? `Bienvenue ${societe}` : `Bienvenue${prenomDe(session) ? `, ${prenomDe(session)}` : ''}`,
    texte: 'Sur votre Hub Capmedia, un espace pensé pour vous.',
    visuel: '<img class="accueil-mascotte" src="./assets/img/hub-bienvenue.png" alt="" width="220" height="220">',
    ecrans: () => [ecranProjets(projets()), ...(installable() ? [ecranApplication()] : []), ecranFin(session)],
    surFin,
  });
  return { el: moteur.el, majProjets: () => { moteur.redessiner('projets'); }, fermer: moteur.fermer, get entame() { return moteur.entame; } };
};
