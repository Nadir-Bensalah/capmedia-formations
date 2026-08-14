# Jour J : 15 septembre (modèle Parcours)

Fin du tarif de lancement. Tout est préparé pour que la journée tienne en
quatre gestes. Les prix cibles vivent dans outils/prix-jour-j.json
(proposition : pack 297 vers 397, formations à part +30 %) : à VALIDER avant.

## Avant le jour J

- **J−7 à J−1** : vendre au tarif de lancement, publier les visuels
  (promo/exports/), rappeler la date du 15 dans chaque publication.
- **J−3** : envoyer l'e-mail « dernier appel » à la liste d'attente
  (texte plus bas). Console > Écrire > Liste d'attente > Cci.
- **J−1** : vérifier outils/prix-jour-j.json une dernière fois
  (règle absolue : jamais de baisse).

## Le 15 septembre au matin

1. `python3 outils/jour-j.py --sec` : relire le plan affiché.
2. `python3 outils/jour-j.py --go` : nouveaux liens Stripe réels, anciens
   désactivés, catalogues FR/EN, config.js, accueils et landings à jour.
3. `cd fonctions && firebase deploy --only functions --project capmedia-academy`
4. `git add -A && git commit -m "Jour J : fin du tarif de lancement" && git push`

Puis : visuels promo à re-générer avec les nouveaux prix (promo/*.html),
e-mail « c'est ouvert » à la liste d'attente, annonce sur les réseaux.

---

## E-mail J−3 : dernier appel (FR)

**Objet : Le tarif de lancement se termine dimanche soir**

Bonjour,

Tu t'es inscrit à la liste d'attente de Capmedia Academy : merci.

L'Academy est ouverte, et elle commence gratuitement : trois formations
complètes offertes (Git & GitHub, Prompting, Claude Code), sur simple
création de compte. La suite du parcours, jusqu'à ton application publiée
sur les stores, tient dans un seul pack.

Jusqu'au 15 septembre, ce pack est au tarif de lancement : 297 euros au
lieu de 397 après l'ouverture. Si tu comptais te lancer, c'est le bon
moment : https://academy.capmedia.app

Accès à vie, mises à jour comprises, garantie 14 jours.

Nadir
Capmedia Academy

## E-mail J−3 : dernier appel (EN)

**Objet : Launch pricing ends this Sunday**

Hi,

You joined the Capmedia Academy waitlist: thank you.

The Academy is open, and it starts free: three full courses (Git & GitHub,
Prompting, Claude Code) with a simple account. The rest of the path, all
the way to your app published on the stores, fits in one pack.

Until September 15 the pack is at launch pricing: 297 euros instead of
397 after opening. If you were planning to start, now is the moment:
https://academy.capmedia.app/en/

Lifetime access, updates included, 14-day guarantee.

Nadir
Capmedia Academy

## E-mail jour J : ouverture officielle (FR)

**Objet : Capmedia Academy est officiellement lancée**

Bonjour,

Ça y est : Capmedia Academy est officiellement lancée.

Un parcours en huit étapes pour devenir développeur d'applications
mobiles, de la première ligne de code au bouton « Disponible sur
l'App Store ». Les trois premières formations sont offertes : tu juges
sur pièces, tu continues si ça te plaît.

Accès à vie, mises à jour comprises, garantie 14 jours sur le payant.
Tout est ici : https://academy.capmedia.app

Bienvenue.

Nadir
Capmedia Academy

## E-mail jour J : ouverture officielle (EN)

**Objet : Capmedia Academy is officially live**

Hi,

It's official: Capmedia Academy is live.

An eight-step path to become a mobile app developer, from your first line
of code to the App Store "Available" button. The first three courses are
free: judge the teaching on the evidence, continue if you like it.

Lifetime access, updates included, 14-day guarantee on paid content.
Everything is here: https://academy.capmedia.app/en/

Welcome.

Nadir
Capmedia Academy
