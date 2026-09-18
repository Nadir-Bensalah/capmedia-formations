/* ==========================================================================
   ESPACE DE SUIVI · le tableau de bord d'un projet
   Contrat : docs/suivi.md

   Deux vues dans un seul écran : les tickets, puis les devis et factures.
   Tout ce qui s'affiche vient de Firestore en direct. Rien n'est deviné,
   rien n'est inventé : quand une liste est vide, on le dit.

   Ce que le client peut écrire ici, et rien de plus :
     · créer un ticket (statut « nouveau », numéro posé par la fonction) ;
     · joindre des pièces à ce ticket, juste après sa création ;
     · accepter ou refuser un devis à l'état « envoye ».
   Les règles refusent tout le reste, donc l'écran ne le propose pas.
   ========================================================================== */

import {
  bdd, exigerSession, quitter, $, $$, echapper, avis, rienAAfficher,
  dateCourte, depuis, montant, poids,
  pastilleStatut, pastilleUrgence, etiquetteType,
  envoyerPiece, lienPiece, TAILLE_MAX,
  URGENCES, TYPES, PLATEFORMES, OUVERTS, ATTEND_CLIENT,
  collection, doc, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp,
} from './noyau.js';

/* --- Le vocabulaire propre aux devis et aux factures --------------------
   Le noyau porte celui des tickets. Un document de facturation a ses
   propres états, décrits par le contrat : on les traduit ici.
   ---------------------------------------------------------------------- */

const ETATS_DOCUMENT = {
  'envoye':    { libelle: 'À votre décision', voile: 'bleu' },
  'accepte':   { libelle: 'Accepté',          voile: 'vert' },
  'refuse':    { libelle: 'Refusé',           voile: 'gris' },
  'expire':    { libelle: 'Expiré',           voile: 'gris' },
  'a-payer':   { libelle: 'À payer',          voile: 'jaune' },
  'payee':     { libelle: 'Payée',            voile: 'vert' },
  'en-retard': { libelle: 'En retard',        voile: 'rouge' },
  'annulee':   { libelle: 'Annulée',          voile: 'gris' },
};

const TERMINES = ['resolu', 'ferme'];
const FACTURES_DUES = ['a-payer', 'en-retard'];
const MAX_PIECES = 10;

/* --- L'état de l'écran -------------------------------------------------- */

const etat = {
  session: null,
  projet: null,
  tickets: null,      // null tant que la première réponse n'est pas arrivée
  documents: null,
  filtre: 'tous',
  fichiers: [],
  arrets: [],         // les abonnements à couper quand on change de projet
  envoiEnCours: false,
};

/* --- Les petits utilitaires de cet écran -------------------------------- */

/** Millisecondes d'un timestamp Firestore, 0 s'il n'y en a pas. */
const enMillis = (valeur) => {
  if (!valeur) return 0;
  if (typeof valeur.toMillis === 'function') return valeur.toMillis();
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

/** Un ticket est non lu quand il a bougé depuis la dernière visite du client. */
const nonLu = (t) => enMillis(t.maj) > enMillis(t.lu && t.lu.client);

const nomPlateforme = (cle) => (cle in PLATEFORMES) ? PLATEFORMES[cle] : cle;

const pastilleDocument = (statut) => {
  const e = ETATS_DOCUMENT[statut] || { libelle: statut, voile: 'gris' };
  return `<span class="pastille pastille--${e.voile}">${echapper(e.libelle)}</span>`;
};

/** Ouvre une pièce dans un nouvel onglet, sans quitter l'application. */
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

/* --- Les filtres de la liste des tickets -------------------------------- */

const FILTRES = [
  { cle: 'tous',     libelle: 'Tous',                     garde: (t) => !t.archive },
  { cle: 'ouverts',  libelle: 'Ouverts',                  garde: (t) => !t.archive && OUVERTS.includes(t.statut) },
  { cle: 'a-moi',    libelle: 'Ce qui attend ma réponse',  garde: (t) => !t.archive && ATTEND_CLIENT.includes(t.statut) },
  { cle: 'resolus',  libelle: 'Résolus',                   garde: (t) => !t.archive && TERMINES.includes(t.statut) },
  { cle: 'archives', libelle: 'Archivés',                  garde: (t) => !!t.archive },
];

const VIDES = {
  'tous':     ['Aucun ticket pour le moment.', "Le bouton « Signaler une anomalie » ouvre le formulaire."],
  'ouverts':  ['Aucun ticket ouvert.', 'Tout est traité de notre côté.'],
  'a-moi':    ['Rien ne vous attend.', "Nous vous prévenons par e-mail dès qu'une réponse est nécessaire."],
  'resolus':  ['Aucun ticket résolu pour le moment.', ''],
  'archives': ['Aucun ticket archivé.', ''],
};

/* --- Le tri : ce qui attend le client d'abord --------------------------- */

const ordreAttente = (t) => (ATTEND_CLIENT.includes(t.statut) ? 0 : 1);
const ordreUrgence = (t) => (URGENCES[t.urgence] ? URGENCES[t.urgence].rang : 9);

const trier = (liste) => liste.slice().sort((a, b) =>
  ordreAttente(a) - ordreAttente(b)
  || ordreUrgence(a) - ordreUrgence(b)
  || enMillis(b.maj) - enMillis(a.maj));

/* ========================================================================
   Rendu : les tuiles et les compteurs
   ===================================================================== */

const majChiffres = () => {
  const tickets = etat.tickets || [];
  const documents = etat.documents || [];

  const ouverts  = tickets.filter((t) => !t.archive && OUVERTS.includes(t.statut)).length;
  const attente  = tickets.filter((t) => !t.archive && ATTEND_CLIENT.includes(t.statut)).length;
  const resolus  = tickets.filter((t) => !t.archive && TERMINES.includes(t.statut)).length;
  const aRegler  = documents.filter((d) => !d.archive && d.type === 'facture'
                                        && FACTURES_DUES.includes(d.statut)).length;
  const aDecider = documents.filter((d) => !d.archive && d.type === 'devis'
                                        && d.statut === 'envoye').length;

  $('#tuile-ouverts').textContent  = ouverts;
  $('#tuile-attente').textContent  = attente;
  $('#tuile-resolus').textContent  = resolus;
  $('#tuile-factures').textContent = aRegler;
  $('#tuile-attente').closest('.tuile').classList.toggle('tuile--alerte', attente > 0);
  $('#tuile-factures').closest('.tuile').classList.toggle('tuile--alerte', aRegler > 0);

  const aTraiter = aDecider + aRegler;
  $('#compte-tickets').textContent = ouverts ? String(ouverts) : '';
  $('#compte-documents').textContent = aTraiter ? String(aTraiter) : '';
  $('#nav [data-vue="tickets"]').setAttribute('aria-label',
    `Tickets, ${ouverts} ouvert${ouverts > 1 ? 's' : ''}`);
  $('#nav [data-vue="documents"]').setAttribute('aria-label',
    `Devis et factures, ${aTraiter} à traiter`);
};

/* ========================================================================
   Rendu : la liste des tickets
   ===================================================================== */

const dessinerFiltres = () => {
  const tickets = etat.tickets || [];
  $('#filtres').innerHTML = FILTRES.map((f) => {
    const n = tickets.filter(f.garde).length;
    const actif = f.cle === etat.filtre;
    return `<button type="button" class="filtre${actif ? ' actif' : ''}" data-filtre="${f.cle}"
                    aria-pressed="${actif}">${echapper(f.libelle)}<span class="compte">${n}</span></button>`;
  }).join('');
};

const ligneTicket = (t) => {
  const numero = t.numero ? echapper(t.numero) : 'Numéro en attente';
  return `
    <a class="ticket-ligne${nonLu(t) ? ' non-lu' : ''}" href="./ticket.html?t=${encodeURIComponent(t.id)}">
      <div>
        <p class="ticket-numero">${numero}</p>
        <p class="ticket-titre">${echapper(t.titre)}</p>
        <p class="ticket-meta">
          ${pastilleUrgence(t.urgence)}
          ${etiquetteType(t.type)}
          <span>${echapper(nomPlateforme(t.plateforme))}</span>
          <span>Dernier mouvement ${echapper(depuis(t.maj))}</span>
        </p>
      </div>
      <div class="ticket-droite">
        ${pastilleStatut(t.statut)}
        <span class="t-micro t-3">${echapper(dateCourte(t.maj))}</span>
      </div>
    </a>`;
};

const dessinerTickets = () => {
  const zone = $('#liste-tickets');
  if (!etat.tickets) {
    zone.setAttribute('aria-busy', 'true');
    zone.innerHTML = '<p class="t-petit t-3" style="padding:var(--e-5) 0">Chargement de vos tickets...</p>';
    return;
  }
  zone.setAttribute('aria-busy', 'false');
  dessinerFiltres();

  const filtre = FILTRES.find((f) => f.cle === etat.filtre) || FILTRES[0];
  const visibles = trier(etat.tickets.filter(filtre.garde));
  if (!visibles.length) {
    const [titre, texte] = VIDES[filtre.cle] || ['Rien à afficher.', ''];
    zone.innerHTML = rienAAfficher(titre, texte);
    return;
  }
  zone.innerHTML = visibles.map(ligneTicket).join('');
};

/* ========================================================================
   Rendu : les devis et les factures
   ===================================================================== */

const ligneDocument = (d) => {
  const repondable = d.type === 'devis' && d.statut === 'envoye';
  return `
    <div class="document">
      <div>
        <p class="document-libelle">${echapper(d.libelle)}</p>
        <p class="document-meta">
          <span class="t-mono">${echapper(d.numero || 'Numéro en attente')}</span>
          <span>${d.type === 'devis' ? 'Devis' : 'Facture'}</span>
          <span>Émis le ${echapper(dateCourte(d.date))}</span>
          ${d.echeance ? `<span>Échéance le ${echapper(dateCourte(d.echeance))}</span>` : ''}
          ${d.reponse && d.reponse.le ? `<span>Votre réponse le ${echapper(dateCourte(d.reponse.le))}</span>` : ''}
        </p>
      </div>
      <div class="document-droite">
        <p class="document-montant">${echapper(montant(d.montant))} <span class="t-micro t-3">HT</span></p>
        ${pastilleDocument(d.statut)}
        <div class="document-actions">
          ${d.fichier && d.fichier.chemin
            ? `<button class="btn btn-secondaire" type="button" data-telecharger="${echapper(d.id)}">Télécharger</button>`
            : ''}
          ${repondable ? `
            <button class="btn btn-fantome" type="button" data-devis="refuse" data-id="${echapper(d.id)}">Refuser</button>
            <button class="btn btn-principal" type="button" data-devis="accepte" data-id="${echapper(d.id)}">Accepter</button>` : ''}
        </div>
      </div>
    </div>`;
};

const dessinerDocuments = () => {
  const zoneDevis = $('#liste-devis');
  const zoneFactures = $('#liste-factures');
  if (!etat.documents) {
    zoneDevis.innerHTML = '<p class="t-petit t-3" style="padding:var(--e-4) 0">Chargement...</p>';
    zoneFactures.innerHTML = '';
    return;
  }

  const parDate = (a, b) => enMillis(b.date) - enMillis(a.date);
  const devis = etat.documents.filter((d) => d.type === 'devis' && !d.archive).sort(parDate);
  const factures = etat.documents.filter((d) => d.type === 'facture' && !d.archive).sort(parDate);

  zoneDevis.innerHTML = devis.length
    ? devis.map(ligneDocument).join('')
    : rienAAfficher('Aucun devis pour le moment.', 'Les devis que nous déposons apparaissent ici, prêts à être acceptés ou refusés.');

  zoneFactures.innerHTML = factures.length
    ? factures.map(ligneDocument).join('')
    : rienAAfficher('Aucune facture pour le moment.', '');
};

/* ========================================================================
   La réponse à un devis : la seule écriture autorisée sur un document
   ===================================================================== */

const repondreAuDevis = async (identifiant, reponse, bouton) => {
  const d = (etat.documents || []).find((x) => x.id === identifiant);
  if (!d) return;

  const mot = reponse === 'accepte' ? 'Accepter' : 'Refuser';
  const question = reponse === 'accepte'
    ? `Accepter le devis ${d.numero || ''} pour ${montant(d.montant)} hors taxes ? Votre réponse nous est transmise tout de suite.`
    : `Refuser le devis ${d.numero || ''} ? Votre réponse nous est transmise tout de suite.`;
  if (!window.confirm(question.trim())) return;

  const boutons = $$('[data-devis][data-id="' + identifiant + '"]');
  boutons.forEach((b) => { b.disabled = true; });
  bouton.textContent = 'Envoi...';
  try {
    await updateDoc(doc(bdd, 'documents', identifiant), {
      statut: reponse,
      reponse: {
        statut: reponse,
        le: serverTimestamp(),
        par: etat.session.utilisateur.uid,
      },
    });
    avis(reponse === 'accepte' ? 'Devis accepté. Merci.' : 'Devis refusé. Nous revenons vers vous.');
  } catch (e) {
    boutons.forEach((b) => { b.disabled = false; });
    bouton.textContent = mot;
    avis("Votre réponse n'a pas pu être enregistrée. Réessayez dans un instant.", 'erreur');
  }
};

/* ========================================================================
   Le dépôt de fichiers du formulaire
   ===================================================================== */

const dessinerFichiers = () => {
  const zone = $('#liste-fichiers');
  zone.innerHTML = etat.fichiers.map((f, i) => `
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

/* ========================================================================
   La création d'un ticket
   ===================================================================== */

const erreurTicket = (texte) => {
  const zone = $('#erreur-ticket');
  if (!texte) { zone.classList.add('masque'); zone.innerHTML = ''; return; }
  zone.classList.remove('masque');
  zone.innerHTML = `<aside class="encadre encadre--piege" style="margin:0"><div><p class="t-petit">${echapper(texte)}</p></div></aside>`;
};

const nomDuClient = () => {
  const u = etat.session.utilisateur;
  const p = etat.projet || {};
  return (u.displayName || (p.client && p.client.nom) || String(u.email || '').split('@')[0] || 'Client').trim();
};

const creerTicket = async (e) => {
  e.preventDefault();
  if (etat.envoiEnCours) return;
  erreurTicket('');

  const lire = (id) => $(`#${id}`).value.trim();
  const titre = lire('titre');
  const description = lire('description');

  if (!titre) { erreurTicket('Le titre est nécessaire : une phrase suffit.'); $('#titre').focus(); return; }
  if (!description) { erreurTicket('La description est nécessaire pour que nous puissions agir.'); $('#description').focus(); return; }

  const bouton = $('#envoyer-ticket');
  etat.envoiEnCours = true;
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';

  // Le document est écrit exactement comme les règles l'exigent : aucun
  // champ de plus, aucun champ de moins, et rien que le client n'ait le
  // droit de décider. Le numéro est posé ensuite par la fonction.
  const fiche = {
    numero: null,
    projet: etat.projet.id,
    titre,
    description,
    type: lire('type'),
    urgence: lire('urgence'),
    statut: 'nouveau',
    plateforme: $('#plateforme').value,
    version: lire('version'),
    etapes: lire('etapes'),
    attendu: lire('attendu'),
    obtenu: lire('obtenu'),
    assigne: null,
    auteur: {
      uid: etat.session.utilisateur.uid,
      nom: nomDuClient(),
      email: String(etat.session.utilisateur.email || '').toLowerCase(),
      cote: 'client',
    },
    pieces: [],
    archive: false,
    cree: serverTimestamp(),
    maj: serverTimestamp(),
    resolu: null,
    lu: { client: serverTimestamp(), equipe: null },
  };

  try {
    const reference = await addDoc(collection(bdd, 'tickets'), fiche);

    // Les pièces vivent sous l'identifiant du ticket : il faut donc que
    // le document existe avant de les envoyer, puis on range leurs fiches.
    if (etat.fichiers.length) {
      const chemin = `projets/${etat.projet.id}/tickets/${reference.id}`;
      const pieces = [];
      let souci = '';
      for (const fichier of etat.fichiers) {
        try {
          pieces.push(await envoyerPiece(fichier, chemin));
        } catch (e2) {
          souci = e2 && e2.message ? e2.message : `« ${fichier.name} » n'a pas pu être envoyé.`;
        }
      }
      if (pieces.length) await updateDoc(reference, { pieces, maj: serverTimestamp() });
      if (souci) {
        avis(`Ticket créé, mais une pièce manque : ${souci} Vous pourrez la joindre à un message.`, 'erreur');
      }
    }

    $('#forme-ticket').reset();
    etat.fichiers = [];
    dessinerFichiers();
    replierCreation();
    avis('Ticket envoyé. Son numéro apparaît dans quelques secondes.');
  } catch (e3) {
    erreurTicket("L'envoi a échoué. Vérifiez votre connexion, puis réessayez. Rien n'a été enregistré.");
  } finally {
    etat.envoiEnCours = false;
    bouton.disabled = false;
    bouton.textContent = 'Envoyer le ticket';
  }
};

/* ========================================================================
   Le formulaire qui se déplie
   ===================================================================== */

const deplierCreation = () => {
  $('#carte-creation').classList.remove('masque');
  $('#ouvrir-creation').setAttribute('aria-expanded', 'true');
  $('#ouvrir-creation').textContent = 'Fermer le formulaire';
  $('#titre').focus();
};

const replierCreation = () => {
  $('#carte-creation').classList.add('masque');
  $('#ouvrir-creation').setAttribute('aria-expanded', 'false');
  $('#ouvrir-creation').textContent = 'Signaler une anomalie';
  erreurTicket('');
};

/* ========================================================================
   Les listes déroulantes du formulaire
   ===================================================================== */

const remplirSelecteurs = () => {
  const options = (entrees) => entrees
    .map(([valeur, libelle]) => `<option value="${echapper(valeur)}">${echapper(libelle)}</option>`)
    .join('');

  $('#type').innerHTML = options(Object.entries(TYPES).map(([c, t]) => [c, t.libelle]));
  $('#urgence').innerHTML = options(Object.entries(URGENCES).map(([c, u]) => [c, u.libelle]));
  $('#urgence').value = 'important';

  // On ne propose que les plateformes du projet, plus « non précisée ».
  const declarees = Array.isArray(etat.projet.plateformes) ? etat.projet.plateformes : [];
  const retenues = declarees.filter((p) => p in PLATEFORMES && p !== '');
  $('#plateforme').innerHTML = options(
    (retenues.length ? retenues : ['ios', 'android', 'web'])
      .map((p) => [p, PLATEFORMES[p]])
      .concat([['', PLATEFORMES['']]]),
  );
};

/* ========================================================================
   Les vues
   ===================================================================== */

const montrerVue = (nom) => {
  $('#vue-tickets').classList.toggle('masque', nom !== 'tickets');
  $('#vue-documents').classList.toggle('masque', nom !== 'documents');
  $$('#nav [data-vue]').forEach((b) => {
    const actif = b.dataset.vue === nom;
    b.classList.toggle('actif', actif);
    if (actif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
};

/* ========================================================================
   Les abonnements en direct
   ===================================================================== */

const couperAbonnements = () => {
  etat.arrets.forEach((arret) => arret());
  etat.arrets = [];
};

const ecouter = () => {
  couperAbonnements();
  etat.tickets = null;
  etat.documents = null;
  dessinerTickets();
  dessinerDocuments();
  majChiffres();

  // Le tri se fait dans le navigateur : aucune exigence d'index composé,
  // et la règle d'affichage reste lisible au même endroit.
  etat.arrets.push(onSnapshot(
    query(collection(bdd, 'tickets'), where('projet', '==', etat.projet.id)),
    (lot) => {
      etat.tickets = lot.docs.map((d) => ({ id: d.id, ...d.data() }));
      dessinerTickets();
      majChiffres();
    },
    () => {
      etat.tickets = [];
      $('#liste-tickets').innerHTML = rienAAfficher(
        'Les tickets ne sont pas accessibles pour le moment.',
        'Rechargez la page. Si cela persiste, prévenez-nous.',
      );
      majChiffres();
    },
  ));

  etat.arrets.push(onSnapshot(
    query(collection(bdd, 'documents'), where('projet', '==', etat.projet.id)),
    (lot) => {
      etat.documents = lot.docs.map((d) => ({ id: d.id, ...d.data() }));
      dessinerDocuments();
      majChiffres();
    },
    () => {
      etat.documents = [];
      $('#liste-devis').innerHTML = rienAAfficher('Les documents ne sont pas accessibles pour le moment.', '');
      $('#liste-factures').innerHTML = '';
      majChiffres();
    },
  ));
};

const choisirProjet = (identifiant) => {
  const trouve = etat.session.projets.find((p) => p.id === identifiant);
  etat.projet = trouve || etat.session.projets[0];
  $('#nom-projet').innerHTML = `${echapper(etat.projet.nom || 'Projet')} <span>· suivi</span>`;
  document.title = `${etat.projet.nom || 'Projet'} · Suivi Capmedia`;
  const url = new URL(location.href);
  url.searchParams.set('p', etat.projet.id);
  history.replaceState(null, '', url);
  remplirSelecteurs();
  ecouter();
};

/* ========================================================================
   Le démarrage
   ===================================================================== */

const demarrer = async () => {
  const s = await exigerSession();
  if (!s) return;                       // la redirection est déjà partie
  etat.session = s;

  if (!s.projets.length) { location.replace('./'); return; }

  $('#courriel-compte').textContent = s.utilisateur.email || '';

  if (s.projets.length > 1) {
    const choix = $('#choix-projet');
    choix.innerHTML = s.projets
      .map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom || p.id)}</option>`).join('');
    choix.addEventListener('change', () => choisirProjet(choix.value));
    $('#bloc-projets').classList.remove('masque');
  }

  const demande = new URLSearchParams(location.search).get('p');
  choisirProjet(demande || s.projets[0].id);
  if (s.projets.length > 1) $('#choix-projet').value = etat.projet.id;

  /* --- Les gestes de l'utilisateur -------------------------------------- */

  $('#deconnexion').addEventListener('click', quitter);

  $('#nav').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-vue]');
    if (bouton) montrerVue(bouton.dataset.vue);
  });

  $('#ouvrir-creation').addEventListener('click', () => {
    if ($('#carte-creation').classList.contains('masque')) deplierCreation();
    else replierCreation();
  });
  $('#annuler-ticket').addEventListener('click', () => {
    replierCreation();
    $('#ouvrir-creation').focus();
  });

  $('#forme-ticket').addEventListener('submit', creerTicket);

  $('#filtres').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-filtre]');
    if (!bouton) return;
    etat.filtre = bouton.dataset.filtre;
    dessinerTickets();
  });

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

  // Le glisser-déposer, en plus du clic : jamais à la place.
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

  $('#vue-documents').addEventListener('click', (e) => {
    const telecharger = e.target.closest('[data-telecharger]');
    if (telecharger) {
      const d = (etat.documents || []).find((x) => x.id === telecharger.dataset.telecharger);
      if (d && d.fichier) ouvrirPiece(d.fichier, telecharger);
      return;
    }
    const devis = e.target.closest('[data-devis]');
    if (devis) repondreAuDevis(devis.dataset.id, devis.dataset.devis, devis);
  });
};

demarrer();
