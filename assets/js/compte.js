/* ==========================================================================
   CAPMEDIA ACADEMY · Mon espace

   Tout ce qui appartient à l'utilisateur, au même endroit : formations et
   niveaux, pack, paiements avec reçus Stripe, progression, profil, export
   RGPD. Lecture seule sur les achats (écrits par le webhook), rien ici ne
   peut ouvrir un accès.
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { ico } from './icones.js';
import CATALOGUE from './catalogue.js';

const cfg = window.AZ;
const $ = (id) => document.getElementById(id);
const voile = $('voile');
const URL_PACK = 'https://europe-west1-capmedia-academy.cloudfunctions.net/creerCheckoutPack';

if (!cfg || !cfg.firebase || !cfg.firebase.apiKey) {
  $('voile-texte').textContent = 'Configuration absente.';
  throw new Error('config absente');
}

const app  = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
const auth = getAuth(app);
const bdd  = getFirestore(app);

const echapper = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LIBELLES_PROFIL = {
  ordi: { mac: 'Mac', windows: 'Windows', 'les-deux': 'Mac et Windows' },
  tel:  { iphone: 'iPhone', android: 'Android', 'les-deux': 'iPhone et Android' },
  ia:   { avec: 'avec IA', sans: 'sans IA' },
};

onAuthStateChanged(auth, async (u) => {
  if (!u) { window.location.replace('./acces.html'); return; }
  const email = (u.email || '').toLowerCase();

  let fiche = null, progression = null, conversation = null;
  try {
    const [f, p, c] = await Promise.all([
      getDoc(doc(bdd, 'acheteurs', email)),
      getDoc(doc(bdd, 'progression', u.uid)),
      getDoc(doc(bdd, 'conversations', u.uid)).catch(() => null),
    ]);
    fiche = f.exists() ? f.data() : null;
    progression = p.exists() ? p.data() : {};
    conversation = c && c.exists() ? c.data() : null;
  } catch (e) { console.error(e); }

  /* Membre 100 % gratuit : aucune fiche acheteur, et c'est normal.
     Mon espace fonctionne quand même (formations offertes, profil). */
  if (!fiche) fiche = {};
  if (!progression) progression = {};

  /* --- Normalisation des achats (rétrocompat « offre ») ------------------- */
  const achats = { ...(fiche.achats || {}) };
  if (fiche.offre && !achats.mobile) achats.mobile = fiche.offre;
  const pack = fiche.pack || null;

  /* --- En-tête ------------------------------------------------------------ */
  $('mail-compte').textContent = email;
  const prenom = (progression.profil && progression.profil.prenom) || '';
  if (prenom) $('salut').textContent = ' ' + prenom;

  /* --- Mes formations ------------------------------------------------------ */
  const parFormation = progression.parFormation || {};
  // Rétrocompat : l'ancienne progression racine appartient à mobile.
  if (!parFormation.mobile && progression.faits) {
    parFormation.mobile = { faits: progression.faits, maxDebloque: progression.maxDebloque };
  }

  const possede = (slug) => pack ? (pack === 'avance' ? 'complet' : 'essentiel') : achats[slug] || null;

  const lignes = [];
  for (const f of CATALOGUE.formations) {
    const niveau = achats[f.slug] || (pack ? possede(f.slug) : null);
    if (!niveau) continue;
    const prog = parFormation[f.slug] || {};
    const faits = (prog.faits || []).length;
    lignes.push(`
      <div class="ligne-achat">
        <span class="la-ico">${ico(f.couleurIco || 'note', 16)}</span>
        <div class="la-corps">
          <p class="t-petit t-fort">${echapper(f.nom)}</p>
          <p class="t-micro t-3">Offre ${niveau === 'complet' ? 'Complète' : 'Essentiel'}${pack ? ' · via le Pack' : ''}
            ${faits ? ` · ${faits} module${faits > 1 ? 's' : ''} terminé${faits > 1 ? 's' : ''}` : ''}</p>
        </div>
        <div class="la-actions">
          <a class="btn btn-principal" href="./app/?f=${f.slug}">${faits ? 'Continuer' : 'Commencer'}</a>
        </div>
      </div>`);
  }

  $('liste-achats').innerHTML = lignes.length
    ? lignes.join('')
    : '<p class="t-petit t-3" style="padding:var(--e-4) 0">Aucune formation pour le moment.</p>';

  /* --- Le pack : état ou offre personnalisée ------------------------------- */
  const zone = $('zone-pack');
  if (pack === 'avance') {
    zone.innerHTML = `
      <div class="encadre encadre--action" style="margin:0">
        <span class="marqueur">${ico('coche', 18)}</span>
        <div><p><strong>Pack Avancé actif.</strong> Toutes les formations, actuelles
        et à venir pendant 12 mois, en offre Complète. Rien d'autre à acheter, jamais.</p></div>
      </div>`;
    zone.classList.remove('masque');
  } else {
    try {
      const idToken = await u.getIdToken();
      const niveau = pack === 'basic' ? 'avance' : 'avance';
      const r = await fetch(URL_PACK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, niveau, apercu: true }),
      });
      const d = await r.json();
      if (d.prix) {
        zone.innerHTML = `
          <div class="carte pile g-3">
            <div class="rang-espace">
              <div class="pile g-1">
                <p class="t-petit t-fort">${pack === 'basic' ? 'Passer au Pack Avancé' : 'Ton Pack Academy personnalisé'}</p>
                <p class="t-micro t-3">Toutes les formations en Complet.
                ${d.deja > 0 ? `Tes ${d.deja} € déjà investis sont déduits :` : ''}
                <strong>${d.prix} €</strong> au lieu de ${d.plein} € (${d.remisePct} % de remise totale).</p>
              </div>
              <button type="button" class="btn btn-principal" id="acheter-pack">Compléter · ${d.prix} €</button>
            </div>
          </div>`;
        zone.classList.remove('masque');
        $('acheter-pack').addEventListener('click', async () => {
          const b = $('acheter-pack');
          b.disabled = true; b.textContent = 'Un instant…';
          const r2 = await fetch(URL_PACK, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: await u.getIdToken(), niveau: 'avance' }),
          });
          const d2 = await r2.json();
          if (d2.url) location.href = d2.url;
          else { b.textContent = 'Réessaie plus tard'; b.disabled = false; }
        });
      }
    } catch (e) { /* zone pack silencieuse en cas d'échec réseau */ }
  }

  /* --- Paiements ------------------------------------------------------------ */
  const paiements = (fiche.paiements || []).slice().reverse();
  $('liste-paiements').innerHTML = paiements.length
    ? paiements.map((p) => `
      <div class="ligne-paiement">
        <span class="la-ico">${ico('copier', 15)}</span>
        <div class="la-corps">
          <p class="t-petit t-fort">${echapper(p.libelle || 'Achat')}</p>
          <p class="t-micro t-3">${new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            · ${(p.montant / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${(p.devise || 'eur').toUpperCase()}</p>
        </div>
        <div class="la-actions">
          ${p.recu ? `<a class="btn btn-secondaire" href="${echapper(p.recu)}" target="_blank" rel="noopener">Reçu</a>`
                   : `<span class="t-micro t-3">Reçu par e-mail</span>`}
        </div>
      </div>`).join('')
    : '<p class="t-petit t-3" style="padding:var(--e-4) 0">L\'historique démarre avec ton prochain paiement. Les achats passés restent visibles dans tes e-mails Stripe.</p>';

  /* --- Profil ------------------------------------------------------------- */
  const prof = progression.profil;
  if (prof) {
    $('resume-profil').textContent =
      `${LIBELLES_PROFIL.ordi[prof.ordi] || '?'} · ${LIBELLES_PROFIL.tel[prof.tel] || '?'} · mode ${LIBELLES_PROFIL.ia[prof.ia] || '?'}`;
  }

  /* --- Export RGPD ---------------------------------------------------------- */
  $('exporter').addEventListener('click', () => {
    const donnees = {
      exporteLe: new Date().toISOString(),
      compte: { email, uid: u.uid },
      achats, pack,
      paiements: fiche.paiements || [],
      progression,
      conversation: conversation ? conversation.messages : [],
    };
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `capmedia-academy-donnees-${email.replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('deconnexion').addEventListener('click', () => signOut(auth).then(() => location.replace('./acces.html')));

  voile.classList.add('parti');
});
