/* ==========================================================================
   CAPMEDIA TEST · la répartition des passages entre testeurs, à l'épreuve

   Une règle métier pure, donc éprouvable sans navigateur ni base. Le code
   éprouvé est celui de la page, importé tel quel (repartition.js ne dépend
   de rien) : aucune copie qui pourrait diverger.

   Ce qu'on vérifie, recalculé ici sans passer par le module :
   - aucune clé oubliée, aucune en trop ;
   - un passage « humain » seul chez deux testeurs différents, un passage
     « les-deux » chez un seul ;
   - chacun ne reçoit que son téléphone et le web ;
   - la charge est équilibrée, sur la vague 1 comme sur l'ensemble ;
   - la vague 1 (priorité haute) passe avant le reste ;
   - ce qui ne trouve personne est rendu, jamais perdu.
   Puis la même chose sur le vrai plan ForgeMe, s'il est sur la machine.

     node fonctions-suivi/outils/repartition.test.mjs
   ========================================================================== */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const {
  repartir, scenariosHumains, chargeParTesteur, controler, clesDe,
} = await import(path.join(ICI, '../../agence/suivi/assets/js/repartition.js'));

let ok = 0; const ecarts = [];
const verifier = (condition, libelle, detail) => {
  if (condition) { ok += 1; console.log('  ok     ' + libelle); }
  else { ecarts.push(libelle); console.log(`  ÉCART  ${libelle}${detail ? ' · ' + detail : ''}`); }
};

const SIX = [
  { id: 't1', mobile: 'ios' }, { id: 't2', mobile: 'ios' }, { id: 't3', mobile: 'ios' },
  { id: 't4', mobile: 'android' }, { id: 't5', mobile: 'android' }, { id: 't6', mobile: 'android' },
];

/* Ce que la règle attend, recalculé à la main : clé -> nombre de testeurs. */
const NB = { humain: 2, 'les-deux': 1 };
const attenduDe = (scenarios) => {
  const m = new Map();
  scenarios.forEach((s) => {
    if (!NB[s.qui]) return;
    [...new Set(s.plateformes || [])].filter((p) => ['ios', 'android', 'web'].includes(p))
      .forEach((p) => m.set(`${s.id}__${p}`, { n: NB[s.qui], p, vague: s.priorite === 'haute' ? 1 : 2 }));
  });
  return m;
};

/* L'examen complet d'une répartition, indépendant du module. */
const examiner = (titre, scenarios, testeurs, r, { equilibre = 2 } = {}) => {
  const attendu = attenduDe(scenarios);
  const tel = Object.fromEntries(testeurs.map((t) => [t.id, t.mobile]));
  const qui = new Map();
  const horsPlan = []; const doublons = []; const mauvaisePlateforme = [];
  Object.entries(r.affectation).forEach(([uid, a]) => {
    const vues = new Set();
    a.cles.forEach((cle) => {
      if (!attendu.has(cle)) { horsPlan.push(`${uid}:${cle}`); return; }
      if (vues.has(cle)) doublons.push(`${uid}:${cle}`);
      vues.add(cle);
      const p = attendu.get(cle).p;
      if (p !== 'web' && p !== tel[uid]) mauvaisePlateforme.push(`${uid}:${cle}`);
      qui.set(cle, [...(qui.get(cle) || []), uid]);
    });
  });
  const oubliees = [...attendu.keys()].filter((c) => !qui.has(c));
  const malComptees = [...attendu.entries()].filter(([c, a]) => qui.has(c) && new Set(qui.get(c)).size !== a.n);
  verifier(!oubliees.length, `${titre} : aucune clé oubliée (${attendu.size} attendues)`, oubliees.slice(0, 3).join(', '));
  verifier(!horsPlan.length, `${titre} : aucune clé en trop`, horsPlan.slice(0, 3).join(', '));
  verifier(!doublons.length, `${titre} : jamais deux fois la même clé chez un testeur`, doublons.slice(0, 3).join(', '));
  verifier(!malComptees.length, `${titre} : humain seul chez 2 testeurs distincts, les-deux chez 1`,
    malComptees.slice(0, 3).map(([c]) => `${c}:${qui.get(c).length}`).join(', '));
  verifier(!mauvaisePlateforme.length, `${titre} : chacun ne reçoit que son téléphone et le web`, mauvaisePlateforme.slice(0, 3).join(', '));
  const total = Object.values(r.affectation).reduce((n, a) => n + a.cles.length, 0);
  const voulu = [...attendu.values()].reduce((n, a) => n + a.n, 0);
  verifier(total === voulu, `${titre} : ${total} passages pour ${voulu} voulus`);
  verifier(Object.values(r.affectation).every((a, i) => a.telephone === testeurs[i].mobile),
    `${titre} : la plateforme du testeur est posée par l'affectation`);
  const charges = Object.values(r.affectation).map((a) => a.cles.length);
  verifier(Math.max(...charges) - Math.min(...charges) <= equilibre,
    `${titre} : charge équilibrée (${Math.min(...charges)} à ${Math.max(...charges)})`, charges.join('/'));
  const v1 = Object.values(r.affectation).map((a) => a.cles.filter((c) => attendu.get(c).vague === 1).length);
  verifier(Math.max(...v1) - Math.min(...v1) <= equilibre,
    `${titre} : vague 1 équilibrée à elle seule (${Math.min(...v1)} à ${Math.max(...v1)})`, v1.join('/'));
  const enOrdre = Object.values(r.affectation).every((a) => {
    const vs = a.cles.map((c) => attendu.get(c).vague);
    return vs.every((v, i) => i === 0 || vs[i - 1] <= v);
  });
  verifier(enOrdre, `${titre} : chacun commence par la vague 1`);
  verifier(Object.values(r.affectation).every((a) => a.vague === (a.cles.some((c) => attendu.get(c).vague === 1) ? 1 : 2)),
    `${titre} : la vague du testeur dit par où il commence`);
  verifier(r.manques.length === 0, `${titre} : aucun manque`, `${r.manques.length}`);
  verifier(controler(r.affectation, scenarios).conforme, `${titre} : le contrôle de l'aperçu la dit conforme`);
  return { charges, v1 };
};

/* -------------------------------------------------------------------------- */
console.log('\n== Un plan de synthèse, six testeurs');
/* Un plan qui a de tout : des humains seuls et des « les-deux », sur une,
   deux ou trois plateformes, web seul compris, des priorités hautes et
   basses, des robots à écarter, un identifiant répété. */
const SECTIONS = [
  { id: 'a', aspects: {
    fonctionnel: [
      { id: 'a-f-1', qui: 'humain', priorite: 'haute', plateformes: ['ios', 'android', 'web'] },
      { id: 'a-f-2', qui: 'les-deux', priorite: 'haute', plateformes: ['ios', 'android'] },
      { id: 'a-f-3', qui: 'robot', priorite: 'haute', plateformes: ['ios', 'android', 'web'] },
      { id: 'a-f-4', qui: 'les-deux', priorite: 'basse', plateformes: ['web'] },
    ],
    ux: [{ id: 'a-u-1', qui: 'humain', priorite: 'moyenne', plateformes: ['web'] }],
  } },
  { id: 'b', aspects: {
    technique: [{ id: 'a-f-1', qui: 'les-deux', priorite: 'basse', plateformes: ['ios'] }],
    securite: Array.from({ length: 40 }, (_, i) => ({
      id: `b-s-${i}`, qui: i % 3 ? 'les-deux' : 'humain', priorite: i % 4 ? 'moyenne' : 'haute',
      plateformes: [['ios', 'android', 'web'], ['ios'], ['android', 'web'], ['web'], ['ios', 'android']][i % 5],
    })),
  } },
];
const SYN = scenariosHumains(SECTIONS);
verifier(SYN.length === 44, 'les robots sont écartés et un identifiant répété ne compte qu\'une fois', `${SYN.length}`);
verifier(!SYN.some((s) => s.qui === 'robot'), 'aucun scénario robot dans la répartition');
examiner('synthèse', SYN, SIX, repartir(SYN, SIX));

console.log('\n== Le scénario web seul (le défaut d\'avant : zéro affectation)');
const W = [{ id: 'w-1', qui: 'humain', priorite: 'haute', plateformes: ['web'] }, { id: 'w-2', qui: 'les-deux', priorite: 'basse', plateformes: ['web'] }];
const rw = repartir(W, SIX);
const chez = (r, cle) => Object.entries(r.affectation).filter(([, a]) => a.cles.includes(cle)).map(([u]) => u);
verifier(new Set(chez(rw, 'w-1__web')).size === 2, 'un humain seul web part chez exactement 2 testeurs', chez(rw, 'w-1__web').join(','));
verifier(chez(rw, 'w-2__web').length === 1, 'un « les-deux » web part chez exactement 1 testeur', chez(rw, 'w-2__web').join(','));

console.log('\n== Personne sur Android');
const IOS = SIX.slice(0, 3);
const ri = repartir(SYN, IOS);
const androidChezIos = Object.values(ri.affectation).flatMap((a) => a.cles).filter((c) => c.endsWith('__android'));
verifier(androidChezIos.length === 0, 'aucun passage Android confié à un iPhone', androidChezIos.slice(0, 3).join(', '));
const attSyn = attenduDe(SYN);
const nAndroid = [...attSyn.keys()].filter((c) => c.endsWith('__android')).length;
verifier(ri.manques.length === nAndroid && ri.manques.every((m) => m.plateforme === 'android' && m.obtenu === 0),
  `les ${nAndroid} passages Android sont rendus en manque, pas perdus en silence`, `${ri.manques.length}`);

console.log('\n== Un seul testeur par téléphone');
const DEUX = [{ id: 't1', mobile: 'ios' }, { id: 't4', mobile: 'android' }];
const rd = repartir(SYN, DEUX);
const humainsMobiles = [...attSyn.entries()].filter(([, a]) => a.n === 2 && a.p !== 'web').map(([c]) => c);
verifier(humainsMobiles.every((c) => rd.manques.some((m) => m.cle === c && m.voulu === 2 && m.obtenu === 1)),
  'un humain seul sur un téléphone tenu par une seule personne : 1 sur 2, signalé', `${rd.manques.length} manques`);
verifier([...attSyn.entries()].filter(([, a]) => a.p === 'web' && a.n === 2).every(([c]) => chez(rd, c).length === 2),
  'sur le web, les deux testeurs se partagent bien les humains seuls');

console.log('\n== Un testeur sans téléphone, un web refusé');
const rs = repartir(SYN, [...SIX, { id: 't7', mobile: '' }]);
verifier(rs.ecartes.includes('t7') && !rs.affectation.t7, 'sans téléphone, le testeur est écarté et rien ne lui est confié');
const sansWeb = [{ id: 't1', mobile: 'ios', web: false }, ...SIX.slice(1)];
const rn = repartir(SYN, sansWeb);
verifier(!rn.affectation.t1.cles.some((c) => c.endsWith('__web')) && rn.affectation.t1.web === false,
  'qui ne fait pas le web n\'en reçoit pas');
examiner('sans web pour t1', SYN, sansWeb, rn);

console.log('\n== Les passages déjà consignés restent chez leur auteur');
const premier = repartir(SYN, SIX);
/* Des passages de la vague 2 : ils entrent les premiers, et l'ordre des
   clés doit rester vague 1 d'abord. */
const garder = { t2: premier.affectation.t2.cles.slice(-5), t5: premier.affectation.t5.cles.slice(-5) };
const SIX_INVERSE = SIX.slice().reverse();
const rg = repartir(SYN, SIX_INVERSE, { garder });
verifier(garder.t2.every((c) => rg.affectation.t2.cles.includes(c)) && garder.t5.every((c) => rg.affectation.t5.cles.includes(c)),
  'les cinq passages de t2 et de t5 sont toujours à eux');
const rgx = repartir(SYN, SIX, { garder: { t1: ['inconnu__ios', 'a-f-2__android'] } });
verifier(!rgx.affectation.t1.cles.includes('inconnu__ios') && !rgx.affectation.t1.cles.includes('a-f-2__android'),
  'une clé gardée inconnue du plan ou hors de son téléphone n\'est pas reprise');
examiner('avec passages gardés', SYN, SIX_INVERSE, rg);

console.log('\n== La vague 1 d\'abord, et protégée');
/* Le plan liste la vague 2 avant la vague 1 : 30 passages iPhone de
   priorité basse, puis 12 passages web de priorité haute. Servis dans
   l'ordre du plan, les Android (à zéro) prendraient toute la vague 1. */
const INVERSE = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `v2-${i}`, qui: 'les-deux', priorite: 'basse', plateformes: ['ios'] })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `v1-${i}`, qui: 'les-deux', priorite: 'haute', plateformes: ['web'] })),
];
const rv = repartir(INVERSE, SIX);
const v1De = (r, sc) => { const a = attenduDe(sc); return Object.values(r.affectation).map((x) => x.cles.filter((c) => a.get(c).vague === 1).length); };
const v1Inverse = v1De(rv, INVERSE);
verifier(Math.max(...v1Inverse) - Math.min(...v1Inverse) <= 1, 'la vague 1 est répartie avant le reste, même placée en fin de plan', v1Inverse.join('/'));
/* Le resserrage final ne déplace que la vague 2 : t1 ne fait pas le web,
   il est donc léger ; on ne doit pas lui passer la vague 1 des autres
   iPhone pour combler. */
const PROTEGE = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `p1-${i}`, qui: 'les-deux', priorite: 'haute', plateformes: ['ios'] })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `p2-${i}`, qui: 'les-deux', priorite: 'haute', plateformes: ['android'] })),
  ...Array.from({ length: 30 }, (_, i) => ({ id: `p3-${i}`, qui: 'les-deux', priorite: 'basse', plateformes: ['web'] })),
];
const v1Protege = v1De(repartir(PROTEGE, sansWeb), PROTEGE);
verifier(Math.max(...v1Protege) - Math.min(...v1Protege) <= 1, 'le resserrage ne déséquilibre pas la vague 1', v1Protege.join('/'));
const toutBas = repartir(INVERSE.slice(0, 30), SIX);
verifier(Object.values(toutBas.affectation).every((a) => a.vague === 2), 'sans priorité haute, chacun commence par la vague 2');

console.log('\n== Les cas tordus');
verifier(Object.keys(repartir(SYN, []).affectation).length === 0, 'aucun testeur : une affectation vide, pas une erreur');
verifier(Object.values(repartir([], SIX).affectation).every((a) => a.cles.length === 0), 'aucun scénario : chacun repart les mains vides');
verifier(clesDe({ u: ['TA-01', 'TA-02'] }, 'u').length === 2 && clesDe({ u: { cles: ['x__ios'] } }, 'u')[0] === 'x__ios' && clesDe({}, 'u').length === 0,
  'clesDe lit l\'ancienne affectation (liste) comme la nouvelle');

console.log('\n== Le contrôle de l\'aperçu voit les fautes');
const juste = repartir(SYN, SIX).affectation;
const copie = () => JSON.parse(JSON.stringify(juste));
const oubli = copie();
const cleSeule = oubli.t1.cles.find((c) => attSyn.get(c).n === 1);
oubli.t1.cles = oubli.t1.cles.filter((c) => c !== cleSeule);
const c1 = controler(oubli, SYN);
verifier(c1.oubliees.length === 1 && c1.oubliees[0] === cleSeule, `une clé retirée (${cleSeule}) est vue oubliée`, JSON.stringify(c1).slice(0, 120));
const trop = copie(); trop.t1.cles.push('zz__ios');
verifier(!controler(trop, SYN).conforme && controler(trop, SYN).enTrop.length === 1, 'une clé inconnue est vue en trop');
const croise = copie(); croise.t1.cles.push(croise.t4.cles.find((c) => c.endsWith('__android')));
verifier(controler(croise, SYN).enTrop.length === 1, 'une clé Android chez un iPhone est vue en trop');
const humainUnSeul = copie();
const cleH = 'a-f-1__web';
const porteursH = Object.entries(humainUnSeul).filter(([, a]) => a.cles.includes(cleH)).map(([u]) => u);
humainUnSeul[porteursH[0]].cles = humainUnSeul[porteursH[0]].cles.filter((c) => c !== cleH);
verifier(controler(humainUnSeul, SYN).malCouvertes.includes(cleH), 'un humain seul passé par un seul testeur est vu');

/* -------------------------------------------------------------------------- */
const DOSSIER = process.env.PLAN_SECTIONS || path.join(os.homedir(), 'ForgeMe-tests/plan-tests/sections');
if (fs.existsSync(DOSSIER)) {
  console.log('\n== Le vrai plan ForgeMe, trois iPhone et trois Android');
  const sections = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8')))
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const reel = scenariosHumains(sections);
  const r = repartir(reel, SIX);
  examiner('plan réel', reel, SIX, r);
  const nom = { ios: 'iPhone', android: 'Android' };
  console.log(`\n     ${reel.length} scénarios humains, ${r.attendus} clés, ${Object.values(r.affectation).reduce((n, a) => n + a.cles.length, 0)} passages`);
  console.log('     testeur  téléphone  total  téléphone  web  vague 1  vague 2');
  chargeParTesteur(r.affectation, reel).forEach((c) => console.log(
    `     ${c.id.padEnd(8)} ${nom[c.telephone].padEnd(10)} ${String(c.total).padStart(5)}  ${String(c.telephoneN).padStart(9)}  ${String(c.webN).padStart(3)}  ${String(c.vague1).padStart(7)}  ${String(c.vague2).padStart(7)}`));
} else console.log(`\n(vrai plan absent : ${DOSSIER})`);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
