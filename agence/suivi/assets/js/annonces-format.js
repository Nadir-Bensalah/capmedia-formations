/* ==========================================================================
   CAPMEDIA CLIENT HUB · les annonces de Capmedia, ce qui se calcule

   Les annonces vivent à la racine (annonces/{id}) : écrites par
   l'administrateur, lues par les clients visés une fois publiées (les
   règles le disent, les requêtes aussi). Ce module ne lit rien dans la
   base : il range les types, calcule ce que l'annonce dit à CE client
   (le tarif de chacun de ses projets, la période d'indisponibilité) et
   compte ce qu'il n'a pas encore lu. La page du client, le Cockpit,
   l'accueil et la bulle en partagent les phrases.
   ========================================================================== */

import { enDate, montantHT, projetEstActif } from './noyau.js';
import { grilleDe, periodeA, projetLong, tjmA, debutProjet as debutDeLaGrille } from './tarifs.js';

/* Le repère de chaque type : un mot, une teinte douce (fond pâle, texte de
   la même famille). Jamais de pictogramme dans une pastille. */
export const TYPES_ANNONCE = {
  nouveaute: { libelle: 'Nouveauté', ton: 'bleu' },
  competence: { libelle: 'Compétence', ton: 'violet' },
  changement: { libelle: 'Changement', ton: 'ambre' },
  tarif: { libelle: 'Tarifs', ton: 'vert' },
  indisponibilite: { libelle: 'Indisponibilité', ton: 'ardoise' },
  information: { libelle: 'Information', ton: 'ciel' },
};

export const PUBLICATIONS_ANNONCE = {
  brouillon: { libelle: 'Brouillon', voile: 'gris', aide: 'Les clients ne la voient pas.' },
  publiee: { libelle: 'Publiée', voile: 'vert', aide: 'Les clients visés la lisent et sont prévenus.' },
};

/* Les bornes : les mêmes que suivi/firestore.rules. */
export const BORNES_ANNONCE = { titre: 120, texte: 4000, phrase: 400, message: 300, intro: 600 };

/* Les phrases de l'encart personnalisé. Elles se modifient dans le Cockpit
   (champ par annonce) ; vides, ce sont elles qui reviennent. */
export const PHRASE_LONG = 'Votre projet {projet}, {demarrage}, est un projet long : son prix par jour {evolution} à partir du {date}.';
export const PHRASE_COURT = 'Votre projet {projet}, {demarrage}, est un projet court : son prix par jour {evolution} à partir du {date}.';
export const INTRO_ANNONCES = 'Les nouvelles de Capmedia : nos nouveautés, nos compétences, ce qui change et nos périodes d\'absence. Rien ici ne vous engage.';

export const estPubliee = (a) => Boolean(a) && a.publication === 'publiee';

/* --- Les dates ------------------------------------------------------------- */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Une date « AAAA-MM-JJ » en date locale (minuit), ou null. */
export const jourDe = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** « 1er janvier 2027 », « 21 décembre 2026 ». */
export const dateFr = (valeur) => {
  const d = typeof valeur === 'string' ? jourDe(valeur) : enDate(valeur);
  if (!d) return '';
  const j = d.getDate();
  return `${j === 1 ? '1er' : j} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};

const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* --- Le tarif ------------------------------------------------------------
   Les chiffres ne vivent plus dans l'annonce : ils viennent de la grille
   unique (reglages/tarifs, tarifs.js), la même que lisent le calculateur
   et les devis. L'annonce garde sa date d'effet, son texte et ses deux
   phrases, modifiables dans le Cockpit. */

/** Les phrases de l'encart d'une annonce « tarif » (vides : celles par défaut). */
export const phrasesTarif = (a) => {
  const t = (a && a.tarif) || {};
  return {
    texteLong: String(t.texteLong || '').trim() || PHRASE_LONG,
    texteCourt: String(t.texteCourt || '').trim() || PHRASE_COURT,
  };
};

/** La date à laquelle l'annonce s'applique : sa date d'effet, sinon aujourd'hui. */
export const dateDeLAnnonce = (a, aujourdHui = new Date()) => {
  const effet = jourDe(a && a.dateEffet);
  const jour = minuit(aujourdHui);
  return effet && effet > jour ? effet : jour;
};

/** Ce que la grille dit à la date de l'annonce : les deux prix et le seuil. */
export const grilleALaDate = (a, grille, aujourdHui = new Date()) => {
  const g = grilleDe(grille);
  const p = periodeA(g, dateDeLAnnonce(a, aujourdHui));
  return { seuilMois: g.seuilMois, long: p ? p.long : null, court: p ? p.court : null };
};

/**
 * Le verdict d'un projet face à une annonce « tarif » : long ou court à la
 * date d'effet (projetLong de la grille), le prix par jour d'aujourd'hui
 * et celui qui s'appliquera (tjmA, avant et après la date d'effet).
 */
export const verdictTarif = (a, p, grille, { aujourdHui = new Date() } = {}) => {
  const debut = debutDeLaGrille(p);
  if (!debut) return null;
  const jour = minuit(aujourdHui);
  const effet = dateDeLAnnonce(a, aujourdHui);
  const long = projetLong(p, grille, effet);
  const tjm = tjmA(grille, { long, date: effet });
  const tjmAvant = tjmA(grille, { long: projetLong(p, grille, jour), date: jour });
  if (tjm === null) return null;
  const debutJour = minuit(debut);
  const evolution = tjmAvant === null || tjmAvant === tjm ? `reste à ${montantHT(tjm)}` : `passe de ${montantHT(tjmAvant)} à ${montantHT(tjm)}`;
  const phrases = phrasesTarif(a);
  const remplir = (modele) => modele
    .replaceAll('{projet}', p.nom || 'sans nom')
    .replaceAll('{demarrage}', debutJour > jour ? `début prévu le ${dateFr(debutJour)}` : `commencé le ${dateFr(debutJour)}`)
    .replaceAll('{debut}', dateFr(debutJour))
    .replaceAll('{evolution}', evolution)
    .replaceAll('{tjmAvant}', montantHT(tjmAvant))
    .replaceAll('{tjm}', montantHT(tjm))
    .replaceAll('{date}', dateFr(effet))
    .replaceAll('{seuil}', String(grilleDe(grille).seuilMois));
  return { projet: p.id, nom: p.nom || '', debut: debutJour, long, tjm, tjmAvant, phrase: remplir(long ? phrases.texteLong : phrases.texteCourt) };
};

/** Les projets d'un client qui comptent pour un tarif : ouverts, en cours. */
export const projetsTarifables = (projets) => (projets || []).filter((p) => p && !p.interne && projetEstActif(p));

/* --- L'indisponibilité --------------------------------------------------- */

const SEPT_JOURS = 7;

/** La période d'une annonce « indisponibilite », ou null. */
export const periode = (a) => {
  const i = (a && a.indisponibilite) || {};
  const du = jourDe(i.du);
  const au = jourDe(i.au);
  if (!du || !au || au < du) return null;
  return { du, au, message: String(i.message || '').trim() };
};

/** « du 21 décembre 2026 au 3 janvier 2027 », ou « le 24 décembre 2026 ». */
export const periodeTexte = (p) => (p.du.getTime() === p.au.getTime() ? `le ${dateFr(p.du)}` : `du ${dateFr(p.du)} au ${dateFr(p.au)}`);

/** La phrase du bandeau : « Capmedia est indisponible du … au … : réponses sous 48 h. » */
export const phraseIndisponibilite = (a) => {
  const p = periode(a);
  if (!p) return '';
  const fin = p.message ? ` : ${p.message.replace(/[.\s]+$/, '')}.` : '.';
  return `Capmedia est indisponible ${periodeTexte(p)}${fin}`;
};

/** Le bandeau s'affiche pendant la période et les sept jours qui la précèdent. */
export const indisponibiliteEnVue = (a, aujourdHui = new Date()) => {
  if (!estPubliee(a) || a.type !== 'indisponibilite') return false;
  const p = periode(a);
  if (!p) return false;
  const jour = minuit(aujourdHui);
  const ouverture = new Date(p.du.getFullYear(), p.du.getMonth(), p.du.getDate() - SEPT_JOURS);
  return jour >= ouverture && jour <= p.au;
};

/** L'indisponibilité à annoncer maintenant (la plus proche), ou null. */
export const indisponibiliteActuelle = (annonces, aujourdHui = new Date()) => (annonces || [])
  .filter((a) => indisponibiliteEnVue(a, aujourdHui))
  .sort((x, y) => periode(x).du - periode(y).du)[0] || null;

/* --- L'ordre et la lecture ------------------------------------------------ */

const quand = (a) => (enDate(a.publieLe) || enDate(a.maj) || enDate(a.cree) || new Date()).getTime();

/** Les épinglées d'abord, puis la plus récente. */
export const parOrdreAnnonce = (a, b) => (Number(Boolean(b.epinglee)) - Number(Boolean(a.epinglee))) || (quand(b) - quand(a));

/** Une annonce non lue : publiée après la dernière lecture de la page. */
export const estNonLue = (a, profil) => {
  if (!estPubliee(a)) return false;
  const lu = enDate(profil && profil.annoncesLues);
  if (!lu) return true;
  const publie = enDate(a.publieLe);
  return !publie || publie > lu;
};

export const nonLues = (annonces, profil) => (annonces || []).filter((a) => estNonLue(a, profil)).length;

/** Ce que dit la cible, côté équipe. */
export const cibleTexte = (a, organisations = []) => {
  const c = (a && a.cible) || {};
  if (c.tous !== false) return 'Tous les clients';
  const noms = (c.organisations || []).map((id) => {
    const o = organisations.find((x) => x.id === id);
    return o ? (o.entreprise || o.nom || id) : id;
  });
  return noms.length ? noms.join(', ') : 'Aucun client choisi';
};
