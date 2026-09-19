/* ==========================================================================
   Le portefeuille Capmedia, tel qu'il est sur la machine.

   Chaque fiche vient d'un relevé du disque le 19 septembre 2026 : dépôt
   Git, nombre de commits, date du dernier, README, fichiers de suivi.
   Rien n'est deviné. Quand une information manque, le champ reste vide et
   la note le dit.

   `interne: true` marque un projet de la maison : aucun client, aucun
   e-mail, visible du seul cockpit.
   ========================================================================== */

const dep = (nom) => `https://github.com/Nadir-Bensalah/${nom}`;

/* --------------------------------------------------------------------------
   1. Les projets clients
   -------------------------------------------------------------------------- */

export const CLIENTS = [
  {
    ref: 'SHI',
    nom: 'Sophie Hardy Immobilier',
    description: "Site professionnel et espace d'administration pour Sophie Hardy, agente immobilière à Amiens. Site public en React et Vite déployé sur Hostinger, tableau de bord Firebase avec statistiques Google Analytics et gestion des biens, et une documentation technique livrée au client.",
    type: 'site-vitrine',
    plateformes: ['web', 'admin'],
    statut: 'maintenance',
    sante: 'ok',
    client: { nom: 'Sébastien Saillot', entreprise: 'Sophie Hardy Immobilier' },
    contacts: [{ nom: 'Sébastien Saillot', email: '' }, { nom: 'Sophie Hardy', email: '' }],
    pulse: {
      enCours: 'Maintenance courante',
      derniereLivraison: 'Correction du sitemap et du robots.txt',
      prochaineEtape: 'Recueillir les deux adresses e-mail pour ouvrir les accès',
      attenteClient: '',
    },
    composants: [
      { id: 'site', nom: 'Site public', type: 'web', statut: 'livre', progression: 100, environnement: 'Hostinger', techno: ['React', 'TypeScript', 'Vite', 'Tailwind', 'Firebase'], ordre: 1, lien: '', description: '50 commits. Chat bot, sitemap dynamique généré à chaque build, favicon, robots.txt.' },
      { id: 'admin', nom: "Tableau de bord d'administration", type: 'admin', statut: 'livre', progression: 100, environnement: 'Hostinger', techno: ['React', 'TypeScript', 'Firebase', 'Chart.js'], ordre: 2, description: '13 commits. Statistiques Google Analytics en temps réel, gestion des biens immobiliers.' },
      { id: 'doc', nom: 'Documentation technique', type: 'autre', statut: 'livre', progression: 100, environnement: 'Hostinger', techno: ['React', 'Vite'], ordre: 3, description: "Documentation et guide d'utilisation livrés au client, sur leur propre site." },
    ],
    jalons: [
      { id: 'site', titre: 'Site public en ligne', phase: 'Livraison', statut: 'termine', progression: 100, ordre: 1, description: 'Déploiement automatique sur Hostinger par GitHub Actions à chaque poussée sur main.' },
      { id: 'chatbot', titre: 'Chat bot et référencement', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2, description: 'Chat bot, sitemap dynamique avec les URL de biens, robots.txt, favicon.' },
      { id: 'admin', titre: "Tableau de bord d'administration", phase: 'Développement', statut: 'termine', progression: 100, ordre: 3, description: 'Statistiques réelles Google Analytics, les données fictives ont été retirées.' },
      { id: 'doc', titre: 'Documentation et guide', phase: 'Livraison', statut: 'termine', progression: 100, ordre: 4 },
      { id: 'acces', titre: 'Ouverture des accès au suivi', phase: 'Suivi', statut: 'a-venir', progression: 0, ordre: 5, description: 'Les deux interlocuteurs manquent à ce jour de leur adresse e-mail dans le Hub.' },
    ],
    liens: [
      { id: 'site-depot', nom: 'Dépôt du site', categorie: 'code', url: dep('sophie_hardy_immobilier'), visibilite: 'interne' },
      { id: 'admin-depot', nom: 'Dépôt du tableau de bord', categorie: 'code', url: dep('admin_sophie_hardy_immobilier'), composant: 'admin', visibilite: 'interne' },
      { id: 'doc-depot', nom: 'Dépôt de la documentation', categorie: 'code', url: dep('documentation_technique_et_guide_sophie-hardy-immobilier'), composant: 'doc', visibilite: 'interne' },
    ],
    notes: [
      { id: 'contacts', titre: 'Deux interlocuteurs sur ce projet', type: 'decision', texte: "Sébastien Saillot et Sophie Hardy suivent tous les deux ce projet. Le Hub accepte désormais deux interlocuteurs par projet : ils recevront les mêmes e-mails et verront le même espace. Leurs adresses restent à renseigner.", visibilite: 'interne' },
    ],
    taches: [
      { id: 'mails', titre: 'Recueillir les adresses de Sébastien Saillot et Sophie Hardy', statut: 'a-faire', priorite: 'importante', visibilite: 'interne', description: "Sans elles, aucun accès ne peut être ouvert et aucun e-mail ne part." },
    ],
  },

  {
    ref: 'ICARUS',
    nom: 'Icarus Pictures',
    description: "Site et espace d'administration pour Icarus Pictures, photographe professionnel à Amiens : mariages, portraits, photos d'identité ANTS, reportage d'entreprise, immobilier et prises de vue par drone.",
    type: 'site-vitrine',
    plateformes: ['web', 'admin'],
    statut: 'suspendu',
    sante: 'attention',
    client: { nom: 'Frédéric Cadel', entreprise: 'Icarus Pictures' },
    contacts: [{ nom: 'Frédéric Cadel', email: '' }],
    pulse: {
      enCours: '',
      derniereLivraison: 'Réglages des avis clients',
      prochaineEtape: 'Reprendre contact et décider de la suite',
      attenteClient: '',
    },
    composants: [
      { id: 'site', nom: 'Site public', type: 'web', statut: 'en-pause', progression: 85, techno: ['React', 'TypeScript', 'Vite', 'Firebase'], ordre: 1, lien: 'https://icaruspictures.com', description: "27 commits. Dernier message du dépôt : « dernier commit avant négociation », puis une mise à jour en avril 2025." },
      { id: 'admin', nom: "Tableau de bord d'administration", type: 'admin', statut: 'en-pause', progression: 70, techno: ['React', 'Vite', 'Firebase'], ordre: 2, description: '6 commits. Déploiement GitHub Actions en place.' },
      { id: 'charte', nom: 'Charte graphique', type: 'design', statut: 'livre', progression: 100, ordre: 3, description: 'Dossier de charte graphique versionné à part.' },
    ],
    jalons: [
      { id: 'site', titre: 'Site public', phase: 'Développement', statut: 'en-cours', progression: 85, ordre: 1 },
      { id: 'admin', titre: "Espace d'administration", phase: 'Développement', statut: 'en-cours', progression: 70, ordre: 2 },
      { id: 'negociation', titre: 'Négociation commerciale', phase: 'Cadrage', statut: 'bloque', progression: 0, ordre: 3, description: "Le dépôt porte la trace d'une négociation en cours au dernier commit. Rien depuis avril 2025." },
    ],
    liens: [
      { id: 'site-public', nom: 'Site en ligne', categorie: 'production', url: 'https://icaruspictures.com', composant: 'site', visibilite: 'client' },
      { id: 'site-depot', nom: 'Dépôt du site', categorie: 'code', url: dep('ICARUS-PHOTOS-NEW'), composant: 'site', visibilite: 'interne' },
      { id: 'admin-depot', nom: "Dépôt de l'administration", categorie: 'code', url: dep('ADMIN-ICARUS-PHOTOS'), composant: 'admin', visibilite: 'interne' },
    ],
    notes: [
      { id: 'contact', titre: 'Coordonnées publiques', type: 'contexte', texte: "Frédéric Cadel, Icarus Pictures, 7 rue Neuve Dejean, 80000 Amiens. Site icaruspictures.com. Trouvé sur les annuaires professionnels publics, à confirmer avec lui avant tout envoi.", visibilite: 'interne' },
    ],
    blocages: [
      { id: 'suite', titre: 'Projet à l\'arrêt depuis avril 2025', description: "Le dernier commit du site date du 28 avril 2025 et le précédent portait la mention « dernier commit avant négociation ». Aucune suite décidée depuis.", responsable: 'capmedia', impact: 'Le travail engagé sur le site et le tableau de bord ne sert pas.', visibilite: 'interne' },
    ],
    taches: [
      { id: 'relance', titre: 'Reprendre contact avec Frédéric Cadel', statut: 'a-faire', priorite: 'importante', visibilite: 'interne', description: 'Décider : reprise, facturation de ce qui est fait, ou clôture.' },
    ],
  },

  {
    ref: 'NOURCO',
    nom: 'Nour & Co',
    description: "Site et espace d'administration pour Nour & Co. Deux dépôts Next.js 15 créés, plus une migration de sécurité WordPress et un extrait de tiroir WordPress conservés à part.",
    type: 'site-vitrine',
    plateformes: ['web', 'admin'],
    statut: 'cadrage',
    sante: 'attention',
    client: { nom: 'Nour', entreprise: 'Nour & Co' },
    contacts: [{ nom: 'Nour', email: '' }],
    pulse: {
      enCours: '',
      derniereLivraison: '',
      prochaineEtape: 'Cadrer le périmètre et décider entre WordPress et Next.js',
      attenteClient: '',
    },
    composants: [
      { id: 'site', nom: 'Site public', type: 'web', statut: 'cadrage', progression: 10, techno: ['Next.js 15', 'React 19', 'TypeScript', 'Tailwind'], ordre: 1, description: "Dépôt créé, un seul commit d'import initial. Rien de développé à ce jour." },
      { id: 'admin', nom: "Espace d'administration", type: 'admin', statut: 'cadrage', progression: 10, techno: ['Next.js 15', 'React 19'], ordre: 2, description: "Dépôt créé, un seul commit d'import initial." },
      { id: 'wp', nom: 'Existant WordPress', type: 'autre', statut: 'en-cours', progression: 40, ordre: 3, description: "Une migration de sécurité SQL et un extrait de tiroir WordPress existent dans CascadeProjects. C'est la seule trace de travail réel sur l'existant." },
    ],
    jalons: [
      { id: 'cadrage', titre: 'Cadrage du besoin', phase: 'Cadrage', statut: 'en-cours', progression: 30, ordre: 1 },
      { id: 'securite', titre: 'Migration de sécurité WordPress', phase: 'Développement', statut: 'en-cours', progression: 40, ordre: 2, description: 'Script SQL de migration de sécurité écrit.' },
      { id: 'refonte', titre: 'Refonte en Next.js', phase: 'Développement', statut: 'a-venir', progression: 0, ordre: 3, description: 'Deux dépôts créés, aucun développement engagé.' },
    ],
    liens: [
      { id: 'site-depot', nom: 'Dépôt du site', categorie: 'code', url: dep('nour_co'), composant: 'site', visibilite: 'interne' },
      { id: 'admin-depot', nom: "Dépôt de l'administration", categorie: 'code', url: dep('nour_co_admin'), composant: 'admin', visibilite: 'interne' },
    ],
    notes: [
      { id: 'etat', titre: "Ce que le disque dit vraiment", type: 'contexte', texte: "Les deux dépôts Next.js ne contiennent qu'un import initial daté du 11 août 2026. Le travail réel repose sur l'existant WordPress : nour-co-security-migration.sql et wordpress-drawer-snippet.php dans ~/CascadeProjects.", visibilite: 'interne' },
    ],
    taches: [
      { id: 'decider', titre: 'Décider : garder WordPress ou refondre en Next.js', statut: 'a-faire', priorite: 'importante', visibilite: 'interne' },
      { id: 'adresse', titre: "Recueillir l'adresse e-mail de Nour", statut: 'a-faire', priorite: 'normale', visibilite: 'interne' },
    ],
  },

  {
    ref: 'FERMEKORBA',
    nom: 'Ferme Korba',
    description: "Site vitrine et boutique en ligne d'un élevage de volailles à Korba, en Tunisie. Paiement à la livraison, espace de gestion des commandes, français et arabe, pensé pour le téléphone d'abord.",
    type: 'e-commerce',
    plateformes: ['web', 'admin'],
    statut: 'en-cours',
    sante: 'ok',
    client: { nom: '', entreprise: 'Ferme à Korba' },
    contacts: [],
    prospect: true,
    pulse: {
      enCours: 'Démonstration verrouillée par mot de passe, site non indexé',
      derniereLivraison: 'Optimisation des images AVIF et WebP, verrou de démonstration',
      prochaineEtape: 'Présenter la démonstration au prospect',
      attenteClient: '',
    },
    composants: [
      { id: 'boutique', nom: 'Boutique', type: 'web', statut: 'en-cours', progression: 90, environnement: 'GitHub Pages', techno: ['Astro', 'Supabase'], ordre: 1, lien: 'https://nadir-bensalah.github.io/ferme-korba/', description: '40 commits. Images AVIF et WebP en six largeurs, préchargement du hero, client Supabase chargé seulement quand il sert.' },
      { id: 'gestion', nom: 'Espace de gestion des commandes', type: 'admin', statut: 'en-cours', progression: 85, environnement: 'GitHub Pages', techno: ['Astro', 'Supabase'], ordre: 2, lien: 'https://nadir-bensalah.github.io/ferme-korba/admin/', description: 'Compte de démonstration prévu pour la présentation.' },
    ],
    jalons: [
      { id: 'boutique', titre: 'Boutique en ligne', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1, description: 'Catalogue, panier, paiement à la livraison, français et arabe.' },
      { id: 'gestion', titre: 'Espace de gestion', phase: 'Développement', statut: 'en-cours', progression: 85, ordre: 2 },
      { id: 'perf', titre: 'Performance et images', phase: 'Développement', statut: 'termine', progression: 100, ordre: 3, description: 'AVIF et WebP à six largeurs pour les illustrations, quatre pour les photos.' },
      { id: 'demo', titre: 'Présentation au prospect', phase: 'Commercial', statut: 'a-venir', progression: 0, ordre: 4, description: 'Le site est verrouillé par un mot de passe et non indexé tant que la démonstration dure.' },
    ],
    liens: [
      { id: 'boutique-url', nom: 'Boutique de démonstration', categorie: 'production', url: 'https://nadir-bensalah.github.io/ferme-korba/', composant: 'boutique', visibilite: 'interne' },
      { id: 'gestion-url', nom: 'Espace de gestion', categorie: 'production', url: 'https://nadir-bensalah.github.io/ferme-korba/admin/', composant: 'gestion', visibilite: 'interne' },
      { id: 'depot', nom: 'Dépôt', categorie: 'code', url: dep('ferme-korba'), visibilite: 'interne' },
    ],
    notes: [
      { id: 'prospect', titre: 'Prospect, pas encore client', type: 'contexte', texte: "Le nom de l'exploitation et celui de l'interlocuteur ne sont pas encore connus. Le site est prêt et verrouillé, il sert d'argument de vente.", visibilite: 'interne' },
    ],
    taches: [
      { id: 'nom', titre: "Obtenir le nom de l'exploitation et de l'interlocuteur", statut: 'a-faire', priorite: 'importante', visibilite: 'interne' },
      { id: 'presenter', titre: 'Présenter la démonstration', statut: 'a-faire', priorite: 'importante', visibilite: 'interne' },
    ],
  },
];
