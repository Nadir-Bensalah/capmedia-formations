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
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE, OUTILS_PARCOURS,
  bdd, collection, query, orderBy, limit, doc, getDoc,
} from '../noyau.js';
import { icone, pastille, vide, sur, modale, agir, brancherPieces, copier } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, profilsTesteurs } from '../donnees.js';
import { editer } from './editeurs.js';
import { nommeur, explicationStatut } from './tests.js';
import { appelServeur, URL_SUIVI } from '../serveur.js';
import { tableauHumain, tableauHumainPlan, tableauMachine, tableauPlan, verdictParcours, rythme, ETATS_CASE, campagneSurPlan, affectationPlan, clesDuTesteur, clePassage, resultatCourt } from '../verdicts.js';
import { barreHtml, famillesHtml } from '../grille.js';
import { ordonnerSections, GROUPES_PLAN, QUI_PLAN } from './plan-tests.js';
import { clesDe } from '../repartition.js';
import { VERDICTS, verdictDe } from '../campagne-plan.js';

/* Le résultat d'un passage, en mots : « Réussi », « Échec », « Sans
   objet ». Les passages d'avant le 03/10/2026 disent ok, ko, na ; ceux
   d'après, reussi, echec, sans-objet. La carte des anciens mots laissait
   les nouveaux en clé brute dans la fiche d'une case. */
const pastilleResultat = (r) => pastille(VERDICTS, verdictDe(r));

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
  /* Les verdicts du plan (echec) et ceux d'avant (ko) se lisent pareil. */
  const aRejouer = (p) => resultatCourt(p.resultat) === 'ko' && p.aRevoir === true;
  const echecs = c.passages.filter((p) => resultatCourt(p.resultat) === 'ko' && !aRejouer(p)).length;
  const faits = c.passages.filter((p) => !aRejouer(p)).length;
  const ouverte = c.anomalies.find((a) => ['nouvelle', 'a-reverifier', 'confirmee'].includes(a.statut));
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

/* Les sections du plan de tests d'un projet, dans l'ordre de la page
   « Ce qui va être testé ». Vide : le projet n'a pas de plan, et l'onglet
   des robots garde ses familles d'avant. */
const sectionsDuPlan = (pid) => (pid ? ordonnerSections(magasin.lire(K.planTests(pid))) : []);
const listeRefs = (refs) => refs.map((r) => `<span class="ref">${echapper(r)}</span>`).join(', ');
const libellePlateforme = (p) => (PLATEFORMES_TEST[p] || {}).libelle || p;
/* Un testeur sur une campagne du plan signale la clé qu'il a ouverte
   (« taches-f-001__ios ») : la case est celle de son scénario. */
const scenarioOuvert = (x) => String(x || '').replace(/__(ios|android|web)$/, '');
const etatCaseHtml = (etat) => `<span class="tb-etat-case"><i class="tb-puce" data-e="${echapper(etat)}" aria-hidden="true"></i>${echapper((ETATS_CASE[etat] || {}).libelle || etat)}</span>`;

/* Pourquoi cette couleur, pour un scénario du plan. */
const pourquoiPlan = (c, plateforme) => {
  if (!c.rattaches.length) return 'Pas encore de test robot écrit.';
  const ici = c.rattaches.filter((x) => surPlateforme(x, plateforme));
  const de = (etat) => ici.filter((x) => verdictParcours(x) === etat).map((x) => x.ref);
  const manquent = c.parPlateforme.filter((p) => !p.parcours.length && (!plateforme || p.plateforme === plateforme)).map((p) => libellePlateforme(p.plateforme));
  const plusieurs = ici.length > 1 ? ' Plusieurs tests : le plus mauvais résultat l\'emporte.' : '';
  switch (c.etat) {
    case 'casse': return `${de('casse').join(', ')} en échec au dernier passage.${plusieurs}`;
    case 'fragile': return `${de('fragile').join(', ')} au vert seulement après un nouvel essai : un test instable n'apprend rien.${plusieurs}`;
    case 'connu': return `${de('connu').join(', ')} en échec sur un défaut déjà connu de l'équipe : ${de('connu').length > 1 ? 'ils passeront' : 'il passera'} au vert quand il sera corrigé.${plusieurs}`;
    case 'tourne': return 'Un test robot rattaché tourne en ce moment.';
    case 'jamais': return `${de('jamais').join(', ')} jamais lancé${de('jamais').length > 1 ? 's' : ''} : rien n'est encore prouvé.`;
    case 'suspendu': return `${de('suspendu').join(', ')} suspendu${de('suspendu').length > 1 ? 's' : ''} pour l'instant.`;
    case 'aecrire': return manquent.length ? `Pas encore de test robot sur ${manquent.join(', ')}.` : `${de('aecrire').join(', ')} encore à écrire.`;
    default: return `Le dernier résultat de ${ici.length > 1 ? 'chaque test robot rattaché' : 'son test robot'} est au vert.`;
  }
};

/* Pourquoi cette couleur, pour un scénario du plan fait par un humain. */
const pourquoiHumainPlan = (c, plateforme) => {
  if (c.etat === 'nonteste') return `Pas encore testé par un humain${plateforme ? ` sur ${libellePlateforme(plateforme)}` : ''}.`;
  if (c.etat === 'trou') {
    const sans = c.parPlateforme.filter((p) => p.etat === 'trou').map((p) => libellePlateforme(p.plateforme));
    return `Personne n'a reçu ce scénario${sans.length ? ` sur ${sans.join(', ')}` : ''} : relancez la répartition dans la campagne.`;
  }
  if (c.surPlan && c.etat === 'cours' && !c.revoir) return `${pluriel(c.faits, 'passage fait', 'passages faits')} sur ${c.attendus} attendus.${c.manquent.length ? ` Pas encore testé sur ${c.manquent.map(libellePlateforme).join(', ')}.` : ''}`;
  const nomPlat = (p) => (p ? libellePlateforme(p) : 'sans plateforme');
  const dapres = c.origines.filter((o) => o.etat === c.etat).map((o) => o.cle);
  const enEchec = plateforme ? [] : c.parPlateforme.filter((p) => ['casse', 'fragile'].includes(p.etat)).map((p) => nomPlat(p.plateforme));
  const ou = enEchec.length ? ` sur ${enEchec.join(', ')}` : '';
  const reste = c.manquent.length ? ` Pas encore testé sur ${c.manquent.map(nomPlat).join(', ')}.` : '';
  const plusieurs = c.origines.length > 1 ? ' Plusieurs scénarios rendent un résultat : le plus mauvais l\'emporte.' : '';
  switch (c.etat) {
    case 'casse': return `En échec${ou}, d'après ${dapres.join(', ')} : le défaut est reproduit, ou l'anomalie qualifiée grave.${plusieurs}${reste}`;
    case 'fragile': return `Un échec${ou}, d'après ${dapres.join(', ')}, pas encore qualifié ou jugé mineur.${plusieurs}${reste}`;
    case 'cours': return c.revoir ? 'Corrigé par l\'équipe, en attente d\'être rejoué.' : `Testé sur ${Array.from(new Set(c.passages.map((p) => nomPlat(p.plateforme)))).join(', ')}.${reste}`;
    case 'na': return `Tous les passages disent sans objet.${reste}`;
    default: return `Tous les résultats rendus sont bons, d'après ${dapres.join(', ')}.${plusieurs}`;
  }
};

const CLE_DEPLIE = 'suivi:tableau-deplie';
/* Les énoncés portent leurs mots forts entre doubles astérisques. */
const gras = (t) => echapper(t || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
/* Changer un filtre de la page Tests la remonte entièrement : la campagne
   et la voie choisies survivent ici, le temps de la visite. */
const memoire = { campagne: '', voie: 'humains' };
const lireDeplie = () => { try { return localStorage.getItem(CLE_DEPLIE) === '1'; } catch (e) { return false; } };

/**
 * Monte la section dans `boite`. `projet()` rend le projet choisi sur la
 * page Tests ('' pour tous : la section prend alors celui qui a une
 * campagne en cours). Rend la fonction de démontage.
 */
/* Même règle que la page Tests : sans plateforme déclarée, partout. */
const surPlateforme = (x, plateforme) => !plateforme || !(x.plateformes || []).length || x.plateformes.includes(plateforme);

/* La marque de chaque case du plan : qui fait le scénario, avec les
   couleurs de la page du plan (violet : humain et robot, bleu : robot seul,
   vert : humain seul). */
const marquer = (t) => {
  t.familles.forEach((f) => f.cases.forEach((c) => {
    if (c.qui && QUI_PLAN[c.qui]) c.marque = { ton: QUI_PLAN[c.qui].ton, libelle: QUI_PLAN[c.qui].court };
  }));
  return t;
};

export const monter = (boite, env, { projet: projetChoisi = () => '', plateforme: plateformeChoisie = () => '', ouvrirProbleme = null } = {}) => {
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = boite;
  boite.classList.add('tb-section');

  /* La plateforme n'est pas un choix de la section : c'est le filtre de
     la page Tests, en haut, qui vaut pour tout ce qu'elle montre. */
  const etat = { campagne: memoire.campagne, voie: memoire.voie, deplie: lireDeplie() };

  /* Les barres de progression se remplissent quand elles arrivent ou que
     leurs valeurs changent ; un redessin à l'identique (présence, horloge)
     les laisse en place. On retient la signature de chaque barre. */
  const barresVues = new Map();
  const animerBarres = (pid) => {
    sortie.querySelectorAll('.tb-barre').forEach((b, i) => {
      const cle = `${i}|${b.closest('.tb-resume') ? 'resume' : 'carte'}`;
      const signature = `${pid}|${etat.plateforme}|${etat.voie}|${etat.deplie}|${b.getAttribute('aria-label') || ''}`;
      if (barresVues.get(cle) === signature) return;
      barresVues.set(cle, signature);
      b.classList.add('tb-barre--anime');
    });
  };
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
    lot.sur(cle, redessiner);
  };
  /* Un dessin par tour, et le premier seulement quand toutes les clés sont
     là (voir « planifier », plus bas). */
  const redessiner = () => planifier();

  let dernier = null;
  let empreinte = '';
  const cles = () => [K.projets, K.presences, K.robots, ...(equipe
    ? [K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.parcoursTous, K.reglesToutes, K.testeurs]
    : [...(magasin.lire(K.projets) || []).flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id), K.parcours(p.id), K.regles(p.id), K.profilsTesteurs(p.id)])]),
  ...suivis];

  /* Les clés nées en cours de route (passages de la campagne, exécutions,
     sessions des testeurs) : on s'y abonne dès qu'on sait lesquelles, avant
     même le premier dessin, pour l'attendre avec elles. */
  const suivreTout = (d) => {
    const { pid } = projetCourant(d);
    const camps = pid ? campagnesDe(d, pid) : [];
    const campagne = camps.find((c) => c.id === etat.campagne) || camps[0] || null;
    if (campagne) suivre(K.passages(campagne.id), () => collection(bdd, 'projets', pid, 'campagnes', campagne.id, 'passages'));
    /* Le plan de tests du projet range l'onglet des robots, et ses chiffres
       en haut : on l'attend avec le reste. */
    if (pid) suivre(K.planTests(pid), () => collection(bdd, 'projets', pid, 'planTests'));
    if (equipe && pid) suivre(K.executions(pid), () => query(collection(bdd, 'projets', pid, 'executions'), orderBy('debut', 'desc'), limit(8)));
    if (equipe && campagne) {
      (campagne.testeurs || []).forEach((uid) => suivre(K.sessions(uid), () => query(collection(bdd, 'presences', uid, 'sessions'), orderBy('debut', 'desc'), limit(60))));
    }
  };

  const rendre = (force = false) => {
    const d = donnees();
    const { pid, avecTests } = projetCourant(d);
    const camps = pid ? campagnesDe(d, pid) : [];
    const campagne = camps.find((c) => c.id === etat.campagne) || camps[0] || null;
    suivreTout(d);

    /* La présence vieillit sans que rien ne change en base : l'horloge
       redessine, et l'empreinte doit donc compter la minute. */
    const sceau = `${magasin.empreinte(cles())}|${JSON.stringify(etat)}|${pid}|${boite.isConnected}|${equipe ? Math.floor(Date.now() / 15000) : ''}|${(d.presences || []).map((p) => `${p.id}${p.scenario || ''}${p.enLigne}${(enDate(p.vu) || 0).valueOf()}`).join(',')}`;
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    if (!pid) { sortie.innerHTML = ''; dernier = null; return; }
    /* Le plan d'un projet qu'on vient de choisir est encore en route : on
       garde le dessin d'avant un instant plutôt que de peindre l'ancienne
       grille puis la nouvelle. Son arrivée redessine. */
    if (magasin.enRoute(K.planTests(pid)) && sortie.childElementCount) { empreinte = ''; return; }

    const nom = (d.projets.find((p) => p.id === pid) || {}).nom || '';
    const passages = campagne ? (magasin.lire(K.passages(campagne.id)) || []) : [];
    /* Le filtre de plateforme de la page vaut aussi pour les deux lignes
       d'avancement : sans lui, « Web » montrait les chiffres de l'iPhone. */
    /* Avec un plan, les deux onglets se rangent par ses sections ; sans
       plan, ils gardent leurs familles (bloc des scénarios, puis outil). */
    const sections = sectionsDuPlan(pid);
    const th = sections.length ? marquer(tableauHumainPlan({
      sections, scenarios: d.scenarios.filter((s) => projetDe(s) === pid), campagne, passages,
      anomalies: d.anomalies.filter((a) => projetDe(a) === pid), plateforme: etat.plateforme, trous: equipe,
    })) : campagne ? tableauHumain({
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), campagne, passages,
      anomalies: d.anomalies.filter((a) => projetDe(a) === pid), plateforme: etat.plateforme, blocs: BLOCS_SCENARIO, trous: equipe,
    }) : null;
    const tm = sections.length ? marquer(tableauPlan({
      sections, parcours: d.parcours.filter((x) => projetDe(x) === pid), regles: d.regles.filter((x) => projetDe(x) === pid), plateforme: etat.plateforme,
    })) : tableauMachine({
      parcours: d.parcours.filter((x) => projetDe(x) === pid && surPlateforme(x, etat.plateforme)), regles: d.regles.filter((x) => projetDe(x) === pid),
      scenarios: d.scenarios.filter((s) => projetDe(s) === pid), blocs: BLOCS_SCENARIO, outils: OUTILS_PARCOURS,
    });

    /* Le rythme de la campagne, en mots. */
    const r = campagne && th ? rythme({ debut: enDate(campagne.debut), fin: enDate(campagne.fin), faits: th.faits, attendus: th.attendus }) : null;
    const datesFausses = campagne && enDate(campagne.debut) && enDate(campagne.fin) && enDate(campagne.fin) < enDate(campagne.debut);
    const metaHumain = campagne || (th && th.plan) ? [
      campagne ? echapper(campagne.titre || 'Campagne') : 'Aucune campagne pour ce projet',
      campagne ? (STATUTS_CAMPAGNE[campagne.statut] || {}).libelle || '' : '',
      th.unite === 'passages' ? `${th.faits} passages faits sur ${th.attendus}` : `${th.faits} vérifications faites sur ${th.attendus}`,
      th.plan && th.horsPlan ? `${th.horsPlan} hors plan, montrés à part` : '',
      !campagne ? '' : (campagne.testeurs || []).length ? pluriel((campagne.testeurs || []).length, 'testeur', 'testeurs') : 'aucun testeur',
      r && r.avant ? `commence dans ${pluriel(r.avant, 'jour', 'jours')}` : '',
      r && !r.avant ? `jour ${r.jour} sur ${r.jours}` : '',
      r && !r.avant && r.reste !== null && r.reste > 0 ? `reste ≈ ${r.reste} j au rythme actuel` : '',
      equipe && datesFausses ? '<span class="tb-rouge">dates de campagne inversées</span>' : '',
    ].filter(Boolean).join(' · ') : 'Aucune campagne pour ce projet';

    const derniers = d.parcours.filter((x) => projetDe(x) === pid && surPlateforme(x, etat.plateforme)).map((x) => enDate((x.dernier || {}).le)).filter(Boolean).sort((a, b) => b - a);
    /* Une seule unité pour les robots : le test. Deux sortes, dites en mots :
       ceux qui utilisent l'app comme un humain, ceux qui vérifient un calcul. */
    const nApp = d.parcours.filter((x) => x.actif !== false && projetDe(x) === pid && surPlateforme(x, etat.plateforme)).length;
    const nCalculs = d.regles.filter((x) => x.actif !== false && projetDe(x) === pid).length;
    const metaMachine = tm.plan
      ? [`${tm.compte.ok} réussis sur ${tm.total}`,
        `${pluriel(tm.scenarios, 'scénario du plan', 'scénarios du plan')}${tm.regles ? `, ${pluriel(tm.regles, 'règle sur les calculs', 'règles sur les calculs')}` : ''}`,
        tm.horsPlan ? `${tm.horsPlan} hors plan, montrés à part` : '',
        tm.tournent ? `<span class="tb-bleu">${pluriel(tm.tournent, 'test', 'tests')} en exécution</span>` : '',
        derniers.length ? `dernier résultat ${echapper(depuis(derniers[0]))}` : 'jamais exécutés'].filter(Boolean).join(' · ')
      : tm.total
      ? [`${tm.compte.ok} réussis sur ${tm.total}`, nApp && nCalculs ? `${nApp} dans l'app, ${nCalculs} sur les calculs` : '', tm.tournent ? `<span class="tb-bleu">${pluriel(tm.tournent, 'test', 'tests')} en exécution</span>` : '', derniers.length ? `dernier résultat ${echapper(depuis(derniers[0]))}` : 'jamais exécutés'].filter(Boolean).join(' · ')
      : 'Aucun test par robot pour l\'instant';

    const ligneResume = (nomLigne, meta, t, pc, aide = '') => `<div class="tb-ligne">
      <div class="tb-ligne-tete">
        <div><span class="tb-ligne-nom">${nomLigne}</span><span class="tb-ligne-meta">${meta}</span></div>
        <b class="tb-ligne-pc">${pc}<small> %</small></b>
      </div>
      ${t && t.total ? barreHtml(t) : '<div class="tb-barre"></div>'}
      ${aide ? `<p class="tb-ligne-aide">${aide}</p>` : ''}
    </div>`;
    /* D'où viennent les chiffres des humains, en une phrase. */
    const aideHumain = th && th.surPlan
      ? `Chaque scénario du plan fait par un humain est confié, plateforme par plateforme, à deux testeurs s'il est fait par un humain seul, à un testeur s'il est fait aussi par un robot. L'avancement compte ces passages ; la case prend le plus mauvais résultat rendu sur ce scénario${th.horsPlan ? ' ; les résultats hors plan se montrent à part, sans compter' : ''}.`
      : th && th.plan
      ? `Chaque scénario du plan fait par un humain compte une fois, coloré par le plus mauvais résultat des testeurs de la campagne : celui rendu sur lui-même, ou, pour une campagne d'avant le plan, celui hérité des scénarios qu'il reprend (TA-01…). Il est fait quand toutes ses plateformes ont un résultat, ou dès qu'un échec y est relevé${th.horsPlan ? ' ; les scénarios testés hors plan se montrent à part, sans compter' : ''}.`
      : '';
    /* D'où viennent les chiffres des robots, en une phrase. */
    const aideMachine = tm.plan
      ? `Chaque scénario du plan fait par un robot compte une fois, coloré par le plus mauvais résultat de ses tests${tm.regles ? ' ; les règles de calcul s\'ajoutent au compte' : ''}${tm.horsPlan ? ' ; les tests hors plan se montrent à part, sans compter' : ''}.`
      : '';

    const maintenant = Date.now();
    const nommer = nommeur(d, { equipe, pid });
    const presents = equipe && campagne ? d.presences.filter((p) => estLa(p, maintenant) && p.campagne === campagne.id) : [];
    const execs = equipe ? (magasin.lire(K.executions(pid)) || []) : [];
    const execEnCours = execs.find((e) => e.statut === 'en-cours');
    const direct = `<div class="tb-direct" aria-live="polite">${presents.map((p) => {
      const qui = nommer(p.id).nom;
      const ouvert = scenarioOuvert(p.scenario);
      return `<button type="button" class="tb-present" data-personne="${echapper(p.id)}"><i></i>${echapper(qui)}<span>${p.plateforme ? `${echapper((PLATEFORMES_TEST[p.plateforme] || {}).court || p.plateforme)} · ` : ''}${ouvert ? `sur ${echapper(ouvert)}` : 'sur son tableau'} · là depuis ${duree(maintenant - (enDate(p.debut) || new Date()).getTime())}</span></button>`;
    }).join('')}${tm.tournent ? `<span class="tb-present" role="status"><i style="background:var(--case-cours)"></i>Exécution en cours<span>${equipe && execEnCours
      ? `${echapper((OUTILS_PARCOURS[execEnCours.outil] || {}).court || execEnCours.outil)}${execEnCours.plateforme ? ` · ${echapper(execEnCours.plateforme)}` : ''}${execEnCours.branche ? ` · ${echapper(execEnCours.branche)}` : ''}${execEnCours.commit ? `@${echapper(execEnCours.commit.slice(0, 8))}` : ''} · ${execEnCours.faits || 0}/${execEnCours.total || 0} rendus · ${echapper(depuis(execEnCours.debut))}`
      : `${pluriel(tm.tournent, 'test', 'tests')} en cours`}</span></span>` : ''}</div>`;

    const pcHumain = th ? Math.round((th.faits / (th.attendus || 1)) * 100) : 0;
    const pcMachine = Math.round((tm.compte.ok / (tm.total || 1)) * 100);
    const combien = `${th ? pluriel(th.total, 'vérification', 'vérifications') : ''}${th && tm.total ? ' et ' : ''}${tm.total ? pluriel(tm.total, 'test par robot', 'tests par robot') : ''}`;

    const controles = `<div class="tb-controles">
      <div class="rang">
        <div class="segments" role="group" aria-label="Voie">
          <button type="button" data-voie="humains" aria-pressed="${etat.voie !== 'machine'}">Testeurs humains</button>
          <button type="button" data-voie="machine" aria-pressed="${etat.voie === 'machine'}">Tests par robot</button>
        </div>
        ${etat.voie !== 'machine' && camps.length > 1 ? `<select class="select" id="tb-campagne" style="width:auto" aria-label="Campagne">${camps.map((c) => `<option value="${echapper(c.id)}"${campagne && c.id === campagne.id ? ' selected' : ''}>${echapper(c.titre || 'Campagne')} · ${echapper((STATUTS_CAMPAGNE[c.statut] || {}).libelle || '')}</option>`).join('')}</select>` : ''}
      </div>
    </div>`;

    sortie.innerHTML = `<div class="tb${etat.voie === 'machine' ? ' tb--machine' : ''}">
      <div class="tb-tete tb-resume">
        <div class="tb-resume-tete">
          <div><p class="surtitre">Où en sont les tests${projetChoisi() ? '' : ` · ${echapper(nom)}`}</p><h2 class="tb-titre">Avancement</h2></div>
        </div>
        ${ligneResume('Testeurs humains', metaHumain, th, pcHumain, aideHumain)}
        ${ligneResume('Tests par robot', metaMachine, tm, pcMachine, aideMachine)}
        ${direct}
        <button type="button" class="tb-deplier" data-deplier aria-expanded="${etat.deplie}">${icone('chevron')} ${etat.deplie ? 'Replier le tableau' : `Déployer le tableau${combien ? ` · ${combien}` : ''}`}</button>
      </div>
      ${etat.deplie ? `${controles}${etat.voie === 'machine' ? voieMachine(d, pid, tm, execs) : voieHumains(d, pid, campagne, th, passages, nommer, maintenant, presents)}` : ''}
    </div>`;
    dernier = { d, pid, campagne, tm, th };
    animerBarres(pid);

    const selC = sortie.querySelector('#tb-campagne');
    if (selC) selC.addEventListener('change', (e) => { etat.campagne = e.target.value; memoire.campagne = etat.campagne; rendre(true); });
  };

  /* ------------------------------------------------------------------------
     Les tests humains
     ------------------------------------------------------------------------ */
  const voieHumains = (d, pid, campagne, thToutes, passages, nommer, maintenant, presents) => {
    /* Avec un plan : ses sections, une case par scénario fait par un humain.
       Une case s'anime quand un testeur est sur un scénario qu'elle reprend. */
    if (thToutes && thToutes.plan) {
      const ouverts = new Set(presents.map((p) => scenarioOuvert(p.scenario)).filter(Boolean));
      const vivants = new Set(thToutes.familles.flatMap((f) => f.cases)
        .filter((c) => (c.sources || [c.ref]).some((r) => ouverts.has(r))).map((c) => c.cle || c.ref));
      return `${campagne ? '' : `<p class="aide">Aucune campagne pour ce projet : les cases s'allumeront avec les résultats des testeurs.${equipe ? ' Créez-la dans la section Campagnes ci-dessous.' : ''}</p>`}
      ${planHtml(thToutes, vivants, 'humains')}
      ${equipe && campagne ? personnesHtml(d, pid, campagne, passages, nommer, maintenant) : ''}`;
    }
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
    const surPlan = campagneSurPlan(campagne);
    if (!uids.length) return `<p class="tb-section-titre">Les testeurs</p><p class="aide">Aucun testeur dans cette campagne. Ajoutez-en depuis la campagne, puis répartissez.</p>`;
    return `<p class="tb-section-titre">Les testeurs</p>
    <div class="tb-gens">${uids.map((uid) => {
      const p = d.presences.find((x) => x.id === uid);
      const sessions = (magasin.lire(K.sessions(uid)) || []).filter((s) => !s.campagne || s.campagne === campagne.id);
      const total = sessions.reduce((n, s) => n + Math.max(0, (enDate(s.vu) || 0) - (enDate(s.debut) || 0)), 0);
      /* Sur le plan : ses clés, et ses passages sur ces clés seulement. */
      const sesCles = surPlan ? new Set(clesDuTesteur(campagne, uid)) : null;
      const miens = surPlan ? sesCles.size : clesDe(campagne.affectation, uid).length;
      const siens = passages.filter((x) => x.testeur === uid && (!sesCles || sesCles.has(clePassage(x.scenario, x.plateforme))));
      const enKo = (x) => resultatCourt(x.resultat) === 'ko';
      const faits = siens.filter((x) => !(enKo(x) && x.aRevoir)).length;
      const ko = siens.filter((x) => enKo(x) && !x.aRevoir).length;
      const la = estLa(p, maintenant);
      const vu = p && enDate(p.vu);
      return `<button type="button" class="tb-personne" data-personne="${echapper(uid)}">
        <div class="tb-personne-tete"><b>${echapper(nommer(uid).nom)}</b>
          <span class="tb-etat${la ? ' tb-etat--la' : ''}">${la ? `en ligne${p.scenario ? ` · ${echapper(p.scenario)}` : ''}` : (vu ? `vu ${echapper(depuis(vu))}` : 'jamais venu')}</span></div>
        <div class="tb-mini"><i style="flex-basis:${miens ? ((faits / miens) * 100).toFixed(1) : 0}%;background:var(--case-ok)"></i></div>
        <div class="tb-chiffres"><span><b>${faits}</b>/${miens} faits</span>${ko ? `<span><b>${ko}</b> en échec</span>` : ''}${sessions.length ? `<span><b>${duree(total)}</b> en ${pluriel(sessions.length, 'session', 'sessions')}</span>` : ''}</div>
      </button>`;
    }).join('')}</div>`;
  };

  /* ------------------------------------------------------------------------
     Les tests automatisés
     ------------------------------------------------------------------------ */
  const voieMachine = (d, pid, t, execs) => {
    const vivants = new Set(t.familles.flatMap((f) => f.cases).filter((c) => c.etat === 'tourne').map((c) => c.cle || c.ref));
    if (t.plan) return `${planHtml(t, vivants, 'machine')}${equipe ? robotsHtml(pid, execs) : ''}`;
    return `${t.total ? famillesHtml(t, { mode: 'machine', vivants }) : vide({ icone: 'code', titre: 'Aucun test par robot', texte: equipe ? 'Déclarez vos parcours dans l\'onglet Tests par robot, ci-dessous, puis branchez un robot : chaque résultat s\'allumera ici en direct.' : 'Les tests automatisés apparaîtront ici.', compact: true })}
    ${equipe ? robotsHtml(pid, execs) : ''}`;
  };

  /* Les cartes du plan : ses sections, groupe par groupe, dans l'ordre de
     « Ce qui va être testé » ; puis ce qui reste hors plan (et, chez les
     robots, les règles). Le même dessin pour les deux onglets : seuls les
     mots et le point de couleur changent. */
  const MOTS_PLAN = {
    machine: {
      autres: 'Autres tests par robot', qui: 'pour les robots', seul: 'humain',
      hors: 'Tests robot rattachés à aucun scénario du plan. Leurs résultats restent ici, sans compter dans l\'avancement.',
    },
    humains: {
      autres: 'Autres résultats des testeurs', qui: 'pour les humains', seul: 'robot',
      hors: 'Scénarios testés par des humains que ne reprend aucun scénario du plan. Leurs résultats restent ici, sans compter dans l\'avancement.',
    },
  };
  const planHtml = (t, vivants, voie) => {
    const mots = MOTS_PLAN[voie];
    const mode = voie === 'machine' ? 'machine' : (equipe ? 'equipe' : 'client');
    const plat = etat.plateforme ? ` sur ${libellePlateforme(etat.plateforme)}` : '';
    const groupes = [...GROUPES_PLAN, { cle: 'autres', libelle: mots.autres }];
    const blocs = groupes.map((g) => {
      const familles = t.familles.filter((f) => (g.cle === 'autres' ? !f.section : f.section && f.groupe === g.cle))
        .map((f) => (f.section && !f.cases.length ? { ...f, note: `Aucun scénario ${mots.qui}${plat} dans cette section.` }
          : f.horsPlan ? { ...f, note: mots.hors } : f));
      if (!familles.length) return '';
      return `<div class="tb-groupe" data-groupe="${echapper(g.cle)}"><p class="tb-section-titre">${echapper(g.libelle)}</p>${famillesHtml({ ...t, familles }, { mode, vivants })}</div>`;
    }).join('');
    /* Les sections hors des quatre groupes connus (un plan plus récent que
       ce code) ne disparaissent pas : elles ferment la liste du plan. */
    const connus = new Set(GROUPES_PLAN.map((g) => g.cle));
    const egarees = t.familles.filter((f) => f.section && !connus.has(f.groupe));
    const point = (q) => `<span class="plan-qui-${QUI_PLAN[q].ton}"><i aria-hidden="true"></i><b>${t.qui[q]}</b> ${echapper(QUI_PLAN[q].court)}</span>`;
    const legende = `<p class="plan-qui tb-qui">${point('les-deux')}${point(voie === 'machine' ? 'robot' : 'humain')}<span class="tb-qui-aide">Le point dans le coin d'une case dit qui fait le scénario. Un scénario fait par un ${mots.seul} seul n'a pas de case ici.</span></p>`;
    return `${legende}${blocs}${egarees.length ? `<div class="tb-groupe"><p class="tb-section-titre">Autres sections du plan</p>${famillesHtml({ ...t, familles: egarees }, { mode, vivants })}</div>` : ''}`;
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
    /* Un scénario hors plan qui n'est plus dans la campagne : sa case vient
       du tableau du plan. */
    const c = t.familles.flatMap((f) => f.cases).find((x) => x.ref === ref)
      || (dernier.th && dernier.th.plan ? dernier.th.familles.flatMap((f) => f.cases).find((x) => x.horsPlan && x.ref === ref) : null);
    if (!c) return;
    /* L'énoncé, mot pour mot : ce que le testeur a lu. */
    const sc = d.scenarios.find((x) => x.ref === ref && projetDe(x) === pid) || {};
    const nommer = nommeur(d, { equipe, pid });
    const affectes = Object.keys(campagne.affectation || {}).filter((uid) => clesDe(campagne.affectation, uid).includes(ref));
    const uids = Array.from(new Set([...affectes, ...c.passages.map((p) => p.testeur)]));
    const presents = equipe ? (magasin.lire(K.presences) || []).filter((p) => estLa(p) && p.scenario === ref && p.campagne === campagne.id).map((p) => p.id) : [];
    const e = ETATS_CASE[c.etat] || {};

    const m = modale({
      titre: c.titre, scenario: true,
      sousTitre: `${c.ref} · ${(BLOCS_SCENARIO[c.bloc] || {}).libelle || ''}${c.niveau ? ` · ${(NIVEAUX_SCENARIO[c.niveau] || {}).libelle || c.niveau}` : ''}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}.</strong> ${echapper(pourquoi(c))}</p>
        ${c.revoir ? '<section class="fs-bloc fs-bloc--alerte"><p class="fs-bloc-sur">À rejouer</p><p>Une correction attend d\'être rejouée par le testeur qui avait trouvé le défaut.</p></section>' : ''}
        ${sc.options ? `<section class="fs-bloc"><p class="fs-bloc-sur">Ce qu'il faut poser</p><p>${gras(sc.options)}</p></section>` : ''}
        ${sc.attendu ? `<section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${gras(sc.attendu)}</p></section>` : ''}
        <div class="fs-bloc"><p class="fs-bloc-sur">Les passages</p>
          <div class="tb-sessions">${uids.length ? uids.map((uid) => {
            const p = c.passages.find((x) => x.testeur === uid);
            const qui = nommer(uid);
            const appareil = p && ((p.contexte || {}).appareil || (p.contexte || {}).plateforme);
            const ici = presents.includes(uid);
            return `<div class="tb-passage">
              <div><p><strong>${echapper(qui.nom)}</strong>${p && p.plateforme ? ` · ${echapper((PLATEFORMES_TEST[p.plateforme] || {}).libelle || p.plateforme)}` : ''}${appareil ? ` · ${echapper(appareil)}` : ''}${ici ? ' · <span class="tb-bleu">l\'a ouvert en ce moment</span>' : ''}</p>
                ${p ? `<p class="aide">${p.le ? echapper(dateHeure(p.le)) : ''}${p.commentaire ? ` · ${echapper(p.commentaire)}` : ''}${p.aRevoir ? ' · corrigé, à rejouer' : ''}</p>` : ''}</div>
              <div class="rang">${p ? pastilleResultat(p.resultat) : '<span class="etiquette">attendu</span>'}${((p && p.preuves) || []).map((ch, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(ch)}">${icone('image')} Preuve ${i + 1}</button>`).join('')}</div>
            </div>`;
          }).join('') : '<p class="aide">Personne n\'a reçu ce scénario.</p>'}</div>
        </div>
        ${c.anomalies.length ? `<div class="fs-bloc"><p class="fs-bloc-sur">Anomalies</p><div class="tb-sessions">${c.anomalies.map((a) => `<div class="tb-passage">
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

  /* Une case humaine du plan : le scénario, et tout ce que les testeurs en
     ont rendu, d'où que ça vienne (scénario repris, ou le scénario du plan
     lui-même). */
  const ouvrirCaseHumainePlan = (cle) => {
    const { d, pid, campagne, th } = dernier || {};
    const c = th && th.plan ? th.familles.flatMap((f) => f.cases).find((x) => x.cle === cle) : null;
    if (!c) return;
    const sc = c.scenario;
    const section = (sectionsDuPlan(pid).find((s) => s.id === c.section) || {});
    const e = ETATS_CASE[c.etat] || {};
    const qui = QUI_PLAN[sc.qui] || {};
    const texte = (t) => echapper(String(t || '').trim()).replace(/\n/g, '<br>');
    const nommer = nommeur(d, { equipe, pid });
    const titres = new Map(d.scenarios.filter((s) => projetDe(s) === pid).map((s) => [s.ref, s.titre || '']));
    const refs = (sc.refs || []).filter(Boolean);
    const presents = equipe && campagne ? (magasin.lire(K.presences) || []).filter((p) => estLa(p) && p.campagne === campagne.id && c.sources.includes(scenarioOuvert(p.scenario))) : [];
    const quand = (p) => enDate(p.maj) || enDate(p.le) || enDate(p.cree);
    const passages = c.passages.slice().sort((a, b) => (quand(b) || 0) - (quand(a) || 0));
    /* Sur le plan : qui l'a reçu, sur quelle plateforme, et n'a encore rien
       rendu. L'équipe seule : le client lit des résultats, pas un planning. */
    const attendusSans = equipe && c.surPlan ? Object.keys(campagne.affectation || {}).flatMap((uid) => {
      const a = affectationPlan(campagne, uid);
      return (a ? a.cles : []).filter((k) => typeof k === 'string' && k.startsWith(`${sc.id}__`) && (!etat.plateforme || k === clePassage(sc.id, etat.plateforme)))
        .map((k) => ({ uid, plateforme: k.slice(sc.id.length + 2) }))
        .filter((x) => !c.passages.some((p) => p.testeur === x.uid && p.plateforme === x.plateforme));
    }) : [];
    const plateformeDe = (p) => (p ? libellePlateforme(p) : 'Sans plateforme');
    const m = modale({
      titre: sc.titre || sc.id, scenario: true,
      sousTitre: `${sc.id}${section.titre ? ` · ${section.titre}` : ''}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}${etat.plateforme ? ` sur ${echapper(libellePlateforme(etat.plateforme))}` : ''}.</strong> ${echapper(pourquoiHumainPlan(c, etat.plateforme))}</p>
        <p class="tb-plan-qui"><span class="plan-qui-puce plan-qui-${echapper(qui.ton || 'vert')}"><i aria-hidden="true"></i>${echapper(qui.libelle || '')}</span><span>${echapper((sc.plateformes || []).map(libellePlateforme).join(', ') || '–')}</span></p>
        ${refs.length && !c.surPlan ? `<p class="aide tb-plan-refs">Reprend les résultats de ${refs.map((r) => `<span class="ref"${titres.get(r) ? ` data-astuce="${echapper(titres.get(r))}"` : ''}>${echapper(r)}</span>`).join(', ')}.</p>` : ''}
        ${c.revoir ? '<section class="fs-bloc fs-bloc--alerte"><p class="fs-bloc-sur">À rejouer</p><p>Une correction attend d\'être rejouée par le testeur qui avait trouvé le défaut.</p></section>' : ''}
        ${sc.etapes ? `<section class="fs-bloc"><p class="fs-bloc-sur">Les étapes</p><p>${texte(sc.etapes)}</p></section>` : ''}
        ${sc.attendu ? `<section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${texte(sc.attendu)}</p></section>` : ''}
        ${c.passages.length && c.parPlateforme.length ? `<div class="fs-bloc"><p class="fs-bloc-sur">Par plateforme</p><div class="tb-sessions">${c.parPlateforme.map((p) => `<div class="tb-passage">
          <div><p><strong>${echapper(plateformeDe(p.plateforme))}</strong></p><p class="aide">${p.origines.length ? `D'après ${listeRefs(p.origines.map((o) => o.cle))}` : 'Pas encore testé par un humain sur cette plateforme.'}</p></div>
          <div class="rang">${etatCaseHtml(p.etat)}</div>
        </div>`).join('')}</div></div>` : ''}
        <div class="fs-bloc"><p class="fs-bloc-sur">Les résultats des testeurs</p>
          ${passages.length ? `<div class="tb-sessions">${passages.map((p) => {
    const appareil = (p.contexte || {}).appareil || (p.contexte || {}).plateforme;
    const ici = presents.some((x) => x.id === p.testeur);
    return `<div class="tb-passage">
            <div><p><strong>${echapper(nommer(p.testeur).nom)}</strong>${p.plateforme ? ` · ${echapper(libellePlateforme(p.plateforme))}` : ''}${appareil ? ` · ${echapper(appareil)}` : ''}${ici ? ' · <span class="tb-bleu">l\'a ouvert en ce moment</span>' : ''}</p>
              <p class="aide">${[quand(p) ? echapper(dateHeure(quand(p))) : '', p.commentaire ? echapper(p.commentaire) : '', p.aRevoir ? 'corrigé, à rejouer' : '', p.herite ? `Hérité de <span class="ref">${echapper(p.origine)}</span>, campagne d'avant le plan` : ''].filter(Boolean).join(' · ')}</p></div>
            <div class="rang">${pastilleResultat(p.resultat)}${(p.preuves || []).map((ch, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(ch)}">${icone('image')} Preuve ${i + 1}</button>`).join('')}</div>
          </div>`;
  }).join('')}</div>` : `<p>Pas encore testé par un humain${etat.plateforme ? ` sur ${echapper(libellePlateforme(etat.plateforme))}` : ''}.</p>`}
          ${attendusSans.length ? `<div class="tb-sessions">${attendusSans.map((x) => `<div class="tb-passage">
            <div><p><strong>${echapper(nommer(x.uid).nom)}</strong> · ${echapper(libellePlateforme(x.plateforme))}</p></div>
            <div class="rang"><span class="etiquette">attendu</span></div>
          </div>`).join('')}</div>` : ''}
        </div>
        ${c.anomalies.length ? `<div class="fs-bloc"><p class="fs-bloc-sur">Anomalies</p><div class="tb-sessions">${c.anomalies.map((a) => `<div class="tb-passage">
          <p>${echapper(a.titre || 'Anomalie')}${a.scenario && a.scenario !== sc.id ? ` · <span class="ref">${echapper(a.scenario)}</span>` : ''}${Number(a.retours) ? ' · <span class="tb-rouge">revenue</span>' : ''}</p>
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
      titre: x.titre || x.ref, scenario: true,
      sousTitre: `${x.ref} · ${regle ? 'Règle métier' : `${(OUTILS_PARCOURS[x.outil] || {}).libelle || x.outil || ''}${(x.plateformes || []).length ? ` · ${(x.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', ')}` : ''}`}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}.</strong> ${dateHeure(der.le) ? `Dernier résultat ${echapper(dateHeure(der.le))}${der.duree ? `, en ${echapper(String(der.duree))} s` : ''}.` : 'Jamais exécuté.'}${x.etat === 'instable' ? ' Passé au vert après un nouvel essai : un parcours instable n\'apprend rien, il faut le fiabiliser.' : ''}${c.etat === 'connu' ? ' Il échoue sur un défaut déjà connu de l\'équipe : il passera au vert quand ce défaut sera corrigé.' : ''}</p>
        ${(x.scenarios || []).length ? `<p class="aide">Couvre ${(x.scenarios || []).map((r) => `<span class="ref">${echapper(r)}</span>`).join(', ')}.</p>` : ''}
        ${planDuParcours(pid, ref).length ? `<p class="aide">Vérifie dans le plan ${planDuParcours(pid, ref).map((sc) => `<span class="ref">${echapper(sc.id)}</span> ${echapper(sc.titre || '')}`).join(', ')}.</p>` : ''}
        ${!regle ? `<p class="aide">${x.mutation ? 'Contre-épreuve faite : on a cassé l\'app exprès, ce robot l\'a vu.' : 'Contre-épreuve à faire : on n\'a pas encore vérifié que ce robot repère une vraie panne.'}</p>` : ''}
        ${detail ? `<div class="fs-bloc"><p class="fs-bloc-sur">Ce que le robot a fait, et ce qu'il a trouvé</p>
          <p>${detail.message ? echapper(detail.message) : 'Aucun message.'}</p>
          <p class="aide">${detail.essais > 1 ? `${detail.essais} essais · ` : ''}exécution ${echapper(der.execution)}${detail.lien ? ` · <a href="${echapper(detail.lien)}" target="_blank" rel="noopener">voir le rapport</a>` : ''}</p></div>` : ''}
        ${regle ? '' : problemesCaseHtml(problemesDesCases(pid, planDuParcours(pid, ref).map((sc) => sc.id)))}`,
      pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>${equipe && !regle ? '<button class="btn btn-principal" type="button" data-modifier>Modifier</button>' : ''}`,
    });
    sur(m.el, 'click', '[data-modifier]', async () => { m.fermer(); await editer('parcours', env, { pid, fiche: x }); });
    brancherProblemes(m, pid);
  };

  /* Les problèmes relevés par les tests automatiques sur ces scénarios du
     plan : la case dit ce qu'on a trouvé, et mène à la fiche du problème. */
  const problemesDesCases = (pid, ids) => ((dernier && dernier.d && dernier.d.anomalies) || [])
    .filter((a) => projetDe(a) === pid && a.origine === 'robot' && (a.scenarios || []).some((x) => ids.includes(x)));
  const problemesCaseHtml = (liste) => (liste.length ? `<div class="fs-bloc"><p class="fs-bloc-sur">${liste.length > 1 ? 'Problèmes relevés' : 'Problème relevé'}</p><div class="tb-sessions">${liste.map((a) => `<div class="tb-passage">
          <div><p><strong>${echapper(a.titre || 'Problème')}</strong></p><p class="aide">${echapper(explicationStatut(a))}</p></div>
          <div class="rang">${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${ouvrirProbleme ? `<button class="btn btn-doux btn-petit" type="button" data-ouvrir-probleme="${echapper(a.id)}">Voir</button>` : ''}</div>
        </div>`).join('')}</div></div>` : '');
  const brancherProblemes = (m, pid) => sur(m.el, 'click', '[data-ouvrir-probleme]', (el) => { m.fermer(); if (ouvrirProbleme) ouvrirProbleme(el.dataset.ouvrirProbleme, pid); });

  /* Les scénarios du plan (faits par un robot) auxquels un test est rattaché. */
  const planDuParcours = (pid, ref) => sectionsDuPlan(pid)
    .flatMap((s) => ['fonctionnel', 'technique', 'ux', 'securite'].flatMap((a) => (s.aspects || {})[a] || []))
    .filter((sc) => sc && ['robot', 'les-deux'].includes(sc.qui) && (sc.parcours || []).includes(ref));

  /* Une case du plan : la fiche du test s'il n'y en a qu'un, sinon celle
     du scénario, avec ses tests et leur résultat. */
  const ouvrirCasePlan = async (cle) => {
    const { pid, tm } = dernier || {};
    const c = tm && tm.plan ? tm.familles.flatMap((f) => f.cases).find((x) => x.cle === cle) : null;
    if (!c) return;
    if (c.rattaches.length === 1) { await ouvrirCaseMachine(c.rattaches[0].ref); return; }
    const sc = c.scenario;
    const section = (sectionsDuPlan(pid).find((s) => s.id === c.section) || {});
    const e = ETATS_CASE[c.etat] || {};
    const qui = QUI_PLAN[sc.qui] || {};
    const texte = (t) => echapper(String(t || '').trim()).replace(/\n/g, '<br>');
    const m = modale({
      titre: sc.titre || sc.id, scenario: true,
      sousTitre: `${sc.id}${section.titre ? ` · ${section.titre}` : ''}`,
      corps: `
        <p class="tb-pourquoi"><strong>${echapper(e.libelle || c.etat)}${etat.plateforme ? ` sur ${echapper(libellePlateforme(etat.plateforme))}` : ''}.</strong> ${echapper(pourquoiPlan(c, etat.plateforme))}</p>
        <p class="tb-plan-qui"><span class="plan-qui-puce plan-qui-${echapper(qui.ton || 'bleu')}"><i aria-hidden="true"></i>${echapper(qui.libelle || '')}</span><span>${echapper((sc.plateformes || []).map(libellePlateforme).join(', ') || '–')}</span></p>
        ${sc.etapes ? `<section class="fs-bloc"><p class="fs-bloc-sur">Les étapes</p><p>${texte(sc.etapes)}</p></section>` : ''}
        ${sc.attendu ? `<section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${texte(sc.attendu)}</p></section>` : ''}
        ${c.rattaches.length && c.parPlateforme.length ? `<div class="fs-bloc"><p class="fs-bloc-sur">Par plateforme</p><div class="tb-sessions">${c.parPlateforme.map((p) => `<div class="tb-passage">
          <div><p><strong>${echapper(libellePlateforme(p.plateforme))}</strong></p><p class="aide">${p.parcours.length ? listeRefs(p.parcours) : 'Pas encore de test robot sur cette plateforme.'}</p></div>
          <div class="rang">${etatCaseHtml(p.etat)}</div>
        </div>`).join('')}</div></div>` : ''}
        <div class="fs-bloc"><p class="fs-bloc-sur">Les tests robot</p>
          ${c.rattaches.length ? `<div class="tb-sessions">${c.rattaches.map((x) => {
    const der = x.dernier || {};
    return `<div class="tb-passage">
            <div><p><strong>${echapper(x.ref)}</strong>${x.titre ? ` · ${echapper(x.titre)}` : ''}</p>
              <p class="aide">${echapper([(OUTILS_PARCOURS[x.outil] || {}).libelle || x.outil || '', (x.plateformes || []).map(libellePlateforme).join(', '), dateHeure(der.le) ? `dernier résultat ${dateHeure(der.le)}` : 'jamais exécuté'].filter(Boolean).join(' · '))}</p></div>
            <div class="rang">${etatCaseHtml(verdictParcours(x))}<button class="btn btn-doux btn-petit" type="button" data-ouvrir-parcours="${echapper(x.ref)}">Voir</button></div>
          </div>`;
  }).join('')}</div>` : '<p>Pas encore de test robot écrit.</p>'}
          ${equipe && c.inconnus.length ? `<p class="aide">Introuvable${c.inconnus.length > 1 ? 's' : ''} parmi les tests robot actifs du projet : ${listeRefs(c.inconnus)}.</p>` : ''}
        </div>
        ${problemesCaseHtml(problemesDesCases(pid, [sc.id]))}`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    });
    sur(m.el, 'click', '[data-ouvrir-parcours]', async (el) => { m.fermer(); await ouvrirCaseMachine(el.dataset.ouvrirParcours); });
    brancherProblemes(m, pid);
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
    if (el.dataset.case) {
      if (etat.voie !== 'machine') {
        if (el.dataset.case.startsWith('plan:')) ouvrirCaseHumainePlan(el.dataset.case);
        else ouvrirCaseHumaine(el.dataset.case);
      }
      else if (el.dataset.case.startsWith('plan:')) await ouvrirCasePlan(el.dataset.case);
      else await ouvrirCaseMachine(el.dataset.case);
      return;
    }
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
    lot.sur(c, surChangement);
  });
  /* Tout est là quand plus aucune clé de la section, y compris celles
     découvertes en route, n'attend sa première valeur. */
  const clesAttendues = () => { ecouter(); suivreTout(donnees()); return cles(); };
  /* Premier dessin quand tout est là (le squelette de la page reste
     jusque-là), les suivants regroupés : la section se peint une fois, pas
     une fois par clé qui arrive. */
  const planifier = magasin.dessinateur(() => rendre(false), 40, clesAttendues);
  const surChangement = () => { ecouter(); planifier(); };
  ecouter();
  const horloge = equipe ? setInterval(() => rendre(), 15000) : null;
  planifier();

  /* Ouvre la case d'un scénario du plan (depuis la fiche d'un problème, ou
     « ?case= » dans l'adresse) : le tableau se déplie sur la voie des
     robots, ou sur celle des humains si le scénario n'a pas de case robot.
     Rend faux tant que le tableau n'est pas dessiné ou que la case manque. */
  const ouvrirCase = (id) => {
    const cle = `plan:${id}`;
    const trouve = (t) => Boolean(t && t.plan && t.familles.some((f) => f.cases.some((c) => c.cle === cle)));
    if (!dernier) return false;
    for (const voie of ['machine', 'humains']) {
      etat.voie = voie; memoire.voie = voie; etat.deplie = true;
      rendre(true);
      if (!dernier) return false;
      if (trouve(voie === 'machine' ? dernier.tm : dernier.th)) {
        boite.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (voie === 'machine') ouvrirCasePlan(cle); else ouvrirCaseHumainePlan(cle);
        return true;
      }
    }
    return false;
  };

  return {
    ouvrirCase,
    /* La page Tests a changé de projet : on redessine tout de suite. */
    rafraichir: () => rendre(true),
    /* Pour la page qui nous accueille : son premier dessin attend nos clés. */
    cles: clesAttendues,
    fin: () => { planifier.arreter(); gestes(); lot.fin(); if (horloge) clearInterval(horloge); },
  };
};

