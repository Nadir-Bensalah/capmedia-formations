/* ==========================================================================
   CAPMEDIA CLIENT HUB · la salle de contrôle

   La santé d'une application en direct, comme sur un écran de salle des
   marchés : un voyant par service, les erreurs de l'heure et du jour, la
   disponibilité des sites minute par minute, le fil des alertes.

   Le battement (sentryReleve, chaque minute) fait trois choses :

   1. Il sonde les adresses d'un projet relié (sentryLiaisons/{p}.sondes :
      l'app web, la landing, une fonction publique EN LECTURE de
      l'application) et le Hub lui-même : un GET, le code HTTP et le temps
      de réponse, rien d'autre. Deux échecs de suite ouvrent un incident,
      le premier succès le ferme ; l'un et l'autre passent dans le fil
      d'alertes et sonnent la cloche de l'équipe. L'historique tient en
      288 cases de cinq minutes (24 h).

   2. Il relève Sentry : le relevé complet (sentry.js) garde son quart
      d'heure ; le relevé rapide (erreurs par tranche de dix minutes sur
      24 h, et sessions des 24 h) suit le même quart d'heure, ou chaque
      minute tant qu'un écran de contrôle est OUVERT (signal de présence,
      action controleEcran). Personne devant l'écran, pas de relevé à la
      minute.

   3. Il recalcule les voyants et l'état global, et récrit la vue du
      client (projets/{p}/stabilite/salle) : des phrases, des taux, aucune
      adresse, aucun code, aucun lien.

   Coût. Une seule tâche planifiée (celle du relevé Sentry, qui battait
   toutes les quinze minutes et bat désormais chaque minute) : aucune tâche
   Cloud Scheduler de plus. Sentry : cinq appels par quart d'heure, plus
   deux ou trois par minute d'écran ouvert, soit au plus 4 000 par jour,
   loin du débit que limite l'offre gratuite.

   Jamais d'appel qui écrit chez l'application surveillée : la sonde fait
   un GET sans corps ni jeton, ne suit pas les redirections, et ne lit pas
   la réponse. Une adresse à sonder est en https, sur un nom de domaine
   public (ni adresse IP, ni nom local), et l'hôte qui répond n'est pas
   une adresse privée.
   ========================================================================== */

const dns = require('node:dns').promises;
const net = require('node:net');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { bdd, REGION, FieldValue, Refus, audit, enMillis } = require('./commun');
const communication = require('./communication');
const sentry = require('./sentry');

const SENTRY_JETON = defineSecret('SENTRY_JETON');
const SUR_EMULATEUR = process.env.FUNCTIONS_EMULATOR === 'true';
const EQUIPE_NOM = 'Équipe Capmedia';

/* Le Hub se sonde lui-même : la porte que voient les clients. Sur le banc,
   seulement si la liaison nomme un hôte local (jamais la vraie). */
const HUB_SONDE = 'https://capmedia.app/suivi/';

/* --- Le rythme ------------------------------------------------------------ */
const PAS_SEAU_MS = 5 * 60 * 1000;
const SEAUX = 288;
const PAS_TRANCHE_S = 600;
const TRANCHES = 144;
const TRANCHES_HEURE = 6;
const ECRAN_PRESENT_MS = 150 * 1000;
const PAUSE_SIGNAL_MS = 30 * 1000;
const PAUSE_RAPIDE_MS = 55 * 1000;
const PAUSE_SESSIONS_MS = 5 * 60 * 1000;
const PAUSE_COMPLET_MS = 14.5 * 60 * 1000;
const DELAI_SONDE_MS = 10000;
const SEUIL_LENT_MS = { fonctions: 6000, defaut: 3000 };
const ECHECS_INCIDENT = 2;
const LENTS_ALERTE = 2;
const INCIDENTS_GARDES = 30;
const DEBIT_SONDE_MS = 30 * 60 * 1000;
const HEURE_MS = 3600 * 1000;
/* Un pic : au moins dix erreurs dans l'heure, et trois fois la moyenne. */
const PIC_MINIMUM = 10;
const PIC_FACTEUR = 3;
/* Les sessions sans plantage sur 24 h : sous 99 %, à surveiller ; sous 97 %, incident. */
const TAUX_ORANGE = 99;
const TAUX_ROUGE = 97;

/* Les services, dans l'ordre de l'écran. « nom » pour l'équipe, « client »
   pour le Hub. */
const SERVICES = {
  web: { nom: 'App web', client: 'Application web', sonde: true, app: 'web' },
  landing: { nom: 'Landing', client: 'Site vitrine', sonde: true },
  ios: { nom: 'iPhone', client: 'Application iPhone', app: 'mobile' },
  android: { nom: 'Android', client: 'Application Android', app: 'mobile' },
  fonctions: { nom: 'Firebase et fonctions', client: "Serveur de l'application", sonde: true },
  hub: { nom: 'Hub Capmedia', client: 'Votre espace Capmedia', sonde: true },
};
const ORDRE = ['web', 'landing', 'ios', 'android', 'fonctions', 'hub'];
const RANG = { gris: 0, vert: 1, orange: 2, rouge: 3 };
const ALERTES_ERREUR = ['nouvelle', 'regression', 'pic', 'alerte'];

/* ==========================================================================
   1. Les décisions pures (exposées pour l'épreuve)
   ========================================================================== */

/**
 * Une adresse qu'on accepte de sonder : https, port 443, un nom de domaine
 * public (pas d'adresse IP, pas de nom local), sans identifiants. Rend
 * l'adresse propre, '' quand rien n'est donné, null quand elle est refusée.
 * Sur l'émulateur seul, http://127.0.0.1:port (les faux sites du banc).
 */
function adresseSondable(brut, { emulateur = SUR_EMULATEUR } = {}) {
  const v = String(brut == null ? '' : brut).trim();
  if (!v) return '';
  if (v.length > 300) return null;
  let u;
  try { u = new URL(v); } catch (err) { return null; }
  if (u.username || u.password) return null;
  u.hash = '';
  if (emulateur && u.protocol === 'http:' && u.hostname === '127.0.0.1' && /^\d{2,5}$/.test(u.port)) return u.toString();
  if (u.protocol !== 'https:') return null;
  if (u.port && u.port !== '443') return null;
  const h = u.hostname.toLowerCase();
  /* Un nom de domaine, pas une adresse IP : le dernier label est alphabétique. */
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null;
  if (/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|test|example|invalid)$/.test(h)) return null;
  return u.toString();
}

/** Une adresse IP privée, locale ou réservée : la sonde n'y va pas. */
function ipPrivee(ip) {
  const v = String(ip || '').toLowerCase();
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(v)) {
    if (v === '::' || v === '::1') return true;
    const mappe = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappe) return ipPrivee(mappe[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

/* --- L'historique d'une sonde : 288 cases de cinq minutes ---------------- */

const zeros = (n) => Array.from({ length: n }, () => 0);

/**
 * Ajoute une mesure à l'historique. Chaque case compte les mesures (n),
 * les échecs (ko) et la somme des temps des réussites (somme). La dernière
 * case est celle de l'instant ; les plus vieilles que 24 h tombent.
 */
function ajouterAuSeau(serie, { t, ok, ms }) {
  const courant = Math.floor(t / PAS_SEAU_MS) * PAS_SEAU_MS;
  const valide = serie && Number.isFinite(serie.t0) && Array.isArray(serie.n) && serie.n.length === SEAUX;
  let t0 = valide ? serie.t0 : courant - (SEAUX - 1) * PAS_SEAU_MS;
  let n = valide ? serie.n.slice() : zeros(SEAUX);
  let ko = valide && Array.isArray(serie.ko) && serie.ko.length === SEAUX ? serie.ko.slice() : zeros(SEAUX);
  let somme = valide && Array.isArray(serie.somme) && serie.somme.length === SEAUX ? serie.somme.slice() : zeros(SEAUX);
  const decalage = Math.round((courant - (t0 + (SEAUX - 1) * PAS_SEAU_MS)) / PAS_SEAU_MS);
  if (decalage > 0) {
    const d = Math.min(decalage, SEAUX);
    n = n.slice(d).concat(zeros(d)); ko = ko.slice(d).concat(zeros(d)); somme = somme.slice(d).concat(zeros(d));
    t0 += decalage * PAS_SEAU_MS;
  }
  const i = Math.round((courant - t0) / PAS_SEAU_MS);
  if (i >= 0 && i < SEAUX) {
    n[i] += 1;
    if (ok) somme[i] += Math.max(0, Math.round(Number(ms) || 0)); else ko[i] += 1;
  }
  return { t0, n, ko, somme };
}

/** La disponibilité sur 24 h, en pour cent (trois décimales), ou null sans mesure. */
function dispoDe(serie) {
  const n = (serie.n || []).reduce((a, b) => a + b, 0);
  if (!n) return null;
  const ko = (serie.ko || []).reduce((a, b) => a + b, 0);
  return Math.round(((n - ko) / n) * 100000) / 1000;
}

/**
 * Une sonde et sa mesure : le nouvel état, et ce qui vient de se passer.
 *   ok, lent (deux réponses lentes de suite), echec (un échec : on
 *   revérifie à la minute suivante), panne (deux échecs de suite : un
 *   incident s'ouvre). Le premier succès après une panne la ferme.
 */
function suivreSonde(avant, mesure, { le, seuilLent = SEUIL_LENT_MS.defaut }) {
  const a = avant || {};
  const t = le instanceof Date ? le.getTime() : Number(le);
  const quand = new Date(t);
  const serie = ajouterAuSeau(a, { t, ok: mesure.ok, ms: mesure.ms });
  const echecs = mesure.ok ? 0 : (Number(a.echecs) || 0) + 1;
  const lents = mesure.ok && mesure.ms > seuilLent ? (Number(a.lents) || 0) + 1 : 0;
  const premierEchec = mesure.ok ? null : (a.premierEchec || quand);
  let panne = a.panne || null;
  let evenement = null;
  if (!mesure.ok && !panne && echecs >= ECHECS_INCIDENT) {
    panne = { debut: premierEchec, code: mesure.code || 0, raison: mesure.raison || 'injoignable' };
    evenement = 'panne';
  } else if (!mesure.ok && panne) {
    panne = { ...panne, code: mesure.code || 0, raison: mesure.raison || panne.raison };
  } else if (mesure.ok && panne) {
    evenement = 'retabli';
    panne = null;
  }
  const etat = panne ? 'panne' : !mesure.ok ? 'echec' : lents >= LENTS_ALERTE ? 'lent' : 'ok';
  const depuis = etat === 'panne' ? panne.debut : (etat === a.etat && a.depuis ? a.depuis : quand);
  return {
    sonde: {
      ...serie, etat, depuis, le: quand, code: mesure.code || 0, ms: Math.round(Number(mesure.ms) || 0), raison: mesure.raison || '',
      echecs, lents, premierEchec, panne, incident: evenement === 'retabli' ? null : (a.incident || null), dispo: dispoDe(serie),
    },
    evenement,
    panneFinie: evenement === 'retabli' ? a.panne : null,
    incidentFini: evenement === 'retabli' ? (a.incident || null) : null,
  };
}

/* --- Les erreurs par tranche de dix minutes (events-stats de Sentry) ----- */

/* Une série d'events-stats : [[horodatage, [{ count }]], ...]. */
const pointsDe = (serie) => ((serie && Array.isArray(serie.data)) ? serie.data : [])
  .map(([ts, v]) => [Number(ts), (Array.isArray(v) ? v : []).reduce((n, x) => n + (Number(x && x.count) || 0), 0)])
  .filter(([ts]) => Number.isFinite(ts));

/**
 * Range des points dans 144 tranches de dix minutes finissant à la tranche
 * en cours. Rend { fin (fin de la dernière tranche, ms), valeurs }.
 */
function tranches(points, maintenant) {
  const courant = Math.floor(maintenant / 1000 / PAS_TRANCHE_S) * PAS_TRANCHE_S;
  const valeurs = zeros(TRANCHES);
  for (const [ts, n] of points) {
    const i = TRANCHES - 1 - Math.round((courant - Math.floor(ts / PAS_TRANCHE_S) * PAS_TRANCHE_S) / PAS_TRANCHE_S);
    if (i >= 0 && i < TRANCHES) valeurs[i] += n;
  }
  return { fin: (courant + PAS_TRANCHE_S) * 1000, valeurs };
}

/**
 * Les erreurs des dernières 24 h par plateforme : la réponse du projet web
 * (une série) et celle du projet mobile, groupée par système (iOS,
 * Android, « Other »). Une plateforme dont la réponse manque garde ce
 * qu'elle avait.
 */
function erreursDe({ web, mobile } = {}, maintenant, avant = {}) {
  const sortie = { ...(avant || {}) };
  if (web && typeof web === 'object') sortie.web = tranches(pointsDe(web), maintenant);
  if (mobile && typeof mobile === 'object') {
    const groupes = Array.isArray(mobile.data) ? { Other: mobile } : mobile;
    const parPlateforme = { ios: [], android: [], autre: [] };
    for (const [nom, serie] of Object.entries(groupes)) {
      if (!serie || typeof serie !== 'object') continue;
      const p = sentry._plateformeDeSysteme(nom);
      parPlateforme[p === 'ios' || p === 'android' ? p : 'autre'].push(...pointsDe(serie));
    }
    for (const p of ['ios', 'android', 'autre']) sortie[p] = tranches(parPlateforme[p], maintenant);
  }
  return sortie;
}

/** Les chiffres d'une série de tranches : l'heure écoulée, les 24 h, la moyenne horaire d'avant. */
function chiffresErreurs(serie, maintenant) {
  if (!serie || !Array.isArray(serie.valeurs)) return null;
  /* Une série relevée il y a un moment : on la recale sur l'instant. */
  const retard = Math.max(0, Math.floor((maintenant - Number(serie.fin)) / (PAS_TRANCHE_S * 1000)) + 1);
  const v = retard > 0 ? serie.valeurs.slice(Math.min(retard, TRANCHES)).concat(zeros(Math.min(retard, TRANCHES))) : serie.valeurs;
  const heure = v.slice(-TRANCHES_HEURE).reduce((a, b) => a + b, 0);
  const jour = v.reduce((a, b) => a + b, 0);
  const moyenne = (jour - heure) / 23;
  return { heure, jour, moyenne, pic: heure >= PIC_MINIMUM && heure >= PIC_FACTEUR * Math.max(moyenne, 1) };
}

/** Les sessions des 24 h par application (web, mobile). */
function sessions24De(reponse, liaison) {
  const sortie = {};
  for (const g of ((reponse || {}).groups || [])) {
    const app = sentry._appDe(liaison, { id: (g.by || {}).project });
    if (!app) continue;
    const tot = g.totals || {};
    const taux = tot['crash_free_rate(session)'];
    const utilisateurs = tot['count_unique(user)'];
    sortie[app] = {
      sessions: Number(tot['sum(session)']) || 0,
      utilisateurs: typeof utilisateurs === 'number' ? utilisateurs : null,
      taux: typeof taux === 'number' ? Math.round(taux * 100000) / 1000 : null,
      serie: ((g.series || {})['sum(session)'] || []).map((x) => Number(x) || 0).slice(-24),
    };
  }
  return sortie;
}

/* --- Les mots ------------------------------------------------------------- */

const heureParis = (d) => {
  const t = enMillis(d);
  if (!t) return '';
  return new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
};
const ESPACE = '\u202f';
const secondes = (ms) => `${(Math.round(ms / 100) / 10).toLocaleString('fr-FR')}${ESPACE}s`;
/* Un taux ne s'arrondit jamais vers le haut (99,96 % n'est pas 100 %). */
const pourcent = (t) => {
  const bas = Math.floor(t * 10 + 1e-9) / 10;
  return `${bas.toLocaleString('fr-FR', { minimumFractionDigits: bas === 100 ? 0 : 1, maximumFractionDigits: 1 })}${ESPACE}%`;
};
const nErreurs = (n) => `${n.toLocaleString('fr-FR')} erreur${n > 1 ? 's' : ''}`;
const raisonPanne = (p) => (p && p.code ? `HTTP ${p.code}` : (p && p.raison === 'délai dépassé' ? 'Ne répond plus' : 'Injoignable'));

/**
 * Le voyant d'un service : vert, orange, rouge, ou gris faute de mesure,
 * avec sa raison (pour l'équipe) et son genre (pour la phrase du client).
 * Le pire l'emporte.
 */
function voyantDe(cle, { sonde, erreurs, sessions, alertes, maintenant, seuilLent }) {
  const constats = [];
  if (sonde) {
    if (!sonde.le) constats.push({ etat: 'gris', genre: 'inconnu', raison: 'Pas encore sondé' });
    else if (maintenant - enMillis(sonde.le) > 5 * 60 * 1000) constats.push({ etat: 'gris', genre: 'inconnu', raison: `Plus de mesure depuis ${heureParis(sonde.le)}` });
    else if (sonde.etat === 'panne') constats.push({ etat: 'rouge', genre: 'panne', raison: raisonPanne(sonde.panne), depuis: (sonde.panne || {}).debut || sonde.depuis || null });
    else if (sonde.etat === 'echec') constats.push({ etat: 'orange', genre: 'echec', raison: `Un échec (${sonde.code ? `HTTP ${sonde.code}` : sonde.raison || 'injoignable'}), revérifié dans une minute` });
    else if (sonde.etat === 'lent') constats.push({ etat: 'orange', genre: 'lent', raison: `Lente : ${secondes(sonde.ms)} (au-delà de ${secondes(seuilLent)})`, depuis: sonde.depuis || null });
    else constats.push({ etat: 'vert', genre: 'ok', raison: `Répond en ${Number(sonde.ms || 0).toLocaleString('fr-FR')}${ESPACE}ms` });
  }
  const app = SERVICES[cle].app;
  if (app) {
    const c = chiffresErreurs(erreurs, maintenant);
    if (c && c.pic) constats.push({ etat: 'orange', genre: 'erreurs', raison: `Pic : ${nErreurs(c.heure)} dans l'heure (${Math.round(c.moyenne).toLocaleString('fr-FR')} en moyenne)` });
    else if (c) constats.push({ etat: 'vert', genre: 'ok', raison: `${nErreurs(c.heure)} dans l'heure` });
    const recentes = (alertes || []).filter((a) => ALERTES_ERREUR.includes(a.type)
      && maintenant - enMillis(a.le) <= HEURE_MS
      && (cle === 'web' ? a.app === 'web' : (a.app === cle || a.app === 'mobile')));
    if (recentes.length) {
      const derniere = recentes.slice().sort((x, y) => enMillis(y.le) - enMillis(x.le))[0];
      constats.push({ etat: 'orange', genre: 'erreurs', raison: `${derniere.titre || 'Alerte'} à ${heureParis(derniere.le)}${recentes.length > 1 ? ` (${recentes.length} alertes dans l'heure)` : ''}` });
    }
    if (sessions && sessions.sessions >= sentry.SESSIONS_MINIMUM && typeof sessions.taux === 'number') {
      const libelle = `${pourcent(sessions.taux)} sans plantage sur 24 h`;
      if (sessions.taux < TAUX_ROUGE) constats.push({ etat: 'rouge', genre: 'plantages', raison: libelle });
      else if (sessions.taux < TAUX_ORANGE) constats.push({ etat: 'orange', genre: 'plantages', raison: libelle });
      else constats.push({ etat: 'vert', genre: 'ok', raison: libelle });
    }
  }
  if (!constats.length) return { etat: 'gris', genre: 'inconnu', raison: 'Pas encore mesuré', depuis: null };
  const pire = constats.reduce((m, x) => (RANG[x.etat] > RANG[m.etat] ? x : m), constats[0]);
  if (pire.etat === 'vert') return { etat: 'vert', genre: 'ok', raison: constats.filter((x) => x.etat === 'vert').map((x) => x.raison).join(' · '), depuis: null };
  const memes = constats.filter((x) => x.etat === pire.etat);
  return { etat: pire.etat, genre: pire.genre, raison: memes.map((x) => x.raison).slice(0, 2).join(' · '), depuis: pire.depuis || null };
}

/** Les services d'un projet : ceux qu'on sonde, et ceux que Sentry suit. */
function servicesDe(liaison, sondes) {
  const s = sondes || {};
  return ORDRE.filter((cle) => {
    if (cle === 'web') return Boolean(s.web || (liaison && liaison.web));
    if (cle === 'ios' || cle === 'android') return Boolean(liaison && liaison.mobile);
    return Boolean(s[cle]);
  });
}

/** Tous les voyants d'un projet. */
function voyantsDe({ liaison, sondes = {}, erreurs = {}, sessions24 = {}, alertes = [], maintenant = Date.now() }) {
  const voyants = {};
  for (const cle of servicesDe(liaison, sondes)) {
    voyants[cle] = voyantDe(cle, {
      sonde: SERVICES[cle].sonde ? sondes[cle] || null : null,
      erreurs: SERVICES[cle].app ? (erreurs || {})[cle] : null,
      sessions: SERVICES[cle].app ? (sessions24 || {})[SERVICES[cle].app] : null,
      alertes, maintenant,
      seuilLent: SEUIL_LENT_MS[cle] || SEUIL_LENT_MS.defaut,
    });
  }
  return voyants;
}

/** L'état global : « Tout fonctionne », « 2 incidents », « 1 point à surveiller ». */
function globalDe(voyants) {
  const v = Object.values(voyants || {});
  const rouges = v.filter((x) => x.etat === 'rouge').length;
  const oranges = v.filter((x) => x.etat === 'orange').length;
  const mesures = v.filter((x) => x.etat !== 'gris').length;
  if (rouges) return { etat: 'rouge', rouges, oranges, phrase: `${rouges} incident${rouges > 1 ? 's' : ''}${oranges ? ` · ${oranges} à surveiller` : ''}` };
  if (oranges) return { etat: 'orange', rouges, oranges, phrase: `${oranges} point${oranges > 1 ? 's' : ''} à surveiller` };
  if (!mesures) return { etat: 'gris', rouges, oranges, phrase: 'Pas encore de mesure' };
  return { etat: 'vert', rouges, oranges, phrase: 'Tout fonctionne' };
}

/** La phrase du client pour un voyant : ni code, ni temps, ni jargon. */
function phraseClient(v) {
  if (!v || v.etat === 'gris') return 'Pas encore mesuré';
  if (v.etat === 'vert') return 'Fonctionne normalement';
  if (v.genre === 'panne') return `Inaccessible depuis ${heureParis(v.depuis) || 'quelques minutes'}. Nous sommes dessus.`;
  if (v.genre === 'echec') return 'Une vérification a échoué, nous revérifions';
  if (v.genre === 'lent') return "Plus lent que d'habitude";
  if (v.genre === 'plantages') return v.etat === 'rouge' ? 'Des plantages repérés, nous les corrigeons' : 'Quelques plantages repérés, nous les suivons';
  return 'Quelques erreurs repérées, nous les suivons';
}

/* La bande de disponibilité du client : 48 demi-heures, une lettre chacune
   (v : tout a répondu, o : un échec, r : la moitié au moins, - : pas de mesure). */
function bandeDe(serie) {
  let bande = '';
  for (let i = 0; i < SEAUX; i += 6) {
    const n = (serie.n || []).slice(i, i + 6).reduce((a, b) => a + b, 0);
    const ko = (serie.ko || []).slice(i, i + 6).reduce((a, b) => a + b, 0);
    bande += !n ? '-' : !ko ? 'v' : ko * 2 >= n ? 'r' : 'o';
  }
  return bande;
}

/** Ce que le client lit dans sa salle de contrôle. */
function salleClient({ voyants, sondes = {} }) {
  const cles = ORDRE.filter((c) => voyants && voyants[c]);
  const services = cles.map((c) => ({ cle: c, nom: SERVICES[c].client, etat: voyants[c].etat, phrase: phraseClient(voyants[c]) }));
  const rouges = services.filter((s) => s.etat === 'rouge').length;
  const oranges = services.filter((s) => s.etat === 'orange').length;
  const mesures = services.filter((s) => s.etat !== 'gris').length;
  const global = rouges
    ? { etat: 'rouge', phrase: rouges > 1 ? `${rouges} services perturbés, nous sommes dessus` : 'Un service perturbé, nous sommes dessus' }
    : oranges ? { etat: 'orange', phrase: 'Tout fonctionne, un point est suivi de près' }
      : mesures ? { etat: 'vert', phrase: 'Tout fonctionne' } : { etat: 'gris', phrase: 'Les premières mesures arrivent' };
  const dispo = ['web', 'landing', 'fonctions'].filter((c) => sondes[c] && sondes[c].le && voyants[c])
    .map((c) => ({ cle: c, nom: SERVICES[c].client, pct: dispoDe(sondes[c]), bande: bandeDe(sondes[c]) }));
  return { global, services, dispo };
}

exports._adresseSondable = adresseSondable;
exports._ipPrivee = ipPrivee;
exports._ajouterAuSeau = ajouterAuSeau;
exports._dispoDe = dispoDe;
exports._suivreSonde = suivreSonde;
exports._erreursDe = erreursDe;
exports._chiffresErreurs = chiffresErreurs;
exports._sessions24De = sessions24De;
exports._voyantsDe = voyantsDe;
exports._globalDe = globalDe;
exports._phraseClient = phraseClient;
exports._bandeDe = bandeDe;
exports._salleClient = salleClient;
exports._servicesDe = servicesDe;
exports.adresseSondable = adresseSondable;
exports._sonder = (url) => sonder(url);
exports.SERVICES = SERVICES;
exports.SEAUX = SEAUX;
exports.TRANCHES = TRANCHES;

/* ==========================================================================
   2. La sonde
   ========================================================================== */

/** L'hôte répond-il depuis une adresse privée ? (Hors émulateur.) */
async function hotePrive(hote) {
  try {
    const adresses = await dns.lookup(hote, { all: true, verbatim: true });
    return !adresses.length || adresses.some((a) => ipPrivee(a.address));
  } catch (err) {
    return false;
  }
}

/**
 * Un GET, sans corps, sans jeton, sans suivre de redirection : le code HTTP
 * et le temps jusqu'aux en-têtes. La réponse n'est pas lue.
 */
async function sonder(url) {
  const debut = Date.now();
  if (!SUR_EMULATEUR && await hotePrive(new URL(url).hostname)) return { ok: false, code: 0, ms: 0, raison: 'adresse refusée' };
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), DELAI_SONDE_MS);
  try {
    const r = await fetch(url, {
      method: 'GET', redirect: 'manual', signal: arret.signal, cache: 'no-store',
      headers: { 'User-Agent': 'Capmedia-Sonde/1.0', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5', 'Cache-Control': 'no-cache' },
    });
    const ms = Date.now() - debut;
    try { if (r.body) await r.body.cancel(); } catch (err) { /* déjà fermé */ }
    const ok = r.status >= 200 && r.status < 400;
    return { ok, code: r.status, ms, raison: ok ? '' : `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, code: 0, ms: Date.now() - debut, raison: err && err.name === 'AbortError' ? 'délai dépassé' : 'injoignable' };
  } finally { clearTimeout(minuteur); }
}

/** Les adresses à sonder d'un projet relié, le Hub compris. */
function sondesDe(liaison) {
  const brut = (liaison && liaison.sondes) || {};
  const sortie = {};
  for (const cle of ['web', 'landing', 'fonctions']) {
    const u = adresseSondable(brut[cle]);
    if (u) sortie[cle] = u;
  }
  const hub = SUR_EMULATEUR ? adresseSondable(brut.hub) : HUB_SONDE;
  if (hub) sortie.hub = hub;
  return sortie;
}

/* ==========================================================================
   3. Le relevé rapide de Sentry
   ========================================================================== */

/* Un relevé rapide à la fois : le battement et l'écran qui s'ouvre ne
   relèvent pas deux fois dans la même minute. */
async function reserverRapide(pid, maintenant) {
  const ref = bdd.doc(`controle/${pid}`);
  return bdd.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || {};
    if (maintenant - enMillis(d.rapideReserve) < PAUSE_RAPIDE_MS) return false;
    tx.set(ref, { rapideReserve: maintenant }, { merge: true });
    return true;
  });
}

/**
 * Les erreurs des 24 h par tranche de dix minutes (web, iPhone, Android)
 * et, tous les cinq minutes au plus, les sessions des 24 h. Deux ou trois
 * appels. Une étape refusée garde la valeur d'avant et le dit.
 */
async function releveRapide(pid, liaison, { maintenant = new Date() } = {}) {
  const jeton = sentry.jetonSentry();
  const ref = bdd.doc(`controle/${pid}`);
  const avant = (await ref.get()).data() || {};
  if (!jeton) {
    await ref.set({ rapide: { le: maintenant, ok: false, appels: 0, erreurs: [{ etape: 'jeton', message: 'Le secret SENTRY_JETON est absent.' }] } }, { merge: true });
    return { ok: false };
  }
  let l = liaison;
  if (!l.ids || (l.ids.web === undefined && l.ids.mobile === undefined)) l = (await sentry.lireLiaison(pid)) || l;
  const ids = l.ids || {};
  if (!ids.web && !ids.mobile) return { ok: false, motif: 'identifiants Sentry pas encore relevés' };
  const contexte = { hote: sentry.hoteDe(l), jeton, appels: 0 };
  const erreurs = [];
  const etape = async (nom, fn) => { try { return await fn(); } catch (err) { erreurs.push({ etape: nom, code: err.code || 0, message: String(err.message || '').slice(0, 160) }); return undefined; } };
  const commun = [['yAxis', 'count()'], ['interval', '10m'], ['statsPeriod', '24h'], ['dataset', 'errors'], ['referrer', 'api.capmedia.controle']];
  const web = ids.web ? await etape('heures-web', () => sentry.appel(contexte, `organizations/${l.org}/events-stats/`, [['project', ids.web], ...commun])) : undefined;
  const mobile = ids.mobile ? await etape('heures-mobile', () => sentry.appel(contexte, `organizations/${l.org}/events-stats/`, [
    ['project', ids.mobile], ...commun, ['field', 'os.name'], ['field', 'count()'], ['topEvents', '5'], ['orderby', '-count()'],
  ])) : undefined;
  /* Les tranches se rangent à l'heure de la réponse, pas à celle du
     battement : une frontière de dix minutes franchie entre les deux
     décalerait toute la série. */
  const t = Date.now();
  const champs = { erreurs: erreursDe({ web, mobile }, t, avant.erreurs || {}) };
  if (t - enMillis((avant.sessions24 || {}).le) >= PAUSE_SESSIONS_MS) {
    const projets = [ids.web, ids.mobile].filter(Boolean).map((id) => ['project', id]);
    const s = await etape('sessions-24h', () => sentry.appel(contexte, `organizations/${l.org}/sessions/`, [
      ...projets, ['field', 'sum(session)'], ['field', 'count_unique(user)'], ['field', 'crash_free_rate(session)'],
      ['groupBy', 'project'], ['statsPeriod', '24h'], ['interval', '1h'], ['includeSeries', '1'],
    ]));
    if (s && Array.isArray(s.groups)) champs.sessions24 = { ...sessions24De(s, l), le: maintenant };
  }
  champs.rapide = { le: maintenant, ok: !erreurs.length, appels: contexte.appels, erreurs };
  await ref.set({ ...champs, maj: FieldValue.serverTimestamp() }, { mergeFields: [...Object.keys(champs), 'maj'] });
  return { ok: !erreurs.length, appels: contexte.appels, erreurs };
}

/* ==========================================================================
   4. Les voyants, et la vue du client
   ========================================================================== */

/** Recalcule les voyants d'un projet et récrit la vue du client. Sans appel à Sentry. */
async function recalculer(pid, { liaison = null, maintenant = new Date() } = {}) {
  const l = liaison || await sentry.lireLiaison(pid);
  if (!l || l.actif === false) return null;
  const t = maintenant.getTime();
  const [c, a] = await Promise.all([
    bdd.doc(`controle/${pid}`).get(),
    bdd.collection(`sentry/${pid}/alertes`).where('le', '>=', new Date(t - HEURE_MS)).get(),
  ]);
  const d = c.data() || {};
  const sondes = d.sondes || {};
  const voyants = voyantsDe({ liaison: l, sondes, erreurs: d.erreurs || {}, sessions24: d.sessions24 || {}, alertes: a.docs.map((x) => x.data()), maintenant: t });
  const global = globalDe(voyants);
  await bdd.doc(`controle/${pid}`).set({ voyants, global, calcule: maintenant, maj: FieldValue.serverTimestamp() }, { mergeFields: ['voyants', 'global', 'calcule', 'maj'] });
  await bdd.doc(`projets/${pid}/stabilite/salle`).set({ ...salleClient({ voyants, sondes }), maj: FieldValue.serverTimestamp() });
  return { voyants, global };
}

/* ==========================================================================
   5. Le battement
   ========================================================================== */

/* Une cloche par service et par demi-heure au plus. */
async function reserverCloche(pid, cle) {
  const ref = bdd.doc(`sentry/${pid}/debits/sonde-${cle}`);
  return bdd.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (d.exists && Date.now() - enMillis(d.data().le) < DEBIT_SONDE_MS) return false;
    tx.set(ref, { le: new Date() });
    return true;
  });
}

const TITRES_SONDE = {
  panne: (cle) => (cle === 'web' || cle === 'landing' ? 'Site en panne' : 'Service en panne'),
  retabli: (cle) => (cle === 'web' || cle === 'landing' ? 'Site rétabli' : 'Service rétabli'),
};
const minutesEntre = (a, b) => Math.max(1, Math.round((enMillis(b) - enMillis(a)) / 60000));

/** Une panne ou un retour : l'alerte du fil, la cloche de l'équipe. */
async function annoncer(pid, e, projetNom) {
  const nom = SERVICES[e.cle].nom;
  const texte = e.evenement === 'panne'
    ? `${nom} : ${raisonPanne(e.sonde.panne)}`
    : `${nom}, après ${minutesEntre((e.panneFinie || {}).debut, e.sonde.le)} min`;
  const fiche = {
    type: e.evenement, titre: TITRES_SONDE[e.evenement](e.cle), texte, app: e.cle, issue: '', court: '',
    incident: e.evenement === 'panne' ? e.sonde.incident || '' : e.incidentFini || '',
    niveau: e.evenement === 'panne' ? 'fatal' : 'info', regle: '', lien: '', le: FieldValue.serverTimestamp(), source: 'sonde',
  };
  await sentry.ajouterAlerte(pid, fiche);
  if (await reserverCloche(pid, `${e.evenement}-${e.cle}`)) {
    await communication.notifierEquipe(pid, {
      type: 'sentry', titre: `${fiche.titre} · ${nom}`, texte: `${texte}${projetNom ? ` · ${projetNom}` : ''}`.slice(0, 200),
      lien: `#/projets/${pid}/controle`, projet: pid,
    });
  }
}

/** Le battement d'un projet : ses sondes, son relevé, ses voyants. */
async function battreProjet(liaison, adresses, mesures, maintenant) {
  const pid = liaison.projet;
  const ref = bdd.doc(`controle/${pid}`);
  const evenements = [];
  await bdd.runTransaction(async (tx) => {
    evenements.length = 0;
    const avant = (await tx.get(ref)).data() || {};
    const sondes = {};
    for (const [cle, url] of Object.entries(adresses)) {
      const mesure = mesures.get(url);
      if (!mesure) continue;
      const r = suivreSonde((avant.sondes || {})[cle], mesure, { le: maintenant, seuilLent: SEUIL_LENT_MS[cle] || SEUIL_LENT_MS.defaut });
      sondes[cle] = { ...r.sonde, nom: SERVICES[cle].nom, hote: new URL(url).host };
      if (r.evenement === 'panne') {
        const inc = bdd.collection(`controle/${pid}/incidents`).doc();
        sondes[cle].incident = inc.id;
        tx.set(inc, { cible: cle, nom: SERVICES[cle].nom, hote: new URL(url).host, debut: r.sonde.panne.debut, fin: null, code: r.sonde.panne.code, raison: r.sonde.panne.raison, minutes: null, ticket: null });
      }
      if (r.evenement === 'retabli' && r.incidentFini) {
        tx.set(bdd.doc(`controle/${pid}/incidents/${r.incidentFini}`), { fin: maintenant, minutes: minutesEntre((r.panneFinie || {}).debut, maintenant) }, { merge: true });
      }
      if (r.evenement) evenements.push({ cle, ...r, sonde: sondes[cle] });
    }
    tx.set(ref, { sondes, battement: maintenant, maj: FieldValue.serverTimestamp() }, { mergeFields: ['sondes', 'battement', 'maj'] });
  });
  if (evenements.length) {
    const projet = (await bdd.doc(`projets/${pid}`).get()).data() || {};
    for (const e of evenements) await annoncer(pid, e, projet.nom || '');
    /* Garder les trente derniers incidents. */
    const vieux = await bdd.collection(`controle/${pid}/incidents`).orderBy('debut', 'desc').offset(INCIDENTS_GARDES).limit(20).get();
    if (!vieux.empty) { const lot = bdd.batch(); vieux.docs.forEach((d) => lot.delete(d.ref)); await lot.commit(); }
  }

  /* Sentry : le relevé complet au quart d'heure ; le rapide chaque minute
     tant qu'un écran est ouvert, sinon au quart d'heure lui aussi. */
  if (liaison.web || liaison.mobile) {
    const t = maintenant.getTime();
    const s = (await bdd.doc(`sentry/${pid}`).get()).data() || {};
    if (t - enMillis(s.releve && s.releve.le) >= PAUSE_COMPLET_MS) {
      await sentry.synchroniser(pid, { liaison, raison: 'planifie' }).catch((err) => console.error(`Sentry : relevé de ${pid}`, err));
    }
    const d = (await ref.get()).data() || {};
    const ecranOuvert = t - enMillis(d.ecranVu) < ECRAN_PRESENT_MS;
    const age = t - enMillis(d.rapide && d.rapide.le);
    if ((ecranOuvert || age >= PAUSE_COMPLET_MS) && await reserverRapide(pid, t)) {
      await releveRapide(pid, liaison, { maintenant }).catch((err) => console.error(`Sentry : relevé rapide de ${pid}`, err));
    }
  }
  await recalculer(pid, { liaison, maintenant });
}

/** Chaque minute : chaque projet relié. Une adresse partagée n'est sondée qu'une fois. */
async function battement(maintenant = new Date()) {
  const q = await bdd.collection('sentryLiaisons').where('actif', '==', true).get();
  const liaisons = q.docs.map((d) => ({ projet: d.id, ...d.data() }));
  const adressesDe = new Map(liaisons.map((l) => [l.projet, sondesDe(l)]));
  const urls = [...new Set([...adressesDe.values()].flatMap((a) => Object.values(a)))];
  const mesures = new Map(await Promise.all(urls.map(async (u) => [u, await sonder(u)])));
  for (const l of liaisons) {
    try { await battreProjet(l, adressesDe.get(l.projet), mesures, maintenant); } catch (err) { console.error(`Salle de contrôle : battement de ${l.projet} en échec`, err); }
  }
  return { projets: liaisons.length, sondes: urls.length };
}

exports.battement = battement;
exports.recalculer = recalculer;
exports.releveRapide = releveRapide;

/* ==========================================================================
   6. Les gestes du Cockpit (appelés par suiviAdmin, droits déjà vérifiés)
   ========================================================================== */

/**
 * Un écran de contrôle est ouvert : il le dit chaque minute. Le battement
 * relève alors Sentry à la minute ; et le premier signal relève tout de
 * suite, pour que l'écran s'ouvre sur des chiffres frais.
 */
exports.ecran = async (identite, corps) => {
  const pid = String(corps.projet || '');
  const l = await sentry.lireLiaison(pid);
  if (!l || l.actif === false) throw new Refus(404, "Ce projet n'est pas relié à la salle de contrôle.");
  const ref = bdd.doc(`controle/${pid}`);
  const d = (await ref.get()).data() || {};
  const maintenant = new Date();
  if (maintenant - enMillis(d.ecranVu) >= PAUSE_SIGNAL_MS) await ref.set({ ecranVu: maintenant }, { merge: true });
  let rapide = false;
  if ((l.web || l.mobile) && await reserverRapide(pid, maintenant.getTime())) {
    await releveRapide(pid, l, { maintenant });
    await recalculer(pid, { liaison: l, maintenant });
    rapide = true;
  }
  return { ok: true, rapide };
};

const URGENCES = ['bloquant', 'critique', 'important', 'mineur'];
const TICKET_FERME = ['resolu', 'ferme', 'refuse', 'annulee'];
const ID_INCIDENT = /^[A-Za-z0-9]{10,40}$/;

/**
 * Un incident de disponibilité devient un ticket, comme une erreur de
 * Sentry : le client lit le titre et le texte écrits pour lui ; l'adresse,
 * le code HTTP et les heures partent dans une note interne.
 */
exports.versTicket = async (identite, corps) => {
  const pid = String(corps.projet || '');
  const incidentId = String(corps.incident || '');
  if (!ID_INCIDENT.test(incidentId)) throw new Refus(400, 'Incident inconnu.');
  const titre = sentry._epurer(corps.titre, 120);
  const description = sentry._epurer(corps.description, 6000, { lignes: true });
  if (!titre) throw new Refus(400, 'Le titre du ticket est requis.');
  if (!description) throw new Refus(400, 'Dites au client, en une phrase, ce qui se passe.');
  const incRef = bdd.doc(`controle/${pid}/incidents/${incidentId}`);
  const inc = await incRef.get();
  if (!inc.exists) throw new Refus(404, 'Cet incident est introuvable.');
  const i = inc.data();
  const lienRef = bdd.doc(`sentry/${pid}/tickets/incident-${incidentId}`);
  const deja = await lienRef.get();
  if (deja.exists) {
    const t = await bdd.doc(`tickets/${deja.data().ticket}`).get();
    if (t.exists && !TICKET_FERME.includes(t.data().statut) && t.data().archive !== true) throw new Refus(409, `Cet incident a déjà son ticket ${t.data().numero || ''}.`.replace(' .', '.'));
  }
  const urgence = URGENCES.includes(corps.urgence) ? corps.urgence : 'critique';
  const nom = String((identite.fiche || {}).nom || EQUIPE_NOM).slice(0, 120);
  const plateforme = i.cible === 'web' || i.cible === 'landing' ? 'web' : '';
  const date = (v) => (enMillis(v) ? new Date(enMillis(v)).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '');
  const note = [
    `Né d'un incident de disponibilité : ${(SERVICES[i.cible] || {}).nom || i.cible} (${i.hote || ''})`,
    `Début : ${date(i.debut)}${i.fin ? ` · fin : ${date(i.fin)} (${i.minutes || minutesEntre(i.debut, i.fin)} min)` : ' · toujours en cours'}`,
    `Réponse : ${i.code ? `HTTP ${i.code}` : (i.raison || 'injoignable')}`,
  ].join('\n');
  const ticketRef = bdd.collection('tickets').doc();
  const lot = bdd.batch();
  lot.set(ticketRef, {
    numero: null, projet: pid, composant: '', titre, description, type: 'bug', urgence, statut: 'en-cours',
    plateforme, version: '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [],
    assigne: null, auteur: { uid: identite.uid, nom, email: '', cote: 'equipe' }, pieces: [], archive: false, resolu: null, qualification: null, devis: null,
    lu: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
  });
  lot.set(ticketRef.collection('messages').doc(), { de: { uid: identite.uid, nom, cote: 'equipe' }, texte: note.slice(0, 6000), pieces: [], interne: true, date: FieldValue.serverTimestamp() });
  lot.set(lienRef, {
    ticket: ticketRef.id, issue: '', incident: incidentId, court: '', app: i.cible, plateforme, occurrences: 0, personnes: 0,
    versions: [], plateformes: [], lien: '', premiere: i.debut || null, par: { uid: identite.uid, nom }, cree: FieldValue.serverTimestamp(),
  });
  lot.set(incRef, { ticket: ticketRef.id }, { merge: true });
  await lot.commit();
  await audit('controle.ticket', { projet: pid, incident: incidentId, ticket: ticketRef.id, par: identite.uid });
  await sentry.ecrireResume(pid);
  return { ok: true, id: ticketRef.id };
};

/* ==========================================================================
   7. La fonction planifiée
   ========================================================================== */

/* Le nom reste « sentryReleve » : c'est la même tâche Cloud Scheduler, qui
   bat désormais chaque minute (aucune tâche de plus). */
exports.sentryReleve = onSchedule(
  { region: REGION, schedule: 'every 1 minutes', timeZone: 'Europe/Paris', secrets: [SENTRY_JETON], timeoutSeconds: 120, retryCount: 0 },
  async () => { await battement(new Date()); },
);
