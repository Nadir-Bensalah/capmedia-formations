/* ==========================================================================
   CAPMEDIA ACADEMY — Webhook Stripe (Firebase Cloud Functions, 2e génération)

   Rôle : quand un paiement réussit, écrire un document acheteurs/{email}
   dans Firestore. C'est ce document, et lui seul, qui ouvre l'accès à la
   formation (voir firestore.rules).

   Déployer :
     cd fonctions && npm install
     firebase functions:secrets:set STRIPE_SECRET
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
     firebase deploy --only functions

   Puis copie l'URL affichée dans Stripe → Développeurs → Webhooks,
   en écoutant l'événement « checkout.session.completed ».
   ========================================================================== */

const { onRequest }   = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');

initializeApp();
const bdd = getFirestore();

const STRIPE_SECRET         = defineSecret('STRIPE_SECRET');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

/* --- Quel montant correspond à quelle offre ------------------------------
   Stripe renvoie des centimes. On se base sur le montant plutôt que sur
   l'identifiant du produit : ça continue de marcher si tu changes de
   Payment Link. Ajuste ces seuils si tu changes tes prix.
   ------------------------------------------------------------------------ */
function offrePourMontant(centimes) {
  return centimes >= 15000 ? 'complet' : 'essentiel';
}

exports.stripeWebhook = onRequest(
  {
    region: 'europe-west1',
    secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const stripe = new Stripe(STRIPE_SECRET.value());
    let evenement;

    // 1. Vérifier la signature — sans ça, n'importe qui peut s'offrir
    //    la formation en appelant cette URL.
    try {
      evenement = stripe.webhooks.constructEvent(
        req.rawBody,                       // le corps BRUT, jamais req.body
        req.headers['stripe-signature'],
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err) {
      console.error('Signature Stripe invalide :', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2. Traiter uniquement ce qui nous intéresse
    if (evenement.type !== 'checkout.session.completed') {
      return res.status(200).send('ignoré');
    }

    const session = evenement.data.object;

    if (session.payment_status !== 'paid') {
      console.log('Session non payée, ignorée :', session.id);
      return res.status(200).send('non payée');
    }

    const email =
      (session.customer_details && session.customer_details.email) ||
      session.customer_email;

    if (!email) {
      console.error('Aucun e-mail sur la session', session.id);
      return res.status(200).send('sans e-mail');
    }

    const cle = email.trim().toLowerCase();
    const offre = offrePourMontant(session.amount_total || 0);

    try {
      // 3. Ouvrir l'accès. merge:true pour qu'une montée en gamme
      //    (Essentiel → Complet) écrase proprement l'offre.
      await bdd.doc(`acheteurs/${cle}`).set(
        {
          email: cle,
          offre,
          montant: session.amount_total,
          devise: session.currency,
          sessionStripe: session.id,
          clientStripe: session.customer || null,
          dateAchat: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      console.log(`Accès ouvert : ${cle} → ${offre}`);
      return res.status(200).send('ok');

    } catch (err) {
      // On renvoie 500 pour que Stripe réessaie automatiquement.
      console.error('Écriture Firestore échouée', err);
      return res.status(500).send('erreur interne');
    }
  },
);

/* ==========================================================================
   Ouvrir un accès à la main (remboursement annulé, achat hors Stripe,
   client qui s'est trompé d'adresse e-mail…)

   Appel :
     curl -X POST https://<ton-url>/ouvrirAcces \
       -H "Content-Type: application/json" \
       -d '{"cle":"<ADMIN_CLE>","email":"client@exemple.fr","offre":"complet"}'
   ========================================================================== */

const ADMIN_CLE = defineSecret('ADMIN_CLE');

exports.ouvrirAcces = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { cle, email, offre } = req.body || {};

    if (cle !== ADMIN_CLE.value()) {
      return res.status(403).send('interdit');
    }
    if (!email || !['essentiel', 'complet'].includes(offre)) {
      return res.status(400).send('email et offre (essentiel|complet) requis');
    }

    await bdd.doc(`acheteurs/${email.trim().toLowerCase()}`).set(
      {
        email: email.trim().toLowerCase(),
        offre,
        source: 'manuel',
        dateAchat: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return res.status(200).send(`accès ${offre} ouvert pour ${email}`);
  },
);
