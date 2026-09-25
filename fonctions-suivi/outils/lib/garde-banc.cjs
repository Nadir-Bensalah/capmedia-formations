/* ==========================================================================
   CAPMEDIA CLIENT HUB · la garde du banc : jamais la production

   Chargée en PREMIÈRE ligne de chaque suite navigateur
   (`require('./lib/garde-banc.cjs')`), elle s'applique à tout Chromium que
   la suite ouvre ensuite, sans rien changer à la suite elle-même :

   1. au démarrage, elle vérifie que les émulateurs attendus répondent
      (Firestore, Auth, Functions, Storage, hub) et que le site local
      répond : sinon la suite ne démarre pas (sortie 2) ;
   2. chaque contexte de navigateur reçoit d'avance le branchement du banc
      (`suivi:emul`) : une page ouverte sans « ?emul » ne part plus sur le
      vrai projet ;
   3. toute requête vers un service Firebase ou Google Cloud de production
      est coupée AVANT de partir, et la suite échoue aussitôt (sortie 3),
      en nommant l'adresse visée.

   Pourquoi : le 24/09/2026, un contexte neuf sans « ?emul » a envoyé trois
   demandes de code à la fonction de connexion de production.

   Réglages (variables d'environnement) : BANC_SITE (défaut
   http://127.0.0.1:8787), BANC_SANS_SITE=1 pour une suite sans site.
   ========================================================================== */

const { execFileSync } = require('node:child_process');

/* Les adresses de production. Tout le reste passe (les CDN de Firebase
   servent le code du SDK, pas les données). */
const PRODUCTION = /^https?:\/\/([^/]*\.)?(cloudfunctions\.net|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebasestorage\.googleapis\.com|firebaseinstallations\.googleapis\.com|firebaseio\.com|firebasedatabase\.app|storage\.googleapis\.com|run\.app|cloudfunctions\.googleapis\.com|firebase\.googleapis\.com|fcmregistrations\.googleapis\.com)(\/|:|$)/i;
exports.PRODUCTION = PRODUCTION;
exports.estProduction = (url) => PRODUCTION.test(String(url || ''));

const ATTENDUS = [
  ['Firestore', process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080', '/'],
  ['Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099', '/'],
  ['Functions', '127.0.0.1:5001', '/'],
  ['Storage', process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199', '/'],
  ['hub des émulateurs', process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400', '/emulators'],
];
const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';

/* Le contrôle de démarrage, SYNCHRONE : la suite n'a encore rien fait. */
const verifierEmulateurs = () => {
  const cibles = ATTENDUS.map(([nom, hote, chemin]) => [nom, `http://${hote}${chemin}`]);
  if (process.env.BANC_SANS_SITE !== '1') cibles.push(['site local', `${SITE}/suivi/`]);
  const script = `(${async (liste) => {
    const absents = [];
    for (const [nom, url] of liste) {
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000); await fetch(url, { signal: c.signal }); clearTimeout(t); } catch (e) { absents.push(`${nom} (${url})`); }
    }
    process.stdout.write(JSON.stringify(absents));
  }})(${JSON.stringify(cibles)})`;
  const absents = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }) || '[]');
  if (absents.length) {
    console.error(`\nGARDE DU BANC : émulateurs absents, la suite ne démarre pas.\n  - ${absents.join('\n  - ')}\n`);
    process.exit(2);
  }
  for (const [nom, hote] of ATTENDUS.slice(0, 4)) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(hote)) { console.error(`GARDE DU BANC : ${nom} pointe vers ${hote}, qui n'est pas une adresse locale.`); process.exit(2); }
  }
};

const fuite = (url, ou) => {
  console.error(`\nGARDE DU BANC : requête vers la PRODUCTION coupée (${ou}) : ${url}\nLa suite s'arrête.\n`);
  process.exit(3);
};

/* Chaque contexte : branchement du banc d'avance, et coupure de la production. */
const garderContexte = async (ctx) => {
  await ctx.addInitScript(() => { try { localStorage.setItem('suivi:emul', '1'); } catch (e) { /* stockage refusé */ } });
  await ctx.route(PRODUCTION, (route) => { const url = route.request().url(); route.abort('blockedbyclient').catch(() => {}); fuite(url, 'navigateur'); });
  ctx.on('request', (r) => { if (PRODUCTION.test(r.url())) fuite(r.url(), 'navigateur, requête vue'); });
  return ctx;
};

const envelopperNavigateur = (nav) => {
  const nouveauContexte = nav.newContext.bind(nav);
  nav.newContext = async (...a) => garderContexte(await nouveauContexte(...a));
  const nouvellePage = nav.newPage.bind(nav);
  nav.newPage = async (...a) => { const p = await nouvellePage(...a); await garderContexte(p.context()); return p; };
  return nav;
};

/* Playwright est un module partagé : envelopper son Chromium ici vaut pour la suite qui l'importe ensuite. */
const envelopperPlaywright = (nomModule) => {
  let pw;
  try { pw = require(nomModule); } catch (e) { return false; }
  if (!pw.chromium || pw.chromium.__garde) return Boolean(pw.chromium);
  const lancer = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => envelopperNavigateur(await lancer(...a));
  const persistant = pw.chromium.launchPersistentContext && pw.chromium.launchPersistentContext.bind(pw.chromium);
  if (persistant) pw.chromium.launchPersistentContext = async (...a) => garderContexte(await persistant(...a));
  pw.chromium.__garde = true;
  return true;
};

/* Côté Node : un fetch de la suite vers la production échoue aussi. */
const fetchOrigine = globalThis.fetch;
globalThis.fetch = (url, ...reste) => { const u = typeof url === 'string' ? url : (url && url.url) || String(url); if (PRODUCTION.test(u)) fuite(u, 'Node'); return fetchOrigine(url, ...reste); };

if (!process.env.BANC_GARDE_SANS_DEMARRAGE) verifierEmulateurs();
const garde = ['@playwright/test', 'playwright'].map(envelopperPlaywright).some(Boolean);
if (!garde) { console.error('GARDE DU BANC : Playwright introuvable, garde impossible.'); process.exit(2); }
exports.garderContexte = garderContexte;
