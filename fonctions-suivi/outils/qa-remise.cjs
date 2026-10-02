/* ==========================================================================
   CAPMEDIA CLIENT HUB · les points de code de l'audit de remise (02/10/2026)

   1. Les e-mails ont leurs accents : chaque modèle est rendu, son objet et
      son texte passés au crible ; l'e-mail du code est relu mot pour mot.
   2. « Inviter un collègue » dit la vérité : e-mails du projet coupés, la
      fenêtre prévient et donne le lien à copier, et aucune invitation ne
      part ; e-mails actifs, l'invitation part.
   3. Le champ « technique » quitte les parties : la règle refuse qu'il
      revienne ou qu'il change, une ancienne partie reste modifiable, et la
      migration (à blanc, pour de vrai, rejouée, annulée) range sans perte.
   4. Aucune date vide à l'écran : point bloquant, versions, cartes des
      parties, avec des dates écrasées en objet vide comme en production.

   Banc : émulateurs, site local, semer-suivi.
     node fonctions-suivi/outils/qa-remise.cjs
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) });
const M = (fields) => ({ mapValue: { fields } }); const A = (values) => ({ arrayValue: { values } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const destinataires = (d) => ((champ(d, 'a').arrayValue || {}).values || []).map((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue || '');
const dernierCode = async (e) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=300');
    const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && destinataires(d).includes(e));
    if (p.length) {
      p.sort((x, y) => new Date(y.createTime) - new Date(x.createTime));
      const v = ((champ(p[0], 'variables').mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
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
const ilYA = (j) => new Date(Date.now() - j * 86400000);

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* ==========================================================================
   1. Les accents des e-mails
   ========================================================================== */
const accents = () => {
  console.log('\n1. Les e-mails ont leurs accents');
  const { MODELES, rendre } = require('../courriels.js');
  /* Des variables pleines, pour que chaque branche parle. */
  const v = {
    projetNom: 'Atelier', clientNom: 'Camille Martin', prenom: 'Camille', nom: 'Camille Martin', email: 'camille@exemple.test',
    role: 'responsable', lien: 'https://capmedia.app/suivi/', numero: 'ATL-001', titre: 'Le bouton Payer', description: 'Il ne répond pas.',
    type: 'bug', urgence: 'critique', plateforme: 'ios', version: '1.2.0', auteurNom: 'Camille', statutAvant: 'nouveau', statutApres: 'a-valider',
    statut: 'en-cours', texte: 'Bonjour', libelle: 'Refonte', montant: 1000, ttc: 1200, echeance: new Date(), date: new Date(), reste: 1200,
    par: 'Camille', moyen: 'virement', reference: 'REF', qualification: 'a-chiffrer', code: '123456', minutes: 10, quand: 'maintenant', ip: '1.2.3.4',
    campagne: 'Octobre', testeur: 'Karim', ok: 3, ko: 1, na: 0, total: 4, points: [{ quoi: 'Devis', detail: 'à décider' }], projet: 'Atelier',
    notes: [{ type: 'correction', texte: 'Connexion' }], nom2: '', evenement: 'proposition', periode: 'mensuelle', formule: 'Essentiel',
    reponse: 'accepte', commentaire: 'Parfait', scenario: 'Connexion', gravite: 'critique', scenarios: 4, testeurs: 2, anomalies: 1, heure: '10:00',
    duree: 60, lieu: 'Visio', ordreDuJour: 'Point', remarques: ['Rien'], echecs: ['Paiement'], plateformes: ['ios'], pieces: 1, avecPdf: true,
  };
  const variantes = [{}, { cote: 'equipe' }, { parLEquipe: true }, { statut: 'approuvee' }, { statut: 'modifications' }, { evenement: 'corrigee' },
    { evenement: 'close' }, { evenement: 'evolution', cote: 'equipe' }, { evenement: 'actif' }, { evenement: 'suspendu' }, { evenement: 'termine' },
    { deplacee: true }, { qualification: 'hors-perimetre' }, { reponse: 'refuse' }, { statut: 'livree' }, { statut: 'refusee' }, { role: 'admin' }];
  /* Des mots qui n'existent pas sans leurs accents, ou des tournures qui
     changent de sens sans eux. Ce sont ceux que l'audit a relevés, et leurs
     voisins naturels. */
  const fautes = [
    /\bou vous venez\b/i, /\brien demande\b/i, /\ba personne\b/i, /\bapprouvee?s?\b/i, /\bdemandees\b/i, /\ba repondu\b/i,
    /\bde notre cote\b/i, /\bsont bloques\b/i, /\bs'arrete\b/i, /\bdes que\b/i, /\bajoute a\b/i, /^A valider/m, /\bA valider\b/,
    /\breponse\b/i, /\bequipe\b/i, /\bacces\b/i, /\bcreee?\b/i, /\bdeja\b/i, /\betre\b/i, /\bprecision\b/i, /\bresolu\b/i, /\breunion\b/i,
    /\bvalidee?\b/i, /\bterminee\b/i, /\benvoyee?\b/i, /\bsecurite\b/i, /\bregle\b/i, /\bpiece/i, /\bdetail\b/i,
    /\bmodele\b/i, /\bvoila\b/i, /\bperimetre\b/i, /\bechean/i, /\bevolution\b/i, /\bsequence\b/i, /\bdeclar/i, /\bprevu/i, /\bverifi[ée]?\b(?![a-z])/i,
  ];
  let rendus = 0; const trouvees = new Set();
  for (const nom of Object.keys(MODELES)) {
    for (const extra of variantes) {
      let r; try { r = rendre(nom, { ...v, ...extra }); } catch (e) { trouvees.add(`${nom} : rendu impossible (${e.message})`); continue; }
      rendus += 1;
      for (const [partie, texte] of [['objet', r.objet], ['texte', r.texte]]) {
        for (const f of fautes) { const m = String(texte).match(f); if (m) trouvees.add(`${nom} (${partie}) : « ${m[0]} »`); }
        if (/undefined|null|\[object Object\]|NaN/.test(texte)) trouvees.add(`${nom} (${partie}) : valeur brute`);
      }
    }
  }
  verifier(rendus >= Object.keys(MODELES).length * 10, `${Object.keys(MODELES).length} modèles rendus (${rendus} rendus)`);
  verifier(!trouvees.size, 'aucun mot sans ses accents ni valeur brute, dans aucun objet ni aucun texte', [...trouvees].slice(0, 12).join(' | '));

  /* L'e-mail du code, mot pour mot : c'est le premier que reçoit un client. */
  const code = rendre('code', { code: '123456', minutes: 10 });
  verifier(code.objet === '123456 est votre code de connexion', 'objet du code', code.objet);
  verifier(code.texte.includes("sur l'appareil où vous venez de le demander."), 'code : « où vous venez »');
  verifier(code.texte.includes("Si vous n'avez rien demandé, ignorez ce message"), 'code : « rien demandé »');
  verifier(code.texte.includes('Ne le transmettez à personne'), 'code : « à personne »');
  verifier(code.html.includes('où vous venez') && code.html.includes('rien demandé') && code.html.includes('à personne'), 'code : les accents aussi dans le HTML');
  const valid = rendre('validation-reponse', { projetNom: 'Atelier', statut: 'approuvee', titre: 'Maquette', par: 'Camille' });
  verifier(valid.objet === 'Atelier · Validation approuvée : Maquette', 'objet de la réponse à une validation', valid.objet);
  const sansProjet = rendre('validation-reponse', { statut: 'modifications', titre: 'Maquette' });
  verifier(sansProjet.objet === 'Modifications demandées : Maquette', 'sans nom de projet, l\'objet ne commence pas par « · »', sansProjet.objet);
  const relance = rendre('relance', { projet: 'Atelier', par: 'Camille', points: [{ quoi: 'Devis', detail: 'à décider' }] });
  verifier(relance.texte.includes('de notre côté') && relance.texte.includes('sont bloqués') && relance.texte.includes("s'arrête dès que"), 'relance : côté, bloqués, s\'arrête dès que');
  verifier(rendre('fichier', { projetNom: 'Atelier' }).texte.includes("vient d'être ajouté à votre espace"), 'fichier : « ajouté à votre espace »');
  verifier(rendre('ferme', { numero: 'X-1' }).texte.includes('Elle reste consultable'), 'demande fermée : « Elle reste consultable »');

  /* L'envoi : du JSON en UTF-8, l'objet passé tel quel à Brevo, qui l'encode
     dans l'en-tête. Le code doit le déclarer, et ne rien transcoder. */
  const suivi = fs.readFileSync(path.join(__dirname, '..', 'suivi.js'), 'utf8');
  verifier(/'content-type': 'application\/json; charset=utf-8'/.test(suivi), 'l\'appel HTTP à Brevo déclare son corps en UTF-8');
  verifier(/subject: courriel\.objet,/.test(suivi) && !/normalize\('NFD'\)|latin1|binary/.test(suivi.slice(suivi.indexOf('async function envoyerParBrevo'), suivi.indexOf('async function marquerEchec'))), 'l\'objet part tel quel, sans transcodage');
};

/* ==========================================================================
   2 à 4. Dans le navigateur
   ========================================================================== */
(async () => {
  accents();

  /* --- Le semis : des dates écrasées en objet vide, comme en production. */
  await poser('blocages/b-remise', {
    projet: S('atelier'), titre: S('Attente du compte Google'), description: S('Le compte développeur.'), responsable: S('client'),
    impact: S('Publication retardée.'), depuis: M({}), resolu: { nullValue: null }, visibilite: S('client'), cree: T(ilYA(3)), maj: T(ilYA(3)),
  });
  await poser('releases/r-remise', {
    projet: S('atelier'), composant: S('web'), plateforme: S('web'), version: S('9.9.9'), titre: S('Sans date'), statut: S('disponible'),
    date: M({}), notes: A([]), liens: M({}), visibilite: S('client'), cree: T(ilYA(1)), maj: T(ilYA(1)),
  });
  for (const c of ['ios', 'android', 'web', 'admin', 'backend']) await poser(`projets/atelier/composants/${c}`, { maj: M({}) }, ['maj']);
  /* Une ancienne partie qui porte encore sa fiche technique. */
  await poser('projets/atelier/composants/admin', { technique: M({ acces: A([M({ nom: S('Console'), compte: S('compte.prive@exemple.test') })]), lignes: N(1200) }) }, ['technique']);

  const navigateur = await chromium.launch();
  let page = await (await navigateur.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  /* ---------- 4. Les dates vides, côté client ---------- */
  console.log('\n4. Aucune date vide à l\'écran');
  await connecter(page, 'camille.essai@exemple.test');
  await page.evaluate(() => { location.hash = '#/projets/atelier'; });
  await page.waitForSelector('[data-partie]', { timeout: 30000 }).catch(() => {});
  await pause(2000);
  const apercu = await page.evaluate(() => document.querySelector('#vue') ? document.querySelector('#vue').innerText : document.body.innerText);
  verifier(apercu.includes('Depuis : date non renseignée'), 'point bloquant sans date : « Depuis : date non renseignée »');
  verifier(!/Depuis\s*(\n|$|Attendu|Impact)/.test(apercu), 'aucun « Depuis » suivi de rien');
  const cartes = await page.$$eval('[data-partie]', (els) => els.map((e) => e.innerText));
  verifier(cartes.length >= 5, `${cartes.length} cartes de parties lues`);
  verifier(cartes.every((t) => !/avancement de la partie\s*·\s*(\n|$)/.test(t)), 'carte d\'une partie : pas de « · » suivi de rien');
  verifier(!/\bnull\b|undefined|Invalid Date|NaN/.test(apercu), 'aperçu : ni null, ni undefined, ni date invalide');

  /* Les versions vivent dans la page de leur plateforme (02/10) : la 9.9.9
     est celle du web. */
  await page.evaluate(() => { location.hash = '#/projets/atelier/brique/web'; });
  await page.waitForSelector('[data-section="versions"]', { timeout: 30000 }).catch(() => {});
  await pause(1500);
  const versions = await page.evaluate(() => (document.querySelector('[data-section="versions"]') || document.querySelector('#vue')).innerText);
  verifier(versions.includes('Publiée, date non renseignée'), 'version disponible sans date : « Publiée, date non renseignée »');
  verifier(!/Publiée le\s*(·|\n|$)/.test(versions), 'aucun « Publiée le » suivi de rien');
  verifier(!/\bnull\b|undefined|Invalid Date/.test(versions), 'versions : ni null, ni undefined, ni date invalide');

  await page.evaluate(() => { location.hash = '#/projets/atelier/brique/web'; });
  await pause(3000);
  const brique = await page.evaluate(() => document.querySelector('#vue').innerText);
  verifier(!/disponible depuis le\s*(\n|$)/.test(brique) && !/\bau\s*\n/.test(brique), 'page de la partie Web : pas de date vide', brique.slice(0, 200));

  /* ---------- 2. Inviter un collègue, e-mails coupés ---------- */
  console.log('\n2. « Inviter un collègue » dit la vérité');
  await poser('projets/atelier', { emailsClient: S('coupes') }, ['emailsClient']);
  await page.evaluate(() => { location.hash = '#/projets/atelier/releases'; });
  await pause(800);
  await page.evaluate(() => { location.hash = '#/projets/atelier'; });
  await page.waitForSelector('[data-action="inviter-collegue"]', { timeout: 30000 }).catch(() => {});
  await pause(1500);
  verifier(await page.$eval('[data-action="inviter-collegue"]', (b) => b.dataset.emails).catch(() => '') === 'coupes', 'le bouton sait que les e-mails sont coupés');
  await page.click('[data-action="inviter-collegue"]');
  await page.waitForSelector('#f-collegue', { timeout: 10000 });
  const aide = await page.$eval('#f-collegue .aide', (p) => p.textContent);
  verifier(/suspendus/.test(aide) && /aucune invitation ne partira seule/.test(aide) && /lien d'invitation à copier/.test(aide), 'la fenêtre prévient : aucune invitation ne partira, un lien à copier', aide);
  verifier(!/Il reçoit une invitation par e-mail/.test(aide), 'elle ne promet plus d\'e-mail');
  await page.fill('#co-nom', 'Paul Remise'); await page.fill('#co-email', 'paul.remise@exemple.test');
  await page.click('[form="f-collegue"][type="submit"]');
  await page.waitForSelector('#co-lien', { timeout: 30000 }).catch(() => {});
  const lien = await page.$eval('#co-lien', (i) => i.value).catch(() => '');
  verifier(/\/suivi\/\?i=/.test(lien), 'après l\'ajout, le lien d\'invitation est donné', lien);
  const sous = await page.$$eval('.voile .modale-tete p', (ps) => ps.map((p) => p.textContent).join(' | ')).catch(() => '');
  verifier(/aucun e-mail n'est parti/.test(sous) && /suspendus/.test(sous), 'la fenêtre dit qu\'aucun e-mail n\'est parti', sous);
  verifier(Boolean(await page.$('[data-copier]')), 'un bouton « Copier le lien »');
  await page.click('.voile [data-fermer]').catch(() => {});
  await pause(3000);
  const envois = ((await lire('envois?pageSize=300')).documents || []);
  verifier(!envois.some((d) => ['invitation', 'ouverture'].includes(str(d, 'modele')) && destinataires(d).includes('paul.remise@exemple.test')), 'aucune invitation n\'est mise en file pour lui');

  /* E-mails actifs : la promesse redevient vraie, et l'invitation part. */
  await poser('projets/atelier', { emailsClient: S('actifs') }, ['emailsClient']);
  await pause(3000);
  await page.click('[data-action="inviter-collegue"]');
  await page.waitForSelector('#f-collegue', { timeout: 10000 });
  verifier(/Il reçoit une invitation par e-mail/.test(await page.$eval('#f-collegue .aide', (p) => p.textContent)), 'e-mails actifs : la fenêtre annonce l\'e-mail');
  await page.fill('#co-nom', 'Jeanne Remise'); await page.fill('#co-email', 'jeanne.remise@exemple.test');
  await page.click('[form="f-collegue"][type="submit"]');
  await pause(4000);
  verifier(!(await page.$('#co-lien')), 'e-mails actifs : pas de lien à copier');
  let partie = false;
  for (let i = 0; i < 20 && !partie; i += 1) {
    partie = ((await lire('envois?pageSize=300')).documents || []).some((d) => str(d, 'modele') === 'invitation' && destinataires(d).includes('jeanne.remise@exemple.test'));
    if (!partie) await pause(500);
  }
  verifier(partie, 'e-mails actifs : l\'invitation est mise en file');

  /* ---------- 3. La règle du champ technique, côté équipe ---------- */
  console.log('\n3. Le champ « technique » ne revient pas sur une partie');
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  await connecter(page, 'agent.essai@exemple.test');
  const essai = (cid, d) => page.evaluate(async ([c, x]) => {
    const { ecrire } = await import('/suivi/assets/js/donnees.js');
    try { await ecrire.majComposant('atelier', c, x); return 'accepte'; } catch (e) { return e.code || e.message; }
  }, [cid, d]);
  verifier(/permission/.test(await essai('web', { technique: { acces: [{ nom: 'Console' }] } })), 'ajouter un champ « technique » à une partie : refusé');
  verifier(await essai('admin', { description: 'Mise à jour' }) === 'accepte', 'une ancienne partie qui le porte encore reste modifiable');
  verifier(/permission/.test(await essai('admin', { technique: { lignes: 1 } })), 'changer le contenu de l\'ancien champ : refusé');
  verifier(await essai('web', { description: 'Sans technique' }) === 'accepte', 'une partie ordinaire se modifie toujours');

  /* ---------- 3 bis. La migration sur l'émulateur ---------- */
  console.log('\n3 bis. La migration range sans perte');
  const racine = path.join(__dirname, '..', '..');
  const sauvegardes = fs.mkdtempSync(path.join(os.tmpdir(), 'migrer-technique-'));
  const lancer = (args) => { try { return execFileSync('node', ['fonctions-suivi/outils/migrer-technique.mjs', '--projet=atelier', ...args], { cwd: racine, env: { ...process.env, FIRESTORE_EMULATOR_HOST: BANC.firestoreHote, SAUVEGARDES: sauvegardes }, encoding: 'utf8' }); } catch (e) { return `ÉCHEC ${e.status} ${e.stdout || ''}${e.stderr || ''}`; } };
  const blanc = lancer([]);
  verifier(/1 portent encore un champ « technique »/.test(blanc) && /À blanc : rien n'a été écrit/.test(blanc), 'à blanc : une partie trouvée, rien écrit', blanc.slice(-300));
  verifier(!/compte\.prive@exemple\.test/.test(blanc), 'à blanc : aucune valeur affichée, seulement les clés');
  verifier('technique' in ((await lire('projets/atelier/composants/admin')).fields || {}), 'à blanc : la partie porte toujours le champ');
  const vrai = lancer(['--vrai']);
  verifier(/Vérifié : plus aucune partie migrée/.test(vrai), 'pour de vrai : rangée et vérifiée', vrai.slice(-300));
  const apres = (await lire('projets/atelier/composants/admin')).fields || {};
  verifier(!('technique' in apres) && apres.nom, 'la partie n\'a plus le champ, et garde le reste');
  const fiche = (await lire('projets/atelier/technique/admin')).fields || {};
  verifier(JSON.stringify(fiche.acces || {}).includes('compte.prive@exemple.test') && (fiche.lignes || {}).integerValue === '1200', 'la fiche technique de l\'équipe a reçu le contenu, intact');
  verifier(/Rien à faire/.test(lancer(['--vrai'])), 'rejouée : rien à faire');
  const fichiers = fs.readdirSync(sauvegardes);
  verifier(fichiers.length === 1, 'une sauvegarde posée avant l\'écriture');
  lancer([`--annuler=${path.join(sauvegardes, fichiers[0])}`, '--vrai']);
  const remise = (await lire('projets/atelier/composants/admin')).fields || {};
  const ficheApresAnnulation = await fetch(bdd('projets/atelier/technique/admin'), { headers: prop });
  verifier(JSON.stringify(remise.technique || {}).includes('compte.prive@exemple.test') && ficheApresAnnulation.status === 404, 'annulée : le champ revient, la fiche créée s\'en va');
  /* La partie, lue par la cliente après migration : plus rien de technique. */
  lancer(['--vrai']);

  verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 3).join(' | '));
  await navigateur.close();
  await fetch(bdd('blocages/b-remise'), { method: 'DELETE', headers: prop });
  await fetch(bdd('releases/r-remise'), { method: 'DELETE', headers: prop });
  console.log(`\n${ok} vérifications passées, ${ecarts.length} ÉCART(S).`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.log(`  ÉCART  exception : ${e.message}`); process.exit(1); });
