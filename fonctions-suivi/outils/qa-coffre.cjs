/* ==========================================================================
   CAPMEDIA CLIENT HUB · le coffre-fort d'un projet, de bout en bout

   Alex (équipe) crée le coffre d'Atelier : la phrase s'affiche une fois,
   ne se referme qu'une fois notée, et la base ne la contient pas. Il range
   un accès Stripe ; on relit la base de l'émulateur (REST, propriétaire) :
   aucun champ ne contient le service, l'identifiant, le mot de passe ni
   la note. Verrou à la main, au départ de l'onglet et après cinq minutes
   sans geste ; mauvaise phrase refusée, bonne phrase acceptée ; Touch ID
   simulé (authentificateur virtuel avec PRF) quand ce Chromium le permet ;
   changement de phrase, qui ne réécrit pas les entrées.

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
const ecritureEntree = (chemin, extra = {}) => ({
  update: { name: nomDoc(chemin), fields: { v: { integerValue: '1' }, iv: S('A'.repeat(16)), donnees: S('A'.repeat(364)), ...extra } },
  updateTransforms: [{ fieldPath: 'cree', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});
const ecritureJournal = (chemin, uid, cote) => ({
  update: { name: nomDoc(chemin), fields: { uid: S(uid), nom: S('x'), cote: S(cote), action: S('deverrouillage'), moyen: S('phrase') } },
  updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});
/* Tout ce que la base garde du coffre (et des journaux voisins), en un texte. */
const toutLeCoffre = async () => {
  const morceaux = [await lire('coffres/atelier'), await lire('coffres/atelier/entrees?pageSize=300'), await lire('coffres/atelier/appareils?pageSize=300'), await lire('coffres/atelier/journal?pageSize=300')];
  return JSON.stringify(morceaux);
};
const lignesJournal = async () => (((await lire('coffres/atelier/journal?pageSize=300')) || {}).documents || []).map((d) => ({ uid: str(d, 'uid'), cote: str(d, 'cote'), action: str(d, 'action'), moyen: str(d, 'moyen') }));

/* Les lignes du journal partent sans qu'on les attende : on les guette. */
const attendre = async (fn, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(400); } return false; };
const auJournal = (filtre) => attendre(async () => (await lignesJournal()).some(filtre));
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
  await p.waitForSelector('[data-coffre-phrase]', { timeout: 30000 });
  const phrase = (await p.textContent('[data-coffre-phrase]')).trim().replace(/\s+/g, ' ');
  const bloque = await p.$eval('[data-phrase-ok]', (b) => b.disabled);
  const sansCroix = !(await p.$('.voile [data-fermer][aria-label="Fermer"]'));
  await p.click('[data-copier-phrase]'); await pause(300);
  const presse = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const texte = await p.textContent('.voile');
  await p.check('[data-phrase-notee]');
  await p.click('[data-phrase-ok]');
  await p.waitForSelector('[data-coffre-phrase]', { state: 'detached', timeout: 5000 }).catch(() => {});
  return { phrase, bloque, sansCroix, presse, texte };
};
const deverrouiller = async (p, phrase) => {
  await p.fill('#coffre-phrase', phrase);
  await p.click('[data-coffre-deverrouiller]');
};

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.coffre@exemple.test'; const AGENT_B = 'agent.boutique@exemple.test'; const TESTEUR = 'karim.testeur@essai.test';
  await vider('coffres/atelier/entrees'); await vider('coffres/atelier/appareils'); await vider('coffres/atelier/journal');
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

  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1360, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  console.log('\n== Alex (équipe) : un coffre absent, expliqué');
  await connecter(page, ADMIN);
  await aller(page, '#/projets/atelier/coffre');
  verifier(await etatCoffre(page, 'absent'), 'l onglet Coffre-fort s ouvre sur « pas encore de coffre »');
  const ongletsAdmin = await page.textContent('#onglets-projet').catch(() => '');
  verifier(/Coffre-fort/.test(ongletsAdmin), 'l onglet figure dans la barre du projet');
  const expl = await page.textContent('[data-coffre-etat]');
  verifier(/Même Capmedia ne peut pas lire ce coffre sans la phrase/.test(expl) && /le contenu est perdu/.test(expl), 'la page explique : même Capmedia ne peut pas lire, phrase perdue = contenu perdu');
  verifier(!/—/.test(expl), 'aucun tiret cadratin dans les textes du coffre');
  const det = await page.evaluate(() => import('./assets/js/coffre-appareil.js').then((m) => m.detecterPrf()).catch((e) => ({ etat: 'erreur', raison: e.message })));
  verifier(det && ['oui', 'peut-etre', 'non'].includes(det.etat) && (det.etat !== 'non' || /Safari 18|Touch ID/.test(det.raison)), `la détection PRF rend un état propre (${det && det.etat})`, det && det.raison);

  console.log('\n== Créer : la phrase, une seule fois');
  await page.click('[data-coffre="creer"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 10000 }); await page.click('.voile [data-oui]');
  const p1 = await lirePhraseEtFermer(page);
  const mots = p1.phrase.split(' ');
  verifier(mots.length >= 6 && mots.length <= 8 && mots.every((m) => /^[a-z]+$/.test(m)), `une phrase de ${mots.length} mots courants sans accent`, p1.phrase);
  verifier(p1.bloque && p1.sansCroix, 'la fenêtre ne se ferme qu après « j ai noté » (ni croix, ni Terminé actif)');
  verifier(p1.presse === p1.phrase, 'le bouton copie la phrase');
  verifier(/Jamais par e-mail/.test(p1.texte) && /de vive voix ou sur papier/.test(p1.texte) && /plus jamais affichée/.test(p1.texte), 'l avertissement : transmettre à part, jamais par e-mail ni dans le Hub, affichée une fois');
  verifier(await etatCoffre(page, 'ouvert'), 'le coffre créé est ouvert pour son créateur');
  verifier(!(await page.content()).includes(p1.phrase), 'la phrase a disparu de la page');
  const coffreDoc = await lire('coffres/atelier');
  verifier(coffreDoc && Number(champ(coffreDoc, 'iterations').integerValue) >= 600000 && str(coffreDoc, 'kdf') === 'PBKDF2-SHA256' && str(coffreDoc, 'sel').length === 22, 'la base garde PBKDF2-SHA256, 600 000 tours, un sel');
  const brut0 = await toutLeCoffre();
  verifier(!brut0.includes(p1.phrase) && mots.filter((m) => m.length >= 5).every((m) => !brut0.includes(m)), 'la base ne contient pas la phrase, ni ses mots');
  verifier(await auJournal((l) => l.action === 'creation' && l.uid === uidAdmin && l.cote === 'equipe'), 'le journal dit qui a créé le coffre');

  console.log('\n== Ranger un accès');
  await page.click('[data-coffre="ajouter"]');
  await page.waitForSelector('#cf-service', { timeout: 10000 });
  await page.fill('#cf-service', SERVICE); await page.fill('#cf-lien', 'https://dashboard.stripe.com');
  await page.fill('#cf-identifiant', IDENTIFIANT); await page.fill('#cf-mdp', SECRET); await page.fill('#cf-note', NOTE);
  await page.click('[data-enregistrer]');
  await page.waitForSelector(`.coffre-entree:has-text("${SERVICE}")`, { timeout: 15000 }).catch(() => {});
  const liste = await page.textContent('[data-coffre-liste]').catch(() => '');
  verifier(liste.includes(SERVICE) && liste.includes(IDENTIFIANT) && liste.includes(NOTE), 'l accès est listé : service, identifiant, note');
  verifier(!liste.includes(SECRET) && /••••/.test(liste), 'le mot de passe est masqué');
  await page.click('[data-coffre="afficher"]'); await pause(200);
  verifier((await page.textContent('[data-valeur="mot-de-passe"]')).includes(SECRET), '« Afficher » le montre');
  await page.click('[data-coffre="afficher"]'); await pause(200);
  verifier(!(await page.textContent('[data-coffre-liste]')).includes(SECRET), '« Masquer » le cache à nouveau');
  await page.click('[data-coffre="copier-mdp"]'); await pause(300);
  verifier((await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')) === SECRET, '« Copier » met le mot de passe au presse-papiers');
  await pause(800);

  console.log('\n== La base ne contient rien en clair');
  const entrees = ((await lire('coffres/atelier/entrees?pageSize=50')) || {}).documents || [];
  verifier(entrees.length === 1, 'une entrée en base');
  const champsEntree = entrees.length ? Object.keys(entrees[0].fields).sort().join(',') : '';
  verifier(champsEntree === 'cree,donnees,iv,maj,v', 'l entrée ne porte que v, iv, donnees et ses dates', champsEntree);
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

  console.log('\n== Verrouiller, refuser, rouvrir');
  await page.click('[data-coffre="verrouiller"]');
  verifier(await etatCoffre(page, 'verrouille', 5000), '« Verrouiller » referme le coffre');
  const html = await page.content();
  verifier(![SECRET, IDENTIFIANT, NOTE].some((t) => html.includes(t)), 'verrouillé, la page ne contient plus rien en clair');
  verifier(/1 accès rangé, chiffré/.test(await page.textContent('[data-coffre-etat]')), 'verrouillé, il dit combien d accès il garde');
  const autre = ['lapin', 'girafe', 'violon', 'tomate', 'nuage', 'piano', 'cerise'].filter((m) => !mots.includes(m)).slice(0, mots.length).join(' ');
  await deverrouiller(page, autre); await pause(2500);
  verifier(await page.isVisible('[data-coffre-refus]') && /n'ouvre pas le coffre/.test(await page.textContent('[data-coffre-refus]')), 'une mauvaise phrase est refusée, et le dit');
  verifier(await page.$('[data-coffre-etat="verrouille"]'), 'le coffre reste fermé');
  verifier(await auJournal((l) => l.action === 'echec' && l.uid === uidAdmin), 'le refus est au journal');
  await deverrouiller(page, p1.phrase.toUpperCase());
  verifier(await etatCoffre(page, 'ouvert'), 'la bonne phrase (même en majuscules) rouvre le coffre');
  verifier((await page.textContent('[data-coffre-liste]')).includes(SERVICE), 'et l accès est relu');
  verifier(await auJournal((l) => l.action === 'deverrouillage' && l.moyen === 'phrase' && l.uid === uidAdmin), 'le journal dit qui a déverrouillé, et comment');
  verifier(/a déverrouillé le coffre avec la phrase/.test(await page.textContent('[data-coffre-journal]')), 'la page montre le journal, sans contenu');

  console.log('\n== Verrou au départ de l onglet, et après cinq minutes');
  await aller(page, '#/projets/atelier/liens'); await pause(500);
  await aller(page, '#/projets/atelier/coffre');
  verifier(await etatCoffre(page, 'verrouille'), 'quitter l onglet verrouille le coffre');
  await deverrouiller(page, p1.phrase);
  verifier(await etatCoffre(page, 'ouvert'), 'rouvert');
  /* Six minutes passent sans geste : on avance l'horloge de la page, sans
     un seul événement, et on attend le tour de garde (dix secondes). */
  await page.evaluate(() => { const vrai = Date.now.bind(Date); window.__dateVraie = vrai; Date.now = () => vrai() + 6 * 60 * 1000; });
  const ferme = await etatCoffre(page, 'verrouille', 16000);
  await page.evaluate(() => { if (window.__dateVraie) Date.now = window.__dateVraie; });
  verifier(ferme, 'cinq minutes sans geste : verrouillé tout seul');
  verifier(/cinq minutes/.test(await page.textContent('.toasts').catch(() => '')), 'et il le dit');
  await pause(1500);

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
      await attendre(async () => ((((await lire('coffres/atelier/appareils?pageSize=10')) || {}).documents) || []).length > 0);
      const apps = ((await lire('coffres/atelier/appareils?pageSize=10')) || {}).documents || [];
      verifier(apps.length === 1 && str(apps[0], 'uid') === uidAdmin, 'l appareil est enregistré, au nom de son propriétaire', await page.textContent('.toasts').catch(() => ''));
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

  console.log('\n== Changer la phrase : les entrées ne bougent pas');
  if (!(await page.$('[data-coffre-etat="ouvert"]'))) { await deverrouiller(page, p1.phrase); await etatCoffre(page, 'ouvert'); }
  const avant = (((await lire('coffres/atelier/entrees?pageSize=50')) || {}).documents || []).map((d) => str(d, 'donnees')).join('|');
  const envAvant = str(await lire('coffres/atelier'), 'cle');
  await page.click('[data-coffre="menu"]'); await page.click('.menu button:has-text("Changer la phrase")');
  await page.waitForSelector('.voile [data-oui]', { timeout: 10000 }); await page.click('.voile [data-oui]');
  const p2 = await lirePhraseEtFermer(page);
  verifier(p2.phrase !== p1.phrase && p2.phrase.split(' ').length === mots.length, 'une nouvelle phrase, montrée une fois');
  await pause(800);
  const apres = (((await lire('coffres/atelier/entrees?pageSize=50')) || {}).documents || []).map((d) => str(d, 'donnees')).join('|');
  verifier(apres === avant && str(await lire('coffres/atelier'), 'cle') !== envAvant, 'seule l enveloppe change, les entrées sont intactes');
  verifier(!((((await lire('coffres/atelier/appareils?pageSize=10')) || {}).documents) || []).length, 'les appareils sont retirés');
  await page.click('[data-coffre="verrouiller"]'); await etatCoffre(page, 'verrouille', 5000);
  await deverrouiller(page, p1.phrase); await pause(2500);
  verifier(await page.isVisible('[data-coffre-refus]'), 'l ancienne phrase n ouvre plus');
  await deverrouiller(page, p2.phrase);
  verifier(await etatCoffre(page, 'ouvert'), 'la nouvelle ouvre, et relit les accès d avant');
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
  verifier(!(await pc.$('[data-coffre="effacer"]')), 'elle ne peut pas effacer le coffre');

  console.log('\n== Les règles, avec de vrais jetons');
  const jC = await jetonPour(CAMILLE); const jL = await jetonPour(LEA); const jCo = await jetonPour(COLLAB);
  const jT = await jetonPour(TESTEUR); const jAB = await jetonPour(AGENT_B); const jA = await jetonPour(ADMIN);
  const un = entrees.length ? entrees[0].name.split('/').pop() : 'x';
  verifier(await statutLecture('coffres/atelier', jC) === 200 && await statutLecture(`coffres/atelier/entrees/${un}`, jC) === 200, 'Camille (responsable) lit le coffre et une entrée');
  verifier(await statutLecture('coffres/atelier', jA) === 200, 'Alex (administrateur) aussi');
  for (const [qui, j] of [['Léa (autre client)', jL], ['le collaborateur d Atelier', jCo], ['un testeur d Atelier', jT], ['un agent de Boutique', jAB], ['un inconnu', '']]) {
    const s1 = await statutLecture('coffres/atelier', j); const s2 = await statutLecture(`coffres/atelier/entrees/${un}`, j);
    const s3 = await statutLecture('coffres/atelier/journal', j);
    verifier(s1 === 403 && s2 === 403 && s3 === 403, `${qui} est refusé : coffre, entrée, journal (${s1}, ${s2}, ${s3})`);
  }
  verifier(await statutCommit(jL, [ecritureEntree('coffres/atelier/entrees/intrus')]) === 403, 'Léa ne peut rien y écrire');
  verifier(await statutCommit(jCo, [ecritureEntree('coffres/atelier/entrees/intrus')]) === 403, 'le collaborateur non plus');
  verifier(await statutCommit(jC, [ecritureEntree('coffres/atelier/entrees/en-clair', { service: S('Stripe') })]) === 403, 'un champ en clair est refusé, même à la responsable');
  verifier(await statutCommit(jC, [ecritureJournal('coffres/atelier/journal/faux', uidAdmin, 'client')]) === 403, 'une ligne de journal au nom d un autre est refusée');
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

  console.log('\n== Camille repassée collaboratrice perd l onglet et l accès');
  const rolesC = (champ(await lire('projets/atelier'), 'roles').mapValue || {}).fields || {};
  await poser('projets/atelier', { roles: { mapValue: { fields: { ...rolesC, [uidCamille]: S('collaborateur') } } } }, ['roles']);
  await attendre(async () => !(await pc.$('[data-coffre-etat]')), 10000);
  verifier(!(await pc.$('[data-coffre-etat]')) && !/Coffre-fort/.test(await pc.textContent('#onglets-projet').catch(() => '')), 'l onglet disparaît en direct, et le coffre avec');
  verifier(!(await pc.content()).includes(IDENTIFIANT), 'plus rien en clair dans sa page');
  verifier(await statutLecture('coffres/atelier', await jetonPour(CAMILLE)) === 403, 'et les règles la refusent');
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
