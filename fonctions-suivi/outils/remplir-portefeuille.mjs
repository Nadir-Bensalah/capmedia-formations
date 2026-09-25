/* ==========================================================================
   Pose tout le portefeuille dans le Client Hub.

   Chaque projet est créé s'il n'existe pas, puis rempli. Rien n'est
   supprimé, rien n'est écrasé à l'aveugle : le remplissage fusionne, et
   relancer l'outil ne crée pas de doublon.

   Tous les projets sont posés EN SOURDINE : aucun e-mail ne part, aucune
   invitation n'est envoyée. La sourdine se lève projet par projet depuis
   le cockpit, quand l'espace est prêt à être montré.

     ADMIN_CLE=... node fonctions-suivi/outils/remplir-portefeuille.mjs [--essai]
   ========================================================================== */

import { chargerDonnees, exiger } from './lib/donnees-locales.mjs';

/* Le portefeuille réel (clients, dépôts, montants) vit dans
   donnees-locales/, jamais dans le dépôt public. */
const { CLIENTS } = await chargerDonnees('portefeuille');
const { INTERNES } = await chargerDonnees('portefeuille-interne');

const CLE = process.env.ADMIN_CLE;
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;
const ESSAI = process.argv.includes('--essai');

/* Les seules adresses autorisées sur ces projets : les vôtres. Aucun
   projet posé ici ne porte l'adresse d'un client. */
const ADRESSES = exiger('ADRESSES', 'Les seules adresses autorisées sur ces projets, séparées par des virgules.')
  .split(',').map((e) => e.trim()).filter(Boolean);

if (!CLE) {
  console.error('ADMIN_CLE manquante.');
  process.exit(1);
}

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

const TOUT = [...CLIENTS, ...INTERNES];

/* Les références doivent être uniques : une collision créerait deux fois
   le même projet sous deux identifiants. */
const vues = new Set();
for (const p of TOUT) {
  if (vues.has(p.ref)) { console.error(`Référence en double : ${p.ref}`); process.exit(1); }
  if (!/^[A-Z][A-Z0-9]{1,15}$/.test(p.ref)) { console.error(`Référence invalide : ${p.ref}`); process.exit(1); }
  vues.add(p.ref);
}
console.log(`${TOUT.length} projets au catalogue, ${CLIENTS.length} clients et ${INTERNES.length} de la maison.`);

if (ESSAI) {
  for (const p of TOUT) {
    console.log(`  ${p.ref.padEnd(14)} ${p.nom.padEnd(28)} ${(p.interne ? 'interne' : 'client ').padEnd(8)} ${String(p.statut).padEnd(12)} ${(p.composants || []).length} composants, ${(p.jalons || []).length} jalons, ${(p.liens || []).length} liens`);
  }
  console.log('\nEssai seulement : rien n a été écrit.');
  process.exit(0);
}

/* --- L'état actuel ------------------------------------------------------ */
const diag = await appeler({ action: 'diagnostic' });
if (diag.code !== 200) { console.error('Diagnostic refusé :', diag.code, diag.texte); process.exit(1); }
const existants = new Map((diag.json.projets || []).map((p) => [String(p.ref || '').toUpperCase(), p]));
console.log(`${existants.size} projets déjà en place.\n`);

let crees = 0; let remplis = 0; const soucis = [];

for (const p of TOUT) {
  const deja = existants.get(p.ref);
  let id = deja ? deja.id : null;

  if (!id) {
    const creation = await appeler({
      action: 'creerProjet',
      ref: p.ref, nom: p.nom, description: p.description || '',
      type: p.type || 'application-mobile', statut: p.statut || 'cadrage',
      plateformes: p.plateformes || [],
      interne: p.interne === true,
      client: p.interne ? undefined : { ...(p.client || {}), notesInternes: '' },
      contacts: p.contacts || [],
      inviter: false,
      silence: true,
    });
    if (creation.code !== 200) { soucis.push(`${p.ref} création : ${creation.code} ${creation.texte.slice(0, 120)}`); continue; }
    id = creation.json.id;
    crees += 1;
    console.log(`  créé    ${p.ref.padEnd(14)} ${p.nom}`);
  }

  const contenu = {
    projet: {
      nom: p.nom, description: p.description || '', type: p.type, statut: p.statut,
      plateformes: p.plateformes || [], sante: p.sante || 'ok',
      progression: { mode: 'jalons', valeur: 0 },
      pulse: p.pulse || {},
      silence: true,
      interne: p.interne === true,
      contacts: p.contacts || [],
    },
    composants: p.composants || [],
    jalons: p.jalons || [],
    liens: p.liens || [],
    notes: p.notes || [],
    taches: p.taches || [],
    blocages: p.blocages || [],
  };

  const r = await appeler({ action: 'remplirProjet', id, adressesAttendues: ADRESSES, contenu });
  if (r.code !== 200) { soucis.push(`${p.ref} remplissage : ${r.code} ${r.texte.slice(0, 160)}`); continue; }
  remplis += 1;
  const c = r.json.compte || {};
  console.log(`  rempli  ${p.ref.padEnd(14)} ${Object.entries(c).map(([k, n]) => `${k}:${n}`).join(' ')}`);
}

console.log(`\n${crees} projets créés, ${remplis} remplis.`);
if (soucis.length) {
  console.log(`\n${soucis.length} soucis :`);
  for (const s of soucis) console.log(`  ${s}`);
  process.exit(1);
}
console.log('\nTous les projets sont en sourdine : aucun e-mail ne part.');
console.log('La sourdine se lève projet par projet depuis le cockpit, bouton Modifier.');
