/* Se repérer dans le Hub, à un et à plusieurs projets, avec son rôle
   (brief D, 27/09/2026), éprouvé dans le navigateur : « Les personnes »
   (« Collaborateurs sur ce projet » chez le client depuis le 02/10) et
   le rôle de Camille, l'invitation d'un collègue (le document
   interlocuteur, le miroir « personnesClient », la notification équipe),
   « Demandes » du rail, la notification qui porte le nom du projet et
   passe lue quand la page s'ouvre, la recherche qui trouve « Calendrier »,
   la page Maintenance sans le mot « clients », les paramètres sans fuseau
   et avec « Vie du projet », « Depuis votre dernière visite » cliquable et
   posée à la fin de la session, et, à deux projets, la fenêtre « Pour quel
   projet ? », le rôle dans le rail, l'adresse /acces qui retombe sur
   l'aperçu. Léa n'invite personne sur Atelier (fonction serveur).
   Banc : émulateurs, site local, semer-suivi. */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { appelAdmin } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => (await fetch(bdd(c), { headers: prop })).json();
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
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
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const personnesClient = async (pid) => { const p = await lire(`projets/${pid}`); return ((champ(p, 'personnesClient').arrayValue || {}).values || []).map((v) => { const f = (v.mapValue || {}).fields || {}; return { uid: (f.uid || {}).stringValue, nom: (f.nom || {}).stringValue, role: (f.role || {}).stringValue }; }); };
const aller = async (page, chemin, selecteur = '.page', ms = 20000) => { await page.evaluate((c) => { location.hash = c; }, chemin); await page.waitForSelector(selecteur, { timeout: ms }); await pause(900); };
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null;
const COLLEGUE = 'collegue.essai@exemple.test';
const SECOND = 'second-d';
const nettoyer = async () => {
  try { await appelAdmin('retirerInterlocuteur', { projet: 'atelier', email: COLLEGUE }); } catch (e) { /* pas invité */ }
  await effacer(`projets/${SECOND}`).catch(() => {});
  for (const c of ['projets/atelier/campagnes/c-barre', 'projets/atelier/scenarios/s-barre', 'projets/atelier/maintenance/contrat']) await effacer(c).catch(() => {});
};

(async () => {
  const uid = await uidDe('camille.essai@exemple.test');
  const agent = await uidDe('agent.essai@exemple.test');

  console.log('\n== Les lettres retrouvent leurs accents (courriels.js, sans émulateur)');
  const courriels = require('../courriels.js');
  const lettre = (m, v) => courriels.rendre(m, v);
  verifier(/vous écrit/.test(lettre('message-projet', { projetNom: 'Atelier', auteur: 'Alex', texte: 'Bonjour', lien: 'x' }).html) && /Répondre/.test(lettre('message-projet', { auteur: 'Alex', texte: 'x', lien: 'x' }).html), 'message-projet : « vous écrit », « Répondre »');
  verifier(/demandé/.test(lettre('preprojet', { cote: 'equipe', titre: 'Appli', par: 'Léa', email: 'l@x.test' }).objet) && /décrit/.test(lettre('preprojet', { cote: 'equipe', titre: 'Appli', par: 'Léa', email: 'l@x.test' }).html), 'preprojet : « demandé », « décrit »');
  /* 07/10/2026 : la proposition est reformulée (« préparé une proposition »). */
  verifier(/préparé une proposition de forfait/.test(lettre('maintenance', { cote: 'client', evenement: 'proposition', projet: 'Atelier' }).html) && /arrivé à son terme/.test(lettre('maintenance', { cote: 'client', evenement: 'termine', projet: 'Atelier' }).html), 'maintenance : « préparé une proposition de forfait », « arrivé à son terme »');
  verifier(/acceptée/.test(lettre('evolution-statut', { projet: 'Atelier', titre: 'Export', statut: 'acceptee', lien: 'x' }).objet), 'la lettre « evolution-statut » existe et se rend');

  await nettoyer();
  /* La dernière visite d'il y a deux jours : l'encart a de quoi compter. */
  await poser(`profils/${uid}`, { derniereVisite: T(new Date(Date.now() - 2 * 86400000)) }, ['derniereVisite']);
  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== Depuis votre dernière visite : sans mes gestes, cliquable, et posée à la fin');
  await page.waitForSelector('#depuis-visite', { timeout: 20000 }).catch(() => {});
  const encart = await page.$('#depuis-visite');
  verifier(Boolean(encart), 'l encart est là avec une dernière visite d il y a deux jours');
  const texteEncart = encart ? await encart.textContent() : '';
  verifier(/validation/.test(texteEncart), 'il compte la validation demandée par l équipe', texteEncart.trim().slice(0, 120));
  verifier(Boolean(await page.$('#depuis-visite a[href="#/demandes"]')), 'et le compteur des validations mène à la page Demandes (« En attente de vous » en tête)');
  const profilAvant = await lire(`profils/${uid}`);
  verifier(new Date(champ(profilAvant, 'derniereVisite').timestampValue) < new Date(Date.now() - 86400000), 'le démarrage n a pas réécrit la dernière visite');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  verifier(await attendre(async () => new Date(champ(await lire(`profils/${uid}`), 'derniereVisite').timestampValue) > new Date(Date.now() - 60000)), 'la page qui se cache pose la dernière visite');

  console.log('\n== Les personnes du projet, et le rôle de Camille');
  /* Le miroir naît d une écriture sur un interlocuteur : on touche le sien,
     au cas où le semis aurait précédé le chargement des fonctions. */
  const inter = ((await lire('projets/atelier/interlocuteurs?pageSize=50')).documents || []).find((d) => str(d, 'email') === 'camille.essai@exemple.test');
  if (inter) await fetch(`${BANC.firestore}/v1/${inter.name}?updateMask.fieldPaths=maj`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { maj: T(new Date()) } }) });
  verifier(await attendre(async () => (await personnesClient('atelier')).some((p) => p.uid === uid && p.role === 'responsable')), 'le serveur tient le miroir « personnesClient » (Camille, responsable)');
  await aller(page, '#/projets/atelier', '#personnes');
  const personnes = await page.textContent('#personnes');
  verifier(/Collaborateurs sur ce projet/.test(personnes) && /Chez Capmedia/.test(personnes) && /De votre côté/.test(personnes), 'la section « Collaborateurs sur ce projet » est dans l aperçu');
  verifier(/Camille Martin/.test(personnes) && /\(vous\)/.test(personnes) && /Responsable/.test(personnes), 'Camille s y voit, responsable, avec « vous »');
  verifier(/Le responsable engage votre société/.test(personnes), 'le rôle est expliqué en une ligne');
  verifier(/Alex Durand/.test(personnes), 'le responsable Capmedia est nommé (annuaire)');
  const role = await page.textContent('#lat-role-projet').catch(() => '');
  verifier(/Vous êtes responsable/.test(role || ''), 'le rail dit « Vous êtes responsable » sur la fiche', role);
  await aller(page, '#/', '.page');
  verifier(await page.$eval('#lat-role-projet', (el) => el.hidden), 'et rien hors d une fiche projet');

  console.log('\n== Camille invite un collègue');
  await aller(page, '#/projets/atelier', '#personnes');
  await page.click('[data-action="inviter-collegue"]');
  await page.waitForSelector('#f-collegue', { timeout: 10000 });
  await page.fill('#co-nom', 'Nadia Collègue'); await page.fill('#co-email', COLLEGUE);
  await page.click('button[form="f-collegue"]');
  verifier(await attendre(async () => ((await lire('projets/atelier/interlocuteurs?pageSize=50')).documents || []).some((d) => str(d, 'email') === COLLEGUE && str(d, 'role') === 'collaborateur' && str(d, 'statut') === 'actif'), 30000), 'le document interlocuteur apparaît, collaborateur, actif');
  verifier(await attendre(async () => (await personnesClient('atelier')).some((p) => p.nom === 'Nadia Collègue' && p.role === 'collaborateur')), 'le miroir « personnesClient » se remplit');
  verifier(await attendre(async () => ((await lire(`boites/${agent}/notifications?pageSize=100`)).documents || []).some((d) => /a invité un collègue/.test(str(d, 'titre')))), 'l équipe est prévenue : « Le responsable a invité un collègue »');
  await pause(1500);
  verifier(/Nadia Collègue/.test(await page.textContent('#personnes')), 'et la section se met à jour en direct');
  const refus = await appelAdmin('inviterCollegue', { projet: 'atelier', nom: 'Intrus', email: 'intrus.essai@exemple.test' }, { email: 'lea.essai@exemple.test' });
  verifier(refus.code === 403, 'Léa n invite personne sur Atelier (403)', `${refus.code} ${refus.texte.slice(0, 80)}`);
  const refusAgent = await appelAdmin('inviterCollegue', { projet: 'atelier', nom: 'X', email: 'x.essai@exemple.test' });
  verifier(refusAgent.code === 403, 'l équipe passe par « Accès client », pas par cette action (403)');

  console.log('\n== « Demandes », tous projets (la page reste, l entrée vit dans l arbre de chaque projet)');
  verifier(!(await page.$('#lat-corps a[data-chemin="/demandes"]')) && Boolean(await page.$('#lat-corps a[data-chemin="/projets/atelier/demandes"]')), 'le rail porte « Tickets » sous le projet, plus en entrée globale');
  await aller(page, '#/demandes', '.page h1');
  const pageDemandes = await page.textContent('.page');
  verifier(/ATELIER-004/.test(pageDemandes) || /notifications arrivent deux fois/.test(pageDemandes), 'elle liste les demandes d Atelier', pageDemandes.trim().slice(0, 100));
  /* Une suite passée avant a pu déplacer cette demande : on la remet « à valider ». */
  await poser('tickets/t-anniv', { statut: S('a-valider') }, ['statut']); await pause(1200);
  await page.click('[data-filtre="moi"]'); await pause(500);
  verifier(/anniversaires reste incomplète/.test(await page.textContent('.page')) && (await page.$eval('.filtre.actif', (el) => el.textContent)).includes('Pour vous'), 'le filtre « Pour vous » ne garde que ce qui attend Camille');

  console.log('\n== La barre latérale : l arbre du projet');
  await aller(page, '#/projets/atelier', '.page-tete--projet');
  const sousProjet = await page.$$eval('#lat-corps .lat-arbre[data-arbre="atelier"] .lat-branche .lat-lien', (as) => as.map((a) => a.dataset.chemin));
  verifier(sousProjet.includes('/projets/atelier/demandes') && Boolean(await page.$('#lat-corps a[data-chemin="/projets/atelier"]')) && !(await page.$('#onglets-projet')), 'les sections du projet sont dans son arbre, plus en onglets ; le projet reste', sousProjet.join(' '));
  verifier(Boolean(await page.$('#lat-corps a[data-chemin="/projets/atelier"] .avatar-projet')), 'avec son écusson');
  const chemins = (await page.$$eval('#lat-corps .lat-lien', (as) => as.map((a) => a.dataset.chemin))).filter((c) => c !== '/nouveaux-projets');
  verifier(chemins.indexOf('/nouveau-projet') > 0 && chemins.indexOf('/nouveau-projet') === chemins.indexOf('/parametres') - 1 && chemins.indexOf('/nouveau-projet') > chemins.indexOf('/fichiers'), '« Demander un projet » est en bas, juste avant « Paramètres »', chemins.join(' '));
  verifier(!chemins.includes('/valider') && chemins.filter((c) => c === '/projets/atelier/demandes').length === 1, '« En attente de vous » et « Demandes » ne font qu une entrée', chemins.join(' '));
  await aller(page, '#/projets/atelier/demandes', '#en-attente-projet');
  /* Lot B2 (03/10) : le rouge de Tickets ne compte que les tickets qui
     attendent Camille, le filtre « Pour vous » de la page. */
  const pourVous = await page.$eval('[data-filtre-demandes="moi"] .compte', (el) => Number(el.textContent)).catch(() => -1);
  const rougeDemandes = await page.$eval('#lat-corps a[data-chemin="/projets/atelier/demandes"] .compte.vif', (el) => Number(el.textContent)).catch(() => 0);
  verifier(pourVous > 0 && rougeDemandes === pourVous, 'le rouge de « Tickets » compte les tickets qui attendent Camille (« Pour vous »)', `${rougeDemandes} pour ${pourVous}`);
  const repere = '#lat-corps a[data-chemin="/maintenance"][data-projet="atelier"] .lat-repere';
  verifier(!(await page.$(repere)), 'sans forfait, plus de repère dans le rail : la page le dit');
  await aller(page, '#/maintenance?projet=atelier', '.page h1');
  verifier(/Pas encore de forfait/.test(await page.textContent('#vue')), 'la page Maintenance dit « Pas encore de forfait »');
  const tests = '#lat-corps a[data-chemin="/tests"][data-projet="atelier"]';
  /* Les campagnes déjà ouvertes par les semis passent « en préparation » le
     temps du contrôle (ce statut ne déclenche rien côté serveur) : on part
     d'un rail sans campagne en cours. */
  const ouvertes = ((await lire('projets/atelier/campagnes?pageSize=50')).documents || []).filter((d) => str(d, 'statut') === 'en-cours').map((d) => d.name.split('/').pop());
  for (const id of ouvertes) await poser(`projets/atelier/campagnes/${id}`, { statut: S('preparation') }, ['statut']);
  await poser('projets/atelier/scenarios/s-barre', { titre: S('Scénario du banc (barre)'), actif: B(true), cree: T(new Date()), maj: T(new Date()) });
  verifier(await attendre(async () => Boolean(await page.$(tests)) && !(await page.$(`${tests}.lat-lien--en-cours`))), 'aucune campagne en cours : l entrée Campagne de tests est immobile');
  await poser('projets/atelier/campagnes/c-barre', { titre: S('Campagne du banc (barre)'), statut: S('en-cours'), scenarios: L([]), testeurs: L([]), cree: T(new Date()), maj: T(new Date()) });
  verifier(await attendre(async () => Boolean(await page.$(`${tests}.lat-lien--en-cours`))), 'une campagne en cours : l entrée Campagne de tests s anime, sans recharger');
  /* Lu d'un seul geste dans la page : le rail se redessine souvent, une
     poignée gardée entre deux allers-retours peut viser une ligne remplacée. */
  const anim = await page.evaluate((sel) => { const a = document.querySelector(sel); return ({ texte: getComputedStyle(a.querySelector('.tronque')).animationName, icone: getComputedStyle(a.querySelector('svg')).animationName, duree: getComputedStyle(a.querySelector('.tronque')).animationDuration, boucle: getComputedStyle(a.querySelector('.tronque')).animationIterationCount, dit: (a.querySelector('.sr-only') || {}).textContent || '' }); }, tests).catch(() => ({}));
  verifier(anim.texte && anim.texte !== 'none' && anim.icone && anim.icone !== 'none' && anim.boucle === 'infinite' && parseFloat(anim.duree) >= 2 && parseFloat(anim.duree) <= 3, 'un reflet sur le texte, l icône qui respire, en boucle, entre 2 et 3 s', JSON.stringify(anim));
  verifier(/campagne de tests en cours/.test(anim.dit || ''), 'et un lecteur d écran l entend', anim.dit);
  const surActive = await page.evaluate((sel) => { const a = document.querySelector(sel); a.classList.add('actif'); const n = getComputedStyle(a.querySelector('.tronque')).animationName; a.classList.remove('actif'); return n; }, tests);
  verifier(surActive === 'none', 'l entrée ouverte reste calme', surActive);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let reduit = [];
  const calme = await attendre(async () => {
    reduit = await page.evaluate((sel) => { const a = document.querySelector(sel); return [a.isConnected, window.matchMedia('(prefers-reduced-motion: reduce)').matches, getComputedStyle(a.querySelector('.tronque')).animationName, getComputedStyle(a.querySelector('svg')).animationName]; }, tests).catch((e) => [String(e).slice(0, 80)]);
    return reduit[1] === true && reduit[2] === 'none' && reduit[3] === 'none';
  }, 8000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  verifier(calme, 'avec « réduire les animations », rien ne bouge', JSON.stringify(reduit));
  const reponseClose = await poser('projets/atelier/campagnes/c-barre', { statut: S('close'), maj: T(new Date()) }, ['statut', 'maj']);
  const ferme = await attendre(async () => Boolean(await page.$(tests)) && !(await page.$(`${tests}.lat-lien--en-cours`)));
  verifier(ferme, 'la campagne close : l animation s arrête, sans recharger', ferme ? '' : `écriture ${reponseClose.status} · en base : ${str(await lire('projets/atelier/campagnes/c-barre'), 'statut')} · dans la page : ${await page.evaluate(async () => { const m = await import('./assets/js/magasin.js'); return JSON.stringify((m.lire('campagnes:atelier') || []).map((c) => [c.id, c.statut])); }).catch((e) => String(e).slice(0, 80))}`);
  await effacer('projets/atelier/campagnes/c-barre'); await effacer('projets/atelier/scenarios/s-barre');
  for (const id of ouvertes) await poser(`projets/atelier/campagnes/${id}`, { statut: S('en-cours') }, ['statut']);

  console.log('\n== Une notification porte le nom de son projet, et passe lue sur la page');
  const r = await fetch(bdd(`boites/${uid}/notifications`), { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { type: S('reunion'), titre: S('Réunion programmée (banc D)'), texte: S('Point hebdo'), lien: S('#/calendrier'), projet: S('atelier'), lu: B(false), date: T(new Date()) } }) });
  const notifId = ((await r.json()).name || '').split('/').pop();
  await pause(1500);
  await page.click('#bouton-notifs');
  await page.waitForSelector(`[data-notif="${notifId}"]`, { timeout: 15000 });
  const notif = await page.$eval(`[data-notif="${notifId}"]`, (el) => ({ texte: el.textContent, projet: (el.querySelector('.notif-projet') || {}).textContent || '', icone: Boolean(el.querySelector('.titre svg')), type: el.dataset.type }));
  verifier(/Atelier/.test(notif.projet), 'la notification affiche « Atelier »', notif.projet);
  verifier(notif.icone && notif.type === 'reunion', 'avec une icône de son type, sans pastille de couleur');
  await page.keyboard.press('Escape'); await pause(300);
  await aller(page, '#/calendrier', '.page');
  verifier(await attendre(async () => champ(await lire(`boites/${uid}/notifications/${notifId}`), 'lu').booleanValue === true), 'ouvrir le calendrier la marque lue');

  console.log('\n== La recherche trouve les pages');
  await page.click('#bouton-recherche');
  await page.waitForSelector('.palette input', { timeout: 10000 });
  await page.fill('.palette input', 'Calend'); await pause(400);
  const resultats = await page.$$eval('.palette-item', (els) => els.map((e) => e.textContent));
  verifier(resultats.some((t) => /Calendrier/.test(t)), 'la recherche trouve « Calendrier »', resultats.slice(0, 3).join(' | '));
  await page.fill('.palette input', 'Figma'); await pause(400);
  verifier((await page.$$eval('.palette-item', (els) => els.map((e) => e.textContent))).some((t) => /Maquettes Figma/.test(t)), 'et un lien du projet');
  await page.fill('.palette input', 'maquette'); await pause(400);
  verifier((await page.$$eval('.palette-item', (els) => els.map((e) => e.textContent))).some((t) => /Valider la maquette/.test(t)), 'et une validation');
  await page.keyboard.press('Escape'); await pause(300);

  console.log('\n== Maintenance et paramètres, avec les mots du client');
  await aller(page, '#/maintenance', '.page');
  const maint = await page.textContent('.page');
  verifier(!/clients?\b/i.test(maint.replace(/Capmedia/g, '')) && !/Demandes à traiter/.test(maint), 'la page Maintenance ne dit jamais « clients » au client');
  await aller(page, '#/parametres', '#forme-profil');
  verifier(!(await page.$('#fuseau')), 'le fuseau horaire a disparu des paramètres');
  const params = await page.textContent('.page');
  verifier(/Vie du projet/.test(params), 'la catégorie « Vie du projet » existe');
  verifier(/à régler dans trois jours/.test(params), 'l aide de « Devis et factures » annonce l échéance');

  console.log('\n== À deux projets : « Pour quel projet ? », le rôle, la maintenance, /acces');
  await poser(`projets/${SECOND}`, { nom: S('Second projet D'), ref: S('SECONDD'), statut: S('en-cours'), organisation: S('atelier-nord'), membres: L([S(uid)]), roles: M({ [uid]: S('collaborateur') }), personnes: L([S(uid)]), ouvert: B(true), archive: B(false), compteur: N(0), accesVersion: N(2), emailsClient: S('actifs'), plateformes: L([S('web')]), cree: T(new Date()), maj: T(new Date()) });
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3500);
  await aller(page, '#/', '[data-raccourci="nouvelle-demande"]');
  await page.click('[data-raccourci="nouvelle-demande"]');
  await page.waitForSelector('#choix-p', { timeout: 10000 });
  verifier(Boolean(await page.$('#choix-p')), 'la fenêtre « Pour quel projet ? » s ouvre sur « Nouveau ticket »');
  await page.selectOption('#choix-p', SECOND); await page.click('[data-ok]');
  await page.waitForURL(new RegExp(`/projets/${SECOND}/nouvelle-demande`), { timeout: 10000 }).catch(() => {});
  verifier(new RegExp(`#/projets/${SECOND}/nouvelle-demande`).test(page.url()), 'et mène au projet choisi');
  const puce = await page.evaluate(() => { location.hash = '#/'; return true; }); void puce;
  await page.waitForSelector('.carte--cliquable', { timeout: 20000 }); await pause(800);
  verifier(/chez nous · \d+ à vous/.test(await page.textContent('.page')), 'la carte projet dit « N chez nous · M à vous »');
  /* « Demander un créneau » n'est là que sans réunion à venir ; Atelier en a une. */
  verifier(Boolean(await page.$('[data-raccourci="message"]')) && (Boolean(await page.$('[data-raccourci="creneau"]')) || /Rejoindre|Ordre du jour/.test(await page.textContent('.page'))), '« Message » et « Demander un créneau » demandent aussi le projet');
  verifier(Boolean(await page.$('.page a[href="#/activite"]')), '« Tout voir » de l activité mène à #/activite');
  await aller(page, `#/projets/${SECOND}`, '.page-tete--projet');
  verifier(/Vous êtes collaborateur/.test(await page.textContent('#lat-role-projet')), 'le rail dit « Vous êtes collaborateur » sur le second projet');
  await aller(page, '#/maintenance', '[data-projet-maintenance]');
  const cartes = await page.$$('[data-projet-maintenance]');
  const maint2 = await page.textContent('.page');
  verifier(cartes.length === 2 && /Pas de forfait/.test(maint2), 'la page Maintenance montre ses deux projets, une carte chacun', `${cartes.length} carte(s)`);
  verifier(!/clients?\b/i.test(maint2.replace(/Capmedia/g, '')) && !/Demandes à traiter/.test(maint2), 'sans les mots de l équipe');
  await page.evaluate(() => { location.hash = '#/projets/atelier/acces'; });
  await page.waitForSelector('.toast', { timeout: 10000 }).catch(() => {});
  const toast = await page.$eval('.toast', (el) => el.textContent).catch(() => '');
  verifier(/gérés par Capmedia/.test(toast) && /#\/projets\/atelier$/.test(page.url()), '/acces retombe sur l aperçu avec le toast « Les accès sont gérés par Capmedia. »', `${toast} · ${page.url()}`);

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  await nettoyer();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-navigation-echec.png' }); } catch (err) { /* rien */ } }
  await nettoyer().catch(() => {});
  process.exit(2);
});
