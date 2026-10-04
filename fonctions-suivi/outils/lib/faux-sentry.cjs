/* ==========================================================================
   CAPMEDIA CLIENT HUB · le faux serveur Sentry du banc

   Les réponses enregistrées (outils/sentry-faux/*.json, au format de l'API
   de Sentry, calibré sur la vraie en lecture le 04/10/2026), servies sur
   127.0.0.1. Les dates sont relatives (« @-3d », « @-10m ») et les séries
   horaires ou quotidiennes se recalculent à l'instant : le banc lit
   toujours « aujourd'hui ».

   Le serveur exige le jeton du banc (Authorization: Bearer
   banc-sentry-jeton) et note chaque appel : la suite compte ce que coûte
   un relevé. Une étape peut être mise en panne (403) pour éprouver ce que
   fait le relevé d'une réponse refusée.

     const faux = await require('./lib/faux-sentry.cjs').demarrer({ port: 9877 });
     faux.appels; faux.pannes.add('sessions'); await faux.fermer();
   ========================================================================== */

const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const DOSSIER = join(__dirname, '..', 'sentry-faux');
const JETON = 'banc-sentry-jeton';
const lire = (nom) => JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), 'utf8'));

const UNITES = { m: 60e3, h: 3600e3, d: 86400e3 };
/* « @-3d » : il y a trois jours. « @heures:a,b,... » : 24 tranches horaires
   finissant à l'heure en cours. « @jours:14 » : 14 jours finissant
   aujourd'hui. « @jour:-14 » : le jour d'il y a 14 jours. « @tranches:a,b,... »
   (events-stats) : des tranches de dix minutes finissant à la tranche en
   cours, au format [[horodatage, [{ count }]], ...] ; « 6x0 » répète six
   fois zéro. */
function vivifier(v, maintenant) {
  if (Array.isArray(v)) return v.map((x) => vivifier(x, maintenant));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, vivifier(x, maintenant)]));
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  let m = v.match(/^@-(\d+)([mhd])$/);
  if (m) return new Date(maintenant - Number(m[1]) * UNITES[m[2]]).toISOString();
  m = v.match(/^@tranches:(.+)$/);
  if (m) {
    const valeurs = m[1].split(',').flatMap((x) => { const r = x.match(/^(\d+)x(\d+)$/); return r ? Array.from({ length: Number(r[1]) }, () => Number(r[2])) : [Number(x)]; });
    const tranche = Math.floor(maintenant / 600e3) * 600;
    return valeurs.map((n, i) => [tranche - (valeurs.length - 1 - i) * 600, [{ count: n }]]);
  }
  m = v.match(/^@heures:(.+)$/);
  if (m) {
    const valeurs = m[1].split(',').map(Number);
    const heure = Math.floor(maintenant / 3600e3) * 3600;
    return valeurs.map((n, i) => [heure - (valeurs.length - 1 - i) * 3600, n]);
  }
  const jour = (decalage) => { const d = new Date(maintenant); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + decalage * 86400e3).toISOString().replace('.000Z', 'Z'); };
  m = v.match(/^@jours:(\d+)$/);
  if (m) return Array.from({ length: Number(m[1]) }, (_, i) => jour(i - Number(m[1]) + 1));
  m = v.match(/^@jour:(-?\d+)$/);
  if (m) return jour(Number(m[1]));
  return v;
}

/* Le chemin d'API d'une étape du relevé, pour les pannes voulues. */
const ETAPES = [
  ['projets', /^\/api\/0\/organizations\/[^/]+\/projects\/$/],
  ['erreurs', /^\/api\/0\/organizations\/[^/]+\/issues\/$/],
  ['jour', /^\/api\/0\/organizations\/[^/]+\/events\/$/],
  ['sessions', /^\/api\/0\/organizations\/[^/]+\/sessions\/$/],
  ['heures', /^\/api\/0\/organizations\/[^/]+\/events-stats\/$/],
  ['versions', /^\/api\/0\/organizations\/[^/]+\/releases\/$/],
  ['erreur', /^\/api\/0\/organizations\/[^/]+\/issues\/\d+\/$/],
  ['tags', /^\/api\/0\/organizations\/[^/]+\/issues\/\d+\/tags\/[^/]+\/$/],
];

async function demarrer({ port = 9877 } = {}) {
  const appels = [];
  const pannes = new Set();
  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const chemin = url.pathname;
    const etape = (ETAPES.find(([, motif]) => motif.test(chemin)) || ['?'])[0];
    const autorise = req.headers.authorization === `Bearer ${JETON}`;
    appels.push({ etape, chemin, requete: url.search, autorise, le: Date.now() });
    const rendre = (code, corps) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') return rendre(405, { detail: 'Method not allowed' });
    if (!autorise) return rendre(401, { detail: 'Invalid token' });
    if (!/^\/api\/0\/organizations\/forgeme\//.test(chemin)) return rendre(404, { detail: 'The requested resource does not exist' });
    if (pannes.has(etape)) return rendre(403, { detail: 'You do not have permission to perform this action.' });
    const maintenant = Date.now();
    const v = (corps) => rendre(200, vivifier(corps, maintenant));
    const projets = url.searchParams.getAll('project');
    if (etape === 'projets') return v(lire('projets'));
    if (etape === 'erreurs') return v(lire('erreurs').filter((i) => !projets.length || projets.includes(String(i.project.id))));
    if (etape === 'jour') return v(lire('jour'));
    /* Les sessions des 24 h (salle de contrôle) ou des 14 jours (relevé). */
    if (etape === 'sessions') return v(lire(url.searchParams.get('statsPeriod') === '24h' ? 'sessions-24h' : 'sessions'));
    /* Les erreurs par tranche de dix minutes : le web d'un bloc, le mobile par système. */
    if (etape === 'heures') {
      const p = projets[0] || '';
      if (p === '4512197441683536') return v(lire('heures-web'));
      if (p === '4512197449351248') return v(lire('heures-mobile'));
      return v({ data: [] });
    }
    if (etape === 'versions') {
      const p = projets[0] || '';
      return v(p === '4512197449351248' ? lire('versions-mobile') : p === '4512197441683536' ? lire('versions-web') : []);
    }
    if (etape === 'erreur') {
      const id = chemin.split('/')[6];
      const i = lire('erreurs').find((x) => x.id === id);
      return i ? v(i) : rendre(404, { detail: 'The requested resource does not exist' });
    }
    if (etape === 'tags') {
      const parts = chemin.split('/'); const id = parts[6]; const cle = decodeURIComponent(parts[8] || '');
      const nom = cle === 'release' ? `tags-release-${id}` : cle === 'os.name' ? `tags-os-${id}` : '';
      try { return v(lire(nom)); } catch (e) { return rendre(404, { detail: 'Tag not found' }); }
    }
    return rendre(404, { detail: 'The requested resource does not exist' });
  });
  await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(port, '127.0.0.1', ok); });
  return {
    url: `http://127.0.0.1:${port}`,
    appels,
    pannes,
    fermer: () => new Promise((ok) => serveur.close(() => ok())),
  };
}

module.exports = { demarrer, JETON, vivifier };
