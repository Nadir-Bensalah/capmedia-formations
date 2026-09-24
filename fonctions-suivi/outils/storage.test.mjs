/* ==========================================================================
   CAPMEDIA CLIENT HUB · les règles Storage à l'épreuve

   Émulateurs Storage ET Firestore : certaines règles relisent une fiche
   Firestore (visibilité d'un fichier, statut d'une pièce, testeurs d'une
   campagne). Chaque essai est un droit attendu ou une tentative d'abus.

     node fonctions-suivi/outils/storage.test.mjs
   (FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)

   Le test pose ses propres données sous des identifiants « st-… ». Il vide
   le Storage de l'émulateur (un dépôt d'un passage précédent ferait passer
   une création pour un écrasement), pas la base Firestore.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadString, getBytes, listAll, updateMetadata } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

/* L'émulateur Storage traite l'écriture sur un objet EXISTANT comme une
   création (« create »), là où la production y applique « update ». On le
   mesure ici sur des règles minimales (create permis, update refusé) : si
   l'écrasement passe, les essais d'écrasement ne prouvent rien au banc et
   sont classés « non vérifiables », jamais comptés conformes. Ce qui les
   garde alors est la vérification du texte des règles, plus bas : aucune
   clause « update » n'est ouverte à un autre que l'équipe. La sonde passe
   AVANT l'environnement du test : l'émulateur n'a qu'un jeu de règles
   Storage, qu'elle remplace. */
const nonVerifiables = [];
const sonde = await initializeTestEnvironment({ projectId: 'sonde-ecrasement', storage: { host: '127.0.0.1', port: 9199,
  rules: "rules_version='2'; service firebase.storage { match /b/{b}/o { match /{c=**} { allow read, create: if true; allow update: if false; } } }" } });
await sonde.clearStorage();
await sonde.withSecurityRulesDisabled((c) => uploadString(ref(c.storage(), 'x/existant.txt'), 'a', 'raw', { contentType: 'text/plain' }));
let emulateurConfond = false;
try { await uploadString(ref(sonde.authenticatedContext('u').storage(), 'x/existant.txt'), 'b', 'raw', { contentType: 'text/plain' }); emulateurConfond = true; } catch { /* l'émulateur distingue */ }
await sonde.cleanup();
const ecrasement = async (l, p) => {
  if (!emulateurConfond) return refuse(l, p);
  await p.catch(() => {});
  nonVerifiables.push(l); console.log('  ?      ' + l + ' (non vérifiable au banc)');
};

const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const env = await initializeTestEnvironment({
  projectId: PROJET,
  storage: { rules: readFileSync(new URL('../../suivi/storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const P = 'st-projet', Q = 'st-autre';
const jeton = (uid, extra = {}) => ({ email: `${uid}@exemple.test`, email_verified: true, sub: uid, ...extra });
const equipe = () => env.authenticatedContext('st-agent', jeton('st-agent', { equipe: true })).storage();
const client = () => env.authenticatedContext('st-client', jeton('st-client', { projets: [P] })).storage();
const autreClient = () => env.authenticatedContext('st-autre-client', jeton('st-autre-client', { projets: [Q] })).storage();
const testeur = () => env.authenticatedContext('st-testeur', jeton('st-testeur', { testeur: true })).storage();
const intrus = () => env.authenticatedContext('st-intrus', jeton('st-intrus', { testeur: true })).storage();

let ok = 0; const ecarts = [];
const doit = async (l, p) => { try { await assertSucceeds(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (refusé à tort)'); } };
const refuse = async (l, p) => { try { await assertFails(p); ok += 1; console.log('  ok     ' + l); } catch (e) { ecarts.push(l); console.log('  ÉCART  ' + l + ' (AUTORISÉ À TORT)'); } };
const png = { contentType: 'image/png' };
const pdf = { contentType: 'application/pdf' };

await env.clearStorage();
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const s = ctx.storage();
  /* Les fiches que les règles Storage relisent. */
  await setDoc(doc(b, 'fichiers/st-visible'), { projet: P, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'fichiers/st-interne'), { projet: P, visibilite: 'interne', archive: false });
  await setDoc(doc(b, 'fichiers/st-archive'), { projet: P, visibilite: 'client', archive: true });
  await setDoc(doc(b, 'fichiers/st-ailleurs'), { projet: Q, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'documents/st-devis'), { projet: P, type: 'devis', statut: 'envoye' });
  await setDoc(doc(b, 'documents/st-brouillon'), { projet: P, type: 'devis', statut: 'brouillon' });
  await setDoc(doc(b, 'documents/st-range'), { projet: P, type: 'facture', statut: 'payee', archive: true });
  await setDoc(doc(b, `projets/${P}/campagnes/st-en-cours`), { statut: 'en-cours', testeurs: ['st-testeur'] });
  await setDoc(doc(b, `projets/${P}/campagnes/st-close`), { statut: 'close', testeurs: ['st-testeur'] });
  /* Les objets. */
  for (const c of [`projets/${P}/fichiers/st-visible/a.png`, `projets/${P}/fichiers/st-interne/b.png`, `projets/${P}/fichiers/st-archive/c.png`, `projets/${Q}/fichiers/st-ailleurs/d.png`]) await uploadString(ref(s, c), 'x', 'raw', png);
  for (const c of [`projets/${P}/pieces/st-devis/devis.pdf`, `projets/${P}/pieces/st-brouillon/brouillon.pdf`, `projets/${P}/pieces/st-range/facture.pdf`]) await uploadString(ref(s, c), 'x', 'raw', pdf);
  await uploadString(ref(s, `projets/${P}/tickets/st-t/public.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${P}/tickets/st-t/interne.png`), 'x', 'raw', { contentType: 'image/png', customMetadata: { visibilite: 'interne' } });
  await uploadString(ref(s, `projets/${P}/messages/equipe.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${P}/documents/fichiers/ancien-interne.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${P}/documents/client/ancien-client.png`), 'x', 'raw', png);
  await uploadString(ref(s, `projets/${P}/documents/devis/ancien-devis.pdf`), 'x', 'raw', pdf);
  await uploadString(ref(s, `campagnes/${P}/st-en-cours/st-testeur/preuve.png`), 'x', 'raw', png);
  await uploadString(ref(s, 'preprojets/st-client/demande.png'), 'x', 'raw', png);
});

console.log('\n== Les fichiers d un projet : la fiche décide');
await doit('Le client télécharge un fichier visible de son projet', getBytes(ref(client(), `projets/${P}/fichiers/st-visible/a.png`)));
await refuse('Le client ne télécharge pas un fichier marqué interne', getBytes(ref(client(), `projets/${P}/fichiers/st-interne/b.png`)));
await refuse('ni un fichier archivé', getBytes(ref(client(), `projets/${P}/fichiers/st-archive/c.png`)));
await refuse('ni ne liste le dossier des fichiers', listAll(ref(client(), `projets/${P}/fichiers`)));
await refuse('ni le dossier d un fichier précis', listAll(ref(client(), `projets/${P}/fichiers/st-interne`)));
await refuse('Un autre client ne télécharge rien de ce projet', getBytes(ref(autreClient(), `projets/${P}/fichiers/st-visible/a.png`)));
await refuse('Le client ne lit pas un fichier rangé sous son projet mais dont la fiche est ailleurs', getBytes(ref(client(), `projets/${P}/fichiers/st-ailleurs/d.png`)));
await doit('L équipe télécharge un fichier interne', getBytes(ref(equipe(), `projets/${P}/fichiers/st-interne/b.png`)));
await doit('L équipe liste les fichiers', listAll(ref(equipe(), `projets/${P}/fichiers`)));
await doit('Le client dépose un nouveau fichier', uploadString(ref(client(), `projets/${P}/fichiers/st-nouveau/e.png`), 'x', 'raw', png));
await ecrasement('Le client n écrase pas un fichier déposé par Capmedia', uploadString(ref(client(), `projets/${P}/fichiers/st-visible/a.png`), 'y', 'raw', png));
await refuse('Le client ne dépose pas un exécutable', uploadString(ref(client(), `projets/${P}/fichiers/st-exe/f.exe`), 'x', 'raw', { contentType: 'application/x-msdownload' }));
await refuse('Le client ne dépose pas dans le projet d un autre', uploadString(ref(client(), `projets/${Q}/fichiers/st-z/g.png`), 'x', 'raw', png));

console.log('\n== Les PDF comptables : jamais un brouillon');
await doit('Le client télécharge le PDF d un devis envoyé', getBytes(ref(client(), `projets/${P}/pieces/st-devis/devis.pdf`)));
await refuse('Le client ne télécharge pas le PDF d un devis en brouillon', getBytes(ref(client(), `projets/${P}/pieces/st-brouillon/brouillon.pdf`)));
await refuse('ni celui d une pièce archivée', getBytes(ref(client(), `projets/${P}/pieces/st-range/facture.pdf`)));
await refuse('ni ne liste les pièces', listAll(ref(client(), `projets/${P}/pieces`)));
await refuse('Le client ne dépose pas de PDF comptable', uploadString(ref(client(), `projets/${P}/pieces/st-devis/faux.pdf`), 'x', 'raw', pdf));
await doit('L équipe lit le brouillon', getBytes(ref(equipe(), `projets/${P}/pieces/st-brouillon/brouillon.pdf`)));
await doit('L équipe dépose un PDF', uploadString(ref(equipe(), `projets/${P}/pieces/st-devis/v2.pdf`), 'x', 'raw', pdf));

console.log('\n== Les pièces des demandes : une note interne reste interne');
await doit('Le client lit une pièce jointe publique', getBytes(ref(client(), `projets/${P}/tickets/st-t/public.png`)));
await refuse('Le client ne lit pas la pièce d une note interne', getBytes(ref(client(), `projets/${P}/tickets/st-t/interne.png`)));
await doit('L équipe la lit', getBytes(ref(equipe(), `projets/${P}/tickets/st-t/interne.png`)));
await doit('Le client joint une pièce', uploadString(ref(client(), `projets/${P}/tickets/st-t/client.png`), 'x', 'raw', png));
await ecrasement('Le client n écrase pas une pièce de l équipe', uploadString(ref(client(), `projets/${P}/tickets/st-t/public.png`), 'y', 'raw', png));
await refuse('Le client ne rend pas publique une pièce interne', updateMetadata(ref(client(), `projets/${P}/tickets/st-t/interne.png`), { customMetadata: { visibilite: 'client' } }));
await doit('L équipe remet une pièce d accord avec son message', updateMetadata(ref(equipe(), `projets/${P}/tickets/st-t/public.png`), { customMetadata: { visibilite: 'client' } }));
await refuse('Le client ne liste pas les pièces d une demande', listAll(ref(client(), `projets/${P}/tickets/st-t`)));

console.log('\n== La conversation du projet');
await doit('Le client lit une pièce de la conversation', getBytes(ref(client(), `projets/${P}/messages/equipe.png`)));
await doit('Le client joint une pièce à la conversation', uploadString(ref(client(), `projets/${P}/messages/client.png`), 'x', 'raw', png));
await ecrasement('Le client n écrase pas la pièce de l équipe', uploadString(ref(client(), `projets/${P}/messages/equipe.png`), 'y', 'raw', png));
await refuse('Un autre client ne lit pas la conversation', getBytes(ref(autreClient(), `projets/${P}/messages/equipe.png`)));

console.log('\n== L ancien rangement, en attente de migration');
await refuse('Le client ne lit plus un fichier de l équipe à l ancien chemin (visibilité inconnue)', getBytes(ref(client(), `projets/${P}/documents/fichiers/ancien-interne.png`)));
await refuse('ni un ancien PDF comptable (statut inconnu)', getBytes(ref(client(), `projets/${P}/documents/devis/ancien-devis.pdf`)));
await doit('Le client lit encore ses propres dépôts à l ancien chemin', getBytes(ref(client(), `projets/${P}/documents/client/ancien-client.png`)));
await refuse('Plus rien ne s écrit à l ancien chemin, même l équipe', uploadString(ref(equipe(), `projets/${P}/documents/fichiers/nouveau.png`), 'x', 'raw', png));

console.log('\n== Les preuves des testeurs : sa campagne, et elle seule');
await doit('Le testeur de la campagne en cours dépose sa preuve', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p2.png`), 'x', 'raw', png));
await refuse('Un testeur hors de la campagne ne dépose rien, même dans son dossier', uploadString(ref(intrus(), `campagnes/${P}/st-en-cours/st-intrus/p.png`), 'x', 'raw', png));
await refuse('Un testeur ne dépose pas pour une campagne close', uploadString(ref(testeur(), `campagnes/${P}/st-close/st-testeur/p.png`), 'x', 'raw', png));
await refuse('ni pour une campagne d un autre projet', uploadString(ref(testeur(), `campagnes/${Q}/st-en-cours/st-testeur/p.png`), 'x', 'raw', png));
await refuse('ni dans le dossier d un autre testeur', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-intrus/p.png`), 'x', 'raw', png));
await ecrasement('ni n écrase une preuve déjà déposée', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/preuve.png`), 'y', 'raw', png));
await doit('Le client du projet lit la preuve', getBytes(ref(client(), `campagnes/${P}/st-en-cours/st-testeur/preuve.png`)));
await refuse('Un autre client ne la lit pas', getBytes(ref(autreClient(), `campagnes/${P}/st-en-cours/st-testeur/preuve.png`)));

console.log('\n== Une demande de nouveau projet');
await doit('L équipe dépose sa réponse dans le dossier du demandeur', uploadString(ref(equipe(), 'preprojets/st-client/reponse.png'), 'x', 'raw', png));
await doit('Le demandeur la lit', getBytes(ref(client(), 'preprojets/st-client/reponse.png')));
await refuse('Un autre compte ne la lit pas', getBytes(ref(autreClient(), 'preprojets/st-client/reponse.png')));
await ecrasement('Le demandeur n écrase pas la réponse de l équipe', uploadString(ref(client(), 'preprojets/st-client/reponse.png'), 'y', 'raw', png));

console.log('\n== Le reste est fermé');
await refuse('Aucun dossier hors du rangement', uploadString(ref(equipe(), 'ailleurs/x.png'), 'x', 'raw', png));
await refuse('Un visiteur ne lit rien', getBytes(ref(env.unauthenticatedContext().storage(), `projets/${P}/fichiers/st-visible/a.png`)));

console.log('\n== Le texte des règles : « update » réservé à l équipe');
/* La garde de l'écrasement quand l'émulateur ne sait pas la jouer : chaque
   clause qui permet « update » ne l'ouvre qu'à l'équipe (ou à personne). */
const texteRegles = readFileSync(new URL('../../suivi/storage.rules', import.meta.url), 'utf8');
const clausesUpdate = [...texteRegles.matchAll(/allow ([a-z, ]*\bupdate\b[a-z, ]*):\s*if ([^;]+);/g)];
if (!clausesUpdate.length) { ecarts.push('aucune clause update trouvée'); console.log('  ÉCART  aucune clause update trouvée : la lecture des règles est à revoir'); }
for (const [, ops, cond] of clausesUpdate) {
  const c = cond.replace(/\s+/g, ' ').trim();
  const reserve = c === 'false' || c === 'estEquipe()' || /^estEquipe\(\) && fichierAccepte\(\)$/.test(c);
  if (reserve) { ok += 1; console.log(`  ok     allow ${ops.trim()} : ${c}`); }
  else { ecarts.push(`allow ${ops.trim()} : ${c}`); console.log(`  ÉCART  allow ${ops.trim()} ouvert au-delà de l équipe : ${c}`); }
}
/* Et aucune clause « write » globale ne rouvre l'écriture (write = create + update + delete). */
for (const [, cond] of texteRegles.matchAll(/allow [a-z, ]*\bwrite\b[a-z, ]*:\s*if ([^;]+);/g)) {
  if (cond.trim() === 'false') { ok += 1; console.log('  ok     allow write : false'); }
  else { ecarts.push(`allow write : ${cond.trim()}`); console.log(`  ÉCART  allow write ouvert : ${cond.trim()}`); }
}

if (nonVerifiables.length) console.log(`\n${nonVerifiables.length} essai(s) d écrasement non vérifiable(s) au banc (l émulateur confond écrasement et création) : gardés par le texte des règles ci-dessus.`);
console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
