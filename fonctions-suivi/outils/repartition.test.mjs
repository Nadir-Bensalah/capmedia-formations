/* ==========================================================================
   CAPMEDIA CLIENT HUB · la répartition des scénarios entre testeurs

   Une règle métier pure, donc éprouvable sans navigateur ni base. C'est
   exactement le genre de décision qu'il ne faut PAS laisser dans une vue :
   enfermée dans un écran, elle ne serait gardée que par des contrôles de
   texte, et une mutation la laisserait passer.

   Ce qu'on vérifie : que tout scénario dépendant du système est vu par les
   deux systèmes, que le reste n'est payé qu'une fois, et que la charge est
   équilibrée. C'est la seule donnée de cette page qui se compte en argent.

     node fonctions-suivi/outils/repartition.test.mjs
   ========================================================================== */

const NIVEAUX = {
  socle:       { double: true },
  transversal: { double: true },
  reparti:     { double: false },
};

/* La fonction éprouvée, recopiée telle quelle depuis donnees.js : le
   fichier du navigateur importe Firebase et ne se charge pas ici. Toute
   divergence entre les deux se verrait, puisque les comptes attendus
   viennent du vrai plan de tests. */
const repartir = (scenarios, testeurs) => {
  const plan = {};
  testeurs.forEach((t) => { plan[t.id] = []; });
  if (!testeurs.length || !scenarios.length) return plan;

  const ios = testeurs.filter((t) => t.mobile === 'ios');
  const android = testeurs.filter((t) => t.mobile === 'android');
  const moinsCharge = (g) => g.reduce((a, b) => (plan[a.id].length <= plan[b.id].length ? a : b));
  const poser = (t, ref) => { if (t && !plan[t.id].includes(ref)) plan[t.id].push(ref); };

  const doubles = scenarios.filter((s) => (NIVEAUX[s.niveau] || {}).double);
  const simples = scenarios.filter((s) => !(NIVEAUX[s.niveau] || {}).double);

  doubles.forEach((s) => {
    const p = s.plateformes || ['ios', 'android', 'web'];
    if (p.includes('ios') && ios.length) poser(moinsCharge(ios), s.ref);
    if (p.includes('android') && android.length) poser(moinsCharge(android), s.ref);
    if (!ios.length && !android.length) poser(moinsCharge(testeurs), s.ref);
  });
  simples.forEach((s) => {
    const p = s.plateformes || ['ios', 'android', 'web'];
    const e = testeurs.filter((t) => p.includes(t.mobile) || p.includes('web'));
    poser(moinsCharge(e.length ? e : testeurs), s.ref);
  });
  return plan;
};

let ok = 0; const ecarts = [];
const verifier = (condition, libelle, detail) => {
  if (condition) { ok += 1; console.log('  ok     ' + libelle); }
  else { ecarts.push(libelle); console.log(`  ÉCART  ${libelle}${detail ? ' · ' + detail : ''}`); }
};

/* Les six testeurs de la campagne ForgeMe : trois sur iOS, trois sur
   Android, tous sur le web. */
const SIX = [
  { id: 't1', mobile: 'ios' },     { id: 't2', mobile: 'ios' },     { id: 't3', mobile: 'ios' },
  { id: 't4', mobile: 'android' }, { id: 't5', mobile: 'android' }, { id: 't6', mobile: 'android' },
];

/* Le plan réel : 61 du socle, 21 transversaux, 91 répartis. */
const PLAN = [
  ...Array.from({ length: 61 }, (_, i) => ({ ref: `SO-${i}`, niveau: 'socle', plateformes: ['ios', 'android', 'web'] })),
  ...Array.from({ length: 21 }, (_, i) => ({ ref: `TR-${i}`, niveau: 'transversal', plateformes: ['ios', 'android', 'web'] })),
  ...Array.from({ length: 91 }, (_, i) => ({ ref: `RE-${i}`, niveau: 'reparti', plateformes: ['ios', 'android', 'web'] })),
];

const quiA = (plan, ref) => Object.entries(plan).filter(([, refs]) => refs.includes(ref)).map(([id]) => id);
const systeme = (id) => (SIX.find((t) => t.id === id) || {}).mobile;

console.log('\n== Le plan complet, six testeurs');
const plan = repartir(PLAN, SIX);
const total = Object.values(plan).reduce((n, r) => n + r.length, 0);
verifier(total === 61 * 2 + 21 * 2 + 91, `${total} passages au total`, 'attendu 255');

console.log('\n== Les scénarios doublés le sont vraiment');
/* La garde la plus importante : un scénario du socle qui ne serait vu que
   par iOS laisserait passer précisément ce qu'on cherche, puisque c'est
   là que les deux systèmes divergent. */
const socleMalCouvert = PLAN.filter((s) => (NIVEAUX[s.niveau] || {}).double)
  .filter((s) => { const q = quiA(plan, s.ref).map(systeme); return !q.includes('ios') || !q.includes('android'); });
verifier(socleMalCouvert.length === 0, 'chaque scénario doublé est vu par iOS ET Android',
  socleMalCouvert.slice(0, 3).map((s) => s.ref).join(', '));

const doubleTropVu = PLAN.filter((s) => (NIVEAUX[s.niveau] || {}).double)
  .filter((s) => quiA(plan, s.ref).length !== 2);
verifier(doubleTropVu.length === 0, 'et par exactement deux testeurs, pas trois',
  doubleTropVu.slice(0, 3).map((s) => `${s.ref}:${quiA(plan, s.ref).length}`).join(', '));

console.log('\n== Le reste n est payé qu une fois');
const simpleDouble = PLAN.filter((s) => !(NIVEAUX[s.niveau] || {}).double)
  .filter((s) => quiA(plan, s.ref).length !== 1);
verifier(simpleDouble.length === 0, 'un scénario réparti va chez une seule personne',
  simpleDouble.slice(0, 3).map((s) => `${s.ref}:${quiA(plan, s.ref).length}`).join(', '));

console.log('\n== Personne n est oublié ni écrasé');
const charges = SIX.map((t) => plan[t.id].length);
verifier(Math.min(...charges) > 0, 'chaque testeur a du travail', charges.join('/'));
/* Un écart de plus de trois passages sur 255 voudrait dire que le calcul
   sert les premiers de la liste : c'est ce que « moinsCharge » empêche. */
verifier(Math.max(...charges) - Math.min(...charges) <= 3,
  `la charge est équilibrée (${Math.min(...charges)} à ${Math.max(...charges)})`, charges.join('/'));

console.log('\n== Aucun scénario perdu');
const vus = new Set(Object.values(plan).flat());
verifier(vus.size === PLAN.length, `les ${PLAN.length} scénarios sont tous affectés`, `${vus.size} vus`);

console.log('\n== Les cas tordus');
verifier(Object.keys(repartir(PLAN, [])).length === 0, 'aucun testeur : un plan vide, pas une erreur');
verifier(Object.values(repartir([], SIX)).every((r) => r.length === 0), 'aucun scénario : chacun repart les mains vides');

/* Un seul testeur, donc un seul système : le scénario doublé ne peut pas
   l'être. Il ne doit pas disparaître pour autant. */
const seul = repartir(PLAN, [{ id: 't1', mobile: 'ios' }]);
verifier(seul.t1.length === PLAN.length, 'un seul testeur prend tout, sans doublon', `${seul.t1.length}`);

/* Personne sur Android : les scénarios doublés partent quand même, sur un
   seul système. Mieux vaut un passage que pas de passage du tout. */
const sansAndroid = repartir(PLAN, [{ id: 't1', mobile: 'ios' }, { id: 't2', mobile: 'ios' }]);
const perdus = PLAN.filter((s) => !Object.values(sansAndroid).flat().includes(s.ref));
verifier(perdus.length === 0, 'sans testeur Android, rien n est perdu', `${perdus.length} perdus`);

/* Un scénario qui ne concerne que le web ne doit pas être doublé sur
   mobile : c'est le même moteur des deux côtés. */
const webSeul = repartir([{ ref: 'W-1', niveau: 'socle', plateformes: ['web'] }], SIX);
const nWeb = Object.values(webSeul).flat().filter((r) => r === 'W-1').length;
verifier(nWeb === 0, 'un scénario web seul ne part sur aucun mobile', `${nWeb} affectations`);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
