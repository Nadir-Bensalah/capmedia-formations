/* ==========================================================================
   CAPMEDIA ACADEMY · La galerie publique des apps membres

   Lisible par TOUT LE MONDE, connecté ou non (les règles Firestore
   n'exposent que les apps au statut « publiee »). Un membre connecté peut
   donner un cœur (un seul) et laisser un avis (un seul, modifiable).
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COEUR = (plein) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${plein ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const ETOILE = (pleine) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="${pleine ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const etoiles = (n) => Array.from({ length: 5 }, (_, i) => ETOILE(i < n)).join('');

const cfg = window.AZ || {};
const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
const auth = getAuth(app);
const bdd = getFirestore(app);

let membre = null;          // utilisateur connecté ou null
let apps = [];              // les apps publiées, enrichies

/* --- Chargement ----------------------------------------------------------- */
async function charger() {
  const instantane = await getDocs(
    query(collection(bdd, 'apps-membres'), where('statut', '==', 'publiee')));

  apps = await Promise.all(instantane.docs.map(async (d) => {
    const jaimes = await getDocs(collection(bdd, `apps-membres/${d.id}/jaimes`)).catch(() => null);
    const avis = await getDocs(collection(bdd, `apps-membres/${d.id}/avis`)).catch(() => null);
    return {
      id: d.id, ...d.data(),
      nbJaimes: jaimes ? jaimes.size : 0,
      monJaime: !!(membre && jaimes && jaimes.docs.some((x) => x.id === membre.uid)),
      avis: avis ? avis.docs.map((x) => ({ uid: x.id, ...x.data() })) : [],
    };
  }));
  apps.sort((a, b) => b.nbJaimes - a.nbJaimes || (b.datePublication || '').localeCompare(a.datePublication || ''));
}

/* --- La grille ------------------------------------------------------------- */
function rendre() {
  const zone = $('galerie');
  if (!apps.length) {
    zone.innerHTML = `
      <div class="carte t-centre" style="padding:var(--e-6)">
        <p class="t-h3">Les premières apps arrivent.</p>
        <p class="t-petit t-2" style="margin-top:var(--e-2)">
          Nos membres construisent en ce moment même. La tienne pourrait être
          la première : le parcours commence gratuitement.
        </p>
      </div>`;
    return;
  }
  zone.innerHTML = `<div class="grille-apps">${apps.map((a, i) => `
    <article class="carte carte-app" data-app="${i}" role="button" tabindex="0" aria-label="${echapper(a.nom)}">
      ${a.captures && a.captures[0]
        ? `<img class="couverture" src="${echapper(a.captures[0])}" alt="" loading="lazy">`
        : '<div class="couverture"></div>'}
      <div class="corps-carte">
        <div class="rang-espace">
          <h2 class="t-h3" style="font-size:18px">${echapper(a.nom)}</h2>
          <button type="button" class="jaime" data-jaime="${a.id}" data-actif="${a.monJaime ? 1 : 0}"
                  aria-label="J'aime">${COEUR(a.monJaime)}<span>${a.nbJaimes}</span></button>
        </div>
        <p class="t-petit t-2">${echapper(a.pitch || '')}</p>
        <p class="t-micro t-3" style="margin-top:auto">
          ${a.avis.length ? `${a.avis.length} avis · ` : ''}par un membre de l'Academy
        </p>
      </div>
    </article>`).join('')}</div>`;

  zone.querySelectorAll('[data-app]').forEach((c) => {
    const ouvrir = () => ouvrirFiche(apps[Number(c.dataset.app)]);
    c.addEventListener('click', (e) => { if (!e.target.closest('.jaime')) ouvrir(); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') ouvrir(); });
  });
  zone.querySelectorAll('[data-jaime]').forEach((b) => {
    b.addEventListener('click', () => basculerJaime(b.dataset.jaime));
  });
}

/* --- Le cœur --------------------------------------------------------------- */
async function basculerJaime(id) {
  if (!membre) { window.location.href = './acces.html'; return; }
  const a = apps.find((x) => x.id === id);
  if (!a) return;
  const ref = doc(bdd, `apps-membres/${id}/jaimes/${membre.uid}`);
  try {
    if (a.monJaime) {
      await deleteDoc(ref);
      a.monJaime = false; a.nbJaimes -= 1;
    } else {
      await setDoc(ref, { date: new Date().toISOString() });
      a.monJaime = true; a.nbJaimes += 1;
    }
    document.querySelectorAll(`[data-jaime="${id}"]`).forEach((b) => {
      b.dataset.actif = a.monJaime ? '1' : '0';
      b.innerHTML = `${COEUR(a.monJaime)}<span>${a.nbJaimes}</span>`;
    });
  } catch (e) { console.warn(e); }
}

/* --- La fiche détaillée ----------------------------------------------------- */
function ouvrirFiche(a) {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  const liens = [
    a.lienApple ? `<a class="btn btn-secondaire" href="${echapper(a.lienApple)}" target="_blank" rel="noopener">App Store</a>` : '',
    a.lienGoogle ? `<a class="btn btn-secondaire" href="${echapper(a.lienGoogle)}" target="_blank" rel="noopener">Google Play</a>` : '',
    a.lienWeb ? `<a class="btn btn-secondaire" href="${echapper(a.lienWeb)}" target="_blank" rel="noopener">Site web</a>` : '',
  ].filter(Boolean).join('');

  const monAvis = membre ? a.avis.find((x) => x.uid === membre.uid) : null;

  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="${echapper(a.nom)}" style="max-width:760px">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">L'app d'un membre</p>
          <h2 class="t-h3" style="font-size:22px">${echapper(a.nom)}</h2>
        </div>
        <button type="button" class="bouton-icone" data-fermer aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="pan-corps pile g-4">
        <div class="rang-espace">
          <p class="t-petit t-2" style="max-width:46ch">${echapper(a.pitch || '')}</p>
          <button type="button" class="jaime" data-jaime="${a.id}" data-actif="${a.monJaime ? 1 : 0}">${COEUR(a.monJaime)}<span>${a.nbJaimes}</span></button>
        </div>
        ${a.captures && a.captures.length ? `
        <div class="captures-defile">
          ${a.captures.map((u) => `<img src="${echapper(u)}" alt="" loading="lazy">`).join('')}
        </div>` : ''}
        <p class="t-corps t-2" style="white-space:pre-line">${echapper(a.description || '')}</p>
        ${liens ? `<div class="rang" style="gap:var(--e-2);flex-wrap:wrap">${liens}</div>` : ''}

        <hr class="filet" style="margin:var(--e-2) 0">
        <div class="pile g-3">
          <p class="t-fort">Les avis des membres ${a.avis.length ? `(${a.avis.length})` : ''}</p>
          <div id="liste-avis" class="pile g-3">
            ${a.avis.length ? a.avis.map((v) => `
              <div class="pile g-1">
                <p class="t-petit"><span style="color:#B8860B">${etoiles(v.note || 0)}</span>
                  <strong style="margin-left:6px">${echapper(v.nom || 'Un membre')}</strong></p>
                <p class="t-petit t-2">${echapper(v.texte || '')}</p>
              </div>`).join('')
    : '<p class="t-petit t-3">Aucun avis pour le moment. Le tien peut être le premier.</p>'}
          </div>
          ${membre ? `
          <form id="form-avis" class="pile g-2" style="margin-top:var(--e-2)">
            <p class="t-micro t-3">${monAvis ? 'Modifier mon avis' : 'Laisser mon avis'} (un seul par membre)</p>
            <div class="rang" style="gap:4px" id="choix-note">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-note="${n}" class="bouton-icone" style="color:${(monAvis && n <= monAvis.note) ? '#B8860B' : 'var(--texte-3)'}" aria-label="${n} étoiles">${ETOILE(monAvis && n <= monAvis.note)}</button>`).join('')}
            </div>
            <textarea class="champ" id="texte-avis" rows="3" maxlength="600"
                      placeholder="Ce que tu penses de cette app…">${monAvis ? echapper(monAvis.texte) : ''}</textarea>
            <button class="btn btn-principal" type="submit" style="align-self:flex-start">Publier mon avis</button>
          </form>` : `
          <p class="t-micro t-3"><a href="./acces.html">Connecte-toi</a> pour laisser un cœur ou un avis.</p>`}
        </div>
      </div>
    </div>`;
  document.body.appendChild(sur);

  const fermer = () => sur.remove();
  sur.querySelector('[data-fermer]').addEventListener('click', fermer);
  sur.addEventListener('click', (e) => { if (e.target === sur) fermer(); });
  sur.querySelector('.jaime').addEventListener('click', () => basculerJaime(a.id));

  if (membre) {
    let note = monAvis ? monAvis.note : 0;
    const boutons = sur.querySelectorAll('[data-note]');
    boutons.forEach((b) => b.addEventListener('click', () => {
      note = Number(b.dataset.note);
      boutons.forEach((x) => {
        const pleine = Number(x.dataset.note) <= note;
        x.style.color = pleine ? '#B8860B' : 'var(--texte-3)';
        x.innerHTML = ETOILE(pleine);
      });
    }));
    sur.querySelector('#form-avis').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texte = sur.querySelector('#texte-avis').value.trim();
      if (!note || !texte) return;
      let nom = 'Un membre';
      try {
        const p = await getDoc(doc(bdd, 'profils', membre.uid));
        if (p.exists() && p.data().nom) nom = p.data().nom;
      } catch {}
      try {
        await setDoc(doc(bdd, `apps-membres/${a.id}/avis/${membre.uid}`), {
          nom, texte, note, date: new Date().toISOString(),
        });
        const existant = a.avis.find((x) => x.uid === membre.uid);
        if (existant) Object.assign(existant, { nom, texte, note });
        else a.avis.push({ uid: membre.uid, nom, texte, note });
        fermer(); rendre();
      } catch (err) { console.warn(err); }
    });
  }
}

/* --- Démarrage -------------------------------------------------------------- */
onAuthStateChanged(auth, async (u) => {
  membre = u && u.email ? u : null;
  try {
    await charger();
    rendre();
  } catch (e) {
    console.error(e);
    $('galerie').innerHTML = '<p class="t-petit t-3">Le chargement a échoué. Réessaie dans un instant.</p>';
  }
});
