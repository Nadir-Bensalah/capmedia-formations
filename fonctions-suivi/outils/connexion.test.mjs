/* ==========================================================================
   CAPMEDIA CLIENT HUB · la porte d'entrée à l'épreuve

   Six chiffres, c'est un million de combinaisons : ce n'est pas le code
   qui protège, ce sont les garde-fous. Cette épreuve les attaque un par
   un, sur le banc d'essai complet (émulateurs auth, firestore, functions).

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/connexion.test.mjs
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateurs requis.'); process.exit(1); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();
const PORTE = process.env.PORTE_CONNEXION || 'http://127.0.0.1:5001/capmedia-1f90d/europe-west1/suiviConnexion';

let ok = 0; const ecarts = [];
const verifier = (c, quoi, detail = '') => {
  if (c) { ok += 1; console.log(`  ok     ${quoi}`); }
  else { ecarts.push(`${quoi}${detail ? ` (${detail})` : ''}`); console.log(`  ÉCART  ${quoi}${detail ? ` · ${detail}` : ''}`); }
};

const appeler = async (action, corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...corps }) });
  let j = null; try { j = await r.json(); } catch (e) { /* texte */ }
  return { code: r.status, ...(j || {}) };
};

/* La boîte de réception du banc d'essai : la file d'envois. */
const dernierCode = async (email) => {
  const q = await bdd.collection('envois').where('modele', '==', 'code').get();
  const pour = q.docs.map((d) => d.data())
    .filter((d) => (d.a || []).some((x) => x.email === email))
    .sort((a, b) => (b.cree && b.cree.toMillis ? b.cree.toMillis() : 0) - (a.cree && a.cree.toMillis ? a.cree.toMillis() : 0));
  return pour.length ? pour[0].variables.code : '';
};
const viderBoite = async () => {
  const q = await bdd.collection('envois').get();
  await Promise.all(q.docs.map((d) => d.ref.delete()));
};
const rouvrirLesVannes = async () => {
  const [c, i] = await Promise.all([bdd.collection('connexions').get(), bdd.collection('connexionsIp').get()]);
  await Promise.all([...c.docs, ...i.docs].map((d) => d.ref.delete()));
};

const CLIENT = 'camille.essai@exemple.test';
const AGENT = 'agent.essai@exemple.test';
const INCONNU = 'personne@nulle-part.test';

console.log('== Ce que la porte ne dit jamais');
await viderBoite(); await rouvrirLesVannes();
const a = await appeler('demanderCode', { email: INCONNU });
const b = await appeler('demanderCode', { email: CLIENT });
verifier(JSON.stringify(a) === JSON.stringify(b), "la réponse est la même pour une adresse connue et une inconnue", `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
verifier(!(await dernierCode(INCONNU)), "aucun code ne part vers une adresse sans compte");
verifier((await dernierCode(CLIENT)).length === 6, 'un code à six chiffres part vers une adresse connue');

console.log('\n== Le code lui-même');
const code = await dernierCode(CLIENT);
verifier(/^[0-9]{6}$/.test(code), 'le code ne contient que des chiffres');
const doc = await bdd.doc(`connexions/${(await import('node:crypto')).createHash('sha256').update(CLIENT).digest('hex')}`).get();
const stocke = doc.exists ? doc.data() : {};
verifier(doc.exists && stocke.empreinte && !JSON.stringify(stocke).includes(code), "le code n'est jamais écrit en clair dans la base");
verifier(Boolean(stocke.sel) && stocke.sel.length >= 32, "l'empreinte est salée");

console.log('\n== Les mauvais codes');
const faux = await appeler('verifierCode', { email: CLIENT, code: code === '000000' ? '111111' : '000000' });
verifier(faux.code === 401 && !faux.lien, 'un mauvais code est refusé');
verifier(/reste \d+ essai/.test(faux.message || ''), 'le nombre d essais restants est annoncé', faux.message);
for (let i = 0; i < 5; i += 1) await appeler('verifierCode', { email: CLIENT, code: '999999' });
const brule = await appeler('verifierCode', { email: CLIENT, code });
verifier(brule.code === 401 && !brule.lien, "le bon code ne sert plus une fois les essais épuisés", JSON.stringify(brule));

console.log('\n== Le bon code');
await rouvrirLesVannes(); await viderBoite();
await appeler('demanderCode', { email: CLIENT });
const bon = await dernierCode(CLIENT);
const ouverte = await appeler('verifierCode', { email: CLIENT, code: bon });
verifier(ouverte.ok && typeof ouverte.lien === 'string' && /oobCode=/.test(ouverte.lien), 'le bon code rend un accès de session à usage unique');
const rejoue = await appeler('verifierCode', { email: CLIENT, code: bon });
verifier(rejoue.code === 401 && !rejoue.lien, 'le même code ne sert pas deux fois');

console.log('\n== Le débit');
await rouvrirLesVannes(); await viderBoite();
const debits = [];
for (let i = 0; i < 4; i += 1) debits.push(await appeler('demanderCode', { email: CLIENT }));
verifier(debits.slice(0, 3).every((r) => r.ok), 'trois codes passent dans le quart d heure');
verifier(debits[3].code === 429, 'le quatrième est refusé', JSON.stringify(debits[3]));

console.log('\n== L équipe, en plus strict');
await rouvrirLesVannes(); await viderBoite();
await appeler('demanderCode', { email: AGENT });
const cleAgent = (await import('node:crypto')).createHash('sha256').update(AGENT).digest('hex');
const fiche = (await bdd.doc(`connexions/${cleAgent}`).get()).data() || {};
verifier(fiche.equipe === true, "le compte d'équipe est reconnu comme tel");
verifier(Number(fiche.essaisMax) === 3, "l'équipe n'a droit qu'à trois essais", `${fiche.essaisMax}`);
const duree = fiche.expire && fiche.expire.toMillis ? fiche.expire.toMillis() - Date.now() : 0;
verifier(duree > 0 && duree <= 5 * 60 * 1000 + 5000, "le code d'équipe ne vit que cinq minutes", `${Math.round(duree / 1000)} s`);
const codeAgent = await dernierCode(AGENT);
await appeler('verifierCode', { email: AGENT, code: codeAgent });
const alertes = (await bdd.collection('envois').where('modele', '==', 'connexion-equipe').get()).size;
verifier(alertes >= 1, "une ouverture de session d'équipe s'annonce par e-mail");

console.log('\n== L invitation');
const jetonFaux = await appeler('invitation', { jeton: 'x'.repeat(24) });
verifier(jetonFaux.ok === false && !jetonFaux.email, "un jeton inconnu ne rend aucune adresse");
await bdd.doc('invitations/epreuve-jeton-de-test').set({ email: CLIENT, nom: 'Camille', projetNom: 'Atelier', expire: new Date(Date.now() + 86400000), revoquee: false });
const vivante = await appeler('invitation', { jeton: 'epreuve-jeton-de-test' });
verifier(vivante.ok && vivante.email === CLIENT && vivante.projet === 'Atelier', "un jeton valable rend l'adresse et le projet");
await bdd.doc('invitations/epreuve-jeton-de-test').update({ revoquee: true });
verifier((await appeler('invitation', { jeton: 'epreuve-jeton-de-test' })).ok === false, 'un jeton révoqué ne rend plus rien');
await bdd.doc('invitations/epreuve-jeton-perime').set({ email: CLIENT, expire: new Date(Date.now() - 1000), revoquee: false });
verifier((await appeler('invitation', { jeton: 'epreuve-jeton-perime' })).ok === false, 'un jeton périmé ne rend plus rien');

console.log('\n== Les entrées malformées');
verifier((await appeler('demanderCode', { email: 'pas-une-adresse' })).code === 400, 'une adresse invalide est refusée');
verifier((await appeler('verifierCode', { email: CLIENT, code: '12' })).code === 401, 'un code trop court est refusé');
verifier((await appeler('rien-du-tout', {})).code === 400, 'une action inconnue est refusée');

await viderBoite(); await rouvrirLesVannes();
console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
