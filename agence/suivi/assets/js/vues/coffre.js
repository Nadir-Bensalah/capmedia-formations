/* ==========================================================================
   L'onglet « Coffre-fort » d'un projet : les accès du client (sites,
   consoles, stores), chiffrés dans le navigateur. Partagé par l'équipe et
   par le ou les responsables du projet ; un collaborateur ne le voit pas.

   La page d'un projet se redessine quand le magasin bouge. Le coffre, lui,
   garde son nœud : à chaque dessin de la page, on remet en place la même
   zone (avec ce qu'on était en train de taper), au lieu d'en refaire une.

   Verrouillage : après cinq minutes sans geste, quand on quitte l'onglet
   ou la page. Verrouiller, c'est oublier la clé et le clair : il ne reste
   en mémoire que des chiffrés.
   ========================================================================== */

import { echapper, dateHeure, dateCourte, estResponsable } from '../noyau.js';
import { icone, modale, confirmer, toast, agir, lisible, menu, squelette } from '../ui.js';
import { coffre as bddCoffre } from '../donnees.js';
import {
  genererPhrase, creerCoffre, ouvrirAvecPhrase, envelopperPourPhrase, chiffrerEntree, dechiffrerEntree,
  envelopperPourAppareil, ouvrirAvecAppareil, deB64, PhraseRefusee, MOTS_PAR_PHRASE,
} from '../coffre-chiffre.js';
import { detecterPrf, activerAppareil, ouvrirParAppareil, nomAppareil } from '../coffre-appareil.js';

export const INACTIVITE = 5 * 60 * 1000;
const MASQUE = '••••••••••';
const MAX_ENTREES = 400;

/** Qui voit l'onglet : l'équipe, et le responsable côté client. */
export const voitLeCoffre = (env, projet) => env.role === 'equipe' || Boolean(projet && estResponsable(env.session, projet));

/* Un seul coffre ouvert à la fois : celui de la page affichée. */
let etat = null;

const moi = () => etat.env.session.utilisateur.uid;
const equipe = () => etat.env.role === 'equipe';

/* --------------------------------------------------------------------------
   Monter, démonter, verrouiller
   -------------------------------------------------------------------------- */

const activite = () => { if (etat) etat.derniereActivite = Date.now(); };
const surveiller = () => {
  if (!etat || !etat.cle) return;
  if (Date.now() - etat.derniereActivite >= INACTIVITE) verrouiller('Coffre verrouillé après cinq minutes sans activité.');
};
const surVisibilite = () => { if (document.visibilityState === 'visible') surveiller(); };
const surDepart = () => demonterCoffre();
const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];

export const monterCoffre = (place, { pid, env, projet }) => {
  if (!place) return;
  if (etat && etat.pid !== pid) demonterCoffre();
  if (!etat) {
    etat = {
      pid, env, projetNom: (projet && projet.nom) || 'projet',
      meta: undefined, chiffrees: [], appareils: [], journal: [], erreur: null,
      cle: null, entrees: [], recherche: '', visibles: new Map(), modales: new Set(),
      prf: null, derniereActivite: Date.now(), zone: null, arret: null, minuteur: null,
    };
    const e = etat;
    e.arret = bddCoffre.ecouter(pid, {
      meta: (m) => { if (etat !== e) return; e.meta = m; if (!m && e.cle) verrouiller(); else dessiner(); },
      entrees: (l) => { if (etat !== e) return; e.chiffrees = l; if (e.cle) dechiffrerTout().then(dessiner); else dessiner(); },
      appareils: (l) => { if (etat !== e) return; e.appareils = l; dessiner(); },
      journal: (l) => { if (etat !== e) return; e.journal = l; dessinerJournal(); },
      erreur: (err) => { if (etat !== e) return; e.erreur = err; dessiner(); },
    });
    detecterPrf().then((r) => { if (etat === e) { e.prf = r; dessiner(); } });
    GESTES.forEach((g) => document.addEventListener(g, activite, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('pagehide', surDepart);
    e.minuteur = setInterval(surveiller, 10000);
  }
  etat.env = env;
  if (projet && projet.nom) etat.projetNom = projet.nom;
  if (etat.zone === place) { dessiner(); return; }
  if (etat.zone) {
    /* La page s'est redessinée : on remet la zone d'avant à sa place,
       avec le champ en cours de frappe et son focus. */
    const actif = document.activeElement;
    const avait = etat.zone.contains(actif);
    const debut = avait && typeof actif.selectionStart === 'number' ? actif.selectionStart : null;
    place.replaceWith(etat.zone);
    if (avait) { actif.focus(); if (debut !== null) { try { actif.setSelectionRange(debut, debut); } catch (err) { /* champ sans curseur */ } } }
    return;
  }
  etat.zone = place;
  brancher(place);
  dessiner();
};

export const demonterCoffre = () => {
  if (!etat) return;
  const e = etat;
  oublier();
  e.modales.forEach((m) => m.fermer());
  if (e.arret) e.arret();
  clearInterval(e.minuteur);
  GESTES.forEach((g) => document.removeEventListener(g, activite, { capture: true }));
  document.removeEventListener('visibilitychange', surVisibilite);
  window.removeEventListener('pagehide', surDepart);
  etat = null;
};

/* Oublier la clé et tout le clair. La mémoire d'un navigateur ne s'efface
   pas sur commande : on lâche toutes les références, le reste est au
   ramasse-miettes. */
const oublier = () => {
  if (!etat) return;
  etat.cle = null;
  etat.entrees = [];
  etat.visibles.forEach((t) => clearTimeout(t));
  etat.visibles.clear();
};

const verrouiller = (message = '') => {
  if (!etat) return;
  oublier();
  etat.modales.forEach((m) => m.fermer());
  etat.modales.clear();
  dessiner();
  if (message) toast(message, 'info');
};

/* Une modale du coffre se referme d'office au verrouillage. */
const suivre = (m) => { etat.modales.add(m); m.fin.then(() => { if (etat) etat.modales.delete(m); }); return m; };

/* --------------------------------------------------------------------------
   Déchiffrer
   -------------------------------------------------------------------------- */

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const dechiffrerTout = async () => {
  const e = etat;
  if (!e || !e.cle) return;
  const cle = e.cle;
  const lues = await Promise.all(e.chiffrees.map(async (c) => {
    try { return { id: c.id, maj: c.maj, ...(await dechiffrerEntree(e.pid, c.id, cle, c)) }; }
    catch (err) { return { id: c.id, maj: c.maj, illisible: true, service: 'Entrée illisible' }; }
  }));
  if (etat !== e || e.cle !== cle) return;
  e.entrees = lues.sort((a, b) => sansAccent(a.service).localeCompare(sansAccent(b.service), 'fr'));
};

/* --------------------------------------------------------------------------
   Le dessin
   -------------------------------------------------------------------------- */

const pourquoiHtml = (deplie) => `
  <details class="coffre-pourquoi"${deplie ? ' open' : ''}>
    <summary>Pourquoi ce coffre est chiffré, et ce que cela veut dire</summary>
    <div class="prose t-corps t-2">
      <p>Ce que vous rangez ici est chiffré dans votre navigateur, avant de partir sur Internet. Nos serveurs ne reçoivent qu'une suite de caractères illisible.</p>
      <p>La clé est une phrase de ${MOTS_PAR_PHRASE} mots, tirée au hasard à la création du coffre. Elle n'est enregistrée nulle part, ni chez Capmedia, ni chez notre hébergeur. <strong>Même Capmedia ne peut pas lire ce coffre sans la phrase.</strong></p>
      <p><strong>Si la phrase est perdue, le contenu est perdu.</strong> Personne ne pourra le récupérer : il faudra recréer le coffre et ressaisir les accès. Gardez-la sur papier, en lieu sûr.</p>
      <p>La phrase se transmet de vive voix ou sur papier. Jamais par e-mail, jamais dans un message du Hub.</p>
    </div>
  </details>`;

const LIBELLES_JOURNAL = {
  creation: 'a créé le coffre',
  deverrouillage: 'a déverrouillé le coffre',
  echec: 'a tapé une phrase refusée',
  'phrase-changee': 'a changé la phrase',
  'entree-ajoutee': 'a ajouté un accès',
  'entree-modifiee': 'a modifié un accès',
  'entree-supprimee': 'a supprimé un accès',
  'appareil-ajoute': "a activé l'empreinte sur un appareil",
  'appareil-retire': 'a retiré un appareil',
  'coffre-efface': 'a effacé le coffre (phrase perdue)',
};
const MOYENS = { phrase: ' avec la phrase', appareil: " avec l'empreinte" };

const journalHtml = () => {
  const l = (etat.journal || []).slice(0, 15);
  if (!l.length) return '<p class="t-petit t-3">Rien pour l\'instant.</p>';
  return `<ul class="coffre-journal">${l.map((j) => `<li data-journal="${echapper(j.action)}"><span class="t-corps-fort">${echapper(j.nom || (j.cote === 'equipe' ? 'Capmedia' : 'Client'))}</span> ${echapper(LIBELLES_JOURNAL[j.action] || j.action)}${j.action === 'deverrouillage' ? echapper(MOYENS[j.moyen] || '') : ''}<span class="t-3"> · ${echapper(dateHeure(j.date))}</span></li>`).join('')}</ul>`;
};

const lienHtml = (url) => {
  if (!url) return '';
  const propre = /^https?:\/\/\S+$/i.test(url) ? url : '';
  const court = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return propre
    ? `<a class="url coffre-lien" href="${echapper(propre)}" target="_blank" rel="noopener noreferrer">${echapper(court)}</a>`
    : `<span class="url coffre-lien">${echapper(court)}</span>`;
};

const entreeHtml = (x) => {
  if (x.illisible) {
    return `<article class="coffre-entree" data-entree="${echapper(x.id)}"><div class="coffre-entree-tete"><h3>Entrée illisible</h3>
      <button class="btn btn-fantome btn-petit" type="button" data-coffre="supprimer" data-id="${echapper(x.id)}">Supprimer</button></div>
      <p class="t-petit t-3">Elle ne se déchiffre pas avec la clé de ce coffre : elle a été abîmée ou recopiée d'ailleurs.</p></article>`;
  }
  const visible = etat.visibles.has(x.id);
  return `<article class="coffre-entree" data-entree="${echapper(x.id)}">
    <div class="coffre-entree-tete">
      <div style="min-width:0"><h3>${echapper(x.service)}</h3>${lienHtml(x.lien)}</div>
      <button class="btn btn-fantome btn-petit" type="button" data-coffre="editer" data-id="${echapper(x.id)}">${icone('edit')} Modifier</button>
    </div>
    <dl class="coffre-champs">
      ${x.identifiant ? `<div><dt>Identifiant</dt><dd><span class="t-mono coffre-valeur" data-valeur="identifiant">${echapper(x.identifiant)}</span><button class="btn btn-doux btn-petit" type="button" data-coffre="copier-identifiant" data-id="${echapper(x.id)}">${icone('copier')} Copier</button></dd></div>` : ''}
      ${x.motDePasse ? `<div><dt>Mot de passe</dt><dd><span class="t-mono coffre-valeur" data-valeur="mot-de-passe">${visible ? echapper(x.motDePasse) : MASQUE}</span><button class="btn btn-doux btn-petit" type="button" data-coffre="afficher" data-id="${echapper(x.id)}" aria-pressed="${visible}">${visible ? 'Masquer' : 'Afficher'}</button><button class="btn btn-doux btn-petit" type="button" data-coffre="copier-mdp" data-id="${echapper(x.id)}">${icone('copier')} Copier</button></dd></div>` : ''}
      ${x.note ? `<div><dt>Note</dt><dd class="coffre-note">${echapper(x.note)}</dd></div>` : ''}
    </dl>
  </article>`;
};

const filtrees = () => {
  const t = sansAccent(etat.recherche).trim();
  if (!t) return etat.entrees;
  return etat.entrees.filter((x) => sansAccent([x.service, x.lien, x.identifiant, x.note].join(' ')).includes(t));
};

const listeHtml = () => {
  if (!etat.entrees.length) return '<div class="coffre-vide"><p class="t-corps-fort">Le coffre est vide.</p><p class="t-petit t-2">Ajoutez le premier accès : un site, une console, un store. Le nom du service est chiffré, lui aussi.</p></div>';
  const l = filtrees();
  if (!l.length) return `<p class="t-petit t-3" style="padding:12px 0">Aucun accès ne correspond à « ${echapper(etat.recherche)} ».</p>`;
  return l.map(entreeHtml).join('');
};

const appareilsHtml = () => {
  const p = etat.prf;
  const liste = etat.appareils || [];
  const lignes = liste.length ? `<ul class="coffre-appareils">${liste.map((a) => `<li data-appareil="${echapper(a.id)}"><span><span class="t-corps-fort">${echapper(a.appareil || 'Appareil')}</span> <span class="t-3">· ${echapper(a.nom || '')}${a.cree ? ` · activé le ${echapper(dateCourte(a.cree))}` : ''}</span></span><button class="btn btn-fantome btn-petit" type="button" data-coffre="retirer-appareil" data-id="${echapper(a.id)}">Retirer</button></li>`).join('')}</ul>` : '';
  let action = '';
  if (!p) action = '<p class="t-petit t-3">Vérification de ce navigateur…</p>';
  else if (p.etat === 'non') action = `<p class="t-petit t-2" data-prf="non">${echapper(p.raison)} La phrase reste la seule clé sur cet appareil.</p>`;
  else action = `<button class="btn btn-secondaire btn-petit" type="button" data-coffre="activer-appareil" data-prf="${echapper(p.etat)}">Activer sur cet appareil</button>`;
  return `${lignes}${action}<p class="aide" style="margin-top:8px">Une copie de la clé, propre à l'appareil, que seul votre doigt ou votre visage ouvre. Changer la phrase retire tous les appareils.</p>`;
};

const dessinerJournal = () => {
  if (!etat || !etat.zone) return;
  const j = etat.zone.querySelector('[data-coffre-journal]');
  if (j) j.innerHTML = journalHtml();
  const d = etat.zone.querySelector('[data-coffre-derniere]');
  if (d) d.innerHTML = derniereHtml();
};

const derniereHtml = () => {
  const j = (etat.journal || []).find((x) => x.action === 'deverrouillage');
  return j ? `Dernière ouverture : ${echapper(j.nom || '')}, ${echapper(dateHeure(j.date))}.` : '';
};

const dessinerListe = () => {
  if (!etat || !etat.zone) return;
  const l = etat.zone.querySelector('[data-coffre-liste]');
  if (l) l.innerHTML = listeHtml();
};

const dessiner = () => {
  if (!etat || !etat.zone) return;
  const z = etat.zone;
  const actif = document.activeElement;
  const garde = actif && z.contains(actif) && actif.matches('[data-coffre-recherche], #coffre-phrase') ? { sel: actif.matches('#coffre-phrase') ? '#coffre-phrase' : '[data-coffre-recherche]', valeur: actif.value, pos: actif.selectionStart } : null;
  z.innerHTML = corpsHtml();
  if (garde) {
    const el = z.querySelector(garde.sel);
    if (el) { el.value = garde.valeur; el.focus(); try { el.setSelectionRange(garde.pos, garde.pos); } catch (e) { /* rien */ } }
  }
};

const corpsHtml = () => {
  const e = etat;
  const tete = (actions = '') => `<div class="section-tete"><h2>Coffre-fort</h2>${actions ? `<div class="rang">${actions}</div>` : ''}</div>`;
  if (e.erreur) {
    return `<section class="section" style="margin-top:0" data-coffre-etat="refuse">${tete()}<p class="t-corps-fort">Ce coffre n'est pas accessible.</p><p class="t-petit t-2">${echapper(e.erreur.code === 'permission-denied' ? "Seuls l'équipe Capmedia et le responsable du projet y ont accès." : lisible(e.erreur))}</p></section>`;
  }
  if (e.meta === undefined) return `<section class="section" style="margin-top:0">${tete()}${squelette('lignes', 3)}</section>`;

  if (e.meta === null) {
    return `<section class="section coffre" style="margin-top:0" data-coffre-etat="absent">
      ${tete()}
      <p class="t-corps coffre-chapeau">Un seul endroit pour les accès de ce projet : sites, consoles, comptes de paiement, stores. Identifiant, mot de passe, note. Chiffré de bout en bout.</p>
      ${equipe()
        ? `<div class="rang" style="margin:var(--e-4) 0"><button class="btn btn-principal" type="button" data-coffre="creer">Créer le coffre-fort</button></div>
           <p class="aide">L'application tire une phrase de ${MOTS_PAR_PHRASE} mots et vous la montre une seule fois. Vous la transmettez au client de vive voix ou sur papier.</p>`
        : '<p class="t-petit t-2" style="margin:var(--e-4) 0">Capmedia n\'a pas encore ouvert de coffre pour ce projet. Quand ce sera fait, la phrase vous sera transmise de vive voix ou sur papier, jamais par e-mail.</p>'}
      ${pourquoiHtml(true)}
    </section>`;
  }

  if (!e.cle) {
    const miens = (e.appareils || []).filter((a) => a.uid === moi());
    const parAppareil = miens.length && e.prf && e.prf.etat !== 'non';
    return `<section class="section coffre" style="margin-top:0" data-coffre-etat="verrouille">
      ${tete()}
      <p class="t-corps coffre-chapeau">Verrouillé. ${e.chiffrees.length ? `${e.chiffrees.length} accès rangé${e.chiffrees.length > 1 ? 's' : ''}, chiffré${e.chiffrees.length > 1 ? 's' : ''}.` : 'Aucun accès rangé pour l\'instant.'}</p>
      <form class="coffre-ouvrir" data-coffre-ouvrir autocomplete="off">
        <label class="etiquette-champ" for="coffre-phrase">Phrase du coffre</label>
        <input class="champ t-mono" id="coffre-phrase" name="phrase" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="${MOTS_PAR_PHRASE} mots séparés par des espaces" required>
        <p class="erreur-champ" data-coffre-refus style="display:none"></p>
        <div class="rang" style="gap:8px;margin-top:var(--e-3)">
          <button class="btn btn-principal" type="submit" data-coffre-deverrouiller>Déverrouiller</button>
          ${parAppareil ? '<button class="btn btn-secondaire" type="button" data-coffre="ouvrir-appareil">Avec Touch ID ou Face ID</button>' : ''}
        </div>
        <p class="aide" style="margin-top:var(--e-2)" data-coffre-derniere>${derniereHtml()}</p>
      </form>
      ${pourquoiHtml(false)}
      ${equipe() ? '<p class="t-petit t-3" style="margin-top:var(--e-4)">Phrase perdue ? <button class="btn btn-fantome btn-petit" type="button" data-coffre="effacer">Effacer le coffre et recommencer</button></p>' : ''}
    </section>`;
  }

  return `<section class="section coffre" style="margin-top:0" data-coffre-etat="ouvert">
    ${tete(`<button class="btn btn-secondaire btn-petit" type="button" data-coffre="verrouiller">${icone('cadenas')} Verrouiller</button>
      <button class="btn btn-principal btn-petit" type="button" data-coffre="ajouter">${icone('plus')} Ajouter un accès</button>
      <button class="btn-icone" type="button" data-coffre="menu" aria-label="Autres actions du coffre">${icone('points')}</button>`)}
    <p class="t-petit t-3 coffre-chapeau">Déverrouillé sur cet écran. Il se referme seul après cinq minutes sans activité, ou dès que vous quittez la page.</p>
    <input class="champ coffre-recherche" type="search" data-coffre-recherche placeholder="Rechercher un service, un identifiant, une note" aria-label="Rechercher dans le coffre" value="${echapper(e.recherche)}">
    <div class="coffre-liste" data-coffre-liste>${listeHtml()}</div>
    <div class="coffre-bas">
      <div><h3 class="coffre-titre">Ouvrir avec l'empreinte ou Face ID</h3>${appareilsHtml()}</div>
      <div><h3 class="coffre-titre">Qui a ouvert le coffre</h3><div data-coffre-journal>${journalHtml()}</div></div>
    </div>
    ${pourquoiHtml(false)}
  </section>`;
};

/* --------------------------------------------------------------------------
   Les gestes
   -------------------------------------------------------------------------- */

const brancher = (z) => {
  z.addEventListener('submit', (ev) => {
    const f = ev.target.closest('[data-coffre-ouvrir]');
    if (!f) return;
    ev.preventDefault();
    deverrouiller(f);
  });
  z.addEventListener('input', (ev) => {
    const r = ev.target.closest('[data-coffre-recherche]');
    if (r && etat) { etat.recherche = r.value; dessinerListe(); }
  });
  z.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-coffre]');
    if (!b || !etat) return;
    const id = b.dataset.id;
    const x = etat.entrees.find((y) => y.id === id);
    switch (b.dataset.coffre) {
      case 'creer': creer(b); break;
      case 'verrouiller': verrouiller(); break;
      case 'ajouter': editerEntree(null); break;
      case 'editer': if (x) editerEntree(x); break;
      case 'supprimer': supprimerEntree(id); break;
      case 'afficher': basculerMotDePasse(id); break;
      case 'copier-identifiant': if (x) copierValeur(x.identifiant, 'Identifiant copié.'); break;
      case 'copier-mdp': if (x) copierValeur(x.motDePasse, 'Mot de passe copié.'); break;
      case 'menu': ouvrirMenu(b); break;
      case 'activer-appareil': activer(b); break;
      case 'retirer-appareil': retirerAppareil(id); break;
      case 'ouvrir-appareil': ouvrirAvecEmpreinte(b); break;
      case 'effacer': effacerCoffre(); break;
      default: break;
    }
  });
};

const copierValeur = async (texte, message) => {
  try { await navigator.clipboard.writeText(texte); toast(message); }
  catch (e) { toast('Impossible de copier.', 'erreur'); }
};

const basculerMotDePasse = (id) => {
  if (etat.visibles.has(id)) { clearTimeout(etat.visibles.get(id)); etat.visibles.delete(id); }
  else {
    /* Un mot de passe affiché se remasque seul au bout de trente secondes. */
    etat.visibles.set(id, setTimeout(() => { if (etat && etat.visibles.has(id)) { etat.visibles.delete(id); dessinerListe(); } }, 30000));
  }
  dessinerListe();
};

const deverrouiller = async (f) => {
  const champ = f.querySelector('#coffre-phrase');
  const phrase = champ.value;
  if (!phrase.trim()) { champ.focus(); return; }
  const e = etat;
  /* Le dessin peut changer pendant le calcul (une écoute qui répond) : on
     relit les éléments dans la zone au moment d'agir. */
  const dans = (sel) => (e.zone ? e.zone.querySelector(sel) : null);
  const occupe = (oui) => { const b = dans('[data-coffre-deverrouiller]'); if (b) { b.classList.toggle('btn-charge', oui); b.disabled = oui; } };
  occupe(true);
  try {
    const cle = await ouvrirAvecPhrase(e.pid, e.meta, phrase);
    if (etat !== e) return;
    e.cle = cle;
    e.derniereActivite = Date.now();
    bddCoffre.journaliser(e.pid, e.env.session, 'deverrouillage', 'phrase').catch(() => {});
    await dechiffrerTout();
    dessiner();
  } catch (err) {
    if (etat !== e) return;
    if (err instanceof PhraseRefusee) {
      bddCoffre.journaliser(e.pid, e.env.session, 'echec', 'phrase').catch(() => {});
      const refus = dans('[data-coffre-refus]');
      const c = dans('#coffre-phrase');
      if (refus) { refus.textContent = err.message; refus.style.display = ''; }
      if (c) { c.setAttribute('aria-invalid', 'true'); c.select(); }
    } else toast(lisible(err), 'erreur');
  } finally {
    if (etat === e) occupe(false);
  }
};

const ouvrirAvecEmpreinte = async (b) => {
  const e = etat;
  const miens = e.appareils.filter((a) => a.uid === moi());
  await agir(b, async () => {
    const { credId, sortie } = await ouvrirParAppareil(miens);
    const fiche = miens.find((a) => a.credId === credId);
    if (!fiche) throw new Error('Cette clé ne correspond à aucun appareil du coffre.');
    try {
      const cle = await ouvrirAvecAppareil(e.pid, fiche.id, fiche, sortie);
      if (etat !== e) return;
      e.cle = cle; e.derniereActivite = Date.now();
    } finally { sortie.fill(0); }
    bddCoffre.journaliser(e.pid, e.env.session, 'deverrouillage', 'appareil').catch(() => {});
    await dechiffrerTout();
    dessiner();
  });
};

/* La phrase s'affiche ici, une fois. La fenêtre ne se ferme qu'après avoir
   coché « j'ai noté » ; la phrase n'est gardée nulle part ensuite. */
const montrerPhrase = (phrase, { changement = false } = {}) => {
  const pourQui = equipe() ? 'au client' : 'à Capmedia et aux autres responsables';
  /* Pas suivie par le verrou : on ne retire pas la phrase des yeux de
     qui est en train de la recopier à la main. */
  const m = modale({
    titre: changement ? 'La nouvelle phrase du coffre' : 'La phrase du coffre',
    fermable: false,
    corps: `
      <p class="t-corps">Notez-la maintenant : <strong>elle ne sera plus jamais affichée.</strong></p>
      <p class="coffre-phrase t-mono" data-coffre-phrase>${phrase.split(' ').map((m2) => `<span>${echapper(m2)}</span>`).join(' ')}</p>
      <button class="btn btn-secondaire btn-petit" type="button" data-copier-phrase>${icone('copier')} Copier la phrase</button>
      <div class="encart encart--attention" style="margin-top:var(--e-4)"><div>
        Transmettez-la ${pourQui} séparément : de vive voix ou sur papier. <strong>Jamais par e-mail, jamais dans un message du Hub.</strong>
        Sans elle, personne, pas même Capmedia, ne pourra rouvrir ce coffre.
      </div></div>
      <label class="coche" style="margin-top:var(--e-4)"><input type="checkbox" data-phrase-notee> <span>J'ai noté la phrase en lieu sûr.</span></label>`,
    pied: '<button class="btn btn-principal" type="button" data-phrase-ok disabled>Terminé</button>',
  });
  const ok = m.el.querySelector('[data-phrase-ok]');
  m.el.querySelector('[data-phrase-notee]').addEventListener('change', (ev) => { ok.disabled = !ev.target.checked; });
  m.el.querySelector('[data-copier-phrase]').addEventListener('click', () => copierValeur(phrase, 'Phrase copiée. Ne la collez dans aucun message.'));
  ok.addEventListener('click', () => m.fermer(true));
  return m.fin;
};

const creer = async (b) => {
  const e = etat;
  const oui = await confirmer({
    titre: 'Créer le coffre-fort ?',
    texte: `L'application va tirer une phrase de ${MOTS_PAR_PHRASE} mots. Elle s'affichera une seule fois : préparez de quoi la noter sur papier. Sans elle, le contenu du coffre est perdu.`,
    ok: 'Créer et voir la phrase',
  });
  if (!oui || etat !== e) return;
  let phrase = genererPhrase();
  const fait = await agir(b, async () => {
    const { enveloppe, cleCoffre } = await creerCoffre(e.pid, phrase);
    await bddCoffre.creer(e.pid, e.env.session, enveloppe);
    if (etat !== e) return;
    e.cle = cleCoffre; e.derniereActivite = Date.now(); e.entrees = [];
  });
  if (fait && etat === e) { dessiner(); await montrerPhrase(phrase); }
  phrase = null;
};

const changerPhrase = async () => {
  const e = etat;
  const oui = await confirmer({
    titre: 'Changer la phrase ?',
    texte: `Une nouvelle phrase de ${MOTS_PAR_PHRASE} mots remplace l'ancienne, qui n'ouvrira plus rien. Les accès rangés ne bougent pas. Les appareils à empreinte sont retirés : chacun les réactivera. Toutes les personnes du coffre devront recevoir la nouvelle phrase.`,
    ok: 'Changer la phrase',
  });
  if (!oui || etat !== e || !e.cle) return;
  let phrase = genererPhrase();
  const fait = await agir(null, async () => {
    const enveloppe = await envelopperPourPhrase(e.pid, e.cle, phrase);
    await bddCoffre.changerPhrase(e.pid, e.env.session, enveloppe, (e.appareils || []).map((a) => a.id));
  });
  if (fait && etat === e) await montrerPhrase(phrase, { changement: true });
  phrase = null;
};

const ouvrirMenu = (b) => menu(b, [
  { libelle: 'Changer la phrase', icone: 'cle', action: changerPhrase },
  { libelle: 'Verrouiller maintenant', icone: 'cadenas', action: () => verrouiller() },
]);

const activer = async (b) => {
  const e = etat;
  await agir(b, async () => {
    if (!e.cle) throw new Error('Déverrouillez le coffre d\'abord.');
    const { credId, selPrf, sortie } = await activerAppareil({ projetNom: e.projetNom });
    try {
      const aid = bddCoffre.nouvelId(e.pid, 'appareils');
      const copie = await envelopperPourAppareil(e.pid, aid, e.cle, sortie, deB64(selPrf));
      await bddCoffre.ajouterAppareil(e.pid, e.env.session, aid, { appareil: nomAppareil(), credId, selPrf, iv: copie.iv, cle: copie.cle });
    } finally { sortie.fill(0); }
  }, 'Empreinte activée sur cet appareil.');
};

const retirerAppareil = async (id) => {
  const e = etat;
  const a = (e.appareils || []).find((x) => x.id === id);
  if (!a) return;
  const oui = await confirmer({ titre: 'Retirer cet appareil ?', texte: `${a.appareil || 'Cet appareil'} n'ouvrira plus le coffre par l'empreinte. La phrase reste valable.`, ok: 'Retirer', danger: true });
  if (oui && etat === e) await agir(null, () => bddCoffre.retirerAppareil(e.pid, e.env.session, id), 'Appareil retiré.');
};

const supprimerEntree = async (id, m = null) => {
  const e = etat;
  const x = e.entrees.find((y) => y.id === id);
  const oui = await confirmer({ titre: `Supprimer ${x && !x.illisible ? `« ${x.service} »` : 'cette entrée'} ?`, texte: 'Elle disparaît du coffre pour tout le monde. Cette action ne se rattrape pas.', ok: 'Supprimer', danger: true });
  if (!oui || etat !== e) return;
  const fait = await agir(null, () => bddCoffre.supprimerEntree(e.pid, e.env.session, id), 'Accès supprimé.');
  if (fait && m) m.fermer(true);
};

const effacerCoffre = async () => {
  const e = etat;
  const oui = await confirmer({
    titre: 'Effacer le coffre ?',
    texte: `Sans la phrase, les ${e.chiffrees.length} accès rangés sont illisibles pour toujours. Effacer le coffre les supprime, et vous permet d'en créer un neuf avec une nouvelle phrase. Le journal des ouvertures reste.`,
    ok: 'Effacer définitivement', danger: true,
  });
  if (!oui || etat !== e) return;
  await agir(null, () => bddCoffre.effacer(e.pid, e.env.session, e.chiffrees.map((c) => c.id), (e.appareils || []).map((a) => a.id)), 'Coffre effacé.');
};

/* Générer un mot de passe solide : 20 signes, sans les caractères qu'on
   confond à la lecture. */
const genererMotDePasse = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.!?@#';
  const plafond = Math.floor(256 / alphabet.length) * alphabet.length;
  let s = '';
  while (s.length < 20) {
    const o = crypto.getRandomValues(new Uint8Array(1))[0];
    if (o < plafond) s += alphabet[o % alphabet.length];
  }
  return s;
};

const BORNES = { service: 120, lien: 500, identifiant: 300, motDePasse: 1000, note: 4000 };

const editerEntree = (x) => {
  const e = etat;
  if (!e.cle) return;
  if (!x && e.chiffrees.length >= MAX_ENTREES) { toast(`${MAX_ENTREES} accès au plus par coffre.`, 'erreur'); return; }
  const v = x || { service: '', lien: '', identifiant: '', motDePasse: '', note: '' };
  const m = suivre(modale({
    titre: x ? 'Modifier l\'accès' : 'Ajouter un accès',
    sousTitre: 'Tout est chiffré avant de quitter votre navigateur, nom du service compris.',
    corps: `<form data-forme-coffre autocomplete="off">
      <div class="groupe"><label class="etiquette-champ" for="cf-service">Service</label>
        <input class="champ" id="cf-service" name="service" maxlength="${BORNES.service}" value="${echapper(v.service)}" placeholder="Stripe, Firebase, App Store Connect…" required></div>
      <div class="groupe"><label class="etiquette-champ" for="cf-lien">Lien <span class="facultatif">(facultatif)</span></label>
        <input class="champ" id="cf-lien" name="lien" type="url" maxlength="${BORNES.lien}" value="${echapper(v.lien)}" placeholder="https://"></div>
      <div class="groupe"><label class="etiquette-champ" for="cf-identifiant">Identifiant <span class="facultatif">(facultatif)</span></label>
        <input class="champ t-mono" id="cf-identifiant" name="identifiant" maxlength="${BORNES.identifiant}" value="${echapper(v.identifiant)}" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
      <div class="groupe"><label class="etiquette-champ" for="cf-mdp">Mot de passe <span class="facultatif">(facultatif)</span></label>
        <div class="coffre-mdp-champ"><input class="champ t-mono" id="cf-mdp" name="motDePasse" type="password" maxlength="${BORNES.motDePasse}" value="${echapper(v.motDePasse)}" autocomplete="new-password" autocapitalize="none" spellcheck="false">
        <button class="btn btn-doux btn-petit" type="button" data-voir-mdp aria-pressed="false">Afficher</button>
        <button class="btn btn-doux btn-petit" type="button" data-generer-mdp>Générer</button></div></div>
      <div class="groupe"><label class="etiquette-champ" for="cf-note">Note <span class="facultatif">(facultatif)</span></label>
        <textarea class="zone" id="cf-note" name="note" rows="3" maxlength="${BORNES.note}" placeholder="Double authentification, contact, à quoi sert ce compte…">${echapper(v.note)}</textarea></div>
    </form>`,
    pied: `${x ? '<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span>' : ''}
      <button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
      <button class="btn btn-principal" type="button" data-enregistrer>Enregistrer</button>`,
  }));
  const f = m.el.querySelector('[data-forme-coffre]');
  const mdp = f.querySelector('#cf-mdp');
  m.el.querySelector('[data-voir-mdp]').addEventListener('click', (ev) => {
    const voir = mdp.type === 'password';
    mdp.type = voir ? 'text' : 'password';
    ev.currentTarget.textContent = voir ? 'Masquer' : 'Afficher';
    ev.currentTarget.setAttribute('aria-pressed', String(voir));
  });
  m.el.querySelector('[data-generer-mdp]').addEventListener('click', () => { mdp.value = genererMotDePasse(); mdp.type = 'text'; m.el.querySelector('[data-voir-mdp]').textContent = 'Masquer'; });
  const suppr = m.el.querySelector('[data-suppr]');
  if (suppr) suppr.addEventListener('click', () => supprimerEntree(x.id, m));
  const enregistrer = m.el.querySelector('[data-enregistrer]');
  const valider = async () => {
    const d = {};
    for (const k of Object.keys(BORNES)) d[k] = String((f.elements[k] || {}).value || '').trim().slice(0, BORNES[k]);
    f.querySelectorAll('.erreur-champ').forEach((n) => n.remove());
    if (!d.service) {
      const n = document.createElement('p'); n.className = 'erreur-champ'; n.textContent = 'Le nom du service est obligatoire.';
      f.elements.service.closest('.groupe').appendChild(n); f.elements.service.focus(); return;
    }
    const fait = await agir(enregistrer, async () => {
      if (etat !== e || !e.cle) throw new Error('Le coffre s\'est verrouillé. Rouvrez-le, puis recommencez.');
      const id = x ? x.id : bddCoffre.nouvelId(e.pid);
      const chiffre = await chiffrerEntree(e.pid, id, e.cle, d);
      await bddCoffre.ecrireEntree(e.pid, e.env.session, id, chiffre, !x);
    }, x ? 'Accès mis à jour.' : 'Accès ajouté.');
    if (fait) m.fermer(true);
  };
  enregistrer.addEventListener('click', valider);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); valider(); });
};
