---
id: publier-app-app-store-etapes
titre: Publier une application sur l'App Store : les étapes complètes
description: Compte développeur à 99 $, fiche, captures, review en 24 à 48 h : les 7 étapes réelles pour publier sur l'App Store en 2026, et les motifs de rejet fréquents.
date: 2026-06-09
auteur: Nadir Ben Salah
categorie: Stores
motsCles: publier application app store, soumettre app apple, étapes publication app store, review apple délai, rejet app store
---

Publier sur l'App Store demande sept étapes : ouvrir un compte développeur Apple (99 dollars par an), préparer l'app et sa signature, créer la fiche dans App Store Connect, produire les captures d'écran, envoyer le build via TestFlight, remplir les déclarations de confidentialité, puis soumettre à la review, qui répond en général sous 24 à 48 heures. De l'app terminée à l'app en ligne, compte une à trois semaines si tout se passe bien, davantage en cas de rejet.

Voici le parcours complet, étape par étape, avec les délais réels et les pièges qui font échouer les premières soumissions.

## Étape 1 : le compte développeur Apple

Rien ne se passe sans lui. L'inscription à l'Apple Developer Program coûte 99 dollars par an (environ 99 € HT), se fait sur developer.apple.com ou via l'app Apple Developer, et demande une vérification d'identité. Délai : de 48 heures à plusieurs semaines selon les cas, surtout pour les organisations qui doivent fournir un numéro DUNS.

Le conseil qui évite le pire scénario : ouvre ce compte dès le début de ton projet, pas quand l'app est finie. On a détaillé les pièges de l'inscription dans un article dédié.

## Étape 2 : préparer l'app et sa signature

Toute app iOS doit être signée avec des certificats liés à ton compte développeur. Bonne nouvelle de l'époque : tu n'as presque plus à toucher aux certificats à la main. Xcode gère la signature automatiquement, et si tu construis en React Native avec Expo, le service EAS crée et gère certificats et profils pour toi. Si tu te retrouves à manipuler des fichiers .p12 et des provisioning profiles manuellement en 2026, c'est en général le signe que tu suis un tutoriel périmé.

Il te faut aussi un identifiant unique pour ton app (le bundle ID, du type com.tonentreprise.tonapp) : choisis-le bien, il est définitif une fois la première version publiée.

## Étape 3 : la fiche App Store Connect

App Store Connect est le tableau de bord où tout se passe. Tu y crées ta fiche : nom de l'app (30 caractères maximum, unique sur tout le store), sous-titre, description, mots-clés, catégorie, URL de support et politique de confidentialité.

Deux champs pèsent lourd pour être trouvé dans les recherches : le nom et le champ mots-clés (100 caractères, séparés par des virgules, sans espaces après les virgules pour ne pas gaspiller de caractères). La description, elle, sert surtout à convaincre l'humain qui lit.

Il te faut obligatoirement une page de politique de confidentialité en ligne, même pour une app qui ne collecte rien. C'est un motif de blocage bête et fréquent : prévois cette page avant la soumission.

## Étape 4 : les captures d'écran

Apple exige des captures aux formats des tailles d'iPhone en vigueur, et des captures iPad si ton app le supporte. Les exigences précises de format évoluent régulièrement : App Store Connect te dit exactement ce qui manque au moment de l'envoi.

Le piège n'est pas technique, il est marketing : ces captures sont ton premier vendeur. Des captures brutes d'écran font fuir ; des captures avec un titre court au-dessus de chaque écran convertissent nettement mieux. Compte une vraie demi-journée pour les faire correctement, ce n'est pas du temps perdu.

## Étape 5 : envoyer le build et le tester

Le build (le fichier compilé de ton app) s'envoie vers App Store Connect via Xcode, ou via une commande unique avec EAS si tu es sur Expo. Il apparaît ensuite dans TestFlight, l'outil de test d'Apple : installe ta propre app via TestFlight sur un vrai iPhone et refais le parcours complet avant de soumettre. Ce test de dix minutes attrape une quantité étonnante de problèmes, notamment tout ce qui se comporte différemment entre le mode développement et le build de production.

:::astuce
Fais tester par au moins une personne qui ne connaît pas le projet, via TestFlight (jusqu'à 100 testeurs internes sans validation, 10 000 en externe avec une review allégée). Ce que cette personne ne comprend pas, l'équipe de review d'Apple risque de ne pas le comprendre non plus.
:::

## Étape 6 : les déclarations de confidentialité

Avant de soumettre, App Store Connect te fait remplir les « étiquettes de confidentialité » : quelles données ton app collecte, dans quel but, si elles sont liées à l'identité de l'utilisateur. Réponds avec exactitude : les SDK que tu utilises (analytics, crash, publicité) collectent souvent des choses à ta place, et une déclaration incohérente avec le comportement observé de l'app est un motif de rejet.

Si ton app propose la création de compte, elle doit aussi proposer la suppression de compte, dans l'app. C'est une règle ferme depuis des années, et une cause de rejet très courante chez les premières soumissions.

## Étape 7 : la soumission et la review

Tu sélectionnes le build, tu réponds au questionnaire de classification d'âge, tu fournis si besoin un compte de démonstration pour que l'équipe de review puisse tester (obligatoire si ton app demande une connexion), et tu soumets.

Les délais réels en 2026 : la grande majorité des apps reçoivent une réponse en 24 à 48 heures. Apple annonce que 90 pour cent des soumissions sont traitées en moins de 24 heures, et c'est cohérent avec ce qu'on observe. Les cas plus longs existent : première app d'un compte, catégories sensibles (finance, santé, contenu généré par les utilisateurs), demandes d'informations complémentaires.

En cas de rejet, tu reçois le motif avec la règle précise, tu peux répondre, corriger et resoumettre. Chaque cycle recoûte un délai de review.

## Les motifs de rejet fréquents (et comment les éviter)

| Motif | La règle | La parade |
| --- | --- | --- |
| App qui plante ou incomplète | Guideline 2.1 | Tester le build TestFlight, pas la version de développement |
| Compte de démo manquant ou invalide | Guideline 2.1 | Fournir des identifiants de test qui marchent vraiment |
| Pas de suppression de compte | Guideline 5.1.1 | Un bouton de suppression dans l'app, fonctionnel |
| Paiement hors achats intégrés | Guideline 3.1.1 | Les biens numériques passent par le paiement Apple, sauf cas prévus par la réglementation |
| App jugée trop minimale | Guideline 4.2 | Une app qui n'est qu'un site web encapsulé se fait refuser |
| Fiche trompeuse | Guideline 2.3 | Captures et description fidèles à ce que l'app fait |
| Confidentialité incohérente | Guideline 5.1 | Étiquettes exactes, politique de confidentialité en ligne |

Un rejet n'est pas un drame : c'est le quotidien de la publication, y compris pour les studios expérimentés. On lit le motif, on corrige, on resoumet, et la deuxième review est souvent plus rapide. Le vrai risque, ce sont les rejets en boucle pour app trop mince (le 4.2) : là, ce n'est pas un détail à corriger, c'est le produit à muscler.

:::attention
Prévois le rejet dans ton planning. Si ta date de sortie est annoncée publiquement, soumets au moins deux semaines avant. Une app peut être approuvée puis publiée manuellement à la date de ton choix : c'est l'option « publication manuelle » dans App Store Connect, et c'est la bonne façon de viser une date précise.
:::

## Et après la publication

Ton app en ligne, trois habitudes s'installent :

- **Surveille les crashs et les avis** dans App Store Connect : les premiers jours révèlent ce que tes tests ont raté.
- **Renouvelle le compte développeur chaque année** : sans renouvellement des 99 dollars, ton app finit par être retirée du store.
- **Mets à jour régulièrement** : chaque nouvelle version repasse une review (en général rapide), et une app jamais mise à jour finit par être signalée, voire retirée, lors des nettoyages périodiques d'Apple.

La publication n'est donc pas une ligne d'arrivée, c'est un rythme. Mais la première fois reste la plus dure : une fois le circuit compris, publier une mise à jour prend une heure de travail et deux jours d'attente.

Si tu veux qu'on s'occupe de tout le circuit pour toi, ou qu'on vérifie ton app avant soumission pour éviter le rejet, décris ton projet via [notre page devis](../devis.html). Et si tu préfères apprendre à publier toi-même, étape par étape et en français, c'est l'un des modules du parcours [Capmedia Academy](https://academy.capmedia.app).
