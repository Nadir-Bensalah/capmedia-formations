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
  bdd, collection, collectionGroup, query, where, orderBy, limit, doc, addDoc, updateDoc, setDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
  nomAffiche, enDate, parDateDesc, parDateAsc, joursAvant, borner,
  OUVERTS, ATTEND_CLIENT, ATTEND_EQUIPE, FACTURES_DUES, PROJETS_ACTIFS, CATEGORIES_CLIENT, projetEstActif,
} from './noyau.js';
import * as magasin from './magasin.js';

/* ==========================================================================
   1. Les clés du magasin
   ========================================================================== */

export const K = {
  projet: (p) => `projet:${p}`,
  composants: (p) => `composants:${p}`,
  jalons: (p) => `jalons:${p}`,
  liens: (p) => `liens:${p}`,
  messages: (p) => `messages:${p}`,
  lectures: (p) => `lectures:${p}`,
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
  } else {
    const uid = session.utilisateur.uid;
    lot.abonner(K.projets, () => query(col('projets'), where('membres', 'array-contains', uid)));
    lot.abonner(K.organisations, () => query(col('organisations'), where('membres', 'array-contains', uid)));
    lot.abonner(K.demandesProjet, () => query(col('demandesProjet'), where('par.uid', '==', uid)));
    for (const p of session.projets) abonnerProjet(lot, p.id, 'client');
  }
};

/** Pour un client, une vue « toutes collections » agrège ses projets. */
export const agreger = (session, fabriqueCle) => {
  if (session.equipe) return magasin.lire(fabriqueCle('*')) || [];
  return session.projets.flatMap((p) => magasin.lire(fabriqueCle(p.id)) || []);
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
    nom: d.nom, type: d.type || 'autre', statut: d.statut || 'a-venir', progression: borner(d.progression),
    version: d.version || '', versionPrep: d.versionPrep || '', environnement: d.environnement || '',
    techno: d.techno || [], responsable: d.responsable || '', description: d.description || '', ordre: Number(d.ordre) || 0,
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majComposant: (pid, cid, d) => updateDoc(doc(bdd, 'projets', pid, 'composants', cid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerComposant: (pid, cid) => deleteDoc(doc(bdd, 'projets', pid, 'composants', cid)),

  creerJalon: (pid, d) => addDoc(col('projets', pid, 'jalons'), nettoyer({
    projet: pid, titre: d.titre, description: d.description || '', phase: d.phase || '', statut: d.statut || 'a-venir',
    progression: borner(d.progression), debut: dateOuNull(d.debut), fin: dateOuNull(d.fin),
    composants: d.composants || [], responsable: d.responsable || '', dependances: d.dependances || [], ordre: Number(d.ordre) || 0,
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
      projet: pid, type: d.type || 'information', titre: d.titre, contenu: d.contenu || '',
      contexte: d.contexte || '', impact: d.impact || '', decidePar: d.decidePar || '',
      date: dateOuNull(d.date) || Timestamp.now(), visibilite: d.visibilite || 'client',
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majNote: (nid, d) => updateDoc(doc(bdd, 'notes', nid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerNote: (nid) => deleteDoc(doc(bdd, 'notes', nid)),

  creerBlocage: (pid, d) => addDoc(col('blocages'), nettoyer({
    projet: pid, titre: d.titre, description: d.description || '', responsable: d.responsable || 'client',
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
export const progressionProjet = (projet, jalons = []) => {
  const p = (projet && projet.progression) || {};
  if (p.mode === 'jalons' && jalons.length) {
    const total = jalons.reduce((s, j) => s + borner(j.statut === 'termine' ? 100 : j.progression), 0);
    return { valeur: Math.round(total / jalons.length), mode: 'jalons' };
  }
  return { valeur: borner(p.valeur), mode: p.mode || 'manuel' };
};

/** La phase en cours de la feuille de route. */
export const jalonCourant = (jalons = []) => {
  const tries = [...jalons].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  return tries.find((j) => j.statut === 'en-cours' || j.statut === 'bloque')
    || tries.find((j) => j.statut === 'planifie' || j.statut === 'a-venir')
    || null;
};
export const jalonSuivant = (jalons = []) => {
  const tries = [...jalons].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
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
export const resteAPayer = (documents = [], paiements = []) => {
  const factures = documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut));
  let total = 0;
  for (const f of factures) {
    const paye = paiements.filter((p) => p.facture === f.id && p.statut !== 'annule').reduce((s, p) => s + (Number(p.montant) || 0), 0);
    total += Math.max(0, (Number(f.ttc) || Number(f.montant) || 0) - paye);
  }
  return { total, factures };
};

/**
 * Ce qui attend le client. Une liste d'éléments { genre, titre, sous, chemin, ton }.
 */
export const enAttenteDeVous = ({ projets = [], tickets = [], validations = [], documents = [], taches = [], blocages = [] }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  validations.filter((v) => v.statut === 'en-attente').forEach((v) => items.push({
    genre: 'validation', icone: 'valider', ton: 'violet', titre: v.titre, sous: `Validation · ${nomProjet(v.projet)}`, chemin: `/valider/${v.id}`, date: v.cree,
  }));
  tickets.filter((t) => ATTEND_CLIENT.includes(t.statut) && !t.archive).forEach((t) => items.push({
    genre: 'demande', icone: t.statut === 'a-valider' ? 'check' : 'help', ton: 'ambre',
    titre: t.titre, sous: `${t.statut === 'a-valider' ? 'À valider' : 'Une réponse est attendue'} · ${nomProjet(t.projet)}`,
    chemin: `/projets/${t.projet}/demandes/${t.id}`, date: t.maj,
  }));
  documents.filter((d) => d.type === 'devis' && ['envoye', 'consulte'].includes(d.statut) && !d.archive).forEach((d) => items.push({
    genre: 'devis', icone: 'receipt', ton: 'bleu', titre: d.libelle, sous: `Devis à décider · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.date,
  }));
  documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut) && !d.archive).forEach((d) => items.push({
    genre: 'facture', icone: 'euro', ton: d.statut === 'en-retard' ? 'rouge' : 'ambre', titre: d.libelle, sous: `Facture à régler · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.echeance || d.date,
  }));
  taches.filter((t) => t.statut === 'attente-client' && !t.archive).forEach((t) => items.push({
    genre: 'tache', icone: 'taches', ton: 'ambre', titre: t.titre, sous: `Nous attendons votre retour · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/taches/${t.id}`, date: t.echeance || t.maj,
  }));
  blocages.filter((b) => !b.resolu && b.responsable === 'client').forEach((b) => items.push({
    genre: 'blocage', icone: 'alerte', ton: 'rouge', titre: b.titre, sous: `Point bloquant de votre côté · ${nomProjet(b.projet)}`, chemin: `/projets/${b.projet}`, date: b.depuis,
  }));
  return items.sort(parDateDesc('date'));
};

/** Ce qui attend l'équipe. */
export const enAttenteDeNous = ({ projets = [], tickets = [], validations = [], taches = [], blocages = [], demandesProjet = [], equipeUid = '' }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  tickets.filter((t) => ATTEND_EQUIPE.includes(t.statut) && !t.archive).forEach((t) => items.push({
    genre: 'demande', icone: 'demandes', ton: t.statut === 'nouveau' ? 'bleu' : 'gris', titre: t.titre,
    sous: `${t.numero || 'Sans numéro'} · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/demandes/${t.id}`, date: t.maj, urgence: t.urgence,
  }));
  taches.filter((t) => !t.archive && t.statut !== 'terminee' && t.echeance && joursAvant(t.echeance) < 0).forEach((t) => items.push({
    genre: 'tache', icone: 'taches', ton: 'rouge', titre: t.titre, sous: `Tâche en retard · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/taches/${t.id}`, date: t.echeance,
  }));
  blocages.filter((b) => !b.resolu && b.responsable === 'capmedia').forEach((b) => items.push({
    genre: 'blocage', icone: 'alerte', ton: 'rouge', titre: b.titre, sous: `Point bloquant · ${nomProjet(b.projet)}`, chemin: `/projets/${b.projet}`, date: b.depuis,
  }));
  demandesProjet.filter((d) => ['nouvelle', 'discussion', 'qualification', 'estimation'].includes(d.statut)).forEach((d) => items.push({
    genre: 'preprojet', icone: 'sparkle', ton: 'violet', titre: d.titre, sous: `Nouveau projet demandé par ${d.par && d.par.nom}`, chemin: `/nouveaux-projets/${d.id}`, date: d.maj,
  }));
  void validations; void equipeUid;
  return items.sort(parDateDesc('date'));
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
