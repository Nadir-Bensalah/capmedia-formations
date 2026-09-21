/* ==========================================================================
   CAPMEDIA CLIENT HUB · le routeur
   Des adresses lisibles derrière le dièse : #/projets/{projet}/etapes.
   Chaque élément important a son adresse directe, qu'un e-mail peut ouvrir.

   Une route : { chemin: '/projets/:id/taches', vue: async (ctx) => nettoyage }.
   La vue reçoit { params, requete, chemin, sortie } et peut renvoyer une
   fonction de nettoyage, appelée quand on quitte la route.
   ========================================================================== */

let routes = [];
let routeDefaut = '/';
let nettoyage = null;
let majEnPlace = null;
let cleCourante = null;
let sortie = null;
/* Chaque rendu prend un numéro. Monter une vue est asynchrone : si une
   autre adresse arrive pendant le montage, celui-ci se retrouve périmé
   avant d'avoir fini. Sans ce numéro, la vue d'avant réinstallait son
   nettoyage et ses écoutes continuaient d'écrire dans la même zone : on
   lisait l'ancien écran sous la nouvelle adresse. */
let generation = 0;
const ecouteurs = new Set();
let routeCourante = { chemin: '/', params: {}, requete: {} };

const compiler = (chemin) => {
  const cles = [];
  const motif = chemin
    .replace(/\/+$/, '')
    .replace(/:([\w-]+)/g, (_, cle) => { cles.push(cle); return '([^/]+)'; })
    .replace(/\*/g, '.*');
  return { regex: new RegExp(`^${motif}/?$`), cles };
};

const lireHash = () => {
  const brut = location.hash.replace(/^#/, '') || '/';
  const [chemin, chaine = ''] = brut.split('?');
  const requete = {};
  new URLSearchParams(chaine).forEach((v, k) => { requete[k] = v; });
  return { chemin: chemin.startsWith('/') ? chemin : `/${chemin}`, requete };
};

const trouver = (chemin) => {
  for (const r of routes) {
    const m = chemin.match(r.regex);
    if (!m) continue;
    const params = {};
    r.cles.forEach((cle, i) => { params[cle] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return null;
};

const rendre = async () => {
  const { chemin, requete } = lireHash();
  const trouve = trouver(chemin);
  if (!trouve) {
    if (chemin !== routeDefaut) { naviguer(routeDefaut, { remplacer: true }); return; }
    return;
  }
  /* Une route peut declarer une cle : deux adresses qui partagent la meme
     cle sont la meme vue. On lui passe alors la main plutot que de tout
     detruire, ce qui evite la secousse d un rechargement complet. */
  const cle = typeof trouve.route.cle === 'function' ? trouve.route.cle({ chemin, params: trouve.params, requete }) : null;
  const mien = (generation += 1);
  if (cle && cle === cleCourante && typeof majEnPlace === 'function') {
    routeCourante = { chemin, params: trouve.params, requete };
    ecouteurs.forEach((fn) => { try { fn(routeCourante); } catch (e) { console.error(e); } });
    try { majEnPlace({ ...routeCourante, sortie }); } catch (e) { console.error('[routeur] mise a jour en place', e); }
    return;
  }

  if (typeof nettoyage === 'function') { try { nettoyage(); } catch (e) { console.error(e); } }
  nettoyage = null;
  majEnPlace = null;
  cleCourante = cle;
  routeCourante = { chemin, params: trouve.params, requete };
  ecouteurs.forEach((fn) => { try { fn(routeCourante); } catch (e) { console.error(e); } });
  window.scrollTo({ top: 0 });
  try {
    const rendu = await trouve.route.vue({ ...routeCourante, sortie });
    const objet = rendu && typeof rendu === 'object';
    const fin = objet && typeof rendu.fin === 'function' ? rendu.fin
      : (typeof rendu === 'function' ? rendu : null);
    const maj = objet && typeof rendu.maj === 'function' ? rendu.maj : null;
    if (mien !== generation) {
      /* Une autre adresse a pris la main pendant le montage : cette vue
         n'est plus à l'écran, on la démonte sans rien réinstaller. */
      if (fin) { try { fin(); } catch (e) { console.error(e); } }
      return;
    }
    nettoyage = fin;
    majEnPlace = maj;
  } catch (e) {
    if (mien !== generation) return;
    console.error('[routeur] la vue a échoué', e);
    sortie.innerHTML = `<div class="page"><div class="vide"><p class="vide-titre">Cette page n'a pas pu s'ouvrir.</p><p class="vide-texte">Réessayez dans un instant. Si cela continue, prévenez-nous.</p><button class="btn btn-secondaire" type="button" onclick="location.reload()">Recharger</button></div></div>`;
  }
};

/**
 * Une vue renvoie soit une fonction de nettoyage, soit
 * { fin, maj } : `maj` est appelée quand on reste dans la même vue.
 */

/** Déclare les routes et l'élément qui reçoit les vues. */
export const definir = (liste, { defaut = '/', cible } = {}) => {
  routes = liste.map((r) => ({ ...r, ...compiler(r.chemin) }));
  routeDefaut = defaut;
  sortie = cible;
};

export const demarrer = () => {
  window.addEventListener('hashchange', rendre);
  rendre();
};

export const naviguer = (chemin, { remplacer = false } = {}) => {
  const cible = `#${chemin}`;
  if (remplacer) history.replaceState(null, '', cible);
  else location.hash = chemin;
  if (remplacer) rendre();
};

export const rafraichir = () => rendre();

export const courant = () => routeCourante;

export const lien = (chemin) => `#${chemin}`;

/** Appelé à chaque changement de route, avant le rendu. */
export const surChangement = (fn) => { ecouteurs.add(fn); return () => ecouteurs.delete(fn); };

/** Vrai si la route courante commence par ce chemin. */
export const actif = (chemin) => routeCourante.chemin === chemin || routeCourante.chemin.startsWith(`${chemin}/`);
