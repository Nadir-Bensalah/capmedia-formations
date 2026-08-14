/* ==========================================================================
   CAPMEDIA ACADEMY · Page merci intelligente

   Le retour de Stripe porte ?session_id=... : on interroge le serveur
   (infoSession) pour savoir À QUELLE ADRESSE l'achat est rattaché et ce
   qui a été acheté. Puis, selon la session Firebase :

   · Connecté avec la BONNE adresse : on observe la fiche acheteur en
     direct (onSnapshot) et dès que le webhook a écrit l'achat, on
     affiche « c'est dans ton espace » avec le bouton d'ouverture direct.
     Zéro e-mail, zéro re-connexion.
   · Connecté avec une AUTRE adresse : avertissement clair (l'achat est
     lié à B, tu es connecté en A) + envoi du lien d'accès vers B.
   · Non connecté : l'adresse exacte de l'achat est affichée (même si
     Apple Pay / Google Pay a fourni une adresse inattendue) + un bouton
     « M'envoyer mon lien d'accès » : plus aucun paiement orphelin.

   Sans session_id (anciens liens) : la page statique reste telle quelle.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const cfg = window.AZ || {};
const URL_INFO = 'https://europe-west1-capmedia-academy.cloudfunctions.net/infoSession';
const sessionId = new URLSearchParams(location.search).get('session_id');
const zone = document.getElementById('etat-achat');
const etapes = document.getElementById('etapes-email');

if (sessionId && zone && cfg.firebase && cfg.firebase.apiKey) {
  demarrer().catch((e) => console.error(e));
}

function rendre(html) { zone.innerHTML = html; zone.classList.remove('masque'); }
const echapper = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function demarrer() {
  rendre(`<div class="rang" style="gap:10px">
    <svg class="tourne" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--texte-3)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
    <span class="t-petit t-2">Vérification de ton achat…</span></div>`);

  let info = null;
  try {
    const r = await fetch(URL_INFO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    info = await r.json();
  } catch (e) { /* réseau : la page statique reste utilisable */ }

  if (!info || !info.email) { zone.classList.add('masque'); return; }

  const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
  const auth = getAuth(app);
  auth.languageCode = 'fr';
  const bdd = getFirestore(app);

  const lienOuverture = info.achat && info.achat.type === 'formation'
    ? `./app/?f=${encodeURIComponent(info.achat.formation)}` : './app/';
  const libelle = info.achat ? info.achat.libelle : 'ton achat';

  onAuthStateChanged(auth, (u) => {
    const emailSession = u && u.email ? u.email.toLowerCase() : null;

    /* --- Cas 1 : connecté avec la bonne adresse ------------------------- */
    if (emailSession && emailSession === info.email) {
      if (etapes) etapes.classList.add('masque');
      rendre(`<div class="pile g-3">
        <p class="t-petit t-2">Connecté en <strong>${echapper(emailSession)}</strong> ·
        activation de <strong>${echapper(libelle)}</strong> en cours…</p></div>`);

      /* Le webhook écrit en quelques secondes : on l'observe en direct. */
      const arret = onSnapshot(doc(bdd, 'acheteurs', info.email), (d) => {
        const fiche = d.exists() ? d.data() : {};
        const ok = (fiche.paiements || []).some((p) => p.session === info.sessionId)
          || (info.achat && info.achat.type === 'pack' && fiche.pack)
          || (info.achat && info.achat.type === 'formation'
              && fiche.achats && fiche.achats[info.achat.formation]);
        if (!ok) return;
        arret();
        rendre(`<div class="pile g-3">
          <p class="t-h3" style="color:var(--valide,#1AAE39)">${echapper(libelle)} est dans ton espace.</p>
          <p class="t-petit t-2">Aucune manipulation à faire : ta session est déjà ouverte.</p>
          <div class="pile g-2">
            <a href="${lienOuverture}" class="btn btn-principal btn-large btn-bloc">Ouvrir maintenant</a>
            <a href="./compte.html" class="btn btn-secondaire btn-bloc">Mon espace : tous mes achats</a>
          </div></div>`);
      });

      /* Filet : si le webhook traîne au-delà de 45 s, on donne la sortie manuelle. */
      setTimeout(() => {
        if (zone.textContent.includes('activation')) {
          rendre(`<div class="pile g-3">
            <p class="t-petit t-2">L'activation prend un peu plus de temps que
            d'habitude. Ton paiement est bien enregistré : ouvre ton espace
            dans une minute, ou écris-nous si ça persiste.</p>
            <a href="./compte.html" class="btn btn-principal btn-bloc">Ouvrir mon espace</a></div>`);
        }
      }, 45000);
      return;
    }

    /* --- Cas 2 : connecté avec une AUTRE adresse ------------------------ */
    if (emailSession && emailSession !== info.email) {
      rendre(`<div class="pile g-3">
        <p class="t-h3">Attention : deux adresses différentes.</p>
        <p class="t-petit t-2">Cet achat (<strong>${echapper(libelle)}</strong>) est rattaché à
        <strong>${echapper(info.email)}</strong>, mais tu es connecté avec
        <strong>${echapper(emailSession)}</strong>. Tes formations restent liées à
        l'adresse du paiement.</p>
        <button type="button" class="btn btn-principal btn-bloc" id="envoyer-lien">
          Recevoir mon lien d'accès sur ${echapper(info.email)}</button>
        <p class="t-micro t-3">Tu voulais tout regrouper sur ${echapper(emailSession)} ?
        Écris-nous à <a href="mailto:contact@capmedia.tn">contact@capmedia.tn</a> :
        on transfère l'achat, c'est rapide.</p></div>`);
      brancherEnvoi(auth, info.email);
      return;
    }

    /* --- Cas 3 : non connecté ------------------------------------------- */
    if (etapes) etapes.classList.add('masque');
    rendre(`<div class="pile g-3">
      <p class="t-h3">Ton accès est rattaché à <span style="color:var(--action)">${echapper(info.email)}</span></p>
      <p class="t-petit t-2">C'est l'adresse fournie au paiement
      (Apple Pay et Google Pay utilisent parfois une adresse différente de
      celle que tu attendais : la voici, noir sur blanc).</p>
      <button type="button" class="btn btn-principal btn-large btn-bloc" id="envoyer-lien">
        M'envoyer mon lien d'accès</button>
      <p class="t-micro t-3">Le lien arrive en moins d'une minute. Pense aux
      indésirables. Mauvaise adresse ? <a href="mailto:contact@capmedia.tn">contact@capmedia.tn</a>.</p></div>`);
    brancherEnvoi(auth, info.email);
  });
}

function brancherEnvoi(auth, email) {
  const b = document.getElementById('envoyer-lien');
  if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true;
    const t = b.textContent;
    b.textContent = 'Envoi…';
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: cfg.urlAcces || `${location.origin}${location.pathname.replace('merci.html', 'acces.html')}`,
        handleCodeInApp: true,
      });
      try { window.localStorage.setItem('az:email-en-attente', email); } catch (e) {}
      b.textContent = 'Lien envoyé : regarde ta boîte mail';
    } catch (e) {
      console.error(e);
      b.textContent = 'Échec : réessaie dans un instant';
      setTimeout(() => { b.textContent = t; b.disabled = false; }, 2500);
    }
  });
}
