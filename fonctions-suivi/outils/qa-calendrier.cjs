/* La page Calendrier rendue utilisable (01/10/2026), éprouvée dans le
   navigateur, côté client (Hub) et côté équipe (planning du Cockpit) :
   chaque jour s'ouvre à la souris et au clavier dans une fenêtre sur fond
   flou (la date en toutes lettres, chaque élément avec son heure, son
   genre, son projet, ce qu'il y a à faire, le lien vers sa fiche), un jour
   vide le dit et propose un rendez-vous ; les pastilles et « À venir »
   ouvrent leur détail ; chaque genre a sa couleur et son icône, en clair
   et en sombre, avec une légende ; le client demande un rendez-vous (une
   demande « tickets » qui porte « rendezVous », que les règles bornent),
   l'équipe la programme depuis son planning, la réunion apparaît en
   direct dans le calendrier du client et la demande passe « planifiée ».
   Un seul dessin à l'arrivée, aucune erreur de page.
   Banc : émulateurs, site local, semer-suivi. */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d'; const SITE = 'http://127.0.0.1:8787';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields) => fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const effacer = (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
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
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(400); } return false; };
const aller = async (page, chemin, selecteur = '.page', ms = 20000) => { await page.evaluate((c) => { location.hash = c; }, chemin); await page.waitForSelector(selecteur, { timeout: ms }); await pause(900); };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* Les dates du banc, en heure locale (celle du navigateur aussi). */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longue = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const auJour = (n, h = 0, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
/* Le neuvième jour : aucun semis n'y pose rien, la case reste lisible. */
const J2 = auJour(9, 14, 30);
const ISO2 = iso(J2);
const SUJET = 'Point calendrier du banc';
let page = null; let equipe = null; let ticketId = '';

/* Une case s'ouvre d'un clic sur son numéro (le bouton qui couvre la case
   est dessous : le numéro laisse passer le clic). */
/* Le mois affiché avance jusqu'à montrer le jour voulu. */
const montrerJour = async (p, jour) => {
  for (let i = 0; i < 3 && !(await p.$(`.jour[data-jour="${jour}"]`)); i += 1) { await p.click('[data-mois="1"]'); await pause(500); }
};
const cliquerJour = async (p, jour) => {
  await montrerJour(p, jour);
  const b = await p.$eval(`.jour[data-jour="${jour}"] .numero`, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(b.x, b.y);
  await p.waitForSelector(`.voile[data-jour="${jour}"] .modale--jour`, { timeout: 10000 });
  await pause(500);
};
const fermerTout = async (p) => { for (let i = 0; i < 4 && await p.$('.voile'); i += 1) { await p.keyboard.press('Escape'); await pause(350); } };
const texteVisible = (t) => !/\bnull\b|\bundefined\b|NaN|\[object/.test(t);

const nettoyer = async () => {
  await effacer('reunions/re-cal').catch(() => {});
  await effacer('projets/atelier/jalons/cal-etape').catch(() => {});
  for (const d of ((await lire('tickets?pageSize=300')).documents || [])) {
    if (((champ(d, 'rendezVous').mapValue || {}).fields)) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop });
  }
  for (const d of ((await lire('reunions?pageSize=300')).documents || [])) {
    if (str(d, 'ticket')) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop });
  }
};

(async () => {
  await nettoyer();
  const agentUid = 'uid-agent';
  await poser('reunions/re-cal', { projet: S('atelier'), titre: S('Revue du calendrier'), date: T(J2), duree: N(45), participants: L([M({ nom: S('Camille Martin') })]), lien: S('https://meet.google.com/cal-banc-xyz'), lieu: S('Dans vos locaux'), ordreDuJour: S('1. Les retours\n2. La suite'), notes: S(''), compteRendu: S(''), decisions: S(''), actions: L([]), visibilite: S('client'), par: M({ uid: S(agentUid), nom: S('Alex Durand') }), cree: T(new Date()), maj: T(new Date()) });
  await poser('projets/atelier/jalons/cal-etape', { projet: S('atelier'), titre: S('Étape du calendrier'), phase: S('Réalisation'), statut: S('en-cours'), progression: N(40), ordre: N(9), debut: T(auJour(-5)), fin: T(auJour(9, 18, 0)), composants: L([]), reports: L([]), dependances: L([]), description: S(''), cree: T(new Date()), maj: T(new Date()) });

  const nav = await chromium.launch();
  const ctxClient = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctxClient.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(`hub: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => { if (m.text().includes('[magasin]')) erreurs.push(`hub: ${m.text().slice(0, 200)}`); });
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== Hub : un seul dessin à l arrivée sur le calendrier');
  await page.evaluate(() => {
    window.__dessins = 0;
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; const p = n.classList.contains('page') ? n : n.querySelector('.page'); if (p && p.querySelector('.calendrier') && !p.querySelector('.squelette')) window.__dessins += 1; } }).observe(document.querySelector('#vue'), { childList: true, subtree: true });
  });
  await aller(page, '#/calendrier', '.calendrier');
  await pause(1500);
  const dessins = await page.evaluate(() => window.__dessins);
  verifier(dessins === 1, 'la page est peinte une fois, pas deux', `${dessins} dessin(s)`);

  console.log('\n== Hub : chaque genre a sa couleur et son icône, en sombre et en clair, avec une légende');
  await montrerJour(page, ISO2);
  await page.waitForSelector(`.jour[data-jour="${ISO2}"] a.evt.g-reunion`, { timeout: 15000 }).catch(() => {});
  const couleurs = async () => page.evaluate((j) => {
    const r = document.querySelector(`.jour[data-jour="${j}"] a.evt.g-reunion`); const e = document.querySelector(`.jour[data-jour="${j}"] a.evt.g-etape`);
    if (!r || !e) return null;
    return { r: getComputedStyle(r).color, e: getComputedStyle(e).color, rFond: getComputedStyle(r).backgroundColor, ri: r.querySelector('svg').innerHTML, ei: e.querySelector('svg').innerHTML };
  }, ISO2);
  const sombre = await couleurs();
  verifier(sombre && sombre.r !== sombre.e && sombre.ri !== sombre.ei, 'en sombre : la réunion et l étape n ont ni la même couleur ni la même icône', JSON.stringify(sombre && { r: sombre.r, e: sombre.e }));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await pause(300);
  const clair = await couleurs();
  verifier(clair && clair.r !== clair.e && sombre && clair.r !== sombre.r, 'en clair aussi, avec des teintes réglées pour le clair', JSON.stringify(clair && { r: clair.r, e: clair.e }));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await pause(200);
  const legende = await page.$$eval('.cal-legende li', (els) => els.map((li) => ({ t: li.textContent.trim(), svg: Boolean(li.querySelector('svg')), c: getComputedStyle(li.querySelector('svg')).color })));
  verifier(legende.length >= 8 && legende.every((l) => l.svg) && ['Réunion', 'Rendez-vous demandé', 'Étape', 'Tâche', 'Facture', 'Devis', 'Version', 'Validation'].every((g) => legende.some((l) => l.t === g)), 'la légende nomme chaque genre, avec son icône', legende.map((l) => l.t).join(', '));
  verifier(new Set(legende.map((l) => l.c)).size >= 8, 'et chaque genre de la légende a sa couleur', `${new Set(legende.map((l) => l.c)).size} couleurs`);

  console.log('\n== Hub : un jour s ouvre à la souris, dans une fenêtre sur fond flou');
  await cliquerJour(page, ISO2);
  const fenetre = await page.evaluate((j) => {
    const v = document.querySelector(`.voile[data-jour="${j}"]`);
    return { flou: getComputedStyle(v).backdropFilter || getComputedStyle(v).webkitBackdropFilter || '', scenario: v.classList.contains('voile--scenario'), titre: v.querySelector('.modale-tete h2').textContent.trim(), corps: v.querySelector('.modale-corps').textContent, items: [...v.querySelectorAll('.cal-item')].map((li) => ({ cle: li.dataset.cle, heure: li.querySelector('.cal-item-heure').textContent.trim(), genre: li.querySelector('.cal-item-genre').textContent.trim(), fiche: (li.querySelector('[data-fiche]') || {}).getAttribute ? li.querySelector('[data-fiche]').getAttribute('href') : '' })) };
  }, ISO2);
  verifier(fenetre.scenario && /blur/.test(fenetre.flou), 'la fenêtre est celle des fiches de tests, fond flou', fenetre.flou);
  verifier(fenetre.titre === longue(J2), `la date en toutes lettres : « ${longue(J2)} »`, fenetre.titre);
  const itemReunion = fenetre.items.find((i) => i.cle === 're-cal' || i.cle === 'reunion:re-cal');
  const itemEtape = fenetre.items.find((i) => i.cle === 'etape:cal-etape');
  verifier(itemReunion && itemReunion.heure === '14:30' && /Réunion/.test(itemReunion.genre) && /Atelier/.test(itemReunion.genre) && /\/projets\/atelier\/reunions\/re-cal$/.test(itemReunion.fiche), 'la réunion : son heure précise, son genre, son projet, le lien vers sa fiche', JSON.stringify(itemReunion));
  verifier(itemEtape && itemEtape.heure === 'Journée' && /Étape/.test(itemEtape.genre) && /\/projets\/atelier\/etapes$/.test(itemEtape.fiche), 'l étape : « Journée », son genre, son lien', JSON.stringify(itemEtape));
  verifier(/Rejoindre la visioconférence à 14:30/.test(fenetre.corps) && /Fin prévue de cette étape/.test(fenetre.corps), 'et pour chacun, ce qu il y a à faire', fenetre.corps.slice(0, 200));
  verifier(texteVisible(fenetre.corps), 'aucun « null » ni « undefined » dans la fenêtre');
  verifier(Boolean(await page.$(`.voile[data-jour="${ISO2}"] [data-demander-rdv="${ISO2}"]`)), 'un jour à venir propose « Demander un rendez-vous ce jour-là »');
  await fermerTout(page);

  console.log('\n== Hub : au clavier, focus visible puis Entrée');
  await page.focus(`.jour[data-jour="${ISO2}"] .jour-ouvrir`);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await pause(200);
  const focus = await page.evaluate((j) => { const c = document.querySelector(`.jour[data-jour="${j}"]`); const s = getComputedStyle(c); return { actif: document.activeElement === c.querySelector('.jour-ouvrir'), contour: s.outlineStyle, epaisseur: s.outlineWidth, nom: c.querySelector('.jour-ouvrir').getAttribute('aria-label') }; }, ISO2);
  verifier(focus.actif && focus.contour !== 'none' && focus.epaisseur !== '0px', 'la case qui a le focus clavier est entourée', JSON.stringify(focus));
  verifier(new RegExp(`^${longue(J2)}, \\d+ éléments?$`).test(focus.nom || ''), 'et le lecteur d écran lit la date et le nombre d éléments', focus.nom);
  await page.keyboard.press('Enter');
  verifier(Boolean(await page.waitForSelector(`.voile[data-jour="${ISO2}"]`, { timeout: 5000 }).catch(() => null)), 'Entrée ouvre la fenêtre du jour');
  await fermerTout(page);

  console.log('\n== Hub : les pastilles et « À venir » ouvrent leur détail');
  await page.click(`.jour[data-jour="${ISO2}"] a.evt[data-evt="etape:cal-etape"]`);
  await page.waitForSelector('.modale--cal', { timeout: 8000 }).catch(() => {});
  const detailEtape = await page.$eval('.modale--cal', (el) => el.textContent).catch(() => '');
  verifier(/Étape du calendrier/.test(detailEtape) && new RegExp(longue(auJour(9))).test(detailEtape) && /Ce qu'il y a à faire/i.test(detailEtape), 'la pastille d une étape ouvre son détail, sans quitter la page', detailEtape.slice(0, 160));
  verifier(/#\/calendrier$/.test(page.url()), 'l adresse reste celle du calendrier', page.url());
  await fermerTout(page);
  await page.click('.liste [data-action="detail"][data-evt="reunion:re-cal"]');
  await page.waitForSelector('.modale--cal', { timeout: 8000 }).catch(() => {});
  const detailReunion = await page.$eval('.modale--cal', (el) => el.textContent).catch(() => '');
  verifier(/Revue du calendrier/.test(detailReunion) && /à 14:30/.test(detailReunion) && /Dans vos locaux/.test(detailReunion) && /Ordre du jour/i.test(detailReunion), '« À venir » ouvre le détail de la réunion : heure, lieu, ordre du jour', detailReunion.slice(0, 200));
  verifier(Boolean(await page.$('.modale--cal [data-ics="re-cal"]')) && Boolean(await page.$('.modale--cal a[href="https://meet.google.com/cal-banc-xyz"]')), 'avec « Ajouter à mon agenda » et « Rejoindre »');
  await page.click('.modale--cal [data-fiche]');
  verifier(await attendre(async () => /\/projets\/atelier\/reunions\/re-cal/.test(page.url()), 8000), '« Ouvrir la fiche » mène à la fiche', page.url());
  await pause(800); await fermerTout(page);

  console.log('\n== Hub : un jour vide, puis la demande de rendez-vous');
  await aller(page, '#/calendrier', '.calendrier');
  await montrerJour(page, ISO2);
  const demain = iso(auJour(1));
  const jourVide = await page.$$eval('.jour.jour--vide', (els, min) => (els.map((e) => e.dataset.jour).filter((d) => d > min.de && d !== min.sauf)[0] || ''), { de: iso(auJour(3)), sauf: ISO2 });
  verifier(Boolean(jourVide), 'il y a un jour à venir sans rien', jourVide);
  await cliquerJour(page, jourVide);
  const vide = await page.$eval(`.voile[data-jour="${jourVide}"]`, (el) => el.textContent);
  verifier(/Rien de prévu/.test(vide) && /Demandez un rendez-vous/.test(vide) && texteVisible(vide), 'le jour vide le dit, en une phrase utile', vide.slice(0, 200));
  await page.click(`.voile[data-jour="${jourVide}"] [data-demander-rdv="${jourVide}"]`);
  await page.waitForSelector('#cal-forme-rdv', { timeout: 8000 });
  verifier((await page.$eval('#rdv-date', (el) => el.value)) === jourVide, 'la date est préremplie avec le jour ouvert');
  verifier((await page.$eval('#rdv-date-lue', (el) => el.textContent)) === longue(new Date(`${jourVide}T12:00`)), 'et relue en toutes lettres');
  await page.click('#cal-forme-rdv [type="radio"][value="heure"] + span');
  verifier(await page.$eval('.cal-heure', (el) => !el.hidden), '« À une heure précise » montre le champ de l heure');
  await page.click('.modale--cal [type="submit"][form="cal-forme-rdv"]'); await pause(300);
  const erreursForme = await page.$$eval('#cal-forme-rdv .erreur-champ', (els) => els.map((e) => e.textContent));
  verifier(erreursForme.some((e) => /heure/.test(e)) && erreursForme.some((e) => /quelques mots/.test(e)), 'sans heure ni sujet, la demande ne part pas et le dit', erreursForme.join(' | '));
  await page.fill('#rdv-heure', '15:30');
  await page.fill('#rdv-sujet', SUJET);
  await page.fill('#rdv-precisions', 'Les retours du banc.');
  await page.evaluate((j) => { document.querySelector(`.voile[data-jour="${j}"]`).dataset.marque = 'meme'; }, jourVide);
  await page.click('.modale--cal [type="submit"][form="cal-forme-rdv"]');
  const trouve = await attendre(async () => {
    const t = ((await lire('tickets?pageSize=300')).documents || []).find((d) => str(d, 'titre') === `Rendez-vous : ${SUJET}`);
    if (t) ticketId = t.name.split('/').pop();
    return Boolean(t);
  }, 15000);
  const ticket = trouve ? await lire(`tickets/${ticketId}`) : null;
  const rv = ((champ(ticket, 'rendezVous').mapValue || {}).fields) || {};
  verifier(trouve && str(ticket, 'type') === 'demande' && str(ticket, 'statut') === 'nouveau' && str(ticket, 'projet') === 'atelier', 'une demande est créée, de nature « demande », sur Atelier', ticketId);
  verifier((rv.date || {}).stringValue === jourVide && (rv.creneau || {}).stringValue === 'heure' && (rv.heure || {}).stringValue === '15:30' && (rv.sujet || {}).stringValue === SUJET, 'elle porte le jour, le créneau, l heure et le sujet', JSON.stringify(rv));
  verifier(/Rendez-vous souhaité .* à 15:30\./.test(str(ticket, 'description')), 'sa description dit le créneau en clair', str(ticket, 'description').slice(0, 120));
  await page.waitForSelector(`.voile[data-jour="${jourVide}"] .cal-item.g-rdv`, { timeout: 10000 }).catch(() => {});
  const apres = await page.$eval(`.voile[data-jour="${jourVide}"]`, (el) => ({ marque: el.dataset.marque, texte: el.textContent })).catch(() => ({}));
  verifier(apres.marque === 'meme' && /Rendez-vous demandé/i.test(apres.texte || '') && /15:30/.test(apres.texte || '') && /Votre demande est chez nous/.test(apres.texte || ''), 'la fenêtre du jour, restée ouverte, montre la demande en direct', (apres.texte || '').slice(0, 160));
  await fermerTout(page);
  verifier(Boolean(await page.$(`.jour[data-jour="${jourVide}"] a.evt.g-rdv`)), 'et la grille porte la pastille « Rendez-vous demandé »');
  void demain;

  console.log('\n== Hub : le bouton du haut, sans date');
  await page.click('.page-tete [data-demander-rdv]');
  await page.waitForSelector('#cal-forme-rdv', { timeout: 8000 });
  verifier((await page.$eval('#rdv-date', (el) => el.value)) === '' && (await page.$eval('#rdv-date', (el) => el.min)) === iso(new Date()), '« Demander un rendez-vous » s ouvre sans date, à partir d aujourd hui');
  await fermerTout(page);

  console.log('\n== Les règles bornent la demande de rendez-vous');
  const essai = (rv2) => page.evaluate(async (r) => {
    const n = await import('/suivi/assets/js/noyau.js');
    const u = n.auth.currentUser;
    const fiche = { numero: null, projet: 'atelier', composant: '', titre: 'Rendez-vous : essai des règles', description: 'Essai.', type: 'demande', urgence: 'important', statut: 'nouveau', plateforme: '', version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [], assigne: null, auteur: { uid: u.uid, nom: 'Camille Martin', email: u.email, cote: 'client' }, pieces: [], archive: false, cree: new Date(), maj: new Date(), resolu: null, lu: { client: new Date(), equipe: null, clients: {} }, qualification: null, devis: null, suite: null, rendezVous: r };
    try { const ref = await n.addDoc(n.collection(n.bdd, 'tickets'), fiche); return `ok:${ref.id}`; } catch (e) { return e.code || String(e); }
  }, rv2);
  const bon = await essai({ date: jourVide, creneau: 'matin', heure: '', sujet: 'Essai' });
  verifier(/^ok:/.test(bon), 'une demande bien formée passe', bon);
  if (/^ok:/.test(bon)) await effacer(`tickets/${bon.slice(3)}`);
  for (const [rv2, quoi] of [[{ date: jourVide, creneau: 'nuit', heure: '', sujet: 'Essai' }, 'un créneau inconnu'], [{ date: jourVide, creneau: 'heure', heure: '', sujet: 'Essai' }, 'une heure précise sans heure'], [{ date: '15/10/2026', creneau: 'matin', heure: '', sujet: 'Essai' }, 'une date mal écrite'], [{ date: jourVide, creneau: 'matin', heure: '', sujet: 'Essai', lien: 'x' }, 'un champ en trop'], [{ date: jourVide, creneau: 'matin', heure: '', sujet: '' }, 'un sujet vide']]) {
    const r = await essai(rv2);
    verifier(r === 'permission-denied', `les règles refusent ${quoi}`, r);
  }

  console.log('\n== Cockpit : la demande se voit, sur sa fiche et dans le planning');
  const ctxEquipe = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  equipe = await ctxEquipe.newPage();
  equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  equipe.on('console', (m) => { if (m.text().includes('[magasin]')) erreurs.push(`cockpit: ${m.text().slice(0, 200)}`); });
  await connecter(equipe, 'agent.essai@exemple.test');
  await aller(equipe, `#/projets/atelier/demandes/${ticketId}`, '[data-rdv-demande]');
  const encart = await equipe.textContent('[data-rdv-demande]');
  verifier(new RegExp(`Rendez-vous souhaité ${longue(new Date(`${jourVide}T12:00`))}, à 15:30`).test(encart) && Boolean(await equipe.$('[data-rdv-demande] [data-action="programmer-rdv"]')), 'la fiche de la demande dit le créneau et propose « Programmer ce rendez-vous »', encart.trim().slice(0, 140));
  await aller(equipe, '#/planning', '.calendrier');
  await montrerJour(equipe, jourVide);
  verifier(Boolean(await equipe.$(`.jour[data-jour="${jourVide}"] a.evt.g-rdv`)), 'le planning porte la pastille du rendez-vous demandé');
  verifier(/Rendez-vous demandés/.test(await equipe.textContent('.page aside')), 'et la liste « Rendez-vous demandés »');
  verifier(Boolean(await equipe.$('.calendrier .jour-ouvrir')) && (await equipe.$$('.cal-legende li')).length >= 8, 'le planning a la même grille cliquable et la même légende');
  await montrerJour(equipe, ISO2);
  await equipe.click(`.jour[data-jour="${ISO2}"] a.evt[data-evt="reunion:re-cal"]`);
  await equipe.waitForSelector('.modale--cal', { timeout: 8000 }).catch(() => {});
  verifier(/Revue du calendrier/.test(await equipe.$eval('.modale--cal', (el) => el.textContent).catch(() => '')), 'côté équipe, une pastille ouvre aussi son détail');
  await fermerTout(equipe);
  await montrerJour(equipe, ISO2);
  const vide2 = await equipe.$$eval('.jour.jour--vide', (els, min) => (els.map((e) => e.dataset.jour).filter((d) => d > min)[0] || ''), iso(auJour(3)));
  if (vide2) {
    await cliquerJour(equipe, vide2);
    verifier(Boolean(await equipe.$(`.voile[data-jour="${vide2}"] [data-programmer-jour="${vide2}"]`)) && texteVisible(await equipe.$eval(`.voile[data-jour="${vide2}"]`, (el) => el.textContent)), 'un jour vide propose à l équipe « Programmer une réunion ce jour-là »');
    await fermerTout(equipe);
  }

  console.log('\n== Cockpit : l équipe programme le rendez-vous depuis la fenêtre du jour');
  await cliquerJour(equipe, jourVide);
  await equipe.click(`.voile[data-jour="${jourVide}"] [data-programmer="${ticketId}"]`);
  await equipe.waitForSelector('#ed-forme', { timeout: 8000 });
  const prerempli = await equipe.evaluate(() => ({ titre: document.querySelector('#ed-titre').value, date: document.querySelector('#ed-date').value, odj: document.querySelector('#ed-ordreDuJour').value }));
  verifier(prerempli.titre === SUJET && prerempli.date === `${jourVide}T15:30` && /Les retours du banc/.test(prerempli.odj), 'la feuille de la réunion arrive préremplie : sujet, jour et heure, précisions', JSON.stringify(prerempli));
  await equipe.fill('#ed-lien', 'https://meet.google.com/rdv-banc');
  await equipe.click('button[type="submit"][form="ed-forme"]');
  let reunionId = '';
  const creee = await attendre(async () => {
    const r = ((await lire('reunions?pageSize=300')).documents || []).find((d) => str(d, 'ticket') === ticketId);
    if (r) reunionId = r.name.split('/').pop();
    return Boolean(r);
  }, 15000);
  const reunion = creee ? await lire(`reunions/${reunionId}`) : null;
  const dateReunion = reunion ? new Date(champ(reunion, 'date').timestampValue) : null;
  verifier(creee && str(reunion, 'projet') === 'atelier' && str(reunion, 'visibilite') === 'client' && dateReunion && iso(dateReunion) === jourVide && dateReunion.getHours() === 15 && dateReunion.getMinutes() === 30, 'la réunion est créée, visible du client, au jour et à l heure demandés, liée à la demande', reunion ? `${dateReunion} ${str(reunion, 'ticket')}` : 'aucune');
  verifier(await attendre(async () => str(await lire(`tickets/${ticketId}`), 'statut') === 'planifiee', 10000), 'la demande passe « planifiée »');
  verifier(await attendre(async () => ((await lire(`tickets/${ticketId}/messages?pageSize=50`)).documents || []).some((d) => /^Rendez-vous confirmé : .*15:30/.test(str(d, 'texte')) && champ(d, 'interne').booleanValue === false), 10000), 'et le client reçoit dans le fil de sa demande « Rendez-vous confirmé »');
  await pause(1200);
  verifier(!(await equipe.$(`.jour[data-jour="${jourVide}"] a.evt.g-rdv`)) && Boolean(await equipe.$(`.jour[data-jour="${jourVide}"] a.evt.g-reunion`)), 'dans le planning, la demande devient une réunion');

  console.log('\n== Hub : le client voit la réunion arriver, sans recharger');
  await montrerJour(page, jourVide);
  const vu = await attendre(async () => page.evaluate((j) => {
    const c = document.querySelector(`.jour[data-jour="${j}"]`);
    return Boolean(c && !c.querySelector('a.evt.g-rdv') && [...c.querySelectorAll('a.evt.g-reunion')].some((a) => /15:30/.test(a.textContent) && /Point calendrier du banc/.test(a.textContent)));
  }, jourVide), 15000);
  verifier(vu, 'la pastille « Rendez-vous demandé » cède la place à la réunion, à 15:30');
  await cliquerJour(page, jourVide);
  const jourClient = await page.$eval(`.voile[data-jour="${jourVide}"]`, (el) => el.textContent);
  verifier(/Réunion/.test(jourClient) && /15:30/.test(jourClient) && /Point calendrier du banc/.test(jourClient) && !/Rendez-vous demandé/i.test(jourClient), 'la fenêtre du jour montre la réunion programmée', jourClient.slice(0, 160));
  verifier(Boolean(await page.$(`.voile[data-jour="${jourVide}"] a[href="https://meet.google.com/rdv-banc"]`)), 'avec « Rejoindre »');
  await fermerTout(page);
  await aller(page, `#/projets/atelier/demandes/${ticketId}`, '[data-rdv-programme]');
  verifier(/Rendez-vous programmé le .*15:30/.test(await page.textContent('[data-rdv-programme]')) && Boolean(await page.$(`[data-rdv-programme] a[href="#/projets/atelier/reunions/${reunionId}"]`)), 'la fiche de sa demande dit « Rendez-vous programmé » et mène à la réunion');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  await nettoyer();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  for (const p of [page, equipe]) { if (p) { try { console.error('adresse :', p.url()); } catch (err) { /* rien */ } } }
  await nettoyer().catch(() => {});
  process.exit(2);
});
