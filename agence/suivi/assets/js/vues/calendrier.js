/* ==========================================================================
   Le calendrier : réunions, étapes, échéances de tâches, factures,
   versions, validations attendues. Une grille mensuelle, et la liste de
   ce qui vient.
   ========================================================================== */

import { echapper, enDate, dateCourte, heure, joursAvant, parDateAsc, FACTURES_DUES, libellePlateforme, pluriel } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur, modale, toast } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, reunionAVenir } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';

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
    r.lien ? `URL:${echapperICS(r.lien)}` : '',
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

/** Tous les événements datés, à plat. */
export const evenementsDe = (session, { projets, reunions, jalons, taches, documents, releases, validations }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  /* Une réunion mène à sa fiche, pas à la liste : un clic, pas deux. Elle
     est « à venir » tant que son heure n'est pas passée (reunionAVenir). */
  reunions.forEach((r) => items.push({ id: r.id, date: r.date, titre: r.titre, genre: 'Réunion', ton: 'bleu', icone: 'reunions', chemin: `/projets/${r.projet}/reunions/${r.id}`, projet: nomProjet(r.projet), heure: heure(r.date), reunion: r, aVenir: reunionAVenir(r) }));
  jalons.forEach((j) => { if (j.fin && j.statut !== 'termine') items.push({ date: j.fin, titre: j.titre, genre: 'Étape', ton: 'violet', icone: 'drapeau', chemin: `/projets/${j.projet}/etapes`, projet: nomProjet(j.projet) }); });
  taches.forEach((t) => { if (t.echeance && t.statut !== 'terminee' && !t.archive) items.push({ date: t.echeance, titre: t.titre, genre: 'Tâche', ton: joursAvant(t.echeance) < 0 ? 'rouge' : 'gris', icone: 'taches', chemin: `/projets/${t.projet}/taches/${t.id}`, projet: nomProjet(t.projet) }); });
  documents.forEach((d) => { if (d.type === 'facture' && d.echeance && FACTURES_DUES.includes(d.statut)) items.push({ date: d.echeance, titre: `Échéance ${d.numero || ''}`.trim(), genre: 'Facture', ton: 'ambre', icone: 'euro', chemin: `/finances/${d.id}`, projet: nomProjet(d.projet) }); if (d.type === 'devis' && d.expiration && ['envoye', 'consulte'].includes(d.statut)) items.push({ date: d.expiration, titre: `Devis ${d.numero || ''} expire`.trim(), genre: 'Devis', ton: 'ambre', icone: 'receipt', chemin: `/finances/${d.id}`, projet: nomProjet(d.projet) }); });
  releases.forEach((r) => { if (r.date) items.push({ date: r.date, titre: `${libellePlateforme(r.plateforme)} ${r.version || ''}`.trim(), genre: 'Version', ton: 'vert', icone: 'releases', chemin: `/projets/${r.projet}/releases/${r.id}`, projet: nomProjet(r.projet) }); });
  validations.forEach((v) => { if (v.echeance && v.statut === 'en-attente') items.push({ date: v.echeance, titre: v.titre, genre: 'Validation', ton: 'violet', icone: 'valider', chemin: session.equipe ? `/validations/${v.id}` : `/valider/${v.id}`, projet: nomProjet(v.projet) }); });
  return items.filter((i) => enDate(i.date)).map((i) => ({ ...i, aVenir: i.aVenir === undefined ? joursAvant(i.date) >= 0 : i.aVenir })).sort(parDateAsc('date'));
};

const cleJour = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const grilleMois = (annee, mois, evenements) => {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(annee, mois, 1 - decalage);
  const aujourdhui = new Date();
  const cles = cleJour;
  const parJour = {};
  evenements.forEach((e) => { const d = enDate(e.date); const k = cles(d); (parJour[k] = parJour[k] || []).push(e); });
  let html = JOURS.map((j) => `<div class="jour-nom">${j}</div>`).join('');
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
    const hors = d.getMonth() !== mois;
    const evts = parJour[cles(d)] || [];
    /* « +N » s'ouvre : il liste tout le jour dans une petite fenêtre. */
    html += `<div class="jour${hors ? ' hors' : ''}${cles(d) === cles(aujourdhui) ? ' aujourdhui' : ''}"><span class="numero">${d.getDate()}</span>${evts.slice(0, 3).map((e) => `<a class="evt evt--${e.ton}" href="#${echapper(e.chemin)}" title="${echapper(`${e.genre} · ${e.titre}`)}">${echapper(e.heure ? `${e.heure} ${e.titre}` : e.titre)}</a>`).join('')}${evts.length > 3 ? `<button class="evt t-micro" type="button" data-jour="${echapper(cles(d))}" aria-label="${echapper(`Voir les ${evts.length} événements du ${dateCourte(d)}`)}">+${evts.length - 3}</button>` : ''}</div>`;
  }
  return html;
};

/* La ligne d'un événement dans une liste : une réunion se rejoint d'un
   clic sur son titre et porte son bouton d'agenda ; le reste mène droit à
   sa page. */
const ligneEvenement = (e) => {
  const sous = `${echapper(e.genre)} · ${echapper(dateCourte(e.date))}${e.heure ? ` ${echapper(e.heure)}` : ''}${e.projet ? ` · ${echapper(e.projet)}` : ''}`;
  if (e.reunion) {
    return ligne({
      icone: e.icone, ton: e.ton, titre: echapper(e.titre), sous,
      action: 'aller', attrs: `data-chemin="${echapper(e.chemin)}"`,
      fin: e.aVenir ? `<button class="btn btn-doux btn-petit" type="button" data-ics="${echapper(e.id)}" data-astuce="Ajouter à mon agenda">${icone('calendrier')} Agenda</button>` : '',
    });
  }
  return ligne({ href: `#${e.chemin}`, icone: e.icone, ton: e.ton === 'gris' ? '' : e.ton, titre: echapper(e.titre), sous });
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Calendrier');
  filAriane([{ libelle: 'Calendrier' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const maintenant = new Date();
  let annee = maintenant.getFullYear();
  let mois = maintenant.getMonth();

  let evenements = [];
  let nomProjet = () => '';
  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const jalons = session.equipe ? (magasin.lire(K.jalonsTous) || []) : session.projets.flatMap((p) => (magasin.lire(K.jalons(p.id)) || []).map((j) => ({ ...j, projet: p.id })));
    evenements = evenementsDe(session, {
      projets, reunions: agreger(session, G.reunions), jalons, taches: agreger(session, G.taches), documents: agreger(session, G.documents), releases: agreger(session, G.releases), validations: agreger(session, G.validations),
    });
    const aVenir = evenements.filter((e) => e.aVenir).slice(0, 12);
    const reunionsAVenir = evenements.filter((e) => e.reunion && e.aVenir);
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Calendrier</h1><p class="chapo">Réunions, étapes, échéances, versions et validations attendues, au même endroit.</p></div>
        <div class="actions">
          ${reunionsAVenir.length ? `<button class="btn btn-secondaire" type="button" data-ics-tout data-astuce="${echapper(`${pluriel(reunionsAVenir.length, 'réunion à venir', 'réunions à venir')}, en un seul fichier`)}">${icone('calendrier')} Tout mettre dans mon agenda</button>` : ''}
          <div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div>
        </div></div>
      <div class="grille grille-tiers">
        <section>
          <p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p>
          <div class="calendrier">${grilleMois(annee, mois, evenements)}</div>
        </section>
        <aside>
          <p class="surtitre" style="margin-bottom:8px">À venir</p>
          ${aVenir.length ? `<div class="liste">${aVenir.map(ligneEvenement).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', texte: 'Le calendrier se remplira au fil du projet.', compact: true })}
        </aside>
      </div>
    </div>`;
  };

  const gestes = sur(sortie, 'click', '[data-mois], [data-jour], [data-ics], [data-ics-tout], [data-action="aller"]', (el) => {
    if (el.dataset.mois !== undefined) {
      const n = Number(el.dataset.mois);
      if (n === 0) { annee = maintenant.getFullYear(); mois = maintenant.getMonth(); }
      else { mois += n; if (mois < 0) { mois = 11; annee -= 1; } if (mois > 11) { mois = 0; annee += 1; } }
      rendre();
      return;
    }
    if (el.dataset.action === 'aller') { naviguer(el.dataset.chemin); return; }
    if (el.dataset.icsTout !== undefined) {
      telechargerICS(evenements.filter((e) => e.reunion && e.aVenir).map((e) => e.reunion), { nomProjet, nomFichier: 'reunions-capmedia' });
      return;
    }
    if (el.dataset.ics) {
      const e = evenements.find((x) => x.reunion && x.id === el.dataset.ics);
      if (e) telechargerICS(e.reunion, { nomProjet });
      return;
    }
    if (el.dataset.jour) {
      const evts = evenements.filter((x) => { const d = enDate(x.date); return d && cleJour(d) === el.dataset.jour; }).sort(parDateAsc('date'));
      if (!evts.length) return;
      const d = enDate(evts[0].date);
      const m = modale({ titre: dateCourte(d), sousTitre: pluriel(evts.length, 'événement'), corps: `<div class="liste">${evts.map(ligneEvenement).join('')}</div>` });
      /* Un clic dans la fenêtre navigue puis la referme ; l'agenda reste
         possible depuis elle aussi. */
      sur(m.el, 'click', '[data-action="aller"], [data-ics], a.ligne', (x) => {
        if (x.dataset.ics) { const e = evts.find((y) => y.reunion && y.id === x.dataset.ics); if (e) telechargerICS(e.reunion, { nomProjet }); return; }
        if (x.dataset.chemin) naviguer(x.dataset.chemin);
        m.fermer();
      });
    }
  });
  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const planifier = magasin.dessinateur(rendre, 40);
  const cles = session.equipe ? [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, K.documentsTous, K.releasesToutes, K.validationsToutes] : [K.projets, ...session.projets.flatMap((p) => [K.reunions(p.id), K.jalons(p.id), K.taches(p.id), K.documents(p.id), K.releases(p.id), K.validations(p.id)])];
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { planifier.arreter(); gestes(); lot.fin(); };
};
