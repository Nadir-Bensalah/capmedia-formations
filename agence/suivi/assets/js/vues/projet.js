/* ==========================================================================
   La page d'un projet : aperçu, composants, feuille de route, tâches,
   demandes, fichiers, versions, liens, réunions, notes, activité.
   Partagée par le client et par l'équipe. L'équipe voit en plus les
   éditeurs, l'interne, les points bloquants et la santé.
   ========================================================================== */

import { friseDevis, devisAvecEtapes, brancherFrise } from './frise.js';
import { lienReunion } from '../noyau.js';
import {
  echapper, dateCourte, dateHeure, depuis, heure, montant, pluriel, joursAvant, echeance as calcEcheance, enParagraphes, avecLiens, parDateDesc, parDateAsc, borner,
  STATUTS_PROJET, STATUTS_COMPOSANT, TYPES_COMPOSANT, STATUTS_ETAPE, STATUTS_TACHE, PRIORITES, STATUTS, TYPES, URGENCES, OUVERTS, ATTEND_CLIENT,
  CATEGORIES_FICHIER, CATEGORIES_CLIENT, CATEGORIES_LIEN, STATUTS_RELEASE, TYPES_CHANGEMENT, TYPES_NOTE, SANTES, STATUTS_VALIDATION, QUALIFICATIONS, statutProjet, PLATEFORMES, nomsContacts, contactsProjet, PORTEES_DEVIS, age,
  verdictDelai, reportsDe, dateOrigine, MOTIFS_REPORT, dateLongue, enDate,
  STATUTS_CAMPAGNE, STATUTS_ANOMALIE, peut, libellePlateforme, estResponsable
} from '../noyau.js';
import {
  icone, pastille, pastilleTexte, puce, pucePlateforme, iconePlateforme, tonPlateforme, avatarProjet, avatar, progression, anneau, ligne, vide, fait, chronoItem, parJour, squelette, titrePage,
  echeanceHtml, modale, confirmer, toast, sur, menu, fichierHtml, brancherPieces, depot, lireForme, valider, obligatoire, agir, encart, optionsDe, pieceHtml,
  verdictHtml, anneauOuPas, progressionOuPas, copier, reglerBarreOnglets,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, nouvelId, interneDuProjet, abonnerProjet, progressionProjet, jalonCourant, jalonSuivant, prochaineReunion, reunionAVenir, etatVersions, activiteDepuis, enAttenteDeVous, peutRepondreValidation, parStatut, risquesProjet, MODES_PROGRESSION, trierEtapes, phasesTriees, notesPartageesDuProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { notesPartageesHtml, gesteNoteDemande } from './notes-client.js';
import { naviguer } from '../routeur.js';
import { editer, supprimer } from './editeurs.js';
import { ongletSuggestions, apercuSuggestionHtml, gesteSuggestion, marquerVues, compteOnglet as compteSuggestions, estPubliee as suggestionPubliee } from './suggestions.js';
import { appelServeur } from '../serveur.js';
import { activiteHtml } from './accueil.js';
import { basculerAFaire } from './admin-a-faire.js';
import { accesHtml, gesteAcces } from './acces-client.js';
import { personnesHtml } from './personnes.js';
import { telechargerICS } from './calendrier.js';
import { etatPave, paveHtml, reafficherHtml, brancherPaves } from '../pave-attente.js';

/* Le coffre-fort ne se charge qu'à l'ouverture de son onglet : son
   chiffrement et sa liste de mots ne pèsent pas sur les autres pages. */
let moduleCoffre = null;
const chargerCoffre = () => { if (!moduleCoffre) moduleCoffre = import('./coffre.js'); return moduleCoffre; };
const voitLeCoffre = (env, projet) => env.role === 'equipe' || Boolean(projet && estResponsable(env.session, projet));
const demonterCoffre = () => { if (moduleCoffre) moduleCoffre.then((m) => m.demonterCoffre()).catch(() => {}); };

/* Les onglets, dans l'ordre des sections du rail (app.js, SECTIONS) :
   l'aperçu est le projet lui-même, puis les neuf sections. « Tests » ne
   s'ajoute, pour le client, que s'il y a des scénarios ou des campagnes :
   un onglet qui ouvre sur du vide inquiète plus qu'il n'informe. */
const ONGLETS = [
  { cle: 'apercu', libelle: 'Aperçu', icone: 'accueil' },
  { cle: 'etapes', libelle: 'Feuille de route', icone: 'route' },
  { cle: 'taches', libelle: 'Tâches', icone: 'taches' },
  { cle: 'demandes', libelle: 'Demandes', icone: 'demandes' },
  { cle: 'fichiers', libelle: 'Fichiers', icone: 'fichiers' },
  { cle: 'releases', libelle: 'Versions', icone: 'releases' },
  { cle: 'liens', libelle: 'Ressources', icone: 'liens' },
  /* Ce que Capmedia propose : le client ne voit l'onglet que s'il y a une suggestion publiée. */
  { cle: 'suggestions', libelle: 'Suggestions', icone: 'ampoule' },
  /* Les accès du client, chiffrés : l'équipe et le responsable seuls. */
  { cle: 'coffre', libelle: 'Coffre-fort', icone: 'cadenas' },
  { cle: 'reunions', libelle: 'Réunions', icone: 'reunions' },
  { cle: 'notes', libelle: 'Décisions', icone: 'note' },
  { cle: 'tests', libelle: 'Tests', icone: 'check' },
  { cle: 'activite', libelle: 'Activité', icone: 'activite' },
];
const ongletsVisibles = (d, equipe, env) => ONGLETS.filter((o) => (o.cle !== 'tests' || equipe || (d && (d.scenarios.length || d.campagnes.length)))
  && (o.cle !== 'coffre' || (env && voitLeCoffre(env, d && d.projet)))
  && (o.cle !== 'suggestions' || equipe || (d && (d.suggestions || []).some(suggestionPubliee))));

/* La conversation vit en bulle, montée pour toutes les pages d'un projet
   par un module global. Depuis une fiche, on lui passe un début de
   phrase : la bulle s'ouvre avec, et le client n'a plus qu'à finir. */
const ouvrirBulle = (pid, texte) => document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: pid, texte } }));

const lireTout = (pid) => ({
  projet: magasin.lire(K.projet(pid)),
  composants: (magasin.lire(K.composants(pid)) || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
  jalons: (magasin.lire(K.jalons(pid)) || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
  scenarios: (magasin.lire(K.scenarios(pid)) || []).filter((x) => x.actif !== false).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
  campagnes: magasin.lire(K.campagnes(pid)) || [],
  anomalies: magasin.lire(K.anomalies(pid)) || [],
  liens: magasin.lire(K.liens(pid)) || [],
  taches: (magasin.lire(K.taches(pid)) || []).filter((t) => !t.archive),
  tickets: (magasin.lire(K.tickets(pid)) || []).filter((t) => !t.archive),
  validations: magasin.lire(K.validations(pid)) || [],
  fichiers: (magasin.lire(K.fichiers(pid)) || []).filter((f) => !f.archive),
  releases: magasin.lire(K.releases(pid)) || [],
  reunions: magasin.lire(K.reunions(pid)) || [],
  notes: magasin.lire(K.notes(pid)) || [],
  blocages: magasin.lire(K.blocages(pid)) || [],
  documents: magasin.lire(K.documents(pid)) || [],
  paiements: magasin.lire(K.paiements(pid)) || [],
  activite: (magasin.lire(K.activite(pid)) || []).slice().sort(parDateDesc('date')),
  equipe: magasin.lire(K.equipe) || [],
  interlocuteurs: magasin.lire(K.interlocuteurs(pid)) || [],
  /* Les notes que le client a partagées (équipe seule : un client n'a
     jamais cette clé, la liste est vide chez lui). */
  notesPartagees: notesPartageesDuProjet(pid),
  suggestions: magasin.lire(K.suggestions(pid)) || [],
});

const nomEquipe = (equipe, uid) => ((equipe.find((e) => e.id === uid) || {}).nom || '');

/* ==========================================================================
   La vue
   ========================================================================== */

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  /* « roadmap » a été l'adresse de la feuille de route : un lien parti par
     e-mail il y a six mois doit toujours y mener. */
  const ongletDe = (voulu) => {
    const v = voulu === 'roadmap' ? 'etapes' : voulu;
    if (ONGLETS.some((o) => o.cle === v)) return v;
    /* Deux onglets de l'équipe seule : les parties, et l'accès du client. */
    if (env.role === 'equipe' && (v === 'composants' || v === 'acces')) return v;
    return 'apercu';
  };
  let onglet = ongletDe(ctx.onglet);
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;

  const cles = [K.projet(pid), K.composants(pid), K.jalons(pid), K.liens(pid), K.taches(pid), K.tickets(pid), K.validations(pid), K.fichiers(pid), K.releases(pid), K.reunions(pid), K.notes(pid), K.blocages(pid), K.documents(pid), K.paiements(pid), K.montants(pid), K.activite(pid), K.equipe,
    K.scenarios(pid), K.planPresentation(pid), K.campagnes(pid), K.anomalies(pid), K.suggestions(pid), ...(env.role === 'equipe' ? [K.projetsInternes, K.interlocuteurs(pid), K.notesPartagees] : [])];
  abonnerProjet(lot, pid, env.role);

  /* Une fiche ouverte par son adresse : une tâche (taches/:tid), une
     réunion (reunions/:rid) ou une version (releases/:rid). C'est ce que
     visent les notifications, les lettres et la recherche. */
  const ficheDemandee = (params, o) => {
    if (params.tid && o === 'taches') return { genre: 'tache', id: params.tid };
    if (params.rid && o === 'reunions') return { genre: 'reunion', id: params.rid };
    if (params.rid && o === 'releases') return { genre: 'release', id: params.rid };
    return null;
  };
  let detailOuvert = ficheDemandee(ctx.params, onglet);
  /* « ?blocage=<id> » : la fiche d'un point bloquant s'ouvre à l'arrivée
     (lien de « En attente de vous », de la notification, de la lettre). */
  let blocageOuvert = (ctx.requete || {}).blocage || null;
  /* « ?filtre=pour-vous » sur la liste des demandes : le filtre « Pour
     vous » est posé avant le dessin (lien de « Tenue des délais »). */
  const poserFiltre = (requete) => { if (requete && requete.filtre === 'pour-vous') { try { sessionStorage.setItem(`suivi:filtre-demandes:${pid}`, 'moi'); } catch (e) { /* stockage refusé */ } } };
  poserFiltre(ctx.requete);
  let derniereEmpreinte = '';
  /* L'empreinte du magasin ne relit pas les rôles d'un projet : un client
     qui perd la responsabilité doit pourtant perdre le coffre tout de
     suite. Son droit au coffre entre donc dans l'empreinte de la page. */
  const empreintePage = () => `${magasin.empreinte(cles)}|${onglet}|${voitLeCoffre(env, magasin.lire(K.projet(pid))) ? 'coffre' : ''}|${equipe ? '' : `${etatPave(`projet:${pid}`)}${etatPave('accueil')}`}`;

  const rendre = (force = false) => {
    const d = lireTout(pid);
    const projet = d.projet;
    if (projet === undefined && !magasin.erreur(K.projet(pid))) return;
    if (!force && empreintePage() === derniereEmpreinte) return;
    if (projet === null || projet === undefined) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: "Il a peut-être été archivé, ou vous n'y avez plus accès.", action: '<a class="btn btn-secondaire" href="#/">Retour à l\'accueil</a>' })}</div>`;
      return;
    }
    titrePage(projet.nom);
    const onglets = ongletsVisibles(d, equipe, env);
    if (!onglets.some((o) => o.cle === onglet) && ONGLETS.some((o) => o.cle === onglet)) onglet = 'apercu';
    filAriane([{ libelle: equipe ? 'Projets' : 'Accueil', chemin: equipe ? '/projets' : '/' }, { libelle: projet.nom, chemin: `/projets/${pid}` }, ...(onglet !== 'apercu' ? [{ libelle: (ONGLETS.find((o) => o.cle === onglet) || { libelle: onglet === 'acces' ? 'Accès client' : 'Les parties' }).libelle }] : [])]);

    const prog = progressionProjet(projet, d.jalons, { composants: d.composants, taches: d.taches });
    const risques = risquesProjet({ jalons: d.jalons, blocages: d.blocages, taches: d.taches, tickets: d.tickets });
    const delai = verdictDelai(projet.cible, { clos: statutProjet(projet) === 'termine', risques });
    const ouverts = d.tickets.filter((t) => OUVERTS.includes(t.statut));
    const attente = enAttenteDeVous({ projets: [projet], tickets: d.tickets, validations: d.validations, documents: d.documents, taches: d.taches, blocages: d.blocages });
    const comptes = {
      taches: d.taches.filter((t) => t.statut !== 'terminee').length,
      demandes: ouverts.length,
      fichiers: d.fichiers.length,
      releases: d.releases.length,
      liens: d.liens.length,
      reunions: d.reunions.filter(reunionAVenir).length,
      notes: d.notes.length,
      tests: d.scenarios.length,
      suggestions: compteSuggestions(d.suggestions, env),
    };

    sortie.innerHTML = `<div class="page">
      <header class="page-tete page-tete--projet">
        <div class="rang" style="gap:16px;align-items:flex-start;min-width:0">
          ${avatarProjet(projet, 'grand')}
          <div style="min-width:0">
            <p class="surtitre">${echapper([projet.ref, projet.interne ? 'Mon projet' : ((projet.client || {}).entreprise || nomsContacts(projet)), projet.type && ({ ...TYPES_COMPOSANT, ...{ 'application-mobile': 'Application mobile', 'site-vitrine': 'Site vitrine', 'e-commerce': 'E-commerce', 'saas': 'SaaS' } })[projet.type]].filter(Boolean).join(' · '))}</p>
            <h1 style="margin-top:2px">${echapper(projet.nom)}</h1>
            <div class="rang tete-suivi">
              ${pastille(STATUTS_PROJET, statutProjet(projet))}
              ${projet.interne ? '<span class="etiquette">Mon projet</span>' : ''}
              ${equipe && projet.aFaire && !projet.archive ? `<a class="etiquette etiquette--lien" href="#/a-faire/${echapper(pid)}">${icone('ampoule')} Projet à faire</a>` : ''}
              ${equipe && !projet.interne && nomsContacts(projet) ? `<span class="puce">${icone('utilisateurs')} ${echapper(nomsContacts(projet))}</span>` : ''}
              ${equipe && interneDuProjet(pid).sante && interneDuProjet(pid).sante !== 'ok' ? pastille(SANTES, interneDuProjet(pid).sante) : ''}
              ${dateCourte(projet.cible) ? `<span class="puce">${icone('cible')} Livraison visée ${echapper(dateCourte(projet.cible))}</span>${verdictHtml(delai)}` : ''}
              ${projet.responsable ? `<span class="puce">${icone('utilisateur')} ${echapper(nomEquipe(d.equipe, projet.responsable) || 'Capmedia')}</span>` : ''}
              <span class="puce t-3">${icone('horloge')} ${d.activite[0] ? `Dernière activité ${echapper(depuis(d.activite[0].date))}` : 'Pas encore d\'activité'}</span>
            </div>
          </div>
        </div>
        <div class="actions">
          ${equipe ? `<button class="btn btn-secondaire" type="button" data-action="editer-projet">${icone('edit')} Modifier</button>` : ''}
          <a class="btn btn-principal" href="#/projets/${echapper(pid)}/nouvelle-demande">${icone('plus')} Nouvelle demande</a>
          ${equipe ? `<button class="btn-icone" type="button" data-action="menu-projet" aria-label="Plus">${icone('points')}</button>` : ''}
        </div>
      </header>

      ${cartesPlateformes(projet, d, pid)}

      ${/* Chez le client, les sections du projet sont dans son arbre, dans le
            rail : plus d'onglets horizontaux en double. */ ''}
      ${equipe ? `<div class="onglets-enveloppe"><nav class="onglets" id="onglets-projet" aria-label="Sections du projet">
        ${onglets.map((o) => `<a class="onglet${o.cle === onglet ? ' actif' : ''}" href="#/projets/${echapper(pid)}${o.cle === 'apercu' ? '' : `/${o.cle}`}">${o.libelle}${comptes[o.cle] ? `<span class="badge">${comptes[o.cle]}</span>` : ''}</a>`).join('')}
        ${equipe ? `<a class="onglet${onglet === 'composants' ? ' actif' : ''}" href="#/projets/${echapper(pid)}/composants">Les parties</a>` : ''}
        ${equipe && !projet.interne ? `<a class="onglet${onglet === 'acces' ? ' actif' : ''}" href="#/projets/${echapper(pid)}/acces">Accès client${projet.ouvert === true ? '' : ' <span class="badge">fermé</span>'}</a>` : ''}
      </nav></div>` : ''}

      <div id="onglet-corps">${rendreOnglet(onglet, d, { pid, env, prog, attente, ouverts, delai, risques })}</div>
    </div>`;
    derniereEmpreinte = empreintePage();
    if (equipe) reglerOnglets(sortie);
    /* Le coffre garde sa zone d'un dessin à l'autre ; quitter l'onglet le
       verrouille et coupe ses écoutes. */
    if (onglet === 'suggestions') marquerVues(d, { pid, env });
    if (onglet === 'coffre') {
      chargerCoffre().then((m) => { if (onglet === 'coffre') m.monterCoffre(sortie.querySelector('#coffre-zone'), { pid, env, projet }); })
        .catch(() => toast('Le coffre-fort n\'a pas pu se charger. Rechargez la page.', 'erreur'));
    } else demonterCoffre();

    if (detailOuvert) {
      const { genre, id } = detailOuvert;
      if (genre === 'tache') { const t = d.taches.find((x) => x.id === id); if (t) ouvrirTache(t, d, { pid, env }); }
      if (genre === 'reunion') { const r = d.reunions.find((x) => x.id === id); if (r) ouvrirReunion(r, d, { pid, env }); }
      if (genre === 'release') { const r = d.releases.find((x) => x.id === id); if (r) ouvrirRelease(r, d, { pid, env }); }
      detailOuvert = null;
    }
    if (blocageOuvert && d.blocages.length) {
      const b = d.blocages.find((x) => x.id === blocageOuvert);
      if (b) ouvrirBlocage(b, d, { pid, env });
      blocageOuvert = null;
    }
  };

  /* Refermer un projet ouvert trop tot : le client perd l'acces, rien
     n'est supprime, et on peut rouvrir. */
  const refermer = async (projetId) => {
    const ok = await confirmer({
      titre: 'Refermer ce projet ?',
      texte: "Le client perd l'accès immédiatement. Rien n'est supprimé, et vous pourrez rouvrir quand vous voudrez.",
      ok: 'Refermer', danger: true,
    });
    if (ok) await agir(null, () => appelServeur('fermerAuClient', { id: projetId }), 'Projet refermé.');
  };

  /* --- Les gestes ------------------------------------------------------ */
  brancherFrise(sortie, env);
  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const d = lireTout(pid);
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === 'editer-projet') return editer('projet', env, { pid, fiche: d.projet });
    if (await gesteSuggestion(el, d, { pid, env })) return null;
    if (await gesteAcces(el, d, { pid, env })) return null;
    if (action === 'ouvrir-au-client') {
      const personnes = (d.interlocuteurs || []).filter((i) => i.statut === 'actif');
      const qui = personnes.map((i) => i.nom || i.email).join(', ') || 'le client';
      const coupes = d.projet.emailsClient === 'coupes';
      const ok = await confirmer({
        titre: 'Ouvrir ce projet au client ?',
        texte: `${qui} ${personnes.length > 1 ? 'auront' : 'aura'} accès à ce qui est visible ici : étapes, tâches visibles, fichiers, demandes ; la finance pour les responsables. ${coupes ? "Les e-mails de ce projet sont coupés : aucune invitation ne partira, vous copierez les liens." : "Chacun reçoit une seule lettre : son invitation et ce qui l'attend, pas l'historique de la préparation."}`,
        ok: 'Ouvrir',
      });
      if (!ok) return null;
      let r = null;
      const fait = await agir(el, async () => { r = await appelServeur('ouvrirAuClient', { id: pid }); });
      if (fait && r) {
        const parties = (r.invitations || []).filter((x) => x.etat === 'envoyee').length;
        toast(parties ? `Projet ouvert. ${parties} invitation${parties > 1 ? 's' : ''} envoyée${parties > 1 ? 's' : ''}.` : 'Projet ouvert. Aucune invitation n\'est partie : copiez les liens depuis l\'onglet Accès client.');
      }
      return null;
    }

    if (action === 'menu-projet') {
      return menu(el, [
        { libelle: d.projet.archive ? 'Restaurer le projet' : 'Archiver le projet', icone: 'archive', action: async () => {
          const ok = await confirmer({ titre: d.projet.archive ? 'Restaurer ce projet ?' : 'Archiver ce projet ?', texte: d.projet.archive ? 'Il redevient visible pour le client.' : "Il disparaît de l'accueil du client, rien n'est supprimé.", ok: d.projet.archive ? 'Restaurer' : 'Archiver' });
          if (ok) await agir(null, () => ecrire.majProjet(pid, { archive: !d.projet.archive, statut: d.projet.archive ? 'en-cours' : 'archive' }), d.projet.archive ? 'Projet restauré.' : 'Projet archivé.');
        } },
        /* Ranger le projet à part, ou l'en sortir : un drapeau, rien d'autre. */
        ...(!d.projet.archive ? [d.projet.aFaire
          ? { libelle: 'Passer en projet actuel', icone: 'fleche', action: () => basculerAFaire(d.projet, false) }
          : { libelle: 'Ranger dans les projets à faire', icone: 'ampoule', action: () => basculerAFaire(d.projet, true) }] : []),
        { libelle: 'La note du projet', icone: 'note', action: () => naviguer(`/a-faire/${pid}`) },
        ...(!d.projet.interne ? [{ libelle: 'Accès du client', icone: 'utilisateurs', action: () => naviguer(`/projets/${pid}/acces`) }] : []),
        ...(d.projet.ouvert === true && !d.projet.interne ? [{ libelle: 'Refermer au client', icone: 'oeilFerme', danger: true, action: () => refermer(pid) }] : []),
        { libelle: 'Signaler un point bloquant', icone: 'alerte', action: () => editer('blocage', env, { pid }) },
        { libelle: 'Demander une validation', icone: 'valider', action: () => editer('validation', env, { pid }) },
        { libelle: 'Nouvelle note ou décision', icone: 'note', action: () => editer('note', env, { pid }) },
      ]);
    }
    if (action === 'nouveau') return editer(el.dataset.genre, env, { pid, defaut: el.dataset.defaut ? JSON.parse(el.dataset.defaut) : {} });
    if (action === 'editer') {
      const genre = el.dataset.genre;
      const fiche = trouver(d, genre, id);
      return fiche ? editer(genre, env, { pid, fiche }) : null;
    }
    if (action === 'supprimer') {
      const genre = el.dataset.genre;
      const fiche = trouver(d, genre, id);
      return fiche ? supprimer(genre, env, { pid, fiche, libelle: el.dataset.libelle }) : null;
    }
    if (action === 'ouvrir-tache') {
      const t = d.taches.find((x) => x.id === id);
      if (t) ouvrirTache(t, d, { pid, env });
      return null;
    }
    if (action === 'statut-tache') {
      return agir(null, () => ecrire.majTache(id, { statut: el.dataset.statut, progression: el.dataset.statut === 'terminee' ? 100 : undefined }));
    }
    if (action === 'resoudre-blocage') {
      return agir(null, () => ecrire.majBlocage(id, { resolu: new Date() }), 'Point bloquant levé.');
    }
    if (action === 'ouvrir-blocage') { const b = d.blocages.find((x) => x.id === id); if (b) ouvrirBlocage(b, d, { pid, env }); return null; }
    if (action === 'deposer-client') return ouvrirDepotClient(pid, env);
    if (action === 'menu-fichier') {
      const f = d.fichiers.find((x) => x.id === id);
      if (!f) return null;
      /* Le client ne retire que ce qu'il a lui-même déposé : la règle le
         vérifie aussi. L'équipe, elle, archive. */
      if (!equipe) {
        if (!f.par || f.par.uid !== env.session.utilisateur.uid) return null;
        return menu(el, [{ libelle: 'Retirer ce fichier', icone: 'corbeille', danger: true, action: async () => { if (await confirmer({ titre: 'Retirer ce fichier ?', texte: 'Il disparaît pour vous et pour Capmedia.', ok: 'Retirer', danger: true })) agir(null, () => ecrire.retirerFichier(f), 'Fichier retiré.'); } }]);
      }
      const items = [{ libelle: 'Modifier la fiche', icone: 'edit', action: () => editer('fichier', env, { pid, fiche: f }) },
        { libelle: 'Archiver', icone: 'archive', danger: true, action: async () => { if (await confirmer({ titre: 'Archiver ce fichier ?', texte: 'Il reste dans les archives, rien n\'est effacé.', ok: 'Archiver' })) agir(null, () => ecrire.majFichier(f.id, { archive: true }), 'Fichier archivé.'); } }];
      return menu(el, items);
    }
    if (action === 'ouvrir-etape') { const j = d.jalons.find((x) => x.id === id); if (j) ouvrirEtape(j, d, { pid, env }); return null; }
    if (action === 'ouvrir-reunion') { const r = d.reunions.find((x) => x.id === id); if (r) ouvrirReunion(r, d, { pid, env }); return null; }
    if (action === 'ouvrir-release') { const r = d.releases.find((x) => x.id === id); if (r) ouvrirRelease(r, d, { pid, env }); return null; }
    if (action === 'ouvrir-note') { const n = d.notes.find((x) => x.id === id); if (n) ouvrirNote(n, { pid, env }); return null; }
    if (action === 'ouvrir-validation') return naviguer(equipe ? `/validations/${id}` : `/valider/${id}`);
    /* Un identifiant d'accès se copie d'un geste : le client le colle dans
       l'écran de connexion du store ou du compte de test. */
    if (action === 'copier-identifiants') { const l = d.liens.find((x) => x.id === id); if (l && l.identifiants) copier(l.identifiants); return null; }
    /* Écrire à Capmedia depuis l'endroit où la question naît : la bulle
       s'ouvre avec le début de phrase, sans quitter la page. */
    if (action === 'ecrire-bulle') { ouvrirBulle(pid, el.dataset.texte || ''); return null; }
    return null;
  });
  /* Un bouton posé dans un lien ne suit pas le lien, et le lien « Rejoindre »
     d'une réunion n'ouvre pas sa fiche : écouteurs plutôt qu'attributs
     onclick, que la politique de sécurité du contenu refuse. */
  const gestesSansLien = sur(sortie, 'click', '[data-sans-lien]', (el, ev) => ev.preventDefault());
  const sansPropagation = (ev) => { if (ev.target.closest && ev.target.closest('[data-sans-propagation]')) ev.stopPropagation(); };
  sortie.addEventListener('click', sansPropagation, true);
  const gestesFichiers = sur(sortie, 'click', '[data-menu-fichier]', (el) => {
    el.dataset.action = 'menu-fichier'; el.dataset.id = el.dataset.menuFichier; el.click();
  });
  // Les filtres et les bascules d'affichage se souviennent, puis redessinent.
  const gestesFiltres = sur(sortie, 'click', '[data-vue-taches], [data-filtre-demandes], [data-filtre-fichiers], [data-filtre-suggestions]', (el) => {
    try {
      if (el.dataset.vueTaches !== undefined) localStorage.setItem('suivi:taches-vue', el.dataset.vueTaches);
      if (el.dataset.filtreDemandes !== undefined) sessionStorage.setItem(`suivi:filtre-demandes:${pid}`, el.dataset.filtreDemandes);
      if (el.dataset.filtreFichiers !== undefined) sessionStorage.setItem(`suivi:filtre-fichiers:${pid}`, el.dataset.filtreFichiers);
      if (el.dataset.filtreSuggestions !== undefined) sessionStorage.setItem(`suivi:filtre-suggestions:${pid}`, el.dataset.filtreSuggestions);
    } catch (e) { /* stockage refusé */ }
    rendre(true);
  });
  brancherPieces(sortie);
  /* Le pavé « En attente de vous » : replier, fermer, réafficher. */
  const gestesPaves = equipe ? () => {} : brancherPaves(sortie, env);

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const planifier = magasin.dessinateur(() => rendre(false), 60, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  /* Le profil porte le choix du pavé (replié, fermé) : il redessine la page
     quand ce choix change, et seulement alors (l'empreinte le contient). */
  if (!equipe) lot.sur(K.profil, planifier);
  planifier();
  /* « En faire une demande » sur une note partagée par le client (équipe). */
  const gesteNotes = gesteNoteDemande(sortie, () => lireTout(pid).notesPartagees);

  /* La conversation du projet vit en bulle, hors de la page ; elle est
     montée pour toutes les pages d'un projet par un module global, plus
     ici : changer d'onglet ou de page ne la referme pas. */

  return {
    fin: () => { demonterCoffre(); planifier.arreter(); gestes(); gestesPaves(); gestesSansLien(); sortie.removeEventListener('click', sansPropagation, true); gestesFichiers(); gestesFiltres(); gesteNotes(); lot.fin(); },
    /* Changer d'onglet ne recharge pas la page : on redessine, les écoutes
       restent ouvertes et le défilement ne saute pas. */
    maj: (suite) => {
      /* Le routeur ne redit pas l'onglet : on le lit dans l'adresse. */
      const ongletDuChemin = () => {
        if (suite.params.onglet) return suite.params.onglet;
        if (suite.params.tid) return 'taches';
        const m = /^\/projets\/[^/]+\/(reunions|releases)\/[^/]+/.exec(suite.chemin || '');
        return m ? m[1] : 'apercu';
      };
      onglet = ongletDe(ongletDuChemin());
      detailOuvert = ficheDemandee(suite.params, onglet);
      if (suite.requete && suite.requete.blocage) blocageOuvert = suite.requete.blocage;
      poserFiltre(suite.requete);
      rendre(true);
      /* Le défilement ne saute au haut de page que si la barre des onglets
         est sortie de l'écran : sinon l'en-tête reste exactement où il est. */
      const barre = sortie.querySelector('#onglets-projet');
      if (barre && barre.getBoundingClientRect().top < 0) barre.scrollIntoView({ block: 'start', behavior: 'instant' });
    },
  };
};

/* La barre d'onglets : l'onglet actif se ramène dans le champ de vision, et
   le dégradé du bord droit ne s'affiche que s'il reste quelque chose à voir. */
const reglerOnglets = (sortie) => reglerBarreOnglets(sortie.querySelector('#onglets-projet'));

/* Les plateformes du projet, en cartes : l'icône dans sa couleur, ce que
   disent les versions réelles, et le lien qui mène à la page de la brique.
   L'état ne vient plus d'un champ saisi à la main sur la partie, mais de
   la dernière version disponible et de la dernière en route : les deux
   ne peuvent plus diverger. */
const cartesPlateformes = (projet, d, pid) => {
  const cles = (projet.plateformes || []).filter((c) => PLATEFORMES[c]);
  if (!cles.length) return '';
  return `<div class="cartes-plateformes" role="list">${cles.map((cle) => {
    const f = PLATEFORMES[cle];
    const c = d.composants.find((x) => x.type === (f.composant || cle)) || null;
    const v = etatVersions(d.releases, cle, c);
    const lignes = [];
    if (v.disponible) lignes.push(`${v.disponible.version || ''} disponible${dateCourte(v.disponible.date) ? ` depuis le ${dateCourte(v.disponible.date)}` : ''}`.trim());
    if (v.enRoute) lignes.push(`${v.enRoute.version || ''} ${((STATUTS_RELEASE[v.enRoute.statut] || {}).libelle || 'en test').toLowerCase()}${dateCourte(v.enRoute.date) ? ` depuis le ${dateCourte(v.enRoute.date)}` : ''}${v.enRoute.build ? ` · build ${v.enRoute.build}` : ''}`.trim());
    if (!lignes.length) lignes.push(c ? ((STATUTS_COMPOSANT[c.statut || 'en-cours'] || {}).libelle || 'En cours') : 'Pas encore suivie');
    const store = v.disponible && v.disponible.liens && v.disponible.liens.store;
    const test = v.enRoute && v.enRoute.liens && v.enRoute.liens.test;
    /* L'adresse publique de la partie (fiche du store, site en ligne,
       tableau de bord) : l'éditeur promettait qu'elle rendait la carte
       cliquable, et la carte ne la lisait pas. Seul un lien web est suivi. */
    const publique = !store && c && /^https:\/\//i.test(String(c.lien || '')) ? c.lien : '';
    const surStore = cle === 'ios' || cle === 'android';
    const href = `#/projets/${echapper(pid)}/brique/${echapper(c ? c.id : `p-${cle}`)}`;
    /* Les boutons ne vivent pas dans le lien : un lien dans un lien n'est
       pas permis, et le navigateur l'éjecterait. */
    return `<div class="carte-plateforme carte-plateforme--${f.voile}" role="listitem" data-plateforme="${echapper(cle)}" style="grid-template-columns:36px minmax(0,1fr) auto">
      <a class="carte-plateforme-tuile" href="${href}" aria-label="${echapper(`Ouvrir la page ${f.libelle}`)}">${icone(f.icone)}</a>
      <a class="carte-plateforme-corps" href="${href}" style="color:inherit;text-decoration:none" data-astuce="${echapper(`Ouvrir la page ${f.libelle}`)}">
        <span class="carte-plateforme-nom">${echapper(f.libelle)}</span>
        ${lignes.map((l) => `<span class="carte-plateforme-etat">${echapper(l)}</span>`).join('')}
      </a>
      <span class="rang" style="gap:4px;flex-wrap:nowrap">
        ${store ? `<a class="btn btn-doux btn-petit" href="${echapper(store)}" target="_blank" rel="noopener" data-astuce="Ouvrir dans le store">${icone('externe')} Store</a>` : ''}
        ${test ? `<a class="btn btn-doux btn-petit" href="${echapper(test)}" target="_blank" rel="noopener" data-astuce="Version de test">${icone('externe')} Test</a>` : ''}
        ${publique ? `<a class="btn btn-doux btn-petit" href="${echapper(publique)}" target="_blank" rel="noopener" data-astuce="${surStore ? 'Ouvrir dans le store' : 'Ouvrir le site'}">${icone('externe')} ${surStore ? 'Store' : 'Ouvrir'}</a>` : ''}
        ${!store && !test && !publique ? `<a class="carte-plateforme-fleche" href="${href}" aria-hidden="true" tabindex="-1">${icone('fleche')}</a>` : ''}
      </span>
    </div>`;
  }).join('')}</div>`;
};

const trouver = (d, genre, id) => {
  /* Un scénario porte sa référence comme identifiant (« DI-15 »), parce que
     c'est elle qui le nomme dans les passages et les rapports. */
  if (genre === 'scenario') return (d.scenarios || []).find((x) => x.ref === id);
  return ({
    composant: d.composants, jalon: d.jalons, lien: d.liens, tache: d.taches, release: d.releases, reunion: d.reunions, note: d.notes, blocage: d.blocages, fichier: d.fichiers,
    campagne: d.campagnes, suggestion: d.suggestions,
  }[genre] || []).find((x) => x.id === id);
};

/* ==========================================================================
   Les onglets
   ========================================================================== */

const boutonNouveau = (env, genre, libelle, defaut) => (env.role === 'equipe'
  ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="${genre}"${defaut ? ` data-defaut='${echapper(JSON.stringify(defaut))}'` : ''}>${icone('plus')} ${echapper(libelle)}</button>`
  : '');
const boutonsEdition = (env, genre, id, libelle) => (env.role === 'equipe'
  ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-action="editer" data-genre="${genre}" data-id="${echapper(id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button><button class="btn-icone" type="button" data-action="supprimer" data-genre="${genre}" data-id="${echapper(id)}" data-libelle="${echapper(libelle || '')}" aria-label="Supprimer" data-astuce="Supprimer">${icone('corbeille')}</button></span>`
  : '');

/* --- Tests ---------------------------------------------------------------
   La bibliothèque des scénarios, et l'état des campagnes.

   Un scénario est écrit une fois et déroulé à chaque campagne : c'est ce
   qui sépare cette page d'un tableur, où relancer une campagne écrase la
   précédente. Le niveau de couverture décide combien de personnes le
   passent, et c'est la seule donnée qui coûte de l'argent : un scénario
   doublé est payé deux fois.
   ------------------------------------------------------------------------ */
/* --- Tests ---------------------------------------------------------------
   Un résumé, pas la console. Ici on répond à « où en sont les tests de ce
   projet », et on renvoie vers la console pour tout le reste : la
   comparaison entre projets, les filtres par système, le pilotage.
   ------------------------------------------------------------------------ */
const tests = (d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const scenarios = d.scenarios;
  const campagnes = d.campagnes;
  const anomalies = d.anomalies;

  if (!scenarios.length && !campagnes.length) {
    return `<section class="section" style="margin-top:0">
      <div class="section-tete"><h2>Tests</h2>${boutonNouveau(env, 'scenario', 'Nouveau scénario')}</div>
      ${vide({ icone: 'bug', titre: 'Aucun scénario', texte: equipe ? 'Écrivez-en un, ou versez un plan de tests existant avec l\'outil d\'import.' : 'Les scénarios de test apparaîtront ici.' })}
    </section>`;
  }

  const parNiveau = { socle: 0, transversal: 0, reparti: 0 };
  scenarios.forEach((s) => { parNiveau[s.niveau] = (parNiveau[s.niveau] || 0) + 1; });
  const passages = parNiveau.socle * 2 + parNiveau.transversal * 2 + parNiveau.reparti;
  const enCours = campagnes.filter((c) => c.statut === 'en-cours');
  const ouvertes = anomalies.filter((a) => !['corrigee', 'sans-suite'].includes(a.statut));
  const bloquantes = ouvertes.filter((a) => a.gravite === 'bloquant');

  /* Deux vocabulaires : l'équipe parle de passages et de console, le
     client lit des phrases simples et un seul bouton, « Voir les tests ». */
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete">
      <div><h2>Tests</h2><p class="chapo">${equipe
    ? `${pluriel(scenarios.length, 'scénario', 'scénarios')}, soit ${passages} passages sur mobile par campagne complète.`
    : `Votre application est testée par de vraies personnes avant chaque sortie : ${pluriel(scenarios.length, 'scénario', 'scénarios')} à dérouler${enCours.length ? `, ${pluriel(enCours.length, 'campagne en cours', 'campagnes en cours')}` : ''}.`}</p></div>
      <div class="rang" style="gap:8px">
        ${equipe || magasin.lire(K.planPresentation(pid)) ? `<a class="btn btn-secondaire btn-petit" href="#/tests/plan?projet=${echapper(pid)}" data-plan-tests>${icone('liste')} Ce qui va être testé</a>` : ''}
        <a class="btn btn-principal btn-petit" href="#/tests?projet=${echapper(pid)}">${icone('bug')} ${equipe ? 'Ouvrir la console' : 'Voir les tests'}</a>
      </div>
    </div>

    <div class="rang chiffres-tests">
      <div class="chiffre"><span class="chiffre-valeur">${scenarios.length}</span><span class="chiffre-nom">scénarios</span></div>
      <div class="chiffre"><span class="chiffre-valeur">${parNiveau.socle + parNiveau.transversal}</span><span class="chiffre-nom">${equipe ? 'passés deux fois' : 'testés sur iPhone et Android'}</span></div>
      <div class="chiffre"><span class="chiffre-valeur">${enCours.length}</span><span class="chiffre-nom">campagnes en cours</span></div>
      <div class="chiffre${ouvertes.length ? ' chiffre--alerte' : ''}"><span class="chiffre-valeur">${ouvertes.length}</span><span class="chiffre-nom">${equipe ? 'anomalies ouvertes' : 'problèmes à corriger'}</span></div>
    </div>

    ${bloquantes.length ? `<div class="liste" style="margin-top:16px">${bloquantes.slice(0, 3).map((a) => ligne({
      icone: 'alerte', ton: 'rouge', titre: echapper(a.titre || 'Anomalie bloquante'),
      sous: (a.plateformes || []).join(', ') || 'Bloquant', fin: pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle'),
    })).join('')}</div>` : ''}

    ${enCours.length ? `<div class="liste" style="margin-top:16px">${enCours.map((c) => ligne({
      href: `#/tests?projet=${echapper(pid)}`, icone: 'bug', ton: 'bleu',
      titre: echapper(c.titre || 'Campagne'),
      sous: `${(c.testeurs || []).length ? pluriel((c.testeurs || []).length, 'testeur', 'testeurs') : (equipe ? 'aucun testeur' : 'testeurs en cours d\'affectation')}${dateCourte(c.debut) ? ` · depuis le ${echapper(dateCourte(c.debut))}` : ''}`,
      fin: pastille(STATUTS_CAMPAGNE, c.statut),
    })).join('')}</div>` : ''}
  </section>`;
};

const rendreOnglet = (onglet, d, c) => {
  switch (onglet) {
    case 'apercu': return apercu(d, c);
    case 'composants': return composants(d, c);
    case 'acces': return accesHtml(d, c);
    case 'etapes': return etapes(d, c);
    case 'taches': return taches(d, c);
    case 'demandes': return demandes(d, c);
    case 'fichiers': return fichiers(d, c);
    case 'releases': return releases(d, c);
    case 'liens': return liens(d, c);
    case 'reunions': return reunions(d, c);
    case 'notes': return notes(d, c);
    case 'tests': return tests(d, c);
    case 'coffre': return '<div id="coffre-zone"></div>';
    case 'suggestions': return ongletSuggestions(d, c);
    case 'activite': return `<section class="section" style="margin-top:0"><div class="section-tete"><h2>Activité du projet</h2></div>${activiteHtml(d.activite.slice(0, 80), { equipe: c.env.role === 'equipe' })}</section>`;
    default: return '';
  }
};

/* --- Aperçu --------------------------------------------------------------- */
const apercu = (d, { pid, env, prog, attente, ouverts, delai, risques }) => {
  const equipe = env.role === 'equipe';
  const projet = d.projet;
  const pulse = projet.pulse || {};
  const courant = jalonCourant(d.jalons);
  const suivant = jalonSuivant(d.jalons);
  const termines = d.jalons.filter((j) => j.statut === 'termine');
  const dernierTermine = termines.length ? termines[termines.length - 1] : null;
  const enCours = d.taches.filter((t) => t.statut === 'en-cours').slice(0, 4);
  const reunion = prochaineReunion(d.reunions);
  const blocagesOuverts = d.blocages.filter((b) => !b.resolu);
  const derniereRelease = d.releases.filter((r) => r.statut === 'disponible').sort(parDateDesc('date'))[0];
  const validationsAttente = d.validations.filter((v) => v.statut === 'en-attente' && peutRepondreValidation(v));
  const echeances = [
    ...d.jalons.filter((j) => j.fin && j.statut !== 'termine').map((j) => ({ date: j.fin, titre: j.titre, genre: 'Étape', icone: 'drapeau', chemin: `/projets/${pid}/etapes` })),
    ...d.taches.filter((t) => t.echeance && t.statut !== 'terminee').map((t) => ({ date: t.echeance, titre: t.titre, genre: 'Tâche', icone: 'taches', chemin: `/projets/${pid}/taches/${t.id}` })),
    ...d.reunions.filter(reunionAVenir).map((r) => ({ date: r.date, titre: r.titre, genre: 'Réunion', icone: 'reunions', chemin: `/projets/${pid}/reunions/${r.id}` })),
    ...d.documents.filter((x) => x.type === 'facture' && x.echeance && ['a-payer', 'partielle', 'en-retard'].includes(x.statut)).map((x) => ({ date: x.echeance, titre: x.libelle, genre: 'Facture', icone: 'euro', chemin: equipe ? `/finances/${x.id}` : `/finances/${x.id}` })),
  ].filter((e) => joursAvant(e.date) >= -30).sort(parDateAsc('date')).slice(0, 6);

  /* Le pouls est daté et signé : sans date, une phrase écrite il y a un
     mois se lit comme une nouvelle du jour. Une case vide montre la valeur
     calculée. « Attendu de vous » ne lit plus le texte libre : c'est le
     bloc « En attente de vous » qui fait foi, et il ne peut pas le
     contredire. */
  const poulsMaj = projet.pulseMaj
    ? `<p class="t-micro t-3" style="margin-top:6px">mis à jour le ${echapper(dateCourte(projet.pulseMaj))}${projet.pulsePar ? ` par ${echapper(String(projet.pulsePar).split(' ')[0])}` : ''}</p>`
    : '';
  const livraison = derniereRelease
    ? `${libellePlateforme(derniereRelease.plateforme)} ${derniereRelease.version || ''}`.trim() + (dateCourte(derniereRelease.date) ? ` · le ${dateCourte(derniereRelease.date)}` : '')
    : (dernierTermine ? dernierTermine.titre : 'Rien encore');
  /* Le pavé du client peut être replié ou fermé (rangé dans Demandes). */
  const clePave = `projet:${pid}`;
  const etatP = equipe ? 'ouvert' : etatPave(clePave);
  const paveVisible = attente.length > 0 && etatP !== 'ferme';
  const attenduTexte = attente.length ? `${pluriel(attente.length, 'point', 'points')}, ${paveVisible ? 'voir ci-dessus' : 'rangés dans Demandes'}` : 'Rien';
  const sourceProgression = prog.valeur === null
    ? 'Rien ne permet encore de la calculer'
    : `${MODES_PROGRESSION[prog.mode] || ''}${prog.mode === 'manuel' && (projet.progression || {}).le ? ` le ${dateCourte(projet.progression.le)}` : ''}`;

  /* Ce qui a bougé depuis la dernière visite, sur ce projet seulement et
     sans ses propres gestes. Chaque compteur mène à l'onglet. */
  const depuisPassage = !equipe ? activiteDepuis(d.activite, env.derniereVisite, { sansUid: env.session && env.session.utilisateur ? env.session.utilisateur.uid : null }) : [];
  const resumeDepuis = depuisPassage.length ? (() => {
    const compte = (type) => depuisPassage.filter((a) => a.type === type).length;
    const parts = [
      ['tache', 'taches', 'check', 'mouvement de tâche', 'mouvements de tâches'],
      ['release', 'releases', 'releases', 'nouvelle version', 'nouvelles versions'],
      ['message', null, 'messages', 'message', 'messages'],
      ['validation', null, 'valider', 'validation', 'validations'],
      ['fichier', 'fichiers', 'fichiers', 'fichier', 'fichiers'],
      ['jalon', 'etapes', 'drapeau', 'étape', 'étapes'],
      ['reunion', 'reunions', 'reunions', 'réunion', 'réunions'],
      ['demande', 'demandes', 'demandes', 'demande', 'demandes'],
    ].filter(([type]) => compte(type)).map(([type, ong, ico, un, plusieurs]) => {
      const chemin = type === 'message' ? `/messages/${pid}` : type === 'validation' ? `/projets/${pid}/demandes` : type === 'fichier' ? `/fichiers?projet=${pid}` : `/projets/${pid}/${ong}`;
      return `<a class="rang" style="gap:6px;color:inherit" href="#${chemin}">${icone(ico)} ${pluriel(compte(type), un, plusieurs)}</a>`;
    });
    if (!parts.length) parts.push(`<a class="rang" style="gap:6px;color:inherit" href="#/projets/${echapper(pid)}/activite">${icone('activite')} ${pluriel(depuisPassage.length, 'mouvement')}</a>`);
    return `<section class="section" style="margin-top:0"><div class="encart encart--info" id="depuis-visite">${icone('info')}<div><strong>Depuis votre dernière visite</strong><span class="rang" style="margin-top:6px;gap:16px">${parts.join('')}</span></div></div></section>`;
  })() : '';

  const suggestionHtml = apercuSuggestionHtml(d, { pid, env });
  /* Le premier bloc de la page colle à l'en-tête ; les suivants gardent
     leur respiration. */
  const rienAuDessus = !resumeDepuis && !suggestionHtml;
  return `
    ${resumeDepuis}
    ${suggestionHtml}

    ${blocagesOuverts.length ? `<section class="section" id="points-bloquants"${rienAuDessus ? ' style="margin-top:0"' : ''}>
      <div class="section-tete"><h2>Points bloquants</h2>${boutonNouveau(env, 'blocage', 'Signaler')}</div>
      <div class="pile">${blocagesOuverts.map((b) => `<div class="encart encart--alerte">${icone('alerte')}<div style="flex:1">
        <strong>${equipe ? echapper(b.titre) : `<button class="ligne-titre ligne-titre--bouton" type="button" data-action="ouvrir-blocage" data-id="${echapper(b.id)}" style="font:inherit;padding:0;text-align:left">${echapper(b.titre)}</button>`}</strong>${b.description ? ` · ${echapper(b.description)}` : ''}
        <div class="rang t-micro t-3" style="margin-top:6px;gap:12px"><span>${echapper(coteBlocage(b.responsable, equipe))}</span><span>${dateCourte(b.depuis) ? `Depuis le ${echapper(dateCourte(b.depuis))}` : 'Depuis : date non renseignée'}</span>${dateCourte(b.echeance) ? `<span>Attendu pour le ${echapper(dateCourte(b.echeance))}</span>` : ''}${b.impact ? `<span>Impact : ${echapper(b.impact)}</span>` : ''}${b.signaleFait ? `<span>${equipe ? `Le client dit que c'est fait ${echapper(dateCourte(b.signaleFait.date))}` : `Vous avez dit que c'est fait ${echapper(dateCourte(b.signaleFait.date))}`}</span>` : ''}</div>
        ${!equipe && b.responsable === 'client' ? `<p class="t-petit" style="margin-top:8px"><button class="btn btn-secondaire btn-petit" type="button" data-action="ouvrir-blocage" data-id="${echapper(b.id)}">Voir ce qu'on attend de vous</button></p>` : ''}
      </div>${equipe ? `<span class="rang" style="gap:2px"><button class="btn btn-petit btn-doux" type="button" data-action="resoudre-blocage" data-id="${echapper(b.id)}">Levé</button>${boutonsEdition(env, 'blocage', b.id, b.titre)}</span>` : ''}</div>`).join('')}</div>
    </section>` : ''}

    ${attente.length ? (equipe ? `<section class="section"${blocagesOuverts.length || !rienAuDessus ? '' : ' style="margin-top:0"'}><div class="attente">
      <p class="attente-tete">${icone('alerte')} En attente du client <span class="badge badge--vif" style="margin-left:4px">${attente.length}</span></p>
      <div class="liste" style="margin-top:8px">${attente.slice(0, 5).map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div>
      ${attente.length > 5 ? `<p class="t-petit" style="margin-top:8px"><a href="#/demandes">${echapper(pluriel(attente.length - 5, 'autre point', 'autres points'))} à voir</a></p>` : ''}
    </div></section>` : paveHtml({
      cle: clePave, etat: etatP, nombre: attente.length, rangement: 'Le ranger dans les demandes du projet', premier: !blocagesOuverts.length && rienAuDessus,
      corps: `<div class="liste" style="margin-top:8px">${attente.slice(0, 5).map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div>
      ${attente.length > 5 ? `<p class="t-petit" style="margin-top:8px"><a href="#/projets/${echapper(pid)}/demandes">${echapper(pluriel(attente.length - 5, 'autre point', 'autres points'))} à voir</a></p>` : ''}`,
    })) : ''}

    <section class="section${paveVisible || blocagesOuverts.length || !rienAuDessus ? '' : ' section--premiere'}" style="${paveVisible || blocagesOuverts.length || !rienAuDessus ? '' : 'margin-top:0'}">
      <div class="section-tete"><h2>Votre projet en un coup d'œil</h2>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('edit')} Le pouls</button>` : ''}</div>
      <div class="grille grille-tiers">
        <div class="pouls">
          <div><p class="quoi">${icone('play')} En ce moment</p><p class="texte${pulse.enCours ? '' : ' rien'}">${echapper(pulse.enCours || (enCours[0] ? enCours[0].titre : (courant ? courant.titre : 'Rien de renseigné')))}</p>${pulse.enCours ? poulsMaj : ''}</div>
          <div><p class="quoi">${icone('check')} Dernière livraison</p><p class="texte${pulse.derniereLivraison || derniereRelease || dernierTermine ? '' : ' rien'}">${echapper(pulse.derniereLivraison || livraison)}</p>${pulse.derniereLivraison ? poulsMaj : ''}</div>
          <div><p class="quoi">${icone('fleche')} Prochaine étape</p><p class="texte${pulse.prochaineEtape || suivant ? '' : ' rien'}">${echapper(pulse.prochaineEtape || (suivant ? suivant.titre : 'À définir'))}</p>${pulse.prochaineEtape ? poulsMaj : ''}</div>
          <div><p class="quoi">${icone('horloge')} ${equipe ? 'Attente client' : 'Attendu de vous'}</p><p class="texte${attente.length ? '' : ' rien'}">${echapper(attenduTexte)}</p></div>
        </div>
        <div class="carte carte--creuse rang" style="gap:18px;align-items:center">
          ${anneauOuPas(prog, true)}
          <div>
            <p class="t-titre-3">Progression</p>
            <p class="t-petit t-2" style="margin-top:2px" id="source-progression">${echapper(sourceProgression)}</p>
            ${courant ? `<p class="t-petit" style="margin-top:8px"><span class="t-3">Étape en cours ·</span> ${echapper(courant.titre)}</p>` : ''}
            ${prog.valeur === null && equipe ? '<p class="t-micro t-3" style="margin-top:6px">Posez des étapes, ou saisissez une valeur dans Modifier.</p>' : ''}
          </div>
        </div>
      </div>
    </section>

    ${rideauHtml(d, { pid, env })}

    ${equipe ? notesPartageesHtml(d.notesPartagees, { carte: false }) : ''}

    ${tenueDesDelais(d, { pid, env, delai, risques, prog })}

    ${personnesHtml({ id: pid, ...projet }, env, d)}

    ${d.composants.length ? `<section class="section">
      <div class="section-tete"><h2>Les parties du projet <span class="compte-section">${d.composants.length}</span></h2><a class="lien" href="#/projets/${echapper(pid)}/${equipe ? 'composants' : 'etapes'}">${equipe ? 'Gérer' : 'Feuille de route'}</a></div>
      ${/* Chaque carte mène à la page de la brique. La barre s'appelle
            « avancement de la partie », datée quand on sait de quand elle
            date : ce n'est pas la progression du projet, dite ailleurs. */ ''}
      <div class="grille grille-3">${d.composants.map((c) => `<a class="carte carte--serree carte--cliquable" href="#/projets/${echapper(pid)}/brique/${echapper(c.id)}" data-partie="${echapper(c.id)}">
        <div class="rang-espace"><p class="t-corps-fort rang" style="gap:8px">${iconePlateforme(c.type) ? `<span class="ligne-icone ligne-icone--${tonPlateforme(c.type)}" style="width:28px;height:28px;border-radius:8px">${icone(iconePlateforme(c.type))}</span>` : ''}${echapper(c.nom)}</p>${pastille(STATUTS_COMPOSANT, c.statut || 'en-cours')}</div>
        <div class="rang-espace t-micro t-3" style="margin:10px 0 6px"><span>${echapper(TYPES_COMPOSANT[c.type] || c.type || '')}</span><span>avancement de la partie${dateCourte(c.maj) ? ` · ${echapper(dateCourte(c.maj))}` : ''}</span></div>
        ${progression(c.progression, borner(c.progression) >= 100 ? 'vert' : '')}
        ${c.environnement ? `<p class="t-micro t-3" style="margin-top:8px">${echapper(c.environnement)}</p>` : ''}
      </a>`).join('')}</div>
    </section>` : (equipe ? `<section class="section"><div class="section-tete"><h2>Les parties du projet</h2>${boutonNouveau(env, 'composant', 'Ajouter une partie')}</div>${vide({ icone: 'composants', titre: 'Aucune partie', texte: 'Découpez le projet : iPhone, Android, web, serveur...', compact: true })}</section>` : '')}

    <div class="grille grille-tiers section">
      <div class="pile" style="gap:var(--e-7)">
        <section>
          <div class="section-tete"><h2>Feuille de route</h2><a class="lien" href="#/projets/${echapper(pid)}/etapes">Tout voir</a></div>
          ${d.jalons.length ? `<div class="route">${trierEtapes(d.jalons).slice(0, 6).map((j) => phaseHtml(j)).join('')}</div>` : vide({ icone: 'route', titre: 'Pas encore de feuille de route', texte: equipe ? 'Posez les étapes du projet.' : 'Elle apparaîtra ici dès que les étapes seront posées.', compact: true, action: boutonNouveau(env, 'jalon', 'Première étape') })}
        </section>
        <section>
          <div class="section-tete"><h2>Activité récente</h2><a class="lien" href="#/projets/${echapper(pid)}/activite">Tout voir</a></div>
          ${activiteHtml(d.activite.slice(0, 8), { equipe: env.role === 'equipe' })}
        </section>
      </div>
      <aside class="pile" style="gap:var(--e-5)">
        <div class="carte carte--creuse">
          <p class="surtitre">Prochaine réunion</p>
          ${reunion ? `<p class="t-titre-3" style="margin-top:8px"><button class="lien" type="button" data-action="ouvrir-reunion" data-id="${echapper(reunion.id)}" style="font:inherit;text-align:left">${echapper(reunion.titre)}</button></p><p class="t-petit t-2" style="margin-top:4px">${echapper(dateHeure(reunion.date))}</p><div class="rang" style="margin-top:12px;gap:6px">${lienReunion(reunion) ? `<a class="btn btn-secondaire btn-petit" href="${echapper(lienReunion(reunion))}" target="_blank" rel="noopener">${icone('video')} Rejoindre</a>` : ''}<button class="btn btn-doux btn-petit" type="button" data-action="ouvrir-reunion" data-id="${echapper(reunion.id)}">Ordre du jour</button></div>` : `<p class="t-petit t-2" style="margin-top:8px">Aucune réunion programmée.</p>${equipe ? boutonNouveau(env, 'reunion', 'Programmer') : `<button class="btn btn-doux btn-petit" type="button" style="margin-top:8px" data-action="ecrire-bulle" data-texte="Je souhaite un créneau pour ">${icone('messages')} Demander un créneau</button>`}`}
        </div>
        <div class="carte carte--creuse">
          <p class="surtitre">Échéances</p>
          ${echeances.length ? `<div class="pile" style="margin-top:10px;gap:10px">${echeances.map((e) => { const f = calcEcheance(e.date); return `<a class="rang" style="gap:10px;color:inherit;align-items:flex-start;flex-wrap:nowrap" href="#${echapper(e.chemin)}"><span class="ligne-icone" style="width:28px;height:28px;border-radius:8px">${icone(e.icone)}</span><span style="min-width:0"><span class="t-petit t-fort tronque" style="display:block">${echapper(e.titre)}</span><span class="t-micro puce puce--${f.ton}" style="margin-top:2px"><i></i>${echapper(f.texte)}</span></span></a>`; }).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Rien de daté pour le moment.</p>'}
        </div>
        ${validationsAttente.length ? `<div class="carte carte--creuse"><p class="surtitre">Validations</p><div class="pile" style="margin-top:10px;gap:8px">${validationsAttente.map((v) => `<button class="rang" type="button" style="gap:10px;text-align:left" data-action="ouvrir-validation" data-id="${echapper(v.id)}"><span class="ligne-icone ligne-icone--violet" style="width:28px;height:28px;border-radius:8px">${icone('valider')}</span><span class="t-petit t-fort">${echapper(v.titre)}</span></button>`).join('')}</div></div>` : ''}
        <div class="carte carte--creuse">
          <p class="surtitre">Demandes</p>
          <p class="t-petit" style="margin-top:8px">${pluriel(ouverts.length, 'demande ouverte', 'demandes ouvertes')}${ouverts.filter((t) => ATTEND_CLIENT.includes(t.statut)).length ? `, ${ouverts.filter((t) => ATTEND_CLIENT.includes(t.statut)).length} de votre côté` : ''}</p>
          <p style="margin-top:8px"><a class="t-petit" href="#/projets/${echapper(pid)}/demandes">Voir les demandes</a></p>
        </div>
      </aside>
    </div>`;
};

/*
 * Le rideau. Un projet se prépare, se garnit, se chiffre, et seulement
 * ensuite s'ouvre au client : on ne remplit pas un espace sous ses yeux.
 * Tant qu'il est fermé, le client n'est dans aucune liste de membres,
 * donc les règles lui refusent la lecture. Ce bandeau le rappelle, et
 * porte le geste qui lève le rideau.
 */
const rideauHtml = (d, { pid, env }) => {
  if (env.role !== 'equipe') return '';
  const projet = d.projet;
  if (projet.interne) return '';
  /* Ouvert, c'est « ouvert : vrai », et rien d'autre : un projet sans ce
     drapeau est fermé au client (la migration de la Gate 2 a posé le
     drapeau sur les projets déjà partagés). */
  if (projet.ouvert === true) return '';

  const personnes = (d.interlocuteurs || []).filter((i) => i.statut === 'actif');
  const avecAdresse = personnes.map((i) => ({ nom: i.nom, email: i.email }));
  const devis = d.documents.filter((x) => x.type === 'devis' && !x.archive);
  const manque = [];
  if (!personnes.some((i) => i.role === 'responsable')) manque.push('un responsable côté client (onglet Accès client)');
  if (!d.jalons.length) manque.push('au moins une étape');

  return `<section class="section" style="margin-top:0">
    <div class="rideau">
      <div class="rideau-tete">
        <span class="rideau-icone">${icone('oeilFerme')}</span>
        <div style="min-width:0;flex:1">
          <p class="t-titre-3">Ce projet n'est pas encore ouvert au client</p>
          <p class="t-petit t-2" style="margin-top:2px">${echapper(avecAdresse.length
            ? `Personne n'y a accès et rien ne part. ${avecAdresse.map((c) => c.nom || c.email).join(', ')} n'y entrera qu'à votre geste.`
            : "Personne n'y a accès, rien ne part, et aucun interlocuteur n'est encore préparé.")}</p>
        </div>
        <a class="btn btn-secondaire" href="#/projets/${echapper(pid)}/acces">${icone('utilisateurs')} Accès client</a>
        ${peut(env.session, 'projets.ouvrir', pid) ? `<button class="btn btn-principal" type="button" data-action="ouvrir-au-client"${manque.length ? ' disabled' : ''}>Ouvrir au client</button>` : ''}
      </div>
      ${manque.length ? `<p class="rideau-manque">${icone('alerte')} Avant d'ouvrir, il manque ${echapper(manque.join(' et '))}.</p>` : ''}
      <dl class="rideau-etat">
        <div><dt>Interlocuteurs</dt><dd>${avecAdresse.length ? echapper(avecAdresse.map((c) => c.nom || c.email).join(', ')) : '<span class="t-3">aucun</span>'}</dd></div>
        <div><dt>Étapes posées</dt><dd>${d.jalons.length || '<span class="t-3">aucune</span>'}</dd></div>
        <div><dt>Devis</dt><dd>${devis.length ? echapper(devis.map((x) => `${x.numero || ''} ${(PORTEES_DEVIS[x.portee || 'initial'] || {}).court || ''}`.trim()).join(', ')) : '<span class="t-3">aucun</span>'}</dd></div>
        <div><dt>Fichiers</dt><dd>${d.fichiers.length || '<span class="t-3">aucun</span>'}</dd></div>
      </dl>
    </div>
  </section>`;
};

/*
 * La tenue des délais. C'est la seule chose que le client ne trouvait
 * nulle part et pour laquelle il écrivait un message : est-ce qu'on tient
 * la date, et si elle a bougé, pourquoi. On garde la date d'origine, on
 * inscrit chaque report avec son motif, et on nomme les faits qui
 * menacent la prochaine.
 */
const tenueDesDelais = (d, { pid, env, delai, risques, prog }) => {
  const equipe = env.role === 'equipe';
  const projet = d.projet;
  const reports = reportsDe(projet);
  const origine = dateOrigine(projet, 'cible');
  const decale = origine && projet.cible && dateCourte(origine) !== dateCourte(projet.cible);
  const etapesEnRetard = d.jalons.filter((j) => j.statut !== 'termine' && joursAvant(j.fin) < 0);

  /* Sans date, la section reste et le dit : cacher le bloc laissait le
     client chercher où était passée la date. */
  if (!projet.cible && !reports.length) {
    return `<section class="section" id="tenue-delais">
      <div class="section-tete"><h2>Tenue des délais</h2>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('cible')} Fixer une date</button>` : ''}</div>
      ${equipe
    ? encart("Aucune date de livraison n'est fixée. Le client n'a donc rien à quoi se raccrocher, et c'est la première raison pour laquelle il écrit.", 'attention', 'alerte')
    : encart("Aucune date de livraison n'est fixée pour l'instant. Dès qu'elle le sera, vous la verrez ici, avec son histoire si elle bouge.", '', 'horloge')}
    </section>`;
  }

  /* Trois faits, dans les mots de tous les jours : la date, le temps qu'il
     reste, et si on la tient. Puis deux jauges qui se lisent ensemble :
     le temps écoulé depuis le début, et le travail fait. Le travail devant
     le temps, on est en avance ; derrière, on rattrape. */
  const n = joursAvant(projet.cible);
  const clos = delai && delai.cle === 'livre';
  const reste = clos ? { valeur: 'Livré', nuance: '' }
    : n === null ? { valeur: '-', nuance: '' }
      : n < 0 ? { valeur: `${-n} jour${-n > 1 ? 's' : ''}`, nuance: 'de dépassement' }
        : n === 0 ? { valeur: "Aujourd'hui", nuance: "c'est le jour prévu" }
          : n === 1 ? { valeur: 'Demain', nuance: 'la livraison est pour demain' }
            : { valeur: `${n} jours`, nuance: n >= 14 ? `soit environ ${Math.round(n / 7)} semaines` : 'moins de deux semaines' };
  const tonVerdict = (delai && delai.voile) || 'gris';
  const nuanceVerdict = !delai ? '' : delai.cle === 'tenu' ? 'rien ne menace la date'
    : delai.cle === 'risque' ? `${pluriel(risques.length, 'point à surveiller', 'points à surveiller')}, détail ci-dessous`
      : delai.cle === 'depasse' ? 'la date prévue est passée'
        : delai.cle === 'livre' ? 'le projet est livré' : '';
  const histoire = decale
    ? `Prévue au départ le ${dateCourte(origine)}, déplacée ${reports.length} fois`
    : 'La date n\'a jamais bougé';

  /* Le temps écoulé : du début du projet (sa date de début, sinon la
     première étape) à la livraison prévue. */
  const debutProjet = enDate(projet.debut) || d.jalons.map((j) => enDate(j.debut)).filter(Boolean).sort((x, y) => x - y)[0] || null;
  const fin = enDate(projet.cible);
  const temps = debutProjet && fin && fin > debutProjet
    ? Math.max(0, Math.min(100, Math.round(((Date.now() - debutProjet.getTime()) / (fin.getTime() - debutProjet.getTime())) * 100)))
    : null;
  const travail = prog && prog.valeur !== null && prog.valeur !== undefined ? borner(prog.valeur) : null;
  const lecture = temps === null || travail === null || clos ? ''
    : travail >= temps ? 'Le travail avance au moins aussi vite que le temps.'
      : temps - travail <= 10 ? 'Le travail suit le temps de près.'
        : 'Le travail est en retard sur le temps : nous rattrapons.';
  const jauge = (libelle, valeur, ton, aria) => `<div class="delais-jauge">
      <p class="delais-jauge-tete"><span>${echapper(libelle)}</span><span class="nb">${valeur} %</span></p>
      <div class="delais-piste" role="img" aria-label="${echapper(aria)}"><i class="delais-piste--${ton}" style="width:${valeur}%"></i></div>
    </div>`;

  return `<section class="section" id="tenue-delais">
    <div class="section-tete"><h2>Tenue des délais</h2>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('edit')} Changer la date</button>` : ''}</div>
    <div class="carte delais">
      <div class="delais-faits">
        <div class="delais-fait">
          <p class="surtitre">Livraison prévue</p>
          <p class="delais-valeur">${echapper(projet.cible ? dateLongue(projet.cible) : 'Non fixée')}</p>
          <p class="delais-nuance">${echapper(histoire)}</p>
        </div>
        <div class="delais-fait">
          <p class="surtitre">${n !== null && n < 0 && !clos ? 'Retard' : 'Il reste'}</p>
          <p class="delais-valeur nb">${echapper(reste.valeur)}</p>
          ${reste.nuance ? `<p class="delais-nuance">${echapper(reste.nuance)}</p>` : ''}
        </div>
        <div class="delais-fait">
          <p class="surtitre">La date est-elle tenue ?</p>
          <p class="delais-valeur delais-valeur--${tonVerdict}">${echapper(delai ? delai.libelle : 'Pas de date')}</p>
          ${nuanceVerdict ? `<p class="delais-nuance">${echapper(nuanceVerdict)}</p>` : ''}
        </div>
      </div>

      ${temps !== null && !clos ? `<div class="delais-jauges">
        ${jauge('Temps écoulé depuis le début', temps, 'temps', `${temps} % du temps prévu est écoulé`)}
        ${travail !== null ? jauge('Travail fait', travail, travail >= temps ? 'vert' : 'ambre', `${travail} % du travail est fait`) : ''}
        ${lecture ? `<p class="delais-lecture">${echapper(lecture)}</p>` : ''}
      </div>` : ''}

      ${risques.length ? `<div class="delais-risques">
        <p class="surtitre">Ce qui peut retarder la livraison</p>
        <ul class="delais-liste">${risques.map((r) => `<li><span class="puce puce--ambre"><i aria-hidden="true"></i></span><span>${/demandes? en attente de votre réponse/.test(r) ? `<a href="#/projets/${echapper(pid)}/demandes?filtre=pour-vous">${echapper(r)}</a>` : echapper(r)}</span></li>`).join('')}</ul>
        ${etapesEnRetard.length ? `<p class="t-micro" style="margin-top:8px"><a href="#/projets/${echapper(pid)}/etapes">Voir les étapes concernées</a></p>` : ''}
      </div>` : ''}

      ${reports.length ? `<div class="delais-reports">
        <p class="surtitre">Les changements de date</p>
        <div class="chrono" style="margin-top:10px">
          ${reports.slice().reverse().map((r) => chronoItem({
            icone: 'calendrier', ton: 'ambre',
            texte: `Reportée du <strong>${echapper(dateCourte(r.de))}</strong> au <strong>${echapper(dateCourte(r.vers))}</strong> · ${echapper(MOTIFS_REPORT[r.motif] || r.motif || 'motif non précisé')}${r.note ? `<br><span class="t-3">${echapper(r.note)}</span>` : ''}`,
            date: `${dateCourte(r.le)}${r.par ? ` · ${r.par}` : ''}`,
          })).join('')}
        </div>
      </div>` : ''}
    </div>
  </section>`;
};

/* Le verdict d'une étape : la même règle que pour le projet, en plus
   court. Une étape terminée est close, sa date n'a plus d'objet. */
const delaiEtape = (j) => verdictDelai(j.fin, { clos: j.statut === 'termine', risques: j.statut === 'bloque' ? ['bloquée'] : [] });

/* Une étape de la frise. C'est un bouton : la carte ne tient que trois
   lignes, le détail vit dans la fiche qu'elle ouvre. */
const phaseHtml = (j) => {
  const classe = j.statut === 'termine' ? 'phase--terminee' : j.statut === 'en-cours' ? 'phase--en-cours' : j.statut === 'bloque' ? 'phase--bloquee' : '';
  const v = delaiEtape(j);
  return `<button class="phase ${classe}" type="button" data-action="ouvrir-etape" data-id="${echapper(j.id)}" data-astuce="Voir le détail">
    <span class="phase-etat"><i aria-hidden="true"></i><span class="t-micro t-3">${echapper((STATUTS_ETAPE[j.statut] || {}).libelle || '')}</span></span>
    <span class="phase-nom">${echapper(j.titre)}</span>
    <span class="phase-sous">${echapper([j.phase, dateCourte(j.fin) ? `fin ${dateCourte(j.fin)}` : ''].filter(Boolean).join(' · '))}${v.cle === 'depasse' ? ` <span class="t-alerte">· dépassée ${echapper(v.detail)}</span>` : ''}</span>
    ${j.statut !== 'termine' && borner(j.progression) > 0 ? progression(j.progression) : ''}
  </button>`;
};

/* Combien de temps une étape aura duré, en clair. */
const duree = (debut, fin) => {
  const a = enDate(debut); const b = enDate(fin);
  if (!a || !b) return '';
  const jours = Math.max(0, Math.round((b - a) / 86400000));
  if (jours < 14) return pluriel(jours || 1, 'jour');
  if (jours < 70) return pluriel(Math.round(jours / 7), 'semaine');
  if (jours < 365) return pluriel(Math.round(jours / 30), 'mois', 'mois');
  return pluriel(Math.round(jours / 365), 'an');
};

/*
 * La fiche d'une étape. Une carte de trois lignes ne dit ni ce qu'on y
 * fait, ni ce qui la retient, ni ce qui a bougé : tout cela vit ici, et
 * on l'ouvre d'un clic sur la carte.
 */
const ouvrirEtape = (j, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const v = delaiEtape(j);
  const reports = reportsDe(j);
  const origine = dateOrigine(j, 'fin');
  const decalee = origine && j.fin && dateCourte(origine) !== dateCourte(j.fin);
  const taches = d.taches.filter((t) => t.jalon === j.id);
  const faites = taches.filter((t) => t.statut === 'terminee').length;
  const parties = (Array.isArray(j.composants) ? j.composants : [])
    .map((id) => d.composants.find((c) => c.id === id)).filter(Boolean);
  const versions = d.releases.filter((r) => {
    const x = enDate(r.date); const a = enDate(j.debut); const b = enDate(j.fin);
    return x && a && b && x >= a && x <= b;
  }).sort(parDateDesc('date'));

  const m = modale({
    titre: j.titre,
    sousTitre: [j.phase, (STATUTS_ETAPE[j.statut] || {}).libelle].filter(Boolean).join(' · '),
    corps: `
      <div class="rang" style="margin-bottom:18px">
        ${pastille(STATUTS_ETAPE, j.statut || 'a-venir')}
        ${verdictHtml(v, { vide: false })}
      </div>
      ${/* Une barre, pas un autre pourcentage : le seul chiffre du projet
            est l'anneau de l'aperçu. */ ''}
      ${j.statut !== 'termine' && borner(j.progression) > 0 ? `<div style="margin:-8px 0 18px"><p class="t-micro t-3" style="margin-bottom:4px">avancement de l'étape</p>${progression(j.progression)}</div>` : ''}

      ${j.description ? `<div class="prose t-corps">${avecLiens(j.description)}</div>` : '<p class="t-petit t-3">Pas encore de description.</p>'}

      <dl class="faits" style="margin-top:20px">
        ${fait('Début', j.debut ? echapper(dateLongue(j.debut)) : '')}
        ${fait('Fin prévue', dateLongue(j.fin) ? `${echapper(dateLongue(j.fin))}${decalee ? `<br><span class="t-micro t-3">initialement le ${echapper(dateCourte(origine))}</span>` : ''}` : '')}
        ${fait('Durée', echapper(duree(j.debut, j.fin)))}
        ${fait('Suivie par', echapper(j.responsable ? (nomEquipe(d.equipe, j.responsable) || 'Capmedia') : ''))}
      </dl>

      ${parties.length ? `<div style="margin-top:22px">
        <p class="surtitre">Ce qu'elle touche</p>
        <div class="rang" style="margin-top:8px">${parties.map((c) => (iconePlateforme(c.type) ? pucePlateforme(c.type) : `<span class="etiquette">${echapper(c.nom)}</span>`)).join('')}</div>
      </div>` : ''}

      ${taches.length ? `<div style="margin-top:22px">
        <p class="surtitre">Les tâches de cette étape <span class="compte-section">${faites}/${taches.length}</span></p>
        <div class="liste" style="margin-top:8px">${taches.map((t) => ligne({
          icone: t.statut === 'terminee' ? 'check' : t.statut === 'bloquee' ? 'alerte' : 'taches',
          ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : t.statut === 'en-cours' ? 'bleu' : '',
          titre: echapper(t.titre),
          sous: echapper([(d.composants.find((c) => c.id === t.composant) || {}).nom, t.echeance && `pour le ${dateCourte(t.echeance)}`].filter(Boolean).join(' · ')),
          fin: pastille(STATUTS_TACHE, t.statut || 'a-faire', { client: !equipe }),
        })).join('')}</div>
      </div>` : ''}

      ${versions.length ? `<div style="margin-top:22px">
        <p class="surtitre">Livré pendant cette étape</p>
        <div class="liste" style="margin-top:8px">${versions.map((r) => ligne({
          icone: iconePlateforme(r.plateforme) || 'releases', ton: tonPlateforme(r.plateforme),
          titre: echapper(`${(PLATEFORMES[r.plateforme] || {}).libelle || ''} ${r.version || ''}`.trim()),
          sous: echapper([r.titre, r.date && dateCourte(r.date)].filter(Boolean).join(' · ')),
          fin: pastille(STATUTS_RELEASE, r.statut || 'disponible'),
        })).join('')}</div>
      </div>` : ''}

      ${reports.length ? `<div style="margin-top:22px">
        <p class="surtitre">L'histoire de cette date</p>
        <div class="chrono" style="margin-top:10px">${reports.slice().reverse().map((r) => chronoItem({
          icone: 'calendrier', ton: 'ambre',
          texte: `Reportée du <strong>${echapper(dateCourte(r.de))}</strong> au <strong>${echapper(dateCourte(r.vers))}</strong> · ${echapper(MOTIFS_REPORT[r.motif] || r.motif || 'motif non précisé')}${r.note ? `<br><span class="t-3">${echapper(r.note)}</span>` : ''}`,
          date: `${dateCourte(r.le)}${r.par ? ` · ${r.par}` : ''}`,
        })).join('')}</div>
      </div>` : ''}`,
    pied: equipe
      ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : `<button class="btn btn-secondaire" type="button" data-question>Une question sur cette étape</button><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('jalon', env, { pid, fiche: j }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('jalon', env, { pid, fiche: j, libelle: 'cette étape' }); if (ok) m.fermer(); });
  /* La question part dans la bulle, sur la page : quitter la fiche pour
     la messagerie faisait perdre l'étape des yeux. */
  sur(m.el, 'click', '[data-question]', () => { m.fermer(); ouvrirBulle(pid, `À propos de l'étape « ${j.titre} » : `); });
};

/* --- Les parties du projet (équipe) --------------------------------------- */
const composants = (d, { env }) => `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Les parties du projet</h2>${boutonNouveau(env, 'composant', 'Ajouter')}</div>
    ${d.composants.length ? `<div class="liste">${d.composants.map((c) => ligne({
      icone: iconePlateforme(c.type) || 'composants', ton: tonPlateforme(c.type),
      titre: `${echapper(c.nom)} <span class="t-3 t-petit" style="font-weight:400">· ${echapper(TYPES_COMPOSANT[c.type] || c.type || '')}</span>`,
      sous: `${echapper([c.version && `v${c.version}`, c.versionPrep && `${c.versionPrep} en prépa.`, c.environnement, (c.techno || []).join(', ')].filter(Boolean).join(' · '))}`,
      fin: `<span class="nb t-petit" style="min-width:44px;text-align:right">${borner(c.progression)} %</span>${pastille(STATUTS_COMPOSANT, c.statut || 'en-cours')}${boutonsEdition(env, 'composant', c.id, c.nom)}`,
    })).join('')}</div>` : vide({ icone: 'composants', titre: 'Aucune partie', texte: 'Découpez le projet pour suivre chacune de ses parties.', compact: true })}
  </section>`;

/* --- Feuille de route ----------------------------------------------------- */
const etapes = (d, { env, pid }) => {
  /* Ce qui bouge d'abord, puis du plus récent au plus ancien : autant
     dans la frise que dans les phases, et les phases entre elles. */
  const phases = phasesTriees(d.jalons);
  /* Les devis qui ont leurs lignes en étapes viennent d'abord, pour
     l'équipe seule : c'est là qu'elle coche ce qui est livré. Le client ne
     les voit plus ici (Nadir, 02/10/2026) : sa feuille de route montre les
     étapes du projet, le devis vit dans « Devis et factures ». */
  const frises = env.role === 'equipe' ? devisAvecEtapes(d.documents, d.jalons, { equipe: true }).map((dv) => friseDevis(dv, d.jalons, { equipe: true, pid })).join('') : '';
  return `
  ${frises ? `<section class="section" style="margin-top:0">
    <div class="section-tete"><div><h2>Le devis, ligne par ligne</h2><p class="chapo">Chaque ligne du devis est une étape. ${env.role === 'equipe' ? 'Cochez ce qui est livré : le client le voit aussitôt.' : 'Ce qui est coché est livré.'}</p></div></div>
    ${frises}
  </section>` : ''}
  <section class="section" style="${frises ? '' : 'margin-top:0'}">
    <div class="section-tete"><h2>Feuille de route</h2>${boutonNouveau(env, 'jalon', 'Nouvelle étape', { ordre: d.jalons.length + 1 })}</div>
    ${d.jalons.length ? `<div class="route" style="margin-bottom:var(--e-6)">${trierEtapes(d.jalons).map(phaseHtml).join('')}</div>
    ${phases.map((p) => `<div class="section" style="margin-top:var(--e-5)">
      <p class="surtitre" style="margin-bottom:8px">${echapper(p.nom)}</p>
      <div class="liste">${p.jalons.map((j) => {
        const tachesDuJalon = d.taches.filter((t) => t.jalon === j.id);
        const faites = tachesDuJalon.filter((t) => t.statut === 'terminee').length;
        return ligne({
          icone: j.statut === 'termine' ? 'check' : j.statut === 'bloque' ? 'alerte' : 'drapeau', ton: j.statut === 'termine' ? 'vert' : j.statut === 'bloque' ? 'rouge' : j.statut === 'en-cours' ? 'bleu' : '',
          titre: echapper(j.titre),
          sous: `${echapper([j.debut && dateCourte(j.debut), j.fin && `→ ${dateCourte(j.fin)}`, tachesDuJalon.length ? `${faites}/${tachesDuJalon.length} tâches` : '', j.description].filter(Boolean).join(' · '))}${reportsDe(j).length ? ` · <span class="t-3">${echapper(pluriel(reportsDe(j).length, 'report'))}, initialement ${echapper(dateCourte(dateOrigine(j, 'fin')))}</span>` : ''}`,
          fin: `${verdictHtml(delaiEtape(j), { vide: false, detail: j.statut !== 'termine' })}${j.statut !== 'termine' ? `<span style="width:80px">${progression(j.progression)}</span>` : ''}${pastille(STATUTS_ETAPE, j.statut || 'a-venir')}<button class="btn-icone" type="button" data-action="ouvrir-etape" data-id="${echapper(j.id)}" aria-label="Voir le détail" data-astuce="Voir le détail">${icone('info')}</button>${boutonsEdition(env, 'jalon', j.id, j.titre)}`,
        });
      }).join('')}</div>
    </div>`).join('')}`
    : vide({ icone: 'route', titre: 'Aucune étape pour le moment', texte: env.role === 'equipe' ? 'Posez les grandes étapes : cadrage, design, développement, tests, publication.' : 'Les étapes du projet apparaîtront ici.' })}
  </section>`;
};

/* --- Tâches ----------------------------------------------------------------- */
const taches = (d, { env, pid }) => {
  const equipe = env.role === 'equipe';
  const mode = (() => { try { return localStorage.getItem('suivi:taches-vue') || 'liste'; } catch (e) { return 'liste'; } })();
  const liste = d.taches.slice().sort((a, b) => ((STATUTS_TACHE[a.statut] || {}).ordre || 9) - ((STATUTS_TACHE[b.statut] || {}).ordre || 9) || ((PRIORITES[a.priorite] || {}).rang || 9) - ((PRIORITES[b.priorite] || {}).rang || 9));
  const ligneTache = (t) => {
    const f = t.echeance && t.statut !== 'terminee' ? calcEcheance(t.echeance) : null;
    return ligne({
      icone: t.statut === 'terminee' ? 'check' : t.statut === 'bloquee' ? 'alerte' : 'taches', ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : t.statut === 'attente-client' ? 'ambre' : t.statut === 'repondu' ? 'violet' : t.statut === 'en-cours' ? 'bleu' : '',
      titre: `${echapper(t.titre)}${t.visibilite === 'interne' ? ' <span class="etiquette" style="vertical-align:middle">Interne</span>' : ''}`,
      sous: `${(() => { const c = d.composants.find((x) => x.id === t.composant); return c && iconePlateforme(c.type) ? pucePlateforme(c.type, { court: true }) : ''; })()}${echapper([(d.composants.find((c) => c.id === t.composant) || {}).nom, t.assigne && nomEquipe(d.equipe, t.assigne), t.estimation].filter(Boolean).join(' · '))}${f ? ` ${echeanceHtml(f)}` : ''}${t.checklist && t.checklist.length ? ` <span class="t-3">${t.checklist.filter((c) => c.fait).length}/${t.checklist.length}</span>` : ''}`,
      fin: `${puce(PRIORITES, t.priorite || 'normale')}${pastille(STATUTS_TACHE, t.statut || 'a-faire', { client: !equipe })}`,
      action: 'ouvrir-tache', attrs: `data-id="${echapper(t.id)}"`,
    });
  };
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete">
      <h2>${equipe ? 'Tâches' : 'Tâches en cours de traitement par Capmedia'}</h2>
      <div class="rang">
        <div class="segments" role="group" aria-label="Affichage"><button type="button" data-vue-taches="liste" aria-pressed="${mode === 'liste'}">${icone('liste')} Liste</button><button type="button" data-vue-taches="kanban" aria-pressed="${mode === 'kanban'}">${icone('kanban')} Kanban</button></div>
        ${boutonNouveau(env, 'tache', 'Nouvelle tâche')}
      </div>
    </div>
    ${!liste.length ? vide({ icone: 'taches', titre: 'Aucune tâche visible', texte: equipe ? 'Créez la première tâche du projet.' : 'Les tâches partagées avec vous apparaîtront ici.' })
    : mode === 'kanban' ? `<div class="kanban">${parStatut(liste, STATUTS_TACHE).map((col) => `<div class="kanban-col"><div class="kanban-tete"><span class="puce puce--${col.fiche.voile}"><i></i></span>${echapper(col.fiche.libelle)}<span class="badge">${col.items.length}</span></div>
      ${col.items.map((t) => `<button class="kanban-carte" type="button" data-action="ouvrir-tache" data-id="${echapper(t.id)}"><p class="titre">${echapper(t.titre)}</p><div class="sous">${puce(PRIORITES, t.priorite || 'normale')}${dateCourte(t.echeance) ? `<span>${echapper(dateCourte(t.echeance))}</span>` : ''}${t.assigne ? avatar(nomEquipe(d.equipe, t.assigne) || 'C', { equipe: true, taille: 'petit' }) : ''}</div></button>`).join('')}
    </div>`).join('')}</div>`
    : `<div class="liste">${liste.map(ligneTache).join('')}</div>`}
  </section>`;
};

const ouvrirTache = (t, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const composant = d.composants.find((c) => c.id === t.composant);
  const jalon = d.jalons.find((j) => j.id === t.jalon);
  const f = t.echeance ? calcEcheance(t.echeance) : null;
  const m = modale({
    titre: t.titre, sousTitre: [composant && composant.nom, jalon && jalon.titre].filter(Boolean).join(' · '), feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px">${pastille(STATUTS_TACHE, t.statut || 'a-faire', { client: !equipe })}${puce(PRIORITES, t.priorite || 'normale')}${f ? echeanceHtml(f) : ''}${t.visibilite === 'interne' ? '<span class="etiquette">Interne</span>' : ''}</div>
      ${t.description ? `<div class="prose t-corps">${avecLiens(t.description)}</div>` : '<p class="t-petit t-3">Pas de description.</p>'}
      <dl class="faits" style="margin-top:20px">${fait('Assignée à', echapper(t.assigne ? nomEquipe(d.equipe, t.assigne) || 'Capmedia' : 'Personne'))}${fait('Échéance', t.echeance ? echapper(dateCourte(t.echeance)) : '')}${fait('Estimation', echapper(t.estimation || ''))}${fait('Progression', `${borner(t.progression)} %`)}</dl>
      ${t.checklist && t.checklist.length ? `<div style="margin-top:20px"><p class="surtitre">Liste de contrôle</p><div style="margin-top:6px">${t.checklist.map((c, i) => `<label class="coche${c.fait ? ' faite' : ''}"><input type="checkbox" data-coche="${i}" ${c.fait ? 'checked' : ''} ${equipe ? '' : 'disabled'}><span>${echapper(c.texte)}</span></label>`).join('')}</div></div>` : ''}
      ${equipe ? `<div style="margin-top:24px"><p class="surtitre">Changer le statut</p><div class="rang" style="margin-top:8px">${Object.entries(STATUTS_TACHE).map(([cle, s]) => `<button class="filtre${t.statut === cle ? ' actif' : ''}" type="button" data-statut="${cle}">${echapper(s.libelle)}</button>`).join('')}</div></div>` : ''}
      ${t.reponseClient ? `<div style="margin-top:20px">${encart(`<strong>${equipe ? `${echapper(t.reponseClient.nom || 'Le client')} a répondu` : 'Votre réponse'}</strong> le ${echapper(dateHeure(t.reponseClient.date))}${t.reponseClient.texte ? `<div class="prose" style="margin-top:6px">${avecLiens(t.reponseClient.texte)}</div>` : ''}${(t.reponseClient.pieces || []).length ? `<div class="pieces" style="margin-top:8px">${t.reponseClient.pieces.map(pieceHtml).join('')}</div>` : ''}`, 'ok', 'check')}</div>` : ''}
      ${t.statut === 'attente-client' && !equipe ? `<div style="margin-top:20px">${encart('<strong>Nous attendons votre retour sur cette tâche.</strong> Répondez ici, avec un fichier si besoin : elle revient chez nous aussitôt.', 'attention', 'alerte')}
        <form id="forme-reponse-tache" class="forme" style="margin-top:14px" novalidate>
          <div class="groupe"><label class="etiquette-champ" for="reponse-tache">Votre réponse</label><textarea class="zone" id="reponse-tache" name="texte" rows="4" maxlength="4000" placeholder="Ce que vous avez fait, ou ce qui vous manque."></textarea></div>
          <div class="groupe"><span class="etiquette-champ">Vos fichiers <span class="facultatif">(facultatif)</span></span><div id="zone-pieces-tache"></div></div>
        </form></div>` : ''}`,
    pied: equipe ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : (t.statut === 'attente-client'
        ? `<a class="btn btn-secondaire" href="#/messages/${echapper(pid)}">Écrire à Capmedia</a><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-envoyer-reponse>${icone('envoyer')} Envoyer ma réponse</button>`
        : `<a class="btn btn-secondaire" href="#/messages/${echapper(pid)}">Écrire à Capmedia</a><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`),
  });
  /* La réponse du client : un texte ou des fichiers (rangés sous
     « reponse » de la tâche), et la tâche passe « réponse reçue ». */
  const zoneReponse = m.el.querySelector('#zone-pieces-tache');
  const boite = zoneReponse ? depot(zoneReponse, { chemin: `projets/${pid}/taches/${t.id}/reponse`, texte: 'Joignez une <strong>capture ou un document</strong>.' }) : null;
  sur(m.el, 'click', '[data-envoyer-reponse]', async (el) => {
    const texte = (m.el.querySelector('#reponse-tache') || { value: '' }).value.trim();
    if (boite && boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    if (!texte && !(boite && boite.pieces.length)) { toast('Écrivez un mot, ou joignez un fichier.', 'erreur'); m.el.querySelector('#reponse-tache').focus(); return; }
    const ok = await agir(el, () => ecrire.repondreTache(env.session, t.id, texte, boite ? boite.pieces : []), 'Merci, votre réponse est transmise.');
    if (ok) m.fermer(true);
  });
  brancherPieces(m.el);
  sur(m.el, 'click', '[data-statut]', (el) => agir(null, () => ecrire.majTache(t.id, { statut: el.dataset.statut, progression: el.dataset.statut === 'terminee' ? 100 : undefined })).then(() => m.fermer()));
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('tache', env, { pid, fiche: t }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('tache', env, { pid, fiche: t, libelle: 'cette tâche' }); if (ok) m.fermer(); });
  sur(m.el, 'change', '[data-coche]', (el) => {
    const checklist = (t.checklist || []).map((c, i) => (i === Number(el.dataset.coche) ? { ...c, fait: el.checked } : c));
    agir(null, () => ecrire.majTache(t.id, { checklist }));
  });
};

/* Qui doit agir sur un point bloquant, dit à la personne qui lit : le
   client lit « De votre côté », jamais « le client ». */
const coteBlocage = (responsable, equipe) => (equipe
  ? ({ client: 'Responsable : le client', capmedia: 'Responsable : Capmedia', tiers: 'Responsable : un tiers' }[responsable] || `Responsable : ${responsable || ''}`)
  : ({ client: 'De votre côté', capmedia: 'De notre côté', tiers: 'Un tiers' }[responsable] || 'De notre côté'));

/* La fiche d'un point bloquant. Côté client : ce qu'on attend de lui,
   pour quand, et deux gestes : « C'est fait » (une fois, l'équipe lève
   ensuite) ou « Répondre » dans la bulle du projet, le sujet déjà posé.
   Côté équipe : la même fiche, avec ce que le client a dit. */
const ouvrirBlocage = (b, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const composant = d.composants.find((c) => c.id === b.composant);
  const aMoi = !equipe && b.responsable === 'client';
  const dejaDit = Boolean(b.signaleFait);
  const m = modale({
    titre: b.titre, sousTitre: [coteBlocage(b.responsable, equipe), composant && composant.nom].filter(Boolean).join(' · '), feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px">${b.resolu ? pastilleTexte('Levé', 'vert') : pastilleTexte('Ouvert', 'rouge')}${b.echeance && !b.resolu ? echeanceHtml(calcEcheance(b.echeance)) : ''}</div>
      ${b.description ? `<div class="prose t-corps">${avecLiens(b.description)}</div>` : '<p class="t-petit t-3">Pas de description.</p>'}
      ${b.attendu ? `<div style="margin-top:20px">${encart(`<strong>${equipe ? 'Ce qu\'on attend du client' : 'Ce qu\'on attend de vous'}</strong><div class="prose" style="margin-top:6px">${avecLiens(b.attendu)}</div>`, 'attention', 'alerte')}</div>` : (aMoi ? `<div style="margin-top:20px">${encart('<strong>Ce point dépend de vous.</strong> Si vous ne voyez pas quoi faire, répondez-nous : on vous guide.', 'attention', 'alerte')}</div>` : '')}
      <dl class="faits" style="margin-top:20px">${fait('Depuis le', echapper(dateCourte(b.depuis)))}${fait('Attendu pour le', b.echeance ? echapper(dateCourte(b.echeance)) : '')}${fait('Impact', echapper(b.impact || ''))}${fait('Levé le', b.resolu ? echapper(dateCourte(b.resolu)) : '')}</dl>
      ${dejaDit ? `<div style="margin-top:20px">${encart(`<strong>${equipe ? `${echapper(b.signaleFait.nom || 'Le client')} dit que c'est fait` : 'Vous avez dit que c\'est fait'}</strong> le ${echapper(dateHeure(b.signaleFait.date))}${b.signaleFait.texte ? `<div class="prose" style="margin-top:6px">${avecLiens(b.signaleFait.texte)}</div>` : ''}<p class="t-micro t-3" style="margin-top:6px">${equipe ? 'Vérifiez, puis levez le point.' : 'Capmedia vérifie et lève le point.'}</p>`, 'ok', 'check')}</div>` : ''}
      ${aMoi && !dejaDit && !b.resolu ? `<div class="groupe" style="margin-top:20px"><label class="etiquette-champ" for="mot-blocage">Un mot pour nous <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="mot-blocage" rows="2" maxlength="2000" placeholder="Compte créé, invitation envoyée."></textarea></div>` : ''}`,
    pied: equipe
      ? `${!b.resolu ? `<button class="btn btn-ok" type="button" data-lever>${icone('check')} Levé</button>` : ''}<span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : `${aMoi && !b.resolu ? `<button class="btn btn-secondaire" type="button" data-repondre>${icone('messages')} Répondre</button>` : ''}<span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>${aMoi && !dejaDit && !b.resolu ? `<button class="btn btn-ok" type="button" data-fait>${icone('check')} C'est fait</button>` : ''}`,
  });
  sur(m.el, 'click', '[data-fait]', async (el) => {
    const texte = (m.el.querySelector('#mot-blocage') || { value: '' }).value.trim();
    const ok = await agir(el, () => ecrire.signalerBlocageFait(env.session, b.id, texte), 'Merci, nous vérifions et levons le point.');
    if (ok) m.fermer(true);
  });
  sur(m.el, 'click', '[data-repondre]', () => {
    /* La bulle du projet s'ouvre avec le sujet déjà posé (bulle.js écoute). */
    m.fermer();
    document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: pid, texte: `À propos du point bloquant « ${b.titre} » : ` } }));
  });
  sur(m.el, 'click', '[data-lever]', (el) => agir(el, () => ecrire.majBlocage(b.id, { resolu: new Date() }), 'Point bloquant levé.').then((ok) => { if (ok) m.fermer(true); }));
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('blocage', env, { pid, fiche: b }); });
  return m.fin;
};

/* --- Demandes ----------------------------------------------------------------- */
const demandes = (d, { env, pid, attente = [] }) => {
  const equipe = env.role === 'equipe';
  /* Chez le client, l'onglet ouvre sur ce qui attend sa main dans ce
     projet : c'est là que se range le pavé « En attente de vous » de
     l'aperçu et de l'accueil quand il le ferme, et d'où il le réaffiche.
     Les devis et les factures n'y sont pas : ils ont leur place, et leur
     chiffre, dans « Devis et factures ». */
  const aMoi = equipe ? [] : attente.filter((a) => a.genre !== 'devis' && a.genre !== 'facture');
  const fermeIci = !equipe && etatPave(`projet:${pid}`) === 'ferme';
  const fermeAccueil = !equipe && etatPave('accueil') === 'ferme';
  const blocAttente = equipe ? '' : `<section class="section" id="en-attente-projet" style="margin-top:0">
    <div class="section-tete"><h2>En attente de vous${aMoi.length ? ` <span class="compte-section compte-section--vif">${aMoi.length}</span>` : ''}</h2></div>
    ${aMoi.length ? `<div class="liste">${aMoi.map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div>`
    : '<p class="t-petit t-2">Rien ne vous attend sur ce projet. Tout avance de notre côté.</p>'}
    ${fermeIci || fermeAccueil ? `<div class="pile" style="margin-top:12px;gap:8px">
      ${fermeIci ? reafficherHtml({ cle: `projet:${pid}`, texte: 'Le bloc « En attente de vous » est rangé ici au lieu de l\'aperçu du projet.', bouton: 'Réafficher dans l\'aperçu' }) : ''}
      ${fermeAccueil ? reafficherHtml({ cle: 'accueil', texte: 'Le bloc « En attente de vous » est rangé ici au lieu de votre accueil.', bouton: 'Réafficher sur l\'accueil' }) : ''}
    </div>` : ''}
  </section>`;
  const filtre = (() => { try { return sessionStorage.getItem(`suivi:filtre-demandes:${pid}`) || 'ouvertes'; } catch (e) { return 'ouvertes'; } })();
  const tous = d.tickets.slice().sort(parDateDesc('maj'));
  const groupes = {
    ouvertes: tous.filter((t) => OUVERTS.includes(t.statut)),
    moi: tous.filter((t) => ATTEND_CLIENT.includes(t.statut)),
    terminees: tous.filter((t) => !OUVERTS.includes(t.statut)),
    toutes: tous,
  };
  const liste = groupes[filtre] || groupes.ouvertes;
  /* Côté client, le « non lu » est celui de la personne (lu.clients[uid])
     quand il existe, sinon le repère commun d'avant (lu.client). */
  const nonLu = (t) => { const l = t.lu || {}; const marque = equipe ? l.equipe : ((l.clients || {})[env.session.utilisateur.uid] || l.client); return !marque || ((t.maj && t.maj.toMillis ? t.maj.toMillis() : 0) > (marque.toMillis ? marque.toMillis() : 0)); };
  return `
  ${blocAttente}
  <section class="section"${equipe ? ' style="margin-top:0"' : ''} id="demandes-projet">
    <div class="section-tete"><h2>${equipe ? 'Demandes' : `Demandes ${echapper(d.projet.nom || '')}`}</h2><a class="btn btn-principal btn-petit" href="#/projets/${echapper(pid)}/nouvelle-demande">${icone('plus')} Nouvelle demande</a></div>
    <div class="filtres" style="margin-bottom:16px">
      ${[['ouvertes', 'Ouvertes'], ['moi', equipe ? 'Côté client' : 'Pour vous'], ['terminees', 'Terminées'], ['toutes', 'Toutes']].map(([cle, lib]) => `<button class="filtre${filtre === cle ? ' actif' : ''}" type="button" data-filtre-demandes="${cle}">${lib}<span class="compte">${groupes[cle].length}</span></button>`).join('')}
    </div>
    ${liste.length ? `<div class="liste">${liste.map((t) => ligne({
      href: `#/projets/${echapper(pid)}/demandes/${echapper(t.id)}`,
      icone: iconePlateforme(t.plateforme) || (TYPES[t.type] || {}).icone || 'inbox',
      ton: tonPlateforme(t.plateforme) || (ATTEND_CLIENT.includes(t.statut) ? 'ambre' : t.statut === 'resolu' ? 'vert' : ''),
      nonLu: nonLu(t) && OUVERTS.includes(t.statut),
      titre: `${t.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(t.numero)}</span> ` : ''}${echapper(t.titre)}`,
      sous: `${echapper((TYPES[t.type] || {}).libelle || t.type)} · ${puce(URGENCES, t.urgence || 'important')} · ${echapper(OUVERTS.includes(t.statut) ? `ouverte depuis ${age(t.cree)}` : `close ${depuis(t.maj)}`)}${t.qualification ? ` · ${pastille(QUALIFICATIONS, t.qualification)}` : ''}`,
      fin: `${(() => {
        /* Qui l'a en main. C'est la question que le client posait par
           message, faute de lire la réponse quelque part. */
        const chez = (STATUTS[t.statut] || {}).chez;
        if (chez === 'client') return `<span class="puce puce--ambre"><i></i>${equipe ? 'Chez le client' : 'À vous'}</span>`;
        if (chez === 'capmedia') return '<span class="puce"><i></i>Chez Capmedia</span>';
        return '';
      })()}${pastille(STATUTS, t.statut, { client: !equipe })}`,
    })).join('')}</div>`
    : vide({ icone: 'demandes', titre: filtre === 'ouvertes' ? 'Aucune demande en cours' : 'Rien ici', texte: filtre === 'ouvertes' ? 'Tout semble en ordre pour le moment.' : '', action: `<a class="btn btn-secondaire" href="#/projets/${echapper(pid)}/nouvelle-demande">Créer une demande</a>` })}
  </section>`;
};

/* --- Fichiers --------------------------------------------------------------- */
const fichiers = (d, { env, pid }) => {
  const equipe = env.role === 'equipe';
  const filtre = (() => { try { return sessionStorage.getItem(`suivi:filtre-fichiers:${pid}`) || ''; } catch (e) { return ''; } })();
  const liste = d.fichiers.filter((f) => !filtre || f.categorie === filtre).sort(parDateDesc('cree'));
  const categories = Object.entries(CATEGORIES_FICHIER).filter(([cle]) => d.fichiers.some((f) => f.categorie === cle));
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Fichiers</h2><div class="rang">${equipe ? boutonNouveau(env, 'fichier', 'Déposer') : `<button class="btn btn-secondaire btn-petit" type="button" data-action="deposer-client">${icone('plus')} Envoyer un fichier</button>`}</div></div>
    ${categories.length > 1 ? `<div class="filtres" style="margin-bottom:16px"><button class="filtre${!filtre ? ' actif' : ''}" type="button" data-filtre-fichiers="">Tous<span class="compte">${d.fichiers.length}</span></button>${categories.map(([cle, lib]) => `<button class="filtre${filtre === cle ? ' actif' : ''}" type="button" data-filtre-fichiers="${cle}">${echapper(lib)}<span class="compte">${d.fichiers.filter((f) => f.categorie === cle).length}</span></button>`).join('')}</div>` : ''}
    ${liste.length ? `<div class="grille grille-2">${liste.map((f) => fichierHtml({ ...f, categorieLibelle: CATEGORIES_FICHIER[f.categorie] || f.categorie, par: f.par }, { menu: equipe, retirer: !equipe, moi: equipe ? '' : env.session.utilisateur.uid })).join('')}</div>`
    : vide({ icone: 'fichiers', titre: 'Aucun fichier', texte: equipe ? 'Déposez maquettes, livrables, documents.' : 'Vos maquettes, livrables et documents seront rangés ici. Vous pouvez aussi nous envoyer des captures ou des logos.' })}
  </section>`;
};

const ouvrirDepotClient = (pid, env) => {
  const m = modale({
    titre: 'Envoyer des fichiers', sousTitre: 'Captures, logos, documents : ils arrivent directement chez Capmedia.', feuille: true,
    corps: `<form class="forme" id="forme-depot" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="cat-depot">Catégorie</label><select class="select" id="cat-depot" name="categorie">${optionsDe(Object.fromEntries(CATEGORIES_CLIENT.map((c) => [c, CATEGORIES_FICHIER[c]])), 'captures')}</select></div>
      <div class="groupe"><label class="etiquette-champ" for="desc-depot">Un mot pour nous <span class="facultatif">(facultatif)</span></label><input class="champ" id="desc-depot" name="description" maxlength="200"></div>
      <div id="zone-depot"></div>
    </form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="forme-depot">Envoyer</button>`,
  });
  const boite = depot(m.el.querySelector('#zone-depot'), { chemin: () => `projets/${pid}/fichiers/${nouvelId('fichiers')}`, max: 20 });
  m.el.querySelector('#forme-depot').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const pieces = boite.pieces;
    if (!pieces.length) { toast('Choisissez au moins un fichier.', 'erreur'); return; }
    const d = lireForme(e.target);
    await agir(m.pied.querySelector('[type="submit"]'), async () => {
      for (const p of pieces) await ecrire.deposerFichier(env.session, pid, p, { categorie: d.categorie, description: d.description });
      m.fermer(true);
    }, pieces.length > 1 ? `${pieces.length} fichiers envoyés.` : 'Fichier envoyé.');
  });
};

/* --- Versions ------------------------------------------------------------------ */
const releases = (d, { env }) => {
  const liste = d.releases.slice().sort(parDateDesc('date'));
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Versions et changements</h2>${boutonNouveau(env, 'release', 'Nouvelle version')}</div>
    ${liste.length ? `<div class="pile" style="gap:var(--e-4)">${liste.map((r) => `<div class="carte" data-release="${echapper(r.id)}">
      <div class="rang-espace" style="align-items:flex-start">
        <div class="rang" style="gap:12px"><span class="ligne-icone${tonPlateforme(r.plateforme) ? ` ligne-icone--${tonPlateforme(r.plateforme)}` : ''}">${icone(iconePlateforme(r.plateforme) || 'releases')}</span><div><p class="t-titre-3 rang" style="gap:8px"><button class="lien" type="button" data-action="ouvrir-release" data-id="${echapper(r.id)}" style="font:inherit;color:inherit">${echapper(`${libellePlateforme(r.plateforme)} ${r.version || ''}`.trim())}</button>${r.titre ? ` <span class="t-2" style="font-weight:400">· ${echapper(r.titre)}</span>` : ''}</p><p class="t-petit t-3" style="margin-top:2px">${echapper([r.statut === 'disponible' ? (dateCourte(r.date) ? `Publiée le ${dateCourte(r.date)}` : 'Publiée, date non renseignée') : dateCourte(r.date), r.build && `build ${r.build}`, (d.composants.find((c) => c.id === r.composant) || {}).nom].filter(Boolean).join(' · '))}${r.visibilite === 'interne' ? ' · Interne' : ''}</p></div></div>
        <div class="rang">${pastille(STATUTS_RELEASE, r.statut || 'developpement')}${env.role === 'equipe' ? `<button class="btn-icone" type="button" data-action="editer" data-genre="release" data-id="${echapper(r.id)}" aria-label="Modifier">${icone('edit')}</button>` : ''}</div>
      </div>
      ${(r.notes || []).length ? `<ul style="margin-top:14px" class="pile" style="gap:6px">${r.notes.map((n) => `<li class="rang" style="gap:10px;align-items:flex-start"><span style="flex:none">${pastille(TYPES_CHANGEMENT, n.type || 'amelioration')}</span><span class="t-petit">${echapper(n.texte)}</span></li>`).join('')}</ul>` : ''}
      ${(r.liens && (r.liens.store || r.liens.test)) ? `<div class="rang" style="margin-top:14px">${r.liens.store ? `<a class="btn btn-secondaire btn-petit" href="${echapper(r.liens.store)}" target="_blank" rel="noopener">${icone('externe')} Ouvrir dans le store</a>` : ''}${r.liens.test ? `<a class="btn btn-doux btn-petit" href="${echapper(r.liens.test)}" target="_blank" rel="noopener">${icone('externe')} Version de test</a>` : ''}</div>` : ''}
    </div>`).join('')}</div>`
    : vide({ icone: 'releases', titre: 'Aucune version publiée', texte: 'Chaque mise en ligne sera listée ici avec ce qui change.' })}
  </section>`;
};

/*
 * La fiche d'une version, ouverte d'un clic ou par son adresse
 * (#/projets/:id/releases/:rid) : c'est elle que visent la notification
 * « Version disponible », la lettre et la recherche. Tout y est : la
 * plateforme, le numéro, le build, la partie, la date, les notes, les
 * liens.
 */
const ouvrirRelease = (r, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const partie = d.composants.find((c) => c.id === r.composant);
  const m = modale({
    titre: `${libellePlateforme(r.plateforme)} ${r.version || ''}`.trim(),
    sousTitre: [r.titre, (STATUTS_RELEASE[r.statut || 'developpement'] || {}).libelle].filter(Boolean).join(' · '),
    feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px">${pastille(STATUTS_RELEASE, r.statut || 'developpement')}${pucePlateforme(r.plateforme)}${r.visibilite === 'interne' ? '<span class="etiquette">Interne</span>' : ''}</div>
      <dl class="faits">
        ${fait(r.statut === 'disponible' ? 'Disponible depuis le' : 'Date', r.date ? echapper(dateLongue(r.date)) : '')}
        ${fait('Build', echapper(r.build || ''))}
        ${fait('Partie du projet', echapper(partie ? partie.nom : ''))}
        ${fait('Enregistrée par', echapper((r.par && r.par.nom) || ''))}
      </dl>
      ${(r.notes || []).length ? `<div style="margin-top:22px"><p class="surtitre">Ce qui change</p><ul class="pile" style="margin-top:8px;gap:6px">${r.notes.map((n) => `<li class="rang" style="gap:10px;align-items:flex-start"><span style="flex:none">${pastille(TYPES_CHANGEMENT, n.type || 'amelioration')}</span><span class="t-petit">${echapper(n.texte)}</span></li>`).join('')}</ul></div>` : '<p class="t-petit t-3" style="margin-top:16px">Aucune note de changement sur cette version.</p>'}
      ${(r.liens && (r.liens.store || r.liens.test)) ? `<div class="rang" style="margin-top:22px">${r.liens.store ? `<a class="btn btn-secondaire btn-petit" href="${echapper(r.liens.store)}" target="_blank" rel="noopener">${icone('externe')} Ouvrir dans le store</a>` : ''}${r.liens.test ? `<a class="btn btn-doux btn-petit" href="${echapper(r.liens.test)}" target="_blank" rel="noopener">${icone('externe')} Version de test</a>` : ''}</div>` : ''}`,
    pied: equipe
      ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : `<button class="btn btn-secondaire" type="button" data-question>Écrire à Capmedia</button><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('release', env, { pid, fiche: r }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('release', env, { pid, fiche: r, libelle: 'cette version' }); if (ok) m.fermer(); });
  sur(m.el, 'click', '[data-question]', () => { m.fermer(); ouvrirBulle(pid, `À propos de la version ${libellePlateforme(r.plateforme)} ${r.version || ''} : `); });
};

/* --- Ressources (les liens du projet) ------------------------------------------ */
const liens = (d, { env }) => {
  const groupes = Object.entries(CATEGORIES_LIEN).map(([cle, lib]) => ({ cle, lib, items: d.liens.filter((l) => l.categorie === cle) })).filter((g) => g.items.length);
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Ressources</h2>${boutonNouveau(env, 'lien', 'Ajouter un lien')}</div>
    ${groupes.length ? groupes.map((g) => `<div style="margin-bottom:var(--e-5)" data-groupe-liens="${echapper(g.cle)}"><p class="surtitre" style="margin-bottom:8px">${echapper(g.lib)}</p><div class="grille grille-2">${g.items.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener">
      <span class="ligne-icone${tonPlateforme(l.composant) ? ` ligne-icone--${tonPlateforme(l.composant)}` : ''}">${icone(iconePlateforme(l.composant) || (l.categorie === 'code' ? 'code' : l.categorie === 'design' ? 'sparkle' : l.categorie === 'mobile' ? 'releases' : l.categorie === 'acces' ? 'cle' : 'externe'))}</span>
      <span style="min-width:0"><span class="t-corps-fort" style="display:block">${echapper(l.nom)}${l.environnement ? ` <span class="etiquette" style="vertical-align:middle">${echapper(l.environnement)}</span>` : ''}${l.visibilite === 'interne' ? ' <span class="etiquette">Interne</span>' : ''}</span><span class="url" style="display:block">${echapper(l.url.replace(/^https?:\/\//, ''))}</span>${l.description ? `<span class="t-micro t-3" style="display:block">${echapper(l.description)}</span>` : ''}${l.categorie === 'acces' && l.identifiants ? `<span class="t-micro" style="display:block;margin-top:4px"><span class="t-3">Identifiant ·</span> <span class="t-mono" data-identifiants>${echapper(l.identifiants)}</span></span>` : ''}</span>
      <span class="rang" style="gap:2px">${l.categorie === 'acces' && l.identifiants ? `<button class="btn btn-doux btn-petit" type="button" data-action="copier-identifiants" data-id="${echapper(l.id)}" data-sans-lien>${icone('copier')} Copier</button>` : ''}${env.role === 'equipe' ? `<button class="btn-icone" type="button" data-action="editer" data-genre="lien" data-id="${echapper(l.id)}" aria-label="Modifier" data-sans-lien>${icone('edit')}</button>` : ''}<span class="chevron" style="color:var(--encre-4)">${icone('externe')}</span></span>
    </a>`).join('')}</div>${g.cle === 'acces' ? '<p class="aide" style="margin-top:8px">Le mot de passe ne s\'écrit jamais ici : il vous est transmis à part.</p>' : ''}</div>`).join('')
    : vide({ icone: 'liens', titre: 'Aucune ressource', texte: 'Production, stores, code source, environnements de test, maquettes : tout au même endroit.' })}
  </section>`;
};

/* --- Réunions -------------------------------------------------------------------- */
const reunions = (d, { env, pid }) => {
  /* « À venir » raisonne à l'heure, comme l'accueil (reunionAVenir) : une
     réunion de ce matin est passée l'après-midi. */
  const aVenir = d.reunions.filter(reunionAVenir).sort(parDateAsc('date'));
  const passees = d.reunions.filter((r) => !reunionAVenir(r)).sort(parDateDesc('date'));
  const bloc = (r) => ligne({
    icone: 'reunions', ton: reunionAVenir(r) ? 'bleu' : '',
    titre: echapper(r.titre), sous: `${echapper(dateHeure(r.date))}${r.duree ? ` · ${r.duree} min` : ''}${(r.participants || []).length ? ` · ${echapper(r.participants.map((p) => p.nom || p.email).join(', '))}` : ''}${r.visibilite === 'interne' ? ' · Interne' : ''}`,
    fin: `${lienReunion(r) && reunionAVenir(r) ? `<a class="btn btn-secondaire btn-petit" href="${echapper(lienReunion(r))}" target="_blank" rel="noopener" data-sans-propagation>${icone('video')} Rejoindre</a>` : ''}${r.compteRendu ? '<span class="etiquette">Compte rendu</span>' : ''}`,
    action: 'ouvrir-reunion', attrs: `data-id="${echapper(r.id)}"`,
  });
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Réunions</h2><div class="rang">${env.role === 'equipe' ? boutonNouveau(env, 'reunion', 'Programmer') : `<button class="btn btn-secondaire btn-petit" type="button" data-action="ecrire-bulle" data-texte="Je souhaite un créneau pour ">${icone('messages')} Demander un créneau</button>`}</div></div>
    ${aVenir.length ? `<p class="surtitre" style="margin-bottom:8px">À venir</p><div class="liste" style="margin-bottom:var(--e-6)">${aVenir.map(bloc).join('')}</div>` : ''}
    ${passees.length ? `<p class="surtitre" style="margin-bottom:8px">Passées</p><div class="liste">${passees.map(bloc).join('')}</div>` : ''}
    ${!d.reunions.length ? vide({ icone: 'reunions', titre: 'Aucune réunion', texte: 'Les rendez-vous, leur ordre du jour et leur compte rendu seront ici.' }) : ''}
  </section>`;
};

/*
 * La fiche d'une réunion, ouverte d'un clic ou par son adresse
 * (#/projets/:id/reunions/:rid). Le client y coche ses actions, y prend le
 * fichier d'agenda tant qu'elle est à venir, et lit le compte rendu daté.
 */
const ouvrirReunion = (r, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const aVenir = reunionAVenir(r);
  const sansContenu = !r.ordreDuJour && !r.compteRendu && !r.decisions && !(r.actions || []).length;
  const m = modale({
    titre: r.titre, sousTitre: `${dateHeure(r.date)}${r.duree ? ` · ${r.duree} min` : ''}${aVenir ? '' : ' · passée'}`, feuille: true,
    corps: `
      <div class="rang" style="gap:8px">
        ${lienReunion(r) && aVenir ? `<a class="btn btn-principal" href="${echapper(lienReunion(r))}" target="_blank" rel="noopener">${icone('video')} Rejoindre la réunion</a>` : ''}
        ${aVenir ? `<button class="btn btn-secondaire" type="button" data-ics>${icone('calendrier')} Ajouter à mon agenda</button>` : ''}
      </div>
      ${r.lieu ? `<div style="margin-top:20px"><p class="surtitre">Lieu</p><p class="t-petit" style="margin-top:6px">${echapper(r.lieu)}</p></div>` : ''}
      ${(r.participants || []).length ? `<div style="margin-top:20px"><p class="surtitre">Participants</p><p class="t-petit" style="margin-top:6px">${echapper(r.participants.map((p) => p.nom || p.email).join(', '))}</p></div>` : ''}
      ${r.ordreDuJour ? `<div style="margin-top:20px"><p class="surtitre">Ordre du jour</p><div class="prose t-corps" style="margin-top:6px">${enParagraphes(r.ordreDuJour)}</div></div>` : ''}
      ${r.compteRendu ? `<div style="margin-top:20px"><p class="surtitre">Compte rendu${dateCourte(r.compteRenduLe) ? ` <span class="t-3" style="text-transform:none;letter-spacing:0">· publié le ${echapper(dateCourte(r.compteRenduLe))}</span>` : ''}</p><div class="prose t-corps" style="margin-top:6px">${avecLiens(r.compteRendu)}</div></div>` : ''}
      ${r.decisions ? `<div style="margin-top:20px"><p class="surtitre">Décisions</p><div class="prose t-corps" style="margin-top:6px">${enParagraphes(r.decisions)}</div></div>` : ''}
      ${(r.actions || []).length ? `<div style="margin-top:20px"><p class="surtitre">Actions</p><p class="t-micro t-3" style="margin-top:2px">${equipe ? 'Le client peut cocher ce qui est fait.' : 'Cochez ce que vous avez fait : Capmedia le voit aussitôt.'}</p>${r.actions.map((a, i) => `<label class="coche${a.fait ? ' faite' : ''}"><input type="checkbox" data-action-reunion="${i}" ${a.fait ? 'checked' : ''}><span>${echapper(a.texte)}</span></label>`).join('')}</div>` : ''}
      ${sansContenu ? '<p class="t-petit t-3" style="margin-top:20px">Pas encore de contenu pour cette réunion.</p>' : ''}`,
    pied: equipe
      ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : `<button class="btn btn-secondaire" type="button" data-question>Écrire à Capmedia</button><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('reunion', env, { pid, fiche: r }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('reunion', env, { pid, fiche: r, libelle: 'cette réunion' }); if (ok) m.fermer(); });
  sur(m.el, 'click', '[data-ics]', () => telechargerICS(r, { nomProjet: () => (d.projet || {}).nom || '' }));
  sur(m.el, 'click', '[data-question]', () => { m.fermer(); ouvrirBulle(pid, `À propos de la réunion « ${r.titre} » : `); });
  /* Cocher, c'est écrire la liste entière avec la case changée : la règle
     ne laisse passer que ce champ. Si l'écriture échoue, la case revient. */
  sur(m.el, 'change', '[data-action-reunion]', async (el) => {
    const i = Number(el.dataset.actionReunion);
    const fait = el.checked;
    el.disabled = true;
    try {
      const actuelles = (magasin.lire(K.reunions(pid)) || []).find((x) => x.id === r.id);
      await ecrire.cocherAction(r.id, (actuelles || r).actions || [], i, fait);
      el.closest('.coche').classList.toggle('faite', fait);
    } catch (e) { el.checked = !fait; toast("L'action n'a pas pu être enregistrée.", 'erreur'); } finally { el.disabled = false; }
  });
};

/* --- Notes et décisions ------------------------------------------------------------ */
const notes = (d, { env }) => {
  const liste = d.notes.slice().sort(parDateDesc('date'));
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Décisions et notes</h2>${boutonNouveau(env, 'note', 'Nouvelle note')}</div>
    ${liste.length ? `<div class="liste">${liste.map((n) => ligne({
      icone: n.type === 'decision' ? 'drapeau' : n.type === 'risque' ? 'alerte' : n.type === 'idee' ? 'ampoule' : 'note', ton: (TYPES_NOTE[n.type] || {}).voile === 'violet' ? 'violet' : (TYPES_NOTE[n.type] || {}).voile === 'rouge' ? 'rouge' : '',
      titre: echapper(n.titre), sous: `${echapper(dateCourte(n.date))}${n.decidePar ? ` · ${echapper(n.decidePar)}` : ''}${n.visibilite === 'interne' ? ' · Interne' : ''}`,
      fin: pastille(TYPES_NOTE, n.type || 'information'), action: 'ouvrir-note', attrs: `data-id="${echapper(n.id)}"`,
    })).join('')}</div>`
    : vide({ icone: 'note', titre: 'Aucune décision consignée', texte: 'Les décisions importantes vivent ici plutôt que dans une conversation.' })}
  </section>`;
};

const ouvrirNote = (n, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const m = modale({
    titre: n.titre, sousTitre: `${(TYPES_NOTE[n.type] || {}).libelle || ''} · ${dateCourte(n.date)}${n.decidePar ? ` · ${n.decidePar}` : ''}`, feuille: true,
    corps: `<div class="prose t-corps">${avecLiens(n.contenu || '')}</div>
      ${n.contexte ? `<div style="margin-top:20px"><p class="surtitre">Contexte</p><div class="prose t-corps t-2" style="margin-top:6px">${enParagraphes(n.contexte)}</div></div>` : ''}
      ${n.impact ? `<div style="margin-top:20px"><p class="surtitre">Impact</p><div class="prose t-corps t-2" style="margin-top:6px">${enParagraphes(n.impact)}</div></div>` : ''}`,
    pied: equipe ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>` : `<button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('note', env, { pid, fiche: n }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('note', env, { pid, fiche: n, libelle: 'cette note' }); if (ok) m.fermer(); });
};

void montant; void pastilleTexte; void chronoItem; void parJour; void valider; void obligatoire; void heure; void STATUTS_VALIDATION;
