/* ==========================================================================
   CAPMEDIA ACADEMY · Paiement et badges de possession (modèle Parcours)

   Trois façons d'accéder :
   · GRATUITES (github, prompting, claude-code) : un compte suffit, aucun
     paiement. Ces pages n'ont pas de bouton d'achat, seulement des liens
     vers la connexion.
   · LE PACK « Parcours Développeur d'Apps » : bouton [data-pack="parcours"],
     prix unique 297 €.
   · LES SOLOS (site-web-ia, automatiser-ia, stripe, micro-saas) : bouton
     [data-achat="slug:complet"], prix unique par formation.

   Deux régimes, selon la session :
   · Visiteur anonyme : les liens de paiement statiques (window.AZ.liens).
   · Client CONNECTÉ : une session Checkout créée côté serveur, avec son
     e-mail VERROUILLÉ (Apple Pay / Google Pay ne peuvent plus imposer une
     autre adresse) et le double achat refusé. Le serveur est seul juge
     des prix, et aiguille : gratuit -> l'app, parcours -> le pack.
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
const EN = location.pathname.includes('/en/');
const versApp = (slug) => `${PREFIXE}app/?f=${encodeURIComponent(slug)}`;
const versAcces = () => `${PREFIXE}acces.html`;
const versParcours = () => `${PREFIXE}index.html#parcours`;

const T = EN ? {
  instant: 'One moment…',
  reessaie: 'Try again in a moment',
  bientot: 'Payment available soon',
  dejaPack: 'Already yours',
  dejaOuvrir: 'Already yours · Open',
  aToi: 'Yours',
  dejaClient: (a) => `Already a member? <a href="${a}">Sign in</a> to find your
      courses and avoid any double purchase.`,
} : {
  instant: 'Un instant…',
  reessaie: 'Réessaie dans un instant',
  bientot: 'Paiement bientôt disponible',
  dejaPack: 'Déjà à toi',
  dejaOuvrir: 'Déjà à toi · Ouvrir',
  aToi: 'À toi',
  dejaClient: (a) => `Déjà membre ? <a href="${a}">Connecte-toi</a> pour retrouver
      tes formations et éviter tout double achat.`,
};

/* Anti-course : un clic d'achat dans la première seconde ne doit pas
   partir en anonyme alors qu'une session existe. */
let resoudreAuth;
const authPrete = new Promise((r) => { resoudreAuth = r; });
setTimeout(() => resoudreAuth && resoudreAuth(), 1600);

const patiente = (b, texte) => { b.dataset.txt = b.textContent; b.disabled = true; b.textContent = texte; };
const relache = (b, texte) => {
  b.textContent = texte || b.dataset.txt || b.textContent;
  b.disabled = false;
  if (texte) setTimeout(() => { b.textContent = b.dataset.txt; }, 2400);
};

/* --- 1. Boutons d'achat des formations à part (solos) --------------------- */
document.querySelectorAll('[data-achat]').forEach((b) => {
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    const [formation, offre] = b.getAttribute('data-achat').split(':');
    await authPrete;

    /* Connecté : session serveur, e-mail verrouillé, doublon refusé. */
    if (utilisateurCourant) {
      patiente(b, T.instant);
      try {
        const r = await fetch(URL_FORMATION, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: await utilisateurCourant.getIdToken(),
            formation,
          }),
        });
        const d = await r.json();
        if (d.gratuit) { window.location.href = versApp(formation); return; }
        if (d.parcours) { window.location.href = versParcours(); return; }
        if (d.deja) { window.location.href = versApp(formation); return; }
        if (d.url) { window.location.href = d.url; return; }
        throw new Error(d.erreur || 'réponse inattendue');
      } catch (err) {
        console.error(err);
        relache(b, T.reessaie);
      }
      return;
    }

    /* Anonyme : lien statique. */
    const url = liens[`${formation}:${offre || 'complet'}`];
    if (url) { window.location.href = url; return; }
    relache(b, T.bientot);
  });
});

/* Rappel discret aux membres non connectés. */
authPrete.then(() => setTimeout(() => {
  if (utilisateurCourant) return;
  document.querySelectorAll('.cartes-prix').forEach((grille) => {
    if (grille.parentNode.querySelector('.note-deja-client')) return;
    const p = document.createElement('p');
    p.className = 'note-deja-client t-micro t-3 t-centre';
    p.style.marginTop = 'var(--e-3)';
    p.innerHTML = T.dejaClient(versAcces());
    grille.parentNode.insertBefore(p, grille.nextSibling);
  });
}, 400));

/* --- 2. Le bouton du pack Parcours ---------------------------------------- */
document.querySelectorAll('[data-pack]').forEach((b) => {
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    patiente(b, T.instant);
    await authPrete;
    try {
      if (utilisateurCourant) {
        const r = await fetch(URL_PACK, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await utilisateurCourant.getIdToken() }),
        });
        const d = await r.json();
        if (d.deja === 'pack') { relache(b, T.dejaPack); return; }
        if (d.url) { window.location.href = d.url; return; }
        throw new Error(d.erreur || 'réponse inattendue');
      }
      const url = liens['pack:parcours'];
      if (url) { window.location.href = url; return; }
      window.location.href = versAcces();
    } catch (err) {
      console.error(err);
      relache(b, T.reessaie);
    }
  });
});

/* --- 3. État connecté : badges et verrous ---------------------------------- */
const PARCOURS = ['firebase', 'mobile', 'design-app', 'aso', 'seo-contenu'];
const GRATUITES = ['github', 'prompting', 'claude-code'];

function marquerCarteAchetee(bouton, texteBadge) {
  const carte = bouton.closest('.carte');
  if (!carte || carte.querySelector('.mention-achetee')) return;
  const prix = carte.querySelector('.prix');
  if (prix) prix.style.display = 'none';
  const mention = document.createElement('p');
  mention.className = 'mention-achetee t-petit t-fort';
  mention.style.cssText = 'color:var(--valide,#1AAE39);display:flex;align-items:center;gap:6px';
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

      const couvre = (slug) => GRATUITES.includes(slug)
        || (PARCOURS.includes(slug) ? (aLePack || !!achats[slug])
          : (!!achats[slug] || fiche.pack === 'avance'));

      /* Badges « À toi » sur les cartes */
      document.querySelectorAll('[data-slug]').forEach((carte) => {
        const slug = carte.getAttribute('data-slug');
        if (!GRATUITES.includes(slug) && couvre(slug)) {
          const badge = carte.querySelector('.cf-possede');
          if (badge) badge.classList.remove('masque');
          carte.classList.add('est-possedee');
        }
      });

      /* Boutons solos : verrou sur le possédé */
      for (const b of document.querySelectorAll('[data-achat]')) {
        const [slug] = b.getAttribute('data-achat').split(':');
        if (couvre(slug)) {
          b.textContent = T.dejaOuvrir;
          b.classList.remove('btn-principal');
          b.classList.add('btn-secondaire');
          b.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            window.location.href = versApp(slug);
          }, true);
          marquerCarteAchetee(b, T.aToi);
        }
      }

      /* Le pack possédé : les boutons deviennent des portes d'entrée. */
      if (aLePack) {
        for (const b of document.querySelectorAll('[data-pack]')) {
          b.textContent = T.dejaOuvrir;
          b.classList.remove('btn-principal');
          b.classList.add('btn-secondaire');
          b.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            window.location.href = versApp('firebase');
          }, true);
        }
      }
    });
  } catch (e) { /* la page de vente reste fonctionnelle sans Firebase */ }
}
