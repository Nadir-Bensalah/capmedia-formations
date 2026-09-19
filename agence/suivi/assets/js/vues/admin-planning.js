/* ==========================================================================
   Le planning de l'équipe : le calendrier de tous les projets, et la liste
   de ce qui vient. On programme une réunion depuis ici.
   ========================================================================== */

import { echapper, dateCourte, joursAvant } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur, modale, toast } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { evenementsDe, grilleMois } from './calendrier.js';
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
  const etat = { projet: '' };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const filtre = (x) => !etat.projet || x.projet === etat.projet;
    const evenements = evenementsDe(env.session, {
      projets, reunions: (magasin.lire(K.reunionsToutes) || []).filter(filtre), jalons: (magasin.lire(K.jalonsTous) || []).filter(filtre),
      taches: (magasin.lire(K.tachesToutes) || []).filter(filtre), documents: (magasin.lire(K.documentsTous) || []).filter(filtre),
      releases: (magasin.lire(K.releasesToutes) || []).filter(filtre), validations: (magasin.lire(K.validationsToutes) || []).filter(filtre),
    });
    const aVenir = evenements.filter((e) => joursAvant(e.date) >= 0).slice(0, 15);
    const enRetard = evenements.filter((e) => joursAvant(e.date) < 0 && (e.genre === 'Tâche' || e.genre === 'Étape' || e.genre === 'Facture')).slice(-8).reverse();
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Planning</h1><p class="chapo">Réunions, étapes, échéances et versions de tous les projets.</p></div>
        <div class="actions"><select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div><button class="btn btn-principal" type="button" data-reunion>${icone('plus')} Réunion</button></div></div>
      <div class="grille grille-tiers">
        <section><p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p><div class="calendrier">${grilleMois(annee, mois, evenements)}</div></section>
        <aside class="pile" style="gap:var(--e-5)">
          ${enRetard.length ? `<div><p class="surtitre" style="margin-bottom:8px;color:var(--alerte)">En retard</p><div class="liste">${enRetard.map((e) => ligne({ href: `#${e.chemin}`, icone: e.icone, ton: 'rouge', titre: echapper(e.titre), sous: `${echapper(e.genre)} · ${echapper(dateCourte(e.date))} · ${echapper(e.projet)}` })).join('')}</div></div>` : ''}
          <div><p class="surtitre" style="margin-bottom:8px">À venir</p>${aVenir.length ? `<div class="liste">${aVenir.map((e) => ligne({ href: `#${e.chemin}`, icone: e.icone, ton: e.ton === 'gris' ? '' : e.ton, titre: echapper(e.titre), sous: `${echapper(e.genre)} · ${echapper(dateCourte(e.date))}${e.heure ? ` ${echapper(e.heure)}` : ''} · ${echapper(e.projet)}` })).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', compact: true })}</div>
        </aside>
      </div></div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
  };
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
  [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, K.documentsTous, K.releasesToutes, K.validationsToutes].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
