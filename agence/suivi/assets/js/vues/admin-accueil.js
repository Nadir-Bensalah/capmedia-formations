/* ==========================================================================
   Aujourd'hui, l'accueil du cockpit : que dois-je traiter aujourd'hui ?

   Refonte du Cockpit, lot 5, sur le modèle de l'accueil du Hub :
   - « Depuis mon passage » : ce que les clients ont fait depuis ma
     dernière visite (le fil d'activité, leurs gestes seulement), chaque
     compte menant à l'endroit où l'on agit ;
   - le pavé « À traiter » (la boîte du rail, boite() de admin-a-traiter.js,
     mêmes genres, même compte) et, à droite, « Attendent le client » : deux
     pavés que l'on replie (pave-attente.js, espace 'equipe'), le choix
     gardé dans le profil ;
   - Messages, avec les messages non lus des clients et des testeurs ;
   - des chiffres qui mènent chacun à sa liste (ceux qui ne menaient nulle
     part redisaient la phrase d'accueil) ;
   - « + Projet » et « + Client » sous la permission qui les autorise.
   ========================================================================== */

import { echapper, prenom, nomAffiche, dateCourte, dateHeure, montant, pluriel, joursAvant, enDate, parDateDesc, parDateAsc, OUVERTS, ATTEND_CLIENT, URGENCES, STATUTS_PROJET, statutProjet, verdictDelai, peut } from '../noyau.js';
import { icone, pastille, avatarProjet, ligne, vide, squelette, titrePage, progressionOuPas, verdictHtml } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, enAttenteDuClient, projetsActifs, progressionProjet, resteAPayer, risquesProjet, trierNotes, nonLusProjet, messagesDuProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { adresseAvec } from '../routeur.js';
import { activiteHtml } from './accueil.js';
import { notesPartageesHtml, gesteNoteDemande } from './notes-client.js';
import { boite, clesBoite } from './admin-a-traiter.js';
import { etatPave, paveHtml, brancherPaves } from '../pave-attente.js';

/* L'ordre du pavé « À traiter » : ce qui brûle d'abord (un ticket
   bloquant ou critique), puis le travail en retard, les autres tickets,
   et le reste de la boîte. */
const RANG_GENRE = { taches: 1, blocages: 1, tickets: 2, problemes: 3, devis: 4, acces: 5, notes: 6, projets: 7 };
const LIGNES_PAVE = 8;

/* Ce que les clients ont fait depuis mon passage, dans les mots de
   l'équipe. `vers(pid, finance, admin)` : où l'on agit (le projet quand
   tout vient du même, sinon la page de tous les projets). */
const GESTES_CLIENT = [
  { type: 'demande', un: 'ticket', plusieurs: 'tickets', icone: 'demandes', vers: (p) => (p ? `/projets/${p}/demandes` : '/demandes') },
  { type: 'message', un: 'message', plusieurs: 'messages', icone: 'messages', vers: (p) => (p ? `/messages/${p}` : '/messages') },
  { type: 'fichier', un: 'fichier', plusieurs: 'fichiers', icone: 'fichiers', vers: (p) => adresseAvec('/fichiers', { projet: p }) },
  { type: 'validation', un: 'réponse à une validation', plusieurs: 'réponses à des validations', icone: 'valider', vers: () => '/validations' },
  { type: 'tache', un: 'réponse sur une tâche', plusieurs: 'réponses sur des tâches', icone: 'check', vers: (p) => (p ? `/projets/${p}/taches` : '/taches') },
  { type: 'blocage', un: 'point bloquant réglé', plusieurs: 'points bloquants réglés', icone: 'alerte', vers: (p) => (p ? `/projets/${p}` : '/activite?nature=blocage') },
  { type: 'devis', un: 'devis', plusieurs: 'devis', icone: 'receipt', vers: (p, finance) => (finance ? adresseAvec('/finances', { onglet: 'devis', projet: p }) : adresseAvec('/activite', { projet: p, nature: 'devis' })) },
  { type: 'paiement', un: 'règlement déclaré', plusieurs: 'règlements déclarés', icone: 'euro', vers: (p, finance) => (finance ? adresseAvec('/finances', { projet: p }) : adresseAvec('/activite', { projet: p, nature: 'paiement' })) },
  { type: 'axe', un: 'choix sur les axes', plusieurs: 'choix sur les axes', icone: 'trend', vers: (p) => (p ? `/projets/${p}/evolutions` : '/activite') },
  { type: 'maintenance', un: 'demande de maintenance', plusieurs: 'demandes de maintenance', icone: 'sante', vers: (p) => adresseAvec('/maintenance', { projet: p }) },
  { type: 'reunion', un: 'réunion', plusieurs: 'réunions', icone: 'reunions', vers: (p) => adresseAvec('/calendrier', { projet: p }) },
  { type: 'note', un: 'note', plusieurs: 'notes', icone: 'note', vers: (p) => (p ? `/projets/${p}/notes` : '/activite?nature=note') },
  { type: 'projet', un: 'demande de projet', plusieurs: 'demandes de projet', icone: 'sparkle', vers: (p, finance, admin) => (admin ? '/nouveaux-projets' : '/activite?nature=projet') },
];

/** Ce que les clients ont fait après une date : leurs gestes seulement. */
export const gestesDesClients = (activite = [], depuis, uid = null) => {
  const seuil = enDate(depuis);
  if (!seuil) return [];
  return activite.filter((a) => {
    const d = enDate(a.date);
    return d && d > seuil && a.par && a.par.cote === 'client' && !(uid && a.par.uid === uid);
  });
};

/* Une tuile qui porte une action : le chiffre, ce qu'il compte, et la
   liste où l'on agit. */
const tuile = ({ cle, href, valeur, libelle, ton = '', nuance = '' }) => `<a class="metrique${ton ? ` metrique--${ton}` : ''}" href="#${echapper(href)}" data-tuile="${echapper(cle)}">
    <p class="metrique-valeur">${echapper(valeur)}</p>
    <p class="metrique-libelle">${echapper(libelle)}</p>
    ${nuance ? `<p class="metrique-nuance">${echapper(nuance)}</p>` : ''}
  </a>`;

/* La colonne de la page Tickets où vit un statut. */
const colonneDe = (statut) => (statut === 'nouveau' ? '' : ATTEND_CLIENT.includes(statut) ? 'client' : 'a-traiter');
const idDuChemin = (chemin) => String(chemin || '').split('?')[0].split('/').pop();

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const { session } = env;
  const uid = session.utilisateur.uid;
  const finance = peut(session, 'finance.lecture');
  const admin = Boolean(env.admin);
  const avecTesteurs = peut(session, 'qa.gerer');
  titrePage('Cockpit');
  filAriane([{ libelle: 'Aujourd\'hui' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;

  /* Les conversations des projets clients : le cockpit les écoute déjà
     (admin.js) ; la page en lit les non lus et redessine quand un message
     arrive. */
  const projetsClients = () => (magasin.lire(K.projets) || []).filter((p) => !p.archive && !p.interne);
  let dernierHtml = '';

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const organisations = magasin.lire(K.organisations) || [];
    const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
    const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
    const validations = magasin.lire(K.validationsToutes) || [];
    /* La finance reste à qui la gère : un agent ne voit ni l'impayé, ni les
       devis en attente, ni les paiements, même sur ses projets ; sa page
       n'attend pas non plus ces pièces, qu'il ne reçoit jamais. */
    const documents = finance ? (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive) : [];
    const paiements = finance ? (magasin.lire(K.paiementsTous) || []) : [];
    const reunions = magasin.lire(K.reunionsToutes) || [];
    const blocages = magasin.lire(K.blocagesTous) || [];
    const activite = (magasin.lire(K.activiteToute) || []).slice().sort(parDateDesc('date'));
    const jalons = magasin.lire(K.jalonsTous) || [];
    const profil = magasin.lire(K.profil);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    /* Ce que les clients ont partagé de leur carnet : à lire en premier,
       c'est ce qu'ils ont voulu nous dire. */
    const notesPartagees = trierNotes(magasin.lire(K.notesPartagees) || []);
    /* Les accès qui attendent un choix humain : un contact préparé sans
       rôle (il n'a aucun accès), ou un point laissé par la migration (un
       ancien membre sans compte, une adresse qui porte un autre rôle). */
    const aArbitrer = peut(session, 'acces.gerer') ? (magasin.lire(K.projetsInternes) || [])
      .map((i) => ({ pid: i.id, roles: Number(i.rolesADefinir) || 0, points: (i.arbitragesAcces || []).length }))
      .filter((x) => (x.roles || x.points) && projets.some((p) => p.id === x.pid))
      .sort((a, b) => nomProjet(a.pid).localeCompare(nomProjet(b.pid))) : [];

    const actifs = projetsActifs(projets).filter((p) => !p.interne);
    /* Mes propres projets se comptent à part : ils n'ont pas de client et
       ne disent rien du portefeuille commercial. */
    const maison = projets.filter((p) => p.interne && !p.archive);
    const enRetard = actifs.filter((p) => p.cible && joursAvant(p.cible) < 0 && p.statut !== 'termine');
    const ouverts = tickets.filter((t) => OUVERTS.includes(t.statut));
    const nouvelles = tickets.filter((t) => t.statut === 'nouveau');
    const bloquants = ouverts.filter((t) => t.urgence === 'bloquant' || t.urgence === 'critique');
    const aFaire = taches.filter((t) => t.statut !== 'terminee');
    const tachesRetard = aFaire.filter((t) => t.echeance && joursAvant(t.echeance) < 0);
    const attendues = validations.filter((v) => v.statut === 'en-attente');
    const attendClient = enAttenteDuClient({ projets, tickets, validations, documents, taches, blocages });
    const prochaines = reunions.filter((r) => joursAvant(r.date) >= 0).sort(parDateAsc('date')).slice(0, 4);
    const devisAttente = documents.filter((d) => d.type === 'devis' && ['envoye', 'consulte'].includes(d.statut));
    const { total: impaye } = resteAPayer(documents, paiements);
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const facture = documents.filter((d) => d.type === 'facture' && !['brouillon', 'annulee', 'avoir'].includes(d.statut) && d.date && (d.date.toDate ? d.date.toDate() : new Date(d.date)) >= debutAnnee).reduce((s, d) => s + (Number(d.montant) || 0), 0);
    const recents = paiements.slice().sort(parDateDesc('date')).slice(0, 4);

    /* La boîte du rail, telle quelle : le pavé dit le même nombre que
       l'entrée « À traiter ». */
    const urgenceDe = new Map(tickets.map((t) => [t.id, t.urgence]));
    const items = boite(session);
    const rang = (x) => (x.genre === 'tickets' && ['bloquant', 'critique'].includes(urgenceDe.get(idDuChemin(x.chemin))) ? 0 : (RANG_GENRE[x.genre] || 9));
    const enTete = items.map((x, i) => ({ x, i })).sort((a, b) => (rang(a.x) - rang(b.x)) || (a.i - b.i)).map(({ x }) => x);

    /* Messages : ce que les clients et les testeurs nous ont écrit et que
       je n'ai pas lu (le même compte que le rail). Un seul fil concerné :
       le bouton y mène. */
    const nonLusParProjet = projetsClients().map((p) => ({ pid: p.id, n: nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid) })).filter((x) => x.n);
    const nonLusClients = nonLusParProjet.reduce((s, x) => s + x.n, 0);
    const nonLusTesteurs = avecTesteurs ? (magasin.lire(K.conversationsTesteurs) || []).reduce((n, c) => n + Number(c.nonLusEquipe || 0), 0) : 0;
    const nonLus = nonLusClients + nonLusTesteurs;
    const versMessages = nonLusParProjet.length === 1 && !nonLusTesteurs ? `/messages/${nonLusParProjet[0].pid}`
      : !nonLusClients && nonLusTesteurs ? '/testeurs-messages' : '/messages';
    const etiquetteMessages = `Messages${nonLus ? `, ${pluriel(nonLus, 'message non lu', 'messages non lus')}` : ''}`;

    /* Depuis mon passage : les gestes des clients, type par type. La date
       est celle d'avant cette session (admin.js la garde dans env). */
    const passage = env.derniereVisite === undefined ? (profil || {}).derniereVisite : env.derniereVisite;
    const gestes = gestesDesClients(activite, passage, uid);
    const resumePassage = gestes.length ? (() => {
      const parts = GESTES_CLIENT.map((g) => {
        const liste = gestes.filter((a) => a.type === g.type);
        if (!liste.length) return '';
        const pids = [...new Set(liste.map((a) => a.projet).filter(Boolean))];
        const href = g.vers(pids.length === 1 ? pids[0] : '', finance, admin);
        return `<a class="rang" style="gap:6px;color:inherit" href="#${echapper(href)}" data-passage="${echapper(g.type)}">${icone(g.icone)} ${echapper(pluriel(liste.length, g.un, g.plusieurs))}</a>`;
      }).filter(Boolean);
      const connus = new Set(GESTES_CLIENT.map((g) => g.type));
      const autres = gestes.filter((a) => !connus.has(a.type)).length;
      if (autres) parts.push(`<a class="rang" style="gap:6px;color:inherit" href="#/activite" data-passage="autre">${icone('activite')} ${echapper(pluriel(autres, parts.length ? 'autre mouvement' : 'mouvement', parts.length ? 'autres mouvements' : 'mouvements'))}</a>`);
      return `<div class="encart encart--info" id="depuis-passage" style="margin-bottom:var(--e-6)"><div><strong>Depuis mon passage</strong>${dateHeure(passage) ? `<span class="t-2">, le ${echapper(dateHeure(passage))}</span>` : ''}<span class="rang" style="margin-top:6px;gap:16px">${parts.join('')}</span></div></div>`;
    })() : '';

    const paveATraiter = items.length ? paveHtml({
      cle: 'accueil', etat: etatPave('accueil', 'equipe'), espace: 'equipe', titre: 'À traiter', nombre: items.length,
      attrs: 'data-a-traiter', premier: !resumePassage,
      tete: '<a class="btn btn-fantome btn-petit" href="#/a-traiter">Tout voir</a>',
      corps: `<div class="liste" style="margin-top:8px">${enTete.slice(0, LIGNES_PAVE).map((x) => ligne({
        href: `#${x.chemin}`, titre: echapper(x.titre), sous: echapper(x.sous), fin: x.fin || '', nonLu: x.nonLu, attrs: `data-pave-item="${echapper(x.genre)}"`,
      })).join('')}</div>
        ${items.length > LIGNES_PAVE ? `<p style="margin-top:8px"><a class="t-petit t-fort" href="#/a-traiter">${echapper(pluriel(items.length - LIGNES_PAVE, 'autre point', 'autres points'))} dans À traiter</a></p>` : ''}`,
    }) : `<section class="section" data-a-traiter${resumePassage ? '' : ' style="margin-top:0"'}>
        <div class="section-tete"><h2>À traiter</h2><a class="lien" href="#/a-traiter">Tout voir</a></div>
        ${vide({ icone: 'check', titre: 'Rien à traiter', texte: 'La boîte est vide. Profitez-en pour avancer les tâches.', compact: true })}
      </section>`;

    const ligneClient = (a) => `<a class="rang" style="gap:10px;color:inherit;align-items:flex-start;flex-wrap:nowrap" href="#${echapper(a.chemin)}"><span class="ligne-icone ligne-icone--${a.ton || 'ambre'}" style="width:28px;height:28px;border-radius:8px">${icone(a.icone)}</span><span style="min-width:0"><span class="t-petit t-fort tronque" style="display:block">${echapper(a.titre)}</span><span class="t-micro t-3">${echapper(a.sous)}</span></span></a>`;
    const paveClient = attendClient.length ? paveHtml({
      cle: 'projet:*', etat: etatPave('projet:*', 'equipe'), espace: 'equipe', titre: 'Attendent le client', nombre: attendClient.length,
      attrs: 'data-attente-client',
      corps: `<div class="pile" style="margin-top:10px;gap:8px">${attendClient.slice(0, 6).map(ligneClient).join('')}</div>
        ${attendClient.length > 6 ? `<p class="t-petit t-2" style="margin-top:8px">${echapper(pluriel(attendClient.length - 6, 'autre point', 'autres points'))} dans l'aperçu de leurs projets.</p>` : ''}`,
    }) : '<div class="carte carte--creuse" data-attente-client><p class="surtitre">Attendent le client</p><p class="t-petit t-2" style="margin-top:8px">Rien en attente côté client.</p></div>';

    /* Les chiffres qui portent une action, chacun vers sa liste. Le plus
       urgent des tickets brûlants donne l'urgence et la colonne. */
    const premierUrgent = bloquants.slice().sort((a, b) => ((URGENCES[a.urgence] || {}).rang || 9) - ((URGENCES[b.urgence] || {}).rang || 9))[0];
    const tuiles = [
      tuile({ cle: 'tickets', href: '/demandes', valeur: nouvelles.length, libelle: 'Tickets reçus', ton: nouvelles.length ? 'accent' : '', nuance: `${ouverts.length} ouverts` }),
      tuile({ cle: 'bloquants', href: premierUrgent ? adresseAvec('/demandes', { colonne: colonneDe(premierUrgent.statut), urgence: premierUrgent.urgence }) : adresseAvec('/demandes', { urgence: 'bloquant' }), valeur: bloquants.length, libelle: 'Bloquants ou critiques', ton: bloquants.length ? 'rouge' : '' }),
      tuile({ cle: 'retard', href: '/taches?retard=1', valeur: tachesRetard.length, libelle: 'Tâches en retard', ton: tachesRetard.length ? 'rouge' : '', nuance: `${aFaire.length} à faire` }),
      tuile({ cle: 'validations', href: '/validations', valeur: attendues.length, libelle: 'Validations attendues' }),
      finance ? tuile({ cle: 'impaye', href: '/finances', valeur: montant(impaye), libelle: 'Impayé', ton: impaye > 0 ? 'ambre' : 'vert', nuance: `${montant(facture)} facturé en ${new Date().getFullYear()}` }) : '',
    ].join('');

    const html = `<div class="page">
      <div class="page-tete"><div><p class="surtitre">${echapper(dateCourte(new Date()))}</p><h1>Bonjour ${echapper(prenom(nomAffiche(session)))}</h1><p class="chapo">${pluriel(actifs.length, 'projet client actif', 'projets clients actifs')} pour ${pluriel(organisations.length, 'client')}, et ${pluriel(maison.length, 'projet à moi', 'projets à moi')}. ${items.length ? `${pluriel(items.length, 'point à traiter', 'points à traiter')} de notre côté` : 'Rien n\'attend de notre côté'}${nonLus ? `, ${pluriel(nonLus, 'message non lu', 'messages non lus')}` : ''}.</p></div>
        <div class="actions">
          ${peut(session, 'projets.creer') ? `<a class="btn btn-secondaire" href="#/projets/nouveau">${icone('plus')} Projet</a>` : ''}
          ${peut(session, 'clients.gerer') ? `<a class="btn btn-secondaire" href="#/clients/nouveau">${icone('entreprise')} Client</a>` : ''}
          <a class="btn btn-secondaire btn-messages" href="#${echapper(versMessages)}" data-raccourci-lien="messages" aria-label="${echapper(etiquetteMessages)}">${icone('messages')} Messages${nonLus ? `<span class="badge badge--vif" id="badge-messages" aria-hidden="true">${nonLus > 99 ? '99+' : nonLus}</span>` : ''}</a>
          <a class="btn btn-principal" href="#/demandes">${icone('inbox')} Tickets${nouvelles.length ? ` <span class="badge badge--vif" style="background:#fff;color:var(--accent)">${nouvelles.length}</span>` : ''}</a>
        </div></div>

      ${resumePassage}

      ${paveATraiter}

      <div class="metriques section">${tuiles}</div>

      <div class="grille grille-tiers section">
        <div class="pile" style="gap:var(--e-7)">
          <section>
            <div class="section-tete"><h2>Projets clients <span class="compte-section">${actifs.length}</span></h2><a class="lien" href="#/projets">Tous</a></div>
            ${actifs.length ? `<div class="liste">${actifs.slice(0, 8).map((p) => { const prog = progressionProjet(p, jalons.filter((j) => j.projet === p.id), { taches: taches.filter((t) => t.projet === p.id) }); const ouvertsP = ouverts.filter((t) => t.projet === p.id).length; return ligne({ href: `#/projets/${echapper(p.id)}`, titre: `<span class="rang" style="gap:10px">${avatarProjet(p, 'petit')} ${echapper(p.nom)}</span>`, sous: `${echapper((p.client || {}).entreprise || (p.client || {}).nom || '')}${p.pulse && p.pulse.enCours ? ` · ${echapper(p.pulse.enCours)}` : ''}${ouvertsP ? ` · ${pluriel(ouvertsP, 'ticket ouvert', 'tickets ouverts')}` : ''}`, fin: `<span style="width:90px">${progressionOuPas(prog)}</span>${pastille(STATUTS_PROJET, statutProjet(p))}${verdictHtml(verdictDelai(p.cible, { clos: statutProjet(p) === 'termine', risques: risquesProjet({ jalons: jalons.filter((j) => j.projet === p.id), blocages: blocages.filter((b) => b.projet === p.id), taches: taches.filter((t) => t.projet === p.id) }) }), { vide: false, detail: false })}` }); }).join('')}</div>` : vide({ icone: 'projets', titre: 'Aucun projet actif', action: peut(session, 'projets.creer') ? '<a class="btn btn-principal" href="#/projets/nouveau">Créer un projet</a>' : '', compact: true })}
            ${enRetard.length ? `<p class="t-petit t-2" style="margin-top:8px">${pluriel(enRetard.length, 'projet a dépassé sa date cible', 'projets ont dépassé leur date cible')}.</p>` : ''}
          </section>
          <section>
            <div class="section-tete"><h2>Activité récente</h2><a class="lien" href="#/activite">Tout</a></div>
            ${activiteHtml(activite.slice(0, 10).map((a) => ({ ...a, projetNom: nomProjet(a.projet) })), { avecProjet: true, equipe: true })}
          </section>
        </div>
        <aside class="pile" style="gap:var(--e-5)">
          ${notesPartageesHtml(notesPartagees, { nomProjet })}
          ${aArbitrer.length ? `<div class="carte carte--creuse" id="acces-a-arbitrer"><p class="surtitre">Accès à arbitrer</p><div class="pile" style="margin-top:10px;gap:8px">${aArbitrer.map((x) => `<a class="rang-espace" style="color:inherit" href="#/projets/${echapper(x.pid)}/acces"><span class="t-petit tronque">${echapper(nomProjet(x.pid))}</span><span class="t-micro t-2">${[x.roles ? pluriel(x.roles, 'rôle à choisir', 'rôles à choisir') : '', x.points ? pluriel(x.points, 'point', 'points') : ''].filter(Boolean).join(' · ')}</span></a>`).join('')}</div></div>` : ''}
          ${paveClient}
          <div class="carte carte--creuse"><p class="surtitre">Prochaines réunions</p>${prochaines.length ? `<div class="pile" style="margin-top:10px;gap:10px">${prochaines.map((r) => `<a class="rang" style="gap:10px;color:inherit;align-items:flex-start;flex-wrap:nowrap" href="#/calendrier?projet=${echapper(encodeURIComponent(r.projet))}&amp;reunion=${echapper(encodeURIComponent(r.id))}"><span class="ligne-icone ligne-icone--bleu" style="width:28px;height:28px;border-radius:8px">${icone('reunions')}</span><span style="min-width:0"><span class="t-petit t-fort tronque" style="display:block">${echapper(r.titre)}</span><span class="t-micro t-3">${echapper(dateHeure(r.date))} · ${echapper(nomProjet(r.projet))}</span></span></a>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucune réunion programmée.</p>'}<p style="margin-top:10px"><a class="t-petit" href="#/calendrier">Calendrier</a></p></div>
          ${finance ? `<div class="carte carte--creuse"><p class="surtitre">Devis en attente</p>${devisAttente.length ? `<div class="pile" style="margin-top:10px;gap:8px">${devisAttente.map((d) => `<a class="rang-espace" style="color:inherit" href="#/finances/${echapper(d.id)}"><span class="t-petit tronque">${echapper(d.numero || '')} ${echapper(nomProjet(d.projet))}</span><span class="t-petit t-fort nb">${echapper(montant(d.montant))}</span></a>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucun devis en attente.</p>'}</div>` : ''}
          ${finance ? `<div class="carte carte--creuse"><p class="surtitre">Paiements récents</p>${recents.length ? `<div class="pile" style="margin-top:10px;gap:8px">${recents.map((p) => `<div class="rang-espace"><span class="t-petit">${echapper(dateCourte(p.date))} · ${echapper(nomProjet(p.projet))}</span><span class="t-petit t-fort nb" style="color:var(--ok)">${echapper(montant(p.montant))}</span></div>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucun paiement enregistré.</p>'}<p style="margin-top:10px"><a class="t-petit" href="#/finances">Finances</a></p></div>` : ''}
        </aside>
      </div>
    </div>`;
    /* Un dessin identique n'est pas repeint : le profil change souvent
       (une conversation lue, la date du passage) sans rien changer ici. */
    if (html === dernierHtml) return;
    dernierHtml = html;
    sortie.innerHTML = html;
  };

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là.
     Les pièces et les paiements ne sont attendus que de qui lit la
     finance : pour un agent sans finance.lecture, leur clé assemblée ne se
     remplit jamais, et la page attendait sa patience entière (L3). */
  const base = [...new Set([K.projets, K.organisations, K.ticketsTous, K.tachesToutes, K.validationsToutes, K.reunionsToutes, K.blocagesTous, K.activiteToute, K.demandesProjet, K.jalonsTous, K.projetsInternes, K.notesPartagees, K.profil,
    ...clesBoite(session), ...(finance ? [K.documentsTous, K.paiementsTous] : []), ...(avecTesteurs ? [K.conversationsTesteurs] : [])])];
  const fils = new Set();
  const cles = () => [...base, ...[...fils].map((pid) => K.messages(pid))];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  /* Une conversation de plus à écouter quand un projet client arrive. */
  const suivreFils = () => {
    for (const p of projetsClients()) {
      if (fils.has(p.id)) continue;
      fils.add(p.id);
      lot.sur(K.messages(p.id), planifier);
    }
  };
  suivreFils();
  lot.sur(K.projets, suivreFils);
  base.forEach((c) => lot.sur(c, planifier));
  planifier();
  const gesteNotes = gesteNoteDemande(sortie, () => magasin.lire(K.notesPartagees) || []);
  /* Replier, déplier les deux pavés : le profil le retient, la page suit. */
  const gestesPaves = brancherPaves(sortie, env);
  return () => { planifier.arreter(); gesteNotes(); gestesPaves(); lot.fin(); };
};
