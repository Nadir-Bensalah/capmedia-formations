/* ==========================================================================
   CAPMEDIA TEST · la campagne côté Cockpit

   On charge le VRAI fichier du navigateur (campagne-plan.js, il n'importe
   rien), jamais une copie. Chaque correctif du lot a ses cas :

   - B1 : modifier une campagne ne remet pas tous les scénarios ;
   - B2 : une clé que personne n'a se voit (« oubliées ») et empêche le
     lancement ;
   - le lancement ne part que si tout est vrai ;
   - le vivier proposé laisse les retirés dehors ;
   - les verdicts d'avant (ok, ko, na) se lisent avec les mots d'aujourd'hui.

     node fonctions-suivi/outils/campagne-cockpit.test.mjs
   ========================================================================== */

import {
  scenariosHumainsDuPlan, estSurLePlan, sectionsCochees, scenariosAEcrire, memeSelection,
  clesAttendues, clesDe, nombreDeCles, bilanAffectation, vivierPropose,
  pretALancer, verdictDe, VERDICTS, NOMS_PLATEFORMES,
} from '../../agence/suivi/assets/js/campagne-plan.js';

let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };
const egal = (vu, attendu, m) => {
  const a = JSON.stringify(vu); const b = JSON.stringify(attendu);
  return a === b ? ok(m) : dire(`${m} · attendu ${b}, vu ${a}`);
};

const sc = (id, qui, plateformes) => ({ id, titre: `Scénario ${id}`, qui, plateformes, priorite: 'moyenne' });
const SECTIONS = [
  { id: 'connexion', titre: 'Connexion', plateformes: ['ios', 'android', 'web'], aspects: {
    fonctionnel: [sc('cx-1', 'humain', ['ios', 'android']), sc('cx-2', 'les-deux', ['web']), sc('cx-3', 'robot', ['ios'])],
    technique: [sc('cx-4', 'les-deux', [])], ux: [], securite: [] } },
  { id: 'taches', titre: 'Tâches', plateformes: ['ios'], aspects: {
    fonctionnel: [sc('ta-1', 'humain', [])], technique: [], ux: [], securite: [sc('ta-2', 'robot', ['web'])] } },
  { id: 'presentation', genre: 'presentation' },
];

console.log('\n== Les scénarios d\'humains du plan');
const H = scenariosHumainsDuPlan(SECTIONS);
egal(H.map((x) => x.id), ['cx-1', 'cx-2', 'cx-4', 'ta-1'], 'les robots seuls et la présentation sont laissés dehors');
egal(H.find((x) => x.id === 'cx-4').plateformes, ['ios', 'android', 'web'], 'sans plateforme, un scénario vaut sur celles de sa section');
egal(H.find((x) => x.id === 'ta-1').plateformes, ['ios'], 'et une section sur iPhone seul le garde sur iPhone');
egal(H.find((x) => x.id === 'ta-1').section, 'taches', 'chacun sait de quelle section il vient');

console.log('\n== B1 : modifier ne remet pas tous les scénarios');
const reduite = { id: 'c1', scenarios: ['ta-1'], plan: true };
egal([...sectionsCochees(reduite, H)], ['taches'], 'une campagne réduite rouvre sa seule section');
egal([...sectionsCochees(null, H)].sort(), ['connexion', 'taches'], 'une campagne neuve part sur toutes les sections');
egal(scenariosAEcrire({ fiche: reduite, touche: false, choisies: H.map((x) => x.id), avant: reduite.scenarios }), null, 'aucune case touchée : la sélection n\'est pas réécrite');
egal(scenariosAEcrire({ fiche: reduite, touche: true, choisies: ['ta-1'], avant: ['ta-1'] }), null, 'touchée puis remise pareil : pas réécrite non plus');
egal(scenariosAEcrire({ fiche: reduite, touche: true, choisies: ['ta-1', 'cx-1'], avant: ['ta-1'] }), ['ta-1', 'cx-1'], 'changée : la nouvelle sélection est écrite');
egal(scenariosAEcrire({ fiche: null, touche: false, choisies: ['cx-1'], avant: [] }), ['cx-1'], 'une campagne neuve écrit toujours la sienne');
egal(memeSelection(['a', 'b'], ['b', 'a']), true, 'l\'ordre ne compte pas');
egal(memeSelection(['a'], ['a', 'b']), false, 'un scénario de plus, si');
const ancienne = { id: 'c0', scenarios: ['DI-01', 'TA-03'] };
egal(estSurLePlan(ancienne, H), false, 'une campagne sur l\'ancienne bibliothèque est reconnue');
egal(estSurLePlan(reduite, H), true, 'une campagne du plan aussi');
egal(sectionsCochees(ancienne, H).size, 0, 'l\'ancienne ne coche aucune section');
egal(scenariosAEcrire({ fiche: ancienne, touche: false, choisies: [], avant: ancienne.scenarios }), null, 'et, sans case touchée, elle garde ses 2 scénarios');

console.log('\n== Les clés attendues');
const att = clesAttendues(H);
egal(att.get('cx-1__ios'), 2, '« humain » seul : deux testeurs');
egal(att.get('cx-2__web'), 1, '« les-deux » : un testeur');
egal(att.size, 2 + 1 + 3 + 1, 'une clé par scénario et par plateforme');

console.log('\n== B2 : aucune clé oubliée ne passe inaperçue');
const T = [{ id: 'u1', telephone: 'ios', web: true }, { id: 'u2', telephone: 'android', web: true }, { id: 'u3', telephone: '', web: true }];
const juste = {
  u1: { telephone: 'ios', web: true, cles: ['cx-1__ios', 'cx-4__ios', 'ta-1__ios', 'cx-2__web'], vague: 1 },
  u2: { telephone: 'android', web: true, cles: ['cx-1__android', 'cx-4__android', 'cx-4__web'], vague: 1 },
  u3: { telephone: '', web: true, cles: [], vague: 2 },
};
let b = bilanAffectation(juste, H, T);
egal(b.incompletes.sort(), ['cx-1__android', 'cx-1__ios', 'ta-1__ios'], 'trois clés « humain » n\'ont qu\'un testeur');
egal(b.oubliees, [], 'aucune clé oubliée');
egal(b.enTrop, [], 'aucune en trop');
const sansWeb = { ...juste, u1: { ...juste.u1, cles: juste.u1.cles.filter((k) => k !== 'cx-2__web') } };
b = bilanAffectation(sansWeb, H, T);
egal(b.oubliees, ['cx-2__web'], 'un scénario web que personne n\'a est « oublié » (le défaut B2)');
const doublon = { ...juste, u3: { telephone: '', web: true, cles: ['cx-2__web', 'zz-9__web', 'cx-1__ios'] } };
b = bilanAffectation(doublon, H, T);
egal(b.enTrop.sort(), ['cx-2__web', 'zz-9__web'].sort(), 'une clé inconnue et une clé « les-deux » donnée deux fois sont en trop');
egal(b.horsSysteme, ['u3:cx-1__ios'], 'une clé iPhone chez un testeur sans téléphone est hors système');

console.log('\n== Les deux formes d\'affectation');
egal(clesDe(['DI-01', 'TA-03']), ['DI-01', 'TA-03'], 'une affectation d\'avant (liste) se lit');
egal(clesDe({ cles: ['cx-1__ios'] }), ['cx-1__ios'], 'la nouvelle aussi');
egal(clesDe(undefined), [], 'rien, c\'est rien');
egal(nombreDeCles(juste), 7, 'on compte les passages, toutes formes confondues');

console.log('\n== Le vivier proposé');
const vivier = [{ id: 'a', projets: ['autre'] }, { id: 'b', projets: ['p1'], actif: false }, { id: 'c', projets: ['p1'] }];
egal(vivierPropose(vivier, 'p1').map((t) => t.id), ['c', 'a'], 'les retirés sont dehors, ceux du projet viennent d\'abord');
egal(vivierPropose(vivier, 'p1', ['b']).map((t) => t.id), ['b', 'c', 'a'], 'sauf un retiré déjà dans la campagne, qu\'on ne fait pas disparaître');

console.log('\n== Prête à lancer');
const base = { scenarios: H.map((x) => x.id), plan: true, testeurs: ['u1', 'u2', 'u3'], affectation: {
  u1: { telephone: 'ios', web: true, cles: ['cx-1__ios', 'cx-4__ios', 'ta-1__ios', 'cx-2__web'] },
  u2: { telephone: 'android', web: true, cles: ['cx-1__android', 'cx-4__android', 'cx-4__web'] },
}, installation: { ios: 'https://testflight.apple.com/join/X', android: 'https://play.google.com/x' }, application: 'Atelier' };
const tout = (c) => pretALancer(c, { humains: H, testeurs: T }).map((x) => `${x.cle}:${x.ok}`);
egal(tout(base), ['scenarios:true', 'repartition:true', 'installation:true', 'presentation:true'], 'tout est vrai : elle peut partir');
egal(tout({ ...base, affectation: {} }).includes('repartition:false'), true, 'sans affectation, non');
egal(tout({ ...base, affectation: sansWeb }).includes('repartition:false'), true, 'avec une clé oubliée, non');
egal(tout({ ...base, affectation: { ...base.affectation, u3: { telephone: '', web: true, cles: ['cx-1__ios'] } } }).includes('repartition:false'), true, 'une clé iPhone chez un testeur sans téléphone, non');
egal(tout({ ...base, installation: { ios: 'https://x' } }).includes('installation:false'), true, 'un testeur Android sans lien Android, non');
egal(tout({ ...base, application: ' ' }).includes('presentation:false'), true, 'sans nom d\'application, non');
egal(tout({ ...base, scenarios: ['DI-01'], plan: false }).includes('scenarios:false'), true, 'une campagne de l\'ancienne bibliothèque, non');

console.log('\n== Les mots');
egal([verdictDe('ok'), verdictDe('ko'), verdictDe('na')], ['reussi', 'echec', 'sans-objet'], 'les anciens verdicts se lisent');
egal([verdictDe('reussi'), verdictDe('echec'), verdictDe('sans-objet')], ['reussi', 'echec', 'sans-objet'], 'les nouveaux aussi');
egal(Object.values(VERDICTS).map((x) => x.libelle), ['Réussi', 'Échec', 'Sans objet'], 'Réussi, Échec, Sans objet');
egal(Object.values(NOMS_PLATEFORMES), ['iPhone', 'Android', 'Web'], 'iPhone, Android, Web');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
