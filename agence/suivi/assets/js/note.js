/* ==========================================================================
   CAPMEDIA CLIENT HUB · la note d'un projet à faire

   Une note s'écrit au kilomètre, dans une simple zone de texte. Quelques
   signes suffisent à la mettre en forme, et rien d'autre n'est interprété :

     ## Un titre          il entre dans le sommaire
     ### Un sous-titre
     - une ligne de liste (ou « * », ou « • »)
     > une phrase mise en avant
     ---                  un séparateur (« ⸻ » aussi)
     **en gras**

   Aucune balise HTML ne passe : tout est échappé avant la mise en forme.
   Ce fichier n'importe rien, pour être éprouvé sans navigateur.
   ========================================================================== */

const echapper = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Le gras, puis les adresses. L'échappement a déjà eu lieu : une adresse
   ne peut plus contenir de guillemet qui sortirait de l'attribut. */
const enLigne = (brut) => echapper(brut)
  .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

const SEPARATEUR = /^\s*(-{3,}|⸻+|_{3,})\s*$/;
const TITRE = /^\s*(#{1,3})\s+(.+?)\s*#*\s*$/;
const PUCE = /^\s*[-*•]\s+(.*)$/;
const CITATION = /^\s*>\s?(.*)$/;

/**
 * La note mise en forme. Renvoie le HTML, le sommaire (les titres de
 * premier rang, chacun avec son ancre) et le nombre de mots.
 */
export const noteHtml = (texte) => {
  const lignes = String(texte || '').replace(/\r\n?/g, '\n').split('\n');
  const sortie = [];
  const sommaire = [];
  let bloc = null; // { genre: 'p' | 'ul' | 'q', lignes: [] }

  const fermer = () => {
    if (!bloc) return;
    if (bloc.genre === 'ul') sortie.push(`<ul>${bloc.lignes.map((l) => `<li>${enLigne(l)}</li>`).join('')}</ul>`);
    else if (bloc.genre === 'q') sortie.push(`<blockquote><p>${bloc.lignes.map(enLigne).join('<br>')}</p></blockquote>`);
    else sortie.push(`<p>${bloc.lignes.map(enLigne).join('<br>')}</p>`);
    bloc = null;
  };
  const ajouter = (genre, ligne) => {
    if (!bloc || bloc.genre !== genre) { fermer(); bloc = { genre, lignes: [] }; }
    bloc.lignes.push(ligne);
  };

  for (const ligne of lignes) {
    if (!ligne.trim()) { fermer(); continue; }
    if (SEPARATEUR.test(ligne)) { fermer(); sortie.push('<hr>'); continue; }
    const t = ligne.match(TITRE);
    if (t) {
      fermer();
      if (t[1].length <= 2) {
        const ancre = `note-${sommaire.length + 1}`;
        sommaire.push({ ancre, titre: t[2] });
        sortie.push(`<h2 id="${ancre}">${enLigne(t[2])}</h2>`);
      } else sortie.push(`<h3>${enLigne(t[2])}</h3>`);
      continue;
    }
    const p = ligne.match(PUCE);
    if (p) { ajouter('ul', p[1]); continue; }
    const c = ligne.match(CITATION);
    if (c) { ajouter('q', c[1]); continue; }
    ajouter('p', ligne.trim());
  }
  fermer();

  const mots = String(texte || '').split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
  return { html: sortie.join('\n'), sommaire, mots };
};

/** Les premières phrases, sans les signes de mise en forme. */
export const extrait = (texte, max = 220) => {
  const premier = String(texte || '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
    .map((b) => b.split('\n').filter((l) => !TITRE.test(l) && !SEPARATEUR.test(l)).join(' ').trim())
    .find((b) => b.length > 0) || '';
  const net = premier.replace(/^\s*[-*•>]\s+/, '').replace(/\s+[-*•>]\s+/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return net.length > max ? `${net.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : net;
};

/** Le temps de lecture, en minutes pleines, une au moins. */
export const lecture = (mots) => Math.max(1, Math.round(mots / 220));
