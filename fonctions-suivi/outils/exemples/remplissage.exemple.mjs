/* Exemple FICTIF du remplissage d'un projet. Le vrai va dans donnees-locales/remplissage-<nom>.mjs. */
export const contenu = {
  projet: { nom: 'Projet exemple', description: 'Projet fictif.', type: 'application-mobile', statut: 'en-cours', plateformes: ['ios', 'android'] },
  composants: [{ id: 'ios', nom: 'Application iOS', type: 'ios', statut: 'en-cours', progression: 30, ordre: 1 }],
  jalons: [{ id: 'dev', titre: 'Développement', phase: 'Développement', statut: 'en-cours', progression: 30, ordre: 1 }],
  liens: [], releases: [], reunions: [], notes: [], blocages: [], taches: [],
};
