/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles du coffre-fort à l'épreuve

   Qui touche aux octets chiffrés d'un coffre, et sous quelle forme. Droits
   attendus : l'équipe du projet (administrateur, agent affecté) et le ou
   les responsables du projet. Abus refusés : collaborateur, client d'un
   autre projet, client retiré, testeur (même glissé parmi les membres),
   agent d'un autre projet, membre désactivé, inconnu. Et la forme : aucun
   champ en clair, aucun réglage affaibli, aucune ligne de journal au nom
   d'un autre ou antidatée.

   Les mêmes droits sont aussi éprouvés de bout en bout, avec de vrais
   jetons et dans le navigateur, par qa-coffre.cjs.

     (émulateur Firestore)
     node fonctions-suivi/outils/regles-coffre.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: `${PROJET}-coffre`,
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const jeton = (uid, extra = {}) => ({ email: `${uid}@exemple.test`, email_verified: true, sub: uid, ...extra });
const qui = (uid, extra) => env.authenticatedContext(uid, jeton(uid, extra)).firestore();
const ADMIN = qui('cf-admin');
const AGENT = qui('cf-agent');
const AGENT_B = qui('cf-agent-b');
const INACTIF = qui('cf-inactif');
const RESP = qui('cf-resp');
const COLLAB = qui('cf-collab');
const VOISIN = qui('cf-voisin');
const RETIRE = qui('cf-retire');
const TESTEUR = qui('cf-testeur', { testeur: true });
const ANONYME = env.unauthenticatedContext().firestore();

/* Des octets en base64url, de la bonne longueur. */
const b = (n) => 'A'.repeat(n);
const ENVELOPPE = { version: 1, kdf: 'PBKDF2-SHA256', iterations: 600000, sel: b(22), iv: b(16), cle: b(64) };
const coffreNeuf = (uid) => ({ ...ENVELOPPE, creePar: uid, cree: serverTimestamp(), maj: serverTimestamp(), phraseLe: serverTimestamp() });
const entree = () => ({ v: 1, iv: b(16), donnees: b(364), cree: serverTimestamp(), maj: serverTimestamp() });
const ligne = (uid, cote, action = 'deverrouillage', moyen = 'phrase') => ({ uid, nom: uid, cote, action, moyen, date: serverTimestamp() });
const appareil = (uid) => ({ uid, nom: uid, appareil: 'Mac · Safari', credId: b(40), selPrf: b(43), iv: b(16), cle: b(64), cree: serverTimestamp() });

let ok = 0; const ecarts = [];
const doit = async (l, p) => { try { await assertSucceeds(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (refusé à tort)'); } };
const refuse = async (l, p) => { try { await assertFails(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (AUTORISÉ À TORT)'); } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const s = (chemin, v) => setDoc(doc(d, chemin), v);
  await s('equipe/cf-admin', { nom: 'Admin', role: 'admin', actif: true });
  await s('equipe/cf-agent', { nom: 'Agent', role: 'agent', actif: true, projets: ['pa'] });
  await s('equipe/cf-agent-b', { nom: 'Agent B', role: 'agent', actif: true, projets: ['pb'] });
  await s('equipe/cf-inactif', { nom: 'Ancien', role: 'admin', actif: false });
  await s('projets/pa', { nom: 'A', ref: 'A', ouvert: true, membres: ['cf-resp', 'cf-collab', 'cf-testeur'], roles: { 'cf-resp': 'responsable', 'cf-collab': 'collaborateur', 'cf-testeur': 'responsable', 'cf-retire': 'responsable' } });
  await s('projets/pb', { nom: 'B', ref: 'B', ouvert: true, membres: ['cf-voisin'], roles: { 'cf-voisin': 'responsable' } });
  await s('projets/pc', { nom: 'C', ref: 'C', ouvert: true, membres: ['cf-resp'], roles: { 'cf-resp': 'responsable' } });
  const t = Timestamp.now();
  await s('coffres/pa', { ...ENVELOPPE, creePar: 'cf-admin', cree: t, maj: t, phraseLe: t });
  await s('coffres/pb', { ...ENVELOPPE, creePar: 'cf-admin', cree: t, maj: t, phraseLe: t });
  await s('coffres/pa/entrees/e1', { v: 1, iv: b(16), donnees: b(364), cree: t, maj: t });
  await s('coffres/pa/appareils/a1', { uid: 'cf-resp', nom: 'Resp', appareil: 'iPhone', credId: b(40), selPrf: b(43), iv: b(16), cle: b(64), cree: t });
  await s('coffres/pa/journal/j1', { uid: 'cf-admin', nom: 'Admin', cote: 'equipe', action: 'creation', moyen: '', date: t });
});

const lire = (db, chemin) => getDoc(doc(db, chemin));
const liste = (db, chemin) => getDocs(collection(db, chemin));

console.log('\n== Équipe : administrateur');
await doit('lit le coffre de A et ses entrées', Promise.all([lire(ADMIN, 'coffres/pa'), liste(ADMIN, 'coffres/pa/entrees')]));
await doit('lit le journal de A', liste(ADMIN, 'coffres/pa/journal'));
await doit('crée le coffre de C', setDoc(doc(ADMIN, 'coffres/pc'), coffreNeuf('cf-admin')));
await refuse('ne recrée pas par-dessus un coffre existant', setDoc(doc(ADMIN, 'coffres/pb'), coffreNeuf('cf-admin')));
await refuse('ne crée pas un coffre à 1 000 tours', setDoc(doc(ADMIN, 'coffres/px'), { ...coffreNeuf('cf-admin'), iterations: 1000 }));
await refuse('ne crée pas un coffre qui porte la phrase', setDoc(doc(ADMIN, 'coffres/px'), { ...coffreNeuf('cf-admin'), phrase: 'lapin chat' }));
await refuse('ne crée pas un coffre au nom d un autre', setDoc(doc(ADMIN, 'coffres/px'), coffreNeuf('cf-agent')));
await refuse('ne crée pas un coffre sans sel', setDoc(doc(ADMIN, 'coffres/px'), { ...coffreNeuf('cf-admin'), sel: '' }));
await refuse('ne crée pas un coffre dont la clé n est pas du base64url', setDoc(doc(ADMIN, 'coffres/px'), { ...coffreNeuf('cf-admin'), cle: `${b(60)} ok!` }));
await doit('change la phrase de A (nouvelle enveloppe)', updateDoc(doc(ADMIN, 'coffres/pa'), { sel: 'B'.repeat(22), iv: 'B'.repeat(16), cle: 'B'.repeat(64), maj: serverTimestamp(), phraseLe: serverTimestamp() }));
await refuse('ne baisse pas les tours de A', updateDoc(doc(ADMIN, 'coffres/pa'), { iterations: 100000, maj: serverTimestamp(), phraseLe: serverTimestamp() }));
await refuse('ne réécrit pas l auteur du coffre', updateDoc(doc(ADMIN, 'coffres/pa'), { creePar: 'cf-agent', maj: serverTimestamp(), phraseLe: serverTimestamp() }));

console.log('\n== Équipe : agent');
await doit('l agent de A lit le coffre de A', lire(AGENT, 'coffres/pa'));
await doit('et y range une entrée', setDoc(doc(AGENT, 'coffres/pa/entrees/e-agent'), entree()));
await refuse('l agent de A ne lit PAS le coffre de B', lire(AGENT, 'coffres/pb'));
await refuse('ni ses entrées', liste(AGENT, 'coffres/pb/entrees'));
await refuse('l agent de B ne lit PAS le coffre de A', lire(AGENT_B, 'coffres/pa'));
await refuse('un membre désactivé ne lit plus rien', lire(INACTIF, 'coffres/pa'));

console.log('\n== Client : responsable de A');
await doit('lit le coffre de A', lire(RESP, 'coffres/pa'));
await doit('liste les entrées chiffrées', liste(RESP, 'coffres/pa/entrees'));
await doit('range une entrée chiffrée', setDoc(doc(RESP, 'coffres/pa/entrees/e2'), entree()));
await refuse('mais jamais avec le nom du service en clair', setDoc(doc(RESP, 'coffres/pa/entrees/e3'), { ...entree(), service: 'Stripe' }));
await refuse('ni un mot de passe en clair à la place du chiffré', setDoc(doc(RESP, 'coffres/pa/entrees/e3'), { ...entree(), donnees: `motDePasse: Secret-123 ${b(300)}` }));
await refuse('ni un chiffré trop court pour être une entrée', setDoc(doc(RESP, 'coffres/pa/entrees/e3'), { ...entree(), donnees: b(40) }));
await refuse('ni antidaté', setDoc(doc(RESP, 'coffres/pa/entrees/e3'), { ...entree(), cree: Timestamp.fromDate(new Date(2020, 0, 1)) }));
await doit('modifie une entrée', updateDoc(doc(RESP, 'coffres/pa/entrees/e2'), { iv: 'C'.repeat(16), donnees: 'C'.repeat(364), maj: serverTimestamp() }));
await refuse('sans pouvoir y ajouter un champ', updateDoc(doc(RESP, 'coffres/pa/entrees/e2'), { note: 'en clair', maj: serverTimestamp() }));
await doit('supprime une entrée', deleteDoc(doc(RESP, 'coffres/pa/entrees/e2')));
await doit('change la phrase', updateDoc(doc(RESP, 'coffres/pa'), { sel: 'D'.repeat(22), iv: 'D'.repeat(16), cle: 'D'.repeat(64), maj: serverTimestamp(), phraseLe: serverTimestamp() }));
await refuse('n efface pas le coffre (l équipe seule)', deleteDoc(doc(RESP, 'coffres/pa')));
await refuse('ne crée pas de coffre lui-même', setDoc(doc(RESP, 'coffres/pd'), coffreNeuf('cf-resp')));
await doit('lit le journal', liste(RESP, 'coffres/pa/journal'));
await doit('écrit sa ligne de déverrouillage', setDoc(doc(RESP, 'coffres/pa/journal/j-resp'), ligne('cf-resp', 'client')));
await refuse('pas au nom d un autre', setDoc(doc(RESP, 'coffres/pa/journal/j2'), ligne('cf-admin', 'client')));
await refuse('pas en se disant de l équipe', setDoc(doc(RESP, 'coffres/pa/journal/j2'), ligne('cf-resp', 'equipe')));
await refuse('pas antidatée', setDoc(doc(RESP, 'coffres/pa/journal/j2'), { ...ligne('cf-resp', 'client'), date: Timestamp.fromDate(new Date(2020, 0, 1)) }));
await refuse('pas avec un contenu', setDoc(doc(RESP, 'coffres/pa/journal/j2'), { ...ligne('cf-resp', 'client'), detail: 'Stripe' }));
await refuse('une ligne ne se corrige pas', updateDoc(doc(RESP, 'coffres/pa/journal/j-resp'), { action: 'echec' }));
await refuse('ni ne s efface', deleteDoc(doc(RESP, 'coffres/pa/journal/j1')));
await doit('active l empreinte sur son appareil', setDoc(doc(RESP, 'coffres/pa/appareils/a2'), appareil('cf-resp')));
await refuse('pas au nom d un autre', setDoc(doc(RESP, 'coffres/pa/appareils/a3'), appareil('cf-admin')));
await refuse('une copie d appareil ne se réécrit pas', updateDoc(doc(RESP, 'coffres/pa/appareils/a2'), { cle: 'E'.repeat(64) }));
await doit('retire un appareil', deleteDoc(doc(RESP, 'coffres/pa/appareils/a2')));
await refuse('le responsable de A ne lit PAS le coffre de B', lire(RESP, 'coffres/pb'));

console.log('\n== Ceux qui n entrent pas');
await refuse('le collaborateur de A ne lit pas le coffre', lire(COLLAB, 'coffres/pa'));
await refuse('ni les entrées', liste(COLLAB, 'coffres/pa/entrees'));
await refuse('ni une entrée par son adresse', lire(COLLAB, 'coffres/pa/entrees/e1'));
await refuse('n en écrit pas', setDoc(doc(COLLAB, 'coffres/pa/entrees/e4'), entree()));
await refuse('ne lit pas le journal', liste(COLLAB, 'coffres/pa/journal'));
await refuse('ne lit pas les appareils', liste(COLLAB, 'coffres/pa/appareils'));
await refuse('le responsable de B ne lit pas le coffre de A', lire(VOISIN, 'coffres/pa'));
await refuse('ni ses entrées', liste(VOISIN, 'coffres/pa/entrees'));
await refuse('n écrit pas dans le journal de A', setDoc(doc(VOISIN, 'coffres/pa/journal/j3'), ligne('cf-voisin', 'client')));
await refuse('un client retiré (rôle resté, plus membre) ne lit rien', lire(RETIRE, 'coffres/pa'));
await refuse('un testeur, même glissé parmi les responsables, ne lit rien', lire(TESTEUR, 'coffres/pa'));
await refuse('ni les entrées', liste(TESTEUR, 'coffres/pa/entrees'));
await refuse('un inconnu ne lit rien', lire(ANONYME, 'coffres/pa'));
await refuse('ni n écrit', setDoc(doc(ANONYME, 'coffres/pa/entrees/e5'), entree()));

console.log('\n== Effacer (phrase perdue)');
await refuse('l agent de B n efface pas le coffre de A', deleteDoc(doc(AGENT_B, 'coffres/pa')));
await doit('l administrateur efface le coffre de A', deleteDoc(doc(ADMIN, 'coffres/pa')));
await refuse('plus d entrée sans coffre', setDoc(doc(RESP, 'coffres/pa/entrees/e6'), entree()));
await doit('le journal reste lisible', liste(ADMIN, 'coffres/pa/journal'));

await env.cleanup();
console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
process.exit(ecarts.length ? 1 : 0);
