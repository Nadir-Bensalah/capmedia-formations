/* ==========================================================================
   « À valider » : tout ce qui attend le client, réuni. Les validations
   formelles ont leur fiche : approuver, ou demander des modifications.
   ========================================================================== */

import { echapper, dateHeure, dateCourte, depuis, avecLiens, parDateDesc, joursAvant, STATUTS_VALIDATION, TYPES_VALIDATION } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, modale, toast, sur, agir, pieceHtml, brancherPieces, echeanceHtml, encart } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, enAttenteDeVous } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { echeance } from '../noyau.js';

export const ouvrirValidation = (v, env, projets) => {
  const equipe = env.role === 'equipe';
  const projet = projets.find((p) => p.id === v.projet) || {};
  const m = modale({
    titre: v.titre, sousTitre: `${TYPES_VALIDATION[v.type] || 'Validation'} · ${projet.nom || ''}${v.demandeur ? ` · demandée par ${v.demandeur.nom}` : ''}`, feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:14px">${pastille(STATUTS_VALIDATION, v.statut)}${v.echeance && v.statut === 'en-attente' ? echeanceHtml(echeance(v.echeance)) : ''}<span class="t-micro t-3">${echapper(dateHeure(v.cree))}</span></div>
      <div class="prose t-corps">${avecLiens(v.description || '')}</div>
      ${(v.pieces || []).length ? `<div class="pieces">${v.pieces.map(pieceHtml).join('')}</div>` : ''}
      ${v.cible && v.cible.libelle ? `<p class="t-petit t-2" style="margin-top:14px">Concerne : <a href="#${echapper(v.cible.chemin || '')}">${echapper(v.cible.libelle)}</a></p>` : ''}
      ${v.reponse ? `<div style="margin-top:20px">${encart(`<strong>${v.statut === 'approuvee' ? 'Approuvée' : 'Modifications demandées'}</strong> par ${echapper(v.reponse.nom || '')} le ${echapper(dateHeure(v.reponse.date))}${v.reponse.commentaire ? `<div class="prose" style="margin-top:6px">${avecLiens(v.reponse.commentaire)}</div>` : ''}`, v.statut === 'approuvee' ? 'ok' : 'attention', v.statut === 'approuvee' ? 'check' : 'edit')}</div>` : ''}
      ${!equipe && v.statut === 'en-attente' ? `
        <form id="forme-validation" class="forme" style="margin-top:24px" novalidate>
          <div class="groupe"><label class="etiquette-champ" for="commentaire">Votre commentaire <span class="facultatif">(obligatoire si vous demandez des modifications)</span></label><textarea class="zone" id="commentaire" name="commentaire" rows="4" maxlength="4000" placeholder="Ce qui vous convient, ce qui doit changer."></textarea></div>
        </form>` : ''}`,
    pied: !equipe && v.statut === 'en-attente'
      ? `<button class="btn btn-secondaire" type="button" data-modifs>Demander des modifications</button><span class="pousse"></span><button class="btn btn-ok" type="button" data-approuver>${icone('check')} Approuver</button>`
      : equipe && v.statut === 'en-attente' ? `<button class="btn btn-danger" type="button" data-annuler>Annuler la demande</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>`
      : `<button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  brancherPieces(m.el);
  const commentaire = () => (m.el.querySelector('#commentaire') || { value: '' }).value.trim();
  sur(m.el, 'click', '[data-approuver]', async (el) => {
    const ok = await agir(el, () => ecrire.repondreValidation(env.session, v.id, 'approuvee', commentaire()), 'Merci, c\'est validé.');
    if (ok) m.fermer(true);
  });
  sur(m.el, 'click', '[data-modifs]', async (el) => {
    if (!commentaire()) { toast('Dites-nous ce qui doit changer.', 'erreur'); m.el.querySelector('#commentaire').focus(); return; }
    const ok = await agir(el, () => ecrire.repondreValidation(env.session, v.id, 'modifications', commentaire()), 'Vos remarques sont transmises.');
    if (ok) m.fermer(true);
  });
  sur(m.el, 'click', '[data-annuler]', async (el) => {
    const ok = await agir(el, () => ecrire.annulerValidation(v.id), 'Demande annulée.');
    if (ok) m.fermer(true);
  });
  return m.fin;
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('À valider');
  filAriane([{ libelle: 'À valider' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  let ouvert = ctx.params.vid || null;

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    const validations = agreger(session, G.validations);
    const attente = enAttenteDeVous({ projets, tickets: agreger(session, G.tickets), validations, documents: agreger(session, G.documents), taches: agreger(session, G.taches), blocages: agreger(session, G.blocages) });
    const enAttente = validations.filter((v) => v.statut === 'en-attente').sort(parDateDesc('cree'));
    const passees = validations.filter((v) => v.statut !== 'en-attente').sort(parDateDesc('maj'));
    const autres = attente.filter((a) => a.genre !== 'validation');
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>En attente de vous</h1><p class="chapo">${attente.length ? `${attente.length} point${attente.length > 1 ? 's' : ''} attend${attente.length > 1 ? 'ent' : ''} votre retour. Le reste avance sans vous.` : 'Rien ne vous attend. Tout avance de notre côté.'}</p></div></div>

      ${enAttente.length ? `<section class="section" style="margin-top:0"><div class="section-tete"><h2>Validations</h2></div><div class="liste">${enAttente.map((v) => ligne({
        icone: 'valider', ton: 'violet', titre: echapper(v.titre), sous: `${echapper(TYPES_VALIDATION[v.type] || 'Validation')} · ${echapper(nomProjet(v.projet))} · ${echapper(depuis(v.cree))}${v.echeance ? ` ${echeanceHtml(echeance(v.echeance))}` : ''}`,
        fin: '<span class="btn btn-principal btn-petit">Examiner</span>', action: 'ouvrir', attrs: `data-id="${echapper(v.id)}"`,
      })).join('')}</div></section>` : ''}

      ${autres.length ? `<section class="section"${enAttente.length ? '' : ' style="margin-top:0"'}><div class="section-tete"><h2>Autres points</h2></div><div class="liste">${autres.map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div></section>` : ''}

      ${!attente.length ? vide({ icone: 'check', titre: 'Tout est à jour', texte: 'Quand une validation, une réponse ou un paiement vous sera demandé, il apparaîtra ici.' }) : ''}

      ${passees.length ? `<section class="section"><div class="section-tete"><h2>Validations passées</h2></div><div class="liste">${passees.slice(0, 20).map((v) => ligne({
        icone: v.statut === 'approuvee' ? 'check' : 'edit', ton: v.statut === 'approuvee' ? 'vert' : v.statut === 'modifications' ? 'ambre' : '',
        titre: echapper(v.titre), sous: `${echapper(nomProjet(v.projet))} · ${echapper(dateCourte((v.reponse || {}).date || v.maj))}`, fin: pastille(STATUTS_VALIDATION, v.statut), action: 'ouvrir', attrs: `data-id="${echapper(v.id)}"`,
      })).join('')}</div></section>` : ''}
    </div>`;

    if (ouvert) {
      const v = validations.find((x) => x.id === ouvert);
      ouvert = null;
      if (v) ouvrirValidation(v, env, projets).then(() => naviguer('/valider', { remplacer: true }));
    }
  };

  const gestes = sur(sortie, 'click', '[data-action="ouvrir"]', (el) => {
    const projets = magasin.lire(K.projets) || session.projets;
    const v = agreger(session, G.validations).find((x) => x.id === el.dataset.id);
    if (v) ouvrirValidation(v, env, projets);
  });

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  [K.projets, ...session.projets.flatMap((p) => [K.validations(p.id), K.tickets(p.id), K.documents(p.id), K.taches(p.id), K.blocages(p.id)])].forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};

void joursAvant;
