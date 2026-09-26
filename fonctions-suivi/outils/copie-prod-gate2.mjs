/* ==========================================================================
   CAPMEDIA CLIENT HUB · la migration Gate 2 sur une copie de la production

   Deux temps, jamais mélangés :

   1. RELEVER (lecture seule de la production) : la structure dont la
      migration a besoin, rien de plus, écrite dans un fichier HORS du
      dépôt. Les adresses et les noms y sont pseudonymisés de façon stable
      (la même adresse donne toujours le même pseudonyme) : on garde les
      relations (qui est membre de quoi, quelle adresse porte quel rôle),
      on ne garde pas les personnes. Les identifiants techniques (uid,
      projets) restent : ce sont eux que la migration relie.
        node fonctions-suivi/outils/copie-prod-gate2.mjs --relever=<fichier.json>

   2. REJOUER (émulateurs seulement) : la copie est posée dans un banc
      vide (déclencheurs coupés pendant la pose), puis :
        - compteurs avant ;
        - migration réelle, puis seconde passe (0 unité attendue) ;
        - compteurs après, et les invariants d'accès (aucun client n'hérite
          des projets de sa société, aucun contact à définir n'a d'accès,
          aucun compte inventé, les administrateurs restent, aucun agent
          n'a la finance, aucun testeur ne change de famille, aucune
          adresse n'a deux rôles) ;
        - coupée au début, à 25, 50, 75 % et juste avant la fin, puis
          reprise : même état qu'une traite ;
        - annulée : retour à la copie d'origine.
        node fonctions-suivi/outils/copie-prod-gate2.mjs --rejouer=<fichier.json> [--suivis=2cdec5,c88127]

   La sortie ne montre jamais une adresse ni un nom : des empreintes.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { barriere, verrouSemis } from './lib/barriere.mjs';

const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const RELEVER = valeur('--relever');
const REJOUER = valeur('--rejouer');
const SUIVIS = (valeur('--suivis') || '').split(',').filter(Boolean);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const empreinte = (x, n = 6) => crypto.createHash('sha256').update(String(x)).digest('hex').slice(0, n);
const norm = (e) => String(e || '').trim().toLowerCase();

if (!RELEVER === !REJOUER) { console.error('Un seul mode : --relever=<fichier> ou --rejouer=<fichier>.'); process.exit(2); }
if (RELEVER && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)) { console.error('--relever lit la production : sans variables d émulateur.'); process.exit(2); }
if (RELEVER && /Capmedia\/plateforme/.test(RELEVER)) { console.error('Le relevé ne s écrit pas dans le dépôt.'); process.exit(2); }
if (REJOUER && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)) { console.error('--rejouer : émulateurs seulement.'); process.exit(2); }

initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const auth = getAuth();

/* ==========================================================================
   1. Relever (lecture seule)
   ========================================================================== */
if (RELEVER) {
  const pseudo = (e) => (e ? `p-${empreinte(norm(e), 10)}@exemple.test` : e);
  const nom = (x) => (x ? `Personne ${empreinte(x, 4)}` : x);
  const tampon = (v) => (v && typeof v.toDate === 'function' ? { __ts: v.toDate().toISOString() } : v);
  const releve = { le: new Date().toISOString(), projet: PROJET, comptes: [], docs: {} };
  const poser = (chemin, d) => { releve.docs[chemin] = d; };

  for (const u of (await auth.listUsers(1000)).users) releve.comptes.push({ uid: u.uid, email: pseudo(u.email), disabled: Boolean(u.disabled) });
  for (const d of (await bdd.collection('equipe').get()).docs) {
    const f = d.data();
    poser(d.ref.path, { nom: nom(f.nom), email: pseudo(f.email), role: f.role, ...('actif' in f ? { actif: f.actif } : {}), projets: f.projets || [], permissions: f.permissions || [] });
  }
  for (const d of (await bdd.collection('testeurs').get()).docs) {
    const f = d.data();
    poser(d.ref.path, { prenom: nom(f.prenom), email: pseudo(f.email), ...('actif' in f ? { actif: f.actif } : {}), projets: f.projets || [], plateformes: f.plateformes || [] });
  }
  for (const d of (await bdd.collection('organisations').get()).docs) {
    const o = d.data();
    poser(d.ref.path, { nom: nom(o.nom), entreprise: nom(o.entreprise), email: pseudo(o.email), membres: o.membres || [], roles: o.roles || {},
      contacts: (o.contacts || []).map((c) => ({ nom: nom(c.nom), email: pseudo(c.email), role: c.role || '', uid: c.uid || null })) });
  }
  for (const d of (await bdd.collection('projets').get()).docs) {
    const p = d.data();
    const garder = ['interne', 'membres', 'silence', 'ouvert', 'statut', 'archive', 'aFaire', 'organisation', 'accesVersion', 'emailsClient', 'roles', 'personnes', 'compteur'];
    const f = Object.fromEntries(garder.filter((k) => k in p).map((k) => [k, p[k]]));
    f.nom = `Projet ${empreinte(d.id)}`; f.ref = `P${empreinte(d.id).toUpperCase()}`;
    for (const k of ['cree', 'ouvertLe', 'premiereOuverture']) if (p[k]) f[k] = tampon(p[k]);
    if (p.client) f.client = { nom: nom(p.client.nom), email: pseudo(p.client.email), entreprise: nom(p.client.entreprise) };
    if (p.contacts) f.contacts = p.contacts.map((c) => ({ nom: nom(c.nom), email: pseudo(c.email) }));
    poser(d.ref.path, f);
    for (const j of (await d.ref.collection('jalons').get()).docs) {
      const x = j.data();
      poser(j.ref.path, { projet: d.id, titre: 'Étape', statut: x.statut || 'a-venir', ...(x.devis ? { devis: x.devis } : {}), ...('montant' in x ? { montant: x.montant } : {}), ordre: x.ordre || 0 });
    }
    const contrat = await d.ref.collection('maintenance').doc('contrat').get();
    if (contrat.exists) poser(contrat.ref.path, { genre: 'contrat', statut: contrat.data().statut || '', ...('montant' in contrat.data() ? { montant: contrat.data().montant } : {}) });
    for (const c of (await d.ref.collection('campagnes').get()).docs) poser(c.ref.path, { statut: c.data().statut || '', testeurs: c.data().testeurs || [] });
    for (const i of (await d.ref.collection('interlocuteurs').get()).docs) { const x = i.data(); poser(i.ref.path, { ...x, email: pseudo(x.email), nom: nom(x.nom) }); }
  }
  for (const d of (await bdd.collection('projetsInternes').get()).docs) {
    const x = d.data();
    poser(d.ref.path, { ...('sante' in x ? { sante: x.sante } : {}), ...('budget' in x ? { budget: x.budget } : {}), ...('budgetNote' in x ? { budgetNote: x.budgetNote ? 'note' : '' } : {}) });
  }
  for (const d of (await bdd.collection('activite').get()).docs) {
    const x = d.data();
    poser(d.ref.path, { projet: x.projet || null, type: x.type || '', visibilite: x.visibilite || null, texte: 'ligne', ...(x.date ? { date: tampon(x.date) } : {}) });
  }
  for (const c of ['documents', 'paiements', 'invitations']) {
    for (const d of (await bdd.collection(c).get()).docs) { const x = d.data(); poser(d.ref.path, { projet: x.projet || null, type: x.type || null, statut: x.statut || null }); }
  }
  writeFileSync(RELEVER, JSON.stringify(releve));
  console.log(`Relevé écrit hors du dépôt : ${Object.keys(releve.docs).length} documents, ${releve.comptes.length} comptes (adresses et noms pseudonymisés).`);
  process.exit(0);
}

/* ==========================================================================
   2. Rejouer (émulateurs)
   ========================================================================== */
const releve = JSON.parse(readFileSync(REJOUER, 'utf8'));
let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 300)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
const declencheurs = async (allumes) => { const r = await fetch(`http://${HUB}/functions/${allumes ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' }); if (!r.ok) throw new Error(`hub ${r.status}`); };
const migrer = (...args) => { const r = spawnSync(process.execPath, [new URL('./migrer-gate2.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8', env: process.env }); return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}` }; };
const unitesDe = (s) => Number(((s.split('\n').find((l) => /\bunites\b/.test(l)) || '').match(/(\d+)\s+unites/) || [])[1]);
const revivre = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? (v.__ts ? Timestamp.fromDate(new Date(v.__ts)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revivre(x)])))
  : Array.isArray(v) ? v.map(revivre) : v);

async function poserCopie() {
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
  } finally { await verrouSemis(bdd, false); await declencheurs(false); await declencheurs(true); }
  /* L'état est posé tel quel : la barrière prouve que tout ce qui était en
     file a été servi, puis on vérifie qu'aucun déclencheur ne l'a touché. */
  await barriere({ bdd });
  const n = (await bdd.collection('envois').count().get()).data().count + (await bdd.collectionGroup('notifications').count().get()).data().count;
  if (n) throw new Error(`la pose a produit ${n} lettre(s) ou notification(s)`);
}

const lireEtat = async () => {
  await barriere({ bdd });
  const docs = {};
  for (const c of ['projets', 'organisations', 'equipe', 'testeurs', 'projetsInternes', 'budgets', 'activite', 'invitations', 'envois']) {
    for (const d of (await bdd.collection(c).get()).docs) docs[d.ref.path] = d.data();
  }
  for (const g of ['interlocuteurs', 'jalons', 'montants', 'maintenance', 'notifications']) {
    for (const d of (await bdd.collectionGroup(g).get()).docs) docs[d.ref.path] = d.data();
  }
  const comptes = (await auth.listUsers(1000)).users.map((u) => ({ uid: u.uid, email: norm(u.email), disabled: u.disabled }));
  return { docs, comptes };
};
/* Une forme canonique : clés triées (l'ordre des champs rendus par
   Firestore n'est pas garanti), horodatages de service écartés. */
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? (typeof v.toMillis === 'function' ? { __ts: v.toMillis() } : Object.fromEntries(Object.keys(v).filter((k) => !['maj', 'ajoute'].includes(k)).sort().map((k) => [k, canon(v[k])])))
  : v);
const photo = (etat) => JSON.stringify(Object.keys(etat.docs).sort().map((k) => [k, canon(etat.docs[k])]));
const sous = (etat, re) => Object.entries(etat.docs).filter(([k]) => re.test(k));

const compter = (etat) => {
  const projets = sous(etat, /^projets\/[^/]+$/);
  const acces = projets.flatMap(([k, p]) => (p.membres || []).map((u) => `${u}@${k.split('/')[1]}`));
  const roles = {}; for (const [, p] of projets) for (const r of Object.values(p.roles || {})) roles[r] = (roles[r] || 0) + 1;
  const equipe = sous(etat, /^equipe\/[^/]+$/);
  return {
    comptes: etat.comptes.length,
    equipe: equipe.length,
    equipeActive: equipe.filter(([, f]) => f.actif === true).length,
    admins: equipe.filter(([, f]) => f.role === 'admin').length,
    permissionsDeleguees: equipe.reduce((n, [, f]) => n + (f.permissions || []).length, 0),
    organisations: sous(etat, /^organisations\/[^/]+$/).length,
    membresOrganisations: sous(etat, /^organisations\/[^/]+$/).reduce((n, [, o]) => n + (o.membres || []).length, 0),
    projets: projets.length,
    projetsOuverts: projets.filter(([, p]) => p.ouvert === true).length,
    projetsFermes: projets.filter(([, p]) => p.ouvert === false).length,
    projetsConvertis: projets.filter(([, p]) => p.accesVersion === 2).length,
    membres: projets.reduce((n, [, p]) => n + (p.membres || []).length, 0),
    accesProjet: acces.length,
    interlocuteurs: sous(etat, /\/interlocuteurs\//).length,
    interlocuteursSansRole: sous(etat, /\/interlocuteurs\//).filter(([, i]) => !['responsable', 'collaborateur'].includes(i.role)).length,
    roles: JSON.stringify(roles),
    invitations: sous(etat, /^invitations\//).length,
    testeurs: sous(etat, /^testeurs\/[^/]+$/).length,
    envois: sous(etat, /^envois\//).length,
    notifications: sous(etat, /\/notifications\//).length,
    activite: sous(etat, /^activite\//).length,
    activiteFinanciereClient: sous(etat, /^activite\//).filter(([, a]) => ['devis', 'facture', 'paiement'].includes(a.type) && a.visibilite === 'client').length,
    montantsSurEtapes: sous(etat, /\/jalons\//).filter(([, j]) => 'montant' in j).length,
    montantsAPart: sous(etat, /\/montants\//).length,
  };
};

/* ---- La passe de référence --------------------------------------------- */
await poserCopie();
const avant = await lireEtat();
const cAvant = compter(avant);
const premiere = migrer('--vrai');
const apres = await lireEtat();
const cApres = compter(apres);
const nUnites = unitesDe(premiere.sortie);
const seconde = migrer('--vrai');
const apres2 = await lireEtat();

console.log('\n== Compteurs, avant et après');
console.log('| Mesure | Avant | Après |\n|---|---|---|');
for (const k of Object.keys(cAvant)) console.log(`| ${k} | ${cAvant[k]} | ${cApres[k]} |`);
console.log(`\nPremière passe : code ${premiere.code}, ${nUnites} unités. Seconde passe : code ${seconde.code}, ${unitesDe(seconde.sortie)} unité.`);
for (const l of premiere.sortie.split('\n').filter((x) => /^\s+-\s/.test(x))) console.log(`  ${l.trim().replace(/[a-z0-9.+-]+@[a-z0-9.-]+/gi, (e) => `adresse ${empreinte(e)}`)}`);

console.log('\n== La migration');
verifier(premiere.code === 0, `aucun arbitrage bloquant (code ${premiere.code})`, premiere.sortie.slice(-500));
verifier(unitesDe(seconde.sortie) === 0 && photo(apres2) === photo(apres), 'seconde passe : zéro mutation utile, état identique');
verifier(cApres.envois === cAvant.envois && cApres.notifications === cAvant.notifications, `aucun e-mail, aucune notification (${cAvant.envois}/${cAvant.notifications})`);
verifier(cApres.activite === cAvant.activite && cApres.invitations === cAvant.invitations, 'aucune activité, aucune invitation créée');
verifier(cApres.comptes === cAvant.comptes && JSON.stringify(apres.comptes) === JSON.stringify(avant.comptes), 'aucun compte créé, supprimé ou modifié');

console.log('\n== Les accès réels après migration');
const projetsAvant = new Map(sous(avant, /^projets\/[^/]+$/).map(([k, p]) => [k.split('/')[1], p]));
const projetsApres = new Map(sous(apres, /^projets\/[^/]+$/).map(([k, p]) => [k.split('/')[1], p]));
const comptesExistants = new Set(avant.comptes.map((c) => c.uid));
let perdus = 0; let gagnes = 0;
for (const [id, p] of projetsApres) {
  const a = projetsAvant.get(id) || {};
  const avantJoignables = (a.membres || []).filter((u) => comptesExistants.has(u));
  perdus += avantJoignables.filter((u) => !(p.membres || []).includes(u)).length;
  gagnes += (p.membres || []).filter((u) => !(a.membres || []).includes(u)).length;
}
verifier(perdus === 0, `aucun membre joignable ne perd l accès à un de ses projets (${perdus})`);
verifier(gagnes === 0, `aucun accès nouveau : chaque client garde exactement ses projets et n hérite d aucun autre projet de sa société (${gagnes})`);
const sansRoleAvecAcces = sous(apres, /\/interlocuteurs\//).filter(([k, i]) => !['responsable', 'collaborateur'].includes(i.role) && i.uid && (projetsApres.get(k.split('/')[1]).membres || []).includes(i.uid));
verifier(sansRoleAvecAcces.length === 0, `aucun contact « à définir » n a d accès (${cApres.interlocuteursSansRole} contact(s) sans rôle)`);
const equipeAvant = new Map(sous(avant, /^equipe\/[^/]+$/).map(([k, f]) => [k, f]));
const adminsAvant = [...equipeAvant].filter(([, f]) => f.role === 'admin').map(([k]) => k);
verifier(adminsAvant.every((k) => apres.docs[k].role === 'admin' && apres.docs[k].actif === true), `les ${adminsAvant.length} administrateurs restent administrateurs, actifs`);
const agentsFinance = sous(apres, /^equipe\/[^/]+$/).filter(([, f]) => f.role === 'agent' && (f.permissions || []).some((x) => x.startsWith('finance.')));
verifier(agentsFinance.length === 0, 'aucun agent ne reçoit la finance');
const testeursUids = sous(apres, /^testeurs\/[^/]+$/).map(([k]) => k.split('/')[1]);
const testeursDevenus = testeursUids.filter((u) => [...projetsApres.values()].some((p) => (p.membres || []).includes(u)) || apres.docs[`equipe/${u}`]);
verifier(testeursDevenus.length === 0, 'aucun testeur ne devient client ou membre de l équipe');
const rolesParAdresse = new Map();
const ajouterRole = (email, role) => { if (!email) return; const e = norm(email); rolesParAdresse.set(e, new Set([...(rolesParAdresse.get(e) || []), role])); };
for (const [, f] of sous(apres, /^equipe\/[^/]+$/)) ajouterRole(f.email, 'equipe');
for (const [, f] of sous(apres, /^testeurs\/[^/]+$/)) if (f.actif !== false) ajouterRole(f.email, 'testeur');
for (const [, i] of sous(apres, /\/interlocuteurs\//)) if (i.statut === 'actif') ajouterRole(i.email, 'client');
const doubles = [...rolesParAdresse].filter(([, r]) => r.size > 1);
verifier(doubles.length === 0, `aucune adresse n a deux rôles principaux (${doubles.map(([e, r]) => `${empreinte(e)}:${[...r].join('+')}`).join(', ')})`);
verifier(cApres.activiteFinanciereClient === 0 && cApres.montantsSurEtapes === 0, 'plus aucune ligne financière lisible de tous, plus aucun montant sur une étape');

for (const s of SUIVIS) {
  const id = [...projetsApres.keys()].find((x) => empreinte(x) === s);
  if (!id) { verifier(false, `projet suivi ${s} introuvable`); continue; }
  const p = projetsApres.get(id); const a = projetsAvant.get(id);
  const i = sous(apres, new RegExp(`^projets/${id}/interlocuteurs/`)).map(([, x]) => x);
  const interne = apres.docs[`projetsInternes/${id}`] || {};
  console.log(`\n  projet ${s} : avant ouvert=${a.ouvert} membres=${(a.membres || []).length} (dont sans compte ${(a.membres || []).filter((u) => !comptesExistants.has(u)).length}) silence=${a.silence} ; après ouvert=${p.ouvert} membres=${(p.membres || []).length} emailsClient=${p.emailsClient} converti=${p.accesVersion === 2} ; interlocuteurs ${i.map((x) => `${x.role}/${x.statut}/${x.uid ? 'compte' : 'sans compte'}`).join(', ') || 'aucun'} ; arbitrages ${(interne.arbitragesAcces || []).map((x) => x.type).join(', ') || 'aucun'} ; rôles à choisir ${interne.rolesADefinir || 0}`);
  verifier(p.ouvert === false && (p.membres || []).length === 0 && p.accesVersion === 2, `projet ${s} : converti, fermé, personne n y entre`);
  verifier(i.every((x) => !x.uid || comptesExistants.has(x.uid)), `projet ${s} : aucun compte inventé`);
}

/* ---- Coupée puis reprise ----------------------------------------------- */
console.log('\n== Coupée, puis reprise');
const reference = photo(apres);
for (const n of [0, Math.floor(nUnites * 0.25), Math.floor(nUnites * 0.5), Math.floor(nUnites * 0.75), nUnites - 1]) {
  await poserCopie();
  const coupe = migrer('--vrai', `--arreter-apres=${n}`);
  const reprise = migrer('--vrai');
  const etat = await lireEtat();
  const c = compter(etat);
  verifier(coupe.code === 3 && reprise.code === 0 && photo(etat) === reference && c.envois === cAvant.envois && c.invitations === cAvant.invitations,
    `coupée après ${n}/${nUnites} unités, reprise : même état qu une traite, rien envoyé, aucun doublon`,
    `codes ${coupe.code}/${reprise.code} ; ${[...new Set([...Object.keys(apres.docs), ...Object.keys(etat.docs)])].filter((k) => JSON.stringify(canon(apres.docs[k] || null)) !== JSON.stringify(canon(etat.docs[k] || null))).slice(0, 5).join(', ')}`);
}

/* ---- Annulée ------------------------------------------------------------ */
console.log('\n== Annulée');
const annule = migrer('--annuler', '--tout');
const retour = await lireEtat();
const sansServ = (o) => JSON.stringify(o === undefined ? null : canon(o));
const ecartsRetour = [...new Set([...Object.keys(avant.docs), ...Object.keys(retour.docs)])].filter((k) => sansServ(avant.docs[k]) !== sansServ(retour.docs[k]));
verifier(annule.code === 0 && photo(retour) === photo(avant), '« --annuler --tout » rend la copie d origine, à l identique', `code ${annule.code} ; ${ecartsRetour.slice(0, 6).join(', ')}`);
for (const k of ecartsRetour.slice(0, 3)) console.log(`         ${k}\n           avant  ${JSON.stringify(avant.docs[k]).slice(0, 300)}\n           retour ${JSON.stringify(retour.docs[k]).slice(0, 300)}`);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
