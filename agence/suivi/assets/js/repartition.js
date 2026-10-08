/* ==========================================================================
   CAPMEDIA TEST · la répartition des passages entre testeurs

   Qui passe quoi, sur quelle plateforme. La règle, validée par Nadir :
   - la source est le plan de tests (projets/{p}/planTests), seulement les
     scénarios dont « qui » vaut « humain » ou « les-deux » ;
   - un passage est un couple (scénario, plateforme), sa clé est
     « scenarioId__plateforme » ;
   - un passage « humain » seul part chez DEUX testeurs différents (aucun
     robot ne le rejoue), un passage « les-deux » chez UN seul ;
   - chacun ne fait que son téléphone et le web : la plateforme est imposée
     par l'affectation, jamais choisie par le testeur ;
   - la charge est équilibrée, d'abord dans la vague 1 (priorité haute),
     puis sur l'ensemble (vague 2, le reste) ;
   - aucune clé oubliée, aucune en trop : ce qui ne trouve personne est
     rendu dans « manques », jamais perdu en silence.

   L'affectation produite, une entrée par testeur :
     { telephone: 'ios'|'android', web: true|false, cles: [...], vague: 1|2 }
   « cles » est rangé vague 1 d'abord, puis dans l'ordre du plan. « vague »
   dit par où le testeur commence : 1 s'il a au moins un passage de
   priorité haute, 2 sinon.

   Ce module ne dépend que des verdicts (verdicts.js, pur lui aussi) : la
   page (vues/tests.js) et l'épreuve (fonctions-suivi/outils/
   repartition.test.mjs) importent le même code.

   Depuis le 08/10/2026, une campagne se répartit selon la règle du socle
   (repartirSocle, plus bas), décidée par Nadir pour six vrais testeurs.
   La règle d'avant (repartir) reste pour relire les campagnes d'avant.
   ========================================================================== */

import { verdictScenarioPlan } from './verdicts.js';

export const QUI_HUMAIN = ['humain', 'les-deux'];
export const TELEPHONES = ['ios', 'android'];
const PLATEFORMES = ['ios', 'android', 'web'];
const ASPECTS = ['fonctionnel', 'technique', 'ux', 'securite'];

/* Combien de testeurs pour un passage. */
export const TESTEURS_PAR_PASSAGE = { humain: 2, 'les-deux': 1 };

export const cleAffectation = (scenarioId, plateforme) => `${scenarioId}__${plateforme}`;
export const vagueDe = (scenario) => ((scenario && scenario.priorite) === 'haute' ? 1 : 2);

/* Les scénarios humains d'un plan, dans l'ordre des sections reçues (la
   page les range comme « Ce qui va être testé »), puis des aspects. Un
   identifiant vu deux fois ne compte qu'une fois. */
export const scenariosHumains = (sections) => {
  const vus = new Set();
  const sortie = [];
  (sections || []).forEach((s) => {
    const aspects = (s && s.aspects) || {};
    [...ASPECTS, ...Object.keys(aspects).filter((a) => !ASPECTS.includes(a))].forEach((a) => {
      (Array.isArray(aspects[a]) ? aspects[a] : []).forEach((sc) => {
        if (!sc || typeof sc.id !== 'string' || !sc.id || !QUI_HUMAIN.includes(sc.qui) || vus.has(sc.id)) return;
        vus.add(sc.id);
        sortie.push({ ...sc, section: s.id || '' });
      });
    });
  });
  return sortie;
};

/* Les passages attendus : un par couple (scénario, plateforme déclarée),
   avec le nombre de testeurs voulu et la vague. Rangés dans l'ordre du
   plan, plateformes dans l'ordre iPhone, Android, web. */
export const passagesAttendus = (scenarios) => {
  const vus = new Set();
  const sortie = [];
  (scenarios || []).forEach((s, rang) => {
    if (!s || !QUI_HUMAIN.includes(s.qui)) return;
    const siennes = new Set((Array.isArray(s.plateformes) ? s.plateformes : []));
    PLATEFORMES.filter((p) => siennes.has(p)).forEach((p) => {
      const cle = cleAffectation(s.id, p);
      if (vus.has(cle)) return;
      vus.add(cle);
      sortie.push({ cle, scenario: s.id, plateforme: p, voulu: TESTEURS_PAR_PASSAGE[s.qui], vague: vagueDe(s), rang });
    });
  });
  return sortie;
};

/* Un testeur peut-il passer cette plateforme ? Son téléphone, ou le web
   s'il le fait. */
const peut = (t, plateforme) => (plateforme === 'web' ? t.web : t.telephone === plateforme);

/**
 * @param {Array}  scenarios  scénarios du plan (scenariosHumains)
 * @param {Array}  testeurs   [{ id, mobile: 'ios'|'android', web? }] ; sans
 *                            téléphone reconnu, le testeur est écarté
 * @param {Object} garder     { uid: [cle, ...] } : passages déjà consignés,
 *                            qui restent chez leur auteur
 * @returns {{ affectation, manques, ecartes, attendus }}
 */
export const repartir = (scenarios, testeurs, { garder = {} } = {}) => {
  const attendus = passagesAttendus(scenarios);
  const gens = [];
  const ecartes = [];
  (testeurs || []).forEach((t) => {
    if (!t || !t.id || gens.some((x) => x.id === t.id)) return;
    if (!TELEPHONES.includes(t.mobile)) { ecartes.push(t.id); return; }
    gens.push({ id: t.id, telephone: t.mobile, web: t.web !== false, cles: new Set(), v1: 0 });
  });

  const porteurs = new Map(attendus.map((a) => [a.cle, []]));
  const poser = (t, a) => {
    t.cles.add(a.cle);
    if (a.vague === 1) t.v1 += 1;
    porteurs.get(a.cle).push(t.id);
  };

  /* Ce qui est déjà joué reste chez son auteur, s'il est encore là et
     que la clé existe encore. */
  const parCle = new Map(attendus.map((a) => [a.cle, a]));
  gens.forEach((t) => {
    (Array.isArray(garder[t.id]) ? garder[t.id] : []).forEach((cle) => {
      const a = parCle.get(cle);
      if (a && peut(t, a.plateforme) && !t.cles.has(cle) && porteurs.get(cle).length < a.voulu) poser(t, a);
    });
  });

  /* L'ordre compte : la vague 1 d'abord, pour qu'elle soit équilibrée à
     elle seule ; dans chaque vague, les téléphones avant le web, puisque
     le web (ouvert à tous) sert à rattraper l'écart entre iPhone et
     Android ; les passages doublés avant les simples. On sert toujours le
     moins chargé, à égalité le premier de la liste. */
  const ordre = attendus.slice().sort((a, b) => a.vague - b.vague
    || (a.plateforme === 'web') - (b.plateforme === 'web')
    || b.voulu - a.voulu
    || a.rang - b.rang);
  const charge = (t) => t.cles.size;
  ordre.forEach((a) => {
    while (porteurs.get(a.cle).length < a.voulu) {
      const libres = gens.filter((t) => peut(t, a.plateforme) && !t.cles.has(a.cle));
      if (!libres.length) break;
      const t = libres.reduce((x, y) => ((a.vague === 1 ? x.v1 - y.v1 : 0) || charge(x) - charge(y)) <= 0 ? x : y);
      poser(t, a);
    }
  });

  /* Le calcul au fil de l'eau ne voit pas tout : un testeur qui ne fait
     pas le web, ou des passages gardés, laissent un écart. On le resserre
     en déplaçant des passages de la vague 2 (la vague 1 reste telle
     quelle, déjà équilibrée) du plus chargé vers le moins chargé qui peut
     les prendre. Jamais un passage gardé. */
  const gardes = new Set(gens.flatMap((t) => (Array.isArray(garder[t.id]) ? garder[t.id] : []).map((c) => `${t.id}|${c}`)));
  for (let tour = 0; tour < 10000; tour += 1) {
    const tri = gens.slice().sort((x, y) => charge(y) - charge(x));
    let bouge = false;
    for (let i = 0; i < tri.length && !bouge; i += 1) {
      for (let j = tri.length - 1; j > i && !bouge; j -= 1) {
        const lourd = tri[i]; const leger = tri[j];
        if (charge(lourd) - charge(leger) < 2) continue;
        const cle = [...lourd.cles].find((c) => {
          const a = parCle.get(c);
          return a.vague === 2 && !gardes.has(`${lourd.id}|${c}`) && peut(leger, a.plateforme) && !leger.cles.has(c);
        });
        if (!cle) continue;
        lourd.cles.delete(cle); leger.cles.add(cle);
        const p = porteurs.get(cle); p[p.indexOf(lourd.id)] = leger.id;
        bouge = true;
      }
    }
    if (!bouge) break;
  }

  const rangDe = new Map(attendus.map((a, i) => [a.cle, i]));
  const affectation = {};
  gens.forEach((t) => {
    const cles = [...t.cles].sort((x, y) => parCle.get(x).vague - parCle.get(y).vague || rangDe.get(x) - rangDe.get(y));
    affectation[t.id] = { telephone: t.telephone, web: t.web, cles, vague: t.v1 ? 1 : 2 };
  });
  const manques = attendus
    .filter((a) => porteurs.get(a.cle).length < a.voulu)
    .map((a) => ({ cle: a.cle, plateforme: a.plateforme, voulu: a.voulu, obtenu: porteurs.get(a.cle).length }));
  return { affectation, manques, ecartes, attendus: attendus.length };
};

/* Les clés d'un testeur, quel que soit le format de l'affectation : la
   nouvelle (un objet avec « cles ») ou l'ancienne (une liste de
   références de la bibliothèque, campagnes d'avant le plan). */
export const clesDe = (affectation, uid) => {
  const a = (affectation || {})[uid];
  if (Array.isArray(a)) return a;
  return (a && Array.isArray(a.cles)) ? a.cles : [];
};

/* La charge de chacun : de quoi voir d'un coup d'œil si quelqu'un est
   écrasé ou oublié, vague par vague et plateforme par plateforme. */
export const chargeParTesteur = (affectation, scenarios) => {
  const vagues = new Map(passagesAttendus(scenarios).map((a) => [a.cle, a.vague]));
  return Object.entries(affectation || {}).map(([id, a]) => {
    const cles = clesDe(affectation, id);
    const plateforme = (c) => c.slice(c.lastIndexOf('__') + 2);
    return {
      id, telephone: (a && a.telephone) || '', total: cles.length,
      telephoneN: cles.filter((c) => plateforme(c) !== 'web').length,
      webN: cles.filter((c) => plateforme(c) === 'web').length,
      vague1: cles.filter((c) => vagues.get(c) === 1).length,
      vague2: cles.filter((c) => vagues.get(c) === 2).length,
    };
  });
};

/* Le contrôle d'une affectation contre le plan, montré dans l'aperçu
   avant d'enregistrer : clés oubliées, clés en trop (inconnues du plan ou
   sur une plateforme que le testeur ne fait pas), passages qui n'ont pas
   le bon nombre de testeurs. */
export const controler = (affectation, scenarios) => {
  const attendus = passagesAttendus(scenarios);
  const parCle = new Map(attendus.map((a) => [a.cle, a]));
  const compte = new Map();
  const enTrop = [];
  Object.entries(affectation || {}).forEach(([uid, a]) => {
    const vues = new Set();
    clesDe(affectation, uid).forEach((cle) => {
      const p = parCle.get(cle);
      if (!p || vues.has(cle) || !a || !peut({ telephone: a.telephone, web: a.web !== false }, p.plateforme)) { enTrop.push(`${uid}:${cle}`); return; }
      vues.add(cle);
      compte.set(cle, (compte.get(cle) || 0) + 1);
    });
  });
  const oubliees = attendus.filter((a) => !compte.get(a.cle)).map((a) => a.cle);
  const malCouvertes = attendus.filter((a) => compte.get(a.cle) && compte.get(a.cle) !== a.voulu).map((a) => a.cle);
  return { oubliees, enTrop, malCouvertes, conforme: !oubliees.length && !enTrop.length && !malCouvertes.length };
};


/* ==========================================================================
   La règle du socle (Nadir, 08/10/2026)

   Six testeurs, chacun SON téléphone et le web, dix heures au plus :
   - un plafond par testeur (120 tests, à 5 minutes le test), réglable sur
     la campagne ;
   - un socle décisif commun, d'environ 25 scénarios (priorité haute, dans
     les sections où aucun bug n'est toléré) : TOUS les testeurs le font,
     sur leur téléphone, et la part web sur le web ;
   - le reste, chaque passage UNE seule fois, par ordre de priorité (haute,
     puis moyenne, puis basse), tiré au sort à priorité égale, en servant
     toujours le moins chargé, jusqu'au plafond. Ce qui ne rentre pas est
     laissé aux robots ;
   - avant tout, on retire ce qui ne dirait rien de neuf : un passage
     « humain et robot » déjà rouge ou en défaut connu chez les robots, ou
     visé par un bug connu, et, sur le web, celui que les robots ont déjà
     validé au vert. Un scénario « humain » seul n'est jamais retiré :
     aucun robot ne le joue.
   Les informations viennent du Hub (plan, parcours des robots, anomalies),
   jamais d'un fichier local.
   ========================================================================== */

export const PLAFOND_DEFAUT = 120;
export const MINUTES_PAR_TEST = 5;
export const TAILLE_SOCLE = 25;
/* Les sections où aucun bug n'est toléré : inscription, connexion,
   session, premier lancement, tâches, abonnement et achat, synchro,
   compte, données. */
export const SECTIONS_CRITIQUES = ['inscription', 'connexion', 'session', 'onboarding', 'taches', 'abonnements', 'abonnement-croise', 'synchro', 'compte', 'donnees'];
export const MOTIFS_RETRAIT = {
  robot: 'déjà rouge ou en défaut connu chez les robots',
  bug: 'bug déjà connu',
  'web-vert': 'déjà validé au vert par les robots sur le web',
};
const ANOMALIES_OUVERTES = ['nouvelle', 'a-reverifier', 'confirmee'];
const RANG_PRIORITE = { haute: 0, moyenne: 1, basse: 2 };
const rangPriorite = (p) => (p in RANG_PRIORITE ? RANG_PRIORITE[p] : 3);
const RANG_TYPE = { normal: 0, limite: 1, erreur: 2 };
const RANG_ASPECT = { f: 0, s: 1, t: 2, u: 3 };
const aspectDe = (id) => (/-([ftus])-\d{3}$/.exec(String(id || '')) || [])[1] || '';

/** Le plafond d'une campagne : un entier positif, 120 sinon. */
export const plafondDe = (c) => {
  const n = Math.floor(Number((c || {}).plafond));
  return Number.isFinite(n) && n > 0 ? n : PLAFOND_DEFAUT;
};

/** Une campagne qui suit la règle du socle. */
export const regleSocle = (c) => Boolean(c) && c.regle === 'socle';

/**
 * Le socle proposé : les scénarios humains de priorité haute des sections
 * critiques, pris à tour de rôle, section par section (dans l'ordre de
 * SECTIONS_CRITIQUES), le cas d'usage courant et le fonctionnel d'abord.
 * Si les sections critiques n'y suffisent pas, les autres complètent, dans
 * l'ordre du plan. Seulement des scénarios qui ont au moins un passage au
 * téléphone qui n'est pas retiré (retraits : Map clé -> motif). L'équipe
 * retouche la liste dans le Cockpit.
 */
export const proposerSocle = (scenarios, { sections = SECTIONS_CRITIQUES, nombre = TAILLE_SOCLE, retraits = new Map() } = {}) => {
  const rangDe = new Map((scenarios || []).map((s, i) => [s && s.id, i]));
  /* Le socle se fait sur le téléphone : un scénario sans téléphone, ou
     dont tous les passages au téléphone sont retirés, n'y a pas sa place. */
  const candidats = (scenarios || []).filter((s) => s && s.id && QUI_HUMAIN.includes(s.qui) && s.priorite === 'haute'
    && (Array.isArray(s.plateformes) ? s.plateformes : []).some((p) => TELEPHONES.includes(p) && !retraits.has(cleAffectation(s.id, p))));
  const parSection = new Map();
  candidats.forEach((s) => { const k = s.section || ''; if (!parSection.has(k)) parSection.set(k, []); parSection.get(k).push(s); });
  parSection.forEach((l) => l.sort((a, b) => (RANG_TYPE[a.type] ?? 3) - (RANG_TYPE[b.type] ?? 3)
    || (RANG_ASPECT[aspectDe(a.id)] ?? 4) - (RANG_ASPECT[aspectDe(b.id)] ?? 4)
    || rangDe.get(a.id) - rangDe.get(b.id)));
  const pris = [];
  const tourner = (ordre) => {
    const files = ordre.map((k) => (parSection.get(k) || []).slice()).filter((f) => f.length);
    while (pris.length < nombre && files.some((f) => f.length)) {
      files.forEach((f) => { if (pris.length < nombre && f.length) pris.push(f.shift().id); });
    }
  };
  tourner(sections.filter((k) => parSection.has(k)));
  if (pris.length < nombre) tourner([...parSection.keys()].filter((k) => !sections.includes(k)));
  return pris;
};

/* Une anomalie vise-t-elle ce scénario sur cette plateforme ? Celles des
   robots portent « scenarios », celles des testeurs « scenario » ; sans
   plateforme déclarée, elle vaut partout. */
const anomalieSurCle = (a, id, plateforme) => {
  const vise = a.scenario === id || (Array.isArray(a.scenarios) && a.scenarios.includes(id));
  const plats = Array.isArray(a.plateformes) ? a.plateformes : [];
  return vise && (!plats.length || plats.includes(plateforme));
};

/**
 * Les passages à retirer de la campagne, avec leur motif (MOTIFS_RETRAIT).
 *
 * @param {Array} scenarios  scénarios du plan (avec « parcours », les
 *                           références des tests robot rattachés)
 * @param {Array} parcours   les parcours du projet (projets/{p}/parcours)
 * @param {Array} anomalies  les anomalies du projet (projets/{p}/anomalies)
 * @returns {Map<string, string>} clé -> motif
 */
export const retraitsConnus = ({ scenarios = [], parcours = [], anomalies = [] } = {}) => {
  const parRef = new Map((parcours || []).filter((p) => p && p.ref && p.actif !== false).map((p) => [p.ref, p]));
  const ouvertes = (anomalies || []).filter((a) => a && ANOMALIES_OUVERTES.includes(a.statut || 'nouvelle'));
  const retraits = new Map();
  (scenarios || []).forEach((s) => {
    if (!s || s.qui !== 'les-deux' || !s.id) return;
    const rattaches = (Array.isArray(s.parcours) ? s.parcours : []).map((r) => parRef.get(r)).filter(Boolean);
    const siennes = new Set(Array.isArray(s.plateformes) ? s.plateformes : []);
    PLATEFORMES.filter((p) => siennes.has(p)).forEach((p) => {
      const etat = rattaches.length ? verdictScenarioPlan({ scenario: s, rattaches, plateforme: p }).etat : 'aecrire';
      const cle = cleAffectation(s.id, p);
      if (etat === 'casse' || etat === 'connu') retraits.set(cle, 'robot');
      else if (ouvertes.some((a) => anomalieSurCle(a, s.id, p))) retraits.set(cle, 'bug');
      else if (p === 'web' && etat === 'ok') retraits.set(cle, 'web-vert');
    });
  });
  return retraits;
};

/* Un tirage reproductible : la même campagne, les mêmes données, la même
   répartition. L'aperçu montre ce qui sera écrit, pas un autre tirage. */
const alea = (graine) => {
  let h = 2166136261;
  String(graine || 'capmedia').split('').forEach((ch) => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); });
  let x = h >>> 0;
  return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/**
 * La répartition selon la règle du socle.
 *
 * @param {Array}  scenarios  scénarios du plan retenus par la campagne
 * @param {Array}  testeurs   [{ id, mobile: 'ios'|'android', web? }]
 * @param {Object} options    socle (identifiants), plafond, retraits (Map
 *                            clé -> motif), garder ({ uid: [clé] } déjà
 *                            consignés), graine (le tirage)
 * @returns {{ affectation, socle, reste, laisses, retires, depassements, ecartes, attendus }}
 */
export const repartirSocle = (scenarios, testeurs, { socle = [], plafond = PLAFOND_DEFAUT, retraits = new Map(), garder = {}, graine = '' } = {}) => {
  const tous = passagesAttendus(scenarios);
  const sc = new Map((scenarios || []).map((s) => [s.id, s]));
  const retires = tous.filter((a) => retraits.has(a.cle)).map((a) => ({ cle: a.cle, motif: retraits.get(a.cle) }));
  const attendus = tous.filter((a) => !retraits.has(a.cle));
  const parCle = new Map(attendus.map((a) => [a.cle, a]));
  const dansSocle = new Set((socle || []).filter((id) => sc.has(id)));
  const max = Math.max(1, Math.floor(Number(plafond)) || PLAFOND_DEFAUT);

  const gens = [];
  const ecartes = [];
  (testeurs || []).forEach((t) => {
    if (!t || !t.id || gens.some((x) => x.id === t.id)) return;
    if (!TELEPHONES.includes(t.mobile)) { ecartes.push(t.id); return; }
    gens.push({ id: t.id, telephone: t.mobile, web: t.web !== false, cles: new Set() });
  });

  /* 1. Le socle, chez tous, sur ce que chacun peut faire. */
  const cleSocle = attendus.filter((a) => dansSocle.has(a.scenario));
  gens.forEach((t) => cleSocle.forEach((a) => { if (peut(t, a.plateforme)) t.cles.add(a.cle); }));
  const socleDe = new Map(gens.map((t) => [t.id, t.cles.size]));

  /* 2. Ce qui est déjà joué reste chez son auteur (une fois). */
  const pris = new Map();
  gens.forEach((t) => (Array.isArray(garder[t.id]) ? garder[t.id] : []).forEach((cle) => {
    const a = parCle.get(cle);
    if (!a || dansSocle.has(a.scenario) || pris.has(cle) || !peut(t, a.plateforme)) return;
    t.cles.add(cle); pris.set(cle, t.id);
  }));

  /* 3. Le reste, une fois chacun, priorité par priorité. À priorité égale,
     un « humain » seul passe devant (aucun robot ne le rattrapera), le
     téléphone devant le web (les robots couvrent déjà le web), et le
     sort décide dans chaque groupe. Toujours le moins chargé, jamais
     au-delà du plafond. */
  const tirer = alea(`${graine}|${max}`);
  const groupe = (a) => {
    const s = sc.get(a.scenario) || {};
    return [rangPriorite(s.priorite), s.qui === 'humain' ? 0 : 1, a.plateforme === 'web' ? 1 : 0];
  };
  const reste = attendus.filter((a) => !dansSocle.has(a.scenario) && !pris.has(a.cle))
    .map((a) => ({ a, g: groupe(a), x: tirer() }))
    .sort((p, q) => p.g[0] - q.g[0] || p.g[1] - q.g[1] || p.g[2] - q.g[2] || p.x - q.x)
    .map((p) => p.a);
  const laisses = [];
  reste.forEach((a) => {
    const libres = gens.filter((t) => peut(t, a.plateforme) && t.cles.size < max);
    if (!libres.length) { laisses.push(a); return; }
    const moins = Math.min(...libres.map((t) => t.cles.size));
    const egaux = libres.filter((t) => t.cles.size === moins);
    const t = egaux[Math.floor(tirer() * egaux.length)];
    t.cles.add(a.cle); pris.set(a.cle, t.id);
  });

  const rangDe = new Map(attendus.map((a, i) => [a.cle, i]));
  const tri = (k) => { const a = parCle.get(k); const s = sc.get(a.scenario) || {}; return [dansSocle.has(a.scenario) ? 0 : 1, rangPriorite(s.priorite), a.plateforme === 'web' ? 1 : 0, rangDe.get(k)]; };
  const comparer = (x, y) => { const a = tri(x); const b = tri(y); for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const affectation = {};
  gens.forEach((t) => {
    const cles = [...t.cles].sort(comparer);
    const haute = cles.some((k) => dansSocle.has(parCle.get(k).scenario) || (sc.get(parCle.get(k).scenario) || {}).priorite === 'haute');
    affectation[t.id] = { telephone: t.telephone, web: t.web, cles, vague: haute ? 1 : 2 };
  });
  const depassements = gens.filter((t) => socleDe.get(t.id) > max).map((t) => ({ id: t.id, socle: socleDe.get(t.id) }));
  return {
    affectation,
    socle: { scenarios: [...dansSocle], cles: cleSocle.length },
    laisses: laisses.map((a) => { const s = sc.get(a.scenario) || {}; return { cle: a.cle, scenario: a.scenario, plateforme: a.plateforme, qui: s.qui, priorite: s.priorite || '' }; }),
    retires,
    depassements,
    ecartes,
    attendus: attendus.length,
  };
};

/**
 * Le contrôle d'une affectation selon la règle du socle, contre le plan,
 * sans recalculer le tirage : ce qui doit être vrai quelle que soit la
 * façon dont on l'a obtenue.
 *   enTrop        clé inconnue du plan, retirée, en double chez un testeur,
 *                 ou hors de son téléphone et du web ;
 *   doublons      clé hors socle confiée à plus d'un testeur ;
 *   socleManquant clé du socle qu'un testeur peut faire et n'a pas ;
 *   auDessus      testeur au-delà du plafond ;
 *   laisses       clés que personne n'a (laissées aux robots), pour info.
 */
export const controlerSocle = (affectation, scenarios, { socle = [], retraits = [], plafond = PLAFOND_DEFAUT } = {}) => {
  const sansRetraits = new Set(retraits instanceof Map ? [...retraits.keys()] : (retraits || []));
  const attendus = passagesAttendus(scenarios).filter((a) => !sansRetraits.has(a.cle));
  const parCle = new Map(attendus.map((a) => [a.cle, a]));
  const dansSocle = new Set(socle || []);
  const max = Math.max(1, Math.floor(Number(plafond)) || PLAFOND_DEFAUT);
  const porteurs = new Map();
  const enTrop = []; const socleManquant = []; const auDessus = [];
  Object.entries(affectation || {}).forEach(([uid, a]) => {
    const t = { telephone: a && a.telephone, web: !a || a.web !== false };
    const vues = new Set();
    const cles = clesDe(affectation, uid);
    cles.forEach((cle) => {
      const p = parCle.get(cle);
      if (!p || vues.has(cle) || !peut(t, p.plateforme)) { enTrop.push(`${uid}:${cle}`); return; }
      vues.add(cle);
      porteurs.set(cle, (porteurs.get(cle) || 0) + 1);
    });
    attendus.filter((x) => dansSocle.has(x.scenario) && peut(t, x.plateforme) && !vues.has(x.cle))
      .forEach((x) => socleManquant.push(`${uid}:${x.cle}`));
    if (cles.length > max) auDessus.push(uid);
  });
  const doublons = attendus.filter((a) => !dansSocle.has(a.scenario) && (porteurs.get(a.cle) || 0) > 1).map((a) => a.cle);
  const laisses = attendus.filter((a) => !dansSocle.has(a.scenario) && !porteurs.get(a.cle)).map((a) => a.cle);
  return { enTrop, doublons, socleManquant, auDessus, laisses, conforme: !enTrop.length && !doublons.length && !socleManquant.length && !auDessus.length };
};

/* La charge de chacun selon la règle du socle : socle, reste, total, et
   le temps que ça représente. */
export const chargeSocle = (affectation, socle = []) => {
  const dansSocle = new Set(socle || []);
  return Object.keys(affectation || {}).map((id) => {
    const a = affectation[id] || {};
    const cles = clesDe(affectation, id);
    const scenario = (c) => c.slice(0, c.lastIndexOf('__'));
    const s = cles.filter((c) => dansSocle.has(scenario(c))).length;
    return {
      id, telephone: a.telephone || '', socle: s, reste: cles.length - s, total: cles.length,
      webN: cles.filter((c) => c.endsWith('__web')).length,
      heures: Math.round((cles.length * MINUTES_PAR_TEST / 60) * 10) / 10,
    };
  });
};
