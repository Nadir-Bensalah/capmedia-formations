/* ==========================================================================
   CAPMEDIA · la grille de tarifs, source unique

   Un seul endroit pour le prix d'une journée : reglages/tarifs, écrit par
   l'équipe (admin ou finance) dans le Cockpit, lu par toute personne
   connectée. L'annonce de tarification, le calculateur des axes
   d'évolution et le devis demandé lisent tous cette grille : changer un
   prix ici le change partout, jamais deux chiffres qui se contredisent.

   Forme du document :
     { seuilMois: 3, tva: 20, devise: 'EUR',
       periodes: [ { debut: 'AAAA-MM-JJ', long: 380, court: 420 }, ... ],
       maj }
   Une période vaut de son début (minuit, heure de Paris) au début de la
   suivante. « long » : projet de plus de seuilMois mois ; « court » sinon.
   ========================================================================== */

/* Capmedia est une micro-entreprise : franchise en base de TVA, le prix
   affiché est le prix payé (tva 0). Aujourd'hui 380 € par jour pour tous
   les projets ; au 1er janvier 2027, 420 € projet long et 480 € projet
   court. */
export const GRILLE_DEFAUT = {
  seuilMois: 3,
  tva: 0,
  devise: 'EUR',
  periodes: [
    { debut: '2026-01-01', long: 380, court: 380 },
    { debut: '2027-01-01', long: 420, court: 480 },
  ],
};

export const MENTION_FRANCHISE = 'TVA non applicable, article 293 B du CGI';

/** Sans TVA (franchise en base) : le prix affiché est le prix payé. */
export const franchise = (grille) => grilleDe(grille).tva === 0;

/** Un prix lisible : « 380 € » en franchise, « 380 € HT » sinon. */
export const prix = (valeur, grille) => {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return '';
  const n = `${Math.round(valeur).toLocaleString('fr-FR')} €`.replace(/\u202f|\u00a0/g, ' ');
  return franchise(grille) ? n : `${n} HT`;
};

const enDateLocale = (iso) => { const [a, m, j] = String(iso || '').split('-').map(Number); return a && m && j ? new Date(a, m - 1, j) : null; };
const enDateLibre = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** La grille lue (document reglages/tarifs), ou celle par défaut. */
export const grilleDe = (doc) => {
  const g = doc && Array.isArray(doc.periodes) && doc.periodes.length ? doc : GRILLE_DEFAUT;
  const periodes = g.periodes
    .filter((p) => enDateLocale(p.debut) && Number(p.long) > 0 && Number(p.court) > 0)
    .map((p) => ({ debut: p.debut, long: Number(p.long), court: Number(p.court) }))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  return { seuilMois: Number(g.seuilMois) || 3, tva: Number.isFinite(Number(g.tva)) ? Number(g.tva) : 20, devise: g.devise || 'EUR', periodes };
};

/** La période en vigueur à une date (la dernière dont le début est passé). */
export const periodeA = (grille, date = new Date()) => {
  const g = grilleDe(grille);
  let courante = g.periodes[0] || null;
  g.periodes.forEach((p) => { if (enDateLocale(p.debut) <= date) courante = p; });
  return courante;
};

/** La période suivante, si une est déjà annoncée après cette date. */
export const periodeSuivante = (grille, date = new Date()) => grilleDe(grille).periodes.find((p) => enDateLocale(p.debut) > date) || null;

/** Le début d'un projet : sa date de début, sinon sa création. */
export const debutProjet = (projet) => enDateLibre(projet && (projet.debut || projet.cree || projet.premiereOuverture));

/** Un projet long : commencé depuis plus de seuilMois mois à cette date. */
export const projetLong = (projet, grille, date = new Date()) => {
  const d = debutProjet(projet);
  if (!d) return false;
  const seuil = new Date(d.getFullYear(), d.getMonth() + grilleDe(grille).seuilMois, d.getDate());
  return seuil <= date;
};

/** Le prix d'une journée HT pour ce projet à cette date. */
export const tjmA = (grille, { long, date = new Date() }) => {
  const p = periodeA(grille, date);
  return p ? (long ? p.long : p.court) : null;
};

/** Montants d'une estimation : { ht, tva, ttc } arrondis à l'euro. */
export const montants = (jours, tjm, grille) => {
  const ht = Math.round((Number(jours) || 0) * (Number(tjm) || 0));
  const taux = grilleDe(grille).tva;
  /* En franchise : pas de TVA, le hors taxes est le prix payé. */
  const tva = Math.round(ht * taux / 100);
  return { ht, tva, ttc: ht + tva, taux };
};
