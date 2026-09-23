/* ==========================================================================
   CAPMEDIA CLIENT HUB · la porte d'entrée
   Contrat : docs/suivi.md

   Deux écrans, jamais plus : l'adresse, puis le code à six chiffres reçu
   dans la boîte. Le lien magique demandait d'être ouvert dans le
   navigateur qui l'avait demandé ; un code se demande ici, se lit
   là-bas, et se tape ici.

   Un lien d'invitation (?i=jeton) pose l'adresse tout seul : le client
   n'a rien à retaper. Le jeton ne donne aucun accès par lui-même, c'est
   le code reçu qui ouvre la session.

   Les anciens liens de connexion restent acceptés, le temps que les
   derniers partis dans une boîte arrivent au bout de leur heure.
   ========================================================================== */

import {
  auth, session, $, echapper, quitter, surEmulateur,
  isSignInWithEmailLink, signInWithEmailLink, sendSignInLinkToEmail,
} from './js/noyau.js';

const PORTE = surEmulateur
  ? 'http://127.0.0.1:5001/capmedia-1f90d/europe-west1/suiviConnexion'
  : 'https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviConnexion';

const CLE_EMAIL = 'suivi:email';
const ECRANS = ['#forme', '#forme-code', '#entree', '#attente'];
const montrer = (id) => ECRANS.forEach((s) => $(s).classList.toggle('masque', s !== id));

const erreur = (texte, genre = 'alerte') => {
  const zone = $('#erreur');
  if (!texte) { zone.classList.add('masque'); zone.innerHTML = ''; return; }
  zone.classList.remove('masque');
  zone.innerHTML = `<aside class="encart encart--${genre}"><div><p class="t-petit">${echapper(texte)}</p></div></aside>`;
};

const appeler = async (action, corps) => {
  const r = await fetch(PORTE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...corps }),
  });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { code: r.status, ...(json || {}) };
};

/* La porte par lien, gardée en second rideau. Elle sert si le service de
   codes est injoignable : personne ne doit rester dehors parce qu'une
   fonction n'a pas répondu. */
const envoyerLien = async (email) => {
  await sendSignInLinkToEmail(auth, email, {
    url: `${location.origin}${location.pathname}${location.search}`,
    handleCodeInApp: true,
  });
  try { localStorage.setItem(CLE_EMAIL, email); } catch (e) { /* stockage refusé */ }
};

/* --- Où va-t-on, une fois la session ouverte ---------------------------- */

const orienter = async () => {
  const { utilisateur, equipe, testeur, erreur: refus } = await session();
  if (!utilisateur) { montrer('#forme'); return; }

  /* Une destination demandée avant la connexion est honorée, à condition
     qu'elle reste dans cet espace : jamais de renvoi vers l'extérieur. */
  const demande = new URLSearchParams(location.search).get('retour');
  if (demande && /^\/suivi\/[\w./?=&#%-]*$/.test(demande)) { location.replace(demande); return; }

  if (equipe) { location.replace('./cockpit'); return; }
  /* Le testeur avant le client : il n'est membre d'aucun projet, donc la
     lecture des projets lui est refusée et il tomberait sur l'écran
     d'attente sans comprendre pourquoi. */
  if (testeur) { location.replace('./testeur'); return; }
  if (!refus) { location.replace('./hub'); return; }

  const bloc = document.querySelector('#attente .encart p:last-child');
  if (bloc) bloc.textContent = "Vos projets n'ont pas pu être lus. Prévenez-nous, nous vérifions le rattachement de votre compte.";
  montrer('#attente');
};

/* --- L'adresse ----------------------------------------------------------- */

const champ = $('#email');
const champCode = $('#code');
let adresse = '';

/* Le lien d'invitation pose l'adresse et dit où l'on arrive. */
const lireInvitation = async () => {
  const jeton = new URLSearchParams(location.search).get('i');
  if (!jeton) return;
  let r;
  try { r = await appeler('invitation', { jeton }); } catch (e) { return; }
  if (!r.ok || !r.email) {
    erreur("Ce lien d'invitation n'est plus valable. Saisissez votre adresse, le code arrivera quand même.", 'attention');
    return;
  }
  champ.value = r.email;
  champ.readOnly = true;
  const aide = $('#aide-invitation');
  aide.classList.remove('masque');
  aide.textContent = r.projet
    ? `Invitation pour ${r.projet}. Le code part à cette adresse.`
    : 'Le code part à cette adresse.';
  const titre = document.querySelector('.porte-boite h1');
  if (titre && r.nom) titre.textContent = `Bonjour ${r.nom.split(' ')[0]}`;
};

const demander = async (bouton, libelle) => {
  erreur('');
  adresse = champ.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse)) {
    erreur("Cette adresse a l'air incomplète.");
    champ.focus();
    return false;
  }
  bouton.disabled = true;
  const avant = bouton.textContent;
  bouton.textContent = 'Envoi...';
  try {
    let r;
    try { r = await appeler('demanderCode', { email: adresse }); }
    catch (reseau) { r = { code: 0 }; }

    /* Service injoignable, ou pas encore en ligne : on bascule sur le lien
       sans rien demander à personne. L'ordre de mise en ligne du serveur
       et de la page cesse ainsi de pouvoir enfermer quelqu'un dehors. */
    if (r.code === 0 || r.code === 404 || r.code >= 500) {
      try {
        await envoyerLien(adresse);
        erreur("Le service de codes est momentanément indisponible. Un lien de connexion vient de partir : ouvrez-le depuis ce navigateur.", 'attention');
      } catch (e2) {
        erreur('La connexion au réseau a échoué. Vérifiez votre accès à Internet.');
      }
      return false;
    }

    if (!r.ok) { erreur(r.message || "L'envoi a échoué. Réessayez dans un instant."); return false; }
    try { localStorage.setItem(CLE_EMAIL, adresse); } catch (e) { /* stockage refusé */ }
    $('#rappel-email').textContent = adresse;
    montrer('#forme-code');
    champCode.value = '';
    setTimeout(() => champCode.focus(), 60);
    return true;
  } finally {
    bouton.disabled = false;
    bouton.textContent = libelle || avant;
  }
};

$('#forme').addEventListener('submit', (e) => { e.preventDefault(); demander($('#envoyer'), 'Recevoir mon code'); });
$('#renvoyer').addEventListener('click', () => demander($('#renvoyer'), 'Renvoyer un code'));
$('#recommencer').addEventListener('click', () => {
  erreur('');
  montrer('#forme');
  champ.readOnly = false;
  champ.value = '';
  champ.focus();
});

/* --- Le code -------------------------------------------------------------- */

/* Les six chiffres, et rien d'autre : un code colle depuis la boite arrive
   souvent avec des espaces ou un point final. */
champCode.addEventListener('input', () => {
  const propre = champCode.value.replace(/\D/g, '').slice(0, 6);
  if (propre !== champCode.value) champCode.value = propre;
  if (propre.length === 6) $('#forme-code').requestSubmit();
});

$('#forme-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur('');
  const code = champCode.value.replace(/\D/g, '');
  if (code.length !== 6) { erreur('Le code compte six chiffres.'); champCode.focus(); return; }

  const bouton = $('#valider');
  bouton.disabled = true;
  bouton.textContent = 'Connexion...';
  try {
    const r = await appeler('verifierCode', { email: adresse, code });
    if (!r.ok || !r.lien) {
      erreur(r.message || 'Code incorrect.');
      champCode.value = '';
      champCode.focus();
      return;
    }
    /* Le serveur rend un lien à usage unique que l'on consomme sur place :
       il n'a jamais transité par une boîte, il ne s'affiche nulle part, et
       Firebase le brûle après cette seule utilisation. */
    montrer('#entree');
    await signInWithEmailLink(auth, adresse, r.lien);
    try { localStorage.removeItem(CLE_EMAIL); } catch (e2) { /* rien */ }
    await orienter();
  } catch (e3) {
    /* Le code était bon mais la session n'a pas pu s'ouvrir : c'est une
       panne de notre côté, pas une erreur de l'utilisateur. On ouvre la
       porte de secours plutôt que de le laisser devant une porte close. */
    console.error('[suivi] connexion impossible :', e3 && e3.code, e3 && e3.message);
    erreur("Le code était bon, mais la session n'a pas pu s'ouvrir. Essayez le lien de connexion ci-dessous, et prévenez-nous.");
    montrer('#forme-code');
    $('#secours').classList.remove('masque');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Me connecter';
  }
});

/* --- Les anciens liens, encore acceptés ---------------------------------- */

if (isSignInWithEmailLink(auth, location.href)) {
  montrer('#entree');
  let memorisee = '';
  try { memorisee = localStorage.getItem(CLE_EMAIL) || ''; } catch (e) { /* rien */ }
  signInWithEmailLink(auth, memorisee.trim().toLowerCase(), location.href)
    .then(() => {
      try { localStorage.removeItem(CLE_EMAIL); } catch (e) { /* rien */ }
      history.replaceState(null, '', location.pathname);
      return orienter();
    })
    .catch(() => {
      montrer('#forme');
      erreur("Ce lien a expiré ou a déjà servi. Demandez un code, c'est plus simple.");
    });
} else {
  lireInvitation().then(orienter);
}

/* --- La porte de secours -------------------------------------------------- */

$('#par-lien').addEventListener('click', async () => {
  erreur('');
  const bouton = $('#par-lien');
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';
  try {
    await envoyerLien(adresse || champ.value.trim().toLowerCase());
    erreur('Le lien est parti. Ouvrez-le depuis ce navigateur.', 'ok');
  } catch (e) {
    erreur("L'envoi a échoué lui aussi. Prévenez-nous, nous ouvrons l'accès à la main.");
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Recevoir plutôt un lien de connexion';
  }
});

$('#deconnexion').addEventListener('click', quitter);
