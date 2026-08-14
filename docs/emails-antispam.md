# Sortir les e-mails de connexion des spams (DKIM, SPF, domaine dédié)

Les liens magiques partent aujourd'hui de `noreply@capmedia-academy.firebaseapp.com` :
c'est ce qui les envoie en indésirables. La solution : un domaine d'envoi
personnalisé, signé DKIM. Deux gestes chez Firebase, deux chez Hostinger.

## 1. Côté Firebase (5 minutes)

1. Console Firebase > projet **capmedia-academy** > **Authentication** >
   **Templates** (Modèles) > crayon en haut > **Personnaliser le domaine**.
2. Saisis : `auth.capmedia.app` (sous-domaine dédié à l'envoi, recommandé).
3. Firebase affiche alors des **enregistrements DNS à créer** (généralement :
   2 TXT de vérification/SPF et 2 CNAME DKIM). Garde l'onglet ouvert.

## 2. Côté Hostinger (5 minutes)

hPanel > **Domaines** > capmedia.app > **DNS / Serveurs de noms** > ajoute
exactement les enregistrements affichés par Firebase (types, noms et
valeurs tels quels). Attention : chez Hostinger, le « nom » se saisit sans
le domaine final (`auth` et pas `auth.capmedia.app.`).

## 3. Retour Firebase

Clique **Vérifier** : la propagation prend de quelques minutes à quelques
heures. Une fois vérifié, les e-mails partent de `noreply@auth.capmedia.app`,
signés DKIM, alignés SPF : la délivrabilité change de catégorie.

## 4. Vérification finale

- Demande un lien magique vers une adresse Gmail ET une adresse Outlook.
- Le message doit arriver en boîte principale ; ouvre « Afficher l'original »
  dans Gmail : `SPF: PASS`, `DKIM: PASS` doivent apparaître.

Note : le texte des e-mails (objet, corps) se personnalise au même endroit
(Authentication > Templates). Les modèles suivent la langue posée par
`auth.languageCode` : français depuis /acces.html, anglais depuis /en/acces.html.
