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
  tableauPlan, verdictScenarioPlan, pireEtat,
  tableauHumainPlan, verdictHumainPlan, pireHumain,
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

console.log('\n== Le tableau des robots rangé par le plan');
{
  egal(pireEtat(['ok', 'casse', 'fragile']), 'casse', 'le pire l emporte : cassé');
  egal(pireEtat(['ok', 'fragile']), 'fragile', 'un instable passe devant un vert');
  egal(pireEtat(['ok', 'jamais']), 'jamais', 'un jamais lancé passe devant un vert');
  egal(pireEtat(['ok', 'aecrire']), 'aecrire', 'une plateforme sans test passe devant un vert');
  egal(pireEtat([]), 'aecrire', 'rien : à écrire');
  egal(verdictParcours({ etat: 'rouge', defautConnu: true }), 'connu', 'un rouge sur un défaut connu : défaut connu, pas cassé');
  egal(verdictParcours({ etat: 'rouge', dernier: { defautConnu: true } }), 'connu', 'la marque peut aussi venir du dernier résultat');
  egal(verdictParcours({ etat: 'vert', defautConnu: true }), 'ok', 'le défaut corrigé, le test au vert : réussi');
  egal(verdictParcours({ etat: 'rouge' }), 'casse', 'un rouge sans marque reste cassé');
  egal(pireEtat(['connu', 'casse']), 'casse', 'un vrai cassé passe devant un défaut connu');
  egal(pireEtat(['connu', 'fragile']), 'fragile', 'un instable passe devant un défaut connu');
  egal(pireEtat(['ok', 'connu', 'jamais']), 'connu', 'un défaut connu passe devant un jamais lancé et un vert');
  egal(tableauPlan({ sections: [], regles: [{ ref: 'RG', etat: 'rouge', defautConnu: true }] }).compte.connu, 1, 'une règle sur un défaut connu se compte comme telle');
  const pIos = { ref: 'TA-01', plateformes: ['ios'], etat: 'vert' };
  const pAnd = { ref: 'TA-02', plateformes: ['android'], etat: 'rouge' };
  const pWeb = { ref: 'TW-01', plateformes: ['web'], etat: 'instable' };
  const sc = { plateformes: ['ios', 'android', 'web'] };
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [pIos, pAnd, pWeb] }).etat, 'casse', 'toutes plateformes : le pire des plateformes');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [pIos, pAnd, pWeb], plateforme: 'ios' }).etat, 'ok', 'sur iOS : le résultat d iOS');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [pIos, pAnd, pWeb], plateforme: 'web' }).etat, 'fragile', 'sur le web : le résultat du web');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [pIos] }).etat, 'aecrire', 'vert sur iOS, rien ailleurs : à écrire tant qu une plateforme manque');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [pIos], plateforme: 'android' }).etat, 'aecrire', 'sur Android sans test : à écrire');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [] }).etat, 'aecrire', 'aucun test rattaché : à écrire');
  egal(verdictScenarioPlan({ scenario: sc, rattaches: [{ ref: 'X', plateformes: [], etat: 'vert' }] }).etat, 'ok', 'un test sans plateforme déclarée vaut partout');
  egal(verdictScenarioPlan({ scenario: { plateformes: ['ios'] }, rattaches: [pIos, { ref: 'TA-03', plateformes: ['ios'], etat: 'ecrit' }] }).etat, 'jamais', 'deux tests sur iOS, un jamais lancé : jamais lancé');

  const sections = [
    { id: 'taches', titre: 'Tâches', groupe: 'fonctionnalites', aspects: {
      fonctionnel: [
        { id: 'taches-f-001', qui: 'robot', plateformes: ['ios'], parcours: ['TA-01'] },
        { id: 'taches-f-002', qui: 'humain', plateformes: ['ios'], parcours: ['TA-09'] },
        { id: 'taches-f-003', qui: 'les-deux', plateformes: ['ios', 'android'], parcours: ['TA-01', 'TA-02'] },
      ],
      technique: [{ id: 'taches-t-001', qui: 'les-deux', plateformes: ['web'], parcours: [] }],
      ux: [], securite: [] } },
    { id: 'compte', titre: 'Compte', groupe: 'demarrage', aspects: { fonctionnel: [{ id: 'compte-f-001', qui: 'humain', plateformes: ['ios'] }], technique: [], ux: [], securite: [] } },
  ];
  const parcours = [pIos, pAnd, { ref: 'TA-09', plateformes: ['ios'], etat: 'vert' }, { ref: 'HP-01', plateformes: ['web'], etat: 'vert' }, { ref: 'OFF', etat: 'rouge', actif: false }];
  const t = tableauPlan({ sections, parcours, regles: [{ ref: 'RG-1', etat: 'vert' }] });
  egal(t.familles.map((f) => f.libelle).join(' | '), 'Tâches | Compte | Règles métier | Hors plan', 'une carte par section, dans l ordre donné, puis les règles et le hors plan');
  egal(t.familles[0].cases.map((c) => c.ref).join(','), 'taches-f-001,taches-f-003,taches-t-001', 'une case par scénario robot ou humain et robot, aucune pour un humain seul');
  egal(t.familles[1].cases.length, 0, 'une section sans scénario pour les robots garde sa carte, vide');
  egal(t.familles[0].cases.map((c) => c.etat).join(','), 'ok,casse,aecrire', 'le statut vient des tests rattachés, le pire l emporte');
  egal(t.familles[3].cases.map((c) => c.ref).sort().join(','), 'HP-01,TA-09', 'hors plan : les tests actifs que ne vérifie aucun scénario robot');
  egal(t.total, 4, 'le compte : trois scénarios et une règle, sans le hors plan');
  egal(t.compte.ok, 2, 'deux réussis (un scénario, une règle)');
  egal(`${t.qui.robot}/${t.qui['les-deux']}`, '1/2', 'un robot seul, deux humain et robot');
  const ios = tableauPlan({ sections, parcours, plateforme: 'ios' });
  egal(ios.familles[0].cases.map((c) => `${c.ref}=${c.etat}`).join(','), 'taches-f-001=ok,taches-f-003=ok', 'sur iOS : les cases d iOS, le résultat d iOS');
  egal(ios.familles.find((f) => f.horsPlan).cases.map((c) => c.ref).join(','), 'TA-09', 'le hors plan suit le filtre de plateforme');
}

console.log('\n== Le tableau des humains rangé par le plan');
{
  egal(pireHumain(['ok', 'casse', 'fragile']), 'casse', 'le pire l emporte : cassé');
  egal(pireHumain(['ok', 'fragile']), 'fragile', 'un fragile passe devant un réussi');
  egal(pireHumain(['ok', 'cours']), 'cours', 'un KO corrigé à rejouer passe devant un réussi');
  egal(pireHumain(['na', 'ok']), 'ok', 'un réussi et un sans objet : réussi');
  egal(pireHumain([]), 'nonteste', 'rien : pas encore testé');

  const H = (scenario, testeur, plateforme, resultat, extra = {}) => ({ scenario, testeur, plateforme, resultat, ...extra });
  const sc = { id: 'taches-f-001', plateformes: ['ios', 'android'], refs: ['TA-01', 'TA-02'] };
  const vh = (passages, anomalies = [], plateforme = '', s = sc) => verdictHumainPlan({ scenario: s, passages, anomalies, plateforme });
  egal(vh([]).etat, 'nonteste', 'aucun passage : pas encore testé');
  egal(vh([H('TA-99', 'u1', 'ios', 'ok')]).etat, 'nonteste', 'un passage sur une référence qu il ne cite pas ne compte pas');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u2', 'android', 'ok')]).etat, 'ok', 'hérité par refs : réussi sur ses deux plateformes');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok')]).etat, 'cours', 'réussi sur iOS, rien sur Android : en cours, pas réussi');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok')]).partiel, true, 'et marqué partiel');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok')], [], 'ios').etat, 'ok', 'filtré sur iOS : réussi');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok')], [], 'android').etat, 'nonteste', 'filtré sur Android : pas encore testé');
  egal(vh([H('taches-f-001', 'u1', 'ios', 'ok'), H('taches-f-001', 'u2', 'android', 'ok')]).etat, 'ok', 'par l identifiant du plan (la répartition de demain) : réussi');
  egal(vh([H('taches-f-001', 'u1', 'ios', 'ko')]).etat, 'fragile', 'par l identifiant du plan, un KO isolé : fragile, même sans l autre plateforme');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u3', 'android', 'ok'), H('TA-02', 'u2', 'android', 'ko'), H('TA-02', 'u4', 'android', 'ko')]).etat, 'casse', 'deux origines, l une cassée sur Android : le pire l emporte');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u3', 'android', 'ok'), H('TA-02', 'u2', 'android', 'ko'), H('TA-02', 'u4', 'android', 'ko')], [], 'ios').etat, 'ok', 'le même, filtré sur iOS : réussi');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('taches-f-001', 'u2', 'android', 'ko')]).etat, 'fragile', 'une référence et l identifiant du plan se cumulent, le pire l emporte');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u2', 'android', 'ok')], [A({ scenario: 'TA-02', gravite: 'critique', plateformes: ['android'] })]).etat, 'casse', 'une anomalie critique ouverte sur une référence citée : cassé');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u2', 'android', 'ok')], [A({ scenario: 'TA-02', gravite: 'critique', plateformes: ['android'] })], 'ios').etat, 'ok', 'cette anomalie vue sur Android ne peint pas iOS');
  egal(vh([H('TA-01', 'u1', 'ios', 'ko', { aRevoir: true }), H('TA-01', 'u2', 'android', 'ok')]).etat, 'cours', 'un KO corrigé à rejouer : en cours');
  egal(vh([H('TA-01', 'u1', 'ios', 'ko'), H('TA-01', 'u2', 'android', 'ko')]).etat, 'casse', 'deux KO, un sur iOS et un sur Android : cassé, comme dans la grille d avant');
  egal(vh([H('TA-01', 'u1', 'ios', 'ko'), H('TA-01', 'u2', 'android', 'ko')], [], 'ios').etat, 'fragile', 'filtré sur iOS : un échec sur un, fragile');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok')]).manquent.join(','), 'android', 'il dit quelle plateforme attend encore un humain');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('taches-f-001', 'u2', 'ios', 'ko')]).origines.map((o) => `${o.cle}=${o.etat}`).join(','), 'TA-01=ok,taches-f-001=fragile', 'chaque origine garde son verdict');
  egal(vh([H('TA-01', 'u1', 'ios', 'ko', { aRevoir: true }), H('TA-01', 'u2', 'android', 'ok')]).revoir, true, 'et marqué à revérifier');
  egal(vh([H('TA-01', 'u1', 'ios', 'na'), H('TA-01', 'u2', 'android', 'na')]).etat, 'na', 'sans objet partout : sans objet');
  egal(vh([H('TA-01', 'u1', 'web', 'ok')]).parPlateforme.map((p) => `${p.plateforme}=${p.etat}`).join(','), 'ios=nonteste,android=nonteste,web=ok', 'passé sur une plateforme qu il ne déclare pas : le résultat ne se perd pas');
  egal(vh([H('TA-01', 'u1', 'ios', 'ok'), H('taches-f-001', 'u2', 'ios', 'ok')]).passages.map((p) => p.origine).join(','), 'TA-01,taches-f-001', 'chaque passage garde son origine');
  egal(vh([], [], '', { id: 'x', plateformes: [], refs: [] }).etat, 'nonteste', 'sans plateforme ni référence : pas encore testé');

  const sections = [
    { id: 'taches', titre: 'Tâches', groupe: 'fonctionnalites', aspects: {
      fonctionnel: [
        { id: 'taches-f-001', qui: 'les-deux', plateformes: ['ios', 'android'], refs: ['TA-01'] },
        { id: 'taches-f-002', qui: 'robot', plateformes: ['ios'], refs: ['TA-09'] },
        { id: 'taches-f-003', qui: 'humain', plateformes: ['web'], refs: [] },
      ],
      technique: [], ux: [{ id: 'taches-u-001', qui: 'humain', plateformes: ['ios'], refs: ['TA-02'] }], securite: [] } },
    { id: 'robots', titre: 'Robots', groupe: 'transverse', aspects: { fonctionnel: [{ id: 'robots-f-001', qui: 'robot', plateformes: ['web'], refs: ['TA-03'] }], technique: [], ux: [], securite: [] } },
  ];
  const biblio = [{ ref: 'TA-01', titre: 'Créer', ordre: 1 }, { ref: 'TA-02', titre: 'Voir', ordre: 2 }, { ref: 'TA-09', titre: 'Robot', ordre: 9 }, { ref: 'HP-01', titre: 'Hors', ordre: 20 }];
  const campagne = { id: 'c1', scenarios: ['TA-01', 'TA-02', 'TA-09', 'HP-01'], affectation: { u1: ['TA-01', 'TA-09', 'HP-01'], u2: ['TA-01', 'TA-02'] } };
  const passages = [
    H('TA-01', 'u1', 'ios', 'ok'), H('TA-01', 'u2', 'android', 'ok'),
    H('TA-09', 'u1', 'ios', 'ko'),
    H('HP-01', 'u1', 'ios', 'ok'),
    H('taches-f-003', 'u2', 'web', 'ok'),
  ];
  const anomalies = [A({ scenario: 'TA-09', temoins: [{ campagne: 'c1' }] }), A({ scenario: 'TA-02', gravite: 'critique', temoins: [{ campagne: 'ancienne' }] })];
  const t = tableauHumainPlan({ sections, scenarios: biblio, campagne, passages, anomalies });
  egal(t.familles.map((f) => f.libelle).join(' | '), 'Tâches | Robots | Hors plan', 'une carte par section, dans l ordre donné, puis le hors plan');
  egal(t.familles[0].cases.map((c) => c.ref).join(','), 'taches-f-001,taches-f-003,taches-u-001', 'une case par scénario humain ou humain et robot, aucune pour un robot seul');
  egal(t.familles[1].cases.length, 0, 'une section sans scénario pour les humains garde sa carte, vide');
  egal(t.familles[0].cases.map((c) => c.etat).join(','), 'ok,ok,nonteste', 'hérité par refs, par l identifiant du plan, et pas encore testé');
  egal(t.familles[0].cases[2].anomalies.length, 0, 'une anomalie d une campagne passée ne peint pas celle-ci');
  egal(t.familles[2].cases.map((c) => `${c.ref}=${c.etat}`).join(','), 'TA-09=fragile,HP-01=ok', 'hors plan : les références testées que ne reprend aucun scénario humain, avec leur couleur d avant');
  egal(t.total, 3, 'le compte : les trois cases humaines, sans le hors plan');
  egal(`${t.faits}/${t.attendus}`, '2/3', 'deux vérifications faites sur trois');
  egal(`${t.compte.ok}/${t.compte.nonteste}`, '2/1', 'la légende recompte les cases du plan');
  egal(`${t.qui.humain}/${t.qui['les-deux']}`, '2/1', 'deux humain seul, un humain et robot');
  const web = tableauHumainPlan({ sections, scenarios: biblio, campagne, passages, anomalies, plateforme: 'web' });
  egal(web.familles[0].cases.map((c) => `${c.ref}=${c.etat}`).join(','), 'taches-f-003=ok', 'sur le web : les cases du web, le résultat du web');
  egal(web.familles.some((f) => f.horsPlan), false, 'le hors plan suit le filtre de plateforme');
  const sansCampagne = tableauHumainPlan({ sections, scenarios: biblio, campagne: null, passages, anomalies });
  egal(`${sansCampagne.total}/${sansCampagne.compte.nonteste}/${sansCampagne.familles.length}`, '3/3/2', 'sans campagne : les cases du plan, toutes pas encore testées, ni hors plan');
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
