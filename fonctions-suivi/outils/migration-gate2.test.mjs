/* ==========================================================================
   CAPMEDIA CLIENT HUB · la migration de la Gate 2 à l'épreuve

   Un jeu de données qui a les formes de la production (projets internes,
   projet ouvert de fait en sourdine, projets fermés, prospect hors
   sourdine, membre dont le compte a disparu, membre sans rôle déductible,
   adresse de contact qui est celle d'un testeur, fiche d'équipe sans
   « actif », activité financière lisible de tous, étape de devis et forfait
   qui portent leur montant, budget dans la fiche interne), puis :
     1. un passage à blanc n'écrit rien ;
     2. le passage réel applique les décisions du préflight, sans que
        personne de joignable ne perde un accès, et sans en donner aucun ;
     3. aucune lettre, aucune notification, aucune ligne d'activité, aucune
        invitation ;
     4. un second passage n'écrit rien (rejouable) ;
     5. « --annuler » remet tout comme avant ;
     6. coupée au début, à 25, 50 et 75 %, et juste avant la fin, puis
        relancée : le même état qu'une traite, sans doublon ; et
        « --annuler --tout » défait les passages morcelés.

     (émulateurs avec les fonctions : les déclencheurs doivent tourner,
      pour prouver qu'ils se taisent)
     node fonctions-suivi/outils/migration-gate2.test.mjs
   ========================================================================== */

import { barriere } from './lib/barriere.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { spawnSync } from 'node:child_process';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
const auth = getAuth();

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 300)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const migrer = (...args) => {
  const r = spawnSync(process.execPath, [new URL('./migrer-gate2.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8', env: process.env });
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}` };
};
const unitesDe = (sortie) => Number(((sortie.split('\n').find((l) => /\bunites\b/.test(l)) || '').match(/(\d+)\s+unites/) || [])[1]);
const compteurs = async () => {
  const [e, a, n, i] = await Promise.all([bdd.collection('envois').count().get(), bdd.collection('activite').count().get(), bdd.collectionGroup('notifications').count().get(), bdd.collection('invitations').count().get()]);
  return { envois: e.data().count, activite: a.data().count, notifications: n.data().count, invitations: i.data().count };
};
/* Attendre que les déclencheurs aient TOUT servi : une barrière (état
   observable), pas une durée au jugé (voir lib/barriere.mjs). */
const calme = () => barriere({ bdd });

/* ---- Les formes de la production ------------------------------------- */
const compte = async (email) => {
  try { return (await auth.getUserByEmail(email)).uid; } catch (e) { return (await auth.createUser({ email, emailVerified: true })).uid; }
};
const proprio = await compte('proprio.mg@exemple.test');
const inconnu = await compte('inconnu.mg@exemple.test');
const T = (iso) => Timestamp.fromDate(new Date(iso));
const IDS = ['mg-interne', 'mg-ouvert-sourdine', 'mg-ferme', 'mg-prospect', 'mg-compte-parti', 'mg-role-inconnu', 'mg-conflit'];

const semer = async () => {
  /* On repart de rien pour les documents du jeu (et seulement eux). */
  for (const id of IDS) {
    const ref = bdd.doc(`projets/${id}`);
    for (const sc of ['interlocuteurs', 'jalons', 'montants', 'maintenance']) for (const d of (await ref.collection(sc).get()).docs) await d.ref.delete();
    await ref.delete();
    await bdd.doc(`projetsInternes/${id}`).delete();
    await bdd.doc(`budgets/${id}`).delete();
  }
  for (const d of (await bdd.collection('activite').where('projet', 'in', IDS).get()).docs) await d.ref.delete();
  for (const d of (await bdd.collection('migrationGate2').get()).docs) {
    for (const u of (await d.ref.collection('unites').get()).docs) await u.ref.delete();
    await d.ref.delete();
  }
  await bdd.doc('organisations/mg-org').set({ nom: 'Société MG', membres: [proprio, inconnu, 'ancienMembreSansProjet000001'], roles: { [proprio]: 'owner' },
    contacts: [{ nom: 'Pia Proprio', email: 'proprio.mg@exemple.test', role: 'owner', uid: proprio }, { nom: 'Contact', email: 'contact.mg@exemple.test', role: 'member', uid: null }] });
  const projet = (id, d) => bdd.doc(`projets/${id}`).set({ nom: id, ref: id.toUpperCase().replace(/-/g, ''), statut: 'en-cours', compteur: 0, archive: false, cree: T('2026-06-01T09:00:00Z'), ...d });
  await projet('mg-interne', { interne: true, silence: true, membres: [] });
  await projet('mg-ouvert-sourdine', { organisation: 'mg-org', silence: true, membres: [proprio], client: { nom: 'Pia', email: 'proprio.mg@exemple.test' } });
  await projet('mg-ferme', { organisation: 'mg-org', silence: true, membres: [], contacts: [{ nom: 'Contact', email: 'contact.mg@exemple.test' }] });
  await projet('mg-prospect', { organisation: 'mg-org', membres: [], statut: 'prospect', client: { nom: 'Prospect', email: 'prospect.mg@exemple.test' } });
  await projet('mg-compte-parti', { organisation: 'mg-org', membres: ['compteQuiNexistePlusDuTout00'], client: { email: 'testeur.mg@essai.test' } });
  await projet('mg-role-inconnu', { organisation: 'mg-org', membres: [inconnu] });
  await projet('mg-conflit', { organisation: 'mg-org', membres: [], client: { email: 'testeur.mg@essai.test' } });
  await bdd.doc('testeurs/mg-testeur').set({ prenom: 'Tess', email: 'testeur.mg@essai.test', actif: true, projets: [] });
  await bdd.doc('equipe/mg-agent-sans-actif').set({ nom: 'Ancien format', email: 'ancien.mg@exemple.test', role: 'admin' });
  await bdd.doc('activite/mg-act-facture').set({ projet: 'mg-ouvert-sourdine', type: 'facture', texte: 'a déposé la facture F-1', visibilite: 'client', date: T('2026-07-01T09:00:00Z') });
  await bdd.doc('activite/mg-act-tache').set({ projet: 'mg-ouvert-sourdine', type: 'tache', texte: 'a terminé une tâche', visibilite: 'client', date: T('2026-07-01T09:00:00Z') });
  await bdd.doc('projets/mg-ouvert-sourdine/jalons/mg-j1').set({ projet: 'mg-ouvert-sourdine', titre: 'Ligne du devis', statut: 'a-venir', devis: 'd-mg', montant: 1200, ordre: 1 });
  await bdd.doc('projets/mg-ouvert-sourdine/jalons/mg-j2').set({ projet: 'mg-ouvert-sourdine', titre: 'Étape ordinaire', statut: 'a-venir', ordre: 2 });
  await bdd.doc('projets/mg-ouvert-sourdine/maintenance/contrat').set({ genre: 'contrat', statut: 'actif', formule: 'Sérénité', jours: 2, montant: 900 });
  await bdd.doc('projetsInternes/mg-ferme').set({ sante: 'ok', budget: 4800, budgetNote: 'marge serrée' });
};

/* La photographie du jeu : ce que la migration touche, horodatages de
   service écartés (maj, ajoute). Le journal est à part. */
/* Forme canonique : clés triées à TOUS les niveaux (l'ordre des champs
   rendus par Firestore n'est pas garanti), horodatages de service écartés,
   dates en millisecondes. Un « JSON.stringify(p, clés) » ne filtrait que les
   clés du premier niveau et vidait les documents : la comparaison ne
   voyait presque rien. */
const sansService = (v) => (Array.isArray(v) ? v.map(sansService)
  : v && typeof v === 'object' ? (typeof v.toMillis === 'function' ? { __ts: v.toMillis() } : Object.fromEntries(Object.keys(v).filter((k) => !['maj', 'ajoute'].includes(k)).sort().map((k) => [k, sansService(v[k])])))
  : v);
const photo = async () => {
  const p = {};
  for (const id of IDS) {
    const ref = bdd.doc(`projets/${id}`);
    const d = await ref.get();
    p[`projets/${id}`] = d.exists ? sansService(d.data()) : null;
    for (const sc of ['interlocuteurs', 'jalons', 'montants', 'maintenance']) {
      for (const x of (await ref.collection(sc).get()).docs) p[x.ref.path] = sansService(x.data());
    }
    for (const c of ['projetsInternes', 'budgets']) { const x = await bdd.doc(`${c}/${id}`).get(); if (x.exists) p[x.ref.path] = sansService(x.data()); }
  }
  for (const c of ['organisations/mg-org', 'equipe/mg-agent-sans-actif', 'activite/mg-act-facture', 'activite/mg-act-tache']) p[c] = sansService((await bdd.doc(c).get()).data() || null);
  return JSON.stringify(Object.fromEntries(Object.keys(p).sort().map((k) => [k, p[k]])));
};
const differences = (a, b) => {
  const A = JSON.parse(a); const B = JSON.parse(b);
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
};

await semer();
await calme();

/* ---- 1. À blanc --------------------------------------------------------- */
console.log('\n== 1 · À blanc, rien ne s écrit');
const avantTout = await photo();
const compteAvant = await compteurs();
const blanc = migrer();
verifier(/À BLANC/.test(blanc.sortie), 'le passage par défaut est à blanc');
/* Le banc porte d'autres projets (semis) : on regarde les arbitrages du jeu. */
const bloquantsDuJeu = (sortie) => (sortie.split('Arbitrages BLOQUANTS')[1] || '').split('\n\n')[0].split('\n').filter((l) => /^\s+- projet mg-/.test(l));
verifier(blanc.code === 4 && bloquantsDuJeu(blanc.sortie).length === 1 && /mg-role-inconnu/.test(bloquantsDuJeu(blanc.sortie)[0]), 'et, pour ce jeu, il annonce le seul arbitrage bloquant : le membre au rôle indéductible (code 4)', bloquantsDuJeu(blanc.sortie).join(' | '));
verifier(await photo() === avantTout, 'et la base n a pas bougé');

/* ---- 2. Le passage réel -------------------------------------------------- */
console.log('\n== 2 · Le passage réel');
const vrai = migrer('--vrai');
await calme();
const apresUn = await photo();
const lire = async (id) => (await bdd.doc(`projets/${id}`).get()).data();
const inter = async (id) => (await bdd.collection(`projets/${id}/interlocuteurs`).get()).docs.map((d) => d.data());
const interne = async (id) => (await bdd.doc(`projetsInternes/${id}`).get()).data() || {};

const pi = await lire('mg-interne');
verifier(pi.ouvert === false && pi.accesVersion === 2 && !(await inter('mg-interne')).length, 'un projet interne : fermé, converti, sans interlocuteur');

const po = await lire('mg-ouvert-sourdine');
verifier(po.ouvert === true && po.emailsClient === 'coupes', 'ouvert de fait et en sourdine : ouvert, e-mails coupés (même comportement)');
verifier(JSON.stringify(po.membres) === JSON.stringify([proprio]) && po.roles[proprio] === 'responsable', 'son membre garde l accès, responsable (il avait déjà tout, finance comprise)');
const ipo = await inter('mg-ouvert-sourdine');
verifier(ipo.length === 1 && ipo[0].statut === 'actif' && ipo[0].invitation.etat === 'acceptee' && ipo[0].nom === 'Pia Proprio', 'un interlocuteur actif, déjà entré, avec son nom');

const pf = await lire('mg-ferme');
verifier(pf.ouvert === false && pf.accesVersion === 2 && (pf.membres || []).length === 0, 'fermé et en sourdine : fermé, converti, personne n entre');
const ipf = await inter('mg-ferme');
verifier(ipf.length === 1 && ipf[0].role === 'a-definir' && ipf[0].invitation.etat === 'preparee' && !ipf[0].uid, 'son contact est préparé, SANS rôle, sans compte, rien envoyé');
verifier((await interne('mg-ferme')).rolesADefinir === 1, 'et le cockpit le compte parmi les rôles à choisir');

const pp = await lire('mg-prospect');
verifier(pp.ouvert === false && pp.accesVersion === 2 && (pp.membres || []).length === 0, 'le prospect hors sourdine : fermé, converti, aucune ouverture');
const ipp = await inter('mg-prospect');
verifier(ipp.length === 1 && ipp[0].role === 'a-definir' && ipp[0].invitation.etat === 'preparee', 'son adresse est préparée sans rôle : aucune invitation');

const pc = await lire('mg-compte-parti');
verifier(pc.accesVersion === 2 && pc.ouvert === false && (pc.membres || []).length === 0, 'un membre dont le compte a disparu : projet fermé, converti, aucun membre');
verifier(!(await inter('mg-compte-parti')).length, 'aucun interlocuteur inventé : ni compte, ni rôle (et l adresse de la fiche, qui est celle d un testeur, n est pas préparée)');
const apc = (await interne('mg-compte-parti')).arbitragesAcces || [];
verifier(apc.some((x) => x.type === 'membre-sans-compte') && apc.some((x) => x.type === 'adresse-autre-role'), 'deux points laissés au cockpit : l ancien membre, l adresse d un autre rôle');
verifier(!(await auth.listUsers(1000)).users.some((u) => u.uid === 'compteQuiNexistePlusDuTout00'), 'aucun compte recréé');

const pk = await lire('mg-conflit');
verifier(pk.ouvert === false && !(await inter('mg-conflit')).length && ((await interne('mg-conflit')).arbitragesAcces || []).some((x) => x.type === 'adresse-autre-role'), 'une adresse de testeur n est pas préparée comme client');

const pr = await lire('mg-role-inconnu');
verifier(!pr.accesVersion && JSON.stringify(pr.membres) === JSON.stringify([inconnu]), 'un membre joignable au rôle indéductible garde son accès, projet non converti');
verifier(vrai.code === 4 && /rôle responsable ou collaborateur à décider/.test(vrai.sortie), 'et l arbitrage bloquant est dit (code 4)');

const org = (await bdd.doc('organisations/mg-org').get()).data();
verifier(!org.membres.includes('ancienMembreSansProjet000001') && org.membres.includes(proprio) && org.membres.includes(inconnu), 'la société ne garde que les membres de ses projets');
verifier(JSON.stringify(org.projets) === JSON.stringify(IDS.filter((x) => x !== 'mg-interne').sort()), 'et tient la liste de ses projets', JSON.stringify(org.projets));

verifier((await bdd.doc('activite/mg-act-facture').get()).data().visibilite === 'responsable', 'une ligne d activité financière devient « responsable »');
verifier((await bdd.doc('activite/mg-act-tache').get()).data().visibilite === 'client', 'une ligne ordinaire reste « client »');
const j1 = (await bdd.doc('projets/mg-ouvert-sourdine/jalons/mg-j1').get()).data();
const m1 = (await bdd.doc('projets/mg-ouvert-sourdine/montants/jalon-mg-j1').get()).data();
verifier(!('montant' in j1) && m1 && m1.montant === 1200 && m1.projet === 'mg-ouvert-sourdine', 'le montant d une étape de devis quitte l étape, pour la finance');
verifier(!(await bdd.doc('projets/mg-ouvert-sourdine/montants/jalon-mg-j2').get()).exists, 'une étape sans montant n en reçoit pas');
const contrat = (await bdd.doc('projets/mg-ouvert-sourdine/maintenance/contrat').get()).data();
const mm = (await bdd.doc('projets/mg-ouvert-sourdine/montants/maintenance').get()).data();
verifier(!('montant' in contrat) && mm && mm.montant === 900, 'le prix du forfait quitte le contrat, pour la finance');
const bud = (await bdd.doc('budgets/mg-ferme').get()).data();
const ifm = await interne('mg-ferme');
verifier(bud && bud.budget === 4800 && bud.budgetNote === 'marge serrée' && !('budget' in ifm) && !('budgetNote' in ifm) && ifm.sante === 'ok', 'le budget quitte la fiche interne pour budgets/, la santé reste');

const eq = (await bdd.doc('equipe/mg-agent-sans-actif').get()).data();
verifier(eq.actif === true && eq.role === 'admin', 'une fiche d équipe sans « actif » devient explicitement active, son rôle intact');

/* ---- 3. Silencieuse ---------------------------------------------------- */
console.log('\n== 3 · Silencieuse');
const compteApres = await compteurs();
verifier(compteApres.envois === compteAvant.envois, `aucune lettre (${compteAvant.envois} -> ${compteApres.envois})`);
verifier(compteApres.notifications === compteAvant.notifications, `aucune notification (${compteAvant.notifications} -> ${compteApres.notifications})`);
verifier(compteApres.activite === compteAvant.activite, `aucune ligne d activité (${compteAvant.activite} -> ${compteApres.activite})`);
verifier(compteApres.invitations === compteAvant.invitations, `aucune invitation (${compteAvant.invitations} -> ${compteApres.invitations})`);
const passage = (await bdd.collection('migrationGate2').get()).docs.find((d) => d.data().mode === 'vrai' && !d.data().annule);
const nUnites = unitesDe(vrai.sortie);
verifier(Boolean(passage) && (await passage.ref.collection('unites').get()).size === nUnites && nUnites >= 10, `le passage est journalisé, unité par unité (${nUnites})`);

/* ---- 4. Rejouable ------------------------------------------------------ */
console.log('\n== 4 · Rejouable');
const second = migrer('--vrai');
await calme();
verifier(await photo() === apresUn, 'un second passage ne change rien');
verifier(unitesDe(second.sortie) === 0, 'et son bilan compte zéro unité écrite', (second.sortie.split('\n').find((l) => /\bunites\b/.test(l)) || '').trim());

/* ---- 4 bis. Le rattrapage de la bascule ------------------------------- */
console.log('\n== 4 bis · Le rattrapage : l ancien écran a réécrit des montants pendant la bascule');
await bdd.doc('projets/mg-ouvert-sourdine/jalons/mg-j1').update({ montant: 1300 });
await bdd.doc('projets/mg-ouvert-sourdine/maintenance/contrat').update({ montant: 950 });
await bdd.doc('projetsInternes/mg-ferme').update({ budget: 5000 });
const rattrapage = migrer('--vrai');
await calme();
const mj = (await bdd.doc('projets/mg-ouvert-sourdine/montants/jalon-mg-j1').get()).data();
verifier(mj.montant === 1300 && !('montant' in (await bdd.doc('projets/mg-ouvert-sourdine/jalons/mg-j1').get()).data()), 'le montant réécrit sur l étape est repris (la valeur la plus récente), l étape n en porte plus');
verifier((await bdd.doc('projets/mg-ouvert-sourdine/montants/maintenance').get()).data().montant === 950, 'le prix du forfait réécrit est repris');
verifier((await bdd.doc('budgets/mg-ferme').get()).data().budget === 5000 && !('budget' in (await interne('mg-ferme'))), 'le budget réécrit est repris');
verifier(unitesDe(rattrapage.sortie) === 3 && /réécrit par l'ancien écran/.test(rattrapage.sortie), 'le rattrapage écrit ces trois unités, et le dit', (rattrapage.sortie.split('\n').find((l) => /\bunites\b/.test(l)) || '').trim());
verifier(unitesDe(migrer('--vrai').sortie) === 0, 'rejoué ensuite, il n écrit plus rien');

/* ---- 5. Réversible ----------------------------------------------------- */
console.log('\n== 5 · Réversible');
migrer('--annuler', '--tout');
await calme();
const d5 = differences(await photo(), avantTout);
verifier(!d5.length, '« --annuler --tout » remet la base comme avant le premier passage', d5.join(', '));
const compteFin = await compteurs();
verifier(compteFin.envois === compteAvant.envois && compteFin.activite === compteAvant.activite, 'et l annulation ne produit rien non plus');

/* ---- 6. Coupée, puis reprise ------------------------------------------- */
console.log('\n== 6 · Coupée à différents moments, puis reprise');
const points = [0, Math.floor(nUnites * 0.25), Math.floor(nUnites * 0.5), Math.floor(nUnites * 0.75), nUnites - 1];
for (const n of points) {
  await semer(); await calme();
  const avantC = await compteurs();
  const coupe = migrer('--vrai', `--arreter-apres=${n}`);
  const reprise = migrer('--vrai');
  await calme();
  const diff = differences(await photo(), apresUn);
  const apresC = await compteurs();
  const silencieuse = apresC.envois === avantC.envois && apresC.invitations === avantC.invitations && apresC.notifications === avantC.notifications && apresC.activite === avantC.activite;
  verifier(coupe.code === 3 && reprise.code === 4 && !diff.length && silencieuse,
    `coupée après ${n} unité(s) sur ${nUnites}, relancée : même état qu une traite, rien envoyé, aucun doublon`,
    `coupe ${coupe.code}, reprise ${reprise.code}, écarts ${diff.join(', ')}`);
  const doublons = (await bdd.collection('projets/mg-ouvert-sourdine/interlocuteurs').get()).size;
  verifier(doublons === 1, `aucun interlocuteur en double (${doublons})`);
  migrer('--annuler', '--tout');
  await calme();
  const dA = differences(await photo(), avantTout);
  verifier(!dA.length, 'et « --annuler --tout » défait les passages morcelés', dA.join(', '));
}

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
