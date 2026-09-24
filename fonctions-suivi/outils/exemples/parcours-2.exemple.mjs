/* Exemple FICTIF. Les vraies données vont dans donnees-locales/parcours-2.mjs.
   [ref, titre, outil, plateformes, scénarios couverts, éprouvé par mutation] */
const M = 'maestro', P = 'playwright';
export const PARCOURS = [
  ['S-01', 'Compte neuf : tous les compteurs à zéro', M, ['ios', 'android'], ['EX-10'], false],
  ['X-01', 'Une action sur le web se voit sur le mobile', P, ['web'], ['EX-11'], false],
];
