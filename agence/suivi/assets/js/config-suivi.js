/* Capmedia Digital · configuration publique de l'espace de suivi.

   L'espace de suivi vit sur le projet Firebase « Capmedia », distinct du
   projet « Capmedia-academy » qui porte les formations. Les deux ne
   partagent ni comptes, ni données, ni règles.

   La clé « apiKey » est publique par conception : ce sont les règles de
   sécurité Firestore et Storage qui protègent les données. */
window.AZ_SUIVI = {
  firebase: {
    apiKey:            'AIzaSyAfcMafIDTDkclh8zM1PWq40vflzlb-XsQ',
    authDomain:        'capmedia-1f90d.firebaseapp.com',
    projectId:         'capmedia-1f90d',
    storageBucket:     'capmedia-1f90d.firebasestorage.app',
    messagingSenderId: '816332425386',
    appId:             '1:816332425386:web:a2e0c1ef4cd08520a5e8d3',
  },
};
