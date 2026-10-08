require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · la campagne côté Cockpit, sur le plan de tests

   Ce que la suite garde :
   - la campagne prend ses scénarios dans le plan (section par section),
     et compte en passages (scénario × plateforme, deux testeurs pour un
     « humain » seul) ;
   - B1 : modifier une campagne (un lien TestFlight, un build) ne remet
     pas tous les scénarios ; une campagne d'avant le plan garde les siens ;
   - la feuille refuse « En cours » tant que la campagne n'est pas prête ;
   - « Prête à lancer ? » dit ce qui manque, et « Lancer la campagne »
     ne s'allume que si tout est vrai ;
   - le vivier proposé laisse les testeurs retirés dehors ;
   - les résultats nomment Réussi, Échec, iPhone, et ne répètent pas le
     profil du testeur ; le client ne lit ni « premiers pas » ni la note ;
   - les identifiants de test se posent testeur par testeur
     (campagnes/{c}/acces/{uid}), la feuille ne réécrit plus l'ancien bloc
     commun, et la fiche le vide une fois ressaisi.

   Banc : émulateurs, site local, semer-suivi, semer-campagne (six
   testeurs). La suite pose elle-même son plan de tests sur « atelier »
   et une campagne d'avant le plan.

     node fonctions-suivi/outils/qa-campagne-plan.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d', SITE = BANC.site, P = 'atelier';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };

/* Une valeur JavaScript en valeur Firestore REST. */
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
  return { stringValue: String(v) };
};
const ecrire = async (chemin, objet, champs) => {
  const masque = champs ? champs.map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&') : '';
  const r = await fetch(`${bdd(chemin)}${masque ? `?${masque}` : ''}`, {
    method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(objet).map(([k, x]) => [k, val(x)])) }),
  });
  if (!r.ok) throw new Error(`écriture ${chemin} : ${r.status} ${await r.text()}`);
};
const texte = (f, k) => (((f || {})[k] || {}).stringValue) || '';
const liste = (f, k) => ((((f || {})[k] || {}).arrayValue || {}).values || []).map((x) => x.stringValue);

const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lire('envois?pageSize=100'); const p = ((j && j.documents) || []).filter((d) => JSON.stringify((d.fields || {}).a || {}).includes(e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {}); await pause(1800);
};
const aller = async (page, hash, attendu) => { for (let i = 0; i < 8; i++) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1500);
  if (await page.evaluate((s) => !!document.querySelector(s), attendu)) return; } };

const soucis = []; const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { soucis.push(m); console.log(`  ÉCART  ${m}`); };
const verifier = (c, b, m) => (c ? ok(b) : dire(m ? `${b} · ${m}` : b));

/* Le plan : deux sections, quatre scénarios d'humains, un de robot.
   Passages : cp-c-1 (humain, iPhone + Android) 2 + 2, cp-c-2 (les-deux,
   web) 1, cp-t-1 (les-deux, trois plateformes) 3, cp-t-2 (humain, web) 2. */
const sc = (id, qui, plateformes, priorite = 'moyenne') => ({ id, titre: `Scénario ${id}`, etapes: 'Ouvrir.', attendu: 'Ça marche.', plateformes, type: 'normal', priorite, refs: [], qui, parcours: [] });
const SECTIONS = [
  { id: 'cp-connexion', groupe: 'demarrage', ordre: 1, titre: 'Connexion du banc', resume: 'Se connecter.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [sc('cp-c-1', 'humain', ['ios', 'android'], 'haute'), sc('cp-c-2', 'les-deux', ['web']), sc('cp-c-3', 'robot', ['ios'])], technique: [], ux: [], securite: [] } },
  { id: 'cp-taches', groupe: 'fonctionnalites', ordre: 2, titre: 'Tâches du banc', resume: 'Les tâches.', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [sc('cp-t-1', 'les-deux', ['ios', 'android', 'web'])], technique: [], ux: [sc('cp-t-2', 'humain', ['web'])], securite: [] } },
];

(async () => {
  console.log('\n== Le plan d\'« atelier »');
  await vider(`projets/${P}/planTests`);
  for (const s of SECTIONS) await ecrire(`projets/${P}/planTests/${s.id}`, { ...s, maj: new Date() });
  await ecrire(`projets/${P}/planTests/presentation`, { genre: 'presentation', intro: 'Le plan du banc.', plateformes: ['ios', 'android', 'web'], aspects: [] });
  /* Un testeur retiré du vivier : il ne doit plus être proposé. */
  await ecrire('testeurs/qa-retire', { prenom: 'Rita', nom: 'Retiree', email: 'rita.retiree@essai.test', plateformes: ['ios', 'web'], mobile: 'ios', projets: [P], actif: false });
  const vivier = ((await lire('testeurs?pageSize=50')) || {}).documents || [];
  const uid = (prenom) => { const d = vivier.find((x) => texte(x.fields, 'prenom') === prenom); return d ? d.name.split('/').pop() : ''; };
  const [karim, marc, sonia, ines] = ['Karim', 'Marc', 'Sonia', 'Ines'].map(uid);
  verifier(karim && marc && sonia && ines, 'les testeurs du semis sont là');

  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const err = []; page.on('pageerror', (e) => err.push(`PAGE: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 160)); });
  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, `/tests?projet=${P}`, '#campagnes [data-nouvelle-campagne]');
  await pause(1200);

  console.log('\n== Créer une campagne sur le plan');
  const chapo = await page.evaluate(() => ((document.querySelector('#campagnes .chapo') || {}).innerText || ''));
  verifier(/plan de tests/.test(chapo), 'la section dit que la campagne prend ses scénarios dans le plan', chapo);
  await page.click('[data-nouvelle-campagne]'); await pause(1100);
  const f = await page.evaluate(() => ({
    sections: [...document.querySelectorAll('[data-section]')].map((c) => `${c.dataset.section}:${c.checked}`),
    blocs: document.querySelectorAll('[data-bloc]').length,
    compte: (document.querySelector('#compte-scenarios') || {}).textContent || '',
  }));
  verifier(f.sections.join(',') === 'cp-connexion:true,cp-taches:true', 'les deux sections sont proposées, cochées', f.sections.join(','));
  verifier(f.blocs === 0, 'les blocs de l\'ancienne bibliothèque ne le sont plus', `${f.blocs}`);
  verifier(/^4 scénarios, soit 10 passages : 3 sur iPhone, 3 sur Android, 4 sur le web\.$/.test(f.compte), 'le compte dit 4 scénarios, 10 passages, par plateforme', f.compte);
  await page.uncheck('[data-section="cp-taches"]'); await pause(400);
  const f2 = await page.evaluate(() => (document.querySelector('#compte-scenarios') || {}).textContent || '');
  verifier(/^2 scénarios, soit 5 passages/.test(f2), 'une section de moins : 2 scénarios, 5 passages', f2);
  await page.fill('#ed-titre', 'Campagne du plan, banc');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2500);
  const trouver = async () => (((await lire(`projets/${P}/campagnes?pageSize=50`)) || {}).documents || []).find((d) => texte(d.fields, 'titre') === 'Campagne du plan, banc');
  let camp = await trouver();
  verifier(!!camp, 'la campagne est créée');
  const cid = camp ? camp.name.split('/').pop() : '';
  verifier(camp && liste(camp.fields, 'scenarios').join(',') === 'cp-c-1,cp-c-2', 'elle retient les deux scénarios d\'humains de sa section', camp ? liste(camp.fields, 'scenarios').join(',') : '');
  /* La règle du socle (08/10/2026) : une campagne neuve la prend, avec le
     socle proposé (la priorité haute qui a un téléphone : cp-c-1) et le
     plafond par défaut. */
  verifier(camp && texte(camp.fields, 'regle') === 'socle' && liste(camp.fields, 'socle').join(',') === 'cp-c-1' && ((camp.fields.plafond || {}).integerValue === '120'), 'elle suit la règle du socle : socle proposé (cp-c-1), plafond de 120', camp ? `${texte(camp.fields, 'regle')} ${liste(camp.fields, 'socle').join(',')} ${JSON.stringify(camp.fields.plafond || {})}` : '');

  /* Un ancien bloc commun d'identifiants, comme en avaient les campagnes
     d'avant le 03/10/2026 : la feuille ne doit plus le réécrire. */
  await ecrire(`projets/${P}/campagnes/${cid}`, { acces: { instructions: 'Créez un compte.', identifiants: 'test1 · MotDePasse1' } }, ['acces']);
  await pause(1200);

  console.log('\n== B1 : modifier ne remet pas tous les scénarios');
  const editer = async (id) => {
    await page.evaluate((i) => { const b = document.querySelector(`[data-editer-campagne="${i}"]`); if (b) b.click(); }, id);
    await page.waitForSelector('#ed-titre', { timeout: 8000 }).catch(() => {}); await pause(700);
  };
  await editer(cid);
  const c1 = await page.evaluate(() => [...document.querySelectorAll('[data-section]')].map((c) => `${c.dataset.section}:${c.checked}`).join(','));
  verifier(c1 === 'cp-connexion:true,cp-taches:false', 'la feuille rouvre sa seule section cochée', c1);
  await page.fill('#ed-lien_ios', 'https://testflight.apple.com/join/BANC');
  await page.fill('#ed-build_ios', '25');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  camp = await trouver();
  verifier(camp && liste(camp.fields, 'scenarios').join(',') === 'cp-c-1,cp-c-2', 'changer un lien et un build garde les deux scénarios', camp ? liste(camp.fields, 'scenarios').join(',') : '');
  verifier(camp && texte(((camp.fields.installation || {}).mapValue || {}).fields, 'ios') === 'https://testflight.apple.com/join/BANC', 'et le lien est bien enregistré');
  const accesApres = camp ? (((camp.fields.acces || {}).mapValue || {}).fields || {}) : {};
  verifier(texte(accesApres, 'identifiants') === 'test1 · MotDePasse1' && texte(accesApres, 'instructions') === 'Créez un compte.', 'la feuille ne touche pas à l\'ancien bloc d\'identifiants', JSON.stringify(accesApres).slice(0, 160));

  /* Une campagne d'avant le plan (sur la bibliothèque) : rien de coché,
     un mot pour le dire, et elle garde ses scénarios. */
  const biblio = (((await lire(`projets/${P}/scenarios?pageSize=300`)) || {}).documents || []).map((d) => d.name.split('/').pop()).slice(0, 5);
  await ecrire(`projets/${P}/campagnes/qa-ancienne`, { titre: 'Campagne d\'avant le plan', statut: 'preparation', scenarios: biblio, testeurs: [], affectation: {}, cree: new Date(), maj: new Date() });
  await pause(1500);
  const avantOct = liste(((await lire(`projets/${P}/campagnes/qa-ancienne`)) || {}).fields, 'scenarios');
  await editer('qa-ancienne');
  const old = await page.evaluate(() => ({
    note: !!document.querySelector('[data-ancienne]'),
    cochees: [...document.querySelectorAll('[data-section]')].filter((c) => c.checked).length,
  }));
  verifier(old.note, 'une campagne de l\'ancienne bibliothèque est signalée comme telle');
  verifier(old.cochees === 0, 'aucune section n\'est cochée pour elle', `${old.cochees}`);
  await page.fill('#ed-build_web', 'qa-1.2.1');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  const apresOct = liste(((await lire(`projets/${P}/campagnes/qa-ancienne`)) || {}).fields, 'scenarios');
  verifier(avantOct.length > 0 && apresOct.join(',') === avantOct.join(','), `elle garde ses ${avantOct.length} scénarios`, `${apresOct.length}`);

  console.log('\n== La feuille ne lance pas une campagne qui n\'est pas prête');
  await editer(cid);
  await page.selectOption('#ed-statut', 'en-cours');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  const refus = await page.evaluate(() => ({ ouverte: !!document.querySelector('#ed-titre'), toast: ((document.querySelector('.toasts') || {}).innerText || '').trim() }));
  verifier(refus.ouverte && /pas encore prête/i.test(refus.toast), '« En cours » est refusé, et la feuille dit pourquoi', refus.toast);
  camp = await trouver();
  verifier(camp && texte(camp.fields, 'statut') === 'preparation', 'la campagne reste en préparation');
  await page.keyboard.press('Escape'); await pause(600);

  console.log('\n== Prête à lancer ?');
  const ouvrir = async (pg, id) => {
    for (let i = 0; i < 6; i++) {
      await pg.evaluate((x) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${x}"]`); if (b) b.click(); }, id);
      await pause(1200);
      if (await pg.$('.voile .feuille')) return;
    }
  };
  const fermer = async (pg) => { await pg.keyboard.press('Escape'); await pause(600); };
  await ouvrir(page, cid);
  let l = await page.evaluate(() => ({
    lignes: [...document.querySelectorAll('[data-pret]')].map((x) => `${x.dataset.pret}:${x.dataset.ok}`),
    lancer: document.querySelector('[data-lancer]') ? document.querySelector('[data-lancer]').disabled : null,
    vivier: [...document.querySelectorAll('[data-testeur]')].map((x) => x.closest('label').innerText),
    chiffres: [...document.querySelectorAll('.chiffre')].map((x) => x.innerText.replace(/\s+/g, ' ')),
  }));
  verifier(l.lignes.join(',') === 'scenarios:1,repartition:0,installation:0,presentation:0', 'la liste dit ce qui manque, ligne par ligne', l.lignes.join(','));
  verifier(l.lancer === true, '« Lancer la campagne » est éteint', `${l.lancer}`);
  verifier(l.chiffres.some((x) => /^0 passages confiés/.test(x)), 'la fiche compte les passages confiés (aucun avant de répartir)', l.chiffres.join(' | '));
  verifier(l.vivier.length === 6 && !l.vivier.some((x) => /Rita/.test(x)), 'le vivier propose les six testeurs actifs, pas la retirée', l.vivier.join(' / '));
  await fermer(page);

  /* Une affectation conforme à la règle du socle, posée comme « Répartir »
     la poserait : le socle (cp-c-1) chez chacun sur son téléphone, la clé
     web une seule fois. Avec le nom de l'application et les deux liens,
     tout est vrai. */
  const affectation = {
    [karim]: { telephone: 'ios', web: true, cles: ['cp-c-1__ios', 'cp-c-2__web'], vague: 1 },
    [marc]: { telephone: 'ios', web: true, cles: ['cp-c-1__ios'], vague: 1 },
    [sonia]: { telephone: 'android', web: true, cles: ['cp-c-1__android'], vague: 1 },
    [ines]: { telephone: 'android', web: true, cles: ['cp-c-1__android'], vague: 1 },
  };
  await ecrire(`projets/${P}/campagnes/${cid}`, { testeurs: [karim, marc, sonia, ines], affectation, application: 'Atelier', installation: { ios: 'https://testflight.apple.com/join/BANC', android: '', web: '' } }, ['testeurs', 'affectation', 'application', 'installation']);
  await pause(1500);
  await ouvrir(page, cid);
  l = await page.evaluate(() => ({
    lignes: [...document.querySelectorAll('[data-pret]')].map((x) => `${x.dataset.pret}:${x.dataset.ok}`),
    detail: ((document.querySelector('[data-pret="installation"]') || {}).innerText || '').replace(/\s+/g, ' '),
  }));
  verifier(l.lignes.join(',') === 'scenarios:1,repartition:1,installation:0,presentation:1', 'il ne manque plus que le lien Android', l.lignes.join(','));
  verifier(/lien Android/.test(l.detail), 'et la ligne le dit', l.detail);

  console.log('\n== Les identifiants de test, par testeur');
  const ident = await page.evaluate(() => ({
    champs: [...document.querySelectorAll('[data-identifiants-de]')].map((z) => z.dataset.identifiantsDe),
    ancien: ((document.querySelector('[data-ancien-identifiants]') || {}).innerText || ''),
  }));
  verifier(ident.champs.length === 4, 'un champ par testeur de la campagne', `${ident.champs.length}`);
  verifier(/test1 · MotDePasse1/.test(ident.ancien), 'l\'ancien bloc commun est montré, pour le ressaisir', ident.ancien.slice(0, 120));
  await page.waitForFunction((u) => { const z = document.querySelector(`[data-identifiants-de="${u}"]`); return z && !z.disabled; }, karim, { timeout: 10000 }).catch(() => {});
  await page.fill(`[data-identifiants-de="${karim}"]`, 'karim@essai.test · MotDePasseK');
  await page.click('[data-enregistrer-identifiants]'); await pause(1800);
  const aK = await lire(`projets/${P}/campagnes/${cid}/acces/${karim}`);
  const aS = await lire(`projets/${P}/campagnes/${cid}/acces/${sonia}`);
  verifier(aK && texte(aK.fields, 'identifiants') === 'karim@essai.test · MotDePasseK', 'ceux de Karim sont posés dans son document', aK ? texte(aK.fields, 'identifiants') : 'absent');
  verifier(!aS || !aS.fields, 'un champ resté vide n\'écrit rien chez Sonia');
  await page.click('[data-vider-ancien]'); await pause(700);
  await page.click('.voile [data-oui]'); await pause(2000);
  camp = await trouver();
  verifier(camp && texte((((camp.fields.acces || {}).mapValue || {}).fields || {}), 'identifiants') === '', 'l\'ancien bloc est vidé');
  verifier(camp && texte((((camp.fields.acces || {}).mapValue || {}).fields || {}), 'instructions') === 'Créez un compte.', 'les instructions restent');
  await ouvrir(page, cid);
  verifier(!(await page.$('[data-ancien-identifiants]')), 'vidé, il n\'est plus montré');
  const relu = await page.evaluate(async (u) => { for (let i = 0; i < 20; i++) { const z = document.querySelector(`[data-identifiants-de="${u}"]`); if (z && !z.disabled) return z.value; await new Promise((r) => setTimeout(r, 300)); } return null; }, karim);
  verifier(relu === 'karim@essai.test · MotDePasseK', 'la fiche relit ceux de Karim', `${relu}`);
  await fermer(page);
  await ecrire(`projets/${P}/campagnes/${cid}`, { installation: { ios: 'https://testflight.apple.com/join/BANC', android: 'https://play.google.com/apps/testing/banc', web: '' } }, ['installation']);
  await pause(1500);
  await ouvrir(page, cid);
  l = await page.evaluate(() => ({
    lignes: [...document.querySelectorAll('[data-pret]')].map((x) => `${x.dataset.pret}:${x.dataset.ok}`),
    lancer: document.querySelector('[data-lancer]') ? document.querySelector('[data-lancer]').disabled : null,
  }));
  verifier(l.lignes.every((x) => x.endsWith(':1')), 'tout est vrai', l.lignes.join(','));
  verifier(l.lancer === false, '« Lancer la campagne » s\'allume', `${l.lancer}`);
  await page.click('[data-lancer]'); await pause(2500);
  camp = await trouver();
  verifier(camp && texte(camp.fields, 'statut') === 'en-cours', 'la campagne est lancée', camp ? texte(camp.fields, 'statut') : '');
  verifier(camp && !!(camp.fields.debut || {}).timestampValue, 'et son début est daté');
  verifier(camp && liste(camp.fields, 'scenarios').join(',') === 'cp-c-1,cp-c-2', 'sans toucher à ses scénarios');

  console.log('\n== Les résultats');
  await ecrire(`projets/${P}/campagnes/${cid}/passages/${karim}__cp-c-1__ios`, { testeur: karim, scenario: 'cp-c-1', plateforme: 'ios', resultat: 'echec', commentaire: 'Rien ne se passe au clic.', preuves: [], cree: new Date(), maj: new Date() });
  await ecrire(`projets/${P}/campagnes/${cid}/passages/${karim}__cp-c-2__web`, { testeur: karim, scenario: 'cp-c-2', plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], le: new Date() });
  await pause(2500);
  await ouvrir(page, cid);
  const r = await page.evaluate(() => {
    const b = document.querySelector('#resultats');
    return { texte: b ? b.innerText.replace(/\s+/g, ' ') : '', lignes: b ? b.querySelectorAll('.ligne').length : 0, lancement: !!document.querySelector('[data-lancement]') };
  });
  verifier(r.lignes === 2, 'les deux passages sont listés', `${r.lignes}`);
  verifier(/Karim · iPhone/.test(r.texte), 'une ligne dit qui et sur quoi, avec « iPhone »', r.texte.slice(0, 200));
  verifier(/Échec/.test(r.texte) && /Réussi/.test(r.texte), 'les verdicts se lisent Échec et Réussi, même un ancien « ok »', r.texte.slice(0, 260));
  verifier(!/\bKO\b|\bOK\b/.test(r.texte), 'plus de KO ni d\'OK');
  verifier(!/\d{2}-\d{2} ans|Commerce/.test(r.texte), 'le profil du testeur n\'est pas répété sur la ligne', r.texte.slice(0, 260));
  verifier(!r.lancement, 'une campagne lancée n\'affiche plus « Prête à lancer ? »');
  await fermer(page);

  console.log('\n== Une correction que l\'équipe doit revérifier');
  /* Le serveur note dans « aVerifierEquipe » les échecs dont le testeur ne
     peut plus rejouer (test terminé, accès clos). */
  await ecrire(`projets/${P}/anomalies/qa-a-verifier`, { titre: 'Rien ne se passe au clic', scenario: 'cp-c-1', statut: 'corrigee', gravite: 'important', origine: 'testeur', temoins: [], passages: [], aVerifierEquipe: [`${cid}/${karim}__cp-c-1__ios`], cree: new Date(), maj: new Date() });
  await pause(1500);
  await aller(page, `/tests?projet=${P}`, '#anomalies [data-a-verifier]');
  const av = await page.evaluate(() => ((document.querySelector('#anomalies [data-a-verifier]') || {}).innerText || ''));
  verifier(/1 passage à revérifier par l.équipe/.test(av), 'l\'anomalie le dit à l\'équipe dans la liste', av);

  console.log('\n== Le client');
  const nav2 = await chromium.launch();
  const cl = await (await nav2.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  await connecter(cl, 'camille.essai@exemple.test');
  await aller(cl, `/tests?projet=${P}`, `[data-action="ouvrir-campagne"][data-id="${cid}"]`);
  await ouvrir(cl, cid);
  const vc = await cl.evaluate(() => {
    const f = document.querySelector('.voile .feuille');
    const r = document.querySelector('.voile #resultats');
    return { texte: f ? f.innerText.replace(/\s+/g, ' ') : '', resultats: r ? r.innerText.replace(/\s+/g, ' ') : '', profils: [...document.querySelectorAll('.voile [data-profil]')].map((x) => x.innerText), lancer: !!document.querySelector('[data-lancer], [data-lancement], [data-repartir]'), ident: !!document.querySelector('[data-identifiants], [data-identifiants-de]') };
  });
  verifier(/Testeur \d · iPhone/.test(vc.texte), 'le client lit « Testeur N · iPhone »', vc.texte.slice(0, 200));
  verifier(!/Karim|Marc|Sonia|Ines/.test(vc.texte), 'jamais un prénom');
  verifier(!/premiers pas/i.test(vc.texte), 'ni « premiers pas », jargon interne');
  verifier(!/\d{2}-\d{2} ans|Commerce/.test(vc.resultats), 'ni le profil répété dans les résultats', vc.resultats.slice(0, 260));
  verifier(vc.profils.length === 4 && vc.profils.every((x) => /\d{2}-\d{2} ans/.test(x)), 'le profil se lit une fois, dans la liste des testeurs', vc.profils.join(' | '));
  verifier(!vc.lancer, 'ni rien pour répartir ou lancer');
  verifier(!vc.ident && !/MotDePasse/.test(vc.texte), 'ni les identifiants de test');
  await fermer(cl);
  verifier(!(await cl.$('[data-a-verifier]')), 'ni la note de revérification, affaire d\'équipe');

  console.log(`\n${soucis.length ? `${soucis.length} ÉCART(S)` : 'tout est conforme'}`);
  console.log('Erreurs JS :', err.length ? err.slice(0, 4).join('\n  ') : 'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
