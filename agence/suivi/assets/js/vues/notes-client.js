/* ==========================================================================
   « Vos notes » : le carnet du client, sur son accueil.

   Des idées, des remarques, notées à la volée, sans titre. Chaque note est
   privée : personne d'autre ne la lit, pas même Capmedia (les règles le
   garantissent : suivi/firestore.rules, notesClient). Le client peut la
   partager avec Capmedia : l'équipe la voit alors dans le Cockpit (accueil
   et aperçu du projet) et son texte part dans la conversation du projet,
   pour qu'on en parle. Il peut la reprendre : elle redevient privée ; le
   message déjà envoyé, lui, reste.

   Le bloc ne se dessine pas seul : la page l'appelle à chaque dessin
   (`html()` dans son gabarit, `apres()` une fois posé), pour qu'un
   changement de donnée ne coûte qu'un dessin. Ce qui est en train d'être
   écrit (le brouillon, la note en cours de modification, le curseur) vit
   ici et survit au redessin de la page.

     const notes = monterNotesClient(sortie, env);
     ... `${notes.html()}` ... ; notes.apres();
     fin : notes.fin();

   Sur la page Notes d'un projet, le même carnet, réduit à ce projet :
   monterNotesClient(sortie, env, { projet, proposer }). La note y naît
   rattachée au projet, et chacune porte « Proposer à la validation »
   (`proposer(note)`), qui la fait passer dans « À valider ». L'accueil
   garde le carnet entier ; la page Notes est l'endroit complet d'un
   projet (ses notes, ses idées, ce qui attend, ce qui est décidé).
   ========================================================================== */

import { echapper, avecLiens, dateHeure, enDate } from '../noyau.js';
import { icone, modale, confirmer, menu, toast, sur, agir } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, trierNotes } from '../donnees.js';
import { demandeDepuisMessage } from '../bulle.js';

const LIMITE_TEXTE = 4000;

/* Une note modifiée plus d'une minute après sa naissance le dit. */
const modifiee = (n) => {
  const c = enDate(n.cree); const m = enDate(n.maj);
  return Boolean(c && m) && m.getTime() - c.getTime() > 60000;
};

export const monterNotesClient = (sortie, env, { projet: projetFixe = '', proposer = null } = {}) => {
  const { session } = env;
  /* L'identifiant du bloc : un par page, pour que le redessin local
     retrouve le sien. */
  const BLOC = projetFixe ? 'notes-idees' : 'vos-notes';
  const etat = {
    ouvert: false,          /* le champ « Noter une idée » est déplié */
    brouillon: '',          /* ce qui s'y écrit */
    projetChoisi: projetFixe, /* le projet rattaché à la note en cours d'écriture */
    edition: null,          /* { id, texte } : la note qu'on modifie en place */
    focus: null,            /* 'nouvelle' ou l'identifiant de la note en édition */
    curseur: null,          /* [début, fin] de la sélection, pour la reposer */
  };

  const projets = () => (magasin.lire(K.projets) || session.projets || []).filter((p) => p && !p.archive);
  const nomProjet = (pid) => ((projets().find((p) => p.id === pid) || {}).nom || '');
  const notes = () => trierNotes((magasin.lire(K.notesClient) || []).filter((n) => !projetFixe || n.projet === projetFixe));
  const trouver = (id) => notes().find((n) => n.id === id) || null;

  /* --- Le dessin --------------------------------------------------------- */

  const selecteurProjet = (nom, valeur) => {
    const liste = projets();
    if (!liste.length) return '';
    return `<select class="select" data-note-projet="${echapper(nom)}" aria-label="Projet rattaché">
      <option value=""${valeur ? '' : ' selected'}>Sans projet</option>
      ${liste.map((p) => `<option value="${echapper(p.id)}"${p.id === valeur ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}
    </select>`;
  };

  const forme = (cle, texte, projet, { nouvelle, verrouProjet = false }) => `
    <form class="notes-forme" data-note-forme="${echapper(cle)}" novalidate>
      <textarea class="zone" data-note-champ="${echapper(cle)}" rows="3" maxlength="${LIMITE_TEXTE}" placeholder="Une idée, une remarque, une question à ne pas oublier" aria-label="Votre note. Entrée enregistre, Maj+Entrée va à la ligne.">${echapper(texte)}</textarea>
      <div class="rang-espace notes-forme-pied">
        <div class="rang" style="gap:10px">
          ${projetFixe ? '' : (verrouProjet ? `<span class="t-micro t-2">${echapper(nomProjet(projet))}</span>` : selecteurProjet(cle, projet))}
          <span class="t-micro t-3">Entrée pour enregistrer, Maj+Entrée pour une nouvelle ligne.</span>
        </div>
        <div class="rang" style="gap:6px">
          <button class="btn btn-doux btn-petit" type="button" data-note-geste="annuler" data-note-cle="${echapper(cle)}">Annuler</button>
          <button class="btn btn-principal btn-petit" type="submit">${nouvelle ? 'Enregistrer' : 'Enregistrer la modification'}</button>
        </div>
      </div>
    </form>`;

  const uneNote = (n) => {
    const enEdition = etat.edition && etat.edition.id === n.id;
    const projet = n.projet ? nomProjet(n.projet) : '';
    return `<article class="note-client${n.epinglee ? ' note-client--epinglee' : ''}${n.partagee ? ' note-client--partagee' : ''}" data-note="${echapper(n.id)}">
      ${enEdition
        ? forme(n.id, etat.edition.texte, etat.edition.projet, { nouvelle: false, verrouProjet: Boolean(n.partagee) })
        : `<div class="note-client-texte">${avecLiens(n.texte || '')}</div>`}
      <div class="note-client-pied">
        <span class="note-client-etat">${n.partagee ? `${icone('utilisateurs')}Partagée avec Capmedia` : `${icone('cadenas')}Privée`}</span>
        ${n.epinglee ? `<span>${icone('pin')}Épinglée</span>` : ''}
        ${projet && !projetFixe ? `<a class="note-client-projet" href="#/projets/${echapper(n.projet)}/notes" data-astuce="Les notes, les idées et les décisions de ce projet">${echapper(projet)}</a>` : ''}
        <span>${echapper(dateHeure(n.cree))}${modifiee(n) ? ', modifiée' : ''}</span>
        ${enEdition ? '' : `<span class="note-client-gestes">
          ${n.partagee
            ? `<button class="btn btn-fantome btn-petit" type="button" data-note-geste="reprendre" data-note-id="${echapper(n.id)}">Reprendre</button>`
            : `<button class="btn btn-fantome btn-petit" type="button" data-note-geste="partager" data-note-id="${echapper(n.id)}">Partager avec Capmedia</button>`}
          ${proposer ? `<button class="btn btn-doux btn-petit" type="button" data-note-geste="proposer" data-note-id="${echapper(n.id)}" data-astuce="Elle quitte votre carnet et attend la validation du responsable du projet">Proposer à la validation</button>` : ''}
          <button class="btn-icone" type="button" data-note-geste="menu" data-note-id="${echapper(n.id)}" aria-label="Plus d'actions sur cette note" data-astuce="Modifier, épingler, supprimer">${icone('points')}</button>
        </span>`}
      </div>
    </article>`;
  };

  const html = () => {
    const liste = notes();
    if (projetFixe) {
      return `<div id="${BLOC}">
        <p class="t-petit t-2 notes-explication">Vos notes restent privées : personne d'autre ne les lit, pas même Capmedia. Partagez-en une pour qu'on en parle, ou proposez une idée à la validation : elle passe dans « À valider ».</p>
        <div class="notes-saisie">${etat.ouvert
          ? forme('nouvelle', etat.brouillon, projetFixe, { nouvelle: true })
          : `<button class="notes-amorce" type="button" data-note-geste="ouvrir">${icone('edit')}Noter une idée…</button>`}</div>
        ${liste.length ? `<div class="notes-liste">${liste.map(uneNote).join('')}</div>` : ''}
      </div>`;
    }
    return `<section class="section" id="${BLOC}" aria-label="Vos notes">
      <div class="section-tete"><h2>Vos notes${liste.length ? ` <span class="compte-section">${liste.length}</span>` : ''}</h2></div>
      <p class="t-petit t-2 notes-explication">Un carnet pour vous : ce que vous notez ici reste privé, personne d'autre ne le lit, pas même Capmedia. Vous choisissez, note par note, ce que vous partagez avec nous.</p>
      <div class="notes-saisie">${etat.ouvert
        ? forme('nouvelle', etat.brouillon, etat.projetChoisi, { nouvelle: true })
        : `<button class="notes-amorce" type="button" data-note-geste="ouvrir">${icone('edit')}Noter une idée…</button>`}</div>
      ${liste.length ? `<div class="notes-liste">${liste.map(uneNote).join('')}</div>` : ''}
    </section>`;
  };

  /* Après un dessin : le champ en cours d'écriture retrouve le clavier
     et son curseur, qu'il vienne d'être déplié ou que la page se soit
     redessinée pendant la frappe. */
  const apres = () => {
    if (!etat.focus) return;
    const champ = sortie.querySelector(`[data-note-champ="${CSS.escape(etat.focus)}"]`);
    if (!champ || document.activeElement === champ) return;
    champ.focus({ preventScroll: true });
    const fin = champ.value.length;
    const [a, b] = etat.curseur || [fin, fin];
    try { champ.setSelectionRange(Math.min(a, fin), Math.min(b, fin)); } catch (e) { /* champ sans sélection */ }
  };

  /* Un changement d'état local (déplier, modifier, annuler) redessine le
     bloc seul : la page n'a pas bougé, elle n'a pas à se refaire. */
  const redessiner = () => {
    const bloc = sortie.querySelector(`#${BLOC}`);
    if (!bloc) return;
    const neuf = document.createElement('div');
    neuf.innerHTML = html();
    bloc.replaceWith(neuf.firstElementChild);
    apres();
  };

  /* --- Les gestes ------------------------------------------------------- */

  const fermerNouvelle = () => { etat.ouvert = false; etat.brouillon = ''; etat.projetChoisi = projetFixe; if (etat.focus === 'nouvelle') { etat.focus = null; etat.curseur = null; } };
  const fermerEdition = () => { if (etat.edition && etat.focus === etat.edition.id) { etat.focus = null; etat.curseur = null; } etat.edition = null; };

  const enregistrerNouvelle = async (bouton) => {
    const texte = etat.brouillon.trim();
    if (!texte) { toast('Écrivez quelque chose d\'abord.', 'erreur'); return; }
    const projet = etat.projetChoisi;
    /* Le champ se referme avant l'écriture : la note qui arrive du
       magasin se dessine alors en un seul dessin, le champ déjà replié.
       Si l'écriture échoue, on rend au client ce qu'il avait écrit. */
    fermerNouvelle();
    const ok = await agir(bouton, () => ecrire.creerNoteClient(session, { texte, projet }), 'Note enregistrée.');
    if (!ok) { etat.ouvert = true; etat.brouillon = texte; etat.projetChoisi = projet; etat.focus = 'nouvelle'; redessiner(); }
  };

  const enregistrerEdition = async (bouton) => {
    const e = etat.edition;
    if (!e) return;
    const texte = e.texte.trim();
    if (!texte) { toast('Une note vide ne se garde pas : supprimez-la plutôt.', 'erreur'); return; }
    const n = trouver(e.id);
    const changements = { texte, projet: e.projet };
    fermerEdition();
    /* Partagée, une note reste rattachée à son projet : le rattachement
       ne se change qu'en la reprenant d'abord. */
    if (n && n.partagee) changements.projet = n.projet;
    const ok = await agir(bouton, () => ecrire.majNoteClient(e.id, changements), 'Note modifiée.');
    if (!ok) { etat.edition = e; etat.focus = e.id; redessiner(); }
  };

  const partager = async (n) => {
    const liste = projets();
    if (!liste.length) { toast('Partager une note demande un projet : vous n\'en avez pas encore.', 'erreur'); return; }
    const rattache = n.projet && liste.some((p) => p.id === n.projet) ? n.projet : '';
    const m = modale({
      titre: 'Partager avec Capmedia',
      corps: `<p class="t-corps t-2">L'équipe de Capmedia verra cette note dans son espace, et son texte sera posté dans la conversation du projet, pour qu'on en parle.</p>
        ${rattache
          ? `<p class="t-petit" style="margin-top:12px"><span class="t-3">Projet :</span> ${echapper(nomProjet(rattache))}</p>`
          : `<div class="groupe" style="margin-top:14px"><label class="etiquette-champ" for="note-partage-projet">Pour quel projet ?</label><select class="select" id="note-partage-projet">${liste.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select></div>`}
        <p class="t-petit t-3" style="margin-top:14px">Vous pourrez la reprendre à tout moment : elle redeviendra privée. Le message déjà envoyé dans la conversation, lui, restera.</p>`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-note-partager-ok>Partager</button>',
    });
    m.el.querySelector('[data-note-partager-ok]').addEventListener('click', async (ev) => {
      const choix = m.el.querySelector('#note-partage-projet');
      const pid = rattache || (choix ? choix.value : '');
      if (!pid) { toast('Choisissez un projet.', 'erreur'); return; }
      const ok = await agir(ev.currentTarget, () => ecrire.partagerNoteClient(session, n, pid), 'Note partagée avec Capmedia.');
      if (ok) m.fermer(true);
    });
    await m.fin;
  };

  const reprendre = async (n) => {
    const ok = await confirmer({
      titre: 'Reprendre cette note ?',
      texte: 'Elle redevient privée : Capmedia ne la voit plus dans son espace. Le message déjà envoyé dans la conversation du projet reste.',
      ok: 'Reprendre',
    });
    if (!ok) return;
    await agir(null, () => ecrire.reprendreNoteClient(n.id), 'Note reprise : elle est de nouveau privée.');
  };

  const supprimer = async (n) => {
    const ok = await confirmer({
      titre: 'Supprimer cette note ?',
      texte: n.partagee ? 'Elle disparaît de votre carnet et de l\'espace de Capmedia. Le message déjà envoyé dans la conversation reste.' : 'Elle disparaît de votre carnet.',
      ok: 'Supprimer', danger: true,
    });
    if (!ok) return;
    if (etat.edition && etat.edition.id === n.id) fermerEdition();
    await agir(null, () => ecrire.supprimerNoteClient(n.id), 'Note supprimée.');
  };

  const ouvrirMenu = (bouton, n) => menu(bouton, [
    { libelle: 'Modifier', icone: 'edit', action: () => { fermerNouvelle(); etat.edition = { id: n.id, texte: n.texte || '', projet: n.projet || '' }; etat.focus = n.id; etat.curseur = null; redessiner(); } },
    { libelle: n.epinglee ? 'Ne plus épingler' : 'Épingler en haut', icone: 'pin', action: () => agir(null, () => ecrire.majNoteClient(n.id, { epinglee: !n.epinglee }), n.epinglee ? 'Note désépinglée.' : 'Note épinglée.') },
    '-',
    { libelle: 'Supprimer', icone: 'corbeille', danger: true, action: () => supprimer(n) },
  ]);

  const retraits = [];
  retraits.push(sur(sortie, 'click', '[data-note-geste]', (el) => {
    const geste = el.dataset.noteGeste;
    if (geste === 'ouvrir') { fermerEdition(); etat.ouvert = true; etat.focus = 'nouvelle'; etat.curseur = null; redessiner(); return; }
    if (geste === 'annuler') { if (el.dataset.noteCle === 'nouvelle') fermerNouvelle(); else fermerEdition(); redessiner(); return; }
    const n = trouver(el.dataset.noteId);
    if (!n) return;
    if (geste === 'partager') partager(n);
    else if (geste === 'reprendre') reprendre(n);
    else if (geste === 'menu') ouvrirMenu(el, n);
    else if (geste === 'proposer' && proposer) proposer(n, el);
  }));
  retraits.push(sur(sortie, 'submit', '[data-note-forme]', (el, ev) => {
    ev.preventDefault();
    const bouton = el.querySelector('[type="submit"]');
    if (el.dataset.noteForme === 'nouvelle') enregistrerNouvelle(bouton); else enregistrerEdition(bouton);
  }));
  /* Ce qui s'écrit est retenu à chaque frappe, avec le curseur : un
     redessin de la page au milieu d'une phrase ne perd rien. */
  retraits.push(sur(sortie, 'input', '[data-note-champ]', (el) => {
    const cle = el.dataset.noteChamp;
    if (cle === 'nouvelle') etat.brouillon = el.value; else if (etat.edition && etat.edition.id === cle) etat.edition.texte = el.value;
    etat.focus = cle; etat.curseur = [el.selectionStart, el.selectionEnd];
  }));
  retraits.push(sur(sortie, 'focusin', '[data-note-champ]', (el) => { etat.focus = el.dataset.noteChamp; }));
  retraits.push(sur(sortie, 'keyup', '[data-note-champ]', (el) => { etat.curseur = [el.selectionStart, el.selectionEnd]; }));
  retraits.push(sur(sortie, 'change', '[data-note-projet]', (el) => {
    const cle = el.dataset.noteProjet;
    if (cle === 'nouvelle') etat.projetChoisi = el.value; else if (etat.edition && etat.edition.id === cle) etat.edition.projet = el.value;
  }));
  /* Entrée enregistre, Maj+Entrée va à la ligne, Échap referme : la
     même convention que la bulle et la page Messages. */
  retraits.push(sur(sortie, 'keydown', '[data-note-champ]', (el, ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); const f = el.closest('form'); if (f) f.requestSubmit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); if (el.dataset.noteChamp === 'nouvelle') fermerNouvelle(); else fermerEdition(); redessiner(); }
  }));

  return { html, apres, fin: () => retraits.splice(0).forEach((r) => r()) };
};

/* ==========================================================================
   Côté Cockpit : les notes que le client a partagées

   Sur l'accueil (toutes, en carte dans la colonne de droite) et sur
   l'aperçu d'un projet (les siennes, en section). « En faire une demande »
   ouvre le formulaire d'une demande déjà rempli du texte de la note, comme
   depuis un message de la conversation.
   ========================================================================== */

/** Qui a partagé la note : le nom vient de l'annuaire des interlocuteurs
    du projet (le miroir « personnesClient » de la fiche, ou les
    interlocuteurs quand la page les a chargés), retrouvé par uid, comme
    pour le coffre. Jamais du champ « nom » du document : le client
    l'écrit lui-même et pourrait y mettre n'importe quel nom. */
export const nomAuteurNote = (n) => {
  if (!n || !n.uid || !n.projet) return 'Un client';
  const projet = (magasin.lire(K.projet(n.projet)) || (magasin.lire(K.projets) || []).find((p) => p.id === n.projet) || {});
  const trouve = [
    ...(Array.isArray(projet.personnesClient) ? projet.personnesClient : []),
    ...(magasin.lire(K.interlocuteurs(n.projet)) || []),
  ].find((x) => x && x.uid === n.uid && x.nom);
  return trouve ? trouve.nom : 'Un client';
};

export const notesPartageesHtml = (notes, { nomProjet = () => '', carte = true, limite = 8, nu = false } = {}) => {
  const liste = (notes || []).slice(0, limite);
  if (!liste.length) return '';
  const corps = liste.map((n) => `<div class="note-partagee" data-note="${echapper(n.id)}">
    <p class="note-client-texte">${avecLiens(n.texte || '')}</p>
    <p class="t-micro t-3" style="margin-top:4px">${echapper([nomAuteurNote(n), carte ? nomProjet(n.projet) : '', dateHeure(n.maj || n.cree)].filter(Boolean).join(' · '))}</p>
    <p style="margin-top:6px"><button class="btn btn-doux btn-petit" type="button" data-note-demande="${echapper(n.id)}">${icone('sparkle')} En faire une demande</button></p>
  </div>`).join('');
  const reste = (notes || []).length > limite ? `<p class="t-micro t-3" style="margin-top:10px">et ${(notes || []).length - limite} de plus${carte ? ', à lire sur chaque projet' : ''}</p>` : '';
  /* « nu » : la liste seule, sous un intitulé posé par la page (page Notes). */
  if (nu) return `<div class="pile" id="notes-partagees" style="gap:12px">${corps}</div>${reste}`;
  if (carte) return `<div class="carte carte--creuse" id="notes-partagees"><p class="surtitre">Notes partagées par le client</p><div class="pile" style="margin-top:10px;gap:12px">${corps}</div>${reste}</div>`;
  return `<section class="section" id="notes-partagees"><div class="section-tete"><h2>Notes partagées par le client <span class="compte-section">${(notes || []).length}</span></h2></div><p class="t-petit t-2" style="margin-bottom:10px">Le client les a aussi postées dans la conversation du projet.</p><div class="pile" style="gap:12px">${corps}</div>${reste}</section>`;
};

/** Le geste « En faire une demande » : `lireNotes()` rend la liste du moment. Renvoie la fonction qui le retire. */
export const gesteNoteDemande = (sortie, lireNotes) => sur(sortie, 'click', '[data-note-demande]', (el) => {
  const n = (lireNotes() || []).find((x) => x.id === el.dataset.noteDemande);
  if (n && n.projet) demandeDepuisMessage(el, { texte: n.texte || '', de: { nom: nomAuteurNote(n) } }, n.projet);
});
