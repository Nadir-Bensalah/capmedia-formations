/* ==========================================================================
   CAPMEDIA ACADEMY · Publier son application dans la galerie des membres

   Depuis Mon compte : le membre soumet son app (nom, pitch, description,
   liens, jusqu'à 6 captures envoyées dans Storage). La soumission part au
   statut « attente » : rien n'est public avant la modération de Nadir.
   Un membre = une app (le document porte son uid).
   ========================================================================== */

import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

const $ = (id) => document.getElementById(id);
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cfg = window.AZ || {};
const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
const auth = getAuth(app);
const bdd = getFirestore(app);
const stockage = getStorage(app);

let membre = null;
let mienne = null;   // ma soumission existante, ou null

const LIBELLES_STATUT = {
  attente: ['En attente de modération', 'encadre--attention'],
  publiee: ['Publiée dans la galerie', 'encadre--action'],
  refusee: ['Refusée : écris-moi via le support pour comprendre pourquoi', 'encadre--piege'],
};

onAuthStateChanged(auth, async (u) => {
  membre = u && u.email ? u : null;
  if (!membre || !$('etat-mon-app')) return;
  try {
    const d = await getDoc(doc(bdd, 'apps-membres', membre.uid));
    mienne = d.exists() ? d.data() : null;
  } catch { mienne = null; }
  afficherEtat();
});

function afficherEtat() {
  const zone = $('etat-mon-app');
  if (!zone) return;
  if (!mienne) { zone.innerHTML = ''; return; }
  const [texte, classe] = LIBELLES_STATUT[mienne.statut] || ['', 'encadre--note'];
  zone.innerHTML = `
    <aside class="encadre ${classe}">
      <div><p class="t-petit"><strong>${echapper(mienne.nom)}</strong> · ${texte}.</p></div>
    </aside>`;
  const bouton = $('publier-app');
  if (bouton) bouton.textContent = 'Modifier mon application';
}

/* --- Le formulaire ---------------------------------------------------------- */
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'publier-app') ouvrirFormulaire();
});

function ouvrirFormulaire() {
  if (!membre) { window.location.href = './acces.html'; return; }
  const m = mienne || {};
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="Publier mon application" style="max-width:640px">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">La galerie des membres</p>
          <h2 class="t-h3" style="font-size:20px">${mienne ? 'Modifier mon application' : 'Publier mon application'}</h2>
        </div>
        <button type="button" class="bouton-icone" data-fermer aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="pan-corps">
        <form id="form-app" class="pile g-4">
          <div>
            <label class="etiquette-champ" for="app-nom">Le nom de ton application</label>
            <input class="champ champ-large" id="app-nom" maxlength="60" required
                   value="${echapper(m.nom || '')}" placeholder="MonApp">
          </div>
          <div>
            <label class="etiquette-champ" for="app-pitch">Le pitch en une phrase (140 caractères)</label>
            <input class="champ champ-large" id="app-pitch" maxlength="140" required
                   value="${echapper(m.pitch || '')}" placeholder="L'app qui…">
          </div>
          <div>
            <label class="etiquette-champ" for="app-desc">La description</label>
            <textarea class="champ" id="app-desc" rows="5" maxlength="2000" required
                      placeholder="Ce qu'elle fait, pour qui, ce que tu as appris en la construisant…">${echapper(m.description || '')}</textarea>
          </div>
          <div class="pile g-2">
            <label class="etiquette-champ">Les liens (au moins un, si elle est en ligne)</label>
            <input class="champ champ-large" id="app-apple" type="url" placeholder="Lien App Store (facultatif)" value="${echapper(m.lienApple || '')}">
            <input class="champ champ-large" id="app-google" type="url" placeholder="Lien Google Play (facultatif)" value="${echapper(m.lienGoogle || '')}">
            <input class="champ champ-large" id="app-web" type="url" placeholder="Site web de l'app (facultatif)" value="${echapper(m.lienWeb || '')}">
          </div>
          <div class="pile g-2">
            <label class="etiquette-champ" for="app-captures">Les captures d'écran (1 à 6 images, 5 Mo max chacune)</label>
            <input class="champ champ-large" id="app-captures" type="file" accept="image/*" multiple>
            ${m.captures && m.captures.length ? `<p class="t-micro t-3">${m.captures.length} capture(s) déjà en ligne : n'en choisis de nouvelles que pour les remplacer.</p>` : ''}
          </div>
          <p class="t-micro t-3">
            Ta soumission passe en modération avant publication : rien n'est
            public tant qu'elle n'est pas validée.
          </p>
          <div id="app-erreur"></div>
          <button class="btn btn-principal btn-large" type="submit" id="app-envoyer">
            ${mienne ? 'Enregistrer les modifications' : 'Soumettre mon application'}
          </button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(sur);

  const fermer = () => sur.remove();
  sur.querySelector('[data-fermer]').addEventListener('click', fermer);
  sur.addEventListener('click', (e) => { if (e.target === sur) fermer(); });

  sur.querySelector('#form-app').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = sur.querySelector('#app-envoyer');
    const zoneErreur = sur.querySelector('#app-erreur');
    zoneErreur.innerHTML = '';
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';

    try {
      const fichiers = [...sur.querySelector('#app-captures').files].slice(0, 6);
      for (const f of fichiers) {
        if (f.size > 5 * 1024 * 1024) throw new Error(`« ${f.name} » dépasse 5 Mo.`);
        if (!f.type.startsWith('image/')) throw new Error(`« ${f.name} » n'est pas une image.`);
      }

      let captures = mienne && mienne.captures ? mienne.captures : [];
      if (fichiers.length) {
        captures = [];
        for (let i = 0; i < fichiers.length; i++) {
          bouton.textContent = `Envoi des captures… ${i + 1}/${fichiers.length}`;
          const chemin = ref(stockage, `apps-membres/${membre.uid}/capture-${i}-${Date.now()}.${(fichiers[i].name.split('.').pop() || 'png').toLowerCase()}`);
          await uploadBytes(chemin, fichiers[i], { contentType: fichiers[i].type });
          captures.push(await getDownloadURL(chemin));
        }
      }
      if (!captures.length) throw new Error('Ajoute au moins une capture d’écran.');

      const donnees = {
        uid: membre.uid,
        email: membre.email.toLowerCase(),
        nom: sur.querySelector('#app-nom').value.trim(),
        pitch: sur.querySelector('#app-pitch').value.trim(),
        description: sur.querySelector('#app-desc').value.trim(),
        lienApple: sur.querySelector('#app-apple').value.trim(),
        lienGoogle: sur.querySelector('#app-google').value.trim(),
        lienWeb: sur.querySelector('#app-web').value.trim(),
        captures,
        date: (mienne && mienne.date) || new Date().toISOString(),
        statut: (mienne && mienne.statut) || 'attente',
      };
      if (!donnees.nom || !donnees.pitch || !donnees.description) {
        throw new Error('Le nom, le pitch et la description sont requis.');
      }

      await setDoc(doc(bdd, 'apps-membres', membre.uid), donnees);
      mienne = donnees;
      afficherEtat();
      fermer();
    } catch (err) {
      console.warn(err);
      zoneErreur.innerHTML = `<aside class="encadre encadre--piege"><div><p class="t-petit">${echapper(err.message || "L'envoi a échoué. Réessaie.")}</p></div></aside>`;
      bouton.disabled = false;
      bouton.textContent = mienne ? 'Enregistrer les modifications' : 'Soumettre mon application';
    }
  });
}
