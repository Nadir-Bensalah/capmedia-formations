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

### 2. J'ouvre le Hub un matin ordinaire
**Aujourd'hui** : accueil `#/`. « Bonjour prénom », un chapo qui compte projets actifs, points en attente, messages non lus. Boutons « Nouvelle demande » et « Message ». Bloc « En attente de vous » (6 lignes), cartes projets (statut, étape en cours, progression, verdict de délai), activité récente, à droite prochaine réunion, finances, dernières versions. Zéro clic pour l'essentiel.
**Ce qui coince** : « Nouvelle demande » et « Tout voir » de l'activité visent toujours le premier projet. La carte Finances s'affiche à un collaborateur qui n'y a pas accès (« Aucune facture en attente », alors qu'il ne les voit pas). Une version s'affiche avec sa clé brute (« ios 1.2.0 »).
**Verdict** : Simple pour un client à un projet. À alléger pour plusieurs projets : choisir le projet au moment de la demande, cacher la carte Finances au collaborateur.

### 3. Je veux savoir ce qui a bougé depuis ma dernière visite
**Aujourd'hui** : encart « Depuis votre dernière visite » sur l'accueil, avec des compteurs (tâches, versions, messages, validations, fichiers).
**Ce qui coince** : la date est réécrite à chaque chargement : un simple rechargement vide l'encart. Les compteurs ne sont pas cliquables. Mes propres actions comptent dedans. Rien de tel sur la fiche d'un projet.
**Verdict** : À alléger. Ne poser la date qu'à la fin de la session, rendre les compteurs cliquables, exclure mes propres actions.

### 4. Je cherche quelque chose (une demande, un fichier, un devis)
**Aujourd'hui** : palette ⌘K, groupes Projets, Demandes, Tâches, Fichiers, Devis et factures, Réunions, Versions. Trois actions sans terme : Nouvelle demande, Envoyer un message, Voir ce qui vous attend.
**Ce qui coince** : ignore les validations, les messages, les décisions, les liens, les pages (Calendrier, Paramètres, Maintenance). Un fichier, une réunion ou une version mène à l'onglet, pas à l'élément. Inclut les projets archivés.
**Verdict** : À alléger.

### 5. Je regarde mes notifications
**Aujourd'hui** : cloche (un point, sans chiffre), feuille « Notifications », 60 au plus, « Tout marquer comme lu », un clic vers l'objet. Notification système et badge dans les apps de bureau.
**Ce qui coince** : le nom du projet n'y figure pas (ambigu à plusieurs projets). Une notification reste non lue quand j'ai traité l'objet ailleurs (validation approuvée, message lu). Même puce pour tout.
**Verdict** : À alléger. Nom du projet dans chaque notification, lecture automatique quand l'objet est traité.

### 6. J'ai plusieurs projets
**Aujourd'hui** : un rail par projet avec ses neuf sections dépliées quand j'y suis, une pastille rouge par projet.
**Ce qui coince** : les raccourcis (Nouvelle demande, Tout voir, recherche) visent le premier projet. Pas de vue « Mes demandes » tous projets. La page Maintenance à plusieurs projets affiche la vue pensée pour l'équipe (« Demandes à traiter », « N clients attendent une proposition »).
**Verdict** : Manque. Un choix de projet à chaque raccourci, une liste des demandes tous projets, une vue Maintenance client.

### 7. Je suis collaborateur, pas responsable
**Aujourd'hui** : même espace, sans « Devis et factures » ni la frise du devis, et certaines validations réservées au responsable.
**Ce qui coince** : rien ne me dit mon rôle ni pourquoi je ne vois pas la finance. La carte Finances et les listes de validations me montrent des choses fermées (C16). Le lien vers le devis depuis Maintenance ne mène nulle part pour moi.
**Verdict** : Manque. Afficher mon rôle, cacher ce qui m'est fermé, expliquer en une ligne.

---

## B. Savoir ce qu'on attend de moi

### 8. Je veux savoir si j'ai des choses à fournir
**Aujourd'hui** : six genres comptés dans « En attente de vous » : validation, demande en attente de ma réponse ou à valider, devis à décider, facture due, tâche « attente client », point bloquant de mon côté. Visibles : rail (pastille rouge), accueil, aperçu du projet (5 lignes), page `#/valider`, titre de l'onglet, relance du lundi. Trié par retard puis échéance. Un clic pour arriver sur l'objet.
**Ce qui coince** : trois noms pour la même page (« En attente de vous » dans le rail et le titre, « À valider » dans l'onglet et le fil d'Ariane). Les réunions n'en font pas partie et n'ont aucun rappel avant l'heure. Le texte libre « Attendu de vous » saisi par l'équipe peut contredire la liste calculée. À 6 points ou moins, le bloc de l'accueil n'a pas de lien vers la page complète.
**Verdict** : Simple sur le fond, c'est le meilleur parcours du Hub. À alléger sur les noms et les réunions.

### 9. Je dois valider une maquette ou une décision
**Aujourd'hui** : e-mail « Examiner et répondre » ou notification, 1 clic vers la fiche, « Approuver » ou « Demander des modifications » (commentaire obligatoire). Depuis le rail : 3 clics. L'équipe reçoit notification, e-mail et activité.
**Ce qui coince** : impossible de joindre un fichier avec mes remarques. Une seule réponse, sans échange ni correction après coup. Aucune confirmation ne me revient, et mes collègues ne sont pas prévenus. Quand l'équipe annule une validation, rien ne me le dit : ma notification pointe vers une validation annulée.
**Verdict** : Simple pour approuver. Manque pour les remarques : pièce jointe, accusé, information d'annulation.

### 10. On me demande une précision sur ma demande
**Aujourd'hui** : bandeau « La balle est dans votre camp », je réponds dans les échanges.
**Ce qui coince** : C1. Ma réponse ne fait rien repartir. Je reste « à faire » partout jusqu'à ce que l'équipe change le statut à la main.
**Verdict** : Cassé. La réponse du client doit repasser la demande « En cours » (le serveur le sait faire pour d'autres statuts).

### 11. Une tâche attend mon retour
**Aujourd'hui** : e-mail « Voir et répondre », fiche de la tâche avec un encart « Répondez-nous dans la conversation du projet » et un bouton « Écrire à Capmedia » qui quitte la page vers Messages.
**Ce qui coince** : aucun champ de réponse sur la tâche, rien ne relie ensuite le message à la tâche, et la tâche reste « En attente client » jusqu'à ce que l'équipe la change. Le libellé « En attente client » est écrit pour l'équipe, pas pour moi.
**Verdict** : Manque. Une réponse (texte, fichier) directement sur la tâche, qui la fait passer « Répondu ».

### 12. Un point bloque de mon côté
**Aujourd'hui** : notification « Un point bloque de votre côté » (sans e-mail), lien vers l'aperçu du projet où le blocage est dans « Points bloquants », sans ancre, sans bouton.
**Ce qui coince** : rien ne dit comment le débloquer, ni pour quand, ni à qui écrire. « Responsable : le client » est une formulation à la troisième personne. Aucune date attendue de résolution.
**Verdict** : Manque. Une fiche du blocage avec « Ce qu'on attend de vous », un bouton « C'est fait » ou « Répondre », un e-mail.

### 13. La relance du lundi
**Aujourd'hui** : e-mail à 9 h, « N points attendent votre réponse », bouton vers `#/valider`. Aussi « Facture à régler : numéro libellé ».
**Ce qui coince** : C13. Les factures y sont sans montant ni échéance. Aucune alerte d'échéance ou de retard de facture en dehors de ce lundi.
**Verdict** : À alléger.

---

## C. Suivre l'avancement de mon application

### 14. Je veux savoir où en est mon application aujourd'hui, en temps réel
**Aujourd'hui** : fiche projet `#/projets/:id`, onglet Aperçu. En-tête : statut, « Livraison visée » et son verdict, responsable Capmedia, « Dernière activité il y a… ». Quatre cases « En ce moment », « Dernière livraison », « Prochaine étape », « Attendu de vous », un anneau de progression avec sa source, « Tenue des délais », points bloquants, parties du projet, feuille de route (6 étapes), activité (8 lignes), à droite réunion, échéances, validations, demandes. Les données sont en direct (écoutes Firestore).
**Ce qui coince** : les quatre cases sont des textes libres saisis par l'équipe, sans date, qui priment sur les valeurs calculées : elles peuvent être périmées ou contredire le bloc « En attente de vous ». Trois ou quatre pourcentages calculés différemment (anneau, frise du devis, partie, étape), aucun daté, « Estimée par Capmedia » sans dire quand. « Tenue des délais » disparaît quand aucune date n'est fixée, sans le dire. Onze onglets dans la page, neuf dans le rail, pas dans le même ordre.
**Verdict** : À alléger, et c'est le cœur de la promesse « en temps réel ». Dater chaque texte libre (« mis à jour le … par … »), un seul pourcentage expliqué, dire « aucune date de livraison fixée » plutôt que cacher.

### 15. Je veux savoir quelle version est en test ou disponible, sur Android et sur iPhone
**Aujourd'hui** : cartes plateformes en tête de l'aperçu (si l'équipe a déclaré les plateformes), « Version X · En cours » ou « Pas encore suivie ». Onglet « Versions » : numéro, titre, « Publiée le », pastille (En développement, En test, Soumise, En validation, Disponible, Retirée), notes classées, boutons « Ouvrir dans le store » et « Version de test ».
**Ce qui coince** : la version d'une carte plateforme vient d'un champ saisi à la main, pas de la dernière version publiée : les deux peuvent diverger. Aucun numéro de build, aucun champ TestFlight ou Play dédié (ils n'existent que sur les campagnes de test). Une version ne s'ouvre pas (C10). Les cartes « Les parties du projet » ne sont pas cliquables.
**Verdict** : Manque. Une ligne par plateforme, alimentée par la dernière version réelle : « Android : 1.4.2 en test sur Play depuis le 22/09, 1.4.1 disponible ». Build et lien de test sur la version.

### 16. Je veux savoir si la date de livraison tient
**Aujourd'hui** : « Livraison visée », « Initialement le … · N reports », « Ce qui pèse sur cette date », « L'histoire de cette date » (report, motif, auteur), ou « Cette date n'a jamais bougé ».
**Ce qui coince** : section absente sans date, sans le dire. « Ce qui pèse » cite les demandes restées chez moi sans lien vers elles.
**Verdict** : Simple, à un détail près.

### 17. Je veux voir la feuille de route et ce que j'ai acheté
**Aujourd'hui** : onglet « Feuille de route », en tête « Le devis, ligne par ligne » (« Ce qui est coché est livré »), puis les étapes par phase avec dates, tâches, reports, pastille. Fiche d'une étape : description, dates, « Suivie par », tâches, livré pendant l'étape, historique de la date, bouton « Une question sur cette étape ».
**Ce qui coince** : la frise du devis s'affiche aussi pour un devis refusé, expiré ou encore à décider. Un collaborateur ne la voit pas du tout. « Une question sur cette étape » quitte la page vers Messages alors qu'une bulle est montée sur la page. La notification « Étape terminée » ne dit ni le devis ni le montant.
**Verdict** : À alléger. Ne frise que les devis acceptés, ouvrir la bulle plutôt que changer de page.

### 18. Je veux savoir ce qui a été livré et ce qui a changé
**Aujourd'hui** : onglet Versions avec ses notes (Nouveau, Amélioration, Correction, Technique), « Dernière livraison » sur l'aperçu, « Dernières versions » sur l'accueil.
**Ce qui coince** : voir 15. La clé brute de plateforme partout.
**Verdict** : À alléger.

### 19. Je veux lire l'activité complète
**Aujourd'hui** : onglet Activité du projet, 8 lignes sur l'aperçu puis « Tout voir ».
**Ce qui coince** : « Tout voir » depuis l'accueil mène au premier projet seulement.
**Verdict** : Simple.

---

## D. Signaler et demander

### 20. Je veux signaler un bug, l'expliquer, joindre une preuve (ou pas)
**Aujourd'hui** : « Nouvelle demande » (en-tête du projet, onglet Demandes, accueil, recherche, ou « En faire une demande » depuis un message de la bulle, qui préremplit). Formulaire : 9 types (Anomalie par défaut), titre, description, urgence, partie du projet, liens, pièces (10 fichiers, envoi immédiat avec progression). Pour un bug : plateforme, version, appareil, étapes pour reproduire, attendu, obtenu, tous facultatifs. Bouton « Signaler l'anomalie ». Confirmation « Demande envoyée. Nous vous répondons vite. », puis la fiche. Environ 6 champs, 1 écran, 2 clics.
**Ce qui coince** : l'aide dit « Images, PDF, vidéos courtes. 10 Mo » alors que les vidéos vont jusqu'à 100 Mo et que Word, Excel, zip passent ; le refus n'arrive qu'après le choix (pas d'attribut accept). Un lien mal formé est ignoré sans message. L'aide de l'urgence n'explique que deux niveaux sur quatre. L'e-mail de confirmation salue l'auteur mais part à tous les interlocuteurs du projet. Le type n'apparaît dans l'e-mail que pour trois types sur neuf.
**Verdict** : Simple, bon parcours. À alléger sur l'aide des pièces et l'e-mail.

### 21. Je veux suivre la correction de mon bug
**Aujourd'hui** : fiche `#/projets/:id/demandes/:tid`. Bandeau « où en est ma demande » : statut en langage client, qui a la main (« C'est à nous de jouer » ou « La balle est dans votre camp »), la suite, « Ouverte depuis », « Dernier mouvement », « Suivie par », « Livrée dans » (version). « Le signalement », « Échanges », « Tâches liées », « Tout ce qui lui est arrivé ». E-mail et notification à chaque changement de statut, à chaque réponse de l'équipe, à la qualification. Liste des demandes avec filtres Ouvertes, Pour vous, Terminées, Toutes et un point « non lu ».
**Ce qui coince** : « Vous recevrez un e-mail à chaque mouvement » mais l'urgence et l'assignation n'en envoient pas. Le « lu » est commun à tous les clients du projet. Une demande « Refusée » n'affiche aucun motif. Je ne peux ni modifier le titre, ni ajouter une pièce au signalement (la fonction existe, aucun écran ne l'appelle), ni fermer ma propre demande. Mes collègues ne sont pas prévenus de mes réponses.
**Verdict** : Simple sur le suivi, c'est bien fait. Manque : ajouter une pièce après coup, fermer ma demande, motif du refus.

### 22. On me dit que c'est corrigé, je vérifie
**Aujourd'hui** : statut « À valider par vous », boutons « C'est réglé, je valide » (confirmation « Je valide », passe en résolu) et « Pas tout à fait ».
**Ce qui coince** : C2, « Pas tout à fait » ne fait rien d'autre que placer le curseur.
**Verdict** : Cassé à moitié. « Pas tout à fait » doit rouvrir la demande « En cours » avec mon message.

### 23. La correction ne tient pas, je rouvre
**Aujourd'hui** : « Rouvrir » pendant 7 jours après la résolution, confirmation, repasse « En cours ». Après 7 jours : « Cette demande est terminée », il faut en ouvrir une nouvelle.
**Ce qui coince** : pas de motif à la réouverture. C6 : la nouvelle demande ne garde aucun lien avec l'ancienne.
**Verdict** : Simple. Ajouter le motif et le lien.

### 24. Je veux demander une nouvelle fonctionnalité
**Aujourd'hui** : même formulaire, type « Nouvelle fonctionnalité » (plateforme, contexte, « Résultat attendu »), ou type « Demande de devis » (bouton « Demander un devis »). L'équipe qualifie ensuite : À chiffrer, Hors périmètre, Incluse, Offerte. Je lis « Cette demande sera chiffrée. Un devis vous sera proposé ».
**Ce qui coince** : C4, le lien vers le devis n'apparaît jamais. Un collaborateur qui a fait la demande ne verra jamais le devis (finance réservée au responsable). « Résultat attendu » avec l'exemple « Ce qui devrait se passer » est un libellé de bug. Un second chemin existe, « Proposer une évolution » dans Maintenance, sans lien ni aide pour choisir.
**Verdict** : Manque. Relier la demande au devis, un seul chemin (ou une aide pour choisir), un libellé propre.

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

### 29. Je discute d'un message et j'en fais une demande
**Aujourd'hui** : « En faire une demande » sur chaque message de la bulle, titre et description préremplis.
**Ce qui coince** : le bouton apparaît aussi sur mes propres messages.
**Verdict** : Simple.

---

## E. Devis et factures

### 30. Je veux retrouver mes devis et factures
**Aujourd'hui** : « Devis et factures » dans le rail (responsable seulement, pastille rouge = devis à décider + factures dues), carte Finances de l'accueil, recherche, « En attente de vous ». Page : quatre métriques (Reste à payer TTC, Devis à décider, Réglé au total, Factures émises), bloc « Devis en attente de votre décision », sections Factures, Devis, Paiements. Une ligne : numéro, libellé, projet · date · échéance, Télécharger, montant, statut. Statuts en langage client (« À votre décision », « Consulté », « Accepté », « À payer », « En retard »…).
**Ce qui coince** : un devis à décider apparaît deux fois (bloc d'attente et liste). Dès que j'ouvre un devis il passe « Consulté » et la pastille « À votre décision » disparaît alors que je n'ai pas décidé. Aucun filtre par projet ou statut. La section Paiements liste aussi les paiements annulés sans marque. « Factures émises » compte les annulées et les avoirs. Un lien profond vers une pièce fermée n'ouvre rien, sans message.
**Verdict** : À alléger. Garder « À votre décision » jusqu'à la décision, une seule liste, un filtre par projet.

### 31. Je veux accepter un devis
**Aujourd'hui** : clic sur la ligne, fiche en modale (statut, « Valable jusqu'au », encart d'explication initial ou complémentaire, « Un mot pour nous », HT, TVA, TTC, détail, frise si étapes), « Accepter le devis », confirmation « X € TTC. Votre acceptation vaut accord et est horodatée à votre nom », « J'accepte », toast « Devis accepté. Merci, on lance. ». 3 clics. L'équipe reçoit un e-mail et une activité ; un devis initial fait passer le projet en « devis signé ».
**Ce qui coince** : l'équipe ne reçoit aucune notification dans le Cockpit (e-mail seul). L'e-mail à l'équipe donne le montant HT. Deux lignes d'activité pour une acceptation. Pendant la décision, pas de « Poser une question » ni « Fermer » dans le pied. C12, un devis expiré reste acceptable. Impossible de revenir sur ma réponse.
**Verdict** : Simple pour le client. À alléger côté équipe et expiration.

### 32. Je veux refuser un devis, ou négocier
**Aujourd'hui** : « Refuser », confirmation « Dites-nous ce qui coince dans le commentaire, on peut ajuster », « Refuser », toast « Devis refusé. Nous revenons vers vous ».
**Ce qui coince** : la confirmation me renvoie au commentaire alors que j'ai déjà cliqué : si je confirme, le refus part sans motif. Et le motif, quand il existe, n'arrive pas à l'équipe par e-mail. Aucun parcours de négociation : pas de « Discutons-en » qui ouvrirait un échange sur le devis.
**Verdict** : Manque. Un motif demandé au moment du refus, transmis à l'équipe ; un troisième choix « J'ai une question » qui ouvre une demande liée au devis.

### 33. Je veux lire ce que contient un devis
**Aujourd'hui** : HT, TVA, TTC, dates, « Détail » (la description), la frise des étapes avec un montant par étape.
**Ce qui coince** : un devis sans étapes n'a aucune ligne à l'écran, seulement le PDF. Une facture ne renvoie pas au devis dont elle découle.
**Verdict** : À alléger. Le PDF reste la référence ; relier facture et devis.

### 34. Je veux télécharger le PDF
**Aujourd'hui** : « Télécharger » dans la liste et dans la fiche, remis par le serveur, se pose sous son nom. 1 clic.
**Verdict** : Simple.

### 35. Je veux savoir ce que je dois payer, quand, et comment
**Aujourd'hui** : « Reste à payer » TTC, échéance, puce rouge si passée, « En attente de vous » avec « en retard de N jours ». Fiche : Payé, Reste à payer, paiements enregistrés, encart « Pour régler : virement aux coordonnées indiquées sur la facture. Le paiement en ligne arrivera prochainement ».
**Ce qui coince** : pas de paiement en ligne, pas de « J'ai fait le virement », pas de coordonnées bancaires dans l'espace (illisibles si la facture n'a pas de PDF). « En retard » est posé à la main par l'équipe, aucune tâche automatique. L'e-mail de facture annonce le HT alors que je dois le TTC. L'e-mail dit « répondez à cet e-mail », l'écran dit « ouvrez une demande ». Aucune notification dans le Hub à l'émission d'une facture. C11.
**Verdict** : Manque. « J'ai payé » avec date et référence, coordonnées bancaires dans la fiche, retard automatique, TTC partout, une notification à l'émission.

### 36. Je veux suivre ce que j'ai acheté, ligne par ligne
**Aujourd'hui** : « Le devis, ligne par ligne » dans la feuille de route et dans la fiche du devis : « N / M étapes faites · X sur Y HT », une coche par étape livrée, notification « Étape terminée ».
**Ce qui coince** : voir 17.
**Verdict** : Simple.

### 37. Je suis collaborateur et j'ai besoin d'un devis
**Aujourd'hui** : page « Réservé au responsable du projet ».
**Verdict** : voir 7.

---

## F. Échanger avec l'équipe

### 38. Je veux écrire à l'équipe
**Aujourd'hui** : page Messages (une conversation par projet, pièces jointes, pages de 50) ou bulle sur la fiche projet (envoi sur Entrée, trombone, glisser-déposer, « Capmedia écrit », accusé « Lu »). L'équipe reçoit notification et e-mail.
**Ce qui coince** : C15. La page et la bulle ont des conventions inverses (Entrée = nouvelle ligne sur la page, Entrée = envoyer dans la bulle). La page n'a ni frappe, ni accusé, ni « En faire une demande ». La bulle est absente des pages demande et brique. Un envoi sans texte écrit « (pièces jointes) » comme message. L'accusé « Lu » n'a pas de date.
**Verdict** : Cassé sur le « lu », À alléger sur le reste. Un seul compteur de non lus, mêmes conventions partout, la bulle sur toutes les pages du projet.

### 39. Je veux joindre un fichier à un message
**Aujourd'hui** : trombone ou glisser-déposer.
**Verdict** : Simple.

### 40. Je veux un rendez-vous
**Aujourd'hui** : « Demander un créneau » (accueil, onglet Réunions) ouvre la messagerie.
**Ce qui coince** : aucune proposition de créneau, aucun formulaire.
**Verdict** : Manque, si c'est fréquent. Sinon À alléger : préremplir le message « Je souhaite un créneau… ».

### 41. J'ai une réunion : la rejoindre, l'ajouter à mon agenda, lire le compte rendu
**Aujourd'hui** : carte « Prochaine réunion » sur l'accueil avec « Rejoindre », onglet Réunions (À venir, Passées), fiche avec « Rejoindre la réunion », « Ajouter à mon agenda » (fichier ICS), Participants, Ordre du jour, Compte rendu, Décisions, Actions. Notification et e-mail à la création, au déplacement, et notification pour le compte rendu.
**Ce qui coince** : aucun rappel avant l'heure. L'ICS n'existe que depuis la fiche, ni dans le calendrier ni sur l'accueil ; sans lieu ni participants ; proposé pour une réunion passée. « À venir » raisonne au jour : une réunion de ce matin reste « à venir » l'après-midi, l'accueil compte autrement. « Pas encore de contenu » s'affiche même quand il y a des décisions. Les actions d'une réunion sont des cases grisées, je ne peux pas cocher les miennes.
**Verdict** : À alléger. Un rappel la veille, l'ICS partout, cocher mes actions.

### 42. Je regarde le calendrier
**Aujourd'hui** : mois, « Aujourd'hui », 3 événements par jour puis « +N », colonne « À venir » (12). Réunions, fins d'étapes, échéances de tâches, factures, expirations de devis, versions, validations.
**Ce qui coince** : un événement réunion mène à la liste, pas à la fiche (2 clics). « +N » n'est pas cliquable. Pas de flux ICS global à abonner.
**Verdict** : À alléger.

---

## G. Mes fichiers

### 43. Je veux retrouver une maquette ou un livrable
**Aujourd'hui** : onglet Fichiers du projet (cartes, filtre par catégorie s'il y en a plus d'une), page Documents tous projets (recherche, projet, catégorie). « Télécharger » ouvre un lien signé.
**Ce qui coince** : « Télécharger » ouvre un nouvel onglet au lieu de télécharger. Pas d'aperçu. Le numéro de version existe mais ne s'affiche pas. C9 sur la page d'une brique.
**Verdict** : À alléger.

### 44. Je veux envoyer des fichiers à l'équipe (logos, captures, cahier des charges)
**Aujourd'hui** : « Envoyer un fichier », fenêtre (catégorie parmi 5, un mot, dépôt, 20 fichiers, 10 Mo), « Envoyer ». Depuis Documents à plusieurs projets : une fenêtre « Pour quel projet ? » avant.
**Ce qui coince** : libellés différents selon l'endroit (« Assets (images, textes) » contre « Assets »), messages de fin différents. Rien ne dit ensuite qui l'a reçu ni si c'est vu. Je ne peux ni renommer ni retirer mon propre fichier.
**Verdict** : Simple. À alléger sur les libellés ; retirer son propre fichier serait attendu.

### 45. Je cherche les accès (identifiants, comptes, adresses)
**Aujourd'hui** : les adresses sont dans l'onglet Liens. Les identifiants vivent dans la fiche technique, réservée à l'équipe.
**Ce qui coince** : aucun endroit pour les accès que le client doit connaître (comptes stores, comptes de test).
**Verdict** : Manque, si l'équipe partage des accès au client. Sinon, rien.

---

## H. Les tests avant la sortie

### 46. Je veux voir comment mon application est testée
**Aujourd'hui** : entrée « Tests » (seulement s'il y a des scénarios), page avec chiffres, tableau des tests (humains, automatisés, « Déployer le tableau »), « Ce qui ne va pas », campagnes, anomalies, testeurs anonymisés, questionnaire, parcours automatisés, règles, bibliothèque de scénarios, une explication derrière chaque « i ».
**Ce qui coince** : C14, textes internes visibles. Vocabulaire interne dans l'onglet Tests de la fiche projet (« Ouvrir la console », « passés deux fois »). L'onglet Tests est toujours présent dans la fiche projet, même vide, alors que le rail le cache.
**Verdict** : À alléger. Retirer les textes internes, cacher l'onglet vide.

### 47. Je veux voir les anomalies trouvées par les testeurs et leur correction
**Aujourd'hui** : section Anomalies (si présentes), fiche avec gravité, statut, « Revenue », « Ce qu'on sait », scénario, témoins et preuves.
**Ce qui coince** : aucune notification quand une anomalie naît ou est corrigée. Aucune passerelle entre une anomalie de test et une demande : je ne peux ni commenter, ni « en faire une demande ».
**Verdict** : Manque léger.

### 48. Je veux lire l'avis des testeurs
**Aujourd'hui** : fiche d'une campagne, « Leur avis », note sur 5 par testeur, questionnaire avec moyennes et réponses libres.
**Ce qui coince** : le commentaire de la note et les remarques restent réservés à l'équipe. C'est un choix, à confirmer.
**Verdict** : Simple.

### 49. Je veux donner mon feu vert pour la sortie
**Aujourd'hui** : rien. Le client lit, ne signe rien.
**Ce qui coince** : aucun geste « Bon pour sortie » ; il faut passer par une validation créée par l'équipe.
**Verdict** : Manque, si le feu vert du client fait partie du processus. Une validation « Sortie de la version X » créée automatiquement à la clôture d'une campagne serait le geste naturel.

---

## I. La maintenance

### 50. Je veux un forfait de maintenance
**Aujourd'hui** : page Maintenance, « Demander un forfait de maintenance », fenêtre (besoin, rythme), « Envoyer ma demande ». Puis la frise Demande reçue, Proposition envoyée, Devis accepté, Forfait en cours.
**Ce qui coince** : une demande envoyée ne se modifie pas.
**Verdict** : Simple.

### 51. Je suis sous contrat, je veux voir où en est mon forfait
**Aujourd'hui** : carte du forfait (formule, dates, prix HT, jours, évolutions livrées), modalités, séquences avec jauge, « Jour par jour », évolutions.
**Ce qui coince** : à plusieurs projets, la vue équipe s'affiche (voir 6). Le lien vers le devis ne mène nulle part pour un collaborateur.
**Verdict** : Simple pour un projet.

### 52. Je veux proposer une évolution
**Aujourd'hui** : « Proposer une évolution », fenêtre (« En une ligne », « Pourquoi, et pour qui »), fiche avec la réponse de l'équipe.
**Ce qui coince** : ni pièce jointe, ni conversation, ni retrait. Changement de statut notifié dans le Hub sans e-mail. Voir 24 pour le doublon avec les demandes.
**Verdict** : À alléger.

### 53. Mon forfait est suspendu ou terminé, je veux le reprendre
**Aujourd'hui** : l'e-mail dit « il reprend quand vous le souhaitez », les règles le permettent, mais aucun bouton n'existe.
**Verdict** : Manque. Un bouton « Reprendre le forfait ».

---

## J. Mon compte

### 54. Je veux mettre à jour mon profil
**Aujourd'hui** : Paramètres, Nom, Téléphone, Entreprise, Fuseau horaire, e-mail en lecture seule (« prévenez Capmedia »).
**Ce qui coince** : le fuseau et le téléphone ne servent nulle part.
**Verdict** : Simple, à épurer.

### 55. Je veux choisir les e-mails que je reçois
**Aujourd'hui** : 8 catégories, Immédiat, Résumé quotidien, Désactivé.
**Ce qui coince** : C3. La catégorie « projet » (étapes, blocages, maintenance, tests) n'est pas proposée, donc impossible à couper. « Tâche en attente » est rangée sous « Mouvements de mes demandes ».
**Verdict** : Cassé sur le résumé. Soit l'implémenter, soit retirer le choix.

### 56. Je veux me connecter sans code la prochaine fois
**Aujourd'hui** : « Gérer mes clés », « Ajouter cet appareil », « Retirer ». Le code reste le secours.
**Verdict** : Simple.

### 57. Je veux ajouter un collègue
**Aujourd'hui** : rien. Il faut écrire à Capmedia.
**Verdict** : Manque, ou choix assumé : le responsable pourrait inviter un collaborateur (la fonction serveur existe côté équipe).

### 58. Je veux savoir qui est qui sur mon projet
**Aujourd'hui** : le nom du responsable Capmedia dans l'en-tête, les noms sur les étapes, tâches, réunions, fichiers. Aucune page « qui est qui », ni côté client ni côté Capmedia, ni mon propre rôle.
**Verdict** : Manque. Une section « Les personnes » dans l'aperçu : l'équipe Capmedia sur le projet, les personnes de mon côté avec leur rôle.

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
