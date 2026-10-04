/* ==========================================================================
   CAPMEDIA CLIENT HUB · la salle de contrôle (#/projets/{p}/controle)

   La santé d'une application en direct, sur un écran sombre qu'on peut
   laisser ouvert toute la journée, ou mettre en plein écran sur une télé.
   Le navigateur ne parle ni à Sentry ni aux sites : il lit ce que le
   serveur a relevé (controle.js, sentry.js) et le redessine sur place.

   Cockpit (équipe du projet) : un voyant par service et l'état global,
   une tuile par application (erreurs de l'heure et des 24 h, courbe par
   tranche de dix minutes, sessions sans plantage, utilisateurs actifs),
   le fil des alertes en direct, la disponibilité et le temps de réponse
   des sites sur 24 h, les incidents, les versions en service, les erreurs
   ouvertes. Chaque erreur, chaque alerte et chaque incident peut devenir
   un ticket (la feuille de la page Stabilité). Tant que l'écran est
   ouvert et visible, il le signale chaque minute (controleEcran) : le
   serveur relève alors Sentry à la minute.

   Hub (client) : les mêmes voyants, dits en phrases, la disponibilité, les
   sessions sans plantage, les erreurs en cours de correction écrites pour
   lui. Aucune adresse, aucun code, aucun lien vers Sentry.

   Le plein écran (Fullscreen API ; à défaut, la page seule) passe en mode
   télé : gros chiffres, une application à la fois, qui défile seule.
   Échap ou le bouton en sortent. Un son discret salue une mauvaise
   nouvelle, coupé par défaut (préférence de ce navigateur).

   Pas de rebond : la page se dessine une fois ; ensuite, seules les
   régions qui changent sont récrites, et une valeur qui change clignote
   une fois.
   ========================================================================== */

import { echapper, dateCourte, peut, estAdmin, OUVERTS, STATUTS, enDate } from '../noyau.js';
import { vide, squelette, titrePage, sur, pastille } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, abonnerProjet, abonnerControle, abonnerLiaisons } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';
import { pourcent, phraseTendance, creerTicket } from './stabilite.js';

/* --- Les mots --------------------------------------------------------------- */

/* L'espace fine insécable : « 99,7 % » ne se coupe jamais. */
const ESPACE = '\u202f';
const nombre = (n) => Number(n || 0).toLocaleString('fr-FR');
const SERVICES = { web: 'App web', landing: 'Landing', ios: 'iPhone', android: 'Android', fonctions: 'Firebase et fonctions', hub: 'Hub Capmedia' };
const ORDRE = ['web', 'landing', 'ios', 'android', 'fonctions', 'hub'];
const ETATS = { vert: 'Normal', orange: 'À surveiller', rouge: 'Incident', gris: 'Sans mesure' };
const ETATS_CLIENT = { vert: 'Normal', orange: 'Sous surveillance', rouge: 'Perturbé', gris: 'En attente' };
const APPS = { web: 'App web', ios: 'iPhone', android: 'Android' };
const APPS_CLIENT = { web: 'Site web', mobile: 'Application mobile' };
const TYPES = {
  nouvelle: ['Nouvelle', 'rouge'], regression: ['Revenue', 'rouge'], pic: ['Pic', 'orange'], alerte: ['Règle', 'orange'],
  rouverte: ['Rouverte', 'gris'], resolue: ['Corrigée', 'vert'], calme: ['Calme', 'vert'], panne: ['Panne', 'rouge'], retabli: ['Rétabli', 'vert'],
};
const LIEUX = { web: 'Web', mobile: 'Mobile', ios: 'iPhone', android: 'Android', landing: 'Landing', fonctions: 'Firebase et fonctions', hub: 'Hub Capmedia' };
const SONNANTES = ['nouvelle', 'regression', 'pic', 'alerte', 'panne'];

const ms = (v) => { const d = enDate(v); return d ? d.getTime() : 0; };
const deuxChiffres = (n) => String(n).padStart(2, '0');
const horloge = (d = new Date()) => `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}:${deuxChiffres(d.getSeconds())}`;
const heureCourte = (v) => { const d = enDate(v); return d ? `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}` : ''; };
const heureLongue = (v) => { const d = enDate(v); return d ? horloge(d) : ''; };
const duree = (de, a = Date.now()) => {
  const m = Math.max(0, Math.round((ms(a) || a) / 60000 - ms(de) / 60000));
  if (m < 60) return `${m}${ESPACE}min`;
  const h = Math.floor(m / 60);
  return `${h}${ESPACE}h${ESPACE}${deuxChiffres(m % 60)}`;
};
const ilYa = (v) => {
  const s = Math.max(0, Math.round((Date.now() - ms(v)) / 1000));
  if (s < 60) return `il y a ${s}${ESPACE}s`;
  return `il y a ${duree(v)}`;
};
/* La disponibilité, au centième, jamais arrondie vers le haut. */
const dispo = (t) => {
  if (typeof t !== 'number') return '-';
  const bas = Math.floor(t * 100 + 1e-9) / 100;
  return `${bas.toLocaleString('fr-FR', { minimumFractionDigits: bas === 100 ? 0 : 2, maximumFractionDigits: 2 })}${ESPACE}%`;
};
const secondesOuMs = (v) => (v >= 1000 ? `${(Math.round(v / 100) / 10).toLocaleString('fr-FR')}${ESPACE}s` : `${nombre(v)}${ESPACE}ms`);

/* --- Les erreurs par tranche, recalées sur l'instant ------------------------- */

const PAS_TRANCHE_MS = 600 * 1000;
const TRANCHES = 144;
const chiffres = (serie, t = Date.now()) => {
  if (!serie || !Array.isArray(serie.valeurs)) return null;
  const retard = Math.max(0, Math.floor((t - Number(serie.fin)) / PAS_TRANCHE_MS) + 1);
  const r = Math.min(retard, TRANCHES);
  const v = r ? serie.valeurs.slice(r).concat(Array.from({ length: r }, () => 0)) : serie.valeurs.slice();
  const heure = v.slice(-6).reduce((a, b) => a + b, 0);
  const jour = v.reduce((a, b) => a + b, 0);
  return { valeurs: v, heure, jour, moyenne: (jour - heure) / 23 };
};

/* --- Les courbes ---------------------------------------------------------------- */

/** Une courbe d'erreurs : 144 tranches, l'heure écoulée sur fond plus clair. */
const courbeErreurs = (valeurs, { h = 56, libelle = '' } = {}) => {
  const n = valeurs.length;
  if (!n) return '';
  const max = Math.max(1, ...valeurs);
  const x = (i) => ((i / (n - 1)) * 100).toFixed(2);
  const y = (v) => (h - 2 - (v / max) * (h - 6)).toFixed(2);
  const points = valeurs.map((v, i) => `${x(i)},${y(v)}`);
  const debutHeure = ((n - 6) / (n - 1)) * 100;
  return `<svg class="courbe" viewBox="0 0 100 ${h}" preserveAspectRatio="none" role="img" aria-label="${echapper(libelle)}">
    <rect class="courbe-heure" x="${debutHeure.toFixed(2)}" y="0" width="${(100 - debutHeure).toFixed(2)}" height="${h}"/>
    <path class="courbe-aire" d="M0,${h} L${points.join(' L')} L100,${h} Z"/>
    <polyline class="courbe-ligne" points="${points.join(' ')}" vector-effect="non-scaling-stroke"/>
  </svg>`;
};

/** Le temps de réponse d'une sonde : 288 cases de cinq minutes, les échecs marqués en bas. */
const courbeReponse = (s, { h = 40 } = {}) => {
  const n = (s.n || []).length;
  if (!n) return '';
  const moy = (s.n || []).map((c, i) => { const bons = c - ((s.ko || [])[i] || 0); return bons > 0 ? ((s.somme || [])[i] || 0) / bons : null; });
  const connus = moy.filter((v) => v !== null);
  const max = Math.max(100, ...connus);
  const x = (i) => ((i / (n - 1)) * 100).toFixed(3);
  const y = (v) => (h - 6 - (v / max) * (h - 10)).toFixed(2);
  const traits = [];
  let courant = [];
  moy.forEach((v, i) => { if (v === null) { if (courant.length) traits.push(courant); courant = []; } else courant.push(`${x(i)},${y(v)}`); });
  if (courant.length) traits.push(courant);
  const ko = (s.ko || []).map((k, i) => (k ? `<rect class="courbe-ko" x="${x(i)}" y="${h - 4}" width="${(100 / n).toFixed(3)}" height="4"/>` : '')).join('');
  return `<svg class="courbe courbe--reponse" viewBox="0 0 100 ${h}" preserveAspectRatio="none" role="img" aria-label="Temps de réponse et échecs, par tranche de cinq minutes, sur 24 heures">
    ${traits.map((t) => (t.length > 1 ? `<polyline class="courbe-ligne" points="${t.join(' ')}" vector-effect="non-scaling-stroke"/>` : '')).join('')}${ko}
  </svg>`;
};

/* --- Le son, coupé par défaut ------------------------------------------------------ */

const CLE_SON = 'suivi:controle-son';
const sonVoulu = () => { try { return localStorage.getItem(CLE_SON) === '1'; } catch (e) { return false; } };
const memoriserSon = (oui) => { try { localStorage.setItem(CLE_SON, oui ? '1' : '0'); } catch (e) { /* stockage refusé : le son reste pour la session */ } };
let audio = null;
/* Deux notes brèves et douces, générées : aucun fichier à charger. */
const tinter = (grave = false) => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime + 0.02;
    [[grave ? 523 : 880, 0], [grave ? 392 : 660, 0.17]].forEach(([f, d]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.24);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t + d);
      o.stop(t + d + 0.26);
    });
  } catch (e) { /* pas de son : rien de grave */ }
};

/* --- Le dessin par régions ------------------------------------------------------------ */

const clignoter = (el) => {
  el.classList.remove('clignote');
  void el.offsetWidth;
  el.classList.add('clignote');
  el.addEventListener('animationend', () => el.classList.remove('clignote'), { once: true });
};

/**
 * Récrit les régions qui ont changé, et elles seules. Dans une région
 * récrite, une valeur (data-v) qui n'est plus la même clignote une fois ;
 * une alerte jamais vue (data-alerte) arrive en glissant. Rend les
 * alertes nouvelles.
 */
const dessinateurRegions = (racine) => {
  const avant = new Map();
  const alertesVues = new Set();
  let premier = true;
  return (regions) => {
    const nouvelles = [];
    for (const [nom, html] of Object.entries(regions)) {
      const el = racine.querySelector(`[data-region="${nom}"]`);
      if (!el || avant.get(nom) === html) continue;
      const anciennes = new Map([...el.querySelectorAll('[data-v]')].map((x) => [x.dataset.v, x.textContent]));
      el.innerHTML = html;
      avant.set(nom, html);
      el.querySelectorAll('[data-alerte]').forEach((li) => {
        if (alertesVues.has(li.dataset.alerte)) return;
        alertesVues.add(li.dataset.alerte);
        if (!premier) { li.classList.add('neuf'); nouvelles.push(li.dataset.type || ''); }
      });
      if (premier) continue;
      el.querySelectorAll('[data-v]').forEach((x) => { const a = anciennes.get(x.dataset.v); if (a !== undefined && a !== x.textContent) clignoter(x); });
    }
    premier = false;
    return nouvelles;
  };
};

/* --- Le plein écran et le mode télé -------------------------------------------------- */

const brancherPleinEcran = (racine, { tuilesCles = () => [] } = {}) => {
  let tv = null;
  let indice = 0;
  const salle = () => racine.querySelector('[data-salle]');
  const actif = () => document.documentElement.classList.contains('salle-plein');
  const appliquerTv = () => {
    const s = salle();
    if (!s) return;
    const cles = tuilesCles();
    const cle = actif() && cles.length ? cles[indice % cles.length] : '';
    s.querySelectorAll('[data-tuile]').forEach((t) => t.classList.toggle('tv-actif', t.dataset.tuile === cle));
    s.querySelectorAll('[data-tv-rang]').forEach((el) => { el.textContent = cle && cles.length > 1 ? `${(indice % cles.length) + 1}/${cles.length}` : ''; });
    if (cle) s.dataset.tvActif = cle; else delete s.dataset.tvActif;
  };
  const bouton = () => {
    const b = racine.querySelector('[data-salle-action="plein"]');
    if (!b) return;
    b.setAttribute('aria-pressed', actif() ? 'true' : 'false');
    b.textContent = actif() ? 'Quitter le plein écran' : 'Plein écran';
  };
  const entrer = async () => {
    document.documentElement.classList.add('salle-plein');
    const s = salle();
    if (s) s.classList.add('salle--tv');
    indice = 0;
    clearInterval(tv);
    tv = setInterval(() => { indice += 1; appliquerTv(); }, 8000);
    appliquerTv();
    bouton();
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (e) { /* refusé (iPhone, cadre) : la page seule en tient lieu */ }
  };
  const sortir = async () => {
    document.documentElement.classList.remove('salle-plein');
    const s = salle();
    if (s) s.classList.remove('salle--tv');
    clearInterval(tv); tv = null;
    appliquerTv();
    bouton();
    try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (e) { /* déjà sorti */ }
  };
  const changement = () => { if (!document.fullscreenElement && actif()) sortir(); };
  /* Échap sort du mode télé (le navigateur sort lui-même d'un vrai plein
     écran). Écouté avant la feuille d'un ticket : une feuille ouverte se
     ferme d'abord, la salle reste en plein écran. */
  const touche = (e) => { if (e.key === 'Escape' && actif() && !document.querySelector('.voile')) sortir(); };
  document.addEventListener('fullscreenchange', changement);
  document.addEventListener('keydown', touche, true);
  return {
    basculer: () => (actif() ? sortir() : entrer()),
    appliquerTv,
    bouton,
    fin: () => { document.removeEventListener('fullscreenchange', changement); document.removeEventListener('keydown', touche, true); if (actif()) sortir(); },
  };
};

/* --- Les briques communes --------------------------------------------------------------- */

const tete = ({ surtitre, global, client = false }) => `<header class="salle-tete">
    <div class="salle-tete-titre">
      <p class="salle-surtitre">${echapper(surtitre)}</p>
      <p class="salle-global" data-region="global">${global}</p>
    </div>
    <div class="salle-tete-heure">
      <span class="salle-horloge" data-horloge>${horloge()}</span>
      <span class="salle-frais" data-frais></span>
    </div>
    <div class="salle-tete-actions">
      ${client ? '' : `<button class="salle-btn" type="button" data-salle-action="son" aria-pressed="${sonVoulu() ? 'true' : 'false'}">${sonVoulu() ? 'Son : activé' : 'Son : coupé'}</button>`}
      <button class="salle-btn salle-btn--plein" type="button" data-salle-action="plein" aria-pressed="false">Plein écran</button>
    </div>
  </header>`;

const globalHtml = (g) => `<span class="salle-global-feu" data-etat="${echapper(g.etat || 'gris')}" aria-hidden="true"></span><span class="salle-global-texte" data-etat="${echapper(g.etat || 'gris')}" data-v="global">${echapper(g.phrase || 'Pas encore de mesure')}</span>`;

/* ==========================================================================
   Le Cockpit
   ========================================================================== */

const lireEquipe = (pid) => ({
  projet: magasin.lire(K.projet(pid)),
  liaison: magasin.lire(K.sentryLiaison(pid)),
  s: magasin.lire(K.sentry(pid)) || {},
  c: magasin.lire(K.controle(pid)) || {},
  alertes: magasin.lire(K.sentryAlertes(pid)) || [],
  liens: magasin.lire(K.sentryTickets(pid)) || [],
  tickets: magasin.lire(K.tickets(pid)) || [],
  incidents: magasin.lire(K.incidents(pid)) || [],
});

/* Les services de l'écran : les voyants calculés, ou ce que dit la liaison
   tant que le premier battement n'est pas passé. */
const servicesDe = (d) => {
  const v = d.c.voyants || {};
  const sondes = (d.liaison && d.liaison.sondes) || {};
  return ORDRE.filter((cle) => v[cle] || (cle === 'web' && (sondes.web || (d.liaison && d.liaison.web)))
    || ((cle === 'ios' || cle === 'android') && d.liaison && d.liaison.mobile) || sondes[cle]);
};

const voyantsHtml = (d) => servicesDe(d).map((cle) => {
  const v = (d.c.voyants || {})[cle] || { etat: 'gris', raison: 'Premier relevé dans la minute' };
  const depuisTexte = v.depuis && v.etat !== 'vert' ? `depuis ${heureCourte(v.depuis)} (${duree(v.depuis)})` : '';
  return `<div class="voyant" data-voyant="${cle}" data-etat="${echapper(v.etat)}">
      <span class="voyant-feu" aria-hidden="true"></span>
      <span class="voyant-nom">${echapper(SERVICES[cle])}</span>
      <span class="voyant-etat">${echapper(ETATS[v.etat] || '')}</span>
      <span class="voyant-raison" data-v="v-${cle}">${echapper(v.raison || '')}</span>
      ${depuisTexte ? `<span class="voyant-depuis">${echapper(depuisTexte)}</span>` : ''}
    </div>`;
}).join('');

/* La version en service d'une application : la plus utilisée des 24 h. */
const versionsEnService = (versions, app) => (versions || []).filter((v) => v.app === app && (v.sessions24h || v.adoption))
  .sort((a, b) => (b.adoption || 0) - (a.adoption || 0) || ms(b.creee) - ms(a.creee));

const tuileHtml = (cle, d, t) => {
  const app = cle === 'web' ? 'web' : 'mobile';
  const c = chiffres((d.c.erreurs || {})[cle], t);
  const s24 = (d.c.sessions24 || {})[app] || null;
  const st = ((d.s.stabilite) || {})[app] || null;
  const v = (d.c.voyants || {})[cle] || { etat: 'gris' };
  const enService = versionsEnService(d.s.versions, app)[0];
  const ecart = st && typeof st.taux === 'number' && typeof st.tauxAvant === 'number' ? Math.round((st.taux - st.tauxAvant) * 10) / 10 : null;
  const tendance = st && st.tendance
    ? `<span class="tendance" data-tendance="${echapper(st.tendance)}">${ecart !== null ? `${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} pt` : ''} sur 7 jours (${echapper(pourcent(st.taux))})</span>`
    : '<span class="tendance">Tendance sur 7 jours : pas assez de sessions</span>';
  const taux = s24 && typeof s24.taux === 'number' && s24.sessions >= 20 ? pourcent(s24.taux) : '-';
  return `<article class="tuile" data-tuile="${cle}" data-etat="${echapper(v.etat)}">
      <header class="tuile-tete"><span class="tuile-feu" aria-hidden="true"></span><h3 class="tuile-nom">${echapper(APPS[cle])}</h3><span class="tuile-rang" data-tv-rang></span>${enService ? `<span class="tuile-version">${echapper(enService.libelle || enService.version)}</span>` : ''}</header>
      <div class="tuile-chiffres">
        <p class="schiffre schiffre--grand"><span class="schiffre-v" data-v="t-${cle}-h">${c ? nombre(c.heure) : '-'}</span><span class="schiffre-l">erreur${c && c.heure > 1 ? 's' : ''}, dernière heure</span></p>
        <p class="schiffre"><span class="schiffre-v" data-v="t-${cle}-j">${c ? nombre(c.jour) : '-'}</span><span class="schiffre-l">sur 24 h</span></p>
        <p class="schiffre"><span class="schiffre-v" data-v="t-${cle}-taux">${echapper(taux)}</span><span class="schiffre-l">sans plantage${app === 'mobile' ? ' (mobile)' : ''}, 24 h</span></p>
        <p class="schiffre"><span class="schiffre-v" data-v="t-${cle}-u">${s24 && typeof s24.utilisateurs === 'number' ? nombre(s24.utilisateurs) : '-'}</span><span class="schiffre-l">utilisateurs actifs${app === 'mobile' ? ' (mobile)' : ''}, 24 h</span></p>
      </div>
      <figure class="tuile-courbe">${c ? courbeErreurs(c.valeurs, { libelle: `Erreurs ${APPS[cle]} par tranche de dix minutes, sur 24 heures` }) : '<p class="salle-vide">Erreurs pas encore relevées</p>'}
        <figcaption><span>il y a 24 h</span><span>il y a 12 h</span><span>maintenant</span></figcaption></figure>
      <p class="tuile-pied">${tendance}${enService ? `<span>Version ${echapper(enService.libelle || enService.version)}${enService.creee ? `, en ligne le ${echapper(dateCourte(enService.creee))}` : ''}</span>` : ''}</p>
    </article>`;
};

const tuilesCles = (d) => ['web', 'ios', 'android'].filter((c) => (c === 'web' ? d.liaison && d.liaison.web : d.liaison && d.liaison.mobile));

/* Le ticket d'une erreur ou d'un incident : son lien s'il est ouvert. */
const ticketOuvert = (d, cleLien) => {
  const l = d.liens.find((x) => x.id === cleLien);
  if (!l) return null;
  const t = d.tickets.find((x) => x.id === l.ticket);
  if (t && (t.archive || !OUVERTS.includes(t.statut))) return null;
  return t || { id: l.ticket, numero: '' };
};
const boutonTicket = (d, env, { genre, id, cleLien }) => {
  const t = ticketOuvert(d, cleLien);
  if (t) return `<a class="salle-lien" href="#/projets/${echapper(d.projet.id)}/demandes/${echapper(t.id)}" data-salle-ticket-ouvert="${echapper(t.id)}">Ticket déjà ouvert${t.numero ? ` · ${echapper(t.numero)}` : ''}</a>`;
  if (!peut(env.session, 'demandes.gerer', d.projet.id)) return '';
  return `<button class="salle-btn salle-btn--petit" type="button" data-salle-ticket="${genre}" data-id="${echapper(id)}">Créer un ticket</button>`;
};

const filHtml = (d, env) => {
  const liste = d.alertes.slice(0, 20);
  const tete = `<div class="salle-bloc-tete"><h2 class="salle-h">Fil en direct</h2><span class="salle-mini">${liste.length ? `${liste.length} dernière${liste.length > 1 ? 's' : ''} alerte${liste.length > 1 ? 's' : ''}` : ''}</span></div>`;
  if (!liste.length) return `${tete}<p class="salle-vide" data-fil-vide>Aucune alerte. Elles arrivent ici en direct : nouvelle erreur, erreur revenue, pic, site en panne ou rétabli.</p>`;
  return `${tete}<ol class="sfil" data-fil>${liste.map((a) => {
    const [type, ton] = TYPES[a.type] || ['Alerte', 'orange'];
    const fin = a.issue && /^\d+$/.test(a.issue) ? boutonTicket(d, env, { genre: 'alerte', id: a.id, cleLien: a.issue })
      : a.incident ? boutonTicket(d, env, { genre: 'incident', id: a.incident, cleLien: `incident-${a.incident}` }) : '';
    return `<li class="sfil-ligne" data-alerte="${echapper(a.id)}" data-type="${echapper(a.type || '')}" data-ton="${ton}">
        <time class="sfil-heure">${echapper(heureLongue(a.le))}</time>
        <span class="sfil-type">${echapper(type)}</span>
        <span class="sfil-corps"><span class="sfil-titre">${echapper(a.titre || '')}</span><span class="sfil-texte">${echapper([a.texte, LIEUX[a.app] || ''].filter(Boolean).join(' · '))}</span></span>
        ${fin ? `<span class="sfil-fin">${fin}</span>` : ''}
      </li>`;
  }).join('')}</ol>`;
};

const dispoHtml = (d) => {
  const sondes = d.c.sondes || {};
  const cles = ['web', 'landing', 'fonctions', 'hub'].filter((c) => sondes[c]);
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">Disponibilité et temps de réponse</h2><span class="salle-mini">sondé chaque minute · 24 h</span></div>';
  if (!cles.length) return `${tete}<p class="salle-vide">Aucune adresse sondée. Un administrateur les donne dans la liaison du projet (page Stabilité).</p>`;
  return `${tete}<div class="dispo-liste">${cles.map((cle) => {
    const s = sondes[cle];
    const etat = s.etat === 'panne' ? 'rouge' : s.etat === 'ok' ? 'vert' : 'orange';
    return `<div class="dispo" data-sonde="${cle}" data-etat="${etat}">
        <span class="dispo-nom"><span class="dispo-feu" aria-hidden="true"></span>${echapper(SERVICES[cle])}<span class="dispo-hote">${echapper(s.hote || '')}</span></span>
        <span class="dispo-schiffre"><span class="dispo-v" data-v="d-${cle}-pct">${echapper(dispo(s.dispo))}</span><span class="dispo-l">dispo 24 h</span></span>
        <span class="dispo-schiffre"><span class="dispo-v" data-v="d-${cle}-ms">${s.code ? echapper(secondesOuMs(s.ms || 0)) : '-'}</span><span class="dispo-l">réponse</span></span>
        <span class="dispo-schiffre"><span class="dispo-v" data-v="d-${cle}-code">${s.code ? echapper(String(s.code)) : echapper(s.raison || '-')}</span><span class="dispo-l">${s.code ? 'code HTTP' : 'état'}</span></span>
        <span class="dispo-courbe">${courbeReponse(s)}</span>
      </div>`;
  }).join('')}</div>`;
};

const incidentsHtml = (d, env) => {
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">Incidents de disponibilité</h2><span class="salle-mini">ouverts et fermés seuls</span></div>';
  if (!d.incidents.length) return `${tete}<p class="salle-vide" data-incidents-vide>Aucun incident enregistré.</p>`;
  return `${tete}<ul class="incidents">${d.incidents.map((i) => `<li class="incident" data-incident="${echapper(i.id)}" data-ouvert="${i.fin ? 'non' : 'oui'}">
      <span class="incident-nom">${echapper(i.nom || SERVICES[i.cible] || '')}</span>
      <span class="incident-quoi">${echapper(i.code ? `HTTP ${i.code}` : (i.raison || 'injoignable'))}</span>
      <span class="incident-quand">${echapper(`${dateCourte(i.debut)} ${heureCourte(i.debut)}`)}${i.fin ? ` → ${echapper(heureCourte(i.fin))}` : ''}</span>
      <span class="incident-duree">${i.fin ? echapper(`${i.minutes || 1}${ESPACE}min`) : echapper(`en cours, ${duree(i.debut)}`)}</span>
      <span class="incident-fin">${boutonTicket(d, env, { genre: 'incident', id: i.id, cleLien: `incident-${i.id}` })}</span>
    </li>`).join('')}</ul>`;
};

const versionsHtml = (d) => {
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">Versions en service</h2><span class="salle-mini">part des sessions, 24 h</span></div>';
  const blocs = [['web', 'App web'], ['mobile', 'Mobile (iPhone et Android)']].map(([app, nom]) => {
    const v = versionsEnService(d.s.versions, app).slice(0, 3);
    if (!v.length) return '';
    return `<div class="versions-app"><p class="versions-nom">${nom}</p><ul>${v.map((x) => `<li data-version="${echapper(x.version)}">
        <span class="versions-num">${echapper(x.libelle || x.version)}</span>
        <span class="versions-part">${typeof x.adoption === 'number' ? `${x.adoption.toLocaleString('fr-FR')}${ESPACE}%` : '-'}</span>
        <span class="versions-date">${x.creee ? `en ligne le ${echapper(dateCourte(x.creee))}` : ''}</span>
      </li>`).join('')}</ul></div>`;
  }).join('');
  return `${tete}${blocs || '<p class="salle-vide">Aucune version relevée.</p>'}`;
};

const ETATS_ERREUR = { nouvelle: ['Nouvelle', 'rouge'], regression: ['Revenue', 'rouge'], hausse: ['En hausse', 'orange'], 'en-cours': ['Ouverte', 'gris'] };
const erreursHtml = (d, env) => {
  const liste = d.s.problemes || [];
  const tete = `<div class="salle-bloc-tete"><h2 class="salle-h">Erreurs ouvertes</h2><span class="salle-mini">${liste.length ? `${liste.length}, les plus fréquentes d'abord` : ''}</span></div>`;
  if (!liste.length) return `${tete}<p class="salle-vide" data-erreurs-vide>Aucune erreur ouverte.</p>`;
  return `${tete}<div class="erreurs-defile"><table class="erreurs">
    <thead><tr><th scope="col">Erreur</th><th scope="col">Où</th><th scope="col" class="nb">Aujourd'hui</th><th scope="col" class="nb">Total</th><th scope="col">Vue</th><th scope="col">État</th><th scope="col"><span class="salle-cache">Ticket</span></th></tr></thead>
    <tbody>${liste.map((p) => {
    const [etat, ton] = ETATS_ERREUR[p.etat] || ETATS_ERREUR['en-cours'];
    return `<tr data-erreur="${echapper(p.id)}">
        <td class="erreur-titre"><span>${echapper(p.titre)}</span>${p.lieu ? `<span class="erreur-lieu">${echapper(p.lieu)}</span>` : ''}</td>
        <td>${echapper(LIEUX[p.app] || '')}</td>
        <td class="nb" data-v="e-${echapper(p.id)}-j">${nombre(p.jour)}</td>
        <td class="nb" data-v="e-${echapper(p.id)}-n">${nombre(p.occurrences)}</td>
        <td>${p.derniere ? echapper(heureCourte(p.derniere)) : ''}</td>
        <td><span class="erreur-etat" data-ton="${ton}">${etat}</span></td>
        <td class="erreur-fin">${boutonTicket(d, env, { genre: 'erreur', id: p.id, cleLien: p.id })}</td>
      </tr>`;
  }).join('')}</tbody></table></div>`;
};

/* La fraîcheur : le dernier battement du serveur. Au-delà de trois
   minutes, l'écran le dit en orange : ce qu'il montre a vieilli. */
const fraicheur = (c) => {
  const dernier = Math.max(ms(c.battement), ms(c.calcule));
  if (!dernier) return { texte: 'en attente du premier relevé', retard: false };
  const retard = Date.now() - dernier > 3 * 60 * 1000;
  return { texte: retard ? `relevé en retard : dernier ${ilYa(dernier)}` : `relevé ${ilYa(dernier)}`, retard };
};

const charpenteEquipe = (d) => `<div class="page page-salle">
    <section class="salle" data-salle aria-label="Salle de contrôle">
      ${tete({ surtitre: `${d.projet.nom || ''} · Salle de contrôle`, global: globalHtml(d.c.global || {}) })}
      <div class="salle-voyants" data-region="voyants" aria-live="polite"></div>
      <div class="salle-corps">
        <div class="salle-tuiles" data-region="tuiles" data-tv-cycle></div>
        <aside class="salle-bloc salle-fil" data-region="fil" aria-live="polite"></aside>
      </div>
      <div class="salle-bas">
        <div class="salle-bloc" data-region="dispo"></div>
        <div class="salle-bloc" data-region="versions"></div>
      </div>
      <div class="salle-bloc" data-region="erreurs"></div>
      <div class="salle-bloc" data-region="incidents"></div>
      <p class="salle-pied"><a class="salle-lien" href="#/projets/${echapper(d.projet.id)}/stabilite">Stabilité, le détail</a></p>
    </section>
  </div>`;

const vueEquipe = (ctx, env) => {
  const pid = ctx.params.id;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  abonnerProjet(lot, pid, 'equipe');
  abonnerControle(lot, pid);
  const cles = [K.projet(pid), K.sentryLiaison(pid), K.sentry(pid), K.controle(pid), K.sentryAlertes(pid), K.sentryTickets(pid), K.tickets(pid), K.incidents(pid)];
  let regions = null;
  let monte = '';
  const plein = brancherPleinEcran(sortie, { tuilesCles: () => tuilesCles(lireEquipe(pid)) });
  const rendre = () => {
    const d = lireEquipe(pid);
    if (d.projet === undefined && !magasin.erreur(K.projet(pid))) return;
    if (!d.projet) { monte = ''; sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`; return; }
    if (d.liaison === undefined && !magasin.erreur(K.sentryLiaison(pid))) return;
    if (!d.liaison || d.liaison.actif === false) {
      monte = '';
      titrePage(`Salle de contrôle · ${d.projet.nom}`);
      sortie.innerHTML = `<div class="page">${vide({ icone: 'activite', titre: 'Pas encore de salle de contrôle', texte: 'Reliez le projet à Sentry et donnez les adresses à surveiller, depuis la page Stabilité.', action: `<a class="btn btn-principal" href="#/projets/${echapper(pid)}/stabilite">Aller à la page Stabilité</a>` })}</div>`;
      return;
    }
    if (monte !== pid) {
      titrePage(`Salle de contrôle · ${d.projet.nom}`);
      filAriane([{ libelle: 'Projets', chemin: '/projets' }, { libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Salle de contrôle' }]);
      sortie.innerHTML = charpenteEquipe(d);
      regions = dessinateurRegions(sortie.querySelector('[data-salle]'));
      monte = pid;
    }
    const t = Date.now();
    const nouvelles = regions({
      global: globalHtml(d.c.global || {}),
      voyants: voyantsHtml(d),
      tuiles: tuilesCles(d).map((c) => tuileHtml(c, d, t)).join('') || '<p class="salle-vide">Aucune application reliée à Sentry.</p>',
      fil: filHtml(d, env),
      dispo: dispoHtml(d),
      versions: versionsHtml(d),
      erreurs: erreursHtml(d, env),
      incidents: incidentsHtml(d, env),
    });
    plein.appliquerTv();
    plein.bouton();
    if (nouvelles.some((x) => SONNANTES.includes(x)) && sonVoulu()) tinter();
    majHorloge();
  };
  const majHorloge = () => {
    const h = sortie.querySelector('[data-horloge]');
    if (h) h.textContent = horloge();
    const f = sortie.querySelector('[data-frais]');
    if (f) { const fr = fraicheur((lireEquipe(pid).c) || {}); f.textContent = fr.texte; f.dataset.retard = fr.retard ? 'oui' : 'non'; }
  };
  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();
  /* L'horloge chaque seconde ; les durées (« depuis 6 min ») chaque demi-minute. */
  const minuteurHorloge = setInterval(majHorloge, 1000);
  const minuteurDurees = setInterval(planifier, 30000);

  /* La présence : chaque minute, tant que l'écran est visible. */
  const signaler = () => { if (!document.hidden) appelServeur('controleEcran', { projet: pid }).catch(() => {}); };
  const visibilite = () => { if (!document.hidden) signaler(); };
  signaler();
  const minuteurPresence = setInterval(signaler, 60000);
  document.addEventListener('visibilitychange', visibilite);

  const gestes = sur(sortie, 'click', '[data-salle-action], [data-salle-ticket]', (el) => {
    const d = lireEquipe(pid);
    if (el.dataset.salleAction === 'plein') { plein.basculer(); return; }
    if (el.dataset.salleAction === 'son') {
      const oui = !sonVoulu();
      memoriserSon(oui);
      el.setAttribute('aria-pressed', oui ? 'true' : 'false');
      el.textContent = oui ? 'Son : activé' : 'Son : coupé';
      if (oui) tinter(true);
      return;
    }
    const genre = el.dataset.salleTicket;
    if (!genre || !d.projet) return;
    const options = { naviguerApres: false };
    if (genre === 'erreur') {
      const p = (d.s.problemes || []).find((x) => x.id === el.dataset.id);
      if (p) creerTicket(pid, p, options);
      return;
    }
    if (genre === 'alerte') {
      const a = d.alertes.find((x) => x.id === el.dataset.id);
      if (!a) return;
      const p = (d.s.problemes || []).find((x) => x.id === a.issue);
      creerTicket(pid, p || { id: a.issue, court: a.court || '', titre: a.texte || a.titre || '', app: a.app === 'web' ? 'web' : 'mobile', etat: a.type === 'regression' ? 'regression' : a.type === 'nouvelle' ? 'nouvelle' : 'en-cours' }, options);
      return;
    }
    if (genre === 'incident') {
      const i = d.incidents.find((x) => x.id === el.dataset.id);
      const a = d.alertes.find((x) => x.incident === el.dataset.id);
      const cible = i ? i.cible : (a ? a.app : '');
      const quoi = i ? `${i.nom || SERVICES[i.cible] || ''} : ${i.code ? `HTTP ${i.code}` : (i.raison || 'injoignable')}, depuis ${heureCourte(i.debut)}` : (a ? a.texte : '');
      creerTicket(pid, { id: el.dataset.id, court: '', titre: quoi, app: cible, etat: 'nouvelle' }, { ...options, incident: true });
    }
  });

  return {
    fin: () => {
      clearInterval(minuteurHorloge); clearInterval(minuteurDurees); clearInterval(minuteurPresence);
      document.removeEventListener('visibilitychange', visibilite);
      plein.fin(); planifier.arreter(); gestes(); lot.fin();
    },
  };
};

/* ==========================================================================
   Le Hub
   ========================================================================== */

/** Vrai quand le client a une salle à regarder (le rail s'en sert). */
export const aDuContenu = (salle) => Boolean(salle) && Array.isArray(salle.services) && salle.services.length > 0;

const bandeHtml = (bande) => `<span class="bande" role="img" aria-label="Disponibilité par demi-heure sur 24 heures">${String(bande || '').split('').map((c) => `<i data-b="${c === 'v' || c === 'o' || c === 'r' ? c : '-'}"></i>`).join('')}</span>`;

const charpenteClient = (projet) => `<div class="page page-salle">
    <section class="salle salle--client" data-salle aria-label="Salle de contrôle">
      ${tete({ surtitre: `${projet.nom || ''} · Salle de contrôle`, global: '', client: true })}
      <div class="salle-voyants" data-region="voyants" aria-live="polite"></div>
      <div class="salle-bas salle-bas--client">
        <div class="salle-bloc" data-region="dispo"></div>
        <div class="salle-bloc" data-region="sessions" data-tv-cycle></div>
      </div>
      <div class="salle-bloc" data-region="corrections"></div>
    </section>
  </div>`;

const voyantsClientHtml = (salle) => (salle.services || []).map((s) => `<div class="voyant" data-voyant="${echapper(s.cle)}" data-etat="${echapper(s.etat)}">
      <span class="voyant-feu" aria-hidden="true"></span>
      <span class="voyant-nom">${echapper(s.nom)}</span>
      <span class="voyant-etat">${echapper(ETATS_CLIENT[s.etat] || '')}</span>
      <span class="voyant-raison" data-v="v-${echapper(s.cle)}">${echapper(s.phrase)}</span>
    </div>`).join('');

const dispoClientHtml = (salle) => {
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">Disponibilité sur 24 heures</h2><span class="salle-mini">vérifiée chaque minute</span></div>';
  const liste = salle.dispo || [];
  if (!liste.length) return `${tete}<p class="salle-vide">Les premières mesures arrivent.</p>`;
  return `${tete}<div class="dispo-liste">${liste.map((x) => `<div class="dispo dispo--client" data-sonde="${echapper(x.cle)}">
      <span class="dispo-nom">${echapper(x.nom)}</span>
      <span class="dispo-schiffre"><span class="dispo-v" data-v="d-${echapper(x.cle)}">${echapper(dispo(x.pct))}</span><span class="dispo-l">du temps disponible</span></span>
      ${bandeHtml(x.bande)}
    </div>`).join('')}</div><p class="salle-legende"><i data-b="v"></i>disponible <i data-b="o"></i>une vérification manquée <i data-b="r"></i>inaccessible</p>`;
};

const sessionsClientHtml = (resume) => {
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">Utilisations sans plantage</h2><span class="salle-mini">7 derniers jours</span></div>';
  const apps = (resume && resume.apps) || [];
  if (!apps.length) return `${tete}<p class="salle-vide">Pas encore mesuré.</p>`;
  return `${tete}<div class="salle-apps">${apps.map((a) => `<div class="salle-app" data-tuile="${echapper(a.cle)}" data-stab-app="${echapper(a.cle)}">
      <p class="salle-app-nom">${echapper(APPS_CLIENT[a.cle] || a.libelle || '')}<span class="tuile-rang" data-tv-rang></span></p>
      <p class="salle-app-taux" data-v="s-${echapper(a.cle)}">${typeof a.taux === 'number' ? echapper(pourcent(a.taux)) : 'Pas encore mesuré'}</p>
      <p class="salle-app-phrase" data-tendance="${echapper(a.tendance || '')}">${echapper(phraseTendance(a))}</p>
    </div>`).join('')}</div>`;
};

const correctionsClientHtml = (projet, resume, tickets) => {
  const tete = '<div class="salle-bloc-tete"><h2 class="salle-h">En cours de correction</h2></div>';
  const liste = ((resume && resume.corrections) || []).map((c) => ({ ...c, t: tickets.find((x) => x.id === c.ticket) }))
    .filter((c) => c.t && !c.t.archive && OUVERTS.includes(c.t.statut));
  if (!liste.length) return `${tete}<p class="salle-vide" data-corrections-vide>Aucune correction en cours en ce moment.</p>`;
  return `${tete}<ul class="corrections">${liste.map((c) => `<li><a class="correction" href="#/projets/${echapper(projet.id)}/demandes/${echapper(c.t.id)}" data-correction="${echapper(c.t.id)}">
      <span class="correction-titre">${echapper(c.t.titre || '')}</span>
      <span class="correction-sous">${echapper([c.t.numero || '', c.reperee ? `repérée le ${dateCourte(c.reperee)}` : ''].filter(Boolean).join(' · '))}</span>
      ${pastille(STATUTS, c.t.statut, { client: true })}
    </a></li>`).join('')}</ul>`;
};

const vueClient = (ctx, env) => {
  const pid = ctx.params.id;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  abonnerProjet(lot, pid, env.role);
  const cles = [K.projet(pid), K.salle(pid), K.stabilite(pid), K.tickets(pid)];
  let regions = null;
  let monte = '';
  const lireSessions = () => magasin.lire(K.stabilite(pid)) || null;
  const plein = brancherPleinEcran(sortie, { tuilesCles: () => (((lireSessions() || {}).apps) || []).map((a) => a.cle) });
  const rendre = () => {
    const projet = magasin.lire(K.projet(pid));
    if (projet === undefined && !magasin.erreur(K.projet(pid))) return;
    if (!projet) { monte = ''; sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`; return; }
    const salle = magasin.lire(K.salle(pid)) || null;
    if (!aDuContenu(salle)) {
      monte = '';
      titrePage(`Salle de contrôle · ${projet.nom}`);
      sortie.innerHTML = `<div class="page">${vide({ icone: 'activite', titre: 'Bientôt ici', texte: 'L\'état de votre application apparaîtra ici en direct dès les premières mesures.' })}</div>`;
      return;
    }
    if (monte !== pid) {
      titrePage(`Salle de contrôle · ${projet.nom}`);
      filAriane([{ libelle: 'Salle de contrôle' }]);
      sortie.innerHTML = charpenteClient(projet);
      regions = dessinateurRegions(sortie.querySelector('[data-salle]'));
      monte = pid;
    }
    regions({
      global: globalHtml(salle.global || {}),
      voyants: voyantsClientHtml(salle),
      dispo: dispoClientHtml(salle),
      sessions: sessionsClientHtml(lireSessions()),
      corrections: correctionsClientHtml(projet, lireSessions(), magasin.lire(K.tickets(pid)) || []),
    });
    plein.appliquerTv();
    plein.bouton();
    majHorloge();
  };
  const majHorloge = () => {
    const h = sortie.querySelector('[data-horloge]');
    if (h) h.textContent = horloge();
    const f = sortie.querySelector('[data-frais]');
    const salle = magasin.lire(K.salle(pid));
    if (f && salle) { const vieux = Date.now() - ms(salle.maj) > 5 * 60 * 1000; f.textContent = salle.maj ? `${vieux ? 'dernière mesure à' : 'mis à jour à'} ${heureCourte(salle.maj)}` : ''; f.dataset.retard = vieux ? 'oui' : 'non'; }
  };
  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();
  const minuteurHorloge = setInterval(majHorloge, 1000);
  const gestes = sur(sortie, 'click', '[data-salle-action="plein"]', () => plein.basculer());
  return { fin: () => { clearInterval(minuteurHorloge); plein.fin(); planifier.arreter(); gestes(); lot.fin(); } };
};

/* ==========================================================================
   L'entrée du Cockpit (#/controle) : la salle du projet relié, ou le choix
   ========================================================================== */

export const entree = (ctx, env) => {
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('lignes', 3)}</div>`;
  if (!estAdmin(env.session)) { sortie.innerHTML = `<div class="page">${vide({ icone: 'activite', titre: 'Salle de contrôle', texte: 'Ouvrez-la depuis la page d\'un projet relié à Sentry.' })}</div>`; return { fin: () => lot.fin() }; }
  abonnerLiaisons(lot);
  const rendre = () => {
    const liaisons = magasin.lire(K.liaisonsSentry);
    if (liaisons === undefined && !magasin.erreur(K.liaisonsSentry)) return;
    const projets = magasin.lire(K.projets) || [];
    const liste = (liaisons || []).map((l) => ({ id: l.id, nom: (projets.find((p) => p.id === l.id) || {}).nom || l.id }));
    titrePage('Salle de contrôle');
    filAriane([{ libelle: 'Salle de contrôle' }]);
    if (liste.length === 1) { naviguer(`/projets/${liste[0].id}/controle`, { remplacer: true }); return; }
    sortie.innerHTML = `<div class="page"><header class="page-tete"><div><h1>Salle de contrôle</h1><p class="chapo">La santé en direct de chaque application reliée à Sentry.</p></div></header>
      ${liste.length ? `<ul class="liste-simple">${liste.map((p) => `<li><a class="lien" href="#/projets/${echapper(p.id)}/controle">${echapper(p.nom)}</a></li>`).join('')}</ul>`
    : vide({ icone: 'activite', titre: 'Aucun projet relié', texte: 'Reliez un projet à Sentry depuis sa page Stabilité.' })}</div>`;
  };
  const planifier = magasin.dessinateur(rendre, 60, [K.liaisonsSentry]);
  lot.sur(K.liaisonsSentry, planifier);
  planifier();
  return { fin: () => { planifier.arreter(); lot.fin(); } };
};

export const vue = async (ctx, env) => (env.role === 'equipe' ? vueEquipe(ctx, env) : vueClient(ctx, env));
