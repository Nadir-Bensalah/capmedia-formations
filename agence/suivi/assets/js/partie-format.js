/* ==========================================================================
   LA FICHE D'UNE PARTIE : le format, ses bornes, sa validation

   Une partie du projet (projets/{p}/composants/{id}) porte, en plus de son
   nom et de son statut, une fiche lisible par le client : ce qu'elle fait,
   où elle en est, son histoire datée, comment elle est faite. Ce module ne
   dépend de rien : la page (vues/brique.js), l'éditeur du Cockpit et
   l'outil d'import (fonctions-suivi/outils/parties-importer.mjs) lisent les
   mêmes bornes et la même validation. Les règles Firestore reprennent les
   bornes des textes et le nombre d'éléments de chaque liste.

   Rien de technique ne se pose ici : la fiche est servie au client. Les
   comptes, les accès et les bibliothèques vivent dans technique/{id}.
   ========================================================================== */

export const BORNES_PARTIE = {
  nom: 80,
  sousTitre: 160,
  resume: 1500,
  etatActuel: 800,
  hebergement: 400,
  versionEnLigne: { numero: 30, date: 10, ou: 60 },
  versionEnPreparation: { numero: 30, etat: 200 },
  liens: { max: 8, libelle: 60, url: 500 },
  chiffres: { max: 8, valeur: 24, libelle: 60 },
  fonctions: { max: 20, texte: 240 },
  technologies: { max: 20, nom: 60, role: 200 },
  historique: { max: 30, titre: 140, detail: 400 },
  prochainesEtapes: { max: 12, texte: 240 },
  pointsAttention: { max: 10, texte: 300 },
};

export const STATUTS_PARTIE = ['a-venir', 'en-cours', 'en-test', 'en-validation', 'livre', 'en-pause'];

/* Les champs de la fiche, dans l'ordre du format. `id` nomme le fichier. */
export const CHAMPS_FICHE = ['sousTitre', 'resume', 'etatActuel', 'versionEnLigne', 'versionEnPreparation', 'liens',
  'chiffres', 'fonctions', 'hebergement', 'technologies', 'historique', 'prochainesEtapes', 'pointsAttention'];
export const CHAMPS_FICHIER = ['id', 'nom', 'statut', ...CHAMPS_FICHE];

const CADRATIN = '\u2014';
const COURRIEL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
export const DATE_PARTIE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
export const URL_PARTIE = /^https:\/\/[^\s<>"']+$/i;

/* Un texte : chaîne, sans cadratin, sans adresse e-mail, borné. */
const texte = (v, nom, max, erreurs, { requis = false } = {}) => {
  if (v === undefined || v === null) { if (requis) erreurs.push(`${nom} : manquant`); return; }
  if (typeof v !== 'string') { erreurs.push(`${nom} : un texte est attendu`); return; }
  if (requis && !v.trim()) erreurs.push(`${nom} : vide`);
  if (v.length > max) erreurs.push(`${nom} : ${v.length} caractères, ${max} au plus`);
  if (v.includes(CADRATIN)) erreurs.push(`${nom} : contient un tiret cadratin`);
  if (COURRIEL.test(v)) erreurs.push(`${nom} : contient une adresse e-mail`);
};

const liste = (v, nom, max, erreurs) => {
  if (!Array.isArray(v)) { erreurs.push(`${nom} : une liste est attendue`); return false; }
  if (v.length > max) erreurs.push(`${nom} : ${v.length} éléments, ${max} au plus`);
  return true;
};

const objet = (v, nom, cles, erreurs) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { erreurs.push(`${nom} : un objet est attendu`); return false; }
  const autres = Object.keys(v).filter((k) => !cles.includes(k));
  if (autres.length) erreurs.push(`${nom} : champ inconnu ${autres.join(', ')}`);
  return true;
};

/**
 * Valide une fiche (celle d'un fichier, ou celle que l'éditeur s'apprête à
 * écrire). `fichier` : true exige `id` et refuse un champ hors format.
 * Rend { erreurs, avis }.
 */
export const validerPartie = (p, { fichier = false, attenduId = '' } = {}) => {
  const erreurs = [];
  const avis = [];
  const B = BORNES_PARTIE;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { erreurs: ['le fichier ne contient pas un objet'], avis };
  if (fichier) {
    const inconnues = Object.keys(p).filter((k) => !CHAMPS_FICHIER.includes(k));
    if (inconnues.length) erreurs.push(`champ inconnu : ${inconnues.join(', ')}`);
    if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) erreurs.push('id : minuscules, chiffres et tirets seulement');
    else if (attenduId && p.id !== attenduId) erreurs.push(`id « ${p.id} » différent du nom du fichier (« ${attenduId} »)`);
  }
  texte(p.nom, 'nom', B.nom, erreurs, { requis: fichier });
  if (p.statut !== undefined && !STATUTS_PARTIE.includes(p.statut)) erreurs.push(`statut : ${JSON.stringify(p.statut)} inconnu (permis : ${STATUTS_PARTIE.join(', ')})`);
  texte(p.sousTitre, 'sousTitre', B.sousTitre, erreurs);
  texte(p.resume, 'resume', B.resume, erreurs);
  texte(p.etatActuel, 'etatActuel', B.etatActuel, erreurs);
  texte(p.hebergement, 'hebergement', B.hebergement, erreurs);

  if (p.versionEnLigne !== undefined && p.versionEnLigne !== null && objet(p.versionEnLigne, 'versionEnLigne', ['numero', 'date', 'ou'], erreurs)) {
    const v = p.versionEnLigne;
    texte(v.numero, 'versionEnLigne.numero', B.versionEnLigne.numero, erreurs);
    texte(v.ou, 'versionEnLigne.ou', B.versionEnLigne.ou, erreurs);
    if (v.date !== undefined && v.date !== '' && (typeof v.date !== 'string' || !DATE_PARTIE.test(v.date))) erreurs.push(`versionEnLigne.date : ${JSON.stringify(v.date)}, attendu AAAA-MM-JJ`);
  }
  if (p.versionEnPreparation !== undefined && p.versionEnPreparation !== null && objet(p.versionEnPreparation, 'versionEnPreparation', ['numero', 'etat'], erreurs)) {
    texte(p.versionEnPreparation.numero, 'versionEnPreparation.numero', B.versionEnPreparation.numero, erreurs);
    texte(p.versionEnPreparation.etat, 'versionEnPreparation.etat', B.versionEnPreparation.etat, erreurs);
  }
  if (p.liens !== undefined && liste(p.liens, 'liens', B.liens.max, erreurs)) {
    p.liens.forEach((l, i) => {
      if (!objet(l, `liens[${i}]`, ['libelle', 'url'], erreurs)) return;
      texte(l.libelle, `liens[${i}].libelle`, B.liens.libelle, erreurs, { requis: true });
      if (typeof l.url !== 'string' || !URL_PARTIE.test(l.url) || l.url.length > B.liens.url) erreurs.push(`liens[${i}].url : une adresse https:// est attendue`);
    });
  }
  if (p.chiffres !== undefined && liste(p.chiffres, 'chiffres', B.chiffres.max, erreurs)) {
    p.chiffres.forEach((c, i) => {
      if (!objet(c, `chiffres[${i}]`, ['valeur', 'libelle'], erreurs)) return;
      texte(c.valeur, `chiffres[${i}].valeur`, B.chiffres.valeur, erreurs, { requis: true });
      texte(c.libelle, `chiffres[${i}].libelle`, B.chiffres.libelle, erreurs, { requis: true });
    });
  }
  for (const nom of ['fonctions', 'prochainesEtapes', 'pointsAttention']) {
    if (p[nom] !== undefined && liste(p[nom], nom, B[nom].max, erreurs)) {
      p[nom].forEach((x, i) => texte(x, `${nom}[${i}]`, B[nom].texte, erreurs, { requis: true }));
    }
  }
  if (p.technologies !== undefined && liste(p.technologies, 'technologies', B.technologies.max, erreurs)) {
    p.technologies.forEach((t, i) => {
      if (!objet(t, `technologies[${i}]`, ['nom', 'role'], erreurs)) return;
      texte(t.nom, `technologies[${i}].nom`, B.technologies.nom, erreurs, { requis: true });
      texte(t.role, `technologies[${i}].role`, B.technologies.role, erreurs);
    });
  }
  if (p.historique !== undefined && liste(p.historique, 'historique', B.historique.max, erreurs)) {
    p.historique.forEach((h, i) => {
      if (!objet(h, `historique[${i}]`, ['date', 'titre', 'detail'], erreurs)) return;
      if (typeof h.date !== 'string' || !DATE_PARTIE.test(h.date)) erreurs.push(`historique[${i}].date : ${JSON.stringify(h.date)}, attendu AAAA-MM-JJ`);
      texte(h.titre, `historique[${i}].titre`, B.historique.titre, erreurs, { requis: true });
      texte(h.detail, `historique[${i}].detail`, B.historique.detail, erreurs);
    });
    const dates = p.historique.map((h) => (h && h.date) || '');
    if (dates.some((d, i) => i > 0 && d > dates[i - 1])) avis.push('historique : pas rangé du plus récent au plus ancien (la page le range elle-même)');
  }
  return { erreurs, avis };
};

/* Ce qui s'écrit sur la partie : les seuls champs présents, nettoyés. Un
   champ absent du fichier n'est jamais touché. */
export const versDocumentPartie = (p) => {
  const t = (v) => String(v || '').trim();
  const doc = {};
  if (p.nom !== undefined) doc.nom = t(p.nom);
  if (p.statut !== undefined) doc.statut = p.statut;
  for (const c of ['sousTitre', 'resume', 'etatActuel', 'hebergement']) if (p[c] !== undefined) doc[c] = t(p[c]);
  if (p.versionEnLigne) doc.versionEnLigne = { numero: t(p.versionEnLigne.numero), date: t(p.versionEnLigne.date), ou: t(p.versionEnLigne.ou) };
  if (p.versionEnPreparation) doc.versionEnPreparation = { numero: t(p.versionEnPreparation.numero), etat: t(p.versionEnPreparation.etat) };
  if (p.liens) doc.liens = p.liens.map((l) => ({ libelle: t(l.libelle), url: t(l.url) }));
  if (p.chiffres) doc.chiffres = p.chiffres.map((c) => ({ valeur: t(c.valeur), libelle: t(c.libelle) }));
  for (const c of ['fonctions', 'prochainesEtapes', 'pointsAttention']) if (p[c]) doc[c] = p[c].map(t).filter(Boolean);
  if (p.technologies) doc.technologies = p.technologies.map((x) => ({ nom: t(x.nom), role: t(x.role) }));
  if (p.historique) doc.historique = trierHistorique(p.historique.map((h) => ({ date: t(h.date), titre: t(h.titre), detail: t(h.detail) })));
  return doc;
};

/* Du plus récent au plus ancien, quelle que soit la saisie. Une date au
   mois seul (« 2026-09 ») passe après les jours de ce mois. */
export const trierHistorique = (h) => (Array.isArray(h) ? h.slice() : [])
  .filter((x) => x && typeof x.date === 'string')
  .sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1)));

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2026-09-09 » se lit « 9 septembre 2026 » ; « 2026-09 », « septembre 2026 ». */
export const datePartie = (valeur, { court = false } = {}) => {
  const m = String(valeur || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return '';
  const mois = (court ? MOIS_COURT : MOIS)[Number(m[2]) - 1];
  if (!mois) return '';
  return m[3] ? `${Number(m[3])} ${mois} ${m[1]}` : `${mois} ${m[1]}`;
};

/* --------------------------------------------------------------------------
   Les lignes de l'éditeur : un élément par ligne, les colonnes séparées
   par « | ». Elles rendent des listes que validerPartie relit ensuite.
   -------------------------------------------------------------------------- */
export const lignesDe = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);
export const colonnes = (ligne, n) => {
  const morceaux = String(ligne).split('|').map((x) => x.trim());
  if (morceaux.length > n) morceaux[n - 1] = morceaux.slice(n - 1).join(' | ');
  return morceaux.slice(0, n).concat(Array(Math.max(0, n - morceaux.length)).fill(''));
};
