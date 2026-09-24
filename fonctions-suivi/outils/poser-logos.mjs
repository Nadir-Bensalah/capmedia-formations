/* ==========================================================================
   Pose sur chaque projet son icône réelle, prise dans son dépôt.

   L'icône vient de l'application elle-même : le jeu AppIcon d'iOS, le
   lanceur Android en plus haute densité, sinon le logo ou l'icône de
   touche du site. Une icône générique, celle que React Native ou Expo
   pose à la création d'un projet, est écartée : la même image sur cinq
   projets ne dit rien et trompe l'œil.

     ADMIN_CLE=... node fonctions-suivi/outils/poser-logos.mjs fonctions-suivi/outils/donnees-locales/icones-projets.tsv
   La table associe une référence de projet à un chemin d'image.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

const CLE = process.env.ADMIN_CLE;
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;
const TABLE = process.argv[2];

if (!CLE || !TABLE) {
  console.error('Usage : ADMIN_CLE=... node fonctions-suivi/outils/poser-logos.mjs fonctions-suivi/outils/donnees-locales/icones-projets.tsv');
  process.exit(1);
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const appeler = async (corps) => {
  const r = await fetch(PORTE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cle: CLE, ...corps }),
  });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte */ }
  return { code: r.status, texte, json };
};

const lignes = readFileSync(TABLE, 'utf8').split('\n')
  .map((l) => l.split('\t'))
  .filter((c) => c.length >= 2 && c[0] && c[1]);

/* Une image partagée par plusieurs projets est une image générique. */
const parEmpreinte = new Map();
const fiches = [];
for (const [ref, chemin] of lignes) {
  let octets;
  try { octets = readFileSync(chemin); } catch (e) { console.log(`  illisible  ${ref}`); continue; }
  const type = TYPES[extname(chemin).toLowerCase()];
  if (!type) { console.log(`  type inconnu  ${ref} ${basename(chemin)}`); continue; }
  if (octets.length > 2 * 1024 * 1024) { console.log(`  trop lourde  ${ref} ${Math.round(octets.length / 1024)} ko`); continue; }
  const empreinte = createHash('md5').update(octets).digest('hex');
  parEmpreinte.set(empreinte, (parEmpreinte.get(empreinte) || 0) + 1);
  fiches.push({ ref, chemin, octets, type, empreinte });
}

/* Capmedia Academy et le Client Hub vivent dans le même dépôt et partagent
   légitimement l'icône de la maison : la règle ne vaut qu'au-delà de deux. */
const generiques = new Set([...parEmpreinte.entries()].filter(([, n]) => n > 2).map(([h]) => h));

const diag = await appeler({ action: 'diagnostic' });
if (diag.code !== 200) { console.error('Diagnostic refusé :', diag.code, diag.texte); process.exit(1); }
const parRef = new Map((diag.json.projets || []).map((p) => [String(p.ref || '').toUpperCase(), p]));

let poses = 0; const ecartes = []; const soucis = [];
for (const f of fiches) {
  if (generiques.has(f.empreinte)) { ecartes.push(`${f.ref} (icône générique, partagée par ${parEmpreinte.get(f.empreinte)} projets)`); continue; }
  const projet = parRef.get(f.ref);
  if (!projet) { soucis.push(`${f.ref} : projet inconnu`); continue; }
  const r = await appeler({ action: 'poserLogo', id: projet.id, donnees: f.octets.toString('base64'), typeFichier: f.type });
  if (r.code !== 200) { soucis.push(`${f.ref} : ${r.code} ${r.texte.slice(0, 100)}`); continue; }
  poses += 1;
  console.log(`  posé  ${f.ref.padEnd(14)} ${basename(f.chemin)} (${Math.round(f.octets.length / 1024)} ko)`);
}

console.log(`\n${poses} logos posés.`);
if (ecartes.length) { console.log(`\n${ecartes.length} écartés :`); for (const e of ecartes) console.log(`  ${e}`); }
if (soucis.length) { console.log(`\n${soucis.length} soucis :`); for (const s of soucis) console.log(`  ${s}`); process.exit(1); }
