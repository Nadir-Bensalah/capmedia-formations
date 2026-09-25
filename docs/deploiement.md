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

L'ordre compte : les nouvelles règles lisent `ouvert`, `roles` et
`actif`, que seule la migration écrit. Déployer les règles avant la
migration fermerait l'accès aux clients des projets ouverts de fait.

1. Sauvegarde Firestore complète (export), et relevé des comptes Auth.
2. Trancher les arbitrages listés par `node fonctions-suivi/outils/migrer-gate2.mjs`
   (à blanc, par défaut) : tant qu'un projet en porte un, il n'est pas converti.
3. Migration réelle : `node fonctions-suivi/outils/migrer-gate2.mjs --vrai --production`.
   Elle n'envoie rien, se journalise dans `migrationGate2/{passage}` et
   s'annule par `--annuler --passage=<id>`. La rejouer à blanc doit
   annoncer zéro unité.
4. `npm run deploiement:hub:fonctions`, puis `npm run deploiement:hub:regles`.
5. Publier le site (`agence/suivi/`).
6. Vérifier : un administrateur, un agent, un responsable, un collaborateur.
7. Seulement ensuite, supprimer le secret `ADMIN_CLE` du projet
   `capmedia-1f90d` (Secret Manager) : plus aucun code ne le lit. Celui de
   `capmedia-academy` est un autre secret, d'un autre projet, et reste.

