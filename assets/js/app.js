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
    <div class="pile g-5" style="max-width:420px">
      <div class="pile g-2">
        <h1 class="t-h2">Aucun achat trouvé</h1>
        <p class="t-petit t-2">
          Tu es bien connecté avec <strong>${echapper(email)}</strong>, mais aucune
          commande n'est associée à cette adresse.
        </p>
      </div>
      <div class="encadre encadre--astuce">
        <span class="marqueur" aria-hidden="true">💡</span>
        <div>
          <p>Si tu as payé avec une <strong>autre adresse</strong>, déconnecte-toi et
          reconnecte-toi avec celle-là. Si tu viens tout juste de payer, laisse une
          minute et recharge la page.</p>
        </div>
      </div>
      <div class="pile g-3">
        <a href="../index.html#tarifs" class="btn btn-principal btn-large btn-bloc">Voir la formation</a>
        <div class="rang-espace">
          <button type="button" class="lien-nu" id="voile-deconnexion">Se déconnecter</button>
          <a class="t-micro" href="mailto:${cfg.contact}">${cfg.contact}</a>
        </div>
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

  let bonusAnnonce = false;

  lecons.forEach((l) => {
    // Les modules bonus sont regroupés sous leur propre intertitre.
    if (l.offre === 'complet' && !bonusAnnonce) {
      const t = document.createElement('p');
      t.className = 'etiquette groupe';
      t.textContent = 'Bonus · offre Complet';
      nav.appendChild(t);
      bonusAnnonce = true;
    }

    const ouvert = accessible(l);
    const b = document.createElement('button');
    b.className = 'lien-module' + (ouvert ? '' : ' est-verrouille');
    b.type = 'button';
    b.dataset.id = l.id;
    b.innerHTML =
      `<span class="num">${ouvert ? String(l.ordre).padStart(2, '0') : '🔒'}</span>` +
      `<span class="titre-module">${echapper(l.titre)}</span>`;
    b.addEventListener('click', () => aller(l.id));
    nav.appendChild(b);
  });

  majSommaire();
}

function majSommaire() {
  document.querySelectorAll('.lien-module').forEach((b) => {
    const l = lecons.find((x) => x.id === b.dataset.id);
    const fait = faits.has(b.dataset.id);

    b.setAttribute('aria-current', String(b.dataset.id === courante));
    b.classList.toggle('est-fait', fait);

    // La coche remplace le numéro une fois le module terminé.
    const num = b.querySelector('.num');
    if (num && l && accessible(l)) {
      num.textContent = fait ? '✓' : String(l.ordre).padStart(2, '0');
    }
  });

  const total = lecons.length || 1;
  const n = lecons.filter((l) => faits.has(l.id)).length;
  $('jauge').style.width = Math.round((n / total) * 100) + '%';
  $('progression-texte').textContent = `${n}/${lecons.length}`;
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
       <p class="etiquette-mono">Module ${String(l.ordre).padStart(2, '0')}</p>
       <h1>${echapper(l.titre)}</h1>
       ${l.resume ? `<p class="resume">${echapper(l.resume)}</p>` : ''}
       ${l.duree ? `<p class="duree">Environ ${echapper(l.duree)} de lecture</p>` : ''}
     </header>
     <hr class="chapeau-filet">`;

  construirePagination(l);
  majSommaire();
  fermerMenu();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = l.titre + ' — Atelier Zéro';

  if (!accessible(l)) {
    page.innerHTML = gabaritVerrouille(l);
    return;
  }

  // Squelette plutôt qu'une roue qui tourne : la page ne saute pas.
  page.innerHTML = chapeau +
    '<div class="squelette"><span></span><span></span><span></span><span></span><span></span></div>';

  try {
    const markdown = await chargerContenu(l.id);

    // L'utilisateur a pu changer de leçon pendant le chargement.
    if (courante !== id) return;

    page.innerHTML = chapeau + '<div class="corps">' + versHtml(markdown) + '</div>';
    ajouterBoutonsCopier(page);
    ajouterBoutonFini(l);
  } catch (err) {
    console.error(err);
    if (courante !== id) return;
    page.innerHTML = chapeau +
      '<div class="encadre encadre--piege"><span class="marqueur" aria-hidden="true">🛑</span><div>' +
      '<p><strong>Impossible de charger ce module.</strong></p>' +
      '<p>Vérifie ta connexion et recharge la page. Si ça persiste, ' +
      `écris-moi à <a href="mailto:${cfg.contact}">${cfg.contact}</a>.</p>` +
      '</div></div>';
  }
}

function gabaritVerrouille(l) {
  return `
    <header class="chapeau">
      <p class="etiquette-mono">Module ${String(l.ordre).padStart(2, '0')} · offre Complet</p>
      <h1>${echapper(l.titre)}</h1>
      <p class="resume">${echapper(l.resume || '')}</p>
    </header>
    <hr class="chapeau-filet">
    <div class="corps">
      <div class="encadre encadre--attention">
        <span class="marqueur" aria-hidden="true">🔒</span>
        <div>
          <p><strong>Ce module fait partie de l'offre Complet.</strong></p>
          <p>Tu as pris l'offre Essentiel. Tu peux passer au Complet à tout moment
             en ne payant que la différence — écris-moi à
             <a href="mailto:${cfg.contact}">${cfg.contact}</a> et je t'envoie le lien.</p>
        </div>
      </div>
    </div>`;
}

function ajouterBoutonFini(l) {
  const dejaFait = faits.has(l.id);
  const zone = document.createElement('div');
  zone.className = 'bloc-fini';

  zone.innerHTML =
    `<div class="pile g-1">
       <span class="t-h3">${dejaFait ? 'Module terminé' : 'Tu as fini ce module ?'}</span>
       <span class="t-micro t-3">${dejaFait
          ? 'Tu peux le décocher si tu veux le refaire.'
          : 'Coche-le pour suivre ta progression.'}</span>
     </div>
     <button type="button" class="btn ${dejaFait ? 'btn-secondaire' : 'btn-principal'}" id="btn-fini">
       ${dejaFait ? 'Décocher' : 'Marquer comme terminé'}
     </button>`;

  $('page').appendChild(zone);

  $('btn-fini').addEventListener('click', () => {
    if (faits.has(l.id)) faits.delete(l.id);
    else faits.add(l.id);
    enregistrerProgression();
    majSommaire();
    zone.remove();
    ajouterBoutonFini(l);
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
    // Le bouton se positionne sur un conteneur, pas sur le <pre> lui-même :
    // sinon il défile avec le code quand celui-ci déborde horizontalement.
    const cadre = document.createElement('div');
    cadre.className = 'bloc-code';
    pre.parentNode.insertBefore(cadre, pre);
    cadre.appendChild(pre);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copier';
    b.textContent = 'Copier';

    b.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        b.textContent = 'Copié';
        b.dataset.copie = '1';
        setTimeout(() => { b.textContent = 'Copier'; delete b.dataset.copie; }, 1600);
      } catch { b.textContent = 'Échec'; }
    });

    cadre.appendChild(b);
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
