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
    essentiel: 'https://buy.stripe.com/test_eVqeVdeMLdV689c6aEfMA0q',
    complet:   'https://buy.stripe.com/test_dRmeVd1ZZ5oAexAcz2fMA0r',
  },

  /* Liens de paiement de tout le catalogue (clé : "slug:offre" ou "pack:x") */
  liens: {
    'github:essentiel': 'https://buy.stripe.com/test_fZu00j5cb04gfBE9mQfMA02',
    'github:complet': 'https://buy.stripe.com/test_14A28r6gfeZaahkeHafMA03',
    'claude-code:essentiel': 'https://buy.stripe.com/test_bJedR9bAz5oA0GK8iMfMA04',
    'claude-code:complet': 'https://buy.stripe.com/test_8x2aEX0VVaIUahkbuYfMA05',
    'site-web-ia:essentiel': 'https://buy.stripe.com/test_8x2eVdfQP5oAblo42wfMA06',
    'site-web-ia:complet': 'https://buy.stripe.com/test_4gM3cv343bMYblobuYfMA07',
    'automatiser-ia:essentiel': 'https://buy.stripe.com/test_00w7sL8on4kwgFI2YsfMA08',
    'automatiser-ia:complet': 'https://buy.stripe.com/test_bJe7sL8oneZadtwgPifMA09',
    'prompting:essentiel': 'https://buy.stripe.com/test_5kQ4gzgUT9EQahk1UofMA0a',
    'prompting:complet': 'https://buy.stripe.com/test_dRmdR91ZZ8AMahkfLefMA0b',
    'firebase:essentiel': 'https://buy.stripe.com/test_28E28rdIHeZacps8iMfMA0c',
    'firebase:complet': 'https://buy.stripe.com/test_6oU6oH1ZZaIUcps56AfMA0d',
    'stripe:essentiel': 'https://buy.stripe.com/test_3cI6oH1ZZdV64X02YsfMA0e',
    'stripe:complet': 'https://buy.stripe.com/test_28EeVddIH8AMexA6aEfMA0f',
    'aso:essentiel': 'https://buy.stripe.com/test_7sY9ATawvaIU4X0dD6fMA0g',
    'aso:complet': 'https://buy.stripe.com/test_eVqbJ18on5oA4X06aEfMA0h',
    'design-app:essentiel': 'https://buy.stripe.com/test_9B68wP343aIU1KO8iMfMA0i',
    'design-app:complet': 'https://buy.stripe.com/test_3cIeVdeML2coahkfLefMA0j',
    'micro-saas:essentiel': 'https://buy.stripe.com/test_3cI28rcED3gsgFI6aEfMA0k',
    'micro-saas:complet': 'https://buy.stripe.com/test_6oU5kDgUT8AM7582YsfMA0l',
    'seo-contenu:essentiel': 'https://buy.stripe.com/test_14A9AT7kj2co3SWdD6fMA0m',
    'seo-contenu:complet': 'https://buy.stripe.com/test_14AcN5awvcR21KOeHafMA0n',
    'pack:basic': 'https://buy.stripe.com/test_fZueVdawv04g9dg56AfMA0o',
    'pack:avance': 'https://buy.stripe.com/test_5kQ14ngUT7wIahk8iMfMA0p',
    'mobile:essentiel': 'https://buy.stripe.com/test_eVqeVdeMLdV689c6aEfMA0q',
    'mobile:complet': 'https://buy.stripe.com/test_dRmeVd1ZZ5oAexAcz2fMA0r'
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
