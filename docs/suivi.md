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

> Depuis la Gate 2 (septembre 2026), ce paragraphe est dépassé : la porte
> est un code à six chiffres (section 11), l'équipe a deux rôles et des
> permissions, et l'accès client se donne projet par projet. Le contrat en
> vigueur est la section 13.

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
  `en-cours` : c'est le serveur qui le pose à la réception de son message
  (`hubMessageTicketBoite`), l'écran le lui promet.
- Correction livrée : `a-valider`. Le client valide, ce qui donne `resolu`,
  ou dit « Pas tout à fait » : son message part et la demande repasse en
  `en-cours` (règle `clientConteste`).
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

Collections ajoutées : `organisations`, `profils`, `projets/{p}/composants|jalons|liens|messages`, `taches`, `validations`, `fichiers`, `releases`, `reunions`, `notes`, `blocages`, `paiements`, `activite`, `boites/{uid}/notifications`, `audit`, `demandesProjet`. Les règles sont dans `suivi/firestore.rules` et prouvées par `fonctions-suivi/outils/regles.test.mjs` (104 contrôles). La visibilité `client | interne` est appliquée par les règles, pas seulement à l'écran.

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

**La clé d'accès (WebAuthn), en plus du code.** Touch ID sur Mac,
Windows Hello, la clé du trousseau dans un navigateur : une paire de clés
par appareil, la privée ne quitte jamais l'appareil, la publique vit dans
`cles/{id}` (uid, adresse, clé publique, compteur, transports, nom de
l'appareil, dates). Le module est `fonctions-suivi/cles.js`, branché sur
`suiviConnexion` :

- `cleOptionsEnregistrement` puis `cleEnregistrer` (session ouverte, jeton
  vérifié par `acces.identifier`) : l'appareil s'ajoute depuis l'espace,
  jamais depuis la porte ; dix clés au plus par compte ;
- `clesLister`, `cleRetirer` (session ouverte) ;
- `cleOptionsConnexion` (adresse) : les clés de cette adresse, ou « pas de
  clé », et la page demande alors un code ; `cleVerifier` (adresse,
  réponse signée) : la signature du défi, pour l'origine et le domaine
  attendus (`capmedia.app` en production, `localhost` sur le banc), puis
  la même ouverture de session que le code (`ouvrirSession` : l'accès du
  compte relu à l'instant, revendications, lien à usage unique).

Un défi (`defis/{cle}`) vit deux minutes et ne sert qu'une fois. Les deux
collections sont fermées au navigateur. Côté page, `cles-acces.js` : sur
la porte, `tenterConnexion(email)` essaie la clé avant de demander un code
(pas de clé, geste annulé : le code part sans bruit) ; dans l'espace, la
feuille « Clés d'accès » (menu du compte, pour les trois espaces, et
Paramètres › Sécurité) liste, ajoute cet appareil, retire. Entré par un
code sans aucune clé, l'espace propose la clé une fois (`proposerCle`).
L'audit dit `mode: code` ou `mode: cle`.

Épreuve : `qa-cle-acces.cjs` (22 contrôles, authentificateur virtuel de
Chromium par CDP, site servi sur `http://localhost:8787`).

## 12. Le rideau et le cycle commercial (septembre 2026)

Deux manques de fond, corrigés ensemble.

**Le rideau.** Un projet se créait avec son client dedans : celui-ci
voyait un espace vide se garnir sous ses yeux. Désormais un projet naît
`ouvert: false`, `membres: []`, statut `brouillon`. On le garnit, on le
chiffre, puis on lève le rideau. Ce n'est pas un masque à l'écran :
sans son `uid` dans `membres`, les règles refusent au client la fiche du
projet et ses dix-sept sous-collections.

```
creerProjet        n'invite plus par défaut ; « inviter: true » reste possible
ouvrirAuClient     rattache les interlocuteurs, lève la sourdine, envoie
                   l'invitation ; refuse s'il n'y a aucune adresse
fermerAuClient     retire l'accès sans rien supprimer, et on peut rouvrir
synchroniserMembres saute les projets fermés : un second projet d'un client
                   déjà connu ne s'ouvre plus tout seul à sa création
```

Un `ouvert` absent valait ouvert. Depuis la Gate 2, la migration
(`outils/migrer-gate2.mjs`) rend `ouvert` explicite sur chaque projet, et
un projet non converti refuse les gestes d'accès (409) tant qu'un
arbitrage humain n'a pas tranché.

**Le cycle commercial.** Trois états s'ajoutent avant le travail :
`brouillon` (en préparation), `devis-envoye` (devis à signer),
`devis-signe`. Et un devis porte désormais sa `portee` :

```
initial          le devis qui fonde le projet. Son dépôt met le projet en
                 « devis à signer » ; sa signature le passe en « devis signé »
complementaire   un avenant sur un projet déjà lancé : il ne touche jamais
                 à l'état du projet, il l'étend
```

La portée se devine seule au dépôt (pas encore de fondateur → initial,
sinon avenant) et reste corrigeable à la main. Le client lit laquelle
il signe, et le journal garde « a signé le devis : le projet démarre »
ou « a signé l'avenant ».

**Trois défauts trouvés par la recette, et corrigés**

1. *Un projet ouvert en direct restait vide chez le client.* La liste de
   ses projets était figée à la connexion : le nouveau apparaissait dans
   la barre, sans ses pièces, jusqu'au rechargement. Les abonnements
   suivent maintenant la liste vivante, et `agreger` la lit au lieu de
   lire la session.
2. *Un accès retiré laissait l'écran en place.* Un refus de lecture
   notait l'erreur mais gardait la valeur en mémoire. Un `permission-denied`
   vide désormais la valeur ; une panne de réseau, elle, la garde.
3. *Une vue pouvait en écraser une autre.* Monter une vue est
   asynchrone : une adresse qui change pendant le montage laissait
   l'ancienne réinstaller ses écoutes par-dessus la nouvelle. Chaque
   rendu porte maintenant un numéro et se démonte s'il est périmé.

Éprouvé par `qa-scenarios.cjs` : dix scénarios joués dans les deux
espaces, 48 contrôles, de la préparation rideau baissé à la validation
d'une demande, en passant par le cloisonnement entre deux clients et ce
que le client ne doit jamais voir.

## 13. Identité, accès et communication (Gate 2, septembre 2026)

Un seul chemin décide de tout : **compte Firebase → rôle → permissions →
projets autorisés → actions autorisées → destinataires**. Aucun droit ne
vient d'une clé partagée, d'une adresse, ni de l'appartenance à une
société. Le navigateur, les fonctions et les règles lisent les mêmes
fiches ; le serveur et les règles refusent, l'écran se contente de ne pas
proposer.

### L'équipe : `equipe/{uid}`

```
role         'admin' | 'agent'
actif        bool            false : plus rien, même une session ouverte
projets      list<string>    ceux d'un agent (un admin les a tous)
permissions  list<string>    en plus du socle, jamais equipe.gerer ni systeme
desactiveLe  timestamp
```

Le socle d'un agent : `projet.voir`, `demandes.gerer`, `contenu.gerer`,
`qa.participer`. Un administrateur a toutes les permissions. La liste vit
dans `fonctions-suivi/acces.js` (`PERMISSIONS`, `SOCLE`), et son miroir
dans `noyau.js` ; `acces.test.mjs` vérifie qu'ils disent la même chose.
Le dernier administrateur actif ne peut être ni retiré, ni désactivé, ni
rétrogradé. Désactiver révoque les jetons et désactive le compte : les
règles refusent la session encore ouverte (elles relisent `actif`), le
serveur aussi (`verifyIdToken(jeton, true)`).

### Le client : `projets/{p}/interlocuteurs/{cle}`

`cle` = les 32 premiers caractères hexadécimaux du sha256 de l'adresse
normalisée.

```
email, nom, uid
role         'responsable' | 'collaborateur' | 'a-definir'
statut       'actif' | 'retire'
invitation   { etat, envoyee, id }
```

Le **responsable** engage le client : il accepte les devis, voit la
finance (devis, factures, paiements, activité financière) et répond aux
validations réservées. Le **collaborateur** suit le projet, échange, pose
des demandes et répond aux validations ordinaires. Une même personne peut
être sur plusieurs projets, avec un rôle différent sur chacun.

Les champs `membres`, `roles` et `personnes` du projet sont **dérivés**
de ces fiches par `acces.recalculerAcces`, seul chemin qui les écrit
(`accesVersion: 2`). Fermé, un projet n'a aucun membre.

### Ouvert au client, e-mails au client

```
ouvert             bool       false : le client n'a AUCUN accès et ne reçoit RIEN
premiereOuverture  timestamp  posée une fois : la lettre d'ouverture ne repart jamais
emailsClient       'actifs' | 'coupes'
```

La première ouverture envoie une lettre `ouverture` par personne, avec
un résumé de ce qui l'attend (le devis n'y figure que pour un
responsable), et jamais l'historique. Couper les e-mails garde le Hub
vivant (notifications, activité) : seul le code de connexion part encore.
`silence` n'est plus lu ; la migration le traduit en `emailsClient`.

### Les invitations : `invitations/{sha256(jeton)}`

Un seul modèle pour les clients, l'équipe et les testeurs. États :
`preparee`, `en-attente`, `envoyee`, `acceptee`, `expiree` (14 jours),
`revoquee`. Le jeton n'est jamais stocké en clair ; une nouvelle
invitation révoque la précédente pour la même personne et le même
projet ; la première connexion la consomme.

### Qui reçoit quoi : `communication.js`

Toute décision d'envoi passe par trois fonctions pures :
`decisionEmailClient`, `decisionNotificationClient`, `decisionEquipe`.
Elles regardent : projet ouvert, interlocuteur actif, membre effectif,
rôle (les événements `devis`, `facture`, `paiement` ne vont qu'aux
responsables), `emailsClient`, préférences (sauf événements essentiels),
fiche d'équipe active et autorisée sur le projet. Les destinataires sont
dédoublonnés et relus au moment de l'envoi, jamais recopiés.

### Le serveur : `suiviAdmin`

Chaque action est déclarée dans le registre `ACTIONS` de `suivi.js` avec
sa permission et la façon de trouver son projet. La tête de la fonction
vérifie le jeton (`acces.identifier`), puis la permission
(`acces.exiger`) ; un refus est tracé (`admin.refus`). `acces.test.mjs`
refuse une action du code absente du registre. Les outils d'exploitation
ouvrent une session au nom d'une personne (`outils/lib/session-admin.mjs`,
par code), jamais avec une clé.

### La finance (préflight Gate 2)

La finance d'un projet se lit par un administrateur, par un agent du
projet à qui `finance.lecture` (ou `finance.gerer`) a été donnée, et par
le responsable côté client. Être affecté au projet ne suffit pas. Elle
comprend :

```
documents, paiements                  devis, factures, paiements
projets/{p}/montants/{cle}            « jalon-<id> » (étape de devis), « maintenance » (forfait)
budgets/{p}                           budget et note (équipe seule, jamais le client)
activite (visibilite « responsable ») les lignes devis, facture, paiement
projets/{p}/pieces/** (Storage)       les PDF comptables
```

Une étape et un contrat de maintenance ne portent plus de montant (les
règles le refusent) : l'agent et le collaborateur voient l'étape, jamais
ce qu'elle vaut. `acces.financeEquipe` et la fonction `financeEquipe` des
règles disent la même chose ; `matrice-gate2.test.mjs` et
`matrice-stockage-gate2.test.mjs` passent chaque catégorie de personne
devant chaque donnée, en lecture et en écriture.

### Ce qu'un agent lit hors de ses projets

Rien de ses clients : une société se lit par un agent qui travaille sur
l'un de ses projets (`organisations/{o}.projets`, tenu par le serveur),
un testeur par un agent d'un projet où il est inscrit, sauf délégation
(`clients.gerer`, `qa.gerer`). Le profil d'un client ne se lit que par
lui-même et un administrateur. L'équipe ne répond jamais à une
validation à la place du client.

### Les arbitrages d'accès

Un contact préparé sans rôle (`a-definir`) n'a aucun accès, même projet
ouvert. `projetsInternes/{p}` porte `rolesADefinir` (recalculé à chaque
geste) et `arbitragesAcces` (laissés par la migration : ancien membre
sans compte, adresse qui porte un autre rôle). Le cockpit les liste
(accueil, « Accès à arbitrer » ; onglet « Accès client », « À arbitrer ») ;
`classerArbitrageAcces` retire un point sans rien donner ni retirer.

### Les épreuves

```
acces.test.mjs            décisions pures (rôles, permissions, dernier admin, envois)
regles-gate2.test.mjs     règles Firestore, rôle par rôle
storage-gate2.test.mjs    règles de stockage
serveur-gate2.test.mjs    le serveur de bout en bout, sur émulateurs
migration-gate2.test.mjs  la migration : à blanc, réelle, silencieuse, rejouable, réversible
qa-gate2.cjs              l'histoire complète dans de vrais navigateurs (22 étapes)
qa-fin-de-test.cjs        la fin de test : l'ordre, « J'ai terminé », le gel, les sept jours, la remarque, prolonger et clore
qa-cle-acces.cjs          la clé d'accès : ajout, entrée sans code, refus, retrait
qa-fiche-testeur.cjs      la fiche du testeur à sa première connexion, la note du test, identifiants et magasins
qa-chat-testeur.cjs       la bulle du testeur et la page Testeurs du Cockpit, en direct
qa-telecharger-piece.cjs  le téléchargement direct d'une pièce par le serveur : droits, nom, traces
qa-parcours-casses.cjs    les points cassés du relevé des parcours : réponse qui fait repartir, « Pas tout à fait », devis périmé, un seul « lu »
matrice-gate2.test.mjs    12 catégories de personnes x 48 opérations Firestore
matrice-stockage-gate2    12 catégories x 16 opérations Storage
invitations-gate2         les quatre familles d'invitation, de bout en bout
envois-gate2              qui reçoit quoi, compté (fermé, ouverture, coupure, impossibles)
sessions-gate2            une session déjà ouverte, puis l'accès retiré : plus rien ne passe
copie-prod-gate2.mjs      la migration sur une copie pseudonymisée de la production
ordre-deploiement.sh      un ordre de déploiement rejoué pièce par pièce
```

## 14. La fin de test (septembre 2026)

Un testeur déroule ses scénarios **dans l'ordre** : le suivant s'ouvre quand
le précédent a un résultat (réussi, échec ou sans objet). Ce verrou est celui
de l'écran (`testeur.js`, `ouvrable`) : il guide, il ne protège rien. Ce qui
protège vient après.

Quand tout est déroulé, le bouton « J'ai terminé le test » apparaît. Le
testeur pose alors `termine: serverTimestamp()` sur son appréciation
(`projets/{p}/campagnes/{c}/appreciations/{uid}`, le document qu'il écrit
déjà). Les règles exigent la date du serveur, une seule fois, jamais reprise
ni retirée.

Le déclencheur `hubAppreciationEcrite` (`hub.js`, section 13) fait le reste :

- sur la campagne, `termines.{uid}` (la date) et `fins.{uid}` (sept jours
  plus tard, sauf si l'équipe a déjà posé plus loin) ;
- le bilan du testeur, tout compté (réussis, échecs avec le titre du
  scénario, sans objet, temps donné d'après ses sessions), en lettre
  `testeur-termine` à l'équipe, plus une notification ;
- une ligne d'activité visible du client, **sans le nom** : « Un testeur a
  terminé la campagne « … » (2 sur 3) », et une notification client ;
- une trace d'audit `test.termine`.

Les règles relisent la campagne à chaque geste (`testeurATermine`,
`accesTesteurEnCours`) :

- test terminé : plus aucun passage, ni création ni correction ;
- date de fin passée : plus aucune écriture, appréciation comprise ;
- entre les deux : le testeur ajoute des `remarques` (liste qui ne fait que
  grandir, vingt au plus, 4 000 caractères chacune) ; chaque ajout part à
  l'équipe (`testeur-remarque`, notification, activité interne).

Le rail de l'espace Test dit l'état en bas (`coquille.definirEtat`) :
« Accès actif », puis « Test terminé · accès jusqu'au 4 octobre ». Passé
la date, la campagne disparaît de l'écran du testeur ; les règles refusent
déjà ses gestes.

Dans le Cockpit, la fiche d'une campagne montre pour chaque testeur
« Terminé le … · accès jusqu'au … », ses remarques, et deux gestes :
**Prolonger de 7 jours** et **Clore l'accès**, qui déplacent `fins.{uid}`
depuis le navigateur (l'équipe écrit la campagne). Le client lit la même
ligne d'état sous le numéro du testeur, sans nom, sans remarque, sans geste.

Épreuves : `regles.test.mjs` (section « La fin de test », 17 contrôles) et
`qa-fin-de-test.cjs` (33 contrôles dans trois navigateurs : testeur, équipe,
client).

## 15. Le testeur : sa fiche, sa bulle, ce qu'il trouve (septembre 2026)

**Sa fiche, à sa première connexion.** Le Cockpit inscrit un testeur avec
son adresse, son prénom et ce qu'il teste ; rien d'autre n'est requis. À sa
première entrée dans Capmedia Test, sa fiche passe devant tout et ne se
ferme pas (`fiche-testeur.js`) : nom et prénom, sexe, tranche d'âge, domaine,
aisance, les plateformes qu'il a sous la main, et **l'appareil relevé par la
machine** (`appareil.js` : système et version, navigateur, écran, densité,
réseau quand le navigateur le dit) dont il précise le modèle exact, que le
web ne dit pas. Il valide : `testeurs/{uid}` porte `nom`, `profil.expertise`,
`plateformes`, `appareils[]` et `ficheValidee` (date du serveur, une fois).
Les règles n'ouvrent au testeur que ces champs de SA fiche ; l'adresse, les
projets et l'état restent au serveur. Ensuite, chaque connexion depuis un
appareil nouveau l'ajoute à la liste sans rien demander (`consignerAppareil`).
Le serveur recopie sous chaque projet (`profilsTesteurs`) le profil enrichi,
domaine et appareils résumés, sans le nom : le client lit « Testeur 2 ·
homme, 25-34 ans, pharmacien, MacBook Air M2 macOS 15 ». Le Cockpit lit la
fiche validée, la date, les appareils.

**La note du test.** En disant « j'ai terminé », le testeur note le TEST (pas
l'application) sur cinq et dit ce qui l'aurait rendu plus facile :
`appreciations/{uid}.noteTest`. La lettre du bilan la porte ; la fiche
campagne du Cockpit la montre avec ses mots ; le client lit la note seule.

**Ce qu'il trouve dans « L'application ».** La campagne porte `acces`
(`instructions` : comment s'inscrire ; `identifiants` : des comptes de test,
copiés d'un clic) et `magasins` (`ios`, `android` : les fiches App Store et
Play Store). Les identifiants et les instructions s'affichent avant le test ;
les magasins après « j'ai terminé », pour un vrai avis là où les autres
découvrent l'application. Tout se remplit dans l'éditeur de campagne.

**Sa bulle vers l'équipe.** En bas à droite de son espace
(`bulle-testeur.js`), une conversation à part des messages de projet :
`conversationsTesteurs/{uid}` (dernier message, `nonLusEquipe`,
`nonLusTesteur`, tenus par le serveur) et `messages/{id}` (texte seul, 4 000
caractères, `de.cote` testeur ou equipe). `hubMessageTesteur` prévient :
notification et lettre `message-testeur` à l'équipe quand il écrit,
notification, lettre `message-testeur-reponse` et pastille quand l'équipe
répond. Le Cockpit a une page « Testeurs » (`/testeurs-messages`, rail
« Travail », compte des non lus) avec la liste et le fil en direct. Un
client ne lit rien de tout cela.

Épreuves : `regles.test.mjs` (section « La fiche du testeur… », 28
contrôles), `qa-fiche-testeur.cjs` (28), `qa-chat-testeur.cjs` (18).

## 16. Le téléchargement d'une pièce (septembre 2026)

Dans « Devis et factures », une pièce qui a son PDF (`documents/{id}.fichier`)
porte un bouton **Télécharger**, dans la liste (colonne fixe, blanc,
arrondi) et dans sa fiche. Un clic, le PDF se pose dans les téléchargements
sous son nom. Pas d'aperçu, pas de nouvel onglet.

Le PDF ne passe pas par les règles Storage : c'est la fonction `suiviPiece`
(`fonctions-suivi/pieces.js`, GET `?document=<id>`, jeton en Bearer) qui le
remet, après avoir vérifié qui demande, la même règle écrite une seule fois
côté serveur : la finance de l'équipe (`acces.financeEquipe`) ou le
responsable du projet (`membres` et `roles`), jamais un brouillon ni une
archive. Le fichier est lu par l'Admin SDK et renvoyé en pièce jointe.
Chaque téléchargement et chaque refus laissent une trace d'audit
(`piece.telechargee`, `piece.refusee`). Côté page : `telecharger-piece.js`.

Pourquoi par le serveur : en production, le compte de service des règles
n'a pas le rôle qui lui permet de lire Firestore depuis les règles Storage
(`roles/firebaserules.firestoreServiceAgent`) ; toute lecture Storage qui
dépend d'une fiche Firestore répond 403, alors que le banc passe. Tant que
ce rôle n'est pas accordé, seule la remise par le serveur fonctionne.

Les six pièces de ForgeMe ont reçu leur PDF le 27/09/2026 (depuis
~/Downloads, dépôt par l'Admin SDK, audit `document.pdf-joint`) ; le devis
de la campagne de tests, semé sous D-2026-0030, porte désormais son vrai
numéro D-2026-0028 et ses vraies dates. Les deux pièces de 2024 (audit,
maquettage) n'ont pas de PDF.

Épreuve : `qa-telecharger-piece.cjs` (serveur puis navigateurs, client et équipe).

## 17. Le rebond des pages (septembre 2026)

Les pages du Cockpit se redessinaient plusieurs fois de suite : au
montage, chaque clé du magasin déjà chargée appelait aussitôt la même
fonction de dessin (trois clés, trois reconstructions après le squelette) ;
après une écriture locale, l'instantané du serveur qui la confirmait
(la date `maj` passant de nulle à vraie) redessinait une seconde fois.
Mesuré le 27/09/2026 sur le banc : 4 dessins au montage de « Tâches »,
8 sur « Planning », 2 après un changement de statut.

Deux changements dans `magasin.js`, sans toucher aux pages :

- **Un dessin par tour.** Dans un `lot`, la même fonction branchée sur
  plusieurs clés n'est appelée qu'une fois par tour (une microtâche plus
  tard, avant tout affichage), avec la dernière valeur venue ; rien ne
  dessine plus dans une vue partie. Les trois vues qui branchaient une
  fermeture anonyme par clé (`tests.js`, `tableau.js`, `maintenance.js`)
  nomment leur fonction pour en profiter.
- **Rien n'est rediffusé pour rien.** Le magasin lit les marques du serveur
  en estimation locale (`serverTimestamps: 'estimate'`) : la date est là
  dès l'écriture. Quand un instantané ne change rien (`memes`, comparaison
  déroulée ; dates à moins d'une minute tenues pour égales seulement quand
  l'instantané d'avant portait une écriture en route), la valeur est
  gardée mais personne n'est réveillé. Même garde sur les clés dérivées.

Après : 1 dessin après le squelette au montage, 1 après une écriture locale
ou une suppression (`mesurer-rebond.cjs`, hors dépôt). La fiche de projet,
qui regroupait déjà ses dessins à 60 ms, n'est pas concernée.

## 18. Ce qui mentait au client, corrigé le 27/09/2026

Relevé dans `docs/parcours-client-hub.md` (section 0). Seize points où le
Hub promettait une chose que le code ne faisait pas :

- La réponse du client à une demande en « Besoin d'information » fait
  repartir la demande (serveur, à la réception du message). « Pas tout à
  fait » sur une correction livrée demande un mot et renvoie la demande en
  cours (règle `clientConteste`, `ecrire.clientContesteDemande`).
- « Résumé quotidien » retiré des préférences (jamais implémenté) ; la
  promesse d'un avis de facture « bientôt échue » retirée aussi.
- Le pilotage d'une demande (Cockpit) porte un « Devis lié » : le client
  trouve le lien vers son devis dans la fiche de la demande.
- Courriels : clé `hors-perimetre` sans accent (l'objet lisait le code
  brut), la nouvelle demande « en citant son numéro » plutôt qu'un lien qui
  n'existait pas, le devis et la facture mènent à `#/finances/{id}`, la
  mention « avec son fichier PDF » seulement s'il y en a un.
- Le bouton Télécharger d'un fichier sur la page d'une brique fonctionne
  (`brancherPieces`, qui ne se branche plus qu'une fois par zone) ; le
  gestionnaire mort des versions est retiré (les cartes montrent tout).
- Un devis dont la validité est passée s'affiche « Expiré », ne se propose
  plus à l'acceptation (écran, règles, relance du lundi, « En attente de
  vous ») : `devisExpire`, `devisADecider`, `statutPiece` dans noyau.js.
- La relance du lundi ne compte les validations réservées au responsable
  que pour lui ; un collaborateur sans point à lui ne reçoit rien.
- Les textes internes de la page Tests (« Versez un plan de tests », « Le
  vivier est vide ») ne s'affichent qu'à l'équipe.
- Un seul « non lu » pour les messages : la page Messages pose aussi
  l'accusé `lectures` (l'équipe voit « Lu »), la bulle pose aussi
  `profil.lus` (le compteur du rail tombe).
- Les validations réservées au responsable sont cachées au collaborateur
  sur l'aperçu du projet et la page « En attente de vous »
  (`peutRepondreValidation`, la même règle que le compteur).
