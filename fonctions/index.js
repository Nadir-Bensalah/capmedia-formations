/* ==========================================================================
   CAPMEDIA ACADEMY · Webhook Stripe (Firebase Cloud Functions, 2e génération)

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

    // 1. Vérifier la signature : sans ça, n'importe qui peut s'offrir
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

    // On compare les valeurs nettoyées : un secret défini depuis un fichier
    // embarque presque toujours un saut de ligne final.
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) {
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


/* ==========================================================================
   Console d'administration : support et avis.
   Une seule fonction, protégée par ADMIN_CLE, pilotée par « action » :

     {cle, action:'support'}                        → conversations en attente
     {cle, action:'repondre', uid, texte}           → répondre à un membre
     {cle, action:'avis'}                           → avis en attente de relecture
     {cle, action:'publier', uid, publie:true|false} → publier / dépublier un avis
   ========================================================================== */
exports.admin = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { cle, action, uid, texte, publie } = req.body || {};
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) {
      return res.status(403).send('interdit');
    }

    try {
      if (action === 'support') {
        const attente = await bdd.collection('conversations')
          .where('tour', '==', 'nadir').get();
        return res.status(200).json(attente.docs.map((d) => ({
          uid: d.id,
          email: d.data().email,
          dernier: d.data().dernier,
          nb: (d.data().messages || []).length,
        })));
      }

      if (action === 'repondre') {
        if (!uid || !texte) return res.status(400).send('uid et texte requis');
        const ref = bdd.doc(`conversations/${uid}`);
        const d = await ref.get();
        if (!d.exists) return res.status(404).send('conversation inconnue');
        const message = { de: 'nadir', texte: String(texte), date: new Date().toISOString() };
        await ref.set({
          messages: [...(d.data().messages || []), message],
          dernier: message,
          tour: 'membre',
          maj: new Date().toISOString(),
        }, { merge: true });
        return res.status(200).send('répondu');
      }

      if (action === 'avis') {
        const attente = await bdd.collection('avis')
          .where('publie', '==', false).get();
        return res.status(200).json(attente.docs.map((d) => ({ uid: d.id, ...d.data() })));
      }

      if (action === 'publier') {
        if (!uid) return res.status(400).send('uid requis');
        await bdd.doc(`avis/${uid}`).set({ publie: publie !== false }, { merge: true });
        return res.status(200).send(publie !== false ? 'publié' : 'dépublié');
      }

      return res.status(400).send('action inconnue');
    } catch (err) {
      console.error(err);
      return res.status(500).send('erreur interne');
    }
  },
);
