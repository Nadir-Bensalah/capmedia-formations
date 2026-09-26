require('./lib/garde-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'ordre de déploiement de la Gate 2, prouvé

   Le banc reproduit l'état d'AVANT (une copie pseudonymisée de la
   production, plus un client d'avant avec devis, facture et activité),
   puis on déploie pièce par pièce, dans l'ordre à éprouver. À chaque
   étape, les mêmes sondes, dans de vrais navigateurs et à la porte du
   serveur :

     client   le client d'avant entre, voit son projet et ses pièces,
              écrit dans la conversation ; il ne lit pas le projet de sa
              société dont il n'est pas membre ;
     admin    le cockpit s'ouvre ; une opération serveur essentielle
              (créer un projet) ; une opération de base (modifier une
              étape, telle que l'écran l'écrit) ;
     envois   un message de l'équipe sur le projet ouvert : le client est-il
              prévenu ? sur un projet qui doit rester muet : zéro e-mail ;
     testeur  il ne lit pas le projet.

   Ce fichier ne pilote pas les émulateurs : ordre-deploiement.sh les
   arrête et les relance entre deux étapes (fonctions, règles) ; il sonde.

     node fonctions-suivi/outils/ordre-deploiement-gate2.cjs poser <releve.json>
     node fonctions-suivi/outils/ordre-deploiement-gate2.cjs sonder <étape> <site> <ancien|nouveau>
   ========================================================================== */
const { chromium } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const auth = getAuth();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
const declencheurs = async (allumes) => { await fetch(`http://${HUB}/functions/${allumes ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' }); };
const compteurs = async () => `${(await bdd.collection('envois').count().get()).data().count}/${(await bdd.collectionGroup('notifications').count().get()).data().count}/${(await bdd.collection('activite').count().get()).data().count}`;
/* Attendre que les déclencheurs aient tout servi : la barrière (état observable). */
const calme = async () => { const { barriere } = await import('./lib/barriere.mjs'); await barriere({ bdd }); };

const CLIENT = 'heritage.resp@exemple.test';
const TESTEUR = 'heritage.testeur@essai.test';
const MUET = 'heritage.muet@exemple.test';
const ADMIN = 'heritage.admin@exemple.test';

const [, , mode, ...args] = process.argv;

/* ---- Poser l'état d'avant ---------------------------------------------- */
async function poser(fichier) {
  const releve = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const revivre = (v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? (v.__ts ? Timestamp.fromDate(new Date(v.__ts)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revivre(x)])))
    : Array.isArray(v) ? v.map(revivre) : v);
  const { verrouSemis, barriere } = await import('./lib/barriere.mjs');
  await declencheurs(false);
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
    await verrouSemis(bdd, true);
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
    for (const c of releve.comptes) await auth.createUser({ uid: c.uid, email: c.email, emailVerified: true, disabled: c.disabled });
    const entrees = Object.entries(releve.docs);
    for (let i = 0; i < entrees.length; i += 400) {
      const lot = bdd.batch();
      for (const [chemin, d] of entrees.slice(i, i + 400)) lot.set(bdd.doc(chemin), revivre(d));
      await lot.commit();
    }
    /* Le client d'avant : membre d'un projet ouvert de sa société, propriétaire
       de la société ; un second projet de la même société où il n'est PAS. */
    const client = await auth.createUser({ email: CLIENT, emailVerified: true, displayName: 'Hélène Héritage' });
    const admin = await auth.createUser({ email: ADMIN, emailVerified: true, displayName: 'Admin du banc' });
    const testeur = await auth.createUser({ email: TESTEUR, emailVerified: true });
    const T = (iso) => Timestamp.fromDate(new Date(iso));
    await bdd.doc(`equipe/${admin.uid}`).set({ nom: 'Admin du banc', email: ADMIN, role: 'admin', actif: true });
    await bdd.doc('organisations/heritage-org').set({ nom: 'Hélène Héritage', entreprise: 'Société Héritage', email: CLIENT, membres: [client.uid], roles: { [client.uid]: 'owner' },
      contacts: [{ nom: 'Hélène Héritage', email: CLIENT, role: 'owner', uid: client.uid }] });
    await bdd.doc('projets/heritage-a').set({ nom: 'Projet héritage A', ref: 'HERA', organisation: 'heritage-org', membres: [client.uid], statut: 'en-cours', compteur: 0, archive: false, cree: T('2026-06-01T09:00:00Z'), client: { nom: 'Hélène', email: CLIENT } });
    await bdd.doc('projets/heritage-b').set({ nom: 'Projet héritage B', ref: 'HERB', organisation: 'heritage-org', membres: [], statut: 'cadrage', compteur: 0, archive: false, cree: T('2026-06-02T09:00:00Z') });
    await bdd.doc('projets/heritage-muet').set({ nom: 'Prospect muet', ref: 'HERM', membres: [], statut: 'prospect', compteur: 0, archive: false, cree: T('2026-06-03T09:00:00Z'), client: { nom: 'Muet', email: MUET } });
    await bdd.doc('projets/heritage-a/jalons/j1').set({ projet: 'heritage-a', titre: 'Ligne du devis', statut: 'a-venir', devis: 'heritage-devis', montant: 800, ordre: 1 });
    await bdd.doc('documents/heritage-devis').set({ projet: 'heritage-a', type: 'devis', numero: 'D-HER-1', libelle: 'Devis héritage', montant: 800, tva: 0, ttc: 800, statut: 'envoye', portee: 'initial', archive: false, date: T('2026-07-01T09:00:00Z') });
    await bdd.doc('documents/heritage-facture').set({ projet: 'heritage-a', type: 'facture', numero: 'F-HER-1', libelle: 'Acompte', montant: 400, tva: 0, ttc: 400, statut: 'a-payer', archive: false, date: T('2026-07-02T09:00:00Z') });
    await bdd.doc('activite/heritage-act').set({ projet: 'heritage-a', type: 'facture', texte: 'a déposé la facture F-HER-1', visibilite: 'client', date: T('2026-07-02T09:00:00Z') });
    await bdd.doc(`testeurs/${testeur.uid}`).set({ prenom: 'Tim', email: TESTEUR, actif: true, projets: ['heritage-a'], plateformes: ['web'] });
    await bdd.doc('projets/heritage-a/campagnes/c1').set({ titre: 'Campagne', statut: 'en-cours', testeurs: [testeur.uid] });
  } finally { await verrouSemis(bdd, false); await declencheurs(false); await declencheurs(true); }
  await barriere({ bdd });
  console.log('État d avant posé.');
}

/* ---- Les sondes --------------------------------------------------------- */
const codeDe = async (email, avant) => {
  for (let i = 0; i < 40; i += 1) {
    const l = (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.map((d) => d.data()).filter((d) => (d.a || []).some((x) => x.email === email));
    if (l.length > avant) return l.sort((a, b) => (b.cree ? b.cree.toMillis() : 0) - (a.cree ? a.cree.toMillis() : 0))[0].variables.code;
    await pause(500);
  }
  return null;
};
const nbCodes = async (email) => (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.filter((d) => (d.data().a || []).some((x) => x.email === email)).length;
const entrer = async (nav, site, email) => {
  for (const c of ['connexions', 'connexionsIp']) for (const d of (await bdd.collection(c).get()).docs) await d.ref.delete();
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 120)));
  const avant = await nbCodes(email);
  await page.goto(`${site}/suivi/?emul`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#forme:not(.masque)', { timeout: 30000 });
  await page.fill('#email', email); await page.click('#envoyer');
  const code = await codeDe(email, avant);
  if (!code) return { page, ctx, erreurs, entre: false };
  await page.waitForSelector('#forme-code:not(.masque)', { timeout: 20000 }).catch(() => {});
  await page.fill('#code', code);
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/, { timeout: 40000 }).catch(() => {});
  await pause(3500);
  return { page, ctx, erreurs, entre: /\/suivi\/(hub|cockpit|testeur)/.test(page.url()) };
};
const dansLaPage = (page, source, arg) => page.evaluate(async ({ source: s, arg: a }) => {
  const n = await import('/suivi/assets/js/noyau.js');
  const d = await import('/suivi/assets/js/donnees.js');
  const serveur = await import('/suivi/assets/js/serveur.js').catch(() => ({}));
  try { return { ok: true, v: await (new Function('n', 'd', 'serveur', 'a', `return (${s})(n, d, serveur, a);`))(n, d, serveur, a) }; }
  catch (e) { return { ok: false, m: String(e.code || e.message || e).slice(0, 120) }; }
}, { source: source.toString(), arg });

async function sonder(etape, site, front) {
  const r = {};
  const nav = await chromium.launch();
  try {
    /* Le client d'avant. */
    const c = await entrer(nav, site, CLIENT);
    r['client entre'] = c.entre;
    if (c.entre) {
      await c.page.evaluate(() => { location.hash = '#/projets/heritage-a'; }); await pause(2500);
      r['client voit son projet'] = /Projet héritage A/.test(await c.page.evaluate(() => document.body.innerText));
      const pieces = await dansLaPage(c.page, async (n) => (await n.getDoc(n.doc(n.bdd, 'documents', 'heritage-devis'))).exists(), {});
      r['client lit son devis'] = pieces.ok && pieces.v === true;
      const ecrit = await dansLaPage(c.page, async (n, d) => { const s = await n.session(); await d.ecrire.messageProjet(s, 'heritage-a', 'Bonjour.'); return true; }, {});
      r['client écrit'] = ecrit.ok ? true : `non (${ecrit.m})`;
      const voisin = await dansLaPage(c.page, async (n) => (await n.getDoc(n.doc(n.bdd, 'projets', 'heritage-b'))).exists(), {});
      r['client lit le projet voisin de sa société (fuite)'] = voisin.ok;
      r['client : erreurs JS'] = c.erreurs.filter((e) => !/session absente/.test(e)).length;
    }
    await c.ctx.close();

    /* L'administrateur. */
    const a = await entrer(nav, site, ADMIN);
    r['admin entre au cockpit'] = a.entre && /cockpit/.test(a.page.url());
    if (a.entre) {
      const cle = (fs.readFileSync(require('node:path').join(__dirname, '..', '.secret.local'), 'utf8').match(/ADMIN_CLE=(.*)/) || [])[1] || '';
      const cree = await dansLaPage(a.page, async (n, d, serveur, x) => {
        /* L'ancien cockpit porte la clé partagée ; le nouveau, le jeton. */
        if (x.front === 'ancien' && serveur.poserCle) serveur.poserCle(x.cle);
        return serveur.appelServeur('creerProjet', { ref: `ORD${Date.now() % 100000}`, nom: 'Projet de la sonde' });
      }, { front, cle: cle.trim() });
      r['admin crée un projet (serveur)'] = cree.ok ? true : `non (${cree.m})`;
      const etape2 = await dansLaPage(a.page, async (n, d, s, x) => {
        /* L'étape telle que l'écran l'écrit : l'ancien formulaire porte toujours « montant ». */
        const champs = x.front === 'ancien' ? { titre: 'Ligne revue', devis: 'heritage-devis', montant: 800 } : { titre: 'Ligne revue', devis: 'heritage-devis' };
        await d.ecrire.majJalon('heritage-a', 'j1', champs); return true;
      }, { front });
      r['admin modifie une étape (écran)'] = etape2.ok ? true : `non (${etape2.m})`;
      r['admin : erreurs JS'] = a.erreurs.filter((e) => !/session absente/.test(e)).length;
    }
    await a.ctx.close();

    /* Le testeur. */
    const t = await entrer(nav, site, TESTEUR);
    if (t.entre) {
      const lit = await dansLaPage(t.page, async (n) => (await n.getDoc(n.doc(n.bdd, 'projets', 'heritage-a'))).exists(), {});
      r['testeur lit le projet (fuite)'] = lit.ok;
    } else r['testeur lit le projet (fuite)'] = false;
    await t.ctx.close();
  } finally { await nav.close(); }

  /* Les envois : un message de l'équipe sur le projet ouvert, et sur le
     prospect qui doit rester muet. */
  await calme();
  const avant = (await bdd.collection('envois').get()).docs.map((d) => d.id);
  const equipe = { uid: 'sonde', nom: 'Équipe', cote: 'equipe' };
  await bdd.collection('projets/heritage-a/messages').add({ de: equipe, texte: `Sonde ${etape}.`, pieces: [], date: FieldValue.serverTimestamp() });
  await bdd.collection('projets/heritage-muet/messages').add({ de: equipe, texte: `Sonde ${etape}.`, pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  const neufs = (await bdd.collection('envois').get()).docs.filter((d) => !avant.includes(d.id)).map((d) => d.data());
  r['client prévenu par e-mail'] = neufs.filter((e) => (e.a || []).some((x) => x.email === CLIENT)).length;
  r['e-mails vers le prospect muet (fuite)'] = neufs.filter((e) => (e.a || []).some((x) => x.email === MUET)).length;

  const ligne = Object.entries(r).map(([k, v]) => `${k}=${v}`).join(' ; ');
  console.log(`ÉTAPE ${etape} [${front}] ${ligne}`);
  fs.appendFileSync(process.env.ORDRE_JOURNAL || '/dev/null', `${JSON.stringify({ etape, front, ...r })}\n`);
}

(async () => {
  if (mode === 'poser') await poser(args[0]);
  else if (mode === 'sonder') await sonder(args[0], args[1], args[2]);
  else { console.error('poser <releve> | sonder <étape> <site> <ancien|nouveau>'); process.exit(2); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
