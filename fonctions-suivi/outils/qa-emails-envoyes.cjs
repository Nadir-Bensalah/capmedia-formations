/* ==========================================================================
   CAPMEDIA CLIENT HUB · les e-mails envoyés, lus depuis le Cockpit

   La demande (06/10/2026) : voir les e-mails partis vers les clients, tels
   qu'ils les ont reçus, filtrables, sans jamais ouvrir la file « envois »
   à un navigateur.

   Ce que prouve cette suite :
   - le serveur (suiviAdmin, emailsEnvoyes et emailEnvoye) : l'administrateur
     lit la liste, du plus récent au plus ancien, découpée en pages de 50 ;
     « Clients » par défaut, sans les lettres de l'équipe ni les codes ; les
     filtres projet, destinataire, statut ; une lettre d'avant le 23/09 sans
     date de création reste dans la liste, à sa date d'envoi ; la lettre
     rendue est exactement celle du gabarit (courriels.rendre sur les mêmes
     variables) ; le code de connexion et le jeton d'invitation ne sortent
     jamais en clair ; un texte piégé reste du texte ;
   - les refus : un client, un agent sans la permission, une requête sans
     session : ni la liste, ni une lettre ; les règles ferment « envois » au
     client et à l'agent ;
   - l'écran : l'entrée « E-mails envoyés » dans la barre de
     l'administrateur, la liste et ses filtres, une lettre ouverte dans un
     cadre isolé (sandbox vide, aucun script), sa version texte ; le lien
     depuis l'onglet « Accès client » d'un projet ; un agent ne voit ni
     l'entrée ni la page, et la page n'appelle pas le serveur ; un client
     qui tape l'adresse retombe sur son Hub.

   Banc : émulateurs (Functions compris), site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour, appelAdmin } = require('./lib/session-banc.cjs');
const admin = require('../node_modules/firebase-admin');
const courriels = require('../courriels');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const docs = async (c) => ((((await lireRest(bdd(c), prop)) || {}).documents) || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, n) => ((((d || {}).fields || {})[n]) || {}).stringValue || '';
const attendre = async (fn, ms = 30000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(500); } return null; };
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=300')).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const aller = async (page, hash, selecteur, ms = 20000) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(selecteur, { timeout: ms }); await pause(800); };

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
const ADMIN = 'agent.essai@exemple.test'; const AGENT = 'agent.sans.droit@exemple.test';
const PAGINE = 'pagination.essai@exemple.test';
const CODE = '987654'; const JETON = 'JetonSecretDuBanc123';
const PIEGE = '<script>parent.__pirate = 1</script><img src="x" onerror="parent.__pirate = 2">';

(async () => {
  admin.initializeApp({ projectId: PROJET });
  const fs = admin.firestore();
  const T = (msAvant) => admin.firestore.Timestamp.fromMillis(Date.now() - msAvant);
  const MIN = 60 * 1000; const JOUR = 24 * 60 * MIN;

  console.log('\n== Les lettres du banc');
  /* La file part vide : les lettres du semis (simulées) n'ont rien à
     faire ici, et elles brouilleraient l'ordre attendu. */
  await vider('envois');
  /* Posées terminées (« envoye », « echec ») : le facteur ne touche qu'aux
     lettres « attente », il les laisse donc telles quelles. */
  const lettre = async (id, champs) => { await fs.doc(`envois/${id}`).set({ erreur: null, essais: 1, ...champs }); return id; };
  const devisVars = { numero: 'D-2026-0042', libelle: 'Refonte du tableau de bord', montant: 1200, ttc: 1200, tva: 0, projetNom: 'Atelier', clientNom: 'Camille Martin', echeance: '2026-11-30', lien: 'https://capmedia.app/suivi/hub#/finances/devis-42' };
  await lettre('qa-devis', { modele: 'devis', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: devisVars, etat: 'envoye', cree: T(10 * MIN), envoye: T(10 * MIN - 2000), brevo: '<qa-devis@brevo>', projet: 'atelier', evenement: 'devis' });
  await lettre('qa-echec', { modele: 'facture-retard', a: [{ email: LEA, nom: 'Léa Bernard' }], variables: { numero: 'F-2026-0007', libelle: 'Maintenance', reste: 300, tva: 0, echeance: '2026-09-30', projetNom: 'Boutique', clientNom: 'Léa Bernard' }, etat: 'echec', erreur: 'Brevo 401 : clé refusée', essais: 3, cree: T(20 * MIN), envoye: null, projet: 'boutique', evenement: 'facture-retard' });
  await lettre('qa-equipe', { modele: 'ticket-cree', a: [{ email: 'contact@capmedia.app', nom: 'Équipe Capmedia' }], variables: { cote: 'equipe', numero: 'ATELIER-099', titre: 'Alerte de l équipe', projetNom: 'Atelier', auteurNom: 'Camille Martin', auteurEmail: CAMILLE }, etat: 'envoye', cree: T(5 * MIN), envoye: T(5 * MIN), projet: 'atelier', evenement: 'ticket-cree' });
  await lettre('qa-code', { modele: 'code', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: { code: CODE, minutes: 10, equipe: false }, etat: 'envoye', cree: T(4 * MIN), envoye: T(4 * MIN) });
  await lettre('qa-piege', { modele: 'message-projet', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: { projetNom: 'Atelier', auteur: 'Alex <b>Durand</b>', texte: PIEGE, pieces: 0, lien: 'https://capmedia.app/suivi/hub' }, etat: 'envoye', cree: T(3 * MIN), envoye: T(3 * MIN), projet: 'atelier', evenement: 'message-projet' });
  await lettre('qa-invitation', { modele: 'invitation', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: { projetNom: 'Atelier', clientNom: 'Camille Martin', email: CAMILLE, role: 'responsable', lien: `https://capmedia.app/suivi/?i=${JETON}` }, etat: 'envoye', cree: T(30 * MIN), envoye: T(30 * MIN), projet: 'atelier', evenement: 'invitation' });
  /* Une lettre d'avant le 23/09/2026 : sa date de création est un map vide. */
  await lettre('qa-ancienne', { modele: 'statut', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: { numero: 'ATELIER-001', titre: 'Ancienne demande', statutAvant: 'en-cours', statutApres: 'resolu', projetNom: 'Atelier' }, etat: 'envoye', cree: {}, envoye: T(30 * JOUR), projet: 'atelier', evenement: 'statut' });
  /* Soixante lettres à une même adresse : deux pages. */
  const lot = fs.batch();
  for (let i = 0; i < 60; i += 1) {
    lot.set(fs.doc(`envois/qa-page-${String(i).padStart(2, '0')}`), { modele: 'statut', a: [{ email: PAGINE, nom: 'Page Essai' }], variables: { numero: `ATELIER-${100 + i}`, titre: `Lettre ${i}`, statutAvant: 'nouveau', statutApres: 'en-cours', projetNom: 'Atelier' }, etat: 'envoye', erreur: null, essais: 1, cree: T((2 + i) * JOUR), envoye: T((2 + i) * JOUR), projet: 'atelier', evenement: 'statut' });
  }
  await lot.commit();
  /* Une lettre « en file » : créée terminée, puis remise en attente (le
     facteur n'écoute que les créations). */
  await lettre('qa-attente', { modele: 'fichier', a: [{ email: CAMILLE, nom: 'Camille Martin' }], variables: { projetNom: 'Atelier', nom: 'maquette.pdf', categorie: 'Design', cote: 'client' }, etat: 'envoye', cree: T(2 * MIN), envoye: null, projet: 'atelier', evenement: 'fichier' });
  await pause(1500);
  await fs.doc('envois/qa-attente').update({ etat: 'attente' });

  /* L'agent sans la permission, sur le projet de l'atelier. */
  const ajout = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agent Sans Droit', role: 'agent', projets: ['atelier'] });
  verifier(ajout.code === 200, 'un agent est ajouté à l équipe, sans permission en plus', `${ajout.code} ${ajout.texte.slice(0, 160)}`);

  console.log('\n== Le serveur : la liste de l administrateur');
  const liste = async (corps, email = ADMIN) => appelAdmin('emailsEnvoyes', corps, { email });
  const l1 = await liste({});
  const ids = (r) => ((r.json || {}).lignes || []).map((l) => l.id);
  verifier(l1.code === 200 && l1.json && l1.json.filtres.public === 'client' && Array.isArray(l1.json.lignes), 'l administrateur lit la liste ; « Clients » par défaut', `${l1.code} ${l1.texte.slice(0, 160)}`);
  verifier(ids(l1).includes('qa-devis') && ids(l1).includes('qa-piege') && ids(l1).includes('qa-attente'), 'les lettres aux clients y sont');
  verifier(!ids(l1).includes('qa-equipe') && !ids(l1).includes('qa-code'), 'ni l alerte de l équipe, ni le code de connexion', ids(l1).filter((i) => /equipe|code/.test(i)).join(','));
  const dates = ((l1.json || {}).lignes || []).map((l) => l.quand || 0);
  verifier(dates.length > 1 && dates.every((d, i) => i === 0 || dates[i - 1] >= d), 'du plus récent au plus ancien');
  const ligneDevis = ((l1.json || {}).lignes || []).find((l) => l.id === 'qa-devis') || {};
  verifier(ligneDevis.objet === 'D-2026-0042 · Votre devis : Refonte du tableau de bord' && ligneDevis.projetNom && ligneDevis.evenementLibelle === 'Devis déposé' && ligneDevis.etat === 'envoye' && (ligneDevis.a || [])[0].email === CAMILLE, 'chaque ligne : objet, destinataire, projet, événement, statut', JSON.stringify(ligneDevis).slice(0, 300));
  const pub = (p) => liste({ public: p });
  const lEq = await pub('equipe'); const lCo = await pub('connexion'); const lTous = await pub('');
  verifier(ids(lEq).includes('qa-equipe') && !ids(lEq).includes('qa-devis'), '« Équipe » : l alerte de l équipe, pas le devis');
  verifier(ids(lCo).includes('qa-code'), '« Codes et connexions » : le code');
  const tousIds = ids(lTous).concat(ids(await liste({ public: '', page: 2 }))).concat(ids(await liste({ public: '', page: 3 })));
  verifier(tousIds.includes('qa-ancienne'), 'une lettre sans date de création reste dans la liste', String(lTous.json && lTous.json.total));
  const ancienne = (await liste({ destinataire: CAMILLE, statut: 'envoye', page: 1 })).json;
  const lAnc = ((ancienne || {}).lignes || []).find((l) => l.id === 'qa-ancienne');
  verifier(lAnc && lAnc.quand && Math.abs(lAnc.quand - (Date.now() - 30 * JOUR)) < 5 * MIN && lAnc.cree === null, 'rangée à sa date d envoi', JSON.stringify(lAnc && { quand: lAnc.quand, cree: lAnc.cree }));
  const fProjet = await liste({ projet: 'boutique' });
  verifier(fProjet.code === 200 && ids(fProjet).includes('qa-echec') && ((fProjet.json || {}).lignes || []).every((l) => l.projet === 'boutique'), 'filtre par projet', ids(fProjet).join(','));
  const fQui = await liste({ destinataire: LEA.toUpperCase() });
  verifier(ids(fQui).includes('qa-echec') && ((fQui.json || {}).lignes || []).every((l) => l.a.some((d) => d.email === LEA)), 'filtre par destinataire (casse ignorée)', ids(fQui).join(','));
  const fStatut = await liste({ statut: 'echec' });
  const lEchec = ((fStatut.json || {}).lignes || []).find((l) => l.id === 'qa-echec');
  verifier(lEchec && ((fStatut.json || {}).lignes || []).every((l) => l.etat === 'echec') && lEchec.essais === 3, 'filtre par statut : les échecs, avec leurs essais', ids(fStatut).join(','));
  const fAttente = await liste({ statut: 'attente' });
  verifier(ids(fAttente).includes('qa-attente'), 'une lettre encore en file est listée « En file »');
  const fac = (l1.json || {}).facettes || {};
  verifier((fac.projets || []).some((p) => p.id === 'atelier' && p.n > 0) && (fac.destinataires || []).some((d) => d.email === CAMILLE && d.nom === 'Camille Martin') && (fac.statuts || []).some((s) => s.cle === 'echec' && s.n >= 1), 'les filtres viennent avec leurs comptes');
  const p1 = await liste({ destinataire: PAGINE }); const p2 = await liste({ destinataire: PAGINE, page: 2 });
  verifier(p1.json && p1.json.total === 60 && p1.json.pages === 2 && p1.json.lignes.length === 50 && p2.json.lignes.length === 10, 'soixante lettres : deux pages, 50 puis 10', JSON.stringify(p1.json && { t: p1.json.total, p: p1.json.pages, n: p1.json.lignes.length }));
  verifier(!ids(p1).some((i) => ids(p2).includes(i)) && ids(p1)[0] === 'qa-page-00' && ids(p2)[9] === 'qa-page-59', 'sans doublon, de la plus récente à la plus ancienne', `${ids(p1)[0]} ${ids(p2)[9]}`);

  console.log('\n== Le serveur : une lettre, telle que reçue');
  const lire = async (id, email = ADMIN) => appelAdmin('emailEnvoye', { id }, { email });
  const dv = await lire('qa-devis');
  const e = (dv.json || {}).envoi || {};
  const attendu = courriels.rendre('devis', devisVars);
  verifier(dv.code === 200 && e.objet === attendu.objet && e.html === attendu.html && e.texte === attendu.texte, 'la lettre est celle du gabarit, à l octet près (objet, HTML, texte)', `${dv.code} ${e.objet}`);
  verifier(e.a && e.a[0].email === CAMILLE && e.etat === 'envoye' && e.brevo === '<qa-devis@brevo>' && e.cree && e.envoye && e.projet === 'atelier' && e.evenementLibelle === 'Devis déposé', 'avec ses informations d envoi', JSON.stringify({ ...e, html: undefined, texte: undefined }).slice(0, 300));
  const ec = ((await lire('qa-echec')).json || {}).envoi || {};
  verifier(ec.etat === 'echec' && ec.erreur === 'Brevo 401 : clé refusée' && ec.essais === 3, 'une lettre en échec dit son motif');
  const cd = await lire('qa-code');
  verifier(cd.code === 200 && !cd.texte.includes(CODE) && !lCo.texte.includes(CODE) && /•{6} est votre code de connexion/.test(((cd.json || {}).envoi || {}).objet || ''), 'le code de connexion ne sort jamais en clair, ni dans la liste ni dans la lettre', ((cd.json || {}).envoi || {}).objet);
  const inv = await lire('qa-invitation');
  verifier(inv.code === 200 && !inv.texte.includes(JETON) && !l1.texte.includes(JETON) && /\?i=…/.test(((inv.json || {}).envoi || {}).texte || '') && ((inv.json || {}).envoi || {}).masques.length === 1, 'ni le jeton d un lien d invitation', ((inv.json || {}).envoi || {}).masques);
  const pg = ((await lire('qa-piege')).json || {}).envoi || {};
  verifier(pg.html && !/<script|<img|<b>/i.test(pg.html) && pg.html.includes('&lt;script&gt;'), 'un texte piégé reste du texte dans la lettre');
  verifier((await lire('envois-absente')).code === 404 && (await lire('a/b')).code === 400, 'une lettre absente : 404 ; un identifiant bricolé : 400');

  console.log('\n== Les refus');
  const cl1 = await liste({}, CAMILLE); const cl2 = await lire('qa-devis', CAMILLE);
  verifier(cl1.code === 403 && cl2.code === 403 && !cl2.texte.includes('Votre devis'), 'un client : ni la liste, ni une lettre (403)', `${cl1.code} ${cl2.code}`);
  const ag1 = await liste({}, AGENT); const ag2 = await lire('qa-devis', AGENT);
  verifier(ag1.code === 403 && ag2.code === 403 && !ag2.texte.includes('Votre devis'), 'un agent sans la permission : ni la liste, ni une lettre (403)', `${ag1.code} ${ag2.code} ${ag1.texte.slice(0, 80)}`);
  const sans = await appelAdmin('emailsEnvoyes', {}, { email: null });
  verifier(sans.code === 401, 'sans session : 401', `${sans.code}`);
  const parRegles = async (email) => (await fetch(bdd('envois/qa-devis'), { headers: { Authorization: `Bearer ${await jetonPour(email)}` } })).status;
  const rc = await parRegles(CAMILLE); const ra = await parRegles(AGENT); const rad = await parRegles(ADMIN);
  verifier(rc === 403 && ra === 403 && rad === 403, 'les règles ferment « envois » au navigateur, administrateur compris', `${rc} ${ra} ${rad}`);

  console.log('\n== Le Cockpit de l administrateur');
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (er) => erreurs.push(er.message.slice(0, 160)));
  await connecter(page, ADMIN);
  verifier(Boolean(await page.$('#lat-corps [data-chemin="/emails"]')), 'l entrée « E-mails envoyés » est dans la barre de l administrateur');
  await aller(page, '#/emails', '[data-emails] tbody tr');
  const lignesEcran = await page.$$eval('[data-emails] tbody tr', (trs) => trs.map((t) => t.dataset.envoi));
  verifier(lignesEcran.includes('qa-devis') && !lignesEcran.includes('qa-equipe') && !lignesEcran.includes('qa-code'), 'la liste s ouvre sur les lettres aux clients', lignesEcran.slice(0, 6).join(','));
  verifier(lignesEcran.length === 50 && Boolean(await page.$('[data-page="2"]')), 'cinquante par page, et la page suivante', String(lignesEcran.length));
  const ligneTexte = (await page.textContent('[data-envoi="qa-devis"]')).replace(/\s+/g, ' ');
  verifier(/Camille Martin/.test(ligneTexte) && /camille\.essai@exemple\.test/.test(ligneTexte) && /Votre devis : Refonte du tableau de bord/.test(ligneTexte) && /Devis déposé/.test(ligneTexte) && /Envoyé/.test(ligneTexte) && /\d{4}/.test(ligneTexte), 'une ligne : date, destinataire, objet, projet, événement, statut', ligneTexte.slice(0, 200));
  const cellules = await page.$$eval('[data-emails] tbody td', (tds) => tds.map((t) => t.textContent.trim()));
  verifier(!cellules.some((c) => c === '' || /undefined|null|NaN/.test(c)), 'aucune case vide, ni « undefined », ni « null »', cellules.filter((c) => c === '' || /undefined|null|NaN/.test(c)).slice(0, 3).join('|'));
  await page.click('[data-public="equipe"]');
  await page.waitForSelector('[data-envoi="qa-equipe"]', { timeout: 15000 }).catch(() => {});
  verifier(Boolean(await page.$('[data-envoi="qa-equipe"]')) && !(await page.$('[data-envoi="qa-devis"]')) && /public=equipe/.test(page.url()), 'filtre « Équipe » : l alerte de l équipe, dans l adresse');
  await page.click('[data-public="tous"]'); await pause(1500);
  await page.selectOption('#f-statut', 'echec');
  await page.waitForFunction(() => /statut=echec/.test(location.hash) && document.querySelectorAll('[data-emails] tbody tr').length > 0 && [...document.querySelectorAll('[data-emails] [data-etat]')].every((p) => p.dataset.etat === 'echec'), null, { timeout: 15000 }).catch(() => {});
  const etats = await page.$$eval('[data-emails] [data-etat]', (els) => els.map((x) => x.dataset.etat));
  verifier(etats.length > 0 && etats.every((x) => x === 'echec') && Boolean(await page.$('[data-envoi="qa-echec"]')), 'filtre par statut : les échecs', etats.join(','));
  await page.click('[data-effacer]'); await pause(1500);
  await page.selectOption('#f-projet', 'boutique');
  await page.waitForFunction(() => /projet=boutique/.test(location.hash), null, { timeout: 15000 }).catch(() => {});
  await pause(1500);
  const lb = await page.$$eval('[data-emails] tbody tr', (trs) => trs.map((t) => t.dataset.envoi));
  verifier(lb.includes('qa-echec') && !lb.includes('qa-devis'), 'filtre par projet', lb.join(','));
  await page.click('[data-effacer]'); await pause(1500);
  await page.selectOption('#f-destinataire', PAGINE);
  await page.waitForFunction(() => /destinataire=/.test(location.hash) && document.querySelectorAll('[data-emails] tbody tr').length === 50, null, { timeout: 15000 }).catch(() => {});
  await page.click('[data-page="2"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-emails] tbody tr').length === 10, null, { timeout: 15000 }).catch(() => {});
  verifier((await page.$$('[data-emails] tbody tr')).length === 10 && /page=2/.test(page.url()), 'filtre par destinataire, puis page 2 : dix lettres', page.url());

  console.log('\n== Une lettre ouverte');
  await aller(page, '#/emails?public=client', '[data-ouvrir="qa-devis"]');
  await page.click('[data-ouvrir="qa-devis"]');
  await page.waitForSelector('iframe[data-apercu]', { timeout: 15000 }).catch(() => {});
  const sandbox = await page.$eval('iframe[data-apercu]', (f) => f.getAttribute('sandbox')).catch(() => null);
  verifier(sandbox === '', 'la lettre s ouvre dans un cadre sans aucune permission (sandbox vide)', String(sandbox));
  const titreModale = await page.textContent('.modale-tete h2').catch(() => '');
  verifier(titreModale === 'D-2026-0042 · Votre devis : Refonte du tableau de bord', 'l objet en titre', titreModale);
  const cadre = page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:srcdoc');
  const corpsLettre = cadre ? await cadre.evaluate(() => document.body.innerText).catch(() => '') : '';
  verifier(/Votre devis est disponible/.test(corpsLettre) && /Bonjour Camille Martin/.test(corpsLettre) && /D-2026-0042/.test(corpsLettre), 'le corps est rendu, tel que reçu', corpsLettre.slice(0, 120));
  const infos = (await page.textContent('[data-infos-envoi]')).replace(/\s+/g, ' ');
  verifier(/camille\.essai@exemple\.test/.test(infos) && /Envoyé/.test(infos) && /Devis déposé/.test(infos) && /<qa-devis@brevo>/.test(infos), 'avec ses informations d envoi', infos.slice(0, 200));
  await page.click('[data-version="texte"]');
  const brut = await page.textContent('pre[data-texte]').catch(() => '');
  verifier(brut === attendu.texte, 'la version texte, à l identique');
  await page.click('.modale-tete [data-fermer]'); await pause(500);

  await page.click('[data-ouvrir="qa-piege"]');
  await page.waitForSelector('iframe[data-apercu]', { timeout: 15000 }).catch(() => {});
  await pause(1500);
  const cadre2 = page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:srcdoc');
  const piege = cadre2 ? await cadre2.evaluate(() => ({ texte: document.body.innerText, scripts: document.querySelectorAll('script, img, b').length })).catch((er) => ({ texte: String(er), scripts: -1 })) : { texte: '', scripts: -1 };
  const pirate = await page.evaluate(() => window.__pirate);
  verifier(piege.scripts === 0 && /parent\.__pirate = 1/.test(piege.texte) && pirate === undefined, 'un texte piégé s affiche en texte : aucun script, aucune balise', JSON.stringify({ s: piege.scripts, p: pirate }));
  await page.click('.modale-tete [data-fermer]'); await pause(500);

  await page.click('[data-ouvrir="qa-invitation"]');
  await page.waitForSelector('[data-provenance]', { timeout: 15000 }).catch(() => {});
  const provenance = await page.textContent('[data-provenance]').catch(() => '');
  verifier(/Reconstituée/.test(provenance) && /jeton du lien d'invitation/.test(provenance) && !(await page.content()).includes(JETON), 'la lettre dit d où elle vient et ce qui est masqué', provenance.slice(0, 160));
  await page.click('.modale-tete [data-fermer]').catch(() => {}); await pause(500);

  console.log('\n== Depuis la fiche d un projet');
  await aller(page, '#/projets/atelier/acces', '[data-voir-emails]');
  await page.click('[data-voir-emails]');
  await page.waitForSelector('[data-emails] tbody tr', { timeout: 15000 }).catch(() => {});
  await pause(1000);
  const projets = await page.$$eval('[data-emails] tbody tr td:nth-child(4)', (tds) => tds.map((t) => t.textContent.trim()));
  verifier(/#\/emails\?projet=atelier/.test(page.url()) && projets.length > 0 && projets.every((p) => p === projets[0]) && (await page.$eval('#f-projet', (s) => s.value)) === 'atelier', 'l onglet « Accès client » mène aux e-mails du projet, filtrés', page.url());
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);

  console.log('\n== Un agent sans la permission');
  const ctxA = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  const appels = []; pa.on('request', (r) => { if (/suiviAdmin/.test(r.url()) && /emailsEnvoyes|emailEnvoye/.test(r.postData() || '')) appels.push(r.postData()); });
  await connecter(pa, AGENT);
  verifier(/cockpit/.test(pa.url()), 'l agent entre au Cockpit', pa.url());
  verifier(!(await pa.$('#lat-corps [data-chemin="/emails"]')), 'sa barre ne propose pas « E-mails envoyés »');
  await aller(pa, '#/emails', '.page-tete');
  await pause(1500);
  verifier(Boolean(await pa.$('[data-refus]')) && !(await pa.$('[data-emails]')), 'l adresse tapée : « réservée à l administration », aucune liste');
  await aller(pa, '#/projets/atelier/acces', '.page').catch(() => {});
  verifier(!(await pa.$('[data-voir-emails]')), 'ni le lien depuis le projet');
  verifier(appels.length === 0, 'et la page n a jamais appelé le serveur pour les lire', appels.join(' '));

  console.log('\n== Un client');
  const ctxC = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pc = await ctxC.newPage();
  const appelsC = []; pc.on('request', (r) => { if (/suiviAdmin/.test(r.url()) && /emailsEnvoyes|emailEnvoye/.test(r.postData() || '')) appelsC.push(r.postData()); });
  await connecter(pc, CAMILLE);
  await pc.goto(`${SITE}/suivi/cockpit#/emails`, { waitUntil: 'domcontentloaded' });
  await pc.waitForURL(/\/suivi\/hub/, { timeout: 20000 }).catch(() => {});
  await pause(2500);
  verifier(/\/suivi\/hub/.test(pc.url()) && !(await pc.$('[data-emails]')) && !(await pc.$('[data-chemin="/emails"]')), 'l adresse du Cockpit le renvoie à son Hub, sans la liste', pc.url());
  verifier(appelsC.length === 0, 'aucun appel aux lettres depuis son navigateur');

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (er) => {
  console.error(er);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-emails-envoyes-echec.png' }); } catch (x) { /* rien */ } }
  process.exit(2);
});
