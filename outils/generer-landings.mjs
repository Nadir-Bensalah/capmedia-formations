#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA ACADEMY · Générateur de landings

   Depuis assets/js/catalogue.js, produit :
     formations/index.html          la page catalogue (+ pack)
     formations/<slug>.html         une landing par formation (sauf mobile,
                                    qui garde sa landing racine)

   Relancer après toute modification du catalogue :
     node outils/generer-landings.mjs
   ========================================================================== */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const { default: C } = await import('../assets/js/catalogue.js');

const SITE = 'https://academy.capmedia.app';

const e = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --- Le parcours et les solos ---------------------------------------------- */
const PARCOURS = C.formations.filter((f) => f.acces !== 'solo').sort((a, b) => a.ordre - b.ordre);
const SOLOS = C.formations.filter((f) => f.acces === 'solo');
const PACK_PAYANTES = PARCOURS.filter((f) => f.acces === 'pack');
const GRATUITES = PARCOURS.filter((f) => f.acces === 'gratuit');

const NOMS_COURTS = {
  github: 'Git & GitHub',
  prompting: 'Prompting',
  'claude-code': 'Claude Code',
  firebase: 'Firebase',
  mobile: 'Ton app mobile',
  'design-app': "Design d'app",
  aso: 'ASO',
  'seo-contenu': 'SEO & contenu',
};
const nomCourt = (f) => NOMS_COURTS[f.slug] || f.nom;

/* --- Icônes (extraites de icones.js, rendu statique) ---------------------- */
const TRACES = {
  telephone: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  cadenas: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ia: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  ordinateur: '<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>',
  engrenage: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  copier: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  etoile: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  action: '<circle cx="12" cy="12" r="10"/><polyline points="12 16 16 12 12 8"/><line x1="8" y1="12" x2="16" y2="12"/>',
  aide: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  coche: '<polyline points="20 6 9 17 4 12"/>',
};
const ico = (nom, taille = 18) =>
  `<svg class="ico" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACES[nom] || TRACES.note}</svg>`;

/* --- Gabarits communs ------------------------------------------------------ */
const tete = (titre, desc, canon, jsonld) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(titre)}</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${SITE}/${canon}">
<link rel="alternate" hreflang="fr" href="${SITE}/${canon}">
<link rel="alternate" hreflang="en" href="${SITE}/en/${canon}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191919" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(titre)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:locale" content="fr_FR">
<meta property="og:image" content="https://academy.capmedia.app/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:url" content="${SITE}/${canon}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../assets/css/tokens.css">
<link rel="stylesheet" href="../assets/css/az.css">
<link rel="icon" type="image/png" sizes="32x32" href="../assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="../assets/img/apple-touch-icon.png">
<script>(function(){try{var t=localStorage.getItem('az:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>

<header class="entete" id="entete">
  <div class="enveloppe">
    <a href="../" class="logo"><img class="marque" src="../assets/img/logo-academy.png" alt="" width="22" height="22">Capmedia&nbsp;Academy</a>
    <nav class="nav-liens">
      <a href="./">Formations</a>
      <a href="./#pack">Le Parcours</a>
      <a href="../#faq">FAQ</a>
    </nav>
    <span style="margin-left:auto"></span>
    <a href="../compte" class="lien-discret">Mon espace</a>
    <a href="../acces" class="btn btn-principal">Se connecter</a>
  </div>
</header>
`;

const pied = `
<footer class="pied">
  <div class="enveloppe">
    <div class="rang" style="gap:var(--e-5);flex-wrap:wrap">
      <a href="./" class="t-petit">Toutes les formations</a>
      <a href="../compte" class="t-petit">Mon espace</a>
      <a href="../mentions" class="t-petit">Mentions légales</a>
      <a href="../cgv" class="t-petit">CGV</a>
      <a href="../confidentialite" class="t-petit">Confidentialité</a>
      <a href="../cookies" class="t-petit">Cookies</a>
      <button type="button" class="lien-nu t-petit" data-cookies-ouvrir style="padding:0;border:0;background:none;cursor:pointer">Gérer les cookies</button>
      <a href="mailto:contact@capmedia.tn" class="t-petit">Contact</a>
    </div>
    <hr class="filet" style="margin-block:var(--e-4)">
    <p class="t-micro t-3" style="display:flex;align-items:center;gap:8px;margin-bottom:var(--e-3)"><img src="../assets/img/capmedia-digital.png" alt="Capmedia Digital" width="20" height="20">Capmedia Academy est une plateforme de Capmedia Digital.</p>
    <p class="t-micro t-3">© 2026 Capmedia Academy · Nadir Ben Salah (Capmedia Digital) · SIREN 814&nbsp;051&nbsp;769</p>
  </div>
</footer>

<script src="../assets/js/config.js"></script>
<script src="../assets/js/theme.js"></script>
<script src="../assets/js/cookies.js"></script>
<script type="module" src="../assets/js/paiement.js"></script>
<script>
  (function(){var h=document.getElementById('entete');if(!h)return;
  var m=function(){h.classList.toggle('decolle',window.scrollY>8)};m();
  window.addEventListener('scroll',m,{passive:true});
  document.querySelectorAll('.apparait').forEach(function(x){x.classList.add('vu')});})();
</script>
</body>
</html>
`;

/* --- Carte de formation (réutilisée catalogue + cross-sell) --------------- */
function carte(f) {
  const lien = f.slug === 'mobile' ? '../index.html' : `./${f.slug}.html`;
  const anticipe = f.statut === 'acces-anticipe';
  const prixTxt = f.acces === 'gratuit' ? 'Offerte'
    : f.acces === 'pack' ? 'Dans le pack'
    : `${f.prix} €`;
  const sousTitre = f.acces === 'solo' ? e(f.duree) : `Étape ${f.ordre} · ${e(f.duree)}`;
  return `      <a class="carte carte-formation" href="${lien}" data-slug="${f.slug}">
        <div class="rang-espace" style="align-items:flex-start">
          <span class="cf-ico">${ico(f.couleurIco || 'note', 17)}</span>
          <span class="pastille ${anticipe ? 'pastille--encours' : 'pastille--termine'}">${anticipe ? 'Accès anticipé' : 'Disponible'}</span>
        </div>
        <div class="pile g-1" style="margin-top:var(--e-3)">
          <p class="t-h3" style="font-size:17px">${e(f.nom)}</p>
          <p class="t-petit t-2">${e(f.courte)}</p>
        </div>
        <div class="rang-espace" style="margin-top:auto;padding-top:var(--e-4)">
          <span class="t-micro t-3">${sousTitre}</span>
          <span class="t-petit t-fort cf-prix" data-prix>${prixTxt}</span>
        </div>
        <span class="cf-possede masque"><span class="ico-coche">${ico('coche', 12)}</span> À toi</span>
      </a>`;
}

/* --- Carte du pack (catalogue + landings pack) ----------------------------- */
function cartePack() {
  return `    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <div class="rang-espace">
          <p class="t-h3">${e(C.pack.nom)}</p>
          <span class="pastille pastille--encours">Accès à vie</span>
        </div>
        <p class="t-petit t-2">Les cinq formations payantes du parcours, en un seul achat.</p>
      </div>
      <div class="prix"><span class="montant">${C.pack.prix} €</span></div>
      <p class="t-micro t-3">Paiement unique · Accès à vie · TVA non applicable</p>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
${PACK_PAYANTES.map((x) => `        <li>Étape ${x.ordre} · ${e(x.nom)}</li>`).join('\n')}
        <li>Les 3 premières étapes (${GRATUITES.map((x) => e(nomCourt(x))).join(', ')}) sont offertes pour commencer</li>
        <li><strong>La revue personnelle de ton application</strong> avant sa soumission à Apple : retour écrit sous 7 jours ouvrés, incluse</li>
        <li>Accès à vie, mises à jour comprises</li>
        <li>Satisfait ou remboursé 14 jours</li>
      </ul>
      <button type="button" class="btn btn-principal btn-large btn-bloc" data-pack="parcours">Débloquer le parcours · ${C.pack.prix} €</button>
    </div>`;
}

/* --- Le fil du parcours (landings gratuites et pack) ----------------------- */
function sectionParcours(f) {
  const etapes = PARCOURS.map((x) => {
    const courant = x.slug === f.slug;
    const lien = x.slug === 'mobile' ? '../index.html' : `./${x.slug}.html`;
    const marque = courant
      ? `<span class="pastille pastille--encours">Tu es ici${x.acces === 'gratuit' ? ' · Offerte' : ''}</span>`
      : x.acces === 'gratuit'
        ? `<span class="pastille pastille--termine">Offerte</span>`
        : `<span class="t-micro t-3">Pack</span>`;
    return `      <li><a class="carte rang-espace" style="padding:12px 16px" href="${lien}"${courant ? ' aria-current="page"' : ''}>
        <span class="rang" style="gap:10px"><span class="num-acc">${String(x.ordre).padStart(2, '0')}</span><span class="t-petit ${courant ? 't-fort' : 't-2'}">${e(nomCourt(x))}</span></span>
        ${marque}
      </a></li>`;
  }).join('\n');
  return `
  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">Le parcours</p>
      <h2 class="t-h1">Étape ${f.ordre} sur ${PARCOURS.length}.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">Cette formation est une étape
      du ${e(C.pack.nom)} : ${PARCOURS.length} formations qui se suivent, de ta première
      ligne de code à ton app publiée sur les stores. Les trois premières sont offertes.</p>
    </div>
    <ol class="colonne" style="list-style:none;padding:0;margin:0;display:grid;gap:var(--e-2)">
${etapes}
    </ol>
  </section>
`;
}

/* ==========================================================================
   Page catalogue : formations/index.html
   ========================================================================== */
const jsonldCat = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Les formations Capmedia Academy',
  itemListElement: C.formations.map((f, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: { '@type': 'Course', name: f.nom, description: f.courte,
      provider: { '@type': 'Organization', name: 'Capmedia Academy' },
      offers: [{ '@type': 'Offer',
        price: f.acces === 'gratuit' ? '0' : f.acces === 'pack' ? String(C.pack.prix) : String(f.prix),
        priceCurrency: 'EUR', category: f.acces === 'gratuit' ? 'Free' : 'Paid' }],
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' } },
  })),
};

let cat = tete(
  'Toutes les formations · Capmedia Academy',
  "Le Parcours Développeur d'Apps : huit formations dans l'ordre, les trois premières offertes, un seul achat de 297 € pour tout le reste. Plus quatre formations indépendantes, à l'unité.",
  'formations/', jsonldCat,
);

cat += `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-4" style="max-width:760px">
      <p class="etiquette">Le catalogue</p>
      <h1 class="t-h1" style="font-size:clamp(32px,5vw,52px)">Un parcours, huit étapes.<br>Les trois premières offertes.</h1>
      <p class="t-lead">Le ${e(C.pack.nom)} t'emmène de ta première ligne de code
      à ton app publiée sur les stores. Tu commences gratuitement, avec un simple
      compte, et tu débloques la suite en un seul achat. À côté du parcours,
      quatre formations indépendantes, à l'unité.</p>
    </div>
  </section>

  <section>
    <div class="section-tete">
      <p class="etiquette">Le parcours</p>
      <h2 class="t-h1">Huit étapes, dans l'ordre.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${PARCOURS.map((f) => carte(f)).join('\n')}
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-4)">Les étapes 1 à 3 sont
    offertes à tout compte connecté : un e-mail suffit, aucune carte bancaire.
    Les étapes 4 à 8 se débloquent ensemble, avec le pack.</p>
  </section>

  <section id="pack">
    <div class="section-tete">
      <p class="etiquette">Le pack</p>
      <h2 class="t-h1">${e(C.pack.nom)}.<br>Un achat, tout le parcours.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">Les cinq formations
      payantes du parcours, débloquées d'un coup, pour ${C.pack.prix} € (ou
      3 fois sans frais). Accès à vie, mises à jour comprises.</p>
    </div>
${cartePack()}
  </section>

  <section>
    <div class="section-tete">
      <p class="etiquette">À part</p>
      <h2 class="t-h1">Les formations indépendantes.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">Hors parcours,
      à l'unité, prix unique et accès à vie.</p>
    </div>
    <div class="grille grille-3 grille-catalogue">
${SOLOS.map((f) => carte(f)).join('\n')}
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-4)">Les formations en accès
    anticipé publient leurs modules chaque semaine : le premier est en ligne,
    le prix de lancement couvre tout, à vie.</p>
  </section>

</div>
</main>
`;
cat += pied;

/* ==========================================================================
   Landings individuelles : formations/<slug>.html
   ========================================================================== */
function landing(f) {
  const anticipe = f.statut === 'acces-anticipe';
  const gratuit = f.acces === 'gratuit';
  const pack = f.acces === 'pack';
  const autresParcours = PARCOURS.filter((x) => x.slug !== f.slug);
  const autresSolos = SOLOS.filter((x) => x.slug !== f.slug);

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: f.nom,
    description: f.accroche,
    provider: { '@type': 'Organization', name: 'Capmedia Academy', url: `${SITE}/` },
    inLanguage: 'fr',
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    offers: gratuit
      ? [{ '@type': 'Offer', price: '0', priceCurrency: 'EUR', category: 'Free' }]
      : pack
        ? [{ '@type': 'Offer', name: C.pack.nom, price: String(C.pack.prix), priceCurrency: 'EUR', category: 'Paid' }]
        : [{ '@type': 'Offer', price: String(f.prix), priceCurrency: 'EUR', category: 'Paid' }],
  };

  let h = tete(`${f.nom} · Capmedia Academy`, f.accroche, `formations/${f.slug}.html`, jsonld);

  const pastilleStatut = anticipe
    ? (gratuit ? 'Accès anticipé' : 'Accès anticipé · prix de lancement')
    : 'Disponible';
  const ctaHero = gratuit
    ? 'Commencer gratuitement'
    : pack
      ? `Débloquer avec le parcours · ${C.pack.prix} €`
      : `Rejoindre · ${f.prix} €`;
  const sousHero = gratuit
    ? 'Formation offerte, tous les modules · Un compte e-mail suffit, sans mot de passe · Aucune carte bancaire'
    : 'Accès immédiat, à vie · Satisfait ou remboursé 14 jours · Paiement sécurisé Stripe';

  h += `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-5" style="max-width:800px">
      <div class="rang" style="gap:10px">
        <span class="pastille ${anticipe ? 'pastille--encours' : 'pastille--termine'}">${pastilleStatut}</span>
        <span class="t-micro t-3">${e(f.niveau)} · ${e(f.duree)}</span>
      </div>
      <h1 class="t-h1" style="font-size:clamp(32px,5vw,54px)">${e(f.nom)}</h1>
      <p class="t-lead" style="max-width:640px">${e(f.accroche)}</p>
      <div class="rang" style="gap:var(--e-3)">
        <a href="#tarifs" class="btn btn-principal btn-large">${ctaHero}</a>
        <a href="#programme" class="btn btn-secondaire btn-large">Voir le programme</a>
      </div>
      <p class="t-petit t-3">${sousHero}</p>
    </div>
  </section>

  <section class="apparait">
    <div class="colonne pile g-4">
      <p class="etiquette">Le problème</p>
${(f.probleme || []).map((p, i) => `      <p class="${i === 0 ? 't-lead' : 't-corps t-2'}">${e(p)}</p>`).join('\n')}
    </div>
  </section>

  <section class="apparait">
    <div class="grille grille-2" style="gap:clamp(32px,6vw,72px);align-items:start">
      <div class="pile g-4">
        <p class="etiquette">C'est pour toi si</p>
        <ul class="liste-marque">
${(f.publics || []).map((p) => `          <li>${e(p)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="pile g-4">
        <p class="etiquette">Ce que tu obtiens</p>
        <ul class="liste-marque">
          <li>${f.modules.length} modules écrits en français, sans jargon, à ton rythme</li>
          <li>Accès à vie, mises à jour comprises</li>
          <li>La formation s'adapte : avec IA (prompts prêts à copier) ou sans</li>
          <li>Le support par messagerie, un vrai humain qui répond</li>
${gratuit
    ? `          <li>Le tout offert, entièrement : il te faut juste un compte, un e-mail sans mot de passe</li>`
    : `          <li>Satisfait ou remboursé 14 jours (moins d'un tiers débloqué : voir CGV)</li>`}
        </ul>
      </div>
    </div>
  </section>

  <section id="programme" class="apparait">
    <div class="section-tete">
      <p class="etiquette">Le programme</p>
      <h2 class="t-h1">${f.modules.length} modules. Aucun trou.</h2>
    </div>
    <div class="colonne">
${f.modules.map((m, i) => `      <details class="acc"${i === 0 ? ' open' : ''}>
        <summary><span class="chevron" aria-hidden="true">›</span><span class="num-acc">${String(i + 1).padStart(2, '0')}</span><span class="titre-acc">${e(m.t)}</span></summary>
        <div class="corps-acc"><ul>
${m.pts.map((p) => `          <li>${e(p)}</li>`).join('\n')}
        </ul></div>
      </details>`).join('\n')}
    </div>
  </section>
${anticipe ? `
  <section class="apparait">
    <div class="encadre encadre--attention colonne">
      <span class="marqueur">${ico('note', 18)}</span>
      <div>
        <p><strong>Accès anticipé : ce que ça veut dire, précisément.</strong></p>
        <p>Le module d'introduction est en ligne aujourd'hui. Les modules
        suivants sont publiés chaque semaine, dans l'ordre du programme
        ci-dessus. ${gratuit
          ? `La formation reste offerte, en entier : chaque module publié se
        débloque sur ton compte, sans rien payer.`
          : `Ton achat couvre tout, à vie, au prix de lancement : il
        augmentera à la publication complète. Et la garantie 14 jours
        s'applique dès aujourd'hui.`}</p>
      </div>
    </div>
  </section>
` : ''}${f.acces === 'solo' ? '' : sectionParcours(f)}
  <section id="tarifs" class="apparait">
${gratuit ? `    <div class="section-tete">
      <p class="etiquette">Accès</p>
      <h2 class="t-h1">Offerte, entièrement.</h2>
    </div>
    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <div class="rang-espace">
          <p class="t-h3">Formation offerte</p>
          <span class="pastille pastille--termine">0 €</span>
        </div>
        <p class="t-petit t-2">Cette formation fait partie du ${e(C.pack.nom)} et elle
        est offerte, entièrement : tous les modules, sans rien payer.</p>
      </div>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
        <li>Les ${f.modules.length} modules, tous débloqués</li>
        <li>Un compte suffit : ton e-mail, sans mot de passe</li>
        <li>Accès à vie, mises à jour comprises</li>
        <li>Le support par messagerie</li>
      </ul>
      <a href="../acces" class="btn btn-principal btn-large btn-bloc">Commencer gratuitement</a>
      <p class="t-micro t-3">Étape ${f.ordre} du parcours · aucune carte bancaire demandée</p>
    </div>` : pack ? `    <div class="section-tete">
      <p class="etiquette">Tarif</p>
      <h2 class="t-h1">Un seul achat : le parcours.</h2>
    </div>
${cartePack()}
    <p class="t-petit t-3" style="margin-top:var(--e-3)">Cette formation est l'étape ${f.ordre} du parcours : elle se débloque avec le pack.</p>` : `    <div class="section-tete">
      <p class="etiquette">Tarif</p>
      <h2 class="t-h1">Un prix unique. Accès à vie.</h2>
    </div>
    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <p class="t-h3">${e(f.nom)}</p>
        <p class="t-petit t-2">Tout le contenu de la formation, en un seul prix.</p>
      </div>
      <div class="prix"><span class="montant">${f.prix} €</span></div>
      <p class="t-micro t-3">Paiement unique · Accès à vie · TVA non applicable</p>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
        <li>Les ${f.modules.length} modules, tout inclus : gabarits, modèles et bibliothèques de prompts compris</li>
        <li>Mode avec IA ou sans IA, au choix</li>
        <li>Accès à vie, mises à jour comprises</li>
        <li>Le support par messagerie</li>
        <li>Satisfait ou remboursé 14 jours</li>
      </ul>
      <button type="button" class="btn btn-principal btn-large btn-bloc" data-achat="${f.slug}:complet">Rejoindre · ${f.prix} €</button>
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-3)">Formation indépendante, hors parcours.</p>`}
  </section>

  <section id="faq" class="apparait">
    <div class="section-tete">
      <p class="etiquette">Questions</p>
      <h2 class="t-h1">Avant de te décider.</h2>
    </div>
    <div class="colonne">
${(f.faq || []).map((q) => `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">${e(q.q)}</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">${e(q.r)}</p></div>
      </details>`).join('\n')}
${gratuit ? `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">C'est vraiment gratuit ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Oui : cette formation est une étape offerte du ${e(C.pack.nom)}. Tous les modules sont ouverts, aucune carte bancaire n'est demandée. Si le parcours te plaît, la suite se débloque avec le pack.</p></div>
      </details>
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Comment j'accède à la formation ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Crée ton compte avec ton e-mail, sans mot de passe : la formation se débloque immédiatement, en entier. Toutes tes formations vivent au même endroit, sous le même e-mail.</p></div>
      </details>` : `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Comment j'accède à la formation après l'achat ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Accès immédiat : tu reçois un lien de connexion à l'adresse utilisée pour le paiement, sans mot de passe à créer. Toutes tes formations vivent au même endroit, sous le même e-mail.</p></div>
      </details>
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Et si ça ne me convient pas ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Satisfait ou remboursé 14 jours : un e-mail, remboursement intégral, tant que moins d'un tiers des modules a été débloqué (détails dans les CGV).</p></div>
      </details>`}
    </div>
  </section>

  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">Continuer</p>
      <h2 class="t-h1">Continuer le parcours.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${autresParcours.map((x) => carte(x)).join('\n')}
    </div>
  </section>

  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">À part</p>
      <h2 class="t-h1">Les formations à part.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${autresSolos.map((x) => carte(x)).join('\n')}
    </div>
    <p style="margin-top:var(--e-4)"><a href="./" class="btn btn-secondaire">Tout le catalogue</a></p>
  </section>

</div>
</main>
`;
  h += pied;
  return h;
}

/* --- Écriture -------------------------------------------------------------- */
mkdirSync(join(RACINE, 'formations'), { recursive: true });
writeFileSync(join(RACINE, 'formations', 'index.html'), cat, 'utf8');
console.log('écrit : formations/index.html');

for (const f of C.formations) {
  if (f.slug === 'mobile') continue;          // la signature garde sa landing racine
  writeFileSync(join(RACINE, 'formations', `${f.slug}.html`), landing(f), 'utf8');
  console.log(`écrit : formations/${f.slug}.html`);
}
console.log('Terminé.');
