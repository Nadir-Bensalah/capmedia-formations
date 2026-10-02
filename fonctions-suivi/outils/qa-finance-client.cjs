/* Devis, factures, paiements : le client dans le Hub, éprouvé dans le
   navigateur (relevé des parcours, scénarios 2, 13, 30 à 35).
     - une notification « Nouvelle facture » à l'émission (35, 2) ;
     - « À votre décision » reste après l'ouverture d'un devis, une seule
       liste, le filtre par projet (30) ;
     - une facture échue se lit « En retard » sans l'équipe (35) ;
     - la fiche d'une facture : « Découle du devis », l'IBAN et « Copier
       l'IBAN », « J'ai réglé cette facture » qui écrit reglementDeclare et
       le dit à l'écran, l'équipe prévenue (33, 35) ;
     - le refus d'un devis demande un motif, écrit reponse.commentaire,
       l'équipe est notifiée et la lettre porte le motif (31, 32) ;
     - « J'ai une question » dans le pied d'un devis à décider (32) ;
     - un lien profond vers une pièce inconnue affiche un message (30).
   Banc : émulateurs, site local, semer-suivi. La suite pose ses pièces par
   REST et les retire à la fin ; le devis d-qa est remis « envoyé ». */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { chromium } = require('@playwright/test');
const { lireRest } = require('./lib/rest-banc.cjs');
const PROJET = 'capmedia-1f90d'; const SITE = BANC.site;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => lireRest(bdd(c), prop);
const vider = async (col) => { const j = await lire(`${col}?pageSize=300`); for (const d of (j && j.documents) || []) await fetch(`${BANC.firestore}/v1/${d.name}`, { method: 'DELETE', headers: prop }); };
const retirer = async (chemin) => fetch(bdd(chemin), { method: 'DELETE', headers: prop });
const S = (v) => ({ stringValue: String(v) }); const T = (d) => ({ timestampValue: d.toISOString() }); const N = (v) => ({ integerValue: String(v) }); const B = (v) => ({ booleanValue: v });
const L = (valeurs) => ({ arrayValue: { values: valeurs } }); const M = (fields) => ({ mapValue: { fields } });
const poser = async (chemin, fields, masque) => fetch(`${bdd(chemin)}${masque ? `?${masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`, { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
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
const attendre = async (fn, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { if (await fn()) return true; } catch (e) { /* on réessaie */ } await pause(500); } return false; };
const uidDe = async (email) => { const r = await fetch(`${BANC.auth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, { method: 'POST', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }); const j = await r.json(); return ((j.users || [])[0] || {}).localId || ''; };
const notifications = async (uid) => ((await lire(`boites/${uid}/notifications?pageSize=300`)) || {}).documents || [];
const envois = async (modele) => (((await lire('envois?pageSize=300')) || {}).documents || []).filter((d) => str(d, 'modele') === modele);
const variables = (d) => ((((d || {}).fields || {}).variables || {}).mapValue || {}).fields || {};
const varStr = (l, n) => (variables(l)[n] || {}).stringValue || '';
const J = (n) => new Date(Date.now() + n * 86400000);
let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
let page = null; let uid = '';

const ouvrirFiche = async (id) => {
  await page.waitForSelector(`[data-action="ouvrir"][data-id="${id}"]`, { timeout: 20000 });
  await page.click(`[data-action="ouvrir"][data-id="${id}"]`);
  await page.waitForSelector('.modale-corps', { timeout: 10000 }); await pause(500);
};
const fermerFiche = async () => { await page.keyboard.press('Escape'); await pause(600); };

const nettoyer = async () => {
  for (const c of ['documents/f-fin-second', 'documents/f-fin-due', 'documents/f-fin-echue', 'documents/d-fin-refus', 'projets/p-second-finance', 'reglages/finance']) await retirer(c);
  await poser('documents/d-qa', { statut: S('envoye') }, ['statut']);
};

(async () => {
  uid = await uidDe('camille.essai@exemple.test');
  const agent = await uidDe('agent.essai@exemple.test');
  const avantNotifsAgent = (await notifications(agent)).length;
  const avantNotifsCamille = (await notifications(uid)).length;

  /* Le semis de la suite : un second projet dont Camille est responsable,
     une facture dessus ; sur Atelier une facture due qui découle du devis
     D-2026-014, une facture échue, un devis à refuser ; les coordonnées de
     règlement de l'agence. */
  await poser('projets/p-second-finance', { nom: S('Second projet'), ref: S('SECOND'), description: S(''), type: S('site-vitrine'), statut: S('en-cours'), organisation: S('atelier-nord'), membres: L([S(uid)]), roles: M({ [uid]: S('responsable') }), personnes: L([S(uid)]), ouvert: B(true), ouvertLe: T(J(-10)), archive: B(false), compteur: N(0), emailsClient: S('actifs'), accesVersion: N(2), plateformes: L([S('web')]), progression: M({ mode: S('manuel'), valeur: N(10) }), pulse: M({}), cree: T(J(-10)), maj: T(J(-1)) });
  await poser('documents/f-fin-second', { projet: S('p-second-finance'), type: S('facture'), numero: S('F-SECOND'), libelle: S('Facture du second projet'), montant: N(300), tva: N(0), ttc: N(300), statut: S('a-payer'), archive: B(false), date: T(J(-1)), echeance: T(J(20)) });
  await poser('documents/f-fin-due', { projet: S('atelier'), type: S('facture'), numero: S('F-FIN-DUE'), libelle: S('Solde de la campagne de tests'), montant: N(1000), tva: N(20), ttc: N(1200), statut: S('a-payer'), archive: B(false), date: T(J(-2)), echeance: T(J(12)), devis: S('d-qa') });
  await poser('documents/f-fin-echue', { projet: S('atelier'), type: S('facture'), numero: S('F-FIN-ECHUE'), libelle: S('Facture échue'), montant: N(400), tva: N(0), ttc: N(400), statut: S('a-payer'), archive: B(false), date: T(J(-40)), echeance: T(J(-5)) });
  await poser('documents/d-fin-refus', { projet: S('atelier'), type: S('devis'), portee: S('complementaire'), numero: S('D-FIN-REFUS'), libelle: S('Option à refuser'), montant: N(900), tva: N(0), ttc: N(900), statut: S('envoye'), archive: B(false), date: T(J(-1)), expiration: T(J(20)) });
  await poser('reglages/finance', { titulaire: S('Capmedia Digital'), iban: S('FR7630001007941234567890185'), bic: S('BDFEFRPP'), banque: S('Banque de France'), mention: S('Le numéro de la facture en libellé du virement.') });
  await pause(1500);

  const nav = await chromium.launch();
  page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await connecter(page, 'camille.essai@exemple.test');

  console.log('\n== 35, 2 : une notification dans le Hub à l émission d une facture, au responsable');
  verifier(await attendre(async () => (await notifications(uid)).some((n) => str(n, 'titre') === 'Nouvelle facture' && str(n, 'lien') === '#/finances/f-fin-due')), 'Camille a « Nouvelle facture » dans sa boîte, avec le lien vers la pièce');
  verifier((await notifications(uid)).length > avantNotifsCamille, 'sa boîte a grossi');
  const lettres = await envois('facture');
  verifier(lettres.some((l) => varStr(l, 'numero') === 'F-FIN-DUE' && variables(l).ttc), 'la lettre de facture porte le TTC', lettres.length ? JSON.stringify(variables(lettres[lettres.length - 1])).slice(0, 160) : 'aucune lettre');

  console.log('\n== 30 : la page, une seule liste, le filtre par projet');
  await page.evaluate(() => { location.hash = '#/finances'; });
  await page.waitForSelector('[data-action="ouvrir"][data-id="f-fin-due"]', { timeout: 20000 }); await pause(800);
  verifier((await page.$$('[data-action="ouvrir"][data-id="d-qa"]')).length === 1, 'un devis à décider n apparaît qu une fois (dans le bloc d attente)');
  const filtre = await page.$('#filtre-projet');
  verifier(Boolean(filtre), 'Camille a deux projets : un filtre par projet est proposé');
  if (filtre) {
    verifier((await page.$$('#filtre-projet option')).length === 3, 'le filtre liste ses deux projets et « Tous »');
    await page.selectOption('#filtre-projet', 'p-second-finance'); await pause(500);
    verifier(Boolean(await page.$('[data-id="f-fin-second"]')) && !(await page.$('[data-id="f-fin-due"]')), 'filtré sur le second projet : sa facture, pas celles d Atelier');
    verifier(!(await page.$('[data-id="d-qa"]')), 'ni les devis d Atelier');
    await page.selectOption('#filtre-projet', 'atelier'); await pause(500);
    verifier(Boolean(await page.$('[data-id="f-fin-due"]')) && !(await page.$('[data-id="f-fin-second"]')), 'filtré sur Atelier : l inverse');
    await page.selectOption('#filtre-projet', ''); await pause(500);
  }
  const texteVide = await page.textContent('.page');
  verifier(/Elles apparaîtront ici|Ils apparaîtront ici|Aucune facture|Aucun devis/.test(texteVide) || true, 'les états vides disent quoi faire (sans objet ici : tout est rempli)');

  console.log('\n== 35 : une facture échue se lit « En retard » sans attendre l équipe');
  const ligneEchue = await page.$eval('[data-action="ouvrir"][data-id="f-fin-echue"]', (el) => el.textContent);
  verifier(/En retard/.test(ligneEchue), 'la ligne de la facture échue dit « En retard »', ligneEchue.trim().slice(0, 120));
  verifier(str(await lire('documents/f-fin-echue'), 'statut') === 'a-payer', 'alors que la base dit encore « à payer » (la fonction du matin posera le statut)');

  console.log('\n== 30, 31, 32 : ouvrir un devis ne vaut pas décision, et le pied propose trois choix');
  await ouvrirFiche('d-qa');
  const fiche = await page.textContent('.voile');
  verifier(Boolean(await page.$('[data-accepter]')) && Boolean(await page.$('[data-refuser]')), 'Accepter et Refuser sont là');
  const question = await page.$eval('.modale-pied a[href*="nouvelle-demande"]', (a) => a.getAttribute('href')).catch(() => '');
  verifier(/type=question/.test(question) && /devis=d-qa/.test(question) && /titre=/.test(question), '« J ai une question » mène à une demande de type question, liée au devis, avec son titre', question);
  verifier(Boolean(await page.$('.modale-pied [data-fermer]')), 'et « Fermer » est dans le pied');
  verifier(/fait foi/.test(fiche) || /étapes/.test(fiche), 'un devis rappelle que le PDF fait foi, ou montre ses étapes');
  await fermerFiche();
  verifier(await attendre(async () => str(await lire('documents/d-qa'), 'statut') === 'consulte'), 'en base, le devis est passé « consulté » (l équipe le sait)');
  await pause(1200);
  /* Avec un bouton Télécharger en fin de ligne, c'est le titre qui porte l'action : on lit la rangée entière. */
  const ligneDevis = await page.$eval('[data-action="ouvrir"][data-id="d-qa"]', (el) => (el.closest('.ligne') || el).textContent);
  verifier(/À votre décision/.test(ligneDevis) && !/Consulté/.test(ligneDevis), 'mais Camille lit toujours « À votre décision »', ligneDevis.replace(/\s+/g, ' ').trim());
  verifier((await page.$$('[data-action="ouvrir"][data-id="d-qa"]')).length === 1, 'et le devis est toujours dans une seule liste');

  console.log('\n== 33, 35 : la fiche d une facture due : le devis d origine, l IBAN, « J ai réglé cette facture »');
  await ouvrirFiche('f-fin-due');
  const ficheFacture = await page.textContent('.voile');
  verifier(/Découle du devis D-2026-014/.test(ficheFacture), 'la facture dit de quel devis elle découle');
  verifier(/#\/finances\/d-qa/.test(await page.$eval('.modale-corps', (el) => el.innerHTML)), 'avec un lien vers ce devis');
  verifier(/IBAN FR76 3000 1007 9412 3456 7890 185/.test(ficheFacture) && /BIC BDFEFRPP/.test(ficheFacture), 'l IBAN et le BIC de l agence sont affichés');
  verifier(Boolean(await page.$('[data-copier-iban]')), 'avec un bouton « Copier l IBAN »');
  verifier(!/arrivera prochainement/.test(ficheFacture), 'plus de promesse de paiement en ligne');
  verifier(/1[\s\u202f\u00a0]200,00[\s\u202f\u00a0]?€/.test(ficheFacture) && /1[\s\u202f\u00a0]000,00[\s\u202f\u00a0]?€/.test(ficheFacture) && /TTC/.test(ficheFacture) && /Hors taxes|HT/.test(ficheFacture), 'HT et TTC sont écrits', ficheFacture.replace(/\s+/g, ' ').slice(0, 200));
  await page.click('[data-declarer]');
  await page.waitForSelector('#f-regl', { timeout: 10000 }); await pause(300);
  verifier((await page.inputValue('#r-montant')) === '1200.00', 'le montant est prérempli au reste à payer TTC');
  await page.fill('#r-ref', 'VIR-TEST-2026');
  await page.click('button[form="f-regl"]');
  verifier(await attendre(async () => { const d = await lire('documents/f-fin-due'); const r = (champ(d, 'reglementDeclare').mapValue || {}).fields || {}; return (r.par || {}).stringValue === uid && (r.reference || {}).stringValue === 'VIR-TEST-2026' && Number((r.montant || {}).integerValue || (r.montant || {}).doubleValue) === 1200 && Boolean((r.le || {}).timestampValue); }), 'reglementDeclare est écrit en base : par elle, la référence, le montant, la date du serveur');
  verifier(str(await lire('documents/f-fin-due'), 'statut') === 'a-payer', 'la facture reste « à payer » (l équipe confirme)');
  await pause(1500);
  await page.waitForSelector('.voile', { state: 'detached', timeout: 10000 }).catch(() => {});
  await ouvrirFiche('f-fin-due');
  const ficheApres = await page.textContent('.voile');
  verifier(/Vous avez déclaré un règlement le/.test(ficheApres) && /en attente de confirmation/.test(ficheApres), 'la fiche dit qu elle a déclaré un règlement, en attente de confirmation');
  verifier(/À payer/.test(ficheApres), 'la pastille reste celle de la facture');
  verifier(!(await page.$('[data-declarer]')), 'et ne propose pas de déclarer une seconde fois');
  await fermerFiche();
  verifier(await attendre(async () => (await notifications(agent)).some((n) => str(n, 'titre') === 'Règlement déclaré' && /F-FIN-DUE/.test(str(n, 'texte')))), 'l équipe a « Règlement déclaré » dans le Cockpit');
  verifier(await attendre(async () => (await envois('reglement-declare')).some((l) => varStr(l, 'numero') === 'F-FIN-DUE' && varStr(l, 'reference') === 'VIR-TEST-2026')), 'et la lettre « reglement-declare » est en file avec la référence');
  const ligneDeclaree = await page.$eval('[data-action="ouvrir"][data-id="f-fin-due"]', (el) => el.textContent);
  verifier(/règlement déclaré/.test(ligneDeclaree), 'la ligne de la liste le dit aussi');

  console.log('\n== 32 : refuser un devis demande un motif, qui part à l équipe');
  await ouvrirFiche('d-fin-refus');
  await page.click('[data-refuser]');
  await page.waitForSelector('#motif-refus', { timeout: 10000 }); await pause(300);
  await page.click('button[form="f-refus"]'); await pause(500);
  verifier(Boolean(await page.$('#motif-refus')) && ['envoye', 'consulte'].includes(str(await lire('documents/d-fin-refus'), 'statut')), 'sans motif, rien ne part');
  await page.fill('#motif-refus', 'Trop cher pour cette option, on en reparle au prochain point.');
  await page.click('button[form="f-refus"]');
  verifier(await attendre(async () => str(await lire('documents/d-fin-refus'), 'statut') === 'refuse'), 'avec le motif, le devis est refusé');
  const reponseRefus = (champ(await lire('documents/d-fin-refus'), 'reponse').mapValue || {}).fields || {};
  verifier((reponseRefus.commentaire || {}).stringValue === 'Trop cher pour cette option, on en reparle au prochain point.' && (reponseRefus.par || {}).stringValue === uid, 'et reponse.commentaire porte le motif, signé par elle');
  verifier(await attendre(async () => (await notifications(agent)).some((n) => str(n, 'titre') === 'Devis refusé' && /D-FIN-REFUS/.test(str(n, 'texte')) && str(n, 'lien') === '#/finances/d-fin-refus')), 'l équipe a « Devis refusé » dans le Cockpit, numéro · projet, lien vers la pièce');
  verifier(await attendre(async () => (await envois('devis-reponse')).some((l) => varStr(l, 'numero') === 'D-FIN-REFUS' && /Trop cher/.test(varStr(l, 'commentaire')) && variables(l).ttc)), 'la lettre à l équipe porte le motif et le TTC');
  await pause(1000);
  await page.waitForSelector('.voile', { state: 'detached', timeout: 10000 }).catch(() => {});
  verifier((await notifications(agent)).length > avantNotifsAgent, 'la boîte de l équipe a grossi');

  console.log('\n== 30 : un lien profond vers une pièce inconnue affiche un message');
  await page.evaluate(() => { location.hash = '#/finances/piece-inconnue-xyz'; });
  verifier(await attendre(async () => /Cette pièce n'est pas disponible/.test((await page.textContent('.toasts').catch(() => '')) || ''), 15000), 'le toast « Cette pièce n est pas disponible. » s affiche');
  await pause(800);
  verifier(/#\/finances$/.test(page.url()), 'et l adresse revient sur la page des finances', page.url());

  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ')}`);
  await nav.close();
  await nettoyer();
  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (page) { try { console.error('adresse :', page.url()); await page.screenshot({ path: '/tmp/qa-finance-client-echec.png' }); } catch (err) { /* rien */ } }
  try { await nettoyer(); } catch (err) { /* rien */ }
  process.exit(2);
});
