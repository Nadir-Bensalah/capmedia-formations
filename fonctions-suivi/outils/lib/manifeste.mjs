/* ==========================================================================
   La photographie d'une base : ce qui existe, sous quelle forme, où.

   Pour chaque document des collections que la Gate 1 touche (ou qu'elle
   ne doit PAS toucher) : son identifiant, une empreinte de ses données, et
   les champs qui portent une relation (projet, organisation, facture,
   chemin, testeurs...). Pour chaque objet Storage : chemin, taille, md5,
   type, métadonnées. Pas de valeurs complètes dans le fichier écrit : des
   empreintes, et les champs de relation (des identifiants fictifs).

   Deux photographies se comparent par `ecartsBruts` (tout ce qui diffère)
   ou par les contrôles métier du préflight.
   ========================================================================== */

import { createHash } from 'node:crypto';

/* Les collections photographiées. « * » : un segment quelconque. */
export const COLLECTIONS = [
  'projets', 'projetsInternes', 'organisations', 'organisationsInternes', 'paiements', 'paiementsInternes',
  'documents', 'fichiers', 'tickets', 'tickets/*/messages', 'validations', 'projets/*/messages',
  'testeurs', 'testeurs/*/public', 'projets/*/profilsTesteurs', 'projets/*/campagnes', 'projets/*/campagnes/*/passages',
  'projets/*/anomalies', 'equipe', 'annuaire', 'envois', 'activite', 'audit', 'boites/*/notifications', 'migrationGate1',
];

/* Les champs qui disent une relation, gardés en clair dans la photographie. */
const RELATIONS = ['projet', 'organisation', 'facture', 'chemin', 'fichier.chemin', 'testeurs', 'membres', 'projets', 'testeur', 'scenario', 'visibilite', 'statut', 'type', 'actif', 'interne', 'archive', 'par.cote'];

const canon = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v.toDate === 'function') return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
};
export const empreinte = (v) => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 16);
const lireChemin = (o, chemin) => chemin.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/* Toutes les collections qui correspondent au motif « a/*\/b ». */
const collectionsDe = async (bdd, motif) => {
  const segments = motif.split('/');
  let refs = [bdd];
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const suivants = [];
    for (const r of refs) {
      if (i % 2 === 0) suivants.push(r.collection(s));
      else if (s === '*') suivants.push(...(await r.listDocuments()));
      else suivants.push(r.doc(s));
    }
    refs = suivants;
  }
  return refs;
};

export const photographier = async ({ bdd, seau }) => {
  const docs = {};
  const donnees = {};
  for (const motif of COLLECTIONS) {
    for (const col of await collectionsDe(bdd, motif)) {
      for (const d of (await col.get()).docs) {
        const x = d.data();
        const chemin = d.ref.path;
        donnees[chemin] = canon(x);
        docs[chemin] = {
          collection: motif,
          empreinte: empreinte(x),
          champs: Object.keys(x).sort(),
          relations: Object.fromEntries(RELATIONS.map((k) => [k, canon(lireChemin(x, k))]).filter(([, v]) => v !== undefined && v !== null)),
        };
      }
    }
  }
  const objets = {};
  const [fichiers] = await seau.getFiles();
  for (const f of fichiers) {
    const [m] = await f.getMetadata();
    objets[f.name] = { taille: Number(m.size || 0), md5: m.md5Hash || '', type: m.contentType || '', metadonnees: canon(m.metadata || {}) };
  }
  const compte = {};
  for (const d of Object.values(docs)) compte[d.collection] = (compte[d.collection] || 0) + 1;
  return { prise: new Date().toISOString(), compte, docs, objets, donnees };
};

/* La version écrite sur disque : sans les données, seulement empreintes et relations. */
export const pourDisque = (photo) => ({ prise: photo.prise, compte: photo.compte, docs: photo.docs, objets: photo.objets });

/* Les champs qu'un serveur horodate : ils diffèrent d'un passage à l'autre sans rien dire. */
const VOLATILS = new Set(['maj', 'date', 'le']);
const sansVolatils = (v) => {
  if (Array.isArray(v)) return v.map(sansVolatils);
  if (v && typeof v === 'object' && !v.__ts) return Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILS.has(k)).map(([k, x]) => [k, sansVolatils(x)]));
  return v;
};

/* Toutes les différences entre deux photographies. `volatils` : ignorer les horodatages
   dans les collections que la migration écrit elle-même. */
export const ecartsBruts = (a, b, { volatils = false } = {}) => {
  const ecarts = [];
  const ecritesParMigration = /^(projetsInternes|organisationsInternes|paiementsInternes|annuaire|migrationGate1)\/|\/profilsTesteurs\//;
  for (const chemin of new Set([...Object.keys(a.donnees), ...Object.keys(b.donnees)])) {
    if (!(chemin in a.donnees)) { ecarts.push(`document en plus : ${chemin}`); continue; }
    if (!(chemin in b.donnees)) { ecarts.push(`document en moins : ${chemin}`); continue; }
    const norm = (x) => (volatils && ecritesParMigration.test(chemin) ? sansVolatils(x) : x);
    if (JSON.stringify(norm(a.donnees[chemin])) !== JSON.stringify(norm(b.donnees[chemin]))) ecarts.push(`document différent : ${chemin}`);
  }
  for (const chemin of new Set([...Object.keys(a.objets), ...Object.keys(b.objets)])) {
    if (!(chemin in a.objets)) { ecarts.push(`objet en plus : ${chemin}`); continue; }
    if (!(chemin in b.objets)) { ecarts.push(`objet en moins : ${chemin}`); continue; }
    if (JSON.stringify(a.objets[chemin]) !== JSON.stringify(b.objets[chemin])) ecarts.push(`objet différent : ${chemin}`);
  }
  return ecarts;
};
