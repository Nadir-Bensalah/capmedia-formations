/* ==========================================================================
   La bulle de discussion d'un projet.

   Une conversation à deux voix, posée en bas à droite de la fiche du
   projet : l'équipe d'un côté, le client de l'autre. Tout est instantané,
   les messages arrivent par la même écoute que le reste de la page.

   Elle sait quatre choses que la page des messages ne disait pas :
   qui a lu et quand, qui est en train d'écrire, prévenir sans déranger
   (un aperçu, un son court, le titre de l'onglet qui bat), et accepter
   des fichiers par glisser-déposer.
   ========================================================================== */

import { echapper, depuis, heure } from './noyau.js';
import { icone } from './icones.js';
import { messageHtml, depot, toast, agir, brancherPieces } from './ui.js';
import * as magasin from './magasin.js';
import { K, ecrire } from './donnees.js';
import { naviguer } from './routeur.js';

const CLE_SON = 'suivi:son-messages';
const CLE_OUVERTE = 'suivi:bulle-ouverte';

const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v === null ? defaut : v === '1'; } catch (e) { return defaut; } };
const ecrireCle = (cle, oui) => { try { localStorage.setItem(cle, oui ? '1' : '0'); } catch (e) { /* stockage refusé */ } };

/* Un son court, fabriqué à la volée : deux notes montantes, rien à
   télécharger. Le navigateur n'autorise le son qu'après un premier geste,
   d'où le contexte créé au premier clic. */
let audio = null;
const reveiller = () => {
  if (audio || typeof AudioContext === 'undefined') return;
  try { audio = new AudioContext(); } catch (e) { audio = null; }
};
const sonner = () => {
  if (!audio || !lire(CLE_SON, true)) return;
  try {
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    [880, 1174].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      o.connect(g); g.connect(audio.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.18);
    });
  } catch (e) { /* le son n'est pas indispensable */ }
};

/* Le titre de l'onglet bat tant qu'un message n'est pas lu. */
const titreOrigine = document.title;
let battement = null;
const battre = (n) => {
  clearInterval(battement);
  if (!n) { document.title = titreOrigine; return; }
  let a = false;
  document.title = `(${n}) ${titreOrigine}`;
  battement = setInterval(() => {
    a = !a;
    document.title = a ? `Nouveau message · ${titreOrigine}` : `(${n}) ${titreOrigine}`;
  }, 2200);
};

const enDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : (v ? new Date(v) : null));

export const monterBulle = ({ pid, env, nomProjet }) => {
  const uid = env.session.utilisateur.uid;
  const equipe = env.role === 'equipe';
  const racine = document.createElement('div');
  racine.className = 'bulle';
  racine.innerHTML = `
    <button class="bulle-pastille" type="button" id="bulle-ouvrir" aria-label="Ouvrir la conversation du projet" data-astuce="Conversation">
      ${icone('messages')}
      <span class="bulle-compte" id="bulle-compte" hidden></span>
    </button>
    <section class="bulle-panneau" id="bulle-panneau" hidden aria-label="Conversation du projet">
      <header class="bulle-tete">
        <div class="bulle-tete-qui">
          <span class="bulle-point" id="bulle-point"></span>
          <div>
            <p class="bulle-titre">${echapper(equipe ? 'Le client' : 'Capmedia')}</p>
            <p class="bulle-sous" id="bulle-sous">${echapper(nomProjet || '')}</p>
          </div>
        </div>
        <div class="bulle-tete-gestes">
          <button class="btn-icone" type="button" id="bulle-son" aria-label="Son des messages" data-astuce="Son"></button>
          <button class="btn-icone" type="button" id="bulle-plein" aria-label="Ouvrir la messagerie complète" data-astuce="Tout voir">${icone('externe')}</button>
          <button class="btn-icone" type="button" id="bulle-fermer" aria-label="Fermer" data-astuce="Fermer">${icone('fermer')}</button>
        </div>
      </header>
      <div class="bulle-fil" id="bulle-fil"></div>
      <p class="bulle-frappe" id="bulle-frappe" hidden><i></i><i></i><i></i> <span></span></p>
      <form class="bulle-pied" id="bulle-forme" novalidate>
        <div id="bulle-pieces"></div>
        <div class="bulle-saisie">
          <textarea class="zone" id="bulle-texte" name="texte" rows="1" maxlength="6000" placeholder="Écrivez votre message..."></textarea>
          <button class="btn-icone bulle-joindre" type="button" id="bulle-joindre" aria-label="Joindre un fichier" data-astuce="Joindre">${icone('trombone')}</button>
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
  let boite = null;
  let dernierVu = '';
  let premier = true;

  const majSon = () => {
    const oui = lire(CLE_SON, true);
    $('#bulle-son').innerHTML = icone(oui ? 'cloche' : 'clocheBarree');
    $('#bulle-son').classList.toggle('actif', oui);
  };

  const messages = () => magasin.lire(K.messages(pid)) || [];
  const lectures = () => magasin.lire(K.lectures(pid)) || [];

  /* Ce que l'autre côté a lu, et s'il écrit en ce moment. */
  const enFace = () => lectures().filter((l) => l.id !== uid && (equipe ? l.cote !== 'equipe' : l.cote === 'equipe'));
  const luJusqua = () => enFace().map((l) => enDate(l.lu)).filter(Boolean).sort((a, b) => b - a)[0] || null;
  const ecritMaintenant = () => enFace().find((l) => { const f = enDate(l.frappe); return f && Date.now() - f.getTime() < 7000; }) || null;

  const nonLus = () => {
    const mien = lectures().find((l) => l.id === uid);
    const lu = enDate(mien && mien.lu);
    return messages().filter((m) => m.de && m.de.uid !== uid && (!lu || (enDate(m.date) || 0) > lu)).length;
  };

  const marquer = (frappe = false) => ecrire.marquerLecture(env.session, pid, { frappe }).catch(() => {});

  const rendreFil = () => {
    const liste = messages();
    const lu = luJusqua();
    const miens = liste.filter((m) => m.de && m.de.uid === uid);
    const dernierMien = miens[miens.length - 1];
    fil.innerHTML = liste.length
      ? liste.map((m) => messageHtml(m, { moi: uid })).join('')
        + (dernierMien
          ? `<p class="bulle-accuse">${lu && (enDate(dernierMien.date) || 0) <= lu
            ? `${icone('checkDouble')} Lu ${echapper(heure(lu))}`
            : `${icone('check')} Envoyé`}</p>`
          : '')
      : `<div class="bulle-vide">${icone('messages')}<p>${echapper(equipe
        ? 'Écrivez au client : il reçoit un e-mail et voit le message ici, tout de suite.'
        : 'Écrivez à Capmedia. La réponse arrive ici, sans quitter le projet.')}</p></div>`;
    fil.scrollTop = fil.scrollHeight;
  };

  const rendreFrappe = () => {
    const qui = ecritMaintenant();
    const bloc = $('#bulle-frappe');
    bloc.hidden = !qui;
    if (qui) bloc.querySelector('span').textContent = `${qui.nom || (equipe ? 'Le client' : 'Capmedia')} écrit`;
    $('#bulle-point').classList.toggle('vif', Boolean(qui));
  };

  const rendrePastille = () => {
    const n = ouverte ? 0 : nonLus();
    compte.hidden = !n;
    compte.textContent = n > 9 ? '9+' : String(n);
    racine.classList.toggle('bulle--alerte', Boolean(n));
    battre(document.hidden ? n : 0);
  };

  const ouvrir = (oui) => {
    ouverte = oui;
    panneau.hidden = !oui;
    racine.classList.toggle('bulle--ouverte', oui);
    ecrireCle(CLE_OUVERTE, oui);
    if (oui) { marquer(); rendreFil(); champ.focus(); }
    rendrePastille();
  };

  /* Un message qui arrive : le son, l'aperçu, la pastille. */
  const surMessages = () => {
    const liste = messages();
    const dernier = liste[liste.length - 1];
    const cle = dernier ? dernier.id : '';
    const nouveau = !premier && cle && cle !== dernierVu && dernier.de && dernier.de.uid !== uid;
    dernierVu = cle;
    premier = false;
    if (ouverte) { rendreFil(); marquer(); }
    rendrePastille();
    if (!nouveau) return;
    sonner();
    if (!ouverte) {
      toast(`${dernier.de.nom || (equipe ? 'Le client' : 'Capmedia')} : ${(dernier.texte || 'Pièce jointe').slice(0, 90)}`, 'info', {
        libelle: 'Répondre', action: () => ouvrir(true),
      });
    }
  };

  /* --- Les gestes ------------------------------------------------------ */
  $('#bulle-ouvrir').addEventListener('click', () => { reveiller(); ouvrir(!ouverte); });
  $('#bulle-fermer').addEventListener('click', () => ouvrir(false));
  $('#bulle-son').addEventListener('click', () => { reveiller(); ecrireCle(CLE_SON, !lire(CLE_SON, true)); majSon(); sonner(); });
  $('#bulle-plein').addEventListener('click', () => { ouvrir(false); naviguer(`/messages/${pid}`); });
  $('#bulle-joindre').addEventListener('click', () => { const e = racine.querySelector('#bulle-pieces input[type="file"]'); if (e) e.click(); });

  let frappe = 0;
  champ.addEventListener('input', () => {
    champ.style.height = 'auto';
    champ.style.height = `${Math.min(champ.scrollHeight, 132)}px`;
    if (Date.now() - frappe > 4000) { frappe = Date.now(); marquer(true); }
  });
  /* Entrée envoie, Maj+Entrée va à la ligne : la convention d'une bulle. */
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#bulle-forme').requestSubmit(); }
    if (e.key === 'Escape') ouvrir(false);
  });

  boite = depot($('#bulle-pieces'), { chemin: `projets/${pid}/messages`, texte: '', aide: '', compact: true, cible: panneau });
  brancherPieces(racine);

  $('#bulle-forme').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte && !boite.pieces.length) return;
    if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    await agir(e.target.querySelector('[type="submit"]'), async () => {
      await ecrire.messageProjet(env.session, pid, texte || '(pièces jointes)', boite.pieces);
      champ.value = ''; champ.style.height = 'auto'; boite.vider();
      rendreFil();
    });
  });

  const surVisible = () => { if (!document.hidden && ouverte) marquer(); rendrePastille(); };
  document.addEventListener('visibilitychange', surVisible);

  /* Le pouls de la frappe d'en face : il s'éteint tout seul au bout de
     quelques secondes, donc on repasse régulièrement. */
  const pouls = setInterval(rendreFrappe, 1500);

  const arretMessages = magasin.sur(K.messages(pid), surMessages);
  const arretLectures = magasin.sur(K.lectures(pid), () => { if (ouverte) rendreFil(); rendreFrappe(); rendrePastille(); });

  majSon();
  ouvrir(ouverte);
  surMessages();
  rendreFrappe();

  return {
    fin: () => {
      clearInterval(pouls);
      battre(0);
      document.removeEventListener('visibilitychange', surVisible);
      if (typeof arretMessages === 'function') arretMessages();
      if (typeof arretLectures === 'function') arretLectures();
      racine.remove();
    },
  };
};

void depuis;
