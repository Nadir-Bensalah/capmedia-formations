/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée du cockpit d'équipe
   ========================================================================== */

import { exigerSession, $, OUVERTS, ATTEND_EQUIPE, FACTURES_DUES, joursAvant } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche } from './coquille.js';
import { definir, demarrer } from './routeur.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K } from './donnees.js';
import { surCle } from './serveur.js';

import * as adminAccueil from './vues/admin-accueil.js';
import * as adminClients from './vues/admin-clients.js';
import * as adminProjets from './vues/admin-projets.js';
import * as projet from './vues/projet.js';
import * as demande from './vues/demande.js';
import * as adminDemandes from './vues/admin-demandes.js';
import * as adminTaches from './vues/admin-taches.js';
import * as adminPlanning from './vues/admin-planning.js';
import * as messages from './vues/messages.js';
import * as adminValidations from './vues/admin-validations.js';
import * as adminFinances from './vues/admin-finances.js';
import * as documents from './vues/documents.js';
import * as adminActivite from './vues/admin-activite.js';
import * as adminArchives from './vues/admin-archives.js';
import * as adminParametres from './vues/admin-parametres.js';
import * as nouveauProjet from './vues/nouveau-projet.js';
import * as parametres from './vues/parametres.js';

const session = await exigerSession();
if (!session) throw new Error('session absente');

if (!session.equipe) {
  location.replace(`./app${location.hash || ''}`);
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
  const documents = magasin.lire(K.documentsTous) || [];
  const demandesProjet = magasin.lire(K.demandesProjet) || [];
  const nouvelles = tickets.filter((t) => t.statut === 'nouveau').length;
  const aNous = tickets.filter((t) => ATTEND_EQUIPE.includes(t.statut)).length;
  const enRetard = taches.filter((t) => t.statut !== 'terminee' && t.echeance && joursAvant(t.echeance) < 0).length;
  const attendues = validations.filter((v) => v.statut === 'en-attente').length;
  const impayees = documents.filter((d) => d.type === 'facture' && FACTURES_DUES.includes(d.statut)).length;
  const preprojets = demandesProjet.filter((d) => ['nouvelle', 'discussion', 'qualification', 'estimation'].includes(d.statut)).length;

  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Portefeuille',
      items: [
        { chemin: '/clients', libelle: 'Clients', icone: 'entreprise' },
        { chemin: '/projets', libelle: 'Projets', icone: 'projets' },
        { chemin: '/nouveaux-projets', libelle: 'Nouveaux projets', icone: 'sparkle', compte: { n: preprojets, vif: preprojets > 0 } },
      ],
    },
    {
      titre: 'Travail',
      items: [
        { chemin: '/demandes', libelle: 'Demandes', icone: 'inbox', compte: { n: aNous, vif: nouvelles > 0 } },
        { chemin: '/taches', libelle: 'Tâches', icone: 'taches', compte: { n: enRetard, vif: enRetard > 0 } },
        { chemin: '/planning', libelle: 'Planning', icone: 'calendrier' },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages' },
        { chemin: '/validations', libelle: 'Validations', icone: 'valider', compte: { n: attendues, vif: false } },
        { chemin: '/documents', libelle: 'Documents', icone: 'documents' },
      ],
    },
    {
      titre: 'Gestion',
      items: [
        { chemin: '/finances', libelle: 'Devis, factures, paiements', icone: 'finances', compte: { n: impayees, vif: impayees > 0 } },
        { chemin: '/activite', libelle: 'Activité', icone: 'activite' },
        { chemin: '/archives', libelle: 'Archives', icone: 'archive' },
        { chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' },
      ],
    },
  ]);
};

let minuteurNav = null;
const planifierNav = () => { clearTimeout(minuteurNav); minuteurNav = setTimeout(construireNavigation, 80); };
[K.ticketsTous, K.tachesToutes, K.validationsToutes, K.documentsTous, K.demandesProjet].forEach((cle) => magasin.sur(cle, planifierNav));
surCle(planifierNav);
construireNavigation();

enregistrerRecherche((terme) => {
  const projets = magasin.lire(K.projets) || [];
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  if (!terme) {
    items.push({ groupe: 'Créer', libelle: 'Nouveau projet', icone: 'plus', chemin: '/projets/nouveau' });
    items.push({ groupe: 'Créer', libelle: 'Nouveau client', icone: 'entreprise', chemin: '/clients/nouveau' });
    items.push({ groupe: 'Aller à', libelle: 'Demandes à traiter', icone: 'inbox', chemin: '/demandes' });
    items.push({ groupe: 'Aller à', libelle: 'Validations attendues', icone: 'valider', chemin: '/validations' });
  }
  (magasin.lire(K.organisations) || []).forEach((o) => items.push({ groupe: 'Clients', libelle: o.nom, sous: o.entreprise, icone: 'entreprise', chemin: `/clients/${o.id}` }));
  projets.forEach((p) => items.push({ groupe: 'Projets', libelle: p.nom, sous: p.ref, icone: 'projets', chemin: `/projets/${p.id}` }));
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
  { chemin: '/projets/:id', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  { chemin: '/projets/:id/taches/:tid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/nouveaux-projets', vue: (ctx) => nouveauProjet.liste(ctx, env) },
  { chemin: '/nouveaux-projets/:id', vue: (ctx) => nouveauProjet.detail(ctx, env) },
  { chemin: '/demandes', vue: (ctx) => adminDemandes.vue(ctx, env) },
  { chemin: '/taches', vue: (ctx) => adminTaches.vue(ctx, env) },
  { chemin: '/planning', vue: (ctx) => adminPlanning.vue(ctx, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/validations', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/validations/:vid', vue: (ctx) => adminValidations.vue(ctx, env) },
  { chemin: '/documents', vue: (ctx) => documents.vue(ctx, env) },
  { chemin: '/finances', vue: (ctx) => adminFinances.vue(ctx, env) },
  { chemin: '/finances/:did', vue: (ctx) => adminFinances.vue(ctx, env) },
  { chemin: '/activite', vue: (ctx) => adminActivite.vue(ctx, env) },
  { chemin: '/archives', vue: (ctx) => adminArchives.vue(ctx, env) },
  { chemin: '/parametres', vue: (ctx) => adminParametres.vue(ctx, env) },
  { chemin: '/moi', vue: (ctx) => parametres.vue(ctx, env) },
], { defaut: '/', cible: vue });

demarrer();
void OUVERTS;
