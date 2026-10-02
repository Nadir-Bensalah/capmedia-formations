/* ==========================================================================
   CAPMEDIA CLIENT HUB · ranger la fiche technique hors des parties

   Les parties d'un projet (projets/{p}/composants/{id}) sont lues par le
   client. Les plus anciennes portent encore un champ « technique » : comptes,
   adresses, comptes de service, dépendances, alertes. Rien ne s'affiche
   chez le client, mais tout part dans son navigateur, et une règle ne sait
   pas masquer un champ à la lecture. Ce champ doit donc quitter la fiche.

   Sa place existe déjà : projets/{p}/technique/{id}, lue et écrite par
   l'équipe du projet seule. C'est elle que la page « Fiche technique » du
   Cockpit lit, et c'est là que remplirProjet pose les nouvelles fiches.

   Pour chaque partie qui porte encore le champ :
     1. la fiche technique/{id} reçoit le contenu ;
        - absente : elle est créée avec le contenu tel quel ;
        - présente : chaque clé absente est ajoutée ; une clé présente avec
          une AUTRE valeur garde la valeur de la fiche, et celle de la
          partie est conservée dans `conflitsMigration.<clé>` (rien ne se
          perd, rien n'est écrasé) ;
     2. le champ est retiré de la partie, DANS LE MÊME LOT que la copie :
        il n'existe pas d'instant où la donnée est copiée à moitié, ni
        d'instant où elle a disparu des deux côtés.

   Avant toute écriture, une sauvegarde JSON complète (valeurs comprises)
   est posée sur le disque, hors du dépôt. `--annuler=<sauvegarde>` remet
   chaque champ sur sa partie et retire ce que la migration a ajouté.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait. Les
   VALEURS ne s'affichent pas (ce sont justement des comptes) : seulement
   les clés et leur taille.

     node fonctions-suivi/outils/migrer-technique.mjs                         (à blanc)
     node fonctions-suivi/outils/migrer-technique.mjs --projet=<id>           (à blanc, un projet)
     node fonctions-suivi/outils/migrer-technique.mjs --vrai                  (émulateur seulement)
     node fonctions-suivi/outils/migrer-technique.mjs --vrai --production     (PRODUCTION, sur ordre explicite)
     node fonctions-suivi/outils/migrer-technique.mjs --annuler=<fichier> --vrai [--production]

   Rejouable : une partie sans champ « technique » est ignorée. Un second
   passage n'écrit rien.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = valeur('--annuler');
const SEUL = valeur('--projet');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';

if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}
console.log(SUR_EMULATEUR
  ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET}${VRAI ? ' : ÉCRITURE' : ' : à blanc'}`
  : `\n!!! Base de PRODUCTION ${PROJET}${VRAI ? ' : ÉCRITURE' : ' : lecture seule, rien ne sera écrit'} !!!\n`);

initializeApp({ projectId: PROJET });
const bdd = getFirestore();

/* --- Une valeur Firestore vers du JSON, et retour ------------------------ */
const versJson = (v) => {
  if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
  return v;
};
const depuisJson = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__date' in v) return Timestamp.fromDate(new Date(v.__date));
  if (Array.isArray(v)) return v.map(depuisJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depuisJson(x)]));
  return v;
};
const memeValeur = (a, b) => isDeepStrictEqual(versJson(a), versJson(b));

/* La taille d'une clé, pour le bilan : jamais la valeur elle-même. */
const taille = (v) => {
  if (Array.isArray(v)) return `${v.length} élément${v.length > 1 ? 's' : ''}`;
  if (v instanceof Timestamp) return 'date';
  if (v && typeof v === 'object') return `${Object.keys(v).length} clé${Object.keys(v).length > 1 ? 's' : ''}`;
  if (v === null || v === undefined || v === '') return 'vide';
  return typeof v === 'string' ? `texte (${v.length} car.)` : typeof v;
};

/* --- Le retour arrière ---------------------------------------------------- */
if (ANNULER) {
  const sauvegarde = JSON.parse(readFileSync(ANNULER, 'utf8'));
  console.log(`Retour arrière depuis ${ANNULER} : ${sauvegarde.parties.length} partie(s).`);
  for (const p of sauvegarde.parties) {
    const lot = bdd.batch();
    lot.update(bdd.doc(p.chemin), { technique: depuisJson(p.technique) });
    if (p.cas === 'creee') lot.delete(bdd.doc(p.destination));
    else {
      const retrait = { migreLe: FieldValue.delete() };
      for (const k of p.ajoutees) retrait[k] = FieldValue.delete();
      if (p.conflits.length) retrait.conflitsMigration = FieldValue.delete();
      if (p.cas === 'non-objet') retrait.valeur = FieldValue.delete();
      lot.update(bdd.doc(p.destination), retrait);
    }
    console.log(`  ${VRAI ? 'remis' : 'à remettre'}  ${p.chemin}`);
    if (VRAI) await lot.commit();
  }
  if (!VRAI) console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour remettre.');
  process.exit(0);
}

/* --- Le relevé ------------------------------------------------------------ */
const projets = SEUL ? [await bdd.doc(`projets/${SEUL}`).get()] : (await bdd.collection('projets').get()).docs;
const parties = [];
let lues = 0;
for (const pr of projets) {
  if (!pr.exists) { console.log(`Projet ${SEUL} introuvable.`); continue; }
  const composants = await bdd.collection(`projets/${pr.id}/composants`).get();
  lues += composants.size;
  for (const c of composants.docs) {
    const d = c.data();
    if (!('technique' in d)) continue;
    const destination = `projets/${pr.id}/technique/${c.id}`;
    const fiche = await bdd.doc(destination).get();
    const source = d.technique;
    const enObjet = Boolean(source) && typeof source === 'object' && !Array.isArray(source) && !(source instanceof Timestamp);
    const existant = fiche.exists ? fiche.data() : null;
    const ajoutees = []; const conflits = []; const identiques = [];
    if (enObjet) {
      for (const [k, v] of Object.entries(source)) {
        if (!existant || !(k in existant)) ajoutees.push(k);
        else if (memeValeur(existant[k], v)) identiques.push(k);
        else conflits.push(k);
      }
    }
    parties.push({
      projet: pr.id, projetNom: pr.data().nom || pr.id, partie: c.id, partieNom: d.nom || c.id,
      chemin: c.ref.path, destination, enObjet, source, existant,
      cas: !enObjet ? 'non-objet' : (existant ? 'fusion' : 'creee'), ajoutees, conflits, identiques,
    });
  }
}

console.log(`${projets.length} projet(s) lus, ${lues} partie(s) lues, ${parties.length} portent encore un champ « technique ».\n`);
for (const p of parties) {
  console.log(`${p.projetNom} · ${p.partieNom}  (${p.chemin})`);
  if (!p.enObjet) {
    console.log(`  champ « technique » qui n'est pas un objet (${taille(p.source)}) : recopié tel quel sous ${p.destination}.valeur`);
  } else {
    console.log(`  vers ${p.destination} : ${p.cas === 'creee' ? 'fiche créée' : 'fiche existante, fusion'}`);
    for (const k of Object.keys(p.source)) {
      const etat = p.ajoutees.includes(k) ? 'copiée' : (p.identiques.includes(k) ? 'déjà identique' : 'CONFLIT : la fiche garde la sienne, celle de la partie va dans conflitsMigration');
      console.log(`    ${k.padEnd(14)} ${taille(p.source[k]).padEnd(18)} ${etat}`);
    }
  }
  console.log('  puis le champ « technique » est retiré de la partie (même lot)\n');
}

if (!parties.length) { console.log('Rien à faire.'); process.exit(0); }

const nConflits = parties.reduce((n, p) => n + p.conflits.length, 0);
console.log(`Bilan : ${parties.length} partie(s) à vider, ${parties.filter((p) => p.cas === 'creee').length} fiche(s) technique(s) à créer, `
  + `${parties.filter((p) => p.cas === 'fusion').length} à compléter, ${nConflits} conflit(s) conservé(s).`);

if (!VRAI) {
  console.log('\nÀ blanc : rien n\'a été écrit, aucune sauvegarde posée.');
  process.exit(0);
}

/* --- La sauvegarde, puis l'écriture -------------------------------------- */
const dossier = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'migrer-technique');
mkdirSync(dossier, { recursive: true });
const fichier = join(dossier, `${SUR_EMULATEUR ? 'emulateur' : 'production'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(fichier, JSON.stringify({
  projet: PROJET, le: new Date().toISOString(),
  parties: parties.map((p) => ({
    chemin: p.chemin, destination: p.destination, cas: p.cas, ajoutees: p.ajoutees, conflits: p.conflits,
    technique: versJson(p.source), ficheAvant: versJson(p.existant),
  })),
}, null, 2));
console.log(`\nSauvegarde : ${fichier}`);

for (const p of parties) {
  const lot = bdd.batch();
  const refFiche = bdd.doc(p.destination);
  if (!p.enObjet) {
    lot.set(refFiche, { valeur: p.source, migreLe: FieldValue.serverTimestamp() }, { merge: true });
  } else {
    const ajout = Object.fromEntries(p.ajoutees.map((k) => [k, p.source[k]]));
    const conflitsMigration = Object.fromEntries(p.conflits.map((k) => [k, p.source[k]]));
    lot.set(refFiche, {
      ...ajout,
      ...(p.conflits.length ? { conflitsMigration } : {}),
      migreLe: FieldValue.serverTimestamp(),
      ...(p.cas === 'creee' ? { maj: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  lot.update(bdd.doc(p.chemin), { technique: FieldValue.delete() });
  await lot.commit();
  console.log(`  rangée  ${p.chemin}`);
}

/* La preuve : relire, plus aucune partie migrée ne porte le champ. */
let restantes = 0;
for (const p of parties) if ('technique' in ((await bdd.doc(p.chemin).get()).data() || {})) restantes += 1;
console.log(restantes ? `\nATTENTION : ${restantes} partie(s) portent encore le champ.` : '\nVérifié : plus aucune partie migrée ne porte le champ « technique ».');
process.exit(restantes ? 1 : 0);
