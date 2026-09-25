/* ==========================================================================
   CAPMEDIA CLIENT HUB · lire l'émulateur Firestore par REST, en entier

   Une liste REST ne rend qu'UNE page (triée par identifiant) et un jeton
   pour la suivante. Les suites lisaient la première page seulement : dès
   que le semis produisait plus d'activités ou de lettres que la taille de
   page, celle qu'on cherchait pouvait tomber sur la page suivante, et la
   suite échouait sans défaut dans le produit. Ici, une liste suit toutes
   ses pages ; un document seul se lit tel quel.
   ========================================================================== */
exports.lireRest = async (url, entetes) => {
  const r = await fetch(url, { headers: entetes });
  if (!r.ok) return null;
  const j = await r.json();
  let suivant = j.nextPageToken;
  while (suivant && Array.isArray(j.documents)) {
    const s = await fetch(`${url}${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(suivant)}`, { headers: entetes });
    if (!s.ok) break;
    const k = await s.json();
    j.documents.push(...(k.documents || []));
    suivant = k.nextPageToken;
  }
  delete j.nextPageToken;
  return j;
};
