/* ==========================================================================
   CAPMEDIA CLIENT HUB · les annonces de Capmedia

   Ce que prouve cette suite :
   - le semis de la première annonce (annonces-semer.mjs) : à blanc rien,
     --vrai crée l'annonce tarif 2027 EN BROUILLON, relancé ne réécrit rien ;
   - le Cockpit : l'entrée « Annonces » en zone Gestion ; l'administrateur
     crée un tarif en brouillon puis le publie (confirmation), crée une
     annonce visant une seule société (dépliée en comptes), regarde
     l'aperçu « comme le client » pour deux clients (420 puis 480 € HT) ;
     retirer puis republier ne prévient pas deux fois ;
   - la notification : à la publication, chaque client visé la reçoit dans
     sa boîte, pas les autres ;
   - le Hub : l'entrée « Annonces » juste après « Paramètres », son badge
     de non lues qui monte, puis retombe à l'ouverture de la page ; les
     annonces, épinglée en haut ; l'encart tarif personnalisé (un projet de
     plus de 3 mois à 420 € HT, un projet récent à 480 € HT) ;
   - l'indisponibilité : un bandeau sur l'accueil et dans la bulle pendant
     la période (et les 7 jours d'avant), pas en dehors ;
   - les règles avec le vrai jeton : le client n'écrit pas d'annonce (403),
     un brouillon et une annonce qui ne le vise pas restent illisibles
     (403) ; aucune erreur de page, ni « undefined », ni tiret cadratin.

   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const CAPTURES = process.env.CAPTURES_ANNONCES || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/annonces';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const S = (v) => ({ stringValue: String(v) }); const I = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } }); const T = (d) => ({ timestampValue: d.toISOString() });
const NUL = { nullValue: null };
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })).status;
const statutCommit = async (jeton, writes) => (await fetch(`${RACINE}:commit`, { method: 'POST', headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=200')).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await pause(1500); };
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const OUTILS = __dirname;
const semer = (args) => spawnSync('node', [join(OUTILS, 'annonces-semer.mjs'), ...args], { cwd: OUTILS, env: process.env, encoding: 'utf8' });
const deux = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
const dansJours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const notifAnnonce = async (uid) => (await docs(`boites/${uid}/notifications?pageSize=300`)).filter((n) => str(n, 'type') === 'annonce');
const annonces = async () => docs('annonces?pageSize=100');
const parTitre = async (motif) => (await annonces()).find((d) => motif.test(str(d, 'titre')));
const idDe = (d) => (d ? d.name.split('/').pop() : '');
/* Une annonce posée par le propriétaire (le serveur), au format des règles. */
const annonceRest = (o) => ({
  type: S(o.type), titre: S(o.titre), texte: S(o.texte || ''), dateEffet: S(o.dateEffet || ''), publication: S('publiee'), publieLe: T(new Date()),
  epinglee: B(false), cible: M({ tous: B(true), organisations: L([]), uids: L([]) }), tarif: NUL,
  indisponibilite: o.indisponibilite ? M({ du: S(o.indisponibilite.du), au: S(o.indisponibilite.au), message: S(o.indisponibilite.message || '') }) : NUL,
  cree: T(new Date()), maj: T(new Date()),
});
const badgeAnnonces = async (p) => {
  const el = await p.$('#lat-corps .lat-lien[data-chemin="/annonces"] .compte.vif');
  return el ? Number((await el.textContent()).trim()) || 0 : 0;
};
const sansDefaut = (texte, ou) => {
  verifier(!/undefined|\bnull\b|NaN/.test(texte), `${ou} : aucun « undefined », « null » ni « NaN »`, (texte.match(/.{0,40}(undefined|null|NaN).{0,40}/) || [''])[0]);
  verifier(!texte.includes('\u2014'), `${ou} : aucun tiret cadratin`);
};

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  mkdirSync(CAPTURES, { recursive: true });
  await vider('annonces'); await vider('annoncesNotifiees');
  const uidCamille = await uidDe(CAMILLE); const uidLea = await uidDe(LEA);
  for (const u of [uidCamille, uidLea]) await poser(`profils/${u}`, { accueil: T(new Date()) }, ['accueil']);
  const jC = await jetonPour(CAMILLE); const jL = await jetonPour(LEA);
  /* La date d'effet de la grille par défaut : 420 / 480 € HT à partir de là.
     Boutique (Léa) démarre en novembre : encore court au 1er janvier. */
  const effet = '2027-01-01';
  await poser('projets/boutique', { debut: T(new Date(2026, 10, 15)) }, ['debut']);

  console.log('\n== Le semis de la première annonce');
  const blanc = semer([]);
  verifier(blanc.status === 0 && /À blanc/.test(blanc.stdout) && /420 € HT/.test(blanc.stdout) && /480 € HT/.test(blanc.stdout), 'à blanc : l annonce est montrée, 420 et 480 € HT', blanc.stdout.slice(-200));
  verifier((await annonces()).length === 0, 'à blanc : rien n est écrit');
  const vrai = semer(['--vrai']);
  verifier(vrai.status === 0, '--vrai sur l émulateur se termine sans erreur', (vrai.stderr || vrai.stdout).slice(-300));
  const semee = await lire('annonces/tarif-2027-01');
  const tarifSeme = (champ(semee, 'tarif').mapValue || {}).fields || {};
  verifier(str(semee, 'publication') === 'brouillon' && str(semee, 'type') === 'tarif' && str(semee, 'dateEffet') === '2027-01-01', 'l annonce tarif 2027 est créée en brouillon, effet le 1er janvier 2027');
  verifier(!('tjmLong' in tarifSeme) && !('tjmCourt' in tarifSeme), 'l annonce ne porte aucun prix : ils vivent dans la grille');
  const grilleSemee = await lire('reglages/tarifs');
  const periodesSemees = (((champ(grilleSemee, 'periodes').arrayValue || {}).values) || []).map((v) => v.mapValue.fields).map((f) => `${f.debut.stringValue}:${f.long.integerValue}/${f.court.integerValue}`);
  verifier(periodesSemees.join(' ') === '2026-01-01:380/380 2027-01-01:420/480' && (champ(grilleSemee, 'seuilMois').integerValue === '3'), 'la grille par défaut est semée : 380 € pour tous, puis 420 / 480 € au 1er janvier 2027, seuil 3 mois', periodesSemees.join(' '));
  const encore = semer(['--vrai']);
  verifier(encore.status === 0 && /laissée telle quelle/.test(encore.stdout), 'relancé, il ne réécrit pas l annonce', encore.stdout.slice(-160));
  verifier((await notifAnnonce(uidCamille)).length === 0, 'un brouillon ne prévient personne');

  console.log('\n== Les règles, avec le vrai jeton du client');
  verifier(await statutLecture('annonces/tarif-2027-01', jC) === 403, 'un brouillon ne se lit pas côté client (403)');
  verifier(await statutCommit(jC, [{ update: { name: nomDoc('annonces/a-cliente'), fields: annonceRest({ type: 'information', titre: 'Moi' }) }, currentDocument: { exists: false } }]) === 403, 'le client n écrit pas d annonce (403)');
  verifier(await statutCommit(jC, [{ update: { name: nomDoc('annonces/tarif-2027-01'), fields: { publication: S('publiee') } }, updateMask: { fieldPaths: ['publication'] }, currentDocument: { exists: true } }]) === 403, 'ni ne publie un brouillon (403)');

  const nav = await chromium.launch();
  const erreurs = [];
  console.log('\n== L administrateur, dans le Cockpit');
  const ctxEquipe = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctxEquipe.addInitScript(() => { try { localStorage.setItem('suivi:cockpit-theme', 'dark'); } catch (e) { /* rien */ } });
  const equipe = await ctxEquipe.newPage();
  page = equipe;
  equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  await connecter(equipe, ADMIN);
  /* Refonte du Cockpit, lot 4 : la zone Gestion devient le groupe
     « Pilotage », qui se plie ; l'entrée s'y appelle « Annonces et tarifs ». */
  await equipe.waitForSelector('#lat-corps .lat-arbre[data-arbre=":pilotage"]', { state: 'attached', timeout: 20000 }).catch(() => {});
  const gestion = await equipe.$eval('#lat-corps .lat-arbre[data-arbre=":pilotage"]', (g) => ({ titre: ((g.querySelector('.lat-groupe-tete .tronque') || {}).textContent || '').trim(), chemins: [...g.querySelectorAll('.lat-branche .lat-lien')].map((a) => a.dataset.chemin), libelle: ((g.querySelector('.lat-lien[data-chemin="/annonces"] .tronque') || {}).textContent || '').trim() })).catch(() => null);
  verifier(gestion && /Pilotage/.test(gestion.titre) && gestion.chemins.includes('/annonces') && gestion.libelle === 'Annonces et tarifs', 'l entrée « Annonces et tarifs » est dans le groupe Pilotage du Cockpit', JSON.stringify(gestion));
  await aller(equipe, '#/annonces');
  await equipe.waitForSelector('[data-annonce-ligne]', { timeout: 20000 }).catch(() => {});
  verifier(Boolean(await equipe.$('[data-annonce-ligne="tarif-2027-01"]')), 'l annonce semée est listée, en brouillon');

  /* Un tarif, écrit dans le formulaire, enregistré en brouillon. */
  await equipe.click('[data-annonce-action="nouvelle"]');
  await equipe.waitForSelector('#ed-forme #ed-type', { timeout: 8000 });
  verifier(await equipe.isHidden('[data-pour-type="tarif"]'), 'le formulaire cache les règles du tarif tant que le type n est pas « Tarifs »');
  await equipe.selectOption('#ed-type', 'tarif');
  verifier(await equipe.isVisible('#ed-texteLong') && await equipe.isHidden('#ed-du') && !(await equipe.$('#ed-tjmLong')), 'choisir « Tarifs » montre les phrases de l encart (pas de prix : la grille) et cache la période');
  await equipe.fill('#ed-titre', 'Nos tarifs changent');
  await equipe.fill('#ed-texte', 'Le prix de la journée dépend désormais de la durée du projet.');
  await equipe.fill('#ed-dateEffet', effet);
  await equipe.check('#ed-forme [name="epinglee"]');
  await equipe.click('.voile button[type="submit"]');
  const tarif = await attendre(async () => parTitre(/Nos tarifs changent/));
  verifier(tarif && str(tarif, 'publication') === 'brouillon' && str(tarif, 'type') === 'tarif' && str(tarif, 'dateEffet') === effet, 'le tarif est enregistré, en brouillon, avec sa date d effet');
  const idTarif = idDe(tarif);
  await pause(1200);
  await equipe.click(`[data-annonce-action="publier"][data-id="${idTarif}"]`);
  await equipe.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await equipe.click('.voile [data-oui]');
  verifier(await attendre(async () => str(await lire(`annonces/${idTarif}`), 'publication') === 'publiee' && Boolean(champ(await lire(`annonces/${idTarif}`), 'publieLe').timestampValue)), '« Publier » (confirmé) publie le tarif et date la publication');

  /* Une information pour Atelier Nord seulement. */
  await pause(800);
  await equipe.click('[data-annonce-action="nouvelle"]');
  await equipe.waitForSelector('#ed-forme #ed-type', { timeout: 8000 });
  await equipe.selectOption('#ed-type', 'nouveaute');
  await equipe.fill('#ed-titre', 'Atelier : votre espace de tests s agrandit');
  await equipe.fill('#ed-texte', 'Un mot pour vous seuls.');
  await equipe.check('#ed-forme [name="cibleMode"][value="choix"]');
  await equipe.check('[data-cible-org][value="atelier-nord"]');
  await equipe.selectOption('#ed-publication', 'publiee');
  await equipe.click('.voile button[type="submit"]');
  const info = await attendre(async () => parTitre(/espace de tests s agrandit/));
  const cibleInfo = (champ(info, 'cible').mapValue || {}).fields || {};
  const uidsInfo = (((cibleInfo.uids || {}).arrayValue || {}).values || []).map((v) => v.stringValue);
  verifier(info && str(info, 'publication') === 'publiee' && (cibleInfo.tous || {}).booleanValue === false && uidsInfo.includes(uidCamille) && !uidsInfo.includes(uidLea), 'une annonce visant Atelier Nord est dépliée en comptes : Camille, pas Léa', uidsInfo.join(','));
  const idInfo = idDe(info);

  console.log('\n== La notification, aux seuls clients visés');
  verifier(await attendre(async () => (await notifAnnonce(uidCamille)).length >= 2, 40000), 'Camille reçoit le tarif et l annonce qui la vise dans sa boîte');
  verifier(await attendre(async () => (await notifAnnonce(uidLea)).length >= 1, 30000), 'Léa reçoit le tarif');
  await pause(2500);
  const nLea = await notifAnnonce(uidLea);
  verifier(nLea.length === 1 && /tarifs/i.test(str(nLea[0], 'titre')) && str(nLea[0], 'lien') === '#/annonces', 'mais pas l annonce qui ne la vise pas, et la sienne mène à la page', nLea.map((n) => str(n, 'titre')).join(' | '));
  verifier(await statutLecture(`annonces/${idInfo}`, jL) === 403, 'Léa ne lit pas l annonce qui ne la vise pas (403)');
  verifier(await statutLecture(`annonces/${idInfo}`, jC) === 200 && await statutLecture(`annonces/${idTarif}`, jL) === 200, 'Camille la lit, Léa lit le tarif (200)');

  console.log('\n== L aperçu « comme le client »');
  await aller(equipe, '#/annonces');
  await equipe.waitForSelector(`[data-annonce-action="apercu"][data-id="${idTarif}"]`, { timeout: 15000 });
  await equipe.click(`[data-annonce-action="apercu"][data-id="${idTarif}"]`);
  await equipe.waitForSelector('#apercu-client', { timeout: 8000 });
  await equipe.selectOption('#apercu-client', 'atelier-nord'); await pause(300);
  verifier(Boolean(await equipe.$('[data-apercu] [data-tarif-projet="atelier"][data-tarif-tjm="420"]')), 'vu par Atelier Nord : le projet Atelier, de plus de 3 mois, reste à 420 € HT');
  await equipe.selectOption('#apercu-client', 'boutique-sud'); await pause(300);
  verifier(Boolean(await equipe.$('[data-apercu] [data-tarif-projet="boutique"][data-tarif-tjm="480"]')), 'vu par Boutique Sud : le projet Boutique, récent, passe à 480 € HT');
  await equipe.screenshot({ path: join(CAPTURES, 'annonces-cockpit-apercu-sombre.png') });
  await equipe.click('.voile [data-fermer]');
  await pause(500);

  console.log('\n== La grille de tarifs, dans le Cockpit');
  const lignesGrille = await equipe.$$eval('[data-grille-tarifs] [data-grille-periode]', (l) => l.map((x) => `${x.dataset.grillePeriode}:${x.textContent.replace(/\s+/g, ' ').trim()}`));
  verifier(lignesGrille.length === 2 && /380/.test(lignesGrille[0]) && /En vigueur/.test(lignesGrille[0]) && /480/.test(lignesGrille[1]) && /À venir/.test(lignesGrille[1]), 'la section « Grille de tarifs » montre les deux périodes, celle en vigueur et celle à venir', lignesGrille.join(' | '));
  await equipe.click('[data-annonce-action="grille"]');
  await equipe.waitForSelector('[data-periodes] [data-periode]', { timeout: 8000 });
  const champsCourt = await equipe.$$('[data-periodes] [data-periode-court]');
  await champsCourt[1].fill('490');
  await equipe.click('.voile button[type="submit"]');
  const grilleLue = async () => (((champ(await lire('reglages/tarifs'), 'periodes').arrayValue || {}).values) || []).map((v) => v.mapValue.fields);
  verifier(await attendre(async () => { const g = await grilleLue(); return g[1] && (g[1].court.integerValue === '490' || g[1].court.doubleValue === 490); }), 'l éditeur de la grille écrit reglages/tarifs (projet court 2027 à 490)');
  await pause(1000);
  await equipe.click(`[data-annonce-action="apercu"][data-id="${idTarif}"]`);
  await equipe.waitForSelector('#apercu-client', { timeout: 8000 });
  await equipe.selectOption('#apercu-client', 'boutique-sud'); await pause(300);
  verifier(Boolean(await equipe.$('[data-apercu] [data-tarif-projet="boutique"][data-tarif-tjm="490"]')), 'l annonce suit la grille : l aperçu de Boutique passe à 490 € HT');
  await equipe.click('.voile [data-fermer]');
  const P = (d, l, c) => M({ debut: S(d), long: I(l), court: I(c) });
  await poser('reglages/tarifs', { periodes: L([P('2026-01-01', 380, 420), P('2027-01-01', 420, 480)]) }, ['periodes']);
  await pause(1200);
  await equipe.evaluate(() => window.scrollTo(0, 0));
  await equipe.screenshot({ path: join(CAPTURES, 'annonces-cockpit-sombre.png'), fullPage: true });

  console.log('\n== Camille, dans le Hub');
  const ctxClient = await nav.newContext({ viewport: { width: 1280, height: 1100 } });
  await ctxClient.addInitScript(() => { try { localStorage.setItem('suivi:hub-theme', 'light'); } catch (e) { /* rien */ } });
  page = await ctxClient.newPage();
  page.on('pageerror', (e) => erreurs.push(`hub: ${e.message.slice(0, 160)}`));
  await connecter(page, CAMILLE);
  await page.waitForSelector('#lat-corps .lat-lien', { timeout: 30000 }).catch(() => {});
  const compte = await attendre(async () => {
    const gs = await page.$$eval('#lat-corps .lat-groupe', (l) => l.map((g) => ({ titre: (g.querySelector('.lat-titre') || {}).textContent || '', chemins: [...g.querySelectorAll('.lat-lien')].map((a) => a.dataset.chemin) })));
    return gs.find((g) => /Compte/i.test(g.titre) && g.chemins.includes('/annonces'));
  });
  verifier(compte && compte.chemins.indexOf('/annonces') === compte.chemins.indexOf('/parametres') + 1 && compte.chemins.indexOf('/annonces') === compte.chemins.length - 1, 'l entrée « Annonces » est en bas, juste après « Paramètres », hors des projets', compte ? compte.chemins.join(' ') : '');
  verifier(await attendre(async () => (await badgeAnnonces(page)) === 2), 'son badge monte : 2 annonces non lues', String(await badgeAnnonces(page)));
  await aller(page, '#/annonces');
  await page.waitForSelector('[data-annonce]', { timeout: 20000 }).catch(() => {});
  const vues = await page.$$eval('.annonces-liste [data-annonce]', (l) => l.map((a) => a.dataset.annonce));
  verifier(vues.length === 2 && vues[0] === idTarif && vues.includes(idInfo) && !vues.includes('tarif-2027-01'), 'elle lit les deux annonces publiées, l épinglée en haut, pas le brouillon', vues.join(', '));
  verifier(/Tarifs/.test(await page.textContent(`[data-annonce="${idTarif}"] [data-annonce-type]`)) && /À partir du/.test(await page.textContent(`[data-annonce="${idTarif}"] [data-annonce-effet]`)), 'chaque annonce dit son type et sa date d effet');
  const verdict = await page.textContent(`[data-annonce="${idTarif}"] [data-tarif-projet="atelier"]`).catch(() => '');
  verifier(/projet long/.test(verdict) && /420\s?€/.test(verdict) && Boolean(await page.$(`[data-annonce="${idTarif}"] [data-tarif-projet="atelier"][data-tarif-tjm="420"]`)), 'l encart personnalisé : Atelier, commencé il y a plus de 3 mois, est un projet long à 420 € HT par jour', verdict.trim());
  verifier(/passe de 380\s?€ à 420\s?€/.test(verdict) && Boolean(await page.$(`[data-annonce="${idTarif}"] [data-tarif-projet="atelier"][data-tarif-avant="380"]`)), 'avec l avant et l après la date d effet : de 380 à 420 € HT (grille)');
  verifier(/\d{4}/.test(verdict) && /commencé le/.test(verdict), 'et dit quand le projet a commencé');
  verifier(await attendre(async () => (await badgeAnnonces(page)) === 0), 'ouvrir la page fait retomber le badge à zéro');
  verifier(await attendre(async () => ((await page.textContent('#lat-corps .lat-lien[data-chemin="/annonces"] .compte:not(.vif)').catch(() => '')) || '').trim() === '2'), 'le chiffre reste, sans fond : 2 annonces lues');
  verifier(await attendre(async () => Boolean(champ(await lire(`profils/${uidCamille}`), 'annoncesLues').timestampValue)), 'la lecture est gardée dans son profil (annoncesLues)');
  sansDefaut(await page.textContent('.page-annonces'), 'la page des annonces');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(CAPTURES, 'annonces-client-clair.png'), fullPage: true });

  console.log('\n== Retirer, republier : pas de seconde notification');
  const nAvant = (await notifAnnonce(uidCamille)).length;
  await equipe.click(`[data-annonce-action="publier"][data-id="${idInfo}"]`);
  verifier(await attendre(async () => str(await lire(`annonces/${idInfo}`), 'publication') === 'brouillon'), '« Retirer » remet l annonce en brouillon');
  verifier(await attendre(async () => (await statutLecture(`annonces/${idInfo}`, jC)) === 403), 'et le client ne la lit plus (403)');
  await pause(800);
  await equipe.click(`[data-annonce-action="publier"][data-id="${idInfo}"]`);
  await equipe.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await equipe.click('.voile [data-oui]');
  await attendre(async () => str(await lire(`annonces/${idInfo}`), 'publication') === 'publiee');
  await pause(6000);
  verifier((await notifAnnonce(uidCamille)).length === nAvant, 'republiée, elle ne prévient pas une seconde fois');

  console.log('\n== Léa, dans le Hub : son projet récent passe à 480');
  const ctxLea = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctxLea.addInitScript(() => { try { localStorage.setItem('suivi:hub-theme', 'light'); } catch (e) { /* rien */ } });
  const lea = await ctxLea.newPage();
  lea.on('pageerror', (e) => erreurs.push(`hub léa: ${e.message.slice(0, 160)}`));
  page = lea;
  await connecter(lea, LEA);
  await aller(lea, '#/annonces');
  await lea.waitForSelector('[data-annonce]', { timeout: 20000 }).catch(() => {});
  const vuesLea = await lea.$$eval('.annonces-liste [data-annonce]', (l) => l.map((a) => a.dataset.annonce));
  verifier(vuesLea.length === 1 && vuesLea[0] === idTarif, 'Léa ne voit que le tarif, pas l annonce d Atelier Nord', vuesLea.join(', '));
  const verdictLea = await lea.textContent(`[data-annonce="${idTarif}"] [data-tarif-projet="boutique"]`).catch(() => '');
  verifier(/projet court/.test(verdictLea) && /480\s?€/.test(verdictLea) && /début prévu le/.test(verdictLea), 'l encart de Léa : Boutique, récent, est un projet court à 480 € HT par jour', verdictLea.trim());
  await ctxLea.close();
  page = await ctxClient.pages()[0];

  console.log('\n== Les congés : un bandeau pendant la période, et pas en dehors');
  const idConge = 'conge-essai';
  await poser(`annonces/${idConge}`, annonceRest({ type: 'indisponibilite', titre: 'Fermeture de fin d année', indisponibilite: { du: iso(dansJours(-1)), au: iso(dansJours(5)), message: 'réponses sous 48 h' } }));
  await aller(page, '#/');
  const bandeau = await attendre(async () => { const el = await page.$('[data-bandeau-indispo]'); return el ? el.textContent() : null; });
  verifier(Boolean(bandeau) && /Capmedia est indisponible du .* au .* : réponses sous 48 h/.test(bandeau), 'pendant la période, l accueil porte le bandeau « Capmedia est indisponible du … au … : réponses sous 48 h »', (bandeau || '').trim().slice(0, 140));
  const bulle = await attendre(async () => page.evaluate(() => { const b = document.querySelector('#bulle-conge'); return b && !b.hidden ? b.textContent : null; }));
  verifier(Boolean(bulle) && /indisponible/.test(bulle), 'et la bulle de discussion le dit au-dessus du fil', (bulle || '').slice(0, 100));
  await page.screenshot({ path: join(CAPTURES, 'annonces-accueil-conge-clair.png') });
  await poser(`annonces/${idConge}`, { indisponibilite: M({ du: S(iso(dansJours(5))), au: S(iso(dansJours(9))), message: S('réponses sous 48 h') }) }, ['indisponibilite']);
  await pause(1500); await aller(page, '#/activite'); await aller(page, '#/');
  verifier(await attendre(async () => Boolean(await page.$('[data-bandeau-indispo]'))), 'dans les sept jours qui précèdent, le bandeau est déjà là');
  await poser(`annonces/${idConge}`, { indisponibilite: M({ du: S(iso(dansJours(20))), au: S(iso(dansJours(30))), message: S('réponses sous 48 h') }) }, ['indisponibilite']);
  await pause(1500); await aller(page, '#/activite'); await aller(page, '#/');
  await pause(1500);
  verifier(!(await page.$('[data-bandeau-indispo]')), 'trois semaines avant, pas de bandeau');
  verifier(await page.evaluate(() => { const b = document.querySelector('#bulle-conge'); return !b || b.hidden; }), 'ni dans la bulle');
  await poser(`annonces/${idConge}`, { indisponibilite: M({ du: S(iso(dansJours(-20))), au: S(iso(dansJours(-10))), message: S('réponses sous 48 h') }) }, ['indisponibilite']);
  await pause(1500); await aller(page, '#/activite'); await aller(page, '#/');
  await pause(1500);
  verifier(!(await page.$('[data-bandeau-indispo]')), 'une période passée ne s affiche plus');
  sansDefaut(await page.textContent('.page'), 'l accueil');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();

  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: join(CAPTURES, 'qa-annonces-echec.png') }); } catch (err) { /* rien */ } }
  process.exit(2);
});
