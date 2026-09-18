/* ==========================================================================
   Ouvre les premiers comptes de l'espace de suivi, une fois les fonctions
   déployées. Tout passe par suiviAdmin : aucune clé de compte de service
   n'est nécessaire, seule la clé d'administration.

   Usage :
     ADMIN_CLE=... node fonctions-suivi/outils/ouvrir-comptes.mjs

   Le script est idempotent : relancé, il ne crée pas de doublon.
   ========================================================================== */

const PROJET = process.env.PROJET_FIREBASE || 'capmedia-1f90d';
const PORTE = process.env.PORTE_SUIVI
  || `https://europe-west1-${PROJET}.cloudfunctions.net/suiviAdmin`;
const CLE = process.env.ADMIN_CLE;

if (!CLE) {
  console.error('ADMIN_CLE manquante. Relancez avec ADMIN_CLE=... devant la commande.');
  process.exit(1);
}

/* Les comptes à ouvrir. Modifiez les adresses ici, rien ailleurs.
   Chaque compte d'équipe en rôle « admin » voit tous les projets. */
const ADMINS = (process.env.ADMINS || 'contact@capmedia.app')
  .split(',').map((e) => ({ email: e.trim(), nom: process.env.ADMIN_NOM || '' }))
  .filter((a) => a.email);
const DEMO = {
  ref: 'DEMO',
  nom: 'Projet de démonstration',
  client: {
    nom: 'Client de démonstration',
    email: 'capmediadigital.agence@gmail.com',
    entreprise: 'Capmedia Digital',
  },
  plateformes: ['ios', 'android', 'web'],
};

const appeler = async (corps) => {
  const reponse = await fetch(PORTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cle: CLE, ...corps }),
  });
  const texte = await reponse.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte brut */ }
  return { code: reponse.status, texte, json };
};

(async () => {
  console.log('Porte :', PORTE, '\n');

  /* 1. Les comptes d'équipe. La fiche equipe/{uid} ouvre l'accès à tous les
        projets côté Firestore, la revendication « equipe » côté stockage. */
  for (const admin of ADMINS) {
    const equipe = await appeler({
      action: 'ajouterEquipe', email: admin.email, nom: admin.nom, role: 'admin',
    });
    if (equipe.code !== 200) {
      console.error('Compte d équipe refusé :', admin.email, equipe.code, equipe.texte);
      process.exit(1);
    }
    console.log('Compte d équipe  :', admin.email, '→', equipe.json.uid);
  }

  /* 2. Le projet de démonstration. Une référence déjà prise est refusée :
        on le relit alors plutôt que d'échouer. */
  let projetId = null;
  const creation = await appeler({
    action: 'creerProjet', ref: DEMO.ref, nom: DEMO.nom,
    client: DEMO.client, plateformes: DEMO.plateformes,
  });
  if (creation.code === 200) {
    projetId = creation.json.id || creation.json.projet;
    console.log('Projet créé      :', DEMO.nom, '→', projetId);
  } else if (/déjà|deja|prise|existe/i.test(creation.texte)) {
    projetId = DEMO.ref.toLowerCase();
    console.log('Projet déjà là   :', projetId);
  } else {
    console.error('Création du projet refusée :', creation.code, creation.texte);
    process.exit(1);
  }

  /* 3. Le client de démonstration, rattaché à ce seul projet. */
  const invitation = await appeler({
    action: 'inviterClient', projet: projetId,
    email: DEMO.client.email, nom: DEMO.client.nom,
  });
  if (invitation.code !== 200) {
    console.error('Invitation refusée :', invitation.code, invitation.texte);
    process.exit(1);
  }
  console.log('Compte client    :', DEMO.client.email, '→', invitation.json.uid);
  console.log('Ses projets      :', (invitation.json.revendications || {}).projets);

  console.log('\nLes deux comptes sont ouverts. La connexion se fait sur');
  console.log('https://capmedia.app/suivi/ : on saisit l adresse, on reçoit');
  console.log('un lien par e-mail, et on entre. Aucun mot de passe.');
})();
