/* ==========================================================================
   Les archives : projets, demandes, tâches, fichiers et pièces archivés.
   Rien n'est perdu, tout se restaure.
   ========================================================================== */

import { echapper, dateCourte, depuis, parDateDesc, STATUTS, STATUTS_PROJET, statutProjet} from '../noyau.js';
import { icone, pastille, avatarProjet, ligne, vide, squelette, titrePage, sur, agir, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { appelServeur } from '../serveur.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Archives');
  filAriane([{ libelle: 'Archives' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const etat = { onglet: 'projets' };
  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const groupes = {
      projets: projets.filter((p) => p.archive),
      demandes: (magasin.lire(K.ticketsTous) || []).filter((t) => t.archive).sort(parDateDesc('maj')),
      taches: (magasin.lire(K.tachesToutes) || []).filter((t) => t.archive).sort(parDateDesc('maj')),
      fichiers: (magasin.lire(K.fichiersTous) || []).filter((f) => f.archive).sort(parDateDesc('cree')),
      documents: (magasin.lire(K.documentsTous) || []).filter((d) => d.archive).sort(parDateDesc('date')),
    };
    const liste = groupes[etat.onglet] || [];
    const restaurer = (genre, id) => `<button class="btn btn-secondaire btn-petit" type="button" data-restaurer="${genre}" data-id="${echapper(id)}">${icone('restaurer')} Restaurer</button>`;
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Archives</h1><p class="chapo">Ce qui a été rangé. Tout se restaure en un geste.</p></div></div>
      <div class="onglets">${[['projets', 'Projets'], ['demandes', 'Demandes'], ['taches', 'Tâches'], ['fichiers', 'Fichiers'], ['documents', 'Devis et factures']].map(([c, l]) => `<button class="onglet${etat.onglet === c ? ' actif' : ''}" type="button" data-onglet="${c}">${l}<span class="badge">${groupes[c].length}</span></button>`).join('')}</div>
      ${!liste.length ? vide({ icone: 'archive', titre: 'Rien dans cette archive', compact: true })
      : etat.onglet === 'projets' ? `<div class="liste">${liste.map((p) => ligne({ href: `#/projets/${echapper(p.id)}`, titre: `<span class="rang" style="gap:10px">${avatarProjet(p.nom, 'petit')} ${echapper(p.nom)}</span>`, sous: echapper((p.client || {}).entreprise || (p.client || {}).nom || ''), fin: `${pastille(STATUTS_PROJET, p.archive ? 'archive' : statutProjet(p))}${restaurer('projet', p.id)}` })).join('')}</div>`
      : etat.onglet === 'demandes' ? `<div class="liste">${liste.map((t) => ligne({ href: `#/projets/${echapper(t.projet)}/demandes/${echapper(t.id)}`, icone: 'demandes', titre: `${echapper(t.numero || '')} ${echapper(t.titre)}`, sous: `${echapper(nomProjet(t.projet))} · ${echapper(depuis(t.maj))}`, fin: `${pastille(STATUTS, t.statut)}${restaurer('demande', t.id)}` })).join('')}</div>`
      : etat.onglet === 'taches' ? `<div class="liste">${liste.map((t) => ligne({ icone: 'taches', titre: echapper(t.titre), sous: echapper(nomProjet(t.projet)), fin: restaurer('tache', t.id), attrs: 'style="cursor:default"' })).join('')}</div>`
      : etat.onglet === 'fichiers' ? `<div class="liste">${liste.map((f) => ligne({ icone: 'fichiers', titre: echapper(f.nom), sous: `${echapper(nomProjet(f.projet))} · ${echapper(dateCourte(f.cree))}`, fin: restaurer('fichier', f.id), attrs: 'style="cursor:default"' })).join('')}</div>`
      : `<div class="liste">${liste.map((d) => ligne({ icone: d.type === 'devis' ? 'receipt' : 'euro', titre: `${echapper(d.numero || '')} ${echapper(d.libelle || '')}`, sous: `${echapper(nomProjet(d.projet))} · ${echapper(dateCourte(d.date))}`, fin: restaurer('document', d.id), attrs: 'style="cursor:default"' })).join('')}</div>`}
    </div>`;
  };
  const gestes = sur(sortie, 'click', '[data-onglet], [data-restaurer]', async (el, ev) => {
    if (el.dataset.onglet) { etat.onglet = el.dataset.onglet; rendre(); return; }
    ev.preventDefault(); ev.stopPropagation();
    const genre = el.dataset.restaurer; const id = el.dataset.id;
    if (!await confirmer({ titre: 'Restaurer cet élément ?', ok: 'Restaurer' })) return;
    await agir(el, async () => {
      if (genre === 'projet') await ecrire.majProjet(id, { archive: false, statut: 'en-cours' });
      else if (genre === 'demande') await ecrire.majDemande(id, { archive: false });
      else if (genre === 'tache') await ecrire.majTache(id, { archive: false });
      else if (genre === 'fichier') await ecrire.majFichier(id, { archive: false });
      else if (genre === 'document') await appelServeur('archiverDocument', { id, archive: false });
    }, 'Restauré.');
  });
  [K.projets, K.ticketsTous, K.tachesToutes, K.fichiersTous, K.documentsTous].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
