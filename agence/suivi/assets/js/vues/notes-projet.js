/* ==========================================================================
   CAPMEDIA CLIENT HUB · la page Notes d'un projet (#/projets/<p>/notes)

   L'ancienne page « Décisions », refaite en trois blocs, dans l'ordre où
   on les lit :

   1. À valider : des propositions, écrites par l'équipe (Cockpit) ou par
      un membre du projet. Le responsable du projet coche : la proposition
      devient une décision, datée par le serveur, à son nom. Il peut aussi
      la refuser, avec un mot. L'équipe est prévenue par la conversation du
      projet (hubMessageProjet) ; le client l'est d'une proposition de
      l'équipe (hubNoteCreee). Un collaborateur propose, il ne valide pas :
      les règles le refusent (notes, reponseDuResponsable).
   2. Décisions : ce qui est acté. Les décisions consignées par l'équipe
      (type « decision ») y sont reprises telles quelles, avec les
      propositions validées : date et origine sur chacune.
   3. Notes et idées : le carnet du client réduit à ce projet (privé par
      défaut, partageable avec Capmedia, vues/notes-client.js), et une
      idée passe dans « À valider » d'un geste. Les notes de l'équipe
      (information, risque, réunion) y sont aussi, signées Capmedia.

   Côté Cockpit, la même page : l'équipe propose, rédige, corrige et
   retire ; elle lit les notes que le client a partagées, jamais les
   privées. Une seule fonction de dessin, passée à magasin.dessinateur.
   ========================================================================== */

import { echapper, avecLiens, dateCourte, enDate, estResponsable, pluriel, TYPES_NOTE } from '../noyau.js';
import { icone, pastille, vide, modale, confirmer, toast, sur, menu, agir, squelette, titrePage } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, abonnerProjet, notesPartageesDuProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { monterNotesClient, notesPartageesHtml, gesteNoteDemande } from './notes-client.js';
import { editer, supprimer } from './editeurs.js';

const LIMITE_TITRE = 160;
const LIMITE_TEXTE = 4000;
const LIMITE_MOTIF = 1000;

/* Ce qu'est une note, pour cette page. */
const aValider = (n) => n.etat === 'a-valider';
const estDecision = (n) => n.etat === 'validee' || (!n.etat && n.type === 'decision');
const estRefusee = (n) => n.etat === 'refusee';
/* Le reste : les notes de l'équipe (information, idée, risque, réunion). */
const estNoteEquipe = (n) => !n.etat && n.type !== 'decision' && n.type !== 'proposition';

const temps = (v) => { const d = enDate(v); return d ? d.getTime() : 0; };
/* Une date posée par le serveur arrive un instant après l'écriture : en
   attendant, on dit « à l'instant », jamais une case vide. */
const le = (v) => { const t = dateCourte(v); return t ? `le ${t}` : 'à l\'instant'; };

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  const { session } = env;
  const equipe = env.role === 'equipe';
  const moi = session.utilisateur.uid;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  abonnerProjet(lot, pid, env.role);

  const cles = [K.projet(pid), K.notes(pid), K.equipe,
    ...(equipe ? [K.interlocuteurs(pid), K.notesPartagees] : [K.notesClient, K.projets])];

  const lireProjet = () => magasin.lire(K.projet(pid));
  const notes = () => magasin.lire(K.notes(pid)) || [];
  const trouver = (id) => notes().find((n) => n.id === id) || null;
  const responsable = () => !equipe && Boolean(lireProjet() && estResponsable(session, lireProjet()));

  /* Un nom, retrouvé par uid dans l'annuaire du projet (personnesClient,
     les interlocuteurs côté équipe) ou celui de l'équipe : jamais le champ
     « nom » qu'une personne a pu écrire elle-même. */
  const nomDe = (uid) => {
    if (!uid) return '';
    if (!equipe && uid === moi) return 'vous';
    const projet = lireProjet() || {};
    const client = [...(Array.isArray(projet.personnesClient) ? projet.personnesClient : []), ...(magasin.lire(K.interlocuteurs(pid)) || [])]
      .find((x) => x && x.uid === uid && x.nom);
    if (client) return client.nom;
    const membre = (magasin.lire(K.equipe) || []).find((x) => x && x.id === uid && x.nom);
    return membre ? membre.nom : '';
  };
  const nomResponsable = () => {
    const roles = (lireProjet() || {}).roles || {};
    const uid = Object.keys(roles).find((u) => roles[u] === 'responsable');
    return uid && uid !== moi ? nomDe(uid) : '';
  };

  /* Qui a proposé : Capmedia, ou une personne du projet. */
  const proposeePar = (n) => {
    const uid = (n.par || {}).uid;
    if (n.origine === 'client') return `Proposée par ${nomDe(uid) || 'un membre du projet'}`;
    const nom = nomDe(uid);
    return `Proposée par ${nom ? `${nom}, Capmedia` : 'Capmedia'}`;
  };

  /* --- Le carnet du client, réduit à ce projet ------------------------- */
  const proposerIdee = async (n, bouton) => {
    const texte = String(n.texte || '').trim();
    if (!texte) return;
    const premiere = texte.split('\n')[0].trim();
    const titre = premiere.length > LIMITE_TITRE - 1 ? `${premiere.slice(0, LIMITE_TITRE - 2).trim()}…` : premiere;
    const contenu = texte === titre ? '' : texte.slice(0, LIMITE_TEXTE);
    await agir(bouton, () => ecrire.proposerIdee(session, n, pid, { titre, contenu }), 'Idée proposée : elle attend la validation, dans « À valider ».');
  };
  const carnet = equipe ? null : monterNotesClient(sortie, env, { projet: pid, proposer: proposerIdee });

  /* Ce qui reste ouvert d'un dessin à l'autre : la liste des refusées. */
  let refuseesOuvertes = false;

  /* --- Le dessin -------------------------------------------------------- */

  const gestesEquipe = (n, { decision = false } = {}) => `<span class="notes-gestes">
    <button class="btn btn-fantome btn-petit" type="button" data-notes-geste="${decision ? 'editer-decision' : 'editer'}" data-id="${echapper(n.id)}">Modifier</button>
    <button class="btn-icone" type="button" data-notes-geste="menu" data-id="${echapper(n.id)}" aria-label="Plus d'actions" data-astuce="Retirer">${icone('points')}</button>
  </span>`;

  const uneProposition = (n) => {
    const peut = responsable();
    const mienne = !equipe && n.origine === 'client' && (n.par || {}).uid === moi;
    const libelle = `Valider « ${n.titre || ''} »`;
    return `<article class="proposition${equipe ? ' proposition--sans-coche' : ''}" data-proposition="${echapper(n.id)}">
      ${equipe ? '' : `<label class="proposition-coche"${peut ? '' : ' data-astuce="Seul le responsable du projet valide"'}>
        <input type="checkbox" data-valider="${echapper(n.id)}" aria-label="${echapper(libelle)}"${peut ? '' : ' disabled'}>
      </label>`}
      <div class="proposition-corps">
        <p class="proposition-titre">${echapper(n.titre || '')}</p>
        ${n.contenu ? `<div class="proposition-texte">${avecLiens(n.contenu)}</div>` : ''}
        <div class="notes-meta">
          <span>${echapper(proposeePar(n))} ${echapper(le(n.cree || n.date))}</span>
          ${equipe ? '<span class="notes-attente">En attente du client</span>' : ''}
          ${equipe ? gestesEquipe(n) : `<span class="notes-gestes">
            ${peut ? `<button class="btn btn-fantome btn-petit" type="button" data-notes-geste="refuser" data-id="${echapper(n.id)}">Refuser</button>` : ''}
            ${mienne ? `<button class="btn btn-fantome btn-petit" type="button" data-notes-geste="retirer" data-id="${echapper(n.id)}">Retirer</button>` : ''}
          </span>`}
        </div>
      </div>
    </article>`;
  };

  const uneRefusee = (n) => {
    const r = n.reponse || {};
    return `<article class="decision decision--refusee" data-refusee="${echapper(n.id)}">
      <p class="decision-titre">${echapper(n.titre || '')}</p>
      ${r.motif ? `<p class="decision-motif">${echapper(r.motif)}</p>` : ''}
      <div class="notes-meta">
        <span>Refusée par ${echapper(nomDe(r.par) || 'le responsable')} ${echapper(le(r.date))}</span>
        <span>${echapper(proposeePar(n))}</span>
        ${equipe ? gestesEquipe(n) : ''}
      </div>
    </article>`;
  };

  const uneDecision = (n) => {
    const r = n.reponse || {};
    const validee = n.etat === 'validee';
    const origine = validee
      ? `Validée par ${nomDe(r.par) || 'le responsable'} ${le(r.date)}`
      : `Consignée par Capmedia ${le(n.date)}`;
    return `<article class="decision" data-decision="${echapper(n.id)}">
      <p class="decision-titre">${echapper(n.titre || '')}</p>
      ${n.contenu ? `<div class="decision-texte">${avecLiens(n.contenu)}</div>` : ''}
      ${n.impact ? `<p class="decision-texte"><span class="t-3">Impact :</span> ${echapper(n.impact)}</p>` : ''}
      <div class="notes-meta">
        <span class="notes-origine">${echapper(origine)}</span>
        ${validee ? `<span>${echapper(proposeePar(n))}</span>` : ''}
        ${n.decidePar ? `<span>Décidé par ${echapper(n.decidePar)}</span>` : ''}
        ${equipe && n.visibilite === 'interne' ? '<span>Interne</span>' : ''}
        ${equipe ? gestesEquipe(n, { decision: true }) : ''}
      </div>
    </article>`;
  };

  const uneNoteEquipe = (n) => `<article class="decision" data-note-equipe="${echapper(n.id)}">
    <p class="decision-titre">${echapper(n.titre || '')}</p>
    ${n.contenu ? `<div class="decision-texte">${avecLiens(n.contenu)}</div>` : ''}
    <div class="notes-meta">
      ${pastille(TYPES_NOTE, n.type || 'information')}
      <span>Capmedia ${echapper(le(n.date))}</span>
      ${equipe && n.visibilite === 'interne' ? '<span>Interne</span>' : ''}
      ${equipe ? gestesEquipe(n, { decision: true }) : ''}
    </div>
  </article>`;

  const rendre = () => {
    const projet = lireProjet();
    if (projet === undefined && !magasin.erreur(K.projet(pid))) return;
    if (!projet) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: "Il a peut-être été archivé, ou vous n'y avez plus accès.", action: `<a class="btn btn-secondaire" href="#/">Retour à l'accueil</a>` })}</div>`;
      return;
    }
    titrePage(`Notes · ${projet.nom || 'Projet'}`);
    filAriane([{ libelle: equipe ? 'Projets' : 'Accueil', chemin: equipe ? '/projets' : '/' }, { libelle: projet.nom || 'Projet', chemin: `/projets/${pid}` }, { libelle: 'Notes' }]);

    const toutes = notes();
    const attente = toutes.filter(aValider).sort((a, b) => temps(a.cree || a.date) - temps(b.cree || b.date));
    const decisions = toutes.filter(estDecision)
      .sort((a, b) => temps(b.etat === 'validee' ? (b.reponse || {}).date || b.maj : b.date) - temps(a.etat === 'validee' ? (a.reponse || {}).date || a.maj : a.date));
    const refusees = toutes.filter(estRefusee).sort((a, b) => temps((b.reponse || {}).date || b.maj) - temps((a.reponse || {}).date || a.maj));
    const notesEquipe = toutes.filter(estNoteEquipe).sort((a, b) => temps(b.date) - temps(a.date));
    const partagees = equipe ? notesPartageesDuProjet(pid) : [];
    const peut = responsable();
    const qui = nomResponsable();

    const explication = equipe
      ? 'Proposez ce que le client doit trancher : son responsable coche pour valider, la proposition devient une décision datée à son nom. Il peut aussi refuser, avec un mot. Vous êtes prévenus dans la conversation du projet.'
      : peut
        ? 'Cochez une proposition pour la valider : elle devient une décision du projet, datée et à votre nom. Vous pouvez aussi la refuser en disant pourquoi. Capmedia est prévenu.'
        : `Le responsable du projet${qui ? `, ${qui},` : ''} valide ou refuse ces propositions. Vous pouvez en proposer.`;

    sortie.innerHTML = `<div class="page page-notes">
      <header class="page-tete">
        <div>
          <p class="surtitre">${echapper(projet.nom || '')}</p>
          <h1>Notes</h1>
          <p class="chapo">Ce qui attend une validation, ce qui est décidé, et les notes et idées du projet.</p>
        </div>
      </header>

      <section class="section" id="a-valider" aria-label="À valider" style="margin-top:0">
        <div class="section-tete"><h2>À valider${attente.length ? ` <span class="compte-section compte-section--vif">${attente.length}</span>` : ''}</h2>
          <button class="btn btn-secondaire btn-petit" type="button" data-notes-geste="proposer">${icone('plus')} Proposer</button>
        </div>
        <p class="t-petit t-2 notes-explication">${echapper(explication)}</p>
        ${attente.length ? `<div class="notes-pile">${attente.map(uneProposition).join('')}</div>`
          : vide({ icone: 'valider', titre: 'Rien à valider', texte: equipe ? 'Une proposition apparaîtra ici dès qu\'elle sera faite.' : 'Les propositions de Capmedia et les idées proposées par votre équipe apparaîtront ici.', compact: true })}
        ${refusees.length ? `<details class="notes-refusees" data-refusees${refuseesOuvertes ? ' open' : ''}>
          <summary>${echapper(pluriel(refusees.length, 'proposition refusée', 'propositions refusées'))}</summary>
          <div class="notes-pile">${refusees.map(uneRefusee).join('')}</div>
        </details>` : ''}
      </section>

      <section class="section" id="decisions" aria-label="Décisions">
        <div class="section-tete"><h2>Décisions${decisions.length ? ` <span class="compte-section">${decisions.length}</span>` : ''}</h2>
          ${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-notes-geste="consigner">${icone('plus')} Consigner une décision</button>` : ''}
        </div>
        ${decisions.length ? `<div class="notes-pile">${decisions.map(uneDecision).join('')}</div>`
          : vide({ icone: 'note', titre: 'Aucune décision pour l\'instant', texte: 'Une proposition validée devient une décision, datée, et reste ici.', compact: true })}
      </section>

      <section class="section" id="notes-et-idees" aria-label="Notes et idées">
        <div class="section-tete"><h2>Notes et idées</h2>
          ${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-notes-geste="noter">${icone('plus')} Nouvelle note</button>` : ''}
        </div>
        ${carnet ? carnet.html() : ''}
        ${equipe ? `<div class="notes-client-partagees">
          <p class="surtitre">Partagées par le client</p>
          ${partagees.length
            ? `<p class="t-petit t-2 notes-explication">Ses autres notes restent privées : vous ne les voyez pas. Celles-ci sont aussi dans la conversation du projet.</p>${notesPartageesHtml(partagees, { nu: true, limite: 50 })}`
            : '<p class="t-petit t-2 notes-explication">Les notes du client restent privées. Celles qu\'il partage avec Capmedia apparaîtront ici.</p>'}
        </div>` : ''}
        ${notesEquipe.length ? `<div class="notes-capmedia">
          <p class="surtitre">De la part de Capmedia</p>
          <div class="notes-pile">${notesEquipe.map(uneNoteEquipe).join('')}</div>
        </div>` : ''}
      </section>
    </div>`;
    if (carnet) carnet.apres();
  };

  /* --- Les gestes ------------------------------------------------------- */

  /* Proposer, ou corriger une proposition (équipe) : un titre, un détail. */
  const formeProposition = async (n = null) => {
    const m = modale({
      titre: n ? 'Modifier la proposition' : 'Proposer à la validation',
      sousTitre: equipe ? 'Le responsable du projet la valide ou la refuse.' : 'Le responsable du projet la valide ou la refuse. Capmedia la voit aussitôt.',
      corps: `<div class="groupe"><label class="etiquette-champ" for="prop-titre">Ce qui est proposé</label>
          <input class="champ" id="prop-titre" maxlength="${LIMITE_TITRE}" value="${echapper(n ? n.titre || '' : '')}" placeholder="Garder la connexion par e-mail seule pour la version 1"></div>
        <div class="groupe" style="margin-top:14px"><label class="etiquette-champ" for="prop-texte">Le détail <span class="t-3">(facultatif)</span></label>
          <textarea class="zone" id="prop-texte" rows="4" maxlength="${LIMITE_TEXTE}" placeholder="Pourquoi, ce que cela change">${echapper(n ? n.contenu || '' : '')}</textarea></div>`,
      pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-prop-ok>${n ? 'Enregistrer' : 'Proposer'}</button>`,
    });
    m.el.querySelector('[data-prop-ok]').addEventListener('click', async (ev) => {
      const titre = m.el.querySelector('#prop-titre').value.trim();
      const contenu = m.el.querySelector('#prop-texte').value.trim();
      if (!titre) { toast('Dites en une phrase ce qui est proposé.', 'erreur'); return; }
      const action = n
        ? () => ecrire.majNote(n.id, { titre, contenu })
        : equipe
          ? () => ecrire.creerNote(session, pid, { type: 'proposition', titre, contenu })
          : () => ecrire.proposerAValider(session, pid, { titre, contenu });
      const ok = await agir(ev.currentTarget, action, n ? 'Proposition modifiée.' : 'Proposition envoyée : elle attend la validation.');
      if (ok) m.fermer(true);
    });
    await m.fin;
  };

  const refuser = async (n) => {
    const m = modale({
      titre: 'Refuser cette proposition ?',
      corps: `<p class="t-corps"><strong>${echapper(n.titre || '')}</strong></p>
        <div class="groupe" style="margin-top:14px"><label class="etiquette-champ" for="refus-motif">Un mot pour Capmedia</label>
          <textarea class="zone" id="refus-motif" rows="3" maxlength="${LIMITE_MOTIF}" placeholder="Ce qui ne va pas, ce que vous préféreriez"></textarea></div>
        <p class="t-petit t-3" style="margin-top:10px">La proposition reste visible, marquée refusée, avec votre mot.</p>`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-danger" type="button" data-refus-ok>Refuser</button>',
    });
    m.el.querySelector('[data-refus-ok]').addEventListener('click', async (ev) => {
      const motif = m.el.querySelector('#refus-motif').value.trim();
      if (!motif) { toast('Dites en un mot pourquoi : Capmedia saura quoi proposer d\'autre.', 'erreur'); return; }
      const ok = await agir(ev.currentTarget, () => ecrire.repondreProposition(session, n, { valider: false, motif }), 'Proposition refusée. Capmedia est prévenu.');
      if (ok) m.fermer(true);
    });
    await m.fin;
  };

  const valider = async (el) => {
    const n = trouver(el.dataset.valider);
    if (!n || !el.checked) return;
    const ok = await confirmer({
      titre: 'Valider cette proposition ?',
      texte: `« ${n.titre || ''} » devient une décision du projet, datée d'aujourd'hui et à votre nom. Capmedia est prévenu.`,
      ok: 'Valider',
    });
    if (!ok) { el.checked = false; return; }
    el.disabled = true;
    const fait = await agir(null, () => ecrire.repondreProposition(session, n, { valider: true }), 'Validé : c\'est une décision du projet.');
    if (!fait && el.isConnected) { el.checked = false; el.disabled = false; }
  };

  const retirer = async (n) => {
    const ok = await confirmer({
      titre: 'Retirer cette proposition ?',
      texte: equipe ? 'Elle disparaît de la page Notes, pour le client aussi.' : 'Elle disparaît de « À valider ». Le message déjà posté dans la conversation reste.',
      ok: 'Retirer', danger: true,
    });
    if (ok) await agir(null, () => ecrire.retirerProposition(n.id), 'Proposition retirée.');
  };

  const retraits = [];
  retraits.push(sur(sortie, 'click', '[data-notes-geste]', (el) => {
    const geste = el.dataset.notesGeste;
    if (geste === 'proposer') { formeProposition(); return; }
    if (geste === 'consigner') { editer('note', env, { pid, defaut: { type: 'decision' } }); return; }
    if (geste === 'noter') { editer('note', env, { pid, defaut: { type: 'information' } }); return; }
    const n = trouver(el.dataset.id);
    if (!n) return;
    if (geste === 'refuser') refuser(n);
    else if (geste === 'retirer') retirer(n);
    else if (geste === 'editer') formeProposition(n);
    else if (geste === 'editer-decision') editer('note', env, { pid, fiche: n });
    else if (geste === 'menu') {
      menu(el, [
        { libelle: aValider(n) ? 'Retirer la proposition' : 'Supprimer', icone: 'corbeille', danger: true,
          action: () => (aValider(n) ? retirer(n) : supprimer('note', env, { pid, fiche: n, libelle: estDecision(n) ? 'cette décision' : 'cette note' })) },
      ]);
    }
  }));
  retraits.push(sur(sortie, 'change', '[data-valider]', (el) => { valider(el); }));
  /* « toggle » ne remonte pas : on l'écoute à la capture. */
  const surToggle = (ev) => { if (ev.target && ev.target.matches && ev.target.matches('[data-refusees]')) refuseesOuvertes = ev.target.open; };
  sortie.addEventListener('toggle', surToggle, true);
  if (equipe) retraits.push(gesteNoteDemande(sortie, () => notesPartageesDuProjet(pid)));

  /* Un seul dessin par tour, et pas de redessin quand rien n'a changé :
     un instantané identique ne refait pas la page (le carnet garde son
     curseur). */
  let derniere = '';
  const dessiner = () => {
    const empreinte = `${magasin.empreinte(cles)}|${responsable() ? 'r' : ''}`;
    if (empreinte === derniere && sortie.querySelector('.page-notes')) return;
    derniere = empreinte;
    rendre();
  };
  const planifier = magasin.dessinateur(dessiner, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();

  return () => {
    planifier.arreter();
    retraits.splice(0).forEach((r) => r());
    sortie.removeEventListener('toggle', surToggle, true);
    if (carnet) carnet.fin();
    lot.fin();
  };
};
