/* ==========================================================================
   CAPMEDIA ACADEMY · Configuration publique
   Ce fichier est PUBLIC (il part sur GitHub Pages). N'y mets JAMAIS de clé
   secrète : pas de sk_live_…, pas de whsec_…, pas de clé de service Firebase.
   Les clés Firebase « apiKey » ci-dessous sont publiques par conception -
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

  /* Liens de paiement de tout le catalogue (clé : "slug:offre" ou "pack:x") */
  liens: {
    'pack:parcours': 'https://buy.stripe.com/7sY28k7QE4hGelQd7m3cc0s',
    'site-web-ia:complet': 'https://buy.stripe.com/cNifZafj6cOcfpU0kA3cc0t',
    'automatiser-ia:complet': 'https://buy.stripe.com/cNi4gs2wkbK8elQ9Va3cc0u',
    'stripe:complet': 'https://buy.stripe.com/dRm28kc6UbK87Xs8R63cc0v',
    'micro-saas:complet': 'https://buy.stripe.com/6oUaEQgnadSgb9Egjy3cc0w',
  },

  /* --- Firebase --------------------------------------------------------- */
  // Console Firebase > Paramètres du projet > Tes applications > Web.
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
  urlAcces: 'https://academy.capmedia.app/acces.html',
  contact:  'contact@capmedia.tn',
};
