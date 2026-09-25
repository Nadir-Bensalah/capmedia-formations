/* ==========================================================================
   CAPMEDIA CLIENT HUB · la garde du banc, éprouvée

   Chaque essai tourne dans un processus à part, comme une vraie suite :
   - émulateur absent : la suite ne démarre pas (sortie 2) ;
   - émulateur « de production » (adresse non locale) : refusé (sortie 2) ;
   - une page qui appelle Firestore de production : la suite s'arrête
     aussitôt (sortie 3), et la requête est coupée avant de partir ;
   - une page qui appelle une fonction de production : idem ;
   - un fetch Node vers la production : idem ;
   - une page du Hub ouverte SANS « ?emul » : elle parle aux émulateurs,
     jamais à la production, et la suite continue ;
   - chaque suite navigateur du dépôt charge la garde en première ligne.

     node fonctions-suivi/outils/garde-banc.test.cjs
   ========================================================================== */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let ok = 0; const ecarts = [];
const verifier = (l, vrai, detail = '') => { if (vrai) { ok += 1; console.log('  ok     ' + l); } else { ecarts.push(l); console.log('  ÉCART  ' + l + (detail ? ` · ${String(detail).slice(0, 300)}` : '')); } };
const GARDE = path.join(__dirname, 'lib', 'garde-banc.cjs');
const lancer = (code, env = {}, delai = 60000) => {
  const debut = Date.now();
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(GARDE)});\n${code}`], { encoding: 'utf8', timeout: delai, env: { ...process.env, ...env } });
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}`, duree: Date.now() - debut };
};
const PAGE = (corps) => `(async () => { const { chromium } = require('@playwright/test'); const nav = await chromium.launch(); const ctx = await nav.newContext(); const page = await ctx.newPage(); ${corps}; await nav.close(); process.exit(0); })().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });`;

console.log('\n== Au démarrage');
let r = lancer('process.exit(0)', { FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' });
verifier('un émulateur absent empêche la suite de démarrer', r.code === 2 && /émulateurs absents/.test(r.sortie), r.sortie);
r = lancer('process.exit(0)', { BANC_SITE: 'http://127.0.0.1:1' });
verifier('un site local absent aussi', r.code === 2 && /site local/.test(r.sortie), r.sortie);
r = lancer('process.exit(0)', { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' });
verifier('un émulateur qui pointe vers une adresse non locale est refusé', r.code === 2, r.sortie);
r = lancer('process.exit(0)');
verifier('émulateurs présents : la suite démarre', r.code === 0, r.sortie);

console.log('\n== Pendant la suite');
r = lancer(PAGE(`await page.goto('about:blank'); await page.evaluate(() => fetch('https://firestore.googleapis.com/v1/projects/capmedia-1f90d/databases/(default)/documents/projets').catch(() => {})); await page.waitForTimeout(3000); console.log('LA SUITE A CONTINUÉ')`));
verifier('une page qui appelle Firestore de production arrête la suite (sortie 3)', r.code === 3 && /PRODUCTION coupée/.test(r.sortie) && !/LA SUITE A CONTINUÉ/.test(r.sortie), r.sortie);
r = lancer(PAGE(`await page.goto('about:blank'); await page.evaluate(() => fetch('https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviConnexion', { method: 'POST', body: '{}' }).catch(() => {})); await page.waitForTimeout(3000); console.log('LA SUITE A CONTINUÉ')`));
verifier('une page qui appelle une fonction de production arrête la suite', r.code === 3 && /cloudfunctions\.net/.test(r.sortie) && !/LA SUITE A CONTINUÉ/.test(r.sortie), r.sortie);
r = lancer(`fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode').catch(() => {}); setTimeout(() => { console.log('LA SUITE A CONTINUÉ'); process.exit(0); }, 2000);`);
verifier('un fetch Node vers la production arrête la suite', r.code === 3 && !/LA SUITE A CONTINUÉ/.test(r.sortie), r.sortie);
r = lancer(PAGE(`const vers = []; page.on('request', (q) => vers.push(new URL(q.url()).host)); await page.goto('${process.env.BANC_SITE || 'http://127.0.0.1:8787'}/suivi/hub', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000); const emul = await page.evaluate(() => localStorage.getItem('suivi:emul')); console.log('EMUL=' + emul); console.log('HOTES=' + [...new Set(vers)].join(','))`));
const hotes = ((r.sortie.match(/HOTES=(.*)/) || [])[1] || '').split(',').filter(Boolean);
verifier('une page du Hub ouverte sans « ?emul » est branchée sur le banc', r.code === 0 && /EMUL=1/.test(r.sortie), r.sortie);
verifier('et ne parle qu aux émulateurs et au site local', hotes.length > 0 && hotes.every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$|gstatic\.com$|googleapis\.com$/.test(h)) && !hotes.some((h) => /firestore\.googleapis|identitytoolkit|securetoken|cloudfunctions/.test(h)), hotes.join(', '));

console.log('\n== Chaque suite navigateur charge la garde');
const suites = fs.readdirSync(__dirname).filter((f) => /^(qa-.*|transition-gate1)\.cjs$/.test(f));
const sansGarde = suites.filter((f) => !/^require\('\.\/lib\/garde-banc\.cjs'\);/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
verifier(`les ${suites.length} suites commencent par la garde`, suites.length > 20 && sansGarde.length === 0, sansGarde.join(', '));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
