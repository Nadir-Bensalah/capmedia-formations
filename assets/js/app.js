/* ==========================================================================
   CAPMEDIA ACADEMY — Espace membre

   Sécurité : le contenu des leçons vit dans Firestore, pas dans ce dépôt
   public. Les règles Firestore n'autorisent la lecture qu'aux acheteurs
   (document acheteurs/{email} écrit par le webhook Stripe).

   Ce fichier gère aussi :
   — le PROFIL du lecteur (Mac/Windows, iPhone/Android, tablette, montre,
     mode avec/sans IA) qui filtre le contenu via les blocs :::si ;
   — le DÉBLOCAGE PROGRESSIF : un module s'ouvre quand le précédent est
     terminé, avec une petite animation, et ne se reverrouille jamais.
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
let lecons      = [];
let acheteur    = null;
let faits       = new Set();
let utilisateur = null;
let courante    = null;
let profil      = null;   // { ordi, tel, tablette, montre, ia } ou null
let maxDebloque = -1;     // ordre le plus haut jamais débloqué — ne redescend jamais

const CLE_PROFIL = 'az:profil';

/* ==========================================================================
   Profil : questions, tags, formulaire
   ========================================================================== */
const QUESTIONS = [
  { cle: 'ordi', titre: 'Ton ordinateur',
    opts: [['mac', 'Mac'], ['windows', 'Windows'], ['les-deux', 'Les deux']] },
  { cle: 'tel', titre: 'Ton téléphone',
    opts: [['iphone', 'iPhone'], ['android', 'Android'], ['les-deux', 'Les deux']] },
  { cle: 'tablette', titre: 'Une tablette ?',
    opts: [['aucune', 'Aucune'], ['ipad', 'iPad'], ['android', 'Android'], ['les-deux', 'Les deux']] },
  { cle: 'montre', titre: 'Une montre connectée ?',
    opts: [['aucune', 'Aucune'], ['apple', 'Apple Watch'], ['android', 'Wear OS'], ['les-deux', 'Les deux']] },
  { cle: 'ia', titre: 'Ta façon de suivre',
    aide: 'Avec IA : un prompt prêt à copier à chaque étape. Sans IA : les commandes et la documentation, en entier. Tu changes quand tu veux.',
    opts: [['avec', 'Avec IA — recommandé'], ['sans', 'Sans IA']] },
];

const PROFIL_DEFAUT = { ordi: 'les-deux', tel: 'les-deux', tablette: 'aucune', montre: 'aucune', ia: 'avec' };

/* Le profil devient un jeu de tags que le rendu markdown consomme (:::si). */
function tagsProfil() {
  if (!profil) return null;                       // pas encore choisi → tout montrer
  const t = new Set();
  if (profil.ordi !== 'windows') t.add('mac');
  if (profil.ordi !== 'mac')     t.add('windows');
  if (profil.tel  !== 'android') t.add('iphone');
  if (profil.tel  !== 'iphone')  t.add('android');
  if (profil.tablette === 'ipad'    || profil.tablette === 'les-deux') t.add('ipad');
  if (profil.tablette === 'android' || profil.tablette === 'les-deux') t.add('tablette-android');
  if (profil.montre === 'apple'   || profil.montre === 'les-deux') t.add('apple-watch');
  if (profil.montre === 'android' || profil.montre === 'les-deux') t.add('montre-android');
  t.add(profil.ia === 'sans' ? 'sans-ia' : 'avec-ia');
  return t;
}

function formulaireProfil(valeurs) {
  return QUESTIONS.map((q) => `
    <div class="pile g-2">
      <p class="t-petit t-fort">${q.titre}</p>
      ${q.aide ? `<p class="t-micro t-3">${q.aide}</p>` : ''}
      <div class="seg" data-cle="${q.cle}" role="group" aria-label="${q.titre}">
        ${q.opts.map(([v, l]) =>
          `<button type="button" data-val="${v}" aria-pressed="${String(valeurs[q.cle] === v)}">${l}</button>`
        ).join('')}
      </div>
    </div>`).join('');
}

function brancherSegments(racine) {
  racine.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    });
  });
}

function lireFormulaire(racine) {
  const v = {};
  racine.querySelectorAll('.seg').forEach((seg) => {
    const actif = seg.querySelector('button[aria-pressed="true"]');
    v[seg.dataset.cle] = actif ? actif.dataset.val : PROFIL_DEFAUT[seg.dataset.cle];
  });
  return v;
}

function enregistrerProfil(nouveau) {
  profil = nouveau;
  try { localStorage.setItem(CLE_PROFIL, JSON.stringify(profil)); } catch (e) {}
  enregistrerProgression();
}

/* --- Questionnaire du premier accès -------------------------------------- */
function afficherOnboarding() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau pile g-5" role="dialog" aria-modal="true" aria-label="Ton matériel">
      <div class="pile g-2">
        <p class="etiquette">Avant de commencer</p>
        <h2 class="t-h2" style="font-size:24px">Dis-moi avec quoi tu travailles.</h2>
        <p class="t-petit t-2">La formation s'adapte : tu ne verras que les
        étapes qui concernent <em>ton</em> matériel. Modifiable à tout moment
        dans « Matériel &amp; mode », en bas du sommaire.</p>
      </div>
      <div class="pile g-4" id="onboarding-form">${formulaireProfil(PROFIL_DEFAUT)}</div>
      <button type="button" class="btn btn-principal btn-large btn-bloc" id="onboarding-ok">C'est parti</button>
    </div>`;
  document.body.appendChild(sur);
  brancherSegments(sur);

  $('onboarding-ok').addEventListener('click', () => {
    enregistrerProfil(lireFormulaire(sur));
    sur.remove();
    if (courante) aller(courante, true);
    toast('Formation adaptée à ton matériel ✓');
  });
}

/* --- Panneau de réglages « Matériel & mode » ------------------------------ */
function afficherReglages() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau pile g-5" role="dialog" aria-modal="true" aria-label="Matériel et mode">
      <div class="rang-espace">
        <h2 class="t-h3">Matériel &amp; mode</h2>
        <button type="button" class="bouton-icone" id="reglages-fermer" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="pile g-4" id="reglages-form">${formulaireProfil(profil || PROFIL_DEFAUT)}</div>
      <button type="button" class="btn btn-principal btn-bloc" id="reglages-ok">Enregistrer</button>
      <hr class="filet" style="margin:0">
      <div class="pile g-2">
        <p class="t-micro t-3">Les modules se débloquent au fil de ta progression.
        Si tu préfères naviguer librement :</p>
        <button type="button" class="btn btn-secondaire" id="tout-debloquer">Tout débloquer définitivement</button>
      </div>
    </div>`;
  document.body.appendChild(sur);
  brancherSegments(sur);

  const fermer = () => sur.remove();
  $('reglages-fermer').addEventListener('click', fermer);
  sur.addEventListener('click', (e) => { if (e.target === sur) fermer(); });

  $('reglages-ok').addEventListener('click', () => {
    enregistrerProfil(lireFormulaire(sur));
    fermer();
    if (courante) aller(courante, true);
    toast('Réglages enregistrés ✓');
  });

  $('tout-debloquer').addEventListener('click', () => {
    if (!window.confirm('Débloquer tous les modules ? C\'est définitif — ils ne se reverrouilleront pas.')) return;
    const avant = maxDebloque;
    maxDebloque = Math.max(...lecons.map((l) => l.ordre));
    enregistrerProgression();
    fermer();
    majSommaire();
    marquerPlouf(avant);
    toast('Tous les modules sont débloqués');
  });
}

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

    majDeblocage(false);
    construireSommaire();
    ouvrirDepuisUrl();
    voile.classList.add('parti');

    if (!profil) afficherOnboarding();

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
   2. Chargement du contenu et de la progression
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
  const donnees = p.exists() ? p.data() : {};
  faits = new Set(donnees.faits || []);
  maxDebloque = typeof donnees.maxDebloque === 'number' ? donnees.maxDebloque : -1;
  profil = donnees.profil || null;

  if (!profil) {
    try { profil = JSON.parse(localStorage.getItem(CLE_PROFIL)) || null; } catch (e) {}
  }
}

async function enregistrerProgression() {
  try {
    await setDoc(
      doc(bdd, 'progression', utilisateur.uid),
      {
        faits: [...faits],
        maxDebloque,
        profil: profil || null,
        maj: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (e) { console.warn('Progression non enregistrée', e); }
}

/* --- Accès par offre (Essentiel / Complet) -------------------------------- */
function accessible(lecon) {
  if (lecon.offre !== 'complet') return true;
  return acheteur.offre === 'complet';
}

/* ==========================================================================
   3. Déblocage progressif

   Règle : le module suivant s'ouvre quand le précédent est terminé.
   `maxDebloque` retient le plus haut ordre jamais atteint : décocher un
   module ne reverrouille rien, jamais.
   Les bonus (offre Complet) ne sont pas soumis à la progression : ce sont
   des références, pas des étapes.
   ========================================================================== */
function serieProgressive() {
  return lecons.filter((l) => l.offre !== 'complet').sort((a, b) => a.ordre - b.ordre);
}

function calculerPrefixe() {
  const base = serieProgressive();
  if (!base.length) return -1;
  let m = base[0].ordre;                       // le premier est toujours ouvert
  for (let k = 0; k < base.length; k++) {
    if (!faits.has(base[k].id)) break;
    m = base[k + 1] ? base[k + 1].ordre : base[k].ordre;
  }
  return m;
}

function majDeblocage(animer) {
  const avant = maxDebloque;
  maxDebloque = Math.max(maxDebloque, calculerPrefixe());
  if (maxDebloque !== avant) {
    enregistrerProgression();
    if (animer) { majSommaire(); marquerPlouf(avant); }
  }
}

function debloquee(lecon) {
  if (lecon.offre === 'complet') return true;  // gated par l'offre, pas la progression
  return lecon.ordre <= maxDebloque;
}

function prochainAFaire() {
  return serieProgressive().find((l) => !faits.has(l.id)) || null;
}

/* Le « plouf » : les lignes nouvellement débloquées s'animent une fois. */
function marquerPlouf(ordreAvant) {
  document.querySelectorAll('.lien-module').forEach((b) => {
    const l = lecons.find((x) => x.id === b.dataset.id);
    if (l && l.offre !== 'complet' && l.ordre > ordreAvant && l.ordre <= maxDebloque) {
      b.classList.add('plouf');
      b.addEventListener('animationend', () => b.classList.remove('plouf'), { once: true });
    }
  });
}

/* ==========================================================================
   4. Sommaire
   ========================================================================== */
function construireSommaire() {
  const nav = $('liens-modules');
  nav.innerHTML = '';

  let bonusAnnonce = false;

  lecons.forEach((l) => {
    if (l.offre === 'complet' && !bonusAnnonce) {
      const t = document.createElement('p');
      t.className = 'etiquette groupe';
      t.textContent = 'Bonus · offre Complet';
      nav.appendChild(t);
      bonusAnnonce = true;
    }

    const b = document.createElement('button');
    b.className = 'lien-module';
    b.type = 'button';
    b.dataset.id = l.id;
    b.innerHTML =
      `<span class="num"></span>` +
      `<span class="titre-module">${echapper(l.titre)}</span>`;
    b.addEventListener('click', () => aller(l.id));
    nav.appendChild(b);
  });

  majSommaire();
}

function majSommaire() {
  document.querySelectorAll('.lien-module').forEach((b) => {
    const l = lecons.find((x) => x.id === b.dataset.id);
    if (!l) return;
    const fait   = faits.has(l.id);
    const ouvert = accessible(l);
    const dispo  = debloquee(l);

    b.setAttribute('aria-current', String(l.id === courante));
    b.classList.toggle('est-fait', fait);
    b.classList.toggle('est-verrouille', !ouvert);
    b.classList.toggle('est-bloque', ouvert && !dispo);
    b.setAttribute('aria-disabled', String(ouvert && !dispo));

    const num = b.querySelector('.num');
    if (!ouvert)      num.textContent = '🔒';
    else if (!dispo)  num.textContent = '·';
    else if (fait)    num.textContent = '✓';
    else              num.textContent = String(l.ordre).padStart(2, '0');
  });

  const total = lecons.length || 1;
  const n = lecons.filter((l) => faits.has(l.id)).length;
  $('jauge').style.width = Math.round((n / total) * 100) + '%';
  $('progression-texte').textContent = `${n}/${lecons.length}`;
}

/* ==========================================================================
   5. Affichage d'une leçon
   ========================================================================== */
async function aller(id, remplacer = false) {
  const l = lecons.find((x) => x.id === id);
  if (!l) return;

  /* Verrouillée par la progression : on secoue, on explique, on reste. */
  if (accessible(l) && !debloquee(l)) {
    const rangee = document.querySelector(`.lien-module[data-id="${id}"]`);
    if (rangee) {
      rangee.classList.add('refus');
      rangee.addEventListener('animationend', () => rangee.classList.remove('refus'), { once: true });
    }
    const prochain = prochainAFaire();
    toast(prochain
      ? `Termine « ${prochain.titre} » pour débloquer ce module.`
      : 'Ce module se débloque en avançant.');
    return;
  }

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
  document.title = l.titre + ' — Capmedia Academy';

  if (!accessible(l)) {
    page.innerHTML = gabaritVerrouille(l);
    return;
  }

  page.innerHTML = chapeau +
    '<div class="squelette"><span></span><span></span><span></span><span></span><span></span></div>';

  try {
    const markdown = await chargerContenu(l.id);
    if (courante !== id) return;

    page.innerHTML = chapeau + '<div class="corps">' + versHtml(markdown, tagsProfil()) + '</div>';
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
          ? 'Tu peux le décocher si tu veux le refaire — rien ne se reverrouille.'
          : 'Coche-le : le module suivant se débloque.'}</span>
     </div>
     <button type="button" class="btn ${dejaFait ? 'btn-secondaire' : 'btn-principal'}" id="btn-fini">
       ${dejaFait ? 'Décocher' : 'Marquer comme terminé'}
     </button>`;

  $('page').appendChild(zone);

  $('btn-fini').addEventListener('click', () => {
    if (faits.has(l.id)) faits.delete(l.id);
    else faits.add(l.id);
    enregistrerProgression();
    majDeblocage(true);
    majSommaire();
    construirePagination(l);
    zone.remove();
    ajouterBoutonFini(l);
  });
}

function construirePagination(l) {
  const i = lecons.findIndex((x) => x.id === l.id);
  const prec = lecons[i - 1];
  const suiv = lecons[i + 1];

  const carte = (cible, sens, droite) => {
    if (!cible) return '<span class="vide"></span>';
    if (accessible(cible) && !debloquee(cible)) {
      return `<span class="pagination-verrou${droite ? ' droite' : ''}">
                <span class="sens">${sens}</span>
                <span class="titre">🔒 ${echapper(cible.titre)}</span>
                <span class="t-micro t-3">Termine ce module pour le débloquer</span>
              </span>`;
    }
    return `<a href="#${cible.id}" data-aller="${cible.id}"${droite ? ' class="droite"' : ''}>
              <span class="sens">${sens}</span>
              <span class="titre">${echapper(cible.titre)}</span>
            </a>`;
  };

  $('pagination').innerHTML =
    carte(prec, '← Précédent', false) +
    carte(suiv, 'Suivant →', true);

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

    const dansPrompt = !!cadre.closest('.prompt');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copier';
    b.textContent = dansPrompt ? 'Copier le prompt' : 'Copier';

    b.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        b.textContent = 'Copié ✓';
        b.dataset.copie = '1';
        setTimeout(() => {
          b.textContent = dansPrompt ? 'Copier le prompt' : 'Copier';
          delete b.dataset.copie;
        }, 1600);
      } catch { b.textContent = 'Échec'; }
    });

    cadre.appendChild(b);
  });
}

/* ==========================================================================
   6. Navigation
   ========================================================================== */
function derniereAccessible() {
  const dispo = lecons.filter((l) => debloquee(l) && accessible(l));
  return dispo.find((l) => !faits.has(l.id)) || dispo[dispo.length - 1] || lecons[0];
}

function ouvrirDepuisUrl() {
  const id = decodeURIComponent(location.hash.replace('#', ''));
  let cible = lecons.find((l) => l.id === id);
  if (!cible || (accessible(cible) && !debloquee(cible))) cible = derniereAccessible();
  aller(cible.id, true);
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

/* --- Réglages ------------------------------------------------------------ */
$('ouvrir-profil').addEventListener('click', afficherReglages);

/* --- Déconnexion --------------------------------------------------------- */
function deconnecter() {
  signOut(auth).then(() => window.location.replace('../acces.html'));
}
$('deconnexion').addEventListener('click', deconnecter);

/* --- Raccourcis clavier -------------------------------------------------- */
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  if (document.querySelector('.surcouche')) {
    if (e.key === 'Escape') {
      const sur = document.querySelector('.surcouche');
      if (sur && sur.querySelector('#reglages-fermer')) sur.remove();
    }
    return;
  }

  const dispo = lecons.filter((l) => debloquee(l));
  const i = dispo.findIndex((l) => l.id === courante);
  if (e.key === 'ArrowRight' && dispo[i + 1]) aller(dispo[i + 1].id);
  if (e.key === 'ArrowLeft'  && dispo[i - 1]) aller(dispo[i - 1].id);
  if (e.key === 'Escape') fermerMenu();
});

/* --- Toast ---------------------------------------------------------------- */
let toastMinuteur;
function toast(texte) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = texte;
  requestAnimationFrame(() => t.classList.add('visible'));
  clearTimeout(toastMinuteur);
  toastMinuteur = setTimeout(() => t.classList.remove('visible'), 2800);
}

/* --- Utilitaire ---------------------------------------------------------- */
function echapper(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
