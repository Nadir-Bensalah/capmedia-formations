/* ==========================================================================
   CAPMEDIA · le badge de la porte dans une application de bureau
   Dans l'application Cockpit, Hub ou Test, la porte de connexion porte le
   nom de l'application plutôt que « Suite ». Sur le web, un testeur lit
   « Test » lui aussi : la porte où le renvoie son espace (?espace=test) ;
   son lien d'invitation, lui, est lu par connexion.js. Le Hub et le
   Cockpit gardent « Suite » sur le web.
   ========================================================================== */
(function () {
  var b = window.capmediaBureau;
  var n = { cockpit: 'Cockpit', hub: 'Hub', test: 'Test' }[b && b.application];
  if (!n && /^test$/i.test(new URLSearchParams(location.search).get('espace') || '')) n = 'Test';
  var el = document.getElementById('porte-service');
  if (n && el) el.textContent = n;
})();
