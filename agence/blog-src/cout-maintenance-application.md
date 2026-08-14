---
id: cout-maintenance-application
titre: Combien coûte la maintenance d'une application mobile ?
description: De 150 € par an en autonomie à 15-20 % du coût de développement en prestataire : les postes réels de la maintenance d'une app, et comment les contenir.
date: 2026-07-28
auteur: Nadir Ben Salah
categorie: Business
motsCles: coût maintenance application, maintenance app mobile prix, budget annuel application, mise à jour application coût, frais récurrents app, contrat maintenance application
---

La maintenance d'une application mobile coûte entre 150 et 500 € par an en frais fixes incompressibles (comptes développeur, serveurs, domaine) si tu fais le travail toi-même, de 1 000 à 6 000 € par an en forfait chez un prestataire pour une app simple, et la règle générale du marché situe la maintenance annuelle d'une app d'entreprise entre 15 et 20 % de son coût de développement initial. Une app « finie » qu'on ne touche plus n'existe pas : les systèmes d'exploitation, les règles des stores et les bibliothèques bougent chaque année, avec ou sans toi.

Voici les postes réels, les fourchettes honnêtes, ce qui fait exploser la facture et comment la contenir.

## Pourquoi une app ne peut pas être « finie »

C'est la différence fondamentale avec un site vitrine, qui peut vivre des années sans retouche. Une app est prise dans trois calendriers qui ne t'appartiennent pas :

- **Les OS bougent chaque année.** Apple sort un iOS majeur chaque septembre, Google un Android chaque automne. La plupart des mises à jour sont indolores, mais chaque version apporte son lot de changements qui finissent par casser quelque chose : permissions redéfinies, API dépréciées, comportements modifiés.
- **Les stores imposent des planchers.** Google exige que les apps ciblent un niveau d'API Android récent, relevé chaque année : une app non mise à jour devient invisible pour les nouveaux appareils, puis sort des radars. Apple exige un SDK iOS récent pour toute soumission et retire périodiquement les apps à l'abandon lors de ses nettoyages.
- **Les dépendances vieillissent.** Une app moderne embarque des dizaines de bibliothèques tierces. Chacune évolue, corrige des failles, abandonne d'anciennes versions. Deux ans sans mise à jour, et le chantier de rattrapage coûte plus cher que deux ans d'entretien régulier.

La maintenance n'est donc pas une option de confort : c'est le loyer de la présence sur les stores.

## Les postes réels, un par un

### Les frais fixes incompressibles

Quoi qu'il arrive, même pour une app qui ne change jamais :

| Poste | Coût annuel | Remarque |
| --- | --- | --- |
| Compte développeur Apple | 99 $ (environ 92 €) | Chaque année ; sans renouvellement, l'app finit retirée |
| Compte développeur Google Play | 0 € | 25 $ une seule fois à l'inscription |
| Nom de domaine | 10 à 20 € | Pour le site, la politique de confidentialité, les e-mails |
| Serveurs et backend | 0 à 600 € | Voir le détail ci-dessous |

Côté serveurs, tout dépend de l'architecture. Une app sans compte utilisateur ni données en ligne peut tourner pour 0 €. Une app classique sur un backend managé (Firebase, Supabase et équivalents) reste dans les offres gratuites ou à quelques dizaines d'euros par mois tant que l'audience est modeste, soit 0 à 600 € par an. Un serveur dédié avec base de données administrée démarre plutôt à 30-100 € par mois, avant même le temps humain pour l'entretenir.

### Le travail récurrent

C'est le vrai cœur du budget, et il se divise en trois natures de tâches :

1. **La maintenance corrective** : les bugs découverts en production, les crashs remontés par les outils de suivi, les avis à une étoile qui signalent un problème réel. Imprévisible par définition, elle se budgète par une enveloppe.
2. **La maintenance adaptative** : suivre les OS, les SDK et les règles des stores. Le rythme réaliste : une à deux campagnes de mises à jour par an, dont la traversée de septembre (nouvel iOS, nouveaux iPhone) qui mérite systématiquement un passage de tests. Pour une app simple et bien construite, compte 2 à 5 jours de travail par an ; davantage si l'app touche aux capteurs, à la caméra ou aux notifications, zones les plus sensibles aux changements d'OS.
3. **La maintenance évolutive** : les nouvelles fonctionnalités. À bien séparer des deux premières dans ta tête et dans les contrats : c'est du développement, pas de la maintenance, et c'est le poste que tu pilotes librement.

### Les fourchettes selon qui fait le travail

| Situation | Budget annuel réaliste | Ce que ça couvre |
| --- | --- | --- |
| Tu maintiens toi-même une app simple | 150 à 700 € + ton temps | Frais fixes ; le travail, c'est tes soirées |
| Forfait prestataire, app simple | 1 000 à 6 000 € (80 à 500 €/mois) | Frais fixes, correctifs, mises à jour OS/SDK |
| Forfait prestataire, app avec backend et paiements | 4 000 à 15 000 € | Idem plus supervision serveur, astreinte partielle |
| App d'entreprise développée sur mesure | 15 à 20 % du coût de développement initial | La règle standard du secteur |

Cette dernière ligne mérite d'être explicitée : une app qui a coûté 40 000 € à développer appelle un budget de maintenance de 6 000 à 8 000 € par an. C'est la norme du marché, pas une marge d'agence : elle reflète le volume de code à entretenir. Et elle éclaire en creux l'avantage des apps construites simplement : moins de code, moins de loyer.

## Ce qui fait exploser la facture

Les dépassements de budget de maintenance ont presque toujours les mêmes causes :

- **L'abandon prolongé.** Deux ans sans mise à jour, puis obligation de tout rattraper d'un coup : versions de framework sautées les unes par-dessus les autres, bibliothèques abandonnées à remplacer, tests complets à refaire. Le rattrapage coûte régulièrement 3 à 5 fois ce qu'aurait coûté l'entretien continu.
- **Les dépendances exotiques.** Chaque bibliothèque peu maintenue embarquée « pour gagner du temps » au développement devient une bombe à retardement : le jour où elle casse avec un nouvel OS, il faut la remplacer, et parfois réécrire tout ce qui s'appuyait dessus.
- **Le backend sur mesure sans nécessité.** Un serveur à soi, c'est des mises à jour de sécurité, des sauvegardes, de la supervision, des montées de version de base de données : un deuxième produit à entretenir à côté de l'app.
- **La confusion maintenance-évolution.** Le budget « maintenance » qui sert en réalité à ajouter des fonctionnalités chaque mois n'est pas un budget de maintenance : c'est du développement continu, légitime, mais qui doit être nommé et chiffré comme tel.
- **L'app codée deux fois.** Une app native écrite séparément pour iOS et Android double mécaniquement une partie du travail d'entretien. C'est l'une des raisons pour lesquelles les frameworks multiplateformes (React Native, Flutter) dominent chez les indépendants et les PME.

## Comment contenir les coûts

Les leviers efficaces se décident surtout avant et pendant le développement, pas après :

1. **Choisir une stack standard et massivement utilisée.** React Native avec Expo, par exemple, mutualise l'essentiel du travail d'adaptation aux nouveaux OS : les mises à jour du framework absorbent la majorité des changements d'iOS et d'Android avant qu'ils ne te concernent.
2. **Préférer un backend managé.** Firebase, Supabase et équivalents déplacent la maintenance serveur (sécurité, sauvegardes, montées de version) chez des équipes dont c'est le métier, pour un coût marginal à petite échelle.
3. **Limiter les dépendances.** Chaque bibliothèque ajoutée est un engagement d'entretien. La question à se poser à chaque ajout : « est-ce que je veux maintenir ça pendant cinq ans ? »
4. **Mettre à jour petit et souvent.** Une passe légère par trimestre coûte moins cher, en argent et en risque, qu'une grande révision tous les deux ans.
5. **Installer la supervision dès le premier jour.** Suivi de crashs et alertes basiques : les problèmes détectés en heures se corrigent en heures ; détectés par une vague d'avis négatifs, ils coûtent la note de l'app en plus du correctif.

:::astuce
Avant de signer un contrat de maintenance, fais préciser trois choses : ce qui est inclus (correctifs ? mises à jour d'OS ? petites évolutions ?), le plafond d'heures mensuel et le sort des heures non consommées, et le coût des interventions hors forfait. Les mauvaises surprises des forfaits de maintenance viennent presque toujours du flou sur la frontière entre corriger et faire évoluer.
:::

:::attention
Intègre la maintenance dans les maths de rentabilité dès le départ. Une app qui doit générer 200 € par mois pour te sembler viable doit en réalité en générer 200 plus le douzième de son budget de maintenance annuel. Beaucoup de projets « presque rentables » ne le sont pas du tout une fois ce loyer compté ; mieux vaut le savoir avant de construire.
:::

## Ce qu'il faut retenir

La maintenance d'une app, c'est un plancher de 150 à 500 € par an de frais fixes en autonomie, 1 000 à 6 000 € par an en forfait prestataire pour une app simple, et 15 à 20 % du coût de développement pour les apps d'entreprise. Les vrais déterminants du coût se fixent au moment de la conception : stack standard, backend managé, peu de dépendances, mises à jour régulières. Une app bien construite coûte remarquablement peu à entretenir ; une app bricolée ou abandonnée présente tôt ou tard une facture de rattrapage.

Si tu veux un devis de maintenance pour une app existante, ou une app neuve pensée pour coûter peu à entretenir, décris ton projet via [notre page devis](../devis.html). Et si tu veux apprendre à maintenir ton app toi-même, mises à jour et publication comprises, c'est ce qu'enseigne [Capmedia Academy](https://academy.capmedia.app).
