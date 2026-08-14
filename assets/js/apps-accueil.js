/* ==========================================================================
   CAPMEDIA ACADEMY · La vitrine des apps membres sur l'accueil

   La règle anti-vitrine-vide : la section ne s'affiche qu'à partir de
   TROIS apps publiées. En dessous, une carte d'invitation discrète prend
   la place : « Ton application ici, dans quelques semaines ? »
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, collection, getDocs, query, where,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const zone = document.getElementById('apps-membres');
if (zone) {
  const EN = location.pathname.includes('/en/');
  const T = EN ? {
    etiquette: 'Built by our members',
    titre: 'The apps our members shipped',
    sous: 'Real apps, built by people who mostly started from zero. Proof, not promises.',
    voir: 'Browse the gallery',
    parMembre: 'by a member',
    placTitre: 'Your app here, in a few weeks?',
    placTexte: 'Our members are building right now. Start the path for free: the next card could be yours.',
    placBtn: 'Start for free',
    lienGalerie: '../apps.html',
    lienAcces: './acces.html',
  } : {
    etiquette: 'Construites par nos membres',
    titre: 'Les applications de nos membres',
    sous: "De vraies apps, faites par des gens qui, pour la plupart, partaient de zéro. Des preuves, pas des promesses.",
    voir: 'Voir toute la galerie',
    parMembre: 'par un membre',
    placTitre: 'Ton application ici, dans quelques semaines ?',
    placTexte: 'Nos membres construisent en ce moment même. Commence le parcours gratuitement : la prochaine carte pourrait être la tienne.',
    placBtn: 'Commencer gratuitement',
    lienGalerie: './apps.html',
    lienAcces: './acces.html',
  };
  const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  (async () => {
    const cfg = window.AZ || {};
    if (!cfg.firebase) return;
    try {
      const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
      const bdd = getFirestore(app);
      const instantane = await getDocs(
        query(collection(bdd, 'apps-membres'), where('statut', '==', 'publiee')));
      const apps = instantane.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (apps.length >= 3) {
        zone.innerHTML = `
          <div class="section-tete">
            <p class="etiquette">${T.etiquette}</p>
            <h2 class="t-h2">${T.titre}</h2>
            <p class="t-petit t-2">${T.sous}</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--e-4)">
            ${apps.slice(0, 6).map((a) => `
              <a class="carte" href="${T.lienGalerie}" style="text-decoration:none;padding:0;overflow:hidden;display:flex;flex-direction:column">
                ${a.captures && a.captures[0]
                  ? `<img src="${echapper(a.captures[0])}" alt="" loading="lazy" style="width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:var(--fond-2)">`
                  : ''}
                <span style="padding:var(--e-3) var(--e-4);display:flex;flex-direction:column;gap:4px">
                  <strong class="t-petit">${echapper(a.nom)}</strong>
                  <span class="t-micro t-3">${echapper(a.pitch || T.parMembre)}</span>
                </span>
              </a>`).join('')}
          </div>
          <div class="t-centre" style="margin-top:var(--e-4)">
            <a class="btn btn-secondaire" href="${T.lienGalerie}">${T.voir}</a>
          </div>`;
      } else {
        zone.innerHTML = `
          <div class="carte t-centre pile g-2" style="padding:var(--e-5);align-items:center">
            <p class="t-h3" style="font-size:20px">${T.placTitre}</p>
            <p class="t-petit t-2" style="max-width:52ch">${T.placTexte}</p>
            <a class="btn btn-principal" href="${T.lienAcces}" style="margin-top:var(--e-2)">${T.placBtn}</a>
          </div>`;
      }
    } catch (e) { /* la section reste vide, la page vit sans elle */ }
  })();
}
