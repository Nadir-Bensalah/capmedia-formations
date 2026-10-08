/* ==========================================================================
   À traiter : la boîte unique de ce qui attend l'équipe (refonte du
   Cockpit, lot 4). Elle reprend « À traiter maintenant » de l'accueil
   (enAttenteDeNous : les tickets chez nous, les tâches en retard, les
   points bloquants, les nouveaux projets) et y range ce qui attendait
   ailleurs une main de l'équipe : les problèmes des tests à confirmer, les
   devis et forfaits demandés, les accès à arbitrer, les notes que les
   clients ont partagées. Filtrable par genre, le filtre dans l'adresse
   (#/a-traiter?genre=tickets) : le Retour et un lien copié le retrouvent.
   Chaque ligne mène à l'endroit où l'on traite ; traitée, elle sort.
   ========================================================================== */

import { echapper, pluriel, estAdmin, peut, joursAvant, enDate, STATUTS, URGENCES, STATUTS_ANOMALIE, STATUTS_PREPROJET, STATUTS_MAINTENANCE, ATTEND_EQUIPE } from '../noyau.js';
import { pastille, pastilleTexte, puce, ligne, vide, squelette, titrePage } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, enAttenteDeNous, trierNotes } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { adresseAvec } from '../routeur.js';
import { nomAuteurNote } from './notes-client.js';

/* Les genres, dans l'ordre de la page : ce qui vient des clients d'abord. */
export const GENRES = [
  { cle: 'tickets', libelle: 'Tickets', vide: 'Aucun ticket ne nous attend.' },
  { cle: 'taches', libelle: 'Tâches en retard', vide: 'Aucune tâche en retard.' },
  { cle: 'blocages', libelle: 'Points bloquants', vide: 'Aucun point bloquant de notre côté.' },
  { cle: 'problemes', libelle: 'Problèmes à confirmer', vide: 'Aucun problème des tests à confirmer.' },
  { cle: 'devis', libelle: 'Devis et forfaits demandés', vide: 'Aucune demande de devis ni de forfait.' },
  { cle: 'projets', libelle: 'Nouveaux projets', vide: 'Aucune demande de nouveau projet.' },
  { cle: 'acces', libelle: 'Accès à arbitrer', vide: 'Aucun accès à arbitrer.' },
  { cle: 'notes', libelle: 'Notes partagées', vide: 'Aucune note partagée par un client.' },
];

/* Les clés que la boîte lit : la page les attend, le rail aussi (son
   compte). Une clé que le rôle ne lit pas (les nouveaux projets d'un
   agent) ne bloque personne ; les pièces ne sont attendues que de qui lit
   la finance (pour un agent sans finance.lecture, la clé assemblée ne se
   remplit jamais). */
export const clesBoite = (session) => [K.projets, K.ticketsTous, K.tachesToutes, K.blocagesTous, K.demandesProjet, K.projetsInternes, ...(peut(session, 'finance.lecture') ? [K.documentsTous] : []), K.maintenanceToute, K.anomaliesToutes, K.notesPartagees];

const GENRE_DE = { demande: 'tickets', tache: 'taches', blocage: 'blocages', preprojet: 'projets' };
const idDuChemin = (chemin) => String(chemin || '').split('?')[0].split('/').pop();
const quand = (v) => { const d = enDate(v); return d ? d.getTime() : 0; };

/** Ce qui attend l'équipe, genre par genre, selon ce que la session peut voir. */
export const boite = (session) => {
  const projets = magasin.lire(K.projets) || [];
  const vivant = new Set(projets.filter((p) => !p.archive).map((p) => p.id));
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
  const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
  const blocages = magasin.lire(K.blocagesTous) || [];
  const admin = estAdmin(session);
  const demandesProjet = admin ? (magasin.lire(K.demandesProjet) || []) : [];
  const items = [];

  /* Les quatre genres d'« À traiter maintenant » (l'accueil), tels quels. */
  const parId = new Map(tickets.map((t) => [t.id, t]));
  const prepParId = new Map(demandesProjet.map((d) => [d.id, d]));
  enAttenteDeNous({ projets, tickets, taches, blocages, demandesProjet }).forEach((a) => {
    const genre = GENRE_DE[a.genre];
    if (!genre) return;
    const item = { genre, titre: a.titre || '', sous: a.sous || '', chemin: a.chemin, date: a.date, projet: a.projet };
    if (genre === 'tickets') {
      const t = parId.get(idDuChemin(a.chemin)) || {};
      const lu = (t.lu || {}).equipe;
      item.nonLu = !lu || quand(t.maj) > quand(lu);
      item.fin = `${puce(URGENCES, t.urgence || 'important')}${pastille(STATUTS, t.statut)}`;
      item.rang = t.statut === 'nouveau' ? 0 : 1;
      item.titre = `${t.numero ? `${t.numero} ` : ''}${a.titre || ''}`;
    } else if (genre === 'taches') {
      item.fin = pastilleTexte('En retard', 'rouge');
    } else if (genre === 'blocages') {
      item.fin = pastilleTexte('Bloquant', 'rouge');
    } else if (genre === 'projets') {
      const d = prepParId.get(idDuChemin(a.chemin)) || {};
      item.fin = pastille(STATUTS_PREPROJET, d.statut || 'nouvelle');
    }
    items.push(item);
  });

  /* Les problèmes relevés par les tests, pas encore confirmés : on les
     reproduit, on tranche. Ouverts sur la fiche du problème. */
  (magasin.lire(K.anomaliesToutes) || []).forEach((a) => {
    const pid = a.projet || a._parent;
    const statut = a.statut || 'nouvelle';
    if (!['nouvelle', 'a-reverifier'].includes(statut) || !vivant.has(pid)) return;
    items.push({
      genre: 'problemes', titre: a.titre || 'Problème', sous: `${(STATUTS_ANOMALIE[statut] || {}).libelle || ''} · ${nomProjet(pid)}`,
      chemin: adresseAvec('/tests', { projet: pid, anomalie: a.id }), date: a.date || a.cree, projet: pid,
      fin: pastille(STATUTS_ANOMALIE, statut),
    });
  });

  /* Un devis demandé par le calculateur du client (à chiffrer), et un
     forfait de maintenance demandé (une proposition est due). */
  if (peut(session, 'finance.lecture')) {
    (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive && d.type === 'devis' && d.statut === 'demande' && vivant.has(d.projet)).forEach((d) => items.push({
      genre: 'devis', titre: d.libelle || 'Demande de devis', sous: `Devis à chiffrer, demandé par ${(d.par || {}).nom || 'le client'} · ${nomProjet(d.projet)}`,
      chemin: `/finances/${d.id}`, date: d.date, projet: d.projet, fin: pastilleTexte('À chiffrer', 'bleu'),
    }));
  }
  (magasin.lire(K.maintenanceToute) || []).forEach((x) => {
    const pid = x.projet || x._parent;
    if (x.id !== 'contrat' || x.statut !== 'demande' || !vivant.has(pid)) return;
    items.push({
      genre: 'devis', titre: `Forfait de maintenance pour ${nomProjet(pid)}`, sous: `Demandé${((x.demande || {}).par || {}).nom ? ` par ${x.demande.par.nom}` : ''} · une proposition est due`,
      chemin: adresseAvec('/maintenance', { projet: pid }), date: (x.demande || {}).le || x.maj, projet: pid, fin: pastille(STATUTS_MAINTENANCE, 'demande'),
    });
  });

  /* Les accès qui attendent un choix humain (la même règle que l'accueil). */
  if (peut(session, 'acces.gerer')) {
    (magasin.lire(K.projetsInternes) || []).forEach((i) => {
      const roles = Number(i.rolesADefinir) || 0;
      const points = (i.arbitragesAcces || []).length;
      if ((!roles && !points) || !vivant.has(i.id)) return;
      items.push({
        genre: 'acces', titre: nomProjet(i.id), sous: [roles ? pluriel(roles, 'rôle à choisir', 'rôles à choisir') : '', points ? pluriel(points, 'point à trancher', 'points à trancher') : ''].filter(Boolean).join(' · '),
        chemin: `/projets/${i.id}/acces`, projet: i.id, fin: pastilleTexte('À arbitrer', 'ambre'),
      });
    });
  }

  /* Ce que les clients ont voulu nous dire de leur carnet. */
  trierNotes(magasin.lire(K.notesPartagees) || []).filter((n) => vivant.has(n.projet)).forEach((n) => {
    const texte = String(n.texte || '').replace(/\s+/g, ' ').trim();
    items.push({
      genre: 'notes', titre: texte.length > 90 ? `${texte.slice(0, 89)}…` : (texte || 'Note partagée'), sous: `${nomAuteurNote(n)} · ${nomProjet(n.projet)}`,
      chemin: `/projets/${n.projet}/notes`, date: n.maj || n.cree, projet: n.projet, fin: pastilleTexte('Partagée', 'violet'),
    });
  });
  return items;
};

/** Le compte de la boîte, pour le rail. */
export const compteBoite = (session) => boite(session).length;

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('À traiter');
  filAriane([{ libelle: 'À traiter' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  const lireGenre = (requete = {}) => (GENRES.some((g) => g.cle === requete.genre) ? requete.genre : '');
  let genre = lireGenre(ctx.requete);

  const rendre = () => {
    const items = boite(env.session);
    const parGenre = new Map(GENRES.map((g) => [g.cle, []]));
    items.forEach((x) => parGenre.get(x.genre).push(x));
    /* Les tickets nouveaux en tête, puis les plus anciens d'abord ; ailleurs
       l'ordre de l'urgence (enAttenteDeNous) ou le plus ancien d'abord. */
    parGenre.get('tickets').sort((a, b) => (a.rang - b.rang));
    ['problemes', 'devis', 'notes'].forEach((g) => parGenre.get(g).sort((a, b) => quand(a.date) - quand(b.date)));
    const visibles = GENRES.filter((g) => parGenre.get(g.cle).length || g.cle === genre);
    const montres = genre ? GENRES.filter((g) => g.cle === genre) : visibles;
    const tickets = parGenre.get('tickets');
    const nouveaux = tickets.filter((t) => t.rang === 0).length;
    const chapo = items.length
      ? `${pluriel(items.length, 'point attend', 'points attendent')} l'équipe${nouveaux ? `, dont ${pluriel(nouveaux, 'nouveau ticket', 'nouveaux tickets')}` : ''}.`
      : 'Rien n\'attend l\'équipe.';
    const puceGenre = (cle, libelle, n) => `<a class="filtre${genre === cle ? ' actif' : ''}" href="#${echapper(adresseAvec('/a-traiter', { genre: cle }))}" data-genre-filtre="${echapper(cle || 'tout')}"${genre === cle ? ' aria-current="true"' : ''}>${echapper(libelle)}<span class="compte">${n}</span></a>`;
    sortie.innerHTML = `<div class="page page-a-traiter">
      <div class="page-tete"><div><h1>À traiter</h1><p class="chapo">${echapper(chapo)}</p></div>
        <div class="actions"><a class="btn btn-secondaire" href="#/demandes">Tous les tickets</a></div></div>
      <div class="filtres" style="margin-bottom:20px" role="navigation" aria-label="Genres">
        ${puceGenre('', 'Tout', items.length)}
        ${visibles.map((g) => puceGenre(g.cle, g.libelle, parGenre.get(g.cle).length)).join('')}
      </div>
      ${!items.length && !genre ? vide({ icone: 'check', titre: 'Rien à traiter', texte: 'La boîte est vide. Profitez-en pour avancer les tâches.', action: '<a class="btn btn-secondaire" href="#/taches">Voir les tâches</a>' }) : ''}
      ${montres.map((g) => {
        const liste = parGenre.get(g.cle);
        return `<section class="section" data-genre="${echapper(g.cle)}"${montres[0] === g ? ' style="margin-top:0"' : ''}>
          <div class="section-tete"><h2>${echapper(g.libelle)} <span class="compte-section${g.cle === 'tickets' && nouveaux ? ' compte-section--vif' : ''}">${liste.length}</span></h2></div>
          ${liste.length ? `<div class="liste">${liste.map((x) => ligne({
            href: `#${x.chemin}`, titre: echapper(x.titre), sous: echapper(x.sous), fin: x.fin || '', nonLu: x.nonLu,
            attrs: `data-genre-item="${echapper(g.cle)}"`,
          })).join('')}</div>` : vide({ icone: 'check', titre: g.vide, texte: 'Ce genre est traité.', action: '<a class="btn btn-secondaire" href="#/a-traiter">Voir tout ce qui attend</a>', compact: true })}
        </section>`;
      }).join('')}
    </div>`;
  };

  const cles = clesBoite(env.session);
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return {
    fin: () => { planifier.arreter(); lot.fin(); },
    /* Un autre genre : un dessin, en place. */
    maj: (suite) => {
      const g = lireGenre(suite.requete);
      if (g === genre) return;
      genre = g;
      rendre();
    },
  };
};

void joursAvant; void ATTEND_EQUIPE;
