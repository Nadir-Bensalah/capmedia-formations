/* ==========================================================================
   Le planning de l'équipe : le calendrier de tous les projets, et la liste
   de ce qui vient. On programme une réunion depuis ici, et on y voit les
   rendez-vous que les clients demandent. La grille, la fenêtre d'un jour
   et le détail d'un élément sont ceux du calendrier du Hub.
   ========================================================================== */

import { echapper, joursAvant } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, modale, toast } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { evenementsDe, grilleMois, legende, ligneEvenement, brancherCalendrier } from './calendrier.js';
import { editer } from './editeurs.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Planning');
  filAriane([{ libelle: 'Planning' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const maintenant = new Date();
  let annee = maintenant.getFullYear();
  let mois = maintenant.getMonth();
  const etat = { projet: '', evenements: [], projets: [], nomProjet: () => '' };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const filtre = (x) => !etat.projet || x.projet === etat.projet;
    etat.projets = etat.projet ? projets.filter((p) => p.id === etat.projet) : projets;
    etat.nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    etat.evenements = evenementsDe(env.session, {
      projets, reunions: (magasin.lire(K.reunionsToutes) || []).filter(filtre), jalons: (magasin.lire(K.jalonsTous) || []).filter(filtre),
      taches: (magasin.lire(K.tachesToutes) || []).filter(filtre), documents: (magasin.lire(K.documentsTous) || []).filter(filtre),
      releases: (magasin.lire(K.releasesToutes) || []).filter(filtre), validations: (magasin.lire(K.validationsToutes) || []).filter(filtre),
      tickets: (magasin.lire(K.ticketsTous) || []).filter(filtre),
    });
    const evenements = etat.evenements;
    const aVenir = evenements.filter((e) => joursAvant(e.date) >= 0 && e.nature !== 'rdv').slice(0, 15);
    const enRetard = evenements.filter((e) => joursAvant(e.date) < 0 && ['tache', 'etape', 'facture'].includes(e.nature)).slice(-8).reverse();
    const demandes = evenements.filter((e) => e.nature === 'rdv');
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Planning</h1><p class="chapo">Réunions, rendez-vous demandés, étapes, échéances et versions de tous les projets.</p></div>
        <div class="actions"><select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div><button class="btn btn-principal" type="button" data-reunion>${icone('plus')} Réunion</button></div></div>
      <div class="grille grille-tiers">
        <section><p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p><div class="calendrier">${grilleMois(annee, mois, evenements)}</div>${legende()}</section>
        <aside class="pile" style="gap:var(--e-5)">
          ${demandes.length ? `<div><p class="surtitre" style="margin-bottom:8px">Rendez-vous demandés</p><div class="liste">${demandes.map((e) => ligneEvenement(e)).join('')}</div></div>` : ''}
          ${enRetard.length ? `<div><p class="surtitre" style="margin-bottom:8px;color:var(--alerte)">En retard</p><div class="liste">${enRetard.map((e) => ligneEvenement(e)).join('')}</div></div>` : ''}
          <div><p class="surtitre" style="margin-bottom:8px">À venir</p>${aVenir.length ? `<div class="liste">${aVenir.map((e) => ligneEvenement(e)).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', compact: true })}</div>
        </aside>
      </div></div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
    calendrier.rafraichir();
  };
  const calendrier = brancherCalendrier(sortie, env, () => etat);
  const gestes = sur(sortie, 'click', '[data-mois], [data-reunion]', async (el) => {
    if (el.dataset.mois !== undefined) { const n = Number(el.dataset.mois); if (n === 0) { annee = maintenant.getFullYear(); mois = maintenant.getMonth(); } else { mois += n; if (mois < 0) { mois = 11; annee -= 1; } if (mois > 11) { mois = 0; annee += 1; } } rendre(); return; }
    const projets = magasin.lire(K.projets) || [];
    let pid = etat.projet;
    if (!pid) {
      if (!projets.length) { toast('Créez d\'abord un projet.', 'erreur'); return; }
      const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
      m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#choix-p').value));
      pid = await m.fin;
      if (!pid) return;
    }
    editer('reunion', env, { pid });
  });
  /* Un seul dessin par tour, comme le calendrier du Hub. */
  /* Les pièces ne s'attendent que chez qui les lit tout d'un coup : un
     agent sans la finance n'en reçoit jamais. */
  const admin = ((env.session.equipe || {}).role) === 'admin';
  const cles = [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, ...(admin ? [K.documentsTous] : []), K.releasesToutes, K.validationsToutes, K.ticketsTous];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  if (!admin) lot.sur(K.documentsTous, planifier);
  planifier();
  return () => { planifier.arreter(); gestes(); calendrier.arreter(); lot.fin(); };
};
