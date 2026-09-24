/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée du cockpit d'équipe
   ========================================================================== */

import { exigerSession, $, OUVERTS, ATTEND_EQUIPE, FACTURES_DUES, joursAvant, projetEstActif, bdd, collection, query, orderBy, limit } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche } from './coquille.js';
import { definir, demarrer } from './routeur.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K, nonLusProjet } from './donnees.js';
import { surCle } from './serveur.js';

import * as adminAccueil from './vues/admin-accueil.js';
import * as adminClients from './vues/admin-clients.js';
import * as adminProjets from './vues/admin-projets.js';
import * as projet from './vues/projet.js';
import * as demande from './vues/demande.js';
import * as brique from './vues/brique.js';
import * as adminDemandes from './vues/admin-demandes.js';
import * as adminTaches from './vues/admin-taches.js';
import * as tests from './vues/tests.js';
import * as tableau from './vues/tableau.js';
import * as adminPlanning from './vues/admin-planning.js';
import * as messages from './vues/messages.js';
import * as adminValidations from './vues/admin-validations.js';
import * as adminFinances from './vues/admin-finances.js';
import * as documents from './vues/documents.js';
import * as maintenance from './vues/maintenance.js';
import * as adminActivite from './vues/admin-activite.js';
import * as adminArchives from './vues/admin-archives.js';
import * as adminAFaire from './vues/admin-a-faire.js';
import * as adminParametres from './vues/admin-parametres.js';
import * as nouveauProjet from './vues/nouveau-projet.js';
import * as parametres from './vues/parametres.js';

const session = await exigerSession();
if (!session) throw new Error('session absente');

if (!session.equipe) {
  location.replace(`./hub${location.hash || ''}`);
  throw new Error('redirection');
}

const env = { session, role: 'equipe' };
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
  const nonLus = projets.reduce((n, p) => n + nonLusProjet(magasin.lire(K.messages(p.id)) || [], profil, p.id, uid), 0);
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

  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Portefeuille',
      items: [
        { chemin: '/clients', libelle: 'Clients', icone: 'entreprise', compte: { total: organisations.length } },
        { chemin: '/projets', libelle: 'Projets', icone: 'projets', compte: { total: projets.filter((p) => projetEstActif(p) && !p.interne && p.ouvert !== false).length } },
        /* Les idées et les projets mis de côté : rangés à part, jamais comptés
           dans le portefeuille en cours. */
        { chemin: '/a-faire', libelle: 'Projets à faire', icone: 'ampoule', compte: { total: projets.filter((p) => p.aFaire && !p.archive).length } },
        { chemin: '/nouveaux-projets', libelle: 'Nouveaux projets', icone: 'sparkle', compte: { total: preprojets, neuf: nouveauxPreprojets } },
      ],
    },
    {
      titre: 'Travail',
      items: [
        { chemin: '/demandes', libelle: 'Demandes', icone: 'inbox', compte: { total: ouvertes, neuf: nouvelles } },
        { chemin: '/taches', libelle: 'Tâches', icone: 'taches', compte: { total: aFaire, neuf: enRetard } },
        { chemin: '/tests', libelle: 'Tests', icone: 'bug', compte: { total: campagnesEnCours, neuf: anomaliesOuvertes } },
        { chemin: '/planning', libelle: 'Planning', icone: 'calendrier', compte: { total: reunions.length } },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages', compte: { total: projets.filter((p) => !p.archive && !p.interne).length, neuf: nonLus } },
        { chemin: '/validations', libelle: 'Validations', icone: 'valider', compte: { total: attendues } },
        { chemin: '/documents', libelle: 'Documents', icone: 'documents', compte: { total: fichiers.length } },
      ],
    },
    {
      titre: 'Gestion',
      items: [
        /* Le libellé ne tenait pas dans la barre : le titre de la page dit
           « Finances », la barre disait autre chose et se faisait couper. */
        { chemin: '/finances', libelle: 'Finances', icone: 'finances', compte: { total: piecesDues, neuf: piecesDues } },
        { chemin: '/maintenance', libelle: 'Maintenance', icone: 'sante', compte: { total: forfaitsActifs, neuf: forfaitsDemandes } },
        { chemin: '/activite', libelle: 'Activité', icone: 'activite' },
        { chemin: '/archives', libelle: 'Archives', icone: 'archive' },
        { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' },
      ],
    },
  ]);
};

/* Le cockpit écoute aussi la conversation de chaque projet ouvert : sans
   cela, la pastille des messages non lus resterait muette. */
const conversationsSuivies = new Set();
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
    lotGlobal.abonner(K.messages(p.id), () => query(collection(bdd, 'projets', p.id, 'messages'), orderBy('date', 'asc'), limit(300)));
    lotGlobal.sur(K.messages(p.id), () => planifierNav());
  }
};

let minuteurNav = null;
const planifierNav = () => { clearTimeout(minuteurNav); minuteurNav = setTimeout(() => { suivreConversations(); construireNavigation(); }, 80); };
[K.ticketsTous, K.tachesToutes, K.validationsToutes, K.documentsTous, K.demandesProjet, K.projets, K.organisations, K.reunionsToutes, K.fichiersTous, K.profil, K.maintenanceToute, K.campagnesToutes, K.anomaliesToutes].forEach((cle) => magasin.sur(cle, planifierNav));
surCle(planifierNav);
construireNavigation();

enregistrerRecherche((terme) => {
  const projets = magasin.lire(K.projets) || [];
  /* Une table plutôt qu'une recherche linéaire par élément : à cinquante
     projets et quelques milliers d'items, la frappe devenait saccadée. */
  const nomsProjets = new Map(projets.map((p) => [p.id, p.nom]));
  const nomProjet = (pid) => nomsProjets.get(pid) || '';
  const items = [];
  if (!terme) {
    items.push({ groupe: 'Créer', libelle: 'Nouveau projet', icone: 'plus', chemin: '/projets/nouveau' });
    items.push({ groupe: 'Créer', libelle: 'Nouveau client', icone: 'entreprise', chemin: '/clients/nouveau' });
    items.push({ groupe: 'Créer', libelle: 'Noter une idée', icone: 'ampoule', chemin: '/a-faire?noter=1' });
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

definir([
  { chemin: '/', vue: (ctx) => adminAccueil.vue(ctx, env) },
  { chemin: '/clients', vue: (ctx) => adminClients.liste(ctx, env) },
  { chemin: '/clients/nouveau', vue: (ctx) => adminClients.nouveau(ctx, env) },
  { chemin: '/clients/:id', vue: (ctx) => adminClients.detail(ctx, env) },
  { chemin: '/projets', vue: (ctx) => adminProjets.liste(ctx, env) },
  { chemin: '/projets/nouveau', vue: (ctx) => adminProjets.nouveau(ctx, env) },
  { chemin: '/a-faire', vue: (ctx) => adminAFaire.liste(ctx, env) },
  { chemin: '/a-faire/:id', vue: (ctx) => adminAFaire.detail(ctx, env) },
  { chemin: '/projets/:id', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  { chemin: '/projets/:id/taches/:tid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  { chemin: '/projets/:id/brique/:cid', vue: (ctx) => brique.vue(ctx, env) },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/nouveaux-projets', vue: (ctx) => nouveauProjet.liste(ctx, env) },
  { chemin: '/nouveaux-projets/:id', vue: (ctx) => nouveauProjet.detail(ctx, env) },
  { chemin: '/demandes', vue: (ctx) => adminDemandes.vue(ctx, env) },
  { chemin: '/taches', vue: (ctx) => adminTaches.vue(ctx, env) },
  { chemin: '/tests', vue: (ctx) => tests.vue(ctx, env) },
  /* Le tableau vit dans Tests : ses anciennes adresses y mènent. */
  { chemin: '/tests/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/tableau', vue: (ctx) => tableau.ancienne(ctx) },
  { chemin: '/planning', vue: (ctx) => adminPlanning.vue(ctx, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/validations', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/validations/:vid', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/documents', vue: (ctx) => documents.vue(ctx, env) },
  { chemin: '/finances', vue: (ctx) => adminFinances.vue(ctx, env) },
  { chemin: '/finances/:did', vue: (ctx) => adminFinances.vue(ctx, env) },
  { chemin: '/maintenance', vue: (ctx) => maintenance.vue(ctx, env) },
  { chemin: '/activite', vue: (ctx) => adminActivite.vue(ctx, env) },
  { chemin: '/archives', vue: (ctx) => adminArchives.vue(ctx, env) },
  { chemin: '/parametres', vue: (ctx) => adminParametres.vue(ctx, env) },
  { chemin: '/moi', vue: (ctx) => parametres.vue(ctx, env) },
], { defaut: '/', cible: vue });

demarrer();
void OUVERTS;
