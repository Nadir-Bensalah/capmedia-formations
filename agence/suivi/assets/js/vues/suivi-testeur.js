/* ==========================================================================
   CAPMEDIA COCKPIT · la fiche de suivi d'un testeur

   Ce qu'on veut savoir d'un testeur en cours de campagne, sur une feuille :
   l'invitation (partie quand, acceptée ou non), ses connexions (combien,
   la dernière, chacune avec son début et sa durée, le temps en tout), son
   avancement campagne par campagne (faits sur prévus, échecs, remarques,
   avis rendu oui ou non, terminé ou non), ses appareils et son statut.

   L'équipe seule : la feuille s'ouvre depuis la liste des testeurs de la
   page Tests (l'équipe seule la voit) et depuis Messages › Testeurs (le
   Cockpit seul). Ce qu'elle lit est fermé au client et au testeur par les
   règles : la présence (presences/{uid}, équipe seule), les sessions
   (l'équipe, et le testeur pour les siennes), l'appréciation (équipe du
   projet), les invitations (le serveur seul, par suiviTesteur, qui exige
   qa.gerer). L'avis lui-même est anonyme : on sait s'il est rendu, jamais
   ce qu'il dit.

   Les calculs (connexions, durées, avancement) vivent dans
   ../suivi-testeur.js, testé à part. Ici, on lit une fois et on dessine
   une fois : le squelette, puis la feuille pleine.
   ========================================================================== */

import {
  bdd, doc, getDoc, getDocs, collection, query, where, orderBy, limit,
  echapper, enDate, dateCourte, heure, depuis, pluriel, STATUTS_CAMPAGNE, PLATEFORMES_TEST,
} from '../noyau.js';
import { modale, squelette } from '../ui.js';
import { appelServeur } from '../serveur.js';
import { bilanConnexions, bilanInvitation, avancementCampagne, totalAvancement, estEnLigne, dureeEnClair } from '../suivi-testeur.js';

/* Les sessions lues d'un coup : largement plus qu'une campagne n'en fait. */
const SESSIONS_LUES = 500;
/* Les connexions montrées avant « Voir les autres ». */
const CONNEXIONS_VUES = 12;

const TIRET = '–';
const projetDe = (c) => c.projet || c._parent || '';
const jour = (ms) => (ms ? dateCourte(new Date(ms)) : '');
const jourHeure = (ms) => (ms ? `${dateCourte(new Date(ms))} à ${heure(new Date(ms))}` : '');
const MOTS_PLATEFORME = { ios: 'iPhone', android: 'Android', web: 'Web' };
const motPlateforme = (p) => MOTS_PLATEFORME[p] || ((PLATEFORMES_TEST[p] || {}).court) || p;
const ETATS_INVITATION = {
  envoyee: 'lien valable', 'en-attente': 'e-mail pas encore parti', preparee: 'pas encore envoyée',
  acceptee: 'acceptée', expiree: 'lien expiré', revoquee: 'lien remplacé ou coupé',
};

/* Une ligne « libellé, valeur » : la valeur vide devient un tiret. */
const paire = (libelle, valeur, { cle = '', ton = '' } = {}) => `<div class="st-paire"${cle ? ` data-st="${cle}"` : ''}>
  <span class="st-libelle">${echapper(libelle)}</span>
  <span class="st-valeur${ton ? ` ${ton}` : ''}">${valeur || TIRET}</span>
</div>`;
const ouiNon = (v) => (v ? 'oui' : 'non');

/* Tout ce que la feuille lit, en une fois. Chaque lecture qui échoue rend
   vide plutôt que de bloquer les autres : une campagne d'un projet qu'on
   ne voit pas ne doit pas cacher le reste. */
const lireSuivi = async (testeur, campagnes) => {
  const uid = testeur.id;
  const sur = (p, defaut) => p.catch((e) => { console.warn('[suivi testeur]', e && e.code ? e.code : e); return defaut; });
  const [presence, sessions, invitations, parCampagne] = await Promise.all([
    sur(getDoc(doc(bdd, 'presences', uid)).then((d) => (d.exists() ? d.data() : null)), null),
    sur(getDocs(query(collection(bdd, 'presences', uid, 'sessions'), orderBy('debut', 'desc'), limit(SESSIONS_LUES)))
      .then((q) => q.docs.map((d) => ({ id: d.id, ...d.data() }))), []),
    sur(appelServeur('suiviTesteur', { testeur: uid }).then((r) => ({ ok: true, liste: (r && r.invitations) || [] })), { ok: false, liste: [] }),
    Promise.all(campagnes.map(async (c) => {
      const pid = projetDe(c);
      const base = ['projets', pid, 'campagnes', c.id];
      const [passages, remarques, appreciation] = await Promise.all([
        sur(getDocs(query(collection(bdd, ...base, 'passages'), where('testeur', '==', uid))).then((q) => q.docs.map((d) => d.data())), []),
        sur(getDocs(query(collection(bdd, ...base, 'remarques'), where('testeur', '==', uid))).then((q) => q.docs.map((d) => d.data())), []),
        sur(getDoc(doc(bdd, ...base, 'appreciations', uid)).then((d) => (d.exists() ? d.data() : null)), null),
      ]);
      return { campagne: c, pid, avancement: avancementCampagne({ campagne: c, uid, passages, remarques, appreciation }) };
    })),
  ]);
  return { presence, sessions, invitations, parCampagne };
};

/* --- Les blocs de la feuille ------------------------------------------ */

const blocInvitation = (inv, lue) => `<section class="fs-bloc" data-st-bloc="invitation">
  <p class="fs-bloc-sur">Invitation</p>
  <div class="st-paires">
    ${paire('Envoyée le', lue ? (inv.envoyee ? `${echapper(jourHeure(inv.envoyee))}${inv.envois > 1 ? ` <span class="t-3">(${inv.envois} envois, le premier le ${echapper(jour(inv.premierEnvoi))})</span>` : ''}` : 'jamais') : '<span class="t-3">non lue</span>', { cle: 'envoyee' })}
    ${paire('Acceptée', inv.acceptee ? `oui, première connexion le ${echapper(jourHeure(inv.premiereConnexion))}` : 'non, il ne s\'est jamais connecté', { cle: 'acceptee', ton: inv.acceptee ? 't-ok' : 't-revoir' })}
    ${lue && inv.etat && !inv.acceptee ? paire('Le lien', echapper(ETATS_INVITATION[inv.etat] || inv.etat), { cle: 'lien' }) : ''}
  </div>
  ${lue ? '' : '<p class="aide">Les dates d\'envoi se lisent avec le droit de piloter les tests.</p>'}
</section>`;

const blocConnexions = (b, presence) => {
  const la = estEnLigne(presence);
  const vu = enDate(presence && presence.vu);
  const ligne = (c) => `<div class="tb-session" data-st-connexion>
    <span>${echapper(jour(c.debut))} · ${echapper(heure(new Date(c.debut)))} à ${echapper(heure(new Date(c.fin)))}${c.plateformes.length ? ` · ${echapper(c.plateformes.map(motPlateforme).join(', '))}` : ''}</span>
    <b>${echapper(dureeEnClair(c.duree))}</b>
  </div>`;
  const vues = b.liste.slice(0, CONNEXIONS_VUES);
  const reste = b.liste.slice(CONNEXIONS_VUES);
  return `<section class="fs-bloc" data-st-bloc="connexions">
    <p class="fs-bloc-sur">Connexions</p>
    <p class="st-resume" data-st="resume-connexions">${b.nombre
      ? `<b>${pluriel(b.nombre, 'connexion', 'connexions')}</b>, <b>${echapper(dureeEnClair(b.total))}</b> en tout. ${la ? `<span class="t-ok">En ligne maintenant${presence.scenario ? `, sur ${echapper(presence.scenario)}` : ''}.</span>` : `Dernière le <b>${echapper(jourHeure(Math.max(b.derniere, vu ? vu.getTime() : 0)))}</b>${vu ? ` <span class="t-3">(${echapper(depuis(vu))})</span>` : ''}.`}`
      : 'Aucune connexion enregistrée.'}</p>
    ${vues.length ? `<div class="tb-sessions">${vues.map(ligne).join('')}</div>` : ''}
    ${reste.length ? `<details class="st-plus"><summary>Voir ${pluriel(reste.length, 'connexion plus ancienne', 'connexions plus anciennes')}</summary><div class="tb-sessions">${reste.map(ligne).join('')}</div></details>` : ''}
    ${b.nombre ? '<p class="aide">Une connexion regroupe ce qui se suit à moins d\'une demi-heure (un rechargement, deux onglets). Le temps est celui où son espace était ouvert.</p>' : ''}
  </section>`;
};

const blocAvancement = (parCampagne, nomProjet) => {
  if (!parCampagne.length) {
    return `<section class="fs-bloc" data-st-bloc="avancement"><p class="fs-bloc-sur">Avancement</p><p class="st-resume">Dans aucune campagne pour l'instant.</p></section>`;
  }
  const t = totalAvancement(parCampagne.map((x) => x.avancement));
  return `<section class="fs-bloc" data-st-bloc="avancement">
    <p class="fs-bloc-sur">Avancement</p>
    <p class="st-resume" data-st="resume-avancement"><b>${t.faits}</b> ${t.faits > 1 ? 'tests faits' : 'test fait'} sur <b>${t.prevus}</b> prévus${t.echecs ? `, <b>${pluriel(t.echecs, 'échec signalé', 'échecs signalés')}</b>` : ''}${t.remarques ? `, <b>${pluriel(t.remarques, 'remarque', 'remarques')}</b>` : ''}.</p>
    ${parCampagne.map(({ campagne: c, pid, avancement: a }) => {
      const part = a.prevus ? Math.min(100, (a.faits / a.prevus) * 100) : 0;
      const statut = (STATUTS_CAMPAGNE[c.statut || 'preparation'] || {}).libelle || '';
      return `<div class="st-campagne" data-st-campagne="${echapper(c.id)}">
        <div class="st-campagne-tete">
          <a class="lien" href="#/tests?projet=${encodeURIComponent(pid)}&campagne=${encodeURIComponent(c.id)}" data-st-ouvrir-campagne>${echapper(c.titre || 'Campagne')}</a>
          <span class="t-micro t-3">${echapper([nomProjet(pid), statut].filter(Boolean).join(' · '))}</span>
        </div>
        <div class="tb-mini" aria-hidden="true"><i style="flex-basis:${part.toFixed(1)}%;background:var(--case-ok)"></i></div>
        <div class="st-paires">
          ${paire('Tests faits', `<b data-st="faits">${a.faits}</b> sur <b data-st="prevus">${a.prevus}</b>`)}
          ${paire('Échecs signalés', a.echecs ? `<span data-st="echecs">${a.echecs}</span>` : `<span data-st="echecs">0</span>`, { ton: a.echecs ? 't-ko' : '' })}
          ${a.aRejouer ? paire('À rejouer', String(a.aRejouer), { ton: 't-revoir' }) : ''}
          ${paire('Remarques', `<span data-st="remarques">${a.remarques}</span>`)}
          ${paire('Avis rendu', `<span data-st="avis">première impression ${ouiNon(a.avisAvant)}, avis final ${ouiNon(a.avisApres)}</span>`, { ton: a.avisApres ? 't-ok' : '' })}
          ${paire('A terminé', a.termine ? `<span data-st="termine">oui, le ${echapper(jour(a.termine))}</span>` : '<span data-st="termine">non</span>', { ton: a.termine ? 't-ok' : '' })}
          ${a.fin ? paire('Accès', `${a.fin <= Date.now() ? 'clos depuis le' : 'jusqu\'au'} ${echapper(jour(a.fin))}`) : ''}
        </div>
      </div>`;
    }).join('')}
    <p class="aide">L'avis est anonyme : on sait s'il est rendu, jamais ce qu'il dit.</p>
  </section>`;
};

const blocAppareils = (t) => {
  const appareils = (t.appareils || []).slice().reverse();
  return `<section class="fs-bloc" data-st-bloc="appareils">
    <p class="fs-bloc-sur">Appareils</p>
    <div class="st-paires">
      ${paire('Teste sur', echapper((t.plateformes || (t.mobile ? [t.mobile, 'web'] : [])).map(motPlateforme).join(', ')))}
    </div>
    ${appareils.length ? `<div class="tb-sessions" style="margin-top:8px">${appareils.map((a) => `<div class="tb-session" data-st-appareil>
      <span><b>${echapper(a.modele || 'Appareil')}</b>${[a.os, a.navigateur].filter(Boolean).length ? ` · ${echapper([a.os, a.navigateur].filter(Boolean).join(' · '))}` : ''}${a.confirme === false ? ' <span class="t-3">(pas pour tester)</span>' : ''}</span>
      <span class="t-3">${enDate(a.vu) ? `vu le ${echapper(dateCourte(a.vu))}` : TIRET}</span>
    </div>`).join('')}</div>` : '<p class="st-resume">Aucun appareil relevé : ils s\'ajoutent à sa première connexion depuis chacun.</p>'}
  </section>`;
};

const blocStatut = (t) => `<section class="fs-bloc" data-st-bloc="statut">
  <p class="fs-bloc-sur">Statut</p>
  <div class="st-paires">
    ${paire('Statut', t.actif === false ? 'retiré' : 'actif', { cle: 'statut', ton: t.actif === false ? 't-3' : 't-ok' })}
    ${paire('Inscrit le', echapper(dateCourte(t.cree)))}
    ${paire('Fiche validée', t.ficheValidee ? `le ${echapper(dateCourte(t.ficheValidee))}` : 'pas encore')}
  </div>
</section>`;

/**
 * Ouvre la feuille. `campagnes` : toutes celles que l'équipe voit (on y
 * prend celles du testeur). `nomProjet(pid)` : le nom d'un projet.
 * `modifier` : le geste qui ouvre le formulaire (absent : pas de bouton).
 * Rend la promesse de la modale.
 */
export const ouvrirSuiviTesteur = (testeur, { campagnes = [], nomProjet = () => '', modifier = null } = {}) => {
  const t = testeur || {};
  const siennes = campagnes
    .filter((c) => (c.testeurs || []).includes(t.id) || Object.prototype.hasOwnProperty.call(c.affectation || {}, t.id))
    .sort((a, b) => ((enDate(b.debut) || enDate(b.cree) || 0) - (enDate(a.debut) || enDate(a.cree) || 0)));
  const nom = [t.prenom, t.nom].filter(Boolean).join(' ') || t.email || 'Le testeur';
  const m = modale({
    titre: nom,
    sousTitre: [t.email, t.actif === false ? 'Retiré' : 'Actif'].filter(Boolean).join(' · '),
    feuille: true,
    corps: `<div class="st-fiche" data-suivi-testeur="${echapper(t.id || '')}" data-st-etat="lecture">${squelette('liste', 4)}</div>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>
      <span class="pousse"></span>
      <a class="btn btn-doux" href="#/testeurs-messages/${encodeURIComponent(t.id || '')}" data-st-ecrire>Lui écrire</a>
      ${modifier ? '<button class="btn btn-principal" type="button" data-modifier-testeur>Modifier</button>' : ''}`,
  });
  const boite = m.el.querySelector('.st-fiche');
  const ecrire = m.el.querySelector('[data-st-ecrire]');
  if (ecrire) ecrire.addEventListener('click', () => m.fermer());
  const bouton = m.el.querySelector('[data-modifier-testeur]');
  if (bouton) bouton.addEventListener('click', () => { m.fermer(); modifier(); });
  m.el.addEventListener('click', (ev) => { if (ev.target.closest('[data-st-ouvrir-campagne]')) m.fermer(); });

  lireSuivi(t, siennes).then(({ presence, sessions, invitations, parCampagne }) => {
    if (!boite.isConnected) return;
    const inv = bilanInvitation({ invitations: invitations.liste, sessions, testeur: t });
    boite.innerHTML = `${blocInvitation(inv, invitations.ok)}
      ${blocConnexions(bilanConnexions(sessions), presence)}
      ${blocAvancement(parCampagne, nomProjet)}
      ${blocAppareils(t)}
      ${blocStatut(t)}`;
    boite.dataset.stEtat = 'pret';
  }).catch((e) => {
    console.error(e);
    if (boite.isConnected) { boite.innerHTML = '<p class="aide">Le suivi n\'a pas pu être lu. Fermez et rouvrez la fiche.</p>'; boite.dataset.stEtat = 'erreur'; }
  });
  return m.fin;
};
