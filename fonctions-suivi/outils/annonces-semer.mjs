/* ==========================================================================
   CAPMEDIA CLIENT HUB · la première annonce : la tarification de 2027

   Crée, EN BROUILLON, l'annonce « Nouvelle tarification au 1er janvier
   2027 » (annonces/tarif-2027-01) : type tarif, tous les clients, 420 € HT
   par jour pour un projet long (plus de 3 mois), 480 € HT pour un projet
   court (moins de 3 mois), date d'effet 2027-01-01. Nadir la relit puis la
   publie depuis le Cockpit (Annonces) : c'est la publication qui prévient
   les clients, une seule fois (hubAnnonceEcrite).

   Une annonce déjà là n'est pas réécrite (elle a pu être retouchée dans le
   Cockpit) ; --ecraser la remet à ce texte, toujours en brouillon.

   À BLANC PAR DÉFAUT : rien n'est lu ni écrit, le script montre l'annonce.

     node annonces-semer.mjs                        (à blanc)
     node annonces-semer.mjs --vrai                 (émulateur seulement)
     node annonces-semer.mjs --vrai --production    (PRODUCTION, sur ordre explicite)

   En production, la collection annonces/ est sauvegardée en JSON, hors du
   dépôt, AVANT la première écriture : ~/Capmedia/sauvegardes/annonces/
   (ou $SAUVEGARDES).
   ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = (nom) => process.argv.includes(nom);
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ECRASER = arg('--ecraser');
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const ID = 'tarif-2027-01';

export const ANNONCE_TARIF_2027 = {
  type: 'tarif',
  titre: 'Nouvelle tarification au 1er janvier 2027',
  texte: [
    'Bonjour,',
    'À partir du 1er janvier 2027, la tarification de Capmedia tient compte de la durée de chaque projet.',
    'Un projet long, de plus de 3 mois, est facturé 420 € HT par jour. Un projet court, de moins de 3 mois, est facturé 480 € HT par jour. Un projet déjà engagé depuis plus de 3 mois reste donc à 420 € HT par jour.',
    'Vous trouverez ci-dessous ce que cela change pour chacun de vos projets. Une question ? Écrivez-nous, nous vous répondons avec plaisir.',
    'Merci pour votre confiance.',
  ].join('\n\n'),
  dateEffet: '2027-01-01',
  publication: 'brouillon',
  publieLe: null,
  epinglee: true,
  cible: { tous: true, organisations: [], uids: [] },
  tarif: { tjmLong: 420, tjmCourt: 480, seuilMois: 3, devise: '€', taxe: 'HT', texteLong: '', texteCourt: '' },
  indisponibilite: null,
};

const garde = () => {
  if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
    console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
    process.exit(2);
  }
  if (PRODUCTION && SUR_EMULATEUR) {
    console.error('--production avec FIRESTORE_EMULATOR_HOST posé : contradictoire, rien n\'est fait.');
    process.exit(2);
  }
  if (PRODUCTION && !VRAI) {
    console.error('--production sans --vrai : rien à faire (à blanc, aucune base n\'est touchée).');
    process.exit(2);
  }
  console.log(VRAI
    ? (SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE} : ÉCRITURE` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} : ÉCRITURE !!!\n`)
    : 'À blanc : rien n\'est lu ni écrit.');
};

/* Ce que le script dit avant d'écrire : la règle du tiret cadratin et les
   bornes des règles Firestore, vérifiées ici aussi. */
const verifier = (a) => {
  const fautes = [];
  if (JSON.stringify(a).includes('\u2014')) fautes.push('tiret cadratin dans le texte');
  if (a.titre.length > 120) fautes.push('titre de plus de 120 caractères');
  if (a.texte.length > 4000) fautes.push('texte de plus de 4 000 caractères');
  if (!(a.tarif.tjmLong > 0 && a.tarif.tjmCourt > 0 && a.tarif.taxe === 'HT')) fautes.push('tarif incomplet');
  return fautes;
};

const sauvegarder = async (bdd, Timestamp) => {
  const conv = (v) => {
    if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
    if (Array.isArray(v)) return v.map(conv);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
    return v;
  };
  const q = await bdd.collection('annonces').get();
  const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'annonces');
  mkdirSync(lieu, { recursive: true });
  const fichier = join(lieu, `annonces-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(fichier, JSON.stringify({ base: PROJET_FIREBASE, le: new Date().toISOString(), annonces: q.docs.map((d) => ({ id: d.id, donnees: conv(d.data()) })) }, null, 2));
  console.log(`Sauvegarde de l'existant (${q.size} annonce(s)) : ${fichier}`);
};

async function principal() {
  garde();
  const fautes = verifier(ANNONCE_TARIF_2027);
  if (fautes.length) { console.error(`Annonce refusée : ${fautes.join(', ')}.`); process.exit(1); }
  console.log(`annonces/${ID} · ${ANNONCE_TARIF_2027.titre}`);
  console.log(`  type tarif, tous les clients, effet le ${ANNONCE_TARIF_2027.dateEffet}, en brouillon, épinglée`);
  console.log(`  long (plus de 3 mois) : ${ANNONCE_TARIF_2027.tarif.tjmLong} € HT par jour ; court (moins de 3 mois) : ${ANNONCE_TARIF_2027.tarif.tjmCourt} € HT par jour`);
  console.log(`\n${ANNONCE_TARIF_2027.texte}\n`);
  if (!VRAI) { console.log('À blanc : relancez avec --vrai sur l\'émulateur.'); return; }

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJET_FIREBASE });
  const bdd = getFirestore();
  if (PRODUCTION) await sauvegarder(bdd, Timestamp);
  const ref = bdd.doc(`annonces/${ID}`);
  const deja = await ref.get();
  if (deja.exists && !ECRASER) {
    console.log(`annonces/${ID} existe déjà (${deja.data().publication}) : laissée telle quelle. --ecraser la remet à ce texte, en brouillon.`);
    return;
  }
  await ref.set({
    ...ANNONCE_TARIF_2027,
    cree: deja.exists ? (deja.data().cree || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    maj: FieldValue.serverTimestamp(),
  });
  console.log(`annonces/${ID} ${deja.exists ? 'réécrite' : 'créée'}, en brouillon : à relire et publier depuis le Cockpit (Annonces).`);
}

principal().catch((e) => { console.error(e); process.exit(1); });
