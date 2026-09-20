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

Collections ajoutées : `organisations`, `profils`, `projets/{p}/composants|jalons|liens|messages`, `taches`, `validations`, `fichiers`, `releases`, `reunions`, `notes`, `blocages`, `paiements`, `activite`, `boites/{uid}/notifications`, `audit`, `demandesProjet`. Les règles sont dans `suivi/firestore.rules` et prouvées par `fonctions-suivi/outils/regles.test.mjs` (95 contrôles). La visibilité `client | interne` est appliquée par les règles, pas seulement à l'écran.

Les automatisations (`fonctions-suivi/hub.js`) écrivent l'activité, les notifications et la file d'e-mails à partir des vrais événements. Sur les émulateurs, le facteur ne contacte jamais Brevo : les envois sont marqués `simule`.

Banc d'essai : `fonctions-suivi/outils/semer-suivi.mjs` (adresses fictives uniquement), `regles.test.mjs`, `verifier-suivi.mjs`, et le parcours navigateur Playwright.

## 10. La tenue des délais, la vie d'une demande, la relance (septembre 2026)

Le client trouvait l'état de son projet, mais pas la réponse aux deux
questions pour lesquelles il décrochait quand même son téléphone : est-ce
qu'on tient la date, et où en est ma demande. Rien non plus n'allait le
chercher : tout attendait qu'il vienne.

**Champs ajoutés**

```
projets/{p}.reports   list<map>  [{ de, vers, motif, note, le, par }], 20 au plus
                                 motif ∈ attente-client | perimetre | technique
                                          | tiers | magasin | capmedia | autre
projets/{p}.relance   timestamp  date de la dernière lettre hebdomadaire
projets/{p}/jalons/{j}.reports    la même liste, pour la date de fin d'une étape
tickets/{t}.release   string     l'identifiant de la version qui porte la livraison
notes/{n}.composant   string     la partie du projet concernée, vide = tout le projet
blocages/{b}.composant string    idem
profils/{uid}.email   string     recopiée par son propriétaire, et par lui seul :
                                 le serveur cherche les préférences d'envoi par
                                 adresse, et sans elle « Désactivé » ne coupait rien
```

`reports` et `release` sont dans la liste blanche des règles ; le client les
lit, ne les écrit jamais. `email` ne peut valoir que l'adresse du jeton.

**Le verdict d'une date** (`verdictDelai` dans `noyau.js`) ne sort que de
faits : livré, dépassée de N jours, ou à risque si `risquesProjet` nomme un
point bloquant ouvert, une étape dépassée, une tâche en retard ou une
demande qui dort du côté du client depuis plus d'une semaine. Sans fait
nommable, une date à venir est tenue, et on le dit.

**La progression** (`progressionProjet`) descend une chaîne de sources :
étapes, valeur saisie, parties du projet, tâches, statut. Quand aucune ne
parle, elle vaut `null` et l'écran affiche « non estimée » au lieu de 0 %.

**La relance** (`hubRelanceHebdo`, lundi 9 h, Europe/Paris) n'écrit que s'il
reste quelque chose du côté du client, se tait sur un projet à moi, en
sourdine, archivé ou clos, et jamais deux fois dans la même semaine. Le
client la coupe depuis ses réglages, catégorie `relance`. Elle est prouvée
par `fonctions-suivi/outils/relance.test.mjs` (20 contrôles), qui interroge
la décision et le relevé sans passer par le déclencheur.

**Vocabulaire** : « jalon » est devenu « étape », « composant » est devenu
« partie du projet », et l'adresse `/projets/{p}/roadmap` est devenue
`/projets/{p}/etapes`, l'ancienne restant comprise.

## 11. La porte d'entrée par code (septembre 2026)

Le lien magique a un défaut qu'on ne peut pas corriger : il doit être
ouvert dans le navigateur qui l'a demandé, parce que c'est là que
l'adresse est mise de côté. Ouvert depuis l'application de courrier, ou
depuis le téléphone quand la demande venait de l'ordinateur, il échoue ou
réclame de retaper l'adresse. Le code à six chiffres n'a pas ce défaut :
on demande ici, on lit là-bas, on tape ici.

**Le parcours**

1. L'admin crée un lien d'invitation depuis le projet (menu, « Créer un
   lien d'invitation »). Le lien s'affiche, se copie, et peut partir par
   e-mail si la case est cochée. Il vit quatorze jours et se révoque.
2. Le client clique : son adresse est posée et verrouillée, le nom du
   projet s'affiche, il demande son code.
3. Le code arrive dans sa boîte. Six chiffres, dix minutes.
4. Il le tape, la session s'ouvre. La fois suivante : adresse, code.

**Le jeton d'invitation ne donne aucun accès.** Il ne fait que
pré-remplir une adresse. C'est le code reçu dans la boîte qui ouvre la
session. On peut donc coller le lien dans un message sans risque.

**Les garde-fous.** Six chiffres, c'est un million de combinaisons : ce
n'est pas le code qui protège, c'est ce qui l'entoure.

```
validité        10 minutes (client) · 5 minutes (équipe)
essais          5 (client) · 3 (équipe), puis le code meurt
usage           unique, effacé dès qu'il a servi
débit           3 codes par quart d'heure et par adresse
                12 demandes par quart d'heure et par adresse IP
stockage        empreinte SHA-256 salée, jamais le code en clair
comparaison     à temps constant
discrétion      réponse identique que l'adresse existe ou non
trace           chaque demande, chaque essai, chaque ouverture en audit
équipe          une alerte e-mail à chaque ouverture de session
```

**Collections** `connexions/{sha256(email)}`, `connexionsIp/{sha256(ip)}`
et `invitations/{jeton}`. Les trois sont fermées au navigateur par les
règles, y compris à l'équipe : c'est ce qui rend les compteurs
infranchissables. Seul le serveur y touche.

**Fonctions** `suiviConnexion` (publique, actions `invitation`,
`demanderCode`, `verifierCode`) et, côté cockpit, `creerInvitation` et
`revoquerInvitation` sur `suiviAdmin`.

**Comment la session s'ouvre.** Une fois le code vérifié, le serveur
fabrique un accès à usage unique que la page consomme immédiatement. Il
ne part jamais par courriel, ne s'affiche nulle part, et Firebase le
brûle après cette seule utilisation. Un jeton personnalisé aurait fait
la même chose, mais il exige que le compte de service ait le droit de
signer un JWT : ce droit est absent sur ce projet, `verifierSignature`
sur `suiviAdmin` le confirme, et il aurait fallu le demander à la
console. La voie retenue passe par le même service d'identité sans
aucune permission supplémentaire.

**Deux garde-fous contre l'enfermement dehors.** La page bascule seule
sur un lien de connexion classique si le service de codes ne répond pas
ou n'est pas encore en ligne : l'ordre de mise en ligne du serveur et de
la page ne peut donc enfermer personne. Et un bouton de secours reste
disponible si le code n'aboutit pas.

**Les anciens liens restent acceptés** le temps que les derniers partis
arrivent au bout de leur heure.

Éprouvée par `fonctions-suivi/outils/connexion.test.mjs` (24 contrôles,
dont les mauvais codes, les codes brûlés, le rejeu, le débit et les
jetons révoqués), par huit contrôles de règles, et par le parcours
navigateur complet dans la suite de bout en bout.
