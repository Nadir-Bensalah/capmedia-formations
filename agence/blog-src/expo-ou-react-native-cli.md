---
id: expo-ou-react-native-cli
titre: Expo ou React Native CLI en 2026 : le vrai comparatif
description: La recommandation officielle a tranché, mais les forums continuent le débat. Ce qu'Expo fait vraiment en 2026, ce que le CLI apporte encore, et comment choisir sans se tromper.
date: 2026-05-06
auteur: Nadir Ben Salah
categorie: Développement
motsCles: expo ou react native cli, expo 2026, react native débutant, eas build, créer une application react native
image: https://images.unsplash.com/photo-1605379399642-870262d3d051?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8bW9iaWxlJTIwcGhvbmUlMjBkZXZlbG9wbWVudCUyMGNvZGV8ZW58MHx8fHwxNzg2NzI1NjM2fDA&ixlib=rb-4.1.0&q=80&w=1600
imageAuteur: Fotis Fotopoulos
imageLien: https://unsplash.com/photos/black-remote-control-on-red-table-6sAl6aQ4OWI
---

C'est LA question que pose tout débutant en React Native, et une des rares où la réponse a vraiment changé ces dernières années. Si tu lis des discussions de 2021, tu trouveras « Expo c'est pour les jouets, les pros utilisent le CLI ». Si tu lis la documentation officielle de React Native aujourd'hui, tu trouveras l'inverse : elle recommande de démarrer avec un framework, et le framework qu'elle cite en premier, c'est Expo.

Les deux affirmations ont été vraies, chacune à son époque. Démêlons ça honnêtement, parce que ce choix conditionne tes six premiers mois.

## De quoi on parle exactement

**React Native**, c'est la technologie de base : tu écris ton interface en JavaScript et React, et elle pilote de vrais composants natifs iOS et Android. Un seul code, deux plateformes. C'est ce qu'utilisent Discord, Shopify ou Coinbase.

**Le React Native CLI** (aujourd'hui appelé React Native Community CLI), c'est la façon « brute » de l'utiliser : tu gères toi-même les projets natifs Xcode et Android Studio, leurs configurations, leurs dépendances natives. Toute la puissance, toute la responsabilité.

**Expo**, c'est un framework construit au-dessus de React Native : une couche d'outils qui prend en charge la configuration native, la construction des binaires, les mises à jour, et une collection de modules maintenus (caméra, notifications, capteurs, fichiers). Tu écris ton application, Expo s'occupe de la tuyauterie.

La confusion vient de l'histoire : le « Expo » de 2019 était une cage dorée, impossible d'en sortir dès qu'on avait besoin d'un module natif absent. Ce reproche, mille fois recopié, décrit un produit qui n'existe plus.

## Ce qui a changé, concrètement

Trois évolutions ont retourné le débat.

### La recommandation officielle

La documentation de React Native ne présente plus le CLI comme le chemin par défaut : elle recommande explicitement d'utiliser un framework, Expo en tête. L'équipe de React Native elle-même considère qu'un projet sans framework revient à écrire sa propre infrastructure à la main. Quand les auteurs de la technologie te disent par où commencer, le débat de forum a un peu moins de poids.

### Les development builds ont ouvert la cage

Le vieux reproche « on ne peut pas ajouter de module natif avec Expo » est mort avec les development builds et le système de plugins de configuration. Aujourd'hui, tu peux intégrer quasiment n'importe quelle bibliothèque native dans un projet Expo, y compris du code natif écrit par toi, sans quitter le framework. Et si un jour tu veux vraiment récupérer les projets natifs à la main, la commande `prebuild` te les génère : la sortie existe, documentée, à tout moment.

### EAS a réglé le problème du Mac

C'est le point qui change tout pour un indépendant ou un débutant : **EAS Build construit ton application iOS dans le nuage**. Tu lances une commande depuis n'importe quelle machine, Windows compris, et tu récupères un binaire signé, prêt pour l'App Store.

```Terminal
eas build --platform ios
eas submit --platform ios --latest
```

Avec le CLI pur, ce confort n'existe pas en standard : il te faut un Mac, ou monter toi-même une intégration continue avec des runners macOS. Pour quelqu'un qui publie sa première app, c'est la différence entre « j'ai soumis ce soir » et « j'abandonne au moment des certificats ».

Ajoute à ça les mises à jour EAS Update, qui permettent de corriger le JavaScript de ton app publiée sans repasser par une revue complète des stores, dans les limites autorisées par Apple et Google.

## Le face-à-face honnête

| Critère | Expo | React Native CLI |
| --- | --- | --- |
| Démarrage d'un projet | 5 minutes, une commande | Une demi-journée avec Xcode et Android Studio à configurer |
| Construire pour iOS sans Mac | Oui, dans le nuage avec EAS | Non, Mac ou CI macOS obligatoire |
| Modules natifs tiers | Quasi tous, via development builds | Tous, directement |
| Code natif maison très spécifique | Possible, un peu plus encadré | Terrain naturel |
| Mises à jour du code JS à distance | Intégré (EAS Update) | À monter soi-même |
| Mises à niveau de version RN | Largement automatisées | Manuelles, réputées pénibles |
| Ce que l'IA connaît le mieux | Très bien documenté, très répandu | Bien connu aussi, mais plus de pièges de config |
| Coût | Gratuit, services EAS avec quota gratuit puis payants | Gratuit, mais ton temps et l'infra CI se paient |

Sur la question du prix, sois lucide dans les deux sens : les services EAS ont des paliers payants quand ton usage grossit, mais l'alternative n'est pas gratuite pour autant, elle se paie en heures de configuration, en machines de build et en mises à niveau douloureuses. Pour un solo, le calcul penche presque toujours du même côté.

## Les cas où le CLI se justifie encore

Il en reste, et il faut les nommer plutôt que prétendre qu'Expo couvre tout :

- **Ton app est principalement du code natif** avec un peu de React Native dedans, ou tu intègres React Native dans une application native existante. Là, le framework n'apporte plus grand-chose.
- **Tu as une équipe native expérimentée** avec une infrastructure de build déjà en place, des règles de sécurité qui interdisent les builds dans le nuage, ou des besoins exotiques de configuration Gradle et Xcode que tu veux piloter à la main.
- **Une dépendance critique de ton projet est incompatible** avec les development builds. C'est devenu rare, mais ça existe encore dans certains domaines très spécialisés (matériel exotique, SDK propriétaires anciens).

Remarque ce que cette liste n'inclut pas : « je veux une vraie app sérieuse ». Des applications avec des millions d'utilisateurs tournent sous Expo. Le sérieux n'a rien à voir avec ce choix.

:::attention
Le mauvais argument classique : « j'apprends avec le CLI pour comprendre comment ça marche en dessous ». En pratique, tu passes tes premières semaines à déboguer Gradle et CocoaPods au lieu d'apprendre React Native, et la compréhension du natif viendra de toute façon le jour où tu en auras besoin. Commencer par le plus dur n'est pas une pédagogie, c'est une cause d'abandon.
:::

## Notre recommandation, sans détour

**Si tu débutes, ou si tu es un indépendant qui veut publier : Expo, sans hésiter.** C'est la voie recommandée par React Native, celle qui te fait construire pour iOS sans Mac, celle où les certificats, les builds et les soumissions sont les plus automatisés, et celle que les assistants IA maîtrisent le mieux parce que la configuration est standardisée.

C'est aussi un choix réversible, et c'est peut-être l'argument décisif : un projet Expo peut générer ses projets natifs et rejoindre le monde du CLI le jour où une vraie raison l'exige. L'inverse, migrer un projet CLI bricolé vers une base propre, coûte beaucoup plus cher. En cas de doute, choisis la porte qui reste ouverte.

**Si tu es dans un des trois cas listés plus haut**, tu n'as pas besoin de cet article pour le savoir : ton contexte a déjà tranché, et le CLI est un choix parfaitement respectable.

Le débat « Expo ou CLI » de 2021 est un débat de musée. En 2026, la vraie question n'est plus quel outil choisir, mais ce que tu vas construire avec. Et ça, c'est une bien meilleure question.
