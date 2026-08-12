# Prompt Claude Design — Charte + mockups Capmedia Academy

**Mode d'emploi.** Cinq passes, dans l'ordre. La passe 0 produit la charte et
le fichier `tokens.css`. Les passes suivantes **recollent le bloc TOKENS** en
tête de prompt — c'est ce qui garantit la cohérence entre des générations
faites à des moments différents.

Ne lance pas les 5 d'un coup. Valide la passe 0 avant tout le reste.

---
---

# PASSE 0 — La charte graphique

> Produit : une page de styleguide vivante + un fichier `tokens.css`.
> C'est la référence de tout le reste.

```
Tu conçois la charte graphique complète d'« Capmedia Academy », une école en
ligne francophone qui vend des formations pour créer et publier des
applications mobiles. Première formation : « De Zéro à l'App Store ».

═══════════════════════════════════════════════════════════════════
LA RÉFÉRENCE ESTHÉTIQUE, PRÉCISÉMENT
═══════════════════════════════════════════════════════════════════

La référence est NOTION. Pas « inspiré de Notion » : Notion.

Et il y a DEUX Notion, ne les confonds pas :

  A. L'APPLICATION Notion (notion.so une fois connecté)
     → c'est la référence pour l'ESPACE MEMBRE (la lecture des cours)
     → un document. Barre latérale gris chaud, colonne de texte étroite,
       aucune bordure décorative, hiérarchie portée uniquement par la
       taille du texte et l'espace vertical.

  B. Le SITE MARKETING de Notion (notion.so déconnecté)
     → c'est la référence pour la LANDING
     → immense blanc, typographie très grande et très serrée, captures
       de produit posées à plat, presque aucune couleur, aucune ombre
       portée, aucun dégradé.

═══════════════════════════════════════════════════════════════════
CE QUE TU NE FAIS SOUS AUCUN PRÉTEXTE
═══════════════════════════════════════════════════════════════════

Une version précédente de ce site a échoué exactement sur ces points.
Chacun de ces éléments est une erreur, pas une préférence :

  ✗ Police à empattements (serif) pour les titres. Notion n'en utilise
    pas. Tout est en sans-serif géométrique neutre.
  ✗ Rayons de bordure supérieurs à 8px. Notion utilise 3, 4 et 6px.
    Une carte à 18px de rayon ne ressemble pas à Notion, elle ressemble
    à un template Bootstrap de 2021.
  ✗ Couleur d'accent saturée et chaude (terracotta, orange brûlé…).
    Les accents Notion sont soit un bleu franc et froid pour l'action,
    soit des pastels très désaturés pour les fonds d'encadrés.
  ✗ Ombres portées visibles. Notion n'en met QUE sur les éléments qui
    flottent réellement (menu, popover, modale). Jamais sur une carte
    posée dans la page.
  ✗ Bordures 1px partout pour délimiter les blocs. Notion sépare par
    l'ESPACE, pas par des traits. Un trait est un dernier recours.
  ✗ Sections à fond alterné (blanc / gris / noir / gris). Ça fait
    « page de vente 2018 ». Notion garde un fond quasi constant et
    laisse l'espace faire les séparations.
  ✗ Cartes avec bordure + fond blanc + ombre + rayon. C'est le combo
    qui tue l'esthétique document.
  ✗ Emoji en icône d'interface. Uniquement dans les encadrés de contenu.
  ✗ Dégradés, glassmorphism, effets de flou décoratifs, néon.

═══════════════════════════════════════════════════════════════════
LES JETONS À PRODUIRE
═══════════════════════════════════════════════════════════════════

Pars de ces valeurs. Tu peux les affiner, pas changer leur logique.
Les gris sont CHAUDS (teinte brune, jamais bleutée) — c'est la
signature de Notion et c'est ce qui rend la page « papier ».

COULEURS — clair
  --bg              #FFFFFF     fond de page
  --bg-2            #F7F7F5     barre latérale, zones creuses
  --bg-3            #F1F1EF     survol de bloc, code en ligne
  --texte           #37352F     texte principal (brun-gris, PAS #000)
  --texte-2         #787774     texte secondaire
  --texte-3         #9B9A97     texte tertiaire, légendes
  --trait           rgba(55,53,47,0.09)   séparateur (très faible)
  --trait-fort      rgba(55,53,47,0.16)   bordure de champ
  --survol          rgba(55,53,47,0.06)   fond au survol
  --action          #2383E2     bleu d'action (froid, franc)
  --action-survol   #1A6DBE

  Fonds d'encadré, tous très désaturés :
  --voile-jaune     #FBF3DB     --voile-bleu      #DDEBF1
  --voile-orange    #FAEBDD     --voile-vert      #DDEDEA
  --voile-rouge     #FDEBEC     --voile-gris      #F1F1EF

  Texte sur voile : toujours --texte, jamais une couleur vive.

COULEURS — sombre (obligatoire, pas optionnel)
  --bg #191919 · --bg-2 #202020 · --bg-3 #2C2C2C
  --texte #E9E9E7 · --texte-2 #9B9B9B · --texte-3 #6F6F6F
  --trait rgba(255,255,255,0.094) · --survol rgba(255,255,255,0.055)
  --action #4A9EE8
  Voiles sombres : jaune #372E20 · orange #3A2A1D · vert #1F2E28
                   bleu #1E2A33 · rouge #372A2A · gris #2C2C2C

TYPOGRAPHIE
  Une seule famille : Inter (ou la pile système ui-sans-serif).
  AUCUNE serif. AUCUNE police d'affichage décorative.

  Échelle marketing (landing) :
    display  clamp(40px, 6vw, 72px) / poids 700 / interlettrage -0.03em
             / interligne 1.05
    h1       clamp(32px, 4vw, 48px) / 700 / -0.025em / 1.12
    h2       clamp(24px, 3vw, 32px) / 600 / -0.02em  / 1.2
    lead     19px / 400 / 1.55 / couleur --texte-2
    corps    16px / 400 / 1.6

  Échelle application (lecture de cours) :
    titre de page  40px / 700 / -0.025em / 1.15
    h2             24px / 600 / -0.015em / 1.3   marge haute 40px
    h3             19px / 600 / -0.01em  / 1.35  marge haute 28px
    corps          16px / 400 / 1.65
    petit          14px / 400 / 1.5
    micro          12px / 500 / 1.4

  Les grands titres marketing sont TRÈS serrés (-0.03em) et TRÈS gras
  (700). C'est ce qui fait le rendu Notion marketing. Un titre à 400
  avec un interlettrage nul rate complètement l'effet.

ESPACE — échelle de 4
  4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
  Colonne de lecture : 708px de large (la largeur exacte de Notion).
  Conteneur marketing : 1120px.
  Marge latérale mobile : 24px.
  Rythme vertical entre blocs de contenu : 12px. Entre sections : 96px.

RAYONS
  3px  éléments en ligne (code, étiquettes, pastilles)
  4px  boutons, champs, encadrés
  6px  cartes, modales
  Rien au-dessus de 8px, sauf les avatars et pastilles rondes (999px).

OMBRES — seulement pour ce qui flotte
  --ombre-flottant  0 0 0 1px rgba(15,15,15,0.05),
                    0 3px 6px rgba(15,15,15,0.1),
                    0 9px 24px rgba(15,15,15,0.2)
  Aucune ombre ailleurs. Une carte dans le flux n'a pas d'ombre.

MOUVEMENT
  Survol : 20ms ease-in. Apparition : 200ms cubic-bezier(.2,.8,.2,1).
  Rien au-dessus de 300ms. prefers-reduced-motion respecté partout.

═══════════════════════════════════════════════════════════════════
LES COMPOSANTS À DÉFINIR
═══════════════════════════════════════════════════════════════════

Pour chacun : état par défaut, survol, actif, focus clavier, désactivé.

 1. Bouton principal — fond --action, texte blanc, 4px, 14px/600,
    padding 8px 14px. Survol : --action-survol. Pas d'ombre, pas de
    translation verticale.
 2. Bouton secondaire — fond transparent, bordure --trait-fort.
 3. Bouton fantôme — juste du texte, fond --survol au survol. C'est le
    bouton le plus utilisé dans une interface Notion.
 4. Bouton marketing large — 16px/600, padding 12px 24px. Sur la
    landing uniquement.
 5. Champ de saisie — bordure --trait-fort, 4px, focus : bordure
    --action + anneau 3px --action à 20% d'opacité.
 6. Encadré de contenu (callout) — fond voile, rayon 4px, padding
    16px, un emoji à gauche aligné sur la première ligne, aucune
    bordure. Cinq variantes : note, astuce, attention, piège, action.
 7. Bloc de code — fond --bg-3 en clair / #2C2C2C en sombre, rayon 4px,
    police mono 13.5px, bouton « Copier » qui n'apparaît qu'au survol
    en haut à droite.
 8. Code en ligne — fond --bg-3, rayon 3px, padding 2px 5px, couleur
    #EB5757, police mono 0.9em.
 9. Ligne de barre latérale — hauteur 28px, padding 4px 8px, rayon 3px,
    14px, --texte-2. Survol : fond --survol. Actif : fond --bg-3 +
    --texte + poids 600.
10. Séparateur — 1px --trait, marges 24px. Rare.
11. Tableau — pas de bordure extérieure, uniquement des lignes
    horizontales --trait. En-tête 12px/600 majuscules --texte-3.
12. Anneau de progression et barre de progression.
13. Pastille d'état — terminé (coche), en cours, à venir, verrouillé.
14. Accordéon — chevron 12px qui pivote de 90°, ligne --trait en bas,
    ouverture par hauteur automatique en 200ms.
15. Barre de navigation marketing — hauteur 56px, fond blanc,
    aucune bordure tant qu'on n'a pas défilé, --trait 1px après.

═══════════════════════════════════════════════════════════════════
CE QUE TU ME RENDS
═══════════════════════════════════════════════════════════════════

Une page HTML autonome (aucune dépendance, aucun CDN) contenant :

  1. En haut, un sélecteur clair / sombre qui fonctionne réellement,
     et qui respecte aussi prefers-color-scheme.
  2. La palette : chaque jeton en pastille avec son nom, sa valeur hex
     et le ratio de contraste calculé sur son fond. Signale en rouge
     tout ce qui passe sous 4,5:1.
  3. L'échelle typographique complète, marketing et application, avec
     un exemple de phrase française réelle pour chaque niveau
     (pas de lorem ipsum, jamais).
  4. L'échelle d'espacement, visualisée par des barres.
  5. Les 15 composants, chacun dans tous ses états, côte à côte,
     en clair ET en sombre.
  6. Trois compositions de démonstration pour prouver que le système
     tient : un en-tête de section marketing, un extrait de page de
     cours, une ligne de barre latérale dans ses trois états.
  7. Un bloc <pre> final contenant `tokens.css` complet, prêt à copier :
     :root { … } puis @media (prefers-color-scheme: dark) { … } puis
     [data-theme="dark"] { … }

Tout le texte de démonstration est en FRANÇAIS et parle réellement
d'applications mobiles, d'App Store, de code. Jamais de lorem ipsum.
```

---
---

# BLOC TOKENS — à recoller en tête des passes 1 à 4

> Une fois la passe 0 validée, remplace ce bloc par le `tokens.css` réel
> qu'elle a produit. Tant que ce n'est pas fait, colle ceci.

```
CHARTE CAPMEDIA ACADEMY — respecter à la lettre

Référence : Notion. Sans-serif uniquement, gris CHAUDS, rayons 3-6px,
aucune ombre sauf éléments flottants, séparation par l'espace et non
par des traits, fond quasi constant (pas de sections alternées).

INTERDIT : serif · rayon > 8px · accent saturé chaud · ombre sur carte
dans le flux · bordure 1px systématique · dégradé · lorem ipsum.

--bg #FFFFFF · --bg-2 #F7F7F5 · --bg-3 #F1F1EF
--texte #37352F · --texte-2 #787774 · --texte-3 #9B9A97
--trait rgba(55,53,47,.09) · --trait-fort rgba(55,53,47,.16)
--survol rgba(55,53,47,.06) · --action #2383E2
voiles : jaune #FBF3DB · orange #FAEBDD · vert #DDEDEA
         bleu #DDEBF1 · rouge #FDEBEC · gris #F1F1EF

Sombre : --bg #191919 · --bg-2 #202020 · --bg-3 #2C2C2C
--texte #E9E9E7 · --texte-2 #9B9B9B · --texte-3 #6F6F6F
--trait rgba(255,255,255,.094) · --survol rgba(255,255,255,.055)
--action #4A9EE8

Inter uniquement. Marketing : display clamp(40px,6vw,72px)/700/-0.03em.
Application : titre 40/700, h2 24/600, corps 16/1.65, colonne 708px.
Espace : 4 8 12 16 24 32 48 64 96 128. Rayons : 3 / 4 / 6.
Ombre uniquement si l'élément flotte.
Clair ET sombre obligatoires. prefers-reduced-motion respecté.
Tout le texte en français, jamais de lorem ipsum.
```

---
---

# PASSE 1 — La landing, section par section

```
[COLLER LE BLOC TOKENS]

Conçois la page de vente complète d'« Capmedia Academy — De Zéro à l'App
Store », en HTML/CSS autonome, esthétique du SITE MARKETING de Notion.

Ce qu'on vend : une formation en ligne écrite, en français, qui emmène
un débutant total de « je n'ai jamais codé » à « mon application est
publiée sur l'App Store et Google Play ». On construit l'IA avec, on
publie pour de vrai. 12 modules + 2 bonus.

Positionnement, à faire ressentir sans jamais le sur-expliquer :
« Les autres t'apprennent à coder. Moi je t'apprends à publier. »
Le code n'est plus le mur — le mur, ce sont les certificats, les
rejets d'Apple, les captures d'écran, l'ASO.

Offres : Essentiel 97 € (barré 197) · Complet 197 € (barré 397).
Garantie 30 jours. Paiement Stripe.

─── LES 13 SECTIONS, DANS L'ORDRE ───

 1. Barre de navigation — 56px, logo « C Capmedia Academy » (carré noir
    rayon 4px + lettre), 4 liens, « Se connecter », bouton d'action.
    Aucune bordure avant défilement.

 2. HÉROS — c'est 60 % de l'impression. Immense blanc au-dessus.
    Titre sur 3 lignes, display, très serré, très gras :
      « Ton application mobile
        en ligne sur l'App Store
        dans 30 jours. »
    Sous-titre lead sur 2 lignes maximum.
    Deux boutons. Sous eux, une micro-ligne de réassurance.
    À droite ou en dessous : une capture de produit posée à plat,
    sans cadre de téléphone tape-à-l'œil, sans ombre portée forte.

 3. Bande de preuve — « Formation écrite par un développeur qui a
    réellement publié » + 4 noms d'apps en texte gris.
    Très discret, une ligne, aucune bordure.

 4. LE PROBLÈME — colonne de texte étroite, ton direct.
    « Tu as une idée d'application depuis combien de temps ? »
    Agence 25 000 € · bootcamp 7 000 € · la vidéo YouTube fermée au
    bout de 4 minutes · le no-code qui bloque à la publication.
    Se termine sur une phrase isolée, plus grande, qui pique.

 5. CE QUI A CHANGÉ — 3 étapes : tu décris / l'IA écrit / ça tourne
    sur ton téléphone en 15 secondes.

 6. LE PIVOT — la section qui vend.
    « Faire tourner une app, c'est 20 % du travail. »
    À droite, une liste de 10 obstacles réels de publication.
    C'est le moment le plus fort de la page : donne-lui du poids.

 7. CE QUE TU CONSTRUIS — le projet fil rouge « Rituel », une app de
    suivi d'habitudes. 4 blocs : des écrans / des données qui restent /
    des notifications / un vrai paiement.

 8. LE PROGRAMME — accordéon de 12 modules. Numéro en mono, titre,
    chevron. Ouvert : 4 à 8 puces. Un seul ouvert à la fois.

 9. POUR QUI / PAS POUR QUI — deux colonnes, coches et croix.

10. PARLONS ARGENT — la section d'honnêteté, qui convertit mieux que
    la promesse creuse. Décomposition de 4,99 € : −TVA 20 % −commission
    Apple 15 % = 3,54 € net. Donc 2 000 €/mois = 565 abonnés.
    Puis 3 chiffres : 3-12 mois · 1 app sur 5 dépasse 100 €/mois · 124 $.
    Termine sur : « Toute personne qui te promet un revenu garanti te ment. »
    Traite ça comme un tableau de document, pas comme une infographie.

11. LE FORMATEUR — photo, nom, 3 paragraphes à la première personne.

12. TARIFS — deux offres côte à côte, la seconde marquée « Le plus
    pris ». Prix en très gros, ancien prix barré à côté. Liste de
    contenus. Puis le bloc de garantie 30 jours.

13. FAQ (10 questions, accordéon) → appel final → pied de page.

─── EXIGENCES ───

• Chaque section commence par une étiquette majuscule 12px --texte-3.
• Les sections sont séparées par 96 à 128px de vide, PAS par des fonds
  de couleur différents ni des traits.
• Au maximum DEUX moments dans toute la page ont un fond différent du
  blanc, et ce sont des fonds --bg-2, pas du noir.
• Aucune carte n'a à la fois bordure + ombre + rayon important.
• Les prix utilisent des chiffres tabulaires.
• Barre collante mobile avec le prix et un bouton, qui apparaît après
  le héros et disparaît sur la section tarifs.
• Un compte à rebours discret pour le tarif de lancement : une ligne
  de texte, pas un bandeau rouge clignotant.
• Animations d'apparition au défilement : opacité + 12px de remontée,
  200ms, décalage de 60ms entre éléments frères. Rien de plus.
• Mobile d'abord. Vérifie qu'aucune section ne déborde à 375px.
• Clair et sombre.

Écris tout le texte français en entier, définitif, prêt à publier.
Pas de « [votre texte ici] », pas de lorem ipsum.
```

---
---

# PASSE 2 — L'espace membre (lecture des cours)

```
[COLLER LE BLOC TOKENS]

Conçois l'espace membre d'Capmedia Academy : l'interface où l'élève lit sa
formation. Esthétique de l'APPLICATION Notion, pas du site marketing.
HTML/CSS/JS autonome.

─── STRUCTURE ───

Barre latérale gauche, 292px, fond --bg-2, collante, pleine hauteur :
  • en haut : logo + nom
  • bloc de progression : « Ta progression · 4/14 » + barre fine
  • liste des 14 modules : numéro en mono 12px, titre 14px, sur une ou
    deux lignes. Trois états : terminé (coche verte à la place du
    numéro) · actif (fond --bg-3, texte plein, gras) · à venir.
    Les 2 modules bonus portent une pastille « Complet » discrète, et
    un cadenas si l'élève n'a que l'offre Essentiel.
  • en bas : e-mail de l'élève en 12px --texte-3 + « Se déconnecter »

Colonne de lecture, 708px, centrée, 96px de padding haut :
  • fil d'ariane : « MODULE 04 » en mono 12px majuscules --texte-3
  • titre de page 40px/700
  • résumé 18px --texte-2
  • durée de lecture 13px --texte-3
  • un séparateur --trait, puis le corps du cours
  • en bas : bloc « Marquer comme terminé », puis deux cartes de
    pagination précédent / suivant

─── LES ÉCRANS À PRODUIRE ───

Fais-les tous, empilés dans la même page, séparés par une étiquette :

 1. Lecture normale — un module réel affiché en entier, avec au moins :
    2 h2, 1 h3, du corps, une liste à puces, une liste numérotée, un
    tableau à 3 colonnes, un bloc de code avec bouton Copier, du code
    en ligne, une citation, et LES CINQ types d'encadré :
      📄 note · 💡 astuce · ⚠️ attention · 🛑 piège · 👉 action
 2. Chargement — squelette de la colonne, pas de roue qui tourne
 3. Module verrouillé — offre Essentiel devant un bonus Complet
 4. Erreur de chargement
 5. « Aucun achat trouvé » — connecté mais pas acheteur
 6. Accueil de la formation — anneau de progression, « reprendre où
    tu t'es arrêté », frise des 14 modules en pastilles
 7. Mobile : barre supérieure + sommaire en tiroir, avec le voile
 8. Sombre : au moins la lecture normale et l'accueil

─── EXIGENCES ───

• La colonne de lecture fait EXACTEMENT 708px. C'est ce chiffre qui
  produit la sensation Notion.
• Les h2 ont 40px de marge haute et 8px de marge basse. Cet écart
  asymétrique est essentiel : c'est lui qui crée le rythme du document.
• Les encadrés n'ont AUCUNE bordure. Fond voile, rayon 4px, emoji à
  gauche aligné sur la première ligne de texte.
• Aucune carte dans la colonne de lecture n'a d'ombre.
• Le bouton « Copier » d'un bloc de code est invisible et n'apparaît
  qu'au survol du bloc, en haut à droite.
• Navigation au clavier : flèches gauche/droite entre modules, Échap
  ferme le tiroir mobile. Focus visible partout.
• Le contenu de démonstration est un VRAI extrait de cours en français
  sur la publication d'une app iOS. Écris-le. Jamais de lorem ipsum.
```

---
---

# PASSE 3 — Connexion, confirmation, pages légales

```
[COLLER LE BLOC TOKENS]

Conçois les pages transactionnelles d'Capmedia Academy. Sobres, centrées,
une seule colonne de 420px. HTML/CSS autonome.

─── PAGE « ACCÈS » — connexion par lien magique, sans mot de passe ───
Cinq états, tous à produire, empilés et étiquetés :
 1. Formulaire — logo, titre « Ton espace de formation », explication
    en une phrase, champ e-mail, bouton pleine largeur, micro-mention
    « le lien est valable 1 heure »
 2. Envoi en cours — bouton en attente
 3. Lien envoyé — message vert désaturé, l'adresse rappelée en gras,
    mention des indésirables, lien « renvoyer » après 30 secondes
 4. Vérification du lien à l'arrivée — état de chargement
 5. Erreur — lien expiré / trop de tentatives / domaine non autorisé

─── PAGE « MERCI » — après paiement Stripe ───
Une coche verte animée une seule fois (200ms, jamais en boucle).
« Paiement confirmé. Bienvenue chez Capmedia Academy. »
Trois étapes numérotées pour entrer dans la formation.
Un bouton principal. Un encadré astuce avec un conseil de démarrage.
Mentions : garantie 30 jours, contact.

─── PAGES LÉGALES — mentions et CGV ───
Un gabarit de page de document : colonne 708px, h2 24px, corps 16px,
sommaire ancré à gauche en position collante sur grand écran.
Remplis avec un contenu français réaliste pour un vendeur de formation
en ligne en France (droit de rétractation de 14 jours et son exception
pour le contenu numérique fourni immédiatement, garantie commerciale
de 30 jours, médiation à la consommation, TVA, propriété
intellectuelle, licence d'usage strictement personnelle).

Clair et sombre. Mobile vérifié à 375px.
```

---
---

# PASSE 4 — Le dossier de présentation des maquettes

```
[COLLER LE BLOC TOKENS]

Assemble un dossier de présentation qui montre tout le produit d'un
seul coup d'œil. Page HTML autonome, à faire défiler.

Structure :
 1. Couverture — « Capmedia Academy · Système de design », la date,
    un aperçu de la palette sur une ligne
 2. Les principes, en 5 lignes maximum
 3. La palette et la typographie, en résumé
 4. Chaque écran, présenté ainsi :
      • titre de l'écran + une phrase de rôle
      • la maquette, en cadre navigateur épuré pour le bureau,
        en cadre téléphone épuré pour le mobile
      • trois puces de décisions de conception
 5. Les écrans : landing (héros, pivot, tarifs), espace membre
    (lecture, accueil, verrouillé, mobile), accès (les 5 états),
    merci, légal
 6. Une planche récapitulative des composants
 7. Une dernière page : ce qui reste à produire (photo du formateur,
    captures d'App Store Connect, icônes des apps)

Exigences :
 • Chaque maquette est affichée en clair ET en sombre, côte à côte
 • Un sélecteur global clair/sombre en haut
 • Une navigation collante à gauche pour sauter d'un écran à l'autre
 • Tout est cliquable et à taille réelle, ce ne sont pas des images
 • Un bouton « Exporter cette maquette en PNG » sous chacune
```

---
---

## Ordre de travail conseillé

1. **Passe 0**, et on itère jusqu'à ce que la charte soit juste. Ne passe
   pas à la suite avant — tout le reste en dépend.
2. Récupère le `tokens.css` produit, remplace le BLOC TOKENS de ce fichier.
3. **Passe 1** (landing). C'est celle qui rapporte de l'argent.
4. **Passe 2** (espace membre).
5. **Passes 3 et 4** quand le reste est validé.

## Si un rendu ne va toujours pas

Ne dis pas « c'est pas terrible ». Renvoie une correction chirurgicale :

> Trois corrections :
> 1. Les rayons sont à 12px, ils doivent être à 4px. Notion n'arrondit presque pas.
> 2. La section tarifs a un fond noir. Supprime-le, garde le blanc, sépare par 96px de vide.
> 3. Le titre du héros est à 500 avec un interlettrage nul. Passe-le à 700 / -0.03em.
> Le reste ne bouge pas.

Une correction nommée avec sa valeur cible corrige du premier coup. Un
jugement global fait repartir dans une autre mauvaise direction.
