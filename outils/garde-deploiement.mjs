/* ==========================================================================
   La garde de déploiement Firebase : une configuration, un projet, et rien
   d'implicite.

   Ce dépôt porte DEUX configurations qui visent deux projets différents :
     firebase.suivi.json  -> le Hub       -> capmedia-1f90d
     firebase.json        -> l'Academy   -> capmedia-academy
   Envoyer l'une sur le projet de l'autre remplacerait des règles de
   production par celles d'un autre site. Chaque configuration appelle donc
   cette garde en « predeploy », pour chaque produit (règles Firestore,
   Storage, fonctions), avec la cible qui LUI correspond. La garde refuse :

   1. un projet qui n'est pas celui de la configuration ;
   2. un projet choisi implicitement : si ce dossier est lié à un projet par
      `firebase use`, la liaison est refusée (le projet doit venir de
      --project, écrit dans la commande) ;
   3. un dépôt qui n'est pas capmedia-formations, une branche autre que main,
      ou un arbre de travail modifié (on ne déploie que ce qui est commité).
      GARDE_DEPLOIEMENT_ARBRE_MODIFIE=1 lève ce seul point, en connaissance
      de cause.

   Le CLI Firebase fournit aux hooks GCLOUD_PROJECT (le projet visé) et
   PROJECT_DIR (le dossier de la configuration).

     node outils/garde-deploiement.mjs hub|academy
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CIBLES = {
  hub: { projet: 'capmedia-1f90d', configuration: 'firebase.suivi.json', libelle: 'le Hub (espace client, cockpit, testeur)' },
  academy: { projet: 'capmedia-academy', configuration: 'firebase.json', libelle: 'l Academy' },
};
export const DEPOT = /github\.com[:/]Nadir-Bensalah\/capmedia-formations(\.git)?$/;

/** Les refus, pour une cible et un environnement donnés. Pure : les tests l'appellent directement. */
export const refus = ({ cible, projet, liaison, depot, branche, arbreModifie, tolererArbre }) => {
  const c = CIBLES[cible];
  if (!c) return [`cible inconnue « ${cible} » (attendu : ${Object.keys(CIBLES).join(' ou ')})`];
  const r = [];
  if (!projet) r.push('aucun projet visé : passez --project explicitement');
  else if (projet !== c.projet) r.push(`la configuration ${c.configuration} (${c.libelle}) ne part que vers ${c.projet}, pas vers ${projet}`);
  if (liaison) r.push(`ce dossier est lié au projet ${liaison} par « firebase use » : un projet implicite est refusé. Retirez la liaison (firebase use --clear) et passez --project`);
  if (!DEPOT.test(depot || '')) r.push(`dépôt inattendu (${depot || 'aucun remote origin'}) : ce n'est pas capmedia-formations`);
  if (branche !== 'main') r.push(`branche ${branche || '?'} : on ne déploie que main`);
  if (arbreModifie && !tolererArbre) r.push("l'arbre de travail a des modifications non commitées : on ne déploie que ce qui est commité");
  return r;
};

const liaisonDe = (dossier) => {
  try {
    const conf = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    return (conf.activeProjects || {})[resolve(dossier)] || null;
  } catch { return null; }
};
const git = (dossier, ...a) => { try { return execFileSync('git', ['-C', dossier, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cible = process.argv[2];
  const dossier = process.env.PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const etat = {
    cible,
    projet: process.env.GCLOUD_PROJECT || '',
    liaison: liaisonDe(dossier),
    depot: git(dossier, 'remote', 'get-url', 'origin'),
    branche: git(dossier, 'rev-parse', '--abbrev-ref', 'HEAD'),
    arbreModifie: git(dossier, 'status', '--porcelain') !== '',
    tolererArbre: process.env.GARDE_DEPLOIEMENT_ARBRE_MODIFIE === '1',
  };
  const r = refus(etat);
  if (r.length) {
    console.error(`\nGARDE DE DÉPLOIEMENT : refusé.\n  - ${r.join('\n  - ')}\n`);
    process.exit(1);
  }
  console.log(`Garde de déploiement : ${CIBLES[cible].libelle} vers ${etat.projet}, depuis main ${git(dossier, 'rev-parse', '--short', 'HEAD')}. Autorisé.`);
  if (!existsSync(join(dossier, CIBLES[cible].configuration))) process.exit(1);
}
