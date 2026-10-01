/* ==========================================================================
   CAPMEDIA · le badge de la porte dans une application de bureau
   Dans l'application Cockpit, Hub ou Test, la porte de connexion porte le
   nom de l'application plutôt que « Suite ». Ailleurs, rien ne change.
   ========================================================================== */
(function () {
  var b = window.capmediaBureau;
  var n = { cockpit: 'Cockpit', hub: 'Hub', test: 'Test' }[b && b.application];
  var el = document.getElementById('porte-service');
  if (n && el) el.textContent = n;
})();
