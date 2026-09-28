/* ==========================================================================
   CAPMEDIA · installer l'application de cet espace, depuis la page de
   connexion. Un seul bouton : l'espace demandé (?espace=hub, cockpit ou
   test, le Hub sinon), pour le système de la personne. Le lien vise « la
   dernière version publiée » sur le dépôt public des installeurs : les noms
   ne changent jamais, le contenu est remplacé à chaque publication. Dans
   l'application elle-même et sur un téléphone, rien ne s'affiche.
   ========================================================================== */
(function () {
  'use strict';

  var DEPOT = 'https://github.com/Nadir-Bensalah/capmedia-apps/releases/download';
  var APPS = { hub: 'Capmedia Hub', cockpit: 'Capmedia Cockpit', test: 'Capmedia Test' };
  var FICHIERS = { mac: 'mac.dmg', windows: 'windows.exe' };
  var LIBELLES = { mac: 'Mac', windows: 'Windows' };

  var bloc = document.getElementById('porte-apps');
  if (!bloc) return;
  if (window.capmediaBureau) return;

  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|Android/i.test(ua)) return;
  var systeme = /Windows/i.test(ua) ? 'windows' : (/Macintosh|Mac OS X/i.test(ua) ? 'mac' : '');
  if (!systeme) return;

  var espace = (new URLSearchParams(location.search).get('espace') || '').toLowerCase();
  if (!APPS[espace]) espace = 'hub';

  var lien = document.getElementById('porte-app-lien');
  lien.href = DEPOT + '/' + espace + '/capmedia-' + espace + '-' + FICHIERS[systeme];
  lien.textContent = 'Télécharger ' + APPS[espace] + ' pour ' + LIBELLES[systeme];
  document.getElementById('porte-apps-phrase').textContent = APPS[espace] + ' existe aussi en application : une fenêtre à lui, les notifications de votre ordinateur, et des mises à jour toutes seules.';
  bloc.hidden = false;
})();
