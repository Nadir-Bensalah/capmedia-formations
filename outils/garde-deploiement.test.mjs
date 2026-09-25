/* ==========================================================================
   La garde de déploiement, éprouvée sans rien déployer.

   1. La règle elle-même (refus), sur chaque cas : bon projet, mauvais
      projet, projet absent, liaison implicite, mauvais dépôt, autre
      branche, arbre modifié.
   2. Le câblage : chaque configuration appelle la garde de SA cible sur
      chaque produit (Firestore, Storage, fonctions), et .firebaserc ne
      désigne aucun projet par défaut.

   Les essais réels contre le CLI (--dry-run) sont décrits dans
   docs/deploiement.md.

     node outils/garde-deploiement.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { refus, CIBLES } from './garde-deploiement.mjs';

let echecs = 0;
const verifier = (c, m, d = '') => { if (c) console.log(`  ok     ${m}`); else { echecs += 1; console.log(`  ÉCART  ${m}${d ? ` · ${d}` : ''}`); } };
const sain = { projet: 'capmedia-1f90d', liaison: null, depot: 'https://github.com/Nadir-Bensalah/capmedia-formations.git', branche: 'main', arbreModifie: false, tolererArbre: false };

console.log('\n== La règle');
verifier(refus({ ...sain, cible: 'hub' }).length === 0, 'le Hub vers capmedia-1f90d, depuis main propre : autorisé');
verifier(refus({ ...sain, cible: 'academy', projet: 'capmedia-academy' }).length === 0, 'l Academy vers capmedia-academy : autorisé');
verifier(refus({ ...sain, cible: 'hub', projet: 'capmedia-academy' }).some((x) => /ne part que vers capmedia-1f90d/.test(x)), 'le Hub vers l Academy : refusé');
verifier(refus({ ...sain, cible: 'academy', projet: 'capmedia-1f90d' }).some((x) => /ne part que vers capmedia-academy/.test(x)), 'l Academy vers le Hub : refusé');
verifier(refus({ ...sain, cible: 'hub', projet: 'forgeme-project' }).length > 0, 'le Hub vers un projet ForgeMe : refusé');
verifier(refus({ ...sain, cible: 'hub', projet: '' }).some((x) => /aucun projet/.test(x)), 'projet absent : refusé');
verifier(refus({ ...sain, cible: 'hub', liaison: 'hub' }).some((x) => /firebase use/.test(x)), 'dossier lié par firebase use : refusé, même vers le bon projet');
verifier(refus({ ...sain, cible: 'hub', depot: 'https://github.com/Nadir-Bensalah/ancienne-copie.git' }).some((x) => /dépôt inattendu/.test(x)), 'autre dépôt : refusé');
verifier(refus({ ...sain, cible: 'hub', depot: '' }).some((x) => /dépôt inattendu/.test(x)), 'aucun remote : refusé');
verifier(refus({ ...sain, cible: 'hub', branche: 'feat/essai' }).some((x) => /on ne déploie que main/.test(x)), 'autre branche que main : refusé');
verifier(refus({ ...sain, cible: 'hub', arbreModifie: true }).some((x) => /non commitées/.test(x)), 'arbre modifié : refusé');
verifier(refus({ ...sain, cible: 'hub', arbreModifie: true, tolererArbre: true }).length === 0, 'arbre modifié toléré explicitement : autorisé');
verifier(refus({ ...sain, cible: 'forgeme' }).some((x) => /cible inconnue/.test(x)), 'cible inconnue : refusé');

console.log('\n== Le câblage des configurations');
for (const [cible, c] of Object.entries(CIBLES)) {
  const conf = JSON.parse(readFileSync(new URL(`../${c.configuration}`, import.meta.url), 'utf8'));
  const attendu = `node "$PROJECT_DIR/outils/garde-deploiement.mjs" ${cible}`;
  const hooks = [['firestore', conf.firestore], ['storage', conf.storage], ...(conf.functions || []).map((f) => [`functions:${f.codebase}`, f])];
  for (const [nom, bloc] of hooks) verifier(Array.isArray(bloc && bloc.predeploy) && bloc.predeploy[0] === attendu, `${c.configuration} · ${nom} appelle la garde « ${cible} » en premier`, JSON.stringify(bloc && bloc.predeploy));
  verifier(!/garde-deploiement\.mjs" (?!${cible}\b)/.test(JSON.stringify(conf)), `${c.configuration} n appelle aucune autre cible`);
}
const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
verifier(!('default' in (rc.projects || {})), '.firebaserc ne désigne aucun projet par défaut');
verifier(rc.projects.hub === CIBLES.hub.projet && rc.projects.academy === CIBLES.academy.projet, 'les alias hub et academy pointent vers leurs projets');
verifier(Object.keys(rc).every((k) => k === 'projects'), '.firebaserc ne porte ni cibles ni autre réglage implicite');

console.log(`\n${echecs ? `${echecs} ÉCART(S)` : 'tout est conforme'}`);
process.exit(echecs ? 1 : 0);
