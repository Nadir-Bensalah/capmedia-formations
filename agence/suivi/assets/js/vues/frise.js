/* ==========================================================================
   CAPMEDIA CLIENT HUB · la frise d'un devis

   Chaque ligne d'un devis est une étape de la feuille de route, et chaque
   étape se coche. La frise les montre dans l'ordre, avec ce qui est fait,
   ce qui reste, et ce que ça représente en euros.

   L'équipe coche. Le client regarde : la même frise, sans la case. C'est
   le même document pour les deux, et c'est voulu : ce que Nadir coche,
   [nom retire] le voit dans la minute, sans qu'on ait à le lui écrire.

   Une étape de devis n'est rien de plus qu'une étape ordinaire qui porte
   l'identifiant de son devis et son montant : pas de collection à part,
   pas de règle de sécurité en plus, et la progression du projet la
   compte comme les autres.
   ========================================================================== */

import { echapper, montant, dateCourte, STATUTS_ETAPE } from '../noyau.js';
import { icone, pastille, toast } from '../ui.js';
import { ecrire } from '../donnees.js';

/** Les étapes rattachées à un devis, dans l'ordre du devis. */
export const etapesDuDevis = (devis, jalons) => (jalons || [])
  .filter((j) => j.devis === devis.id)
  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

/** Les devis d'un projet qui ont au moins une étape rattachée. */
export const devisAvecEtapes = (documents, jalons) => (documents || [])
  .filter((d) => d.type === 'devis' && (jalons || []).some((j) => j.devis === d.id))
  .sort((a, b) => String(a.numero || '').localeCompare(String(b.numero || '')));

export const friseDevis = (devis, jalons, { equipe, pid }) => {
  const etapes = etapesDuDevis(devis, jalons);
  if (!etapes.length) return '';
  const faites = etapes.filter((j) => j.statut === 'termine');
  const total = etapes.reduce((n, j) => n + (Number(j.montant) || 0), 0);
  const fait = faites.reduce((n, j) => n + (Number(j.montant) || 0), 0);
  const pct = Math.round((faites.length / etapes.length) * 100);

  return `<div class="frise" data-devis="${echapper(devis.id)}">
    <div class="frise-tete">
      <div>
        <p class="frise-titre">${echapper(devis.numero || 'Devis')}${devis.libelle ? ` · ${echapper(devis.libelle)}` : ''}</p>
        <p class="frise-sous"><b>${faites.length} / ${etapes.length}</b> ${etapes.length > 1 ? 'étapes faites' : 'étape faite'}${total ? ` · <b>${echapper(montant(fait))}</b> sur ${echapper(montant(total))} HT` : ''}</p>
      </div>
      <span class="frise-pct">${pct} %</span>
    </div>
    <div class="frise-jauge" role="img" aria-label="${pct} % des étapes faites"><i style="width:${pct}%"></i></div>
    <ol class="frise-etapes">${etapes.map((j, i) => `
      <li class="frise-etape${j.statut === 'termine' ? ' est-faite' : ''}${j.statut === 'en-cours' ? ' est-en-cours' : ''}${j.statut === 'bloque' ? ' est-bloquee' : ''}">
        ${equipe
          ? `<label class="frise-case"><input type="checkbox" data-cocher-etape="${echapper(j.id)}" data-projet="${echapper(pid)}"${j.statut === 'termine' ? ' checked' : ''} aria-label="Marquer « ${echapper(j.titre)} » comme faite"></label>`
          : `<span class="frise-coche" aria-hidden="true">${j.statut === 'termine' ? icone('check') : ''}</span>`}
        <span class="frise-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="frise-corps">
          <span class="frise-libelle">${echapper(j.titre)}</span>
          ${j.fin || j.description ? `<span class="frise-detail">${[j.fin ? (j.statut === 'termine' ? `faite le ${dateCourte(j.maj || j.fin)}` : `prévue le ${dateCourte(j.fin)}`) : '', j.description].filter(Boolean).map(echapper).join(' · ')}</span>` : ''}
        </span>
        <span class="frise-fin">${Number(j.montant) ? `<span class="frise-montant">${echapper(montant(j.montant))}</span>` : ''}${pastille(STATUTS_ETAPE, j.statut || 'a-venir')}</span>
      </li>`).join('')}
    </ol>
  </div>`;
};

/* Cocher, c'est terminer l'étape ; décocher, c'est la rouvrir. Si
   l'écriture échoue, la case revient où elle était : une case cochée
   pour une étape qui ne l'est pas serait un mensonge que rien ne
   signale. */
export const cocherEtape = async (el) => {
  const id = el.dataset.cocherEtape;
  const pid = el.dataset.projet;
  const fait = el.checked;
  el.disabled = true;
  try {
    await ecrire.majJalon(pid, id, fait ? { statut: 'termine', progression: 100 } : { statut: 'en-cours' });
    toast(fait ? 'Étape faite.' : 'Étape rouverte.');
  } catch (err) {
    el.checked = !fait;
    toast("L'étape n'a pas pu être enregistrée.", 'erreur');
  } finally {
    el.disabled = false;
  }
};

/* Un seul écouteur par conteneur, posé une fois : le contenu est
   redessiné à chaque changement, l'écouteur sur le conteneur survit. */
export const brancherFrise = (racine) => {
  if (!racine || racine.dataset.friseBranchee) return;
  racine.dataset.friseBranchee = '1';
  racine.addEventListener('change', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-cocher-etape]') : null;
    if (el) cocherEtape(el);
  });
};
