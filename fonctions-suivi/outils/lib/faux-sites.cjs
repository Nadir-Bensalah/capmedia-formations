/* ==========================================================================
   CAPMEDIA CLIENT HUB · les faux sites du banc (salle de contrôle)

   Les adresses que sonde le battement (controle.js), servies sur
   127.0.0.1 : /web, /landing, /fonctions, /hub. Chacune répond ce qu'on
   lui dit (un code, un délai), et chaque appel est noté avec sa méthode,
   ses en-têtes et la taille de son corps : la suite prouve que la sonde
   ne fait qu'un GET, sans jeton ni corps.

     const sites = await require('./lib/faux-sites.cjs').demarrer({ port: 9878 });
     sites.regler('landing', { code: 503 }); sites.appels; await sites.fermer();
   ========================================================================== */

const http = require('node:http');

async function demarrer({ port = 9878 } = {}) {
  const appels = [];
  /* Le Hub répond par une redirection vers /piege : la sonde ne doit pas la suivre. */
  const reglages = { web: { code: 200, delai: 0 }, landing: { code: 200, delai: 0 }, fonctions: { code: 200, delai: 0 }, hub: { code: 302, delai: 0, vers: '/piege' }, piege: { code: 200, delai: 0 } };
  const serveur = http.createServer((req, res) => {
    let taille = 0;
    req.on('data', (morceau) => { taille += morceau.length; });
    req.on('end', () => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const cle = url.pathname.replace(/^\/+|\/+$/g, '');
      appels.push({ cle, methode: req.method, autorisation: req.headers.authorization || '', cookie: req.headers.cookie || '', taille, requete: url.search, agent: req.headers['user-agent'] || '', le: Date.now() });
      const r = reglages[cle];
      if (!r) { res.writeHead(404); res.end('inconnu'); return; }
      setTimeout(() => {
        res.writeHead(r.code, { 'Content-Type': 'text/html; charset=utf-8', ...(r.vers ? { Location: r.vers } : {}) });
        res.end(`<!doctype html><title>${cle}</title><p>${cle}</p>`);
      }, r.delai || 0);
    });
  });
  await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(port, '127.0.0.1', ok); });
  return {
    url: `http://127.0.0.1:${port}`,
    appels,
    regler: (cle, reglage) => { reglages[cle] = { ...reglages[cle], ...reglage }; },
    fermer: () => new Promise((ok) => { serveur.closeAllConnections && serveur.closeAllConnections(); serveur.close(() => ok()); }),
  };
}

module.exports = { demarrer };
