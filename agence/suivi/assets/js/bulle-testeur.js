/* ==========================================================================
   La bulle du testeur : écrire à l'équipe Capmedia, en direct.

   La même bulle que celle d'un projet (bulle.js), posée en bas à droite de
   l'espace Test, mais une conversation à part : un testeur n'est membre
   d'aucun projet, et ce qu'il dit ne regarde que l'équipe. Elle vit dans
   conversationsTesteurs/{uid}/messages ; le serveur tient le compteur des
   non lus (hubMessageTesteur) et prévient l'équipe. Texte seulement : une
   capture se signale avec le scénario, pas dans la bulle.
   ========================================================================== */

import { bdd, auth, doc, collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, serverTimestamp, echapper } from './noyau.js';
import { icone } from './icones.js';
import { messageHtml, toast, agir } from './ui.js';

const CLE_OUVERTE = 'suivi:bulle-testeur-ouverte';
const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v === null ? defaut : v === '1'; } catch (e) { return defaut; } };
const ecrireCle = (cle, oui) => { try { localStorage.setItem(cle, oui ? '1' : '0'); } catch (e) { /* stockage refusé */ } };

export const monterBulleTesteur = ({ testeur }) => {
  const uid = auth.currentUser.uid;
  const nom = testeur.prenom || 'Testeur';
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
          <button class="btn-icone" type="button" id="bulle-fermer" aria-label="Fermer" data-astuce="Fermer">${icone('fermer')}</button>
        </div>
      </header>
      <div class="bulle-fil" id="bulle-fil"></div>
      <form class="bulle-pied" id="bulle-forme" novalidate>
        <div class="bulle-saisie" style="grid-template-columns:minmax(0,1fr) auto">
          <textarea class="zone" id="bulle-texte" name="texte" rows="1" maxlength="4000" placeholder="Écrivez à l'équipe..."></textarea>
          <button class="btn bulle-envoyer" type="submit" aria-label="Envoyer">${icone('envoyer')}</button>
        </div>
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
  let nonLus = 0;
  let premier = true;
  let dernierVu = '';

  const rendreFil = () => {
    fil.innerHTML = messages.length
      ? messages.map((m) => `<div class="bulle-message">${messageHtml(m, { moi: uid })}</div>`).join('')
      : `<div class="bulle-vide">${icone('messages')}<p>Un scénario impossible à lancer, un lien qui ne marche pas, une question : écrivez à l'équipe. La réponse arrive ici, en direct.</p></div>`;
    fil.scrollTop = fil.scrollHeight;
  };

  const rendrePastille = () => {
    const n = ouverte ? 0 : nonLus;
    compte.hidden = !n;
    compte.textContent = n > 9 ? '9+' : String(n);
    racine.classList.toggle('bulle--alerte', Boolean(n));
  };

  /* Lu : le compteur revient à zéro, et c'est la seule chose que le
     testeur écrit sur sa conversation. */
  const marquerLu = async () => {
    if (!nonLus) return;
    try { await updateDoc(doc(bdd, 'conversationsTesteurs', uid), { nonLusTesteur: 0 }); } catch (e) { /* pas encore de conversation */ }
  };

  const ouvrir = (oui) => {
    ouverte = oui;
    panneau.hidden = !oui;
    racine.classList.toggle('bulle--ouverte', oui);
    ecrireCle(CLE_OUVERTE, oui);
    rendreFil();
    if (oui) { marquerLu(); champ.focus(); }
    rendrePastille();
  };

  $('#bulle-ouvrir').addEventListener('click', () => ouvrir(!ouverte));
  $('#bulle-fermer').addEventListener('click', () => ouvrir(false));
  champ.addEventListener('input', () => { champ.style.height = 'auto'; champ.style.height = `${Math.min(champ.scrollHeight, 132)}px`; });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#bulle-forme').requestSubmit(); }
    if (e.key === 'Escape') ouvrir(false);
  });
  $('#bulle-forme').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte) return;
    await agir(e.target.querySelector('[type="submit"]'), async () => {
      try {
        await addDoc(collection(bdd, 'conversationsTesteurs', uid, 'messages'), {
          de: { uid, nom, cote: 'testeur' }, texte, pieces: [], date: serverTimestamp(),
        });
        champ.value = ''; champ.style.height = 'auto';
      } catch (err) { console.error(err); toast("Le message n'est pas parti. Réessayez.", 'erreur'); }
    });
  });

  const arretMessages = onSnapshot(query(collection(bdd, 'conversationsTesteurs', uid, 'messages'), orderBy('date', 'desc'), limit(200)), (inst) => {
    /* Les 200 plus récents, remis dans l'ordre : une fenêtre qui suit la fin
       de la conversation, jamais son début. */
    messages = inst.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    const dernier = messages[messages.length - 1];
    const cle = dernier ? dernier.id : '';
    const nouveau = !premier && cle && cle !== dernierVu && dernier.de && dernier.de.uid !== uid;
    dernierVu = cle; premier = false;
    rendreFil();
    if (ouverte) marquerLu();
    if (nouveau && !ouverte) toast(`${dernier.de.nom || 'Capmedia'} : ${String(dernier.texte || '').slice(0, 90)}`, 'info', { libelle: 'Répondre', action: () => ouvrir(true) });
  }, (err) => console.warn('[bulle testeur] messages', err));

  const arretConversation = onSnapshot(doc(bdd, 'conversationsTesteurs', uid), (d) => {
    nonLus = d.exists() ? Number(d.data().nonLusTesteur || 0) : 0;
    rendrePastille();
    if (ouverte && !document.hidden) marquerLu();
  }, () => { nonLus = 0; rendrePastille(); });

  ouvrir(ouverte);
  return {
    ouvrir: () => ouvrir(true),
    fin: () => { arretMessages(); arretConversation(); racine.remove(); },
  };
};

void echapper;
