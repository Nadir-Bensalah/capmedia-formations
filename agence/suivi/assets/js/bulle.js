/* ==========================================================================
   La bulle de discussion d'un projet.

   Une conversation à deux voix, posée en bas à droite de toute page d'un
   projet (fiche, demande, brique, tâche : c'est bulle-projet.js qui la
   monte et la démonte au fil des adresses). L'équipe d'un côté, le client
   de l'autre. Tout est instantané, les messages arrivent par la même
   écoute que le reste de la page.

   Elle sait quatre choses : qui a lu et quand, qui est en train d'écrire,
   prévenir sans déranger (un aperçu, un son court, le compte dans le titre
   de l'onglet, que la coquille tient), et accepter des fichiers par
   glisser-déposer.

   Les conventions sont les mêmes que sur la page Messages, qui reprend les
   aides exportées ici : Entrée envoie, Maj+Entrée va à la ligne ; le fil
   est séparé par jour ; l'accusé dit « Lu le JJ/MM à HH:MM » ; « En faire
   une demande » n'apparaît que sur les messages d'en face.
   ========================================================================== */

import { echapper, TYPES, nomsContacts, enDate, joursAvant } from './noyau.js';
import { icone } from './icones.js';
import { messageHtml, depot, toast, agir, brancherPieces, avatarProjet, menu, sur } from './ui.js';
import * as magasin from './magasin.js';
import { K, ecrire, messagesDuProjet } from './donnees.js';
import { naviguer } from './routeur.js';

const CLE_SON = 'suivi:son-messages';
/* Un état ouvert/fermé par projet : refermer la bulle d'un projet ne
   referme pas celle d'un autre. */
const cleOuverte = (pid) => `suivi:bulle-ouverte:${pid}`;

const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v === null ? defaut : v === '1'; } catch (e) { return defaut; } };
const ecrireCle = (cle, oui) => { try { localStorage.setItem(cle, oui ? '1' : '0'); } catch (e) { /* stockage refusé */ } };

/* ==========================================================================
   Les aides partagées avec la page Messages
   ========================================================================== */

const deuxChiffres = (n) => String(n).padStart(2, '0');

/** « Lu le 25/09 à 14:32 » : la date ET l'heure, toujours. */
export const luLe = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  return `Lu le ${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)} à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
};

/** Le repère de jour d'un fil : « Aujourd'hui », « Hier », « Jeudi 25 septembre ». */
export const jourFil = (valeur) => {
  const d = enDate(valeur);
  if (!d) return '';
  const n = joursAvant(d);
  if (n === 0) return "Aujourd'hui";
  if (n === -1) return 'Hier';
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }) });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

/** Le fil, séparé par jour : `rendreUn(m)` dessine chaque message. */
export const filParJour = (messages, rendreUn) => {
  let jour = null;
  return messages.map((m) => {
    const j = jourFil(m.date);
    const repere = j && j !== jour ? `<p class="fil-jour">${echapper(j)}</p>` : '';
    jour = j || jour;
    return `${repere}${rendreUn(m)}`;
  }).join('');
};

/** Un message d'en face, jamais le mien : c'est lui qui peut devenir une demande. */
export const vientDEnFace = (m, { uid, equipe }) => Boolean(m.de) && m.de.uid !== uid && ((m.de.cote === 'equipe') !== equipe);

/* D'un message à une demande : le texte part dans le formulaire, déjà
   rempli, du type choisi. Rien à recopier, rien à perdre. */
export const demandeDepuisMessage = (bouton, m, pid, { avant = () => {} } = {}) => {
  menu(bouton, Object.entries(TYPES).filter(([cle]) => cle !== 'demande').map(([cle, t]) => ({
    libelle: t.libelle,
    icone: t.icone,
    action: () => {
      const texte = (m.texte || '').trim();
      const premiereLigne = texte.split('\n')[0].slice(0, 110);
      try {
        sessionStorage.setItem(`suivi:demande-depuis:${pid}`, JSON.stringify({
          titre: premiereLigne,
          description: texte,
          auteur: (m.de || {}).nom || '',
          date: new Date().toISOString(),
        }));
      } catch (e) { /* stockage refusé : le formulaire s'ouvrira vide */ }
      avant();
      naviguer(`/projets/${pid}/nouvelle-demande?type=${cle}`);
    },
  })));
};

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

/* Le titre de l'onglet appartient à la coquille : la bulle lui dit
   seulement combien de messages ne sont pas lus. */
const direNonLus = (n) => document.dispatchEvent(new CustomEvent('titre:non-lus', { detail: { compte: n } }));

/* ==========================================================================
   Le montage
   ========================================================================== */

export const monterBulle = ({ pid, env }) => {
  const uid = env.session.utilisateur.uid;
  const equipe = env.role === 'equipe';
  const racine = document.createElement('div');
  racine.className = 'bulle';
  racine.dataset.projet = pid;
  racine.innerHTML = `
    <button class="bulle-pastille" type="button" id="bulle-ouvrir" aria-label="Ouvrir la conversation du projet" data-astuce="Conversation">
      ${icone('messages')}
      <span class="bulle-compte" id="bulle-compte" hidden></span>
    </button>
    <section class="bulle-panneau" id="bulle-panneau" hidden aria-label="Conversation du projet">
      <header class="bulle-tete">
        <div class="bulle-tete-qui">
          <span class="bulle-logo" id="bulle-logo"></span>
          <div class="bulle-tete-texte">
            <p class="bulle-titre"><span class="bulle-point" id="bulle-point"></span><span id="bulle-nom"></span></p>
            <p class="bulle-sous" id="bulle-sous"></p>
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
          <textarea class="zone" id="bulle-texte" name="texte" rows="1" maxlength="6000" placeholder="Écrivez votre message..." aria-label="Votre message. Entrée envoie, Maj+Entrée va à la ligne."></textarea>
          <button class="btn-icone bulle-joindre" type="button" id="bulle-joindre" aria-label="Joindre un fichier" data-astuce="Joindre">${icone('trombone')}</button>
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
  let ouverte = lire(cleOuverte(pid), false);
  let boite = null;
  let dernierVu = '';
  let premier = true;

  const majSon = () => {
    const oui = lire(CLE_SON, true);
    $('#bulle-son').innerHTML = icone(oui ? 'cloche' : 'clocheBarree');
    $('#bulle-son').classList.toggle('actif', oui);
  };

  const projet = () => magasin.lire(K.projet(pid)) || {};

  /* Le nom affiché est celui d'en face : le contact du projet vu de
     l'équipe, Capmedia vu du client. */
  const nomEnFace = () => {
    const p = projet();
    if (!equipe) return 'Capmedia';
    return nomsContacts(p) || (p.client || {}).entreprise || 'Le client';
  };
  const rendreTete = () => {
    const p = projet();
    $('#bulle-logo').innerHTML = avatarProjet(p, 'petit');
    $('#bulle-nom').textContent = nomEnFace();
    $('#bulle-sous').textContent = p.nom || '';
  };

  const messages = () => messagesDuProjet(pid);
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

  /* Lire dans la bulle fait aussi tomber le compteur du rail (profil.lus),
     que la page Messages tient : un seul « non lu », où qu'on lise. */
  const marquer = (frappe = false) => {
    ecrire.marquerLecture(env.session, pid, { frappe }).catch(() => {});
    if (!frappe) ecrire.marquerVu(uid, `messages:${pid}`).catch(() => {});
  };

  const unMessage = (m) => `<div class="bulle-message" data-msg="${echapper(m.id || '')}">${messageHtml(m, { moi: uid })}${vientDEnFace(m, { uid, equipe })
    ? `<button class="bulle-action" type="button" data-transformer="${echapper(m.id || '')}" aria-label="${equipe ? 'En faire une demande' : 'En faire un ticket'}" data-astuce="${equipe ? 'En faire une demande' : 'En faire un ticket'}">${icone('sparkle')}</button>`
    : ''}</div>`;

  const rendreFil = () => {
    const liste = messages();
    const lu = luJusqua();
    const miens = liste.filter((m) => m.de && m.de.uid === uid);
    const dernierMien = miens[miens.length - 1];
    fil.innerHTML = liste.length
      ? filParJour(liste, unMessage)
        + (dernierMien
          ? `<p class="bulle-accuse">${lu && (enDate(dernierMien.date) || 0) <= lu
            ? `${icone('checkDouble')} ${echapper(luLe(lu))}`
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
    if (qui) bloc.querySelector('span').textContent = `${equipe ? (qui.nom || 'Le client') : 'Capmedia'} écrit`;
    $('#bulle-point').classList.toggle('vif', Boolean(qui));
  };

  const rendrePastille = () => {
    const n = ouverte ? 0 : nonLus();
    compte.hidden = !n;
    compte.textContent = n > 9 ? '9+' : String(n);
    racine.classList.toggle('bulle--alerte', Boolean(n));
    direNonLus(n);
  };

  const ajusterHauteur = () => {
    champ.style.height = 'auto';
    champ.style.height = `${Math.min(champ.scrollHeight, 132)}px`;
  };

  const ouvrir = (oui) => {
    ouverte = oui;
    panneau.hidden = !oui;
    racine.classList.toggle('bulle--ouverte', oui);
    ecrireCle(cleOuverte(pid), oui);
    rendreFil();
    if (oui) { marquer(); champ.focus(); fil.scrollTop = fil.scrollHeight; }
    rendrePastille();
  };

  /* Ouvrir avec un texte déjà posé dans le champ (« Une question sur cette
     étape »), le curseur à la fin pour continuer la phrase. */
  const ouvrirAvec = (texte) => {
    ouvrir(true);
    if (texte) {
      champ.value = String(texte);
      ajusterHauteur();
      champ.focus();
      const fin = champ.value.length;
      try { champ.setSelectionRange(fin, fin); } catch (e) { /* champ sans sélection */ }
    }
  };

  /* Un message qui arrive : le son, l'aperçu, la pastille. */
  const surMessages = () => {
    const liste = messages();
    const dernier = liste[liste.length - 1];
    const cle = dernier ? dernier.id : '';
    const nouveau = !premier && cle && cle !== dernierVu && dernier.de && dernier.de.uid !== uid;
    dernierVu = cle;
    premier = false;
    rendreFil();
    if (ouverte) marquer();
    rendrePastille();
    if (!nouveau) return;
    sonner();
    if (!ouverte) {
      toast(`${dernier.de.nom || (equipe ? 'Le client' : 'Capmedia')} : ${(String(dernier.texte || '').trim() || 'Pièce jointe').slice(0, 90)}`, 'info', {
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

  const gesteTransformer = sur(racine, 'click', '[data-transformer]', (el) => {
    const m = messages().find((x) => x.id === el.dataset.transformer);
    if (m) demandeDepuisMessage(el, m, pid, { avant: () => ouvrir(false) });
  });

  let frappe = 0;
  champ.addEventListener('input', () => {
    ajusterHauteur();
    if (Date.now() - frappe > 4000) { frappe = Date.now(); marquer(true); }
  });
  /* Entrée envoie, Maj+Entrée va à la ligne : la même convention que sur
     la page Messages. */
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
      /* Des pièces sans un mot : le texte reste vide, l'écran montre les pièces seules. */
      await ecrire.messageProjet(env.session, pid, texte, boite.pieces);
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
  const arretLectures = magasin.sur(K.lectures(pid), () => { rendreFil(); rendreFrappe(); rendrePastille(); });
  const arretProjet = magasin.sur(K.projet(pid), rendreTete);

  majSon();
  rendreTete();
  ouvrir(ouverte);
  surMessages();
  rendreFrappe();

  return {
    pid,
    ouvrirAvec,
    fin: () => {
      clearInterval(pouls);
      gesteTransformer();
      direNonLus(0);
      document.removeEventListener('visibilitychange', surVisible);
      if (typeof arretMessages === 'function') arretMessages();
      if (typeof arretLectures === 'function') arretLectures();
      if (typeof arretProjet === 'function') arretProjet();
      racine.remove();
    },
  };
};
