/* ==========================================================================
   La messagerie : une conversation générale par projet. Simple, à deux
   voix, avec pièces jointes. Les fils rattachés à une demande vivent sur
   la fiche de la demande.

   Les conventions sont celles de la bulle (bulle.js), qui prête ses aides :
   Entrée envoie, Maj+Entrée va à la ligne ; le fil est séparé par jour ;
   « Capmedia écrit » ; l'accusé « Lu le JJ/MM à HH:MM » ; « En faire une
   demande » sur les messages d'en face seulement. Un envoi de pièces sans
   texte ne dit rien à leur place. « ?brouillon= » dans l'adresse pose un
   texte dans le champ.
   ========================================================================== */

import { echapper, depuis, enDate } from '../noyau.js';
import { icone, avatarProjet, vide, squelette, titrePage, toast, depot, agir, messageHtml, brancherPieces, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, nonLusProjet, requeteMessages, requeteLectures, messagesDuProjet, lireMessagesAnterieurs, FENETRE_MESSAGES } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { filParJour, luLe, vientDEnFace, demandeDepuisMessage } from '../bulle.js';

export const vue = async (ctx, env) => {
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const uid = env.session.utilisateur.uid;
  titrePage('Messages');
  filAriane([{ libelle: 'Messages' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  const projets = () => (magasin.lire(K.projets) || env.session.projets).filter((p) => !p.archive);
  let pid = ctx.params.pid || '';
  /* Le brouillon venu de l'adresse ne se pose qu'une fois : ensuite c'est
     ce que la personne tape qui compte. */
  let brouillonAdresse = String((ctx.requete || {}).brouillon || '');
  const abonnes = new Set();
  const abonnerMessages = (id) => {
    if (abonnes.has(id)) return;
    abonnes.add(id);
    lot.abonner(K.messages(id), () => requeteMessages(id));
    lot.sur(K.messages(id), planifier);
    lot.abonner(K.lectures(id), () => requeteLectures(id));
    lot.sur(K.lectures(id), planifier);
  };
  let composeur = null;
  let boite = null;
  let dernierRendu = '';
  /* L'historique plus ancien que la fenêtre en direct, chargé à la demande :
     par projet, les messages déjà lus (dans l'ordre) et si le début de la
     conversation est atteint. */
  const anciens = new Map();
  const PAGE = 50;
  let enChargement = false;
  let garderDefilement = null;

  /* Ce que l'autre côté a lu, et s'il écrit : les mêmes lectures que la bulle. */
  const enFace = () => (magasin.lire(K.lectures(pid)) || []).filter((l) => l.id !== uid && (equipe ? l.cote !== 'equipe' : l.cote === 'equipe'));
  const luJusqua = () => enFace().map((l) => enDate(l.lu)).filter(Boolean).sort((a, b) => b - a)[0] || null;
  const ecritMaintenant = () => enFace().find((l) => { const f = enDate(l.frappe); return f && Date.now() - f.getTime() < 7000; }) || null;

  const rendreFrappe = () => {
    const bloc = sortie.querySelector('#fil-frappe');
    if (!bloc) return;
    const qui = ecritMaintenant();
    bloc.hidden = !qui;
    if (qui) bloc.querySelector('span').textContent = `${equipe ? (qui.nom || 'Le client') : 'Capmedia'} écrit`;
  };

  const unMessage = (m) => `<div class="fil-message" data-msg="${echapper(m.id || '')}">${messageHtml(m, { moi: uid })}${vientDEnFace(m, { uid, equipe })
    ? `<button class="bulle-action" type="button" data-transformer="${echapper(m.id || '')}" aria-label="En faire une demande" data-astuce="En faire une demande">${icone('sparkle')}</button>`
    : ''}</div>`;

  const rendre = () => {
    const liste = projets();
    if (!magasin.chargee(K.projets) && !liste.length) return;
    liste.forEach((p) => abonnerMessages(p.id));
    if (!pid && liste[0]) pid = liste[0].id;
    /* Une adresse peut désigner un projet archivé, fermé, ou qui n'a jamais
       été le sien : un lien de notification, un vieux favori. Lire son nom
       sans vérifier faisait tomber la vue entière sur « Cette page n'a pas
       pu s'ouvrir », sans autre issue que recharger. On retombe donc sur la
       première conversation. */
    if (pid && !liste.some((p) => p.id === pid) && liste[0]) pid = liste[0].id;
    const profil = magasin.lire(K.profil);
    const courant = liste.find((p) => p.id === pid);
    const recents = courant ? messagesDuProjet(pid) : [];
    const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
    const vus = new Set(recents.map((m) => m.id));
    const messages = [...historique.messages.filter((m) => !vus.has(m.id)), ...recents];
    /* Il reste plus ancien tant que la fenêtre en direct est pleine et que
       le début de la conversation n'a pas été atteint. */
    const resteAvant = !historique.debutAtteint && (historique.messages.length > 0 || recents.length >= FENETRE_MESSAGES);
    const brouillon = composeur ? composeur.value : brouillonAdresse;
    const lu = luJusqua();
    const miens = messages.filter((m) => m.de && m.de.uid === uid);
    const dernierMien = miens[miens.length - 1];
    const luDernier = Boolean(dernierMien && lu && (enDate(dernierMien.date) || 0) <= lu);

    const empreinte = `${pid}|${liste.length}|${messages.length}|${messages[messages.length - 1] ? messages[messages.length - 1].id : ''}|${resteAvant}|${luDernier ? lu.getTime() : 0}|${liste.map((p) => nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid)).join(',')}`;
    if (empreinte === dernierRendu) { rendreFrappe(); return; }
    dernierRendu = empreinte;

    /* Lire ici compte partout : le compteur du rail (profil.lus) et l'accusé
       « Lu » de l'autre côté (lectures) tombent ensemble. */
    if (courant && messages.length) {
      ecrire.marquerVu(uid, `messages:${pid}`).catch(() => {});
      ecrire.marquerLecture(env.session, pid).catch(() => {});
    }

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Messages</h1><p class="chapo">${equipe ? 'Une conversation par projet, avec le client.' : 'Une conversation par projet, directement avec Capmedia. Pour une anomalie ou une demande précise, préférez une demande : elle est suivie jusqu\'au bout.'}</p></div></div>
      ${liste.length ? `<div class="grille" style="grid-template-columns:${liste.length > 1 ? 'minmax(0,280px) minmax(0,1fr)' : 'minmax(0,1fr)'}">
        ${liste.length > 1 ? `<div class="liste" style="align-self:start">${liste.map((p) => { const nb = nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid); const dernier = messagesDuProjet(p.id).slice(-1)[0]; return `
          <a class="ligne${p.id === pid ? ' actif' : ''}${nb ? ' non-lu' : ''}" href="#/messages/${echapper(p.id)}" style="${p.id === pid ? 'background:var(--fond-2)' : ''}">
            ${avatarProjet(p)}
            <span class="ligne-corps"><span class="ligne-titre">${echapper(p.nom)}</span><span class="ligne-sous tronque" style="display:block">${dernier ? echapper(`${dernier.de && dernier.de.cote === 'equipe' ? 'Capmedia' : (dernier.de || {}).nom || ''} : ${String(dernier.texte || '').trim() || ((dernier.pieces || []).length > 1 ? `${dernier.pieces.length} pièces jointes` : 'Pièce jointe')}`) : 'Aucun message'}</span></span>
            <span class="ligne-fin">${nb ? `<span class="badge badge--vif">${nb}</span>` : `<span class="t-micro t-3">${dernier ? echapper(depuis(dernier.date)) : ''}</span>`}</span>
          </a>`; }).join('')}</div>` : ''}
        <section class="carte" style="display:flex;flex-direction:column;min-height:60vh">
          <div class="rang-espace" style="padding-bottom:12px;border-bottom:1px solid var(--trait)"><div class="rang">${avatarProjet(courant, 'petit')}<p class="t-titre-3">${echapper(courant.nom)}</p></div><a class="t-petit" href="#/projets/${echapper(pid)}">Ouvrir le projet</a></div>
          <div class="fil" id="fil" style="flex:1;padding:16px 0;overflow-y:auto;max-height:60vh">
            ${resteAvant ? `<p class="fil-plus-anciens"><button class="btn btn-fantome btn-petit" type="button" data-plus-anciens>Voir les messages plus anciens</button></p>` : ''}
            ${messages.length ? filParJour(messages, unMessage) : `<div class="vide vide--compact"><span class="vide-icone">${icone('messages')}</span><p class="vide-titre">Commencez la conversation</p><p class="vide-texte">${equipe ? 'Le client reçoit un e-mail à chaque message.' : 'Capmedia reçoit un e-mail à chaque message et vous répond ici.'}</p></div>`}
            ${dernierMien ? `<p class="bulle-accuse" id="fil-accuse">${luDernier ? `${icone('checkDouble')} ${echapper(luLe(lu))}` : `${icone('check')} Envoyé`}</p>` : ''}
          </div>
          <p class="bulle-frappe" id="fil-frappe" hidden><i></i><i></i><i></i> <span></span></p>
          <form class="composer" id="forme-message" novalidate>
            <textarea class="zone" name="texte" id="texte-message" maxlength="6000" placeholder="Écrivez votre message..." aria-label="Votre message. Entrée envoie, Maj+Entrée va à la ligne.">${echapper(brouillon)}</textarea>
            <div id="zone-pieces"></div>
            <div class="composer-pied"><span class="t-micro t-3">Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne.</span><span class="pousse"></span><button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button></div>
          </form>
        </section>
      </div>` : vide({ icone: 'messages', titre: 'Aucun projet à discuter', texte: 'La messagerie s\'ouvre dès qu\'un projet est rattaché à votre compte.' })}
    </div>`;

    composeur = sortie.querySelector('#texte-message');
    const zone = sortie.querySelector('#zone-pieces');
    if (zone) {
      boite = depot(zone, { chemin: `projets/${pid}/messages`, texte: 'Joindre des <strong>fichiers</strong>.', aide: '' });
      const forme = sortie.querySelector('#forme-message');
      forme.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texte = composeur.value.trim();
        if (!texte && !boite.pieces.length) { toast('Écrivez quelque chose, ou joignez un fichier.', 'erreur'); return; }
        if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
        await agir(e.target.querySelector('[type="submit"]'), async () => {
          /* Des pièces sans un mot : le texte reste vide, l'écran montre les pièces seules. */
          await ecrire.messageProjet(env.session, pid, texte, boite.pieces);
          composeur.value = ''; boite.vider(); dernierRendu = '';
        });
      });
      /* Entrée envoie, Maj+Entrée va à la ligne : la même convention que dans la bulle. */
      composeur.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); forme.requestSubmit(); }
      });
      /* Dire à l'autre côté qu'on écrit, sans l'inonder : une marque toutes
         les quatre secondes au plus. */
      let frappe = 0;
      composeur.addEventListener('input', () => {
        if (Date.now() - frappe > 4000) { frappe = Date.now(); ecrire.marquerLecture(env.session, pid, { frappe: true }).catch(() => {}); }
      });
      if (brouillonAdresse) {
        brouillonAdresse = '';
        composeur.focus();
        const fin = composeur.value.length;
        try { composeur.setSelectionRange(fin, fin); } catch (e) { /* champ sans sélection */ }
      }
    }
    rendreFrappe();
    const fil = sortie.querySelector('#fil');
    /* Après un chargement d'historique, on garde sous les yeux le message
       qu'on lisait ; sinon on descend au plus récent. */
    if (fil && garderDefilement !== null) { fil.scrollTop = fil.scrollHeight - garderDefilement; garderDefilement = null; } else if (fil) fil.scrollTop = fil.scrollHeight;
  };

  const chargerPlusAnciens = async () => {
    if (enChargement || !pid) return;
    const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
    const recents = messagesDuProjet(pid);
    const plusAncien = historique.messages[0] || recents[0];
    if (!plusAncien || !plusAncien.date) return;
    enChargement = true;
    try {
      const page = await lireMessagesAnterieurs(pid, plusAncien.date, PAGE);
      anciens.set(pid, { messages: [...page, ...historique.messages], debutAtteint: page.length < PAGE });
      const fil = sortie.querySelector('#fil');
      garderDefilement = fil ? fil.scrollHeight - fil.scrollTop : null;
      dernierRendu = '';
      rendre();
    } catch (e) {
      toast("L'historique n'a pas pu être chargé.", 'erreur');
    } finally { enChargement = false; }
  };
  const gestesHistorique = sur(sortie, 'click', '[data-plus-anciens]', () => chargerPlusAnciens());
  const gestesTransformer = sur(sortie, 'click', '[data-transformer]', (el) => {
    const historique = anciens.get(pid) || { messages: [] };
    const m = [...historique.messages, ...messagesDuProjet(pid)].find((x) => x.id === el.dataset.transformer);
    if (m) demandeDepuisMessage(el, m, pid);
  });

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  lot.sur(K.projets, planifier);
  lot.sur(K.profil, planifier);
  brancherPieces(sortie);
  planifier();
  /* Le pouls de la frappe d'en face : la marque s'éteint seule au bout de
     quelques secondes, donc on repasse régulièrement. */
  const pouls = setInterval(rendreFrappe, 1500);
  return () => { clearTimeout(minuteur); clearInterval(pouls); gestesHistorique(); gestesTransformer(); lot.fin(); };
};
