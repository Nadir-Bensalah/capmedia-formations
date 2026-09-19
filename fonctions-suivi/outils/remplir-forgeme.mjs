/* ==========================================================================
   Amorçage du projet ForgeMe dans le Client Hub.

   Tout ce qui suit vient de la machine et des dépôts : versions réelles
   (iOS 1.1.2 build 23, Android 1.0.15 build 15), dépôts GitHub, six
   langues, écrans et services comptés dans le code. Rien n'est inventé :
   un champ dont la valeur n'est pas certaine reste vide, à toi de le
   compléter depuis le cockpit.

   Le projet est posé en sourdine : aucun e-mail ne part pendant le
   remplissage. La sourdine se lève depuis le cockpit, bouton « Modifier ».

     ADMIN_CLE=... PROJET=<id> node fonctions-suivi/outils/remplir-forgeme.mjs
   ========================================================================== */

const CLE = process.env.ADMIN_CLE;
const PROJET = process.env.PROJET;
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;

/* Le garde-fou : les seules adresses attendues sur ce projet. Si une autre
   y figure, le serveur refuse d'écrire. */
const ADRESSES_ATTENDUES = (process.env.ADRESSES || 'nadir.bensalah@outlook.fr,contact@capmedia.app,contact@nadirbensalah.fr,contact@nadirbensalah.com')
  .split(',').map((e) => e.trim()).filter(Boolean);

if (!CLE || !PROJET) {
  console.error('Usage : ADMIN_CLE=... PROJET=<identifiant> node fonctions-suivi/outils/remplir-forgeme.mjs');
  process.exit(1);
}

/* Le prochain lundi 21 septembre 2026, 11 h, heure de Paris. */
const REUNION = '2026-09-21T09:00:00.000Z';

const contenu = {
  projet: {
    nom: 'ForgeMe',
    description: "Application de productivité personnelle : objectifs, tâches, habitudes, journal, idées et dates importantes, sur iPhone, Android et web, avec un tableau de bord d'administration et une page de présentation publique.",
    type: 'application-mobile',
    statut: 'en-cours',
    plateformes: ['ios', 'android', 'web', 'admin', 'landing', 'backend'],
    progression: { mode: 'jalons', valeur: 0 },
    /* La date visée : rouvrir la fiche Google Play et livrer l'API 36 avant
       l'échéance reportée du 1er novembre 2026. C'est la seule échéance du
       projet qui ne se négocie pas. */
    cible: '2026-11-01',
    pulse: {
      enCours: "Republication sur Google Play, et restructuration des abonnements Apple",
      derniereLivraison: 'iOS 1.1.2, build 23, le 9 septembre 2026',
      prochaineEtape: "Passage à l'API Android 36 avant le 1er novembre",
      attenteClient: '',
    },
    sante: 'attention',
    silence: true,
  },

  composants: [
    { id: 'ios', nom: 'Application iPhone', type: 'ios', statut: 'en-cours', progression: 92, version: '1.1.2', versionPrep: '1.2.0', environnement: 'App Store', techno: ['React Native CLI', 'TypeScript', 'Firebase'], ordre: 1, description: 'Build 23 en ligne. La correction des validations de tâches de la veille part dans la 1.2.' },
    { id: 'android', nom: 'Application Android', type: 'android', statut: 'en-pause', progression: 85, version: '1.0.15', versionPrep: '1.2.0', environnement: 'Google Play', techno: ['React Native CLI', 'TypeScript', 'Firebase'], ordre: 2, description: 'Version 15 en attente de republication après le refus de Google.' },
    { id: 'web', nom: 'Application web', type: 'web', statut: 'en-cours', progression: 95, version: '', environnement: 'Production', techno: ['React', 'Firebase'], ordre: 3, description: 'Même base de données que le mobile.' },
    { id: 'admin', nom: "Tableau de bord d'administration", type: 'admin', statut: 'livre', progression: 100, version: '', environnement: 'Production', techno: ['React', 'Firebase'], ordre: 4, description: 'Comptes, rôles, contenus, notifications, statistiques, foire aux questions et textes légaux.' },
    { id: 'landing', nom: 'Page de présentation', type: 'landing', statut: 'livre', progression: 100, version: '', environnement: 'forgeme.net', techno: ['HTML', 'CSS'], ordre: 5, description: 'Hébergée chez OVH.' },
    { id: 'backend', nom: 'Backend et infrastructure', type: 'backend', statut: 'en-cours', progression: 96, version: '', environnement: 'Firebase', techno: ['Cloud Functions', 'Firestore', 'Storage', 'Stripe', 'RevenueCat', 'Brevo'], ordre: 6, description: 'Règles de sécurité, fonctions, abonnements et e-mails transactionnels.' },
  ],

  /* La feuille de route, relevée le 19 septembre 2026 dans les quatre
     dépôts (315 commits côté mobile depuis le 27 juillet 2025, 137 sur le
     web, 56 sur le site, 26 sur le tableau de bord) et dans les notes de
     suivi. Chaque étape porte ses vraies dates : c'est elles qui la
     rangent à l'écran, l'active d'abord puis la plus récente. */
  jalons: [

    /* --- Cadrage ---------------------------------------------------- */
    { id: 'cadrage', titre: 'Cadrage et maquettage', phase: 'Cadrage', statut: 'termine', progression: 100, ordre: 1,
      debut: '2025-07-27', fin: '2025-08-31',
      description: "Audit technique, business plan, maquettes. Dépôt ouvert le 27 juillet 2025." },

    /* --- Développement ---------------------------------------------- */
    { id: 'socle', titre: 'Socle applicatif', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2,
      debut: '2025-07-28', fin: '2025-09-30', composants: ['ios', 'android', 'backend'],
      description: "Authentification, modèle de données Firestore, navigation, thème, synchronisation, et la traduction en six langues posée dès l'origine." },

    { id: 'fonctions', titre: 'Fonctionnalités principales', phase: 'Développement', statut: 'termine', progression: 100, ordre: 3,
      debut: '2025-08-01', fin: '2025-10-31', composants: ['ios', 'android', 'web'],
      description: "Objectifs et sous-objectifs, tâches et récurrences, rituels, journal, idées, dates importantes, listes de courses, notes rapides, voyages." },

    { id: 'admin', titre: "Tableau de bord d'administration", phase: 'Développement', statut: 'termine', progression: 100, ordre: 4,
      debut: '2025-08-14', fin: '2026-08-25', composants: ['admin'],
      description: "Ouvert en août 2025, entièrement refondu le 13 août 2026 : dix-neuf points d'audit corrigés, plus aucune donnée inventée, pagination et recherche, modération réelle, page des revenus, journal des actions d'administration, export. Fonctions Cloud rapatriées dans le dépôt le 25 août 2026. En service sur admin.forgeme.net." },

    { id: 'web', titre: 'Application web', phase: 'Développement', statut: 'termine', progression: 100, ordre: 5,
      debut: '2025-11-04', fin: '2026-09-09', composants: ['web'],
      description: "Ouverte en novembre 2025, 137 versions. Même base Firestore que le mobile, connexion Google et Apple, abonnements. En ligne sur app.forgeme.net." },

    { id: 'landing', titre: 'Site de présentation forgeme.net', phase: 'Développement', statut: 'termine', progression: 100, ordre: 6,
      debut: '2026-01-13', fin: '2026-08-26', composants: ['landing'],
      description: "Six langues et 287 clés de traduction, détection de la langue à l'arrivée, deux codes QR de téléchargement, un par boutique. Audit complet le 15 juillet 2026." },

    { id: 'onboarding', titre: "Refonte du parcours d'entrée", phase: 'Développement', statut: 'termine', progression: 100, ordre: 7,
      debut: '2026-07-24', fin: '2026-07-27', composants: ['ios', 'android'],
      description: "Douze écrans, du prénom au badge : priorité, modules, quotidien, organisation, coaching, rappel, plan prêt, défi de sept jours. La création de contenu avant inscription a été supprimée au profit d'une activation de modules en cascade. Quatre-vingt-onze versions en un mois." },

    { id: 'packs', titre: 'Packs de démarrage', phase: 'Développement', statut: 'termine', progression: 100, ordre: 8,
      debut: '2026-07-25', fin: '2026-09-09', composants: ['ios', 'android', 'backend'],
      description: "Huit packs gratuits en six langues, installés à l'inscription : l'application n'ouvre plus sur un écran vide. Installation traçable et réversible. Une double installation découverte le 9 septembre 2026 a été corrigée ; le nettoyage des soixante-six doublons existants attend un feu vert." },

    { id: 'perso', titre: "Personnalisation pilotée par le parcours d'entrée", phase: 'Développement', statut: 'termine', progression: 100, ordre: 9,
      debut: '2026-07-26', fin: '2026-07-27', composants: ['ios', 'android'],
      description: "La barre d'onglets, la rangée d'accueil et un écran de réglages dédié s'adaptent à l'orientation choisie à l'inscription. Journal et Idées restent accessibles même hors de la barre." },

    { id: 'taches', titre: 'Fiabilisation de la synchronisation des tâches', phase: 'Développement', statut: 'termine', progression: 100, ordre: 10,
      debut: '2026-07-27', fin: '2026-09-09', composants: ['ios', 'android', 'web', 'backend'],
      description: "Coches et suppressions qui revenaient, créations qui disparaissaient, archivage quotidien, compteurs d'usage. Puis la fenêtre de mille tâches retirée le 9 septembre 2026 : les deux plateformes lisent désormais page par page, sans plafond." },

    { id: 'bugs-sept', titre: 'Anomalies remontées par le client', phase: 'Développement', statut: 'termine', progression: 100, ordre: 11,
      debut: '2026-09-04', fin: '2026-09-09', composants: ['ios', 'android', 'web', 'backend'],
      description: "Quatre anomalies corrigées et vérifiées sur un compte réel : tâches visibles sur le web et absentes du mobile, liste des anniversaires incomplète (quarante-neuf sur quatre-vingt-treize), contenus de pack décomptés du quota gratuit, objectif validé qui repassait en cours. Puis la régression du 9 septembre sur les tâches récurrentes, mesurée et corrigée le matin même." },

    /* --- Abonnements et paiements ------------------------------------ */
    { id: 'abonnements', titre: 'Abonnements dans les applications', phase: 'Abonnements et paiements', statut: 'termine', progression: 100, ordre: 12,
      debut: '2026-08-13', fin: '2026-08-13', composants: ['ios', 'android', 'backend'],
      description: "Six formules, changement de palier depuis l'application, badge d'essai gratuit, et attribution manuelle d'un plan depuis l'administration." },

    { id: 'abo-apple', titre: "Restructuration des groupes d'abonnement Apple", phase: 'Abonnements et paiements', statut: 'en-cours', progression: 60, ordre: 13,
      debut: '2026-08-13', fin: '2026-10-15', composants: ['ios'],
      description: "Premium et Ultra vivaient dans deux groupes séparés, ce qui interdisait tout changement de palier sans se retrouver avec deux abonnements en parallèle. Phase 1 faite : les trois Premium re-nivelés, les trois nouveaux Ultra créés dans le même groupe. Phase 2 en attente de l'approbation d'Apple." },

    { id: 'tarifs', titre: 'Grille tarifaire des deux boutiques', phase: 'Abonnements et paiements', statut: 'termine', progression: 100, ordre: 14,
      debut: '2026-08-25', fin: '2026-08-27', composants: ['ios', 'android', 'web'],
      description: "Premium à 2,99 la semaine, 9,99 le mois, 99,99 l'année ; Ultra à 4,99, 15,99 et 159,99. Cinq cent vingt-quatre tarifs planifiés sur cent soixante-quinze territoires côté Apple, appliqués le 27 août 2026." },

    { id: 'stripe', titre: 'Paiement par carte sur le web', phase: 'Abonnements et paiements', statut: 'termine', progression: 100, ordre: 15,
      debut: '2026-08-25', fin: '2026-08-27', composants: ['web', 'backend'],
      description: "Le web n'avait jamais encaissé : les sessions de paiement partaient en mode test, personne n'a jamais pu payer. Compte créé et activé le 27 août 2026, deux produits, six tarifs, un point de réception des événements, et les six parcours d'achat vérifiés jusqu'à l'encaissement." },

    { id: 'refonte-abo', titre: "Refonte de l'offre d'abonnement", phase: 'Abonnements et paiements', statut: 'planifie', progression: 0, ordre: 16,
      debut: '2026-10-01', fin: '2026-12-15', composants: ['ios', 'android', 'web', 'backend'],
      description: "Le socle technique fonctionne sur les trois canaux, c'est l'offre elle-même qui doit être reprise : paliers, contenu de chaque formule, essai, parcours de vente. Périmètre à cadrer avec le client avant tout développement." },

    /* --- Publication -------------------------------------------------- */
    { id: 'publication-ios', titre: "Publication sur l'App Store", phase: 'Publication', statut: 'termine', progression: 100, ordre: 17,
      debut: '2026-08-01', fin: '2026-09-04', composants: ['ios'],
      description: "Mise en conformité avec la règle 4 d'Apple sur Sign in with Apple : plus aucune porte n'exige un nom ou une adresse après connexion. Build 19 publié, train 1.0.0 clos par Apple, puis 1.1.0 et 1.1.2." },

    { id: 'publication', titre: 'Republication sur Google Play', phase: 'Publication', statut: 'bloque', progression: 60, ordre: 18,
      debut: '2026-08-12', fin: '2026-10-31', composants: ['android'],
      description: "Trois refus successifs : crash au démarrage en version 12 (un effet de flou invalide sur Android), gel du parcours d'entrée en version 13, puis suspension de la fiche. Package passé à net.forgeme.app le 23 août, puis retour sur com.forgeme.app en version 15 pour la republication. La fiche reste à rouvrir." },

    /* --- Tests --------------------------------------------------------- */
    { id: 'qa', titre: 'Campagne de tests', phase: 'Tests', statut: 'planifie', progression: 0, ordre: 19,
      debut: '2026-10-01', fin: '2026-11-15', composants: ['ios', 'android', 'web'],
      description: "Le plan de tests est écrit. Testeurs sur les trois plateformes, parcours automatisés, journal des anomalies. Deux parcours ne se vérifient qu'à la main : la connexion Google et Apple dans un vrai navigateur, et la réinitialisation de mot de passe de bout en bout." },

    /* --- Conformité et échéances --------------------------------------- */
    { id: 'api36', titre: "Passage à l'API Android 36", phase: 'Conformité et échéances', statut: 'planifie', progression: 0, ordre: 20,
      debut: '2026-09-22', fin: '2026-11-01', composants: ['android'],
      description: "Google Play l'exige depuis le 31 août 2026 pour tout nouveau dépôt ; un report au 1er novembre est accordable depuis la console. Montée de React Native 0.80.2 vers 0.81 et reprise des dépendances natives, affichage bord à bord imposé, campagne de non-régression sur les deux plateformes puisque l'opération touche aussi iOS. Quatre à six jours." },

    { id: 'regles', titre: 'Règles de sécurité de la base', phase: 'Conformité et échéances', statut: 'planifie', progression: 50, ordre: 21,
      debut: '2026-08-13', fin: '2026-10-31', composants: ['backend'],
      description: "La production tourne encore en règles ouvertes à tout compte connecté : n'importe quel utilisateur peut écrire dans les abonnements. Les règles unifiées sont écrites et compilées depuis le 13 août 2026, elles restent à déployer avec un cycle de vérification." },

    { id: 'fonctions-perdues', titre: 'Fonctions serveur sans code source', phase: 'Conformité et échéances', statut: 'a-venir', progression: 0, ordre: 22,
      debut: '2026-10-01', fin: '2026-12-31', composants: ['backend'],
      description: "Dix-huit fonctions tournent en production sans code dans aucun dépôt : distribution des points, badges, classement, sécurité des connexions, maintenance et migrations. Cherchées dans les cinq dépôts, dans l'historique de chacun et dans le code compilé, elles sont introuvables. Seule voie de récupération : l'archive que Google conserve à chaque déploiement." },

    { id: 'cgv', titre: 'Dette des conditions de vente', phase: 'Conformité et échéances', statut: 'a-venir', progression: 0, ordre: 23,
      debut: '2026-10-01', fin: '2026-12-31', composants: ['web', 'backend'],
      description: "Trois mécanismes exigés par la vente directe, retirés du texte pour qu'il ne promette que du réel : la renonciation au droit de rétractation à la commande, la facturation automatique par courriel, le préavis avant toute hausse et le rappel annuel de non-reconduction prévu par le code de la consommation." },

    /* --- Évolutions ----------------------------------------------------- */
    { id: 'sync-web-mobile', titre: 'Réconciliation du web et du mobile', phase: 'Évolutions', statut: 'a-venir', progression: 0, ordre: 24,
      debut: '2026-11-01', fin: '2027-01-31', composants: ['ios', 'android', 'web'],
      description: "Listes de courses et notes rapides vivent dans la mémoire de l'appareil côté mobile et dans la base côté web : rien ne traverse, et la donnée est perdue à la désinstallation. Le carnet de contacts et le tableau de dessin n'existent que sur le web." },

    { id: 'brevo', titre: "Domaine expéditeur des courriels", phase: 'Évolutions', statut: 'bloque', progression: 0, ordre: 25,
      debut: '2026-08-25', fin: '2026-10-31', composants: ['backend'],
      description: "Les courriels de l'application partent encore d'une adresse personnelle, codes de vérification et réinitialisations de mot de passe compris. Il faut une clé d'envoi et trois entrées dans la zone du domaine, dont une signature de plusieurs centaines de caractères. La zone appartient au client." },

    { id: 'blog', titre: 'Blog et contenus éditoriaux', phase: 'Évolutions', statut: 'a-venir', progression: 0, ordre: 26,
      debut: '2026-11-01', fin: '2027-01-31', composants: ['landing', 'admin'],
      description: "Une dizaine d'articles de fond signés de l'équipe, avec une illustration chacun, gérés depuis le tableau de bord. Demandé le 23 août 2026." },

    { id: 'maintenance', titre: 'Maintenance et évolutions', phase: 'Évolutions', statut: 'a-venir', progression: 0, ordre: 27,
      debut: '2026-11-15', fin: '2027-06-30', composants: ['ios', 'android', 'web', 'backend'],
      description: "Suivi des versions, des échéances des boutiques et des remontées d'utilisateurs, une fois la publication Android rouverte et la campagne de tests passée." },
  ],

  liens: [
    { id: 'site', nom: 'Site public ForgeMe', categorie: 'production', url: 'https://forgeme.net', environnement: 'Production', composant: 'landing', visibilite: 'client' },
    { id: 'appstore', nom: 'App Store', categorie: 'mobile', url: 'https://apps.apple.com/app/forgeme', environnement: 'Production', composant: 'ios', visibilite: 'client', description: 'Version 1.1.2 en ligne.' },
    { id: 'playstore', nom: 'Google Play', categorie: 'mobile', url: 'https://play.google.com/store/apps/details?id=com.forgeme.app', environnement: 'Production', composant: 'android', visibilite: 'client', description: 'Version 1.0.15, republication en cours.' },
    { id: 'depot-app', nom: 'Dépôt application mobile', categorie: 'code', url: 'https://github.com/Nadir-Bensalah/forgeme_app', composant: 'ios', visibilite: 'interne' },
    { id: 'depot-web', nom: 'Dépôt application web', categorie: 'code', url: 'https://github.com/Nadir-Bensalah/forgeme_web', composant: 'web', visibilite: 'interne' },
    { id: 'depot-admin', nom: 'Dépôt tableau de bord', categorie: 'code', url: 'https://github.com/Nadir-Bensalah/forgeme_dashboard', composant: 'admin', visibilite: 'interne' },
    { id: 'depot-landing', nom: 'Dépôt page de présentation', categorie: 'code', url: 'https://github.com/Nadir-Bensalah/forgeme_landing_page', composant: 'landing', visibilite: 'interne' },
  ],

  releases: [
    { id: 'ios-112', plateforme: 'ios', composant: 'ios', version: '1.1.2', titre: 'Build 23', statut: 'disponible', visibilite: 'client',
      notes: [
        { type: 'correction', texte: 'Lecture complète des tâches par pages, plus de fenêtre limitée' },
        { type: 'correction', texte: 'Orientation verrouillée en portrait' },
        { type: 'amelioration', texte: 'Grille tarifaire des abonnements alignée' },
      ],
      liens: { store: 'https://apps.apple.com/app/forgeme' } },
    { id: 'android-1015', plateforme: 'android', composant: 'android', version: '1.0.15', titre: 'Version 15', statut: 'soumise', visibilite: 'client',
      notes: [{ type: 'technique', texte: 'Retour à l\'identifiant com.forgeme.app pour la republication' }],
      liens: { store: 'https://play.google.com/store/apps/details?id=com.forgeme.app' } },
    { id: 'ios-120', plateforme: 'ios', composant: 'ios', version: '1.2.0', titre: 'En préparation', statut: 'developpement', visibilite: 'client',
      notes: [
        { type: 'correction', texte: 'Validation des tâches de la veille' },
        { type: 'amelioration', texte: 'Indicateurs de chargement dans les fenêtres de saisie' },
      ] },
  ],

  reunions: [
    { id: 'point-21-09', titre: 'Point projet', date: REUNION, duree: 60, visibilite: 'client',
      ordreDuJour: "1. Point sur la republication Android\n2. Validation des tâches de la veille : correction et version 1.2\n3. Campagne de tests : périmètre et calendrier\n4. Espace de suivi client : prise en main\n5. Prochaines étapes",
      participants: [] },
  ],

  notes: [
    { id: 'espace-suivi', type: 'information', titre: 'Ouverture de l\'espace de suivi client', contenu: "Le suivi du projet passe désormais par cet espace : demandes, avancement, fichiers, versions, devis et factures. Les échanges par messagerie restent possibles, mais tout ce qui engage le projet est consigné ici.", visibilite: 'client' },
    { id: 'android-refus', type: 'risque', titre: 'Publication Android bloquée par Google', contenu: "Google a refusé la publication. La version 15 est prête et repart sur l'identifiant com.forgeme.app.", impact: 'Décalage de la mise en ligne Android.', visibilite: 'client' },
    { id: 'abonnements', type: 'decision', titre: 'Restructuration des abonnements en deux phases', contenu: "L'offre Ultra rejoint le groupe Premium. La phase 1 est soumise à Apple, la phase 2 suit une fois validée.", visibilite: 'client' },
  ],

  blocages: [
    { id: 'google', titre: 'Publication Android en attente', description: 'Refus de Google sur la dernière soumission. Republication préparée sur com.forgeme.app.', responsable: 'capmedia', impact: 'La version Android reste en 1.0.15.', visibilite: 'client' },
  ],

  taches: [
    { id: 't-veille', titre: 'Corriger la validation des tâches de la veille', statut: 'en-cours', priorite: 'bloquante', composant: 'ios', jalon: 'publication', progression: 70, visibilite: 'client', description: "Une tâche cochée sur un jour passé repasse en non validée. Correction identifiée, livraison dans la 1.2." },
    { id: 't-android', titre: 'Republier la version Android', statut: 'bloquee', priorite: 'importante', composant: 'android', jalon: 'publication', progression: 40, visibilite: 'client' },
    { id: 't-12', titre: 'Publier la version 1.2 sur TestFlight', statut: 'a-faire', priorite: 'importante', composant: 'ios', jalon: 'publication', visibilite: 'client' },
    { id: 't-qa', titre: 'Préparer la campagne de tests', statut: 'a-faire', priorite: 'normale', jalon: 'qa', visibilite: 'client', description: 'Environnement de test dédié, parcours automatisés, recrutement des testeurs.' },
    { id: 't-abo2', titre: 'Phase 2 de la restructuration des abonnements', statut: 'attente-client', priorite: 'normale', composant: 'backend', jalon: 'abonnements', visibilite: 'client', description: "En attente de la validation Apple sur la phase 1." },
  ],
};

const appeler = async (corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, ...corps }) });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte */ }
  return { code: r.status, texte, json };
};

const r = await appeler({ action: 'remplirProjet', id: PROJET, adressesAttendues: ADRESSES_ATTENDUES, contenu });
if (r.code !== 200) { console.error('Remplissage refusé :', r.code, r.texte); process.exit(1); }
console.log('Projet rempli.');
console.log('  adresses vues sur le projet :', (r.json.adressesVues || []).join(', ') || 'aucune');
for (const [quoi, n] of Object.entries(r.json.compte || {})) console.log(`  ${quoi} : ${n}`);
console.log('\nLe projet est en sourdine : aucun e-mail ne part.');
console.log('Levez-la depuis le cockpit, Modifier, quand l\'espace est prêt à être montré.');
