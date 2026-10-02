require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · « Ce qui va être testé » à l'épreuve

   Le plan de tests d'un projet (projets/{p}/planTests), du fichier à
   l'écran, des deux côtés :

   1. l'outil d'import : à blanc par défaut, un fichier invalide refusé en
      disant pourquoi, --production refusé sur l'émulateur, puis le
      versement des sections d'exemple (exemples/plan-tests) sur Atelier ;
   2. le Cockpit : le bouton en tête de la page Tests, la page, ses
      chiffres, son sommaire, le repli des sections longues, les filtres
      (plateforme, aspect, priorité, recherche), « déjà couvert par » ;
   3. l'édition par l'équipe : titre et résumé d'une section, un scénario
      ajouté, modifié, déplacé d'aspect, supprimé, la présentation
      réécrite, le tiret cadratin refusé ; puis l'import qui épargne une
      section retouchée, sauf --ecraser ;
   4. le client : le même bouton, la même page en lecture seule, sans un
      seul bouton d'édition, la présentation réécrite par l'équipe ; un
      client d'un autre projet n'y lit rien ;
   5. les règles, par REST avec de vrais jetons : le client du projet lit,
      un client d'un autre projet non, le client n'écrit pas, l'équipe
      écrit (forme bornée), le testeur du projet lit.

   Banc : émulateurs, site local, semer-suivi, semer-campagne.
     node fonctions-suivi/outils/qa-plan-tests.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour, uidDe } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d';
const SITE = BANC.site;
const P = 'atelier';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const proprietaire = { Authorization: 'Bearer owner' };
const racineDocs = `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${racineDocs}/${c}`;
const lire = async (c) => lireRest(bdd(c), proprietaire);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: proprietaire }); };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

/* Les sections d'exemple, lues ici aussi : les chiffres attendus se
   calculent depuis les fichiers, pas à la main. */
const EXEMPLES = path.join(__dirname, 'exemples', 'plan-tests');
const INVALIDES = path.join(__dirname, 'exemples', 'plan-tests-invalides');
const sections = fs.readdirSync(EXEMPLES).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(EXEMPLES, f), 'utf8')));
const ASPECTS = ['fonctionnel', 'technique', 'ux', 'securite'];
const tous = sections.flatMap((s) => ASPECTS.flatMap((a) => s.aspects[a].map((x) => ({ ...x, aspect: a, section: s.id }))));

const importer = (args) => {
  try {
    const sortie = execFileSync(process.execPath, [path.join(__dirname, 'plan-tests-importer.mjs'), ...args], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
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
const compteAffiche = async (page) => parseInt(((await page.textContent('#plan-resultat').catch(() => '')) || '').replace(/\D+/g, ''), 10);
const champDoc = (d, n) => (((d || {}).fields || {})[n]) || {};
const aspectDe = async (sid, aspect) => {
  const d = await lire(`projets/${P}/planTests/${sid}`);
  return ((((champDoc(d, 'aspects').mapValue || {}).fields || {})[aspect] || {}).arrayValue || {}).values || [];
};
const idsDe = (valeurs) => valeurs.map((v) => (((v.mapValue || {}).fields || {}).id || {}).stringValue);

/* Une écriture REST au nom d'une personne, avec la marque du serveur sur
   « maj » (les règles l'exigent) et un masque : le reste du document est
   gardé, comme le ferait le Cockpit. */
const ecrireRest = async (jeton, chemin, fields, masque) => fetch(`${racineDocs}:commit`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes: [{
    update: { name: `projects/${PROJET}/databases/(default)/documents/${chemin}`, fields },
    updateMask: { fieldPaths: masque },
    updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  }] }),
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
  await vider(`projets/${P}/planTests`);
  const blanc = importer([P, EXEMPLES]);
  verifier(blanc.code === 0 && /À blanc/.test(blanc.sortie) && /4 sections valides/.test(blanc.sortie), 'à blanc par défaut, les quatre sections d\'exemple sont valides', blanc.sortie.slice(-300));
  verifier(!((await lire(`projets/${P}/planTests?pageSize=10`)) || {}).documents, 'à blanc, rien n\'est écrit');
  const mauvais = importer([P, INVALIDES]);
  verifier(mauvais.code === 1 && /REFUSÉ\s+mauvais-groupe\.json/.test(mauvais.sortie) && /REFUSÉ\s+tronque\.json/.test(mauvais.sortie), 'un fichier invalide est refusé, nommé', `code ${mauvais.code}`);
  verifier(/tiret cadratin/.test(mauvais.sortie) && /groupe : "divers" inconnu/.test(mauvais.sortie) && /JSON illisible/.test(mauvais.sortie) && /type "bizarre" inconnu/.test(mauvais.sortie), 'et la raison est dite (cadratin, groupe, JSON, type)');
  const prod = importer([P, EXEMPLES, '--vrai', '--production']);
  verifier(prod.code === 2 && /contradictoire/.test(prod.sortie), '--production avec l\'émulateur branché est refusé, rien n\'est fait', prod.sortie.slice(-200));
  const vrai = importer([P, EXEMPLES, '--vrai']);
  verifier(vrai.code === 0 && /4 sections versées/.test(vrai.sortie), 'avec --vrai, les quatre sections sont versées sur l\'émulateur', vrai.sortie.slice(-300));
  const versees = ((await lire(`projets/${P}/planTests?pageSize=50`)) || {}).documents || [];
  verifier(versees.length === 5 && versees.some((d) => d.name.endsWith('/presentation')), 'quatre sections et la présentation en base', `${versees.length} documents`);

  console.log('\n== Le Cockpit : le bouton et la page');
  const cockpit = await ouvrir();
  await connecter(cockpit, 'agent.essai@exemple.test');
  await aller(cockpit, `/tests?projet=${P}`, '[data-plan-tests]');
  const bouton = await cockpit.evaluate(() => {
    const b = document.querySelector('.page-tete [data-plan-tests]');
    const avancement = [...document.querySelectorAll('.page *')].find((x) => /Avancement/.test(x.textContent || '') && x.children.length === 0);
    return { ici: !!b, texte: b ? b.textContent.trim() : '', avant: b && avancement ? Boolean(b.compareDocumentPosition(avancement) & Node.DOCUMENT_POSITION_FOLLOWING) : !!b };
  });
  verifier(bouton.ici && /Ce qui va être testé/.test(bouton.texte), 'le bouton « Ce qui va être testé » est en tête de la page Tests', bouton.texte);
  verifier(bouton.avant, 'il vient avant le bloc Avancement');
  await cockpit.click('.page-tete [data-plan-tests]');
  await cockpit.waitForSelector('.plan-section', { timeout: 20000 }).catch(() => {});
  await pause(700);
  verifier(/#\/tests\/plan\?projet=atelier/.test(cockpit.url()), 'il ouvre la page dédiée du projet', cockpit.url());
  const page1 = await cockpit.evaluate(() => ({
    sections: document.querySelectorAll('.plan-section').length,
    sommaire: document.querySelectorAll('.plan-sommaire a').length,
    groupes: [...document.querySelectorAll('.plan-sommaire .etage-sur')].map((x) => x.textContent.trim()),
    chiffres: [...document.querySelectorAll('.plan-chiffres .metrique')].map((m) => [m.querySelector('.metrique-libelle').textContent.trim(), m.querySelector('.metrique-valeur').textContent.trim()]),
    aspects: [...document.querySelectorAll('.plan-aspect-carte')].map((x) => x.querySelector('.plan-aspect-n').textContent.trim()),
    intro: (document.querySelector('.plan-intro-texte') || {}).textContent || '',
    texte: document.querySelector('.page').innerText,
  }));
  verifier(page1.sections === 4 && page1.sommaire === 4, 'quatre sections, quatre entrées au sommaire', `${page1.sections} / ${page1.sommaire}`);
  verifier(page1.groupes.join('|') === 'Démarrage et compte|Les fonctionnalités|Tests transverses', 'le sommaire est rangé par groupe, dans l\'ordre', page1.groupes.join('|'));
  const chiffre = (nom) => (page1.chiffres.find(([l]) => l === nom) || [])[1];
  verifier(chiffre('Sections') === '4' && chiffre('Scénarios') === String(tous.length), `les chiffres : 4 sections, ${tous.length} scénarios`, JSON.stringify(page1.chiffres));
  verifier(chiffre('Sur Web') === String(tous.filter((x) => x.plateformes.includes('web')).length) && chiffre('Sur iOS') === String(tous.filter((x) => x.plateformes.includes('ios')).length), 'les chiffres par plateforme');
  verifier(chiffre('En priorité haute') === String(tous.filter((x) => x.priorite === 'haute').length), 'les scénarios de priorité haute');
  verifier(page1.aspects.join(',') === ASPECTS.map((a) => tous.filter((x) => x.aspect === a).length).join(','), 'un compte par aspect, sous son explication', page1.aspects.join(','));
  verifier(page1.intro.length > 80, 'une introduction en tête de page');
  verifier(!/\bundefined\b|\bnull\b|NaN/.test(page1.texte) && !page1.texte.includes('—'), 'ni « undefined », ni « null », ni tiret cadratin à l\'écran');

  console.log('\n== Le repli des sections longues');
  const replis = await cockpit.evaluate(() => ({
    tachesScenarios: document.querySelectorAll('#plan-taches .plan-scenario').length,
    tachesBouton: ((document.querySelector('[data-plier-section="taches"]') || {}).textContent || '').trim(),
    notesScenarios: document.querySelectorAll('#plan-notes .plan-scenario').length,
    notesBouton: !!document.querySelector('[data-plier-section="notes"]'),
  }));
  const nTaches = tous.filter((x) => x.section === 'taches').length;
  verifier(replis.tachesScenarios === 0 && replis.tachesBouton === `Voir les ${nTaches} scénarios`, 'une section longue arrive repliée, et dit combien elle garde', JSON.stringify(replis));
  verifier(replis.notesScenarios === tous.filter((x) => x.section === 'notes').length && !replis.notesBouton, 'une section courte est ouverte, sans bouton de repli');
  await cockpit.click('[data-plier-section="taches"]'); await pause(500);
  verifier(await cockpit.$$eval('#plan-taches .plan-scenario', (l) => l.length) === nTaches, 'déplier montre tous ses scénarios');
  const couvert = await cockpit.evaluate(() => ((document.querySelector('#sc-taches-f-002 .plan-refs') || {}).textContent || '').trim());
  verifier(/^Déjà couvert par TA-12$/.test(couvert), '« déjà couvert par » et la référence', couvert);
  const astuce = await cockpit.evaluate(() => (document.querySelector('#sc-taches-f-002 .plan-refs .ref') || {}).dataset || {});
  verifier(Boolean(astuce.astuce), 'la référence porte le titre du scénario de la bibliothèque');
  await cockpit.click('[data-plier-section="taches"]'); await pause(400);
  verifier(await cockpit.$$eval('#plan-taches .plan-scenario', (l) => l.length) === 0, 'et se replie');

  console.log('\n== Les filtres');
  await cockpit.click('[data-filtre="aspect"][data-valeur="securite"]'); await pause(1200);
  const sec = await cockpit.evaluate(() => ({ aspects: [...new Set([...document.querySelectorAll('.plan-aspect')].map((x) => x.dataset.aspect))], url: location.hash }));
  verifier(await compteAffiche(cockpit) === tous.filter((x) => x.aspect === 'securite').length && sec.aspects.join() === 'securite', 'aspect Sécurité : seuls ses scénarios restent', JSON.stringify(sec));
  verifier(/aspect=securite/.test(sec.url), 'le filtre tient dans l\'adresse');
  await cockpit.click('[data-filtre="aspect"][data-valeur=""]'); await pause(900);
  await cockpit.click('[data-filtre="plateforme"][data-valeur="web"]'); await pause(1200);
  verifier(await compteAffiche(cockpit) === tous.filter((x) => x.plateformes.includes('web')).length, 'plateforme Web : le compte suit');
  const horsWeb = await cockpit.evaluate(() => [...document.querySelectorAll('.plan-scenario-pied')].filter((p) => !/Web/.test(p.textContent)).length);
  verifier(horsWeb === 0, 'aucun scénario affiché ne manque le web');
  await cockpit.click('[data-filtre="plateforme"][data-valeur=""]'); await pause(900);
  await cockpit.click('[data-filtre="priorite"][data-valeur="haute"]'); await pause(1200);
  verifier(await compteAffiche(cockpit) === tous.filter((x) => x.priorite === 'haute').length, 'priorité haute : le compte suit');
  await cockpit.click('[data-filtre="priorite"][data-valeur=""]'); await pause(900);
  await cockpit.fill('#plan-recherche', 'emojis'); await pause(700);
  const recherche = await cockpit.evaluate(() => [...document.querySelectorAll('.plan-scenario h4')].map((x) => x.textContent));
  verifier(recherche.length === 1 && /émojis/.test(recherche[0]), 'la recherche ignore les accents et déplie ce qu\'elle trouve', JSON.stringify(recherche));
  verifier(await cockpit.evaluate(() => document.activeElement && document.activeElement.id === 'plan-recherche'), 'le champ de recherche garde la main pendant la saisie');
  await cockpit.fill('#plan-recherche', 'zzz introuvable'); await pause(700);
  verifier(await cockpit.evaluate(() => /Aucun scénario ne correspond/.test(document.querySelector('#plan-liste').textContent)), 'rien trouvé : un état vide qui le dit');
  await cockpit.fill('#plan-recherche', ''); await pause(700);

  console.log('\n== L\'édition par l\'équipe');
  const uidAgent = await uidDe('agent.essai@exemple.test');
  await cockpit.click('[data-editer-section="notes"]');
  await cockpit.waitForSelector('#ed-titre', { timeout: 8000 });
  await cockpit.fill('#ed-titre', 'Notes — rapides');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(500);
  const refusCadratin = await cockpit.evaluate(() => ({ ouverte: !!document.querySelector('#ed-forme'), erreur: ((document.querySelector('.erreur-champ') || {}).textContent || '') }));
  verifier(refusCadratin.ouverte && /cadratin/.test(refusCadratin.erreur), 'un tiret cadratin est refusé, la feuille reste ouverte', JSON.stringify(refusCadratin));
  await cockpit.fill('#ed-titre', 'Notes rapides, relues');
  await cockpit.fill('#ed-resume', 'Résumé relu par l\'équipe.');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  const notes = await lire(`projets/${P}/planTests/notes`);
  verifier(champDoc(notes, 'titre').stringValue === 'Notes rapides, relues' && champDoc(notes, 'resume').stringValue === 'Résumé relu par l\'équipe.', 'titre et résumé de la section enregistrés');
  verifier(champDoc(notes, 'editePar').stringValue === uidAgent && Boolean(champDoc(notes, 'editeLe').timestampValue), 'l\'écriture dit qui et quand');
  verifier(await cockpit.evaluate(() => /Notes rapides, relues/.test(document.querySelector('#plan-notes h2').textContent)), 'la page se met à jour d\'elle-même');

  await cockpit.click('[data-ajouter-scenario="notes"][data-aspect="technique"]');
  await cockpit.waitForSelector('#ed-titre', { timeout: 8000 });
  await cockpit.fill('#ed-titre', 'Cent notes ouvertes d\'un coup');
  await cockpit.fill('#ed-etapes', 'Créer cent notes, puis ouvrir la liste.');
  await cockpit.fill('#ed-attendu', 'La liste s\'ouvre en moins d\'une seconde.');
  await cockpit.selectOption('#ed-type', 'limite');
  await cockpit.selectOption('#ed-priorite', 'haute');
  await cockpit.fill('#ed-refs', 'ta-12');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  const tech = await aspectDe('notes', 'technique');
  const ajoute = tech.find((v) => v.mapValue.fields.id.stringValue === 'notes-t-001');
  verifier(Boolean(ajoute) && ajoute.mapValue.fields.priorite.stringValue === 'haute' && ajoute.mapValue.fields.type.stringValue === 'limite', 'un scénario ajouté prend la référence suivante de son aspect (notes-t-001)', JSON.stringify(idsDe(tech)));
  verifier(ajoute && JSON.stringify(ajoute.mapValue.fields.refs).includes('TA-12'), 'ses références sont remises en majuscules');
  verifier(await cockpit.evaluate(() => !!document.querySelector('#sc-notes-t-001')), 'il apparaît dans la page');

  await cockpit.click('[data-editer-scenario="notes-t-001"]');
  await cockpit.waitForSelector('#ed-titre', { timeout: 8000 });
  await cockpit.fill('#ed-titre', 'Cent notes, relu');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  verifier(((await aspectDe('notes', 'technique')).find((v) => v.mapValue.fields.id.stringValue === 'notes-t-001') || { mapValue: { fields: { titre: {} } } }).mapValue.fields.titre.stringValue === 'Cent notes, relu', 'un scénario modifié garde sa référence');
  await cockpit.click('[data-editer-scenario="notes-t-001"]');
  await cockpit.waitForSelector('#ed-aspect', { timeout: 8000 });
  await cockpit.selectOption('#ed-aspect', 'securite');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  const sec2 = idsDe(await aspectDe('notes', 'securite'));
  verifier(sec2.includes('notes-s-001') && !idsDe(await aspectDe('notes', 'technique')).includes('notes-t-001'), 'changer d\'aspect déplace le scénario sous une nouvelle référence', JSON.stringify(sec2));
  await cockpit.click('[data-supprimer-scenario="notes-s-001"]');
  await cockpit.waitForSelector('[data-oui]', { timeout: 8000 });
  await cockpit.click('[data-oui]'); await pause(1500);
  verifier(!idsDe(await aspectDe('notes', 'securite')).includes('notes-s-001'), 'un scénario supprimé quitte la base');
  verifier(await cockpit.evaluate(() => !document.querySelector('#sc-notes-s-001')), 'et la page');

  await cockpit.click('[data-editer-presentation]');
  await cockpit.waitForSelector('#ed-intro', { timeout: 8000 });
  await cockpit.fill('#ed-intro', 'Introduction relue par l\'équipe pour le client.');
  await cockpit.fill('#ed-aspect-ux', 'Phrase relue sur l\'expérience.');
  await cockpit.click('button[type="submit"][form="ed-forme"]'); await pause(1500);
  const pres = await lire(`projets/${P}/planTests/presentation`);
  verifier(champDoc(pres, 'intro').stringValue === 'Introduction relue par l\'équipe pour le client.', 'la présentation se réécrit depuis le Cockpit');

  console.log('\n== L\'import épargne ce que l\'équipe a retouché');
  const epargne = importer([P, EXEMPLES, '--vrai']);
  verifier(/laissées telles quelles[^\n]*notes/.test(epargne.sortie) && champDoc(await lire(`projets/${P}/planTests/notes`), 'titre').stringValue === 'Notes rapides, relues', 'une section retouchée n\'est pas écrasée par l\'import', epargne.sortie.slice(-300));
  verifier(champDoc(await lire(`projets/${P}/planTests/presentation`), 'intro').stringValue === 'Introduction relue par l\'équipe pour le client.', 'la présentation n\'est jamais réécrite par l\'import');
  const ecrase = importer([P, EXEMPLES, '--vrai', '--ecraser']);
  verifier(ecrase.code === 0 && champDoc(await lire(`projets/${P}/planTests/notes`), 'titre').stringValue === 'Notes rapides', 'avec --ecraser, la section revient au fichier');

  console.log('\n== Le client du projet : la même page, en lecture seule');
  const client = await ouvrir();
  await connecter(client, 'camille.essai@exemple.test');
  await aller(client, '/tests', '[data-plan-tests]');
  verifier(await client.evaluate(() => !!document.querySelector('.page-tete [data-plan-tests]')), 'le bouton « Ce qui va être testé » est en tête de sa page Tests');
  await client.click('.page-tete [data-plan-tests]');
  await client.waitForSelector('.plan-section', { timeout: 20000 }).catch(() => {});
  await pause(700);
  const vu = await client.evaluate(() => ({
    sections: document.querySelectorAll('.plan-section').length,
    edition: document.querySelectorAll('[data-editer-scenario], [data-supprimer-scenario], [data-editer-section], [data-ajouter-scenario], [data-editer-presentation]').length,
    intro: (document.querySelector('.plan-intro-texte') || {}).textContent || '',
    ux: [...document.querySelectorAll('.plan-aspect-phrase')].map((x) => x.textContent),
    texte: document.querySelector('.page').innerText,
  }));
  verifier(vu.sections === 4, 'le client lit les quatre sections', String(vu.sections));
  verifier(vu.edition === 0, 'aucun bouton d\'édition chez le client', `${vu.edition} bouton(s)`);
  verifier(vu.intro === 'Introduction relue par l\'équipe pour le client.' && vu.ux.includes('Phrase relue sur l\'expérience.'), 'il lit la présentation telle que l\'équipe l\'a écrite');
  verifier(!/\bundefined\b|\bnull\b|NaN/.test(vu.texte) && !vu.texte.includes('—'), 'ni « undefined », ni « null », ni tiret cadratin chez le client');
  await client.click('[data-filtre="plateforme"][data-valeur="android"]'); await pause(1200);
  verifier(await compteAffiche(client) === tous.filter((x) => x.plateformes.includes('android')).length, 'les filtres marchent aussi chez le client');
  await aller(client, `/projets/${P}/tests`, '[data-plan-tests]');
  verifier(await client.evaluate(() => !!document.querySelector('[data-plan-tests][href*="tests/plan"]')), 'l\'onglet Tests de son projet porte aussi le bouton');

  console.log('\n== Un client d\'un autre projet');
  const autre = await ouvrir();
  await connecter(autre, 'lea.essai@exemple.test');
  await aller(autre, '/tests', '.page h1');
  verifier(await autre.evaluate(() => !document.querySelector('[data-plan-tests]')), 'pas de bouton sur un projet sans plan');
  await aller(autre, `/tests/plan?projet=${P}`, '.page h1');
  await pause(1200);
  verifier(await autre.evaluate(() => !document.querySelector('.plan-section')), 'l\'adresse du plan d\'un autre projet ne montre rien');

  console.log('\n== Les règles, par REST, avec de vrais jetons');
  const [jCamille, jLea, jAgent, jKarim] = await Promise.all(['camille.essai@exemple.test', 'lea.essai@exemple.test', 'agent.essai@exemple.test', 'karim.testeur@essai.test'].map(jetonPour));
  const lireAvec = async (jeton, chemin) => (await fetch(bdd(chemin), { headers: { Authorization: `Bearer ${jeton}` } })).status;
  verifier(await lireAvec(jCamille, `projets/${P}/planTests`) === 200 && await lireAvec(jCamille, `projets/${P}/planTests/taches`) === 200, 'le client du projet lit (200)');
  const lea = await lireAvec(jLea, `projets/${P}/planTests/taches`);
  verifier(lea === 403 && await lireAvec(jLea, `projets/${P}/planTests`) === 403, 'un client d\'un autre projet ne lit pas (403)', String(lea));
  const karim = await lireAvec(jKarim, `projets/${P}/planTests/taches`);
  verifier(karim === 200, 'le testeur inscrit sur le projet lit, comme la bibliothèque (200)', String(karim));
  const uidCamille = await uidDe('camille.essai@exemple.test');
  const ecritClient = await ecrireRest(jCamille, `projets/${P}/planTests/taches`, { titre: { stringValue: 'Piraté' }, editePar: { stringValue: uidCamille } }, ['titre', 'editePar']);
  verifier(ecritClient.status === 403, 'le client n\'écrit pas (403)', String(ecritClient.status));
  const creeClient = await ecrireRest(jCamille, `projets/${P}/planTests/nouvelle`, { titre: { stringValue: 'x' }, editePar: { stringValue: uidCamille } }, ['titre', 'editePar']);
  verifier(creeClient.status === 403, 'le client ne crée pas de section (403)', String(creeClient.status));
  const ecritEquipe = await ecrireRest(jAgent, `projets/${P}/planTests/taches`, { titre: { stringValue: 'Tâches, relu par REST' }, editePar: { stringValue: uidAgent } }, ['titre', 'editePar']);
  verifier(ecritEquipe.status === 200 && champDoc(await lire(`projets/${P}/planTests/taches`), 'titre').stringValue === 'Tâches, relu par REST', 'l\'équipe écrit (200)', String(ecritEquipe.status));
  const champInconnu = await ecrireRest(jAgent, `projets/${P}/planTests/taches`, { pirate: { stringValue: 'x' }, editePar: { stringValue: uidAgent } }, ['pirate', 'editePar']);
  verifier(champInconnu.status === 403, 'même l\'équipe ne pose pas un champ inconnu (403)', String(champInconnu.status));
  const sansAuteur = await ecrireRest(jAgent, `projets/${P}/planTests/taches`, { titre: { stringValue: 'Sans auteur' }, editePar: { stringValue: uidCamille } }, ['titre', 'editePar']);
  verifier(sansAuteur.status === 403, 'une écriture au nom d\'un autre est refusée (403)', String(sansAuteur.status));

  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  console.log('Erreurs JS :', erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
  if (erreurs.length) console.log('  ÉCART  erreurs JavaScript dans la page');
  process.exit(ecarts.length || erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
