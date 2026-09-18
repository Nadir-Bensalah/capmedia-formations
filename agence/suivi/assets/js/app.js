/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'entrée de l'espace client
   Ouvre la session, monte la coquille, déclare les routes, branche la
   navigation vivante et la recherche.
   ========================================================================== */

import { exigerSession, $, echapper, prenom, nomAffiche, OUVERTS, ATTEND_CLIENT, FACTURES_DUES } from './noyau.js';
import { monterCoquille, definirNavigation, enregistrerRecherche } from './coquille.js';
import { definir, demarrer } from './routeur.js';
import * as magasin from './magasin.js';
import { abonnerGlobal, K, G, agreger, enAttenteDeVous, nonLusProjet, ecrire } from './donnees.js';
import { icone } from './icones.js';

import * as accueil from './vues/accueil.js';
import * as projet from './vues/projet.js';
import * as demande from './vues/demande.js';
import * as messages from './vues/messages.js';
import * as valider from './vues/valider.js';
import * as calendrier from './vues/calendrier.js';
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
  return { projets, attente, nonLus, profil };
};

const construireNavigation = () => {
  const { projets, attente, nonLus } = compter();
  const parProjet = (pid) => attente.filter((a) => (a.chemin || '').includes(`/projets/${pid}/`) || (a.chemin || '') === `/projets/${pid}`).length;
  const validations = attente.filter((a) => a.genre === 'validation').length;
  const dues = attente.filter((a) => a.genre === 'facture' || a.genre === 'devis').length;
  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Accueil', icone: 'accueil', exact: true }] },
    {
      titre: 'Vos projets',
      items: [
        ...projets.filter((p) => !p.archive).map((p) => ({ chemin: `/projets/${p.id}`, libelle: p.nom, icone: 'projets', compte: { n: parProjet(p.id), vif: parProjet(p.id) > 0 } })),
        { chemin: '/nouveau-projet', libelle: 'Demander un nouveau projet', icone: 'plus' },
      ],
    },
    {
      titre: 'Suivi',
      items: [
        { chemin: '/valider', libelle: 'À valider', icone: 'valider', compte: { n: validations, vif: validations > 0 } },
        { chemin: '/messages', libelle: 'Messages', icone: 'messages', compte: { n: nonLus, vif: nonLus > 0 } },
        { chemin: '/calendrier', libelle: 'Calendrier', icone: 'calendrier' },
        { chemin: '/finances', libelle: 'Devis et factures', icone: 'finances', compte: { n: dues, vif: dues > 0 } },
        { chemin: '/documents', libelle: 'Documents', icone: 'documents' },
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
  { chemin: '/projets/:id', vue: (ctx) => projet.vue({ ...ctx, onglet: 'apercu' }, env) },
  { chemin: '/projets/:id/nouvelle-demande', vue: (ctx) => demande.nouvelle(ctx, env) },
  { chemin: '/projets/:id/demandes/:tid', vue: (ctx) => demande.detail(ctx, env) },
  { chemin: '/demande/:tid', vue: (ctx) => demande.resoudre(ctx, env) },
  { chemin: '/projets/:id/taches/:tid', vue: (ctx) => projet.vue({ ...ctx, onglet: 'taches' }, env) },
  { chemin: '/projets/:id/:onglet', vue: (ctx) => projet.vue({ ...ctx, onglet: ctx.params.onglet }, env) },
  { chemin: '/messages', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/messages/:pid', vue: (ctx) => messages.vue(ctx, env) },
  { chemin: '/valider', vue: (ctx) => valider.vue(ctx, env) },
  { chemin: '/valider/:vid', vue: (ctx) => valider.vue(ctx, env) },
  { chemin: '/calendrier', vue: (ctx) => calendrier.vue(ctx, env) },
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
