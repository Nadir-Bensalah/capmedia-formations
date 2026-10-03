/* ==========================================================================
   CAPMEDIA CLIENT HUB · la première annonce : la tarification de 2027

   Deux choses :
   - la grille de tarifs, source unique (reglages/tarifs, voir
     agence/suivi/assets/js/tarifs.js) : GRILLE_DEFAUT, soit 380 / 420 € HT
     par jour aujourd'hui et 420 / 480 € HT au 1er janvier 2027 (projet long
     de plus de 3 mois / projet court) ;
   - EN BROUILLON, l'annonce « Nouvelle tarification au 1er janvier 2027 »
     (annonces/tarif-2027-01) : type tarif, tous les clients, date d'effet
     2027-01-01. Elle ne porte aucun chiffre : l'encart de chaque client lit
     la grille. Nadir la relit puis la publie depuis le Cockpit (Annonces) :
     c'est la publication qui prévient les clients, une seule fois.

   Ce qui est déjà là (grille ou annonce) n'est pas réécrit : il a pu être
   retouché dans le Cockpit ; --ecraser les remet à ces valeurs (l'annonce
   toujours en brouillon).

   À BLANC PAR DÉFAUT : rien n'est lu ni écrit, le script montre l'annonce.

     node annonces-semer.mjs                        (à blanc)
     node annonces-semer.mjs --vrai                 (émulateur seulement)
     node annonces-semer.mjs --vrai --production    (PRODUCTION, sur ordre explicite)

   En production, la collection annonces/ et reglages/tarifs sont
   sauvegardés en JSON, hors du dépôt, AVANT la première écriture : ~/Capmedia/sauvegardes/annonces/
   (ou $SAUVEGARDES).
   ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GRILLE_DEFAUT } from '../../agence/suivi/assets/js/tarifs.js';

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
    'À partir du 1er janvier 2027, les tarifs de Capmedia évoluent.',
    'Le prix d\'une journée dépend de la durée du projet : un projet long, de plus de 3 mois, et un projet court, de moins de 3 mois. Un projet déjà engagé depuis plus de 3 mois garde le tarif des projets longs.',
    'Vous trouverez ci-dessous la grille, en euros, et ce qu\'elle change pour chacun de vos projets. Une question ? Écrivez-nous, nous vous répondons avec plaisir.',
    'Merci pour votre confiance.',
  ].join('\n\n'),
  dateEffet: '2027-01-01',
  publication: 'brouillon',
  publieLe: null,
  epinglee: true,
  cible: { tous: true, organisations: [], uids: [] },
  /* Les deux phrases de l'encart : vides, celles de la page reviennent. */
  tarif: { texteLong: '', texteCourt: '' },
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
  if (Object.keys(a.tarif).some((k) => !['texteLong', 'texteCourt'].includes(k))) fautes.push('chiffres dans l annonce : ils vivent dans la grille');
  const g = GRILLE_DEFAUT;
  if (!g.periodes.length || g.periodes.some((p) => !(p.long > 0 && p.court > 0)) || !(g.seuilMois >= 1)) fautes.push('grille par défaut incomplète');
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
  const grille = await bdd.doc('reglages/tarifs').get();
  const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'annonces');
  mkdirSync(lieu, { recursive: true });
  const fichier = join(lieu, `annonces-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(fichier, JSON.stringify({ base: PROJET_FIREBASE, le: new Date().toISOString(), annonces: q.docs.map((d) => ({ id: d.id, donnees: conv(d.data()) })), tarifs: grille.exists ? conv(grille.data()) : null }, null, 2));
  console.log(`Sauvegarde de l'existant (${q.size} annonce(s), grille ${grille.exists ? 'présente' : 'absente'}) : ${fichier}`);
};

async function principal() {
  garde();
  const fautes = verifier(ANNONCE_TARIF_2027);
  if (fautes.length) { console.error(`Annonce refusée : ${fautes.join(', ')}.`); process.exit(1); }
  console.log(`annonces/${ID} · ${ANNONCE_TARIF_2027.titre}`);
  console.log(`  type tarif, tous les clients, effet le ${ANNONCE_TARIF_2027.dateEffet}, en brouillon, épinglée`);
  console.log(`reglages/tarifs · grille par défaut, seuil ${GRILLE_DEFAUT.seuilMois} mois, TVA ${GRILLE_DEFAUT.tva} %`);
  GRILLE_DEFAUT.periodes.forEach((p) => console.log(`  à partir du ${p.debut} : long ${p.long} € HT par jour ; court ${p.court} € HT par jour`));
  console.log(`\n${ANNONCE_TARIF_2027.texte}\n`);
  if (!VRAI) { console.log('À blanc : relancez avec --vrai sur l\'émulateur.'); return; }

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJET_FIREBASE });
  const bdd = getFirestore();
  if (PRODUCTION) await sauvegarder(bdd, Timestamp);
  const refGrille = bdd.doc('reglages/tarifs');
  const grille = await refGrille.get();
  if (grille.exists && !ECRASER) console.log('reglages/tarifs existe déjà : laissée telle quelle.');
  else {
    await refGrille.set({ ...GRILLE_DEFAUT, periodes: GRILLE_DEFAUT.periodes.map((p) => ({ ...p })), maj: FieldValue.serverTimestamp() });
    console.log(`reglages/tarifs ${grille.exists ? 'réécrite' : 'créée'} avec la grille par défaut.`);
  }
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
