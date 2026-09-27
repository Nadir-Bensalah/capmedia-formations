/* ==========================================================================
   CAPMEDIA · l'écran de lancement
   La marque s'assemble au centre (les quatre feuilles, comme dans l'accueil),
   le mot monte dessous, puis, dès que la page est prête, la marque glisse
   jusqu'à sa place : à côté du mot dans la porte de connexion, dans le rail
   d'un espace, ou dans la porte de l'accueil de la première fois. Le même
   sur le web et dans les applications Mac et Windows.

   La page n'a rien à faire : ce script regarde le document et sait quand
   elle est prête (le formulaire de la porte, le rail). Sous un robot de test
   ou quand le système demande moins de mouvement, tout est immédiat.
   ========================================================================== */
(function () {
  'use strict';

  var el = document.getElementById('lancement');
  if (!el) return;
  var robot = Boolean(navigator.webdriver) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* On arrive de la porte : la marque y était déjà seule au centre, avec le
     badge de l'espace. Elle reste telle quelle, sans se réassembler, et
     glisse à sa place dès que la page est prête. */
  var arrivee = '';
  try { arrivee = sessionStorage.getItem('suivi:arrivee') || ''; if (arrivee) sessionStorage.removeItem('suivi:arrivee'); } catch (e) { /* rien */ }
  if (arrivee) {
    el.classList.add('lancement--suite');
    el.querySelector('.accueil-logo').classList.add('accueil-logo--mini');
    var mot = el.querySelector('.lancement-mot');
    if (mot && arrivee !== 'Suite') mot.innerHTML = 'Capmedia<span class="service"></span>', mot.querySelector('.service').textContent = arrivee;
  }
  var MINIMUM = robot ? 30 : (arrivee ? 450 : 1450);
  var depart = Date.now();
  var fini = false;

  var cible = function () {
    return document.querySelector('.accueil-porte .accueil-logo, .porte-marque .lat-logo, #lat .lat-logo');
  };

  var finir = function () {
    if (fini) return;
    fini = true;
    var logo = el.querySelector('.accueil-logo');
    var c = cible();
    el.classList.add('part');
    if (c && !robot) {
      /* La marque rejoint sa place : même élément, mêmes feuilles, la
         distance et l'échelle calculées entre les deux positions. */
      var a = logo.getBoundingClientRect();
      var b = c.getBoundingClientRect();
      var echelle = b.width / a.width;
      logo.style.transformOrigin = 'top left';
      logo.style.transition = 'transform .72s cubic-bezier(.2, .8, .3, 1)';
      logo.style.transform = 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + echelle + ')';
      c.style.visibility = 'hidden';
      setTimeout(function () { c.style.visibility = ''; el.remove(); }, 740);
    } else {
      setTimeout(function () { el.remove(); }, robot ? 0 : 360);
    }
  };

  var pret = function () {
    var reste = MINIMUM - (Date.now() - depart);
    setTimeout(finir, Math.max(0, reste));
  };

  /* La page est prête quand la porte montre son formulaire, ou quand un
     espace a monté son rail. Six secondes au plus : une page qui n'arrive
     pas ne doit pas rester derrière la marque. */
  var regarder = function () {
    if (document.querySelector('#forme:not(.masque), #forme-code:not(.masque), #lat, #secours:not(.masque)')) { obs.disconnect(); pret(); return true; }
    return false;
  };
  var obs = new MutationObserver(regarder);
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  regarder();
  setTimeout(finir, 6000);
  window.addEventListener('pagehide', function () { fini = true; });
})();
