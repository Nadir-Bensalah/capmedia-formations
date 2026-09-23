/* ==========================================================================
   CAPMEDIA CLIENT HUB · les verdicts du tableau des tests

   La couleur d'une case est la seule chose que Nadir et le client
   regardent d'un coup d'œil : une règle fausse ici se voit sur cent
   soixante-treize cases à la fois. On charge le VRAI fichier du
   navigateur (il n'importe rien), jamais une copie.

   Chaque ligne de la règle a son cas, et chaque seuil son cas limite :
   1 sur 1, 1 sur 2, 2 sur 2, 2 sur 6, 3 sur 6, le socle fait sur un seul
   système.

     node fonctions-suivi/outils/verdicts.test.mjs
   ========================================================================== */

import {
  verdictScenario, verdictTesteur, verdictParcours, tableauHumain,
  tableauTesteur, tableauMachine, rythme, anomalieDeLaCampagne,
} from '../../agence/suivi/assets/js/verdicts.js';

let echecs = 0;
const ok = (m) => console.log(`  ok     ${m}`);
const dire = (m) => { echecs += 1; console.log(`  ÉCART  ${m}`); };
const egal = (vu, attendu, m) => (vu === attendu ? ok(m) : dire(`${m} · attendu « ${attendu} », vu « ${vu} »`));

const P = (resultat, extra = {}) => ({ resultat, ...extra });
const A = (extra = {}) => ({ statut: 'nouvelle', gravite: 'important', ...extra });
const v = (attendus, passages, anomalies = []) => verdictScenario({ attendus, passages, anomalies }).etat;

console.log('\n== Sans échec');
egal(v(1, []), 'vide', 'rien de passé : à faire');
egal(v(0, []), 'trou', 'personne ne l a reçu : non affecté');
egal(v(2, [P('ok')]), 'cours', 'socle, iOS OK sans Android : en cours, pas réussi');
egal(v(2, [P('ok'), P('ok')]), 'ok', 'socle, les deux OK : réussi');
egal(v(1, [P('ok')]), 'ok', 'réparti, OK : réussi');
egal(v(2, [P('na'), P('na')]), 'na', 'tout sans objet : sans objet');
egal(v(2, [P('ok'), P('na')]), 'ok', 'un OK et un NA : réussi');
egal(v(2, [P('na')]), 'cours', 'un NA sur deux attendus : en cours');
egal(v(null, [P('ok')]), 'ok', 'filtre de plateforme : les passages faits font le compte');
egal(v(null, []), 'vide', 'filtre de plateforme sans passage : à faire');

console.log('\n== Le nombre décide tant que l anomalie n est pas qualifiée');
const nue = [A()];
egal(v(1, [P('ko')], nue), 'fragile', '1 sur 1 : fragile, un échec isolé peut venir du testeur');
egal(v(2, [P('ko'), P('ok')], nue), 'fragile', '1 sur 2 : fragile');
egal(v(2, [P('ko'), P('ko')], nue), 'casse', '2 sur 2 : cassé');
egal(v(6, [P('ko'), P('ko'), P('ok'), P('ok'), P('ok'), P('ok')], nue), 'fragile', '2 sur 6 : fragile');
egal(v(6, [P('ko'), P('ko'), P('ko'), P('ok'), P('ok'), P('ok')], nue), 'casse', '3 sur 6 : cassé');
egal(v(6, [P('ko'), P('ko')], nue), 'casse', '2 sur 2 faits, 4 encore attendus : cassé, la moitié se compte sur ce qui est fait');
egal(v(1, [P('ko')], []), 'fragile', 'un KO avant que le serveur ait posé l anomalie : déjà fragile');

console.log('\n== L équipe a qualifié : sa gravité l emporte sur le nombre');
egal(v(1, [P('ko')], [A({ gravite: 'critique' })]), 'casse', 'critique, un seul témoin : cassé');
egal(v(1, [P('ko')], [A({ gravite: 'bloquant', statut: 'confirmee' })]), 'casse', 'bloquant : cassé');
egal(v(2, [P('ko'), P('ko')], [A({ gravite: 'mineur' })]), 'fragile', 'mineur, deux sur deux : fragile, la qualification bat le comptage');
egal(v(2, [P('ko'), P('ko')], [A({ statut: 'confirmee' })]), 'fragile', 'important confirmé, deux sur deux : fragile');
egal(v(2, [P('ok'), P('ok')], [A({ gravite: 'critique' })]), 'casse', 'anomalie critique ouverte même si les passages sont OK : cassé');

console.log('\n== Régression, correction, sans suite');
egal(v(1, [P('ko')], [A({ retours: 1, gravite: 'mineur' })]), 'casse', 'un KO revenu après correction : cassé, même mineur');
const corr = verdictScenario({ attendus: 1, passages: [P('ko', { aRevoir: true })], anomalies: [A({ statut: 'corrigee' })] });
egal(corr.etat, 'cours', 'KO corrigé pas rejoué : en cours, pas réussi');
egal(corr.revoir, true, 'et marqué à revérifier');
const corr2 = verdictScenario({ attendus: 2, passages: [P('ko', { aRevoir: true }), P('ok')], anomalies: [A({ statut: 'corrigee' })] });
egal(corr2.etat, 'cours', 'socle : un OK et un KO corrigé non rejoué ne font pas un vert');
egal(v(1, [P('ko')], [A({ statut: 'corrigee' })]), 'cours', 'anomalie corrigée sans marque sur le passage : à rejouer quand même');
egal(v(1, [P('ok')], [A({ statut: 'corrigee' })]), 'ok', 'rejoué OK après correction : réussi');
egal(v(1, [P('ko')], [A({ statut: 'sans-suite' })]), 'ok', 'KO classé sans suite : ne compte plus comme échec');

console.log('\n== L anomalie d une autre campagne');
egal(anomalieDeLaCampagne({ temoins: [{ campagne: 'avant' }] }, 'celle-ci'), false, 'un témoin d une campagne passée ne peint pas la nouvelle');
egal(anomalieDeLaCampagne({ temoins: [{ campagne: 'avant' }, { campagne: 'celle-ci' }] }, 'celle-ci'), true, 'un témoin ici suffit');
egal(anomalieDeLaCampagne({ temoins: [] }, 'celle-ci'), true, 'posée par l équipe, sans témoin : compte');

console.log('\n== Le testeur');
egal(verdictTesteur(undefined), 'vide', 'pas passé : à faire, pas orange');
egal(verdictTesteur(P('ok')), 'ok', 'OK');
egal(verdictTesteur(P('ko')), 'ko', 'KO : échec signalé');
egal(verdictTesteur(P('ko', { aRevoir: true })), 'revoir', 'KO corrigé par l équipe : à rejouer');
egal(verdictTesteur(P('na')), 'na', 'NA');

console.log('\n== La machine');
egal(verdictParcours({ etat: 'vert' }), 'ok', 'vert');
egal(verdictParcours({ etat: 'rouge' }), 'casse', 'rouge');
egal(verdictParcours({ etat: 'instable' }), 'fragile', 'instable : orange');
egal(verdictParcours({ etat: 'vert', enCours: 'exec-1' }), 'tourne', 'en exécution prime sur le dernier verdict');
egal(verdictParcours({ etat: 'ecrit' }), 'jamais', 'écrit, jamais lancé');
egal(verdictParcours({ etat: 'a-ecrire' }), 'aecrire', 'à écrire');
egal(verdictParcours({ etat: 'suspendu' }), 'suspendu', 'suspendu');

console.log('\n== Le tableau d une campagne');
{
  const scenarios = [
    { ref: 'TA-01', bloc: 'taches', ordre: 1, titre: 'a' },
    { ref: 'TA-02', bloc: 'taches', ordre: 2, titre: 'b' },
    { ref: 'DI-01', bloc: 'dates-importantes', ordre: 3, titre: 'c' },
    { ref: 'DI-02', bloc: 'dates-importantes', ordre: 4, titre: 'd' },
    { ref: 'HORS', bloc: 'taches', ordre: 5, titre: 'hors campagne' },
  ];
  const campagne = { id: 'c1', scenarios: ['TA-01', 'TA-02', 'DI-01', 'DI-02'], affectation: { u1: ['TA-01', 'DI-01'], u2: ['TA-01'] } };
  const passages = [
    { scenario: 'TA-01', testeur: 'u1', plateforme: 'ios', resultat: 'ok' },
    { scenario: 'DI-01', testeur: 'u1', plateforme: 'ios', resultat: 'ko' },
  ];
  const anomalies = [{ scenario: 'DI-01', statut: 'nouvelle', gravite: 'important', temoins: [{ campagne: 'c1' }] }];
  const t = tableauHumain({ scenarios, campagne, passages, anomalies, blocs: { taches: { libelle: 'Tâches' } } });
  egal(t.familles.length, 2, 'deux familles');
  egal(t.familles[0].libelle, 'Tâches', 'dans l ordre du plan, avec leur libellé');
  egal(t.total, 4, 'le scénario hors campagne n a pas de case');
  egal(t.familles[0].cases[0].etat, 'cours', 'TA-01 : 1 passage sur 2 attendus');
  egal(t.familles[0].cases[1].etat, 'trou', 'TA-02 : personne ne l a reçu');
  egal(t.familles[1].cases[0].etat, 'fragile', 'DI-01 : un KO');
  egal(t.attendus, 3, '3 passages attendus');
  egal(t.faits, 2, '2 faits');
  const client = tableauHumain({ scenarios, campagne, passages, anomalies, trous: false });
  egal(t.familles[1].cases[1].etat, 'trou', 'DI-02 : personne ne l a reçu non plus');
  egal(client.total, 2, 'le client ne voit pas les deux trous d affectation');
  const ios = tableauHumain({ scenarios, campagne, passages, anomalies, plateforme: 'android' });
  egal(ios.familles[0].cases[0].etat, 'vide', 'filtré sur Android : le passage iOS ne compte pas');
  const anosIos = [{ scenario: 'DI-01', statut: 'nouvelle', gravite: 'important', plateformes: ['ios'], temoins: [{ campagne: 'c1' }] }];
  const and = tableauHumain({ scenarios, campagne, passages, anomalies: anosIos, plateforme: 'android' });
  egal(and.familles[1].cases[0].etat, 'vide', 'filtré sur Android : l anomalie vue sur iOS ne peint pas la case');
  const iosF = tableauHumain({ scenarios, campagne, passages, anomalies: anosIos, plateforme: 'ios' });
  egal(iosF.familles[1].cases[0].etat, 'fragile', 'filtré sur iOS : elle la peint');
}

console.log('\n== Le tableau d un testeur et celui de la machine');
{
  const t = tableauTesteur({ scenarios: [{ ref: 'A', bloc: 'x' }, { ref: 'B', bloc: 'x' }], passages: new Map([['A', { resultat: 'ok' }]]) });
  egal(t.faits, 1, 'un fait sur deux');
  egal(t.compte.vide, 1, 'un à faire');
  const m = tableauMachine({
    parcours: [{ ref: 'R-01', outil: 'maestro', scenarios: ['TA-01'], etat: 'vert' }, { ref: 'J-01', outil: 'jest', scenarios: [], etat: 'rouge' }, { ref: 'X', etat: 'vert', actif: false }],
    regles: [{ ref: 'RG-1', etat: 'vert' }],
    scenarios: [{ ref: 'TA-01', bloc: 'taches' }],
    blocs: { taches: { libelle: 'Tâches' } }, outils: { jest: { libelle: 'Jest' } },
  });
  egal(m.total, 3, 'le parcours inactif n a pas de case');
  egal(m.familles.map((f) => f.libelle).join(' | '), 'Tâches | Jest hors scénario | Règles métier', 'rangés par famille de scénario, puis par outil, puis les règles');
}

console.log('\n== Le rythme');
{
  const J = 86400000; const d = Date.UTC(2026, 9, 1);
  const r = rythme({ debut: d, fin: d + 13 * J, faits: 50, attendus: 255, maintenant: d + 4 * J + 1000 });
  egal(r && r.jour, 5, 'cinquième jour');
  egal(r && r.jours, 14, 'sur quatorze');
  egal(r && r.reste, 21, '50 en 5 jours, 205 restent : 21 jours au rythme actuel');
  egal(rythme({ debut: d, fin: d - J, faits: 0, attendus: 1 }), null, 'fin avant le début : rien, plutôt qu un chiffre faux');
  egal(rythme({ debut: d, fin: d + J, faits: 0, attendus: 1, maintenant: d - 2 * J }).avant, 2, 'avant le début : dans deux jours');
}

console.log(echecs ? `\n${echecs} ÉCART(S)` : '\nverdicts : tout est conforme');
process.exit(echecs ? 1 : 0);
