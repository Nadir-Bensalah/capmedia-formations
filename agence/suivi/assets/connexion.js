/* ==========================================================================
   ESPACE DE SUIVI · la porte d'entrée
   Contrat : docs/suivi.md

   Connexion par lien e-mail, comme l'académie : rien à retenir, rien à
   voler. Le rôle décide de la destination, et il vient de Firestore.
   ========================================================================== */

import {
  auth, session, $, echapper, avis, quitter,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from './noyau.js';

const CLE_EMAIL = 'suivi:email';
const forme = $('#forme');
const champ = $('#email');
const bouton = $('#envoyer');

const montrer = (id) => ['#forme', '#parti', '#entree', '#attente']
  .forEach((s) => $(s).classList.toggle('masque', s !== id));

const erreur = (texte) => {
  const zone = $('#erreur');
  if (!texte) { zone.classList.add('masque'); zone.innerHTML = ''; return; }
  zone.classList.remove('masque');
  zone.innerHTML = `<aside class="encadre encadre--piege"><div><p class="t-petit">${echapper(texte)}</p></div></aside>`;
};

/** Le lien de retour doit repasser par cette page, qui redirige ensuite. */
const parametresLien = {
  url: `${location.origin}${location.pathname}${location.search}`,
  handleCodeInApp: true,
};

/** Où va-t-on, une fois la session ouverte. */
const orienter = async () => {
  const { utilisateur, equipe, projets, erreur } = await session();
  if (!utilisateur) { montrer('#forme'); return; }

  // Une destination demandée avant la connexion est honorée, à condition
  // qu'elle reste dans cet espace : jamais de redirection vers l'extérieur.
  const demande = new URLSearchParams(location.search).get('retour');
  if (demande && /^\/suivi\/[\w./?=&-]*$/.test(demande)) {
    location.replace(demande);
    return;
  }

  if (equipe) { location.replace('./console'); return; }
  if (projets.length) { location.replace(`./projet?p=${encodeURIComponent(projets[0].id)}`); return; }

  // Liste vide par manque d’accès : le dire, plutôt que laisser croire
  // que le compte n'a simplement aucun projet.
  if (erreur) {
    const bloc = document.querySelector('#attente .encadre p:last-child');
    if (bloc) bloc.textContent = "Vos projets n’ont pas pu être lus. Merci de nous prévenir, nous vérifions le rattachement de votre compte.";
  }

  montrer('#attente');
};

/* --- Retour depuis le lien reçu par e-mail ------------------------------ */

if (isSignInWithEmailLink(auth, location.href)) {
  montrer('#entree');
  let email = '';
  try { email = localStorage.getItem(CLE_EMAIL) || ''; } catch (e) { /* stockage refusé */ }
  if (!email) {
    // Lien ouvert sur un autre appareil : on redemande l'adresse, c'est la
    // vérification qui empêche un lien intercepté de servir ailleurs.
    email = window.prompt('Confirmez votre adresse e-mail pour terminer la connexion') || '';
  }

  signInWithEmailLink(auth, email.trim().toLowerCase(), location.href)
    .then(() => {
      try { localStorage.removeItem(CLE_EMAIL); } catch (e) { /* rien */ }
      history.replaceState(null, '', location.pathname + location.search.replace(/[?&](apiKey|oobCode|mode|lang|continueUrl)=[^&]*/g, '').replace(/^&/, '?'));
      return orienter();
    })
    .catch(() => {
      montrer('#forme');
      erreur("La connexion a échoué. Ce lien a peut-être déjà servi ou expiré. Demandez-en un nouveau.");
    });
} else {
  orienter();
}

/* --- Demande d'un lien -------------------------------------------------- */

forme.addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur('');
  const email = champ.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    erreur("Cette adresse a l'air incomplète.");
    champ.focus();
    return;
  }

  bouton.disabled = true;
  bouton.textContent = 'Envoi...';
  try {
    await sendSignInLinkToEmail(auth, email, parametresLien);
    try { localStorage.setItem(CLE_EMAIL, email); } catch (e2) { /* rien */ }
    montrer('#parti');
  } catch (e3) {
    // On ne dit jamais si l'adresse est connue : ce serait renseigner un curieux.
    erreur("L'envoi a échoué. Réessayez dans un instant.");
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Recevoir mon lien de connexion';
  }
});

$('#recommencer').addEventListener('click', () => {
  erreur('');
  montrer('#forme');
  champ.value = '';
  champ.focus();
});

$('#deconnexion').addEventListener('click', quitter);
