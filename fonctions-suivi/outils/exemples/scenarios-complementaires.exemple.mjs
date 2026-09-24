/* Exemple FICTIF. Les vraies données vont dans donnees-locales/scenarios-complementaires.mjs.
   [ref, titre, bloc, niveau, options, attendu, plateformes] */
const TOUS = ['ios', 'android', 'web'];
export const SCENARIOS = [
  ['ST-01', 'Compte neuf : les compteurs partent de zéro', 'statistiques', 'socle',
    'Créer un compte de démonstration, ouvrir les statistiques.', 'Tout est à zéro, sans écran vide inexpliqué.', TOUS],
  ['PA-01', 'Changer la langue de l interface', 'parametres', 'reparti',
    'Ouvrir les paramètres, choisir une autre langue.', 'Tous les écrans suivent la langue choisie.', TOUS],
];
