/* ==========================================================================
   CAPMEDIA CLIENT HUB · migration « identités et accès » (Gate 2)

   Le modèle d'avant donnait l'accès par des listes posées à la main
   (projets.membres, organisations.membres) et écrivait aux adresses de la
   fiche (contact, client, organisation). La Gate 2 fonde l'accès sur les
   INTERLOCUTEURS d'un projet (projets/{p}/interlocuteurs), avec un rôle
   (responsable ou collaborateur), sépare « ouvert au client » et « e-mails
   au client », et réserve la finance à qui la gère.

   Les unités, dans cet ordre (chacune est un lot atomique, journalisé) :
     1. projet    (acces.planMigrationProjet, partagé avec le serveur) :
                  ouvert si un membre d'avant a encore un compte, fermé
                  sinon ; sourdine d'un projet ouvert => e-mails coupés ;
                  membres joignables => interlocuteurs actifs (responsable
                  si la société le dit propriétaire, sinon arbitrage
                  BLOQUANT, projet non converti) ; contacts => interlocuteurs
                  préparés SANS rôle ; membre sans compte => écarté, rien
                  recréé ; accès effectif recalculé, et la migration
                  VÉRIFIE qu'aucun membre joignable ne perd l'accès. Les
                  arbitrages d'après migration vont dans projetsInternes.
     2. organisation : ses membres deviennent ceux de ses projets (ils ne
                  donnent plus aucun accès ; ils permettent de lire la fiche
                  de sa société), et elle tient la liste de ses projets
                  (un agent lit la société de ses seuls projets).
     3. activité  : une ligne devis, facture ou paiement lisible par tout
                  client (« client ») devient « responsable ».
     4. étape     : le montant d'une étape de devis quitte l'étape pour
                  projets/{p}/montants/jalon-<id> (la finance seule).
     5. forfait   : le prix du contrat de maintenance, pour
                  projets/{p}/montants/maintenance.
     6. budget    : budget et note de projetsInternes/{p} pour budgets/{p}.
     7. équipe    : une fiche sans « actif » était active ; elle le devient
                  explicitement. Aucun rôle n'est changé.

   GARANTIES (éprouvées par migration-gate2.test.mjs et copie-prod-gate2) :
   - Déterministe : tout est parcouru trié par identifiant.
   - Rejouable : chaque unité ne s'écrit que si l'état d'avant est encore
     là ; un second passage n'écrit rien.
   - Reprenable : coupée n'importe où (--arreter-apres=N, banc seulement),
     relancée, elle aboutit au même état qu'une traite.
   - Silencieuse : aucune lettre, aucune notification, aucune activité.
   - Réversible : chaque unité consigne l'avant dans
     migrationGate2/{passage}/unites/{n} ; « --annuler » défait le dernier
     passage, « --annuler --tout » tous, du plus récent au plus ancien. Le
     retour arrière REFUSE (code 5) si un accès écrit par la migration a
     changé depuis (un accès donné ou retiré par l'équipe) : --forcer.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait.
     node fonctions-suivi/outils/migrer-gate2.mjs                       (lecture seule, adresses masquées)
     node fonctions-suivi/outils/migrer-gate2.mjs --montrer-adresses    (lecture seule, adresses en clair)
     node fonctions-suivi/outils/migrer-gate2.mjs --vrai                (émulateur seulement)
     node fonctions-suivi/outils/migrer-gate2.mjs --vrai --production   (PRODUCTION, sur ordre explicite)
     ... --annuler [--passage=ID | --tout] [--forcer]
   Code de sortie : 0 conforme ; 4 si un arbitrage BLOQUANT reste (un
   projet n'est pas converti : ne pas déployer les règles).
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
/* La coupure simulée : le banc seulement, jamais la production. */
const ARRETER_APRES = valeur('--arreter-apres') === '' ? null : Number(valeur('--arreter-apres'));

if ((VRAI || ANNULER) && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}
if (ARRETER_APRES !== null && !SUR_EMULATEUR) { console.error('--arreter-apres est réservé au banc.'); process.exit(2); }
if (SUR_EMULATEUR && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Firestore est émulé mais Auth ne l est pas : FIREBASE_AUTH_EMULATOR_HOST requis.');
  process.exit(2);
}
if (!SUR_EMULATEUR) console.log(`\n!!! Base de PRODUCTION ${PROJET}${VRAI || ANNULER ? ' : ÉCRITURE' : ' : lecture seule'} !!!\n`);

initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const require = createRequire(import.meta.url);
const acces = require('../acces.js');
const ABSENT = '__absent__';

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

/* Ce qui a bougé depuis la migration, sur ce qu'elle a écrit de l'accès :
   défaire écraserait un geste fait depuis (un accès donné, ou RETIRÉ). */
async function derives(unites) {
  const conflits = [];
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : (v === undefined ? null : v));
  const egal = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  for (const u of unites) {
    const j = u.data();
    const actuel = (await bdd.doc(j.chemin).get()).data() || {};
    for (const [k, v] of Object.entries(j.apres || {})) {
      const a = Array.isArray(v) ? [...v].sort() : v; const b = Array.isArray(actuel[k]) ? [...actuel[k]].sort() : actuel[k];
      if (!egal(a, b)) conflits.push(`${j.id} : « ${k} » a changé depuis la migration`);
    }
    for (const cle of j.interlocuteursCrees || []) {
      const i = (await bdd.doc(`${j.chemin}/interlocuteurs/${cle}`).get()).data();
      if (i && (i.statut !== 'actif' || (i.invitation || {}).etat === 'envoyee')) conflits.push(`${j.id} : un interlocuteur créé par la migration a été modifié depuis`);
    }
    if (/^projet-/.test(j.id)) {
      const ajoutes = (await bdd.collection(`${j.chemin}/interlocuteurs`).get()).docs.filter((d) => !(j.interlocuteursCrees || []).includes(d.id) && d.data().ajoute && d.data().origine !== 'migration-membre' && d.data().origine !== 'migration-contact');
      if (ajoutes.length) conflits.push(`${j.id} : ${ajoutes.length} interlocuteur(s) ajouté(s) depuis la migration`);
    }
  }
  return conflits;
}

async function annulerPassage(passage) {
  const unites = (await passage.ref.collection('unites').get()).docs
    .sort((a, b) => Number(b.data().rang || 0) - Number(a.data().rang || 0));
  for (const u of unites) {
    const j = u.data();
    const lot = bdd.batch();
    const retour = {};
    for (const [champ, avant] of Object.entries(j.avant || {})) retour[champ] = avant === ABSENT ? FieldValue.delete() : avant;
    /* « update », pas « set merge » : un champ carte (roles) doit revenir
       tel quel, pas fusionné avec ce qui a été écrit depuis. */
    if (Object.keys(retour).length) lot.update(bdd.doc(j.chemin), retour);
    for (const autre of j.autres || []) {
      const r = {};
      for (const [champ, avant] of Object.entries(autre.avant || {})) r[champ] = avant === ABSENT ? FieldValue.delete() : avant;
      if (Object.keys(r).length) lot.update(bdd.doc(autre.chemin), r);
    }
    for (const c of j.crees || []) lot.delete(bdd.doc(c));
    for (const cle of j.interlocuteursCrees || []) lot.delete(bdd.doc(`${j.chemin}/interlocuteurs/${cle}`));
    await lot.commit();
  }
  await passage.ref.update({ annule: true, annuleLe: FieldValue.serverTimestamp() });
  return unites.length;
}

if (ANNULER) {
  const voulu = valeur('--passage');
  const passages = (await bdd.collection('migrationGate2').get()).docs
    .filter((d) => d.data().mode === 'vrai' && !d.data().annule)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const cibles = arg('--tout') ? passages : [voulu ? passages.find((d) => d.id === voulu) : passages[0]].filter(Boolean);
  if (!cibles.length) { console.log('Aucun passage à annuler.'); process.exit(0); }
  const conflits = [];
  for (const p of cibles) conflits.push(...await derives((await p.ref.collection('unites').get()).docs));
  if (conflits.length && !arg('--forcer')) {
    console.error(`Retour arrière REFUSÉ : ${conflits.length} accès ont changé depuis la migration. Le défaire écraserait ces gestes (un accès retiré reviendrait).`);
    for (const c of conflits.slice(0, 30)) console.error(`  - ${masquerTexte(c)}`);
    console.error('Tranchez chaque cas, ou relancez avec --forcer en connaissance de cause.');
    process.exit(5);
  }
  for (const p of cibles) console.log(`Passage ${p.id} annulé : ${await annulerPassage(p)} unité(s) remise(s) dans leur état d avant.`);
  process.exit(0);
}

/* ==========================================================================
   Le plan et son écriture
   ========================================================================== */

const passage = `g2-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const refPassage = bdd.doc(`migrationGate2/${passage}`);
const bilan = {
  projets: 0, dejaConvertis: 0, convertis: 0, nonConvertis: 0, interlocuteurs: 0, ouverts: 0, fermes: 0, coupes: 0,
  membresSansCompte: 0, adressesAutreRole: 0, organisations: 0, activitesReclassees: 0, montantsEtapes: 0,
  montantsForfait: 0, budgets: 0, equipeActivee: 0, unites: 0,
};
const arbitrages = [];
const apresMigration = [];
let rang = 0;

if (VRAI) await refPassage.set({ mode: 'vrai', debut: FieldValue.serverTimestamp(), projet: PROJET });

/** Écrit une unité (ses opérations et son journal) d'un seul lot. */
async function unite(id, { chemin, avant = {}, apres = {}, crees = [], interlocuteursCrees = [], autres = [] }, operations) {
  bilan.unites += 1;
  if (!VRAI) return;
  if (ARRETER_APRES !== null && rang >= ARRETER_APRES) {
    console.log(`\nCoupure simulée après ${rang} unité(s).`);
    process.exit(3);
  }
  rang += 1;
  const lot = bdd.batch();
  operations(lot);
  lot.set(refPassage.collection('unites').doc(String(rang).padStart(5, '0')), {
    id, rang, chemin, avant, apres, crees, interlocuteursCrees, autres, le: FieldValue.serverTimestamp(),
  });
  await lot.commit();
}

const lireComptes = async (uids) => {
  const comptes = {};
  for (const uid of uids) {
    try { comptes[uid] = (await getAuth().getUser(uid)).email || ''; } catch (err) { comptes[uid] = ''; }
  }
  return comptes;
};
const avantDe = (source, cles) => Object.fromEntries(cles.map((k) => [k, k in source ? source[k] : ABSENT]));
const trier = (docs) => docs.slice().sort((a, b) => a.ref.path.localeCompare(b.ref.path));

const autresRoles = await acces.rolesDesAdresses();
const projets = trier((await bdd.collection('projets').get()).docs);
const organisations = new Map((await bdd.collection('organisations').get()).docs.map((d) => [d.id, d.data()]));
const membresApres = new Map();

/* --- 1. Les projets ------------------------------------------------------ */
for (const doc of projets) {
  bilan.projets += 1;
  const p = doc.data();
  const org = p.organisation ? organisations.get(String(p.organisation)) || null : null;
  const comptes = await lireComptes(p.membres || []);
  const plan = acces.planMigrationProjet(p, org, comptes, autresRoles);
  if (plan.deja) { bilan.dejaConvertis += 1; membresApres.set(doc.id, p.membres || []); continue; }

  for (const a of plan.arbitrages) arbitrages.push(`projet ${court(doc.id)}${p.interne ? ' (interne)' : ''} : ${masquerTexte(a)}`);

  const existants = new Map((await doc.ref.collection('interlocuteurs').get()).docs.map((d) => [d.id, d.data()]));
  const aCreer = plan.interlocuteurs.filter((i) => !existants.has(i.cle));

  /* L'accès effectif d'après, avec les interlocuteurs tels qu'ils seront.
     Un membre JOIGNABLE qui le perdrait suspend la conversion ; un membre
     sans compte n'avait déjà plus aucun accès possible. */
  const apresProjet = { ...p, ...plan.champs };
  const effectif = acces.planAcces(apresProjet, [...existants.values(), ...aCreer.map((i) => i.fiche)]);
  const perdants = (p.membres || []).filter((u) => !plan.orphelins.includes(u) && !effectif.membres.includes(u));
  const converti = plan.champs.accesVersion === 2 && !perdants.length;
  if (plan.champs.accesVersion === 2 && perdants.length) {
    arbitrages.push(`projet ${court(doc.id)} : ${perdants.length} membre(s) perdraient l accès, conversion suspendue`);
  }

  const champs = { ...plan.champs };
  if (!converti) delete champs.accesVersion;
  if (converti) Object.assign(champs, { membres: effectif.membres, roles: effectif.roles, personnes: effectif.personnes, membresOrganisation: [] });
  membresApres.set(doc.id, converti ? effectif.membres : (p.membres || []));

  if (converti) bilan.convertis += 1; else bilan.nonConvertis += 1;
  if (champs.ouvert === true) bilan.ouverts += 1;
  if (champs.ouvert === false) bilan.fermes += 1;
  if (champs.emailsClient === 'coupes') bilan.coupes += 1;
  bilan.interlocuteurs += aCreer.length;
  bilan.membresSansCompte += plan.orphelins.length;
  bilan.adressesAutreRole += plan.apres.filter((x) => x.type === 'adresse-autre-role').length;
  for (const x of plan.apres) apresMigration.push(`projet ${court(doc.id)} : ${masquerTexte(x.detail)}`);
  const aDefinir = [...existants.values(), ...aCreer.map((i) => i.fiche)].filter((i) => i.statut === 'actif' && !acces.ROLES_CLIENT[i.role]).length;
  if (aDefinir) apresMigration.push(`projet ${court(doc.id)} : ${aDefinir} contact(s) sans rôle, préparé(s) sans aucun accès ; rôle à choisir dans le cockpit avant l'ouverture`);

  if (!Object.keys(champs).length && !aCreer.length) continue;
  const refInterne = bdd.doc(`projetsInternes/${doc.id}`);
  const interne = converti ? await refInterne.get() : null;
  const pourInterne = converti ? { rolesADefinir: aDefinir, ...(plan.apres.length ? { arbitragesAcces: plan.apres } : {}) } : {};
  /* Ce qui décide de l'accès, tel qu'écrit ici : le retour arrière vérifie
     que personne ne l'a changé depuis avant de le défaire. */
  const apresAcces = Object.fromEntries(['membres', 'roles', 'personnes', 'ouvert', 'emailsClient'].filter((k) => k in champs).map((k) => [k, champs[k]]));
  await unite(`projet-${doc.id}`, {
    chemin: doc.ref.path, avant: avantDe(p, Object.keys(champs)), apres: apresAcces, interlocuteursCrees: aCreer.map((i) => i.cle),
    crees: converti && !interne.exists ? [refInterne.path] : [],
    autres: converti && interne.exists ? [{ chemin: refInterne.path, avant: avantDe(interne.data(), Object.keys(pourInterne)) }] : [],
  }, (lot) => {
    if (Object.keys(champs).length) lot.update(doc.ref, { ...champs, maj: FieldValue.serverTimestamp() });
    for (const i of aCreer) lot.set(doc.ref.collection('interlocuteurs').doc(i.cle), { ...i.fiche, ajoute: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
    if (converti) lot.set(refInterne, pourInterne, { merge: true });
  });
}

/* --- 2. Les organisations ------------------------------------------------ */
for (const [orgId, org] of [...organisations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const siens = projets.filter((d) => String(d.data().organisation || '') === orgId);
  const voulus = [...new Set(siens.flatMap((d) => membresApres.get(d.id) || []))].sort();
  const ids = siens.map((d) => d.id).sort();
  const actuels = (org.membres || []).slice().sort();
  const projetsActuels = (org.projets || []).slice().sort();
  if (JSON.stringify(voulus) === JSON.stringify(actuels) && JSON.stringify(ids) === JSON.stringify(projetsActuels)) continue;
  bilan.organisations += 1;
  const ref = bdd.doc(`organisations/${orgId}`);
  await unite(`organisation-${orgId}`, { chemin: ref.path, avant: avantDe(org, ['membres', 'projets']), apres: { membres: voulus, projets: ids } }, (lot) => {
    lot.update(ref, { membres: voulus, projets: ids, maj: FieldValue.serverTimestamp() });
  });
}

/* --- 3. L'activité financière -------------------------------------------- */
const FINANCE = ['devis', 'facture', 'paiement'];
for (const d of trier((await bdd.collection('activite').where('type', 'in', FINANCE).get()).docs)) {
  if (d.data().visibilite !== 'client') continue;
  bilan.activitesReclassees += 1;
  await unite(`activite-${d.id}`, { chemin: d.ref.path, avant: { visibilite: 'client' } }, (lot) => {
    lot.update(d.ref, { visibilite: 'responsable' });
  });
}

/* --- 4 et 5. Les montants : étapes de devis, forfait ---------------------
   Un montant encore sur l'étape (ou le contrat) alors que sa place à part
   existe déjà : l'ancien écran l'a réécrit pendant la bascule, après le
   premier passage. C'est donc la valeur la plus récente : on la reprend
   (la passe de rattrapage), en consignant ce qu'elle remplace. */
const deplacer = async (id, source, cible, projetId, champsAvant, champsCible, apresMigration) => {
  const existant = await cible.get();
  const avantCible = existant.exists ? existant.data() : null;
  const valeurCible = champsCible();
  if (avantCible) apresMigration.push(`projet ${court(projetId)} : ${id} réécrit par l'ancien écran pendant la bascule, repris (${JSON.stringify(Object.fromEntries(Object.keys(valeurCible).filter((k) => k !== 'maj').map((k) => [k, avantCible[k]])))} remplacé)`);
  await unite(id, {
    chemin: source.ref.path, avant: avantDe(source.data(), champsAvant),
    crees: avantCible ? [] : [cible.path],
    autres: avantCible ? [{ chemin: cible.path, avant: avantDe(avantCible, Object.keys(valeurCible)) }] : [],
  }, (lot) => {
    lot.set(cible, valeurCible, { merge: true });
    lot.update(source.ref, Object.fromEntries(champsAvant.map((k) => [k, FieldValue.delete()])));
  });
};
for (const projet of projets) {
  for (const j of trier((await projet.ref.collection('jalons').get()).docs)) {
    if (!('montant' in j.data())) continue;
    const m = j.data().montant;
    bilan.montantsEtapes += 1;
    await deplacer(`jalon-${projet.id}-${j.id}`, j, projet.ref.collection('montants').doc(`jalon-${j.id}`), projet.id, ['montant'],
      () => ({ projet: projet.id, montant: m === null || m === undefined ? null : Number(m), maj: FieldValue.serverTimestamp() }), apresMigration);
  }
  const contrat = await projet.ref.collection('maintenance').doc('contrat').get();
  if (contrat.exists && 'montant' in contrat.data()) {
    const m = contrat.data().montant;
    bilan.montantsForfait += 1;
    await deplacer(`forfait-${projet.id}`, contrat, projet.ref.collection('montants').doc('maintenance'), projet.id, ['montant'],
      () => ({ projet: projet.id, montant: m === null || m === undefined ? null : Number(m), maj: FieldValue.serverTimestamp() }), apresMigration);
  }
}

/* --- 6. Les budgets ------------------------------------------------------ */
for (const d of trier((await bdd.collection('projetsInternes').get()).docs)) {
  const i = d.data();
  const champs = ['budget', 'budgetNote'].filter((k) => k in i);
  if (!champs.length) continue;
  bilan.budgets += 1;
  await deplacer(`budget-${d.id}`, d, bdd.doc(`budgets/${d.id}`), d.id, champs,
    () => ({ budget: i.budget === undefined ? null : i.budget, budgetNote: i.budgetNote || '', maj: FieldValue.serverTimestamp() }), apresMigration);
}

/* --- 7. L'équipe --------------------------------------------------------- */
for (const d of trier((await bdd.collection('equipe').get()).docs)) {
  const f = d.data();
  if (!acces.ROLES_EQUIPE[f.role]) arbitrages.push(`membre d équipe ${court(d.id)} (${masque(f.email)}) : rôle absent, admin ou agent à décider`);
  if (f.actif !== undefined) continue;
  bilan.equipeActivee += 1;
  await unite(`equipe-${d.id}`, { chemin: d.ref.path, avant: { actif: ABSENT }, apres: { actif: true } }, (lot) => {
    lot.update(d.ref, { actif: true, maj: FieldValue.serverTimestamp() });
  });
}

const bloquants = arbitrages.length;
if (VRAI) await refPassage.update({ fin: FieldValue.serverTimestamp(), bilan, arbitrages, apresMigration });

console.log(`\nMigration Gate 2 ${VRAI ? `écrite (passage ${passage})` : 'À BLANC : rien n a été écrit'}\n`);
for (const [k, n] of Object.entries(bilan)) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (bloquants) {
  console.log(`\nArbitrages BLOQUANTS (${bloquants}) : rien n a été deviné ; tant qu'ils restent, ne pas déployer les règles.`);
  for (const a of arbitrages) console.log(`  - ${a}`);
} else console.log('\nAucun arbitrage bloquant.');
if (apresMigration.length) {
  console.log(`\nÀ traiter après migration, dans le cockpit (${apresMigration.length}) : aucun accès n'a été donné.`);
  for (const a of apresMigration) console.log(`  - ${a}`);
}
process.exit(bloquants ? 4 : 0);
