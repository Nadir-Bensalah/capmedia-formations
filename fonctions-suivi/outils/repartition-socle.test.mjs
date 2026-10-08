/* ==========================================================================
   CAPMEDIA TEST · la règle du socle (Nadir, 08/10/2026), à l'épreuve

   Une règle pure, donc éprouvable sans navigateur ni base. Le code éprouvé
   est celui de la page (repartition.js), importé tel quel. Tout ce qui est
   vérifié est recalculé ici, sans passer par le module :
   - le socle est fait par TOUS, chacun sur son téléphone et sur le web ;
   - personne ne dépasse le plafond ;
   - hors socle, chaque passage est fait une seule fois ;
   - la priorité est respectée : rien de plus bas n'est pris tant qu'un
     passage plus haut, faisable par quelqu'un qui avait de la place, est
     laissé ;
   - les retraits (rouge ou défaut connu chez les robots, bug connu, vert
     sur le web) sont appliqués, et jamais à un « humain » seul ;
   - le web est partagé entre les six ;
   - ce qui ne rentre pas est rendu (laissé aux robots), jamais perdu.
   Puis le vrai plan ForgeMe, s'il est sur la machine.

     node fonctions-suivi/outils/repartition-socle.test.mjs
   ========================================================================== */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const R = await import(path.join(ICI, '../../agence/suivi/assets/js/repartition.js'));
const CP = await import(path.join(ICI, '../../agence/suivi/assets/js/campagne-plan.js'));
const V = await import(path.join(ICI, '../../agence/suivi/assets/js/verdicts.js'));

let ok = 0; const ecarts = [];
const verifier = (condition, libelle, detail) => {
  if (condition) { ok += 1; console.log('  ok     ' + libelle); }
  else { ecarts.push(libelle); console.log(`  ÉCART  ${libelle}${detail ? ' · ' + detail : ''}`); }
};

const SIX = [
  { id: 't1', mobile: 'ios' }, { id: 't2', mobile: 'ios' }, { id: 't3', mobile: 'ios' },
  { id: 't4', mobile: 'android' }, { id: 't5', mobile: 'android' }, { id: 't6', mobile: 'android' },
];
const PRIO = { haute: 0, moyenne: 1, basse: 2 };
const peut = (tel, p) => p === 'web' || p === tel;

/* L'examen, indépendant du module. */
const examiner = (titre, scenarios, testeurs, r, { socle, plafond, retraits }) => {
  console.log(`\n== ${titre}`);
  const tel = Object.fromEntries(testeurs.map((t) => [t.id, t.mobile]));
  const sc = new Map(scenarios.map((s) => [s.id, s]));
  const attendus = new Map();
  scenarios.forEach((s) => { if (['humain', 'les-deux'].includes(s.qui)) [...new Set(s.plateformes || [])].forEach((p) => attendus.set(`${s.id}__${p}`, { s, p })); });
  const retires = new Set(retraits.keys());
  const porteurs = new Map();
  const fautes = { inconnue: [], plateforme: [], retiree: [], doublonTesteur: [] };
  Object.entries(r.affectation).forEach(([uid, a]) => {
    const vues = new Set();
    a.cles.forEach((k) => {
      const x = attendus.get(k);
      if (!x) { fautes.inconnue.push(k); return; }
      if (retires.has(k)) fautes.retiree.push(k);
      if (!peut(tel[uid], x.p)) fautes.plateforme.push(`${uid}:${k}`);
      if (vues.has(k)) fautes.doublonTesteur.push(`${uid}:${k}`);
      vues.add(k);
      porteurs.set(k, [...(porteurs.get(k) || []), uid]);
    });
  });
  verifier(!fautes.inconnue.length, 'aucune clé hors du plan', fautes.inconnue.slice(0, 3).join(', '));
  verifier(!fautes.retiree.length, 'aucune clé retirée n\'est confiée', fautes.retiree.slice(0, 3).join(', '));
  verifier(!fautes.plateforme.length, 'chacun ne reçoit que son téléphone et le web', fautes.plateforme.slice(0, 3).join(', '));
  verifier(!fautes.doublonTesteur.length, 'jamais deux fois la même clé chez un testeur', fautes.doublonTesteur.slice(0, 3).join(', '));
  /* Le socle chez tous. */
  const socleManque = [];
  testeurs.forEach((t) => attendus.forEach((x, k) => {
    if (socle.includes(x.s.id) && !retires.has(k) && peut(t.mobile, x.p) && !(r.affectation[t.id] || { cles: [] }).cles.includes(k)) socleManque.push(`${t.id}:${k}`);
  }));
  verifier(!socleManque.length, 'le socle est fait par tous, téléphone et web', socleManque.slice(0, 3).join(', '));
  /* Le plafond. */
  const charges = Object.values(r.affectation).map((a) => a.cles.length);
  verifier(charges.every((n) => n <= plafond), `personne au-delà du plafond (${plafond})`, charges.join('/'));
  /* Une fois chacun hors socle. */
  const doublons = [...porteurs.entries()].filter(([k, l]) => !socle.includes(attendus.get(k).s.id) && l.length > 1).map(([k]) => k);
  verifier(!doublons.length, 'hors socle, chaque passage une seule fois', doublons.slice(0, 3).join(', '));
  /* Rien de perdu : chaque clé attendue non retirée est soit confiée, soit rendue dans « laisses ». */
  const laisses = new Set(r.laisses.map((x) => x.cle));
  const perdues = [...attendus.keys()].filter((k) => !retires.has(k) && !porteurs.has(k) && !laisses.has(k));
  verifier(!perdues.length, 'aucune clé perdue : confiée ou laissée aux robots', perdues.slice(0, 3).join(', '));
  verifier([...laisses].every((k) => !porteurs.has(k)), 'une clé laissée n\'est confiée à personne');
  /* La priorité : une clé laissée ne doit pas avoir été doublée par une
     clé de priorité plus basse confiée à quelqu'un qui pouvait la faire. */
  const inversions = [];
  r.laisses.forEach((l) => {
    const pl = PRIO[l.priorite] ?? 3;
    Object.entries(r.affectation).forEach(([uid, a]) => {
      if (!peut(tel[uid], l.plateforme)) return;
      const plusBas = a.cles.find((k) => !socle.includes(attendus.get(k).s.id) && (PRIO[attendus.get(k).s.priorite] ?? 3) > pl);
      if (plusBas) inversions.push(`${l.cle} laissé, ${uid} a ${plusBas}`);
    });
  });
  verifier(!inversions.length, 'la priorité est respectée (haute, puis moyenne, puis basse)', inversions.slice(0, 2).join(' ; '));
  return { porteurs, charges };
};

/* --------------------------------------------------------------------------
   Un plan synthétique : de quoi tout savoir à l'avance.
   -------------------------------------------------------------------------- */
const fab = (n, base, champs) => Array.from({ length: n }, (_, i) => ({ id: `${base}-f-${String(i + 1).padStart(3, '0')}`, section: base, type: 'normal', ...champs }));
const SYN = [
  ...fab(4, 'inscription', { qui: 'les-deux', priorite: 'haute', plateformes: ['ios', 'android', 'web'] }),
  ...fab(3, 'taches', { qui: 'humain', priorite: 'haute', plateformes: ['ios', 'android'] }),
  ...fab(20, 'journal', { qui: 'les-deux', priorite: 'haute', plateformes: ['ios', 'android', 'web'] }),
  ...fab(30, 'idees', { qui: 'les-deux', priorite: 'moyenne', plateformes: ['ios', 'android', 'web'] }),
  ...fab(25, 'notes', { qui: 'humain', priorite: 'basse', plateformes: ['ios', 'android', 'web'] }),
  ...fab(5, 'web', { qui: 'les-deux', priorite: 'haute', plateformes: ['web'] }),
  { id: 'robot-f-001', section: 'robot', qui: 'robot', priorite: 'haute', plateformes: ['ios'] },
];
/* Les robots : journal-f-001 rouge sur iPhone, journal-f-002 en défaut
   connu sur Android, journal-f-003 vert sur le web, journal-f-004 vert
   partout ; un bug connu sur journal-f-005 au web ; un humain seul
   (taches-f-001) rouge chez un robot qui n'existe pas : jamais retiré. */
const PARCOURS = [
  { ref: 'R1', plateformes: ['ios'], etat: 'rouge' },
  { ref: 'R2', plateformes: ['android'], etat: 'rouge', defautConnu: true },
  { ref: 'R3', plateformes: ['web'], etat: 'vert' },
  { ref: 'R4', etat: 'vert' },
  { ref: 'R5', plateformes: ['ios'], etat: 'rouge' },
];
const rattacher = { 'journal-f-001': ['R1'], 'journal-f-002': ['R2'], 'journal-f-003': ['R3'], 'journal-f-004': ['R4'], 'taches-f-001': ['R5'] };
SYN.forEach((s) => { if (rattacher[s.id]) s.parcours = rattacher[s.id]; });
const ANOS = [
  { id: 'robot-B1', statut: 'nouvelle', scenarios: ['journal-f-005'], plateformes: ['web'] },
  { id: 'robot-B2', statut: 'sans-suite', scenarios: ['journal-f-006'], plateformes: [] },
  { id: 'ko-journal-f-007', statut: 'confirmee', scenario: 'journal-f-007', plateformes: ['android'] },
];

console.log('== Les retraits');
const retraits = R.retraitsConnus({ scenarios: SYN, parcours: PARCOURS, anomalies: ANOS });
verifier(retraits.get('journal-f-001__ios') === 'robot', 'rouge chez un robot sur iPhone : retiré sur iPhone', retraits.get('journal-f-001__ios'));
verifier(!retraits.has('journal-f-001__android') && !retraits.has('journal-f-001__web'), 'mais pas sur les autres plateformes');
verifier(retraits.get('journal-f-002__android') === 'robot', 'défaut connu chez un robot : retiré');
verifier(retraits.get('journal-f-003__web') === 'web-vert', 'vert sur le web : retiré du web');
verifier(!retraits.has('journal-f-004__ios') && !retraits.has('journal-f-004__android') && retraits.get('journal-f-004__web') === 'web-vert', 'vert partout : retiré du web seulement, les téléphones restent aux humains');
verifier(retraits.get('journal-f-005__web') === 'bug' && !retraits.has('journal-f-005__ios'), 'bug connu au web : retiré du web seulement');
verifier(!retraits.has('journal-f-006__ios') && !retraits.has('journal-f-006__web'), 'une fausse alerte ne retire rien');
verifier(retraits.get('journal-f-007__android') === 'bug', 'un échec de testeur confirmé est un bug connu');
verifier(!retraits.has('taches-f-001__ios'), 'un « humain » seul n\'est jamais retiré, même rouge');
verifier(![...retraits.keys()].some((k) => k.startsWith('robot-')), 'un scénario robot seul n\'est pas un passage humain');

console.log('\n== Le socle proposé');
const socleP = R.proposerSocle(SYN, { retraits, nombre: 5 });
verifier(socleP.length === 5, 'cinq scénarios demandés, cinq proposés', socleP.join(', '));
verifier(socleP.every((id) => SYN.find((s) => s.id === id).priorite === 'haute'), 'tous de priorité haute');
verifier(socleP[0].startsWith('inscription') && socleP[1].startsWith('taches'), 'les sections critiques d\'abord, à tour de rôle', socleP.join(', '));
verifier(!socleP.includes('web-f-001'), 'jamais un scénario sans téléphone');
const tousRetires = R.proposerSocle([{ id: 'x-f-001', section: 'inscription', qui: 'les-deux', priorite: 'haute', plateformes: ['ios'] }], { retraits: new Map([['x-f-001__ios', 'robot']]) });
verifier(!tousRetires.length, 'ni un scénario dont le téléphone est retiré');

const SOCLE = ['inscription-f-001', 'inscription-f-002', 'taches-f-001', 'web-f-001'];
const PLAFOND = 20;
const r = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: PLAFOND, retraits, graine: 'c1' });
const { porteurs, charges } = examiner('Six testeurs, plafond 20', SYN, SIX, r, { socle: SOCLE, plafond: PLAFOND, retraits });
verifier(charges.every((n) => n === PLAFOND), 'avec plus de tests que de place, chacun est rempli au plafond', charges.join('/'));
const webs = Object.values(r.affectation).map((a) => a.cles.filter((k) => k.endsWith('__web')).length);
verifier(webs.every((n) => n > 0), 'le web est partagé entre les six', webs.join('/'));
verifier((porteurs.get('web-f-001__web') || []).length === 6, 'un scénario web du socle est fait par les six sur le web');
verifier((porteurs.get('inscription-f-001__ios') || []).length === 3 && (porteurs.get('inscription-f-001__android') || []).length === 3, 'un scénario du socle : trois iPhone, trois Android');
verifier(r.laisses.length > 0 && r.laisses.every((x) => ['moyenne', 'basse'].includes(x.priorite)), 'ce qui reste aux robots est ce qui est le moins prioritaire');
const cleTaches = Object.values(r.affectation).flatMap((a) => a.cles).filter((k) => /^taches-f-00[23]__/.test(k));
verifier(cleTaches.length === 4, 'les « humain » seuls de priorité haute hors socle sont tous pris, une fois', String(cleTaches.length));
verifier(Object.values(r.affectation).every((a) => {
  const rangs = a.cles.map((k) => { const s = SYN.find((x) => x.id === k.split('__')[0]); return SOCLE.includes(s.id) ? -1 : PRIO[s.priorite]; });
  return rangs.every((x, i) => !i || rangs[i - 1] <= x);
}), 'chez chacun, les clés sont rangées socle, puis priorité');
const ctl = R.controlerSocle(r.affectation, SYN, { socle: SOCLE, retraits, plafond: PLAFOND });
verifier(ctl.conforme, 'le contrôle de l\'aperçu la juge conforme', JSON.stringify(ctl).slice(0, 160));
const r2 = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: PLAFOND, retraits, graine: 'c1' });
verifier(JSON.stringify(r2.affectation) === JSON.stringify(r.affectation), 'le même tirage pour la même campagne : l\'aperçu montre ce qui sera écrit');
const r3 = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: PLAFOND, retraits, graine: 'c2' });
verifier(JSON.stringify(r3.affectation) !== JSON.stringify(r.affectation), 'une autre campagne, un autre tirage');

console.log('\n== Plafond généreux : rien pour les robots');
const large = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: 500, retraits, graine: 'c1' });
examiner('plafond 500', SYN, SIX, large, { socle: SOCLE, plafond: 500, retraits });
verifier(!large.laisses.length, 'tout trouve un testeur');
const cl = Object.values(large.affectation).map((a) => a.cles.length);
verifier(Math.max(...cl.slice(0, 3)) - Math.min(...cl.slice(0, 3)) <= 1 && Math.max(...cl.slice(3)) - Math.min(...cl.slice(3)) <= 1, 'la charge reste équilibrée entre testeurs du même téléphone', cl.join('/'));

console.log('\n== Le socle dépasse le plafond');
const etroit = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: 3, retraits, graine: 'c1' });
verifier(etroit.depassements.length === 6, 'chaque testeur est signalé', JSON.stringify(etroit.depassements));
verifier(!R.controlerSocle(etroit.affectation, SYN, { socle: SOCLE, retraits, plafond: 3 }).conforme, 'et le contrôle refuse');

console.log('\n== Les passages déjà consignés restent chez leur auteur');
const garde = R.repartirSocle(SYN, SIX, { socle: SOCLE, plafond: PLAFOND, retraits, garder: { t4: ['notes-f-010__web'] }, graine: 'c1' });
verifier(garde.affectation.t4.cles.includes('notes-f-010__web'), 'un passage de priorité basse déjà joué reste chez t4');
verifier(Object.entries(garde.affectation).filter(([, a]) => a.cles.includes('notes-f-010__web')).length === 1, 'et chez lui seul');

console.log('\n== Le contrôle voit les fautes');
const copie = () => JSON.parse(JSON.stringify(r.affectation));
const sansSocle = copie(); sansSocle.t2.cles = sansSocle.t2.cles.filter((k) => k !== 'taches-f-001__ios');
verifier(R.controlerSocle(sansSocle, SYN, { socle: SOCLE, retraits, plafond: PLAFOND }).socleManquant.length === 1, 'un socle incomplet est vu');
const deux = copie(); const horsSocle = deux.t1.cles.find((k) => k.endsWith('__web') && !SOCLE.includes(k.split('__')[0])); deux.t4.cles.push(horsSocle);
verifier(R.controlerSocle(deux, SYN, { socle: SOCLE, retraits, plafond: 500 }).doublons.includes(horsSocle), 'un passage hors socle confié deux fois est vu');
const retiree = copie(); retiree.t1.cles.push('journal-f-001__ios');
verifier(R.controlerSocle(retiree, SYN, { socle: SOCLE, retraits, plafond: 500 }).enTrop.length === 1, 'une clé retirée remise est vue en trop');
const lourd = copie(); lourd.t1.cles.push(r.laisses.find((x) => x.plateforme !== 'android').cle);
verifier(R.controlerSocle(lourd, SYN, { socle: SOCLE, retraits, plafond: PLAFOND }).auDessus.includes('t1'), 'un testeur au-delà du plafond est vu');

console.log('\n== Prête à lancer, à la règle du socle');
const humainsCP = SYN.filter((s) => s.qui !== 'robot').map((s) => ({ ...s, ref: s.id }));
const campagne = { plan: true, regle: 'socle', socle: SOCLE, plafond: PLAFOND, retraits: [...retraits.keys()], scenarios: humainsCP.map((s) => s.id), testeurs: Object.keys(r.affectation), affectation: r.affectation, installation: { ios: 'https://a', android: 'https://b' }, application: 'ForgeMe' };
const pret = CP.pretALancer(campagne, { humains: humainsCP });
const lr = pret.find((x) => x.cle === 'repartition');
verifier(pret.every((x) => x.ok), 'la campagne est prête', JSON.stringify(pret.filter((x) => !x.ok)));
verifier(/laissés? aux robots/.test(lr.detail) && /h au plus chacun/.test(lr.detail), 'la ligne dit le temps et ce qui reste aux robots', lr.detail);
const pretFaux = CP.pretALancer({ ...campagne, affectation: sansSocle }, { humains: humainsCP });
verifier(!pretFaux.find((x) => x.cle === 'repartition').ok, 'un socle incomplet bloque le lancement');
const ancienne = CP.pretALancer({ ...campagne, regle: undefined }, { humains: humainsCP });
verifier(!ancienne.find((x) => x.cle === 'repartition').ok, 'sans la règle du socle, l\'ancien contrôle s\'applique (clés oubliées)');

console.log('\n== L\'ordre chez le testeur');
const sections = [
  { id: 'notes', groupe: 'fonctionnalites', ordre: 1, aspects: { fonctionnel: SYN.filter((s) => s.section === 'notes') } },
  { id: 'idees', groupe: 'fonctionnalites', ordre: 2, aspects: { fonctionnel: SYN.filter((s) => s.section === 'idees') } },
  { id: 'taches', groupe: 'socle', ordre: 3, aspects: { fonctionnel: SYN.filter((s) => s.section === 'taches') } },
  { id: 'journal', groupe: 'fonctionnalites', ordre: 4, aspects: { fonctionnel: SYN.filter((s) => s.section === 'journal') } },
];
const cles = ['notes-f-001__ios', 'idees-f-001__web', 'idees-f-002__ios', 'journal-f-010__web', 'journal-f-010__ios', 'taches-f-001__ios'];
const ordre = V.scenariosDuTesteur({ sections, cles, socle: ['notes-f-001'] }).scenarios.map((s) => s.ref);
verifier(JSON.stringify(ordre) === JSON.stringify(['notes-f-001__ios', 'taches-f-001__ios', 'journal-f-010__ios', 'journal-f-010__web', 'idees-f-002__ios', 'idees-f-001__web']), 'socle (même de priorité basse), puis haute, moyenne, basse ; téléphone avant web', ordre.join(' '));
const ordreAncien = V.scenariosDuTesteur({ sections, cles }).scenarios.map((s) => s.ref);
verifier(ordreAncien[0] === 'taches-f-001__ios' && ordreAncien[1] === 'notes-f-001__ios', 'sans socle, l\'ordre des sections reste celui d\'avant', ordreAncien.join(' '));

/* -------------------------------------------------------------------------- */
const DOSSIER = process.env.PLAN_SECTIONS || path.join(os.homedir(), 'ForgeMe-tests/plan-tests/sections');
if (fs.existsSync(DOSSIER)) {
  const GROUPES = ['demarrage', 'socle', 'fonctionnalites', 'transverse'];
  const vrai = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8')))
    .sort((a, b) => GROUPES.indexOf(a.groupe) - GROUPES.indexOf(b.groupe) || (a.ordre || 0) - (b.ordre || 0));
  const reel = R.scenariosHumains(vrai);
  const socle = R.proposerSocle(reel);
  const rr = R.repartirSocle(reel, SIX, { socle, plafond: 120, retraits: new Map(), graine: 'vrai' });
  examiner('Le vrai plan ForgeMe (sans les données des robots)', reel, SIX, rr, { socle, plafond: 120, retraits: new Map() });
  verifier(socle.length === 25, `un socle de 25 scénarios (${socle.length})`);
  console.log('     testeur  socle  reste  total  heures');
  R.chargeSocle(rr.affectation, socle).forEach((c) => console.log(`     ${c.id.padEnd(8)} ${String(c.socle).padStart(5)}  ${String(c.reste).padStart(5)}  ${String(c.total).padStart(5)}  ${String(c.heures).padStart(6)}`));
} else console.log(`\n(vrai plan absent : ${DOSSIER})`);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
