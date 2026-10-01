/* ==========================================================================
   CAPMEDIA CLIENT HUB · les suggestions d'amélioration

   Ce que Capmedia propose au client sans qu'il l'ait demandé : une
   fonctionnalité qu'on peut développer (widgets, Dynamic Island), ou un
   conseil à mettre en place. Deux familles, chacune en groupe. Chaque
   suggestion est une fiche : un résumé, un texte détaillé, un visuel, le
   bénéfice attendu, la durée, le prix HT et TTC, un devis joint.

   L'équipe pilote tout depuis le Cockpit : créer, modifier, dupliquer,
   ordonner, publier, changer l'état, retirer. Le client ne voit que les
   publiées, et y répond depuis la fiche : « Ça m'intéresse » ouvre une
   demande à son nom et passe la suggestion à l'étude ; « Pas intéressé »
   la décline, avec une raison s'il veut, et il peut revenir dessus ;
   « Poser une question » ouvre la bulle du projet avec le sujet posé.

   Les données vivent sous projets/{p}/suggestions ; les règles ne
   laissent au client que sa réponse et sa marque « vue ».
   ========================================================================== */

import {
  echapper, dateCourte, dateHeure, pluriel, montantHT, montantTTC, enMarkdown, enParagraphes,
  FAMILLES_SUGGESTION, STATUTS_SUGGESTION, PUBLICATIONS_SUGGESTION, SUGGESTION_CLIENT_AGIT, PLATEFORMES, STATUTS_DEVIS,
} from '../noyau.js';
import { icone, pastille, pucePlateforme, vide, fait, modale, confirmer, toast, sur, menu, agir, encart, brancherPieces } from '../ui.js';
import { ecrire } from '../donnees.js';
import { editer, supprimer, proposerEtapeDepuisSuggestion } from './editeurs.js';
import { telechargerPiece } from '../telecharger-piece.js';

/* La conversation vit en bulle (bulle-projet.js) : on lui passe un début de phrase. */
const ouvrirBulle = (pid, texte) => document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: pid, texte } }));

/* --- Ce qu'on lit ------------------------------------------------------- */

export const estPubliee = (s) => Boolean(s) && s.publication === 'publiee';
const parOrdre = (a, b) => (a.ordre || 0) - (b.ordre || 0) || String(a.titre || '').localeCompare(String(b.titre || ''));
export const trierSuggestions = (liste = []) => liste.slice().sort(parOrdre);

/** Les suggestions publiées que cette personne n'a pas encore vues. */
export const suggestionsNonVues = (liste = [], uid) => liste.filter((s) => estPubliee(s) && s.statut !== 'retiree' && !((s.vues || {})[uid]));

/** Ce que porte le badge de l'onglet : côté client, les publiées pas
    encore vues ; côté équipe, celles à l'étude, qui attendent une réponse. */
export const compteOnglet = (liste = [], env) => (env.role === 'equipe'
  ? liste.filter((s) => s.statut === 'a-l-etude').length
  : suggestionsNonVues(liste, env.session.utilisateur.uid).length);

/** La suggestion mise en avant sur l'aperçu : celle marquée « à la une »,
    sinon la première par ordre, parmi les publiées encore ouvertes. */
export const suggestionALaUne = (liste = []) => {
  const ouvertes = trierSuggestions(liste).filter((s) => estPubliee(s) && ['proposee', 'a-l-etude'].includes(s.statut || 'proposee'));
  return ouvertes.find((s) => s.aLaUne) || ouvertes[0] || null;
};

/* Le prix d'une suggestion, dit avec sa mention. Sans TVA, un seul chiffre. */
const ttcDe = (s) => Math.round(s.prix * (1 + (Number(s.tva) || 0) / 100) * 100) / 100;
const aUnPrix = (s) => typeof s.prix === 'number' && Number.isFinite(s.prix);
const prixHtml = (s) => {
  if (!aUnPrix(s)) return '';
  if (!(Number(s.tva) || 0)) return echapper(montantHT(s.prix));
  return `${echapper(montantHT(s.prix))} <span class="t-3">· ${echapper(montantTTC(ttcDe(s)))}</span>`;
};
const prixTexte = (s) => {
  if (!aUnPrix(s)) return '';
  return (Number(s.tva) || 0) ? `${montantHT(s.prix)} · ${montantTTC(ttcDe(s))}` : montantHT(s.prix);
};

/* Le devis joint, s'il est lisible par la personne : un collaborateur ne
   lit pas la finance, et la fiche le lui dit sans montrer de chiffre. */
const devisDe = (s, d) => (s.devis ? (d.documents || []).find((x) => x.id === s.devis) || null : null);

/* L'état, dit au client sans jargon : une déclinée par lui est « Pas pour
   le moment », une retirée par nous reste « Retirée ». */
const pastilleEtat = (s, equipe) => pastille(STATUTS_SUGGESTION, s.statut || 'proposee', { client: !equipe });

/* Le visuel : une vignette qui se remplit seule (brancherPieces), et qui
   s'agrandit d'un clic. Rien si la fiche n'en a pas. */
const visuelHtml = (s, { grand = false } = {}) => (s.visuel && s.visuel.chemin
  ? `<a class="sugg-visuel${grand ? ' sugg-visuel--grand' : ''}" href="#" data-agrandir-piece="${echapper(s.visuel.chemin)}" data-nom="${echapper(s.titre || '')}" aria-label="${echapper(`Agrandir le visuel de « ${s.titre} »`)}"><img alt="" data-vignette="${echapper(s.visuel.chemin)}" decoding="async"></a>`
  : '');

const ligneClient = (s, d, pid) => {
  const r = s.reponse || {};
  if (!r.choix) return '';
  const demande = r.demande ? (d.tickets || []).find((t) => t.id === r.demande) : null;
  if (r.choix === 'interesse') return `${echapper(r.nom || 'Le client')} s'y intéresse${r.le ? ` depuis le ${echapper(dateCourte(r.le))}` : ''}${demande ? ` · <a href="#/projets/${echapper(pid)}/demandes/${echapper(demande.id)}">${echapper(demande.numero || 'voir la demande')}</a>` : ''}`;
  return `${echapper(r.nom || 'Le client')} a décliné${r.le ? ` le ${echapper(dateCourte(r.le))}` : ''}${r.raison ? ` : « ${echapper(r.raison)} »` : ''}`;
};

/* ==========================================================================
   L'onglet
   ========================================================================== */

const filtreCourant = (pid) => { try { return sessionStorage.getItem(`suivi:filtre-suggestions:${pid}`) || ''; } catch (e) { return ''; } };

/* Une carte : le titre, le résumé, les plateformes, le prix, l'état. Le
   client agit depuis la fiche ; un bouton « Ça m'intéresse » reste à
   portée sur la carte tant que la suggestion est ouverte. */
const carte = (s, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const uid = env.session.utilisateur.uid;
  const neuve = !equipe && !((s.vues || {})[uid]);
  const plateformes = (s.plateformes || []).filter((p) => PLATEFORMES[p]);
  const peutAgir = !equipe && SUGGESTION_CLIENT_AGIT.includes(s.statut || 'proposee');
  const interesse = Boolean(s.reponse && s.reponse.choix === 'interesse');
  return `<article class="sugg${s.statut === 'retiree' ? ' sugg--retiree' : ''}${!estPubliee(s) ? ' sugg--brouillon' : ''}" data-suggestion="${echapper(s.id)}" data-famille="${echapper(s.famille || 'developpement')}">
    ${visuelHtml(s)}
    <div class="sugg-corps">
      <div class="rang-espace" style="align-items:flex-start;gap:12px">
        <button class="sugg-titre" type="button" data-action="ouvrir-suggestion" data-id="${echapper(s.id)}">${echapper(s.titre)}${neuve ? ' <span class="badge badge--vif">Nouveau</span>' : ''}</button>
        <span class="rang" style="gap:6px;flex:none">${equipe ? pastille(PUBLICATIONS_SUGGESTION, estPubliee(s) ? 'publiee' : 'brouillon') : ''}${pastilleEtat(s, equipe)}</span>
      </div>
      ${s.resume ? `<p class="sugg-resume">${echapper(s.resume)}</p>` : ''}
      <div class="rang sugg-faits">
        ${plateformes.map((p) => pucePlateforme(p, { court: true })).join('')}
        ${s.duree ? `<span class="puce"><i></i>${echapper(s.duree)}</span>` : ''}
        ${prixHtml(s) ? `<span class="sugg-prix">${prixHtml(s)}</span>` : ''}
        ${s.devis ? '<span class="puce puce--bleu"><i></i>Devis joint</span>' : ''}
        ${equipe && s.aLaUne ? '<span class="etiquette">À la une</span>' : ''}
      </div>
      ${equipe && ligneClient(s, d, pid) ? `<p class="t-petit t-2" style="margin-top:8px">${ligneClient(s, d, pid)}</p>` : ''}
      <div class="rang sugg-pied">
        <button class="btn btn-doux btn-petit" type="button" data-action="ouvrir-suggestion" data-id="${echapper(s.id)}">Voir le détail</button>
        ${peutAgir && !interesse ? `<button class="btn btn-principal btn-petit" type="button" data-action="suggestion-interesse" data-id="${echapper(s.id)}">${icone('check')} Ça m'intéresse</button>` : ''}
        ${equipe ? `<span class="pousse"></span>
          <button class="btn-icone" type="button" data-action="suggestion-monter" data-id="${echapper(s.id)}" aria-label="Monter" data-astuce="Monter">${icone('chevronHaut')}</button>
          <button class="btn-icone" type="button" data-action="suggestion-descendre" data-id="${echapper(s.id)}" aria-label="Descendre" data-astuce="Descendre">${icone('chevron')}</button>
          <button class="btn btn-petit ${estPubliee(s) ? 'btn-doux' : 'btn-secondaire'}" type="button" data-action="suggestion-publier" data-id="${echapper(s.id)}">${estPubliee(s) ? 'Dépublier' : 'Publier'}</button>
          <button class="btn-icone" type="button" data-action="editer" data-genre="suggestion" data-id="${echapper(s.id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button>
          <button class="btn-icone" type="button" data-action="menu-suggestion" data-id="${echapper(s.id)}" aria-label="Plus d'actions">${icone('points')}</button>` : ''}
      </div>
    </div>
  </article>`;
};

export const ongletSuggestions = (d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const toutes = trierSuggestions(d.suggestions || []).filter((s) => equipe || estPubliee(s));
  const filtre = filtreCourant(pid);
  const presentes = Object.keys(PLATEFORMES).filter((p) => toutes.some((s) => (s.plateformes || []).includes(p)));
  const liste = toutes.filter((s) => !filtre || !(s.plateformes || []).length || (s.plateformes || []).includes(filtre));
  const groupes = Object.entries(FAMILLES_SUGGESTION).map(([cle, f]) => ({ cle, f, items: liste.filter((s) => (s.famille || 'developpement') === cle) }));
  const aLEtude = toutes.filter((s) => s.statut === 'a-l-etude');
  const brouillons = toutes.filter((s) => !estPubliee(s)).length;

  const tete = `<div class="section-tete">
    <div><h2>Suggestions</h2><p class="chapo">${equipe
    ? `Ce que vous proposez au client : ${pluriel(toutes.length - brouillons, 'suggestion publiée', 'suggestions publiées')}${brouillons ? `, ${pluriel(brouillons, 'brouillon')}` : ''}.`
    : 'Nos idées pour faire avancer votre application : ce que nous pouvons développer, et ce que nous vous conseillons de mettre en place. Rien n\'est engagé tant que vous ne le dites pas.'}</p></div>
    ${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="suggestion" data-defaut='${echapper(JSON.stringify({ ordre: toutes.length + 1 }))}'>${icone('plus')} Nouvelle suggestion</button>` : ''}
  </div>`;

  if (!toutes.length) {
    return `<section class="section" style="margin-top:0">${tete}${vide({ icone: 'ampoule', titre: 'Aucune suggestion pour le moment', texte: equipe ? 'Proposez une amélioration : widgets, Dynamic Island, une page d\'aide, une relance par e-mail. Le client la lit une fois publiée.' : 'Nos suggestions d\'amélioration apparaîtront ici.' })}</section>`;
  }

  return `<section class="section" style="margin-top:0">
    ${tete}
    ${equipe && aLEtude.length ? `<div style="margin-bottom:16px" id="suggestions-a-l-etude">${encart(`<strong>${echapper(pluriel(aLEtude.length, 'suggestion à l\'étude', 'suggestions à l\'étude'))}</strong> : le client s'y intéresse, une demande est ouverte à son nom. <a href="#/projets/${echapper(pid)}/demandes">Voir les demandes</a>`, 'attention', 'ampoule')}</div>` : ''}
    ${presentes.length > 1 ? `<div class="filtres" style="margin-bottom:16px" role="group" aria-label="Plateforme">
      <button class="filtre${!filtre ? ' actif' : ''}" type="button" data-filtre-suggestions="">Toutes<span class="compte">${toutes.length}</span></button>
      ${presentes.map((p) => `<button class="filtre${filtre === p ? ' actif' : ''}" type="button" data-filtre-suggestions="${echapper(p)}">${echapper(PLATEFORMES[p].libelle)}<span class="compte">${toutes.filter((s) => (s.plateformes || []).includes(p)).length}</span></button>`).join('')}
    </div>` : ''}
    ${groupes.filter((g) => g.items.length || equipe).map((g) => `<div class="sugg-groupe" data-groupe-suggestions="${echapper(g.cle)}">
      <div class="section-tete" style="margin-bottom:10px"><div><h3>${echapper(g.f.libelle)}</h3><p class="t-petit t-3" style="margin-top:2px">${echapper(g.f.aide)}</p></div>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-action="nouveau" data-genre="suggestion" data-defaut='${echapper(JSON.stringify({ famille: g.cle, ordre: toutes.length + 1 }))}'>${icone('plus')} Ajouter</button>` : ''}</div>
      ${g.items.length ? `<div class="sugg-liste">${g.items.map((s) => carte(s, d, { pid, env })).join('')}</div>` : `<p class="t-petit t-3">Rien dans cette famille${filtre ? ' pour cette plateforme' : ''}.</p>`}
    </div>`).join('')}
  </section>`;
};

/* --- La mise en avant sur l'aperçu ---------------------------------------
   UNE suggestion publiée, celle à la une ou la première : un titre, deux
   phrases, le prix, et le chemin vers l'onglet. Côté équipe, rien ici :
   l'aperçu de l'équipe est déjà chargé. */
export const apercuSuggestionHtml = (d, { pid, env }) => {
  if (env.role === 'equipe') return '';
  const s = suggestionALaUne(d.suggestions || []);
  if (!s) return '';
  const total = (d.suggestions || []).filter((x) => estPubliee(x) && x.statut !== 'retiree').length;
  return `<section class="section" id="suggestion-a-la-une">
    <div class="section-tete"><h2>Une idée pour votre application</h2><a class="lien" href="#/projets/${echapper(pid)}/suggestions">${total > 1 ? `Toutes les suggestions (${total})` : 'Voir la suggestion'}</a></div>
    <article class="sugg sugg--une" data-suggestion="${echapper(s.id)}">
      ${visuelHtml(s)}
      <div class="sugg-corps">
        <p class="surtitre">${echapper((FAMILLES_SUGGESTION[s.famille] || FAMILLES_SUGGESTION.developpement).court)}</p>
        <button class="sugg-titre" type="button" data-action="ouvrir-suggestion" data-id="${echapper(s.id)}" style="margin-top:4px">${echapper(s.titre)}</button>
        ${s.resume ? `<p class="sugg-resume">${echapper(s.resume)}</p>` : ''}
        <div class="rang sugg-faits">${(s.plateformes || []).filter((p) => PLATEFORMES[p]).map((p) => pucePlateforme(p, { court: true })).join('')}${prixHtml(s) ? `<span class="sugg-prix">${prixHtml(s)}</span>` : ''}${pastilleEtat(s, false)}</div>
        <div class="rang sugg-pied"><a class="btn btn-secondaire btn-petit" href="#/projets/${echapper(pid)}/suggestions">${icone('ampoule')} Lire la suggestion</a></div>
      </div>
    </article>
  </section>`;
};

/* ==========================================================================
   La fiche
   ========================================================================== */

export const ouvrirSuggestion = (s, d, { pid, env }) => {
  const equipe = env.role === 'equipe';
  const devis = devisDe(s, d);
  const plateformes = (s.plateformes || []).filter((p) => PLATEFORMES[p]);
  const peutAgir = !equipe && SUGGESTION_CLIENT_AGIT.includes(s.statut || 'proposee');
  const r = s.reponse || {};
  const interesse = r.choix === 'interesse';
  const decline = r.choix === 'pas-interesse';
  const demande = r.demande ? (d.tickets || []).find((t) => t.id === r.demande) : null;
  const jalon = s.jalon ? (d.jalons || []).find((j) => j.id === s.jalon) : null;
  const famille = FAMILLES_SUGGESTION[s.famille] || FAMILLES_SUGGESTION.developpement;
  const nbVues = Object.keys(s.vues || {}).length;

  const m = modale({
    titre: s.titre,
    sousTitre: [famille.court, (STATUTS_SUGGESTION[s.statut || 'proposee'] || {})[equipe ? 'libelle' : 'client']].filter(Boolean).join(' · '),
    feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px;gap:6px">${equipe ? pastille(PUBLICATIONS_SUGGESTION, estPubliee(s) ? 'publiee' : 'brouillon') : ''}${pastilleEtat(s, equipe)}${plateformes.map((p) => pucePlateforme(p)).join('')}${equipe && s.aLaUne ? '<span class="etiquette">À la une</span>' : ''}</div>
      ${visuelHtml(s, { grand: true })}
      ${s.resume ? `<p class="t-corps-fort" style="margin-top:${s.visuel ? '16px' : '0'}">${echapper(s.resume)}</p>` : ''}
      ${s.texte ? `<div class="prose t-corps sugg-texte" style="margin-top:12px">${enMarkdown(s.texte)}</div>` : (s.resume ? '' : '<p class="t-petit t-3">Pas encore de description.</p>')}
      ${s.benefice ? `<div style="margin-top:20px">${encart(`<strong>Ce que vous y gagnez</strong><div class="prose" style="margin-top:6px">${enParagraphes(s.benefice)}</div>`, 'ok', 'trend')}</div>` : ''}
      <dl class="faits" style="margin-top:20px">
        ${fait('Durée estimée', echapper(s.duree || ''))}
        ${fait('Prix', prixTexte(s) ? echapper(prixTexte(s)) : '')}
        ${fait('Devis', devis ? `<a href="#/finances/${echapper(devis.id)}" data-voir-devis>${echapper(devis.numero || 'Devis')}</a>${devis.libelle ? ` <span class="t-3">· ${echapper(devis.libelle)}</span>` : ''} ${pastille(STATUTS_DEVIS, devis.statut || 'brouillon')}` : (s.devis && !equipe ? '<span class="t-3">Un devis accompagne cette suggestion : le responsable du projet le trouve dans « Devis et factures ».</span>' : ''))}
        ${fait(equipe ? 'Côté client' : 'Votre réponse', r.choix ? (interesse
    ? `${equipe ? `${echapper(r.nom || 'Le client')} s'y intéresse` : 'Ça vous intéresse'}${r.le ? ` depuis le ${echapper(dateCourte(r.le))}` : ''}${demande ? ` · <a href="#/projets/${echapper(pid)}/demandes/${echapper(demande.id)}">${echapper(demande.numero || 'voir la demande')}</a>` : ''}`
    : `${equipe ? `${echapper(r.nom || 'Le client')} a décliné` : 'Pas pour le moment'}${r.le ? ` · ${echapper(dateHeure(r.le))}` : ''}${r.raison ? `<br><span class="t-3">« ${echapper(r.raison)} »</span>` : ''}`) : '')}
        ${equipe ? fait('Feuille de route', jalon ? `<a href="#/projets/${echapper(pid)}/etapes">${echapper(jalon.titre)}</a>` : '') : ''}
        ${equipe ? fait('Publiée le', s.publieLe ? echapper(dateCourte(s.publieLe)) : '') : ''}
        ${equipe ? fait('Vue par le client', nbVues ? echapper(pluriel(nbVues, 'personne')) : '') : ''}
      </dl>
      ${!equipe && s.statut === 'acceptee' ? `<div style="margin-top:20px">${encart('<strong>C\'est décidé.</strong> Cette amélioration a sa place dans la feuille de route : vous la suivez comme les autres étapes.', 'ok', 'check')}</div>` : ''}
      ${!equipe && s.statut === 'livree' ? `<div style="margin-top:20px">${encart('<strong>C\'est dans votre application.</strong> Cette amélioration est livrée.', 'ok', 'check')}</div>` : ''}
      ${!equipe && interesse && s.statut === 'a-l-etude' ? `<div style="margin-top:20px">${encart(`<strong>Nous revenons vers vous.</strong> Une demande est ouverte à votre nom${demande ? ` (<a href="#/projets/${echapper(pid)}/demandes/${echapper(demande.id)}">${echapper(demande.numero || 'la voir')}</a>)` : ''} : c'est là que la suite se passe, devis compris.`, 'info', 'info')}</div>` : ''}`,
    pied: equipe
      ? `<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button><button class="btn btn-principal" type="button" data-editer>Modifier</button>`
      : `${peutAgir && !decline ? '<button class="btn btn-doux" type="button" data-pas-interesse>Pas intéressé</button>' : ''}${peutAgir && decline ? '<button class="btn btn-doux" type="button" data-revenir>Revenir sur mon choix</button>' : ''}<button class="btn btn-secondaire" type="button" data-question>${icone('messages')} Poser une question</button><span class="pousse"></span>${devis && devis.fichier && devis.fichier.chemin ? `<button class="btn btn-secondaire" type="button" data-telecharger-devis>${icone('telecharger')} Le devis</button>` : ''}${peutAgir && !interesse ? `<button class="btn btn-principal" type="button" data-interesse>${icone('check')} Ça m'intéresse</button>` : '<button class="btn btn-principal" type="button" data-fermer>Fermer</button>'}`,
  });
  brancherPieces(m.el);
  sur(m.el, 'click', '[data-editer]', () => { m.fermer(); editer('suggestion', env, { pid, fiche: s }); });
  sur(m.el, 'click', '[data-suppr]', async () => { const ok = await supprimer('suggestion', env, { pid, fiche: s, libelle: 'cette suggestion' }); if (ok) m.fermer(); });
  sur(m.el, 'click', '[data-question]', () => { m.fermer(); ouvrirBulle(pid, `À propos de la suggestion « ${s.titre} » : `); });
  sur(m.el, 'click', '[data-voir-devis]', () => m.fermer());
  sur(m.el, 'click', '[data-telecharger-devis]', (el) => agir(el, () => telechargerPiece(devis)));
  sur(m.el, 'click', '[data-interesse]', async (el) => { const ok = await interesser(s, d, { pid, env }, el); if (ok) m.fermer(true); });
  sur(m.el, 'click', '[data-pas-interesse]', () => { m.fermer(); declinerSuggestion(s, { pid, env }); });
  sur(m.el, 'click', '[data-revenir]', (el) => agir(el, () => ecrire.retirerReponseSuggestion(pid, s.id), 'Votre choix est effacé : la suggestion est de nouveau proposée.').then((ok) => { if (ok) m.fermer(true); }));
  return m.fin;
};

/* ==========================================================================
   Les gestes du client
   ========================================================================== */

/* « Ça m'intéresse » : une demande naît à son nom, liée à la suggestion,
   et la suggestion passe à l'étude. Deux écritures, la demande d'abord :
   si la seconde échoue, la demande existe et l'équipe la voit quand même. */
const interesser = async (s, d, { pid, env }, bouton) => {
  const ok = await confirmer({
    titre: 'Ça vous intéresse ?',
    texte: `Nous ouvrons une demande « ${s.titre} » à votre nom. Vous la suivez dans Demandes, et nous revenons vers vous${s.devis ? ' avec le devis' : ''}. Rien n'est engagé sans votre accord.`,
    ok: 'Oui, ça m\'intéresse',
  });
  if (!ok) return false;
  const plateforme = (s.plateformes || []).filter((p) => PLATEFORMES[p]);
  const composant = plateforme.length === 1 ? ((d.composants || []).find((c) => c.type === plateforme[0]) || {}).id || '' : '';
  const description = [`Je suis intéressé(e) par la suggestion « ${s.titre} ».`, s.resume || '', prixTexte(s) ? `Prix indiqué : ${prixTexte(s)}.` : ''].filter(Boolean).join('\n\n').slice(0, 6000);
  return agir(bouton, async () => {
    const tid = await ecrire.creerDemande(env.session, pid, {
      titre: `Suggestion : ${s.titre}`.slice(0, 120), description,
      type: (s.famille || 'developpement') === 'developpement' ? 'fonctionnalite' : 'demande',
      urgence: 'important', plateforme: plateforme.length === 1 ? plateforme[0] : '', composant, suggestion: s.id,
    });
    await ecrire.repondreSuggestion(env.session, pid, s.id, { choix: 'interesse', demande: tid });
  }, 'Merci. Une demande est ouverte à votre nom, nous revenons vers vous.');
};

/* « Pas intéressé » : une raison, si le client veut bien la dire. */
const declinerSuggestion = (s, { pid, env }) => {
  const m = modale({
    titre: 'Pas intéressé ?', sousTitre: s.titre,
    corps: `<p class="t-corps t-2">Dites-le nous, et un mot sur la raison nous aide à mieux viser la prochaine fois. Vous pourrez revenir sur ce choix.</p>
      <div class="groupe" style="margin-top:14px"><label class="etiquette-champ" for="raison-suggestion">Pourquoi <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="raison-suggestion" rows="3" maxlength="1000" placeholder="Pas la priorité en ce moment, trop cher, déjà prévu autrement."></textarea></div>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-decliner>Pas intéressé</button>',
  });
  sur(m.el, 'click', '[data-decliner]', async (el) => {
    const raison = (m.el.querySelector('#raison-suggestion') || { value: '' }).value.trim();
    const ok = await agir(el, () => ecrire.repondreSuggestion(env.session, pid, s.id, { choix: 'pas-interesse', raison }), 'C\'est noté. Merci de nous l\'avoir dit.');
    if (ok) m.fermer(true);
  });
};

/* ==========================================================================
   Les gestes de l'équipe
   ========================================================================== */

/* Monter ou descendre : on échange l'ordre avec la voisine de la même
   famille. Si les ordres se chevauchent ou manquent, la famille est
   d'abord renumérotée dans l'ordre affiché. */
const deplacer = async (pid, s, liste, sens) => {
  const famille = trierSuggestions(liste).filter((x) => (x.famille || 'developpement') === (s.famille || 'developpement'));
  const i = famille.findIndex((x) => x.id === s.id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= famille.length) return;
  const ordres = famille.map((x) => Number(x.ordre) || 0);
  const propres = ordres.every((o, k) => o > 0 && (k === 0 || o > ordres[k - 1]));
  const a = propres ? ordres[i] : i + 1;
  const b = propres ? ordres[j] : j + 1;
  if (!propres) await Promise.all(famille.map((x, k) => (k === i || k === j ? null : ecrire.majSuggestion(pid, x.id, { ordre: k + 1 }))).filter(Boolean));
  await Promise.all([ecrire.majSuggestion(pid, famille[i].id, { ordre: b }), ecrire.majSuggestion(pid, famille[j].id, { ordre: a })]);
};

/* Changer l'état : les six états, l'actuel marqué. Passer « acceptée »
   propose de poser l'étape dans la feuille de route. */
const changerEtat = (s, d, { pid, env }, ancre) => menu(ancre, [
  { titre: 'État' },
  ...Object.entries(STATUTS_SUGGESTION).map(([cle, f]) => ({
    cle, libelle: `${f.libelle}${cle === (s.statut || 'proposee') ? '  ·  actuel' : ''}`,
    action: async () => {
      if (cle === (s.statut || 'proposee')) return;
      const ok = await agir(null, () => ecrire.majSuggestion(pid, s.id, { statut: cle }), `Suggestion ${f.libelle.toLowerCase()}.`);
      if (ok && cle === 'acceptee' && !s.jalon) await proposerEtapeDepuisSuggestion(env, { pid, fiche: { ...s, statut: cle }, jalons: d.jalons || [] });
    },
  })),
]);

const dupliquer = async (s, d, { pid }) => {
  const ok = await confirmer({ titre: 'Dupliquer cette suggestion ?', texte: 'La copie naît en brouillon, sans le visuel ni la réponse du client : vous la retouchez avant de la publier.', ok: 'Dupliquer' });
  if (!ok) return;
  await agir(null, () => ecrire.creerSuggestion(pid, {
    ...s, titre: `${s.titre} (copie)`.slice(0, 160), publication: 'brouillon', statut: 'proposee', aLaUne: false, visuel: null,
    ordre: (d.suggestions || []).length + 1,
  }), 'Copie créée, en brouillon.');
};

/** Le geste d'un bouton [data-action] de l'onglet ou de l'aperçu. Rend vrai s'il l'a pris. */
export const gesteSuggestion = async (el, d, { pid, env }) => {
  const action = el.dataset.action || '';
  if (!/^(ouvrir-suggestion|suggestion-|menu-suggestion)/.test(action)) return false;
  const equipe = env.role === 'equipe';
  const s = (d.suggestions || []).find((x) => x.id === el.dataset.id);
  if (!s) return true;
  if (action === 'ouvrir-suggestion') { ouvrirSuggestion(s, d, { pid, env }); return true; }
  if (action === 'suggestion-interesse') { await interesser(s, d, { pid, env }, el); return true; }
  if (!equipe) return true;
  if (action === 'suggestion-publier') {
    const oui = !estPubliee(s);
    if (oui && !s.titre) { toast('Donnez un titre avant de publier.', 'erreur'); return true; }
    await agir(el, () => ecrire.publierSuggestion(pid, s.id, oui), oui ? 'Suggestion publiée : le client la voit.' : 'Suggestion dépubliée : le client ne la voit plus.');
    return true;
  }
  if (action === 'suggestion-monter' || action === 'suggestion-descendre') {
    await agir(el, () => deplacer(pid, s, d.suggestions || [], action === 'suggestion-monter' ? -1 : 1));
    return true;
  }
  if (action === 'menu-suggestion') {
    menu(el, [
      { libelle: 'Modifier', icone: 'edit', action: () => editer('suggestion', env, { pid, fiche: s }) },
      { libelle: 'Dupliquer', icone: 'copier', action: () => dupliquer(s, d, { pid }) },
      { libelle: 'Changer l\'état', icone: 'drapeau', action: () => changerEtat(s, d, { pid, env }, el) },
      { libelle: s.aLaUne ? 'Retirer de la une' : 'Mettre à la une', icone: 'etincelle', action: () => agir(null, () => ecrire.majSuggestion(pid, s.id, { aLaUne: !s.aLaUne }), s.aLaUne ? 'Retirée de la une.' : 'À la une sur l\'aperçu du client.') },
      ...(s.statut === 'acceptee' && !s.jalon ? [{ libelle: 'Poser l\'étape dans la feuille de route', icone: 'route', action: () => proposerEtapeDepuisSuggestion(env, { pid, fiche: s, jalons: d.jalons || [] }) }] : []),
      '-',
      ...(s.statut !== 'retiree' ? [{ libelle: 'Retirer', icone: 'archive', action: async () => { if (await confirmer({ titre: 'Retirer cette suggestion ?', texte: 'Elle passe « retirée » : le client la voit encore, grisée, et ne peut plus y répondre. Dépubliez-la pour la cacher.', ok: 'Retirer' })) agir(null, () => ecrire.majSuggestion(pid, s.id, { statut: 'retiree', aLaUne: false }), 'Suggestion retirée.'); } }] : []),
      { libelle: 'Supprimer', icone: 'corbeille', danger: true, action: () => supprimer('suggestion', env, { pid, fiche: s, libelle: 'cette suggestion' }) },
    ]);
    return true;
  }
  return true;
};

/* La marque « vue » : quand le client ouvre l'onglet, chaque suggestion
   publiée qu'il n'avait pas vue reçoit sa marque. Une fois par fiche et
   par page : l'écriture fait revenir la donnée, pas une seconde écriture. */
const marquees = new Set();
export const marquerVues = (d, { pid, env }) => {
  if (env.role === 'equipe') return;
  const uid = env.session.utilisateur.uid;
  for (const s of suggestionsNonVues(d.suggestions || [], uid)) {
    const cle = `${pid}:${s.id}`;
    if (marquees.has(cle)) continue;
    marquees.add(cle);
    ecrire.marquerSuggestionVue(uid, pid, s.id).catch(() => marquees.delete(cle));
  }
};
