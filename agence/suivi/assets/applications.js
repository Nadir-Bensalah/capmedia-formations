/* ==========================================================================
   CAPMEDIA · les applications de la suite, sur la page de connexion
   Chaque lien vise la dernière version publiée sur le dépôt public des
   installeurs. Le système de la personne passe en premier et en plein ;
   l'autre reste à côté, pour qui prépare l'ordinateur de quelqu'un d'autre.
   Dans l'application elle-même, le bloc disparaît.
   ========================================================================== */
(function () {
  'use strict';

  var DEPOT = 'https://github.com/Nadir-Bensalah/capmedia-apps/releases/download';
  var FICHIERS = { mac: 'mac.dmg', windows: 'windows.exe' };

  var bloc = document.getElementById('porte-apps');
  if (!bloc) return;
  if (window.capmediaBureau) { bloc.hidden = true; return; }

  var ua = navigator.userAgent || '';
  var systeme = /Windows/i.test(ua) ? 'windows' : (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : '');
  /* Sur un téléphone, une application d'ordinateur ne sert à rien. */
  if (/iPhone|iPad|Android/i.test(ua)) { bloc.hidden = true; return; }

  Array.prototype.forEach.call(bloc.querySelectorAll('[data-app]'), function (a) {
    var app = a.getAttribute('data-app');
    var os = a.getAttribute('data-os');
    a.href = DEPOT + '/' + app + '/capmedia-' + app + '-' + FICHIERS[os];
    a.setAttribute('download', '');
    if (systeme && os === systeme) {
      a.classList.remove('btn-secondaire');
      a.classList.add('btn-principal');
      a.parentNode.insertBefore(a, a.parentNode.firstChild);
    }
  });
})();
