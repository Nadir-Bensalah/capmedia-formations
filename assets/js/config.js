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
  stripe: {
    essentiel: 'https://buy.stripe.com/7sY00cc6U5lK3Hcgjy3cc01',
    complet:   'https://buy.stripe.com/bJeaEQ2wk7tSdhM6IY3cc02',
  },

  /* Liens de paiement de tout le catalogue (clé : "slug:offre" ou "pack:x") */
  liens: {
    'github:essentiel': 'https://buy.stripe.com/bJe6oAdaYaG4a5A1oE3cc03',
    'github:complet': 'https://buy.stripe.com/7sYfZa2wkcOc7Xs4AQ3cc04',
    'claude-code:essentiel': 'https://buy.stripe.com/fZu6oAdaYaG491wgjy3cc05',
    'claude-code:complet': 'https://buy.stripe.com/3cI6oA5Iw6pOgtY2sI3cc06',
    'site-web-ia:essentiel': 'https://buy.stripe.com/3cI14gdaY7tScdIgjy3cc07',
    'site-web-ia:complet': 'https://buy.stripe.com/4gM4gs9YM5lK3Hc1oE3cc08',
    'automatiser-ia:essentiel': 'https://buy.stripe.com/eVq00c5IwcOc2D82sI3cc09',
    'automatiser-ia:complet': 'https://buy.stripe.com/5kQ28kdaYbK87Xsc3i3cc0a',
    'prompting:essentiel': 'https://buy.stripe.com/00wdR25Iw4hG5Pk9Va3cc0b',
    'prompting:complet': 'https://buy.stripe.com/4gM9AMfj66pOb9EaZe3cc0c',
    'firebase:essentiel': 'https://buy.stripe.com/aFa28k7QEeWkelQ4AQ3cc0d',
    'firebase:complet': 'https://buy.stripe.com/28EfZa1sg9C0a5A5EU3cc0e',
    'stripe:essentiel': 'https://buy.stripe.com/6oUdR2ef2cOc91w9Va3cc0f',
    'stripe:complet': 'https://buy.stripe.com/bJeaEQ8UI15uelQ1oE3cc0g',
    'aso:essentiel': 'https://buy.stripe.com/7sY00c4Es29ygtY4AQ3cc0h',
    'aso:complet': 'https://buy.stripe.com/aFa5kwc6U7tS4Lgd7m3cc0i',
    'design-app:essentiel': 'https://buy.stripe.com/9B64gsgna3dC3Hc9Va3cc0j',
    'design-app:complet': 'https://buy.stripe.com/aFa28kfj601q7Xs5EU3cc0k',
    'micro-saas:essentiel': 'https://buy.stripe.com/9B66oA2wk7tSdhMebq3cc0l',
    'micro-saas:complet': 'https://buy.stripe.com/9B69AMb2QeWk2D83wM3cc0m',
    'seo-contenu:essentiel': 'https://buy.stripe.com/28EeV6daYg0odhM6IY3cc0n',
    'seo-contenu:complet': 'https://buy.stripe.com/28E4gsef26pO3Hc2sI3cc0o',
    'pack:basic': 'https://buy.stripe.com/fZuaEQ3Ao01qa5A4AQ3cc0p',
    'pack:avance': 'https://buy.stripe.com/8x25kw3AobK85Pkffu3cc0q',
    'mobile:essentiel': 'https://buy.stripe.com/7sY00cc6U5lK3Hcgjy3cc01',
    'mobile:complet': 'https://buy.stripe.com/bJeaEQ2wk7tSdhM6IY3cc02'
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
