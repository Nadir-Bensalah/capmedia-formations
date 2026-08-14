/* ==========================================================================
   CAPMEDIA ACADEMY · Liste d'attente du lancement

   Un e-mail = un document attente/{email}. Création anonyme autorisée par
   les règles (jamais de lecture côté client) : la double inscription rend
   une erreur de permission, traitée comme « déjà inscrit ».
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const cfg = window.AZ || {};
const form = document.getElementById('form-attente');

if (form && cfg.firebase && cfg.firebase.apiKey) {
  const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
  const bdd = getFirestore(app);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const champ = document.getElementById('attente-email');
    const bouton = document.getElementById('attente-bouton');
    const email = champ.value.trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) return;

    bouton.disabled = true;
    bouton.textContent = 'Un instant…';
    const fini = (texte) => {
      form.innerHTML = `<p class="t-petit t-fort" style="color:var(--valide,#1AAE39)">${texte}</p>`;
    };
    try {
      await setDoc(doc(bdd, 'attente', email), {
        email,
        date: new Date().toISOString(),
        source: location.pathname.includes('/en/') ? 'accueil-en' : 'accueil',
        langue: location.pathname.includes('/en/') ? 'en' : 'fr',
      });
      fini('C\'est noté. Tu seras prévenu en premier, avant la hausse du tarif.');
    } catch (err) {
      /* permission-denied sur un doc existant = déjà inscrit : bonne nouvelle. */
      if (String(err && err.code).includes('permission')) {
        fini('Cette adresse est déjà sur la liste : tu seras prévenu en premier.');
      } else {
        bouton.disabled = false;
        bouton.textContent = 'Réessaie dans un instant';
        setTimeout(() => { bouton.textContent = 'Me prévenir'; }, 2500);
      }
    }
  });
}
