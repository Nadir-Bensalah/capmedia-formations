/* ==========================================================================
   CAPMEDIA ACADEMY · Paiement et badges de possession

   Deux régimes, selon la session :
   · Visiteur anonyme : les liens de paiement statiques (window.AZ.liens).
   · Client CONNECTÉ : une session Checkout créée côté serveur, avec son
     e-mail VERROUILLÉ (Apple Pay / Google Pay ne peuvent plus imposer une
     autre adresse), le double achat refusé, et la montée Essentiel vers
     Complet au prorata. Le serveur est seul juge des prix.

   États affichés quand on est connecté :
   · Offre possédée -> « Déjà achetée · Ouvrir » (aucun re-paiement possible)
   · Essentiel possédé -> le bouton Complet devient « Passer à la Complète »
     au prix prorata calculé par le serveur
   · Cartes cross-sell -> badge « À toi »
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const cfg = window.AZ || {};
const liens = cfg.liens || {};
const BASE_FN = 'https://europe-west1-capmedia-academy.cloudfunctions.net';
const URL_PACK = `${BASE_FN}/creerCheckoutPack`;
const URL_FORMATION = `${BASE_FN}/creerCheckoutFormation`;

let utilisateurCourant = null;

/* La page peut vivre à la racine (/), dans /formations/, /en/ ou
   /en/formations/ : les liens vers l'app et la connexion se calculent. */
const PREFIXE = location.pathname.includes('/en/formations/') ? '../../'
  : (location.pathname.includes('/formations/') || location.pathname.includes('/en/')) ? '../' : './';
const versApp = (slug) => `${PREFIXE}app/?f=${encodeURIComponent(slug)}`;
const versAcces = () => `${PREFIXE}acces.html`;

/* Anti-course : un clic d'achat dans la première seconde ne doit pas
   partir en anonyme alors qu'une session existe. On attend le premier
   état d'authentification (ou 1,6 s au pire). */
let resoudreAuth;
const authPrete = new Promise((r) => { resoudreAuth = r; });
setTimeout(() => resoudreAuth && resoudreAuth(), 1600);

const patiente = (b, texte) => { b.dataset.txt = b.textContent; b.disabled = true; b.textContent = texte; };
const relache = (b, texte) => {
  b.textContent = texte || b.dataset.txt || b.textContent;
  b.disabled = false;
  if (texte) setTimeout(() => { b.textContent = b.dataset.txt; }, 2400);
};

/* --- 1. Boutons d'achat à l'unité ---------------------------------------- */
document.querySelectorAll('[data-achat]').forEach((b) => {
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    const [formation, offre] = b.getAttribute('data-achat').split(':');
    await authPrete;

    /* Connecté : session serveur, e-mail verrouillé, doublon refusé. */
    if (utilisateurCourant) {
      patiente(b, 'Un instant…');
      try {
        const r = await fetch(URL_FORMATION, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: await utilisateurCourant.getIdToken(),
            formation, offre,
          }),
        });
        const d = await r.json();
        if (d.deja) { window.location.href = versApp(formation); return; }
        if (d.url) { window.location.href = d.url; return; }
        throw new Error(d.erreur || 'réponse inattendue');
      } catch (err) {
        console.error(err);
        relache(b, 'Réessaie dans un instant');
      }
      return;
    }

    /* Anonyme : lien statique. */
    const url = liens[`${formation}:${offre}`];
    if (url) { window.location.href = url; return; }
    relache(b, 'Paiement bientôt disponible');
  });
});

/* Rappel discret aux anciens clients non connectés : se connecter évite
   le double achat et donne les prix personnalisés. */
authPrete.then(() => setTimeout(() => {
  if (utilisateurCourant) return;
  document.querySelectorAll('.cartes-prix').forEach((grille) => {
    if (grille.parentNode.querySelector('.note-deja-client')) return;
    const p = document.createElement('p');
    p.className = 'note-deja-client t-micro t-3 t-centre';
    p.style.marginTop = 'var(--e-3)';
    p.innerHTML = `Déjà client ? <a href="${versAcces()}">Connecte-toi</a> pour retrouver
      tes formations, tes prix personnalisés, et éviter tout double achat.`;
    grille.parentNode.insertBefore(p, grille.nextSibling);
  });
}, 400));

/* --- 2. Boutons pack ------------------------------------------------------ */
document.querySelectorAll('[data-pack]').forEach((b) => {
  const niveau = b.getAttribute('data-pack');
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    patiente(b, 'Un instant…');
    await authPrete;
    try {
      if (utilisateurCourant) {
        const r = await fetch(URL_PACK, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await utilisateurCourant.getIdToken(), niveau }),
        });
        const d = await r.json();
        if (d.deja === 'pack') { relache(b, 'Déjà à toi'); return; }
        if (d.url) { window.location.href = d.url; return; }
        throw new Error(d.erreur || 'réponse inattendue');
      }
      const url = liens[`pack:${niveau}`];
      if (url) { window.location.href = url; return; }
      window.location.href = versAcces();
    } catch (err) {
      console.error(err);
      relache(b, 'Réessaie dans un instant');
    }
  });
});

/* --- 3. État connecté : badges, verrous, prorata --------------------------- */
function marquerCarteAchetee(bouton, texteBadge) {
  const carte = bouton.closest('.carte');
  if (!carte || carte.querySelector('.mention-achetee')) return;
  const prix = carte.querySelector('.prix');
  if (prix) prix.style.display = 'none';
  const mention = document.createElement('p');
  mention.className = 'mention-achetee t-petit t-fort';
  mention.style.cssText = 'color:var(--valide,#2E8B57);display:flex;align-items:center;gap:6px';
  mention.textContent = texteBadge;
  if (prix && prix.parentNode) prix.parentNode.insertBefore(mention, prix);
  else carte.prepend(mention);
}

if (cfg.firebase && cfg.firebase.apiKey) {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
    const auth = getAuth(app);
    const bdd = getFirestore(app);

    onAuthStateChanged(auth, async (u) => {
      utilisateurCourant = u && u.email ? u : null;
      resoudreAuth();
      if (!utilisateurCourant) return;

      let fiche = null;
      try {
        const d = await getDoc(doc(bdd, 'acheteurs', u.email.toLowerCase()));
        fiche = d.exists() ? d.data() : null;
      } catch (e) { return; }
      if (!fiche) return;

      const achats = { ...(fiche.achats || {}) };
      if (fiche.offre && !achats.mobile) achats.mobile = fiche.offre;
      const aLePack = !!fiche.pack;

      /* Badges « À toi » sur les cartes cross-sell / catalogue */
      document.querySelectorAll('[data-slug]').forEach((carte) => {
        const slug = carte.getAttribute('data-slug');
        if (aLePack || achats[slug]) {
          const badge = carte.querySelector('.cf-possede');
          if (badge) badge.classList.remove('masque');
          carte.classList.add('est-possedee');
        }
      });

      /* Boutons de tarifs : verrou sur le possédé, prorata sur la montée */
      for (const b of document.querySelectorAll('[data-achat]')) {
        const [slug, offre] = b.getAttribute('data-achat').split(':');
        const niveau = achats[slug];
        const possede = fiche.pack === 'avance' ? 'complet'
          : (fiche.pack === 'basic' && !niveau) ? 'essentiel'
          : niveau || null;

        const couvert = possede === 'complet'
          || (possede === 'essentiel' && offre === 'essentiel');

        if (couvert) {
          b.textContent = 'Déjà achetée · Ouvrir';
          b.classList.remove('btn-principal');
          b.classList.add('btn-secondaire');
          marquerCarteAchetee(b, offre === 'complet' ? 'Offre Complète : à toi' : 'Offre Essentiel : à toi');
          continue;
        }

        /* Essentiel possédé, bouton Complet : la montée au prorata. */
        if (possede === 'essentiel' && offre === 'complet') {
          try {
            const r = await fetch(URL_FORMATION, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken: await u.getIdToken(), formation: slug, offre: 'complet', apercu: true,
              }),
            });
            const d = await r.json();
            if (d.upgrade && d.prix) {
              b.textContent = `Passer à la Complète · ${d.prix} €`;
              const carte = b.closest('.carte');
              const note = carte && carte.querySelector('.t-micro');
              if (note) note.textContent =
                `Ton prix : ${d.deduit} € déjà payés sur l'Essentiel, déduits.`;
            }
          } catch (e) { /* le clic passera quand même par le serveur */ }
        }
      }

      /* Prix du pack personnalisé (inchangé) */
      const cibles = document.querySelectorAll('[data-prix-pack]');
      if (cibles.length && !aLePack && Object.keys(achats).length) {
        for (const el of cibles) {
          const niveau = el.getAttribute('data-prix-pack');
          try {
            const r = await fetch(URL_PACK, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: await u.getIdToken(), niveau, apercu: true }),
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
