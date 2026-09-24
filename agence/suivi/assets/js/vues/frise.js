/* ==========================================================================
   CAPMEDIA CLIENT HUB · la frise d'un devis

   Chaque ligne d'un devis est une étape de la feuille de route, et chaque
   étape se coche. La frise les montre dans l'ordre, avec ce qui est fait,
   ce qui reste, et ce que ça représente en euros.

   L'équipe coche. Le client regarde : la même frise, sans la case. C'est
   le même document pour les deux, et c'est voulu : ce que Nadir coche,
   le client le voit dans la minute, sans qu'on ait à le lui écrire.

   Une étape de devis n'est rien de plus qu'une étape ordinaire qui porte
   l'identifiant de son devis et son montant : pas de collection à part,
   pas de règle de sécurité en plus, et la progression du projet la
   compte comme les autres.
   ========================================================================== */

import { echapper, montant, montantHT, dateCourte, STATUTS_ETAPE } from '../noyau.js';
import { icone, pastille, toast, menu } from '../ui.js';
import { ecrire, K } from '../donnees.js';
import * as magasin from '../magasin.js';
import { editer } from './editeurs.js';

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
        <p class="frise-sous"><b>${faites.length} / ${etapes.length}</b> ${etapes.length > 1 ? 'étapes faites' : 'étape faite'}${total ? ` · <b>${echapper(montant(fait))}</b> sur ${echapper(montantHT(total))}` : ''}</p>
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
          ${j.fin || j.description || j.faiteLe ? `<span class="frise-detail">${[
            j.statut === 'termine'
              ? (j.faiteLe ? `faite le ${dateCourte(j.faiteLe)}` : (j.fin ? `prévue le ${dateCourte(j.fin)}` : ''))
              : (j.fin ? `prévue le ${dateCourte(j.fin)}` : ''),
            j.description,
          ].filter(Boolean).map(echapper).join(' · ')}</span>` : ''}
        </span>
        <span class="frise-fin">${Number(j.montant) ? `<span class="frise-montant">${echapper(montantHT(j.montant))}</span>` : ''}${equipe
          ? `<button class="frise-statut" type="button" data-statut-etape="${echapper(j.id)}" data-projet="${echapper(pid)}" aria-label="Changer le statut" data-astuce="Changer le statut">${pastille(STATUTS_ETAPE, j.statut || 'a-venir')}${icone('chevron')}</button><button class="btn-icone" type="button" data-editer-etape="${echapper(j.id)}" data-projet="${echapper(pid)}" aria-label="Modifier l'étape" data-astuce="Modifier">${icone('edit')}</button>`
          : pastille(STATUTS_ETAPE, j.statut || 'a-venir')}</span>
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
    /* On consigne le jour de la coche. « maj » disait la dernière
       modification : renommer une étape livrée changeait donc sa date de
       livraison sous les yeux du client. */
    await ecrire.majJalon(pid, id, fait
      ? { statut: 'termine', progression: 100, faiteLe: new Date() }
      : { statut: 'en-cours', faiteLe: null });
    toast(fait ? 'Étape faite.' : 'Étape rouverte.');
  } catch (err) {
    el.checked = !fait;
    toast("L'étape n'a pas pu être enregistrée.", 'erreur');
  } finally {
    el.disabled = false;
  }
};

/* L'étape telle qu'elle est en ce moment, d'où qu'on la lise : le
   client n'a que celles de son projet, l'équipe les a toutes en groupe. */
const etapeDe = (pid, id) => [...(magasin.lire(K.jalons(pid)) || []), ...(magasin.lire(K.jalonsTous) || [])]
  .find((j) => j.id === id && (j.projet || j._parent || pid) === pid);

/* La pastille de statut est un bouton : elle ouvre le choix des cinq
   statuts. La case, elle, ne connaît que fait ou pas fait ; entre les
   deux il y a « en cours » et « bloqué », et c'est justement ce qu'on
   veut pouvoir dire sans ouvrir la fiche. */
export const changerStatut = (el) => {
  const id = el.dataset.statutEtape;
  const pid = el.dataset.projet;
  const actuel = (etapeDe(pid, id) || {}).statut || 'a-venir';
  menu(el, [
    { titre: 'Statut' },
    ...Object.entries(STATUTS_ETAPE).map(([cle, f]) => ({
      cle, libelle: `${f.libelle}${cle === actuel ? '  ·  actuel' : ''}`,
      action: async () => {
        if (cle === actuel) return;
        try {
          await ecrire.majJalon(pid, id, cle === 'termine'
            ? { statut: cle, progression: 100, faiteLe: (etapeDe(pid, id) || {}).faiteLe || new Date() }
            : { statut: cle, faiteLe: null });
          toast(`Étape ${f.libelle.toLowerCase()}.`);
        } catch (err) { toast("Le statut n'a pas pu être enregistré.", 'erreur'); }
      },
    })),
  ]);
};

/* Un seul écouteur par conteneur, posé une fois : le contenu est
   redessiné à chaque changement, l'écouteur sur le conteneur survit.
   L'environnement sert au crayon, qui ouvre la fiche complète. */
export const brancherFrise = (racine, env) => {
  if (!racine || racine.dataset.friseBranchee) return;
  racine.dataset.friseBranchee = '1';
  racine.addEventListener('change', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-cocher-etape]') : null;
    if (el) cocherEtape(el);
  });
  racine.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest) return;
    const statut = e.target.closest('[data-statut-etape]');
    if (statut) { e.preventDefault(); e.stopPropagation(); changerStatut(statut); return; }
    const crayon = e.target.closest('[data-editer-etape]');
    if (crayon) {
      e.preventDefault(); e.stopPropagation();
      const pid = crayon.dataset.projet;
      const fiche = etapeDe(pid, crayon.dataset.editerEtape);
      if (fiche && env) editer('jalon', env, { pid, fiche });
    }
  });
};
