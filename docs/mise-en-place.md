# Mise en place : de zéro à « le paiement fonctionne »

Compte **2 à 3 heures** la première fois. Les étapes sont dans l'ordre : chacune
dépend de la précédente. Ne saute pas, ne réordonne pas.

À la fin, un inconnu peut payer et se retrouver dans la formation, sans que tu
touches à quoi que ce soit.

---

## Vue d'ensemble

```
   Client                Stripe              Cloud Function          Firestore
     │                     │                       │                     │
     │──── paie ──────────►│                       │                     │
     │                     │── checkout.session ──►│                     │
     │                     │      .completed       │── acheteurs/{mail} ►│
     │◄─── merci.html ─────│                       │                     │
     │                                                                   │
     │──── acces.html : saisit son e-mail ──► Firebase envoie un lien    │
     │◄─── clique le lien ──────────────────► connecté                   │
     │                                                                   │
     │──── /app/ ──── les règles vérifient acheteurs/{son mail} ────────►│
     │◄─── le contenu des leçons ────────────────────────────────────────│
```

Le point important : **le document `acheteurs/{email}` est la seule clé d'accès**,
et il n'est écrit que par le webhook Stripe. Personne ne peut se l'attribuer.

---

## 1 · Firebase (30 min)

### Créer le projet

1. [console.firebase.google.com](https://console.firebase.google.com) → Ajouter un projet
2. Nom : `capmedia-academy`
3. **Décoche Google Analytics** : inutile ici, et ça ajoute des obligations de
   déclaration si tu publies un jour une app liée au même compte

### Firestore

Menu **Firestore Database** → Créer une base :

- Mode : **production** (jamais le mode test)
- Région : **`europe-west1`** : définitif, et ça garde les données dans l'UE

### Authentication

Menu **Authentication** → Get started → onglet **Sign-in method** :

1. Active **E-mail/Mot de passe**
2. **À l'intérieur**, active aussi **Lien envoyé par e-mail (connexion sans mot de passe)**
3. Enregistre

Puis onglet **Settings → Authorized domains**, ajoute :

```
nadir-bensalah.github.io
capmedia.tn                 (quand le domaine sera branché)
```

> Sans cette étape, l'envoi du lien échoue avec `auth/unauthorized-continue-uri`.

### Récupérer la configuration web

Roue dentée → **Paramètres du projet** → section « Tes applications » →
icône **`</>`** → enregistre l'app (pas besoin de Firebase Hosting).

Copie l'objet `firebaseConfig` et colle-le dans
[`assets/js/config.js`](../assets/js/config.js) :

```js
firebase: {
  apiKey:            'AIza…',
  authDomain:        'capmedia-academy.firebaseapp.com',
  projectId:         'capmedia-academy',
  storageBucket:     'capmedia-academy.appspot.com',
  messagingSenderId: '…',
  appId:             '1:…',
},
```

:warning: Ces clés sont **publiques par conception**. Ce ne sont pas des secrets :
elles identifient ton projet, elles ne l'autorisent pas. Ce sont les règles
Firestore qui protègent les données.

### Déployer les règles

```bash
npm install -g firebase-tools
firebase login
cd ~/Downloads/00_WEBAPPS/AtelierZero
firebase use --add          # choisis le projet capmedia-academy
firebase deploy --only firestore:rules
```

### Le plafond de dépenses : ne saute pas

Console Google Cloud → **Facturation → Budgets et alertes** → créer un budget de
**5 €** avec alertes à 50 %, 90 % et 100 %. Deux minutes, et tu ne recevras jamais
de facture surprise.

---

## 2 · Envoyer le contenu dans Firestore (10 min)

Le dossier `contenu/` **n'est pas** dans le dépôt public (voir `.gitignore`).
C'est le produit que tu vends : il vit dans Firestore.

### Générer une clé de service

Paramètres du projet → onglet **Comptes de service** → **Générer une nouvelle clé
privée**. Un fichier `.json` se télécharge.

**Range-le hors du dépôt.** Par exemple `~/.cles/capmedia-academy-admin.json`.

### Envoyer

```bash
cd ~/Downloads/00_WEBAPPS/AtelierZero
npm install firebase-admin

# vérifie d'abord ce qui va partir, sans rien écrire
node outils/seed.mjs --sec

export GOOGLE_APPLICATION_CREDENTIALS=~/.cles/capmedia-academy-admin.json
node outils/seed.mjs
```

Tu dois voir les 14 modules et environ 25 000 mots. Le script crée deux
collections :

| Collection | Contenu | Lu par |
|---|---|---|
| `lecons/{id}` | titre, ordre, résumé, durée, offre | le sommaire, en une requête |
| `contenus/{id}` | le markdown du cours | à l'ouverture d'un module |

Ce découpage est imposé par Firestore : une requête de collection ne peut pas
filtrer sur `resource.data`, un `getDoc` individuel si. C'est ce qui permet de
verrouiller les bonus « Complet » par acheteur.

**Relance `node outils/seed.mjs` à chaque fois que tu modifies un module.**

---

## 3 · Stripe (40 min)

### Le compte

[dashboard.stripe.com](https://dashboard.stripe.com) → crée le compte, renseigne
l'entreprise et les coordonnées bancaires. Reste en **mode test** tant que tout
n'est pas vérifié de bout en bout.

### Les deux produits

Catalogue de produits → **+ Ajouter un produit**, deux fois :

| Produit | Prix | Type |
|---|---|---|
| Capmedia Academy : Essentiel | 97,00 € | Paiement unique |
| Capmedia Academy : Complet | 197,00 € | Paiement unique |

### Les Payment Links

Pour chaque produit → **Créer un lien de paiement**. Réglages qui comptent :

- **Après le paiement** → « Rediriger les clients vers votre site web »
  → `https://nadir-bensalah.github.io/capmedia-formations/merci.html`
- **Collecter l'adresse e-mail** → activé (c'est elle qui ouvre l'accès)
- **Autoriser les codes promo** → à toi de voir
- **3 fois sans frais** → active *Klarna* ou *Paiement en plusieurs fois* si tu le proposes

Colle les deux URL obtenues dans [`assets/js/config.js`](../assets/js/config.js) :

```js
stripe: {
  essentiel: 'https://buy.stripe.com/xxxxxxxx',
  complet:   'https://buy.stripe.com/yyyyyyyy',
},
```

### Le webhook

C'est lui qui ouvre l'accès. Deux temps : déployer la fonction, puis la déclarer
dans Stripe.

**a. Déployer la fonction**

```bash
cd fonctions && npm install && cd ..

firebase functions:secrets:set STRIPE_SECRET
#   → colle ta clé secrète Stripe (sk_test_… puis sk_live_…)

firebase functions:secrets:set ADMIN_CLE
#   → invente une longue chaîne aléatoire, garde-la

firebase deploy --only functions
```

La console affiche l'URL de la fonction, du type :

```
https://europe-west1-capmedia-academy.cloudfunctions.net/stripeWebhook
```

> Le déploiement de Cloud Functions exige le plan **Blaze** (à l'usage). Avec le
> plafond de 5 € posé à l'étape 1, tu ne risques rien : ce webhook consomme
> quelques centimes par an.

**b. Déclarer le webhook dans Stripe**

Développeurs → **Webhooks** → Ajouter un point de terminaison :

- URL : celle que tu viens d'obtenir
- Événement à écouter : **`checkout.session.completed`**, et lui seul

Stripe affiche alors un **secret de signature** (`whsec_…`). Enregistre-le :

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions      # redéploie pour prendre le secret
```

> Sans la vérification de signature, n'importe qui pourrait appeler ton URL et
> s'offrir la formation. C'est le seul point de cette architecture où une erreur
> coûte de l'argent.

---

## 4 · Le test de bout en bout (15 min)

En **mode test** Stripe, avec la carte `4242 4242 4242 4242`, n'importe quelle
date future et n'importe quel CVC.

1. Ouvre la landing, clique « Prendre l'Essentiel »
2. Paie avec une adresse e-mail **réelle** à toi
3. Tu arrives sur `merci.html`
4. **Console Firebase → Firestore** : le document `acheteurs/ton@email.fr` existe,
   avec `offre: "essentiel"`
5. Clique « Ouvrir ma formation » → saisis la même adresse
6. Tu reçois le lien par e-mail, tu cliques
7. Tu es dans `/app/`, les 12 modules sont lisibles
8. Les 2 modules bonus affichent le cadenas : c'est correct pour l'Essentiel
9. Coche un module, recharge la page : la progression a tenu

Puis refais tout avec l'offre **Complet** et une **autre** adresse : les 14 modules
doivent être ouverts.

### Le test qui compte vraiment

Ouvre `/app/` dans une **fenêtre de navigation privée**, sans être connecté.
Tu dois être renvoyé vers `acces.html`, et la console réseau ne doit contenir
**aucun contenu de leçon**. Si tu vois du markdown passer, les règles Firestore
ne sont pas déployées : reprends l'étape 1.

---

## 5 · Passer en production

1. Stripe : bascule en **mode réel**, recrée les deux Payment Links, remplace les
   URL dans `config.js`
2. Recrée le webhook en mode réel, récupère le nouveau `whsec_…`, refais
   `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` puis redéploie
3. Fais **un vrai achat à 97 €** avec ta propre carte, vérifie toute la chaîne,
   puis rembourse-toi depuis le tableau de bord Stripe
4. Publie les pages `mentions.html` et `cgv.html` (obligatoires : voir plus bas)

---

## Ouvrir un accès à la main

Client qui s'est trompé d'adresse, achat hors Stripe, geste commercial :

```bash
curl -X POST https://europe-west1-capmedia-academy.cloudfunctions.net/ouvrirAcces \
  -H "Content-Type: application/json" \
  -d '{"cle":"<ADMIN_CLE>","email":"client@exemple.fr","offre":"complet"}'
```

Pour retirer un accès (après remboursement) : supprime le document
`acheteurs/{email}` depuis la console Firestore.

---

## Obligations légales : à ne pas repousser

Tu vends un produit numérique à des consommateurs français. Il te faut :

- **Mentions légales** : identité de l'éditeur, SIRET, hébergeur, contact
- **CGV** : prix TTC, ce qui est livré, garantie 30 jours, médiation à la consommation
- **Le droit de rétractation de 14 jours** : pour un contenu numérique fourni
  immédiatement, il faut faire cocher au client une renonciation expresse au
  moment du paiement (art. L221-28 13° du code de la consommation). Stripe permet
  d'ajouter une case à cocher personnalisée dans le Payment Link : **utilise-la.**
  Sans ça, ta garantie 30 jours devient une rétractation de 14 jours non maîtrisée.
- **⚠️ La revue personnelle est une prestation de service, pas du contenu
  numérique.** La renonciation ci-dessus ne la couvre pas : pour un service, le
  délai de 14 jours court tant que la prestation n'est pas exécutée
  (art. L221-25). Concrètement, un client peut demander sa revue puis se
  rétracter. Deux lignes à écrire dans les CGV pour te protéger :
  1. la revue s'exécute **à la demande expresse du client**, qui reconnaît perdre
     son droit de rétractation une fois la revue livrée ;
  2. elle porte sur **une application, un passage**, sous 7 jours ouvrés, dans la
     limite des places du mois.
- **Ne promets jamais l'acceptation par Apple.** « Je te dis ce qui va coincer »
  est une obligation de moyens. « Ton app sera acceptée » serait une obligation
  de résultat que tu ne peux pas tenir : et une pratique commerciale trompeuse.
- **TVA** : si tu vends depuis la France à des particuliers de l'UE, le guichet
  unique OSS s'applique au-delà de 10 000 €/an de ventes transfrontalières
- **RGPD** : une politique de confidentialité, la même que celle que tu enseignes
  au module 9

Le gabarit des pages légales est décrit dans la **passe 3** de
[`prompt-charte-claude-design.md`](./prompt-charte-claude-design.md).

---

## Branchement du domaine

Quand `capmedia.tn` (ou un sous-domaine) sera prêt :

1. Crée un fichier `CNAME` à la racine du dépôt, contenant le domaine seul :
   ```
   academy.capmedia.tn
   ```
2. Chez ton registrar, ajoute un enregistrement **CNAME** :
   `academy` → `nadir-bensalah.github.io`
3. Dépôt GitHub → Settings → Pages → renseigne le domaine, coche **Enforce HTTPS**
4. Mets à jour dans `config.js` : `urlAcces`
5. Ajoute le domaine dans **Firebase → Authentication → Authorized domains**
6. Mets à jour l'URL de redirection des deux Payment Links Stripe

---

## Ce qui reste à produire

Ce ne sont pas des oublis, ce sont des livrables identifiés :

- [ ] **Le code source de Rituel** : promis dans l'offre Complet. Il faut
      construire l'app pour de vrai. À faire avant le premier euro encaissé sur
      cette offre.
- [ ] Les captures d'écran d'App Store Connect (modules 8, 9, 10)
- [ ] La photo du formateur sur la landing
- [ ] Les pages `mentions.html` et `cgv.html`
- [ ] L'image Open Graph `assets/img/og.png` : prompt n° 2 dans
      [`prompts-claude-design.md`](./prompts-claude-design.md)
- [ ] La section témoignages, masquée tant qu'il n'y a pas de vrais retours
