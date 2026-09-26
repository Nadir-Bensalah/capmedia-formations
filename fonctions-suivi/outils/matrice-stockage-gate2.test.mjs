/* ==========================================================================
   CAPMEDIA CLIENT HUB · la matrice des fichiers (préflight Gate 2)

   La même grille que matrice-gate2, côté Storage : chaque catégorie de
   personne devant chaque geste sur les fichiers (lire, lister, déposer).
   La politique attendue est écrite ici ; une case autorisée à tort est une
   fuite, une case refusée à tort une fonction cassée.

     (émulateurs Storage et Firestore)
     node fonctions-suivi/outils/matrice-stockage-gate2.test.mjs
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

const P = 'ms-a';
const CATEGORIES = [
  ['ms-admin', 'Administrateur', { equipe: true }],
  ['ms-agent-a', 'Agent du projet A', { equipe: true }],
  ['ms-agent-b', 'Agent hors projet A', { equipe: true }],
  ['ms-agent-fin', 'Agent A avec finance.lecture', { equipe: true }],
  ['ms-inactif', 'Administrateur désactivé', { equipe: true }],
  ['ms-resp', 'Responsable de A', { projets: [P] }],
  ['ms-collab', 'Collaborateur de A', { projets: [P] }],
  ['ms-voisin', 'Même société, sans accès à A', { projets: ['ms-b'] }],
  ['ms-retire', 'Retiré de A (jeton d avant)', { projets: [P] }],
  ['ms-adefinir', 'Contact de A, rôle à définir', {}],
  ['ms-t-assigne', 'Testeur assigné sur A', { testeur: true }],
  ['ms-t-autre', 'Testeur non assigné', { testeur: true }],
];
const png = { contentType: 'image/png' };
const pdf = { contentType: 'application/pdf' };

await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const s = ctx.storage();
  const f = (c, d) => setDoc(doc(b, c), d);
  await f('equipe/ms-admin', { role: 'admin', actif: true });
  await f('equipe/ms-agent-a', { role: 'agent', actif: true, projets: [P] });
  await f('equipe/ms-agent-b', { role: 'agent', actif: true, projets: ['ms-z'] });
  await f('equipe/ms-agent-fin', { role: 'agent', actif: true, projets: [P], permissions: ['finance.lecture'] });
  await f('equipe/ms-inactif', { role: 'admin', actif: false });
  await f(`projets/${P}`, { ouvert: true, membres: ['ms-resp', 'ms-collab'], roles: { 'ms-resp': 'responsable', 'ms-collab': 'collaborateur' }, personnes: ['ms-resp', 'ms-collab', 'ms-adefinir'] });
  await f('projets/ms-b', { ouvert: true, membres: ['ms-voisin'], roles: { 'ms-voisin': 'responsable' } });
  await f('fichiers/ms-client', { projet: P, visibilite: 'client', archive: false });
  await f('fichiers/ms-interne', { projet: P, visibilite: 'interne', archive: false });
  await f('documents/ms-devis', { projet: P, type: 'devis', statut: 'envoye' });
  await f(`projets/${P}/campagnes/ms-c`, { statut: 'en-cours', testeurs: ['ms-t-assigne'] });
  await f('testeurs/ms-t-assigne', { actif: true, projets: [P] });
  await f('testeurs/ms-t-autre', { actif: true, projets: [] });
  const u = (c, meta = png) => uploadString(ref(s, c), 'x', 'raw', meta);
  await u(`projets/${P}/fichiers/ms-client/a.png`);
  await u(`projets/${P}/fichiers/ms-interne/b.png`);
  await u(`projets/${P}/pieces/ms-devis/devis.pdf`, pdf);
  await u(`projets/${P}/tickets/t1/capture.png`);
  await u(`projets/${P}/tickets/t1/note.png`, { contentType: 'image/png', customMetadata: { visibilite: 'interne' } });
  await u(`projets/${P}/messages/m.png`);
  await u(`projets/${P}/documents/devis/ancien.pdf`, pdf);
  await u(`projets/${P}/documents/client/depot.png`);
  await u(`campagnes/${P}/ms-c/ms-t-assigne/preuve.png`);
});

const EQUIPE_A = ['ms-admin', 'ms-agent-a', 'ms-agent-fin'];
const CLIENTS_A = ['ms-resp', 'ms-collab'];
const lire = (c) => (st) => getBytes(ref(st, c));
const lister = (c) => (st) => listAll(ref(st, c));
const deposer = (c, meta = png) => (st) => uploadString(ref(st, c), 'x', 'raw', meta);

const OPS = [
  ['lire un fichier visible de A', lire(`projets/${P}/fichiers/ms-client/a.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['lire un fichier interne de A', lire(`projets/${P}/fichiers/ms-interne/b.png`), EQUIPE_A],
  ['lister les fichiers de A', lister(`projets/${P}/fichiers`), EQUIPE_A],
  ['déposer un fichier sur A', deposer(`projets/${P}/fichiers/nouveau/c.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['lire le PDF d un devis de A', lire(`projets/${P}/pieces/ms-devis/devis.pdf`), ['ms-admin', 'ms-agent-fin', 'ms-resp']],
  ['lister les pièces comptables de A', lister(`projets/${P}/pieces`), ['ms-admin', 'ms-agent-fin']],
  ['déposer une pièce comptable', deposer(`projets/${P}/pieces/ms-devis/autre.pdf`, pdf), ['ms-admin']],
  ['lire un ancien PDF comptable', lire(`projets/${P}/documents/devis/ancien.pdf`), ['ms-admin', 'ms-agent-fin']],
  ['lire un ancien dépôt client', lire(`projets/${P}/documents/client/depot.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['lire la capture d une demande', lire(`projets/${P}/tickets/t1/capture.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['lire la pièce d une note interne', lire(`projets/${P}/tickets/t1/note.png`), EQUIPE_A],
  ['lire une pièce de la conversation', lire(`projets/${P}/messages/m.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['lister la racine de A', lister(`projets/${P}`), ['ms-admin']],
  ['lire une preuve de recette', lire(`campagnes/${P}/ms-c/ms-t-assigne/preuve.png`), [...EQUIPE_A, ...CLIENTS_A]],
  ['déposer sa preuve de recette', (st, uid) => uploadString(ref(st, `campagnes/${P}/ms-c/${uid}/p.png`), 'x', 'raw', png), ['ms-t-assigne']],
  ['lister tout le stockage', lister('projets'), ['ms-admin']],
];

let ok = 0; const ecarts = [];
for (const [uid, libelle, jeton] of CATEGORIES) {
  console.log(`\n== ${libelle}`);
  for (const [nom, faire, autorises] of OPS) {
    const st = env.authenticatedContext(uid, { email: `${uid}@exemple.test`, email_verified: true, ...jeton }).storage();
    const attendu = autorises.includes(uid);
    let obtenu;
    try { await assertSucceeds(faire(st, uid)); obtenu = true; } catch (e) {
      try { await assertFails(faire(st, uid)); obtenu = false; } catch (e2) { obtenu = null; }
    }
    if (obtenu === attendu) { ok += 1; console.log(`  ok     ${attendu ? 'peut ' : 'ne peut pas '}${nom}`); }
    else { const m = `${libelle} : ${nom} (${attendu ? 'refusé à tort' : 'AUTORISÉ À TORT'})`; ecarts.push(m); console.log(`  ÉCART  ${m}`); }
  }
}
await env.cleanup();
console.log(`\n${ok} case(s) conforme(s) sur ${CATEGORIES.length * OPS.length}${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
