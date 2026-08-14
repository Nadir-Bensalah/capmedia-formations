> **NOTE (14 août) : le site est passé au modèle Parcours** (3 formations
> offertes, pack unique 297 €, 4 formations à part). Ce kit datait du modèle
> précédent : le script outils/jour-j.py et outils/prix-jour-j.json sont à
> REFONDRE avant usage. La logique du jour J reste bonne (fin du tarif de
> lancement le 15 septembre : hausse du pack, par exemple 297 vers 397, et
> des formations à part, à décider). Les e-mails ci-dessous restent valables
> dans l'esprit : remplacer les exemples de prix par ceux du pack.

# Jour J : 15 septembre

Fin du tarif de lancement. Tout est préparé pour que la journée tienne en
quatre gestes. Aucune improvisation.

## Avant le jour J

- **J−7 à J−1** : vendre au tarif de lancement, publier les visuels
  (promo/exports/), rappeler la date du 15 dans chaque publication.
- **J−3** : envoyer l'e-mail « dernier appel » à la liste d'attente
  (texte plus bas). Console > Écrire > Liste d'attente > Cci.
- **J−1** : vérifier `outils/prix-jour-j.json` une dernière fois
  (règle absolue : jamais de baisse, élasticité −0,14).

## Le 15 septembre au matin

1. `python3 outils/jour-j.py --sec` : relire le plan affiché.
2. `python3 outils/jour-j.py --go` : nouveaux liens Stripe réels créés,
   anciens désactivés, catalogue FR/EN, config.js, accueils et landings
   mis à jour d'un coup.
3. `cd fonctions && firebase deploy --only functions --project capmedia-academy`
   : le serveur vend aux nouveaux prix (checkout connecté et prorata).
4. `git add -A && git commit -m "Jour J : fin du tarif de lancement" && git push`
   : le site part en ligne tout seul (GitHub Actions vers Hostinger).

Puis :

5. Mettre à jour les prix des visuels promo (`promo/*.html`, 97/197 → nouveaux
   prix mobile) et régénérer les PNG :
   `npx playwright screenshot ...` (commandes dans promo/).
6. Envoyer l'e-mail « c'est ouvert » à la liste d'attente (texte plus bas).
7. Publier l'annonce sur les réseaux avec les visuels à jour.

## Vérifications de fin de journée

- Un achat anonyme sur une landing va bien vers un lien au NOUVEAU prix.
- Console > Ventes > Réel : les paiements du jour s'affichent.
- Un compte connecté voit toujours ses formations et le prorata correct.

---

## E-mail J−3 : dernier appel (FR)

**Objet : Le tarif de lancement se termine dimanche soir**

Bonjour,

Tu t'es inscrit à la liste d'attente de Capmedia Academy : merci.

L'Academy est déjà ouverte, et jusqu'au 15 septembre les formations sont
au tarif de lancement. À partir du 15, les prix montent définitivement.

Concrètement : la formation principale, De Zéro à l'App Store, passe de
97 € à 127 € (Essentiel) et de 197 € à 247 € (Complet). Même logique sur
les onze autres formations et les packs.

Si tu comptais te lancer, c'est le bon moment :
https://academy.capmedia.app

Accès à vie, mises à jour comprises, garantie 14 jours.

Nadir
Capmedia Academy

## E-mail J−3 : dernier appel (EN)

**Objet : Launch pricing ends this Sunday**

Hi,

You joined the Capmedia Academy waitlist: thank you.

The Academy is already open, and until September 15 every course is at
launch pricing. From the 15th, prices go up for good.

In practice: the flagship course, From Zero to the App Store, moves from
€97 to €127 (Essential) and from €197 to €247 (Complete). Same logic on
the eleven other courses and the packs.

If you were planning to start, now is the moment:
https://academy.capmedia.app/en/

Lifetime access, updates included, 14-day guarantee.

Nadir
Capmedia Academy

## E-mail jour J : ouverture officielle (FR)

**Objet : Capmedia Academy est officiellement lancée**

Bonjour,

Ça y est : Capmedia Academy est officiellement lancée.

Douze formations complètes, en français et en anglais, pour construire,
publier et vendre de vraies applications : de la première ligne de code
à l'App Store, en passant par Firebase, Stripe, l'ASO et le design.

Chaque formation : accès à vie, mises à jour comprises, garantie
14 jours. Le détail et les programmes complets sont ici :
https://academy.capmedia.app

Bienvenue.

Nadir
Capmedia Academy

## E-mail jour J : ouverture officielle (EN)

**Objet : Capmedia Academy is officially live**

Hi,

It's official: Capmedia Academy is live.

Twelve complete courses, in French and in English, to build, ship and
sell real applications: from the first line of code to the App Store,
through Firebase, Stripe, ASO and design.

Every course: lifetime access, updates included, 14-day guarantee.
Full programs here:
https://academy.capmedia.app/en/

Welcome.

Nadir
Capmedia Academy
