/* ==========================================================================
   La messagerie : une conversation générale par projet. Simple, à deux
   voix, avec pièces jointes. Les fils rattachés à une demande vivent sur
   la fiche de la demande.

   Les conventions sont celles de la bulle (bulle.js), qui prête ses aides :
   Entrée envoie, Maj+Entrée va à la ligne ; le fil est séparé par jour ;
   « Capmedia écrit » ; l'accusé « Lu le JJ/MM à HH:MM » ; « En faire une
   demande » sur les messages d'en face seulement. Un envoi de pièces sans
   texte ne dit rien à leur place. « ?brouillon= » dans l'adresse pose un
   texte dans le champ, « ?message= » amène un message sous les yeux.

   Depuis octobre 2026 (messagerie.js) : réagir, répondre en citant,
   modifier son message quinze minutes, le supprimer. La page se dessine
   en trois zones indépendantes : la liste des conversations, le fil, et le
   champ de saisie, monté une seule fois par conversation. Un message qui
   arrive ne touche ni à ce qu'on écrit, ni aux pièces qu'on joint.
   ========================================================================== */

import { echapper, depuis, enDate } from '../noyau.js';
import { icone, avatarProjet, vide, squelette, titrePage, toast, depot, agir, brancherPieces, sur, lisible } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, nonLusProjet, requeteMessages, requeteLectures, messagesDuProjet, lireMessagesAnterieurs, FENETRE_MESSAGES } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { filParJour, luLe, demandeDepuisMessage } from '../bulle.js';
import { messageDuFil, signatureFil, allerAuMessage, barreContexte, citationPour, brancherGestesMessages, extrait } from '../messagerie.js';

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
  /* Le message à montrer à l'arrivée (« ?message= », la citation d'une
     bulle qui n'avait pas l'original). */
  let messageAdresse = String((ctx.requete || {}).message || '');
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
  /* Ce qui est dessiné, zone par zone : rien ne se redessine pour rien. */
  let cleStructure = null;
  let cleListe = null;
  let cleFil = null;
  let dernierAffiche = '';
  let dernierMarque = '';
  /* Répondre à un message, ou modifier le sien : { mode, message }. */
  let contexte = null;
  let brouillonMis = '';
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

  /* Les messages affichés : l'historique chargé, puis la fenêtre en direct. */
  const messagesAffiches = () => {
    const recents = messagesDuProjet(pid);
    const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
    const vus = new Set(recents.map((m) => m.id));
    return [...historique.messages.filter((m) => !vus.has(m.id)), ...recents];
  };

  /* --- La liste des conversations ------------------------------------- */
  const ligneConversation = (p, profil) => {
    const nb = nonLusProjet(messagesDuProjet(p.id), profil, p.id, uid);
    const dernier = messagesDuProjet(p.id).slice(-1)[0];
    const resume = dernier ? `${dernier.de && dernier.de.cote === 'equipe' ? 'Capmedia' : (dernier.de || {}).nom || ''} : ${extrait(dernier, 90)}` : 'Aucun message';
    return `
      <a class="ligne${p.id === pid ? ' actif' : ''}${nb ? ' non-lu' : ''}" href="#/messages/${echapper(p.id)}" style="${p.id === pid ? 'background:var(--fond-2)' : ''}">
        ${avatarProjet(p)}
        <span class="ligne-corps"><span class="ligne-titre">${echapper(p.nom)}</span><span class="ligne-sous tronque" style="display:block">${echapper(resume)}</span></span>
        <span class="ligne-fin">${nb ? `<span class="badge badge--vif">${nb}</span>` : `<span class="t-micro t-3">${dernier ? echapper(depuis(dernier.date)) : ''}</span>`}</span>
      </a>`;
  };

  /* --- Le champ de saisie : monté une fois par conversation ------------ */
  const rendreContexte = () => {
    const zone = sortie.querySelector('#contexte-message');
    if (zone) zone.innerHTML = barreContexte(contexte, uid);
    const forme = sortie.querySelector('#forme-message');
    if (forme) forme.classList.toggle('en-modification', Boolean(contexte && contexte.mode === 'modifier'));
  };
  const finirContexte = () => {
    if (contexte && contexte.mode === 'modifier' && composeur) composeur.value = brouillonMis;
    contexte = null; brouillonMis = '';
    rendreContexte();
  };
  const curseurAuBout = () => {
    if (!composeur) return;
    composeur.focus();
    const fin = composeur.value.length;
    try { composeur.setSelectionRange(fin, fin); } catch (e) { /* champ sans sélection */ }
  };
  const repondre = (m) => {
    if (contexte && contexte.mode === 'modifier') finirContexte();
    contexte = { mode: 'repondre', message: m };
    rendreContexte();
    curseurAuBout();
  };
  const modifier = (m) => {
    if (!composeur) return;
    if (!contexte || contexte.mode !== 'modifier') brouillonMis = composeur.value;
    contexte = { mode: 'modifier', message: m };
    rendreContexte();
    composeur.value = String(m.texte || '');
    curseurAuBout();
  };

  const monterComposeur = () => {
    composeur = sortie.querySelector('#texte-message');
    const zone = sortie.querySelector('#zone-pieces');
    if (!zone || !composeur) return;
    boite = depot(zone, { chemin: `projets/${pid}/messages`, texte: 'Joindre des <strong>fichiers</strong>.', aide: '' });
    const forme = sortie.querySelector('#forme-message');
    forme.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texte = composeur.value.trim();
      const bouton = forme.querySelector('[type="submit"]');
      /* Modifier son message : le texte seul, dans la fenêtre des quinze minutes. */
      if (contexte && contexte.mode === 'modifier') {
        const m = contexte.message;
        if (!texte && !(m.pieces || []).length) { toast('Un message ne peut pas être vide : supprimez-le plutôt.', 'erreur'); return; }
        if (texte === String(m.texte || '').trim()) { finirContexte(); return; }
        bouton.disabled = true;
        try { await ecrire.modifierMessage(pid, m.id, texte); finirContexte(); } catch (err) {
          toast(err && err.code === 'permission-denied' ? 'Le délai de modification (15 minutes) est passé.' : lisible(err), 'erreur');
        } finally { bouton.disabled = false; }
        return;
      }
      if (!texte && !boite.pieces.length) { toast('Écrivez quelque chose, ou joignez un fichier.', 'erreur'); return; }
      if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
      const reponseA = contexte && contexte.mode === 'repondre' ? citationPour(contexte.message, uid) : null;
      await agir(bouton, async () => {
        /* Des pièces sans un mot : le texte reste vide, l'écran montre les pièces seules. */
        await ecrire.messageProjet(env.session, pid, texte, boite.pieces, reponseA);
        composeur.value = ''; boite.vider();
        if (reponseA) finirContexte();
      });
    });
    /* Entrée envoie, Maj+Entrée va à la ligne : la même convention que dans
       la bulle. Échap abandonne la réponse ou la modification. */
    composeur.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); forme.requestSubmit(); }
      if (e.key === 'Escape' && contexte) { e.preventDefault(); finirContexte(); }
    });
    /* Dire à l'autre côté qu'on écrit, sans l'inonder : une marque toutes
       les quatre secondes au plus. */
    let frappe = 0;
    composeur.addEventListener('input', () => {
      if (Date.now() - frappe > 4000) { frappe = Date.now(); ecrire.marquerLecture(env.session, pid, { frappe: true }).catch(() => {}); }
    });
    if (brouillonAdresse) {
      composeur.value = brouillonAdresse;
      brouillonAdresse = '';
      curseurAuBout();
    }
    rendreContexte();
  };

  /* --- Le fil ---------------------------------------------------------- */
  const rendreFil = (messages, resteAvant) => {
    const fil = sortie.querySelector('#fil');
    if (!fil) return;
    const lu = luJusqua();
    const miens = messages.filter((m) => m.de && m.de.uid === uid);
    const dernierMien = miens[miens.length - 1];
    const luDernier = Boolean(dernierMien && lu && (enDate(dernierMien.date) || 0) <= lu);
    const cle = `${pid}#${signatureFil(messages)}#${resteAvant}#${dernierMien ? dernierMien.id : ''}:${luDernier ? luLe(lu) : ''}`;
    if (cle === cleFil) return;
    const premier = cleFil === null;
    cleFil = cle;
    const dernier = messages[messages.length - 1];

    /* Lire ici compte partout : le compteur du rail (profil.lus) et l'accusé
       « Lu » de l'autre côté (lectures) tombent ensemble. Seulement quand un
       message de plus est arrivé : une réaction ou une correction ne
       réécrit pas l'accusé, qui redessinerait le fil d'en face pour rien. */
    if (dernier && dernier.id !== dernierMarque) {
      dernierMarque = dernier.id;
      ecrire.marquerVu(uid, `messages:${pid}`).catch(() => {});
      ecrire.marquerLecture(env.session, pid).catch(() => {});
    }
    const nouveauEnBas = Boolean(dernier) && dernier.id !== dernierAffiche;
    dernierAffiche = dernier ? dernier.id : '';
    const enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 80;
    const hautAvant = fil.scrollTop;
    fil.innerHTML = `
      ${resteAvant ? '<p class="fil-plus-anciens"><button class="btn btn-fantome btn-petit" type="button" data-plus-anciens>Voir les messages plus anciens</button></p>' : ''}
      ${messages.length ? filParJour(messages, (m) => messageDuFil(m, { uid, equipe, classe: 'fil-message', tous: messages })) : `<div class="vide vide--compact"><span class="vide-icone">${icone('messages')}</span><p class="vide-titre">Commencez la conversation</p><p class="vide-texte">${equipe ? 'Le client reçoit un e-mail à chaque message.' : 'Capmedia reçoit un e-mail à chaque message et vous répond ici.'}</p></div>`}
      ${dernierMien ? `<p class="bulle-accuse" id="fil-accuse">${luDernier ? `${icone('checkDouble')} ${echapper(luLe(lu))}` : `${icone('check')} Envoyé`}</p>` : ''}`;
    /* Après un chargement d'historique, on garde sous les yeux le message
       qu'on lisait ; en bas du fil, ou pour un message à moi, on suit le
       plus récent ; sinon (une réaction, une correction plus haut) on ne
       bouge pas. */
    if (garderDefilement !== null) { fil.scrollTop = fil.scrollHeight - garderDefilement; garderDefilement = null; }
    else if (premier || enBas || (nouveauEnBas && dernier.de && dernier.de.uid === uid)) fil.scrollTop = fil.scrollHeight;
    else fil.scrollTop = hautAvant;
    if (messageAdresse && messages.length) {
      const id = messageAdresse;
      messageAdresse = '';
      allerA(id);
    }
  };

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
    const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
    const messages = courant ? messagesAffiches() : [];
    /* Il reste plus ancien tant que la fenêtre en direct est pleine et que
       le début de la conversation n'a pas été atteint. */
    const resteAvant = !historique.debutAtteint && (historique.messages.length > 0 || messagesDuProjet(pid).length >= FENETRE_MESSAGES);
    /* La liste des conversations, à gauche : chez le client qui arrive par
       l'arbre d'un projet (#/messages/<p>), elle répéterait le rail. */
    const avecListe = liste.length > 1 && (equipe || !ctx.params.pid);

    const structure = `${pid}|${avecListe}|${liste.length > 0}|${courant ? `${courant.nom}|${courant.logo || ''}|${courant.couleur || ''}` : ''}`;
    if (structure !== cleStructure) {
      cleStructure = structure; cleListe = null; cleFil = null; dernierAffiche = '';
      const brouillon = composeur ? composeur.value : '';
      sortie.innerHTML = `<div class="page">
        <div class="page-tete"><div><h1>Messages</h1><p class="chapo">${equipe ? 'Une conversation par projet, avec le client.' : 'Une conversation par projet, directement avec Capmedia. Pour une anomalie ou un besoin précis, préférez un ticket : il est suivi jusqu\'au bout.'}</p></div></div>
        ${liste.length && courant ? `<div class="grille messages-deux${avecListe ? ' messages-deux--liste' : ''}">
          ${avecListe ? '<div class="liste" id="liste-conversations" style="align-self:start"></div>' : ''}
          <section class="carte" style="display:flex;flex-direction:column;min-height:60vh">
            <div class="rang-espace" style="padding-bottom:12px;border-bottom:1px solid var(--trait)"><div class="rang">${avatarProjet(courant, 'petit')}<p class="t-titre-3">${echapper(courant.nom)}</p></div><a class="t-petit" href="#/projets/${echapper(pid)}">Ouvrir le projet</a></div>
            <div class="fil" id="fil" style="flex:1;padding:16px 0;overflow-y:auto;max-height:60vh"></div>
            <p class="bulle-frappe" id="fil-frappe" hidden><i></i><i></i><i></i> <span></span></p>
            <form class="composer" id="forme-message" novalidate>
              <div id="contexte-message"></div>
              <textarea class="zone" name="texte" id="texte-message" maxlength="6000" placeholder="Écrivez votre message..." aria-label="Votre message. Entrée envoie, Maj+Entrée va à la ligne.">${echapper(brouillon)}</textarea>
              <div id="zone-pieces"></div>
              <div class="composer-pied"><span class="t-micro t-3 aide-clavier">Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne.</span><span class="pousse"></span><button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button></div>
            </form>
          </section>
        </div>` : vide(equipe
          ? { icone: 'messages', titre: 'Aucune conversation', texte: 'Chaque projet a sa conversation avec son client : elle apparaît ici dès que le projet existe.', action: '<a class="btn btn-secondaire" href="#/projets">Voir les projets</a>' }
          : { icone: 'messages', titre: 'Aucun projet à discuter', texte: 'La messagerie s\'ouvre dès qu\'un projet est rattaché à votre compte.' })}
      </div>`;
      composeur = null; boite = null;
      if (courant) monterComposeur();
    }

    const zoneListe = sortie.querySelector('#liste-conversations');
    if (zoneListe) {
      const lignes = liste.map((p) => ligneConversation(p, profil));
      const cle = lignes.join('');
      if (cle !== cleListe) { cleListe = cle; zoneListe.innerHTML = cle; }
    }
    if (courant) rendreFil(messages, resteAvant);
    rendreFrappe();
  };

  const allerA = async (id) => {
    const fil = sortie.querySelector('#fil');
    if (allerAuMessage(fil, id)) return;
    /* Plus ancien que ce qui est affiché : on remonte l'historique, page
       par page, cinq pages au plus. */
    for (let i = 0; i < 5; i += 1) {
      const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
      if (historique.debutAtteint) break;
      if (!(await chargerPlusAnciens())) break;
      if (allerAuMessage(sortie.querySelector('#fil'), id)) return;
    }
    toast('Ce message n\'est plus dans la conversation.', 'info');
  };

  const chargerPlusAnciens = async () => {
    if (enChargement || !pid) return false;
    const historique = anciens.get(pid) || { messages: [], debutAtteint: false };
    const recents = messagesDuProjet(pid);
    const plusAncien = historique.messages[0] || recents[0];
    if (!plusAncien || !plusAncien.date) return false;
    enChargement = true;
    try {
      const page = await lireMessagesAnterieurs(pid, plusAncien.date, PAGE);
      anciens.set(pid, { messages: [...page, ...historique.messages], debutAtteint: page.length < PAGE });
      const fil = sortie.querySelector('#fil');
      garderDefilement = fil ? fil.scrollHeight - fil.scrollTop : null;
      rendre();
      return true;
    } catch (e) {
      toast("L'historique n'a pas pu être chargé.", 'erreur');
      return false;
    } finally { enChargement = false; }
  };
  const trouver = (id) => messagesAffiches().find((x) => x.id === id);
  const gestesHistorique = sur(sortie, 'click', '[data-plus-anciens]', () => chargerPlusAnciens());
  const gestesTransformer = sur(sortie, 'click', '[data-transformer]', (el) => {
    const m = trouver(el.dataset.transformer);
    if (m) demandeDepuisMessage(el, m, pid);
  });
  const gestesContexte = sur(sortie, 'click', '[data-annuler-contexte]', () => { finirContexte(); if (composeur) composeur.focus(); });
  const gestesFil = brancherGestesMessages(sortie, {
    uid, equipe, session: env.session, pid: () => pid, trouver, repondre, modifier, allerA,
    transformer: (ancre, m) => demandeDepuisMessage(ancre, m, pid),
  });

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const planifier = magasin.dessinateur(rendre, 40, [K.projets, K.profil]);
  lot.sur(K.projets, planifier);
  lot.sur(K.profil, planifier);
  brancherPieces(sortie);
  planifier();
  /* Le pouls de la frappe d'en face : la marque s'éteint seule au bout de
     quelques secondes, donc on repasse régulièrement. */
  const pouls = setInterval(rendreFrappe, 1500);
  return () => { planifier.arreter(); clearInterval(pouls); gestesHistorique(); gestesTransformer(); gestesContexte(); gestesFil(); lot.fin(); };
};
