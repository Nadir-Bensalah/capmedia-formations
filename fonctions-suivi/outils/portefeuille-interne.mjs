/* ==========================================================================
   Les projets de la maison.

   Relevé du disque le 19 septembre 2026 : dépôt, nombre de commits, date
   du dernier, README, notes de suivi. Le nombre de commits et la date du
   dernier sont cités tels quels : ils disent l'activité réelle mieux
   qu'un pourcentage inventé.
   ========================================================================== */

const dep = (nom) => `https://github.com/Nadir-Bensalah/${nom}`;
const pages = (nom) => `https://nadir-bensalah.github.io/${nom}/`;

/* Un raccourci : un projet de la maison, sans client ni e-mail. */
const P = (ref, nom, o) => ({
  ref, nom, interne: true, contacts: [],
  type: o.type || 'application-mobile',
  plateformes: o.plateformes || [],
  statut: o.statut || 'en-cours',
  sante: o.sante || 'ok',
  description: o.description || '',
  pulse: o.pulse || {},
  composants: o.composants || [],
  jalons: o.jalons || [],
  liens: o.liens || [],
  notes: o.notes || [],
  taches: o.taches || [],
  blocages: o.blocages || [],
});

/* Une brique unique, pour les projets qui n'en ont qu'une. */
const brique = (type, nom, statut, progression, techno, description, lien) =>
  [{ id: 'principal', nom, type, statut, progression, techno, description, lien: lien || '', ordre: 1 }];

const depotLien = (nom, url) => ({ id: 'depot', nom: `Dépôt ${nom}`, categorie: 'code', url, visibilite: 'interne' });
const vitrineLien = (url) => ({ id: 'public', nom: 'En ligne', categorie: 'production', url, visibilite: 'interne' });

export const INTERNES = [

  /* --- Les produits mobiles les plus avancés -------------------------- */

  P('FAMILYMAGNET', 'FamilyMagnet', {
    type: 'application-mobile', plateformes: ['ios', 'android', 'landing', 'backend'],
    statut: 'livraison', sante: 'attention',
    description: "L'organiseur familial : tout ce qui fait tourner la maison sur un seul écran. Application iOS native, deux modes, sans compte ou foyer partagé entre les téléphones de la famille. Réplique native Android du même produit, même socle, mêmes familles.",
    pulse: {
      enCours: 'Publication App Store',
      derniereLivraison: 'v1.1 livrée le 29 août 2026, dettes techniques soldées',
      prochaineEtape: "Débloquer le groupe d'app sur l'extension de partage",
      attenteClient: '',
    },
    composants: [
      { id: 'ios', nom: 'Application iOS', type: 'ios', statut: 'en-cours', progression: 98, version: '1.0.0', versionPrep: '1.1', environnement: 'App Store Connect', techno: ['Swift', 'SwiftUI', 'Supabase'], ordre: 1, description: '460 commits, dernier le 19 septembre 2026. Bundle app.capmedia.familymagnet. Sous-titre posé dans ASC le 3 septembre 2026.' },
      { id: 'android', nom: 'Application Android', type: 'android', statut: 'en-cours', progression: 80, techno: ['Kotlin', 'Supabase'], ordre: 2, description: "129 commits, dernier le 17 septembre 2026. Ce n'est pas une adaptation mais l'autre moitié du même logiciel." },
      { id: 'landing', nom: 'Site vitrine', type: 'landing', statut: 'livre', progression: 100, environnement: 'GitHub Pages', ordre: 3, lien: pages('familymagnet-site'), description: '5 commits. Hébergement provisoire sur GitHub Pages.' },
      { id: 'backend', nom: 'Backend Supabase', type: 'backend', statut: 'livre', progression: 100, techno: ['Supabase'], ordre: 4, description: 'Phase 2 du backend marquée faite dans le backlog.' },
    ],
    jalons: [
      { id: 'v11', titre: 'Version 1.1', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1, description: "Livrée entièrement au 29 août 2026, avec les dettes techniques de l'inventaire." },
      { id: 'backend', titre: 'Backend, phase 2', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2 },
      { id: 'redteam', titre: 'Notes de la red team', phase: 'Tests', statut: 'termine', progression: 100, ordre: 3, description: 'Les trois fermées le 28 août 2026.' },
      { id: 'android', titre: 'Version Android', phase: 'Développement', statut: 'en-cours', progression: 80, ordre: 4 },
      { id: 'publication', titre: 'Publication sur les stores', phase: 'Publication', statut: 'bloque', progression: 30, ordre: 5, description: 'Quatre points bloquants, tous hors du code.' },
    ],
    liens: [depotLien('iOS', dep('FamilyMagnet')), { id: 'android', nom: 'Dépôt Android', categorie: 'code', url: dep('FamilyMagnetAndroid'), composant: 'android', visibilite: 'interne' }, { id: 'site', nom: 'Dépôt du site', categorie: 'code', url: dep('familymagnet-site'), composant: 'landing', visibilite: 'interne' }, { id: 'vitrine', nom: 'Site en ligne', categorie: 'production', url: pages('familymagnet-site'), composant: 'landing', visibilite: 'interne' }],
    blocages: [
      { id: 'groupe-app', titre: "Groupe d'app sur l'extension de partage", description: "Deux minutes dans Xcode. C'est le seul blocage qui empêche une installation ordinaire.", responsable: 'client', impact: "L'installation ordinaire échoue.", visibilite: 'interne' },
      { id: 'juridique', titre: 'Dossier juridique', description: "Forme et adresse de l'éditeur, contrat de sous-traitance Supabase, région d'hébergement, âge du compte d'un enfant.", responsable: 'client', impact: 'Bloque la soumission.', visibilite: 'interne' },
      { id: 'identifiants', titre: 'Identifiants Apple et Google', description: 'Sans eux, seule la connexion par courriel fonctionne.', responsable: 'client', impact: 'Connexion limitée.', visibilite: 'interne' },
      { id: 'brevo', titre: 'Deux clés Brevo à régénérer', description: 'Elles ont transité par une conversation.', responsable: 'client', impact: 'Risque de sécurité.', visibilite: 'interne' },
    ],
    notes: [
      { id: 'decision', titre: 'Une décision en attente : le Mur', type: 'decision', texte: "Le Mur doit-il devenir un espace du Foyer ? La question change un écran, elle est posée dans A-FAIRE.md et n'a pas été tranchée.", visibilite: 'interne' },
      { id: 'marche', titre: 'Le marché est la France', type: 'decision', texte: 'Décidé et inscrit en tête du backlog.', visibilite: 'interne' },
    ],
  }),

  P('MINDDROP', 'MindDrop', {
    plateformes: ['ios', 'landing', 'backend'], statut: 'en-cours', sante: 'ok',
    description: "L'entrée de cerveau assistée : une pensée entre par la voix ou le texte, l'IA comprend l'intention et la transforme en tâche, rappel, note, idée, projet, objectif, habitude ou événement.",
    pulse: { enCours: 'Scripts App Store Connect', derniereLivraison: 'Envoi automatisé des captures vers ASC', prochaineEtape: 'Soumission', attenteClient: '' },
    composants: [
      { id: 'ios', nom: 'Application iOS', type: 'ios', statut: 'en-cours', progression: 85, techno: ['React Native', 'Firebase'], ordre: 1, description: '222 commits, dernier le 19 août 2026.' },
      { id: 'landing', nom: 'Page de présentation', type: 'landing', statut: 'en-cours', progression: 40, techno: ['Next.js'], ordre: 2, description: '2 commits seulement.' },
    ],
    jalons: [
      { id: 'socle', titre: 'Socle et capture', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'asc', titre: 'Automatisation App Store Connect', phase: 'Publication', statut: 'termine', progression: 100, ordre: 2, description: 'Scripts ASC : envoi des captures.' },
      { id: 'landing', titre: 'Page de présentation', phase: 'Développement', statut: 'en-cours', progression: 40, ordre: 3 },
      { id: 'soumission', titre: 'Soumission App Store', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 4 },
    ],
    liens: [depotLien('MindDrop', dep('minddrop')), { id: 'landing', nom: 'Dépôt de la page', categorie: 'code', url: dep('minddrop_landingpage'), composant: 'landing', visibilite: 'interne' }],
    notes: [{ id: 'projetf', titre: 'Parenté avec ProjetF', type: 'contexte', texte: "L'identité de ProjetF a été portée dans MindDrop. Les deux dépôts coexistent sur la machine.", visibilite: 'interne' }],
  }),

  P('BUSAMIENS', 'Amiens · Bus & Vélam', {
    plateformes: ['ios', 'android'], statut: 'livraison', sante: 'ok',
    description: "Horaires et bus en temps réel du réseau Ametis, à Amiens. Application indépendante, non affiliée à Ametis, Keolis ni Amiens Métropole. Données de transport.data.gouv.fr.",
    pulse: { enCours: 'Réglages des notifications', derniereLivraison: 'Correctif sur la rafale de notifications', prochaineEtape: 'Publication', attenteClient: '' },
    composants: [
      { id: 'app', nom: 'Application mobile', type: 'ios', statut: 'en-cours', progression: 90, techno: ['React Native'], ordre: 1, description: '55 commits, dernier le 8 septembre 2026. Bundle app.capmedia.busamiens.' },
      { id: 'legal', nom: 'Pages légales', type: 'landing', statut: 'livre', progression: 100, environnement: 'GitHub Pages', ordre: 2, description: 'Confidentialité, conditions, mentions légales et support, servies par GitHub Pages.' },
    ],
    jalons: [
      { id: 'temps-reel', titre: 'Temps réel Ametis', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'legal', titre: 'Pages légales publiées', phase: 'Publication', statut: 'termine', progression: 100, ordre: 2, description: 'Les adresses doivent rester valides tant que l\'application est publiée.' },
      { id: 'notifs', titre: 'Notifications', phase: 'Développement', statut: 'en-cours', progression: 80, ordre: 3 },
      { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 4 },
    ],
    liens: [depotLien('Bus Amiens', dep('BusAmiens')), { id: 'legal', nom: 'Pages légales', categorie: 'production', url: dep('capmedia-legal'), composant: 'legal', visibilite: 'interne' }],
    notes: [{ id: 'domaine', titre: 'Domaine des pages légales non revendiqué', type: 'decision', texte: "Poser un CNAME capmedia.app sur le dépôt legal servirait ce dépôt à la racine du domaine et remplacerait le site existant. Deux options propres : un sous-domaine legal.capmedia.app, ou recopier le dossier dans le site. Rien n'est tranché.", visibilite: 'interne' }],
  }),

  P('DEEN', 'Deen', {
    plateformes: ['ios'], statut: 'en-cours', sante: 'ok',
    description: "Compagnon spirituel iOS : horaires de prière calculés sur l'appareil, habitude Coran, routines de dhikr authentiques, widgets et Live Activity. Local d'abord, aucun compte, aucun serveur, aucune publicité.",
    pulse: { enCours: 'Build des bundles', derniereLivraison: 'Alignement du build des bundles', prochaineEtape: 'Publication', attenteClient: '' },
    composants: brique('ios', 'Application iOS', 'en-cours', 85, ['React Native CLI 0.86'], '76 commits, dernier le 18 août 2026. Dépôt nommé qindil.'),
    jalons: [
      { id: 'horaires', titre: 'Horaires de prière hors ligne', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'widgets', titre: 'Widgets et Live Activity', phase: 'Développement', statut: 'en-cours', progression: 70, ordre: 2 },
      { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 3 },
    ],
    liens: [depotLien('Deen', dep('qindil'))],
  }),

  P('VISAFLOW', 'VisaFlow', {
    type: 'saas', plateformes: ['ios', 'android', 'web'], statut: 'en-cours', sante: 'ok',
    description: "La plateforme de suivi pour les agences de visas et de fret. Un dossier, une demande de pièce, un rendez-vous, une cargaison au même endroit, et le client suit son avancement sans appeler. Construite pour Tunis Consulting.",
    pulse: { enCours: 'Retrait des données fictives', derniereLivraison: 'Plus aucune donnée fictive dans l\'application', prochaineEtape: 'Mise en service chez Tunis Consulting', attenteClient: '' },
    composants: brique('ios', 'Application', 'en-cours', 85, ['React Native'], '90 commits, dernier le 9 septembre 2026.'),
    jalons: [
      { id: 'socle', titre: 'Socle dossiers et pièces', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'reelles', titre: 'Données réelles', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2, description: 'Toutes les données fictives ont été retirées le 9 septembre 2026.' },
      { id: 'mise-en-service', titre: 'Mise en service', phase: 'Livraison', statut: 'a-venir', progression: 0, ordre: 3 },
    ],
    liens: [depotLien('VisaFlow', dep('VisaFlow'))],
    notes: [{ id: 'client', titre: 'Client potentiel : Tunis Consulting', type: 'contexte', texte: "Le README cite Tunis Consulting, à Tunis, comme destinataire. Aucun contrat n'est enregistré ici : à rattacher à un client si l'affaire se fait.", visibilite: 'interne' }],
  }),

  P('OSE', 'OSÉ', {
    plateformes: ['ios', 'android', 'landing'], statut: 'en-cours', sante: 'ok',
    description: 'Jeu de défis et de développement personnel, avec achat unique.',
    pulse: { enCours: 'Version complète', derniereLivraison: 'Version complète avec achat unique', prochaineEtape: 'Publication', attenteClient: '' },
    composants: [
      { id: 'app', nom: 'Application mobile', type: 'ios', statut: 'en-cours', progression: 85, techno: ['React Native'], ordre: 1, description: '17 commits, dernier le 6 septembre 2026.' },
      { id: 'support', nom: 'Site de support', type: 'landing', statut: 'livre', progression: 100, environnement: 'Hostinger', ordre: 2, description: '2 commits, déploiement automatique Hostinger.' },
    ],
    jalons: [
      { id: 'achat', titre: 'Achat unique', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'support', titre: 'Site de support', phase: 'Livraison', statut: 'termine', progression: 100, ordre: 2 },
      { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 3 },
    ],
    liens: [depotLien('OSÉ', dep('ose')), { id: 'support', nom: 'Dépôt du support', categorie: 'code', url: dep('ose-support'), composant: 'support', visibilite: 'interne' }],
  }),

  P('ANIMA', 'Anima', {
    plateformes: ['ios', 'landing'], statut: 'en-cours', sante: 'ok',
    description: "Application iOS d'affirmations positives : feed vertical plein écran, fonds personnalisables, partage en story, notifications quotidiennes, affirmations générées par IA pour les abonnés.",
    pulse: { enCours: 'Correctifs son', derniereLivraison: 'Correctif react-native-sound', prochaineEtape: 'Publication', attenteClient: '' },
    composants: [
      { id: 'ios', nom: 'Application iOS', type: 'ios', statut: 'en-cours', progression: 80, techno: ['React Native', 'Firebase'], ordre: 1, description: '25 commits, dernier le 13 août 2026. Bundle com.izicode.anima.' },
      { id: 'web', nom: 'Site', type: 'landing', statut: 'livre', progression: 100, ordre: 2, description: "2 commits. Adresse de contact mise à jour." },
    ],
    jalons: [{ id: 'feed', titre: 'Feed et partage', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }, { id: 'abo', titre: 'Abonnement et IA', phase: 'Développement', statut: 'en-cours', progression: 60, ordre: 2 }, { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 3 }],
    liens: [depotLien('Anima', dep('anima'))],
  }),

  P('PILOU', 'Pilou', {
    plateformes: ['ios'], statut: 'en-cours', sante: 'ok',
    description: "Le carnet de santé du chien ou du chat. Application iOS native, entièrement hors ligne, en français : vaccins, vermifuges, antiparasitaires, poids, ordonnances, consultations.",
    pulse: { enCours: '', derniereLivraison: 'Jeu de démonstration', prochaineEtape: 'Publication', attenteClient: '' },
    composants: brique('ios', 'Application iOS', 'en-cours', 80, ['Swift'], '26 commits, dernier le 21 août 2026.'),
    jalons: [{ id: 'carnet', titre: 'Carnet de santé complet', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }, { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 2 }],
  }),

  P('TICKET', 'Ticket', {
    plateformes: ['ios'], statut: 'en-cours', sante: 'ok',
    description: "L'horodateur qui vit dans la Dynamic Island. Application iOS native, sans compte et sans serveur : on se gare, on touche une durée, le compte à rebours démarre.",
    pulse: { enCours: '', derniereLivraison: 'Passage au bundle app.capmedia.ticket', prochaineEtape: 'Publication', attenteClient: '' },
    composants: brique('ios', 'Application iOS', 'en-cours', 85, ['Swift', 'ActivityKit'], '9 commits, dernier le 20 août 2026.'),
    jalons: [{ id: 'island', titre: 'Dynamic Island', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }, { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 2 }],
    liens: [depotLien('Ticket', dep('Ticket'))],
  }),

  P('ALLEGER', 'Alléger', {
    plateformes: ['ios'], statut: 'en-cours', sante: 'ok',
    description: "Une app iOS native qui répond à « Fichier trop volumineux, 2 Mo maximum » : on lui donne une photo, un PDF ou une vidéo et un poids à ne pas dépasser, elle rend un fichier juste sous la limite.",
    pulse: { enCours: '', derniereLivraison: 'Écrans Signer et Identité', prochaineEtape: 'Publication', attenteClient: '' },
    composants: brique('ios', 'Application iOS', 'en-cours', 80, ['Swift'], '11 commits, dernier le 19 août 2026.'),
    jalons: [{ id: 'compression', titre: 'Compression sous contrainte', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }, { id: 'publication', titre: 'Publication', phase: 'Publication', statut: 'a-venir', progression: 0, ordre: 2 }],
  }),

  P('IMNOTALONE', 'ImNotAlone', {
    plateformes: ['ios'], statut: 'en-cours', sante: 'ok',
    description: "Une messagerie iOS native avec un seul interlocuteur : une IA qui écoute, se souvient et prend des nouvelles d'elle-même. Un fil de conversation, pas de liste de contacts, pas de groupes, pas de menu.",
    composants: brique('ios', 'Application iOS', 'en-cours', 60, ['Swift'], "Pas de dépôt Git sur la machine : le dossier existe mais n'est pas versionné."),
    jalons: [{ id: 'fil', titre: 'Le fil de conversation', phase: 'Développement', statut: 'en-cours', progression: 60, ordre: 1 }],
    taches: [{ id: 'git', titre: 'Mettre le projet sous Git', statut: 'a-faire', priorite: 'importante', visibilite: 'interne', description: "Le dossier n'est pas versionné : tout repose sur le disque." }],
  }),

  P('ISOGONIC', 'Isogonic', {
    plateformes: ['ios', 'android', 'landing'], statut: 'en-cours', sante: 'ok',
    description: "Un calculateur de vol hors ligne pour les pilotes. L'application vit dans un dépôt privé, le site public porte les pages légales et la politique de confidentialité.",
    composants: [
      { id: 'app', nom: 'Application', type: 'ios', statut: 'en-cours', progression: 60, techno: ['React Native'], ordre: 1, description: '18 commits, dernier le 11 août 2026.' },
      { id: 'web', nom: 'Site public', type: 'landing', statut: 'livre', progression: 100, environnement: 'GitHub Pages', ordre: 2, lien: pages('isogonic-web'), description: "Pages marketing et légales. Existe pour que la politique de confidentialité soit joignable." },
    ],
    liens: [depotLien('Isogonic', dep('Isogonic')), { id: 'web', nom: 'Site en ligne', categorie: 'production', url: pages('isogonic-web'), composant: 'web', visibilite: 'interne' }],
    jalons: [{ id: 'web', titre: 'Site public et pages légales', phase: 'Livraison', statut: 'termine', progression: 100, ordre: 1 }, { id: 'app', titre: 'Application', phase: 'Développement', statut: 'en-cours', progression: 60, ordre: 2 }],
  }),

  P('BIRTHDAYROOM', 'Birthday Room', {
    plateformes: ['ios'], statut: 'cadrage', sante: 'ok',
    description: "L'application où chaque anniversaire devient un espace vivant : une Room privée et collaborative où les proches déposent en secret messages, photos, vidéos, vocaux et cadeaux, révélés le jour J.",
    composants: brique('ios', 'Application mobile', 'cadrage', 20, ['React Native'], '5 commits, dernier le 11 août 2026.'),
    jalons: [{ id: 'concept', titre: 'Concept et maquettes', phase: 'Cadrage', statut: 'en-cours', progression: 30, ordre: 1 }],
    liens: [depotLien('Birthday Room', dep('BirthdayRoom'))],
  }),

  P('FLOWI', 'Flowi', {
    plateformes: ['ios', 'android'], statut: 'en-cours', sante: 'ok',
    description: 'Application mobile React Native. Partage sous forme de carte 1080 sur 1920 générée par l\'application.',
    composants: brique('ios', 'Application mobile', 'en-cours', 50, ['React Native'], '18 commits, dernier le 12 août 2026.'),
    jalons: [{ id: 'partage', titre: 'Partage en image', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }],
    liens: [depotLien('Flowi', dep('Flowi'))],
  }),

  P('PROJETF', 'ProjetF', {
    plateformes: ['ios', 'android'], statut: 'suspendu', sante: 'ok',
    description: "Projet mobile dont l'identité a été portée dans MindDrop. Le dépôt garde le nom ProjetF.",
    composants: brique('ios', 'Application mobile', 'en-pause', 50, ['React Native'], '21 commits, dernier le 16 août 2026. Sans dépôt distant.'),
    notes: [{ id: 'portage', titre: 'Identité portée dans MindDrop', type: 'decision', texte: "L'identité de ProjetF a été reprise dans MindDrop. Le dernier commit revient au nom ProjetF pour le dépôt.", visibilite: 'interne' }],
  }),

  P('MENUO', 'Menuo', {
    plateformes: ['ios', 'android', 'landing'], statut: 'en-cours', sante: 'ok',
    description: 'Application mobile avec prise de vue, et ses pages publiques.',
    composants: [
      { id: 'app', nom: 'Application mobile', type: 'ios', statut: 'en-cours', progression: 55, techno: ['React Native'], ordre: 1, description: '11 commits, dernier le 12 août 2026.' },
      { id: 'web', nom: 'Pages publiques', type: 'landing', statut: 'livre', progression: 100, ordre: 2 },
    ],
  }),

  P('TUNIRELAY', 'TuniRelay', {
    plateformes: ['ios', 'android'], statut: 'cadrage', sante: 'ok',
    description: "Relais de colis entre la France et la Tunisie. Deux applications distinctes : celle des clients et celle des professionnels. Une proposition de partenariat Ooredoo existe dans les documents.",
    composants: [
      { id: 'clients', nom: 'Application clients', type: 'ios', statut: 'cadrage', progression: 25, techno: ['React Native'], ordre: 1, description: '6 commits, dernier le 11 août 2026.' },
      { id: 'pro', nom: 'Application professionnels', type: 'android', statut: 'cadrage', progression: 15, techno: ['React Native'], ordre: 2, description: '2 commits.' },
    ],
    liens: [depotLien('TuniRelay clients', dep('TuniRelay_App_Clients')), { id: 'pro', nom: 'Dépôt professionnels', categorie: 'code', url: dep('TuniRelayPro'), composant: 'pro', visibilite: 'interne' }],
    notes: [{ id: 'ooredoo', titre: 'Proposition de partenariat Ooredoo', type: 'contexte', texte: "Un document « Proposition de Partenariat Ooredoo TuniRelay » est présent dans les téléchargements. Suite inconnue.", visibilite: 'interne' }],
  }),

  P('GARANTIX', 'GarantiX', {
    plateformes: ['ios', 'android'], statut: 'suspendu', sante: 'ok',
    description: 'Application de suivi des garanties. Deux dépôts sur la machine, une version Expo et une version CLI.',
    composants: brique('ios', 'Application mobile', 'en-pause', 25, ['React Native', 'Expo', 'Firebase'], '2 commits sur chaque dépôt, le plus récent du 30 juin 2025.'),
    liens: [depotLien('GarantiX CLI', dep('GarantixCLI'))],
  }),

  P('CERTIDOC', 'Certidoc', { plateformes: ['ios', 'android'], statut: 'cadrage', sante: 'ok', description: 'Application mobile de certification de documents. Import initial seulement.', composants: brique('ios', 'Application mobile', 'cadrage', 10, ['React Native'], "2 commits, import initial du 11 août 2026."), liens: [depotLien('Certidoc', dep('certidoc'))] }),
  P('ALLOTAXI', 'Allotaxi', { plateformes: ['ios', 'android'], statut: 'cadrage', sante: 'ok', description: 'Application mobile de réservation de taxi. Import initial seulement.', composants: brique('ios', 'Application mobile', 'cadrage', 10, ['React Native', 'Firebase'], '2 commits, import initial du 11 août 2026.'), liens: [depotLien('Allotaxi', dep('Allotaxi'))] }),
  P('EQUERRE', 'Equerre', { plateformes: ['ios', 'android'], statut: 'cadrage', sante: 'ok', description: 'Application mobile avec un moteur de calcul monétaire.', composants: brique('ios', 'Application mobile', 'cadrage', 20, ['React Native'], '2 commits, dernier le 9 août 2026.'), liens: [depotLien('Equerre', dep('equerre-app'))] }),
  P('OPULENCE', 'Opulence', { plateformes: ['ios'], statut: 'cadrage', sante: 'ok', description: 'Application mobile Expo. Import initial seulement.', composants: brique('ios', 'Application mobile', 'cadrage', 5, ['React Native', 'Expo'], '1 commit du 11 août 2026.'), liens: [depotLien('Opulence', dep('Opulence'))] }),
  P('RESPIR', 'Respir', { plateformes: ['ios'], statut: 'cadrage', sante: 'ok', description: 'Application mobile Expo. Deux dossiers sur la machine, dont une ancienne version.', composants: brique('ios', 'Application mobile', 'cadrage', 5, ['React Native', 'Expo'], '1 commit du 11 août 2026.') }),
  P('PREMIERSMOTS', 'Premiers Mots', { plateformes: ['ios'], statut: 'cadrage', sante: 'ok', description: 'Application mobile Expo. Un seul commit, du 16 août 2026.', composants: brique('ios', 'Application mobile', 'cadrage', 10, ['React Native', 'Expo'], '1 commit, dernier le 16 août 2026.') }),
  P('SESSIONBENCH', 'SessionBench', { plateformes: ['ios'], statut: 'cadrage', sante: 'attention', description: "Banc d'essai de sessions. Le dossier n'est pas versionné.", composants: brique('ios', 'Outil', 'cadrage', 20, [], "Aucun dépôt Git : rien n'est sauvegardé ailleurs que sur le disque."), taches: [{ id: 'git', titre: 'Mettre SessionBench sous Git', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' }] }),
  P('MARGE', 'Marge', { plateformes: ['ios'], statut: 'en-cours', sante: 'attention', description: "Application autour des données Santé. Le dossier n'a pas de dépôt distant.", composants: brique('ios', 'Application mobile', 'en-cours', 60, [], "56 commits, dernier le 17 août 2026, mais aucun dépôt distant : la sauvegarde n'est que locale."), taches: [{ id: 'distant', titre: 'Pousser Marge sur un dépôt distant', statut: 'a-faire', priorite: 'importante', visibilite: 'interne', description: '56 commits existent en local et nulle part ailleurs.' }] }),

  /* --- Capmedia, la maison -------------------------------------------- */

  P('CLIENTHUB', 'Capmedia Client Hub', {
    type: 'saas', plateformes: ['web', 'admin', 'backend'], statut: 'en-cours', sante: 'ok',
    description: "L'espace de suivi client de Capmedia, à capmedia.app/suivi : un portail pour le client et un cockpit pour l'agence. Projets, demandes, tâches, validations, devis, factures, messagerie instantanée.",
    pulse: { enCours: 'Remplissage du portefeuille', derniereLivraison: 'Bulle de discussion par projet, accusés de lecture', prochaineEtape: 'Ouvrir les accès aux clients', attenteClient: '' },
    composants: [
      { id: 'client', nom: 'Espace client', type: 'web', statut: 'en-cours', progression: 90, environnement: 'capmedia.app/suivi', techno: ['ES modules', 'Firebase'], ordre: 1, lien: 'https://capmedia.app/suivi/' },
      { id: 'cockpit', nom: 'Cockpit équipe', type: 'admin', statut: 'en-cours', progression: 90, environnement: 'capmedia.app/suivi/admin', ordre: 2 },
      { id: 'backend', nom: 'Fonctions et règles', type: 'backend', statut: 'en-cours', progression: 95, techno: ['Cloud Functions', 'Firestore', 'Brevo'], ordre: 3, description: "27 fonctions déployées en europe-west1, 75 contrôles de règles." },
    ],
    jalons: [
      { id: 'socle', titre: 'Socle et design', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 },
      { id: 'metier', titre: 'Le métier au complet', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2, description: 'Projets, demandes, tâches, validations, finances, documents.' },
      { id: 'messagerie', titre: 'Messagerie instantanée', phase: 'Développement', statut: 'termine', progression: 100, ordre: 3, description: 'Bulle par projet, accusés de lecture des deux côtés, indicateur de frappe, son, pièces jointes.' },
      { id: 'portefeuille', titre: 'Remplissage du portefeuille', phase: 'Livraison', statut: 'en-cours', progression: 60, ordre: 4 },
      { id: 'ouverture', titre: 'Ouverture aux clients', phase: 'Livraison', statut: 'a-venir', progression: 0, ordre: 5 },
    ],
    liens: [{ id: 'prod', nom: 'En ligne', categorie: 'production', url: 'https://capmedia.app/suivi/', visibilite: 'interne' }, depotLien('capmedia-formations', dep('capmedia-formations'))],
    taches: [
      { id: 'code', titre: 'Code à six chiffres au lieu du lien de connexion', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' },
      { id: 'modele', titre: "Personnaliser le modèle d'e-mail de connexion Firebase", statut: 'a-faire', priorite: 'normale', visibilite: 'interne', description: 'Il affiche encore capmedia-1f90d.' },
      { id: 'cadence', titre: 'Limiter la cadence des demandes de lien', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' },
      { id: 'facteur', titre: 'Second facteur sur le cockpit', statut: 'a-faire', priorite: 'normale', visibilite: 'interne' },
    ],
  }),

  P('ACADEMY', 'Capmedia Academy', {
    type: 'saas', plateformes: ['web', 'backend'], statut: 'en-cours', sante: 'ok',
    description: "Plateforme de formations en ligne. Première formation : De Zéro à l'App Store, publier sa première application mobile en 30 jours.",
    pulse: { enCours: '', derniereLivraison: 'MyKorba retiré des dernières références', prochaineEtape: '', attenteClient: '' },
    composants: [
      { id: 'site', nom: 'Plateforme', type: 'web', statut: 'en-cours', progression: 85, environnement: 'GitHub Pages', techno: ['Firebase', 'Stripe'], ordre: 1, lien: pages('capmedia-formations'), description: '113 commits, dernier le 5 septembre 2026.' },
    ],
    jalons: [{ id: 'formation1', titre: "Première formation : De Zéro à l'App Store", phase: 'Développement', statut: 'en-cours', progression: 85, ordre: 1 }],
    liens: [depotLien('Capmedia Academy', dep('capmedia-formations')), { id: 'prod', nom: 'En ligne', categorie: 'production', url: pages('capmedia-formations'), visibilite: 'interne' }],
    notes: [{ id: 'projets', titre: 'Deux projets Firebase distincts', type: 'decision', texte: "Capmedia et Capmedia Academy sont deux projets Firebase séparés. L'Academy porte les formations et Stripe, Capmedia porte le Client Hub.", visibilite: 'interne' }],
  }),

  P('CAPDIGITAL', 'Capmedia Digital', {
    type: 'site-vitrine', plateformes: ['landing'], statut: 'maintenance', sante: 'ok',
    description: "Le site de l'agence, capmedia.app, et les pages légales des applications publiées.",
    composants: [
      { id: 'site', nom: 'Site public', type: 'landing', statut: 'livre', progression: 100, environnement: 'capmedia.app', ordre: 1, lien: 'https://capmedia.app' },
      { id: 'legal', nom: 'Pages légales', type: 'landing', statut: 'livre', progression: 100, environnement: 'GitHub Pages', ordre: 2, description: "Exigées par l'App Store et Google Play. Elles doivent rester valides tant qu'une application est publiée." },
    ],
    liens: [{ id: 'prod', nom: 'capmedia.app', categorie: 'production', url: 'https://capmedia.app', visibilite: 'interne' }, { id: 'legal', nom: 'Dépôt des pages légales', categorie: 'code', url: dep('capmedia-legal'), composant: 'legal', visibilite: 'interne' }],
  }),

  P('NBCOM', 'nadirbensalah.com', {
    type: 'site-vitrine', plateformes: ['landing'], statut: 'maintenance', sante: 'ok',
    description: 'Site personnel. Next.js 15, React 19, TypeScript et Tailwind.',
    composants: brique('landing', 'Site', 'livre', 100, ['Next.js 15', 'React 19', 'Tailwind'], '16 commits, dernier le 6 septembre 2026.'),
    liens: [depotLien('nadirbensalah.com', dep('nadirbensalah.com'))],
  }),

  P('IZICODE', 'Izicode', {
    type: 'site-vitrine', plateformes: ['web'], statut: 'maintenance', sante: 'ok',
    description: 'Site Izicode. React, Vite et Firebase.',
    composants: brique('web', 'Site', 'livre', 100, ['React', 'Vite', 'Firebase'], '37 commits, dernier le 11 août 2026.'),
    liens: [depotLien('Izicode', dep('izicode'))],
  }),

  P('SERIALCODEUR', 'SerialCodeur', { type: 'site-vitrine', plateformes: ['web'], statut: 'maintenance', sante: 'ok', description: 'Site de présentation de services : développement web, applications mobiles, design.', composants: brique('web', 'Site', 'livre', 100, ['React', 'Vite', 'Firebase'], '8 commits, dernier le 30 septembre 2025.'), liens: [depotLien('SerialCodeur', dep('serialcodeur'))] }),

  /* --- Les produits web ----------------------------------------------- */

  P('MYKORBA', 'MyKorba', {
    type: 'saas', plateformes: ['web', 'admin'], statut: 'suspendu', sante: 'attention',
    description: "Plateforme locale pour Korba, en Tunisie : commerces, professionnels, annonces. Un tableau de bord d'administration et un tableau de bord partenaire l'accompagnent.",
    composants: [
      { id: 'site', nom: 'Plateforme', type: 'web', statut: 'en-pause', progression: 70, techno: ['React', 'Vite', 'Firebase'], ordre: 1, description: '15 commits.' },
      { id: 'admin', nom: "Tableau de bord d'administration", type: 'admin', statut: 'en-pause', progression: 70, techno: ['React', 'Vite', 'Firebase'], ordre: 2, description: '30 commits, dernier le 19 juin 2026. Authentification Firebase réelle, claim dashboard_admin.' },
      { id: 'partenaire', nom: 'Tableau de bord partenaire', type: 'admin', statut: 'en-pause', progression: 40, ordre: 3, description: '1 commit, décembre 2025.' },
    ],
    liens: [depotLien('MyKorba', dep('mykorba')), { id: 'admin', nom: 'Dépôt du tableau de bord', categorie: 'code', url: dep('mykorba_admin_dashboard'), composant: 'admin', visibilite: 'interne' }],
    notes: [{ id: 'amiens', titre: "Base reprise par Amiens Ma Ville", type: 'contexte', texte: "Amiens Ma Ville est répliquée depuis la base MyKorba, dont elle reprend l'architecture.", visibilite: 'interne' }],
  }),

  P('AMIENSVILLE', 'Amiens Ma Ville', {
    type: 'saas', plateformes: ['web'], statut: 'en-cours', sante: 'ok',
    description: "Application locale pour Amiens : commerces, bons plans, petites annonces, professionnels, actualités, événements, immobilier, emploi et communauté. Répliquée depuis la base MyKorba.",
    pulse: { enCours: 'Audit de mise en production', derniereLivraison: 'Audit complet de mise en production', prochaineEtape: '', attenteClient: '' },
    composants: brique('web', 'Plateforme', 'en-cours', 60, [], '3 commits, dernier le 17 septembre 2026.'),
    liens: [depotLien('Amiens Ma Ville', dep('amiens-ma-ville'))],
  }),

  P('DHAWNA', 'Dhawna', {
    type: 'saas', plateformes: ['web'], statut: 'en-cours', sante: 'ok',
    description: "La carte citoyenne du courant en Tunisie : visualiser, signaler, confirmer et documenter en temps réel les coupures d'électricité réellement vécues sur le terrain.",
    pulse: { enCours: '', derniereLivraison: 'Carte épurée', prochaineEtape: 'Brancher Firestore', attenteClient: '' },
    composants: brique('web', 'Application web', 'en-cours', 65, ['Next.js', 'Firebase'], '21 commits, dernier le 18 juillet 2026. Mode démonstration actif.'),
    jalons: [{ id: 'carte', titre: 'La carte', phase: 'Développement', statut: 'termine', progression: 100, ordre: 1 }, { id: 'firestore', titre: 'Branchement Firestore', phase: 'Développement', statut: 'a-venir', progression: 0, ordre: 2 }],
    liens: [depotLien('Dhawna', dep('Dhawna'))],
  }),

  P('NATIONSRISE', 'Nations Rise', {
    type: 'saas', plateformes: ['web'], statut: 'en-cours', sante: 'ok',
    description: 'Jeu web. Architecture Living Map et introduction cinématique.',
    composants: brique('web', 'Jeu web', 'en-cours', 55, ['Next.js'], '40 commits, dernier le 17 juillet 2026. Audit design du header mobile passé.'),
    liens: [depotLien('Nations Rise', dep('NationsRise'))],
  }),

  P('SHOPPAMINE', 'Shoppamine', {
    type: 'e-commerce', plateformes: ['web'], statut: 'en-cours', sante: 'ok',
    description: "Le plaisir d'acheter sans dépenser. Plateforme e-commerce simulée, pensée pour le téléphone d'abord : on remplit un panier, on applique un code promo, on passe au paiement, on confirme, et à la fin le montant n'est pas débité.",
    pulse: { enCours: 'Accessibilité et performance', derniereLivraison: 'Passe accessibilité et performance', prochaineEtape: '', attenteClient: '' },
    composants: brique('web', 'Plateforme', 'en-cours', 70, ['Next.js'], '3 commits, dernier le 18 septembre 2026.'),
  }),

  P('ILOVETOOLBOX', 'I Love Toolbox', { type: 'saas', plateformes: ['web'], statut: 'cadrage', sante: 'ok', description: "Boîte à outils en ligne. Projet Next.js créé le 19 septembre 2026, encore à l'état d'amorce.", composants: brique('web', 'Application web', 'cadrage', 10, ['Next.js'], '1 commit, créé le 19 septembre 2026.') }),
  P('ECOLIBRI', 'Ecolibri', { type: 'saas', plateformes: ['web'], statut: 'en-cours', sante: 'ok', description: 'Application web. Parcours de tests navigateur en place.', composants: brique('web', 'Application web', 'en-cours', 40, ['Vite'], '2 commits, dernier le 13 septembre 2026, avec des tests navigateur de bout en bout.') }),
  P('WALLOFLOVE', 'Wall of Love', { type: 'saas', plateformes: ['web'], statut: 'cadrage', sante: 'ok', description: 'Mur de témoignages clients, avec paiement Stripe prévu.', composants: brique('web', 'Application web', 'cadrage', 10, ['Next.js', 'Stripe'], '1 commit, import initial du 11 août 2026.'), liens: [depotLien('Wall of Love', dep('walloflove'))] }),
  P('CAPBON', 'Cap Bon', { type: 'site-vitrine', plateformes: ['web'], statut: 'suspendu', sante: 'ok', description: "Site d'attente pour promouvoir la région du Cap Bon en Tunisie : compte à rebours animé et collecte d'adresses par Firebase.", composants: brique('web', 'Site', 'livre', 100, ['React', 'Vite', 'Firebase'], '12 commits, dernier le 15 novembre 2025.'), liens: [depotLien('Cap Bon', dep('capbon'))] }),
  P('EASYBOOST', 'EasyBoost', { type: 'site-vitrine', plateformes: ['web'], statut: 'suspendu', sante: 'ok', description: 'Site avec suivi Tag Manager.', composants: brique('web', 'Site', 'livre', 100, ['React', 'Vite'], '29 commits, dernier le 19 février 2025.'), liens: [depotLien('EasyBoost', dep('easyboost'))] }),
  P('LASHESBOUBA', 'Lashes by Bouba', { type: 'site-vitrine', plateformes: ['web', 'admin'], statut: 'suspendu', sante: 'attention', description: "Site professionnel pour des extensions de cils à Korba, Nabeul. Next.js avec réservation en ligne et tableau de bord d'administration.", composants: brique('web', 'Site et réservation', 'en-pause', 80, ['Next.js', 'Firebase'], '28 commits, dernier le 11 août 2026.'), liens: [depotLien('Lashes by Bouba', dep('lashesbybouba'))], notes: [{ id: 'client', titre: 'Client à rattacher', type: 'contexte', texte: "Ce site est fait pour un salon tiers. Aucun client n'est enregistré ici : à rattacher si l'affaire se poursuit.", visibilite: 'interne' }] }),
  P('FLEURSINES', "Les Fleurs d'Inès", { type: 'site-vitrine', plateformes: ['web'], statut: 'maintenance', sante: 'ok', description: 'Site pour un fleuriste. Un changement d\'hébergeur a été fait en mai 2025.', composants: brique('web', 'Site', 'livre', 100, ['React', 'Vite'], "7 commits, dernier le 20 mai 2025 : changement d'hébergeur."), liens: [depotLien("Les Fleurs d'Inès", dep('lesfleursdines'))], notes: [{ id: 'client', titre: 'Client à rattacher', type: 'contexte', texte: "Site fait pour un tiers, aucun client enregistré ici.", visibilite: 'interne' }] }),
  P('BAYRAM', 'Fiche Parent Bayram', { type: 'site-vitrine', plateformes: ['web'], statut: 'termine', sante: 'ok', description: "Application web simple permettant de partager les informations de contact des parents, avec appel direct.", composants: brique('web', 'Application web', 'livre', 100, ['React', 'Vite'], '8 commits, dernier le 8 mai 2025.'), liens: [depotLien('Fiche Parent Bayram', dep('ficheparentbayram'))] }),
  P('CAPLAND', 'Capland', { type: 'saas', plateformes: ['web'], statut: 'en-cours', sante: 'ok', description: "Laboratoire interactif de Capmedia : prototypes autonomes pour capmedia.tn, testables en local avant d'être transposés. Rien n'y est copié dans le site, c'est un dossier d'essai.", composants: brique('web', 'Prototypes', 'en-cours', 50, [], 'Dossier de prototypes, non versionné.') }),
];
