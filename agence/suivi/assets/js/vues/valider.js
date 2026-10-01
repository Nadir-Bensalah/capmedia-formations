/* ==========================================================================
   La fiche d'une validation : approuver, ou demander des modifications,
   avec des pièces si besoin. La liste de ce qui attend le client vit en
   tête de la page Demandes (vues/demandes.js), sous le titre « En attente
   de vous » ; cette fiche s'y ouvre, et dans le cockpit.
   ========================================================================== */

import { echapper, dateHeure, avecLiens, STATUTS_VALIDATION, TYPES_VALIDATION, estResponsable, echeance } from '../noyau.js';
import { icone, pastille, modale, toast, sur, agir, pieceHtml, brancherPieces, echeanceHtml, encart, depot } from '../ui.js';
import { ecrire } from '../donnees.js';

export const ouvrirValidation = (v, env, projets) => {
  const equipe = env.role === 'equipe';
  const projet = projets.find((p) => p.id === v.projet) || {};
  /* Une validation réservée au responsable : le collaborateur la lit, il
     ne peut pas y répondre (les règles le lui refusent aussi). */
  const reservee = v.reserveeResponsable === true;
  const peutRepondre = !equipe && v.statut === 'en-attente' && (!reservee || estResponsable(env.session, projet.id ? projet : v.projet));
  const m = modale({
    titre: v.titre, sousTitre: `${TYPES_VALIDATION[v.type] || 'Validation'} · ${projet.nom || ''}${v.demandeur ? ` · demandée par ${v.demandeur.nom}` : ''}`, feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:14px">${pastille(STATUTS_VALIDATION, v.statut)}${v.echeance && v.statut === 'en-attente' ? echeanceHtml(echeance(v.echeance)) : ''}<span class="t-micro t-3">${echapper(dateHeure(v.cree))}</span></div>
      <div class="prose t-corps">${avecLiens(v.description || '')}</div>
      ${(v.pieces || []).length ? `<div class="pieces">${v.pieces.map(pieceHtml).join('')}</div>` : ''}
      ${v.cible && v.cible.libelle ? `<p class="t-petit t-2" style="margin-top:14px">Concerne : <a href="#${echapper(v.cible.chemin || '')}">${echapper(v.cible.libelle)}</a></p>` : ''}
      ${v.reponse ? `<div style="margin-top:20px">${encart(`<strong>${v.statut === 'approuvee' ? 'Approuvée' : 'Modifications demandées'}</strong> par ${echapper(v.reponse.nom || '')} le ${echapper(dateHeure(v.reponse.date))}${v.reponse.commentaire ? `<div class="prose" style="margin-top:6px">${avecLiens(v.reponse.commentaire)}</div>` : ''}${(v.reponse.pieces || []).length ? `<div class="pieces" style="margin-top:8px">${v.reponse.pieces.map(pieceHtml).join('')}</div>` : ''}`, v.statut === 'approuvee' ? 'ok' : 'attention', v.statut === 'approuvee' ? 'check' : 'edit')}</div>` : ''}
      ${v.statut === 'annulee' ? `<div style="margin-top:20px">${encart(equipe ? 'Demande annulée : le client n\'a plus rien à faire.' : '<strong>Validation retirée.</strong> Capmedia a annulé cette demande : vous n\'avez plus rien à faire ici.', '', 'info')}</div>` : ''}
      ${reservee ? `<div style="margin-top:16px">${encart(equipe ? 'Réservée au responsable du projet côté client.' : (peutRepondre ? '<strong>Cette décision vous revient</strong> en tant que responsable du projet.' : '<strong>Réservée au responsable du projet.</strong> Vous pouvez la lire ; la réponse revient au responsable de votre société.'), 'info', 'cadenas')}</div>` : ''}
      ${peutRepondre ? `
        <form id="forme-validation" class="forme" style="margin-top:24px" novalidate>
          <div class="groupe"><label class="etiquette-champ" for="commentaire">Votre commentaire <span class="facultatif">(obligatoire si vous demandez des modifications)</span></label><textarea class="zone" id="commentaire" name="commentaire" rows="4" maxlength="4000" placeholder="Ce qui vous convient, ce qui doit changer."></textarea></div>
          <div class="groupe"><span class="etiquette-champ">Vos pièces <span class="facultatif">(facultatif)</span></span><div id="zone-pieces-validation"></div></div>
        </form>` : ''}`,
    pied: peutRepondre
      ? `<button class="btn btn-secondaire" type="button" data-modifs>Demander des modifications</button><span class="pousse"></span><button class="btn btn-ok" type="button" data-approuver>${icone('check')} Approuver</button>`
      : equipe && v.statut === 'en-attente' ? `<button class="btn btn-danger" type="button" data-annuler>Annuler la demande</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>`
      : `<button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
  brancherPieces(m.el);
  const commentaire = () => (m.el.querySelector('#commentaire') || { value: '' }).value.trim();
  /* Ses remarques peuvent porter une capture, un document annoté : les
     pièces vont sous « reponse » de cette validation (règles Storage). */
  const zonePieces = m.el.querySelector('#zone-pieces-validation');
  const boite = zonePieces ? depot(zonePieces, { chemin: `projets/${v.projet}/validations/${v.id}/reponse`, texte: 'Joignez une <strong>capture ou un document</strong> annoté.' }) : null;
  const pieces = () => (boite ? boite.pieces : []);
  const envoisEnCours = () => { if (boite && boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return true; } return false; };
  sur(m.el, 'click', '[data-approuver]', async (el) => {
    if (envoisEnCours()) return;
    const ok = await agir(el, () => ecrire.repondreValidation(env.session, v.id, 'approuvee', commentaire(), pieces()), 'Merci, c\'est validé.');
    if (ok) m.fermer(true);
  });
  sur(m.el, 'click', '[data-modifs]', async (el) => {
    if (!commentaire()) { toast('Dites-nous ce qui doit changer.', 'erreur'); m.el.querySelector('#commentaire').focus(); return; }
    if (envoisEnCours()) return;
    const ok = await agir(el, () => ecrire.repondreValidation(env.session, v.id, 'modifications', commentaire(), pieces()), 'Vos remarques sont transmises.');
    if (ok) m.fermer(true);
  });
  sur(m.el, 'click', '[data-annuler]', async (el) => {
    const ok = await agir(el, () => ecrire.annulerValidation(v.id), 'Demande annulée.');
    if (ok) m.fermer(true);
  });
  return m.fin;
};

