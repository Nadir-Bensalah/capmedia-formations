/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée du cockpit d'équipe
   ========================================================================== */

import { exigerSession, $, OUVERTS, ATTEND_EQUIPE, FACTURES_DUES, ROLES_CLIENT, joursAvant, enDate, projetEstActif, bdd, collection, query, orderBy, limit, peut, estAdmin, echapper } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche, definirRetoucheAriane, filAriane, projetDeLAdresse, deplierArbre } from './coquille.js';
import { definir, demarrer, naviguer, courant, adresseAvec, surChangement } from './routeur.js';
import { titrePage, avatarProjet } from './ui.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, abonnerArbreEquipe, clesArbreEquipe, interneDuProjet, reunionAVenir, K, nonLusProjet, requeteMessages, messagesDuProjet } from './donnees.js';

import * as adminAccueil from './vues/admin-accueil.js';
import * as adminClients from './vues/admin-clients.js';
import * as adminProjets from './vues/admin-projets.js';
import * as projet from './vues/projet.js';
import * as notesProjet from './vues/notes-projet.js';
import * as evolutions from './vues/evolutions.js';
import * as demande from './vues/demande.js';
import { resoudreDemande } from './lien-profond.js';
import * as brique from './vues/brique.js';
import * as adminDemandes from './vues/admin-demandes.js';
import * as adminTaches from './vues/admin-taches.js';
import * as tests from './vues/tests.js';
import * as planTests from './vues/plan-tests.js';
import * as tableau from './vues/tableau.js';
import * as adminPlanning from './vues/admin-planning.js';
import * as messages from './vues/messages.js';
import * as adminValidations from './vues/admin-validations.js';
import * as adminFinances from './vues/admin-finances.js';
import * as documents from './vues/documents.js';
import * as maintenance from './vues/maintenance.js';
import * as adminActivite from './vues/admin-activite.js';
import * as adminEmails from './vues/admin-emails.js';
import * as adminArchives from './vues/admin-archives.js';
import * as adminAFaire from './vues/admin-a-faire.js';
import * as adminParametres from './vues/admin-parametres.js';
import * as adminEquipe from './vues/admin-equipe.js';
import * as testeursMessages from './vues/admin-testeurs-messages.js';
import * as nouveauProjet from './vues/nouveau-projet.js';
import * as parametres from './vues/parametres.js';
import * as annonces from './vues/annonces.js';
import * as stabilite from './vues/stabilite.js';
import * as controle from './vues/controle.js';

const session = await exigerSession();
if (!session) throw new Error('session absente');

if (!session.equipe) {
  location.replace(`./hub${location.hash || ''}`);
  throw new Error('redirection');
}

const env = { session, role: 'equipe', admin: estAdmin(session) };
const lotGlobal = magasin.lot();
abonnerGlobal(lotGlobal, session);

const { vue } = monterCoquille({ session, role: 'equipe', groupes: [], sortie: $('#racine') });

/* --- L'arbre des projets en cours (refonte du Cockpit, lot 3) -----------
   Comme dans le Hub : chaque projet en cours a son arbre dans le rail, et
   ses entrées sont les pages du projet. La page d'un projet n'a plus
   d'onglets horizontaux côté équipe. Seuls les projets EN COURS (ni
   archivés, ni « à faire », ni terminés), clients et internes, triés par
   dernière activité ; les autres passent par « Tous les projets » et ⌘K.
   Le projet ouvert y figure même s'il n'est pas en cours : sans lui, ses
   pages n'auraient plus de navigation. */
const projetOuvert = (route = courant()) => {
  const brut = projetDeLAdresse(route || {});
  if (!brut || brut === 'nouveau') return '';
  try { return decodeURIComponent(brut); } catch (e) { return brut; }
};

/* La dernière activité d'un projet : le dernier mouvement du fil (les
   200 derniers de tous les projets), le dernier message, sa fiche. */
const instant = (v) => { const d = enDate(v); return d ? d.getTime() : 0; };
const derniereActivite = (p, activite) => {
  let t = Math.max(instant(p.maj), instant(p.cree));
  for (const a of activite) if (a.projet === p.id) { t = Math.max(t, instant(a.date)); break; }
  const messages = magasin.lire(K.messages(p.id)) || [];
  for (const m of messages) t = Math.max(t, instant(m.date));
  return t;
};

const projetsDeLArbre = () => {
  const projets = magasin.lire(K.projets) || [];
  const activite = (magasin.lire(K.activiteToute) || []).slice().sort((a, b) => instant(b.date) - instant(a.date));
  const enCours = projets.filter(projetEstActif);
  const ouvert = projetOuvert();
  const enPlus = ouvert && !enCours.some((p) => p.id === ouvert) ? projets.filter((p) => p.id === ouvert) : [];
  const quand = new Map([...enCours, ...enPlus].map((p) => [p.id, derniereActivite(p, activite)]));
  const tries = enCours.slice().sort((a, b) => (quand.get(b.id) - quand.get(a.id)) || String(a.nom || '').localeCompare(String(b.nom || '')));
  return { projets, enCours, arbre: [...enPlus, ...tries] };
};

/* Les entrées d'un projet, dans l'ordre du client (02-03/10), puis les
   trois propres à l'équipe. Les chiffres viennent des collections de tous
   les projets que le Cockpit lit déjà (demandes, tâches, réunions,
   fichiers, tests, finances, maintenance), et de sept clés par projet de
   l'arbre (abonnerArbreEquipe). Le gris dit combien il y en a ; le rouge,
   ce qui attend l'équipe. Les mots restent ceux de l'équipe jusqu'au lot 4
   (question 2 : les mots du client pour ce qui est partagé). */
const entreesProjetEquipe = (p, t) => {
  const pid = p.id;
  const base = `/projets/${pid}`;
  const de = (liste) => liste.filter((x) => x.projet === pid);
  const tickets = de(t.tickets);
  const taches = de(t.taches).filter((x) => x.statut !== 'terminee');
  const reunions = de(t.reunions).filter(reunionAVenir);
  const fichiers = de(t.fichiers);
  const anomalies = de(t.anomalies).filter((a) => !['corrigee', 'sans-suite'].includes(a.statut));
  const campagnes = de(t.campagnes).filter((c) => c.statut === 'en-cours').length;
  const scenarios = de(t.scenarios).filter((x) => x.actif !== false).length;
  const dues = de(t.documents).filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut)).length;
  const forfaitDemande = de(t.maintenance).some((x) => x.id === 'contrat' && x.statut === 'demande');
  const lireP = (cle) => magasin.lire(cle(pid)) || [];
  /* D10 : Notes compte ce qui attend une décision, pas les refusées ni les
     notes internes ; Tests compte les anomalies ouvertes, sans attendre
     qu'on ait ouvert la page. */
  const aValider = lireP(K.notes).filter((n) => n.etat === 'a-valider').length;
  const liens = lireP(K.liens).length;
  const axes = lireP(K.axes).filter(evolutions.estPublie).length;
  const parties = lireP(K.composants).length;
  const liaison = magasin.lire(K.sentryLiaison(pid));
  const coffre = Boolean(magasin.lire(K.coffre(pid)));
  const arbitrer = p.interne ? 0
    : lireP(K.interlocuteurs).filter((i) => i.statut === 'actif' && !ROLES_CLIENT[i.role]).length + (interneDuProjet(pid).arbitragesAcces || []).length;
  const tests = scenarios || campagnes || anomalies.length || de(t.campagnes).length;
  return [
    { chemin: base, libelle: 'Aperçu', icone: 'accueil', exact: true, projet: pid },
    { chemin: `${base}/demandes`, libelle: 'Demandes', icone: 'demandes', projet: pid, aussi: [`${base}/nouvelle-demande`], compte: { total: tickets.filter((x) => OUVERTS.includes(x.statut)).length, neuf: tickets.filter((x) => ATTEND_EQUIPE.includes(x.statut)).length } },
    /* Un projet interne n'a pas de client : pas de conversation. */
    ...(!p.interne ? [{ chemin: `/messages/${pid}`, libelle: 'Messages', icone: 'messages', projet: pid, compte: { total: 0, neuf: t.nonLus(p) } }] : []),
    { chemin: `${base}/etapes`, libelle: 'Feuille de route', icone: 'route', projet: pid },
    { chemin: `${base}/notes`, libelle: 'Notes', icone: 'note', projet: pid, compte: { total: aValider } },
    { chemin: `${base}/taches`, libelle: 'Tâches', icone: 'taches', projet: pid, compte: { total: taches.length, neuf: taches.filter((x) => x.echeance && joursAvant(x.echeance) < 0).length } },
    { chemin: '/calendrier', lien: `/calendrier?projet=${encodeURIComponent(pid)}`, libelle: 'Calendrier', icone: 'calendrier', projet: pid, compte: { total: reunions.length } },
    /* La console du projet ; un projet sans aucun test garde sa page
       vide, d'où l'on écrit le premier scénario. Animée pendant une
       campagne, comme l'entrée Tests de tous les projets. */
    tests
      ? { chemin: '/tests', lien: `/tests?projet=${encodeURIComponent(pid)}`, libelle: 'Tests', icone: 'bug', projet: pid, compte: { total: 0, neuf: anomalies.length }, enCours: campagnes ? (campagnes > 1 ? `${campagnes} campagnes de tests en cours` : 'campagne de tests en cours') : '' }
      : { chemin: `${base}/tests`, libelle: 'Tests', icone: 'bug', projet: pid },
    { chemin: `${base}/marketing`, libelle: 'Marketing', icone: 'trend', projet: pid, marque: { texte: 'À venir' } },
    { chemin: `${base}/coffre`, libelle: 'Coffre-fort', icone: 'cadenas', projet: pid, marque: coffre ? { texte: 'Chiffré', icone: 'cadenas', ton: 'vert', titre: 'Chiffré de bout en bout : Capmedia ne lit pas son contenu' } : null },
    { chemin: '/fichiers', lien: `/fichiers?projet=${encodeURIComponent(pid)}`, libelle: 'Fichiers', icone: 'fichiers', projet: pid, compte: { total: fichiers.length } },
    { chemin: `${base}/liens`, libelle: 'Ressources', icone: 'liens', projet: pid, compte: { total: liens } },
    { chemin: `${base}/evolutions`, libelle: 'Axes d\'évolution', icone: 'ampoule', projet: pid, compte: { total: axes } },
    ...(t.finance ? [{ chemin: '/finances', lien: `/finances?projet=${encodeURIComponent(pid)}`, libelle: 'Devis et factures', icone: 'finances', projet: pid, compte: { total: 0, neuf: dues } }] : []),
    { chemin: '/maintenance', lien: `/maintenance?projet=${encodeURIComponent(pid)}`, libelle: 'Maintenance', icone: 'sante', projet: pid, compte: { total: 0, neuf: forfaitDemande ? 1 : 0 } },
    /* Stabilité et Salle de contrôle, en une entrée : la page Stabilité,
       d'où la Salle de contrôle s'ouvre en plein écran. */
    ...(liaison && liaison.actif !== false ? [{ chemin: `${base}/stabilite`, libelle: 'Santé de l\'app', icone: 'activite', projet: pid, aussi: [`${base}/controle`] }] : []),
    /* Les parties et toutes les versions ; chaque partie mène à sa page. */
    { chemin: `${base}/composants`, libelle: 'Plateformes et versions', icone: 'composants', projet: pid, aussi: [`${base}/brique`, `${base}/releases`], compte: { total: parties } },
    ...(!p.interne ? [{ chemin: `${base}/acces`, libelle: 'Accès client', icone: 'utilisateurs', projet: pid, compte: p.ouvert === true ? { total: 0, neuf: arbitrer } : null, marque: p.ouvert === true ? null : { texte: 'fermé' } }] : []),
  ];
};

const construireNavigation = () => {
  const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
  const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
  const validations = magasin.lire(K.validationsToutes) || [];
  /* Les pièces archivées ne comptent nulle part ailleurs : la barre les
     comptait, et annonçait donc un nombre que la page ne montrait pas. */
  const documents = (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive);
  const demandesProjet = magasin.lire(K.demandesProjet) || [];
  const nouvelles = tickets.filter((t) => t.statut === 'nouveau').length;
  const enRetard = taches.filter((t) => t.statut !== 'terminee' && t.echeance && joursAvant(t.echeance) < 0).length;
  const attendues = validations.filter((v) => v.statut === 'en-attente').length;
  /* Les mêmes six statuts que la page « Nouveaux projets » : la barre en
     comptait quatre, et deux demandes vivantes n'étaient annoncées nulle part. */
  const preprojets = demandesProjet.filter((d) => ['nouvelle', 'discussion', 'qualification', 'estimation', 'devis', 'acceptee'].includes(d.statut)).length;

  /* Les totaux, en gris : combien il y en a. Les pastilles rouges : combien
     attendent une action de notre côté. */
  const { projets, arbre } = projetsDeLArbre();
  const organisations = magasin.lire(K.organisations) || [];
  const reunions = (magasin.lire(K.reunionsToutes) || []).filter((r) => joursAvant(r.date) >= 0);
  const fichiers = magasin.lire(K.fichiersTous) || [];
  const profil = magasin.lire(K.profil);
  const uid = session.utilisateur.uid;
  const nonLusDe = (p) => (p.interne ? 0 : nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid));
  const nonLus = projets.reduce((n, p) => n + nonLusDe(p), 0);
  /* Les testeurs qui ont écrit, et ce qui attend une réponse. */
  const conversationsTesteurs = magasin.lire(K.conversationsTesteurs) || [];
  const nonLusTesteurs = conversationsTesteurs.reduce((n, c) => n + Number(c.nonLusEquipe || 0), 0);
  const ouvertes = tickets.filter((t) => OUVERTS.includes(t.statut)).length;
  const aFaire = taches.filter((t) => t.statut !== 'terminee').length;
  const nouveauxPreprojets = demandesProjet.filter((d) => d.statut === 'nouvelle').length;
  const piecesDues = documents.filter((d) => FACTURES_DUES.includes(d.statut) || d.statut === 'envoye').length;

  /* La console de tests annonce ce qui tourne et ce qui bloque : une
     campagne en cours, et une anomalie qu'on n'a pas encore refermée. */
  const campagnes = magasin.lire(K.campagnesToutes) || [];
  const anomalies = magasin.lire(K.anomaliesToutes) || [];
  const campagnesEnCours = campagnes.filter((c) => c.statut === 'en-cours').length;
  const anomaliesOuvertes = anomalies.filter((a) => !['corrigee', 'sans-suite'].includes(a.statut)).length;
  /* La maintenance : les forfaits qui tournent, et les demandes qui
     attendent une proposition. */
  const maintenanceToute = magasin.lire(K.maintenanceToute) || [];
  const contrats = maintenanceToute.filter((x) => x.id === 'contrat');
  const forfaitsActifs = contrats.filter((x) => x.statut === 'actif').length;
  const forfaitsDemandes = contrats.filter((x) => x.statut === 'demande').length;

  /* Ce que l'arbre compte, projet par projet. Une partie de la maintenance
     ou d'une campagne n'a pas son projet dans le document : le magasin le
     pose dans « _parent » quand la collection est lue en groupe. */
  const avecProjet = (liste) => liste.map((x) => (x.projet ? x : { ...x, projet: x._parent || x.projet }));
  const tout = {
    tickets, taches, reunions: magasin.lire(K.reunionsToutes) || [], fichiers: fichiers.filter((f) => !f.archive), documents,
    campagnes: avecProjet(campagnes), anomalies: avecProjet(anomalies), scenarios: avecProjet(magasin.lire(K.scenariosTous) || []),
    maintenance: avecProjet(maintenanceToute), finance: peut(session, 'finance.lecture'), nonLus: nonLusDe,
  };

  /* Ce que le rôle ne permet pas n'apparaît pas : un agent n'administre ni
     les clients, ni la finance, ni l'équipe. Le serveur et les règles
     refusent de toute façon ; l'écran ne propose pas l'impossible. */
  const admin = estAdmin(session);
  const garder = (groupe) => ({ ...groupe, items: groupe.items.filter((i) => i.si === undefined || i.si) });
  const seul = arbre.filter(projetEstActif).length === 1;
  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Travail',
      items: [
        { chemin: '/demandes', libelle: 'Demandes', icone: 'inbox', compte: { total: ouvertes, neuf: nouvelles } },
        { chemin: '/taches', libelle: 'Tâches', icone: 'taches', compte: { total: aFaire, neuf: enRetard } },
        /* Une campagne qui tourne anime l'entrée, comme chez le client. */
        { chemin: '/tests', libelle: 'Tests', icone: 'bug', compte: { total: campagnesEnCours, neuf: anomaliesOuvertes }, enCours: campagnesEnCours ? (campagnesEnCours > 1 ? `${campagnesEnCours} campagnes de tests en cours` : 'campagne de tests en cours') : '' },
        /* L'agenda de tous les projets s'appelle « Calendrier », comme chez
           le client (#/calendrier) ; l'ancienne adresse #/planning y mène. */
        { chemin: '/calendrier', libelle: 'Calendrier', icone: 'calendrier', compte: { total: reunions.length } },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages', compte: { total: projets.filter((p) => !p.archive && !p.interne).length, neuf: nonLus } },
        { chemin: '/testeurs-messages', libelle: 'Testeurs', icone: 'smartphone', compte: { total: conversationsTesteurs.length, neuf: nonLusTesteurs }, si: peut(session, 'qa.gerer') },
        { chemin: '/validations', libelle: 'Validations', icone: 'valider', compte: { total: attendues } },
        /* « Fichiers », comme chez le client (#/fichiers) ; l'ancienne
           adresse #/documents y mène. */
        { chemin: '/fichiers', libelle: 'Fichiers', icone: 'documents', compte: { total: fichiers.length } },
      ],
    },
    {
      titre: 'Projets en cours',
      /* Chaque projet, son écusson et son arbre. Seul le projet ouvert est
         déplié (et le projet seul, s'il n'y en a qu'un) ; replié, il porte
         ce qui attend l'équipe : les demandes chez nous et les messages non
         lus. « Tous les projets » ferme la liste. */
      items: [
        ...arbre.map((p) => {
          const enfants = entreesProjetEquipe(p, tout);
          const chezNous = tickets.filter((x) => x.projet === p.id && ATTEND_EQUIPE.includes(x.statut)).length;
          return {
            chemin: `/projets/${p.id}`, libelle: p.nom, ecusson: avatarProjet(p, 'mini'),
            arbre: p.id, deplieParDefaut: seul && projetEstActif(p),
            compteReplie: { total: 0, neuf: chezNous + nonLusDe(p) },
            enfants,
          };
        }),
        { chemin: '/projets', libelle: 'Tous les projets', icone: 'projets', compte: { total: projets.filter((p) => !p.archive && !p.aFaire).length } },
      ],
    },
    {
      titre: 'Portefeuille',
      items: [
        { chemin: '/clients', libelle: 'Clients', icone: 'entreprise', compte: { total: organisations.length }, si: peut(session, 'clients.gerer') },
        /* Les idées et les projets mis de côté : rangés à part, jamais comptés
           dans le portefeuille en cours. */
        { chemin: '/a-faire', libelle: 'Projets à faire', icone: 'ampoule', compte: { total: projets.filter((p) => p.aFaire && !p.archive).length }, si: admin },
        { chemin: '/nouveaux-projets', libelle: 'Nouveaux projets', icone: 'sparkle', compte: { total: preprojets, neuf: nouveauxPreprojets }, si: admin },
      ],
    },
    {
      titre: 'Gestion',
      items: [
        /* Le libellé ne tenait pas dans la barre : le titre de la page dit
           « Finances », la barre disait autre chose et se faisait couper. */
        { chemin: '/finances', libelle: 'Finances', icone: 'finances', compte: { total: piecesDues, neuf: piecesDues }, si: peut(session, 'finance.lecture') },
        { chemin: '/maintenance', libelle: 'Maintenance', icone: 'sante', compte: { total: forfaitsActifs, neuf: forfaitsDemandes } },
        { chemin: '/activite', libelle: 'Activité', icone: 'activite' },
        /* Les lettres parties vers les clients (et l'équipe, les testeurs) :
           l'administrateur seul, comme l'action qui les lit. */
        { chemin: '/emails', libelle: 'E-mails envoyés', icone: 'mail', si: peut(session, 'systeme') },
        /* La santé en direct des applications reliées à Sentry : l'administrateur
           y entre d'ici ; un agent, par la page du projet. */
        { chemin: '/controle', libelle: 'Salle de contrôle', icone: 'sante', si: admin },
        /* Ce que Capmedia annonce à ses clients, congés compris : le
           total gris compte les publiées. */
        { chemin: '/annonces', libelle: 'Annonces', icone: 'porteVoix', compte: { total: (magasin.lire(K.annonces) || []).filter((a) => a.publication === 'publiee').length }, si: admin || peut(session, 'finance.gerer') },
        { chemin: '/archives', libelle: 'Archives', icone: 'archive', si: admin },
      ],
    },
    {
      /* Épinglé en bas du rail, comme dans le Hub : la liste défile,
         l'équipe et les paramètres restent en vue. */
      pied: true,
      items: [
        { chemin: '/equipe', libelle: 'Équipe', icone: 'utilisateurs' },
        { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' },
      ],
    },
  ].map(garder).filter((g) => g.items.length));
};

/* Le cockpit écoute aussi la conversation de chaque projet ouvert : sans
   cela, la pastille des messages non lus resterait muette. */
const conversationsSuivies = new Set();
let dessinerNav = () => {};
const suivreConversations = () => {
  for (const p of (magasin.lire(K.projets) || [])) {
    /* Un projet à moi n'a pas de client, donc pas de conversation : l'écouter
       coûterait cinquante abonnements pour une pastille toujours vide. */
    if (p.archive || p.interne || conversationsSuivies.has(p.id)) continue;
    conversationsSuivies.add(p.id);
    /* La MÊME requête que « abonnerProjet » : le magasin partage une écoute
       par clé, et la première posée gagne. Le cockpit posait ici une requête
       décroissante bornée à 40, que la bulle de conversation réutilisait
       ensuite : elle montrait donc au plus quarante messages, à l'envers,
       et l'accusé « Lu » se calculait sur le plus ancien des quarante. */
    lotGlobal.abonner(K.messages(p.id), () => requeteMessages(p.id));
    lotGlobal.sur(K.messages(p.id), dessinerNav);
  }
};

/* Les sept clés de l'arbre, pour les projets de l'arbre seulement (en
   cours, et le projet ouvert). Posées AVANT le dessin : il les attend. */
const arbresSuivis = new Map();
const suivreArbres = () => {
  for (const p of projetsDeLArbre().arbre) {
    if (arbresSuivis.has(p.id)) continue;
    const interne = Boolean(p.interne);
    arbresSuivis.set(p.id, interne);
    abonnerArbreEquipe(lotGlobal, p.id, { interne });
    clesArbreEquipe(p.id, { interne }).forEach((cle) => lotGlobal.sur(cle, dessinerNav));
  }
};

/* Le rail se dessine une fois, tout arrivé (magasin.dessinateur, comme le
   Hub) : avant, un squelette de la même hauteur tient la place des
   entrées. Une minuterie redessinait le rail à chaque clé qui arrivait :
   les chiffres poussaient un à un. Les conversations et les arbres suivis
   sont posés AVANT le dessin : leurs clés font partie de ce qu'il attend. */
/* Les pièces (documents:*) ne sont attendues que par qui lit la finance :
   pour un agent sans finance.lecture, la clé assemblée de ses projets ne
   se remplit jamais (abonnerProjet ne les lui demande pas), et le rail
   attendait sa patience entière (4 s) avant de se dessiner. */
const CLES_NAVIGATION = [K.ticketsTous, K.tachesToutes, K.validationsToutes, ...(peut(session, 'finance.lecture') ? [K.documentsTous] : []), K.demandesProjet, K.projets, K.organisations, K.reunionsToutes, K.fichiersTous, K.profil, K.maintenanceToute, K.campagnesToutes, K.anomaliesToutes, K.scenariosTous, K.activiteToute, K.projetsInternes, K.conversationsTesteurs, K.annonces];
const clesNavigation = () => [...CLES_NAVIGATION,
  ...[...conversationsSuivies].map((pid) => K.messages(pid)),
  ...[...arbresSuivis].flatMap(([pid, interne]) => clesArbreEquipe(pid, { interne }))];
dessinerNav = magasin.dessinateur(construireNavigation, 80, clesNavigation, 4000);
magasin.sur(K.projets, suivreConversations);
magasin.sur(K.projets, suivreArbres);
CLES_NAVIGATION.forEach((cle) => magasin.sur(cle, dessinerNav));
/* Le squelette : les mêmes groupes, autant de lignes que d'entrées que le
   rôle verra (elles ne dépendent que des permissions). Les projets en
   cours : ceux d'un agent sont connus d'avance, pas ceux de l'administrateur. */
const squeletteNavigation = () => {
  const admin = estAdmin(session);
  const n = (...conditions) => conditions.filter(Boolean).length;
  const projetsAgent = admin ? 0 : ((session.equipe && session.equipe.projets) || []).length;
  return [
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    { titre: 'Travail', squelette: { projets: n(true, true, true, true, true, peut(session, 'qa.gerer'), true, true) } },
    { titre: 'Projets en cours', squelette: { projets: (admin ? 4 : Math.max(1, projetsAgent)) + 1 } },
    ...(n(peut(session, 'clients.gerer'), admin, admin) ? [{ titre: 'Portefeuille', squelette: { projets: n(peut(session, 'clients.gerer'), admin, admin) } }] : []),
    { titre: 'Gestion', squelette: { projets: n(peut(session, 'finance.lecture'), true, true, peut(session, 'systeme'), admin, admin || peut(session, 'finance.gerer'), admin) } },
    { pied: true, items: [{ chemin: '/equipe', libelle: 'Équipe', icone: 'utilisateurs' }, { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' }] },
  ];
};
definirNavigation(squeletteNavigation());
dessinerNav();

/* Entrer dans un projet déplie son arbre, et replie celui d'où l'on vient :
   seul le projet ouvert est déplié. Le choix, au clic sur un chevron, se
   retient (coquille.js) ; passer d'une page à l'autre du même projet n'y
   touche pas. Le projet ouvert hors des projets en cours entre dans
   l'arbre le temps de sa visite : le rail se redessine à l'adresse. */
let dernierProjet = '';
surChangement((route) => {
  const pid = projetOuvert(route);
  if (pid && pid !== dernierProjet) {
    if (dernierProjet) deplierArbre(dernierProjet, false);
    deplierArbre(pid, true);
    dernierProjet = pid;
  }
  if (pid && !arbresSuivis.has(pid) && magasin.lire(K.projets)) suivreArbres();
  dessinerNav();
});

/* Le fil d'Ariane de l'équipe part toujours de l'accueil, et passe par
   « Projets » puis le projet quand la page est celle d'un projet :
   « Accueil › Projets › Atelier › Tâches ». Le Retour s'appuie dessus
   quand on arrive par un lien. Depuis l'arbre (lot 3), les pages filtrées
   sur un projet (« ?projet= ») et ses messages sont des pages du projet :
   « Accueil › Projets › Atelier › Fichiers ». La page d'une partie passe
   par « Plateformes et versions ». */
let filBrut = null;
let filChemin = '';
let filPoses = 0;
definirRetoucheAriane((items) => {
  if (!items || !items.length) return items;
  filBrut = items; filChemin = courant().chemin; filPoses += 1;
  if (items.length === 1 && !items[0].chemin && items[0].libelle === 'Accueil') return items;
  let fil = items.filter((it) => it.chemin !== '/');
  const route = courant();
  const pid = projetOuvert(route);
  if (pid) {
    const chemin = `/projets/${pid}`;
    if (!fil.some((it) => it.chemin === chemin)) {
      const projet = (magasin.lire(K.projets) || []).find((p) => p.id === pid);
      if (projet) fil.splice(fil.findIndex((it) => it.chemin === '/projets') + 1, 0, { libelle: projet.nom, chemin });
    }
    if (fil.some((it) => it.chemin === chemin) && !fil.some((it) => it.chemin === '/projets')) {
      fil.splice(fil.findIndex((it) => it.chemin === chemin), 0, { libelle: 'Projets', chemin: '/projets' });
    }
    const parties = `${chemin}/composants`;
    if (/^\/projets\/[^/]+\/brique\//.test(route.chemin || '') && fil.some((it) => it.chemin === chemin) && !fil.some((it) => it.chemin === parties)) {
      fil.splice(fil.findIndex((it) => it.chemin === chemin) + 1, 0, { libelle: 'Plateformes et versions', chemin: parties });
    }
  }
  fil = [{ libelle: 'Accueil', chemin: '/' }, ...fil];
  return fil;
});
/* Une page filtrée change de projet en place (sa clé de route) sans
   redire son fil : on le repose, avec le nouveau projet, si la page ne
   l'a pas fait elle-même. De même quand la liste des projets arrive après
   le premier fil (adresse ouverte à froid). */
const reposerFil = () => {
  const avant = filPoses;
  queueMicrotask(() => { if (filBrut && filPoses === avant && courant().chemin === filChemin) filAriane(filBrut); });
};
surChangement((route) => { if (route.chemin === filChemin) reposerFil(); });
magasin.sur(K.projets, reposerFil);

enregistrerRecherche((terme) => {
  const projets = magasin.lire(K.projets) || [];
  /* Une table plutôt qu'une recherche linéaire par élément : à cinquante
     projets et quelques milliers d'items, la frappe devenait saccadée. */
  const nomsProjets = new Map(projets.map((p) => [p.id, p.nom]));
  const nomProjet = (pid) => nomsProjets.get(pid) || '';
  const items = [];
  if (!terme) {
    if (peut(session, 'projets.creer')) items.push({ groupe: 'Créer', libelle: 'Nouveau projet', icone: 'plus', chemin: '/projets/nouveau' });
    if (peut(session, 'clients.gerer')) items.push({ groupe: 'Créer', libelle: 'Nouveau client', icone: 'entreprise', chemin: '/clients/nouveau' });
    if (estAdmin(session)) items.push({ groupe: 'Créer', libelle: 'Noter une idée', icone: 'ampoule', chemin: '/a-faire?noter=1' });
    items.push({ groupe: 'Aller à', libelle: 'Demandes à traiter', icone: 'inbox', chemin: '/demandes' });
    items.push({ groupe: 'Aller à', libelle: 'Validations attendues', icone: 'valider', chemin: '/validations' });
  }
  (magasin.lire(K.organisations) || []).forEach((o) => items.push({ groupe: 'Clients', libelle: o.nom, sous: o.entreprise, icone: 'entreprise', chemin: `/clients/${o.id}` }));
  projets.forEach((p) => items.push(p.aFaire && !p.archive
    ? { groupe: 'Projets à faire', libelle: p.nom, sous: p.description || p.ref, icone: 'ampoule', chemin: `/a-faire/${p.id}` }
    : { groupe: 'Projets', libelle: p.nom, sous: p.ref, icone: 'projets', chemin: `/projets/${p.id}` }));
  (magasin.lire(K.ticketsTous) || []).forEach((t) => items.push({ groupe: 'Demandes', libelle: t.titre, sous: `${t.numero || ''} ${nomProjet(t.projet)}`.trim(), icone: 'demandes', chemin: `/projets/${t.projet}/demandes/${t.id}` }));
  (magasin.lire(K.tachesToutes) || []).forEach((t) => items.push({ groupe: 'Tâches', libelle: t.titre, sous: nomProjet(t.projet), icone: 'taches', chemin: `/projets/${t.projet}/taches/${t.id}` }));
  (magasin.lire(K.documentsTous) || []).forEach((d) => items.push({ groupe: 'Devis et factures', libelle: `${d.numero || ''} ${d.libelle || ''}`.trim(), sous: nomProjet(d.projet), icone: 'receipt', chemin: `/finances/${d.id}` }));
  /* Un fichier s'éclaire dans les Fichiers de son projet ; une réunion
     ouvre sa fiche dans le Calendrier de son projet. */
  (magasin.lire(K.fichiersTous) || []).forEach((f) => items.push({ groupe: 'Fichiers', libelle: f.nom, sous: nomProjet(f.projet), icone: 'fichiers', chemin: `/fichiers?projet=${encodeURIComponent(f.projet)}&f=${encodeURIComponent(f.id)}` }));
  (magasin.lire(K.reunionsToutes) || []).forEach((r) => items.push({ groupe: 'Réunions', libelle: r.titre, sous: nomProjet(r.projet), icone: 'reunions', chemin: `/calendrier?projet=${encodeURIComponent(r.projet)}&reunion=${encodeURIComponent(r.id)}` }));
  return items;
});

/* Une page que le rôle ne permet pas : la même règle que son entrée dans
   le rail, et un écran qui le dit, sans rien lire. Le serveur et les
   règles refusent de toute façon ; l'écran ne montre pas un vide
   trompeur. Les permissions fines d'un agent comptent (peut), pas
   seulement le rôle. */
const REGLES = {
  clients: { ok: () => peut(session, 'clients.gerer'), titre: 'Clients', a: 'aux personnes qui gèrent les fiches clients' },
  aFaire: { ok: () => estAdmin(session), titre: 'Projets à faire', a: 'à l\'administration' },
  nouveauxProjets: { ok: () => estAdmin(session), titre: 'Nouveaux projets', a: 'à l\'administration' },
  finances: { ok: () => peut(session, 'finance.lecture'), titre: 'Finances', a: 'aux personnes qui suivent la finance' },
  archives: { ok: () => estAdmin(session), titre: 'Archives', a: 'à l\'administration' },
  testeurs: { ok: () => peut(session, 'qa.gerer'), titre: 'Testeurs', a: 'aux personnes qui pilotent la recette' },
  annonces: { ok: () => estAdmin(session) || peut(session, 'finance.gerer'), titre: 'Annonces', a: 'à l\'administration et aux personnes qui gèrent la finance' },
};
const garde = (regle, vue) => (ctx) => {
  const r = REGLES[regle];
  if (r.ok()) return vue(ctx);
  titrePage(r.titre);
  filAriane([{ libelle: r.titre }]);
  ctx.sortie.innerHTML = `<div class="page" style="max-width:720px"><div class="page-tete"><div><h1>${echapper(r.titre)}</h1><p class="chapo" data-refus="${echapper(regle)}">Cette page est réservée ${echapper(r.a)}.</p></div></div><a class="btn btn-secondaire" href="#/">Retour à l'accueil</a></div>`;
  return () => {};
};

/* Une route qui ne fait que mener ailleurs, en remplaçant l'adresse dans
   l'historique (adresseAvec omet les paramètres vides). */
const adresse = adresseAvec;
const rediriger = (vers) => (ctx) => { naviguer(vers({ ...ctx, requete: ctx.requete || {} }), { remplacer: true }); };

definir([
  { chemin: '/', vue: (ctx) => adminAccueil.vue(ctx, env) },
  { chemin: '/clients', vue: garde('clients', (ctx) => adminClients.liste(ctx, env)) },
  { chemin: '/clients/nouveau', vue: garde('clients', (ctx) => adminClients.nouveau(ctx, env)) },
  { chemin: '/clients/:id', vue: garde('clients', (ctx) => adminClients.detail(ctx, env)) },
  { chemin: '/projets', vue: (ctx) => adminProjets.liste(ctx, env) },
  { chemin: '/projets/nouveau', vue: (ctx) => adminProjets.nouveau(ctx, env) },
  { chemin: '/a-faire', vue: garde('aFaire', (ctx) => adminAFaire.liste(ctx, env)) },
  { chemin: '/a-faire/:id', vue: garde('aFaire', (ctx) => adminAFaire.detail(ctx, env)) },
  { chemin: '/projets/:id', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  /* Le lien d'un e-mail ou d'une notification de demande : le même que
     dans le hub, résolu dans le cockpit. */
  { chemin: '/demande/:tid', vue: (ctx) => resoudreDemande(ctx) },
  { chemin: '/projets/:id/taches/:tid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  /* Les réunions d'un projet vivent dans son Calendrier : la fiche d'une
     réunion s'y ouvre par-dessus (lettres, notifications, liens anciens). */
  { chemin: '/projets/:id/reunions/:rid', vue: rediriger((c) => adresse('/calendrier', { projet: c.params.id, reunion: c.params.rid })) },
  { chemin: '/projets/:id/releases/:rid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'releases' }, env) },
  { chemin: '/projets/:id/brique/:cid', vue: (ctx) => brique.vue(ctx, env) },
  { chemin: '/projets/:id/notes', vue: (ctx) => notesProjet.vue(ctx, env) },
  /* Une clé : le filtre de plateforme (dans l'adresse) redessine en place. */
  { chemin: '/projets/:id/evolutions', cle: (c) => `axes:${c.params.id}`, vue: (ctx) => evolutions.vue(ctx, env) },
  /* Ce que Sentry voit de l'application (vues/stabilite.js). */
  { chemin: '/projets/:id/stabilite', vue: (ctx) => stabilite.vue(ctx, env) },
  /* La salle de contrôle : la santé en direct, plein écran possible (vues/controle.js). */
  { chemin: '/projets/:id/controle', vue: (ctx) => controle.vue(ctx, env) },
  { chemin: '/controle', vue: (ctx) => controle.entree(ctx, env) },
  { chemin: '/projets/:id/suggestions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/evolutions`, { remplacer: true }); } },
  /* Les adresses du Hub qu'un membre de l'équipe peut ouvrir (un lien du
     client, une lettre, le Hub qui renvoie au Cockpit en gardant la
     route) : leur place dans le Cockpit, au lieu de l'accueil. */
  { chemin: '/projets/:id/versions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/composants`, { remplacer: true }); } },
  { chemin: '/projets/:id/decisions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/notes`, { remplacer: true }); } },
  /* Trois onglets du projet ont rejoint la page de tous les projets,
     filtrée sur lui : les fichiers, les réunions, l'activité. Les adresses
     déjà parties (lettres, cloche, activité rangée en base) y mènent. */
  { chemin: '/projets/:id/fichiers', vue: rediriger((c) => adresse('/fichiers', { projet: c.params.id, f: c.requete.f })) },
  { chemin: '/projets/:id/reunions', vue: rediriger((c) => adresse('/calendrier', { projet: c.params.id })) },
  { chemin: '/projets/:id/activite', vue: rediriger((c) => adresse('/activite', { projet: c.params.id })) },
  /* Lot 3 : les versions vivent avec les parties, dans « Plateformes et
     versions » ; la fiche d'une version garde son adresse (releases/:rid,
     plus haut). L'onglet Tests mène à la console du projet (projet.js le
     fait, une fois les données là : un projet sans aucun test garde sa
     page vide, d'où l'on écrit le premier scénario). */
  { chemin: '/projets/:id/releases', vue: rediriger((c) => `/projets/${encodeURIComponent(c.params.id)}/composants`) },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/nouveaux-projets', vue: garde('nouveauxProjets', (ctx) => nouveauProjet.liste(ctx, env)) },
  { chemin: '/nouveaux-projets/:id', vue: garde('nouveauxProjets', (ctx) => nouveauProjet.detail(ctx, env)) },
  /* Les filtres vivent dans l'adresse ; la clé fait qu'en changer
     redessine la liste en place, sans squelette ni retour en haut. */
  { chemin: '/demandes', cle: () => 'demandes', vue: (ctx) => adminDemandes.vue(ctx, env) },
  { chemin: '/taches', cle: () => 'taches', vue: (ctx) => adminTaches.vue(ctx, env) },
  { chemin: '/tests', cle: () => 'tests', vue: (ctx) => tests.vue(ctx, env) },
  /* Ce qui va être testé : le plan de tests d'un projet, section par
     section. La même page des deux côtés ; l'équipe y corrige. */
  { chemin: '/tests/plan', cle: () => 'plan-tests', vue: (ctx) => planTests.vue(ctx, env) },
  /* Le tableau vit dans Tests : ses anciennes adresses y mènent. */
  { chemin: '/tests/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  /* Le calendrier de tous les projets, filtrable par projet (l'entrée
     Calendrier d'un projet) ; l'ancienne adresse #/planning y mène. */
  { chemin: '/calendrier', cle: () => 'calendrier', vue: (ctx) => adminPlanning.vue(ctx, env) },
  { chemin: '/planning', vue: rediriger((c) => adresse('/calendrier', c.requete)) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/testeurs-messages', vue: garde('testeurs', (ctx) => testeursMessages.vue(ctx, env)) },
  { chemin: '/testeurs-messages/:uid', vue: garde('testeurs', (ctx) => testeursMessages.vue(ctx, env)) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  /* La fiche d'une validation par son adresse : la même vue, en place. */
  { chemin: '/validations', cle: () => 'validations', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/validations/:vid', cle: () => 'validations', vue: (ctx) => adminValidations.vue(ctx, env) },
  /* L'adresse d'une validation dans le Hub (« En attente du client », les
     liens du client) : la même fiche dans le Cockpit. */
  { chemin: '/valider', vue: () => { naviguer('/validations', { remplacer: true }); } },
  { chemin: '/valider/:vid', vue: (ctx) => { naviguer(`/validations/${encodeURIComponent(ctx.params.vid)}`, { remplacer: true }); } },
  /* Les fichiers de tous les projets, filtrables par projet (l'entrée
     Fichiers d'un projet) ; l'ancienne adresse #/documents y mène. */
  { chemin: '/fichiers', cle: () => 'fichiers', vue: (ctx) => documents.vue(ctx, env) },
  { chemin: '/documents', vue: rediriger((c) => adresse('/fichiers', c.requete)) },
  { chemin: '/finances', cle: () => 'finances', vue: garde('finances', (ctx) => adminFinances.vue(ctx, env)) },
  { chemin: '/finances/:did', cle: () => 'finances', vue: garde('finances', (ctx) => adminFinances.vue(ctx, env)) },
  { chemin: '/maintenance', vue: (ctx) => maintenance.vue(ctx, env) },
  { chemin: '/activite', cle: () => 'activite', vue: (ctx) => adminActivite.vue(ctx, env) },
  /* Une clé : changer un filtre (dans l'adresse) recharge la liste sans
     redessiner la page entière. */
  { chemin: '/emails', cle: () => 'emails', vue: (ctx) => adminEmails.vue(ctx, env) },
  { chemin: '/annonces', vue: garde('annonces', (ctx) => annonces.vue(ctx, env)) },
  { chemin: '/archives', vue: garde('archives', (ctx) => adminArchives.vue(ctx, env)) },
  { chemin: '/parametres', vue: (ctx) => adminParametres.vue(ctx, env) },
  { chemin: '/equipe', vue: (ctx) => adminEquipe.vue(ctx, env) },
  { chemin: '/moi', vue: (ctx) => parametres.vue(ctx, env) },
], { defaut: '/', cible: vue });

demarrer();
/* La bulle de conversation suit l'adresse (bulle-projet.js) : montée sur
   toute page d'un projet et sur les pages filtrées sur lui (« ?projet= »),
   démontée ailleurs. Jamais sur un projet sans client (D9) : « Écrivez au
   client » n'y a pas de destinataire. Sur Messages, la conversation est la
   page. */
const aUnClient = (pid) => { const p = (magasin.lire(K.projets) || []).find((x) => x.id === pid); return Boolean(p && !p.interne); };
import('./bulle-projet.js').then((b) => {
  const bulle = b.brancherBulle(env, { pagesFiltrees: true, accepte: aUnClient, sansBulle: (route) => /^\/messages(\/|$)/.test(route.chemin || '') });
  magasin.sur(K.projets, () => bulle.revoir());
}).catch((e) => console.error('[bulle]', e));
/* Les notifications push des messages, espace fermé (notifications-push.js) :
   rien n'est demandé ici, seulement branché. */
import('./notifications-push.js').then((m) => m.demarrerPush(env)).catch((e) => console.error('[push]', e));
void OUVERTS;
