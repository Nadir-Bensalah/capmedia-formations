/* ==========================================================================
   CAPMEDIA CLIENT HUB · la migration « confidentialité » à l'épreuve

   Pose l'ANCIEN rangement sur l'émulateur (champs internes sur les fiches
   que le client lit, profil commun des testeurs, fichiers à l'ancien
   chemin, pièce de note interne sans marque), lance
   migrer-confidentialite.mjs, et vérifie :
   - l'essai à blanc n'écrit rien ;
   - --vrai déplace chaque donnée interne et ne laisse rien derrière ;
   - un second passage ne trouve plus rien à faire.

   Émulateurs Firestore et Storage seulement. Le test pose ses données sous
   des identifiants « mig-… » ; il ne vide pas la base.

     node fonctions-suivi/outils/migration.test.mjs
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Émulateurs Firestore et Storage requis (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST).');
  process.exit(2);
}
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const BUCKET = `${PROJET}.firebasestorage.app`;
initializeApp({ projectId: PROJET, storageBucket: BUCKET });
const bdd = getFirestore();
const seau = getStorage().bucket(BUCKET);

let ok = 0; const ecarts = [];
const verifier = (l, vrai) => { if (vrai) { ok += 1; console.log('  ok     ' + l); } else { ecarts.push(l); console.log('  ÉCART  ' + l); } };
const lire = async (chemin) => { const d = await bdd.doc(chemin).get(); return d.exists ? d.data() : null; };
const existe = async (chemin) => (await seau.file(chemin).exists())[0];
const migrer = (...options) => execFileSync(process.execPath, [fileURLToPath(new URL('./migrer-confidentialite.mjs', import.meta.url)), ...options],
  { encoding: 'utf8', env: { ...process.env, GCLOUD_PROJECT: PROJET, BUCKET } });

/* L'ancien rangement. */
const P = 'mig-projet';
const ANCIEN_FICHIER = `projets/${P}/documents/fichiers/maquette.png`;
const ANCIEN_PDF = `projets/${P}/documents/devis/devis-mig.pdf`;
const PIECE_NOTE = `projets/${P}/tickets/mig-ticket/capture-interne.png`;
const PIECE_PUBLIQUE = `projets/${P}/tickets/mig-ticket/capture-client.png`;

await bdd.doc(`projets/${P}`).set({ nom: 'Projet de migration', organisation: 'mig-org', budget: 4800, budgetNote: 'marge serrée', sante: 'attention' });
await bdd.doc('organisations/mig-org').set({ nom: 'Organisation fictive', notesInternes: 'paie en retard' });
await bdd.doc('paiements/mig-paiement').set({ projet: P, montant: 1200, note: 'relancé deux fois' });
await bdd.doc('testeurs/mig-testeur').set({ nom: 'Testeur fictif', projets: [P], actif: true, mobile: 'ios', plateformes: ['ios'], profil: { age: '30-39', fonction: 'commercial' } });
await bdd.doc('testeurs/mig-testeur/public/profil').set({ age: '30-39', projets: [P] });
await bdd.doc('equipe/mig-agent').set({ nom: 'Agent fictif', email: 'agent@exemple.test', actif: true });
await bdd.doc('fichiers/mig-fichier').set({ projet: P, nom: 'maquette.png', chemin: ANCIEN_FICHIER, visibilite: 'client' });
await bdd.doc('documents/mig-devis').set({ projet: P, type: 'devis', statut: 'envoye', fichier: { nom: 'devis-mig.pdf', chemin: ANCIEN_PDF } });
await bdd.doc('tickets/mig-ticket').set({ projet: P, titre: 'Demande de migration' });
await bdd.doc('tickets/mig-ticket/messages/note').set({ interne: true, texte: 'à voir', pieces: [{ nom: 'capture-interne.png', chemin: PIECE_NOTE }] });
await bdd.doc('tickets/mig-ticket/messages/reponse').set({ interne: false, texte: 'voici', pieces: [{ nom: 'capture-client.png', chemin: PIECE_PUBLIQUE }] });
for (const [c, type] of [[ANCIEN_FICHIER, 'image/png'], [ANCIEN_PDF, 'application/pdf'], [PIECE_NOTE, 'image/png'], [PIECE_PUBLIQUE, 'image/png']]) {
  await seau.file(c).save(Buffer.from('x'), { contentType: type });
}

console.log('\n== L essai à blanc n écrit rien');
const blanc = migrer();
verifier('le bilan annonce un essai à blanc', /Essai à blanc/.test(blanc));
verifier('le budget reste sur la fiche du projet', (await lire(`projets/${P}`)).budget === 4800);
verifier('aucune fiche interne n est créée', (await lire(`projetsInternes/${P}`)) === null);
verifier('le fichier reste à l ancien chemin', (await lire('fichiers/mig-fichier')).chemin === ANCIEN_FICHIER);

console.log('\n== --vrai déplace chaque donnée interne');
migrer('--vrai');
const projet = await lire(`projets/${P}`);
const interne = await lire(`projetsInternes/${P}`);
verifier('la fiche du projet ne porte plus budget, note ni santé', !('budget' in projet) && !('budgetNote' in projet) && !('sante' in projet));
verifier('projetsInternes les porte', interne && interne.budget === 4800 && interne.budgetNote === 'marge serrée' && interne.sante === 'attention');
verifier('l organisation ne porte plus ses notes internes', !('notesInternes' in (await lire('organisations/mig-org'))));
verifier('organisationsInternes les porte', (await lire('organisationsInternes/mig-org'))?.notesInternes === 'paie en retard');
verifier('le paiement ne porte plus sa note', !('note' in (await lire('paiements/mig-paiement'))));
verifier('paiementsInternes la porte', (await lire('paiementsInternes/mig-paiement'))?.note === 'relancé deux fois');
verifier('l ancien profil commun du testeur est effacé', (await lire('testeurs/mig-testeur/public/profil')) === null);
const profil = await lire(`projets/${P}/profilsTesteurs/mig-testeur`);
verifier('son profil est recopié sous le projet', profil && profil.fonction === 'commercial' && profil.mobile === 'ios');
verifier('le profil recopié ne dit pas sur quels autres projets il teste', profil && !('projets' in profil));
verifier('l annuaire porte le nom de l agent', (await lire('annuaire/mig-agent'))?.nom === 'Agent fictif');
verifier('l annuaire ne porte pas son adresse', !('email' in ((await lire('annuaire/mig-agent')) || {})));

const nouveauFichier = `projets/${P}/fichiers/mig-fichier/maquette.png`;
const nouveauPdf = `projets/${P}/pieces/mig-devis/devis-mig.pdf`;
verifier('la fiche du fichier pointe sous son identifiant', (await lire('fichiers/mig-fichier')).chemin === nouveauFichier);
verifier('l objet y est copié', await existe(nouveauFichier));
verifier('l ancien objet est conservé sans --supprimer-anciens', await existe(ANCIEN_FICHIER));
verifier('la pièce comptable pointe sous son identifiant', (await lire('documents/mig-devis')).fichier.chemin === nouveauPdf);
verifier('le PDF y est copié', await existe(nouveauPdf));
const [metaNote] = await seau.file(PIECE_NOTE).getMetadata();
const [metaPublique] = await seau.file(PIECE_PUBLIQUE).getMetadata();
verifier('la pièce de la note interne est marquée interne', (metaNote.metadata || {}).visibilite === 'interne');
verifier('la pièce d une réponse au client ne l est pas', (metaPublique.metadata || {}).visibilite !== 'interne');

console.log('\n== Un second passage ne trouve plus rien');
const second = migrer('--vrai');
const lignes = second.split('\n').filter((l) => /^\s+\d+\s+/.test(l) && !/introuvable|hors projet/.test(l));
const restes = lignes.filter((l) => /mig|projets :|organisations :|paiements :|fichiers :|pièces comptables :|notes internes : pièce marquée|profil recopié|ancien profil/.test(l));
/* D'autres fiches du banc peuvent passer au premier tour ; au second, plus aucune. */
verifier('aucune donnée n est déplacée deux fois', restes.length === 0);
if (restes.length) console.log(restes.map((l) => '         ' + l.trim()).join('\n'));

console.log('\n== Hors émulateur, l écriture est refusée sans --production');
let refus = false;
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('./migrer-confidentialite.mjs', import.meta.url)), '--vrai'],
    { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', GCLOUD_PROJECT: 'projet-inexistant-essai' } });
} catch (e) { refus = e.status === 2 && /refusée/.test(String(e.stderr)); }
verifier('--vrai sans émulateur ni --production sort en refus', refus);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
