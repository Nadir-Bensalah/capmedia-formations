/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'import des scénarios de test

   Lit un plan de tests écrit en markdown et le verse dans la bibliothèque
   de scénarios d'un projet. Le markdown reste la source de vérité : on
   ajoute un scénario là-bas, on relance ce script, il arrive ici.

   Rejouable sans dommage : l'identifiant du document est la référence du
   scénario (« DI-15 »), donc une seconde exécution met à jour au lieu
   d'ajouter. Un scénario retiré du markdown n'est pas supprimé, il est
   désactivé : les passages déjà enregistrés continuent de le nommer.

   Usage :
     node importer-scenarios.mjs <projet> <fichier.md> [--vrai]

   Sans --vrai, le script décrit ce qu'il ferait et n'écrit rien.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/* --------------------------------------------------------------------------
   Le classement de couverture.

   « socle » : le comportement dépend du système, donc deux testeurs sur deux
   systèmes différents le passent. « transversal » : demande deux appareils par
   construction, donc doublé lui aussi. « reparti » : se comporte pareil
   partout, une seule personne suffit.

   Tout ce qui n'est pas nommé ici est réparti. C'est le bon défaut : oublier
   de classer un scénario le fait passer une fois, jamais zéro.
   -------------------------------------------------------------------------- */
const SOCLE = new Set([
  /* Les quatre régressions du refus Google : jamais une seule fois. */
  'DI-R1', 'DI-R2', 'DI-R3', 'DI-R4',
  /* Heures : format 12/24, minuit, fuseau. */
  'DI-06', 'DI-07', 'DI-08',
  /* Notifications : le moteur n'est pas le même des deux côtés. */
  'DI-11', 'DI-12', 'DI-13', 'DI-14', 'DI-15', 'DI-16', 'DI-17',
  'DI-18',
  /* Modifier un rappel reprogramme au niveau système. */
  'DI-23', 'DI-24', 'DI-25',
  /* Dates et heures des tâches. */
  'TA-11', 'TA-12', 'TA-13', 'TA-14', 'TA-15', 'TA-16', 'TA-17',
  /* Récurrences : le bloc le plus fragile de l'application. */
  'TA-18', 'TA-19', 'TA-20', 'TA-21', 'TA-22', 'TA-23', 'TA-24', 'TA-25',
  'TA-26', 'TA-27', 'TA-28', 'TA-29', 'TA-30', 'TA-31', 'TA-32', 'TA-33',
  /* Occurrences d'une récurrente. */
  'TA-38', 'TA-39', 'TA-40', 'TA-41',
  /* Séries de rituels : calcul de jour, passage de minuit. */
  'RI-06', 'RI-07', 'RI-11', 'RI-14', 'RI-15', 'RI-16',
  /* Échéances d'objectifs. */
  'OB-08', 'OB-09',
  /* Photos : sélecteur, compression, permissions, stockage. Tout diffère. */
  'VO-08', 'VO-09', 'VO-10', 'VO-11', 'VO-13',
  /* Carte : Apple Maps contre Google Maps. */
  'VO-14',
  /* Accents, apostrophes, émojis : rendu différent. */
  'JO-05',
  /* Pagination et défilement natifs. */
  'ID-11',
]);

/* Les transversaux sont doublés par construction : ils touchent la
   synchronisation entre appareils, les langues, l'abonnement. */
const PREFIXES_TRANSVERSAUX = ['TR-', 'CC-'];

const BLOCS = {
  DI: { cle: 'dates-importantes', libelle: 'Dates importantes' },
  TA: { cle: 'taches',            libelle: 'Tâches' },
  RI: { cle: 'rituels',           libelle: 'Rituels' },
  OB: { cle: 'objectifs',         libelle: 'Objectifs' },
  VO: { cle: 'voyages',           libelle: 'Voyages' },
  JO: { cle: 'journal',           libelle: 'Journal' },
  ID: { cle: 'idees',             libelle: 'Idées' },
  TR: { cle: 'transversal',       libelle: 'Transversal' },
  CC: { cle: 'compte-charge',     libelle: 'Compte chargé et archivées' },
};

const niveauDe = (ref) => {
  if (PREFIXES_TRANSVERSAUX.some((p) => ref.startsWith(p))) return 'transversal';
  return SOCLE.has(ref) ? 'socle' : 'reparti';
};

/* Un scénario du socle ou transversal tourne partout. Un scénario réparti
   aussi : ce qui change est le nombre de testeurs qui le prennent, pas les
   plateformes où il a un sens. La distinction se fait à l'affectation. */
const PLATEFORMES = ['ios', 'android', 'web'];

/* --------------------------------------------------------------------------
   La lecture du markdown.

   On cherche les lignes de tableau à quatre colonnes dont la première est une
   référence de scénario. Le titre de section le plus proche au dessus donne le
   nom du groupe, ce qui permet de garder l'ordre du document.
   -------------------------------------------------------------------------- */
const REF = /^\|\s*([A-Z]{2}-[A-Z]?\d+)\s*\|/;
const CELLULES = /^\|(.+)\|\s*$/;

function lireScenarios(markdown) {
  const lignes = markdown.split('\n');
  const trouves = [];
  let groupe = '';
  let ordre = 0;

  for (const ligne of lignes) {
    const titre = ligne.match(/^#{2,4}\s+(.+?)\s*$/);
    if (titre) { groupe = titre[1].replace(/^[\d.]+\s*/, ''); continue; }

    if (!REF.test(ligne)) continue;
    const cellules = ligne.match(CELLULES);
    if (!cellules) continue;

    const cols = cellules[1].split('|').map((c) => c.trim());
    if (cols.length < 4) continue;

    const ref = cols[0];
    const prefixe = ref.slice(0, 2);
    const bloc = BLOCS[prefixe];
    if (!bloc) { console.warn(`  ignoré, bloc inconnu : ${ref}`); continue; }

    ordre += 1;
    trouves.push({
      ref,
      bloc: bloc.cle,
      blocLibelle: bloc.libelle,
      groupe,
      titre: cols[1],
      options: cols[2],
      attendu: cols[3],
      niveau: niveauDe(ref),
      plateformes: PLATEFORMES,
      ordre,
      actif: true,
    });
  }
  return trouves;
}

/* Le bloc « compte chargé » est numéroté autrement dans le plan : « 9.1 » au
   lieu de « CC-01 ». On le rattrape à part pour ne pas le perdre. */
const NUMEROTE = /^\|\s*(\d+)\.(\d+)\s*\|([^|]+)\|([^|]+)\|/;

function lireNumerotes(markdown, depuis) {
  const lignes = markdown.split('\n');
  const trouves = [];
  let ordre = depuis;
  let dansLeBloc = false;

  for (const ligne of lignes) {
    if (/^##\s+9\./.test(ligne)) { dansLeBloc = true; continue; }
    if (dansLeBloc && /^##\s+(?!9\.)/.test(ligne)) { dansLeBloc = false; continue; }
    if (!dansLeBloc) continue;

    const m = ligne.match(NUMEROTE);
    if (!m) continue;

    ordre += 1;
    const ref = `CC-${String(m[2]).padStart(2, '0')}`;
    trouves.push({
      ref,
      bloc: BLOCS.CC.cle,
      blocLibelle: BLOCS.CC.libelle,
      groupe: 'Compte chargé et tâches archivées',
      titre: m[3].trim(),
      options: '',
      attendu: m[4].trim(),
      niveau: 'transversal',
      plateformes: PLATEFORMES,
      ordre,
      actif: true,
    });
  }
  return trouves;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const [projet, fichier] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const vrai = process.argv.includes('--vrai');

  if (!projet || !fichier) {
    console.error('Usage : node importer-scenarios.mjs <projet> <fichier.md> [--vrai]');
    process.exit(1);
  }

  const markdown = readFileSync(fichier, 'utf8');
  const scenarios = [...lireScenarios(markdown)];
  const numerotes = lireNumerotes(markdown, scenarios.length);
  scenarios.push(...numerotes);

  if (!scenarios.length) {
    console.error('Aucun scénario trouvé. Le fichier a-t-il le bon format ?');
    process.exit(1);
  }

  /* Une référence en double veut dire que le plan se contredit : on s'arrête
     plutôt que d'en écraser une silencieusement. */
  const vues = new Map();
  for (const s of scenarios) {
    if (vues.has(s.ref)) {
      console.error(`Référence en double : ${s.ref} (« ${vues.get(s.ref)} » et « ${s.titre} »)`);
      process.exit(1);
    }
    vues.set(s.ref, s.titre);
  }

  /* Le récapitulatif, par bloc et par niveau. */
  const parBloc = new Map();
  const parNiveau = { socle: 0, reparti: 0, transversal: 0 };
  for (const s of scenarios) {
    parBloc.set(s.blocLibelle, (parBloc.get(s.blocLibelle) || 0) + 1);
    parNiveau[s.niveau] += 1;
  }

  console.log(`\n${scenarios.length} scénarios lus dans ${fichier}\n`);
  console.log('  Par bloc');
  for (const [bloc, n] of parBloc) console.log(`    ${String(n).padStart(3)}  ${bloc}`);
  console.log('\n  Par niveau de couverture');
  console.log(`    ${String(parNiveau.socle).padStart(3)}  socle, doublé iOS et Android`);
  console.log(`    ${String(parNiveau.reparti).padStart(3)}  réparti, une seule fois`);
  console.log(`    ${String(parNiveau.transversal).padStart(3)}  transversal, doublé`);

  const passages = parNiveau.socle * 2 + parNiveau.reparti + parNiveau.transversal * 2;
  console.log(`\n  Soit ${passages} passages mobiles et ${scenarios.length} passages web par campagne complète.`);

  if (!vrai) {
    console.log('\nEssai à blanc : rien n\'a été écrit. Ajoutez --vrai pour verser.\n');
    return;
  }

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('\n  ⚠ FIRESTORE_EMULATOR_HOST absent : écriture sur la vraie base.');
  }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
  const bdd = getFirestore();
  const col = bdd.collection(`projets/${projet}/scenarios`);

  /* Ce qui était là avant, pour savoir ce qui disparaît du plan. */
  const avant = new Set();
  (await col.get()).forEach((d) => avant.add(d.id));

  let lot = bdd.batch();
  let n = 0;
  for (const s of scenarios) {
    lot.set(col.doc(s.ref), { ...s, maj: FieldValue.serverTimestamp() }, { merge: true });
    avant.delete(s.ref);
    if ((n += 1) % 400 === 0) { await lot.commit(); lot = bdd.batch(); }
  }

  /* Un scénario retiré du plan n'est pas supprimé : les passages enregistrés
     le nomment encore, et une référence orpheline ne se lit pas. */
  for (const ref of avant) lot.set(col.doc(ref), { actif: false, maj: FieldValue.serverTimestamp() }, { merge: true });

  await lot.commit();

  console.log(`\n  ${scenarios.length} scénarios versés dans projets/${projet}/scenarios`);
  if (avant.size) console.log(`  ${avant.size} scénarios absents du plan, désactivés : ${[...avant].join(', ')}`);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
