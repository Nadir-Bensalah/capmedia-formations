/* ==========================================================================
   CAPMEDIA · le thème avant le premier pixel
   Chargé dans le <head>, sans defer : la page s'affiche déjà dans le bon
   thème (sombre par défaut). La clé vient de l'attribut data-cle de la
   balise script. Ce petit script vivait en ligne dans chaque page ; la
   politique de sécurité du contenu n'accepte plus que des fichiers.
   theme-espace.js reprend ensuite, en bas de page.
   ========================================================================== */
(function () {
  var r = document.documentElement, t = 'dark';
  var cle = (document.currentScript && document.currentScript.dataset.cle) || 'suivi:theme';
  try { var v = localStorage.getItem(cle); if (v === 'light' || v === 'dark' || v === 'auto') t = v; } catch (e) { /* stockage refusé */ }
  if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
})();
