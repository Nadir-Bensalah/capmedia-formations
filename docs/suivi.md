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
qa-finance-client.cjs     devis et factures côté client : décision, refus avec motif, « J'ai réglé », coordonnées, retard, échéance, facture liée au devis
qa-demandes-client.cjs    demandes, tâches, points bloquants, validations : réponse sur une tâche, « C'est fait », annuler, suite d'une demande, pièces
qa-projet-client.cjs      fiche projet : versions par plateforme, pouls daté, tenue des délais, réunions et ICS, calendrier, activité, accès
qa-navigation-client.cjs  se repérer : plusieurs projets, rôle et personnes, invitation d'un collègue, demandes tous projets, notifications, recherche, maintenance
qa-calendrier.cjs         le calendrier : jours qui s'ouvrent (souris, clavier), détail d'un élément, couleurs et légende, demande de rendez-vous du client programmée par l'équipe
qa-echanges-client.cjs    messages et bulle partout, fichiers (télécharger, retirer le sien), tests (anomalie en demande, bon pour sortie)
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

**Le 28/09/2026, le même rebond dans le Hub.** Les pages du client
dessinaient par une minuterie de 40 ou 60 ms : le squelette était peint,
puis la page, une image plus tard (mesuré : squelette à 5 ms, page à 48 ms).
`magasin.dessinateur(rendre, delai)` remplace ces minuteries dans les treize
vues : le premier dessin part en microtâche, avant le premier affichage
(le squelette n'est jamais peint quand la donnée est déjà là), les appels
de la même foulée sont absorbés, les suivants regroupés par le délai ;
`planifier.arreter()` à la fin de la vue. Après : squelette et page dans la
même image (5 ms et 6 ms). L'espace testeur, qui dessinait déjà par image,
attend désormais ses scénarios ET ses passages avant le premier dessin.

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

## 19. Devis, factures, paiements : ce que le client peut faire (27/09/2026)

Relevé dans `docs/parcours-client-hub.md`, scénarios 2, 13 et 30 à 37.

### La page « Devis et factures » (`vues/finances.js`)

- Un devis ouvert reste « À votre décision » tant que le client n'a pas
  décidé : `STATUTS_DEVIS.consulte` se lit « À votre décision » côté
  client et « Consulté » côté équipe (`pastille(..., { equipe })`).
- Une seule liste : les devis à décider vivent dans le bloc « Devis en
  attente de votre décision », la section « Devis » garde les autres.
- Un filtre par projet (`#filtre-projet`) quand le client est responsable
  de plusieurs projets ; il filtre factures, devis et paiements.
- Les paiements annulés ne s'affichent pas ; « Factures émises » ne compte
  ni les annulées ni les avoirs ; un lien profond vers une pièce absente
  affiche « Cette pièce n'est pas disponible. » une fois toutes les clés
  `documents:<p>` chargées (`magasin.chargee`).
- `statutPiece(d)` (noyau.js) rend `en-retard` pour une facture due dont
  l'échéance est passée (`factureEnRetard`), comme `expire` pour un devis
  périmé : la pastille, « En attente de vous » et la relance le disent sans
  attendre la fonction du matin. `devisFrisable(d)` dit quel devis a une
  frise : un devis accepté, et lui seul.

### La fiche d'un devis

- Pendant la décision, le pied propose « Refuser », « J'ai une question »
  (vers `#/projets/{p}/nouvelle-demande?type=question&devis={id}&titre=…`,
  la fiche de demande préremplit le titre et le contexte), « Fermer » et
  « Accepter ». « Merci, on lance. » seulement pour un devis initial.
- « Refuser » demande le motif (obligatoire, 2 000 caractères), écrit dans
  `reponse.commentaire`. La lettre `devis-reponse` à l'équipe donne le HT,
  le TTC et le motif (« Motif », ou « Un mot du client » avec une
  acceptation), et mène à la pièce dans le Cockpit.
- Le serveur écrit UNE ligne d'activité pour une réponse
  (`hubDocumentActivite`) : « a signé le devis X : le projet démarre » pour
  un devis initial accepté, « a accepté le devis X » ou « a refusé le devis
  X » sinon ; et une notification à l'équipe (« Devis accepté » / « Devis
  refusé », numéro · projet, lien `#/finances/{id}`), réservée à qui lit la
  finance du projet.
- Un devis sans étapes montre son « Détail » (un tiret s'il est vide) et
  rappelle que le PDF fait foi.

### La fiche d'une facture

- « Découle du devis D-… » (lien) quand la facture porte `devis` : le
  choix se fait au dépôt (`admin-finances.js`, select des devis du projet ;
  `deposerDocument` vérifie que le devis existe sur le même projet).
- Les coordonnées de règlement (`reglages/finance` : titulaire, iban, bic,
  banque, mention) s'affichent sur une facture due avec « Copier l'IBAN ».
  Saisies dans Paramètres > « Coordonnées de règlement » par la finance
  (`ecrire.reglerFinance`, règle : administrateur ou permission
  `finance.gerer`), lues par tout compte connecté (une seule agence) sur la
  clé `K.reglages`. Sans réglage, la fiche renvoie au PDF, sans promesse de
  paiement en ligne.
- « J'ai réglé cette facture » (responsable, facture due) : date, moyen,
  référence, montant prérempli au reste à payer. `ecrire.declarerReglement`
  écrit `documents/{id}.reglementDeclare = { par, nom, date, moyen,
  reference, montant, le }` ; la règle n'accepte que ces clés, `par == moi()`,
  `le == request.time`, sur une facture due. Le serveur
  (`hubDocumentActivite`) écrit l'activité, notifie l'équipe (« Règlement
  déclaré ») et met la lettre `reglement-declare` en file. La fiche dit
  « Vous avez déclaré un règlement le … · en attente de confirmation », la
  pastille reste celle de la facture ; `enregistrerPaiement` (et
  `statutFacture` vers « payée ») pose `reglementDeclare.confirme`, la fiche
  dit « Confirmé ». Côté équipe, la fenêtre « Enregistrer un paiement » est
  préremplie avec la déclaration.

### Le serveur, chaque matin (`hubEcheancesQuotidien`)

`onSchedule`, tous les jours à 8 h Europe/Paris, `passerLesEcheances()`
exposé pour l'épreuve (`_passerLesEcheances`) :

- trois jours avant l'échéance d'une facture due : notification « Facture
  à régler avant le … » et lettre `facture-echeance`, une fois
  (`echeanceSignalee`) ;
- échéance passée : `statut: 'en-retard'`, activité « La facture X est
  passée en retard », notification « Facture en retard » et lettre
  `facture-retard`, une fois (`retardSignale`) ;
- validité passée : `statut: 'expire'` sur le devis, activité, pas de
  lettre (`expireSignale`).

`hubDocumentActivite` reconnaît ces marques et n'écrit pas une seconde
ligne. Les événements `facture-echeance`, `facture-retard` et
`reglement-declare` sont dans `EVENEMENTS` (catégorie `finances`,
responsable seul).

### Les lettres

`devis` et `facture` annoncent le TTC (HT entre parenthèses, `montantTTC`
de courriels.js) ; la lettre de facture renvoie à une demande depuis
l'espace. `suiviDocumentCree` notifie aussi dans le Hub (« Nouveau devis »,
« Nouvelle facture ») les responsables du projet. La relance du lundi liste
chaque facture avec son TTC et son échéance.

### Les épreuves

`fonctions-suivi/outils/qa-finance-client.cjs` (navigateur : notification à
l'émission, « À votre décision » après ouverture, une seule liste, filtre
par projet avec un second projet posé par REST, facture échue « En
retard », « Découle du devis », IBAN et « Copier l'IBAN », « J'ai réglé
cette facture » et ce que l'écran et l'équipe en disent, refus avec motif
et lettre, lien profond inconnu) ; le bloc « Finances » de
`regles.test.mjs` (`reglementDeclare` borné, `reglages/finance`).

## 20. Se repérer, plusieurs projets, le rôle, le compte, la maintenance (27/09/2026)

Le lot D du relevé des parcours (`docs/parcours-client-hub.md`, scénarios
1 à 8, 28, 50 à 59). Ce qui change, et où.

### Arriver et se repérer

- L'accueil de la première fois (`accueil-client.js`) : l'écran « Ce qu'on
  vous demandera » cite les cinq gestes de « En attente de vous » ; l'écran
  des tests n'apparaît que si des scénarios ou des parcours concernent le
  client (`avecTests`, même condition que l'entrée Tests du rail, posée par
  app.js).
- `derniereVisite` (app.js) : lue au démarrage dans `env.derniereVisite`,
  jamais réécrite pendant la session ; posée quand la page se cache
  (`pagehide`, `visibilitychange` vers hidden) et toutes les dix minutes
  d'activité (pointeur, clavier). Pas de `sendBeacon` : une écriture
  Firestore ordinaire. L'encart « Depuis votre dernière visite »
  (`vues/accueil.js`) exclut les gestes du client (`a.par.uid === uid`), et
  chaque compteur est un lien (la section du projet si tout vient du même
  projet, sinon `#/activite`). À la toute première connexion, pas d'encart :
  l'accueil de la première fois suffit.
- La recherche (app.js) : validations en attente, décisions, liens (ouverts
  dans un nouvel onglet), pages de l'espace, fichiers vers
  `/projets/{p}/fichiers?f={id}` (l'onglet Fichiers doit lire `f`, projet.js),
  réunions et versions vers leur fiche. Les projets archivés sont exclus.
  « Nouvelle demande » et « Envoyer un message » demandent le projet.
- Les notifications (coquille.js) : nom du projet (via `notification.projet`
  et `K.projets`), icône par `type` (`ICONE_NOTIF`, trait fin, pas de
  pastille), et `lireSurPlace` : à chaque changement de route, les non lues
  dont le lien (sans `#`, sans paramètres) est la page ouverte passent
  `lu: true`.

### Plusieurs projets

- `choisirProjet(projets)` et `lienCreneau(pid)` exportés par
  `vues/accueil.js` : la fenêtre « Pour quel projet ? » (modèle documents.js)
  pour « Nouvelle demande », « Message » et « Demander un créneau »
  (`#/messages/{pid}?brouillon=…`, lu par la page Messages). « Tout voir »
  de l'activité mène à `#/activite`. La carte Finances n'apparaît qu'à un
  responsable. La puce d'une carte projet : « N chez nous · M à vous ».
- `#/demandes` (`vues/demandes.js`) : en tête « En attente de vous », puis
  mes demandes, tous projets, filtres Ouvertes / À vous / Terminées / Toutes
  et filtre par projet, puis les validations passées ; entrée « Demandes »
  du groupe Suivi (rouge = tout ce qui attend le client). Voir la section 26.
- `#/nouveaux-projets` (`vues/demandes-projet.js`) : mes demandes de projet ;
  entrée « Mes demandes de projet » sous « Demander un projet », seulement
  s'il y en a une. La fiche `#/nouveaux-projets/:id` garde son adresse ; au
  statut « Devis envoyé », l'équipe rattache le devis sur la fiche (champ
  `devis`, règle `demandesProjet` bornée à `statut, projet, devis, maj`) et le
  client lit « Un devis vous a été envoyé. Lire le devis et y répondre » vers
  `#/finances/{id}`. « Sans suite » se voit sur la frise.
- Maintenance (`vues/maintenance.js`) : un client à plusieurs projets voit
  `mesProjets` (une carte par projet), jamais `tousLesProjets` (vue équipe).

### Le rôle et les personnes

- Miroir serveur `projets/{p}.personnesClient = [{ uid, nom, role }]`
  (interlocuteurs actifs avec un rôle connu), tenu par `hubInterlocuteurEcrit`
  (hub.js) sur `projets/{p}/interlocuteurs/{cle}`. Pourquoi un nouveau champ
  et non `personnes` : `personnes` existe déjà (liste d'identifiants, préparés
  compris) et sert au registre des rôles (`acces.planAcces`) et à une requête
  `array-contains` dans suivi.js ; changer sa forme aurait cassé les deux.
  Les règles : ni le client ni l'équipe n'écrivent `personnesClient` depuis un
  écran (absent des `hasOnly` du projet) ; l'Admin SDK passe outre.
- `vues/personnes.js` : `personnesHtml(projet, env, d)`, insérée dans
  l'aperçu de projet.js après « Points bloquants ». « Chez Capmedia » (le
  responsable du projet, nom lu dans l'annuaire ; côté équipe, aussi les
  agents affectés) et « De votre côté » (rôle de chacun, « vous » sur la
  sienne), plus `PHRASE_ROLE`. Le client ne peut pas savoir quels agents sont
  affectés (l'annuaire ne porte que le nom) : il voit le responsable et la
  phrase « toute l'équipe lit ce projet ».
- « Inviter un collègue » (responsable seul) : action `inviterCollegue` de
  suiviAdmin (`ACTIONS`, `client: true` : pas de fiche d'équipe exigée, le
  contrôle est dans l'action : appelant sans fiche d'équipe, membre du projet,
  `roles[uid] === 'responsable'`), qui appelle `ajouterInterlocuteur` avec le
  rôle `collaborateur` et prévient l'équipe (« Le responsable a invité un
  collègue », lien vers l'onglet Accès client). L'équipe reçoit 403 sur cette
  action : elle passe par « Accès client ».
- coquille.js : `definirRoleProjet(texte)` ; app.js pose « Vous êtes
  responsable » ou « Vous êtes collaborateur » sous le nom de l'entreprise,
  dans une fiche projet seulement. `/projets/{p}/acces` tapée par un client :
  aperçu et toast « Les accès sont gérés par Capmedia. ».

### La maintenance

- « Reprendre le forfait » sur un forfait `suspendu` ou `termine` (la règle
  d'update du contrat l'autorisait déjà, épreuve ajoutée) ; « Modifier ma
  demande » tant qu'elle est `demande`.
- Une évolution proposée par le client se retire tant qu'elle est `proposee`
  (règle delete : `origine == 'client'`, `par.uid == moi()`, statut `proposee`,
  jamais le contrat) ; elle peut porter des `pieces` (dix au plus), déposées
  sous `projets/{p}/maintenance/{id}/{nom}` (identifiant tiré d'avance par
  `nouvelId`, règles Storage dans les deux fichiers : dépôt et lecture par le
  client du projet, parcours et suppression par l'équipe).
- Un changement de statut d'une évolution envoie la lettre `evolution-statut`
  (courriels.js, préférence `projet`) en plus de la notification.
- Le lien vers le devis du forfait n'apparaît qu'à qui lit la finance
  (`financeSur`).

### Le compte

- Paramètres : le fuseau horaire est retiré ; catégorie `projet` (« Vie du
  projet ») ajoutée dans parametres.js et dans `EVENEMENTS`
  (communication.js), où `tache` et `tache-attente` la rejoignent ; l'aide de
  « Devis et factures » annonce l'échéance à trois jours.
- courriels.js : accents rendus aux gabarits `preprojet`, `maintenance`,
  `message-projet`.

### Les épreuves

`fonctions-suivi/outils/qa-navigation-client.cjs` (navigateur : accents des
lettres, encart « Depuis votre dernière visite » et dernière visite posée à
la fin, « Les personnes » et le rôle, invitation d'un collègue avec le miroir
et la notification équipe, refus de Léa et de l'équipe sur `inviterCollegue`,
« Demandes » du rail, notification avec le nom du projet lue sur la page,
recherche, Maintenance et Paramètres, et à deux projets la fenêtre « Pour quel
projet ? », le rôle dans le rail, la Maintenance en cartes, `/acces`) ; le
bloc « Se repérer, plusieurs projets, le rôle » de `regles.test.mjs` ; le
bloc « Les pièces d'une évolution de maintenance » de `storage.test.mjs`.

## 21. Messages et bulle, fichiers, tests : les échanges du client (27/09/2026)

Le lot E du relevé des parcours (`docs/parcours-client-hub.md`, scénarios
29, 38, 39, 43, 44, 46 à 49). Ce qui change, et où.

### La bulle suit l'adresse (`bulle-projet.js`, `bulle.js`)

- `bulle-projet.js` : `brancherBulle(env)` écoute `surChangement` du
  routeur et monte UNE bulle dès que l'adresse commence par
  `/projets/{id}` (fiche, demande, nouvelle demande, brique, tâche), la
  change de projet ou la démonte sinon. Branché par une ligne à la fin de
  app.js et d'admin.js (import dynamique) ; projet.js ne monte plus rien.
- Un état ouvert/fermé par projet : `suivi:bulle-ouverte:{pid}`.
- N'importe quelle page ouvre la bulle avec un texte déjà écrit :
  `document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet, texte } }))`,
  le curseur à la fin (`ouvrirAvec`). Sur la page Messages, `?brouillon=`
  dans l'adresse fait la même chose, une fois.
- Le titre de l'onglet appartient à la coquille : la bulle envoie
  `titre:non-lus` (`detail.compte`) et coquille.js (`majTitre`) compose le
  préfixe `(n)` avec le plus grand des deux comptes (notifications non
  lues, messages non lus), jamais la somme, parce qu'un message fait aussi
  une notification. Le battement « Nouveau message · … » a disparu.

### Les mêmes conventions partout (`bulle.js`, `vues/messages.js`)

- Entrée envoie, Maj+Entrée va à la ligne, sur la page Messages comme dans
  la bulle ; l'aide le dit aux deux endroits.
- bulle.js exporte ce que la page reprend : `filParJour` (repères
  « Aujourd'hui », « Hier », « Jeudi 25 septembre », classe `.fil-jour`),
  `luLe` (« Lu le JJ/MM à HH:MM »), `vientDEnFace` (un message de l'autre
  côté, jamais le mien) et `demandeDepuisMessage` (le menu des types vers
  `nouvelle-demande`, texte posé dans `sessionStorage`).
- La page Messages écoute aussi `lectures` (`requeteLectures` dans
  donnees.js) : « Capmedia écrit » (marque `frappe`, posée toutes les quatre
  secondes de saisie au plus), l'accusé sous mon dernier message
  (`#fil-accuse`), et le geste « En faire une demande » (`.fil-message`,
  même bouton `.bulle-action`) sur les messages d'en face seulement.
- Des pièces sans un mot : `ecrire.messageProjet` écrit `texte: ''` ; la
  règle `projets/{p}/messages` accepte un texte vide quand `pieces` n'est
  pas vide (jamais ni texte ni pièces) ; `messageHtml` n'affiche pas de
  bulle de texte vide ; le serveur (`hubMessageProjet`) dit « a envoyé une
  pièce jointe » et notifie « Pièce jointe » plutôt qu'un extrait vide.

### Les fichiers (`ui.js`, `vues/documents.js`, onglet Fichiers de projet.js)

- `brancherPieces` : `[data-piece]` télécharge (lien signé lu en mémoire,
  `<a download>` avec `data-nom` ; si la lecture est refusée, un onglet
  s'ouvre à la place) ; `[data-ouvrir-piece]` ouvre dans un nouvel onglet.
  `fichierHtml` pose « Ouvrir » sur les images et PDF en plus de
  « Télécharger », affiche `version` en étiquette, dit « Déposé par vous »
  (`options.moi`) et pose le menu sur ses propres dépôts (`options.retirer`).
  La pièce d'un message (`pieceHtml`) s'ouvre si elle se regarde (image,
  PDF), se télécharge sinon.
- Une seule source de libellés : `CATEGORIES_FICHIER` (« Éléments (images,
  textes) » pour `assets`) ; les deux fenêtres de dépôt du client lisent
  `CATEGORIES_CLIENT`. Message de fin : « Fichier envoyé. » ou « N fichiers
  envoyés. », partout.
- Retirer son fichier : `ecrire.retirerFichier(f)` efface l'objet
  (`deleteObject`) puis la fiche. Règle Firestore `fichiers` : `delete` par
  un client membre, sur une fiche `visibilite == 'client'` dont `par.uid`
  est lui ; l'équipe n'efface pas (elle archive). Règle Storage
  (`storage.rules` ET `storage.transition.rules`) : `auteurDuFichier`, deux
  lectures (le projet, la fiche). Le serveur (`hubFichierRetire`,
  `onDocumentDeleted`) écrit l'activité et prévient l'équipe.
- Page Documents : tri « Plus récents / Plus anciens / Nom » (`#tri-doc`).
  « Pour quel projet ? » ne s'affiche qu'à plusieurs projets sans filtre.
- Page Documents du client (octobre 2026) : TOUS ses documents. Les
  fichiers des projets et, sur les projets dont il est responsable, ses
  pièces comptables (jamais un brouillon ni une archive). Rangées par genre
  (`GENRES` : Factures, Devis, Avoirs, Fichiers du projet), une section par
  genre (`section[data-rayon]`) et des puces `[data-genre]` pour n'en
  garder qu'un ; les catégories de fichiers se proposent sous « Fichiers du
  projet ». La recherche lit aussi le numéro et le libellé d'une pièce ; le
  tri date une pièce à son émission. Une pièce n'est pas redessinée : sa
  ligne (`lignePiece`, avec le HT en plus quand le montant affiché est
  TTC), sa fiche (`ouvrirDocument`) et son téléchargement par `suiviPiece`
  (`brancherPiecesComptables`) viennent de `vues/finances.js`. Pas d'aperçu.
  Un collaborateur non responsable ne voit ni pièce, ni filtre de genre, ni
  mot sur les devis : il ne s'abonne pas à la finance, et
  `documentsVisibles(session)` filtre aussi par `estResponsable`. Cette
  même fonction donne le badge de l'entrée Documents (fichiers + pièces),
  qui se recalcule aussi sur `fichiers:<p>`. L'équipe garde ses seuls
  fichiers : la finance a sa page. Épreuve : `qa-documents-client.cjs`.

### Les tests (`vues/tests.js`, `hub.js`, `courriels.js`, `communication.js`)

- Vocabulaire client : « robot » remplacé (« un programme rejoue », « sans
  personne qui clique »), la phrase figée sur la jauge grise retirée.
- La fiche d'une anomalie propose au client « En faire une demande » vers
  `#/projets/{p}/nouvelle-demande?type=bug&titre=…&anomalie={id}` ; le
  formulaire lit `titre` et `anomalie` (demande.js), `creerDemande` pose le
  champ `anomalie` (règle : clé acceptée, texte borné à 80). `?anomalie=`
  ou `?campagne=` sur `#/tests` ouvre la fiche à l'arrivée.
- `hubAnomalieEcrite` : à la naissance d'une anomalie `origine: 'testeur'`,
  notification « Une anomalie a été trouvée par les testeurs » (scénario ·
  titre · gravité) et lettre `anomalie` ; au passage en `corrigee`,
  « Anomalie corrigée ». `hubCampagneEcrite` : « Campagne de tests
  ouverte » / « Campagne close » et lettre `campagne` aux passages en
  `en-cours` / `close`. Événements `anomalie` et `campagne` (préférence
  `projet`) dans `EVENEMENTS`, gabarits dans `MODELES`.
- Le feu vert de sortie : à la clôture, le serveur crée une validation
  `type: 'sortie'` (« Bon pour sortie : {campagne} », description figée,
  `reserveeResponsable: true`, `cible: { id, libelle, chemin }` vers la
  campagne, `demandeur: Capmedia Test`), une seule par campagne (requête
  sur `cible.id`). `TYPES_VALIDATION.sortie = 'Sortie'`. Sa création passe
  par `hubValidationCreee` comme toute validation.

### Les épreuves

`fonctions-suivi/outils/qa-echanges-client.cjs` (émulateurs avec Functions
et Storage : notifications et lettres d'anomalie et de campagne, la
validation de sortie créée une seule fois, la bulle sur une demande et une
brique puis démontée ailleurs, `bulle:ouvrir`, Entrée envoie et Maj+Entrée
non, « Lu le … à … », « Capmedia écrit », « En faire une demande » absent
de mes messages, des pièces sans texte, « Télécharger » qui produit un
`download` sous le nom du fichier, la version, le libellé unique, retirer
son fichier jusqu'à l'objet, le tri des Documents, le vocabulaire de la
page Tests, la fiche d'anomalie et la demande liée, « Bon pour sortie »
dans « En attente de vous ») ; le bloc « Les échanges » de
`regles.test.mjs` ; le bloc « Retirer son propre fichier » de
`storage.test.mjs`.

## 22. Demandes, tâches, points bloquants, validations : ce que le client peut faire (27/09/2026)

Relevé dans `docs/parcours-client-hub.md` (scénarios 8, 9, 11, 12, 16, 20 à
24). Le client agit directement sur l'objet, et le serveur prévient qui de
droit. Chaque écriture client passe par `ecrire.*` et une règle qui borne
les champs.

- **Une tâche « À vous »** (`attente-client`) : la fiche porte « Votre
  réponse », un dépôt (Storage `projets/{p}/taches/{tid}/reponse/{nom}`) et
  « Envoyer ma réponse ». `ecrire.repondreTache` écrit
  `reponseClient = { par, nom, texte, pieces, date }` et le statut
  `repondu` (règle `clientRepondTache` : tâche visible, en attente de lui,
  `hasOnly(['reponseClient', 'statut', 'maj'])`, une fois). Nouveau statut
  `repondu` dans `STATUTS_TACHE` (« Réponse reçue », violet, entre
  attente-client et terminée). Le client lit « À vous » (clé `client:`, lue
  par `pastille(…, { client })`). Serveur (`hubTacheEcrite`) : activité
  « a répondu sur la tâche « … » », notification équipe « Réponse du client
  sur une tâche », lettre `tache-reponse`. `enAttenteDeVous` ne compte que
  `attente-client` : le point quitte « En attente de vous ».
- **Un point bloquant de son côté** : l'éditeur de l'équipe porte
  `attendu` (« Ce qu'on attend du client ») et `echeance` (« Attendu pour
  le »). Côté client, la fiche (`ouvrirBlocage` dans `vues/projet.js`,
  ouverte au clic ou par `/projets/{p}?blocage={id}`) dit « Ce qu'on attend
  de vous », « Depuis le », « Attendu pour le », et propose « C'est fait »
  (`ecrire.signalerBlocageFait` écrit `signaleFait = { par, nom, date,
  texte }`, règle `clientSignaleFait` : responsable client, non levé, une
  fois) et « Répondre » (événement `bulle:ouvrir` avec le texte prérempli).
  Serveur (`hubBlocageEcrit`) : à la création d'un point `responsable:
  'client'` visible, notification et lettre `blocage-client` (une par
  destinataire) ; au « C'est fait », activité et notification équipe
  « Point bloquant : le client dit que c'est fait ». Libellés côté client :
  « De votre côté » / « De notre côté » / « Un tiers » (`coteBlocage`).
- **Une validation** : le client joint des pièces à sa réponse (Storage
  `projets/{p}/validations/{vid}/reponse/{nom}`, `reponse.pieces` ≤ 10).
  Serveur (`hubValidationModifiee`) : accusé à l'auteur (« Merci, c'est
  validé » / « Vos remarques sont transmises »), notification aux collègues
  du projet (auteur exclu) ; à l'annulation, « Validation retirée » et les
  notifications « Votre validation est attendue » qui mènent à
  `#/valider/{vid}` sont marquées lues (`marquerLuesParLien`). La page
  « En attente de vous » porte ce seul nom partout, montre une annulée avec
  sa pastille et une icône neutre, lit les passées par vingt, et dit
  « Cette validation n'existe plus. » pour un identifiant inconnu.
- **Une demande** : « Ajouter une pièce » après coup ; « Je n'en ai plus
  besoin » (règle `clientAnnule`, depuis reçue, à analyser, acceptée ou
  planifiée, `hasOnly(['statut', 'maj', 'lu'])` ; le serveur reconnaît le
  client à la marque `lu.client` qui bouge avec le statut, et prévient
  l'équipe « Demande retirée par le client ») ; motif d'un refus
  (`motifRefus`, écrit par l'équipe, obligatoire pour un refus, lu dans le
  bandeau « Pourquoi : … ») ; « Rouvrir » demande un motif dans la même
  fenêtre que « Pas tout à fait » (`demanderMotif`) ; une demande close ou
  terminée depuis plus de sept jours propose « Ouvrir une nouvelle
  demande » vers `nouvelle-demande?suite={tid}` (`suite` à la création,
  string ou null ; le serveur écrit `suivant` sur l'ancienne ; les deux
  fiches se lient « Suite de » / « Suivie par ») ; le « non lu » par
  personne (`lu.clients[uid]`, à côté de `lu.client`, sans règle
  nouvelle : `clientMarqueLu` borne déjà `lu`).
- **Le formulaire** : `FORMATS_ACCEPTES` (noyau.js) alimente l'attribut
  `accept` et l'aide de tous les dépôts (`depot` dans ui.js) ; un lien mal
  formé est refusé sous le champ ; l'aide de l'urgence vient des `aide` de
  `URGENCES` ; « Ce que vous attendez » pour une fonctionnalité ; l'aide du
  forfait de maintenance sur cette carte quand `maintenance/contrat` est
  `actif`. L'accusé `ticket-cree` connaît les neuf types et salue chaque
  destinataire par son nom : `ecrireAuxClients(…, { parDestinataire: true })`
  met en file une lettre par personne avec `par: d.nom`.
- **Tenue des délais** : « demande en attente de votre réponse depuis plus
  d'une semaine », lien vers la liste filtrée « Pour vous »
  (`?filtre=pour-vous`, lu par la page du projet).

Épreuves : `fonctions-suivi/outils/qa-demandes-client.cjs` (navigateur),
blocs « Brief B » dans `regles.test.mjs` et `storage.test.mjs`.

## 23. La fiche projet, les versions, les réunions, le calendrier (27/09/2026)

Le lot de l'agent C sur le relevé des parcours (scénarios 14 à 19, 36, 40
à 42, 45, 46, et la part « projet » de 2 et 3).

### Le pouls et la progression

- `projets/{p}.pulseMaj` (date du serveur) et `pulsePar` (nom) sont
  écrits par l'éditeur du projet quand un texte du pouls change. Les
  règles `projets` (agent et administrateur) les acceptent. L'aperçu lit
  « mis à jour le JJ/MM par Prénom » sous chaque case renseignée ; une case
  vide montre la valeur calculée. « Attendu de vous » ne lit plus le texte
  libre : le bloc « En attente de vous » fait foi.
- `progression.le` : posé quand l'estimation à la main change, pour lire
  « estimé par Capmedia le JJ/MM ». `MODES_PROGRESSION` (donnees.js) est
  écrit en sources lisibles (« d'après les étapes de la feuille de route »).
- Un seul pourcentage à l'écran : l'anneau. La frise du devis garde
  « N / M étapes faites » et sa jauge, la carte d'une partie « avancement
  de la partie · date », la fiche d'une étape une barre.
- « Tenue des délais » reste sans date et le dit.
- Les onglets de la fiche suivent l'ordre des neuf sections du rail ;
  « Tests » ne s'ajoute au client que s'il y a des scénarios ou des
  campagnes (`ongletsVisibles`).

### Les versions

- `releases/{r}.build` (texte, 40 caractères, règle `releases`), liens
  « App Store ou Play Store » et « TestFlight ou Play interne ».
- `etatVersions(releases, plateforme, composant)` (donnees.js) : la
  dernière disponible et la dernière en route (test, soumise, revue). Les
  cartes plateformes de l'aperçu et l'en-tête d'une brique lisent cela,
  plus `composant.version`.
- La fiche d'une version : `#/projets/:id/releases/:rid` (routes hub et
  cockpit, `ouvrirRelease` dans projet.js). Le serveur y mène
  (`hubReleaseEcrite`).
- `libellePlateforme` partout où une clé brute s'affichait.

### Les réunions

- `reunions/{r}.lieu`, `compteRenduLe` (posé par l'éditeur quand le
  texte du compte rendu change), `rappelEnvoye` (serveur).
- Le client coche ses actions : `ecrire.cocherAction(rid, actions, i,
  fait)` ; règle `reunions` : un membre du projet, réunion visible du
  client, seule la clé `actions` change, même taille, 50 au plus. Les
  règles ne parcourant pas une liste, l'attribution d'une action à une
  personne n'est pas vérifiée : n'importe quelle action se coche.
- `reunionAVenir(r)` (donnees.js) : à venir tant que l'heure n'est pas
  passée depuis plus d'une heure ; `prochaineReunion` s'y appuie, comme
  l'onglet Réunions et le calendrier.
- Le fichier d'agenda : `evenementICS`, `icsDe`, `telechargerICS` dans
  vues/calendrier.js, importés par projet.js et accueil.js. LOCATION,
  participants et ordre du jour en DESCRIPTION, échappement des virgules,
  points-virgules et retours. « Tout mettre dans mon agenda » sur le
  calendrier. Jamais proposé pour une réunion passée.
- `hubRappelsReunions` (onSchedule, 17:00 Europe/Paris) : pour chaque
  réunion visible du client dans la fenêtre « demain » à Paris
  (`_fenetreDemain`), une notification et une lettre `reunion-rappel`
  (`EVENEMENTS['reunion-rappel']`, catégorie `reunions`), une seule fois.
  `_rappelerLesReunions(maintenant)` est exposée pour l'épreuve.
- La fiche : `#/projets/:id/reunions/:rid` (routes hub et cockpit) ; le
  calendrier, l'accueil, la recherche et le serveur y mènent.
- « Demander un créneau » dans la fiche projet ouvre la bulle
  (`bulle:ouvrir`, « Je souhaite un créneau pour ») ; sur l'accueil, le
  lien `#/messages/{pid}?brouillon=…` (agent D).

### Le calendrier

- Un événement réunion mène à la fiche ; « +N » ouvre une fenêtre avec les
  événements du jour ; chaque réunion à venir de la colonne « À venir »
  porte son bouton d'agenda.

### La feuille de route et la bulle

- `devisAvecEtapes` ne retient que les devis acceptés (`devisFrisable`).
- « Une question sur cette étape », « Écrire à Capmedia » (fiche d'une
  réunion, d'une version) émettent `bulle:ouvrir` avec un début de
  phrase ; projet.js ne monte plus la bulle (module global de l'agent E).
- `hubJalonEcrit` : la notification « Étape terminée » nomme le devis de
  l'étape (`documents/{devis}.numero`) et, aux responsables seulement, le
  montant HT de la ligne (`projets/{p}/montants/jalon-{id}`).

### Les accès et l'activité

- `CATEGORIES_LIEN.acces` ; `liens/{l}.identifiants` (texte, 300
  caractères, équipe seule, visible seulement si catégorie Accès et lien
  visible du client) ; groupe « Accès » de l'onglet Liens avec « Copier ».
- `#/activite` (vues/activite.js) : l'activité de tous les projets du
  client, filtre par projet et par nature, pages de 50.
- L'aperçu d'un projet a son encart « Depuis votre dernière visite »
  (`activiteDepuis`, sans les gestes du client, compteurs cliquables).

### Les épreuves

`fonctions-suivi/outils/qa-projet-client.cjs` (navigateur, côté client) ;
le bloc « La fiche projet : le pouls daté, les actions d'une réunion, les
accès, le build » de `regles.test.mjs`.

## 24. L'assemblage du chantier des parcours (27/09/2026, soir)

Les sections 19 à 23 ont été écrites par cinq chantiers menés en parallèle
sur des zones disjointes, puis assemblées et éprouvées ensemble. Ce que
l'assemblage a corrigé :

- Le rail du client a une entrée « Tests » sous chaque projet, à la même
  condition que l'onglet de la fiche (scénarios actifs ou campagnes), pour
  que rail et onglets aient le même compte ; le rail écoute les campagnes.
- « Demandes » dans le rail ne montre qu'un chiffre, le rouge (ce qui attend
  la main du client), comme « Messages ».
- La frise « ligne par ligne » d'un devis : le client la voit pour un devis
  à décider ou accepté (`devisFrisable`), l'équipe pour tout devis qui a des
  étapes (`devisAvecEtapes(documents, jalons, { equipe })`).
- L'accueil de la première fois garde son guide sous la main
  (`guideCourant`) : un écran qui apparaît après la porte (les tests, quand
  les scénarios arrivent) reconstruit le guide sur le même écran, même
  pendant l'animation d'entrée.
- Le miroir « personnesClient » d'un projet bouge aussi `maj`, sinon
  l'aperçu ne se redessinait pas.
- La règle de pilotage d'une demande tolère une demande sans champ
  `qualification`.
- Piège pour les épreuves : `<html data-suite>` existe, un sélecteur
  `[data-suite]` attrape la racine de la page ; avec un bouton en fin de
  ligne, c'est le titre qui porte `data-action`, on lit `closest('.ligne')`.

## 25. Installer l'application de son espace (28/09/2026)

Un seul bouton par espace, pour le système de la personne (Mac ou Windows,
rien sur téléphone, rien dans l'application elle-même) :

- connecté : menu du compte, « Installer Capmedia Hub sur Mac » (le Hub
  pour un client, le Cockpit pour l'équipe, Test pour un testeur), qui
  ouvre une fenêtre avec l'unique bouton de téléchargement
  (`assets/js/installer.js`, `entreeMenuInstaller`) ;
- pas connecté : la porte de connexion propose l'application de l'espace
  d'où l'on vient (`?espace=hub|cockpit|test`, posé par `exigerSession` et
  `quitter` via `espaceCourant()` ; le Hub par défaut), un seul bouton
  (`assets/applications.js`).

Les liens visent toujours « la dernière version publiée » sur le dépôt
public `Nadir-Bensalah/capmedia-apps` : une release par application
(`cockpit`, `hub`, `test`), dont les fichiers portent des noms fixes
(`capmedia-<app>-mac.dmg`, `capmedia-<app>-windows.exe`) remplacés à chaque
publication par `cockpit-bureau/construire/publier.sh`. Les fichiers
`latest-mac.yml` et `latest.yml` publiés à côté servent à l'application
installée, qui se met à jour toute seule (electron-updater, fournisseur
« generic » sur la même adresse). Publier une nouvelle version : monter la
version dans `cockpit-bureau/package.json`, `construire/tout.sh` (Mac et
Windows se construisent depuis le Mac), puis `construire/publier.sh`.

Première publication le 28/09/2026 (0.1.0) : Mac signée ad hoc seulement,
donc bloquée par Gatekeeper tant que la signature Developer ID et la
notarisation ne sont pas faites ; Windows sans signature (avertissement
SmartScreen).

## 26. Les photos et les documents dans les messages (01/10/2026)

Vu en production par le client de ForgeMe : joindre une photo dans
Messages affichait « Firebase Storage: User does not have permission to
access 'projets/…/messages/….png'. (storage/unauthorized) ». La règle
Storage de la conversation (`projets/{p}/messages/**`) décide par
`surSonProjet` ou `equipeSurProjet`, donc par une lecture Firestore
(`firestore.get`) ; en production, cette lecture répond 403 tant que le
compte des règles n'a pas `roles/firebaserules.firestoreServiceAgent`
(voir section 16). Le banc ne le voit pas : l'émulateur n'a pas d'IAM.

Les pièces de la conversation passent désormais par la fonction
`suiviPieceMessage` (`fonctions-suivi/pieces.js`) :

- `POST ?projet=<p>&nom=<nom>&type=<type>`, le fichier en corps : le
  serveur vérifie le jeton, puis l'équipe autorisée sur le projet
  (`acces.equipeSurProjet`) ou un client membre effectif
  (`projets/{p}.membres`), jamais les deux pour la même personne ; il
  contrôle le format (la liste du dépôt) et la taille (10 Mo, vidéo
  30 Mo : une requête vers une fonction s'arrête à 32 Mo), puis écrit
  sous `projets/{p}/messages/<horodatage>-<nom>` par l'Admin SDK ;
- `GET ?chemin=projets/<p>/messages/<objet>` : même vérification, puis
  le fichier est remis tel quel. Aucun autre chemin n'est servi.

Chaque refus laisse une trace (`piece-message.refusee`). Côté page :
`envoyerPiece` (noyau.js) aiguille tout dépôt vers `projets/{p}/messages`
au serveur, et `brancherPieces` (ui.js) lit ces pièces par
`lirePieceMessage` ; la bulle et la page Messages en profitent toutes
deux. Un refus se dit en français ; le texte brut de Firebase n'est
jamais montré (`phraseEnvoi`, `phraseServeur`). La règle Storage du
dossier reste en place, inchangée.

Épreuve : `qa-pieces-messages.cjs`.

## 27. Le calendrier qu'on utilise (01/10/2026)

« Cette page est belle mais elle n'est pas utilisable en l'état. » Le
calendrier du Hub (`#/calendrier`) et le planning du Cockpit (`#/planning`)
partagent désormais tout leur code (`vues/calendrier.js`) : la grille, la
fenêtre d'un jour, le détail d'un élément, la légende.

- **Un jour s'ouvre.** Toute la case est un bouton (souris, Tab, Entrée),
  sous les pastilles. La fenêtre est celle des fiches de tests (fond flou) :
  la date en toutes lettres, puis chaque élément avec son heure (« Journée »
  quand il n'en a pas), son genre, son projet, ce qu'il y a à faire (dit au
  client ou à l'équipe) et le lien vers sa fiche. Un jour vide le dit et
  propose, s'il n'est pas passé, de demander un rendez-vous (client) ou de
  programmer une réunion (équipe) ce jour-là. Ouverte, la fenêtre suit les
  données en direct sans se rouvrir.
- **Une pastille ou une ligne « À venir » ouvre son détail** (quand, ce qu'il
  y a à faire, lieu et ordre du jour d'une réunion, Rejoindre, agenda, fiche).
  Le clic du milieu sur une pastille ouvre toujours la fiche dans un onglet.
- **Un genre, une couleur, une icône** : réunion (bleu), rendez-vous demandé
  (sarcelle, horloge), étape (violet, drapeau), tâche (gris, rouge en
  retard), facture (ambre), devis (corail), version (vert), validation
  (framboise). Jetons `--g-*` de `suite.css`, réglés en clair et en sombre ;
  légende sous la grille.
- **Le client demande un rendez-vous** (bouton en haut, ou depuis un jour) :
  projet, date, créneau (matin, après-midi, ou une heure), sujet,
  précisions. C'est une **demande** (`tickets`, type `demande`) qui porte
  `rendezVous: { date: 'AAAA-MM-JJ', creneau: 'matin'|'apres-midi'|'heure',
  heure: 'HH:MM'|'', sujet }`. Choisie plutôt qu'un message : elle a un
  numéro, un statut, ses e-mails, sa place dans « Demandes » du Cockpit, et
  le client peut la retirer tant qu'elle attend. Tant qu'elle attend
  (`nouveau`, `a-analyser`, `en-attente-client`, `acceptee`), elle figure
  dans les deux calendriers en « Rendez-vous demandé ».
- **L'équipe la programme** depuis le planning (fenêtre du jour, détail,
  liste « Rendez-vous demandés ») ou depuis la fiche de la demande : la
  feuille de réunion arrive préremplie (sujet, jour et heure, précisions,
  participant). À l'enregistrement, la réunion porte `ticket`, la demande
  passe `planifiee`, et un message « Rendez-vous confirmé : … » part dans
  son fil. Le client voit la réunion remplacer la demande, en direct.
- **Règles** : `tickets` accepte la clé `rendezVous` à la création, bornée
  par `rendezVousValide()` (format du jour et de l'heure, créneau connu,
  heure obligatoire pour « heure », sujet de 1 à 100 caractères, aucune
  autre clé). À déployer avec le reste des règles du Hub.
- Le planning dessine désormais par `magasin.dessinateur`, comme le
  calendrier : un dessin par tour.


## 28. La barre latérale du Hub, resserrée (01/10/2026)

- Sous un projet, plus aucune sous-entrée : ses sections (feuille de route,
  tâches, demandes, fichiers, versions...) sont les onglets de sa page. Le
  projet garde son écusson et son chiffre (ce qui attend le client).
- « Demander un projet » descend dans le groupe Compte, juste avant
  « Paramètres » (avec « Mes demandes de projet » en retrait s'il y en a).
- « En attente de vous » et « Demandes » ne font plus qu'une entrée,
  « Demandes » (`#/demandes`). La page s'ouvre sur la section « En attente
  de vous » (`#en-attente` : validations à examiner, puis les autres
  points), puis « Vos demandes » (`#vos-demandes`), puis « Validations
  passées ». Le rouge du rail compte tout ce qui attend le client
  (`enAttenteDeVous`, les demandes à sa réponse comprises, jamais deux
  fois). `#/valider` mène à `#/demandes` ; `#/valider/{id}` (e-mails,
  notifications, recherche, calendrier) ouvre la page Demandes avec la
  fiche de la validation, puis revient à `#/demandes`. La relance du lundi
  (`hub.js`) vise `#/demandes`. `vues/valider.js` ne garde que la fiche
  (`ouvrirValidation`), partagée avec le Cockpit.
- Maintenance : sans aucun forfait actif (`contrat.statut === 'actif'` dans
  `projets/{p}/maintenance`), un rond barré fin, sans fond, à la place des
  chiffres (`repere` d'une entrée, `.lat-repere`), nommé et en infobulle
  « Aucun forfait de maintenance en cours ». Il n'apparaît qu'une fois la
  maintenance de chaque projet arrivée.
- Tests : une campagne `en-cours` sur un projet du client anime l'entrée
  (`enCours` d'une entrée, `.lat-lien--en-cours`) : un reflet lent sur le
  libellé et l'icône qui respire, 2,6 s en boucle, rien quand l'entrée est
  ouverte ni avec « réduire les animations ». Le rail écoute les campagnes :
  l'animation vient et part sans recharger. Le Cockpit anime son entrée
  Tests de la même façon quand une campagne tourne.

## 29. En-têtes de sécurité (01/10/2026)

Un coffre chiffré dans le navigateur arrive dans le Hub : une seule XSS sur
`capmedia.app` lirait la phrase de passe au moment où elle est tapée. La
politique de sécurité du contenu (CSP) réduit ce que du code injecté peut
faire : il ne s'exécute pas, et même exécuté il ne peut rien envoyer ailleurs
qu'aux services du projet.

**Deux copies, une seule politique.** Chaque page de `agence/suivi/` porte la
CSP en `<meta>`, première balise après `charset` (le banc local sert les
fichiers sans `.htaccess`). En production, `agence/.htaccess` envoie la même
en en-tête pour `/suivi` seulement (bloc `<If>`). Le navigateur applique les
deux, la plus stricte gagne :

- la `<meta>` ajoute `http://127.0.0.1:*` à `connect-src` et `img-src` : les
  émulateurs du banc (8080, 9099, 9199, 5001). En production l'en-tête ne
  les a pas, donc la page ne peut pas les joindre. Choisi plutôt qu'un
  remplacement au moment du service : n'importe quel serveur statique
  (banc, poste de développement, application de bureau sur une adresse
  locale) donne le même résultat, sans outil à maintenir ;
- l'en-tête ajoute `frame-ancestors 'none'` (impossible en `<meta>`) et
  `upgrade-insecure-requests`.

**Ce qui est autorisé, et pourquoi.**

| Directive | Valeur | Pourquoi |
|---|---|---|
| `default-src` | `'self'` | tout ce qui n'est pas listé ne vient que du site |
| `script-src` | `'self' https://www.gstatic.com/firebasejs/10.13.2/` | nos fichiers et le SDK Firebase de **cette** version seulement. Ni `'unsafe-inline'` ni `'unsafe-eval'` : aucun script en ligne, aucun `onclick=` |
| `style-src` | `'self' 'unsafe-inline'` | les vues fabriquent leur HTML avec plus de 500 attributs `style=` ; les retirer est un chantier à part. Un style injecté ne vole rien, il peut seulement maquiller |
| `style-src-elem` | `'self'` | les balises `<style>` restent interdites : seuls les attributs ont besoin d'`'unsafe-inline'` |
| `img-src` | `'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://www.google.com/images/cleardot.gif` | les icônes SVG en `data:` des feuilles de style, une pièce ouverte dans un onglet (`blob:`), les visuels des campagnes (liens de téléchargement Storage), les logos de projet (rendus publics par `poserLogo`), et le pixel par lequel le canal temps réel de Firestore teste le réseau quand la connexion flanche (ce fichier-là seulement, pas le reste de google.com) |
| `connect-src` | `'self'` + `firestore`, `identitytoolkit`, `securetoken`, `firebasestorage` (`.googleapis.com`) + `https://europe-west1-capmedia-1f90d.cloudfunctions.net` | la base, la session, le stockage, nos fonctions. Rien d'autre : du code injecté n'a nulle part où envoyer ce qu'il lit |
| `frame-src` | `'none'` | aucune iframe |
| `object-src`, `base-uri` | `'none'` | ni plugin, ni `<base>` qui détournerait les chemins relatifs |
| `form-action` | `'self'` | les formulaires sont envoyés par le script ; aucun ne part ailleurs |
| `frame-ancestors` | `'none'` (en-tête) | personne n'encadre l'espace (avec `X-Frame-Options: DENY` pour les anciens navigateurs) |

Pas de Google Fonts, pas de service worker, pas de manifeste : rien à ouvrir.
WebAuthn (clés d'accès) n'a besoin d'aucune directive CSP.

**Ce qui a changé dans le code pour la tenir.**

- Les scripts en ligne sont sortis en fichiers : `assets/js/theme-avant.js`
  (le thème avant le premier pixel, toujours bloquant dans le `<head>`, la
  clé dans `data-cle`), `assets/js/porte-service.js` (le badge de la porte
  dans une application de bureau), `assets/js/redirection.js` (console,
  projet, ticket : destination dans `data-vers`, `data-param`, `data-ancre`).
- Les trois `onclick=` des vues sont devenus des écouteurs :
  `data-sans-lien` (un bouton posé dans un lien ne le suit pas),
  `data-sans-propagation` (« Rejoindre » n'ouvre pas la fiche de la réunion),
  `data-recharger` (le bouton du routeur quand une vue échoue).
- `noyau.js` ouvre l'authentification par `initializeAuth` avec les mêmes
  mémoires que `getAuth`, sans le module des fenêtres surgissantes : sur
  Safari et les téléphones, `getAuth` chargeait d'office un script de
  `apis.google.com` et une iframe de `firebaseapp.com`, inutiles à une porte
  par code ou par lien.
- Une nouvelle version du SDK Firebase change le chemin : mettre à jour
  `script-src` dans les pages ET dans le `.htaccess` (`qa-csp` vérifie
  qu'ils sont identiques).

**Les autres en-têtes (`/suivi` seulement).** `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(),
publickey-credentials-get=(self), publickey-credentials-create=(self)`,
`Strict-Transport-Security: max-age=31536000` (un an, sans sous-domaines,
sans preload : tout `capmedia.app` est déjà redirigé vers https, et le
navigateur applique HSTS à tout le domaine, `/academy` compris, ce qui est
sans effet puisqu'il est déjà en https).

**La garde.** `fonctions-suivi/outils/qa-csp.cjs` ouvre la porte, les trois
redirections, le Hub (cliente), le Cockpit (équipe) et l'espace Test
(testeur), et échoue à la moindre violation ; elle vérifie aussi qu'un
script en ligne, un `onerror=`, un script d'un hôte inconnu et une balise
`<style>` injectés sont refusés, et que les fichiers n'ont plus aucun script
en ligne.

**À terme.** Servir le Hub sur un sous-domaine à lui (`hub.capmedia.app`) :
une faille sur une autre page de `capmedia.app` (site, blog, académie)
partage aujourd'hui l'origine, donc le stockage local et la session du Hub.
Une origine isolée la tiendrait hors d'atteinte. Non fait : il faut un
domaine autorisé dans Firebase Auth, l'adresse dans les applications de
bureau et les e-mails, et une redirection depuis `/suivi`.
