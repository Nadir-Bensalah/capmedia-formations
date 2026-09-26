/* ==========================================================================
   CAPMEDIA CLIENT HUB · qui reçoit quoi, compté (préflight Gate 2)

   Aucun vrai e-mail : on compte la file « envois » du banc (le facteur n'y
   est pas branché) et les boîtes de notifications.

   1. Un projet FERMÉ, préparé entièrement (interlocuteurs, demande,
      fichier, validation, devis, facture, étape, message, activité) :
      zéro e-mail client, zéro notification client.
   2. L'OUVERTURE : exactement une lettre par personne, et rien de la
      préparation n'est rejoué, un par un.
   3. La COUPURE des e-mails : de nouvelles activités, le Hub vit (les
      notifications arrivent, les données restent), zéro e-mail externe.
   4. Les destinataires impossibles, un par un : retiré, membre d'équipe
      inactif, mauvais projet, collaborateur pour un événement réservé au
      responsable, projet refermé, projet muté, testeur non concerné.

     (émulateurs avec les fonctions, semis du banc)
     node fonctions-suivi/outils/envois-gate2.test.mjs
   ========================================================================== */

import { barriere } from './lib/barriere.mjs';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { appelAdmin, uidDe } = require('./lib/session-banc.cjs');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 240)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const compteurs = async () => {
  const [e, a, n] = await Promise.all([bdd.collection('envois').count().get(), bdd.collection('activite').count().get(), bdd.collectionGroup('notifications').count().get()]);
  return `${e.data().count}/${a.data().count}/${n.data().count}`;
};
/* Attendre que les déclencheurs aient TOUT servi : une barrière (état
   observable), pas une durée au jugé (voir lib/barriere.mjs). */
const calme = () => barriere({ bdd });
const envois = async () => (await bdd.collection('envois').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const vers = (liste, email) => liste.filter((e) => (e.a || []).some((x) => x.email === email));
const nouveaux = async (avant) => { const ids = new Set(avant.map((e) => e.id)); return (await envois()).filter((e) => !ids.has(e.id)); };
const notifs = async (uid) => (uid ? (await bdd.collection(`boites/${uid}/notifications`).get()).size : 0);
const modeles = (l) => l.map((e) => e.modele).sort().join(',');

const RESP = 'env.resp@exemple.test';
const COLLAB = 'env.collab@exemple.test';
const AUTRE = 'env.autre@exemple.test';
const AGENT = 'env.agent@exemple.test';
const TESTEUR = 'env.testeur@essai.test';
const CLIENTS = [RESP, COLLAB];

/* Un second projet, ouvert, avec son propre client : le « mauvais projet ». */
const q = await appelAdmin('creerProjet', { ref: 'ENVQ', nom: 'Projet voisin', client: { nom: 'Autre', email: AUTRE, entreprise: 'Société Q' }, interlocuteurs: [{ email: AUTRE, nom: 'Autre', role: 'responsable' }] });
const qid = q.json.id;
await appelAdmin('ouvrirAuClient', { id: qid });

/* ------------------------------------------------------------------------ */
console.log('\n== 1 · Un projet fermé, préparé entièrement');
const p = await appelAdmin('creerProjet', { ref: 'ENVP', nom: 'Projet envois', client: { nom: 'Rose', email: RESP, entreprise: 'Société P' },
  interlocuteurs: [{ email: RESP, nom: 'Rose', role: 'responsable' }, { email: COLLAB, nom: 'Colin', role: 'collaborateur' }] });
const pid = p.json.id;
await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Agnès', role: 'agent', projets: [pid] });
await appelAdmin('inscrireTesteur', { email: TESTEUR, prenom: 'Tom', plateformes: ['web'], projets: [pid] });
await calme();
const avantPrep = await envois();
const uidAdmin = await uidDe('agent.essai@exemple.test');
const equipe = { uid: uidAdmin, nom: 'Alex', cote: 'equipe' };
const t1 = await appelAdmin('creerDemande', { projet: pid, titre: 'Préparer le cahier', description: 'x', type: 'demande' });
const tid = t1.json && (t1.json.id || t1.json.ticket);
await bdd.collection('fichiers').add({ projet: pid, nom: 'maquette.png', chemin: `projets/${pid}/fichiers/x/maquette.png`, visibilite: 'client', categorie: 'design', archive: false, par: equipe, cree: FieldValue.serverTimestamp() });
await bdd.collection('validations').add({ projet: pid, titre: 'Valider la maquette', statut: 'en-attente', reponse: null, reserveeResponsable: false, par: equipe, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
await appelAdmin('deposerDocument', { projet: pid, type: 'devis', numero: 'D-ENV-1', libelle: 'Devis', montant: 1000 });
await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-ENV-1', libelle: 'Acompte', montant: 300 });
await bdd.collection(`projets/${pid}/jalons`).add({ projet: pid, titre: 'Cadrage', statut: 'en-cours', ordre: 1, cree: FieldValue.serverTimestamp() });
await bdd.collection(`projets/${pid}/messages`).add({ de: equipe, texte: 'Nous préparons votre espace.', pieces: [], date: FieldValue.serverTimestamp() });
if (tid) await bdd.collection(`tickets/${tid}/messages`).add({ de: equipe, texte: 'Premier point', pieces: [], interne: false, date: FieldValue.serverTimestamp() });
await calme();
const prep = await nouveaux(avantPrep);
const prepClients = prep.filter((e) => CLIENTS.some((c) => (e.a || []).some((x) => x.email === c)));
verifier(prepClients.length === 0, `préparation complète : ZÉRO e-mail client (${prepClients.length} : ${modeles(prepClients)})`);
const [uR, uC] = [await uidDe(RESP), await uidDe(COLLAB)];
verifier((await notifs(uR)) + (await notifs(uC)) === 0, 'et zéro notification client');
const activites = (await bdd.collection('activite').where('projet', '==', pid).get()).size;
verifier(activites > 0, `l activité, elle, s écrit en interne (${activites} lignes) : le projet vit`);

/* ------------------------------------------------------------------------ */
console.log('\n== 2 · L ouverture, comptée');
const avantOuv = await envois();
const ouv = await appelAdmin('ouvrirAuClient', { id: pid });
verifier(ouv.code === 200, 'le projet s ouvre', ouv.texte);
await calme();
const ouverture = await nouveaux(avantOuv);
const aClients = ouverture.filter((e) => CLIENTS.some((c) => (e.a || []).some((x) => x.email === c)));
verifier(aClients.length === 2 && aClients.every((e) => e.modele === 'ouverture' && e.a.length === 1), `exactement 2 e-mails clients, une lettre d ouverture chacun (${modeles(aClients)})`);
verifier(vers(aClients, RESP).length === 1 && vers(aClients, COLLAB).length === 1, 'une pour le responsable, une pour le collaborateur');
verifier(!aClients.some((e) => ['devis', 'facture', 'message', 'message-projet', 'ticket-cree', 'fichier', 'validation', 'validation-demandee', 'jalon'].includes(e.modele)), 'aucun rejeu individuel de la préparation (devis, facture, messages, fichier, validation)');
verifier(vers(ouverture, TESTEUR).length === 0 && vers(ouverture, AUTRE).length === 0, 'ni le testeur ni le client du projet voisin ne reçoivent rien');
const totalOuverture = ouverture.length;
console.log(`         e-mails simulés à l ouverture : ${totalOuverture} au total, dont ${aClients.length} au client`);
verifier((await notifs(uR)) === 1 && (await notifs(uC)) === 1, 'une notification chacun, « votre espace est ouvert »');

/* ------------------------------------------------------------------------ */
console.log('\n== 3 · Les e-mails coupés : le Hub vit, rien ne sort');
await appelAdmin('reglerEmailsClient', { id: pid, emailsClient: 'coupes' });
await calme();
const avantMute = await envois();
const nR = await notifs(uR);
await bdd.collection(`projets/${pid}/messages`).add({ de: equipe, texte: 'Pendant la coupure.', pieces: [], date: FieldValue.serverTimestamp() });
await bdd.collection('validations').add({ projet: pid, titre: 'Valider la charte', statut: 'en-attente', reponse: null, par: equipe, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-ENV-2', libelle: 'Solde', montant: 700 });
if (tid) await bdd.collection(`tickets/${tid}/messages`).add({ de: equipe, texte: 'Pendant la coupure, sur la demande.', pieces: [], interne: false, date: FieldValue.serverTimestamp() });
await calme();
const mute = (await nouveaux(avantMute)).filter((e) => CLIENTS.some((c) => (e.a || []).some((x) => x.email === c)));
verifier(mute.length === 0, `coupure : ZÉRO e-mail externe (${modeles(mute)})`);
verifier((await notifs(uR)) > nR, 'mais les notifications arrivent dans le Hub');
verifier((await bdd.collection(`projets/${pid}/messages`).get()).docs.some((d) => d.data().texte === 'Pendant la coupure.'), 'et les données sont là');
verifier(((await bdd.doc(`projets/${pid}`).get()).data().membres || []).length === 2, 'et l accès reste entier');
await appelAdmin('reglerEmailsClient', { id: pid, emailsClient: 'actifs' });
await calme();

/* ------------------------------------------------------------------------ */
console.log('\n== 4 · Les destinataires impossibles');
/* Collaborateur et événement réservé au responsable. */
let avant = await envois();
await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-ENV-3', libelle: 'Complément', montant: 100 });
await calme();
let n = await nouveaux(avant);
verifier(vers(n, RESP).some((e) => e.modele === 'facture') && vers(n, COLLAB).length === 0, 'une facture : le responsable oui, le collaborateur NON');

/* Mauvais projet : un message sur Q ne touche pas les clients de P. */
avant = await envois();
await bdd.collection(`projets/${qid}/messages`).add({ de: equipe, texte: 'Pour Q seulement.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, AUTRE).length === 1 && CLIENTS.every((c) => vers(n, c).length === 0), 'un message sur le projet voisin : son client oui, ceux de P NON');

/* Testeur non concerné : un message sur P ne lui arrive pas. */
avant = await envois();
await bdd.collection(`projets/${pid}/messages`).add({ de: equipe, texte: 'Pour P.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, TESTEUR).length === 0 && vers(n, RESP).length === 1, 'un message sur P : le testeur de P NON, le responsable oui');

/* Retiré. */
await appelAdmin('retirerInterlocuteur', { projet: pid, email: COLLAB });
await calme();
avant = await envois(); const nC = await notifs(uC);
await bdd.collection(`projets/${pid}/messages`).add({ de: equipe, texte: 'Après le retrait.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, COLLAB).length === 0 && (await notifs(uC)) === nC, 'retiré : ni e-mail, ni notification');

/* Membre d'équipe inactif. */
const uA = await uidDe(AGENT);
const nA = await notifs(uA);
await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: uR, nom: 'Rose', cote: 'client' }, texte: 'Une question.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
verifier((await notifs(uA)) > nA, 'actif, l agent du projet est notifié d un message client');
await appelAdmin('desactiverEquipe', { uid: uA });
const nA2 = await notifs(uA);
avant = await envois();
await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: uR, nom: 'Rose', cote: 'client' }, texte: 'Une autre question.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier((await notifs(uA)) === nA2 && vers(n, AGENT).length === 0, 'désactivé : ni notification, ni e-mail');

/* Projet refermé. */
await appelAdmin('fermerAuClient', { id: pid });
await calme();
avant = await envois(); const nR2 = await notifs(uR);
await bdd.collection(`projets/${pid}/messages`).add({ de: equipe, texte: 'Projet refermé.', pieces: [], date: FieldValue.serverTimestamp() });
await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-ENV-4', libelle: 'Après fermeture', montant: 50 });
await calme();
n = await nouveaux(avant);
verifier(vers(n, RESP).length === 0 && (await notifs(uR)) === nR2, 'refermé : le responsable ne reçoit plus rien, ni e-mail ni notification');

/* Muté (sur le projet voisin, ouvert). */
await appelAdmin('reglerEmailsClient', { id: qid, emailsClient: 'coupes' });
await calme();
avant = await envois();
await bdd.collection(`projets/${qid}/messages`).add({ de: equipe, texte: 'Q muté.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, AUTRE).length === 0, 'muté : zéro e-mail externe');

/* ------------------------------------------------------------------------ */
console.log('\n== 5 · Un fait servi en retard ne part pas pour autant');
/* Une file chargée (des écritures qui déclenchent), puis un fait sur un
   projet muté, puis la reprise des e-mails écrite AUSSITÔT : le
   déclencheur du fait sera servi APRÈS la reprise. Il ne doit pas partir :
   il est né pendant la coupure. Même chose pour un fait né projet fermé et
   servi après la réouverture. */
const Q2 = await appelAdmin('creerProjet', { ref: 'ENVR', nom: 'Projet en retard', client: { nom: 'Rita', email: 'env.retard@exemple.test', entreprise: 'Société R' }, interlocuteurs: [{ email: 'env.retard@exemple.test', nom: 'Rita', role: 'responsable' }] });
const rid = Q2.json.id;
await appelAdmin('ouvrirAuClient', { id: rid });
await appelAdmin('reglerEmailsClient', { id: rid, emailsClient: 'coupes' });
await calme();
const charger = async (n) => { for (let k = 0; k < n; k += 50) { const l = bdd.batch(); for (let j = k; j < Math.min(n, k + 50); j += 1) l.set(bdd.doc(`projets/charge-${rid}-${j}`), { nom: 'charge', ref: 'CH', interne: true, membres: [] }); await l.commit(); } };
avant = await envois();
await charger(120);
await bdd.collection(`projets/${rid}/messages`).add({ de: equipe, texte: 'Né pendant la coupure.', pieces: [], date: FieldValue.serverTimestamp() });
await bdd.doc(`projets/${rid}`).update({ emailsClient: 'actifs', emailsActifsLe: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, 'env.retard@exemple.test').length === 0, 'né pendant la coupure, servi après la reprise : ZÉRO e-mail');
avant = await envois();
await bdd.doc(`projets/${rid}`).update({ ouvert: false });
await charger(120);
await bdd.collection(`projets/${rid}/messages`).add({ de: equipe, texte: 'Né projet fermé.', pieces: [], date: FieldValue.serverTimestamp() });
await bdd.doc(`projets/${rid}`).update({ ouvert: true, ouvertLe: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, 'env.retard@exemple.test').length === 0, 'né projet fermé, servi après la réouverture : ZÉRO e-mail');
avant = await envois();
await bdd.collection(`projets/${rid}/messages`).add({ de: equipe, texte: 'Né après.', pieces: [], date: FieldValue.serverTimestamp() });
await calme();
n = await nouveaux(avant);
verifier(vers(n, 'env.retard@exemple.test').length === 1, 'un fait né après la réouverture part, lui');
for (const d of (await bdd.collection('projets').where('ref', '==', 'CH').get()).docs) await d.ref.delete();

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
