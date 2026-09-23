/* ==========================================================================
   Les éditeurs de l'équipe : un formulaire par genre d'objet, dans une
   feuille latérale. Chacun lit, valide, écrit, et dit ce qu'il a fait.
   Le client n'y a jamais accès : les règles refuseraient de toute façon.
   ========================================================================== */

import {
  echapper, dateISO, dateHeureISO, borner, enDate,
  TYPES_COMPOSANT, STATUTS_COMPOSANT, STATUTS_ETAPE, STATUTS_TACHE, PRIORITES, CATEGORIES_LIEN,
  STATUTS_RELEASE, TYPES_CHANGEMENT, TYPES_NOTE, TYPES_VALIDATION, CATEGORIES_FICHIER,
  STATUTS_PROJET, TYPES_PROJET, SANTES, STATUTS, URGENCES, QUALIFICATIONS, PLATEFORMES_CHOIX, contactsProjet, statutProjet,
  MOTIFS_REPORT, nomAffiche, dateCourte,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, STATUTS_CAMPAGNE, PLATEFORMES_TEST, REF_SCENARIO,
  ETATS_PARCOURS, OUTILS_PARCOURS, FAMILLES_REGLE, ETATS_REGLE,
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE,
  STATUTS_MAINTENANCE, RECONDUCTIONS_MAINTENANCE, STATUTS_SEQUENCE, STATUTS_JOURNEE, DUREES_JOURNEE, STATUTS_EVOLUTION,
} from '../noyau.js';
import { icone, modale, confirmer, toast, lireForme, valider, obligatoire, longueurMax, urlValide, emailValide, optionsDe, depot, agir, lisible, choixPlateformes } from '../ui.js';
import { appelServeur } from '../serveur.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';

const $ = (s, r = document) => r.querySelector(s);

/* Un champ de date affiche le format du navigateur, souvent américain. On
   ne peut pas le changer, alors on écrit la date en français juste en
   dessous : c'est elle qu'on relit avant d'enregistrer. */
const champ = (nom, libelle, valeur = '', { type = 'text', aide = '', placeholder = '', facultatif = false, attrs = '' } = {}) => {
  const estDate = type === 'date' || type === 'datetime-local';
  return `
  <div class="groupe">
    <label class="etiquette-champ" for="ed-${nom}">${echapper(libelle)}${facultatif ? ' <span class="facultatif">(facultatif)</span>' : ''}</label>
    <input class="champ" id="ed-${nom}" name="${nom}" type="${type}" value="${echapper(valeur ?? '')}" placeholder="${echapper(placeholder)}"${estDate ? ' lang="fr-FR" data-date-fr' : ''} ${attrs}>
    ${estDate ? `<p class="aide aide--date" data-echo-pour="ed-${nom}">${echapper(valeur ? lisibleDate(valeur) : 'Aucune date')}</p>` : ''}
    ${aide ? `<p class="aide">${echapper(aide)}</p>` : ''}
  </div>`;
};

/* La lecture française d'une valeur de champ date ou date-heure. */
const lisibleDate = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Aucune date';
  return String(v).includes('T')
    ? d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const zone = (nom, libelle, valeur = '', { aide = '', placeholder = '', facultatif = false, lignes = 4 } = {}) => `
  <div class="groupe">
    <label class="etiquette-champ" for="ed-${nom}">${echapper(libelle)}${facultatif ? ' <span class="facultatif">(facultatif)</span>' : ''}</label>
    <textarea class="zone" id="ed-${nom}" name="${nom}" rows="${lignes}" placeholder="${echapper(placeholder)}">${echapper(valeur ?? '')}</textarea>
    ${aide ? `<p class="aide">${echapper(aide)}</p>` : ''}
  </div>`;
const select = (nom, libelle, carte, valeur = '', { aide = '', vide = '' } = {}) => `
  <div class="groupe">
    <label class="etiquette-champ" for="ed-${nom}">${echapper(libelle)}</label>
    <select class="select" id="ed-${nom}" name="${nom}">${vide ? `<option value="">${echapper(vide)}</option>` : ''}${optionsDe(carte, valeur)}</select>
    ${aide ? `<p class="aide">${echapper(aide)}</p>` : ''}
  </div>`;
const visibilite = (valeur = 'client') => `
  <div class="groupe">
    <span class="etiquette-champ">Visibilité</span>
    <div class="segments" role="group">
      <label class="interrupteur" style="padding:6px 8px"><input type="radio" name="visibilite" value="client" ${valeur !== 'interne' ? 'checked' : ''}> Visible par le client</label>
      <label class="interrupteur" style="padding:6px 8px"><input type="radio" name="visibilite" value="interne" ${valeur === 'interne' ? 'checked' : ''}> Interne Capmedia</label>
    </div>
  </div>`;

/* Un choix multiple garde ce qui était déjà coché : sans cela, rouvrir un
   étape pour corriger son avancement effaçait en silence ses parties. */
const optionsMultiples = (carte, prises) => Object.entries(carte)
  .map(([cle, libelle]) => `<option value="${echapper(cle)}"${(prises || []).includes(cle) ? ' selected' : ''}>${echapper(typeof libelle === 'string' ? libelle : libelle.libelle)}</option>`)
  .join('');

/*
 * Un report de date. Une date qui bouge sans laisser de trace, c'est la
 * question que le client pose au téléphone six semaines plus tard. Le bloc
 * ne se montre que si la date change vraiment, et il n'accepte pas d'être
 * vide : un report sans motif ne vaut pas mieux qu'un report caché.
 */
const blocReport = (nom, ancienne) => (ancienne ? `
  <div class="groupe report-bloc" data-report-pour="ed-${nom}" hidden>
    <p class="surtitre">Ce report sera inscrit dans l'historique</p>
    <p class="aide" style="margin-top:2px">Date actuelle : ${echapper(dateCourte(ancienne))}. Le client verra le motif.</p>
    ${select('reportMotif', 'Motif du report', MOTIFS_REPORT, 'attente-client')}
    ${champ('reportNote', 'Une phrase de plus', '', { facultatif: true, placeholder: 'Ce que le client a besoin de comprendre.' })}
  </div>` : '');

/* Le bloc n'apparaît qu'à la vraie différence : rouvrir une fiche et
   ressortir sans toucher à la date n'inscrit rien. */
const brancherReport = (racine) => {
  racine.querySelectorAll('[data-report-pour]').forEach((bloc) => {
    const entree = racine.querySelector(`#${bloc.dataset.reportPour}`);
    if (!entree) return;
    const depart = entree.value;
    const revoir = () => { bloc.hidden = !entree.value || entree.value === depart; };
    entree.addEventListener('input', revoir);
    entree.addEventListener('change', revoir);
    revoir();
  });
};

/* La liste des reports, celui d'aujourd'hui compris s'il y en a un. */
const reportsMaj = (fiche, champDate, valeur, d, session) => {
  const reports = Array.isArray(fiche && fiche.reports) ? fiche.reports.slice() : [];
  const ancienne = enDate(fiche && fiche[champDate]);
  const nouvelle = valeur ? new Date(valeur) : null;
  /* On compare des jours, pas des instants : un champ date rend minuit
     UTC quand la fiche porte minuit local, et la différence d'une heure
     inscrivait un report du 3 novembre au 3 novembre. */
  if (!ancienne || !nouvelle || dateISO(ancienne) === dateISO(nouvelle)) return reports;
  reports.push({
    de: ancienne, vers: nouvelle,
    motif: d.reportMotif || 'autre', note: (d.reportNote || '').slice(0, 300),
    le: new Date(), par: nomAffiche(session) || 'Capmedia',
  });
  return reports.slice(-20);
};

const contactsDe = (fiche) => contactsProjet(fiche);
const composantsDe = (pid) => (magasin.lire(K.composants(pid)) || []).reduce((c, x) => ({ ...c, [x.id]: x.nom }), {});
const jalonsDe = (pid) => (magasin.lire(K.jalons(pid)) || []).reduce((c, x) => ({ ...c, [x.id]: x.titre }), {});
const equipeCarte = () => (magasin.lire(K.equipe) || []).reduce((c, x) => ({ ...c, [x.id]: x.nom || x.email }), {});
/* Les versions d'un projet, de la plus récente à la plus ancienne : c'est
   dans l'une d'elles que part la correction, et le client veut son nom. */
const releasesDe = (pid) => (magasin.lire(K.releases(pid)) || [])
  .slice().sort((a, b) => (enDate(b.date) || 0) - (enDate(a.date) || 0))
  .reduce((c, r) => ({ ...c, [r.id]: [(PLATEFORMES_CHOIX[r.plateforme] || {}).libelle, r.version, r.titre].filter(Boolean).join(' · ') }), {});

/* Les devis d'un projet, pour rattacher une étape ou un forfait. L'équipe
   les a en groupe, et le client sur sa clé : on lit les deux. */
const devisDe = (pid) => Object.fromEntries((magasin.lire(K.documents(pid)) || []).concat(magasin.lire(K.documentsTous) || [])
  .filter((x, i, l) => x.type === 'devis' && x.projet === pid && l.findIndex((y) => y.id === x.id) === i)
  .map((x) => [x.id, { libelle: `${x.numero || 'Devis'} · ${x.libelle || ''}` }]));
/* Une référence est unique DANS un projet. Le garde-fou anti-doublon lisait
   la seule clé du projet, que la console de tests n'abonne jamais (elle lit
   en groupe) : depuis la console, une référence déjà prise passait, et
   l'écriture remplaçait la fiche entière, verdict et notes compris. On lit
   donc les deux clés, comme la liste des scénarios le fait déjà. */
const refsDuProjet = (pid, parProjet, globale) => new Set([
  ...(magasin.lire(parProjet(pid)) || []),
  ...(magasin.lire(globale) || []).filter((x) => (x.projet || x._parent) === pid),
].map((x) => x.ref));

const maintenanceDe = (pid) => (magasin.lire(K.maintenance(pid)) || []).concat(magasin.lire(K.maintenanceToute) || [])
  .filter((x, i, l) => (x.projet || x._parent) === pid && l.findIndex((y) => y.id === x.id) === i);
const sequencesDe = (pid) => Object.fromEntries(maintenanceDe(pid).filter((x) => x.genre === 'sequence').map((x) => [x.id, { libelle: x.titre || 'Séquence' }]));
const evolutionsDe = (pid) => Object.fromEntries(maintenanceDe(pid).filter((x) => x.genre === 'evolution').map((x) => [x.id, { libelle: x.titre || 'Évolution' }]));

/* Le bouton « Supprimer » d'une fiche de maintenance : une confirmation,
   l'écriture, et la feuille se referme. */
const brancherSuppression = (racine, fiche, pid, quoi, texte) => {
  const b = racine.querySelector('[data-supprimer]');
  if (!b || !fiche) return;
  b.addEventListener('click', async () => {
    const ok = await confirmer({ titre: `Supprimer ${quoi} ?`, texte, ok: 'Supprimer', danger: true });
    if (!ok) return;
    await ecrire.supprimerElementMaintenance(pid, fiche.id);
    toast('Supprimé.');
    const fermer = racine.querySelector('[data-fermer]');
    if (fermer) fermer.click();
  });
};

/** Ouvre une feuille, branche le formulaire, résout la valeur d'`enregistrer`. */
/** Le choix d'un logo : on l'envoie tout de suite, l'aperçu suit. */
const brancherLogo = (racine, pid) => {
  const entree = $('#ed-logo', racine);
  if (!entree) return;
  const apercu = $('#apercu-logo', racine);
  const poser = async (corps, message) => {
    apercu.style.opacity = '0.4';
    try {
      const r = await appelServeur('poserLogo', { id: pid, ...corps });
      if (r.logo) { apercu.classList.add('avatar-projet--logo'); apercu.innerHTML = `<img src="${r.logo}" alt="">`; }
      else { apercu.classList.remove('avatar-projet--logo'); apercu.textContent = ''; }
      toast(message);
    } catch (e) { toast(lisible(e), 'erreur'); }
    finally { apercu.style.opacity = ''; }
  };
  entree.addEventListener('change', async () => {
    const f = entree.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('2 Mo au maximum.', 'erreur'); return; }
    const donnees = await new Promise((ok, ko) => {
      const l = new FileReader();
      l.onload = () => ok(String(l.result).split(',')[1]);
      l.onerror = ko;
      l.readAsDataURL(f);
    });
    await poser({ donnees, typeFichier: f.type }, 'Logo posé.');
    entree.value = '';
  });
  const retirer = $('#ed-logo-retirer', racine);
  if (retirer) retirer.addEventListener('click', () => poser({ retirer: true }, 'Logo retiré.'));
};

const feuille = ({ titre, sousTitre, corps, enregistrer, libelle = 'Enregistrer', regles = {}, avecDepot = null, surMontage = null }) => {
  const m = modale({
    titre, sousTitre, feuille: true,
    corps: `<form class="forme" id="ed-forme" novalidate>${corps}${avecDepot ? '<div id="ed-depot"></div>' : ''}</form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="ed-forme">${echapper(libelle)}</button>`,
  });
  let boiteDepot = null;
  if (avecDepot) boiteDepot = depot($('#ed-depot', m.el), avecDepot);
  if (surMontage) surMontage(m.el);
  const forme = $('#ed-forme', m.el);
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, regles)) return;
    if (boiteDepot && boiteDepot.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const bouton = $('button[type="submit"]', m.pied);
    const ok = await agir(bouton, async () => {
      /* La racine en troisième argument : un éditeur peut porter des
         contrôles hors du formulaire, que « lireForme » ne voit pas. */
      const resultat = await enregistrer(lireForme(forme), boiteDepot ? boiteDepot.pieces : [], m.el);
      /* Un éditeur qui renvoie « undefined » refuse la saisie et l'a déjà
         dit : fermer la feuille effacerait le formulaire sous les yeux de
         celui qui vient de se tromper, et il devrait tout retaper. */
      if (resultat === undefined) return;
      m.fermer(resultat);
    });
    void ok;
  });
  return m.fin;
};

/* ==========================================================================
   Les genres
   ========================================================================== */

const editeurs = {
  projet: (env, { pid, fiche }) => feuille({
    titre: 'Le projet', sousTitre: fiche.nom,
    corps: `
      <div class="groupe"><span class="etiquette-champ">Logo</span>
        <div class="rang" style="gap:14px">
          <span class="avatar-projet avatar-projet--grand${fiche.logo ? ' avatar-projet--logo' : ''}" id="apercu-logo">${fiche.logo ? `<img src="${echapper(fiche.logo)}" alt="">` : echapper((fiche.nom || '?').slice(0, 2).toUpperCase())}</span>
          <div class="rang" style="gap:8px">
            <label class="btn btn-secondaire btn-petit" style="position:relative;overflow:hidden">Choisir une image<input type="file" id="ed-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
            ${fiche.logo ? '<button class="btn btn-fantome btn-petit" type="button" id="ed-logo-retirer">Retirer</button>' : ''}
          </div>
        </div>
        <p class="aide">PNG, JPEG, WebP ou SVG, 2 Mo au maximum. Il remplace les initiales partout.</p>
      </div>
      ${champ('nom', 'Nom', fiche.nom)}
      ${/* Les projets d'avant le Hub portent « actif », que « statutProjet »
            traduit. Sans lui, le sélecteur ne trouvait aucune option, le
            navigateur prenait la première (« brouillon »), et enregistrer
            une description remettait le projet en préparation. */ ''}
      ${select('statut', 'Statut', STATUTS_PROJET, statutProjet(fiche))}
      ${select('type', 'Type', TYPES_PROJET, fiche.type || 'application-mobile')}
      ${zone('description', 'Description', fiche.description, { facultatif: true, lignes: 3 })}
      <div class="groupe"><span class="etiquette-champ">Plateformes</span>${choixPlateformes('plateformes', fiche.plateformes || [])}</div>
      <div class="forme-rang">
        ${champ('debut', 'Début', dateISO(fiche.debut), { type: 'date', facultatif: true })}
        ${champ('cible', 'Date cible', dateISO(fiche.cible), { type: 'date', facultatif: true })}
      </div>
      ${blocReport('cible', fiche.cible)}
      <div class="forme-rang">
        ${select('progressionMode', 'Progression', { manuel: 'Saisie à la main', jalons: 'Calculée sur les étapes' }, (fiche.progression || {}).mode || 'manuel')}
        ${champ('progressionValeur', 'Valeur (si à la main)', borner((fiche.progression || {}).valeur), { type: 'number', attrs: 'min="0" max="100"' })}
      </div>
      <div class="forme-rang">
        ${select('responsable', 'Responsable Capmedia', equipeCarte(), fiche.responsable || '', { vide: 'Non défini' })}
        ${select('sante', 'Santé (interne)', SANTES, fiche.sante || 'ok')}
      </div>
      <p class="surtitre" style="margin-top:8px">Le pouls du projet</p>
      ${champ('pulseEnCours', 'Capmedia travaille sur', (fiche.pulse || {}).enCours, { facultatif: true, placeholder: 'ex. Authentification Android' })}
      ${champ('pulseDerniereLivraison', 'Dernière livraison', (fiche.pulse || {}).derniereLivraison, { facultatif: true, placeholder: 'ex. iOS 2.4.1' })}
      ${champ('pulseProchaineEtape', 'Prochaine étape', (fiche.pulse || {}).prochaineEtape, { facultatif: true, placeholder: 'ex. Validation TestFlight' })}
      ${champ('pulseAttenteClient', 'Attente client', (fiche.pulse || {}).attenteClient, { facultatif: true, placeholder: 'Laissez vide si rien' })}
      <p class="surtitre" style="margin-top:8px">Les interlocuteurs</p>
      <p class="aide" style="margin-top:-4px">Un projet peut en compter deux : ils reçoivent les mêmes e-mails et voient le même espace.</p>
      <div class="forme-rang">
        ${champ('contact1Nom', 'Interlocuteur principal', (contactsDe(fiche)[0] || {}).nom, { facultatif: true, placeholder: 'Prénom et nom' })}
        ${champ('contact1Email', 'Son e-mail', (contactsDe(fiche)[0] || {}).email, { type: 'email', facultatif: true })}
      </div>
      <div class="forme-rang">
        ${champ('contact2Nom', 'Second interlocuteur', (contactsDe(fiche)[1] || {}).nom, { facultatif: true, placeholder: 'Laissez vide s\'il n\'y en a qu\'un' })}
        ${champ('contact2Email', 'Son e-mail', (contactsDe(fiche)[1] || {}).email, { type: 'email', facultatif: true })}
      </div>
      <label class="interrupteur" style="margin-top:8px"><input type="checkbox" name="interne" ${fiche.interne ? 'checked' : ''}><i></i> C'est un projet à moi</label>
      <p class="aide">Aucun client, aucun e-mail, visible de vous seul dans le cockpit.</p>
      <label class="interrupteur" style="margin-top:8px"><input type="checkbox" name="silence" ${fiche.silence ? 'checked' : ''}><i></i> Préparer sans prévenir le client</label>
      <p class="aide">En sourdine, le client garde l'accès mais ne reçoit aucun e-mail. À lever quand l'espace est prêt.</p>`,
    surMontage: (racine) => { brancherLogo(racine, pid); brancherReport(racine); },
    regles: {
      nom: obligatoire(),
      progressionValeur: (v) => (v !== null && (v < 0 || v > 100) ? 'Entre 0 et 100.' : ''),
      contact1Email: emailValide(), contact2Email: emailValide(),
    },
    enregistrer: (d) => ecrire.majProjet(pid, {
      nom: d.nom, statut: d.statut, type: d.type, description: d.description,
      plateformes: Array.isArray(d.plateformes) ? d.plateformes : (d.plateformes ? [d.plateformes] : []),
      debut: d.debut ? new Date(d.debut) : null, cible: d.cible ? new Date(d.cible) : null,
      reports: reportsMaj(fiche, 'cible', d.cible, d, env.session),
      progression: { mode: d.progressionMode, valeur: borner(d.progressionValeur) },
      responsable: d.responsable, sante: d.sante, silence: Boolean(d.silence), interne: Boolean(d.interne),
      contacts: [
        { nom: d.contact1Nom || '', email: (d.contact1Email || '').trim().toLowerCase() },
        { nom: d.contact2Nom || '', email: (d.contact2Email || '').trim().toLowerCase() },
      ].filter((c) => c.email || c.nom),
      client: (d.contact1Email || d.contact1Nom)
        ? { ...(fiche.client || {}), nom: d.contact1Nom || '', email: (d.contact1Email || '').trim().toLowerCase() }
        : (fiche.client || null),
      pulse: { enCours: d.pulseEnCours, derniereLivraison: d.pulseDerniereLivraison, prochaineEtape: d.pulseProchaineEtape, attenteClient: d.pulseAttenteClient },
    }).then(() => toast('Projet mis à jour.')),
  }),

  composant: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La partie' : 'Nouvelle partie', sousTitre: fiche ? fiche.nom : 'Une partie du projet : iPhone, Android, web, serveur...',
    corps: `
      ${champ('nom', 'Nom', fiche ? fiche.nom : (defaut.nom || ''), { placeholder: 'Application iOS' })}
      <div class="forme-rang">
        ${select('type', 'Type', TYPES_COMPOSANT, fiche ? fiche.type : (defaut.type || 'ios'))}
        ${select('statut', 'Statut', STATUTS_COMPOSANT, fiche ? fiche.statut : 'en-cours')}
      </div>
      <div class="forme-rang">
        ${champ('progression', 'Progression (%)', fiche ? borner(fiche.progression) : 0, { type: 'number', attrs: 'min="0" max="100"' })}
        ${champ('ordre', 'Ordre', fiche ? fiche.ordre : 0, { type: 'number' })}
      </div>
      <div class="forme-rang">
        ${champ('version', 'Version actuelle', fiche ? fiche.version : '', { facultatif: true, placeholder: '1.4.2' })}
        ${champ('versionPrep', 'Version en préparation', fiche ? fiche.versionPrep : '', { facultatif: true, placeholder: '1.5.0' })}
      </div>
      <div class="forme-rang">
        ${champ('environnement', 'Environnement', fiche ? fiche.environnement : '', { facultatif: true, placeholder: 'Production, TestFlight...' })}
        ${select('responsable', 'Responsable', equipeCarte(), fiche ? fiche.responsable : '', { vide: 'Non défini' })}
      </div>
      ${champ('lien', 'Adresse publique', fiche ? fiche.lien : '', { type: 'url', facultatif: true, placeholder: 'https://apps.apple.com/...', aide: 'La fiche du store, le site en ligne, le tableau de bord. Elle rend la carte de la plateforme cliquable en tête du projet.' })}
      ${champ('techno', 'Technologies', fiche ? (fiche.techno || []).join(', ') : '', { facultatif: true, aide: 'Séparées par des virgules.' })}
      ${zone('description', 'Description', fiche ? fiche.description : '', { facultatif: true, lignes: 3 })}`,
    regles: { nom: obligatoire(), lien: urlValide() },
    enregistrer: async (d) => {
      const donnees = { ...d, techno: d.techno ? d.techno.split(',').map((t) => t.trim()).filter(Boolean) : [], progression: borner(d.progression) };
      if (fiche) await ecrire.majComposant(pid, fiche.id, donnees); else await ecrire.creerComposant(pid, donnees);
      toast(fiche ? 'Partie mise à jour.' : 'Partie ajoutée.');
    },
  }),

  /* La fiche technique d'une brique : ce qu'il y a dedans, ce qui la fait
     tourner, qui en détient les clés, et ce qu'il faudra mettre à jour.
     Deux façons de la remplir : coller un package.json, ou tout saisir. */
  technique: (env, { pid, fiche }) => {
    const t = (magasin.lire(K.technique(pid)) || []).find((x) => x.id === (fiche && fiche.id)) || {};
    const enLignes = (liste, forme) => (liste || []).map(forme).join('\n');
    return feuille({
      titre: 'La fiche technique', sousTitre: fiche ? fiche.nom : '',
      corps: `
        <div class="groupe">
          <label class="etiquette-champ" for="ed-json">Coller un package.json <span class="facultatif">(facultatif)</span></label>
          <textarea class="zone" id="ed-json" name="json" rows="4" placeholder='{ "dependencies": { "react-native": "0.80.2" } }'></textarea>
          <p class="aide">Collé ici, il remplace la liste des bibliothèques par celle du fichier, versions comprises. Laissez vide pour garder la liste actuelle.</p>
        </div>
        <p class="surtitre" style="margin-top:8px">Le code en chiffres</p>
        <div class="forme-rang">
          ${champ('lignes', 'Lignes de code', t.lignes, { type: 'number', facultatif: true })}
          ${champ('fichiers', 'Fichiers de code', t.fichiers, { type: 'number', facultatif: true })}
        </div>
        <div class="forme-rang">
          ${champ('poids', 'Poids du dépôt', t.poids, { facultatif: true, placeholder: '320 Mo' })}
          ${champ('releve', 'Date du relevé', dateISO(t.releve), { type: 'date', facultatif: true })}
        </div>
        ${zone('technos', 'Technologies et versions', enLignes(t.technos, (x) => `${x.nom}${x.version ? ` · ${x.version}` : ''}`), { facultatif: true, lignes: 3, aide: 'Une par ligne : nom · version.' })}
        ${zone('dependances', 'Bibliothèques', enLignes(t.dependances, (x) => `${x.nom} · ${x.version || ''}${x.dev ? ' · dev' : ''}`), { facultatif: true, lignes: 5, aide: 'Une par ligne : nom · version · dev. Le package.json collé plus haut écrase cette liste.' })}
        ${zone('assets', 'Ressources', enLignes(t.assets, (x) => `${x.nom} · ${x.detail || ''}`), { facultatif: true, lignes: 3, aide: 'Une par ligne : nom · détail. Par exemple : Images · 128 fichiers, 42 Mo.' })}
        ${zone('acces', 'Comptes et accès', enLignes(t.acces, (x) => `${x.nom} | ${x.compte || ''} | ${x.detenteur || ''} | ${x.url || ''}`), { facultatif: true, lignes: 4, aide: 'Une par ligne : service | compte | détenteur | adresse. Jamais de mot de passe ni de clé.' })}
        ${zone('alertes', 'À mettre à jour', enLignes(t.alertes, (x) => `${x.gravite || 'info'} | ${x.titre} | ${x.echeance || ''} | ${x.texte || ''}`), { facultatif: true, lignes: 4, aide: 'Une par ligne : gravité (critique, attention, info) | titre | échéance | explication.' })}`,
      regles: {},
      enregistrer: async (d) => {
        const couper = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);
        let dependances = couper(d.dependances).map((l) => {
          const [nom, version, dev] = l.split('·').map((x) => x.trim());
          return { nom, version: version || '', dev: dev === 'dev' };
        });
        let technos = couper(d.technos).map((l) => {
          const [nom, version] = l.split('·').map((x) => x.trim());
          return { nom, version: version || '' };
        });
        if (String(d.json || '').trim()) {
          let paquet = null;
          try { paquet = JSON.parse(d.json); } catch (e) { toast('Le package.json collé est illisible : la liste n\'a pas changé.', 'erreur'); paquet = null; }
          if (paquet) {
            const lire = (bloc, dev) => Object.entries(bloc || {}).map(([nom, version]) => ({ nom, version: String(version).replace(/^[\^~]/, ''), dev }));
            dependances = [...lire(paquet.dependencies, false), ...lire(paquet.devDependencies, true)];
            /* Le socle se détache des bibliothèques : c'est lui qui date.
               Ce que vous avez saisi à la main reste, le fichier complète. */
            const socle = ['react-native', 'react', 'next', 'expo', 'vue', 'svelte', 'typescript', 'firebase', 'astro', 'vite'];
            const duFichier = dependances.filter((x) => socle.includes(x.nom)).map((x) => ({ nom: x.nom, version: x.version }));
            if (paquet.engines && paquet.engines.node) duFichier.push({ nom: 'node', version: String(paquet.engines.node) });
            const deja = (nom) => technos.some((t) => t.nom.toLowerCase().replace(/[\s_-]/g, '') === String(nom).toLowerCase().replace(/[\s_-]/g, ''));
            technos = [...technos, ...duFichier.filter((x) => !deja(x.nom))];
            toast(`${dependances.length} bibliothèques reprises du package.json.`);
          }
        }
        const technique = {
          lignes: Number(d.lignes) || null,
          fichiers: Number(d.fichiers) || null,
          poids: d.poids || '',
          releve: d.releve ? new Date(d.releve) : null,
          technos,
          dependances,
          assets: couper(d.assets).map((l) => { const [nom, detail] = l.split('·').map((x) => x.trim()); return { nom, detail: detail || '' }; }),
          acces: couper(d.acces).map((l) => { const [nom, compte, detenteur, url] = l.split('|').map((x) => x.trim()); return { nom, compte: compte || '', detenteur: detenteur || '', url: url || '' }; }),
          alertes: couper(d.alertes).map((l) => { const [gravite, titre, echeance, texte] = l.split('|').map((x) => x.trim()); return { gravite: gravite || 'info', titre: titre || '', echeance: echeance || '', texte: texte || '' }; }),
        };
        await ecrire.majTechnique(pid, fiche.id, technique);
        toast('Fiche technique mise à jour.');
      },
    });
  },

  /* Un scénario de test. La référence est l'identifiant du document : elle
     nomme le scénario dans les passages, les anomalies et les rapports des
     testeurs, donc elle ne se change pas une fois posée. Rouvrir un
     scénario pour le corriger laisse le champ en lecture seule. */
  scenario: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'Le scénario' : 'Nouveau scénario',
    sousTitre: fiche ? fiche.ref : 'Un cas de test, écrit une fois, déroulé à chaque campagne.',
    corps: `
      <div class="forme-rang">
        ${champ('ref', 'Référence', fiche ? fiche.ref : (defaut.ref || ''), { placeholder: 'DI-33', aide: fiche ? 'La référence ne se change pas : elle nomme ce scénario partout ailleurs.' : 'Deux lettres, un tiret, un numéro. Elle sert de nom dans tous les rapports.', attrs: fiche ? 'readonly' : '' })}
        ${select('bloc', 'Bloc', BLOCS_SCENARIO, fiche ? fiche.bloc : (defaut.bloc || 'divers'))}
      </div>
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Rappel fin de mois' })}
      ${zone('options', 'Options', fiche ? fiche.options : '', { facultatif: true, lignes: 2, placeholder: 'Type Événement, le 31 mars, rappel 1 mois avant' })}
      ${zone('attendu', 'Résultat attendu', fiche ? fiche.attendu : '', { lignes: 3, placeholder: 'Déclenchement le 28 ou 29 février, jamais le 3 mars' })}
      <div class="groupe">
        ${select('niveau', 'Couverture', NIVEAUX_SCENARIO, fiche ? fiche.niveau : 'reparti')}
        <p class="aide">Un scénario « socle » ou « transversal » est passé par deux testeurs sur deux systèmes différents. Un scénario « réparti » ne l'est qu'une fois : passer deux fois coûte le double, on ne le fait que là où la réponse peut différer.</p>
      </div>
      <div class="groupe"><span class="etiquette-champ">Plateformes</span>
        <div class="rang" style="gap:14px;flex-wrap:wrap">${Object.entries(PLATEFORMES_TEST).map(([cle, f]) => `<label class="case"><input type="checkbox" name="plateformes" value="${echapper(cle)}" ${((fiche && fiche.plateformes) || ['ios', 'android', 'web']).includes(cle) ? 'checked' : ''}> ${echapper(f.libelle)}</label>`).join('')}</div>
        <p class="aide">Là où ce scénario a un sens. Un scénario qui ne concerne que le mobile n'apparaît pas dans la liste du testeur web.</p>
      </div>
      ${champ('ordre', 'Ordre', fiche ? fiche.ordre : (defaut.ordre || 0), { type: 'number', aide: 'Sa place dans la liste. Les scénarios importés gardent l\'ordre du plan.' })}`,
    regles: {
      ref: (v) => {
        if (!String(v || '').trim()) return 'Donnez une référence.';
        if (!REF_SCENARIO.test(String(v).trim().toUpperCase())) return 'Deux lettres, un tiret, un numéro. Par exemple DI-33.';
        return '';
      },
      titre: obligatoire(),
      attendu: obligatoire(),
    },
    enregistrer: async (d) => {
      const ref = fiche ? fiche.ref : String(d.ref || '').trim().toUpperCase();
      /* Créer un scénario dont la référence existe déjà écraserait le sien
         sans rien dire, et les passages déjà consignés changeraient de sens.
         On interroge la base, pas le magasin : lui écarte les scénarios
         désactivés, et leur référence reste prise. */
      if (!fiche && await ecrire.scenarioExiste(pid, ref)) {
        toast(`${ref} existe déjà dans ce projet.`, 'erreur');
        return undefined;
      }
      const plateformes = Array.isArray(d.plateformes) ? d.plateformes : (d.plateformes ? [d.plateformes] : []);
      if (!plateformes.length) { toast('Choisissez au moins une plateforme.', 'erreur'); return undefined; }
      const donnees = {
        ref, bloc: d.bloc, blocLibelle: (BLOCS_SCENARIO[d.bloc] || {}).libelle || '',
        titre: d.titre, options: d.options || '', attendu: d.attendu,
        niveau: d.niveau, plateformes, ordre: Number(d.ordre) || 0,
      };
      if (fiche) await ecrire.majScenario(pid, ref, donnees);
      else await ecrire.creerScenario(pid, { ...donnees, groupe: defaut.groupe || '', actif: true });
      toast(fiche ? 'Scénario enregistré.' : `${ref} créé.`);
      return true;
    },
  }),

  /* Une campagne. Elle ne possède pas les scénarios, elle y pioche : les
     mêmes 173 sont rejoués d'une version à l'autre, et c'est ce qui permet
     de dire « DI-15 est tombé trois fois sur quatre campagnes ». Une
     campagne qui posséderait ses scénarios obligerait à tout réécrire à
     chaque version, et perdrait l'histoire au passage. */
  campagne: (env, { pid, fiche }) => {
    /* L'équipe lit les scénarios en groupe, tous projets confondus : la
       clé par projet n'est alimentée que côté client. On prend la première
       qui répond, et on retient ceux de ce projet. */
    const tous = [
      ...(magasin.lire(K.scenarios(pid)) || []),
      ...(magasin.lire(K.scenariosTous) || []).filter((x) => (x.projet || x._parent) === pid),
    ].filter((x, i, l) => x.actif !== false && l.findIndex((y) => y.ref === x.ref) === i);
    const blocs = [];
    tous.forEach((x) => {
      let g = blocs.find((b) => b.cle === x.bloc);
      if (!g) { g = { cle: x.bloc, libelle: (BLOCS_SCENARIO[x.bloc] || {}).libelle || x.blocLibelle || 'Divers', n: 0 }; blocs.push(g); }
      g.n += 1;
    });
    const choisis = new Set(fiche ? (fiche.scenarios || []) : tous.map((x) => x.ref));

    return feuille({
      titre: fiche ? 'La campagne' : 'Nouvelle campagne',
      sousTitre: fiche ? fiche.titre : 'Elle déroule une sélection de scénarios sur une version précise.',
      libelle: fiche ? 'Enregistrer' : 'Créer la campagne',
      corps: `
        ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Campagne Octobre 2026, mise en production 1.2.0' })}
        <div class="forme-rang">
          ${champ('debut', 'Début', fiche ? dateISO(fiche.debut) : '', { type: 'date', facultatif: true })}
          ${champ('fin', 'Fin prévue', fiche ? dateISO(fiche.fin) : '', { type: 'date', facultatif: true })}
        </div>
        ${select('statut', 'Statut', STATUTS_CAMPAGNE, fiche ? fiche.statut : 'preparation')}
        <div class="groupe">
          <span class="etiquette-champ">Numéros de build</span>
          <div class="forme-rang">
            ${champ('build_ios', 'iOS', fiche ? ((fiche.builds || {}).ios || '') : '', { facultatif: true, placeholder: '24' })}
            ${champ('build_android', 'Android', fiche ? ((fiche.builds || {}).android || '') : '', { facultatif: true, placeholder: '31' })}
          </div>
          ${champ('build_web', 'Web', fiche ? ((fiche.builds || {}).web || '') : '', { facultatif: true, placeholder: 'qa-1.2.0' })}
          <p class="aide">Un rapport dont on ne sait pas à quelle version il correspond ne sert à rien.</p>
        </div>

        <div class="groupe">
          <span class="etiquette-champ">Scénarios déroulés</span>
          <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button class="btn btn-secondaire btn-petit" type="button" data-tout>Tous les blocs</button>
            <button class="btn btn-secondaire btn-petit" type="button" data-rien>Aucun bloc</button>
          </div>
          <label class="case" style="margin-bottom:10px"><input type="checkbox" id="ed-socle-seul"> Ne garder que les scénarios du socle et transversaux</label>
          <div class="cases-blocs">${blocs.map((b) => `
            <label class="case"><input type="checkbox" data-bloc="${echapper(b.cle)}" checked> ${echapper(b.libelle)} <span class="badge">${b.n}</span></label>`).join('')}</div>
          <p class="aide" id="compte-scenarios"></p>
        </div>`,
      surMontage: (racine) => {
        const cases = [...racine.querySelectorAll('[data-bloc]')];
        const compte = racine.querySelector('#compte-scenarios');

        /* Le nombre de passages, pas le nombre de scénarios : c'est lui qui
           dit ce que la campagne coûte en temps de testeur, puisqu'un
           scénario du socle est déroulé deux fois. */
        const socleSeul = racine.querySelector('#ed-socle-seul');

        /* Deux filtres qui se croisent : les blocs disent QUOI tester, le
           socle dit À QUELLE PROFONDEUR. Les confondre donnait un bouton
           « socle seulement » qui ne retirait rien, puisque chaque bloc
           contient au moins un scénario du socle. */
        const retenus = () => {
          const pris = new Set(cases.filter((c) => c.checked).map((c) => c.dataset.bloc));
          return tous.filter((x) => pris.has(x.bloc)
            && (!socleSeul.checked || (NIVEAUX_SCENARIO[x.niveau] || {}).double));
        };

        const majCompte = () => {
          const liste = retenus();
          const doubles = liste.filter((x) => (NIVEAUX_SCENARIO[x.niveau] || {}).double).length;
          compte.textContent = liste.length
            ? `${liste.length} scénarios, soit ${liste.length + doubles} passages sur mobile et ${liste.filter((x) => (x.plateformes || []).includes('web')).length} sur le web.`
            : 'Aucun scénario : la campagne n\'aurait rien à distribuer.';
        };

        cases.forEach((c) => c.addEventListener('change', majCompte));
        socleSeul.addEventListener('change', majCompte);
        racine.querySelector('[data-tout]').addEventListener('click', () => { cases.forEach((c) => { c.checked = true; }); majCompte(); });
        racine.querySelector('[data-rien]').addEventListener('click', () => { cases.forEach((c) => { c.checked = false; }); majCompte(); });
        majCompte();
      },
      regles: { titre: obligatoire() },
      enregistrer: async (d, _pieces, racine) => {
        const boite = racine || document;
        const pris = new Set([...boite.querySelectorAll('[data-bloc]')].filter((c) => c.checked).map((c) => c.dataset.bloc));
        const seulementSocle = Boolean((boite.querySelector('#ed-socle-seul') || {}).checked);
        const refs = tous
          .filter((x) => pris.has(x.bloc) && (!seulementSocle || (NIVEAUX_SCENARIO[x.niveau] || {}).double))
          .map((x) => x.ref);
        if (!refs.length) { toast('Choisissez au moins un bloc de scénarios.', 'erreur'); return undefined; }
        /* Une fin avant le début : le tableau ne saurait plus dire quel
           jour on est ni ce qu'il reste. La campagne ForgeMe d'octobre
           2026 est née ainsi, du 1er octobre au 30 septembre. */
        if (d.debut && d.fin && new Date(d.fin) < new Date(d.debut)) {
          toast('La fin prévue tombe avant le début. Corrigez l\'une des deux dates.', 'erreur');
          return undefined;
        }
        const donnees = {
          titre: d.titre, statut: d.statut,
          debut: d.debut ? new Date(d.debut) : null,
          fin: d.fin ? new Date(d.fin) : null,
          builds: { ios: d.build_ios || '', android: d.build_android || '', web: d.build_web || '' },
          scenarios: refs,
        };
        if (fiche) await ecrire.majCampagne(pid, fiche.id, donnees);
        else await ecrire.creerCampagne(pid, { ...donnees, testeurs: [], affectation: {} });
        toast(fiche ? 'Campagne enregistrée.' : `Campagne créée, ${refs.length} scénarios retenus.`);
        return true;
      },
    });
  },

  /* Un parcours automatisé. Il ne remplace pas un testeur, il remplace la
     partie répétitive de son travail : ce qu'on rejoue à chaque version
     pour qu'un défaut corrigé ne revienne pas.

     L'état vient de l'outil, pas d'une saisie : Maestro et Playwright
     rendent un verdict, et le recopier à la main serait la première chose
     qu'on oublierait de faire. Il reste modifiable tant que le parcours
     n'est pas branché. */
  parcours: (env, { pid, fiche, defaut = {} }) => {
    const scen = [
      ...(magasin.lire(K.scenarios(pid)) || []),
      ...(magasin.lire(K.scenariosTous) || []).filter((x) => (x.projet || x._parent) === pid),
    ].filter((x, i, l) => x.actif !== false && l.findIndex((y) => y.ref === x.ref) === i)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    return feuille({
      titre: fiche ? 'Le parcours' : 'Nouveau parcours',
      sousTitre: fiche ? fiche.ref : 'Rejoué par une machine à chaque version.',
      corps: `
        <div class="forme-rang">
          ${champ('ref', 'Référence', fiche ? fiche.ref : (defaut.ref || ''), { placeholder: 'P-01', attrs: fiche ? 'readonly' : '', aide: fiche ? "Elle ne change pas : c'est elle que l'outil renvoie dans son rapport." : "C'est par elle qu'on recolle le verdict de l'outil au parcours." })}
          ${select('outil', 'Outil', OUTILS_PARCOURS, fiche ? fiche.outil : 'maestro')}
        </div>
        ${champ('titre', 'Ce qu il déroule', fiche ? fiche.titre : '', { placeholder: 'Créer une tâche récurrente et la cocher' })}
        <div class="groupe"><span class="etiquette-champ">Où il tourne</span>
          <div class="rang" style="gap:14px;flex-wrap:wrap">${Object.entries(PLATEFORMES_TEST).map(([cle, f]) => `<label class="case"><input type="checkbox" name="plateformes" value="${echapper(cle)}" ${((fiche && fiche.plateformes) || ['ios', 'android']).includes(cle) ? 'checked' : ''}> ${echapper(f.libelle)}</label>`).join('')}</div>
        </div>
        ${champ('fichier', 'Le fichier', fiche ? fiche.fichier : '', { facultatif: true, placeholder: '.maestro/taches/recurrente.yaml' })}
        <div class="forme-rang">
          ${select('etat', 'État', ETATS_PARCOURS, fiche ? fiche.etat : 'a-ecrire')}
          ${champ('ordre', 'Ordre', fiche ? fiche.ordre : (defaut.ordre || 0), { type: 'number' })}
        </div>
        <div class="groupe">
          <label class="case"><input type="checkbox" name="mutation" ${fiche && fiche.mutation ? 'checked' : ''}> Éprouvé par mutation</label>
          <p class="aide">Un parcours qui passe au vert ne prouve rien tant qu'on n'a pas vérifié qu'il sait tomber. Remettre le défaut d'origine et voir le parcours échouer : c'est le seul contrôle qui répond à la question posée.</p>
        </div>
        <div class="groupe"><label class="etiquette-champ" for="ed-scenarios">Scénarios couverts</label>
          <select class="select" id="ed-scenarios" name="scenarios" multiple size="6">${scen.map((x) => `<option value="${echapper(x.ref)}"${((fiche && fiche.scenarios) || []).includes(x.ref) ? ' selected' : ''}>${echapper(x.ref)} — ${echapper(x.titre)}</option>`).join('')}</select>
          <p class="aide">Ce que ce parcours vérifie tout seul. Maintenez ⌘ ou Ctrl pour en choisir plusieurs.</p>
        </div>
        ${zone('note', 'Notes', fiche ? fiche.note : '', { facultatif: true, lignes: 3, placeholder: 'Ce qui bloque, ce qu\'il reste à faire, pourquoi il est instable.' })}`,
      regles: {
        ref: (v) => {
          if (!String(v || '').trim()) return 'Donnez une référence.';
          if (!/^[A-Z]{1,3}-\d{1,3}$/.test(String(v).trim().toUpperCase())) return 'Des lettres, un tiret, un numéro. Par exemple P-01.';
          return '';
        },
        titre: obligatoire(),
      },
      enregistrer: async (d) => {
        const ref = fiche ? fiche.ref : String(d.ref || '').trim().toUpperCase();
        if (!fiche && refsDuProjet(pid, K.parcours, K.parcoursTous).has(ref)) {
          toast(`${ref} existe déjà dans ce projet.`, 'erreur');
          return undefined;
        }
        const liste = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
        const plateformes = liste(d.plateformes);
        if (!plateformes.length) { toast('Dites où il tourne.', 'erreur'); return undefined; }
        const donnees = {
          ref, titre: d.titre, outil: d.outil, plateformes,
          scenarios: liste(d.scenarios), fichier: d.fichier || '',
          etat: d.etat, note: d.note || '',
          mutation: d.mutation === true || d.mutation === 'on',
          ordre: Number(d.ordre) || 0,
        };
        if (fiche) await ecrire.majParcours(pid, ref, donnees);
        else await ecrire.creerParcours(pid, { ...donnees, actif: true });
        toast(fiche ? 'Parcours enregistré.' : `${ref} créé.`);
        return true;
      },
    });
  },

  /* Une famille de règles, pas une règle. Le champ qui compte est le
     nombre de CAS : c'est lui qui dit la profondeur, et c'est la seule
     chose qui distingue une famille écrite d'une famille sérieuse. */
  regle: (env, { pid, fiche, defaut = {} }) => {
    const scen = [
      ...(magasin.lire(K.scenarios(pid)) || []),
      ...(magasin.lire(K.scenariosTous) || []).filter((x) => (x.projet || x._parent) === pid),
    ].filter((x, i, l) => x.actif !== false && l.findIndex((y) => y.ref === x.ref) === i)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    return feuille({
      titre: fiche ? 'La famille de règles' : 'Nouvelle famille',
      sousTitre: fiche ? fiche.ref : 'Une règle du produit, et les cas qu\'on lui fait essayer.',
      corps: `
        <div class="forme-rang">
          ${champ('ref', 'Référence', fiche ? fiche.ref : (defaut.ref || ''), { placeholder: 'RG-01', attrs: fiche ? 'readonly' : '', aide: fiche ? "Elle ne change pas : c'est elle que l'outil renvoie." : "C'est par elle qu'on recolle le verdict de Jest." })}
          ${select('famille', 'Famille', FAMILLES_REGLE, fiche ? fiche.famille : 'recurrences')}
        </div>
        ${champ('titre', 'Ce que la règle vérifie', fiche ? fiche.titre : '', { placeholder: 'Hebdomadaire : les 127 combinaisons de jours' })}
        <div class="forme-rang">
          ${champ('cas', 'Nombre de cas essayés', fiche ? (Number(fiche.cas) || 0) : 0, { type: 'number', attrs: 'min="1" max="5000"', aide: "C'est ce nombre qui dit la profondeur, pas le nombre de fichiers." })}
          ${select('etat', 'État', ETATS_REGLE, fiche ? fiche.etat : 'a-ecrire')}
        </div>
        ${zone('cherche', 'Ce qu\'on cherche', fiche ? fiche.cherche : '', { facultatif: true, lignes: 2, placeholder: 'Aucun jour sauté, aucun jour en double.' })}
        ${champ('fichier', 'Fichier', fiche ? fiche.fichier : '', { facultatif: true, placeholder: '__tests__/recurrences/rg-01.test.ts' })}
        <div class="groupe">
          <label class="case"><input type="checkbox" name="mutation"${fiche && fiche.mutation ? ' checked' : ''}> Éprouvée par mutation</label>
          <p class="aide">Cochez seulement si la règle a été cassée exprès et que le test est tombé. Une famille au vert que rien n'a mise à l'épreuve reste un fichier.</p>
        </div>
        <div class="groupe">
          <label class="etiquette-champ" for="ed-scenarios">Scénarios couverts</label>
          <select class="select" id="ed-scenarios" name="scenarios" multiple size="6">${scen.map((x) => `<option value="${echapper(x.ref)}"${((fiche && fiche.scenarios) || []).includes(x.ref) ? ' selected' : ''}>${echapper(x.ref)} — ${echapper(x.titre)}</option>`).join('')}</select>
          <p class="aide">Maintenez ⌘ ou Ctrl pour en choisir plusieurs.</p>
        </div>
        ${zone('note', 'Notes', fiche ? fiche.note : '', { facultatif: true, lignes: 3 })}`,
      regles: {
        ref: (v) => {
          if (!String(v || '').trim()) return 'Donnez une référence.';
          if (!/^[A-Z]{1,3}-\d{1,3}$/.test(String(v).trim().toUpperCase())) return 'Des lettres, un tiret, un numéro. Par exemple RG-01.';
          return '';
        },
        titre: obligatoire(),
        cas: (v) => (Number(v) > 0 ? '' : 'Une famille essaie au moins un cas.'),
      },
      enregistrer: async (d) => {
        const ref = fiche ? fiche.ref : String(d.ref || '').trim().toUpperCase();
        if (!fiche && refsDuProjet(pid, K.regles, K.reglesToutes).has(ref)) {
          toast(`${ref} existe déjà dans ce projet.`, 'erreur');
          return undefined;
        }
        const liste = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
        const donnees = {
          ref, titre: d.titre, famille: d.famille,
          cas: Number(d.cas) || 0, cherche: d.cherche || '',
          scenarios: liste(d.scenarios), fichier: d.fichier || '',
          etat: d.etat, note: d.note || '',
          mutation: d.mutation === true || d.mutation === 'on',
        };
        if (fiche) await ecrire.majRegle(pid, ref, donnees);
        else await ecrire.creerRegle(pid, { ...donnees, actif: true });
        toast(fiche ? 'Famille enregistrée.' : `${ref} créée.`);
        return true;
      },
    });
  },

  /* Une anomalie, qu'elle vienne d'un testeur ou de l'équipe. La feuille
     qualifie : la gravité et le statut sont les deux décisions qui
     comptent, et la proposition dit qu'une anomalie n'est confirmée
     qu'après reproduction. La description est écrite pour qui devra la
     reproduire : les étapes, dans l'ordre. */
  anomalie: (env, { pid, fiche, defaut = {} }) => {
    const scen = [
      ...(magasin.lire(K.scenarios(pid)) || []),
      ...(magasin.lire(K.scenariosTous) || []).filter((x) => (x.projet || x._parent) === pid),
    ].filter((x, i, l) => x.actif !== false && l.findIndex((y) => y.ref === x.ref) === i)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const prises = (fiche && fiche.plateformes) || defaut.plateformes || [];

    return feuille({
      titre: fiche ? "L'anomalie" : 'Nouvelle anomalie',
      sousTitre: fiche ? (fiche.origine === 'testeur' ? 'Venue d\'un échec de testeur.' : 'Posée par l\'équipe.') : 'Un défaut constaté, à reproduire puis à trancher.',
      corps: `
        ${champ('titre', 'Ce qui ne va pas', fiche ? fiche.titre : (defaut.titre || ''), { placeholder: 'Le rappel de fin de mois ne part jamais' })}
        <div class="forme-rang">
          ${select('gravite', 'Gravité', GRAVITES_ANOMALIE, fiche ? fiche.gravite : 'important', { aide: 'Bloquant : on ne peut pas continuer. Critique : une fonction importante est cassée. Important : gênant, mais on contourne. Mineur : un détail.' })}
          ${select('statut', 'Statut', STATUTS_ANOMALIE, fiche ? fiche.statut : 'nouvelle', { aide: 'Confirmée seulement après l\'avoir reproduite. Sans suite si ce n\'était pas un défaut.' })}
        </div>
        <div class="groupe"><label class="etiquette-champ" for="ed-scenario">Scénario concerné <span class="facultatif">(facultatif)</span></label>
          <select class="select" id="ed-scenario" name="scenario"><option value="">Aucun</option>${scen.map((x) => `<option value="${echapper(x.ref)}"${fiche && fiche.scenario === x.ref ? ' selected' : ''}>${echapper(x.ref)} — ${echapper(x.titre)}</option>`).join('')}</select></div>
        <div class="groupe"><span class="etiquette-champ">Sur quoi</span>
          <div class="cases-blocs">${Object.entries(PLATEFORMES_TEST).map(([cle, x]) => `<label class="case"><input type="checkbox" data-plateforme-a="${echapper(cle)}"${prises.includes(cle) ? ' checked' : ''}> ${echapper(x.libelle)}</label>`).join('')}</div></div>
        ${zone('description', 'Ce qu\'on sait', fiche ? fiche.description : '', { facultatif: true, lignes: 5, placeholder: 'Les étapes pour la reproduire, dans l\'ordre. Ce qui se passe, ce qui devrait se passer.' })}
        ${fiche && (fiche.temoins || []).length ? `<p class="aide">${(fiche.temoins || []).length} témoin${(fiche.temoins || []).length > 1 ? 's' : ''} venu${(fiche.temoins || []).length > 1 ? 's' : ''} des testeurs : ils restent attachés, quoi que vous changiez ici.</p>` : ''}
        ${fiche ? `<div class="groupe" style="margin-top:8px"><button class="btn btn-doux btn-petit" type="button" data-supprimer>${icone('corbeille')} Supprimer cette anomalie</button></div>` : ''}`,
      regles: { titre: obligatoire() },
      surMontage: (racine) => {
        const b = racine.querySelector('[data-supprimer]');
        if (!b || !fiche) return;
        b.addEventListener('click', async () => {
          const ok = await confirmer({ titre: 'Supprimer cette anomalie ?', texte: (fiche.temoins || []).length ? 'Les témoins des testeurs seront perdus avec elle. Pour un défaut qui n\'en était pas un, préférez le statut « sans suite ».' : 'Elle disparaît de la page du client aussi.', ok: 'Supprimer', danger: true });
          if (!ok) return;
          await ecrire.supprimerAnomalie(pid, fiche.id);
          toast('Anomalie supprimée.');
          const fermer = racine.querySelector('[data-fermer]');
          if (fermer) fermer.click();
        });
      },
      enregistrer: async (d, pieces, racine) => {
        const plateformes = [...racine.querySelectorAll('[data-plateforme-a]:checked')].map((c) => c.dataset.plateformeA);
        const donnees = {
          titre: d.titre, gravite: d.gravite, statut: d.statut,
          scenario: d.scenario || '', plateformes, description: d.description || '',
        };
        if (fiche) await ecrire.majAnomalie(pid, fiche.id, donnees);
        else await ecrire.creerAnomalie(pid, donnees);
        toast(fiche ? 'Anomalie enregistrée.' : 'Anomalie posée.');
        return true;
      },
    });
  },

  /* --- La maintenance continue ------------------------------------------
     Le contrat d'abord : ce que le client lit dans « Modalités », mot pour
     mot. Puis les séquences, les journées, les évolutions. */
  maintenance: (env, { pid, fiche }) => {
    const f = fiche || {};
    const lignes = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
    return feuille({
      titre: fiche ? 'Le forfait de maintenance' : 'Configurer un forfait de maintenance',
      sousTitre: 'Ce que le client lit dans son espace Maintenance, mot pour mot.',
      libelle: fiche ? 'Enregistrer' : 'Configurer',
      corps: `
        <div class="forme-rang">
          ${champ('formule', 'Nom de la formule', f.formule || '', { placeholder: 'Sérénité, Essentiel, Sur mesure...' })}
          ${select('statut', 'Statut', STATUTS_MAINTENANCE, f.statut || 'proposition', { aide: 'En « proposition envoyée », le client reçoit un e-mail et lit les modalités. En « en cours », le forfait tourne.' })}
        </div>
        <div class="forme-rang">
          ${champ('montant', 'Montant HT par période (€)', f.montant ?? '', { type: 'number', attrs: 'min="0" step="1"' })}
          ${champ('jours', 'Jours de travail par période', f.jours ?? '', { type: 'number', attrs: 'min="0" step="0.5"', aide: 'Ce qui est compris dans le forfait, à chaque période.' })}
        </div>
        <div class="forme-rang">
          ${select('reconduction', 'La période', RECONDUCTIONS_MAINTENANCE, f.reconduction || 'mensuelle')}
          ${select('devis', 'Le devis du forfait', devisDe(pid), f.devis || '', { vide: 'Aucun', aide: 'Son acceptation coche le troisième pas. Ses lignes en étapes se cochent sur la page Maintenance.' })}
        </div>
        <div class="forme-rang">
          ${champ('debut', 'Début', f.debut ? dateISO(f.debut) : '', { type: 'date', facultatif: true })}
          ${champ('fin', 'Fin, ou prochaine échéance', f.fin ? dateISO(f.fin) : '', { type: 'date', facultatif: true })}
        </div>
        <div class="forme-rang">
          ${champ('horaires', 'Jours et heures', f.horaires || '', { facultatif: true, placeholder: 'Du lundi au vendredi, de 9 h à 18 h' })}
          ${champ('delaiReponse', 'Délai de réponse', f.delaiReponse || '', { facultatif: true, placeholder: 'Sous 24 h ouvrées' })}
        </div>
        ${champ('delaiCorrection', 'Correction d\'un défaut bloquant', f.delaiCorrection || '', { facultatif: true, placeholder: 'Sous 48 h ouvrées' })}
        ${zone('inclus', 'Compris dans le forfait', (f.inclus || []).join('\n'), { facultatif: true, aide: 'Une ligne par point.', placeholder: 'Corrections de défauts\nMises à jour iOS et Android\nSurveillance des plantages\nPetites évolutions dans les jours du forfait' })}
        ${zone('exclus', 'Sur devis à part', (f.exclus || []).join('\n'), { facultatif: true, aide: 'Une ligne par point.', placeholder: 'Nouvelle fonctionnalité majeure\nRefonte graphique' })}
        ${zone('modalites', 'Comment ça se passe, en toutes lettres', f.modalites || '', { facultatif: true, lignes: 6, placeholder: 'La demande, la priorité, le report des jours non consommés, la facturation, la résiliation.' })}
        ${fiche ? `<div class="groupe" style="margin-top:8px"><button class="btn btn-doux btn-petit" type="button" data-supprimer>${icone('corbeille')} Retirer le forfait</button></div>` : ''}`,
      regles: { formule: obligatoire() },
      surMontage: (racine) => {
        const b = racine.querySelector('[data-supprimer]');
        if (!b || !fiche) return;
        b.addEventListener('click', async () => {
          const ok = await confirmer({ titre: 'Retirer le forfait ?', texte: 'Les séquences, les journées et les évolutions partent avec lui. Pour une pause, préférez le statut « suspendu ».', ok: 'Retirer', danger: true });
          if (!ok) return;
          await ecrire.supprimerMaintenance(pid);
          toast('Forfait retiré.');
          const fermer = racine.querySelector('[data-fermer]');
          if (fermer) fermer.click();
        });
      },
      enregistrer: async (d) => {
        const donnees = {
          formule: d.formule, statut: d.statut,
          montant: d.montant === '' || d.montant === undefined ? null : Number(d.montant),
          jours: d.jours === '' || d.jours === undefined ? null : Number(d.jours),
          reconduction: d.reconduction, devis: d.devis || '',
          debut: d.debut ? new Date(d.debut) : null, fin: d.fin ? new Date(d.fin) : null,
          horaires: d.horaires || '', delaiReponse: d.delaiReponse || '', delaiCorrection: d.delaiCorrection || '',
          inclus: lignes(d.inclus), exclus: lignes(d.exclus), modalites: d.modalites || '',
        };
        await ecrire.poserContratMaintenance(pid, donnees, { neuf: !fiche });
        toast(fiche ? 'Forfait enregistré.' : 'Forfait configuré. Le client le lit dans son espace.');
        return true;
      },
    });
  },

  sequence: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La séquence' : 'Nouvelle séquence', sousTitre: 'Une période du forfait, avec ses jours.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Octobre 2026' })}
      <div class="forme-rang">
        ${champ('debut', 'Début', fiche ? dateISO(fiche.debut) : '', { type: 'date', facultatif: true })}
        ${champ('fin', 'Fin', fiche ? dateISO(fiche.fin) : '', { type: 'date', facultatif: true })}
      </div>
      <div class="forme-rang">
        ${champ('jours', 'Jours prévus', fiche ? (fiche.jours ?? '') : (defaut.jours ?? ''), { type: 'number', attrs: 'min="0" step="0.25"', aide: 'Vide : les jours du forfait.' })}
        ${select('statut', 'Statut', STATUTS_SEQUENCE, fiche ? fiche.statut : (defaut.statut || 'a-venir'))}
      </div>
      ${zone('note', 'Une note', fiche ? fiche.note : '', { facultatif: true, lignes: 2, placeholder: 'Ce qui est prévu dans cette période.' })}
      ${fiche ? `<div class="groupe" style="margin-top:8px"><button class="btn btn-doux btn-petit" type="button" data-supprimer>${icone('corbeille')} Supprimer cette séquence</button></div>` : ''}`,
    regles: { titre: obligatoire() },
    surMontage: (racine) => brancherSuppression(racine, fiche, pid, 'cette séquence', 'Les journées qui y sont rattachées restent, sans séquence.'),
    enregistrer: async (d) => {
      const donnees = { genre: 'sequence', titre: d.titre, statut: d.statut, note: d.note || '', debut: d.debut ? new Date(d.debut) : null, fin: d.fin ? new Date(d.fin) : null, jours: d.jours === '' ? null : Number(d.jours) };
      if (fiche) await ecrire.majElementMaintenance(pid, fiche.id, donnees); else await ecrire.creerElementMaintenance(pid, donnees);
      toast(fiche ? 'Séquence enregistrée.' : 'Séquence ouverte.');
      return true;
    },
  }),

  journee: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La journée' : 'Nouvelle journée', sousTitre: 'Un jour travaillé, et ce qu\'on y a fait.',
    corps: `
      <div class="forme-rang">
        ${champ('date', 'Date', fiche ? dateISO(fiche.date) : dateISO(new Date()), { type: 'date' })}
        ${select('duree', 'Durée', DUREES_JOURNEE, fiche ? String(fiche.duree ?? '1') : '1')}
      </div>
      <div class="forme-rang">
        ${select('sequence', 'Séquence', sequencesDe(pid), fiche ? fiche.sequence : (defaut.sequence || ''), { vide: 'Aucune' })}
        ${select('statut', 'Statut', STATUTS_JOURNEE, fiche ? fiche.statut : (defaut.statut || 'faite'))}
      </div>
      ${select('evolution', 'Évolution concernée', evolutionsDe(pid), fiche ? fiche.evolution : '', { vide: 'Aucune' })}
      ${zone('objet', 'Ce qui a été fait', fiche ? fiche.objet : '', { lignes: 3, placeholder: 'Mise à jour iOS 27, correction du rappel de fin de mois.' })}
      ${fiche ? `<div class="groupe" style="margin-top:8px"><button class="btn btn-doux btn-petit" type="button" data-supprimer>${icone('corbeille')} Supprimer cette journée</button></div>` : ''}`,
    regles: { objet: obligatoire('Dites ce qui a été fait, même en trois mots.') },
    surMontage: (racine) => brancherSuppression(racine, fiche, pid, 'cette journée', 'Elle ne comptera plus dans sa séquence.'),
    enregistrer: async (d) => {
      const donnees = { genre: 'journee', date: d.date ? new Date(d.date) : null, duree: Number(d.duree) || 1, sequence: d.sequence || '', evolution: d.evolution || '', statut: d.statut, objet: d.objet || '' };
      if (fiche) await ecrire.majElementMaintenance(pid, fiche.id, donnees); else await ecrire.creerElementMaintenance(pid, donnees);
      toast(fiche ? 'Journée enregistrée.' : 'Journée consignée.');
      return true;
    },
  }),

  evolution: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'L\'évolution' : 'Nouvelle évolution', sousTitre: fiche && fiche.origine === 'client' ? `Proposée par ${(fiche.par || {}).nom || 'le client'}.` : 'Ce qu\'on ajoute à l\'application.',
    corps: `
      ${champ('titre', 'En une ligne', fiche ? fiche.titre : (defaut.titre || ''), { placeholder: 'Exporter les tâches en tableur' })}
      ${zone('description', 'L\'idée', fiche ? fiche.description : '', { facultatif: true, lignes: 4 })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_EVOLUTION, fiche ? fiche.statut : (defaut.statut || 'proposee'), { aide: 'Acceptée : on la fera. Planifiée : elle a sa séquence. Livrée : elle est dans l\'application. Écartée : on ne la fera pas.' })}
        ${champ('estimation', 'Estimation (jours)', fiche ? (fiche.estimation ?? '') : '', { type: 'number', facultatif: true, attrs: 'min="0" step="0.25"' })}
      </div>
      <div class="forme-rang">
        ${select('sequence', 'Séquence', sequencesDe(pid), fiche ? fiche.sequence : '', { vide: 'Aucune' })}
        ${champ('version', 'Version livrée', fiche ? fiche.version : '', { facultatif: true, placeholder: '1.3.0' })}
      </div>
      ${zone('reponse', 'Ce qu\'on en dit au client', fiche ? fiche.reponse : '', { facultatif: true, lignes: 3, placeholder: 'Pourquoi on l\'accepte, ou pourquoi on l\'écarte. Le client le lit sur la fiche.' })}
      ${fiche ? `<div class="groupe" style="margin-top:8px"><button class="btn btn-doux btn-petit" type="button" data-supprimer>${icone('corbeille')} Supprimer cette évolution</button></div>` : ''}`,
    regles: { titre: obligatoire() },
    surMontage: (racine) => brancherSuppression(racine, fiche, pid, 'cette évolution', fiche && fiche.origine === 'client' ? 'Le client l\'a proposée : préférez « écartée » avec une raison.' : 'Elle disparaît de la page du client aussi.'),
    enregistrer: async (d) => {
      const donnees = { genre: 'evolution', titre: d.titre, description: d.description || '', statut: d.statut, estimation: d.estimation === '' ? null : Number(d.estimation), sequence: d.sequence || '', version: d.version || '', reponse: d.reponse || '' };
      if (fiche) await ecrire.majElementMaintenance(pid, fiche.id, donnees);
      else await ecrire.creerElementMaintenance(pid, { ...donnees, origine: 'equipe' });
      toast(fiche ? 'Évolution enregistrée.' : 'Évolution posée.');
      return true;
    },
  }),

  jalon: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? "L'étape" : 'Nouvelle étape', sousTitre: 'Une étape de la feuille de route.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Développement' })}
      ${champ('phase', 'Phase', fiche ? fiche.phase : (defaut.phase || ''), { facultatif: true, placeholder: 'Cadrage, Design, Développement, Tests, Publication...' })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_ETAPE, fiche ? fiche.statut : 'a-venir')}
        ${champ('progression', 'Progression (%)', fiche ? borner(fiche.progression) : 0, { type: 'number', attrs: 'min="0" max="100"' })}
      </div>
      <div class="forme-rang">
        ${champ('debut', 'Début', fiche ? dateISO(fiche.debut) : '', { type: 'date', facultatif: true })}
        ${champ('fin', 'Fin prévue', fiche ? dateISO(fiche.fin) : '', { type: 'date', facultatif: true })}
      </div>
      ${blocReport('fin', fiche && fiche.fin)}
      <div class="forme-rang">
        ${champ('ordre', 'Ordre', fiche ? fiche.ordre : (defaut.ordre || 0), { type: 'number' })}
        ${select('responsable', 'Responsable', equipeCarte(), fiche ? fiche.responsable : '', { vide: 'Non défini' })}
      </div>
      <div class="forme-rang">
        ${select('devis', 'Ligne du devis', Object.fromEntries((magasin.lire(K.documents(pid)) || []).concat(magasin.lire(K.documentsTous) || []).filter((x, i, l) => x.type === 'devis' && x.projet === pid && l.findIndex((y) => y.id === x.id) === i).map((x) => [x.id, { libelle: `${x.numero || 'Devis'} · ${x.libelle || ''}` }])), fiche ? fiche.devis : (defaut.devis || ''), { vide: 'Aucun', aide: "Rattachée à un devis, l'étape apparaît sur sa frise et se coche comme une ligne livrée." })}
        ${champ('montant', 'Montant HT (€)', fiche ? (fiche.montant || '') : (defaut.montant || ''), { type: 'number', facultatif: true, attrs: 'min="0" step="1"' })}
      </div>
      <div class="groupe"><label class="etiquette-champ" for="ed-composants">Parties concernées</label>
        <select class="select" id="ed-composants" name="composants" multiple size="4">${optionsMultiples(composantsDe(pid), (fiche && fiche.composants) || [])}</select>
        <p class="aide">Maintenez ⌘ ou Ctrl pour en choisir plusieurs.</p></div>
      ${zone('description', 'Description', fiche ? fiche.description : '', { facultatif: true, lignes: 3 })}`,
    surMontage: brancherReport,
    regles: { titre: obligatoire() },
    enregistrer: async (d) => {
      const donnees = {
        ...d, progression: borner(d.progression),
        debut: d.debut ? new Date(d.debut) : null, fin: d.fin ? new Date(d.fin) : null,
        reports: reportsMaj(fiche, 'fin', d.fin, d, env.session),
        devis: d.devis || '', montant: d.montant === '' || d.montant === undefined ? null : Number(d.montant),
      };
      delete donnees.reportMotif; delete donnees.reportNote;
      if (fiche) await ecrire.majJalon(pid, fiche.id, donnees); else await ecrire.creerJalon(pid, donnees);
      toast(fiche ? 'Étape mise à jour.' : 'Étape créée.');
    },
  }),

  tache: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La tâche' : 'Nouvelle tâche', sousTitre: fiche ? fiche.titre : '',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : (defaut.titre || ''))}
      ${zone('description', 'Description', fiche ? fiche.description : '', { facultatif: true, lignes: 3 })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_TACHE, fiche ? fiche.statut : (defaut.statut || 'a-faire'))}
        ${select('priorite', 'Priorité', PRIORITES, fiche ? fiche.priorite : 'normale')}
      </div>
      <div class="forme-rang">
        ${select('assigne', 'Assignée à', equipeCarte(), fiche ? fiche.assigne : (env.session.equipe.uid), { vide: 'Personne' })}
        ${champ('echeance', 'Échéance', fiche ? dateISO(fiche.echeance) : '', { type: 'date', facultatif: true })}
      </div>
      <div class="forme-rang">
        ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : (defaut.composant || ''), { vide: 'Aucune' })}
        ${select('jalon', 'Étape', jalonsDe(pid), fiche ? fiche.jalon : (defaut.jalon || ''), { vide: 'Aucune' })}
      </div>
      <div class="forme-rang">
        ${champ('estimation', 'Estimation', fiche ? fiche.estimation : '', { facultatif: true, placeholder: '2 j' })}
        ${champ('progression', 'Progression (%)', fiche ? borner(fiche.progression) : 0, { type: 'number', attrs: 'min="0" max="100"' })}
      </div>
      ${zone('checklist', 'Liste de contrôle', fiche ? (fiche.checklist || []).map((c) => `${c.fait ? '[x] ' : ''}${c.texte}`).join('\n') : '', { facultatif: true, aide: 'Une ligne par point. Commencez par [x] pour un point déjà fait.', lignes: 3 })}
      ${visibilite(fiche ? fiche.visibilite : (defaut.visibilite || 'client'))}`,
    regles: { titre: obligatoire() },
    enregistrer: async (d) => {
      const checklist = d.checklist ? d.checklist.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ fait: /^\[x\]/i.test(l), texte: l.replace(/^\[[ x]?\]\s*/i, '') })) : [];
      const donnees = { ...d, checklist, progression: borner(d.progression), echeance: d.echeance ? new Date(d.echeance) : null, ticket: fiche ? fiche.ticket : (defaut.ticket || '') };
      if (fiche) await ecrire.majTache(fiche.id, donnees); else await ecrire.creerTache(env.session, pid, donnees);
      toast(fiche ? 'Tâche mise à jour.' : 'Tâche créée.');
    },
  }),

  lien: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'Le lien' : 'Nouveau lien', sousTitre: 'Un environnement, un dépôt, une maquette.',
    corps: `
      ${champ('nom', 'Nom', fiche ? fiche.nom : '', { placeholder: 'App Store' })}
      ${champ('url', 'Adresse', fiche ? fiche.url : '', { type: 'url', placeholder: 'https://' })}
      <div class="forme-rang">
        ${select('categorie', 'Catégorie', CATEGORIES_LIEN, fiche ? fiche.categorie : 'production')}
        ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucune' })}
      </div>
      ${champ('environnement', 'Environnement', fiche ? fiche.environnement : '', { facultatif: true, placeholder: 'Production, Staging, TestFlight' })}
      ${champ('description', 'Description', fiche ? fiche.description : '', { facultatif: true })}
      ${visibilite(fiche ? fiche.visibilite : 'client')}
      <p class="aide">Jamais de mot de passe, de jeton ni de clé dans un lien ou sa description.</p>`,
    regles: { nom: obligatoire(), url: (v) => obligatoire()(v) || urlValide()(v) },
    enregistrer: async (d) => {
      if (fiche) await ecrire.majLien(pid, fiche.id, d); else await ecrire.creerLien(pid, d);
      toast(fiche ? 'Lien mis à jour.' : 'Lien ajouté.');
    },
  }),

  release: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La version' : 'Nouvelle version', sousTitre: 'Ce qui change, dit au client.',
    corps: `
      <div class="forme-rang">
        ${champ('version', 'Version', fiche ? fiche.version : '', { placeholder: '2.4.1' })}
        ${select('plateforme', 'Plateforme', PLATEFORMES_CHOIX, fiche ? fiche.plateforme : (defaut.plateforme || 'ios'))}
      </div>
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { facultatif: true, placeholder: 'Nouveau profil et corrections' })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_RELEASE, fiche ? fiche.statut : 'developpement')}
        ${champ('date', 'Date', fiche ? dateISO(fiche.date) : dateISO(new Date()), { type: 'date' })}
      </div>
      ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucune' })}
      ${zone('notes', 'Changements', fiche ? (fiche.notes || []).map((n) => `${n.type}: ${n.texte}`).join('\n') : '', { aide: 'Une ligne par changement, précédée de nouveau:, amelioration:, correction: ou technique:.', lignes: 5, placeholder: 'correction: Connexion Apple\nnouveau: Profil' })}
      <div class="forme-rang">
        ${champ('lienStore', 'Lien App Store / Play', fiche ? (fiche.liens || {}).store : '', { type: 'url', facultatif: true })}
        ${champ('lienTest', 'Lien de test', fiche ? (fiche.liens || {}).test : '', { type: 'url', facultatif: true })}
      </div>
      ${visibilite(fiche ? fiche.visibilite : 'client')}`,
    regles: { version: obligatoire(), lienStore: urlValide(), lienTest: urlValide() },
    enregistrer: async (d) => {
      const notes = d.notes ? d.notes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^(nouveau|amelioration|correction|technique)\s*:\s*(.+)$/i);
        return m ? { type: m[1].toLowerCase(), texte: m[2].trim() } : { type: 'amelioration', texte: l };
      }) : [];
      const donnees = { version: d.version, plateforme: d.plateforme, titre: d.titre, statut: d.statut, date: d.date ? new Date(d.date) : null, composant: d.composant, notes, liens: { store: d.lienStore, test: d.lienTest }, visibilite: d.visibilite };
      if (fiche) await ecrire.majRelease(fiche.id, donnees); else await ecrire.creerRelease(env.session, pid, donnees);
      toast(fiche ? 'Version mise à jour.' : 'Version créée.');
    },
  }),

  reunion: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'La réunion' : 'Nouvelle réunion', sousTitre: 'Programmée, elle prévient le client.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Point hebdomadaire' })}
      <div class="forme-rang">
        ${champ('date', 'Date et heure', fiche ? dateHeureISO(fiche.date) : '', { type: 'datetime-local' })}
        ${champ('duree', 'Durée (minutes)', fiche ? fiche.duree : 45, { type: 'number' })}
      </div>
      ${champ('lien', 'Lien de visioconférence', fiche ? fiche.lien : '', { type: 'url', facultatif: true, placeholder: 'https://meet.google.com/...' })}
      ${champ('participants', 'Participants', fiche ? (fiche.participants || []).map((p) => p.nom || p.email).join(', ') : '', { facultatif: true, aide: 'Séparés par des virgules.' })}
      ${zone('ordreDuJour', "Ordre du jour", fiche ? fiche.ordreDuJour : '', { facultatif: true, lignes: 3 })}
      ${zone('compteRendu', 'Compte rendu', fiche ? fiche.compteRendu : '', { facultatif: true, lignes: 4 })}
      ${zone('decisions', 'Décisions prises', fiche ? fiche.decisions : '', { facultatif: true, lignes: 2 })}
      ${zone('actions', 'Actions à réaliser', fiche ? (fiche.actions || []).map((a) => `${a.fait ? '[x] ' : ''}${a.texte}`).join('\n') : '', { facultatif: true, aide: 'Une ligne par action.', lignes: 2 })}
      ${visibilite(fiche ? fiche.visibilite : 'client')}`,
    regles: { titre: obligatoire(), date: obligatoire('Une réunion a une date.'), lien: urlValide() },
    enregistrer: async (d) => {
      const donnees = {
        ...d, date: new Date(d.date), duree: Number(d.duree) || 45,
        participants: d.participants ? d.participants.split(',').map((p) => p.trim()).filter(Boolean).map((nom) => ({ nom })) : [],
        actions: d.actions ? d.actions.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ fait: /^\[x\]/i.test(l), texte: l.replace(/^\[[ x]?\]\s*/i, '') })) : [],
      };
      if (fiche) await ecrire.majReunion(fiche.id, donnees); else await ecrire.creerReunion(env.session, pid, donnees);
      toast(fiche ? 'Réunion mise à jour.' : 'Réunion programmée.');
    },
  }),

  note: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'La note' : 'Nouvelle note', sousTitre: 'Une décision, une information, un risque : ce qui ne doit pas se perdre.',
    corps: `
      <div class="forme-rang">
        ${select('type', 'Nature', TYPES_NOTE, fiche ? fiche.type : 'decision')}
        ${champ('date', 'Date', fiche ? dateISO(fiche.date) : dateISO(new Date()), { type: 'date' })}
      </div>
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Conserver Stripe pour les paiements' })}
      ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : (defaut.composant || ''), { vide: 'Tout le projet', aide: 'La note remonte alors sur la page de cette partie.' })}
      ${zone('contenu', 'Contenu', fiche ? fiche.contenu : '', { lignes: 4 })}
      ${champ('decidePar', 'Décidé par', fiche ? fiche.decidePar : '', { facultatif: true, placeholder: 'Les personnes qui ont tranché' })}
      ${zone('contexte', 'Contexte', fiche ? fiche.contexte : '', { facultatif: true, lignes: 2 })}
      ${zone('impact', 'Impact', fiche ? fiche.impact : '', { facultatif: true, lignes: 2 })}
      ${visibilite(fiche ? fiche.visibilite : 'client')}`,
    regles: { titre: obligatoire(), contenu: obligatoire() },
    enregistrer: async (d) => {
      const donnees = { ...d, date: d.date ? new Date(d.date) : new Date() };
      if (fiche) await ecrire.majNote(fiche.id, donnees); else await ecrire.creerNote(env.session, pid, donnees);
      toast(fiche ? 'Note mise à jour.' : 'Note enregistrée.');
    },
  }),

  blocage: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'Le point bloquant' : 'Nouveau point bloquant', sousTitre: 'Court, factuel, avec un responsable.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Publication Android bloquée' })}
      ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : (defaut.composant || ''), { vide: 'Tout le projet', aide: 'Le point remonte alors sur la page de cette partie.' })}
      ${zone('description', 'Description', fiche ? fiche.description : '', { lignes: 3, placeholder: 'Attente du compte développeur client.' })}
      <div class="forme-rang">
        ${select('responsable', 'Responsable', { client: 'Le client', capmedia: 'Capmedia', tiers: 'Un tiers' }, fiche ? fiche.responsable : 'client')}
        ${champ('depuis', 'Depuis le', fiche ? dateISO(fiche.depuis) : dateISO(new Date()), { type: 'date' })}
      </div>
      ${champ('impact', 'Impact', fiche ? fiche.impact : '', { facultatif: true, placeholder: 'Publication Android retardée.' })}
      ${visibilite(fiche ? fiche.visibilite : 'client')}`,
    regles: { titre: obligatoire() },
    enregistrer: async (d) => {
      const donnees = { ...d, depuis: d.depuis ? new Date(d.depuis) : new Date() };
      if (fiche) await ecrire.majBlocage(fiche.id, donnees); else await ecrire.creerBlocage(pid, donnees);
      toast(fiche ? 'Point bloquant mis à jour.' : 'Point bloquant signalé.');
    },
  }),

  validation: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: 'Demander une validation', sousTitre: 'Le client reçoit un e-mail et retrouve la demande dans « À valider ».',
    corps: `
      ${champ('titre', 'Titre', defaut.titre || '', { placeholder: 'Valider la maquette du profil' })}
      ${select('type', 'Nature', TYPES_VALIDATION, defaut.type || 'autre')}
      ${zone('description', 'Ce que le client doit regarder', defaut.description || '', { lignes: 4 })}
      ${champ('echeance', 'Réponse souhaitée avant le', '', { type: 'date', facultatif: true })}`,
    regles: { titre: obligatoire(), description: obligatoire() },
    avecDepot: { chemin: `projets/${pid}/documents/validations`, texte: 'Ajoutez une maquette, une capture, un document.' },
    libelle: 'Envoyer la demande',
    enregistrer: async (d, pieces) => {
      await ecrire.creerValidation(env.session, pid, { ...d, cible: defaut.cible || null }, pieces);
      toast('Demande de validation envoyée.');
    },
  }),

  fichier: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'Le fichier' : 'Déposer des fichiers', sousTitre: fiche ? fiche.nom : 'Rangés par catégorie, visibles ou non par le client.',
    corps: `
      <div class="forme-rang">
        ${select('categorie', 'Catégorie', CATEGORIES_FICHIER, fiche ? fiche.categorie : 'livrables')}
        ${select('composant', 'Partie du projet', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucune' })}
      </div>
      ${champ('description', 'Description', fiche ? fiche.description : '', { facultatif: true })}
      ${champ('version', 'Version', fiche ? fiche.version : '', { facultatif: true, placeholder: 'v2' })}
      ${champ('tags', 'Mots-clés', fiche ? (fiche.tags || []).join(', ') : '', { facultatif: true, aide: 'Séparés par des virgules.' })}
      ${visibilite(fiche ? fiche.visibilite : 'client')}`,
    avecDepot: fiche ? null : { chemin: `projets/${pid}/documents/fichiers`, max: 20 },
    libelle: fiche ? 'Enregistrer' : 'Déposer',
    enregistrer: async (d, pieces) => {
      const options = { ...d, tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] };
      if (fiche) { await ecrire.majFichier(fiche.id, options); toast('Fichier mis à jour.'); return; }
      if (!pieces.length) throw new Error('Choisissez au moins un fichier.');
      for (const p of pieces) await ecrire.deposerFichier(env.session, pid, p, options);
      toast(pieces.length > 1 ? `${pieces.length} fichiers déposés.` : 'Fichier déposé.');
    },
  }),

  'demande-pilotage': (env, { pid, fiche }) => feuille({
    titre: 'Piloter la demande', sousTitre: fiche.numero || fiche.titre,
    corps: `
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS, fiche.statut)}
        ${select('urgence', 'Urgence', URGENCES, fiche.urgence)}
      </div>
      <div class="forme-rang">
        ${select('assigne', 'Assignée à', equipeCarte(), fiche.assigne || '', { vide: 'Personne' })}
        ${select('composant', 'Partie du projet', composantsDe(pid), fiche.composant || '', { vide: 'Aucune' })}
      </div>
      <div class="forme-rang">
        ${select('qualification', 'Qualification', QUALIFICATIONS, fiche.qualification || '', { vide: 'Pas encore qualifiée', aide: 'Hors périmètre ou à chiffrer : le client en est informé.' })}
        ${select('plateforme', 'Plateforme', PLATEFORMES_CHOIX, fiche.plateforme || '')}
      </div>
      ${select('release', 'Livrée dans la version', releasesDe(pid), fiche.release || '', { vide: 'Pas encore fixée', aide: "Le client lit le nom de la version qui porte la correction, au lieu de le demander." })}
      ${champ('titre', 'Titre', fiche.titre)}`,
    regles: { titre: obligatoire(), plateforme: () => '' },
    enregistrer: async (d) => {
      const changements = { statut: d.statut, urgence: d.urgence, assigne: d.assigne || null, composant: d.composant, qualification: d.qualification || null, plateforme: d.plateforme, titre: d.titre, release: d.release || null };
      if (d.statut === 'resolu' && fiche.statut !== 'resolu') changements.resolu = new Date();
      await ecrire.majDemande(fiche.id, changements);
      toast('Demande mise à jour.');
    },
  }),
};

/** Ouvre l'éditeur d'un genre. Résout true (ou l'identifiant) si enregistré. */
/* L'écho français se met à jour à chaque frappe, une fois pour toutes. */
if (typeof document !== 'undefined' && !document.__echoDates) {
  document.__echoDates = true;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches('[data-date-fr]')) return;
    const echo = document.querySelector(`[data-echo-pour="${el.id}"]`);
    if (echo) echo.textContent = el.value ? lisibleDate(el.value) : 'Aucune date';
  });
}

export const editer = (genre, env, options = {}) => {
  const fabrique = editeurs[genre];
  if (!fabrique) { toast(`Éditeur inconnu : ${genre}`, 'erreur'); return Promise.resolve(undefined); }
  if (env.role !== 'equipe') { toast("Cette action est réservée à l'équipe.", 'erreur'); return Promise.resolve(undefined); }
  return fabrique(env, options);
};

/** Supprime après confirmation. */
export const supprimer = async (genre, env, { pid, fiche, libelle }) => {
  const ok = await confirmer({ titre: `Supprimer ${libelle || 'cet élément'} ?`, texte: 'Cette action ne se rattrape pas. Préférez archiver quand c\'est possible.', ok: 'Supprimer', danger: true });
  if (!ok) return false;
  try {
    if (genre === 'composant') await ecrire.supprimerComposant(pid, fiche.id);
    else if (genre === 'jalon') await ecrire.supprimerJalon(pid, fiche.id);
    else if (genre === 'lien') await ecrire.supprimerLien(pid, fiche.id);
    else if (genre === 'tache') await ecrire.supprimerTache(fiche.id);
    else if (genre === 'release') await ecrire.supprimerRelease(fiche.id);
    else if (genre === 'reunion') await ecrire.supprimerReunion(fiche.id);
    else if (genre === 'note') await ecrire.supprimerNote(fiche.id);
    else if (genre === 'blocage') await ecrire.supprimerBlocage(fiche.id);
    else if (genre === 'scenario') await ecrire.supprimerScenario(pid, fiche.ref);
    else if (genre === 'campagne') await ecrire.supprimerCampagne(pid, fiche.id);
    else if (genre === 'parcours') await ecrire.supprimerParcours(pid, fiche.ref);
    toast('Supprimé.');
    return true;
  } catch (e) { toast(lisible(e), 'erreur'); return false; }
};

void longueurMax; void enDate; void TYPES_CHANGEMENT;
