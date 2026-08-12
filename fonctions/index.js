/* ==========================================================================
   CAPMEDIA ACADEMY · Fonctions serveur (multi-formations)

   stripeWebhook      paiement validé, accès ouvert (formation ou pack)
   creerCheckoutPack  session Stripe du pack, prorata calculé CÔTÉ SERVEUR
   ouvrirAcces        ouverture manuelle (admin)
   admin              console support + avis (admin)

   Le prix du pack personnalisé n'est JAMAIS calculé côté client : le
   client envoie son jeton Firebase, la fonction vérifie l'identité, lit
   ses achats, calcule le prorata depuis catalogue.json et crée la session
   Stripe au bon montant. Fiabilité : chaque écriture d'accès est
   idempotente (rejouer un événement Stripe ne change rien).
   ========================================================================== */

const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');
const CATALOGUE = require('./catalogue.json');

initializeApp();
const bdd = getFirestore();

const STRIPE_SECRET         = defineSecret('STRIPE_SECRET');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const ADMIN_CLE             = defineSecret('ADMIN_CLE');

const SITE = 'https://nadir-bensalah.github.io/capmedia-formations';

/* --- Prix du pack, source de vérité serveur ------------------------------- */
function prixPack(niveau) {
  const cle = niveau === 'avance' ? 'prixC' : 'prixE';
  const somme = CATALOGUE.formations.reduce((n, f) => n + f[cle], 0);
  return { plein: somme, prix: Math.round(somme * (1 - CATALOGUE.pack.remise)) };
}
function prixPackPerso(niveau, achats) {
  const cle = niveau === 'avance' ? 'prixC' : 'prixE';
  const base = prixPack(niveau);
  let deja = 0;
  for (const f of CATALOGUE.formations) {
    if (achats && achats[f.slug]) deja += f[cle];
  }
  const prix = Math.max(CATALOGUE.pack.plancher, base.prix - deja);
  return { plein: base.plein, packPlein: base.prix, deja, prix,
           remisePct: Math.round((1 - prix / base.plein) * 100) };
}

/* --- Normaliser une fiche acheteur (rétrocompat « offre ») ---------------- */
function achatsDeFiche(fiche) {
  const achats = { ...(fiche.achats || {}) };
  if (fiche.offre && !achats.mobile) achats.mobile = fiche.offre;
  return achats;
}

/* ==========================================================================
   1. Webhook Stripe
   ========================================================================== */
exports.stripeWebhook = onRequest(
  { region: 'europe-west1', secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const stripe = new Stripe(STRIPE_SECRET.value());
    let evenement;
    try {
      evenement = stripe.webhooks.constructEvent(
        req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err) {
      console.error('Signature Stripe invalide :', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (evenement.type !== 'checkout.session.completed') return res.status(200).send('ignoré');
    const session = evenement.data.object;
    if (session.payment_status !== 'paid') return res.status(200).send('non payée');

    const email = ((session.customer_details && session.customer_details.email)
      || session.customer_email || '').trim().toLowerCase();
    if (!email) { console.error('Session sans e-mail', session.id); return res.status(200).send('sans e-mail'); }

    /* Quoi créditer ? metadata d'abord ; à défaut, l'ancien comportement
       (montant, formation mobile) pour les liens historiques. */
    const meta = session.metadata || {};
    let credit;
    let libelle;
    if (meta.pack === 'basic' || meta.pack === 'avance') {
      credit = { pack: meta.pack };
      libelle = `Pack Academy (${meta.pack === 'avance' ? 'Avancé' : 'Basic'})`;
    } else if (meta.formation && (meta.offre === 'essentiel' || meta.offre === 'complet')) {
      const f = CATALOGUE.formations.find((x) => x.slug === meta.formation);
      if (!f) { console.error('Formation inconnue', meta.formation); return res.status(200).send('formation inconnue'); }
      credit = { achats: { [meta.formation]: meta.offre } };
      libelle = `${f.nom} (${meta.offre === 'complet' ? 'Complet' : 'Essentiel'})`;
    } else {
      const offre = (session.amount_total || 0) >= 15000 ? 'complet' : 'essentiel';
      credit = { achats: { mobile: offre } };
      libelle = `De Zéro à l'App Store (${offre})`;
    }

    /* Reçu Stripe, pour l'espace client. */
    let recu = null;
    try {
      if (session.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ['latest_charge'] });
        recu = (pi.latest_charge && pi.latest_charge.receipt_url) || null;
      }
    } catch (e) { console.warn('Reçu introuvable', e.message); }

    const paiement = {
      date: new Date().toISOString(),
      montant: session.amount_total,
      devise: session.currency,
      libelle,
      session: session.id,
      recu,
    };

    try {
      const ref = bdd.doc(`acheteurs/${email}`);
      await bdd.runTransaction(async (t) => {
        const d = await t.get(ref);
        const fiche = d.exists ? d.data() : {};

        /* Idempotence : un événement rejoué n'ajoute rien deux fois. */
        const dejaVu = (fiche.paiements || []).some((p) => p.session === session.id);

        const achats = { ...achatsDeFiche(fiche), ...(credit.achats || {}) };
        /* Un « complet » existant ne se fait jamais rétrograder. */
        for (const [slug, offre] of Object.entries(credit.achats || {})) {
          if (achatsDeFiche(fiche)[slug] === 'complet' && offre === 'essentiel') {
            achats[slug] = 'complet';
          }
        }

        const maj = { email, achats, maj: FieldValue.serverTimestamp() };
        if (credit.pack) maj.pack = (fiche.pack === 'avance') ? 'avance' : credit.pack;
        else if (fiche.pack) maj.pack = fiche.pack;
        maj.paiements = dejaVu ? (fiche.paiements || []) : [...(fiche.paiements || []), paiement];

        t.set(ref, maj, { merge: true });
      });

      console.log(`Accès ouvert : ${email} → ${libelle}`);
      return res.status(200).send('ok');
    } catch (err) {
      console.error('Écriture Firestore échouée', err);
      return res.status(500).send('erreur interne');   // Stripe réessaiera
    }
  },
);

/* ==========================================================================
   2. Checkout du pack, prorata côté serveur
   POST { idToken, niveau: 'basic'|'avance', apercu?: true }
   apercu:true renvoie le calcul sans créer de session (affichage).
   ========================================================================== */
exports.creerCheckoutPack = onRequest(
  { region: 'europe-west1', secrets: [STRIPE_SECRET], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { idToken, niveau, apercu } = req.body || {};
    if (!idToken || !['basic', 'avance'].includes(niveau)) {
      return res.status(400).json({ erreur: 'idToken et niveau (basic|avance) requis' });
    }

    let decode;
    try {
      decode = await getAuth().verifyIdToken(idToken);
      if (!decode.email || !decode.email_verified) throw new Error('email non vérifié');
    } catch (e) {
      return res.status(401).json({ erreur: 'jeton invalide' });
    }
    const email = decode.email.toLowerCase();

    const d = await bdd.doc(`acheteurs/${email}`).get();
    const fiche = d.exists ? d.data() : {};
    if (fiche.pack === 'avance' || (fiche.pack === 'basic' && niveau === 'basic')) {
      return res.status(200).json({ deja: 'pack' });
    }

    const achats = achatsDeFiche(fiche);
    let calc = prixPackPerso(niveau, achats);
    /* Montée basic vers avancé : le pack basic déjà payé se déduit aussi. */
    if (fiche.pack === 'basic' && niveau === 'avance') {
      const basicPaye = prixPack('basic').prix;
      calc = { ...calc, deja: calc.deja + basicPaye,
               prix: Math.max(CATALOGUE.pack.plancher, calc.prix - basicPaye) };
      calc.remisePct = Math.round((1 - calc.prix / calc.plein) * 100);
    }

    if (apercu) {
      return res.status(200).json({ prix: calc.prix, packPlein: calc.packPlein,
        plein: calc.plein, deja: calc.deja, remisePct: calc.remisePct });
    }

    const stripe = new Stripe(STRIPE_SECRET.value());
    const sessionStripe = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: calc.prix * 100,
          product_data: {
            name: `Pack Academy · ${niveau === 'avance' ? 'Avancé' : 'Basic'} (toutes les formations)`,
            description: calc.deja > 0
              ? `Prix personnalisé : ${calc.deja} € déjà investis, déduits.`
              : 'Toutes les formations, accès à vie.',
          },
        },
      }],
      metadata: { pack: niveau, email },
      success_url: `${SITE}/merci.html`,
      cancel_url: `${SITE}/formations/`,
    });

    return res.status(200).json({ url: sessionStripe.url, prix: calc.prix,
      deja: calc.deja, remisePct: calc.remisePct });
  },
);

/* ==========================================================================
   3. Ouverture manuelle d'un accès (admin)
   POST { cle, email, formation, offre } ou { cle, email, pack }
   ========================================================================== */
exports.ouvrirAcces = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { cle, email, formation, pack, offre } = req.body || {};
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) return res.status(403).send('interdit');
    if (!email) return res.status(400).send('email requis');

    const e = email.trim().toLowerCase();
    let maj;
    if (pack === 'basic' || pack === 'avance') {
      maj = { email: e, pack, maj: FieldValue.serverTimestamp() };
    } else if (formation && ['essentiel', 'complet'].includes(offre)) {
      maj = { email: e, achats: { [formation]: offre }, maj: FieldValue.serverTimestamp() };
    } else {
      return res.status(400).send('formation+offre, ou pack, requis');
    }
    await bdd.doc(`acheteurs/${e}`).set(maj, { merge: true });
    return res.status(200).send(`accès ouvert pour ${e}`);
  },
);

/* ==========================================================================
   4. Console d'administration : support et avis
   ========================================================================== */
exports.admin = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { cle, action, uid, texte, publie } = req.body || {};
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) return res.status(403).send('interdit');

    try {
      if (action === 'support') {
        const attente = await bdd.collection('conversations').where('tour', '==', 'nadir').get();
        return res.status(200).json(attente.docs.map((d) => ({
          uid: d.id, email: d.data().email, dernier: d.data().dernier,
          nb: (d.data().messages || []).length,
        })));
      }
      if (action === 'repondre') {
        if (!uid || !texte) return res.status(400).send('uid et texte requis');
        const ref = bdd.doc(`conversations/${uid}`);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).send('conversation inconnue');
        const message = { de: 'nadir', texte: String(texte), date: new Date().toISOString() };
        await ref.set({
          messages: [...(doc.data().messages || []), message],
          dernier: message, tour: 'membre', maj: new Date().toISOString(),
        }, { merge: true });
        return res.status(200).send('répondu');
      }
      if (action === 'avis') {
        const attente = await bdd.collection('avis').where('publie', '==', false).get();
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
