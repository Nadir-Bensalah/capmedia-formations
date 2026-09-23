/* ==========================================================================
   CAPMEDIA CLIENT HUB · les verdicts du tableau des tests

   La couleur d'une case se décide ici, et nulle part ailleurs. Aucune
   lecture de base, aucun écran : tout arrive en paramètre, pour que la
   règle se prouve sans navigateur. Enfermée dans une vue, elle ne serait
   gardée que par des contrôles de texte, et une mutation passerait.

   Trois lectures du même tableau :

   - l'équipe et le client lisent le verdict de TOUS les testeurs d'un
     scénario (verdictScenario) ;
   - le testeur lit son propre résultat, jamais celui des autres
     (verdictTesteur) ;
   - les tests automatisés lisent le dernier verdict de la machine
     (verdictParcours).

   Un scénario n'est pas passé par six personnes : la répartition le
   confie à une (réparti) ou à deux (socle, transversal : iOS et Android).
   La règle du rouge tient donc sur un ou deux passages autant que sur
   six : « au moins deux en échec, et au moins la moitié ».

   Ce fichier n'importe rien : les tests le chargent tel quel.
   ========================================================================== */

/* Les états d'une case, dans l'ordre où la barre du haut les empile. Le
   glyphe double la couleur : un daltonien distingue un orange d'un rouge
   par son signe, pas par sa teinte. */
export const ETATS_CASE = {
  ok:      { libelle: 'Réussi',        glyphe: '✓' },
  fragile: { libelle: 'Fragile',       glyphe: '!' },
  casse:   { libelle: 'Cassé',         glyphe: '✕' },
  cours:   { libelle: 'En cours',      glyphe: '' },
  na:      { libelle: 'Sans objet',    glyphe: '–' },
  vide:    { libelle: 'À faire',       glyphe: '' },
  trou:    { libelle: 'Non affecté',   glyphe: '' },
  /* Chez le testeur. */
  ko:      { libelle: 'Échec signalé', glyphe: '✕' },
  revoir:  { libelle: 'À rejouer',     glyphe: '↻' },
  /* Chez la machine. */
  tourne:  { libelle: 'En exécution',  glyphe: '' },
  jamais:  { libelle: 'Jamais lancé',  glyphe: '' },
  aecrire: { libelle: 'À écrire',      glyphe: '' },
  suspendu:{ libelle: 'Suspendu',      glyphe: '–' },
};

const GRAVES = ['bloquant', 'critique'];
const OUVERTES = ['nouvelle', 'confirmee'];

/* Une anomalie compte pour CETTE campagne si un de ses témoins y a été
   pris, ou si l'équipe l'a posée elle-même (sans témoin). Une anomalie
   d'une campagne passée, jamais revue depuis, ne peint pas la nouvelle :
   les testeurs la retrouveront, ou pas. */
export const anomalieDeLaCampagne = (a, campagneId) => {
  if (!a) return false;
  const temoins = a.temoins || [];
  if (!temoins.length) return true;
  return temoins.some((t) => t.campagne === campagneId);
};

/* Un KO « corrigé » attend d'être rejoué : le serveur le marque, et une
   anomalie déjà corrigée suffit à le dire si la marque manque encore. */
const koCorrige = (p, anomalies) => p.resultat === 'ko'
  && (p.aRevoir === true || anomalies.some((a) => a.statut === 'corrigee'));
const koSansSuite = (p, anomalies) => p.resultat === 'ko'
  && anomalies.length > 0 && anomalies.every((a) => a.statut === 'sans-suite');

/* La gravité d'une anomalie ouverte, telle que l'équipe l'a tranchée.
   Rend 'casse', 'fragile', ou '' quand elle n'a pas encore été qualifiée
   et que c'est le nombre de témoins qui doit décider. */
const tranche = (a) => {
  if (Number(a.retours) > 0) return 'casse';          // une régression
  if (GRAVES.includes(a.gravite)) return 'casse';
  if (a.gravite === 'mineur') return 'fragile';
  if (a.statut === 'confirmee') return 'fragile';
  return '';
};

/**
 * Le verdict d'un scénario dans une campagne, pour l'équipe et le client.
 *
 * @param {number|null} attendus  passages attendus d'après l'affectation ;
 *                                null quand on filtre une plateforme (les
 *                                passages faits font alors le compte).
 * @param {Array} passages        les passages de CE scénario dans CETTE
 *                                campagne : { resultat, aRevoir }.
 * @param {Array} anomalies       les anomalies de ce scénario qui comptent
 *                                pour cette campagne.
 * @returns {{ etat: string, revoir: boolean }}
 */
export const verdictScenario = ({ attendus, passages = [], anomalies = [] }) => {
  if (attendus === 0 && !passages.length) return { etat: 'trou', revoir: false };

  const aRejouer = passages.filter((p) => koCorrige(p, anomalies));
  const neutres = passages.filter((p) => koSansSuite(p, anomalies));
  const echecs = passages.filter((p) => p.resultat === 'ko' && !aRejouer.includes(p) && !neutres.includes(p));
  /* Un KO corrigé n'est plus un échec, mais il n'est plus fait non plus :
     tant qu'on ne l'a pas rejoué, personne n'a vu la correction marcher. */
  const faits = passages.length - aRejouer.length;
  const revoir = aRejouer.length > 0;
  const ouvertes = anomalies.filter((a) => OUVERTES.includes(a.statut));

  if (echecs.length || ouvertes.length) {
    const verdicts = ouvertes.map(tranche);
    if (verdicts.includes('casse')) return { etat: 'casse', revoir };
    if (verdicts.includes('fragile')) return { etat: 'fragile', revoir };
    /* Pas encore qualifiée : le nombre décide. Deux sur deux, trois sur
       six : cassé. Un seul, ou deux sur six : fragile, parce qu'un échec
       isolé peut venir du testeur autant que de l'application. */
    if (echecs.length >= 2 && echecs.length * 2 >= faits) return { etat: 'casse', revoir };
    return { etat: 'fragile', revoir };
  }

  const cible = attendus === null || attendus === undefined ? faits : attendus;
  if (faits > 0 && faits >= cible) {
    const utiles = passages.filter((p) => !aRejouer.includes(p));
    if (utiles.every((p) => p.resultat === 'na')) return { etat: 'na', revoir };
    return { etat: 'ok', revoir };
  }
  if (faits > 0 || revoir) return { etat: 'cours', revoir };
  return { etat: 'vide', revoir };
};

/** Le résultat d'un testeur sur un de SES scénarios. */
export const verdictTesteur = (passage) => {
  if (!passage) return 'vide';
  if (passage.resultat === 'ko') return passage.aRevoir === true ? 'revoir' : 'ko';
  if (passage.resultat === 'ok') return 'ok';
  if (passage.resultat === 'na') return 'na';
  return 'vide';
};

/**
 * Le verdict d'un parcours automatisé. Une exécution en cours prime sur
 * le dernier résultat : c'est ce que l'on regarde en direct.
 */
export const verdictParcours = (p) => {
  if (!p) return 'jamais';
  if (p.enCours) return 'tourne';
  switch (p.etat) {
    case 'vert': return 'ok';
    case 'rouge': return 'casse';
    case 'instable': return 'fragile';
    case 'suspendu': return 'suspendu';
    case 'a-ecrire': return 'aecrire';
    default: return 'jamais';
  }
};

/* --------------------------------------------------------------------------
   Les tableaux : des cartes (familles) de cases
   -------------------------------------------------------------------------- */

const ORDRE_HUMAIN = ['ok', 'fragile', 'casse', 'cours', 'na', 'vide', 'trou'];
const ORDRE_TESTEUR = ['ok', 'ko', 'revoir', 'na', 'vide'];
const ORDRE_MACHINE = ['ok', 'fragile', 'casse', 'tourne', 'suspendu', 'jamais', 'aecrire'];

const compter = (cases, ordre) => {
  const n = {};
  ordre.forEach((k) => { n[k] = 0; });
  cases.forEach((c) => { n[c.etat] = (n[c.etat] || 0) + 1; });
  return n;
};

/* Les familles dans l'ordre du plan : celui où les testeurs déroulent. */
const grouper = (cases, famille, libelle) => {
  const familles = [];
  cases.forEach((c) => {
    const cle = famille(c) || 'divers';
    let f = familles.find((x) => x.cle === cle);
    if (!f) { f = { cle, libelle: libelle(cle, c), cases: [] }; familles.push(f); }
    f.cases.push(c);
  });
  return familles;
};

/**
 * Le tableau humain d'une campagne, pour l'équipe et le client.
 *
 * @param {Array}  scenarios   la bibliothèque du projet
 * @param {Object} campagne    { id, scenarios, affectation }
 * @param {Array}  passages    tous les passages de la campagne
 * @param {Array}  anomalies   toutes les anomalies du projet
 * @param {string} plateforme  '' pour toutes, sinon 'ios' | 'android' | 'web'
 * @param {Object} blocs       { cle: { libelle } }
 * @param {boolean} trous      montrer les scénarios que personne n'a reçus
 */
export const tableauHumain = ({ scenarios = [], campagne = {}, passages = [], anomalies = [], plateforme = '', blocs = {}, trous = true }) => {
  const dedans = new Set(campagne.scenarios || []);
  const affectation = campagne.affectation || {};
  const attendusDe = (ref) => Object.values(affectation).filter((refs) => (refs || []).includes(ref)).length;
  const liste = scenarios.filter((s) => dedans.has(s.ref) && s.actif !== false)
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

  let attendusTotal = 0;
  let faitsTotal = 0;
  const cases = [];
  liste.forEach((s) => {
    const ceux = passages.filter((p) => p.scenario === s.ref && (!plateforme || p.plateforme === plateforme));
    /* Filtré sur une plateforme, une anomalie ne compte que si elle y a
       été vue : un KO sur iOS ne peint pas la case Android. Celle que
       l'équipe a posée sans plateforme vaut partout. */
    const anos = anomalies.filter((a) => a.scenario === s.ref && anomalieDeLaCampagne(a, campagne.id)
      && (!plateforme || !(a.plateformes || []).length || a.plateformes.includes(plateforme)));
    const attendus = plateforme ? null : attendusDe(s.ref);
    const v = verdictScenario({ attendus, passages: ceux, anomalies: anos });
    if (v.etat === 'trou' && !trous) return;
    if (!plateforme) {
      attendusTotal += attendus;
      faitsTotal += Math.min(attendus, ceux.filter((p) => !koCorrige(p, anos)).length);
    }
    cases.push({ ref: s.ref, titre: s.titre || '', bloc: s.bloc, niveau: s.niveau, attendus, passages: ceux, anomalies: anos, ...v });
  });

  return {
    familles: grouper(cases, (c) => c.bloc, (cle, c) => (blocs[cle] || {}).libelle || (liste.find((s) => s.ref === c.ref) || {}).blocLibelle || 'Divers'),
    compte: compter(cases, ORDRE_HUMAIN),
    ordre: ORDRE_HUMAIN,
    total: cases.length,
    /* L'avancement se compte en passages, pas en cases : un socle fait
       sur iOS seulement est la moitié du travail, pas zéro ni tout. */
    attendus: attendusTotal,
    faits: faitsTotal,
  };
};

/** Le tableau d'un testeur : ses scénarios, son résultat. */
export const tableauTesteur = ({ scenarios = [], passages = new Map(), blocs = {} }) => {
  const cases = scenarios.map((s) => ({ ref: s.ref, titre: s.titre || '', bloc: s.bloc, etat: verdictTesteur(passages.get(s.ref)) }));
  const faits = cases.filter((c) => c.etat === 'ok' || c.etat === 'ko' || c.etat === 'na').length;
  return {
    familles: grouper(cases, (c) => c.bloc, (cle) => (blocs[cle] || {}).libelle || 'Divers'),
    compte: compter(cases, ORDRE_TESTEUR),
    ordre: ORDRE_TESTEUR,
    total: cases.length,
    attendus: cases.length,
    faits,
  };
};

/**
 * Le tableau de la machine. Un parcours se range dans la famille du
 * premier scénario qu'il couvre, pour que « Tâches » humain et « Tâches »
 * automatisé se lisent côte à côte ; sans scénario, dans celle de son
 * outil. Les règles métier font une carte à elles seules.
 */
export const tableauMachine = ({ parcours = [], regles = [], scenarios = [], blocs = {}, outils = {} }) => {
  const blocDe = new Map(scenarios.map((s) => [s.ref, s.bloc]));
  const cases = parcours.filter((p) => p.actif !== false)
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
    .map((p) => {
      const bloc = (p.scenarios || []).map((r) => blocDe.get(r)).find(Boolean);
      return { ref: p.ref, titre: p.titre || '', famille: bloc || `outil:${p.outil || 'autre'}`, source: p, etat: verdictParcours(p) };
    });
  regles.filter((r) => r.actif !== false).forEach((r) => {
    cases.push({ ref: r.ref, titre: r.titre || '', famille: 'regles', source: r, regle: true, etat: verdictParcours({ etat: r.etat }) });
  });
  const libelle = (cle) => {
    if (cle === 'regles') return 'Règles métier';
    if (cle.startsWith('outil:')) return `${(outils[cle.slice(6)] || {}).libelle || cle.slice(6)} hors scénario`;
    return (blocs[cle] || {}).libelle || 'Divers';
  };
  const passes = cases.filter((c) => ['ok', 'fragile', 'casse'].includes(c.etat)).length;
  return {
    familles: grouper(cases, (c) => c.famille, libelle),
    compte: compter(cases, ORDRE_MACHINE),
    ordre: ORDRE_MACHINE,
    total: cases.length,
    attendus: cases.length,
    faits: passes,
    tournent: cases.filter((c) => c.etat === 'tourne').length,
  };
};

/**
 * Le rythme d'une campagne : quel jour on est, et ce qu'il reste au pas
 * actuel. Rien quand les dates manquent ou se contredisent.
 */
export const rythme = ({ debut, fin, faits, attendus, maintenant = Date.now() }) => {
  const d = debut instanceof Date ? debut.getTime() : Number(debut);
  const f = fin instanceof Date ? fin.getTime() : Number(fin);
  if (!d || !f || f < d) return null;
  const JOUR = 86400000;
  const jours = Math.max(1, Math.round((f - d) / JOUR) + 1);
  if (maintenant < d) return { jour: 0, jours, reste: null, avant: Math.ceil((d - maintenant) / JOUR) };
  const jour = Math.min(jours, Math.floor((maintenant - d) / JOUR) + 1);
  const parJour = faits / jour;
  const reste = attendus <= faits ? 0 : (parJour > 0 ? Math.ceil((attendus - faits) / parJour) : null);
  return { jour, jours, reste, avant: 0 };
};
