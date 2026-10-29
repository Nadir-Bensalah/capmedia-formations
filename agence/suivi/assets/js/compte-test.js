/* ==========================================================================
   CAPMEDIA TEST · « Mon compte de test »

   Le testeur agit sur SON compte ForgeMe de test, le même sur son
   téléphone et sur le web : par défaut celui de son adresse de connexion
   (Gmail, Hotmail ou autre), sinon l'adresse que l'équipe a notée dans sa
   place (campagnes/{c}/acces/{uid}.compteTest). Il change l'accès (essai,
   abonné, lecture seule), remplit le compte, le remplit à fond, le remet
   à zéro. Tout passe par le serveur
   (hubCompteTest), qui vérifie qui il est et n'écrit que dans le projet de
   test. Ce module ne détient aucun secret.

   Les scénarios qui en ont besoin montrent le bon bouton à côté : la
   détection lit le titre, les étapes et l'attendu (REGLES_GESTES). Quand
   elle se trompe, la table GESTES_PAR_SCENARIO (ici) ou le champ
   « gestesCompte » de la campagne ({ <id ou réf du scénario>: [gestes] },
   une liste vide pour n'en montrer aucun) a le dernier mot.
   ========================================================================== */

import { auth, echapper, surEmulateur, FONCTIONS_EMULATEUR } from './noyau.js';
import { toast, confirmer } from './ui.js';

const PROJET = (window.AZ_SUIVI && window.AZ_SUIVI.firebase && window.AZ_SUIVI.firebase.projectId) || 'capmedia-1f90d';
const URL_COMPTE = surEmulateur
  ? `${FONCTIONS_EMULATEUR}/${PROJET}/europe-west1/hubCompteTest`
  : `https://europe-west1-${PROJET}.cloudfunctions.net/hubCompteTest`;

/* La phrase que le serveur exige pour vider un compte : envoyée seulement
   après la confirmation du testeur. */
const CONFIRMATION_ZERO = 'REMETTRE A ZERO';

export const GESTES_COMPTE = {
  essai: { libelle: 'Essai 14 jours', invite: 'Passez en essai de 14 jours pour ce test', fait: 'Votre compte est en essai pour 14 jours.' },
  abonne: { libelle: 'Abonné', invite: 'Passez abonné pour ce test', fait: 'Votre compte est abonné.' },
  lecture_seule: { libelle: 'Lecture seule', invite: 'Passez en lecture seule pour ce test', fait: 'Votre compte est en lecture seule.' },
  remplir: { libelle: 'Remplir mon compte', invite: 'Remplissez votre compte pour ce test', fait: 'Votre compte est rempli.' },
  'remplir-fond': { libelle: 'Remplir à fond', invite: 'Remplissez à fond votre compte pour ce test', fait: 'Votre compte est rempli à fond.' },
  zero: { libelle: 'Remettre à zéro', invite: 'Remettez votre compte à zéro pour ce test', fait: 'Votre compte est remis à zéro.' },
};
/* L'accès lu par l'application, en mots, et le bouton qui y correspond. */
const ACCES_LIBELLES = { essai: 'Essai', actif: 'Abonné', grace: 'Abonné (paiement en attente)', lecture_seule: 'Lecture seule' };
const GESTE_DE_L_ACCES = (a) => (!a ? '' : a.etat === 'essai' ? 'essai' : a.etat === 'lecture_seule' ? 'lecture_seule' : 'abonne');
const GESTES_ACCES = ['essai', 'abonne', 'lecture_seule'];

/* La table éditable : un scénario (son identifiant du plan ou sa référence)
   vers ses gestes, quand la détection ne suffit pas. Exemple :
   'paiements-f-003': ['lecture_seule'] (un achat part d'un compte sans accès). */
export const GESTES_PAR_SCENARIO = {};

/* La détection, dans l'ordre : un geste d'abonnement au plus, un geste de
   contenu au plus. */
export const REGLES_GESTES = [
  { geste: 'lecture_seule', sorte: 'plan', motif: /souscri|s['’]abonner|paywall|[ée]cran des offres|achat int[ée]gr[ée]|passer (en|à) (premium|ultra)|lecture seule|fin de l['’]essai|essai (termin|expir|fini)/i },
  { geste: 'lecture_seule', sorte: 'plan', motif: /non[ -]abonn|sans abonnement|(plan|compte|offre|version) gratuit|limites? du (plan )?gratuit/i },
  { geste: 'essai', sorte: 'plan', motif: /\bessai\b|p[ée]riode d['’]essai|\btrial\b/i },
  { geste: 'abonne', sorte: 'plan', motif: /\bultra\b|\bpremium\b|\babonn[ée]e?s?\b|plan payant/i },
  { geste: 'remplir-fond', sorte: 'contenu', motif: /1[\s .,]?500\b|compte (très |bien |fortement )?charg[ée]|gros volume|beaucoup de (tâches|données)|rapidit[ée]|performances?/i },
  { geste: 'zero', sorte: 'contenu', motif: /compte (neuf|vierge|vide)|nouvel utilisateur|premier lancement|premi[èe]re ouverture|remis(e)? à zéro/i },
  { geste: 'remplir', sorte: 'contenu', motif: /compte (rempli|garni)|avec des données|données existantes/i },
];

/** Les gestes qu'un scénario demande, détectés ou imposés par la table. */
export const besoinsDuScenario = (s, campagne = {}) => {
  if (!s) return [];
  const imposes = { ...GESTES_PAR_SCENARIO, ...((campagne && campagne.gestesCompte) || {}) };
  for (const cle of [s.id, s.ref]) {
    if (cle && Array.isArray(imposes[cle])) return imposes[cle].filter((g) => GESTES_COMPTE[g]);
  }
  const t = [s.titre, s.etapes || s.options, s.attendu, s.prerequis].filter(Boolean).join('\n');
  const pris = new Set();
  const gestes = [];
  for (const r of REGLES_GESTES) {
    if (pris.has(r.sorte) || !r.motif.test(t)) continue;
    pris.add(r.sorte); gestes.push(r.geste);
  }
  return gestes;
};

/* L'appel : le jeton de la personne, le serveur décide. */
const appeler = async (campagne, geste, extra = {}) => {
  const u = auth.currentUser;
  if (!u) throw new Error('Votre session est fermée. Reconnectez-vous.');
  const jeton = await u.getIdToken();
  let r;
  try {
    r = await fetch(URL_COMPTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ projet: campagne.projet, campagne: campagne.id, geste, ...extra }),
    });
  } catch (e) { throw new Error('Le serveur est injoignable. Réessayez dans un instant.'); }
  const brut = await r.text();
  if (!r.ok) throw new Error(brut || 'Le geste n\'a pas abouti. Réessayez.');
  try { return JSON.parse(brut); } catch (e) { return {}; }
};

/* L'état du compte, par campagne, le temps de la page. */
const etats = new Map();
const cleDe = (c) => `${c.projet}/${c.id}`;
export const etatCompte = (c) => etats.get(cleDe(c)) || null;

export const lireEtatCompte = async (campagne) => {
  try {
    const r = await appeler(campagne, 'etat');
    etats.set(cleDe(campagne), { acces: r.acces, plan: r.plan, taches: r.taches, compte: r.compte });
  } catch (e) {
    etats.set(cleDe(campagne), { erreur: e.message || 'Illisible pour l\'instant.' });
  }
  return etats.get(cleDe(campagne));
};

/**
 * Un geste, confirmé quand il efface. Rend la réponse du serveur, ou null
 * si le testeur a renoncé.
 */
export const executerGeste = async (campagne, geste) => {
  const g = GESTES_COMPTE[geste];
  if (!g) return null;
  const extra = {};
  if (geste === 'zero') {
    const oui = await confirmer({
      titre: 'Remettre votre compte à zéro ?',
      texte: 'Tout le contenu de votre compte de test sera effacé : tâches, rituels, objectifs, journal, dates, idées, voyages, notes, courses, données suivies. Le compte reste, avec son nom, en lecture seule comme un compte neuf. Sur le téléphone, déconnectez-vous puis reconnectez-vous pour repartir comme un nouvel utilisateur.',
      ok: 'Remettre à zéro', danger: true,
    });
    if (!oui) return null;
    extra.confirmation = CONFIRMATION_ZERO;
  }
  if (geste === 'remplir-fond') toast('Remplissage en cours : jusqu\'à une minute.', 'info');
  const r = await appeler(campagne, geste, extra);
  const avant = etatCompte(campagne) || {};
  etats.set(cleDe(campagne), { acces: r.acces || avant.acces, plan: r.plan, compte: r.compte || avant.compte, taches: typeof r.taches === 'number' ? r.taches : avant.taches });
  if (GESTES_ACCES.includes(geste) && r.applique === false) toast('Demande envoyée : le serveur de test l\'applique dans quelques secondes. L\'application le verra d\'elle-même.', 'info');
  else toast(`${g.fait} L'application et le site le voient tout de suite, sans réinstaller.`);
  return r;
};

/** La boîte « Mon compte de test » de la page L'application. En aperçu de l'équipe, montrée telle
    que le testeur la voit, boutons inactifs : ils agiraient sur le compte de la personne connectée. */
export const boiteCompteHtml = (campagne, email, { apercu = false } = {}) => {
  const e = apercu ? null : etatCompte(campagne);
  const adresse = (e && e.compte) || email || '';
  const a = e && e.acces;
  const fin = a && a.jusquA && a.etat !== 'actif' ? ` jusqu'au ${new Date(a.jusquA).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : '';
  const ligne = apercu ? '<span class="t-3">Aperçu : le testeur voit ici l\'accès et le contenu de son propre compte.</span>'
    : !e ? '<span class="t-3">Lecture du compte…</span>'
    : e.erreur ? `<span class="t-3">${echapper(e.erreur)}</span>`
      : `Accès actuel : <b>${echapper(ACCES_LIBELLES[a && a.etat] || 'Lecture seule')}${echapper(fin)}</b> · ${Number(e.taches || 0).toLocaleString('fr-FR')} tâche${Number(e.taches) > 1 ? 's' : ''}`;
  const actuel = GESTE_DE_L_ACCES(a);
  const bouton = (geste, classe = 'btn-secondaire') => {
    const choisi = GESTES_ACCES.includes(geste) && actuel === geste;
    return `<button class="btn ${choisi ? 'btn-principal' : classe} btn-petit" type="button" data-compte-geste="${geste}"${GESTES_ACCES.includes(geste) ? ` aria-pressed="${choisi}"` : ''}${apercu ? ' disabled' : ''}>${echapper(GESTES_COMPTE[geste].libelle)}</button>`;
  };
  return `<section class="compte-test" data-compte-test>
    <div class="section-tete"><h2>Mon compte de test</h2></div>
    <p class="t-2">${adresse ? `Le compte <b data-compte-email>${echapper(adresse)}</b>, sur votre téléphone comme sur le web.` : 'Le compte de votre adresse de connexion, sur votre téléphone comme sur le web.'} Ces gestes n'agissent que sur lui, dans l'environnement de test : rien de réel.</p>
    <p class="compte-test-etat" data-compte-etat>${ligne}</p>
    <div class="compte-test-rangee">
      <span class="etiquette-champ">Accès</span>
      <div class="rang compte-test-boutons">${bouton('essai')}${bouton('abonne')}${bouton('lecture_seule')}</div>
    </div>
    <div class="compte-test-rangee">
      <span class="etiquette-champ">Contenu</span>
      <div class="rang compte-test-boutons">${bouton('remplir')}${bouton('remplir-fond')}${bouton('zero', 'btn-danger')}</div>
    </div>
    <p class="aide">« Remplir » ajoute des données fictives en français, « Remplir à fond » environ 1 500 tâches pour juger la rapidité. L'application voit chaque changement en quelques secondes, sans réinstaller. Vingt gestes par heure au plus.</p>
  </section>`;
};

/* Les trois accès dans la barre latérale (29/10/2026, demande de Nadir) : toujours à portée, quelle
   que soit la page, l'accès actuel en évidence. Tant que le testeur ne s'en est jamais servi, le
   bloc s'éclaire doucement pour se faire remarquer. En aperçu de l'équipe, les boutons sont
   montrés mais inactifs : ils agiraient sur le compte de la personne connectée. */
const COURTS = { essai: 'Essai', abonne: 'Abonné', lecture_seule: 'Lecture seule' };
const cleRailVu = () => `suivi:rail-compte-vu:${(auth.currentUser && auth.currentUser.uid) || ''}`;
export const marquerRailCompteVu = () => { try { localStorage.setItem(cleRailVu(), '1'); } catch (e) { /* stockage refusé */ } };
const railCompteVu = () => { try { return localStorage.getItem(cleRailVu()) === '1'; } catch (e) { return true; } };

export const railCompteHtml = (campagne, { apercu = false } = {}) => {
  const e = apercu ? null : etatCompte(campagne);
  const a = e && e.acces;
  const actuel = GESTE_DE_L_ACCES(a);
  const fin = a && a.jusquA && a.etat === 'essai' ? ` jusqu'au ${new Date(a.jusquA).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : '';
  const ligne = apercu ? 'Aperçu : chaque testeur change ici l\'accès de son propre compte.'
    : !e ? 'Lecture du compte…'
      : e.erreur ? 'Compte illisible pour l\'instant.'
        : `Accès actuel : ${ACCES_LIBELLES[a && a.etat] || 'Lecture seule'}${fin}`;
  return `<div class="rail-compte${!apercu && !railCompteVu() ? ' rail-compte--neuf' : ''}" data-rail-compte>
    <div class="theme-rail rail-compte-choix" role="group" aria-label="Accès de mon compte de test">${GESTES_ACCES.map((g) => `<button type="button" data-compte-geste="${g}" aria-pressed="${actuel === g}"${apercu ? ' disabled' : ''} title="${echapper(GESTES_COMPTE[g].invite)}">${COURTS[g]}</button>`).join('')}</div>
    <p class="rail-compte-etat">${echapper(ligne)}</p>
  </div>`;
};

/** Les boutons d'un scénario, à placer dans sa feuille. */
export const blocScenarioHtml = (s, campagne) => {
  const besoins = besoinsDuScenario(s, campagne);
  if (!besoins.length) return '';
  return `<section class="fs-bloc fs-bloc--compte" data-compte-scenario>
    <p class="fs-bloc-sur">Avant de commencer</p>
    <div class="rang compte-test-boutons">${besoins.map((g) => `<button class="btn btn-secondaire btn-petit" type="button" data-compte-geste="${g}">${echapper(GESTES_COMPTE[g].invite)}</button>`).join('')}</div>
  </section>`;
};
