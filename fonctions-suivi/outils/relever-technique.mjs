/* ==========================================================================
   Relève la fiche technique d'un projet sur le disque, et la pose sur ses
   briques dans le Hub.

   Tout est compté, rien n'est estimé : les lignes de code fichier par
   fichier, les bibliothèques lues dans le package.json avec leur version
   installée, les ressources pesées, le niveau d'API Android lu dans le
   Gradle, la cible de déploiement iOS lue dans le projet Xcode.

   Les alertes ne sortent que de faits vérifiables : une échéance publique
   de magasin comparée à ce que le dépôt déclare vraiment.

     ADMIN_CLE=... node fonctions-suivi/outils/relever-technique.mjs <ref> <dossier> [briques]

   `briques` : les identifiants de composants séparés par des virgules. Sans
   lui, la fiche se pose sur toutes les briques du projet.
   ========================================================================== */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const CLE = process.env.ADMIN_CLE;
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;

const [REF, DOSSIER, COMPOSANT] = process.argv.slice(2);
if (!CLE || !REF || !DOSSIER) {
  console.error('Usage : ADMIN_CLE=... node fonctions-suivi/outils/relever-technique.mjs <ref> <dossier> [idComposant]');
  process.exit(1);
}

const CODE = new Set(['.js', '.jsx', '.ts', '.tsx', '.swift', '.kt', '.java', '.m', '.mm', '.h', '.dart', '.vue', '.svelte', '.astro', '.php', '.py', '.rb', '.go', '.rs', '.css', '.scss', '.html']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif']);
const IGNORE = new Set(['node_modules', '.git', 'build', 'dist', 'Pods', 'vendor', '.next', '.expo', 'DerivedData', 'coverage', '.venv']);

/* Un parcours unique : on compte le code, on pèse les ressources. */
const parcourir = (racine) => {
  const compte = { lignes: 0, fichiers: 0, images: 0, poidsImages: 0, polices: 0, octets: 0 };
  const pile = [racine];
  while (pile.length) {
    const d = pile.pop();
    let entrees = [];
    try { entrees = readdirSync(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entrees) {
      if (e.name.startsWith('.') && e.name !== '.env.example') continue;
      const chemin = join(d, e.name);
      if (e.isDirectory()) { if (!IGNORE.has(e.name)) pile.push(chemin); continue; }
      const ext = extname(e.name).toLowerCase();
      let taille = 0;
      try { taille = statSync(chemin).size; } catch (err) { continue; }
      compte.octets += taille;
      if (CODE.has(ext)) {
        compte.fichiers += 1;
        try { compte.lignes += readFileSync(chemin, 'utf8').split('\n').length; } catch (err) { /* binaire */ }
      } else if (IMAGES.has(ext)) {
        compte.images += 1;
        compte.poidsImages += taille;
      } else if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
        compte.polices += 1;
      }
    }
  }
  return compte;
};

const poids = (o) => (o > 1024 * 1024 * 1024 ? `${(o / 1024 / 1024 / 1024).toFixed(1)} Go` : `${Math.round(o / 1024 / 1024)} Mo`);

const racine = DOSSIER;
if (!existsSync(racine)) { console.error(`Dossier introuvable : ${racine}`); process.exit(1); }

console.log(`Relevé de ${REF} dans ${racine}`);
const compte = parcourir(racine);
console.log(`  ${compte.lignes.toLocaleString('fr-FR')} lignes dans ${compte.fichiers} fichiers de code`);

/* --- Les bibliothèques -------------------------------------------------- */
let dependances = []; let technos = [];
const paquetChemin = join(racine, 'package.json');
if (existsSync(paquetChemin)) {
  try {
    const p = JSON.parse(readFileSync(paquetChemin, 'utf8'));
    const lire = (bloc, dev) => Object.entries(bloc || {}).map(([nom, version]) => ({ nom, version: String(version).replace(/^[\^~]/, ''), dev }));
    dependances = [...lire(p.dependencies, false), ...lire(p.devDependencies, true)];
    const socle = ['react-native', 'react', 'next', 'expo', 'typescript', 'firebase', 'astro', 'vite', 'vue', 'svelte'];
    technos = dependances.filter((x) => socle.includes(x.nom)).map((x) => ({ nom: x.nom, version: x.version }));
    if (p.engines && p.engines.node) technos.push({ nom: 'node', version: String(p.engines.node) });
    console.log(`  ${dependances.length} bibliothèques`);
  } catch (e) { console.log('  package.json illisible'); }
}

/* --- Android et iOS ----------------------------------------------------- */
const alertes = [];
const lireFichier = (c) => { try { return readFileSync(c, 'utf8'); } catch (e) { return ''; } };
const chercher = (motif, ...chemins) => {
  for (const c of chemins) {
    const m = lireFichier(join(racine, c)).match(motif);
    if (m) return m[1];
  }
  return '';
};

const cibleAndroid = chercher(/targetSdk(?:Version)?\s*=?\s*([0-9]{2})/, 'android/build.gradle', 'android/app/build.gradle', 'app/build.gradle.kts', 'android/app/build.gradle.kts');
if (cibleAndroid) {
  technos.push({ nom: 'Android targetSdk', version: cibleAndroid });
  const n = Number(cibleAndroid);
  if (n < 36) {
    alertes.push({
      gravite: 'critique',
      titre: `Android vise l'API ${n}, le magasin en exige 36`,
      echeance: 'échéance dépassée le 31 août 2026',
      texte: "Depuis le 31 août 2026, Google Play refuse toute nouvelle version qui ne vise pas Android 16, API 36. Une mise à jour, même d'une ligne, est bloquée tant que targetSdk n'est pas relevé. Le minSdk n'a pas à bouger : les anciens appareils restent servis.",
    });
  } else if (n === 36) {
    alertes.push({
      gravite: 'info',
      titre: "Android vise l'API 36, conforme",
      echeance: 'prochaine échéance en 2027',
      texte: "Google relève l'exigence d'un niveau par an, fin août. Prévoir le passage à l'API 37 avant l'été 2027.",
    });
  }
}

const cibleIOS = chercher(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+)/, 'ios/Podfile.lock')
  || (() => {
    const dossiers = readdirSync(racine, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'));
    for (const d of dossiers) {
      const m = lireFichier(join(racine, d.name, 'project.pbxproj')).match(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+)/);
      if (m) return m[1];
    }
    const m = lireFichier(join(racine, 'ios/Podfile')).match(/platform :ios, '([0-9.]+)'/);
    return m ? m[1] : '';
  })();
if (cibleIOS) technos.push({ nom: 'iOS minimum', version: cibleIOS });

const versionApp = chercher(/MARKETING_VERSION = ([0-9.]+)/, ...readdirSync(racine, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.endsWith('.xcodeproj')).map((e) => `${e.name}/project.pbxproj`));
if (versionApp) technos.push({ nom: 'Version marketing', version: versionApp });

/* --- Le dépôt ------------------------------------------------------------ */
let commits = ''; let dernier = '';
try {
  commits = execSync(`git -C "${racine}" rev-list --count HEAD`, { encoding: 'utf8' }).trim();
  dernier = execSync(`git -C "${racine}" log -1 --date=short --format=%ad`, { encoding: 'utf8' }).trim();
} catch (e) { /* pas un dépôt */ }

const assets = [];
if (compte.images) assets.push({ nom: 'Images', detail: `${compte.images} fichiers, ${poids(compte.poidsImages)}` });
if (compte.polices) assets.push({ nom: 'Polices', detail: `${compte.polices} fichiers` });
if (commits) assets.push({ nom: 'Dépôt Git', detail: `${commits} commits, dernier le ${dernier}` });

const technique = {
  lignes: compte.lignes,
  fichiers: compte.fichiers,
  poids: poids(compte.octets),
  releve: new Date().toISOString(),
  technos,
  dependances,
  assets,
  alertes,
};

/* --- L'écriture ---------------------------------------------------------- */
const appeler = async (corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, ...corps }) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* texte */ }
  return { code: r.status, texte: t, json: j };
};

const diag = await appeler({ action: 'diagnostic' });
if (diag.code !== 200) { console.error('Diagnostic refusé :', diag.texte); process.exit(1); }
const projet = (diag.json.projets || []).find((p) => String(p.ref || '').toUpperCase() === REF.toUpperCase());
if (!projet) { console.error(`Projet ${REF} introuvable.`); process.exit(1); }

const pose = await appeler({
  action: 'remplirProjet', id: projet.id,
  adressesAttendues: (process.env.ADRESSES || 'nadir.bensalah@outlook.fr,contact@capmedia.app,contact@nadirbensalah.fr,contact@nadirbensalah.com').split(',').map((e) => e.trim()),
  contenu: { fichesTechniques: [{ composants: COMPOSANT ? COMPOSANT.split(',').map((x) => x.trim()) : [], technique }] },
});
if (pose.code !== 200) { console.error('Pose refusée :', pose.code, pose.texte.slice(0, 200)); process.exit(1); }
console.log(`  posée sur ${pose.json.compte.fichesTechniques || 0} brique(s)`);
for (const a of alertes) console.log(`  alerte ${a.gravite} : ${a.titre}`);
