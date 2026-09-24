/* ==========================================================================
   LE TABLEAU DES TESTS

   Une campagne entière sur un écran : chaque carte est une famille, chaque
   case un test, et la couleur dit ce qu'il faut regarder. Deux voies, les
   tests humains et les tests automatisés, dans le même dessin.

   La même vue sert au cockpit et au client, mais elle ne montre pas la
   même chose :

   - l'équipe voit qui est connecté, depuis quand, sur quel scénario, et
     combien de temps chacun a passé ; elle voit aussi la branche, le
     commit et les messages des robots ;
   - le client voit les résultats, en direct, et rien d'autre. Ses
     testeurs sont numérotés, et les données de présence lui sont fermées
     par les règles, pas par cet écran : un affichage ne protège rien.

   Ce n'est pas une page : c'est une section de la page Tests, sous les
   quatre chiffres. Repliée, elle montre l'avancement (deux barres, qui est
   là, ce qui tourne) ; dépliée, tout le tableau. La page Tests se redessine
   souvent : la section garde son propre élément, que la page raccroche à
   chaque fois, et ses propres écoutes.
   ========================================================================== */

import {
  echapper, dateHeure, depuis, pluriel, enDate, heure, dateCourte,
  BLOCS_SCENARIO, NIVEAUX_SCENARIO, PLATEFORMES_TEST, STATUTS_CAMPAGNE,
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE, OUTILS_PARCOURS, RESULTATS_PASSAGE,
  bdd, collection, query, orderBy, limit, doc, getDoc,
} from '../noyau.js';
import { icone, pastille, vide, sur, modale, agir, brancherPieces, copier } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, profilsTesteurs } from '../donnees.js';
import { editer } from './editeurs.js';
import { nommeur } from './tests.js';
import { appelServeur, URL_SUIVI } from '../serveur.js';
import { tableauHumain, tableauMachine, rythme, ETATS_CASE } from '../verdicts.js';
import { barreHtml, famillesHtml } from '../grille.js';

/* Un testeur est « là » si son dernier signe a moins de 75 secondes : il
   en envoie un toutes les 30, et un réseau lent en perd un. */
const PRESENT_MS = 75000;


const projetDe = (x) => x.projet || x._parent || '';

/* Les anciennes adresses du tableau, gardées pour les liens déjà
   partagés : elles mènent à Tests, où le tableau vit désormais. */
export const ancienne = (ctx) => {
  const projet = (ctx.requete || {}).projet;
  history.replaceState(null, '', `#/tests${projet ? `?projet=${encodeURIComponent(projet)}` : ''}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  return () => {};
};
const duree = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
};
const estLa = (p, maintenant = Date.now()) => Boolean(p && p.enLigne && enDate(p.vu) && maintenant - enDate(p.vu).getTime() < PRESENT_MS);

/* Pourquoi cette couleur, en une phrase. C'est ce qui rend la règle
   discutable : une case qu'on ne sait pas expliquer ne convainc personne. */
const pourquoi = (c) => {
  const aRejouer = (p) => p.resultat === 'ko' && p.aRevoir === true;
  const echecs = c.passages.filter((p) => p.resultat === 'ko' && !aRejouer(p)).length;
  const faits = c.passages.filter((p) => !aRejouer(p)).length;
  const ouverte = c.anomalies.find((a) => ['nouvelle', 'confirmee'].includes(a.statut));
  const gravite = ouverte ? ((GRAVITES_ANOMALIE[ouverte.gravite] || {}).libelle || '').toLowerCase() : '';
  switch (c.etat) {
    case 'casse':
      if (ouverte && Number(ouverte.retours) > 0) return 'Le défaut est revenu après avoir été corrigé : c\'est une régression.';
      if (ouverte && ['bloquant', 'critique'].includes(ouverte.gravite)) return `L'anomalie est qualifiée ${gravite}.`;
      return `${echecs} testeurs sur ${faits} en échec : le défaut est reproduit.`;
    case 'fragile':
      if (ouverte && (ouverte.gravite === 'mineur' || ouverte.statut === 'confirmee')) return `L'anomalie est qualifiée ${gravite}.`;
      if (!echecs) return 'Une anomalie reste ouverte sur ce scénario.';
      return `${echecs} en échec sur ${faits}, pas encore qualifié.${echecs === 1 ? ' Un échec isolé peut venir du testeur autant que de l\'application.' : ''}`;
    case 'ok': return 'Tous les passages attendus sont faits, sans échec ouvert.';
    case 'cours': return c.revoir ? 'Corrigé par l\'équipe, en attente d\'être rejoué.' : `${pluriel(faits, 'passage fait', 'passages faits')}${c.attendus ? ` sur ${c.attendus}` : ''}.`;
    case 'na': return 'Tous les passages disent sans objet.';
    case 'trou': return 'Personne n\'a reçu ce scénario : relancez la répartition dans la campagne.';
    default: return 'Personne ne l\'a encore passé.';
  }
};

const CLE_DEPLIE = 'suivi:tableau-deplie';
/* Changer un filtre de la page Tests la remonte entièrement : la campagne
   et la voie choisies survivent ici, le temps de la visite. */
const memoire = { campagne: '', voie: 'humains' };
const lireDeplie = () => { try { return localStorage.getItem(CLE_DEPLIE) === '1'; } catch (e) { return false; } };

/**
 * Monte la section dans `boite`. `projet()` rend le projet choisi sur la
 * page Tests ('' pour tous : la section prend alors celui qui a une
 * campagne en cours). Rend la fonction de démontage.
 */
export const monter = (boite, env, { projet: projetChoisi = () => '', plateforme: plateformeChoisie = () => '' } = {}) => {
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = boite;
  boite.classList.add('tb-section');

  /* La plateforme n'est pas un choix de la section : c'est le filtre de
     la page Tests, en haut, qui vaut pour tout ce qu'elle montre. */
  const etat = { campagne: memoire.campagne, voie: memoire.voie, deplie: lireDeplie() };
  Object.defineProperty(etat, 'plateforme', { get: () => plateformeChoisie() || '', enumerable: true });

  /* La présence et les robots ne s'ouvrent qu'à l'équipe : les règles
     refuseraient la lecture à un client. */
  if (equipe) {
    lot.abonner(K.presences, () => collection(bdd, 'presences'));
    lot.abonner(K.robots, () => collection(bdd, 'robots'));
  }

  const donnees = () => {
    const projets = (magasin.lire(K.projets) || []).filter((p) => !p.archive);
    const rass = (groupe, parProjet) => (equipe
      ? (magasin.lire(groupe) || [])
      : projets.flatMap((p) => (magasin.lire(parProjet(p.id)) || []).map((x) => ({ ...x, _parent: x._parent || p.id }))));
    return {
      projets,
      scenarios: rass(K.scenariosTous, K.scenarios),
      campagnes: rass(K.campagnesToutes, K.campagnes),
      anomalies: rass(K.anomaliesToutes, K.anomalies),
      parcours: rass(K.parcoursTous, K.parcours),
      regles: rass(K.reglesToutes, K.regles),
      testeurs: magasin.lire(K.testeurs) || [],
      profils: profilsTesteurs(env.session),
      presences: magasin.lire(K.presences) || [],
    };
  };

  /* Le projet : celui qu'on a choisi, sinon le premier qui a une campagne
     en cours, sinon le premier qui a des tests. */
  const projetCourant = (d) => {
    const avecTests = d.projets.filter((p) => d.scenarios.some((s) => projetDe(s) === p.id) || d.parcours.some((x) => projetDe(x) === p.id));
    const choisi = projetChoisi();
    if (choisi) return { pid: avecTests.some((p) => p.id === choisi) ? choisi : '', avecTests };
    const enCours = avecTests.find((p) => d.campagnes.some((c) => projetDe(c) === p.id && c.statut === 'en-cours'));
    return { pid: (enCours || avecTests[0] || {}).id || '', avecTests };
  };

  /* Les campagnes d'un projet : celle en cours d'abord, puis celles en
     préparation, puis les closes, les plus récentes en tête. */
  const RANG_CAMPAGNE = { 'en-cours': 0, preparation: 1, close: 2 };
  const campagnesDe = (d, pid) => d.campagnes.filter((c) => projetDe(c) === pid)
    .sort((a, b) => ((RANG_CAMPAGNE[a.statut] ?? 3) - (RANG_CAMPAGNE[b.statut] ?? 3))
      || (enDate(b.cree) || 0) - (enDate(a.cree) || 0));

  /* Les passages et les sessions arrivent sur des clés nées en cours de
     route : on s'y abonne quand la campagne ou le testeur apparaît. */
  const suivis = new Set();
  const suivre = (cle, fabrique) => {
    if (suivis.has(cle)) return;
    suivis.add(cle);
    lot.abonner(cle, fabrique);
    lot.sur(cle, () => rendre());
  };

  let dernier = null;
  let empreinte = '';
  const cles = () => [K.projets, K.presences, K.robots, ...(equipe
    ? [K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.parcoursTous, K.reglesToutes, K.testeurs]
    : [...(magasin.lire(K.projets) || []).flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id), K.parcours(p.id), K.regles(p.id), K.profilsTesteurs(p.id)])]),
  ...suivis];

  const rendre = (force = false) => {
    const d = donnees();
    const { pid, avecTests } = projetCourant(d);
    const camps = pid ? campagnesDe(d, pid) : [];
    const campagne = camps.find((c) => c.id === etat.campagne) || camps[0] || null;

    if (campagne) suivre(K.passages(campagne.id), () => collection(bdd, 'projets', pid, 'campagnes', campagne.id, 'passages'));
    if (equipe && pid) suivre(K.executions(pid), () => query(collection(bdd, 'projets', pid, 'executions'), orderBy('debut', 'desc'), limit(8)));
    if (equipe && campagne) {
      (campagne.testeurs || []).forEach((uid) => suivre(K.sessions(uid), () => query(collection(bdd, 'presences', uid, 'sessions'), orderBy('debut', 'desc'), limit(60))));
    }

    /* La présence vieillit sans que rien ne change en base : l'horloge
       redessine, et l'empreinte doit donc compter la minute. */
    const sceau = `${magasin.empreinte(cles())}|${JSON.stringify(etat)}|${pid}|${boite.isConnected}|${equipe ? Math.floor(Date.now() / 15000) : ''}|${(d.presences || []).map((p) => `${p.id}${p.scenario || ''}${p.enLigne}${(enDate(p.vu) || 0).valueOf()}`).join(',')}`;
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    if (!pid) { sortie.innerHTML = ''; dernier = null; return; }

    const nom = (d.projets.find((p) => p.id === pid) || {}).nom || '';
    const passages = campagne ? (magasin.lire(K.passages(campagne.id)) || []) : [];
    const th = campagne ? tableauHumain({
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), campagne, passages,
      anomalies: d.anomalies.filter((a) => projetDe(a) === pid), blocs: BLOCS_SCENARIO, trous: equipe,
    }) : null;
    const tm = tableauMachine({
      parcours: d.parcours.filter((x) => projetDe(x) === pid), regles: d.regles.filter((x) => projetDe(x) === pid),
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), blocs: BLOCS_SCENARIO, outils: OUTILS_PARCOURS,
    });

    /* Le rythme de la campagne, en mots. */
    const r = campagne ? rythme({ debut: enDate(campagne.debut), fin: enDate(campagne.fin), faits: th.faits, attendus: th.attendus }) : null;
    const datesFausses = campagne && enDate(campagne.debut) && enDate(campagne.fin) && enDate(campagne.fin) < enDate(campagne.debut);
    const metaHumain = campagne ? [
      echapper(campagne.titre || 'Campagne'),
      (STATUTS_CAMPAGNE[campagne.statut] || {}).libelle || '',
      `${th.faits} passages sur ${th.attendus}`,
      r && r.avant ? `commence dans ${pluriel(r.avant, 'jour', 'jours')}` : '',
      r && !r.avant ? `jour ${r.jour} sur ${r.jours}` : '',
      r && !r.avant && r.reste !== null && r.reste > 0 ? `reste ≈ ${r.reste} j au rythme actuel` : '',
      equipe && datesFausses ? '<span class="tb-rouge">dates de campagne inversées</span>' : '',
    ].filter(Boolean).join(' · ') : 'Aucune campagne pour ce projet';

    const derniers = d.parcours.filter((x) => projetDe(x) === pid).map((x) => enDate((x.dernier || {}).le)).filter(Boolean).sort((a, b) => b - a);
    const metaMachine = tm.total
      ? [`${tm.compte.ok} au vert sur ${tm.total}`, tm.tournent ? `<span class="tb-bleu">${pluriel(tm.tournent, 'test', 'tests')} en exécution</span>` : '', derniers.length ? `dernier résultat ${echapper(depuis(derniers[0]))}` : 'jamais exécutés'].filter(Boolean).join(' · ')
      : 'Aucun test automatisé déclaré';

    const ligneResume = (nomLigne, meta, t, pc) => `<div class="tb-ligne">
      <div class="tb-ligne-tete">
        <div><span class="tb-ligne-nom">${nomLigne}</span><span class="tb-ligne-meta">${meta}</span></div>
        <b class="tb-ligne-pc">${pc}<small> %</small></b>
      </div>
      ${t && t.total ? barreHtml(t) : '<div class="tb-barre"></div>'}
    </div>`;

    const maintenant = Date.now();
    const nommer = nommeur(d, { equipe, pid });
    const presents = equipe && campagne ? d.presences.filter((p) => estLa(p, maintenant) && p.campagne === campagne.id) : [];
    const execs = equipe ? (magasin.lire(K.executions(pid)) || []) : [];
    const execEnCours = execs.find((e) => e.statut === 'en-cours');
    const direct = `<div class="tb-direct" aria-live="polite">${presents.map((p) => {
      const qui = nommer(p.id).nom;
      const sc = p.scenario ? d.scenarios.find((x) => x.ref === p.scenario && projetDe(x) === pid) : null;
      return `<button type="button" class="tb-present" data-personne="${echapper(p.id)}"><i></i>${echapper(qui)}<span>${p.plateforme ? `${echapper((PLATEFORMES_TEST[p.plateforme] || {}).court || p.plateforme)} · ` : ''}${sc ? `sur ${echapper(sc.ref)}` : 'sur son tableau'} · là depuis ${duree(maintenant - (enDate(p.debut) || new Date()).getTime())}</span></button>`;
    }).join('')}${tm.tournent ? `<span class="tb-present" role="status"><i style="background:var(--case-cours)"></i>Exécution en cours<span>${equipe && execEnCours
      ? `${echapper((OUTILS_PARCOURS[execEnCours.outil] || {}).court || execEnCours.outil)}${execEnCours.plateforme ? ` · ${echapper(execEnCours.plateforme)}` : ''}${execEnCours.branche ? ` · ${echapper(execEnCours.branche)}` : ''}${execEnCours.commit ? `@${echapper(execEnCours.commit.slice(0, 8))}` : ''} · ${execEnCours.faits || 0}/${execEnCours.total || 0} rendus · ${echapper(depuis(execEnCours.debut))}`
      : `${pluriel(tm.tournent, 'test', 'tests')} en cours`}</span></span>` : ''}</div>`;

    const pcHumain = th ? Math.round((th.faits / (th.attendus || 1)) * 100) : 0;
    const pcMachine = Math.round((tm.compte.ok / (tm.total || 1)) * 100);
    const combien = `${th ? pluriel(th.total, 'scénario', 'scénarios') : ''}${th && tm.total ? ' et ' : ''}${tm.total ? pluriel(tm.total, 'test automatisé', 'tests automatisés') : ''}`;

    const controles = `<div class="tb-controles">
      <div class="rang">
        <div class="segments" role="group" aria-label="Voie">
          <button type="button" data-voie="humains" aria-pressed="${etat.voie !== 'machine'}">Tests humains</button>
          <button type="button" data-voie="machine" aria-pressed="${etat.voie === 'machine'}">Tests automatisés</button>
        </div>
        ${etat.voie !== 'machine' && camps.length > 1 ? `<select class="select" id="tb-campagne" style="width:auto" aria-label="Campagne">${camps.map((c) => `<option value="${echapper(c.id)}"${campagne && c.id === campagne.id ? ' selected' : ''}>${echapper(c.titre || 'Campagne')} · ${echapper((STATUTS_CAMPAGNE[c.statut] || {}).libelle || '')}</option>`).join('')}</select>` : ''}
      </div>
    </div>`;

    sortie.innerHTML = `<div class="tb${etat.voie === 'machine' ? ' tb--machine' : ''}">
      <div class="tb-tete tb-resume">
        <div class="tb-resume-tete">
          <div><p class="surtitre">Tableau des tests${projetChoisi() ? '' : ` · ${echapper(nom)}`}</p><h2 class="tb-titre">Avancement</h2></div>
        </div>
        ${ligneResume('Tests humains', metaHumain, th, pcHumain)}
        ${ligneResume('Tests automatisés', metaMachine, tm, pcMachine)}
        ${direct}
        <button type="button" class="tb-deplier" data-deplier aria-expanded="${etat.deplie}">${icone('chevron')} ${etat.deplie ? 'Replier le tableau' : `Déployer le tableau${combien ? ` · ${combien}` : ''}`}</button>
      </div>
      ${etat.deplie ? `${controles}${etat.voie === 'machine' ? voieMachine(d, pid, tm, execs) : voieHumains(d, pid, campagne, th, passages, nommer, maintenant, presents)}` : ''}
    </div>`;
    dernier = { d, pid, campagne };

    const selC = sortie.querySelector('#tb-campagne');
    if (selC) selC.addEventListener('change', (e) => { etat.campagne = e.target.value; memoire.campagne = etat.campagne; rendre(true); });
  };

  /* ------------------------------------------------------------------------
     Les tests humains
     ------------------------------------------------------------------------ */
  const voieHumains = (d, pid, campagne, thToutes, passages, nommer, maintenant, presents) => {
    if (!campagne) {
      return `<p class="aide">Aucune campagne pour ce projet.${equipe ? ' Créez-la dans la section Campagnes ci-dessous.' : ''}</p>`;
    }
    const t = etat.plateforme ? tableauHumain({
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), campagne, passages,
      anomalies: d.anomalies.filter((a) => projetDe(a) === pid), plateforme: etat.plateforme,
      blocs: BLOCS_SCENARIO, trous: equipe,
    }) : thToutes;
    const vivants = new Set(presents.map((p) => p.scenario).filter(Boolean));
    return `${t.total ? famillesHtml(t, { mode: equipe ? 'equipe' : 'client', vivants, choisie: '' }) : vide({ icone: 'bug', titre: 'Cette campagne n\'a aucun scénario', compact: true })}
    ${equipe ? personnesHtml(d, pid, campagne, passages, nommer, maintenant) : ''}`;
  };

  /* Les testeurs de la campagne : qui est là, quand il est venu, combien
     de temps, où il en est. L'équipe seule. */
  const personnesHtml = (d, pid, campagne, passages, nommer, maintenant) => {
    const uids = campagne.testeurs || [];
    if (!uids.length) return `<p class="tb-section-titre">Les testeurs</p><p class="aide">Aucun testeur dans cette campagne. Ajoutez-en depuis la campagne, puis répartissez.</p>`;
    return `<p class="tb-section-titre">Les testeurs</p>
    <div class="tb-gens">${uids.map((uid) => {
      const p = d.presences.find((x) => x.id === uid);
      const sessions = (magasin.lire(K.sessions(uid)) || []).filter((s) => !s.campagne || s.campagne === campagne.id);
      const total = sessions.reduce((n, s) => n + Math.max(0, (enDate(s.vu) || 0) - (enDate(s.debut) || 0)), 0);
      const miens = ((campagne.affectation || {})[uid] || []).length;
      const siens = passages.filter((x) => x.testeur === uid);
      const faits = siens.filter((x) => !(x.resultat === 'ko' && x.aRevoir)).length;
      const ko = siens.filter((x) => x.resultat === 'ko' && !x.aRevoir).length;
      const la = estLa(p, maintenant);
      const vu = p && enDate(p.vu);
      return `<button type="button" class="tb-personne" data-personne="${echapper(uid)}">
        <div class="tb-personne-tete"><b>${echapper(nommer(uid).nom)}</b>
          <span class="tb-etat${la ? ' tb-etat--la' : ''}">${la ? `en ligne${p.scenario ? ` · ${echapper(p.scenario)}` : ''}` : (vu ? `vu ${echapper(depuis(vu))}` : 'jamais venu')}</span></div>
        <div class="tb-mini"><i style="flex-basis:${miens ? ((faits / miens) * 100).toFixed(1) : 0}%;background:var(--case-ok)"></i></div>
        <div class="tb-chiffres"><span><b>${faits}</b>/${miens} faits</span>${ko ? `<span><b>${ko}</b> KO</span>` : ''}${sessions.length ? `<span><b>${duree(total)}</b> en ${pluriel(sessions.length, 'session', 'sessions')}</span>` : ''}</div>
      </button>`;
    }).join('')}</div>`;
  };

  /* ------------------------------------------------------------------------
     Les tests automatisés
     ------------------------------------------------------------------------ */
  const voieMachine = (d, pid, t, execs) => {
    const vivants = new Set(t.familles.flatMap((f) => f.cases).filter((c) => c.etat === 'tourne').map((c) => c.ref));
    return `${t.total ? famillesHtml(t, { mode: 'machine', vivants }) : vide({ icone: 'code', titre: 'Aucun test automatisé', texte: equipe ? 'Déclarez vos parcours dans la section Parcours ci-dessous, puis branchez un robot : chaque résultat s\'allumera ici en direct.' : 'Les tests automatisés apparaîtront ici.', compact: true })}
    ${equipe ? robotsHtml(pid, execs) : ''}`;
  };

  const robotsHtml = (pid, execs) => {
    const robots = (magasin.lire(K.robots) || []).filter((r) => r.projet === pid);
    return `<p class="tb-section-titre">Les robots</p>
    <div class="tb-gens">
      ${robots.map((r) => `<div class="tb-personne" style="cursor:default">
        <div class="tb-personne-tete"><b>${echapper(r.nom || 'Robot')}</b><span class="tb-etat">jeton …${echapper(r.fin || '')}</span></div>
        <div class="tb-chiffres"><span>${r.dernier ? `a parlé ${echapper(depuis(r.dernier))}` : 'jamais utilisé'}</span></div>
        <div class="rang"><button class="btn btn-doux btn-petit" type="button" data-revoquer="${echapper(r.id)}">Révoquer</button></div>
      </div>`).join('')}
      <button type="button" class="tb-personne" data-robot-neuf="${echapper(pid)}"><div class="tb-personne-tete"><b>${icone('plus')} Brancher un robot</b></div><div class="tb-chiffres"><span>Un jeton pour Maestro, Playwright, Jest ou Test Lab.</span></div></button>
    </div>
    ${execs.length ? `<p class="tb-section-titre">Dernières exécutions</p><div class="tb-sessions">${execs.map((e) => `<div class="tb-session">
      <span>${echapper((OUTILS_PARCOURS[e.outil] || {}).court || e.outil || '')}${e.plateforme ? ` · ${echapper(e.plateforme)}` : ''}${e.branche ? ` · ${echapper(e.branche)}` : ''}${e.commit ? `@${echapper(String(e.commit).slice(0, 8))}` : ''}</span>
      <span>${e.statut === 'en-cours' ? 'en cours' : e.statut === 'interrompue' ? 'interrompue' : 'finie'} · ${e.verts || 0} verts · ${e.rouges || 0} rouges${e.instables ? ` · ${e.instables} instables` : ''} · ${e.faits || 0}/${e.total || 0} · ${echapper(depuis(e.debut))}</span>
    </div>`).join('')}</div>` : ''}`;
  };

  /* ------------------------------------------------------------------------
     Les détails
     ------------------------------------------------------------------------ */
  const ouvrirCaseHumaine = (ref) => {
    const { d, pid, campagne } = dernier || {};
    if (!campagne) return;
    const t = tableauHumain({
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), campagne,
      passages: magasin.lire(K.passages(campagne.id)) || [], anomalies: d.anomalies.filter((a) => projetDe(a) === pid),
      plateforme: etat.plateforme, blocs: BLOCS_SCENARIO, trous: equipe,
    });
    const c = t.familles.flatMap((f) => f.cases).find((x) => x.ref === ref);
    if (!c) return;
    const nommer = nommeur(d, { equipe, pid });
    const affectes = Object.entries(campagne.affectation || {}).filter(([, refs]) => (refs || []).includes(ref)).map(([uid]) => uid);
    const uids = Array.from(new Set([...affectes, ...c.passages.map((p) => p.testeur)]));
    const presents = equipe ? (magasin.lire(K.presences) || []).filter((p) => estLa(p) && p.scenario === ref && p.campagne === campagne.id).map((p) => p.id) : [];
    const e = ETATS_CASE[c.etat] || {};

    const m = modale({
      titre: `${c.ref} · ${c.titre}`, feuille: true,
      sousTitre: `${(BLOCS_SCENARIO[c.bloc] || {}).libelle || ''}${c.niveau ? ` · ${(NIVEAUX_SCENARIO[c.niveau] || {}).libelle || c.niveau}` : ''}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}.</strong> ${echapper(pourquoi(c))}</p>
        ${c.revoir ? '<p class="aide">Une correction attend d\'être rejouée par le testeur qui avait trouvé le défaut.</p>' : ''}
        <div class="groupe"><span class="etiquette-champ">Les passages</span>
          <div class="tb-sessions">${uids.length ? uids.map((uid) => {
            const p = c.passages.find((x) => x.testeur === uid);
            const qui = nommer(uid);
            const appareil = p && ((p.contexte || {}).appareil || (p.contexte || {}).plateforme);
            const ici = presents.includes(uid);
            return `<div class="tb-passage">
              <div><p><strong>${echapper(qui.nom)}</strong>${p && p.plateforme ? ` · ${echapper((PLATEFORMES_TEST[p.plateforme] || {}).libelle || p.plateforme)}` : ''}${appareil ? ` · ${echapper(appareil)}` : ''}${ici ? ' · <span class="tb-bleu">l\'a ouvert en ce moment</span>' : ''}</p>
                ${p ? `<p class="aide">${p.le ? echapper(dateHeure(p.le)) : ''}${p.commentaire ? ` · ${echapper(p.commentaire)}` : ''}${p.aRevoir ? ' · corrigé, à rejouer' : ''}</p>` : ''}</div>
              <div class="rang">${p ? pastille(RESULTATS_PASSAGE, p.resultat) : '<span class="etiquette">attendu</span>'}${((p && p.preuves) || []).map((ch, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(ch)}">${icone('image')} Preuve ${i + 1}</button>`).join('')}</div>
            </div>`;
          }).join('') : '<p class="aide">Personne n\'a reçu ce scénario.</p>'}</div>
        </div>
        ${c.anomalies.length ? `<div class="groupe"><span class="etiquette-champ">Anomalies</span><div class="tb-sessions">${c.anomalies.map((a) => `<div class="tb-passage">
          <p>${echapper(a.titre || 'Anomalie')}${Number(a.retours) ? ' · <span class="tb-rouge">revenue</span>' : ''}</p>
          <div class="rang">${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-qualifier="${echapper(a.id)}">Qualifier</button>` : ''}</div>
        </div>`).join('')}</div></div>` : ''}`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    });
    brancherPieces(m.el);
    sur(m.el, 'click', '[data-qualifier]', async (el) => {
      const a = c.anomalies.find((x) => x.id === el.dataset.qualifier);
      m.fermer();
      if (a) await editer('anomalie', env, { pid, fiche: a });
    });
  };

  const ouvrirCaseMachine = async (ref) => {
    const { d, pid } = dernier || {};
    const x = d.parcours.find((y) => y.ref === ref && projetDe(y) === pid) || d.regles.find((y) => y.ref === ref && projetDe(y) === pid);
    if (!x) return;
    const regle = !d.parcours.includes(x);
    const der = x.dernier || {};
    let detail = null;
    if (equipe && der.execution) {
      try { const s = await getDoc(doc(bdd, 'projets', pid, 'executions', der.execution, 'resultats', ref)); if (s.exists()) detail = s.data(); } catch (e) { /* rien */ }
    }
    const t = tableauMachine({ parcours: regle ? [] : [x], regles: regle ? [x] : [] });
    const c = t.familles[0].cases[0];
    const e = ETATS_CASE[c.etat] || {};
    const m = modale({
      titre: `${x.ref} · ${x.titre || ''}`, feuille: true,
      sousTitre: regle ? 'Règle métier' : `${(OUTILS_PARCOURS[x.outil] || {}).libelle || x.outil || ''}${(x.plateformes || []).length ? ` · ${(x.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', ')}` : ''}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}.</strong> ${der.le ? `Dernier résultat ${echapper(dateHeure(der.le))}${der.duree ? `, en ${echapper(String(der.duree))} s` : ''}.` : 'Jamais exécuté.'}${x.etat === 'instable' ? ' Passé au vert après un nouvel essai : un parcours instable n\'apprend rien, il faut le fiabiliser.' : ''}</p>
        ${(x.scenarios || []).length ? `<p class="aide">Couvre ${(x.scenarios || []).map((r) => `<span class="ref">${echapper(r)}</span>`).join(', ')}.</p>` : ''}
        ${!regle ? `<p class="aide">${x.mutation ? 'Éprouvé : on l\'a vu tomber en remettant le défaut exprès.' : 'Pas encore éprouvé par une mutation : tant qu\'on ne l\'a pas vu tomber, son vert ne prouve rien.'}</p>` : ''}
        ${detail ? `<div class="groupe"><span class="etiquette-champ">Ce que la machine a dit</span>
          <p class="t-corps">${detail.message ? echapper(detail.message) : 'Aucun message.'}</p>
          <p class="aide">${detail.essais > 1 ? `${detail.essais} essais · ` : ''}exécution ${echapper(der.execution)}${detail.lien ? ` · <a href="${echapper(detail.lien)}" target="_blank" rel="noopener">voir le rapport</a>` : ''}</p></div>` : ''}`,
      pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>${equipe && !regle ? '<button class="btn btn-principal" type="button" data-modifier>Modifier</button>' : ''}`,
    });
    sur(m.el, 'click', '[data-modifier]', async () => { m.fermer(); await editer('parcours', env, { pid, fiche: x }); });
  };

  const ouvrirPersonne = (uid) => {
    const { d, pid, campagne } = dernier || {};
    if (!campagne) return;
    const nommer = nommeur(d, { equipe, pid });
    const p = (magasin.lire(K.presences) || []).find((x) => x.id === uid);
    const sessions = (magasin.lire(K.sessions(uid)) || []);
    const total = sessions.reduce((n, s) => n + Math.max(0, (enDate(s.vu) || 0) - (enDate(s.debut) || 0)), 0);
    const la = estLa(p);
    modale({
      titre: nommer(uid).nom, feuille: true,
      sousTitre: la ? `En ligne${p.scenario ? `, sur ${p.scenario}` : ''}` : (p && p.vu ? `Vu ${depuis(p.vu)}` : 'Jamais venu'),
      corps: `
        <div class="tb-chiffres" style="margin-bottom:14px"><span><b>${duree(total)}</b> au total</span><span><b>${sessions.length}</b> ${sessions.length > 1 ? 'sessions' : 'session'}</span>${sessions[0] ? `<span>première le <b>${echapper(dateCourte(sessions[sessions.length - 1].debut))}</b></span>` : ''}</div>
        <div class="tb-sessions">${sessions.length ? sessions.map((s) => `<div class="tb-session">
          <span>${echapper(dateCourte(s.debut))} · ${echapper(heure(s.debut))} à ${echapper(heure(s.vu))}${s.plateforme ? ` · ${echapper((PLATEFORMES_TEST[s.plateforme] || {}).court || s.plateforme)}` : ''}</span>
          <b>${duree((enDate(s.vu) || 0) - (enDate(s.debut) || 0))}</b>
        </div>`).join('') : '<p class="aide">Aucune connexion enregistrée.</p>'}</div>`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    });
  };

  const brancherRobot = async (pid) => {
    const m = modale({
      titre: 'Brancher un robot',
      sousTitre: 'Un jeton par outil ou par chaîne d\'intégration. Il n\'ouvre que ce projet, et seulement pour rendre des résultats.',
      corps: `<form class="forme" id="forme-robot" novalidate>
        <div class="groupe"><label class="etiquette-champ" for="robot-nom">Nom</label>
          <input class="champ" id="robot-nom" maxlength="80" placeholder="Maestro iOS, GitHub Actions"></div>
      </form>`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="forme-robot">Créer le jeton</button>',
    });
    m.el.querySelector('#forme-robot').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const bouton = m.el.querySelector('[type="submit"]');
      await agir(bouton, async () => {
        const r = await appelServeur('creerJetonRobot', { projet: pid, nom: m.el.querySelector('#robot-nom').value.trim() });
        const url = URL_SUIVI.replace(/suiviAdmin$/, 'suiviRobot');
        m.corps.innerHTML = `
          <p class="t-corps"><strong>Copiez ce jeton maintenant : il ne sera plus jamais affiché.</strong></p>
          <div class="rang" style="gap:8px;align-items:center;margin:10px 0 16px"><code class="ref" style="word-break:break-all">${echapper(r.jeton)}</code><button class="btn btn-doux btn-petit" type="button" data-copier="${echapper(r.jeton)}">${icone('copier')} Copier</button></div>
          <p class="aide">Dans la chaîne d'intégration, gardez-le comme secret (CAPMEDIA_ROBOT), puis :</p>
          <pre class="ref" style="white-space:pre-wrap;background:var(--fond-2);padding:12px;border-radius:12px">node robot-rapport.mjs --url ${echapper(url)} \\
  --outil maestro --plateforme ios rapport-junit.xml</pre>
          <p class="aide">Le nom de chaque test doit commencer par la référence du parcours (R-01, C-03…). Pour un résultat en direct test par test, le rapporteur Playwright fourni envoie chaque verdict dès qu'il tombe.</p>`;
        m.pied.innerHTML = '<button class="btn btn-principal" type="button" data-fermer>J\'ai copié le jeton</button>';
        sur(m.el, 'click', '[data-copier]', (el) => copier(el.dataset.copier));
      });
    });
  };

  /* ------------------------------------------------------------------------ */

  const gestes = sur(sortie, 'click', '[data-deplier], [data-voie], [data-case], [data-personne], [data-robot-neuf], [data-revoquer]', async (el) => {
    if (el.hasAttribute('data-deplier')) {
      etat.deplie = !etat.deplie;
      try { localStorage.setItem(CLE_DEPLIE, etat.deplie ? '1' : '0'); } catch (e) { /* stockage refusé */ }
      rendre(true);
      return;
    }
    if (el.dataset.voie) { etat.voie = el.dataset.voie; memoire.voie = etat.voie; rendre(true); return; }
    if (el.dataset.case) { if (etat.voie === 'machine') await ouvrirCaseMachine(el.dataset.case); else ouvrirCaseHumaine(el.dataset.case); return; }
    if (el.dataset.personne) { ouvrirPersonne(el.dataset.personne); return; }
    if (el.dataset.robotNeuf) { await brancherRobot(el.dataset.robotNeuf); return; }
    if (el.dataset.revoquer) {
      await agir(el, () => appelServeur('revoquerJetonRobot', { id: el.dataset.revoquer }), 'Jeton révoqué. Le robot ne peut plus rien envoyer.');
    }
  });

  /* Les projets d'un client peuvent arriver après le montage : on écoute
     les clés à mesure qu'elles apparaissent, une seule fois chacune. */
  const ecoutees = new Set();
  const ecouter = () => cles().forEach((c) => {
    if (ecoutees.has(c) || suivis.has(c)) return;
    ecoutees.add(c);
    lot.sur(c, () => { ecouter(); rendre(); });
  });
  ecouter();
  const horloge = equipe ? setInterval(() => rendre(), 15000) : null;
  rendre(true);

  return {
    /* La page Tests a changé de projet : on redessine tout de suite. */
    rafraichir: () => rendre(true),
    fin: () => { gestes(); lot.fin(); if (horloge) clearInterval(horloge); },
  };
};

