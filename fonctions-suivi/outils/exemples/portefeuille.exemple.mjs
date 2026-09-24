/* Exemple FICTIF du portefeuille client. Les vraies fiches vont dans donnees-locales/portefeuille.mjs. */
export const CLIENTS = [
  {
    ref: 'EXEMPLE',
    nom: 'Boutique Exemple',
    description: 'Projet fictif pour décrire le format.',
    type: 'site-vitrine',
    plateformes: ['web'],
    statut: 'en-cours',
    sante: 'ok',
    client: { nom: 'Camille Exemple', entreprise: 'Boutique Exemple', email: 'camille@exemple.test' },
    contacts: [{ nom: 'Camille Exemple', email: 'camille@exemple.test' }],
    pulse: { enCours: 'Maquettes', derniereLivraison: '', prochaineEtape: 'Validation des maquettes', attenteClient: '' },
    composants: [{ id: 'site', nom: 'Site public', type: 'web', statut: 'en-cours', progression: 40, ordre: 1 }],
    jalons: [{ id: 'maquettes', titre: 'Maquettes', phase: 'Design', statut: 'en-cours', progression: 40, ordre: 1 }],
    liens: [{ id: 'depot', nom: 'Dépôt', categorie: 'code', url: 'https://depot.exemple.test/boutique', visibilite: 'interne' }],
    notes: [], taches: [], blocages: [],
  },
];
