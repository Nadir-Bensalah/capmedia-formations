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
import { ref, uploadString, uploadBytes, getBytes, listAll, updateMetadata, deleteObject } from 'firebase/storage';
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
/* Les ports : ceux de FIREBASE_STORAGE_EMULATOR_HOST et
   FIRESTORE_EMULATOR_HOST quand ils sont posés (émulateur à part), sinon
   9199 et 8080. */
const portDe = (v, defaut) => Number(String(process.env[v] || '').split(':')[1]) || defaut;
const PORT_STOCKAGE = portDe('FIREBASE_STORAGE_EMULATOR_HOST', 9199);
const PORT_BASE = portDe('FIRESTORE_EMULATOR_HOST', 8080);
const sonde = await initializeTestEnvironment({ projectId: 'sonde-ecrasement', storage: { host: '127.0.0.1', port: PORT_STOCKAGE,
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
  storage: { rules: readFileSync(new URL('../../suivi/storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: PORT_STOCKAGE },
  firestore: { rules: readFileSync(new URL('../../suivi/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: PORT_BASE },
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
  /* Les fiches que les règles Storage relisent. Depuis la Gate 2, le jeton
     ne suffit plus : la fiche d'équipe (active), les membres et les rôles
     du projet, la fiche du testeur sont relus à chaque requête. */
  await setDoc(doc(b, 'equipe/st-agent'), { nom: 'Agent', role: 'admin', actif: true });
  await setDoc(doc(b, `projets/${P}`), { nom: 'St', membres: ['st-client'], roles: { 'st-client': 'responsable' }, ouvert: true });
  await setDoc(doc(b, `projets/${Q}`), { nom: 'Autre', membres: ['st-autre-client'], roles: { 'st-autre-client': 'responsable' }, ouvert: true });
  await setDoc(doc(b, 'testeurs/st-testeur'), { prenom: 'Testeur', actif: true, projets: [P] });
  await setDoc(doc(b, 'testeurs/st-intrus'), { prenom: 'Intrus', actif: true, projets: [P] });
  await setDoc(doc(b, 'fichiers/st-visible'), { projet: P, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'fichiers/st-interne'), { projet: P, visibilite: 'interne', archive: false });
  await setDoc(doc(b, 'fichiers/st-archive'), { projet: P, visibilite: 'client', archive: true });
  await setDoc(doc(b, 'fichiers/st-ailleurs'), { projet: Q, visibilite: 'client', archive: false });
  await setDoc(doc(b, 'documents/st-devis'), { projet: P, type: 'devis', statut: 'envoye' });
  await setDoc(doc(b, 'documents/st-brouillon'), { projet: P, type: 'devis', statut: 'brouillon' });
  await setDoc(doc(b, 'documents/st-range'), { projet: P, type: 'facture', statut: 'payee', archive: true });
  await setDoc(doc(b, `projets/${P}/campagnes/st-en-cours`), { statut: 'en-cours', testeurs: ['st-testeur'] });
  await setDoc(doc(b, `projets/${P}/campagnes/st-close`), { statut: 'close', testeurs: ['st-testeur'] });
  /* L'équipe a clos l'accès (« fins » passée) sans « j'ai terminé » ; et
     une campagne où le testeur a dit « j'ai terminé ». */
  await setDoc(doc(b, `projets/${P}/campagnes/st-acces-clos`), { statut: 'en-cours', testeurs: ['st-testeur'], fins: { 'st-testeur': new Date(Date.now() - 60000) } });
  await setDoc(doc(b, `projets/${P}/campagnes/st-termine`), { statut: 'en-cours', testeurs: ['st-testeur'], termines: { 'st-testeur': new Date() }, fins: { 'st-testeur': new Date(Date.now() + 5 * 86400000) } });
  await setDoc(doc(b, 'testeurs/st-retire'), { prenom: 'Retiré', actif: false, projets: [P] });
  await setDoc(doc(b, `projets/${P}/campagnes/st-retire`), { statut: 'en-cours', testeurs: ['st-retire'] });
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
  for (const c of ['st-en-cours', 'st-acces-clos', 'st-retire']) await uploadString(ref(s, `projets/${P}/campagnes/${c}/visuels/ecran.png`), 'x', 'raw', png);
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
/* H1. « Clore l'accès » ferme aussi le dépôt de preuves. */
await refuse('Accès clos par l équipe : plus de dépôt de preuve', uploadString(ref(testeur(), `campagnes/${P}/st-acces-clos/st-testeur/p.png`), 'x', 'raw', png));
await refuse('Test terminé : plus de dépôt de preuve non plus', uploadString(ref(testeur(), `campagnes/${P}/st-termine/st-testeur/p.png`), 'x', 'raw', png));
/* M3. Une preuve est une capture ou une vidéo, bornée. */
const MO = 1024 * 1024;
await doit('Une capture JPEG passe', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p3.jpg`), 'x', 'raw', { contentType: 'image/jpeg' }));
await doit('Une vidéo d écran MP4 passe', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p4.mp4`), 'x', 'raw', { contentType: 'video/mp4' }));
await refuse('Le testeur ne dépose pas un zip comme preuve', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p.zip`), 'x', 'raw', { contentType: 'application/zip' }));
await refuse('ni un SVG', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p.svg`), '<svg/>', 'raw', { contentType: 'image/svg+xml' }));
await refuse('ni un document Word', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p.docx`), 'x', 'raw', { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
await refuse('ni un PDF', uploadString(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/p.pdf`), 'x', 'raw', pdf));
await refuse('ni une image de plus de 10 Mo', uploadBytes(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/grande.png`), new Uint8Array(10 * MO + 1), png));
await refuse('ni une vidéo de plus de 50 Mo', uploadBytes(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/longue.mp4`), new Uint8Array(50 * MO + 1), { contentType: 'video/mp4' }));
await doit('Une vidéo de 49 Mo passe', uploadBytes(ref(testeur(), `campagnes/${P}/st-en-cours/st-testeur/moyenne.mp4`), new Uint8Array(49 * MO), { contentType: 'video/mp4' }));

console.log('\n== Les écrans d une campagne : le testeur, tant que son accès court');
await doit('Le testeur de la campagne voit ses écrans', getBytes(ref(testeur(), `projets/${P}/campagnes/st-en-cours/visuels/ecran.png`)));
await refuse('Un testeur hors de la campagne ne les voit pas', getBytes(ref(intrus(), `projets/${P}/campagnes/st-en-cours/visuels/ecran.png`)));
/* F4. Accès clos, ou testeur retiré : son jeton vit encore une heure, la
   fiche relue ferme la porte tout de suite. */
await refuse('Accès clos : le testeur ne voit plus les écrans', getBytes(ref(testeur(), `projets/${P}/campagnes/st-acces-clos/visuels/ecran.png`)));
await refuse('Testeur retiré, jeton encore valide : plus d écrans', getBytes(ref(env.authenticatedContext('st-retire', jeton('st-retire', { testeur: true })).storage(), `projets/${P}/campagnes/st-retire/visuels/ecran.png`)));
await doit('Le client du projet les voit', getBytes(ref(client(), `projets/${P}/campagnes/st-en-cours/visuels/ecran.png`)));

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
  /* Réservé à l'équipe : l'équipe entière, un administrateur, ou l'équipe
     autorisée sur le projet (Gate 2), avec ou sans contrôle du fichier. */
  /* Et, pour les pièces comptables, la finance de l'équipe (Gate 2). */
  const reserve = c === 'false' || /^(estEquipe\(\)|estAdmin\(\)|equipeSurProjet\(projetId\)|financeGerer\(projetId\))( && fichierAccepte\(\))?$/.test(c);
  if (reserve) { ok += 1; console.log(`  ok     allow ${ops.trim()} : ${c}`); }
  else { ecarts.push(`allow ${ops.trim()} : ${c}`); console.log(`  ÉCART  allow ${ops.trim()} ouvert au-delà de l équipe : ${c}`); }
}
/* Et aucune clause « write » globale ne rouvre l'écriture (write = create + update + delete). */
for (const [, cond] of texteRegles.matchAll(/allow [a-z, ]*\bwrite\b[a-z, ]*:\s*if ([^;]+);/g)) {
  if (cond.trim() === 'false') { ok += 1; console.log('  ok     allow write : false'); }
  else { ecarts.push(`allow write : ${cond.trim()}`); console.log(`  ÉCART  allow write ouvert : ${cond.trim()}`); }
}

console.log('\n== Les règles de transition ne diffèrent que par l ancien rangement');
/* suivi/storage.transition.rules part AVANT la migration : il doit être
   storage.rules à l'identique, sauf les droits d'avant sur
   projets/{p}/documents/**. Une autre différence serait une règle que
   personne n'a relue. */
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '').trimEnd()).filter((l) => l.trim()).join('\n');
/* Les blocs « match /projets/{projetId}/documents/... { ... } », accolades comptées. */
const blocsAncien = (t) => {
  const lignes = sansCommentaires(t).split('\n'); const dedans = []; const dehors = [];
  for (let i = 0; i < lignes.length; i += 1) {
    if (!/match \/projets\/\{projetId\}\/documents\//.test(lignes[i])) { dehors.push(lignes[i]); continue; }
    let prof = 0;
    for (; i < lignes.length; i += 1) { dedans.push(lignes[i]); prof += (lignes[i].match(/\{/g) || []).length - (lignes[i].match(/\}/g) || []).length; if (prof <= 0 && /\}\s*$/.test(lignes[i])) break; }
  }
  return { dedans: dedans.join('\n'), dehors: dehors.join('\n') };
};
const sansAncien = (t) => blocsAncien(t).dehors;
const transition = readFileSync(new URL('../../suivi/storage.transition.rules', import.meta.url), 'utf8');
if (sansAncien(transition) === sansAncien(texteRegles)) { ok += 1; console.log('  ok     hors de l ancien rangement, transition et règles finales sont identiques'); }
else { ecarts.push('storage.transition.rules diffère de storage.rules ailleurs que sur l ancien rangement'); console.log('  ÉCART  storage.transition.rules diffère de storage.rules ailleurs que sur l ancien rangement'); }
const blocs = (t) => blocsAncien(t).dedans;
const ecritureClient = /documents\/client[\s\S]*?allow create, update: if \(estEquipe\(\) \|\| surSonProjet\(projetId\)\)/.test(blocs(transition));
if (ecritureClient && /allow get, list: if estEquipe\(\) \|\| surSonProjet\(projetId\);/.test(blocs(transition))) { ok += 1; console.log('  ok     la transition rend à l ancien rangement ses droits d avant (lecture des membres, dépôt client)'); }
else { ecarts.push('la transition ne rend pas les droits d avant'); console.log('  ÉCART  la transition ne rend pas les droits d avant'); }

console.log('\n== Les réponses du client : pièces d une validation, pièces d une tâche (brief B)');
/* Le client dépose ses remarques sous « reponse » de la validation, et sa
   réponse sous « reponse » de la tâche ; il relit ce qu'il a déposé,
   l'équipe aussi. Un autre client ne lit rien, personne n'écrase, et la
   racine des pièces de validation reste à l'équipe. */
await doit('Le client joint une pièce à sa réponse de validation', uploadString(ref(client(), `projets/${P}/validations/st-v/reponse/remarque.png`), 'x', 'raw', png));
await doit('et la relit', getBytes(ref(client(), `projets/${P}/validations/st-v/reponse/remarque.png`)));
await doit('L équipe la lit', getBytes(ref(equipe(), `projets/${P}/validations/st-v/reponse/remarque.png`)));
await refuse('Un autre client ne la lit pas', getBytes(ref(autreClient(), `projets/${P}/validations/st-v/reponse/remarque.png`)));
await refuse('Le client ne dépose toujours pas à la racine des pièces de validation', uploadString(ref(client(), `projets/${P}/validations/st-v/maquette.png`), 'x', 'raw', png));
await refuse('ni dans la réponse d un autre projet', uploadString(ref(client(), `projets/${Q}/validations/st-v/reponse/x.png`), 'x', 'raw', png));
await refuse('ni un exécutable', uploadString(ref(client(), `projets/${P}/validations/st-v/reponse/x.exe`), 'x', 'raw', { contentType: 'application/x-msdownload' }));
await ecrasement('ni n écrase sa propre pièce', uploadString(ref(client(), `projets/${P}/validations/st-v/reponse/remarque.png`), 'y', 'raw', png));
await refuse('ni ne liste le dossier de sa réponse', listAll(ref(client(), `projets/${P}/validations/st-v/reponse`)));
await doit('Le client joint une pièce à sa réponse sur une tâche', uploadString(ref(client(), `projets/${P}/taches/st-t/reponse/capture.png`), 'x', 'raw', png));
await doit('et la relit', getBytes(ref(client(), `projets/${P}/taches/st-t/reponse/capture.png`)));
await doit('L équipe la lit', getBytes(ref(equipe(), `projets/${P}/taches/st-t/reponse/capture.png`)));
await refuse('Un autre client ne la lit pas', getBytes(ref(autreClient(), `projets/${P}/taches/st-t/reponse/capture.png`)));
await refuse('Le client ne dépose pas hors de « reponse » sur une tâche', uploadString(ref(client(), `projets/${P}/taches/st-t/autre.png`), 'x', 'raw', png));
await ecrasement('ni n écrase sa pièce', uploadString(ref(client(), `projets/${P}/taches/st-t/reponse/capture.png`), 'y', 'raw', png));

if (nonVerifiables.length) console.log(`\n${nonVerifiables.length} essai(s) d écrasement non vérifiable(s) au banc (l émulateur confond écrasement et création) : gardés par le texte des règles ci-dessus.`);
console.log('\n== Les pièces d une évolution de maintenance (agent D, 27/09/2026)');
/* Le client joint une capture à sa proposition, sous l identifiant de
   l évolution ; lui et l équipe la lisent, un autre client non. Le dossier
   ne se parcourt pas, et rien ne s y remplace ni ne s y efface côté client. */
/* deleteObject vient de l'import de tête (ajouté par l'agent E). */
await doit('Le client joint une capture à son évolution', uploadString(ref(client(), `projets/${P}/maintenance/st-ev/croquis.png`), 'x', 'raw', png));
await doit('et la relit', getBytes(ref(client(), `projets/${P}/maintenance/st-ev/croquis.png`)));
await doit('L équipe la lit aussi', getBytes(ref(equipe(), `projets/${P}/maintenance/st-ev/croquis.png`)));
await refuse('Un autre client ne la lit pas', getBytes(ref(autreClient(), `projets/${P}/maintenance/st-ev/croquis.png`)));
await refuse('Le testeur ne la lit pas', getBytes(ref(testeur(), `projets/${P}/maintenance/st-ev/croquis.png`)));
await refuse('Le client ne parcourt pas le dossier des évolutions', listAll(ref(client(), `projets/${P}/maintenance`)));
await refuse('Le client ne joint pas un exécutable', uploadString(ref(client(), `projets/${P}/maintenance/st-ev/x.exe`), 'x', 'raw', { contentType: 'application/x-msdownload' }));
await refuse('Le client ne dépose pas chez un autre projet', uploadString(ref(client(), `projets/${Q}/maintenance/st-ev/croquis.png`), 'x', 'raw', png));
await refuse('Le client ne modifie pas la pièce déposée', updateMetadata(ref(client(), `projets/${P}/maintenance/st-ev/croquis.png`), { customMetadata: { visibilite: 'interne' } }));
await refuse('Le client n efface pas la pièce', deleteObject(ref(client(), `projets/${P}/maintenance/st-ev/croquis.png`)));
await doit('L équipe efface la pièce', deleteObject(ref(equipe(), `projets/${P}/maintenance/st-ev/croquis.png`)));
if (/maintenance\/\{evolutionId\}/.test(readFileSync(new URL('../../suivi/storage.transition.rules', import.meta.url), 'utf8'))) { ok += 1; console.log('  ok     la règle des évolutions est aussi dans storage.transition.rules'); }
else { ecarts.push('storage.transition.rules n a pas la règle des évolutions'); console.log('  ÉCART  storage.transition.rules n a pas la règle des évolutions'); }

console.log('\n== Retirer son propre fichier : l auteur, et lui seul');
/* La fiche dit qui a déposé : le client efface l'objet de SON dépôt (la
   fiche est à son nom, visible client, sous ce projet), jamais celui de
   l'équipe ni celui d'un autre client. L'équipe efface ce qu'elle veut. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const b = ctx.firestore();
  const s = ctx.storage();
  await setDoc(doc(b, 'fichiers/st-mien'), { projet: P, visibilite: 'client', archive: false, par: { uid: 'st-client', cote: 'client' } });
  await setDoc(doc(b, 'fichiers/st-mien-interne'), { projet: P, visibilite: 'interne', archive: false, par: { uid: 'st-client', cote: 'client' } });
  await setDoc(doc(b, 'fichiers/st-mien-ailleurs'), { projet: Q, visibilite: 'client', archive: false, par: { uid: 'st-client', cote: 'client' } });
  for (const c of [`projets/${P}/fichiers/st-mien/m.png`, `projets/${P}/fichiers/st-mien-interne/i.png`, `projets/${P}/fichiers/st-mien-ailleurs/a.png`, `projets/${P}/fichiers/st-visible/z.png`]) await uploadString(ref(s, c), 'x', 'raw', png);
});
await refuse('Un autre client n efface pas mon fichier', deleteObject(ref(autreClient(), `projets/${P}/fichiers/st-mien/m.png`)));
await refuse('Le client n efface pas un fichier de l équipe', deleteObject(ref(client(), `projets/${P}/fichiers/st-visible/z.png`)));
await refuse('ni un fichier à son nom dont la fiche n est plus visible client', deleteObject(ref(client(), `projets/${P}/fichiers/st-mien-interne/i.png`)));
await refuse('ni un fichier dont la fiche pointe un autre projet', deleteObject(ref(client(), `projets/${P}/fichiers/st-mien-ailleurs/a.png`)));
await refuse('Un testeur n efface rien', deleteObject(ref(testeur(), `projets/${P}/fichiers/st-mien/m.png`)));
await doit('Le client efface le fichier qu il a lui-même déposé', deleteObject(ref(client(), `projets/${P}/fichiers/st-mien/m.png`)));
await doit('L équipe efface un fichier du projet', deleteObject(ref(equipe(), `projets/${P}/fichiers/st-visible/z.png`)));
if (/auteurDuFichier\(projetId, fichierId\)/.test(readFileSync(new URL('../../suivi/storage.transition.rules', import.meta.url), 'utf8'))) { ok += 1; console.log('  ok     la règle « retirer le sien » est aussi dans storage.transition.rules'); }
else { ecarts.push('storage.transition.rules n a pas la règle « retirer le sien »'); console.log('  ÉCART  storage.transition.rules n a pas la règle « retirer le sien »'); }

console.log('\n== La conversation d un testeur avec l équipe (octobre 2026)');
/* Le testeur joint une capture dans SA conversation, en disant qu'elle est
   de lui (métadonnée « par ») ; l'équipe la lit et en joint aussi. Un autre
   testeur, un client, un visiteur ne lisent rien ; un testeur retiré non
   plus ; personne d'autre que l'équipe ne remplace ni n'efface. */
const parMoi = (uid) => ({ contentType: 'image/png', customMetadata: { par: uid } });
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'testeurs/st-retire'), { prenom: 'Retiré', actif: false, projets: [P] });
  await uploadString(ref(ctx.storage(), 'conversationsTesteurs/st-testeur/equipe.png'), 'x', 'raw', parMoi('st-agent'));
});
const retire = () => env.authenticatedContext('st-retire', jeton('st-retire', { testeur: true })).storage();
await doit('Le testeur joint une capture à sa conversation', uploadString(ref(testeur(), 'conversationsTesteurs/st-testeur/capture.png'), 'x', 'raw', parMoi('st-testeur')));
await refuse('mais pas sans dire qu elle est de lui', uploadString(ref(testeur(), 'conversationsTesteurs/st-testeur/anonyme.png'), 'x', 'raw', png));
await refuse('ni au nom d un autre', uploadString(ref(testeur(), 'conversationsTesteurs/st-testeur/faux.png'), 'x', 'raw', parMoi('st-agent')));
await refuse('ni dans la conversation d un autre testeur', uploadString(ref(intrus(), 'conversationsTesteurs/st-testeur/x.png'), 'x', 'raw', parMoi('st-intrus')));
await refuse('ni un exécutable', uploadString(ref(testeur(), 'conversationsTesteurs/st-testeur/x.exe'), 'x', 'raw', { contentType: 'application/x-msdownload', customMetadata: { par: 'st-testeur' } }));
await doit('Il lit la pièce de l équipe', getBytes(ref(testeur(), 'conversationsTesteurs/st-testeur/equipe.png')));
await refuse('Un autre testeur ne la lit pas', getBytes(ref(intrus(), 'conversationsTesteurs/st-testeur/equipe.png')));
await refuse('ni un client', getBytes(ref(client(), 'conversationsTesteurs/st-testeur/equipe.png')));
await refuse('ni un testeur retiré, même dans son dossier', uploadString(ref(retire(), 'conversationsTesteurs/st-retire/x.png'), 'x', 'raw', parMoi('st-retire')));
await refuse('Le testeur ne parcourt pas le dossier', listAll(ref(testeur(), 'conversationsTesteurs/st-testeur')));
await refuse('Le testeur n efface pas une pièce', deleteObject(ref(testeur(), 'conversationsTesteurs/st-testeur/capture.png')));
await ecrasement('ni n écrase celle de l équipe', uploadString(ref(testeur(), 'conversationsTesteurs/st-testeur/equipe.png'), 'y', 'raw', parMoi('st-testeur')));
await doit('L équipe lit la capture du testeur', getBytes(ref(equipe(), 'conversationsTesteurs/st-testeur/capture.png')));
await doit('L équipe joint une pièce dans sa conversation', uploadString(ref(equipe(), 'conversationsTesteurs/st-testeur/reponse.png'), 'x', 'raw', parMoi('st-agent')));
await doit('L équipe efface une pièce', deleteObject(ref(equipe(), 'conversationsTesteurs/st-testeur/reponse.png')));
if (/match \/conversationsTesteurs\/\{testeurId\}\/\{nom\}/.test(readFileSync(new URL('../../suivi/storage.transition.rules', import.meta.url), 'utf8'))) { ok += 1; console.log('  ok     la règle des conversations de testeurs est aussi dans storage.transition.rules'); }
else { ecarts.push('storage.transition.rules n a pas la règle des conversations de testeurs'); console.log('  ÉCART  storage.transition.rules n a pas la règle des conversations de testeurs'); }

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
await env.cleanup();
process.exit(ecarts.length ? 1 : 0);
