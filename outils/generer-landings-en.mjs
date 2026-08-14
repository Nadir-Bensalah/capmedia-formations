#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA ACADEMY · English landings generator

   From assets/js/catalogue-en.js, produces:
     en/formations/index.html       the English catalogue page (+ pack)
     en/formations/<slug>.html      one landing per course (mobile keeps
                                    its landing at en/index.html)

   Re-run after any catalogue change:
     node outils/generer-landings-en.mjs
   ========================================================================== */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const { default: C } = await import('../assets/js/catalogue-en.js');

const SITE = 'https://academy.capmedia.app';

const e = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --- The path and the standalone courses ----------------------------------- */
const PARCOURS = C.formations.filter((f) => f.acces !== 'solo').sort((a, b) => a.ordre - b.ordre);
const SOLOS = C.formations.filter((f) => f.acces === 'solo');
const PACK_PAYANTES = PARCOURS.filter((f) => f.acces === 'pack');
const GRATUITES = PARCOURS.filter((f) => f.acces === 'gratuit');

const NOMS_COURTS = {
  github: 'Git & GitHub',
  prompting: 'Prompting',
  'claude-code': 'Claude Code',
  firebase: 'Firebase',
  mobile: 'Your mobile app',
  'design-app': 'App design',
  aso: 'ASO',
  'seo-contenu': 'SEO & content',
};
const nomCourt = (f) => NOMS_COURTS[f.slug] || f.nom;

/* --- Icons (static render, same set as the French generator) --------------- */
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

/* --- Shared templates ------------------------------------------------------ */
const tete = (titre, desc, canonFr, jsonld) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(titre)}</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${SITE}/en/${canonFr}">
<link rel="alternate" hreflang="fr" href="${SITE}/${canonFr}">
<link rel="alternate" hreflang="en" href="${SITE}/en/${canonFr}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191919" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(titre)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="https://academy.capmedia.app/assets/img/og-en.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:url" content="${SITE}/en/${canonFr}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../../assets/css/tokens.css">
<link rel="stylesheet" href="../../assets/css/az.css">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="../../assets/img/apple-touch-icon.png">
<script>(function(){try{var t=localStorage.getItem('az:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>

<header class="entete" id="entete">
  <div class="enveloppe">
    <a href="../index.html" class="logo"><img class="marque" src="../../assets/img/logo-academy.png" alt="" width="22" height="22">Capmedia&nbsp;Academy</a>
    <nav class="nav-liens">
      <a href="./">Courses</a>
      <a href="./#pack">The Path</a>
      <a href="../index.html#faq">FAQ</a>
    </nav>
    <span style="margin-left:auto"></span>
    <a href="../../compte.html" class="lien-discret">My account</a>
    <a href="../../acces.html" class="btn btn-principal">Sign in</a>
  </div>
</header>
`;

const pied = `
<footer class="pied">
  <div class="enveloppe">
    <div class="rang" style="gap:var(--e-5);flex-wrap:wrap">
      <a href="./" class="t-petit">All courses</a>
      <a href="../../compte.html" class="t-petit">My account</a>
      <a href="../../mentions.html" class="t-petit">Legal notice</a>
      <a href="../../cgv.html" class="t-petit">Terms of sale</a>
      <a href="../../confidentialite.html" class="t-petit">Privacy</a>
      <a href="../../cookies.html" class="t-petit">Cookies</a>
      <button type="button" class="lien-nu t-petit" data-cookies-ouvrir style="padding:0;border:0;background:none;cursor:pointer">Manage cookies</button>
      <a href="mailto:contact@capmedia.tn" class="t-petit">Contact</a>
    </div>
    <hr class="filet" style="margin-block:var(--e-4)">
    <p class="t-micro t-3" style="display:flex;align-items:center;gap:8px;margin-bottom:var(--e-3)"><img src="../../assets/img/capmedia-digital.png" alt="Capmedia Digital" width="20" height="20">Capmedia Academy is a Capmedia Digital platform.</p>
    <p class="t-micro t-3">© 2026 Capmedia Academy · Nadir Ben Salah (Capmedia Digital) · SIREN 814&nbsp;051&nbsp;769 · Legal pages are in French</p>
  </div>
</footer>

<script src="../../assets/js/config.js"></script>
<script src="../../assets/js/theme.js"></script>
<script src="../../assets/js/cookies.js"></script>
<script type="module" src="../../assets/js/paiement.js"></script>
<script>
  (function(){var h=document.getElementById('entete');if(!h)return;
  var m=function(){h.classList.toggle('decolle',window.scrollY>8)};m();
  window.addEventListener('scroll',m,{passive:true});
  document.querySelectorAll('.apparait').forEach(function(x){x.classList.add('vu')});})();
</script>
</body>
</html>
`;

/* --- Course card (catalogue + cross-sell) ---------------------------------- */
function carte(f) {
  const lien = f.slug === 'mobile' ? '../index.html' : `./${f.slug}.html`;
  const anticipe = f.statut === 'acces-anticipe';
  const prixTxt = f.acces === 'gratuit' ? 'Free'
    : f.acces === 'pack' ? 'In the pack'
    : `€${f.prix}`;
  const sousTitre = f.acces === 'solo' ? e(f.duree) : `Step ${f.ordre} · ${e(f.duree)}`;
  return `      <a class="carte carte-formation" href="${lien}" data-slug="${f.slug}">
        <div class="rang-espace" style="align-items:flex-start">
          <span class="cf-ico">${ico(f.couleurIco || 'note', 17)}</span>
          <span class="pastille ${anticipe ? 'pastille--encours' : 'pastille--termine'}">${anticipe ? 'Early access' : 'Available'}</span>
        </div>
        <div class="pile g-1" style="margin-top:var(--e-3)">
          <p class="t-h3" style="font-size:17px">${e(f.nom)}</p>
          <p class="t-petit t-2">${e(f.courte)}</p>
        </div>
        <div class="rang-espace" style="margin-top:auto;padding-top:var(--e-4)">
          <span class="t-micro t-3">${sousTitre}</span>
          <span class="t-petit t-fort cf-prix" data-prix>${prixTxt}</span>
        </div>
        <span class="cf-possede masque"><span class="ico-coche">${ico('coche', 12)}</span> Yours</span>
      </a>`;
}

/* --- The pack card (catalogue + pack landings) ------------------------------ */
function cartePack() {
  return `    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <div class="rang-espace">
          <p class="t-h3">${e(C.pack.nom)}</p>
          <span class="pastille pastille--encours">Lifetime access</span>
        </div>
        <p class="t-petit t-2">The five paid courses of the path, in a single purchase.</p>
      </div>
      <div class="prix"><span class="montant">€${C.pack.prix}</span><span class="barre">€${C.pack.prixBarre}</span></div>
      <p class="t-micro t-3">One-time payment · Lifetime access · VAT not applicable</p>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
${PACK_PAYANTES.map((x) => `        <li>Step ${x.ordre} · ${e(x.nom)}</li>`).join('\n')}
        <li>The first 3 steps (${GRATUITES.map((x) => e(nomCourt(x))).join(', ')}) are free to get you started</li>
        <li>Lifetime access, updates included</li>
        <li>14-day money-back guarantee</li>
      </ul>
      <button type="button" class="btn btn-principal btn-large btn-bloc" data-pack="parcours">Unlock the path · €${C.pack.prix}</button>
    </div>`;
}

/* --- The path rail (free and pack landings) --------------------------------- */
function sectionParcours(f) {
  const etapes = PARCOURS.map((x) => {
    const courant = x.slug === f.slug;
    const lien = x.slug === 'mobile' ? '../index.html' : `./${x.slug}.html`;
    const marque = courant
      ? `<span class="pastille pastille--encours">You are here${x.acces === 'gratuit' ? ' · Free' : ''}</span>`
      : x.acces === 'gratuit'
        ? `<span class="pastille pastille--termine">Free</span>`
        : `<span class="t-micro t-3">Pack</span>`;
    return `      <li><a class="carte rang-espace" style="padding:12px 16px" href="${lien}"${courant ? ' aria-current="page"' : ''}>
        <span class="rang" style="gap:10px"><span class="num-acc">${String(x.ordre).padStart(2, '0')}</span><span class="t-petit ${courant ? 't-fort' : 't-2'}">${e(nomCourt(x))}</span></span>
        ${marque}
      </a></li>`;
  }).join('\n');
  return `
  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">The path</p>
      <h2 class="t-h1">Step ${f.ordre} of ${PARCOURS.length}.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">This course is one step of
      ${e(C.pack.nom)}: ${PARCOURS.length} courses in sequence, from your first line of
      code to your app published on the stores. The first three are free.</p>
    </div>
    <ol class="colonne" style="list-style:none;padding:0;margin:0;display:grid;gap:var(--e-2)">
${etapes}
    </ol>
  </section>
`;
}

/* ==========================================================================
   Catalogue page: en/formations/index.html
   ========================================================================== */
const jsonldCat = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Capmedia Academy courses',
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
  'All courses · Capmedia Academy',
  'The App Developer Path: eight courses in order, the first three free, one €297 purchase for everything else. Plus four standalone courses, sold on their own.',
  'formations/', jsonldCat,
);

cat += `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-4" style="max-width:760px">
      <p class="etiquette">The catalogue</p>
      <h1 class="t-h1" style="font-size:clamp(32px,5vw,52px)">One path, eight steps.<br>The first three are free.</h1>
      <p class="t-lead">${e(C.pack.nom)} takes you from your first line of code
      to your app published on the stores. You start for free, with a simple
      account, and unlock the rest in a single purchase. Alongside the path,
      four standalone courses, sold on their own.</p>
    </div>
  </section>

  <section>
    <div class="section-tete">
      <p class="etiquette">The path</p>
      <h2 class="t-h1">Eight steps, in order.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${PARCOURS.map((f) => carte(f)).join('\n')}
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-4)">Steps 1 to 3 are free
    for any signed-in account: an email is enough, no credit card. Steps 4 to 8
    unlock together, with the pack.</p>
  </section>

  <section id="pack">
    <div class="section-tete">
      <p class="etiquette">The pack</p>
      <h2 class="t-h1">${e(C.pack.nom)}.<br>One purchase, the whole path.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">The five paid
      courses of the path, unlocked at once, for €${C.pack.prix} instead of
      €${C.pack.prixBarre}. Lifetime access, updates included.</p>
    </div>
${cartePack()}
  </section>

  <section>
    <div class="section-tete">
      <p class="etiquette">On their own</p>
      <h2 class="t-h1">The standalone courses.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">Outside the path,
      sold individually, one price and lifetime access.</p>
    </div>
    <div class="grille grille-3 grille-catalogue">
${SOLOS.map((f) => carte(f)).join('\n')}
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-4)">Course content is
    available in English and French: switch languages anytime inside the
    member area.</p>
  </section>

</div>
</main>
`;
cat += pied;

/* ==========================================================================
   Individual landings: en/formations/<slug>.html
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
    inLanguage: 'en',
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    offers: gratuit
      ? [{ '@type': 'Offer', price: '0', priceCurrency: 'EUR', category: 'Free' }]
      : pack
        ? [{ '@type': 'Offer', name: C.pack.nom, price: String(C.pack.prix), priceCurrency: 'EUR', category: 'Paid' }]
        : [{ '@type': 'Offer', price: String(f.prix), priceCurrency: 'EUR', category: 'Paid' }],
  };

  let h = tete(`${f.nom} · Capmedia Academy`, f.accroche, `formations/${f.slug}.html`, jsonld);

  const pastilleStatut = anticipe
    ? (gratuit ? 'Early access' : 'Early access · launch pricing')
    : 'Available';
  const ctaHero = gratuit
    ? 'Start for free'
    : pack
      ? `Unlock with the path · €${C.pack.prix}`
      : `Join · €${f.prix}`;
  const sousHero = gratuit
    ? 'Free course, every module included · An email account is enough, no password · No credit card'
    : 'Instant lifetime access · 14-day money-back guarantee · Secure Stripe checkout';

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
        <a href="#programme" class="btn btn-secondaire btn-large">See the curriculum</a>
      </div>
      <p class="t-petit t-3">${sousHero}</p>
    </div>
  </section>

  <section class="apparait">
    <div class="colonne pile g-4">
      <p class="etiquette">The problem</p>
${(f.probleme || []).map((p, i) => `      <p class="${i === 0 ? 't-lead' : 't-corps t-2'}">${e(p)}</p>`).join('\n')}
    </div>
  </section>

  <section class="apparait">
    <div class="grille grille-2" style="gap:clamp(32px,6vw,72px);align-items:start">
      <div class="pile g-4">
        <p class="etiquette">This is for you if</p>
        <ul class="liste-marque">
${(f.publics || []).map((p) => `          <li>${e(p)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="pile g-4">
        <p class="etiquette">What you get</p>
        <ul class="liste-marque">
          <li>${f.modules.length} modules, in English and French, at your own pace</li>
          <li>Lifetime access, updates included</li>
          <li>The course adapts: with AI (copy-ready prompts) or without</li>
          <li>Support by messaging, answered by a real human</li>
${gratuit
    ? `          <li>All of it free: you just need an account, an email with no password</li>`
    : `          <li>14-day money-back guarantee (less than a third unlocked: see the Terms)</li>`}
        </ul>
      </div>
    </div>
  </section>

  <section id="programme" class="apparait">
    <div class="section-tete">
      <p class="etiquette">The curriculum</p>
      <h2 class="t-h1">${f.modules.length} modules. No gaps.</h2>
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
        <p><strong>Early access: what it means, precisely.</strong></p>
        <p>The introduction module is live today. The following modules are
        published every week, in the order of the curriculum above. ${gratuit
          ? `The course stays free, in full: every published module unlocks
        on your account, nothing to pay.`
          : `Your purchase covers everything, for life, at the launch price:
        it will go up once the course is complete. And the 14-day guarantee
        applies from day one.`}</p>
      </div>
    </div>
  </section>
` : ''}${f.acces === 'solo' ? '' : sectionParcours(f)}
  <section id="tarifs" class="apparait">
${gratuit ? `    <div class="section-tete">
      <p class="etiquette">Access</p>
      <h2 class="t-h1">Free, in full.</h2>
    </div>
    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <div class="rang-espace">
          <p class="t-h3">Free course</p>
          <span class="pastille pastille--termine">€0</span>
        </div>
        <p class="t-petit t-2">This course is part of ${e(C.pack.nom)} and it is
        free, in full: every module, nothing to pay.</p>
      </div>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
        <li>All ${f.modules.length} modules, unlocked</li>
        <li>An account is enough: your email, no password</li>
        <li>Lifetime access, updates included</li>
        <li>Support by messaging</li>
      </ul>
      <a href="../../acces.html" class="btn btn-principal btn-large btn-bloc">Start for free</a>
      <p class="t-micro t-3">Step ${f.ordre} of the path · no credit card required</p>
    </div>` : pack ? `    <div class="section-tete">
      <p class="etiquette">Pricing</p>
      <h2 class="t-h1">One purchase: the path.</h2>
    </div>
${cartePack()}
    <p class="t-petit t-3" style="margin-top:var(--e-3)">This course is step ${f.ordre} of the path: it unlocks with the pack.</p>` : `    <div class="section-tete">
      <p class="etiquette">Pricing</p>
      <h2 class="t-h1">One price. Lifetime access.</h2>
    </div>
    <div class="carte pile g-5" style="max-width:560px">
      <div class="pile g-1">
        <p class="t-h3">${e(f.nom)}</p>
        <p class="t-petit t-2">The whole course, one price.</p>
      </div>
      <div class="prix"><span class="montant">€${f.prix}</span><span class="barre">€${f.prixBarre}</span></div>
      <p class="t-micro t-3">One-time payment · Lifetime access · VAT not applicable</p>
      <hr class="filet" style="margin:0">
      <ul class="liste-marque">
        <li>All ${f.modules.length} modules, everything included: templates, models and prompt libraries too</li>
        <li>With-AI or without-AI mode, your choice</li>
        <li>Lifetime access, updates included</li>
        <li>Support by messaging</li>
        <li>14-day money-back guarantee</li>
      </ul>
      <button type="button" class="btn btn-principal btn-large btn-bloc" data-achat="${f.slug}:complet">Join · €${f.prix}</button>
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-3)">Standalone course, outside the path.</p>`}
  </section>

  <section id="faq" class="apparait">
    <div class="section-tete">
      <p class="etiquette">Questions</p>
      <h2 class="t-h1">Before you decide.</h2>
    </div>
    <div class="colonne">
${(f.faq || []).map((q) => `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">${e(q.q)}</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">${e(q.r)}</p></div>
      </details>`).join('\n')}
${gratuit ? `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Is it really free?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Yes: this course is a free step of ${e(C.pack.nom)}. Every module is open, no credit card is asked for. If you enjoy the path, the next steps unlock with the pack.</p></div>
      </details>
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">How do I access the course?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Create your account with your email, no password: the course unlocks immediately, in full. All your courses live in one place, under one email.</p></div>
      </details>` : `      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">How do I access the course after buying?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Instant access: you receive a sign-in link at the email address used for payment, no password to create. All your courses live in one place, under one email.</p></div>
      </details>
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">What if it is not for me?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">14-day money-back guarantee: one email, full refund, as long as less than a third of the modules have been unlocked (details in the Terms of sale).</p></div>
      </details>`}
    </div>
  </section>

  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">Keep going</p>
      <h2 class="t-h1">Continue the path.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${autresParcours.map((x) => carte(x)).join('\n')}
    </div>
  </section>

  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">On their own</p>
      <h2 class="t-h1">The standalone courses.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${autresSolos.map((x) => carte(x)).join('\n')}
    </div>
    <p style="margin-top:var(--e-4)"><a href="./" class="btn btn-secondaire">The full catalogue</a></p>
  </section>

</div>
</main>
`;
  h += pied;
  return h;
}

/* --- Write ------------------------------------------------------------------ */
mkdirSync(join(RACINE, 'en', 'formations'), { recursive: true });
writeFileSync(join(RACINE, 'en', 'formations', 'index.html'), cat, 'utf8');
console.log('written: en/formations/index.html');

for (const f of C.formations) {
  if (f.slug === 'mobile') continue;          // the flagship keeps en/index.html
  writeFileSync(join(RACINE, 'en', 'formations', `${f.slug}.html`), landing(f), 'utf8');
  console.log(`written: en/formations/${f.slug}.html`);
}
console.log('Done.');
