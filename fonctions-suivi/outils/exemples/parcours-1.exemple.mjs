/* Exemple FICTIF, pour le banc et pour le format. Les vraies données vont dans donnees-locales/parcours-1.mjs.
   [ref, titre, outil, plateformes, scénarios couverts, éprouvé par mutation] */
const M = 'maestro', P = 'playwright', J = 'jest';
const MOB = ['ios', 'android'], WEB = ['web'];
export const PARCOURS = [
  ['R-01', 'Créer une note puis la retrouver après redémarrage', M, MOB, ['EX-01'], true],
  ['R-02', 'Se connecter avec un compte de démonstration', P, WEB, ['EX-02'], false],
  ['R-03', 'La date du jour reste juste au passage à minuit', J, ['ios', 'android', 'web'], ['EX-03'], false],
];
