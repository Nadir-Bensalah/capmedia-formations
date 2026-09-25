/* ==========================================================================
   Une base « avant Gate 1 », entièrement fictive.

   Reproduit l'ANCIEN rangement de production, tel que l'ancien code
   l'écrivait : champs internes posés sur les fiches que le client lit,
   profil commun des testeurs, fichiers et PDF à l'ancien chemin Storage,
   pièces de note interne sans marque. Plusieurs éléments de chaque sorte,
   et les cas limites que la migration doit savoir traiter :
   - une note d'organisation vide, un paiement sans note ;
   - un PDF déclaré dont l'objet manque (orphelin) ;
   - un fichier rangé hors de son projet ;
   - une pièce jointe à la fois à une note interne et à une réponse publique ;
   - un testeur inactif qui garde un profil commun ;
   - un membre d'équipe inactif ;
   - un fichier déjà au nouveau chemin (déposé après les nouvelles fonctions).

   Les déclencheurs sont coupés pendant le semis (API du hub des émulateurs) :
   c'est l'état que la production a AUJOURD'HUI, pas ce que les nouvelles
   fonctions en feraient. Ils sont rallumés à la fin.

   Tout est préfixé « pf- » ; les adresses sont en @exemple.test.
   ========================================================================== */

import { Timestamp } from 'firebase-admin/firestore';

export const PREFIXE = 'pf-';
const T = (iso) => Timestamp.fromDate(new Date(iso));
const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';

export const declencheurs = async (allumes) => {
  const r = await fetch(`http://${HUB}/functions/${allumes ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
  if (!r.ok) throw new Error(`hub des émulateurs injoignable (${r.status})`);
};

/* Les comptes : un client sur deux projets, un client sur le projet fermé,
   un agent, un testeur. Les jetons portent ce que l'ancien serveur posait. */
export const COMPTES = [
  { uid: 'pf-client-a', email: 'client.a@exemple.test', nom: 'Client A fictif', revendications: { projets: ['pf-ouvert-1', 'pf-ouvert-2'] } },
  { uid: 'pf-client-b', email: 'client.b@exemple.test', nom: 'Client B fictif', revendications: { projets: ['pf-ferme'] } },
  { uid: 'pf-agent-1', email: 'agent.pf@exemple.test', nom: 'Agent fictif', revendications: { equipe: true } },
  { uid: 'pf-testeur-1', email: 'testeur.un@essai.test', nom: 'Testeur un', revendications: { testeur: true } },
];

const par = (uid, nom, cote) => ({ uid, nom, cote });
const CLIENT = par('pf-client-a', 'Client A fictif', 'client');
const AGENT = par('pf-agent-1', 'Agent fictif', 'equipe');

/* Chaque objet a un contenu distinct : l'empreinte md5 suffit à le suivre. */
const OBJETS = [
  ['projets/pf-ouvert-1/documents/client/1720000000-cahier.pdf', 'application/pdf', { firebaseStorageDownloadTokens: 'jeton-fictif-1' }],
  ['projets/pf-ouvert-1/documents/fichiers/1720000001-maquette.png', 'image/png', { firebaseStorageDownloadTokens: 'jeton-fictif-2' }],
  ['projets/pf-ouvert-1/documents/fichiers/1720000002-marge.txt', 'text/plain', null],
  ['projets/pf-ouvert-1/documents/fichiers/1720000003-ancienne.png', 'image/png', null],
  ['projets/pf-ouvert-2/documents/fichiers/1720000004-charte.pdf', 'application/pdf', null],
  ['projets/pf-ouvert-2/documents/client/1720000005-logo.png', 'image/png', null],
  ['projets/pf-ouvert-1/fichiers/pf-fic-neuf/recent.png', 'image/png', null],
  ['projets/pf-ouvert-1/documents/fichiers/1720000006-egare.png', 'image/png', null],
  ['projets/pf-ouvert-1/documents/devis/1720000010-devis-1.pdf', 'application/pdf', { firebaseStorageDownloadTokens: 'jeton-fictif-3' }],
  ['projets/pf-ouvert-1/documents/devis/1720000011-devis-2.pdf', 'application/pdf', null],
  ['projets/pf-ouvert-1/documents/facture/1720000012-facture-1.pdf', 'application/pdf', null],
  ['projets/pf-ferme/documents/facture/1720000013-facture-2.pdf', 'application/pdf', null],
  ['projets/pf-ouvert-1/tickets/pf-t-1/capture-client.png', 'image/png', null],
  ['projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png', 'image/png', null],
  ['projets/pf-ouvert-1/tickets/pf-t-1/partagee.png', 'image/png', null],
  ['projets/pf-ouvert-1/tickets/nouveau/1720000020-premiere.png', 'image/png', null],
  ['projets/pf-ouvert-2/tickets/pf-t-3/note-interne-2.png', 'image/png', null],
  ['projets/pf-ouvert-1/documents/validations/1720000030-maquette-v2.png', 'image/png', null],
  ['projets/pf-ouvert-1/messages/1720000040-plan.pdf', 'application/pdf', null],
  ['campagnes/pf-ouvert-1/pf-camp/pf-testeur-1/preuve-1.png', 'image/png', null],
];

export const semerAvantGate1 = async ({ bdd, seau, auth = null }) => {
  await declencheurs(false);
  try {
    const lot = [];
    const poser = (chemin, donnees) => lot.push([chemin, donnees]);

    /* L'équipe, dont un membre parti. */
    poser('equipe/pf-agent-1', { nom: 'Agent fictif', email: 'agent.pf@exemple.test', role: 'admin', actif: true });
    poser('equipe/pf-agent-2', { nom: 'Ancien agent', email: 'ancien.pf@exemple.test', role: 'agent', actif: false });

    /* Les organisations : une note, une note vide, pas de champ. */
    poser('organisations/pf-org-a', { nom: 'Contact A', entreprise: 'Organisation A fictive', email: 'client.a@exemple.test', contacts: [], membres: ['pf-client-a'], roles: {}, notesInternes: 'Paie toujours à 45 jours, négocie chaque ligne.', cree: T('2026-05-01T09:00:00Z') });
    poser('organisations/pf-org-b', { nom: 'Contact B', entreprise: 'Organisation B fictive', email: 'client.b@exemple.test', contacts: [], membres: ['pf-client-b'], roles: {}, notesInternes: '', cree: T('2026-05-02T09:00:00Z') });
    poser('organisations/pf-org-c', { nom: 'Contact C', entreprise: 'Organisation C fictive', email: 'contact.c@exemple.test', contacts: [], membres: [], roles: {}, cree: T('2026-05-03T09:00:00Z') });

    /* Les projets : deux ouverts, un fermé au client, un interne. */
    const projet = (id, champs) => poser(`projets/${id}`, { nom: `Projet ${id}`, ref: id.toUpperCase().replace(/[^A-Z0-9]/g, ''), plateformes: ['web'], cree: T('2026-06-01T09:00:00Z'), ...champs });
    projet('pf-ouvert-1', { organisation: 'pf-org-a', membres: ['pf-client-a'], ouvert: true, statut: 'en-cours', budget: 12400, budgetNote: 'Forfait, marge faible sur le module paiement.', sante: 'attention' });
    projet('pf-ouvert-2', { organisation: 'pf-org-a', membres: ['pf-client-a'], ouvert: true, statut: 'cadrage', budget: 3800, sante: 'ok' });
    projet('pf-ferme', { organisation: 'pf-org-b', membres: ['pf-client-b'], ouvert: false, statut: 'termine', budget: 900, budgetNote: '', sante: 'bloque' });
    projet('pf-interne', { interne: true, membres: [], statut: 'en-cours', budget: null, budgetNote: 'Temps passé non facturé.' });

    /* Les pièces comptables. */
    const piece = (id, champs) => poser(`documents/${id}`, { date: T('2026-07-01T09:00:00Z'), ...champs });
    piece('pf-devis-1', { projet: 'pf-ouvert-1', type: 'devis', numero: 'D-PF-1', libelle: 'Devis initial', montant: 12400, statut: 'envoye', fichier: { nom: 'devis-1.pdf', chemin: 'projets/pf-ouvert-1/documents/devis/1720000010-devis-1.pdf', taille: 30 } });
    piece('pf-devis-2', { projet: 'pf-ouvert-1', type: 'devis', numero: 'D-PF-2', libelle: 'Avenant en préparation', montant: 2100, statut: 'brouillon', fichier: { nom: 'devis-2.pdf', chemin: 'projets/pf-ouvert-1/documents/devis/1720000011-devis-2.pdf', taille: 30 } });
    piece('pf-fact-1', { projet: 'pf-ouvert-1', type: 'facture', numero: 'F-PF-1', libelle: 'Acompte', montant: 4000, ttc: 4800, statut: 'payee', fichier: { nom: 'facture-1.pdf', chemin: 'projets/pf-ouvert-1/documents/facture/1720000012-facture-1.pdf', taille: 30 } });
    piece('pf-fact-2', { projet: 'pf-ferme', type: 'facture', numero: 'F-PF-2', libelle: 'Solde', montant: 900, ttc: 1080, statut: 'partielle', fichier: { nom: 'facture-2.pdf', chemin: 'projets/pf-ferme/documents/facture/1720000013-facture-2.pdf', taille: 30 } });
    piece('pf-fact-3', { projet: 'pf-ouvert-2', type: 'facture', numero: 'F-PF-3', libelle: 'Sans PDF', montant: 500, statut: 'a-payer' });
    piece('pf-fact-4', { projet: 'pf-ouvert-2', type: 'facture', numero: 'F-PF-4', libelle: 'PDF perdu', montant: 700, statut: 'a-payer', fichier: { nom: 'perdu.pdf', chemin: 'projets/pf-ouvert-2/documents/facture/1720000014-perdu.pdf', taille: 30 } });

    /* Les paiements : une note, une note vide, pas de note. */
    poser('paiements/pf-pay-1', { projet: 'pf-ouvert-1', facture: 'pf-fact-1', montant: 4800, moyen: 'virement', statut: 'valide', note: 'Reçu après deux relances.', date: T('2026-07-15T09:00:00Z') });
    poser('paiements/pf-pay-2', { projet: 'pf-ferme', facture: 'pf-fact-2', montant: 500, moyen: 'carte', statut: 'valide', note: '', date: T('2026-08-01T09:00:00Z') });
    poser('paiements/pf-pay-3', { projet: 'pf-ferme', facture: 'pf-fact-2', montant: 80, moyen: 'autre', statut: 'valide', date: T('2026-08-02T09:00:00Z') });

    /* Les fichiers. */
    const fichier = (id, champs) => poser(`fichiers/${id}`, { taille: 1, type: 'application/octet-stream', version: '', cree: T('2026-07-02T09:00:00Z'), ...champs });
    fichier('pf-fic-client', { projet: 'pf-ouvert-1', nom: 'cahier.pdf', chemin: 'projets/pf-ouvert-1/documents/client/1720000000-cahier.pdf', visibilite: 'client', categorie: 'documents', par: CLIENT });
    fichier('pf-fic-visible', { projet: 'pf-ouvert-1', nom: 'maquette.png', chemin: 'projets/pf-ouvert-1/documents/fichiers/1720000001-maquette.png', visibilite: 'client', categorie: 'design', par: AGENT });
    fichier('pf-fic-interne', { projet: 'pf-ouvert-1', nom: 'marge.txt', chemin: 'projets/pf-ouvert-1/documents/fichiers/1720000002-marge.txt', visibilite: 'interne', categorie: 'technique', par: AGENT });
    fichier('pf-fic-archive', { projet: 'pf-ouvert-1', nom: 'ancienne.png', chemin: 'projets/pf-ouvert-1/documents/fichiers/1720000003-ancienne.png', visibilite: 'client', archive: true, par: AGENT });
    fichier('pf-fic-autre', { projet: 'pf-ouvert-2', nom: 'charte.pdf', chemin: 'projets/pf-ouvert-2/documents/fichiers/1720000004-charte.pdf', visibilite: 'client', par: AGENT });
    fichier('pf-fic-client-2', { projet: 'pf-ouvert-2', nom: 'logo.png', chemin: 'projets/pf-ouvert-2/documents/client/1720000005-logo.png', visibilite: 'client', par: CLIENT });
    fichier('pf-fic-neuf', { projet: 'pf-ouvert-1', nom: 'recent.png', chemin: 'projets/pf-ouvert-1/fichiers/pf-fic-neuf/recent.png', visibilite: 'client', par: AGENT });
    fichier('pf-fic-egare', { projet: 'pf-ouvert-2', nom: 'egare.png', chemin: 'projets/pf-ouvert-1/documents/fichiers/1720000006-egare.png', visibilite: 'client', par: AGENT });

    /* Les demandes et leurs messages (notes internes, pièces). */
    poser('tickets/pf-t-1', { projet: 'pf-ouvert-1', numero: 'PF-001', titre: 'Le paiement échoue', type: 'bug', statut: 'en-cours', urgence: 'important', auteur: { uid: 'pf-client-a', nom: 'Client A fictif', email: 'client.a@exemple.test', cote: 'client' }, pieces: [{ nom: 'premiere.png', chemin: 'projets/pf-ouvert-1/tickets/nouveau/1720000020-premiere.png' }], cree: T('2026-08-10T09:00:00Z'), maj: T('2026-08-11T09:00:00Z') });
    poser('tickets/pf-t-2', { projet: 'pf-ouvert-2', numero: 'PF-002', titre: 'Changer le logo', type: 'evolution', statut: 'nouveau', urgence: 'normal', auteur: { uid: 'pf-client-a', nom: 'Client A fictif', email: 'client.a@exemple.test', cote: 'client' }, cree: T('2026-08-12T09:00:00Z'), maj: T('2026-08-12T09:00:00Z') });
    poser('tickets/pf-t-3', { projet: 'pf-ouvert-2', numero: 'PF-003', titre: 'Lenteur', type: 'bug', statut: 'en-attente-client', urgence: 'normal', auteur: { uid: 'pf-client-a', nom: 'Client A fictif', email: 'client.a@exemple.test', cote: 'client' }, cree: T('2026-08-13T09:00:00Z'), maj: T('2026-08-13T09:00:00Z') });
    const msg = (t, id, de, texte, interne, pieces, iso) => poser(`tickets/${t}/messages/${id}`, { de, texte, interne, pieces, date: T(iso) });
    msg('pf-t-1', 'm1', { ...CLIENT }, 'Voici la capture.', false, [{ nom: 'capture-client.png', chemin: 'projets/pf-ouvert-1/tickets/pf-t-1/capture-client.png' }, { nom: 'partagee.png', chemin: 'projets/pf-ouvert-1/tickets/pf-t-1/partagee.png' }], '2026-08-10T10:00:00Z');
    msg('pf-t-1', 'm2', { ...AGENT }, 'Note interne : la marge du module est serrée.', true, [{ nom: 'note-interne.png', chemin: 'projets/pf-ouvert-1/tickets/pf-t-1/note-interne.png' }, { nom: 'partagee.png', chemin: 'projets/pf-ouvert-1/tickets/pf-t-1/partagee.png' }], '2026-08-10T11:00:00Z');
    msg('pf-t-1', 'm3', { ...AGENT }, 'Nous regardons, retour demain.', false, [], '2026-08-10T12:00:00Z');
    msg('pf-t-3', 'm1', { ...AGENT }, 'Note interne : attendre leur hébergeur.', true, [{ nom: 'note-interne-2.png', chemin: 'projets/pf-ouvert-2/tickets/pf-t-3/note-interne-2.png' }], '2026-08-13T10:00:00Z');
    msg('pf-t-3', 'm2', { ...AGENT }, 'Pouvez-vous nous donner l accès ?', false, [], '2026-08-13T11:00:00Z');

    /* Une validation, la conversation du projet. */
    poser('validations/pf-val-1', { projet: 'pf-ouvert-1', titre: 'Valider la maquette v2', statut: 'en-attente', pieces: [{ nom: 'maquette-v2.png', chemin: 'projets/pf-ouvert-1/documents/validations/1720000030-maquette-v2.png' }], cree: T('2026-08-14T09:00:00Z') });
    poser('projets/pf-ouvert-1/messages/pm1', { de: { ...AGENT }, texte: 'Le plan de la semaine.', pieces: [{ nom: 'plan.pdf', chemin: 'projets/pf-ouvert-1/messages/1720000040-plan.pdf' }], date: T('2026-08-15T09:00:00Z') });
    poser('projets/pf-ouvert-1/messages/pm2', { de: { ...CLIENT }, texte: 'Merci, reçu.', pieces: [], date: T('2026-08-15T10:00:00Z') });

    /* Les testeurs : deux actifs sur des projets différents, un parti. */
    const testeur = (id, champs) => poser(`testeurs/${id}`, { email: `${id.replace('pf-', '')}@essai.test`, actif: true, plateformes: ['web', 'android'], mobile: 'android', ...champs });
    testeur('pf-testeur-1', { prenom: 'Testeur un', projets: ['pf-ouvert-1', 'pf-ouvert-2'], profil: { sexe: 'femme', age: '25-34', fonction: 'Infirmière', aisance: "À l'aise", langue: 'fr' } });
    testeur('pf-testeur-2', { prenom: 'Testeur deux', projets: ['pf-ouvert-1'], profil: { sexe: 'homme', age: '45-54', fonction: 'Artisan', aisance: 'Moyenne' } });
    testeur('pf-testeur-3', { prenom: 'Testeur parti', projets: ['pf-ouvert-2'], actif: false, profil: { age: '18-24' } });
    for (const [id, projets, profil, extra] of [['pf-testeur-1', ['pf-ouvert-1', 'pf-ouvert-2'], { sexe: 'femme', age: '25-34', fonction: 'Infirmière', aisance: "À l'aise", langue: 'fr' }, {}], ['pf-testeur-2', ['pf-ouvert-1'], { sexe: 'homme', age: '45-54', fonction: 'Artisan', aisance: 'Moyenne', langue: '' }, {}], ['pf-testeur-3', ['pf-ouvert-2'], { sexe: '', age: '18-24', fonction: '', aisance: '', langue: '' }, {}]]) {
      poser(`testeurs/${id}/public/profil`, { ...profil, mobile: 'android', plateformes: ['web', 'android'], projets, maj: T('2026-08-01T09:00:00Z'), ...extra });
    }

    /* Une campagne en cours, des passages. */
    poser('projets/pf-ouvert-1/scenarios/PF-01', { ref: 'PF-01', titre: 'Payer une commande', attendu: 'Le paiement passe.', plateformes: ['web'] });
    poser('projets/pf-ouvert-1/campagnes/pf-camp', { titre: 'Campagne fictive', statut: 'en-cours', actif: true, testeurs: ['pf-testeur-1', 'pf-testeur-2'], scenarios: ['PF-01'], maj: T('2026-08-20T09:00:00Z') });
    poser('projets/pf-ouvert-1/campagnes/pf-camp/passages/pf-testeur-1__PF-01', { scenario: 'PF-01', testeur: 'pf-testeur-1', plateforme: 'web', resultat: 'ko', commentaire: 'Le bouton ne répond pas', preuves: ['campagnes/pf-ouvert-1/pf-camp/pf-testeur-1/preuve-1.png'], le: T('2026-08-21T09:00:00Z') });
    poser('projets/pf-ouvert-1/campagnes/pf-camp/passages/pf-testeur-2__PF-01', { scenario: 'PF-01', testeur: 'pf-testeur-2', plateforme: 'web', resultat: 'ok', commentaire: '', preuves: [], le: T('2026-08-21T10:00:00Z') });

    /* Ce que les fonctions ont déjà produit : ce qui ne doit PAS bouger. */
    poser('envois/pf-envoi-1', { modele: 'message', a: [{ email: 'client.a@exemple.test' }], etat: 'envoye', cree: T('2026-08-10T12:01:00Z') });
    poser('activite/pf-act-1', { projet: 'pf-ouvert-1', type: 'demande', texte: 'a ouvert la demande « Le paiement échoue »', visibilite: 'client', date: T('2026-08-10T09:00:00Z') });
    poser('audit/pf-audit-1', { action: 'devis', projet: 'pf-ouvert-1', date: T('2026-07-01T09:00:00Z') });
    poser('boites/pf-client-a/notifications/pf-n-1', { type: 'message', titre: 'Nouveau message', lu: false, date: T('2026-08-10T12:00:00Z') });

    for (let i = 0; i < lot.length; i += 400) {
      const b = bdd.batch();
      for (const [chemin, donnees] of lot.slice(i, i + 400)) b.set(bdd.doc(chemin), donnees);
      await b.commit();
    }
    for (const [chemin, type, meta] of OBJETS) {
      await seau.file(chemin).save(Buffer.from(`contenu fictif de ${chemin}`), { contentType: type, metadata: meta ? { metadata: meta } : undefined });
    }
    if (auth) {
      for (const c of COMPTES) {
        try { await auth.deleteUser(c.uid); } catch { /* absent */ }
        await auth.createUser({ uid: c.uid, email: c.email, emailVerified: true, displayName: c.nom });
        await auth.setCustomUserClaims(c.uid, c.revendications);
      }
    }
    return { documents: lot.length, objets: OBJETS.length };
  } finally {
    await declencheurs(true);
  }
};

/* Vide la base et le Storage de l'émulateur (jamais hors émulateur). */
export const viderEmulateur = async ({ bdd, seau, projet }) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('viderEmulateur : émulateurs requis');
  await declencheurs(false);
  try {
    const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projet}/databases/(default)/documents`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`vidage Firestore refusé (${r.status})`);
    await seau.deleteFiles({ force: true });
  } finally { await declencheurs(true); }
  void bdd;
};
