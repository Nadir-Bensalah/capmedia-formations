/* ==========================================================================
   CAPMEDIA CLIENT HUB · le regroupement des lettres, sur le banc

   Le besoin (06/10/2026) : ouvrir sept demandes d'un coup envoyait sept
   e-mails au client, puis sept autres au premier changement de statut. Les
   lettres de la vie des demandes attendent désormais dans
   « envoisEnAttente » ; la fonction planifiée (hubRegroupementEnvois) les
   relit quand le calme est revenu.

   La fonction planifiée ne bat pas sur l'émulateur : cette suite appelle
   son cœur (regroupement.viderLaFile) sur la base du banc, en avançant
   l'horloge. Les lettres qu'il écrit dans « envois » sont servies par le
   vrai facteur de l'émulateur, qui les marque « simule » : aucun e-mail ne
   part jamais (verrou de suiviFacteur, vérifié ici).

   Ce que prouve cette suite :
   - sept demandes créées en rafale par l'équipe : rien ne part tout de
     suite ; dix minutes de calme plus tard, UNE lettre par personne, sept
     lignes, et deux d'entre elles disent leur état final ;
   - la fenêtre : rien ne part avant dix minutes de calme ;
   - une seule demande : la lettre d'aujourd'hui, inchangée ;
   - un code de connexion, une invitation, une facture : tout de suite,
     sans attente ;
   - un client dont l'accès est retiré pendant l'attente ne reçoit rien,
     et l'écart est tracé ; une préférence éteinte pendant l'attente aussi ;
   - deux passages simultanés : une seule lettre ;
   - la file d'attente est fermée à tout navigateur.

   Banc : émulateurs (Functions compris), semer-suivi.
   ========================================================================== */
require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { initializeApp, getApps } = require('firebase-admin/app');
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
if (!getApps().length) initializeApp({ projectId: PROJET });
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const bdd = getFirestore();
const { appelAdmin, uidDe, jetonPour } = require('./lib/session-banc.cjs');
const regroupement = require('../regroupement.js');
const courriels = require('../courriels.js');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 300)}` : ''}`); } };
const attendre = async (fn, ms = 40000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await pause(400); } return null; };

const RESP = 'regr.resp@exemple.test';
const COLLAB = 'regr.collab@exemple.test';
const MIN = 60 * 1000;
const PLUS_TARD = (min) => Date.now() + min * MIN;

const enAttente = async (pid) => (await bdd.collection('envoisEnAttente').where('projet', '==', pid).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const envois = async () => (await bdd.collection('envois').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const vers = (liste, email) => liste.filter((e) => (e.a || []).some((x) => x.email === email));
const nouveaux = async (avant) => { const ids = new Set(avant.map((e) => e.id)); return (await envois()).filter((e) => !ids.has(e.id)); };
/* Que les déclencheurs aient tout servi : un nombre stable trois fois. */
const stable = async (fn, voulu, ms = 60000) => {
  const fin = Date.now() + ms; let avant = null; let pareil = 0;
  while (Date.now() < fin) {
    const n = await fn();
    if (n === avant) pareil += 1; else pareil = 0;
    avant = n;
    if (pareil >= 3 && (voulu === undefined || n >= voulu)) return n;
    await pause(700);
  }
  return avant;
};
const creerDemande = (pid, titre) => appelAdmin('creerDemande', { projet: pid, titre, description: `Ouverte par l équipe : ${titre}.`, typeDemande: 'bug' });

(async () => {
  console.log('\n== Le projet du banc : deux interlocuteurs');
  const p = await appelAdmin('creerProjet', { ref: 'REGR', nom: 'Projet Regroupement', client: { nom: 'Rose Martin', email: RESP, entreprise: 'Société R' },
    interlocuteurs: [{ email: RESP, nom: 'Rose Martin', role: 'responsable' }, { email: COLLAB, nom: 'Colin Petit', role: 'collaborateur' }] });
  const pid = p.json && p.json.id;
  verifier(Boolean(pid), 'le projet est créé', p.texte);
  const ouv = await appelAdmin('ouvrirAuClient', { id: pid });
  verifier(ouv.code === 200, 'il s ouvre au client', ouv.texte);
  const ouverture = await attendre(async () => { const l = await envois(); return vers(l, RESP).some((e) => e.modele === 'ouverture') && vers(l, COLLAB).some((e) => e.modele === 'ouverture') ? l : null; });
  verifier(Boolean(ouverture), 'la lettre d ouverture part tout de suite, sans attente (exclue du regroupement)');
  verifier((await enAttente(pid)).length === 0, 'rien n attend après l ouverture');

  console.log('\n== Sept demandes en rafale, créées par l équipe');
  const avantRafale = await envois();
  const titres = Array.from({ length: 7 }, (_, i) => `Rafale ${i + 1} : écran ${['Accueil', 'Profil', 'Tâches', 'Agenda', 'Réglages', 'Paiement', 'Connexion'][i]}`);
  const creees = await Promise.all(titres.map((t) => creerDemande(pid, t)));
  const ids = creees.map((c) => c.json && c.json.id).filter(Boolean);
  verifier(ids.length === 7, 'sept demandes créées en même temps', creees.map((c) => c.code).join(','));
  const nAttente = await stable(async () => (await enAttente(pid)).length, 14);
  verifier(nAttente === 14, 'quatorze lettres en attente : sept pour chacun des deux interlocuteurs', String(nAttente));
  /* Deux demandes changent de statut pendant l'attente. */
  await bdd.doc(`tickets/${ids[0]}`).update({ statut: 'en-cours', maj: FieldValue.serverTimestamp() });
  await bdd.doc(`tickets/${ids[1]}`).update({ statut: 'en-attente-client', maj: FieldValue.serverTimestamp() });
  const nAttente2 = await stable(async () => (await enAttente(pid)).length, 18);
  verifier(nAttente2 === 18, 'leurs deux changements de statut attendent aussi (quatre lettres de plus)', String(nAttente2));
  const pendant = (await nouveaux(avantRafale)).filter((e) => ['ticket-cree', 'statut'].includes(e.modele) && (vers([e], RESP).length || vers([e], COLLAB).length));
  verifier(pendant.length === 0, 'aucune lettre client n est partie tout de suite', pendant.map((e) => e.modele).join(','));
  const attenteRose = (await enAttente(pid)).filter((e) => e.email === RESP);
  verifier(attenteRose.every((e) => e.depose && e.depose.toMillis && e.moment && e.moment.toMillis && e.cle && e.objet), 'chaque attente porte sa date de dépôt, son moment, sa file et sa demande (pas de marque vidée)', JSON.stringify(attenteRose[0] || {}).slice(0, 240));
  verifier((await nouveaux(avantRafale)).filter((e) => e.modele === 'ticket-cree' && (e.variables || {}).cote === 'equipe').length === 0, 'et l équipe ne s alerte pas de ses propres demandes (règle inchangée)');

  console.log('\n== La fenêtre : rien avant dix minutes de calme');
  const tot = await regroupement.viderLaFile({ maintenant: PLUS_TARD(5) });
  verifier(tot.envoyees === 0 && (await enAttente(pid)).length === 18, 'cinq minutes après : la file attend', JSON.stringify(tot));

  console.log('\n== Dix minutes plus tard : une lettre par personne');
  const avantVidage = await envois();
  const bilan = await regroupement.viderLaFile({ maintenant: PLUS_TARD(11) });
  verifier(bilan.envoyees >= 2 && bilan.erreurs === 0, 'les deux files partent', JSON.stringify(bilan));
  const sorties = await nouveaux(avantVidage);
  const aRose = vers(sorties, RESP); const aColin = vers(sorties, COLLAB);
  verifier(aRose.length === 1 && aColin.length === 1, 'exactement une lettre pour Rose, une pour Colin', `${aRose.length} ${aColin.length}`);
  const lr = aRose[0] || {};
  verifier(lr.modele === 'recapitulatif' && lr.evenement === 'recapitulatif' && lr.projet === pid && (lr.a || []).length === 1, 'un récapitulatif, au seul destinataire, rattaché au projet', `${lr.modele} ${lr.projet}`);
  const vr = lr.variables || {};
  verifier((vr.lignes || []).length === 7 && vr.total === 7 && vr.nouvelles === 7, 'sept lignes, une par demande', JSON.stringify(vr).slice(0, 200));
  verifier((lr.regroupe || []).length === 9 && (lr.regroupe || []).every((x) => x.attente && x.modele && x.depose), 'il garde la trace des neuf événements réunis', String((lr.regroupe || []).length));
  verifier(lr.attente && lr.attente.nombre === 9 && lr.attente.premier && lr.attente.dernier, 'et de l attente (premier, dernier, nombre)', JSON.stringify(lr.attente || {}).slice(0, 120));
  const rendu = courriels.rendre(lr.modele || 'recapitulatif', vr);
  verifier(rendu.objet === 'Projet Regroupement : 7 nouvelles demandes', 'objet : « Projet Regroupement : 7 nouvelles demandes »', rendu.objet);
  verifier(/^Bonjour Rose,$/m.test(rendu.texte) && /^Bonjour Colin,$/m.test(courriels.rendre('recapitulatif', (aColin[0] || {}).variables || {}).texte), 'chacun est salué par son prénom');
  const ligne0 = (vr.lignes || []).find((l) => l.titre === titres[0]) || {};
  const ligne1 = (vr.lignes || []).find((l) => l.titre === titres[1]) || {};
  verifier(courriels.quoiDeLaLigne(ligne0) === 'Nouvelle demande ouverte pour vous, en cours', 'créée puis passée en cours : une ligne, son état final', courriels.quoiDeLaLigne(ligne0));
  verifier(courriels.quoiDeLaLigne(ligne1) === 'Nouvelle demande ouverte pour vous, attend votre réponse', 'créée puis en attente du client : une ligne', courriels.quoiDeLaLigne(ligne1));
  verifier(ids.every((id) => rendu.texte.includes(`https://capmedia.app/suivi/ticket?t=${id}`)), 'chaque ligne mène à sa demande');
  verifier(/^REGR-\d{3} · Rafale/m.test(rendu.texte), 'chaque ligne porte le numéro de la demande');
  verifier(!/[—–]|null|undefined/.test(`${rendu.objet}${rendu.texte}${rendu.html}`), 'ni tiret cadratin, ni « null », ni « undefined »');
  verifier((await enAttente(pid)).length === 0, 'la file est vide');
  const facteur = await attendre(async () => { const d = await Promise.all([lr.id, (aColin[0] || {}).id].map((i) => bdd.doc(`envois/${i}`).get())); return d.every((x) => x.exists && x.data().etat === 'simule') ? d : null; });
  verifier(Boolean(facteur), 'le facteur les sert comme les autres : « simule » sur le banc, aucun e-mail réel');
  verifier(Boolean(facteur) && facteur.every((x) => !x.data().brevo && x.data().envoye), 'sans passage par Brevo, datées par le serveur');
  const encore = await regroupement.viderLaFile({ maintenant: PLUS_TARD(30) });
  const auxDeux = (await nouveaux(avantVidage)).filter((e) => vers([e], RESP).length || vers([e], COLLAB).length);
  verifier(auxDeux.length === 2, 'un passage de plus ne leur renvoie rien', `${auxDeux.map((e) => e.modele).join(',')} ${JSON.stringify(encore)}`);

  console.log('\n== Une seule demande : la lettre d aujourd hui, inchangée');
  const seule = await creerDemande(pid, 'Une seule demande, seule dans sa file');
  const sid = seule.json && seule.json.id;
  await stable(async () => (await enAttente(pid)).length, 2);
  const attente1 = (await enAttente(pid)).find((e) => e.email === RESP) || {};
  verifier(attente1.modele === 'ticket-cree' && (attente1.variables || {}).par === 'Rose Martin' && (attente1.variables || {}).cote === 'client', 'elle attend, avec les variables de la lettre d aujourd hui (une par personne, à son nom)', JSON.stringify(attente1.variables || {}).slice(0, 200));
  const avant1 = await envois();
  await regroupement.viderLaFile({ maintenant: PLUS_TARD(11) });
  const s1 = vers(await nouveaux(avant1), RESP);
  const e1 = s1[0] || {};
  verifier(s1.length === 1 && e1.modele === 'ticket-cree' && e1.evenement === 'ticket-cree', 'une lettre « ticket-cree », pas un récapitulatif', `${s1.length} ${e1.modele}`);
  verifier(JSON.stringify(e1.variables) === JSON.stringify(attente1.variables), 'mêmes variables, à l identique');
  const r1 = courriels.rendre(e1.modele || 'x', e1.variables || {});
  verifier(/^REGR-\d{3} · Une demande a été ouverte pour vous$/.test(r1.objet) && /^Bonjour Rose Martin,$/m.test(r1.texte), 'donc le même objet et la même salutation qu hier', r1.objet);
  verifier((e1.regroupe || []).length === 1 && e1.regroupe[0].objet === sid, 'la trace dit d où elle vient');

  console.log('\n== Ce qui part tout de suite');
  const avantImm = await envois();
  const code = await fetch(`${BANC.fonctions}/${PROJET}/europe-west1/suiviConnexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'demanderCode', email: RESP }) });
  verifier(code.status === 200, 'Rose demande un code de connexion', String(code.status));
  verifier(Boolean(await attendre(async () => vers(await nouveaux(avantImm), RESP).find((e) => e.modele === 'code'), 15000)), 'le code part aussitôt, sans attendre');
  const renvoi = await appelAdmin('renvoyerInvitation', { projet: pid, email: COLLAB });
  verifier(renvoi.code === 200 && Boolean(await attendre(async () => vers(await nouveaux(avantImm), COLLAB).find((e) => e.modele === 'invitation'), 15000)), 'une invitation renvoyée part aussitôt', renvoi.texte);
  const fac = await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-REGR-1', libelle: 'Acompte', montant: 300 });
  verifier(fac.code === 200 && Boolean(await attendre(async () => vers(await nouveaux(avantImm), RESP).find((e) => e.modele === 'facture'), 20000)), 'une facture part aussitôt au responsable', fac.texte);
  verifier((await enAttente(pid)).length === 0, 'et rien de tout cela n attend');

  console.log('\n== Un accès retiré pendant l attente : rien ne part');
  await creerDemande(pid, 'Avant le retrait de Colin');
  await stable(async () => (await enAttente(pid)).length, 2);
  verifier((await enAttente(pid)).some((e) => e.email === COLLAB), 'la lettre de Colin attend');
  const retrait = await appelAdmin('retirerInterlocuteur', { projet: pid, email: COLLAB });
  verifier(retrait.code === 200, 'son accès est retiré pendant l attente', retrait.texte);
  const avantRet = await envois();
  await regroupement.viderLaFile({ maintenant: PLUS_TARD(11) });
  const apresRet = await nouveaux(avantRet);
  verifier(vers(apresRet, COLLAB).length === 0, 'Colin ne reçoit rien');
  verifier(vers(apresRet, RESP).length === 1, 'Rose, si');
  const tracesRet = (await bdd.collection('audit').where('action', '==', 'envoi.ecarte').get()).docs.map((d) => d.data()).filter((a) => a.email === COLLAB);
  verifier(tracesRet.length === 1 && tracesRet[0].motif === 'accès retiré' && tracesRet[0].modele === 'ticket-cree' && tracesRet[0].projet === pid, 'l écart est tracé dans l audit, avec son motif', JSON.stringify(tracesRet).slice(0, 240));
  verifier((await enAttente(pid)).length === 0, 'et sa lettre ne traîne pas dans la file');

  console.log('\n== Une préférence éteinte pendant l attente');
  const uidRose = await uidDe(RESP);
  await creerDemande(pid, 'Avant la préférence éteinte');
  await stable(async () => (await enAttente(pid)).length, 1);
  await bdd.doc(`profils/${uidRose}`).set({ notifications: { demandes: 'off' } }, { merge: true });
  const avantPref = await envois();
  await regroupement.viderLaFile({ maintenant: PLUS_TARD(11) });
  verifier(vers(await nouveaux(avantPref), RESP).length === 0, 'les demandes éteintes dans ses préférences : rien ne part');
  verifier((await bdd.collection('audit').where('action', '==', 'envoi.ecarte').get()).docs.some((d) => d.data().email === RESP && d.data().motif === 'désactivé dans ses préférences'), 'et l écart est tracé');
  await bdd.doc(`profils/${uidRose}`).set({ notifications: { demandes: 'on' } }, { merge: true });

  console.log('\n== Deux passages simultanés : une seule lettre');
  for (const t of ['Double A', 'Double B', 'Double C']) await creerDemande(pid, t);
  await stable(async () => (await enAttente(pid)).length, 3);
  const avantDouble = await envois();
  const [b1, b2, b3] = await Promise.all([1, 2, 3].map(() => regroupement.viderLaFile({ maintenant: PLUS_TARD(11) })));
  const double = vers(await nouveaux(avantDouble), RESP);
  verifier(double.length === 1 && double[0].modele === 'recapitulatif' && ((double[0].variables || {}).lignes || []).length === 3, 'trois passages en même temps : une lettre, trois lignes', `${double.length} ${JSON.stringify([b1, b2, b3])}`);
  verifier((await enAttente(pid)).length === 0, 'la file est vide');

  console.log('\n== La file est fermée au navigateur');
  const jeton = await jetonPour('agent.essai@exemple.test');
  await bdd.doc('envoisEnAttente/sonde-banc').set({ cle: 'x', projet: 'aucun', email: 'x@exemple.test', depose: new Date() });
  const lire = await fetch(`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/envoisEnAttente/sonde-banc`, { headers: { Authorization: `Bearer ${jeton}` } });
  const ecrire = await fetch(`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/envoisEnAttente?documentId=pirate`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { cle: { stringValue: 'x' } } }) });
  verifier(lire.status === 403 && ecrire.status === 403, 'même l administrateur ne la lit ni ne l écrit depuis le navigateur', `${lire.status} ${ecrire.status}`);
  await bdd.doc('envoisEnAttente/sonde-banc').delete();

  console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
