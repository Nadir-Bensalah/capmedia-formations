/* ==========================================================================
   CAPMEDIA COCKPIT · les chiffres de la fiche de suivi d'un testeur

   Les connexions, le temps passé, l'invitation, l'avancement : on charge
   le VRAI fichier du navigateur (agence/suivi/assets/js/suivi-testeur.js,
   qui n'importe que verdicts.js), jamais une copie.

     node fonctions-suivi/outils/suivi-testeur.test.mjs
   ========================================================================== */

import {
  dureeSession, connexionsDe, bilanConnexions, bilanInvitation, avancementCampagne,
  totalAvancement, estEnLigne, dureeEnClair, enMs, PAUSE_CONNEXION_MS,
} from '../../agence/suivi/assets/js/suivi-testeur.js';

let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };
const egal = (vu, attendu, m) => (JSON.stringify(vu) === JSON.stringify(attendu) ? ok(m) : dire(`${m} · attendu « ${JSON.stringify(attendu)} », vu « ${JSON.stringify(vu)} »`));

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 8, 8, 0, 0);
const S = (debutMin, finMin, extra = {}) => ({ debut: new Date(T0 + debutMin * MIN), vu: new Date(T0 + finMin * MIN), ...extra });
/* La forme d'un Timestamp de la base, sans la bibliothèque. */
const TS = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });

console.log('\n== Une session');
egal(dureeSession(S(0, 25)), 25 * MIN, 'vu moins debut : 25 min');
egal(dureeSession(S(10, 5)), 0, 'un vu avant le début ne fait pas une durée négative');
egal(dureeSession({ debut: new Date(T0) }), 0, 'sans vu (jamais confirmée) : 0');
egal(dureeSession({ vu: new Date(T0) }), 0, 'sans début : 0');
egal(dureeSession({ debut: TS(T0), vu: TS(T0 + 90000) }), 90000, 'lit les horodatages de la base');
egal(enMs('2026-10-08T08:00:00Z'), T0, 'et le texte');

console.log('\n== Les connexions');
egal(connexionsDe([]).length, 0, 'aucune session, aucune connexion');
{
  /* Un rechargement : la session suivante commence quand l'autre s'arrête. */
  const c = connexionsDe([S(0, 20), S(20, 50)]);
  egal(c.length, 1, 'un rechargement ne fait pas deux connexions');
  egal(c[0].duree, 50 * MIN, 'et le temps se suit : 50 min');
  egal(c[0].sessions, 2, 'deux sessions dans la connexion');
}
{
  /* Deux onglets ouverts ensemble : le chevauchement ne compte qu'une fois. */
  const c = connexionsDe([S(0, 40), S(10, 30)]);
  egal(c.length, 1, 'deux onglets : une connexion');
  egal(c[0].duree, 40 * MIN, 'chevauchement compté une fois : 40 min, pas 60');
}
{
  const c = connexionsDe([S(0, 40), S(30, 70)]);
  egal(c[0].duree, 70 * MIN, 'chevauchement partiel : 70 min');
}
{
  /* Une pause de 29 min : la même connexion, mais la pause n'est pas du temps passé. */
  const c = connexionsDe([S(0, 10), S(39, 49)]);
  egal(c.length, 1, '29 min d\'écart : la même connexion');
  egal(c[0].duree, 20 * MIN, 'sans compter la pause : 20 min');
  egal(c[0].fin - c[0].debut, 49 * MIN, 'de 8 h 00 à 8 h 49');
}
{
  const c = connexionsDe([S(0, 10), S(40, 50)]);
  egal(c.length, 2, 'une demi-heure pile d\'écart : deux connexions');
  egal(c.map((x) => x.duree), [10 * MIN, 10 * MIN], 'dix minutes chacune');
  egal(c[0].debut > c[1].debut, true, 'la plus récente d\'abord');
}
{
  const c = connexionsDe([S(0, 10), S(40, 50)], 31 * MIN);
  egal(c.length, 1, 'la pause se règle');
}
{
  /* Dans le désordre, comme la base les rend (debut décroissant). */
  const c = connexionsDe([S(300, 330), S(0, 15), S(15, 20)]);
  egal(c.length, 2, 'des sessions dans le désordre se regroupent quand même');
  egal(c[1].duree, 20 * MIN, 'la plus ancienne : 20 min');
}
{
  const c = connexionsDe([S(0, 10, { plateforme: 'web' }), S(5, 12, { plateforme: 'ios' }), S(8, 9, { plateforme: 'web' })]);
  egal(c[0].plateformes, ['web', 'ios'], 'les plateformes de la connexion, sans doublon');
  egal(c[0].duree, 12 * MIN, 'une session contenue dans une autre n\'ajoute rien');
}
egal(connexionsDe([{ vu: new Date(T0) }, S(0, 5)]).length, 1, 'une session sans début est ignorée');
egal(connexionsDe([{ vu: new Date(T0 + 600 * MIN) }, S(0, 5)])[0].duree, 5 * MIN, 'même quand son vu est loin : elle n\'ajoute rien');
{
  /* La fin d'une connexion est la plus tardive de ses sessions, pas la dernière lue. */
  const c = connexionsDe([S(0, 40), S(10, 30), S(69, 75)]);
  egal(c.length, 1, 'une session contenue ne raccourcit pas la connexion : 29 min après sa vraie fin, c\'est la même');
  egal(c[0].duree, 46 * MIN, 'et elle dure 40 + 6 min');
}
egal(connexionsDe([{ debut: new Date(T0) }])[0].duree, 0, 'une session sans vu compte 0 min, mais compte comme connexion');

console.log('\n== Le bilan des connexions');
{
  const b = bilanConnexions([S(0, 20), S(20, 50), S(120, 135), S(1440, 1500)]);
  egal(b.nombre, 3, 'trois connexions');
  egal(b.total, (50 + 15 + 60) * MIN, 'le temps total : 2 h 05');
  egal(dureeEnClair(b.total), '2 h 05', 'dit « 2 h 05 »');
  egal(b.premiere, T0, 'la première, au début de la plus ancienne');
  egal(b.derniere, T0 + 1500 * MIN, 'la dernière, à la fin de la plus récente');
}
egal(bilanConnexions([S(0, 10), S(39, 49)]).total, 20 * MIN, 'le total ne compte pas les pauses de moins d\'une demi-heure');
egal(bilanConnexions([]), { nombre: 0, total: 0, premiere: 0, derniere: 0, liste: [] }, 'vide : des zéros, jamais undefined');
egal(dureeEnClair(0), '0 min', '« 0 min »');
egal(dureeEnClair(59 * MIN + 29000), '59 min', '« 59 min »');
egal(dureeEnClair(60 * MIN), '1 h 00', '« 1 h 00 »');
egal(dureeEnClair(59 * MIN + 31000), '1 h 00', 'arrondi à la minute la plus proche');

console.log('\n== En ligne');
egal(estEnLigne({ enLigne: true, vu: new Date(T0) }, T0 + 60000), true, 'signe il y a 60 s : en ligne');
egal(estEnLigne({ enLigne: true, vu: new Date(T0) }, T0 + 76000), false, 'il y a 76 s : plus là');
egal(estEnLigne({ enLigne: false, vu: new Date(T0) }, T0 + 1000), false, 'page cachée : pas en ligne');
egal(estEnLigne(null), false, 'jamais venu');

console.log('\n== L\'invitation');
{
  const b = bilanInvitation({ invitations: [
    { cree: T0, envoyee: T0, acceptee: 0, etat: 'revoquee' },
    { cree: T0 + 86400000, envoyee: T0 + 86400000, acceptee: T0 + 90000000, etat: 'acceptee' },
  ] });
  egal(b.envoyee, T0 + 86400000, 'la dernière envoyée');
  egal(b.premierEnvoi, T0, 'la première');
  egal(b.envois, 2, 'deux envois');
  egal(b.acceptee, true, 'acceptée');
  egal(b.premiereConnexion, T0 + 90000000, 'la première connexion, à l\'acceptation');
  egal(b.etat, 'acceptee', 'l\'état de la dernière');
}
{
  const b = bilanInvitation({ invitations: [{ cree: T0, envoyee: T0, acceptee: 0, etat: 'envoyee' }] });
  egal([b.acceptee, b.premiereConnexion], [false, 0], 'envoyée, jamais acceptée');
}
{
  /* Un testeur inscrit avant les invitations : ses sessions disent qu'il est venu. */
  const b = bilanInvitation({ invitations: [], sessions: [S(60, 70), S(0, 10)], testeur: { ficheValidee: new Date(T0 + 5 * MIN) } });
  egal([b.envois, b.envoyee, b.acceptee, b.premiereConnexion], [0, 0, true, T0], 'sans invitation, venu quand même : la plus ancienne trace');
}
{
  const b = bilanInvitation({ invitations: [{ envoyee: T0 + 10 * MIN, acceptee: T0 + 30 * MIN }], sessions: [S(20, 25)] });
  egal(b.premiereConnexion, T0 + 20 * MIN, 'la première connexion est la plus ancienne trace, pas la première trouvée');
}
egal(bilanInvitation().acceptee, false, 'rien : pas acceptée');

console.log('\n== L\'avancement, sur le plan');
const U = 'u1';
const campagnePlan = {
  plan: true,
  affectation: { [U]: { cles: ['DI-01__ios', 'DI-02__ios', 'DI-03__web', 'DI-04__web'] }, u2: { cles: ['DI-01__android'] } },
  termines: {}, fins: { [U]: TS(T0 + 7 * 86400000) },
};
const passages = [
  { testeur: U, scenario: 'DI-01', plateforme: 'ios', resultat: 'reussi' },
  { testeur: U, scenario: 'DI-02', plateforme: 'ios', resultat: 'echec' },
  { testeur: U, scenario: 'DI-03', plateforme: 'web', resultat: 'echec', aRevoir: true },
  { testeur: U, scenario: 'ZZ-99', plateforme: 'web', resultat: 'echec' },
  { testeur: 'u2', scenario: 'DI-01', plateforme: 'android', resultat: 'echec' },
];
{
  const a = avancementCampagne({ campagne: campagnePlan, uid: U, passages, remarques: [{ testeur: U }, { testeur: 'u2' }, { testeur: U }], appreciation: { avisRendus: { avant: true }, remarques: [{ texte: 'ancienne' }] } });
  egal(a.prevus, 4, 'quatre tests prévus (ses clés)');
  egal(a.faits, 2, 'deux faits : l\'échec corrigé à rejouer ne compte plus');
  egal(a.echecs, 1, 'un échec ouvert : ni celui d\'un autre, ni celui hors de ses clés');
  egal(a.aRejouer, 1, 'un à rejouer');
  egal(a.remarques, 3, 'ses deux remarques et l\'ancienne, pas celle d\'un autre');
  egal([a.avisAvant, a.avisApres], [true, false], 'première impression rendue, avis final non');
  egal(a.termine, 0, 'pas terminé');
  egal(a.fin, T0 + 7 * 86400000, 'accès jusqu\'au jour dit');
}
{
  const a = avancementCampagne({ campagne: { ...campagnePlan, termines: { [U]: TS(T0) } }, uid: U, passages: [], appreciation: { avisRendus: { avant: true, apres: true } } });
  egal([a.termine, a.avisApres, a.faits], [T0, true, 0], 'terminé selon la campagne, avis final rendu');
}
{
  const a = avancementCampagne({ campagne: campagnePlan, uid: U, passages: [], appreciation: { termine: TS(T0 + 1000) } });
  egal(a.termine, T0 + 1000, 'terminé selon l\'appréciation');
}
{
  const a = avancementCampagne({ campagne: { plan: true, affectation: { [U]: { cles: ['DI-01__ios', 'DI-01__ios', 'mauvaise'] } } }, uid: U });
  egal(a.prevus, 1, 'une clé en double ou mal formée ne fait pas un test de plus');
}

console.log('\n== L\'avancement, sur l\'ancienne bibliothèque');
{
  const ancienne = { affectation: { [U]: ['S-01', 'S-02', 'S-03'] } };
  const a = avancementCampagne({ campagne: ancienne, uid: U, passages: [
    { testeur: U, scenario: 'S-01', resultat: 'ok' }, { testeur: U, scenario: 'S-02', resultat: 'ko' }, { testeur: 'u2', scenario: 'S-01', resultat: 'ok' },
  ] });
  egal([a.prevus, a.faits, a.echecs], [3, 2, 1], 'trois prévus, deux faits, un échec (ok/ko d\'avant)');
}
egal(avancementCampagne({ campagne: {}, uid: U }), { prevus: 0, faits: 0, echecs: 0, aRejouer: 0, remarques: 0, avisAvant: false, avisApres: false, termine: 0, fin: 0 }, 'une campagne vide : des zéros');

console.log('\n== Le total');
egal(totalAvancement([{ prevus: 4, faits: 2, echecs: 1, remarques: 3 }, { prevus: 10, faits: 10, echecs: 0, remarques: 0 }]), { prevus: 14, faits: 12, echecs: 1, remarques: 3 }, 'les campagnes s\'additionnent');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'TOUT EST VERT'} · PAUSE ${PAUSE_CONNEXION_MS / MIN} min`);
process.exit(echecs ? 1 : 0);
