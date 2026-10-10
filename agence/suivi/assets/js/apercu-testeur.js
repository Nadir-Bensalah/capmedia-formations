/* ==========================================================================
   L'APERÇU DE L'ESPACE TESTEUR (Nadir, 10/10/2026)

   Depuis une campagne du Cockpit, « Voir comme ce testeur » ouvre
   testeur.html?apercu=<testeur ou place>&projet=<p>&campagne=<c>. C'est
   l'espace testeur lui-même (testeur.js), pas une copie : il se dessine
   avec les données de la personne ou de la place choisie, lues avec les
   droits de l'équipe (les règles ne donnent rien de plus à personne).

   Ce module ne fait que trois choses :
   - vérifier que la session est celle de l'équipe (administrateur, ou
     « qa.gerer ») et préparer le testeur à montrer ;
   - poser le bandeau « Aperçu de l'espace de …, lecture seule » et le
     sélecteur qui passe d'un testeur à l'autre ;
   - arrêter, avant qu'ils n'agissent, les gestes qui écriraient (Réussi,
     Échec, Passer, J'ai terminé, l'avis, la bulle, le compte de test),
     avec « Aperçu : rien n'est enregistré ».

   L'écriture elle-même est coupée dans noyau.js (MODE_APERCU), au seul
   endroit par où passent toutes les écritures : même un geste oublié ici
   ne pourrait rien enregistrer.
   ========================================================================== */

import { bdd, doc, getDoc, echapper, apercu, peut, estAdmin, ERREUR_APERCU } from './noyau.js';
import { toast } from './ui.js';
import { placesDe, estPlace } from './campagne-plan.js';

const NOMS_MOBILE = { ios: 'iPhone', android: 'Android' };

const parametres = () => {
  const p = new URLSearchParams(location.search);
  return { qui: p.get('apercu') || '', projet: p.get('projet') || '', campagne: p.get('campagne') || '' };
};

/* L'adresse d'un aperçu : le drapeau du banc (« emul ») suit, s'il y est. */
export const adresseApercu = ({ qui, projet, campagne }) => {
  const p = new URLSearchParams();
  const ici = new URLSearchParams(location.search);
  if (ici.has('emul')) p.set('emul', ici.get('emul'));
  p.set('apercu', qui); p.set('projet', projet); p.set('campagne', campagne);
  return `./testeur.html?${p.toString()}`;
};

const refus = (racine, texte) => {
  racine.innerHTML = `<div class="porte"><div class="porte-boite" role="alert" data-apercu-refus>
    <div class="marque">Capmedia</div>
    <p class="t-corps">${echapper(texte)}</p>
    <p><a class="btn btn-secondaire" href="./cockpit.html">Retour au Cockpit</a></p>
  </div></div>`;
};

/* Les personnes et places de la campagne, dans l'ordre du Cockpit : les
   places d'abord (iPhone puis Android), puis les testeurs nommés. Une
   place attribuée se montre sous le nom de sa personne. */
const lesTesteurs = async (c) => {
  const places = placesDe(c);
  const vus = new Set();
  const liste = [];
  const fiches = new Map();
  const fiche = async (uid) => {
    if (!fiches.has(uid)) {
      try { const d = await getDoc(doc(bdd, 'testeurs', uid)); fiches.set(uid, d.exists() ? d.data() : null); } catch (e) { fiches.set(uid, null); }
    }
    return fiches.get(uid);
  };
  for (const p of places) {
    const uid = p.testeur || p.id;
    if (vus.has(uid)) continue;
    vus.add(uid);
    const f = p.testeur ? await fiche(p.testeur) : null;
    liste.push({ uid, place: p, fiche: f, libelle: p.testeur ? `${(f && (f.prenom || f.email)) || 'Testeur'} (${p.libelle})` : p.libelle });
  }
  for (const uid of (c.testeurs || [])) {
    if (vus.has(uid) || estPlace(uid)) continue;
    vus.add(uid);
    const f = await fiche(uid);
    liste.push({ uid, place: null, fiche: f, libelle: (f && (f.prenom || f.email)) || 'Testeur' });
  }
  return liste;
};

/* Le testeur tel que testeur.js l'attend (la fiche « testeurs/{uid} »).
   Une place n'a pas de fiche : on lui prête son téléphone et le web, et
   la fiche est réputée validée (une place n'a personne pour la remplir). */
const testeurDe = (choisi, projet) => {
  if (choisi.place && !choisi.fiche) {
    const p = choisi.place;
    return {
      uid: choisi.uid, prenom: p.libelle, mobile: p.mobile || '',
      plateformes: [p.mobile, p.web ? 'web' : ''].filter(Boolean), projets: [projet], ficheValidee: true, place: true,
    };
  }
  return { ...(choisi.fiche || {}), uid: choisi.uid, projets: [projet], ficheValidee: true };
};

/**
 * Prépare l'aperçu. Rend null (et dit pourquoi) quand il ne peut pas
 * s'ouvrir ; sinon { testeur, session, campagne, cle, enPreparation }.
 */
export const preparerApercu = async (sess, racine) => {
  const { qui, projet, campagne } = parametres();
  if (!sess.utilisateur) {
    location.replace(`./?retour=${encodeURIComponent(location.pathname + location.search)}&espace=cockpit`);
    return null;
  }
  /* Réservé à l'équipe : un testeur ou un client qui colle l'adresse ne
     voit rien (et les règles ne lui serviraient de toute façon rien). */
  if (!sess.equipe || !(estAdmin(sess) || peut(sess, 'qa.gerer', projet))) {
    refus(racine, 'L\'aperçu de l\'espace testeur est réservé à l\'équipe Capmedia.');
    return null;
  }
  if (!qui || !projet || !campagne) { refus(racine, 'Il manque le testeur ou la campagne à montrer.'); return null; }
  let c = null;
  try { const d = await getDoc(doc(bdd, 'projets', projet, 'campagnes', campagne)); if (d.exists()) c = { id: d.id, projet, ...d.data() }; } catch (e) { /* refusé */ }
  if (!c) { refus(racine, 'Cette campagne est introuvable, ou hors de vos projets.'); return null; }
  const liste = await lesTesteurs(c);
  const choisi = liste.find((x) => x.uid === qui);
  if (!choisi) { refus(racine, 'Ce testeur ne figure pas dans cette campagne.'); return null; }
  apercu.uid = choisi.uid;
  const testeur = testeurDe(choisi, projet);
  /* La coquille lit l'utilisateur (son nom, sa boîte) : celui de l'aperçu. */
  const session = { ...sess, equipe: null, testeur, utilisateur: { uid: choisi.uid, email: (choisi.fiche && choisi.fiche.email) || '' }, apercu: true };
  document.documentElement.classList.add('en-apercu');
  poserBandeau({ choisi, liste, c });
  intercepterGestes();
  return { testeur, session, campagne: c, cle: `${projet}/${campagne}`, enPreparation: (c.statut || 'preparation') !== 'en-cours' };
};

const poserBandeau = ({ choisi, liste, c }) => {
  const b = document.createElement('div');
  b.className = 'apercu-bandeau';
  b.setAttribute('role', 'status');
  b.dataset.apercuBandeau = choisi.uid;
  const sur = choisi.place ? NOMS_MOBILE[choisi.place.mobile] || '' : '';
  const statut = (c.statut || 'preparation') === 'en-cours' ? '' : ' La campagne n\'est pas encore lancée : voici ce qu\'il verra une fois lancée.';
  b.innerHTML = `
    <p class="apercu-texte"><strong>Aperçu de l'espace ${echapper(/^[aeiouyéèàâêîôûh]/i.test(choisi.libelle) ? 'd\'' : 'de ')}${echapper(choisi.libelle)}, lecture seule.</strong>
      <span class="apercu-aide">Rien n'est enregistré.${echapper(statut)}${sur && !choisi.fiche ? ` Place ${echapper(sur)} et web.` : ''}</span></p>
    <label class="apercu-choix"><span>Voir</span>
      <select data-apercu-choix aria-label="Voir l'espace d'un autre testeur">
        ${liste.map((x) => `<option value="${echapper(x.uid)}"${x.uid === choisi.uid ? ' selected' : ''}>${echapper(x.libelle)}</option>`).join('')}
      </select></label>
    <a class="apercu-quitter" href="./cockpit.html" data-apercu-quitter>Quitter l'aperçu</a>`;
  document.body.prepend(b);
  b.querySelector('[data-apercu-choix]').addEventListener('change', (e) => {
    location.assign(adresseApercu({ qui: e.target.value, projet: c.projet, campagne: c.id }));
  });
};

/* Les gestes qui écriraient : vus, jamais suivis d'effet. Arrêtés à la
   capture, avant le code de l'espace. */
const GESTES_ECRITURE = [
  '[data-feuille-poser]', '[data-feuille-passer]', '[data-terminer]', '[data-remarque]', '[data-compte-geste]',
  '[data-envoyer]', '[data-valider]', '[data-note-test]', '[data-retirer-preuve]', '#bulle-joindre', '.bulle-envoyer',
  '[data-sortir]', '[data-sortir-fiche]',
].join(', ');

let dernierToast = 0;
const direRienEnregistre = () => {
  if (Date.now() - dernierToast < 1200) return;
  dernierToast = Date.now();
  toast(ERREUR_APERCU, 'info');
};

const intercepterGestes = () => {
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest(GESTES_ECRITURE);
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    direRienEnregistre();
  }, true);
  document.addEventListener('submit', (e) => { e.preventDefault(); e.stopImmediatePropagation(); direRienEnregistre(); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'bulle-texte') { e.preventDefault(); e.stopImmediatePropagation(); direRienEnregistre(); }
  }, true);
  /* Une écriture partie d'ailleurs (en arrière-plan) et coupée par le noyau. */
  document.addEventListener('suivi:apercu-refus', () => { /* silencieux : le noyau a déjà refusé */ });
};
