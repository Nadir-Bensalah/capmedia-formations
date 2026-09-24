/* Exemple FICTIF. Les vraies données vont dans donnees-locales/regles.mjs.
   [ref, titre, famille, cas, scénarios couverts, ce qu'on cherche] */
export const REGLES = [
  ['RG-01', 'Une échéance quotidienne sur cent jours', 'recurrences', 12, ['EX-01'], 'Aucun jour sauté, aucun jour en double.'],
  ['RG-02', 'Le 29 février sur dix ans', 'dates', 8, ['EX-03'], 'La date tombe au bon jour chaque année.'],
];
