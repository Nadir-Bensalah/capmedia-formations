require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les formats d'une preuve, côté page

   envoyerPiece (noyau.js) doit refuser, AVANT tout envoi et avec une
   phrase claire, ce que les règles Storage refusent pour une preuve de
   testeur : ni archive, ni document, ni SVG ; 10 Mo une image, 50 Mo une
   vidéo. Les autres dépôts (fichiers du projet) gardent leurs formats.
   La fonction est appelée dans la page même, sans compte : un fichier
   accepté échoue ensuite à l'envoi, et c'est bien la phrase qui compte.

     (émulateurs et site local ; aucun semis)
   ========================================================================== */
const { chromium } = require('@playwright/test');
const soucis = []; const ok = (m) => console.log('  ok     ' + m); const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, m) => (c ? ok(m) : dire(m));

(async () => {
  const nav = await chromium.launch();
  const page = await (await nav.newContext()).newPage();
  await page.goto(`${BANC.site}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  const essayer = (nom, type, taille, chemin) => page.evaluate(async ({ nom, type, taille, chemin }) => {
    const { envoyerPiece } = await import('/suivi/assets/js/noyau.js');
    const f = new File([new Uint8Array(taille)], nom, { type });
    try { await Promise.race([envoyerPiece(f, chemin, null), new Promise((r) => setTimeout(r, 4000))]); return ''; } catch (e) { return String(e.message || e); }
  }, { nom, type, taille, chemin });
  const MO = 1024 * 1024;
  const PREUVE = 'campagnes/atelier/c1/uid-karim';
  const FORMAT = 'une preuve est une capture';
  const LOURD = 'une preuve tient en 10 Mo';

  console.log('\n== Une preuve : capture ou vidéo, bornée');
  verifier((await essayer('a.zip', 'application/zip', 10, PREUVE)).includes(FORMAT), 'un zip est refusé avec une phrase claire');
  verifier((await essayer('a.svg', 'image/svg+xml', 10, PREUVE)).includes(FORMAT), 'un SVG aussi');
  verifier((await essayer('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 10, PREUVE)).includes(FORMAT), 'un document Word aussi');
  verifier((await essayer('a.pdf', 'application/pdf', 10, PREUVE)).includes(FORMAT), 'un PDF aussi');
  verifier((await essayer('grande.png', 'image/png', 10 * MO + 1, PREUVE)).includes(LOURD), 'une image de plus de 10 Mo est refusée');
  verifier((await essayer('longue.mp4', 'video/mp4', 50 * MO + 1, PREUVE)).includes(LOURD), 'une vidéo de plus de 50 Mo aussi');
  const capture = await essayer('a.png', 'image/png', 10, PREUVE);
  verifier(!capture.includes(FORMAT) && !capture.includes(LOURD), `une capture PNG passe la vérification (${capture.slice(0, 60) || 'envoi tenté'})`);
  const video = await essayer('b.mov', 'video/quicktime', 49 * MO, PREUVE);
  verifier(!video.includes(FORMAT) && !video.includes(LOURD), 'une vidéo MOV de 49 Mo aussi');

  console.log('\n== Les autres dépôts gardent leurs formats');
  const zip = await essayer('a.zip', 'application/zip', 10, 'projets/atelier/fichiers/x');
  verifier(!zip.includes(FORMAT) && !zip.includes('pas accepté'), 'un zip reste accepté dans les fichiers du projet');
  const video80 = await essayer('c.mp4', 'video/mp4', 80 * MO, 'projets/atelier/fichiers/x');
  verifier(!video80.includes('dépasse') && !video80.includes(LOURD), 'une vidéo de 80 Mo aussi');

  await nav.close();
  console.log(soucis.length ? `\n${soucis.length} ÉCART(S)` : '\nTout est conforme.');
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
