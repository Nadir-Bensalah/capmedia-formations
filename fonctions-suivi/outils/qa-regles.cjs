/* ==========================================================================
   CAPMEDIA CLIENT HUB · les familles de règles à l'épreuve

   Mille règles ne se listent pas comme trois cents parcours. Ce que la
   page doit dire sans qu'on le cherche, c'est le nombre de CAS essayés :
   c'est lui qui dit la profondeur, pas le nombre de fichiers.

   Et elle doit dire pourquoi c'est gratuit, parce que c'est la question
   que le client pose : une règle métier tourne en une milliseconde, mille
   passent en moins d'une minute, à chaque enregistrement.

   Comme pour les parcours, cette suite ne code AUCUN nombre en dur : elle
   lit le compte réel en base. Une suite qui exigeait mille tomberait au
   premier ajout, pour une raison qui n'est pas un défaut.

     (émulateurs, semis, puis semer-regles.mjs)
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d';
const SITE = 'http://127.0.0.1:8787';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => { const r = await fetch(bdd(c), { headers: prop }); return r.ok ? r.json() : null; };

const soucis = []; const ok = (m) => console.log('  ok     ' + m);
const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, bien, mal) => (c ? ok(bien) : dire(mal ? `${bien} · ${mal}` : bien));

const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=100');
    const pour = ((j && j.documents) || []).filter((d) => {
      const a = ((((d.fields || {}).a || {}).arrayValue) || {}).values || [];
      return a.some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === email);
    });
    if (pour.length) {
      pour.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
      const v = (((pour[0].fields.variables || {}).mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {});
  await pause(1800);
};
const aller = async (page, hash, sel, titre) => {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    await pause(1600);
    const bon = await page.evaluate(([s, t]) => {
      const h1 = (document.querySelector('.page h1') || {}).innerText || '';
      return (!t || h1.includes(t)) && (!s || !!document.querySelector(s));
    }, [sel || null, titre || null]);
    if (bon) return;
  }
};

(async () => {
  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const err = []; page.on('pageerror', (e) => err.push('PAGE: ' + e.message.slice(0, 180)));
  page.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 180)); });

  await fetch(bdd('projets/atelier/regles/ZZ-99'), { method: 'DELETE', headers: prop }).catch(() => {});

  await connecter(page, 'agent.essai@exemple.test');
  await page.evaluate(() => { try { localStorage.setItem('suivi:cle-admin', 'cle-essai-locale'); } catch (e) {} });
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3500);

  /* Le compte réel, lu en base. Rien en dur. */
  /* Firestore pagine sa réponse REST quelle que soit la pageSize demandée :
     une seule lecture donne un total faux dès que la collection grandit. */
  const toutesPages = async (col) => {
    const out = []; let jeton = '';
    for (let i = 0; i < 20; i += 1) {
      const j = await lire(`${col}?pageSize=300${jeton ? `&pageToken=${jeton}` : ''}`);
      (((j || {}).documents) || []).forEach((d) => out.push(d));
      jeton = (j || {}).nextPageToken || '';
      if (!jeton) break;
    }
    return out;
  };
  const tout = await toutesPages('projets/atelier/regles');
  const nb = tout.length;
  const cas = tout.reduce((n, d) => n + Number((((d.fields || {}).cas || {}).integerValue) || 0), 0);
  console.log(`\n    (${nb} familles, ${cas} cas en base)`);

  console.log('\n== La section existe et dit la profondeur');
  await aller(page, '/tests?projet=atelier', '.chiffres-tests', 'Tests');
  await pause(1600);
  const v = await page.evaluate(() => ({
    sections: [...document.querySelectorAll('.section-tete h2')].map((h) => h.innerText.trim()),
    texte: document.body.innerText,
    bouton: !!document.querySelector('[data-nouvelle-regle]'),
  }));
  verifier(v.sections.includes('Règles métier'), 'la section existe', v.sections.join('/'));
  verifier(v.bouton, 'le bouton de création est là');
  verifier(new RegExp(`${nb} familles`).test(v.texte), `les ${nb} familles sont annoncées`);
  verifier(new RegExp(`${cas} cas`).test(v.texte), `les ${cas} cas aussi`);
  verifier(/milliseconde/.test(v.texte), 'la page dit pourquoi c est gratuit');
  verifier(/éprouvées par mutation/.test(v.texte), 'et le compte des éprouvées');

  console.log('\n== Le catalogue se replie, groupé par famille');
  const r1 = await page.evaluate(() => {
    const b = document.querySelector('#catalogue-regles');
    return { existe: !!b, replie: b ? b.hidden : null,
      bouton: (document.querySelector('[data-plier-regles]') || {}).innerText || '' };
  });
  verifier(r1.existe, 'le catalogue existe');
  verifier(r1.replie === true, 'il est replié au départ', 'il est déplié : mille lignes dans la page');
  verifier(new RegExp(`Voir les ${nb} familles`).test(r1.bouton), `le bouton annonce les ${nb}`, r1.bouton);

  await page.click('[data-plier-regles]'); await pause(900);
  const r2 = await page.evaluate(() => {
    const b = document.querySelector('#catalogue-regles');
    return { replie: b.hidden, lignes: b.querySelectorAll('.ligne').length,
      blocs: [...b.querySelectorAll('.bloc-tete')].map((h) => h.innerText.trim().replace(/\s+/g, ' ')) };
  });
  verifier(r2.replie === false, 'un clic le déplie');
  verifier(r2.lignes === nb, `les ${nb} familles sont là`, `${r2.lignes} lignes`);
  verifier(r2.blocs.length >= 6, 'groupées par famille', r2.blocs.join(' / '));
  await page.click('[data-plier-regles]'); await pause(800);

  console.log('\n== En créer une');
  await page.click('[data-nouvelle-regle]'); await pause(1200);
  const f = await page.evaluate(() => ({
    feuille: !!document.querySelector('.feuille'),
    familles: document.querySelectorAll('#ed-famille option').length,
    etats: document.querySelectorAll('#ed-etat option').length,
    cas: !!document.querySelector('#ed-cas'),
    mutation: !!document.querySelector('[name="mutation"]'),
  }));
  verifier(f.feuille, 'la feuille s ouvre');
  verifier(f.familles >= 6, `les familles (${f.familles})`);
  verifier(f.etats === 3, 'les trois états', String(f.etats));
  verifier(f.cas, 'le champ du nombre de cas');
  verifier(f.mutation, 'la case « éprouvée par mutation »');

  /* Une famille à zéro cas n'essaie rien : la garde doit tenir. */
  await page.fill('#ed-ref', 'ZZ-99');
  await page.fill('#ed-titre', 'Une famille écrite à la main');
  await page.fill('#ed-cas', '0');
  await page.click('[data-enregistrer],button[type="submit"][form="ed-forme"]'); await pause(900);
  verifier(await page.evaluate(() => !!document.querySelector('.voile')), 'zéro cas est refusé', 'la feuille s est fermée');

  await page.fill('#ed-cas', '42');
  await page.click('[data-enregistrer],button[type="submit"][form="ed-forme"]'); await pause(2600);
  const cree = await lire('projets/atelier/regles/ZZ-99');
  verifier(!!cree, 'elle est créée');
  verifier(cree && Number(cree.fields.cas.integerValue) === 42, 'avec ses 42 cas');
  verifier(await page.evaluate(() => /ZZ-99/.test(document.body.innerText)), 'et visible sans recharger');

  console.log('\n== Le client la voit, sans y toucher');
  const nav2 = await chromium.launch();
  const cl = await (await nav2.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  await connecter(cl, 'camille.essai@exemple.test');
  await aller(cl, '/tests?projet=atelier', null, 'Tests');
  await pause(1600);
  const c = await cl.evaluate(() => ({
    voit: /Règles métier/.test(document.body.innerText),
    cas: /cas essayés/.test(document.body.innerText),
    creer: document.querySelectorAll('[data-nouvelle-regle]').length,
  }));
  verifier(c.voit, 'il voit la section');
  verifier(c.cas, 'avec le nombre de cas');
  verifier(c.creer === 0, 'sans pouvoir en créer');
  await cl.click('[data-plier-regles]'); await pause(900);
  const c2 = await cl.evaluate(() => ({
    lignes: document.querySelectorAll('#catalogue-regles .ligne').length,
    editer: document.querySelectorAll('[data-editer-regle]').length,
  }));
  verifier(c2.lignes > 10, `il les voit toutes (${c2.lignes})`);
  verifier(c2.editer === 0, 'sans bouton de modification');

  console.log('\n' + (soucis.length ? `${soucis.length} ÉCART(S)` : 'tout est conforme'));
  console.log('Erreurs JS :', err.length ? err.slice(0, 3).join(' | ') : 'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length ? 1 : 0);
})();
