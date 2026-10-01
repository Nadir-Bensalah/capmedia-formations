/* Le client face à ses demandes, ses tâches, ses points bloquants et ses
   validations (brief B du relevé des parcours), éprouvé dans le navigateur :
   un seul nom « En attente de vous » ; la réponse sur une tâche (statut
   « repondu », plus dans « En attente de vous ») ; la fiche d'un point
   bloquant et « C'est fait » ; le retrait d'une demande ; le motif de
   réouverture ; la suite d'une demande (lien gardé, « suivant » posé par le
   serveur) ; la pièce ajoutée après coup ; le formulaire (accept, aide des
   pièces, lien mal formé, aide de l'urgence, « Ce que vous attendez ») ; le
   motif d'un refus ; les pièces et l'accusé d'une validation ; une
   validation annulée et un identifiant inconnu.
   Banc : émulateurs, site local, semer-suivi. */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d'; const SITE = 'http://127.0.0.1:8787';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const B = (v) => ({ booleanValue: v }); const NUL = { nullValue: null };
const M = (fields) => ({ mapValue: { fields } }); const L = (values = []) => ({ arrayValue: values.length ? { values } : {} });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const champ = (d, n) => (((d || {}).fields || {})[n]) || {};
const str = (d, n) => champ(d, n).stringValue || '';
const sous = (d, n, m) => ((((champ(d, n).mapValue || {}).fields) || {})[m]) || {};
const taille = (d, n) => (((champ(d, n).arrayValue || {}).values) || []).length;
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
const attendreStatut = async (chemin, voulu, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const d = await lire(chemin); if (str(d, 'statut') === voulu) return true; await pause(500); } return false; };
const attendreChamp = async (chemin, nom, ok = (v) => Object.keys(v).length > 0, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const d = await lire(chemin); if (ok(champ(d, nom))) return true; await pause(500); } return false; };
const attendreNotification = async (uid, titre, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const j = await lire(`boites/${uid}/notifications?pageSize=200`); const n = ((j && j.documents) || []).find((d) => str(d, 'titre') === titre); if (n) return n; await pause(500); } return null; };
const uidDe = async (email) => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const aller = async (page, hash, selecteur, ms = 20000) => { await page.evaluate((c) => { location.hash = c; }, hash); await page.waitForSelector(selecteur, { timeout: ms }); await pause(600); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const deposer = async (page, selecteur, nom) => { await page.setInputFiles(selecteur, { name: nom, mimeType: 'image/png', buffer: PNG }); await page.waitForFunction((s) => { const zone = document.querySelector(s).closest('.modale-corps, form, .page'); return zone && zone.querySelector('.piece') && !zone.querySelector('.piece--envoi'); }, selecteur, { timeout: 20000 }); await pause(300); };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;

(async () => {
  const uid = await uidDe('camille.essai@exemple.test');
  const auteur = M({ uid: S(uid), nom: S('Camille Martin'), email: S('camille.essai@exemple.test'), cote: S('client') });
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== Scénario 8 : « En attente de vous », en tête de la page Demandes');
  await aller(page, '#/valider', '#en-attente');
  verifier(/#\/demandes$/.test(page.url()), 'l ancienne adresse #/valider mène à #/demandes', page.url());
  verifier((await page.textContent('.page h1')).trim() === 'Demandes', 'le titre de la page est « Demandes »');
  verifier(/^En attente de vous/.test((await page.textContent('#en-attente h2')).trim()), 'et la page s ouvre sur « En attente de vous »');
  const ariane = (await page.textContent('#ariane').catch(() => '')) || '';
  verifier(/Demandes/.test(ariane) && !/À valider/.test(ariane), 'le fil d Ariane dit « Demandes », sans « À valider »', ariane.trim().slice(0, 80));
  verifier(/^Demandes/.test(await page.title()), 'comme le titre de l onglet');
  const ordre = await page.$$eval('.page section[id]', (els) => els.map((e) => e.id));
  verifier(ordre.indexOf('en-attente') === 0 && ordre.indexOf('vos-demandes') === 1, 'ce qui attend d abord, puis les demandes', ordre.join(' '));

  console.log('\n== Scénario 11 : répondre sur une tâche depuis sa fiche');
  const taches = ((await lire('taches?pageSize=100')).documents || []).filter((d) => str(d, 'projet') === 'atelier' && str(d, 'statut') === 'attente-client' && str(d, 'visibilite') === 'client');
  const tache = taches[0]; const tid = tache.name.split('/').pop(); const titreTache = str(tache, 'titre');
  await aller(page, `#/projets/atelier/taches/${tid}`, '#reponse-tache');
  const fiche = await page.textContent('.modale-corps');
  verifier(/À vous/.test(fiche) && !/En attente client/.test(fiche), 'la pastille dit « À vous », pas « En attente client »');
  verifier(Boolean(await page.$('#zone-pieces-tache input[type="file"]')), 'un dépôt de fichiers accompagne la réponse');
  await page.click('[data-envoyer-reponse]'); await pause(400);
  verifier(Boolean(await page.$('#reponse-tache')), 'sans un mot ni un fichier, rien ne part');
  await deposer(page, '#zone-pieces-tache input[type="file"]', 'capture.png');
  await page.fill('#reponse-tache', 'Voici les captures demandées.');
  await page.click('[data-envoyer-reponse]');
  verifier(await attendreStatut(`taches/${tid}`, 'repondu'), 'la tâche passe « réponse reçue »');
  const tacheApres = await lire(`taches/${tid}`);
  verifier(sous(tacheApres, 'reponseClient', 'texte').stringValue === 'Voici les captures demandées.' && sous(tacheApres, 'reponseClient', 'par').stringValue === uid, 'avec sa réponse, à son nom');
  verifier((((sous(tacheApres, 'reponseClient', 'pieces').arrayValue || {}).values) || []).length === 1, 'et sa pièce, rangée sous la tâche');
  await pause(1500);
  await aller(page, '#/demandes', '#en-attente');
  verifier(!(await page.textContent('#en-attente')).includes(titreTache), 'elle a quitté « En attente de vous »');
  const agentUid = await uidDe('agent.essai@exemple.test');
  verifier(Boolean(await attendreNotification(agentUid, 'Réponse du client sur une tâche')), 'l équipe est prévenue par une notification');

  console.log('\n== Scénario 12 : la fiche d un point bloquant, « C est fait »');
  const blocages = ((await lire('blocages?pageSize=100')).documents || []).filter((d) => str(d, 'projet') === 'atelier' && str(d, 'responsable') === 'client' && !champ(d, 'resolu').timestampValue);
  const bid = blocages[0].name.split('/').pop();
  await poser(`blocages/${bid}`, { attendu: S('Créer le compte développeur Google et nous y inviter.'), echeance: T(new Date(Date.now() + 5 * 86400000)), signaleFait: NUL }, ['attendu', 'echeance', 'signaleFait']);
  await pause(800);
  await aller(page, '#/demandes', '#en-attente');
  const lienBlocage = await page.$eval(`#en-attente a[href*="blocage=${bid}"]`, (el) => el.getAttribute('href')).catch(() => '');
  verifier(lienBlocage.includes(`/projets/atelier?blocage=${bid}`), 'le point de « En attente de vous » mène à la fiche du blocage', lienBlocage);
  await aller(page, `#/projets/atelier?blocage=${bid}`, '[data-fait]');
  const ficheBlocage = await page.textContent('.modale-corps');
  verifier(/Ce qu'on attend de vous/.test(ficheBlocage) && /Créer le compte développeur/.test(ficheBlocage), 'la fiche dit ce qu on attend de lui');
  verifier(/Attendu pour le/.test(ficheBlocage) && /Depuis le/.test(ficheBlocage), 'depuis quand, et pour quand');
  const enTete = await page.textContent('.modale-tete');
  verifier(/De votre côté/.test(enTete) && !/le client/.test(enTete), 'à la deuxième personne : « De votre côté »');
  verifier(Boolean(await page.$('[data-repondre]')), 'un bouton « Répondre »');
  const apercuBlocages = await page.textContent('.page');
  verifier(!/Responsable : le client/.test(apercuBlocages), 'l aperçu ne dit plus « Responsable : le client »');
  await page.fill('#mot-blocage', 'Compte créé, invitation envoyée.');
  await page.click('[data-fait]');
  verifier(await attendreChamp(`blocages/${bid}`, 'signaleFait', (v) => Boolean(v.mapValue)), '« C est fait » est écrit sur le point bloquant');
  const blocApres = await lire(`blocages/${bid}`);
  verifier(sous(blocApres, 'signaleFait', 'par').stringValue === uid && sous(blocApres, 'signaleFait', 'texte').stringValue === 'Compte créé, invitation envoyée.', 'à son nom, avec son mot');
  /* Le même hash ne déclenche rien : on passe par l'aperçu nu, puis on
     revient avec « ?blocage= » (mise à jour en place, la fiche s'ouvre). */
  await page.evaluate(() => { location.hash = '#/projets/atelier'; }); await pause(600);
  await aller(page, `#/projets/atelier?blocage=${bid}`, '.modale-corps');
  verifier(/Vous avez dit que c'est fait/.test(await page.textContent('.modale-corps')) && !(await page.$('[data-fait]')), 'la fiche s en souvient, le bouton a disparu');
  await page.keyboard.press('Escape'); await pause(300);

  console.log('\n== Scénario 21 : retirer sa demande, le motif d un refus, une pièce après coup');
  await aller(page, '#/projets/atelier/demandes/t-nouveau', '[data-action="retirer"]');
  await page.click('[data-action="retirer"]');
  await page.waitForSelector('[data-oui]', { timeout: 10000 }); await page.click('[data-oui]');
  verifier(await attendreStatut('tickets/t-nouveau', 'annulee'), '« Je n en ai plus besoin » passe la demande en annulée');
  await pause(1200);
  verifier(!(await page.$('[data-action="retirer"]')), 'le bouton a disparu');
  await poser('tickets/t-anniv', { statut: S('refuse'), motifRefus: S('Hors du périmètre du contrat.') }, ['statut', 'motifRefus']);
  await pause(800);
  await aller(page, '#/projets/atelier/demandes/t-anniv', '.suivi-demande');
  verifier(/Pourquoi : Hors du périmètre du contrat/.test(await page.textContent('.suivi-demande')), 'une demande refusée montre son motif');
  const avantPieces = taille(await lire('tickets/t-veille'), 'pieces');
  await aller(page, '#/projets/atelier/demandes/t-veille', '[data-action="ajouter-piece"]');
  await page.click('[data-action="ajouter-piece"]');
  await page.waitForSelector('#zone-pieces-ajout input[type="file"]', { timeout: 10000 });
  await deposer(page, '#zone-pieces-ajout input[type="file"]', 'preuve.png');
  await page.click('[data-ajouter]');
  verifier(await attendreChamp('tickets/t-veille', 'pieces', (v) => (((v.arrayValue || {}).values) || []).length === avantPieces + 1), 'la pièce ajoutée après coup rejoint le signalement');

  console.log('\n== Scénario 23 : rouvrir demande un motif, la même fenêtre que « Pas tout à fait »');
  await aller(page, '#/projets/atelier/demandes/t-tickets', '[data-action="rouvrir"]');
  await page.click('[data-action="rouvrir"]');
  await page.waitForSelector('#texte-conteste', { timeout: 10000 });
  await page.click('[data-renvoyer]'); await pause(400);
  verifier(Boolean(await page.$('#texte-conteste')), 'sans motif, rien ne part');
  await page.fill('#texte-conteste', 'Le problème est revenu ce matin.');
  await page.click('[data-renvoyer]');
  verifier(await attendreStatut('tickets/t-tickets', 'en-cours'), 'avec son motif, la demande repasse en cours');
  await pause(1200);
  const messages = ((await lire('tickets/t-tickets/messages?pageSize=50')).documents || []).map((m) => str(m, 'texte'));
  verifier(messages.some((t) => /revenu ce matin/.test(t)), 'et le motif est dans les échanges');

  console.log('\n== Scénarios 20 et 23 : le formulaire, et une demande qui en poursuit une autre');
  const ilYA10 = new Date(Date.now() - 10 * 86400000);
  await poser('tickets/t-vieux', { projet: S('atelier'), numero: S('ATELIER-090'), titre: S('Vieille demande terminée'), description: S('Réglée il y a dix jours.'), type: S('bug'), urgence: S('important'), statut: S('resolu'), plateforme: S(''), version: S(''), etapes: S(''), attendu: S(''), obtenu: S(''), contexte: S(''), appareil: S(''), liens: L(), pieces: L(), composant: S(''), assigne: NUL, auteur, archive: B(false), cree: T(new Date(Date.now() - 20 * 86400000)), maj: T(ilYA10), resolu: T(ilYA10), lu: M({}), qualification: NUL, devis: NUL });
  await pause(800);
  await aller(page, '#/projets/atelier/demandes/t-vieux', '[data-suite]');
  verifier(!(await page.$('[data-action="rouvrir"]')), 'terminée depuis plus de sept jours : plus de « Rouvrir »');
  const hrefSuite = await page.$eval('a[data-suite]', (el) => el.getAttribute('href'));
  verifier(/nouvelle-demande\?suite=t-vieux$/.test(hrefSuite), '« Ouvrir une nouvelle demande » mène au formulaire avec la suite', JSON.stringify(hrefSuite));
  await page.click('a[data-suite]');
  await page.waitForSelector('#forme-demande', { timeout: 20000 }); await pause(800);
  verifier((await page.inputValue('#titre')) === 'Suite de ATELIER-090', 'le titre est prérempli « Suite de ATELIER-090 »');
  verifier(/fait suite à/.test(await page.textContent('.page')), 'et le formulaire le dit');
  const accept = (await page.getAttribute('#zone-pieces input[type="file"]', 'accept')) || '';
  verifier(/application\/pdf/.test(accept) && /\.docx/.test(accept) && /video\/mp4/.test(accept), 'le champ de fichier porte « accept »', accept.slice(0, 80));
  const formulaire = await page.textContent('#forme-demande');
  verifier(/documents Office, zip jusqu'à 10 Mo ; vidéos mp4, mov, webm jusqu'à 100 Mo/.test(formulaire), 'l aide des pièces dit vrai');
  verifier(/Bloquant :/.test(formulaire) && /Critique :/.test(formulaire) && /Important :/.test(formulaire) && /Mineur :/.test(formulaire), 'l aide de l urgence explique les quatre niveaux');
  verifier(/e-mail à chaque étape/.test(await page.textContent('.page')) && !/chaque mouvement/.test(await page.textContent('.page')), 'le chapo promet un e-mail à chaque étape');
  await page.check('input[name="type"][value="fonctionnalite"]'); await pause(200);
  verifier((await page.textContent('[data-libelle-attendu]')).trim() === 'Ce que vous attendez' && (await page.getAttribute('#attendu', 'placeholder')) === "Ce que l'application devrait permettre.", 'pour une fonctionnalité, le champ s appelle « Ce que vous attendez »');
  await page.check('input[name="type"][value="bug"]'); await pause(200);
  verifier((await page.textContent('[data-libelle-attendu]')).trim() === 'Résultat attendu', 'et « Résultat attendu » pour une anomalie');
  await page.fill('#description', 'Le même problème, dix jours plus tard.');
  await page.fill('#liens', 'www.exemple.test/page');
  await page.click('#forme-demande [type="submit"]'); await pause(500);
  const erreurLien = (await page.textContent('#forme-demande .erreur-champ').catch(() => '')) || '';
  verifier(/commence par http/.test(erreurLien) && /nouvelle-demande/.test(page.url()), 'un lien mal formé est refusé sous le champ, le formulaire ne part pas', erreurLien);
  await page.fill('#liens', 'https://exemple.test/page');
  await page.click('#forme-demande [type="submit"]');
  await page.waitForURL((u) => /#\/projets\/atelier\/demandes\/[^/?]+$/.test(u.hash), { timeout: 20000 });
  const nid = page.url().split('/').pop();
  const nouvelle = await lire(`tickets/${nid}`);
  verifier(str(nouvelle, 'suite') === 't-vieux', 'la nouvelle demande porte « suite »');
  verifier(await attendreChamp('tickets/t-vieux', 'suivant', (v) => v.stringValue === nid), 'et le serveur écrit « suivant » sur l ancienne');
  await pause(1200);
  verifier(/Suite de ATELIER-090/.test(await page.textContent('.suivi-demande')), 'la fiche affiche « Suite de ATELIER-090 »');
  await aller(page, '#/projets/atelier/demandes/t-vieux', '.suivi-demande');
  verifier(/Suivie par/.test(await page.textContent('.suivi-demande')), 'et l ancienne « Suivie par »');

  console.log('\n== Scénario 9 : des pièces avec ses remarques, un accusé, une annulation');
  await aller(page, '#/valider/v-maquette', '#commentaire');
  verifier(Boolean(await page.$('#zone-pieces-validation input[type="file"]')), 'la fiche propose un dépôt de fichiers');
  await deposer(page, '#zone-pieces-validation input[type="file"]', 'annote.png');
  await page.fill('#commentaire', 'Le titre est trop petit, voir la capture.');
  await page.click('[data-modifs]');
  verifier(await attendreStatut('validations/v-maquette', 'modifications'), 'ses remarques sont transmises');
  const vApres = await lire('validations/v-maquette');
  verifier((((sous(vApres, 'reponse', 'pieces').arrayValue || {}).values) || []).length === 1, 'avec sa pièce, rangée sous « reponse »');
  verifier(Boolean(await attendreNotification(uid, 'Vos remarques sont transmises')), 'un accusé lui revient dans sa boîte');
  await poser('validations/v-annulable', { projet: S('atelier'), titre: S('Ancienne validation retirée'), type: S('design'), description: S('x'), pieces: L(), statut: S('en-attente'), reponse: NUL, cree: T(new Date()), maj: T(new Date()) });
  await pause(1500);
  await poser('validations/v-annulable', { statut: S('annulee'), maj: T(new Date()) }, ['statut', 'maj']);
  verifier(Boolean(await attendreNotification(uid, 'Validation retirée')), 'quand l équipe annule, le client lit « Validation retirée »');
  const fin = Date.now() + 20000; let lue = false;
  while (Date.now() < fin && !lue) { const j = await lire(`boites/${uid}/notifications?pageSize=200`); lue = ((j && j.documents) || []).filter((d) => str(d, 'lien') === '#/valider/v-annulable' && str(d, 'titre') === 'Votre validation est attendue').every((d) => champ(d, 'lu').booleanValue === true); if (!lue) await pause(500); }
  verifier(lue, 'et « Votre validation est attendue » qui pointait vers elle est marquée lue');
  await aller(page, '#/demandes', '#en-attente');
  const passee = await page.$eval('#validations-passees [data-action="ouvrir-validation"][data-id="v-annulable"]', (el) => el.textContent).catch(() => '');
  verifier(/Annulée/.test(passee), 'dans « Validations passées », elle porte la pastille « Annulée »', passee.trim().slice(0, 80));
  await page.evaluate(() => { location.hash = '#/valider/inexistant'; });
  await page.waitForFunction(() => /n'existe plus/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
  verifier(/n'existe plus/.test(await page.textContent('body')) && /#\/demandes$/.test(page.url()), 'un identifiant inconnu : « Cette validation n existe plus. » et retour à la page Demandes');

  console.log('\n== Scénario 16 : le lien des demandes restées chez lui');
  await poser('tickets/t-veille', { statut: S('en-attente-client'), maj: T(new Date(Date.now() - 9 * 86400000)) }, ['statut', 'maj']);
  await pause(800);
  await aller(page, '#/projets/atelier', '.page');
  const lienRisque = await page.$eval('a[href$="/demandes?filtre=pour-vous"]', (el) => el.textContent).catch(() => '');
  verifier(/en attente de votre réponse depuis plus d'une semaine/.test(lienRisque), '« Ce qui pèse » cite la demande à la deuxième personne, avec un lien', lienRisque);
  await aller(page, '#/projets/atelier/demandes?filtre=pour-vous', '.filtres');
  verifier((await page.$eval('.filtre.actif', (el) => el.textContent)).includes('Pour vous'), 'et le lien pose le filtre « Pour vous »');

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-demandes-client-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
