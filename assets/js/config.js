/* ==========================================================================
   CAPMEDIA ACADEMY — Configuration publique
   Ce fichier est PUBLIC (il part sur GitHub Pages). N'y mets JAMAIS de clé
   secrète : pas de sk_live_…, pas de whsec_…, pas de clé de service Firebase.
   Les clés Firebase « apiKey » ci-dessous sont publiques par conception —
   c'est le rôle des règles de sécurité Firestore de protéger les données.
   ========================================================================== */

window.AZ = {

  /* --- Offre ------------------------------------------------------------ */
  offre: {
    // Fin du tarif de lancement, au format ISO. Passe la date pour prolonger.
    finLancement: '2026-09-15T23:59:59+02:00',
  },

  /* --- Stripe ----------------------------------------------------------- */
  // Colle ici les URL de tes Payment Links Stripe (voir docs/stripe.md).
  // Tant qu'elles sont vides, les boutons affichent un message d'attente.
  stripe: {
    essentiel: 'https://buy.stripe.com/test_bJe28reMLaIU0GKgPifMA00',
    complet:   'https://buy.stripe.com/test_00w8wPawvcR22OScz2fMA01',
  },

  /* --- Firebase --------------------------------------------------------- */
  // Récupère cet objet dans la console Firebase → Paramètres du projet →
  // Tes applications → Application Web.
  firebase: {
    apiKey:            'AIzaSyBcVqIBbJnYUC2yTG_DxzOB4kXH0I8r0tE',
    authDomain:        'capmedia-academy.firebaseapp.com',
    projectId:         'capmedia-academy',
    storageBucket:     'capmedia-academy.firebasestorage.app',
    messagingSenderId: '501640815738',
    appId:             '1:501640815738:web:1ac7082b16cf871d5687c3',
  },

  /* --- Divers ----------------------------------------------------------- */
  // URL absolue de la page qui reçoit le lien magique.
  urlAcces: 'https://nadir-bensalah.github.io/capmedia-formations/acces.html',
  contact:  'contact@capmedia.tn',
};
