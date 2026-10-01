/* ==========================================================================
   Demandes : ce qui attend le client, puis toutes ses demandes, sur une
   seule page (une seule entrée du rail). En tête, « En attente de vous » :
   les validations, les demandes à sa réponse, les devis, les factures, les
   tâches et les points bloquants de son côté. Dessous, ses demandes, tous
   projets confondus, avec les filtres de l'onglet Demandes et un filtre par
   projet. Les validations passées ferment la page.
   L'ancienne adresse « #/valider » mène ici ; « #/valider/{id} » (e-mails,
   notifications, recherche) ouvre la fiche de la validation par-dessus.
   ========================================================================== */

import { echapper, parDateDesc, age, depuis, dateCourte, echeance, OUVERTS, ATTEND_CLIENT, STATUTS, TYPES, URGENCES, QUALIFICATIONS, STATUTS_VALIDATION, TYPES_VALIDATION } from '../noyau.js';
import { icone, ligne, vide, squelette, titrePage, sur, pastille, puce, iconePlateforme, tonPlateforme, echeanceHtml, toast } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, enAttenteDeVous, peutRepondreValidation } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { choisirProjet } from './accueil.js';
import { ouvrirValidation } from './valider.js';

const CLE_FILTRE = 'suivi:filtre-demandes:*';
const CLE_PROJET = 'suivi:filtre-demandes-projet:*';
const lireMemoire = (cle, defaut) => { try { return sessionStorage.getItem(cle) || defaut; } catch (e) { return defaut; } };
const retenir = (cle, valeur) => { try { sessionStorage.setItem(cle, valeur); } catch (e) { /* stockage refusé */ } };

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Demandes');
  filAriane([{ libelle: 'Demandes' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const etat = { filtre: lireMemoire(CLE_FILTRE, 'ouvertes'), projet: (ctx.requete && ctx.requete.projet) || lireMemoire(CLE_PROJET, '') };
  /* Une validation dans l'adresse (#/valider/{id}) s'ouvre en fiche dès que
     les validations sont arrivées. « Validations passées » se lit par
     vingt, un bouton « Voir plus » allonge la liste. */
  let ouvert = (ctx.params || {}).vid || null;
  let limitePassees = 20;

  const rendre = () => {
    const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
    if (etat.projet && !projets.some((p) => p.id === etat.projet)) etat.projet = '';
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const tous = agreger(session, G.tickets)
      .filter((t) => !t.archive && projets.some((p) => p.id === t.projet))
      .filter((t) => !etat.projet || t.projet === etat.projet)
      .sort(parDateDesc('maj'));
    const groupes = {
      ouvertes: tous.filter((t) => OUVERTS.includes(t.statut)),
      moi: tous.filter((t) => ATTEND_CLIENT.includes(t.statut)),
      terminees: tous.filter((t) => !OUVERTS.includes(t.statut)),
      toutes: tous,
    };
    const liste = groupes[etat.filtre] || groupes.ouvertes;
    /* Ce qui attend le client, tous projets (actifs ou non : une facture
       due reste due). Un collaborateur ne voit pas les validations
       réservées au responsable, il ne pourrait pas y répondre. */
    const tousProjets = magasin.lire(K.projets) || session.projets;
    const validations = agreger(session, G.validations);
    const attente = enAttenteDeVous({ projets: tousProjets, tickets: agreger(session, G.tickets), validations, documents: agreger(session, G.documents), taches: agreger(session, G.taches), blocages: agreger(session, G.blocages) });
    const aValider = validations.filter((v) => v.statut === 'en-attente' && peutRepondreValidation(v)).sort(parDateDesc('cree'));
    const autres = attente.filter((a) => a.genre !== 'validation');
    const passees = validations.filter((v) => v.statut !== 'en-attente').sort(parDateDesc('maj'));
    const nomDe = (pid) => ((tousProjets.find((p) => p.id === pid) || {}).nom || '');
    const blocAttente = `<section class="section" id="en-attente" style="margin-top:0">
        <div class="section-tete"><h2>En attente de vous${attente.length ? ` <span class="compte-section compte-section--vif">${attente.length}</span>` : ''}</h2></div>
        <p class="t-petit t-2" style="margin:-4px 0 12px">${attente.length ? `${attente.length} point${attente.length > 1 ? 's' : ''} attend${attente.length > 1 ? 'ent' : ''} votre retour. Le reste avance sans vous.` : 'Rien ne vous attend. Tout avance de notre côté.'}</p>
        ${attente.length ? `<div class="liste">${aValider.map((v) => ligne({
          icone: 'valider', ton: 'violet', titre: echapper(v.titre), sous: `${echapper(TYPES_VALIDATION[v.type] || 'Validation')} · ${echapper(nomDe(v.projet))} · ${echapper(depuis(v.cree))}${v.echeance ? ` ${echeanceHtml(echeance(v.echeance))}` : ''}`,
          fin: '<span class="btn btn-principal btn-petit">Examiner</span>', action: 'ouvrir-validation', attrs: `data-id="${echapper(v.id)}"`,
        })).join('')}${autres.map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}</div>` : ''}
      </section>`;
    const blocPassees = passees.length ? `<section class="section" id="validations-passees"><div class="section-tete"><h2>Validations passées</h2></div><div class="liste">${passees.slice(0, limitePassees).map((v) => ligne({
        /* Une validation annulée n'a été ni approuvée ni contestée : icône
           neutre, pastille « Annulée ». */
        icone: v.statut === 'approuvee' ? 'check' : v.statut === 'modifications' ? 'edit' : 'valider', ton: v.statut === 'approuvee' ? 'vert' : v.statut === 'modifications' ? 'ambre' : '',
        titre: echapper(v.titre), sous: `${echapper(nomDe(v.projet))} · ${echapper(dateCourte((v.reponse || {}).date || v.maj))}`, fin: pastille(STATUTS_VALIDATION, v.statut), action: 'ouvrir-validation', attrs: `data-id="${echapper(v.id)}"`,
      })).join('')}</div>${passees.length > limitePassees ? `<p style="margin-top:12px"><button class="btn btn-secondaire btn-petit" type="button" data-voir-plus>Voir plus</button> <span class="t-micro t-3">${passees.length - limitePassees} de plus</span></p>` : ''}</section>` : '';
    const nonLu = (t) => { const marque = (t.lu || {}).client; return !marque || ((t.maj && t.maj.toMillis ? t.maj.toMillis() : 0) > (marque.toMillis ? marque.toMillis() : 0)); };

    sortie.innerHTML = `<div class="page">
      <div class="page-tete">
        <div><h1>Demandes</h1><p class="chapo">Ce qui attend votre retour, puis ${projets.length > 1 ? 'toutes vos demandes, sur tous vos projets' : 'vos demandes'} : ce qui est chez nous, ce qui attend votre réponse, ce qui est terminé.</p></div>
        <div class="actions">${projets.length ? `<button class="btn btn-principal" type="button" data-nouvelle-demande>${icone('plus')} Nouvelle demande</button>` : ''}</div>
      </div>
      ${blocAttente}
      <section class="section" id="vos-demandes">
      <div class="section-tete"><h2>Vos demandes</h2></div>
      <div class="rang" style="margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div class="filtres">
          ${[['ouvertes', 'Ouvertes'], ['moi', 'À vous'], ['terminees', 'Terminées'], ['toutes', 'Toutes']].map(([cle, lib]) => `<button class="filtre${etat.filtre === cle ? ' actif' : ''}" type="button" data-filtre="${cle}">${lib}<span class="compte">${groupes[cle].length}</span></button>`).join('')}
        </div>
        ${projets.length > 1 ? `<select class="select" id="filtre-projet" style="width:auto;min-width:180px" aria-label="Projet"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}"${etat.projet === p.id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select>` : ''}
      </div>
      ${liste.length ? `<div class="liste">${liste.map((t) => ligne({
        href: `#/projets/${echapper(t.projet)}/demandes/${echapper(t.id)}`,
        icone: iconePlateforme(t.plateforme) || (TYPES[t.type] || {}).icone || 'inbox',
        ton: tonPlateforme(t.plateforme) || (ATTEND_CLIENT.includes(t.statut) ? 'ambre' : t.statut === 'resolu' ? 'vert' : ''),
        nonLu: nonLu(t) && OUVERTS.includes(t.statut),
        titre: `${t.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(t.numero)}</span> ` : ''}${echapper(t.titre)}`,
        sous: `${projets.length > 1 ? `${echapper(nomProjet(t.projet))} · ` : ''}${echapper((TYPES[t.type] || {}).libelle || t.type)} · ${puce(URGENCES, t.urgence || 'important')} · ${echapper(OUVERTS.includes(t.statut) ? `ouverte depuis ${age(t.cree)}` : `close ${depuis(t.maj)}`)}${t.qualification ? ` · ${pastille(QUALIFICATIONS, t.qualification)}` : ''}`,
        fin: `${(() => {
          const chez = (STATUTS[t.statut] || {}).chez;
          if (chez === 'client') return '<span class="puce puce--ambre"><i></i>À vous</span>';
          if (chez === 'capmedia') return '<span class="puce"><i></i>Chez Capmedia</span>';
          return '';
        })()}${pastille(STATUTS, t.statut, { client: true })}`,
      })).join('')}</div>`
      : vide({ icone: 'demandes', titre: etat.filtre === 'ouvertes' ? 'Aucune demande en cours' : 'Rien ici', texte: etat.filtre === 'ouvertes' ? 'Tout semble en ordre pour le moment.' : '', action: projets.length ? '<button class="btn btn-secondaire" type="button" data-nouvelle-demande>Créer une demande</button>' : '' })}
      </section>
      ${blocPassees}
    </div>`;
    const sel = sortie.querySelector('#filtre-projet');
    if (sel) sel.addEventListener('change', () => { etat.projet = sel.value; retenir(CLE_PROJET, etat.projet); rendre(); });

    if (ouvert) {
      /* Tant que les validations ne sont pas toutes arrivées, on ne conclut
         pas : un lien d'e-mail vers une validation encore en route n'est pas
         un lien mort. */
      const chargees = session.projets.every((p) => magasin.lire(K.validations(p.id)) !== undefined || magasin.erreur(K.validations(p.id)));
      if (chargees) {
        const v = validations.find((x) => x.id === ouvert);
        ouvert = null;
        if (v) ouvrirValidation(v, env, tousProjets).then(() => naviguer('/demandes', { remplacer: true }));
        else { toast('Cette validation n\'existe plus.', 'erreur'); naviguer('/demandes', { remplacer: true }); }
      }
    }
  };

  const gestes = sur(sortie, 'click', '[data-filtre], [data-nouvelle-demande], [data-action="ouvrir-validation"], [data-voir-plus]', async (el) => {
    if (el.dataset.filtre !== undefined) { etat.filtre = el.dataset.filtre; retenir(CLE_FILTRE, etat.filtre); rendre(); return; }
    if (el.hasAttribute('data-voir-plus')) { limitePassees += 20; rendre(); return; }
    if (el.dataset.action === 'ouvrir-validation') {
      const v = agreger(session, G.validations).find((x) => x.id === el.dataset.id);
      if (v) ouvrirValidation(v, env, magasin.lire(K.projets) || session.projets);
      return;
    }
    const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
    /* Le filtre projet vaut choix : sinon, à plusieurs projets, on demande. */
    const pid = etat.projet || await choisirProjet(projets);
    if (pid) naviguer(`/projets/${pid}/nouvelle-demande`);
  });

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const cles = [K.projets, ...session.projets.flatMap((p) => [K.tickets(p.id), K.validations(p.id), K.documents(p.id), K.taches(p.id), K.blocages(p.id)])];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  /* Un projet ouvert après le montage amène ses demandes sur une clé que la
     vue ne connaissait pas : on l'écoute dès qu'il apparaît. */
  const suivis = new Set(session.projets.map((p) => p.id));
  lot.sur(K.projets, (liste) => (liste || []).forEach((p) => { if (!suivis.has(p.id)) { suivis.add(p.id); lot.sur(K.tickets(p.id), planifier); } }));
  planifier();
  return () => { planifier.arreter(); gestes(); lot.fin(); };
};
