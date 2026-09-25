require('./lib/garde-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la Gate 2, de bout en bout, dans de vrais navigateurs

   Une seule histoire, jouée par des personnes fictives qui se connectent
   avec leur code à six chiffres, comme en vrai : un administrateur prépare
   un projet fermé, y met un responsable et un collaborateur, le garnit,
   l'ouvre, confie le projet à un agent ; le client entre, pose une
   demande, l'équipe répond ; les e-mails sont coupés puis le collaborateur
   retiré, l'agent désactivé ; un conflit de rôle est refusé ; un testeur
   reste dans son couloir.

   À chaque étape on regarde les trois couches ensemble : ce que montre
   l'écran, ce que la base accepte (les règles, depuis la session réelle
   de la personne), et ce que le serveur envoie (la file des e-mails).

     (émulateurs avec les fonctions, site local, semis)
     node fonctions-suivi/outils/qa-gate2.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const crypto = require('node:crypto');
const { appelAdmin, uidDe } = require('./lib/session-banc.cjs');

const PROJET = 'capmedia-1f90d', SITE = 'http://127.0.0.1:8787';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const DB = `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const soucis = []; const ok = (m) => console.log('  ok     ' + m); const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, b, m) => (c ? ok(b) : dire(m ? `${b} · ${String(m).slice(0, 200)}` : b));
const etape = (n, t) => console.log(`\n== ${n} · ${t}`);
const attendre = async (fn, n = 40, ms = 600) => { for (let i = 0; i < n; i += 1) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
const cle = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 32);

/* ---- La base, lue de l'extérieur (compte « owner » de l'émulateur) ---- */
const valeur = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valeur);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, valeur(x)]));
  return null;
};
const doc = (d) => (d && d.fields ? { id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, valeur(v)])) } : null);
const lire = async (chemin) => { const r = await fetch(`${DB}/${chemin}`, { headers: OWNER }); return r.ok ? doc(await r.json()) : null; };
const liste = async (chemin) => {
  const tout = []; let page = '';
  do {
    const r = await fetch(`${DB}/${chemin}?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: OWNER });
    const j = await r.json().catch(() => ({}));
    (j.documents || []).forEach((d) => tout.push(doc(d)));
    page = j.nextPageToken || '';
  } while (page);
  return tout;
};
const effacer = async (col) => { for (const d of await liste(col)) await fetch(`${DB}/${col}/${d.id}`, { method: 'DELETE', headers: OWNER }); };
const envoisVers = async (email, apres = '') => (await liste('envois')).filter((e) => (e.a || []).some((x) => x.email === email) && (!apres || String(e.cree || '') > apres));
const maintenant = () => new Date().toISOString();
const calme = async () => {
  let avant = ''; let pareil = 0;
  for (let i = 0; i < 50; i += 1) {
    const m = `${(await liste('envois')).length}/${(await liste('activite')).length}`;
    pareil = m === avant ? pareil + 1 : 0; if (pareil >= 3) return; avant = m; await pause(700);
  }
};

/* ---- Une personne qui se connecte avec son code ------------------------ */
const codeDe = (email) => attendre(async () => {
  const codes = (await liste('envois')).filter((e) => e.modele === 'code' && (e.a || []).some((x) => x.email === email))
    .sort((a, b) => String(b.cree || '').localeCompare(String(a.cree || '')));
  return codes.length ? codes[0].variables.code : null;
});
const entrer = async (nav, email) => {
  const ctx = await nav.newContext({ viewport: { width: 1300, height: 950 } });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await effacer('connexions'); await effacer('connexionsIp');
  const avant = (await liste('envois')).filter((e) => e.modele === 'code').length;
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 30000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 30000 });
  await attendre(async () => (await liste('envois')).filter((e) => e.modele === 'code').length > avant);
  await page.fill('#code', (await codeDe(email)) || '');
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
  return { ctx, page, erreurs };
};
const aller = async (page, hash, sel) => {
  for (let i = 0; i < 8; i += 1) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    if (!sel || await page.waitForSelector(sel, { timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  await pause(600);
};
const confirmer = async (page) => { await page.waitForSelector('.voile [data-oui]', { timeout: 10000 }); await page.click('.voile [data-oui]'); await pause(1500); };
const texte = async (page) => page.evaluate(() => document.body.innerText);
/* Ce que la base accepte, depuis la session réelle de la personne. */
const depuisLaSession = (page, fn, arg) => page.evaluate(async ({ source, arg: a }) => {
  const n = await import('/suivi/assets/js/noyau.js');
  const d = await import('/suivi/assets/js/donnees.js');
  try { return { ok: true, valeur: await (new Function('n', 'd', 'a', `return (${source})(n, d, a);`))(n, d, a) }; }
  catch (e) { return { ok: false, code: e.code || '', message: String(e.message || e).slice(0, 160) }; }
}, { source: fn.toString(), arg });

const ADMIN = 'agent.essai@exemple.test';
const AGENT = 'agent.sim@exemple.test';
const RESP = 'resp.sim@exemple.test';
const COLLAB = 'collab.sim@exemple.test';
const TESTEUR = 'testeur.sim@exemple.test';

(async () => {
  const nav = await chromium.launch();
  let pid = '';

  etape(1, 'Création d un projet, fermé au client (cockpit, assistant)');
  const admin = await entrer(nav, ADMIN);
  verifier(/cockpit/.test(admin.page.url()), 'l administrateur arrive au cockpit', admin.page.url());
  await aller(admin.page, '#/projets/nouveau', '#forme-etape');
  const suivant = async () => { await admin.page.click('#forme-etape [type="submit"]'); await pause(700); };
  await admin.page.fill('#nom', 'Simulation Gate'); await admin.page.fill('#ref', 'SIMG2'); await suivant();
  await admin.page.fill('#clientEntreprise', 'Société Simulation'); await admin.page.fill('#clientNom', 'Rose Responsable'); await admin.page.fill('#clientEmail', RESP); await suivant();
  for (let i = 0; i < 6; i += 1) await suivant();
  verifier(Boolean(await admin.page.$('#forme-etape [name="preparer"]:checked')), 'l assistant propose de préparer le contact comme responsable (coché)');
  await suivant();
  await admin.page.click('#forme-etape [type="submit"]');
  await admin.page.waitForFunction(() => /^#\/projets\/[^/]+$/.test(location.hash) && !/nouveau/.test(location.hash), null, { timeout: 30000 }).catch(() => {});
  pid = (await admin.page.evaluate(() => location.hash)).split('/')[2] || '';
  const p1 = await lire(`projets/${pid}`);
  verifier(Boolean(p1) && p1.ouvert === false && (p1.membres || []).length === 0, 'le projet est créé fermé : personne n y a accès', JSON.stringify(p1 && { ouvert: p1.ouvert, membres: p1.membres }));

  etape(2, 'Ajout du responsable (préparé par l assistant)');
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-ajouter"]');
  const t2 = await texte(admin.page);
  verifier(/Rose Responsable/.test(t2) && /Responsable/.test(t2) && /Préparé, rien envoyé/.test(t2), 'l onglet « Accès client » montre le responsable, préparé, rien envoyé');
  verifier(/Non : personne n'a accès, rien ne part/.test(t2), 'et dit, en clair, que le projet est fermé au client');

  etape(3, 'Ajout d un collaborateur (onglet Accès client)');
  await admin.page.click('[data-action="acces-ajouter"]');
  await admin.page.fill('#ac-nom', 'Colin Collaborateur'); await admin.page.fill('#ac-email', COLLAB);
  await admin.page.check('#f-acces [name="role"][value="collaborateur"]', { force: true });
  await admin.page.click('.voile [type="submit"]');
  const colVu = await attendre(async () => /Colin Collaborateur/.test(await texte(admin.page)));
  verifier(Boolean(colVu), 'le collaborateur apparaît, préparé');
  const i3 = await lire(`projets/${pid}/interlocuteurs/${cle(COLLAB)}`);
  verifier(i3 && i3.role === 'collaborateur' && i3.statut === 'actif' && i3.invitation.etat === 'preparee', 'sa fiche : collaborateur, actif, invitation préparée', JSON.stringify(i3 && i3.invitation));

  etape(4, 'Préparation interne : étape, tâche, validation, message, devis');
  const debutPrep = maintenant();
  const prep = await depuisLaSession(admin.page, async (n, d, a) => {
    const s = await n.session();
    await d.ecrire.creerJalon(a.pid, { titre: 'Cadrage', statut: 'en-cours', progression: 30, ordre: 1 });
    await d.ecrire.creerTache(s, a.pid, { titre: 'Maquette de l accueil', statut: 'attente-client', visibilite: 'client' });
    await d.ecrire.creerValidation(s, a.pid, { titre: 'Valider le périmètre', description: 'Le périmètre de la phase 1.', reserveeResponsable: true });
    await d.ecrire.messageProjet(s, a.pid, 'Nous préparons votre espace.');
    return true;
  }, { pid });
  verifier(prep.ok, 'l administrateur garnit le projet depuis sa session', prep.message);
  const devis = await depuisLaSession(admin.page, async (n, d, a) => {
    const { appelServeur } = await import('/suivi/assets/js/serveur.js');
    return appelServeur('deposerDocument', { projet: a.pid, type: 'devis', numero: 'D-SIM-1', libelle: 'Devis de la phase 1', montant: 4200 });
  }, { pid });
  verifier(devis.ok && devis.valeur && devis.valeur.id, 'il dépose un devis, avec son identité (plus aucune clé)', devis.message);

  etape(5, 'Aucun e-mail client ne part tant que le projet est fermé');
  await calme();
  const pendant = [...await envoisVers(RESP, debutPrep), ...await envoisVers(COLLAB, debutPrep)];
  verifier(pendant.length === 0, `zéro e-mail vers le client pendant la préparation (${pendant.length})`, pendant.map((e) => e.modele).join(','));

  /* Préparée, elle a déjà un compte : si elle tente d'entrer (l'adresse
     circule), la porte la laisse passer vers un espace vide, et les
     règles ne lui montrent rien du projet fermé. */
  const tot = await entrer(nav, COLLAB);
  verifier(/\/suivi\/hub/.test(tot.page.url()) && !/Simulation Gate/.test(await texte(tot.page)), 'une personne préparée qui se présente trop tôt ne voit aucun projet', tot.page.url());
  const totLit = await depuisLaSession(tot.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid))).exists(), { pid });
  verifier(!totLit.ok, 'et les règles lui refusent la fiche du projet fermé', JSON.stringify(totLit));
  await tot.ctx.close();

  etape(6, 'Ouverture au client');
  const debutOuv = maintenant();
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="ouvrir-au-client"]');
  await admin.page.click('[data-action="ouvrir-au-client"]');
  await confirmer(admin.page);
  const p6 = await attendre(async () => { const p = await lire(`projets/${pid}`); return p && p.ouvert === true ? p : null; });
  verifier(p6 && (p6.membres || []).length === 2, 'le projet est ouvert : deux membres effectifs', JSON.stringify(p6 && p6.membres));

  etape(7, 'Invitations : une lettre par personne, pas d avalanche');
  await calme();
  const oR = await envoisVers(RESP, debutOuv); const oC = await envoisVers(COLLAB, debutOuv);
  verifier(oR.length === 1 && oR[0].modele === 'ouverture', `le responsable reçoit UNE lettre d ouverture (${oR.map((e) => e.modele)})`);
  verifier(oC.length === 1 && oC[0].modele === 'ouverture', `le collaborateur aussi (${oC.map((e) => e.modele)})`);
  verifier((oR[0].variables.points || []).some((x) => /Devis/.test(x.quoi)) && !(oC[0].variables.points || []).some((x) => /Devis/.test(x.quoi)), 'le résumé parle du devis au responsable, pas au collaborateur');
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-ajouter"]');
  verifier(/Invitation envoyée/.test(await texte(admin.page)), 'le cockpit montre « Invitation envoyée »');

  etape(8, 'Connexion du responsable');
  const resp = await entrer(nav, RESP);
  verifier(/\/suivi\/hub/.test(resp.page.url()), 'le responsable arrive au Hub', resp.page.url());
  await aller(resp.page, `#/projets/${pid}`, '.page-tete');
  verifier(/Simulation Gate/.test(await texte(resp.page)), 'il voit son projet');
  verifier(await resp.page.$('a[href="#/finances"]') !== null, 'il voit « Devis et factures »');

  etape(9, 'Connexion du collaborateur');
  const collab = await entrer(nav, COLLAB);
  verifier(/\/suivi\/hub/.test(collab.page.url()), 'le collaborateur arrive au Hub', collab.page.url());
  await aller(collab.page, `#/projets/${pid}`, '.page-tete');
  verifier(/Simulation Gate/.test(await texte(collab.page)), 'il voit le projet');
  verifier(await collab.page.$('a[href="#/finances"]') === null, 'il ne voit PAS « Devis et factures »');
  await aller(collab.page, '#/finances', '.page');
  verifier(/Réservé au responsable du projet/.test(await texte(collab.page)), 'la page financière lui dit qu elle est réservée au responsable');

  etape(10, 'La différence de permissions, écran, règles et serveur');
  const idDevis = devis.valeur && devis.valeur.id;
  const tente = await depuisLaSession(collab.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.repondreDevis(s, a.id, 'accepte', 'je signe'); return true; }, { id: idDevis });
  verifier(!tente.ok && /permission/i.test(`${tente.code} ${tente.message}`), 'le collaborateur qui écrit directement l acceptation du devis est refusé par les règles', tente.message);
  const litDevis = await depuisLaSession(collab.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'documents', a.id))).exists(), { id: idDevis });
  verifier(!litDevis.ok, 'il ne lit même pas le devis', JSON.stringify(litDevis));
  const valid = (await liste('validations')).find((v) => v.projet === pid);
  await aller(collab.page, `#/valider/${valid.id}`, '.voile');
  const tv = await texte(collab.page);
  verifier(/Réservée au responsable du projet/.test(tv) && !(await collab.page.$('.voile [data-approuver]')), 'la validation réservée : lisible, sans bouton de réponse pour lui');
  const repV = await depuisLaSession(collab.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.repondreValidation(s, a.id, 'approuvee', ''); return true; }, { id: valid.id });
  verifier(!repV.ok, 'et les règles refusent sa réponse directe', repV.message);
  await aller(resp.page, '#/finances', '.page');
  await resp.page.click(`[data-action="ouvrir"][data-id="${idDevis}"]`).catch(() => {});
  const bouton = await resp.page.waitForSelector('.voile [data-accepter]', { timeout: 15000 }).catch(() => null);
  verifier(Boolean(bouton), 'le responsable voit le bouton « Accepter le devis »');
  if (bouton) { await bouton.click(); await confirmer(resp.page); }
  const d10 = await attendre(async () => { const x = await lire(`documents/${idDevis}`); return x && x.statut === 'accepte' ? x : null; });
  verifier(Boolean(d10), 'il accepte le devis');
  const p10 = await attendre(async () => { const p = await lire(`projets/${pid}`); return p && p.statut === 'devis-signe' ? p : null; });
  verifier(Boolean(p10), 'et le projet démarre (devis signé)');

  etape(11, 'Le collaborateur crée une demande');
  const dem = await depuisLaSession(collab.page, async (n, d, a) => { const s = await n.session(); return d.ecrire.creerDemande(s, a.pid, { titre: 'Le menu ne s ouvre pas', description: 'Sur mobile, le menu reste fermé.', type: 'bug', urgence: 'important' }); }, { pid });
  verifier(dem.ok && dem.valeur, 'la demande est créée depuis sa session', dem.message);
  const tid = dem.valeur;
  const t11 = await attendre(async () => { const t = await lire(`tickets/${tid}`); return t && t.numero ? t : null; });
  verifier(t11 && /^SIMG2-\d{3}$/.test(t11.numero), `elle reçoit son numéro (${t11 && t11.numero})`);

  etape(12, 'L agent, confié au projet, répond');
  const ajoutAgent = await depuisLaSession(admin.page, async (n, d, a) => {
    const { appelServeur } = await import('/suivi/assets/js/serveur.js');
    return appelServeur('ajouterEquipe', { email: a.email, nom: 'Aline Agent', role: 'agent', projets: [a.pid] });
  }, { pid, email: AGENT });
  verifier(ajoutAgent.ok, 'l administrateur ajoute l agent, sur ce seul projet', ajoutAgent.message);
  const agent = await entrer(nav, AGENT);
  verifier(/cockpit/.test(agent.page.url()), 'l agent arrive au cockpit', agent.page.url());
  verifier(!(await agent.page.$('a[href="#/clients"]')), 'son cockpit ne propose pas « Clients »');
  verifier(!(await agent.page.$('#lat a[href="#/finances"]')), 'ni « Finances »');
  verifier(!/Impayé|Devis en attente|Paiements récents/.test(await texte(agent.page)), 'et son accueil ne montre aucun chiffre financier');
  const autre = await depuisLaSession(agent.page, async (n) => (await n.getDoc(n.doc(n.bdd, 'projets', 'atelier'))).exists(), {});
  verifier(!autre.ok, 'il ne lit pas un projet qui ne lui est pas confié', JSON.stringify(autre));
  const absentActif = await depuisLaSession(agent.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid, 'interlocuteurs', 'absent-sim'))).exists(), { pid });
  verifier(absentActif.ok && absentActif.valeur === false, 'actif, il lit les fiches d accès de son projet (témoin)', JSON.stringify(absentActif));
  /* Une écoute ouverte par sa session : après la désactivation, plus rien
     ne doit lui parvenir, même sans recharger. */
  await agent.page.evaluate(async (pid0) => {
    const n = await import('/suivi/assets/js/noyau.js');
    window.ecouteSim = { descriptions: [], erreur: '' };
    n.onSnapshot(n.doc(n.bdd, 'projets', pid0), (x) => window.ecouteSim.descriptions.push(String((x.data() || {}).description || '')), (e) => { window.ecouteSim.erreur = e.code || String(e); });
  }, pid);
  const debutRep = maintenant();
  const rep = await depuisLaSession(agent.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.messageDemande(s, a.tid, 'Bien reçu, nous corrigeons.'); return true; }, { tid });
  verifier(rep.ok, 'il répond sur la demande', rep.message);

  etape(13, 'La notification arrive au client');
  await calme();
  const uidCollab = await uidDe(COLLAB); const uidResp = await uidDe(RESP);
  const notifs = await liste(`boites/${uidCollab}/notifications`);
  verifier(notifs.some((x) => /Réponse sur/.test(x.titre || '')), 'le collaborateur a sa notification dans le Hub');
  verifier((await envoisVers(COLLAB, debutRep)).some((e) => e.modele === 'message'), 'et son e-mail (e-mails actifs)');

  etape(14, 'Couper les e-mails du client (cockpit)');
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-emails"]');
  await admin.page.click('[data-action="acces-emails"]');
  await confirmer(admin.page);
  const p14 = await attendre(async () => { const p = await lire(`projets/${pid}`); return p && p.emailsClient === 'coupes' ? p : null; });
  verifier(Boolean(p14), 'les e-mails du client sont coupés');
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-emails"]');
  verifier(/Coupés/.test(await texte(admin.page)), 'le cockpit le dit en clair');

  etape(15, 'Une nouvelle activité : visible dans le Hub, sans e-mail');
  const debutMute = maintenant();
  const notifAvant = (await liste(`boites/${uidResp}/notifications`)).length;
  await depuisLaSession(agent.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.messageProjet(s, a.pid, 'Pendant la coupure : la version 1 arrive.'); return true; }, { pid });
  await calme();
  const mute = [...await envoisVers(RESP, debutMute), ...await envoisVers(COLLAB, debutMute)];
  verifier(mute.length === 0, `zéro e-mail externe (${mute.map((e) => e.modele).join(',')})`);
  verifier((await liste(`boites/${uidResp}/notifications`)).length > notifAvant, 'la notification arrive dans le Hub');
  await resp.page.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  const lu = await depuisLaSession(resp.page, async (n, d, a) => {
    const q = await n.getDocs(n.query(n.collection(n.bdd, 'projets', a.pid, 'messages')));
    return q.docs.some((x) => /Pendant la coupure/.test(x.data().texte || ''));
  }, { pid });
  verifier(lu.ok && lu.valeur === true, 'le responsable lit le message dans son espace : le Hub vit', JSON.stringify(lu));

  etape(16, 'Retrait du collaborateur (cockpit)');
  await aller(admin.page, `#/projets/${pid}/acces`, `[data-action="acces-menu"][data-cle="${cle(COLLAB)}"]`);
  await admin.page.click(`[data-action="acces-menu"][data-cle="${cle(COLLAB)}"]`);
  await admin.page.click('.menu button:has-text("Retirer l\'accès")');
  await confirmer(admin.page);
  const p16 = await attendre(async () => { const p = await lire(`projets/${pid}`); return p && !(p.membres || []).includes(uidCollab) ? p : null; });
  verifier(Boolean(p16), 'il n est plus membre du projet');
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-ajouter"]');
  verifier(/Accès retirés/.test(await texte(admin.page)), 'le cockpit le range dans « Accès retirés »');

  etape(17, 'L ancienne session du collaborateur est refusée');
  const vieux = await depuisLaSession(collab.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid))).exists(), { pid });
  verifier(!vieux.ok && /permission/i.test(`${vieux.code} ${vieux.message}`), 'sa session encore ouverte ne lit plus le projet', JSON.stringify(vieux));
  const ecrit = await depuisLaSession(collab.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.messageProjet(s, a.pid, 'Encore là ?'); return true; }, { pid });
  verifier(!ecrit.ok, 'ni n y écrit');
  await collab.page.goto(`${SITE}/suivi/hub#/projets/${pid}`, { waitUntil: 'domcontentloaded' }); await pause(4000);
  verifier(!/Simulation Gate/.test(await texte(collab.page)), 'recharger ne rend rien : le projet a disparu de son espace');
  const debutRetire = maintenant();
  await appelAdmin('reglerEmailsClient', { id: pid, emailsClient: 'actifs' });
  await depuisLaSession(agent.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.messageProjet(s, a.pid, 'Après le retrait.'); return true; }, { pid });
  await calme();
  verifier((await envoisVers(COLLAB, debutRetire)).length === 0, 'e-mails rétablis : l ancien collaborateur ne reçoit rien');
  verifier((await envoisVers(RESP, debutRetire)).length >= 1, 'le responsable, si');

  etape(18, 'Désactivation de l agent (cockpit, page Équipe)');
  const uidAgent = await uidDe(AGENT);
  await aller(admin.page, '#/equipe', `[data-action="menu"][data-uid="${uidAgent}"]`);
  await admin.page.click(`[data-action="menu"][data-uid="${uidAgent}"]`);
  await admin.page.click('.menu button:has-text("Désactiver")');
  await confirmer(admin.page);
  const f18 = await attendre(async () => { const f = await lire(`equipe/${uidAgent}`); return f && f.actif === false ? f : null; });
  verifier(Boolean(f18), 'sa fiche passe « inactif »');
  await aller(admin.page, '#/equipe', `[data-action="menu"][data-uid="${uidAgent}"]`);
  verifier(/Désactivé/.test(await texte(admin.page)), 'la page Équipe le montre désactivé');

  etape(19, 'L ancienne session de l agent est refusée');
  const aLit = await depuisLaSession(agent.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid, 'interlocuteurs', 'absent-sim'))).exists(), { pid });
  verifier(!aLit.ok && /permission/i.test(`${aLit.code} ${aLit.message}`), 'sa session encore ouverte ne lit plus rien de son projet (règles)', JSON.stringify(aLit));
  await depuisLaSession(admin.page, async (n, d, a) => { await d.ecrire.majProjet(a.pid, { description: 'Écrit après la désactivation' }); return true; }, { pid });
  await pause(4000);
  const ecoute = await agent.page.evaluate(() => window.ecouteSim);
  verifier(!ecoute.descriptions.some((x) => /après la désactivation/.test(x)), 'son écoute ouverte ne reçoit pas le changement suivant', JSON.stringify(ecoute));
  verifier(/permission/i.test(ecoute.erreur), 'elle est coupée par les règles (permission refusée)', ecoute.erreur);
  const aServeur = await depuisLaSession(agent.page, async (n, d, a) => { const { appelServeur } = await import('/suivi/assets/js/serveur.js'); return appelServeur('creerDemande', { projet: a.pid, titre: 'Encore là' }); }, { pid });
  verifier(!aServeur.ok, 'le serveur refuse son ancienne session', aServeur.message);
  await agent.page.goto(`${SITE}/suivi/cockpit`, { waitUntil: 'domcontentloaded' }); await pause(5000);
  verifier(/\/suivi\/(\?|$)/.test(agent.page.url()) && !(await agent.page.$('#lat')), 'recharger le cockpit le renvoie à la porte : son compte est désactivé, la session tombe', agent.page.url());
  const codesAvant = (await liste('envois')).filter((e) => e.modele === 'code' && (e.a || []).some((x) => x.email === AGENT)).length;
  await effacer('connexions'); await effacer('connexionsIp');
  await agent.page.waitForSelector('#forme:not(.masque)', { timeout: 20000 });
  await agent.page.fill('#email', AGENT); await agent.page.click('#envoyer'); await pause(4000);
  const codesApres = (await liste('envois')).filter((e) => e.modele === 'code' && (e.a || []).some((x) => x.email === AGENT)).length;
  verifier(codesApres === codesAvant, `redemander un code ne lui ouvre rien : aucun code ne part (${codesAvant} -> ${codesApres})`);
  const notifAgentAvant = (await liste(`boites/${uidAgent}/notifications`)).length;
  await depuisLaSession(resp.page, async (n, d, a) => { const s = await n.session(); await d.ecrire.messageProjet(s, a.pid, 'Une question pour l équipe.'); return true; }, { pid });
  await calme();
  verifier((await liste(`boites/${uidAgent}/notifications`)).length === notifAgentAvant, 'désactivé, il ne reçoit plus aucune notification');

  etape(20, 'Un conflit de rôle est refusé, et le dit');
  await appelAdmin('inscrireTesteur', { email: TESTEUR, prenom: 'Théo', plateformes: ['web'], projets: [pid] });
  await aller(admin.page, `#/projets/${pid}/acces`, '[data-action="acces-ajouter"]');
  await admin.page.click('[data-action="acces-ajouter"]');
  await admin.page.fill('#ac-nom', 'Théo'); await admin.page.fill('#ac-email', TESTEUR);
  await admin.page.click('.voile [type="submit"]');
  const toast = await attendre(async () => { const t = await texte(admin.page); return /un seul rôle/.test(t) ? t : null; }, 20, 400);
  verifier(Boolean(toast), 'donner un accès client à un testeur : refusé, avec le motif à l écran');
  verifier(!(await lire(`projets/${pid}/interlocuteurs/${cle(TESTEUR)}`)), 'et rien n est créé');
  const r20 = await appelAdmin('ajouterEquipe', { email: RESP, nom: 'Rose', role: 'agent' });
  verifier(r20.code === 409, `un client ajouté à l équipe : 409 (${r20.code})`);

  etape(21, 'Le testeur reste dans son couloir');
  await fetch(`${DB}/projets/${pid}/campagnes/sim-c?updateMask.fieldPaths=titre&updateMask.fieldPaths=statut&updateMask.fieldPaths=testeurs`, {
    method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { titre: { stringValue: 'Campagne' }, statut: { stringValue: 'en-cours' }, testeurs: { arrayValue: { values: [{ stringValue: await uidDe(TESTEUR) }] } } } }),
  });
  const testeur = await entrer(nav, TESTEUR);
  verifier(/\/suivi\/testeur/.test(testeur.page.url()), 'le testeur arrive dans son espace de test', testeur.page.url());
  const tCamp = await depuisLaSession(testeur.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid, 'campagnes', 'sim-c'))).exists(), { pid });
  verifier(tCamp.ok && tCamp.valeur === true, 'il lit sa campagne');
  const tProjet = await depuisLaSession(testeur.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'projets', a.pid))).exists(), { pid });
  verifier(!tProjet.ok, 'il ne lit pas le projet');
  const tTicket = await depuisLaSession(testeur.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'tickets', a.tid))).exists(), { tid });
  verifier(!tTicket.ok, 'ni ses demandes');
  const tDevis = await depuisLaSession(testeur.page, async (n, d, a) => (await n.getDoc(n.doc(n.bdd, 'documents', a.id))).exists(), { id: idDevis });
  verifier(!tDevis.ok, 'ni ses devis (commercial)');
  const tAutre = await depuisLaSession(testeur.page, async (n) => (await n.getDoc(n.doc(n.bdd, 'projets', 'atelier', 'campagnes', 'qa-avis'))).exists(), {});
  verifier(!tAutre.ok || tAutre.valeur === false, 'ni une campagne d un autre projet');
  verifier((await envoisVers(TESTEUR)).every((e) => e.modele === 'invitation-testeur' || e.modele === 'code'), 'il n a reçu que son invitation et son code, rien des échanges du projet');

  /* « session absente » : l'arrêt voulu d'un espace après son renvoi vers
     la porte (admin.js, app.js), pas une panne. */
  const erreursJs = [admin, resp, collab, agent, testeur].flatMap((x) => x.erreurs).filter((e) => !/permission|Missing or insufficient|^session absente$/i.test(e));
  verifier(erreursJs.length === 0, 'aucune erreur JavaScript inattendue dans les cinq navigateurs', erreursJs.join(' | '));

  await nav.close();
  console.log(soucis.length ? `\n${soucis.length} ÉCART(S)` : '\nGATE 2 DE BOUT EN BOUT : CONFORME');
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
