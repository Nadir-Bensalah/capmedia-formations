/* ==========================================================================
   CAPMEDIA ACADEMY · Petit convertisseur Markdown → HTML

   Volontairement minimal : il ne gère que ce que la formation utilise, il
   échappe tout le HTML brut (rien n'est injectable), et il ajoute quatre
   syntaxes maison :

     :::astuce Titre facultatif
     Contenu de l'encadré.
     :::
     types : note · astuce · attention · piege · action

     :::si mac windows avec-ia …
     Bloc affiché seulement si le profil du lecteur porte UN de ces tags.
     Tags reconnus : mac · windows · iphone · android · ipad ·
     tablette-android · apple-watch · montre-android · avec-ia · sans-ia
     :::

     ```prompt Titre facultatif
     Le prompt à copier, affiché en carte dépliable avec bouton Copier.
     Masqué (remplacé par une ligne discrète) en mode sans IA.
     ```

     [[visuel: description de l'image à produire]]
     → réserve la place d'un visuel pas encore intégré.

   versHtml(markdown, contexte) : contexte est un Set de tags de profil,
   ou null pour tout afficher (aperçu, développement).
   ========================================================================== */

import { ico } from './icones.js';

const TYPES_ENCADRE = new Set(['note', 'astuce', 'attention', 'piege', 'action']);

// Jeton de mise de côté du code littéral. Construit à partir de U+0000, un
// caractère qu'on ne peut pas écrire dans le markdown source : aucune
// collision possible avec un nombre entouré d'espaces dans le texte.
const SENTINELLE = String.fromCharCode(0);
const MOTIF_JETON = new RegExp(SENTINELLE + '(\\d+)' + SENTINELLE, 'g');

function echapper(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* --- Niveau ligne : gras, italique, code, liens -------------------------- */
function enLigne(texte) {
  let t = echapper(texte);

  const coffre = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    coffre.push(c);
    return SENTINELLE + (coffre.length - 1) + SENTINELLE;
  });

  t = t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
      const externe = /^https?:/.test(href);
      return `<a href="${href}"${externe ? ' target="_blank" rel="noopener noreferrer"' : ''}>${txt}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/ {2}$/gm, '<br>');

  return t.replace(MOTIF_JETON, (_, i) => `<code>${coffre[Number(i)]}</code>`);
}

/* --- Corps d'un bloc ::: avec prise en compte de l'imbrication ----------- */
/* Un :::si peut contenir un :::astuce (et inversement) : on compte la
   profondeur : une ligne `:::xxx` ouvre, une ligne `:::` seule ferme. */
function extraireBloc(lignes, depart) {
  const corps = [];
  let profondeur = 1;
  let i = depart;
  while (i < lignes.length) {
    const l = lignes[i];
    if (/^:::\s*$/.test(l)) {
      profondeur--;
      if (profondeur === 0) { i++; break; }
    } else if (/^:::\S/.test(l)) {
      profondeur++;
    }
    corps.push(l);
    i++;
  }
  return { corps, suite: i };
}

/* --- Niveau bloc --------------------------------------------------------- */
export function versHtml(markdown, contexte = null) {
  const lignes = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const sortie = [];
  let i = 0;

  const estVide = (l) => !l || !l.trim();
  const visible = (tags) => contexte === null || tags.some((t) => contexte.has(t));

  while (i < lignes.length) {
    const ligne = lignes[i];

    /* Ligne vide */
    if (estVide(ligne)) { i++; continue; }

    /* Bloc de code ``` : dont la variante ```prompt */
    if (/^```/.test(ligne)) {
      const info = ligne.slice(3).trim();
      const corps = [];
      i++;
      while (i < lignes.length && !/^```/.test(lignes[i])) corps.push(lignes[i++]);
      i++; // ferme

      if (/^prompt(\s|$)/.test(info)) {
        const titre = info.slice(6).trim();

        // En mode sans IA, la carte prompt s'efface au profit d'une ligne
        // discrète : le lecteur sait qu'un raccourci existe s'il change d'avis.
        if (contexte !== null && contexte.has('sans-ia')) {
          sortie.push(
            `<p class="prompt-alt">${ico('ia', 12)} ${titre ? echapper(titre) + ' : ' : ''}` +
            `prompt IA masqué (mode sans IA)</p>`
          );
        } else {
          sortie.push(
            `<details class="prompt">` +
            `<summary><span class="prompt-ico">${ico('ia', 15)}</span>` +
            `<span class="prompt-titre">${titre ? echapper(titre) : 'Le prompt, prêt à copier'}</span>` +
            `<span class="prompt-indice">déplier</span></summary>` +
            `<div class="prompt-corps"><pre><code>${echapper(corps.join('\n'))}</code></pre></div>` +
            `</details>`
          );
        }
        continue;
      }

      const etiquettes = { bash: 'Terminal', sh: 'Terminal', js: 'JavaScript',
        jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', json: 'JSON',
        html: 'HTML', css: 'CSS', markdown: 'Markdown', md: 'Markdown' };
      sortie.push(
        `<div class="bloc-code">` +
        `<div class="bloc-code-tete"><span class="points"><i></i><i></i><i></i></span>` +
        `<span class="bloc-code-langue">${etiquettes[info] || (info ? echapper(info) : 'Code')}</span></div>` +
        `<pre><code${info ? ` class="langue-${info}"` : ''}>${echapper(corps.join('\n'))}</code></pre>` +
        `</div>`
      );
      continue;
    }

    /* Bloc conditionnel :::si tag1 tag2 … */
    if (/^:::si\s/.test(ligne)) {
      const tags = ligne.slice(5).trim().toLowerCase().split(/\s+/).filter(Boolean);
      const { corps, suite } = extraireBloc(lignes, i + 1);
      i = suite;
      if (visible(tags)) sortie.push(versHtml(corps.join('\n'), contexte));
      continue;
    }

    /* Encadré ::: */
    if (/^:::/.test(ligne)) {
      const entete = ligne.slice(3).trim().split(/\s+/);
      const type = (entete.shift() || 'note').toLowerCase();
      const titre = entete.join(' ');
      const { corps, suite } = extraireBloc(lignes, i + 1);
      i = suite;
      const dedans = versHtml(corps.join('\n'), contexte);
      const t = TYPES_ENCADRE.has(type) ? type : 'note';
      sortie.push(
        `<aside class="encadre encadre--${t}">` +
        `<span class="marqueur">${ico(t, 18)}</span>` +
        `<div>${titre ? `<p><strong>${enLigne(titre)}</strong></p>` : ''}${dedans}</div>` +
        `</aside>`
      );
      continue;
    }

    /* Emplacement de visuel [[visuel: … ]] */
    const visuel = ligne.match(/^\[\[visuel:\s*(.+?)\]\]$/i);
    if (visuel) {
      sortie.push(
        `<figure><div class="emplacement-visuel">` +
        `<span class="ev-ico">${ico('image', 26)}</span>` +
        `<span class="ev-nom">Image à venir</span>` +
        `<span class="ev-desc">${echapper(visuel[1])}</span>` +
        `</div></figure>`
      );
      i++;
      continue;
    }

    /* Image seule sur sa ligne → figure avec légende */
    const image = ligne.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (image) {
      sortie.push(
        `<figure><img src="${image[2]}" alt="${echapper(image[1])}" loading="lazy">` +
        (image[1] ? `<figcaption>${enLigne(image[1])}</figcaption>` : '') +
        `</figure>`
      );
      i++;
      continue;
    }

    /* Titres */
    const titre = ligne.match(/^(#{2,4})\s+(.+)$/);
    if (titre) {
      const n = titre[1].length;
      sortie.push(`<h${n} id="${ancre(titre[2])}">${enLigne(titre[2])}</h${n}>`);
      i++;
      continue;
    }

    /* Trait horizontal */
    if (/^(---|\*\*\*|___)\s*$/.test(ligne)) { sortie.push('<hr>'); i++; continue; }

    /* Citation */
    if (/^>\s?/.test(ligne)) {
      const corps = [];
      while (i < lignes.length && /^>\s?/.test(lignes[i])) corps.push(lignes[i++].replace(/^>\s?/, ''));
      sortie.push(`<blockquote>${versHtml(corps.join('\n'), contexte)}</blockquote>`);
      continue;
    }

    /* Tableau */
    if (/^\|/.test(ligne) && /^\|[\s:|-]+\|?\s*$/.test(lignes[i + 1] || '')) {
      const cellules = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const entetes = cellules(ligne);
      i += 2;
      const corps = [];
      while (i < lignes.length && /^\|/.test(lignes[i])) corps.push(cellules(lignes[i++]));
      sortie.push(
        '<div class="cadre-tableau"><table><thead><tr>' +
        entetes.map((c) => `<th>${enLigne(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        corps.map((r) => '<tr>' + r.map((c) => `<td>${enLigne(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    /* Listes */
    const puce = /^\s*[-*+]\s+/;
    const numero = /^\s*\d+[.)]\s+/;
    if (puce.test(ligne) || numero.test(ligne)) {
      const ordonnee = numero.test(ligne);
      const motif = ordonnee ? numero : puce;
      const elements = [];

      while (i < lignes.length && motif.test(lignes[i])) {
        let contenu = lignes[i].replace(motif, '');
        i++;
        // Lignes de continuation indentées
        while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !motif.test(lignes[i])) {
          contenu += ' ' + lignes[i].trim();
          i++;
        }
        elements.push(`<li>${enLigne(contenu)}</li>`);
      }
      sortie.push(`<${ordonnee ? 'ol' : 'ul'}>${elements.join('')}</${ordonnee ? 'ol' : 'ul'}>`);
      continue;
    }

    /* Paragraphe */
    const para = [];
    while (
      i < lignes.length &&
      !estVide(lignes[i]) &&
      !/^(#{2,4}\s|```|:::|>|\||\s*[-*+]\s|\s*\d+[.)]\s|\[\[visuel:|!\[)/.test(lignes[i]) &&
      !/^(---|\*\*\*|___)\s*$/.test(lignes[i])
    ) {
      para.push(lignes[i++]);
    }
    if (para.length) sortie.push(`<p>${enLigne(para.join('\n'))}</p>`);
  }

  return sortie.join('\n');
}

function ancre(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
