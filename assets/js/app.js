/* ==========================================================================
   ATELIER ZÉRO — Espace membre

   Sécurité : le contenu des leçons vit dans Firestore, pas dans ce dépôt
   public. Les règles Firestore (voir firestore.rules) n'autorisent la lecture
   de la collection `lecons` que si un document `acheteurs/{email}` existe pour
   l'utilisateur connecté. Connaître l'URL de cette page ne donne donc accès
   à rien.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

import { versHtml } from './markdown.js';

const cfg = window.AZ;
const $ = (id) => document.getElementById(id);

const voile      = $('voile');
const voileTexte = $('voile-texte');

if (!cfg || !cfg.firebase || !cfg.firebase.apiKey) {
  voileTexte.innerHTML =
    "Firebase n'est pas configuré.<br><code>assets/js/config.js</code>";
  throw new Error('Configuration Firebase absente');
}

const app  = initializeApp(cfg.firebase);
const auth = getAuth(app);
const bdd  = getFirestore(app);

/* --- État ---------------------------------------------------------------- */
let lecons     = [];
let acheteur   = null;
let faits      = new Set();
let utilisateur = null;
let courante   = null;

/* ==========================================================================
   1. Garde d'accès
   ========================================================================== */
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.replace('../acces.html');
    return;
  }
  utilisateur = u;
  const email = (u.email || '').toLowerCase();
  $('email-membre').textContent = email;

  try {
    voileTexte.textContent = 'Vérification de ton accès…';
    const fiche = await getDoc(doc(bdd, 'acheteurs', email));

    if (!fiche.exists()) {
      voile.innerHTML = gabaritPasAcheteur(email);
      $('voile-deconnexion').addEventListener('click', deconnecter);
      return;
    }
    acheteur = fiche.data();

    voileTexte.textContent = 'Chargement de ta formation…';
    await Promise.all([chargerLecons(), chargerProgression()]);

    construireSommaire();
    ouvrirDepuisUrl();
    voile.classList.add('parti');

  } catch (err) {
    console.error(err);
    voileTexte.innerHTML =
      "Impossible de charger ta formation.<br>" +
      '<button class="lien-nu t-micro" onclick="location.reload()">Réessayer</button>';
  }
});

function gabaritPasAcheteur(email) {
  return `
    <div class="pile pile-24 t-centre" style="max-width:420px;padding:24px">
      <h1 class="t-h2">Aucun achat trouvé</h1>
      <p class="t-petit t-douce">
        Tu es bien connecté avec <b>${echapper(email)}</b>, mais aucune commande
        n'est associée à cette adresse.
      </p>
      <p class="t-petit t-douce">
        Si tu as payé avec une <b>autre adresse</b>, déconnecte-toi et reconnecte-toi
        avec celle-là. Si tu viens tout juste de payer, laisse une minute et recharge.
      </p>
      <div class="pile pile-12">
        <a href="../index.html#tarifs" class="btn btn--principal btn--bloc">Voir la formation</a>
        <button class="lien-nu t-micro" id="voile-deconnexion">Se déconnecter</button>
        <a class="t-micro t-tenue" href="mailto:${cfg.contact}">Écrire à ${cfg.contact}</a>
      </div>
    </div>`;
}

/* ==========================================================================
   2. Chargement du contenu

   Le sommaire (collection `lecons`) ne contient que des métadonnées : titre,
   ordre, résumé, offre. Le markdown vit dans `contenus`, lu à la demande —
   c'est ce découpage qui permet aux règles Firestore de vérifier l'offre
   achetée document par document (voir firestore.rules).
   ========================================================================== */
async function chargerLecons() {
  const instantane = await getDocs(query(collection(bdd, 'lecons'), orderBy('ordre')));
  lecons = instantane.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const cacheContenus = new Map();

async function chargerContenu(id) {
  if (cacheContenus.has(id)) return cacheContenus.get(id);
  const d = await getDoc(doc(bdd, 'contenus', id));
  const md = d.exists() ? (d.data().markdown || '') : '';
  cacheContenus.set(id, md);
  return md;
}

async function chargerProgression() {
  const p = await getDoc(doc(bdd, 'progression', utilisateur.uid));
  faits = new Set(p.exists() ? (p.data().faits || []) : []);
}

async function enregistrerProgression() {
  try {
    await setDoc(
      doc(bdd, 'progression', utilisateur.uid),
      { faits: [...faits], maj: new Date().toISOString() },
      { merge: true },
    );
  } catch (e) { console.warn('Progression non enregistrée', e); }
}

/* --- Une leçon est-elle accessible avec l'offre achetée ? ---------------- */
function accessible(lecon) {
  if (lecon.offre !== 'complet') return true;
  return acheteur.offre === 'complet';
}

/* ==========================================================================
   3. Sommaire
   ========================================================================== */
function construireSommaire() {
  const nav = $('liens-modules');
  nav.innerHTML = '';

  lecons.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'lien-module';
    b.dataset.id = l.id;
    b.innerHTML =
      `<span class="num"><span>${String(l.ordre).padStart(2, '0')}</span></span>` +
      `<span>${echapper(l.titre)}${accessible(l) ? '' : ' <span class="t-tenue">· Complet</span>'}</span>`;
    b.addEventListener('click', () => aller(l.id));
    nav.appendChild(b);
  });

  majSommaire();
}

function majSommaire() {
  document.querySelectorAll('.lien-module').forEach((b) => {
    b.classList.toggle('actif', b.dataset.id === courante);
    b.classList.toggle('fait', faits.has(b.dataset.id));
  });

  const total = lecons.length || 1;
  const n = lecons.filter((l) => faits.has(l.id)).length;
  $('jauge').style.width = Math.round((n / total) * 100) + '%';
  $('progression-texte').textContent = `${n} / ${lecons.length}`;
}

/* ==========================================================================
   4. Affichage d'une leçon
   ========================================================================== */
async function aller(id, remplacer = false) {
  const l = lecons.find((x) => x.id === id);
  if (!l) return;

  courante = id;
  const url = '#' + id;
  if (remplacer) history.replaceState(null, '', url);
  else history.pushState(null, '', url);

  const page = $('page');
  const chapeau =
    `<header class="chapeau">
       <div class="fil">Module ${String(l.ordre).padStart(2, '0')}</div>
       <h1>${echapper(l.titre)}</h1>
       ${l.resume ? `<p class="resume">${echapper(l.resume)}</p>` : ''}
       ${l.duree ? `<p class="duree">Environ ${echapper(l.duree)} de lecture</p>` : ''}
     </header>`;

  construirePagination(l);
  majSommaire();
  fermerMenu();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = l.titre + ' — Atelier Zéro';

  if (!accessible(l)) {
    page.innerHTML = gabaritVerrouille(l);
    return;
  }

  page.innerHTML = chapeau + '<p class="t-tenue">Chargement…</p>';

  try {
    const markdown = await chargerContenu(l.id);

    // L'utilisateur a pu changer de leçon pendant le chargement.
    if (courante !== id) return;

    page.innerHTML = chapeau + versHtml(markdown);
    ajouterBoutonsCopier(page);
    ajouterBoutonFini(l);
  } catch (err) {
    console.error(err);
    if (courante !== id) return;
    page.innerHTML = chapeau +
      '<div class="encadre encadre--piege"><span class="marqueur">🛑</span><div>' +
      '<p><strong>Impossible de charger ce module.</strong></p>' +
      '<p>Vérifie ta connexion et recharge la page. Si ça persiste, ' +
      `écris-moi à <a href="mailto:${cfg.contact}">${cfg.contact}</a>.</p>` +
      '</div></div>';
  }
}

function gabaritVerrouille(l) {
  return `
    <header class="chapeau">
      <div class="fil">Module ${String(l.ordre).padStart(2, '0')} · réservé à l'offre Complet</div>
      <h1>${echapper(l.titre)}</h1>
      <p class="resume">${echapper(l.resume || '')}</p>
    </header>
    <div class="encadre encadre--piege">
      <span class="marqueur">🔒</span>
      <div>
        <p><strong>Ce module fait partie de l'offre Complet.</strong></p>
        <p>Tu as pris l'offre Essentiel. Tu peux passer au Complet à tout moment
           en ne payant que la différence — écris-moi à
           <a href="mailto:${cfg.contact}">${cfg.contact}</a> et je t'envoie le lien.</p>
      </div>
    </div>`;
}

function ajouterBoutonFini(l) {
  const zone = document.createElement('div');
  zone.className = 'tache';
  const dejaFait = faits.has(l.id);

  zone.innerHTML =
    `<div class="rang rang--espace" style="flex-wrap:nowrap;gap:16px">
       <div class="pile pile-4">
         <span class="t-h3">${dejaFait ? 'Module terminé' : 'Tu as fini ce module ?'}</span>
         <span class="t-micro t-tenue">${dejaFait
            ? 'Tu peux le décocher si tu veux le refaire.'
            : 'Coche-le pour suivre ta progression.'}</span>
       </div>
       <button class="btn ${dejaFait ? 'btn--clair' : 'btn--encre'}" id="btn-fini">
         ${dejaFait ? 'Décocher' : 'Marquer comme terminé'}
       </button>
     </div>`;

  $('page').appendChild(zone);

  $('btn-fini').addEventListener('click', () => {
    if (faits.has(l.id)) faits.delete(l.id);
    else faits.add(l.id);
    enregistrerProgression();
    majSommaire();
    ajouterBoutonFini(l);
    zone.remove();
  });
}

function construirePagination(l) {
  const i = lecons.findIndex((x) => x.id === l.id);
  const prec = lecons[i - 1];
  const suiv = lecons[i + 1];

  $('pagination').innerHTML =
    (prec
      ? `<a href="#${prec.id}" data-aller="${prec.id}">
           <span class="sens">← Précédent</span>
           <span class="titre">${echapper(prec.titre)}</span>
         </a>`
      : '<span class="vide"></span>') +
    (suiv
      ? `<a href="#${suiv.id}" data-aller="${suiv.id}" class="droite">
           <span class="sens">Suivant →</span>
           <span class="titre">${echapper(suiv.titre)}</span>
         </a>`
      : '<span class="vide"></span>');

  $('pagination').querySelectorAll('[data-aller]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); aller(a.dataset.aller); });
  });
}

function ajouterBoutonsCopier(racine) {
  racine.querySelectorAll('pre').forEach((pre) => {
    const b = document.createElement('button');
    b.className = 'copier';
    b.textContent = 'Copier';
    b.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        b.textContent = 'Copié ✓';
        setTimeout(() => { b.textContent = 'Copier'; }, 1600);
      } catch { b.textContent = 'Échec'; }
    });
    pre.appendChild(b);
  });
}

/* ==========================================================================
   5. Navigation
   ========================================================================== */
function ouvrirDepuisUrl() {
  const id = decodeURIComponent(location.hash.replace('#', ''));
  const cible = lecons.find((l) => l.id === id);
  aller(cible ? cible.id : lecons[0].id, true);
}
window.addEventListener('popstate', ouvrirDepuisUrl);

/* --- Menu mobile --------------------------------------------------------- */
const sommaire = $('sommaire');
const ombre    = $('ombre-menu');
function ouvrirMenu()  { sommaire.classList.add('ouvert');  ombre.classList.add('actif'); }
function fermerMenu()  { sommaire.classList.remove('ouvert'); ombre.classList.remove('actif'); }
$('ouvrir-menu').addEventListener('click', ouvrirMenu);
$('fermer-menu').addEventListener('click', fermerMenu);
ombre.addEventListener('click', fermerMenu);

/* --- Déconnexion --------------------------------------------------------- */
function deconnecter() {
  signOut(auth).then(() => window.location.replace('../acces.html'));
}
$('deconnexion').addEventListener('click', deconnecter);

/* --- Raccourcis clavier -------------------------------------------------- */
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;

  const i = lecons.findIndex((l) => l.id === courante);
  if (e.key === 'ArrowRight' && lecons[i + 1]) aller(lecons[i + 1].id);
  if (e.key === 'ArrowLeft'  && lecons[i - 1]) aller(lecons[i - 1].id);
  if (e.key === 'Escape') fermerMenu();
});

/* --- Utilitaire ---------------------------------------------------------- */
function echapper(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
