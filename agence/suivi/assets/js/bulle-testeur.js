/* ==========================================================================
   La bulle du testeur : écrire à l'équipe Capmedia, en direct.

   La même bulle que celle d'un projet (bulle.js), posée en bas à droite de
   l'espace Test, mais une conversation à part : un testeur n'est membre
   d'aucun projet, et ce qu'il dit ne regarde que l'équipe. Elle vit dans
   conversationsTesteurs/{uid}/messages ; le serveur tient le compteur des
   non lus (hubMessageTesteur) et prévient l'équipe (cloche, e-mail, push).

   Depuis octobre 2026, la messagerie commune (messagerie.js) : le fil par
   jour, « Lu le », réagir, répondre en citant, modifier son message
   (quinze minutes) et le supprimer, joindre une capture ou un document
   (conversationsTesteurs/{uid}/ dans le stockage). Rien n'est recopié de
   la bulle d'un projet : les aides sont les siennes.
   ========================================================================== */

import { bdd, auth, doc, collection, query, orderBy, limit, onSnapshot, updateDoc, serverTimestamp, enDate, echapper, uidCourant } from './noyau.js';
import { icone } from './icones.js';
import { depot, toast, agir, brancherPieces, sur, lisible, modale } from './ui.js';
import { filDeMessages } from './donnees.js';
import { filParJour, luLe } from './bulle.js';
import { messageDuFil, signatureFil, allerAuMessage, barreContexte, citationPour, brancherGestesMessages } from './messagerie.js';
import { pushPossible, monterReglage } from './notifications-push.js';

const CLE_OUVERTE = 'suivi:bulle-testeur-ouverte';
const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v === null ? defaut : v === '1'; } catch (e) { return defaut; } };
const ecrireCle = (cle, oui) => { try { localStorage.setItem(cle, oui ? '1' : '0'); } catch (e) { /* stockage refusé */ } };

export const monterBulleTesteur = ({ testeur }) => {
  const uid = uidCourant();
  const nom = String(testeur.prenom || 'Testeur').slice(0, 80);
  const fil$ = filDeMessages(['conversationsTesteurs', uid, 'messages'], { uid, nom, cote: 'testeur' });
  const racine = document.createElement('div');
  racine.className = 'bulle bulle--testeur';
  racine.innerHTML = `
    <button class="bulle-pastille" type="button" id="bulle-ouvrir" aria-label="Écrire à l'équipe Capmedia" data-astuce="Écrire à l'équipe">
      ${icone('messages')}
      <span class="bulle-compte" id="bulle-compte" hidden></span>
    </button>
    <section class="bulle-panneau" id="bulle-panneau" hidden aria-label="Conversation avec l'équipe Capmedia">
      <header class="bulle-tete">
        <div class="bulle-tete-qui">
          <span class="avatar avatar--equipe" aria-hidden="true">C</span>
          <div class="bulle-tete-texte">
            <p class="bulle-titre">Équipe Capmedia</p>
            <p class="bulle-sous">Un souci, une question : écrivez, on vous répond ici et par e-mail.</p>
          </div>
        </div>
        <div class="bulle-tete-gestes">
          ${pushPossible() ? `<button class="btn-icone" type="button" id="bulle-push" aria-label="Notifications sur cet appareil" data-astuce="Notifications">${icone('cloche')}</button>` : ''}
          <button class="btn-icone" type="button" id="bulle-fermer" aria-label="Fermer" data-astuce="Fermer">${icone('fermer')}</button>
        </div>
      </header>
      <div class="bulle-fil" id="bulle-fil"></div>
      <form class="bulle-pied" id="bulle-forme" novalidate>
        <div id="bulle-contexte"></div>
        <div id="bulle-pieces"></div>
        <div class="bulle-saisie">
          <textarea class="zone" id="bulle-texte" name="texte" rows="1" maxlength="6000" placeholder="Écrivez à l'équipe..." aria-label="Votre message. Entrée envoie, Maj+Entrée va à la ligne."></textarea>
          <button class="btn-icone bulle-joindre" type="button" id="bulle-joindre" aria-label="Joindre une capture ou un fichier" data-astuce="Joindre">${icone('trombone')}</button>
          <button class="btn bulle-envoyer" type="submit" aria-label="Envoyer" data-astuce="Envoyer (Entrée)">${icone('envoyer')}</button>
        </div>
        <p class="t-micro t-3 bulle-aide">Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne.</p>
      </form>
    </section>`;
  document.body.appendChild(racine);

  const $ = (s) => racine.querySelector(s);
  const panneau = $('#bulle-panneau');
  const fil = $('#bulle-fil');
  const champ = $('#bulle-texte');
  const compte = $('#bulle-compte');
  let ouverte = lire(CLE_OUVERTE, false);
  let messages = [];
  let conversation = {};
  let premier = true;
  let dernierVu = '';
  let signature = null;
  /* Répondre à un message, ou modifier le sien : { mode, message }. */
  let contexte = null;
  let brouillonMis = '';

  const nonLus = () => Number(conversation.nonLusTesteur || 0);

  /* Le fil ne se redessine que s'il a changé (un message, un texte corrigé,
     une suppression, une réaction, l'accusé). */
  const rendreFil = (force = false) => {
    const lu = enDate(conversation.luEquipe);
    const miens = messages.filter((m) => m.de && m.de.uid === uid);
    const dernierMien = miens[miens.length - 1];
    const luDernier = Boolean(dernierMien && lu && (enDate(dernierMien.date) || 0) <= lu);
    const nouvelle = `${signatureFil(messages)}#${dernierMien ? dernierMien.id : ''}:${luDernier ? luLe(lu) : ''}`;
    if (!force && nouvelle === signature) return;
    const enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 80;
    const hautAvant = fil.scrollTop;
    const dernier = messages[messages.length - 1];
    const ancienDernier = signature === null ? '' : (signature.split('|').pop() || '').split(':')[0];
    signature = nouvelle;
    fil.innerHTML = messages.length
      ? filParJour(messages, (m) => messageDuFil(m, { uid, equipe: false, classe: 'bulle-message', tous: messages, transformer: false }))
        + (dernierMien ? `<p class="bulle-accuse">${luDernier ? `${icone('checkDouble')} ${echapper(luLe(lu))}` : `${icone('check')} Envoyé`}</p>` : '')
      : `<div class="bulle-vide">${icone('messages')}<p>Un scénario impossible à lancer, un lien qui ne marche pas, une question : écrivez à l'équipe. La réponse arrive ici, en direct.</p></div>`;
    const nouveauEnBas = dernier && dernier.id !== ancienDernier;
    if (force || enBas || (nouveauEnBas && dernier.de && dernier.de.uid === uid)) fil.scrollTop = fil.scrollHeight;
    else fil.scrollTop = hautAvant;
  };

  const rendrePastille = () => {
    const n = ouverte ? 0 : nonLus();
    compte.hidden = !n;
    compte.textContent = n > 9 ? '9+' : String(n);
    racine.classList.toggle('bulle--alerte', Boolean(n));
  };

  /* Lu : le compteur revient à zéro, avec l'heure (l'équipe lit « Lu le »).
     C'est la seule chose que le testeur écrit sur sa conversation. */
  const marquerLu = async () => {
    if (!nonLus()) return;
    try { await updateDoc(doc(bdd, 'conversationsTesteurs', uid), { nonLusTesteur: 0, luTesteur: serverTimestamp() }); } catch (e) { /* pas encore de conversation */ }
  };

  const ajusterHauteur = () => { champ.style.height = 'auto'; champ.style.height = `${Math.min(champ.scrollHeight, 132)}px`; };

  const ouvrir = (oui) => {
    ouverte = oui;
    panneau.hidden = !oui;
    racine.classList.toggle('bulle--ouverte', oui);
    ecrireCle(CLE_OUVERTE, oui);
    rendreFil(true);
    if (oui) { marquerLu(); champ.focus(); fil.scrollTop = fil.scrollHeight; }
    rendrePastille();
  };

  /* --- Répondre, modifier ----------------------------------------------- */
  const rendreContexte = () => {
    $('#bulle-contexte').innerHTML = barreContexte(contexte, uid);
    racine.classList.toggle('bulle--modification', Boolean(contexte && contexte.mode === 'modifier'));
  };
  const finirContexte = () => {
    if (contexte && contexte.mode === 'modifier') { champ.value = brouillonMis; ajusterHauteur(); }
    contexte = null; brouillonMis = '';
    rendreContexte();
  };
  const curseurAuBout = () => {
    champ.focus();
    const fin = champ.value.length;
    try { champ.setSelectionRange(fin, fin); } catch (e) { /* champ sans sélection */ }
  };
  const repondre = (m) => {
    if (contexte && contexte.mode === 'modifier') finirContexte();
    contexte = { mode: 'repondre', message: m };
    rendreContexte();
    if (!ouverte) ouvrir(true);
    curseurAuBout();
  };
  const modifier = (m) => {
    if (!contexte || contexte.mode !== 'modifier') brouillonMis = champ.value;
    contexte = { mode: 'modifier', message: m };
    rendreContexte();
    if (!ouverte) ouvrir(true);
    champ.value = String(m.texte || '');
    ajusterHauteur();
    curseurAuBout();
  };
  const allerA = (id) => { if (!allerAuMessage(fil, id)) toast('Ce message est trop ancien pour être affiché ici.', 'info'); };

  /* --- Les notifications sur cet appareil -------------------------------- */
  const reglerPush = () => {
    const m = modale({ titre: 'Notifications sur cet appareil', corps: '<section id="section-push" hidden><div id="push-boite"></div></section>' });
    monterReglage(m.el.querySelector('#section-push'), m.el.querySelector('#push-boite'), { session: { utilisateur: auth.currentUser }, role: 'testeur' });
  };

  /* --- Les gestes ------------------------------------------------------ */
  $('#bulle-ouvrir').addEventListener('click', () => ouvrir(!ouverte));
  $('#bulle-fermer').addEventListener('click', () => ouvrir(false));
  if ($('#bulle-push')) $('#bulle-push').addEventListener('click', reglerPush);
  $('#bulle-joindre').addEventListener('click', () => { const e = racine.querySelector('#bulle-pieces input[type="file"]'); if (e) e.click(); });
  champ.addEventListener('input', ajusterHauteur);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#bulle-forme').requestSubmit(); }
    if (e.key === 'Escape') { if (contexte) finirContexte(); else ouvrir(false); }
  });

  /* Les pièces vont dans le dossier de SA conversation ; la marque « par »
     dit qui les a posées, et le serveur n'efface que les siennes. */
  const boite = depot($('#bulle-pieces'), { chemin: `conversationsTesteurs/${uid}`, metadonnees: { par: uid }, texte: '', aide: '', compact: true, cible: panneau });
  brancherPieces(racine);

  $('#bulle-forme').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    const bouton = e.target.querySelector('[type="submit"]');
    if (contexte && contexte.mode === 'modifier') {
      const m = contexte.message;
      if (!texte && !(m.pieces || []).length) { toast('Un message ne peut pas être vide : supprimez-le plutôt.', 'erreur'); return; }
      if (texte === String(m.texte || '').trim()) { finirContexte(); return; }
      bouton.disabled = true;
      try { await fil$.modifier(m.id, texte); finirContexte(); } catch (err) {
        toast(err && err.code === 'permission-denied' ? 'Le délai de modification (15 minutes) est passé.' : lisible(err), 'erreur');
      } finally { bouton.disabled = false; }
      return;
    }
    if (!texte && !boite.pieces.length) return;
    if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const reponseA = contexte && contexte.mode === 'repondre' ? citationPour(contexte.message, uid) : null;
    await agir(bouton, async () => {
      try {
        await fil$.envoyer(texte, boite.pieces, reponseA);
        champ.value = ''; champ.style.height = 'auto'; boite.vider();
        if (reponseA) finirContexte();
      } catch (err) { console.error(err); toast("Le message n'est pas parti. Réessayez.", 'erreur'); }
    });
  });
  const gestesFil = brancherGestesMessages(fil, {
    uid, equipe: false, fil: fil$,
    trouver: (id) => messages.find((x) => x.id === id),
    repondre, modifier, allerA, transformer: null,
  });
  const gesteContexte = sur(racine, 'click', '[data-annuler-contexte]', () => { finirContexte(); champ.focus(); });

  const arretMessages = onSnapshot(query(collection(bdd, 'conversationsTesteurs', uid, 'messages'), orderBy('date', 'desc'), limit(200)), (inst) => {
    /* Les 200 plus récents, remis dans l'ordre : une fenêtre qui suit la fin
       de la conversation, jamais son début. */
    /* L'heure du serveur, estimée tant qu'elle n'est pas revenue : un
       message qui vient de partir a déjà son jour et son heure. */
    messages = inst.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse();
    const dernier = messages[messages.length - 1];
    const cle = dernier ? dernier.id : '';
    const nouveau = !premier && cle && cle !== dernierVu && dernier.de && dernier.de.uid !== uid;
    dernierVu = cle; premier = false;
    rendreFil();
    if (ouverte) marquerLu();
    if (nouveau && !ouverte) toast(`${dernier.de.nom || 'Capmedia'} : ${(String(dernier.texte || '').trim() || 'Pièce jointe').slice(0, 90)}`, 'info', { libelle: 'Répondre', action: () => ouvrir(true) });
  }, (err) => console.warn('[bulle testeur] messages', err));

  const arretConversation = onSnapshot(doc(bdd, 'conversationsTesteurs', uid), (d) => {
    conversation = d.exists() ? d.data() : {};
    rendreFil();
    rendrePastille();
    if (ouverte && !document.hidden) marquerLu();
  }, () => { conversation = {}; rendrePastille(); });

  ouvrir(ouverte);
  return {
    ouvrir: () => ouvrir(true),
    fin: () => { gestesFil(); gesteContexte(); arretMessages(); arretConversation(); racine.remove(); },
  };
};
