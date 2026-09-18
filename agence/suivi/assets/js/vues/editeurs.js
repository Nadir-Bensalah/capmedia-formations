/* ==========================================================================
   Les éditeurs de l'équipe : un formulaire par genre d'objet, dans une
   feuille latérale. Chacun lit, valide, écrit, et dit ce qu'il a fait.
   Le client n'y a jamais accès : les règles refuseraient de toute façon.
   ========================================================================== */

import {
  echapper, dateISO, dateHeureISO, borner, enDate,
  TYPES_COMPOSANT, STATUTS_COMPOSANT, STATUTS_JALON, STATUTS_TACHE, PRIORITES, CATEGORIES_LIEN,
  STATUTS_RELEASE, TYPES_CHANGEMENT, TYPES_NOTE, TYPES_VALIDATION, CATEGORIES_FICHIER,
  STATUTS_PROJET, TYPES_PROJET, SANTES, STATUTS, URGENCES, QUALIFICATIONS, PLATEFORMES,
} from '../noyau.js';
import { modale, confirmer, toast, lireForme, valider, obligatoire, longueurMax, urlValide, optionsDe, depot, agir, lisible } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';

const $ = (s, r = document) => r.querySelector(s);

const champ = (nom, libelle, valeur = '', { type = 'text', aide = '', placeholder = '', facultatif = false, attrs = '' } = {}) => `
  <div class="groupe">
    <label class="etiquette-champ" for="ed-${nom}">${echapper(libelle)}${facultatif ? ' <span class="facultatif">(facultatif)</span>' : ''}</label>
    <input class="champ" id="ed-${nom}" name="${nom}" type="${type}" value="${echapper(valeur ?? '')}" placeholder="${echapper(placeholder)}" ${attrs}>
    ${aide ? `<p class="aide">${echapper(aide)}</p>` : ''}
  </div>`;
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

const composantsDe = (pid) => (magasin.lire(K.composants(pid)) || []).reduce((c, x) => ({ ...c, [x.id]: x.nom }), {});
const jalonsDe = (pid) => (magasin.lire(K.jalons(pid)) || []).reduce((c, x) => ({ ...c, [x.id]: x.titre }), {});
const equipeCarte = () => (magasin.lire(K.equipe) || []).reduce((c, x) => ({ ...c, [x.id]: x.nom || x.email }), {});

/** Ouvre une feuille, branche le formulaire, résout la valeur d'`enregistrer`. */
const feuille = ({ titre, sousTitre, corps, enregistrer, libelle = 'Enregistrer', regles = {}, avecDepot = null }) => {
  const m = modale({
    titre, sousTitre, feuille: true,
    corps: `<form class="forme" id="ed-forme" novalidate>${corps}${avecDepot ? '<div id="ed-depot"></div>' : ''}</form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="ed-forme">${echapper(libelle)}</button>`,
  });
  let boiteDepot = null;
  if (avecDepot) boiteDepot = depot($('#ed-depot', m.el), avecDepot);
  const forme = $('#ed-forme', m.el);
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, regles)) return;
    if (boiteDepot && boiteDepot.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const bouton = $('button[type="submit"]', m.pied);
    const ok = await agir(bouton, async () => {
      const resultat = await enregistrer(lireForme(forme), boiteDepot ? boiteDepot.pieces : []);
      m.fermer(resultat === undefined ? true : resultat);
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
      ${champ('nom', 'Nom', fiche.nom)}
      ${select('statut', 'Statut', STATUTS_PROJET, fiche.statut || 'en-cours')}
      ${select('type', 'Type', TYPES_PROJET, fiche.type || 'application-mobile')}
      ${zone('description', 'Description', fiche.description, { facultatif: true, lignes: 3 })}
      <div class="forme-rang">
        ${champ('debut', 'Début', dateISO(fiche.debut), { type: 'date', facultatif: true })}
        ${champ('cible', 'Date cible', dateISO(fiche.cible), { type: 'date', facultatif: true })}
      </div>
      <div class="forme-rang">
        ${select('progressionMode', 'Progression', { manuel: 'Saisie à la main', jalons: 'Calculée sur les jalons' }, (fiche.progression || {}).mode || 'manuel')}
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
      ${champ('pulseAttenteClient', 'Attente client', (fiche.pulse || {}).attenteClient, { facultatif: true, placeholder: 'Laissez vide si rien' })}`,
    regles: { nom: obligatoire(), progressionValeur: (v) => (v !== null && (v < 0 || v > 100) ? 'Entre 0 et 100.' : '') },
    enregistrer: (d) => ecrire.majProjet(pid, {
      nom: d.nom, statut: d.statut, type: d.type, description: d.description,
      debut: d.debut ? new Date(d.debut) : null, cible: d.cible ? new Date(d.cible) : null,
      progression: { mode: d.progressionMode, valeur: borner(d.progressionValeur) },
      responsable: d.responsable, sante: d.sante,
      pulse: { enCours: d.pulseEnCours, derniereLivraison: d.pulseDerniereLivraison, prochaineEtape: d.pulseProchaineEtape, attenteClient: d.pulseAttenteClient },
    }).then(() => toast('Projet mis à jour.')),
  }),

  composant: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'Le composant' : 'Nouveau composant', sousTitre: fiche ? fiche.nom : 'Une brique du projet : iOS, Android, backend...',
    corps: `
      ${champ('nom', 'Nom', fiche ? fiche.nom : '', { placeholder: 'Application iOS' })}
      <div class="forme-rang">
        ${select('type', 'Type', TYPES_COMPOSANT, fiche ? fiche.type : 'ios')}
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
      ${champ('techno', 'Technologies', fiche ? (fiche.techno || []).join(', ') : '', { facultatif: true, aide: 'Séparées par des virgules.' })}
      ${zone('description', 'Description', fiche ? fiche.description : '', { facultatif: true, lignes: 3 })}`,
    regles: { nom: obligatoire() },
    enregistrer: async (d) => {
      const donnees = { ...d, techno: d.techno ? d.techno.split(',').map((t) => t.trim()).filter(Boolean) : [], progression: borner(d.progression) };
      if (fiche) await ecrire.majComposant(pid, fiche.id, donnees); else await ecrire.creerComposant(pid, donnees);
      toast(fiche ? 'Composant mis à jour.' : 'Composant créé.');
    },
  }),

  jalon: (env, { pid, fiche, defaut = {} }) => feuille({
    titre: fiche ? 'Le jalon' : 'Nouveau jalon', sousTitre: 'Une étape de la feuille de route.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Développement' })}
      ${champ('phase', 'Phase', fiche ? fiche.phase : (defaut.phase || ''), { facultatif: true, placeholder: 'Cadrage, Design, Développement, Tests, Publication...' })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_JALON, fiche ? fiche.statut : 'a-venir')}
        ${champ('progression', 'Progression (%)', fiche ? borner(fiche.progression) : 0, { type: 'number', attrs: 'min="0" max="100"' })}
      </div>
      <div class="forme-rang">
        ${champ('debut', 'Début', fiche ? dateISO(fiche.debut) : '', { type: 'date', facultatif: true })}
        ${champ('fin', 'Fin prévue', fiche ? dateISO(fiche.fin) : '', { type: 'date', facultatif: true })}
      </div>
      <div class="forme-rang">
        ${champ('ordre', 'Ordre', fiche ? fiche.ordre : (defaut.ordre || 0), { type: 'number' })}
        ${select('responsable', 'Responsable', equipeCarte(), fiche ? fiche.responsable : '', { vide: 'Non défini' })}
      </div>
      <div class="groupe"><label class="etiquette-champ" for="ed-composants">Composants concernés</label>
        <select class="select" id="ed-composants" name="composants" multiple size="4">${optionsDe(composantsDe(pid), '')}</select>
        <p class="aide">Maintenez ⌘ ou Ctrl pour en choisir plusieurs.</p></div>
      ${zone('description', 'Description', fiche ? fiche.description : '', { facultatif: true, lignes: 3 })}`,
    regles: { titre: obligatoire() },
    enregistrer: async (d) => {
      const donnees = { ...d, progression: borner(d.progression), debut: d.debut ? new Date(d.debut) : null, fin: d.fin ? new Date(d.fin) : null };
      if (fiche) await ecrire.majJalon(pid, fiche.id, donnees); else await ecrire.creerJalon(pid, donnees);
      toast(fiche ? 'Jalon mis à jour.' : 'Jalon créé.');
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
        ${select('composant', 'Composant', composantsDe(pid), fiche ? fiche.composant : (defaut.composant || ''), { vide: 'Aucun' })}
        ${select('jalon', 'Jalon', jalonsDe(pid), fiche ? fiche.jalon : (defaut.jalon || ''), { vide: 'Aucun' })}
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
        ${select('composant', 'Composant', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucun' })}
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

  release: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'La version' : 'Nouvelle version', sousTitre: 'Ce qui change, dit au client.',
    corps: `
      <div class="forme-rang">
        ${champ('version', 'Version', fiche ? fiche.version : '', { placeholder: '2.4.1' })}
        ${select('plateforme', 'Plateforme', { ios: 'iOS', android: 'Android', web: 'Web', backend: 'Backend', admin: 'Tableau de bord' }, fiche ? fiche.plateforme : 'ios')}
      </div>
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { facultatif: true, placeholder: 'Nouveau profil et corrections' })}
      <div class="forme-rang">
        ${select('statut', 'Statut', STATUTS_RELEASE, fiche ? fiche.statut : 'developpement')}
        ${champ('date', 'Date', fiche ? dateISO(fiche.date) : dateISO(new Date()), { type: 'date' })}
      </div>
      ${select('composant', 'Composant', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucun' })}
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

  note: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'La note' : 'Nouvelle note', sousTitre: 'Une décision, une information, un risque : ce qui ne doit pas se perdre.',
    corps: `
      <div class="forme-rang">
        ${select('type', 'Nature', TYPES_NOTE, fiche ? fiche.type : 'decision')}
        ${champ('date', 'Date', fiche ? dateISO(fiche.date) : dateISO(new Date()), { type: 'date' })}
      </div>
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Conserver Stripe pour les paiements' })}
      ${zone('contenu', 'Contenu', fiche ? fiche.contenu : '', { lignes: 4 })}
      ${champ('decidePar', 'Décidé par', fiche ? fiche.decidePar : '', { facultatif: true, placeholder: '[nom retire] et Nadir' })}
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

  blocage: (env, { pid, fiche }) => feuille({
    titre: fiche ? 'Le point bloquant' : 'Nouveau point bloquant', sousTitre: 'Court, factuel, avec un responsable.',
    corps: `
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Publication Android bloquée' })}
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
        ${select('composant', 'Composant', composantsDe(pid), fiche ? fiche.composant : '', { vide: 'Aucun' })}
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
        ${select('composant', 'Composant', composantsDe(pid), fiche.composant || '', { vide: 'Aucun' })}
      </div>
      <div class="forme-rang">
        ${select('qualification', 'Qualification', QUALIFICATIONS, fiche.qualification || '', { vide: 'Pas encore qualifiée', aide: 'Hors périmètre ou à chiffrer : le client en est informé.' })}
        ${select('plateforme', 'Plateforme', PLATEFORMES, fiche.plateforme || '')}
      </div>
      ${champ('titre', 'Titre', fiche.titre)}`,
    regles: { titre: obligatoire(), plateforme: () => '' },
    enregistrer: async (d) => {
      const changements = { statut: d.statut, urgence: d.urgence, assigne: d.assigne || null, composant: d.composant, qualification: d.qualification || null, plateforme: d.plateforme, titre: d.titre };
      if (d.statut === 'resolu' && fiche.statut !== 'resolu') changements.resolu = new Date();
      await ecrire.majDemande(fiche.id, changements);
      toast('Demande mise à jour.');
    },
  }),
};

/** Ouvre l'éditeur d'un genre. Résout true (ou l'identifiant) si enregistré. */
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
    toast('Supprimé.');
    return true;
  } catch (e) { toast(lisible(e), 'erreur'); return false; }
};

void longueurMax; void enDate; void TYPES_CHANGEMENT;
