/* ==========================================================================
   CAPMEDIA CLIENT HUB · les scénarios de recette

   Pas des contrôles unitaires : des parcours entiers, joués dans les deux
   espaces, dans l'ordre où la vie les présente. Un projet se prépare
   rideau baissé, se chiffre, s'ouvre, se signe, se travaille, se livre.
   Chaque scénario vérifie autant ce qui doit apparaître que ce qui ne
   doit surtout pas : un client qui verrait un espace en chantier, ou le
   projet d'un autre, c'est la même faute.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node qa-scenarios.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const SITE = 'http://127.0.0.1:8787';
const ADMIN = 'http://127.0.0.1:5001/capmedia-1f90d/europe-west1/suiviAdmin';
const CLE = process.env.ADMIN_CLE_ESSAI || 'cle-essai-locale';
const SHOTS = process.argv[2] || './qa';

const soucis = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { soucis.push(m); console.log(`  ÉCART  ${m}`); };
const verifier = (c, bien, mal) => (c ? ok(bien) : dire(mal ? `${bien} · ${mal}` : bien));
const scenario = (n, titre) => console.log(`\n== Scénario ${n} · ${titre}`);

const bdd = (chemin) => `http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${chemin}`;
const proprietaire = { Authorization: 'Bearer owner' };

const lire = async (chemin) => {
  const r = await fetch(bdd(chemin), { headers: proprietaire });
  return r.ok ? r.json() : null;
};
const vider = async (collection) => {
  const j = await lire(`${collection}?pageSize=300`);
  for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: proprietaire });
};
const champ = (doc, nom) => {
  const f = (doc && doc.fields && doc.fields[nom]) || {};
  return f.stringValue ?? f.booleanValue ?? f.integerValue ?? f.doubleValue ?? f.timestampValue ?? f.nullValue ?? null;
};

const serveur = async (action, corps) => {
  const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, action, ...corps }) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* texte */ }
  return { code: r.status, texte: t, ...(j || {}) };
};

const dernierCode = async (email) => {
  for (let i = 0; i < 40; i += 1) {
    const j = await lire('envois?pageSize=300');
    const pour = ((j && j.documents) || []).filter((d) => {
      const f = d.fields || {};
      if (((f.modele || {}).stringValue) !== 'code') return false;
      const a = (((f.a || {}).arrayValue) || {}).values || [];
      return a.some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === email);
    });
    if (pour.length) {
      pour.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0));
      const v = (((pour[0].fields.variables || {}).mapValue || {}).fields) || {};
      if (v.code && v.code.stringValue) return v.code.stringValue;
    }
    await pause(300);
  }
  return '';
};
const rouvrirLesVannes = async () => { await vider('envois'); await vider('connexions'); await vider('connexionsIp'); };

/* Les courriels de code ne sont jamais purgés par l'application, et la
   lecture REST rend les cent premiers par identifiant, pas par date :
   passé cent envois, le code le plus récent peut manquer à la page, et la
   suite tape un code périmé. On vide donc AVANT d'en demander un neuf. */
const connecter = async (page, email) => {
  await rouvrirLesVannes();
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email);
  await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 }).catch(async () => {
    const dit = await page.evaluate(() => (document.querySelector('#erreur') || { innerText: '' }).innerText);
    throw new Error(`écran du code absent pour ${email} : ${dit}`);
  });
  const code = await dernierCode(email);
  if (!code) throw new Error(`aucun code pour ${email}`);
  await page.fill('#code', code);
  await page.waitForSelector('.page h1', { timeout: 30000 }).catch(() => {});
  await pause(1600);
};

/*
 * Poser une adresse ne suffit pas toujours : juste après la connexion, le
 * document vient d'être remplacé et le routeur peut manquer l'événement
 * natif. On repose l'adresse et on le réveille à la main, jusqu'à ce
 * qu'elle prenne. C'est une précaution de banc d'essai, pas un correctif :
 * un humain qui clique n'arrive jamais aussi vite.
 */
const aller = async (page, hash) => {
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await pause(1200);
    if (await page.evaluate((h) => location.hash === `#${h}`, hash)) return;
  }
};
/* Lire tout ce qui porte le sélecteur, pas seulement le premier : pendant
   un changement d'écran deux « .page » cohabitent un instant, et ne lire
   que le premier, c'est lire la page d'avant. */
const texte = (page, sel = 'body') => page.evaluate((s) => Array.from(document.querySelectorAll(s)).map((el) => el.innerText).join('\n'), sel);

/*
 * Attendre que l'écran dise quelque chose, plutôt que compter les
 * millisecondes. Un refus de lecture met parfois deux secondes à revenir
 * du serveur, et l'écran précédent reste affiché entre-temps : mesurer
 * trop tôt, c'est mesurer la page d'avant.
 */
/* Une capture ne doit jamais faire tomber la recette : elle documente,
   elle ne prouve rien. Les animations sont figées, l'échec est ignoré. */
const cliche = async (page, nom, pleine = true) => {
  try { await page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: pleine, animations: 'disabled', timeout: 15000 }); }
  catch (e) { console.log(`  (capture ${nom} impossible : ${e.message.split('\n')[0]})`); }
};

/* Confirmer, c'est cliquer sur le « oui » de la derniere fiche ouverte :
   celle d'avant reste affichee derriere, et son propre bouton porte
   souvent le meme mot. */
const confirmerOui = async (page) => {
  await page.waitForSelector('.voile [data-oui]', { timeout: 15000 });
  await page.$$eval('.voile [data-oui]', (l) => { if (l.length) l[l.length - 1].click(); });
  await page.waitForFunction(() => !document.querySelector('.voile [data-oui]'), { timeout: 15000 }).catch(() => {});
};

/* Fermer tout ce qui traine, pour que l'ecran suivant soit cliquable. */
const fermerTout = async (page) => {
  for (let i = 0; i < 4; i += 1) {
    if (!(await page.$('.voile'))) return;
    await page.keyboard.press('Escape');
    await pause(400);
  }
};

const attendre = async (page, motif, secondes = 12) => {
  for (let i = 0; i < secondes * 4; i += 1) {
    const t = await texte(page, '.page');
    if (motif.test(t)) return t;
    await pause(250);
  }
  return texte(page, '.page');
};

(async () => {
  require('node:fs').mkdirSync(SHOTS, { recursive: true });
  const navigateur = await chromium.launch();
  const erreurs = { client: [], equipe: [] };

  const ctxEquipe = await navigateur.newContext({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR' });
  const equipe = await ctxEquipe.newPage();
  equipe.on('pageerror', (e) => erreurs.equipe.push(e.message));
  equipe.on('console', (m) => { if (m.type() === 'error') erreurs.equipe.push(m.text()); });

  const ctxClient = await navigateur.newContext({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR' });
  const client = await ctxClient.newPage();
  client.on('pageerror', (e) => erreurs.client.push(e.message));
  client.on('console', (m) => { if (m.type() === 'error') erreurs.client.push(m.text()); });

  /* Les pièces créées par une recette précédente ne doivent pas polluer
     celle-ci : elles portent toutes le préfixe D-QA. */
  const restes = await lire('documents?pageSize=300');
  for (const d of ((restes && restes.documents) || [])) {
    if (/^D-QA/.test(((d.fields || {}).numero || {}).stringValue || '')) {
      await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: proprietaire });
    }
  }

  await connecter(equipe, 'agent.essai@exemple.test');
  await connecter(client, 'camille.essai@exemple.test');

  /* ====================================================================== */
  scenario(1, "Le projet se prépare rideau baissé");
  await aller(equipe, '/projets');
  const listeEquipe = await texte(equipe, '.page');
  verifier(/Refonte Atelier/.test(listeEquipe) || /En préparation/.test(listeEquipe), "l'équipe voit le projet en préparation dans sa liste");
  await aller(equipe, '/projets/prepa');
  const rideau = await equipe.evaluate(() => {
    const r = document.querySelector('.rideau');
    return r ? { texte: r.innerText, bouton: Boolean(r.querySelector('[data-action="ouvrir-au-client"]')), bloque: Boolean(r.querySelector('[data-action="ouvrir-au-client"][disabled]')) } : null;
  });
  verifier(rideau, "la page du projet annonce que le rideau est baissé");
  verifier(rideau && /pas encore ouvert/i.test(rideau.texte), "elle dit en clair que le client n'y a pas accès");
  verifier(rideau && rideau.bouton, "le geste d'ouverture est là");
  verifier(rideau && !rideau.bloque, "il est possible, l'interlocuteur et une étape existent", rideau ? rideau.texte.slice(0, 120) : '');
  await cliche(equipe, '1-rideau-baisse', true);

  await aller(client, '/');
  const accueilClient = await texte(client, '.page');
  verifier(!/Refonte Atelier/.test(accueilClient), "le client ne voit pas le projet en préparation sur son accueil");
  await aller(client, '/projets/prepa');
  const tentative = await attendre(client, /introuvable|plus accès/i);
  verifier(/introuvable|plus accès/i.test(tentative), "l'adresse directe du projet fermé ne donne rien au client", tentative.slice(0, 120));
  await cliche(client, '1-client-dehors', false);

  const devisAvant = await texte(client, '.page');
  await aller(client, '/finances');
  verifier(!/D-2026-048/.test(await texte(client, '.page')), "le devis du projet fermé ne fuit pas non plus");
  void devisAvant;

  /* ====================================================================== */
  scenario(2, "Le devis fondateur, et l'avenant : deux portées");
  const doc = await lire('documents/d-refonte');
  verifier(champ(doc, 'portee') === 'initial', "le devis du projet neuf est marqué fondateur");
  const avenant = await lire('documents/d-avenant');
  verifier(champ(avenant, 'portee') === 'complementaire', "le devis d'un projet lancé est marqué complémentaire");

  /* Un devis déposé maintenant sur le projet déjà lancé doit être un
     avenant, sans qu'on ait à le dire. */
  const auto = await serveur('deposerDocument', { projet: 'atelier', type: 'devis', numero: 'D-QA-001', libelle: 'Essai de portée', montant: 100, tva: 0 });
  verifier(auto.ok && auto.portee === 'complementaire', "un devis de plus sur un projet lancé devient un avenant tout seul", JSON.stringify(auto).slice(0, 120));

  const etatAvant = champ(await lire('projets/prepa'), 'statut');
  const fondateur = await serveur('deposerDocument', { projet: 'prepa', type: 'devis', numero: 'D-QA-002', libelle: 'Second devis', montant: 200, tva: 0 });
  verifier(fondateur.ok && fondateur.portee === 'complementaire', "un second devis sur le même projet devient un avenant, pas un second fondateur");
  verifier(champ(await lire('projets/prepa'), 'statut') === etatAvant, "un avenant ne touche pas à l'état du projet");

  /* ====================================================================== */
  scenario(3, "L'ouverture au client");
  const ouverture = await serveur('ouvrirAuClient', { id: 'prepa', prevenir: true });
  verifier(ouverture.ok && ouverture.ouvert === true, "le projet s'ouvre", JSON.stringify(ouverture).slice(0, 140));
  const ouvert = await lire('projets/prepa');
  verifier(champ(ouvert, 'ouvert') === true, "le rideau est levé dans la fiche");
  verifier(champ(ouvert, 'silence') === false, "la sourdine tombe à l'ouverture");
  const membres = ((ouvert.fields.membres || {}).arrayValue || {}).values || [];
  verifier(membres.length >= 1, "le client est désormais membre du projet", `${membres.length} membre(s)`);

  const invit = await lire('envois?pageSize=300');
  verifier(((invit && invit.documents) || []).some((d) => ((d.fields.modele || {}).stringValue) === 'invitation'), "l'invitation part à l'ouverture");

  await aller(client, '/');
  await pause(2500);
  await aller(client, '/projets/prepa');
  const vu = await attendre(client, /Refonte Atelier/);
  verifier(/Refonte Atelier/.test(vu), "le client voit maintenant le projet", vu.slice(0, 120));
  verifier(!/pas encore ouvert/i.test(vu), "le bandeau du rideau ne s'affiche jamais chez le client");
  await cliche(client, '3-client-entre', true);

  /* ====================================================================== */
  scenario(4, "La signature du devis fondateur fait démarrer le projet");
  await aller(client, '/finances');
  const voitDevis = await attendre(client, /D-2026-048/);
  verifier(/D-2026-048/.test(voitDevis), "le devis fondateur est visible depuis l'ouverture", voitDevis.slice(0, 160));

  await aller(client, '/finances/d-refonte');
  await client.waitForSelector('.voile', { timeout: 20000 }).catch(() => {});
  await pause(900);
  const fiche = await client.evaluate(() => {
    const v = document.querySelector('.voile');
    return v ? { texte: v.innerText, accepter: Boolean(v.querySelector('[data-accepter]')) } : null;
  });
  verifier(fiche && fiche.accepter, "le client peut accepter le devis");
  verifier(fiche && /lance le projet/i.test(fiche.texte), "la fiche dit que ce devis lance le projet", fiche ? fiche.texte.slice(0, 160) : '');
  await cliche(client, '4-devis-fondateur', false);

  await client.click('[data-accepter]');
  await confirmerOui(client);
  await pause(3000);
  await fermerTout(client);
  verifier(champ(await lire('documents/d-refonte'), 'statut') === 'accepte', "le devis passe en accepté");
  verifier(champ(await lire('projets/prepa'), 'statut') === 'devis-signe', "le projet passe en devis signé", champ(await lire('projets/prepa'), 'statut'));

  /* L'avenant, lui, ne doit rien déclencher. */
  await aller(client, '/finances/d-avenant');
  await pause(1800);
  await client.waitForSelector('.voile', { timeout: 15000 }).catch(() => {});
  await pause(700);
  const ficheAvenant = await client.evaluate(() => { const l = document.querySelectorAll('.voile'); return l.length ? l[l.length - 1].innerText : ''; });
  verifier(/complémentaire/i.test(ficheAvenant), "un avenant s'annonce comme tel au client", ficheAvenant.slice(0, 140));
  const etatAtelier = champ(await lire('projets/atelier'), 'statut');
  await client.click('.voile [data-accepter]');
  await confirmerOui(client);
  await pause(3000);
  await fermerTout(client);
  verifier(champ(await lire('documents/d-avenant'), 'statut') === 'accepte', "l'avenant s'accepte aussi");
  verifier(champ(await lire('projets/atelier'), 'statut') === etatAtelier, "mais il ne change pas l'état du projet", `${etatAtelier} puis ${champ(await lire('projets/atelier'), 'statut')}`);

  /* ====================================================================== */
  scenario(5, "Refermer un projet ouvert trop tôt");
  const fermeture = await serveur('fermerAuClient', { id: 'prepa' });
  verifier(fermeture.ok && fermeture.ouvert === false, "le projet se referme");
  await fermerTout(client);
  await aller(client, '/');
  await pause(3000);
  await aller(client, '/projets/prepa');
  verifier(/introuvable|plus accès/i.test(await attendre(client, /introuvable|plus accès/i, 20)), "le client a perdu l'accès immédiatement");
  await serveur('ouvrirAuClient', { id: 'prepa', prevenir: false });
  await pause(1200);

  /* ====================================================================== */
  scenario(6, "Le cloisonnement entre deux clients");
  const ctxLea = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  const lea = await ctxLea.newPage();
  await connecter(lea, 'lea.essai@exemple.test');
  /* Une vraie arrivée par adresse, comme si on lui avait transmis le lien :
     c'est la façon dont un client tomberait sur le projet d'un autre. */
  await lea.goto(`${SITE}/suivi/app?emul#/projets/atelier`, { waitUntil: 'domcontentloaded' });
  await lea.waitForSelector('.page', { timeout: 30000 }).catch(() => {});
  const chezLea = await attendre(lea, /introuvable|plus accès/i, 20);
  const diagLea = await lea.evaluate(() => ({ url: location.pathname + location.hash, pages: document.querySelectorAll('.page').length, vue: (document.querySelector('#vue') || {}).childElementCount }));
  verifier(/introuvable|plus accès/i.test(chezLea), "Léa ne lit pas le projet de Camille", `${JSON.stringify(diagLea)} · ${chezLea.slice(0, 100).replace(/\n/g, ' | ')}`);
  await lea.goto(`${SITE}/suivi/app?emul#/finances`, { waitUntil: 'domcontentloaded' });
  await lea.waitForSelector('.page', { timeout: 30000 }).catch(() => {});
  await pause(2500);
  const financesLea = await texte(lea, '.page');
  verifier(!/D-2026-048|D-2026-049/.test(financesLea), "Léa ne lit aucune pièce de Camille");
  await ctxLea.close();

  /* ====================================================================== */
  scenario(7, "Le client dépose une demande, l'équipe la mène au bout");
  await fermerTout(client);
  await aller(client, '/projets/atelier/nouvelle-demande');
  await pause(1600);
  const titreDemande = `Recette ${Date.now()}`;
  await client.fill('#titre', titreDemande);
  await client.fill('#description', "Le bouton d'export ne rend rien sur iPhone.");
  await client.$$eval('#choix-type input', (l) => { const b = l.find((x) => x.value === 'bug'); if (b) b.click(); });
  await client.click('#forme-demande [type="submit"]');
  await client.waitForFunction(() => /\/demandes\//.test(location.hash), { timeout: 25000 }).catch(() => {});
  await pause(2500);
  const surDemande = await texte(client, '.page');
  verifier(new RegExp(titreDemande).test(surDemande), "la demande est créée et ouverte", surDemande.slice(0, 120));
  verifier(/Reçue/.test(surDemande), "elle s'annonce reçue");
  verifier(/à nous de jouer|rien à faire/i.test(surDemande), "elle dit que la balle est chez Capmedia");
  const idDemande = await client.evaluate(() => (location.hash.match(/demandes\/([^/?]+)/) || [])[1]);

  await aller(equipe, `/projets/atelier/demandes/${idDemande}`);
  await pause(2200);
  verifier(new RegExp(titreDemande).test(await texte(equipe, '.page')), "l'équipe la voit arriver");
  await equipe.$$eval('.page .actions button', (b) => { const x = b.find((y) => /Piloter/.test(y.innerText)); if (x) x.click(); });
  await equipe.waitForSelector('#ed-statut', { timeout: 20000 });
  await pause(500);
  await equipe.$eval('#ed-statut', (s) => { s.value = 'a-valider'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await equipe.$eval('#ed-qualification', (s) => { s.value = 'incluse'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await equipe.$$eval('.voile button', (b) => { const x = b.find((y) => /Enregistrer/.test(y.innerText)); if (x) x.click(); });
  await pause(3000);
  verifier(/À valider/.test(await texte(equipe, '.page')), "l'équipe la passe à valider");

  await aller(client, `/projets/atelier/demandes/${idDemande}`);
  await pause(2200);
  const chezLeClient = await texte(client, '.page');
  verifier(/balle est dans votre camp/i.test(chezLeClient), "le client voit que la balle est chez lui", chezLeClient.slice(0, 200));
  verifier(Boolean(await client.$('[data-action="valider"]')), "le bouton de validation lui est proposé");
  await client.click('[data-action="valider"]');
  await confirmerOui(client);
  await pause(2500);
  verifier(/Terminée/.test(await texte(client, '.page')), "la demande se termine sur sa validation");

  /* ====================================================================== */
  scenario(8, "Ce que le client ne doit jamais voir");
  await aller(client, '/projets/atelier/taches');
  await pause(1600);
  const taches = await texte(client, '.page');
  verifier(!/Refactorer le module de cache/.test(taches), "une tâche interne reste invisible");
  await aller(client, '/projets/atelier');
  await pause(1600);
  const apercu = await texte(client, '.page');
  verifier(!/Sur la bonne voie|Attention|Bloqué/.test(apercu.split('En attente de vous')[0] || ''), "la santé interne du projet ne s'affiche pas chez lui");
  const brique = await client.$('.carte-plateforme');
  if (brique) {
    await brique.click();
    await pause(2200);
    const tec = await texte(client, '.page');
    verifier(!/Comptes et accès|App Store Connect|dépendances/i.test(tec), "la fiche technique ne lui est pas servie", tec.slice(0, 120));
  }

  /* ====================================================================== */
  scenario(9, "Le cockpit reste cohérent");
  await aller(equipe, '/projets');
  await pause(1600);
  const projetsEquipe = await texte(equipe, '.page');
  verifier(/Refonte Atelier|Atelier/.test(projetsEquipe), "la liste des projets répond");
  await aller(equipe, '/finances');
  await pause(1600);
  /* Le cockpit ouvre sur les factures : les devis sont derrière leur
     onglet. Viser l'onglet, pas le bouton « Devis » de l'en-tête, qui lui
     ouvre le formulaire de dépôt. */
  await equipe.$$eval('.onglet, [role="tab"]', (l) => { const x = l.find((y) => /^Devis\b/.test(y.innerText.trim())); if (x) x.click(); });
  await pause(1200);
  const piecesEquipe = await attendre(equipe, /D-2026-048|D-2026-049/, 20);
  verifier(/D-2026-048|D-2026-049/.test(piecesEquipe), "les pièces des deux portées sont là", piecesEquipe.slice(0, 180).replace(/\n/g, ' | '));
  await aller(equipe, '/activite');
  const journal = await attendre(equipe, /signé le devis|signé l'avenant/i, 20);
  verifier(/signé le devis|signé l'avenant/i.test(journal), "le journal garde la trace des signatures", journal.slice(0, 200));
  await cliche(equipe, '9-cockpit', true);

  /* ====================================================================== */
  scenario(10, "Aucune erreur dans les deux espaces");
  verifier(!erreurs.client.length, "aucune erreur de console côté client", erreurs.client.slice(0, 3).join(' | '));
  verifier(!erreurs.equipe.length, "aucune erreur de console côté équipe", erreurs.equipe.slice(0, 3).join(' | '));

  await navigateur.close();
  console.log(soucis.length ? `\n${soucis.length} écart(s) :\n  - ${soucis.join('\n  - ')}` : '\nRECETTE CONFORME');
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error('RECETTE INTERROMPUE :', e.message); process.exit(2); });
