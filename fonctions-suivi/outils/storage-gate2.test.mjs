/* ==========================================================================
   CAPMEDIA CLIENT HUB · les fichiers de la Gate 2 à l'épreuve

   Les règles Storage relisent la base à chaque requête : un jeton ancien
   ne suffit plus. On le vérifie avec des jetons qui portent encore ce
   qu'ils portaient avant (« equipe », « projets », « testeur »), face à
   une fiche qui dit le contraire. Et la finance au responsable seul.

     (émulateurs Storage et Firestore)
     node fonctions-suivi/outils/storage-gate2.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadString, getBytes, listAll } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: PROJET,
  storage: { rules: readFileSync(new URL('../../suivi/storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const P = 'sg-projet', Q = 'sg-autre';
const jeton = (uid, extra = {}) => ({ email: `${uid}@exemple.test`, email_verified: true, sub: uid, ...extra });
const qui = (uid, extra) => env.authenticatedContext(uid, jeton(uid, extra)).storage();
const AGENT = qui('sg-agent', { equipe: true });
const INACTIF = qui('sg-inactif', { equipe: true });
const RESP = qui('sg-resp', { projets: [P] });
const COLLAB = qui('sg-collab', { projets: [P] });
const RETIRE = qui('sg-retire', { projets: [P] });
const T_RETIRE = qui('sg-t-retire', { testeur: true });
const T_ACTIF = qui('sg-t-actif', { testeur: true });

let ok = 0; const ecarts = [];
const doit = async (l, p) => { try { await assertSucceeds(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (refusé à tort)'); } };
const refuse = async (l, p) => { try { await assertFails(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (AUTORISÉ À TORT)'); } };
const png = { contentType: 'image/png' };
const pdf = { contentType: 'application/pdf' };

await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const s = ctx.storage();
  await setDoc(doc(b, 'equipe/sg-agent'), { role: 'agent', actif: true, projets: [P] });
  await setDoc(doc(b, 'equipe/sg-inactif'), { role: 'admin', actif: false });
  await setDoc(doc(b, `projets/${P}`), { membres: ['sg-resp', 'sg-collab'], roles: { 'sg-resp': 'responsable', 'sg-collab': 'collaborateur' }, ouvert: true });
  await setDoc(doc(b, `projets/${Q}`), { membres: [], roles: {}, ouvert: true });
  await setDoc(doc(b, 'fichiers/sg-visible'), { projet: P, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'fichiers/sg-q'), { projet: Q, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'documents/sg-devis'), { projet: P, type: 'devis', statut: 'envoye' });
  await setDoc(doc(b, `projets/${P}/campagnes/sg-c`), { statut: 'en-cours', testeurs: ['sg-t-retire', 'sg-t-actif'] });
  await setDoc(doc(b, 'testeurs/sg-t-retire'), { actif: false, projets: [P] });
  await setDoc(doc(b, 'testeurs/sg-t-actif'), { actif: true, projets: [P] });
  await uploadString(ref(s, `projets/${P}/fichiers/sg-visible/a.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${Q}/fichiers/sg-q/b.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${P}/pieces/sg-devis/devis.pdf`), 'x', 'raw', pdf);
  await uploadString(ref(s, `projets/${P}/messages/m.png`), 'x', 'raw', png);
});

console.log('\n== Équipe');
await doit('Un agent télécharge un fichier de son projet', getBytes(ref(AGENT, `projets/${P}/fichiers/sg-visible/a.png`)));
await doit('et liste les fichiers de son projet', listAll(ref(AGENT, `projets/${P}/fichiers`)));
await refuse('mais pas un fichier d un autre projet', getBytes(ref(AGENT, `projets/${Q}/fichiers/sg-q/b.png`)));
await refuse('ni ne liste un autre projet', listAll(ref(AGENT, `projets/${Q}/fichiers`)));
await refuse('Un membre désactivé (jeton « equipe » encore valide) ne télécharge plus rien', getBytes(ref(INACTIF, `projets/${P}/fichiers/sg-visible/a.png`)));
await refuse('ni ne liste', listAll(ref(INACTIF, `projets/${P}/fichiers`)));
await refuse('ni ne dépose', uploadString(ref(INACTIF, `projets/${P}/fichiers/sg-n/c.png`), 'x', 'raw', png));
await refuse('ni ne lit le PDF d une pièce', getBytes(ref(INACTIF, `projets/${P}/pieces/sg-devis/devis.pdf`)));

console.log('\n== Client');
await doit('Le responsable télécharge le PDF du devis', getBytes(ref(RESP, `projets/${P}/pieces/sg-devis/devis.pdf`)));
await refuse('Le collaborateur ne télécharge pas le PDF du devis (finance)', getBytes(ref(COLLAB, `projets/${P}/pieces/sg-devis/devis.pdf`)));
await doit('mais il télécharge un fichier visible du projet', getBytes(ref(COLLAB, `projets/${P}/fichiers/sg-visible/a.png`)));
await doit('et une pièce de la conversation', getBytes(ref(COLLAB, `projets/${P}/messages/m.png`)));
await refuse('Un client retiré (jeton « projets » encore valide) ne télécharge plus', getBytes(ref(RETIRE, `projets/${P}/fichiers/sg-visible/a.png`)));
await refuse('ni la conversation', getBytes(ref(RETIRE, `projets/${P}/messages/m.png`)));
await refuse('ni ne dépose', uploadString(ref(RETIRE, `projets/${P}/messages/r.png`), 'x', 'raw', png));

console.log('\n== Testeur');
await doit('Un testeur actif de la campagne dépose sa preuve', uploadString(ref(T_ACTIF, `campagnes/${P}/sg-c/sg-t-actif/p.png`), 'x', 'raw', png));
await refuse('Un testeur retiré (jeton « testeur » encore valide) ne dépose plus', uploadString(ref(T_RETIRE, `campagnes/${P}/sg-c/sg-t-retire/p.png`), 'x', 'raw', png));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
