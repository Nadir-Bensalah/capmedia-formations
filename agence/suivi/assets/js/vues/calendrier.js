/* ==========================================================================
   Le calendrier : réunions, étapes, échéances de tâches, factures,
   versions, validations attendues. Une grille mensuelle, et la liste de
   ce qui vient.
   ========================================================================== */

import { echapper, enDate, dateCourte, heure, joursAvant, parDateAsc, FACTURES_DUES } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger } from '../donnees.js';
import { filAriane } from '../coquille.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Tous les événements datés, à plat. */
export const evenementsDe = (session, { projets, reunions, jalons, taches, documents, releases, validations }) => {
  const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
  const items = [];
  reunions.forEach((r) => items.push({ date: r.date, titre: r.titre, genre: 'Réunion', ton: 'bleu', icone: 'reunions', chemin: `/projets/${r.projet}/reunions`, projet: nomProjet(r.projet), heure: heure(r.date) }));
  jalons.forEach((j) => { if (j.fin && j.statut !== 'termine') items.push({ date: j.fin, titre: j.titre, genre: 'Étape', ton: 'violet', icone: 'drapeau', chemin: `/projets/${j.projet}/etapes`, projet: nomProjet(j.projet) }); });
  taches.forEach((t) => { if (t.echeance && t.statut !== 'terminee' && !t.archive) items.push({ date: t.echeance, titre: t.titre, genre: 'Tâche', ton: joursAvant(t.echeance) < 0 ? 'rouge' : 'gris', icone: 'taches', chemin: `/projets/${t.projet}/taches/${t.id}`, projet: nomProjet(t.projet) }); });
  documents.forEach((d) => { if (d.type === 'facture' && d.echeance && FACTURES_DUES.includes(d.statut)) items.push({ date: d.echeance, titre: `Échéance ${d.numero || ''}`.trim(), genre: 'Facture', ton: 'ambre', icone: 'euro', chemin: `/finances/${d.id}`, projet: nomProjet(d.projet) }); if (d.type === 'devis' && d.expiration && ['envoye', 'consulte'].includes(d.statut)) items.push({ date: d.expiration, titre: `Devis ${d.numero || ''} expire`.trim(), genre: 'Devis', ton: 'ambre', icone: 'receipt', chemin: `/finances/${d.id}`, projet: nomProjet(d.projet) }); });
  releases.forEach((r) => { if (r.date) items.push({ date: r.date, titre: `${r.plateforme || ''} ${r.version || ''}`.trim(), genre: 'Version', ton: 'vert', icone: 'releases', chemin: `/projets/${r.projet}/releases`, projet: nomProjet(r.projet) }); });
  validations.forEach((v) => { if (v.echeance && v.statut === 'en-attente') items.push({ date: v.echeance, titre: v.titre, genre: 'Validation', ton: 'violet', icone: 'valider', chemin: session.equipe ? `/validations/${v.id}` : `/valider/${v.id}`, projet: nomProjet(v.projet) }); });
  return items.filter((i) => enDate(i.date)).sort(parDateAsc('date'));
};

export const grilleMois = (annee, mois, evenements) => {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(annee, mois, 1 - decalage);
  const aujourdhui = new Date();
  const cles = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const parJour = {};
  evenements.forEach((e) => { const d = enDate(e.date); const k = cles(d); (parJour[k] = parJour[k] || []).push(e); });
  let html = JOURS.map((j) => `<div class="jour-nom">${j}</div>`).join('');
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
    const hors = d.getMonth() !== mois;
    const evts = parJour[cles(d)] || [];
    html += `<div class="jour${hors ? ' hors' : ''}${cles(d) === cles(aujourdhui) ? ' aujourdhui' : ''}"><span class="numero">${d.getDate()}</span>${evts.slice(0, 3).map((e) => `<a class="evt evt--${e.ton}" href="#${echapper(e.chemin)}" title="${echapper(`${e.genre} · ${e.titre}`)}">${echapper(e.heure ? `${e.heure} ${e.titre}` : e.titre)}</a>`).join('')}${evts.length > 3 ? `<span class="t-micro t-3">+${evts.length - 3}</span>` : ''}</div>`;
  }
  return html;
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

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    const jalons = session.equipe ? (magasin.lire(K.jalonsTous) || []) : session.projets.flatMap((p) => (magasin.lire(K.jalons(p.id)) || []).map((j) => ({ ...j, projet: p.id })));
    const evenements = evenementsDe(session, {
      projets, reunions: agreger(session, G.reunions), jalons, taches: agreger(session, G.taches), documents: agreger(session, G.documents), releases: agreger(session, G.releases), validations: agreger(session, G.validations),
    });
    const aVenir = evenements.filter((e) => joursAvant(e.date) >= 0).slice(0, 12);
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Calendrier</h1><p class="chapo">Réunions, étapes, échéances, versions et validations attendues, au même endroit.</p></div>
        <div class="actions"><div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div></div></div>
      <div class="grille grille-tiers">
        <section>
          <p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p>
          <div class="calendrier">${grilleMois(annee, mois, evenements)}</div>
        </section>
        <aside>
          <p class="surtitre" style="margin-bottom:8px">À venir</p>
          ${aVenir.length ? `<div class="liste">${aVenir.map((e) => ligne({ href: `#${e.chemin}`, icone: e.icone, ton: e.ton === 'gris' ? '' : e.ton, titre: echapper(e.titre), sous: `${echapper(e.genre)} · ${echapper(dateCourte(e.date))}${e.heure ? ` ${echapper(e.heure)}` : ''}${e.projet ? ` · ${echapper(e.projet)}` : ''}` })).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', texte: 'Le calendrier se remplira au fil du projet.', compact: true })}
        </aside>
      </div>
    </div>`;
  };

  const gestes = sur(sortie, 'click', '[data-mois]', (el) => {
    const n = Number(el.dataset.mois);
    if (n === 0) { annee = maintenant.getFullYear(); mois = maintenant.getMonth(); }
    else { mois += n; if (mois < 0) { mois = 11; annee -= 1; } if (mois > 11) { mois = 0; annee += 1; } }
    rendre();
  });
  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  const cles = session.equipe ? [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, K.documentsTous, K.releasesToutes, K.validationsToutes] : [K.projets, ...session.projets.flatMap((p) => [K.reunions(p.id), K.jalons(p.id), K.taches(p.id), K.documents(p.id), K.releases(p.id), K.validations(p.id)])];
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};
