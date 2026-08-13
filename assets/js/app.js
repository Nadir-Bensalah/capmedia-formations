/* ==========================================================================
   CAPMEDIA ACADEMY · Espace membre

   Sécurité : le contenu des leçons vit dans Firestore, pas dans ce dépôt
   public. Les règles Firestore n'autorisent la lecture qu'aux acheteurs
   (document acheteurs/{email} écrit par le webhook Stripe).

   Ce fichier gère aussi :
   : le PROFIL du lecteur (Mac/Windows, iPhone/Android, tablette, montre,
     mode avec/sans IA) qui filtre le contenu via les blocs :::si ;
   : le DÉBLOCAGE PROGRESSIF : un module s'ouvre quand le précédent est
     terminé, avec une petite animation, et ne se reverrouille jamais.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, query, orderBy,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

import { versHtml } from './markdown.js';
import { ico, etoiles } from './icones.js';

const cfg = window.AZ;
const $ = (id) => document.getElementById(id);

/* Quelle formation ? ?f=slug dans l'URL, mobile par défaut. */
const FORMATION = new URLSearchParams(location.search).get('f') || 'mobile';

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
let maxDebloque = -1;     // ordre le plus haut jamais débloqué : ne redescend jamais
let idSession   = null;   // identifiant unique de cette session (session unique)
let arreterEcouteSession = null;

const CLE_PROFIL = 'az:profil';

/* ==========================================================================
   Profil : questions, tags, formulaire
   ========================================================================== */
const QUESTIONS = [
  { cle: 'ordi', ico: 'ordinateur', titre: 'Ton ordinateur',
    opts: [['mac', 'Mac'], ['windows', 'Windows'], ['les-deux', 'Les deux']] },
  { cle: 'tel', ico: 'telephone', titre: 'Ton téléphone',
    opts: [['iphone', 'iPhone'], ['android', 'Android'], ['les-deux', 'Les deux']] },
  { cle: 'tablette', ico: 'tablette', titre: 'Une tablette ?',
    opts: [['aucune', 'Aucune'], ['ipad', 'iPad'], ['android', 'Android'], ['les-deux', 'Les deux']] },
  { cle: 'montre', ico: 'montre', titre: 'Une montre connectée ?',
    opts: [['aucune', 'Aucune'], ['apple', 'Apple Watch'], ['android', 'Wear OS'], ['les-deux', 'Les deux']] },
  { cle: 'ia', ico: 'ia', titre: 'Ta façon de suivre',
    aide: 'Avec IA : un prompt prêt à copier à chaque étape. Sans IA : les commandes et la documentation, en entier. Tu changes quand tu veux.',
    opts: [['avec', 'Avec IA (recommandé)'], ['sans', 'Sans IA']] },
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
    <div class="q-profil">
      <div class="q-tete">
        <span class="q-ico">${ico(q.ico, 15)}</span>
        <div class="pile g-1">
          <p class="t-petit t-fort">${q.titre}</p>
          ${q.aide ? `<p class="t-micro t-3">${q.aide}</p>` : ''}
        </div>
      </div>
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
  // Le profil est aussi sauvegardé dans Firestore (progression), donc il
  // survit de toute façon. En localStorage, seulement si les préférences
  // sont acceptées.
  var okPrefs = !window.AZConsent || window.AZConsent.prefs();
  try {
    if (okPrefs) localStorage.setItem(CLE_PROFIL, JSON.stringify(profil));
    else localStorage.removeItem(CLE_PROFIL);
  } catch (e) {}
  enregistrerProgression();
}

/* --- Questionnaire du premier accès -------------------------------------- */
function afficherOnboarding() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="Ton matériel">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">Avant de commencer</p>
          <h2 class="t-h3" style="font-size:20px">Dis-moi avec quoi tu travailles.</h2>
        </div>
      </div>
      <div class="pan-corps">
        <p class="t-petit t-2" style="padding-bottom:var(--e-2)">La formation s'adapte :
        tu ne verras que les étapes qui concernent <em>ton</em> matériel.
        Modifiable à tout moment dans « Matériel &amp; mode », en bas du sommaire.</p>
        <div id="onboarding-form">${formulaireProfil(PROFIL_DEFAUT)}</div>
      </div>
      <div class="pan-pied">
        <button type="button" class="btn btn-principal btn-large btn-bloc" id="onboarding-ok">C'est parti</button>
      </div>
    </div>`;
  document.body.appendChild(sur);
  brancherSegments(sur);

  $('onboarding-ok').addEventListener('click', () => {
    enregistrerProfil(lireFormulaire(sur));
    sur.remove();
    if (courante) aller(courante, true);
    toast('Formation adaptée à ton matériel');
  });
}

/* --- Panneau de réglages « Matériel & mode » ------------------------------ */
function afficherReglages() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="Matériel et mode">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">Réglages</p>
          <h2 class="t-h3" style="font-size:20px">Matériel &amp; mode</h2>
        </div>
        <button type="button" class="bouton-icone" id="reglages-fermer" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="pan-corps">
        <div id="reglages-form">${formulaireProfil(profil || PROFIL_DEFAUT)}</div>
        <div class="q-profil">
          <div class="q-tete">
            <span class="q-ico">${ico('deverrouille', 15)}</span>
            <div class="pile g-1">
              <p class="t-petit t-fort">Navigation libre</p>
              <p class="t-micro t-3">Les modules se débloquent au fil de ta progression.
              Si tu préfères tout ouvrir d'un coup, c'est définitif et rien ne se reverrouille.</p>
            </div>
          </div>
          <button type="button" class="btn btn-secondaire" id="tout-debloquer" style="align-self:flex-start">Tout débloquer définitivement</button>
        </div>
      </div>
      <div class="pan-pied">
        <button type="button" class="btn btn-principal btn-large btn-bloc" id="reglages-ok">Enregistrer</button>
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
    toast('Réglages enregistrés');
  });

  $('tout-debloquer').addEventListener('click', () => {
    fermer();
    afficherRenonciation();
  });
}

/* --- Tout débloquer = renoncer à la garantie (CGV art. 7) ------------------
   L'alerte est explicite et détaillée, la confirmation est enregistrée
   côté serveur, horodatée : elle vaut renonciation expresse. */
function afficherRenonciation() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="Tout débloquer">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">Avant de confirmer</p>
          <h2 class="t-h3" style="font-size:20px">Tout débloquer, et renoncer à la garantie</h2>
        </div>
        <button type="button" class="bouton-icone" id="renon-fermer" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="pan-corps">
        <div class="pile g-3">
          <p class="t-petit t-2">En débloquant <strong>tous les modules d'un coup</strong>,
          tu accèdes immédiatement à l'intégralité de la formation : tu consommes
          donc le produit en entier.</p>
          <p class="t-petit t-2">En conséquence, et comme le prévoient les
          <a href="../cgv.html#garantie" target="_blank" rel="noopener">CGV (article 7)</a>,
          cette action vaut <strong>renonciation à la garantie « satisfait ou
          remboursé » de 14 jours</strong> pour cette formation. Ta confirmation
          est enregistrée et horodatée.</p>
          <p class="t-petit t-2">Rien ne presse : les modules se débloquent aussi
          un par un, au fil de ta progression, et la garantie reste alors acquise
          (tant que moins d'un tiers de la formation est débloqué). Le déblocage
          total est définitif : rien ne se reverrouille.</p>
        </div>
      </div>
      <div class="pan-pied">
        <div class="pile g-2">
          <button type="button" class="btn btn-principal btn-large btn-bloc" id="renon-annuler">Continuer module par module (garantie conservée)</button>
          <button type="button" class="btn btn-secondaire btn-bloc" id="renon-confirmer">Je confirme : tout débloquer et renoncer à la garantie</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(sur);

  const fermer = () => sur.remove();
  $('renon-fermer').addEventListener('click', fermer);
  $('renon-annuler').addEventListener('click', fermer);
  sur.addEventListener('click', (e) => { if (e.target === sur) fermer(); });

  $('renon-confirmer').addEventListener('click', async () => {
    const b = $('renon-confirmer');
    b.disabled = true;
    b.textContent = 'Un instant…';
    try {
      if (utilisateur) {
        await fetch('https://europe-west1-capmedia-academy.cloudfunctions.net/renoncerGarantie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await utilisateur.getIdToken(), formation: FORMATION }),
        });
      }
    } catch (e) { console.warn('Renonciation non enregistrée', e); }
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
      voile.innerHTML = gabaritPasAcheteur(email, false);
      $('voile-deconnexion').addEventListener('click', deconnecter);
      return;
    }
    acheteur = fiche.data();

    /* Multi-formations : achats { slug: offre } + pack, avec rétrocompat
       de l'ancien champ « offre » (qui valait pour mobile). */
    acheteur.achatsN = { ...(acheteur.achats || {}) };
    if (acheteur.offre && !acheteur.achatsN.mobile) acheteur.achatsN.mobile = acheteur.offre;

    const accesCetteFormation = acheteur.pack
      || acheteur.achatsN[FORMATION];
    if (!accesCetteFormation) {
      voile.innerHTML = gabaritPasAcheteur(email, true);
      $('voile-deconnexion').addEventListener('click', deconnecter);
      return;
    }

    voileTexte.textContent = 'Chargement de ta formation…';
    await Promise.all([chargerLecons(), chargerProgression()]);

    majDeblocage(false);
    construireSommaire();
    ouvrirDepuisUrl();
    protegerContenu();
    await prendreLaSession();
    voile.classList.add('parti');

    if (!profil) afficherOnboarding();

  } catch (err) {
    console.error(err);
    voileTexte.innerHTML =
      "Impossible de charger ta formation.<br>" +
      '<button class="lien-nu t-micro" onclick="location.reload()">Réessayer</button>';
  }
});

function gabaritPasAcheteur(email, aDautres) {
  const lienAchat = FORMATION === 'mobile' ? '../index.html#tarifs' : `../formations/${FORMATION}.html`;
  return `
    <div class="pile g-5" style="max-width:420px">
      <div class="pile g-2">
        <h1 class="t-h2">${aDautres ? "Cette formation n'est pas dans ton compte" : 'Aucun achat trouvé'}</h1>
        <p class="t-petit t-2">
          Tu es bien connecté avec <strong>${echapper(email)}</strong>, mais aucune
          commande n'est associée à cette adresse.
        </p>
      </div>
      <div class="encadre encadre--astuce">
        <span class="marqueur">${ico('astuce', 18)}</span>
        <div>
          <p>Si tu as payé avec une <strong>autre adresse</strong>, déconnecte-toi et
          reconnecte-toi avec celle-là. Si tu viens tout juste de payer, laisse une
          minute et recharge la page.</p>
        </div>
      </div>
      <div class="pile g-3">
        <a href="${lienAchat}" class="btn btn-principal btn-large btn-bloc">Voir cette formation</a>
        ${aDautres ? '<a href="../compte.html" class="btn btn-secondaire btn-bloc">Mes formations</a>' : ''}
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
  const instantane = await getDocs(
    query(collection(bdd, 'formations', FORMATION, 'lecons'), orderBy('ordre'))
  );
  lecons = instantane.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const cacheContenus = new Map();

async function chargerContenu(id) {
  if (cacheContenus.has(id)) return cacheContenus.get(id);
  const d = await getDoc(doc(bdd, 'formations', FORMATION, 'contenus', id));
  const md = d.exists() ? (d.data().markdown || '') : '';
  cacheContenus.set(id, md);
  return md;
}

let progressionDoc = {};

async function chargerProgression() {
  const p = await getDoc(doc(bdd, 'progression', utilisateur.uid));
  progressionDoc = p.exists() ? p.data() : {};

  /* La progression vit par formation ; l'ancienne forme racine (avant
     multi-formations) appartient à mobile. */
  const parF = progressionDoc.parFormation || {};
  let mienne = parF[FORMATION];
  if (!mienne && FORMATION === 'mobile' && progressionDoc.faits) {
    mienne = { faits: progressionDoc.faits, maxDebloque: progressionDoc.maxDebloque };
  }
  faits = new Set((mienne && mienne.faits) || []);
  maxDebloque = mienne && typeof mienne.maxDebloque === 'number' ? mienne.maxDebloque : -1;
  profil = progressionDoc.profil || null;

  if (!profil) {
    try { profil = JSON.parse(localStorage.getItem(CLE_PROFIL)) || null; } catch (e) {}
  }
}

async function enregistrerProgression() {
  try {
    await setDoc(
      doc(bdd, 'progression', utilisateur.uid),
      {
        parFormation: { [FORMATION]: { faits: [...faits], maxDebloque } },
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
  return acheteur.achatsN[FORMATION] === 'complet' || acheteur.pack === 'avance';
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
    if (!ouvert)      num.innerHTML = ico('cadenas', 11);
    else if (!dispo)  num.textContent = '·';
    else if (fait)    num.innerHTML = ico('coche', 12);
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
  const position = lecons.filter((x) => x.offre !== 'complet').length;
  const chapeau =
    `<header class="chapeau">
       <p class="etiquette-mono">Module ${String(l.ordre).padStart(2, '0')}${
         l.offre !== 'complet' ? ` <span class="sep">/</span> ${String(position).padStart(2, '0')}` : ''
       }${l.duree ? ` <span class="sep">·</span> ${echapper(l.duree)} de lecture` : ''}</p>
       <h1>${echapper(l.titre)}</h1>
       ${l.resume ? `<p class="resume">${echapper(l.resume)}</p>` : ''}
     </header>
     <hr class="chapeau-filet">`;

  construirePagination(l);
  majSommaire();
  fermerMenu();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = l.titre + ' · Capmedia Academy';

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
    page.classList.remove('page-entree');
    void page.offsetWidth;                 // relance l'animation d'entrée
    page.classList.add('page-entree');
    ajouterBoutonsCopier(page);
    ajouterBoutonFini(l);
  } catch (err) {
    console.error(err);
    if (courante !== id) return;
    page.innerHTML = chapeau +
      '<div class="encadre encadre--piege"><span class="marqueur">' + ico('piege', 18) + '</span><div>' +
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
        <span class="marqueur">${ico('cadenas', 18)}</span>
        <div>
          <p><strong>Ce module fait partie de l'offre Complet.</strong></p>
          <p>Tu as pris l'offre Essentiel. Tu peux passer au Complet à tout moment
             en ne payant que la différence : écris-moi à
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
          ? 'Tu peux le décocher si tu veux le refaire : rien ne se reverrouille.'
          : 'Coche-le : le module suivant se débloque.'}</span>
     </div>
     <button type="button" class="btn ${dejaFait ? 'btn-secondaire' : 'btn-principal'}" id="btn-fini">
       ${dejaFait ? 'Décocher' : ico('coche', 13) + ' Marquer comme terminé'}
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
                <span class="titre">${ico('cadenas', 12)} ${echapper(cible.titre)}</span>
                <span class="t-micro t-3">Termine ce module pour le débloquer</span>
              </span>`;
    }
    return `<a href="#${cible.id}" data-aller="${cible.id}"${droite ? ' class="droite"' : ''}>
              <span class="sens">${sens}</span>
              <span class="titre">${echapper(cible.titre)}</span>
            </a>`;
  };

  $('pagination').innerHTML =
    carte(prec, 'Précédent', false) +
    carte(suiv, 'Suivant', true);

  $('pagination').querySelectorAll('[data-aller]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); aller(a.dataset.aller); });
  });
}

function ajouterBoutonsCopier(racine) {
  racine.querySelectorAll('pre').forEach((pre) => {
    let hote = pre.closest('.bloc-code');
    const dansPrompt = !!pre.closest('.prompt');

    // Les prompts n'ont pas d'en-tête : on les enveloppe comme avant.
    if (!hote) {
      hote = document.createElement('div');
      hote.className = 'bloc-code bloc-code-nu';
      pre.parentNode.insertBefore(hote, pre);
      hote.appendChild(pre);
    }

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copier';
    const libelle = dansPrompt ? 'Copier le prompt' : 'Copier';
    b.innerHTML = ico('copier', 12) + '<span>' + libelle + '</span>';

    b.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        b.innerHTML = ico('coche', 12) + '<span>Copié</span>';
        b.dataset.copie = '1';
        setTimeout(() => {
          b.innerHTML = ico('copier', 12) + '<span>' + libelle + '</span>';
          delete b.dataset.copie;
        }, 1600);
      } catch { b.innerHTML = '<span>Échec</span>'; }
    });

    const tete = hote.querySelector('.bloc-code-tete');
    if (tete) tete.appendChild(b);
    else hote.appendChild(b);
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

/* ==========================================================================
   6bis. Session unique : un seul appareil à la fois

   À l'ouverture, cet onglet écrit un identifiant de session et écoute le
   champ. Si un autre appareil ouvre la formation, il devient le propriétaire
   et cet onglet-ci se ferme proprement. Efficace contre le partage de compte,
   sans gêne pour l'usage légitime (on reprend la main sur son nouvel appareil).
   ========================================================================== */
function nouvelId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'sess-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

async function prendreLaSession() {
  idSession = nouvelId();
  const ref = doc(bdd, 'progression', utilisateur.uid);

  try {
    await setDoc(ref, { sessionActive: idSession, sessionMaj: new Date().toISOString() }, { merge: true });
  } catch (e) { console.warn('Session non enregistrée', e); return; }

  // Petit délai avant d'écouter : on ignore l'écho de notre propre écriture.
  arreterEcouteSession = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const active = snap.data().sessionActive;
    if (active && active !== idSession) sessionEvincee();
  });
}

function sessionEvincee() {
  if (arreterEcouteSession) { arreterEcouteSession(); arreterEcouteSession = null; }
  if (arreterEcouteChat)    { arreterEcouteChat(); arreterEcouteChat = null; }
  document.querySelectorAll('.surcouche').forEach((x) => x.remove());

  voile.classList.remove('parti');
  voile.innerHTML = `
    <div class="pile g-5 t-centre" style="max-width:400px">
      <div class="pile g-3">
        <h1 class="t-h2">Ta formation est ouverte ailleurs</h1>
        <p class="t-petit t-2">Pour protéger ton accès, un seul appareil peut
        lire la formation à la fois. Elle vient d'être ouverte sur un autre
        appareil ou un autre onglet.</p>
      </div>
      <button type="button" class="btn btn-principal btn-large btn-bloc" onclick="location.reload()">
        Reprendre ici
      </button>
      <p class="t-micro t-3">Si ce n'est pas toi, change de mot de passe de
      messagerie : ton lien de connexion transite par ta boîte mail.</p>
    </div>`;
}

/* ==========================================================================
   7. Aide, support & avis

   Le chat suit une règle stricte, appliquée par les règles Firestore :
   UN message à la fois. Le suivant ne part que lorsque Nadir a répondu.
   L'avis est déposé en attente de relecture, jamais publié tout seul.
   ========================================================================== */
let arreterEcouteChat = null;

function afficherSupport() {
  const sur = document.createElement('div');
  sur.className = 'surcouche';
  sur.innerHTML = `
    <div class="panneau" role="dialog" aria-modal="true" aria-label="Aide et support">
      <div class="pan-tete">
        <div class="pile g-1">
          <p class="etiquette">Aide</p>
          <h2 class="t-h3" style="font-size:20px">Support &amp; avis</h2>
        </div>
        <button type="button" class="bouton-icone" id="support-fermer" aria-label="Fermer">${ico('fermer', 16)}</button>
      </div>
      <div class="onglets" role="tablist">
        <button type="button" role="tab" aria-selected="true" data-onglet="chat">${ico('chat', 13)} Me contacter</button>
        <button type="button" role="tab" aria-selected="false" data-onglet="avis">${ico('etoile', 13)} Mon avis</button>
      </div>
      <div class="pan-corps" id="support-corps"></div>
    </div>`;
  document.body.appendChild(sur);

  const fermer = () => {
    if (arreterEcouteChat) { arreterEcouteChat(); arreterEcouteChat = null; }
    sur.remove();
  };
  $('support-fermer').addEventListener('click', fermer);
  sur.addEventListener('click', (e) => { if (e.target === sur) fermer(); });

  sur.querySelectorAll('[data-onglet]').forEach((b) => {
    b.addEventListener('click', () => {
      sur.querySelectorAll('[data-onglet]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      b.setAttribute('aria-selected', 'true');
      if (arreterEcouteChat) { arreterEcouteChat(); arreterEcouteChat = null; }
      if (b.dataset.onglet === 'chat') afficherChat();
      else afficherAvis();
    });
  });

  afficherChat();
}

/* --- Le chat, un message à la fois ---------------------------------------- */
function afficherChat() {
  const corps = $('support-corps');
  corps.innerHTML = `
    <div class="notice-chat">
      <span class="marqueur">${ico('info', 15)}</span>
      <p class="t-micro t-2"><strong>Un message à la fois.</strong> Tu m'écris,
      je te réponds ici (et tu vois la réponse arriver en direct). Tu ne peux
      envoyer le message suivant qu'après ma réponse : ça me permet de répondre
      à tout le monde, avec de vraies réponses.</p>
    </div>
    <div class="fil-chat" id="fil-chat"><p class="t-micro t-3">Chargement…</p></div>
    <form class="envoi-chat" id="envoi-chat">
      <textarea class="champ" id="champ-chat" rows="3" maxlength="2000"
        placeholder="Ta question, avec le maximum de contexte…"></textarea>
      <div class="rang-espace">
        <span class="t-micro t-3" id="compteur-chat">0 / 2000</span>
        <button type="submit" class="btn btn-principal" id="bouton-chat">${ico('envoyer', 13)} Envoyer</button>
      </div>
    </form>`;

  const fil = $('fil-chat');
  const champ = $('champ-chat');
  const bouton = $('bouton-chat');
  const formulaire = $('envoi-chat');

  champ.addEventListener('input', () => {
    $('compteur-chat').textContent = champ.value.length + ' / 2000';
  });

  const ref = doc(bdd, 'conversations', utilisateur.uid);

  arreterEcouteChat = onSnapshot(ref, (instantane) => {
    const conv = instantane.exists() ? instantane.data() : { messages: [], tour: 'membre' };

    fil.innerHTML = conv.messages.length
      ? conv.messages.map((m) => `
          <div class="bulle ${m.de === 'membre' ? 'bulle-moi' : 'bulle-nadir'}">
            <span class="t-micro t-3">${m.de === 'membre' ? 'Toi' : 'Nadir'} · ${new Date(m.date).toLocaleDateString('fr-FR')}</span>
            <p>${echapper(m.texte)}</p>
          </div>`).join('')
      : '<p class="t-petit t-3" style="text-align:center;padding:24px 0">Aucun message pour l\'instant. Pose ta première question.</p>';
    fil.scrollTop = fil.scrollHeight;

    const monTour = conv.tour !== 'nadir';
    champ.disabled = !monTour;
    bouton.disabled = !monTour;
    champ.placeholder = monTour
      ? 'Ta question, avec le maximum de contexte…'
      : 'En attente de ma réponse : tu pourras écrire à nouveau juste après.';
  }, (err) => {
    console.error(err);
    fil.innerHTML = '<p class="t-micro t-3">Impossible de charger la conversation.</p>';
  });

  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte) return;
    bouton.disabled = true;

    try {
      const instantane = await getDoc(ref);
      const conv = instantane.exists() ? instantane.data() : { messages: [] };
      if (instantane.exists() && conv.tour === 'nadir') {
        toast('Un message à la fois : attends ma réponse.');
        return;
      }
      const message = { de: 'membre', texte, date: new Date().toISOString() };
      await setDoc(ref, {
        email: (utilisateur.email || '').toLowerCase(),
        messages: [...(conv.messages || []), message],
        dernier: message,
        tour: 'nadir',
        maj: new Date().toISOString(),
      });
      champ.value = '';
      $('compteur-chat').textContent = '0 / 2000';
      toast('Message envoyé. Je te réponds ici.');
    } catch (err) {
      console.error(err);
      toast('Envoi impossible. Réessaie dans un instant.');
      bouton.disabled = false;
    }
  });
}

/* --- L'avis sur la formation ---------------------------------------------- */
function afficherAvis() {
  const corps = $('support-corps');
  corps.innerHTML = `
    <div class="pile g-4" style="padding-block:var(--e-3)">
      <p class="t-petit t-2">Ton retour compte double : il m'aide à améliorer la
      formation, et il aide les suivants à se décider. Il sera relu avant
      d'apparaître sur le site, avec ton prénom uniquement.</p>
      <div class="pile g-2">
        <p class="t-petit t-fort">Ta note</p>
        <div class="choix-etoiles" id="choix-etoiles" role="radiogroup" aria-label="Note sur 5"></div>
      </div>
      <div>
        <label class="etiquette-champ" for="avis-prenom">Ton prénom (affiché)</label>
        <input class="champ" id="avis-prenom" maxlength="60" autocomplete="given-name">
      </div>
      <div>
        <label class="etiquette-champ" for="avis-texte">Ton avis</label>
        <textarea class="champ" id="avis-texte" rows="5" maxlength="1200"
          placeholder="Qu'est-ce que la formation t'a permis de faire ? Qu'est-ce qui t'a le plus servi ?"></textarea>
      </div>
      <button type="button" class="btn btn-principal btn-bloc" id="avis-envoyer">Envoyer mon avis</button>
      <p class="t-micro t-3" id="avis-etat"></p>
    </div>`;

  let note = 5;
  const zone = $('choix-etoiles');
  const peindre = () => {
    zone.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'etoile-btn' + (i <= note ? ' active' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === note));
      b.setAttribute('aria-label', i + ' sur 5');
      b.innerHTML = `<svg class="ico" width="22" height="22" viewBox="0 0 24 24" fill="${i <= note ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;
      b.addEventListener('click', () => { note = i; peindre(); });
      zone.appendChild(b);
    }
  };
  peindre();

  const ref = doc(bdd, 'avis', utilisateur.uid);
  getDoc(ref).then((d) => {
    if (!d.exists()) return;
    const v = d.data();
    note = v.note || 5; peindre();
    $('avis-prenom').value = v.prenom || '';
    $('avis-texte').value = v.texte || '';
    $('avis-etat').textContent = v.publie
      ? 'Ton avis est publié sur le site. Tu peux le modifier : il repassera en relecture.'
      : 'Ton avis est en relecture. Tu peux encore le modifier.';
  }).catch(() => {});

  $('avis-envoyer').addEventListener('click', async () => {
    const prenom = $('avis-prenom').value.trim();
    const texte = $('avis-texte').value.trim();
    if (!prenom || !texte) { toast('Prénom et avis, il me faut les deux.'); return; }
    try {
      await setDoc(ref, {
        note, prenom, texte,
        publie: false,
        offre: acheteur.offre || 'essentiel',
        date: new Date().toISOString(),
      });
      $('avis-etat').textContent = 'Merci. Ton avis part en relecture avant publication.';
      toast('Avis envoyé, merci.');
    } catch (err) {
      console.error(err);
      toast('Envoi impossible. Réessaie dans un instant.');
    }
  });
}

$('ouvrir-support').addEventListener('click', afficherSupport);
$('ouvrir-profil').addEventListener('click', afficherReglages);

/* ==========================================================================
   8. Protection du contenu

   Rien de « bloquant » : les blocs de code et les prompts restent
   copiables (c'est le produit). Le texte du cours, lui, ne se copie pas,
   ne s'imprime pas, et porte un filigrane discret au nom de l'acheteur.
   Le contenu n'existe que via Firestore, derrière le jeton de session.
   ========================================================================== */
function protegerContenu() {
  // 1. La copie du texte du cours est remplacée par une signature.
  document.addEventListener('copy', (e) => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) return;
    const noeud = sel.anchorNode && sel.anchorNode.parentElement;
    if (!noeud) return;
    if (!noeud.closest('.corps')) return;                       // hors cours : libre
    if (noeud.closest('pre, code, .prompt')) return;            // code : libre
    e.clipboardData.setData('text/plain',
      'Contenu protégé · Formation Capmedia Academy · ' + location.origin);
    e.preventDefault();
  });

  // 2. Pas de menu contextuel sur le texte du cours (le code reste libre).
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest ? e.target : e.target.parentElement;
    if (el && el.closest && el.closest('.corps') && !el.closest('pre, code, .prompt')) {
      e.preventDefault();
    }
  });

  // 3. Filigrane : l'adresse de l'acheteur, répétée, à peine visible.
  //    Dissuade le partage d'écran et de PDF sans gêner la lecture.
  const email = (utilisateur.email || '').toLowerCase();
  if (email) {
    const f = document.createElement('div');
    f.className = 'filigrane';
    f.setAttribute('aria-hidden', 'true');
    f.innerHTML = '<div class="nappe">' +
      Array.from({ length: 24 }, () => `<span>${echapper(email)}</span>`).join('') +
      '</div>';
    $('lecture').appendChild(f);
  }
}


/* --- Déconnexion --------------------------------------------------------- */
function deconnecter() {
  if (arreterEcouteSession) { arreterEcouteSession(); arreterEcouteSession = null; }
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

/* --- Barre de progression de lecture --------------------------------------- */
(function () {
  const barre = document.createElement('div');
  barre.className = 'barre-lecture';
  barre.innerHTML = '<span></span>';
  document.body.appendChild(barre);
  const arc = barre.firstChild;
  const maj = () => {
    const h = document.documentElement;
    const total = h.scrollHeight - h.clientHeight;
    arc.style.width = total > 0 ? Math.min(100, (h.scrollTop / total) * 100) + '%' : '0%';
  };
  maj();
  window.addEventListener('scroll', maj, { passive: true });
  window.addEventListener('resize', maj);
})();

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
