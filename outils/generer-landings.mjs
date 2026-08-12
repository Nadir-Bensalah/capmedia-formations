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

const SITE = 'https://nadir-bensalah.github.io/capmedia-formations';

const e = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191919" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(titre)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${SITE}/${canon}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../assets/css/tokens.css">
<link rel="stylesheet" href="../assets/css/az.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%2337352F'/><text y='71' x='50' text-anchor='middle' font-size='60' font-weight='700' font-family='Inter,Helvetica,sans-serif' fill='%23fff'>C</text></svg>">
<script>(function(){try{var t=localStorage.getItem('az:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>

<header class="entete" id="entete">
  <div class="enveloppe">
    <a href="../index.html" class="logo"><span class="marque">C</span>Capmedia&nbsp;Academy</a>
    <nav class="nav-liens">
      <a href="./">Formations</a>
      <a href="./#pack">Le Pack</a>
      <a href="../index.html#faq">FAQ</a>
    </nav>
    <span style="margin-left:auto"></span>
    <a href="../compte.html" class="lien-discret">Mon espace</a>
    <a href="../acces.html" class="btn btn-principal">Se connecter</a>
  </div>
</header>
`;

const pied = `
<footer class="pied">
  <div class="enveloppe">
    <div class="rang" style="gap:var(--e-5);flex-wrap:wrap">
      <a href="./" class="t-petit">Toutes les formations</a>
      <a href="../compte.html" class="t-petit">Mon espace</a>
      <a href="../mentions.html" class="t-petit">Mentions légales</a>
      <a href="../cgv.html" class="t-petit">CGV</a>
      <a href="../confidentialite.html" class="t-petit">Confidentialité</a>
      <a href="../cookies.html" class="t-petit">Cookies</a>
      <button type="button" class="lien-nu t-petit" data-cookies-ouvrir style="padding:0;border:0;background:none;cursor:pointer">Gérer les cookies</button>
      <a href="mailto:contact@capmedia.tn" class="t-petit">Contact</a>
    </div>
    <hr class="filet" style="margin-block:var(--e-4)">
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
function carte(f, depuis) {
  const lien = f.slug === 'mobile' ? '../index.html' : `./${f.slug}.html`;
  const anticipe = f.statut === 'acces-anticipe';
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
          <span class="t-micro t-3">${e(f.duree)}</span>
          <span class="t-petit t-fort cf-prix" data-prix>dès ${f.prixE} €</span>
        </div>
        <span class="cf-possede masque"><span class="ico-coche">${ico('coche', 12)}</span> À toi</span>
      </a>`;
}

/* ==========================================================================
   Page catalogue : formations/index.html
   ========================================================================== */
const basic = C.prixPack('basic');
const avance = C.prixPack('avance');

const jsonldCat = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Les formations Capmedia Academy',
  itemListElement: C.formations.map((f, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: { '@type': 'Course', name: f.nom, description: f.courte,
      provider: { '@type': 'Organization', name: 'Capmedia Academy' },
      offers: [{ '@type': 'Offer', price: String(f.prixE), priceCurrency: 'EUR', category: 'Paid' }],
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' } },
  })),
};

let cat = tete(
  'Toutes les formations · Capmedia Academy',
  "Créer une app, un site, automatiser avec l'IA, encaisser avec Stripe, être trouvé sur les stores : des formations en français qui partent vraiment de zéro. Et le Pack qui donne tout, moins 30 %.",
  'formations/', jsonldCat,
);

cat += `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-4" style="max-width:760px">
      <p class="etiquette">Le catalogue</p>
      <h1 class="t-h1" style="font-size:clamp(32px,5vw,52px)">Des formations qui partent<br>vraiment de zéro.</h1>
      <p class="t-lead">Une compétence par formation, en français, sans jargon,
      avec l'IA comme outil de travail. Achète à l'unité, ou prends tout avec
      le Pack. Ce que tu possèdes déjà se déduit automatiquement.</p>
    </div>
  </section>

  <section>
    <div class="grille grille-3 grille-catalogue">
${C.formations.map((f) => carte(f)).join('\n')}
    </div>
    <p class="t-micro t-3" style="margin-top:var(--e-4)">Les formations en accès
    anticipé publient leurs modules chaque semaine : le premier est en ligne,
    le prix de lancement couvre tout, à vie.</p>
  </section>

  <section id="pack">
    <div class="section-tete">
      <p class="etiquette">Le Pack Academy</p>
      <h2 class="t-h1">Tout. Moins 30 %.<br>Et ton prorata déduit.</h2>
      <p class="t-lead colonne" style="margin-top:var(--e-2)">Les ${C.formations.length} formations,
      celles qui arrivent pendant un an incluses, en un seul achat. Et si tu as
      déjà acheté des formations, leur prix se déduit du Pack, automatiquement.</p>
    </div>

    <div class="grille grille-2 cartes-prix" style="max-width:900px">
      <div class="carte pile g-5">
        <div class="pile g-1">
          <p class="t-h3">Pack Basic</p>
          <p class="t-petit t-2">Toutes les formations, offre Essentiel.</p>
        </div>
        <div class="prix"><span class="montant" data-prix-pack="basic">${basic.prix} €</span><span class="barre">${basic.plein} €</span></div>
        <p class="t-micro t-3" data-note-pack="basic">Paiement unique · Accès à vie · Moins 30 % sur le total</p>
        <hr class="filet" style="margin:0">
        <ul class="liste-marque">
          <li>Les ${C.formations.length} formations, offre Essentiel</li>
          <li>Toutes les formations publiées dans les 12 prochains mois</li>
          <li>Toutes les mises à jour, à vie</li>
          <li>Le support par messagerie</li>
        </ul>
        <button type="button" class="btn btn-secondaire btn-large btn-bloc" data-pack="basic">Prendre le Pack Basic</button>
      </div>
      <div class="carte pile g-5">
        <div class="pile g-1">
          <div class="rang-espace">
            <p class="t-h3">Pack Avancé</p>
            <span class="pastille pastille--encours">Le meilleur rapport</span>
          </div>
          <p class="t-petit t-2">Toutes les formations, offre Complète.</p>
        </div>
        <div class="prix"><span class="montant" data-prix-pack="avance">${avance.prix} €</span><span class="barre">${avance.plein} €</span></div>
        <p class="t-micro t-3" data-note-pack="avance">Paiement unique · Accès à vie · Moins 30 % sur le total</p>
        <hr class="filet" style="margin:0">
        <ul class="liste-marque">
          <li>Les ${C.formations.length} formations, offre Complète</li>
          <li>La revue personnelle de ton app (formation mobile)</li>
          <li>Tous les codes sources, kits et bibliothèques de prompts</li>
          <li>Toutes les formations à venir pendant 12 mois, en Complet</li>
        </ul>
        <button type="button" class="btn btn-principal btn-large btn-bloc" data-pack="avance">Prendre le Pack Avancé</button>
      </div>
    </div>

    <div class="encadre encadre--astuce" style="max-width:900px">
      <span class="marqueur">${ico('aide', 18)}</span>
      <div>
        <p><strong>Déjà client ? Ton prix est plus bas que celui affiché.</strong></p>
        <p>Connecte-toi : chaque formation que tu possèdes se déduit du Pack,
        en euros et en pourcentage. Le calcul se fait côté serveur, sur ton
        compte, au moment du paiement. Un client qui a tout acheté sauf une
        formation ne paie que le plancher de ${C.pack.plancher} €.</p>
      </div>
    </div>
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
  const autres = C.formations.filter((x) => x.slug !== f.slug).slice(0, 6);

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: f.nom,
    description: f.accroche,
    provider: { '@type': 'Organization', name: 'Capmedia Academy', url: `${SITE}/` },
    inLanguage: 'fr',
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    offers: [
      { '@type': 'Offer', name: 'Essentiel', price: String(f.prixE), priceCurrency: 'EUR', category: 'Paid' },
      { '@type': 'Offer', name: 'Complet', price: String(f.prixC), priceCurrency: 'EUR', category: 'Paid' },
    ],
  };

  let h = tete(`${f.nom} · Capmedia Academy`, f.accroche, `formations/${f.slug}.html`, jsonld);

  h += `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-5" style="max-width:800px">
      <div class="rang" style="gap:10px">
        <span class="pastille ${anticipe ? 'pastille--encours' : 'pastille--termine'}">${anticipe ? 'Accès anticipé · prix de lancement' : 'Disponible'}</span>
        <span class="t-micro t-3">${e(f.niveau)} · ${e(f.duree)}</span>
      </div>
      <h1 class="t-h1" style="font-size:clamp(32px,5vw,54px)">${e(f.nom)}</h1>
      <p class="t-lead" style="max-width:640px">${e(f.accroche)}</p>
      <div class="rang" style="gap:var(--e-3)">
        <a href="#tarifs" class="btn btn-principal btn-large">Rejoindre · ${f.prixE} €</a>
        <a href="#programme" class="btn btn-secondaire btn-large">Voir le programme</a>
      </div>
      <p class="t-petit t-3">Accès immédiat, à vie · Garantie 30 jours · Paiement sécurisé Stripe</p>
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
          <li>Garantie 30 jours : un e-mail, remboursement intégral</li>
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
        ci-dessus. Ton achat couvre tout, à vie, au prix de lancement : il
        augmentera à la publication complète. Et la garantie 30 jours
        s'applique dès aujourd'hui, sans condition.</p>
      </div>
    </div>
  </section>
` : ''}
  <section id="tarifs" class="apparait">
    <div class="section-tete">
      <p class="etiquette">Tarifs</p>
      <h2 class="t-h1">Deux offres. Accès à vie.</h2>
    </div>
    <div class="grille grille-2 cartes-prix" style="max-width:900px">
      <div class="carte pile g-5">
        <div class="pile g-1">
          <p class="t-h3">Essentiel</p>
          <p class="t-petit t-2">La formation complète.</p>
        </div>
        <div class="prix"><span class="montant">${f.prixE} €</span><span class="barre">${f.prixEBarre} €</span></div>
        <p class="t-micro t-3">Paiement unique · Accès à vie · TVA non applicable</p>
        <hr class="filet" style="margin:0">
        <ul class="liste-marque">
          <li>Les ${f.modules.length} modules, en français</li>
          <li>Mode avec IA ou sans IA, au choix</li>
          <li>Toutes les mises à jour, à vie</li>
          <li>Le support par messagerie</li>
        </ul>
        <button type="button" class="btn btn-secondaire btn-large btn-bloc" data-achat="${f.slug}:essentiel">Prendre l'Essentiel</button>
      </div>
      <div class="carte pile g-5">
        <div class="pile g-1">
          <div class="rang-espace">
            <p class="t-h3">Complet</p>
            <span class="pastille pastille--encours">Recommandé</span>
          </div>
          <p class="t-petit t-2">La formation, plus les outils qui font gagner des semaines.</p>
        </div>
        <div class="prix"><span class="montant">${f.prixC} €</span><span class="barre">${f.prixCBarre} €</span></div>
        <p class="t-micro t-3">Paiement unique · Accès à vie · TVA non applicable</p>
        <hr class="filet" style="margin:0">
        <ul class="liste-marque">
          <li><strong>Tout l'Essentiel</strong>, plus :</li>
          <li>Les gabarits, modèles et bibliothèques de prompts de la formation</li>
          <li>Les études de cas complètes et leurs fichiers</li>
          <li>La priorité sur le support</li>
        </ul>
        <button type="button" class="btn btn-principal btn-large btn-bloc" data-achat="${f.slug}:complet">Prendre le Complet</button>
      </div>
    </div>

    <div class="encadre encadre--astuce" style="max-width:900px">
      <span class="marqueur">${ico('etoile', 18)}</span>
      <div>
        <p><strong>Tu comptes en suivre plusieurs ? Regarde le Pack.</strong></p>
        <p>Toutes les formations, moins 30 % sur le total, et ce que tu possèdes
        déjà se déduit automatiquement. <a href="./#pack">Voir le Pack Academy</a>.</p>
      </div>
    </div>
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
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Comment j'accède à la formation après l'achat ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Accès immédiat : tu reçois un lien de connexion à l'adresse utilisée pour le paiement, sans mot de passe à créer. Toutes tes formations vivent au même endroit, sous le même e-mail.</p></div>
      </details>
      <details class="acc">
        <summary><span class="chevron" aria-hidden="true">›</span><span class="titre-acc">Et si ça ne me convient pas ?</span></summary>
        <div class="corps-acc"><p class="t-corps t-2">Garantie 30 jours, sans discussion : un e-mail, remboursement intégral, sans justification à fournir.</p></div>
      </details>
    </div>
  </section>

  <section class="apparait">
    <div class="section-tete">
      <p class="etiquette">Continuer</p>
      <h2 class="t-h1">Les autres formations.</h2>
    </div>
    <div class="grille grille-3 grille-catalogue">
${autres.map((x) => carte(x)).join('\n')}
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
