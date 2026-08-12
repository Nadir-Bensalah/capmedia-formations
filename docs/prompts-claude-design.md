# Prompts Claude Design : Capmedia Academy

Chaque prompt est autonome : copie-colle tel quel. La charte est rappelée dans
chacun pour que les visuels restent cohérents même produits à des jours d'écart.

---

## La charte, à rappeler partout

```
CHARTE CAPMEDIA ACADEMY · à respecter strictement

Couleurs :
  papier        #FBFAF8   (fond principal)
  papier pur    #FFFFFF   (cartes)
  papier creux  #F4F2EE   (sections alternées)
  encre fond    #14130F   (sections sombres)
  encre         #1A1917   (texte principal)
  encre douce   #6E6A62   (texte secondaire)
  encre ténue   #9C978D   (texte tertiaire)
  trait         #E8E4DC   (bordures 1px)
  accent        #C24A17   (terracotta brûlée : LA couleur de marque)
  accent clair  #E86A34   (accent en mode sombre)
  accent voile  #FBEDE6   (fond d'encadré)
  vert          #2F7D52   (validation)

Typographie :
  Titres  : Instrument Serif, regular, letter-spacing -0.02em
  Corps   : Inter (400/500/600)
  Code    : JetBrains Mono

Principes :
  : Esthétique « papier Notion » : beaucoup de blanc, traits de 1px,
    aucune ombre dure, aucun dégradé criard.
  : Espacements sur une échelle de 4 : 4 8 12 16 24 32 48 64
  : Rayons : 8 (petit) / 12 (bouton) / 18 (carte) / 999 (rond)
  : Une seule couleur d'accent. Le reste est gris.
  : Si une ombre est nécessaire : très diffuse et très transparente
    (opacité 0.08, rayon 24px).
  : Doit fonctionner en clair ET en sombre.
```

---

## 1 : Visuel du héros (landing)

> Remplace le faux téléphone en CSS de `index.html`.

```
Crée un visuel de héros pour une landing page de formation, en HTML/CSS/SVG
autonome, animé.

[COLLER LA CHARTE]

Le sujet : un iPhone en trois-quarts léger, affichant une application de suivi
d'habitudes appelée « Rituel ». À côté, un second plan qui suggère la
publication sur l'App Store.

Contenu de l'écran du téléphone :
  : barre d'état 9:41
  : grand titre serif « Aujourd'hui »
  : sous-titre gris « 3 rituels sur 4 »
  : 4 lignes d'habitudes dans des cartes à bord 1px arrondi 11px :
      « Marcher 20 minutes » (cochée, vert)
      « Lire 10 pages » (cochée, vert)
      « Pas d'écran après 22 h » (cochée, vert)
      « Écrire 200 mots » (non cochée)
  : en bas, un bouton pleine largeur encre « Ajouter un rituel »

Animation, en boucle de 6 secondes, discrète :
  1. la 4e ligne se coche : le rond passe de vide à vert plein avec un
     rebond léger (scale 1 → 1.2 → 1, 220ms)
  2. le compteur passe de « 3 rituels sur 4 » à « 4 rituels sur 4 »
  3. une petite étiquette « Publiée sur l'App Store » glisse depuis la
     droite, en carte blanche bord 1px, avec une coche verte
  4. pause 2s, puis retour à l'état initial en fondu

Contraintes :
  : CSS pur + SVG, aucune bibliothèque, aucun script externe
  : respecte prefers-reduced-motion : état final figé, sans animation
  : largeur maximale 520px, responsive, sans débordement horizontal
  : s'intègre sur fond #FBFAF8 comme sur fond sombre
```

---

## 2 : Image Open Graph (partage sur les réseaux)

> Fichier attendu : `assets/img/og.png` : 1200 × 630.

```
Crée une image de partage social, 1200 × 630 pixels, en HTML/CSS autonome
que je pourrai capturer.

[COLLER LA CHARTE]

Composition :
  : fond #FBFAF8, avec une trame de points très discrète (#E8E4DC, 1px,
    espacés de 24px, opacité 0.5)
  : en haut à gauche, le logo : un carré noir arrondi 8px de 34px avec un
    « C » blanc, suivi du texte « Capmedia Academy » en
    Inter 600
  : au centre gauche, sur 3 lignes, en Instrument Serif 68px, encre #1A1917 :
        « Ton application mobile
          en ligne sur l'App Store
          dans 30 jours. »
    Le mot « 30 jours » est souligné d'un trait terracotta épais et légèrement
    incliné (-0.6°), opacité 0.22, comme tracé au feutre.
  : en bas à gauche, en Inter 20px gris #6E6A62 :
        « Sans savoir coder. Avec l'IA. »
  : à droite, un iPhone de trois-quarts, partiellement sorti du cadre à
    droite, affichant l'écran de l'app Rituel (liste d'habitudes cochées)

Contraintes :
  : aucun texte à moins de 40px du bord (les réseaux rognent)
  : lisible en vignette de 300px de large
  : pas d'animation, image statique
```

---

## 3 : Les icônes des sections de la landing

```
Crée un jeu de 8 icônes SVG cohérentes pour une landing de formation.

[COLLER LA CHARTE]

Style :
  : trait uniquement, épaisseur 1.5px, jamais de remplissage
  : bouts arrondis (stroke-linecap: round, stroke-linejoin: round)
  : grille de 24 × 24, avec 2px de marge de sécurité
  : currentColor, jamais de couleur codée en dur
  : géométriques et sobres, dans l'esprit de Lucide, pas illustratifs

Les 8 icônes :
  1. terminal      : une fenêtre avec un chevron et un curseur
  2. téléphone     : un smartphone simple, un rond en bas
  3. étincelle IA  : une étoile à 4 branches avec deux petites satellites
  4. base          : trois disques empilés
  5. palette       : un cercle avec trois points
  6. cloche        : notification, avec un petit point d'alerte
  7. carte         : carte bancaire avec une bande
  8. fusée         : publication, une fusée simple avec deux ailerons

Rends-les dans une page de démonstration qui les affiche à 24px, 32px et
48px, sur fond clair et sur fond sombre, pour vérifier la lisibilité.
Donne le code SVG de chacune, prêt à copier séparément.
```

---

## 4 : Les captures d'écran de l'App Store (module 9)

```
Crée un générateur de captures d'écran App Store, en HTML/CSS autonome.

[COLLER LA CHARTE]

Objectif : produire 5 visuels au format 1290 × 2796 (iPhone 6,9 pouces),
que je capturerai un par un.

Structure de chaque visuel :
  : fond : dégradé très doux et très subtil du papier #FBFAF8 vers #F4F2EE
  : en haut, sur 2 lignes maximum, un titre en Instrument Serif 92px,
    centré, encre #1A1917
  : en dessous, la capture d'écran de l'app dans un cadre d'iPhone réaliste
    mais épuré (cadre noir fin, coins arrondis, pas de reflet)
  : le téléphone est légèrement rogné en bas du cadre

Les 5 titres :
  1. « Trois habitudes. Pas quarante. »
  2. « Coche. C'est tout. »
  3. « Ta série, jour après jour. »
  4. « Tes données restent chez toi. »
  5. « Premium : illimité et synchronisé. »

Ajoute au-dessus un panneau de réglages qui me permet de :
  : remplacer chaque capture par une image que je dépose
  : modifier chaque titre
  : changer la couleur de fond
  : basculer entre le format iPhone 6,9″ et iPad 13″

Contraintes :
  : le titre doit rester lisible quand le visuel est réduit à 15 %
  : un bouton « Exporter en PNG » par visuel (html2canvas en ligne, sans CDN)
```

---

## 5 : Le diagramme du parcours (landing, section « Le retournement »)

```
Crée un diagramme animé montrant le parcours d'une idée jusqu'à l'App Store.

[COLLER LA CHARTE]

Un flux horizontal en 5 étapes, relié par une ligne fine #E8E4DC :

  Ton idée  →  Tu décris  →  L'IA écrit  →  Ça tourne  →  App Store

Chaque étape :
  : un cercle de 44px, bord 1px, fond blanc, avec un petit pictogramme trait
  : en dessous, le nom en Inter 600 14px
  : en dessous encore, une ligne de description en gris 12px

Animation au défilement (déclenchée par IntersectionObserver) :
  : la ligne se trace de gauche à droite en 1,2s
  : chaque cercle apparaît quand la ligne l'atteint : opacité 0 → 1,
    scale 0.8 → 1, 260ms
  : la dernière étape « App Store » se remplit en terracotta #C24A17
    avec une coche blanche

Contraintes :
  : passe en vertical sous 700px de large
  : respecte prefers-reduced-motion : tout visible d'emblée
  : SVG + CSS uniquement, pas de bibliothèque
```

---

## 6 : Le comparatif de prix (section tarifs)

```
Crée un visuel de comparaison de prix qui rend l'offre évidente.

[COLLER LA CHARTE]

Trois barres horizontales, alignées à gauche, avec le montant à droite :

  Agence de développement    ████████████████████████████  25 000 €
  Bootcamp certifiant        ████████                       7 000 €
  Capmedia Academy               ▌                                 97 €

  : les deux premières barres en gris #E8E4DC
  : la troisième, minuscule, en terracotta #C24A17
  : montants en Instrument Serif, chiffres tabulaires
  : les barres sont à l'échelle réelle : la troisième doit être
    visuellement dérisoire, c'est tout l'argument

Animation au défilement : les barres se remplissent de gauche à droite,
décalées de 150ms, en 900ms, avec une courbe cubic-bezier(.2,.8,.2,1).
Les montants comptent de 0 jusqu'à leur valeur pendant le remplissage.

En dessous, en gris 13px :
« Prix moyens constatés en France en 2026. Une agence facture entre 25 000
et 80 000 € une application de cette envergure. »

Contraintes : responsive, prefers-reduced-motion respecté, pas de dépendance.
```

---

## 7 : La grille des 11 motifs de rejet (module 9)

```
Crée une grille interactive des motifs de rejet de l'App Store.

[COLLER LA CHARTE]

11 cartes, en grille responsive (3 colonnes / 2 / 1).

Chaque carte :
  : fond blanc, bord 1px #E8E4DC, rayon 18px, padding 20px
  : en haut, une pastille avec le numéro de règle Apple en JetBrains Mono
    (ex. « 2.1 »), fond #FBEDE6, texte #C24A17
  : le titre du motif en Inter 600 15px
  : une ligne grise décrivant ce qui se passe
  : au clic, la carte se déplie et révèle : « La correction » et
    « La réponse à envoyer », avec un bouton « Copier la réponse »

Les 11 motifs :
  2.1  Compte de test manquant ou invalide
  3.1.1 Bouton « Restaurer les achats » absent
  5.1.1 Texte de permission insuffisant
  4.2  Contenu jugé minimal
  2.1  Bug ou plantage à la revue
  2.3.3 Captures d'écran non conformes
  4.8  Connexion tierce sans « Se connecter avec Apple »
  5.1.1(v) Suppression de compte impossible
  3.1.1 Lien de paiement externe
  2.3  Métadonnées trompeuses
  5.1.2 Déclaration de confidentialité incohérente

Animation de dépliage : hauteur automatique en 280ms, cubic-bezier(.2,.8,.2,1),
avec un léger fondu du contenu.

Contraintes : accessible au clavier, aria-expanded correct, sans bibliothèque.
```

---

## 8 : Le tableau de bord de progression (espace membre)

```
Crée un en-tête de tableau de bord pour un espace de formation en ligne.

[COLLER LA CHARTE]

Composition :
  : à gauche, en Instrument Serif 34px : « Bonjour [prénom] »
    puis en gris : « Module 4 sur 12 : tu es à la moitié. »
  : à droite, un anneau de progression circulaire de 88px :
      piste #E8E4DC épaisse de 6px, remplissage #2F7D52,
      pourcentage au centre en Inter 600 20px, chiffres tabulaires
  : en dessous, une frise horizontale de 14 pastilles (une par module) :
      module terminé     = disque plein vert avec une coche blanche
      module en cours    = anneau terracotta, légère pulsation
      module à venir     = disque vide bord gris
      module verrouillé  = disque vide avec un petit cadenas gris
  : les pastilles sont reliées par un trait fin qui se colore en vert
    jusqu'au dernier module terminé

Animation à l'arrivée sur la page :
  : l'anneau se remplit de 0 au pourcentage réel en 1s
  : le pourcentage compte en même temps
  : les pastilles apparaissent en cascade, 40ms de décalage

Contraintes : responsive (la frise défile horizontalement sur mobile),
fonctionne en clair et en sombre, prefers-reduced-motion respecté.
```

---

## 9 : L'icône de l'app Rituel (exemple du module 6)

```
Crée 6 propositions d'icône d'application mobile, en HTML/CSS/SVG, affichées
côte à côte pour comparaison.

Contraintes de l'exercice (celles d'une vraie icône iOS) :
  : carré 1024 × 1024, sans coins arrondis (iOS les arrondit lui-même)
  : sans transparence
  : un seul élément graphique, aucun texte sauf éventuellement une lettre
  : pas de dégradé complexe, pas d'ombre portée
  : fort contraste entre le symbole et le fond

Les 6 pistes, sur fond terracotta #C24A17 ou encre #14130F :
  1. la lettre « R » en Instrument Serif, blanche, centrée
  2. un cercle avec une coche à l'intérieur, trait épais blanc
  3. trois traits horizontaux de longueurs décroissantes, un coché
  4. une flamme géométrique très simplifiée (la série)
  5. un carré aux angles arrondis avec un point qui se répète 3 fois
  6. un soleil levant minimal : demi-disque et trois rayons

Affiche chaque proposition en trois tailles : 180px, 80px et 60px,
avec le masque arrondi iOS appliqué, sur un fond d'écran d'accueil simulé.
C'est à 60px que se joue la lisibilité : mets cette taille en évidence.

Donne le SVG de chacune, exportable en 1024×1024.
```

---

## 10 : Les vignettes de couverture des vidéos TikTok

```
Crée un générateur de vignettes pour des vidéos courtes verticales.

[COLLER LA CHARTE]

Format 1080 × 1920, avec une zone sûre : rien d'important dans les
250px du bas (interface TikTok) ni les 120px du haut.

Structure :
  : fond #14130F (encre)
  : un texte d'accroche en très gros, Instrument Serif blanc, 3 lignes
    maximum, centré verticalement dans le tiers supérieur
  : un mot clé de l'accroche surligné en terracotta #C24A17
  : en bas de la zone sûre, un petit bandeau : logo « C Capmedia Academy »
    en blanc, opacité 0.7

Génère 6 variantes avec ces accroches :
  1. « J'ai publié une app SANS SAVOIR CODER »
  2. « Apple m'a rejeté 3 FOIS. Voilà pourquoi. »
  3. « Ce que ton app te rapporte VRAIMENT sur 4,99 € »
  4. « 124 $. C'est tout ce qu'il faut. »
  5. « Personne ne te dit ÇA sur l'App Store »
  6. « 30 jours. Une app. Zéro ligne écrite à la main. »

Ajoute un panneau qui me laisse changer le texte, la couleur de fond,
et basculer entre fond sombre et fond papier.
Bouton « Exporter en PNG ».
```

---

## Ce que Claude Design ne fera pas

Ces éléments demandent des captures réelles, à faire toi-même :

- **Les captures d'écran d'App Store Connect** (modules 8, 9, 10) : l'interface
  d'Apple change tous les six mois ; il faut les refaire à chaque révision de la
  formation. Prends-les au fur et à mesure quand tu publies ta prochaine app.
- **La photo du formateur** : sur la landing, section « Qui te forme ».
- **Les icônes des apps de référence** (MindDrop, Qindil, Flowi, Isogonic) dans
  la bande de preuve.
- **Le code source de Rituel**, promis dans l'offre Complet : il faut construire
  l'app pour de vrai. C'est un livrable à part entière, à faire avant le premier
  euro encaissé sur l'offre Complet.
