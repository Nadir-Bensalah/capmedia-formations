/* ==========================================================================
   ESPACE DE SUIVI · la console d'équipe
   Contrat : docs/suivi.md

   Le poste de pilotage : tous les projets, tous les tickets, tous les
   devis et toutes les factures, dans un seul écran dense.

   Deux chemins d'écriture, et jamais autre chose :
   · directement dans Firestore pour ce que les règles autorisent à
     l'équipe depuis le navigateur (statut, urgence, assignation, archive
     d'un ticket, messages et notes internes) ;
   · par la fonction « suiviAdmin » pour tout le reste (projets, invitations,
     dépôt d'un devis ou d'une facture, statut d'une facture), avec la clé
     d'administration saisie une fois et gardée dans ce navigateur.

   Tout texte venant d'un utilisateur passe par echapper ou enParagraphes.
   Sans exception.
   ========================================================================== */

import {
  bdd, exigerSession, quitter, surEmulateur,
  doc, getDoc, getDocs, addDoc, updateDoc, collection, query, orderBy, serverTimestamp,
  STATUTS, URGENCES, PLATEFORMES, ATTEND_EQUIPE, OUVERTS,
  $, $$, echapper, enParagraphes, dateCourte, dateHeure, depuis,
  montant, poids, initiales, pastilleStatut, pastilleUrgence, etiquetteType,
  avis, rienAAfficher, envoyerPiece, lienPiece,
} from './noyau.js';

/* --- Le raccordement à la fonction serveur ------------------------------ */

/* Sur le banc d'essai local, les écritures d'administration doivent partir
   vers l'émulateur, jamais vers la production. */
const URL_SUIVI = surEmulateur
  ? 'http://127.0.0.1:5001/capmedia-1f90d/europe-west1/suiviAdmin'
  : 'https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviAdmin';
const CLE_STOCKAGE = 'suivi:cle-admin';

const DELAI_SANS_MOUVEMENT = 48 * 3600 * 1000;

const STATUTS_DEVIS = {
  'envoye':  'Envoyé',
  'accepte': 'Accepté',
  'refuse':  'Refusé',
  'expire':  'Expiré',
};
const STATUTS_FACTURE = {
  'a-payer':   'À payer',
  'payee':     'Payée',
  'en-retard': 'En retard',
  'annulee':   'Annulée',
};
const VOILE_DOCUMENT = {
  'envoye': 'bleu', 'accepte': 'vert', 'refuse': 'gris', 'expire': 'gris',
  'a-payer': 'jaune', 'payee': 'vert', 'en-retard': 'rouge', 'annulee': 'gris',
};
const IMPAYES = ['a-payer', 'en-retard'];

const ETATS_PROJET = { 'actif': 'Actif', 'pause': 'En pause', 'termine': 'Terminé' };

/* --- L'état de l'écran -------------------------------------------------- */

const etat = {
  moi: null,          // { uid, nom, email, role }
  projets: [],
  tickets: [],
  documents: [],
  membres: [],        // membres de l'équipe connus, pour l'assignation
  cle: '',
  vue: 'vue',
  ticket: null,       // ticket ouvert dans la fiche
  filtres: { projet: '', statut: '', urgence: '', assigne: '', texte: '', archives: false },
  filtresDocuments: { projet: '', type: '', statut: '' },
};

/* --- Les petits outils propres à la console ----------------------------- */

const enMillisecondes = (valeur) => {
  if (!valeur) return 0;
  if (typeof valeur.toDate === 'function') return valeur.toDate().getTime();
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const projetDe = (id) => etat.projets.find((p) => p.id === id) || null;

/** La référence du projet, toujours affichée sur une ligne de ticket. */
const refDe = (id) => {
  const p = projetDe(id);
  return p ? (p.ref || p.nom || id) : id;
};

const nomProjet = (id) => {
  const p = projetDe(id);
  return p ? (p.nom || p.ref || id) : id;
};

const nomMembre = (uid) => {
  if (!uid) return 'Personne';
  if (etat.moi && uid === etat.moi.uid) return `${etat.moi.nom || 'Moi'} (moi)`;
  const m = etat.membres.find((x) => x.uid === uid);
  return m && m.nom ? m.nom : uid;
};

const rangUrgence = (t) => (URGENCES[t.urgence] || { rang: 9 }).rang;

/** Tri de travail : le plus urgent d'abord, puis le plus ancien. */
const trierTickets = (liste) => liste.slice().sort(
  (a, b) => rangUrgence(a) - rangUrgence(b) || enMillisecondes(a.cree) - enMillisecondes(b.cree)
);

const estOuvert = (t) => !t.archive && OUVERTS.includes(t.statut);
const attendEquipe = (t) => !t.archive && ATTEND_EQUIPE.includes(t.statut);
const sansMouvement = (t) => estOuvert(t)
  && enMillisecondes(t.maj || t.cree) > 0
  && (Date.now() - enMillisecondes(t.maj || t.cree)) > DELAI_SANS_MOUVEMENT;

/** Le message d'une erreur, lisible, sans jargon technique inutile. */
const texteErreur = (e) => {
  const brut = String((e && e.message) || e || '').trim();
  if (!brut) return "L'opération a échoué.";
  if (/permission|insufficient/i.test(brut)) return "Les règles ont refusé cette écriture.";
  if (/network|fetch|failed to fetch/i.test(brut)) return "Le serveur n'a pas répondu. Vérifiez la connexion.";
  return brut.slice(0, 300);
};

/**
 * Protège une écriture : bouton désactivé pendant l'envoi, erreur lisible,
 * et surtout jamais de faux succès.
 */
const agir = async (bouton, libelleEnCours, travail) => {
  const avant = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = libelleEnCours;
  try {
    await travail();
    return true;
  } catch (e) {
    avis(texteErreur(e), 'erreur');
    return false;
  } finally {
    bouton.disabled = false;
    bouton.textContent = avant;
  }
};

/* --- La clé d'administration -------------------------------------------- */

const lireCle = () => {
  try { return localStorage.getItem(CLE_STOCKAGE) || ''; } catch (e) { return ''; }
};

const afficherEtatCle = () => {
  const posee = Boolean(etat.cle);
  ['#etat-cle', '#etat-cle-pied'].forEach((sel) => {
    const zone = $(sel);
    if (!zone) return;
    zone.className = `etat-cle ${posee ? 'etat-cle--posee' : 'etat-cle--absente'}`;
    zone.textContent = posee ? 'Clé posée sur cet appareil' : 'Aucune clé sur cet appareil';
  });
  $('#bouton-verrouiller').classList.toggle('masque', !posee);
  $('#bouton-cle').textContent = posee ? 'Changer la clé' : 'Poser la clé';
};

const poserCle = (valeur) => {
  etat.cle = valeur;
  try { localStorage.setItem(CLE_STOCKAGE, valeur); } catch (e) { /* stockage refusé */ }
  afficherEtatCle();
};

const verrouiller = () => {
  etat.cle = '';
  try { localStorage.removeItem(CLE_STOCKAGE); } catch (e) { /* rien */ }
  afficherEtatCle();
  avis('Clé effacée de ce navigateur.');
};

/**
 * Appelle la fonction de suivi. La clé ne part que par ici, jamais ailleurs.
 * Toute réponse qui n'est pas un succès franc lève une erreur : l'interface
 * ne doit jamais annoncer une réussite qu'elle n'a pas constatée.
 */
const appelServeur = async (action, parametres = {}) => {
  if (!etat.cle) {
    ouvrirBoiteCle();
    throw new Error("Cette action demande la clé d'administration.");
  }
  let reponse;
  try {
    reponse = await fetch(URL_SUIVI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cle: etat.cle, action, ...parametres }),
    });
  } catch (e) {
    throw new Error("La fonction de suivi est injoignable.");
  }
  if (reponse.status === 401 || reponse.status === 403) {
    verrouiller();
    throw new Error("Clé refusée. Reposez-la pour réessayer.");
  }
  const brut = await reponse.text();
  if (!reponse.ok) throw new Error(brut || `La fonction a répondu ${reponse.status}.`);
  if (!brut) return {};
  try { return JSON.parse(brut); } catch (e) { return { texte: brut }; }
};

/* --- Le chargement des données ------------------------------------------ */

const listerCollection = async (nom, champTri) => {
  const sortie = [];
  const requete = champTri
    ? query(collection(bdd, nom), orderBy(champTri, 'desc'))
    : collection(bdd, nom);
  (await getDocs(requete)).forEach((d) => sortie.push({ id: d.id, ...d.data() }));
  return sortie;
};

/** Les membres de l'équipe. Les règles n'autorisent chacun qu'à lire sa
    propre fiche, et la fonction de suivi n'expose pas la liste : on se
    contente donc de ce que l'on sait, et on le dit à l'écran. */
const chargerMembres = () => {
  const vus = new Map();
  if (etat.moi) vus.set(etat.moi.uid, { uid: etat.moi.uid, nom: etat.moi.nom || 'Moi' });
  etat.tickets.forEach((t) => {
    if (t.assigne && !vus.has(t.assigne)) vus.set(t.assigne, { uid: t.assigne, nom: '' });
  });
  etat.membres = Array.from(vus.values());
};

let chargementEnCours = false;

const charger = async () => {
  if (chargementEnCours) return;
  chargementEnCours = true;
  const bouton = $('#bouton-recharger');
  bouton.disabled = true;
  try {
    const [tickets, documents] = await Promise.all([
      listerCollection('tickets', 'cree'),
      listerCollection('documents', 'date'),
    ]);
    etat.tickets = tickets;
    etat.documents = documents;
    chargerMembres();
    rafraichirCompteurs();
    rendreVueCourante();
  } catch (e) {
    avis(`Chargement impossible. ${texteErreur(e)}`, 'erreur');
  } finally {
    bouton.disabled = false;
    chargementEnCours = false;
  }
};

/* --- La navigation ------------------------------------------------------ */

const VUES = ['vue', 'tickets', 'projets', 'documents', 'archives', 'fiche'];

const rendreVueCourante = () => {
  if (etat.vue === 'vue') rendreTableauDeBord();
  else if (etat.vue === 'tickets') rendreTickets();
  else if (etat.vue === 'projets') rendreProjets();
  else if (etat.vue === 'documents') rendreDocuments();
  else if (etat.vue === 'archives') rendreArchives();
  else if (etat.vue === 'fiche') rendreFiche();
};

const allerA = (nom) => {
  if (!VUES.includes(nom)) return;
  etat.vue = nom;
  VUES.forEach((v) => {
    const section = $(`#ecran-${v}`);
    if (section) section.classList.toggle('masque', v !== nom);
  });
  $$('.nav-suivi [data-vue]').forEach((b) => {
    const actif = b.dataset.vue === nom;
    b.classList.toggle('actif', actif);
    if (actif) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#lateral').classList.remove('pied-ouvert');
  $('#bouton-menu').setAttribute('aria-expanded', 'false');
  rendreVueCourante();
  window.scrollTo({ top: 0 });
};

/** Les pastilles de compteur de la navigation latérale. Un zéro reste un
    zéro : la pastille disparaît, aucun chiffre n'est inventé. */
const rafraichirCompteurs = () => {
  const paires = [
    ['#compte-vue', etat.tickets.filter(attendEquipe).length, true],
    ['#compte-tickets', etat.tickets.filter(estOuvert).length, false],
    ['#compte-projets', etat.projets.filter((p) => !p.archive).length, false],
    ['#compte-documents', etat.documents.filter((d) => !d.archive && d.type === 'facture' && IMPAYES.includes(d.statut)).length, true],
    ['#compte-archives', etat.tickets.filter((t) => t.archive).length + etat.documents.filter((d) => d.archive).length, false],
  ];
  paires.forEach(([sel, valeur, alerte]) => {
    const zone = $(sel);
    if (!zone) return;
    zone.textContent = String(valeur);
    zone.classList.toggle('masque', valeur === 0);
    zone.classList.toggle('compte--alerte', Boolean(alerte) && valeur > 0);
  });
};

/* --- Les briques de liste ----------------------------------------------- */

const nonLu = (t) => {
  const vu = t.lu && t.lu.equipe ? enMillisecondes(t.lu.equipe) : 0;
  return vu === 0 || vu < enMillisecondes(t.maj || t.cree);
};

/** Une ligne de ticket. Elle dit toujours de quel projet elle vient. */
const ligneTicket = (t) => `
  <button type="button" class="ticket-ligne${nonLu(t) ? ' non-lu' : ''}" data-ticket="${echapper(t.id)}">
    <span class="ticket-gauche">
      <span class="ticket-numero">${echapper(t.numero || 'sans numéro')}</span>
      <span class="ticket-projet">${echapper(nomProjet(t.projet))}</span>
      <span class="ticket-titre">${echapper(t.titre || 'Sans titre')}</span>
      <span class="ticket-meta">
        ${etiquetteType(t.type)}
        <span>${echapper(PLATEFORMES[t.plateforme] !== undefined ? PLATEFORMES[t.plateforme] : t.plateforme)}</span>
        <span>${t.assigne ? echapper(nomMembre(t.assigne)) : 'Sans assigné'}</span>
        ${t.archive ? '<span class="pastille pastille--gris">Archivé</span>' : ''}
      </span>
    </span>
    <span class="ticket-droite">
      ${pastilleStatut(t.statut)}
      ${pastilleUrgence(t.urgence)}
      <span class="ticket-quand">${echapper(depuis(t.maj || t.cree))}</span>
    </span>
  </button>`;

const listeTickets = (liste, titreVide, texteVide) => liste.length
  ? `<div class="liste-tickets">${liste.map(ligneTicket).join('')}</div>`
  : rienAAfficher(titreVide, texteVide);

/** Rend les lignes cliquables vers la fiche. */
const brancherLignes = (racine) => {
  $$('[data-ticket]', racine).forEach((b) => b.addEventListener('click', () => ouvrirTicket(b.dataset.ticket)));
};

/* --- Vue d'ensemble ------------------------------------------------------ */

/* Le ton d'une tuile : 'neutre' pour un simple décompte, 'attente' pour ce
   qui traîne, 'alerte' pour ce qui coûte ou qui bloque. Tout colorer revient
   à ne rien signaler. */
const tuile = (valeur, libelle, ton = 'neutre') => {
  // Une tuile ne prend sa couleur que si elle compte vraiment quelque chose.
  // Un montant arrive en texte déjà mis en forme : on le prend au mot.
  const compte = typeof valeur === 'number' ? valeur > 0 : Boolean(valeur);
  const vif = ton !== 'neutre' && compte ? ` tuile--${ton}` : '';
  return `
  <div class="tuile${vif}">
    <p class="tuile-valeur">${echapper(valeur)}</p>
    <p class="tuile-libelle">${echapper(libelle)}</p>
  </div>`;
};

const rendreTableauDeBord = () => {
  const zone = $('#ecran-vue');
  const vivants = etat.tickets.filter((t) => !t.archive);
  const ouverts = vivants.filter((t) => OUVERTS.includes(t.statut));
  const aNous = vivants.filter((t) => ATTEND_EQUIPE.includes(t.statut));
  const graves = ouverts.filter((t) => t.urgence === 'bloquant' || t.urgence === 'critique');
  const orphelins = ouverts.filter((t) => !t.assigne);
  const dormants = vivants.filter(sansMouvement);
  const facturesDues = etat.documents.filter(
    (d) => !d.archive && d.type === 'facture' && IMPAYES.includes(d.statut)
  );
  const totalDu = facturesDues.reduce((somme, d) => somme + (typeof d.montant === 'number' ? d.montant : 0), 0);

  const aTraiter = trierTickets(aNous.concat(dormants.filter((t) => !ATTEND_EQUIPE.includes(t.statut))));

  zone.innerHTML = `
    <div class="tete-ecran">
      <div>
        <h1 class="t-h2">Vue d'ensemble</h1>
        <p class="t-petit t-2">${echapper(etat.projets.length)} projet(s) suivi(s) · ${echapper(etat.tickets.length)} ticket(s) au total</p>
      </div>
    </div>

    <div class="tuiles tuiles--trois" style="margin-top:var(--e-5)">
      ${tuile(ouverts.length, 'Tickets ouverts, tous projets')}
      ${tuile(aNous.length, "En attente de l'équipe", 'attente')}
      ${tuile(graves.length, 'Bloquants et critiques ouverts', 'alerte')}
      ${tuile(orphelins.length, 'Ouverts sans assigné', 'attente')}
      ${tuile(dormants.length, 'Ouverts immobiles depuis plus de 48 h', 'alerte')}
      ${tuile(facturesDues.length, `Factures impayées${totalDu ? ` · ${montant(totalDu)}` : ''}`, 'attente')}
    </div>

    <section class="section-suivi">
      <div class="tete-ecran">
        <h2 class="t-h3">À traiter maintenant</h2>
        <p class="t-micro t-3">Les plus urgents d'abord, puis les plus anciens.</p>
      </div>
      ${listeTickets(aTraiter, 'Rien ne vous attend.', "Aucun ticket nouveau, en cours ou immobile depuis plus de 48 heures.")}
    </section>

    <section class="section-suivi">
      <div class="tete-ecran">
        <h2 class="t-h3">Par projet</h2>
      </div>
      <div class="cadre-defile">
        <table>
          <thead>
            <tr>
              <th scope="col">Projet</th>
              <th scope="col" class="nb">Ouverts</th>
              <th scope="col" class="nb">Pour nous</th>
              <th scope="col" class="nb">Graves</th>
              <th scope="col" class="nb">Impayé</th>
              <th scope="col">État</th>
            </tr>
          </thead>
          <tbody>
            ${etat.projets.length ? etat.projets.map((p) => {
              const siens = etat.tickets.filter((t) => t.projet === p.id && !t.archive);
              const sesOuverts = siens.filter((t) => OUVERTS.includes(t.statut));
              const du = etat.documents
                .filter((d) => d.projet === p.id && !d.archive && d.type === 'facture' && IMPAYES.includes(d.statut))
                .reduce((s, d) => s + (typeof d.montant === 'number' ? d.montant : 0), 0);
              return `
                <tr>
                  <td>
                    <span class="etiquette-mono">${echapper(p.ref || '')}</span>
                    <span class="t-fort">${echapper(p.nom || p.id)}</span>
                  </td>
                  <td class="nb">${sesOuverts.length}</td>
                  <td class="nb">${siens.filter((t) => ATTEND_EQUIPE.includes(t.statut)).length}</td>
                  <td class="nb">${sesOuverts.filter((t) => t.urgence === 'bloquant' || t.urgence === 'critique').length}</td>
                  <td class="nb">${du ? echapper(montant(du)) : '0'}</td>
                  <td><span class="pastille pastille--${p.statut === 'actif' ? 'vert' : 'gris'}">${echapper(ETATS_PROJET[p.statut] || p.statut || 'inconnu')}</span></td>
                </tr>`;
            }).join('') : '<tr><td colspan="6" class="t-2">Aucun projet accessible.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;

  brancherLignes(zone);
};

/* --- Tickets ------------------------------------------------------------- */

const optionsSelect = (entrees, valeurChoisie) => entrees
  .map(([valeur, libelle]) => `<option value="${echapper(valeur)}"${valeur === valeurChoisie ? ' selected' : ''}>${echapper(libelle)}</option>`)
  .join('');

const ticketsFiltres = () => {
  const f = etat.filtres;
  const recherche = f.texte.trim().toLowerCase();
  return trierTickets(etat.tickets.filter((t) => {
    if (!f.archives && t.archive) return false;
    if (f.projet && t.projet !== f.projet) return false;
    if (f.statut && t.statut !== f.statut) return false;
    if (f.urgence && t.urgence !== f.urgence) return false;
    if (f.assigne === 'aucun' && t.assigne) return false;
    if (f.assigne && f.assigne !== 'aucun' && t.assigne !== f.assigne) return false;
    if (recherche) {
      const foin = `${t.numero || ''} ${t.titre || ''}`.toLowerCase();
      if (!foin.includes(recherche)) return false;
    }
    return true;
  }));
};

const barreFiltres = () => {
  const f = etat.filtres;
  return `
    <div class="filtres-forme">
      <label class="filtre-champ">
        <span class="etiquette-champ">Projet</span>
        <select class="champ" id="f-projet">
          ${optionsSelect([['', 'Tous les projets']].concat(etat.projets.map((p) => [p.id, p.nom || p.id])), f.projet)}
        </select>
      </label>
      <label class="filtre-champ">
        <span class="etiquette-champ">Statut</span>
        <select class="champ" id="f-statut">
          ${optionsSelect([['', 'Tous les statuts']].concat(Object.keys(STATUTS).map((s) => [s, STATUTS[s].libelle])), f.statut)}
        </select>
      </label>
      <label class="filtre-champ">
        <span class="etiquette-champ">Urgence</span>
        <select class="champ" id="f-urgence">
          ${optionsSelect([['', 'Toutes les urgences']].concat(Object.keys(URGENCES).map((u) => [u, URGENCES[u].libelle])), f.urgence)}
        </select>
      </label>
      <label class="filtre-champ">
        <span class="etiquette-champ">Assigné</span>
        <select class="champ" id="f-assigne">
          ${optionsSelect([['', 'Tout le monde'], ['aucun', 'Sans assigné']]
            .concat(etat.membres.map((m) => [m.uid, nomMembre(m.uid)])), f.assigne)}
        </select>
      </label>
      <label class="filtre-champ filtre-champ--large">
        <span class="etiquette-champ">Recherche</span>
        <input class="champ" type="search" id="f-texte" value="${echapper(f.texte)}"
               placeholder="Numéro ou titre" autocomplete="off">
      </label>
    </div>
    <div class="rang" style="margin-top:var(--e-3)">
      <button class="filtre${f.archives ? ' actif' : ''}" type="button" id="f-archives"
              aria-pressed="${f.archives ? 'true' : 'false'}">
        ${f.archives ? 'Archivés affichés' : 'Montrer les archivés'}
      </button>
      <button class="filtre" type="button" id="f-vider">Vider les filtres</button>
    </div>`;
};

const rendreTickets = () => {
  const zone = $('#ecran-tickets');
  const liste = ticketsFiltres();
  zone.innerHTML = `
    <div class="tete-ecran">
      <div>
        <h1 class="t-h2">Tickets</h1>
        <p class="t-petit t-2" aria-live="polite">${echapper(liste.length)} ticket(s) affiché(s) sur ${echapper(etat.tickets.length)}</p>
      </div>
    </div>
    ${barreFiltres()}
    <div style="margin-top:var(--e-4)">
      ${listeTickets(liste, 'Aucun ticket ne correspond.', 'Changez un filtre, ou videz-les tous.')}
    </div>`;

  const relire = () => {
    etat.filtres.projet = $('#f-projet').value;
    etat.filtres.statut = $('#f-statut').value;
    etat.filtres.urgence = $('#f-urgence').value;
    etat.filtres.assigne = $('#f-assigne').value;
    rendreTickets();
  };
  ['#f-projet', '#f-statut', '#f-urgence', '#f-assigne'].forEach((sel) => {
    $(sel).addEventListener('change', relire);
  });

  const champTexte = $('#f-texte');
  let minuteur = null;
  champTexte.addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      etat.filtres.texte = champTexte.value;
      rendreTickets();
      const remis = $('#f-texte');
      remis.focus();
      remis.setSelectionRange(remis.value.length, remis.value.length);
    }, 220);
  });

  $('#f-archives').addEventListener('click', () => {
    etat.filtres.archives = !etat.filtres.archives;
    rendreTickets();
  });
  $('#f-vider').addEventListener('click', () => {
    etat.filtres = { projet: '', statut: '', urgence: '', assigne: '', texte: '', archives: false };
    rendreTickets();
  });

  brancherLignes(zone);
};

/* --- La fiche d'un ticket ------------------------------------------------ */

let vueAvantFiche = 'tickets';

const ouvrirTicket = async (id) => {
  vueAvantFiche = etat.vue === 'fiche' ? vueAvantFiche : etat.vue;
  const enListe = etat.tickets.find((t) => t.id === id);
  etat.ticket = { id, ...(enListe || {}), messages: [], evenements: [], chargement: true };
  allerA('fiche');

  try {
    const [fiche, messages, evenements] = await Promise.all([
      getDoc(doc(bdd, 'tickets', id)),
      getDocs(query(collection(bdd, 'tickets', id, 'messages'), orderBy('date'))),
      getDocs(query(collection(bdd, 'tickets', id, 'evenements'), orderBy('date'))),
    ]);
    if (!fiche.exists()) throw new Error("Ce ticket n'existe plus.");
    const listeMessages = [];
    messages.forEach((m) => listeMessages.push({ id: m.id, ...m.data() }));
    const listeEvenements = [];
    evenements.forEach((e) => listeEvenements.push({ id: e.id, ...e.data() }));

    etat.ticket = {
      id, ...fiche.data(),
      messages: listeMessages, evenements: listeEvenements, chargement: false,
    };
    remplacerEnListe(etat.ticket);
    rendreFiche();
    marquerLu(id);
  } catch (e) {
    etat.ticket = { ...(etat.ticket || {}), chargement: false, erreur: texteErreur(e) };
    rendreFiche();
  }
};

/** Garde la liste en mémoire cohérente avec la fiche, sans tout recharger. */
const remplacerEnListe = (t) => {
  const copie = { ...t };
  delete copie.messages;
  delete copie.evenements;
  delete copie.chargement;
  delete copie.erreur;
  const i = etat.tickets.findIndex((x) => x.id === t.id);
  if (i >= 0) etat.tickets[i] = { ...etat.tickets[i], ...copie };
  rafraichirCompteurs();
};

/** La lecture côté équipe : les règles autorisent le champ « lu » seul. */
const marquerLu = async (id) => {
  const t = etat.ticket;
  if (!t || t.id !== id) return;
  try {
    await updateDoc(doc(bdd, 'tickets', id), {
      lu: { client: (t.lu && t.lu.client) || null, equipe: serverTimestamp() },
    });
  } catch (e) { /* sans conséquence pour le travail en cours */ }
};

const champFiche = (libelle, valeurHtml) => `
  <div class="fiche-champ">
    <span class="etiquette-champ">${echapper(libelle)}</span>
    <p>${valeurHtml}</p>
  </div>`;

const blocTexte = (titre, texte) => texte
  ? `<section class="section-suivi">
       <h3 class="titre-bloc">${echapper(titre)}</h3>
       <div class="texte-champ">${enParagraphes(texte)}</div>
     </section>`
  : '';

const listePieces = (pieces, prefixe) => (Array.isArray(pieces) && pieces.length)
  ? `<div class="pieces">${pieces.map((p, i) => `
      <button type="button" class="piece" data-piece="${echapper(prefixe)}:${i}">
        <span>${echapper(p.nom || 'pièce')}</span><b>${echapper(poids(p.taille))}</b>
      </button>`).join('')}</div>`
  : '';

const unMessage = (m) => `
  <article class="message message--${m.de && m.de.cote === 'equipe' ? 'equipe' : 'client'}${m.interne ? ' message--interne' : ''}">
    <span class="jeton" aria-hidden="true">${echapper(initiales(m.de && m.de.nom))}</span>
    <div>
      <div class="message-tete">
        <span class="message-auteur">${echapper((m.de && m.de.nom) || 'Inconnu')}</span>
        <span class="message-date">${echapper(dateHeure(m.date))}</span>
        ${m.interne ? '<span class="marque-interne">Note interne, invisible au client</span>' : ''}
      </div>
      <div class="message-corps">${enParagraphes(m.texte)}</div>
      ${listePieces(m.pieces, `message-${m.id}`)}
    </div>
  </article>`;

const LIBELLE_EVENEMENT = {
  creation: 'Création', statut: 'Statut', urgence: 'Urgence',
  assignation: 'Assignation', archive: 'Archive', piece: 'Pièce jointe',
};

const unEvenement = (ev) => {
  const libelle = LIBELLE_EVENEMENT[ev.type] || ev.type || 'Événement';
  const mouvement = (ev.avant || ev.apres)
    ? ` : ${echapper(ev.avant || 'vide')} vers ${echapper(ev.apres || 'vide')}`
    : '';
  const par = ev.par && ev.par.nom ? ` par ${echapper(ev.par.nom)}` : '';
  return `<li><span class="t-fort">${echapper(libelle)}</span>${mouvement}${par}
            <time>${echapper(dateHeure(ev.date))}</time></li>`;
};

const rendreFiche = () => {
  const zone = $('#ecran-fiche');
  const t = etat.ticket;
  if (!t) { zone.innerHTML = rienAAfficher('Aucun ticket ouvert.'); return; }

  if (t.erreur) {
    zone.innerHTML = `
      <button class="btn btn-fantome" type="button" id="fiche-retour">Retour à la liste</button>
      <aside class="encadre encadre--piege" style="margin-top:var(--e-4)">
        <div><p class="t-petit">${echapper(t.erreur)}</p></div>
      </aside>`;
    $('#fiche-retour').addEventListener('click', () => allerA(vueAvantFiche));
    return;
  }

  const optionsMembres = [['', 'Personne']].concat(etat.membres.map((m) => [m.uid, nomMembre(m.uid)]));

  zone.innerHTML = `
    <button class="btn btn-fantome" type="button" id="fiche-retour">Retour à la liste</button>

    <div class="fiche-tete" style="margin-top:var(--e-4)">
      <div style="min-width:0">
        <p class="etiquette-mono">${echapper(t.numero || 'sans numéro')} · ${echapper(refDe(t.projet))}</p>
        <h1 class="t-h2" style="margin-top:var(--e-1)">${echapper(t.titre || 'Sans titre')}</h1>
        <div class="ticket-meta" style="margin-top:var(--e-2)">
          ${pastilleStatut(t.statut)}
          ${pastilleUrgence(t.urgence)}
          ${etiquetteType(t.type)}
          ${t.archive ? '<span class="pastille pastille--gris">Archivé</span>' : ''}
          <span>ouvert ${echapper(depuis(t.cree))}</span>
        </div>
      </div>
    </div>

    <section class="section-suivi barre-actions">
      <div class="filtres-forme">
        <label class="filtre-champ">
          <span class="etiquette-champ">Statut</span>
          <select class="champ" id="a-statut">
            ${optionsSelect(Object.keys(STATUTS).map((s) => [s, STATUTS[s].libelle]), t.statut)}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Urgence</span>
          <select class="champ" id="a-urgence">
            ${optionsSelect(Object.keys(URGENCES).map((u) => [u, URGENCES[u].libelle]), t.urgence)}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Assigné</span>
          <select class="champ" id="a-assigne">
            ${optionsSelect(optionsMembres, t.assigne || '')}
          </select>
        </label>
        <div class="filtre-champ">
          <span class="etiquette-champ">Archive</span>
          <button class="btn btn-secondaire btn-bloc" type="button" id="a-archive">
            ${t.archive ? 'Sortir des archives' : 'Archiver'}
          </button>
        </div>
      </div>
      <p class="t-micro t-3" style="margin-top:var(--e-2)">
        Les règles n'autorisent chacun qu'à lire sa propre fiche d'équipe : seuls votre compte
        et les personnes déjà assignées sur un ticket sont proposés à l'assignation.</p>
    </section>

    <section class="section-suivi">
      <div class="fiche-champs">
        ${champFiche('Auteur', `${echapper((t.auteur && t.auteur.nom) || 'Inconnu')}<br><span class="t-3">${echapper((t.auteur && t.auteur.email) || '')}</span>`)}
        ${champFiche('Plateforme et version', `${echapper(PLATEFORMES[t.plateforme] !== undefined ? PLATEFORMES[t.plateforme] : t.plateforme)}${t.version ? ` · ${echapper(t.version)}` : ''}`)}
        ${champFiche('Créé le', echapper(dateHeure(t.cree)))}
        ${champFiche('Dernier mouvement', `${echapper(dateHeure(t.maj))}${t.resolu ? `<br><span class="t-3">résolu le ${echapper(dateHeure(t.resolu))}</span>` : ''}`)}
      </div>
    </section>

    ${blocTexte('Description', t.description)}
    ${blocTexte('Comment reproduire', t.etapes)}
    ${blocTexte('Comportement attendu', t.attendu)}
    ${blocTexte('Comportement obtenu', t.obtenu)}

    ${(Array.isArray(t.pieces) && t.pieces.length) ? `
      <section class="section-suivi">
        <h3 class="titre-bloc">Pièces jointes</h3>
        ${listePieces(t.pieces, 'ticket')}
      </section>` : ''}

    <section class="section-suivi">
      <h3 class="titre-bloc">Discussion</h3>
      ${t.chargement
        ? '<p class="t-petit t-2">Chargement des échanges...</p>'
        : (t.messages.length ? `<div class="fil">${t.messages.map(unMessage).join('')}</div>`
                             : rienAAfficher('Aucun échange pour le moment.'))}

      <div class="repondre">
        <div class="onglets-reponse" role="tablist" aria-label="Type de réponse">
          <button type="button" class="filtre actif" id="onglet-client" role="tab" aria-selected="true">Répondre au client</button>
          <button type="button" class="filtre" id="onglet-interne" role="tab" aria-selected="false">Note interne</button>
        </div>
        <p class="t-micro t-3" id="reponse-aide" style="margin-top:var(--e-2)">
          Ce texte part au client, et déclenche l'e-mail de nouveau message.
        </p>
        <label class="etiquette-champ" for="a-texte" style="margin-top:var(--e-3);display:block">Message</label>
        <textarea class="zone" id="a-texte" maxlength="6000" placeholder="Votre réponse..."></textarea>
        <label class="depot" for="a-fichiers" style="margin-top:var(--e-3)">
          Joindre des images ou des PDF, 10 Mo au maximum par fichier
          <input type="file" id="a-fichiers" multiple accept="image/*,application/pdf">
        </label>
        <p class="t-micro t-3 masque" id="a-choisis"></p>
        <button class="btn btn-principal" type="button" id="a-envoyer" style="margin-top:var(--e-4)">Envoyer au client</button>
      </div>
    </section>

    <section class="section-suivi">
      <h3 class="titre-bloc">Historique</h3>
      ${t.chargement
        ? '<p class="t-petit t-2">Chargement de l\'historique...</p>'
        : (t.evenements.length
            ? `<ul class="historique">${t.evenements.map(unEvenement).join('')}</ul>`
            : rienAAfficher("Aucun événement enregistré.", "Le journal d'audit est écrit par le serveur."))}
    </section>`;

  brancherFiche(zone);
};

/* --- Les actions de la fiche -------------------------------------------- */

/** Met le ticket à jour, avec « maj » à chaque fois, et « resolu » quand
    le statut passe à résolu. Les règles n'acceptent rien d'autre. */
const majTicket = async (champs) => {
  const t = etat.ticket;
  const donnees = { ...champs, maj: serverTimestamp() };
  if (champs.statut === 'resolu' && t.statut !== 'resolu') donnees.resolu = serverTimestamp();
  await updateDoc(doc(bdd, 'tickets', t.id), donnees);
  etat.ticket = { ...t, ...champs, maj: new Date() };
  if (donnees.resolu) etat.ticket.resolu = new Date();
  remplacerEnListe(etat.ticket);
};

const brancherFiche = (zone) => {
  const t = etat.ticket;
  $('#fiche-retour').addEventListener('click', () => allerA(vueAvantFiche));

  const surSelect = (sel, champ, libelle) => {
    const champSelect = $(sel);
    champSelect.addEventListener('change', async () => {
      const valeur = champSelect.value || null;
      const avant = t[champ] || null;
      if (valeur === avant) return;
      champSelect.disabled = true;
      try {
        await majTicket({ [champ]: valeur });
        avis(`${libelle} enregistré.`);
        rendreFiche();
      } catch (e) {
        avis(texteErreur(e), 'erreur');
        champSelect.value = avant || '';
      } finally {
        champSelect.disabled = false;
      }
    });
  };
  surSelect('#a-statut', 'statut', 'Statut');
  surSelect('#a-urgence', 'urgence', 'Urgence');
  surSelect('#a-assigne', 'assigne', 'Assignation');

  $('#a-archive').addEventListener('click', async (ev) => {
    const cible = !t.archive;
    const ok = await agir(ev.currentTarget, 'Enregistrement...', () => majTicket({ archive: cible }));
    if (ok) { avis(cible ? 'Ticket archivé.' : 'Ticket sorti des archives.'); rendreFiche(); }
  });

  /* Répondre au client, ou poser une note interne qui ne partira jamais. */
  let interne = false;
  const basculer = (valeurInterne) => {
    interne = valeurInterne;
    $('#onglet-client').classList.toggle('actif', !interne);
    $('#onglet-client').setAttribute('aria-selected', String(!interne));
    $('#onglet-interne').classList.toggle('actif', interne);
    $('#onglet-interne').setAttribute('aria-selected', String(interne));
    $('#reponse-aide').textContent = interne
      ? "Cette note reste dans l'équipe. Le client ne la voit pas, et aucun e-mail ne part."
      : "Ce texte part au client, et déclenche l'e-mail de nouveau message.";
    $('#a-envoyer').textContent = interne ? 'Enregistrer la note' : 'Envoyer au client';
    $('#a-texte').placeholder = interne ? 'Note pour l\'équipe...' : 'Votre réponse...';
  };
  $('#onglet-client').addEventListener('click', () => basculer(false));
  $('#onglet-interne').addEventListener('click', () => basculer(true));

  const champFichiers = $('#a-fichiers');
  champFichiers.addEventListener('change', () => {
    const noms = Array.from(champFichiers.files).map((f) => f.name);
    const zoneChoisis = $('#a-choisis');
    zoneChoisis.classList.toggle('masque', noms.length === 0);
    zoneChoisis.textContent = noms.length ? `${noms.length} fichier(s) : ${noms.join(', ')}` : '';
  });

  $('#a-envoyer').addEventListener('click', async (ev) => {
    const texte = $('#a-texte').value.trim();
    if (!texte) { avis('Le message est vide.', 'erreur'); $('#a-texte').focus(); return; }
    const fichiers = Array.from(champFichiers.files).slice(0, 10);

    const ok = await agir(ev.currentTarget, 'Envoi...', async () => {
      const pieces = [];
      for (const fichier of fichiers) {
        pieces.push(await envoyerPiece(fichier, `projets/${t.projet}/tickets/${t.id}`));
      }
      await addDoc(collection(bdd, 'tickets', t.id, 'messages'), {
        de: { uid: etat.moi.uid, nom: etat.moi.nom || 'Équipe', cote: 'equipe' },
        texte,
        pieces,
        interne,
        date: serverTimestamp(),
      });
      await updateDoc(doc(bdd, 'tickets', t.id), { maj: serverTimestamp() });
    });

    if (ok) {
      avis(interne ? 'Note interne enregistrée.' : 'Réponse envoyée au client.');
      ouvrirTicket(t.id);
    }
  });

  /* Les pièces jointes : l'adresse de téléchargement est demandée au clic. */
  $$('[data-piece]', zone).forEach((b) => b.addEventListener('click', async (ev) => {
    const [prefixe, indexTexte] = b.dataset.piece.split(':');
    const index = Number(indexTexte);
    let piece = null;
    if (prefixe === 'ticket') piece = (t.pieces || [])[index];
    else {
      const idMessage = prefixe.replace(/^message-/, '');
      const m = (t.messages || []).find((x) => x.id === idMessage);
      piece = m ? (m.pieces || [])[index] : null;
    }
    if (!piece) { avis('Pièce introuvable.', 'erreur'); return; }
    const bouton = ev.currentTarget;
    bouton.disabled = true;
    try {
      const adresse = await lienPiece(piece);
      window.open(adresse, '_blank', 'noopener');
    } catch (erreurPiece) {
      avis(texteErreur(erreurPiece), 'erreur');
    } finally {
      bouton.disabled = false;
    }
  }));
};

/* --- Projets ------------------------------------------------------------- */

const encadreServeur = (actions) => `
  <aside class="encadre encadre--note">
    <div>
      <p class="t-petit t-fort">Ces actions passent par la fonction de suivi, avec la clé d'administration.</p>
      <p class="t-petit">${echapper(actions.join(', '))}. Les règles refusent ces écritures au navigateur, c'est voulu.</p>
      <p class="t-micro t-3">État de la clé sur cet appareil : ${etat.cle ? 'posée' : 'absente'}.</p>
    </div>
  </aside>`;

/* Un dossier de dépôt, le temps d'écrire le fichier : la fiche est créée
   ensuite par la fonction, avec son propre identifiant. */
const dossierDepot = () => (crypto && crypto.randomUUID)
  ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const rendreProjets = () => {
  const zone = $('#ecran-projets');
  const vivants = etat.projets.filter((p) => !p.archive);

  zone.innerHTML = `
    <div class="tete-ecran">
      <div>
        <h1 class="t-h2">Projets</h1>
        <p class="t-petit t-2">${echapper(vivants.length)} projet(s) actif(s) en liste</p>
      </div>
    </div>

    <div style="margin-top:var(--e-4)">
      ${encadreServeur(['créer un projet', 'inviter un client', 'retirer un accès client', "ajouter un membre d'équipe"])}
    </div>

    <section class="section-suivi">
      <p class="indice-defile">Tableau défilable vers la droite : les actions sont dans la dernière colonne.</p>
      <div class="cadre-defile">
        <table class="table-large">
          <thead>
            <tr>
              <th scope="col">Référence</th>
              <th scope="col">Projet</th>
              <th scope="col">Client</th>
              <th scope="col" class="nb">Ouverts</th>
              <th scope="col">État</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${etat.projets.length ? etat.projets.map((p) => {
              const ouverts = etat.tickets.filter((t) => t.projet === p.id && !t.archive && OUVERTS.includes(t.statut)).length;
              const client = p.client || {};
              return `
                <tr>
                  <td><span class="etiquette-mono">${echapper(p.ref || '')}</span></td>
                  <td>
                    <span class="t-fort">${echapper(p.nom || p.id)}</span><br>
                    <span class="t-micro t-3">${echapper((p.plateformes || []).map((x) => PLATEFORMES[x] || x).join(', '))}</span><br>
                    <span class="t-micro t-3">${echapper((p.membres || []).length)} accès client ouvert(s)</span>
                  </td>
                  <td>
                    ${echapper(client.nom || 'Non renseigné')}<br>
                    <span class="t-micro t-3">${echapper(client.email || '')}</span><br>
                    <span class="t-micro t-3">${echapper(client.entreprise || '')}</span>
                  </td>
                  <td class="nb">${ouverts}</td>
                  <td>
                    <span class="pastille pastille--${p.statut === 'actif' ? 'vert' : 'gris'}">${echapper(ETATS_PROJET[p.statut] || p.statut || 'inconnu')}</span>
                  </td>
                  <td>
                    <div class="pile-actions">
                      <button class="btn btn-secondaire" type="button" data-inviter="${echapper(p.id)}">Inviter un client</button>
                      <button class="btn btn-fantome" type="button" data-retirer="${echapper(p.id)}">Retirer un accès</button>
                      <button class="btn btn-fantome" type="button" data-voir-projet="${echapper(p.id)}">Voir ses tickets</button>
                    </div>
                  </td>
                </tr>`;
            }).join('') : '<tr><td colspan="6" class="t-2">Aucun projet accessible.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section-suivi">
      <h2 class="t-h3">Créer un projet</h2>
      <p class="t-micro t-3" style="margin-top:var(--e-1)">La référence sert de préfixe aux numéros de tickets. Majuscules, sans espace.</p>
      <div class="filtres-forme" style="margin-top:var(--e-4)">
        <label class="filtre-champ">
          <span class="etiquette-champ">Référence</span>
          <input class="champ" id="np-ref" placeholder="FORGEME" autocomplete="off" maxlength="24">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Nom du projet</span>
          <input class="champ" id="np-nom" placeholder="ForgeMe" autocomplete="off" maxlength="80">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Nom du client</span>
          <input class="champ" id="np-client" placeholder="Prénom Nom" autocomplete="off" maxlength="80">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">E-mail du client</span>
          <input class="champ" id="np-email" type="email" placeholder="client@exemple.com" autocomplete="off">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Entreprise</span>
          <input class="champ" id="np-entreprise" placeholder="Facultatif" autocomplete="off" maxlength="80">
        </label>
        <div class="filtre-champ">
          <span class="etiquette-champ">Plateformes</span>
          <div class="rang" style="gap:var(--e-3);padding-top:6px">
            <label class="case"><input type="checkbox" value="ios" class="np-plateforme"> iPhone</label>
            <label class="case"><input type="checkbox" value="android" class="np-plateforme"> Android</label>
            <label class="case"><input type="checkbox" value="web" class="np-plateforme"> Web</label>
          </div>
        </div>
      </div>
      <button class="btn btn-principal" type="button" id="np-creer" style="margin-top:var(--e-4)">Créer le projet</button>
    </section>

    <section class="section-suivi">
      <h2 class="t-h3">Ajouter un membre d'équipe</h2>
      <p class="t-micro t-3" style="margin-top:var(--e-1)">
        Une fiche d'équipe ouvre l'accès à tous les projets. Le compte se crée au besoin,
        et la connexion se fait par lien e-mail.
      </p>
      <div class="filtres-forme" style="margin-top:var(--e-4)">
        <label class="filtre-champ">
          <span class="etiquette-champ">Nom</span>
          <input class="champ" id="ne-nom" placeholder="Prénom Nom" autocomplete="off" maxlength="80">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">E-mail</span>
          <input class="champ" id="ne-email" type="email" placeholder="membre@capmedia.app" autocomplete="off">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Rôle</span>
          <select class="champ" id="ne-role">
            ${optionsSelect([['agent', 'Agent'], ['admin', 'Administrateur']], 'agent')}
          </select>
        </label>
      </div>
      <button class="btn btn-secondaire" type="button" id="ne-ajouter" style="margin-top:var(--e-4)">Ajouter au personnel</button>
    </section>`;

  $$('[data-inviter]', zone).forEach((b) => b.addEventListener('click', async (ev) => {
    const id = b.dataset.inviter;
    const p = projetDe(id) || {};
    const email = (window.prompt(`E-mail du client à inviter sur ${p.nom || id}`, (p.client || {}).email || '') || '').trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { avis("Cette adresse a l'air incomplète.", 'erreur'); return; }
    const ok = await agir(ev.currentTarget, 'Invitation...', () => appelServeur('inviterClient', { projet: id, email }));
    if (ok) avis(`Invitation envoyée à ${email}.`);
  }));

  $$('[data-retirer]', zone).forEach((b) => b.addEventListener('click', async (ev) => {
    const id = b.dataset.retirer;
    const p = projetDe(id) || {};
    const email = (window.prompt(`E-mail du client à retirer de ${p.nom || id}`, '') || '').trim().toLowerCase();
    if (!email) return;
    const ok = await agir(ev.currentTarget, 'Retrait...', () => appelServeur('retirerClient', { projet: id, email }));
    if (ok) { avis(`${email} n'a plus accès à ce projet.`); await rechargerProjets(); rendreProjets(); }
  }));

  $$('[data-voir-projet]', zone).forEach((b) => b.addEventListener('click', () => {
    etat.filtres = { projet: b.dataset.voirProjet, statut: '', urgence: '', assigne: '', texte: '', archives: false };
    allerA('tickets');
  }));

  $('#ne-ajouter').addEventListener('click', async (ev) => {
    const nom = $('#ne-nom').value.trim();
    const email = $('#ne-email').value.trim().toLowerCase();
    const role = $('#ne-role').value;
    if (!nom) { avis('Le nom du membre manque.', 'erreur'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { avis("L'adresse est incomplète.", 'erreur'); return; }
    const ok = await agir(ev.currentTarget, 'Ajout...', () => appelServeur('ajouterEquipe', { nom, email, role }));
    if (ok) {
      avis(`${nom} fait partie de l'équipe.`);
      $('#ne-nom').value = '';
      $('#ne-email').value = '';
    }
  });

  $('#np-creer').addEventListener('click', async (ev) => {
    const ref = $('#np-ref').value.trim().toUpperCase();
    const nom = $('#np-nom').value.trim();
    const clientNom = $('#np-client').value.trim();
    const clientEmail = $('#np-email').value.trim().toLowerCase();
    const entreprise = $('#np-entreprise').value.trim();
    const plateformes = $$('.np-plateforme').filter((c) => c.checked).map((c) => c.value);

    if (!/^[A-Z][A-Z0-9]{1,15}$/.test(ref)) {
      avis('Référence attendue : 2 à 16 lettres ou chiffres, sans espace, commençant par une lettre.', 'erreur');
      return;
    }
    if (!nom) { avis('Le nom du projet manque.', 'erreur'); return; }
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clientEmail)) { avis("L'adresse du client est incomplète.", 'erreur'); return; }

    const ok = await agir(ev.currentTarget, 'Création...', () => appelServeur('creerProjet', {
      ref, nom, plateformes,
      client: { nom: clientNom, email: clientEmail, entreprise },
    }));
    if (ok) {
      avis('Projet créé. Rechargement des données.');
      await rechargerProjets();
      await charger();
      allerA('projets');
    }
  });
};

/* --- Devis et factures --------------------------------------------------- */

const libelleStatutDocument = (d) => (d.type === 'devis'
  ? (STATUTS_DEVIS[d.statut] || d.statut || 'inconnu')
  : (STATUTS_FACTURE[d.statut] || d.statut || 'inconnu'));

const documentsFiltres = (archives) => {
  const f = etat.filtresDocuments;
  return etat.documents
    .filter((d) => Boolean(d.archive) === archives)
    .filter((d) => (!f.projet || d.projet === f.projet)
                && (!f.type || d.type === f.type)
                && (!f.statut || d.statut === f.statut))
    .sort((a, b) => enMillisecondes(b.date) - enMillisecondes(a.date));
};

const unDocument = (d, options = {}) => {
  const reponse = d.reponse && d.reponse.statut
    ? `<span>réponse du client : ${echapper(STATUTS_DEVIS[d.reponse.statut] || d.reponse.statut)} ${echapper(dateCourte(d.reponse.le))}</span>`
    : '';
  return `
    <div class="document">
      <div style="min-width:0">
        <p class="document-libelle">${echapper(d.libelle || 'Sans libellé')}</p>
        <div class="document-meta">
          <span class="etiquette-mono">${echapper(d.numero || 'sans numéro')}</span>
          <span>${echapper(d.type === 'devis' ? 'Devis' : 'Facture')}</span>
          <span>${echapper(nomProjet(d.projet))}</span>
          <span>${echapper(dateCourte(d.date))}</span>
          ${d.echeance ? `<span>échéance ${echapper(dateCourte(d.echeance))}</span>` : ''}
          ${reponse}
        </div>
      </div>
      <div class="document-actions">
        <span class="document-montant">${echapper(montant(d.montant))}</span>
        <span class="pastille pastille--${VOILE_DOCUMENT[d.statut] || 'gris'}">${echapper(libelleStatutDocument(d))}</span>
        ${d.fichier && d.fichier.chemin
          ? `<button class="btn btn-fantome" type="button" data-fichier="${echapper(d.id)}">Ouvrir</button>`
          : '<span class="t-micro t-3">aucun fichier</span>'}
        ${(options.statutFacture && d.type === 'facture') ? `
          <select class="champ champ-compact" data-statut-facture="${echapper(d.id)}" aria-label="Statut de la facture ${echapper(d.numero || '')}">
            ${optionsSelect(Object.keys(STATUTS_FACTURE).map((k) => [k, STATUTS_FACTURE[k]]), d.statut)}
          </select>` : ''}
      </div>
    </div>`;
};

const brancherDocuments = (zone) => {
  $$('[data-fichier]', zone).forEach((b) => b.addEventListener('click', async () => {
    const d = etat.documents.find((x) => x.id === b.dataset.fichier);
    if (!d || !d.fichier || !d.fichier.chemin) { avis('Fichier introuvable.', 'erreur'); return; }
    b.disabled = true;
    try {
      const adresse = await lienPiece(d.fichier);
      window.open(adresse, '_blank', 'noopener');
    } catch (e) {
      avis(texteErreur(e), 'erreur');
    } finally {
      b.disabled = false;
    }
  }));

  $$('[data-statut-facture]', zone).forEach((s) => s.addEventListener('change', async () => {
    const id = s.dataset.statutFacture;
    const d = etat.documents.find((x) => x.id === id);
    const avant = d ? d.statut : '';
    s.disabled = true;
    try {
      await appelServeur('statutFacture', { id, statut: s.value });
      if (d) d.statut = s.value;
      avis('Statut de la facture enregistré.');
      rafraichirCompteurs();
      rendreVueCourante();
    } catch (e) {
      avis(texteErreur(e), 'erreur');
      s.value = avant;
    } finally {
      s.disabled = false;
    }
  }));

};

const rendreDocuments = () => {
  const zone = $('#ecran-documents');
  const f = etat.filtresDocuments;
  const liste = documentsFiltres(false);
  const impayes = etat.documents.filter((d) => !d.archive && d.type === 'facture' && IMPAYES.includes(d.statut));
  const totalDu = impayes.reduce((s, d) => s + (typeof d.montant === 'number' ? d.montant : 0), 0);

  const statutsPossibles = f.type === 'devis' ? STATUTS_DEVIS
    : f.type === 'facture' ? STATUTS_FACTURE
    : { ...STATUTS_DEVIS, ...STATUTS_FACTURE };

  zone.innerHTML = `
    <div class="tete-ecran">
      <div>
        <h1 class="t-h2">Devis et factures</h1>
        <p class="t-petit t-2">${echapper(liste.length)} document(s) affiché(s)</p>
      </div>
    </div>

    <div class="tuiles tuiles--trois" style="margin-top:var(--e-5)">
      ${tuile(impayes.length, 'Factures impayées', 'alerte')}
      ${tuile(totalDu ? montant(totalDu) : '0 €', 'Total impayé, hors taxes', totalDu > 0 ? 'alerte' : 'neutre')}
      ${tuile(etat.documents.filter((d) => !d.archive && d.type === 'devis' && d.statut === 'envoye').length, 'Devis en attente de réponse')}
    </div>

    <div style="margin-top:var(--e-5)">
      ${encadreServeur(['déposer un devis ou une facture', "changer le statut d'une facture"])}
    </div>

    <section class="section-suivi">
      <div class="filtres-forme">
        <label class="filtre-champ">
          <span class="etiquette-champ">Projet</span>
          <select class="champ" id="fd-projet">
            ${optionsSelect([['', 'Tous les projets']].concat(etat.projets.map((p) => [p.id, p.nom || p.id])), f.projet)}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Type</span>
          <select class="champ" id="fd-type">
            ${optionsSelect([['', 'Devis et factures'], ['devis', 'Devis'], ['facture', 'Factures']], f.type)}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Statut</span>
          <select class="champ" id="fd-statut">
            ${optionsSelect([['', 'Tous les statuts']].concat(Object.keys(statutsPossibles).map((k) => [k, statutsPossibles[k]])), f.statut)}
          </select>
        </label>
      </div>
      <div style="margin-top:var(--e-4)">
        ${liste.length ? `<div class="documents">${liste.map((d) => unDocument(d, { statutFacture: true })).join('')}</div>`
                       : rienAAfficher('Aucun document.', 'Changez un filtre, ou déposez le premier document plus bas.')}
      </div>
    </section>

    <section class="section-suivi">
      <h2 class="t-h3">Déposer un devis ou une facture</h2>
      <div class="filtres-forme" style="margin-top:var(--e-4)">
        <label class="filtre-champ">
          <span class="etiquette-champ">Projet</span>
          <select class="champ" id="nd-projet">
            ${optionsSelect([['', 'Choisir un projet']].concat(etat.projets.map((p) => [p.id, p.nom || p.id])), '')}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Type</span>
          <select class="champ" id="nd-type">
            ${optionsSelect([['devis', 'Devis'], ['facture', 'Facture']], 'devis')}
          </select>
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Numéro</span>
          <input class="champ" id="nd-numero" placeholder="D-2026-014" autocomplete="off" maxlength="32">
        </label>
        <label class="filtre-champ filtre-champ--large">
          <span class="etiquette-champ">Libellé</span>
          <input class="champ" id="nd-libelle" placeholder="Refonte de l'écran d'accueil" autocomplete="off" maxlength="160">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Montant hors taxes, en euros</span>
          <input class="champ" id="nd-montant" type="number" min="0" step="1" inputmode="decimal" placeholder="1500">
        </label>
        <label class="filtre-champ">
          <span class="etiquette-champ">Échéance</span>
          <input class="champ" id="nd-echeance" type="date">
        </label>
      </div>
      <label class="depot" for="nd-fichier" style="margin-top:var(--e-4)">
        Le fichier du document, PDF ou image, 10 Mo au maximum
        <input type="file" id="nd-fichier" accept="image/*,application/pdf">
      </label>
      <p class="t-micro t-3 masque" id="nd-choisi"></p>
      <button class="btn btn-principal" type="button" id="nd-deposer" style="margin-top:var(--e-4)">Déposer le document</button>
    </section>`;

  ['#fd-projet', '#fd-type', '#fd-statut'].forEach((sel) => $(sel).addEventListener('change', () => {
    etat.filtresDocuments.projet = $('#fd-projet').value;
    const nouveauType = $('#fd-type').value;
    if (nouveauType !== etat.filtresDocuments.type) etat.filtresDocuments.statut = '';
    else etat.filtresDocuments.statut = $('#fd-statut').value;
    etat.filtresDocuments.type = nouveauType;
    rendreDocuments();
  }));

  const champFichier = $('#nd-fichier');
  champFichier.addEventListener('change', () => {
    const f1 = champFichier.files[0];
    const zoneChoisi = $('#nd-choisi');
    zoneChoisi.classList.toggle('masque', !f1);
    zoneChoisi.textContent = f1 ? `${f1.name} · ${poids(f1.size)}` : '';
  });

  $('#nd-deposer').addEventListener('click', async (ev) => {
    const projet = $('#nd-projet').value;
    const type = $('#nd-type').value;
    const numero = $('#nd-numero').value.trim();
    const libelle = $('#nd-libelle').value.trim();
    const valeur = Number($('#nd-montant').value);
    const echeance = $('#nd-echeance').value;
    const fichier = champFichier.files[0];

    if (!projet) { avis('Choisissez un projet.', 'erreur'); return; }
    if (!numero) { avis('Le numéro du document manque.', 'erreur'); return; }
    if (!libelle) { avis('Le libellé manque.', 'erreur'); return; }
    if (!Number.isFinite(valeur) || valeur < 0) { avis('Le montant est incorrect.', 'erreur'); return; }
    if (!fichier) { avis('Le fichier du document manque.', 'erreur'); return; }

    const identifiant = dossierDepot();
    const ok = await agir(ev.currentTarget, 'Dépôt...', async () => {
      const depose = await envoyerPiece(fichier, `projets/${projet}/documents/${identifiant}`);
      await appelServeur('deposerDocument', {
        projet, type, numero, libelle,
        montant: valeur,
        echeance: echeance || null,
        fichier: { chemin: depose.chemin, nom: depose.nom, taille: depose.taille },
      });
    });

    if (ok) {
      avis('Document déposé.');
      await charger();
      allerA('documents');
    }
  });

  brancherDocuments(zone);
};

/* --- Archives ------------------------------------------------------------ */

const rendreArchives = () => {
  const zone = $('#ecran-archives');
  const tickets = trierTickets(etat.tickets.filter((t) => t.archive));
  const documents = documentsFiltres(true);

  zone.innerHTML = `
    <div class="tete-ecran">
      <div>
        <h1 class="t-h2">Archives</h1>
        <p class="t-petit t-2">${echapper(tickets.length)} ticket(s) et ${echapper(documents.length)} document(s) archivé(s)</p>
      </div>
    </div>

    <section class="section-suivi">
      <div class="tete-ecran"><h2 class="t-h3">Tickets archivés</h2></div>
      ${tickets.length ? `<div class="liste-tickets">${tickets.map((t) => `
        <div class="ligne-archive">
          ${ligneTicket(t)}
          <button class="btn btn-fantome" type="button" data-sortir="${echapper(t.id)}">Sortir des archives</button>
        </div>`).join('')}</div>` : rienAAfficher('Aucun ticket archivé.')}
    </section>

    <section class="section-suivi">
      <div class="tete-ecran"><h2 class="t-h3">Documents archivés</h2></div>
      ${documents.length
        ? `<div class="documents">${documents.map((d) => unDocument(d)).join('')}</div>`
        : rienAAfficher('Aucun document archivé.')}
      <p class="t-micro t-3" style="margin-top:var(--e-3)">
        Les documents archivés se consultent et se téléchargent. Les désarchiver n'est pas
        proposé ici : ni les règles ni la fonction de suivi ne l'autorisent aujourd'hui.</p>
    </section>`;

  $$('[data-sortir]', zone).forEach((b) => b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const id = b.dataset.sortir;
    const ok = await agir(ev.currentTarget, 'Enregistrement...', async () => {
      await updateDoc(doc(bdd, 'tickets', id), { archive: false, maj: serverTimestamp() });
      const t = etat.tickets.find((x) => x.id === id);
      if (t) { t.archive = false; t.maj = new Date(); }
    });
    if (ok) { avis('Ticket sorti des archives.'); rafraichirCompteurs(); rendreArchives(); }
  }));

  brancherLignes(zone);
  brancherDocuments(zone);
};

/* --- La boîte de la clé -------------------------------------------------- */

const boiteCle = $('#boite-cle');

const ouvrirBoiteCle = () => {
  $('#champ-cle').value = '';
  if (typeof boiteCle.showModal === 'function') boiteCle.showModal();
  else boiteCle.setAttribute('open', 'open');
  $('#champ-cle').focus();
};

const fermerBoiteCle = () => {
  if (typeof boiteCle.close === 'function' && boiteCle.open) boiteCle.close();
  else boiteCle.removeAttribute('open');
};

/* --- Les projets, rechargés après une création --------------------------- */

const rechargerProjets = async () => {
  try {
    const projets = [];
    (await getDocs(query(collection(bdd, 'projets'), orderBy('nom')))).forEach((d) => projets.push({ id: d.id, ...d.data() }));
    etat.projets = projets;
  } catch (e) {
    avis(`Liste des projets non rechargée. ${texteErreur(e)}`, 'erreur');
  }
};

/* --- Le démarrage -------------------------------------------------------- */

const demarrer = async () => {
  etat.cle = lireCle();

  const s = await exigerSession();
  if (!s) return;   // exigerSession a déjà renvoyé vers la connexion

  if (!s.equipe) {
    $('#attente-chargement').classList.add('masque');
    $('#refus').classList.remove('masque');
    $('#refus-quitter').addEventListener('click', quitter);
    return;
  }

  etat.moi = {
    uid: s.equipe.uid,
    nom: s.equipe.nom || s.utilisateur.email || 'Équipe',
    email: s.equipe.email || s.utilisateur.email || '',
    role: s.equipe.role || 'agent',
  };
  etat.projets = s.projets || [];

  $('#attente-chargement').classList.add('masque');
  $('#appli').classList.remove('masque');
  $('#qui-suis-je').textContent = `${etat.moi.nom} · ${etat.moi.role === 'admin' ? 'administrateur' : 'agent'}`;
  afficherEtatCle();

  $$('.nav-suivi [data-vue]').forEach((b) => b.addEventListener('click', () => allerA(b.dataset.vue)));
  $('#bouton-recharger').addEventListener('click', charger);
  $('#bouton-quitter').addEventListener('click', quitter);
  $('#bouton-cle').addEventListener('click', ouvrirBoiteCle);
  $('#bouton-verrouiller').addEventListener('click', () => { verrouiller(); rendreVueCourante(); });
  $('#bouton-menu').addEventListener('click', () => {
    const ouvert = $('#lateral').classList.toggle('pied-ouvert');
    $('#bouton-menu').setAttribute('aria-expanded', String(ouvert));
  });
  $('#cle-annuler').addEventListener('click', fermerBoiteCle);
  $('#forme-cle').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const valeur = $('#champ-cle').value.trim();
    if (!valeur) { avis('Aucune clé saisie.', 'erreur'); return; }
    poserCle(valeur);
    fermerBoiteCle();
    avis('Clé gardée dans ce navigateur.');
    charger();
  });

  rafraichirCompteurs();
  rendreVueCourante();
  await charger();
};

demarrer();
