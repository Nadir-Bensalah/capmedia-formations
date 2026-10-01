/* ==========================================================================
   CAPMEDIA CLIENT HUB · le coffre-fort d'un projet, de bout en bout

   Alex (équipe) crée le coffre d'Atelier : la phrase s'affiche une fois,
   ne se referme qu'une fois notée, et la base ne la contient pas. Il range
   un accès Stripe ; on relit la base de l'émulateur (REST, propriétaire) :
   aucun champ ne contient le service, l'identifiant, le mot de passe ni
   la note. Verrou à la main, au départ de l'onglet et après cinq minutes
   sans geste ; mauvaise phrase refusée, bonne phrase acceptée ; Touch ID
   simulé (authentificateur virtuel avec PRF) quand ce Chromium le permet ;
   renouvellement de la clé (trente et un accès rechiffrés d'un seul lot).
   Puis ce que la revue de sécurité du 01/10 a demandé : verrou quand
   l'onglet passe en arrière-plan, zone vidée, retour arrière sans rien
   d'affiché, pas de « Copier la phrase », presse-papiers vidé après trente
   secondes, champs que les gestionnaires de mots de passe ignorent, refus
   d'une version antérieure d'une entrée, enveloppes archivées en ajout
   seul, journal nommé par l'annuaire avec son côté, et le bandeau qui
   propose de renouveler la clé quand une personne qui l'a connue perd
   l'accès.

   Puis Camille, responsable d'Atelier, ouvre le même coffre avec la
   phrase. Léa (autre client), un collaborateur, un testeur, un agent d'un
   autre projet et un inconnu sont refusés par les règles, avec de vrais
   jetons. Camille repassée collaboratrice perd l'onglet et l'accès.

   WebAuthn exige un vrai domaine : la suite parle à http://localhost:8787.
   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
process.env.BANC_SITE = process.env.BANC_SITE || 'http://localhost:8787';
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const S = (v) => ({ stringValue: String(v) });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
const connecter = async (page, email) => {
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('#bouton-compte', { timeout: 25000 }).catch(() => {});
  await pause(1500);
};
const aller = async (page, chemin) => { await page.evaluate((c) => { location.hash = c; }, chemin); await pause(700); };
const etatCoffre = async (page, attendu, ms = 20000) => page.waitForSelector(`[data-coffre-etat="${attendu}"]`, { timeout: ms }).then(() => true).catch(() => false);
const uidDe = async (email) => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const ouvrirCompte = async (email) => {
  if (await uidDe(email)) return uidDe(email);
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=cle-du-banc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `Banc-${Date.now()}-x`, returnSecureToken: true }) });
  return ((await r.json()) || {}).localId || '';
};
/* Le statut HTTP d'une lecture ou d'une écriture au nom de quelqu'un : les
   règles jugent, comme pour le navigateur. */
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })).status;
const statutCommit = async (jeton, writes) => (await fetch(`${RACINE}:commit`, { method: 'POST', headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
const I = (v) => ({ integerValue: String(v) });
const entier = (d, n) => Number(champ(d, n).integerValue || 0);
const ecritureEntree = (chemin, extra = {}) => ({
  update: { name: nomDoc(chemin), fields: { v: I(1), g: I(1), n: I(1), iv: S('A'.repeat(16)), donnees: S('A'.repeat(364)), ...extra } },
  updateTransforms: [{ fieldPath: 'cree', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});
const ecritureJournal = (chemin, uid, cote) => ({
  update: { name: nomDoc(chemin), fields: { uid: S(uid), cote: S(cote), action: S('deverrouillage'), moyen: S('phrase') } },
  updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});
/* Tout ce que la base garde du coffre (et des journaux voisins), en un texte. */
const toutLeCoffre = async () => {
  const morceaux = [await lire('coffres/atelier'), await lire('coffres/atelier/entrees?pageSize=300'), await lire('coffres/atelier/appareils?pageSize=300'), await lire('coffres/atelier/journal?pageSize=300'), await lire('coffres/atelier/enveloppes?pageSize=300')];
  return JSON.stringify(morceaux);
};
const lignesJournal = async () => (((await lire('coffres/atelier/journal?pageSize=300')) || {}).documents || []).map((d) => ({ uid: str(d, 'uid'), cote: str(d, 'cote'), action: str(d, 'action'), moyen: str(d, 'moyen') }));

/* Les lignes du journal partent sans qu'on les attende : on les guette. */
const attendre = async (fn, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(400); } return false; };
const auJournal = (filtre) => attendre(async () => (await lignesJournal()).some(filtre));
const docsDe = async (c) => (((await lire(`${c}?pageSize=300`)) || {}).documents || []);
const dernierId = (d) => d.name.split('/').pop();
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const info = (m) => console.log(`  info   ${m}`);
let page = null;

const SECRET = 'Zx9-Secret-Coffre-42';
const SERVICE = 'Stripe Atelier';
const IDENTIFIANT = 'compta@atelier-nord.test';
const NOTE = 'Compte principal, double authentification par SMS';

/* La phrase s'affiche une fois : on la lit, on coche, on ferme. */
const lirePhraseEtFermer = async (p) => {
  await p.waitForSelector('[data-coffre-phrase]', { timeout: 60000 });
  const phrase = (await p.textContent('[data-coffre-phrase]')).trim().replace(/\s+/g, ' ');
  const bloque = await p.$eval('[data-phrase-ok]', (b) => b.disabled);
  const sansCroix = !(await p.$('.voile [data-fermer][aria-label="Fermer"]'));
  const sansCopier = !(await p.$('[data-copier-phrase]')) && !/Copier la phrase/.test(await p.textContent('.voile'));
  const texte = await p.textContent('.voile');
  await p.check('[data-phrase-notee]');
  await p.click('[data-phrase-ok]');
  await p.waitForSelector('[data-coffre-phrase]', { state: 'detached', timeout: 5000 }).catch(() => {});
  return { phrase, bloque, sansCroix, sansCopier, texte };
};
const deverrouiller = async (p, phrase) => {
  await p.fill('#coffre-mots', phrase);
  await p.click('[data-coffre-deverrouiller]');
};
const ouvrirSiFerme = async (p, phrase) => {
  if (await p.$('[data-coffre-etat="ouvert"]')) return true;
  await etatCoffre(p, 'verrouille', 10000);
  await deverrouiller(p, phrase);
  return etatCoffre(p, 'ouvert');
};
/* Un champ que les gestionnaires de mots de passe laissent tranquille. */
const champDiscret = (p, sel) => p.$eval(sel, (el) => ({
  type: el.type, auto: el.getAttribute('autocomplete'), op: el.hasAttribute('data-1p-ignore'), lp: el.getAttribute('data-lpignore'),
  masque: getComputedStyle(el).webkitTextSecurity || getComputedStyle(el).getPropertyValue('-webkit-text-security'), nom: `${el.name} ${el.id}`,
})).catch(() => null);
const discret = (c, masque = true) => c && c.type === 'text' && c.auto === 'off' && c.op && c.lp === 'true' && (!masque || c.masque === 'disc') && !/user|login|pass|mail|pwd/i.test(c.nom);
/* Le document qui passe en arrière-plan, comme quand on change d'onglet. */
const arrierePlan = (p, cache) => p.evaluate((oui) => {
  if (oui) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  else delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
}, cache);
/* Des accès posés directement depuis la page, avec la phrase connue : de
   quoi éprouver le renouvellement sur un vrai volume. */
const ajouterEnNombre = (p, phrase, nombre, uid) => p.evaluate(async ({ phrase: ph, nombre: n, uid: u }) => {
  const C = await import('./assets/js/coffre-chiffre.js');
  const N = await import('./assets/js/noyau.js');
  const D = await import('./assets/js/donnees.js');
  const meta = (await N.getDoc(N.doc(N.bdd, 'coffres', 'atelier'))).data();
  const cle = await C.ouvrirAvecPhrase('atelier', meta, ph);
  const session = { utilisateur: { uid: u }, equipe: { nom: 'banc' } };
  for (let i = 0; i < n; i += 1) {
    const id = D.coffre.nouvelId('atelier');
    const ch = await C.chiffrerEntree('atelier', id, cle, { service: `Service banc ${i}`, identifiant: `compte-${i}`, motDePasse: `mdp-banc-${i}` }, { g: meta.enveloppe, n: 1 });
    await D.coffre.ecrireEntree('atelier', session, id, ch, true);
  }
  return true;
}, { phrase, nombre, uid });
const commitStatut = async (jeton, ecritures) => statutCommit(jeton, ecritures);
const majEntree = (chemin, champs, masque) => ({
  update: { name: nomDoc(chemin), fields: champs },
  updateMask: { fieldPaths: masque },
  updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: true },
});

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.coffre@exemple.test'; const AGENT_B = 'agent.boutique@exemple.test'; const TESTEUR = 'karim.testeur@essai.test';
  for (const c of ['entrees', 'appareils', 'journal', 'enveloppes']) await vider(`coffres/atelier/${c}`);
  await fetch(bdd('coffres/atelier'), { method: 'DELETE', headers: prop });

  /* Un collaborateur d'Atelier, et un agent affecté à Boutique seulement. */
  const uidCollab = await ouvrirCompte(COLLAB);
  const uidAgentB = await ouvrirCompte(AGENT_B);
  const uidCamille = await uidDe(CAMILLE);
  const uidAdmin = await uidDe(ADMIN);
  const atelier = await lire('projets/atelier');
  const membres = ((champ(atelier, 'membres').arrayValue || {}).values || []).map((v) => v.stringValue);
  const roles = (champ(atelier, 'roles').mapValue || {}).fields || {};
  await poser('projets/atelier', { membres: { arrayValue: { values: [...new Set([...membres, uidCollab])].map(S) } }, roles: { mapValue: { fields: { ...roles, [uidCollab]: S('collaborateur') } } } }, ['membres', 'roles']);
  await poser(`equipe/${uidAgentB}`, { nom: S('Agent Boutique'), email: S(AGENT_B), role: S('agent'), actif: { booleanValue: true }, projets: { arrayValue: { values: [S('boutique')] } } });
  const nomAdmin = str(await lire(`equipe/${uidAdmin}`), 'nom') || 'Alex';

  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1360, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== Alex (équipe) : un coffre absent, expliqué');
  await connecter(page, ADMIN);
  await aller(page, '#/projets/atelier/coffre');
  verifier(await etatCoffre(page, 'absent'), 'l onglet Coffre-fort s ouvre sur « pas encore de coffre »');
  verifier(/Coffre-fort/.test(await page.textContent('#onglets-projet').catch(() => '')), 'l onglet figure dans la barre du projet');
  const expl = await page.textContent('[data-coffre-etat]');
  verifier(/Même Capmedia ne peut pas lire ce coffre sans la phrase/.test(expl) && /le contenu est perdu/.test(expl), 'la page explique : même Capmedia ne peut pas lire, phrase perdue = contenu perdu');
  verifier(!/—/.test(expl), 'aucun tiret cadratin dans les textes du coffre');
  const det = await page.evaluate(() => import('./assets/js/coffre-appareil.js').then((m) => m.detecterPrf()).catch((e) => ({ etat: 'erreur', raison: e.message })));
  verifier(det && ['oui', 'peut-etre', 'non'].includes(det.etat) && (det.etat !== 'non' || /Safari 18|Touch ID/.test(det.raison)), `la détection PRF rend un état propre (${det && det.etat})`, det && det.raison);

  console.log('\n== Créer : la phrase, une seule fois, à recopier à la main');
  await page.click('[data-coffre="creer"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 10000 }); await page.click('.voile [data-oui]');
  const p1 = await lirePhraseEtFermer(page);
  const mots = p1.phrase.split(' ');
  verifier(mots.length >= 6 && mots.length <= 8 && mots.every((m) => /^[a-z]+$/.test(m)), `une phrase de ${mots.length} mots courants sans accent`, p1.phrase);
  verifier(p1.bloque && p1.sansCroix, 'la fenêtre ne se ferme qu après « j ai noté » (ni croix, ni Terminé actif)');
  verifier(p1.sansCopier && /Recopiez-la à la main/.test(p1.texte), 'pas de bouton « Copier la phrase » : elle se recopie à la main, sur papier');
  verifier(/Jamais par e-mail/.test(p1.texte) && /de vive voix ou sur papier/.test(p1.texte) && /plus jamais affichée/.test(p1.texte), 'l avertissement : transmettre à part, jamais par e-mail ni dans le Hub, affichée une fois');
  verifier(await etatCoffre(page, 'ouvert'), 'le coffre créé est ouvert pour son créateur');
  verifier(!(await page.content()).includes(p1.phrase), 'la phrase a disparu de la page');
  const coffreDoc = await lire('coffres/atelier');
  verifier(coffreDoc && entier(coffreDoc, 'iterations') >= 600000 && str(coffreDoc, 'kdf') === 'PBKDF2-SHA256' && str(coffreDoc, 'sel').length === 22, 'la base garde PBKDF2-SHA256, 600 000 tours, un sel');
  const archives0 = await docsDe('coffres/atelier/enveloppes');
  verifier(entier(coffreDoc, 'enveloppe') === 1 && archives0.length === 1 && dernierId(archives0[0]) === '1' && str(archives0[0], 'cle') === str(coffreDoc, 'cle'), 'l enveloppe n° 1 est archivée à la création');
  const porteurs0 = ((champ(coffreDoc, 'porteurs').arrayValue || {}).values || []).map((v) => v.stringValue);
  verifier(porteurs0.join() === `equipe:${uidAdmin}`, 'seul son créateur connaît la clé', porteurs0.join());
  const brut0 = await toutLeCoffre();
  verifier(!brut0.includes(p1.phrase) && mots.filter((m) => m.length >= 5).every((m) => !brut0.includes(m)), 'la base ne contient pas la phrase, ni ses mots');
  verifier(await auJournal((l) => l.action === 'creation' && l.uid === uidAdmin && l.cote === 'equipe'), 'le journal dit qui a créé le coffre');

  console.log('\n== Ranger un accès, dans des champs que les trousseaux ignorent');
  await page.click('[data-coffre="ajouter"]');
  await page.waitForSelector('#cf-service', { timeout: 10000 });
  verifier(!(await page.$('.voile input[type="password"]')), 'le formulaire n a aucun champ « mot de passe » au sens du navigateur');
  const cSecret = await champDiscret(page, '#cf-secret'); const cCompte = await champDiscret(page, '#cf-compte');
  verifier(discret(cSecret) && discret(cCompte, false), 'mot de passe masqué en CSS, autocomplete off, data-1p-ignore, data-lpignore, noms neutres', JSON.stringify(cSecret));
  await page.fill('#cf-service', SERVICE); await page.fill('#cf-adresse', 'https://dashboard.stripe.com');
  await page.fill('#cf-compte', IDENTIFIANT); await page.fill('#cf-secret', SECRET); await page.fill('#cf-note', NOTE);
  await page.click('[data-enregistrer]');
  await page.waitForSelector(`.coffre-entree:has-text("${SERVICE}")`, { timeout: 15000 }).catch(() => {});
  const liste = await page.textContent('[data-coffre-liste]').catch(() => '');
  verifier(liste.includes(SERVICE) && liste.includes(IDENTIFIANT) && liste.includes(NOTE), 'l accès est listé : service, identifiant, note');
  verifier(!liste.includes(SECRET) && /••••/.test(liste), 'le mot de passe est masqué');
  await page.click('[data-coffre="afficher"]'); await pause(200);
  verifier((await page.textContent('[data-valeur="mot-de-passe"]')).includes(SECRET), '« Afficher » le montre');
  await page.click('[data-coffre="afficher"]'); await pause(200);
  verifier(!(await page.textContent('[data-coffre-liste]')).includes(SECRET), '« Masquer » le cache à nouveau');
  await page.click('[data-coffre="copier-mdp"]'); await pause(400);
  verifier((await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')) === SECRET, '« Copier » met le mot de passe au presse-papiers');
  verifier(/vidé dans 30 secondes/.test(await page.textContent('.toasts').catch(() => '')), 'et le toast dit qu il sera vidé dans 30 secondes');
  const copieLe = Date.now();

  console.log('\n== La base ne contient rien en clair');
  const entrees = await docsDe('coffres/atelier/entrees');
  verifier(entrees.length === 1, 'une entrée en base');
  const champsEntree = entrees.length ? Object.keys(entrees[0].fields).sort().join(',') : '';
  verifier(champsEntree === 'cree,donnees,g,iv,maj,n,v', 'l entrée ne porte que v, g, n, iv, donnees et ses dates', champsEntree);
  verifier(entrees.length && entier(entrees[0], 'n') === 1 && entier(entrees[0], 'g') === 1, 'version 1, clé de génération 1');
  const brut = await toutLeCoffre();
  const fuites = [SECRET, SERVICE, 'Stripe', IDENTIFIANT, 'compta@', NOTE, 'double authentification', 'dashboard.stripe'].filter((t) => brut.includes(t));
  verifier(!fuites.length, 'aucun champ du coffre ne contient le secret, le service, l identifiant, le lien ou la note', fuites.join(', '));
  const ailleurs = JSON.stringify([await lire('activite?pageSize=300'), await lire('audit?pageSize=300'), await lire('envois?pageSize=300')]);
  verifier(![SECRET, IDENTIFIANT, NOTE].some((t) => ailleurs.includes(t)), 'ni l activité, ni l audit, ni les e-mails n en gardent trace');

  console.log('\n== Chercher');
  await page.fill('[data-coffre-recherche]', 'zzz'); await pause(200);
  verifier(/Aucun accès ne correspond/.test(await page.textContent('[data-coffre-liste]')), 'une recherche sans réponse le dit');
  await page.fill('[data-coffre-recherche]', 'stri'); await pause(200);
  verifier((await page.textContent('[data-coffre-liste]')).includes(SERVICE), 'une recherche partielle retrouve l accès');
  await page.fill('[data-coffre-recherche]', '');

  console.log('\n== Le presse-papiers se vide seul');
  await page.bringToFront();
  await pause(Math.max(0, 31500 - (Date.now() - copieLe)));
  verifier((await page.evaluate(() => navigator.clipboard.readText()).catch(() => 'illisible')) === '', 'trente secondes après la copie, le presse-papiers est vide');

  console.log('\n== Verrouiller, refuser, rouvrir');
  await page.click('[data-coffre="verrouiller"]');
  verifier(await etatCoffre(page, 'verrouille', 5000), '« Verrouiller » referme le coffre');
  const html = await page.content();
  verifier(![SECRET, IDENTIFIANT, NOTE].some((t) => html.includes(t)), 'verrouillé, la page ne contient plus rien en clair');
  verifier(/1 accès rangé, chiffré/.test(await page.textContent('[data-coffre-etat]')), 'verrouillé, il dit combien d accès il garde');
  const cPhrase = await champDiscret(page, '#coffre-mots');
  verifier(discret(cPhrase) && !(await page.$('[data-coffre-etat] input[type="password"]')), 'le champ de la phrase : texte masqué en CSS, ignoré des gestionnaires de mots de passe', JSON.stringify(cPhrase));
  const autre = ['lapin', 'girafe', 'violon', 'tomate', 'nuage', 'piano', 'cerise'].filter((m) => !mots.includes(m)).slice(0, mots.length).join(' ');
  await deverrouiller(page, autre); await pause(2500);
  verifier(await page.isVisible('[data-coffre-refus]') && /n'ouvre pas le coffre/.test(await page.textContent('[data-coffre-refus]')), 'une mauvaise phrase est refusée, et le dit');
  verifier(await page.$('[data-coffre-etat="verrouille"]'), 'le coffre reste fermé');
  verifier(await auJournal((l) => l.action === 'echec' && l.uid === uidAdmin), 'le refus est au journal');
  await deverrouiller(page, p1.phrase.toUpperCase());
  verifier(await etatCoffre(page, 'ouvert'), 'la bonne phrase (même en majuscules) rouvre le coffre');
  verifier((await page.textContent('[data-coffre-liste]')).includes(SERVICE), 'et l accès est relu');
  verifier(await auJournal((l) => l.action === 'deverrouillage' && l.moyen === 'phrase' && l.uid === uidAdmin), 'le journal dit qui a déverrouillé, et comment');
  const journal1 = await page.textContent('[data-coffre-journal]');
  verifier(journal1.includes(`${nomAdmin} (équipe Capmedia) a déverrouillé le coffre avec la phrase`), 'le journal nomme la personne et son côté (équipe Capmedia)', journal1.slice(0, 120));

  console.log('\n== Le journal prend le nom dans l annuaire, pas dans le document');
  await fetch(`${bdd('coffres/atelier/journal')}?documentId=forge`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { uid: S(uidAdmin), cote: S('equipe'), nom: S('Nom forgé'), action: S('appareil-retire'), moyen: S(''), date: { timestampValue: new Date().toISOString() } } }) });
  await attendre(async () => /a retiré un appareil/.test(await page.textContent('[data-coffre-journal]')));
  const journal2 = await page.textContent('[data-coffre-journal]');
  verifier(/a retiré un appareil/.test(journal2) && !journal2.includes('Nom forgé') && journal2.includes(nomAdmin), 'un nom glissé dans une ligne n est jamais affiché : celui de l annuaire l emporte');
  await fetch(bdd('coffres/atelier/journal/forge'), { method: 'DELETE', headers: prop });

  console.log('\n== Verrou : départ de l onglet, arrière-plan, cinq minutes, retour arrière');
  await aller(page, '#/projets/atelier/liens'); await pause(500);
  verifier(!(await page.content()).includes(IDENTIFIANT), 'l onglet quitté, la zone est vidée');
  await aller(page, '#/projets/atelier/coffre');
  verifier(await etatCoffre(page, 'verrouille'), 'quitter l onglet verrouille le coffre');
  await deverrouiller(page, p1.phrase);
  verifier(await etatCoffre(page, 'ouvert'), 'rouvert');
  await arrierePlan(page, true);
  const fermeArriere = await etatCoffre(page, 'verrouille', 5000);
  const htmlArriere = await page.content();
  await arrierePlan(page, false);
  verifier(fermeArriere && ![SECRET, IDENTIFIANT, NOTE].some((t) => htmlArriere.includes(t)), 'l onglet du navigateur passe en arrière-plan : verrouillé, rien en clair');
  await deverrouiller(page, p1.phrase); await etatCoffre(page, 'ouvert');
  /* Six minutes passent sans geste : on avance l'horloge de la page, sans
     un seul événement, et on attend le tour de garde (dix secondes). */
  await page.evaluate(() => { const vrai = Date.now.bind(Date); window.__dateVraie = vrai; Date.now = () => vrai() + 6 * 60 * 1000; });
  const ferme = await etatCoffre(page, 'verrouille', 16000);
  await page.evaluate(() => { if (window.__dateVraie) Date.now = window.__dateVraie; });
  verifier(ferme, 'cinq minutes sans geste : verrouillé tout seul');
  verifier(/cinq minutes/.test(await page.textContent('.toasts').catch(() => '')), 'et il le dit');
  await deverrouiller(page, p1.phrase); await etatCoffre(page, 'ouvert');
  await page.goto('about:blank');
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await pause(4000);
  const htmlRetour = await page.content();
  verifier(![SECRET, IDENTIFIANT, NOTE].some((t) => htmlRetour.includes(t)) && !(await page.$('[data-coffre-etat="ouvert"]')), 'retour arrière après un départ : rien n est réaffiché, le coffre est fermé');
  await aller(page, '#/projets/atelier/coffre');
  await etatCoffre(page, 'verrouille');

  console.log('\n== Touch ID ou Face ID (authentificateur virtuel avec PRF)');
  await deverrouiller(page, p1.phrase);
  await etatCoffre(page, 'ouvert');
  await page.waitForSelector('[data-prf]', { timeout: 10000 }).catch(() => {});
  const sansCapteur = await page.$('[data-prf="non"]');
  verifier(Boolean(sansCapteur) || det.etat !== 'non', 'sans capteur, la page le dit proprement et garde la phrase', (await page.textContent('.coffre-bas').catch(() => '')).slice(0, 140));
  let prfSimule = false;
  const cdp = await ctx.newCDPSession(page);
  let authenticatorId = null;
  try {
    await cdp.send('WebAuthn.enable');
    ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } }));
    prfSimule = true;
  } catch (e) { info(`PRF non simulable sur ce Chromium (${String(e.message).slice(0, 80)}) : seule la détection est contrôlée`); }
  if (prfSimule) {
    await aller(page, '#/projets/atelier/liens'); await aller(page, '#/projets/atelier/coffre');
    await etatCoffre(page, 'verrouille');
    await deverrouiller(page, p1.phrase); await etatCoffre(page, 'ouvert');
    await page.waitForSelector('[data-coffre="activer-appareil"]', { timeout: 10000 }).catch(() => {});
    if (await page.$('[data-coffre="activer-appareil"]')) {
      await page.click('[data-coffre="activer-appareil"]');
      await page.waitForSelector('[data-appareil]', { timeout: 15000 }).catch(() => {});
      await attendre(async () => (await docsDe('coffres/atelier/appareils')).length > 0);
      const apps = await docsDe('coffres/atelier/appareils');
      verifier(apps.length === 1 && str(apps[0], 'uid') === uidAdmin && entier(apps[0], 'g') === 1, 'l appareil est enregistré, au nom de son propriétaire, pour la clé en cours', await page.textContent('.toasts').catch(() => ''));
      const brutApp = JSON.stringify(apps);
      verifier(!brutApp.includes(SECRET) && !brutApp.includes(p1.phrase), 'sa copie de clé est chiffrée');
      await page.click('[data-coffre="verrouiller"]'); await etatCoffre(page, 'verrouille', 5000);
      const bouton = await page.$('[data-coffre="ouvrir-appareil"]');
      verifier(Boolean(bouton), 'verrouillé, « Avec Touch ID ou Face ID » est proposé');
      if (bouton) {
        await bouton.click();
        verifier(await etatCoffre(page, 'ouvert'), 'l empreinte rouvre le coffre, sans phrase');
        verifier((await page.textContent('[data-coffre-liste]').catch(() => '')).includes(SERVICE), 'et relit l accès');
        verifier(await auJournal((l) => l.action === 'deverrouillage' && l.moyen === 'appareil'), 'le journal dit « avec l empreinte »');
      }
    } else {
      info(`ce Chromium n annonce pas PRF malgré l authentificateur : ${(await page.textContent('.coffre-bas').catch(() => '')).slice(0, 120)}`);
    }
  }

  console.log('\n== Pas de retour à une version antérieure d une entrée');
  await ouvrirSiFerme(page, p1.phrase);
  await page.click('[data-coffre="ajouter"]'); await page.waitForSelector('#cf-service', { timeout: 10000 });
  await page.fill('#cf-service', 'Essai retour'); await page.fill('#cf-secret', 'ancien-secret');
  await page.click('[data-enregistrer]');
  await page.waitForSelector('.coffre-entree:has-text("Essai retour")', { timeout: 15000 }).catch(() => {});
  await attendre(async () => (await docsDe('coffres/atelier/entrees')).length === 2);
  const essaiId = await page.$eval('.coffre-entree:has-text("Essai retour")', (el) => el.dataset.entree).catch(() => '');
  const v1 = await lire(`coffres/atelier/entrees/${essaiId}`);
  await page.click(`[data-coffre="editer"][data-id="${essaiId}"]`); await page.waitForSelector('#cf-secret', { timeout: 10000 });
  await page.fill('#cf-secret', 'nouveau-secret'); await page.click('[data-enregistrer]');
  await attendre(async () => entier(await lire(`coffres/atelier/entrees/${essaiId}`), 'n') === 2);
  verifier(entier(await lire(`coffres/atelier/entrees/${essaiId}`), 'n') === 2, 'modifiée, l entrée passe en version 2');
  const jA = await jetonPour(ADMIN); const jC = await jetonPour(CAMILLE);
  const memeN = await commitStatut(jA, [majEntree(`coffres/atelier/entrees/${essaiId}`, { iv: S(str(v1, 'iv')), donnees: S(str(v1, 'donnees')), n: I(2) }, ['iv', 'donnees', 'n'])]);
  verifier(memeN === 403, `remettre l ancien chiffré sans monter n est refusé par les règles (${memeN})`);
  const creeN2 = await commitStatut(jA, [ecritureEntree('coffres/atelier/entrees/cree-en-v2', { n: I(2) })]);
  verifier(creeN2 === 403, `créer une entrée directement en version 2 est refusé (${creeN2})`);
  const rejoue = await commitStatut(jA, [majEntree(`coffres/atelier/entrees/${essaiId}`, { iv: S(str(v1, 'iv')), donnees: S(str(v1, 'donnees')), n: I(3) }, ['iv', 'donnees', 'n'])]);
  await page.waitForSelector(`[data-entree="${essaiId}"][data-illisible]`, { timeout: 10000 }).catch(() => {});
  verifier(rejoue === 200 && Boolean(await page.$(`[data-entree="${essaiId}"][data-illisible]`)) && !(await page.content()).includes('ancien-secret'), 'l ancien chiffré remis sous n = 3 passe les règles, mais le déchiffrement le refuse : « Entrée illisible »');
  await page.click(`[data-coffre="supprimer"][data-id="${essaiId}"]`); await page.waitForSelector('.voile [data-oui]', { timeout: 5000 }); await page.click('.voile [data-oui]');
  await attendre(async () => (await docsDe('coffres/atelier/entrees')).length === 1);

  console.log('\n== Les enveloppes : responsable ou équipe, archivées en ajout seul');
  const env0 = await lire('coffres/atelier');
  const majEnveloppe = (extra = {}) => ({
    update: { name: nomDoc('coffres/atelier'), fields: { sel: S('B'.repeat(22)), iv: S('B'.repeat(16)), cle: S('B'.repeat(64)), iterations: I(600000), enveloppe: I(entier(env0, 'enveloppe') + 1), porteurs: { arrayValue: { values: [S(`client:${uidCamille}`)] } }, ...extra } },
    updateMask: { fieldPaths: ['sel', 'iv', 'cle', 'iterations', 'enveloppe', 'porteurs'] },
    updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'phraseLe', setToServerValue: 'REQUEST_TIME' }],
  });
  const archive = (numero, extra = {}) => ({
    update: { name: nomDoc(`coffres/atelier/enveloppes/${numero}`), fields: { version: I(1), kdf: S('PBKDF2-SHA256'), iterations: I(600000), sel: S('B'.repeat(22)), iv: S('B'.repeat(16)), cle: S('B'.repeat(64)), par: S(uidCamille), ...extra } },
    updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  });
  const suivant = entier(env0, 'enveloppe') + 1;
  verifier(await commitStatut(jC, [majEnveloppe()]) === 403, 'une enveloppe posée sans son archive est refusée, même à la responsable');
  verifier(await commitStatut(jC, [majEnveloppe({ iterations: I(3000000) }), archive(suivant, { iterations: I(3000000) })]) === 403, 'une enveloppe à 3 000 000 tours est refusée (2 000 000 au plus)');
  verifier(await commitStatut(jC, [majEnveloppe({ iterations: I(100000) }), archive(suivant, { iterations: I(100000) })]) === 403, 'une enveloppe à 100 000 tours est refusée (600 000 au moins)');
  verifier(await commitStatut(jC, [archive(suivant + 5)]) === 403, 'une archive seule, hors de tout changement d enveloppe, est refusée');
  verifier(await commitStatut(jC, [{ update: { name: nomDoc('coffres/atelier/enveloppes/1'), fields: { cle: S('C'.repeat(64)) } }, updateMask: { fieldPaths: ['cle'] } }]) === 403, 'une enveloppe archivée ne se corrige pas');
  verifier(await commitStatut(jA, [{ delete: nomDoc('coffres/atelier/enveloppes/1') }]) === 403, 'ni ne s efface, même par l administrateur');
  verifier(str(await lire('coffres/atelier'), 'cle') === str(env0, 'cle'), 'le coffre n a pas bougé');

  console.log('\n== Renouveler la clé : trente et un accès rechiffrés d un seul lot');
  await ajouterEnNombre(page, p1.phrase, 30, uidAdmin);
  await attendre(async () => (await docsDe('coffres/atelier/entrees')).length === 31, 30000);
  await ouvrirSiFerme(page, p1.phrase);
  await attendre(async () => (await page.$$('.coffre-entree')).length === 31, 15000);
  verifier((await page.$$('.coffre-entree')).length === 31 && !(await page.$('[data-illisible]')), 'trente et un accès lisibles avant le renouvellement');
  const avant = Object.fromEntries((await docsDe('coffres/atelier/entrees')).map((d) => [dernierId(d), { donnees: str(d, 'donnees'), n: entier(d, 'n'), g: entier(d, 'g') }]));
  const envAvant = await lire('coffres/atelier');
  const explication = await page.textContent('.coffre-renouveler');
  verifier(/ne déchiffrent plus rien/.test(explication) && /reste connu/.test(explication), 'la page dit ce que le renouvellement fait, et ce qu il ne rattrape pas');
  await page.click('.coffre-renouveler [data-coffre="renouveler"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 10000 });
  const texteConfirm = await page.textContent('.voile');
  verifier(/clé neuve/.test(texteConfirm) && /il le garde/.test(texteConfirm) && !/aucune porte/i.test(texteConfirm), 'la confirmation dit exactement ce qui est vrai (clé neuve ; ce qui a été lu reste lu)');
  await page.click('.voile [data-oui]');
  const p2 = await lirePhraseEtFermer(page);
  verifier(p2.phrase !== p1.phrase && p2.phrase.split(' ').length === mots.length, 'une nouvelle phrase, montrée une fois');
  await attendre(async () => entier(await lire('coffres/atelier'), 'enveloppe') === entier(envAvant, 'enveloppe') + 1);
  const envApres = await lire('coffres/atelier');
  const g2 = entier(envApres, 'enveloppe');
  verifier(g2 === entier(envAvant, 'enveloppe') + 1 && str(envApres, 'cle') !== str(envAvant, 'cle'), 'l enveloppe change et son numéro monte d un');
  const apres = await docsDe('coffres/atelier/entrees');
  const toutes = apres.length === 31 && apres.every((d) => { const a = avant[dernierId(d)]; return a && str(d, 'donnees') !== a.donnees && entier(d, 'n') === a.n + 1 && entier(d, 'g') === g2; });
  verifier(toutes, 'les 31 entrées sont rechiffrées : chiffré neuf, n + 1, nouvelle génération de clé');
  const archives = await docsDe('coffres/atelier/enveloppes');
  verifier(archives.length === 2 && archives.some((d) => dernierId(d) === String(g2) && str(d, 'cle') === str(envApres, 'cle')) && archives.some((d) => str(d, 'cle') === str(envAvant, 'cle')), 'l ancienne et la nouvelle enveloppe sont archivées');
  verifier(!(await docsDe('coffres/atelier/appareils')).length, 'les appareils sont retirés');
  const porteurs1 = ((champ(envApres, 'porteurs').arrayValue || {}).values || []).map((v) => v.stringValue);
  verifier(porteurs1.join() === `equipe:${uidAdmin}`, 'seul l auteur du renouvellement connaît la nouvelle clé');
  verifier(await auJournal((l) => l.action === 'cle-renouvelee' && l.uid === uidAdmin), 'le journal dit qui a renouvelé la clé');
  await etatCoffre(page, 'ouvert');
  verifier((await page.$$('.coffre-entree')).length === 31 && !(await page.$('[data-illisible]')), 'le renouvellement fait, les 31 accès se relisent avec la clé neuve');
  await page.click('[data-coffre="verrouiller"]'); await etatCoffre(page, 'verrouille', 5000);
  await deverrouiller(page, p1.phrase); await pause(2500);
  verifier(await page.isVisible('[data-coffre-refus]'), 'l ancienne phrase n ouvre plus');
  await deverrouiller(page, p2.phrase);
  verifier(await etatCoffre(page, 'ouvert') && (await page.textContent('[data-coffre-liste]')).includes(SERVICE), 'la nouvelle ouvre, et relit les accès d avant');
  if (authenticatorId) await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});

  console.log('\n== Camille, responsable d Atelier');
  const ctxC = await nav.newContext({ viewport: { width: 1360, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const pc = await ctxC.newPage(); pc.on('pageerror', (e) => erreurs.push(`camille : ${e.message.slice(0, 140)}`));
  await connecter(pc, CAMILLE);
  await aller(pc, '#/projets/atelier/coffre');
  verifier(await etatCoffre(pc, 'verrouille'), 'Camille voit l onglet, coffre verrouillé');
  verifier(/Même Capmedia ne peut pas lire ce coffre sans la phrase/.test(await pc.textContent('[data-coffre-etat]')), 'avec la même explication');
  await deverrouiller(pc, p2.phrase);
  verifier(await etatCoffre(pc, 'ouvert'), 'la phrase transmise lui ouvre le coffre');
  verifier((await pc.textContent('[data-coffre-liste]').catch(() => '')).includes(IDENTIFIANT), 'elle lit l accès rangé par Capmedia');
  verifier(await auJournal((l) => l.action === 'deverrouillage' && l.uid === uidCamille && l.cote === 'client'), 'son ouverture est au journal, côté client');
  await attendre(async () => ((champ(await lire('coffres/atelier'), 'porteurs').arrayValue || {}).values || []).some((v) => v.stringValue === `client:${uidCamille}`));
  verifier(((champ(await lire('coffres/atelier'), 'porteurs').arrayValue || {}).values || []).some((v) => v.stringValue === `client:${uidCamille}`), 'elle s inscrit parmi ceux qui connaissent la clé');
  const journalC = await pc.textContent('[data-coffre-journal]');
  verifier(journalC.includes(`${nomAdmin} (équipe Capmedia)`) && /\(client\)/.test(journalC), 'côté client aussi, le journal nomme chacun avec son côté', journalC.slice(0, 160));
  verifier(!(await pc.$('[data-coffre="effacer"]')), 'elle ne peut pas effacer le coffre');

  console.log('\n== Les règles, avec de vrais jetons');
  const jL = await jetonPour(LEA); const jCo = await jetonPour(COLLAB);
  const jT = await jetonPour(TESTEUR); const jAB = await jetonPour(AGENT_B);
  const un = dernierId((await docsDe('coffres/atelier/entrees'))[0]);
  verifier(await statutLecture('coffres/atelier', jC) === 200 && await statutLecture(`coffres/atelier/entrees/${un}`, jC) === 200, 'Camille (responsable) lit le coffre et une entrée');
  verifier(await statutLecture('coffres/atelier', jA) === 200, 'Alex (administrateur) aussi');
  for (const [qui, j] of [['Léa (autre client)', jL], ['le collaborateur d Atelier', jCo], ['un testeur d Atelier', jT], ['un agent de Boutique', jAB], ['un inconnu', '']]) {
    const s1 = await statutLecture('coffres/atelier', j); const s2 = await statutLecture(`coffres/atelier/entrees/${un}`, j);
    const s3 = await statutLecture('coffres/atelier/journal', j); const s4 = await statutLecture('coffres/atelier/enveloppes/1', j);
    verifier(s1 === 403 && s2 === 403 && s3 === 403 && s4 === 403, `${qui} est refusé : coffre, entrée, journal, enveloppe (${s1}, ${s2}, ${s3}, ${s4})`);
  }
  verifier(await statutCommit(jL, [ecritureEntree('coffres/atelier/entrees/intrus', { g: I(g2) })]) === 403, 'Léa ne peut rien y écrire');
  verifier(await statutCommit(jCo, [ecritureEntree('coffres/atelier/entrees/intrus', { g: I(g2) })]) === 403, 'le collaborateur non plus');
  verifier(await statutCommit(jC, [ecritureEntree('coffres/atelier/entrees/en-clair', { g: I(g2), service: S('Stripe') })]) === 403, 'un champ en clair est refusé, même à la responsable');
  verifier(await statutCommit(jC, [ecritureEntree('coffres/atelier/entrees/vieille-cle', { g: I(g2 - 1) })]) === 403, 'une entrée écrite avec l ancienne génération de clé est refusée');
  verifier(await statutCommit(jC, [ecritureJournal('coffres/atelier/journal/faux', uidAdmin, 'client')]) === 403, 'une ligne de journal au nom d un autre est refusée');
  verifier(await statutCommit(jC, [{ update: { name: nomDoc('coffres/atelier/journal/nomme'), fields: { uid: S(uidCamille), cote: S('client'), nom: S('Pirate'), action: S('deverrouillage'), moyen: S('phrase') } }, updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }]) === 403, 'une ligne de journal qui porte un nom est refusée');
  verifier(await statutCommit(jC, [{ delete: nomDoc('coffres/atelier') }]) === 403, 'la responsable ne peut pas effacer le coffre');

  console.log('\n== Léa ne voit pas le coffre d Atelier ; sur son projet, elle a le sien');
  const ctxL = await nav.newContext({ viewport: { width: 1360, height: 900 } });
  const pl = await ctxL.newPage(); pl.on('pageerror', (e) => erreurs.push(`léa : ${e.message.slice(0, 140)}`));
  await connecter(pl, LEA);
  await aller(pl, '#/projets/atelier/coffre'); await pause(2500);
  verifier(!(await pl.$('[data-coffre-etat]')), 'l adresse du coffre d Atelier ne lui montre rien');
  await aller(pl, '#/projets/boutique/coffre');
  verifier(await etatCoffre(pl, 'absent'), 'sur Boutique, dont elle est responsable, l onglet existe');
  verifier(/n'a pas encore ouvert de coffre/.test(await pl.textContent('[data-coffre-etat]')) && !(await pl.$('[data-coffre="creer"]')), 'et dit que Capmedia ne l a pas encore créé (pas de bouton Créer côté client)');
  await ctxL.close();

  console.log('\n== Camille repassée collaboratrice : elle perd l accès, Capmedia est invité à renouveler la clé');
  await ouvrirSiFerme(page, p2.phrase);
  verifier(!(await page.$('[data-coffre-bandeau]')), 'tant que Camille est responsable, aucun bandeau');
  const rolesC = (champ(await lire('projets/atelier'), 'roles').mapValue || {}).fields || {};
  await poser('projets/atelier', { roles: { mapValue: { fields: { ...rolesC, [uidCamille]: S('collaborateur') } } } }, ['roles']);
  await attendre(async () => !(await pc.$('[data-coffre-etat]')), 10000);
  verifier(!(await pc.$('[data-coffre-etat]')) && !/Coffre-fort/.test(await pc.textContent('#onglets-projet').catch(() => '')), 'l onglet disparaît en direct, et le coffre avec');
  verifier(!(await pc.content()).includes(IDENTIFIANT), 'plus rien en clair dans sa page');
  verifier(await statutLecture('coffres/atelier', await jetonPour(CAMILLE)) === 403, 'et les règles la refusent');
  await page.waitForSelector('[data-coffre-bandeau]', { timeout: 10000 }).catch(() => {});
  const bandeau = await page.textContent('[data-coffre-bandeau]').catch(() => '');
  verifier(/Camille/.test(bandeau) && /\(client\)/.test(bandeau) && /n'a plus accès au projet/.test(bandeau) && /reste connu/.test(bandeau), 'le bandeau nomme Camille (client), propose de renouveler, et dit ce qui reste connu', bandeau.slice(0, 160));
  await page.click('[data-coffre-bandeau] [data-coffre="renouveler"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 10000 }); await page.click('.voile [data-oui]');
  const p3 = await lirePhraseEtFermer(page);
  await attendre(async () => entier(await lire('coffres/atelier'), 'enveloppe') === g2 + 1);
  verifier(entier(await lire('coffres/atelier'), 'enveloppe') === g2 + 1 && p3.phrase !== p2.phrase, 'renouvelée depuis le bandeau : nouvelle enveloppe, nouvelle phrase');
  await attendre(async () => !(await page.$('[data-coffre-bandeau]')), 10000);
  verifier(!(await page.$('[data-coffre-bandeau]')), 'le bandeau disparaît : plus personne d autre ne connaît la clé');
  await poser('projets/atelier', { roles: { mapValue: { fields: { ...rolesC, [uidCamille]: S('responsable') } } } }, ['roles']);
  await ctxC.close();

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-coffre-echec.png' }); console.error('capture : /tmp/qa-coffre-echec.png'); } catch (err) { /* rien */ } }
  process.exit(2);
});
