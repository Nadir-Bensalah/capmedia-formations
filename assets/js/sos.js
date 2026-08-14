/* ==========================================================================
   CAPMEDIA ACADEMY · SOS Erreurs, la bible des erreurs communes

   Une vraie page de documentation, offerte à tous les membres connectés :
   · sommaire par famille à gauche, fiche en pleine page à droite
   · recherche qui fouille aussi le TEXTE INTÉGRAL des fiches : on colle
     son message d'erreur, la bonne fiche remonte
   · lien profond : /app/sos/#git-01-secret-pousse
   ========================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, getDocs, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { versHtml } from './markdown.js';
import { ico } from './icones.js';

const $ = (id) => document.getElementById(id);
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LANGUE = (() => {
  try { return localStorage.getItem('az:langue') === 'en' ? 'en' : 'fr'; } catch { return 'fr'; }
})();

const T = LANGUE === 'en' ? {
  verif: 'Checking your access…',
  chargement: 'Loading the error bible…',
  etiquette: 'SOS Errors',
  chercher: 'Paste an error, or type a few words…',
  retour: 'Back to my course',
  titreAccueil: 'The common-errors bible',
  introAccueil: "Something broke? Good, that means you are building. Paste your error message in the search field on the left: the fix is probably already written, with a ready-to-copy prompt for your AI.",
  commentTitre: 'How to use it',
  comment1: 'Copy the FULL error message, paste it in the search field: the matching sheet surfaces even if the match is buried deep in its text.',
  comment2: 'Every sheet ends with a ready-to-copy prompt: it hands your AI the symptom, the known cause and the fix, so it repairs without wrecking anything else.',
  comment3: 'Nothing found? Send me the error through Help and support in your course space: it becomes the next sheet of the bible.',
  fiches: 'sheets',
  noteFr: 'Sheets are in French for now: the commands and error messages are universal.',
  aucun: 'Nothing found. Try fewer words, or a shorter piece of the error message.',
  erreur: 'Loading failed. Reload the page, or try again in a moment.',
  familles: { git: 'Git & GitHub', env: 'Environment', rn: 'React Native & Expo', ios: 'iOS & Xcode', android: 'Android', firebase: 'Firebase', stripe: 'Stripe', stores: 'The stores', ia: 'Working with AI' },
} : {
  verif: 'Vérification de ton accès…',
  chargement: 'Chargement de la bible…',
  etiquette: 'SOS Erreurs',
  chercher: "Colle une erreur, ou tape quelques mots…",
  retour: 'Retour à ma formation',
  titreAccueil: 'La bible des erreurs communes',
  introAccueil: "Quelque chose a cassé ? Bonne nouvelle : c'est que tu construis. Colle ton message d'erreur dans le champ de recherche à gauche : la solution est sans doute déjà écrite, avec un prompt prêt à copier pour ton IA.",
  commentTitre: "Comment s'en servir",
  comment1: "Copie le message d'erreur EN ENTIER et colle-le dans la recherche : la bonne fiche remonte, même si la correspondance est enfouie au fond de son texte.",
  comment2: "Chaque fiche se termine par un prompt prêt à copier : il donne à ton IA le symptôme, la cause connue et la solution, pour qu'elle répare sans rien casser d'autre.",
  comment3: "Rien trouvé ? Envoie-moi l'erreur via Aide et support dans ton espace : elle deviendra la prochaine fiche de la bible.",
  fiches: 'fiches',
  noteFr: '',
  aucun: "Rien trouvé. Essaie moins de mots, ou un morceau plus court du message d'erreur.",
  erreur: 'Le chargement a échoué. Recharge la page, ou réessaie dans un instant.',
  familles: { git: 'Git & GitHub', env: 'Environnement', rn: 'React Native & Expo', ios: 'iOS & Xcode', android: 'Android', firebase: 'Firebase', stripe: 'Stripe', stores: 'Les stores', ia: "Travailler avec l'IA" },
};

document.title = `${T.etiquette} · Capmedia Academy`;
$('sos-etiquette').textContent = T.etiquette;
$('sos-champ').placeholder = T.chercher;
$('retour-texte').textContent = T.retour;
$('voile-texte').textContent = T.verif;

/* --- Menu mobile ---------------------------------------------------------- */
const sommaire = $('sommaire');
const ombre = $('ombre-menu');
const fermerMenu = () => { sommaire.classList.remove('ouvert'); ombre.classList.remove('actif'); };
$('ouvrir-menu').addEventListener('click', () => { sommaire.classList.add('ouvert'); ombre.classList.add('actif'); });
$('fermer-menu').addEventListener('click', fermerMenu);
ombre.addEventListener('click', fermerMenu);

/* --- Boutons Copier sur les blocs de code et les prompts ------------------ */
function ajouterBoutonsCopier(racine) {
  racine.querySelectorAll('pre').forEach((pre) => {
    let hote = pre.closest('.bloc-code');
    const dansPrompt = !!pre.closest('.prompt');
    if (!hote) {
      hote = document.createElement('div');
      hote.className = 'bloc-code bloc-code-nu';
      pre.parentNode.insertBefore(hote, pre);
      hote.appendChild(pre);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copier';
    const libelle = dansPrompt ? (LANGUE === 'en' ? 'Copy the prompt' : 'Copier le prompt')
      : (LANGUE === 'en' ? 'Copy' : 'Copier');
    b.innerHTML = ico('copier', 12) + '<span>' + libelle + '</span>';
    b.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        b.innerHTML = ico('coche', 12) + '<span>' + (LANGUE === 'en' ? 'Copied' : 'Copié') + '</span>';
        setTimeout(() => { b.innerHTML = ico('copier', 12) + '<span>' + libelle + '</span>'; }, 1600);
      } catch { b.innerHTML = '<span>Échec</span>'; }
    });
    const tete = hote.querySelector('.bloc-code-tete');
    if (tete) tete.appendChild(b);
    else hote.appendChild(b);
  });
}

/* --- Démarrage ------------------------------------------------------------ */
const cfg = window.AZ || {};
if (!cfg.firebase || !cfg.firebase.apiKey) {
  $('voile-texte').textContent = 'Configuration manquante.';
  throw new Error('config firebase absente');
}
const app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
const auth = getAuth(app);
const bdd = getFirestore(app);

let sommaireFiches = [];        // [{id, titre, resume, famille, ordre}]
let texteFiches = null;         // { id: markdown minuscules } pour la recherche
const markdownFiches = {};      // { id: markdown brut }
let recherche = '';

onAuthStateChanged(auth, async (u) => {
  if (!u || !u.email) { window.location.replace('../../acces.html'); return; }
  $('email-membre').textContent = u.email;
  $('voile-texte').textContent = T.chargement;

  try {
    const instantane = await getDocs(
      query(collection(bdd, 'formations/sos/lecons'), orderBy('ordre')));
    sommaireFiches = instantane.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    $('voile-texte').textContent = T.erreur;
    return;
  }

  $('voile').remove();
  rendreNav();
  router();

  /* Texte intégral en arrière-plan : la recherche profonde s'active seule. */
  getDocs(collection(bdd, 'formations/sos/contenus')).then((s) => {
    texteFiches = {};
    s.docs.forEach((d) => {
      markdownFiches[d.id] = d.data().markdown || '';
      texteFiches[d.id] = (d.data().markdown || '').toLowerCase();
    });
    if (recherche) rendreNav();
  }).catch(() => {});
});

/* --- Le sommaire (familles + fiches, filtré par la recherche) ------------- */
function fichesVisibles() {
  const mots = recherche.toLowerCase().trim();
  if (!mots) return sommaireFiches;
  return sommaireFiches.filter((f) => {
    if (`${f.titre} ${f.resume} ${f.famille}`.toLowerCase().includes(mots)) return true;
    return !!(texteFiches && texteFiches[f.id] && texteFiches[f.id].includes(mots));
  });
}

function rendreNav() {
  const nav = $('sos-nav');
  const visibles = fichesVisibles();
  const courant = location.hash.slice(1);
  if (!visibles.length) {
    nav.innerHTML = `<p class="t-micro t-3" style="padding:var(--e-3)">${T.aucun}</p>`;
    return;
  }
  const parFamille = new Map();
  visibles.forEach((f) => {
    const fam = f.famille || 'autres';
    if (!parFamille.has(fam)) parFamille.set(fam, []);
    parFamille.get(fam).push(f);
  });
  let html = '';
  for (const [fam, fiches] of parFamille) {
    html += `<p class="etiquette" style="padding:var(--e-3) var(--e-3) var(--e-1)">${echapper(T.familles[fam] || fam)}</p>`;
    html += fiches.map((f) => `
      <a class="lien-module${f.id === courant ? ' actif' : ''}" href="#${f.id}"
         aria-current="${String(f.id === courant)}">
        <span class="num">${ico('attention', 11)}</span>
        <span class="titre-module">${echapper(f.titre)}</span>
      </a>`).join('');
  }
  nav.innerHTML = html;
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', fermerMenu));
}

$('sos-champ').addEventListener('input', (e) => {
  recherche = e.target.value;
  rendreNav();
});

/* --- Les vues ------------------------------------------------------------- */
function vueAccueil() {
  const page = $('page');
  const familles = new Map();
  sommaireFiches.forEach((f) => {
    familles.set(f.famille, (familles.get(f.famille) || 0) + 1);
  });
  page.innerHTML = `
    <p class="etiquette">${T.etiquette}</p>
    <h1 class="t-h1" style="margin:var(--e-2) 0 var(--e-3)">${T.titreAccueil}</h1>
    <p class="t-lead">${T.introAccueil}</p>
    ${T.noteFr ? `<p class="t-petit t-3" style="margin-top:var(--e-2)">${T.noteFr}</p>` : ''}
    <div class="corps" style="margin-top:var(--e-5)">
      <h2>${T.commentTitre}</h2>
      <ol>
        <li>${T.comment1}</li>
        <li>${T.comment2}</li>
        <li>${T.comment3}</li>
      </ol>
    </div>
    <div class="rang" style="flex-wrap:wrap;gap:var(--e-2);margin-top:var(--e-5)">
      ${[...familles].map(([fam, n]) => `
        <span class="pastille">${echapper(T.familles[fam] || fam)} · ${n} ${T.fiches}</span>`).join('')}
    </div>`;
}

function vueFiche(id) {
  const fiche = sommaireFiches.find((f) => f.id === id);
  if (!fiche) { vueAccueil(); return; }
  const page = $('page');
  const markdown = markdownFiches[id];

  const rendre = (md) => {
    page.innerHTML = `
      <p class="etiquette">${echapper(T.familles[fiche.famille] || fiche.famille || T.etiquette)}</p>
      <h1 class="t-h1" style="margin:var(--e-2) 0 var(--e-2)">${echapper(fiche.titre)}</h1>
      <p class="t-lead" style="margin-bottom:var(--e-5)">${echapper(fiche.resume)}</p>
      <div class="corps">${versHtml(md, null)}</div>`;
    ajouterBoutonsCopier(page);
    window.scrollTo(0, 0);
    document.querySelector('.lecture')?.scrollTo?.(0, 0);
  };

  if (markdown !== undefined) { rendre(markdown); return; }
  page.innerHTML = `<p class="t-petit t-3">${T.chargement}</p>`;
  import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js').then(async ({ doc, getDoc }) => {
    try {
      const d = await getDoc(doc(bdd, 'formations/sos/contenus', id));
      const md = d.exists() ? (d.data().markdown || '') : '';
      markdownFiches[id] = md;
      rendre(md);
    } catch { page.innerHTML = `<p class="t-petit t-3">${T.erreur}</p>`; }
  });
}

function router() {
  const id = location.hash.slice(1);
  if (id) vueFiche(id);
  else vueAccueil();
  rendreNav();
}
window.addEventListener('hashchange', router);
