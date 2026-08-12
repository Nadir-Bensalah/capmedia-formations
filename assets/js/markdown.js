/* ==========================================================================
   CAPMEDIA ACADEMY — Petit convertisseur Markdown → HTML

   Volontairement minimal : il ne gère que ce que la formation utilise, il
   échappe tout le HTML brut (rien n'est injectable), et il ajoute deux
   syntaxes maison :

     :::astuce Titre facultatif
     Contenu de l'encadré.
     :::
     types : note · astuce · attention · piege · action

     [[visuel: description de l'image à produire]]
     → réserve la place d'un visuel pas encore intégré.
   ========================================================================== */

const MARQUEURS = {
  note:      '📄',
  astuce:    '💡',
  attention: '⚠️',
  piege:     '🛑',
  action:    '👉',
};

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

/* --- Niveau bloc --------------------------------------------------------- */
export function versHtml(markdown) {
  const lignes = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const sortie = [];
  let i = 0;

  const estVide = (l) => !l || !l.trim();

  while (i < lignes.length) {
    const ligne = lignes[i];

    /* Ligne vide */
    if (estVide(ligne)) { i++; continue; }

    /* Bloc de code ``` */
    if (/^```/.test(ligne)) {
      const langue = ligne.slice(3).trim();
      const corps = [];
      i++;
      while (i < lignes.length && !/^```/.test(lignes[i])) corps.push(lignes[i++]);
      i++; // ferme
      sortie.push(
        `<pre><code${langue ? ` class="langue-${langue}"` : ''}>${echapper(corps.join('\n'))}</code></pre>`
      );
      continue;
    }

    /* Encadré ::: */
    if (/^:::/.test(ligne)) {
      const entete = ligne.slice(3).trim().split(/\s+/);
      const type = (entete.shift() || 'note').toLowerCase();
      const titre = entete.join(' ');
      const corps = [];
      i++;
      while (i < lignes.length && !/^:::\s*$/.test(lignes[i])) corps.push(lignes[i++]);
      i++; // ferme
      const dedans = versHtml(corps.join('\n'));
      sortie.push(
        `<aside class="encadre encadre--${type}">` +
        `<span class="marqueur" aria-hidden="true">${MARQUEURS[type] || MARQUEURS.note}</span>` +
        `<div>${titre ? `<p><strong>${enLigne(titre)}</strong></p>` : ''}${dedans}</div>` +
        `</aside>`
      );
      continue;
    }

    /* Emplacement de visuel [[visuel: … ]] */
    const visuel = ligne.match(/^\[\[visuel:\s*(.+?)\]\]$/i);
    if (visuel) {
      sortie.push(
        `<figure><div class="emplacement-visuel">Visuel à intégrer —<br>${echapper(visuel[1])}</div></figure>`
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
      sortie.push(`<blockquote>${versHtml(corps.join('\n'))}</blockquote>`);
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
      !/^(#{2,4}\s|```|:::|>|\||\s*[-*+]\s|\s*\d+[.)]\s|\[\[visuel:)/.test(lignes[i]) &&
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
