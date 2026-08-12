/* ==========================================================================
   CAPMEDIA ACADEMY · Paiement et badges de possession

   Sur toutes les pages de vente :
   1. [data-achat="slug:offre"]  → lien de paiement Stripe (window.AZ.liens)
   2. [data-pack="basic|avance"] → connecté : checkout personnalisé (prorata
      serveur) ; sinon lien plein tarif, ou invitation à se connecter.
   3. Si l'utilisateur est connecté : ses formations portent le badge
      « À toi » et le prix personnalisé du pack s'affiche.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const cfg = window.AZ || {};
const liens = cfg.liens || {};
const URL_PACK = 'https://europe-west1-capmedia-academy.cloudfunctions.net/creerCheckoutPack';

/* --- 1. Boutons d'achat à l'unité ---------------------------------------- */
document.querySelectorAll('[data-achat]').forEach((b) => {
  const cle = b.getAttribute('data-achat');
  const url = liens[cle];
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (url) { window.location.href = url; return; }
    const t = b.textContent;
    b.textContent = 'Paiement bientôt disponible';
    setTimeout(() => { b.textContent = t; }, 2200);
  });
});

/* --- 2. Boutons pack ------------------------------------------------------ */
let jetonCourant = null;

document.querySelectorAll('[data-pack]').forEach((b) => {
  const niveau = b.getAttribute('data-pack');
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    const t = b.textContent;
    b.disabled = true;
    b.textContent = 'Un instant…';
    try {
      if (jetonCourant) {
        /* Connecté : le serveur calcule le prorata et crée la session. */
        const r = await fetch(URL_PACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: jetonCourant, niveau }),
        });
        const d = await r.json();
        if (d.deja === 'pack') { b.textContent = 'Déjà à toi'; return; }
        if (d.url) { window.location.href = d.url; return; }
        throw new Error(d.erreur || 'réponse inattendue');
      }
      /* Non connecté : lien plein tarif si présent, sinon connexion. */
      const url = liens[`pack:${niveau}`];
      if (url) { window.location.href = url; return; }
      window.location.href = './../acces.html';
    } catch (err) {
      console.error(err);
      b.textContent = 'Réessaie dans un instant';
      setTimeout(() => { b.textContent = t; b.disabled = false; }, 2200);
    }
  });
});

/* --- 3. État connecté : badges + prorata affiché --------------------------- */
if (cfg.firebase && cfg.firebase.apiKey) {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
    const auth = getAuth(app);
    const bdd = getFirestore(app);

    onAuthStateChanged(auth, async (u) => {
      if (!u || !u.email) return;
      jetonCourant = await u.getIdToken();

      let fiche = null;
      try {
        const d = await getDoc(doc(bdd, 'acheteurs', u.email.toLowerCase()));
        fiche = d.exists() ? d.data() : null;
      } catch (e) { return; }
      if (!fiche) return;

      const achats = { ...(fiche.achats || {}) };
      if (fiche.offre && !achats.mobile) achats.mobile = fiche.offre;
      const aLePack = !!fiche.pack;

      /* Badges « À toi » sur les cartes et neutralisation des CTA possédés */
      document.querySelectorAll('[data-slug]').forEach((carte) => {
        const slug = carte.getAttribute('data-slug');
        if (aLePack || achats[slug]) {
          const badge = carte.querySelector('.cf-possede');
          if (badge) badge.classList.remove('masque');
          carte.classList.add('est-possedee');
        }
      });
      document.querySelectorAll('[data-achat]').forEach((b) => {
        const [slug, offre] = b.getAttribute('data-achat').split(':');
        const niveau = achats[slug];
        const couvert = fiche.pack === 'avance'
          || (fiche.pack === 'basic' && offre === 'essentiel')
          || niveau === 'complet'
          || (niveau === 'essentiel' && offre === 'essentiel');
        if (couvert) {
          b.textContent = 'Déjà à toi · Ouvrir';
          b.onclick = (e) => { e.preventDefault(); window.location.href = '../app/?f=' + slug; };
        }
      });

      /* Prix du pack personnalisé, affiché depuis le calcul serveur */
      const cibles = document.querySelectorAll('[data-prix-pack]');
      if (cibles.length && !aLePack && Object.keys(achats).length) {
        for (const el of cibles) {
          const niveau = el.getAttribute('data-prix-pack');
          try {
            const r = await fetch(URL_PACK, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: jetonCourant, niveau, apercu: true }),
            });
            const d = await r.json();
            if (d.prix) {
              el.textContent = d.prix + ' €';
              const note = document.querySelector(`[data-note-pack="${niveau}"]`);
              if (note) note.innerHTML =
                `<strong>Ton prix</strong> : ${d.deja} € déjà investis, déduits · remise totale ${d.remisePct} %`;
            }
          } catch (e) { /* silencieux */ }
        }
      }
    });
  } catch (e) { /* la page de vente reste fonctionnelle sans Firebase */ }
}
