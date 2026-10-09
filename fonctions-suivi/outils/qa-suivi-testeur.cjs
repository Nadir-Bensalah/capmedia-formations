/* ==========================================================================
   CAPMEDIA COCKPIT · la fiche de suivi d'un testeur

   Ce que prouve cette suite :
   - un clic sur un testeur (page Tests) ouvre sa fiche de suivi, et le
     lien « Voir sa fiche » de Messages › Testeurs aussi ; « Modifier »
     mène au formulaire d'avant ;
   - l'invitation : envoyée le (inviterTesteur), acceptée non, puis oui à
     sa première connexion réelle (la porte la marque acceptée) ;
   - les connexions : des sessions semées aux dates connues se regroupent
     (rechargement, deux onglets, pause de plus d'une demi-heure), chaque
     durée est juste, le total aussi ; puis la vraie connexion de Karim
     s'ajoute, en ligne maintenant ;
   - l'avancement : faits sur prévus, échecs, à rejouer, remarques, avis
     rendu oui ou non, terminé oui ou non ;
   - appareils et statut ;
   - la confidentialité : le client ne voit ni la fiche ni le nom, même
     avec ?testeur= dans l'adresse ; le testeur non plus ; ni l'un ni
     l'autre ne lit présence, sessions d'autrui, appréciation ou fiche ; la
     fonction suiviTesteur les refuse, et ne rend jamais le lien ni
     l'identifiant d'une invitation.

   Banc : émulateurs (Functions compris), site local, semer-suivi,
   semer-campagne.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { appelAdmin, uidDe, jetonPour } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const PID = 'atelier'; const CID = 'c-oct';
const ADMIN = 'agent.essai@exemple.test';
const CLIENT = 'camille.essai@exemple.test';
const KARIM = 'karim.testeur@essai.test';
const SONIA = 'sonia.testeur@essai.test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: new Date(d).toISOString() });
const B = (v) => ({ booleanValue: Boolean(v) }); const M = (o) => ({ mapValue: { fields: o } }); const L = (l) => ({ arrayValue: { values: l } });
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const attendre = async (fn, n = 40, ms = 500) => { for (let i = 0; i < n; i += 1) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(ms); } return null; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, hash); await pause(1200); };
/* Une lecture de la base AU NOM de quelqu'un : les règles s'appliquent. */
const lireComme = async (jeton, chemin) => (await fetch(bdd(chemin), { headers: { Authorization: `Bearer ${jeton}` } })).status;

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* La fiche ouverte dans la page : le texte de chaque bloc et de chaque repère. */
const lireFiche = (page) => page.evaluate(() => {
  const f = document.querySelector('.voile .feuille [data-suivi-testeur]');
  if (!f) return null;
  const t = (sel) => ((f.querySelector(sel) || {}).innerText || '').replace(/\s+/g, ' ').trim();
  return {
    uid: f.dataset.suiviTesteur, etat: f.dataset.stEtat,
    titre: ((document.querySelector('.voile .feuille .modale-tete h2') || {}).innerText || '').trim(),
    envoyee: t('[data-st="envoyee"] .st-valeur'), acceptee: t('[data-st="acceptee"] .st-valeur'), lien: t('[data-st="lien"] .st-valeur'),
    resumeConnexions: t('[data-st="resume-connexions"]'),
    connexions: [...f.querySelectorAll('[data-st-bloc="connexions"] > .tb-sessions [data-st-connexion]')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
    durees: [...f.querySelectorAll('[data-st-bloc="connexions"] > .tb-sessions [data-st-connexion] b')].map((x) => x.innerText.trim()),
    resumeAvancement: t('[data-st="resume-avancement"]'),
    campagnes: [...f.querySelectorAll('[data-st-campagne]')].map((c) => ({
      id: c.dataset.stCampagne,
      faits: ((c.querySelector('[data-st="faits"]') || {}).innerText || '').trim(),
      prevus: ((c.querySelector('[data-st="prevus"]') || {}).innerText || '').trim(),
      echecs: ((c.querySelector('[data-st="echecs"]') || {}).innerText || '').trim(),
      remarques: ((c.querySelector('[data-st="remarques"]') || {}).innerText || '').trim(),
      avis: ((c.querySelector('[data-st="avis"]') || {}).innerText || '').trim(),
      termine: ((c.querySelector('[data-st="termine"]') || {}).innerText || '').trim(),
      texte: c.innerText.replace(/\s+/g, ' ').trim(),
    })),
    appareils: t('[data-st-bloc="appareils"]'),
    statut: t('[data-st="statut"] .st-valeur'),
    tout: f.innerText,
    vides: /undefined|null|NaN/.test(f.innerText),
    modifier: Boolean(document.querySelector('.voile .feuille [data-modifier-testeur]')),
  };
});
const ouvrirFiche = async (page, uid) => {
  for (let i = 0; i < 6; i += 1) {
    const b = await page.$(`#testeurs [data-action="ouvrir-testeur"][data-id="${uid}"]`);
    if (b) { await b.scrollIntoViewIfNeeded().catch(() => null); await b.click({ force: true }).catch(() => null); }
    const pret = await attendre(async () => { const f = await lireFiche(page); return f && f.uid === uid && f.etat === 'pret' ? f : null; }, 30, 300);
    if (pret) return pret;
    await page.keyboard.press('Escape'); await pause(600);
  }
  return lireFiche(page);
};
const fermer = async (page) => { await page.keyboard.press('Escape'); await pause(500); };

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const nouvellePage = async (largeur = 1440) => { const p = await (await nav.newContext({ viewport: { width: largeur, height: 900 } })).newPage(); p.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160))); return p; };

  const karim = await uidDe(KARIM); const sonia = await uidDe(SONIA);
  verifier(Boolean(karim && sonia), 'Karim et Sonia sont parmi les testeurs du banc');
  const campagne = await lire(`projets/${PID}/campagnes/${CID}`);
  const affectation = (champ(campagne, 'affectation').mapValue || {}).fields || {};
  const clesDe = (uid) => [...new Set(((((((affectation[uid] || {}).mapValue || {}).fields || {}).cles || {}).arrayValue || {}).values || []).map((v) => v.stringValue).filter((k) => /.+__(ios|android|web)$/.test(k)))];
  const clesKarim = clesDe(karim); const clesSonia = clesDe(sonia);
  verifier(clesKarim.length >= 5 && clesSonia.length > 0, `la campagne leur confie des tests (Karim ${clesKarim.length}, Sonia ${clesSonia.length})`);

  /* --- Le semis de Karim : des sessions aux dates connues, des passages,
     des remarques, une appréciation. --------------------------------- */
  const MIN = 60000;
  const minuit = new Date(); minuit.setHours(0, 0, 0, 0);
  const j2 = minuit.getTime() - 2 * 86400000 + 10 * 3600000; /* avant-hier, 10 h */
  const j1 = minuit.getTime() - 86400000 + 14 * 3600000;     /* hier, 14 h */
  const sessions = [
    /* Un rechargement : 10 h 00 à 10 h 20, puis 10 h 20 à 10 h 50 : une connexion de 50 min. */
    ['s-a', j2, j2 + 20 * MIN, 'web'], ['s-b', j2 + 20 * MIN, j2 + 50 * MIN, 'ios'],
    /* Deux onglets : 14 h 00 à 14 h 40, et 14 h 10 à 14 h 30 dedans : 40 min, pas 60. */
    ['s-c', j1, j1 + 40 * MIN, 'web'], ['s-d', j1 + 10 * MIN, j1 + 30 * MIN, 'web'],
    /* 80 min plus tard : une nouvelle connexion de 15 min. */
    ['s-e', j1 + 120 * MIN, j1 + 135 * MIN, 'ios'],
  ];
  await vider(`presences/${karim}/sessions`);
  for (const [id, debut, vu, plateforme] of sessions) {
    await poser(`presences/${karim}/sessions/${id}`, { debut: T(debut), vu: T(vu), campagne: S(CID), projet: S(PID), plateforme: S(plateforme), agent: S('banc') });
  }
  await poser(`presences/${karim}`, { campagne: S(CID), projet: S(PID), plateforme: S('ios'), scenario: S(''), vue: S('grille'), session: S('s-e'), debut: T(j1 + 120 * MIN), vu: T(j1 + 135 * MIN), enLigne: B(false) });
  await vider(`projets/${PID}/campagnes/${CID}/passages`); await vider(`projets/${PID}/campagnes/${CID}/remarques`); await vider(`projets/${PID}/campagnes/${CID}/appreciations`);
  const RES = ['reussi', 'reussi', 'sans-objet', 'echec', 'echec'];
  for (let i = 0; i < 5; i += 1) {
    const cle = clesKarim[i]; const k = cle.lastIndexOf('__');
    await poser(`projets/${PID}/campagnes/${CID}/passages/${karim}__${cle}`, {
      scenario: S(cle.slice(0, k)), plateforme: S(cle.slice(k + 2)), testeur: S(karim), resultat: S(RES[i]),
      commentaire: S(RES[i] === 'echec' ? 'Rien ne se passe.' : ''), preuves: L([]), contexte: M({}), cree: T(Date.now()), maj: T(Date.now()),
      ...(i === 4 ? { aRevoir: B(true) } : {}),
    });
  }
  /* Un passage hors de ses tests ne compte pas (une clé qu'on ne lui a pas confiée). */
  const autre = clesSonia.find((c) => !clesKarim.includes(c));
  if (autre) { const k = autre.lastIndexOf('__'); await poser(`projets/${PID}/campagnes/${CID}/passages/${karim}__${autre}`, { scenario: S(autre.slice(0, k)), plateforme: S(autre.slice(k + 2)), testeur: S(karim), resultat: S('echec'), commentaire: S('x'), preuves: L([]), contexte: M({}), cree: T(Date.now()), maj: T(Date.now()) }); }
  await poser(`projets/${PID}/campagnes/${CID}/remarques/r-1`, { testeur: S(karim), texte: S('Le bouton est petit.'), scenario: S(''), plateforme: S('ios'), cree: T(Date.now()) });
  await poser(`projets/${PID}/campagnes/${CID}/remarques/r-2`, { testeur: S(karim), texte: S('La police est fine.'), scenario: S(''), plateforme: S('web'), cree: T(Date.now()) });
  await poser(`projets/${PID}/campagnes/${CID}/remarques/r-3`, { testeur: S(sonia), texte: S('Rien à dire.'), scenario: S(''), plateforme: S('android'), cree: T(Date.now()) });
  await poser(`projets/${PID}/campagnes/${CID}/appreciations/${karim}`, { testeur: S(karim), avisRendus: M({ avant: B(true) }), maj: T(Date.now()) });
  /* Un appareil relevé, pour le bloc des appareils. */
  await fetch(`${bdd(`testeurs/${karim}`)}?updateMask.fieldPaths=appareils`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { appareils: L([M({ cle: S('a1'), plateforme: S('ios'), modele: S('iPhone 13'), os: S('iOS 18.1'), navigateur: S('Safari 18'), vu: T(j1), confirme: B(true) })]) } }) });

  /* Sonia n'est jamais venue : le semis lui valide sa fiche d'avance, ce
     qu'un vrai testeur ne fait qu'une fois entré. On la remet à blanc. */
  await fetch(`${bdd(`testeurs/${sonia}`)}?updateMask.fieldPaths=ficheValidee`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
  await vider(`presences/${sonia}/sessions`);
  /* Les invitations, par la vraie fonction : une à Sonia, une à Karim. */
  const invS = await appelAdmin('inviterTesteur', { testeur: sonia });
  const invK = await appelAdmin('inviterTesteur', { testeur: karim });
  verifier(invS.code === 200 && invK.code === 200, 'les deux invitations partent', `${invS.code} ${invK.code}`);
  await pause(1500);

  console.log('\n== La fonction suiviTesteur : l équipe seule, jamais le lien');
  const rAdmin = await appelAdmin('suiviTesteur', { testeur: sonia });
  const invs = ((rAdmin.json || {}).invitations) || [];
  verifier(rAdmin.code === 200 && invs.length >= 1 && invs.every((i) => i.envoyee > 0), 'l administrateur lit ses invitations, datées', rAdmin.texte.slice(0, 160));
  verifier(!/jeton|lien|https?:|"id"/.test(rAdmin.texte), 'ni lien, ni jeton, ni identifiant dans la réponse', rAdmin.texte.slice(0, 200));
  const rClient = await appelAdmin('suiviTesteur', { testeur: sonia }, { email: CLIENT });
  verifier(rClient.code === 403 || rClient.code === 401, 'la cliente est refusée', `${rClient.code} ${rClient.texte.slice(0, 80)}`);
  const rTesteur = await appelAdmin('suiviTesteur', { testeur: karim }, { email: KARIM });
  verifier(rTesteur.code === 403 || rTesteur.code === 401, 'Karim est refusé, même pour lui-même', `${rTesteur.code} ${rTesteur.texte.slice(0, 80)}`);
  const rTesteur2 = await appelAdmin('suiviTesteur', { testeur: sonia }, { email: KARIM });
  verifier(rTesteur2.code === 403 || rTesteur2.code === 401, 'et pour Sonia', `${rTesteur2.code}`);
  const rInconnu = await appelAdmin('suiviTesteur', { testeur: 'personne-xyz' });
  verifier(rInconnu.code === 404, 'un testeur inconnu : 404', `${rInconnu.code}`);

  console.log('\n== Les règles : ni le client ni le testeur ne lisent le suivi');
  const jClient = await jetonPour(CLIENT); const jKarim = await jetonPour(KARIM); const jAdmin = await jetonPour(ADMIN);
  verifier(await lireComme(jAdmin, `presences/${karim}/sessions`) === 200, 'l équipe lit les sessions de Karim (contrôle)');
  verifier(await lireComme(jKarim, `presences/${karim}/sessions`) === 200, 'Karim relit ses sessions (contrôle : son jeton marche)');
  verifier(await lireComme(jClient, `presences/${karim}/sessions`) === 403, 'la cliente ne lit pas ses sessions');
  verifier(await lireComme(jClient, `presences/${karim}`) === 403, 'ni sa présence');
  verifier(await lireComme(jClient, `projets/${PID}/campagnes/${CID}/appreciations/${karim}`) === 403, 'ni son appréciation (avis rendu, terminé)');
  verifier(await lireComme(jClient, `testeurs/${karim}`) === 403, 'ni sa fiche');
  verifier(await lireComme(jKarim, `presences/${sonia}/sessions`) === 403, 'Karim ne lit pas les sessions de Sonia');
  verifier(await lireComme(jKarim, `presences/${karim}`) === 403, 'ni la présence que l équipe voit, même la sienne');
  verifier(await lireComme(jKarim, `projets/${PID}/campagnes/${CID}/appreciations/${sonia}`) === 403, 'ni l appréciation de Sonia');
  verifier(await lireComme(jKarim, `testeurs/${sonia}`) === 403, 'ni la fiche de Sonia');

  console.log('\n== Sonia : invitée, jamais venue');
  const equipe = await nouvellePage();
  await connecter(equipe, ADMIN);
  await aller(equipe, `#/tests?projet=${PID}`);
  await equipe.waitForSelector('#testeurs [data-action="ouvrir-testeur"]', { timeout: 20000 }).catch(() => null);
  let f = await ouvrirFiche(equipe, sonia);
  verifier(f && f.etat === 'pret', 'un clic sur Sonia ouvre sa fiche de suivi', JSON.stringify(f && { etat: f.etat, uid: f.uid }));
  if (f) {
    verifier(/Sonia/.test(f.titre), 'à son nom', f.titre);
    verifier(/\d{1,2} \S+ \d{4} à \d{2}:\d{2}/.test(f.envoyee), 'invitation : envoyée le …, à l heure', f.envoyee);
    verifier(/^non/.test(f.acceptee), 'acceptée : non', f.acceptee);
    verifier(/lien valable/.test(f.lien), 'et son lien est encore valable', f.lien);
    verifier(/Aucune connexion/.test(f.resumeConnexions) && f.connexions.length === 0, 'aucune connexion', f.resumeConnexions);
    const c = f.campagnes.find((x) => x.id === CID) || {};
    verifier(c.faits === '0' && c.prevus === String(clesSonia.length), `avancement : 0 sur ${clesSonia.length}`, JSON.stringify(c).slice(0, 160));
    verifier(c.remarques === '1' && /première impression non, avis final non/.test(c.avis) && c.termine === 'non', 'sa remarque, pas d avis, pas terminé', `${c.remarques} · ${c.avis} · ${c.termine}`);
    verifier(/Aucun appareil relevé/.test(f.appareils), 'aucun appareil relevé', f.appareils.slice(0, 80));
    verifier(f.statut === 'actif', 'statut : actif', f.statut);
    verifier(/Fiche validée pas encore/.test(f.tout.replace(/\s+/g, ' ')), 'fiche pas encore validée');
    verifier(!f.vides, 'jamais « undefined », « null » ni « NaN »');
    verifier(f.modifier, 'avec « Modifier »');
  }
  await fermer(equipe);

  console.log('\n== Karim : la vraie connexion, l invitation acceptée');
  const testeurPage = await nouvellePage(1280);
  await connecter(testeurPage, KARIM);
  if (await testeurPage.$('.accueil [data-accueil="passer"]')) { await testeurPage.click('.accueil [data-accueil="passer"]').catch(() => null); }
  const invAcceptee = await attendre(async () => {
    const j = await lire('invitations?pageSize=100');
    return ((j && j.documents) || []).some((d) => str(d, 'uid') === karim && str(d, 'etat') === 'acceptee');
  }, 30, 500);
  verifier(invAcceptee, 'la porte marque son invitation acceptée');
  const sessionReelle = await attendre(async () => {
    const j = await lire(`presences/${karim}/sessions?pageSize=50`);
    return ((j && j.documents) || []).find((d) => !/\/s-[a-e]$/.test(d.name) && champ(d, 'debut').timestampValue);
  }, 60, 500);
  verifier(Boolean(sessionReelle), 'son espace ouvre une vraie session (testeur.js)');
  /* Laisser passer un signe : la session a au moins quelques secondes. */
  await pause(4000);

  console.log('\n== Karim : la fiche, vue de l équipe');
  await aller(equipe, `#/tests?projet=${PID}`);
  f = await ouvrirFiche(equipe, karim);
  verifier(f && f.etat === 'pret', 'sa fiche s ouvre');
  if (f) {
    verifier(/^oui, première connexion le/.test(f.acceptee), 'invitation acceptée, avec la première connexion', f.acceptee);
    const premiere = new Date(j2).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    verifier(f.acceptee.includes(premiere) && f.acceptee.includes('10:00'), `la première connexion est la plus ancienne trace (${premiere} à 10:00)`, f.acceptee);
    verifier(/\d{1,2} \S+ \d{4} à \d{2}:\d{2}/.test(f.envoyee), 'et l invitation envoyée le …', f.envoyee);
    verifier(/^4 connexions/.test(f.resumeConnexions), 'quatre connexions : trois semées regroupées, plus la vraie', f.resumeConnexions);
    verifier(/En ligne maintenant/.test(f.resumeConnexions), 'en ligne maintenant', f.resumeConnexions);
    const total = (f.resumeConnexions.match(/(\d+) h (\d{2}) en tout/) || []).slice(1).map(Number);
    const minutes = total.length ? total[0] * 60 + total[1] : -1;
    verifier(minutes >= 105 && minutes <= 108, 'le temps total : 1 h 45 semées plus la vraie session', f.resumeConnexions);
    verifier(f.connexions.length === 4, 'quatre lignes dans l historique', String(f.connexions.length));
    verifier(JSON.stringify(f.durees.slice(1)) === JSON.stringify(['15 min', '40 min', '50 min']), 'des durées justes, la plus récente d abord : 15, 40 (deux onglets comptés une fois), 50 (un rechargement)', f.durees.join(' / '));
    verifier(/14:00 à 14:40/.test(f.connexions[2] || '') && /10:00 à 10:50/.test(f.connexions[3] || ''), 'avec le début et la fin de chaque connexion', `${f.connexions[2]} | ${f.connexions[3]}`);
    verifier(/iPhone/.test(f.connexions[3] || '') && /Web/.test(f.connexions[3] || ''), 'et ses plateformes', f.connexions[3]);
    const c = f.campagnes.find((x) => x.id === CID) || {};
    verifier(c.faits === '4' && c.prevus === String(clesKarim.length), `avancement : 4 faits sur ${clesKarim.length} (l échec à rejouer et le passage hors de ses tests ne comptent pas)`, `${c.faits} sur ${c.prevus}`);
    verifier(c.echecs === '1', 'un échec signalé', c.echecs);
    verifier(/À rejouer 1/.test(c.texte), 'un à rejouer', c.texte.slice(0, 200));
    verifier(c.remarques === '2', 'ses deux remarques, pas celle de Sonia', c.remarques);
    verifier(/première impression oui, avis final non/.test(c.avis), 'avis : première impression rendue, avis final non', c.avis);
    verifier(c.termine === 'non', 'pas terminé', c.termine);
    verifier(/^4 tests faits sur \d+ prévus, 1 échec signalé, 2 remarques\.$/.test(f.resumeAvancement), 'la phrase de tête additionne', f.resumeAvancement);
    verifier(/iPhone 13/.test(f.appareils) && /iOS 18\.1/.test(f.appareils), 'ses appareils relevés', f.appareils.slice(0, 120));
    verifier(!/Rien ne se passe|Le bouton est petit/.test(f.tout), 'ni le texte de ses échecs, ni celui de ses remarques : des comptes');
    verifier(!f.vides, 'jamais « undefined », « null » ni « NaN »');
  }
  /* La capture pour l'équipe, quand on la demande (CAPTURE_SUIVI=<fichier.png>). */
  if (process.env.CAPTURE_SUIVI) {
    await equipe.setViewportSize({ width: 1440, height: 1900 }); await pause(800);
    await equipe.locator('.voile .feuille').screenshot({ path: process.env.CAPTURE_SUIVI }).catch((e) => console.log(`     capture impossible : ${e.message}`));
    await equipe.setViewportSize({ width: 1440, height: 900 }); await pause(400);
  }
  await fermer(equipe);

  console.log('\n== Il termine et rend son avis final');
  await poser(`projets/${PID}/campagnes/${CID}/appreciations/${karim}`, { testeur: S(karim), avisRendus: M({ avant: B(true), apres: B(true) }), termine: T(Date.now()), maj: T(Date.now()) });
  f = await ouvrirFiche(equipe, karim);
  const c2 = ((f || {}).campagnes || []).find((x) => x.id === CID) || {};
  verifier(/^oui, le /.test(c2.termine) && /avis final oui/.test(c2.avis), 'terminé oui, le …, avis final oui', `${c2.termine} · ${c2.avis}`);

  console.log('\n== Modifier : le formulaire d avant');
  await equipe.click('.voile .feuille [data-modifier-testeur]').catch(() => null);
  await equipe.waitForSelector('.voile .feuille #t-prenom', { timeout: 10000 }).catch(() => null);
  verifier((await equipe.inputValue('.voile .feuille #t-prenom').catch(() => '')) === 'Karim', '« Modifier » ouvre le formulaire, prérempli');
  await fermer(equipe);

  console.log('\n== Depuis Messages › Testeurs');
  await aller(equipe, `#/testeurs-messages/${karim}`);
  await equipe.waitForSelector('#tm-liens [data-fiche-testeur]', { timeout: 15000 }).catch(() => null);
  await equipe.click('#tm-liens [data-fiche-testeur]').catch(() => null);
  const depuisMessages = await attendre(async () => { const x = await lireFiche(equipe); return x && x.uid === karim && x.etat === 'pret' ? x : null; }, 40, 400);
  verifier(Boolean(depuisMessages), '« Voir sa fiche » ouvre la fiche de suivi', await equipe.evaluate(() => location.hash));
  await fermer(equipe);

  console.log('\n== Le client ne voit rien de tout cela');
  const client = await nouvellePage(1280);
  await connecter(client, CLIENT);
  await aller(client, `#/tests?projet=${PID}&testeur=${karim}`);
  await client.waitForSelector('#testeurs', { timeout: 20000 }).catch(() => null);
  await pause(3000);
  const vuClient = await client.evaluate(() => ({
    lignes: document.querySelectorAll('[data-action="ouvrir-testeur"]').length,
    fiche: Boolean(document.querySelector('[data-suivi-testeur]')),
    texte: document.body.innerText,
  }));
  verifier(vuClient.lignes === 0 && !vuClient.fiche, 'ni ligne à ouvrir, ni fiche, même avec ?testeur= dans l adresse', JSON.stringify({ l: vuClient.lignes, f: vuClient.fiche }));
  verifier(!/Karim|Sonia|karim\.testeur/.test(vuClient.texte), 'et aucun nom de testeur');
  verifier(!/Envoyée le|première connexion le|\d+ connexions?,|\d+ min en tout|h \d{2} en tout/.test(vuClient.texte), 'ni connexions, ni temps, ni invitation');

  console.log('\n== Le testeur non plus');
  const vuTesteur = await testeurPage.evaluate(() => ({ fiche: Boolean(document.querySelector('[data-suivi-testeur]')), texte: document.body.innerText }));
  verifier(!vuTesteur.fiche && !/Sonia/.test(vuTesteur.texte), 'pas de fiche de suivi dans son espace, ni le nom des autres');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} ok, ${ecarts.length} ÉCART(S)`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`  ÉCART  la suite s est arrêtée : ${String(e && e.message || e).slice(0, 200)}`); process.exit(1); });
