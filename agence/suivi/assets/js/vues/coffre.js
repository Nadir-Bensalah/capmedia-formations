/* ==========================================================================
   L'onglet « Coffre-fort » d'un projet : les accès du client (sites,
   consoles, stores), chiffrés dans le navigateur. Partagé par l'équipe et
   par le ou les responsables du projet ; un collaborateur ne le voit pas.

   La page d'un projet se redessine quand le magasin bouge. Le coffre, lui,
   garde son nœud : à chaque dessin de la page, on remet en place la même
   zone (avec ce qu'on était en train de taper), au lieu d'en refaire une.

   Verrouillage : à la main, après cinq minutes sans geste, dès que l'onglet
   du navigateur passe en arrière-plan, quand on quitte l'onglet du projet
   ou la page. Verrouiller, c'est vider la zone affichée et oublier la clé
   et le clair : il ne reste en mémoire que des chiffrés.
   ========================================================================== */

import { echapper, dateHeure, dateCourte, estResponsable, nomAffiche } from '../noyau.js';
import { icone, modale, confirmer, toast, agir, lisible, menu, squelette } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, coffre as bddCoffre, marqueCoffre } from '../donnees.js';
import {
  genererPhrase, creerCoffre, nouvelleCle, ouvrirAvecPhrase, envelopperPourPhrase, chiffrerEntree, dechiffrerEntree,
  envelopperPourAppareil, ouvrirAvecAppareil, deB64, PhraseRefusee, MOTS_PAR_PHRASE,
} from '../coffre-chiffre.js';
import { detecterPrf, activerAppareil, ouvrirParAppareil, nomAppareil } from '../coffre-appareil.js';

export const INACTIVITE = 5 * 60 * 1000;
export const VIDAGE_PRESSE_PAPIERS = 30 * 1000;
const MASQUE = '••••••••••';
/* Le renouvellement de la clé rechiffre tout en un seul lot : le plafond
   des entrées laisse la place aux appareils et aux trois écritures fixes. */
const MAX_ENTREES = 350;

/* Les attributs qui écartent les gestionnaires de mots de passe (navigateur,
   1Password, LastPass, Bitwarden, Dashlane) : la phrase et les accès du
   client n'ont rien à faire dans le trousseau d'un tiers. */
/* Le nom de la clé de cet appareil, tel que la personne la connaît :
   Windows Hello sous Windows, Touch ID ou Face ID chez Apple, sinon la
   clé de l'appareil (avant, « Touch ID » même sous Windows). */
const nomDeLaCle = () => {
  const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  if (/Windows/i.test(ua)) return 'Avec Windows Hello';
  if (/Mac|iPhone|iPad/i.test(ua)) return 'Avec Touch ID ou Face ID';
  return 'Avec la clé de cet appareil';
};
const SANS_TROUSSEAU = 'autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"';

/** Qui voit l'onglet : l'équipe, et le responsable côté client. */
export const voitLeCoffre = (env, projet) => env.role === 'equipe' || Boolean(projet && estResponsable(env.session, projet));

/* Un seul coffre ouvert à la fois : celui de la page affichée. */
let etat = null;

const moi = () => etat.env.session.utilisateur.uid;
const equipe = () => etat.env.role === 'equipe';

/* --------------------------------------------------------------------------
   Les noms : de l'annuaire et de la fiche du projet, jamais du document
   -------------------------------------------------------------------------- */

const nomDe = (cote, uid) => {
  if (cote === 'equipe') {
    const f = (magasin.lire(K.equipe) || []).find((x) => x.id === uid);
    return (f && f.nom) || 'Un membre de l\'équipe';
  }
  const p = (etat && etat.projet) || {};
  const trouve = [
    ...(Array.isArray(p.personnesClient) ? p.personnesClient : []),
    ...(magasin.lire(K.interlocuteurs(etat.pid)) || []),
    ...(Array.isArray(p.contacts) ? p.contacts : []),
  ].find((x) => x && x.uid === uid && x.nom);
  if (trouve) return trouve.nom;
  if (uid === moi() && !equipe()) return nomAffiche(etat.env.session) || 'Client';
  return 'Un client';
};
/* Le côté d'une personne : l'équipe figure dans l'annuaire (côté client)
   ou dans la liste de l'équipe (côté Capmedia) ; tout autre est client. */
const coteDe = (uid) => ((magasin.lire(K.equipe) || []).some((f) => f.id === uid) ? 'equipe' : 'client');
const COTES = { equipe: 'équipe Capmedia', client: 'client' };
const quiHtml = (cote, uid) => `<span class="t-corps-fort">${echapper(nomDe(cote, uid))}</span> <span class="t-3">(${COTES[cote] || 'inconnu'})</span>`;

/* Les personnes qui connaissent la clé en cours (les « porteurs ») et
   n'ont plus accès au projet : un client qui n'est plus responsable, un
   membre de l'équipe désactivé ou retiré du projet. Côté client, l'équipe
   ne se lit pas (seul l'annuaire, sans les rôles) : seuls les clients
   comptent. */
const sortis = () => {
  if (!etat || !etat.meta || !etat.projet) return [];
  const p = etat.projet;
  const membres = p.membres || [];
  const roles = p.roles || {};
  const fiches = magasin.lire(K.equipe) || [];
  return (etat.meta.porteurs || []).map((m) => { const i = String(m).indexOf(':'); return { cote: m.slice(0, i), uid: m.slice(i + 1) }; })
    .filter(({ cote, uid }) => {
      if (cote === 'client') return !(membres.includes(uid) && roles[uid] === 'responsable');
      if (cote === 'equipe' && equipe()) {
        const f = fiches.find((x) => x.id === uid);
        if (!f || f.actif === false) return true;
        return !(f.role === 'admin' || (f.role === 'agent' && (f.projets || []).includes(etat.pid)));
      }
      return false;
    });
};

/* --------------------------------------------------------------------------
   Monter, démonter, verrouiller
   -------------------------------------------------------------------------- */

const activite = () => { if (etat) etat.derniereActivite = Date.now(); };
const surveiller = () => {
  if (!etat || !etat.cle) return;
  if (Date.now() - etat.derniereActivite >= INACTIVITE) verrouiller('Coffre verrouillé après cinq minutes sans activité.');
};
/* L'onglet du navigateur passe derrière un autre, ou l'appareil se met en
   veille : le coffre se ferme aussitôt. */
const surVisibilite = () => {
  if (document.visibilityState === 'hidden') { if (etat && etat.cle) verrouiller(); }
  else surveiller();
};
/* La page part (ou entre dans le cache de retour arrière) : rien ne reste
   affiché. Si elle revient par « Précédent », elle revient verrouillée. */
const surDepart = () => { if (!etat) return; verrouiller(); if (etat.zone) etat.zone.replaceChildren(); };
const surRetour = (ev) => { if (ev.persisted && etat) { verrouiller(); } };
const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];

export const monterCoffre = (place, { pid, env, projet }) => {
  if (!place) return;
  if (etat && etat.pid !== pid) demonterCoffre();
  if (!etat) {
    etat = {
      pid, env, projet: projet || null, projetNom: (projet && projet.nom) || 'projet',
      meta: undefined, chiffrees: [], appareils: [], journal: [], erreur: null,
      cle: null, g: null, entrees: [], recherche: '', visibles: new Map(), modales: new Set(),
      prf: null, derniereActivite: Date.now(), zone: null, arret: null, minuteur: null, ecoutes: [],
    };
    const e = etat;
    e.arret = bddCoffre.ecouter(pid, {
      meta: (m) => {
        if (etat !== e) return;
        e.meta = m;
        if (!m && e.cle) { verrouiller(); return; }
        /* La clé a été renouvelée ailleurs : celle qu'on tient ne lit plus
           rien. On referme, et on dit pourquoi. */
        if (m && e.cle && m.enveloppe !== e.g) { verrouiller('La clé du coffre vient d\'être renouvelée. Demandez la nouvelle phrase.'); return; }
        dessiner();
      },
      entrees: (l) => { if (etat !== e) return; e.chiffrees = l; if (e.cle) dechiffrerTout().then(dessiner); else dessiner(); },
      appareils: (l) => { if (etat !== e) return; e.appareils = l; dessiner(); },
      journal: (l) => { if (etat !== e) return; e.journal = l; dessinerJournal(); },
      erreur: (err) => { if (etat !== e) return; e.erreur = err; oublier(); dessiner(); },
    });
    /* Les rôles du projet et l'équipe bougent sans que la page se
       redessine : le bandeau « renouveler la clé » les suit en direct. */
    e.ecoutes.push(magasin.sur(K.projet(pid), (v) => { if (etat === e && v) { e.projet = v; dessinerBandeau(); dessinerJournal(); } }));
    e.ecoutes.push(magasin.sur(K.equipe, () => { if (etat === e) { dessinerBandeau(); dessinerJournal(); } }));
    detecterPrf().then((r) => { if (etat === e) { e.prf = r; dessiner(); } });
    GESTES.forEach((g) => document.addEventListener(g, activite, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('pagehide', surDepart);
    window.addEventListener('pageshow', surRetour);
    e.minuteur = setInterval(surveiller, 10000);
  }
  etat.env = env;
  if (projet) { etat.projet = projet; if (projet.nom) etat.projetNom = projet.nom; }
  if (etat.zone === place) { dessiner(); return; }
  if (etat.zone) {
    /* La page s'est redessinée : on remet la zone d'avant à sa place,
       avec le champ en cours de frappe et son focus. */
    const actif = document.activeElement;
    const avait = etat.zone.contains(actif);
    const debut = avait && typeof actif.selectionStart === 'number' ? actif.selectionStart : null;
    place.replaceWith(etat.zone);
    if (avait) { actif.focus(); if (debut !== null) { try { actif.setSelectionRange(debut, debut); } catch (err) { /* champ sans curseur */ } } }
    dessinerBandeau();
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
  if (e.zone) e.zone.replaceChildren();
  if (e.arret) e.arret();
  e.ecoutes.forEach((f) => { try { f(); } catch (err) { /* déjà coupée */ } });
  clearInterval(e.minuteur);
  GESTES.forEach((g) => document.removeEventListener(g, activite, { capture: true }));
  document.removeEventListener('visibilitychange', surVisibilite);
  window.removeEventListener('pagehide', surDepart);
  window.removeEventListener('pageshow', surRetour);
  etat = null;
};

/* Oublier la clé et tout le clair. La mémoire d'un navigateur ne s'efface
   pas sur commande : on lâche toutes les références, le reste est au
   ramasse-miettes. */
const oublier = () => {
  if (!etat) return;
  etat.cle = null;
  etat.g = null;
  etat.entrees = [];
  etat.visibles.forEach((t) => clearTimeout(t));
  etat.visibles.clear();
  viderPressePapiers();
};

const verrouiller = (message = '') => {
  if (!etat) return;
  oublier();
  etat.modales.forEach((m) => m.fermer());
  etat.modales.clear();
  if (etat.zone) etat.zone.replaceChildren();
  dessiner();
  if (message) toast(message, 'info');
};

/* Une modale du coffre se referme d'office au verrouillage. */
const suivre = (m) => { etat.modales.add(m); m.fin.then(() => { if (etat) etat.modales.delete(m); }); return m; };

/* --------------------------------------------------------------------------
   Le presse-papiers : un mot de passe copié ne s'y attarde pas
   -------------------------------------------------------------------------- */

let vidage = null;
let vidageEnAttente = false;
const viderMaintenant = () => {
  vidageEnAttente = false;
  window.removeEventListener('focus', viderMaintenant);
  try { navigator.clipboard.writeText('').catch(() => {}); } catch (e) { /* refusé */ }
};
/* Le navigateur n'écrit dans le presse-papiers que si la page a le focus :
   sinon on attend qu'elle le reprenne. */
const viderPressePapiers = () => {
  if (!vidageEnAttente) return;
  clearTimeout(vidage);
  if (document.hasFocus()) viderMaintenant();
  else window.addEventListener('focus', viderMaintenant, { once: true });
};
const copierMotDePasse = async (texte) => {
  try {
    await navigator.clipboard.writeText(texte);
    vidageEnAttente = true;
    clearTimeout(vidage);
    vidage = setTimeout(viderPressePapiers, VIDAGE_PRESSE_PAPIERS);
    toast('Mot de passe copié. Le presse-papiers sera vidé dans 30 secondes.');
  } catch (e) { toast('Impossible de copier.', 'erreur'); }
};

/* --------------------------------------------------------------------------
   Déchiffrer
   -------------------------------------------------------------------------- */

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const dechiffrerTout = async () => {
  const e = etat;
  if (!e || !e.cle) return;
  const cle = e.cle;
  const lues = await Promise.all(e.chiffrees.map(async (c) => {
    try { return { id: c.id, n: c.n, g: c.g, ...(await dechiffrerEntree(e.pid, c.id, cle, c)) }; }
    catch (err) { return { id: c.id, n: c.n, g: c.g, illisible: true, service: 'Entrée illisible' }; }
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
  'cle-renouvelee': 'a renouvelé la clé et la phrase',
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
  return `<ul class="coffre-journal">${l.map((j) => `<li data-journal="${echapper(j.action)}" data-cote="${echapper(j.cote)}">${quiHtml(j.cote, j.uid)} ${echapper(LIBELLES_JOURNAL[j.action] || j.action)}${j.action === 'deverrouillage' ? echapper(MOYENS[j.moyen] || '') : ''}<span class="t-3"> · ${echapper(dateHeure(j.date))}</span></li>`).join('')}</ul>`;
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
    return `<article class="coffre-entree" data-entree="${echapper(x.id)}" data-illisible><div class="coffre-entree-tete"><h3>Entrée illisible</h3>
      <button class="btn btn-fantome btn-petit" type="button" data-coffre="supprimer" data-id="${echapper(x.id)}">Supprimer</button></div>
      <p class="t-petit t-3">Elle ne se déchiffre pas avec la clé de ce coffre : elle a été abîmée, remise à une version antérieure, ou recopiée d'ailleurs.</p></article>`;
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

/* Les appareils de la clé en cours ; ceux d'une clé renouvelée ne
   comptent plus (le renouvellement les retire, de toute façon). */
const appareilsCourants = () => (etat.appareils || []).filter((a) => etat.meta && a.g === etat.meta.enveloppe);

const appareilsHtml = () => {
  const p = etat.prf;
  const liste = appareilsCourants();
  const lignes = liste.length ? `<ul class="coffre-appareils">${liste.map((a) => `<li data-appareil="${echapper(a.id)}"><span><span class="t-corps-fort">${echapper(a.appareil || 'Appareil')}</span> <span class="t-3">· ${quiHtml(coteDe(a.uid), a.uid)}${dateCourte(a.cree) ? ` · activé le ${echapper(dateCourte(a.cree))}` : ''}</span></span><button class="btn btn-fantome btn-petit" type="button" data-coffre="retirer-appareil" data-id="${echapper(a.id)}">Retirer</button></li>`).join('')}</ul>` : '';
  let action = '';
  if (!p) action = '<p class="t-petit t-3">Vérification de ce navigateur…</p>';
  else if (p.etat === 'non') action = `<p class="t-petit t-2" data-prf="non">${echapper(p.raison)} La phrase reste la seule clé sur cet appareil.</p>`;
  else action = `<button class="btn btn-secondaire btn-petit" type="button" data-coffre="activer-appareil" data-prf="${echapper(p.etat)}">Activer sur cet appareil</button>`;
  return `${lignes}${action}<p class="aide" style="margin-top:8px">Une copie de la clé, propre à l'appareil, que seul votre doigt ou votre visage ouvre. Renouveler la clé retire tous les appareils.</p>`;
};

const bandeauHtml = () => {
  const s = sortis();
  if (!s.length) return '';
  const noms = s.map(({ cote, uid }) => `${nomDe(cote, uid)} (${COTES[cote]})`);
  const plusieurs = s.length > 1;
  return `<div class="encart encart--attention coffre-bandeau" data-coffre-bandeau><div>
    <p><strong>${echapper(noms.join(', '))}</strong> ${plusieurs ? 'ont' : 'a'} connu la clé de ce coffre et ${plusieurs ? 'n\'ont' : 'n\'a'} plus accès au projet.</p>
    <p style="margin-top:6px">Renouvelez la clé : une nouvelle phrase, et tous les accès rechiffrés avec une clé neuve. Ce qui a pu être lu avant reste connu de ${plusieurs ? 'ces personnes' : 'cette personne'} : changez aussi, chez chaque service, les mots de passe qui comptent.</p>
    ${etat.cle
      ? '<button class="btn btn-principal btn-petit" type="button" data-coffre="renouveler" style="margin-top:10px">Renouveler la clé et la phrase</button>'
      : '<p class="t-petit" style="margin-top:6px">Déverrouillez le coffre pour renouveler la clé.</p>'}
  </div></div>`;
};

const dessinerBandeau = () => {
  if (!etat || !etat.zone) return;
  const z = etat.zone.querySelector('[data-coffre-bandeau-zone]');
  if (z) z.innerHTML = bandeauHtml();
};

const derniereHtml = () => {
  const j = (etat.journal || []).find((x) => x.action === 'deverrouillage');
  return j ? `Dernière ouverture : ${quiHtml(j.cote, j.uid)}, ${echapper(dateHeure(j.date))}.` : '';
};

const dessinerJournal = () => {
  if (!etat || !etat.zone) return;
  const j = etat.zone.querySelector('[data-coffre-journal]');
  if (j) j.innerHTML = journalHtml();
  const d = etat.zone.querySelector('[data-coffre-derniere]');
  if (d) d.innerHTML = derniereHtml();
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
  const garde = actif && z.contains(actif) && actif.matches('[data-coffre-recherche], #coffre-mots') ? { sel: actif.matches('#coffre-mots') ? '#coffre-mots' : '[data-coffre-recherche]', valeur: actif.value, pos: actif.selectionStart } : null;
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
           <p class="aide">L'application tire une phrase de ${MOTS_PAR_PHRASE} mots et vous la montre une seule fois. Vous la recopiez sur papier et la transmettez au client de vive voix ou sur papier.</p>`
        /* Pas d'impasse : le client demande l'ouverture par un ticket
           prérempli, l'équipe le reçoit comme toute demande. */
        : `<p class="t-petit t-2" style="margin:var(--e-4) 0">Le coffre de ce projet n'est pas encore ouvert. Demandez-le : nous le créons, puis la phrase qui l'ouvre vous est transmise de vive voix ou sur papier, jamais par e-mail.</p>
           <div class="rang" style="margin:var(--e-4) 0"><a class="btn btn-principal" data-coffre-demander href="#/projets/${encodeURIComponent(e.pid)}/nouvelle-demande?type=technique&amp;titre=${encodeURIComponent("Ouverture du coffre-fort")}">Demander l'ouverture du coffre</a></div>`}
      ${pourquoiHtml(true)}
    </section>`;
  }

  if (!e.cle) {
    const miens = appareilsCourants().filter((a) => a.uid === moi());
    const parAppareil = miens.length && e.prf && e.prf.etat !== 'non';
    return `<section class="section coffre" style="margin-top:0" data-coffre-etat="verrouille">
      ${tete()}
      <div data-coffre-bandeau-zone>${bandeauHtml()}</div>
      <p class="t-corps coffre-chapeau">Verrouillé. ${e.chiffrees.length ? `${e.chiffrees.length} accès rangé${e.chiffrees.length > 1 ? 's' : ''}, chiffré${e.chiffrees.length > 1 ? 's' : ''}.` : 'Aucun accès rangé pour l\'instant.'}</p>
      <form class="coffre-ouvrir" data-coffre-ouvrir autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other">
        <label class="etiquette-champ" for="coffre-mots">Phrase du coffre</label>
        <input class="champ t-mono coffre-masque" id="coffre-mots" name="coffre-mots" type="text" ${SANS_TROUSSEAU} placeholder="${MOTS_PAR_PHRASE} mots séparés par des espaces" required>
        <label class="coche"><input type="checkbox" data-coffre-voir-mots> <span>Afficher les mots</span></label>
        <p class="erreur-champ" data-coffre-refus style="display:none"></p>
        <div class="rang" style="gap:8px;margin-top:var(--e-3)">
          <button class="btn btn-principal" type="submit" data-coffre-deverrouiller>Déverrouiller</button>
          ${parAppareil ? `<button class="btn btn-secondaire" type="button" data-coffre="ouvrir-appareil">${echapper(nomDeLaCle())}</button>` : ''}
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
    <div data-coffre-bandeau-zone>${bandeauHtml()}</div>
    <p class="t-petit t-3 coffre-chapeau">Déverrouillé sur cet écran. Il se referme seul après cinq minutes sans activité, dès que cet onglet passe en arrière-plan, ou dès que vous quittez la page.</p>
    <input class="champ coffre-recherche" type="search" data-coffre-recherche ${SANS_TROUSSEAU} placeholder="Rechercher un service, un identifiant, une note" aria-label="Rechercher dans le coffre" value="${echapper(e.recherche)}">
    <div class="coffre-liste" data-coffre-liste>${listeHtml()}</div>
    <div class="coffre-bas">
      <div><h3 class="coffre-titre">Ouvrir avec l'empreinte ou Face ID</h3>${appareilsHtml()}</div>
      <div><h3 class="coffre-titre">Qui a ouvert le coffre</h3><div data-coffre-journal>${journalHtml()}</div></div>
    </div>
    <div class="coffre-renouveler">
      <h3 class="coffre-titre">Renouveler la clé</h3>
      <p class="t-petit t-2">Une nouvelle phrase, et tous les accès rechiffrés avec une clé neuve : l'ancienne phrase et l'ancienne clé ne déchiffrent plus rien de ce qui est enregistré. À faire quand quelqu'un qui connaissait la phrase quitte le projet, ou si elle a pu fuiter. Ce qui a déjà été lu reste connu : changez alors aussi les mots de passe chez les services.</p>
      <button class="btn btn-secondaire btn-petit" type="button" data-coffre="renouveler" style="margin-top:8px">Renouveler la clé et la phrase</button>
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
  z.addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-coffre-voir-mots]');
    const champ = c && z.querySelector('#coffre-mots');
    if (champ) champ.classList.toggle('coffre-masque', !c.checked);
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
      case 'copier-identifiant': if (x) copierTexte(x.identifiant, 'Identifiant copié.'); break;
      case 'copier-mdp': if (x) copierMotDePasse(x.motDePasse); break;
      case 'menu': ouvrirMenu(b); break;
      case 'renouveler': renouveler(b); break;
      case 'activer-appareil': activer(b); break;
      case 'retirer-appareil': retirerAppareil(id); break;
      case 'ouvrir-appareil': ouvrirAvecEmpreinte(b); break;
      case 'effacer': effacerCoffre(); break;
      default: break;
    }
  });
};

const copierTexte = async (texte, message) => {
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

/* Ouvert : on tient la clé de la génération en cours, et l'on s'inscrit
   parmi ceux qui la connaissent (le bandeau de renouvellement s'en sert). */
const ouvert = async (e, cle, moyen) => {
  e.cle = cle;
  e.g = e.meta.enveloppe;
  e.derniereActivite = Date.now();
  bddCoffre.journaliser(e.pid, e.env.session, 'deverrouillage', moyen).catch(() => {});
  if (!(e.meta.porteurs || []).includes(marqueCoffre(e.env.session))) bddCoffre.porter(e.pid, e.env.session).catch(() => {});
  await dechiffrerTout();
  dessiner();
};

const deverrouiller = async (f) => {
  const champ = f.querySelector('#coffre-mots');
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
    await ouvert(e, cle, 'phrase');
  } catch (err) {
    if (etat !== e) return;
    if (err instanceof PhraseRefusee) {
      bddCoffre.journaliser(e.pid, e.env.session, 'echec', 'phrase').catch(() => {});
      const refus = dans('[data-coffre-refus]');
      const c = dans('#coffre-mots');
      if (refus) { refus.textContent = err.message; refus.style.display = ''; }
      if (c) { c.setAttribute('aria-invalid', 'true'); c.select(); }
    } else toast(lisible(err), 'erreur');
  } finally {
    if (etat === e) occupe(false);
  }
};

const ouvrirAvecEmpreinte = async (b) => {
  const e = etat;
  const miens = appareilsCourants().filter((a) => a.uid === moi());
  await agir(b, async () => {
    const { credId, sortie } = await ouvrirParAppareil(miens);
    const fiche = miens.find((a) => a.credId === credId);
    if (!fiche) throw new Error('Cette clé ne correspond à aucun appareil du coffre.');
    let cle;
    try { cle = await ouvrirAvecAppareil(e.pid, fiche.id, fiche, sortie); } finally { sortie.fill(0); }
    if (etat !== e) return;
    await ouvert(e, cle, 'appareil');
  });
};

/* La phrase s'affiche ici, une fois, pour être recopiée à la main : pas de
   bouton « copier », une phrase collée finit toujours dans un message. La
   fenêtre ne se ferme qu'après « j'ai noté » ; la phrase n'est gardée
   nulle part ensuite. */
const montrerPhrase = (phrase, { changement = false } = {}) => {
  const pourQui = equipe() ? 'au client' : 'à Capmedia et aux autres responsables';
  /* Pas suivie par le verrou : on ne retire pas la phrase des yeux de
     qui est en train de la recopier. */
  const m = modale({
    titre: changement ? 'La nouvelle phrase du coffre' : 'La phrase du coffre',
    fermable: false,
    corps: `
      <p class="t-corps">Recopiez-la à la main, sur papier, maintenant : <strong>elle ne sera plus jamais affichée.</strong></p>
      <p class="coffre-phrase t-mono" data-coffre-phrase>${phrase.split(' ').map((m2) => `<span>${echapper(m2)}</span>`).join(' ')}</p>
      <div class="encart encart--attention" style="margin-top:var(--e-4)"><div>
        Transmettez-la ${pourQui} séparément : de vive voix ou sur papier. <strong>Jamais par e-mail, jamais dans un message du Hub.</strong>
        Sans elle, personne, pas même Capmedia, ne pourra rouvrir ce coffre.
      </div></div>
      <label class="coche" style="margin-top:var(--e-4)"><input type="checkbox" data-phrase-notee> <span>J'ai recopié la phrase et je la range en lieu sûr.</span></label>`,
    pied: '<button class="btn btn-principal" type="button" data-phrase-ok disabled>Terminé</button>',
  });
  const ok = m.el.querySelector('[data-phrase-ok]');
  m.el.querySelector('[data-phrase-notee]').addEventListener('change', (ev) => { ok.disabled = !ev.target.checked; });
  ok.addEventListener('click', () => m.fermer(true));
  return m.fin;
};

const creer = async (b) => {
  const e = etat;
  const oui = await confirmer({
    titre: 'Créer le coffre-fort ?',
    texte: `L'application va tirer une phrase de ${MOTS_PAR_PHRASE} mots. Elle s'affichera une seule fois : préparez de quoi la recopier sur papier. Sans elle, le contenu du coffre est perdu.`,
    ok: 'Créer et voir la phrase',
  });
  if (!oui || etat !== e) return;
  let phrase = genererPhrase();
  const fait = await agir(b, async () => {
    const { enveloppe, cleCoffre } = await creerCoffre(e.pid, phrase);
    const numero = await bddCoffre.creer(e.pid, e.env.session, enveloppe);
    if (etat !== e) return;
    e.cle = cleCoffre; e.g = numero; e.derniereActivite = Date.now(); e.entrees = [];
  });
  if (fait && etat === e) { dessiner(); await montrerPhrase(phrase); }
  phrase = null;
};

/* Nouvelle phrase ET nouvelle clé : chaque entrée est rechiffrée avec une
   clé neuve, dans le même lot que la nouvelle enveloppe. */
const renouveler = async (b) => {
  const e = etat;
  if (!e.cle) return;
  if (e.entrees.some((x) => x.illisible)) { toast('Des entrées sont illisibles : supprimez-les d\'abord, elles ne peuvent pas être rechiffrées.', 'erreur'); return; }
  const oui = await confirmer({
    titre: 'Renouveler la clé et la phrase ?',
    texte: `Une clé neuve est tirée, et tous les accès sont rechiffrés avec elle, sous une nouvelle phrase de ${MOTS_PAR_PHRASE} mots. L'ancienne phrase et l'ancienne clé ne déchiffrent plus rien de ce qui est enregistré. Ce que quelqu'un a déjà lu, il le garde : en cas de fuite, changez aussi les mots de passe chez les services concernés. Les appareils à empreinte sont retirés, et toutes les personnes du coffre devront recevoir la nouvelle phrase.`,
    ok: 'Renouveler',
  });
  if (!oui || etat !== e || !e.cle) return;
  let phrase = genererPhrase();
  const fait = await agir(b, async () => {
    const numero = (e.meta.enveloppe || 0) + 1;
    const cle = await nouvelleCle();
    const enveloppe = await envelopperPourPhrase(e.pid, cle, phrase);
    const entrees = await Promise.all(e.entrees.map(async (x) => ({ id: x.id, chiffre: await chiffrerEntree(e.pid, x.id, cle, x, { g: numero, n: (x.n || 0) + 1 }) })));
    /* La clé neuve est tenue avant l'écriture : l'instantané du coffre qui
       revient porte le nouveau numéro, et ne doit pas fermer le coffre. */
    const avant = { cle: e.cle, g: e.g };
    e.cle = cle; e.g = numero;
    try {
      await bddCoffre.renouveler(e.pid, e.env.session, { enveloppe, numero, entrees, appareilsIds: (e.appareils || []).map((a) => a.id) });
    } catch (err) {
      if (etat === e) { e.cle = avant.cle; e.g = avant.g; }
      throw err;
    }
  });
  if (fait && etat === e) { await dechiffrerTout(); dessiner(); await montrerPhrase(phrase, { changement: true }); }
  phrase = null;
};

const ouvrirMenu = (b) => menu(b, [
  { libelle: 'Renouveler la clé et la phrase', icone: 'cle', action: () => renouveler(null) },
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
      await bddCoffre.ajouterAppareil(e.pid, e.env.session, aid, { appareil: nomAppareil(), credId, selPrf, iv: copie.iv, cle: copie.cle, g: e.g });
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

/* Les champs du formulaire : des noms qui ne ressemblent ni à un login ni
   à un mot de passe, pour que les gestionnaires de mots de passe ne s'y
   accrochent pas. */
const CHAMPS = {
  service: { nom: 'cf-service', borne: 120 },
  lien: { nom: 'cf-adresse', borne: 500 },
  identifiant: { nom: 'cf-compte', borne: 300 },
  motDePasse: { nom: 'cf-secret', borne: 1000 },
  note: { nom: 'cf-note', borne: 4000 },
};

const editerEntree = (x) => {
  const e = etat;
  if (!e.cle) return;
  if (!x && e.chiffrees.length >= MAX_ENTREES) { toast(`${MAX_ENTREES} accès au plus par coffre.`, 'erreur'); return; }
  const v = x || { service: '', lien: '', identifiant: '', motDePasse: '', note: '' };
  const C = CHAMPS;
  const m = suivre(modale({
    titre: x ? 'Modifier l\'accès' : 'Ajouter un accès',
    sousTitre: 'Tout est chiffré avant de quitter votre navigateur, nom du service compris.',
    corps: `<form data-forme-coffre autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other">
      <div class="groupe"><label class="etiquette-champ" for="${C.service.nom}">Service</label>
        <input class="champ" id="${C.service.nom}" name="${C.service.nom}" type="text" maxlength="${C.service.borne}" value="${echapper(v.service)}" placeholder="Stripe, Firebase, App Store Connect…" ${SANS_TROUSSEAU} required></div>
      <div class="groupe"><label class="etiquette-champ" for="${C.lien.nom}">Lien <span class="facultatif">(facultatif)</span></label>
        <input class="champ" id="${C.lien.nom}" name="${C.lien.nom}" type="text" inputmode="url" maxlength="${C.lien.borne}" value="${echapper(v.lien)}" placeholder="https://" ${SANS_TROUSSEAU}></div>
      <div class="groupe"><label class="etiquette-champ" for="${C.identifiant.nom}">Identifiant <span class="facultatif">(facultatif)</span></label>
        <input class="champ t-mono" id="${C.identifiant.nom}" name="${C.identifiant.nom}" type="text" maxlength="${C.identifiant.borne}" value="${echapper(v.identifiant)}" ${SANS_TROUSSEAU}></div>
      <div class="groupe"><label class="etiquette-champ" for="${C.motDePasse.nom}">Mot de passe <span class="facultatif">(facultatif)</span></label>
        <div class="coffre-mdp-champ"><input class="champ t-mono coffre-masque" id="${C.motDePasse.nom}" name="${C.motDePasse.nom}" type="text" maxlength="${C.motDePasse.borne}" value="${echapper(v.motDePasse)}" ${SANS_TROUSSEAU}>
        <button class="btn btn-doux btn-petit" type="button" data-voir-secret aria-pressed="false">Afficher</button>
        <button class="btn btn-doux btn-petit" type="button" data-generer-secret>Générer</button></div></div>
      <div class="groupe"><label class="etiquette-champ" for="${C.note.nom}">Note <span class="facultatif">(facultatif)</span></label>
        <textarea class="zone" id="${C.note.nom}" name="${C.note.nom}" rows="3" maxlength="${C.note.borne}" placeholder="Double authentification, contact, à quoi sert ce compte…" ${SANS_TROUSSEAU}>${echapper(v.note)}</textarea></div>
    </form>`,
    pied: `${x ? '<button class="btn btn-danger" type="button" data-suppr>Supprimer</button><span class="pousse"></span>' : ''}
      <button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
      <button class="btn btn-principal" type="button" data-enregistrer>Enregistrer</button>`,
  }));
  const f = m.el.querySelector('[data-forme-coffre]');
  const secret = f.querySelector(`#${C.motDePasse.nom}`);
  const voir = m.el.querySelector('[data-voir-secret]');
  const montrer = (oui) => { secret.classList.toggle('coffre-masque', !oui); voir.textContent = oui ? 'Masquer' : 'Afficher'; voir.setAttribute('aria-pressed', String(oui)); };
  voir.addEventListener('click', () => montrer(secret.classList.contains('coffre-masque')));
  m.el.querySelector('[data-generer-secret]').addEventListener('click', () => { secret.value = genererMotDePasse(); montrer(true); });
  const suppr = m.el.querySelector('[data-suppr]');
  if (suppr) suppr.addEventListener('click', () => supprimerEntree(x.id, m));
  const enregistrer = m.el.querySelector('[data-enregistrer]');
  const valider = async () => {
    const d = {};
    for (const [k, c] of Object.entries(C)) d[k] = String((f.elements[c.nom] || {}).value || '').trim().slice(0, c.borne);
    f.querySelectorAll('.erreur-champ').forEach((n) => n.remove());
    if (!d.service) {
      const n = document.createElement('p'); n.className = 'erreur-champ'; n.textContent = 'Le nom du service est obligatoire.';
      f.elements[C.service.nom].closest('.groupe').appendChild(n); f.elements[C.service.nom].focus(); return;
    }
    const fait = await agir(enregistrer, async () => {
      if (etat !== e || !e.cle) throw new Error('Le coffre s\'est verrouillé. Rouvrez-le, puis recommencez.');
      const id = x ? x.id : bddCoffre.nouvelId(e.pid);
      const chiffre = await chiffrerEntree(e.pid, id, e.cle, d, { g: e.g, n: x ? (x.n || 0) + 1 : 1 });
      await bddCoffre.ecrireEntree(e.pid, e.env.session, id, chiffre, !x);
    }, x ? 'Accès mis à jour.' : 'Accès ajouté.');
    if (fait) m.fermer(true);
  };
  enregistrer.addEventListener('click', valider);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); valider(); });
};
