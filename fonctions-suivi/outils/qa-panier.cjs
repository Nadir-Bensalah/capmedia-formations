/* ==========================================================================
   CAPMEDIA CLIENT HUB · le calculateur des axes et la demande de devis

   Ce que prouve cette suite :
   - le panier : sur la page des axes, la responsable coche un axe, « Ajouter
     au calculateur », le compteur du bouton monte ; le panier est gardé en
     base (projets/{p}/paniers/{uid}) et se retrouve dans un second
     navigateur ;
   - la modale : chaque ligne, le total des jours, le prix d'une journée
     selon la grille (projet long, puis court), HT, TVA et TTC exacts ; les
     deux périodes côte à côte quand la grille annonce la suivante, une seule
     sinon ; la mention ; « Retirer » ;
   - « Demander un devis » : une fiche « demande » dans les pièces, qui fige
     la photo du panier ; les axes passent « À prévoir » ; le panier se vide ;
     l'équipe est prévenue (boîte + activité) ; le client la lit dans Devis
     et factures en « Devis demandé », et peut l'annuler ;
   - le Cockpit : la demande se lit dans Finances, « Joindre le devis » la
     fait passer en devis à décider, le client est prévenu ;
   - l'acceptation : chaque ligne devient une étape du Planning rattachée
     au devis, avec sa part du montant ; les axes passent « Au programme » ;
   - un collaborateur : ni calculateur, ni prix ;
   - les règles, avec le vrai jeton de chacun (REST) : le client ne retouche
     ni la photo ni l'état (403), ni le panier d'un autre ;
   - aucune erreur de page.

   Banc : émulateurs (fonctions comprises), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const CAPTURES = process.env.CAPTURES_PANIER || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/panier';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const supprimer = async (name) => fetch(`${BANC.firestore}/v1/${name}`, { method: 'DELETE', headers: prop });
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await supprimer(d.name); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const nb = (v) => Number((v || {}).integerValue || (v || {}).doubleValue || 0);
const carte = (v) => ((v || {}).mapValue || {}).fields || {};
const S = (v) => ({ stringValue: String(v) }); const I = (v) => ({ integerValue: String(v) }); const D = (v) => ({ doubleValue: v });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } }); const T = (d) => ({ timestampValue: d.toISOString() });
const NUL = { nullValue: null };
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const ouvrirCompte = async (email) => {
  if (await uidDe(email)) return uidDe(email);
  const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=cle-du-banc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `Banc-${Date.now()}-x`, returnSecureToken: true }) });
  return ((await r.json()) || {}).localId || '';
};
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: { Authorization: `Bearer ${jeton}` } })).status;
const statutCommit = async (jeton, writes) => (await fetch(`${RACINE}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=200')).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (p, email) => {
  await vider('connexions'); await vider('connexionsIp');
  await p.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await p.fill('#email', email); await p.click('#envoyer');
  await p.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await p.fill('#code', await dernierCode(email));
  await p.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
const aller = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await pause(1500); };
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
const chiffres = (t) => String(t || '').replace(/[\s  ]/g, '');
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const AXES = 'projets/atelier/axes';
const IDS = ['p-widgets', 'p-siri', 'p-web', 'p-sans'];
const axe = (id, o) => poser(`${AXES}/${id}`, {
  plateforme: S(o.plateforme || 'ios'), titre: S(o.titre), description: S(o.description || 'Une piste pour vos utilisateurs.'), detail: S(''), apport: S('engagement'), ampleur: S('moyen'),
  ...(o.jours !== undefined ? { jours: Number.isInteger(o.jours) ? I(o.jours) : D(o.jours) } : {}),
  etat: S(o.etat || 'propose'), publication: S(o.publication || 'publiee'), publieLe: NUL, ordre: I(o.ordre || 1), devis: S(''), reponse: NUL, cree: T(new Date()), maj: T(new Date()),
});
const grille = (periodes) => poser('reglages/tarifs', { seuilMois: I(3), tva: I(20), devise: S('EUR'), periodes: L(periodes.map((p) => M({ debut: S(p[0]), long: I(p[1]), court: I(p[2]) }))), maj: T(new Date()) });
const DEUX_PERIODES = [['2026-01-01', 380, 420], ['2027-01-01', 420, 480]];
const demandes = async () => (await docs('documents?pageSize=300')).filter((d) => str(d, 'origine') === 'panier');
const notifs = async (uid, titre) => (await docs(`boites/${uid}/notifications?pageSize=300`)).filter((n) => str(n, 'titre') === titre);
const choix = async (id) => str({ fields: carte(champ(await lire(`${AXES}/${id}`), 'reponse')) }, 'choix');

/* Ce que dit la modale du calculateur, en chiffres nus. */
const lireModale = async (p) => p.evaluate(() => {
  const voile = document.querySelector('.voile--panier');
  if (!voile) return null;
  const periodes = Array.from(voile.querySelectorAll('[data-panier-periode]')).map((b) => ({
    debut: b.dataset.panierPeriode, titre: b.querySelector('.panier-periode-titre').textContent, tjm: b.querySelector('.panier-periode-tjm').textContent,
    ht: b.querySelector('[data-panier-ht]').textContent, tva: b.querySelector('[data-panier-tva]').textContent, ttc: b.querySelector('[data-panier-ttc]').textContent,
  }));
  return { lignes: Array.from(voile.querySelectorAll('[data-panier-ligne]')).map((l) => l.dataset.panierLigne), jours: (voile.querySelector('[data-panier-jours]') || {}).textContent || '', periodes, texte: voile.textContent };
});
const ouvrirModale = async (p) => {
  await p.click('[data-panier-ouvrir]');
  await p.waitForSelector('.voile--panier .modale-corps', { timeout: 10000 }); await pause(400);
  return lireModale(p);
};
const fermerModale = async (p) => { await p.keyboard.press('Escape'); await pause(300); if (await p.$('.voile--panier')) { await p.click('.voile--panier [data-fermer]').catch(() => {}); await pause(400); } };
const compteur = async (p) => Number((await p.textContent('[data-panier-compte]').catch(() => '')) || -1);
const ajouter = async (p, id) => {
  if (!(await p.isChecked(`[data-axe-case="${id}"]`))) await p.check(`[data-axe-case="${id}"]`);
  await pause(250);
  await p.click(`[data-axe-panier="ajouter"][data-id="${id}"]`);
};

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.panier@exemple.test';
  mkdirSync(CAPTURES, { recursive: true });
  await vider(AXES);
  for (const d of await demandes()) await supprimer(d.name);
  const uidCollab = await ouvrirCompte(COLLAB);
  const uidCamille = await uidDe(CAMILLE);
  const uidAdmin = await uidDe(ADMIN);
  await vider('projets/atelier/paniers');
  const atelier = await lire('projets/atelier');
  const membres = ((champ(atelier, 'membres').arrayValue || {}).values || []).map((v) => v.stringValue);
  const rolesAvant = carte(champ(atelier, 'roles'));
  const debutAvant = champ(atelier, 'debut');
  const roles = async (r) => poser('projets/atelier', { membres: L([...new Set([...membres, uidCollab])].map(S)), roles: M(Object.fromEntries(Object.entries(r).map(([u, v]) => [u, S(v)]))) }, ['membres', 'roles']);
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });
  /* Un projet long : commencé il y a plus de trois mois. */
  await poser('projets/atelier', { debut: T(new Date('2025-01-15T09:00:00Z')) }, ['debut']);
  await grille(DEUX_PERIODES);
  await axe('p-widgets', { titre: 'Widgets sur l écran d accueil', jours: 3, ordre: 1 });
  await axe('p-siri', { titre: 'Raccourcis Siri', jours: 5, ordre: 2 });
  await axe('p-web', { titre: 'Notifications web', plateforme: 'web', jours: 2.5, ordre: 1 });
  await axe('p-sans', { titre: 'Mode hors connexion', plateforme: 'web', ordre: 2 });
  await axe('p-brouillon', { titre: 'Une idée en brouillon', publication: 'brouillon', jours: 4, ordre: 3 });
  const jC = await jetonPour(CAMILLE); const jCo = await jetonPour(COLLAB); const jL = await jetonPour(LEA);

  const nav = await chromium.launch();
  const erreurs = [];
  const contexte = async (theme = 'light') => {
    const c = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
    await c.addInitScript((t) => { try { localStorage.setItem('suivi:hub-theme', t); localStorage.setItem('suivi:cockpit-theme', t); } catch (e) { /* rien */ } }, theme);
    const p = await c.newPage();
    p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
    return p;
  };

  console.log('\n== Le panier : ajouter, compter, retrouver');
  page = await contexte();
  await connecter(page, CAMILLE);
  await aller(page, '#/projets/atelier/evolutions');
  await page.waitForSelector('[data-panier-ouvrir]', { timeout: 20000 }).catch(() => {});
  verifier(await compteur(page) === 0, 'la responsable a le calculateur en haut de la page, vide');
  verifier(!(await page.$('[data-axe-panier][data-id="p-brouillon"]')), 'un brouillon n a pas de bouton');
  await ajouter(page, 'p-widgets');
  verifier(await attendre(async () => await compteur(page) === 1), 'cocher puis « Ajouter au calculateur » : le compteur passe à 1');
  const enBase = async () => ((champ(await lire(`projets/atelier/paniers/${uidCamille}`), 'axes').arrayValue || {}).values || []).map((v) => v.stringValue);
  verifier(await attendre(async () => (await enBase()).join() === 'p-widgets'), 'le panier est gardé en base, à son nom');
  for (const id of ['p-siri', 'p-web', 'p-sans']) { await ajouter(page, id); await attendre(async () => (await enBase()).includes(id)); await pause(400); }
  verifier(await attendre(async () => await compteur(page) === 4), 'quatre axes au calculateur', String(await compteur(page)));
  verifier(Boolean(await page.$('[data-axe-panier="retirer"][data-id="p-siri"]')), 'une ligne du panier propose « Retirer du calculateur »');
  verifier(await page.isChecked('[data-axe-case="p-siri"]'), 'et reste cochée');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(CAPTURES, 'panier-page.png'), fullPage: false });

  const second = await contexte();
  await connecter(second, CAMILLE);
  await aller(second, '#/projets/atelier/evolutions');
  await second.waitForSelector('[data-panier-ouvrir]', { timeout: 20000 }).catch(() => {});
  verifier(await attendre(async () => await compteur(second) === 4), 'un second navigateur retrouve le panier : quatre axes');
  verifier(Boolean(await second.$('[data-axe-panier="retirer"][data-id="p-web"]')), 'avec les mêmes lignes');
  await second.context().close();

  console.log('\n== La modale : projet long, deux périodes');
  let m = await ouvrirModale(page);
  verifier(m && m.lignes.join() === IDS.join(), 'une ligne par axe, dans l ordre du panier', m && m.lignes.join());
  verifier(m && /10,5 jours/.test(m.jours), 'le total des jours : 3 + 5 + 2,5 = 10,5 (la ligne sans estimation ne compte pas)', m && m.jours);
  verifier(m && /À estimer/.test(m.texte) && /pas encore de temps estimé/.test(m.texte), 'la ligne sans temps estimé le dit');
  verifier(m && m.periodes.length === 2, 'deux estimations côte à côte : la grille annonce le 1er janvier 2027');
  const [p1, p2] = (m && m.periodes) || [{}, {}];
  verifier(/Si lancé avant le 31 décembre 2026/.test(p1.titre || '') && /À partir du 1er janvier 2027/.test(p2.titre || ''), 'titrées « Si lancé avant le 31 décembre 2026 » et « À partir du 1er janvier 2027 »', `${p1.titre} | ${p2.titre}`);
  verifier(chiffres(p1.tjm) === '380€HTparjour' && chiffres(p2.tjm) === '420€HTparjour', 'projet long : 380 € HT par jour, puis 420', `${p1.tjm} | ${p2.tjm}`);
  verifier(chiffres(p1.ht) === '3990€HT' && chiffres(p1.tva) === '798€' && chiffres(p1.ttc) === '4788€TTC', '10,5 × 380 = 3 990 € HT, TVA 798 €, 4 788 € TTC', `${p1.ht} ${p1.tva} ${p1.ttc}`);
  verifier(chiffres(p2.ht) === '4410€HT' && chiffres(p2.tva) === '882€' && chiffres(p2.ttc) === '5292€TTC', '10,5 × 420 = 4 410 € HT, TVA 882 €, 5 292 € TTC', `${p2.ht} ${p2.tva} ${p2.ttc}`);
  verifier(m && /Estimation indicative : le devis final peut varier\./.test(m.texte), 'la mention « Estimation indicative : le devis final peut varier. »');
  verifier(m && !/undefined|null|NaN/.test(m.texte) && !m.texte.includes('—'), 'ni « undefined », ni « null », ni tiret cadratin');
  await page.screenshot({ path: join(CAPTURES, 'panier-modale.png') });
  await page.click('.voile--panier [data-panier-retirer="p-sans"]');
  verifier(await attendre(async () => !(await enBase()).includes('p-sans') && !(await lireModale(page)).lignes.includes('p-sans')), '« Retirer » ôte la ligne de la modale et de la base');
  m = await lireModale(page);
  verifier(m && /10,5 jours/.test(m.jours) && chiffres(m.periodes[0].ht) === '3990€HT', 'la somme ne bouge pas (la ligne n était pas chiffrée)');
  await fermerModale(page);
  verifier(await attendre(async () => await compteur(page) === 3), 'le compteur suit : 3');

  console.log('\n== Projet court, puis une seule période');
  await poser('projets/atelier', { debut: T(new Date(Date.now() - 20 * 86400000)) }, ['debut']);
  await pause(1500);
  m = await ouvrirModale(page);
  verifier(m && chiffres(m.periodes[0].tjm) === '420€HTparjour' && chiffres(m.periodes[0].ht) === '4410€HT' && chiffres(m.periodes[0].ttc) === '5292€TTC', 'projet court : 420 € HT par jour, 4 410 € HT, 5 292 € TTC', m && `${m.periodes[0].tjm} ${m.periodes[0].ht} ${m.periodes[0].ttc}`);
  verifier(m && m.periodes[1] && chiffres(m.periodes[1].ht) === '5040€HT' && chiffres(m.periodes[1].tva) === '1008€' && chiffres(m.periodes[1].ttc) === '6048€TTC', 'et au 1er janvier : 480 € HT par jour, 5 040 € HT, 6 048 € TTC', m && m.periodes[1] && `${m.periodes[1].ht} ${m.periodes[1].ttc}`);
  verifier(m && /Projet court/.test(m.texte), 'la modale dit « Projet court »');
  await fermerModale(page);
  await poser('projets/atelier', { debut: T(new Date('2025-01-15T09:00:00Z')) }, ['debut']);
  await grille([['2026-01-01', 380, 420]]);
  await pause(1500);
  m = await ouvrirModale(page);
  verifier(m && m.periodes.length === 1 && /Estimation/.test(m.periodes[0].titre) && !/1er janvier/.test(m.texte), 'sans période suivante annoncée : une seule estimation', m && m.periodes.map((x) => x.titre).join(' | '));
  await fermerModale(page);
  await grille(DEUX_PERIODES);
  await pause(1500);

  console.log('\n== Les règles, avec le vrai jeton de chacun');
  verifier(await statutLecture(`projets/atelier/paniers/${uidCamille}`, jCo) === 403, 'le collaborateur ne lit pas le panier de la responsable (403)');
  const panierRest = (uid) => ({ update: { name: nomDoc(`projets/atelier/paniers/${uid}`), fields: { axes: L([S('p-web')]) } }, updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }] });
  verifier(await statutCommit(jCo, [panierRest(uidCollab)]) === 403, 'ni n a de panier à lui (403)');
  verifier(await statutCommit(jL, [panierRest(await uidDe(LEA))]) === 403, 'une cliente d un autre projet non plus (403)');
  verifier(await statutLecture(`projets/atelier/paniers/${uidCamille}`, jC) === 200, 'la responsable lit le sien (200)');

  console.log('\n== « Demander un devis »');
  m = await ouvrirModale(page);
  const notifAvant = (await notifs(uidAdmin, 'Demande de devis')).length;
  await page.click('.voile--panier [data-panier-demander]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  const dem = await attendre(async () => (await demandes()).find((d) => str(d, 'statut') === 'demande'));
  verifier(Boolean(dem), 'une fiche « demande » naît dans les pièces du projet');
  const idDem = dem ? dem.name.split('/').pop() : '';
  const photo = dem ? carte(champ(dem, 'photo')) : {};
  const lignes = ((photo.lignes || {}).arrayValue || {}).values || [];
  verifier(lignes.length === 3 && nb(photo.jours) === 10.5 && (photo.long || {}).booleanValue === true, 'elle fige la photo : trois lignes, 10,5 jours, projet long', `${lignes.length} lignes, ${nb(photo.jours)} jours`);
  verifier(nb(carte(photo.periode).ht) === 3990 && nb(carte(photo.periode).ttc) === 4788 && nb(carte(photo.suivante).ht) === 4410 && nb(carte(photo.suivante).tjm) === 420, 'avec les tarifs et montants des deux périodes (3 990 et 4 410 € HT)');
  verifier(dem && champ(dem, 'montant').nullValue === null && str(dem, 'numero') === '' && carte(champ(dem, 'par')).uid.stringValue === uidCamille && Boolean(champ(dem, 'date').timestampValue), 'sans numéro ni montant, à son nom, datée par le serveur');
  verifier(await attendre(async () => (await choix('p-widgets')) === 'a-prevoir' && (await choix('p-siri')) === 'a-prevoir' && (await choix('p-web')) === 'a-prevoir'), 'les trois axes passent « À prévoir »');
  verifier(str({ fields: carte(champ(await lire(`${AXES}/p-widgets`), 'reponse')) }, 'devis') === idDem, 'en nommant la demande');
  verifier(await attendre(async () => !(await lire(`projets/atelier/paniers/${uidCamille}`))), 'le panier se vide');
  verifier(await attendre(async () => await compteur(page) === 0), 'et le compteur revient à 0');
  verifier(await attendre(async () => (await notifs(uidAdmin, 'Demande de devis')).length > notifAvant, 30000), 'l équipe a « Demande de devis » dans sa boîte');
  const n1 = (await notifs(uidAdmin, 'Demande de devis')).slice(-1)[0];
  verifier(n1 && /3 axes/.test(str(n1, 'texte')) && /3[\s  ]?990/.test(str(n1, 'texte')) && str(n1, 'lien') === `#/finances/${idDem}`, 'nombre d axes, estimation, lien vers la pièce', n1 && str(n1, 'texte'));
  verifier(await attendre(async () => (await docs('activite?pageSize=500')).some((a) => /a demandé un devis pour 3 axes/.test(str(a, 'texte')))), 'et la demande reste dans l activité du projet');
  verifier((await notifs(uidAdmin, 'Le client veut prévoir un axe')).length === 0, 'sans une notification de plus par axe');

  console.log('\n== Le client : la demande dans Devis et factures, puis l annulation');
  await aller(page, '#/finances');
  await page.waitForSelector(`[data-action="ouvrir"][data-id="${idDem}"]`, { timeout: 20000 }).catch(() => {});
  const ligneDem = await page.$eval(`[data-action="ouvrir"][data-id="${idDem}"]`, (el) => (el.closest('.ligne') || el).textContent).catch(() => '');
  verifier(/Devis demandé/.test(ligneDem) && /≈\s?3[\s  ]?990[\s  ]?€ HT/.test(ligneDem), 'elle se lit « Devis demandé », avec l estimation HT', ligneDem.replace(/\s+/g, ' ').trim().slice(0, 200));
  verifier((await page.$$(`[data-action="ouvrir"][data-id="${idDem}"]`)).length === 1, 'une seule fois sur la page');
  await page.screenshot({ path: join(CAPTURES, 'devis-demande-client.png'), fullPage: true });
  await page.click(`[data-action="ouvrir"][data-id="${idDem}"]`);
  await page.waitForSelector('[data-annuler-demande]', { timeout: 10000 }).catch(() => {});
  const ficheDem = await page.textContent('.voile').catch(() => '');
  verifier(/Nous préparons votre devis/.test(ficheDem) && /Raccourcis Siri/.test(ficheDem) && /Estimation indicative/.test(ficheDem), 'la fiche montre la photo du panier');
  verifier(Boolean(await page.$('[data-annuler-demande]')), 'et propose « Annuler la demande »');
  await page.screenshot({ path: join(CAPTURES, 'devis-demande-fiche.png') });

  console.log('\n== Le client ne retouche ni la photo ni l état (REST)');
  const majDem = (fields, masque) => ({ update: { name: nomDoc(`documents/${idDem}`), fields }, updateMask: { fieldPaths: masque } });
  verifier(await statutCommit(jC, [majDem({ photo: M({ jours: I(1) }) }, ['photo'])]) === 403, 'la photo ne se réécrit pas (403)');
  verifier(await statutCommit(jC, [majDem({ statut: S('envoye') }, ['statut'])]) === 403, 'l état ne passe pas « envoyé » (403)');
  verifier(await statutCommit(jC, [majDem({ montant: I(1) }, ['montant'])]) === 403, 'aucun montant ne s y pose (403)');
  verifier(await statutCommit(jC, [majDem({ statut: S('accepte'), reponse: M({ par: S(uidCamille), nom: S('C'), commentaire: S('') }) }, ['statut', 'reponse'])]) === 403, 'une demande ne s accepte pas (403)');

  const notifAnnule = (await notifs(uidAdmin, 'Demande de devis annulée')).length;
  await page.click('[data-annuler-demande]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  verifier(await attendre(async () => str(await lire(`documents/${idDem}`), 'statut') === 'annule' && Boolean(champ(await lire(`documents/${idDem}`), 'annuleLe').timestampValue)), 'l annulation passe la fiche « annulée », datée par le serveur');
  verifier(await attendre(async () => !(await page.$(`[data-action="ouvrir"][data-id="${idDem}"]`))), 'et elle quitte sa liste');
  verifier(await attendre(async () => (await notifs(uidAdmin, 'Demande de devis annulée')).length > notifAnnule, 30000), 'l équipe l apprend dans sa boîte');

  console.log('\n== Une seconde demande, chiffrée par l équipe');
  await aller(page, '#/projets/atelier/evolutions');
  await page.waitForSelector('[data-panier-ouvrir]', { timeout: 20000 }).catch(() => {});
  await ajouter(page, 'p-widgets'); await attendre(async () => (await enBase()).includes('p-widgets')); await pause(500);
  await ajouter(page, 'p-siri'); await attendre(async () => (await enBase()).length === 2); await pause(500);
  await ouvrirModale(page);
  await page.click('.voile--panier [data-panier-demander]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  const dem2 = await attendre(async () => (await demandes()).find((d) => str(d, 'statut') === 'demande'));
  const idDem2 = dem2 ? dem2.name.split('/').pop() : '';
  verifier(Boolean(dem2) && nb(carte(carte(champ(dem2, 'photo')).periode).ht) === 3040, 'la seconde demande : 8 jours, 3 040 € HT');

  const cockpit = await contexte('dark');
  await connecter(cockpit, ADMIN);
  await aller(cockpit, '#/finances');
  await cockpit.waitForSelector('[data-onglet="devis"]', { timeout: 20000 }).catch(() => {});
  await cockpit.click('[data-onglet="devis"]'); await pause(600);
  const ligneEq = await cockpit.$eval(`[data-action="ouvrir"][data-id="${idDem2}"]`, (el) => (el.closest('.ligne') || el).textContent).catch(() => '');
  verifier(/À chiffrer/.test(ligneEq) && /Camille/.test(ligneEq) && /3[\s  ]?040/.test(ligneEq), 'le Cockpit la lit dans Finances : « À chiffrer », qui, combien', ligneEq.replace(/\s+/g, ' ').trim().slice(0, 200));
  await cockpit.click(`[data-action="ouvrir"][data-id="${idDem2}"]`);
  await cockpit.waitForSelector('[data-joindre-devis]', { timeout: 10000 }).catch(() => {});
  const ficheEq = await cockpit.textContent('.voile').catch(() => '');
  verifier(/Le calculateur du client/.test(ficheEq) && /Widgets/.test(ficheEq) && /3[\s  ]?040/.test(ficheEq), 'la fiche montre la photo du panier à l équipe');
  await cockpit.screenshot({ path: join(CAPTURES, 'reception-cockpit.png') });
  await cockpit.click('[data-joindre-devis]');
  await cockpit.waitForSelector('#j-numero', { timeout: 10000 });
  verifier((await cockpit.inputValue('#j-montant')) === '3040', 'le montant est prérempli avec l estimation', await cockpit.inputValue('#j-montant'));
  await cockpit.fill('#j-numero', 'D-2026-099');
  await cockpit.fill('#j-montant', '3000');
  const dans30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await cockpit.fill('#j-echeance', dans30);
  const notifClient = (await notifs(uidCamille, 'Nouveau devis')).length;
  await cockpit.click('button[form="f-joindre"]');
  verifier(await attendre(async () => { const d = await lire(`documents/${idDem2}`); return str(d, 'statut') === 'envoye' && str(d, 'numero') === 'D-2026-099' && nb(champ(d, 'montant')) === 3000 && nb(champ(d, 'ttc')) === 3600; }, 30000), '« Joindre le devis » : la demande devient le devis D-2026-099, 3 000 € HT, 3 600 € TTC');
  verifier(nb(carte(carte(champ(await lire(`documents/${idDem2}`), 'photo')).periode).ht) === 3040, 'la photo reste celle du client');
  verifier(await attendre(async () => (await notifs(uidCamille, 'Nouveau devis')).length > notifClient, 30000), 'le client est prévenu : « Nouveau devis »');

  console.log('\n== L acceptation : les étapes du Planning, les axes au programme');
  await aller(page, '#/finances');
  await page.waitForSelector(`[data-action="ouvrir"][data-id="${idDem2}"]`, { timeout: 20000 }).catch(() => {});
  const ligneRecu = await page.$eval(`[data-action="ouvrir"][data-id="${idDem2}"]`, (el) => (el.closest('.ligne') || el).textContent).catch(() => '');
  verifier(/À votre décision/.test(ligneRecu) && /D-2026-099/.test(ligneRecu), 'chez le client, le devis reçu attend sa décision', ligneRecu.replace(/\s+/g, ' ').trim().slice(0, 160));
  verifier((await page.$$(`[data-action="ouvrir"][data-id="${idDem2}"]`)).length === 1, 'une seule fois sur la page');
  await page.click(`[data-action="ouvrir"][data-id="${idDem2}"]`);
  await page.waitForSelector('[data-accepter]', { timeout: 10000 });
  await page.click('[data-accepter]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  verifier(await attendre(async () => str(await lire(`documents/${idDem2}`), 'statut') === 'accepte'), 'le client accepte le devis');
  const etapes = await attendre(async () => { const j = (await docs('projets/atelier/jalons?pageSize=300')).filter((x) => str(x, 'devis') === idDem2); return j.length === 2 ? j : null; }, 30000);
  verifier(Boolean(etapes), 'chaque ligne devient une étape du Planning, rattachée au devis (2)');
  if (etapes) {
    verifier(etapes.map((x) => str(x, 'titre')).sort().join('|') === ['Raccourcis Siri', 'Widgets sur l écran d accueil'].sort().join('|') && etapes.every((x) => str(x, 'statut') === 'a-venir'), 'au titre de l axe, « à venir »');
    const parts = await Promise.all(etapes.map(async (x) => nb(champ(await lire(`projets/atelier/montants/jalon-${x.name.split('/').pop()}`), 'montant'))));
    verifier(parts.reduce((a, b) => a + b, 0) === 3000 && parts.includes(1125) && parts.includes(1875), 'avec leur part du devis au prorata des jours (1 125 + 1 875 = 3 000 € HT)', parts.join(' + '));
  }
  verifier(await attendre(async () => str(await lire(`${AXES}/p-widgets`), 'etat') === 'prevu' && str(await lire(`${AXES}/p-siri`), 'etat') === 'prevu', 30000), 'les deux axes passent « Au programme »');
  verifier(str(await lire(`${AXES}/p-widgets`), 'devis') === idDem2 && str(await lire(`${AXES}/p-web`), 'etat') === 'propose', 'liés au devis ; l axe de la demande annulée reste proposé');
  await pause(1500);
  verifier((await docs('tickets?pageSize=300')).filter((t) => IDS.includes(str(t, 'axe'))).length === 0, 'aucun ticket n est ouvert');

  console.log('\n== Un collaborateur : ni calculateur, ni prix');
  await roles({ [uidCamille]: 'collaborateur', [uidCollab]: 'responsable' });
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  await aller(page, '#/projets/atelier/evolutions');
  await page.waitForSelector('[data-axes-plateforme]', { timeout: 20000 }).catch(() => {});
  await pause(1000);
  const texteCollab = await page.textContent('.page-axes').catch(() => '');
  verifier(!(await page.$('[data-panier-ouvrir]')) && !(await page.$('[data-axe-panier]')), 'ni bouton du calculateur, ni « Ajouter au calculateur »');
  verifier(!/€/.test(texteCollab) && !/undefined|null|NaN/.test(texteCollab), 'aucun prix, rien de cassé à l écran');
  verifier(await statutLecture(`projets/atelier/paniers/${uidCamille}`, jC) === 403, 'devenue collaboratrice, elle ne lit plus son panier (403)');

  await poser('projets/atelier', { roles: M(rolesAvant), membres: L(membres.map(S)) }, ['roles', 'membres']);
  if (debutAvant.timestampValue) await poser('projets/atelier', { debut: debutAvant }, ['debut']);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: join(CAPTURES, 'qa-panier-echec.png') }); } catch (err) { /* rien */ } }
  process.exit(2);
});
