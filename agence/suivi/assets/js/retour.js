/* ==========================================================================
   CAPMEDIA CLIENT HUB · la destination après connexion

   Sans dépendance : la porte de connexion l'importe sans charger le reste
   de l'interface. Voir lien-profond.js pour le contexte.
   ========================================================================== */

const ESPACES = { hub: './hub', cockpit: './cockpit', testeur: './testeur' };

/**
 * La destination à suivre après la connexion, ou `null` pour aller à
 * l'accueil de son espace. `demande` : le paramètre `retour` (chemin sous
 * /suivi/). `espace` : l'espace du compte (« ./cockpit », « ./hub »...).
 */
export const traduireRetour = (demande, espace) => {
  if (!espace || !demande || !/^\/suivi\/[\w./?=&#%-]*$/.test(demande)) return null;
  const [avantDiese, ...reste] = demande.split('#');
  const diese = reste.length ? `#${reste.join('#')}` : '';
  const page = avantDiese.split('?')[0].replace(/^\/suivi\//, '').replace(/\/$/, '') || 'hub';
  /* Une page de partage (projet, ticket) n'est pas un espace : elle sait
     elle-même où renvoyer. */
  if (!ESPACES[page]) return demande;
  if (ESPACES[page] === espace) return demande;
  /* L'espace d'un autre rôle : on garde la route, dans son propre espace,
     traduite quand les deux espaces ne la nomment pas pareil. L'espace
     testeur n'a pas de routes : on y va simplement. */
  return espace === './testeur' ? espace : `${espace}${traduireRoute(diese, espace)}`;
};

/* Les routes que le Hub et le Cockpit nomment différemment. Le Cockpit
   connaît aussi l'adresse du Hub (alias dans admin.js) : la traduire ici
   évite seulement un détour. */
const ROUTES = {
  './cockpit': [[/^#\/valider\/([^/?#]+)/, '#/validations/$1'], [/^#\/valider(?=$|\?)/, '#/validations']],
};
export const traduireRoute = (diese, espace) => {
  for (const [motif, vers] of ROUTES[espace] || []) if (motif.test(diese)) return diese.replace(motif, vers);
  return diese;
};
