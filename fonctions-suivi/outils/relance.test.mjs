/* ==========================================================================
   CAPMEDIA CLIENT HUB · la relance hebdomadaire à l'épreuve

   Rien, dans l'espace, n'allait chercher le client : tout attendait qu'il
   vienne. Le rendez-vous du lundi le fait, mais il doit se taire dans tous
   les cas où écrire serait une faute : un projet à moi, un projet en
   sourdine, un projet clos, une lettre déjà partie cette semaine, et
   surtout un projet où rien n'attend personne.

     firebase emulators:exec --config firebase.suivi.json --only firestore \
       --project capmedia-1f90d "node fonctions-suivi/outils/relance.test.mjs"
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Cette épreuve ne tourne que sur l'émulateur Firestore.");
  process.exit(1);
}
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();

const { _relanceRetenue: retenue, _pointsEnAttente: points } = await import('../hub.js').then((m) => m.default || m);

let ok = 0; const ecarts = [];
const verifier = (condition, quoi, detail = '') => {
  if (condition) { ok += 1; console.log(`  ok     ${quoi}`); }
  else { ecarts.push(`${quoi}${detail ? ` (${detail})` : ''}`); console.log(`  ÉCART  ${quoi}${detail ? ` · ${detail}` : ''}`); }
};

const ilYA = (jours) => Timestamp.fromDate(new Date(Date.now() - jours * 86400000));
const vivant = { nom: 'Atelier', statut: 'en-cours', membres: ['uid-camille'], contacts: [{ nom: 'Camille', email: 'camille@exemple.test' }] };

console.log('== Quand la lettre ne part pas');
verifier(!retenue({ ...vivant, interne: true }).retenu, "un projet à moi n'est jamais relancé");
verifier(!retenue({ ...vivant, silence: true }).retenu, 'un projet en sourdine reste muet');
verifier(!retenue({ ...vivant, archive: true }).retenu, "un projet archivé n'écrit plus");
verifier(!retenue({ ...vivant, statut: 'termine' }).retenu, 'un projet terminé non plus');
verifier(!retenue({ ...vivant, statut: 'suspendu' }).retenu, 'un projet suspendu non plus');
verifier(!retenue({ ...vivant, relance: ilYA(2) }).retenu, 'jamais deux lettres dans la même semaine');
verifier(!retenue({ ...vivant, membres: [] }).retenu, "un prospect sans accès ouvert ne reçoit rien : il ne pourrait pas ouvrir le lien");

console.log('\n== Quand elle part');
verifier(retenue(vivant).retenu, 'un projet vivant est relançable');
verifier(retenue({ ...vivant, relance: ilYA(9) }).retenu, 'une lettre vieille de neuf jours rouvre le droit');

console.log('\n== Ce qui attend vraiment le client');
await bdd.doc('projets/epreuve').set({ nom: 'Épreuve', statut: 'en-cours', membres: ['uid-x'] });
verifier((await points('epreuve')).length === 0, "un projet où rien n'attend ne produit aucune ligne");

await bdd.doc('validations/ep-v').set({ projet: 'epreuve', titre: 'Maquette', statut: 'en-attente', cree: ilYA(4) });
await bdd.doc('tickets/ep-t').set({ projet: 'epreuve', numero: 'EP-001', titre: 'Export', statut: 'a-valider', archive: false, maj: ilYA(3) });
await bdd.doc('tickets/ep-t2').set({ projet: 'epreuve', numero: 'EP-002', titre: 'Chez nous', statut: 'en-cours', archive: false, maj: ilYA(1) });
await bdd.doc('documents/ep-f').set({ projet: 'epreuve', type: 'facture', numero: 'F-1', libelle: 'Acompte', statut: 'a-payer' });
await bdd.doc('documents/ep-d').set({ projet: 'epreuve', type: 'devis', numero: 'D-1', libelle: 'Campagne', statut: 'envoye' });
await bdd.doc('taches/ep-x').set({ projet: 'epreuve', titre: 'Captures', statut: 'attente-client', visibilite: 'client', archive: false, maj: ilYA(6) });
await bdd.doc('taches/ep-i').set({ projet: 'epreuve', titre: 'Refacto', statut: 'attente-client', visibilite: 'interne', archive: false, maj: ilYA(6) });
await bdd.doc('blocages/ep-b').set({ projet: 'epreuve', titre: 'Compte Google', responsable: 'client', visibilite: 'client', resolu: null, depuis: ilYA(10) });
await bdd.doc('blocages/ep-b2').set({ projet: 'epreuve', titre: 'De notre côté', responsable: 'capmedia', visibilite: 'client', resolu: null, depuis: ilYA(10) });

const liste = await points('epreuve');
const quoi = liste.map((l) => l.quoi);
verifier(liste.length === 6, 'chaque chose en attente donne une ligne, et une seule', `${liste.length} ligne(s) : ${quoi.join(', ')}`);
verifier(quoi.includes('À valider'), 'la validation attendue est listée');
verifier(quoi.includes('Correction à vérifier'), 'la correction à vérifier est listée');
verifier(quoi.includes('Devis à décider') && quoi.includes('Facture à régler'), 'le devis et la facture sont listés');
verifier(quoi.includes('Tâche en attente de vous'), 'la tâche en attente du client est listée');
verifier(quoi.includes('Point bloquant'), 'le point bloquant de son côté est listé');
verifier(!liste.some((l) => /Chez nous/.test(l.detail)), "ce qui est chez nous n'entre pas dans la lettre");
verifier(!liste.some((l) => /Refacto/.test(l.detail)), "une tâche interne n'entre pas dans la lettre");
verifier(!liste.some((l) => /De notre côté/.test(l.detail)), "un point bloquant de notre côté n'entre pas dans la lettre");
verifier(liste.every((l) => l.quoi && typeof l.detail === 'string'), 'chaque ligne porte un intitulé et un détail');
verifier(liste.some((l) => /depuis \d+ jours/.test(l.detail)), "les lignes disent depuis combien de temps ça dort");

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
