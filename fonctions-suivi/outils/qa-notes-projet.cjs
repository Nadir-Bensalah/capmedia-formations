/* ==========================================================================
   CAPMEDIA CLIENT HUB · la page Notes d'un projet (#/projets/<p>/notes)

   L'ancienne page « Décisions », refaite en trois blocs : À valider,
   Décisions, Notes et idées (vues/notes-projet.js).

   Ce que prouve cette suite :
   - les règles, par REST avec les vrais jetons : l'équipe propose ; un
     collaborateur ne valide pas (403) ; une cliente d'un autre projet ne
     lit ni une proposition, ni une décision, ni une note du carnet (403) ;
     l'équipe ne lit pas une note privée (403), lit une note partagée ;
   - la cliente responsable coche : la proposition devient une décision,
     datée par le serveur, à son nom ; l'équipe en est prévenue (message
     dans la conversation, notification) ;
   - elle refuse une autre proposition avec un motif ;
   - une idée de son carnet passe dans « À valider » d'un geste, et quitte
     le carnet ;
   - les décisions qui existaient (semis) sont reprises dans « Décisions » ;
   - un collaborateur voit la case, sans pouvoir la cocher ;
   - le Cockpit voit tout ce qui est partagé, propose depuis la page, et
     ne voit jamais le texte d'une note privée ;
   - aucune erreur de page, ni « null », « undefined » ou tiret cadratin.

   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
const CAPTURES = process.env.CAPTURES_NOTES || '/private/tmp/claude-502/-Users-izicode-ForgeMe/88b4c411-a61c-4a15-accb-75f5cd3d4339/scratchpad/notes2';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `${RACINE}/${c}`;
const nomDoc = (c) => `projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const docs = async (c) => (((await lire(c)) || {}).documents || []);
const vider = async (col) => { for (const d of await docs(`${col}?pageSize=300`)) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const carte = (d, n) => (champ(d, n).mapValue || {}).fields || {};
const S = (v) => ({ stringValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const uidDe = async (email) => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const ouvrirCompte = async (email) => {
  if (await uidDe(email)) return uidDe(email);
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=cle-du-banc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `Banc-${Date.now()}-x`, returnSecureToken: true }) });
  return ((await r.json()) || {}).localId || '';
};
const statutLecture = async (chemin, jeton) => (await fetch(bdd(chemin), { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })).status;
const statutCommit = async (jeton, writes) => (await fetch(`${RACINE}:commit`, { method: 'POST', headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
const dernierCode = async (e) => { for (let i = 0; i < 40; i += 1) { const p = (await docs('envois?pageSize=200')).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
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
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await pause(1500); };
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = await fn(); if (v) return v; } catch (e) { /* on réessaie */ } await pause(400); } return null; };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

/* Une proposition de l'équipe, telle que l'écran du Cockpit l'écrit. */
const propositionEquipe = (id, uid, titre) => ({
  update: { name: nomDoc(`notes/${id}`), fields: { projet: S('atelier'), type: S('proposition'), etat: S('a-valider'), origine: S('equipe'), visibilite: S('client'), titre: S(titre), contenu: S('Proposé par le banc.'), composant: S(''), plateforme: S(''), contexte: S(''), impact: S(''), decidePar: S(''), par: M({ uid: S(uid), nom: S('Alex Durand') }) } },
  updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'cree', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});
/* La réponse d'une personne, telle que la page l'écrit. */
const reponse = (id, uid, etat, motif = '') => ({
  update: { name: nomDoc(`notes/${id}`), fields: { etat: S(etat), reponse: M({ par: S(uid), nom: S('Banc'), motif: S(motif) }) } },
  updateMask: { fieldPaths: ['etat', 'reponse', 'maj'] },
  updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'reponse.date', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: true },
});
const noteCarnet = (id, uid, texte, partagee) => ({
  update: { name: nomDoc(`notesClient/${id}`), fields: { uid: S(uid), nom: S('Camille Martin'), projet: S('atelier'), texte: S(texte), epinglee: B(false), partagee: B(partagee) } },
  updateTransforms: [{ fieldPath: 'cree', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.notes@exemple.test';
  await vider('notesClient');
  for (const d of await docs('notes?pageSize=300')) if (str(d, 'type') === 'proposition') await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop });
  const uidAdmin = await uidDe(ADMIN); const uidCamille = await uidDe(CAMILLE);
  const uidCollab = await ouvrirCompte(COLLAB);
  const atelier = await lire('projets/atelier');
  const membres = ((champ(atelier, 'membres').arrayValue || {}).values || []).map((v) => v.stringValue);
  const roles = async (r) => poser('projets/atelier', { membres: L([...new Set([...membres, uidCollab])].map(S)), roles: M(Object.fromEntries(Object.entries(r).map(([u, v]) => [u, S(v)]))) }, ['membres', 'roles']);
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });
  const jA = await jetonPour(ADMIN); const jC = await jetonPour(CAMILLE); const jCo = await jetonPour(COLLAB); const jL = await jetonPour(LEA);
  const decisionSemee = (await docs('notes?pageSize=300')).find((d) => str(d, 'projet') === 'atelier' && str(d, 'type') === 'decision');
  verifier(Boolean(decisionSemee), 'le semis porte une décision existante sur Atelier', decisionSemee ? str(decisionSemee, 'titre') : '');
  const idDecision = decisionSemee ? decisionSemee.name.split('/').pop() : '';

  console.log('\n== Les règles, avec les vrais jetons');
  verifier(await statutCommit(jA, [propositionEquipe('qa-valider', uidAdmin, 'Garder la connexion par e-mail seule en V1')]) === 200, 'l équipe propose à la validation');
  verifier(await statutCommit(jA, [propositionEquipe('qa-refuser', uidAdmin, 'Retirer l export PDF')]) === 200, 'et une seconde proposition');
  verifier(await statutCommit(jCo, [reponse('qa-valider', uidCollab, 'validee')]) === 403, 'un collaborateur ne valide pas (403)');
  verifier(await statutCommit(jL, [reponse('qa-valider', await uidDe(LEA), 'validee')]) === 403, 'une cliente d un autre projet non plus (403)');
  verifier(await statutLecture('notes/qa-valider', jL) === 403, 'elle ne lit pas la proposition (403)');
  verifier(!idDecision || await statutLecture(`notes/${idDecision}`, jL) === 403, 'ni la décision existante (403)');
  verifier(await statutLecture('notes/qa-valider', jCo) === 200, 'le collaborateur lit la proposition');
  verifier(await statutCommit(jC, [noteCarnet('qa-privee', uidCamille, 'Note privée du banc', false)]) === 200, 'Camille garde une note privée');
  verifier(await statutLecture('notesClient/qa-privee', jA) === 403, 'l équipe ne la lit pas (403)');
  verifier(await statutLecture('notesClient/qa-privee', jL) === 403, 'l autre cliente non plus (403)');

  const nav = await chromium.launch();
  const erreurs = [];
  const ctxC = await nav.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await ctxC.addInitScript(() => { try { localStorage.setItem('suivi:hub-theme', 'light'); } catch (e) { /* rien */ } });
  page = await ctxC.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, CAMILLE);

  console.log('\n== Camille, responsable : la page Notes');
  await aller(page, '#/projets/atelier/notes');
  await attendre(async () => page.$('.page-notes [data-proposition="qa-valider"]'), 20000);
  const ordre = await page.$$eval('.page-notes > section', (els) => els.map((e) => e.id));
  verifier(ordre.join(',') === 'a-valider,decisions,notes-et-idees', 'trois blocs, dans l ordre : À valider, Décisions, Notes et idées', ordre.join(','));
  verifier(/^Notes/.test(await page.$eval('.page-notes h1', (e) => e.textContent.trim())), 'la page s appelle Notes');
  const blocDecisions = await page.textContent('#decisions');
  verifier(/Conserver Stripe pour les paiements/.test(blocDecisions) && /Consignée par Capmedia le/.test(blocDecisions), 'la décision existante est reprise, datée, consignée par Capmedia');
  verifier(await page.$eval('[data-valider="qa-valider"]', (e) => !e.disabled), 'la case est cochable pour la responsable');

  console.log('\n== Valider : la proposition devient une décision datée, à son nom');
  await page.check('[data-valider="qa-valider"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  const validee = await attendre(async () => { const d = await lire('notes/qa-valider'); return str(d, 'etat') === 'validee' ? d : null; });
  const rep = carte(validee, 'reponse');
  verifier(Boolean(validee), 'la proposition est « validee » en base');
  verifier(((rep.par || {}).stringValue) === uidCamille, 'à son nom (uid)', (rep.par || {}).stringValue);
  verifier(Boolean((rep.date || {}).timestampValue) && Math.abs(Date.now() - new Date(rep.date.timestampValue).getTime()) < 120000, 'datée par le serveur, maintenant', (rep.date || {}).timestampValue);
  const ligneDecision = await attendre(async () => { const t = await page.textContent('#decisions'); return /Garder la connexion par e-mail seule en V1/.test(t) ? t : null; }) || '';
  verifier(/Validée par vous le/.test(ligneDecision), 'elle s affiche dans Décisions : « Validée par vous le … »');
  verifier(!(await page.$('#a-valider [data-proposition="qa-valider"]')), 'et quitte « À valider »');
  const message = await attendre(async () => (await docs('projets/atelier/messages?pageSize=300')).find((m) => /Validé : « Garder la connexion/.test(str(m, 'texte'))), 15000);
  verifier(Boolean(message), 'l équipe est prévenue dans la conversation du projet');
  const notif = await attendre(async () => (await docs(`boites/${uidAdmin}/notifications?pageSize=300`)).find((n) => /Validé : « Garder la connexion/.test(str(n, 'texte'))), 30000);
  verifier(Boolean(notif), 'et reçoit une notification (hubMessageProjet)');

  console.log('\n== Refuser, avec un motif');
  await page.click('[data-notes-geste="refuser"][data-id="qa-refuser"]');
  await page.waitForSelector('.voile #refus-motif', { timeout: 8000 });
  await page.click('.voile [data-refus-ok]');
  await pause(500);
  verifier(str(await lire('notes/qa-refuser'), 'etat') === 'a-valider', 'sans motif, rien ne part');
  await page.fill('.voile #refus-motif', 'Nos clients s en servent chaque mois.');
  await page.click('.voile [data-refus-ok]');
  const refusee = await attendre(async () => { const d = await lire('notes/qa-refuser'); return str(d, 'etat') === 'refusee' ? d : null; });
  verifier(Boolean(refusee) && ((carte(refusee, 'reponse').motif || {}).stringValue) === 'Nos clients s en servent chaque mois.', 'refusée en base, avec le motif');
  await attendre(async () => page.$('[data-refusees]'));
  await page.click('[data-refusees] > summary');
  const blocRefus = await page.textContent('[data-refusees]').catch(() => '');
  verifier(/Retirer l export PDF/.test(blocRefus) && /Refusée par vous le/.test(blocRefus) && /Nos clients s en servent/.test(blocRefus), 'elle reste visible, marquée refusée, avec le motif');

  console.log('\n== Une idée du carnet passe dans « À valider »');
  verifier(/Note privée du banc/.test(await page.textContent('#notes-et-idees')), 'le carnet du projet montre la note privée de Camille');
  await page.click('#notes-idees [data-note-geste="ouvrir"]');
  await page.fill('#notes-idees [data-note-champ="nouvelle"]', 'Un mode sombre pour le soir');
  await page.press('#notes-idees [data-note-champ="nouvelle"]', 'Enter');
  const idee = await attendre(async () => (await docs('notesClient?pageSize=100')).find((d) => str(d, 'texte') === 'Un mode sombre pour le soir'));
  verifier(Boolean(idee) && str(idee, 'projet') === 'atelier', 'l idée naît dans le carnet, rattachée au projet');
  const idIdee = idee ? idee.name.split('/').pop() : '';
  await attendre(async () => page.$(`#notes-idees [data-note-geste="proposer"][data-note-id="${idIdee}"]`));
  await page.click(`#notes-idees [data-note-geste="proposer"][data-note-id="${idIdee}"]`);
  const proposee = await attendre(async () => (await docs('notes?pageSize=300')).find((d) => str(d, 'origine') === 'client' && str(d, 'titre') === 'Un mode sombre pour le soir'));
  verifier(Boolean(proposee) && str(proposee, 'etat') === 'a-valider' && ((carte(proposee, 'par').uid || {}).stringValue) === uidCamille, 'une proposition « à valider » naît, au nom de Camille');
  verifier(await attendre(async () => !(await docs('notesClient?pageSize=100')).some((d) => d.name.endsWith(`/${idIdee}`))), 'et l idée quitte le carnet (jamais deux fois)');
  const idPropose = proposee ? proposee.name.split('/').pop() : '';
  const lignePropose = await attendre(async () => { const t = await page.textContent(`#a-valider [data-proposition="${idPropose}"]`).catch(() => ''); return /Proposée par vous/.test(t) ? t : null; });
  verifier(Boolean(lignePropose), 'elle s affiche dans « À valider », proposée par vous');

  console.log('\n== Partager une note avec Capmedia');
  await page.click('#notes-idees [data-note-geste="partager"][data-note-id="qa-privee"]');
  await page.waitForSelector('.voile [data-note-partager-ok]', { timeout: 8000 });
  await page.click('.voile [data-note-partager-ok]');
  verifier(await attendre(async () => (await lire('notesClient/qa-privee')).fields.partagee.booleanValue === true), 'la note est partagée');
  verifier(await statutLecture('notesClient/qa-privee', jA) === 200, 'l équipe la lit désormais');
  verifier(await statutCommit(jC, [noteCarnet('qa-secret', uidCamille, 'Secret du banc, jamais partagé', false)]) === 200, 'Camille garde une autre note, privée');
  await pause(1500);
  await page.evaluate(() => document.querySelectorAll('.toasts').forEach((t) => t.remove()));
  await page.screenshot({ path: `${CAPTURES}/notes-client-clair.png`, fullPage: true });
  const texteClient = await page.textContent('.page-notes');
  verifier(!/\bnull\b|\bundefined\b|NaN|—/.test(texteClient), 'ni « null », ni « undefined », ni tiret cadratin dans la page');

  console.log('\n== Un collaborateur : la case, sans pouvoir la cocher');
  await roles({ [uidCamille]: 'collaborateur', [uidCollab]: 'responsable' });
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  await aller(page, '#/projets/atelier/notes');
  await attendre(async () => page.$(`[data-valider="${idPropose}"]`));
  verifier(await page.$eval(`[data-valider="${idPropose}"]`, (e) => e.disabled).catch(() => false), 'la case est grisée pour un collaborateur');
  verifier(!(await page.$('[data-notes-geste="refuser"]')), 'et il n a pas de bouton Refuser');
  verifier(/valide ou refuse ces propositions/.test(await page.textContent('#a-valider')), 'la page dit qui valide');
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });

  console.log('\n== Le Cockpit');
  const ctxA = await nav.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await ctxA.addInitScript(() => { try { localStorage.setItem('suivi:cockpit-theme', 'dark'); } catch (e) { /* rien */ } });
  const equipe = await ctxA.newPage();
  equipe.on('pageerror', (e) => erreurs.push(`cockpit : ${e.message.slice(0, 160)}`));
  await connecter(equipe, ADMIN);
  await aller(equipe, '#/projets/atelier/notes');
  await attendre(async () => equipe.$(`.page-notes [data-proposition="${idPropose}"]`), 20000);
  const tout = await equipe.textContent('.page-notes').catch(() => '');
  verifier(/Un mode sombre pour le soir/.test(tout), 'l équipe voit l idée proposée par Camille');
  verifier(/Validée par Camille Martin le/.test(tout), 'et la décision, validée par Camille Martin (nom de l annuaire)');
  verifier(/Note privée du banc/.test(tout), 'et la note partagée');
  verifier(!/Secret du banc/.test(tout), 'jamais la note privée');
  verifier(!(await equipe.$('[data-valider]')), 'l équipe ne coche pas à la place du client');
  await equipe.click('[data-notes-geste="proposer"]');
  await equipe.waitForSelector('.voile #prop-titre', { timeout: 8000 });
  await equipe.fill('.voile #prop-titre', 'Publier sur Android en premier');
  await equipe.click('.voile [data-prop-ok]');
  const parEquipe = await attendre(async () => (await docs('notes?pageSize=300')).find((d) => str(d, 'titre') === 'Publier sur Android en premier'));
  verifier(Boolean(parEquipe) && str(parEquipe, 'etat') === 'a-valider' && str(parEquipe, 'origine') === 'equipe' && str(parEquipe, 'visibilite') === 'client', 'l équipe propose depuis la page (à valider, visible du client)');
  verifier(Boolean(await attendre(async () => /Publier sur Android en premier/.test(await page.textContent('#a-valider')))), 'la proposition arrive en direct chez Camille');
  await pause(1200);
  await equipe.evaluate(() => document.querySelectorAll('.toasts').forEach((t) => t.remove()));
  await equipe.screenshot({ path: `${CAPTURES}/notes-cockpit-sombre.png`, fullPage: true });
  verifier(!/\bnull\b|\bundefined\b|NaN|—/.test(await equipe.textContent('.page-notes')), 'ni « null », ni « undefined », ni tiret cadratin côté Cockpit');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  await vider('notesClient');
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-notes-projet-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
