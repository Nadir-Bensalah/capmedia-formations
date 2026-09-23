/* ==========================================================================
   CAPMEDIA CLIENT HUB · la porte des robots

   Les tests automatisés (Maestro, Playwright, Jest, Test Lab) rendent leur
   verdict ici, en direct : une exécution annonce son début, chaque parcours
   son résultat dès qu'il tombe, puis la fin. Le tableau des tests s'allume
   case par case pendant que la machine tourne.

   Un robot ne porte PAS la clé d'administration. Il porte un jeton de
   robot, propre à un projet, créé depuis le cockpit et montré une seule
   fois. Seule son empreinte est gardée : une base qui fuit ne donne aucun
   jeton, et un jeton volé n'ouvre qu'un projet, en écriture de verdicts.

     POST suiviRobot
     Authorization: Bearer cmr_...
     { "evenement": "debut", "execution": "ci-4812", "outil": "maestro",
       "plateforme": "ios", "branche": "main", "commit": "1b8ec02",
       "parcours": ["R-01", "R-02"] }
     { "evenement": "resultat", "execution": "ci-4812", "ref": "R-01",
       "resultat": "vert", "duree": 41.2, "essais": 1, "message": "" }
     { "evenement": "resultats", "execution": "ci-4812", "resultats": [ ... ] }
     { "evenement": "fin", "execution": "ci-4812" }

   Ce que le client lit : l'état de chaque parcours, et qu'une exécution
   tourne. Ce qu'il ne lit pas : la branche, le commit, la machine, les
   messages d'erreur. Ils vivent sous « executions », que seule l'équipe lit.
   ========================================================================== */

const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();
const bdd = getFirestore();
const REGION = 'europe-west1';

const RESULTATS = ['vert', 'rouge', 'instable', 'saute'];
const OUTILS = ['maestro', 'playwright', 'testlab', 'jest', 'autre'];
const PLATEFORMES = ['ios', 'android', 'web', ''];
const ID_EXECUTION = /^[A-Za-z0-9_.-]{1,80}$/;
const REF = /^[A-Za-z0-9_.-]{1,40}$/;

const empreinte = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('hex');

/** Un jeton neuf. Montré une fois, jamais relu : on ne garde que l'empreinte. */
const nouveauJeton = () => `cmr_${crypto.randomBytes(24).toString('hex')}`;

const borne = (v, n) => String(v == null ? '' : v).slice(0, n);
const nombre = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : null);

/**
 * Le verdict d'un parcours, d'après ce que l'outil rend. Un vert obtenu
 * au deuxième essai est un parcours INSTABLE : il n'apprend rien, et c'est
 * pire qu'un rouge, parce qu'on finit par l'ignorer.
 */
const etatDe = (resultat, essais) => {
  if (resultat === 'vert' && Number(essais) > 1) return 'instable';
  return resultat;
};

/** Consigne un résultat. Rend false si le parcours n'existe pas. */
const consigner = async (pid, eid, r, execution) => {
  const ref = borne(r.ref, 40);
  if (!REF.test(ref)) return false;
  const resultat = RESULTATS.includes(r.resultat) ? r.resultat : null;
  if (!resultat) return false;
  const parcours = bdd.doc(`projets/${pid}/parcours/${ref}`);
  const fiche = await parcours.get();
  if (!fiche.exists) return false;

  const le = new Date();
  const detail = {
    ref, resultat, essais: Number(r.essais) || 1, duree: nombre(r.duree),
    message: borne(r.message, 2000),
    lien: /^https:\/\/\S+$/.test(String(r.lien || '')) ? borne(r.lien, 500) : '',
    plateforme: PLATEFORMES.includes(r.plateforme) ? r.plateforme : (execution.plateforme || ''),
    le,
  };
  await bdd.doc(`projets/${pid}/executions/${eid}/resultats/${ref}`).set(detail);

  const maj = { enCours: FieldValue.delete(), maj: FieldValue.serverTimestamp() };
  if (resultat !== 'saute') {
    maj.etat = etatDe(resultat, detail.essais);
    /* Ce qui part chez le client : l'état et la date, sans le message. */
    maj.dernier = { le, resultat: maj.etat, duree: detail.duree, plateforme: detail.plateforme, execution: eid };
  }
  await parcours.update(maj);
  return { ref, etat: maj.etat || '' };
};

exports.suiviRobot = onRequest(
  { region: REGION, cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const entete = String(req.get('authorization') || '');
    const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
    if (!/^cmr_[0-9a-f]{48}$/.test(jeton)) return res.status(401).send('jeton manquant');

    const robot = await bdd.doc(`robots/${empreinte(jeton)}`).get();
    if (!robot.exists || robot.data().actif === false) return res.status(401).send('jeton inconnu');
    const pid = robot.data().projet;

    const corps = req.body || {};
    const eid = String(corps.execution || '');
    if (!ID_EXECUTION.test(eid)) return res.status(400).send('execution : lettres, chiffres, point, tiret, 80 au plus');
    const execRef = bdd.doc(`projets/${pid}/executions/${eid}`);

    try {
      await robot.ref.update({ dernier: FieldValue.serverTimestamp() });

      if (corps.evenement === 'debut') {
        const refs = (Array.isArray(corps.parcours) ? corps.parcours : []).map((r) => borne(r, 40)).filter((r) => REF.test(r)).slice(0, 1000);
        const execution = {
          outil: OUTILS.includes(corps.outil) ? corps.outil : 'autre',
          plateforme: PLATEFORMES.includes(corps.plateforme) ? corps.plateforme : '',
          branche: borne(corps.branche, 120), commit: borne(corps.commit, 40),
          machine: borne(corps.machine, 120), robot: borne(robot.data().nom, 80),
          statut: 'en-cours', debut: FieldValue.serverTimestamp(), fin: null,
          total: refs.length, faits: 0, verts: 0, rouges: 0, instables: 0, inconnus: [],
        };
        await execRef.set(execution);
        /* Les cases passent au bleu d'un coup : c'est ce qui dit, chez le
           client comme chez nous, qu'une exécution est partie. */
        const inconnus = [];
        for (let i = 0; i < refs.length; i += 400) {
          const lot = bdd.batch();
          const fiches = await bdd.getAll(...refs.slice(i, i + 400).map((r) => bdd.doc(`projets/${pid}/parcours/${r}`)));
          fiches.forEach((f) => { if (f.exists) lot.update(f.ref, { enCours: eid, maj: FieldValue.serverTimestamp() }); else inconnus.push(f.id); });
          await lot.commit();
        }
        if (inconnus.length) await execRef.update({ inconnus: inconnus.slice(0, 200) });
        return res.status(200).json({ ok: true, execution: eid, inconnus });
      }

      const exec = await execRef.get();
      if (!exec.exists) return res.status(404).send('execution inconnue : envoyez d abord « debut »');
      if (exec.data().statut !== 'en-cours') return res.status(409).send('execution terminee');

      if (corps.evenement === 'resultat' || corps.evenement === 'resultats') {
        const liste = corps.evenement === 'resultat' ? [corps] : (Array.isArray(corps.resultats) ? corps.resultats : []).slice(0, 1000);
        const compte = { faits: 0, verts: 0, rouges: 0, instables: 0 };
        const inconnus = [];
        for (const r of liste) {
          const fait = await consigner(pid, eid, r, exec.data());
          if (!fait) { inconnus.push(borne(r.ref, 40)); continue; }
          compte.faits += 1;
          if (fait.etat === 'vert') compte.verts += 1;
          if (fait.etat === 'rouge') compte.rouges += 1;
          if (fait.etat === 'instable') compte.instables += 1;
        }
        const maj = { maj: FieldValue.serverTimestamp() };
        Object.entries(compte).forEach(([k, n]) => { if (n) maj[k] = FieldValue.increment(n); });
        if (inconnus.length) maj.inconnus = FieldValue.arrayUnion(...inconnus.slice(0, 50));
        await execRef.update(maj);
        return res.status(200).json({ ok: true, consignes: compte.faits, inconnus });
      }

      if (corps.evenement === 'fin') {
        /* Un parcours annoncé qui n'a rien rendu (plantage, délai) garde
           son dernier verdict, mais il ne tourne plus : on l'éteint. */
        const restants = await bdd.collection(`projets/${pid}/parcours`).where('enCours', '==', eid).get();
        const lot = bdd.batch();
        restants.docs.forEach((d) => lot.update(d.ref, { enCours: FieldValue.delete(), maj: FieldValue.serverTimestamp() }));
        lot.update(execRef, {
          statut: corps.interrompue ? 'interrompue' : 'finie', fin: FieldValue.serverTimestamp(),
          sansResultat: restants.size,
        });
        await lot.commit();
        return res.status(200).json({ ok: true, sansResultat: restants.size });
      }

      return res.status(400).send('evenement : debut, resultat, resultats ou fin');
    } catch (err) {
      console.error('Robot', err);
      return res.status(500).send('erreur');
    }
  },
);

/* Pour suiviAdmin : créer et révoquer un jeton depuis le cockpit. */
exports.creerJetonRobot = async ({ projet, nom }) => {
  const p = await bdd.doc(`projets/${projet}`).get();
  if (!p.exists) { const e = new Error('Projet introuvable.'); e.code = 404; throw e; }
  const jeton = nouveauJeton();
  const id = empreinte(jeton);
  await bdd.doc(`robots/${id}`).set({
    projet, nom: borne(nom, 80) || 'Robot', actif: true,
    fin: jeton.slice(-4), cree: FieldValue.serverTimestamp(), dernier: null,
  });
  return { id, jeton };
};

exports.revoquerJetonRobot = async ({ id }) => {
  if (!/^[0-9a-f]{64}$/.test(String(id || ''))) { const e = new Error('Jeton inconnu.'); e.code = 404; throw e; }
  await bdd.doc(`robots/${id}`).delete();
  return { ok: true };
};

exports.empreinte = empreinte;
