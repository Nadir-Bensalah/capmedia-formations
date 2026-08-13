/* ==========================================================================
   CAPMEDIA ACADEMY · Le catalogue

   Source de vérité unique des formations : identités, prix, programmes,
   statuts. Consommé par :
   - le générateur de landings (outils/generer-landings.py)
   - la page catalogue (formations/)
   - l'espace membre et Mon espace
   - la Cloud Function de checkout (copie générée : fonctions/catalogue.json)

   Prix en euros TTC. `essentiel` / `complet` par formation.
   Le PACK donne accès à tout : `basic` = tout en Essentiel,
   `avance` = tout en Complet. Prix pack = somme des prix, moins 30 %.
   ========================================================================== */

/* eslint-disable */
const CATALOGUE = {

  formations: [
    {
      slug: 'mobile',
      nom: "De Zéro à l'App Store",
      courte: 'Créer et publier sa première application mobile',
      accroche: "Ton application mobile en ligne sur l'App Store dans 30 jours, sans avoir jamais codé.",
      niveau: 'Formation signature',
      duree: '30 jours · 17 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      page: '/index.html',
      couleurIco: 'telephone',
    },

    {
      slug: 'github',
      nom: 'Git & GitHub, la maîtrise complète',
      courte: 'Le filet de sécurité de tout ton travail numérique',
      accroche: "Ne perds plus jamais une heure de travail. Versionne, sauvegarde, collabore et fais de ton GitHub une vitrine professionnelle.",
      niveau: 'Formation rapide',
      duree: '1 semaine · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'cadenas',
      probleme: [
        "Tu as déjà perdu du travail. Un fichier écrasé, un dossier supprimé, un « ça marchait hier » impossible à retrouver. Et tu sais que ça recommencera.",
        "Git règle ce problème depuis vingt ans, mais tous les tutoriels l'expliquent pour des ingénieurs, avec cinquante commandes dont tu n'auras jamais besoin et du jargon dès la deuxième phrase.",
        "Cette formation prend le chemin inverse : les 12 commandes qui servent vraiment, les 3 accidents qui coûtent cher, et GitHub comme vitrine qui vaut mieux qu'un CV.",
      ],
      publics: [
        "Tu codes (ou tu fais coder l'IA) et tu n'as aucun filet de sécurité",
        "Tu as suivi la formation mobile et tu veux aller plus loin que le module 6",
        "Tu veux un profil GitHub qui prouve ce que tu sais faire",
        "Tu travailles à plusieurs et les fichiers « final_v3_VRAI.zip » te fatiguent",
      ],
      modules: [
        { t: "Ce que Git fait vraiment (et pourquoi tout le monde s'en sert)", pts: ["L'appareil photo et l'album, sans jargon", "Installer et se présenter, Mac et Windows", "Ton premier dépôt en 10 minutes"] },
        { t: "Le cycle quotidien : add, commit, push", pts: ["Le bon rythme de photos", "Les messages qui servent encore dans 6 mois", "Le .gitignore qui te protège"] },
        { t: "Revenir en arrière sans rien casser", pts: ["checkout, restore, stash : lequel quand", "Lire l'historique comme un journal", "Le reset --hard : quand, et surtout quand pas"] },
        { t: "Les branches, ton bac à sable", pts: ["Expérimenter sans risque", "Fusionner proprement", "Résoudre un conflit sans paniquer"] },
        { t: "GitHub : compte, sécurité, dépôts", pts: ["Le pseudo qui fait professionnel", "Double authentification et clés", "Privé ou public : la règle simple"] },
        { t: "Collaborer : issues, pull requests, revues", pts: ["Proposer un changement proprement", "Relire le travail des autres", "Les conventions qui évitent les frictions"] },
        { t: "Ta vitrine : le profil qui vaut un CV", pts: ["Le README de profil", "Épingler les bons projets", "Ce que regarde un recruteur ou un client"] },
        { t: "Les 3 accidents célèbres et leurs pompiers", pts: ["Le secret poussé : la procédure complète", "Le force push : réparer", "L'historique réécrit : récupérer"] },
      ],
      faq: [
        { q: "Je suis le module 6 de la formation mobile, c'est redondant ?", r: "Le module 6 te donne le kit de survie en 18 minutes. Ici tu as la maîtrise : branches, collaboration, pull requests, vitrine professionnelle, et la récupération après accident. C'est le prolongement naturel." },
        { q: "Il faut savoir coder ?", r: "Non. Git versionne n'importe quels fichiers. Si tu écris, si tu configures, si tu fais générer du code par l'IA, il te sert." },
        { q: "Combien de temps ?", r: "Une semaine à raison d'une heure par jour, et le réflexe est installé pour la vie." },
      ],
    },

    {
      slug: 'claude-code',
      nom: 'Claude Code, le développeur dans ton terminal',
      courte: "Faire produire l'IA à un niveau professionnel",
      accroche: "L'outil que les développeurs professionnels utilisent pour déléguer le code. Configuration, méthode, garde-fous : tout ce qui sépare le jouet de l'outil de production.",
      niveau: 'Formation poussée',
      duree: '2 semaines · 10 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      couleurIco: 'ia',
      probleme: [
        "Tu as essayé de faire coder une IA dans le navigateur : ça marche cinq minutes, puis elle oublie ton projet, invente des fichiers et te fait copier-coller cinquante fois par heure.",
        "Claude Code change la catégorie : il vit dans ton terminal, voit tes vrais fichiers, les modifie, lance tes tests, corrige, recommence. C'est un développeur junior infatigable, à condition de savoir le diriger.",
        "Cette formation t'apprend à le diriger : installation propre, fichier de contexte, permissions, sous-agents, hooks, et la méthode de travail qui produit du code fiable au lieu de la soupe.",
      ],
      publics: [
        "Tu as goûté au vibe coding et tu veux passer au niveau professionnel",
        "Tu construis un produit et l'IA du navigateur te fait perdre du temps",
        "Tu es développeur et tu veux multiplier ta production sans sacrifier la qualité",
        "Tu as fini la formation mobile et tu veux industrialiser ta méthode",
      ],
      modules: [
        { t: "Installer et connecter Claude Code proprement", pts: ["Terminal, VS Code, application : les trois formes", "L'authentification et les forfaits", "Le premier projet guidé"] },
        { t: "CLAUDE.md : la mémoire de ton projet", pts: ["Ce qu'il faut y mettre (et ne pas y mettre)", "Les règles qui changent tout", "Mémoire projet et mémoire globale"] },
        { t: "Les permissions et la sécurité", pts: ["Ce que l'outil peut toucher, et comment le limiter", "Les modes d'exécution", "Travailler sans peur de l'accident"] },
        { t: "La méthode : petit pas, test, commit", pts: ["Découper une fonctionnalité en demandes sûres", "Faire écrire les tests d'abord", "Le cycle qui produit du code fiable"] },
        { t: "Diriger, relire, refuser", pts: ["Lire un diff comme un chef de projet", "Repérer le code suspect sans être expert", "Faire recommencer sans s'énerver"] },
        { t: "Les sous-agents et les tâches parallèles", pts: ["Déléguer la recherche, garder la décision", "Explorer une base de code inconnue", "Les revues de code automatisées"] },
        { t: "Hooks, commandes et personnalisation", pts: ["Automatiser les vérifications à chaque étape", "Tes commandes maison", "Brancher tes outils"] },
        { t: "Git + Claude Code : le duo de production", pts: ["Commits, branches et pull requests délégués", "La revue avant fusion", "L'historique qui reste propre"] },
        { t: "Les pièges qui coûtent cher", pts: ["Le contexte pourri et comment repartir", "Les hallucinations de dépendances", "La facture : comprendre et maîtriser les coûts"] },
        { t: "Projet fil rouge : une vraie fonctionnalité de A à Z", pts: ["Du ticket à la mise en production", "Sans écrire une ligne soi-même", "Avec la qualité d'un senior"] },
      ],
      faq: [
        { q: "Il faut déjà savoir coder ?", r: "Non, mais il faut accepter d'apprendre à lire du code. La formation t'apprend à diriger et à relire, pas à écrire." },
        { q: "Ça coûte cher à l'usage ?", r: "Un module entier est consacré aux coûts : comprendre la facturation, choisir son forfait, et les habitudes qui divisent la consommation par trois." },
        { q: "Pourquoi Claude Code et pas un autre outil ?", r: "Parce que c'est l'outil le plus capable du marché dans le terminal, et celui que l'auteur utilise en production tous les jours. La méthode reste valable pour ses concurrents." },
      ],
    },

    {
      slug: 'site-web-ia',
      nom: "Ton site web professionnel avec l'IA",
      courte: 'Un vrai site en ligne, rapide, sans agence ni abonnement',
      accroche: "Un site professionnel, en ligne sur ton propre domaine, construit avec l'IA et hébergé gratuitement. Sans WordPress, sans agence à 3 000 €, sans abonnement mensuel.",
      niveau: 'Formation rapide',
      duree: '1 semaine · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'ordinateur',
      probleme: [
        "Un site vitrine facturé 1 500 à 5 000 € par une agence, ou un abonnement Wix à 200 €/an pour un résultat qui sent le modèle tout fait : voilà les deux options que tout le monde croit avoir.",
        "Il en existe une troisième : décrire ton site à l'IA, la laisser produire un site sur mesure, rapide et propre, et l'héberger gratuitement. Ce site que tu lis a été construit exactement comme ça.",
        "La formation couvre tout : la structure qui vend, le design, le domaine, l'hébergement gratuit, le formulaire de contact, et le référencement local.",
      ],
      publics: [
        "Artisan, indépendant, thérapeute, association : il te faut un site crédible",
        "Tu as payé un abonnement de site builder et tu veux t'en libérer",
        "Tu veux vendre des sites à tes clients en freelance",
        "Tu veux la landing page de ton projet sans dépendre de personne",
      ],
      modules: [
        { t: "Ce qu'un bon site vitrine doit faire (et rien d'autre)", pts: ["Les 5 sections qui comptent", "Les erreurs qui font fuir", "Ton contenu avant ton design"] },
        { t: "Générer le site avec l'IA", pts: ["Le prompt de structure complet", "Itérer section par section", "Récupérer un code propre et léger"] },
        { t: "Le design sans être designer", pts: ["Typo, couleurs, espaces : les règles mécaniques", "Mode sombre", "Les photos qui font vrai"] },
        { t: "En ligne gratuitement", pts: ["GitHub Pages pas à pas", "Ton nom de domaine branché", "HTTPS automatique"] },
        { t: "Le formulaire de contact sans serveur", pts: ["Trois solutions gratuites comparées", "Anti-spam", "La notification qui arrive vraiment"] },
        { t: "Être trouvé : le référencement local", pts: ["Google Business et ton site", "Les pages qui rankent", "Vitesse et mobile"] },
        { t: "Livrer et facturer (pour les freelances)", pts: ["Le processus client en 5 jours", "Quoi facturer, combien", "La maintenance sans esclavage"] },
      ],
      faq: [
        { q: "C'est le même sujet que la formation mobile ?", r: "Non. Ici c'est le web : sites vitrines, landing pages, portfolios. Les compétences se complètent, l'outil IA est le même." },
        { q: "Il y a des frais cachés ?", r: "Le domaine, environ 10 €/an. L'hébergement est gratuit. C'est tout, et c'est vérifiable." },
      ],
    },

    {
      slug: 'automatiser-ia',
      nom: "Automatiser son business avec l'IA",
      courte: 'Les tâches répétitives en pilote automatique',
      accroche: "Factures, relances, tri d'e-mails, réseaux sociaux, rapports : branche l'IA sur tes tâches répétitives et récupère des heures chaque semaine.",
      niveau: 'Formation poussée',
      duree: '2 semaines · 9 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      couleurIco: 'engrenage',
      probleme: [
        "Fais le compte : combien d'heures par semaine à copier-coller entre des outils, relancer des clients, trier des messages, remplir des tableaux ? Chez la plupart des indépendants, c'est une journée entière.",
        "Les outils d'automatisation existent depuis des années, mais l'IA a changé leur nature : ils savent maintenant lire, décider et rédiger. Une facture qui arrive peut être lue, classée, enregistrée et confirmée sans toi.",
        "Cette formation construit tes automatisations une par une, sur des cas réels, avec les garde-fous pour que rien ne parte en vrille pendant ton sommeil.",
      ],
      publics: [
        "Indépendant ou petite équipe noyée dans l'administratif",
        "Tu veux proposer l'automatisation comme service à tes clients",
        "Tu as un produit et le support te mange tes journées",
        "Tu veux comprendre ce que « agent IA » veut dire concrètement",
      ],
      modules: [
        { t: "La carte de tes heures perdues", pts: ["L'audit en 30 minutes", "Ce qui s'automatise, ce qui ne doit pas", "Le calcul de rentabilité"] },
        { t: "Les outils : n8n, Make, et quand coder", pts: ["Comparatif honnête, coûts réels", "Notre choix et pourquoi", "Installation et premier scénario"] },
        { t: "Brancher l'IA au milieu", pts: ["Lire, classer, décider, rédiger", "Les prompts d'automatisation fiables", "Température zéro et formats stricts"] },
        { t: "Cas n°1 : la boîte mail qui se trie seule", pts: ["Tri, étiquettes, brouillons de réponse", "L'escalade vers l'humain", "Les limites de confiance"] },
        { t: "Cas n°2 : factures et relances", pts: ["De la facture reçue au tableau à jour", "Les relances polies qui tombent seules", "La comptabilité qui se prépare"] },
        { t: "Cas n°3 : le contenu qui se publie", pts: ["Du brouillon au post programmé", "Recycler sans dupliquer", "Garder ta voix"] },
        { t: "Cas n°4 : le support client augmenté", pts: ["Réponses préparées, jamais envoyées seules", "La base de connaissances vivante", "Mesurer la qualité"] },
        { t: "Les garde-fous", pts: ["Ce que l'IA ne doit jamais faire seule", "Journaux, alertes, coupe-circuits", "RGPD et données clients"] },
        { t: "Vendre l'automatisation (pour les freelances)", pts: ["L'audit facturé", "Le forfait mensuel", "Les contrats qui protègent"] },
      ],
      faq: [
        { q: "Il faut savoir coder ?", r: "Non. Les outils sont visuels. Quand un peu de code aide, l'IA l'écrit et la formation te montre où le coller." },
        { q: "Quel budget mensuel pour les outils ?", r: "De 0 à 30 €/mois selon le volume. Le module 2 détaille les coûts réels, sans surprise." },
      ],
    },

    {
      slug: 'prompting',
      nom: 'Le prompting professionnel',
      courte: "Obtenir de l'IA des résultats constants, pas des coups de chance",
      accroche: "La différence entre celui qui « essaie ChatGPT » et celui qui produit avec : une méthode. Structure, contexte, itération, vérification : le socle de tout travail avec l'IA.",
      niveau: 'Formation rapide',
      duree: '3 jours · 6 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'chat',
      probleme: [
        "Tout le monde utilise l'IA. Presque personne n'en tire des résultats constants : un jour brillant, le lendemain de la bouillie, sans comprendre pourquoi.",
        "La différence n'est pas l'outil ni l'abonnement. C'est la façon de demander : le contexte fourni, la structure de la demande, le format exigé, et la vérification derrière.",
        "Six modules courts, une méthode transférable à tous les modèles et tous les métiers, et une bibliothèque de gabarits à remplir.",
      ],
      publics: [
        "Tu utilises l'IA tous les jours et tu sens que tu n'en tires que 20 %",
        "Tu rédiges, tu analyses, tu synthétises pour ton travail",
        "Ton équipe utilise l'IA n'importe comment et ça se voit",
        "Tu veux le socle avant les formations spécialisées",
      ],
      modules: [
        { t: "Pourquoi tes résultats sont inconstants", pts: ["Ce que le modèle sait, devine et invente", "Le contexte, seul vrai levier", "Le test des trois questions"] },
        { t: "La structure universelle", pts: ["Contexte, objectif, détail, contraintes, format", "Les six règles", "Avant/après sur des cas réels"] },
        { t: "Les gabarits par métier", pts: ["Rédiger, résumer, analyser, traduire, structurer", "20 gabarits à remplir", "Les adapter à ton vocabulaire"] },
        { t: "L'itération qui converge", pts: ["Corriger sans repartir de zéro", "Le diagnostic avant la correction", "Quand ouvrir une conversation neuve"] },
        { t: "Vérifier : le réflexe anti-hallucination", pts: ["Faire citer les sources", "Les croisements rapides", "Ce qu'on ne délègue jamais"] },
        { t: "Automatiser tes prompts", pts: ["Tes gabarits en raccourcis", "Les instructions permanentes", "La bibliothèque d'équipe"] },
      ],
      faq: [
        { q: "ChatGPT, Claude, Gemini : ça marche pour lequel ?", r: "Tous. La méthode est indépendante du modèle ; les exemples montrent les trois." },
        { q: "C'est redondant avec le module 4 de la formation mobile ?", r: "Le module 4 applique le prompting au code. Ici, c'est la méthode générale : rédaction, analyse, décision, tous métiers." },
      ],
    },

    {
      slug: 'firebase',
      nom: 'Firebase, ton backend sans serveur',
      courte: "Comptes, données, paiements : l'arrière-boutique de ton app",
      accroche: "Comptes utilisateurs, base de données temps réel, fichiers, fonctions : tout ce qu'il faut derrière une app, sans serveur à administrer, pour 0 € au départ.",
      niveau: 'Formation complète',
      duree: '10 jours · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'note',
      probleme: [
        "Ton app a besoin d'une arrière-boutique : des comptes, des données qui se synchronisent, des fichiers. Le chemin classique (louer un serveur, l'administrer, le sécuriser) est un métier à part entière.",
        "Firebase fait ce métier à ta place, gratuitement au début. Mais mal configuré, c'est aussi la base de données ouverte au monde entier ou la facture surprise à 400 €.",
        "Cette formation le prend dans l'ordre : données, comptes, règles de sécurité (le vrai sujet), fonctions, et les plafonds qui garantissent que la facture reste à zéro.",
      ],
      publics: [
        "Tu as suivi la formation mobile et tu veux maîtriser le module 9 en profondeur",
        "Ton app a besoin de comptes et de synchronisation",
        "Tu veux comprendre les règles de sécurité au lieu de les copier",
        "Tu construis un SaaS et tu veux un backend sans DevOps",
      ],
      modules: [
        { t: "La carte de Firebase", pts: ["Ce que chaque service fait", "Ce qu'on n'utilisera pas", "Créer un projet proprement, région comprise"] },
        { t: "Firestore : penser en documents", pts: ["Modéliser sans tables", "Les requêtes et leurs limites", "Temps réel"] },
        { t: "L'authentification complète", pts: ["Lien magique, mot de passe, Google, Apple", "Sessions et persistance", "Suppression de compte (obligatoire)"] },
        { t: "Les règles de sécurité, le vrai sujet", pts: ["Lire et écrire des règles", "Les tester", "Les 5 patrons qui couvrent 95 % des apps"] },
        { t: "Cloud Functions", pts: ["Quand le client ne suffit plus", "Webhooks et tâches planifiées", "Secrets et déploiement"] },
        { t: "Storage : les fichiers", pts: ["Upload et téléchargement sécurisés", "Images : redimensionner", "Règles dédiées"] },
        { t: "La facture à zéro", pts: ["Comprendre la tarification", "Plafonds et alertes", "Les boucles qui coûtent et comment les tuer"] },
        { t: "Projet fil rouge : le backend complet d'une app", pts: ["Comptes + données + fichiers", "Sécurisé et testé", "Prêt pour la production"] },
      ],
      faq: [
        { q: "Firebase ou Supabase ?", r: "Les deux sont bons. Firebase est choisi ici pour sa maturité mobile et parce que c'est celui de la formation signature ; un module compare honnêtement les deux." },
        { q: "C'est vraiment gratuit ?", r: "Jusqu'à des volumes que tu n'atteindras pas avant des milliers d'utilisateurs actifs. Le module 7 verrouille la facture à zéro." },
      ],
    },

    {
      slug: 'stripe',
      nom: 'Encaisser en ligne avec Stripe',
      courte: 'Paiements, abonnements, factures : le circuit complet',
      accroche: "Du premier lien de paiement aux abonnements avec webhooks : encaisse proprement, conforme et sans y laisser tes nuits. Par quelqu'un qui encaisse réellement avec.",
      niveau: 'Formation complète',
      duree: '1 semaine · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'copier',
      probleme: [
        "Encaisser en ligne paraît simple jusqu'au moment de le faire : liens ou intégration ? Webhooks ? TVA ? Factures ? Remboursements ? Chaque question mal réglée coûte de l'argent ou un client.",
        "Stripe est l'outil de référence, mais sa documentation s'adresse à des développeurs d'équipes. Ici, on la traduit pour l'indépendant qui vend son produit ou sa formation.",
        "Tout le circuit, dans l'ordre : le compte bien configuré, les liens de paiement, le webhook qui livre l'achat, les abonnements, la conformité française.",
      ],
      publics: [
        "Tu vends (ou vas vendre) un produit numérique, une formation, un service",
        "Tu as un SaaS et les abonnements te font peur",
        "Tu veux comprendre ce que ton webhook fait la nuit",
        "Ton comptable te demande des exports propres",
      ],
      modules: [
        { t: "Le compte Stripe bien posé", pts: ["Activation, identité, virements", "Mode test et mode réel", "Le tableau de bord qui compte"] },
        { t: "Vendre sans coder : les Payment Links", pts: ["Produits, prix, promotions", "Redirections et reçus", "Ce que les liens ne savent pas faire"] },
        { t: "Le webhook : livrer ce qui est payé", pts: ["Signature et sécurité", "Ouvrir l'accès automatiquement", "Rejouer les événements ratés"] },
        { t: "Les abonnements", pts: ["Essais, renouvellements, échecs de carte", "Le portail client", "Annulations et récupération"] },
        { t: "La conformité française", pts: ["TVA, franchise en base, OSS", "Factures conformes", "Ce que veut ton comptable"] },
        { t: "Remboursements, litiges, fraude", pts: ["La procédure sereine", "Gagner un litige", "Radar et prévention"] },
        { t: "Le circuit complet en production", pts: ["Checklist de passage en réel", "Le premier vrai euro testé", "Surveiller sans y penser"] },
      ],
      faq: [
        { q: "Il faut coder ?", r: "Les modules 1, 2, 5 et 6 : zéro code. Les webhooks et abonnements demandent d'en coller un peu, guidé ligne par ligne, l'IA aidant." },
        { q: "Ça s'applique hors de France ?", r: "Le cœur oui ; le module conformité est centré France/UE." },
      ],
    },

    {
      slug: 'aso',
      nom: 'ASO : être trouvé sur les stores',
      courte: "Le référencement App Store et Google Play, méthodiquement",
      accroche: "Ton app est bonne mais invisible ? L'ASO est le seul canal gratuit et durable des stores. Mots-clés, fiche, captures, avis : la méthode complète.",
      niveau: 'Formation rapide',
      duree: '4 jours · 6 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'etoile',
      probleme: [
        "Deux millions d'applications sur l'App Store. Sans travail de visibilité, la tienne reçoit deux téléchargements par jour, et ce sont tes proches.",
        "La publicité coûte 2 à 5 € l'installation : intenable au début. Le référencement des stores, lui, est gratuit, durable, et méthodique : c'est un moteur de recherche, il se travaille comme tel.",
        "Mots-clés, nom, sous-titre, captures qui convertissent, avis, mises à jour : la boucle complète, avec les outils gratuits pour mesurer.",
      ],
      publics: [
        "Ton app est publiée et ne décolle pas",
        "Tu vas publier et tu veux partir avec la bonne fiche",
        "Tu veux comprendre pourquoi tel concurrent te double",
        "Tu gères les apps de clients",
      ],
      modules: [
        { t: "Comment les stores classent", pts: ["Ce qui pèse chez Apple, chez Google", "Les différences qui piègent", "Lire son classement actuel"] },
        { t: "La recherche de mots-clés", pts: ["Les vraies requêtes, gratuitement", "Volume contre concurrence", "La longue traîne gagnante"] },
        { t: "Nom, sous-titre, description", pts: ["Les caractères qui comptent", "Apple contre Google : indexation opposée", "Réécrire sa fiche en une soirée"] },
        { t: "Les captures qui convertissent", pts: ["La première décide de tout", "Titres et ordre", "Produire sans designer"] },
        { t: "Avis et notes", pts: ["Le bon moment pour demander", "Répondre à tout, surtout au négatif", "Remonter une moyenne"] },
        { t: "Mesurer et itérer", pts: ["Les 3 chiffres qui comptent", "Tester une variante proprement", "Le rythme de mise à jour"] },
      ],
      faq: [
        { q: "C'est déjà dans la formation mobile, non ?", r: "Le module 16 en donne les fondations en 22 minutes. Ici, c'est la spécialisation : méthode complète, outils, itération sur plusieurs mois." },
      ],
    },

    {
      slug: 'design-app',
      nom: "Le design d'app qui fait payer",
      courte: "L'interface qui transforme un essai en abonnement",
      accroche: "90 % de l'écart entre une app d'amateur et une app pro tient à des règles mécaniques. Espace, typo, couleur, animations, paywall : applique-les sans être designer.",
      niveau: 'Formation complète',
      duree: '1 semaine · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'image',
      probleme: [
        "Ton app fonctionne, mais elle « fait pas pro », et tu ne sais pas dire pourquoi. Tes utilisateurs non plus : ils désinstallent, c'est tout.",
        "La bonne nouvelle : ce n'est presque jamais une question de talent. Espacements incohérents, trop de couleurs, hiérarchie absente, animations manquantes : des défauts mécaniques, avec des corrections mécaniques.",
        "Sept modules pour passer ton interface au niveau « app payante », avec des avant/après réels et les gabarits des écrans qui comptent : accueil, vide, paywall, réglages.",
      ],
      publics: [
        "Ton app est fonctionnelle mais fait amateur",
        "Tu veux un paywall qui convertit sans arnaquer",
        "Tu fais générer l'interface par l'IA et il faut la diriger",
        "Tu refais ton design system proprement",
      ],
      modules: [
        { t: "Les 6 règles mécaniques", pts: ["L'espace avant tout", "3 tailles de texte, 1 accent", "L'audit de ton app en 20 minutes"] },
        { t: "Le fichier de thème", pts: ["Jetons : couleurs, espaces, rayons", "Plus jamais une valeur en dur", "Mode sombre inclus"] },
        { t: "Les écrans qui comptent", pts: ["Premier lancement et écran vide", "L'accueil : une action", "Réglages qui respirent"] },
        { t: "Le mouvement", pts: ["Les 3 animations qui font cher", "Durées et courbes", "Le retour haptique"] },
        { t: "Le paywall honnête qui convertit", pts: ["Structure éprouvée", "Prix et ancrage", "Les sombres patterns à refuser"] },
        { t: "Icône et identité", pts: ["Lisible à 60 pixels", "Écran de démarrage", "La cohérence store/app"] },
        { t: "Diriger l'IA sur le design", pts: ["Les prompts de design qui marchent", "Imposer le thème", "L'itération visuelle efficace"] },
      ],
      faq: [
        { q: "Redondant avec le module 10 de la formation mobile ?", r: "Le module 10 pose les 6 règles. Ici : gabarits d'écrans complets, paywall approfondi, identité, et la direction artistique de l'IA." },
      ],
    },

    {
      slug: 'micro-saas',
      nom: 'Lancer un micro-SaaS rentable',
      courte: "De l'idée au premier abonné récurrent, en solo",
      accroche: "Un petit logiciel par abonnement, un problème précis, des revenus récurrents. Le chemin complet du solopreneur : idée, construction IA, prix, lancement, premiers clients.",
      niveau: 'Formation poussée',
      duree: '3 semaines · 10 modules',
      statut: 'acces-anticipe',
      prixE: 127, prixEBarre: 247,
      prixC: 247, prixCBarre: 497,
      couleurIco: 'action',
      probleme: [
        "Le rêve : un produit qui encaisse pendant que tu dors. La réalité du débutant : six mois sur une app que personne n'attendait, lancée devant zéro audience.",
        "Le micro-SaaS inverse la démarche : un problème étroit et douloureux, un public qui se regroupe quelque part, un outil minimal vendu par abonnement avant même d'être fini d'écrire.",
        "Cette formation est le chemin complet, avec l'IA comme équipe technique : validation, construction, paiement, lancement, et les trois premiers mois qui décident de tout.",
      ],
      publics: [
        "Tu veux des revenus récurrents, pas des missions",
        "Tu as fini la formation mobile ou web et tu cherches quoi construire",
        "Tu as une idée SaaS et peur de perdre six mois",
        "Tu veux la méthode complète, business compris",
      ],
      modules: [
        { t: "Le micro dans micro-SaaS", pts: ["Pourquoi petit gagne en solo", "Les maths du récurrent", "10 exemples réels décortiqués"] },
        { t: "Trouver le problème payant", pts: ["Les 4 gisements", "Valider en une semaine sans coder", "Le test des 5 conversations"] },
        { t: "Vendre avant de construire", pts: ["La page qui vend le futur produit", "Prévente honnête", "Le seuil qui déclenche la construction"] },
        { t: "Construire le minimum vendable", pts: ["Périmètre : couper, couper, couper", "La stack simple qui tient", "L'IA comme équipe technique"] },
        { t: "Comptes, données, sécurité", pts: ["Le socle Firebase ou équivalent", "Multi-utilisateurs proprement", "RGPD dès le départ"] },
        { t: "L'abonnement branché", pts: ["Stripe subscriptions", "Essai, relances, échecs de carte", "Le portail client"] },
        { t: "Le prix", pts: ["Par valeur, pas par coût", "Paliers qui poussent vers le milieu", "Augmenter sans perdre les anciens"] },
        { t: "Le lancement", pts: ["La liste d'attente qui travaille", "Où et comment annoncer", "La semaine de lancement heure par heure"] },
        { t: "Les 90 jours qui décident", pts: ["Churn : comprendre, réduire", "Le support qui vend", "Itérer sur la douleur, pas les demandes"] },
        { t: "Grandir ou encaisser", pts: ["Automatiser le tunnel", "Quand embaucher, quand rester seul", "Vendre son micro-SaaS un jour"] },
      ],
      faq: [
        { q: "Différence avec la formation mobile ?", r: "La mobile t'apprend à construire et publier une app. Ici, le produit est un business : validation, prévente, abonnements, lancement, rétention. Elles se complètent, dans cet ordre." },
        { q: "Combien pour démarrer ?", r: "Moins de 100 € tout compris la première année, hors ton temps. Le détail ligne par ligne est au module 1." },
      ],
    },

    {
      slug: 'seo-contenu',
      nom: 'SEO & contenu : le trafic qui revient',
      courte: 'Être trouvé sur Google, durablement, sans budget pub',
      accroche: "La publicité s'arrête quand tu arrêtes de payer. Le contenu bien référencé travaille pendant des années. Méthode complète : mots-clés, pages, technique, autorité.",
      niveau: 'Formation complète',
      duree: '10 jours · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'aide',
      probleme: [
        "Ton produit existe, ton site aussi, et Google t'ignore. Pendant ce temps, des concurrents moins bons captent les recherches qui devraient t'appartenir.",
        "Le SEO n'est ni mort ni magique : c'est un artisanat méthodique, transformé par l'IA (qui rédige avec toi) et bousculé par elle (les réponses IA changent la donne, la formation traite le sujet en face).",
        "Des fondations techniques aux pages qui rankent, de la recherche de mots-clés aux liens entrants : le circuit complet pour un trafic qui n'a pas de compteur à recharger.",
      ],
      publics: [
        "Ton site ou ta boutique n'a que du trafic payant",
        "Tu lances un produit et tu veux un canal durable",
        "Tu écris déjà mais personne ne trouve tes pages",
        "Tu veux utiliser l'IA pour produire sans être pénalisé",
      ],
      modules: [
        { t: "Comment Google décide", pts: ["Ce qui compte vraiment en ce moment", "Les mythes qui te font perdre du temps", "L'impact des réponses IA, honnêtement"] },
        { t: "La recherche de mots-clés", pts: ["Intentions avant volumes", "Les outils gratuits qui suffisent", "La carte de contenu à 6 mois"] },
        { t: "La page qui ranke", pts: ["Structure, titres, profondeur", "Rédiger avec l'IA sans produire de la bouillie", "L'originalité qui se mesure"] },
        { t: "Le SEO technique sans jargon", pts: ["Vitesse, mobile, indexation", "Sitemap, robots, données structurées", "L'audit en une heure"] },
        { t: "Le maillage et l'architecture", pts: ["Pages piliers et satellites", "Les liens internes qui poussent", "Ne pas se cannibaliser"] },
        { t: "L'autorité : les liens entrants", pts: ["Ce qui marche sans budget", "Ce qui pénalise", "Le rythme réaliste"] },
        { t: "Mesurer", pts: ["Search Console maîtrisée", "Les 4 indicateurs utiles", "Décider quoi retravailler"] },
        { t: "Le système de production", pts: ["Le calendrier tenable en solo", "L'IA dans le circuit, au bon endroit", "6 mois de plan concret"] },
      ],
      faq: [
        { q: "Le SEO n'est pas mort avec l'IA ?", r: "Le trafic informationnel simple baisse, le reste se déplace. Le module 1 traite le sujet frontalement, chiffres à l'appui, et la méthode vise ce qui reste durable : intention d'achat, marque, profondeur." },
      ],
    },
  ],

  /* --- Le pack ------------------------------------------------------------ */
  pack: {
    slug: 'pack',
    nom: 'Le Pack Academy',
    accroche: "Toutes les formations, actuelles et à venir pendant un an, en un seul achat. Moins 30 % sur le total, et ton prorata déduit si tu as déjà acheté.",
    remise: 0.30,
    plancher: 19,
  },

  /* Prix du pack : somme des formations au niveau donné, moins la remise. */
  prixPack(niveau) {
    const cle = niveau === 'avance' ? 'prixC' : 'prixE';
    const somme = this.formations.reduce((n, f) => n + f[cle], 0);
    return { plein: somme, prix: Math.round(somme * (1 - this.pack.remise)) };
  },

  /* Prorata : ce que l'acheteur possède est déduit du pack, au tarif du
     niveau choisi. On déduit généreusement (le prix du niveau du pack,
     même s'il n'a que l'essentiel) : simple, lisible, jamais contesté. */
  prixPackPerso(niveau, achats) {
    const cle = niveau === 'avance' ? 'prixC' : 'prixE';
    const base = this.prixPack(niveau);
    let deja = 0;
    for (const f of this.formations) {
      if (achats && achats[f.slug]) deja += f[cle];
    }
    const prix = Math.max(this.pack.plancher, base.prix - deja);
    const remisePct = Math.round((1 - prix / base.plein) * 100);
    return { plein: base.plein, packPlein: base.prix, deja, prix, remisePct };
  },

  parSlug(slug) { return this.formations.find((f) => f.slug === slug) || null; },
};

/* Liens de paiement Stripe : remplis par la configuration (config.js) ou
   par le générateur. Clés : `${slug}:essentiel`, `${slug}:complet`,
   `pack:basic`, `pack:avance`. */
CATALOGUE.liens = (typeof window !== 'undefined' && window.AZ && window.AZ.liens) || {};

if (typeof window !== 'undefined') window.CATALOGUE = CATALOGUE;
if (typeof module !== 'undefined') module.exports = CATALOGUE;
export default CATALOGUE;
export { CATALOGUE };
