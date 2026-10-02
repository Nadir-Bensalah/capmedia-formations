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
  /* Un test qui échoue exprès sur un défaut déjà connu de l'équipe : il
     passera au vert quand le défaut sera corrigé. Rouge, mais pas une
     surprise : il ne se confond pas avec un cassé. */
  connu:   { libelle: 'Défaut connu',  glyphe: '•' },
  suspendu:{ libelle: 'Suspendu',      glyphe: '–' },
  /* Un scénario du plan qu'aucun testeur humain n'a encore rendu. */
  nonteste:{ libelle: 'Pas encore testé', glyphe: '' },
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
    case 'rouge': return p.defautConnu === true || (p.dernier && p.dernier.defautConnu === true) ? 'connu' : 'casse';
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
const ORDRE_MACHINE = ['ok', 'fragile', 'casse', 'connu', 'tourne', 'suspendu', 'jamais', 'aecrire'];

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
    cases.push({ ref: r.ref, titre: r.titre || '', famille: 'regles', source: r, regle: true, etat: verdictParcours({ etat: r.etat, defautConnu: r.defautConnu, dernier: r.dernier }) });
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

/* --------------------------------------------------------------------------
   Le tableau des robots rangé par le plan de tests

   Quand un projet a un plan (« ce qui va être testé »), les cartes des
   robots sont ses sections, et chaque case un scénario que fait un robot :
   robot seul, ou humain et robot. Un scénario fait par un humain seul n'a
   pas de case ici. La couleur vient des tests robot rattachés au scénario
   (son champ « parcours ») : le dernier résultat de chacun, et le plus
   mauvais l'emporte. Sans test rattaché : à écrire.

   Rien ne se perd : un test robot rattaché à aucun scénario du plan reste
   visible, dans une carte « Hors plan », sans compter dans l'avancement.
   -------------------------------------------------------------------------- */

/* Du plus mauvais au meilleur. Un défaut qu'on découvre passe devant un
   test instable, qui passe devant un défaut déjà connu. Un test jamais
   lancé ne prouve rien : il passe devant un test à écrire, qui passe
   devant un vert. */
const RANG_PIRE = ['casse', 'fragile', 'connu', 'tourne', 'jamais', 'aecrire', 'suspendu', 'ok'];
const rangPire = (e) => { const i = RANG_PIRE.indexOf(e); return i < 0 ? RANG_PIRE.indexOf('jamais') : i; };

/** Le plus mauvais de plusieurs états de case ('aecrire' si aucun). */
export const pireEtat = (etats = []) => (etats.length
  ? etats.reduce((pire, e) => (rangPire(e) < rangPire(pire) ? e : pire))
  : 'aecrire');

/* Sans plateforme déclarée, un test vaut partout. */
const surLaPlateforme = (x, plateforme) => !plateforme || !(x.plateformes || []).length || x.plateformes.includes(plateforme);

export const QUI_ROBOT = ['robot', 'les-deux'];
const ASPECTS_DU_PLAN = ['fonctionnel', 'technique', 'ux', 'securite'];

/**
 * Le verdict d'un scénario du plan, d'après ses tests robot rattachés.
 * Sur une plateforme : les tests qui y tournent, le pire l'emporte, et
 * aucun test sur cette plateforme, c'est « à écrire ». Toutes plateformes :
 * le pire des plateformes du scénario.
 *
 * @param {Object} scenario    { plateformes }
 * @param {Array}  rattaches   les parcours rattachés (déjà trouvés, actifs)
 * @param {string} plateforme  '' pour toutes
 * @returns {{ etat: string, parPlateforme: Array<{ plateforme, etat, parcours }> }}
 */
export const verdictScenarioPlan = ({ scenario = {}, rattaches = [], plateforme = '' }) => {
  const sur = (p) => rattaches.filter((x) => surLaPlateforme(x, p));
  const verdictSur = (p) => { const ici = sur(p); return ici.length ? pireEtat(ici.map(verdictParcours)) : 'aecrire'; };
  const plateformes = (scenario.plateformes || []).filter(Boolean);
  const parPlateforme = plateformes.map((p) => ({ plateforme: p, etat: verdictSur(p), parcours: sur(p).map((x) => x.ref) }));
  if (!rattaches.length) return { etat: 'aecrire', parPlateforme };
  if (plateforme) return { etat: verdictSur(plateforme), parPlateforme };
  return { etat: plateformes.length ? pireEtat(parPlateforme.map((x) => x.etat)) : pireEtat(rattaches.map(verdictParcours)), parPlateforme };
};

/**
 * Le tableau des robots d'un projet qui a un plan.
 *
 * @param {Array}  sections    les sections du plan, déjà dans l'ordre de la
 *                             page « Ce qui va être testé »
 * @param {Array}  parcours    les parcours du projet (toutes plateformes)
 * @param {Array}  regles      les règles métier du projet
 * @param {string} plateforme  '' pour toutes
 */
export const tableauPlan = ({ sections = [], parcours = [], regles = [], plateforme = '' }) => {
  const actifs = parcours.filter((p) => p.actif !== false)
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const parRef = new Map(actifs.map((p) => [p.ref, p]));
  /* Les tests rattachés à un scénario que fait un robot, toutes
     plateformes confondues : ceux-là ont leur place dans le plan. */
  const dansLePlan = new Set();
  const familles = sections.map((s) => {
    const cases = [];
    ASPECTS_DU_PLAN.forEach((aspect) => ((s.aspects || {})[aspect] || []).forEach((sc) => {
      if (!sc || !QUI_ROBOT.includes(sc.qui)) return;
      const refs = (Array.isArray(sc.parcours) ? sc.parcours : []).filter((r) => typeof r === 'string' && r);
      refs.forEach((r) => dansLePlan.add(r));
      if (!surLaPlateforme(sc, plateforme)) return;
      const rattaches = refs.map((r) => parRef.get(r)).filter(Boolean);
      const v = verdictScenarioPlan({ scenario: sc, rattaches, plateforme });
      cases.push({
        ref: sc.id || '', cle: `plan:${sc.id || ''}`, titre: sc.titre || '', qui: sc.qui, aspect, section: s.id,
        scenario: sc, rattaches, inconnus: refs.filter((r) => !parRef.has(r)), ...v,
      });
    }));
    return { cle: `section:${s.id}`, libelle: s.titre || s.id || 'Section', groupe: s.groupe || '', section: s, cases };
  });

  const regle = regles.filter((r) => r.actif !== false)
    .map((r) => ({ ref: r.ref, titre: r.titre || '', source: r, regle: true, etat: verdictParcours({ etat: r.etat, defautConnu: r.defautConnu, dernier: r.dernier }) }));
  const hors = actifs.filter((p) => !dansLePlan.has(p.ref) && surLaPlateforme(p, plateforme))
    .map((p) => ({ ref: p.ref, titre: p.titre || '', source: p, etat: verdictParcours(p) }));
  if (regle.length) familles.push({ cle: 'regles', libelle: 'Règles métier', groupe: 'autres', cases: regle });
  if (hors.length) familles.push({ cle: 'hors-plan', libelle: 'Hors plan', groupe: 'autres', horsPlan: true, cases: hors });

  /* Ce qui compte dans l'avancement : les scénarios du plan et les règles.
     Les tests hors plan se montrent, ils ne se comptent pas. */
  const casesPlan = familles.filter((f) => f.section).flatMap((f) => f.cases);
  const comptees = [...casesPlan, ...regle];
  return {
    familles,
    compte: compter(comptees, ORDRE_MACHINE),
    ordre: ORDRE_MACHINE,
    total: comptees.length,
    attendus: comptees.length,
    faits: comptees.filter((c) => ['ok', 'fragile', 'casse'].includes(c.etat)).length,
    tournent: actifs.filter((p) => p.enCours && surLaPlateforme(p, plateforme)).length,
    scenarios: casesPlan.length,
    regles: regle.length,
    horsPlan: hors.length,
    qui: { robot: casesPlan.filter((c) => c.qui === 'robot').length, 'les-deux': casesPlan.filter((c) => c.qui === 'les-deux').length },
    plan: true,
  };
};

/* --------------------------------------------------------------------------
   Le tableau des humains rangé par le plan de tests

   Le pendant de tableauPlan pour les testeurs humains. Les cartes sont les
   sections du plan, et chaque case un scénario que fait un humain : humain
   seul, ou humain et robot. Un scénario fait par un robot seul n'a pas de
   case ici.

   La couleur vient de ce que les testeurs ont rendu dans la campagne, par
   deux chemins :
   - aujourd'hui, ils testent les scénarios de la bibliothèque (TA-01…) :
     un scénario du plan hérite des résultats de ceux que cite son champ
     « refs » ;
   - demain, la répartition leur enverra les scénarios du plan eux-mêmes :
     un passage dont la référence est l'identifiant du scénario du plan
     (taches-f-001) compte aussi.
   Chaque origine est jugée comme dans la grille d'avant (verdictScenario :
   passages, KO corrigés à rejouer, anomalies qualifiées), plateforme par
   plateforme, et le pire l'emporte. Sans résultat : pas encore testé.

   Rien ne se perd : un scénario de la bibliothèque testé par des humains
   mais cité par aucun scénario humain du plan reste visible, dans une carte
   « Hors plan », sans compter dans l'avancement.
   -------------------------------------------------------------------------- */

export const QUI_HUMAIN = ['humain', 'les-deux'];
const ORDRE_HUMAIN_PLAN = ['ok', 'fragile', 'casse', 'cours', 'na', 'nonteste'];
/* Du plus mauvais au meilleur. Un KO corrigé qui attend d'être rejoué
   (en cours) passe devant un réussi ; un réussi devant un sans objet. */
const RANG_HUMAIN = ['casse', 'fragile', 'cours', 'ok', 'na', 'nonteste'];
const rangHumain = (e) => { const i = RANG_HUMAIN.indexOf(e); return i < 0 ? RANG_HUMAIN.indexOf('cours') : i; };

/** Le plus mauvais de plusieurs résultats humains ('nonteste' si aucun). */
export const pireHumain = (etats = []) => (etats.length
  ? etats.reduce((pire, e) => (rangHumain(e) < rangHumain(pire) ? e : pire))
  : 'nonteste');

/* Ce qui compte comme une vérification faite : un verdict rendu, pas un
   scénario commencé sur une partie de ses plateformes. */
const TRANCHES = ['ok', 'fragile', 'casse', 'na'];

/* Une anomalie vue sur une plateforme ; posée sans plateforme, partout. */
const anomalieSur = (a, plateforme) => !plateforme || !(a.plateformes || []).length || a.plateformes.includes(plateforme);

/**
 * Le verdict humain d'un scénario du plan.
 *
 * @param {Object} scenario    { id, plateformes, refs }
 * @param {Array}  passages    les passages de la campagne (toutes origines)
 * @param {Array}  anomalies   les anomalies qui comptent pour la campagne
 * @param {string} plateforme  '' pour toutes
 * @returns {{ etat, revoir, sources, origines, parPlateforme, passages, anomalies, partiel, manquent }}
 *   sources : les références lues (refs, puis l'identifiant du plan) ;
 *   origines : celles qui ont rendu quelque chose, et leur verdict ;
 *   parPlateforme : [{ plateforme, etat, revoir, origines: [{ cle, etat }] }] ;
 *   passages : ceux qui comptent, chacun marqué de son origine (« origine ») ;
 *   partiel, manquent : les plateformes du scénario qu'aucun humain n'a
 *   encore passées.
 */
export const verdictHumainPlan = ({ scenario = {}, passages = [], anomalies = [], plateforme = '' }) => {
  const refs = (Array.isArray(scenario.refs) ? scenario.refs : []).filter((r) => typeof r === 'string' && r);
  const sources = Array.from(new Set([...refs, ...(scenario.id ? [scenario.id] : [])]));
  const dedans = new Set(sources);
  const siens = passages.filter((p) => dedans.has(p.scenario)).map((p) => ({ ...p, origine: p.scenario }));
  const anos = anomalies.filter((a) => dedans.has(a.scenario));

  /* Une origine jugée comme dans la grille d'avant, sur une plateforme ou
     sur toutes ('*') : « vide », rien de rendu. */
  const jugerOrigine = (cle, p) => {
    const v = verdictScenario({
      attendus: null,
      passages: siens.filter((x) => x.origine === cle && (p === '*' || (x.plateforme || '') === p)),
      anomalies: anos.filter((a) => a.scenario === cle && (p === '*' || anomalieSur(a, p))),
    });
    /* Un KO corrigé n'est plus fait tant qu'on ne l'a pas rejoué : sans
       nombre attendu, c'est à nous de le dire (la grille d'avant le
       comptait dans l'affectation). */
    const etat = v.revoir && (v.etat === 'ok' || v.etat === 'na') ? 'cours' : v.etat;
    return { cle, etat, revoir: v.revoir };
  };
  const juger = (p) => {
    const origines = sources.map((cle) => jugerOrigine(cle, p)).filter((o) => o.etat !== 'vide' && o.etat !== 'trou');
    return {
      plateforme: p === '*' ? '' : p,
      etat: origines.length ? pireHumain(origines.map((o) => o.etat)) : 'nonteste',
      revoir: origines.some((o) => o.revoir),
      origines: origines.map(({ cle, etat }) => ({ cle, etat })),
    };
  };

  const declarees = (scenario.plateformes || []).filter(Boolean);
  if (plateforme) {
    const ici = juger(plateforme);
    return {
      etat: ici.etat, revoir: ici.revoir, sources, origines: ici.origines, parPlateforme: [ici], partiel: false, manquent: [],
      passages: siens.filter((x) => x.plateforme === plateforme),
      anomalies: anos.filter((a) => anomalieSur(a, plateforme)),
    };
  }
  /* Toutes plateformes : chaque origine est jugée sur tous ses passages,
     comme dans la grille d'avant (deux KO, un sur iOS et un sur Android,
     font un cassé), et le pire l'emporte. Le détail par plateforme sert à
     la fiche : celles du scénario, et celles où un testeur l'a passé quand
     même (un résultat ne se perd pas). */
  const tout = juger('*');
  const vues = Array.from(new Set(siens.map((x) => x.plateforme || '')));
  const toutes = [...declarees, ...vues.filter((p) => !declarees.includes(p))];
  const parPlateforme = toutes.map(juger).filter((x) => x.plateforme || x.etat !== 'nonteste');
  /* Réussi sur iOS, personne encore sur Android : en cours, pas réussi. Un
     échec, lui, se dit tout de suite. */
  const manquent = declarees.filter((p) => !siens.some((x) => x.plateforme === p));
  const partiel = siens.length > 0 && manquent.length > 0;
  const etat = partiel && (tout.etat === 'ok' || tout.etat === 'na') ? 'cours' : tout.etat;
  return { etat, revoir: tout.revoir, sources, origines: tout.origines, partiel, manquent, parPlateforme, passages: siens, anomalies: anos };
};

/**
 * Le tableau des humains d'un projet qui a un plan.
 *
 * @param {Array}  sections    les sections du plan, dans l'ordre de la page
 * @param {Array}  scenarios   la bibliothèque du projet (titres du hors plan)
 * @param {Object} campagne    { id, scenarios, affectation } ; null : aucune
 * @param {Array}  passages    tous les passages de la campagne
 * @param {Array}  anomalies   toutes les anomalies du projet
 * @param {string} plateforme  '' pour toutes
 */
export const tableauHumainPlan = ({ sections = [], scenarios = [], campagne = null, passages = [], anomalies = [], plateforme = '' }) => {
  const camp = campagne || {};
  const anosCampagne = campagne ? anomalies.filter((a) => anomalieDeLaCampagne(a, camp.id)) : [];
  const lesPassages = campagne ? passages : [];
  /* Les références qu'un scénario humain du plan reprend, toutes
     plateformes confondues : celles-là ont leur place dans le plan. */
  const reprises = new Set();
  const familles = sections.map((s) => {
    const cases = [];
    ASPECTS_DU_PLAN.forEach((aspect) => ((s.aspects || {})[aspect] || []).forEach((sc) => {
      if (!sc || !QUI_HUMAIN.includes(sc.qui)) return;
      (Array.isArray(sc.refs) ? sc.refs : []).forEach((r) => reprises.add(r));
      if (sc.id) reprises.add(sc.id);
      if (!surLaPlateforme(sc, plateforme)) return;
      const v = verdictHumainPlan({ scenario: sc, passages: lesPassages, anomalies: anosCampagne, plateforme });
      cases.push({ ref: sc.id || '', cle: `plan:${sc.id || ''}`, titre: sc.titre || '', qui: sc.qui, aspect, section: s.id, scenario: sc, ...v });
    }));
    return { cle: `section:${s.id}`, libelle: s.titre || s.id || 'Section', groupe: s.groupe || '', section: s, cases };
  });

  /* Hors plan : ce que des humains ont testé et que rien ne reprend. Lu
     comme dans la grille d'avant (affectation comprise), pour garder ses
     couleurs. */
  const hors = [];
  if (campagne) {
    const ici = (p) => !plateforme || p.plateforme === plateforme;
    const attendusDe = (ref) => Object.values(camp.affectation || {}).filter((refs) => (refs || []).includes(ref)).length;
    const dansCampagne = new Set(camp.scenarios || []);
    const parRef = new Map(scenarios.map((s) => [s.ref, s]));
    const cles = Array.from(new Set(lesPassages.filter(ici).map((p) => p.scenario).filter((r) => r && !reprises.has(r))));
    const rang = (r) => { const s = parRef.get(r); return s ? (Number(s.ordre) || 0) : Number.MAX_SAFE_INTEGER; };
    cles.sort((a, b) => rang(a) - rang(b) || String(a).localeCompare(String(b)));
    cles.forEach((ref) => {
      const s = parRef.get(ref) || {};
      const ceux = lesPassages.filter((p) => p.scenario === ref && ici(p));
      const anos = anosCampagne.filter((a) => a.scenario === ref && anomalieSur(a, plateforme));
      const attendus = plateforme || !dansCampagne.has(ref) ? null : attendusDe(ref);
      const v = verdictScenario({ attendus, passages: ceux, anomalies: anos });
      hors.push({ ref, titre: s.titre || '', bloc: s.bloc, niveau: s.niveau, attendus, passages: ceux, anomalies: anos, horsPlan: true, ...v });
    });
  }
  if (hors.length) familles.push({ cle: 'hors-plan', libelle: 'Hors plan', groupe: 'autres', horsPlan: true, cases: hors });

  /* Ce qui compte dans l'avancement : les scénarios humains du plan. */
  const casesPlan = familles.filter((f) => f.section).flatMap((f) => f.cases);
  return {
    familles,
    compte: compter(casesPlan, ORDRE_HUMAIN_PLAN),
    ordre: ORDRE_HUMAIN_PLAN,
    total: casesPlan.length,
    attendus: casesPlan.length,
    faits: casesPlan.filter((c) => TRANCHES.includes(c.etat)).length,
    commences: casesPlan.filter((c) => c.etat !== 'nonteste').length,
    scenarios: casesPlan.length,
    horsPlan: hors.length,
    qui: { humain: casesPlan.filter((c) => c.qui === 'humain').length, 'les-deux': casesPlan.filter((c) => c.qui === 'les-deux').length },
    plan: true,
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
