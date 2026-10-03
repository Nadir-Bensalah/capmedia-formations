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

   Ce module ne dépend de rien : la page (vues/tests.js) et l'épreuve
   (fonctions-suivi/outils/repartition.test.mjs) importent le même code.
   ========================================================================== */

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
