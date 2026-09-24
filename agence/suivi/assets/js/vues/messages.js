/* ==========================================================================
   La messagerie : une conversation générale par projet. Simple, à deux
   voix, avec pièces jointes. Les fils rattachés à une demande vivent sur
   la fiche de la demande.
   ========================================================================== */

import { echapper, depuis, dateHeure, parDateDesc } from '../noyau.js';
import { icone, avatarProjet, vide, squelette, titrePage, toast, depot, agir, messageHtml, brancherPieces, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, nonLusProjet, requeteMessages, messagesDuProjet, lireMessagesAnterieurs, FENETRE_MESSAGES } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';

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
  const abonnes = new Set();
  const abonnerMessages = (id) => {
    if (abonnes.has(id)) return;
    abonnes.add(id);
    lot.abonner(K.messages(id), () => requeteMessages(id));
    lot.sur(K.messages(id), planifier);
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
    const brouillon = composeur ? composeur.value : '';

    const empreinte = `${pid}|${liste.length}|${messages.length}|${messages[messages.length - 1] ? messages[messages.length - 1].id : ''}|${resteAvant}`;
    if (empreinte === dernierRendu) { return; }
    dernierRendu = empreinte;

    if (courant && messages.length && !equipe) ecrire.marquerVu(uid, `messages:${pid}`).catch(() => {});
    if (courant && messages.length && equipe) ecrire.marquerVu(uid, `messages:${pid}`).catch(() => {});

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Messages</h1><p class="chapo">${equipe ? 'Une conversation par projet, avec le client.' : 'Une conversation par projet, directement avec Capmedia. Pour une anomalie ou une demande précise, préférez une demande : elle est suivie jusqu\'au bout.'}</p></div></div>
      ${liste.length ? `<div class="grille" style="grid-template-columns:${liste.length > 1 ? 'minmax(0,280px) minmax(0,1fr)' : 'minmax(0,1fr)'}">
        ${liste.length > 1 ? `<div class="liste" style="align-self:start">${liste.map((p) => { const nb = nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid); const dernier = messagesDuProjet(p.id).slice(-1)[0]; return `
          <a class="ligne${p.id === pid ? ' actif' : ''}${nb ? ' non-lu' : ''}" href="#/messages/${echapper(p.id)}" style="${p.id === pid ? 'background:var(--fond-2)' : ''}">
            ${avatarProjet(p)}
            <span class="ligne-corps"><span class="ligne-titre">${echapper(p.nom)}</span><span class="ligne-sous tronque" style="display:block">${dernier ? echapper(`${dernier.de && dernier.de.cote === 'equipe' ? 'Capmedia' : (dernier.de || {}).nom || ''} : ${dernier.texte || ''}`) : 'Aucun message'}</span></span>
            <span class="ligne-fin">${nb ? `<span class="badge badge--vif">${nb}</span>` : `<span class="t-micro t-3">${dernier ? echapper(depuis(dernier.date)) : ''}</span>`}</span>
          </a>`; }).join('')}</div>` : ''}
        <section class="carte" style="display:flex;flex-direction:column;min-height:60vh">
          <div class="rang-espace" style="padding-bottom:12px;border-bottom:1px solid var(--trait)"><div class="rang">${avatarProjet(courant, 'petit')}<p class="t-titre-3">${echapper(courant.nom)}</p></div><a class="t-petit" href="#/projets/${echapper(pid)}">Ouvrir le projet</a></div>
          <div class="fil" id="fil" style="flex:1;padding:16px 0;overflow-y:auto;max-height:60vh">
            ${resteAvant ? `<p class="fil-plus-anciens"><button class="btn btn-fantome btn-petit" type="button" data-plus-anciens>Voir les messages plus anciens</button></p>` : ''}
            ${messages.length ? messages.map((m) => messageHtml(m, { moi: uid })).join('') : `<div class="vide vide--compact"><span class="vide-icone">${icone('messages')}</span><p class="vide-titre">Commencez la conversation</p><p class="vide-texte">${equipe ? 'Le client reçoit un e-mail à chaque message.' : 'Capmedia reçoit un e-mail à chaque message et vous répond ici.'}</p></div>`}
          </div>
          <form class="composer" id="forme-message" novalidate>
            <textarea class="zone" name="texte" id="texte-message" maxlength="6000" placeholder="Écrivez votre message...">${echapper(brouillon)}</textarea>
            <div id="zone-pieces"></div>
            <div class="composer-pied"><span class="t-micro t-3">Entrée pour une nouvelle ligne, le bouton pour envoyer.</span><span class="pousse"></span><button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button></div>
          </form>
        </section>
      </div>` : vide({ icone: 'messages', titre: 'Aucun projet à discuter', texte: 'La messagerie s\'ouvre dès qu\'un projet est rattaché à votre compte.' })}
    </div>`;

    composeur = sortie.querySelector('#texte-message');
    const zone = sortie.querySelector('#zone-pieces');
    if (zone) {
      boite = depot(zone, { chemin: `projets/${pid}/messages`, texte: 'Joindre des <strong>fichiers</strong>.', aide: '' });
      sortie.querySelector('#forme-message').addEventListener('submit', async (e) => {
        e.preventDefault();
        const texte = composeur.value.trim();
        if (!texte && !boite.pieces.length) { toast('Écrivez quelque chose.', 'erreur'); return; }
        if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
        await agir(e.target.querySelector('[type="submit"]'), async () => {
          await ecrire.messageProjet(env.session, pid, texte || '(pièces jointes)', boite.pieces);
          composeur.value = ''; boite.vider(); dernierRendu = '';
        });
      });
    }
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

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  lot.sur(K.projets, planifier);
  lot.sur(K.profil, planifier);
  brancherPieces(sortie);
  planifier();
  return () => { clearTimeout(minuteur); gestesHistorique(); lot.fin(); };
};

void dateHeure; void parDateDesc; void naviguer;
