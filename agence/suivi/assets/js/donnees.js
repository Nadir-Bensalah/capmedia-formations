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
  bdd, collection, collectionGroup, query, where, orderBy, limit, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp, stockage, refStockage, deleteObject,
  nomAffiche, enDate, parDateDesc, parDateAsc, joursAvant, borner, age, retard, dateCourte,
  OUVERTS, ATTEND_CLIENT, ATTEND_EQUIPE, FACTURES_DUES, PROJETS_ACTIFS, CATEGORIES_CLIENT, projetEstActif, devisADecider, statutPiece,
  statutProjet, pluriel, verdictDelai, NIVEAUX_SCENARIO, STATUTS_PIECE_VISIBLES, startAfter, peut, onSnapshot, writeBatch, runTransaction,
  STATUTS_RELEASE,
} from './noyau.js';
import * as magasin from './magasin.js';
import { datePartie } from './partie-format.js';

/* ==========================================================================
   1. Les clés du magasin
   ========================================================================== */

export const K = {
  projet: (p) => `projet:${p}`,
  composants: (p) => `composants:${p}`,
  jalons: (p) => `jalons:${p}`,
  scenarios: (p) => `scenarios:${p}`,
  /* Le plan de tests (« ce qui va être testé ») : une section par document,
     et la présentation de la page, seule lue partout pour savoir si le
     plan existe (un petit document plutôt qu'une section entière). */
  planTests: (p) => `plan-tests:${p}`,
  planPresentation: (p) => `plan-presentation:${p}`,
  campagnes: (p) => `campagnes:${p}`,
  anomalies: (p) => `anomalies:${p}`,
  parcours: (p) => `parcours:${p}`,
  regles: (p) => `regles:${p}`,
  maintenance: (p) => `maintenance:${p}`,
  /* Les axes d'évolution, par plateforme : le client ne lit que les
     publiés (la requête le dit, les règles aussi). Leur introduction vit
     à part, lisible des deux côtés. */
  axes: (p) => `axes:${p}`,
  axesIntro: (p) => `axes-intro:${p}`,
  /* Les avis et les passages vivent sous une campagne, pas sous un projet :
     c'est la seule granularité que les règles ouvrent au client. */
  appreciations: (c) => `appreciations:${c}`,
  passages: (c) => `passages:${c}`,
  liens: (p) => `liens:${p}`,
  messages: (p) => `messages:${p}`,
  lectures: (p) => `lectures:${p}`,
  technique: (p) => `technique:${p}`,
  /* Les personnes qui ont accès au projet (ou l'auront), leur rôle, leur
     invitation : l'équipe seule les lit. */
  interlocuteurs: (p) => `interlocuteurs:${p}`,
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
  /* Tous les profils (l'administrateur seul les lit) : les premiers pas des clients. */
  profilsClients: 'profils-clients',
  /* Les conversations des testeurs avec l'équipe (le Cockpit seul). */
  conversationsTesteurs: 'conversations-testeurs',
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
  maintenanceToute: 'maintenance:*',
  profils: 'profils:*',
  testeurs: 'testeurs',
  /* Le tableau des tests : qui est là (équipe seule), ce que la machine
     joue, et les jetons de ses robots. */
  presences: 'presences',
  sessions: (uid) => `sessions:${uid}`,
  executions: (p) => `executions:${p}`,
  robots: 'robots',
  /* Ce qui est réservé à Capmedia vit hors des documents que le client lit
     (voir les règles) : l'équipe seule s'y abonne. */
  projetsInternes: 'projets-internes',
  /* Les montants liés à un projet (étape de devis, forfait) : la finance
     de l'équipe et le responsable. */
  montants: (p) => `montants:${p}`,
  montantsTous: 'montants',
  organisationsInternes: 'organisations-internes',
  paiementsInternes: 'paiements-internes',
  /* Les coordonnées de règlement de l'agence (reglages/finance) : un seul
     document, lu par tout le monde, écrit par la finance. */
  reglages: 'reglages:finance',
  /* Le profil sans nom des testeurs d'un projet. */
  profilsTesteurs: (p) => `profils-testeurs:${p}`,
  /* Les notes des projets à faire, hors des projets : équipe seule. */
  idees: 'idees',
  audit: 'audit',
  envois: 'envois',
  /* « Vos notes » : le carnet du client (les siennes seulement). Côté
     équipe, celles que les clients ont partagées : d'un coup pour un
     administrateur, projet par projet pour un agent. */
  notesClient: 'notes-client',
  notesPartagees: 'notes-partagees',
  /* Les annonces de Capmedia (annonces/{id}). L'équipe les lit toutes ;
     le client lit les publiées qui le visent, par deux requêtes (« tous
     les clients », puis celles qui le nomment) assemblées en une clé.
     Leur introduction vit dans reglages/annonces. */
  annonces: 'annonces',
  annoncesTous: 'annonces:tous',
  annoncesMiennes: 'annonces:miennes',
  reglagesAnnonces: 'reglages:annonces',
  notesPartageesProjet: (p) => `notes-partagees:${p}`,
};

/* ==========================================================================
   2. Les abonnements
   ========================================================================== */

const col = (...segments) => collection(bdd, ...segments);

/** Un identifiant de document tiré d'avance : le fichier stocké porte celui de sa fiche. */
export const nouvelId = (collectionNom) => doc(col(collectionNom)).id;

/* La conversation d'un projet : les messages les PLUS RÉCENTS, en temps réel.
   L'ancienne requête (« asc », 300) gardait les trois cents premiers : au
   301e message, plus rien de neuf n'apparaissait. On lit désormais la fin
   de la conversation, et l'historique plus ancien se charge à la demande
   (lireMessagesAnterieurs). Une seule fabrique, pour que toutes les vues
   partagent la même écoute (le magasin garde la première posée). */
export const FENETRE_MESSAGES = 150;
export const requeteMessages = (pid) => query(col('projets', pid, 'messages'), orderBy('date', 'desc'), limit(FENETRE_MESSAGES));
/* Les accusés de lecture d'un projet (qui a lu, qui écrit) : la page
   Messages les écoute projet par projet, comme la bulle. */
export const requeteLectures = (pid) => col('projets', pid, 'lectures');

/** Les messages d'avant `avant` (date du plus ancien affiché), par pages. Rend une liste dans l'ordre chronologique. */
export const lireMessagesAnterieurs = async (pid, avant, taille = 50) => {
  const instantane = await getDocs(query(col('projets', pid, 'messages'), orderBy('date', 'desc'), startAfter(avant), limit(taille)));
  return instantane.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
};

/** La fenêtre récente d'une conversation, dans l'ordre de lecture. */
export const messagesDuProjet = (pid) => enOrdreChronologique(magasin.lire(K.messages(pid)));

/** Une conversation dans l'ordre de lecture, quelle que soit la requête qui l'a lue. */
export const enOrdreChronologique = (messages) => (messages || []).slice().sort((a, b) => {
  const ta = a.date && typeof a.date.toMillis === 'function' ? a.date.toMillis() : (a.date && a.date.seconds ? a.date.seconds * 1000 : 0);
  const tb = b.date && typeof b.date.toMillis === 'function' ? b.date.toMillis() : (b.date && b.date.seconds ? b.date.seconds * 1000 : 0);
  return ta - tb;
});

/* La session de cette page : elle dit, pour un client, son rôle sur
   chaque projet (le responsable lit la finance, le collaborateur non). */
let sessionCourante = null;
/* La finance d'un projet, pour la session : côté équipe, « finance.lecture »
   sur ce projet ; côté client, le responsable. Les règles disent pareil. */
const financeDe = (pid) => {
  if (!sessionCourante) return false;
  if (sessionCourante.equipe) return peut(sessionCourante, 'finance.lecture', pid);
  return responsableDe(pid);
};

/** Le montant d'une étape de devis (« jalon-<id> ») ou du forfait
 *  (« maintenance ») d'un projet, s'il est lisible par la session. */
export const montantDe = (pid, cle) => {
  const tous = (magasin.lire(K.montants(pid)) || []).concat(magasin.lire(K.montantsTous) || []);
  const m = tous.find((x) => x.id === cle && (x.projet || pid) === pid);
  return m && typeof m.montant === 'number' ? m.montant : null;
};

const responsableDe = (pid) => {
  if (!sessionCourante || !sessionCourante.utilisateur) return false;
  const projets = magasin.lire(K.projets) || sessionCourante.projets || [];
  const p = projets.find((x) => x.id === pid) || (sessionCourante.projets || []).find((x) => x.id === pid);
  return Boolean(p) && (p.roles || {})[sessionCourante.utilisateur.uid] === 'responsable';
};

/** Les collections d'un projet. Un client ne voit que ce qui lui est destiné. */
export const abonnerProjet = (lot, pid, role) => {
  const client = role !== 'equipe';
  /* La finance et ce qui engage sont au responsable : un collaborateur ne
     s'y abonne pas (les règles le lui refuseraient), et son fil
     d'activité ne demande que ce qui est public pour le projet. */
  const responsable = client && responsableDe(pid);
  const visible = (c) => (client ? query(c, where('visibilite', '==', 'client')) : c);
  const surProjet = (nom) => query(col(nom), where('projet', '==', pid));
  const surProjetVisible = (nom) => (client
    ? query(col(nom), where('projet', '==', pid), where('visibilite', '==', 'client'))
    : query(col(nom), where('projet', '==', pid)));

  lot.abonner(K.projet(pid), () => doc(bdd, 'projets', pid));
  lot.abonner(K.composants(pid), () => col('projets', pid, 'composants'));
  lot.abonner(K.jalons(pid), () => col('projets', pid, 'jalons'));
  lot.abonner(K.liens(pid), () => visible(col('projets', pid, 'liens')));
  lot.abonner(K.messages(pid), () => requeteMessages(pid));
  lot.abonner(K.lectures(pid), () => col('projets', pid, 'lectures'));
  /* La fiche technique ne se lit que côté équipe : les règles refuseraient
     la requête à un client, et elle ne lui sert à rien. */
  if (!client) lot.abonner(K.technique(pid), () => col('projets', pid, 'technique'));
  if (!client) lot.abonner(K.interlocuteurs(pid), () => col('projets', pid, 'interlocuteurs'));
  /* La plateforme de tests. Les scénarios et les campagnes se lisent des
     deux côtés ; les anomalies aussi, puisque le client doit savoir ce qui
     a été trouvé. Seuls les passages restent cloisonnés, et ils se lisent
     campagne par campagne, à l'ouverture. */
  lot.abonner(K.scenarios(pid), () => col('projets', pid, 'scenarios'));
  /* Le plan de tests existe-t-il ? Sa présentation suffit à le dire : le
     bouton « Ce qui va être testé » n'apparaît chez le client qu'avec elle.
     Les sections, lourdes, ne se lisent que sur la page du plan. */
  lot.abonner(K.planPresentation(pid), () => doc(bdd, 'projets', pid, 'planTests', 'presentation'));
  lot.abonner(K.campagnes(pid), () => col('projets', pid, 'campagnes'));
  lot.abonner(K.anomalies(pid), () => col('projets', pid, 'anomalies'));
  lot.abonner(K.parcours(pid), () => col('projets', pid, 'parcours'));
  lot.abonner(K.regles(pid), () => col('projets', pid, 'regles'));
  lot.abonner(K.profilsTesteurs(pid), () => col('projets', pid, 'profilsTesteurs'));
  /* La maintenance continue : le contrat, ses séquences, ses journées et
     ses évolutions. Le client lit tout, c'est son espace. */
  lot.abonner(K.maintenance(pid), () => col('projets', pid, 'maintenance'));
  lot.abonner(K.axes(pid), () => (client
    ? query(col('projets', pid, 'axes'), where('publication', '==', 'publiee'))
    : col('projets', pid, 'axes')));
  lot.abonner(K.axesIntro(pid), () => doc(bdd, 'projets', pid, 'axesIntro', 'texte'));
  lot.abonner(K.taches(pid), () => surProjetVisible('taches'));
  lot.abonner(K.tickets(pid), () => surProjet('tickets'));
  lot.abonner(K.validations(pid), () => surProjet('validations'));
  lot.abonner(K.fichiers(pid), () => surProjetVisible('fichiers'));
  lot.abonner(K.releases(pid), () => surProjetVisible('releases'));
  lot.abonner(K.reunions(pid), () => surProjetVisible('reunions'));
  lot.abonner(K.notes(pid), () => surProjetVisible('notes'));
  lot.abonner(K.blocages(pid), () => surProjetVisible('blocages'));
  /* La finance : le responsable côté client, « finance.lecture » côté
     équipe. Un agent affecté au projet sans elle ne s'y abonne pas, et
     son fil d'activité ne demande pas les lignes financières (les règles
     refuseraient la requête entière). Un brouillon n'est lu que par
     l'équipe : la requête du client ne demande que les statuts visibles. */
  const finance = client ? responsable : financeDe(pid);
  if (finance) {
    lot.abonner(K.documents(pid), () => (client
      ? query(col('documents'), where('projet', '==', pid), where('statut', 'in', STATUTS_PIECE_VISIBLES))
      : surProjet('documents')));
    lot.abonner(K.paiements(pid), () => surProjet('paiements'));
    lot.abonner(K.montants(pid), () => col('projets', pid, 'montants'));
  }
  lot.abonner(K.activite(pid), () => (client
    ? query(col('activite'), where('projet', '==', pid), where('visibilite', 'in', responsable ? ['client', 'responsable'] : ['client']))
    : (finance ? surProjet('activite') : query(col('activite'), where('projet', '==', pid), where('visibilite', 'in', ['client', 'interne'])))));
};

/** Les collections globales : tout pour l'équipe, projet par projet pour un client. */
export const abonnerGlobal = (lot, session) => {
  sessionCourante = session;
  const equipe = Boolean(session.equipe);
  lot.abonner(K.profil, () => doc(bdd, 'profils', session.utilisateur.uid));
  /* Les coordonnées de règlement : le client les lit sur une facture due,
     l'équipe les règle dans les paramètres. Un seul document. */
  lot.abonner(K.reglages, () => doc(bdd, 'reglages', 'finance'));
  lot.abonner(K.reglagesAnnonces, () => doc(bdd, 'reglages', 'annonces'));
  abonnerAnnonces(lot, session);
  if (equipe && session.equipe.role !== 'admin') {
    abonnerAgent(lot, session);
  } else if (equipe) {
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
    lot.abonner(K.maintenanceToute, () => collectionGroup(bdd, 'maintenance'));
    lot.abonner(K.profils, () => collectionGroup(bdd, 'profilsTesteurs'));
    lot.abonner(K.scenariosTous, () => collectionGroup(bdd, 'scenarios'));
    lot.abonner(K.testeurs, () => col('testeurs'));
    lot.abonner(K.conversationsTesteurs, () => query(col('conversationsTesteurs'), orderBy('maj', 'desc'), limit(200)));
    lot.abonner(K.projetsInternes, () => col('projetsInternes'));
    lot.abonner(K.montantsTous, () => collectionGroup(bdd, 'montants'));
    lot.abonner(K.organisationsInternes, () => col('organisationsInternes'));
    lot.abonner(K.paiementsInternes, () => col('paiementsInternes'));
    /* Les notes que les clients ont partagées : la requête le dit, les
       règles ne laissent passer que celle-là. */
    lot.abonner(K.notesPartagees, () => query(col('notesClient'), where('partagee', '==', true)));
  } else {
    /* Le client lit le profil sans nom des testeurs de SES projets, projet
       par projet (voir abonnerProjet), jamais le vivier ni les testeurs des
       autres clients. */
    const uid = session.utilisateur.uid;
    lot.abonner(K.projets, () => query(col('projets'), where('membres', 'array-contains', uid)));
    lot.abonner(K.organisations, () => query(col('organisations'), where('membres', 'array-contains', uid)));
    lot.abonner(K.demandesProjet, () => query(col('demandesProjet'), where('par.uid', '==', uid)));
    /* Son carnet : ses notes, et rien d'autre (les règles refusent toute
       autre requête sur cette collection). */
    lot.abonner(K.notesClient, () => query(col('notesClient'), where('uid', '==', uid)));
    /* Pour mettre un nom sur le responsable du projet, au lieu de
       « Capmedia » : l'annuaire, qui ne porte que le nom. La fiche d'équipe
       (adresse, rôle) n'est plus lisible par un client. */
    lot.abonner(K.equipe, () => col('annuaire'));

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
          for (const cle of [K.documents(p.id), K.tickets(p.id), K.taches(p.id), K.fichiers(p.id), K.reunions(p.id), K.validations(p.id), K.jalons(p.id), K.maintenance(p.id)]) {
            lot.sur(cle, () => magasin.reveiller(K.projets));
          }
        }
      }
    };
    suivre(session.projets);
    lot.sur(K.projets, suivre);
  }
};

/* Les annonces : l'équipe lit tout, brouillons compris ; le client ne
   demande que les publiées qui le visent (les règles refuseraient une
   requête plus large). */
const abonnerAnnonces = (lot, session) => {
  if (session.equipe) { lot.abonner(K.annonces, () => col('annonces')); return; }
  if (session.testeur) return;
  const uid = session.utilisateur.uid;
  lot.abonner(K.annoncesTous, () => query(col('annonces'), where('publication', '==', 'publiee'), where('cible.tous', '==', true)));
  lot.abonner(K.annoncesMiennes, () => query(col('annonces'), where('publication', '==', 'publiee'), where('cible.uids', 'array-contains', uid)));
  lot.ajouter(magasin.deriver(K.annonces, [K.annoncesTous, K.annoncesMiennes], () => {
    const vues = new Map();
    [...(magasin.lire(K.annoncesTous) || []), ...(magasin.lire(K.annoncesMiennes) || [])].forEach((a) => vues.set(a.id, a));
    return [...vues.values()];
  }));
};

/**
 * Le cockpit d'un agent : ses projets, et rien d'autre. Les règles lui
 * refusent les lectures « tout d'un coup » ; il lit donc projet par projet,
 * et les clés globales que lisent les écrans (« tickets:* », « jalons:* »)
 * sont l'assemblage de ses projets. Les données commerciales (clients en
 * interne, demandes de nouveaux projets, notes de paiement) ne le
 * concernent pas.
 */
const abonnerAgent = (lot, session) => {
  const pids = [...new Set((session.equipe.projets || []).map(String))];
  for (const pid of pids) {
    abonnerProjet(lot, pid, 'equipe');
    lot.abonner(`projet-interne:${pid}`, () => doc(bdd, 'projetsInternes', pid));
    /* Les notes partagées sur SES projets : la requête nomme le projet,
       c'est ce que les règles demandent à un agent. */
    lot.abonner(K.notesPartageesProjet(pid), () => query(col('notesClient'), where('projet', '==', pid), where('partagee', '==', true)));
  }
  const assembler = (fab, tri = null) => () => {
    const tout = pids.flatMap((pid) => magasin.lire(fab(pid)) || []);
    return tri ? tri(tout) : tout;
  };
  const deriver = (cle, fab, tri) => lot.ajouter(magasin.deriver(cle, pids.map(fab), assembler(fab, tri)));
  lot.ajouter(magasin.deriver(K.projets, pids.map(K.projet), () => pids.map((pid) => magasin.lire(K.projet(pid))).filter(Boolean)
    .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')))));
  deriver(K.ticketsTous, K.tickets);
  deriver(K.tachesToutes, K.taches);
  deriver(K.validationsToutes, K.validations);
  deriver(K.documentsTous, K.documents);
  deriver(K.paiementsTous, K.paiements);
  deriver(K.montantsTous, K.montants);
  deriver(K.reunionsToutes, K.reunions);
  deriver(K.releasesToutes, K.releases);
  deriver(K.blocagesTous, K.blocages);
  deriver(K.fichiersTous, K.fichiers);
  deriver(K.activiteToute, K.activite, (liste) => liste.slice().sort(parDateDesc('date')).slice(0, 200));
  deriver(K.jalonsTous, K.jalons);
  deriver(K.campagnesToutes, K.campagnes);
  deriver(K.anomaliesToutes, K.anomalies);
  deriver(K.parcoursTous, K.parcours);
  deriver(K.reglesToutes, K.regles);
  deriver(K.maintenanceToute, K.maintenance);
  deriver(K.scenariosTous, K.scenarios);
  deriver(K.profils, K.profilsTesteurs);
  deriver(K.notesPartagees, K.notesPartageesProjet);
  lot.ajouter(magasin.deriver(K.projetsInternes, pids.map((pid) => `projet-interne:${pid}`),
    () => pids.map((pid) => magasin.lire(`projet-interne:${pid}`)).filter(Boolean)));
  /* Les sociétés et les testeurs de SES projets : les règles refusent à un
     agent la liste entière (clients et vivier des autres). Au plus trente
     projets par requête « array-contains-any ». */
  const parLots = (nom, cle) => {
    const lots = [];
    for (let i = 0; i < pids.length; i += 30) lots.push(pids.slice(i, i + 30));
    lots.forEach((l, n) => lot.abonner(`${cle}:${n}`, () => query(col(nom), where('projets', 'array-contains-any', l))));
    lot.ajouter(magasin.deriver(cle, lots.map((l, n) => `${cle}:${n}`), () => {
      const vus = new Map();
      lots.forEach((l, n) => (magasin.lire(`${cle}:${n}`) || []).forEach((x) => vus.set(x.id, x)));
      return [...vus.values()].sort((a, b) => String(a.nom || a.prenom || '').localeCompare(String(b.nom || b.prenom || '')));
    }));
  };
  if (peut(session, 'clients.gerer')) lot.abonner(K.organisations, () => query(col('organisations'), orderBy('nom')));
  else parLots('organisations', K.organisations);
  lot.abonner(K.equipe, () => col('equipe'));
  if (peut(session, 'qa.gerer')) lot.abonner(K.testeurs, () => col('testeurs'));
  else parLots('testeurs', K.testeurs);
  if (peut(session, 'qa.gerer')) lot.abonner(K.conversationsTesteurs, () => query(col('conversationsTesteurs'), orderBy('maj', 'desc'), limit(200)));
};

/**
 * Pour un client, une vue « toutes collections » agrège ses projets.
 *
 * La liste vient du magasin, pas de la session : celle-ci est figée à la
 * connexion, et un projet ouvert entre-temps n'y figure pas. Le client
 * voyait alors le projet apparaître dans sa barre mais ni son devis ni
 * ses pièces, jusqu'au rechargement.
 */
/* Les données internes d'un projet, d'une organisation, d'un paiement :
   lues par l'équipe seule, à part de la fiche que lit le client. */
export const interneDuProjet = (pid) => (magasin.lire(K.projetsInternes) || []).find((x) => x.id === pid) || {};
export const interneDeLOrganisation = (oid) => (magasin.lire(K.organisationsInternes) || []).find((x) => x.id === oid) || {};
export const noteDuPaiement = (paiementId) => ((magasin.lire(K.paiementsInternes) || []).find((x) => x.id === paiementId) || {}).note || '';

/**
 * Les profils sans nom des testeurs, un par testeur, avec la liste des
 * projets (parmi ceux que le lecteur voit) où il est inscrit. Chaque
 * document vit sous « projets/<p>/profilsTesteurs/<uid> » : l'identifiant
 * est l'uid, le parent est le projet.
 */
export const profilsTesteurs = (session) => {
  const bruts = session && session.equipe
    ? (magasin.lire(K.profils) || [])
    : (magasin.lire(K.projets) || (session && session.projets) || []).flatMap((p) => (magasin.lire(K.profilsTesteurs(p.id)) || []).map((x) => ({ ...x, _parent: x._parent || p.id })));
  const parUid = new Map();
  for (const x of bruts) {
    const deja = parUid.get(x.id);
    if (deja) { if (!deja.projets.includes(x._parent)) deja.projets.push(x._parent); continue; }
    const { _parent, ...profil } = x;
    parUid.set(x.id, { ...profil, projets: [_parent] });
  }
  return [...parUid.values()];
};

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

/* Les quatre aspects d'une section du plan de tests, dans l'ordre de la
   page, et la lettre qui les marque dans l'identifiant d'un scénario
   (« taches-f-001 » : fonctionnel). */
export const ASPECTS_PLAN = ['fonctionnel', 'technique', 'ux', 'securite'];
export const LETTRES_PLAN = { fonctionnel: 'f', technique: 't', ux: 'u', securite: 's' };
/* Le prochain identifiant libre d'un aspect : le plus grand numéro déjà
   pris, plus un. Un numéro retiré n'est jamais redonné à un autre cas. */
export const prochainIdPlan = (sid, aspect, aspects) => {
  const prefixe = `${sid}-${LETTRES_PLAN[aspect]}-`;
  const max = ASPECTS_PLAN.flatMap((a) => (aspects[a] || []))
    .map((x) => String(x.id || ''))
    .filter((x) => x.startsWith(prefixe))
    .reduce((m, x) => Math.max(m, Number(x.slice(prefixe.length)) || 0), 0);
  return `${prefixe}${String(max + 1).padStart(3, '0')}`;
};

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
      /* Une demande née d'une anomalie de test garde le lien avec elle. */
      ...(d.anomalie ? { anomalie: String(d.anomalie).slice(0, 80) } : {}),
      /* Une demande née d'une suggestion de Capmedia (« Ça m'intéresse »)
         garde le lien avec elle : les deux fiches se renvoient l'une à l'autre. */
      ...(d.suggestion ? { suggestion: String(d.suggestion).slice(0, 80) } : {}),
      /* Une demande née d'un axe d'évolution (« On en parle »). */
      ...(d.axe ? { axe: String(d.axe).slice(0, 80) } : {}),
      /* Une demande de rendez-vous, posée depuis le calendrier : le jour,
         le créneau (matin, après-midi, heure), l'heure et le sujet. */
      ...(d.rendezVous ? { rendezVous: { date: String(d.rendezVous.date || ''), creneau: d.rendezVous.creneau, heure: String(d.rendezVous.heure || ''), sujet: String(d.rendezVous.sujet || '').slice(0, 100) } } : {}),
      cree: serverTimestamp(), maj: serverTimestamp(), resolu: null,
      /* « lu.client » reste le repère commun ; « lu.clients » en garde un
         par personne, pour que le point « non lu » soit celui de chacun
         et non celui du dernier collègue passé. */
      lu: { client: auteur.cote === 'client' ? serverTimestamp() : null, equipe: auteur.cote === 'equipe' ? serverTimestamp() : null, clients: auteur.cote === 'client' ? { [auteur.uid]: serverTimestamp() } : {} },
      qualification: null, devis: null,
      /* La demande qui en poursuit une autre : le serveur écrit « suivant »
         sur l'ancienne, et les deux fiches se renvoient l'une à l'autre. */
      suite: d.suite || null,
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

  marquerLuDemande: (tid, cote, uid = null) => updateDoc(doc(bdd, 'tickets', tid), { [`lu.${cote}`]: serverTimestamp(), ...(cote === 'client' && uid ? { [`lu.clients.${uid}`]: serverTimestamp() } : {}) }),

  clientValideDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'resolu', resolu: serverTimestamp(), maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  clientRouvreDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'en-cours', maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  /* « Je n'en ai plus besoin » : le client retire sa demande tant qu'elle
     est ouverte et chez nous (règle clientAnnule). La marque « lu.client »
     dit au serveur que c'est lui, pas l'équipe. */
  clientAnnuleDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'annulee', maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  /* « Pas tout à fait » : la correction livrée ne tient pas, la demande
     repasse chez nous, avec le message qui dit pourquoi. */
  clientContesteDemande: (tid) => updateDoc(doc(bdd, 'tickets', tid), { statut: 'en-cours', maj: serverTimestamp(), 'lu.client': serverTimestamp() }),
  ajouterPiecesDemande: (tid, pieces) => updateDoc(doc(bdd, 'tickets', tid), { pieces, maj: serverTimestamp() }),

  /* Pilotage par l'équipe. */
  majDemande: (tid, changements) => updateDoc(doc(bdd, 'tickets', tid), nettoyer({ ...changements, maj: serverTimestamp() })),

  /* --- La conversation d'un projet ------------------------------------ */
  /* Un message peut n'être que des pièces : le texte reste vide, jamais un
     mot inventé à la place. La règle l'accepte quand `pieces` n'est pas vide. */
  async messageProjet(session, pid, texte, pieces = []) {
    const de = auteurDe(session);
    await addDoc(col('projets', pid, 'messages'), { de: { uid: de.uid, nom: de.nom, cote: de.cote }, texte: String(texte || ''), pieces, date: serverTimestamp() });
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
  async repondreValidation(session, vid, statut, commentaire, pieces = []) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'validations', vid), {
      statut, reponse: { par: par.uid, nom: par.nom, date: serverTimestamp(), commentaire: commentaire || '', pieces: Array.isArray(pieces) ? pieces.slice(0, 10) : [] }, maj: serverTimestamp(),
    });
  },
  async creerValidation(session, pid, d, pieces = []) {
    const par = auteurDe(session);
    const ref = await addDoc(col('validations'), nettoyer({
      projet: pid, titre: d.titre, type: d.type || 'autre', description: d.description || '',
      cible: d.cible || null, pieces, statut: 'en-attente', echeance: dateOuNull(d.echeance),
      reserveeResponsable: Boolean(d.reserveeResponsable),
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
    /* Le fichier est rangé sous « projets/<p>/fichiers/<id de la fiche>/ » :
       la fiche prend cet identifiant, que les règles Storage relisent pour
       décider qui peut le télécharger. */
    const id = (String(fiche.chemin || '').match(new RegExp(`^projets/${pid}/fichiers/([^/]+)/`)) || [])[1];
    if (!id) throw new Error("Ce fichier n'a pas été rangé au bon endroit. Recommencez l'envoi.");
    const ref = doc(bdd, 'fichiers', id);
    await setDoc(ref, nettoyer({
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
  /* Le client retire un fichier qu'il a lui-même déposé : l'objet d'abord
     (la règle Storage relit la fiche pour vérifier l'auteur), la fiche
     ensuite. Si l'objet a déjà disparu, la fiche part quand même. */
  async retirerFichier(f) {
    if (f && f.chemin) {
      try { await deleteObject(refStockage(stockage, f.chemin)); } catch (e) { if (!e || e.code !== 'storage/object-not-found') throw e; }
    }
    await deleteDoc(doc(bdd, 'fichiers', f.id));
  },

  /* --- Les pièces comptables (côté client) ---------------------------- */
  async repondreDevis(session, did, statut, commentaire) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'documents', did), {
      statut, reponse: { par: par.uid, nom: par.nom, date: serverTimestamp(), commentaire: commentaire || '' },
    });
  },
  consulterDevis: (did) => updateDoc(doc(bdd, 'documents', did), { statut: 'consulte' }),
  /* « J'ai réglé cette facture » : le client déclare, l'équipe confirme en
     enregistrant le paiement. La règle borne les champs et exige que le
     déclarant soit celui qui écrit, sur une facture due. */
  async declarerReglement(session, did, { date, moyen, reference, montant }) {
    const par = auteurDe(session);
    const quand = enDate(date) || new Date();
    await updateDoc(doc(bdd, 'documents', did), {
      reglementDeclare: {
        par: par.uid, nom: par.nom, date: Timestamp.fromDate(quand), moyen: moyen || 'virement',
        reference: String(reference || '').trim().slice(0, 80), montant: Math.round((Number(montant) || 0) * 100) / 100,
        le: serverTimestamp(),
      },
    });
  },
  /* Les coordonnées de règlement de l'agence, par la finance de l'équipe. */
  reglerFinance: (d) => setDoc(doc(bdd, 'reglages', 'finance'), {
    titulaire: String(d.titulaire || '').trim(), iban: String(d.iban || '').replace(/\s+/g, '').toUpperCase(), bic: String(d.bic || '').trim().toUpperCase(),
    banque: String(d.banque || '').trim(), mention: String(d.mention || '').trim(), maj: serverTimestamp(),
  }),

  /* --- Les annonces de Capmedia ---------------------------------------
     L'administrateur les écrit en entier (firestore.rules : annonceValide).
     Publier date la publication : c'est elle qui fait le « non lu » du
     client, et c'est elle qui déclenche la notification (hubAnnonceEcrite). */
  enregistrerAnnonce: (id, d) => {
    const fiche = {
      type: d.type, titre: d.titre, texte: d.texte || '', dateEffet: d.dateEffet || '',
      publication: d.publication === 'publiee' ? 'publiee' : 'brouillon',
      publieLe: d.publieLe === undefined ? null : d.publieLe,
      epinglee: Boolean(d.epinglee),
      cible: { tous: d.cible.tous !== false, organisations: d.cible.organisations || [], uids: d.cible.uids || [] },
      tarif: d.type === 'tarif' ? d.tarif : null,
      indisponibilite: d.type === 'indisponibilite' ? d.indisponibilite : null,
      maj: serverTimestamp(),
    };
    if (id) return updateDoc(doc(bdd, 'annonces', id), fiche).then(() => ({ id }));
    return addDoc(col('annonces'), { ...fiche, cree: serverTimestamp() });
  },
  publierAnnonce: (id, oui) => updateDoc(doc(bdd, 'annonces', id), {
    publication: oui ? 'publiee' : 'brouillon', publieLe: oui ? serverTimestamp() : null, maj: serverTimestamp(),
  }),
  epinglerAnnonce: (id, oui) => updateDoc(doc(bdd, 'annonces', id), { epinglee: Boolean(oui), maj: serverTimestamp() }),
  supprimerAnnonce: (id) => deleteDoc(doc(bdd, 'annonces', id)),
  poserIntroAnnonces: (texte) => setDoc(doc(bdd, 'reglages', 'annonces'), { intro: String(texte || '').slice(0, 600), maj: serverTimestamp() }),
  /* Ouvrir la page des annonces les marque lues : une date, dans le profil. */
  marquerAnnoncesLues: (uid) => setDoc(doc(bdd, 'profils', uid), { annoncesLues: serverTimestamp(), maj: serverTimestamp() }, { merge: true }),

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
  /* Budget, note de budget, santé : réservés à Capmedia, hors de la fiche projet. */
  majProjetInterne: (pid, changements) => setDoc(doc(bdd, 'projetsInternes', pid), nettoyer({ ...changements, maj: serverTimestamp() }), { merge: true }),
  /* La note d'un projet à faire, réécrite entière à chaque fois. */
  noterIdee: (pid, texte, uid) => setDoc(doc(bdd, 'idees', pid), { texte: String(texte || ''), par: uid, maj: serverTimestamp() }),

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

  /* --- Le plan de tests (« ce qui va être testé ») -----------------------
     Une section porte ses scénarios dans ses quatre aspects. Ajouter,
     modifier ou retirer un scénario réécrit la liste de son aspect : on le
     fait dans une transaction, pour que deux personnes qui éditent la même
     section au même moment ne s'effacent pas l'une l'autre. Chaque
     écriture dit qui l'a faite et quand : l'outil d'import refuse ensuite
     d'écraser une section retouchée dans le Cockpit sans qu'on le lui dise. */
  majSectionPlan: (pid, sid, uid, { titre, resume }) => updateDoc(doc(bdd, 'projets', pid, 'planTests', sid), {
    titre, resume: resume || '', maj: serverTimestamp(), editeLe: serverTimestamp(), editePar: uid,
  }),
  enregistrerPresentationPlan: (pid, uid, { intro, plateformes, aspects }) => setDoc(doc(bdd, 'projets', pid, 'planTests', 'presentation'), {
    genre: 'presentation', intro: intro || '', plateformes: plateformes || '', aspects: aspects || {},
    maj: serverTimestamp(), editeLe: serverTimestamp(), editePar: uid,
  }, { merge: true }),
  async enregistrerScenarioPlan(pid, sid, uid, { ancien = '', aspect, scenario }) {
    const ref = doc(bdd, 'projets', pid, 'planTests', sid);
    let id = ancien;
    await runTransaction(bdd, async (t) => {
      const instantane = await t.get(ref);
      if (!instantane.exists()) throw new Error('Cette section n\'existe plus.');
      const aspects = { fonctionnel: [], technique: [], ux: [], securite: [], ...(instantane.data().aspects || {}) };
      let avant = '';
      if (ancien) {
        avant = ASPECTS_PLAN.find((a) => (aspects[a] || []).some((x) => x.id === ancien)) || '';
        if (!avant) throw new Error('Ce scénario a été retiré entre-temps.');
      }
      id = ancien && avant === aspect ? ancien : prochainIdPlan(sid, aspect, aspects);
      const fiche = { ...scenario, id };
      if (ancien && avant === aspect) aspects[aspect] = aspects[aspect].map((x) => (x.id === ancien ? fiche : x));
      else {
        if (ancien) aspects[avant] = aspects[avant].filter((x) => x.id !== ancien);
        aspects[aspect] = [...(aspects[aspect] || []), fiche];
      }
      t.update(ref, { aspects, maj: serverTimestamp(), editeLe: serverTimestamp(), editePar: uid });
    });
    return id;
  },
  async supprimerScenarioPlan(pid, sid, uid, id) {
    const ref = doc(bdd, 'projets', pid, 'planTests', sid);
    await runTransaction(bdd, async (t) => {
      const instantane = await t.get(ref);
      if (!instantane.exists()) throw new Error('Cette section n\'existe plus.');
      const aspects = { fonctionnel: [], technique: [], ux: [], securite: [], ...(instantane.data().aspects || {}) };
      ASPECTS_PLAN.forEach((a) => { aspects[a] = (aspects[a] || []).filter((x) => x.id !== id); });
      t.update(ref, { aspects, maj: serverTimestamp(), editeLe: serverTimestamp(), editePar: uid });
    });
  },

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

  /* Une anomalie posée à la main par l'équipe. Celles qui viennent d'un
     échec de testeur sont posées par le serveur, sous « ko-<scénario> » ;
     celles-ci prennent un identifiant libre, et la même feuille les
     qualifie toutes. */
  creerAnomalie: (pid, d) => addDoc(col('projets', pid, 'anomalies'), nettoyer({
    ...d, origine: 'equipe', passages: d.passages || [], temoins: d.temoins || [],
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majAnomalie: (pid, id, d) => updateDoc(doc(bdd, 'projets', pid, 'anomalies', id), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerAnomalie: (pid, id) => deleteDoc(doc(bdd, 'projets', pid, 'anomalies', id)),

  majParcours: (pid, ref, d) => updateDoc(doc(bdd, 'projets', pid, 'parcours', ref), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerParcours: (pid, ref) => deleteDoc(doc(bdd, 'projets', pid, 'parcours', ref)),

  /* --- La maintenance continue ---------------------------------------- */

  /* La demande du client : le contrat naît avec elle, ou y revient si un
     forfait passé s'est arrêté. Les règles n'acceptent que ces champs, et
     rien d'autre : un client ne pose pas ses propres modalités. */
  async demanderMaintenance(session, pid, { message = '', rythme = '' } = {}) {
    const par = auteurDe(session);
    const demande = { par: { uid: par.uid, nom: par.nom, email: par.email }, message, rythme, le: serverTimestamp() };
    const ref = doc(bdd, 'projets', pid, 'maintenance', 'contrat');
    const deja = await getDoc(ref);
    if (deja.exists()) await updateDoc(ref, { statut: 'demande', demande, maj: serverTimestamp() });
    else await setDoc(ref, { genre: 'contrat', statut: 'demande', demande, cree: serverTimestamp(), maj: serverTimestamp() });
  },

  /* Une évolution proposée par le client : un titre, une description, des
     pièces jointes. Le statut et l'origine sont imposés, l'équipe tranche
     ensuite. L'identifiant peut être tiré d'avance : les pièces se rangent
     sous lui avant que la fiche existe. */
  proposerEvolution(session, pid, d, id = null) {
    const par = auteurDe(session);
    const fiche = {
      genre: 'evolution', titre: d.titre, description: d.description || '', statut: 'proposee', origine: 'client',
      pieces: Array.isArray(d.pieces) ? d.pieces : [],
      par: { uid: par.uid, nom: par.nom, email: par.email }, cree: serverTimestamp(), maj: serverTimestamp(),
    };
    return id ? setDoc(doc(bdd, 'projets', pid, 'maintenance', id), fiche) : addDoc(col('projets', pid, 'maintenance'), fiche);
  },
  /* Le client retire sa propre proposition tant qu'elle est « proposée » :
     les règles vérifient l'auteur et le statut. */
  retirerEvolution: (pid, id) => deleteDoc(doc(bdd, 'projets', pid, 'maintenance', id)),

  /* Le contrat, posé ou repris par l'équipe. « merge » garde la demande
     du client telle qu'il l'a écrite. */
  poserContratMaintenance: (pid, d, { neuf = false } = {}) => setDoc(doc(bdd, 'projets', pid, 'maintenance', 'contrat'),
    nettoyer({ ...d, genre: 'contrat', ...(neuf ? { cree: serverTimestamp() } : {}), maj: serverTimestamp() }), { merge: true }),
  creerElementMaintenance: (pid, d) => addDoc(col('projets', pid, 'maintenance'), nettoyer({ ...d, cree: serverTimestamp(), maj: serverTimestamp() })),
  majElementMaintenance: (pid, id, d) => updateDoc(doc(bdd, 'projets', pid, 'maintenance', id), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerElementMaintenance: (pid, id) => deleteDoc(doc(bdd, 'projets', pid, 'maintenance', id)),
  /* Retirer le forfait emporte tout ce qui vivait sous lui : une séquence
     sans contrat n'aurait plus de sens à l'écran. */
  async supprimerMaintenance(pid) {
    const inst = await getDocs(col('projets', pid, 'maintenance'));
    await Promise.all(inst.docs.map((x) => deleteDoc(x.ref)));
  },

  /* --- Les axes d'évolution ------------------------------------------
     L'équipe les écrit en entier ; le client ne pose que sa réponse (les
     règles ne lui laissent que « reponse » et « maj »). Le prix d'un axe
     vit dans montants/axe-<id> : le responsable seul le lit. */
  creerAxe: (pid, d, id = null) => {
    const fiche = {
      plateforme: d.plateforme || 'general', titre: d.titre, description: d.description || '', detail: d.detail || '',
      apport: d.apport || '', ampleur: d.ampleur || '', etat: d.etat || 'propose',
      publication: d.publication === 'publiee' ? 'publiee' : 'brouillon',
      publieLe: d.publication === 'publiee' ? serverTimestamp() : null,
      ordre: Number(d.ordre) || 0, devis: d.devis || '', reponse: null,
      cree: serverTimestamp(), maj: serverTimestamp(), editeLe: serverTimestamp(),
    };
    if (id) return setDoc(doc(bdd, 'projets', pid, 'axes', id), fiche).then(() => ({ id }));
    return addDoc(col('projets', pid, 'axes'), fiche);
  },
  majAxe: (pid, aid, d) => updateDoc(doc(bdd, 'projets', pid, 'axes', aid), nettoyer({ ...d, maj: serverTimestamp(), editeLe: serverTimestamp() })),
  publierAxe: (pid, aid, oui) => updateDoc(doc(bdd, 'projets', pid, 'axes', aid), {
    publication: oui ? 'publiee' : 'brouillon', publieLe: oui ? serverTimestamp() : null, maj: serverTimestamp(),
  }),
  supprimerAxe: (pid, aid) => deleteDoc(doc(bdd, 'projets', pid, 'axes', aid)),
  /* Le geste du client : un choix (avec la demande née de « On en
     parle »), ou rien quand il décoche. Daté par le serveur. */
  async repondreAxe(session, pid, aid, choix, demande = '') {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'projets', pid, 'axes', aid), {
      reponse: choix ? { par: par.uid, nom: String(par.nom || '').slice(0, 120), choix, demande: String(demande || '').slice(0, 80), le: serverTimestamp() } : null,
      maj: serverTimestamp(),
    });
  },
  poserIntroAxes: (pid, texte) => setDoc(doc(bdd, 'projets', pid, 'axesIntro', 'texte'), { texte: String(texte || '').slice(0, 1000), maj: serverTimestamp() }),

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
    devis: d.devis || '', reports: [],
    cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majJalon: (pid, jid, d) => updateDoc(doc(bdd, 'projets', pid, 'jalons', jid), nettoyer({ ...d, maj: serverTimestamp() })),
  /* Un montant (étape de devis « jalon-<id> », forfait « maintenance ») :
     à part de la fiche que lisent l'équipe et le client, réservé à la
     finance. Vide, il s'efface. */
  poserMontant: (pid, cle, montant) => (montant === null || montant === undefined || montant === '' || !Number.isFinite(Number(montant))
    ? deleteDoc(doc(bdd, 'projets', pid, 'montants', cle))
    : setDoc(doc(bdd, 'projets', pid, 'montants', cle), { projet: pid, montant: Number(montant), maj: serverTimestamp() })),
  supprimerJalon: (pid, jid) => deleteDoc(doc(bdd, 'projets', pid, 'jalons', jid)),

  creerLien: (pid, d) => addDoc(col('projets', pid, 'liens'), nettoyer({
    nom: d.nom, categorie: d.categorie || 'autre', url: d.url, environnement: d.environnement || '',
    composant: d.composant || '', description: d.description || '', visibilite: d.visibilite || 'client', etat: d.etat || 'actif',
    /* Un lien « Accès » porte l'identifiant que le client doit connaître. */
    identifiants: d.identifiants || '',
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
  /* La réponse du client sur une tâche qui l'attend : un texte, des
     pièces, et la tâche passe « réponse reçue » (règle clientRepondTache).
     Elle quitte « En attente de vous » sans que l'équipe ait à la changer. */
  async repondreTache(session, tid, texte, pieces = []) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'taches', tid), {
      statut: 'repondu',
      reponseClient: { par: par.uid, nom: par.nom, texte: String(texte || ''), pieces: Array.isArray(pieces) ? pieces.slice(0, 10) : [], date: serverTimestamp() },
      maj: serverTimestamp(),
    });
  },

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
      /* La demande de rendez-vous qu'elle accepte, s'il y en a une. */
      ...(d.ticket ? { ticket: d.ticket } : {}),
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },
  majReunion: (rid, d) => updateDoc(doc(bdd, 'reunions', rid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerReunion: (rid) => deleteDoc(doc(bdd, 'reunions', rid)),
  /* Le client coche une action d'une réunion. Il n'écrit que la liste des
     actions, rien d'autre : la règle ne lui laisse que ce champ, et la
     liste garde sa taille. */
  cocherAction: (rid, actions, i, fait) => updateDoc(doc(bdd, 'reunions', rid), {
    actions: (actions || []).map((a, k) => (k === i ? { ...a, fait: Boolean(fait) } : a)),
  }),

  async creerNote(session, pid, d) {
    const par = auteurDe(session);
    /* Une proposition de l'équipe attend la réponse du client : elle naît
       « à valider », et se lit forcément du client (les règles l'exigent). */
    const proposition = d.type === 'proposition';
    const ref = await addDoc(col('notes'), nettoyer({
      projet: pid, composant: d.composant || '', plateforme: d.plateforme || '',
      type: d.type || 'information', titre: d.titre, contenu: d.contenu || '',
      contexte: d.contexte || '', impact: d.impact || '', decidePar: d.decidePar || '',
      date: dateOuNull(d.date) || Timestamp.now(), visibilite: proposition ? 'client' : (d.visibilite || 'client'),
      ...(proposition ? { etat: 'a-valider', origine: 'equipe' } : {}),
      cree: serverTimestamp(), maj: serverTimestamp(), par: { uid: par.uid, nom: par.nom },
    }));
    return ref.id;
  },

  /* --- Les propositions « à valider » (page Notes d'un projet) -------- */
  /* Un membre du projet propose : la forme est celle que les règles
     attendent (propositionDuClient), datée par le serveur. L'équipe est
     prévenue par la conversation du projet, comme pour une note
     partagée : le message suit hubMessageProjet (notification et lettre
     à l'équipe), sans fonction serveur de plus. */
  propositionClient(session, pid, { titre, contenu = '' }) {
    const par = auteurDe(session);
    return {
      projet: pid, type: 'proposition', etat: 'a-valider', origine: 'client', visibilite: 'client',
      titre: String(titre || '').trim().slice(0, 160), contenu: String(contenu || '').trim().slice(0, 4000),
      par: { uid: par.uid, nom: String(par.nom || '').slice(0, 120), cote: 'client' },
      date: serverTimestamp(), cree: serverTimestamp(), maj: serverTimestamp(),
    };
  },
  async proposerAValider(session, pid, d) {
    const ref = await addDoc(col('notes'), ecrire.propositionClient(session, pid, d));
    await ecrire.messageProjet(session, pid, `Proposé à la validation : « ${String(d.titre || '').trim()} »`.slice(0, 6000)).catch(() => {});
    return ref.id;
  },
  /* Une idée du carnet passe dans « À valider » d'un geste : la
     proposition naît et la note quitte le carnet, dans la même écriture.
     L'idée n'existe ainsi jamais deux fois. */
  async proposerIdee(session, note, pid, d) {
    const lot = writeBatch(bdd);
    const ref = doc(col('notes'));
    lot.set(ref, ecrire.propositionClient(session, pid, d));
    lot.delete(doc(bdd, 'notesClient', note.id));
    await lot.commit();
    await ecrire.messageProjet(session, pid, `Proposé à la validation : « ${String(d.titre || '').trim()} »`.slice(0, 6000)).catch(() => {});
    return ref.id;
  },
  /* La réponse du responsable : valider (la proposition devient une
     décision, datée par le serveur, à son nom) ou refuser avec un motif.
     Les règles (reponseDuResponsable) ne laissent bouger que ces champs. */
  async repondreProposition(session, note, { valider, motif = '' }) {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'notes', note.id), {
      etat: valider ? 'validee' : 'refusee',
      reponse: { par: par.uid, nom: String(par.nom || '').slice(0, 120), date: serverTimestamp(), motif: String(motif || '').trim().slice(0, 1000) },
      maj: serverTimestamp(),
    });
    const titre = String(note.titre || '').trim();
    const texte = valider ? `Validé : « ${titre} ». C'est désormais une décision du projet.` : `Refusé : « ${titre} ». ${String(motif || '').trim()}`;
    await ecrire.messageProjet(session, note.projet, texte.slice(0, 6000)).catch(() => {});
  },
  retirerProposition: (id) => deleteDoc(doc(bdd, 'notes', id)),
  majNote: (nid, d) => updateDoc(doc(bdd, 'notes', nid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerNote: (nid) => deleteDoc(doc(bdd, 'notes', nid)),

  creerBlocage: (pid, d) => addDoc(col('blocages'), nettoyer({
    projet: pid, composant: d.composant || '', plateforme: d.plateforme || '',
    titre: d.titre, description: d.description || '', responsable: d.responsable || 'client',
    impact: d.impact || '', depuis: dateOuNull(d.depuis) || Timestamp.now(), resolu: null,
    /* Ce qu'on attend du client, et pour quand : c'est ce que sa fiche du
       point bloquant lui dit, au lieu d'un titre sans consigne. */
    attendu: d.attendu || '', echeance: dateOuNull(d.echeance), signaleFait: null,
    visibilite: d.visibilite || 'client', cree: serverTimestamp(), maj: serverTimestamp(),
  })),
  majBlocage: (bid, d) => updateDoc(doc(bdd, 'blocages', bid), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerBlocage: (bid) => deleteDoc(doc(bdd, 'blocages', bid)),
  /* « C'est fait » : le client dit qu'un point bloquant de son côté est
     réglé (règle clientSignaleFait, une fois). L'équipe lève ensuite. */
  async signalerBlocageFait(session, bid, texte = '') {
    const par = auteurDe(session);
    await updateDoc(doc(bdd, 'blocages', bid), {
      signaleFait: { par: par.uid, nom: par.nom, date: serverTimestamp(), texte: String(texte || '') }, maj: serverTimestamp(),
    });
  },

  /* --- « Vos notes » : le carnet du client ---------------------------- */
  /* Une note naît privée, à son nom. Les règles n'acceptent que ces
     champs (notesClient), et refusent toute lecture par un autre. */
  async creerNoteClient(session, { texte, projet = '' }) {
    const par = auteurDe(session);
    const ref = await addDoc(col('notesClient'), {
      uid: par.uid, nom: par.nom, projet: String(projet || ''), texte: String(texte || '').trim(),
      epinglee: false, partagee: false, cree: serverTimestamp(), maj: serverTimestamp(),
    });
    return ref.id;
  },
  majNoteClient: (id, d) => updateDoc(doc(bdd, 'notesClient', id), nettoyer({ ...d, maj: serverTimestamp() })),
  supprimerNoteClient: (id) => deleteDoc(doc(bdd, 'notesClient', id)),
  /* Partager : la note devient lisible par l'équipe du projet, et son
     texte part dans la conversation du projet, précédé de « Note
     partagée : », comme un message du client. Ce message suit les règles
     des messages (ligne d'activité, notification et lettre à l'équipe,
     hubMessageProjet) ; reprendre la note ensuite ne le retire pas. */
  async partagerNoteClient(session, note, pid) {
    await updateDoc(doc(bdd, 'notesClient', note.id), { partagee: true, projet: pid, maj: serverTimestamp() });
    await ecrire.messageProjet(session, pid, `Note partagée : ${String(note.texte || '').trim()}`.slice(0, 6000));
  },
  reprendreNoteClient: (id) => updateDoc(doc(bdd, 'notesClient', id), { partagee: false, maj: serverTimestamp() }),
};

/** Les notes dans l'ordre du carnet : les épinglées d'abord, puis les plus récentes en haut. */
export const trierNotes = (notes = []) => notes.slice().sort((a, b) => {
  if (Boolean(a.epinglee) !== Boolean(b.epinglee)) return a.epinglee ? -1 : 1;
  const quand = (n) => { const d = enDate(n.cree); return d ? d.getTime() : 0; };
  return quand(b) - quand(a);
});

/** Les notes partagées sur un projet, vues par l'équipe. Un client n'en a pas (clé jamais abonnée : vide). */
export const notesPartageesDuProjet = (pid) => trierNotes((magasin.lire(K.notesPartagees) || []).filter((n) => n.projet === pid && n.partagee === true));

/* ==========================================================================
   5. Les calculs dérivés
   ========================================================================== */

/** La progression d'un projet, selon son mode. */
/* D'où sort le chiffre. Le dire évite qu'on le croie plus précis qu'il ne l'est. */
export const MODES_PROGRESSION = {
  etapes:  "d'après les étapes de la feuille de route",
  manuel:  'estimé par Capmedia',
  parties: "d'après les parties du projet",
  taches:  "d'après les tâches",
  termine: 'projet terminé',
  inconnu: '',
};

/* La marque « date du serveur », pour un éditeur qui date ce qu'il
   enregistre (le pouls) sans composer lui-même une écriture Firestore. */
export const horodatage = () => serverTimestamp();

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
  if (cote.length) r.push(pluriel(cote.length, 'demande en attente de votre réponse depuis plus d\'une semaine', 'demandes en attente de votre réponse depuis plus d\'une semaine'));
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

/* Une réunion est à venir tant que son heure n'est pas passée depuis plus
   d'une heure : la même règle partout (accueil, onglet Réunions, agenda).
   Raisonner au jour laissait une réunion du matin « à venir » tout
   l'après-midi. */
export const reunionAVenir = (r) => {
  const d = enDate(r && r.date);
  return Boolean(d) && d.getTime() >= Date.now() - 3600 * 1000;
};
export const prochaineReunion = (reunions = []) => [...reunions]
  .filter(reunionAVenir)
  .sort(parDateAsc('date'))[0] || null;

/* Ce qu'on sait d'une plateforme d'après ses versions, et non d'après un
   champ saisi à la main : la dernière disponible, et la dernière en route
   (en test, soumise ou en validation). Une version se rattache par sa
   plateforme, ou par la partie du projet qui la porte. */
export const etatVersions = (releases = [], cle, composant = null) => {
  const siennes = releases.filter((r) => r.plateforme === cle || (composant && r.composant && r.composant === composant.id));
  const derniere = (liste) => liste.slice().sort(parDateDesc('date'))[0] || null;
  return {
    disponible: derniere(siennes.filter((r) => r.statut === 'disponible')),
    enRoute: derniere(siennes.filter((r) => ['test', 'soumise', 'revue'].includes(r.statut))),
  };
};

/* La version en ligne et celle en préparation d'une partie. La fiche de
   la partie fait foi quand l'équipe l'a remplie (versionEnLigne,
   versionEnPreparation) ; sinon les versions réelles (releases) ; sinon
   les anciens champs version et versionPrep. Chaque morceau est une
   chaîne, vide quand on ne sait pas : jamais « undefined » à l'écran. */
export const versionsPartie = (releases = [], cle, composant = null) => {
  const v = etatVersions(releases, cle, composant);
  const c = composant || {};
  const vl = c.versionEnLigne || {};
  const vp = c.versionEnPreparation || {};
  let enLigne = null;
  if (vl.numero) enLigne = { numero: String(vl.numero), quand: datePartie(vl.date), ou: String(vl.ou || '') };
  else if (v.disponible && v.disponible.version) enLigne = { numero: String(v.disponible.version), quand: dateCourte(v.disponible.date), ou: '' };
  else if (c.version) enLigne = { numero: String(c.version), quand: '', ou: String(c.environnement || '') };
  let prep = null;
  if (vp.numero) prep = { numero: String(vp.numero), etat: String(vp.etat || '') };
  else if (v.enRoute && v.enRoute.version) {
    const statut = ((STATUTS_RELEASE[v.enRoute.statut] || {}).libelle || 'En test');
    prep = { numero: String(v.enRoute.version), etat: [statut, dateCourte(v.enRoute.date) ? `depuis le ${dateCourte(v.enRoute.date)}` : '', v.enRoute.build ? `build ${v.enRoute.build}` : ''].filter(Boolean).join(' · ') };
  } else if (c.versionPrep) prep = { numero: String(c.versionPrep), etat: '' };
  return { ...v, enLigne, prep };
};

/** L'activité arrivée après une date, sans les gestes de la personne
    elle-même : ce qu'elle a fait, elle le sait déjà. */
export const activiteDepuis = (activite = [], depuisDate, { sansUid = null } = {}) => {
  const seuil = enDate(depuisDate);
  if (!seuil) return [];
  return activite.filter((a) => {
    const d = enDate(a.date);
    return d && d > seuil && !(sansUid && a.par && a.par.uid === sansUid);
  });
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

/* Une validation réservée au responsable n'attend pas un collaborateur :
   elle n'est pas « à lui », il ne peut pas y répondre. Les écrans qui
   listent les validations en attente passent par ici, comme le compteur. */
export const peutRepondreValidation = (v) => {
  const moi = sessionCourante && !sessionCourante.equipe && sessionCourante.utilisateur ? sessionCourante.utilisateur.uid : null;
  return v.reserveeResponsable !== true || !moi || responsableDe(v.projet);
};

export const enAttenteDeVous = ({ projets = [], tickets = [], validations = [], documents = [], taches = [], blocages = [] }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  validations.filter((v) => v.statut === 'en-attente' && peutRepondreValidation(v)).forEach((v) => items.push({
    genre: 'validation', projet: v.projet, icone: 'valider', ton: 'violet', titre: v.titre, sous: `À valider depuis ${age(v.cree)} · ${nomProjet(v.projet)}`, chemin: `/valider/${v.id}`, date: v.cree,
  }));
  tickets.filter((t) => ATTEND_CLIENT.includes(t.statut) && !t.archive).forEach((t) => items.push({
    genre: 'demande', projet: t.projet, icone: t.statut === 'a-valider' ? 'check' : 'help', ton: 'ambre',
    titre: t.titre, sous: `${t.statut === 'a-valider' ? 'À valider' : 'Une réponse est attendue'} · ${nomProjet(t.projet)}`,
    chemin: `/projets/${t.projet}/demandes/${t.id}`, date: t.maj,
  }));
  documents.filter((d) => devisADecider(d) && !d.archive).forEach((d) => items.push({
    genre: 'devis', projet: d.projet, icone: 'receipt', ton: 'bleu', titre: d.libelle, sous: `Devis à décider, envoyé il y a ${age(d.date)} · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.date,
  }));
  documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut) && !d.archive).forEach((d) => items.push({
    genre: 'facture', projet: d.projet, icone: 'euro', ton: statutPiece(d) === 'en-retard' ? 'rouge' : 'ambre', titre: d.libelle, sous: `Facture à régler${retard(d.echeance) ? `, en retard de ${retard(d.echeance)}` : dateCourte(d.echeance) ? `, échéance ${dateCourte(d.echeance)}` : ''} · ${nomProjet(d.projet)}`, chemin: `/finances/${d.id}`, date: d.echeance || d.date,
  }));
  taches.filter((t) => t.statut === 'attente-client' && !t.archive).forEach((t) => items.push({
    genre: 'tache', projet: t.projet, icone: 'taches', ton: 'ambre', titre: t.titre, sous: `Nous attendons votre retour${retard(t.echeance) ? `, en retard de ${retard(t.echeance)}` : ''} · ${nomProjet(t.projet)}`, chemin: `/projets/${t.projet}/taches/${t.id}`, date: t.echeance || t.maj,
  }));
  blocages.filter((b) => !b.resolu && b.responsable === 'client').forEach((b) => items.push({
    genre: 'blocage', projet: b.projet, icone: 'alerte', ton: 'rouge', titre: b.titre, sous: `Point bloquant de votre côté depuis ${age(b.depuis)} · ${nomProjet(b.projet)}`, chemin: `/projets/${b.projet}?blocage=${b.id}`, date: b.depuis,
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

/* ==========================================================================
   Le coffre-fort d'un projet

   coffres/{projetId}                  l'enveloppe en cours (sel, IV, chiffré), son
                                       numéro, et qui connaît la clé (porteurs)
   coffres/{projetId}/enveloppes/{n}   chaque enveloppe posée, en ajout seul
   coffres/{projetId}/entrees/{id}     une entrée : { v, g, n, iv, donnees, cree, maj }
   coffres/{projetId}/appareils/{id}   la copie de la clé propre à un appareil
   coffres/{projetId}/journal/{id}     qui a ouvert, quand, comment ; aucun contenu

   Rien n'est en clair : le chiffrement a lieu avant (coffre-chiffre.js).
   Les règles n'acceptent pas d'autres champs que ceux-ci, ce qui interdit
   qu'un nom de service ou une note y glisse un jour en clair. Ces écoutes
   ne passent pas par le magasin : elles naissent et meurent avec l'onglet.
   ========================================================================== */

/* Un lot Firestore porte 500 écritures ; on en garde une marge. Le
   renouvellement de la clé doit tenir en UN lot : à moitié fait, il
   laisserait des entrées sous deux clés. */
export const LOT_MAX_COFFRE = 400;

const refCoffre = (pid) => doc(bdd, 'coffres', pid);
const colCoffre = (pid, sous) => col('coffres', pid, sous);

/* Ce qui marque une personne parmi les porteurs de la clé ; la même
   forme que la règle (marqueCoffre). */
export const marqueCoffre = (session) => `${session.equipe ? 'equipe' : 'client'}:${session.utilisateur.uid}`;

const ligneJournal = (session, action, moyen = '') => ({
  uid: session.utilisateur.uid,
  cote: session.equipe ? 'equipe' : 'client',
  action, moyen, date: serverTimestamp(),
});

const posePourEnveloppe = (b, pid, session, enveloppe, numero) => {
  b.set(doc(colCoffre(pid, 'enveloppes'), String(numero)), {
    version: enveloppe.version, kdf: enveloppe.kdf, iterations: enveloppe.iterations, sel: enveloppe.sel, iv: enveloppe.iv, cle: enveloppe.cle,
    par: session.utilisateur.uid, date: serverTimestamp(),
  });
};

const champsEntree = (c) => ({ g: c.g, n: c.n, iv: c.iv, donnees: c.donnees });

export const coffre = {
  /** Écoute le coffre d'un projet. Rend la fonction qui coupe tout. */
  ecouter(pid, { meta, entrees, appareils, journal, erreur }) {
    const fin = [];
    const tant = (e) => { if (erreur) erreur(e); };
    fin.push(onSnapshot(refCoffre(pid), (d) => meta(d.exists() ? { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } : null), tant));
    fin.push(onSnapshot(colCoffre(pid, 'entrees'), (q) => entrees(q.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), tant));
    fin.push(onSnapshot(colCoffre(pid, 'appareils'), (q) => appareils(q.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), tant));
    fin.push(onSnapshot(query(colCoffre(pid, 'journal'), orderBy('date', 'desc'), limit(30)), (q) => journal(q.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), tant));
    return () => fin.splice(0).forEach((f) => { try { f(); } catch (e) { /* déjà coupée */ } });
  },

  nouvelId: (pid, sous = 'entrees') => doc(colCoffre(pid, sous)).id,

  /* Le prochain numéro d'enveloppe : les archives restent quand un coffre
     est effacé, un coffre recréé continue donc la numérotation. */
  async prochainNumero(pid) {
    const q = await getDocs(colCoffre(pid, 'enveloppes'));
    return q.docs.reduce((m, d) => Math.max(m, Number(d.id) || 0), 0) + 1;
  },

  /* La création ne peut pas écraser un coffre existant : la règle de mise
     à jour ne laisse changer que l'enveloppe, numéro suivant. */
  async creer(pid, session, enveloppe) {
    const numero = await coffre.prochainNumero(pid);
    const b = writeBatch(bdd);
    b.set(refCoffre(pid), { ...enveloppe, enveloppe: numero, porteurs: [marqueCoffre(session)], creePar: session.utilisateur.uid, cree: serverTimestamp(), maj: serverTimestamp(), phraseLe: serverTimestamp() });
    posePourEnveloppe(b, pid, session, enveloppe, numero);
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'creation'));
    await b.commit();
    return numero;
  },

  /* Nouvelle phrase ET nouvelle clé, en un seul lot : l'enveloppe neuve
     (archivée), toutes les entrées rechiffrées (g neuf, n + 1), les copies
     des appareils retirées, la ligne de journal. Après ce lot, l'ancienne
     clé ne déchiffre plus rien de ce qui est en base. Ce qu'une personne a
     lu avant, elle le garde : changer un mot de passe chez le service
     reste le seul remède à une fuite. */
  async renouveler(pid, session, { enveloppe, numero, entrees, appareilsIds }) {
    const ops = entrees.length + appareilsIds.length + 3;
    if (ops > LOT_MAX_COFFRE) throw new Error(`Trop d'éléments pour renouveler la clé d'un seul coup (${ops} écritures, ${LOT_MAX_COFFRE} au plus). Supprimez des accès ou des appareils, puis recommencez.`);
    const b = writeBatch(bdd);
    b.update(refCoffre(pid), { iterations: enveloppe.iterations, sel: enveloppe.sel, iv: enveloppe.iv, cle: enveloppe.cle, enveloppe: numero, porteurs: [marqueCoffre(session)], maj: serverTimestamp(), phraseLe: serverTimestamp() });
    posePourEnveloppe(b, pid, session, enveloppe, numero);
    entrees.forEach(({ id, chiffre }) => b.update(doc(colCoffre(pid, 'entrees'), id), { ...champsEntree(chiffre), maj: serverTimestamp() }));
    appareilsIds.forEach((id) => b.delete(doc(colCoffre(pid, 'appareils'), id)));
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'cle-renouvelee'));
    await b.commit();
  },

  /* Qui ouvre le coffre s'inscrit parmi ceux qui connaissent la clé. */
  porter: (pid, session) => updateDoc(refCoffre(pid), { porteurs: arrayUnion(marqueCoffre(session)) }),

  async ecrireEntree(pid, session, id, chiffre, nouvelle) {
    const b = writeBatch(bdd);
    const ref = doc(colCoffre(pid, 'entrees'), id);
    if (nouvelle) b.set(ref, { v: chiffre.v, ...champsEntree(chiffre), cree: serverTimestamp(), maj: serverTimestamp() });
    else b.update(ref, { ...champsEntree(chiffre), maj: serverTimestamp() });
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, nouvelle ? 'entree-ajoutee' : 'entree-modifiee'));
    await b.commit();
  },

  async supprimerEntree(pid, session, id) {
    const b = writeBatch(bdd);
    b.delete(doc(colCoffre(pid, 'entrees'), id));
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'entree-supprimee'));
    await b.commit();
  },

  async ajouterAppareil(pid, session, aid, fiche) {
    const b = writeBatch(bdd);
    b.set(doc(colCoffre(pid, 'appareils'), aid), { uid: session.utilisateur.uid, appareil: String(fiche.appareil || '').slice(0, 80), credId: fiche.credId, selPrf: fiche.selPrf, iv: fiche.iv, cle: fiche.cle, g: fiche.g, cree: serverTimestamp() });
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'appareil-ajoute', 'appareil'));
    await b.commit();
  },

  async retirerAppareil(pid, session, aid) {
    const b = writeBatch(bdd);
    b.delete(doc(colCoffre(pid, 'appareils'), aid));
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'appareil-retire'));
    await b.commit();
  },

  journaliser: (pid, session, action, moyen = '') => setDoc(doc(colCoffre(pid, 'journal')), ligneJournal(session, action, moyen)),

  /* La phrase perdue : on efface tout (l'équipe seule). Le journal et les
     enveloppes archivées restent. */
  async effacer(pid, session, entreesIds = [], appareilsIds = []) {
    const ops = [...entreesIds.map((id) => doc(colCoffre(pid, 'entrees'), id)), ...appareilsIds.map((id) => doc(colCoffre(pid, 'appareils'), id))];
    for (let i = 0; i < ops.length; i += LOT_MAX_COFFRE) {
      const b = writeBatch(bdd);
      ops.slice(i, i + LOT_MAX_COFFRE).forEach((r) => b.delete(r));
      await b.commit();
    }
    const b = writeBatch(bdd);
    b.delete(refCoffre(pid));
    b.set(doc(colCoffre(pid, 'journal')), ligneJournal(session, 'coffre-efface'));
    await b.commit();
  },
};
