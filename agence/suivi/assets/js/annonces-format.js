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
export const BORNES_ANNONCE = { titre: 120, texte: 4000, phrase: 400, message: 300, intro: 600, tjm: 10000, seuilMax: 36 };

/* Les phrases de l'encart personnalisé. Elles se modifient dans le Cockpit
   (champ par annonce) ; vides, ce sont elles qui reviennent. */
export const PHRASE_LONG = 'Votre projet {projet}, commencé le {debut}, est un projet long : il reste à {tjm} par jour à partir du {date}.';
export const PHRASE_COURT = 'Votre projet {projet}, commencé le {debut}, est un projet court : il sera facturé {tjm} par jour à partir du {date}.';
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
const plusMois = (d, n) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  /* Le 31 août plus un mois ne devient pas le 1er octobre. */
  if (r.getDate() !== d.getDate()) r.setDate(0);
  return r;
};

/* --- Le tarif ------------------------------------------------------------ */

/** Les règles chiffrées d'une annonce « tarif », bornées et complètes. */
export const reglesTarif = (a) => {
  const t = (a && a.tarif) || {};
  const nombre = (v, defaut) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : defaut);
  return {
    tjmLong: nombre(t.tjmLong, null),
    tjmCourt: nombre(t.tjmCourt, null),
    seuilMois: Math.round(nombre(t.seuilMois, 3)),
    texteLong: String(t.texteLong || '').trim() || PHRASE_LONG,
    texteCourt: String(t.texteCourt || '').trim() || PHRASE_COURT,
  };
};

/**
 * Le début d'un projet, pour mesurer sa durée : sa date de début, sinon sa
 * première activité, sinon son ouverture au client, sinon sa création.
 * `premiereActivite(pid)` rend une date ou null.
 */
export const debutProjet = (p, premiereActivite = () => null) => {
  const d = enDate(p && p.debut) || premiereActivite(p && p.id) || enDate(p && p.ouvertLe) || enDate(p && p.cree);
  return d ? minuit(d) : null;
};

/**
 * Le verdict d'un projet face à une annonce « tarif » : long ou court, et
 * le TJM qui s'applique. La durée se mesure au plus tard du jour et de la
 * date d'effet : c'est à cette date que le tarif s'applique. Un projet dont
 * la date cible est à plus de « seuil » mois de son début est long aussi.
 */
export const verdictTarif = (a, p, { aujourdHui = new Date(), premiereActivite } = {}) => {
  const r = reglesTarif(a);
  const debut = debutProjet(p, premiereActivite);
  if (!debut || r.tjmLong === null || r.tjmCourt === null) return null;
  const effet = jourDe(a.dateEffet);
  const jour = minuit(aujourdHui);
  const reference = effet && effet > jour ? effet : jour;
  const seuil = plusMois(debut, r.seuilMois);
  const cible = enDate(p.cible);
  const long = seuil <= reference || Boolean(cible && seuil <= minuit(cible));
  const tjm = long ? r.tjmLong : r.tjmCourt;
  const remplir = (modele) => modele
    .replaceAll('{projet}', p.nom || 'sans nom')
    .replaceAll('{debut}', dateFr(debut))
    .replaceAll('{tjm}', montantHT(tjm))
    .replaceAll('{date}', effet ? dateFr(effet) : dateFr(jour))
    .replaceAll('{seuil}', String(r.seuilMois));
  return { projet: p.id, nom: p.nom || '', debut, long, tjm, phrase: remplir(long ? r.texteLong : r.texteCourt) };
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
