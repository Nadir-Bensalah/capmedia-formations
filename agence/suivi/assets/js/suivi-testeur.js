/* ==========================================================================
   CAPMEDIA COCKPIT · le suivi d'un testeur, en chiffres

   Ce que la fiche de suivi (vues/suivi-testeur.js) affiche, calculé ici à
   part, sans rien lire ni dessiner : l'invitation, les connexions et le
   temps passé, l'avancement campagne par campagne. Un seul import, le
   fichier des verdicts, qui n'importe rien : les tests chargent ce fichier
   tel quel (fonctions-suivi/outils/suivi-testeur.test.mjs).

   Les sessions viennent de la présence du testeur (testeur.js) :
   presences/{uid}/sessions, une par ouverture de son espace, avec
   « debut » et « vu », deux dates du serveur ; « vu » avance toutes les
   trente secondes tant que la page est visible. Une session vaut donc
   vu moins debut.

   Une connexion n'est pas une session : un rechargement de la page ouvre
   une session neuve à la seconde où la précédente s'arrête, deux onglets
   en ouvrent deux qui se chevauchent. On regroupe ce qui se suit à moins
   d'une demi-heure (la même pause que celle qui, dans testeur.js, ouvre
   une session neuve), et le temps d'une connexion est la durée couverte
   par ses sessions, sans les trous ni les chevauchements comptés deux fois.
   ========================================================================== */

import { campagneSurPlan, clesDuTesteur, clePassage, resultatCourt } from './verdicts.js';

/** Au-delà de cette absence, une nouvelle connexion commence. */
export const PAUSE_CONNEXION_MS = 30 * 60000;
/** Le dernier signe a moins de 75 secondes : il est là (comme le tableau). */
export const PRESENT_MS = 75000;

/* Un horodatage de la base (Timestamp, Date, nombre, texte) en
   millisecondes ; 0 quand il manque ou ne se lit pas. */
export const enMs = (x) => {
  if (!x) return 0;
  if (x instanceof Date) return x.getTime();
  if (typeof x.toMillis === 'function') return x.toMillis();
  if (typeof x.seconds === 'number') return x.seconds * 1000;
  const n = typeof x === 'number' ? x : Date.parse(x);
  return Number.isFinite(n) ? n : 0;
};

/** La durée d'une session : vu moins debut, jamais négative. */
export const dureeSession = (s) => {
  const debut = enMs(s && s.debut);
  const vu = enMs(s && s.vu);
  return debut && vu > debut ? vu - debut : 0;
};

/**
 * Les connexions, de la plus récente à la plus ancienne :
 * { debut, fin, duree, sessions, plateformes }.
 * Une session sans début est ignorée (elle n'a jamais été écrite en entier).
 */
export const connexionsDe = (sessions, pause = PAUSE_CONNEXION_MS) => {
  const tranches = (sessions || [])
    .map((s) => ({ debut: enMs(s && s.debut), fin: Math.max(enMs(s && s.debut), enMs(s && s.vu)), plateforme: (s && s.plateforme) || '' }))
    .filter((t) => t.debut > 0)
    .sort((a, b) => a.debut - b.debut);
  const liste = [];
  let c = null;
  tranches.forEach((t) => {
    if (c && t.debut - c.fin < pause) {
      /* Seul compte ce qui dépasse la fin déjà couverte : deux onglets
         ouverts ensemble ne font pas deux heures d'une seule. */
      c.duree += Math.max(0, t.fin - Math.max(t.debut, c.fin));
      c.fin = Math.max(c.fin, t.fin);
      c.sessions += 1;
    } else {
      c = { debut: t.debut, fin: t.fin, duree: t.fin - t.debut, sessions: 1, plateformes: [] };
      liste.push(c);
    }
    if (t.plateforme && !c.plateformes.includes(t.plateforme)) c.plateformes.push(t.plateforme);
  });
  return liste.reverse();
};

/** Le bilan des connexions : combien, quand, combien de temps en tout. */
export const bilanConnexions = (sessions, pause = PAUSE_CONNEXION_MS) => {
  const liste = connexionsDe(sessions, pause);
  return {
    nombre: liste.length,
    total: liste.reduce((n, c) => n + c.duree, 0),
    premiere: liste.length ? liste[liste.length - 1].debut : 0,
    derniere: liste.length ? liste[0].fin : 0,
    liste,
  };
};

/** Est-il là, maintenant ? La présence dit « en ligne » et a moins de 75 s. */
export const estEnLigne = (presence, maintenant = Date.now()) => Boolean(presence && presence.enLigne === true
  && enMs(presence.vu) && maintenant - enMs(presence.vu) < PRESENT_MS);

/**
 * L'invitation : la dernière envoyée, et si elle a été acceptée.
 * `invitations` : ce que rend le serveur (suiviTesteur), des dates en ms.
 * Acceptée veut dire « il est entré » : une invitation marquée acceptée,
 * ou, pour un testeur inscrit avant les invitations, une session ou une
 * fiche validée. La première connexion est la plus ancienne de ces dates.
 */
export const bilanInvitation = ({ invitations = [], sessions = [], testeur = {} } = {}) => {
  const liste = (invitations || []).filter(Boolean);
  const envois = liste.map((i) => enMs(i.envoyee)).filter((x) => x > 0).sort((a, b) => a - b);
  const acceptees = liste.map((i) => enMs(i.acceptee)).filter((x) => x > 0);
  const debuts = (sessions || []).map((s) => enMs(s && s.debut)).filter((x) => x > 0);
  const fiche = enMs(testeur && testeur.ficheValidee);
  const traces = [...acceptees, ...debuts, ...(fiche ? [fiche] : [])];
  return {
    envoyee: envois.length ? envois[envois.length - 1] : 0,
    premierEnvoi: envois.length ? envois[0] : 0,
    envois: envois.length,
    acceptee: traces.length > 0,
    premiereConnexion: traces.length ? Math.min(...traces) : 0,
    /* Ce que le serveur sait de la dernière : envoyée, expirée, révoquée. */
    etat: liste.length ? (liste[liste.length - 1].etat || '') : '',
  };
};

/* Les clés d'un testeur dans une campagne d'avant le plan : une liste de
   références, ou un objet qui porte « cles ». */
const clesAnciennes = (campagne, uid) => {
  const a = ((campagne || {}).affectation || {})[uid];
  if (Array.isArray(a)) return a;
  return (a && Array.isArray(a.cles)) ? a.cles : [];
};

/**
 * L'avancement d'un testeur dans une campagne.
 *   prevus     ce qu'on lui a confié
 *   faits      ce qu'il a rendu (un échec corrigé à rejouer n'est plus fait)
 *   echecs     ses échecs encore ouverts
 *   aRejouer   ses échecs corrigés par l'équipe, à refaire
 *   remarques  ses remarques libres (et les anciennes, sur l'appréciation)
 *   avisAvant, avisApres   a répondu, oui ou non (jamais quoi : anonyme)
 *   termine    la date de « J'ai terminé », ou 0
 *   fin        la date de fin de son accès, ou 0
 */
export const avancementCampagne = ({ campagne, uid, passages = [], remarques = [], appreciation = null } = {}) => {
  const c = campagne || {};
  const surPlan = campagneSurPlan(c);
  const cles = surPlan ? clesDuTesteur(c, uid) : clesAnciennes(c, uid);
  const lesCles = new Set(cles);
  const siens = (passages || []).filter((p) => p && p.testeur === uid
    && (!surPlan || lesCles.has(clePassage(p.scenario, p.plateforme))));
  const enKo = (p) => resultatCourt(p.resultat) === 'ko';
  const a = appreciation || {};
  const rendus = a.avisRendus || {};
  return {
    prevus: lesCles.size,
    faits: siens.filter((p) => !(enKo(p) && p.aRevoir === true)).length,
    echecs: siens.filter((p) => enKo(p) && p.aRevoir !== true).length,
    aRejouer: siens.filter((p) => enKo(p) && p.aRevoir === true).length,
    remarques: (remarques || []).filter((r) => r && r.testeur === uid).length + (Array.isArray(a.remarques) ? a.remarques.length : 0),
    avisAvant: rendus.avant === true,
    avisApres: rendus.apres === true,
    termine: enMs(a.termine) || enMs((c.termines || {})[uid]),
    fin: enMs((c.fins || {})[uid]),
  };
};

/** La somme des avancements, pour la phrase de tête de la fiche. */
export const totalAvancement = (liste) => (liste || []).reduce((t, x) => ({
  prevus: t.prevus + (x.prevus || 0),
  faits: t.faits + (x.faits || 0),
  echecs: t.echecs + (x.echecs || 0),
  remarques: t.remarques + (x.remarques || 0),
}), { prevus: 0, faits: 0, echecs: 0, remarques: 0 });

/** Une durée en clair : « 0 min », « 42 min », « 3 h 05 ». */
export const dureeEnClair = (ms) => {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
