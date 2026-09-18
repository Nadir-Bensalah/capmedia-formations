/* ==========================================================================
   ESPACE DE SUIVI · la fiche d'un ticket
   Contrat : docs/suivi.md

   Ouverte par ?t=<ticketId>. Le ticket, son fil de discussion et son
   journal se mettent à jour en direct.

   Deux points de vigilance, tenus ici :
     · le client ne voit jamais une note interne. La sous-collection est
       donc interrogée avec interne == false, faute de quoi les règles
       refusent la requête entière ;
     · les seules écritures proposées sont celles que les règles
       acceptent : marquer comme lu, valider une correction, rouvrir dans
       les sept jours, écrire un message côté client.
   ========================================================================== */

import {
  bdd, exigerSession, quitter, $, echapper, enParagraphes, avis, rienAAfficher,
  dateCourte, dateHeure, poids, initiales,
  pastilleStatut, pastilleUrgence, etiquetteType,
  envoyerPiece, lienPiece, TAILLE_MAX,
  STATUTS, URGENCES, PLATEFORMES,
  collection, doc, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp,
} from './noyau.js';

const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
const MAX_PIECES = 10;

const etat = {
  session: null,
  identifiant: new URLSearchParams(location.search).get('t'),
  ticket: null,
  messages: null,
  evenements: null,
  fichiers: [],
  dejaMarqueLu: false,
  envoiEnCours: false,
};

/* --- Les utilitaires de cet écran --------------------------------------- */

const enMillis = (valeur) => {
  if (!valeur) return 0;
  if (typeof valeur.toMillis === 'function') return valeur.toMillis();
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const nomPlateforme = (cle) => (cle in PLATEFORMES) ? PLATEFORMES[cle] : cle;

const libelleStatut = (cle) => (STATUTS[cle] ? STATUTS[cle].libelle : String(cle || ''));
const libelleUrgence = (cle) => (URGENCES[cle] ? URGENCES[cle].libelle : String(cle || ''));

const nomDuClient = () => {
  const u = etat.session.utilisateur;
  const t = etat.ticket || {};
  if (u.displayName) return u.displayName;
  if (t.auteur && t.auteur.uid === u.uid && t.auteur.nom) return t.auteur.nom;
  return String(u.email || '').split('@')[0] || 'Client';
};

/** Un message d'écran honnête quand le ticket n'est pas accessible. */
const afficherSouci = (titre, texte) => {
  $('#chargement').classList.add('masque');
  $('#fiche').classList.add('masque');
  const zone = $('#souci');
  zone.classList.remove('masque');
  zone.innerHTML = `
    <aside class="encadre encadre--attention"><div>
      <p class="t-petit t-fort">${echapper(titre)}</p>
      <p class="t-petit">${echapper(texte)}</p>
    </div></aside>
    <a class="btn btn-secondaire" href="./projet.html">Revenir à mes tickets</a>`;
};

/** Ouvre une pièce jointe dans un nouvel onglet. */
const ouvrirPiece = async (piece, bouton) => {
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Ouverture...';
  try {
    const url = await lienPiece(piece);
    const lien = document.createElement('a');
    lien.href = url;
    lien.target = '_blank';
    lien.rel = 'noopener';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
  } catch (e) {
    avis("Ce fichier n'a pas pu être ouvert. Réessayez dans un instant.", 'erreur');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
};

/**
 * Les pièces sont servies par une URL signée qu'il faut demander : on
 * rend donc un bouton, et l'URL est obtenue au moment du clic.
 */
const boutonsPieces = (pieces, prefixe) => (pieces || []).map((p, i) => `
  <button class="piece" type="button" data-piece="${echapper(prefixe)}:${i}">
    <span>${echapper(p.nom || 'Pièce jointe')}</span>
    <b>${echapper(poids(p.taille))}</b>
  </button>`).join('');

/** Retrouve une pièce depuis la valeur data-piece d'un bouton. */
const piecePar = (reference) => {
  const [prefixe, index] = String(reference).split(':');
  const i = Number(index);
  if (prefixe === 'ticket') {
    const liste = (etat.ticket && etat.ticket.pieces) || [];
    return liste[i] || null;
  }
  const message = (etat.messages || []).find((m) => m.id === prefixe);
  return message && message.pieces ? (message.pieces[i] || null) : null;
};

/* ========================================================================
   Rendu : l'en-tête et le contenu du signalement
   ===================================================================== */

const dessinerTete = () => {
  const t = etat.ticket;

  $('#numero').textContent = t.numero || "Numéro en cours d'attribution";
  $('#titre').textContent = t.titre || 'Ticket';
  document.title = `${t.numero || 'Ticket'} · Suivi Capmedia`;

  $('#etats').innerHTML = `${pastilleStatut(t.statut)}${pastilleUrgence(t.urgence)}`;

  const auteur = (t.auteur && t.auteur.nom) ? t.auteur.nom : 'Inconnu';
  $('#meta').innerHTML = [
    etiquetteType(t.type),
    `<span>${echapper(nomPlateforme(t.plateforme))}</span>`,
    t.version ? `<span>Version ${echapper(t.version)}</span>` : '',
    `<span>Ouvert le ${echapper(dateCourte(t.cree))}</span>`,
    `<span>par ${echapper(auteur)}</span>`,
  ].filter(Boolean).join('');
};

const dessinerDetail = () => {
  const t = etat.ticket;
  const champ = (etiquette, texte, pleineLargeur) => (String(texte || '').trim() ? `
    <div class="fiche-champ"${pleineLargeur ? ' style="grid-column:1/-1"' : ''}>
      <span class="etiquette-champ">${echapper(etiquette)}</span>
      ${enParagraphes(texte)}
    </div>` : '');

  $('#detail').innerHTML = [
    champ('Description', t.description, true),
    champ('Étapes pour reproduire', t.etapes, true),
    champ('Résultat attendu', t.attendu, false),
    champ('Résultat obtenu', t.obtenu, false),
  ].join('');

  const pieces = t.pieces || [];
  $('#pieces-ticket').innerHTML = pieces.length
    ? `<span class="t-micro t-3" style="width:100%">Pièces jointes au signalement</span>${boutonsPieces(pieces, 'ticket')}`
    : '';
};

/* ========================================================================
   Rendu : les actions du client, et rien d'autre
   ===================================================================== */

const dessinerActions = () => {
  const t = etat.ticket;
  const zone = $('#actions');

  if (t.statut === 'a-valider') {
    zone.innerHTML = `
      <aside class="encadre encadre--action"><div>
        <p class="t-petit t-fort">La correction est livrée.</p>
        <p class="t-petit">Vérifiez de votre côté. Si tout est en ordre, dites-le nous : le ticket passera en résolu. Sinon, répondez dans le fil.</p>
        <button class="btn btn-principal" type="button" id="valider">La correction me convient</button>
      </div></aside>`;
    $('#valider').addEventListener('click', validerCorrection);
    return;
  }

  if (t.statut === 'resolu') {
    const limite = enMillis(t.resolu) + SEPT_JOURS;
    const encoreOuvrable = enMillis(t.resolu) > 0 && Date.now() < limite;
    zone.innerHTML = encoreOuvrable ? `
      <aside class="encadre encadre--note"><div>
        <p class="t-petit t-fort">Ce ticket est résolu.</p>
        <p class="t-petit">Si le problème revient, vous pouvez le rouvrir jusqu'au ${echapper(dateCourte(new Date(limite)))}.</p>
        <button class="btn btn-secondaire" type="button" id="rouvrir">Rouvrir le ticket</button>
      </div></aside>` : `
      <aside class="encadre encadre--note"><div>
        <p class="t-petit t-fort">Ce ticket est résolu depuis plus de sept jours.</p>
        <p class="t-petit">Passé ce délai, il ne peut plus être rouvert : cela garde l'historique lisible. Si le problème se reproduit, créez un nouveau ticket, nous y retrouverons ce dossier.</p>
        <a class="btn btn-secondaire" href="./projet.html">Créer un nouveau ticket</a>
      </div></aside>`;
    if (encoreOuvrable) $('#rouvrir').addEventListener('click', rouvrirTicket);
    return;
  }

  if (t.statut === 'en-attente-client') {
    zone.innerHTML = `
      <aside class="encadre encadre--attention"><div>
        <p class="t-petit t-fort">Nous attendons votre réponse.</p>
        <p class="t-petit">Répondez dans le fil plus bas : le ticket repart aussitôt de notre côté.</p>
        <a class="btn btn-secondaire" href="#texte">Aller au champ de réponse</a>
      </div></aside>`;
    return;
  }

  if (t.statut === 'ferme' || t.statut === 'refuse') {
    zone.innerHTML = `
      <aside class="encadre encadre--note"><div>
        <p class="t-petit t-fort">${t.statut === 'ferme' ? 'Ce ticket est clos.' : 'Cette demande sort du périmètre convenu.'}</p>
        <p class="t-petit">Le fil reste consultable, et vous pouvez toujours nous écrire ici.</p>
      </div></aside>`;
    return;
  }

  zone.innerHTML = '';
};

/* ========================================================================
   Rendu : le fil de discussion
   ===================================================================== */

const dessinerFil = () => {
  const zone = $('#fil');
  if (!etat.messages) {
    zone.setAttribute('aria-busy', 'true');
    zone.innerHTML = '<p class="t-petit t-3">Chargement des échanges...</p>';
    return;
  }
  zone.setAttribute('aria-busy', 'false');

  if (!etat.messages.length) {
    zone.innerHTML = rienAAfficher(
      'Aucun échange pour le moment.',
      'Votre signalement est enregistré. Notre réponse arrivera ici, et par e-mail.',
    );
    return;
  }

  zone.innerHTML = etat.messages.map((m) => {
    const de = m.de || {};
    const equipe = de.cote === 'equipe';
    return `
      <article class="message${equipe ? ' message--equipe' : ''}">
        <div class="jeton" aria-hidden="true">${echapper(initiales(de.nom))}</div>
        <div style="min-width:0">
          <div class="message-tete">
            <span class="message-auteur">${echapper(de.nom || (equipe ? 'Capmedia' : 'Vous'))}</span>
            <span class="message-date">${echapper(dateHeure(m.date))}</span>
          </div>
          <div class="message-corps">${enParagraphes(m.texte)}</div>
          ${(m.pieces || []).length ? `<div class="pieces">${boutonsPieces(m.pieces, m.id)}</div>` : ''}
        </div>
      </article>`;
  }).join('');
};

/* ========================================================================
   Rendu : l'historique, en français lisible
   ===================================================================== */

const phraseEvenement = (e) => {
  switch (e.type) {
    case 'creation':
      return 'Ticket créé';
    case 'statut':
      return `Statut passé de ${libelleStatut(e.avant)} à ${libelleStatut(e.apres)}`;
    case 'urgence':
      return `Urgence passée de ${libelleUrgence(e.avant)} à ${libelleUrgence(e.apres)}`;
    case 'assignation':
      return e.apres ? `Ticket confié à ${e.apres}` : 'Ticket rendu disponible';
    case 'archive':
      return String(e.apres) === 'true' ? 'Ticket archivé' : 'Ticket sorti des archives';
    case 'piece':
      return `Pièce jointe ajoutée : ${e.apres || ''}`.trim();
    default:
      return 'Mouvement sur le ticket';
  }
};

const dessinerHistorique = () => {
  const zone = $('#historique');
  if (!etat.evenements) {
    zone.innerHTML = '<li>Chargement...</li>';
    return;
  }
  if (!etat.evenements.length) {
    zone.innerHTML = '<li>Aucun mouvement enregistré pour le moment.</li>';
    return;
  }
  zone.innerHTML = etat.evenements.map((e) => {
    const par = (e.par && e.par.nom) ? `, par ${echapper(e.par.nom)}` : '';
    const quand = enMillis(e.date);
    const lisible = quand ? `le ${dateHeure(e.date)}` : 'date inconnue';
    const machine = quand ? ` datetime="${echapper(new Date(quand).toISOString())}"` : '';
    return `<li>${echapper(phraseEvenement(e))}${par},
      <time${machine}>${echapper(lisible)}</time></li>`;
  }).join('');
};

/* ========================================================================
   Les écritures du client
   ===================================================================== */

/** À l'ouverture : le ticket est lu. Seul le champ `lu` bouge. */
const marquerLu = async () => {
  if (etat.dejaMarqueLu) return;
  etat.dejaMarqueLu = true;
  try {
    await updateDoc(doc(bdd, 'tickets', etat.identifiant), { 'lu.client': serverTimestamp() });
  } catch (e) {
    // Sans conséquence pour le client : la pastille de non lu reste, c'est tout.
  }
};

const validerCorrection = async (e) => {
  const bouton = e.currentTarget;
  if (!window.confirm('Confirmer que la correction vous convient ? Le ticket passera en résolu.')) return;
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';
  try {
    await updateDoc(doc(bdd, 'tickets', etat.identifiant), {
      statut: 'resolu',
      resolu: serverTimestamp(),
      maj: serverTimestamp(),
    });
    avis('Merci. Le ticket est marqué résolu.');
  } catch (e2) {
    bouton.disabled = false;
    bouton.textContent = 'La correction me convient';
    avis("L'enregistrement a échoué. Réessayez dans un instant.", 'erreur');
  }
};

const rouvrirTicket = async (e) => {
  const bouton = e.currentTarget;
  if (!window.confirm('Rouvrir ce ticket ? Il repart chez nous, en cours de traitement.')) return;
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';
  try {
    await updateDoc(doc(bdd, 'tickets', etat.identifiant), {
      statut: 'en-cours',
      maj: serverTimestamp(),
    });
    avis('Ticket rouvert. Nous le reprenons.');
  } catch (e2) {
    bouton.disabled = false;
    bouton.textContent = 'Rouvrir le ticket';
    avis("La réouverture a échoué. Le délai de sept jours est peut-être dépassé.", 'erreur');
  }
};

/* --- Le dépôt de fichiers de la réponse --------------------------------- */

const dessinerFichiers = () => {
  $('#liste-fichiers').innerHTML = etat.fichiers.map((f, i) => `
    <span class="piece">
      <span>${echapper(f.name)}</span>
      <b>${echapper(poids(f.size))}</b>
      <button class="piece-retirer" type="button" data-retirer="${i}"
              aria-label="Retirer ${echapper(f.name)}">&times;</button>
    </span>`).join('');
  $('#texte-depot').textContent = etat.fichiers.length
    ? `${etat.fichiers.length} fichier${etat.fichiers.length > 1 ? 's' : ''} prêt${etat.fichiers.length > 1 ? 's' : ''}. Touchez pour en ajouter.`
    : 'Déposez vos fichiers ici, ou touchez pour les choisir.';
};

const ajouterFichiers = (liste) => {
  const refuses = [];
  Array.from(liste).forEach((f) => {
    if (etat.fichiers.length >= MAX_PIECES) { refuses.push(`${f.name} (10 fichiers au maximum)`); return; }
    if (!/^(image\/|application\/pdf$)/.test(f.type)) { refuses.push(`${f.name} (ni image ni PDF)`); return; }
    if (f.size >= TAILLE_MAX) { refuses.push(`${f.name} (au delà de 10 Mo)`); return; }
    if (etat.fichiers.some((x) => x.name === f.name && x.size === f.size)) return;
    etat.fichiers.push(f);
  });
  dessinerFichiers();
  if (refuses.length) avis(`Non retenu : ${refuses.join(', ')}`, 'erreur');
};

/* --- L'envoi d'un message ----------------------------------------------- */

const erreurMessage = (texte) => {
  const zone = $('#erreur-message');
  if (!texte) { zone.classList.add('masque'); zone.innerHTML = ''; return; }
  zone.classList.remove('masque');
  zone.innerHTML = `<aside class="encadre encadre--piege"><div><p class="t-petit">${echapper(texte)}</p></div></aside>`;
};

const envoyerMessage = async (evenement) => {
  evenement.preventDefault();
  if (etat.envoiEnCours) return;
  erreurMessage('');

  const texte = $('#texte').value.trim();
  if (!texte) {
    erreurMessage('Un message a besoin de quelques mots, même avec une capture.');
    $('#texte').focus();
    return;
  }

  const bouton = $('#envoyer-message');
  etat.envoiEnCours = true;
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';

  try {
    // Les pièces partent d'abord : un message ne se modifie plus après
    // sa création, donc il doit être complet dès le premier écrit.
    const pieces = [];
    if (etat.fichiers.length) {
      const chemin = `projets/${etat.ticket.projet}/tickets/${etat.identifiant}`;
      for (const fichier of etat.fichiers) {
        pieces.push(await envoyerPiece(fichier, chemin));
      }
    }

    await addDoc(collection(bdd, 'tickets', etat.identifiant, 'messages'), {
      de: {
        uid: etat.session.utilisateur.uid,
        nom: nomDuClient(),
        cote: 'client',
      },
      texte,
      pieces,
      interne: false,
      date: serverTimestamp(),
    });

    $('#texte').value = '';
    etat.fichiers = [];
    dessinerFichiers();
    avis('Message envoyé.');
  } catch (e) {
    erreurMessage((e && e.message)
      ? `${e.message} Votre message n'a pas été envoyé.`
      : "L'envoi a échoué. Votre message n'a pas été envoyé : réessayez dans un instant.");
  } finally {
    etat.envoiEnCours = false;
    bouton.disabled = false;
    bouton.textContent = 'Envoyer';
  }
};

/* ========================================================================
   Les abonnements en direct
   ===================================================================== */

const ecouterTicket = () => {
  onSnapshot(
    doc(bdd, 'tickets', etat.identifiant),
    (fiche) => {
      if (!fiche.exists()) {
        afficherSouci('Ce ticket est introuvable.',
          "Il a peut-être été supprimé, ou le lien est incomplet. Revenez à la liste de vos tickets.");
        return;
      }
      etat.ticket = { id: fiche.id, ...fiche.data() };
      $('#chargement').classList.add('masque');
      $('#souci').classList.add('masque');
      $('#fiche').classList.remove('masque');
      $('#retour').href = `./projet.html?p=${encodeURIComponent(etat.ticket.projet || '')}`;
      dessinerTete();
      dessinerDetail();
      dessinerActions();
      marquerLu();
    },
    () => {
      afficherSouci('Ce ticket ne vous est pas accessible.',
        "Il appartient peut-être à un autre projet que le vôtre. Si vous pensez que c'est une erreur, écrivez-nous.");
    },
  );
};

const ecouterFil = () => {
  // interne == false est indispensable : sans ce filtre, les règles
  // refusent la requête entière, et le client ne verrait plus rien.
  onSnapshot(
    query(collection(bdd, 'tickets', etat.identifiant, 'messages'), where('interne', '==', false)),
    (lot) => {
      etat.messages = lot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => enMillis(a.date) - enMillis(b.date));
      dessinerFil();
    },
    () => {
      etat.messages = [];
      $('#fil').setAttribute('aria-busy', 'false');
      $('#fil').innerHTML = rienAAfficher('Les échanges ne sont pas accessibles pour le moment.', 'Rechargez la page.');
    },
  );
};

const ecouterHistorique = () => {
  onSnapshot(
    collection(bdd, 'tickets', etat.identifiant, 'evenements'),
    (lot) => {
      etat.evenements = lot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => enMillis(a.date) - enMillis(b.date));
      dessinerHistorique();
    },
    () => {
      etat.evenements = [];
      $('#historique').innerHTML = '<li>Historique indisponible pour le moment.</li>';
    },
  );
};

/* ========================================================================
   Le démarrage
   ===================================================================== */

const demarrer = async () => {
  const s = await exigerSession();
  if (!s) return;
  etat.session = s;
  $('#courriel-compte').textContent = s.utilisateur.email || '';
  $('#deconnexion').addEventListener('click', quitter);

  if (!etat.identifiant) {
    afficherSouci('Aucun ticket demandé.',
      "Le lien ne porte pas d'identifiant de ticket. Ouvrez le ticket depuis votre liste.");
    return;
  }

  ecouterTicket();
  ecouterFil();
  ecouterHistorique();

  $('#forme-message').addEventListener('submit', envoyerMessage);

  $('#fichiers').addEventListener('change', (e) => {
    ajouterFichiers(e.target.files);
    e.target.value = '';
  });

  $('#liste-fichiers').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-retirer]');
    if (!bouton) return;
    etat.fichiers.splice(Number(bouton.dataset.retirer), 1);
    dessinerFichiers();
  });

  const depot = $('.depot');
  ['dragenter', 'dragover'].forEach((nom) => depot.addEventListener(nom, (e) => {
    e.preventDefault();
    depot.classList.add('survol');
  }));
  ['dragleave', 'drop'].forEach((nom) => depot.addEventListener(nom, (e) => {
    e.preventDefault();
    depot.classList.remove('survol');
  }));
  depot.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) ajouterFichiers(e.dataTransfer.files);
  });

  // Les pièces jointes, du signalement comme des messages.
  $('#vue').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-piece]');
    if (!bouton) return;
    const piece = piecePar(bouton.dataset.piece);
    if (piece) ouvrirPiece(piece, bouton);
  });
};

demarrer();
