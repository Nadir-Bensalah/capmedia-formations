/* ==========================================================================
   La messagerie : ce que la bulle (bulle.js) et la page Messages
   (vues/messages.js) partagent, côté Hub comme côté Cockpit.

   - Réagir : une petite palette fermée, une réaction par personne et par
     emoji, qui se pose et se retire d'un geste. La clé porte l'identifiant
     de la personne (« pouce_<uid> »), la valeur son nom : les règles ne
     laissent toucher que les siennes.
   - Répondre à : le nouveau message cite celui d'origine (reponseA : id,
     nom, extrait) ; un clic sur la citation y ramène.
   - Modifier son message, quinze minutes au plus après l'envoi (« modifié »
     à côté de l'heure) ; le supprimer à tout moment (« Message supprimé »
     à sa place, pièces jointes effacées par le serveur).

   Le menu d'un message s'ouvre par le bouton discret « Plus d'actions »,
   ou par un appui long sur un écran tactile.
   ========================================================================== */

import { echapper, enDate } from './noyau.js';
import { icone } from './icones.js';
import { messageHtml, toast, confirmer, lisible, copier } from './ui.js';
import { ecrire } from './donnees.js';

/* La palette, fermée : la même liste est dans les règles Firestore
   (mesClesReaction). Une clé ne contient jamais « _ ». */
export const PALETTE = [
  { cle: 'pouce', emoji: '👍', libelle: "J'aime" },
  { cle: 'coeur', emoji: '❤️', libelle: 'Cœur' },
  { cle: 'rire', emoji: '😂', libelle: 'Rire' },
  { cle: 'wow', emoji: '😮', libelle: 'Surprise' },
  { cle: 'triste', emoji: '😢', libelle: 'Triste' },
  { cle: 'merci', emoji: '🙏', libelle: 'Merci' },
];

/* La fenêtre de modification : quinze minutes, tenues par les règles avec
   l'heure du serveur. L'écran retire « Modifier » un peu avant. */
export const FENETRE_MODIFICATION_MS = 15 * 60 * 1000;

/** Un message d'en face, jamais le mien : c'est lui qui peut devenir une demande. */
export const vientDEnFace = (m, { uid, equipe }) => Boolean(m.de) && m.de.uid !== uid && ((m.de.cote === 'equipe') !== equipe);

const deMoi = (m, uid) => Boolean(m && m.de && m.de.uid === uid);

/** Le nom de l'auteur, tel qu'on le lit dans une citation. */
export const nomAuteur = (m, uid) => {
  if (!m || !m.de) return '';
  if (m.de.uid === uid) return 'Vous';
  return m.de.nom || ({ equipe: 'Capmedia', testeur: 'Testeur' }[m.de.cote] || 'Client');
};

/** Un extrait d'une ligne : le texte, sinon ce que portent les pièces. */
export const extrait = (m, longueur = 140) => {
  if (!m) return '';
  if (m.supprime) return 'Message supprimé';
  const texte = String(m.texte || '').trim().replace(/\s+/g, ' ');
  if (texte) return texte.length > longueur ? `${texte.slice(0, longueur - 1)}…` : texte;
  const n = (m.pieces || []).length;
  return n > 1 ? `${n} pièces jointes` : (n ? 'Pièce jointe' : 'Message');
};

export const peutModifier = (m, uid) => {
  if (!deMoi(m, uid) || m.supprime) return false;
  const d = enDate(m.date);
  return !d || Date.now() - d.getTime() < FENETRE_MODIFICATION_MS - 10000;
};

/** Les réactions d'un message, dans l'ordre de la palette. */
export const reactionsDe = (m, uid) => {
  const parCle = new Map();
  Object.entries((m && m.reactions) || {}).forEach(([k, nom]) => {
    const i = k.indexOf('_');
    if (i < 1) return;
    const cle = k.slice(0, i);
    const qui = k.slice(i + 1);
    if (!PALETTE.some((p) => p.cle === cle)) return;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push({ uid: qui, nom: String(nom || '') });
  });
  return PALETTE.filter((p) => parCle.has(p.cle)).map((p) => {
    const qui = parCle.get(p.cle);
    return { ...p, qui, moi: qui.some((q) => q.uid === uid) };
  });
};

const nomsReaction = (r, uid) => r.qui.map((q) => (q.uid === uid ? 'Vous' : (q.nom || 'Quelqu\'un'))).join(', ');

const reactionsHtml = (m, uid) => {
  const liste = reactionsDe(m, uid);
  if (!liste.length) return '';
  return `<div class="message-reactions">${liste.map((r) => `<button type="button" class="reaction${r.moi ? ' reaction--moi' : ''}" data-reagir="${r.cle}" aria-pressed="${r.moi}" aria-label="${echapper(`${r.libelle} : ${nomsReaction(r, uid)}`)}" title="${echapper(nomsReaction(r, uid))}"><span class="reaction-emoji" aria-hidden="true">${r.emoji}</span>${r.qui.length > 1 ? `<span class="reaction-nombre">${r.qui.length}</span>` : ''}</button>`).join('')}</div>`;
};

/* La citation d'une réponse. Quand l'original est dans le fil, c'est lui
   qu'on lit (corrigé, ou supprimé depuis) ; sinon l'extrait gardé. */
const citationHtml = (m, tous, uid) => {
  const c = m.reponseA;
  if (!c || !c.id) return '';
  const original = (tous || []).find((x) => x.id === c.id);
  const qui = original ? nomAuteur(original, uid) : (c.nom || 'Message');
  const texte = original ? extrait(original) : (c.supprime ? 'Message supprimé' : (c.extrait || 'Message'));
  return `<button type="button" class="message-citation" data-aller-a="${echapper(c.id)}" aria-label="${echapper(`Voir le message cité, de ${qui}`)}"><span class="message-citation-qui">${echapper(qui)}</span><span class="message-citation-texte">${echapper(texte)}</span></button>`;
};

/**
 * Un message du fil, avec ses gestes. `classe` : « bulle-message » ou
 * « fil-message ». `tous` : les messages chargés, pour lire une citation.
 * `transformer: false` : pas de « En faire une demande » (un fil hors projet).
 */
export const messageDuFil = (m, { uid, equipe, classe, tous, transformer: avecDemande = true }) => {
  const transformer = avecDemande && vientDEnFace(m, { uid, equipe })
    ? `<button class="bulle-action" type="button" data-transformer="${echapper(m.id || '')}" aria-label="${equipe ? 'En faire une demande' : 'En faire un ticket'}" data-astuce="${equipe ? 'En faire une demande' : 'En faire un ticket'}">${icone('sparkle')}</button>`
    : '';
  const gestes = m.supprime ? '' : `<div class="message-gestes">${transformer}<button class="bulle-action" type="button" data-menu-message aria-haspopup="menu" aria-label="Réagir, répondre et autres actions" data-astuce="Réagir, répondre">${icone('points')}</button></div>`;
  return `<div class="${classe}" data-msg="${echapper(m.id || '')}">${messageHtml(m, { moi: uid, avant: citationHtml(m, tous, uid), apres: reactionsHtml(m, uid) })}${gestes}</div>`;
};

/* Ce qui distingue deux états du fil : un message de plus, un texte
   corrigé, une suppression, une réaction. Deux signatures égales, et le
   fil ne se redessine pas. */
const empreinteTexte = (t) => {
  let h = 5381;
  const s = String(t || '');
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
export const signatureFil = (messages) => (messages || []).map((m) => `${m.id}:${m.supprime ? 'x' : ''}${m.modifie ? 'm' : ''}:${empreinteTexte(m.texte)}:${(m.pieces || []).length}:${Object.keys(m.reactions || {}).sort().join(',')}:${(m.reponseA || {}).supprime ? 's' : ''}`).join('|');

/** Ramène sous les yeux le message cité, et le fait briller un instant. */
export const allerAuMessage = (fil, id) => {
  if (!fil || !id) return false;
  const el = fil.querySelector(`[data-msg="${CSS.escape(id)}"]`);
  if (!el) return false;
  const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: doux ? 'smooth' : 'auto' });
  el.classList.remove('message-repere');
  void el.offsetWidth;
  el.classList.add('message-repere');
  setTimeout(() => el.classList.remove('message-repere'), 1800);
  return true;
};

/** La barre au-dessus du champ : « Répondre à … » ou « Modifier votre message ». */
export const barreContexte = (contexte, uid) => {
  if (!contexte || !contexte.message) return '';
  const m = contexte.message;
  const modifier = contexte.mode === 'modifier';
  return `<div class="composer-contexte" data-mode="${modifier ? 'modifier' : 'repondre'}">
    <div class="composer-contexte-texte"><span class="composer-contexte-titre">${echapper(modifier ? 'Modifier votre message' : `Répondre à ${nomAuteur(m, uid)}`)}</span><span class="composer-contexte-extrait">${echapper(extrait(m, 120))}</span></div>
    <button type="button" class="btn-icone" data-annuler-contexte aria-label="${modifier ? 'Annuler la modification' : 'Annuler la réponse'}" data-astuce="Annuler (Échap)">${icone('fermer')}</button>
  </div>`;
};

/** La citation à écrire avec une réponse. */
export const citationPour = (m, uid) => ({ id: m.id, nom: nomAuteur(m, uid) === 'Vous' ? ((m.de || {}).nom || '') : nomAuteur(m, uid), extrait: extrait(m, 200) });

/* ==========================================================================
   Le menu d'un message
   ========================================================================== */

let fermerOuvert = null;

/**
 * Le menu d'un message, ancré sous `ancre` : la palette, puis Répondre,
 * Copier, En faire une demande (d'en face), Modifier (le mien, dans la
 * fenêtre), Supprimer (le mien).
 */
export const ouvrirMenuMessage = (ancre, m, a) => {
  if (fermerOuvert) fermerOuvert();
  document.querySelectorAll('.menu').forEach((x) => x.remove());
  const mesCles = new Set(reactionsDe(m, a.uid).filter((r) => r.moi).map((r) => r.cle));
  const texte = String(m.texte || '').trim();
  const items = [
    { cle: 'repondre', libelle: 'Répondre' },
    texte ? { cle: 'copier', libelle: 'Copier le texte' } : null,
    a.surTransformer && vientDEnFace(m, a) ? { cle: 'transformer', libelle: a.equipe ? 'En faire une demande' : 'En faire un ticket' } : null,
    a.surModifier && texte && peutModifier(m, a.uid) ? { cle: 'modifier', libelle: 'Modifier' } : null,
    deMoi(m, a.uid) ? { cle: 'supprimer', libelle: 'Supprimer', danger: true } : null,
  ].filter(Boolean);
  const boite = document.createElement('div');
  boite.className = 'menu menu-message';
  boite.setAttribute('role', 'menu');
  boite.setAttribute('aria-label', 'Actions sur le message');
  boite.innerHTML = `<div class="menu-reactions" role="group" aria-label="Réagir">${PALETTE.map((p) => `<button type="button" role="menuitemcheckbox" aria-checked="${mesCles.has(p.cle)}" class="${mesCles.has(p.cle) ? 'actif' : ''}" data-reaction="${p.cle}" aria-label="${echapper(p.libelle)}" title="${echapper(p.libelle)}">${p.emoji}</button>`).join('')}</div><hr>${items.map((it) => `<button type="button" role="menuitem" data-cle="${it.cle}" class="${it.danger ? 'danger' : ''}">${echapper(it.libelle)}</button>`).join('')}`;
  document.body.appendChild(boite);

  const r = ancre.getBoundingClientRect();
  const largeur = boite.offsetWidth;
  const hauteur = boite.offsetHeight;
  let gauche = Math.min(r.right - largeur, window.innerWidth - largeur - 8);
  if (gauche < 8) gauche = 8;
  let haut = r.bottom + 6;
  if (haut + hauteur > window.innerHeight - 8) haut = r.top - hauteur - 6;
  boite.style.left = `${Math.round(gauche)}px`;
  boite.style.top = `${Math.round(Math.max(8, haut))}px`;

  const fermer = (rendreFocus = false) => {
    boite.remove();
    document.removeEventListener('click', horsClic, true);
    document.removeEventListener('keydown', clavier, true);
    window.removeEventListener('resize', surRedim);
    if (fermerOuvert === fermer) fermerOuvert = null;
    if (rendreFocus && ancre.isConnected && typeof ancre.focus === 'function') ancre.focus();
  };
  const horsClic = (e) => { if (!boite.contains(e.target)) fermer(); };
  const clavier = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(true); } };
  const surRedim = () => fermer();
  setTimeout(() => document.addEventListener('click', horsClic, true), 0);
  document.addEventListener('keydown', clavier, true);
  window.addEventListener('resize', surRedim);
  fermerOuvert = fermer;

  boite.addEventListener('click', (e) => {
    const emoji = e.target.closest('[data-reaction]');
    if (emoji) { const cle = emoji.dataset.reaction; fermer(); a.surReagir(cle, !mesCles.has(cle)); return; }
    const b = e.target.closest('[data-cle]');
    if (!b) return;
    fermer();
    if (b.dataset.cle === 'repondre') a.surRepondre();
    else if (b.dataset.cle === 'copier') copier(String(m.texte || ''));
    else if (b.dataset.cle === 'transformer') a.surTransformer(ancre);
    else if (b.dataset.cle === 'modifier') a.surModifier();
    else if (b.dataset.cle === 'supprimer') a.surSupprimer();
  });
  const premier = boite.querySelector('button');
  if (premier) premier.focus({ preventScroll: true });
  return fermer;
};

/* ==========================================================================
   L'appui long, sur un écran tactile
   ========================================================================== */

const DUREE_APPUI = 450;

/** Un appui long du doigt sur `selecteur` appelle `action(el)`. Rend le retrait. */
export const brancherAppuiLong = (racine, selecteur, action) => {
  let minuteur = null;
  let depart = null;
  const annuler = () => { clearTimeout(minuteur); minuteur = null; depart = null; };
  const bas = (e) => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest(selecteur);
    if (!el || !racine.contains(el) || e.target.closest('a, button, input, textarea, select')) return;
    depart = { x: e.clientX, y: e.clientY };
    minuteur = setTimeout(() => {
      minuteur = null;
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* rien */ }
      action(el);
    }, DUREE_APPUI);
  };
  const bouge = (e) => { if (depart && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 10) annuler(); };
  /* Android ouvre son propre menu au même moment : on le retient sur un
     message, puisque le nôtre s'ouvre à sa place. */
  const contexte = (e) => { if (e.target.closest(selecteur) && (e.pointerType === 'touch' || (window.matchMedia && window.matchMedia('(hover: none)').matches))) e.preventDefault(); };
  racine.addEventListener('pointerdown', bas, { passive: true });
  racine.addEventListener('pointermove', bouge, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => racine.addEventListener(t, annuler, { passive: true }));
  racine.addEventListener('contextmenu', contexte);
  return () => {
    annuler();
    racine.removeEventListener('pointerdown', bas);
    racine.removeEventListener('pointermove', bouge);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => racine.removeEventListener(t, annuler));
    racine.removeEventListener('contextmenu', contexte);
  };
};

/* ==========================================================================
   Les gestes d'un fil, branchés une fois
   ========================================================================== */

/**
 * Branche sur `racine` le bouton « Plus d'actions », les réactions, les
 * citations et l'appui long. `c` : { uid, equipe, session, pid(), trouver(id),
 * repondre(m), modifier(m), transformer(ancre, m) | null, allerA(id) }.
 * `c.fil` (facultatif) : les écritures d'un autre fil que celui du projet
 * (filDeMessages, donnees.js), comme la conversation d'un testeur.
 * Rend le retrait.
 */
export const brancherGestesMessages = (racine, c) => {
  const reagir = (m, cle, oui) => (c.fil ? c.fil.reagir(m.id, cle, oui) : ecrire.reagir(c.session, c.pid(), m.id, cle, oui)).catch((e) => toast(lisible(e), 'erreur'));
  const supprimer = async (m) => {
    const ok = await confirmer({
      titre: 'Supprimer ce message ?',
      texte: (m.pieces || []).length
        ? 'Il sera remplacé par « Message supprimé » pour tout le monde, et ses pièces jointes seront effacées.'
        : 'Il sera remplacé par « Message supprimé » pour tout le monde.',
      ok: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try { await (c.fil ? c.fil.supprimer(m.id) : ecrire.supprimerMessage(c.pid(), m.id)); } catch (e) { toast(lisible(e), 'erreur'); }
  };
  const actions = (m) => ({
    uid: c.uid,
    equipe: c.equipe,
    surReagir: (cle, oui) => reagir(m, cle, oui),
    surRepondre: () => c.repondre(m),
    surModifier: () => c.modifier(m),
    surSupprimer: () => supprimer(m),
    surTransformer: c.transformer ? (ancre) => c.transformer(ancre, m) : null,
  });
  const messageDe = (el) => { const bloc = el.closest('[data-msg]'); return bloc ? c.trouver(bloc.dataset.msg) : null; };

  const clic = (e) => {
    const menuBtn = e.target.closest('[data-menu-message]');
    if (menuBtn && racine.contains(menuBtn)) {
      const m = messageDe(menuBtn);
      if (m && !m.supprime) ouvrirMenuMessage(menuBtn, m, actions(m));
      return;
    }
    const puce = e.target.closest('[data-reagir]');
    if (puce && racine.contains(puce)) {
      const m = messageDe(puce);
      if (m && !m.supprime) reagir(m, puce.dataset.reagir, puce.getAttribute('aria-pressed') !== 'true');
      return;
    }
    const citation = e.target.closest('[data-aller-a]');
    if (citation && racine.contains(citation)) c.allerA(citation.dataset.allerA);
  };
  racine.addEventListener('click', clic);
  const finAppui = brancherAppuiLong(racine, '[data-msg]', (el) => {
    const m = c.trouver(el.dataset.msg);
    if (!m || m.supprime) return;
    ouvrirMenuMessage(el.querySelector('.message-corps, .pieces, .message-tete') || el, m, actions(m));
  });
  return () => { racine.removeEventListener('click', clic); finAppui(); if (fermerOuvert) fermerOuvert(); };
};
