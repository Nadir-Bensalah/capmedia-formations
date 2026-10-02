/* ==========================================================================
   CAPMEDIA CLIENT HUB · les suggestions d'amélioration

   Ce que prouve cette suite, règles comprises (revue de sécurité du
   02/10/2026) :
   - l'équipe crée, publie, ordonne et ouvre l'éditeur d'une suggestion
     (le crayon d'une carte ouvre bien la fiche) ;
   - le client ne lit que les publiées ; une autre cliente rien ;
   - la réponse engage le client : seul le responsable du projet la pose ou
     la change ; à défaut de responsable sur le projet, un membre répond tant
     que la réponse est vide ou déjà la sienne, jamais par-dessus celle d'un
     autre ;
   - la marque « vue » est la sienne seule, datée par le serveur
     (vues.<uid> == request.time) : ni une date choisie, ni la marque d'un
     autre ;
   - à l'écran : le responsable voit les prix et répond, « Ça m'intéresse »
     n'ouvre jamais une seconde demande, « Pas intéressé » disparaît une fois
     intéressé ; un collaborateur ne voit ni les prix ni les boutons de
     réponse ; un filtre de plateforme retenu sans barre pour l'ôter ne
     cache rien.
   Chaque refus est éprouvé par REST avec le vrai jeton de la personne :
   les règles jugent, comme pour le navigateur.

   Banc : émulateurs, site local, semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const { jetonPour } = require('./lib/session-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = process.env.BANC_SITE || 'http://127.0.0.1:8787';
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
const S = (v) => ({ stringValue: String(v) }); const I = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: Boolean(v) });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } }); const T = (d) => ({ timestampValue: d.toISOString() });
const NUL = { nullValue: null };
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

const SUGG = 'projets/atelier/suggestions';
const fiche = (o) => ({
  famille: S(o.famille || 'developpement'), titre: S(o.titre), resume: S(o.resume || ''), texte: S(''), benefice: S(''),
  plateformes: L((o.plateformes || []).map(S)), duree: S('2 semaines'), prix: o.prix == null ? NUL : I(o.prix), tva: I(20), devis: S(''),
  statut: S('proposee'), publication: S(o.publication), ordre: I(o.ordre), aLaUne: B(false), reponse: NUL, jalon: S(''), vues: M({}),
  cree: T(new Date()), maj: T(new Date()),
});
const creer = (id, o) => ({ update: { name: nomDoc(`${SUGG}/${id}`), fields: fiche(o) }, currentDocument: { exists: false } });
/* La réponse du client, telle que l'écran l'écrit : statut, réponse, maj, datées par le serveur. */
const repondre = (id, uid, nom, choix, extra = {}) => ({
  update: { name: nomDoc(`${SUGG}/${id}`), fields: {
    statut: S(choix === 'interesse' ? 'a-l-etude' : 'refusee'),
    reponse: M({ par: S(uid), nom: S(nom), choix: S(choix), raison: S(''), demande: S('') }),
    ...extra,
  } },
  updateMask: { fieldPaths: ['statut', 'reponse', 'maj', ...Object.keys(extra)] },
  updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'reponse.le', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: true },
});
const effacerReponse = (id) => ({
  update: { name: nomDoc(`${SUGG}/${id}`), fields: { statut: S('proposee'), reponse: NUL } },
  updateMask: { fieldPaths: ['statut', 'reponse', 'maj'] },
  updateTransforms: [{ fieldPath: 'maj', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: true },
});
const marquerVue = (id, uid) => ({ transform: { document: nomDoc(`${SUGG}/${id}`), fieldTransforms: [{ fieldPath: `vues.${uid}`, setToServerValue: 'REQUEST_TIME' }] }, currentDocument: { exists: true } });
const marquerVueDatee = (id, uid, d) => ({ update: { name: nomDoc(`${SUGG}/${id}`), fields: { vues: M({ [uid]: T(d) }) } }, updateMask: { fieldPaths: [`vues.${uid}`] }, currentDocument: { exists: true } });
const remettre = async (id) => poser(`${SUGG}/${id}`, { statut: S('proposee'), reponse: NUL }, ['statut', 'reponse']);
const reponseDe = async (id) => (champ(await lire(`${SUGG}/${id}`), 'reponse').mapValue || {}).fields || null;

(async () => {
  const ADMIN = 'agent.essai@exemple.test'; const CAMILLE = 'camille.essai@exemple.test'; const LEA = 'lea.essai@exemple.test';
  const COLLAB = 'collab.sugg@exemple.test';
  await vider(SUGG);
  for (const t of await docs('tickets?pageSize=300')) if (str(t, 'suggestion')) await fetch(`http://127.0.0.1:8080/v1/${t.name}`, { method: 'DELETE', headers: prop });

  /* Un collaborateur d'Atelier, à côté de Camille, responsable. */
  const uidCollab = await ouvrirCompte(COLLAB);
  const uidCamille = await uidDe(CAMILLE);
  const atelier = await lire('projets/atelier');
  const membres = ((champ(atelier, 'membres').arrayValue || {}).values || []).map((v) => v.stringValue);
  const rolesAvant = (champ(atelier, 'roles').mapValue || {}).fields || {};
  const roles = async (r) => poser('projets/atelier', { membres: L([...new Set([...membres, uidCollab])].map(S)), roles: M(Object.fromEntries(Object.entries(r).map(([u, v]) => [u, S(v)]))) }, ['membres', 'roles']);
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });
  const jA = await jetonPour(ADMIN); const jC = await jetonPour(CAMILLE); const jCo = await jetonPour(COLLAB); const jL = await jetonPour(LEA);

  console.log('\n== L équipe crée ; personne d autre');
  verifier(await statutCommit(jA, [creer('s-widgets', { titre: 'Des widgets sur l écran d accueil', resume: 'Vos tâches du jour sans ouvrir l application.', plateformes: ['ios'], prix: 1200, publication: 'publiee', ordre: 1 })]) === 200, 'l équipe crée une suggestion publiée (développement, iOS, 1 200 € HT)');
  verifier(await statutCommit(jA, [creer('s-brouillon', { titre: 'Une Dynamic Island', plateformes: ['ios'], prix: 900, publication: 'brouillon', ordre: 2 })]) === 200, 'et un brouillon dans la même famille');
  verifier(await statutCommit(jA, [creer('s-aide', { famille: 'conseil', titre: 'Une page d aide', resume: 'Moins de questions par e-mail.', prix: 300, publication: 'publiee', ordre: 1 })]) === 200, 'et un conseil publié');
  verifier(await statutCommit(jC, [creer('s-intrus', { titre: 'Par la cliente', publication: 'publiee', ordre: 9 })]) === 403, 'la cliente responsable ne crée rien (403)');
  verifier(await statutCommit(jCo, [creer('s-intrus', { titre: 'Par le collaborateur', publication: 'publiee', ordre: 9 })]) === 403, 'le collaborateur non plus (403)');

  console.log('\n== Qui lit quoi');
  verifier(await statutLecture(`${SUGG}/s-widgets`, jC) === 200 && await statutLecture(`${SUGG}/s-widgets`, jCo) === 200, 'le responsable et le collaborateur lisent une publiée');
  verifier(await statutLecture(`${SUGG}/s-brouillon`, jC) === 403 && await statutLecture(`${SUGG}/s-brouillon`, jCo) === 403, 'aucun des deux ne lit un brouillon (403)');
  verifier(await statutLecture(`${SUGG}/s-widgets`, jL) === 403, 'une cliente d un autre projet ne lit rien (403)');
  verifier(await statutLecture(`${SUGG}/s-widgets`, '') === 403, 'sans session non plus');

  console.log('\n== La marque « vue » : la sienne, datée par le serveur');
  verifier(await statutCommit(jCo, [marquerVue('s-widgets', uidCollab)]) === 200, 'le collaborateur pose sa marque, datée par le serveur');
  verifier(await statutCommit(jC, [marquerVueDatee('s-widgets', uidCamille, new Date('2020-01-01T00:00:00Z'))]) === 403, 'une date choisie par le client est refusée (403)');
  verifier(await statutCommit(jC, [marquerVueDatee('s-widgets', uidCamille, new Date(Date.now() + 86400000 * 365))]) === 403, 'une date dans le futur aussi (403)');
  verifier(await statutCommit(jC, [marquerVue('s-widgets', uidCollab)]) === 403, 'la marque d un autre aussi (403)');
  verifier(await statutCommit(jC, [marquerVue('s-brouillon', uidCamille)]) === 403, 'et sur un brouillon, rien (403)');

  console.log('\n== La réponse : au responsable du projet');
  verifier(await statutCommit(jCo, [repondre('s-widgets', uidCollab, 'Collab', 'interesse')]) === 403, 'le collaborateur ne répond pas quand le projet a un responsable (403)');
  verifier(await statutCommit(jC, [repondre('s-aide', uidCamille, 'Camille Martin', 'pas-interesse')]) === 200, 'le responsable décline le conseil');
  verifier(await statutCommit(jCo, [effacerReponse('s-aide')]) === 403, 'le collaborateur n efface pas la réponse du responsable (403)');
  verifier(await statutCommit(jCo, [repondre('s-aide', uidCollab, 'Collab', 'interesse')]) === 403, 'ni ne la remplace (403)');
  verifier(await statutCommit(jC, [repondre('s-widgets', uidCamille, 'Camille Martin', 'interesse', { prix: I(1) })]) === 403, 'le responsable ne touche pas au prix en répondant (403)');
  verifier(await statutCommit(jC, [repondre('s-widgets', uidCollab, 'Collab', 'interesse')]) === 403, 'ni ne répond au nom d un autre (403)');
  verifier(await statutCommit(jC, [effacerReponse('s-aide')]) === 200, 'le responsable revient sur son choix');

  console.log('\n== À défaut de responsable : premier arrivé, jamais par-dessus un autre');
  await roles({ [uidCamille]: 'collaborateur', [uidCollab]: 'collaborateur' });
  verifier(await statutCommit(jCo, [repondre('s-widgets', uidCollab, 'Collab', 'interesse')]) === 200, 'sans responsable, un membre répond à une suggestion sans réponse');
  verifier(await statutCommit(jC, [repondre('s-widgets', uidCamille, 'Camille Martin', 'pas-interesse')]) === 403, 'un autre membre ne la remplace pas (403)');
  verifier(await statutCommit(jC, [effacerReponse('s-widgets')]) === 403, 'ni ne l efface (403)');
  verifier(await statutCommit(jCo, [repondre('s-widgets', uidCollab, 'Collab', 'pas-interesse')]) === 200, 'l auteur change sa propre réponse');
  await roles({ [uidCamille]: 'responsable', [uidCollab]: 'collaborateur' });
  verifier(await statutCommit(jC, [repondre('s-widgets', uidCamille, 'Camille Martin', 'interesse')]) === 200, 'redevenue responsable, Camille reprend la main sur la réponse');
  await remettre('s-widgets'); await remettre('s-aide');

  const nav = await chromium.launch();
  const erreurs = [];
  console.log('\n== L équipe, dans le Cockpit : publier, ordonner, modifier');
  const equipe = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page = equipe;
  equipe.on('pageerror', (e) => erreurs.push(`cockpit: ${e.message.slice(0, 160)}`));
  await connecter(equipe, ADMIN);
  await aller(equipe, '#/projets/atelier/suggestions');
  await equipe.waitForSelector('[data-groupe-suggestions]', { timeout: 20000 }).catch(() => {});
  verifier((await equipe.$$('article[data-suggestion]')).length === 3, 'l équipe voit les trois, brouillon compris');
  await equipe.click('[data-action="suggestion-publier"][data-id="s-brouillon"]');
  verifier(await attendre(async () => str(await lire(`${SUGG}/s-brouillon`), 'publication') === 'publiee'), '« Publier » publie le brouillon');
  await pause(800);
  await equipe.click('[data-action="suggestion-publier"][data-id="s-brouillon"]');
  verifier(await attendre(async () => str(await lire(`${SUGG}/s-brouillon`), 'publication') === 'brouillon'), '« Dépublier » le remet en brouillon');
  await pause(800);
  await equipe.click('[data-action="suggestion-descendre"][data-id="s-widgets"]');
  const ordre = async (id) => Number(champ(await lire(`${SUGG}/${id}`), 'ordre').integerValue || 0);
  verifier(await attendre(async () => (await ordre('s-widgets')) > (await ordre('s-brouillon'))), '« Descendre » passe la suggestion après sa voisine de famille');
  await pause(800);
  await equipe.click('[data-action="editer"][data-genre="suggestion"][data-id="s-widgets"]');
  const editeur = await attendre(async () => equipe.evaluate(() => { const v = document.querySelector('.voile'); return v ? [...v.querySelectorAll('input, textarea')].map((i) => i.value).join(' | ') : ''; }), 8000);
  verifier(Boolean(editeur) && /widgets/i.test(editeur), 'le crayon de la carte ouvre l éditeur de la suggestion, rempli', (editeur || '').slice(0, 120));
  await equipe.keyboard.press('Escape'); await pause(500);

  console.log('\n== Le responsable, dans le Hub');
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(`hub: ${e.message.slice(0, 160)}`));
  await connecter(page, CAMILLE);
  /* Un filtre de plateforme retenu d'une visite précédente, alors que la
     barre de filtres n'a plus lieu d'être (une seule plateforme) : il ne
     doit rien cacher. */
  await page.evaluate(() => sessionStorage.setItem('suivi:filtre-suggestions:atelier', 'android'));
  await aller(page, '#/projets/atelier/suggestions');
  await page.waitForSelector('[data-groupe-suggestions]', { timeout: 20000 }).catch(() => {});
  const cartes = await page.$$eval('article[data-suggestion]', (els) => els.map((e) => e.dataset.suggestion));
  verifier(cartes.includes('s-widgets') && cartes.includes('s-aide') && !cartes.includes('s-brouillon'), 'le client voit les deux publiées, pas le brouillon', cartes.join(', '));
  verifier(cartes.includes('s-widgets'), 'un filtre retenu sans barre pour l ôter ne cache rien');
  verifier((await page.$$('.sugg-prix')).length >= 2, 'le responsable voit les prix');
  verifier(await attendre(async () => Boolean(((champ(await lire(`${SUGG}/s-widgets`), 'vues').mapValue || {}).fields || {})[uidCamille])), 'ouvrir l onglet pose sa marque « vue », par l écran');
  await page.click('[data-action="suggestion-interesse"][data-id="s-widgets"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  const demandes = async () => (await docs('tickets?pageSize=300')).filter((t) => str(t, 'suggestion') === 's-widgets');
  verifier(await attendre(async () => (await demandes()).length === 1 && str(await lire(`${SUGG}/s-widgets`), 'statut') === 'a-l-etude'), '« Ça m intéresse » ouvre une demande et passe la suggestion à l étude');
  const r1 = await reponseDe('s-widgets');
  verifier(r1 && (r1.par || {}).stringValue === uidCamille && (r1.choix || {}).stringValue === 'interesse', 'la réponse est à son nom');
  await pause(1000);
  await page.click('[data-action="ouvrir-suggestion"][data-id="s-widgets"]');
  await page.waitForSelector('.voile', { timeout: 8000 });
  verifier(!(await page.$('.voile [data-pas-interesse]')) && !(await page.$('.voile [data-interesse]')), 'une fois intéressé, ni « Pas intéressé » ni « Ça m intéresse » dans la fiche');
  await page.keyboard.press('Escape'); await pause(500);
  /* La réponse effacée (revenir sur son choix), un second « Ça m'intéresse »
     reprend la demande encore ouverte, sans en créer une seconde. */
  await remettre('s-widgets');
  await attendre(async () => Boolean(await page.$('[data-action="suggestion-interesse"][data-id="s-widgets"]')), 10000);
  await page.click('[data-action="suggestion-interesse"][data-id="s-widgets"]');
  await page.waitForSelector('.voile [data-oui]', { timeout: 8000 });
  await page.click('.voile [data-oui]');
  verifier(await attendre(async () => str(await lire(`${SUGG}/s-widgets`), 'statut') === 'a-l-etude'), 'le second « Ça m intéresse » repasse la suggestion à l étude');
  await pause(1500);
  const toutes = await demandes();
  verifier(toutes.length === 1, 'sans ouvrir une seconde demande', `${toutes.length} demande(s)`);
  const r2 = await reponseDe('s-widgets');
  verifier(r2 && toutes[0] && (r2.demande || {}).stringValue === toutes[0].name.split('/').pop(), 'la réponse pointe la demande déjà ouverte');

  console.log('\n== Un collaborateur, dans le Hub : ni prix, ni réponse');
  await roles({ [uidCamille]: 'collaborateur', [uidCollab]: 'responsable' });
  await remettre('s-aide');
  await page.reload({ waitUntil: 'domcontentloaded' }); await pause(3000);
  await aller(page, '#/projets/atelier/suggestions');
  await page.waitForSelector('[data-groupe-suggestions]', { timeout: 20000 }).catch(() => {});
  const texteOnglet = (await page.$$eval('[data-groupe-suggestions]', (els) => els.map((e) => e.textContent).join(' '))) || '';
  verifier((await page.$$('article[data-suggestion]')).length === 2, 'le collaborateur voit les deux publiées');
  verifier((await page.$$('.sugg-prix')).length === 0 && !/€/.test(texteOnglet), 'mais aucun prix, ni HT ni TTC', texteOnglet.slice(0, 160));
  verifier(!(await page.$('[data-action="suggestion-interesse"]')), 'et aucun « Ça m intéresse » sur les cartes');
  await page.click('[data-action="ouvrir-suggestion"][data-id="s-aide"]');
  await page.waitForSelector('.voile', { timeout: 8000 });
  const ficheCollab = await page.evaluate(() => { const v = document.querySelector('.voile'); return { texte: v.textContent, interesse: Boolean(v.querySelector('[data-interesse]')), decline: Boolean(v.querySelector('[data-pas-interesse]')), reservee: Boolean(v.querySelector('[data-reponse-reservee]')) }; });
  verifier(!ficheCollab.interesse && !ficheCollab.decline, 'la fiche ne lui propose ni « Ça m intéresse » ni « Pas intéressé »');
  verifier(ficheCollab.reservee, 'elle lui dit que c est le responsable qui répond');
  verifier(!/€/.test(ficheCollab.texte), 'et ne montre pas le prix', ficheCollab.texte.slice(0, 200));
  await page.keyboard.press('Escape'); await pause(400);

  await poser('projets/atelier', { roles: M(rolesAvant), membres: L(membres.map(S)) }, ['roles', 'membres']);
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-suggestions-echec.png' }); } catch (err) { /* rien */ } }
  process.exit(2);
});
