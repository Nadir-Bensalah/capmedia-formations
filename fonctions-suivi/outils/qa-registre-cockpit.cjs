/* ==========================================================================
   CAPMEDIA CLIENT HUB · le registre du Cockpit, ligne par ligne

   Le filet de la refonte du Cockpit (AUDIT-COCKPIT.md, lot 0). Le
   registre (registre-cockpit.json, à côté de ce fichier) compte chaque
   geste et chaque information du Cockpit : 744 lignes. Chaque ligne porte
   une sonde : la route à ouvrir, les gestes préalables (déplier un menu,
   ouvrir une fiche, sans jamais rien enregistrer) et le sélecteur qui
   prouve sa présence ; ou « manuel » quand rien ne se sonde (un toast, un
   comportement, une information sans repère), et la ligne va alors au
   tour manuel (audit-cockpit/TOUR-MANUEL.md).

   Ce que prouve cette suite :
   - le registre a toujours ses 744 lignes, chacune avec une sonde ;
   - en ADMINISTRATEUR, chaque ligne sondée est joignable ;
   - en AGENT (projet Atelier seul, permissions du socle), ce que son rôle
     autorise est là, et ce qu'il n'autorise pas est absent.
   Le bilan final (« BILAN ») donne, par rôle, les lignes joignables,
   absentes, interdites comme prévu, visibles à tort et manuelles : le lot
   8 le compare à la photo d'avant la refonte.

   À chaque lot de la refonte : mettre à jour la route et le sélecteur des
   lignes que le lot déplace, jamais leur nombre.

   Réglages : REGISTRE_IDS=G-001,P-010 (quelques lignes),
   REGISTRE_ROLES=admin|agent, REGISTRE_TRACE=1 (le détail de chaque
   groupe), REGISTRE_LIMITE (secondes, 540 par défaut).

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne, semer-parcours, semer-regles ; plus le semis propre à
   la suite (registre-cockpit-semis.json), un agent, une liaison Sentry.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin, uidDe } = require('./lib/session-banc.cjs');
const fauxSentry = require('./lib/faux-sentry.cjs');
const fauxSites = require('./lib/faux-sites.cjs');
const admin = require('../node_modules/firebase-admin');

const LIGNES = require('./registre-cockpit.json');
const SEMIS = require('./registre-cockpit-semis.json');
const NOMBRE_ATTENDU = 744;

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PORT_SENTRY = 9877 + BANC.decalage;
const PORT_SITES = 9878 + BANC.decalage;
const DECLENCHEUR = `${BANC.fonctions}/functions/projects/${PROJET}/triggers/europe-west1-sentryReleve-0`;
const LIMITE = Number(process.env.REGISTRE_LIMITE || 540) * 1000;
const TRACE = process.env.REGISTRE_TRACE === '1';
const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.registre@exemple.test';
const DEBUT = Date.now();

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(500); } return null; };

/* --------------------------------------------------------------------------
   Les contrôles
   -------------------------------------------------------------------------- */
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

/* --------------------------------------------------------------------------
   La connexion, par le code à six chiffres, comme une personne
   -------------------------------------------------------------------------- */
const dernierCode = async (e) => { for (let i = 0; i < 60; i += 1) { const p = (await docs('envois?pageSize=300')).filter((d) => ((d.fields.modele || {}).stringValue === 'code') && ((((d.fields.a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e))); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  await pause(2500);
};

/* --------------------------------------------------------------------------
   Le semis propre à la suite (registre-cockpit-semis.json)
   Valeurs spéciales : { "$jours": -3 } une date relative, { "$heures": -2 },
   { "$uid": "adresse" } l'identifiant d'un compte, { "$maintenant": true }.
   -------------------------------------------------------------------------- */
const convertir = async (v, fs) => {
  if (Array.isArray(v)) { const r = []; for (const x of v) r.push(await convertir(x, fs)); return r; }
  if (v && typeof v === 'object') {
    if ('$jours' in v) return admin.firestore.Timestamp.fromMillis(Date.now() + Number(v.$jours) * 864e5);
    if ('$heures' in v) return admin.firestore.Timestamp.fromMillis(Date.now() + Number(v.$heures) * 36e5);
    if ('$maintenant' in v) return admin.firestore.Timestamp.now();
    if ('$uid' in v) return (await uidDe(v.$uid)) || '';
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await convertir(x, fs); return o;
  }
  return v;
};

/* --------------------------------------------------------------------------
   Les attentes d'un rôle
   -------------------------------------------------------------------------- */
/* Ce que l'agent du banc n'a pas : il est agent (socle : projet.voir,
   demandes.gerer, contenu.gerer, qa.participer), sur Atelier seul. Une
   sonde peut toujours le dire elle-même (« agent »). */
const REFUS_AGENT = /^(A|Adm\.?|Admin|admin)\b(?!\/)|\[(qa\.gerer|finance\.lecture|finance\.gerer|clients\.gerer|acces\.gerer|projets\.ouvrir|projets\.creer|systeme|equipe\.gerer)\]|peut\(`?(qa\.gerer|finance\.lecture|finance\.gerer|clients\.gerer|acces\.gerer|projets\.ouvrir|projets\.creer|systeme|equipe\.gerer)`?\)/;
const attendu = (ligne, role) => {
  const s = ligne.sonde || {};
  if (s[role]) return s[role];
  if (role === 'admin') return 'present';
  return REFUS_AGENT.test(String(ligne.role || '').trim()) ? 'absent' : 'present';
};

/* --------------------------------------------------------------------------
   Dans la page : le calme (plus de mutation, plus de squelette) et la sonde
   -------------------------------------------------------------------------- */
const calme = (page, { silence = 350, max = 8000 } = {}) => page.evaluate(({ silence: s, max: m }) => new Promise((fini) => {
  const debut = Date.now();
  let t = null;
  const occupe = () => Boolean(document.querySelector('#vue [aria-busy="true"], #vue .squelette, #lat-corps .lat-squelette'));
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(verifierFin, s); });
  function verifierFin() {
    if (occupe() && Date.now() - debut < m) { t = setTimeout(verifierFin, s); return; }
    obs.disconnect(); clearTimeout(garde); fini();
  }
  const garde = setTimeout(() => { obs.disconnect(); clearTimeout(t); fini(); }, m);
  obs.observe(document.body, { subtree: true, childList: true, characterData: true });
  t = setTimeout(verifierFin, s);
}), { silence, max }).catch(() => {});

const SONDER = (s) => {
  let els = [];
  try { els = [...document.querySelectorAll(s.cible)]; } catch (e) { return { erreur: `sélecteur invalide : ${s.cible}` }; }
  const re = s.texte ? new RegExp(s.texte, 'i') : null;
  const texteDe = (el) => [el.textContent, el.value, el.getAttribute && el.getAttribute('aria-label'), el.getAttribute && el.getAttribute('title'), el.getAttribute && el.getAttribute('data-astuce'), el.getAttribute && el.getAttribute('placeholder')].filter(Boolean).join(' ');
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const bons = els.filter((el) => (!re || re.test(texteDe(el))) && (!s.visible || visible(el)));
  return { trouve: bons.length > 0, n: bons.length, total: els.length };
};

const sonder = async (page, s, attendrePresence) => {
  const fin = Date.now() + (attendrePresence ? 6000 : 0);
  let r = null;
  do {
    r = await page.evaluate(SONDER, { cible: s.cible, texte: s.texte || '', visible: Boolean(s.visible) }).catch((e) => ({ erreur: e.message.slice(0, 160) }));
    if (r.trouve || r.erreur || !attendrePresence) break;
    await pause(250);
  } while (Date.now() < fin);
  return r;
};

/* Les gestes préalables : ouvrir, déplier, survoler ; jamais enregistrer. */
const geste = async (page, g, delai = 6000) => {
  const [quoi, sel, arg] = g;
  if (quoi === 'clic') {
    let loc = page.locator(sel);
    if (arg) loc = loc.filter({ hasText: new RegExp(arg, 'i') });
    await loc.first().click({ timeout: delai });
  } else if (quoi === 'survol') {
    await page.locator(sel).first().hover({ timeout: delai });
  } else if (quoi === 'attendre') {
    await page.waitForSelector(sel, { timeout: delai + 2000 });
  } else if (quoi === 'touche') {
    await page.keyboard.press(sel);
  } else if (quoi === 'remplir') {
    await page.locator(sel).first().fill(String(arg || ''), { timeout: delai });
  } else if (quoi === 'choisir') {
    await page.locator(sel).first().selectOption(String(arg || ''), { timeout: delai });
  } else if (quoi === 'pause') {
    await pause(Number(sel) || 300);
  } else if (quoi === 'evaluer') {
    await page.evaluate(sel);
  } else {
    throw new Error(`geste inconnu : ${quoi}`);
  }
  await calme(page, { silence: 250, max: 4000 });
};

const fermerTout = async (page) => {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(async () => {
    try { const ui = await import('/suivi/assets/js/ui.js'); ui.fermerFlottants(); } catch (e) { /* rien */ }
    document.querySelectorAll('.menu').forEach((m) => m.remove());
  }).catch(() => {});
};

const allerA = async (page, route, { forcer = false } = {}) => {
  const cible = `#${route}`;
  const ici = await page.evaluate(() => location.hash).catch(() => '');
  if (ici === cible && forcer) {
    /* La même adresse, redessinée : un détour par une page légère. */
    await page.evaluate(() => { location.hash = '#/moi'; });
    await page.waitForFunction(() => location.hash === '#/moi', null, { timeout: 5000 }).catch(() => {});
    await calme(page, { silence: 200, max: 3000 });
  }
  if (ici !== cible || forcer) {
    await page.evaluate((h) => { location.hash = h; }, cible);
  }
  await calme(page);
};

/* --------------------------------------------------------------------------
   Le passage d'un rôle
   -------------------------------------------------------------------------- */
const passer = async (nav, role, email, lignes) => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (er) => erreurs.push(er.message.slice(0, 160)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const sortie = [];
  const res = { joignable: 0, absent: 0, interdit: 0, visibleATort: 0, manuel: 0, nonVerifie: 0, ignore: 0 };
  const ecartsRole = [];
  const noter = (ligne, statut, detail = '') => {
    const m = `${ligne.id} [${role}] ${ligne.geste}`;
    if (statut === 'joignable' || statut === 'interdit') sortie.push(`  ok     ${m}${statut === 'interdit' ? ' (interdit comme prévu)' : ''}`);
    else if (statut === 'manuel' || statut === 'ignore') sortie.push(`  ${statut.padEnd(6)} ${m}`);
    else { sortie.push(`  ÉCART  ${m} : ${statut}${detail ? ` · ${detail}` : ''}`); ecartsRole.push(`${m} : ${statut}`); }
    res[{ joignable: 'joignable', interdit: 'interdit', manuel: 'manuel', ignore: 'ignore', absente: 'absent', 'visible à tort': 'visibleATort', 'non vérifiée (temps)': 'nonVerifie', 'geste impossible': 'absent' }[statut] || 'absent'] += 1;
  };

  await connecter(page, email);
  const entre = /\/suivi\/cockpit/.test(page.url());
  if (!entre) {
    lignes.forEach((l) => noter(l, 'absente', `connexion impossible (${page.url()})`));
    await ctx.close();
    return { role, res, sortie, ecartsRole, erreurs };
  }

  /* Les groupes : une route et une suite de gestes. Les sondes sans geste
     d'abord, route par route. */
  const groupes = new Map();
  for (const l of lignes) {
    const s = l.sonde || {};
    if (!l.sonde) { noter(l, 'absente', 'ligne sans sonde'); continue; }
    if (s.manuel) { noter(l, 'manuel'); continue; }
    const a = attendu(l, role);
    if (a === 'ignore') { noter(l, 'ignore'); continue; }
    const cle = `${s.route}\u0000${JSON.stringify(s.avant || [])}`;
    if (!groupes.has(cle)) groupes.set(cle, { route: s.route, avant: s.avant || [], lignes: [] });
    groupes.get(cle).lignes.push(l);
  }
  const liste = [...groupes.values()].sort((x, y) => (x.route === y.route ? x.avant.length - y.avant.length : x.route.localeCompare(y.route)));

  let precedente = null;
  for (const g of liste) {
    if (Date.now() - DEBUT > LIMITE) { g.lignes.forEach((l) => noter(l, 'non vérifiée (temps)')); continue; }
    const t0 = Date.now();
    await fermerTout(page);
    await allerA(page, g.route, { forcer: g.avant.length > 0 || (precedente && precedente.avant.length > 0 && precedente.route === g.route) });
    let rate = '';
    /* Un geste vers ce que le rôle n'a pas : on n'attend pas six secondes
       qu'il devienne possible. */
    const delai = g.lignes.every((l) => attendu(l, role) === 'absent') ? 1500 : 6000;
    for (const x of g.avant) {
      try { await geste(page, x, delai); } catch (e) { rate = `${JSON.stringify(x)} : ${e.message.split('\n')[0].slice(0, 140)}`; break; }
    }
    for (const l of g.lignes) {
      const a = attendu(l, role);
      if (rate) {
        /* Un geste préalable impossible : ce qu'il ouvrait n'est pas
           joignable. Pour un rôle à qui c'est interdit, c'est l'attendu. */
        if (a === 'absent') noter(l, 'interdit'); else noter(l, 'geste impossible', rate);
        continue;
      }
      const r = await sonder(page, l.sonde, a === 'present');
      if (r.erreur) noter(l, 'absente', r.erreur);
      else if (a === 'present') noter(l, r.trouve ? 'joignable' : 'absente', r.trouve ? '' : `${l.sonde.cible}${l.sonde.texte ? ` ~ /${l.sonde.texte}/` : ''} sur ${g.route} (${r.total} candidat(s))`);
      else noter(l, r.trouve ? 'visible à tort' : 'interdit', r.trouve ? `${l.sonde.cible} sur ${g.route}` : '');
    }
    if (TRACE) sortie.push(`  ·      groupe ${g.route} ${g.avant.length ? JSON.stringify(g.avant).slice(0, 120) : ''} ${Date.now() - t0} ms`);
    precedente = g;
  }
  await ctx.close();
  return { role, res, sortie, ecartsRole, erreurs };
};

/* --------------------------------------------------------------------------
   La suite
   -------------------------------------------------------------------------- */
(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();

  console.log('\n== Le registre');
  const ids = LIGNES.map((l) => l.id);
  verifier(LIGNES.length === NOMBRE_ATTENDU, `le registre compte ${NOMBRE_ATTENDU} lignes`, String(LIGNES.length));
  verifier(new Set(ids).size === ids.length, 'aucun numéro en double', ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
  const sansSonde = LIGNES.filter((l) => !l.sonde || (!l.sonde.manuel && (!l.sonde.route || !l.sonde.cible)));
  verifier(sansSonde.length === 0, 'chaque ligne a une sonde (route et sélecteur) ou va au tour manuel', sansSonde.map((l) => l.id).slice(0, 20).join(','));
  const sansDestination = LIGNES.filter((l) => !l.destination);
  verifier(sansDestination.length === 0, 'chaque ligne a une destination', sansDestination.map((l) => l.id).join(','));

  console.log('\n== Le semis de la suite');
  const ajout = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Registre', role: 'agent', projets: ['atelier'] });
  verifier(ajout.code === 200, 'un agent du socle, sur Atelier seul, rejoint l équipe', `${ajout.code} ${ajout.texte.slice(0, 160)}`);
  let poses = 0;
  for (const s of SEMIS) {
    try { await fs.doc(s.chemin).set(await convertir(s.donnees, fs), { merge: Boolean(s.fusion) }); poses += 1; } catch (e) { console.log(`  semis ${s.chemin} : ${e.message.slice(0, 160)}`); }
  }
  verifier(poses === SEMIS.length, `le semis de la suite est posé (${poses}/${SEMIS.length})`);

  /* Atelier relié à Sentry, avec ses quatre adresses : Stabilité et la
     Salle de contrôle ont quelque chose à montrer. */
  const faux = await fauxSentry.demarrer({ port: PORT_SENTRY });
  const sites = await fauxSites.demarrer({ port: PORT_SITES });
  const lie = await appelAdmin('sentryLier', { projet: 'atelier', org: 'forgeme', web: 'forgeme-web', mobile: 'forgeme-mobile', hote: faux.url, sondeWeb: `${sites.url}/web`, sondeLanding: `${sites.url}/landing`, sondeFonctions: `${sites.url}/fonctions?type=legal-mentions&locale=fr`, sondeHub: `${sites.url}/hub` });
  verifier(lie.code === 200, 'Atelier est relié à Sentry', `${lie.code} ${lie.texte.slice(0, 160)}`);
  const r = await fetch(DECLENCHEUR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  const battu = await attendre(async () => { const d = await fs.doc('projets/atelier/stabilite/salle').get(); return d.exists ? d.data() : null; }, 40000);
  verifier(Boolean(r && r.ok) && Boolean(battu), 'le premier battement de la salle de contrôle est passé');

  /* Les lignes à passer. */
  const choix = (process.env.REGISTRE_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const lignes = choix.length ? LIGNES.filter((l) => choix.includes(l.id)) : LIGNES;
  const roles = (process.env.REGISTRE_ROLES || 'admin,agent').split(',').map((x) => x.trim());

  const nav = await chromium.launch();
  const passages = await Promise.all([
    roles.includes('admin') ? passer(nav, 'admin', ADMIN, lignes) : null,
    roles.includes('agent') ? passer(nav, 'agent', AGENT, lignes) : null,
  ]);
  await nav.close();
  await faux.fermer().catch(() => {});
  await sites.fermer().catch(() => {});

  const bilan = {};
  for (const p of passages.filter(Boolean)) {
    console.log(`\n== En ${p.role === 'admin' ? 'administrateur' : 'agent'} (${lignes.length} lignes)`);
    p.sortie.forEach((x) => console.log(x));
    ok += p.sortie.filter((x) => x.startsWith('  ok')).length;
    ecarts.push(...p.ecartsRole);
    bilan[p.role] = p.res;
    if (p.erreurs.length) console.log(`  (erreurs de page : ${[...new Set(p.erreurs)].slice(0, 5).join(' | ')})`);
  }

  console.log('\n== Bilan');
  for (const [role, b] of Object.entries(bilan)) {
    console.log(`  ${role.padEnd(6)} joignables ${b.joignable}, absentes ${b.absent}, interdites comme prévu ${b.interdit}, visibles à tort ${b.visibleATort}, manuelles ${b.manuel}, ignorées ${b.ignore}, non vérifiées ${b.nonVerifie}`);
  }
  console.log(`BILAN ${JSON.stringify({ lignes: lignes.length, ...bilan, secondes: Math.round((Date.now() - DEBUT) / 1000) })}`);
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((er) => {
  console.error(er);
  process.exit(2);
});
