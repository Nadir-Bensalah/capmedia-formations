/* ==========================================================================
   CAPMEDIA CLIENT HUB · la note d'un projet à faire

   Une note est écrite au kilomètre et relue des mois plus tard : chaque
   signe de mise en forme a son cas, et l'échappement le sien, parce que
   la note est injectée telle quelle dans la page. On charge le VRAI
   fichier du navigateur (il n'importe rien), jamais une copie.

     node fonctions-suivi/outils/note.test.mjs
   ========================================================================== */

import { noteHtml, extrait, lecture } from '../../agence/suivi/assets/js/note.js';

let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };
const egal = (vu, attendu, m) => (JSON.stringify(vu) === JSON.stringify(attendu) ? ok(m) : dire(`${m} · attendu « ${JSON.stringify(attendu)} », vu « ${JSON.stringify(vu)} »`));
const h = (t) => noteHtml(t).html;

console.log('\n== Les titres et le sommaire');
egal(h('## 1. Vision'), '<h2 id="note-1">1. Vision</h2>', 'un titre ## devient un h2 ancré');
egal(h('# Vision'), '<h2 id="note-1">Vision</h2>', 'un titre # aussi');
egal(h('### Détail'), '<h3>Détail</h3>', 'un ### devient un h3, sans ancre');
egal(noteHtml('## Un\n### sous\n## Deux').sommaire, [{ ancre: 'note-1', titre: 'Un' }, { ancre: 'note-2', titre: 'Deux' }], 'le sommaire ne prend que les titres de premier rang, dans l ordre');
egal(h('##Collé'), '<p>##Collé</p>', 'sans espace après le dièse, ce n est pas un titre');

console.log('\n== Les paragraphes, les listes, les citations');
egal(h('une ligne\nla suivante'), '<p>une ligne<br>la suivante</p>', 'deux lignes voisines restent un paragraphe');
egal(h('un\n\ndeux'), '<p>un</p>\n<p>deux</p>', 'une ligne vide sépare deux paragraphes');
egal(h('- a\n* b\n• c'), '<ul><li>a</li><li>b</li><li>c</li></ul>', 'les trois puces font une seule liste');
egal(h('- a\ntexte'), '<ul><li>a</li></ul>\n<p>texte</p>', 'une ligne sans puce ferme la liste');
egal(h('> Et si ?\n> Vraiment.'), '<blockquote><p>Et si ?<br>Vraiment.</p></blockquote>', 'les lignes > voisines font une citation');
egal(h('+ 42 800 € · Dividendes\n− 8 500 € · Loyer'), '<p>+ 42 800 € · Dividendes<br>− 8 500 € · Loyer</p>', 'un plus et un moins ne sont pas des puces');
egal(h('-5 %'), '<p>-5 %</p>', 'un tiret collé au chiffre n est pas une puce');

console.log('\n== Les séparateurs et le gras');
egal(h('a\n---\nb'), '<p>a</p>\n<hr>\n<p>b</p>', '--- sépare');
egal(h('⸻'), '<hr>', 'le filet ⸻ collé depuis une autre note sépare aussi');
egal(h('très **important** ici'), '<p>très <strong>important</strong> ici</p>', 'le gras');
egal(h('**non fermé'), '<p>**non fermé</p>', 'un gras non fermé reste tel quel');

console.log('\n== Rien ne passe en HTML');
egal(h('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>', 'une balise est échappée');
egal(h('## <script>x</script>'), '<h2 id="note-1">&lt;script&gt;x&lt;/script&gt;</h2>', 'dans un titre aussi');
egal(h('- **<b>**'), '<ul><li><strong>&lt;b&gt;</strong></li></ul>', 'et dans le gras d une liste');
egal(h('voir https://exemple.test/a?b=1&c=2'), '<p>voir <a href="https://exemple.test/a?b=1&amp;c=2" target="_blank" rel="noopener">https://exemple.test/a?b=1&amp;c=2</a></p>', 'une adresse devient un lien, échappée');
egal(h('https://x.test/"onmouseover="alert(1)'), '<p><a href="https://x.test/&quot;onmouseover=&quot;alert(1)" target="_blank" rel="noopener">https://x.test/&quot;onmouseover=&quot;alert(1)</a></p>', 'un guillemet ne sort pas de l attribut');

console.log('\n== Les chiffres de la carte');
egal(noteHtml('## Titre\nUn deux trois.\n- quatre\n---').mots, 5, 'les mots se comptent, pas les signes');
egal(noteHtml('').mots, 0, 'une note vide compte zéro mot');
egal(lecture(0), 1, 'une minute de lecture au moins');
egal(lecture(2200), 10, 'deux mille deux cents mots, dix minutes');
egal(extrait('## 1. Vision\n\nCréer une application **premium**.\n\nLa suite.'), 'Créer une application premium.', 'l extrait saute les titres et prend le premier paragraphe, sans les signes');
egal(extrait('## Titre\n---\n- un\n- deux'), 'un deux', 'une liste en tête donne ses lignes, sans les puces');
egal(extrait(`${'mot '.repeat(80)}`, 40).endsWith('…'), true, 'un extrait trop long se coupe sur un mot, avec des points de suspension');
egal(extrait(`${'mot '.repeat(80)}`, 40).length <= 40, true, 'et tient dans la longueur demandée');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
