/* ==========================================================================
   CAPMEDIA · les anciennes adresses de l'espace de suivi
   console, projet?p=… et ticket?t=… renvoient vers l'espace d'aujourd'hui.
   La balise script porte la destination :
     data-vers   la page d'arrivée (./cockpit, ./hub)
     data-param  le paramètre de l'ancienne adresse à reprendre (p, t)
     data-ancre  le début de l'ancre qui le reçoit (#/projets/, #/demande/)
   ========================================================================== */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var vers = s.dataset.vers || './hub';
  var valeur = s.dataset.param ? new URLSearchParams(location.search).get(s.dataset.param) : null;
  location.replace(vers + (valeur && s.dataset.ancre ? s.dataset.ancre + encodeURIComponent(valeur) : ''));
})();
