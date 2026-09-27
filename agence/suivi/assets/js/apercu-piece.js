/* ==========================================================================
   L'aperçu d'une pièce (devis, facture) : le PDF sur le côté, sans quitter
   la page, comme le tiroir de Capmedia Desk. On y lit la pièce, on la
   télécharge, on l'imprime. Rien ne s'y modifie : c'est une vue.

   Le PDF est lu en mémoire (contenuPiece) puis affiché depuis une adresse
   locale : c'est ce qui permet d'imprimer depuis la page, un cadre
   d'une autre origine refusant l'impression.
   ========================================================================== */

import { contenuPiece, echapper, montant, ttcDe, dateCourte, STATUTS_DEVIS, STATUTS_FACTURE } from './noyau.js';
import { modale, toast, icone, pastille } from './ui.js';

export const ouvrirApercu = async (d, { projet = {} } = {}) => {
  if (!d || !d.fichier || !d.fichier.chemin) { toast('Cette pièce n\'a pas encore de PDF.', 'erreur'); return null; }
  const devis = d.type === 'devis';
  const m = modale({
    titre: `${devis ? 'Devis' : 'Facture'} ${d.numero || ''}`,
    sousTitre: `${d.libelle || ''}${projet.nom ? ` · ${projet.nom}` : ''}`,
    feuille: true,
    corps: `
      <div class="apercu-tete">
        <span class="apercu-puce"><b>${echapper(montant(d.montant, 2))}</b><sup>HT</sup></span>
        <span class="apercu-puce">${echapper(montant(ttcDe(d), 2))} TTC</span>
        ${d.date ? `<span class="apercu-puce">${icone('horloge')} ${echapper(dateCourte(d.date))}</span>` : ''}
        ${(devis ? d.expiration : d.echeance) ? `<span class="apercu-puce">${icone('calendrier')} ${devis ? 'Valable jusqu\'au' : 'Échéance'} ${echapper(dateCourte(devis ? d.expiration : d.echeance))}</span>` : ''}
        ${pastille(devis ? STATUTS_DEVIS : STATUTS_FACTURE, d.statut)}
      </div>
      <div class="apercu-cadre" id="apercu-cadre"><p class="aide apercu-attente">Lecture du PDF…</p></div>`,
    pied: `<button class="btn btn-secondaire" type="button" data-telecharger disabled>${icone('telecharger')} Télécharger</button>
      <button class="btn btn-secondaire" type="button" data-imprimer disabled>${icone('receipt')} Imprimer</button>
      <span class="pousse"></span>
      <button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  const feuille = m.el.querySelector('.feuille');
  if (feuille) feuille.classList.add('feuille--apercu');
  const cadre = m.el.querySelector('#apercu-cadre');
  const nom = d.fichier.nom || `${d.numero || (devis ? 'devis' : 'facture')}.pdf`;
  let adresse = '';
  let cadrePdf = null;
  try {
    const blob = await contenuPiece(d.fichier);
    adresse = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
    cadrePdf = document.createElement('iframe');
    cadrePdf.className = 'apercu-pdf';
    cadrePdf.title = `${devis ? 'Devis' : 'Facture'} ${d.numero || ''}`;
    cadrePdf.src = `${adresse}#toolbar=0&navpanes=0&view=FitH`;
    cadre.innerHTML = '';
    cadre.appendChild(cadrePdf);
    m.el.querySelectorAll('[data-telecharger], [data-imprimer]').forEach((b) => { b.disabled = false; });
  } catch (e) {
    console.error('[aperçu] PDF illisible', e);
    cadre.innerHTML = '<p class="aide apercu-attente">Le PDF n\'a pas pu être lu. Réessayez, ou téléchargez-le depuis la fiche.</p>';
  }
  m.el.querySelector('[data-telecharger]').addEventListener('click', () => {
    if (!adresse) return;
    const a = document.createElement('a');
    a.href = adresse; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  });
  m.el.querySelector('[data-imprimer]').addEventListener('click', () => {
    if (!cadrePdf) return;
    try { cadrePdf.contentWindow.focus(); cadrePdf.contentWindow.print(); }
    catch (e) { window.open(adresse, '_blank', 'noopener'); }
  });
  m.fin.then(() => { if (adresse) setTimeout(() => URL.revokeObjectURL(adresse), 60000); });
  return m.fin;
};
