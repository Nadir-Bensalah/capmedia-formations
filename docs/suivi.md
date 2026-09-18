# Espace de suivi client · le contrat

Un espace de suivi par projet client : tickets, échanges, devis, factures,
historique, archives. Réutilisable tel quel pour chaque nouveau client.

Ce document est le contrat. Toute décision de structure se prend ici, et le
code s'y conforme. Français partout, y compris dans les noms de champs.

## 1. Où ça vit

| Élément | Emplacement | Publication |
|---|---|---|
| Pages | `agence/suivi/` | FTP à la racine par `agence.yml`, donc `https://capmedia.app/suivi/` |
| Styles | `agence/suivi/assets/suivi.css` | idem, en plus de `tokens.css` et `az.css` déjà présents |
| Modules JS | `agence/suivi/assets/*.js` | modules ES natifs, aucune étape de construction |
| Fonctions | `fonctions/suivi.js`, exposé par `fonctions/index.js` | `firebase deploy --only functions`, région `europe-west1` |
| Règles | `firestore.rules`, `storage.rules` | `firebase deploy --only firestore:rules,storage` |
| Projet Firebase | `capmedia-academy` | celui du site et de l'académie |

Le lien d'entrée est posé dans le pied de page de `capmedia.app`, et nulle
part ailleurs. Les pages de l'espace portent `noindex, nofollow`.

## 2. Qui entre, et comment

Authentification par **lien e-mail** (`sendSignInLinkToEmail`), exactement
comme l'académie : aucun mot de passe à retenir, aucun mot de passe à voler.
Le lien arrive dans la boîte du client, le clic ouvre la session.

Deux publics, une seule porte :

- **Équipe** : un document `equipe/{uid}` existe. Accès à tous les projets.
  Écrit uniquement par l'Admin SDK, jamais depuis le navigateur.
- **Client** : son `uid` figure dans `projets/{id}.membres`. Accès à ce seul
  projet, et à rien d'autre.

Un compte sans document `equipe` et sans projet voit un écran d'attente.

## 3. Le modèle de données

Toutes les dates sont des `timestamp` Firestore. Tous les identifiants de
document sont auto-générés, sauf mention.

### `equipe/{uid}`
```
nom      string          le nom du membre d équipe
email    string
role     'admin' | 'agent'
actif    bool
```

### `projets/{projetId}`
```
ref         string        'ATELIER'  (majuscules, sert de préfixe aux numéros)
nom         string        'Atelier'
client      map           { nom, email, entreprise }
membres     list<string>  les uid autorisés côté client
plateformes list<string>  ['ios','android','web']
statut      'actif' | 'pause' | 'termine'
compteur    int           dernier numéro de ticket attribué
archive     bool
cree, maj   timestamp
```

### `tickets/{ticketId}`
```
numero      string|null   'ATELIER-014', posé par la fonction, null à la création
projet      string        projetId
titre       string        <= 120
description string         <= 6000
type        'bug' | 'demande' | 'question'
urgence     'bloquant' | 'critique' | 'important' | 'mineur'
statut      'nouveau' | 'en-cours' | 'en-attente-client' | 'a-valider'
            | 'resolu' | 'ferme' | 'refuse'
plateforme  string        'ios' | 'android' | 'web' | ''
version     string        <= 40
etapes      string        <= 4000   comment reproduire
attendu     string        <= 2000
obtenu      string        <= 2000
assigne     string|null   uid d'un membre de l'équipe
auteur      map           { uid, nom, email, cote: 'client'|'equipe' }
pieces      list<map>     [{ nom, chemin, taille, type }]  <= 10
archive     bool
cree, maj   timestamp
resolu      timestamp|null
lu          map           { client: timestamp|null, equipe: timestamp|null }
```

### `tickets/{ticketId}/messages/{messageId}`
```
de       map      { uid, nom, cote: 'client'|'equipe' }
texte    string   <= 6000
pieces   list<map>
interne  bool     true = note d'équipe, invisible au client
date     timestamp
```

### `tickets/{ticketId}/evenements/{evenementId}`
Journal d'audit, écrit **uniquement** par l'Admin SDK ou une fonction.
```
type    'creation' | 'statut' | 'urgence' | 'assignation' | 'archive' | 'piece'
avant   string|null
apres   string|null
par     map      { uid, nom, cote }
date    timestamp
```

### `documents/{documentId}`
Devis et factures.
```
projet    string
type      'devis' | 'facture'
numero    string        'D-2026-014' ou 'F-2026-031'
libelle   string        <= 160
montant   number        en euros, hors taxes
statut    devis   : 'envoye' | 'accepte' | 'refuse' | 'expire'
          facture : 'a-payer' | 'payee' | 'en-retard' | 'annulee'
date      timestamp
echeance  timestamp|null
fichier   map           { chemin, nom, taille }
reponse   map|null      { statut, le, par }  réponse du client sur un devis
archive   bool
```

Le client peut accepter ou refuser un devis depuis son espace. Il ne peut
rien d'autre : ni créer, ni modifier un montant, ni toucher une facture.

### `envois/{envoiId}`
File d'attente des e-mails. Écrite par les déclencheurs, lue par la fonction
d'envoi. Garde une trace de chaque notification partie.
```
modele   string     'ticket-cree', 'statut', 'message', ...
a        list<map>  [{ email, nom }]
variables map
etat     'attente' | 'envoye' | 'echec'
erreur   string|null
cree, envoye timestamp
```

## 4. Stockage des fichiers

```
projets/{projetId}/tickets/{ticketId}/{fichier}    pièces jointes
projets/{projetId}/documents/{documentId}/{fichier} devis et factures
```

Lecture : équipe, ou membre du projet. Écriture des pièces : membre du
projet ou équipe, 10 Mo maximum, images et PDF. Écriture des documents :
équipe seule.

## 5. Le cycle d'un ticket

```
nouveau ──▶ en-cours ──▶ a-valider ──▶ resolu ──▶ ferme
   │            │  ▲                      ▲
   │            ▼  │                      │
   │      en-attente-client ──────────────┘
   └──▶ refuse
```

- Le client crée : statut `nouveau`.
- L'équipe prend la main : `en-cours`, avec un assigné.
- Une question au client : `en-attente-client`. Le client répond, retour en
  `en-cours`.
- Correction livrée : `a-valider`. Le client valide, ce qui donne `resolu`.
- `ferme` clôt définitivement. `refuse` sert aux demandes hors périmètre,
  avec un motif obligatoire dans un message.

Le client peut : créer, écrire un message, joindre un fichier, valider un
`a-valider`, rouvrir un `resolu` sous sept jours. Rien d'autre. Les
changements de statut, d'urgence et d'assignation sont réservés à l'équipe.

## 6. Un e-mail à chaque opération

Tout part par Brevo, expéditeur `contact@capmedia.app`, un seul gabarit HTML
sobre reprenant les couleurs du site. Chaque e-mail porte le numéro du
ticket en objet et un lien direct.

| Événement | Destinataire | Modèle |
|---|---|---|
| Invitation à l'espace | client | `invitation` |
| Ticket créé | client (accusé) et équipe (alerte) | `ticket-cree` |
| Statut changé | client | `statut` |
| Ticket assigné | l'assigné | `assignation` |
| Nouveau message | l'autre partie | `message` |
| Ticket résolu | client | `resolu` |
| Ticket fermé | client | `ferme` |
| Devis déposé | client | `devis` |
| Réponse à un devis | équipe | `devis-reponse` |
| Facture déposée | client | `facture` |

Les notes internes ne déclenchent aucun e-mail au client.

## 7. Conventions de code

- Aucune étape de construction. Modules ES chargés par `<script type="module">`.
- SDK Firebase par l'URL `gstatic`, version `10.13.2`, comme le reste du site.
- Aucune valeur de couleur, d'espace, de rayon ou de typo en dur : uniquement
  les variables de `tokens.css`. Les composants existants de `az.css`
  (`carte`, `btn-principal`, `champ`, `etiquette`, `encadre`, `grille-*`,
  `enveloppe`, `filet`) sont réutilisés avant d'en écrire un nouveau.
- Noms de classes, de variables et de fonctions en français.
- Jamais de tiret cadratin dans les textes.
- Mobile d'abord. Aucun débordement horizontal, aucun tableau qui déborde de
  son cadre : `overflow-x: auto` sur son conteneur.
- Thème clair et sombre gérés par les tokens, comme le reste du site.
- Chaque écran est utilisable au clavier, avec un focus visible.

## 8. Ce qu'il reste à obtenir

Pour déployer et vérifier en vrai :

1. Une clé de compte de service du projet `capmedia-academy` (Paramètres du
   projet, Comptes de service, Générer une nouvelle clé privée).
2. Une clé API Brevo v3, posée dans le secret `BREVO_CLE`.
3. Dans la console Firebase : méthode de connexion « Lien e-mail » activée,
   et `capmedia.app` dans les domaines autorisés.

Sans ces trois éléments, tout se développe et se teste sur les émulateurs
locaux, ce qui est fait.

## 9. Le Client Hub (septembre 2026)

L'espace de suivi est devenu le Client Hub : un espace client (`suivi/app.html`) et un cockpit d'équipe (`suivi/admin.html`), tous deux sur `assets/js/` avec un routeur par dièse, un magasin temps réel (`magasin.js`) et une couche de données (`donnees.js`) qui est la seule à parler à Firestore.

Collections ajoutées : `organisations`, `profils`, `projets/{p}/composants|jalons|liens|messages`, `taches`, `validations`, `fichiers`, `releases`, `reunions`, `notes`, `blocages`, `paiements`, `activite`, `boites/{uid}/notifications`, `audit`, `demandesProjet`. Les règles sont dans `suivi/firestore.rules` et prouvées par `fonctions-suivi/outils/regles.test.mjs` (69 contrôles). La visibilité `client | interne` est appliquée par les règles, pas seulement à l'écran.

Les automatisations (`fonctions-suivi/hub.js`) écrivent l'activité, les notifications et la file d'e-mails à partir des vrais événements. Sur les émulateurs, le facteur ne contacte jamais Brevo : les envois sont marqués `simule`.

Banc d'essai : `fonctions-suivi/outils/semer-suivi.mjs` (adresses fictives uniquement), `regles.test.mjs`, `verifier-suivi.mjs`, et le parcours navigateur Playwright.
