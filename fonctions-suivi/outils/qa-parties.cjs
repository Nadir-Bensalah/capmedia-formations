require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la page d'une partie, à l'épreuve

   Les parties d'un projet (projets/{p}/composants/{id}) portent une fiche
   lue par le client : sous-titre, résumé, état, versions, liens, chiffres,
   fonctions, hébergement, technologies, historique daté, prochaines
   étapes, points d'attention.

   1. l'outil d'import : à blanc par défaut, un fichier invalide refusé en
      disant pourquoi, --production refusé sur l'émulateur, puis --vrai sur
      Atelier, en fusion (aucun champ existant retiré) ;
   2. les cartes de l'aperçu : le nom tiré de la partie (« Firebase »), les
      versions en ligne et en préparation lisibles en entier, même hauteur ;
   3. la page côté client : chaque section présente quand la donnée existe,
      masquée sinon, la frise datée dans l'ordre, les liens, aucun bouton
      d'édition, aucune erreur de page ;
   4. le Cockpit : les boutons d'édition, la liste de ce qui reste à
      rédiger, l'édition d'une section, un texte trop long et un tiret
      cadratin refusés ; puis l'import qui épargne la partie retouchée ;
   5. les règles, par REST avec de vrais jetons : le client n'écrit pas,
      l'équipe écrit, un champ trop long ou une liste trop longue refusés.

   Banc : émulateurs, site local, semer-suivi.
     node fonctions-suivi/outils/qa-parties.cjs
   Captures (facultatif) : CAPTURES=<dossier>.
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d';
const SITE = BANC.site;
const P = 'atelier';
const CAPTURES = process.env.CAPTURES || '';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const proprietaire = { Authorization: 'Bearer owner' };
const racineDocs = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${racineDocs}/${c}`;
const lire = async (c) => lireRest(bdd(c), proprietaire);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: proprietaire }); };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};

const EXEMPLES = path.join(__dirname, 'exemples', 'parties');
const INVALIDES = path.join(__dirname, 'exemples', 'parties-invalides');
const ios = JSON.parse(fs.readFileSync(path.join(EXEMPLES, 'ios.json'), 'utf8'));
const backend = JSON.parse(fs.readFileSync(path.join(EXEMPLES, 'backend.json'), 'utf8'));

const importer = (args) => {
  try {
    const sortie = execFileSync(process.execPath, [path.join(__dirname, 'parties-importer.mjs'), ...args], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, sortie };
  } catch (e) { return { code: e.status, sortie: `${e.stdout || ''}${e.stderr || ''}` }; }
};

/* La connexion par le code à six chiffres, comme une vraie personne. */
const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=100');
    const pour = ((j && j.documents) || []).filter((d) => JSON.stringify((d.fields || {}).a || {}).includes(email));
    if (pour.length) {
      pour.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
      const v = (((pour[0].fields.variables || {}).mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
const connecter = async (page, email) => {
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};
const aller = async (page, hash, attendu) => {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await pause(1300);
    if (!attendu || await page.$(attendu)) return true;
  }
  return false;
};
const capturer = async (page, nom, theme) => {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); document.querySelectorAll('.toast').forEach((x) => x.remove()); }, theme);
  await pause(400);
  await page.screenshot({ path: path.join(CAPTURES, `${nom}.png`), fullPage: true });
};

/* Ce que la page dit d'elle-même : les sections dessinées, leur contenu. */
const releverPage = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  return {
    sections: qa('[data-section]').map((x) => x.dataset.section),
    titre: ((q('.partie-titres h1') || {}).textContent || '').trim(),
    sousTitre: ((q('.partie-sous-titre') || {}).textContent || '').trim(),
    enLigne: ((q('[data-version="en-ligne"] .partie-version-num') || {}).textContent || '').trim(),
    enLigneNuance: ((q('[data-version="en-ligne"] .partie-version-nuance') || {}).textContent || '').trim(),
    prep: ((q('[data-version="preparation"] .partie-version-num') || {}).textContent || '').trim(),
    statut: ((q('[data-version="statut"] .pastille') || {}).textContent || '').trim(),
    liens: qa('a[data-lien-partie]').map((a) => ({ t: a.textContent.trim(), h: a.getAttribute('href'), cible: a.target })),
    chiffres: qa('[data-section="chiffres"] .metrique').map((m) => [m.querySelector('.metrique-libelle').textContent.trim(), m.querySelector('.metrique-valeur').textContent.trim()]),
    fonctions: qa('.partie-fonctions li').length,
    resume: ((q('.partie-resume') || {}).textContent || '').trim(),
    etat: ((q('[data-section="etat"] .partie-lead') || {}).textContent || '').trim(),
    etapes: qa('[data-bloc="prochaines-etapes"] li').length,
    attention: qa('[data-bloc="points-attention"] li').length,
    technos: qa('.partie-technos dt').map((x) => x.textContent.trim()),
    hebergement: ((q('[data-bloc="hebergement"] .partie-texte') || {}).textContent || '').trim(),
    frise: qa('[data-section="historique"] .partie-frise-date').map((t) => t.getAttribute('datetime')),
    friseTitres: qa('[data-section="historique"] .partie-frise-titre').map((t) => t.textContent.trim()),
    editer: qa('[data-action="editer-partie"]').length,
    texte: (q('.page') || document.body).innerText,
  };
});

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvrir = async () => {
    const page = await (await nav.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    page.on('pageerror', (e) => erreurs.push(`PAGE: ${e.message}`));
    return page;
  };

  console.log('\n== L\'outil d\'import');
  const avantIos = await lire(`projets/${P}/composants/ios`);
  const blanc = importer([P, EXEMPLES]);
  verifier(blanc.code === 0 && /À blanc/.test(blanc.sortie) && /3 fiches valides/.test(blanc.sortie), 'à blanc par défaut, les trois fiches d\'exemple sont valides', blanc.sortie.slice(-300));
  verifier(!champ(await lire(`projets/${P}/composants/ios`), 'sousTitre').stringValue, 'à blanc, rien n\'est écrit');
  const mauvais = importer([P, INVALIDES]);
  verifier(mauvais.code === 1 && ['cadratin', 'illisible', 'mauvaise-date', 'trop-long'].every((f) => new RegExp(`REFUSÉ\\s+${f}\\.json`).test(mauvais.sortie)), 'un fichier invalide est refusé, nommé', `code ${mauvais.code}`);
  verifier(/tiret cadratin/.test(mauvais.sortie) && /JSON illisible/.test(mauvais.sortie) && /attendu AAAA-MM-JJ/.test(mauvais.sortie) && /https:\/\/ est attendue/.test(mauvais.sortie) && /resume : \d+ caractères, 1500 au plus/.test(mauvais.sortie), 'et la raison est dite (cadratin, JSON, date, adresse, longueur)');
  const prod = importer([P, EXEMPLES, '--vrai', '--production']);
  verifier(prod.code === 2 && /contradictoire/.test(prod.sortie), '--production avec l\'émulateur branché est refusé, rien n\'est fait', prod.sortie.slice(-200));
  const vrai = importer([P, EXEMPLES, '--vrai']);
  verifier(vrai.code === 0 && /3 fiches versées/.test(vrai.sortie), 'avec --vrai, les trois fiches sont versées sur l\'émulateur', vrai.sortie.slice(-300));
  const apresIos = await lire(`projets/${P}/composants/ios`);
  const gardes = Object.keys(champ(avantIos, 'nom') ? (avantIos.fields || {}) : {}).filter((k) => !(k in (apresIos.fields || {})));
  verifier(!gardes.length && champ(apresIos, 'progression').integerValue === champ(avantIos, 'progression').integerValue && champ(apresIos, 'responsable').stringValue === champ(avantIos, 'responsable').stringValue, 'en fusion : aucun champ existant retiré (progression, responsable gardés)', gardes.join(', '));
  verifier(champ(apresIos, 'sousTitre').stringValue === ios.sousTitre && champ(apresIos, 'statut').stringValue === 'en-validation', 'la fiche est posée sur la partie iPhone');
  verifier(champ(await lire(`projets/${P}/composants/backend`), 'nom').stringValue === 'Firebase', 'la partie Serveur s\'appelle désormais « Firebase »');
  const hist = ((champ(await lire(`projets/${P}/composants/backend`), 'historique').arrayValue || {}).values || []).map((v) => v.mapValue.fields.date.stringValue);
  verifier(hist.join() === '2026-09-25,2026-07-01', 'l\'historique est versé du plus récent au plus ancien', hist.join());

  /* La carte Firebase n'existe que si le projet déclare le serveur. */
  await fetch(`${bdd(`projets/${P}`)}?updateMask.fieldPaths=plateformes`, {
    method: 'PATCH', headers: { ...proprietaire, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { plateformes: { arrayValue: { values: ['ios', 'android', 'web', 'admin', 'backend'].map((x) => ({ stringValue: x })) } } } }),
  });

  console.log('\n== Les cartes de l\'aperçu, côté client');
  const client = await ouvrir();
  await connecter(client, 'camille.essai@exemple.test');
  await aller(client, `/projets/${P}`, '.carte-plateforme');
  await pause(800);
  const cartes = await client.evaluate(() => [...document.querySelectorAll('.carte-plateforme')].map((c) => {
    const r = c.getBoundingClientRect();
    const coupes = [...c.querySelectorAll('.carte-plateforme-nom, .carte-plateforme-etat')].filter((e) => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis');
    return { p: c.dataset.plateforme, nom: c.querySelector('.carte-plateforme-nom').textContent.trim(), etats: [...c.querySelectorAll('.carte-plateforme-etat')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), h: Math.round(r.height), coupes: coupes.length };
  }));
  const carte = (p) => cartes.find((c) => c.p === p) || { etats: [] };
  verifier(carte('backend').nom === 'Firebase', 'la carte du serveur s\'appelle « Firebase », tirée de la partie', carte('backend').nom);
  verifier(carte('ios').etats.join(' / ') === '1.1.2 en ligne / 1.1.3 en préparation', 'la carte iPhone : version en ligne et en préparation, lisibles', carte('ios').etats.join(' / '));
  verifier(cartes.length >= 5 && cartes.every((c) => c.coupes === 0), 'aucun texte coupé dans les cartes', JSON.stringify(cartes.map((c) => [c.p, c.coupes])));
  const hauteurs = cartes.map((c) => c.h);
  verifier(Math.max(...hauteurs) - Math.min(...hauteurs) <= 1, 'toutes les cartes ont la même hauteur', hauteurs.join(','));
  verifier(!/\bnull\b|undefined|NaN/.test(cartes.map((c) => c.etats.join(' ')).join(' ')), 'ni null ni undefined dans les cartes');

  await capturer(client, 'client-clair-apercu', 'light');

  console.log('\n== La page iPhone, côté client');
  await client.click('.carte-plateforme[data-plateforme="ios"] .carte-plateforme-corps');
  await client.waitForSelector('[data-section="entete"]', { timeout: 20000 }).catch(() => {});
  await pause(900);
  const pi = await releverPage(client);
  verifier(pi.titre === 'Application iPhone' && pi.sousTitre === ios.sousTitre, 'l\'en-tête : le nom et le sous-titre', `${pi.titre} | ${pi.sousTitre}`);
  verifier(pi.statut === 'En validation', 'le statut « En validation »', pi.statut);
  verifier(pi.enLigne === '1.1.2' && /depuis le 10 septembre 2026/.test(pi.enLigneNuance) && /App Store/.test(pi.enLigneNuance) && pi.prep === '1.1.3', 'la version en ligne (datée, où) et celle en préparation', `${pi.enLigne} ${pi.enLigneNuance} ${pi.prep}`);
  verifier(pi.liens.length === 2 && pi.liens.every((l) => /^https:\/\//.test(l.h) && l.cible === '_blank') && pi.liens[0].t.startsWith('Voir sur l\'App Store'), 'les boutons des liens, dans un nouvel onglet', JSON.stringify(pi.liens));
  verifier(pi.chiffres.length === 4 && pi.chiffres[1].join('=') === 'langues=6', 'la rangée des chiffres clés', JSON.stringify(pi.chiffres));
  verifier(pi.fonctions === ios.fonctions.length && /réserver un cours/i.test(pi.resume), '« Ce que fait cette partie » : le résumé et les fonctions', `${pi.fonctions}`);
  verifier(pi.etat.startsWith('Au 1er octobre 2026') && pi.etapes === 2 && pi.attention === 1, '« Où on en est » : état, prochaines étapes, point d\'attention', `${pi.etapes}/${pi.attention}`);
  verifier(pi.technos.join() === 'React Native,Firebase,Stripe' && /Europe/.test(pi.hebergement), '« Comment elle est faite » : technologies et hébergement', pi.technos.join());
  const ordre = pi.frise.slice().sort().reverse();
  verifier(pi.frise.length === 5 && pi.frise.join() === ordre.join(), 'la frise datée, du plus récent au plus ancien', pi.frise.join());
  verifier(pi.editer === 0 && !pi.sections.includes('a-completer'), 'aucun bouton d\'édition chez le client');
  verifier(['entete', 'chiffres', 'fonctions', 'etat', 'fabrication', 'historique'].every((s) => pi.sections.includes(s)), 'toutes les sections sont là quand la donnée existe', pi.sections.join(','));
  verifier(!/\bnull\b|\bundefined\b|NaN|Invalid Date/.test(pi.texte) && !pi.texte.includes('\u2014'), 'ni « null », ni « undefined », ni tiret cadratin à l\'écran');
  verifier(!/Comptes et accès|Fiche technique|Bibliothèques installées/.test(pi.texte), 'rien de la fiche technique chez le client');
  await capturer(client, 'client-clair-iphone', 'light');

  console.log('\n== Les pages Firebase et Web, côté client');
  await aller(client, `/projets/${P}/brique/backend`, '[data-section="entete"]'); await pause(700);
  const pb = await releverPage(client);
  verifier(pb.titre === 'Firebase', 'la page du serveur s\'appelle « Firebase »', pb.titre);
  verifier(pb.frise.join() === '2026-09-25,2026-07-01', 'sa frise est rangée par date, quel que soit l\'ordre saisi', pb.frise.join());
  verifier(!pb.sections.includes('etat') || pb.etapes === 0, 'pas de prochaines étapes inventées');
  verifier(pb.liens.length === 0, 'aucun bouton de lien quand la fiche n\'en a pas');
  await capturer(client, 'client-clair-firebase', 'light');
  await aller(client, `/projets/${P}/brique/web`, '[data-section="entete"]'); await pause(700);
  const pw = await releverPage(client);
  verifier(pw.sections.includes('fonctions') && pw.resume.length > 10, 'la page Web montre son résumé');
  verifier(['chiffres', 'etat', 'historique', 'a-completer'].every((s) => !pw.sections.includes(s)), 'et masque les sections sans donnée', pw.sections.join(','));
  verifier(pw.sections.includes('fabrication') && pw.technos.length === 0 && /React/i.test(pw.texte), 'les anciennes technologies de la partie restent lues, en étiquettes', `${pw.sections.join(',')} | ${pw.texte.slice(0, 600).replace(/\s+/g, ' ')}`);
  verifier(!/\bnull\b|\bundefined\b/.test(pw.texte), 'sans « null » ni « undefined »');

  console.log('\n== Le Cockpit : édition par l\'équipe');
  const cockpit = await ouvrir();
  await connecter(cockpit, 'agent.essai@exemple.test');
  await aller(cockpit, `/projets/${P}/brique/web`, '[data-section="entete"]'); await pause(700);
  const cw = await releverPage(cockpit);
  const manque = await cockpit.$$eval('[data-section="a-completer"] [data-section-edit]', (l) => l.map((b) => b.dataset.sectionEdit));
  verifier(manque.join() === 'chiffres,etat,historique,fabrication', 'la page Web liste ce qui reste à rédiger, pour l\'équipe seule', manque.join());
  verifier(cw.editer >= 2, 'des boutons d\'édition par section');
  await aller(cockpit, `/projets/${P}/brique/ios`, '[data-section="entete"]'); await pause(700);
  await capturer(cockpit, 'cockpit-sombre-iphone', 'dark');
  await cockpit.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await cockpit.click('[data-section="etat"] [data-action="editer-partie"]');
  await cockpit.waitForSelector('#ed-etatActuel', { timeout: 10000 });
  await cockpit.fill('#ed-etatActuel', 'Au 2 octobre 2026, la 1.1.3 attend la validation d\'Apple.');
  await cockpit.fill('#ed-prochainesEtapes', 'Publier la 1.1.3\nLancer la campagne de tests\nPréparer la 1.2');
  await cockpit.click('button[type="submit"][form="ed-forme"]');
  await cockpit.waitForSelector('#ed-forme', { state: 'detached', timeout: 10000 }).catch(() => {});
  await pause(1500);
  const apresEdit = await lire(`projets/${P}/composants/ios`);
  verifier(champ(apresEdit, 'etatActuel').stringValue === 'Au 2 octobre 2026, la 1.1.3 attend la validation d\'Apple.' && ((champ(apresEdit, 'prochainesEtapes').arrayValue || {}).values || []).length === 3, 'l\'équipe corrige « Où on en est », la base suit');
  const ce = await releverPage(cockpit);
  verifier(ce.etat.startsWith('Au 2 octobre 2026') && ce.etapes === 3, 'et la page aussi, sans recharger', `${ce.etat.slice(0, 30)} ${ce.etapes}`);

  await cockpit.click('[data-section="historique"] [data-action="editer-partie"]');
  await cockpit.waitForSelector('#ed-historique', { timeout: 10000 });
  const lignes = await cockpit.inputValue('#ed-historique');
  await cockpit.fill('#ed-historique', `${lignes}\n2026-10-02 | Bilan des tests | Une phrase ajoutée depuis le Cockpit`);
  await cockpit.click('button[type="submit"][form="ed-forme"]');
  await cockpit.waitForSelector('#ed-forme', { state: 'detached', timeout: 10000 }).catch(() => {});
  await pause(1500);
  const ch = await releverPage(cockpit);
  verifier(ch.frise[0] === '2026-10-02' && ch.friseTitres[0] === 'Bilan des tests' && ch.frise.length === 6, 'une date ajoutée en bas de la liste prend sa place en tête de frise', ch.frise.join());

  await cockpit.click('[data-section="entete"] [data-action="editer-partie"]');
  await cockpit.waitForSelector('#ed-sousTitre', { timeout: 10000 });
  await cockpit.fill('#ed-sousTitre', 'x'.repeat(200));
  await cockpit.click('button[type="submit"][form="ed-forme"]');
  await pause(1200);
  const refus = await cockpit.evaluate(() => ({ ouverte: !!document.querySelector('#ed-forme'), toast: [...document.querySelectorAll('.toast--erreur')].map((t) => t.textContent.trim()).join(' | ') }));
  verifier(refus.ouverte && /Sous-titre : 200 caractères, 160 au plus/.test(refus.toast), 'un sous-titre trop long est refusé, la feuille reste ouverte', JSON.stringify(refus));
  await cockpit.fill('#ed-sousTitre', 'Un sous-titre \u2014 avec un cadratin');
  await cockpit.click('button[type="submit"][form="ed-forme"]');
  await pause(1200);
  const refus2 = await cockpit.evaluate(() => ({ ouverte: !!document.querySelector('#ed-forme'), toast: [...document.querySelectorAll('.toast--erreur')].map((t) => t.textContent.trim()).join(' | ') }));
  verifier(refus2.ouverte && /tiret cadratin/.test(refus2.toast), 'le tiret cadratin aussi');
  verifier(champ(await lire(`projets/${P}/composants/ios`), 'sousTitre').stringValue === ios.sousTitre, 'et rien n\'a été écrit');
  await cockpit.fill('#ed-sousTitre', 'Atelier sur l\'App Store, relu par l\'équipe');
  await cockpit.fill('#ed-nom', 'iPhone');
  await cockpit.click('button[type="submit"][form="ed-forme"]');
  await cockpit.waitForSelector('#ed-forme', { state: 'detached', timeout: 10000 }).catch(() => {});
  await pause(1500);
  const ct = await releverPage(cockpit);
  verifier(ct.titre === 'iPhone' && ct.sousTitre === 'Atelier sur l\'App Store, relu par l\'équipe', 'l\'en-tête se corrige aussi (nom et sous-titre)', `${ct.titre} | ${ct.sousTitre}`);
  await aller(cockpit, `/projets/${P}/brique/backend`, '[data-section="entete"]'); await pause(700);
  await capturer(cockpit, 'cockpit-sombre-firebase', 'dark');

  console.log('\n== L\'import épargne une partie retouchée dans le Cockpit');
  const rejeu = importer([P, EXEMPLES, '--vrai']);
  verifier(rejeu.code === 0 && /laissées telles quelles/.test(rejeu.sortie) && /ios/.test(rejeu.sortie.split('laissées telles quelles')[1] || ''), 'l\'import ne réécrase pas la partie iPhone retouchée', rejeu.sortie.slice(-300));
  verifier(champ(await lire(`projets/${P}/composants/ios`), 'nom').stringValue === 'iPhone', 'le nom corrigé par l\'équipe reste');
  const ecrase = importer([P, EXEMPLES, '--vrai', '--ecraser']);
  verifier(ecrase.code === 0 && champ(await lire(`projets/${P}/composants/ios`), 'nom').stringValue === 'Application iPhone', 'sauf --ecraser');

  console.log('\n== Le client voit la correction');
  await aller(client, `/projets/${P}/brique/ios`, '[data-section="entete"]'); await pause(1200);
  const pc = await releverPage(client);
  verifier(pc.frise[0] === '2026-10-02' || pc.frise[0] === '2026-09-30', 'la page du client suit la base', pc.frise[0]);

  console.log('\n== Les règles, par REST, avec de vrais jetons');
  const [jCamille, jAgent] = await Promise.all(['camille.essai@exemple.test', 'agent.essai@exemple.test'].map(jetonPour));
  const patch = (jeton, champs) => fetch(`${bdd(`projets/${P}/composants/ios`)}?${Object.keys(champs).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: champs }),
  }).then((r) => r.status);
  const S = (v) => ({ stringValue: v });
  const lit = await fetch(bdd(`projets/${P}/composants/ios`), { headers: { Authorization: `Bearer ${jCamille}` } });
  verifier(lit.status === 200, 'le client du projet lit la partie (200)', String(lit.status));
  const ecritClient = await patch(jCamille, { sousTitre: S('Piraté') });
  verifier(ecritClient === 403, 'le client n\'écrit pas (403)', String(ecritClient));
  const ecritEquipe = await patch(jAgent, { sousTitre: S('Relu par REST') });
  verifier(ecritEquipe === 200, 'l\'équipe écrit (200)', String(ecritEquipe));
  const tropLong = await patch(jAgent, { resume: S('x'.repeat(1501)) });
  verifier(tropLong === 403, 'un résumé trop long est refusé, même à l\'équipe (403)', String(tropLong));
  const sousTitreLong = await patch(jAgent, { sousTitre: S('x'.repeat(161)) });
  verifier(sousTitreLong === 403, 'un sous-titre trop long aussi (403)', String(sousTitreLong));
  const tropDeLiens = await patch(jAgent, { liens: { arrayValue: { values: Array.from({ length: 9 }, () => ({ mapValue: { fields: { libelle: S('x'), url: S('https://exemple.test') } } })) } } });
  verifier(tropDeLiens === 403, 'neuf liens, un de trop (403)', String(tropDeLiens));
  const versionPiege = await patch(jAgent, { versionEnLigne: { mapValue: { fields: { numero: S('1.0'), pirate: S('x') } } } });
  verifier(versionPiege === 403, 'une version qui porte une clé inconnue est refusée (403)', String(versionPiege));
  const versionOk = await patch(jAgent, { versionEnLigne: { mapValue: { fields: { numero: S('1.1.2'), date: S('2026-09-10'), ou: S('App Store') } } } });
  verifier(versionOk === 200, 'une version bien formée passe (200)', String(versionOk));

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  if (erreurs.length) console.log('  ÉCART  erreurs JavaScript dans la page');
  process.exit(ecarts.length || erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
