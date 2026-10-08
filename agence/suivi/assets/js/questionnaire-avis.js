/* ==========================================================================
   LE QUESTIONNAIRE D'APPRÉCIATION, source unique

   Ce que le testeur se voit demander (testeur.js), ce que l'équipe lit dans
   le Cockpit et ce que le client lit dans le Hub (vues/tests.js) viennent
   tous d'ici, et de nulle part ailleurs. Une question ajoutée, retirée ou
   reformulée ici change les trois écrans à la fois : c'est la garantie que
   la restitution montre exactement ce qui a été demandé.

   Le fichier n'importe rien : il se charge aussi bien dans le navigateur
   que dans une épreuve Node (fonctions-suivi/outils/questionnaire-avis.test.mjs).

   Les clés des familles et des questions sont celles des réponses déjà
   enregistrées (« esthetique.belle », « noteTest.note ») : on ne les
   renomme jamais, sinon les réponses existantes deviennent illisibles.
   ========================================================================== */

/* Les trois moments où le testeur répond. */
export const MOMENTS_AVIS = {
  avant: { libelle: 'Avant de commencer', ordre: 1 },
  fin:   { libelle: 'En terminant le test', ordre: 2 },
  apres: { libelle: 'Après avoir tout déroulé', ordre: 3 },
};

/* Le questionnaire d'appréciation.

   Les 173 scénarios disent si l'application MARCHE. Ceci dit si elle
   PLAÎT, et c'est la seconde question qui décide du chiffre d'affaires.

   La première famille se remplit AVANT de commencer : une fois qu'on
   connaît une application, on ne retrouve plus ce regard-là. La note du
   test en disant « j'ai terminé », et tout le reste après avoir tout
   déroulé.

   Les quatre questions de prix ne sont pas de moi : c'est une méthode
   connue, et elle donne un intervalle acceptable au lieu d'un chiffre en
   l'air. Avec six réponses on n'a pas une étude de marché, mais on a une
   direction. */
export const FAMILLES_AVIS = {
  'impression': {
    libelle: 'Première impression', quand: 'avant',
    aide: "Deux minutes, avant de commencer. C'est le seul regard qu'on ne peut pas retrouver ensuite.",
    questions: [
      { cle: 'sert-a-quoi', type: 'texte', libelle: "Rien qu'en voyant le premier écran, à quoi sert cette application ?" },
      { cle: 'compris', type: 'echelle', libelle: 'En vingt secondes, avez-vous compris ce qu\'elle propose ?', bas: 'Pas du tout', haut: 'Tout de suite' },
      { cle: 'oeil', type: 'texte', libelle: "Qu'est-ce qui vous a attiré l'œil en premier ?" },
    ],
  },
  'esthetique': {
    libelle: 'L\'esthétique', quand: 'apres',
    questions: [
      { cle: 'belle', type: 'echelle', libelle: 'Belle ou pas ?', bas: 'Pas belle', haut: 'Très belle' },
      { cle: 'moderne', type: 'echelle', libelle: 'Moderne ou datée ?', bas: 'Datée', haut: 'Moderne' },
      { cle: 'couleurs', type: 'choix', libelle: 'Les couleurs', options: ['Agréables', 'Neutres', 'Fatigantes', 'Trop nombreuses'] },
      { cle: 'lisible', type: 'echelle', libelle: 'La lisibilité des textes', bas: 'Difficile', haut: 'Très lisible' },
      { cle: 'aere', type: 'echelle', libelle: "L'aération des écrans", bas: 'Étouffant', haut: 'Bien aéré' },
      { cle: 'coherent', type: 'echelle', libelle: "La cohérence d'un écran à l'autre", bas: 'Décousu', haut: 'Très cohérent' },
      { cle: 'reussi', type: 'texte', libelle: "L'écran le plus réussi, et le plus raté" },
    ],
  },
  'facilite': {
    libelle: 'La facilité', quand: 'apres',
    questions: [
      { cle: 'trouve', type: 'echelle', libelle: 'Trouve-t-on ce qu\'on cherche ?', bas: 'Jamais', haut: 'Toujours' },
      { cle: 'vocabulaire', type: 'echelle', libelle: 'Le vocabulaire est-il clair ?', bas: 'Obscur', haut: 'Très clair' },
      { cle: 'bloque', type: 'choix', libelle: 'Combien de fois avez-vous été bloqué sans savoir quoi faire ?', options: ['Jamais', 'Une ou deux fois', 'Plusieurs fois', 'Tout le temps'] },
      { cle: 'erreurs', type: 'echelle', libelle: 'Les messages d\'erreur vous ont-ils aidé ?', bas: 'Pas du tout', haut: 'Beaucoup' },
      { cle: 'recommande', type: 'note10', libelle: 'Recommanderiez-vous cette application ?', aide: 'De 0 à 10.' },
    ],
  },
  'utilite': {
    libelle: "L'utilité", quand: 'apres',
    questions: [
      { cle: 'probleme', type: 'echelle', libelle: 'Est-ce que ça résout un vrai problème ?', bas: 'Aucun', haut: 'Un vrai' },
      { cle: 'vraie-vie', type: 'choix', libelle: "L'utiliseriez-vous dans votre vraie vie ?", options: ['Oui, tous les jours', 'Oui, de temps en temps', 'Non', 'Je ne sais pas'] },
      { cle: 'plus-utile', type: 'texte', libelle: 'La fonction la plus utile' },
      { cle: 'inutile', type: 'texte', libelle: 'Celle qui ne sert à rien' },
      { cle: 'manque', type: 'texte', libelle: 'Ce qui manque' },
    ],
  },
  'argent': {
    libelle: "L'argent", quand: 'apres',
    aide: "La famille la plus importante. Les quatre derniers montants donnent une fourchette, pas un chiffre isolé.",
    questions: [
      { cle: 'paierait', type: 'choix', libelle: 'Paieriez-vous pour cette application ?', options: ['Oui', 'Peut-être', 'Non'] },
      { cle: 'spontane', type: 'euros', libelle: 'Combien par mois, spontanément ?' },
      { cle: 'trop-cher', type: 'euros', libelle: 'À quel prix est-ce trop cher ?' },
      { cle: 'cher', type: 'euros', libelle: 'À quel prix est-ce cher, mais vous réfléchissez ?' },
      { cle: 'bonne-affaire', type: 'euros', libelle: 'À quel prix est-ce une bonne affaire ?' },
      { cle: 'suspect', type: 'euros', libelle: 'À quel prix est-ce si peu cher que vous vous méfiez de la qualité ?' },
      { cle: 'gratuit', type: 'choix', libelle: "L'offre gratuite", options: ['Suffit largement', 'Convient', 'Pousse trop vite à payer'] },
    ],
  },
  'performance': {
    libelle: 'La performance ressentie', quand: 'apres',
    questions: [
      { cle: 'rapide', type: 'echelle', libelle: 'Rapide ou lente ?', bas: 'Très lente', haut: 'Très rapide' },
      { cle: 'attentes', type: 'choix', libelle: 'Des attentes sans savoir ce qui se passe ?', options: ['Jamais', 'Parfois', 'Souvent'] },
      { cle: 'plantages', type: 'choix', libelle: 'Des plantages ?', options: ['Aucun', 'Un ou deux', 'Plusieurs'] },
      { cle: 'comparee', type: 'echelle', libelle: 'Comparée aux applications que vous utilisez tous les jours', bas: 'Bien moins bien', haut: 'Bien mieux' },
    ],
  },
  'libre': {
    libelle: 'Le libre', quand: 'apres', sujet: 'des questions ouvertes',
    aide: "C'est ici qu'est la vraie information. Elle est restituée mot pour mot, jamais résumée.",
    questions: [
      { cle: 'garder', type: 'texte', libelle: 'Les trois choses à garder absolument' },
      { cle: 'changer', type: 'texte', libelle: 'Les trois à changer en premier' },
      { cle: 'une-phrase', type: 'texte', libelle: 'Résumez l\'application en une phrase, comme à un ami' },
      { cle: 'agace', type: 'texte', libelle: "Qu'est-ce qui vous a agacé, même un détail ?" },
    ],
  },
  /* La note du TEST lui-même (clair, faisable), pas de l'application :
     demandée en disant « j'ai terminé ». Elle dit ce qui a gêné le testeur
     dans la campagne, donc elle ne regarde que l'équipe (« equipe ») : elle
     vit à part, dans appreciations/{uid}/equipe/retour (« noteTest », une
     map, d'où « champ »), que le client ne peut pas lire. */
  'test': {
    libelle: 'Le test lui-même', quand: 'fin', champ: 'noteTest', equipe: true,
    questions: [
      { cle: 'note', type: 'echelle', libelle: 'Ce test était-il clair et faisable ?', bas: 'Confus, pénible', haut: 'Limpide, agréable', equipe: true },
      { cle: 'commentaire', type: 'texte', libelle: 'Ce qui aurait rendu ce test plus facile', facultatif: true, equipe: true },
    ],
  },
};

/* --------------------------------------------------------------------------
   Lire une réponse
   -------------------------------------------------------------------------- */

/* Les familles d'un moment, dans l'ordre du questionnaire. */
export const famillesDu = (quand) => Object.entries(FAMILLES_AVIS).filter(([, f]) => f.quand === quand);

/* Toutes les questions, à plat : { id, famille, f, q }. L'identifiant est
   celui de la restitution (« esthetique.belle », « test.note »). */
export const questionsAvis = (quand) => Object.entries(FAMILLES_AVIS)
  .filter(([, f]) => !quand || f.quand === quand)
  .flatMap(([famille, f]) => f.questions.map((q) => ({ id: `${famille}.${q.cle}`, famille, f, q })));

const vide = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/* La réponse d'une appréciation à une question, ou undefined. Une réponse
   vide n'en est pas une : un champ effacé ne compte ni comme « répondu »
   ni comme un zéro dans une moyenne. */
export const lireReponse = (a, id) => {
  if (!a) return undefined;
  const [famille, cle] = String(id).split(/\.(.*)/s);
  const f = FAMILLES_AVIS[famille];
  const v = f && f.champ ? ((a[f.champ] && typeof a[f.champ] === 'object') ? a[f.champ][cle] : undefined) : a[id];
  return vide(v) ? undefined : v;
};

/* A-t-il répondu à ce moment-là (au moins une question) ? Sans moment :
   à l'un des trois. C'est la même mesure pour le testeur (« donnée,
   merci »), pour le rail et pour la restitution (« N ont répondu »). */
export const aRepondu = (a, quand) => questionsAvis(quand).some(({ id }) => lireReponse(a, id) !== undefined);

/* Les appréciations qui portent au moins une réponse. Une appréciation
   peut n'être qu'une trace de premiers pas (« accueil ») ou d'une fin de
   test sans réponse : elle ne compte pas parmi « ceux qui ont répondu ». */
export const avisRepondus = (liste) => (liste || []).filter((a) => aRepondu(a));

/* --------------------------------------------------------------------------
   Le dire en clair
   -------------------------------------------------------------------------- */

const enMinuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const enumerer = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : (l[0] || ''));

/* Les chiffres du questionnaire, comptés dans la source : ce qui est écrit
   au testeur et ce qui est écrit au client ne peuvent plus diverger. Le
   client ne compte pas ce qui est réservé à l'équipe (« pourClient »). */
export const resumeQuestionnaire = ({ pourClient = false } = {}) => {
  const n = (quand) => questionsAvis(quand).length;
  return {
    total: questionsAvis().filter(({ q }) => !(pourClient && q.equipe)).length,
    familles: Object.values(FAMILLES_AVIS).filter((f) => !(pourClient && f.equipe)).length,
    avant: n('avant'), fin: n('fin'), apres: n('apres'),
    /* « l'esthétique, la facilité, … et le libre » */
    sujetsApres: enumerer(famillesDu('apres').map(([, f]) => f.sujet || enMinuscule(f.libelle))),
  };
};

/* --------------------------------------------------------------------------
   Les remarques libres

   projets/{p}/campagnes/{c}/remarques/{id} = { testeur, texte, scenario,
   plateforme, cree }. Le testeur en écrit quand il veut, sur un scénario
   ou en général ; l'équipe les lit toutes avec le nom, le client les lit
   sous « Testeur N ». Les règles tiennent les mêmes bornes.
   -------------------------------------------------------------------------- */

export const REMARQUE_MAX = 2000;

/* Ce qui part dans la base, ou une erreur dite en clair. */
export const remarqueAEnvoyer = ({ texte, scenario, plateforme } = {}) => {
  const t = String(texte || '').trim();
  if (!t) return { erreur: 'Écrivez votre remarque d\'abord.' };
  if (t.length > REMARQUE_MAX) return { erreur: `Une remarque tient en ${REMARQUE_MAX.toLocaleString('fr-FR')} caractères.` };
  const r = { texte: t };
  if (scenario) r.scenario = String(scenario).slice(0, 80);
  if (['ios', 'android', 'web'].includes(plateforme)) r.plateforme = plateforme;
  return { remarque: r };
};

/* --------------------------------------------------------------------------
   L'avis anonyme (08/10/2026)

   Les réponses ne s'écrivent plus dans l'appréciation du testeur : il les
   envoie au serveur (fonction hubAvisTesteur), qui les range dans
   projets/{p}/campagnes/{c}/avisAnonymes/{moment}/reponses/{id}, un
   document sans identifiant de testeur ni date, et pose seulement
   « avisRendus.{moment} : true » sur son appréciation. L'équipe sait qui a
   répondu, jamais quoi ; personne ne lit les réponses d'un moment tant
   qu'il y en a moins de SEUIL_AVIS (les règles le tiennent). Une fois
   envoyé, un avis ne se relit ni ne se modifie, même par son auteur : il
   n'y a plus rien qui le relie à lui.

   Ce fichier est recopié tel quel dans fonctions-suivi/questionnaire-avis.mjs :
   le serveur valide avec la même liste que l'écran (épreuve
   questionnaire-avis.test.mjs, copie conforme octet pour octet).
   -------------------------------------------------------------------------- */

export const SEUIL_AVIS = 3;

/* Les moments que le testeur envoie lui-même (la note du test reste à
   part, nominative, pour l'équipe). */
export const MOMENTS_ENVOYES = ['avant', 'apres'];

/* Une question fermée (une note, un choix) est requise ; un texte libre et
   un montant restent facultatifs : on ne force pas quelqu'un à inventer un
   prix ou une phrase. */
export const estRequise = (q) => ['echelle', 'note10', 'choix'].includes(q.type) && !q.facultatif;
export const questionsRequises = (quand) => questionsAvis(quand).filter(({ q, f }) => !f.equipe && estRequise(q));

export const TEXTE_AVIS_MAX = 2000;

/* La réponse à une question, rendue propre, ou undefined si elle ne vaut
   rien (vide, hors bornes, option inconnue). */
const normaliser = (q, v) => {
  if (v === undefined || v === null) return undefined;
  if (q.type === 'echelle' || q.type === 'note10') {
    const n = Number(v);
    const max = q.type === 'echelle' ? 5 : 10;
    const min = q.type === 'echelle' ? 1 : 0;
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  }
  if (q.type === 'choix') return (q.options || []).includes(v) ? v : undefined;
  if (q.type === 'euros') {
    if (typeof v === 'string' && v.trim() === '') return undefined;
    const n = Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
    return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : undefined;
  }
  const t = String(v).trim();
  return t ? t.slice(0, TEXTE_AVIS_MAX) : undefined;
};

/**
 * Ce qui part au serveur pour un moment : { reponses } (clés
 * « famille.question », valeurs propres), ou { erreur, manquantes }. Le
 * serveur rappelle la même fonction : une clé inconnue ou une valeur
 * hors bornes est refusée, jamais devinée.
 */
export const validerAvis = (quand, brutes) => {
  if (!MOMENTS_ENVOYES.includes(quand)) return { erreur: 'Moment inconnu.' };
  if (!brutes || typeof brutes !== 'object' || Array.isArray(brutes)) return { erreur: 'Réponses illisibles.' };
  const questions = questionsAvis(quand).filter(({ f }) => !f.equipe);
  const connues = new Map(questions.map((x) => [x.id, x.q]));
  const inconnue = Object.keys(brutes).find((k) => !connues.has(k));
  if (inconnue) return { erreur: `Question inconnue : ${inconnue}.` };
  const reponses = {};
  for (const [id, q] of connues) {
    const brute = brutes[id];
    const v = normaliser(q, brute);
    if (v === undefined && brute !== undefined && brute !== null && String(brute).trim() !== '') return { erreur: `Réponse hors bornes : ${id}.` };
    if (v !== undefined) reponses[id] = v;
  }
  const manquantes = questionsRequises(quand).filter(({ id }) => reponses[id] === undefined).map(({ id }) => id);
  if (manquantes.length) return { erreur: manquantes.length > 1 ? `Il manque ${manquantes.length} réponses.` : 'Il manque une réponse.', manquantes };
  return { reponses };
};

/* A-t-il rendu son avis anonyme pour ce moment ? Le serveur seul le pose. */
export const avisRendu = (a, quand) => Boolean(a && a.avisRendus && a.avisRendus[quand] === true);
