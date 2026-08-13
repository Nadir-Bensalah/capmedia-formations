# Rapport de relecture froide · 13 août 2026

Relecture complète des 12 formations (138 modules, ~160 000 mots) par 6 relecteurs
indépendants en parallèle, chacun sur 2 formations, avec une grille stricte :
renvois internes vérifiés contre les frontmatter, renvois croisés vérifiés contre
les formations sœurs, chiffres et tableaux RECALCULÉS, exactitude technique du
code (règles Firestore/Storage, Stripe, ASO, n8n, iOS/Android), affirmations
légales, coquilles, interdits (tirets longs, émojis), liens.

**Toutes les corrections listées ci-dessous sont APPLIQUÉES et republiées.**

## Bilan chiffré

| Lot | Bloquants | Importants | Mineurs |
|---|---|---|---|
| github + prompting | 1 | 2 | 6 |
| claude-code + site-web-ia | 0 | 3 | 13 |
| firebase + stripe | 4 | 7 | 5 |
| aso + design-app | 1 | 6 | 11 |
| automatiser-ia + seo-contenu | 2 | 5 | 7 |
| micro-saas + mobile | 4 | 7 | 9 |
| **Total** | **12** | **30** | **51** |

Plus un défaut systémique trouvé au contrôle mécanique préalable : 6 liens
croisés entre formations pointaient vers la racine au lieu de /formations/
(404 depuis l'espace membre) : corrigés partout.

## Les corrections marquantes

**Probité commerciale (motif systémique, harmonisé sur les 12 formations)** :
plusieurs pages vendaient des études de cas « réelles » quand les bonus
eux-mêmes les déclarent « reconstituées et agrégées de cas réels ». Toutes les
mentions sont désormais honnêtes et cohérentes : « reconstituée de cas réels ».

**Code livré aux élèves (bloquants firebase)** : les règles Storage et le
patron 3 Firestore des fichiers « prêts à coller » évaluaient request.resource
sur les lectures/suppressions (où il n'existe pas) : le propriétaire ne pouvait
plus lire ni supprimer ses propres données. Corrigé (read/delete séparés des
create/update), avec l'explication pédagogique du piège ajoutée au module.

**Chaîne de livraison Stripe (bloquant)** : le webhook de référence du bonus
utilisait la clé de métadonnées `produit` quand les modules 2-3 enseignent
`formation` : la livraison de l'élève échouait en silence. Unifié.

**Erreurs factuelles corrigées** : la clé iOS NSUserNotificationsUsageDescription
n'existe pas (formation mobile, 2 occurrences dont un gabarit envoyé à Apple) ;
PowerToys ne fait pas de remplacement de texte (prompting) ; le gating de la
demande d'avis native est interdit par les stores (aso) ; Google Play plafonne à
8 captures ; App Store Connect n'a pas de rapport de termes de recherche ; n8n
est fair-code, pas open source (avec note licence pour l'hébergement client) ;
Inter n'est pas une police système (contrat zéro-ressource-externe réparé,
woff2 auto-hébergé) ; la redirection Formspree est payante (bascule sur l'envoi
AJAX) ; les test clocks Stripe ne s'attachent pas aux Payment Links ; le
déclencheur Auth onDelete n'existe pas en Functions v2 (bascule sur la fonction
appelable) ; Apple a un déploiement progressif, Google ne rétablit pas de
version antérieure ; /status → /usage (Claude Code) ; git worktree add -b ;
le testeur robots.txt de Google est retiré (rapport Search Console) ; les
résultats enrichis FAQ ne s'affichent quasiment plus.

**Arithmétique recalculée et corrigée** : l'étude de cas Stripe (7 214 € brut
impossible → 7 551 €, cascade réajustée) ; facteur gain/coût 8-20 → 7-12
(automatiser) ; 18→26 % de conversion incompatible avec 11→19 installations
(aso) ; couloir de prix 30-90 → 35-105 € (micro-saas) ; Firestore ~18 €/mois
pour 20 000 lectures/jour → 0 € (dans le palier gratuit, mobile) ; annuel
« 4 à 6 × » incohérent avec l'exemple 7 × (mobile) ; virement net 98,10 → 98,25.

**Cohérences internes réparées** : J+3 → J-3 (pré-rappel de relance), 9 h → 11 h
récupérées, seuils « presque » SEO alignés, fourchettes de requêtes ASO, seuils
de segments (micro-saas), renvois de modules obsolètes de la formation mobile
(reliques de renumérotation), promesses de modules non tenues (webhook module 5,
App Check au fil rouge, mode automatique au module 9) reformulées ou honorées,
exports du thème design-app unifiés, marqueur anti-invention harmonisé
([À VÉRIFIER]), accents restaurés dans les gabarits d'e-mails destinés au
copier-coller, cellules de tableaux orphelines nettoyées, titres de prompts
tronqués raccourcis, un visuel déplacé dans la bonne partie.

## Vérifié sans anomalie (le positif)

Zéro tiret long et zéro émoji sur les 138 modules ; la quasi-totalité des
renvois internes et croisés exacts ; les API et règles citées réelles (Stripe,
Firebase v2, GitHub, App Store/Play, RGPD/TVA présentés avec la prudence
requise) ; les grands tableaux d'études de cas justes après recalcul (hors
corrections ci-dessus) ; tous les gabarits cités en croisé existent.
