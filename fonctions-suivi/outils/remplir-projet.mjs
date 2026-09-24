/* ==========================================================================
   Amorçage d'un projet dans le Client Hub : parties, étapes, liens,
   versions, réunions, notes, blocages, tâches, en un appel à
   `remplirProjet`.

   Le contenu vient de `donnees-locales/remplissage-<nom>.mjs` (non
   versionné : c'est le projet d'un vrai client). Format :
   `exemples/remplissage.exemple.mjs`.

   Garde-fou : ADRESSES liste les seules adresses attendues sur le projet ;
   si une autre y figure, le serveur refuse d'écrire. Posez le projet en
   sourdine avant de le remplir : aucun e-mail ne part.

     ADMIN_CLE=... PROJET=<id> ADRESSES=a@x,b@y node fonctions-suivi/outils/remplir-projet.mjs <nom>
   ========================================================================== */

import { chargerDonnees, exiger } from './lib/donnees-locales.mjs';

const CLE = process.env.ADMIN_CLE;
const PROJET = process.env.PROJET;
const NOM = process.argv[2];
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;

if (!CLE || !PROJET || !NOM) {
  console.error('Usage : ADMIN_CLE=... PROJET=<identifiant> ADRESSES=... node fonctions-suivi/outils/remplir-projet.mjs <nom>');
  process.exit(1);
}
const ADRESSES_ATTENDUES = exiger('ADRESSES', 'Les adresses attendues sur le projet, séparées par des virgules.')
  .split(',').map((e) => e.trim()).filter(Boolean);
const { contenu } = await chargerDonnees(`remplissage-${NOM}`, { exemple: 'remplissage' });

const appeler = async (corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, ...corps }) });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte */ }
  return { code: r.status, texte, json };
};

const r = await appeler({ action: 'remplirProjet', id: PROJET, adressesAttendues: ADRESSES_ATTENDUES, contenu });
if (r.code !== 200) { console.error('Remplissage refusé :', r.code, r.texte); process.exit(1); }
console.log('Projet rempli.');
console.log('  adresses vues sur le projet :', (r.json.adressesVues || []).join(', ') || 'aucune');
for (const [quoi, n] of Object.entries(r.json.compte || {})) console.log(`  ${quoi} : ${n}`);
console.log('\nLe projet est en sourdine : aucun e-mail ne part.');
console.log('Levez-la depuis le cockpit, Modifier, quand l\'espace est prêt à être montré.');
