/* ==========================================================================
   Le calendrier : réunions, rendez-vous demandés, étapes, échéances de
   tâches, factures, devis, versions, validations attendues. Une grille
   mensuelle dont chaque jour s'ouvre, et la liste de ce qui vient.

   Le même code sert le Hub du client (#/calendrier) et le planning du
   Cockpit (#/planning) : la grille, la fenêtre d'un jour, le détail d'un
   élément et la légende sont ici.
   ========================================================================== */

import { echapper, lienReunion, enDate, dateCourte, dateLongue, dateISO, dateHeureISO, heure, joursAvant, parDateAsc, FACTURES_DUES, libellePlateforme, pluriel, STATUTS_RELEASE } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur, modale, toast, valider, obligatoire, longueurMax, agir, lireForme } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, reunionAVenir, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { courant } from '../routeur.js';
import { editer } from './editeurs.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* ==========================================================================
   Le fichier d'agenda (ICS). Une réunion, ou toutes celles à venir : le
   même fichier depuis la fiche, le calendrier et l'accueil. Le format
   veut ses virgules, points-virgules et retours à la ligne échappés,
   sinon un lieu « 12, rue X » casse l'événement dans l'agenda du client.
   ========================================================================== */

const echapperICS = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const horodateICS = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Le VEVENT d'une réunion. `nomProjet` sert le titre et la description. */
export const evenementICS = (r, nomProjet = '') => {
  const debut = enDate(r.date);
  if (!debut) return '';
  const fin = new Date(debut.getTime() + (Number(r.duree) || 60) * 60000);
  const participants = (r.participants || []).map((p) => p.nom || p.email).filter(Boolean);
  const description = [
    r.ordreDuJour ? `Ordre du jour :\n${r.ordreDuJour}` : '',
    participants.length ? `Participants : ${participants.join(', ')}` : '',
    r.lien ? `Visioconférence : ${r.lien}` : '',
  ].filter(Boolean).join('\n\n');
  return [
    'BEGIN:VEVENT',
    `UID:${echapperICS(r.id || horodateICS(debut))}@capmedia.app`,
    `DTSTAMP:${horodateICS(new Date())}`,
    `DTSTART:${horodateICS(debut)}`,
    `DTEND:${horodateICS(fin)}`,
    `SUMMARY:${echapperICS(nomProjet ? `${r.titre || 'Réunion'} · ${nomProjet}` : (r.titre || 'Réunion'))}`,
    r.lieu ? `LOCATION:${echapperICS(r.lieu)}` : '',
    lienReunion(r) ? `URL:${echapperICS(lienReunion(r))}` : '',
    description ? `DESCRIPTION:${echapperICS(description)}` : '',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
};

/** Le calendrier complet, prêt à écrire dans un fichier. */
export const icsDe = (reunions, nomProjet = () => '') => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Capmedia//Hub//FR', 'CALSCALE:GREGORIAN',
  ...reunions.map((r) => evenementICS(r, typeof nomProjet === 'function' ? nomProjet(r.projet) : nomProjet)).filter(Boolean),
  'END:VCALENDAR'].join('\r\n');

/** Télécharge un .ics. `reunions` : une ou plusieurs. */
export const telechargerICS = (reunions, { nomProjet = () => '', nomFichier = '' } = {}) => {
  const liste = (Array.isArray(reunions) ? reunions : [reunions]).filter((r) => r && enDate(r.date));
  if (!liste.length) { toast('Aucune réunion à mettre dans votre agenda.', 'erreur'); return false; }
  const ics = icsDe(liste, nomProjet);
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(nomFichier || (liste.length === 1 ? liste[0].titre : 'reunions-capmedia') || 'reunion').replace(/[^\w-]+/g, '-')}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
};


/* ==========================================================================
   Les genres. Chacun a sa couleur et son icône, les mêmes dans la grille,
   les listes, les fenêtres et la légende. La couleur vient d'un jeton
   (--g-…, suite.css), réglé pour le clair et pour le sombre.
   ========================================================================== */

export const NATURES = {
  reunion:    { libelle: 'Réunion',             icone: 'reunions' },
  rdv:        { libelle: 'Rendez-vous demandé', icone: 'horloge' },
  etape:      { libelle: 'Étape',               icone: 'drapeau' },
  tache:      { libelle: 'Tâche',               icone: 'taches' },
  facture:    { libelle: 'Facture',             icone: 'euro' },
  devis:      { libelle: 'Devis',               icone: 'receipt' },
  version:    { libelle: 'Version',             icone: 'releases' },
  validation: { libelle: 'Validation',          icone: 'valider' },
};

/* ==========================================================================
   Les rendez-vous demandés par le client.

   Une demande de rendez-vous est une demande (collection « tickets ») de
   nature « demande », qui porte un champ « rendezVous » : la date
   souhaitée, le créneau, l'heure s'il en a donné une, et le sujet.
   L'équipe la voit dans ses demandes et dans son planning, et la
   programme : la réunion créée garde le lien (« ticket ») et la demande
   passe « planifiée ». Tant qu'elle attend, elle figure dans le calendrier
   du client, en « Rendez-vous demandé ».
   ========================================================================== */

export const RDV_EN_ATTENTE = ['nouveau', 'a-analyser', 'en-attente-client', 'acceptee'];
export const CRENEAUX = { matin: 'Le matin', 'apres-midi': "L'après-midi", heure: 'À une heure précise' };

/** La date d'un rendez-vous souhaité, à l'heure dite ou au milieu du créneau. */
export const dateDuRendezVous = (rv) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((rv || {}).date || ''));
  if (!m) return null;
  const h = /^(\d{2}):(\d{2})$/.exec(String(rv.heure || ''));
  const [hh, mm] = rv.creneau === 'heure' && h ? [Number(h[1]), Number(h[2])] : (rv.creneau === 'apres-midi' ? [14, 0] : [10, 0]);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm);
};
/** « le matin », « l'après-midi », « à 15:30 ». */
export const creneauLisible = (rv) => (rv.creneau === 'heure' && rv.heure ? `à ${rv.heure}` : rv.creneau === 'apres-midi' ? "l'après-midi" : 'le matin');
/** « jeudi 15 octobre 2026, le matin ». */
export const quandRendezVous = (rv) => {
  const d = dateDuRendezVous(rv);
  return d ? `${dateLongue(d)}, ${creneauLisible(rv)}` : '';
};

/* ==========================================================================
   Tous les événements datés, à plat
   ========================================================================== */

/* Ce qu'il y a à faire, dit à celui qui lit : le client ou l'équipe. */
const aFaireDe = (nature, x, { equipe, retard = false, aVenir = true } = {}) => {
  switch (nature) {
    case 'reunion': {
      if (!aVenir) return x.compteRendu ? 'La réunion a eu lieu : son compte rendu est sur sa fiche.' : 'La réunion a eu lieu.';
      const ou = x.lien ? 'la visioconférence' : (x.lieu ? `la réunion (${x.lieu})` : 'la réunion');
      return `Rejoindre ${ou} à ${heure(x.date)}${equipe ? '.' : ', et l\'ajouter à votre agenda pour ne pas l\'oublier.'}`;
    }
    case 'rdv': return equipe
      ? 'Le client propose ce créneau. Programmez la réunion : elle apparaîtra dans son calendrier et la demande passera « planifiée ».'
      : 'Votre demande est chez nous. Dès que le créneau est confirmé, la réunion apparaît ici et vous êtes prévenu par e-mail.';
    case 'etape': return equipe
      ? `Fin prévue de l'étape${Number(x.progression) ? `, avancée à ${Math.round(Number(x.progression))} %` : ''}.`
      : 'Fin prévue de cette étape du projet. Rien à faire de votre côté, sauf si une validation vous est demandée : elle apparaîtrait aussi ici.';
    case 'tache':
      if (x.statut === 'attente-client') return equipe ? 'Elle attend une réponse du client.' : 'Cette tâche attend votre réponse : ouvrez sa fiche pour répondre.';
      if (retard) return equipe ? 'Échéance dépassée : la tâche n\'est pas terminée.' : 'L\'échéance est passée : l\'équipe s\'en occupe.';
      return equipe ? 'À terminer pour ce jour-là.' : 'L\'équipe s\'en occupe, pour ce jour-là.';
    case 'facture': return equipe ? 'Le règlement du client est attendu ce jour-là.' : 'Facture à régler au plus tard ce jour-là.';
    case 'devis': return equipe ? 'Le devis expire ce jour-là, sans réponse du client.' : 'Le devis expire ce jour-là : acceptez-le, ou posez votre question avant.';
    case 'version': {
      const statut = (STATUTS_RELEASE[x.statut] || {}).libelle;
      if (equipe) return `Sortie prévue${statut ? ` (${statut.toLowerCase()})` : ''}.`;
      return x.statut === 'test' ? 'Version à essayer : le lien de test est sur sa fiche.' : 'Sortie prévue de cette version.';
    }
    case 'validation': return equipe ? 'Le client doit valider au plus tard ce jour-là.' : 'Votre validation est attendue au plus tard ce jour-là.';
    default: return '';
  }
};

export const evenementsDe = (session, { projets, reunions, jalons, taches, documents, releases, validations, tickets = [] }) => {
  const equipe = Boolean(session.equipe);
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  const pousser = (nature, x, champs) => {
    const n = NATURES[nature];
    items.push({ nature, genre: n.libelle, icone: n.icone, ton: `g-${nature}`, cle: `${nature}:${x.id || items.length}`, id: x.id, pid: x.projet, projet: nomProjet(x.projet), ...champs });
  };
  /* Une réunion est « à venir » tant que son heure n'est pas passée
     (reunionAVenir) ; c'est la seule à porter une heure précise. */
  reunions.forEach((r) => {
    const aVenir = reunionAVenir(r);
    pousser('reunion', r, { date: r.date, titre: r.titre, chemin: `/projets/${r.projet}/reunions/${r.id}`, heure: heure(r.date), reunion: r, aVenir, aFaire: aFaireDe('reunion', r, { equipe, aVenir }) });
  });
  /* Un rendez-vous demandé s'efface dès qu'une réunion le porte. */
  const programmes = new Set(reunions.map((r) => r.ticket).filter(Boolean));
  tickets.forEach((t) => {
    const rv = t.rendezVous;
    if (!rv || t.archive || !RDV_EN_ATTENTE.includes(t.statut) || programmes.has(t.id)) return;
    const d = dateDuRendezVous(rv);
    if (!d) return;
    pousser('rdv', t, { date: d, titre: rv.sujet || t.titre, chemin: `/projets/${t.projet}/demandes/${t.id}`, heure: rv.creneau === 'heure' && rv.heure ? rv.heure : (rv.creneau === 'apres-midi' ? 'Après-midi' : 'Matin'), ticket: t, aFaire: aFaireDe('rdv', t, { equipe }) });
  });
  jalons.forEach((j) => { if (j.fin && j.statut !== 'termine') pousser('etape', j, { date: j.fin, titre: j.titre, chemin: `/projets/${j.projet}/etapes`, aFaire: aFaireDe('etape', j, { equipe }) }); });
  taches.forEach((t) => {
    if (!t.echeance || t.statut === 'terminee' || t.archive) return;
    const retard = joursAvant(t.echeance) < 0;
    pousser('tache', t, { date: t.echeance, titre: t.titre, chemin: `/projets/${t.projet}/taches/${t.id}`, retard, ton: retard ? 'g-retard' : 'g-tache', aFaire: aFaireDe('tache', t, { equipe, retard }) });
  });
  documents.forEach((d) => {
    if (d.type === 'facture' && d.echeance && FACTURES_DUES.includes(d.statut)) pousser('facture', d, { date: d.echeance, titre: `Échéance ${d.numero || ''}`.trim(), chemin: `/finances/${d.id}`, aFaire: aFaireDe('facture', d, { equipe }) });
    if (d.type === 'devis' && d.expiration && ['envoye', 'consulte'].includes(d.statut)) pousser('devis', d, { date: d.expiration, titre: `Devis ${d.numero || ''} expire`.trim(), chemin: `/finances/${d.id}`, aFaire: aFaireDe('devis', d, { equipe }) });
  });
  releases.forEach((r) => { if (r.date) pousser('version', r, { date: r.date, titre: `${libellePlateforme(r.plateforme)} ${r.version || ''}`.trim(), chemin: `/projets/${r.projet}/releases/${r.id}`, aFaire: aFaireDe('version', r, { equipe }) }); });
  validations.forEach((v) => { if (v.echeance && v.statut === 'en-attente') pousser('validation', v, { date: v.echeance, titre: v.titre, chemin: equipe ? `/validations/${v.id}` : `/valider/${v.id}`, aFaire: aFaireDe('validation', v, { equipe }) }); });
  return items.filter((i) => enDate(i.date)).map((i) => ({ ...i, aVenir: i.aVenir === undefined ? joursAvant(i.date) >= 0 : i.aVenir })).sort(parDateAsc('date'));
};

/* La clé d'un jour : « 2026-10-15 », en heure locale. */
const cleJour = (d) => dateISO(d);
const jourDe = (iso) => { const [a, m, j] = String(iso).split('-').map(Number); return new Date(a, m - 1, j); };
const evenementsDuJour = (evenements, iso) => evenements.filter((x) => cleJour(enDate(x.date)) === iso).sort(parDateAsc('date'));

/* Une pastille de la grille : l'icône du genre, l'heure s'il y en a une,
   le titre. Un lien (le clic du milieu ouvre la fiche dans un onglet), qui
   ouvre d'un clic simple le détail de l'élément. */
const pastilleEvt = (e) => `<a class="evt ${echapper(e.ton)}" href="#${echapper(e.chemin)}" data-evt="${echapper(e.cle)}" title="${echapper(`${e.genre} · ${e.titre}${e.projet ? ` · ${e.projet}` : ''}`)}">${icone(e.icone)}<span>${e.heure ? `<b>${echapper(e.heure)}</b> ` : ''}${echapper(e.titre)}</span></a>`;

export const grilleMois = (annee, mois, evenements) => {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(annee, mois, 1 - decalage);
  const aujourdhui = cleJour(new Date());
  const parJour = {};
  evenements.forEach((e) => { const k = cleJour(enDate(e.date)); (parJour[k] = parJour[k] || []).push(e); });
  let html = JOURS.map((j) => `<div class="jour-nom" aria-hidden="true">${j}</div>`).join('');
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
    const k = cleJour(d);
    const hors = d.getMonth() !== mois;
    const evts = parJour[k] || [];
    /* Toute la case s'ouvre : un bouton couvre le jour, sous les
       pastilles, qui ouvrent chacune leur détail. */
    const libelle = `${dateLongue(d)}, ${evts.length ? pluriel(evts.length, 'élément') : 'rien de prévu'}`;
    html += `<div class="jour${hors ? ' hors' : ''}${k === aujourdhui ? ' aujourdhui' : ''}${evts.length ? '' : ' jour--vide'}" data-jour="${k}">
      <button class="jour-ouvrir" type="button" data-jour-ouvrir="${k}" aria-label="${echapper(libelle)}"${k === aujourdhui ? ' aria-current="date"' : ''}></button>
      <span class="numero" aria-hidden="true">${d.getDate()}</span>${evts.slice(0, 3).map(pastilleEvt).join('')}${evts.length > 3 ? `<button class="evt evt--plus" type="button" data-jour-ouvrir="${k}" aria-label="${echapper(`Voir les ${evts.length} éléments du ${dateLongue(d)}`)}">+${evts.length - 3}</button>` : ''}</div>`;
  }
  return html;
};

/** La légende : chaque genre, sa couleur et son icône. Discrète. */
export const legende = () => `<ul class="cal-legende" aria-label="Légende du calendrier">${Object.entries(NATURES).map(([n, x]) => `<li class="g-${n}">${icone(x.icone)}${echapper(x.libelle)}</li>`).join('')}<li class="g-retard">${icone('taches')}En retard</li></ul>`;

/* La ligne d'un événement dans une liste (« À venir », « En retard ») :
   elle ouvre le détail ; une réunion à venir porte en plus son bouton
   d'agenda. */
export const ligneEvenement = (e, { avecProjet = true } = {}) => {
  const sous = `${echapper(e.genre)} · ${echapper(dateCourte(e.date))}${e.heure ? ` ${echapper(e.heure)}` : ''}${avecProjet && e.projet ? ` · ${echapper(e.projet)}` : ''}`;
  return ligne({
    icone: e.icone, ton: e.ton, titre: echapper(e.titre), sous,
    action: 'detail', attrs: `data-evt="${echapper(e.cle)}" data-chemin="${echapper(e.chemin)}"`,
    fin: e.reunion && e.aVenir ? `<button class="btn btn-doux btn-petit" type="button" data-ics="${echapper(e.id)}" data-astuce="Ajouter à mon agenda">${icone('calendrier')} Agenda</button>` : '',
  });
};

/* ==========================================================================
   Les fenêtres : un jour, un élément, une demande de rendez-vous
   ========================================================================== */

/* « jeudi 15 octobre 2026 à 14:00 », ou le jour seul. */
const quandDe = (e) => {
  if (e.nature === 'rdv') return quandRendezVous(e.ticket.rendezVous);
  return e.nature === 'reunion' ? `${dateLongue(e.date)} à ${heure(e.date)}` : dateLongue(e.date);
};

/* Un élément dans la fenêtre d'un jour : l'heure en chasse fixe à gauche,
   puis le genre, le titre, le projet, ce qu'il y a à faire, et la fiche. */
const elementDuJour = (e, { equipe }) => `
  <li class="cal-item ${echapper(e.ton)}" data-cle="${echapper(e.cle)}">
    <span class="cal-item-heure">${echapper(e.heure || 'Journée')}</span>
    <div class="cal-item-corps">
      <p class="cal-item-genre">${icone(e.icone)}<span>${echapper(e.retard ? `${e.genre} en retard` : e.genre)}</span>${e.projet ? `<span class="cal-item-projet">${echapper(e.projet)}</span>` : ''}</p>
      <p class="cal-item-titre">${echapper(e.titre)}</p>
      ${e.aFaire ? `<p class="cal-item-faire">${echapper(e.aFaire)}</p>` : ''}
      <p class="cal-item-actions">
        <a class="btn btn-secondaire btn-petit" href="#${echapper(e.chemin)}" data-fiche>${e.nature === 'rdv' ? 'Voir la demande' : 'Ouvrir la fiche'}</a>
        ${e.reunion && e.aVenir && lienReunion(e.reunion) ? `<a class="btn btn-doux btn-petit" href="${echapper(lienReunion(e.reunion))}" target="_blank" rel="noopener">${icone('video')} Rejoindre</a>` : ''}
        ${e.reunion && e.aVenir ? `<button class="btn btn-doux btn-petit" type="button" data-ics="${echapper(e.id)}">${icone('calendrier')} Ajouter à mon agenda</button>` : ''}
        ${equipe && e.nature === 'rdv' ? `<button class="btn btn-principal btn-petit" type="button" data-programmer="${echapper(e.id)}">Programmer ce rendez-vous</button>` : ''}
      </p>
    </div>
  </li>`;

const corpsDuJour = (iso, evts, { equipe }) => {
  if (evts.length) return `<ol class="cal-jour-liste">${evts.map((e) => elementDuJour(e, { equipe })).join('')}</ol>`;
  const passe = joursAvant(jourDe(iso)) < 0;
  const texte = passe
    ? 'Aucune réunion, échéance ni étape ce jour-là.'
    : (equipe
      ? 'Aucune réunion, échéance ni étape ce jour-là. Vous pouvez y programmer une réunion.'
      : 'Aucune réunion, échéance ni étape ce jour-là. Un point à faire avec l\'équipe ? Demandez un rendez-vous : nous vous confirmons le créneau, et la réunion apparaît ici.');
  return `<div class="cal-jour-vide"><p class="cal-jour-vide-titre">${passe ? 'Rien n\'était prévu.' : 'Rien de prévu pour l\'instant.'}</p><p class="fs-note">${echapper(texte)}</p></div>`;
};

const piedDuJour = (iso, { equipe }) => {
  if (joursAvant(jourDe(iso)) < 0) return '';
  return equipe
    ? `<button class="btn btn-principal" type="button" data-programmer-jour="${iso}">${icone('plus')} Programmer une réunion ce jour-là</button>`
    : `<button class="btn btn-principal" type="button" data-demander-rdv="${iso}">Demander un rendez-vous ce jour-là</button>`;
};

/* Le détail d'un élément : la même fenêtre que les fiches des tests. */
const ouvrirElement = (e, { equipe }) => {
  const r = e.reunion;
  const blocs = [
    `<section class="fs-bloc"><p class="fs-bloc-sur">Quand</p><p>${echapper(quandDe(e))}</p></section>`,
    e.aFaire ? `<section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qu'il y a à faire</p><p>${echapper(e.aFaire)}</p></section>` : '',
    r && r.lieu ? `<section class="fs-bloc"><p class="fs-bloc-sur">Lieu</p><p>${echapper(r.lieu)}</p></section>` : '',
    r && r.ordreDuJour ? `<section class="fs-bloc"><p class="fs-bloc-sur">Ordre du jour</p><p>${echapper(r.ordreDuJour).replace(/\n/g, '<br>')}</p></section>` : '',
    e.ticket && e.ticket.description ? `<section class="fs-bloc"><p class="fs-bloc-sur">La demande</p><p>${echapper(e.ticket.description).replace(/\n/g, '<br>')}</p></section>` : '',
  ].join('');
  const m = modale({
    titre: e.titre, sousTitre: [e.retard ? `${e.genre} en retard` : e.genre, e.projet].filter(Boolean).join(' · '), scenario: true,
    corps: `<p class="fs-etat"><span class="cal-genre ${echapper(e.ton)}">${icone(e.icone)}${echapper(e.genre)}</span></p>${blocs}`,
    pied: `${r && e.aVenir && lienReunion(r) ? `<a class="btn btn-secondaire" href="${echapper(lienReunion(r))}" target="_blank" rel="noopener">${icone('video')} Rejoindre</a>` : ''}
      ${r && e.aVenir ? `<button class="btn btn-secondaire" type="button" data-ics="${echapper(e.id)}">${icone('calendrier')} Ajouter à mon agenda</button>` : ''}
      ${equipe && e.nature === 'rdv' ? `<button class="btn btn-secondaire" type="button" data-programmer="${echapper(e.id)}">Programmer ce rendez-vous</button>` : ''}
      <a class="btn btn-principal" href="#${echapper(e.chemin)}" data-fiche>${e.nature === 'rdv' ? 'Voir la demande' : 'Ouvrir la fiche'}</a>`,
  });
  m.el.querySelector('.modale').classList.add('modale--cal');
  return m;
};

/* « Pour quel projet ? » quand il y en a plusieurs. */
const choisirProjet = async (projets) => {
  if (projets.length <= 1) return (projets[0] || {}).id || '';
  const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="cal-choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
  m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#cal-choix-p').value));
  return (await m.fin) || '';
};

/** L'équipe programme la réunion qu'un client a demandée. */
export const programmerRendezVous = (env, t) => {
  const rv = t.rendezVous || {};
  const d = dateDuRendezVous(rv);
  const auteur = (t.auteur || {}).nom || '';
  return editer('reunion', env, {
    pid: t.projet, ticket: t.id,
    defaut: { titre: rv.sujet || t.titre, date: d ? dateHeureISO(d) : '', ordreDuJour: t.description || '', participants: auteur },
  });
};

/** Le client demande un rendez-vous. `date` : « 2026-10-15 », facultative. */
export const demanderRendezVous = (env, { date = '', pid = '' } = {}) => {
  const projets = (magasin.lire(K.projets) || env.session.projets || []).filter((p) => p && p.id);
  if (!projets.length) { toast('Aucun projet ouvert : rien à rattacher à ce rendez-vous.', 'erreur'); return null; }
  const aujourdhui = dateISO(new Date());
  const choisie = date && date >= aujourdhui ? date : '';
  const projetPris = pid && projets.some((p) => p.id === pid) ? pid : projets[0].id;
  const m = modale({
    titre: 'Demander un rendez-vous', sousTitre: 'L\'équipe vous confirme le créneau', scenario: true,
    corps: `<form class="forme cal-forme" id="cal-forme-rdv" novalidate>
      ${projets.length > 1 ? `<div class="groupe"><label class="etiquette-champ" for="rdv-projet">Projet</label><select class="select" id="rdv-projet" name="projet">${projets.map((p) => `<option value="${echapper(p.id)}"${p.id === projetPris ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="projet" value="${echapper(projetPris)}"><p class="fs-note cal-forme-projet">Pour le projet <strong>${echapper(projets[0].nom)}</strong></p>`}
      <div class="groupe"><label class="etiquette-champ" for="rdv-date">Date souhaitée</label>
        <input class="champ" id="rdv-date" name="date" type="date" min="${aujourdhui}" value="${echapper(choisie)}" lang="fr-FR">
        <p class="aide" id="rdv-date-lue">${echapper(choisie ? dateLongue(jourDe(choisie)) : 'Choisissez un jour.')}</p></div>
      <div class="groupe"><span class="etiquette-champ" id="rdv-creneau-titre">Créneau</span>
        <div class="cal-creneaux" role="radiogroup" aria-labelledby="rdv-creneau-titre">${Object.entries(CRENEAUX).map(([c, l], i) => `<label><input type="radio" name="creneau" value="${c}"${i === 0 ? ' checked' : ''}><span>${echapper(l)}</span></label>`).join('')}</div>
        <div class="cal-heure" hidden><label class="etiquette-champ" for="rdv-heure">Heure</label><input class="champ" id="rdv-heure" name="heure" type="time" min="07:00" max="21:00" step="900"></div></div>
      <div class="groupe"><label class="etiquette-champ" for="rdv-sujet">Sujet</label><input class="champ" id="rdv-sujet" name="sujet" maxlength="100" placeholder="Faire le point sur la version 1.2"></div>
      <div class="groupe"><label class="etiquette-champ" for="rdv-precisions">Précisions <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="rdv-precisions" name="precisions" rows="3" maxlength="2000" placeholder="Ce que vous voulez aborder, qui sera là, vos disponibilités."></textarea></div>
    </form>`,
    pied: `<button class="btn btn-principal" type="submit" form="cal-forme-rdv">Envoyer la demande</button>`,
  });
  m.el.querySelector('.modale').classList.add('modale--cal');
  const forme = m.el.querySelector('#cal-forme-rdv');
  const heureBloc = forme.querySelector('.cal-heure');
  forme.addEventListener('change', (ev) => {
    if (ev.target.name === 'creneau') { heureBloc.hidden = ev.target.value !== 'heure'; if (!heureBloc.hidden) forme.elements.heure.focus(); }
  });
  forme.addEventListener('input', (ev) => {
    if (ev.target.name === 'date') forme.querySelector('#rdv-date-lue').textContent = ev.target.value ? dateLongue(jourDe(ev.target.value)) : 'Choisissez un jour.';
  });
  let enCours = false;
  forme.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (enCours) return;
    const ok = valider(forme, {
      date: (v) => (!v ? 'Choisissez un jour.' : (v < dateISO(new Date()) ? 'Ce jour est passé : choisissez aujourd\'hui ou plus tard.' : '')),
      heure: (v, d) => (d.creneau === 'heure' && !/^\d{2}:\d{2}$/.test(v || '') ? 'Donnez une heure, ou choisissez le matin ou l\'après-midi.' : ''),
      sujet: (v) => obligatoire('Dites-nous en quelques mots de quoi parler.')(v) || longueurMax(100)(v),
      precisions: longueurMax(2000),
    });
    if (!ok) return;
    const d = lireForme(forme);
    const rendezVous = { date: d.date, creneau: d.creneau, heure: d.creneau === 'heure' ? d.heure : '', sujet: d.sujet };
    const description = [`Rendez-vous souhaité ${quandRendezVous(rendezVous)}.`, d.precisions].filter(Boolean).join('\n\n');
    enCours = true;
    await agir(forme.closest('.modale').querySelector('[type="submit"]'), async () => {
      await ecrire.creerDemande(env.session, d.projet, {
        type: 'demande', titre: `Rendez-vous : ${d.sujet}`.slice(0, 120), description, urgence: 'important', plateforme: '', liens: [], rendezVous,
      });
      m.fermer(true);
    }, 'Demande envoyée. L\'équipe vous confirme le créneau.');
    enCours = false;
  });
  return m;
};

/**
 * Les gestes du calendrier, communs au Hub et au planning du Cockpit :
 * la case d'un jour, une pastille, une ligne de liste, l'agenda, la
 * demande de rendez-vous. `lire()` rend { evenements, nomProjet, projets }
 * à jour. La fenêtre d'un jour ouverte suit les données en direct.
 */
export const brancherCalendrier = (sortie, env, lire) => {
  const equipe = env.role === 'equipe' || Boolean(env.session.equipe);
  let jour = null;

  const agenda = (id) => {
    const { evenements, nomProjet } = lire();
    const e = evenements.find((x) => x.reunion && x.id === id);
    if (e) telechargerICS(e.reunion, { nomProjet });
  };
  const programmer = (id) => {
    const e = lire().evenements.find((x) => x.nature === 'rdv' && x.id === id);
    if (e) programmerRendezVous(env, e.ticket);
  };
  const programmerJour = async (iso) => {
    const pid = await choisirProjet(lire().projets || []);
    if (pid) editer('reunion', env, { pid, defaut: { date: `${iso}T10:00` } });
  };
  /* Les gestes communs aux fenêtres : agenda, programmer, demander. */
  const brancherFenetre = (m) => sur(m.el, 'click', '[data-ics], [data-programmer], [data-programmer-jour], [data-demander-rdv]', (el) => {
    if (el.dataset.ics) return agenda(el.dataset.ics);
    if (el.dataset.programmer) { m.fermer(); return programmer(el.dataset.programmer); }
    if (el.dataset.programmerJour) { m.fermer(); return programmerJour(el.dataset.programmerJour); }
    if (el.dataset.demanderRdv) return demanderRendezVous(env, { date: el.dataset.demanderRdv });
    return null;
  });

  const ouvrirJour = (iso) => {
    const evts = evenementsDuJour(lire().evenements, iso);
    const m = modale({
      titre: dateLongue(jourDe(iso)), sousTitre: evts.length ? pluriel(evts.length, 'élément') : 'Aucun élément',
      scenario: true, corps: corpsDuJour(iso, evts, { equipe }), pied: piedDuJour(iso, { equipe }),
    });
    m.el.querySelector('.modale').classList.add('modale--cal', 'modale--jour');
    m.el.dataset.jour = iso;
    jour = { iso, m, empreinte: evts.map((e) => `${e.cle}|${e.titre}|${e.heure}|${e.aFaire}`).join('#') };
    brancherFenetre(m);
    m.fin.then(() => { if (jour && jour.m === m) jour = null; });
    return m;
  };
  const ouvrirDetail = (cle) => {
    const e = lire().evenements.find((x) => x.cle === cle);
    if (!e) return null;
    const m = ouvrirElement(e, { equipe });
    brancherFenetre(m);
    return m;
  };

  const gestes = sur(sortie, 'click', '[data-jour-ouvrir], a.evt[data-evt], [data-action="detail"], [data-ics], [data-demander-rdv]', (el, ev) => {
    if (el.dataset.jourOuvrir) return ouvrirJour(el.dataset.jourOuvrir);
    if (el.matches('a.evt')) {
      /* Le clic du milieu, ou avec une touche, garde son sens de lien. */
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return null;
      ev.preventDefault();
      return ouvrirDetail(el.dataset.evt);
    }
    if (el.dataset.ics) return agenda(el.dataset.ics);
    if (el.dataset.demanderRdv !== undefined) return demanderRendezVous(env, { date: el.dataset.demanderRdv, pid: String((courant().requete || {}).projet || '') });
    if (el.dataset.action === 'detail') return ouvrirDetail(el.dataset.evt);
    return null;
  });

  /* Après chaque dessin : la fenêtre d'un jour ouverte se remet à jour,
     sans se rouvrir, seulement si son contenu a changé. */
  const rafraichir = () => {
    if (!jour || !jour.m.el.isConnected) return;
    const evts = evenementsDuJour(lire().evenements, jour.iso);
    const empreinte = evts.map((e) => `${e.cle}|${e.titre}|${e.heure}|${e.aFaire}`).join('#');
    if (empreinte === jour.empreinte) return;
    jour.empreinte = empreinte;
    jour.m.corps.innerHTML = corpsDuJour(jour.iso, evts, { equipe });
    const sous = jour.m.el.querySelector('.modale-tete p');
    if (sous) sous.textContent = evts.length ? pluriel(evts.length, 'élément') : 'Aucun élément';
  };

  return { arreter: gestes, rafraichir, ouvrirJour, ouvrirDetail };
};

/* ==========================================================================
   La page du Hub
   ========================================================================== */

export const vue = async (ctx, env) => {
  const { session } = env;
  const equipe = Boolean(session.equipe);
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Calendrier');
  filAriane([{ libelle: 'Calendrier' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const maintenant = new Date();
  let annee = maintenant.getFullYear();
  let mois = maintenant.getMonth();

  const etat = { evenements: [], nomProjet: () => '', projets: [] };
  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    etat.projets = projets;
    etat.nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const jalons = equipe ? (magasin.lire(K.jalonsTous) || []) : session.projets.flatMap((p) => (magasin.lire(K.jalons(p.id)) || []).map((j) => ({ ...j, projet: p.id })));
    etat.evenements = evenementsDe(session, {
      projets, reunions: agreger(session, G.reunions), jalons, taches: agreger(session, G.taches), documents: agreger(session, G.documents), releases: agreger(session, G.releases), validations: agreger(session, G.validations), tickets: agreger(session, G.tickets),
    });
    /* Arrivé par l'arbre d'un projet (?projet=<p>) : le calendrier de ce
       projet seulement. */
    const filtre = !equipe && ctx.requete && ctx.requete.projet ? ctx.requete.projet : '';
    if (filtre) etat.evenements = etat.evenements.filter((e) => !e.pid || e.pid === filtre);
    const evenements = etat.evenements;
    const aVenir = evenements.filter((e) => e.aVenir).slice(0, 12);
    const reunionsAVenir = evenements.filter((e) => e.reunion && e.aVenir);
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Calendrier</h1><p class="chapo">Réunions, étapes, échéances, versions et validations attendues, au même endroit. Touchez un jour pour le détail.</p></div>
        <div class="actions">
          ${!equipe ? `<button class="btn btn-principal" type="button" data-demander-rdv="">Demander un rendez-vous</button>` : ''}
          ${reunionsAVenir.length ? `<button class="btn btn-secondaire" type="button" data-ics-tout data-astuce="${echapper(`${pluriel(reunionsAVenir.length, 'réunion à venir', 'réunions à venir')}, en un seul fichier`)}">${icone('calendrier')} Tout mettre dans mon agenda</button>` : ''}
          <div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div>
        </div></div>
      <div class="grille grille-tiers">
        <section>
          <p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p>
          <div class="calendrier">${grilleMois(annee, mois, evenements)}</div>
          ${legende()}
        </section>
        <aside>
          <p class="surtitre" style="margin-bottom:8px">À venir</p>
          ${aVenir.length ? `<div class="liste">${aVenir.map((e) => ligneEvenement(e)).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', texte: 'Le calendrier se remplira au fil du projet. Besoin d\'un point avec l\'équipe ? Demandez un rendez-vous.', compact: true })}
        </aside>
      </div>
    </div>`;
    calendrier.rafraichir();
  };

  const calendrier = brancherCalendrier(sortie, env, () => etat);
  const gestes = sur(sortie, 'click', '[data-mois], [data-ics-tout]', (el) => {
    if (el.dataset.mois !== undefined) {
      const n = Number(el.dataset.mois);
      if (n === 0) { annee = maintenant.getFullYear(); mois = maintenant.getMonth(); }
      else { mois += n; if (mois < 0) { mois = 11; annee -= 1; } if (mois > 11) { mois = 0; annee += 1; } }
      rendre();
      return;
    }
    if (el.dataset.icsTout !== undefined) {
      telechargerICS(etat.evenements.filter((e) => e.reunion && e.aVenir).map((e) => e.reunion), { nomProjet: etat.nomProjet, nomFichier: 'reunions-capmedia' });
    }
  });
  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const cles = equipe ? [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, K.documentsTous, K.releasesToutes, K.validationsToutes, K.ticketsTous] : [K.projets, ...session.projets.flatMap((p) => [K.reunions(p.id), K.jalons(p.id), K.taches(p.id), K.documents(p.id), K.releases(p.id), K.validations(p.id), K.tickets(p.id)])];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { planifier.arreter(); gestes(); calendrier.arreter(); lot.fin(); };
};
