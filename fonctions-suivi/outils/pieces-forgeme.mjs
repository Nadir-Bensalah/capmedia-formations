/* ==========================================================================
   Les pièces comptables de ForgeMe.

   Tout vient du bilan financier relu et validé le 18 septembre 2026 :
   numéros, dates et montants sont ceux qui y figurent. Les montants sont
   des sommes reçues, donc en TTC, sans TVA.

   Deux pièces de 2024 (audit 123,75 € et maquettage 3 000,00 €) n'ont pas
   de numéro dans le bilan : elles ne sont pas déposées ici, mais elles
   sont consignées dans une note du projet pour que le total soit juste.

     ADMIN_CLE=... PROJET=<id> node fonctions-suivi/outils/pieces-forgeme.mjs
   ========================================================================== */

const CLE = process.env.ADMIN_CLE;
const PROJET = process.env.PROJET;
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;

if (!CLE || !PROJET) {
  console.error('Usage : ADMIN_CLE=... PROJET=<identifiant> node fonctions-suivi/outils/pieces-forgeme.mjs');
  process.exit(1);
}

/* Réglé, dans l'ordre chronologique. */
const REGLEES = [
  { numero: 'D-2025-0023', date: '2025-07-31', libelle: 'Application mobile, socle Firebase et tableau de bord', montant: 8000 },
  { numero: 'D-2025-0024', date: '2025-10-28', libelle: 'Application web et gamification', montant: 12480 },
  { numero: 'F-2026-0025', date: '2026-01-06', libelle: 'Site de présentation et pages légales', montant: 1200 },
  { numero: 'F-2026-0027', date: '2026-04-08', libelle: 'Suivi des tâches récurrentes', montant: 380 },
  { numero: 'F-2026-0029', date: '2026-08-13', libelle: "Refonte complète de l'onboarding", montant: 3000 },
];

/* En attente de décision. Le numéro suit la série ; à corriger depuis le
   cockpit si votre numérotation diffère. */
const DEVIS = {
  numero: 'D-2026-0030', date: '2026-09-18', echeance: '2026-10-18',
  libelle: 'Campagne de tests sur les trois plateformes',
  montant: 5750,
  description: "Préparation de la campagne, recrutement et suivi de six testeurs sur iPhone, Android et web, environnement de test dédié, 48 parcours automatisés, journal des anomalies et rapport final. Environ quatre semaines. Les options de supervision ne sont pas comprises.",
};

const appeler = async (corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, ...corps }) });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte */ }
  return { code: r.status, texte, json };
};

let posees = 0;
for (const f of REGLEES) {
  const depot = await appeler({ action: 'deposerDocument', projet: PROJET, type: 'facture', numero: f.numero, libelle: f.libelle, montant: f.montant, tva: 0, date: f.date, echeance: f.date });
  if (depot.code !== 200) { console.error(`Facture ${f.numero} refusée :`, depot.code, depot.texte); continue; }
  const paiement = await appeler({ action: 'enregistrerPaiement', facture: depot.json.id, montant: f.montant, date: f.date, moyen: 'virement', note: 'Reprise de l historique' });
  if (paiement.code !== 200) console.error(`Paiement de ${f.numero} refusé :`, paiement.code, paiement.texte);
  else { posees += 1; console.log(`  ${f.numero} · ${f.libelle} · ${f.montant.toLocaleString('fr-FR')} € · réglée`); }
}

const devis = await appeler({ action: 'deposerDocument', projet: PROJET, type: 'devis', numero: DEVIS.numero, libelle: DEVIS.libelle, montant: DEVIS.montant, tva: 0, date: DEVIS.date, echeance: DEVIS.echeance, description: DEVIS.description });
if (devis.code !== 200) console.error('Devis refusé :', devis.code, devis.texte);
else console.log(`  ${DEVIS.numero} · ${DEVIS.libelle} · ${DEVIS.montant.toLocaleString('fr-FR')} € · en attente de décision`);

/* La note qui rend le total juste, sans inventer de numéro. */
const note = await appeler({
  action: 'remplirProjet', id: PROJET,
  adressesAttendues: (process.env.ADRESSES || 'nadir.bensalah@outlook.fr,contact@capmedia.app,contact@nadirbensalah.fr,contact@nadirbensalah.com').split(',').map((e) => e.trim()),
  contenu: { notes: [{
    id: 'historique-facturation', type: 'information', visibilite: 'interne',
    titre: 'Historique de facturation du projet',
    contenu: "Réglé à ce jour : 28 183,75 €.\n\nDeux pièces de 2024 ne portent pas de numéro dans le bilan et ne sont donc pas déposées comme factures : l'audit de l'application existante (123,75 €) et le maquettage de l'application (3 000,00 €).\n\nLes cinq pièces numérotées sont déposées et marquées réglées : D-2025-0023 (8 000 €), D-2025-0024 (12 480 €), F-2026-0025 (1 200 €), F-2026-0027 (380 €), F-2026-0029 (3 000 €), soit 25 060 €.",
    contexte: 'Bilan financier relu le 18 septembre 2026.',
    impact: "Le total affiché dans l'espace ne compte que les pièces numérotées tant que les deux de 2024 n'ont pas de référence.",
  }] },
});
if (note.code !== 200) console.error('Note refusée :', note.code, note.texte);

console.log(`\n${posees} facture(s) réglée(s) et le devis en cours sont en place.`);
console.log('Vérifiez le numéro du devis : il suit la série, mais il est à confirmer.');
