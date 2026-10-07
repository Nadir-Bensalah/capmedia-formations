/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée du cockpit d'équipe
   ========================================================================== */

import { exigerSession, $, OUVERTS, ATTEND_EQUIPE, FACTURES_DUES, joursAvant, projetEstActif, bdd, collection, query, orderBy, limit, peut, estAdmin, echapper } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche, definirRetoucheAriane, filAriane } from './coquille.js';
import { definir, demarrer, naviguer, courant } from './routeur.js';
import { titrePage } from './ui.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K, nonLusProjet, requeteMessages, messagesDuProjet } from './donnees.js';

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

const construireNavigation = () => {
  const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
  const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
  const validations = magasin.lire(K.validationsToutes) || [];
  /* Les pièces archivées ne comptent nulle part ailleurs : la barre les
     comptait, et annonçait donc un nombre que la page ne montrait pas. */
  const documents = (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive);
  const demandesProjet = magasin.lire(K.demandesProjet) || [];
  const nouvelles = tickets.filter((t) => t.statut === 'nouveau').length;
  const aNous = tickets.filter((t) => ATTEND_EQUIPE.includes(t.statut)).length;
  const enRetard = taches.filter((t) => t.statut !== 'terminee' && t.echeance && joursAvant(t.echeance) < 0).length;
  const attendues = validations.filter((v) => v.statut === 'en-attente').length;
  const impayees = documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut)).length;
  /* Les mêmes six statuts que la page « Nouveaux projets » : la barre en
     comptait quatre, et deux demandes vivantes n'étaient annoncées nulle part. */
  const preprojets = demandesProjet.filter((d) => ['nouvelle', 'discussion', 'qualification', 'estimation', 'devis', 'acceptee'].includes(d.statut)).length;

  /* Les totaux, en gris : combien il y en a. Les pastilles rouges : combien
     attendent une action de notre côté. */
  const projets = magasin.lire(K.projets) || [];
  const organisations = magasin.lire(K.organisations) || [];
  const reunions = (magasin.lire(K.reunionsToutes) || []).filter((r) => joursAvant(r.date) >= 0);
  const fichiers = magasin.lire(K.fichiersTous) || [];
  const profil = magasin.lire(K.profil);
  const uid = session.utilisateur.uid;
  const nonLus = projets.reduce((n, p) => n + nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid), 0);
  /* Les testeurs qui ont écrit, et ce qui attend une réponse. */
  const conversationsTesteurs = magasin.lire(K.conversationsTesteurs) || [];
  const nonLusTesteurs = conversationsTesteurs.reduce((n, c) => n + Number(c.nonLusEquipe || 0), 0);
  const ouvertes = tickets.filter((t) => OUVERTS.includes(t.statut)).length;
  const aFaire = taches.filter((t) => t.statut !== 'terminee').length;
  const nouveauxPreprojets = demandesProjet.filter((d) => d.statut === 'nouvelle').length;
  const piecesDues = documents.filter((d) => FACTURES_DUES.includes(d.statut) || d.statut === 'envoye').length;

  /* La console de tests annonce ce qui tourne et ce qui bloque : une
     campagne en cours, et une anomalie qu'on n'a pas encore refermée. */
  const campagnesEnCours = (magasin.lire(K.campagnesToutes) || []).filter((c) => c.statut === 'en-cours').length;
  const anomaliesOuvertes = (magasin.lire(K.anomaliesToutes) || []).filter((a) => !['corrigee', 'sans-suite'].includes(a.statut)).length;
  /* La maintenance : les forfaits qui tournent, et les demandes qui
     attendent une proposition. */
  const contrats = (magasin.lire(K.maintenanceToute) || []).filter((x) => x.id === 'contrat');
  const forfaitsActifs = contrats.filter((x) => x.statut === 'actif').length;
  const forfaitsDemandes = contrats.filter((x) => x.statut === 'demande').length;

  /* Ce que le rôle ne permet pas n'apparaît pas : un agent n'administre ni
     les clients, ni la finance, ni l'équipe. Le serveur et les règles
     refusent de toute façon ; l'écran ne propose pas l'impossible. */
  const admin = estAdmin(session);
  const garder = (groupe) => ({ ...groupe, items: groupe.items.filter((i) => i.si === undefined || i.si) });
  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Portefeuille',
      items: [
        { chemin: '/clients', libelle: 'Clients', icone: 'entreprise', compte: { total: organisations.length }, si: peut(session, 'clients.gerer') },
        { chemin: '/projets', libelle: 'Projets', icone: 'projets', compte: { total: projets.filter((p) => projetEstActif(p) && !p.interne && p.ouvert !== false).length } },
        /* Les idées et les projets mis de côté : rangés à part, jamais comptés
           dans le portefeuille en cours. */
        { chemin: '/a-faire', libelle: 'Projets à faire', icone: 'ampoule', compte: { total: projets.filter((p) => p.aFaire && !p.archive).length }, si: admin },
        { chemin: '/nouveaux-projets', libelle: 'Nouveaux projets', icone: 'sparkle', compte: { total: preprojets, neuf: nouveauxPreprojets }, si: admin },
      ],
    },
    {
      titre: 'Travail',
      items: [
        { chemin: '/demandes', libelle: 'Demandes', icone: 'inbox', compte: { total: ouvertes, neuf: nouvelles } },
        { chemin: '/taches', libelle: 'Tâches', icone: 'taches', compte: { total: aFaire, neuf: enRetard } },
        /* Une campagne qui tourne anime l'entrée, comme chez le client. */
        { chemin: '/tests', libelle: 'Tests', icone: 'bug', compte: { total: campagnesEnCours, neuf: anomaliesOuvertes }, enCours: campagnesEnCours ? (campagnesEnCours > 1 ? `${campagnesEnCours} campagnes de tests en cours` : 'campagne de tests en cours') : '' },
        { chemin: '/planning', libelle: 'Planning', icone: 'calendrier', compte: { total: reunions.length } },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages', compte: { total: projets.filter((p) => !p.archive && !p.interne).length, neuf: nonLus } },
        { chemin: '/testeurs-messages', libelle: 'Testeurs', icone: 'smartphone', compte: { total: conversationsTesteurs.length, neuf: nonLusTesteurs }, si: peut(session, 'qa.gerer') },
        { chemin: '/validations', libelle: 'Validations', icone: 'valider', compte: { total: attendues } },
        { chemin: '/documents', libelle: 'Documents', icone: 'documents', compte: { total: fichiers.length } },
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
  ].map(garder));
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

/* Le rail se dessine une fois, tout arrivé (magasin.dessinateur, comme le
   Hub) : avant, un squelette de la même hauteur tient la place des
   entrées. Une minuterie redessinait le rail à chaque clé qui arrivait :
   les chiffres poussaient un à un. Les conversations suivies sont posées
   AVANT le dessin : leurs clés font partie de ce qu'il attend. */
const CLES_NAVIGATION = [K.ticketsTous, K.tachesToutes, K.validationsToutes, K.documentsTous, K.demandesProjet, K.projets, K.organisations, K.reunionsToutes, K.fichiersTous, K.profil, K.maintenanceToute, K.campagnesToutes, K.anomaliesToutes, K.conversationsTesteurs, K.annonces];
const clesNavigation = () => [...CLES_NAVIGATION, ...[...conversationsSuivies].map((pid) => K.messages(pid))];
dessinerNav = magasin.dessinateur(construireNavigation, 80, clesNavigation, 4000);
magasin.sur(K.projets, suivreConversations);
CLES_NAVIGATION.forEach((cle) => magasin.sur(cle, dessinerNav));
/* Le squelette : les mêmes groupes, autant de lignes que d'entrées que le
   rôle verra (elles ne dépendent que des permissions). */
const squeletteNavigation = () => {
  const admin = estAdmin(session);
  const n = (...conditions) => conditions.filter(Boolean).length;
  return [
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    { titre: 'Portefeuille', squelette: { projets: n(peut(session, 'clients.gerer'), true, admin, admin) } },
    { titre: 'Travail', squelette: { projets: n(true, true, true, true, true, peut(session, 'qa.gerer'), true, true) } },
    { titre: 'Gestion', squelette: { projets: n(peut(session, 'finance.lecture'), true, true, peut(session, 'systeme'), admin, admin || peut(session, 'finance.gerer'), admin) } },
    { pied: true, items: [{ chemin: '/equipe', libelle: 'Équipe', icone: 'utilisateurs' }, { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' }] },
  ];
};
definirNavigation(squeletteNavigation());
dessinerNav();

/* Le fil d'Ariane de l'équipe part toujours de l'accueil, et passe par
   « Projets » puis le projet quand la page est celle d'un projet :
   « Accueil › Projets › Atelier › Tâches ». Le Retour s'appuie dessus
   quand on arrive par un lien. Les pages filtrées (« ?projet= ») et les
   messages gardent leur fil : leur place dans l'arbre viendra avec lui. */
const projetDuChemin = (chemin) => {
  const m = /^\/projets\/([^/]+)/.exec(chemin || '');
  return m && m[1] !== 'nouveau' ? decodeURIComponent(m[1]) : '';
};
definirRetoucheAriane((items) => {
  if (!items || !items.length) return items;
  if (items.length === 1 && !items[0].chemin && items[0].libelle === 'Accueil') return items;
  let fil = items.filter((it) => it.chemin !== '/');
  const pid = projetDuChemin(courant().chemin);
  if (pid) {
    const chemin = `/projets/${pid}`;
    if (!fil.some((it) => it.chemin === chemin)) {
      const projet = (magasin.lire(K.projets) || []).find((p) => p.id === pid);
      if (projet) fil.splice(fil.findIndex((it) => it.chemin === '/projets') + 1, 0, { libelle: projet.nom, chemin });
    }
    if (fil.some((it) => it.chemin === chemin) && !fil.some((it) => it.chemin === '/projets')) {
      fil.splice(fil.findIndex((it) => it.chemin === chemin), 0, { libelle: 'Projets', chemin: '/projets' });
    }
  }
  fil = [{ libelle: 'Accueil', chemin: '/' }, ...fil];
  return fil;
});

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
  (magasin.lire(K.fichiersTous) || []).forEach((f) => items.push({ groupe: 'Fichiers', libelle: f.nom, sous: nomProjet(f.projet), icone: 'fichiers', chemin: `/projets/${f.projet}/fichiers` }));
  (magasin.lire(K.reunionsToutes) || []).forEach((r) => items.push({ groupe: 'Réunions', libelle: r.titre, sous: nomProjet(r.projet), icone: 'reunions', chemin: `/projets/${r.projet}/reunions` }));
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
  { chemin: '/projets/:id/reunions/:rid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'reunions' }, env) },
  { chemin: '/projets/:id/releases/:rid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'releases' }, env) },
  { chemin: '/projets/:id/brique/:cid', vue: (ctx) => brique.vue(ctx, env) },
  { chemin: '/projets/:id/notes', vue: (ctx) => notesProjet.vue(ctx, env) },
  { chemin: '/projets/:id/evolutions', vue: (ctx) => evolutions.vue(ctx, env) },
  /* Ce que Sentry voit de l'application (vues/stabilite.js). */
  { chemin: '/projets/:id/stabilite', vue: (ctx) => stabilite.vue(ctx, env) },
  /* La salle de contrôle : la santé en direct, plein écran possible (vues/controle.js). */
  { chemin: '/projets/:id/controle', vue: (ctx) => controle.vue(ctx, env) },
  { chemin: '/controle', vue: (ctx) => controle.entree(ctx, env) },
  { chemin: '/projets/:id/suggestions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/evolutions`, { remplacer: true }); } },
  /* Les adresses du Hub qu'un membre de l'équipe peut ouvrir (un lien du
     client, une lettre, le Hub qui renvoie au Cockpit en gardant la
     route) : leur place dans le Cockpit, au lieu de l'accueil. */
  { chemin: '/projets/:id/versions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/releases`, { remplacer: true }); } },
  { chemin: '/projets/:id/decisions', vue: (ctx) => { naviguer(`/projets/${ctx.params.id}/notes`, { remplacer: true }); } },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/nouveaux-projets', vue: garde('nouveauxProjets', (ctx) => nouveauProjet.liste(ctx, env)) },
  { chemin: '/nouveaux-projets/:id', vue: garde('nouveauxProjets', (ctx) => nouveauProjet.detail(ctx, env)) },
  { chemin: '/demandes', vue: (ctx) => adminDemandes.vue(ctx, env) },
  { chemin: '/taches', vue: (ctx) => adminTaches.vue(ctx, env) },
  { chemin: '/tests', cle: () => 'tests', vue: (ctx) => tests.vue(ctx, env) },
  /* Ce qui va être testé : le plan de tests d'un projet, section par
     section. La même page des deux côtés ; l'équipe y corrige. */
  { chemin: '/tests/plan', cle: () => 'plan-tests', vue: (ctx) => planTests.vue(ctx, env) },
  /* Le tableau vit dans Tests : ses anciennes adresses y mènent. */
  { chemin: '/tests/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/planning', vue: (ctx) => adminPlanning.vue(ctx, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/testeurs-messages', vue: garde('testeurs', (ctx) => testeursMessages.vue(ctx, env)) },
  { chemin: '/testeurs-messages/:uid', vue: garde('testeurs', (ctx) => testeursMessages.vue(ctx, env)) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/validations', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/validations/:vid', vue: (ctx) => adminValidations.vue(ctx, env) },
  /* L'adresse d'une validation dans le Hub (« En attente du client », les
     liens du client) : la même fiche dans le Cockpit. */
  { chemin: '/valider', vue: () => { naviguer('/validations', { remplacer: true }); } },
  { chemin: '/valider/:vid', vue: (ctx) => { naviguer(`/validations/${encodeURIComponent(ctx.params.vid)}`, { remplacer: true }); } },
  { chemin: '/documents', vue: (ctx) => documents.vue(ctx, env) },
  { chemin: '/finances', vue: garde('finances', (ctx) => adminFinances.vue(ctx, env)) },
  { chemin: '/finances/:did', vue: garde('finances', (ctx) => adminFinances.vue(ctx, env)) },
  { chemin: '/maintenance', vue: (ctx) => maintenance.vue(ctx, env) },
  { chemin: '/activite', vue: (ctx) => adminActivite.vue(ctx, env) },
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
/* La bulle de conversation suit l'adresse : montée sur toute page d'un projet, démontée ailleurs (bulle-projet.js). */
import('./bulle-projet.js').then((b) => b.brancherBulle(env)).catch((e) => console.error('[bulle]', e));
/* Les notifications push des messages, espace fermé (notifications-push.js) :
   rien n'est demandé ici, seulement branché. */
import('./notifications-push.js').then((m) => m.demarrerPush(env)).catch((e) => console.error('[push]', e));
void OUVERTS;
