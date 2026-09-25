/* ==========================================================================
   CAPMEDIA CLIENT HUB · migration « confidentialité » (Release Gate 1)

   Les règles de la Release Gate 1 ne servent plus au client ce qui est
   interne. Mais une règle ne masque pas un CHAMP : tant qu'une donnée
   interne reste posée sur une fiche que le client lit, il la lit. Cette
   migration déplace donc l'existant vers le nouveau rangement :

     1. projets.budget, budgetNote, sante     -> projetsInternes/{p}
     2. organisations.notesInternes           -> organisationsInternes/{o}
     3. paiements.note                        -> paiementsInternes/{id}
     4. testeurs/{uid}/public/profil          -> projets/{p}/profilsTesteurs/{uid}
     5. equipe/{uid}.nom                      -> annuaire/{uid}
     6. Storage, fichiers d'un projet         projets/{p}/documents/... -> projets/{p}/fichiers/{fichierId}/...
     7. Storage, PDF comptables               projets/{p}/documents/... -> projets/{p}/pieces/{documentId}/...
     8. Storage, pièces des notes internes    métadonnée visibilite = interne

   GARANTIES (éprouvées par preflight-gate1.test.mjs) :
   - Rejouable : chaque étape regarde l'état réel avant d'écrire. Un second
     passage n'écrit rien.
   - Interruptible : le travail est découpé en UNITÉS. Une unité Firestore
     est atomique (un lot : la destination, la source, le journal) ; une
     unité Storage suit l'ordre copie, puis fiche, puis (plus tard)
     suppression. Couper entre deux unités laisse un état que la reprise
     termine, jamais un état où une fiche vise un objet absent.
   - Sans perte : si la destination porte déjà une valeur DIFFÉRENTE de la
     source (écrite par les nouvelles fonctions pendant la bascule), la
     destination est gardée et la valeur de la source est conservée dans
     `conflitsMigration` sur la fiche interne, puis signalée au bilan.
   - Sans exposition : la source est vidée dans le MÊME lot que la copie.
   - Réversible : chaque déplacement est consigné dans `migrationGate1/`
     (fermée au client par la dernière règle). `--annuler` fait le chemin
     inverse, et les anciens objets Storage restent en place tant qu'on n'a
     pas lancé `--supprimer-anciens`.

   À BLANC par défaut : rien n'est écrit, le bilan dit ce qui le serait.
     node fonctions-suivi/outils/migrer-confidentialite.mjs                          (lecture seule)
     node fonctions-suivi/outils/migrer-confidentialite.mjs --vrai                   (émulateur seulement)
     node fonctions-suivi/outils/migrer-confidentialite.mjs --vrai --production      (PRODUCTION, sur ordre explicite)
     ... --annuler                 le retour arrière (données), voir ROLLBACK-GATE1 dans le rapport
     ... --supprimer-anciens       supprime les anciens objets Storage déjà recopiés et vérifiés
     ... --arret-apres=N           (émulateur seulement) s'arrête net après N unités : banc d'interruption
   ========================================================================== */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const arg = (nom) => process.argv.includes(nom);
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const SUPPRIMER = arg('--supprimer-anciens');
const ANNULER = arg('--annuler');
const ARRET = Number((process.argv.find((a) => a.startsWith('--arret-apres=')) || '').split('=')[1] || 0);
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const BUCKET = process.env.BUCKET || `${PROJET}.firebasestorage.app`;

if (VRAI && !SUR_EMULATEUR && !PRODUCTION) {
  console.error('Écriture hors émulateur refusée : ajoutez --production, et seulement sur ordre explicite.');
  process.exit(2);
}
if (ARRET && !SUR_EMULATEUR) { console.error('--arret-apres ne sert qu au banc : refusé hors émulateur.'); process.exit(2); }
if (SUPPRIMER && ANNULER) { console.error('--supprimer-anciens et --annuler sont incompatibles.'); process.exit(2); }
if (SUR_EMULATEUR && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Firestore est émulé mais Storage ne l est pas : FIREBASE_STORAGE_EMULATOR_HOST requis (sinon le Storage de production serait touché).');
  process.exit(2);
}
if (!SUR_EMULATEUR) console.log(`\n!!! Base de PRODUCTION ${PROJET}${VRAI ? ' : ÉCRITURE' : ' : lecture seule'} !!!\n`);

initializeApp({ projectId: PROJET, storageBucket: BUCKET });
const bdd = getFirestore();
const seau = getStorage().bucket(BUCKET);
const bilan = {};
const compter = (cle, n = 1) => { bilan[cle] = (bilan[cle] || 0) + n; };
const signalements = [];
const signaler = (texte) => { signalements.push(texte); };

/* Une UNITÉ de travail. À blanc, rien ne part. Au banc, --arret-apres=N
   coupe le processus avant la (N+1)e unité, comme une panne. */
let unites = 0;
const unite = async (fn) => {
  if (!VRAI) return;
  if (ARRET && unites >= ARRET) { console.log(`ARRÊT VOLONTAIRE après ${unites} unité(s)`); process.exit(3); }
  await fn();
  unites += 1;
};
const journal = (cle) => bdd.doc(`migrationGate1/${cle}`);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const vide = (v) => v === undefined || v === null || v === '';
const nomDe = (chemin) => chemin.split('/').pop();
const objet = async (chemin) => {
  const f = seau.file(chemin);
  const [existe] = await f.exists();
  if (!existe) return null;
  const [meta] = await f.getMetadata();
  return { md5: meta.md5Hash || '', taille: Number(meta.size || 0), meta };
};

/* ==========================================================================
   Les champs internes : source -> destination, destination prioritaire
   ========================================================================== */

const deplacerChamps = async ({ type, source, cible, champs }) => {
  const s = source.data();
  const presents = champs.filter((k) => k in s);
  if (!presents.length) return;
  const c = (await cible.get()).data() || {};
  const aCopier = {}; const conflits = [];
  for (const k of presents) {
    const v = s[k];
    if (vide(v)) continue;
    if (!(k in c) || vide(c[k])) aCopier[k] = v;
    else if (!egal(c[k], v)) conflits.push({ champ: k, valeur: v, le: Timestamp.now() });
  }
  await unite(async () => {
    const lot = bdd.batch();
    if (Object.keys(aCopier).length || conflits.length) {
      lot.set(cible, { ...aCopier, ...(conflits.length ? { conflitsMigration: FieldValue.arrayUnion(...conflits) } : {}), maj: FieldValue.serverTimestamp() }, { merge: true });
    }
    lot.update(source.ref, Object.fromEntries(presents.map((k) => [k, FieldValue.delete()])));
    lot.set(journal(`${type}__${source.id}`), { type, id: source.id, champs: Object.fromEntries(presents.map((k) => [k, s[k] ?? null])), conflits: conflits.map((x) => x.champ), date: FieldValue.serverTimestamp() });
    await lot.commit();
  });
  compter(`${type} : champs internes déplacés`);
  if (conflits.length) { compter(`${type} : conflits gardés à part`); signaler(`${type} ${source.id} : ${conflits.map((x) => x.champ).join(', ')} différaient déjà de la destination (destination gardée, ancienne valeur dans conflitsMigration)`); }
};

/* Le chemin inverse, pour --annuler : la destination redevient la source. */
const rapatrierChamps = async ({ type, collectionInterne, collectionSource, champs }) => {
  for (const d of (await bdd.collection(collectionInterne).get()).docs) {
    const src = bdd.doc(`${collectionSource}/${d.id}`);
    const s = (await src.get()).data();
    if (!s) { signaler(`${type} ${d.id} : la fiche d'origine n'existe plus, donnée interne laissée en place`); continue; }
    const i = d.data();
    const aRemettre = {};
    for (const k of champs) if (!vide(i[k]) && vide(s[k])) aRemettre[k] = i[k];
    await unite(async () => {
      const lot = bdd.batch();
      if (Object.keys(aRemettre).length) lot.update(src, aRemettre);
      lot.delete(d.ref);
      await lot.commit();
    });
    compter(`${type} : remis sur la fiche d'origine`);
  }
};

/* ==========================================================================
   Storage : copier, repointer la fiche, et ne supprimer que plus tard
   ========================================================================== */

const rangerObjet = async ({ type, fiche, ancien, nouveau, repointer }) => {
  const src = await objet(ancien);
  const dst = await objet(nouveau);
  if (!src && !dst) { compter(`${type} : objet introuvable, fiche laissée telle quelle`); signaler(`${type} ${fiche.id} : ni ${ancien} ni ${nouveau} n'existent`); return; }
  if (src) {
    await unite(() => journal(`${type}__${fiche.id}`).set({ type, id: fiche.id, ancien, nouveau, md5: src.md5, taille: src.taille, date: FieldValue.serverTimestamp() }));
    if (!dst || dst.md5 !== src.md5) await unite(() => seau.file(ancien).copy(seau.file(nouveau)));
  }
  await unite(() => repointer(nouveau));
  compter(`${type} : rangés sous leur fiche`);
};

/* ==========================================================================
   Les étapes
   ========================================================================== */

const migrer = async () => {
  /* 1, 2, 3. Les champs internes. */
  for (const d of (await bdd.collection('projets').get()).docs) {
    await deplacerChamps({ type: 'projets', source: d, cible: bdd.doc(`projetsInternes/${d.id}`), champs: ['budget', 'budgetNote', 'sante'] });
  }
  for (const d of (await bdd.collection('organisations').get()).docs) {
    await deplacerChamps({ type: 'organisations', source: d, cible: bdd.doc(`organisationsInternes/${d.id}`), champs: ['notesInternes'] });
  }
  for (const d of (await bdd.collection('paiements').get()).docs) {
    await deplacerChamps({ type: 'paiements', source: d, cible: bdd.doc(`paiementsInternes/${d.id}`), champs: ['note'] });
  }

  /* 4. Les profils des testeurs : un par projet, et plus de profil commun. */
  for (const d of (await bdd.collection('testeurs').get()).docs) {
    const t = d.data();
    const actif = t.actif !== false;
    const projets = actif ? [...new Set((t.projets || []).filter(Boolean).map(String))] : [];
    const profil = t.profil || {};
    for (const p of projets) {
      const cible = bdd.doc(`projets/${p}/profilsTesteurs/${d.id}`);
      if ((await cible.get()).exists) continue;
      await unite(() => cible.set({ sexe: profil.sexe || '', age: profil.age || '', fonction: profil.fonction || '', aisance: profil.aisance || '', langue: profil.langue || '', mobile: t.mobile || '', plateformes: t.plateformes || [], maj: FieldValue.serverTimestamp() }));
      compter('testeurs : profil recopié sous un projet');
    }
    const ancien = bdd.doc(`testeurs/${d.id}/public/profil`);
    const a = await ancien.get();
    if (a.exists) {
      await unite(async () => {
        const lot = bdd.batch();
        lot.set(journal(`profil__${d.id}`), { type: 'profil', id: d.id, ancien: a.data(), date: FieldValue.serverTimestamp() });
        lot.delete(ancien);
        await lot.commit();
      });
      compter('testeurs : ancien profil commun effacé');
    }
  }

  /* 5. L'annuaire : le nom seul, pour les membres actifs. */
  for (const d of (await bdd.collection('equipe').get()).docs) {
    const e = d.data();
    const cible = bdd.doc(`annuaire/${d.id}`);
    const existe = (await cible.get()).exists;
    if (e.actif === false) { if (existe) { await unite(() => cible.delete()); compter('annuaire : membre inactif retiré'); } continue; }
    if (existe) continue;
    await unite(() => cible.set({ nom: String(e.nom || ''), maj: FieldValue.serverTimestamp() }));
    compter('annuaire : nom recopié');
  }

  /* 6. Les fichiers d'un projet. */
  for (const d of (await bdd.collection('fichiers').get()).docs) {
    const f = d.data();
    const chemin = String(f.chemin || '');
    if (!f.projet || !chemin) { compter('fichiers : sans projet ou sans chemin, laissés tels quels'); continue; }
    const nouveau = `projets/${f.projet}/fichiers/${d.id}/${nomDe(chemin)}`;
    if (chemin === nouveau) continue;
    /* Un objet rangé sous un AUTRE projet que sa fiche : la fiche fait foi
       (c'est elle que l'écran montre, avec sa visibilité). Le laisser en
       place le rendrait illisible au client du projet de la fiche. */
    if (!chemin.startsWith(`projets/${f.projet}/`)) signaler(`fichiers ${d.id} : ${chemin} n'était pas sous le projet ${f.projet} de sa fiche, recopié sous ce projet`);
    await rangerObjet({ type: 'fichiers', fiche: d, ancien: chemin, nouveau, repointer: (c) => d.ref.update({ chemin: c }) });
  }

  /* 7. Les PDF des pièces comptables. */
  for (const d of (await bdd.collection('documents').get()).docs) {
    const x = d.data();
    const chemin = String((x.fichier && x.fichier.chemin) || '');
    if (!chemin || !x.projet) continue;
    const nouveau = `projets/${x.projet}/pieces/${d.id}/${nomDe(chemin)}`;
    if (chemin === nouveau) continue;
    await rangerObjet({ type: 'pieces', fiche: d, ancien: chemin, nouveau, repointer: (c) => d.ref.update({ 'fichier.chemin': c }) });
  }

  /* 8. Les pièces des notes internes. Une pièce aussi jointe à une réponse
     publique n'est PAS marquée : ce serait la retirer au client. */
  for (const t of (await bdd.collection('tickets').get()).docs) {
    const messages = (await t.ref.collection('messages').get()).docs.map((m) => m.data());
    const publiques = new Set(messages.filter((m) => m.interne !== true).flatMap((m) => (m.pieces || []).map((p) => p && p.chemin)).filter(Boolean));
    for (const m of messages.filter((x) => x.interne === true)) {
      for (const piece of (m.pieces || [])) {
        if (!piece || !piece.chemin) continue;
        if (publiques.has(piece.chemin)) { compter('notes internes : pièce aussi publique, laissée visible'); signaler(`ticket ${t.id} : ${piece.chemin} est jointe à une note interne ET à une réponse publique`); continue; }
        const o = await objet(piece.chemin);
        if (!o) { compter('notes internes : pièce introuvable'); continue; }
        if ((o.meta.metadata || {}).visibilite === 'interne') continue;
        await unite(() => seau.file(piece.chemin).setMetadata({ metadata: { visibilite: 'interne' } }));
        compter('notes internes : pièce marquée interne');
      }
    }
  }
};

/* ==========================================================================
   --supprimer-anciens : seulement ce qui est recopié, identique et pointé
   ========================================================================== */

const supprimerAnciens = async () => {
  for (const j of (await bdd.collection('migrationGate1').where('type', 'in', ['fichiers', 'pieces']).get()).docs) {
    const e = j.data();
    if (e.supprime) continue;
    const fiche = (await bdd.doc(`${e.type === 'fichiers' ? 'fichiers' : 'documents'}/${e.id}`).get()).data() || {};
    const pointe = e.type === 'fichiers' ? fiche.chemin : (fiche.fichier || {}).chemin;
    const nouveau = await objet(e.nouveau);
    const ancien = await objet(e.ancien);
    if (!ancien) continue;
    if (pointe !== e.nouveau || !nouveau || nouveau.md5 !== e.md5) { signaler(`${e.type} ${e.id} : ancien objet gardé (la fiche ne pointe pas sur une copie identique)`); continue; }
    await unite(async () => { await seau.file(e.ancien).delete(); await j.ref.update({ supprime: true }); });
    compter('storage : ancien objet supprimé');
  }
};

/* ==========================================================================
   --annuler : le retour arrière des DONNÉES (les fonctions, les règles et
   le front se remettent par un redéploiement du commit précédent)
   ========================================================================== */

const annuler = async () => {
  await rapatrierChamps({ type: 'projets', collectionInterne: 'projetsInternes', collectionSource: 'projets', champs: ['budget', 'budgetNote', 'sante'] });
  await rapatrierChamps({ type: 'organisations', collectionInterne: 'organisationsInternes', collectionSource: 'organisations', champs: ['notesInternes'] });
  await rapatrierChamps({ type: 'paiements', collectionInterne: 'paiementsInternes', collectionSource: 'paiements', champs: ['note'] });

  /* Le profil commun, au format que lisent l'ancien front et l'ancienne fonction. */
  for (const d of (await bdd.collection('testeurs').get()).docs) {
    const t = d.data();
    const cible = bdd.doc(`testeurs/${d.id}/public/profil`);
    if (t.actif === false || (await cible.get()).exists) continue;
    const p = t.profil || {};
    await unite(() => cible.set({ sexe: p.sexe || '', age: p.age || '', fonction: p.fonction || '', aisance: p.aisance || '', langue: p.langue || '', mobile: t.mobile || '', plateformes: t.plateformes || [], projets: t.projets || [], maj: FieldValue.serverTimestamp() }));
    compter('testeurs : profil commun recréé');
  }

  /* Les objets : l'ancien chemin s'il existe encore, sinon une copie à un
     chemin que les anciennes règles savent servir. */
  const revenir = async ({ type, d, chemin, versAncien, dossierAncien, repointer }) => {
    if (!versAncien.test(chemin)) return;
    const j = (await journal(`${type}__${d.id}`).get()).data();
    if (j && j.ancien && await objet(j.ancien)) { await unite(() => repointer(j.ancien)); compter(`${type} : repointés vers l'ancien objet`); return; }
    if (!(await objet(chemin))) { signaler(`${type} ${d.id} : ${chemin} introuvable, rien à rapatrier`); return; }
    const cible = `${dossierAncien}/${d.id}-${nomDe(chemin)}`;
    if (!(await objet(cible))) await unite(() => seau.file(chemin).copy(seau.file(cible)));
    await unite(() => repointer(cible));
    compter(`${type} : copiés vers l'ancien rangement`);
  };
  for (const d of (await bdd.collection('fichiers').get()).docs) {
    const f = d.data();
    if (!f.projet || !f.chemin) continue;
    const dossier = ((f.par || {}).cote === 'client') ? 'client' : 'fichiers';
    await revenir({ type: 'fichiers', d, chemin: f.chemin, versAncien: new RegExp(`^projets/${f.projet}/fichiers/`), dossierAncien: `projets/${f.projet}/documents/${dossier}`, repointer: (c) => d.ref.update({ chemin: c }) });
  }
  for (const d of (await bdd.collection('documents').get()).docs) {
    const x = d.data();
    const chemin = (x.fichier || {}).chemin;
    if (!x.projet || !chemin) continue;
    await revenir({ type: 'pieces', d, chemin, versAncien: new RegExp(`^projets/${x.projet}/pieces/`), dossierAncien: `projets/${x.projet}/documents/${x.type || 'pieces'}`, repointer: (c) => d.ref.update({ 'fichier.chemin': c }) });
  }
  /* L'annuaire, les profils par projet et la marque « interne » des pièces
     restent : l'ancien code ne les lit pas, et les anciennes règles les
     ferment. Les garder rend une nouvelle migration immédiate. */
};

if (ANNULER) await annuler();
else if (SUPPRIMER) { await migrer(); await supprimerAnciens(); } else await migrer();

const mode = ANNULER ? 'Retour arrière' : 'Migration';
console.log(`\n${VRAI ? `${mode} faite` : `${mode} à blanc (rien écrit, ajoutez --vrai)`} sur ${SUR_EMULATEUR ? "l'émulateur" : `la PRODUCTION ${PROJET}`} (${unites} unité(s) écrite(s)) :`);
if (!Object.keys(bilan).length) console.log('  rien à faire.');
for (const [cle, n] of Object.entries(bilan)) console.log(`  ${String(n).padStart(4)}  ${cle}`);
if (signalements.length) { console.log('\nÀ regarder :'); for (const s of signalements) console.log(`  - ${s}`); }
if (VRAI && !ANNULER && !SUPPRIMER) console.log('\nLes anciens objets Storage sont conservés. --supprimer-anciens seulement une fois la bascule validée.');
process.exit(0);
