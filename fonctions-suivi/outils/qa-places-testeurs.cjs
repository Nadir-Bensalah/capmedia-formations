require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour, appelAdmin } = require('./lib/session-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · les places de testeur (Nadir, 09/10/2026), dans la vraie
   page et sur le vrai serveur

   Six testeurs prévus, pas encore nommés : on répartit MAINTENANT sur des
   places « iPhone 1 … Android 3 », et chaque place devient une personne
   quand on l'a. Ce que la suite prouve :
   - créer des places n'écrit aucune fiche de testeur, aucun compte, aucune
     invitation, aucune lettre, aucune notification ;
   - « Répartir » les traite comme des testeurs (socle, plafond, une fois
     hors socle), toujours sans rien envoyer ;
   - « Lancer » reste fermé tant qu'une place est vide (« N places sans
     testeur ») ; et même lancée de force, une place ne reçoit rien ;
   - attribuer une place à une nouvelle personne : sa fiche naît, les
     passages de la place lui reviennent tels quels (même ordre, même
     clés), son compte de test est posé, son invitation part à ce
     moment-là ;
   - attribuer une place à un testeur déjà inscrit : transfert, sans
     nouvelle invitation ; un autre téléphone est refusé ;
   - toutes attribuées, la campagne se lance et chacun (les vrais, jamais
     une place) est prévenu.

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne (six testeurs, campagne « c-oct »).

     node fonctions-suivi/outils/qa-places-testeurs.cjs
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
const attendre = async (fn, n = 60, ms = 500) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && JSON.stringify((d.fields || {}).a || {}).includes(e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1500);
  if (!attendu || await page.evaluate((s) => !!document.querySelector(s), attendu)) return; } };

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* Le plan : un socle de deux scénarios, de la priorité haute et moyenne,
   des « humain » seuls en basse. Plafond 8. */
const TROIS = ['ios', 'android', 'web'];
const sc = (id, qui, priorite, plateformes = TROIS) => ({ id, titre: `Scénario ${id}`, etapes: 'Ouvrir l\'application.', attendu: 'Ça marche.', plateformes, type: 'normal', priorite, refs: [], qui, parcours: [] });
const vides = { fonctionnel: [], technique: [], ux: [], securite: [] };
const n3 = (i) => String(i).padStart(3, '0');
const SECTIONS = [
  { id: 'qpins', groupe: 'demarrage', ordre: 1, titre: 'Inscription du banc', resume: 'S inscrire.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: [sc('qpins-f-001', 'les-deux', 'haute'), sc('qpins-f-002', 'humain', 'haute', ['ios', 'android'])] } },
  { id: 'qpjou', groupe: 'fonctionnalites', ordre: 2, titre: 'Journal du banc', resume: 'Le journal.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: [
      ...Array.from({ length: 8 }, (_, i) => sc(`qpjou-f-${n3(i + 1)}`, 'les-deux', 'haute')),
      ...Array.from({ length: 6 }, (_, i) => sc(`qpjou-f-${n3(i + 9)}`, 'les-deux', 'moyenne')),
    ] } },
  { id: 'qpnot', groupe: 'fonctionnalites', ordre: 3, titre: 'Notes du banc', resume: 'Les notes.', plateformes: TROIS, aspects: { ...vides,
    fonctionnel: Array.from({ length: 6 }, (_, i) => sc(`qpnot-f-${n3(i + 1)}`, 'humain', 'basse')) } },
];
const SOCLE = ['qpins-f-001', 'qpins-f-002'];
const PLAFOND = 8;
const TOUS = SECTIONS.flatMap((s) => Object.values(s.aspects).flat());
const PLACES = ['place-ios-1', 'place-ios-2', 'place-ios-3', 'place-android-1', 'place-android-2', 'place-android-3'];
const LIBELLES = ['iPhone 1', 'iPhone 2', 'iPhone 3', 'Android 1', 'Android 2', 'Android 3'];

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const db = admin.firestore();
  const refC = db.doc(`projets/${P}/campagnes/${CID}`);
  const lireC = async () => (await refC.get()).data() || {};

  console.log('\n== Le terrain : le plan, une campagne sans testeur');
  for (const d of (await db.collection(`projets/${P}/planTests`).get()).docs) await d.ref.delete();
  for (const s of SECTIONS) await db.doc(`projets/${P}/planTests/${s.id}`).set(s);
  await db.doc(`projets/${P}/planTests/presentation`).set({ genre: 'presentation', intro: 'Le plan du banc.', plateformes: TROIS, aspects: [] });
  for (const d of (await db.collection(`projets/${P}/parcours`).get()).docs) await d.ref.delete();
  for (const d of (await db.collection(`projets/${P}/anomalies`).get()).docs) await d.ref.delete();
  for (const d of (await refC.collection('passages').get()).docs) await d.ref.delete();
  for (const d of (await refC.collection('lettresTesteurs').get()).docs) await d.ref.delete();
  await refC.update({
    statut: 'preparation', plan: true, scenarios: TOUS.map((x) => x.id),
    regle: 'socle', socle: SOCLE, plafond: PLAFOND, testeurs: [], affectation: {},
    places: admin.firestore.FieldValue.delete(), retraits: admin.firestore.FieldValue.delete(), repartition: admin.firestore.FieldValue.delete(),
  });
  const vivier = (await db.collection('testeurs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const parPrenom = Object.fromEntries(vivier.map((t) => [t.prenom, t]));
  verifier(['Karim', 'Marc', 'Hugo'].every((p) => parPrenom[p] && parPrenom[p].mobile === 'ios') && ['Sonia', 'Ines', 'Leila'].every((p) => parPrenom[p] && parPrenom[p].mobile === 'android'), 'six testeurs inscrits, trois iPhone, trois Android');

  /* Ce qui ne doit pas bouger tant qu'on ne fait que des places. */
  const releve = async () => ({
    testeurs: (await db.collection('testeurs').get()).size,
    comptes: (await admin.auth().listUsers(1000)).users.length,
    invitations: (await db.collection('invitations').get()).size,
    /* La connexion de l'équipe (code, alerte de connexion) ne compte pas : ce sont ses lettres à elle. */
    envois: (await db.collection('envois').get()).docs.filter((d) => !['code', 'connexion-equipe'].includes(d.data().modele)).length,
    notifications: (await db.collectionGroup('notifications').get()).size,
    activitesClient: (await db.collection('activite').get()).docs.filter((d) => d.data().visibilite !== 'interne').length,
    lettresTesteurs: (await refC.collection('lettresTesteurs').get()).size,
    boitesPlaces: (await Promise.all(PLACES.map((id) => db.collection(`boites/${id}/notifications`).get()))).reduce((n, q) => n + q.size, 0),
  });
  await pause(3000);
  const avant = await releve();
  const envoisDuDepart = new Set((await db.collection('envois').get()).docs.map((d) => d.id));
  const nouveauxEnvois = async () => (await db.collection('envois').get()).docs.filter((d) => !envoisDuDepart.has(d.id)).map((d) => `${d.data().modele}:${JSON.stringify(d.data().a || []).slice(0, 60)}`).join(' | ');

  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const err = []; page.on('pageerror', (e) => err.push(`PAGE: ${e.message.slice(0, 160)}`));
  await connecter(page, 'agent.essai@exemple.test');
  await aller(page, `/tests?projet=${P}`, `[data-action="ouvrir-campagne"][data-id="${CID}"]`);
  const ouvrir = async (attendu = '[data-places]') => {
    await page.keyboard.press('Escape').catch(() => {}); await pause(400);
    await page.evaluate((id) => { const b = document.querySelector(`[data-action="ouvrir-campagne"][data-id="${id}"]`); if (b) b.click(); }, CID);
    await page.waitForSelector(attendu, { timeout: 15000 }).catch(() => null);
    await pause(500);
  };

  console.log('\n== Créer six places : aucune personne, aucun envoi');
  await ouvrir();
  verifier(await page.$('[data-places]') !== null, 'la campagne en préparation a son bloc « Places de testeur »');
  await page.fill('[data-places-nombre="ios"]', '3');
  await page.fill('[data-places-nombre="android"]', '3');
  await page.click('[data-creer-places]');
  const c1 = await attendre(async () => { const x = await lireC(); return Object.keys(x.places || {}).length === 6 ? x : null; }, 40, 500) || {};
  verifier(JSON.stringify(Object.keys(c1.places || {}).sort()) === JSON.stringify(PLACES.slice().sort()), 'six places, iPhone 1 à 3, Android 1 à 3', Object.keys(c1.places || {}).join(','));
  verifier(PLACES.every((id, i) => (c1.places[id] || {}).libelle === LIBELLES[i] && c1.places[id].mobile === id.split('-')[1] && c1.places[id].web === true), 'chacune son téléphone et le web');
  verifier(PLACES.every((id) => !('email' in (c1.places[id] || {})) && !('testeur' in (c1.places[id] || {}))), 'ni adresse, ni personne');
  verifier(!(c1.testeurs || []).length, 'la campagne n a toujours aucun testeur');
  await pause(4000);
  const apresPlaces = await releve();
  verifier(JSON.stringify(apresPlaces) === JSON.stringify(avant), 'aucune fiche, aucun compte, aucune invitation, aucune lettre, aucune notification', `${JSON.stringify(avant)} -> ${JSON.stringify(apresPlaces)} ${await nouveauxEnvois()}`);

  console.log('\n== Répartir sur les places, comme sur des testeurs');
  await ouvrir('[data-repartir]');
  const liste = await page.evaluate(() => [...document.querySelectorAll('[data-testeur]')].map((c) => ({ id: c.dataset.testeur, coche: c.checked, texte: c.parentElement.innerText.trim() })));
  verifier(liste.filter((x) => x.id.startsWith('place-')).length === 6 && liste.filter((x) => x.id.startsWith('place-')).every((x) => x.coche), 'les six places sont dans la liste, cochées d office', JSON.stringify(liste).slice(0, 200));
  verifier(liste.filter((x) => !x.id.startsWith('place-')).every((x) => !x.coche), 'les testeurs inscrits ne sont pas cochés');
  verifier(liste.some((x) => /iPhone 1 · place sans testeur/.test(x.texte)), 'une place se lit « iPhone 1 · place sans testeur »');
  await page.click('[data-repartir]');
  await page.waitForSelector('[data-apercu-charges]', { timeout: 20000 }).catch(() => null);
  const a = await page.evaluate(() => ({
    lignes: [...document.querySelectorAll('[data-charge]')].map((tr) => [tr.dataset.charge, ...[...tr.querySelectorAll('td')].map((td) => td.innerText.trim())]),
    bloque: !!(document.querySelector('[data-enregistrer-repartition]') || {}).disabled,
  }));
  verifier(a.lignes.length === 6 && a.lignes.every((l) => l[0].startsWith('place-')), 'l aperçu montre les six places', JSON.stringify(a.lignes.map((l) => l[0])));
  verifier(a.lignes.map((l) => l[1]).join(',') === LIBELLES.join(','), 'sous leur nom : iPhone 1 … Android 3', a.lignes.map((l) => l[1]).join(','));
  verifier(a.lignes.every((l) => l[3] === '3' && Number(l[6]) <= PLAFOND && Number(l[6]) > 3), `chacune : socle 3, total au plus ${PLAFOND}`, JSON.stringify(a.lignes));
  verifier(!a.bloque, 'l enregistrement est possible');
  await page.click('[data-enregistrer-repartition]');
  const c2 = await attendre(async () => { const x = await lireC(); return Object.keys(x.affectation || {}).length ? x : null; }, 40, 500) || {};
  const aff = c2.affectation || {};
  verifier(JSON.stringify(Object.keys(aff).sort()) === JSON.stringify(PLACES.slice().sort()) && JSON.stringify((c2.testeurs || []).slice().sort()) === JSON.stringify(PLACES.slice().sort()), 'l affectation et les testeurs de la campagne sont les six places', Object.keys(aff).join(','));
  verifier(PLACES.every((id) => aff[id].telephone === id.split('-')[1]), 'chaque place garde son téléphone');
  const porteurs = new Map();
  PLACES.forEach((u) => aff[u].cles.forEach((k) => porteurs.set(k, [...(porteurs.get(k) || []), u])));
  verifier([...porteurs.entries()].every(([k, l]) => SOCLE.includes(k.split('__')[0]) || l.length === 1), 'hors socle, chaque passage une seule fois');
  verifier(PLACES.every((u) => aff[u].cles.length <= PLAFOND), `aucune au-delà de ${PLAFOND}`);
  verifier(c2.regle === 'socle' && Number.isFinite((c2.repartition || {}).laissesAuxRobots), 'la règle et le bilan sont écrits comme pour des testeurs', JSON.stringify(c2.repartition));
  await pause(5000);
  const apresRepartition = await releve();
  verifier(JSON.stringify(apresRepartition) === JSON.stringify(avant), 'toujours rien : ni invitation, ni lettre, ni notification, ni activité client', `${JSON.stringify(avant)} -> ${JSON.stringify(apresRepartition)}`);
  verifier(!(await Promise.all(PLACES.map((id) => db.doc(`testeurs/${id}`).get()))).some((d) => d.exists), 'aucune fiche de testeur au nom d une place');
  const affPlaceIos1 = JSON.parse(JSON.stringify(aff['place-ios-1']));
  const affPlaceAndroid1 = JSON.parse(JSON.stringify(aff['place-android-1']));
  const rangIos1 = (c2.testeurs || []).indexOf('place-ios-1');

  console.log('\n== Lancer : fermé tant qu\'une place est vide');
  await ouvrir('[data-lancement]');
  const l1 = await page.evaluate(() => ({
    places: ((document.querySelector('[data-pret="places"]') || {}).innerText || '').replace(/\s+/g, ' '),
    okPlaces: ((document.querySelector('[data-pret="places"]') || {}).dataset || {}).ok,
    lancer: (document.querySelector('[data-lancer]') || {}).disabled,
  }));
  verifier(l1.okPlaces === '0' && /6 places sans testeur/.test(l1.places), '« 6 places sans testeur » dans « Prête à lancer ? »', l1.places);
  verifier(l1.lancer === true, 'le bouton « Lancer la campagne » est fermé');

  console.log('\n== Même lancée de force, une place ne reçoit rien');
  await refC.update({ statut: 'en-cours' });
  await pause(8000);
  const force = await releve();
  const lettresPlaces = (await refC.collection('lettresTesteurs').get()).docs.filter((d) => d.id.startsWith('place-')).length;
  verifier(force.boitesPlaces === 0 && lettresPlaces === 0, 'aucune notification ni marque de lettre pour une place', `boites ${force.boitesPlaces}, marques ${lettresPlaces}`);
  verifier(force.envois === avant.envois && force.notifications === avant.notifications, 'aucune lettre, aucune notification', `${avant.envois}/${avant.notifications} -> ${force.envois}/${force.notifications}`);
  await refC.update({ statut: 'preparation' });
  await pause(3000);

  console.log('\n== Attribuer « iPhone 1 » à une nouvelle personne');
  await ouvrir('[data-attribuer-place="place-ios-1"]');
  await page.click('[data-attribuer-place="place-ios-1"]');
  await page.waitForSelector('[data-place-prenom]', { timeout: 10000 });
  await page.fill('[data-place-prenom]', 'Nora');
  await page.fill('[data-place-email]', 'nora.place@essai.test');
  await page.fill('[data-place-compte]', 't1@exemple.test');
  await page.click('[data-attribuer]');
  const c3 = await attendre(async () => { const x = await lireC(); return ((x.places || {})['place-ios-1'] || {}).testeur ? x : null; }, 60, 500) || {};
  const nora = await admin.auth().getUserByEmail('nora.place@essai.test').catch(() => null);
  verifier(Boolean(nora) && c3.places['place-ios-1'].testeur === nora.uid, 'la place porte désormais son testeur');
  const fNora = nora ? ((await db.doc(`testeurs/${nora.uid}`).get()).data() || {}) : {};
  verifier(fNora.prenom === 'Nora' && fNora.mobile === 'ios' && JSON.stringify(fNora.plateformes) === '["ios","web"]' && (fNora.projets || []).includes(P), 'sa fiche naît avec le téléphone et le web de la place, sur le projet', JSON.stringify({ m: fNora.mobile, p: fNora.plateformes, pr: fNora.projets }));
  verifier(nora && (c3.testeurs || []).indexOf(nora.uid) === rangIos1 && !(c3.testeurs || []).includes('place-ios-1'), 'elle prend la place dans la liste des testeurs, au même rang');
  verifier(nora && JSON.stringify((c3.affectation || {})[nora.uid]) === JSON.stringify(affPlaceIos1), 'les passages de la place lui reviennent tels quels', nora ? JSON.stringify((c3.affectation || {})[nora.uid]).slice(0, 120) : '');
  verifier(!('place-ios-1' in (c3.affectation || {})), 'la place n a plus d affectation');
  verifier(PLACES.filter((id) => id !== 'place-ios-1').every((id) => JSON.stringify(c3.affectation[id]) === JSON.stringify(aff[id])), 'les autres places n ont pas bougé');
  const acc = nora ? ((await refC.collection('acces').doc(nora.uid).get()).data() || {}) : {};
  verifier(acc.compteTest === 't1@exemple.test', 'son compte de test est posé', JSON.stringify(acc));
  const invNora = nora ? (await db.collection('invitations').where('uid', '==', nora.uid).get()).docs.map((d) => d.data()) : [];
  verifier(invNora.length === 1 && invNora[0].type === 'testeur', 'son invitation part à ce moment-là', `${invNora.length}`);
  const lettreNora = await attendre(async () => (await db.collection('envois').get()).docs.map((d) => d.data()).find((e) => e.modele === 'invitation-testeur' && JSON.stringify(e.a || []).includes('nora.place@essai.test')), 20, 500);
  verifier(Boolean(lettreNora), 'la lettre d invitation est en file');

  console.log('\n== Attribuer « Android 1 » à un testeur déjà inscrit');
  const sonia = parPrenom.Sonia;
  const invSoniaAvant = (await db.collection('invitations').where('uid', '==', sonia.id).get()).size;
  const envoisAvant = (await db.collection('envois').get()).size;
  await ouvrir('[data-attribuer-place="place-android-1"]');
  await page.click('[data-attribuer-place="place-android-1"]');
  await page.waitForSelector('[data-place-inscrit]', { timeout: 10000 });
  const options = await page.$$eval('[data-place-inscrit] option', (l) => l.map((o) => o.value).filter(Boolean));
  verifier(options.length === 3 && options.every((id) => vivier.find((t) => t.id === id).mobile === 'android'), 'seuls les testeurs Android sont proposés', `${options.length}`);
  await page.selectOption('[data-place-inscrit]', sonia.id);
  await page.click('[data-attribuer]');
  const c4 = await attendre(async () => { const x = await lireC(); return ((x.places || {})['place-android-1'] || {}).testeur ? x : null; }, 60, 500) || {};
  verifier(((c4.places || {})['place-android-1'] || {}).testeur === sonia.id, 'Sonia prend la place');
  verifier(JSON.stringify((c4.affectation || {})[sonia.id]) === JSON.stringify(affPlaceAndroid1) && !('place-android-1' in (c4.affectation || {})), 'avec ses passages, tels quels');
  await pause(3000);
  verifier((await db.collection('invitations').where('uid', '==', sonia.id).get()).size === invSoniaAvant, 'sans nouvelle invitation : elle est déjà inscrite');
  verifier(!(await db.collection('envois').get()).docs.slice(0).some((d) => JSON.stringify(d.data().a || []).includes('sonia.testeur@essai.test') && d.data().modele === 'invitation-testeur'), 'ni lettre', `${envoisAvant}`);

  console.log('\n== Les refus du serveur');
  const marc = parPrenom.Marc;
  const r1 = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place: 'place-android-2', testeur: marc.id });
  verifier(r1.code === 409 && /iPhone/.test(r1.texte), 'un iPhone sur une place Android : refusé', `${r1.code} ${r1.texte}`);
  const r2 = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place: 'place-ios-1', testeur: marc.id });
  verifier(r2.code === 409, 'une place déjà attribuée : refusé', `${r2.code} ${r2.texte}`);
  const r3 = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place: 'place-ios-9', testeur: marc.id });
  verifier(r3.code === 404, 'une place inconnue : refusé', `${r3.code}`);
  const r4 = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place: 'place-ios-2', testeur: marc.id, compteTest: 't1@exemple.test' });
  verifier(r4.code === 409 && /compte de test/.test(r4.texte), 'un compte de test déjà pris : refusé', `${r4.code} ${r4.texte}`);
  const r5 = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place: 'place-ios-2', prenom: 'Camille', email: 'camille.essai@exemple.test' });
  verifier(r5.code === 409 && /un seul rôle/.test(r5.texte), 'l adresse d un client : refusé (un seul rôle)', `${r5.code} ${r5.texte}`);
  verifier(!((((await lireC()).places || {})['place-ios-2']) || {}).testeur, 'aucun refus n a touché la place');

  console.log('\n== Encore quatre places vides : toujours fermé');
  await ouvrir('[data-lancement]');
  const l2 = await page.evaluate(() => ({ places: ((document.querySelector('[data-pret="places"]') || {}).innerText || '').replace(/\s+/g, ' '), lancer: (document.querySelector('[data-lancer]') || {}).disabled }));
  verifier(/4 places sans testeur/.test(l2.places) && l2.lancer === true, '« 4 places sans testeur », « Lancer » fermé', l2.places);
  const lignesTesteurs = await page.$$eval('[data-place-sans-testeur]', (l) => l.length);
  verifier(lignesTesteurs === 4, 'la liste des testeurs montre les quatre places sans testeur', `${lignesTesteurs}`);

  console.log('\n== Toutes attribuées : la campagne se lance, les vrais seuls sont prévenus');
  for (const [place, prenom] of [['place-ios-2', 'Marc'], ['place-ios-3', 'Hugo'], ['place-android-2', 'Ines'], ['place-android-3', 'Leila']]) {
    const r = await appelAdmin('attribuerPlace', { projet: P, campagne: CID, place, testeur: parPrenom[prenom].id });
    verifier(r.code === 200 && r.json && r.json.invite === false, `${place} à ${prenom}`, `${r.code} ${r.texte.slice(0, 120)}`);
  }
  const c5 = await lireC();
  const reels = [nora && nora.uid, sonia.id, ...['Marc', 'Hugo', 'Ines', 'Leila'].map((p) => parPrenom[p].id)];
  verifier(JSON.stringify((c5.testeurs || []).slice().sort()) === JSON.stringify(reels.slice().sort()) && !(c5.testeurs || []).some((u) => u.startsWith('place-')), 'la campagne ne compte plus que des personnes');
  verifier(!Object.keys(c5.affectation || {}).some((u) => u.startsWith('place-')), 'l affectation aussi');
  verifier(PLACES.every((id) => JSON.stringify(c5.affectation[c5.places[id].testeur]) === JSON.stringify(aff[id])), 'chaque personne a exactement les passages de sa place');
  await ouvrir('[data-lancement]');
  const l3 = await page.evaluate(() => ({ ok: ((document.querySelector('[data-pret="places"]') || {}).dataset || {}).ok, places: ((document.querySelector('[data-pret="places"]') || {}).innerText || '').replace(/\s+/g, ' '), lancer: (document.querySelector('[data-lancer]') || {}).disabled }));
  verifier(l3.ok === '1' && l3.lancer === false, 'la ligne des places passe, « Lancer » s ouvre', `${l3.places} · ${l3.lancer}`);
  verifier(await page.$('[data-identifiants-de^="place-"]') === null, 'aucun champ d identifiants pour une place');
  await page.click('[data-lancer]');
  verifier(Boolean(await attendre(async () => (await lireC()).statut === 'en-cours', 30, 500)), 'la campagne est en cours');
  const marques = await attendre(async () => { const q = await refC.collection('lettresTesteurs').get(); return q.size >= 6 ? q.docs.map((d) => d.id) : null; }, 60, 500) || [];
  verifier(JSON.stringify(marques.slice().sort()) === JSON.stringify(reels.slice().sort()), 'les six personnes sont prévenues, aucune place', marques.join(','));
  const fin = await releve();
  verifier(fin.boitesPlaces === 0, 'aucune boîte de notifications au nom d une place');
  const jS = await jetonPour('sonia.testeur@essai.test');
  verifier((await fetch(bddRest(`projets/${P}/campagnes/${CID}`), { headers: { Authorization: `Bearer ${jS}` } })).status === 200, 'Sonia lit la campagne (les règles la reconnaissent)');

  verifier(!err.length, 'aucune erreur de page', err.slice(0, 3).join(' | '));
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
