# Capmedia Academy

Plateforme de formations en ligne. Première formation :
**De Zéro à l'App Store** — publier sa première application mobile en 30 jours.

**En ligne** → https://nadir-bensalah.github.io/capmedia-formations/

---

## Ce que c'est

Un site statique sur GitHub Pages, sans serveur à maintenir :

- une **page de vente** publique
- un **paiement Stripe** par Payment Link
- une **connexion sans mot de passe** (lien magique Firebase)
- un **espace membre** dont le contenu vit dans Firestore, pas dans ce dépôt

Le tout coûte ~0 € par mois tant que le volume reste modeste.

## Comment l'accès est protégé

Ce dépôt est **public**, mais la formation ne s'y trouve pas.

```
paiement Stripe  →  webhook (Cloud Function)  →  Firestore: acheteurs/{email}
                                                        │
espace membre  ──── les règles vérifient ce document ───┘
```

Le document `acheteurs/{email}` est la seule clé d'accès, et il n'est écrit que
par le webhook, via le SDK Admin. Personne ne peut se l'attribuer, et connaître
l'URL de `/app/` ne donne accès à rien.

Le dossier `contenu/` est dans le `.gitignore` : le markdown des cours est envoyé
dans Firestore par `outils/seed.mjs` et n'apparaît jamais ici.

## Structure

```
index.html              page de vente
acces.html              connexion par lien magique
merci.html              retour de paiement Stripe
app/index.html          espace membre (coquille — le contenu vient de Firestore)

assets/css/tokens.css   le système de design (source de vérité, ne pas dupliquer)
assets/css/az.css       les 15 composants
assets/css/lecture.css  la colonne de lecture (708px)

assets/js/config.js     clés publiques Stripe + Firebase — à renseigner
assets/js/theme.js      clair / sombre / système
assets/js/site.js       comportements de la page de vente
assets/js/auth.js       lien magique
assets/js/app.js        espace membre
assets/js/markdown.js   markdown → HTML (avec encadrés ::: maison)

contenu/                les 14 modules (NON versionné)
outils/seed.mjs         envoi du contenu vers Firestore
fonctions/index.js      webhook Stripe
firestore.rules         les règles d'accès

docs/mise-en-place.md              ⭐ commence par là
docs/prompt-charte-claude-design.md  charte + maquettes (Claude Design)
docs/prompts-claude-design.md        les visuels un par un
docs/scripts-video-tiktok.md         15 scripts vidéo
```

## Démarrer

**Pour que le paiement fonctionne :** suis [`docs/mise-en-place.md`](docs/mise-en-place.md)
de bout en bout. Compte 2 à 3 heures la première fois.

**Pour travailler sur les pages :**

```bash
python3 -m http.server 8080
# puis http://localhost:8080
```

La page de vente fonctionne sans Firebase. `acces.html` et `app/` affichent un
message tant que `config.js` n'est pas renseigné — c'est normal.

**Après avoir modifié un module :**

```bash
node outils/seed.mjs --sec    # aperçu, sans écrire
node outils/seed.mjs          # envoi réel
```

## Le système de design

Notion comme référence. Gris chauds, sans-serif unique, rayons de 3 à 6 px,
séparation par l'espace et non par des traits, ombre uniquement sur ce qui flotte.

Toutes les valeurs sont dans [`assets/css/tokens.css`](assets/css/tokens.css).
**Aucune couleur, taille ou espacement ne doit être écrit ailleurs.**

Deux échelles typographiques : *marketing* (grande, serrée, grasse) pour la page
de vente, *application* (calme, régulière) pour la lecture des cours.

## Offres

| | Prix | Contenu |
|---|---|---|
| Essentiel | 97 € (au lieu de 197) | les 12 modules |
| Complet | 197 € (au lieu de 397) | + le code source, le kit de publication, les 60 demandes IA |

Paiement unique, accès à vie, garantie 30 jours.

## Ajouter une formation

L'architecture est prévue pour ça. Pour la formation n° 2 :

1. Écris les modules dans `contenu/`, avec le même en-tête `---`
2. Ajoute un champ `formation:` dans l'en-tête et dans le seed
3. Duplique `index.html` en `formation-2.html`
4. Crée deux produits Stripe de plus
5. Le reste — connexion, espace membre, règles, progression — ne bouge pas
