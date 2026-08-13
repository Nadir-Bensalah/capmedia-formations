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

const SITE = 'https://nadir-bensalah.github.io/capmedia-formations';  // TEMPORAIRE : re-basculer sur capmedia.app dès le DNS corrigé

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

    /* --- Remboursement intégral : l'accès se referme tout seul. --------- */
    if (evenement.type === 'charge.refunded') {
      const charge = evenement.data.object;
      if (!charge.refunded) return res.status(200).send('remboursement partiel : rien à fermer');
      try {
        const liste = await stripe.checkout.sessions.list({
          payment_intent: String(charge.payment_intent), limit: 1,
        });
        const s = liste.data[0];
        if (!s) return res.status(200).send('session introuvable');
        const email = ((s.customer_details && s.customer_details.email)
          || s.customer_email || '').trim().toLowerCase();
        const meta = s.metadata || {};
        if (!email) return res.status(200).send('sans e-mail');

        const ref = bdd.doc(`acheteurs/${email}`);
        await bdd.runTransaction(async (t) => {
          const d = await t.get(ref);
          if (!d.exists) return;
          const fiche = d.data();
          const paiements = (fiche.paiements || []).map((p) =>
            p.session === s.id ? { ...p, rembourse: true } : p);
          const maj = { paiements, maj: FieldValue.serverTimestamp() };
          if (meta.pack && fiche.pack === meta.pack) {
            maj.pack = FieldValue.delete();
          } else if (meta.formation) {
            maj.achats = { [meta.formation]: FieldValue.delete() };
          } else {
            maj.achats = { mobile: FieldValue.delete() };
            maj.offre = FieldValue.delete();
          }
          t.set(ref, maj, { merge: true });
        });
        console.log(`Remboursement : accès fermé pour ${email} (${meta.formation || meta.pack || 'mobile'})`);
        return res.status(200).send('accès fermé');
      } catch (err) {
        console.error('Fermeture après remboursement échouée', err);
        return res.status(500).send('erreur interne');   // Stripe réessaiera
      }
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
      if (f) {
        credit = { achats: { [meta.formation]: meta.offre } };
        libelle = `${f.nom} (${meta.offre === 'complet' ? 'Complet' : 'Essentiel'})`;
      } else {
        /* Slug inconnu : lien de test du circuit, ou métadonnée mal posée.
           On ne livre RIEN, mais chaque euro encaissé doit laisser une trace
           visible en console (et rester remboursable depuis l'onglet Ventes). */
        console.error('Formation inconnue, paiement enregistré sans livraison :', meta.formation);
        credit = {};
        libelle = `Paiement sans livraison (« ${meta.formation} » inconnu)`;
      }
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
      /* Compte reel : Managed Payments (Stripe vendeur officiel) est actif
         par defaut et exigerait un tax_code ; on vend en direct, comme en test. */
      managed_payments: { enabled: false },
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
      success_url: `${SITE}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/formations/`,
    });

    return res.status(200).json({ url: sessionStripe.url, prix: calc.prix,
      deja: calc.deja, remisePct: calc.remisePct });
  },
);

/* ==========================================================================
   2 bis. Checkout d'une formation, client connecté
   POST { idToken, formation, offre: 'essentiel'|'complet', apercu?: true }

   Pourquoi côté serveur : l'e-mail est VERROUILLÉ sur celui du compte
   (impossible de payer avec la mauvaise adresse, y compris via Apple Pay
   ou Google Pay), le double achat est refusé, et la montée Essentiel vers
   Complet est facturée au prorata (différence de prix), calculée ici.
   ========================================================================== */
exports.creerCheckoutFormation = onRequest(
  { region: 'europe-west1', secrets: [STRIPE_SECRET], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { idToken, formation, offre, apercu } = req.body || {};
    const f = CATALOGUE.formations.find((x) => x.slug === formation);
    if (!idToken || !f || !['essentiel', 'complet'].includes(offre)) {
      return res.status(400).json({ erreur: 'idToken, formation et offre requis' });
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
    const achats = achatsDeFiche(fiche);
    const possede = fiche.pack === 'avance' ? 'complet'
      : (fiche.pack === 'basic' && !achats[formation]) ? 'essentiel'
      : achats[formation] || null;

    /* Déjà couvert : on refuse le double paiement, net. */
    if (possede === 'complet' || (possede === 'essentiel' && offre === 'essentiel')) {
      return res.status(200).json({ deja: true, possede });
    }

    /* Prix : plein tarif, ou prorata de montée Essentiel -> Complet. */
    let prix = offre === 'complet' ? f.prixC : f.prixE;
    let deduit = 0;
    const upgrade = offre === 'complet' && possede === 'essentiel';
    if (upgrade) { deduit = f.prixE; prix = Math.max(9, f.prixC - f.prixE); }

    if (apercu) return res.status(200).json({ prix, deduit, upgrade });

    const stripe = new Stripe(STRIPE_SECRET.value());
    const nomOffre = offre === 'complet' ? 'Complète' : 'Essentiel';
    const sessionStripe = await stripe.checkout.sessions.create({
      mode: 'payment',
      /* Compte reel : Managed Payments (Stripe vendeur officiel) est actif
         par defaut et exigerait un tax_code ; on vend en direct, comme en test. */
      managed_payments: { enabled: false },
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: prix * 100,
          product_data: {
            name: upgrade
              ? `${f.nom} · Passage à l'offre Complète`
              : `${f.nom} · Offre ${nomOffre}`,
            description: upgrade
              ? `Prorata : ${deduit} € déjà payés sur l'offre Essentiel, déduits.`
              : 'Accès à vie, mises à jour comprises.',
          },
        },
      }],
      metadata: { formation, offre, email },
      success_url: `${SITE}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/formations/${formation === 'mobile' ? '' : formation + '.html'}`,
    });

    return res.status(200).json({ url: sessionStripe.url, prix, deduit, upgrade });
  },
);

/* ==========================================================================
   2 quater. Renonciation à la garantie (déblocage total d'une formation)
   POST { idToken, formation }

   Le membre qui débloque toute une formation d'un coup renonce à la
   garantie « satisfait ou remboursé » (CGV, article 7). La confirmation
   est horodatée ICI, côté serveur, dans un document que le client ne
   peut pas modifier : la preuve est infalsifiable.
   ========================================================================== */
exports.renoncerGarantie = onRequest(
  { region: 'europe-west1', cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { idToken, formation } = req.body || {};
    const f = CATALOGUE.formations.find((x) => x.slug === formation);
    if (!idToken || !f) return res.status(400).json({ erreur: 'idToken et formation requis' });

    let decode;
    try {
      decode = await getAuth().verifyIdToken(idToken);
      if (!decode.email || !decode.email_verified) throw new Error('email non vérifié');
    } catch (e) {
      return res.status(401).json({ erreur: 'jeton invalide' });
    }
    const email = decode.email.toLowerCase();

    const ref = bdd.doc(`acheteurs/${email}`);
    const d = await ref.get();
    if (!d.exists) return res.status(403).json({ erreur: 'aucun achat' });

    await ref.set({
      renonciations: {
        [formation]: { date: new Date().toISOString(), uid: decode.uid },
      },
    }, { merge: true });

    console.log(`Renonciation garantie : ${email} → ${formation}`);
    return res.status(200).json({ ok: true });
  },
);

/* ==========================================================================
   2 ter. Infos d'une session de paiement (page merci)
   POST { session_id }

   Le porteur du session_id (présent dans l'URL de retour Stripe) peut
   savoir : l'e-mail auquel l'achat est rattaché, ce qui a été acheté, et
   le statut. C'est ce qui rend la page merci infaillible, y compris quand
   Apple Pay ou Google Pay a imposé une adresse inattendue.
   ========================================================================== */
exports.infoSession = onRequest(
  { region: 'europe-west1', secrets: [STRIPE_SECRET], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { session_id } = req.body || {};
    if (!session_id || !/^cs_[a-zA-Z0-9_]+$/.test(String(session_id))) {
      return res.status(400).json({ erreur: 'session_id requis' });
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET.value());
      const s = await stripe.checkout.sessions.retrieve(String(session_id));
      const email = ((s.customer_details && s.customer_details.email)
        || s.customer_email || '').trim().toLowerCase();
      const meta = s.metadata || {};

      let achat = null;
      if (meta.pack) {
        achat = { type: 'pack', niveau: meta.pack,
          libelle: `Pack Academy (${meta.pack === 'avance' ? 'Avancé' : 'Basic'})` };
      } else if (meta.formation) {
        const f = CATALOGUE.formations.find((x) => x.slug === meta.formation);
        achat = { type: 'formation', formation: meta.formation, offre: meta.offre,
          libelle: f ? `${f.nom} (${meta.offre === 'complet' ? 'Complète' : 'Essentiel'})` : meta.formation };
      }

      return res.status(200).json({
        paye: s.payment_status === 'paid',
        email,
        achat,
        sessionId: s.id,
      });
    } catch (e) {
      return res.status(404).json({ erreur: 'session inconnue' });
    }
  },
);

/* ==========================================================================
   3. Ouverture manuelle d'un accès (admin)
   POST { cle, email, formation, offre } ou { cle, email, pack }
   ========================================================================== */
exports.ouvrirAcces = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { cle, email, formation, pack, offre, retirer } = req.body || {};
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) return res.status(403).send('interdit');
    if (!email) return res.status(400).send('email requis');

    const e = email.trim().toLowerCase();
    let maj;
    if (retirer === true) {
      /* Fermeture manuelle (remboursement hors Stripe, litige, erreur). */
      if (pack) maj = { pack: FieldValue.delete(), maj: FieldValue.serverTimestamp() };
      else if (formation) maj = { achats: { [formation]: FieldValue.delete() }, maj: FieldValue.serverTimestamp() };
      else return res.status(400).send('formation ou pack requis avec retirer');
      await bdd.doc(`acheteurs/${e}`).set(maj, { merge: true });
      return res.status(200).send(`accès retiré pour ${e}`);
    }
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
   4. Console d'administration : le dashboard pilote tout par ici.
   Chaque appel : POST { cle, action, ...params }. La clé admin fait loi.
   ========================================================================== */
exports.admin = onRequest(
  { region: 'europe-west1', secrets: [ADMIN_CLE, STRIPE_SECRET], cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { cle, action, uid, texte, publie, email, confirmation,
      formation, id, titre, resume, duree, offre, markdown, session, prix, lien, mode } = req.body || {};
    const attendu = String(ADMIN_CLE.value() || '').trim();
    if (!attendu || String(cle || '').trim() !== attendu) return res.status(403).send('interdit');

    /* Mode des données : chaque paiement porte l'empreinte de son mode
       Stripe (cs_test_ / cs_live_). 'test', 'reel', ou 'tous'. */
    const modeVoulu = ['test', 'reel', 'tous'].includes(mode) ? mode : 'tous';
    const modePaiement = (p) => String(p.session || '').startsWith('cs_test_') ? 'test' : 'reel';
    const garder = (p) => modeVoulu === 'tous' || modePaiement(p) === modeVoulu;

    /* Toute la connaissance client au même endroit. */
    async function ficheComplete(e) {
      const em = String(e).trim().toLowerCase();
      const d = await bdd.doc(`acheteurs/${em}`).get();
      const fiche = d.exists ? d.data() : null;

      let compte = null, progression = null, conversation = null;
      try {
        const u = await getAuth().getUserByEmail(em);
        compte = {
          uid: u.uid, emailVerifie: u.emailVerified,
          creeLe: u.metadata.creationTime, derniereConnexion: u.metadata.lastSignInTime,
          fournisseurs: (u.providerData || []).map((p) => p.providerId),
        };
        const p = await bdd.doc(`progression/${u.uid}`).get();
        if (p.exists) {
          const pf = p.data().parFormation || {};
          if (!pf.mobile && p.data().faits) pf.mobile = { faits: p.data().faits, maxDebloque: p.data().maxDebloque };
          progression = Object.fromEntries(Object.entries(pf).map(([slug, v]) => [slug, {
            faits: (v.faits || []).length, maxDebloque: v.maxDebloque ?? null,
          }]));
        }
        const c = await bdd.doc(`conversations/${u.uid}`).get();
        if (c.exists) conversation = { uid: u.uid, ...c.data() };
      } catch (err) { /* pas de compte Auth : achat sans première connexion */ }

      return { email: em, fiche, compte, progression, conversation };
    }

    try {
      /* --- Vue d'ensemble (filtrée par le mode Stripe des paiements) ------- */
      if (action === 'stats') {
        const tous = await bdd.collection('acheteurs').get();
        const il30j = Date.now() - 30 * 86400 * 1000;
        let revenuTotal = 0, revenu30j = 0, nbPaiements = 0;
        const packs = { basic: 0, avance: 0 };
        const parFormation = {};
        const derniers = [];
        const clientsDuMode = new Set();
        const clientsSansPaiement = [];

        tous.forEach((d) => {
          const f = d.data();
          const tousPaiements = f.paiements || [];
          if (!tousPaiements.length) { clientsSansPaiement.push(d.id); return; }
          for (const p of tousPaiements) {
            if (!garder(p)) continue;
            clientsDuMode.add(d.id);
            nbPaiements++;
            derniers.push({ email: d.id, ...p });
            if (p.rembourse) continue;
            revenuTotal += p.montant || 0;
            if (new Date(p.date).getTime() > il30j) revenu30j += p.montant || 0;

            /* Ventes par formation et packs : depuis le libellé du paiement,
               pour rester dans le mode choisi. */
            const lib = p.libelle || '';
            if (lib.startsWith('Pack Academy')) {
              packs[lib.includes('Avancé') ? 'avance' : 'basic']++;
            } else {
              const f2 = CATALOGUE.formations.find((x) => lib.startsWith(x.nom));
              if (f2) {
                const o = lib.includes('Complet') || lib.includes('Complète') ? 'complet' : 'essentiel';
                parFormation[f2.slug] = parFormation[f2.slug] || { essentiel: 0, complet: 0 };
                parFormation[f2.slug][o]++;
              }
            }
          }
        });
        derniers.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const attente = await bdd.collection('conversations').where('tour', '==', 'nadir').get();
        const avisAttente = await bdd.collection('avis').where('publie', '==', false).get();
        const listeAttente = await bdd.collection('attente').count().get();
        return res.status(200).json({
          mode: modeVoulu,
          listeAttente: listeAttente.data().count,
          clients: clientsDuMode.size,
          clientsSansPaiement: clientsSansPaiement.length,
          revenuTotal, revenu30j, nbPaiements, packs,
          parFormation, derniersPaiements: derniers.slice(0, 25),
          supportEnAttente: attente.size, avisEnAttente: avisAttente.size,
        });
      }

      /* --- Clients -------------------------------------------------------- */
      if (action === 'clients') {
        const tous = await bdd.collection('acheteurs').get();
        const liste = [];
        tous.forEach((d) => {
          const f = d.data();
          const tousPaiements = f.paiements || [];
          const paiements = tousPaiements.filter(garder);
          /* Sans aucun paiement = accès manuel : visible dans tous les modes. */
          if (tousPaiements.length && !paiements.length) return;
          liste.push({
            email: d.id, achats: achatsDeFiche(f), pack: f.pack || null,
            nbPaiements: paiements.length,
            manuel: !tousPaiements.length,
            test: tousPaiements.some((p) => modePaiement(p) === 'test'),
            total: paiements.filter((p) => !p.rembourse).reduce((n, p) => n + (p.montant || 0), 0),
            dernier: paiements.length ? paiements[paiements.length - 1].date : null,
            renonciations: Object.keys(f.renonciations || {}),
          });
        });
        liste.sort((a, b) => (b.dernier || '').localeCompare(a.dernier || ''));
        return res.status(200).json(liste);
      }

      if (action === 'client') {
        if (!email) return res.status(400).send('email requis');
        return res.status(200).json(await ficheComplete(email));
      }

      if (action === 'listeAttente') {
        const docs = await bdd.collection('attente').get();
        const liste = docs.docs.map((d) => d.data());
        liste.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return res.status(200).json({ nb: liste.length, liste });
      }

      if (action === 'paiements') {
        const tous = await bdd.collection('acheteurs').get();
        const liste = [];
        tous.forEach((d) => (d.data().paiements || []).filter(garder)
          .forEach((p) => liste.push({ email: d.id, ...p })));
        liste.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return res.status(200).json(liste);
      }

      /* --- Remboursement en un clic : Stripe rembourse, le webhook
             charge.refunded referme l'accès tout seul derrière. ----------- */
      if (action === 'rembourser') {
        if (!session) return res.status(400).send('session requise');
        const stripe = new Stripe(STRIPE_SECRET.value());
        const s = await stripe.checkout.sessions.retrieve(String(session));
        if (!s.payment_intent) return res.status(400).send('session sans paiement');
        const remboursement = await stripe.refunds.create({
          payment_intent: String(s.payment_intent),
        });
        return res.status(200).json({ ok: true, statut: remboursement.status,
          montant: remboursement.amount });
      }

      /* --- Contenu des formations : lire et modifier, en direct ----------- */
      if (action === 'lecons') {
        if (!formation) return res.status(400).send('formation requise');
        const docs = await bdd.collection(`formations/${formation}/lecons`).get();
        const liste = docs.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
        return res.status(200).json(liste);
      }
      if (action === 'contenu') {
        if (!formation || !id) return res.status(400).send('formation et id requis');
        const [l, c] = await Promise.all([
          bdd.doc(`formations/${formation}/lecons/${id}`).get(),
          bdd.doc(`formations/${formation}/contenus/${id}`).get(),
        ]);
        if (!l.exists) return res.status(404).send('module inconnu');
        return res.status(200).json({ meta: l.data(), markdown: c.exists ? c.data().markdown : '' });
      }
      if (action === 'majContenu') {
        if (!formation || !id) return res.status(400).send('formation et id requis');
        const refL = bdd.doc(`formations/${formation}/lecons/${id}`);
        if (!(await refL.get()).exists) return res.status(404).send('module inconnu');
        const metaMaj = {};
        if (typeof titre === 'string' && titre) metaMaj.titre = titre;
        if (typeof resume === 'string' && resume) metaMaj.resume = resume;
        if (typeof duree === 'string') metaMaj.duree = duree;
        if (offre === 'essentiel' || offre === 'complet') metaMaj.offre = offre;
        if (Object.keys(metaMaj).length) await refL.set(metaMaj, { merge: true });
        if (typeof markdown === 'string') {
          await bdd.doc(`formations/${formation}/contenus/${id}`).set(
            { markdown, ...(metaMaj.offre ? { offre: metaMaj.offre } : {}) }, { merge: true });
        }
        return res.status(200).json({ ok: true });
      }

      /* --- Liens de paiement Stripe ---------------------------------------- */
      if (action === 'liensPaiement') {
        const stripe = new Stripe(STRIPE_SECRET.value());
        const liens = await stripe.paymentLinks.list({ active: true, limit: 100 });
        return res.status(200).json(liens.data.map((l) => ({
          id: l.id, url: l.url, metadata: l.metadata || {},
        })));
      }
      if (action === 'creerLienPaiement') {
        const f = CATALOGUE.formations.find((x) => x.slug === formation);
        const montant = Number(prix);
        if (!f || !['essentiel', 'complet'].includes(offre) || !(montant > 0)) {
          return res.status(400).send('formation, offre et prix (euros) requis');
        }
        const stripe = new Stripe(STRIPE_SECRET.value());
        const prixStripe = await stripe.prices.create({
          currency: 'eur', unit_amount: Math.round(montant * 100),
          product_data: { name: `${f.nom} · Offre ${offre === 'complet' ? 'Complète' : 'Essentiel'}` },
        });
        const nouveau = await stripe.paymentLinks.create({
          line_items: [{ price: prixStripe.id, quantity: 1 }],
          metadata: { formation, offre },
          billing_address_collection: 'required',
          after_completion: { type: 'redirect',
            redirect: { url: `${SITE}/merci.html?session_id={CHECKOUT_SESSION_ID}` } },
        });
        return res.status(200).json({ id: nouveau.id, url: nouveau.url });
      }
      if (action === 'desactiverLien') {
        if (!lien) return res.status(400).send('lien requis');
        const stripe = new Stripe(STRIPE_SECRET.value());
        await stripe.paymentLinks.update(String(lien), { active: false });
        return res.status(200).json({ ok: true });
      }

      /* --- E-mails clients (pour écrire en copie cachée) ------------------- */
      if (action === 'emailsClients') {
        const tous = await bdd.collection('acheteurs').get();
        const emails = [];
        tous.forEach((d) => {
          const fiche = d.data();
          const tousPaiements = fiche.paiements || [];
          if (tousPaiements.length && !tousPaiements.some(garder)) return;
          if (!formation || fiche.pack || achatsDeFiche(fiche)[formation]) emails.push(d.id);
        });
        return res.status(200).json({ emails: emails.sort(), nb: emails.length });
      }

      if (action === 'lienConnexion') {
        if (!email) return res.status(400).send('email requis');
        const lien = await getAuth().generateSignInWithEmailLink(String(email).trim().toLowerCase(), {
          url: `${SITE}/acces.html`, handleCodeInApp: true,
        });
        return res.status(200).json({ lien });
      }

      if (action === 'supprimerClient') {
        if (!email) return res.status(400).send('email requis');
        const em = String(email).trim().toLowerCase();
        if (confirmation !== em) return res.status(400).send('confirmation : retape l\'e-mail exact');
        const resultat = { auth: false, acheteur: false, progression: false, conversation: false };
        try {
          const u = await getAuth().getUserByEmail(em);
          await bdd.doc(`progression/${u.uid}`).delete().then(() => { resultat.progression = true; });
          await bdd.doc(`conversations/${u.uid}`).delete().then(() => { resultat.conversation = true; });
          await bdd.doc(`avis/${u.uid}`).delete().catch(() => {});
          await getAuth().deleteUser(u.uid);
          resultat.auth = true;
        } catch (e) { /* pas de compte Auth : on supprime le reste */ }
        await bdd.doc(`acheteurs/${em}`).delete();
        resultat.acheteur = true;
        return res.status(200).json(resultat);
      }

      /* --- Support et avis (les actions historiques + le complet) --------- */
      if (action === 'support') {
        const attente = await bdd.collection('conversations').where('tour', '==', 'nadir').get();
        return res.status(200).json(attente.docs.map((d) => ({
          uid: d.id, email: d.data().email, dernier: d.data().dernier,
          nb: (d.data().messages || []).length,
        })));
      }
      if (action === 'conversations') {
        const toutes = await bdd.collection('conversations').get();
        const liste = toutes.docs.map((d) => ({ uid: d.id, ...d.data() }));
        liste.sort((a, b) => (b.maj || '').localeCompare(a.maj || ''));
        return res.status(200).json(liste);
      }
      if (action === 'avisTous') {
        const tousAvis = await bdd.collection('avis').get();
        return res.status(200).json(tousAvis.docs.map((d) => ({ uid: d.id, ...d.data() })));
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
