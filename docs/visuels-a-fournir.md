# Les visuels à produire, formation par formation

Chaque ligne est une image à fournir. La description dit exactement ce que le visuel doit montrer : c'est le cahier des charges de la capture ou du schéma. Une fois l'image prête : la déposer (hébergement des images à définir : dossier assets du site ou Storage), puis remplacer l'emplacement `[[visuel: ...]]` du module par l'image via la console (onglet Contenu) ou les fichiers locaux + seed.
**Total : 79 visuels.** Conseil d'ordre : commence par les formations disponibles les plus vendues (mobile, puis github), et par les captures d'outils (rapides) avant les schémas.


Trois familles :
- **Captures d'outils** (les plus nombreuses) : ton écran, l'outil réel, avec les éléments importants entourés ou fléchés. Mode clair de préférence, fenêtre propre.
- **Schémas** : à faire dessiner (Figma, Excalidraw, ou l'IA) : le texte de la description liste les éléments obligatoires.
- **Maquettes et planches** : des compositions (avant/après, planches de captures) : assembler dans Figma ou Canva.

## De Zéro à l'App Store (13 visuels)

- [ ] **Module 02 · Installer ton atelier**
      capture du terminal : npx expo start lancé avec le QR code affiché, et l'app Expo Go ouverte sur le téléphone à côté
- [ ] **Module 02 · Installer ton atelier**
      capture d'écran du terminal affichant le QR code Expo, à côté d'un iPhone montrant l'app Expo Go en train de charger
- [ ] **Module 03 · Ton banc de test, simulateurs, émulateurs et vrais téléphones**
      le simulateur iPhone ouvert avec l'app Rituel dedans, à côté du terminal montrant la touche i
- [ ] **Module 03 · Ton banc de test, simulateurs, émulateurs et vrais téléphones**
      le Device Manager d'Android Studio avec un Pixel 8 configuré, et l'émulateur lancé à côté
- [ ] **Module 07 · Maquetter ton application avant de la construire**
      photo d'une feuille avec 4 écrans de Rituel esquissés au crayon, flèches entre les écrans
- [ ] **Module 08 · Construire les écrans de Rituel**
      maquette des 3 écrans de Rituel côte à côte, style épuré, fond crème, avec la barre d'onglets en bas
- [ ] **Module 09 · Sauvegarder les données, puis les synchroniser**
      capture console Firebase : la base Firestore du projet Rituel avec la collection habitudes et un document ouvert
- [ ] **Module 12 · Faire payer : abonnements et achats intégrés**
      capture RevenueCat : le paywall configuré avec les deux offres et l'essai, côté dashboard
- [ ] **Module 13 · Xcode, le tour complet sans jargon**
      capture de la fenêtre Xcode annotée avec 4 zones numérotées : navigateur à gauche, éditeur au centre, inspecteur à droite, barre d'outils en haut
- [ ] **Module 13 · Xcode, le tour complet sans jargon**
      le Finder montrant le dossier ios/ avec le .xcworkspace entouré en vert et le .xcodeproj barré en rouge
- [ ] **Module 13 · Xcode, le tour complet sans jargon**
      capture de l'onglet Signing & Capabilities avec Team, Bundle Identifier et la coche Automatically manage signing annotés
- [ ] **Module 13 · Xcode, le tour complet sans jargon**
      la fenêtre Devices and Simulators avec un iPhone connecté, et l'écran iOS de confiance au développeur à côté
- [ ] **Module 14 · Publier sur l'App Store**
      capture App Store Connect : la fiche de l'app prête à soumettre : captures chargées, bouton Soumettre pour vérification visible

## Git & GitHub (8 visuels)

- [ ] **Module 01 · Ce que Git fait vraiment (et pourquoi tout le monde s'en sert)**
      terminal : la séquence git init, git add ., git commit, puis git log --oneline montrant la première photo, avec le message de commit lisible
- [ ] **Module 02 · Le cycle quotidien : add, commit, push**
      schéma des trois zones : chantier (fichiers modifiés) -> table de préparation (git add) -> album (git commit), avec les flèches nommées et git status en boussole au centre
- [ ] **Module 03 · Revenir en arrière sans rien casser**
      schéma-carte des retours en arrière : les 5 situations en colonnes avec leur commande (restore, stash, revert, checkout, reset --hard) et un code couleur vert/orange/rouge selon la destructivité
- [ ] **Module 04 · Les branches, ton bac à sable**
      capture VS Code : un fichier en conflit avec les marqueurs <<<<<<< ======= >>>>>>> visibles et les boutons Accept Current/Incoming, zone litigieuse entourée
- [ ] **Module 05 · GitHub : compte, sécurité, dépôts**
      page d'un dépôt GitHub avec trois flèches annotées : le README affiché, le compteur de commits, et le cadenas Private à côté du nom
- [ ] **Module 06 · Collaborer : issues, pull requests, revues**
      capture GitHub : une pull request ouverte, onglet Files changed, avec les lignes vertes/rouges et un commentaire de revue sur une ligne
- [ ] **Module 07 · Ta vitrine : le profil qui vaut un CV**
      capture GitHub : un profil soigné avec photo, bio, README de profil affiché et 2-3 dépôts épinglés en dessous
- [ ] **Module 08 · Les 3 accidents célèbres et leurs pompiers**
      terminal : la sortie de git reflog avec la ligne d'avant l'accident entourée, puis git branch recuperation en dessous

## Prompting professionnel (5 visuels)

- [ ] **Module 02 · La structure universelle**
      schéma : les 5 blocs empilés (Contexte, Objectif, Détails, Contraintes, Format) avec une phrase d'exemple dans chacun, style fiche mémo
- [ ] **Module 03 · Les gabarits par métier**
      capture d'une conversation IA : un gabarit rempli (R1 e-mail) collé, et la réponse structurée en dessous, pour montrer le rendu réel
- [ ] **Module 04 · L'itération qui converge**
      capture : le bouton de modification d'un ancien message dans une conversation (Claude ou ChatGPT), flèche sur l'icône éditer du premier message
- [ ] **Module 05 · Vérifier : le réflexe anti-hallucination**
      capture d'une réponse IA contenant deux [À VÉRIFIER] bien visibles à la place de chiffres, entourés en rouge
- [ ] **Module 06 · Automatiser tes prompts**
      capture Réglages macOS : Clavier > Remplacements de texte, avec ;cr et ;mail visibles dans la liste et leur texte de remplacement

## Claude Code (6 visuels)

- [ ] **Module 01 · Installer et connecter Claude Code proprement**
      capture terminal : Claude Code proposant la création d'un fichier avec l'aperçu du contenu et la demande d'autorisation (Yes/No) visible
- [ ] **Module 02 · CLAUDE.md : la mémoire de ton projet**
      capture terminal : la commande /init en train d'explorer le projet, puis le début du CLAUDE.md généré
- [ ] **Module 03 · Les permissions et la sécurité**
      capture terminal : l'indicateur de mode plan actif (après Maj+Tab), avec un plan proposé en attente de validation
- [ ] **Module 05 · Diriger, relire, refuser**
      capture VS Code : un diff avec 3 fichiers modifiés dans l'explorateur, le premier ouvert, annotations : périmètre (liste des fichiers), lignes rouges entourées
- [ ] **Module 06 · Les sous-agents et les tâches parallèles**
      capture terminal : plusieurs sous-agents lancés en parallèle avec leurs intitulés de mission, et la synthèse qui revient
- [ ] **Module 08 · Git + Claude Code : le duo de production**
      capture GitHub : une PR ouverte par l'agent via gh, avec le titre et la description quoi/pourquoi/comment vérifier bien remplis

## Site web avec l'IA (8 visuels)

- [ ] **Module 01 · Ce qu'un bon site vitrine doit faire (et rien d'autre)**
      maquette annotée : une page one-page découpée en 5 sections numérotées (héros, services, preuve, qui je suis, contact) avec une flèche sur le bouton d'action
- [ ] **Module 02 · Générer le site avec l'IA**
      avant/après côte à côte : la même section services avant correction (tassée) et après (aérée, prix alignés), deux captures
- [ ] **Module 03 · Le design sans être designer**
      le même site en mode clair et en mode sombre côte à côte, même section héros
- [ ] **Module 04 · En ligne gratuitement**
      capture GitHub : Settings > Pages avec la source Deploy from a branch, main, et l'adresse du site publiée en vert
- [ ] **Module 04 · En ligne gratuitement**
      capture de la zone DNS chez le registrar : les 4 enregistrements A vers GitHub Pages et le CNAME www, valeurs visibles
- [ ] **Module 05 · Le formulaire de contact sans serveur**
      capture double : le formulaire de contact rendu sur le site (3 champs), et l'e-mail de notification Formspree reçu dans la boîte
- [ ] **Module 06 · Être trouvé : le référencement local**
      capture d'une fiche Google Business complète : photos, note, horaires, bouton site web, sur la recherche du métier
- [ ] **Module 06 · Être trouvé : le référencement local**
      capture PageSpeed Insights : score mobile dans le vert avec les Core Web Vitals affichés

## Firebase (6 visuels)

- [ ] **Module 01 · La carte de Firebase**
      capture console Firebase : la création de la base Firestore avec le choix de région europe-west1 entouré et le mode production sélectionné
- [ ] **Module 02 · Firestore : penser en documents**
      capture console Firestore : une collection utilisateurs ouverte, un document avec ses champs, et une sous-collection habitudes visible, les 3 niveaux annotés
- [ ] **Module 03 · L'authentification complète**
      capture console Authentication : l'onglet Sign-in method avec Lien e-mail, Google et Apple activés
- [ ] **Module 04 · Les règles de sécurité, le vrai sujet**
      capture du simulateur de règles : une requête de lecture chez un autre uid avec le résultat REFUSÉ en rouge et la ligne de règle responsable surlignée
- [ ] **Module 05 · Cloud Functions**
      capture terminal : firebase deploy --only functions avec le succès, puis le journal de la fonction montrant une exécution (compteur incrémenté)
- [ ] **Module 07 · La facture à zéro**
      capture Google Cloud : le budget de 5 euros avec les trois seuils d'alerte 50/90/100 % configurés

## Stripe (6 visuels)

- [ ] **Module 01 · Le compte Stripe bien posé**
      capture dashboard Stripe : l'interrupteur mode test activé (bandeau orange) et la page des clés API avec pk_test/sk_test (secrète masquée)
- [ ] **Module 02 · Vendre sans coder : les Payment Links**
      capture de la création d'un Payment Link : la page d'après-paiement en redirection personnalisée et les métadonnées formation/offre remplies
- [ ] **Module 03 · Le webhook : livrer ce qui est payé**
      capture dashboard Stripe : Développeurs > Webhooks, la liste des tentatives avec une en échec (400) et le bouton Renvoyer
- [ ] **Module 04 · Les abonnements**
      capture du portail client Stripe vu côté client : moyen de paiement, factures, bouton annuler l'abonnement
- [ ] **Module 05 · La conformité française**
      capture d'une facture Stripe française : numéro séquentiel, SIREN, mention TVA non applicable art. 293 B, entourés
- [ ] **Module 06 · Remboursements, litiges, fraude**
      capture Radar : la page des règles avec la règle 3DS et une règle maison de blocage par pays

## ASO (6 visuels)

- [ ] **Module 01 · Comment les stores classent**
      capture Play Console : le rapport des termes de recherche avec les requêtes, impressions et conversions par requête
- [ ] **Module 02 · La recherche de mots-clés**
      capture iPhone : l'autocomplétion de l'App Store sur une requête du domaine, avec la liste des suggestions
- [ ] **Module 03 · Nom, sous-titre, description**
      capture App Store Connect : les champs nom (30), sous-titre (30) et mots-clés (100) remplis selon les règles, compteurs visibles
- [ ] **Module 04 · Les captures qui convertissent**
      planche des 5 captures-panneaux d'une app : promesse, geste, force, preuve, doute levé, alignées comme sur la fiche store
- [ ] **Module 05 · Avis et notes**
      capture iPhone : la fenêtre native de notation iOS (les 5 étoiles système) affichée par-dessus une app, au moment d'un accomplissement
- [ ] **Module 06 · Mesurer et itérer**
      capture Play Console : un test de fiche (store listing experiment) en cours avec les deux variantes et les courbes de conversion

## Design d'app (6 visuels)

- [ ] **Module 01 · Les 6 règles mécaniques**
      capture d'un écran d'app annoté au crayon rouge : 9 tailles de texte entourées, 5 couleurs comptées, espacements incohérents fléchés : l'audit en image
- [ ] **Module 02 · Le fichier de thème**
      le même écran d'app en clair et en sombre côte à côte, jetons appliqués, pour montrer que rien d'autre n'a changé
- [ ] **Module 03 · Les écrans qui comptent**
      maquette du gabarit d'état vide : icône douce, phrase qui vend le futur, bouton d'action, les 3 éléments annotés
- [ ] **Module 05 · Le paywall honnête qui convertit**
      maquette de paywall annotée : les 7 blocs numérotés (titre-bénéfice, bénéfices, 2 offres avec annuel pré-sélectionné, prix limpide, bouton, pied réglementaire, croix visible)
- [ ] **Module 06 · Icône et identité**
      planche de test : ton icône à 60 pixels posée au milieu de 10 icônes concurrentes réelles, en clair et en sombre
- [ ] **Module 07 · Diriger l'IA sur le design**
      capture d'une conversation IA : une capture d'écran d'app collée avec l'annotation du problème et la correction demandée en dessous

## Automatiser son business (IA) (5 visuels)

- [ ] **Module 02 · Les outils : n8n, Make, et quand coder**
      capture n8n : le scénario récapitulatif quotidien avec ses 4 nœuds reliés (horloge, agenda, mise en forme, envoi), exécution verte
- [ ] **Module 03 · Brancher l'IA au milieu**
      capture n8n : le nœud IF sur la confiance avec les deux branches : voie automatique en haut, voie de secours (étiquette + notification) en bas
- [ ] **Module 04 · Cas n°1 : la boîte mail qui se trie seule**
      capture n8n : le scénario boîte mail complet : déclencheur e-mail, filtre, nœud IA, branchement, étiquettes, brouillon
- [ ] **Module 05 · Cas n°2 : factures et relances**
      capture n8n : le scénario relances avec les paliers visibles (J-3, J+7, J+21, alerte humaine J+35)
- [ ] **Module 08 · Les garde-fous**
      capture du rapport du matin reçu (e-mail ou Telegram) : e-mails triés, relances parties, éléments en voie de secours, tout chiffré

## SEO & contenu (5 visuels)

- [ ] **Module 01 · Comment Google décide**
      capture Search Console : le rapport Performance avec les 4 courbes (clics, impressions, CTR, position) sur 3 mois
- [ ] **Module 02 · La recherche de mots-clés**
      capture Google : l'autocomplétion sur une requête du domaine + le bloc Autres questions posées, les deux visibles
- [ ] **Module 04 · Le SEO technique sans jargon**
      capture Search Console : le rapport Pages avec les motifs de non-indexation listés (détectée non indexée, explorée non indexée...)
- [ ] **Module 05 · Le maillage et l'architecture**
      schéma de la roue : le pilier au centre, 6 satellites autour, flèches dans les deux sens, et une flèche sortante vers la page d'argent
- [ ] **Module 07 · Mesurer**
      capture Search Console : le rapport Requêtes d'UNE page (filtre page), montrant les requêtes en position 5-15 à renforcer

## Micro-SaaS (5 visuels)

- [ ] **Module 03 · Vendre avant de construire**
      maquette annotée de la page de prévente : les 5 blocs numérotés (problème, promesse, maquettes, prix affiché, offre fondateur + liste d'attente)
- [ ] **Module 04 · Construire le minimum vendable**
      schéma du parcours unique : les 4-7 écrans du minimum vendable reliés par des flèches, et une poubelle à côté avec les fonctionnalités coupées
- [ ] **Module 06 · L'abonnement branché**
      capture double : l'abonnement dans le dashboard Stripe et le document compte Firestore avec plan: actif et finPeriode, côte à côte
- [ ] **Module 08 · Le lancement**
      capture de l'e-mail d'ouverture réel envoyé à la liste : témoignage fondateur en haut, offre datée, un seul bouton
- [ ] **Module 09 · Les 90 jours qui décident**
      capture du tableur : les 5 colonnes (MRR, essais, activation, départs, NPS) remplies sur 6 semaines, la colonne activation en progression
