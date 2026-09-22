/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée de l'espace client
   Ouvre la session, monte la coquille, déclare les routes, branche la
   navigation vivante et la recherche.
   ========================================================================== */

import { exigerSession, $, echapper, prenom, nomAffiche, OUVERTS, ATTEND_CLIENT, FACTURES_DUES, joursAvant } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche } from './coquille.js';
import { definir, demarrer, courant, surChangement } from './routeur.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K, G, agreger, enAttenteDeVous, nonLusProjet, ecrire } from './donnees.js';
import { icone } from './icones.js';
import { avatarProjet } from './ui.js';

import * as accueil from './vues/accueil.js';
import * as projet from './vues/projet.js';
import * as demande from './vues/demande.js';
import * as brique from './vues/brique.js';
import * as messages from './vues/messages.js';
import * as valider from './vues/valider.js';
import * as calendrier from './vues/calendrier.js';
import * as tests from './vues/tests.js';
import * as finances from './vues/finances.js';
import * as documents from './vues/documents.js';
import * as parametres from './vues/parametres.js';
import * as nouveauProjet from './vues/nouveau-projet.js';

const session = await exigerSession();
if (!session) throw new Error('session absente');

/* Un compte d'équipe a son propre cockpit. */
if (session.equipe) {
  location.replace(`./admin${location.hash || ''}`);
  throw new Error('redirection');
}

const env = { session, role: 'client' };
const lotGlobal = magasin.lot();
abonnerGlobal(lotGlobal, session);

/* --- La coquille et la navigation --------------------------------------- */

const { vue } = monterCoquille({ session, role: 'client', groupes: [], sortie: $('#racine') });

const compter = () => {
  const projets = magasin.lire(K.projets) || session.projets;
  const attente = enAttenteDeVous({
    projets, tickets: agreger(session, G.tickets), validations: agreger(session, G.validations),
    documents: agreger(session, G.documents), taches: agreger(session, G.taches), blocages: agreger(session, G.blocages),
  });
  const profil = magasin.lire(K.profil);
  const nonLus = projets.reduce((s, p) => s + nonLusProjet(magasin.lire(K.messages(p.id)) || [], profil, p.id, session.utilisateur.uid), 0);
  /* L'entrée Tests n'apparaît chez le client que si des scénarios le
     concernent : un menu qui ouvre sur une page vide inquiète plus qu'il
     n'informe. */
  const scenariosDuClient = projets.reduce((n, p) => n + (magasin.lire(K.scenarios(p.id)) || []).filter((x) => x.actif !== false).length, 0);
  return { projets, attente, nonLus, profil, scenariosDuClient };
};

/* Les sections d'un projet, dans l'ordre de ses onglets. */
const SECTIONS = [
  { cle: 'etapes',  libelle: 'Feuille de route', icone: 'route' },
  { cle: 'taches',  libelle: 'Tâches',      icone: 'taches',   compte: (pid) => (magasin.lire(K.taches(pid)) || []).filter((t) => !t.archive && t.statut !== 'terminee').length },
  { cle: 'demandes', libelle: 'Demandes',   icone: 'demandes', compte: (pid) => (magasin.lire(K.tickets(pid)) || []).filter((t) => !t.archive && OUVERTS.includes(t.statut)).length },
  { cle: 'fichiers', libelle: 'Fichiers',   icone: 'fichiers', compte: (pid) => (magasin.lire(K.fichiers(pid)) || []).filter((f) => !f.archive).length },
  { cle: 'releases', libelle: 'Versions',   icone: 'releases', compte: (pid) => (magasin.lire(K.releases(pid)) || []).length },
  { cle: 'liens',   libelle: 'Liens',       icone: 'liens' },
  { cle: 'reunions', libelle: 'Réunions',   icone: 'reunions' },
  { cle: 'notes',   libelle: 'Décisions',   icone: 'note' },
  { cle: 'activite', libelle: 'Activité',   icone: 'activite' },
];

/* Le projet où l'on se trouve, quelle que soit la profondeur de l'adresse. */
const projetOuvert = () => {
  const m = /^\/projets\/([^/]+)/.exec(courant().chemin || '');
  return m ? m[1] : '';
};
const ouvertSur = (pid) => projetOuvert() === pid;

const construireNavigation = () => {
  const { projets, attente, nonLus, scenariosDuClient } = compter();
  const parProjet = (pid) => attente.filter((a) => a.projet === pid).length;
  const validations = attente.filter((a) => a.genre === 'validation').length;
  const dues = attente.filter((a) => a.genre === 'facture' || a.genre === 'devis').length;
  /* Le gris dit combien il y en a, le rouge combien attendent votre main. */
  const ouverts = agreger(session, G.tickets).filter((t) => OUVERTS.includes(t.statut));
  const aValider = agreger(session, G.validations).filter((v) => v.statut === 'en-attente');
  const pieces = agreger(session, G.documents);
  const fichiers = agreger(session, G.fichiers);
  const reunionsAVenir = agreger(session, G.reunions).filter((r) => joursAvant(r.date) >= 0);

  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Vos projets',
      items: [
        ...projets.filter((p) => !p.archive).flatMap((p) => [{
          /* Le projet porte son propre logo : dans une liste de plusieurs, l'œil
             retrouve le sien avant d'avoir lu le nom. */
          chemin: `/projets/${p.id}`, libelle: p.nom, ecusson: avatarProjet(p, 'mini'),
          compte: { total: ouverts.filter((t) => t.projet === p.id).length, neuf: parProjet(p.id) },
        },
        /* Les sections d'un projet sont à lui : elles se déplient sous son
           nom quand on y entre, et se replient quand on en sort. Les cinq
           pages du groupe « Suivi » restent à plat : elles rassemblent
           tous les projets à la fois, et n'appartiennent à aucun. */
        ...(ouvertSur(p.id) ? SECTIONS.map((sec) => ({
          chemin: `/projets/${p.id}/${sec.cle}`, libelle: sec.libelle, icone: sec.icone, sous: true,
          compte: { total: sec.compte ? sec.compte(p.id) : 0 },
        })) : [])]),
        { chemin: '/nouveau-projet', libelle: 'Demander un projet', icone: 'plus' },
      ],
    },
    {
      titre: 'Suivi',
      items: [
        { chemin: '/valider', libelle: 'En attente de vous', icone: 'valider', compte: { total: attente.length, neuf: attente.length } },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages', compte: { total: 0, neuf: nonLus } },
        { chemin: '/calendrier', libelle: 'Calendrier', icone: 'calendrier', compte: { total: reunionsAVenir.length } },
        ...(scenariosDuClient ? [{ chemin: '/tests', libelle: 'Tests', icone: 'bug', compte: { total: scenariosDuClient } }] : []),
        { chemin: '/finances', libelle: 'Devis et factures', icone: 'finances', compte: { total: pieces.length, neuf: dues } },
        { chemin: '/documents', libelle: 'Documents', icone: 'documents', compte: { total: fichiers.length } },
      ],
    },
    { titre: 'Compte', items: [{ chemin: '/parametres', libelle: 'Paramètres', icone: 'parametres' }] },
  ]);
};

let minuteurNav = null;
const planifierNav = () => { clearTimeout(minuteurNav); minuteurNav = setTimeout(construireNavigation, 80); };
[K.projets, K.profil, ...session.projets.flatMap((p) => [K.tickets(p.id), K.validations(p.id), K.documents(p.id), K.taches(p.id), K.blocages(p.id), K.messages(p.id)])]
  .forEach((cle) => magasin.sur(cle, planifierNav));
construireNavigation();
surChangement(construireNavigation);

/* --- La recherche ------------------------------------------------------- */

enregistrerRecherche((terme) => {
  const projets = magasin.lire(K.projets) || session.projets;
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  if (!terme) {
    items.push({ groupe: 'Actions', libelle: 'Nouvelle demande', icone: 'plus', chemin: projets[0] ? `/projets/${projets[0].id}/nouvelle-demande` : '/' });
    items.push({ groupe: 'Actions', libelle: 'Envoyer un message', icone: 'messages', chemin: '/messages' });
    items.push({ groupe: 'Actions', libelle: 'Voir ce qui vous attend', icone: 'valider', chemin: '/valider' });
  }
  projets.forEach((p) => items.push({ groupe: 'Projets', libelle: p.nom, sous: p.ref, icone: 'projets', chemin: `/projets/${p.id}` }));
  agreger(session, G.tickets).forEach((t) => items.push({ groupe: 'Demandes', libelle: t.titre, sous: `${t.numero || ''} ${nomProjet(t.projet)}`.trim(), icone: 'demandes', chemin: `/projets/${t.projet}/demandes/${t.id}` }));
  agreger(session, G.taches).forEach((t) => items.push({ groupe: 'Tâches', libelle: t.titre, sous: nomProjet(t.projet), icone: 'taches', chemin: `/projets/${t.projet}/taches/${t.id}` }));
  agreger(session, G.fichiers).forEach((f) => items.push({ groupe: 'Fichiers', libelle: f.nom, sous: nomProjet(f.projet), icone: 'fichiers', chemin: `/projets/${f.projet}/fichiers` }));
  agreger(session, G.documents).forEach((d) => items.push({ groupe: 'Devis et factures', libelle: `${d.numero || ''} ${d.libelle || ''}`.trim(), sous: nomProjet(d.projet), icone: 'receipt', chemin: `/finances/${d.id}` }));
  agreger(session, G.reunions).forEach((r) => items.push({ groupe: 'Réunions', libelle: r.titre, sous: nomProjet(r.projet), icone: 'reunions', chemin: `/projets/${r.projet}/reunions` }));
  agreger(session, G.releases).forEach((r) => items.push({ groupe: 'Versions', libelle: `${r.plateforme || ''} ${r.version || ''}`.trim(), sous: nomProjet(r.projet), icone: 'releases', chemin: `/projets/${r.projet}/releases` }));
  return items;
});

/* --- Les routes --------------------------------------------------------- */

definir([
  { chemin: '/', vue: (ctx) => accueil.vue(ctx, env) },
  { chemin: '/projets/:id', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  { chemin: '/demande/:tid', vue: (ctx) => demande.resoudre(ctx, env) },
  { chemin: '/projets/:id/taches/:tid', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  { chemin: '/projets/:id/brique/:cid', vue: (ctx) => brique.vue(ctx, env) },
  { chemin: '/projets/:id/:onglet', cle: (c) => `projet:${c.params.id}`, vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/valider', vue: (ctx) => valider.vue(ctx, env) },
  { chemin: '/valider/:vid', vue: (ctx) => valider.vue(ctx, env) },
  { chemin: '/calendrier', vue: (ctx) => calendrier.vue(ctx, env) },
  { chemin: '/tests', vue: (ctx) => tests.vue(ctx, env) },
  { chemin: '/finances', vue: (ctx) => finances.vue(ctx, env) },
  { chemin: '/finances/:did', vue: (ctx) => finances.vue(ctx, env) },
  { chemin: '/documents', vue: (ctx) => documents.vue(ctx, env) },
  { chemin: '/parametres', vue: (ctx) => parametres.vue(ctx, env) },
  { chemin: '/nouveau-projet', vue: (ctx) => nouveauProjet.nouvelle(ctx, env) },
  { chemin: '/nouveaux-projets/:id', vue: (ctx) => nouveauProjet.detail(ctx, env) },
], { defaut: '/', cible: vue });

/* La dernière visite sert à dire « depuis votre passage ». On la note au
   départ de la session, et on garde la précédente sous la main. */
magasin.attendre(K.profil).then((profil) => {
  env.derniereVisite = profil && profil.derniereVisite ? profil.derniereVisite : null;
  ecrire.majProfil(session.utilisateur.uid, { derniereVisite: new Date(), nom: nomAffiche(session) }).catch(() => {});
}).catch(() => {});

demarrer();

void echapper; void prenom; void icone; void OUVERTS; void ATTEND_CLIENT; void FACTURES_DUES;
