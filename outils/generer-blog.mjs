#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA DIGITAL · Générateur du blog de l'agence

   Depuis agence/blog-src/*.md (markdown + en-tête YAML), produit :
     agence/blog/<id>.html     un article par fichier source
     agence/blog/index.html    la liste des articles
     agence/sitemap.xml        le plan du site agence, articles compris

   En-tête YAML attendu :
     id, titre, description, date (AAAA-MM-JJ), auteur, categorie, motsCles

   Markdown géré : ## et ###, **gras**, *italique*, `code`, [lien](url),
   listes - et 1., blocs ``` (carte de code de la charte), tableaux |,
   encadrés :::astuce / :::attention ... ::: comme sur les landings.

   Relancer après tout ajout ou modification d'article :
     node outils/generer-blog.mjs
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const AGENCE = join(ICI, '..', 'agence');
const SRC = join(AGENCE, 'blog-src');
const DEST = join(AGENCE, 'blog');
const SITE = 'https://capmedia.app';

const e = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --- En-tête YAML (plate, suffisante pour nos articles) -------------------- */
function lireEnTete(brut) {
  const m = brut.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error('En-tête YAML manquant (--- ... ---)');
  const meta = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const kv = ligne.match(/^([A-Za-zÀ-ÿ]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim().replace(/^["']|["']$/g, '');
    if (kv[1] === 'motsCles') val = val.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    meta[kv[1]] = val;
  }
  for (const champ of ['id', 'titre', 'description', 'date', 'auteur', 'categorie']) {
    if (!meta[champ]) throw new Error(`Champ « ${champ} » manquant dans l'en-tête`);
  }
  return { meta, corps: brut.slice(m[0].length) };
}

/* --- Rendu en ligne (gras, italique, code, liens) -------------------------- */
function enLigne(txt) {
  let s = e(txt);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

/* --- Icônes des encadrés (celles du site) ---------------------------------- */
const ICO_ASTUCE = '<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/><path d="M9 20h6"/><path d="M10 23h4"/></svg>';
const ICO_ATTENTION = '<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

/* --- Rendu du corps markdown ----------------------------------------------- */
function rendre(md) {
  const lignes = md.split(/\r?\n/);
  const sortie = [];
  let i = 0;

  const estSeparateurTableau = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');

  while (i < lignes.length) {
    const l = lignes[i];

    if (!l.trim()) { i += 1; continue; }

    /* Bloc de code ``` : la carte visuelle du site */
    if (l.startsWith('```')) {
      const langue = l.slice(3).trim() || 'Code';
      const buf = [];
      i += 1;
      while (i < lignes.length && !lignes[i].startsWith('```')) { buf.push(lignes[i]); i += 1; }
      i += 1; /* referme */
      sortie.push(
        `<div class="bloc-code"><div class="bloc-code-tete"><span class="points"><i></i><i></i><i></i></span>` +
        `<span class="bloc-code-langue">${e(langue)}</span></div>` +
        `<pre><code>${e(buf.join('\n'))}</code></pre></div>`
      );
      continue;
    }

    /* Encadrés :::astuce / :::attention */
    const enc = l.match(/^:::(astuce|attention)\s*$/);
    if (enc) {
      const type = enc[1];
      const buf = [];
      i += 1;
      while (i < lignes.length && !/^:::\s*$/.test(lignes[i])) { buf.push(lignes[i]); i += 1; }
      i += 1; /* referme */
      const paras = buf.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
        .map((p) => `<p>${enLigne(p.replace(/\n/g, ' '))}</p>`).join('');
      sortie.push(
        `<div class="encadre encadre--${type}"><span class="marqueur">${type === 'astuce' ? ICO_ASTUCE : ICO_ATTENTION}</span>` +
        `<div>${paras}</div></div>`
      );
      continue;
    }

    /* Titres */
    const h3 = l.match(/^###\s+(.*)$/);
    if (h3) { sortie.push(`<h3 id="${ancre(h3[1])}">${enLigne(h3[1])}</h3>`); i += 1; continue; }
    const h2 = l.match(/^##\s+(.*)$/);
    if (h2) { sortie.push(`<h2 id="${ancre(h2[1])}">${enLigne(h2[1])}</h2>`); i += 1; continue; }

    /* Tableaux | ... | */
    if (l.trim().startsWith('|') && i + 1 < lignes.length && estSeparateurTableau(lignes[i + 1])) {
      const cellules = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const tetes = cellules(l);
      i += 2;
      const corps = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) { corps.push(cellules(lignes[i])); i += 1; }
      const estNb = (c) => /^[\d\s.,€$%×+«»àh-]+$/.test(c) && /\d/.test(c);
      const ligneHtml = (cs, tag) =>
        `<tr>${cs.map((c) => `<${tag}${tag === 'td' && estNb(c) ? ' class="nb"' : ''}>${enLigne(c)}</${tag}>`).join('')}</tr>`;
      sortie.push(
        `<div class="cadre-tableau"><table><thead>${ligneHtml(tetes, 'th')}</thead>` +
        `<tbody>${corps.map((cs) => ligneHtml(cs, 'td')).join('')}</tbody></table></div>`
      );
      continue;
    }

    /* Listes à puces */
    if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < lignes.length && /^[-*]\s+/.test(lignes[i])) { items.push(lignes[i].replace(/^[-*]\s+/, '')); i += 1; }
      sortie.push(`<ul>${items.map((x) => `<li>${enLigne(x)}</li>`).join('')}</ul>`);
      continue;
    }

    /* Listes numérotées */
    if (/^\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lignes.length && /^\d+\.\s+/.test(lignes[i])) { items.push(lignes[i].replace(/^\d+\.\s+/, '')); i += 1; }
      sortie.push(`<ol>${items.map((x) => `<li>${enLigne(x)}</li>`).join('')}</ol>`);
      continue;
    }

    /* Paragraphe : les lignes qui se suivent forment un seul bloc */
    const buf = [l];
    i += 1;
    while (i < lignes.length && lignes[i].trim() &&
           !/^(##|###|```|:::|[-*]\s|\d+\.\s|\|)/.test(lignes[i].trim())) {
      buf.push(lignes[i]); i += 1;
    }
    sortie.push(`<p>${enLigne(buf.join(' '))}</p>`);
  }
  return sortie.join('\n');
}

const ancre = (t) => t.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* --- Temps de lecture ------------------------------------------------------ */
function tempsLecture(md) {
  const mots = md.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / 220));
}

function nombreDeMots(md) {
  return md.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
}

/* --- Dates ----------------------------------------------------------------- */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateFr(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
}

/* --- Gabarits (le moule de la charte, chemins depuis blog/) ---------------- */
const tete = ({ titre, desc, canon, jsonld, motsCles, image }) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(titre)}</title>
<meta name="description" content="${e(desc)}">
${motsCles && motsCles.length ? `<meta name="keywords" content="${e(motsCles.join(', '))}">\n` : ''}<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191919" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article">
<meta property="og:title" content="${e(titre)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${image || 'https://capmedia.app/assets/img/og-agence.png'}">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../assets/css/tokens.css">
<link rel="stylesheet" href="../assets/css/az.css">
<link rel="stylesheet" href="../assets/css/agence.css">
<link rel="icon" type="image/png" sizes="32x32" href="../assets/img/favicon-agence-32.png">
<link rel="apple-touch-icon" href="../assets/img/apple-touch-agence.png">
<script>(function(){try{var t=localStorage.getItem('az:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>

<header class="entete" id="entete">
  <div class="enveloppe">
    <a href="../index.html" class="logo"><img class="marque" src="../assets/img/capmedia-digital.png" alt="" width="22" height="22">Capmedia&nbsp;Digital</a>
    <nav class="nav-liens">
      <a href="../index.html#services">Services</a>
      <a href="../index.html#audits">Audits</a>
      <a href="./">Le blog</a>
      <a href="../academie.html">L'académie</a>
      <a href="../fondateur.html">Le fondateur</a>
    </nav>
    <span style="margin-left:auto"></span>
    <a href="../devis.html" class="btn btn-principal">Demander un devis</a>
  </div>
</header>
`;

const pied = `
<footer class="pied">
  <div class="enveloppe">
    <div class="rang" style="gap:var(--e-5);flex-wrap:wrap">
      <a href="../index.html" class="t-petit">Accueil</a>
      <a href="../audit-site-web.html" class="t-petit">Audit de site web</a>
      <a href="../audit-application.html" class="t-petit">Audit d'application</a>
      <a href="../test-avant-soumission.html" class="t-petit">Test avant soumission</a>
      <a href="./" class="t-petit">Le blog</a>
      <a href="../academie.html" class="t-petit">L'académie</a>
      <a href="../fondateur.html" class="t-petit">Le fondateur</a>
      <a href="../mentions.html" class="t-petit">Mentions légales</a>
      <a href="mailto:contact@capmedia.tn" class="t-petit">Contact</a>
    </div>
    <hr class="filet" style="margin-block:var(--e-4)">
    <div class="selecteur-theme" role="group" aria-label="Thème" style="margin-bottom:var(--e-4)">
      <button type="button" data-theme-val="light" aria-pressed="false">Clair</button>
      <button type="button" data-theme-val="dark" aria-pressed="false">Sombre</button>
      <button type="button" data-theme-val="auto" aria-pressed="true">Auto</button>
    </div>
    <p class="t-micro t-3" style="display:flex;align-items:center;gap:8px;margin-bottom:var(--e-3)"><img src="../assets/img/capmedia-digital.png" alt="Capmedia Digital" width="20" height="20">Capmedia Digital édite aussi Capmedia Academy, notre plateforme de formation.</p>
    <p class="t-micro t-3">© 2026 Capmedia Digital · Nadir Ben Salah · SIREN 814&nbsp;051&nbsp;769</p>
  </div>
</footer>

<script>
  (function(){var h=document.getElementById('entete');if(!h)return;
  var m=function(){h.classList.toggle('decolle',window.scrollY>8)};m();
  window.addEventListener('scroll',m,{passive:true});
  document.querySelectorAll('.apparait').forEach(function(x){x.classList.add('vu')});})();
</script>
<script src="../assets/js/config-agence.js"></script>\n<script src="../assets/js/cookies.js"></script>\n<script src="../assets/js/theme.js"></script>\n</body>
</html>
`;

/* --- Le bloc « Passe à la pratique » (le tunnel vers l'Academy, sobre) ----- */
const BLOC_PRATIQUE = `
  <section class="apparait" style="margin-top:var(--e-8)">
    <div class="creux" style="padding:clamp(24px,3.5vw,40px);max-width:var(--colonne-lecture)">
      <div class="pile g-3">
        <p class="etiquette" style="display:flex;align-items:center;gap:8px"><img src="../assets/img/logo-academy.png" alt="" width="18" height="18">Passe à la pratique</p>
        <p class="t-h3">Lire, c'est bien. Construire, c'est mieux.</p>
        <p class="t-petit t-2">Tout ce qu'on explique ici s'apprend en faisant, sur Capmedia Academy : le parcours complet pour créer et publier ta première application, en français, et les trois premières formations sont offertes.</p>
        <div class="rang"><a href="https://academy.capmedia.app/" class="btn btn-secondaire">Découvrir le parcours</a></div>
      </div>
    </div>
  </section>`;

/* --- Une page article ------------------------------------------------------ */
function pageArticle(art) {
  const canon = `${SITE}/blog/${art.meta.id}.html`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: art.meta.titre,
    description: art.meta.description,
    author: { '@type': 'Person', name: art.meta.auteur },
    publisher: { '@type': 'Organization', name: 'Capmedia Digital', url: `${SITE}/` },
    datePublished: art.meta.date,
    dateModified: art.meta.date,
    inLanguage: 'fr',
    mainEntityOfPage: canon,
    ...(art.meta.motsCles && art.meta.motsCles.length ? { keywords: art.meta.motsCles.join(', ') } : {}),
  };

  return tete({
    titre: `${art.meta.titre} · Capmedia Digital`,
    desc: art.meta.description,
    canon,
    jsonld,
    motsCles: art.meta.motsCles,
    image: art.meta.image || null,
  }) + `
<main class="enveloppe" style="padding-top:clamp(40px,6vw,64px);padding-bottom:var(--e-10)">
  <article class="pile g-6" style="align-items:flex-start">

    <header class="pile g-4" style="max-width:${'var(--colonne-lecture)'}">
      <nav class="fil-ariane" aria-label="Fil d'ariane">
        <a href="../index.html">Accueil</a><span class="sep">›</span>
        <a href="./">Blog</a><span class="sep">›</span>
        <span>${e(art.meta.titre)}</span>
      </nav>
      <p class="etiquette">${e(art.meta.categorie)}</p>
      <h1 class="t-h1">${e(art.meta.titre)}</h1>
      <p class="t-lead">${e(art.meta.description)}</p>
      <div class="article-meta">
        <span class="t-petit t-2">${e(art.meta.auteur)}</span>
        <span class="t-petit t-3">·</span>
        <time class="t-petit t-3" datetime="${e(art.meta.date)}">${dateFr(art.meta.date)}</time>
        <span class="t-petit t-3">·</span>
        <span class="t-petit t-3">Temps de lecture ${art.lecture} min</span>
      </div>
      <hr class="filet" style="width:100%">
    </header>
${art.meta.image ? `
    <figure class="pile g-1" style="width:100%;max-width:880px;margin:0">
      <img src="${e(art.meta.image)}" alt="" loading="eager" fetchpriority="high"
           style="width:100%;aspect-ratio:1600/720;object-fit:cover;border-radius:18px">
      ${art.meta.imageAuteur ? `<figcaption class="t-micro t-3">Photo : <a href="${e(art.meta.imageLien || 'https://unsplash.com')}" rel="noopener nofollow" target="_blank">${e(art.meta.imageAuteur)}</a> · Unsplash</figcaption>` : ''}
    </figure>` : ''}

    <div class="article-corps">
${art.html}
    </div>
${BLOC_PRATIQUE}
  </article>
<div id="progression-lecture" aria-hidden="true"
     style="position:fixed;top:0;left:0;height:3px;width:0;background:var(--action);z-index:60;transition:width .1s linear"></div>
<script>
  (function () {
    var barre = document.getElementById('progression-lecture');
    function maj() {
      var h = document.documentElement;
      var total = h.scrollHeight - h.clientHeight;
      barre.style.width = (total > 0 ? Math.min(100, (h.scrollTop || document.body.scrollTop) / total * 100) : 0) + '%';
    }
    addEventListener('scroll', maj, { passive: true });
    maj();
  })();
</script>
</main>
` + pied;
}

/* --- La page liste du blog ------------------------------------------------- */
function pageListe(articles) {
  const canon = `${SITE}/blog/`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Le blog de Capmedia Digital',
    url: canon,
    inLanguage: 'fr',
    publisher: { '@type': 'Organization', name: 'Capmedia Digital', url: `${SITE}/` },
    blogPost: articles.map((a) => ({
      '@type': 'BlogPosting',
      headline: a.meta.titre,
      url: `${SITE}/blog/${a.meta.id}.html`,
      datePublished: a.meta.date,
      author: { '@type': 'Person', name: a.meta.auteur },
    })),
  };

  const cartes = articles.map((a) => `
      <a class="carte carte-article apparait" href="./${a.meta.id}.html"
         data-categorie="${e(a.meta.categorie)}"
         data-recherche="${e((a.meta.titre + ' ' + a.meta.description + ' ' + (a.meta.motsCles || '')).toLowerCase())}"
         style="overflow:hidden">
        ${a.meta.image ? `<img src="${e(a.meta.image).replace('w=1600', 'w=800')}" alt="" loading="lazy"
             style="width:calc(100% + 2 * var(--e-4));margin:calc(-1 * var(--e-4)) calc(-1 * var(--e-4)) 0;aspect-ratio:16/8;object-fit:cover;display:block">` : ''}
        <p class="etiquette-mono" style="margin-top:var(--e-3)">${e(a.meta.categorie)} · ${dateFr(a.meta.date)}</p>
        <div class="pile g-1" style="margin-top:var(--e-3)">
          <p class="t-h3" style="font-size:17px">${e(a.meta.titre)}</p>
          <p class="t-petit t-2">${e(a.meta.description)}</p>
        </div>
        <span class="t-petit t-fort" style="margin-top:auto;padding-top:var(--e-4);color:var(--action)">Temps de lecture ${a.lecture} min</span>
      </a>`).join('\n');

  return tete({
    titre: 'Le blog · Capmedia Digital',
    desc: "Des articles concrets sur le développement d'applications, les sites web, l'IA et le coût réel des choses. Écrits par un développeur qui publie, pas par une usine à contenu.",
    canon,
    jsonld,
  }) + `
<main class="enveloppe" style="padding-top:clamp(48px,7vw,80px);padding-bottom:var(--e-10)">
<div class="sections">

  <section>
    <div class="pile g-4" style="max-width:800px">
      <nav class="fil-ariane" aria-label="Fil d'ariane">
        <a href="../index.html">Accueil</a><span class="sep">›</span>
        <span>Blog</span>
      </nav>
      <p class="etiquette">Le blog</p>
      <h1 class="t-h1">Ce qu'on apprend en construisant, on l'écrit.</h1>
      <p class="t-lead" style="max-width:640px">
        Développement, IA, coût réel des choses : des articles écrits pour
        t'aider à décider, pas pour remplir une page. Un nouvel article quand
        on a quelque chose à dire, pas quand le calendrier l'exige.
      </p>
    </div>
  </section>

  <section class="apparait">
      <div class="pile g-3" style="margin:var(--e-5) 0 var(--e-4)">
    <input type="search" id="blog-recherche" class="champ champ-large" autocomplete="off"
           placeholder="Chercher un article : colle ta question…" style="max-width:520px">
    <div class="rang" id="blog-filtres" style="flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-secondaire actif" data-cat="" style="padding:5px 14px;font-size:13px">Tous</button>
${[...new Set(articles.map((a) => a.meta.categorie))].map((c) => `      <button type="button" class="btn btn-secondaire" data-cat="${e(c)}" style="padding:5px 14px;font-size:13px">${e(c)}</button>`).join('\n')}
    </div>
  </div>
  <p class="t-petit t-3 masque" id="blog-vide">Rien ne correspond : essaie moins de mots.</p>
<div class="grille grille-3">
${cartes}
    </div>
${'\u003c'}script>
  (function () {
    var champ = document.getElementById('blog-recherche');
    var filtres = document.getElementById('blog-filtres');
    var vide = document.getElementById('blog-vide');
    if (!champ || !filtres) return;
    var cat = '';
    function applique() {
      var q = champ.value.toLowerCase().trim();
      var visibles = 0;
      document.querySelectorAll('.carte-article').forEach(function (c) {
        var ok = (!cat || c.dataset.categorie === cat)
              && (!q || (c.dataset.recherche || '').indexOf(q) !== -1);
        c.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      vide.classList.toggle('masque', visibles > 0);
    }
    champ.addEventListener('input', applique);
    filtres.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cat]');
      if (!b) return;
      cat = b.dataset.cat;
      filtres.querySelectorAll('[data-cat]').forEach(function (x) {
        x.classList.toggle('actif', x === b);
        x.style.outline = x === b ? '2px solid var(--texte)' : '';
      });
      applique();
    });
  })();
${'\u003c'}/script>
  </section>

</div>
</main>
` + pied;
}

/* --- Le sitemap du site agence (pages FR, pages EN, articles) -------------- */
function sitemap(articles) {
  const pages = [
    { loc: `${SITE}/`, prio: '1.0' },
    { loc: `${SITE}/audit-site-web.html`, prio: '0.8' },
    { loc: `${SITE}/audit-application.html`, prio: '0.8' },
    { loc: `${SITE}/test-avant-soumission.html`, prio: '0.8' },
    { loc: `${SITE}/academie.html`, prio: '0.8' },
    { loc: `${SITE}/fondateur.html`, prio: '0.6' },
    { loc: `${SITE}/en/`, prio: '0.9' },
    { loc: `${SITE}/en/audit-site-web.html`, prio: '0.7' },
    { loc: `${SITE}/en/audit-application.html`, prio: '0.7' },
    { loc: `${SITE}/en/test-avant-soumission.html`, prio: '0.7' },
    { loc: `${SITE}/en/academy.html`, prio: '0.7' },
    { loc: `${SITE}/en/founder.html`, prio: '0.5' },
    { loc: `${SITE}/en/quote.html`, prio: '0.6' },
    { loc: `${SITE}/blog/`, prio: '0.7' },
    ...articles.map((a) => ({ loc: `${SITE}/blog/${a.meta.id}.html`, prio: '0.6', date: a.meta.date })),
  ];
  const lignes = pages.map((p) =>
    `  <url>\n    <loc>${p.loc}</loc>\n${p.date ? `    <lastmod>${p.date}</lastmod>\n` : ''}    <priority>${p.prio}</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lignes}\n</urlset>\n`;
}

/* --- Fabrication ----------------------------------------------------------- */
mkdirSync(DEST, { recursive: true });

const fichiers = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
if (!fichiers.length) {
  console.error(`Aucun article dans ${SRC}`);
  process.exit(1);
}

const articles = [];
for (const f of fichiers) {
  const brut = readFileSync(join(SRC, f), 'utf8');
  const { meta, corps } = lireEnTete(brut);
  if (meta.id !== basename(f, '.md')) {
    throw new Error(`${f} : l'id « ${meta.id} » doit être égal au nom du fichier`);
  }
  articles.push({ meta, html: rendre(corps), lecture: tempsLecture(corps), mots: nombreDeMots(corps) });
}

/* Les plus récents d'abord */
articles.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));

for (const art of articles) {
  writeFileSync(join(DEST, `${art.meta.id}.html`), pageArticle(art));
  console.log(`blog/${art.meta.id}.html  (${art.mots} mots, ${art.lecture} min)`);
}
writeFileSync(join(DEST, 'index.html'), pageListe(articles));
console.log('blog/index.html');
writeFileSync(join(AGENCE, 'sitemap.xml'), sitemap(articles));
console.log('sitemap.xml');
console.log(`\n${articles.length} article(s) générés dans agence/blog/`);
