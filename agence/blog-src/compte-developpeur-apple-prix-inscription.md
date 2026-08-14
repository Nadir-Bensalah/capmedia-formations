---
id: compte-developpeur-apple-prix-inscription
titre: Compte développeur Apple : prix, inscription et pièges
description: 99 dollars par an, vérification d'identité, DUNS pour les sociétés : le parcours d'inscription au programme développeur Apple en 2026, délais et blocages.
date: 2026-06-23
auteur: Nadir Ben Salah
categorie: Stores
motsCles: compte développeur apple prix, apple developer program inscription, 99 dollars apple, numéro duns apple, compte apple developer bloqué
image: https://images.unsplash.com/photo-1660485651003-39b761a38546?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8YXBwbGUlMjBtYWNib29rJTIwZGVza3xlbnwwfHx8fDE3ODY3MjU2NTF8MA&ixlib=rb-4.1.0&q=80&w=1600
imageAuteur: Klim Musalimov
imageLien: https://unsplash.com/photos/a-black-and-white-photo-of-a-microphone-and-headphones-GjHN6nHUSyc
---

Le compte développeur Apple coûte 99 dollars américains par an (environ 99 € HT, le prix exact dépend du taux de change et de la TVA), à renouveler chaque année sous peine de voir tes apps retirées de l'App Store. L'inscription se fait en ligne, demande une vérification d'identité, et prend de 48 heures à plusieurs semaines : rapide pour une personne physique avec un dossier propre, plus long pour une société qui doit fournir un numéro DUNS.

C'est le péage obligatoire pour publier sur iPhone, et c'est aussi l'étape où un nombre surprenant de projets se retrouvent bloqués des semaines. Voici tout le parcours, avec les pièges connus.

## Ce que les 99 dollars achètent (et ce qu'ils n'achètent pas)

L'Apple Developer Program donne le droit de publier sur l'App Store, l'accès à TestFlight pour faire tester tes apps, aux certificats de signature, aux notifications push, et aux versions bêta d'iOS. Sans lui, tu peux développer et tester sur ton propre iPhone avec un compte gratuit, mais avec des limites fortes (l'app expire au bout de quelques jours sur l'appareil) et aucune possibilité de distribution.

Ce que le paiement ne garantit pas : que tes apps soient acceptées. La review reste souveraine, et les 99 dollars ne sont pas remboursés si ton app est refusée.

À titre de comparaison, Google Play coûte 25 dollars une seule fois. La logique d'Apple est assumée : le paiement annuel filtre les comptes jetables. C'est aussi pour toi une ligne de budget récurrente à ne pas oublier : pas de renouvellement, pas d'app en ligne.

## Personne physique ou organisation : le premier choix, et il compte

Au moment de l'inscription, tu choisis un type de compte. Ce choix est structurant et pénible à changer ensuite.

| Critère | Personne physique | Organisation |
| --- | --- | --- |
| Nom affiché sur l'App Store | Ton nom personnel | Le nom légal de la société |
| Numéro DUNS | Non requis | Obligatoire |
| Délai d'inscription typique | 2 à 7 jours | 1 à 4 semaines et plus |
| Comptes d'équipe | Non, un seul utilisateur | Oui, avec rôles |
| Qui peut s'inscrire | Toute personne majeure | Entité légale (SAS, SARL, association...), pas une micro-entreprise sans personnalité morale distincte |

Deux conséquences pratiques :

- **Si tu es indépendant ou micro-entrepreneur**, tu passeras en général en personne physique, et c'est ton nom qui apparaîtra comme éditeur sur la fiche App Store. Beaucoup le découvrent après coup et le regrettent. C'est un vrai critère : si l'image de marque compte, il faut une société.
- **Si tu as une société**, il te faut un numéro DUNS, un identifiant d'entreprise géré par Dun & Bradstreet. Apple permet de le demander gratuitement via son site. Si ta société n'en a pas, compte jusqu'à 30 jours pour l'obtenir, parfois moins, et vérifie que les informations DUNS (nom légal, adresse) correspondent exactement à celles que tu donneras à Apple : la moindre divergence bloque le dossier.

## Le parcours d'inscription, étape par étape

1. **Un identifiant Apple propre**, avec la double authentification activée (obligatoire) et des informations personnelles exactes : le nom sur le compte doit correspondre à ta pièce d'identité.
2. **L'inscription** sur developer.apple.com ou, souvent plus fluide, via l'app Apple Developer sur iPhone : c'est par elle que passe la vérification d'identité, avec photo de ta pièce d'identité et selfie de contrôle, comme pour ouvrir un compte bancaire en ligne.
3. **Les informations légales** : personne physique (nom, adresse) ou organisation (DUNS, site web, personne habilitée à signer les contrats).
4. **Le paiement** des 99 dollars, par carte bancaire.
5. **L'attente** : e-mail de confirmation, puis activation du compte. Le paiement n'est parfois débité qu'après validation des vérifications, ce qui en déroute plus d'un.

:::astuce
Fais l'inscription depuis l'app Apple Developer sur un iPhone plutôt que depuis le site web quand tu es une personne physique : le parcours de vérification d'identité y est intégré et l'activation est souvent plus rapide. Et fais-la dès le début de ton projet, pas la semaine de la sortie : c'est l'étape dont le délai est le moins prévisible de tout le parcours de publication.
:::

## Les blocages connus, et comment s'en sortir

L'inscription se passe bien dans la majorité des cas. Mais quand elle coince, elle coince de façon opaque, et il vaut mieux connaître les scénarios à l'avance.

- **Le paiement refusé en boucle.** Grand classique : la carte est valide, mais le paiement échoue sans explication. Causes fréquentes : carte virtuelle ou prépayée (à éviter), plafond de paiement à l'étranger, incohérence entre le pays du compte Apple et celui de la carte. Parade : une vraie carte bancaire au même nom que le compte, et vérifier la région de l'identifiant Apple.
- **L'inscription « en attente » qui n'avance plus.** Statut « pending » pendant des semaines, sans e-mail. Là, un seul chemin : contacter le support développeur Apple (formulaire de contact, ou téléphone, en français). Le support est réactif et c'est souvent la seule façon de débloquer un dossier. Ne recrée pas un deuxième compte en parallèle, ça aggrave le cas.
- **La vérification d'identité qui échoue.** Pièce d'identité abîmée, nom du compte Apple différent du nom légal (surnom, nom d'usage), photo floue. Corrige les informations du compte Apple avant de retenter.
- **Le DUNS incohérent.** Le nom légal chez Dun & Bradstreet ne correspond pas exactement aux statuts, ou l'adresse a changé. Il faut faire corriger les données DUNS d'abord, puis revenir vers Apple.
- **Le compte refusé sans détail.** Rare mais réel : Apple peut refuser une inscription, notamment quand elle détecte un lien avec un compte précédemment banni (même adresse, même carte, même appareil). Il n'y a pas de recours magique : le support, la patience, et un dossier irréprochable.

:::attention
Ne passe jamais par un compte développeur « prêté » ou loué par un tiers pour aller plus vite. Ton app serait juridiquement la sienne : c'est lui qui posséderait la fiche, les utilisateurs, les revenus. Récupérer une app publiée sur le compte de quelqu'un d'autre est possible mais pénible, et parfois impossible si la relation tourne mal. Les 99 dollars et l'attente sont le prix de la propriété.
:::

## Les questions qui reviennent

### Le renouvellement, ça se passe comment ?

Chaque année, 99 dollars, avec renouvellement automatique si tu l'actives. Si le compte expire, tes apps sont retirées de l'App Store (les utilisateurs qui les ont déjà les gardent). Elles reviennent après renouvellement, mais l'interruption est mauvaise pour ton classement. Active le renouvellement automatique et vérifie que la carte reste valide.

### Y a-t-il des cas gratuits ?

Oui, un seul qui te concerne peut-être : Apple exonère des frais certaines organisations à but non lucratif, établissements éducatifs et entités gouvernementales, sur demande et dans certains pays. Pour tout le monde, il existe aussi le compte gratuit de test sur son propre appareil, suffisant pour apprendre, insuffisant pour distribuer.

### Puis-je publier plusieurs apps avec un seul compte ?

Oui, autant que tu veux, sans surcoût. Les 99 dollars couvrent le compte, pas chaque app. C'est un point que la question du prix fait souvent oublier : pour un développeur qui publie plusieurs projets, le ticket d'entrée est vite amorti.

### Et en Europe, avec la réglementation ?

Depuis le Digital Markets Act, Apple a ouvert dans l'Union européenne des possibilités de distribution alternatives et ajusté ses conditions à plusieurs reprises. Ça ne change rien à l'essentiel pour toi : pour être sur l'App Store, le programme développeur à 99 dollars reste le passage obligé.

## En résumé

Le compte développeur Apple, c'est 99 dollars par an, un vrai contrôle d'identité, et un délai imprévisible qui se gère en s'y prenant tôt. Personne physique si tu es solo et que ton nom en éditeur ne te gêne pas, organisation avec DUNS si tu as une société et une marque à protéger. Et en cas de blocage, le support Apple, pas un deuxième compte.

C'est typiquement le genre d'étape administrative qu'on gère pour nos clients quand on développe leur application : si tu préfères déléguer tout le parcours, décris ton projet via [notre page devis](../devis.html). Et si tu construis ton app toi-même, le parcours [Capmedia Academy](https://academy.capmedia.app) couvre l'inscription et la publication pas à pas.
