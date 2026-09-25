/* ==========================================================================
   Dépose les pièces comptables d'un projet : factures réglées (avec leur
   paiement), devis en attente, et une note interne d'historique.

   Les pièces viennent de `donnees-locales/pieces-<nom>.mjs` (non versionné :
   numéros et montants réels). Format : `exemples/pieces.exemple.mjs`.

   ATTENTION : l'outil n'est pas idempotent. `deposerDocument` ne contrôle
   pas encore l'unicité d'un numéro : une relance double les pièces.

     ADMIN_EMAIL=... PROJET=<id> ADRESSES=a@x,b@y node fonctions-suivi/outils/deposer-pieces.mjs <nom>
   ========================================================================== */

import { chargerDonnees, exiger } from './lib/donnees-locales.mjs';

/* Plus de clé partagée : l'outil agit au nom d'une personne de l'équipe,
   qui s'identifie avec son code à six chiffres (lib/session-admin.mjs). */
import { appelerAdmin } from './lib/session-admin.mjs';
const PROJET = process.env.PROJET;
const NOM = process.argv[2];
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${process.env.PROJET_FIREBASE || 'capmedia-1f90d'}.cloudfunctions.net/suiviAdmin`;

if (!PROJET || !NOM) {
  console.error('Usage : ADMIN_EMAIL=... PROJET=<identifiant> ADRESSES=... node fonctions-suivi/outils/deposer-pieces.mjs <nom>');
  process.exit(1);
}
const ADRESSES = exiger('ADRESSES', 'Les adresses attendues sur le projet, séparées par des virgules.').split(',').map((e) => e.trim()).filter(Boolean);
const { REGLEES, DEVIS, NOTE } = await chargerDonnees(`pieces-${NOM}`, { exemple: 'pieces' });

const appeler = (corps) => appelerAdmin(corps);

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

/* La note interne, si les données en portent une. */
const note = await appeler({
  action: 'remplirProjet', id: PROJET,
  adressesAttendues: ADRESSES,
  contenu: { notes: NOTE ? [NOTE] : [] },
});
if (note.code !== 200) console.error('Note refusée :', note.code, note.texte);

console.log(`\n${posees} facture(s) réglée(s) et le devis en cours sont en place.`);
