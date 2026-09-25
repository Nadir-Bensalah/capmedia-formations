/* ==========================================================================
   CAPMEDIA CLIENT HUB · la migration de la Gate 2 à l'épreuve

   Un jeu de données qui a les formes de la production (projets internes,
   projet ouvert de fait en sourdine, projets fermés, prospect hors
   sourdine, membre dont le compte a disparu, membre sans rôle déductible,
   fiche d'équipe sans « actif »), puis :
     1. un passage à blanc n'écrit rien ;
     2. le passage réel convertit ce qui est déterministe, et laisse le
        reste en arbitrage, sans que personne ne perde un accès ;
     3. aucune lettre, aucune notification, aucune ligne d'activité ;
     4. un second passage n'écrit rien (rejouable) ;
     5. « --annuler » remet tout comme avant.

     (émulateurs avec les fonctions : les déclencheurs doivent tourner,
      pour prouver qu'ils se taisent)
     node fonctions-suivi/outils/migration-gate2.test.mjs
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { execFileSync } from 'node:child_process';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('Émulateurs seulement.'); process.exit(2); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
const auth = getAuth();

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 200)}` : ''}`); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const migrer = (...args) => execFileSync(process.execPath, [new URL('./migrer-gate2.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8', env: process.env });
const compteurs = async () => {
  const [e, a, n] = await Promise.all([bdd.collection('envois').count().get(), bdd.collection('activite').count().get(), bdd.collectionGroup('notifications').count().get()]);
  return { envois: e.data().count, activite: a.data().count, notifications: n.data().count };
};
const calme = async () => { let avant = ''; let pareil = 0; for (let i = 0; i < 40; i += 1) { const m = JSON.stringify(await compteurs()); pareil = m === avant ? pareil + 1 : 0; if (pareil >= 3) return; avant = m; await pause(700); } };
const photo = async () => {
  const p = {};
  for (const d of (await bdd.collection('projets').where('ref', '>=', 'MG').where('ref', '<', 'MH').get()).docs) {
    p[d.id] = { ...d.data(), interlocuteurs: (await d.ref.collection('interlocuteurs').get()).docs.map((x) => x.id).sort() };
    delete p[d.id].maj;
  }
  p.equipe = (await bdd.doc('equipe/mg-agent-sans-actif').get()).data();
  return JSON.stringify(p, Object.keys(p).sort());
};

/* ---- Les formes de la production ------------------------------------- */
const compte = async (email) => {
  try { return (await auth.getUserByEmail(email)).uid; } catch (e) { return (await auth.createUser({ email, emailVerified: true })).uid; }
};
const proprio = await compte('proprio.mg@exemple.test');
const inconnu = await compte('inconnu.mg@exemple.test');
await bdd.doc('organisations/mg-org').set({ nom: 'Société MG', membres: [proprio, inconnu], roles: { [proprio]: 'owner' },
  contacts: [{ nom: 'Pia Proprio', email: 'proprio.mg@exemple.test', role: 'owner', uid: proprio }, { nom: 'Contact', email: 'contact.mg@exemple.test', role: 'member', uid: null }] });
const projet = (id, d) => bdd.doc(`projets/${id}`).set({ nom: id, ref: id.toUpperCase().replace(/-/g, ''), statut: 'en-cours', compteur: 0, archive: false, ...d });
await projet('mg-interne', { interne: true, silence: true, membres: [] });
await projet('mg-ouvert-sourdine', { organisation: 'mg-org', silence: true, membres: [proprio], client: { nom: 'Pia', email: 'proprio.mg@exemple.test' } });
await projet('mg-ferme', { organisation: 'mg-org', silence: true, membres: [], contacts: [{ nom: 'Contact', email: 'contact.mg@exemple.test' }] });
await projet('mg-prospect', { organisation: 'mg-org', membres: [], statut: 'prospect', client: { nom: 'Prospect', email: 'prospect.mg@exemple.test' } });
await projet('mg-compte-parti', { organisation: 'mg-org', membres: ['compteQuiNexistePlusDuTout00'], client: { email: 'proprio.mg@exemple.test' } });
await projet('mg-role-inconnu', { organisation: 'mg-org', membres: [inconnu] });
await bdd.doc('equipe/mg-agent-sans-actif').set({ nom: 'Ancien format', email: 'ancien.mg@exemple.test', role: 'admin' });
await calme();

/* ---- 1. À blanc --------------------------------------------------------- */
console.log('\n== 1 · À blanc, rien ne s écrit');
const avantTout = await photo();
const compteAvant = await compteurs();
const blanc = migrer();
verifier(/À BLANC/.test(blanc), 'le passage par défaut est à blanc');
verifier(await photo() === avantTout, 'et la base n a pas bougé');

/* ---- 2. Le passage réel -------------------------------------------------- */
console.log('\n== 2 · Le passage réel');
const vrai = migrer('--vrai');
await calme();
const lire = async (id) => (await bdd.doc(`projets/${id}`).get()).data();
const inter = async (id) => (await bdd.collection(`projets/${id}/interlocuteurs`).get()).docs.map((d) => d.data());

const pi = await lire('mg-interne');
verifier(pi.ouvert === false && pi.accesVersion === 2 && !(await inter('mg-interne')).length, 'un projet interne : fermé, converti, sans interlocuteur');

const po = await lire('mg-ouvert-sourdine');
verifier(po.ouvert === true && po.emailsClient === 'coupes', 'ouvert de fait et en sourdine : ouvert, e-mails coupés (même comportement)');
verifier(JSON.stringify(po.membres) === JSON.stringify([proprio]) && po.roles[proprio] === 'responsable', 'son membre garde l accès, responsable (propriétaire de la société)');
const ipo = await inter('mg-ouvert-sourdine');
verifier(ipo.length === 1 && ipo[0].statut === 'actif' && ipo[0].invitation.etat === 'acceptee' && ipo[0].nom === 'Pia Proprio', 'un interlocuteur actif, déjà entré, avec son nom');

const pf = await lire('mg-ferme');
verifier(pf.ouvert === false && pf.accesVersion === 2 && (pf.membres || []).length === 0, 'fermé et en sourdine : fermé, converti, personne n entre');
const ipf = await inter('mg-ferme');
verifier(ipf.length === 1 && ipf[0].role === 'a-definir' && ipf[0].invitation.etat === 'preparee', 'son contact est préparé, rôle à décider, rien envoyé');

const pp = await lire('mg-prospect');
verifier(pp.ouvert === undefined && !pp.accesVersion, 'le prospect hors sourdine n est ni fermé ni ouvert d office : arbitrage');
verifier(/fermer.*ouvrir|le fermer/.test(vrai) && /mg-prospect/.test(vrai), 'et l arbitrage est listé');

const pc = await lire('mg-compte-parti');
verifier(!pc.accesVersion && JSON.stringify(pc.membres) === JSON.stringify(['compteQuiNexistePlusDuTout00']), 'un membre dont le compte a disparu : rien retiré, projet non converti');
verifier(/sans compte lisible/.test(vrai), 'et l arbitrage le dit');

const pr = await lire('mg-role-inconnu');
verifier(!pr.accesVersion && JSON.stringify(pr.membres) === JSON.stringify([inconnu]), 'un membre au rôle indéductible garde son accès, projet non converti');
verifier(/rôle responsable ou collaborateur à décider/.test(vrai), 'et l arbitrage le dit');

const eq = (await bdd.doc('equipe/mg-agent-sans-actif').get()).data();
verifier(eq.actif === true, 'une fiche d équipe sans « actif » devient explicitement active (elle l était)');

/* ---- 3. Silencieuse ---------------------------------------------------- */
console.log('\n== 3 · Silencieuse');
const compteApres = await compteurs();
verifier(compteApres.envois === compteAvant.envois, `aucune lettre (${compteAvant.envois} -> ${compteApres.envois})`);
verifier(compteApres.notifications === compteAvant.notifications, `aucune notification (${compteAvant.notifications} -> ${compteApres.notifications})`);
verifier(compteApres.activite === compteAvant.activite, `aucune ligne d activité (${compteAvant.activite} -> ${compteApres.activite})`);
const passage = (await bdd.collection('migrationGate2').get()).docs.find((d) => d.data().mode === 'vrai' && !d.data().annule);
verifier(Boolean(passage) && (await passage.ref.collection('unites').get()).size >= 5, 'le passage est journalisé, unité par unité');

/* ---- 4. Rejouable ------------------------------------------------------ */
console.log('\n== 4 · Rejouable');
const apresUn = await photo();
const second = migrer('--vrai');
await calme();
verifier(await photo() === apresUn, 'un second passage ne change rien');
const ligneUnites = second.split('\n').find((l) => /\bunites\b/.test(l)) || '';
verifier(Number((ligneUnites.match(/(\d+)\s+unites/) || [])[1]) === 0, 'et son bilan compte zéro unité écrite', ligneUnites.trim());

/* ---- 5. Réversible ----------------------------------------------------- */
console.log('\n== 5 · Réversible');
/* Le second passage n'a rien écrit : on annule le premier, explicitement. */
migrer('--annuler', `--passage=${passage.id}`);
await calme();
verifier(await photo() === avantTout, '« --annuler » remet la base comme avant le premier passage');
const compteFin = await compteurs();
verifier(compteFin.envois === compteAvant.envois && compteFin.activite === compteAvant.activite, 'et l annulation ne produit rien non plus');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
void FieldValue;
