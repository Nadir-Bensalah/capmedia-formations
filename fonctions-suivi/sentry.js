/* ==========================================================================
   CAPMEDIA CLIENT HUB · Sentry, relevé et alertes

   Ce que Sentry voit d'une application, ramené dans le Hub sans que le
   navigateur touche jamais au jeton. Trois portes :

   1. Le relevé (sentryReleve, toutes les quinze minutes, et « Actualiser »
      dans le Cockpit par suiviAdmin) lit l'API de Sentry et écrit deux
      synthèses :
        sentry/{p}                     le détail, pour l'équipe du projet ;
        projets/{p}/stabilite/resume   la vue du client : un taux par
                                       plateforme, une tendance, et les
                                       tickets ouverts nés d'une erreur.
      Cinq appels par relevé (erreurs ouvertes, erreurs du jour, sessions,
      versions web et mobile), six la première fois (la liste des projets),
      soit moins de 500 par jour pour un projet : l'offre gratuite de
      Sentry ne limite que le débit, et on en reste loin.

   2. Le webhook (sentryWebhook) reçoit les alertes en direct d'une
      intégration interne Sentry : nouvelle erreur, erreur revenue, pic.
      La signature (HMAC SHA-256 du corps brut, secret de l'intégration)
      est vérifiée avant toute lecture. Une alerte s'écrit dans
      sentry/{p}/alertes et prévient l'équipe du projet (cloche), une fois
      par erreur et par six heures au plus : un même envoi rejoué ne
      réveille personne deux fois.

   3. « Créer un ticket » (sentryVersTicket, suiviAdmin) : l'erreur devient
      un ticket du projet, écrit en clair pour le client. Le lien Sentry,
      les occurrences, les versions et les plateformes partent dans une
      note interne du ticket, invisible au client.

   Aucune donnée personnelle ne sort de Sentry : titres et lieux passent
   par « epurer » (adresses, adresses IP, longs nombres, jetons, paramètres
   d'URL), et rien de l'utilisateur d'un événement n'est lu.

   La liaison d'un projet (sentryLiaisons/{p}) dit l'organisation et les
   deux projets Sentry (web, mobile). Secrets : SENTRY_JETON (jeton en
   lecture de l'intégration interne), SENTRY_WEBHOOK_SECRET (son secret
   client). Sur l'émulateur seul, la liaison peut nommer un hôte local :
   c'est le faux serveur Sentry du banc.
   ========================================================================== */

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { bdd, REGION, FieldValue, Refus, audit, enMillis } = require('./commun');
const communication = require('./communication');

const SENTRY_JETON = defineSecret('SENTRY_JETON');
const SENTRY_WEBHOOK_SECRET = defineSecret('SENTRY_WEBHOOK_SECRET');

const HOTE_SENTRY = 'https://de.sentry.io';
const SUR_EMULATEUR = process.env.FUNCTIONS_EMULATOR === 'true';
/* Sur le banc (émulateurs), comme pour le push : des valeurs fixes, connues
   du faux serveur Sentry et de la suite, jamais les vrais secrets. */
const SUR_BANC = SUR_EMULATEUR && Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const JETON_BANC = 'banc-sentry-jeton';
const SECRET_BANC = 'banc-sentry-secret';
const EQUIPE_NOM = 'Équipe Capmedia';

/* Le rythme. Un relevé à la main n'est pas relancé avant une minute ; le
   webhook ne relance un relevé que si le dernier a plus de deux minutes. */
const PAUSE_MANUELLE_MS = 60 * 1000;
const PAUSE_WEBHOOK_MS = 2 * 60 * 1000;
const DEBIT_ALERTE_MS = 6 * 3600 * 1000;
const ALERTES_GARDEES = 50;
const PROBLEMES_LUS = 25;
/* En dessous, un taux ne veut rien dire : 1 session sur 1 fait 100 %. */
const SESSIONS_MINIMUM = 20;

const SLUG = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const ID_ISSUE = /^[0-9]{1,20}$/;

/* ==========================================================================
   1. Les décisions pures (exposées pour l'épreuve)
   ========================================================================== */

/**
 * Retire d'un texte venu de Sentry ce qui pourrait désigner une personne
 * ou un secret : adresses, adresses IP, numéros de plus de cinq chiffres,
 * jetons, paramètres d'URL. Puis borne la longueur.
 */
function epurer(texte, max = 160, { lignes = false } = {}) {
  let t = String(texte == null ? '' : texte);
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[adresse]');
  t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
  t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]');
  t = t.replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, '[jeton]');
  t = t.replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, '[jeton]');
  t = t.replace(/\b\d{6,}\b/g, '[n]');
  t = t.replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1');
  /* Un numéro de téléphone : neuf chiffres au moins (une date en a huit). */
  t = t.replace(/\+?\d[\d .-]{7,}\d/g, (m) => (m.replace(/\D/g, '').length >= 9 ? '[n]' : m));
  t = lignes ? t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : t.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** La plateforme d'un système d'exploitation, côté mobile. */
const plateformeDeSysteme = (os) => {
  const s = String(os || '').toLowerCase();
  if (/^(ios|ipados|iphone os)/.test(s)) return 'ios';
  if (/^android/.test(s)) return 'android';
  return 'autre';
};

/** L'application d'un projet Sentry, d'après la liaison : web ou mobile. */
const appDe = (liaison, projet) => {
  if (!liaison || !projet) return '';
  const slug = typeof projet === 'object' ? projet.slug : projet;
  const id = typeof projet === 'object' ? String(projet.id || '') : String(projet);
  const ids = liaison.ids || {};
  if (slug && slug === liaison.web) return 'web';
  if (slug && slug === liaison.mobile) return 'mobile';
  if (id && ids.web && String(ids.web) === id) return 'web';
  if (id && ids.mobile && String(ids.mobile) === id) return 'mobile';
  return '';
};

/** Minuit à Paris, pour « les erreurs du jour ». */
function minuitParis(maintenant = new Date()) {
  const [a, m, j] = maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }).split('-').map(Number);
  const utc = Date.UTC(a, m - 1, j);
  const heureParis = Number(new Date(utc).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) % 24;
  return new Date(utc - heureParis * 3600 * 1000);
}

/** Un lien vers Sentry, et seulement vers Sentry (ou le faux serveur du banc). */
function lienSentry(url, { org, id } = {}) {
  /* Sans paramètres : une recherche de Sentry peut porter une adresse. */
  const u = String(url || '').split(/[?#]/)[0];
  if (/^https:\/\/([a-z0-9-]+\.)*sentry\.io\/\S*$/i.test(u)) return u.slice(0, 500);
  if (SUR_EMULATEUR && /^http:\/\/127\.0\.0\.1:\d+\/\S*$/.test(u)) return u.slice(0, 500);
  return org && id ? `https://${org}.sentry.io/issues/${id}/` : '';
}

/** Le taux moyen d'une série, pondéré par le nombre de sessions. */
function tauxPondere(taux, sessions) {
  let somme = 0; let n = 0;
  (taux || []).forEach((t, i) => {
    const s = Number((sessions || [])[i]) || 0;
    if (t === null || t === undefined || !s) return;
    somme += Number(t) * s; n += s;
  });
  return n ? { taux: somme / n, sessions: n } : { taux: null, sessions: 0 };
}

/**
 * La stabilité d'une application sur quatorze jours, quotidienne : la
 * semaine écoulée, la précédente, et le sens. Un écart de moins d'un
 * dixième de point est « stable ».
 */
function stabiliteDe(serieTaux, serieSessions, jours = []) {
  const n = Math.min((serieTaux || []).length, (serieSessions || []).length);
  const taux = (serieTaux || []).slice(0, n);
  const sessions = (serieSessions || []).slice(0, n);
  const semaine = tauxPondere(taux.slice(-7), sessions.slice(-7));
  const avant = tauxPondere(taux.slice(-14, -7), sessions.slice(-14, -7));
  let tendance = null;
  if (semaine.sessions >= SESSIONS_MINIMUM && avant.sessions >= SESSIONS_MINIMUM) {
    const ecart = (semaine.taux - avant.taux) * 100;
    tendance = ecart > 0.1 ? 'mieux' : ecart < -0.1 ? 'moins' : 'stable';
  }
  return {
    taux: semaine.sessions ? Math.round(semaine.taux * 100000) / 1000 : null,
    sessions: semaine.sessions,
    tauxAvant: avant.sessions ? Math.round(avant.taux * 100000) / 1000 : null,
    sessionsAvant: avant.sessions,
    tendance,
    mesurable: semaine.sessions >= SESSIONS_MINIMUM,
    serie: taux.map((t, i) => ({ jour: String(jours[i] || '').slice(0, 10), taux: t === null || t === undefined ? null : Math.round(Number(t) * 100000) / 1000, sessions: Number(sessions[i]) || 0 })),
  };
}

const SOUS_STATUTS = { new: 'nouvelle', regressed: 'regression', escalating: 'hausse', ongoing: 'en-cours', archived_until_escalating: 'en-cours' };

/** Une erreur ouverte, telle que l'équipe la lit. */
function problemeDe(issue, liaison, debutJour) {
  const stats = ((issue.stats || {})['24h']) || [];
  const jour = stats.reduce((n, [ts, v]) => (Number(ts) * 1000 >= debutJour.getTime() ? n + (Number(v) || 0) : n), 0);
  return {
    id: String(issue.id || ''),
    court: epurer(issue.shortId, 40),
    titre: epurer(issue.title, 160) || 'Erreur sans titre',
    lieu: epurer(issue.culprit, 160),
    niveau: ['fatal', 'error', 'warning', 'info', 'debug'].includes(issue.level) ? issue.level : 'error',
    app: appDe(liaison, issue.project) || 'web',
    occurrences: Number(issue.count) || 0,
    personnes: Number(issue.userCount) || 0,
    jour,
    premiere: issue.firstSeen ? new Date(issue.firstSeen) : null,
    derniere: issue.lastSeen ? new Date(issue.lastSeen) : null,
    etat: SOUS_STATUTS[issue.substatus] || 'en-cours',
    nonGere: issue.isUnhandled === true,
    lien: lienSentry(issue.permalink, { org: liaison.org, id: issue.id }),
  };
}

/**
 * Les erreurs du jour par application, d'après la requête Discover groupée
 * par projet, système et erreur : une erreur vue sur deux navigateurs ne
 * compte qu'une fois parmi les erreurs distinctes.
 */
function erreursDuJour(lignes, liaison) {
  const jour = { web: { erreurs: 0, problemes: 0 }, ios: { erreurs: 0, problemes: 0 }, android: { erreurs: 0, problemes: 0 }, autre: { erreurs: 0, problemes: 0 }, source: 'evenements' };
  const distinctes = { web: new Set(), ios: new Set(), android: new Set(), autre: new Set() };
  for (const l of lignes || []) {
    const app = appDe(liaison, l.project || l['project.name']);
    if (!app) continue;
    const cle = app === 'web' ? 'web' : plateformeDeSysteme(l['os.name']);
    jour[cle].erreurs += Number(l['count()']) || 0;
    distinctes[cle].add(String(l.issue || l['issue.id'] || ''));
  }
  Object.keys(distinctes).forEach((k) => { distinctes[k].delete(''); jour[k].problemes = distinctes[k].size; });
  return jour;
}

/** À défaut de Discover, les erreurs du jour d'après les erreurs ouvertes (sans iPhone ni Android). */
function erreursDuJourParProblemes(problemes) {
  const jour = { web: { erreurs: 0, problemes: 0 }, mobile: { erreurs: 0, problemes: 0 }, source: 'problemes' };
  for (const p of problemes || []) {
    if (!p.jour) continue;
    const cle = p.app === 'mobile' ? 'mobile' : 'web';
    jour[cle].erreurs += p.jour; jour[cle].problemes += 1;
  }
  return jour;
}

/** Une version, telle que le relevé des versions la rend. */
function versionDe(release, app) {
  const projet = (release.projects || []).find((p) => p.healthData) || (release.projects || [])[0] || {};
  const h = projet.healthData || {};
  const info = release.versionInfo || {};
  return {
    app,
    version: epurer(release.version, 120),
    libelle: epurer(info.description || release.shortVersion || release.version, 60),
    sessions: Number(h.totalSessions) || 0,
    sessions24h: Number(h.totalSessions24h) || 0,
    sansPlantage: typeof h.crashFreeSessions === 'number' ? Math.round(h.crashFreeSessions * 1000) / 1000 : null,
    utilisateursSansPlantage: typeof h.crashFreeUsers === 'number' ? Math.round(h.crashFreeUsers * 1000) / 1000 : null,
    plantages: Number(h.sessionsCrashed) || 0,
    adoption: typeof h.adoption === 'number' ? Math.round(h.adoption * 10) / 10 : null,
    nouvelles: Number(projet.newGroups != null ? projet.newGroups : release.newGroups) || 0,
    creee: release.dateCreated ? new Date(release.dateCreated) : null,
  };
}

const TICKET_FERME = ['resolu', 'ferme', 'refuse', 'annulee'];

/**
 * Ce que le client lit. Rien de technique : un taux par application, la
 * tendance, et les tickets ouverts nés d'une erreur (leur titre est celui
 * que l'équipe a écrit pour lui, la page le lit sur le ticket même).
 */
function resumeClient(synthese, liens) {
  const apps = [];
  const libelles = { web: 'Site web', mobile: 'Application mobile' };
  for (const cle of ['web', 'mobile']) {
    const s = ((synthese || {}).stabilite || {})[cle];
    if (!s || !s.sessions) continue;
    apps.push({
      cle, libelle: libelles[cle],
      taux: s.mesurable ? s.taux : null,
      tendance: s.mesurable ? s.tendance : null,
      tauxAvant: s.mesurable && s.tendance ? s.tauxAvant : null,
    });
  }
  const corrections = (liens || [])
    .filter((l) => l && l.ticket && !l.ferme)
    .map((l) => ({ ticket: String(l.ticket), plateforme: ['ios', 'android', 'web'].includes(l.plateforme) ? l.plateforme : '', reperee: l.premiere || null }))
    .slice(0, 30);
  return { apps, corrections };
}

/** La signature d'un envoi de Sentry : HMAC SHA-256 hexadécimal du corps brut. */
function signatureValide(corpsBrut, signature, secret) {
  if (!secret || !signature || !corpsBrut) return false;
  const attendue = crypto.createHmac('sha256', secret).update(corpsBrut).digest('hex');
  const recue = String(signature).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recue)) return false;
  return crypto.timingSafeEqual(Buffer.from(attendue, 'hex'), Buffer.from(recue, 'hex'));
}

/**
 * Ce que dit un envoi de Sentry, réduit à une alerte. Rend null quand il
 * n'y a rien à dire (assignation, archivage, installation...). Ne lit
 * jamais l'utilisateur de l'événement.
 */
function alerteDe(ressource, corps) {
  const action = String((corps || {}).action || '');
  const data = (corps || {}).data || {};
  if (ressource === 'issue') {
    const i = data.issue || {};
    const base = { issue: String(i.id || ''), court: epurer(i.shortId, 40), texte: epurer(i.title, 160), niveau: i.level || 'error', projet: i.project || null, lien: i.web_url || i.permalink || '' };
    if (action === 'created') return { ...base, type: 'nouvelle', titre: 'Nouvelle erreur' };
    if (action === 'unresolved') {
      const parUnHumain = (corps.actor || {}).type === 'user';
      return { ...base, type: parUnHumain ? 'rouverte' : 'regression', titre: parUnHumain ? 'Erreur rouverte' : 'Erreur revenue' };
    }
    if (action === 'resolved') return { ...base, type: 'resolue', titre: 'Erreur marquée corrigée' };
    return null;
  }
  if (ressource === 'event_alert' && action === 'triggered') {
    const e = data.event || {};
    const regle = epurer(data.triggered_rule || (data.issue_alert || {}).title || '', 80);
    const pic = /pic|spike|hausse|fr[ée]quence|frequency/i.test(regle);
    const os = ((e.contexts || {}).os || {}).name || '';
    return {
      type: pic ? 'pic' : 'alerte', titre: pic ? "Pic d'erreurs" : `Alerte : ${regle || 'règle Sentry'}`,
      issue: String(e.issue_id || e.group_id || ''), court: '', texte: epurer(e.title, 160), niveau: e.level || 'error',
      projet: e.project != null ? { id: e.project } : null, lien: e.web_url || '', regle, plateforme: plateformeDeSysteme(os) === 'autre' ? '' : plateformeDeSysteme(os),
    };
  }
  if (ressource === 'metric_alert' && ['critical', 'warning', 'resolved'].includes(action)) {
    const m = data.metric_alert || {};
    const regle = (m.alert_rule || {});
    const projets = regle.projects || [];
    return {
      type: action === 'resolved' ? 'calme' : 'pic', titre: action === 'resolved' ? 'Retour au calme' : "Pic d'erreurs",
      issue: '', court: '', texte: epurer(data.description_title || m.title || regle.name || '', 160), niveau: action === 'critical' ? 'fatal' : 'warning',
      projet: projets.length ? { slug: projets[0] } : null, lien: data.web_url || '', regle: epurer(regle.name || '', 80),
    };
  }
  return null;
}

/* Les alertes qui méritent la cloche : le reste se lit sur la page. */
const ALERTES_SONNANTES = ['nouvelle', 'regression', 'pic', 'alerte'];

exports._epurer = epurer;
exports._appDe = appDe;
exports._minuitParis = minuitParis;
exports._stabiliteDe = stabiliteDe;
exports._problemeDe = problemeDe;
exports._erreursDuJour = erreursDuJour;
exports._erreursDuJourParProblemes = erreursDuJourParProblemes;
exports._versionDe = versionDe;
exports._resumeClient = resumeClient;
exports._signatureValide = signatureValide;
exports._alerteDe = alerteDe;
exports._lienSentry = lienSentry;
exports.SESSIONS_MINIMUM = SESSIONS_MINIMUM;

/* ==========================================================================
   2. L'API de Sentry, en lecture
   ========================================================================== */

class ErreurSentry extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const hoteDe = (liaison) => {
  /* Sur l'émulateur seul, le faux serveur du banc. En production, l'hôte
     est fixe : une liaison ne peut pas envoyer le jeton ailleurs. */
  if (SUR_EMULATEUR && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(String((liaison || {}).hote || ''))) return liaison.hote;
  return HOTE_SENTRY;
};

const jetonSentry = () => {
  if (SUR_BANC) return JETON_BANC;
  try { return String(SENTRY_JETON.value() || '').trim(); } catch (err) { return ''; }
};

async function appel(contexte, chemin, params = []) {
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const url = `${contexte.hote}/api/0/${chemin}${qs ? `?${qs}` : ''}`;
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), 15000);
  contexte.appels += 1;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${contexte.jeton}`, Accept: 'application/json' }, signal: arret.signal });
    if (!r.ok) {
      const brut = await r.text().catch(() => '');
      throw new ErreurSentry(r.status, `${r.status} ${brut.slice(0, 120)}`.trim());
    }
    return r.json();
  } catch (err) {
    if (err instanceof ErreurSentry) throw err;
    throw new ErreurSentry(0, err && err.name === 'AbortError' ? 'délai dépassé' : 'injoignable');
  } finally { clearTimeout(minuteur); }
}

/* ==========================================================================
   3. Le relevé
   ========================================================================== */

async function lireLiaison(pid) {
  const d = await bdd.doc(`sentryLiaisons/${pid}`).get();
  return d.exists ? { projet: pid, ...d.data() } : null;
}

async function liensTickets(pid) {
  const q = await bdd.collection(`sentry/${pid}/tickets`).get();
  const liens = q.docs.map((d) => ({ issue: d.id, ...d.data() }));
  /* L'état du ticket se relit à l'instant : un ticket fermé n'est plus
     « en cours de correction ». */
  const fiches = liens.length ? await bdd.getAll(...liens.map((l) => bdd.doc(`tickets/${l.ticket}`))) : [];
  fiches.forEach((f, i) => {
    const t = f.exists ? f.data() : null;
    liens[i].ferme = !t || t.archive === true || TICKET_FERME.includes(t.statut);
    liens[i].numero = t ? (t.numero || '') : '';
  });
  return liens;
}

/** Récrit la vue du client depuis la synthèse et les tickets, sans appeler Sentry. */
async function ecrireResume(pid, synthese) {
  const s = synthese || ((await bdd.doc(`sentry/${pid}`).get()).data() || {});
  const resume = resumeClient(s, await liensTickets(pid));
  await bdd.doc(`projets/${pid}/stabilite/resume`).set({ ...resume, maj: FieldValue.serverTimestamp(), releve: s.releve && s.releve.le ? s.releve.le : null });
  return resume;
}

/**
 * Un relevé complet d'un projet lié. Chaque étape qui échoue garde la
 * valeur d'avant et le dit dans « etat » : une panne de Sentry ne vide
 * jamais l'écran.
 */
async function synchroniser(pid, { liaison = null, raison = 'planifie' } = {}) {
  const l = liaison || await lireLiaison(pid);
  if (!l || l.actif === false) throw new Refus(404, "Ce projet n'est pas relié à Sentry.");
  const jeton = jetonSentry();
  const ref = bdd.doc(`sentry/${pid}`);
  const avant = (await ref.get()).data() || {};
  const maintenant = new Date();
  if (!jeton) {
    await ref.set({ releve: { le: maintenant, ok: false, raison, erreurs: [{ etape: 'jeton', message: 'Le secret SENTRY_JETON est absent.' }], appels: 0 }, maj: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: false, message: 'Le secret SENTRY_JETON est absent.' };
  }
  const contexte = { hote: hoteDe(l), jeton, appels: 0 };
  const org = l.org;
  const erreurs = [];
  const etape = async (nom, fn) => { try { return await fn(); } catch (err) { erreurs.push({ etape: nom, code: err.code || 0, message: String(err.message || '').slice(0, 160) }); return undefined; } };

  /* Les identifiants des deux projets : une fois, puis gardés sur la liaison. */
  let ids = l.ids && l.ids.web !== undefined && l.ids.mobile !== undefined ? l.ids : null;
  if (!ids) {
    const projets = await etape('projets', () => appel(contexte, `organizations/${org}/projects/`, [['all_projects', '1']]));
    if (Array.isArray(projets)) {
      const trouver = (slug) => { const p = projets.find((x) => x.slug === slug); return p ? String(p.id) : null; };
      ids = { web: l.web ? trouver(l.web) : null, mobile: l.mobile ? trouver(l.mobile) : null };
      await bdd.doc(`sentryLiaisons/${pid}`).set({ ids }, { merge: true });
    }
  }
  if (!ids || (!ids.web && !ids.mobile)) {
    await ref.set({ releve: { le: maintenant, ok: false, raison, erreurs: erreurs.length ? erreurs : [{ etape: 'projets', message: 'Aucun des projets Sentry nommés n\'existe.' }], appels: contexte.appels }, maj: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: false, erreurs };
  }
  const lies = { ...l, ids };
  const projetsParam = [ids.web, ids.mobile].filter(Boolean).map((id) => ['project', id]);
  const debutJour = minuitParis(maintenant);

  /* Les erreurs ouvertes, les plus fréquentes d'abord. */
  const issues = await etape('erreurs', () => appel(contexte, `organizations/${org}/issues/`, [
    ...projetsParam, ['query', 'is:unresolved'], ['sort', 'freq'], ['statsPeriod', '14d'], ['groupStatsPeriod', '24h'], ['limit', String(PROBLEMES_LUS)], ['shortIdLookup', '0'],
  ]));
  const problemes = Array.isArray(issues) ? issues.map((i) => problemeDe(i, lies, debutJour)) : (avant.problemes || []);

  /* Les erreurs du jour par application (Discover). */
  const evenements = await etape('jour', () => appel(contexte, `organizations/${org}/events/`, [
    ...projetsParam, ['dataset', 'errors'], ['field', 'project'], ['field', 'os.name'], ['field', 'issue'], ['field', 'count()'],
    ['sort', '-count()'], ['start', debutJour.toISOString()], ['end', maintenant.toISOString()], ['per_page', '100'], ['referrer', 'api.capmedia.hub'],
  ]));
  const jour = evenements && Array.isArray(evenements.data) ? erreursDuJour(evenements.data, lies)
    : (Array.isArray(issues) ? erreursDuJourParProblemes(problemes) : (avant.jour || null));

  /* Les sessions sans plantage par application, sur quatorze jours. */
  const sessions = await etape('sessions', () => appel(contexte, `organizations/${org}/sessions/`, [
    ...projetsParam, ['field', 'sum(session)'], ['field', 'crash_free_rate(session)'], ['groupBy', 'project'], ['statsPeriod', '14d'], ['interval', '1d'], ['includeSeries', '1'],
  ]));
  let stabilite = avant.stabilite || {};
  if (sessions && Array.isArray(sessions.groups)) {
    stabilite = {};
    for (const g of sessions.groups) {
      const app = appDe(lies, { id: (g.by || {}).project });
      if (!app) continue;
      const serie = g.series || {};
      stabilite[app] = stabiliteDe(serie['crash_free_rate(session)'], serie['sum(session)'], sessions.intervals || []);
    }
  }

  /* Les versions, chacune avec sa santé : les huit dernières par application. */
  let versions = [];
  let versionsLues = true;
  for (const app of ['web', 'mobile']) {
    if (!ids[app]) continue;
    const liste = await etape(`versions-${app}`, () => appel(contexte, `organizations/${org}/releases/`, [
      ['project', ids[app]], ['health', '1'], ['healthStatsPeriod', '24h'], ['summaryStatsPeriod', '14d'], ['per_page', '8'], ['sort', 'date'],
    ]));
    if (Array.isArray(liste)) versions = versions.concat(liste.map((r) => versionDe(r, app)));
    else versionsLues = false;
  }
  if (!versionsLues && !versions.length) versions = avant.versions || [];

  const synthese = {
    org, web: l.web || '', mobile: l.mobile || '',
    jour: jour || null, debutJour, problemes, stabilite, versions,
    releve: { le: maintenant, ok: !erreurs.length, raison, erreurs, appels: contexte.appels },
    /* « maj » fait redessiner le Cockpit (l'empreinte du magasin la lit). */
    maj: FieldValue.serverTimestamp(),
  };
  await ref.set(synthese);
  await ecrireResume(pid, synthese);
  return { ok: !erreurs.length, erreurs, appels: contexte.appels };
}

exports.synchroniser = synchroniser;
exports.ecrireResume = ecrireResume;

/* ==========================================================================
   4. Les gestes du Cockpit (appelés par suiviAdmin, droits déjà vérifiés)
   ========================================================================== */

/** Relier un projet à Sentry, ou le délier. Administrateur seul (« systeme »). */
exports.lier = async (identite, corps) => {
  const pid = String(corps.projet || '');
  if (!(await bdd.doc(`projets/${pid}`).get()).exists) throw new Refus(404, 'Projet introuvable.');
  if (corps.actif === false) {
    await bdd.doc(`sentryLiaisons/${pid}`).set({ actif: false, maj: FieldValue.serverTimestamp() }, { merge: true });
    await audit('sentry.delie', { projet: pid, par: identite.uid });
    return { ok: true, actif: false };
  }
  const org = String(corps.org || '').trim().toLowerCase();
  const web = String(corps.web || '').trim().toLowerCase();
  const mobile = String(corps.mobile || '').trim().toLowerCase();
  if (!SLUG.test(org)) throw new Refus(400, "L'organisation Sentry : lettres minuscules, chiffres et tirets.");
  if (!web && !mobile) throw new Refus(400, 'Nommez au moins un projet Sentry (web ou mobile).');
  if ((web && !SLUG.test(web)) || (mobile && !SLUG.test(mobile))) throw new Refus(400, 'Un projet Sentry : lettres minuscules, chiffres et tirets.');
  const fiche = { org, web, mobile, actif: true, ids: null, par: { uid: identite.uid, nom: String((identite.fiche || {}).nom || '').slice(0, 120) }, maj: FieldValue.serverTimestamp() };
  if (SUR_EMULATEUR && corps.hote) fiche.hote = String(corps.hote);
  await bdd.doc(`sentryLiaisons/${pid}`).set(fiche);
  await audit('sentry.lie', { projet: pid, org, web, mobile, par: identite.uid });
  const releve = await synchroniser(pid, { raison: 'liaison' }).catch((err) => ({ ok: false, message: err.message }));
  return { ok: true, actif: true, releve };
};

/** « Actualiser » : un relevé tout de suite, pas plus d'un par minute. */
exports.actualiser = async (identite, corps) => {
  const pid = String(corps.projet || '');
  const s = (await bdd.doc(`sentry/${pid}`).get()).data() || {};
  const dernier = enMillis(s.releve && s.releve.le);
  if (dernier && Date.now() - dernier < PAUSE_MANUELLE_MS) return { ok: true, deja: true, attendre: Math.ceil((PAUSE_MANUELLE_MS - (Date.now() - dernier)) / 1000) };
  const r = await synchroniser(pid, { raison: 'manuel' });
  await audit('sentry.actualise', { projet: pid, par: identite.uid, appels: r.appels || 0 });
  return r;
};

const URGENCES = ['bloquant', 'critique', 'important', 'mineur'];
const libelleSysteme = (v) => (plateformeDeSysteme(v) === 'ios' ? 'iPhone' : plateformeDeSysteme(v) === 'android' ? 'Android' : epurer(v, 40));

/**
 * Une erreur devient un ticket. Le client lit le titre et la description
 * que l'équipe a écrits pour lui ; la note interne garde le technique.
 */
exports.versTicket = async (identite, corps) => {
  const pid = String(corps.projet || '');
  const issueId = String(corps.issue || '');
  if (!ID_ISSUE.test(issueId)) throw new Refus(400, 'Erreur Sentry inconnue.');
  const titre = epurer(corps.titre, 120);
  const description = epurer(corps.description, 6000, { lignes: true });
  if (!titre) throw new Refus(400, 'Le titre du ticket est requis.');
  if (!description) throw new Refus(400, 'Dites au client, en une phrase, ce qui se passe.');
  const liaison = await lireLiaison(pid);
  if (!liaison || liaison.actif === false) throw new Refus(404, "Ce projet n'est pas relié à Sentry.");
  const lienRef = bdd.doc(`sentry/${pid}/tickets/${issueId}`);
  const deja = await lienRef.get();
  if (deja.exists) {
    const t = await bdd.doc(`tickets/${deja.data().ticket}`).get();
    if (t.exists && !TICKET_FERME.includes(t.data().statut) && t.data().archive !== true) throw new Refus(409, `Cette erreur a déjà son ticket ${t.data().numero || ''}.`.replace(' .', '.'));
  }
  const jeton = jetonSentry();
  if (!jeton) throw new Refus(503, 'Le secret SENTRY_JETON est absent.');
  const contexte = { hote: hoteDe(liaison), jeton, appels: 0 };
  const org = liaison.org;
  let issue;
  try { issue = await appel(contexte, `organizations/${org}/issues/${issueId}/`); } catch (err) {
    throw new Refus(err.code === 404 ? 404 : 502, err.code === 404 ? 'Sentry ne connaît pas cette erreur.' : `Sentry n'a pas répondu (${err.message}).`);
  }
  const app = appDe(liaison, issue.project);
  if (!app) throw new Refus(403, "Cette erreur n'appartient pas aux projets Sentry reliés.");
  const tag = async (cle) => { try { return await appel(contexte, `organizations/${org}/issues/${issueId}/tags/${cle}/`); } catch (err) { return null; } };
  const versionsTag = await tag('release');
  const systemes = app === 'mobile' ? await tag('os.name') : null;
  const valeurs = (t) => ((t && t.topValues) || []).slice(0, 5).map((v) => ({ valeur: String(v.value || v.name || ''), nombre: Number(v.count) || 0 }));
  /* « com.forgeme.app@1.1.3+24 » se lit « 1.1.3 (24) ». */
  const versions = valeurs(versionsTag).map((v) => ({ ...v, valeur: epurer(v.valeur.replace(/^[^@]*@/, '').replace(/^([^+]+)\+(.+)$/, '$1 ($2)'), 40) }));
  const plateformes = app === 'web' ? [{ valeur: 'Web', nombre: Number(issue.count) || 0 }] : valeurs(systemes).map((v) => ({ ...v, valeur: libelleSysteme(v.valeur) }));
  const cles = app === 'web' ? ['web'] : [...new Set(valeurs(systemes).map((v) => plateformeDeSysteme(v.valeur)).filter((p) => p !== 'autre'))];
  const plateforme = cles.length === 1 ? cles[0] : '';
  const urgence = URGENCES.includes(corps.urgence) ? corps.urgence : 'important';
  const nom = String((identite.fiche || {}).nom || EQUIPE_NOM).slice(0, 120);
  const lien = lienSentry(issue.permalink, { org, id: issueId });

  const ticketRef = bdd.collection('tickets').doc();
  const ticket = {
    numero: null, projet: pid, composant: '', titre, description, type: 'bug', urgence, statut: 'en-cours',
    plateforme, version: versions.length ? versions[0].valeur.slice(0, 40) : '', etapes: '', attendu: '', obtenu: '', contexte: '', appareil: '', liens: [],
    assigne: null, auteur: { uid: identite.uid, nom, email: '', cote: 'equipe' }, pieces: [], archive: false, resolu: null, qualification: null, devis: null,
    lu: {}, cree: FieldValue.serverTimestamp(), maj: FieldValue.serverTimestamp(),
  };
  const ligne = (l) => l.map((v) => `${v.valeur} (${v.nombre})`).join(', ');
  const date = (v) => (v ? new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '');
  const note = [
    `Né d'une erreur Sentry ${epurer(issue.shortId, 40)} : ${epurer(issue.title, 160)}`,
    epurer(issue.culprit, 160) ? `Lieu : ${epurer(issue.culprit, 160)}` : '',
    `Occurrences : ${Number(issue.count) || 0} · personnes touchées : ${Number(issue.userCount) || 0}`,
    `Première fois : ${date(issue.firstSeen)} · dernière fois : ${date(issue.lastSeen)}`,
    versions.length ? `Versions : ${ligne(versions)}` : '',
    plateformes.length ? `Plateformes : ${ligne(plateformes)}` : '',
    lien ? `Sentry : ${lien}` : '',
  ].filter(Boolean).join('\n');
  const lot = bdd.batch();
  lot.set(ticketRef, ticket);
  lot.set(ticketRef.collection('messages').doc(), { de: { uid: identite.uid, nom, cote: 'equipe' }, texte: note.slice(0, 6000), pieces: [], interne: true, date: FieldValue.serverTimestamp() });
  lot.set(lienRef, {
    ticket: ticketRef.id, issue: issueId, court: epurer(issue.shortId, 40), app, plateforme,
    occurrences: Number(issue.count) || 0, personnes: Number(issue.userCount) || 0, versions, plateformes, lien,
    premiere: issue.firstSeen ? new Date(issue.firstSeen) : null, par: { uid: identite.uid, nom }, cree: FieldValue.serverTimestamp(),
  });
  await lot.commit();
  await audit('sentry.ticket', { projet: pid, issue: issueId, ticket: ticketRef.id, par: identite.uid, appels: contexte.appels });
  await ecrireResume(pid);
  return { ok: true, id: ticketRef.id, plateforme, appels: contexte.appels };
};

/* ==========================================================================
   5. Les fonctions déployées
   ========================================================================== */

/** Toutes les quinze minutes, chaque projet relié. */
exports.sentryReleve = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', timeZone: 'Europe/Paris', secrets: [SENTRY_JETON], timeoutSeconds: 120 },
  async () => {
    const q = await bdd.collection('sentryLiaisons').where('actif', '==', true).get();
    for (const d of q.docs) {
      try { await synchroniser(d.id, { liaison: { projet: d.id, ...d.data() } }); } catch (err) { console.error(`Sentry : relevé de ${d.id} en échec`, err); }
    }
  },
);

/* Le projet du Hub d'un envoi de Sentry, d'après les liaisons. */
async function projetDeLAlerte(alerte) {
  if (!alerte || !alerte.projet) return null;
  const q = await bdd.collection('sentryLiaisons').where('actif', '==', true).get();
  for (const d of q.docs) {
    const l = { projet: d.id, ...d.data() };
    const app = appDe(l, alerte.projet);
    if (app) return { liaison: l, app };
  }
  return null;
}

/* Une seule cloche par erreur et par type toutes les six heures. */
async function reserverCloche(pid, alerte) {
  const cle = `${alerte.type}-${alerte.issue || alerte.regle || 'projet'}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  const ref = bdd.doc(`sentry/${pid}/debits/${cle}`);
  return bdd.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (d.exists && Date.now() - enMillis(d.data().le) < DEBIT_ALERTE_MS) return false;
    tx.set(ref, { le: new Date() });
    return true;
  });
}

const LIBELLES_APP = { web: 'Web', mobile: 'Mobile', ios: 'iPhone', android: 'Android' };

exports.sentryWebhook = onRequest(
  { region: REGION, cors: false, invoker: 'public', secrets: [SENTRY_WEBHOOK_SECRET, SENTRY_JETON], timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const brut = req.rawBody;
    if (!brut || brut.length > 512 * 1024) return res.status(413).send('corps absent ou trop long');
    let secret = '';
    if (SUR_BANC) secret = SECRET_BANC;
    else { try { secret = String(SENTRY_WEBHOOK_SECRET.value() || '').trim(); } catch (err) { secret = ''; } }
    if (!secret) { console.error('Sentry : SENTRY_WEBHOOK_SECRET absent'); return res.status(503).send('non configuré'); }
    if (!signatureValide(brut, req.get('sentry-hook-signature'), secret)) {
      await audit('sentry.webhook.refus', { motif: 'signature', ressource: String(req.get('sentry-hook-resource') || '').slice(0, 40) });
      return res.status(401).send('signature invalide');
    }
    const ressource = String(req.get('sentry-hook-resource') || '');
    let corps;
    try { corps = JSON.parse(brut.toString('utf8')); } catch (err) { return res.status(400).send('JSON illisible'); }
    const alerte = alerteDe(ressource, corps);
    if (!alerte) return res.status(200).json({ ok: true, ignore: true });
    try {
      const cible = await projetDeLAlerte(alerte);
      if (!cible) return res.status(200).json({ ok: true, ignore: true, motif: 'projet non relié' });
      const pid = cible.liaison.projet;
      const app = alerte.plateforme || cible.app;
      const fiche = {
        type: alerte.type, titre: alerte.titre, texte: alerte.texte || '', app,
        issue: ID_ISSUE.test(alerte.issue) ? alerte.issue : '', court: alerte.court || '',
        niveau: ['fatal', 'error', 'warning', 'info', 'debug'].includes(alerte.niveau) ? alerte.niveau : 'error',
        regle: alerte.regle || '', lien: lienSentry(alerte.lien, { org: cible.liaison.org, id: alerte.issue }),
        le: FieldValue.serverTimestamp(), source: ressource,
      };
      await bdd.collection(`sentry/${pid}/alertes`).add(fiche);
      /* Garder les cinquante dernières. */
      const vieilles = await bdd.collection(`sentry/${pid}/alertes`).orderBy('le', 'desc').offset(ALERTES_GARDEES).limit(20).get();
      if (!vieilles.empty) { const lot = bdd.batch(); vieilles.docs.forEach((d) => lot.delete(d.ref)); await lot.commit(); }
      if (ALERTES_SONNANTES.includes(fiche.type) && await reserverCloche(pid, fiche)) {
        const projet = (await bdd.doc(`projets/${pid}`).get()).data() || {};
        await communication.notifierEquipe(pid, {
          type: 'sentry', titre: `${fiche.titre} · ${LIBELLES_APP[app] || 'Application'}`,
          texte: `${fiche.texte || fiche.regle || ''}${projet.nom ? ` · ${projet.nom}` : ''}`.slice(0, 200),
          lien: `#/projets/${pid}/stabilite`, projet: pid,
        });
      }
      /* Une nouvelle erreur doit aussi apparaître dans la liste : un relevé,
         si le dernier date de plus de deux minutes. */
      const s = (await bdd.doc(`sentry/${pid}`).get()).data() || {};
      if (Date.now() - enMillis(s.releve && s.releve.le) > PAUSE_WEBHOOK_MS) {
        await synchroniser(pid, { liaison: cible.liaison, raison: 'alerte' }).catch((err) => console.error('Sentry : relevé après alerte', err));
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Sentry : webhook', err);
      return res.status(500).send('erreur');
    }
  },
);
