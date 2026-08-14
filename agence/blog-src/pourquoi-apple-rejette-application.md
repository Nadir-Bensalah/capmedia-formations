---
id: pourquoi-apple-rejette-application
titre: Pourquoi Apple rejette votre application (et comment répondre)
description: Guidelines 2.1, 4.3, 5.1.1, 3.1.1 : les motifs de rejet App Store les plus fréquents, comment lire le message du reviewer, y répondre, insister ou céder.
date: 2026-08-06
auteur: Nadir Ben Salah
categorie: Stores
motsCles: rejet app store, apple rejette application, guideline 2.1 apple, guideline 4.3 spam, répondre reviewer apple, résolution center app store, appel app review
---

Apple rejette votre application pour une poignée de motifs récurrents : l'app incomplète ou qui plante (guideline 2.1), le spam et les apps trop similaires (4.3), les manquements sur les données personnelles (5.1.1), et les paiements qui contournent le système d'Apple (3.1.1). Un rejet n'est ni rare ni grave : c'est un message dans le Resolution Center, avec le numéro de la règle, auquel on peut répondre, et une resoumission corrigée passe le plus souvent en 24 à 48 heures. La vraie compétence, c'est de savoir lire le motif, décider si on corrige ou si on argumente, et répondre proprement.

Voici les motifs fréquents avec leurs numéros, la méthode pour lire un rejet, et quand il faut tenir tête au reviewer.

## D'abord, dédramatiser : le rejet est le fonctionnement normal

Apple examine chaque soumission, humainement et automatiquement, contre ses App Review Guidelines, un document public numéroté que tout développeur devrait avoir parcouru une fois. Une part substantielle des soumissions est rejetée au moins une fois, y compris chez les studios expérimentés ; les premières apps d'un compte le sont plus souvent encore. Le cycle rejet-correction-resoumission fait partie du processus, et chaque resoumission est en général traitée en 24 à 48 heures.

Le rejet arrive dans App Store Connect, dans le **Resolution Center** (centre de résolution) : un message qui cite le ou les numéros de guideline enfreints, un texte explicatif souvent générique, et parfois des captures d'écran de ce que le reviewer a vu. Tout se joue ensuite dans ta réponse.

## Les motifs fréquents et leurs numéros

| Guideline | Motif | Cas typiques |
| --- | --- | --- |
| 2.1 | App incomplète, qui plante, ou invérifiable | Crash au lancement, compte de démo manquant ou invalide, fonctionnalités « à venir », serveur de test éteint |
| 4.3 | Spam, app trop similaire à d'autres | Apps générées à la chaîne, énième variante d'un concept saturé, même app republiée sous plusieurs noms |
| 5.1.1 | Collecte et permissions des données | Pas de suppression de compte dans l'app, permissions demandées sans justification claire, inscription exigée sans nécessité |
| 3.1.1 | Paiements hors achats intégrés | Vente de contenu numérique via Stripe ou un lien externe non autorisé, mention de prix ou d'abonnement extérieurs |
| 2.3 | Fiche trompeuse | Captures qui ne correspondent pas à l'app, description qui promet ce que l'app ne fait pas |
| 4.2 | App trop minimale | Site web encapsulé, app sans fonctionnalité native réelle |
| 5.1.2 | Partage de données non déclaré | SDK qui collectent sans que les étiquettes de confidentialité le disent |

Trois de ces motifs méritent un développement, parce qu'ils se gèrent différemment.

### 2.1 : le rejet le plus fréquent, et le plus évitable

La guideline 2.1 (« App Completeness ») couvre tout ce qui empêche le reviewer de tester : crashs, bugs bloquants, mais surtout le fameux **compte de démonstration**. Si ton app demande une connexion, tu dois fournir des identifiants de test valides dans le champ prévu, sur un environnement qui fonctionne le jour de la review. La moitié des rejets 2.1 que l'on voit passer viennent de là : compte expiré, serveur de staging éteint, code SMS impossible à recevoir par le reviewer. Prépare un compte de démo dédié, sans vérification par SMS, testé juste avant la soumission.

### 4.3 : le rejet structurel

Le 4.3 (« Spam ») ne reproche pas un bug mais l'existence même de l'app : trop similaire à d'autres, pas assez distinctive. Il frappe les apps générées par des gabarits, les concepts ultra-saturés (lampes de poche, calculatrices, fonds d'écran, quiz génériques) et les développeurs qui republient la même app déclinée. C'est le rejet le plus difficile à contester, car la réponse d'Apple attendue n'est pas une correction mais une différenciation réelle : fonctionnalités propres, valeur ajoutée démontrable. Si ton app est un gabarit à peine habillé, le 4.3 est un verdict sur le produit, pas sur le code.

### 3.1.1 : la règle d'argent

Le 3.1.1 impose que les biens et services **numériques** consommés dans l'app passent par le système d'achats intégrés d'Apple (avec sa commission de 15 à 30 %). Vendre un abonnement à ton contenu via Stripe dans l'app : rejet. Les exceptions sont réelles mais encadrées : biens et services physiques (livraisons, réservations, e-commerce) qui peuvent utiliser leur propre paiement, apps « reader » et, selon les régions et les évolutions réglementaires récentes (notamment en Europe et aux États-Unis), des possibilités de liens externes vers ton site. Ce terrain bouge vite et les conditions sont précises : en cas de doute, la voie sûre reste l'achat intégré, et la lecture attentive de la section 3.1 avant de concevoir ton modèle de paiement, pas après.

## Comment lire un rejet (sans paniquer)

La méthode en quatre temps :

1. **Isole le numéro de guideline.** C'est lui qui dit la nature du problème ; le texte qui l'accompagne est souvent un paragraphe standard.
2. **Lis la guideline citée en entier**, dans le document officiel. Le message du reviewer paraphrase ; la règle exacte contient souvent le détail qui explique ton cas.
3. **Regarde les pièces jointes.** Les captures du reviewer montrent l'écran exact qui a posé problème, et l'appareil utilisé (les rejets « ça plante sur iPad » viennent souvent d'un iPad que tu n'as jamais testé).
4. **Classe le rejet** : malentendu (le reviewer n'a pas trouvé ou pas compris quelque chose), correction (il a raison, il faut modifier l'app), ou désaccord (tu es dans les règles et il se trompe). La suite dépend entièrement de cette classification.

## Comment répondre au reviewer

Le Resolution Center est une conversation : tu peux répondre sans resoumettre, et c'est souvent la bonne première action.

- **Malentendu** : réponds avec des faits précis. Où se trouve la fonctionnalité, comment reproduire, identifiants rappelés, et si besoin une courte vidéo de démonstration (hébergée en lien non répertorié). Beaucoup de rejets 2.1 se lèvent par une simple réponse claire, sans toucher au code.
- **Correction** : corrige, indique dans les notes de review ce qui a changé et en réponse à quel point, et resoumets. Les reviewers apprécient les réponses qui listent point par point ; ça accélère la deuxième passe.
- **Désaccord** : réponds d'abord dans le Resolution Center en citant la guideline elle-même et en expliquant, calmement et factuellement, pourquoi ton app la respecte. Si le refus persiste et que tu es solide sur le fond, il existe une voie d'**appel formel** auprès de l'App Review Board, depuis App Store Connect. Les appels aboutissent réellement quand l'argumentaire est précis ; les appels d'humeur, jamais.

:::astuce
Utilise les notes de review avant même le premier rejet. Le champ « Notes » de la soumission est fait pour ça : explique ce que fait l'app, à qui elle s'adresse, comment tester les parcours non évidents, et signale ce qui pourrait surprendre (mode hors-ligne, matériel requis, contenu en français). Un reviewer qui comprend ton app en trente secondes rejette beaucoup moins.
:::

## Quand insister, quand céder

**Insiste** quand le rejet repose sur une erreur factuelle : la fonctionnalité existe mais n'a pas été trouvée, le crash vient d'un environnement de test mal configuré côté reviewer, la guideline citée ne s'applique pas à ton cas. Les reviews sont faites par des humains sous cadence ; les erreurs existent, et une réponse documentée est souvent suffisante. Deux règles : toujours factuel, jamais agressif ; et une vidéo vaut mille arguments.

**Cède** quand le rejet touche aux règles structurelles : le 3.1.1 sur les paiements ne se négocie pas, le 5.1.1 sur la suppression de compte non plus, et un 4.3 répété est un signal marché plus qu'une injustice. Chaque cycle de contestation coûte des jours ; si la mise en conformité coûte moins cher que la bataille, la question est réglée.

**Le cas particulier du rejet répété en boucle** : si la même version est rejetée plusieurs fois avec des motifs qui varient, demande explicitement dans le Resolution Center un exemple précis et actionnable (« pouvez-vous m'indiquer l'écran exact et le parcours qui pose problème ? »). Les reviewers répondent, et cette simple question débloque des dossiers enlisés.

:::attention
Ne resoumets jamais la même version sans rien changer « pour tomber sur un autre reviewer ». Ça arrive parfois de passer, mais les resoumissions identiques répétées sont repérées, allongent les délais, et dans les cas extrêmes exposent le compte à des mesures plus sévères. Chaque resoumission doit contenir soit un changement, soit une réponse argumentée dans le Resolution Center.
:::

## Ce qu'il faut retenir

Un rejet Apple, c'est un numéro de guideline à lire, un classement à faire (malentendu, correction ou désaccord) et une réponse adaptée dans le Resolution Center. Les motifs sont concentrés : complétude et compte de démo (2.1), similarité (4.3), données et suppression de compte (5.1.1), paiements (3.1.1). On insiste, faits à l'appui, quand le reviewer se trompe ; on cède vite quand la règle est structurelle. Et on prévoit le rejet dans le planning : soumettre deux semaines avant toute date annoncée reste la meilleure assurance.

Si tu veux mettre toutes les chances de ton côté avant de soumettre, notre service de test avant soumission passe ton app au crible des guidelines : décris ton app via [notre page devis](../devis.html). Et si tu veux comprendre tout le processus de publication pour le maîtriser toi-même, il est enseigné pas à pas sur [Capmedia Academy](https://academy.capmedia.app).
