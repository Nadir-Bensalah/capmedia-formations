require('./lib/garde-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la bascule Gate 1, combinaison par combinaison

   Pendant un déploiement, quatre choses changent, pas au même instant :
   les fonctions, les données, les règles (Firestore et Storage), le front.
   Cette suite rejoue chaque combinaison qui peut exister, sur une base
   « avant Gate 1 » fictive, avec les trois rôles (client, équipe,
   testeur), et dit pour chacune :
   - ce qui FONCTIONNE (le client suit sa demande, télécharge ses fichiers,
     l'équipe voit la santé, les notes, répond, le testeur dépose sa preuve) ;
   - ce qui est EXPOSÉ (budget, notes internes, brouillons, fichiers
     internes, liste de l'équipe, profils des testeurs lisibles par le client).

   L'ancien front (commit 65e371a) est servi sur 8788 depuis une copie
   extraite par `git archive` ; le nouveau sur 8787. Les fonctions sont
   toujours les nouvelles : en production, elles partent en premier.

     (émulateurs avec les fonctions, deux serveurs locaux 8787 et 8788)
     node fonctions-suivi/outils/transition-gate1.cjs [A B C ...]
   ========================================================================== */
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const RACINE = path.resolve(__dirname, '..', '..');
const ANCIEN = process.env.ANCIEN_COMMIT || '65e371a';
const SITES = { ancien: process.env.SITE_ANCIEN || 'http://127.0.0.1:8788', nouveau: process.env.SITE_NOUVEAU || 'http://127.0.0.1:8787' };
const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8' });
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const REGLES = {
  firestore: { ancien: git('show', `${ANCIEN}:suivi/firestore.rules`), nouveau: lire('suivi/firestore.rules') },
  storage: { ancien: git('show', `${ANCIEN}:suivi/storage.rules`), transition: lire('suivi/storage.transition.rules'), nouveau: lire('suivi/storage.rules') },
};

/* Les combinaisons. `etape` : où elle apparaît dans la séquence proposée. */
const COMBOS = [
  { id: 'A', front: 'ancien', firestore: 'ancien', storage: 'ancien', donnees: 'avant', libelle: 'ancien front + nouvelles fonctions + anciennes règles + données avant', etape: 'après le déploiement des fonctions' },
  { id: 'F', front: 'ancien', firestore: 'ancien', storage: 'transition', donnees: 'avant', libelle: 'ancien front + nouvelles fonctions + règles Storage de transition + données avant', etape: 'avant la migration' },
  { id: 'G', front: 'ancien', firestore: 'ancien', storage: 'transition', donnees: 'migrees', libelle: 'ancien front + nouvelles fonctions + règles Storage de transition + données migrées', etape: 'pendant et après la migration, avant la bascule' },
  { id: 'B', front: 'ancien', firestore: 'ancien', storage: 'ancien', donnees: 'migrees', libelle: 'ancien front + nouvelles fonctions + données migrées + anciennes règles', etape: 'à éviter (migration sans règles Storage de transition)' },
  { id: 'C', front: 'nouveau', firestore: 'ancien', storage: 'ancien', donnees: 'migrees', libelle: 'nouveau front + nouvelles fonctions + données migrées + anciennes règles', etape: 'à éviter (front publié avant les règles)' },
  { id: 'D', front: 'nouveau', firestore: 'nouveau', storage: 'nouveau', donnees: 'migrees', libelle: 'nouveau front + nouvelles fonctions + données migrées + nouvelles règles', etape: 'état final' },
  { id: 'E', front: 'ancien', firestore: 'nouveau', storage: 'nouveau', donnees: 'migrees', libelle: 'ancien front (onglet resté ouvert) + nouvelles règles + données migrées', etape: 'après la bascule, jusqu au rechargement' },
  { id: 'H', front: 'nouveau', firestore: 'nouveau', storage: 'nouveau', donnees: 'avant', libelle: 'nouveau front + nouvelles règles + données NON migrées', etape: 'à éviter (bascule avant la migration)' },
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE_BDD = `projects/${PROJET}/databases/(default)/documents`;
const rest = (c) => `http://127.0.0.1:8080/v1/${RACINE_BDD}/${c}`;
const lireRest = async (c) => { const r = await fetch(rest(c), { headers: prop }); return r.ok ? r.json() : null; };
const viderRest = async (c) => { const j = await lireRest(`${c}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, k) => ((((d || {}).fields || {})[k]) || {}).stringValue || '';

initializeApp({ projectId: PROJET, storageBucket: `${PROJET}.firebasestorage.app` });
const bdd = getFirestore(); const seau = getStorage().bucket(); const auth = getAuth();

const chargerRegles = async (firestore, storage) => {
  const env = await initializeTestEnvironment({ projectId: PROJET,
    firestore: { rules: REGLES.firestore[firestore], host: '127.0.0.1', port: 8080 },
    storage: { rules: REGLES.storage[storage], host: '127.0.0.1', port: 9199 } });
  await env.cleanup();
};
const migrer = () => spawnSync(process.execPath, [path.join(__dirname, 'migrer-confidentialite.mjs'), '--vrai'], { encoding: 'utf8', env: process.env });

const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lireRest('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, site, email) => {
  await viderRest('envois'); await viderRest('connexions'); await viderRest('connexionsIp');
  await page.goto(`${site}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
/* Une page de l'espace, puis son texte une fois posé. */
const texteDe = async (page, hash, attendu, n = 16) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  let t = '';
  for (let i = 0; i < n; i++) { await pause(500); t = await page.evaluate(() => document.body.innerText); if (!attendu || t.includes(attendu)) break; }
  return t;
};
/* Dans la page : les modules du front servi (ancien ou nouveau), sa session. */
const dansLaPage = (page, fn, arg) => page.evaluate(async ([source, a]) => {
  const n = await import('./assets/js/noyau.js');
  const d = await import('./assets/js/donnees.js');
  // eslint-disable-next-line no-new-func
  return new Function('n', 'd', 'a', `return (${source})(n, d, a);`)(n, d, a);
}, [fn.toString(), arg]);
const telecharger = (page, chemin) => dansLaPage(page, async (n, d, c) => {
  try { const url = await n.getDownloadURL(n.refStockage(n.stockage, c)); const r = await fetch(url); return r.ok; } catch (e) { return false; }
}, chemin);
const cheminDe = (page, collection, id, champ) => dansLaPage(page, async (n, d, [c, i, k]) => {
  try { const x = (await n.getDoc(n.doc(n.bdd, c, i))).data() || {}; return k.split('.').reduce((o, p) => (o || {})[p], x) || ''; } catch (e) { return `refus:${e.code || e.message}`; }
}, [collection, id, champ]);
const lisible = (page, fn, arg) => dansLaPage(page, fn, arg).catch(() => false);

const jouer = async (combo) => {
  const r = { combo, fonctionne: [], expose: [], erreurs: [] };
  const F = (libelle, vrai, detail = '') => r.fonctionne.push({ libelle, ok: Boolean(vrai), detail: vrai ? '' : String(detail).slice(0, 160) });
  const X = (libelle, ouvert, detail = '') => r.expose.push({ libelle, ouvert: Boolean(ouvert), detail: String(detail).slice(0, 120) });

  await chargerRegles(combo.firestore, combo.storage);
  const { semerAvantGate1, viderEmulateur } = await import('./lib/avant-gate1.mjs');
  await viderEmulateur({ bdd, seau, projet: PROJET });
  await semerAvantGate1({ bdd, seau, auth });
  if (combo.donnees === 'migrees') { const m = migrer(); if (m.status !== 0) r.erreurs.push(`migration : ${m.stdout}${m.stderr}`); }
  await pause(3000);
  const site = SITES[combo.front];
  const ancien = combo.front === 'ancien';
  const nav = await chromium.launch();
  const contexte = async () => { const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => r.erreurs.push(`${e.message}`.slice(0, 140))); return p; };
  try {
    /* ---------------- Le client ---------------- */
    const c = await contexte();
    await connecter(c, site, 'client.a@exemple.test');
    F('client : l accueil s ouvre', (await texteDe(c, '#/', 'Projet pf-ouvert-1')).includes('Projet pf-ouvert-1'));
    const demande = await texteDe(c, '#/projets/pf-ouvert-1/demandes/pf-t-1', 'Nous regardons');
    F('client : il voit la réponse de Capmedia sur sa demande', demande.includes('Nous regardons, retour demain.'));
    X('client : la note interne s affiche', demande.includes('la marge du module'));
    const fichiers = await texteDe(c, '#/projets/pf-ouvert-1/fichiers', 'cahier.pdf');
    F('client : il voit ses fichiers et ceux qu on lui montre', fichiers.includes('cahier.pdf') && fichiers.includes('maquette.png'), fichiers.slice(0, 200));
    X('client : un fichier interne est listé', fichiers.includes('marge.txt'));
    const messages = await texteDe(c, '#/messages/pf-ouvert-1', 'Merci, reçu.');
    F('client : la conversation du projet s ouvre', messages.includes('Merci, reçu.'));
    const finances = await texteDe(c, '#/finances', 'Devis initial');
    F('client : il voit ses devis et factures', finances.includes('Devis initial') || finances.includes('D-PF-1'), finances.slice(0, 200));
    X('client : un devis brouillon s affiche', finances.includes('Avenant en préparation') || finances.includes('D-PF-2'));
    F('client : il télécharge un fichier déposé par Capmedia', await telecharger(c, await cheminDe(c, 'fichiers', 'pf-fic-visible', 'chemin')));
    F('client : il télécharge un fichier qu il a déposé', await telecharger(c, await cheminDe(c, 'fichiers', 'pf-fic-client', 'chemin')));
    F('client : il télécharge le PDF d un devis envoyé', await telecharger(c, await cheminDe(c, 'documents', 'pf-devis-1', 'fichier.chemin')));
    F('client : il télécharge une pièce de sa demande', await telecharger(c, 'projets/pf-ouvert-1/tickets/pf-t-1/capture-client.png'));
    F('client : il télécharge la pièce d une validation', await telecharger(c, 'projets/pf-ouvert-1/documents/validations/1720000030-maquette-v2.png'));
    X('client : un fichier interne se télécharge', await telecharger(c, await cheminDe(c, 'fichiers', 'pf-fic-interne', 'chemin').then((x) => x || 'projets/pf-ouvert-1/documents/fichiers/1720000002-marge.txt')));
    X('client : l ancien objet d un fichier interne se télécharge', await telecharger(c, 'projets/pf-ouvert-1/documents/fichiers/1720000002-marge.txt'));
    X('client : le PDF d un brouillon se télécharge', await telecharger(c, 'projets/pf-ouvert-1/documents/devis/1720000011-devis-2.pdf') || await telecharger(c, 'projets/pf-ouvert-1/pieces/pf-devis-2/1720000011-devis-2.pdf'));
    X('client : la pièce d une note interne se télécharge', await telecharger(c, 'projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png'));
    X('client : budget, note ou santé lisibles', await lisible(c, async (n) => { const x = (await n.getDoc(n.doc(n.bdd, 'projets', 'pf-ouvert-1'))).data() || {}; return ['budget', 'budgetNote', 'sante'].some((k) => k in x); }));
    X('client : notes internes de son organisation lisibles', await lisible(c, async (n) => { const x = (await n.getDoc(n.doc(n.bdd, 'organisations', 'pf-org-a'))).data() || {}; return Boolean(x.notesInternes); }));
    X('client : note interne d un paiement lisible', await lisible(c, async (n) => { const x = (await n.getDoc(n.doc(n.bdd, 'paiements', 'pf-pay-1'))).data() || {}; return Boolean(x.note); }));
    X('client : la liste de l équipe se lit', await lisible(c, async (n) => (await n.getDocs(n.collection(n.bdd, 'equipe'))).size > 0));
    X('client : les profils communs des testeurs se lisent', await lisible(c, async (n) => (await n.getDocs(n.collectionGroup(n.bdd, 'public'))).size > 0));
    X('client : les collections internes se lisent', await lisible(c, async (n) => { try { return (await n.getDoc(n.doc(n.bdd, 'projetsInternes', 'pf-ouvert-1'))).exists(); } catch (e) { return false; } }));
    /* Il écrit : une demande, un fichier, un message. */
    const avantTickets = ((await lireRest('tickets?pageSize=100')) || {}).documents || [];
    await texteDe(c, '#/projets/pf-ouvert-1/nouvelle-demande', 'Envoyer la demande');
    let cree = false;
    try {
      await c.fill('#titre', `Demande pendant la bascule ${combo.id}`); await c.fill('#description', 'Écrite pendant la bascule.');
      await c.click('#forme-demande [type="submit"]');
      for (let i = 0; i < 20 && !cree; i++) { await pause(500); cree = (((await lireRest('tickets?pageSize=100')) || {}).documents || []).length > avantTickets.length; }
    } catch (e) { r.erreurs.push(`demande : ${e.message.slice(0, 100)}`); }
    F('client : il crée une demande', cree);
    const depot = await dansLaPage(c, async (n, d, estAncien) => {
      try {
        const s = await n.session();
        const f = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 'bascule.png', { type: 'image/png' });
        const dossier = estAncien ? 'projets/pf-ouvert-1/documents/client' : `projets/pf-ouvert-1/fichiers/${d.nouvelId('fichiers')}`;
        const piece = await n.envoyerPiece(f, dossier, () => {});
        await d.ecrire.deposerFichier(s, 'pf-ouvert-1', piece);
        return 'ok';
      } catch (e) { return `refus:${e.code || e.message}`; }
    }, ancien);
    F('client : il dépose un fichier', depot === 'ok', depot);
    /* ---------------- L'équipe ---------------- */
    const e = await contexte();
    await connecter(e, site, 'agent.pf@exemple.test');
    const fiche = await texteDe(e, '#/projets/pf-ouvert-1', 'Attention');
    F('équipe : la fiche projet montre la santé', fiche.includes('Attention'), fiche.slice(0, 160));
    const client = await texteDe(e, '#/clients/pf-org-a', '45 jours');
    F('équipe : la fiche client montre ses notes internes', client.includes('Paie toujours à 45 jours'), client.slice(0, 160));
    const budget = await lisible(e, async (n, d, estAncien) => { const x = (await n.getDoc(n.doc(n.bdd, estAncien ? 'projets' : 'projetsInternes', 'pf-ouvert-1'))).data() || {}; return x.budget === 12400; }, ancien);
    F('équipe : le budget est là où ce front le lit', budget);
    const noteP = await lisible(e, async (n, d, estAncien) => { const x = (await n.getDoc(n.doc(n.bdd, estAncien ? 'paiements' : 'paiementsInternes', 'pf-pay-1'))).data() || {}; return x.note === 'Reçu après deux relances.'; }, ancien);
    F('équipe : la note d un paiement est là où ce front la lit', noteP);
    const demandeE = await texteDe(e, '#/projets/pf-ouvert-1/demandes/pf-t-1', 'la marge du module');
    F('équipe : elle voit la demande et sa note interne', demandeE.includes('la marge du module'));
    let repondu = false;
    try {
      await e.fill('#texte-message', `Réponse pendant la bascule ${combo.id}`);
      await e.click('#forme-message [type="submit"]');
      for (let i = 0; i < 20 && !repondu; i++) { await pause(500); const j = await lireRest('tickets/pf-t-1/messages?pageSize=50'); repondu = ((j && j.documents) || []).some((m) => str(m, 'texte') === `Réponse pendant la bascule ${combo.id}`); }
    } catch (x) { r.erreurs.push(`réponse : ${x.message.slice(0, 100)}`); }
    F('équipe : elle répond au client', repondu);
    F('équipe : elle télécharge un fichier interne', await telecharger(e, await cheminDe(e, 'fichiers', 'pf-fic-interne', 'chemin')));
    F('équipe : elle télécharge le PDF d un brouillon', await telecharger(e, await cheminDe(e, 'documents', 'pf-devis-2', 'fichier.chemin')));
    const tests = await texteDe(e, '#/tests?projet=pf-ouvert-1', 'Infirmière');
    F('équipe : la console de tests montre le profil des testeurs', tests.includes('Infirmière'), tests.slice(0, 160));
    /* Le client voit la réponse. */
    await c.reload({ waitUntil: 'domcontentloaded' }); await pause(2000);
    const vue = await texteDe(c, '#/projets/pf-ouvert-1/demandes/pf-t-1', `Réponse pendant la bascule ${combo.id}`);
    F('client : il voit la réponse écrite pendant la bascule', vue.includes(`Réponse pendant la bascule ${combo.id}`));
    /* ---------------- Le testeur ---------------- */
    const t = await contexte();
    await connecter(t, site, 'testeur.un@essai.test');
    let espace = '';
    for (let i = 0; i < 16; i++) { await pause(500); espace = await t.evaluate(() => document.body.innerText); if (espace.includes('Campagne fictive')) break; }
    F('testeur : il voit sa campagne', espace.includes('Campagne fictive'), espace.slice(0, 160));
    const preuve = await dansLaPage(t, async (n) => {
      try { await n.uploadBytes(n.refStockage(n.stockage, `campagnes/pf-ouvert-1/pf-camp/${n.auth.currentUser.uid}/bascule-${Date.now()}.png`), new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' }); return 'ok'; } catch (x) { return `refus:${x.code || x.message}`; }
    });
    F('testeur : il dépose une preuve', preuve === 'ok', preuve);
  } catch (x) {
    r.erreurs.push(`arrêt : ${x.message.slice(0, 200)}`);
  } finally { await nav.close(); }
  return r;
};

(async () => {
  for (const s of Object.values(SITES)) { try { await fetch(`${s}/suivi/`); } catch (x) { console.error(`Site absent : ${s}`); process.exit(2); } }
  const choisis = process.argv.slice(2).filter((a) => /^[A-Z]$/.test(a));
  const liste = choisis.length ? COMBOS.filter((c) => choisis.includes(c.id)) : COMBOS;
  const resultats = [];
  for (const combo of liste) {
    process.stdout.write(`\n== ${combo.id} · ${combo.libelle}\n`);
    const r = await jouer(combo);
    resultats.push(r);
    for (const f of r.fonctionne) console.log(`  ${f.ok ? 'ok   ' : 'CASSÉ'}  ${f.libelle}${f.detail ? ` · ${f.detail}` : ''}`);
    for (const x of r.expose) console.log(`  ${x.ouvert ? 'EXPOSÉ' : 'fermé '}  ${x.libelle}`);
    for (const x of [...new Set(r.erreurs)]) console.log(`  (erreur de page) ${x}`);
  }
  const sortie = path.join(RACINE, 'fonctions-suivi', 'qa', 'preflight', 'transition.json');
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, JSON.stringify(resultats, null, 1));
  console.log('\n== Matrice');
  for (const r of resultats) {
    const casses = r.fonctionne.filter((f) => !f.ok).length;
    const exposes = r.expose.filter((x) => x.ouvert).length;
    console.log(`  ${r.combo.id}  ${String(r.fonctionne.length - casses).padStart(2)}/${r.fonctionne.length} fonctionnent · ${String(exposes).padStart(2)} exposition(s) · ${r.combo.libelle}`);
  }
  /* Rien ne prend la base au banc suivant : on remet les vraies règles. */
  await chargerRegles('nouveau', 'nouveau');
  process.exit(0);
})().catch((x) => { console.error(x); process.exit(1); });
