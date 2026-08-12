/* ==========================================================================
   CAPMEDIA ACADEMY · Avis sur la landing

   Charge les avis publiés depuis Firestore et n'affiche la section que
   s'il en existe au moins un. Les règles Firestore ne laissent lire que
   les avis dont publie == true : rien d'autre ne peut fuiter ici.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, limit }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { etoiles } from './icones.js';

const cfg = window.AZ;
const section = document.getElementById('avis');
const grille = document.getElementById('grille-avis');
const resume = document.getElementById('avis-resume');

if (cfg && cfg.firebase && cfg.firebase.apiKey && section && grille) {
  try {
    const app = initializeApp(cfg.firebase);
    const bdd = getFirestore(app);

    const instantane = await getDocs(
      query(collection(bdd, 'avis'), where('publie', '==', true), limit(12))
    );

    const liste = instantane.docs
      .map((d) => d.data())
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (liste.length) {
      const moyenne = liste.reduce((n, a) => n + (a.note || 0), 0) / liste.length;

      if (resume) {
        resume.innerHTML =
          etoiles(Math.round(moyenne)) +
          ` <strong>${moyenne.toFixed(1).replace('.', ',')} / 5</strong>` +
          ` · ${liste.length} avis de membres`;
      }

      grille.innerHTML = liste.map((a) => `
        <div class="carte pile g-3">
          ${etoiles(a.note || 5)}
          <p class="t-corps" style="line-height:1.6">${echapper(a.texte)}</p>
          <div class="rang" style="gap:8px">
            <span class="t-petit t-fort">${echapper(a.prenom)}</span>
            <span class="pastille pastille--termine">Achat vérifié</span>
          </div>
        </div>`).join('');

      section.classList.remove('masque');
    }
  } catch (e) {
    /* La landing reste silencieuse si Firestore est injoignable. */
    console.warn('Avis non chargés', e);
  }
}

function echapper(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
