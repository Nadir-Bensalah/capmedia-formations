/* ==========================================================================
   CAPMEDIA CLIENT HUB · le préflight de la migration Gate 1

   Sur les émulateurs (Firestore, Storage, fonctions ALLUMÉES comme en
   production), à partir d'une base « avant Gate 1 » fictive :

   1. l'essai à blanc n'écrit rien ;
   2. la migration réelle (le même script, les mêmes options que la
      production, sans --production) : aucune perte, aucun doublon, aucune
      relation cassée, aucun objet manquant, aucune donnée interne restée sur
      une fiche client, aucun effet de bord des fonctions ;
   3. le second passage n'écrit rien et ne change rien ;
   4. la migration coupée après chaque unité de travail, puis reprise, rend
      exactement l'état d'une migration d'une traite ;
   5. une valeur déjà écrite par les nouvelles fonctions n'est pas écrasée,
      et l'ancienne valeur est gardée à part ;
   6. le retour arrière (--annuler) rend l'ancien rangement, y compris pour
      un fichier déposé après la bascule, et une nouvelle migration repart.

   Les photographies (empreintes, relations, objets) sont écrites dans
   fonctions-suivi/qa/preflight/ (ignoré par Git).

     node fonctions-suivi/outils/preflight-gate1.test.mjs [--rapide]
   (--rapide : coupe la migration à une unité sur trois au lieu de toutes)
   ========================================================================== */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { semerAvantGate1, viderEmulateur, declencheurs } from './lib/avant-gate1.mjs';
import { photographier, pourDisque, ecartsBruts } from './lib/manifeste.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Émulateurs Firestore et Storage requis.'); process.exit(2);
}
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const BUCKET = `${PROJET}.firebasestorage.app`;
initializeApp({ projectId: PROJET, storageBucket: BUCKET });
const bdd = getFirestore();
const seau = getStorage().bucket(BUCKET);
const SORTIE = fileURLToPath(new URL('../qa/preflight/', import.meta.url));
mkdirSync(SORTIE, { recursive: true });

let ok = 0; const ecarts = [];
const verifier = (l, vrai, detail = '') => { if (vrai) { ok += 1; console.log('  ok     ' + l); } else { ecarts.push(l); console.log('  ÉCART  ' + l + (detail ? ` · ${String(detail).slice(0, 400)}` : '')); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const migrer = (...options) => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./migrer-confidentialite.mjs', import.meta.url)), ...options],
    { encoding: 'utf8', env: { ...process.env, GCLOUD_PROJECT: PROJET, BUCKET } });
  const unites = Number(((r.stdout || '').match(/\((\d+) unité\(s\) écrite\(s\)\)/) || [])[1] ?? -1);
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}`, unites };
};
const base = async () => { await viderEmulateur({ bdd, seau, projet: PROJET }); await semerAvantGate1({ bdd, seau }); };
/* Les déclencheurs tournent après les écritures : on attend qu'ils se taisent. */
const photoCalme = async () => { await pause(6000); return photographier({ bdd, seau }); };
const ecrire = (nom, photo) => writeFileSync(`${SORTIE}${nom}.json`, JSON.stringify(pourDisque(photo), null, 1));
const doc = (photo, chemin) => photo.donnees[chemin];
const sous = (photo, prefixe) => Object.keys(photo.donnees).filter((c) => c.startsWith(prefixe));
const sans = (o, champs) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !champs.includes(k)));
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const vide = (v) => v === undefined || v === null || v === '';

const INTERNES = [['projets', 'projetsInternes', ['budget', 'budgetNote', 'sante']], ['organisations', 'organisationsInternes', ['notesInternes']], ['paiements', 'paiementsInternes', ['note']]];
const INCHANGEES = /^(tickets|validations|equipe|envois|activite|audit|boites)\/|^projets\/[^/]+\/(messages|campagnes|anomalies|scenarios)\/|^testeurs\/[^/]+$/;

/* Les contrôles métier d'une migration terminée, par rapport à la base d'avant. */
const controlerMigration = (A, B, titre) => {
  console.log(`\n== ${titre}`);
  /* Les champs internes : partis des fiches, arrivés à l'identique. */
  for (const [source, cible, champs] of INTERNES) {
    const ids = sous(A, `${source}/`).filter((c) => c.split('/').length === 2);
    let restes = 0; let perdus = 0; let alteres = 0;
    for (const c of ids) {
      const a = doc(A, c); const b = doc(B, c);
      if (!b) { perdus += 1; continue; }
      if (champs.some((k) => k in b)) restes += 1;
      if (!egal(sans(a, champs), b)) alteres += 1;
      const i = doc(B, `${cible}/${c.split('/')[1]}`) || {};
      for (const k of champs) if (!vide(a[k]) && !egal(i[k], a[k])) perdus += 1;
    }
    verifier(`${source} : aucune donnée interne restée sur une fiche client (${ids.length} fiches)`, restes === 0, `${restes}`);
    verifier(`${source} -> ${cible} : chaque valeur arrivée à l'identique`, perdus === 0, `${perdus} perdue(s)`);
    verifier(`${source} : le reste de chaque fiche est intact`, alteres === 0, `${alteres}`);
    const enTrop = sous(B, `${cible}/`).filter((c) => !doc(A, `${source}/${c.split('/')[1]}`));
    verifier(`${cible} : aucune fiche interne sans fiche d'origine`, enTrop.length === 0, enTrop.join(', '));
  }

  /* Les fichiers et les PDF : sous leur fiche, même contenu, rien perdu. */
  for (const [col, lire, dossier] of [['fichiers', (x) => x.chemin, 'fichiers'], ['documents', (x) => (x.fichier || {}).chemin, 'pieces']]) {
    let mal = 0; let orphelins = 0; let alteres = 0; let n = 0;
    for (const c of sous(A, `${col}/`)) {
      const a = doc(A, c); const b = doc(B, c); const id = c.split('/')[1];
      const avant = lire(a); if (!avant) continue;
      n += 1;
      const apres = lire(b);
      const o = A.objets[avant];
      if (!o) { orphelins += 1; if (apres !== avant) mal += 1; continue; }
      const attendu = `projets/${a.projet}/${dossier}/${id}/${avant.split('/').pop()}`;
      if (apres !== attendu || !B.objets[apres] || B.objets[apres].md5 !== o.md5 || B.objets[apres].type !== o.type || !egal(B.objets[apres].metadonnees, o.metadonnees)) mal += 1;
      const aSans = col === 'fichiers' ? sans(a, ['chemin']) : { ...a, fichier: sans(a.fichier, ['chemin']) };
      const bSans = col === 'fichiers' ? sans(b, ['chemin']) : { ...b, fichier: sans(b.fichier, ['chemin']) };
      if (!egal(aSans, bSans)) alteres += 1;
    }
    verifier(`${col} : ${n} fiches rangées sous leur identifiant, même contenu, mêmes métadonnées`, mal === 0, `${mal}`);
    verifier(`${col} : le reste de chaque fiche est intact (projet, visibilité, statut)`, alteres === 0, `${alteres}`);
    if (orphelins) verifier(`${col} : ${orphelins} fiche(s) sans objet laissée(s) telle(s) quelle(s)`, true);
  }
  const perdus = Object.keys(A.objets).filter((c) => !B.objets[c]);
  verifier(`Storage : aucun ancien objet supprimé (${Object.keys(A.objets).length})`, perdus.length === 0, perdus.join(', '));
  const modifies = Object.keys(A.objets).filter((c) => B.objets[c] && (B.objets[c].md5 !== A.objets[c].md5 || B.objets[c].taille !== A.objets[c].taille));
  verifier('Storage : aucun ancien objet modifié', modifies.length === 0, modifies.join(', '));
  const attendus = new Set(Object.keys(A.objets));
  for (const [col, lire] of [['fichiers', (x) => x.chemin], ['documents', (x) => (x.fichier || {}).chemin]]) for (const c of sous(B, `${col}/`)) { const ch = lire(doc(B, c)); if (ch) attendus.add(ch); }
  const enTrop = Object.keys(B.objets).filter((c) => !attendus.has(c));
  verifier('Storage : aucun objet en trop (pas de doublon)', enTrop.length === 0, enTrop.join(', '));

  /* Les pièces des notes internes. */
  const interne = (c) => ((B.objets[c] || {}).metadonnees || {}).visibilite === 'interne';
  verifier('les pièces de notes internes sont marquées', interne('projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png') && interne('projets/pf-ouvert-2/tickets/pf-t-3/note-interne-2.png'));
  verifier('une pièce jointe à une réponse publique ne l est pas', !interne('projets/pf-ouvert-1/tickets/pf-t-1/capture-client.png') && !interne('projets/pf-ouvert-1/tickets/pf-t-1/partagee.png'));
  const ancienToken = (B.objets['projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png'] || {}).metadonnees || {};
  verifier('marquer une pièce ne retire aucune autre métadonnée', Object.keys(ancienToken).every((k) => k === 'visibilite' || egal(ancienToken[k], ((A.objets['projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png'] || {}).metadonnees || {})[k])));

  /* Les testeurs : un profil par projet actif, aucun profil commun, aucun de trop. */
  const attenduProfils = new Set();
  for (const c of sous(A, 'testeurs/').filter((x) => x.split('/').length === 2)) {
    const t = doc(A, c);
    if (t.actif === false) continue;
    for (const p of t.projets || []) attenduProfils.add(`projets/${p}/profilsTesteurs/${c.split('/')[1]}`);
  }
  const profils = Object.keys(B.donnees).filter((c) => /\/profilsTesteurs\//.test(c));
  verifier(`un profil par testeur actif et par projet (${attenduProfils.size})`, profils.length === attenduProfils.size && profils.every((c) => attenduProfils.has(c)), profils.join(', '));
  const mauvais = profils.filter((c) => { const b = doc(B, c); const t = doc(A, `testeurs/${c.split('/')[3]}`) || {}; return !egal(b.age, (t.profil || {}).age || '') || !egal(b.fonction, (t.profil || {}).fonction || '') || 'projets' in b || 'nom' in b || 'prenom' in b || 'email' in b; });
  verifier('chaque profil est celui du bon testeur, sans nom, adresse ni autres projets', mauvais.length === 0, mauvais.join(', '));
  verifier('plus aucun profil commun', Object.keys(B.donnees).filter((c) => /^testeurs\/[^/]+\/public\//.test(c)).length === 0);

  /* L'annuaire. */
  const actifs = sous(A, 'equipe/').filter((c) => doc(A, c).actif !== false);
  const annuaire = sous(B, 'annuaire/');
  verifier(`l annuaire porte les ${actifs.length} membres actifs, par leur nom seul`, annuaire.length === actifs.length && actifs.every((c) => { const e = doc(B, `annuaire/${c.split('/')[1]}`); return e && e.nom === doc(A, c).nom && Object.keys(sans(e, ['maj'])).length === 1; }));

  /* Ce que la migration ne touche pas, et les effets de bord des fonctions. */
  const touches = Object.keys(A.donnees).filter((c) => INCHANGEES.test(c) && !egal(doc(A, c), doc(B, c)));
  verifier('demandes, messages, validations, campagnes, passages, équipe, testeurs : intacts', touches.length === 0, touches.join(', '));
  const nouveaux = Object.keys(B.donnees).filter((c) => !(c in A.donnees) && /^(envois|activite|audit|boites|tickets|projets\/[^/]+\/anomalies)\//.test(c));
  verifier('aucun e-mail, aucune notification, aucune activité, aucun audit, aucune anomalie créés', nouveaux.length === 0, nouveaux.join(', '));
  const statuts = Object.keys(A.donnees).filter((c) => (doc(A, c) || {}).statut !== undefined && (doc(B, c) || {}).statut !== (doc(A, c) || {}).statut);
  verifier('aucun statut changé', statuts.length === 0, statuts.join(', '));
  const disparus = Object.keys(A.donnees).filter((c) => !(c in B.donnees) && !/^testeurs\/[^/]+\/public\//.test(c));
  verifier('aucun document disparu (hors profils communs)', disparus.length === 0, disparus.join(', '));
};

/* --sections=2,7 : ne jouer que ces sections (3 à 6 s'appuient sur la 2). */
const SECTIONS = ((process.argv.find((x) => x.startsWith('--sections=')) || '').split('=')[1] || '').split(',').filter(Boolean).map(Number);
const voulu = (n) => !SECTIONS.length || SECTIONS.includes(n) || (n === 2 && SECTIONS.some((x) => x >= 3 && x <= 6));

/* ------------------------------------------------------------------ */
await base();
const A = await photographier({ bdd, seau });
ecrire('1-avant', A);
console.log(`\nBase « avant Gate 1 » : ${Object.keys(A.donnees).length} documents, ${Object.keys(A.objets).length} objets`);
console.log('  ' + Object.entries(A.compte).map(([k, n]) => `${k} ${n}`).join(' · '));

let B; let vraie;
if (voulu(1)) {
console.log('\n== 1. L essai à blanc n écrit rien');
const blanc = migrer();
const A2 = await photoCalme();
verifier('le script sort sans erreur', blanc.code === 0, blanc.sortie);
verifier('rien n a changé en base ni dans le Storage', ecartsBruts(A, A2).length === 0, ecartsBruts(A, A2).join(' | '));
verifier('et il annonce le travail à faire', /champs internes déplacés/.test(blanc.sortie) && /rangés sous leur fiche/.test(blanc.sortie));

}

if (voulu(2)) {
console.log('\n== 2. La migration réelle');
vraie = migrer('--vrai');
verifier(`le script sort sans erreur (${vraie.unites} unités)`, vraie.code === 0 && vraie.unites > 0, vraie.sortie);
console.log(vraie.sortie.split('\n').filter((l) => /^\s+\d+\s|^\s+- /.test(l)).map((l) => '         ' + l.trim()).join('\n'));
B = await photoCalme();
ecrire('2-apres', B);
controlerMigration(A, B, '2. Après la migration : les contrôles métier');
verifier('le bilan signale le PDF sans objet et le fichier hors de son projet', /pf-fact-4/.test(vraie.sortie) && /pf-fic-egare/.test(vraie.sortie));
verifier('le bilan signale la pièce à la fois interne et publique', /partagee\.png/.test(vraie.sortie));

}

if (voulu(3)) {
console.log('\n== 3. Le second passage');
const second = migrer('--vrai');
const B2 = await photoCalme();
ecrire('3-second-passage', B2);
verifier('il n écrit aucune unité', second.code === 0 && second.unites === 0, second.sortie);
verifier('et la base est strictement identique', ecartsBruts(B, B2).length === 0, ecartsBruts(B, B2).join(' | '));

}

if (voulu(4)) {
console.log('\n== 4. La migration coupée, puis reprise');
const pas = process.argv.includes('--rapide') ? 3 : 1;
const coupures = [];
for (let n = 1; n < vraie.unites; n += pas) coupures.push(n);
let reprisesConformes = 0; const reprisesFautives = [];
for (const n of coupures) {
  await base();
  const coupe = migrer('--vrai', `--arret-apres=${n}`);
  const reprise = migrer('--vrai');
  const C = await photographier({ bdd, seau });
  const diff = ecartsBruts(B, C, { volatils: true });
  if (coupe.code === 3 && reprise.code === 0 && !diff.length) reprisesConformes += 1;
  else reprisesFautives.push(`coupée à ${n} (sortie ${coupe.code}/${reprise.code}) : ${diff.slice(0, 3).join(' | ')}`);
}
verifier(`coupée après chacune des ${coupures.length} unités puis reprise : état final identique à une traite`, reprisesFautives.length === 0, reprisesFautives.slice(0, 3).join(' || '));
console.log(`         ${reprisesConformes} reprise(s) conforme(s)`);
await base();
const c1 = migrer('--vrai', `--arret-apres=${Math.floor(vraie.unites / 3)}`);
const c2 = migrer('--vrai', `--arret-apres=${Math.floor(vraie.unites / 3)}`);
const c3 = migrer('--vrai');
const C3 = await photographier({ bdd, seau });
verifier('coupée deux fois de suite, puis reprise : même état final', c1.code === 3 && c2.code === 3 && c3.code === 0 && ecartsBruts(B, C3, { volatils: true }).length === 0, ecartsBruts(B, C3, { volatils: true }).slice(0, 3).join(' | '));

}

if (voulu(5)) {
console.log('\n== 5. Une valeur déjà écrite par les nouvelles fonctions n est pas écrasée');
await base();
await bdd.doc('projetsInternes/pf-ouvert-1').set({ sante: 'ok' });
await bdd.doc('organisationsInternes/pf-org-a').set({ notesInternes: 'Note écrite depuis le nouveau cockpit.' });
const conflit = migrer('--vrai');
const pi = (await bdd.doc('projetsInternes/pf-ouvert-1').get()).data();
const oi = (await bdd.doc('organisationsInternes/pf-org-a').get()).data();
verifier('la destination garde sa valeur', pi.sante === 'ok' && oi.notesInternes === 'Note écrite depuis le nouveau cockpit.');
verifier('les champs sans conflit sont copiés', pi.budget === 12400 && pi.budgetNote === 'Forfait, marge faible sur le module paiement.');
verifier('l ancienne valeur est gardée à part, pas perdue', (pi.conflitsMigration || []).some((c) => c.champ === 'sante' && c.valeur === 'attention') && (oi.conflitsMigration || []).some((c) => c.champ === 'notesInternes' && /45 jours/.test(c.valeur)));
verifier('la source est vidée quand même (aucune exposition)', !('sante' in (await bdd.doc('projets/pf-ouvert-1').get()).data()) && !('notesInternes' in (await bdd.doc('organisations/pf-org-a').get()).data()));
verifier('le bilan le signale', /conflits gardés à part/.test(conflit.sortie) && /pf-ouvert-1/.test(conflit.sortie));
/* L'ancien front, encore ouvert pendant la bascule, réécrit un champ sur la fiche : le passage suivant le range. */
await bdd.doc('projets/pf-ouvert-2').update({ budgetNote: 'Écrit par un ancien onglet.', sante: 'bloque' });
const rattrapage = migrer('--vrai');
const p2 = (await bdd.doc('projets/pf-ouvert-2').get()).data();
const i2 = (await bdd.doc('projetsInternes/pf-ouvert-2').get()).data();
verifier('un champ réécrit par un ancien onglet est rangé au passage suivant', !('budgetNote' in p2) && !('sante' in p2) && i2.budgetNote === 'Écrit par un ancien onglet.' && rattrapage.code === 0);
verifier('et une valeur qui contredit la destination est gardée à part', i2.sante === 'ok' && (i2.conflitsMigration || []).some((c) => c.champ === 'sante' && c.valeur === 'bloque'));

}

if (voulu(6)) {
console.log('\n== 6. Le retour arrière');
await base();
migrer('--vrai');
/* Un fichier déposé APRÈS la bascule, au nouveau chemin, sans ancien objet
   (posé déclencheurs coupés : c'est un état, pas un geste à annoncer). */
await declencheurs(false);
await seau.file('projets/pf-ouvert-1/fichiers/pf-fic-apres/nouveau.png').save(Buffer.from('déposé après la bascule'), { contentType: 'image/png' });
await bdd.doc('fichiers/pf-fic-apres').set({ projet: 'pf-ouvert-1', nom: 'nouveau.png', chemin: 'projets/pf-ouvert-1/fichiers/pf-fic-apres/nouveau.png', visibilite: 'client', par: { uid: 'pf-client-a', nom: 'Client A fictif', cote: 'client' } });
await declencheurs(true);
const P = await photoCalme();
const retour = migrer('--vrai', '--annuler');
verifier(`le retour arrière sort sans erreur (${retour.unites} unités)`, retour.code === 0, retour.sortie);
const R = await photoCalme();
ecrire('6-apres-retour', R);
/* Un champ interne VIDE (null, chaîne vide) ne porte rien : la migration ne le recopie pas, le retour arrière ne le recrée pas. */
const sansVidesInternes = (c, x) => {
  const regle = INTERNES.find(([s]) => c.startsWith(`${s}/`) && c.split('/').length === 2);
  return regle ? Object.fromEntries(Object.entries(x || {}).filter(([k, v]) => !(regle[2].includes(k) && vide(v)))) : x;
};
/* pf-fic-neuf était DÉJÀ au nouveau chemin avant la migration : les anciennes
   règles ne savent pas le servir, le retour arrière le recopie donc à l'ancien
   rangement (contrôlé plus bas, comme pf-fic-apres). */
const differents = Object.keys(A.donnees).filter((c) => !/^testeurs\/[^/]+\/public\//.test(c) && c !== 'fichiers/pf-fic-neuf' && !egal(sansVidesInternes(c, doc(A, c)), doc(R, c)));
verifier('chaque fiche d avant (projets, organisations, paiements, fichiers, pièces...) est revenue à l identique', differents.length === 0, differents.join(', '));
const neuf = doc(R, 'fichiers/pf-fic-neuf');
verifier('un fichier déjà au nouveau chemin avant la migration est recopié à l ancien rangement', neuf && neuf.chemin === 'projets/pf-ouvert-1/documents/fichiers/pf-fic-neuf-recent.png' && R.objets[neuf.chemin] && R.objets[neuf.chemin].md5 === A.objets['projets/pf-ouvert-1/fichiers/pf-fic-neuf/recent.png'].md5);
const effetsRetour = Object.keys(R.donnees).filter((c) => !(c in P.donnees) && /^(envois|activite|audit|boites|projets\/[^/]+\/anomalies)\//.test(c));
verifier('le retour arrière ne crée ni e-mail, ni notification, ni activité, ni audit', effetsRetour.length === 0, effetsRetour.join(', '));
const publics = sous(A, 'testeurs/').filter((c) => /\/public\//.test(c) && doc(A, c.replace(/\/public\/profil$/, '')).actif !== false);
verifier('les profils communs des testeurs actifs sont recréés au même contenu', publics.every((c) => egal(sans(doc(A, c), ['maj']), sans(doc(R, c), ['maj']))));
verifier('les collections internes sont vidées', !sous(R, 'projetsInternes/').length && !sous(R, 'organisationsInternes/').length && !sous(R, 'paiementsInternes/').length);
const apres = doc(R, 'fichiers/pf-fic-apres');
verifier('le fichier déposé après la bascule est recopié à l ancien rangement', apres && apres.chemin === 'projets/pf-ouvert-1/documents/client/pf-fic-apres-nouveau.png' && R.objets[apres.chemin] && R.objets[apres.chemin].md5 === R.objets['projets/pf-ouvert-1/fichiers/pf-fic-apres/nouveau.png'].md5);
verifier('aucun objet perdu pendant l aller-retour', Object.keys(A.objets).every((c) => R.objets[c] && R.objets[c].md5 === A.objets[c].md5));
const retour2 = migrer('--vrai', '--annuler');
verifier('le retour arrière rejoué n écrit plus rien', retour2.unites === 0, retour2.sortie);
const reprise = migrer('--vrai');
const D = await photoCalme();
verifier('une nouvelle migration après le retour arrière repart sans erreur', reprise.code === 0);
/* Le journal est un historique (il garde la trace des deux passages) et les
   deux fichiers repassés par l'ancien rangement ont changé de nom : le reste
   doit être identique. */
const diffD = ecartsBruts(B, D, { volatils: true }).filter((e) => !/pf-fic-apres|pf-fic-neuf|migrationGate1\//.test(e));
verifier('et retrouve l état d une première migration', diffD.length === 0, diffD.slice(0, 4).join(' | '));
const effetsReprise = Object.keys(D.donnees).filter((c) => !(c in R.donnees) && /^(envois|activite|audit|boites|projets\/[^/]+\/anomalies)\//.test(c));
verifier('la nouvelle migration ne crée ni e-mail, ni notification, ni activité', effetsReprise.length === 0, effetsReprise.join(', '));

}

if (voulu(7)) {
console.log('\n== 7. La suppression des anciens objets (--supprimer-anciens, plus tard)');
await base();
migrer('--vrai');
const M = await photographier({ bdd, seau });
const sup = migrer('--vrai', '--supprimer-anciens');
const S7 = await photoCalme();
ecrire('7-apres-suppression', S7);
verifier('la suppression sort sans erreur', sup.code === 0, sup.sortie);
const recopies = Object.entries(M.donnees).filter(([c]) => /^migrationGate1\/(fichiers|pieces)__/.test(c)).map(([, j]) => j);
verifier(`chaque ancien objet recopié et vérifié est supprimé (${recopies.length})`, recopies.every((j) => !S7.objets[j.ancien]), recopies.filter((j) => S7.objets[j.ancien]).map((j) => j.ancien).join(', '));
const pointes = [...sous(S7, 'fichiers/').map((c) => doc(S7, c).chemin), ...sous(S7, 'documents/').map((c) => (doc(S7, c).fichier || {}).chemin)].filter(Boolean);
const casses = pointes.filter((c) => !S7.objets[c] && c !== 'projets/pf-ouvert-2/documents/facture/1720000014-perdu.pdf');
verifier('chaque fiche pointe encore sur un objet présent, au même contenu', casses.length === 0, casses.join(', '));
const intouches = Object.keys(M.objets).filter((c) => !recopies.some((j) => j.ancien === c));
verifier(`tous les autres objets restent intacts (${intouches.length} : demandes, conversation, validations, preuves, nouvelles copies)`, intouches.every((c) => S7.objets[c] && S7.objets[c].md5 === M.objets[c].md5));
verifier('aucun e-mail, aucune notification, aucune activité', !Object.keys(S7.donnees).some((c) => !(c in M.donnees) && /^(envois|activite|audit|boites)\//.test(c)));
const sup2 = migrer('--vrai', '--supprimer-anciens');
verifier('rejouée, elle n écrit plus rien', sup2.unites === 0, sup2.sortie);
const retourApres = migrer('--vrai', '--annuler');
const R7 = await photographier({ bdd, seau });
const ancienVisible = doc(R7, 'fichiers/pf-fic-visible');
verifier('après la suppression, le retour arrière recopie encore vers l ancien rangement', retourApres.code === 0 && ancienVisible && /^projets\/pf-ouvert-1\/documents\/fichiers\/pf-fic-visible-/.test(ancienVisible.chemin) && R7.objets[ancienVisible.chemin] && R7.objets[ancienVisible.chemin].md5 === M.objets[doc(M, 'fichiers/pf-fic-visible').chemin].md5, ancienVisible && ancienVisible.chemin);
}

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
console.log(`Photographies : ${SORTIE}`);
process.exit(ecarts.length ? 1 : 0);
