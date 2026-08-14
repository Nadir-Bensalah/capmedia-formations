/* ==========================================================================
   CAPMEDIA DIGITAL · La demande de devis

   Le formulaire écrit directement dans Firestore (collection devis/,
   création anonyme seule : personne ne peut lire, les règles l'interdisent).
   Les demandes arrivent dans la console d'administration, onglet Devis.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, collection, addDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const formulaire = $('formulaire-devis');
if (formulaire) {
  const cfg = window.AZ || {};
  const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
  const bdd = getFirestore(app);
  const EN = location.pathname.includes('/en/');

  /* Présélection par l'URL : devis.html?type=audit-site-web */
  const type = new URLSearchParams(location.search).get('type');
  if (type) {
    const cible = formulaire.querySelector(`input[name="type"][value="${CSS.escape(type)}"]`);
    if (cible) cible.checked = true;
  }

  const erreur = (html) => {
    $('d-erreur').innerHTML = html
      ? `<aside class="encadre encadre--piege"><div><p class="t-petit">${html}</p></div></aside>`
      : '';
  };

  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur('');

    const donnees = {
      type: (formulaire.querySelector('input[name="type"]:checked') || {}).value || 'autre',
      message: $('d-message').value.trim(),
      nom: $('d-nom').value.trim(),
      email: $('d-email').value.trim().toLowerCase(),
      telephone: $('d-tel').value.trim(),
      entreprise: $('d-entreprise').value.trim(),
      date: new Date().toISOString(),
      langue: EN ? 'en' : 'fr',
      statut: 'nouveau',
    };

    if (donnees.message.length < 10) {
      erreur(EN ? 'Tell us a bit more about your project (a couple of sentences).'
        : 'Raconte-nous un peu plus ton projet (deux ou trois phrases).');
      $('d-message').focus();
      return;
    }
    if (!donnees.nom) { erreur(EN ? 'Your name is missing.' : 'Il manque ton nom.'); $('d-nom').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(donnees.email)) {
      erreur(EN ? 'This email address looks incomplete.' : 'Cette adresse e-mail a l\'air incomplète.');
      $('d-email').focus();
      return;
    }

    const bouton = $('d-envoyer');
    bouton.disabled = true;
    bouton.textContent = EN ? 'Sending…' : 'Envoi en cours…';

    try {
      await addDoc(collection(bdd, 'devis'), donnees);
      formulaire.classList.add('masque');
      $('d-merci').classList.remove('masque');
      $('d-merci').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error(err);
      bouton.disabled = false;
      bouton.textContent = EN ? 'Send my request' : 'Envoyer ma demande';
      erreur((EN
        ? 'Sending failed. Try again in a moment, or write to us directly at '
        : 'L\'envoi a échoué. Réessaie dans un instant, ou écris-nous directement à ')
        + '<a href="mailto:contact@capmedia.tn">contact@capmedia.tn</a>.');
    }
  });
}
