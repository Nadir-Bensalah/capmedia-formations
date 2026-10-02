/* ==========================================================================
   L'éditeur de la fiche d'une partie (Cockpit seulement)

   Tout ce que le client lit sur la page d'une partie se corrige d'ici, une
   section à la fois : l'en-tête (nom, sous-titre, statut, versions, liens),
   les chiffres clés, ce que fait la partie, où elle en est, son histoire,
   comment elle est faite. Une liste se saisit un élément par ligne ; les
   colonnes d'une ligne se séparent par « | ».

   La validation est celle de l'import (partie-format.js) : mêmes bornes,
   pas de tiret cadratin, pas d'adresse e-mail. Les règles Firestore
   reprennent les bornes : un texte trop long ne passerait de toute façon
   pas.
   ========================================================================== */

import { echapper, STATUTS_COMPOSANT } from '../noyau.js';
import { toast } from '../ui.js';
import { ecrire, horodatage } from '../donnees.js';
import { feuille, champ, zone, choix } from './editeurs.js';
import { BORNES_PARTIE as B, validerPartie, versDocumentPartie, lignesDe, colonnes } from '../partie-format.js';

/* Les noms que lit l'équipe, à la place des clés du format. */
const NOMS = {
  nom: 'Nom', statut: 'Statut', sousTitre: 'Sous-titre', resume: 'Résumé', etatActuel: 'État actuel', hebergement: 'Hébergement',
  versionEnLigne: 'Version en ligne', versionEnPreparation: 'Version en préparation', liens: 'Liens', chiffres: 'Chiffres clés',
  fonctions: 'Fonctions', technologies: 'Technologies', historique: 'Historique', prochainesEtapes: 'Prochaines étapes',
  pointsAttention: 'Points d\'attention',
};
const lisibleErreur = (e) => e.replace(/^([a-zA-Z]+)(\[(\d+)\])?(\.[a-z]+)?/, (tout, cle, _i, n) => `${NOMS[cle] || cle}${n !== undefined ? `, ligne ${Number(n) + 1}` : ''}`);

export const SECTIONS_PARTIE = {
  entete: 'L\'en-tête',
  chiffres: 'Les chiffres clés',
  fonctions: 'Ce que fait cette partie',
  etat: 'Où on en est',
  historique: 'L\'historique',
  fabrication: 'Comment elle est faite',
};

const enLignes = (liste, forme) => (Array.isArray(liste) ? liste : []).map(forme).join('\n');

const corps = (section, c) => {
  const vl = c.versionEnLigne || {};
  const vp = c.versionEnPreparation || {};
  switch (section) {
    case 'entete': return `
      ${champ('nom', 'Nom de la partie', c.nom || '', { placeholder: 'Firebase', aide: 'C\'est aussi le nom de la carte en tête du projet.' })}
      ${champ('sousTitre', 'Sous-titre', c.sousTitre || '', { facultatif: true, placeholder: 'Le moteur de l\'application : comptes, données, e-mails', aide: `Une phrase, ${B.sousTitre} caractères au plus.` })}
      ${choix('statut', 'Statut', STATUTS_COMPOSANT, c.statut || 'en-cours')}
      <p class="surtitre" style="margin-top:8px">La version en ligne</p>
      <div class="forme-rang">
        ${champ('enLigneNumero', 'Numéro', vl.numero || '', { facultatif: true, placeholder: '1.1.2' })}
        ${champ('enLigneDate', 'Depuis le', vl.date || '', { facultatif: true, placeholder: 'AAAA-MM-JJ' })}
      </div>
      ${champ('enLigneOu', 'Où', vl.ou || '', { facultatif: true, placeholder: 'App Store' })}
      <p class="surtitre" style="margin-top:8px">La version en préparation</p>
      <div class="forme-rang">
        ${champ('prepNumero', 'Numéro', vp.numero || '', { facultatif: true, placeholder: '1.1.3' })}
        ${champ('prepEtat', 'Où elle en est', vp.etat || '', { facultatif: true, placeholder: 'En validation chez Apple depuis le 30 septembre' })}
      </div>
      ${zone('liens', 'Les boutons de liens', enLignes(c.liens, (l) => `${l.libelle} | ${l.url}`), { facultatif: true, lignes: 3, aide: `Un par ligne : libellé | https://adresse. ${B.liens.max} au plus.` })}`;
    case 'chiffres': return `
      ${zone('chiffres', 'Les chiffres clés', enLignes(c.chiffres, (x) => `${x.valeur} | ${x.libelle}`), { facultatif: true, lignes: 6, placeholder: '6 | langues', aide: `Un par ligne : valeur | libellé. ${B.chiffres.max} au plus.` })}`;
    case 'fonctions': return `
      ${zone('resume', 'Le résumé', c.resume || '', { facultatif: true, lignes: 5, aide: `Deux à quatre phrases pour quelqu'un qui n'est pas technicien. ${B.resume} caractères au plus.` })}
      ${zone('fonctions', 'Ce qu\'elle permet', enLignes(c.fonctions, (x) => x), { facultatif: true, lignes: 10, aide: `Une fonction par ligne, du point de vue de l'utilisateur. ${B.fonctions.max} au plus.` })}`;
    case 'etat': return `
      ${zone('etatActuel', 'L\'état actuel', c.etatActuel || '', { facultatif: true, lignes: 3, aide: 'Une ou deux phrases, datées.' })}
      ${zone('prochainesEtapes', 'Les prochaines étapes', enLignes(c.prochainesEtapes, (x) => x), { facultatif: true, lignes: 5, aide: `Une par ligne, sans promesse de date incertaine. ${B.prochainesEtapes.max} au plus.` })}
      ${zone('pointsAttention', 'Les points d\'attention', enLignes(c.pointsAttention, (x) => x), { facultatif: true, lignes: 4, aide: 'Une par ligne, seulement s\'il y en a, formulés calmement.' })}`;
    case 'historique': return `
      ${zone('historique', 'L\'historique', enLignes(c.historique, (h) => `${h.date} | ${h.titre}${h.detail ? ` | ${h.detail}` : ''}`), { facultatif: true, lignes: 12, placeholder: '2026-09-09 | Version 1.1.2 publiée | Une phrase', aide: `Une entrée par ligne : date (AAAA-MM-JJ) | titre | détail. La page les range du plus récent au plus ancien. ${B.historique.max} au plus.` })}`;
    case 'fabrication': return `
      ${zone('technologies', 'Les technologies', enLignes(c.technologies, (t) => `${t.nom}${t.role ? ` | ${t.role}` : ''}`), { facultatif: true, lignes: 6, placeholder: 'React Native | une seule base de code pour iPhone et Android', aide: `Une par ligne : nom | à quoi elle sert. ${B.technologies.max} au plus.` })}
      ${zone('hebergement', 'L\'hébergement', c.hebergement || '', { facultatif: true, lignes: 2, aide: 'Où vit cette partie, en une phrase.' })}`;
    default: return '';
  }
};

/* Ce que la section saisie devient, au format de la fiche. */
const lire = (section, d) => {
  switch (section) {
    case 'entete': return {
      nom: d.nom || '', sousTitre: d.sousTitre || '', statut: d.statut,
      versionEnLigne: { numero: d.enLigneNumero || '', date: d.enLigneDate || '', ou: d.enLigneOu || '' },
      versionEnPreparation: { numero: d.prepNumero || '', etat: d.prepEtat || '' },
      liens: lignesDe(d.liens).map((l) => { const [libelle, url] = colonnes(l, 2); return { libelle, url }; }),
    };
    case 'chiffres': return { chiffres: lignesDe(d.chiffres).map((l) => { const [valeur, libelle] = colonnes(l, 2); return { valeur, libelle }; }) };
    case 'fonctions': return { resume: d.resume || '', fonctions: lignesDe(d.fonctions) };
    case 'etat': return { etatActuel: d.etatActuel || '', prochainesEtapes: lignesDe(d.prochainesEtapes), pointsAttention: lignesDe(d.pointsAttention) };
    case 'historique': return { historique: lignesDe(d.historique).map((l) => { const [date, titre, detail] = colonnes(l, 3); return { date, titre, detail }; }) };
    case 'fabrication': return { technologies: lignesDe(d.technologies).map((l) => { const [nom, role] = colonnes(l, 2); return { nom, role }; }), hebergement: d.hebergement || '' };
    default: return {};
  }
};

/** Ouvre l'éditeur d'une section de la fiche d'une partie. */
export const editerPartie = (env, { pid, composant, section }) => {
  if (env.role !== 'equipe' || !composant || !SECTIONS_PARTIE[section]) return Promise.resolve(undefined);
  return feuille({
    titre: SECTIONS_PARTIE[section],
    sousTitre: composant.nom || '',
    corps: `<div data-editeur-partie="${echapper(section)}">${corps(section, composant)}</div>`,
    enregistrer: async (d) => {
      const fiche = lire(section, d);
      if (section === 'entete' && !String(fiche.nom).trim()) { toast('Le nom de la partie est obligatoire.', 'erreur'); return false; }
      const { erreurs } = validerPartie(fiche);
      if (erreurs.length) {
        toast(`${lisibleErreur(erreurs[0])}${erreurs.length > 1 ? ` (et ${erreurs.length - 1} autre${erreurs.length > 2 ? 's' : ''})` : ''}`, 'erreur', 8000);
        return false;
      }
      const doc = versDocumentPartie(fiche);
      /* Une version vide s'efface plutôt que de laisser des cases vides. */
      if (doc.versionEnLigne && !doc.versionEnLigne.numero && !doc.versionEnLigne.date && !doc.versionEnLigne.ou) doc.versionEnLigne = null;
      if (doc.versionEnPreparation && !doc.versionEnPreparation.numero && !doc.versionEnPreparation.etat) doc.versionEnPreparation = null;
      await ecrire.majComposant(pid, composant.id, { ...doc, editeLe: horodatage() });
      toast('Page de la partie mise à jour.');
      return true;
    },
  });
};
