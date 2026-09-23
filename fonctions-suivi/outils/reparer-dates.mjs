/* ==========================================================================
   CAPMEDIA CLIENT HUB · reposer les dates perdues

   Le nettoyage des documents côté serveur traitait la marque « date du
   serveur » comme un objet ordinaire, la parcourait, et l'écrivait vide.
   Toute l'activité, toutes les notifications et une partie de la file
   d'envoi sont donc datées d'un objet vide, depuis le premier jour.

   Le code est corrigé (hub.js, suivi.js : « marqueServeur »). Reste à
   réparer l'existant. Firestore garde l'instant de création de chaque
   document, mais ne l'expose pas : on reconstruit donc la date depuis ce
   qu'on a sous la main, dans cet ordre.

     1. un champ de date voisin du même document (cree, envoye, maj) ;
     2. la date du document que la ligne désigne (la tâche, le devis) ;
     3. faute de mieux, la ligne est laissée telle quelle et comptée.

   Sans « --vrai », rien n'est écrit : le compte et les exemples sortent
   à l'écran. C'est le même garde-fou que les autres outils de ce dossier.

     node fonctions-suivi/outils/reparer-dates.mjs            (à blanc)
     node fonctions-suivi/outils/reparer-dates.mjs --vrai     (pour de vrai)

   Sur les émulateurs, poser FIRESTORE_EMULATOR_HOST ; sans lui, l'outil
   parle à la PRODUCTION et le dit avant d'écrire.
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const VRAI = process.argv.includes('--vrai');
const EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();

/* Une vraie date, ou rien. Un objet vide, un map, une chaîne illisible
   comptent pour rien : c'est justement ce qu'on répare. */
const vraieDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};

/* Le document que la ligne désigne, quand on peut le retrouver. Une ligne
   d'activité porte « cible » et « lien » ; une notification porte « lien ».
   On ne fait pas de miracle : si rien ne se lit, on passe. */
const dateDeLaCible = async (d) => {
  const lien = String(d.lien || '').replace(/^#/, '');
  const pistes = [];
  let m;
  if ((m = /^\/projets\/([^/]+)\/(?:taches|demandes)\/([^/?]+)/.exec(lien))) pistes.push(`taches/${m[2]}`, `tickets/${m[2]}`);
  if ((m = /^\/finances\/([^/?]+)/.exec(lien))) pistes.push(`documents/${m[1]}`);
  if ((m = /^\/valider\/([^/?]+)/.exec(lien)) || (m = /^\/validations\/([^/?]+)/.exec(lien))) pistes.push(`validations/${m[1]}`);
  if (d.cible && typeof d.cible === 'string' && d.cible.includes('/')) pistes.push(d.cible);
  for (const chemin of pistes) {
    try {
      const doc = await bdd.doc(chemin).get();
      if (!doc.exists) continue;
      const x = doc.data();
      const trouvee = vraieDate(x.cree) || vraieDate(x.date) || vraieDate(x.maj);
      if (trouvee) return trouvee;
    } catch (err) { /* un chemin qui n'existe pas n'est pas une panne */ }
  }

  /* Le dernier repère honnête : le PROJET que la ligne concerne. Une ligne
     d'activité ne peut pas être antérieure à la création de son projet, ni
     postérieure à sa dernière modification. On prend donc la création du
     projet, qui borne la ligne par le bas et ne prétend rien de plus.

     C'est volontairement approximatif, et c'est assumé : l'ordre relatif de
     deux lignes du même projet reste inconnu, mais le fil cesse d'être
     mélangé ENTRE projets et entre années, ce qui est le vrai symptôme. */
  const projetId = d.projet || (/^\/projets\/([^/?]+)/.exec(lien) || [])[1];
  if (projetId) {
    try {
      const doc = await bdd.doc(`projets/${projetId}`).get();
      if (doc.exists) {
        const x = doc.data();
        const trouvee = vraieDate(x.cree) || vraieDate(x.debut);
        if (trouvee) return { date: trouvee, approx: true };
      }
    } catch (err) { /* idem */ }
  }
  return null;
};

/* Une collection à réparer : son nom, le champ de date, et les champs
   voisins où chercher un repli. */
const reparer = async ({ titre, docs, champ, replis }) => {
  let sansDate = 0; let reparees = 0; let perdues = 0; let approchees = 0;
  const exemples = [];
  let lot = bdd.batch(); let enAttente = 0;

  for (const doc of docs) {
    const d = doc.data();
    if (vraieDate(d[champ])) continue;
    sansDate += 1;

    let date = null;
    for (const r of replis) { date = date || vraieDate(d[r]); }
    let approx = false;
    if (!date) {
      const trouve = await dateDeLaCible(d);
      if (trouve && trouve.approx) { date = trouve.date; approx = true; }
      else date = trouve;
    }
    /* Dernier repli : l'identifiant d'un document Firestore n'encode pas
       l'heure, on ne l'invente donc pas. Une ligne sans aucun repère reste
       telle quelle, et on la compte : mieux vaut une ligne sans date qu'une
       date fausse dans l'historique d'un client. */
    if (!date) { perdues += 1; continue; }

    if (exemples.length < 3) exemples.push(`${date.toISOString().slice(0, 16).replace('T', ' ')}${approx ? ' ~' : '  '} · ${String(d.texte || d.titre || doc.id).slice(0, 60)}`);
    if (approx) approchees += 1;
    if (VRAI) {
      /* « dateApprochee » dit noir sur blanc que cette date est reconstruite
         et non mesurée : si un jour on veut les distinguer à l'écran, ou les
         reprendre, l'information est là plutôt que perdue. */
      lot.update(doc.ref, approx
        ? { [champ]: Timestamp.fromDate(date), dateApprochee: true }
        : { [champ]: Timestamp.fromDate(date) });
      enAttente += 1;
      if (enAttente >= 400) { await lot.commit(); lot = bdd.batch(); enAttente = 0; }
    }
    reparees += 1;
  }
  if (VRAI && enAttente) await lot.commit();

  console.log(`\n  ${titre}`);
  console.log(`    ${docs.length} document(s), ${sansDate} sans date`);
  console.log(`    ${reparees} ${VRAI ? 'réparée(s)' : 'réparable(s)'} dont ${approchees} approchée(s), ${perdues} sans repère`);
  exemples.forEach((e) => console.log(`      ${e}`));
  return { sansDate, reparees, perdues };
};

const main = async () => {
  console.log(`\n  Base : ${EMULATEUR ? `émulateur (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION capmedia-1f90d'}`);
  console.log(`  Mode : ${VRAI ? 'ÉCRITURE' : 'à blanc, rien ne sera écrit'}`);

  const activite = await bdd.collection('activite').get();
  const notifications = await bdd.collectionGroup('notifications').get();
  const envois = await bdd.collection('envois').get();

  const a = await reparer({ titre: 'Activité', docs: activite.docs, champ: 'date', replis: ['maj', 'cree'] });
  const n = await reparer({ titre: 'Notifications', docs: notifications.docs, champ: 'date', replis: ['cree', 'maj'] });
  const e = await reparer({ titre: "File d'envoi", docs: envois.docs, champ: 'cree', replis: ['envoye', 'maj'] });

  const total = a.reparees + n.reparees + e.reparees;
  const restant = a.perdues + n.perdues + e.perdues;
  console.log(`\n  ${total} ligne(s) ${VRAI ? 'réparées' : 'à réparer'}, ${restant} sans repère.`);
  if (!VRAI && total) console.log('  Relancez avec --vrai pour écrire.\n');
  else console.log('');
};

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
