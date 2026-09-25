/* ==========================================================================
   CAPMEDIA CLIENT HUB · migration « identités et accès » (Gate 2)

   Le modèle d'avant donnait l'accès par des listes posées à la main
   (projets.membres, organisations.membres) et écrivait aux adresses de la
   fiche (contact, client, organisation). La Gate 2 fonde l'accès sur les
   INTERLOCUTEURS d'un projet (projets/{p}/interlocuteurs), avec un rôle
   (responsable ou collaborateur), et sépare deux réglages : « ouvert au
   client » et « e-mails au client ».

   Ce que fait la migration, projet par projet (acces.planMigrationProjet,
   partagé avec le serveur) :
     1. « ouvert » : vrai si quelqu'un est déjà membre (ouvert de fait),
        faux s'il n'y a personne et que le projet était en sourdine ou sans
        adresse. Un projet sans membre, hors sourdine, avec une adresse,
        est un ARBITRAGE : le fermer change ce qu'il envoie.
     2. « emailsClient » : la sourdine d'un projet ouvert devient « coupés ».
     3. chaque membre devient un interlocuteur actif, responsable si la
        société le dit propriétaire ; sinon, ARBITRAGE, et le projet n'est
        pas converti (personne ne perd son accès sur une supposition) ;
     4. les adresses de contact qui ne sont pas membres deviennent des
        interlocuteurs préparés (rien n'est envoyé), rôle à décider ;
     5. l'accès effectif (membres, roles, personnes) est recalculé, et la
        migration VÉRIFIE qu'aucun membre d'avant ne le perd.
   Puis l'équipe : une fiche sans « actif » était active (l'ancien test
   était « actif != false ») ; elle le devient explicitement, parce que les
   nouvelles règles exigent « actif == true ». Une fiche sans rôle est un
   arbitrage.

   GARANTIES (éprouvées par migration-gate2.test.mjs) :
   - Déterministe : même base, même plan.
   - Rejouable : un projet converti (accesVersion 2) n'est pas retouché ;
     un second passage n'écrit rien.
   - Atomique par projet : un lot porte la fiche, ses interlocuteurs et le
     journal.
   - Silencieuse : aucune lettre, aucune notification, aucune ligne
     d'activité. Aucun déclencheur n'écoute les interlocuteurs, et ceux du
     projet ne réagissent pas aux champs posés ici.
   - Réversible : chaque unité consigne les valeurs d'avant dans
     migrationGate2/{passage}/unites/{id} ; « --annuler » les remet.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait.
     node fonctions-suivi/outils/migrer-gate2.mjs                       (lecture seule, adresses masquées)
     node fonctions-suivi/outils/migrer-gate2.mjs --montrer-adresses    (lecture seule, adresses en clair)
     node fonctions-suivi/outils/migrer-gate2.mjs --vrai                (émulateur seulement)
     node fonctions-suivi/outils/migrer-gate2.mjs --vrai --production   (PRODUCTION, sur ordre explicite)
     ... --annuler [--passage=ID]    défait le dernier passage (ou celui-là)
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=')[1] || '';
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = arg('--annuler');
const MONTRER = arg('--montrer-adresses');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

if ((VRAI || ANNULER) && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}
if (SUR_EMULATEUR && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Firestore est émulé mais Auth ne l est pas : FIREBASE_AUTH_EMULATOR_HOST requis.');
  process.exit(2);
}
if (!SUR_EMULATEUR) console.log(`\n!!! Base de PRODUCTION ${PROJET}${VRAI || ANNULER ? ' : ÉCRITURE' : ' : lecture seule'} !!!\n`);

initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const require = createRequire(import.meta.url);
const acces = require('../acces.js');

const masque = (email) => {
  if (MONTRER || !email) return email || '';
  const [, domaine = ''] = String(email).split('@');
  const empreinte = crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 6);
  return `${empreinte}@${/exemple\.test|essai\.test|capmedia/.test(domaine) ? domaine : '*'}`;
};
const masquerTexte = (t) => String(t)
  .replace(/[^\s@,;:()]+@[^\s@,;:()]+/g, (e) => masque(e))
  .replace(/\b[A-Za-z0-9]{28}\b/g, (u) => (MONTRER ? u : `compte ${crypto.createHash('sha256').update(u).digest('hex').slice(0, 6)}`));
const court = (id) => (MONTRER || SUR_EMULATEUR ? id : crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 6));

/* ==========================================================================
   Le retour arrière
   ========================================================================== */

if (ANNULER) {
  const voulu = valeur('--passage');
  const passages = (await bdd.collection('migrationGate2').get()).docs
    .filter((d) => d.data().mode === 'vrai' && !d.data().annule)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const passage = voulu ? passages.find((d) => d.id === voulu) : passages[0];
  if (!passage) { console.log('Aucun passage à annuler.'); process.exit(0); }
  const unites = (await passage.ref.collection('unites').get()).docs;
  let n = 0;
  for (const u of unites) {
    const j = u.data();
    const lot = bdd.batch();
    const ref = bdd.doc(j.chemin);
    const retour = {};
    for (const [champ, avant] of Object.entries(j.avant || {})) retour[champ] = avant === '__absent__' ? FieldValue.delete() : avant;
    if (Object.keys(retour).length) lot.update(ref, retour);
    for (const cle of j.interlocuteursCrees || []) lot.delete(bdd.doc(`${j.chemin}/interlocuteurs/${cle}`));
    await lot.commit();
    n += 1;
  }
  await passage.ref.update({ annule: true, annuleLe: FieldValue.serverTimestamp() });
  console.log(`Passage ${passage.id} annulé : ${n} unité(s) remise(s) dans leur état d avant.`);
  process.exit(0);
}

/* ==========================================================================
   Le plan
   ========================================================================== */

const passage = `g2-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const refPassage = bdd.doc(`migrationGate2/${passage}`);
const bilan = { projets: 0, dejaConvertis: 0, convertis: 0, interlocuteurs: 0, ouverts: 0, fermes: 0, coupes: 0, equipeActivee: 0, arbitrages: 0, unites: 0 };
const arbitrages = [];

const lireComptes = async (uids) => {
  const comptes = {};
  for (const uid of uids) {
    try { comptes[uid] = (await getAuth().getUser(uid)).email || ''; } catch (err) { comptes[uid] = ''; }
  }
  return comptes;
};

if (VRAI) await refPassage.set({ mode: 'vrai', debut: FieldValue.serverTimestamp(), projet: PROJET });

const projets = (await bdd.collection('projets').get()).docs.sort((a, b) => a.id.localeCompare(b.id));
const organisations = new Map((await bdd.collection('organisations').get()).docs.map((d) => [d.id, d.data()]));

for (const doc of projets) {
  bilan.projets += 1;
  const p = doc.data();
  const org = p.organisation ? organisations.get(String(p.organisation)) || null : null;
  const plan = acces.planMigrationProjet(p, org, await lireComptes(p.membres || []));
  if (plan.deja) { bilan.dejaConvertis += 1; continue; }

  for (const a of plan.arbitrages) arbitrages.push(`projet ${court(doc.id)}${p.interne ? ' (interne)' : ''} : ${masquerTexte(a)}`);

  /* Les interlocuteurs à créer (jamais écrasés s'ils existent). */
  const existants = new Set((await doc.ref.collection('interlocuteurs').get()).docs.map((d) => d.id));
  const aCreer = plan.interlocuteurs.filter((i) => !existants.has(i.cle));

  /* L'accès effectif d'après : on le calcule avec les interlocuteurs tels
     qu'ils seront, et on refuse de convertir si un membre d'avant le perd. */
  const apresProjet = { ...p, ...plan.champs };
  const tous = [...(await doc.ref.collection('interlocuteurs').get()).docs.map((d) => d.data()), ...aCreer.map((i) => i.fiche)];
  const effectif = acces.planAcces(apresProjet, tous);
  const perdants = (p.membres || []).filter((u) => !effectif.membres.includes(u));
  const converti = plan.champs.accesVersion === 2 && !perdants.length;
  if (plan.champs.accesVersion === 2 && perdants.length) {
    arbitrages.push(`projet ${court(doc.id)} : ${perdants.length} membre(s) perdraient l accès, conversion suspendue`);
  }

  const champs = { ...plan.champs };
  if (!converti) delete champs.accesVersion;
  if (converti) Object.assign(champs, { membres: effectif.membres, roles: effectif.roles, personnes: effectif.personnes, membresOrganisation: [] });

  /* Les valeurs d'avant, pour le retour arrière. */
  const avant = {};
  for (const k of Object.keys(champs)) avant[k] = k in p ? p[k] : '__absent__';

  if (champs.ouvert === true) bilan.ouverts += 1;
  if (champs.ouvert === false) bilan.fermes += 1;
  if (champs.emailsClient === 'coupes') bilan.coupes += 1;
  bilan.interlocuteurs += aCreer.length;
  if (converti) bilan.convertis += 1;

  if (!Object.keys(champs).length && !aCreer.length) continue;
  bilan.unites += 1;
  if (!VRAI) continue;
  const lot = bdd.batch();
  if (Object.keys(champs).length) lot.update(doc.ref, { ...champs, maj: FieldValue.serverTimestamp() });
  for (const i of aCreer) lot.set(doc.ref.collection('interlocuteurs').doc(i.cle), { ...i.fiche, ajoute: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
  lot.set(refPassage.collection('unites').doc(`projet-${doc.id}`), {
    chemin: doc.ref.path, avant, interlocuteursCrees: aCreer.map((i) => i.cle), le: FieldValue.serverTimestamp(),
  });
  await lot.commit();
}

/* L'équipe : l'ancienne règle disait « actif sauf faux », la nouvelle
   exige « actif vrai ». Une fiche sans rôle ne se devine pas. */
for (const d of (await bdd.collection('equipe').get()).docs) {
  const f = d.data();
  if (!acces.ROLES_EQUIPE[f.role]) arbitrages.push(`membre d équipe ${court(d.id)} (${masque(f.email)}) : rôle absent, admin ou agent à décider`);
  if (f.actif === undefined) {
    bilan.equipeActivee += 1; bilan.unites += 1;
    if (VRAI) {
      const lot = bdd.batch();
      lot.update(d.ref, { actif: true, maj: FieldValue.serverTimestamp() });
      lot.set(refPassage.collection('unites').doc(`equipe-${d.id}`), { chemin: d.ref.path, avant: { actif: '__absent__' }, interlocuteursCrees: [], le: FieldValue.serverTimestamp() });
      await lot.commit();
    }
  }
}

bilan.arbitrages = arbitrages.length;
if (VRAI) await refPassage.update({ fin: FieldValue.serverTimestamp(), bilan, arbitrages });

console.log(`\nMigration Gate 2 ${VRAI ? `écrite (passage ${passage})` : 'À BLANC : rien n a été écrit'}\n`);
for (const [k, n] of Object.entries(bilan)) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (arbitrages.length) {
  console.log(`\nArbitrages humains (${arbitrages.length}) : rien n a été deviné, ces points attendent une décision.`);
  for (const a of arbitrages) console.log(`  - ${a}`);
} else console.log('\nAucun arbitrage humain nécessaire.');
process.exit(0);
