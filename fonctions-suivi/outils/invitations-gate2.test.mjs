/* ==========================================================================
   CAPMEDIA CLIENT HUB · les invitations, une par une (préflight Gate 2)

   Une invitation ne donne JAMAIS d'accès : elle pré-remplit une adresse à
   la porte. L'accès vient de l'état ACTUEL (fiche d'équipe active,
   interlocuteur actif d'un projet ouvert, fiche de testeur active). On le
   prouve pour les quatre familles (équipe, responsable, collaborateur,
   testeur), à travers leur vie entière :

     envoi, pré-remplissage, expiration, révocation, renvoi, consommation,
     seconde consommation, changement de rôle avant acceptation, retrait
     avant acceptation, conflit d'adresse.

   À chaque fin de vie, on vérifie les deux portes : le lien ne pré-remplit
   plus, et un code demandé n'ouvre que ce que l'état actuel permet.

     (émulateurs avec les fonctions, semis du banc)
     node fonctions-suivi/outils/invitations-gate2.test.mjs
   ========================================================================== */

import { barriere } from './lib/barriere.mjs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { appelAdmin, uidDe, FONCTIONS } = require('./lib/session-banc.cjs');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
/* L'identifiant d'une invitation : l'empreinte de son jeton (invitations.idDe). */
const idDe = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('hex');

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 200)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const compteurs = async () => `${(await bdd.collection('envois').count().get()).data().count}/${(await bdd.collectionGroup('notifications').count().get()).data().count}`;
/* Attendre que les déclencheurs aient TOUT servi : une barrière (état
   observable), pas une durée au jugé (voir lib/barriere.mjs). */
const calme = () => barriere({ bdd });
const porte = (corps) => fetch(`${FONCTIONS}/suiviConnexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  .then(async (r) => ({ code: r.status, ...(await r.json().catch(() => ({}))) }));
const jetonDe = (lien) => new URL(lien).searchParams.get('i');
const preRemplit = async (jeton, email) => (await porte({ action: 'invitation', jeton })).email === email;
const vider = async () => { for (const c of ['connexions', 'connexionsIp']) for (const d of (await bdd.collection(c).get()).docs) await d.ref.delete(); };
const codes = async (email) => (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.map((d) => d.data()).filter((d) => d.a[0].email === email);
/* La porte par code, jusqu'au bout : rend l'espace ouvert, ou null. */
const entrer = async (email) => {
  await vider();
  const avant = (await codes(email)).length;
  await porte({ action: 'demanderCode', email });
  await calme();
  const liste = await codes(email);
  if (liste.length === avant) return null;
  const dernier = liste.sort((x, y) => (y.cree ? y.cree.toMillis() : 0) - (x.cree ? x.cree.toMillis() : 0))[0];
  const v = await porte({ action: 'verifierCode', email, code: dernier.variables.code });
  return v.ok ? v.espace : `refus ${v.code}`;
};
const invitationsDe = async (uid) => (await bdd.collection('invitations').where('uid', '==', uid).get()).docs.map((d) => d.data());

const RESP = 'inv.resp@exemple.test';
const COLLAB = 'inv.collab@exemple.test';
const AGENT = 'inv.agent@exemple.test';
const TESTEUR = 'inv.testeur@essai.test';

/* Un projet ouvert, avec un responsable déjà entré, pour recevoir les autres. */
const cree = await appelAdmin('creerProjet', { ref: 'INVG2', nom: 'Invitations Gate 2', client: { nom: 'Pia', email: 'inv.pia@exemple.test', entreprise: 'Société Inv' }, interlocuteurs: [{ email: 'inv.pia@exemple.test', nom: 'Pia', role: 'responsable' }] });
const pid = cree.json && cree.json.id;
await appelAdmin('ouvrirAuClient', { id: pid });
await calme();

console.log('\n== Responsable : envoi, pré-remplissage, consommation, seconde consommation');
{
  const r = await appelAdmin('ajouterInterlocuteur', { projet: pid, email: RESP, nom: 'Rémi', role: 'responsable' });
  verifier(r.code === 200 && r.json.invitation.etat === 'envoyee', 'projet ouvert : l invitation part', r.texte);
  const lien = await appelAdmin('creerInvitation', { projet: pid, email: RESP, envoyer: false });
  const j = jetonDe(lien.json.lien);
  verifier(await preRemplit(j, RESP), 'le lien pré-remplit son adresse');
  verifier((await entrer(RESP)) === 'hub', 'il entre avec son code, vers le Hub');
  const p = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier(p.roles[await uidDe(RESP)] === 'responsable', 'avec le rôle de sa fiche : responsable');
  verifier(!(await preRemplit(j, RESP)), 'consommée : le lien ne pré-remplit plus');
  verifier((await invitationsDe(await uidDe(RESP))).every((i) => ['acceptee', 'revoquee'].includes(i.etat)), 'aucune de ses invitations ne reste vivante');
  verifier((await entrer(RESP)) === 'hub', 'une seconde connexion ne dépend pas de l invitation (état actuel)');
  verifier(!(await preRemplit(j, RESP)), 'et la seconde « consommation » ne ranime rien');
}

console.log('\n== Collaborateur : changement de rôle, puis retrait, AVANT acceptation');
{
  await appelAdmin('ajouterInterlocuteur', { projet: pid, email: COLLAB, nom: 'Colin', role: 'collaborateur' });
  const lien = await appelAdmin('creerInvitation', { projet: pid, email: COLLAB, envoyer: false });
  const j = jetonDe(lien.json.lien);
  const inv = (await bdd.doc(`invitations/${idDe(j)}`).get()).data();
  verifier(inv.role === 'collaborateur' && inv.projet === pid && inv.type === 'client', 'l invitation est liée au bon rôle et au bon projet');
  await appelAdmin('modifierInterlocuteur', { projet: pid, email: COLLAB, role: 'responsable' });
  verifier((await entrer(COLLAB)) === 'hub', 'il entre');
  const p = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier(p.roles[await uidDe(COLLAB)] === 'responsable', 'avec le rôle CHOISI depuis (responsable), pas celui de l invitation');
  /* Un second collaborateur, retiré avant d'avoir accepté. */
  const X = 'inv.parti@exemple.test';
  await appelAdmin('ajouterInterlocuteur', { projet: pid, email: X, nom: 'Parti', role: 'collaborateur' });
  const lienX = await appelAdmin('creerInvitation', { projet: pid, email: X, envoyer: false });
  const jx = jetonDe(lienX.json.lien);
  await appelAdmin('retirerInterlocuteur', { projet: pid, email: X });
  verifier(!(await preRemplit(jx, X)), 'retiré avant acceptation : son lien ne pré-remplit plus');
  verifier((await invitationsDe(await uidDe(X))).every((i) => i.etat !== 'envoyee' && i.etat !== 'en-attente'), 'son invitation est révoquée');
  verifier((await entrer(X)) === null, 'et la porte ne lui envoie aucun code : aucun accès');
  const p2 = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier(!(p2.membres || []).includes(await uidDe(X)), 'il n est pas membre du projet');
  const lienMort = await appelAdmin('creerInvitation', { projet: pid, email: X, envoyer: false });
  verifier(lienMort.code === 409, `un nouveau lien pour un retiré : 409 (${lienMort.code})`);
}

console.log('\n== Expiration et révocation');
{
  const lien = await appelAdmin('renvoyerInvitation', { projet: pid, email: RESP });
  const j = jetonDe(lien.json.lien);
  await bdd.doc(`invitations/${idDe(j)}`).update({ expire: new Date(Date.now() - 1000) });
  verifier(!(await preRemplit(j, RESP)), 'expirée : le lien ne pré-remplit plus');
  const lien2 = await appelAdmin('renvoyerInvitation', { projet: pid, email: RESP });
  const j2 = jetonDe(lien2.json.lien);
  verifier(await preRemplit(j2, RESP), 'renvoyée : un lien neuf fonctionne');
  await appelAdmin('revoquerInvitation', { jeton: j2 });
  verifier(!(await preRemplit(j2, RESP)), 'révoquée : il ne pré-remplit plus');
  verifier((await entrer(RESP)) === 'hub', 'et l accès, lui, ne dépend pas du lien : toujours là');
}

console.log('\n== Équipe : invitation, désactivation avant acceptation, conflit');
{
  const a = await appelAdmin('ajouterEquipe', { email: AGENT, nom: 'Inès', role: 'agent', projets: [pid] });
  verifier(a.code === 200, 'un agent est invité');
  const uid = await uidDe(AGENT);
  const inv = await invitationsDe(uid);
  verifier(inv.length === 1 && inv[0].type === 'equipe' && inv[0].role === 'agent' && inv[0].etat === 'envoyee', 'une invitation équipe, rôle agent, envoyée');
  await appelAdmin('desactiverEquipe', { uid });
  verifier((await invitationsDe(uid)).every((i) => i.etat === 'revoquee'), 'désactivé avant acceptation : son invitation est révoquée');
  verifier((await entrer(AGENT)) === null, 'et aucun code ne part');
  await appelAdmin('reactiverEquipe', { uid });
  verifier((await entrer(AGENT)) === 'cockpit', 'réactivé : il entre au cockpit');
  verifier((await invitationsDe(uid)).every((i) => i.etat !== 'envoyee'), 'aucune invitation vivante ne traîne');
  const conflit = await appelAdmin('ajouterInterlocuteur', { projet: pid, email: AGENT, role: 'collaborateur' });
  verifier(conflit.code === 409, `l adresse d un agent ne devient pas cliente : 409 (${conflit.code})`);
  const conflit2 = await appelAdmin('ajouterEquipe', { email: RESP, nom: 'Rémi', role: 'agent' });
  verifier(conflit2.code === 409, `l adresse d un client ne rejoint pas l équipe : 409 (${conflit2.code})`);
}

console.log('\n== Testeur : invitation, retrait, conflit');
{
  const t = await appelAdmin('inscrireTesteur', { email: TESTEUR, prenom: 'Théa', plateformes: ['web'], projets: [pid] });
  verifier(t.code === 200, 'un testeur est inscrit');
  const uid = await uidDe(TESTEUR);
  const i = await appelAdmin('inviterTesteur', { testeur: uid });
  verifier(i.code === 200, 'et invité');
  const inv = (await invitationsDe(uid)).filter((x) => x.type === 'testeur');
  verifier(inv.length >= 1 && inv.every((x) => x.role === 'testeur') && inv.some((x) => (x.projets || []).includes(pid)), 'invitation testeur, liée à ses projets');
  verifier((await entrer(TESTEUR)) === 'testeur', 'il entre dans son espace de test, pas dans le Hub');
  await appelAdmin('inviterTesteur', { testeur: uid });
  await calme();
  const lettre = (await bdd.collection('envois').where('modele', '==', 'invitation-testeur').get()).docs.map((d) => d.data())
    .filter((d) => d.a[0].email === TESTEUR).sort((x, y) => (y.cree ? y.cree.toMillis() : 0) - (x.cree ? x.cree.toMillis() : 0))[0];
  const j = jetonDe(lettre.variables.lien);
  verifier(await preRemplit(j, TESTEUR), 'son lien d invitation pré-remplit son adresse');
  await appelAdmin('retirerTesteur', { testeur: uid });
  verifier(!(await preRemplit(j, TESTEUR)), 'retiré : ce même lien ne pré-remplit plus');
  verifier((await invitationsDe(uid)).every((x) => !['envoyee', 'en-attente'].includes(x.etat)), 'aucune invitation vivante');
  verifier((await entrer(TESTEUR)) === null, 'et aucun code ne part');
  const conflit = await appelAdmin('ajouterInterlocuteur', { projet: pid, email: TESTEUR, role: 'collaborateur' });
  verifier(conflit.code === 409, `l adresse d un testeur ne devient pas cliente : 409 (${conflit.code})`);
  const conflit2 = await appelAdmin('inscrireTesteur', { email: COLLAB, prenom: 'Colin', plateformes: ['web'], projets: [pid] });
  verifier(conflit2.code === 409, `l adresse d un client ne devient pas testeur : 409 (${conflit2.code})`);
}

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
