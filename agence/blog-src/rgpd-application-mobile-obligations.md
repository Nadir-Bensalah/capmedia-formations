---
id: rgpd-application-mobile-obligations
titre: RGPD et application mobile : ce qui est vraiment obligatoire
description: Politique de confidentialité, consentement, registre, questionnaires d'Apple et Google : les vraies obligations RGPD d'une app mobile, mythes compris.
date: 2026-05-19
auteur: Nadir Ben Salah
categorie: Juridique
motsCles: rgpd application mobile, politique de confidentialité app, consentement application, data safety google play, étiquettes confidentialité apple, cnil application
image: https://images.unsplash.com/photo-1614064641938-3bbee52942c7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8cHJpdmFjeSUyMHNlY3VyaXR5JTIwbG9ja3xlbnwwfHx8fDE3ODY3MjU2Njd8MA&ixlib=rb-4.1.0&q=80&w=1600
imageAuteur: FlyD
imageLien: https://unsplash.com/photos/red-padlock-on-black-computer-keyboard-mT7lXZPjk7U
---

Pour une application mobile, quatre choses sont réellement obligatoires : une politique de confidentialité accessible en ligne, une base légale pour chaque donnée collectée (le consentement n'en est qu'une parmi six), un registre des traitements, et des déclarations exactes dans les questionnaires de confidentialité d'Apple et de Google. Tout le reste, DPO obligatoire pour tous, hébergement imposé en France, consentement pour tout, relève du mythe. Et la première sanction concrète ne vient généralement pas de la CNIL : c'est le rejet de ton app par les stores.

Voici ce que la loi et les stores exigent vraiment en 2026, dans l'ordre où ça va te bloquer.

## Oui, le RGPD s'applique à ta petite app

Premier mythe à évacuer : « le RGPD, c'est pour les grosses boîtes ». Faux. Le RGPD s'applique dès que tu traites des données personnelles de personnes situées dans l'Union européenne, que tu sois une multinationale, un auto-entrepreneur ou un développeur solo qui publie une app gratuite. Une adresse e-mail de connexion, un identifiant publicitaire, une adresse IP dans tes logs, un token de notification : ce sont toutes des données personnelles.

Ce qui change avec la taille, c'est l'ampleur des obligations (un DPO, une analyse d'impact) et l'intensité des contrôles, pas le principe. Et il y a un point que beaucoup de développeurs ignorent : même si tu ne collectes « rien » toi-même, les SDK que tu embarques (analytics, crash, publicité) collectent pour toi, et tu en es responsable.

## L'obligation numéro 1 : la politique de confidentialité

C'est l'obligation la plus concrète et la plus vérifiée, parce que les deux stores l'exigent avant même la publication :

- **Apple** demande une URL de politique de confidentialité dans App Store Connect. Champ obligatoire, même pour une app qui ne collecte rien.
- **Google Play** exige une politique de confidentialité pour toute app, accessible depuis la fiche et depuis l'app.

Côté RGPD, cette politique répond au droit à l'information (articles 13 et 14) : qui collecte, quelles données, pour quoi faire, combien de temps, avec qui elles sont partagées, et comment exercer ses droits (accès, rectification, effacement). Une page claire en français, hébergée sur une URL stable, suffit. Les générateurs de politiques produisent des textes passables ; le vrai travail, c'est de lister honnêtement ce que ton app et ses SDK collectent, pas de copier un modèle.

:::attention
Une politique de confidentialité qui ne correspond pas au comportement réel de l'app est pire que pas de politique du tout : c'est un motif de rejet chez Apple (guideline 5.1) et une déclaration mensongère au sens du RGPD. Avant d'écrire la page, fais l'inventaire de tes SDK et de ce qu'ils envoient.
:::

## Le consentement : obligatoire parfois, pas partout

Deuxième mythe : « il faut demander le consentement pour tout ». Le RGPD prévoit six bases légales, et le consentement n'est que l'une d'elles. Concrètement, pour une app :

| Donnée ou traitement | Base légale habituelle | Consentement requis ? |
| --- | --- | --- |
| E-mail et mot de passe du compte | Exécution du contrat | Non |
| Données nécessaires au service (ex. position pour une app GPS) | Exécution du contrat | Non, mais permission système oui |
| Mesure d'audience simple et anonymisée | Intérêt légitime (sous conditions CNIL) | Non |
| Analytics avec partage ou recoupement | Consentement | Oui |
| Publicité ciblée, identifiant publicitaire | Consentement | Oui |
| Prospection par e-mail (B2C) | Consentement | Oui |

Sur iOS s'ajoute une couche technique : le framework App Tracking Transparency. Si ton app « suit » l'utilisateur à travers les apps et sites d'autres entreprises (le cas de la plupart des SDK publicitaires), tu dois afficher la fenêtre ATT d'Apple. La déclarer et ne pas suivre, c'est accepté ; suivre sans la déclarer, c'est un rejet ou un retrait.

Le piège classique : embarquer un SDK d'analytics ou de publicité configuré par défaut, qui collecte dès le lancement de l'app, avant tout consentement. C'est l'infraction la plus répandue du secteur, et c'est précisément ce que la CNIL a ciblé dans ses recommandations sur les applications mobiles, appliquées depuis 2025 : le consentement doit être recueilli avant que les SDK ne s'activent, pas après.

## Le registre des traitements : obligatoire, mais simple

Le registre (article 30) est un document interne qui liste tes traitements : quelles données, pour quelle finalité, combien de temps, avec quels sous-traitants. L'exemption pour les entreprises de moins de 250 salariés est si étroite (traitements occasionnels uniquement) qu'en pratique, une app qui collecte des données en continu doit tenir un registre.

La bonne nouvelle : pour une app simple, c'est un tableau d'une page. La CNIL publie un modèle simplifié gratuit. Compte une heure de travail honnête, pas un chantier. Ce document ne se publie nulle part : il doit exister et être présentable en cas de contrôle.

## Les questionnaires des stores : là où tout le monde se plante

Apple et Google t'obligent à déclarer publiquement ce que ton app collecte :

- **Apple : les étiquettes de confidentialité** (privacy nutrition labels), remplies dans App Store Connect avant la soumission. Depuis 2024, s'y ajoutent les Privacy Manifests : les SDK tiers doivent déclarer eux-mêmes leurs collectes et les API sensibles qu'ils utilisent, et une app dont les déclarations sont incohérentes se fait bloquer à la soumission.
- **Google : le formulaire Data Safety** (sécurité des données), affiché sur la fiche Play Store. Google croise tes déclarations avec le comportement observé de l'app, et les incohérences déclenchent des avertissements puis des retraits.

Les erreurs qui coûtent une soumission :

1. **Déclarer « aucune collecte » alors qu'un SDK de crash ou d'analytics est embarqué.** Firebase, Sentry et consorts collectent des identifiants et des données d'usage : ça se déclare.
2. **Oublier que l'adresse IP et l'identifiant d'appareil sont des données.** « On ne collecte pas de données » est presque toujours faux techniquement.
3. **Copier les réponses d'une autre app.** Chaque app a sa combinaison de SDK ; les questionnaires se remplissent à partir de ton inventaire, pas d'un modèle.

## Les mythes qui font perdre du temps

- **« Il faut héberger en France. »** Faux. Le RGPD demande un hébergement dans l'UE ou avec des garanties adéquates pour les transferts hors UE. Les grands clouds américains opèrent sous le Data Privacy Framework validé en 2023 ; utiliser leurs régions européennes est la pratique standard et prudente.
- **« Il me faut un DPO. »** Un délégué à la protection des données n'est obligatoire que pour les organismes publics, le suivi régulier et systématique à grande échelle, ou les données sensibles à grande échelle. L'app d'un indépendant n'en a presque jamais l'obligation.
- **« Le RGPD interdit les données de santé ou de mineurs. »** Non : il les encadre plus strictement (consentement explicite, consentement parental sous 15 ans en France, analyse d'impact souvent requise). C'est faisable, mais ce n'est plus du bricolage.
- **« Personne ne contrôle les petites apps. »** La CNIL dispose d'une procédure de sanction simplifiée, conçue précisément pour les petits dossiers, avec des amendes jusqu'à 20 000 €. Et les stores, eux, contrôlent tout le monde, à chaque soumission.

## Ta liste de conformité minimale

Pour une app classique d'indépendant ou de TPE, la conformité réaliste tient en six points :

1. Inventaire des données collectées, app et SDK compris.
2. Politique de confidentialité en ligne, fidèle à cet inventaire.
3. Consentement recueilli avant l'activation des SDK non essentiels (et fenêtre ATT sur iOS si suivi publicitaire).
4. Registre des traitements tenu à jour, même sommaire.
5. Étiquettes Apple et formulaire Data Safety cohérents avec le comportement réel de l'app.
6. Suppression de compte fonctionnelle dans l'app, avec effacement effectif des données côté serveur : Apple l'exige (guideline 5.1.1), et le droit à l'effacement du RGPD aussi.

:::astuce
Fais l'inventaire des SDK avant d'écrire une seule ligne de politique de confidentialité. La liste de tes dépendances (package.json, Podfile, build.gradle) est le point de départ : pour chaque SDK, la documentation de l'éditeur indique ce qu'il collecte et comment le désactiver avant consentement. Une heure d'inventaire évite un cycle de rejet complet.
:::

## Ce qu'il faut retenir

Le RGPD appliqué à une app mobile, ce n'est ni une formalité ni un monstre : c'est une politique de confidentialité honnête, une base légale par donnée, un registre d'une page et des questionnaires de stores remplis à partir du comportement réel de l'app. Le vrai risque à court terme n'est pas l'amende, c'est le rejet ; le vrai risque à long terme, c'est d'avoir bâti sur des déclarations fausses qu'il faudra corriger sous contrainte.

Si tu veux qu'on vérifie la conformité de ton app avant soumission, ou qu'on la construise proprement dès le départ, décris ton projet via [notre page devis](../devis.html). Et si tu préfères apprendre à gérer tout ça toi-même, publication et déclarations comprises, c'est enseigné pas à pas sur [Capmedia Academy](https://academy.capmedia.app).
