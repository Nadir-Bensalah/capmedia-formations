# Déployer sur Firebase sans jamais se tromper de projet

Ce dépôt porte deux configurations, qui visent deux projets :

| Configuration | Alias | Projet | Contenu |
|---|---|---|---|
| `firebase.suivi.json` | `hub` | `capmedia-1f90d` | Hub : espace client, cockpit, testeur |
| `firebase.json` | `academy` | `capmedia-academy` | Academy |

## Les commandes

Toujours par les scripts, qui écrivent `--config` et `--project` en entier :

```
npm run deploiement:verifier          # la garde et le câblage, sans rien déployer
npm run deploiement:hub:index
npm run deploiement:hub:regles
npm run deploiement:hub:fonctions
npm run deploiement:academy:regles
npm run deploiement:academy:fonctions
```

Essai à blanc : ajouter `-- --dry-run` (par exemple `npm run deploiement:hub:regles -- --dry-run`).
L'essai passe par la garde, compile les règles et prépare les fonctions sans rien envoyer.

## Ce qui échoue, volontairement

- `firebase deploy` sans `--project` : `.firebaserc` n'a **aucun projet par défaut**, le CLI refuse.
- Une configuration envoyée vers le projet de l'autre, ou vers n'importe quel autre projet : la garde
  `outils/garde-deploiement.mjs`, appelée en `predeploy` sur Firestore, Storage et les fonctions, refuse.
- Un dossier lié à un projet par `firebase use` : refusé, même vers le bon projet. On retire la liaison par
  `firebase use --clear`.
- Un autre dépôt, une autre branche que `main`, un arbre de travail modifié : refusé. On ne déploie que ce qui
  est commité (`GARDE_DEPLOIEMENT_ARBRE_MODIFIE=1` lève ce seul point, en connaissance de cause).

## Les autres dossiers

D'autres dossiers d'un poste de travail peuvent être liés aux projets Capmedia (anciennes copies de ce dépôt,
ou un autre dépôt qui déploie ses propres fonctions sur `capmedia-1f90d`). Ils ne passent pas par cette garde.
Règle : **les règles et les fonctions du Hub ne partent que de ce dépôt**, par les scripts ci-dessus. Depuis un
autre dossier lié à `capmedia-1f90d`, ne jamais lancer de `firebase deploy` sans `--only functions`.
L'inventaire de ces dossiers est tenu hors du dépôt.

## Mettre en production la Gate 2 (identité et accès)

L'ordre a été rejoué pièce par pièce sur un banc qui reproduit l'état
d'avant (copie pseudonymisée de la production, `ordre-deploiement.sh`) ;
le rapport de préflight en donne le détail, étape par étape.

1. Sauvegarde : export Firestore complet, relevé des comptes Auth, et la
   version déployée des fonctions et des règles (pour le retour arrière).
2. À blanc : `node fonctions-suivi/outils/migrer-gate2.mjs`. Il doit sortir
   en code 0 (aucun arbitrage bloquant). Les points « à traiter après
   migration » se règlent ensuite dans le cockpit.
3. `npm run deploiement:hub:fonctions`. Les nouvelles fonctions lisent
   `ouvert` : tant que la migration n'est pas passée (quelques minutes),
   aucun e-mail client ne part. C'est voulu : jamais d'e-mail vers un
   projet dont l'ouverture n'est pas décidée.
4. Migration réelle : `node fonctions-suivi/outils/migrer-gate2.mjs --vrai --production`.
   Silencieuse, journalisée (`migrationGate2/{passage}`), reprenable si
   elle est coupée (relancer la même commande). La rejouer à blanc doit
   annoncer zéro unité.
5. `npm run deploiement:hub:regles` (Firestore et Storage).
6. Publier le site (`agence/suivi/`).
7. Vérifier : un administrateur, un agent, un responsable, un
   collaborateur (voir le préflight).
8. Seulement après quelques jours sans retour arrière : supprimer le
   secret `ADMIN_CLE` du projet `capmedia-1f90d` (Secret Manager). Tant
   qu'il existe, les anciennes fonctions restent redéployables. Celui de
   `capmedia-academy` est un autre secret, d'un autre projet, et reste.

Entre les étapes 3 et 6, le cockpit d'avant ne peut plus appeler le
serveur (il porte la clé, le serveur attend l'identité) : aucune gestion
d'accès pendant ces minutes. Les clients, eux, ne voient rien changer.

## Revenir en arrière (Gate 2)

Dans l'ordre inverse, et seulement ce qui est cassé :

| Cassé | Geste | Ce qui reste |
|---|---|---|
| Le site | republier l'ancien `agence/suivi/` | tout le reste ; l'ancien cockpit ne peut plus appeler le serveur tant que les nouvelles fonctions sont là |
| Les règles | redéployer les règles d'avant (Firestore et Storage) | l'ancien site marche avec elles |
| Les fonctions | redéployer les fonctions d'avant (le secret `ADMIN_CLE` doit encore exister) | à faire avec le site et les règles d'avant |
| La migration | `migrer-gate2.mjs --annuler --tout --production` | voir ci-dessous |

Le retour arrière de la migration remet chaque champ qu'elle a écrit
(accès, ouverture, e-mails, montants, budgets, activité, sociétés,
équipe) et efface ce qu'elle a créé (interlocuteurs, montants, budgets).
Il REFUSE (code 5) si un accès qu'elle a écrit a changé depuis : défaire
écraserait le geste (un accès retiré reviendrait). Il faut alors trancher
chaque cas, ou forcer (`--forcer`) en connaissance de cause. Ce que la
Gate 2 a créé après la migration (nouveaux interlocuteurs, invitations,
montants posés par le nouveau cockpit) n'est pas lu par l'ancien code et
reste en base, inerte.

Ordre complet : site, règles, fonctions, puis la migration. L'ancien
modèle d'accès revient tel qu'il était : `membres` des projets et des
sociétés, `silence`, montants sur les étapes, budget dans la fiche
interne.
