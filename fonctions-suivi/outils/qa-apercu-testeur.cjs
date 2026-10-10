require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · « Voir comme ce testeur » (Nadir, 10/10/2026)

   Depuis une campagne du Cockpit, l'équipe ouvre l'espace testeur tel
   qu'une place ou une personne le verra, en lecture seule. Ce que la suite
   prouve, dans la vraie page et sur le vrai serveur :
   - le bouton est là pour chaque place et chaque testeur de la campagne ;
   - l'aperçu de Karim montre EXACTEMENT ses cases, dans son ordre (lu
     dans son propre espace, connecté comme lui), le socle d'abord ;
   - la feuille d'un scénario s'ouvre avec ses étapes, les pages
     L'application, Présentation et le guide s'ouvrent, la bulle aussi ;
   - le sélecteur passe à la place « iPhone 2 », qui montre exactement ce
     que voit Hugo (même affectation) ;
   - AUCUNE écriture ne part : tous les documents de la base sont relevés
     avant et après (chemin et date de mise à jour), aucune requête
     d'écriture Firestore ni appel de fonction ne sort de la page, et
     même un setDoc appelé à la main est refusé par le noyau ;
   - un testeur et un client qui ouvrent l'adresse de l'aperçu sont
     refusés, et ne lisent pas les données d'un autre testeur.

   Banc : émulateurs, site local, semer-suivi puis semer-campagne.
   ========================================================================== */

const { chromium } = require('@playwright/test');
const admin = require('../node_modules/firebase-admin');
const PROJET = 'capmedia-1f90d', SITE = BANC.site, P = 'atelier', CID = 'c-oct';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bddRest = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bddRest(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, n) => ((((d || {}).fields || {})[n]) || {}).stringValue || '';
const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lire('envois?pageSize=300'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && JSON.stringify((d.fields || {}).a || {}).includes(e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForSelector('.page h1, .page--testeur, .accueil', { timeout: 30000 }).catch(() => {}); await pause(2000);
};
const aller = async (page, hash, attendu) => { for (let i = 0; i < 8; i++) {
  await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, hash);
  await pause(1200);
  if (!attendu || await page.$(attendu)) return true; } return false; };
const passerAccueil = async (page) => {
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 25000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }).catch(() => null); }
  await page.waitForSelector('.tb--testeur [data-case]', { timeout: 25000 }).catch(() => null); await pause(1000);
};
const cases = (page) => page.$$eval('.tb--testeur [data-case]', (l) => l.map((c) => c.dataset.case));

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const db = admin.firestore();
  const refC = db.doc(`projets/${P}/campagnes/${CID}`);

  /* Tous les documents de la base : chemin et date de mise à jour. */
  const instantane = async () => {
    const m = new Map();
    const parcourir = async (cols) => {
      for (const col of cols) {
        const q = await col.get();
        q.docs.forEach((d) => m.set(d.ref.path, d.updateTime.toMillis()));
        for (const r of await col.listDocuments()) await parcourir(await r.listCollections());
      }
    };
    await parcourir(await db.listCollections());
    return m;
  };
  const difference = (a, b) => {
    const l = [];
    b.forEach((t, k) => { if (!a.has(k)) l.push(`+${k}`); else if (a.get(k) !== t) l.push(`~${k}`); });
    a.forEach((t, k) => { if (!b.has(k)) l.push(`-${k}`); });
    return l;
  };

  console.log('\n== Le terrain : Karim, Hugo, et une place « iPhone 2 » qui porte le travail de Hugo');
  const vivier = (await db.collection('testeurs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const parPrenom = Object.fromEntries(vivier.map((t) => [t.prenom, t]));
  const karim = parPrenom.Karim, hugo = parPrenom.Hugo, sonia = parPrenom.Sonia;
  const c0 = (await refC.get()).data() || {};
  const aff = c0.affectation || {};
  verifier(karim && hugo && aff[karim.id] && aff[hugo.id], 'Karim et Hugo ont leurs passages sur la campagne du banc');
  const clesKarim = aff[karim.id].cles || [];
  /* Le socle : le dernier scénario de Karim, pour voir le socle passer devant. */
  const socleId = String(clesKarim[clesKarim.length - 1] || '').split('__')[0];
  await refC.update({
    regle: 'socle', socle: [socleId],
    places: { 'place-ios-2': { libelle: 'iPhone 2', mobile: 'ios', web: true, rang: 2 } },
    testeurs: [...(c0.testeurs || []), 'place-ios-2'],
    [`affectation.place-ios-2`]: JSON.parse(JSON.stringify(aff[hugo.id])),
  });

  const nav = await chromium.launch();
  const err = [];
  const ouvrirContexte = async () => { const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => err.push(`PAGE: ${e.message.slice(0, 160)}`)); return { ctx, p }; };

  console.log('\n== Ce que Karim et Hugo voient, connectés comme eux');
  const k = await ouvrirContexte();
  await connecter(k.p, 'karim.testeur@essai.test'); await passerAccueil(k.p);
  const refsKarim = await cases(k.p);
  verifier(refsKarim.length >= 3, `Karim voit ses ${refsKarim.length} scénarios`);
  verifier(String(refsKarim[0] || '').startsWith(socleId), 'le socle passe devant chez Karim', refsKarim.slice(0, 3).join(','));
  const lienRefuseKarim = `${SITE}/suivi/testeur.html?emul&apercu=${sonia.id}&projet=${P}&campagne=${CID}`;
  /* Karim se déconnecte de la scène : sa présence à lui écrirait pendant le relevé. */
  await k.ctx.close();
  const h = await ouvrirContexte();
  await connecter(h.p, 'hugo.testeur@essai.test'); await passerAccueil(h.p);
  const refsHugo = await cases(h.p);
  verifier(refsHugo.length >= 3 && refsHugo.join('|') !== refsKarim.join('|'), `Hugo voit ses ${refsHugo.length} scénarios, pas ceux de Karim`);
  await h.ctx.close();

  console.log('\n== Le bouton « Voir comme ce testeur », dans la campagne du Cockpit');
  const e = await ouvrirContexte();
  await connecter(e.p, 'agent.essai@exemple.test');
  await aller(e.p, `#/tests?projet=${P}`, `[data-action="ouvrir-campagne"][data-id="${CID}"]`);
  await e.p.evaluate((id) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`); if (b) b.click(); }, CID);
  await e.p.waitForSelector('[data-voir-comme]', { timeout: 15000 }).catch(() => null);
  const boutons = await e.p.$$eval('[data-voir-comme]', (l) => l.map((b) => b.dataset.voirComme));
  verifier(boutons.includes('place-ios-2'), 'un bouton pour la place iPhone 2', boutons.join(','));
  verifier((c0.testeurs || []).every((u) => boutons.includes(u)), 'un bouton pour chaque testeur de la campagne', `${boutons.length}`);
  verifier((await e.p.textContent(`[data-voir-comme="${karim.id}"]`) || '').trim() === 'Voir comme ce testeur', 'il dit « Voir comme ce testeur »');

  const [vue] = await Promise.all([e.ctx.waitForEvent('page'), e.p.click(`[data-voir-comme="${karim.id}"]`)]);
  vue.on('pageerror', (x) => err.push(`APERÇU: ${x.message.slice(0, 160)}`));
  /* Ce qui sort de la page de l'aperçu : écritures Firestore et appels de fonctions. */
  const sorties = [];
  vue.on('request', (r) => {
    const u = r.url();
    if (/google\.firestore\.v1\.Firestore\/Write\//.test(u) || /:commit\b|:batchWrite\b/.test(u)) sorties.push(`firestore ${u.slice(0, 120)}`);
    if (/\/europe-west1\//.test(u) && r.method() !== 'GET') sorties.push(`fonction ${r.method()} ${u.slice(0, 120)}`);
    if (/firebasestorage|\/v0\/b\//.test(u) && r.method() !== 'GET') sorties.push(`stockage ${r.method()} ${u.slice(0, 120)}`);
  });
  await vue.waitForSelector('[data-apercu-bandeau]', { timeout: 30000 }).catch(() => null);
  await vue.waitForSelector('.tb--testeur [data-case]', { timeout: 30000 }).catch(() => null); await pause(2500);
  /* Le Cockpit se ferme : seule la page de l'aperçu reste ouverte. */
  await e.p.close(); await pause(6000);
  const avant = await instantane();

  const bandeau = (await vue.textContent('[data-apercu-bandeau]').catch(() => '')) || '';
  verifier(/Aperçu de l'espace de Karim, lecture seule/.test(bandeau), 'le bandeau dit « Aperçu de l espace de Karim, lecture seule »', bandeau.slice(0, 120));
  verifier(/testeur\.html/.test(vue.url()) && /apercu=/.test(vue.url()), 'c est l espace testeur lui-même (testeur.html)');
  const refsApercu = await cases(vue);
  if (process.env.CAPTURE_APERCU) await vue.screenshot({ path: process.env.CAPTURE_APERCU }).catch(() => {});
  verifier(refsApercu.join('|') === refsKarim.join('|'), 'l aperçu montre exactement les cases de Karim, dans son ordre', `${refsApercu.length} / ${refsKarim.length}`);
  verifier(!(await vue.$('.accueil')), 'aucun accueil imposé dans l aperçu');

  console.log('\n== La feuille, les pages, la bulle : visibles, rien d enregistré');
  await vue.click(`.tb--testeur [data-case="${refsApercu[0]}"]`);
  await vue.waitForSelector('.modale--scenario [data-feuille-poser]', { timeout: 10000 }).catch(() => null);
  const feuille = await vue.evaluate(() => [...document.querySelectorAll('.fs-bloc-sur')].map((x) => x.textContent.trim()));
  verifier(feuille.includes('Ce qui doit se passer') && Boolean(await vue.$('.modale--scenario [data-feuille-poser]')), 'la feuille du scénario s ouvre, avec ce qui doit se passer et ses boutons de résultat', feuille.join(','));
  await vue.click('.modale--scenario [data-feuille-poser="ok"]');
  await pause(700);
  const toasts = async () => (await vue.$$eval('.toasts', (l) => l.map((x) => x.innerText).join(' '))) || '';
  verifier(/Aperçu : rien n'est enregistré/.test(await toasts()), 'Réussi : « Aperçu : rien n est enregistré »');
  verifier(Boolean(await vue.$('.modale--scenario')), 'la feuille reste ouverte, rien n est posé');
  const passer = await vue.$('.modale--scenario [data-feuille-passer]');
  if (passer) { await passer.click(); await pause(500); }
  verifier(Boolean(await vue.$('.modale--scenario')), 'Passer est arrêté aussi');
  await vue.keyboard.press('Escape'); await pause(600);
  verifier(await aller(vue, '#/application', '.page-tete'), 'la page L application s ouvre');
  verifier(await aller(vue, '#/presentation', '.page--presentation'), 'l onglet Présentation s ouvre');
  verifier(await aller(vue, '#/guide', '[data-visite-relancer]'), 'le guide et sa visite guidée sont là');
  await aller(vue, '#/', '.tb--testeur [data-case]');
  const bulle = await vue.$('#bulle-ouvrir');
  verifier(Boolean(bulle), 'la bulle vers l équipe est là');
  if (bulle) {
    await bulle.click(); await pause(600);
    await vue.fill('#bulle-texte', 'Message qui ne doit pas partir');
    await vue.press('#bulle-texte', 'Enter'); await pause(500);
    await vue.click('.bulle-envoyer').catch(() => {}); await pause(800);
  }
  const terminer = await vue.$('[data-terminer]');
  if (terminer) { await terminer.click().catch(() => {}); await pause(600); }
  /* Le noyau lui-même : un setDoc écrit à la main ne part pas. */
  const main = await vue.evaluate(async () => {
    const n = await import('./assets/js/noyau.js');
    const r = {};
    try { await n.setDoc(n.doc(n.bdd, 'projets', 'atelier', 'campagnes', 'c-oct', 'passages', 'apercu-essai'), { testeur: 'x' }); r.setDoc = 'parti'; } catch (x) { r.setDoc = x.code; }
    try { await n.addDoc(n.collection(n.bdd, 'presences'), { a: 1 }); r.addDoc = 'parti'; } catch (x) { r.addDoc = x.code; }
    try { const l = n.writeBatch(n.bdd); l.set(n.doc(n.bdd, 'presences', 'apercu-essai'), { a: 1 }); await l.commit(); r.lot = 'parti'; } catch (x) { r.lot = x.code; }
    try { await fetch('http://127.0.0.1:5001/capmedia-1f90d/europe-west1/hubCompteTest', { method: 'POST', body: '{}' }); r.fetch = 'parti'; } catch (x) { r.fetch = x.code; }
    return r;
  });
  verifier(main.setDoc === 'apercu' && main.addDoc === 'apercu' && main.lot === 'apercu' && main.fetch === 'apercu', 'setDoc, addDoc, un lot et un appel de fonction sont refusés par le noyau', JSON.stringify(main));

  console.log('\n== Le sélecteur passe à la place iPhone 2');
  const options = await vue.$$eval('[data-apercu-choix] option', (l) => l.map((o) => o.value));
  verifier(options.includes('place-ios-2') && options.includes(hugo.id) && options.includes(karim.id), 'le sélecteur propose les places et les testeurs', `${options.length}`);
  await Promise.all([vue.waitForNavigation({ timeout: 30000 }).catch(() => null), vue.selectOption('[data-apercu-choix]', 'place-ios-2')]);
  await vue.waitForSelector('[data-apercu-bandeau="place-ios-2"]', { timeout: 30000 }).catch(() => null);
  await vue.waitForSelector('.tb--testeur [data-case]', { timeout: 30000 }).catch(() => null); await pause(2500);
  const bandeau2 = (await vue.textContent('[data-apercu-bandeau]').catch(() => '')) || '';
  verifier(/Aperçu de l'espace d'iPhone 2, lecture seule/.test(bandeau2), 'le bandeau dit « Aperçu de l espace d iPhone 2, lecture seule »', bandeau2.slice(0, 120));
  const refsPlace = await cases(vue);
  verifier(refsPlace.join('|') === refsHugo.join('|'), 'la place montre exactement ce que voit Hugo, dans son ordre', `${refsPlace.length} / ${refsHugo.length}`);
  await vue.click(`.tb--testeur [data-case="${refsPlace[0]}"]`).catch(() => {});
  await vue.waitForSelector('.modale--scenario [data-feuille-poser]', { timeout: 10000 }).catch(() => null);
  await vue.click('.modale--scenario [data-feuille-poser="ko"]').catch(() => {}); await pause(800);
  await vue.keyboard.press('Escape'); await pause(500);

  console.log('\n== Aucune écriture : la base avant, la base après');
  await pause(4000);
  await vue.close(); await pause(2000);
  const apres = await instantane();
  const ecart = difference(avant, apres);
  verifier(avant.size > 50, `${avant.size} documents relevés`);
  verifier(!ecart.length, 'aucun document créé, modifié ou supprimé pendant l aperçu', ecart.slice(0, 8).join(' '));
  verifier(!sorties.length, 'aucune écriture ni appel de fonction n est sorti de la page', sorties.slice(0, 4).join(' | '));
  const passagesPlace = await refC.collection('passages').where('testeur', 'in', ['place-ios-2', karim.id]).get();
  verifier(passagesPlace.empty, 'aucun passage au nom de Karim ni de la place');

  console.log('\n== Un testeur et un client ne passent pas');
  const k2 = await ouvrirContexte(); k.p = k2.p;
  await connecter(k.p, 'karim.testeur@essai.test'); await passerAccueil(k.p);
  await k.p.goto(lienRefuseKarim, { waitUntil: 'domcontentloaded' });
  await k.p.waitForSelector('[data-apercu-refus]', { timeout: 20000 }).catch(() => null);
  verifier(Boolean(await k.p.$('[data-apercu-refus]')) && !(await k.p.$('[data-apercu-bandeau]')), 'Karim qui ouvre l aperçu de Sonia est refusé');
  verifier(!(await k.p.$('.tb--testeur [data-case]')), 'et ne voit aucune case');
  const c = await ouvrirContexte();
  await connecter(c.p, 'camille.essai@exemple.test');
  await c.p.goto(`${SITE}/suivi/testeur.html?emul&apercu=${karim.id}&projet=${P}&campagne=${CID}`, { waitUntil: 'domcontentloaded' });
  await c.p.waitForSelector('[data-apercu-refus]', { timeout: 20000 }).catch(() => null);
  verifier(Boolean(await c.p.$('[data-apercu-refus]')) && !(await c.p.$('.tb--testeur [data-case]')), 'la cliente qui ouvre l aperçu de Karim est refusée');
  const jK = await jetonPour('karim.testeur@essai.test');
  const jC = await jetonPour('camille.essai@exemple.test');
  const statut = async (j, chemin) => (await fetch(bddRest(chemin), { headers: { Authorization: `Bearer ${j}` } })).status;
  const requete = async (j, uid) => (await fetch(`${bddRest(`projets/${P}/campagnes/${CID}`)}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${j}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'passages' }], where: { fieldFilter: { field: { fieldPath: 'testeur' }, op: 'EQUAL', value: { stringValue: uid } } } } }) })).status;
  verifier(await statut(jK, `testeurs/${sonia.id}`) === 403, 'Karim ne lit pas la fiche de Sonia');
  verifier(await statut(jK, `projets/${P}/campagnes/${CID}/appreciations/${sonia.id}`) === 403, 'ni son appréciation');
  verifier(await statut(jK, `projets/${P}/campagnes/${CID}/acces/${sonia.id}`) === 403, 'ni ses identifiants');
  verifier(await requete(jK, sonia.id) === 403, 'ni ses passages');
  verifier(await statut(jK, `conversationsTesteurs/${sonia.id}`) === 403, 'ni sa conversation');
  verifier(await statut(jC, `testeurs/${karim.id}`) === 403 && await statut(jC, `projets/${P}/campagnes/${CID}/appreciations/${karim.id}`) === 403 && await statut(jC, `projets/${P}/campagnes/${CID}/acces/${karim.id}`) === 403, 'la cliente ne lit ni la fiche, ni l appréciation, ni les identifiants de Karim');

  verifier(!err.length, 'aucune erreur de page', err.slice(0, 3).join(' | '));
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((x) => { console.error(x); process.exit(2); });
