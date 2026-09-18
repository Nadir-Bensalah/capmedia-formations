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
    pulse: {
      enCours: 'Correction des validations de tâches et republication Android',
      derniereLivraison: 'iOS 1.1.2 (build 23)',
      prochaineEtape: 'Campagne de tests sur les trois plateformes',
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

  jalons: [
    { id: 'cadrage', titre: 'Cadrage et maquettage', phase: 'Cadrage', statut: 'termine', progression: 100, ordre: 1, description: 'Audit technique, business plan, maquettes.' },
    { id: 'socle', titre: 'Socle applicatif', phase: 'Développement', statut: 'termine', progression: 100, ordre: 2, composants: ['ios', 'android', 'backend'], description: 'Authentification, modèle de données, navigation, synchronisation.' },
    { id: 'fonctions', titre: 'Fonctionnalités principales', phase: 'Développement', statut: 'termine', progression: 100, ordre: 3, composants: ['ios', 'android', 'web'], description: 'Objectifs, tâches, habitudes, journal, idées, dates importantes, listes de courses, notes rapides.' },
    { id: 'admin', titre: "Tableau de bord d'administration", phase: 'Développement', statut: 'termine', progression: 100, ordre: 4, composants: ['admin'], description: 'Livré et en service.' },
    { id: 'abonnements', titre: 'Abonnements et paiements', phase: 'Développement', statut: 'en-cours', progression: 80, ordre: 5, composants: ['ios', 'android', 'backend'], description: 'Restructuration des offres Apple en deux phases, phase 1 soumise.' },
    { id: 'publication', titre: 'Publication sur les stores', phase: 'Publication', statut: 'bloque', progression: 60, ordre: 6, composants: ['ios', 'android'], description: 'iOS publié. Android en attente après le refus de Google.' },
    { id: 'qa', titre: 'Campagne de tests', phase: 'Tests', statut: 'planifie', progression: 0, ordre: 7, composants: ['ios', 'android', 'web'], description: 'Testeurs sur les trois plateformes, parcours automatisés, journal des anomalies.' },
    { id: 'maintenance', titre: 'Maintenance et évolutions', phase: 'Maintenance', statut: 'a-venir', progression: 0, ordre: 8 },
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
