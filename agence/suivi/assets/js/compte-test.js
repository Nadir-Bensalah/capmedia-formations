/* ==========================================================================
   CAPMEDIA TEST · « Mon compte de test »

   Le testeur agit sur SON compte ForgeMe de test (celui que l'équipe lui a
   attribué, campagnes/{c}/acces/{uid}.compteTest), le même sur son
   téléphone et sur le web : changer d'abonnement, remplir le compte, le
   remplir à fond, le remettre à zéro. Tout passe par le serveur
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
  gratuit: { libelle: 'Gratuit', invite: 'Repassez en gratuit pour ce test', fait: 'Votre compte est repassé en gratuit.' },
  premium: { libelle: 'Premium', invite: 'Passez en Premium pour ce test', fait: 'Votre compte est en Premium.' },
  ultra: { libelle: 'Ultra', invite: 'Passez en Ultra pour ce test', fait: 'Votre compte est en Ultra.' },
  remplir: { libelle: 'Remplir mon compte', invite: 'Remplissez votre compte pour ce test', fait: 'Votre compte est rempli.' },
  'remplir-fond': { libelle: 'Remplir à fond', invite: 'Remplissez à fond votre compte pour ce test', fait: 'Votre compte est rempli à fond.' },
  zero: { libelle: 'Remettre à zéro', invite: 'Remettez votre compte à zéro pour ce test', fait: 'Votre compte est remis à zéro.' },
};
const PLANS_LIBELLES = { free: 'Gratuit', premium: 'Premium', premium_ultra: 'Ultra' };
const GESTE_DU_PLAN = { free: 'gratuit', premium: 'premium', premium_ultra: 'ultra' };

/* La table éditable : un scénario (son identifiant du plan ou sa référence)
   vers ses gestes, quand la détection ne suffit pas. Exemple :
   'paiements-f-003': ['gratuit'] (un passage en Premium part du gratuit). */
export const GESTES_PAR_SCENARIO = {};

/* La détection, dans l'ordre : un geste d'abonnement au plus, un geste de
   contenu au plus. */
export const REGLES_GESTES = [
  { geste: 'gratuit', sorte: 'plan', motif: /souscri|s['’]abonner|paywall|[ée]cran des offres|achat int[ée]gr[ée]|passer (en|à) (premium|ultra)/i },
  { geste: 'ultra', sorte: 'plan', motif: /\bultra\b/i },
  { geste: 'gratuit', sorte: 'plan', motif: /non[ -]abonn|sans abonnement|(plan|compte|offre|version) gratuit|limites? du (plan )?gratuit/i },
  { geste: 'premium', sorte: 'plan', motif: /\bpremium\b|\babonn[ée]e?s?\b|plan payant/i },
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
    etats.set(cleDe(campagne), { plan: r.plan, taches: r.taches });
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
      texte: 'Tout le contenu de votre compte de test sera effacé : tâches, rituels, objectifs, journal, dates, idées, voyages, notes, courses, données suivies. Le compte reste, avec son nom et le plan gratuit. Sur le téléphone, déconnectez-vous puis reconnectez-vous pour repartir comme un nouvel utilisateur.',
      ok: 'Remettre à zéro', danger: true,
    });
    if (!oui) return null;
    extra.confirmation = CONFIRMATION_ZERO;
  }
  if (geste === 'remplir-fond') toast('Remplissage en cours : jusqu\'à une minute.', 'info');
  const r = await appeler(campagne, geste, extra);
  etats.set(cleDe(campagne), { plan: r.plan, taches: typeof r.taches === 'number' ? r.taches : (etatCompte(campagne) || {}).taches });
  toast(`${g.fait} L'application le voit d'elle-même, sans réinstaller.`);
  return r;
};

/** La boîte « Mon compte de test » de la page L'application. */
export const boiteCompteHtml = (campagne, email) => {
  if (!email) return '';
  const e = etatCompte(campagne);
  const planActuel = e && e.plan ? e.plan : '';
  const ligne = !e ? '<span class="t-3">Lecture du compte…</span>'
    : e.erreur ? `<span class="t-3">${echapper(e.erreur)}</span>`
      : `Plan actuel : <b>${echapper(PLANS_LIBELLES[planActuel] || planActuel)}</b> · ${Number(e.taches || 0).toLocaleString('fr-FR')} tâche${Number(e.taches) > 1 ? 's' : ''}`;
  const bouton = (geste, classe = 'btn-secondaire') => {
    const actif = GESTE_DU_PLAN[planActuel] === geste;
    return `<button class="btn ${classe} btn-petit" type="button" data-compte-geste="${geste}"${['gratuit', 'premium', 'ultra'].includes(geste) ? ` aria-pressed="${actif}"` : ''}>${echapper(GESTES_COMPTE[geste].libelle)}</button>`;
  };
  return `<section class="compte-test" data-compte-test>
    <div class="section-tete"><h2>Mon compte de test</h2></div>
    <p class="t-2">Le compte <b data-compte-email>${echapper(email)}</b>, sur votre téléphone comme sur le web. Ces gestes n'agissent que sur lui, dans l'environnement de test : rien de réel.</p>
    <p class="compte-test-etat" data-compte-etat>${ligne}</p>
    <div class="compte-test-rangee">
      <span class="etiquette-champ">Abonnement</span>
      <div class="rang compte-test-boutons">${bouton('gratuit')}${bouton('premium')}${bouton('ultra')}</div>
    </div>
    <div class="compte-test-rangee">
      <span class="etiquette-champ">Contenu</span>
      <div class="rang compte-test-boutons">${bouton('remplir')}${bouton('remplir-fond')}${bouton('zero', 'btn-danger')}</div>
    </div>
    <p class="aide">« Remplir » ajoute des données fictives en français, « Remplir à fond » environ 1 500 tâches pour juger la rapidité. L'application voit chaque changement en quelques secondes, sans réinstaller. Vingt gestes par heure au plus.</p>
  </section>`;
};

/** Les boutons d'un scénario, à placer dans sa feuille. */
export const blocScenarioHtml = (s, campagne, email) => {
  if (!email) return '';
  const besoins = besoinsDuScenario(s, campagne);
  if (!besoins.length) return '';
  return `<section class="fs-bloc fs-bloc--compte" data-compte-scenario>
    <p class="fs-bloc-sur">Avant de commencer</p>
    <div class="rang compte-test-boutons">${besoins.map((g) => `<button class="btn btn-secondaire btn-petit" type="button" data-compte-geste="${g}">${echapper(GESTES_COMPTE[g].invite)}</button>`).join('')}</div>
  </section>`;
};
