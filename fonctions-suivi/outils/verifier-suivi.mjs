/* Vérifie la couche serveur : numérotation, historique, mise en file des e-mails. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('émulateurs requis'); process.exit(1); }
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'capmedia-1f90d' });
const bdd = getFirestore();

const soucis = [];
const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const ok = (m) => console.log('  ok     ' + m);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend qu une condition soit vraie, sans dépasser le délai. */
const attendre = async (quoi, secondes = 30) => {
  for (let i = 0; i < secondes * 2; i++) {
    const v = await quoi();
    if (v) return v;
    await pause(500);
  }
  return null;
};

/** La date d un envoi, quelle que soit sa forme. */
const instant = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const d = new Date(v).getTime();
  return Number.isNaN(d) ? 0 : d;
};

/** Les envois deja en file au demarrage, par modele : on ne compte que le neuf. */
const depart = {};
const envoisDepuis = async (_ignore, modele) => {
  const q = await bdd.collection('envois').get();
  const tous = q.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.modele === modele);
  const connus = depart[modele] || [];
  return tous.filter((e) => !connus.includes(e.id));
};

/** Attend que la file cesse de bouger : les declencheurs du jeu de donnees
    arrivent apres coup, et fausseraient la photo de depart. */
const fileCalme = async () => {
  let dernier = -1;
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    const n = (await bdd.collection('envois').get()).size;
    if (n === dernier && n > 0) stable += 1;
    else stable = 0;
    // Trois lectures identiques d affilee : les declencheurs du jeu de
    // donnees ont fini d arriver.
    if (stable >= 3) return n;
    dernier = n;
    await pause(1000);
  }
  return dernier;
};

/** Photographie l etat de la file avant les essais. */
const photographier = async () => {
  const q = await bdd.collection('envois').get();
  q.docs.forEach((d) => {
    const m = d.data().modele;
    (depart[m] = depart[m] || []).push(d.id);
  });
};

(async () => {
  const debut = 0;
  const enFile = await fileCalme();
  console.log(`  file au repos : ${enFile} envoi(s) issus du jeu de données`);
  await photographier();

  /* 1. Création d un ticket : numéro, historique, e-mail à l équipe -------- */
  console.log('\n== Un ticket arrive');
  const ref = await bdd.collection('tickets').add({
    projet: 'atelier', numero: null, titre: 'Essai serveur de la numérotation',
    description: 'Créé par la vérification automatique.',
    type: 'bug', urgence: 'important', statut: 'nouveau',
    plateforme: 'ios', version: '1.4.2', pieces: [], archive: false,
    auteur: { uid: 'essai', nom: 'Camille Martin', email: 'camille.essai@exemple.test', cote: 'client' },
    cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
    lu: { client: FieldValue.serverTimestamp(), equipe: null },
  });

  const numerote = await attendre(async () => {
    const d = await ref.get();
    return d.data() && d.data().numero ? d.data().numero : null;
  });
  if (!numerote) dire('le ticket ne reçoit aucun numéro');
  else if (!/^ATELIER-\d{3}$/.test(numerote)) dire('numéro inattendu : ' + numerote);
  else ok('numéro attribué : ' + numerote);

  const histo = await attendre(async () => {
    const q = await ref.collection('evenements').where('type', '==', 'creation').get();
    return q.size ? q.size : null;
  });
  if (!histo) dire("la création n est pas inscrite dans l historique");
  else ok("la création est inscrite dans l historique");

  const filNouveau = await attendre(async () => {
    const l = await envoisDepuis(debut, 'ticket-cree');
    return l.length ? l : null;
  });
  if (!filNouveau) dire("aucun e-mail mis en file pour un ticket neuf");
  else ok(`e-mail « ticket-cree » en file pour ${filNouveau[0].a.map((d) => d.email).join(', ')}`);

  /* 2. Un message de l équipe ------------------------------------------- */
  console.log('\n== Une réponse de l équipe');
  await ref.collection('messages').add({
    de: { uid: 'agent', nom: 'Alex Durand', cote: 'equipe' },
    texte: 'Réponse de vérification.', pieces: [], interne: false,
    date: FieldValue.serverTimestamp(),
  });
  const filMessage = await attendre(async () => {
    const l = await envoisDepuis(debut, 'message');
    return l.length ? l : null;
  });
  if (!filMessage) dire("aucun e-mail mis en file pour un message");
  else ok(`e-mail « message » en file pour ${filMessage[0].a.map((d) => d.email).join(', ')}`);

  /* 3. Une note interne ne doit prévenir personne côté client ------------- */
  const avantNote = (await envoisDepuis(debut, 'message')).length;
  await ref.collection('messages').add({
    de: { uid: 'agent', nom: 'Alex Durand', cote: 'equipe' },
    texte: 'Note interne de vérification.', pieces: [], interne: true,
    date: FieldValue.serverTimestamp(),
  });
  await pause(6000);
  const apresNote = await envoisDepuis(debut, 'message');
  if (apresNote.length > avantNote) {
    const neufs = apresNote.slice(avantNote);
    dire('une note interne déclenche un e-mail : '
      + JSON.stringify(neufs.map((e) => ({ a: (e.a || []).map((d) => d.email), extrait: String((e.variables || {}).texte || '').slice(0, 60) }))));
  }
  else ok('une note interne ne déclenche aucun e-mail');

  /* 4. Changement de statut --------------------------------------------- */
  console.log('\n== Le statut change');
  await ref.update({ statut: 'resolu', resolu: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp() });
  const filResolu = await attendre(async () => {
    const l = await envoisDepuis(debut, 'resolu');
    return l.length ? l : null;
  });
  if (!filResolu) dire("aucun e-mail mis en file pour un ticket résolu");
  else ok('e-mail « resolu » en file');

  const histoStatut = await attendre(async () => {
    const q = await ref.collection('evenements').where('type', '==', 'statut').get();
    return q.size ? q.size : null;
  });
  if (!histoStatut) dire("le changement de statut n est pas historisé");
  else ok('le changement de statut est historisé');

  /* 5. Un devis déposé --------------------------------------------------- */
  console.log('\n== Un devis est déposé');
  const dref = await bdd.collection('documents').add({
    projet: 'atelier', type: 'devis', numero: 'D-ESSAI-1',
    libelle: 'Devis de vérification', montant: 1200, statut: 'envoye',
    fichier: { chemin: 'documents/atelier/essai.pdf', nom: 'essai.pdf', taille: 1024 },
    cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
  });
  const filDevis = await attendre(async () => {
    const l = await envoisDepuis(debut, 'devis');
    return l.length ? l : null;
  });
  if (!filDevis) dire("aucun e-mail mis en file pour un devis");
  else ok('e-mail « devis » en file');

  /* 6. Le client accepte le devis ---------------------------------------- */
  await dref.update({ statut: 'accepte', maj: FieldValue.serverTimestamp() });
  const filAccepte = await attendre(async () => {
    const l = await envoisDepuis(0, 'devis-reponse');
    return l.length ? l : null;
  }, 20);
  if (!filAccepte) dire("l acceptation d un devis ne prévient pas l équipe");
  else ok("l acceptation du devis prévient l équipe");

  /* 7. Les envois en échec sont marqués, pas perdus ----------------------- */
  console.log('\n== Sans clé Brevo');
  const marques = await attendre(async () => {
    const q = await bdd.collection('envois').get();
    const l = q.docs.map((d) => d.data()).filter((e) => e.etat && e.etat !== 'en-attente');
    return l.length ? l : null;
  }, 30);
  if (!marques) dire("les envois restent sans état, impossible de les rejouer");
  else ok(`les envois sont marqués (${[...new Set(marques.map((e) => e.etat))].join(', ')})`);


  /* 8. La porte d administration ----------------------------------------- */
  console.log('\n== La console écrit par la fonction serveur');
  const PORTE = `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT || 'capmedia-1f90d'}/europe-west1/suiviAdmin`;
  const CLE = process.env.ADMIN_CLE_ESSAI || 'cle-essai-locale';
  const appeler = async (corps) => {
    const r = await fetch(PORTE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch (e) { /* réponse en texte */ }
    return { code: r.status, texte, json };
  };

  const sansCle = await appeler({ action: 'creerProjet', ref: 'PIRATE', nom: 'Pirate' });
  if (sansCle.code !== 403) dire(`sans clé, la porte répond ${sansCle.code} au lieu de 403`);
  else ok('sans clé, la porte refuse');

  const mauvaiseCle = await appeler({ cle: 'au-hasard', action: 'creerProjet', ref: 'PIRATE', nom: 'Pirate' });
  if (mauvaiseCle.code !== 403) dire(`avec une fausse clé, la porte répond ${mauvaiseCle.code}`);
  else ok('avec une fausse clé, la porte refuse');

  const refMauvaise = await appeler({ cle: CLE, action: 'creerProjet', ref: 'a b', nom: 'Essai' });
  if (refMauvaise.code !== 400) dire(`une référence illisible passe (${refMauvaise.code})`);
  else ok('une référence illisible est refusée');

  const creation = await appeler({
    cle: CLE, action: 'creerProjet', ref: 'ESSAI', nom: 'Projet d essai',
    client: { nom: 'Client Essai', email: 'client.essai@exemple.test', entreprise: 'Essai SARL' },
    plateformes: ['web'],
  });
  if (creation.code !== 200) dire(`création de projet refusée : ${creation.code} ${creation.texte.slice(0, 80)}`);
  else ok('un projet est créé depuis la console');
  const projetNeuf = creation.json && (creation.json.id || creation.json.projet);

  const doublon = await appeler({
    cle: CLE, action: 'creerProjet', ref: 'ESSAI', nom: 'Doublon',
    client: { nom: 'x', email: 'x@exemple.test' },
  });
  if (doublon.code === 200) dire('deux projets peuvent porter la même référence');
  else ok('une référence déjà prise est refusée');

  if (projetNeuf) {
    const invit = await appeler({
      cle: CLE, action: 'inviterClient', projet: projetNeuf,
      email: 'client.essai@exemple.test', nom: 'Client Essai',
    });
    if (invit.code !== 200) dire(`invitation refusée : ${invit.code} ${invit.texte.slice(0, 80)}`);
    else {
      const fiche = (await bdd.doc(`projets/${projetNeuf}`).get()).data();
      if (!fiche.membres || !fiche.membres.includes(invit.json.uid)) dire("l invité n est pas membre du projet");
      else ok('le client invité devient membre du projet');
      const jeton = invit.json.revendications || {};
      if (!jeton.projets || !jeton.projets.includes(projetNeuf)) dire('les revendications du jeton ne suivent pas');
      else ok('le jeton du client porte bien son projet');
    }

    const filInvit = await attendre(async () => {
      const l = await envoisDepuis(0, 'invitation');
      return l.length ? l : null;
    }, 20);
    if (!filInvit) dire("l invitation ne part pas par e-mail");
    else ok("l invitation est mise en file");

    const depot = await appeler({
      cle: CLE, action: 'deposerDocument', projet: projetNeuf, type: 'facture',
      numero: 'F-ESSAI-1', libelle: 'Facture d essai', montant: 500,
      fichier: { chemin: 'documents/essai.pdf', nom: 'essai.pdf', taille: 10 },
    });
    if (depot.code !== 200) dire(`dépôt de facture refusé : ${depot.code} ${depot.texte.slice(0, 80)}`);
    else ok('une facture est déposée depuis la console');

    const montantFaux = await appeler({
      cle: CLE, action: 'deposerDocument', projet: projetNeuf, type: 'facture',
      numero: 'F-ESSAI-2', libelle: 'Montant absurde', montant: -10,
    });
    if (montantFaux.code !== 400) dire('un montant négatif est accepté');
    else ok('un montant négatif est refusé');

    if (depot.json && depot.json.id) {
      const paye = await appeler({ cle: CLE, action: 'statutFacture', id: depot.json.id, statut: 'payee' });
      if (paye.code !== 200) dire(`le passage à payée échoue : ${paye.code} ${paye.texte.slice(0, 80)}`);
      else {
        const apresPaiement = (await bdd.doc(`documents/${depot.json.id}`).get()).data();
        if (apresPaiement.statut !== 'payee') dire('le statut de la facture ne change pas');
        else ok('une facture passe à payée');
      }
      const statutFaux = await appeler({ cle: CLE, action: 'statutFacture', id: depot.json.id, statut: 'inventé' });
      if (statutFaux.code !== 400) dire('un statut de facture inconnu est accepté');
      else ok('un statut de facture inconnu est refusé');
    }

    const retrait = await appeler({
      cle: CLE, action: 'retirerClient', projet: projetNeuf, email: 'client.essai@exemple.test',
    });
    if (retrait.code !== 200) dire(`retrait refusé : ${retrait.code}`);
    else {
      const fiche = (await bdd.doc(`projets/${projetNeuf}`).get()).data();
      if ((fiche.membres || []).includes(retrait.json.uid)) dire('le client retiré reste membre');
      else ok('le client retiré perd son accès');
      const jeton = retrait.json.revendications || {};
      if ((jeton.projets || []).includes(projetNeuf)) dire('le jeton garde le projet après retrait');
      else ok('le jeton est recalculé après retrait');
    }
  }

  const equipeNeuve = await appeler({
    cle: CLE, action: 'ajouterEquipe', email: 'agent.essai@capmedia.app', nom: 'Agent Essai', role: 'agent',
  });
  if (equipeNeuve.code !== 200) dire(`ajout d un membre d équipe refusé : ${equipeNeuve.code} ${equipeNeuve.texte.slice(0, 80)}`);
  else {
    const fiche = await bdd.doc(`equipe/${equipeNeuve.json.uid}`).get();
    if (!fiche.exists) dire("la fiche d équipe n est pas écrite");
    else ok("un membre d équipe est ajouté avec sa fiche");
  }

  const actionInconnue = await appeler({ cle: CLE, action: 'toutEffacer' });
  if (actionInconnue.code === 200) dire('une action inconnue est exécutée');
  else ok('une action inconnue est rejetée');

  console.log(soucis.length ? `\n${soucis.length} écart(s)` : '\nCOUCHE SERVEUR CONFORME');
  process.exit(soucis.length ? 1 : 0);
})();
