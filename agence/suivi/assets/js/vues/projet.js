/* ==========================================================================
   La page d'un projet : aperçu, composants, feuille de route, tâches,
   demandes, fichiers, versions, liens, réunions, notes, activité.
   Partagée par le client et par l'équipe. L'équipe voit en plus les
   éditeurs, l'interne, les points bloquants et la santé.
   ========================================================================== */

import {
  echapper, dateCourte, dateHeure, depuis, heure, montant, pluriel, joursAvant, echeance as calcEcheance, enParagraphes, avecLiens, parDateDesc, parDateAsc, borner,
  STATUTS_PROJET, STATUTS_COMPOSANT, TYPES_COMPOSANT, STATUTS_ETAPE, STATUTS_TACHE, PRIORITES, STATUTS, TYPES, URGENCES, OUVERTS, ATTEND_CLIENT,
  CATEGORIES_FICHIER, CATEGORIES_LIEN, STATUTS_RELEASE, TYPES_CHANGEMENT, TYPES_NOTE, SANTES, STATUTS_VALIDATION, QUALIFICATIONS, statutProjet, PLATEFORMES, nomsContacts, contactsProjet, PORTEES_DEVIS, age,
  verdictDelai, reportsDe, dateOrigine, MOTIFS_REPORT, dateLongue, enDate,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, STATUTS_CAMPAGNE, GRAVITES_ANOMALIE, STATUTS_ANOMALIE
} from '../noyau.js';
import {
  icone, pastille, pastilleTexte, puce, pucePlateforme, iconePlateforme, tonPlateforme, avatarProjet, avatar, progression, anneau, ligne, vide, fait, chronoItem, parJour, squelette, titrePage,
  echeanceHtml, modale, confirmer, toast, sur, menu, fichierHtml, brancherPieces, depot, lireForme, valider, obligatoire, agir, encart, optionsDe,
  verdictHtml, anneauOuPas, progressionOuPas,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, abonnerProjet, progressionProjet, jalonCourant, jalonSuivant, prochaineReunion, enAttenteDeVous, parStatut, risquesProjet, MODES_PROGRESSION, trierEtapes, phasesTriees } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { monterBulle } from '../bulle.js';
import { editer, supprimer } from './editeurs.js';
import { appelServeur } from '../serveur.js';
import { activiteHtml } from './accueil.js';

const ONGLETS = [
  { cle: 'apercu', libelle: 'Aperçu', icone: 'accueil' },
  { cle: 'etapes', libelle: 'Feuille de route', icone: 'route' },
  { cle: 'taches', libelle: 'Tâches', icone: 'taches' },
  { cle: 'demandes', libelle: 'Demandes', icone: 'demandes' },
  { cle: 'fichiers', libelle: 'Fichiers', icone: 'fichiers' },
  { cle: 'releases', libelle: 'Versions', icone: 'releases' },
  { cle: 'liens', libelle: 'Liens', icone: 'liens' },
  { cle: 'reunions', libelle: 'Réunions', icone: 'reunions' },
  { cle: 'notes', libelle: 'Décisions', icone: 'note' },
  { cle: 'tests', libelle: 'Tests', icone: 'check' },
  { cle: 'activite', libelle: 'Activité', icone: 'activite' },
];

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
    return ONGLETS.some((o) => o.cle === v) ? v : (v === 'composants' ? 'composants' : 'apercu');
  };
  let onglet = ongletDe(ctx.onglet);
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;

  /* L'onglet dont l'animation d'entrée est allée jusqu'au bout : tant
     qu'elle n'a pas fini, un redessin la rejoue au lieu de la couper. */
  let ongletAnime = '';
  const cles = [K.projet(pid), K.composants(pid), K.jalons(pid), K.liens(pid), K.taches(pid), K.tickets(pid), K.validations(pid), K.fichiers(pid), K.releases(pid), K.reunions(pid), K.notes(pid), K.blocages(pid), K.documents(pid), K.paiements(pid), K.activite(pid), K.equipe,
    K.scenarios(pid), K.campagnes(pid), K.anomalies(pid)];
  abonnerProjet(lot, pid, env.role);

  let detailOuvert = ctx.params.tid && onglet === 'taches' ? ctx.params.tid : null;
  let derniereEmpreinte = '';

  const rendre = (force = false) => {
    const d = lireTout(pid);
    const projet = d.projet;
    if (projet === undefined && !magasin.erreur(K.projet(pid))) return;
    if (!force && magasin.empreinte(cles) + '|' + onglet === derniereEmpreinte) return;
    if (projet === null || projet === undefined) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: "Il a peut-être été archivé, ou vous n'y avez plus accès.", action: '<a class="btn btn-secondaire" href="#/">Retour à l\'accueil</a>' })}</div>`;
      return;
    }
    titrePage(projet.nom);
    filAriane([{ libelle: equipe ? 'Projets' : 'Accueil', chemin: equipe ? '/projets' : '/' }, { libelle: projet.nom, chemin: `/projets/${pid}` }, ...(onglet !== 'apercu' ? [{ libelle: (ONGLETS.find((o) => o.cle === onglet) || { libelle: 'Les parties' }).libelle }] : [])]);

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
      reunions: d.reunions.filter((r) => joursAvant(r.date) >= 0).length,
      notes: d.notes.length,
      tests: d.scenarios.length,
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
              ${equipe && !projet.interne && nomsContacts(projet) ? `<span class="puce">${icone('utilisateurs')} ${echapper(nomsContacts(projet))}</span>` : ''}
              ${equipe && projet.sante && projet.sante !== 'ok' ? pastille(SANTES, projet.sante) : ''}
              ${projet.cible ? `<span class="puce">${icone('cible')} Livraison visée ${echapper(dateCourte(projet.cible))}</span>${verdictHtml(delai)}` : ''}
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

      <div class="onglets-enveloppe"><nav class="onglets" id="onglets-projet" aria-label="Sections du projet">
        ${ONGLETS.map((o) => `<a class="onglet${o.cle === onglet ? ' actif' : ''}" href="#/projets/${echapper(pid)}${o.cle === 'apercu' ? '' : `/${o.cle}`}">${o.libelle}${comptes[o.cle] ? `<span class="badge">${comptes[o.cle]}</span>` : ''}</a>`).join('')}
        ${equipe ? `<a class="onglet${onglet === 'composants' ? ' actif' : ''}" href="#/projets/${echapper(pid)}/composants">Les parties</a>` : ''}
      </nav></div>

      <div id="onglet-corps"${onglet !== ongletAnime ? ' class="corps-anime"' : ''}>${rendreOnglet(onglet, d, { pid, env, prog, attente, ouverts, delai, risques })}</div>
    </div>`;
    derniereEmpreinte = magasin.empreinte(cles) + '|' + onglet;
    const corps = sortie.querySelector('#onglet-corps.corps-anime');
    if (corps) corps.addEventListener('animationend', () => { ongletAnime = onglet; corps.classList.remove('corps-anime'); }, { once: true });
    reglerOnglets(sortie);

    if (detailOuvert) {
      const t = d.taches.find((x) => x.id === detailOuvert);
      if (t) { ouvrirTache(t, d, { pid, env }); }
      detailOuvert = null;
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
  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const d = lireTout(pid);
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === 'editer-projet') return editer('projet', env, { pid, fiche: d.projet });
    if (action === 'ouvrir-au-client') {
      const qui = nomsContacts(d.projet) || 'le client';
      const ok = await confirmer({
        titre: 'Ouvrir ce projet au client ?',
        texte: `${qui} recevra son invitation et verra tout ce qui est ici : étapes, tâches visibles, fichiers, devis, factures. La sourdine sera levée.`,
        ok: 'Ouvrir',
      });
      if (!ok) return null;
      return agir(el, async () => {
        const r = await appelServeur('ouvrirAuClient', { id: pid });
        return r;
      }, 'Projet ouvert. L\'invitation est partie.');
    }

    if (action === 'menu-projet') {
      return menu(el, [
        { libelle: d.projet.archive ? 'Restaurer le projet' : 'Archiver le projet', icone: 'archive', action: async () => {
          const ok = await confirmer({ titre: d.projet.archive ? 'Restaurer ce projet ?' : 'Archiver ce projet ?', texte: d.projet.archive ? 'Il redevient visible pour le client.' : "Il disparaît de l'accueil du client, rien n'est supprimé.", ok: d.projet.archive ? 'Restaurer' : 'Archiver' });
          if (ok) await agir(null, () => ecrire.majProjet(pid, { archive: !d.projet.archive, statut: d.projet.archive ? 'en-cours' : 'archive' }), d.projet.archive ? 'Projet restauré.' : 'Projet archivé.');
        } },
        ...(d.projet.ouvert === true && !d.projet.interne ? [{ libelle: 'Refermer au client', icone: 'oeilFerme', danger: true, action: () => refermer(pid) }] : []),
        { libelle: "Créer un lien d'invitation", icone: 'utilisateurs', action: () => ouvrirInvitation(d.projet, env) },
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
    if (action === 'deposer-client') return ouvrirDepotClient(pid, env);
    if (action === 'menu-fichier') {
      const f = d.fichiers.find((x) => x.id === id);
      if (!f) return null;
      const items = [{ libelle: 'Modifier la fiche', icone: 'edit', action: () => editer('fichier', env, { pid, fiche: f }) },
        { libelle: 'Archiver', icone: 'archive', danger: true, action: async () => { if (await confirmer({ titre: 'Archiver ce fichier ?', texte: 'Il reste dans les archives, rien n\'est effacé.', ok: 'Archiver' })) agir(null, () => ecrire.majFichier(f.id, { archive: true }), 'Fichier archivé.'); } }];
      return menu(el, items);
    }
    if (action === 'ouvrir-etape') { const j = d.jalons.find((x) => x.id === id); if (j) ouvrirEtape(j, d, { pid, env }); return null; }
    if (action === 'ouvrir-reunion') { const r = d.reunions.find((x) => x.id === id); if (r) ouvrirReunion(r, { pid, env }); return null; }
    if (action === 'ouvrir-note') { const n = d.notes.find((x) => x.id === id); if (n) ouvrirNote(n, { pid, env }); return null; }
    if (action === 'ouvrir-scenario') { const x = d.scenarios.find((y) => y.ref === el.dataset.ref); if (x) ouvrirScenario(x, { pid, env }); return null; }
    if (action === 'ouvrir-release') { const r = d.releases.find((x) => x.id === id); if (r) ouvrirRelease(r, { pid, env }); return null; }
    if (action === 'ouvrir-validation') return naviguer(equipe ? `/validations/${id}` : `/valider/${id}`);
    return null;
  });
  const gestesFichiers = sur(sortie, 'click', '[data-menu-fichier]', (el) => {
    el.dataset.action = 'menu-fichier'; el.dataset.id = el.dataset.menuFichier; el.click();
  });
  // Les filtres et les bascules d'affichage se souviennent, puis redessinent.
  const gestesFiltres = sur(sortie, 'click', '[data-vue-taches], [data-filtre-demandes], [data-filtre-fichiers]', (el) => {
    try {
      if (el.dataset.vueTaches !== undefined) localStorage.setItem('suivi:taches-vue', el.dataset.vueTaches);
      if (el.dataset.filtreDemandes !== undefined) sessionStorage.setItem(`suivi:filtre-demandes:${pid}`, el.dataset.filtreDemandes);
      if (el.dataset.filtreFichiers !== undefined) sessionStorage.setItem(`suivi:filtre-fichiers:${pid}`, el.dataset.filtreFichiers);
    } catch (e) { /* stockage refusé */ }
    rendre(true);
  });
  brancherPieces(sortie);

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(() => rendre(false), 60); };
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();

  /* La conversation du projet vit en bulle, hors de la page : changer
     d'onglet ne la referme pas et n'interrompt pas la frappe. */
  const bulle = monterBulle({ pid, env });

  return {
    fin: () => { clearTimeout(minuteur); gestes(); gestesFichiers(); gestesFiltres(); bulle.fin(); lot.fin(); },
    /* Changer d'onglet ne recharge pas la page : on redessine, les écoutes
       restent ouvertes et le défilement ne saute pas. */
    maj: (suite) => {
      onglet = ongletDe(suite.params.onglet || (suite.params.tid ? 'taches' : 'apercu'));
      if (suite.params.tid && onglet === 'taches') detailOuvert = suite.params.tid;
      rendre(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    },
  };
};

/*
 * Le lien d'invitation. Le client clique, son adresse est déjà posée, il
 * demande son code et entre. Le lien ne donne aucun accès par lui-même :
 * il ne fait que remplir l'adresse, c'est le code reçu dans la boîte qui
 * ouvre la session. On peut donc le coller dans un message sans risque.
 */
const ouvrirInvitation = (projet, env) => {
  const contacts = contactsProjet(projet);
  const m = modale({
    titre: "Créer un lien d'invitation",
    sousTitre: projet.nom,
    corps: `<form class="forme" id="forme-invitation" novalidate>
      <div class="groupe">
        <label class="etiquette-champ" for="inv-email">Adresse du destinataire</label>
        <input class="champ" id="inv-email" name="email" type="email" value="${echapper((contacts[0] || {}).email || '')}" placeholder="prenom@entreprise.fr">
        ${contacts.length > 1 ? `<p class="aide">Second interlocuteur : ${echapper(contacts[1].email || contacts[1].nom || '')}. Créez-lui son propre lien.</p>` : ''}
      </div>
      <div class="groupe">
        <label class="etiquette-champ" for="inv-nom">Son nom <span class="facultatif">(facultatif)</span></label>
        <input class="champ" id="inv-nom" name="nom" value="${echapper((contacts[0] || {}).nom || '')}">
      </div>
      <label class="interrupteur"><input type="checkbox" name="envoyer"><i></i> Lui envoyer aussi l'invitation par e-mail</label>
      <p class="aide">Sans cette case, rien ne part : le lien s'affiche ici et vous le collez où vous voulez.</p>
      <div id="inv-resultat"></div>
    </form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="submit" form="forme-invitation">Créer le lien</button>`,
  });
  m.el.querySelector('#forme-invitation').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = lireForme(e.target);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || '').trim())) { toast("Cette adresse a l'air incomplète.", 'erreur'); return; }
    await agir(m.pied.querySelector('[type="submit"]'), async () => {
      const r = await appelServeur('creerInvitation', { email: d.email, nom: d.nom, projet: projet.id, envoyer: Boolean(d.envoyer) });
      const zone = m.el.querySelector('#inv-resultat');
      zone.innerHTML = `<div class="groupe" style="margin-top:8px">
        <span class="etiquette-champ">Le lien, valable quatorze jours</span>
        <input class="champ" id="inv-lien" value="${echapper(r.lien)}" readonly>
        <p class="aide">Il ne donne aucun accès seul : il pose l'adresse, le code reçu par e-mail ouvre la session.</p>
      </div>`;
      const entree = zone.querySelector('#inv-lien');
      entree.focus(); entree.select();
      try { await navigator.clipboard.writeText(r.lien); } catch (err) { /* refus du presse-papiers */ }
    }, d.envoyer ? 'Lien créé, invitation envoyée.' : 'Lien créé et copié.');
  });
};

/* La barre d'onglets : l'onglet actif se ramène dans le champ de vision, et
   le dégradé du bord droit ne s'affiche que s'il reste quelque chose à voir. */
const reglerOnglets = (sortie) => {
  const barre = sortie.querySelector('#onglets-projet');
  if (!barre) return;
  const enveloppe = barre.parentElement;
  const jauger = () => enveloppe.classList.toggle('deborde', barre.scrollWidth - barre.clientWidth - barre.scrollLeft > 8);
  const actif = barre.querySelector('.onglet.actif');
  if (actif) {
    const g = actif.offsetLeft;
    const d = g + actif.offsetWidth;
    if (g < barre.scrollLeft + 8 || d > barre.scrollLeft + barre.clientWidth - 8) {
      barre.scrollTo({ left: Math.max(0, g - 24), behavior: 'smooth' });
    }
  }
  barre.addEventListener('scroll', jauger, { passive: true });
  jauger();
};

/* Les plateformes du projet, en cartes : l'icône dans sa couleur, l'état de
   la brique, et le lien qui y mène. Un clic ouvre l'application publiée si
   son adresse est renseignée, sinon la liste des versions. */
const cartesPlateformes = (projet, d, pid) => {
  const cles = (projet.plateformes || []).filter((c) => PLATEFORMES[c]);
  if (!cles.length) return '';
  return `<div class="cartes-plateformes" role="list">${cles.map((cle) => {
    const f = PLATEFORMES[cle];
    const c = d.composants.find((x) => x.type === (f.composant || cle)) || null;
    /* La carte mène à la page de la brique : son histoire complète, ses
       versions, ses tâches, ses points bloquants. L'adresse publique y
       vit aussi, en bouton, mais elle ne court-circuite plus la page. */
    const etat = c
      ? [c.version && `Version ${c.version}`, (STATUTS_COMPOSANT[c.statut || 'en-cours'] || {}).libelle].filter(Boolean).join(' · ')
      : 'Pas encore suivie';
    const att = `href="#/projets/${echapper(pid)}/brique/${echapper(c ? c.id : `p-${cle}`)}"`;
    return `<a class="carte-plateforme carte-plateforme--${f.voile}" role="listitem" ${att} data-astuce="${echapper(`Ouvrir la page ${f.libelle}`)}">
      <span class="carte-plateforme-tuile">${icone(f.icone)}</span>
      <span class="carte-plateforme-corps">
        <span class="carte-plateforme-nom">${echapper(f.libelle)}</span>
        <span class="carte-plateforme-etat">${echapper(etat)}</span>
      </span>
      <span class="carte-plateforme-fleche">${icone('fleche')}</span>
    </a>`;
  }).join('')}</div>`;
};

const trouver = (d, genre, id) => {
  /* Un scénario porte sa référence comme identifiant (« DI-15 »), parce que
     c'est elle qui le nomme dans les passages et les rapports. */
  if (genre === 'scenario') return (d.scenarios || []).find((x) => x.ref === id);
  return ({
    composant: d.composants, jalon: d.jalons, lien: d.liens, tache: d.taches, release: d.releases, reunion: d.reunions, note: d.notes, blocage: d.blocages, fichier: d.fichiers,
    campagne: d.campagnes,
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
const tests = (d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const scenarios = d.scenarios;
  const campagnes = d.campagnes.slice().sort((a, b) => ((STATUTS_CAMPAGNE[a.statut] || {}).ordre || 9) - ((STATUTS_CAMPAGNE[b.statut] || {}).ordre || 9));
  const anomalies = d.anomalies.slice().sort((a, b) => ((GRAVITES_ANOMALIE[a.gravite] || {}).rang || 9) - ((GRAVITES_ANOMALIE[b.gravite] || {}).rang || 9));

  /* Le coût d'une campagne complète, en passages. Un scénario doublé compte
     deux fois côté mobile, une seule côté web : le web n'a qu'un moteur. */
  const compte = { socle: 0, transversal: 0, reparti: 0 };
  scenarios.forEach((s) => { compte[s.niveau] = (compte[s.niveau] || 0) + 1; });
  const mobiles = compte.socle * 2 + compte.transversal * 2 + compte.reparti;
  const webs = scenarios.filter((s) => (s.plateformes || []).includes('web')).length;

  if (!scenarios.length) {
    return `<section class="section" style="margin-top:0">
      <div class="section-tete"><h2>Tests</h2>${boutonNouveau(env, 'scenario', 'Nouveau scénario')}</div>
      ${vide({ icone: 'check', titre: 'Aucun scénario', texte: equipe ? 'Écrivez-en un, ou versez un plan de tests existant avec l\'outil d\'import.' : 'Les scénarios de test apparaîtront ici.' })}
    </section>`;
  }

  /* Rangés par bloc, dans l'ordre du plan. */
  const parBloc = [];
  scenarios.forEach((s) => {
    let g = parBloc.find((x) => x.cle === s.bloc);
    if (!g) { g = { cle: s.bloc, libelle: (BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || 'Divers', items: [] }; parBloc.push(g); }
    g.items.push(s);
  });

  const ligneScenario = (s) => `
    <div class="scenario${NIVEAUX_SCENARIO[s.niveau] && NIVEAUX_SCENARIO[s.niveau].double ? ' scenario--double' : ''}">
      <button class="scenario-corps" type="button" data-action="ouvrir-scenario" data-ref="${echapper(s.ref)}">
        <span class="scenario-ref">${echapper(s.ref)}</span>
        <span class="scenario-titre">${echapper(s.titre)}</span>
        <span class="scenario-fin">
          ${(s.plateformes || []).length < 3 ? `<span class="puce puce--mini">${echapper((s.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(' '))}</span>` : ''}
          ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
        </span>
      </button>
      ${boutonsEdition(env, 'scenario', s.ref, s.ref)}
    </div>`;

  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete">
      <div><h2>Scénarios</h2><p class="chapo">${pluriel(scenarios.length, 'scénario', 'scénarios')} dans la bibliothèque. Une campagne complète représente ${mobiles} passages sur mobile et ${webs} sur le web.</p></div>
      ${boutonNouveau(env, 'scenario', 'Nouveau scénario')}
    </div>

    <div class="rang couverture">
      ${Object.entries(NIVEAUX_SCENARIO).map(([cle, f]) => `<span class="puce" data-astuce="${echapper(f.aide)}">${pastille(NIVEAUX_SCENARIO, cle)} ${compte[cle] || 0}</span>`).join('')}
    </div>

    ${parBloc.map((g) => `
      <div class="bloc-scenarios">
        <h3 class="bloc-tete">${echapper(g.libelle)}<span class="badge">${g.items.length}</span></h3>
        <div class="liste liste--serree">${g.items.map(ligneScenario).join('')}</div>
      </div>`).join('')}
  </section>

  <section class="section">
    <div class="section-tete">
      <div><h2>Campagnes</h2><p class="chapo">Une campagne déroule une sélection de scénarios sur une version précise.</p></div>
      ${boutonNouveau(env, 'campagne', 'Nouvelle campagne')}
    </div>
    ${campagnes.length ? `<div class="liste">${campagnes.map((c) => ligne({
      icone: c.statut === 'close' ? 'check' : 'check', ton: c.statut === 'close' ? 'vert' : c.statut === 'en-cours' ? 'bleu' : '',
      titre: echapper(c.titre || 'Campagne'),
      sous: `${(c.testeurs || []).length ? pluriel((c.testeurs || []).length, 'testeur', 'testeurs') : 'aucun testeur'}${c.debut ? ` · ${echapper(dateCourte(c.debut))}` : ''}`,
      fin: pastille(STATUTS_CAMPAGNE, c.statut || 'preparation'),
      action: 'ouvrir-campagne', attrs: `data-id="${echapper(c.id)}"`,
    })).join('')}</div>`
    : vide({ icone: 'check', titre: 'Aucune campagne', texte: 'Une campagne prend des scénarios, les distribue aux testeurs, et garde le résultat daté.', compact: true })}
  </section>

  ${anomalies.length ? `<section class="section">
    <div class="section-tete"><div><h2>Anomalies</h2><p class="chapo">Plusieurs échecs sur le même scénario font une seule anomalie.</p></div></div>
    <div class="liste">${anomalies.map((a) => ligne({
      icone: 'alerte', ton: (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'rouge' ? 'rouge' : (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'ambre' ? 'ambre' : '',
      titre: echapper(a.titre || 'Anomalie'),
      sous: `${(a.passages || []).length ? pluriel((a.passages || []).length, 'passage', 'passages') : ''}${(a.plateformes || []).length ? ` · ${echapper((a.plateformes || []).join(', '))}` : ''}`,
      fin: `${pastille(GRAVITES_ANOMALIE, a.gravite || 'mineur')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}`,
    })).join('')}</div>
  </section>` : ''}`;
};

/* Le détail d'un scénario, dans une feuille. On y lit ce que le testeur
   lira : les options à poser, et le résultat attendu. */
/* Le plan de tests est écrit en markdown, et son gras porte du sens : il
   désigne l'option exacte à choisir dans l'application (« Type **Rappel** »).
   On le rend, et rien d'autre : le texte est échappé avant, donc aucune
   balise venue de la fiche ne peut s'ouvrir ici. */
const gras = (texte) => echapper(texte || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const ouvrirScenario = (s, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
  const m = modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || ''}`, feuille: true,
    corps: `
      <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
        ${(s.plateformes || []).map((p) => `<span class="puce">${echapper((PLATEFORMES_TEST[p] || {}).libelle || p)}</span>`).join('')}
      </div>
      <p class="aide" style="margin-bottom:20px">${echapper(niveau.aide)}</p>
      ${s.options ? `<div class="groupe"><span class="etiquette-champ">Options à poser</span><p class="t-corps">${gras(s.options)}</p></div>` : ''}
      <div class="groupe"><span class="etiquette-champ">Résultat attendu</span><p class="t-corps">${gras(s.attendu)}</p></div>
      <p class="aide" style="margin-top:18px">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>`,
    pied: equipe ? `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>` : '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  });
  const bouton = m.el.querySelector('[data-editer]');
  if (bouton) bouton.addEventListener('click', async () => { m.fermer(); await editer('scenario', env, { pid, fiche: s }); });
  return m.fin;
};

const rendreOnglet = (onglet, d, c) => {
  switch (onglet) {
    case 'apercu': return apercu(d, c);
    case 'composants': return composants(d, c);
    case 'etapes': return etapes(d, c);
    case 'taches': return taches(d, c);
    case 'demandes': return demandes(d, c);
    case 'fichiers': return fichiers(d, c);
    case 'releases': return releases(d, c);
    case 'liens': return liens(d, c);
    case 'reunions': return reunions(d, c);
    case 'notes': return notes(d, c);
    case 'tests': return tests(d, c);
    case 'activite': return `<section class="section" style="margin-top:0"><div class="section-tete"><h2>Activité du projet</h2></div>${activiteHtml(d.activite.slice(0, 80))}</section>`;
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
  const validationsAttente = d.validations.filter((v) => v.statut === 'en-attente');
  const echeances = [
    ...d.jalons.filter((j) => j.fin && j.statut !== 'termine').map((j) => ({ date: j.fin, titre: j.titre, genre: 'Étape', icone: 'drapeau', chemin: `/projets/${pid}/etapes` })),
    ...d.taches.filter((t) => t.echeance && t.statut !== 'terminee').map((t) => ({ date: t.echeance, titre: t.titre, genre: 'Tâche', icone: 'taches', chemin: `/projets/${pid}/taches/${t.id}` })),
    ...d.reunions.filter((r) => joursAvant(r.date) >= 0).map((r) => ({ date: r.date, titre: r.titre, genre: 'Réunion', icone: 'reunions', chemin: `/projets/${pid}/reunions` })),
    ...d.documents.filter((x) => x.type === 'facture' && x.echeance && ['a-payer', 'partielle', 'en-retard'].includes(x.statut)).map((x) => ({ date: x.echeance, titre: x.libelle, genre: 'Facture', icone: 'euro', chemin: equipe ? `/finances/${x.id}` : `/finances/${x.id}` })),
  ].filter((e) => joursAvant(e.date) >= -30).sort(parDateAsc('date')).slice(0, 6);

  return `
    ${attente.length ? `<section class="section" style="margin-top:0"><div class="attente">
      <p class="attente-tete">${icone('alerte')} ${equipe ? 'En attente du client' : 'En attente de vous'} <span class="badge badge--vif" style="margin-left:4px">${attente.length}</span></p>
      <div class="liste" style="margin-top:8px">${attente.slice(0, 5).map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div>
      ${attente.length > 5 ? `<p class="t-petit" style="margin-top:8px"><a href="#/valider">${echapper(pluriel(attente.length - 5, 'autre point', 'autres points'))} à voir</a></p>` : ''}
    </div></section>` : ''}

    <section class="section${attente.length ? '' : ' section--premiere'}" style="${attente.length ? '' : 'margin-top:0'}">
      <div class="section-tete"><h2>Votre projet en un coup d'œil</h2>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('edit')} Le pouls</button>` : ''}</div>
      <div class="grille grille-tiers">
        <div class="pouls">
          <div><p class="quoi">${icone('play')} En ce moment</p><p class="texte${pulse.enCours ? '' : ' rien'}">${echapper(pulse.enCours || (enCours[0] ? enCours[0].titre : (courant ? courant.titre : 'Rien de renseigné')))}</p></div>
          <div><p class="quoi">${icone('check')} Dernière livraison</p><p class="texte${pulse.derniereLivraison || derniereRelease || dernierTermine ? '' : ' rien'}">${echapper(pulse.derniereLivraison || (derniereRelease ? `${derniereRelease.plateforme || ''} ${derniereRelease.version || ''}`.trim() : (dernierTermine ? dernierTermine.titre : 'Rien encore')))}</p></div>
          <div><p class="quoi">${icone('fleche')} Prochaine étape</p><p class="texte${pulse.prochaineEtape || suivant ? '' : ' rien'}">${echapper(pulse.prochaineEtape || (suivant ? suivant.titre : 'À définir'))}</p></div>
          <div><p class="quoi">${icone('horloge')} ${equipe ? 'Attente client' : 'Attendu de vous'}</p><p class="texte${pulse.attenteClient || attente.length ? '' : ' rien'}">${echapper(pulse.attenteClient || (attente.length ? pluriel(attente.length, 'point à traiter', 'points à traiter') : 'Rien'))}</p></div>
        </div>
        <div class="carte carte--creuse rang" style="gap:18px;align-items:center">
          ${anneauOuPas(prog, true)}
          <div>
            <p class="t-titre-3">Progression</p>
            <p class="t-petit t-2" style="margin-top:2px">${echapper(MODES_PROGRESSION[prog.mode] || '')}${prog.valeur === null ? 'Rien ne permet encore de la calculer' : ''}</p>
            ${courant ? `<p class="t-petit" style="margin-top:8px"><span class="t-3">Étape en cours ·</span> ${echapper(courant.titre)}</p>` : ''}
            ${prog.valeur === null && equipe ? '<p class="t-micro t-3" style="margin-top:6px">Posez des étapes, ou saisissez une valeur dans Modifier.</p>' : ''}
          </div>
        </div>
      </div>
    </section>

    ${rideauHtml(d, { pid, env })}

    ${tenueDesDelais(d, { pid, env, delai, risques })}

    ${blocagesOuverts.length ? `<section class="section">
      <div class="section-tete"><h2>Points bloquants</h2>${boutonNouveau(env, 'blocage', 'Signaler')}</div>
      <div class="pile">${blocagesOuverts.map((b) => `<div class="encart encart--alerte">${icone('alerte')}<div style="flex:1">
        <strong>${echapper(b.titre)}</strong>${b.description ? ` · ${echapper(b.description)}` : ''}
        <div class="rang t-micro t-3" style="margin-top:6px;gap:12px"><span>Responsable : ${echapper({ client: 'le client', capmedia: 'Capmedia', tiers: 'un tiers' }[b.responsable] || b.responsable)}</span><span>Depuis ${echapper(dateCourte(b.depuis))}</span>${b.impact ? `<span>Impact : ${echapper(b.impact)}</span>` : ''}</div>
      </div>${equipe ? `<span class="rang" style="gap:2px"><button class="btn btn-petit btn-doux" type="button" data-action="resoudre-blocage" data-id="${echapper(b.id)}">Levé</button>${boutonsEdition(env, 'blocage', b.id, b.titre)}</span>` : ''}</div>`).join('')}</div>
    </section>` : ''}

    ${d.composants.length ? `<section class="section">
      <div class="section-tete"><h2>Les parties du projet <span class="compte-section">${d.composants.length}</span></h2><a class="lien" href="#/projets/${echapper(pid)}/${equipe ? 'composants' : 'etapes'}">${equipe ? 'Gérer' : 'Feuille de route'}</a></div>
      <div class="grille grille-3">${d.composants.map((c) => `<div class="carte carte--serree">
        <div class="rang-espace"><p class="t-corps-fort rang" style="gap:8px">${iconePlateforme(c.type) ? `<span class="ligne-icone ligne-icone--${tonPlateforme(c.type)}" style="width:28px;height:28px;border-radius:8px">${icone(iconePlateforme(c.type))}</span>` : ''}${echapper(c.nom)}</p>${pastille(STATUTS_COMPOSANT, c.statut || 'en-cours')}</div>
        <div class="rang-espace t-micro t-3" style="margin:10px 0 6px"><span>${echapper(TYPES_COMPOSANT[c.type] || c.type || '')}</span><span class="nb">${borner(c.progression)} %</span></div>
        ${progression(c.progression, borner(c.progression) >= 100 ? 'vert' : '')}
        ${c.version || c.environnement ? `<p class="t-micro t-3" style="margin-top:8px">${echapper([c.version && `v${c.version}`, c.versionPrep && `${c.versionPrep} en préparation`, c.environnement].filter(Boolean).join(' · '))}</p>` : ''}
      </div>`).join('')}</div>
    </section>` : (equipe ? `<section class="section"><div class="section-tete"><h2>Les parties du projet</h2>${boutonNouveau(env, 'composant', 'Ajouter une partie')}</div>${vide({ icone: 'composants', titre: 'Aucune partie', texte: 'Découpez le projet : iPhone, Android, web, serveur...', compact: true })}</section>` : '')}

    <div class="grille grille-tiers section">
      <div class="pile" style="gap:var(--e-7)">
        <section>
          <div class="section-tete"><h2>Feuille de route</h2><a class="lien" href="#/projets/${echapper(pid)}/etapes">Tout voir</a></div>
          ${d.jalons.length ? `<div class="route">${trierEtapes(d.jalons).slice(0, 6).map((j) => phaseHtml(j)).join('')}</div>` : vide({ icone: 'route', titre: 'Pas encore de feuille de route', texte: equipe ? 'Posez les étapes du projet.' : 'Elle apparaîtra ici dès que les étapes seront posées.', compact: true, action: boutonNouveau(env, 'jalon', 'Première étape') })}
        </section>
        <section>
          <div class="section-tete"><h2>Activité récente</h2><a class="lien" href="#/projets/${echapper(pid)}/activite">Tout voir</a></div>
          ${activiteHtml(d.activite.slice(0, 8))}
        </section>
      </div>
      <aside class="pile" style="gap:var(--e-5)">
        <div class="carte carte--creuse">
          <p class="surtitre">Prochaine réunion</p>
          ${reunion ? `<p class="t-titre-3" style="margin-top:8px">${echapper(reunion.titre)}</p><p class="t-petit t-2" style="margin-top:4px">${echapper(dateHeure(reunion.date))}</p>${reunion.lien ? `<a class="btn btn-secondaire btn-petit" style="margin-top:12px" href="${echapper(reunion.lien)}" target="_blank" rel="noopener">${icone('video')} Rejoindre</a>` : ''}` : `<p class="t-petit t-2" style="margin-top:8px">Aucune réunion programmée.</p>${boutonNouveau(env, 'reunion', 'Programmer')}`}
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
  /* Seul un « ouvert : faux » explicite baisse le rideau. Les projets nés
     avant cette notion n'en portent pas et restent ouverts : on ne va pas
     fermer d'un coup cinquante espaces déjà partagés. */
  if (projet.ouvert !== false) return '';

  const contacts = contactsProjet(projet);
  const avecAdresse = contacts.filter((c) => c.email);
  const devis = d.documents.filter((x) => x.type === 'devis' && !x.archive);
  const manque = [];
  if (!avecAdresse.length) manque.push("l'adresse d'au moins un interlocuteur");
  if (!d.jalons.length) manque.push('au moins une étape');

  return `<section class="section" style="margin-top:0">
    <div class="rideau">
      <div class="rideau-tete">
        <span class="rideau-icone">${icone('oeilFerme')}</span>
        <div style="min-width:0;flex:1">
          <p class="t-titre-3">Ce projet n'est pas encore ouvert au client</p>
          <p class="t-petit t-2" style="margin-top:2px">${echapper(avecAdresse.length
            ? `Personne n'y a accès. ${nomsContacts(projet)} n'y entrera qu'à votre geste.`
            : "Personne n'y a accès, et aucun interlocuteur n'est encore renseigné.")}</p>
        </div>
        <button class="btn btn-principal" type="button" data-action="ouvrir-au-client"${manque.length ? ' disabled' : ''}>${icone('utilisateurs')} Ouvrir au client</button>
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
const tenueDesDelais = (d, { pid, env, delai, risques }) => {
  const equipe = env.role === 'equipe';
  const projet = d.projet;
  const reports = reportsDe(projet);
  const origine = dateOrigine(projet, 'cible');
  const decale = origine && projet.cible && dateCourte(origine) !== dateCourte(projet.cible);
  const etapesEnRetard = d.jalons.filter((j) => j.statut !== 'termine' && joursAvant(j.fin) < 0);

  if (!projet.cible && !reports.length) {
    return equipe ? `<section class="section">
      <div class="section-tete"><h2>Tenue des délais</h2><button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('cible')} Fixer une date</button></div>
      ${encart("Aucune date de livraison n'est fixée. Le client n'a donc rien à quoi se raccrocher, et c'est la première raison pour laquelle il écrit.", 'attention', 'alerte')}
    </section>` : '';
  }

  return `<section class="section">
    <div class="section-tete"><h2>Tenue des délais</h2>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-projet">${icone('edit')} Changer la date</button>` : ''}</div>
    <div class="carte delais">
      <div class="delais-tete">
        <div>
          <p class="surtitre">Livraison visée</p>
          <p class="t-titre-2" style="margin-top:4px">${echapper(projet.cible ? dateLongue(projet.cible) : 'Non fixée')}</p>
          ${decale ? `<p class="t-petit t-3" style="margin-top:4px">Initialement le ${echapper(dateCourte(origine))} · ${echapper(pluriel(reports.length, 'report'))}</p>` : ''}
        </div>
        <div class="delais-verdict">${verdictHtml(delai)}</div>
      </div>

      ${risques.length ? `<div class="delais-risques">
        <p class="surtitre">Ce qui pèse sur cette date</p>
        <ul class="pile" style="margin-top:8px;gap:6px">${risques.map((r) => `<li class="rang" style="gap:8px;align-items:flex-start"><span class="ligne-icone ligne-icone--ambre" style="width:22px;height:22px;border-radius:7px">${icone('alerte')}</span><span class="t-petit">${echapper(r)}</span></li>`).join('')}</ul>
        ${etapesEnRetard.length ? `<p class="t-micro" style="margin-top:8px"><a href="#/projets/${echapper(pid)}/etapes">Voir les étapes concernées</a></p>` : ''}
      </div>` : ''}

      ${reports.length ? `<div class="delais-reports">
        <p class="surtitre">L'histoire de cette date</p>
        <div class="chrono" style="margin-top:10px">
          ${reports.slice().reverse().map((r) => chronoItem({
            icone: 'calendrier', ton: 'ambre',
            texte: `Reportée du <strong>${echapper(dateCourte(r.de))}</strong> au <strong>${echapper(dateCourte(r.vers))}</strong> · ${echapper(MOTIFS_REPORT[r.motif] || r.motif || 'motif non précisé')}${r.note ? `<br><span class="t-3">${echapper(r.note)}</span>` : ''}`,
            date: `${dateCourte(r.le)}${r.par ? ` · ${r.par}` : ''}`,
          })).join('')}
        </div>
      </div>` : `<p class="t-petit t-3" style="margin-top:14px">Cette date n'a jamais bougé.</p>`}
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
    <span class="phase-sous">${echapper([j.phase, j.fin ? `fin ${dateCourte(j.fin)}` : ''].filter(Boolean).join(' · '))}${v.cle === 'depasse' ? ` <span class="t-alerte">· dépassée ${echapper(v.detail)}</span>` : ''}</span>
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
        ${j.statut !== 'termine' ? `<span class="puce t-3">${borner(j.progression)} % fait</span>` : ''}
      </div>

      ${j.description ? `<div class="prose t-corps">${avecLiens(j.description)}</div>` : '<p class="t-petit t-3">Pas encore de description.</p>'}

      <dl class="faits" style="margin-top:20px">
        ${fait('Début', j.debut ? echapper(dateLongue(j.debut)) : '')}
        ${fait('Fin prévue', j.fin ? `${echapper(dateLongue(j.fin))}${decalee ? `<br><span class="t-micro t-3">initialement le ${echapper(dateCourte(origine))}</span>` : ''}` : '')}
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
          fin: pastille(STATUTS_TACHE, t.statut || 'a-faire'),
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
      : `<a class="btn btn-secondaire" href="#/messages/${echapper(pid)}">Une question sur cette étape</a><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('jalon', env, { pid, fiche: j }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('jalon', env, { pid, fiche: j, libelle: 'cette étape' }); if (ok) m.fermer(); });
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
  return `
  <section class="section" style="margin-top:0">
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
      icone: t.statut === 'terminee' ? 'check' : t.statut === 'bloquee' ? 'alerte' : 'taches', ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : t.statut === 'attente-client' ? 'ambre' : t.statut === 'en-cours' ? 'bleu' : '',
      titre: `${echapper(t.titre)}${t.visibilite === 'interne' ? ' <span class="etiquette" style="vertical-align:middle">Interne</span>' : ''}`,
      sous: `${(() => { const c = d.composants.find((x) => x.id === t.composant); return c && iconePlateforme(c.type) ? pucePlateforme(c.type, { court: true }) : ''; })()}${echapper([(d.composants.find((c) => c.id === t.composant) || {}).nom, t.assigne && nomEquipe(d.equipe, t.assigne), t.estimation].filter(Boolean).join(' · '))}${f ? ` ${echeanceHtml(f)}` : ''}${t.checklist && t.checklist.length ? ` <span class="t-3">${t.checklist.filter((c) => c.fait).length}/${t.checklist.length}</span>` : ''}`,
      fin: `${puce(PRIORITES, t.priorite || 'normale')}${pastille(STATUTS_TACHE, t.statut || 'a-faire')}`,
      action: 'ouvrir-tache', attrs: `data-id="${echapper(t.id)}"`,
    });
  };
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete">
      <h2>Tâches</h2>
      <div class="rang">
        <div class="segments" role="group" aria-label="Affichage"><button type="button" data-vue-taches="liste" aria-pressed="${mode === 'liste'}">${icone('liste')} Liste</button><button type="button" data-vue-taches="kanban" aria-pressed="${mode === 'kanban'}">${icone('kanban')} Kanban</button></div>
        ${boutonNouveau(env, 'tache', 'Nouvelle tâche')}
      </div>
    </div>
    ${!liste.length ? vide({ icone: 'taches', titre: 'Aucune tâche visible', texte: equipe ? 'Créez la première tâche du projet.' : 'Les tâches partagées avec vous apparaîtront ici.' })
    : mode === 'kanban' ? `<div class="kanban">${parStatut(liste, STATUTS_TACHE).map((col) => `<div class="kanban-col"><div class="kanban-tete"><span class="puce puce--${col.fiche.voile}"><i></i></span>${echapper(col.fiche.libelle)}<span class="badge">${col.items.length}</span></div>
      ${col.items.map((t) => `<button class="kanban-carte" type="button" data-action="ouvrir-tache" data-id="${echapper(t.id)}"><p class="titre">${echapper(t.titre)}</p><div class="sous">${puce(PRIORITES, t.priorite || 'normale')}${t.echeance ? `<span>${echapper(dateCourte(t.echeance))}</span>` : ''}${t.assigne ? avatar(nomEquipe(d.equipe, t.assigne) || 'C', { equipe: true, taille: 'petit' }) : ''}</div></button>`).join('')}
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
      <div class="rang" style="margin-bottom:16px">${pastille(STATUTS_TACHE, t.statut || 'a-faire')}${puce(PRIORITES, t.priorite || 'normale')}${f ? echeanceHtml(f) : ''}${t.visibilite === 'interne' ? '<span class="etiquette">Interne</span>' : ''}</div>
      ${t.description ? `<div class="prose t-corps">${avecLiens(t.description)}</div>` : '<p class="t-petit t-3">Pas de description.</p>'}
      <dl class="faits" style="margin-top:20px">${fait('Assignée à', echapper(t.assigne ? nomEquipe(d.equipe, t.assigne) || 'Capmedia' : 'Personne'))}${fait('Échéance', t.echeance ? echapper(dateCourte(t.echeance)) : '')}${fait('Estimation', echapper(t.estimation || ''))}${fait('Progression', `${borner(t.progression)} %`)}</dl>
      ${t.checklist && t.checklist.length ? `<div style="margin-top:20px"><p class="surtitre">Liste de contrôle</p><div style="margin-top:6px">${t.checklist.map((c, i) => `<label class="coche${c.fait ? ' faite' : ''}"><input type="checkbox" data-coche="${i}" ${c.fait ? 'checked' : ''} ${equipe ? '' : 'disabled'}><span>${echapper(c.texte)}</span></label>`).join('')}</div></div>` : ''}
      ${equipe ? `<div style="margin-top:24px"><p class="surtitre">Changer le statut</p><div class="rang" style="margin-top:8px">${Object.entries(STATUTS_TACHE).map(([cle, s]) => `<button class="filtre${t.statut === cle ? ' actif' : ''}" type="button" data-statut="${cle}">${echapper(s.libelle)}</button>`).join('')}</div></div>` : ''}
      ${t.statut === 'attente-client' && !equipe ? encart('Nous attendons votre retour sur cette tâche. Répondez-nous dans la conversation du projet.', 'attention', 'alerte') : ''}`,
    pied: equipe ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>` : `<a class="btn btn-secondaire" href="#/messages/${echapper(pid)}">Écrire à Capmedia</a><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-statut]', (el) => agir(null, () => ecrire.majTache(t.id, { statut: el.dataset.statut, progression: el.dataset.statut === 'terminee' ? 100 : undefined })).then(() => m.fermer()));
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('tache', env, { pid, fiche: t }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('tache', env, { pid, fiche: t, libelle: 'cette tâche' }); if (ok) m.fermer(); });
  sur(m.el, 'change', '[data-coche]', (el) => {
    const checklist = (t.checklist || []).map((c, i) => (i === Number(el.dataset.coche) ? { ...c, fait: el.checked } : c));
    agir(null, () => ecrire.majTache(t.id, { checklist }));
  });
};

/* --- Demandes ----------------------------------------------------------------- */
const demandes = (d, { env, pid }) => {
  const equipe = env.role === 'equipe';
  const filtre = (() => { try { return sessionStorage.getItem(`suivi:filtre-demandes:${pid}`) || 'ouvertes'; } catch (e) { return 'ouvertes'; } })();
  const tous = d.tickets.slice().sort(parDateDesc('maj'));
  const groupes = {
    ouvertes: tous.filter((t) => OUVERTS.includes(t.statut)),
    moi: tous.filter((t) => ATTEND_CLIENT.includes(t.statut)),
    terminees: tous.filter((t) => !OUVERTS.includes(t.statut)),
    toutes: tous,
  };
  const liste = groupes[filtre] || groupes.ouvertes;
  const nonLu = (t) => { const l = t.lu || {}; const marque = equipe ? l.equipe : l.client; return !marque || ((t.maj && t.maj.toMillis ? t.maj.toMillis() : 0) > (marque.toMillis ? marque.toMillis() : 0)); };
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Demandes</h2><a class="btn btn-principal btn-petit" href="#/projets/${echapper(pid)}/nouvelle-demande">${icone('plus')} Nouvelle demande</a></div>
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
    ${liste.length ? `<div class="grille grille-2">${liste.map((f) => fichierHtml({ ...f, categorieLibelle: CATEGORIES_FICHIER[f.categorie] || f.categorie, par: f.par }, { menu: equipe })).join('')}</div>`
    : vide({ icone: 'fichiers', titre: 'Aucun fichier', texte: equipe ? 'Déposez maquettes, livrables, documents.' : 'Vos maquettes, livrables et documents seront rangés ici. Vous pouvez aussi nous envoyer des captures ou des logos.' })}
  </section>`;
};

const ouvrirDepotClient = (pid, env) => {
  const m = modale({
    titre: 'Envoyer des fichiers', sousTitre: 'Captures, logos, documents : ils arrivent directement chez Capmedia.', feuille: true,
    corps: `<form class="forme" id="forme-depot" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="cat-depot">Catégorie</label><select class="select" id="cat-depot" name="categorie">${optionsDe({ captures: 'Captures', logos: 'Logos', assets: 'Assets (images, textes)', cahier: 'Cahier des charges', autres: 'Autres' }, 'captures')}</select></div>
      <div class="groupe"><label class="etiquette-champ" for="desc-depot">Un mot pour nous <span class="facultatif">(facultatif)</span></label><input class="champ" id="desc-depot" name="description" maxlength="200"></div>
      <div id="zone-depot"></div>
    </form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="forme-depot">Envoyer</button>`,
  });
  const boite = depot(m.el.querySelector('#zone-depot'), { chemin: `projets/${pid}/documents/client`, max: 20 });
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
    ${liste.length ? `<div class="pile" style="gap:var(--e-4)">${liste.map((r) => `<div class="carte">
      <div class="rang-espace" style="align-items:flex-start">
        <div class="rang" style="gap:12px"><span class="ligne-icone${tonPlateforme(r.plateforme) ? ` ligne-icone--${tonPlateforme(r.plateforme)}` : ''}">${icone(iconePlateforme(r.plateforme) || 'releases')}</span><div><p class="t-titre-3 rang" style="gap:8px">${pucePlateforme(r.plateforme, { court: true })}${echapper(r.version || '')}${r.titre ? ` <span class="t-2" style="font-weight:400">· ${echapper(r.titre)}</span>` : ''}</p><p class="t-petit t-3" style="margin-top:2px">${echapper([r.statut === 'disponible' ? `Publiée le ${dateCourte(r.date)}` : dateCourte(r.date), (d.composants.find((c) => c.id === r.composant) || {}).nom].filter(Boolean).join(' · '))}${r.visibilite === 'interne' ? ' · Interne' : ''}</p></div></div>
        <div class="rang">${pastille(STATUTS_RELEASE, r.statut || 'developpement')}${env.role === 'equipe' ? `<button class="btn-icone" type="button" data-action="editer" data-genre="release" data-id="${echapper(r.id)}" aria-label="Modifier">${icone('edit')}</button>` : ''}</div>
      </div>
      ${(r.notes || []).length ? `<ul style="margin-top:14px" class="pile" style="gap:6px">${r.notes.map((n) => `<li class="rang" style="gap:10px;align-items:flex-start"><span style="flex:none">${pastille(TYPES_CHANGEMENT, n.type || 'amelioration')}</span><span class="t-petit">${echapper(n.texte)}</span></li>`).join('')}</ul>` : ''}
      ${(r.liens && (r.liens.store || r.liens.test)) ? `<div class="rang" style="margin-top:14px">${r.liens.store ? `<a class="btn btn-secondaire btn-petit" href="${echapper(r.liens.store)}" target="_blank" rel="noopener">${icone('externe')} Ouvrir dans le store</a>` : ''}${r.liens.test ? `<a class="btn btn-doux btn-petit" href="${echapper(r.liens.test)}" target="_blank" rel="noopener">${icone('externe')} Version de test</a>` : ''}</div>` : ''}
    </div>`).join('')}</div>`
    : vide({ icone: 'releases', titre: 'Aucune version publiée', texte: 'Chaque mise en ligne sera listée ici avec ce qui change.' })}
  </section>`;
};
const ouvrirRelease = () => {};

/* --- Liens --------------------------------------------------------------------- */
const liens = (d, { env }) => {
  const groupes = Object.entries(CATEGORIES_LIEN).map(([cle, lib]) => ({ cle, lib, items: d.liens.filter((l) => l.categorie === cle) })).filter((g) => g.items.length);
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Liens et environnements</h2>${boutonNouveau(env, 'lien', 'Ajouter un lien')}</div>
    ${groupes.length ? groupes.map((g) => `<div style="margin-bottom:var(--e-5)"><p class="surtitre" style="margin-bottom:8px">${echapper(g.lib)}</p><div class="grille grille-2">${g.items.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener">
      <span class="ligne-icone${tonPlateforme(l.composant) ? ` ligne-icone--${tonPlateforme(l.composant)}` : ''}">${icone(iconePlateforme(l.composant) || (l.categorie === 'code' ? 'code' : l.categorie === 'design' ? 'sparkle' : l.categorie === 'mobile' ? 'releases' : 'externe'))}</span>
      <span style="min-width:0"><span class="t-corps-fort" style="display:block">${echapper(l.nom)}${l.environnement ? ` <span class="etiquette" style="vertical-align:middle">${echapper(l.environnement)}</span>` : ''}${l.visibilite === 'interne' ? ' <span class="etiquette">Interne</span>' : ''}</span><span class="url" style="display:block">${echapper(l.url.replace(/^https?:\/\//, ''))}</span>${l.description ? `<span class="t-micro t-3" style="display:block">${echapper(l.description)}</span>` : ''}</span>
      <span class="rang" style="gap:2px">${env.role === 'equipe' ? `<button class="btn-icone" type="button" data-action="editer" data-genre="lien" data-id="${echapper(l.id)}" aria-label="Modifier" onclick="event.preventDefault()">${icone('edit')}</button>` : ''}<span class="chevron" style="color:var(--encre-4)">${icone('externe')}</span></span>
    </a>`).join('')}</div></div>`).join('')
    : vide({ icone: 'liens', titre: 'Aucun lien', texte: 'Production, stores, environnements de test, maquettes : tout au même endroit.' })}
  </section>`;
};

/* --- Réunions -------------------------------------------------------------------- */
const reunions = (d, { env, pid }) => {
  const aVenir = d.reunions.filter((r) => joursAvant(r.date) >= 0).sort(parDateAsc('date'));
  const passees = d.reunions.filter((r) => joursAvant(r.date) < 0).sort(parDateDesc('date'));
  const bloc = (r) => ligne({
    icone: 'reunions', ton: joursAvant(r.date) >= 0 ? 'bleu' : '',
    titre: echapper(r.titre), sous: `${echapper(dateHeure(r.date))}${r.duree ? ` · ${r.duree} min` : ''}${(r.participants || []).length ? ` · ${echapper(r.participants.map((p) => p.nom || p.email).join(', '))}` : ''}${r.visibilite === 'interne' ? ' · Interne' : ''}`,
    fin: `${r.lien && joursAvant(r.date) >= 0 ? `<a class="btn btn-secondaire btn-petit" href="${echapper(r.lien)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icone('video')} Rejoindre</a>` : ''}${r.compteRendu ? '<span class="etiquette">Compte rendu</span>' : ''}`,
    action: 'ouvrir-reunion', attrs: `data-id="${echapper(r.id)}"`,
  });
  return `
  <section class="section" style="margin-top:0">
    <div class="section-tete"><h2>Réunions</h2><div class="rang">${env.role === 'equipe' ? boutonNouveau(env, 'reunion', 'Programmer') : `<a class="btn btn-secondaire btn-petit" href="#/messages/${echapper(pid)}">${icone('messages')} Demander un créneau</a>`}</div></div>
    ${aVenir.length ? `<p class="surtitre" style="margin-bottom:8px">À venir</p><div class="liste" style="margin-bottom:var(--e-6)">${aVenir.map(bloc).join('')}</div>` : ''}
    ${passees.length ? `<p class="surtitre" style="margin-bottom:8px">Passées</p><div class="liste">${passees.map(bloc).join('')}</div>` : ''}
    ${!d.reunions.length ? vide({ icone: 'reunions', titre: 'Aucune réunion', texte: 'Les rendez-vous, leur ordre du jour et leur compte rendu seront ici.' }) : ''}
  </section>`;
};

const ouvrirReunion = (r, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const m = modale({
    titre: r.titre, sousTitre: `${dateHeure(r.date)}${r.duree ? ` · ${r.duree} min` : ''}`, feuille: true,
    corps: `
      ${r.lien ? `<a class="btn btn-principal" href="${echapper(r.lien)}" target="_blank" rel="noopener">${icone('video')} Rejoindre la réunion</a>` : ''}
      <button class="btn btn-secondaire" type="button" data-ics style="margin-left:8px">${icone('calendrier')} Ajouter à mon agenda</button>
      ${(r.participants || []).length ? `<div style="margin-top:20px"><p class="surtitre">Participants</p><p class="t-petit" style="margin-top:6px">${echapper(r.participants.map((p) => p.nom || p.email).join(', '))}</p></div>` : ''}
      ${r.ordreDuJour ? `<div style="margin-top:20px"><p class="surtitre">Ordre du jour</p><div class="prose t-corps" style="margin-top:6px">${enParagraphes(r.ordreDuJour)}</div></div>` : ''}
      ${r.compteRendu ? `<div style="margin-top:20px"><p class="surtitre">Compte rendu</p><div class="prose t-corps" style="margin-top:6px">${avecLiens(r.compteRendu)}</div></div>` : ''}
      ${r.decisions ? `<div style="margin-top:20px"><p class="surtitre">Décisions</p><div class="prose t-corps" style="margin-top:6px">${enParagraphes(r.decisions)}</div></div>` : ''}
      ${(r.actions || []).length ? `<div style="margin-top:20px"><p class="surtitre">Actions</p>${r.actions.map((a) => `<label class="coche${a.fait ? ' faite' : ''}"><input type="checkbox" ${a.fait ? 'checked' : ''} disabled><span>${echapper(a.texte)}</span></label>`).join('')}</div>` : ''}
      ${!r.ordreDuJour && !r.compteRendu ? '<p class="t-petit t-3" style="margin-top:20px">Pas encore de contenu pour cette réunion.</p>' : ''}`,
    pied: equipe ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>` : `<button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('reunion', env, { pid, fiche: r }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('reunion', env, { pid, fiche: r, libelle: 'cette réunion' }); if (ok) m.fermer(); });
  sur(m.el, 'click', '[data-ics]', () => telechargerICS(r));
};

const telechargerICS = (r) => {
  const debut = r.date && r.date.toDate ? r.date.toDate() : new Date(r.date);
  const fin = new Date(debut.getTime() + (Number(r.duree) || 60) * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Capmedia//Hub//FR', 'BEGIN:VEVENT', `UID:${r.id}@capmedia.app`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(debut)}`, `DTEND:${f(fin)}`, `SUMMARY:${(r.titre || '').replace(/\n/g, ' ')}`, r.lien ? `URL:${r.lien}` : '', r.ordreDuJour ? `DESCRIPTION:${r.ordreDuJour.replace(/\n/g, '\\n')}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = `${(r.titre || 'reunion').replace(/[^\w-]+/g, '-')}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
