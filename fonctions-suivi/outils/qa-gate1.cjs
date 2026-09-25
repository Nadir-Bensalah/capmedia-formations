require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · Release Gate 1, dans un vrai navigateur

   Le parcours fondamental, et les défauts qui le cassaient :
   1. le client crée une demande, Capmedia la reçoit, répond, le client
      voit la réponse (et pas la note interne) ;
   2. une conversation de plus de trois cents messages : les DERNIERS sont
      à l'écran, l'historique se charge à la demande, dans l'ordre ;
   3. un éditeur : il se ferme après un succès, un double envoi ne crée
      qu'une fiche, une erreur garde la feuille ouverte avec la saisie ;
   4. un lien profond vers une demande, navigateur fermé, connexion à
      faire, Firestore lent : il ouvre exactement cette demande ;
   5. la déconnexion efface la clé d'administration du navigateur.

     (émulateurs avec les fonctions, semis de semer-suivi, serveur local sur 8787)
     node fonctions-suivi/outils/qa-gate1.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET = 'capmedia-1f90d', SITE = 'http://127.0.0.1:8787';
const CLE = process.env.ADMIN_CLE_ESSAI || 'cle-essai-locale';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const RACINE = `projects/${PROJET}/databases/(default)/documents`;
const bdd = (c) => `http://127.0.0.1:8080/v1/${RACINE}/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const str = (d, k) => ((((d || {}).fields || {})[k]) || {}).stringValue || '';
const soucis = []; const ok = (m) => console.log('  ok     ' + m); const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, b, m) => (c ? ok(b) : dire(m ? `${b} · ${m}` : b));
const attendre = async (fn, n = 30, ms = 500) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await pause(ms); } return null; };
const requete = async (collection, filtres) => {
  const r = await fetch(`http://127.0.0.1:8080/v1/${RACINE}:runQuery`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { compositeFilter: { op: 'AND', filters: filtres.map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } })) } } } }) });
  return ((await r.json()) || []).filter((x) => x.document).map((x) => x.document);
};
const dernierCode = async (e) => { for (let i = 0; i < 40; i++) { const j = await lire('envois?pageSize=200'); const p = ((j && j.documents) || []).filter((d) => str(d, 'modele') === 'code' && ((((d.fields || {}).a || {}).arrayValue || {}).values || []).some((x) => ((((x.mapValue || {}).fields || {}).email) || {}).stringValue === e)); if (p.length) { p.sort((x, y) => new Date(((y.fields.cree || {}).timestampValue) || 0) - new Date(((x.fields.cree || {}).timestampValue) || 0)); const v = (((p[0].fields.variables || {}).mapValue || {}).fields) || {}; if (v.code && v.code.stringValue) return v.code.stringValue; } await pause(300); } return ''; };
/* La porte de connexion, là où l'on se trouve (elle peut porter un « retour »). */
const saisirCode = async (page, email) => {
  /* Un ancien code encore en file serait relu à la place du neuf. */
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.waitForSelector('#forme:not(.masque)', { timeout: 25000 });
  await page.fill('#email', email); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 25000 });
  await page.fill('#code', await dernierCode(email));
};
const connecter = async (page, email) => {
  await page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await saisirCode(page, email);
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(2500);
};
const aller = async (page, hash, sel) => {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    if (!sel || await page.waitForSelector(sel, { timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  await pause(500);
};
const suffixe = Date.now().toString(36);

/* 320 messages datés d'une minute en minute, le plus récent en dernier. */
const N = 320;
const libelle = (i) => `Message d essai ${String(i).padStart(3, '0')}`;
const semerConversation = async (pid) => {
  const debut = Date.now() - (N + 10) * 60000;
  for (let lot = 0; lot < N; lot += 100) {
    const writes = [];
    for (let i = lot + 1; i <= Math.min(N, lot + 100); i++) {
      writes.push({ update: { name: `${RACINE}/projets/${pid}/messages/gate1-${String(i).padStart(3, '0')}`, fields: {
        texte: { stringValue: libelle(i) }, pieces: { arrayValue: {} },
        de: { mapValue: { fields: { uid: { stringValue: i % 2 ? 'camille' : 'agent' }, nom: { stringValue: i % 2 ? 'Camille Martin' : 'Alex Durand' }, cote: { stringValue: i % 2 ? 'client' : 'equipe' } } } },
        date: { timestampValue: new Date(debut + i * 60000).toISOString() },
      } } });
    }
    await fetch(`http://127.0.0.1:8080/v1/${RACINE}:commit`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  }
};
/* Les numéros des messages d'essai à l'écran, dans l'ordre du fil. */
const numerosAffiches = (page) => page.$$eval('#fil .message', (els) => els.map((e) => { const m = e.textContent.match(/Message d essai (\d{3})/); return m ? Number(m[1]) : null; }).filter((n) => n !== null));
const verifierConversation = async (page, qui) => {
  await aller(page, '#/messages/atelier', '#fil .message');
  await attendre(async () => (await numerosAffiches(page)).includes(N), 30, 500);
  let vus = await numerosAffiches(page);
  verifier(vus.includes(N), `${qui} : le dernier message (n° ${N}) est à l écran`);
  verifier(!vus.includes(1), `${qui} : le premier n est pas chargé d emblée`, `${vus.length} affichés`);
  verifier(vus.length <= 160, `${qui} : le fil ne charge pas tout (${vus.length} messages d essai affichés)`);
  const bas = await page.$eval('#fil', (f) => f.scrollHeight - f.scrollTop - f.clientHeight);
  verifier(bas < 40, `${qui} : le fil s ouvre en bas, sur le plus récent`, `reste ${bas}px`);
  verifier(Boolean(await page.$('[data-plus-anciens]')), `${qui} : un bouton propose les messages plus anciens`);
  for (let i = 0; i < 12 && await page.$('[data-plus-anciens]'); i++) {
    const avant = (await numerosAffiches(page)).length;
    await page.click('[data-plus-anciens]');
    await attendre(async () => (await numerosAffiches(page)).length > avant || !(await page.$('[data-plus-anciens]')), 20, 300);
  }
  vus = await numerosAffiches(page);
  verifier(vus.includes(1), `${qui} : l historique se charge jusqu au premier message`);
  verifier(vus.length === N && new Set(vus).size === N, `${qui} : chaque message une fois, sans trou ni doublon`, `${vus.length} affichés, ${new Set(vus).size} distincts`);
  verifier(vus.every((n, i) => i === 0 || n > vus[i - 1]), `${qui} : dans l ordre chronologique`);
  verifier(!(await page.$('[data-plus-anciens]')), `${qui} : le bouton disparaît au début de la conversation`);
};

(async () => {
  const nav = await chromium.launch();
  const erreurs = [];
  /* Le banc ne touche JAMAIS la production. Un navigateur neuf n'a pas le
     drapeau « emul » : la page se brancherait sur le vrai projet. Chaque
     contexte le reçoit d'avance (ce n'est pas une session, seulement le
     branchement du banc), et toute requête vers un service de production
     est coupée et comptée comme un écart. */
  const PRODUCTION = /(^https:\/\/[^/]*cloudfunctions\.net\/)|(^https:\/\/(firestore|identitytoolkit|securetoken|firebasestorage|firebaseinstallations)\.googleapis\.com\/)/;
  const fuites = [];
  const contexte = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('suivi:emul', '1'); } catch (e) { /* rien */ } });
    await ctx.route(PRODUCTION, (route) => { fuites.push(route.request().url()); route.abort(); });
    const page = await ctx.newPage();
    /* « session absente » et « redirection » sont les arrêts voulus d'un espace qui renvoie ailleurs. */
    page.on('pageerror', (e) => { if (!/^(session absente|redirection)$/.test(e.message)) erreurs.push(e.message); });
    return { ctx, page };
  };

  /* ------------------------------------------------------------------ */
  console.log('\n== 1. Le client crée une demande, Capmedia répond, le client voit la réponse');
  const cl = await contexte();
  await connecter(cl.page, 'camille.essai@exemple.test');
  await aller(cl.page, '#/projets/atelier/nouvelle-demande', '#forme-demande');
  const titre = `Le bouton Payer ne répond plus ${suffixe}`;
  await cl.page.fill('#titre', titre);
  await cl.page.fill('#description', 'Sur la page panier, le bouton ne fait rien depuis ce matin.');
  await cl.page.click('#forme-demande [type="submit"]');
  await cl.page.waitForFunction(() => /#\/projets\/atelier\/demandes\/[A-Za-z0-9]+$/.test(location.hash), null, { timeout: 20000 }).catch(() => {});
  const tid = (cl.page.url().match(/demandes\/([A-Za-z0-9]+)$/) || [])[1];
  verifier(Boolean(tid), 'la demande est créée et sa fiche s ouvre côté client', cl.page.url());
  const ticket = tid ? await lire(`tickets/${tid}`) : null;
  verifier(ticket && str(ticket, 'titre') === titre && str(ticket, 'projet') === 'atelier', 'la demande est en base, sur le bon projet');

  const eq = await contexte();
  await connecter(eq.page, 'agent.essai@exemple.test');
  await aller(eq.page, '#/demandes', '.page');
  const recue = await attendre(async () => (await eq.page.content()).includes(titre), 30, 500);
  verifier(Boolean(recue), 'Capmedia voit la demande dans sa liste');
  await aller(eq.page, `#/projets/atelier/demandes/${tid}`, '#texte-message');
  const reponse = `Bien reçu, nous regardons le panier ${suffixe}.`;
  const note = `Note interne : piste du paiement ${suffixe}.`;
  await eq.page.fill('#texte-message', reponse);
  await eq.page.click('#forme-message [type="submit"]');
  const enBase = await attendre(async () => { const j = await lire(`tickets/${tid}/messages?pageSize=50`); return ((j && j.documents) || []).find((d) => str(d, 'texte') === reponse); }, 30, 500);
  verifier(Boolean(enBase), 'la réponse de Capmedia est en base');
  await eq.page.check('#mode-interne');
  await eq.page.fill('#texte-message', note);
  await eq.page.click('#forme-message [type="submit"]');
  await attendre(async () => { const j = await lire(`tickets/${tid}/messages?pageSize=50`); return ((j && j.documents) || []).find((d) => str(d, 'texte') === note); }, 30, 500);

  await cl.page.reload({ waitUntil: 'domcontentloaded' });
  const vue = await attendre(async () => (await cl.page.content()).includes(reponse), 40, 500);
  verifier(Boolean(vue), 'le client voit la réponse de Capmedia sur sa demande');
  verifier(!(await cl.page.content()).includes(note), 'le client ne voit pas la note interne');

  /* ------------------------------------------------------------------ */
  console.log(`\n== 2. Une conversation de ${N} messages`);
  await semerConversation('atelier');
  await cl.page.reload({ waitUntil: 'domcontentloaded' }); await pause(2000);
  await verifierConversation(cl.page, 'client');
  await eq.page.reload({ waitUntil: 'domcontentloaded' }); await pause(2000);
  await verifierConversation(eq.page, 'Capmedia');
  await eq.page.fill('#texte-message', `Nouveau message ${suffixe}`);
  await eq.page.click('#forme-message [type="submit"]');
  const arrive = await attendre(async () => (await cl.page.content()).includes(`Nouveau message ${suffixe}`), 30, 500);
  verifier(Boolean(arrive), 'un nouveau message arrive en direct au bout du fil, historique chargé');

  /* ------------------------------------------------------------------ */
  console.log('\n== 3. Un éditeur : fermé au succès, un seul envoi, ouvert sur erreur');
  const taches = async (t) => (await requete('taches', [['titre', t]])).length;
  const ouvrirTache = async () => {
    await aller(eq.page, '#/taches', '[data-nouvelle]');
    await eq.page.click('[data-nouvelle]');
    if (await eq.page.waitForSelector('#choix-p', { timeout: 3000 }).then(() => true).catch(() => false)) {
      await eq.page.selectOption('#choix-p', 'atelier'); await eq.page.click('.voile [data-ok]');
    }
    await eq.page.waitForSelector('#ed-forme', { timeout: 8000 });
  };
  const feuilleOuverte = async () => Boolean(await eq.page.$('#ed-forme'));

  const t1 = `Revoir le panier ${suffixe}`;
  await ouvrirTache();
  await eq.page.fill('#ed-titre', t1);
  await eq.page.dblclick('.voile button[type="submit"][form="ed-forme"]');
  await attendre(async () => !(await feuilleOuverte()), 20, 300);
  verifier(!(await feuilleOuverte()), 'après un succès, la feuille se ferme');
  await pause(1500);
  verifier(await taches(t1) === 1, 'un double clic ne crée qu une tâche', `${await taches(t1)} créée(s)`);

  const t2 = `Revoir le paiement ${suffixe}`;
  await ouvrirTache();
  await eq.page.fill('#ed-titre', t2);
  /* Deux soumissions dans le même instant, sans passer par le bouton : c'est la garde de la feuille qui répond. */
  await eq.page.evaluate(() => { const f = document.querySelector('#ed-forme'); f.requestSubmit(); f.requestSubmit(); });
  await attendre(async () => !(await feuilleOuverte()), 20, 300);
  await pause(1500);
  verifier(await taches(t2) === 1, 'deux soumissions simultanées ne créent qu une tâche', `${await taches(t2)} créée(s)`);

  await ouvrirTache();
  const tropLong = `Titre trop long ${suffixe} `.padEnd(200, 'x');
  await eq.page.fill('#ed-titre', tropLong);
  await eq.page.click('.voile button[type="submit"][form="ed-forme"]');
  await pause(3000);
  verifier(await feuilleOuverte(), 'une écriture refusée garde la feuille ouverte');
  verifier(await eq.page.$eval('#ed-titre', (e) => e.value).catch(() => '') === tropLong, 'avec la saisie intacte');
  verifier(await eq.page.$eval('.voile button[type="submit"][form="ed-forme"]', (b) => !b.disabled).catch(() => false), 'et le bouton de nouveau utilisable');
  verifier(await taches(tropLong) === 0, 'rien n est écrit');
  await eq.page.keyboard.press('Escape');

  /* ------------------------------------------------------------------ */
  console.log('\n== 4. Un lien profond vers une demande, navigateur fermé');
  const froid = async (email, attendu, lent) => {
    const f = await contexte();
    if (lent) {
      /* Firestore répond après le routeur : chaque appel à l'émulateur attend. */
      await f.page.route(/127\.0\.0\.1:8080\//, async (route) => { await pause(1200); route.continue().catch(() => {}); });
    }
    await f.page.goto(`${SITE}/suivi/ticket?t=${tid}`, { waitUntil: 'domcontentloaded' });
    await f.page.waitForURL(/\/suivi\/(\?|index)/, { timeout: 20000 }).catch(() => {});
    verifier(/retour=/.test(f.page.url()), `${email} : sans session, la porte garde la destination`, f.page.url());
    await saisirCode(f.page, email);
    await f.page.waitForFunction((t) => location.hash === `#/projets/atelier/demandes/${t}`, tid, { timeout: 60000 }).catch(() => {});
    const url = f.page.url();
    verifier(url.includes(`/suivi/${attendu}#/projets/atelier/demandes/${tid}`), `${email}${lent ? ' (Firestore lent)' : ''} : le lien ouvre exactement cette demande, dans son espace`, url);
    const affiche = await attendre(async () => (await f.page.content()).includes(titre), 40, 500);
    verifier(Boolean(affiche), `${email}${lent ? ' (Firestore lent)' : ''} : la fiche de la demande est à l écran`);
    await f.ctx.close();
  };
  await froid('agent.essai@exemple.test', 'cockpit', false);
  await froid('agent.essai@exemple.test', 'cockpit', true);
  await froid('camille.essai@exemple.test', 'hub', false);
  /* Déjà connecté : la route courte se résout aussi. */
  await eq.page.goto(`${SITE}/suivi/cockpit#/demande/${tid}`, { waitUntil: 'domcontentloaded' });
  await eq.page.waitForFunction((t) => location.hash === `#/projets/atelier/demandes/${t}`, tid, { timeout: 30000 }).catch(() => {});
  verifier(eq.page.url().endsWith(`#/projets/atelier/demandes/${tid}`), 'connecté, cockpit#/demande/<id> ouvre la fiche');
  await eq.page.goto(`${SITE}/suivi/cockpit#/demande/inexistante`, { waitUntil: 'domcontentloaded' });
  const introuvable = await attendre(async () => (await eq.page.content()).includes('Demande introuvable'), 30, 500);
  verifier(Boolean(introuvable), 'une demande inconnue dit qu elle est introuvable');

  /* ------------------------------------------------------------------ */
  console.log('\n== 5. La déconnexion efface la clé d administration');
  await eq.page.evaluate((k) => { localStorage.setItem('suivi:cle-admin', k); sessionStorage.setItem('suivi:cle-admin', k); }, CLE);
  await aller(eq.page, '#/', null);
  await eq.page.click('#bouton-compte');
  await eq.page.getByText('Se déconnecter').click();
  await eq.page.waitForURL(/\/suivi\/(\?|$|index)/, { timeout: 20000 }).catch(() => {});
  const cle = await eq.page.evaluate(() => [localStorage.getItem('suivi:cle-admin'), sessionStorage.getItem('suivi:cle-admin')]);
  verifier(cle[0] === null && cle[1] === null, 'après « Se déconnecter », la clé n est plus dans le navigateur', JSON.stringify(cle));

  /* ------------------------------------------------------------------ */
  console.log('\n== 6. La porte ne s envoie pas avant d être prête');
  /* Visible avant son script, le formulaire partait par le navigateur :
     page rechargée, adresse dans l'URL, saisie perdue. */
  const html = await (await fetch(`${SITE}/suivi/`)).text();
  verifier(/<form id="forme" class="[^"]*\bmasque\b/.test(html), 'le formulaire d adresse est masqué tant que le script n a pas tourné');
  const p6 = await contexte();
  await p6.page.goto(`${SITE}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  const pret = await p6.page.waitForSelector('#forme:not(.masque)', { timeout: 20000 }).then(() => true).catch(() => false);
  await p6.page.fill('#email', 'camille.essai@exemple.test'); await p6.page.click('#envoyer');
  const codeVisible = await p6.page.waitForSelector('#forme-code:not(.masque)', { timeout: 20000 }).then(() => true).catch(() => false);
  verifier(pret && codeVisible && !/[?&]email=/.test(p6.page.url()), 'dès qu il paraît, il demande le code sans recharger la page', p6.page.url());
  await p6.ctx.close();

  verifier(!erreurs.length, 'aucune erreur de script', erreurs.slice(0, 3).join(' | '));
  verifier(!fuites.length, 'aucune requête vers la production', fuites.slice(0, 3).join(' | '));
  await nav.close();
  console.log(`\n${soucis.length ? `${soucis.length} ÉCART(S)` : 'tout est conforme'}`);
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
