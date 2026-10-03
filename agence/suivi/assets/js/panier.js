/* ==========================================================================
   CAPMEDIA CLIENT HUB · le calculateur des axes d'évolution

   Le responsable d'un projet met des axes dans son panier ; le panier en
   fait la somme : jours estimés, prix d'une journée selon la grille
   (tarifs.js, la source unique), hors taxes, TVA et TTC. Quand la grille
   annonce déjà la période suivante, les deux estimations se lisent côte à
   côte : un chantier lancé avant la bascule, ou après.

   « Demander un devis » fige une PHOTO de ce calcul dans la fiche de la
   demande (documents/{id}.photo) : ce que le client a vu ce jour-là, que
   la grille change ou non ensuite. Ce module calcule la photo et la
   dessine ; la page des axes, Devis et factures et le Cockpit lisent le
   même dessin.
   ========================================================================== */

import { grilleDe, periodeA, periodeSuivante, projetLong, montants } from './tarifs.js';
import { joursValides, joursTexte, PLATEFORMES_AXE } from './axes-format.js';
import { echapper, montantHT, montantTTC, montant } from './noyau.js';

export const MAX_PANIER = 40;

/* « 1er janvier 2027 », « 31 décembre 2026 » : une date de grille (AAAA-MM-JJ), en toutes lettres. */
const enLettres = (d) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'long' })} ${d.getFullYear()}`;
const dateGrille = (iso) => { const [a, m, j] = String(iso || '').split('-').map(Number); return a && m && j ? new Date(a, m - 1, j) : null; };
export const debutEnLettres = (iso) => { const d = dateGrille(iso); return d ? enLettres(d) : ''; };
export const veilleEnLettres = (iso) => { const d = dateGrille(iso); return d ? enLettres(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) : ''; };

/** Un axe peut-il entrer au panier : publié, encore « proposé » ou « au programme ». */
export const axePanierable = (a) => Boolean(a) && a.publication === 'publiee' && ['propose', 'prevu'].includes(a.etat || 'propose');

/**
 * La photo d'un panier : ses lignes, le total des jours, le prix d'une
 * journée selon que le projet est long ou court, et les montants de la
 * période en cours puis, si elle est annoncée, de la suivante. Une ligne
 * sans jours estimés est gardée, sans compter dans la somme.
 */
export const photoDuPanier = ({ axes, projet, grille, date = new Date() }) => {
  const g = grilleDe(grille);
  const lignes = (axes || []).slice(0, MAX_PANIER).map((a) => ({
    axe: String(a.id), titre: String(a.titre || '').slice(0, 120),
    plateforme: PLATEFORMES_AXE[a.plateforme] ? a.plateforme : 'general',
    jours: joursValides(a.jours) ? a.jours : null,
  }));
  const jours = Math.round(lignes.reduce((n, l) => n + (l.jours || 0), 0) * 2) / 2;
  const long = projetLong(projet, grille, date);
  const chiffrer = (p) => {
    if (!p) return null;
    const tjm = long ? p.long : p.court;
    const m = montants(jours, tjm, grille);
    return { debut: p.debut, tjm, ht: m.ht, tva: m.tva, ttc: m.ttc };
  };
  return { lignes, jours, long, tva: g.tva, periode: chiffrer(periodeA(grille, date)), suivante: chiffrer(periodeSuivante(grille, date)) };
};

/** Le libellé de la demande : les titres, à la suite, dans 160 caractères. */
export const libelleDemande = (photo) => {
  const titres = (photo.lignes || []).map((l) => l.titre).filter(Boolean);
  const texte = `Axes d'évolution : ${titres.join(', ')}`;
  return texte.length <= 160 ? texte : `${texte.slice(0, 157).replace(/[\s,]+\S*$/, '')}...`;
};

const joursLigne = (l) => (joursValides(l.jours) ? `≈ ${joursTexte(l.jours)}` : 'À estimer');

const blocPeriode = (titre, p, tva) => `<div class="panier-periode" data-panier-periode="${echapper(p.debut)}">
    <p class="panier-periode-titre">${echapper(titre)}</p>
    <p class="panier-periode-tjm">${echapper(montantHT(p.tjm))} par jour</p>
    <dl class="panier-montants">
      <div><dt>Hors taxes</dt><dd data-panier-ht>${echapper(montantHT(p.ht))}</dd></div>
      <div><dt>TVA ${echapper(String(tva).replace('.', ','))} %</dt><dd data-panier-tva>${echapper(montant(p.tva) || montant(0))}</dd></div>
      <div class="panier-ttc"><dt>TTC</dt><dd data-panier-ttc>${echapper(montantTTC(p.ttc) || `${montant(0)} TTC`)}</dd></div>
    </dl>
  </div>`;

/**
 * Le dessin d'une photo : les lignes (avec « Retirer » dans le panier
 * vivant), le total des jours, puis l'estimation d'une ou deux périodes.
 */
export const dessinPhoto = (photo, { retirer = false } = {}) => {
  if (!photo || !Array.isArray(photo.lignes)) return '';
  const aEstimer = photo.lignes.filter((l) => !joursValides(l.jours)).length;
  const p = photo.periode;
  const s = photo.suivante;
  return `<div class="panier-photo">
    <ol class="panier-lignes">${photo.lignes.map((l) => `<li class="panier-ligne" data-panier-ligne="${echapper(l.axe)}">
      <span class="panier-ligne-titre">${echapper(l.titre)}</span>
      <span class="panier-ligne-plateforme">${echapper((PLATEFORMES_AXE[l.plateforme] || PLATEFORMES_AXE.general).libelle)}</span>
      <span class="panier-ligne-jours">${echapper(joursLigne(l))}</span>
      ${retirer ? `<button class="btn btn-petit btn-fantome" type="button" data-panier-retirer="${echapper(l.axe)}">Retirer</button>` : ''}
    </li>`).join('')}</ol>
    <div class="panier-total">
      <span>Total estimé</span>
      <strong data-panier-jours>${echapper(photo.jours > 0 ? joursTexte(photo.jours) || `${String(photo.jours).replace('.', ',')} jours` : '0 jour')}</strong>
      <span class="panier-total-nature">${photo.long ? 'Projet long' : 'Projet court'}</span>
    </div>
    ${aEstimer ? `<p class="aide">${aEstimer > 1 ? `${aEstimer} lignes n'ont pas encore de temps estimé : elles ne comptent pas dans la somme, nous les chiffrons dans le devis.` : 'Une ligne n\'a pas encore de temps estimé : elle ne compte pas dans la somme, nous la chiffrons dans le devis.'}</p>` : ''}
    ${p ? `<div class="panier-periodes${s ? ' panier-periodes--deux' : ''}">
      ${blocPeriode(s ? `Si lancé avant le ${veilleEnLettres(s.debut)}` : 'Estimation', p, photo.tva)}
      ${s ? blocPeriode(`À partir du ${debutEnLettres(s.debut)}`, s, photo.tva) : ''}
    </div>` : ''}
    <p class="panier-mention">Estimation indicative : le devis final peut varier.</p>
  </div>`;
};

/** L'estimation à afficher en une ligne : celle de la période en cours. */
export const estimationCourte = (photo) => (photo && photo.periode ? `≈ ${montantHT(photo.periode.ht)}` : '');
