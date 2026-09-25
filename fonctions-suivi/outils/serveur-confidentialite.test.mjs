/* ==========================================================================
   CAPMEDIA CLIENT HUB · le serveur range l'interne à part

   Les règles ferment les collections internes ; encore faut-il que le
   serveur y écrive, et plus sur les fiches que le client lit. Ce test
   passe par la porte d'administration et par les déclencheurs, sur les
   émulateurs (Firestore, Auth, Functions), et regarde où chaque donnée
   interne atterrit :
   - creerProjet : budget, note, santé dans projetsInternes ;
   - creerOrganisation, majOrganisation : notes dans organisationsInternes ;
   - enregistrerPaiement : note dans paiementsInternes ;
   - une fiche testeur : un profil sans nom sous chaque projet, plus de profil commun ;
   - un membre de l'équipe : son nom seul dans l'annuaire, retiré s'il part.

     node fonctions-suivi/outils/serveur-confidentialite.test.mjs
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Émulateurs requis (FIRESTORE_EMULATOR_HOST).'); process.exit(2); }
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
initializeApp({ projectId: PROJET });
const bdd = getFirestore();
const PORTE = `http://127.0.0.1:5001/${PROJET}/europe-west1/suiviAdmin`;
const CLE = process.env.ADMIN_CLE_ESSAI || 'cle-essai-locale';

let ok = 0; const ecarts = [];
const verifier = (l, vrai) => { if (vrai) { ok += 1; console.log('  ok     ' + l); } else { ecarts.push(l); console.log('  ÉCART  ' + l); } };
const lire = async (chemin) => { const d = await bdd.doc(chemin).get(); return d.exists ? d.data() : null; };
const appeler = async (corps) => {
  const r = await fetch(PORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: CLE, ...corps }) });
  const texte = await r.text();
  let json = null; try { json = JSON.parse(texte); } catch { /* texte */ }
  return { code: r.status, texte, json };
};
/* Un déclencheur tourne après l'écriture : on attend qu'il ait fini. */
const attendre = async (fn, secondes = 20) => {
  for (let i = 0; i < secondes * 4; i += 1) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); }
  return null;
};
const suffixe = Date.now().toString(36).toUpperCase();

console.log('\n== creerProjet');
const projet = await appeler({ action: 'creerProjet', ref: `SC${suffixe}`.slice(0, 16), nom: 'Projet confidentiel', budget: 7200, budgetNote: 'forfait négocié',
  client: { nom: 'Client fictif', email: `client.${suffixe.toLowerCase()}@exemple.test`, entreprise: 'Entreprise fictive' }, inviter: false });
verifier(`le projet est créé (${projet.code})`, projet.code === 200);
const pid = projet.json && (projet.json.id || projet.json.projet);
const fiche = pid ? await lire(`projets/${pid}`) : {};
verifier('la fiche du projet ne porte ni budget, ni note, ni santé', fiche && !('budget' in fiche) && !('budgetNote' in fiche) && !('sante' in fiche));
const interne = pid ? await lire(`projetsInternes/${pid}`) : null;
verifier('projetsInternes les porte', interne && interne.budget === 7200 && interne.budgetNote === 'forfait négocié' && interne.sante === 'ok');

console.log('\n== creerOrganisation, majOrganisation');
const org = await appeler({ action: 'creerOrganisation', nom: 'Contact fictif', entreprise: 'Organisation confidentielle',
  email: `org.${suffixe.toLowerCase()}@exemple.test`, notesInternes: 'négocie tout' });
verifier(`l organisation est créée (${org.code})`, org.code === 200);
const oid = org.json && org.json.id;
verifier('la fiche de l organisation ne porte pas de notes internes', oid && !('notesInternes' in ((await lire(`organisations/${oid}`)) || {})));
verifier('organisationsInternes les porte', oid && (await lire(`organisationsInternes/${oid}`))?.notesInternes === 'négocie tout');
const maj = await appeler({ action: 'majOrganisation', id: oid, notesInternes: 'paie à 60 jours', versionInterne: 2 });
verifier(`la mise à jour passe (${maj.code})`, maj.code === 200);
verifier('la note mise à jour reste hors de la fiche', !('notesInternes' in ((await lire(`organisations/${oid}`)) || {})));
verifier('et remplace la précédente dans organisationsInternes', (await lire(`organisationsInternes/${oid}`))?.notesInternes === 'paie à 60 jours');
/* Un onglet resté ouvert sur l'ancien cockpit renvoie la note qu'il lit sur
   la fiche : vide, une fois la note déplacée. Elle ne doit rien effacer. */
const ancienOnglet = await appeler({ action: 'majOrganisation', id: oid, nom: 'Contact fictif', notesInternes: '' });
verifier(`un ancien cockpit peut toujours enregistrer la fiche (${ancienOnglet.code})`, ancienOnglet.code === 200);
verifier('mais sa note vide n efface pas la vraie note', (await lire(`organisationsInternes/${oid}`))?.notesInternes === 'paie à 60 jours');
verifier('et ne réécrit rien d interne sur la fiche', !('notesInternes' in ((await lire(`organisations/${oid}`)) || {})));

console.log('\n== enregistrerPaiement');
const facture = await appeler({ action: 'deposerDocument', projet: pid, type: 'facture', numero: `F-${suffixe}`, libelle: 'Facture fictive', montant: 100,
  fichier: { chemin: `projets/${pid}/pieces/essai/facture.pdf`, nom: 'facture.pdf', taille: 10 } });
verifier(`une facture est déposée (${facture.code})`, facture.code === 200);
const fid = facture.json && (facture.json.id || facture.json.document);
const paiement = await appeler({ action: 'enregistrerPaiement', facture: fid, montant: 50, moyen: 'virement', note: 'reçu en retard' });
verifier(`le paiement est enregistré (${paiement.code})`, paiement.code === 200);
const payId = paiement.json && paiement.json.id;
verifier('la fiche du paiement ne porte pas la note', payId && !('note' in ((await lire(`paiements/${payId}`)) || {})));
verifier('paiementsInternes la porte', payId && (await lire(`paiementsInternes/${payId}`))?.note === 'reçu en retard');

console.log('\n== Le profil d un testeur, un par projet');
const tid = `sc-testeur-${suffixe.toLowerCase()}`;
await bdd.doc(`testeurs/${tid}/public/profil`).set({ age: '20-29', projets: ['ancien'] });
await bdd.doc(`testeurs/${tid}`).set({ nom: 'Nom confidentiel', email: `${tid}@essai.test`, projets: ['sc-a', 'sc-b'], actif: true, mobile: 'android', profil: { age: '40-49', fonction: 'artisan' } });
const profilA = await attendre(() => lire(`projets/sc-a/profilsTesteurs/${tid}`));
verifier('le profil est recopié sous le premier projet', profilA && profilA.fonction === 'artisan');
verifier('et sous le second', Boolean(await attendre(() => lire(`projets/sc-b/profilsTesteurs/${tid}`))));
verifier('le profil recopié ne porte ni nom, ni adresse, ni liste de projets', profilA && !('nom' in profilA) && !('email' in profilA) && !('projets' in profilA));
verifier('l ancien profil commun est effacé', Boolean(await attendre(async () => (await lire(`testeurs/${tid}/public/profil`)) === null)));
await bdd.doc(`testeurs/${tid}`).update({ projets: ['sc-a'] });
verifier('retiré d un projet, son profil y disparaît', Boolean(await attendre(async () => (await lire(`projets/sc-b/profilsTesteurs/${tid}`)) === null)));
await bdd.doc(`testeurs/${tid}`).update({ actif: false });
verifier('désactivé, il n a plus de profil nulle part', Boolean(await attendre(async () => (await lire(`projets/sc-a/profilsTesteurs/${tid}`)) === null)));

console.log('\n== L annuaire de l équipe');
const eid = `sc-agent-${suffixe.toLowerCase()}`;
await bdd.doc(`equipe/${eid}`).set({ nom: 'Agent confidentiel', email: `${eid}@exemple.test`, role: 'agent', actif: true });
const entree = await attendre(() => lire(`annuaire/${eid}`));
verifier('son nom est recopié dans l annuaire', entree && entree.nom === 'Agent confidentiel');
verifier('sans son adresse ni son rôle', entree && !('email' in entree) && !('role' in entree));
await bdd.doc(`equipe/${eid}`).update({ actif: false });
verifier('désactivé, il sort de l annuaire', Boolean(await attendre(async () => (await lire(`annuaire/${eid}`)) === null)));

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
