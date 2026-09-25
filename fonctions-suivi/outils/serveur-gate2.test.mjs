/* ==========================================================================
   CAPMEDIA CLIENT HUB · le serveur de la Gate 2 à l'épreuve

   Sur les émulateurs, fonctions comprises, avec le jeu de données du banc
   (semer-suivi.mjs). Chaque appel porte le jeton Firebase d'une personne,
   comme le cockpit : plus aucune clé.

     1. la porte : sans jeton, client, testeur, action inconnue ou retirée ;
     2. l'équipe : ajouter, agent borné à ses projets, dernier administrateur,
        désactiver (ancienne session refusée), réactiver, changer de rôle,
        retirer ;
     3. une adresse, un rôle : les conflits répondent 409 ;
     4. la communication : projet fermé (zéro e-mail client), ouverture (une
        lettre par personne, pas d'avalanche), e-mails coupés (zéro e-mail,
        le Hub notifie), collaborateur sans finance, interlocuteur retiré
        (plus rien), membre d'équipe inactif (plus aucune notification) ;
     5. le devis : une réponse qui ne vient pas d'un responsable est défaite ;
     6. les invitations : renvoi, révocation, consommation, expiration ;
     7. la porte d'entrée par code : un compte désactivé ne reçoit pas de code.

     (émulateurs + semis, voir banc-suites.sh)
     node fonctions-suivi/outils/serveur-gate2.test.mjs
   ========================================================================== */

import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const require = createRequire(import.meta.url);
const { appelAdmin, jetonPour, uidDe, FONCTIONS } = require('./lib/session-banc.cjs');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Émulateurs seulement (FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(2);
}
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
const auth = getAuth();

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 200)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* Les déclencheurs travaillent après l'écriture : on attend que les lettres,
   l'activité et les notifications cessent d'arriver. */
const compteurs = async () => {
  const [e, a, n] = await Promise.all([
    bdd.collection('envois').count().get(), bdd.collection('activite').count().get(), bdd.collectionGroup('notifications').count().get(),
  ]);
  return `${e.data().count}/${a.data().count}/${n.data().count}`;
};
const calme = async (max = 60) => {
  let avant = ''; let pareil = 0;
  for (let i = 0; i < max; i += 1) {
    const m = await compteurs();
    pareil = m === avant ? pareil + 1 : 0;
    if (pareil >= 3) return;
    avant = m; await pause(700);
  }
};
const envoisVers = async (email, apres = 0) => (await bdd.collection('envois').get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((d) => (d.a || []).some((x) => x.email === email) && (!apres || (d.cree && d.cree.toMillis() > apres)));
const notifsDe = async (uid) => (await bdd.collection(`boites/${uid}/notifications`).get()).docs.map((d) => d.data());
const maintenant = () => Date.now();

const ADMIN = 'agent.essai@exemple.test';
const NOUVEL_AGENT = 'agent.g2@exemple.test';
const ADMIN2 = 'admin2.g2@exemple.test';
const RESP = 'resp.g2@exemple.test';
const COLLAB = 'collab.g2@exemple.test';
const TESTEUR = 'testeur.g2@exemple.test';

/* ------------------------------------------------------------------------ */
console.log('\n== 1 · La porte');
{
  const sans = await appelAdmin('moi', {}, { email: null });
  verifier(sans.code === 401, `sans jeton : 401 (${sans.code})`);
  const faux = await appelAdmin('moi', {}, { jeton: 'pas-un-jeton' });
  verifier(faux.code === 401, `jeton illisible : 401 (${faux.code})`);
  const client = await appelAdmin('creerProjet', { ref: 'INTRUS', nom: 'Intrus' }, { email: 'camille.essai@exemple.test' });
  verifier(client.code === 403, `un client ne crée pas de projet : 403 (${client.code})`, client.texte);
  const moi = await appelAdmin('moi');
  verifier(moi.code === 200 && moi.json.role === 'admin' && moi.json.permissions.includes('equipe.gerer'), 'l administrateur du banc est reconnu par son jeton', moi.texte);
  const inconnue = await appelAdmin('toutEffacer');
  verifier(inconnue.code === 400, `action inconnue : 400 (${inconnue.code})`);
  const retiree = await appelAdmin('inviterMembreOrganisation', { id: 'atelier-nord', email: 'x@exemple.test' });
  verifier(retiree.code === 410 && /projet par projet|Accès client/.test(retiree.texte), `l accès par organisation est retiré, et le dit : 410 (${retiree.code})`, retiree.texte);
  const ancienneCle = await fetch(`${FONCTIONS}/suiviAdmin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: 'cle-essai-locale', action: 'creerProjet', ref: 'CLE', nom: 'Clé' }) });
  verifier(ancienneCle.status === 401, `l ancienne clé d administration n ouvre plus rien : 401 (${ancienneCle.status})`);
}

/* ------------------------------------------------------------------------ */
console.log('\n== 2 · L équipe');
{
  const ajout = await appelAdmin('ajouterEquipe', { email: NOUVEL_AGENT, nom: 'Agent Gate', role: 'agent', projets: ['atelier'] });
  verifier(ajout.code === 200, `un administrateur ajoute un agent (${ajout.code})`, ajout.texte);
  const uidAgent = await uidDe(NOUVEL_AGENT);
  const fiche = (await bdd.doc(`equipe/${uidAgent}`).get()).data() || {};
  verifier(fiche.role === 'agent' && fiche.actif === true && (fiche.projets || []).join() === 'atelier', 'sa fiche : agent, actif, sur Atelier seulement', JSON.stringify(fiche));
  await calme();
  verifier((await envoisVers(NOUVEL_AGENT)).some((e) => e.modele === 'invitation-equipe'), 'il reçoit son invitation d équipe');
  verifier((await bdd.collection('invitations').where('uid', '==', uidAgent).get()).docs.some((d) => d.data().type === 'equipe'), 'l invitation est tracée, type équipe');
  const deux = await appelAdmin('ajouterEquipe', { email: NOUVEL_AGENT, nom: 'Agent Gate', role: 'agent' });
  verifier(deux.code === 409, `ajouter deux fois la même personne : 409 (${deux.code})`);

  const moi = await appelAdmin('moi', {}, { email: NOUVEL_AGENT });
  verifier(moi.code === 200 && moi.json.role === 'agent' && !moi.json.permissions.includes('equipe.gerer'), 'l agent se connaît : agent, sans administration', moi.texte);
  const r1 = await appelAdmin('creerDemande', { projet: 'atelier', titre: 'Posée par l agent' }, { email: NOUVEL_AGENT });
  verifier(r1.code === 200, `l agent pose une demande sur SON projet (${r1.code})`, r1.texte);
  const r2 = await appelAdmin('creerDemande', { projet: 'boutique', titre: 'Hors de ses projets' }, { email: NOUVEL_AGENT });
  verifier(r2.code === 403, `mais pas sur un projet qui n est pas le sien : 403 (${r2.code})`, r2.texte);
  const r3 = await appelAdmin('ajouterEquipe', { email: 'x.g2@exemple.test', nom: 'X', role: 'admin' }, { email: NOUVEL_AGENT });
  verifier(r3.code === 403, `l agent n administre pas l équipe : 403 (${r3.code})`);
  const r4 = await appelAdmin('ajouterInterlocuteur', { projet: 'atelier', email: 'y.g2@exemple.test', role: 'collaborateur' }, { email: NOUVEL_AGENT });
  verifier(r4.code === 403, `ni ne donne d accès client sans délégation : 403 (${r4.code})`);
  const r5 = await appelAdmin('deposerDocument', { projet: 'atelier', type: 'facture', numero: 'F-X', libelle: 'x', montant: 10 }, { email: NOUVEL_AGENT });
  verifier(r5.code === 403, `ni ne dépose de facture : 403 (${r5.code})`);
  const r6 = await appelAdmin('creerProjet', { ref: 'AGENTPROJ', nom: 'x' }, { email: NOUVEL_AGENT });
  verifier(r6.code === 403, `ni ne crée de projet : 403 (${r6.code})`);

  /* Déléguer la finance, puis la retirer. */
  const del = await appelAdmin('modifierEquipe', { uid: uidAgent, permissions: ['finance.gerer', 'equipe.gerer'] });
  verifier(del.code === 200, 'l administrateur délègue la finance à l agent');
  const f1 = await appelAdmin('deposerDocument', { projet: 'atelier', type: 'facture', numero: 'F-DELEG', libelle: 'Déléguée', montant: 10 }, { email: NOUVEL_AGENT });
  verifier(f1.code === 200, `l agent dépose alors une facture sur son projet (${f1.code})`, f1.texte);
  const f2 = await appelAdmin('ajouterEquipe', { email: 'z.g2@exemple.test', nom: 'Z', role: 'agent' }, { email: NOUVEL_AGENT });
  verifier(f2.code === 403, `« administrer l équipe » ne s est pas délégué pour autant : 403 (${f2.code})`);
  await appelAdmin('modifierEquipe', { uid: uidAgent, permissions: [] });

  /* Le dernier administrateur. */
  const uidAdmin = await uidDe(ADMIN);
  const d1 = await appelAdmin('desactiverEquipe', { uid: uidAdmin });
  verifier(d1.code === 409 && /dernier administrateur/.test(d1.texte), `le dernier administrateur ne se désactive pas : 409 (${d1.code})`, d1.texte);
  const d2 = await appelAdmin('modifierEquipe', { uid: uidAdmin, role: 'agent' });
  verifier(d2.code === 409, `ni ne se rétrograde : 409 (${d2.code})`);
  const d3 = await appelAdmin('retirerEquipe', { uid: uidAdmin });
  verifier(d3.code === 409, `ni ne se retire : 409 (${d3.code})`);
  verifier(((await bdd.doc(`equipe/${uidAdmin}`).get()).data() || {}).actif === true, 'et il est toujours là, actif');

  /* Un second administrateur : désactivé, son ancienne session tombe. */
  const a2 = await appelAdmin('ajouterEquipe', { email: ADMIN2, nom: 'Admin Deux', role: 'admin' });
  verifier(a2.code === 200, 'un second administrateur est ajouté');
  const uidA2 = await uidDe(ADMIN2);
  const ancienJeton = await jetonPour(ADMIN2);
  verifier((await appelAdmin('moi', {}, { jeton: ancienJeton })).code === 200, 'sa session fonctionne');
  await pause(1100); /* la révocation se compare à la seconde près */
  const des = await appelAdmin('desactiverEquipe', { uid: uidA2 });
  verifier(des.code === 200, 'le premier le désactive (il en reste un)', des.texte);
  const apres = await appelAdmin('moi', {}, { jeton: ancienJeton });
  verifier(apres.code === 401, `l ANCIENNE session du désactivé est refusée par le serveur : 401 (${apres.code})`, apres.texte);
  const compte = await auth.getUser(uidA2);
  verifier(compte.disabled === true, 'son compte de connexion est suspendu');
  let nouveauRefuse = false;
  try { await jetonPour(ADMIN2); } catch (e) { nouveauRefuse = true; }
  verifier(nouveauRefuse, 'et il ne peut pas rouvrir de session');
  verifier(((await bdd.doc(`equipe/${uidA2}`).get()).data() || {}).actif === false, 'sa fiche dit « inactif » (les règles la relisent)');
  const rea = await appelAdmin('reactiverEquipe', { uid: uidA2 });
  verifier(rea.code === 200 && (await appelAdmin('moi', {}, { email: ADMIN2 })).code === 200, 'réactivé, il se reconnecte');

  /* Changer de rôle. */
  const promu = await appelAdmin('modifierEquipe', { uid: uidAgent, role: 'admin' });
  verifier(promu.code === 200 && (await appelAdmin('moi', {}, { email: NOUVEL_AGENT })).json.role === 'admin', 'un agent promu administrateur l est tout de suite');
  const retro = await appelAdmin('modifierEquipe', { uid: uidAgent, role: 'agent', projets: ['atelier'] });
  verifier(retro.code === 200 && (await appelAdmin('moi', {}, { email: NOUVEL_AGENT })).json.role === 'agent', 'et rétrogradé agent, de même (il reste deux administrateurs)');

  /* Retirer de l'équipe. */
  const ret = await appelAdmin('retirerEquipe', { uid: uidA2 });
  verifier(ret.code === 200, 'le second administrateur est retiré');
  verifier(!(await bdd.doc(`equipe/${uidA2}`).get()).exists, 'sa fiche n existe plus');
  let parti = false; try { await auth.getUser(uidA2); } catch (e) { parti = true; }
  verifier(parti, 'son compte de connexion non plus : l adresse est libre');
}

/* ------------------------------------------------------------------------ */
console.log('\n== 3 · Une adresse, un rôle : les conflits');
{
  const refus409 = (r) => r.code === 409 && /un seul rôle/.test(r.texte);
  verifier(refus409(await appelAdmin('ajouterInterlocuteur', { projet: 'atelier', email: ADMIN, role: 'collaborateur' })), 'équipe devenue cliente : 409');
  verifier(refus409(await appelAdmin('ajouterEquipe', { email: 'camille.essai@exemple.test', nom: 'Camille', role: 'agent' })), 'cliente devenue équipe : 409');
  verifier(refus409(await appelAdmin('inscrireTesteur', { email: 'camille.essai@exemple.test', prenom: 'Camille', plateformes: ['web'], projets: ['atelier'] })), 'cliente devenue testeuse : 409');
  verifier(refus409(await appelAdmin('inscrireTesteur', { email: ADMIN, prenom: 'Alex', plateformes: ['web'] })), 'équipe devenue testeuse : 409');
  const t = await appelAdmin('inscrireTesteur', { email: TESTEUR, prenom: 'Tess', plateformes: ['web'], projets: ['atelier'] });
  verifier(t.code === 200, 'un testeur neuf s inscrit');
  verifier(refus409(await appelAdmin('ajouterEquipe', { email: TESTEUR, nom: 'Tess', role: 'agent' })), 'testeur devenu équipe : 409');
  verifier(refus409(await appelAdmin('ajouterInterlocuteur', { projet: 'atelier', email: TESTEUR, role: 'collaborateur' })), 'testeur devenu client : 409');
}

/* ------------------------------------------------------------------------ */
console.log('\n== 4 · La communication d un projet');
let pid; let uidResp; let uidCollab;
{
  const cree = await appelAdmin('creerProjet', { ref: 'GATEDEUX', nom: 'Gate Deux', organisation: 'atelier-nord', type: 'application-mobile' });
  verifier(cree.code === 200, 'un projet est créé', cree.texte);
  pid = cree.json.id;
  verifier(((await bdd.doc(`projets/${pid}`).get()).data() || {}).ouvert === false, 'il naît fermé au client');
  const r = await appelAdmin('ajouterInterlocuteur', { projet: pid, email: RESP, nom: 'Rose Responsable', role: 'responsable' });
  const c = await appelAdmin('ajouterInterlocuteur', { projet: pid, email: COLLAB, nom: 'Colin Collaborateur', role: 'collaborateur' });
  verifier(r.code === 200 && c.code === 200 && r.json.invitation.etat === 'preparee' && c.json.invitation.etat === 'preparee', 'deux interlocuteurs préparés : rien d envoyé', `${r.texte} ${c.texte}`);
  uidResp = r.json.uid; uidCollab = c.json.uid;
  const p = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier((p.membres || []).length === 0 && (p.personnes || []).length === 2, 'fermé : aucun membre effectif, deux personnes préparées');
  const orga = (await bdd.doc('organisations/atelier-nord').get()).data();
  verifier(!(orga.membres || []).includes(uidResp), 'la société ne leur donne rien : ils ne sont membres de rien');

  /* La préparation interne : étape, tâche visible, fichier, validation,
     message de l'équipe, devis. Rien ne doit partir chez le client. */
  const debutPrep = maintenant();
  await bdd.collection(`projets/${pid}/jalons`).add({ projet: pid, titre: 'Cadrage', statut: 'en-cours', progression: 20, ordre: 1, cree: FieldValue.serverTimestamp() });
  await bdd.collection('taches').add({ projet: pid, titre: 'Préparer la maquette', statut: 'attente-client', priorite: 'normale', visibilite: 'client', archive: false, cree: FieldValue.serverTimestamp() });
  await bdd.collection('validations').add({ projet: pid, titre: 'Valider le périmètre', statut: 'en-attente', description: 'x', cree: FieldValue.serverTimestamp() });
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex Durand', cote: 'equipe' }, texte: 'Préparation en cours', pieces: [], date: FieldValue.serverTimestamp() });
  await bdd.collection('reunions').add({ projet: pid, titre: 'Lancement', date: new Date(Date.now() + 7 * 86400000), duree: 30, visibilite: 'client', cree: FieldValue.serverTimestamp() });
  const devis = await appelAdmin('deposerDocument', { projet: pid, type: 'devis', numero: 'D-G2', libelle: 'Devis fondateur', montant: 1000 });
  verifier(devis.code === 200, 'un devis est déposé pendant la préparation');
  await calme();
  const pendant = [...await envoisVers(RESP, debutPrep), ...await envoisVers(COLLAB, debutPrep)];
  verifier(pendant.length === 0, `projet fermé : ZÉRO e-mail client pendant la préparation (${pendant.length})`, pendant.map((e) => e.modele).join(','));
  verifier((await notifsDe(uidResp)).length === 0 && (await notifsDe(uidCollab)).length === 0, 'et zéro notification');

  /* L'ouverture : une lettre par personne, un résumé, pas d'avalanche. */
  const debutOuverture = maintenant();
  const ouv = await appelAdmin('ouvrirAuClient', { id: pid });
  verifier(ouv.code === 200 && ouv.json.premiere === true, 'le projet s ouvre (première ouverture)', ouv.texte);
  await calme();
  const aResp = await envoisVers(RESP, debutOuverture);
  const aCollab = await envoisVers(COLLAB, debutOuverture);
  verifier(aResp.length === 1 && aResp[0].modele === 'ouverture', `le responsable reçoit UNE lettre, l ouverture (${aResp.map((e) => e.modele).join(',')})`);
  verifier(aCollab.length === 1 && aCollab[0].modele === 'ouverture', `le collaborateur aussi, une seule (${aCollab.map((e) => e.modele).join(',')})`);
  const pointsResp = (aResp[0] && aResp[0].variables.points) || [];
  const pointsCollab = (aCollab[0] && aCollab[0].variables.points) || [];
  verifier(pointsResp.some((x) => /Devis/.test(x.quoi)) && !pointsCollab.some((x) => /Devis|Factures/.test(x.quoi)), 'le résumé du responsable compte le devis, celui du collaborateur non');
  verifier(pointsResp.some((x) => /Feuille de route|À valider|Prochaine réunion/.test(x.quoi)), 'le résumé dit ce qui attend déjà dans l espace', JSON.stringify(pointsResp));
  verifier((await notifsDe(uidResp)).length === 1 && (await notifsDe(uidCollab)).length === 1, 'une seule notification chacun : « votre espace est ouvert »');
  const p2 = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier(p2.membres.length === 2 && p2.roles[uidResp] === 'responsable' && p2.roles[uidCollab] === 'collaborateur', 'ils sont membres, chacun avec son rôle');
  const reouv = await appelAdmin('ouvrirAuClient', { id: pid });
  await calme();
  verifier(reouv.json && reouv.json.premiere === false && (await envoisVers(RESP, debutOuverture)).length === 1, 'rouvrir un projet ouvert ne renvoie rien');

  /* Après l'ouverture : les e-mails suivent les rôles. */
  const debutVie = maintenant();
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex Durand', cote: 'equipe' }, texte: 'Bienvenue', pieces: [], date: FieldValue.serverTimestamp() });
  const facture = await appelAdmin('deposerDocument', { projet: pid, type: 'facture', numero: 'F-G2', libelle: 'Acompte', montant: 500 });
  verifier(facture.code === 200, 'une facture est déposée');
  await calme();
  const vieResp = (await envoisVers(RESP, debutVie)).map((e) => e.modele);
  const vieCollab = (await envoisVers(COLLAB, debutVie)).map((e) => e.modele);
  verifier(vieResp.includes('message-projet') && vieCollab.includes('message-projet'), 'un message de l équipe part aux deux');
  verifier(vieResp.includes('facture') && !vieCollab.includes('facture'), `la facture ne part qu au responsable (collaborateur : ${vieCollab.join(',')})`);

  /* E-mails coupés : le Hub continue, aucun e-mail. */
  const coupe = await appelAdmin('reglerEmailsClient', { id: pid, emailsClient: 'coupes' });
  verifier(coupe.code === 200, 'les e-mails du client sont coupés');
  const notifAvant = (await notifsDe(uidResp)).length;
  const debutMute = maintenant();
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex Durand', cote: 'equipe' }, texte: 'Pendant la coupure', pieces: [], date: FieldValue.serverTimestamp() });
  await bdd.collection('taches').add({ projet: pid, titre: 'Relire', statut: 'a-faire', priorite: 'normale', visibilite: 'client', archive: false, cree: FieldValue.serverTimestamp() });
  await bdd.collection('validations').add({ projet: pid, titre: 'Valider la maquette', statut: 'en-attente', description: 'x', cree: FieldValue.serverTimestamp() });
  await calme();
  const mute = [...await envoisVers(RESP, debutMute), ...await envoisVers(COLLAB, debutMute)];
  verifier(mute.length === 0, `e-mails coupés : ZÉRO e-mail externe (${mute.map((e) => e.modele).join(',')})`);
  verifier((await notifsDe(uidResp)).length > notifAvant, 'mais le Hub notifie toujours');
  verifier(((await bdd.doc(`projets/${pid}`).get()).data().membres || []).length === 2, 'et l accès reste entier');
  const renvoiMute = await appelAdmin('renvoyerInvitation', { projet: pid, email: COLLAB });
  verifier(renvoiMute.code === 200 && renvoiMute.json.envoyee === false && Boolean(renvoiMute.json.lien), 'renvoyer une invitation pendant la coupure : le lien, sans e-mail', renvoiMute.texte);
  await appelAdmin('reglerEmailsClient', { id: pid, emailsClient: 'actifs' });
  const debutReprise = maintenant();
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex Durand', cote: 'equipe' }, texte: 'Après la coupure', pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  const reprise = (await envoisVers(RESP, debutReprise)).map((e) => e.modele);
  verifier(reprise.length === 1 && reprise[0] === 'message-projet', `réactivés : le nouvel événement part, rien de la coupure n est rejoué (${reprise.join(',')})`);

  /* Retirer le collaborateur : plus rien. */
  const ret = await appelAdmin('retirerInterlocuteur', { projet: pid, email: COLLAB });
  verifier(ret.code === 200, 'le collaborateur est retiré');
  const p3 = (await bdd.doc(`projets/${pid}`).get()).data();
  verifier(!p3.membres.includes(uidCollab) && !p3.roles[uidCollab], 'il n est plus membre, n a plus de rôle');
  const notifsCollab = (await notifsDe(uidCollab)).length;
  const debutRetrait = maintenant();
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex Durand', cote: 'equipe' }, texte: 'Après le retrait', pieces: [], date: FieldValue.serverTimestamp() });
  await bdd.collection('releases').add({ projet: pid, plateforme: 'ios', version: '1.0', statut: 'disponible', visibilite: 'client', cree: FieldValue.serverTimestamp() });
  await calme();
  verifier((await envoisVers(COLLAB, debutRetrait)).length === 0, 'ancien interlocuteur retiré : ZÉRO e-mail');
  verifier((await notifsDe(uidCollab)).length === notifsCollab, 'et zéro notification');
  verifier((await envoisVers(RESP, debutRetrait)).length >= 1, 'le responsable, lui, continue de recevoir');
  const dernier = await appelAdmin('retirerInterlocuteur', { projet: pid, email: RESP });
  verifier(dernier.code === 409 && /dernier responsable/.test(dernier.texte), `le dernier responsable d un projet ouvert ne se retire pas : 409 (${dernier.code})`);
  const retro = await appelAdmin('modifierInterlocuteur', { projet: pid, email: RESP, role: 'collaborateur' });
  verifier(retro.code === 409, `ni ne passe collaborateur : 409 (${retro.code})`);

  /* Un membre d'équipe inactif ne reçoit plus rien. */
  const uidAgent = await uidDe(NOUVEL_AGENT);
  await appelAdmin('modifierEquipe', { uid: uidAgent, projets: ['atelier', pid] });
  const avantAgent = (await notifsDe(uidAgent)).length;
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: uidResp, nom: 'Rose', cote: 'client' }, texte: 'Question du client', pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  const pendantActif = (await notifsDe(uidAgent)).length;
  verifier(pendantActif > avantAgent, 'actif et sur le projet, l agent est notifié d un message du client');
  await appelAdmin('desactiverEquipe', { uid: uidAgent });
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: uidResp, nom: 'Rose', cote: 'client' }, texte: 'Encore une question', pieces: [], date: FieldValue.serverTimestamp() });
  await bdd.collection('tickets').add({ projet: pid, numero: null, titre: 'Demande du client', description: 'x', type: 'bug', urgence: 'important', statut: 'nouveau', auteur: { uid: uidResp, nom: 'Rose', email: RESP, cote: 'client' }, pieces: [], liens: [], archive: false, lu: {}, cree: FieldValue.serverTimestamp() });
  await calme();
  verifier((await notifsDe(uidAgent)).length === pendantActif, 'désactivé : ZÉRO notification de plus');
  const assign = (await bdd.collection('tickets').where('projet', '==', pid).get()).docs[0];
  const debutAssign = maintenant();
  await assign.ref.update({ assigne: uidAgent });
  await calme();
  verifier((await envoisVers(NOUVEL_AGENT, debutAssign)).length === 0, 'et aucune lettre d assignation');
  await appelAdmin('reactiverEquipe', { uid: uidAgent });

  /* Un testeur ne reçoit rien d un projet où il n est pas interlocuteur. */
  const debutT = maintenant();
  await bdd.collection(`projets/${pid}/messages`).add({ de: { uid: 'equipe', nom: 'Alex', cote: 'equipe' }, texte: 'Pour le client', pieces: [], date: FieldValue.serverTimestamp() });
  await calme();
  verifier((await envoisVers(TESTEUR, debutT)).length === 0, 'un testeur ne reçoit rien des échanges d un projet');
}

/* ------------------------------------------------------------------------ */
console.log('\n== 5 · Le devis : seul un responsable y répond');
{
  const dv = (await bdd.collection('documents').where('projet', '==', pid).where('type', '==', 'devis').get()).docs[0];
  /* Une écriture qui contourne les règles (Admin SDK) : le serveur doit la
     défaire, sans en tirer de conséquence. */
  await appelAdmin('ajouterInterlocuteur', { projet: pid, email: COLLAB, nom: 'Colin', role: 'collaborateur' });
  await calme();
  await dv.ref.update({ statut: 'accepte', reponse: { par: uidCollab, nom: 'Colin', commentaire: '' } });
  await calme();
  const apresCollab = (await dv.ref.get()).data();
  verifier(apresCollab.statut === 'envoye' && !apresCollab.reponse, `une acceptation par un collaborateur est défaite (${apresCollab.statut})`);
  verifier(((await bdd.doc(`projets/${pid}`).get()).data().statut || '') !== 'devis-signe', 'et le projet ne démarre pas');
  verifier((await bdd.collection('audit').where('action', '==', 'devis.reponse-refusee').get()).docs.some((d) => d.data().document === dv.id), 'le refus est tracé dans l audit');
  await dv.ref.update({ statut: 'accepte', reponse: { par: uidResp, nom: 'Rose', commentaire: 'Allons-y' } });
  await calme();
  verifier((await dv.ref.get()).data().statut === 'accepte', 'l acceptation du responsable tient');
  verifier(((await bdd.doc(`projets/${pid}`).get()).data().statut || '') === 'devis-signe', 'et le projet démarre');

  /* Un avenant signé hors du Hub : l'équipe le marque, sa signature tient.
     Un client qui se dit « équipe » dans sa réponse est défait. */
  const av = await appelAdmin('deposerDocument', { projet: pid, type: 'devis', numero: 'D-G2-AV', libelle: 'Avenant', montant: 300 });
  await calme();
  const marque = await appelAdmin('statutDevis', { id: av.json.id, statut: 'accepte' });
  await calme();
  const avDoc = (await bdd.doc(`documents/${av.json.id}`).get()).data();
  verifier(marque.code === 200 && avDoc.statut === 'accepte' && avDoc.reponse && avDoc.reponse.cote === 'equipe', `un devis marqué signé par l administrateur tient, signé par lui (${avDoc.statut})`);
  const av2 = await appelAdmin('deposerDocument', { projet: pid, type: 'devis', numero: 'D-G2-AV2', libelle: 'Avenant 2', montant: 200 });
  await calme();
  await bdd.doc(`documents/${av2.json.id}`).update({ statut: 'accepte', reponse: { par: uidCollab, nom: 'Colin', cote: 'equipe', commentaire: '' } });
  await calme();
  verifier((await bdd.doc(`documents/${av2.json.id}`).get()).data().statut !== 'accepte', 'un collaborateur qui signe « équipe » est défait');
}

/* ------------------------------------------------------------------------ */
console.log('\n== 6 · Les invitations');
{
  const porte = (corps) => fetch(`${FONCTIONS}/suiviConnexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then((r) => r.json());
  const lien1 = await appelAdmin('creerInvitation', { projet: pid, email: COLLAB, envoyer: false });
  verifier(lien1.code === 200 && /\?i=/.test(lien1.json.lien), 'un lien d invitation se crée pour un interlocuteur actif', lien1.texte);
  const jeton1 = new URL(lien1.json.lien).searchParams.get('i');
  verifier((await porte({ action: 'invitation', jeton: jeton1 })).email === COLLAB, 'il pré-remplit son adresse');
  verifier(!(await bdd.doc(`invitations/${jeton1}`).get()).exists, 'le jeton n est pas l identifiant du document (seule son empreinte)');
  const lien2 = await appelAdmin('renvoyerInvitation', { projet: pid, email: COLLAB });
  const jeton2 = new URL(lien2.json.lien).searchParams.get('i');
  verifier((await porte({ action: 'invitation', jeton: jeton1 })).ok === false, 'renvoyer révoque le lien précédent');
  verifier((await porte({ action: 'invitation', jeton: jeton2 })).ok === true, 'le nouveau lien fonctionne');
  const horsProjet = await appelAdmin('creerInvitation', { projet: pid, email: 'inconnu.g2@exemple.test' });
  verifier(horsProjet.code === 409, `pas de lien pour qui n a pas d accès au projet : 409 (${horsProjet.code})`);
  const rev = await appelAdmin('revoquerInvitation', { jeton: jeton2 });
  verifier(rev.code === 200 && (await porte({ action: 'invitation', jeton: jeton2 })).ok === false, 'un lien révoqué ne pré-remplit plus');
  const lien3 = await appelAdmin('renvoyerInvitation', { projet: pid, email: COLLAB });
  const jeton3 = new URL(lien3.json.lien).searchParams.get('i');
  const { idDe } = require('../invitations.js');
  await bdd.doc(`invitations/${idDe(jeton3)}`).update({ expire: new Date(Date.now() - 1000) });
  verifier((await porte({ action: 'invitation', jeton: jeton3 })).ok === false, 'un lien expiré ne pré-remplit plus');
  /* La consommation : une connexion réussie accepte l'invitation. */
  const lien4 = await appelAdmin('renvoyerInvitation', { projet: pid, email: COLLAB });
  const jeton4 = new URL(lien4.json.lien).searchParams.get('i');
  await Promise.all(['connexions', 'connexionsIp'].map(async (c) => { for (const d of (await bdd.collection(c).get()).docs) await d.ref.delete(); }));
  await porte({ action: 'demanderCode', email: COLLAB });
  await calme();
  const code = (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.map((d) => d.data()).filter((d) => d.a[0].email === COLLAB).pop();
  const v = await porte({ action: 'verifierCode', email: COLLAB, code: code && code.variables.code });
  verifier(v.ok === true && v.espace === 'hub', `le collaborateur se connecte avec son code et va vers le Hub (${v.espace})`, JSON.stringify(v).slice(0, 120));
  verifier((await porte({ action: 'invitation', jeton: jeton4 })).ok === false, 'après la connexion, l invitation est consommée : le lien ne pré-remplit plus');
  const i = (await bdd.doc(`projets/${pid}/interlocuteurs/${require('../commun.js').cleEmail(COLLAB)}`).get()).data();
  verifier(i.invitation.etat === 'acceptee', 'et le cockpit le voit « a rejoint l espace »');
}

/* ------------------------------------------------------------------------ */
console.log('\n== 7 · La porte d entrée par code lit l état ACTUEL');
{
  const porte = (corps) => fetch(`${FONCTIONS}/suiviConnexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then(async (r) => ({ code: r.status, ...(await r.json()) }));
  await Promise.all(['connexions', 'connexionsIp'].map(async (c) => { for (const d of (await bdd.collection(c).get()).docs) await d.ref.delete(); }));
  const uidAgent = await uidDe(NOUVEL_AGENT);
  /* Un code demandé AVANT la désactivation ne rouvre pas la porte après. */
  await porte({ action: 'demanderCode', email: NOUVEL_AGENT });
  await calme();
  const code = (await bdd.collection('envois').where('modele', '==', 'code').get()).docs.map((d) => d.data()).filter((d) => d.a[0].email === NOUVEL_AGENT).pop();
  await appelAdmin('desactiverEquipe', { uid: uidAgent });
  const v = await porte({ action: 'verifierCode', email: NOUVEL_AGENT, code: code && code.variables.code });
  verifier(v.code === 403 && !v.lien && /désactivé/.test(v.message || ''), `un code valide ne rouvre pas un compte désactivé depuis : 403 (${v.code})`, v.message);
  const avant = (await bdd.collection('envois').where('modele', '==', 'code').get()).size;
  const d = await porte({ action: 'demanderCode', email: NOUVEL_AGENT });
  await calme();
  verifier(d.ok === true && (await bdd.collection('envois').where('modele', '==', 'code').get()).size === avant, 'désactivé : aucun code ne part, et la réponse ne le dit pas (comme une adresse inconnue)');
  await appelAdmin('reactiverEquipe', { uid: uidAgent });
  /* Un client retiré de tout n'a plus de porte. */
  await appelAdmin('retirerInterlocuteur', { projet: pid, email: COLLAB });
  const avant2 = (await bdd.collection('envois').where('modele', '==', 'code').get()).size;
  await porte({ action: 'demanderCode', email: COLLAB });
  await calme();
  verifier((await bdd.collection('envois').where('modele', '==', 'code').get()).size === avant2, 'un client retiré de tous ses projets ne reçoit plus de code');
}

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
