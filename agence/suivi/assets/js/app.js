/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée de l'espace client
   Ouvre la session, monte la coquille, déclare les routes, branche la
   navigation vivante et la recherche.
   ========================================================================== */

import { exigerSession, $, echapper, prenom, nomAffiche, OUVERTS, ATTEND_CLIENT, FACTURES_DUES, joursAvant, effacerSecretsLocaux, estResponsable, roleSur, ROLES_CLIENT, libellePlateforme, projetEstActif } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche, definirRoleProjet, definirRetoucheAriane, projetDeLAdresse, deplierArbre } from './coquille.js';
import { definir, demarrer, courant, surChangement, naviguer } from './routeur.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K, G, agreger, enAttenteDeVous, nonLusProjet, ecrire, messagesDuProjet } from './donnees.js';
import { icone } from './icones.js';
import { avatarProjet, toast } from './ui.js';
import { ouvrirAccueil, accueilVu, marquerAccueilVu } from './accueil-client.js';

import * as accueil from './vues/accueil.js';
import * as projet from './vues/projet.js';
import * as demande from './vues/demande.js';
import { resoudreDemande } from './lien-profond.js';
import * as brique from './vues/brique.js';
import * as messages from './vues/messages.js';
import * as calendrier from './vues/calendrier.js';
import * as activite from './vues/activite.js';
import * as tests from './vues/tests.js';
import * as planTests from './vues/plan-tests.js';
import * as tableau from './vues/tableau.js';
import * as finances from './vues/finances.js';
import * as documents from './vues/documents.js';
import { estPubliee as suggestionPubliee } from './vues/suggestions.js';
import * as maintenance from './vues/maintenance.js';
import * as parametres from './vues/parametres.js';
import * as nouveauProjet from './vues/nouveau-projet.js';
import * as demandes from './vues/demandes.js';
import * as demandesProjet from './vues/demandes-projet.js';

const session = await exigerSession();
if (!session) throw new Error('session absente');

/* Un compte d'équipe a son propre cockpit. */
if (session.equipe) {
  location.replace(`./cockpit${location.hash || ''}`);
  throw new Error('redirection');
}

/* Un testeur a le sien. La porte l'y envoie déjà, mais un favori, un
   lien collé ou une copie en cache d'un ancien script peuvent le poser
   ici : le hub le renvoie alors chez lui, plutôt que de lui montrer un
   espace client vide. */
if (session.testeur) {
  location.replace('./testeur');
  throw new Error('redirection');
}

/* Un compte client n'a rien à faire d'une clé d'administration laissée
   dans ce navigateur par une autre session. */
effacerSecretsLocaux();

const env = { session, role: 'client' };
const lotGlobal = magasin.lot();
abonnerGlobal(lotGlobal, session);

/* --- La coquille et la navigation --------------------------------------- */

const { vue } = monterCoquille({ session, role: 'client', groupes: [], sortie: $('#racine') });

/* --- L'accueil, la première fois ------------------------------------------
   Devant tout, la première fois sur cet appareil, sauf si le profil dit
   qu'il a déjà été parcouru ailleurs. Il se rejoue depuis le menu du
   compte. Ce qui est fait est consigné dans le profil : l'administrateur
   le lit sur la fiche du client. */
let porte = null;
const lancerAccueil = ({ demande = false } = {}) => {
  if (porte) return;
  const projetsDuClient = () => (magasin.lire(K.projets) || session.projets || []);
  porte = ouvrirAccueil({
    session,
    projets: projetsDuClient,
    surFin: () => {
      porte = null;
      marquerAccueilVu(session.utilisateur.uid);
      const profil = magasin.lire(K.profil) || session.profil || {};
      if (!profil.accueil) ecrire.majProfil(session.utilisateur.uid, { accueil: new Date() }).catch(() => {});
    },
  });
  porte.demande = demande;
};
document.addEventListener('suivi:accueil-revoir', () => lancerAccueil({ demande: true }));
const dejaParcouru = Boolean(session.profil && session.profil.accueil);
if (!accueilVu(session.utilisateur.uid) && !dejaParcouru) lancerAccueil();
else if (dejaParcouru) marquerAccueilVu(session.utilisateur.uid);
magasin.sur(K.projets, () => { if (porte) porte.majProjets(); });
/* Les scénarios et les parcours arrivent après la porte : l'écran des tests
   apparaît quand ils sont là. */
(session.projets || []).forEach((p) => { magasin.sur(K.scenarios(p.id), () => { if (porte) porte.majProjets(); }); magasin.sur(K.parcours(p.id), () => { if (porte) porte.majProjets(); }); });

const compter = () => {
  const projets = magasin.lire(K.projets) || session.projets;
  const attente = enAttenteDeVous({
    projets, tickets: agreger(session, G.tickets), validations: agreger(session, G.validations),
    documents: agreger(session, G.documents), taches: agreger(session, G.taches), blocages: agreger(session, G.blocages),
  });
  const profil = magasin.lire(K.profil);
  const nonLus = projets.reduce((s, p) => s + nonLusProjet(messagesDuProjet(p.id), profil, p.id, session.utilisateur.uid), 0);
  /* L'entrée Tests n'apparaît chez le client que si des scénarios le
     concernent : un menu qui ouvre sur une page vide inquiète plus qu'il
     n'informe. */
  const scenariosDuClient = projets.reduce((n, p) => n + (magasin.lire(K.scenarios(p.id)) || []).filter((x) => x.actif !== false).length, 0);
  const parcoursDuClient = projets.reduce((n, p) => n + (magasin.lire(K.parcours(p.id)) || []).filter((x) => x.actif !== false).length, 0);
  /* Les forfaits de maintenance en cours : le gris de l'entrée Maintenance. */
  const forfaits = projets.filter((p) => (magasin.lire(K.maintenance(p.id)) || []).some((x) => x.id === 'contrat' && x.statut === 'actif')).length;
  /* On ne dit « aucun forfait » qu'une fois la maintenance de chaque projet
     arrivée : avant, on ne sait pas, et le repère clignoterait au démarrage. */
  const maintenanceConnue = projets.every((p) => magasin.lire(K.maintenance(p.id)) !== undefined || magasin.erreur(K.maintenance(p.id)));
  /* Une campagne de tests en cours sur l'un de ses projets : l'entrée Tests
     le montre (le même statut que la page des tests, « en-cours »). */
  const campagnesEnCours = projets.filter((p) => !p.archive).reduce((n, p) => n + (magasin.lire(K.campagnes(p.id)) || []).filter((c) => c.statut === 'en-cours').length, 0);
  /* Les demandes de projet du client : l'entrée « Mes demandes de projet »
     n'apparaît que s'il en a au moins une. */
  const demandesDeProjet = (magasin.lire(K.demandesProjet) || []).length;
  return { projets, attente, nonLus, profil, scenariosDuClient, parcoursDuClient, forfaits, maintenanceConnue, campagnesEnCours, demandesDeProjet };
};

/* Le projet où l'on se trouve : /projets/{p}/..., /messages/{p}, ou une
   page filtrée sur un projet (?projet=). */
const projetOuvert = () => projetDeLAdresse(courant());

/* Le fil d'Ariane du client part toujours de l'accueil, et passe par le
   projet quand la page est celle d'un projet : « Accueil › Atelier ›
   Messages ». On peut ainsi toujours revenir, d'un clic. */
definirRetoucheAriane((items) => {
  if (!items || !items.length) return items;
  if (items.length === 1 && !items[0].chemin && items[0].libelle === 'Accueil') return items;
  let fil = items.slice();
  const pid = projetOuvert();
  const projet = pid ? (magasin.lire(K.projets) || session.projets || []).find((p) => p.id === pid) : null;
  if (projet && !fil.some((it) => it.chemin === `/projets/${pid}`)) {
    const debut = fil[0].chemin === '/' ? 1 : 0;
    fil.splice(debut, 0, { libelle: projet.nom, chemin: `/projets/${pid}` });
  }
  if (fil[0].chemin !== '/') fil = [{ libelle: 'Accueil', chemin: '/' }, ...fil];
  return fil;
});

/* Entrer dans un projet déplie son arbre dans le rail : on voit où l'on est. */
let dernierProjet = '';
surChangement(() => {
  const pid = projetOuvert();
  if (pid && pid !== dernierProjet) deplierArbre(pid, true);
  dernierProjet = pid;
});

/* Les entrées d'un projet dans le rail, dans l'ordre où un client les
   cherche : où en est-on, ce qui m'attend, parler, le plan, le travail,
   les dates, ce qui sort, ce qui est testé, ce qu'on se transmet, puis
   l'argent et l'après. Une entrée qui ne mènerait qu'à une page vide n'est
   pas là (Tests sans scénario, Versions sans version, Ressources sans
   lien...). C'est la seule navigation d'un projet : la page du projet n'a
   plus d'onglets côté client. */
const entreesProjet = (p, { attente, nonLusP }) => {
  const pid = p.id;
  const lireP = (cle) => magasin.lire(cle(pid)) || [];
  const attenteP = attente.filter((a) => a.projet === pid);
  const argent = attenteP.filter((a) => a.genre === 'devis' || a.genre === 'facture').length;
  const responsable = estResponsable(session, p);
  const tickets = lireP(K.tickets).filter((t) => !t.archive);
  const taches = lireP(K.taches).filter((t) => !t.archive);
  const releases = lireP(K.releases);
  const liens = lireP(K.liens);
  const notes = lireP(K.notes);
  const fichiers = lireP(K.fichiers).filter((f) => !f.archive);
  const scenarios = lireP(K.scenarios).filter((x) => x.actif !== false).length;
  const parcours = lireP(K.parcours).filter((x) => x.actif !== false).length;
  const campagnes = lireP(K.campagnes).filter((c) => c.statut === 'en-cours').length;
  const suggestions = lireP(K.suggestions).filter(suggestionPubliee).length;
  const reunions = lireP(K.reunions).filter((r) => joursAvant(r.date) >= 0).length;
  const forfait = lireP(K.maintenance).some((x) => x.id === 'contrat' && x.statut === 'actif');
  const maintenanceConnue = magasin.lire(K.maintenance(pid)) !== undefined || Boolean(magasin.erreur(K.maintenance(pid)));
  const base = `/projets/${pid}`;
  return [
    { chemin: base, libelle: 'Aperçu', icone: 'accueil', exact: true, projet: pid },
    { chemin: `${base}/demandes`, libelle: 'Demandes', icone: 'demandes', projet: pid, compte: { total: tickets.filter((t) => OUVERTS.includes(t.statut)).length, neuf: attenteP.length - argent } },
    { chemin: `/messages/${pid}`, libelle: 'Messages', icone: 'messages', projet: pid, compte: { total: 0, neuf: nonLusP } },
    { chemin: `${base}/etapes`, libelle: 'Feuille de route', icone: 'route', projet: pid },
    ...(taches.length ? [{ chemin: `${base}/taches`, libelle: 'Tâches', icone: 'taches', projet: pid, compte: { total: taches.filter((t) => t.statut !== 'terminee').length } }] : []),
    { chemin: '/calendrier', lien: `/calendrier?projet=${pid}`, libelle: 'Calendrier', icone: 'calendrier', projet: pid, compte: { total: reunions } },
    ...(releases.length ? [{ chemin: `${base}/releases`, libelle: 'Versions', icone: 'releases', projet: pid, compte: { total: releases.length } }] : []),
    ...(scenarios || parcours || campagnes ? [{
      chemin: '/tests', lien: `/tests?projet=${pid}`, libelle: 'Tests', icone: 'bug', projet: pid, compte: { total: scenarios },
      enCours: campagnes ? (campagnes > 1 ? `${campagnes} campagnes de tests en cours` : 'campagne de tests en cours') : '',
    }] : []),
    { chemin: '/fichiers', lien: `/fichiers?projet=${pid}`, libelle: 'Fichiers', icone: 'fichiers', projet: pid, compte: { total: fichiers.length } },
    ...(liens.length ? [{ chemin: `${base}/liens`, libelle: 'Ressources', icone: 'liens', projet: pid, compte: { total: liens.length } }] : []),
    ...(notes.length ? [{ chemin: `${base}/notes`, libelle: 'Décisions', icone: 'note', projet: pid, compte: { total: notes.length } }] : []),
    ...(suggestions ? [{ chemin: `${base}/suggestions`, libelle: 'Suggestions', icone: 'ampoule', projet: pid }] : []),
    /* La finance et le coffre sont au responsable. */
    ...(responsable ? [{ chemin: '/finances', lien: `/finances?projet=${pid}`, libelle: 'Devis et factures', icone: 'finances', projet: pid, compte: { total: argent, neuf: argent } }] : []),
    {
      chemin: '/maintenance', lien: `/maintenance?projet=${pid}`, libelle: 'Maintenance', icone: 'sante', projet: pid,
      repere: maintenanceConnue && !forfait ? { texte: 'Aucun forfait de maintenance en cours', icone: 'aucun' } : null,
    },
    ...(responsable ? [{ chemin: `${base}/coffre`, libelle: 'Coffre-fort', icone: 'cadenas', projet: pid }] : []),
  ];
};

const construireNavigation = () => {
  const { projets, attente, profil, demandesDeProjet } = compter();
  const actifs = projets.filter((p) => !p.archive);
  const enCours = actifs.filter(projetEstActif);
  const uid = session.utilisateur.uid;

  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Vos projets',
      /* Chaque projet, son écusson et son arbre : ses entrées sont les
         sections de sa page. Un seul projet en cours : déplié d'office. */
      items: actifs.map((p) => {
        const nonLusP = nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid);
        const aVous = attente.filter((a) => a.projet === p.id).length;
        return {
          chemin: `/projets/${p.id}`, libelle: p.nom, ecusson: avatarProjet(p, 'mini'),
          arbre: p.id, deplieParDefaut: actifs.length === 1 || (enCours.length === 1 && projetEstActif(p)),
          /* Replié, le projet porte la somme : ce qui attend votre main, et
             les messages non lus. Un devis n'y est compté qu'une fois. */
          compteReplie: { total: 0, neuf: aVous + nonLusP },
          enfants: entreesProjet(p, { attente, nonLusP }),
        };
      }),
    },
    {
      titre: 'Compte',
      items: [
        /* Hors des projets : demander un nouveau projet, et les paramètres. */
        { chemin: '/nouveau-projet', libelle: 'Demander un projet', icone: 'plus' },
        ...(demandesDeProjet ? [{ chemin: '/nouveaux-projets', libelle: 'Mes demandes de projet', icone: 'sparkle', sous: true, compte: { total: demandesDeProjet } }] : []),
        { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' },
      ],
    },
  ]);
};

let minuteurNav = null;
const planifierNav = () => { clearTimeout(minuteurNav); minuteurNav = setTimeout(construireNavigation, 80); };
[K.projets, K.profil, K.demandesProjet, ...session.projets.flatMap((p) => [K.tickets(p.id), K.validations(p.id), K.documents(p.id), K.fichiers(p.id), K.taches(p.id), K.blocages(p.id), K.messages(p.id), K.maintenance(p.id), K.scenarios(p.id), K.parcours(p.id), K.campagnes(p.id), K.releases(p.id), K.liens(p.id), K.notes(p.id), K.suggestions(p.id), K.reunions(p.id)])]
  .forEach((cle) => magasin.sur(cle, planifierNav));
construireNavigation();
surChangement(construireNavigation);

/* Le rôle du client sur le projet ouvert, sous le nom de l'entreprise dans
   le rail : « Vous êtes responsable » ou « collaborateur ». Hors d'une
   fiche projet, rien. Les rôles vivent sur la fiche du projet (K.projets),
   à jour en direct. */
const afficherRole = () => {
  const pid = projetOuvert();
  const projet = pid ? (magasin.lire(K.projets) || session.projets || []).find((p) => p.id === pid) : null;
  const role = projet ? roleSur(session, projet) : null;
  definirRoleProjet(role ? `Vous êtes ${ROLES_CLIENT[role].toLowerCase()}` : '');
};
surChangement(afficherRole);
magasin.sur(K.projets, afficherRole);

/* --- La recherche ------------------------------------------------------- */

/* Les projets archivés n'y figurent pas, ni ce qui leur appartient : on ne
   cherche pas dans ce qu'on ne suit plus. Un fichier, une réunion, une
   version mènent à l'élément, pas seulement à la page : « ?f= » pour
   la page Fichiers, une fiche pour les deux autres. */
enregistrerRecherche((terme) => {
  const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
  const actif = (pid) => projets.some((p) => p.id === pid);
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const des = (fabrique) => agreger(session, fabrique).filter((x) => actif(x.projet) && !x.archive);
  const parProjet = (cle) => projets.flatMap((p) => (magasin.lire(cle(p.id)) || []).map((x) => ({ ...x, projet: x.projet || p.id })));
  const items = [];
  if (!terme) {
    items.push({ groupe: 'Actions', libelle: 'Nouvelle demande', icone: 'plus', action: async () => { const pid = await accueil.choisirProjet(projets); if (pid) naviguer(`/projets/${pid}/nouvelle-demande`); } });
    items.push({ groupe: 'Actions', libelle: 'Envoyer un message', icone: 'messages', action: async () => { const pid = await accueil.choisirProjet(projets); naviguer(pid ? `/messages/${pid}` : '/messages'); } });
    items.push({ groupe: 'Actions', libelle: 'Voir ce qui vous attend', icone: 'valider', chemin: '/demandes' });
  }
  const { scenariosDuClient, parcoursDuClient } = compter();
  const pages = [
    ['En attente de vous', '/demandes', 'valider'], ['Demandes', '/demandes', 'demandes'], ['Messages', '/messages', 'messages'],
    ['Calendrier', '/calendrier', 'calendrier'], ['Fichiers', '/fichiers', 'fichiers'], ['Maintenance', '/maintenance', 'sante'],
    ...(projets.some((p) => estResponsable(session, p)) ? [['Devis et factures', '/finances', 'finances']] : []),
    ...(scenariosDuClient || parcoursDuClient ? [['Tests', '/tests', 'bug']] : []),
    ['Paramètres', '/parametres', 'parametres'], ['Demander un projet', '/nouveau-projet', 'plus'],
  ];
  pages.forEach(([libelle, chemin, ic]) => items.push({ groupe: 'Pages', libelle, sous: 'Page de l\'espace', icone: ic, chemin }));
  projets.forEach((p) => items.push({ groupe: 'Projets', libelle: p.nom, sous: p.ref, icone: 'projets', chemin: `/projets/${p.id}` }));
  des(G.tickets).forEach((t) => items.push({ groupe: 'Demandes', libelle: t.titre, sous: `${t.numero || ''} ${nomProjet(t.projet)}`.trim(), icone: 'demandes', chemin: `/projets/${t.projet}/demandes/${t.id}` }));
  des(G.validations).filter((v) => v.statut === 'en-attente').forEach((v) => items.push({ groupe: 'Validations', libelle: v.titre, sous: nomProjet(v.projet), icone: 'valider', chemin: `/valider/${v.id}` }));
  des(G.taches).forEach((t) => items.push({ groupe: 'Tâches', libelle: t.titre, sous: nomProjet(t.projet), icone: 'taches', chemin: `/projets/${t.projet}/taches/${t.id}` }));
  des(G.fichiers).forEach((f) => items.push({ groupe: 'Fichiers', libelle: f.nom, sous: nomProjet(f.projet), icone: 'fichiers', chemin: `/fichiers?projet=${encodeURIComponent(f.projet)}&f=${encodeURIComponent(f.id)}` }));
  parProjet(K.notes).forEach((n) => items.push({ groupe: 'Décisions', libelle: n.titre || '', sous: nomProjet(n.projet), icone: 'note', chemin: `/projets/${n.projet}/notes` }));
  parProjet(K.liens).forEach((l) => items.push({ groupe: 'Ressources', libelle: l.nom || l.url || '', sous: `${nomProjet(l.projet)} · ${l.url || ''}`, icone: 'liens', action: () => { if (l.url) window.open(l.url, '_blank', 'noopener'); } }));
  des(G.documents).forEach((d) => items.push({ groupe: 'Devis et factures', libelle: `${d.numero || ''} ${d.libelle || ''}`.trim(), sous: nomProjet(d.projet), icone: 'receipt', chemin: `/finances/${d.id}` }));
  des(G.reunions).forEach((r) => items.push({ groupe: 'Réunions', libelle: r.titre, sous: nomProjet(r.projet), icone: 'reunions', chemin: `/projets/${r.projet}/reunions/${r.id}` }));
  des(G.releases).forEach((r) => items.push({ groupe: 'Versions', libelle: `${libellePlateforme(r.plateforme)} ${r.version || ''}`.trim(), sous: nomProjet(r.projet), icone: 'releases', chemin: `/projets/${r.projet}/releases/${r.id}` }));
  return items;
});

/* --- Les routes --------------------------------------------------------- */

definir([
  { chemin: '/', vue: (ctx) => accueil.vue(ctx, env) },
  { chemin: '/projets/:id', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  { chemin: '/demande/:tid', vue: (ctx) => resoudreDemande(ctx) },
  { chemin: '/projets/:id/taches/:tid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  /* La fiche d'une réunion ou d'une version par son adresse : ce que
     visent les notifications, les lettres et la recherche. */
  { chemin: '/projets/:id/reunions/:rid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'reunions' }, env) },
  { chemin: '/projets/:id/releases/:rid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'releases' }, env) },
  { chemin: '/projets/:id/brique/:cid', vue: (ctx) => brique.vue(ctx, env) },
  { chemin: '/activite', vue: (ctx) => activite.vue(ctx, env) },
  /* Les accès sont gérés par Capmedia : un client qui tape cette adresse
     retombe sur l'aperçu, et on le lui dit. */
  { chemin: '/projets/:id/acces', vue: (ctx) => { toast('Les accès sont gérés par Capmedia.'); naviguer(`/projets/${ctx.params.id}`, { remplacer: true }); } },
  /* Les fichiers d'un projet vivent sur la page Fichiers, filtrée sur lui :
     les anciennes adresses (lettres, notifications) y mènent. */
  { chemin: '/projets/:id/fichiers', vue: (ctx) => { naviguer(`/fichiers?projet=${encodeURIComponent(ctx.params.id)}${ctx.requete && ctx.requete.f ? `&f=${encodeURIComponent(ctx.requete.f)}` : ''}`, { remplacer: true }); } },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/demandes', vue: (ctx) => demandes.vue(ctx, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  /* « En attente de vous » vit en tête de la page Demandes. L'ancienne
     adresse y mène ; celle d'une validation (e-mails, notifications) ouvre
     la page Demandes avec la fiche de la validation par-dessus. */
  { chemin: '/valider', vue: () => { naviguer('/demandes', { remplacer: true }); } },
  { chemin: '/valider/:vid', vue: (ctx) => demandes.vue(ctx, env) },
  { chemin: '/calendrier', vue: (ctx) => calendrier.vue(ctx, env) },
  { chemin: '/tests', cle: () => 'tests', vue: (ctx) => tests.vue(ctx, env) },
  /* Ce qui va être testé : le plan de tests d'un projet, section par
     section. La même page des deux côtés ; l'équipe y corrige. */
  { chemin: '/tests/plan', cle: () => 'plan-tests', vue: (ctx) => planTests.vue(ctx, env) },
  { chemin: '/tests/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/finances', vue: (ctx) => finances.vue(ctx, env) },
  { chemin: '/finances/:did', vue: (ctx) => finances.vue(ctx, env) },
  /* Les fichiers, projet par projet (l'arbre du rail y mène). Sans projet
     dans l'adresse, le premier projet en cours : pas d'espace en double. */
  { chemin: '/fichiers', vue: (ctx) => {
    const pid = (ctx.requete && ctx.requete.projet) || '';
    const projets = (magasin.lire(K.projets) || session.projets || []).filter((p) => !p.archive);
    if (!pid || !projets.some((p) => p.id === pid)) {
      const premier = projets.find(projetEstActif) || projets[0];
      if (premier) { naviguer(`/fichiers?projet=${encodeURIComponent(premier.id)}`, { remplacer: true }); return null; }
    }
    return documents.vue(ctx, env);
  } },
  { chemin: '/documents', vue: (ctx) => { naviguer(`/fichiers${ctx.requete && ctx.requete.projet ? `?projet=${encodeURIComponent(ctx.requete.projet)}` : ''}`, { remplacer: true }); } },
  { chemin: '/maintenance', vue: (ctx) => maintenance.vue(ctx, env) },
  { chemin: '/parametres', vue: (ctx) => parametres.vue(ctx, env) },
  { chemin: '/nouveau-projet', vue: (ctx) => nouveauProjet.nouvelle(ctx, env) },
  { chemin: '/nouveaux-projets', vue: (ctx) => demandesProjet.vue(ctx, env) },
  { chemin: '/nouveaux-projets/:id', vue: (ctx) => nouveauProjet.detail(ctx, env) },
], { defaut: '/', cible: vue });

/* La dernière visite sert à dire « depuis votre passage ». Elle était
   réécrite au démarrage : un simple rechargement vidait l'encart. On lit
   la valeur d'avant, et on la garde pour toute la session ; la nouvelle se
   pose quand la page se cache (onglet quitté, fenêtre fermée) et toutes
   les dix minutes d'activité, jamais dans env.derniereVisite. Pas de
   sendBeacon : Firestore n'en veut pas, une écriture ordinaire suffit. */
magasin.attendre(K.profil).then((profil) => {
  env.derniereVisite = profil && profil.derniereVisite ? profil.derniereVisite : null;
  ecrire.majProfil(session.utilisateur.uid, { nom: nomAffiche(session) }).catch(() => {});
}).catch(() => {});
const DIX_MINUTES = 10 * 60 * 1000;
let derniereEcriture = 0;
const poserDerniereVisite = ({ force = false } = {}) => {
  if (!force && Date.now() - derniereEcriture < DIX_MINUTES) return;
  derniereEcriture = Date.now();
  ecrire.majProfil(session.utilisateur.uid, { derniereVisite: new Date() }).catch(() => {});
};
window.addEventListener('pagehide', () => poserDerniereVisite({ force: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') poserDerniereVisite({ force: true }); });
/* Une activité, c'est un geste : la souris, le clavier, le doigt. */
['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, () => poserDerniereVisite(), { passive: true }));

demarrer();
/* La bulle de conversation suit l'adresse : montée sur toute page d'un projet, démontée ailleurs (bulle-projet.js). */
import('./bulle-projet.js').then((b) => b.brancherBulle(env)).catch((e) => console.error('[bulle]', e));

void echapper; void prenom; void icone; void OUVERTS; void ATTEND_CLIENT; void FACTURES_DUES;
