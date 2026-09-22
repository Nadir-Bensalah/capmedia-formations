/* ==========================================================================
   CAPMEDIA CLIENT HUB · la couche de données
   Ce que les vues lisent et écrivent, sans jamais composer une requête
   Firestore elles-mêmes. Les clés du magasin, les abonnements par projet,
   les écritures autorisées au navigateur, et les calculs dérivés (ce qui
   attend le lecteur, la progression, la prochaine réunion).

   Règle d'or : chaque forme écrite ici est reprise mot pour mot dans
   suivi/firestore.rules. Un champ ajouté ici sans sa règle est refusé.
   ========================================================================== */

import {
  bdd, collection, collectionGroup, query, where, orderBy, limit, doc, getDoc, addDoc, updateDoc, setDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
  nomAffiche, enDate, parDateDesc, parDateAsc, joursAvant, borner, age, retard, dateCourte,
  OUVERTS, ATTEND_CLIENT, ATTEND_EQUIPE, FACTURES_DUES, PROJETS_ACTIFS, CATEGORIES_CLIENT, projetEstActif,
  statutProjet, pluriel, verdictDelai, NIVEAUX_SCENARIO,
} from './noyau.js';
import * as magasin from './magasin.js';

/* ==========================================================================
   1. Les clés du magasin
   ========================================================================== */

export const K = {
  projet: (p) => `projet:${p}`,
  composants: (p) => `composants:${p}`,
  jalons: (p) => `jalons:${p}`,
  scenarios: (p) => `scenarios:${p}`,
  campagnes: (p) => `campagnes:${p}`,
  anomalies: (p) => `anomalies:${p}`,
  parcours: (p) => `parcours:${p}`,
  regles: (p) => `regles:${p}`,
  liens: (p) => `liens:${p}`,
  messages: (p) => `messages:${p}`,
  lectures: (p) => `lectures:${p}`,
  technique: (p) => `technique:${p}`,
  taches: (p) => `taches:${p}`,
  tickets: (p) => `tickets:${p}`,
  validations: (p) => `validations:${p}`,
  fichiers: (p) => `fichiers:${p}`,
  releases: (p) => `releases:${p}`,
  reunions: (p) => `reunions:${p}`,
  notes: (p) => `notes:${p}`,
  blocages: (p) => `blocages:${p}`,
  documents: (p) => `documents:${p}`,
  paiements: (p) => `paiements:${p}`,
  activite: (p) => `activite:${p}`,
  messagesTicket: (t) => `ticket-messages:${t}`,
  evenementsTicket: (t) => `ticket-evenements:${t}`,
  ticket: (t) => `ticket:${t}`,
  messagesDemandeProjet: (d) => `preprojet-messages:${d}`,

  projets: 'projets',
  organisations: 'organisations',
  equipe: 'equipe',
  profil: 'profil',
  demandesProjet: 'demandes-projet',
  ticketsTous: 'tickets:*',
  tachesToutes: 'taches:*',
  validationsToutes: 'validations:*',
  documentsTous: 'documents:*',
  paiementsTous: 'paiements:*',
  activiteToute: 'activite:*',
  reunionsToutes: 'reunions:*',
  releasesToutes: 'releases:*',
  fichiersTous: 'fichiers:*',
  blocagesTous: 'blocages:*',
  jalonsTous: 'jalons:*',
  scenariosTous: 'scenarios:*',
  campagnesToutes: 'campagnes:*',
  anomaliesToutes: 'anomalies:*',
  parcoursTous: 'parcours:*',
  reglesToutes: 'regles:*',
  testeurs: 'testeurs',
  audit: 'audit',
  envois: 'envois',
};

/* ==========================================================================
   2. Les abonnements
   ========================================================================== */

const col = (...segments) => collection(bdd, ...segments);

/** Les collections d'un projet. Un client ne voit que ce qui lui est destiné. */
export const abonnerProjet = (lot, pid, role) => {
  const client = role !== 'equipe';
  const visible = (c) => (client ? query(c, where('visibilite', '==', 'client')) : c);
  const surProjet = (nom) => query(col(nom), where('projet', '==', pid));
  const surProjetVisible = (nom) => (client
    ? query(col(nom), where('projet', '==', pid), where('visibilite', '==', 'client'))
    : query(col(nom), where('projet', '==', pid)));

  lot.abonner(K.projet(pid), () => doc(bdd, 'projets', pid));
  lot.abonner(K.composants(pid), () => col('projets', pid, 'composants'));
  lot.abonner(K.jalons(pid), () => col('projets', pid, 'jalons'));
  lot.abonner(K.liens(pid), () => visible(col('projets', pid, 'liens')));
  lot.abonner(K.messages(pid), () => query(col('projets', pid, 'messages'), orderBy('date', 'asc'), limit(300)));
  lot.abonner(K.lectures(pid), () => col('projets', pid, 'lectures'));
  /* La fiche technique ne se lit que côté équipe : les règles refuseraient
     la requête à un client, et elle ne lui sert à rien. */
  if (!client) lot.abonner(K.technique(pid), () => col('projets', pid, 'technique'));
  /* La plateforme de tests. Les scénarios et les campagnes se lisent des
     deux côtés ; les anomalies aussi, puisque le client doit savoir ce qui
     a été trouvé. Seuls les passages restent cloisonnés, et ils se lisent
     campagne par campagne, à l'ouverture. */
  lot.abonner(K.scenarios(pid), () => col('projets', pid, 'scenarios'));
  lot.abonner(K.campagnes(pid), () => col('projets', pid, 'campagnes'));
  lot.abonner(K.anomalies(pid), () => col('projets', pid, 'anomalies'));
  lot.abonner(K.parcours(pid), () => col('projets', pid, 'parcours'));
  lot.abonner(K.regles(pid), () => col('projets', pid, 'regles'));
  lot.abonner(K.taches(pid), () => surProjetVisible('taches'));
  lot.abonner(K.tickets(pid), () => surProjet('tickets'));
  lot.abonner(K.validations(pid), () => surProjet('validations'));
  lot.abonner(K.fichiers(pid), () => surProjetVisible('fichiers'));
  lot.abonner(K.releases(pid), () => surProjetVisible('releases'));
  lot.abonner(K.reunions(pid), () => surProjetVisible('reunions'));
  lot.abonner(K.notes(pid), () => surProjetVisible('notes'));
  lot.abonner(K.blocages(pid), () => surProjetVisible('blocages'));
  lot.abonner(K.documents(pid), () => surProjet('documents'));
  lot.abonner(K.paiements(pid), () => surProjet('paiements'));
  lot.abonner(K.activite(pid), () => surProjetVisible('activite'));
};

/** Les collections globales : tout pour l'équipe, projet par projet pour un client. */
export const abonnerGlobal = (lot, session) => {
  const equipe = Boolean(session.equipe);
  lot.abonner(K.profil, () => doc(bdd, 'profils', session.utilisateur.uid));
  if (equipe) {
    lot.abonner(K.projets, () => query(col('projets'), orderBy('nom')));
    lot.abonner(K.organisations, () => query(col('organisations'), orderBy('nom')));
    lot.abonner(K.equipe, () => col('equipe'));
    lot.abonner(K.ticketsTous, () => col('tickets'));
    lot.abonner(K.tachesToutes, () => col('taches'));
    lot.abonner(K.validationsToutes, () => col('validations'));
    lot.abonner(K.documentsTous, () => col('documents'));
    lot.abonner(K.paiementsTous, () => col('paiements'));
    lot.abonner(K.reunionsToutes, () => col('reunions'));
    lot.abonner(K.releasesToutes, () => col('releases'));
    lot.abonner(K.blocagesTous, () => col('blocages'));
    lot.abonner(K.fichiersTous, () => col('fichiers'));
    lot.abonner(K.activiteToute, () => query(col('activite'), orderBy('date', 'desc'), limit(200)));
    lot.abonner(K.demandesProjet, () => col('demandesProjet'));
    lot.abonner(K.jalonsTous, () => collectionGroup(bdd, 'jalons'));
    /* La console de tests regarde tous les projets d'un coup : campagnes,
       anomalies et scénarios se lisent donc en groupe, comme les étapes. */
    lot.abonner(K.campagnesToutes, () => collectionGroup(bdd, 'campagnes'));
    lot.abonner(K.anomaliesToutes, () => collectionGroup(bdd, 'anomalies'));
    lot.abonner(K.parcoursTous, () => collectionGroup(bdd, 'parcours'));
    lot.abonner(K.reglesToutes, () => collectionGroup(bdd, 'regles'));
    lot.abonner(K.scenariosTous, () => collectionGroup(bdd, 'scenarios'));
    lot.abonner(K.testeurs, () => col('testeurs'));
  } else {
    const uid = session.utilisateur.uid;
    lot.abonner(K.projets, () => query(col('projets'), where('membres', 'array-contains', uid)));
    lot.abonner(K.organisations, () => query(col('organisations'), where('membres', 'array-contains', uid)));
    lot.abonner(K.demandesProjet, () => query(col('demandesProjet'), where('par.uid', '==', uid)));
    /* Pour mettre un nom sur le responsable du projet, au lieu de « Capmedia ». */
    lot.abonner(K.equipe, () => col('equipe'));

    /*
     * Les projets d'un client ne sont pas figés au chargement de la page.
     * Quand l'équipe lève le rideau sur un nouveau projet, la liste
     * change en direct : il faut s'abonner à ses sous-collections dans la
     * foulée, sinon le client voit apparaître un projet vide et doit
     * recharger pour en lire le contenu.
     */
    const suivis = new Set();
    const suivre = (projets) => {
      for (const p of projets || []) {
        if (!p || !p.id || suivis.has(p.id)) continue;
        const premier = !suivis.size;
        suivis.add(p.id);
        abonnerProjet(lot, p.id, 'client');
        /* Un projet arrivé après le montage des écrans amène ses pièces
           sur des clés qu'aucun d'eux n'écoute. On réveille donc la liste
           des projets, que tous écoutent, à mesure qu'elles arrivent. */
        if (!premier) {
          for (const cle of [K.documents(p.id), K.tickets(p.id), K.taches(p.id), K.fichiers(p.id), K.reunions(p.id), K.validations(p.id), K.jalons(p.id)]) {
            lot.sur(cle, () => magasin.reveiller(K.projets));
          }
        }
      }
    };
    suivre(session.projets);
    lot.sur(K.projets, suivre);
  }
};

/**
 * Pour un client, une vue « toutes collections » agrège ses projets.
 *
 * La liste vient du magasin, pas de la session : celle-ci est figée à la
 * connexion, et un projet ouvert entre-temps n'y figure pas. Le client
 * voyait alors le projet apparaître dans sa barre mais ni son devis ni
 * ses pièces, jusqu'au rechargement.
 */
export const agreger = (session, fabriqueCle) => {
  if (session.equipe) return magasin.lire(fabriqueCle('*')) || [];
  const projets = magasin.lire(K.projets) || session.projets || [];
  return projets.flatMap((p) => magasin.lire(fabriqueCle(p.id)) || []);
};
const cleGlobale = (nom) => (p) => (p === '*' ? `${nom}:*` : `${nom}:${p}`);
export const G = {
  tickets: cleGlobale('tickets'),
  taches: cleGlobale('taches'),
  validations: cleGlobale('validations'),
  documents: cleGlobale('documents'),
  paiements: cleGlobale('paiements'),
  reunions: cleGlobale('reunions'),
  releases: cleGlobale('releases'),
  blocages: cleGlobale('blocages'),
  fichiers: cleGlobale('fichiers'),
  activite: cleGlobale('activite'),
};

/* ==========================================================================
   3. Qui écrit
   ========================================================================== */

export const auteurDe = (session) => ({
  uid: session.utilisateur.uid,
  nom: nomAffiche(session),
  email: session.utilisateur.email || '',
  cote: session.equipe ? 'equipe' : 'client',
});

const nettoyer = (objet) => {
  const propre = {};
  for (const [k, v] of Object.entries(objet)) if (v !== undefined) propre[k] = v;
  return propre;
};

const dateOuNull = (valeur) => {
  const d = enDate(valeur);
  return d ? Timestamp.fromDate(d) : null;
};

/* ==========================================================================
   4. Les écritures
   ========================================================================== */

export const ecrire = {
  /* --- Les demandes -------------------------------------------------- */
  async creerDemande(session, pid, d, pieces = []) {
    const auteur = auteurDe(session);
    const fiche = {
      numero: null, projet: pid, composant: d.composant || '',
      titre: d.titre, description: d.description, type: d.type, urgence: d.urgence || 'important',
      statut: 'nouveau', plateforme: d.plateforme || '', version: d.version || '',
      etapes: d.etapes || '', attendu: d.attendu || '', obtenu: d.obtenu || '',
      contexte: d.contexte || '', appareil: d.appareil || '', liens: Array.isArray(d.liens) ? d.liens : [],
      assigne: null, auteur, pieces, archive: false,
      cree: serverTimestamp(), maj: serverTimestamp(), resolu: null,
      lu: { client: auteur.cote === 'client' ? serverTimestamp() : null, equipe: auteur.cote === 'equipe' ? serverTimestamp() : null },
      qualification: null, devis: null,
    };
    const ref = await addDoc(col('tickets'), fiche);
    return ref.id;
  },

  async messageDemande(session, tid, texte, pieces = [], interne = false) {
    const de = auteurDe(session);
    await addDoc(col('tickets', tid, 'messages'), {
      de: { uid: de.uid, nom: de.nom, cote: de.cote }, texte, pieces, interne: de.cote === 'equipe' ? interne : false, date: serverTimestamp(),
    });
    if (de.cote === 'equipe') await updateDoc(doc(bdd, 'tickets', tid), { maj: serverTimestamp(), 'lu.equipe': serverTimestamp() });
  },

  marquerLuDemande: (tid, cote) => updateDoc(doc(bdd, 'tickets', tid), { [`lu.${cote}`]: serverTimestamp() }),

  clientValideDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'resolu', resolu: serverTimestamp(), maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  clientRouvreDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'en-cours', maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  ajouterPiecesDemande: (tid, pieces) => updateDoc(doc(bdd, 'tickets', tid), { pieces, maj: serverTimestamp() }),

  /* Pilotage par l'équipe. */
  majDemande: (tid, changements) => updateDoc(doc(bdd, 'tickets', tid), nettoyer({ ...changements, maj: serverTimestamp() })),

  /* --- La conversation d'un projet ------------------------------------ */
  async messageProjet(session, pid, texte, pieces = []) {
    const de = auteurDe(session);
    await addDoc(col('projets', pid, 'messages'), { de: { uid: de.uid, nom: de.nom, cote: de.cote }, texte, pieces, date: serverTimestamp() });
  },

  /* L'accusé de lecture d'un projet : l'instant lu, et l'instant de la
     dernière frappe pour dire à l'autre qu'une réponse s'écrit. */
  marquerLecture: (session, pid, { frappe = false } = {}) => {
    const de = auteurDe(session);
    return setDoc(doc(bdd, 'projets', pid, 'lectures', de.uid),
      nettoyer({ lu: serverTimestamp(), cote: de.cote, nom: de.nom, frappe: frappe ? serverTimestamp() : null }),
      { merge: true });
  },

  /* La fiche technique d'une brique, rangée hors du composant. */
  majTechnique: (pid, cid, technique) => setDoc(doc(bdd, 'projets', pid, 'technique', cid), nettoyer({ ...technique, maj: serverTimestamp() }), { merge: true }),

  /* --- Le profil de la personne connectée ----------------------------- */
  majProfil: (uid, changements) => setDoc(doc(bdd, 'profils', uid), nettoyer({ ...changements, maj: serverTimestamp() }), { merge: true }),
  marquerVu: (uid, cle) => setDoc(doc(bdd, 'profils', uid), { lus: { [cle]: serverTimestamp() } }, { merge: true }),
  epingler: (uid, cle, oui) => setDoc(doc(bdd, 'profils', uid), { epingles: oui ? arrayUnion(cle) : arrayRemove(cle) }, { merge: true }),

  /* --- Les validations ------------------------------------------------ */
  async repondreValidation(session, vid, statut, commentaire) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'validations', vid), {
      statut, reponse: { par: par.uid, nom: par.nom, date: serverTimestamp(), commentaire: commentaire || '' }, maj: serverTimestamp(),
    });
  },
  async creerValidation(session, pid, d, pieces = []) {
    const par = auteurDe(session);
    const ref = await addDoc(col('validations'), nettoyer({
      projet: pid, titre: d.titre, type: d.type || 'autre', description: d.description || '',
      cible: d.cible || null, pieces, statut: 'en-attente', echeance: dateOuNull(d.echeance),
      demandeur: { uid: par.uid, nom: par.nom }, reponse: null, cree: serverTimestamp(), maj: serverTimestamp(),
    }));
    return ref.id;
  },
  annulerValidation: (vid) => updateDoc(doc(bdd, 'validations', vid), { statut: 'annulee', maj: serverTimestamp() }),

  /* --- Les fichiers --------------------------------------------------- */
  async deposerFichier(session, pid, fiche, options = {}) {
    const par = auteurDe(session);
    const client = par.cote === 'client';
    const categorie = client && !CATEGORIES_CLIENT.includes(options.categorie) ? 'autres' : (options.categorie || 'autres');
    const ref = await addDoc(col('fichiers'), nettoyer({
      projet: pid, composant: options.composant || '', categorie,
      nom: fiche.nom, chemin: fiche.chemin, taille: fiche.taille, type: fiche.type,
      description: options.description || '', tags: options.tags || [],
      par: { uid: par.uid, nom: par.nom, cote: par.cote },
      visibilite: client ? 'client' : (options.visibilite || 'client'),
      version: options.version || '', archive: false, cree: serverTimestamp(),
    }));
    return ref.id;
  },
  majFichier: (fid, changements) => updateDoc(doc(bdd, 'fichiers', fid), nettoyer(changements)),

  /* --- Les pièces comptables (côté client) ---------------------------- */
  async repondreDevis(session, did, statut, commentaire) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'documents', did), {
      statut, reponse: { par: par.uid, nom: par.nom, date: serverTimestamp(), commentaire: commentaire || '' },
    });
  },
  consulterDevis: (did) => updateDoc(doc(bdd, 'documents', did), { statut: 'consulte' }),

  /* --- Les demandes de nouveau projet --------------------------------- */
  async creerDemandeProjet(session, d, pieces = []) {
    const par = auteurDe(session);
    const ref = await addDoc(col('demandesProjet'), nettoyer({
      organisation: d.organisation || '', par: { uid: par.uid, nom: par.nom, email: par.email },
      titre: d.titre, idee: d.idee || '', objectifs: d.objectifs || '', type: d.type || 'autre',
      plateformes: d.plateformes || [], budget: d.budget || '', delai: d.delai || '',
      description: d.description || '', fonctionnalites: d.fonctionnalites || '', exemples: d.exemples || '',
      liens: d.liens || '', pieces, statut: 'nouvelle', projet: null, cree: serverTimestamp(), maj: serverTimestamp(),
    }));
    return ref.id;
  },
  async messageDemandeProjet(session, did, texte, pieces = []) {
    const de = auteurDe(session);
    await addDoc(col('demandesProjet', did, 'messages'), { de: { uid: de.uid, nom: de.nom, cote: de.cote }, texte, pieces, date: serverTimestamp() });
  },
  majDemandeProjet: (did, changements) => updateDoc(doc(bdd, 'demandesProjet', did), nettoyer({ ...changements, maj: serverTimestamp() })),

  /* --- Ce que l'équipe écrit directement ------------------------------ */
  majProjet: (pid, changements) => updateDoc(doc(bdd, 'projets', pid), nettoyer({ ...changements, maj: serverTimestamp() })),

  creerComposant: (pid, d) => addDoc(col('projets', pid, 'composants'), nettoyer({
    lien: d.lien || '',
    nom: d.nom, type: d.type || 'autre', statut: d.statut || 'a-venir', progression: borner(d.progression),
    version: d.version || '', versionPrep: d.versionPrep || '', environnement: d.environnement || '',
    techno: d.techno || [], responsable: d.responsable || '', description: d.description || '', ordre: Number(d.ordre) || 0,
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majComposant: (pid, cid, d) => updateDoc(doc(bdd, 'projets', pid, 'composants', cid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerComposant: (pid, cid) => deleteDoc(doc(bdd, 'projets', pid, 'composants', cid)),

  /* --- La plateforme de tests ------------------------------------------
     Un scénario porte sa référence comme identifiant (« DI-15 »), parce que
     c'est elle qui le nomme partout ailleurs : dans les passages, dans les
     anomalies, dans les rapports des testeurs. Deux scénarios ne peuvent
     donc pas porter la même référence, et c'est voulu. */
  creerScenario: (pid, d) => setDoc(doc(bdd, 'projets', pid, 'scenarios', d.ref), nettoyer({
    ref: d.ref, bloc: d.bloc || 'divers', blocLibelle: d.blocLibelle || '',
    groupe: d.groupe || '', titre: d.titre, options: d.options || '', attendu: d.attendu || '',
    niveau: d.niveau || 'reparti', plateformes: d.plateformes || ['ios', 'android', 'web'],
    ordre: Number(d.ordre) || 0, actif: d.actif !== false,
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  /* Le magasin peut être en retard d'un instant, et il écarte les scénarios
     désactivés. Pour savoir si une référence est déjà prise, seule la base
     répond juste : écraser un scénario existant changerait le sens des
     passages déjà consignés sous cette référence. */
  scenarioExiste: async (pid, ref) => (await getDoc(doc(bdd, 'projets', pid, 'scenarios', ref))).exists(),
  majScenario: (pid, ref, d) => updateDoc(doc(bdd, 'projets', pid, 'scenarios', ref), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerScenario: (pid, ref) => deleteDoc(doc(bdd, 'projets', pid, 'scenarios', ref)),

  /* Un parcours porte sa référence comme identifiant, comme un scénario :
     c'est elle que l'outil renvoie dans son rapport, et c'est par elle
     qu'on recolle le verdict au parcours. */
  creerParcours: (pid, d) => setDoc(doc(bdd, 'projets', pid, 'parcours', d.ref), nettoyer({
    ref: d.ref, titre: d.titre, outil: d.outil || 'maestro',
    plateformes: d.plateformes || ['ios', 'android'],
    scenarios: d.scenarios || [], fichier: d.fichier || '',
    etat: d.etat || 'a-ecrire', note: d.note || '',
    mutation: d.mutation === true, dernier: d.dernier || null,
    ordre: Number(d.ordre) || 0, actif: d.actif !== false,
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  /* Une famille de règles porte sa référence comme identifiant, comme un
     parcours : c'est ce qui permet au robot de recoller son verdict. */
  creerRegle: (pid, d) => setDoc(doc(bdd, 'projets', pid, 'regles', d.ref), nettoyer({
    ...d, actif: true, maj: serverTimestamp(),
  })),
  majRegle: (pid, ref, d) => updateDoc(doc(bdd, 'projets', pid, 'regles', ref), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerRegle: (pid, ref) => deleteDoc(doc(bdd, 'projets', pid, 'regles', ref)),

  majParcours: (pid, ref, d) => updateDoc(doc(bdd, 'projets', pid, 'parcours', ref), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerParcours: (pid, ref) => deleteDoc(doc(bdd, 'projets', pid, 'parcours', ref)),

  creerCampagne: (pid, d) => addDoc(col('projets', pid, 'campagnes'), nettoyer({
    titre: d.titre, statut: d.statut || 'preparation',
    debut: d.debut || null, fin: d.fin || null,
    builds: d.builds || {}, testeurs: d.testeurs || [], affectation: d.affectation || {},
    /* La sélection de scénarios est le cœur de la campagne : une liste
       blanche qui l'oublie crée une campagne qui n'a rien à distribuer,
       sans rien dire à personne. */
    scenarios: d.scenarios || [],
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majCampagne: (pid, cid, d) => updateDoc(doc(bdd, 'projets', pid, 'campagnes', cid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerCampagne: (pid, cid) => deleteDoc(doc(bdd, 'projets', pid, 'campagnes', cid)),

  creerJalon: (pid, d) => addDoc(col('projets', pid, 'jalons'), nettoyer({
    projet: pid, titre: d.titre, description: d.description || '', phase: d.phase || '', statut: d.statut || 'a-venir',
    progression: borner(d.progression), debut: dateOuNull(d.debut), fin: dateOuNull(d.fin),
    composants: d.composants || [], responsable: d.responsable || '', dependances: d.dependances || [], ordre: Number(d.ordre) || 0,
    reports: [],
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majJalon: (pid, jid, d) => updateDoc(doc(bdd, 'projets', pid, 'jalons', jid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerJalon: (pid, jid) => deleteDoc(doc(bdd, 'projets', pid, 'jalons', jid)),

  creerLien: (pid, d) => addDoc(col('projets', pid, 'liens'), nettoyer({
    nom: d.nom, categorie: d.categorie || 'autre', url: d.url, environnement: d.environnement || '',
    composant: d.composant || '', description: d.description || '', visibilite: d.visibilite || 'client', etat: d.etat || 'actif',
    cree: serverTimestamp(),
  })),
  majLien: (pid, lid, d) => updateDoc(doc(bdd, 'projets', pid, 'liens', lid), nettoyer(d)),
  supprimerLien: (pid, lid) => deleteDoc(doc(bdd, 'projets', pid, 'liens', lid)),

  async creerTache(session, pid, d) {
    const par = auteurDe(session);
    const ref = await addDoc(col('taches'), nettoyer({
      projet: pid, composant: d.composant || '', jalon: d.jalon || '', ticket: d.ticket || '',
      titre: d.titre, description: d.description || '', statut: d.statut || 'a-faire', priorite: d.priorite || 'normale',
      assigne: d.assigne || '', echeance: dateOuNull(d.echeance), estimation: d.estimation || '',
      progression: borner(d.progression), checklist: d.checklist || [], pieces: [],
      visibilite: d.visibilite || 'client', ordre: Number(d.ordre) || 0, archive: false,
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majTache: (tid, d) => updateDoc(doc(bdd, 'taches', tid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerTache: (tid) => deleteDoc(doc(bdd, 'taches', tid)),

  async creerRelease(session, pid, d) {
    const par = auteurDe(session);
    const ref = await addDoc(col('releases'), nettoyer({
      projet: pid, composant: d.composant || '', plateforme: d.plateforme || 'web', version: d.version,
      titre: d.titre || '', statut: d.statut || 'developpement', date: dateOuNull(d.date),
      notes: d.notes || [], liens: d.liens || {}, visibilite: d.visibilite || 'client',
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majRelease: (rid, d) => updateDoc(doc(bdd, 'releases', rid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerRelease: (rid) => deleteDoc(doc(bdd, 'releases', rid)),

  async creerReunion(session, pid, d) {
    const par = auteurDe(session);
    const ref = await addDoc(col('reunions'), nettoyer({
      projet: pid, titre: d.titre, date: dateOuNull(d.date), duree: Number(d.duree) || 60,
      participants: d.participants || [], lien: d.lien || '', ordreDuJour: d.ordreDuJour || '',
      notes: d.notes || '', compteRendu: d.compteRendu || '', decisions: d.decisions || '',
      actions: d.actions || [], visibilite: d.visibilite || 'client',
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majReunion: (rid, d) => updateDoc(doc(bdd, 'reunions', rid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerReunion: (rid) => deleteDoc(doc(bdd, 'reunions', rid)),

  async creerNote(session, pid, d) {
    const par = auteurDe(session);
    const ref = await addDoc(col('notes'), nettoyer({
      projet: pid, composant: d.composant || '', plateforme: d.plateforme || '',
      type: d.type || 'information', titre: d.titre, contenu: d.contenu || '',
      contexte: d.contexte || '', impact: d.impact || '', decidePar: d.decidePar || '',
      date: dateOuNull(d.date) || Timestamp.now(), visibilite: d.visibilite || 'client',
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majNote: (nid, d) => updateDoc(doc(bdd, 'notes', nid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerNote: (nid) => deleteDoc(doc(bdd, 'notes', nid)),

  creerBlocage: (pid, d) => addDoc(col('blocages'), nettoyer({
    projet: pid, composant: d.composant || '', plateforme: d.plateforme || '',
    titre: d.titre, description: d.description || '', responsable: d.responsable || 'client',
    impact: d.impact || '', depuis: dateOuNull(d.depuis) || Timestamp.now(), resolu: null,
    visibilite: d.visibilite || 'client', cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majBlocage: (bid, d) => updateDoc(doc(bdd, 'blocages', bid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerBlocage: (bid) => deleteDoc(doc(bdd, 'blocages', bid)),
};

/* ==========================================================================
   5. Les calculs dérivés
   ========================================================================== */

/** La progression d'un projet, selon son mode. */
/* D'où sort le chiffre. Le dire évite qu'on le croie plus précis qu'il ne l'est. */
export const MODES_PROGRESSION = {
  etapes:  'Calculée sur les étapes',
  manuel:  'Estimée par Capmedia',
  parties: 'Calculée sur les parties du projet',
  taches:  'Calculée sur les tâches',
  termine: 'Projet terminé',
  inconnu: '',
};

/**
 * La progression d'un projet.
 *
 * Un projet sans étapes et sans valeur saisie affichait 0 %. Une barre à
 * zéro sur un projet aux trois quarts fait ment plus qu'elle n'informe :
 * on descend donc la chaîne des faits disponibles, et si aucun ne dit
 * rien, `valeur` vaut null et l'écran l'avoue au lieu d'inventer.
 */
export const progressionProjet = (projet, jalons = [], { composants = [], taches = [] } = {}) => {
  const p = (projet && projet.progression) || {};
  const moyenne = (n) => Math.round(n.reduce((s, x) => s + x, 0) / n.length);

  if (p.mode === 'jalons' && jalons.length) {
    return { valeur: moyenne(jalons.map((j) => borner(j.statut === 'termine' ? 100 : j.progression))), mode: 'etapes' };
  }
  if (Number(p.valeur) > 0) return { valeur: borner(p.valeur), mode: 'manuel' };
  if (jalons.length) {
    return { valeur: moyenne(jalons.map((j) => borner(j.statut === 'termine' ? 100 : j.progression))), mode: 'etapes' };
  }
  const parlantes = composants.filter((c) => Number(c.progression) > 0 || c.statut === 'livre');
  if (parlantes.length) {
    return { valeur: moyenne(composants.map((c) => borner(c.statut === 'livre' ? 100 : c.progression))), mode: 'parties' };
  }
  const suivies = taches.filter((t) => !t.archive);
  if (suivies.length >= 3) {
    return { valeur: Math.round((suivies.filter((t) => t.statut === 'terminee').length / suivies.length) * 100), mode: 'taches' };
  }
  if (statutProjet(projet) === 'termine') return { valeur: 100, mode: 'termine' };
  return { valeur: null, mode: 'inconnu' };
};

/**
 * Les faits qui menacent une date. Aucun n'est une intuition : un point
 * bloquant ouvert, une étape déjà dépassée, une tâche en retard, une
 * demande qui dort du côté du client. Sans fait, une date à venir est
 * tenue, et on le dit.
 */
export const risquesProjet = ({ jalons = [], blocages = [], taches = [], tickets = [] } = {}) => {
  const r = [];
  const bloquants = blocages.filter((b) => !b.resolu);
  if (bloquants.length) r.push(pluriel(bloquants.length, 'point bloquant ouvert', 'points bloquants ouverts'));
  const etapes = jalons.filter((j) => j.statut !== 'termine' && joursAvant(j.fin) < 0);
  if (etapes.length) r.push(pluriel(etapes.length, 'étape déjà dépassée', 'étapes déjà dépassées'));
  const retards = taches.filter((t) => t.statut !== 'terminee' && joursAvant(t.echeance) < 0);
  if (retards.length) r.push(pluriel(retards.length, 'tâche en retard', 'tâches en retard'));
  const cote = tickets.filter((t) => ATTEND_CLIENT.includes(t.statut) && joursAvant(t.maj) < -7);
  if (cote.length) r.push(pluriel(cote.length, 'demande en attente du client depuis plus d\'une semaine', 'demandes en attente du client depuis plus d\'une semaine'));
  return r;
};

/**
 * Le verdict de la date cible d'un projet, prêt à afficher. Le projet est
 * clos s'il est terminé : la date n'a alors plus d'objet.
 */
export const delaiProjet = (projet, sources = {}) => verdictDelai(projet && projet.cible, {
  clos: statutProjet(projet) === 'termine',
  risques: risquesProjet(sources),
});

/**
 * L'ordre d'affichage d'une feuille de route : ce qui bouge en premier,
 * puis du plus récent au plus ancien. Une feuille de route rangée par
 * numéro d'ordre obligeait à la lire en entier pour trouver où on en est.
 */
export const trierEtapes = (jalons = []) => {
  /* Trois rangs : ce qui bouge, ce qui vient, ce qui est fait. Dans le
     rang qui vient, l'échéance la plus proche d'abord, sinon une étape de
     maintenance datée dans dix-huit mois passait devant une échéance de
     magasin dans six semaines. Dans le rang fait, le plus récent d'abord. */
  const rang = (j) => (['en-cours', 'bloque'].includes(j.statut) ? 0 : j.statut === 'termine' ? 2 : 1);
  const quand = (j) => { const d = enDate(j.fin) || enDate(j.debut) || enDate(j.cree); return d ? d.getTime() : 0; };
  return jalons.slice().sort((a, b) => {
    const r = rang(a) - rang(b);
    if (r) return r;
    if (rang(a) === 1) return (quand(a) || Infinity) - (quand(b) || Infinity);
    return quand(b) - quand(a) || (a.ordre || 0) - (b.ordre || 0);
  });
};

/**
 * Les phases, dans le même ordre : une phase vaut sa meilleure étape.
 * Renvoie [{ nom, jalons }], les étapes de chaque phase déjà triées.
 */
export const phasesTriees = (jalons = []) => {
  const phases = [];
  for (const j of trierEtapes(jalons)) {
    const nom = j.phase || 'Sans phase';
    let p = phases.find((x) => x.nom === nom);
    if (!p) { p = { nom, jalons: [] }; phases.push(p); }
    p.jalons.push(j);
  }
  return phases;
};

/** La phase en cours de la feuille de route. */
/* L'étape en cours, puis celle d'après. Le classement par numéro d'ordre
   désignait la première saisie, pas celle où on en est : on lit la date. */
const parEcheance = (jalons) => jalons.slice().sort((a, b) => {
  const d = (j) => { const x = enDate(j.fin) || enDate(j.debut); return x ? x.getTime() : Infinity; };
  return d(a) - d(b) || (a.ordre || 0) - (b.ordre || 0);
});
export const jalonCourant = (jalons = []) => {
  const tries = parEcheance(jalons);
  return tries.find((j) => j.statut === 'en-cours' || j.statut === 'bloque')
    || tries.find((j) => j.statut === 'planifie' || j.statut === 'a-venir')
    || null;
};
export const jalonSuivant = (jalons = []) => {
  const tries = parEcheance(jalons);
  const courant = jalonCourant(jalons);
  const i = courant ? tries.indexOf(courant) : -1;
  return tries.slice(i + 1).find((j) => j.statut !== 'termine') || null;
};

export const prochaineReunion = (reunions = []) => {
  const maintenant = Date.now() - 3600 * 1000;
  return [...reunions]
    .filter((r) => { const d = enDate(r.date); return d && d.getTime() >= maintenant; })
    .sort(parDateAsc('date'))[0] || null;
};

/** Le total dû sur des factures. */
/* Le montant réellement dû : le TTC enregistré, ou le hors taxes augmenté
   de sa TVA. Retomber sur le HT faisait disparaître la taxe du reste à
   payer, et l'écran de la pièce annonçait un autre chiffre. */
export const ttcDe = (d) => (typeof d.ttc === 'number'
  ? d.ttc
  : (Number(d.montant) || 0) * (1 + (Number(d.tva) || 0) / 100));

export const resteAPayer = (documents = [], paiements = []) => {
  const factures = documents.filter((d) => d.type === 'facture' && !d.archive && FACTURES_DUES.includes(d.statut));
  let total = 0;
  for (const f of factures) {
    const paye = paiements.filter((p) => p.facture === f.id && p.statut !== 'annule').reduce((s, p) => s + (Number(p.montant) || 0), 0);
    total += Math.max(0, ttcDe(f) - paye);
  }
  return { total, factures };
};

/**
 * Ce qui attend le client. Une liste d'éléments { genre, titre, sous, chemin, ton }.
 */
/* L'ordre de ce qui attend quelqu'un : d'abord ce qui est en retard, du
   plus ancien retard au plus récent, puis ce qui a une échéance proche,
   puis le reste du plus récent au plus ancien. Trier par date décroissante
   enterrait la facture en retard sous les nouveautés du jour. */
const trierParUrgence = (items) => items.slice().sort((a, b) => {
  const ja = a.date ? joursAvant(a.date) : null;
  const jb = b.date ? joursAvant(b.date) : null;
  const retardA = ja !== null && ja < 0;
  const retardB = jb !== null && jb < 0;
  if (retardA !== retardB) return retardA ? -1 : 1;
  if (retardA && retardB) return ja - jb;
  if (ja !== null && jb !== null) return ja - jb;
  if (ja !== null) return -1;
  if (jb !== null) return 1;
  return 0;
});

export const enAttenteDeVous = ({ projets = [], tickets = [], validations = [], documents = [], taches = [], blocages = [] }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  validations.filter((v) => v.statut === 'en-attente').forEach((v) => items.push({
    genre: 'validation', projet: v.projet, icone: 'valider', ton: 'violet', titre: v.titre, sous: `À valider depuis ${age(v.cree)} · ${nomProjet(v.projet)}`, chemin: `/valider/${v.id}`, date: v.cree,
  }));
  tickets.filter((t) => ATTEND_CLIENT.includes(t.statut) && !t.archive).forEach((t) => items.push({
    genre: 'demande', projet: t.projet, icone: t.statut === 'a-valider' ? 'check' : 'help', ton: 'ambre',
    titre: t.titre, sous: `${t.statut === 'a-valider' ? 'À valider' : 'Une réponse est attendue'} · ${nomProjet(t.projet)}`,
    chemin: `/projets/${t.projet}/demandes/${t.id}`, date: t.maj,
  }));
  documents.filter((d) => d.type === 'devis' && ['envoye', 'consulte'].includes(d.statut) && !d.archive).forEach((d) => items.push({
    genre: 'devis', projet: d.projet, icone: 'receipt', ton: 'bleu', titre: d.libelle, sous: `Devis à décider, envoyé il y a ${age(d.date)} · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.date,
  }));
  documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut) && !d.archive).forEach((d) => items.push({
    genre: 'facture', projet: d.projet, icone: 'euro', ton: d.statut === 'en-retard' ? 'rouge' : 'ambre', titre: d.libelle, sous: `Facture à régler${retard(d.echeance) ? `, en retard de ${retard(d.echeance)}` : d.echeance ? `, échéance ${dateCourte(d.echeance)}` : ''} · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.echeance || d.date,
  }));
  taches.filter((t) => t.statut === 'attente-client' && !t.archive).forEach((t) => items.push({
    genre: 'tache', projet: t.projet, icone: 'taches', ton: 'ambre', titre: t.titre, sous: `Nous attendons votre retour${retard(t.echeance) ? `, en retard de ${retard(t.echeance)}` : ''} · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/taches/${t.id}`, date: t.echeance || t.maj,
  }));
  blocages.filter((b) => !b.resolu && b.responsable === 'client').forEach((b) => items.push({
    genre: 'blocage', projet: b.projet, icone: 'alerte', ton: 'rouge', titre: b.titre, sous: `Point bloquant de votre côté depuis ${age(b.depuis)} · ${nomProjet(b.projet)}`, chemin: `/projets/${b.projet}`, date: b.depuis,
  }));
  return trierParUrgence(items);
};

/** Ce qui attend l'équipe. */
export const enAttenteDeNous = ({ projets = [], tickets = [], validations = [], taches = [], blocages = [], demandesProjet = [], equipeUid = '' }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  tickets.filter((t) => ATTEND_EQUIPE.includes(t.statut) && !t.archive).forEach((t) => items.push({
    genre: 'demande', projet: t.projet, icone: 'demandes', ton: t.statut === 'nouveau' ? 'bleu' : 'gris', titre: t.titre,
    sous: `${t.numero || 'Sans numéro'} · ouverte depuis ${age(t.cree)} · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/demandes/${t.id}`, date: t.maj, urgence: t.urgence,
  }));
  taches.filter((t) => !t.archive && t.statut !== 'terminee' && t.echeance && joursAvant(t.echeance) < 0).forEach((t) => items.push({
    genre: 'tache', projet: t.projet, icone: 'taches', ton: 'rouge', titre: t.titre, sous: `En retard de ${retard(t.echeance)} · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/taches/${t.id}`, date: t.echeance,
  }));
  blocages.filter((b) => !b.resolu && b.responsable === 'capmedia').forEach((b) => items.push({
    genre: 'blocage', projet: b.projet, icone: 'alerte', ton: 'rouge', titre: b.titre, sous: `Point bloquant depuis ${age(b.depuis)} · ${nomProjet(b.projet)}`, chemin: `/projets/${b.projet}`, date: b.depuis,
  }));
  demandesProjet.filter((d) => ['nouvelle', 'discussion', 'qualification', 'estimation'].includes(d.statut)).forEach((d) => items.push({
    genre: 'preprojet', projet: null, icone: 'sparkle', ton: 'violet', titre: d.titre, sous: `Nouveau projet demandé par ${d.par && d.par.nom}`, chemin: `/nouveaux-projets/${d.id}`, date: d.maj,
  }));
  void validations; void equipeUid;
  return trierParUrgence(items);
};

/** Ce qui attend le client, vu par l'équipe. */
export const enAttenteDuClient = (donnees) => enAttenteDeVous(donnees);

/** Les projets actifs. */
export const projetsActifs = (projets = []) => projets.filter(projetEstActif);

/** Ce qui s'est passé depuis une date. */
export const depuisVisite = (activite = [], depuisDate) => {
  const seuil = enDate(depuisDate);
  if (!seuil) return [];
  return activite.filter((a) => { const d = enDate(a.date); return d && d > seuil; });
};

/** Les non lus d'un fil de projet pour une personne. */
export const nonLusProjet = (messages = [], profil, pid, uid) => {
  const lu = enDate(profil && profil.lus && profil.lus[`messages:${pid}`]);
  return messages.filter((m) => m.de && m.de.uid !== uid && (!lu || (enDate(m.date) || 0) > lu)).length;
};

/** Regroupe les tâches par statut pour un kanban. */
export const parStatut = (items, vocabulaire) => Object.keys(vocabulaire).map((cle) => ({
  cle, fiche: vocabulaire[cle], items: items.filter((i) => i.statut === cle),
}));

export { OUVERTS, ATTEND_CLIENT, ATTEND_EQUIPE, FACTURES_DUES };

/* ==========================================================================
   L'affectation des testeurs
   ========================================================================== */

/*
 * Qui passe quoi. La règle, décidée avec Nadir : chaque testeur couvre le
 * web plus un mobile, et tout scénario dont le comportement dépend du
 * système est passé par au moins un testeur iOS ET un testeur Android.
 *
 * Le reste est réparti une seule fois : passer deux fois coûte le double,
 * on ne le fait que là où la réponse peut différer. C'est la seule donnée
 * de cette page qui se compte en argent.
 *
 * Le calcul propose, il ne décide pas : l'affectation reste modifiable à
 * la main tant que la campagne n'est pas lancée. Un testeur tombe malade,
 * un autre demande un bloc précis, et aucun calcul ne prévoit cela.
 */
export const repartir = (scenarios, testeurs) => {
  const plan = {};
  testeurs.forEach((t) => { plan[t.id] = []; });
  if (!testeurs.length || !scenarios.length) return plan;

  const ios = testeurs.filter((t) => t.mobile === 'ios');
  const android = testeurs.filter((t) => t.mobile === 'android');

  /* On sert toujours le moins chargé : sans cela les premiers de la liste
     prennent tout, et le dernier repart avec trois lignes. */
  const moinsCharge = (groupe) => groupe.reduce((a, b) => (plan[a.id].length <= plan[b.id].length ? a : b));

  const poser = (t, ref) => { if (t && !plan[t.id].includes(ref)) plan[t.id].push(ref); };

  /* L'ordre compte : les scénarios doublés d'abord, pendant que les
     compteurs sont à zéro. Les répartir en dernier laisserait des paquets
     de deux qui déséquilibrent tout le monde. */
  const doubles = scenarios.filter((s) => (NIVEAUX_SCENARIO[s.niveau] || {}).double);
  const simples = scenarios.filter((s) => !(NIVEAUX_SCENARIO[s.niveau] || {}).double);

  doubles.forEach((s) => {
    const p = s.plateformes || ['ios', 'android', 'web'];
    if (p.includes('ios') && ios.length) poser(moinsCharge(ios), s.ref);
    if (p.includes('android') && android.length) poser(moinsCharge(android), s.ref);
    /* Aucun testeur sur un système : le scénario n'est pas perdu, il part
       chez quelqu'un. Mieux vaut un passage sur un seul système que rien. */
    if (!ios.length && !android.length) poser(moinsCharge(testeurs), s.ref);
  });

  simples.forEach((s) => {
    const p = s.plateformes || ['ios', 'android', 'web'];
    const eligibles = testeurs.filter((t) => p.includes(t.mobile) || p.includes('web'));
    poser(moinsCharge(eligibles.length ? eligibles : testeurs), s.ref);
  });

  return plan;
};

/* Ce que l'affectation donne, testeur par testeur : de quoi voir d'un coup
   d'œil si quelqu'un est écrasé ou oublié. */
export const chargeParTesteur = (plan, testeurs) => testeurs.map((t) => ({
  ...t, passages: (plan[t.id] || []).length,
}));
