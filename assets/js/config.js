/* ==========================================================================
   ATELIER ZÉRO — Configuration publique
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
    essentiel: '', // ex. 'https://buy.stripe.com/xxxxxxxxxxxx'
    complet:   '', // ex. 'https://buy.stripe.com/yyyyyyyyyyyy'
  },

  /* --- Firebase --------------------------------------------------------- */
  // Récupère cet objet dans la console Firebase → Paramètres du projet →
  // Tes applications → Application Web.
  firebase: {
    apiKey:            '',
    authDomain:        '',
    projectId:         '',
    storageBucket:     '',
    messagingSenderId: '',
    appId:             '',
  },

  /* --- Divers ----------------------------------------------------------- */
  // URL absolue de la page qui reçoit le lien magique.
  urlAcces: 'https://nadir-bensalah.github.io/atelier-zero/acces.html',
  contact:  'contact@atelier-zero.fr',
};
