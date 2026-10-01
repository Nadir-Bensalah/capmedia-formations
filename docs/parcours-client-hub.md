# Campagne de parcours : le client dans le Hub

Relevé du 27/09/2026, établi en lisant le code de l'espace client
(`agence/suivi/assets/js`, `fonctions-suivi`, règles). Chaque scénario est
écrit à la première personne du client, puis tracé tel qu'il existe
aujourd'hui : où il va, ce qu'il voit, ce qu'il peut faire, en combien de
clics, ce qui coince, et le verdict.

Les verdicts :

- **Simple** : le parcours tient, rien à changer.
- **À alléger** : ça marche, mais un détour, un doublon ou un libellé gêne.
- **Manque** : le client attend une chose que le Hub ne lui donne pas.
- **Cassé** : le Hub promet une chose que le code ne fait pas.

Deux rôles côté client : le **responsable** (celui qui engage la société)
et le **collaborateur**. Seul le responsable voit la finance. Le rôle n'est
jamais expliqué au client (voir scénario 61).

---

## 0. Ce qui est cassé, à corriger avant tout

Ces points disent au client une chose que le code ne fait pas.

| # | Où | Ce qui est dit | Ce qui se passe |
|---|---|---|---|
| C1 | Demande en « Besoin d'information » | « Répondez ci-dessous : la demande repart dès votre réponse » | La réponse ne change ni le statut ni la date. Le point reste dans « En attente de vous », dans la pastille rouge et dans la relance du lundi, jusqu'à ce que l'équipe agisse. |
| C2 | Demande « À valider par vous », bouton « Pas tout à fait » | Sous-entend un refus de la correction | Ne fait que placer le curseur dans le champ de message. La demande reste « À valider par vous ». |
| C3 | Paramètres, « Résumé quotidien » | Un résumé par jour | Non implémenté côté serveur. Vaut « Immédiat ». |
| C4 | Demande qualifiée « À chiffrer » | « Un devis vous sera proposé » avec lien vers le devis | Le champ qui relie la demande au devis n'est écrit par aucun écran. Le lien n'apparaît jamais. |
| C5 | E-mail de qualification « hors périmètre » | Un objet lisible | La clé porte un accent dans la table des courriels, la valeur stockée non : le client lit le code brut « hors-perimetre ». |
| C6 | E-mail « Votre demande est terminée » | « Ouvrez une nouvelle demande, qui gardera le lien avec celle-ci » | Aucun champ ne relie deux demandes. |
| C7 | E-mail « Votre devis est disponible » | « Accepter ou refuser en un clic depuis la page du projet » | Le lien mène à l'aperçu du projet, qui n'a pas les boutons. Il faut passer par « En attente de vous » puis ouvrir la fiche. |
| C8 | E-mail « Votre facture est disponible » | « Avec son fichier PDF » | Envoyé même sans PDF. |
| C9 | Page d'une brique, bouton « Télécharger » d'un fichier | Télécharge | Ne fait rien : le geste n'est jamais branché sur cette page. |
| C10 | Fiche d'une version | S'ouvre au clic | La fonction d'ouverture est vide. |
| C11 | Paramètres, « Devis et factures » | Un avis pour une facture « bientôt échue » | Aucun envoi de ce genre n'existe. |
| C12 | Devis dont la validité est passée | « Valable jusqu'au » | Reste acceptable, la puce ne passe pas au rouge, le statut « Expiré » ne se pose qu'à la main. |
| C13 | Relance du lundi | Compte « N points attendent votre réponse » | Compte aussi les validations réservées au responsable et les envoie aux collaborateurs, que le Hub exclut. |
| C14 | Onglet Tests, fiche d'une campagne sans testeur | Un message pour le client | « Le vivier est vide : le serveur seul y inscrit quelqu'un. » et « Versez un plan de tests sur ce projet. » sont des textes internes. |
| C15 | Messages : le rail et la bulle | Un seul « non lu » | Deux compteurs qui s'ignorent : lire dans la bulle ne fait pas tomber la pastille du rail, lire sur la page Messages ne fait pas tomber celle de la bulle, et l'équipe voit « Envoyé » au lieu de « Lu ». |
| C16 | Aperçu du projet, page « En attente de vous », pour un collaborateur | Ce que je peux faire | Listent des validations réservées au responsable, avec le bouton « Examiner » ; le chapo peut dire « Rien ne vous attend » au-dessus d'une liste non vide. |

**Corrigés le 27/09/2026**, tous les seize (voir `docs/suivi.md` §18). Deux
choix à connaître : le « Résumé quotidien » a été retiré plutôt
qu'implémenté (C3), et pour C10 les cartes de version montraient déjà tout,
c'est le gestionnaire mort qui a été retiré.

---

## A. Arriver et me repérer

### 1. Je me connecte pour la première fois
**Aujourd'hui** : porte « Bienvenue, prénom », puis sept écrans (ce que fait Capmedia, mes projets, les quatre endroits d'un projet, « Trois gestes, et rien d'autre », les tests, l'app de bureau, « Tout est prêt »). Bouton « Aller directement à mon espace » dès la porte, « Passer » ensuite. Rejouable par « Revoir les premiers pas » dans le menu du compte.
**Ce qui coince** : « Trois gestes » ne cite que À valider, Demandes et Messages, alors que « En attente de vous » contient aussi les devis, les factures, les tâches et les points bloquants. L'écran « Testé avant d'être livré » s'affiche même quand le client n'a aucun test.
**Verdict** : À alléger. Aligner l'écran « Trois gestes » sur ce que le Hub demande vraiment, masquer l'écran des tests sans scénario.
Fait le 27/09/2026 : l'écran devient « Ce qu'on vous demandera » et cite les cinq gestes de « En attente de vous » (valider, répondre, décider un devis, régler une facture, débloquer un point) ; l'écran des tests n'apparaît que si des scénarios ou des parcours concernent le client (même condition que l'entrée Tests du rail).

### 2. J'ouvre le Hub un matin ordinaire
**Aujourd'hui** : accueil `#/`. « Bonjour prénom », un chapo qui compte projets actifs, points en attente, messages non lus. Boutons « Nouvelle demande » et « Message ». Bloc « En attente de vous » (6 lignes), cartes projets (statut, étape en cours, progression, verdict de délai), activité récente, à droite prochaine réunion, finances, dernières versions. Zéro clic pour l'essentiel.
**Ce qui coince** : « Nouvelle demande » et « Tout voir » de l'activité visent toujours le premier projet. La carte Finances s'affiche à un collaborateur qui n'y a pas accès (« Aucune facture en attente », alors qu'il ne les voit pas). Une version s'affiche avec sa clé brute (« ios 1.2.0 »).
**Verdict** : Simple pour un client à un projet. À alléger pour plusieurs projets : choisir le projet au moment de la demande, cacher la carte Finances au collaborateur.
Fait le 27/09/2026 : la carte « Dernières versions » lit le libellé de la plateforme (« iPhone 1.2.0 », plus « ios 1.2.0 »), comme la recherche, le calendrier et la fiche projet (`libellePlateforme`) ; la carte « Prochaine réunion » porte « Ajouter à mon agenda » (le même fichier .ics que la fiche et le calendrier) et mène à la fiche de la réunion.
Fait le 27/09/2026 : au dépôt d'un devis ou d'une facture, une notification dans le Hub (« Nouveau devis », « Nouvelle facture ») aux responsables du projet seulement, avec le lien vers la pièce.
Fait le 27/09/2026 : à plusieurs projets actifs, « Nouvelle demande » (accueil et recherche), « Message » et « Demander un créneau » (carte réunion, vers `#/messages/{pid}?brouillon=…`) demandent « Pour quel projet ? » ; « Tout voir » de l'activité mène à `#/activite` ; la carte Finances n'apparaît qu'à un responsable ; la puce d'une carte projet dit « N chez nous · M à vous ».

### 3. Je veux savoir ce qui a bougé depuis ma dernière visite
**Aujourd'hui** : encart « Depuis votre dernière visite » sur l'accueil, avec des compteurs (tâches, versions, messages, validations, fichiers).
**Ce qui coince** : la date est réécrite à chaque chargement : un simple rechargement vide l'encart. Les compteurs ne sont pas cliquables. Mes propres actions comptent dedans. Rien de tel sur la fiche d'un projet.
**Verdict** : À alléger. Ne poser la date qu'à la fin de la session, rendre les compteurs cliquables, exclure mes propres actions.
Fait le 27/09/2026 : la fiche d'un projet a le même encart « Depuis votre dernière visite » en tête de l'aperçu (`activiteDepuis`, filtré sur le projet, sans les gestes du client, `a.par.uid !== uid`), chaque compteur menant à l'onglet (tâches, versions, fichiers, étapes, réunions, demandes) ou aux Messages et à « En attente de vous ».
Fait le 27/09/2026 : `derniereVisite` n'est plus réécrite au démarrage ; elle se pose quand la page se cache (`pagehide`, `visibilitychange`) et toutes les dix minutes d'activité, sans toucher à la valeur lue pour la session. Les compteurs de l'encart sont des liens (section du projet, ou `#/activite` quand plusieurs projets bougent) et n'incluent plus les gestes du client. À la toute première connexion l'encart n'apparaît pas : l'accueil de la première fois fait déjà l'accueil, et il n'y a rien « depuis » à compter.

### 4. Je cherche quelque chose (une demande, un fichier, un devis)
**Aujourd'hui** : palette ⌘K, groupes Projets, Demandes, Tâches, Fichiers, Devis et factures, Réunions, Versions. Trois actions sans terme : Nouvelle demande, Envoyer un message, Voir ce qui vous attend.
**Ce qui coince** : ignore les validations, les messages, les décisions, les liens, les pages (Calendrier, Paramètres, Maintenance). Un fichier, une réunion ou une version mène à l'onglet, pas à l'élément. Inclut les projets archivés.
**Verdict** : À alléger.
Fait le 27/09/2026 : la recherche trouve les validations en attente (`/valider/{id}`), les décisions (`/projets/{p}/notes`), les liens (ouverts dans un nouvel onglet), les pages de l'espace (En attente de vous, Demandes, Messages, Calendrier, Documents, Maintenance, Paramètres, Devis et factures pour le responsable, Tests si visible) ; un fichier mène à `/projets/{p}/fichiers?f={id}`, une réunion à `/projets/{p}/reunions/{rid}`, une version à `/projets/{p}/releases/{rid}` ; les projets archivés et ce qui leur appartient sont exclus, et « Nouvelle demande » ne vise jamais un projet archivé.

### 5. Je regarde mes notifications
**Aujourd'hui** : cloche (un point, sans chiffre), feuille « Notifications », 60 au plus, « Tout marquer comme lu », un clic vers l'objet. Notification système et badge dans les apps de bureau.
**Ce qui coince** : le nom du projet n'y figure pas (ambigu à plusieurs projets). Une notification reste non lue quand j'ai traité l'objet ailleurs (validation approuvée, message lu). Même puce pour tout.
**Verdict** : À alléger. Nom du projet dans chaque notification, lecture automatique quand l'objet est traité.
Fait le 27/09/2026 : chaque notification porte le nom de son projet et une icône de son type (trait fin, sans pastille de couleur) ; à chaque changement d'adresse, les notifications non lues dont le lien est la page ouverte passent `lu: true` (coquille.js, `lireSurPlace`).

### 6. J'ai plusieurs projets
**Aujourd'hui** : un rail par projet avec ses neuf sections dépliées quand j'y suis, une pastille rouge par projet.
**Ce qui coince** : les raccourcis (Nouvelle demande, Tout voir, recherche) visent le premier projet. Pas de vue « Mes demandes » tous projets. La page Maintenance à plusieurs projets affiche la vue pensée pour l'équipe (« Demandes à traiter », « N clients attendent une proposition »).
**Verdict** : Manque. Un choix de projet à chaque raccourci, une liste des demandes tous projets, une vue Maintenance client.
Fait le 27/09/2026 : `#/demandes` (vues/demandes.js) liste les demandes de tous les projets avec les filtres de l'onglet Demandes et un filtre par projet, entrée « Demandes » du groupe Suivi (rouge = celles qui attendent le client) ; la page Maintenance d'un client à plusieurs projets montre une carte par projet (forfait ou « Pas de forfait »), jamais la vue équipe ; les raccourcis demandent le projet (voir 2).

### 7. Je suis collaborateur, pas responsable
**Aujourd'hui** : même espace, sans « Devis et factures » ni la frise du devis, et certaines validations réservées au responsable.
**Ce qui coince** : rien ne me dit mon rôle ni pourquoi je ne vois pas la finance. La carte Finances et les listes de validations me montrent des choses fermées (C16). Le lien vers le devis depuis Maintenance ne mène nulle part pour moi.
**Verdict** : Manque. Afficher mon rôle, cacher ce qui m'est fermé, expliquer en une ligne.

---
Fait le 27/09/2026 : le rail dit « Vous êtes responsable » ou « Vous êtes collaborateur » sous le nom de l'entreprise dans une fiche projet ; la section « Les personnes » de l'aperçu (vues/personnes.js) montre le rôle de chacun et l'explique en une ligne ; la carte Finances et le lien vers le devis du forfait sont cachés au collaborateur ; `/projets/{p}/acces` tapée par un client retombe sur l'aperçu avec le toast « Les accès sont gérés par Capmedia. ».

## B. Savoir ce qu'on attend de moi

### 8. Je veux savoir si j'ai des choses à fournir
**Aujourd'hui** : six genres comptés dans « En attente de vous » : validation, demande en attente de ma réponse ou à valider, devis à décider, facture due, tâche « attente client », point bloquant de mon côté. Visibles : rail (pastille rouge), accueil, aperçu du projet (5 lignes), page `#/valider`, titre de l'onglet, relance du lundi. Trié par retard puis échéance. Un clic pour arriver sur l'objet.
**Ce qui coince** : trois noms pour la même page (« En attente de vous » dans le rail et le titre, « À valider » dans l'onglet et le fil d'Ariane). Les réunions n'en font pas partie et n'ont aucun rappel avant l'heure. Le texte libre « Attendu de vous » saisi par l'équipe peut contredire la liste calculée. À 6 points ou moins, le bloc de l'accueil n'a pas de lien vers la page complète.
**Verdict** : Simple sur le fond, c'est le meilleur parcours du Hub. À alléger sur les noms et les réunions.
Fait le 27/09/2026 : un seul nom, « En attente de vous », dans le titre de l'onglet et le fil d'Ariane (`vues/valider.js`), comme dans le rail ; l'éditeur de validation de l'équipe le dit aussi.

### 9. Je dois valider une maquette ou une décision
**Aujourd'hui** : e-mail « Examiner et répondre » ou notification, 1 clic vers la fiche, « Approuver » ou « Demander des modifications » (commentaire obligatoire). Depuis le rail : 3 clics. L'équipe reçoit notification, e-mail et activité.
**Ce qui coince** : impossible de joindre un fichier avec mes remarques. Une seule réponse, sans échange ni correction après coup. Aucune confirmation ne me revient, et mes collègues ne sont pas prévenus. Quand l'équipe annule une validation, rien ne me le dit : ma notification pointe vers une validation annulée.
**Verdict** : Simple pour approuver. Manque pour les remarques : pièce jointe, accusé, information d'annulation.
Fait le 27/09/2026 : la fiche porte un dépôt de fichiers (Storage `projets/{p}/validations/{vid}/reponse/`, `reponse.pieces` borné à 10 par les règles) ; un accusé revient à l'auteur (« Merci, c'est validé » / « Vos remarques sont transmises ») et ses collègues du projet lisent « X a approuvé « … » » ; quand l'équipe annule, le client lit « Validation retirée » et la notification « Votre validation est attendue » qui pointait vers elle est marquée lue ; « Validations passées » montre une annulée avec sa pastille et une icône neutre, et se lit par vingt (« Voir plus ») ; un identifiant inconnu dans l'adresse : « Cette validation n'existe plus. ».

### 10. On me demande une précision sur ma demande
**Aujourd'hui** : bandeau « La balle est dans votre camp », je réponds dans les échanges.
**Ce qui coince** : C1. Ma réponse ne fait rien repartir. Je reste « à faire » partout jusqu'à ce que l'équipe change le statut à la main.
**Verdict** : Cassé. La réponse du client doit repasser la demande « En cours » (le serveur le sait faire pour d'autres statuts).

Fait le 27/09/2026 : c'est le point C1 de la section 0, le serveur fait repartir la demande à la réception de la réponse.

### 11. Une tâche attend mon retour
**Aujourd'hui** : e-mail « Voir et répondre », fiche de la tâche avec un encart « Répondez-nous dans la conversation du projet » et un bouton « Écrire à Capmedia » qui quitte la page vers Messages.
**Ce qui coince** : aucun champ de réponse sur la tâche, rien ne relie ensuite le message à la tâche, et la tâche reste « En attente client » jusqu'à ce que l'équipe la change. Le libellé « En attente client » est écrit pour l'équipe, pas pour moi.
**Verdict** : Manque. Une réponse (texte, fichier) directement sur la tâche, qui la fait passer « Répondu ».
Fait le 27/09/2026 : la fiche d'une tâche « À vous » porte « Votre réponse », un dépôt (Storage `projets/{p}/taches/{tid}/reponse/`) et « Envoyer ma réponse » ; la tâche passe « Réponse reçue » (`repondu`, voile violet, visible au kanban), quitte « En attente de vous », et l'équipe reçoit activité, notification et lettre `tache-reponse`. Le client lit « À vous » là où l'équipe lit « En attente client » (clé `client:` de STATUTS_TACHE, `pastille(…, { client })`).

### 12. Un point bloque de mon côté
**Aujourd'hui** : notification « Un point bloque de votre côté » (sans e-mail), lien vers l'aperçu du projet où le blocage est dans « Points bloquants », sans ancre, sans bouton.
**Ce qui coince** : rien ne dit comment le débloquer, ni pour quand, ni à qui écrire. « Responsable : le client » est une formulation à la troisième personne. Aucune date attendue de résolution.
**Verdict** : Manque. Une fiche du blocage avec « Ce qu'on attend de vous », un bouton « C'est fait » ou « Répondre », un e-mail.
Fait le 27/09/2026 : l'éditeur de l'équipe porte « Ce qu'on attend du client » (`attendu`) et « Attendu pour le » (`echeance`) ; côté client, le point s'ouvre en fiche (clic sur la ligne, ou `/projets/{p}?blocage={id}` depuis « En attente de vous », la notification et la lettre `blocage-client`) avec « Ce qu'on attend de vous », « Depuis le », « Attendu pour le », « C'est fait » (`signaleFait`, une fois, règle `clientSignaleFait` ; l'équipe est prévenue : « Point bloquant : le client dit que c'est fait ») et « Répondre » (ouvre la bulle, sujet prérempli, événement `bulle:ouvrir`). « Responsable : le client » devient « De votre côté » / « De notre côté » / « Un tiers ».

### 13. La relance du lundi
**Aujourd'hui** : e-mail à 9 h, « N points attendent votre réponse », bouton vers `#/valider`. Aussi « Facture à régler : numéro libellé ».
**Ce qui coince** : C13. Les factures y sont sans montant ni échéance. Aucune alerte d'échéance ou de retard de facture en dehors de ce lundi.
**Verdict** : À alléger.
Fait le 27/09/2026 : la relance liste chaque facture avec son montant TTC et son échéance (« F-2026-0031 · 1 200,00 € TTC · échéance 30/09 », ou « en retard de N jours »). Et une fonction quotidienne (`hubEcheancesQuotidien`, 8 h Europe/Paris) envoie trois jours avant l'échéance une notification « Facture à régler avant le … » et une lettre `facture-echeance`, une seule fois.

---

## C. Suivre l'avancement de mon application

### 14. Je veux savoir où en est mon application aujourd'hui, en temps réel
**Aujourd'hui** : fiche projet `#/projets/:id`, onglet Aperçu. En-tête : statut, « Livraison visée » et son verdict, responsable Capmedia, « Dernière activité il y a… ». Quatre cases « En ce moment », « Dernière livraison », « Prochaine étape », « Attendu de vous », un anneau de progression avec sa source, « Tenue des délais », points bloquants, parties du projet, feuille de route (6 étapes), activité (8 lignes), à droite réunion, échéances, validations, demandes. Les données sont en direct (écoutes Firestore).
**Ce qui coince** : les quatre cases sont des textes libres saisis par l'équipe, sans date, qui priment sur les valeurs calculées : elles peuvent être périmées ou contredire le bloc « En attente de vous ». Trois ou quatre pourcentages calculés différemment (anneau, frise du devis, partie, étape), aucun daté, « Estimée par Capmedia » sans dire quand. « Tenue des délais » disparaît quand aucune date n'est fixée, sans le dire. Onze onglets dans la page, neuf dans le rail, pas dans le même ordre.
**Verdict** : À alléger, et c'est le cœur de la promesse « en temps réel ». Dater chaque texte libre (« mis à jour le … par … »), un seul pourcentage expliqué, dire « aucune date de livraison fixée » plutôt que cacher.
Fait le 27/09/2026 : l'éditeur du projet écrit `pulseMaj` (date du serveur) et `pulsePar` quand un texte du pouls change (règles `projets`, agent et administrateur) ; chaque case renseignée dit « mis à jour le JJ/MM par Prénom », une case vide montre la valeur calculée ; « Attendu de vous » ne lit plus le texte libre, elle dit « N points, voir ci-dessus » ou « Rien » d'après le bloc d'attente. Un seul pourcentage : l'anneau, avec sa source (« d'après les étapes de la feuille de route », « estimé par Capmedia le JJ/MM » grâce à `progression.le`) ; la frise du devis garde « N / M étapes faites » et sa jauge sans chiffre ; la carte d'une partie dit « avancement de la partie · JJ/MM » ; la fiche d'une étape montre une barre, plus de « N % fait ». « Tenue des délais » reste sans date et dit « Aucune date de livraison n'est fixée pour l'instant ». Les onglets suivent l'ordre des neuf sections du rail ; « Tests » n'apparaît au client que s'il y a des scénarios ou des campagnes (à l'agent D d'ajouter la même entrée conditionnelle au rail).

### 15. Je veux savoir quelle version est en test ou disponible, sur Android et sur iPhone
**Aujourd'hui** : cartes plateformes en tête de l'aperçu (si l'équipe a déclaré les plateformes), « Version X · En cours » ou « Pas encore suivie ». Onglet « Versions » : numéro, titre, « Publiée le », pastille (En développement, En test, Soumise, En validation, Disponible, Retirée), notes classées, boutons « Ouvrir dans le store » et « Version de test ».
**Ce qui coince** : la version d'une carte plateforme vient d'un champ saisi à la main, pas de la dernière version publiée : les deux peuvent diverger. Aucun numéro de build, aucun champ TestFlight ou Play dédié (ils n'existent que sur les campagnes de test). Une version ne s'ouvre pas (C10). Les cartes « Les parties du projet » ne sont pas cliquables.
**Verdict** : Manque. Une ligne par plateforme, alimentée par la dernière version réelle : « Android : 1.4.2 en test sur Play depuis le 22/09, 1.4.1 disponible ». Build et lien de test sur la version.
Fait le 27/09/2026 : la version porte un `build` (texte, 40 caractères, règle `releases`) et ses liens « App Store ou Play Store » et « TestFlight ou Play interne » ; les cartes plateformes lisent les versions (`etatVersions`) : « 1.4.1 disponible depuis le 12/09 », « 1.4.2 en test depuis le 22/09 · build 87 », boutons « Store » et « Test », « Pas encore suivie » sinon ; « Dernière livraison » du pouls lit pareil ; les cartes « Les parties du projet » mènent à la brique ; une version s'ouvre en fiche (clic ou `#/projets/:id/releases/:rid`, route hub et cockpit) avec notes, build, partie, date, liens ; les notifications et la lettre « Version disponible » y mènent.

### 16. Je veux savoir si la date de livraison tient
**Aujourd'hui** : « Livraison visée », « Initialement le … · N reports », « Ce qui pèse sur cette date », « L'histoire de cette date » (report, motif, auteur), ou « Cette date n'a jamais bougé ».
**Ce qui coince** : section absente sans date, sans le dire. « Ce qui pèse » cite les demandes restées chez moi sans lien vers elles.
**Verdict** : Simple, à un détail près.
Fait le 27/09/2026 : « Ce qui pèse sur cette date » cite « demande en attente de votre réponse depuis plus d'une semaine » avec un lien vers `#/projets/{p}/demandes?filtre=pour-vous`, qui pose le filtre « Pour vous ».

### 17. Je veux voir la feuille de route et ce que j'ai acheté
**Aujourd'hui** : onglet « Feuille de route », en tête « Le devis, ligne par ligne » (« Ce qui est coché est livré »), puis les étapes par phase avec dates, tâches, reports, pastille. Fiche d'une étape : description, dates, « Suivie par », tâches, livré pendant l'étape, historique de la date, bouton « Une question sur cette étape ».
**Ce qui coince** : la frise du devis s'affiche aussi pour un devis refusé, expiré ou encore à décider. Un collaborateur ne la voit pas du tout. « Une question sur cette étape » quitte la page vers Messages alors qu'une bulle est montée sur la page. La notification « Étape terminée » ne dit ni le devis ni le montant.
**Verdict** : À alléger. Ne frise que les devis acceptés, ouvrir la bulle plutôt que changer de page.
Fait le 27/09/2026 : `devisAvecEtapes` ne retient que les devis acceptés (`devisFrisable`) ; « Une question sur cette étape » émet `bulle:ouvrir` avec « À propos de l'étape « … » : » sans quitter la page (idem « Écrire à Capmedia » sur la fiche d'une réunion et d'une version) ; projet.js ne monte plus la bulle, le module global de l'agent E s'en charge ; la notification « Étape terminée » nomme le devis (« · devis D-2026-0028 ») et, aux responsables seulement, le montant HT de la ligne.

### 18. Je veux savoir ce qui a été livré et ce qui a changé
**Aujourd'hui** : onglet Versions avec ses notes (Nouveau, Amélioration, Correction, Technique), « Dernière livraison » sur l'aperçu, « Dernières versions » sur l'accueil.
**Ce qui coince** : voir 15. La clé brute de plateforme partout.
**Verdict** : À alléger.
Fait le 27/09/2026 : le libellé de la plateforme partout (accueil, fiche projet, onglet Versions, calendrier, recherche, brique, lettre et activité côté serveur) ; la page d'une brique lit ses versions réelles en tête et dit « Pas encore suivie » plutôt que « 0 % Avancement ».

### 19. Je veux lire l'activité complète
**Aujourd'hui** : onglet Activité du projet, 8 lignes sur l'aperçu puis « Tout voir ».
**Ce qui coince** : « Tout voir » depuis l'accueil mène au premier projet seulement.
**Verdict** : Simple.
Fait le 27/09/2026 : nouvelle page `#/activite` (vues/activite.js) : l'activité de tous mes projets, filtre par projet (sélecteur) et par nature (boutons), pages de 50 avec « Voir 50 de plus » ; « Tout voir » de l'accueil y mène.

---

## D. Signaler et demander

### 20. Je veux signaler un bug, l'expliquer, joindre une preuve (ou pas)
**Aujourd'hui** : « Nouvelle demande » (en-tête du projet, onglet Demandes, accueil, recherche, ou « En faire une demande » depuis un message de la bulle, qui préremplit). Formulaire : 9 types (Anomalie par défaut), titre, description, urgence, partie du projet, liens, pièces (10 fichiers, envoi immédiat avec progression). Pour un bug : plateforme, version, appareil, étapes pour reproduire, attendu, obtenu, tous facultatifs. Bouton « Signaler l'anomalie ». Confirmation « Demande envoyée. Nous vous répondons vite. », puis la fiche. Environ 6 champs, 1 écran, 2 clics.
**Ce qui coince** : l'aide dit « Images, PDF, vidéos courtes. 10 Mo » alors que les vidéos vont jusqu'à 100 Mo et que Word, Excel, zip passent ; le refus n'arrive qu'après le choix (pas d'attribut accept). Un lien mal formé est ignoré sans message. L'aide de l'urgence n'explique que deux niveaux sur quatre. L'e-mail de confirmation salue l'auteur mais part à tous les interlocuteurs du projet. Le type n'apparaît dans l'e-mail que pour trois types sur neuf.
**Verdict** : Simple, bon parcours. À alléger sur l'aide des pièces et l'e-mail.
Fait le 27/09/2026 : l'aide des pièces dit vrai (« Images, PDF, documents Office, zip jusqu'à 10 Mo ; vidéos mp4, mov, webm jusqu'à 100 Mo. ») et le champ de fichier porte `accept`, pour tous les dépôts (`FORMATS_ACCEPTES` dans noyau.js, lu par `depot`) ; un lien mal formé est refusé sous le champ ; l'aide de l'urgence explique les quatre niveaux ; pour une nouvelle fonctionnalité, le champ s'appelle « Ce que vous attendez » ; l'accusé `ticket-cree` connaît les neuf types et salue chaque destinataire par son nom (une lettre par personne, option `parDestinataire` de `ecrireAuxClients`) ; le chapo promet « un e-mail à chaque étape ».

### 21. Je veux suivre la correction de mon bug
**Aujourd'hui** : fiche `#/projets/:id/demandes/:tid`. Bandeau « où en est ma demande » : statut en langage client, qui a la main (« C'est à nous de jouer » ou « La balle est dans votre camp »), la suite, « Ouverte depuis », « Dernier mouvement », « Suivie par », « Livrée dans » (version). « Le signalement », « Échanges », « Tâches liées », « Tout ce qui lui est arrivé ». E-mail et notification à chaque changement de statut, à chaque réponse de l'équipe, à la qualification. Liste des demandes avec filtres Ouvertes, Pour vous, Terminées, Toutes et un point « non lu ».
**Ce qui coince** : « Vous recevrez un e-mail à chaque mouvement » mais l'urgence et l'assignation n'en envoient pas. Le « lu » est commun à tous les clients du projet. Une demande « Refusée » n'affiche aucun motif. Je ne peux ni modifier le titre, ni ajouter une pièce au signalement (la fonction existe, aucun écran ne l'appelle), ni fermer ma propre demande. Mes collègues ne sont pas prévenus de mes réponses.
**Verdict** : Simple sur le suivi, c'est bien fait. Manque : ajouter une pièce après coup, fermer ma demande, motif du refus.
Fait le 27/09/2026 : « Ajouter une pièce » dans « Le signalement » (`ecrire.ajouterPiecesDemande`) ; « Je n'en ai plus besoin » tant que la demande est reçue, à analyser, acceptée ou planifiée (règle `clientAnnule`, l'équipe lit « Demande retirée par le client ») ; une demande refusée montre « Pourquoi : … » (`motifRefus`, obligatoire dans le pilotage pour un refus) ; le « non lu » est celui de chaque personne (`lu.clients[uid]`, en plus de `lu.client`). Les collègues du projet sont prévenus d'une réponse du client sur la demande (notification « X a répondu sur REF-… », auteur exclu, `hubMessageTicketBoite`).

### 22. On me dit que c'est corrigé, je vérifie
**Aujourd'hui** : statut « À valider par vous », boutons « C'est réglé, je valide » (confirmation « Je valide », passe en résolu) et « Pas tout à fait ».
**Ce qui coince** : C2, « Pas tout à fait » ne fait rien d'autre que placer le curseur.
**Verdict** : Cassé à moitié. « Pas tout à fait » doit rouvrir la demande « En cours » avec mon message.
Fait le 27/09/2026 : vérifié, « Pas tout à fait » et « Rouvrir » partagent la même fenêtre de motif (`demanderMotif` dans `vues/demande.js`).

### 23. La correction ne tient pas, je rouvre
**Aujourd'hui** : « Rouvrir » pendant 7 jours après la résolution, confirmation, repasse « En cours ». Après 7 jours : « Cette demande est terminée », il faut en ouvrir une nouvelle.
**Ce qui coince** : pas de motif à la réouverture. C6 : la nouvelle demande ne garde aucun lien avec l'ancienne.
**Verdict** : Simple. Ajouter le motif et le lien.
Fait le 27/09/2026 : rouvrir demande un motif (envoyé comme message, puis statut) ; une demande terminée depuis plus de sept jours ou close propose « Ouvrir une nouvelle demande » vers `nouvelle-demande?suite={tid}` : titre prérempli « Suite de REF-… », champ `suite` à la création (règle), le serveur écrit `suivant` sur l'ancienne, les deux fiches se renvoient l'une à l'autre ; la lettre `resolu` dit « ouvrez une nouvelle demande depuis sa fiche : elle gardera le lien ».

### 24. Je veux demander une nouvelle fonctionnalité
**Aujourd'hui** : même formulaire, type « Nouvelle fonctionnalité » (plateforme, contexte, « Résultat attendu »), ou type « Demande de devis » (bouton « Demander un devis »). L'équipe qualifie ensuite : À chiffrer, Hors périmètre, Incluse, Offerte. Je lis « Cette demande sera chiffrée. Un devis vous sera proposé ».
**Ce qui coince** : C4, le lien vers le devis n'apparaît jamais. Un collaborateur qui a fait la demande ne verra jamais le devis (finance réservée au responsable). « Résultat attendu » avec l'exemple « Ce qui devrait se passer » est un libellé de bug. Un second chemin existe, « Proposer une évolution » dans Maintenance, sans lien ni aide pour choisir.
**Verdict** : Manque. Relier la demande au devis, un seul chemin (ou une aide pour choisir), un libellé propre.
Fait le 27/09/2026 : sur la carte « Nouvelle fonctionnalité », si le projet a un forfait de maintenance en cours (`maintenance/contrat`, statut `actif`), une aide dit « Vous avez un forfait de maintenance : une évolution peut aussi se proposer depuis Maintenance », avec le lien. Le libellé « Ce que vous attendez » : voir 20.

### 25. Je veux une modification ou une amélioration
**Aujourd'hui** : types « Modification » et « Amélioration », même formulaire.
**Verdict** : Simple.

### 26. J'ai une question
**Aujourd'hui** : type « Question », ou un message. Le chapo de Messages dit : « Pour une anomalie ou une demande précise, préférez une demande ».
**Verdict** : Simple. Deux canaux, bien expliqués.

### 27. Je veux un devis pour quelque chose
**Aujourd'hui** : type « Demande de devis ». Ensuite, voir 24 et 31.
**Verdict** : voir 24.

### 28. Je veux demander un nouveau projet
**Aujourd'hui** : « Demander un projet » dans le rail, formulaire (phrase, type, plateformes, idée, objectifs, fonctionnalités, budget, délai, exemples, liens, fichiers), e-mail « Bien reçu ». Fiche `#/nouveaux-projets/:id` avec statut, discussion, parcours en 7 étapes.
**Ce qui coince** : une fois la page quittée, je ne retrouve plus ma demande nulle part dans le Hub (la liste est chargée, aucun écran ne l'affiche). Seuls l'e-mail et la notification y ramènent. « Un devis vous a été envoyé » sans lien vers le devis. Je ne peux ni modifier ni retirer ma demande.
**Verdict** : Manque. Une entrée « Mes demandes de projet » dans le rail tant qu'il y en a une ouverte.
Fait le 27/09/2026 : `#/nouveaux-projets` (vues/demandes-projet.js) liste mes demandes de projet, entrée « Mes demandes de projet » sous « Demander un projet » dès qu'il y en a une ; « Un devis vous a été envoyé » porte le lien vers `#/finances/{id}` quand l'équipe a rattaché le devis (champ `devis`, choisi sur la fiche au statut « Devis envoyé », règle bornée) ; le fil d'Ariane et le titre du formulaire disent « Demander un projet » ; au statut « Sans suite », la frise le montre. Modifier ou retirer sa demande reste à faire.

### 29. Je discute d'un message et j'en fais une demande
**Aujourd'hui** : « En faire une demande » sur chaque message de la bulle, titre et description préremplis.
**Ce qui coince** : le bouton apparaît aussi sur mes propres messages.
**Verdict** : Simple.
Fait le 27/09/2026 : « En faire une demande » n'apparaît plus que sur les messages d'en face (ceux de Capmedia pour le client), dans la bulle comme sur la page Messages, jamais sur les miens (`vientDEnFace` dans bulle.js).

---

## E. Devis et factures

### 30. Je veux retrouver mes devis et factures
**Aujourd'hui** : « Devis et factures » dans le rail (responsable seulement, pastille rouge = devis à décider + factures dues), carte Finances de l'accueil, recherche, « En attente de vous ». Page : quatre métriques (Reste à payer TTC, Devis à décider, Réglé au total, Factures émises), bloc « Devis en attente de votre décision », sections Factures, Devis, Paiements. Une ligne : numéro, libellé, projet · date · échéance, Télécharger, montant, statut. Statuts en langage client (« À votre décision », « Consulté », « Accepté », « À payer », « En retard »…).
**Ce qui coince** : un devis à décider apparaît deux fois (bloc d'attente et liste). Dès que j'ouvre un devis il passe « Consulté » et la pastille « À votre décision » disparaît alors que je n'ai pas décidé. Aucun filtre par projet ou statut. La section Paiements liste aussi les paiements annulés sans marque. « Factures émises » compte les annulées et les avoirs. Un lien profond vers une pièce fermée n'ouvre rien, sans message.
**Verdict** : À alléger. Garder « À votre décision » jusqu'à la décision, une seule liste, un filtre par projet.
Fait le 27/09/2026 : le client lit « À votre décision » pour `envoye` et `consulte` (l'équipe lit « Consulté ») ; un devis à décider n'est plus que dans le bloc d'attente ; un filtre par projet en haut de page quand le client a plusieurs projets, qui filtre factures, devis et paiements ; les paiements annulés ne s'affichent plus ; « Factures émises » ne compte ni les annulées ni les avoirs ; un lien profond vers une pièce fermée ou inconnue affiche « Cette pièce n'est pas disponible. » et revient à la liste ; les états vides disent quoi attendre.

### 31. Je veux accepter un devis
**Aujourd'hui** : clic sur la ligne, fiche en modale (statut, « Valable jusqu'au », encart d'explication initial ou complémentaire, « Un mot pour nous », HT, TVA, TTC, détail, frise si étapes), « Accepter le devis », confirmation « X € TTC. Votre acceptation vaut accord et est horodatée à votre nom », « J'accepte », toast « Devis accepté. Merci, on lance. ». 3 clics. L'équipe reçoit un e-mail et une activité ; un devis initial fait passer le projet en « devis signé ».
**Ce qui coince** : l'équipe ne reçoit aucune notification dans le Cockpit (e-mail seul). L'e-mail à l'équipe donne le montant HT. Deux lignes d'activité pour une acceptation. Pendant la décision, pas de « Poser une question » ni « Fermer » dans le pied. C12, un devis expiré reste acceptable. Impossible de revenir sur ma réponse.
**Verdict** : Simple pour le client. À alléger côté équipe et expiration.
Fait le 27/09/2026 : l'équipe reçoit « Devis accepté » ou « Devis refusé » dans le Cockpit (numéro · projet, lien vers la pièce) en plus de la lettre, qui donne le HT et le TTC ; une seule ligne d'activité (« a signé le devis X : le projet démarre » pour un devis initial, « a accepté le devis X » sinon) ; pendant la décision, le pied a « Refuser », « J'ai une question », « Fermer » et « Accepter » ; « Merci, on lance. » seulement pour un devis initial. Revenir sur sa réponse reste impossible (voulu : l'acceptation vaut accord).

### 32. Je veux refuser un devis, ou négocier
**Aujourd'hui** : « Refuser », confirmation « Dites-nous ce qui coince dans le commentaire, on peut ajuster », « Refuser », toast « Devis refusé. Nous revenons vers vous ».
**Ce qui coince** : la confirmation me renvoie au commentaire alors que j'ai déjà cliqué : si je confirme, le refus part sans motif. Et le motif, quand il existe, n'arrive pas à l'équipe par e-mail. Aucun parcours de négociation : pas de « Discutons-en » qui ouvrirait un échange sur le devis.
**Verdict** : Manque. Un motif demandé au moment du refus, transmis à l'équipe ; un troisième choix « J'ai une question » qui ouvre une demande liée au devis.
Fait le 27/09/2026 : « Refuser » ouvre une fenêtre qui demande le motif (obligatoire, 2 000 caractères), écrit dans `reponse.commentaire` et repris dans la lettre `devis-reponse` (ligne « Motif ») ; « J'ai une question » mène à `#/projets/{p}/nouvelle-demande?type=question&devis={id}&titre=Question sur le devis {numero}`, la fiche de demande préremplit le titre et le contexte.

### 33. Je veux lire ce que contient un devis
**Aujourd'hui** : HT, TVA, TTC, dates, « Détail » (la description), la frise des étapes avec un montant par étape.
**Ce qui coince** : un devis sans étapes n'a aucune ligne à l'écran, seulement le PDF. Une facture ne renvoie pas au devis dont elle découle.
**Verdict** : À alléger. Le PDF reste la référence ; relier facture et devis.
Fait le 27/09/2026 : au dépôt d'une facture, l'équipe choisit le devis dont elle découle (champ `devis`) ; la fiche client dit « Découle du devis D-… » avec le lien ; un devis sans étapes montre toujours son « Détail » (un tiret s'il est vide) et rappelle que le PDF fait foi.

### 34. Je veux télécharger le PDF
**Aujourd'hui** : « Télécharger » dans la liste et dans la fiche, remis par le serveur, se pose sous son nom. 1 clic.
**Verdict** : Simple.

### 35. Je veux savoir ce que je dois payer, quand, et comment
**Aujourd'hui** : « Reste à payer » TTC, échéance, puce rouge si passée, « En attente de vous » avec « en retard de N jours ». Fiche : Payé, Reste à payer, paiements enregistrés, encart « Pour régler : virement aux coordonnées indiquées sur la facture. Le paiement en ligne arrivera prochainement ».
**Ce qui coince** : pas de paiement en ligne, pas de « J'ai fait le virement », pas de coordonnées bancaires dans l'espace (illisibles si la facture n'a pas de PDF). « En retard » est posé à la main par l'équipe, aucune tâche automatique. L'e-mail de facture annonce le HT alors que je dois le TTC. L'e-mail dit « répondez à cet e-mail », l'écran dit « ouvrez une demande ». Aucune notification dans le Hub à l'émission d'une facture. C11.
**Verdict** : Manque. « J'ai payé » avec date et référence, coordonnées bancaires dans la fiche, retard automatique, TTC partout, une notification à l'émission.
Fait le 27/09/2026 : « J'ai réglé cette facture » (date, moyen, référence, montant prérempli au reste à payer) écrit `reglementDeclare` sous une règle bornée ; l'équipe est prévenue (notification « Règlement déclaré », lettre `reglement-declare`, activité) et la fiche dit « Vous avez déclaré un règlement le … · en attente de confirmation », puis « Confirmé » quand le paiement est enregistré. Les coordonnées de règlement (`reglages/finance`, saisies dans Paramètres) s'affichent sur une facture due avec « Copier l'IBAN » ; sans réglage, plus de promesse de paiement en ligne. Une facture due échue se lit « En retard » tout de suite (`statutPiece`), et la fonction du matin pose le statut, prévient une fois (notification « Facture en retard », lettre `facture-retard`) et fait expirer les devis. Les lettres de devis et de facture annoncent le TTC (HT entre parenthèses) et renvoient à une demande depuis l'espace. Notification « Nouvelle facture » à l'émission.

### 36. Je veux suivre ce que j'ai acheté, ligne par ligne
**Aujourd'hui** : « Le devis, ligne par ligne » dans la feuille de route et dans la fiche du devis : « N / M étapes faites · X sur Y HT », une coche par étape livrée, notification « Étape terminée ».
**Ce qui coince** : voir 17.
**Verdict** : Simple.
Fait le 27/09/2026 : la frise ne s'affiche que pour un devis accepté ; plus de pourcentage sur la frise, seulement « N / M étapes faites » et la jauge ; la notification « Étape terminée » dit le devis et, aux responsables, le montant HT.
Fait le 27/09/2026 : `devisFrisable(d)` dans noyau.js dit quel devis a une frise (un devis accepté, et lui seul) ; la feuille de route (frise.js) peut s'y appuyer.

### 37. Je suis collaborateur et j'ai besoin d'un devis
**Aujourd'hui** : page « Réservé au responsable du projet ».
**Verdict** : voir 7.
Fait le 27/09/2026 : rien de plus ici, la page « Réservé au responsable » reste (voir 7) ; le collaborateur peut toujours ouvrir une demande de devis depuis son projet.

---

## F. Échanger avec l'équipe

### 38. Je veux écrire à l'équipe
**Aujourd'hui** : page Messages (une conversation par projet, pièces jointes, pages de 50) ou bulle sur la fiche projet (envoi sur Entrée, trombone, glisser-déposer, « Capmedia écrit », accusé « Lu »). L'équipe reçoit notification et e-mail.
**Ce qui coince** : C15. La page et la bulle ont des conventions inverses (Entrée = nouvelle ligne sur la page, Entrée = envoyer dans la bulle). La page n'a ni frappe, ni accusé, ni « En faire une demande ». La bulle est absente des pages demande et brique. Un envoi sans texte écrit « (pièces jointes) » comme message. L'accusé « Lu » n'a pas de date.
**Verdict** : Cassé sur le « lu », À alléger sur le reste. Un seul compteur de non lus, mêmes conventions partout, la bulle sur toutes les pages du projet.
Fait le 27/09/2026 : même clavier partout (Entrée envoie, Maj+Entrée va à la ligne, l'aide le dit) ; la page Messages a « Capmedia écrit », l'accusé « Lu le JJ/MM à HH:MM » (date et heure, dans la bulle aussi), « En faire une demande » sur les messages de Capmedia, le fil séparé par jour ; un envoi de pièces sans texte garde `texte: ''` (règle `messages` assouplie quand `pieces` n'est pas vide) et l'écran montre les pièces seules ; la bulle suit l'adresse (`bulle-projet.js` : fiche, demande, nouvelle demande, brique, tâche), un état ouvert/fermé par projet, `bulle:ouvrir` la remplit, `?brouillon=` remplit la page Messages ; le titre de l'onglet n'est réécrit que par la coquille (événement `titre:non-lus`).

### 39. Je veux joindre un fichier à un message
**Aujourd'hui** : trombone ou glisser-déposer.
**Verdict** : Simple.

### 40. Je veux un rendez-vous
**Aujourd'hui** : « Demander un créneau » (accueil, onglet Réunions) ouvre la messagerie.
**Ce qui coince** : aucune proposition de créneau, aucun formulaire.
**Verdict** : Manque, si c'est fréquent. Sinon À alléger : préremplir le message « Je souhaite un créneau… ».
Fait le 27/09/2026 : dans la fiche projet (onglet Réunions et carte « Prochaine réunion » de l'aperçu), « Demander un créneau » ouvre la bulle avec « Je souhaite un créneau pour » ; sur l'accueil, le lien `#/messages/{pid}?brouillon=…` (agent D).
Fait le 01/10/2026 : sur l'accueil, « Demander un créneau » ouvre le formulaire de demande de rendez-vous du calendrier (date, créneau, sujet), projet prérempli quand il n'y en a qu'un ; la demande créée porte `rendezVous`. Contrôle dans qa-calendrier.cjs.

### 41. J'ai une réunion : la rejoindre, l'ajouter à mon agenda, lire le compte rendu
**Aujourd'hui** : carte « Prochaine réunion » sur l'accueil avec « Rejoindre », onglet Réunions (À venir, Passées), fiche avec « Rejoindre la réunion », « Ajouter à mon agenda » (fichier ICS), Participants, Ordre du jour, Compte rendu, Décisions, Actions. Notification et e-mail à la création, au déplacement, et notification pour le compte rendu.
**Ce qui coince** : aucun rappel avant l'heure. L'ICS n'existe que depuis la fiche, ni dans le calendrier ni sur l'accueil ; sans lieu ni participants ; proposé pour une réunion passée. « À venir » raisonne au jour : une réunion de ce matin reste « à venir » l'après-midi, l'accueil compte autrement. « Pas encore de contenu » s'affiche même quand il y a des décisions. Les actions d'une réunion sont des cases grisées, je ne peux pas cocher les miennes.
**Verdict** : À alléger. Un rappel la veille, l'ICS partout, cocher mes actions.
Fait le 27/09/2026 : fichier .ics depuis la fiche, chaque réunion du calendrier (colonne « À venir » et fenêtre du jour) et la carte de l'accueil (`telechargerICS` dans calendrier.js) ; contenu complet (LOCATION si lieu, participants et ordre du jour en DESCRIPTION, virgules, points-virgules et retours échappés), plus proposé pour une réunion passée ; « Tout mettre dans mon agenda » sur le calendrier (toutes les réunions à venir en un fichier) ; « À venir » raisonne à l'heure partout (`reunionAVenir`, le même calcul que `prochaineReunion`) ; « Pas encore de contenu » seulement si ordre du jour, compte rendu, décisions et actions sont vides ; le compte rendu est « publié le … » (`compteRenduLe` posé par l'éditeur quand le texte change) ; l'éditeur a un champ « Lieu » ; le client coche n'importe quelle action de la réunion (`ecrire.cocherAction`, règle `reunions` : le client ne change que `actions`, même taille, sur une réunion visible ; les règles ne sachant pas parcourir une liste, l'attribution d'une action à une personne n'a pas été retenue) ; rappel la veille à 17 h (`hubRappelsReunions`, notification « Demain : … à HH:MM » et lettre `reunion-rappel`, préférence `reunions`, une seule fois grâce à `rappelEnvoye`).

### 42. Je regarde le calendrier
**Aujourd'hui** : mois, « Aujourd'hui », 3 événements par jour puis « +N », colonne « À venir » (12). Réunions, fins d'étapes, échéances de tâches, factures, expirations de devis, versions, validations.
**Ce qui coince** : un événement réunion mène à la liste, pas à la fiche (2 clics). « +N » n'est pas cliquable. Pas de flux ICS global à abonner.
**Verdict** : À alléger.
Fait le 27/09/2026 : un événement réunion ouvre directement sa fiche (`#/projets/:id/reunions/:rid`, projet.js ouvre la fiche à l'arrivée comme pour une tâche) ; « +N » ouvre une petite fenêtre qui liste tous les événements du jour ; libellés de plateforme sur les versions.

---

## G. Mes fichiers

### 43. Je veux retrouver une maquette ou un livrable
**Aujourd'hui** : onglet Fichiers du projet (cartes, filtre par catégorie s'il y en a plus d'une), page Documents tous projets (recherche, projet, catégorie). « Télécharger » ouvre un lien signé.
**Ce qui coince** : « Télécharger » ouvre un nouvel onglet au lieu de télécharger. Pas d'aperçu. Le numéro de version existe mais ne s'affiche pas. C9 sur la page d'une brique.
**Verdict** : À alléger.
Fait le 27/09/2026 : « Télécharger » télécharge sous le nom du fichier (lien signé lu en mémoire, `<a download>`, repli sur un onglet si le navigateur refuse la lecture) ; les images et PDF gardent un bouton « Ouvrir » (nouvel onglet) ; le numéro de version s'affiche sur la carte quand il existe.

### 44. Je veux envoyer des fichiers à l'équipe (logos, captures, cahier des charges)
**Aujourd'hui** : « Envoyer un fichier », fenêtre (catégorie parmi 5, un mot, dépôt, 20 fichiers, 10 Mo), « Envoyer ». Depuis Documents à plusieurs projets : une fenêtre « Pour quel projet ? » avant.
**Ce qui coince** : libellés différents selon l'endroit (« Assets (images, textes) » contre « Assets »), messages de fin différents. Rien ne dit ensuite qui l'a reçu ni si c'est vu. Je ne peux ni renommer ni retirer mon propre fichier.
**Verdict** : Simple. À alléger sur les libellés ; retirer son propre fichier serait attendu.
Fait le 27/09/2026 : une seule source de libellés (`CATEGORIES_FICHIER`, « Éléments (images, textes) » partout, plus d'« Assets ») ; « Fichier envoyé. » / « N fichiers envoyés. » partout ; la carte dit « Déposé par vous » ; le client retire un fichier qu'il a déposé (menu sur la carte, confirmation, règle Firestore `delete` par l'auteur en visibilité client, règle Storage `auteurDuFichier` dans les deux fichiers) ; un tri « Plus récents / Plus anciens / Nom » sur la page Documents. « Vu par Capmedia » n'existe pas et n'a pas été inventé.

### 45. Je cherche les accès (identifiants, comptes, adresses)
**Aujourd'hui** : les adresses sont dans l'onglet Liens. Les identifiants vivent dans la fiche technique, réservée à l'équipe.
**Ce qui coince** : aucun endroit pour les accès que le client doit connaître (comptes stores, comptes de test).
**Verdict** : Manque, si l'équipe partage des accès au client. Sinon, rien.
Fait le 27/09/2026 : catégorie de lien « Accès » (`acces` dans `CATEGORIES_LIEN`) ; l'éditeur de lien montre un champ « Identifiants » quand la catégorie est Accès et le lien visible du client (vidé sinon) ; l'onglet Liens a un groupe « Accès » avec l'identifiant et un bouton « Copier » ; la règle `liens` borne `identifiants` à 300 caractères, écrit par l'équipe seule, jamais de mot de passe.

---

## H. Les tests avant la sortie

### 46. Je veux voir comment mon application est testée
**Aujourd'hui** : entrée « Tests » (seulement s'il y a des scénarios), page avec chiffres, tableau des tests (humains, automatisés, « Déployer le tableau »), « Ce qui ne va pas », campagnes, anomalies, testeurs anonymisés, questionnaire, parcours automatisés, règles, bibliothèque de scénarios, une explication derrière chaque « i ».
**Ce qui coince** : C14, textes internes visibles. Vocabulaire interne dans l'onglet Tests de la fiche projet (« Ouvrir la console », « passés deux fois »). L'onglet Tests est toujours présent dans la fiche projet, même vide, alors que le rail le cache.
**Verdict** : À alléger. Retirer les textes internes, cacher l'onglet vide.
Fait le 27/09/2026 : l'onglet Tests de la fiche projet n'apparaît au client que s'il y a des scénarios ou des campagnes ; son vocabulaire est client (« Voir les tests » vers `#/tests?projet=`, « testés sur iPhone et Android », « problèmes à corriger », « testeurs en cours d'affectation ») ; l'équipe garde « Ouvrir la console » et « passés deux fois ».
Fait le 27/09/2026 : sur la page Tests, les explications ne parlent plus de « robot » (« un programme rejoue », « sans personne qui clique ») et la phrase figée « Aujourd'hui elle est presque entièrement grise » a disparu ; « vivier », « verser », « console », « serveur » restaient déjà réservés à l'équipe. L'onglet Tests de la fiche projet reste à l'agent qui possède projet.js.

### 47. Je veux voir les anomalies trouvées par les testeurs et leur correction
**Aujourd'hui** : section Anomalies (si présentes), fiche avec gravité, statut, « Revenue », « Ce qu'on sait », scénario, témoins et preuves.
**Ce qui coince** : aucune notification quand une anomalie naît ou est corrigée. Aucune passerelle entre une anomalie de test et une demande : je ne peux ni commenter, ni « en faire une demande ».
**Verdict** : Manque léger.
Fait le 27/09/2026 : notifications « Une anomalie a été trouvée par les testeurs » (scénario, gravité) à la naissance d'une anomalie d'origine testeur et « Anomalie corrigée » au passage en corrigée, lettres `anomalie` ; la fiche d'une anomalie propose « En faire une demande » (demande de type bug, titre repris, champ `anomalie` sur le ticket) ; `?anomalie=` dans l'adresse de la page Tests ouvre la fiche.

### 48. Je veux lire l'avis des testeurs
**Aujourd'hui** : fiche d'une campagne, « Leur avis », note sur 5 par testeur, questionnaire avec moyennes et réponses libres.
**Ce qui coince** : le commentaire de la note et les remarques restent réservés à l'équipe. C'est un choix, à confirmer.
**Verdict** : Simple.

### 49. Je veux donner mon feu vert pour la sortie
**Aujourd'hui** : rien. Le client lit, ne signe rien.
**Ce qui coince** : aucun geste « Bon pour sortie » ; il faut passer par une validation créée par l'équipe.
**Verdict** : Manque, si le feu vert du client fait partie du processus. Une validation « Sortie de la version X » créée automatiquement à la clôture d'une campagne serait le geste naturel.
Fait le 27/09/2026 : à la clôture d'une campagne (statut → `close`), le serveur crée une validation `type: 'sortie'` « Bon pour sortie : {campagne} », réservée au responsable, avec le lien de la campagne, une seule par campagne ; notifications « Campagne de tests ouverte » / « Campagne close » et lettre `campagne` aux changements de statut.

---

## I. La maintenance

### 50. Je veux un forfait de maintenance
**Aujourd'hui** : page Maintenance, « Demander un forfait de maintenance », fenêtre (besoin, rythme), « Envoyer ma demande ». Puis la frise Demande reçue, Proposition envoyée, Devis accepté, Forfait en cours.
**Ce qui coince** : une demande envoyée ne se modifie pas.
**Verdict** : Simple.
Fait le 27/09/2026 : « Modifier ma demande » tant que le forfait est « demandé » (même fenêtre, préremplie ; la règle l'autorisait déjà).

### 51. Je suis sous contrat, je veux voir où en est mon forfait
**Aujourd'hui** : carte du forfait (formule, dates, prix HT, jours, évolutions livrées), modalités, séquences avec jauge, « Jour par jour », évolutions.
**Ce qui coince** : à plusieurs projets, la vue équipe s'affiche (voir 6). Le lien vers le devis ne mène nulle part pour un collaborateur.
**Verdict** : Simple pour un projet.
Fait le 27/09/2026 : à plusieurs projets, une carte par projet, jamais la vue équipe (voir 6) ; le lien vers le devis n'apparaît pas à un collaborateur.

### 52. Je veux proposer une évolution
**Aujourd'hui** : « Proposer une évolution », fenêtre (« En une ligne », « Pourquoi, et pour qui »), fiche avec la réponse de l'équipe.
**Ce qui coince** : ni pièce jointe, ni conversation, ni retrait. Changement de statut notifié dans le Hub sans e-mail. Voir 24 pour le doublon avec les demandes.
**Verdict** : À alléger.
Fait le 27/09/2026 : une évolution proposée se retire tant qu'elle est « proposée » (règle : delete par l'auteur), peut porter des pièces jointes (dépôt dans la fenêtre, Storage `projets/{p}/maintenance/{id}/{nom}`, règles dans storage.rules et storage.transition.rules), et un changement de statut envoie aussi la lettre `evolution-statut` (préférence « Vie du projet »).

### 53. Mon forfait est suspendu ou terminé, je veux le reprendre
**Aujourd'hui** : l'e-mail dit « il reprend quand vous le souhaitez », les règles le permettent, mais aucun bouton n'existe.
**Verdict** : Manque. Un bouton « Reprendre le forfait ».

---
Fait le 27/09/2026 : bouton « Reprendre le forfait » sur un forfait suspendu ou terminé, qui renvoie une demande (règle déjà là, vérifiée par une épreuve).

## J. Mon compte

### 54. Je veux mettre à jour mon profil
**Aujourd'hui** : Paramètres, Nom, Téléphone, Entreprise, Fuseau horaire, e-mail en lecture seule (« prévenez Capmedia »).
**Ce qui coince** : le fuseau et le téléphone ne servent nulle part.
**Verdict** : Simple, à épurer.
Fait le 27/09/2026 : le fuseau horaire est retiré ; le téléphone reste.

### 55. Je veux choisir les e-mails que je reçois
**Aujourd'hui** : 8 catégories, Immédiat, Résumé quotidien, Désactivé.
**Ce qui coince** : C3. La catégorie « projet » (étapes, blocages, maintenance, tests) n'est pas proposée, donc impossible à couper. « Tâche en attente » est rangée sous « Mouvements de mes demandes ».
**Verdict** : Cassé sur le résumé. Soit l'implémenter, soit retirer le choix.
Fait le 27/09/2026 : catégorie « Vie du projet » (étapes, points bloquants, tâches qui attendent votre retour, maintenance, tests) dans les paramètres et dans `EVENEMENTS` ; `tache` et `tache-attente` y sont rangés ; l'aide de « Devis et factures » dit « Un devis déposé, une facture émise ou à régler dans trois jours. ».

### 56. Je veux me connecter sans code la prochaine fois
**Aujourd'hui** : « Gérer mes clés », « Ajouter cet appareil », « Retirer ». Le code reste le secours.
**Verdict** : Simple.

### 57. Je veux ajouter un collègue
**Aujourd'hui** : rien. Il faut écrire à Capmedia.
**Verdict** : Manque, ou choix assumé : le responsable pourrait inviter un collaborateur (la fonction serveur existe côté équipe).
Fait le 27/09/2026 : le responsable a « Inviter un collègue » dans la section « Les personnes » (nom, e-mail) ; l'action serveur `inviterCollegue` (suiviAdmin, réservée à un client membre et responsable du projet) ajoute un collaborateur et prévient l'équipe (« Le responsable a invité un collègue »).

### 58. Je veux savoir qui est qui sur mon projet
**Aujourd'hui** : le nom du responsable Capmedia dans l'en-tête, les noms sur les étapes, tâches, réunions, fichiers. Aucune page « qui est qui », ni côté client ni côté Capmedia, ni mon propre rôle.
**Verdict** : Manque. Une section « Les personnes » dans l'aperçu : l'équipe Capmedia sur le projet, les personnes de mon côté avec leur rôle.
Fait le 27/09/2026 : section « Les personnes » dans l'aperçu : « Chez Capmedia » (le responsable du projet, nom lu dans l'annuaire) et « De votre côté » (chaque personne avec son rôle, « vous » sur la sienne), plus la phrase qui explique le rôle. Le serveur tient le miroir `personnesClient = [{ uid, nom, role }]` sur la fiche du projet (déclencheur `hubInterlocuteurEcrit`) ; le champ `personnes` d'avant (liste d'identifiants, registre des rôles) reste tel quel.

### 59. Je veux me déconnecter, ou fermer les autres sessions
**Aujourd'hui** : « Se déconnecter » (menu du compte, Paramètres), sans confirmation. Pas de vue des sessions ouvertes.
**Verdict** : Simple.

---

## Synthèse : ce que je ferais, dans l'ordre

**Lot 1, corriger ce qui ment (0.)** : C1 la réponse du client fait repartir la demande, C2 « Pas tout à fait » rouvre, C4 le lien demande ↔ devis, C9 et C10 les gestes morts, C12 l'expiration des devis, C15 un seul « non lu », C16 les validations réservées cachées au collaborateur, C3 et C11 retirer ou implémenter, C5 à C8 et C13 à C14 les textes.

**Lot 2, les manques qui touchent l'argent et la sortie** : « J'ai payé » et coordonnées bancaires (35), refus de devis avec motif et « J'ai une question » (32), une version réelle par plateforme avec build et lien de test (15), le feu vert de sortie (49).

**Lot 3, répondre sans sortir de la page** : la réponse sur une tâche (11), la fiche d'un blocage avec « C'est fait » (12), la pièce jointe aux remarques d'une validation (9), la bulle sur toutes les pages du projet et « Une question sur cette étape » dans la bulle (17, 38).

**Lot 4, plusieurs projets et le rôle** : le choix du projet sur chaque raccourci, « Mes demandes » tous projets, « Mes demandes de projet », la vue Maintenance client (6, 28), le rôle affiché et ce qui est fermé caché (7, 58).

**Lot 5, dater et unifier** : les quatre textes libres de l'aperçu datés et signés, un seul pourcentage expliqué, « aucune date fixée » dit plutôt que caché (14), un seul nom pour « En attente de vous » (8), le nom du projet dans les notifications (5), les libellés à la première personne (« À vous » plutôt que « En attente client »).

**Lot 6, le confort** : l'ICS et le rappel de réunion (41), le calendrier en un clic (42), la recherche élargie (4), « Depuis votre dernière visite » fiable (3), l'aide des pièces jointes exacte (20), les accents des e-mails.

Ce qui est bon et à ne pas toucher : « En attente de vous » (8), signaler un bug (20), suivre une demande (21), accepter un devis (31), télécharger (34), les clés d'accès (56), le forfait de maintenance (50, 51).
