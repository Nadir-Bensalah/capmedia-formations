/* ==========================================================================
   CAPMEDIA ACADEMY — Connexion par lien magique (Firebase Auth, sans mot de passe)

   Déroulé :
   1. Le client paie sur Stripe.
   2. Le webhook Stripe (fonctions/index.js) écrit un document dans
      Firestore : acheteurs/{email en minuscules} = { offre, dateAchat }.
   3. Ici, le client saisit son e-mail → Firebase lui envoie un lien.
   4. Il clique → il revient sur cette page connecté → on l'envoie vers /app/.
   5. Les règles Firestore n'autorisent la lecture des leçons que si un
      document acheteurs/{son e-mail} existe. Le contenu n'est donc jamais
      exposé publiquement, même en connaissant l'URL.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

const cfg = window.AZ;
const CLE_EMAIL = 'az:email-en-attente';

const $ = (id) => document.getElementById(id);
const formulaire  = $('formulaire');
const champEmail  = $('email');
const bouton      = $('envoyer');
const msgOk       = $('msg-ok');
const msgOkCorps  = $('msg-ok-corps');
const msgErr      = $('msg-err');
const msgErrCorps = $('msg-err-corps');
const chargement  = $('chargement');
const titre       = $('titre');
const sousTitre   = $('sous-titre');

/* --- Affichage ----------------------------------------------------------- */
function afficherOk(html) {
  msgErr.classList.add('masque');
  msgOkCorps.innerHTML = html;
  msgOk.classList.remove('masque');
}
function afficherErreur(html) {
  msgOk.classList.add('masque');
  msgErrCorps.innerHTML = html;
  msgErr.classList.remove('masque');
}
function masquerFormulaire() {
  formulaire.classList.add('masque');
}

/* --- Garde-fou de configuration ------------------------------------------ */
if (!cfg || !cfg.firebase || !cfg.firebase.apiKey) {
  masquerFormulaire();
  afficherErreur(
    "<b>Firebase n'est pas encore configuré.</b><br>" +
    "Renseigne l'objet <code>firebase</code> dans <code>assets/js/config.js</code>. " +
    "Voir <code>docs/mise-en-place.md</code>."
  );
  throw new Error('Configuration Firebase absente');
}

const app  = initializeApp(cfg.firebase);
const auth = getAuth(app);
auth.languageCode = 'fr';

const parametresLien = {
  url: cfg.urlAcces || window.location.href.split('?')[0],
  handleCodeInApp: true,
};

/* --- Cas 1 : l'utilisateur revient en cliquant sur le lien reçu ---------- */
if (isSignInWithEmailLink(auth, window.location.href)) {
  masquerFormulaire();
  chargement.classList.remove('masque');

  let email = window.localStorage.getItem(CLE_EMAIL);

  // Cas où il ouvre le lien sur un autre appareil que celui de la demande.
  if (!email) {
    email = window.prompt('Confirme ton adresse e-mail pour terminer la connexion :');
  }

  if (!email) {
    chargement.classList.add('masque');
    formulaire.classList.remove('masque');
    afficherErreur("Il me faut ton adresse e-mail pour valider le lien. Recommence ci-dessus.");
  } else {
    signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href)
      .then(() => {
        window.localStorage.removeItem(CLE_EMAIL);
        window.location.replace('./app/');
      })
      .catch((err) => {
        chargement.classList.add('masque');
        formulaire.classList.remove('masque');
        console.error(err);

        const messages = {
          'auth/invalid-action-code':
            "Ce lien a expiré ou a déjà été utilisé. Redemande-en un ci-dessous, c'est immédiat.",
          'auth/invalid-email':
            "Cette adresse ne semble pas valide.",
        };
        afficherErreur(
          messages[err.code] ||
          "La connexion a échoué. Redemande un lien, ou écris-moi si ça persiste."
        );
      });
  }
}

/* --- Cas 2 : déjà connecté → on file directement à la formation ---------- */
else {
  onAuthStateChanged(auth, (utilisateur) => {
    if (utilisateur) {
      titre.textContent = 'Content de te revoir';
      sousTitre.textContent = 'Tu es déjà connecté. On te redirige vers ta formation…';
      masquerFormulaire();
      chargement.classList.remove('masque');
      setTimeout(() => window.location.replace('./app/'), 500);
    }
  });
}

/* --- Cas 3 : demande d'un lien ------------------------------------------- */
formulaire.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = champEmail.value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    afficherErreur('Vérifie ton adresse e-mail, elle a l’air incomplète.');
    champEmail.focus();
    return;
  }

  bouton.disabled = true;
  bouton.textContent = 'Envoi en cours…';

  try {
    await sendSignInLinkToEmail(auth, email, parametresLien);
    window.localStorage.setItem(CLE_EMAIL, email);

    masquerFormulaire();
    afficherOk(
      '<b>C’est envoyé.</b><br>' +
      'Ouvre le message reçu à <b>' + email + '</b> et clique sur le lien pour entrer. ' +
      'Pense à regarder dans les indésirables — c’est souvent là qu’il se cache la première fois.'
    );
  } catch (err) {
    console.error(err);
    bouton.disabled = false;
    bouton.textContent = 'Recevoir mon lien de connexion';

    const messages = {
      'auth/invalid-email':
        'Cette adresse ne semble pas valide.',
      'auth/too-many-requests':
        'Trop de demandes coup sur coup. Attends deux minutes et réessaie.',
      'auth/unauthorized-continue-uri':
        "Le domaine de ce site n'est pas encore autorisé dans Firebase " +
        '(Authentication → Settings → Authorized domains).',
    };
    afficherErreur(
      messages[err.code] ||
      "L'envoi a échoué. Réessaie dans un instant, ou écris-moi à " +
      '<a href="mailto:' + (cfg.contact || 'contact@capmedia.tn') + '">' +
      (cfg.contact || 'contact@capmedia.tn') + '</a>.'
    );
  }
});
