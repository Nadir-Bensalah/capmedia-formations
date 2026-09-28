/* ==========================================================================
   Installer l'application de CET espace sur son ordinateur.

   Un seul bouton, pour le système de la personne : le Hub propose le Hub,
   le Cockpit le Cockpit, Test l'application Test. Chaque lien vise « la
   dernière version publiée » sur le dépôt public des installeurs : les noms
   de fichiers ne changent jamais, c'est le contenu derrière qui est mis à
   jour à chaque publication, et l'application installée se met ensuite à
   jour toute seule. Dans l'application elle-même, rien de tout cela ne
   s'affiche : elle n'a pas à se proposer.
   ========================================================================== */

import { echapper } from './noyau.js';
import { icone, modale } from './ui.js';

const DEPOT = 'https://github.com/Nadir-Bensalah/capmedia-apps/releases/download';
const APPS = {
  hub: { nom: 'Capmedia Hub', usage: 'suivre vos projets' },
  cockpit: { nom: 'Capmedia Cockpit', usage: 'piloter les projets' },
  test: { nom: 'Capmedia Test', usage: 'tester les applications' },
};
const SYSTEMES = {
  mac: { libelle: 'Mac', fichier: 'mac.dmg', icone: 'apple', aide: 'Ouvrez le fichier téléchargé et glissez l\'application dans Applications.' },
  windows: { libelle: 'Windows', fichier: 'windows.exe', icone: 'composants', aide: 'Lancez le fichier téléchargé : l\'installation se fait toute seule.' },
};

/** Le système de la personne, ou '' sur un téléphone ou autre chose. */
export const systemeCourant = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|Android/i.test(ua)) return '';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  return '';
};

/** Vrai quand la proposition a un sens : sur le web, depuis un ordinateur. */
export const installable = () => !window.capmediaBureau && Boolean(systemeCourant());

export const lienInstalleur = (app, systeme) => `${DEPOT}/${app}/capmedia-${app}-${SYSTEMES[systeme].fichier}`;

/** La fenêtre « Installer », avec son unique bouton. */
export const ouvrirInstaller = (app) => {
  const fiche = APPS[app] || APPS.hub;
  const systeme = systemeCourant() || 'mac';
  const s = SYSTEMES[systeme];
  const m = modale({
    titre: `Installer ${fiche.nom}`, sousTitre: 'Sur cet ordinateur',
    corps: `
      <p class="t-corps">Le même espace que sur le web, dans une fenêtre à lui, avec les notifications de votre ordinateur. L'application se met à jour toute seule.</p>
      <div class="rang" style="margin-top:18px;justify-content:center">
        <a class="btn btn-principal" href="${echapper(lienInstalleur(app, systeme))}" download data-installer="${echapper(app)}" data-systeme="${echapper(systeme)}">${icone(s.icone)} Télécharger pour ${echapper(s.libelle)}</a>
      </div>
      <p class="aide" style="margin-top:14px;text-align:center">${echapper(s.aide)}</p>`,
    pied: '<span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  });
  return m;
};

/** L'entrée de menu à poser dans le menu du compte, ou rien dans l'application. */
export const entreeMenuInstaller = (app) => (installable()
  ? [{ libelle: `Installer ${(APPS[app] || APPS.hub).nom} sur ${SYSTEMES[systemeCourant()].libelle}`, icone: 'telecharger', action: () => ouvrirInstaller(app) }]
  : []);
