---
id: application-native-ou-web-app
titre: Application native ou web app : que choisir pour votre business ?
description: Web app si tes clients passent par le navigateur, app sur les stores si tu vis de l'engagement : critères concrets, coûts comparés et cas types 2026.
date: 2026-07-07
auteur: Nadir Ben Salah
categorie: Développement
motsCles: application native ou web app, pwa ou application mobile, react native ou pwa, choisir application ou site web, cross platform 2026
image: https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8c21hcnRwaG9uZSUyMGJyb3dzZXIlMjBhcHBzfGVufDB8fHx8MTc4NjcyNTY1NHww&ixlib=rb-4.1.0&q=80&w=1600
imageAuteur: William Hook
imageLien: https://unsplash.com/photos/space-gray-iphone-x-9e9PD9blAto
---

La règle courte : si tes utilisateurs te découvrent et te consultent ponctuellement, une web app suffit et coûte deux à trois fois moins cher. Si tu as besoin de notifications, d'une icône sur l'écran d'accueil, d'un usage quotidien ou d'abonnements via les stores, il te faut une vraie application, et en 2026 le chemin raisonnable pour la construire s'appelle le cross-platform (React Native). Le natif pur, un code par plateforme, se réserve aux cas extrêmes.

Voilà la réponse en trois phrases. Le reste de l'article te donne les critères précis, les coûts comparés et les cas concrets, parce que ce choix se joue sur ta situation, pas sur des généralités.

## D'abord, mettre les bons mots sur les options

Le vocabulaire embrouille tout le monde, donc clarifions. Il y a trois familles :

- **La web app (ou PWA)** : un site web qui se comporte comme une application. Elle vit dans le navigateur, s'ouvre par une URL, et peut s'installer sur l'écran d'accueil. Pas de store, pas de téléchargement, pas de commission.
- **L'application cross-platform** : une vraie app, téléchargée depuis l'App Store et Google Play, mais écrite avec un seul code pour les deux plateformes. React Native (avec Expo) domine ce terrain en 2026, Flutter est l'autre option sérieuse.
- **L'application native pure** : un code Swift pour iOS, un code Kotlin pour Android. Deux projets, deux expertises, le maximum de performance et d'accès aux capacités du téléphone.

Le point important : la question n'est plus « native ou web » comme il y a dix ans. Pour 90 pour cent des projets, le vrai duel est « web app ou cross-platform », et le natif pur est un cas particulier.

## Le comparatif honnête

| Critère | Web app (PWA) | Cross-platform (React Native) | Natif pur |
| --- | --- | --- | --- |
| Coût de développement | Le plus bas | Moyen | Le plus haut (quasi double) |
| Présence sur les stores | Non | Oui | Oui |
| Notifications push | Limitées, surtout sur iPhone | Complètes | Complètes |
| Accès au matériel (caméra, GPS, capteurs, Bluetooth) | Partiel | Quasi complet | Complet |
| Hors ligne | Possible mais limité | Bon | Excellent |
| Mise à jour | Instantanée | Review des stores | Review des stores |
| Commission sur les ventes | 0 (ton propre paiement) | 15 à 30 % sur les achats intégrés | 15 à 30 % sur les achats intégrés |
| Découverte par les utilisateurs | Google, liens, QR code | Recherche sur les stores | Recherche sur les stores |

Trois lignes de ce tableau décident de la plupart des projets, alors regardons-les de près.

### Les notifications : le vrai juge de paix

Si ton modèle repose sur le fait de ramener l'utilisateur (rappels, messages, alertes, relances), il te faut des notifications fiables. Sur iPhone, les notifications web existent désormais, mais elles exigent que l'utilisateur ait installé la web app sur son écran d'accueil et restent moins fiables et moins riches que les vraies notifications d'app. Dans la pratique, quasi personne n'installe une PWA de lui-même. Une app des stores, elle, demande la permission une fois et te donne un canal direct.

Besoin vital de notifications : stores. Besoin accessoire : la web app tient.

### La commission : 0 % contre 15 à 30 %

Une web app encaisse par carte bancaire avec Stripe ou équivalent : environ 2 % de frais. Une app des stores qui vend du numérique (abonnements, contenus) passe par les achats intégrés d'Apple et Google : 15 % pour la plupart des petits éditeurs, 30 % au-delà d'un million de dollars par an. Sur un abonnement à 9,99 €, la différence est énorme sur la durée.

En sens inverse, les stores apportent la friction en moins au paiement (deux clics, carte déjà enregistrée) et une conversion souvent meilleure. Il n'y a pas de réponse universelle, il y a un calcul à faire sur ton cas.

### La découverte : où tes clients te cherchent-ils ?

Un restaurant, un artisan, un cabinet : on les cherche sur Google. Une web app (ou un bon site) est exactement au bon endroit. Une app de suivi sportif, un jeu, un outil quotidien : on les cherche sur les stores, et ne pas y être, c'est ne pas exister.

## Les cas concrets, parce que c'est comme ça qu'on décide

- **Restaurant, réservation, commande sur place** : web app, sans hésiter. Le client scanne un QR code, commande, paie. Lui faire télécharger une app pour ça, c'est perdre la moitié des commandes en route.
- **Outil interne pour tes équipes** (suivi de chantier, inventaire, formulaires terrain) : web app dans la plupart des cas, cross-platform si le hors ligne profond ou le matériel (scan, capteurs) devient central. Bonus de la web app : pas de review des stores pour chaque mise à jour.
- **Service avec abonnement et usage quotidien** (coaching, suivi santé, apprentissage) : app cross-platform. Les notifications et la présence sur l'écran d'accueil sont le moteur de la rétention, et la rétention est le moteur de l'abonnement.
- **Marketplace ou service local avec géolocalisation** : app cross-platform, souvent accompagnée d'une version web pour la découverte et le référencement.
- **E-commerce de produits physiques** : commence par le site web mobile, excellent et suffisant dans la majorité des cas (et les stores ne prennent pas de commission sur les biens physiques). L'app ne se justifie que quand une base de clients fidèles existe déjà.
- **Jeu, app photo ou vidéo poussée, audio temps réel** : là on touche aux cas où le natif pur ou des moteurs spécialisés se justifient. Si tu es dans cette catégorie, tu le sais déjà.

:::astuce
Le test le plus simple pour trancher : demande-toi à quelle fréquence ton utilisateur idéal ouvrira ton produit. Plusieurs fois par semaine : app des stores. Quelques fois par mois ou moins : web app, et réinvestis la différence de budget dans le produit lui-même.
:::

## Les coûts comparés, ordres de grandeur 2026

Pour un même service de complexité moyenne (comptes utilisateurs, données synchronisées, paiement) :

| Chemin | Développement initial | Ce qui s'ajoute |
| --- | --- | --- |
| Web app | 5 000 à 25 000 € en prestation | Hébergement, domaine, maintenance |
| Cross-platform | 10 000 à 50 000 € en prestation | Comptes développeur (99 $ par an chez Apple, 25 $ une fois chez Google), commissions, maintenance des deux stores |
| Natif pur (deux apps) | 30 000 à 120 000 € et plus | Idem, avec deux équipes à faire vivre |

Et si tu construis toi-même avec l'IA et une formation, ces trois chemins descendent à quelques centaines d'euros de frais réels, payés en temps d'apprentissage : c'est un changement profond de 2026, et il vaut pour la web app comme pour React Native.

Note l'écart entre cross-platform et natif pur : à fonctionnalités égales, tu paies quasiment deux fois. C'est pour ça que le natif pur est devenu un choix d'exception, réservé aux projets où la performance extrême ou une intégration très profonde à la plateforme est le produit lui-même.

:::attention
Méfie-toi du faux compromis : l'app « hybride » qui n'est qu'un site web emballé dans une coquille d'application. Apple rejette régulièrement ces apps (règle 4.2, app trop minimale), et l'expérience utilisateur trahit vite le procédé. Si tu vas sur les stores, vas-y avec une vraie app construite avec des composants natifs, ce que React Native fait précisément.
:::

## La stratégie qui gagne souvent : web d'abord, app ensuite

Beaucoup de bons produits suivent ce chemin : une web app pour valider que des gens veulent le service, payent, reviennent. Puis, quand la rétention est prouvée, l'app des stores pour amplifier (notifications, fidélité, visibilité). L'investissement app arrive au moment où il rapporte, pas avant.

L'inverse (l'app d'abord, le web jamais) est le chemin par défaut de ceux qui n'ont pas fait le calcul, et c'est souvent le plus cher pour apprendre la même chose.

## Ce qu'il faut retenir

Web app si ton usage est ponctuel et ta découverte passe par Google : c'est le meilleur rapport valeur-prix. App cross-platform si ton modèle vit de l'engagement, des notifications et des stores. Natif pur si, et seulement si, ton produit l'exige techniquement. Et dans tous les cas, décide sur tes chiffres à toi : fréquence d'usage, canal de découverte, modèle de revenu.

Si tu hésites encore sur ton cas précis, décris-le via [notre page devis](../devis.html) : on te dira quel chemin on prendrait à ta place, y compris si c'est le moins cher des trois. Et si tu veux apprendre à construire les deux, web et mobile, c'est le cœur du parcours [Capmedia Academy](https://academy.capmedia.app).
