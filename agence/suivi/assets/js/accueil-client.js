/* ==========================================================================
   CAPMEDIA HUB · l'accueil du client

   Les écrans de la première fois (le moteur est dans accueil.js) : son
   espace, ses projets tels qu'ils sont dans la base, comment on suit
   l'avancement, ce qu'on lui demandera, les tests (seulement s'il en a),
   comment rester proche, puis son espace. Tout ce qui est dit vient de ses projets : l'équipe les
   pilote depuis le Cockpit, et l'écran les reflète.

   Ce qui est fait est consigné dans son profil (app.js) : l'administrateur
   voit, sur la fiche du client, qui a fait ses premiers pas.
   ========================================================================== */

import { echapper, prenom, nomAffiche, STATUTS_PROJET, TYPES_PROJET, statutProjet } from './noyau.js';
import { icone, avatarProjet } from './ui.js';
import { ouvrirAccueil as ouvrirMoteur, accueilVu as vu, marquerAccueilVu as marquer, logoHtml } from './accueil.js';

const prenomDe = (session) => prenom(nomAffiche(session));

const CLE = (uid) => `suivi:client-accueil:${uid || ''}`;

export const accueilVu = (uid) => vu(CLE(uid));
export const marquerAccueilVu = (uid) => marquer(CLE(uid));

const visuelIcone = (nom) => `<div class="visuel-icone">${icone(nom)}</div>`;

/* --------------------------------------------------------------------------
   Les sept écrans
   -------------------------------------------------------------------------- */

const ecranEspace = (session) => {
  const o = (session.organisations || [])[0] || {};
  const societe = o.entreprise || o.nom || '';
  return {
    cle: 'espace',
    visuel: visuelIcone('accueil'),
    texte: `<p class="surtitre">Votre espace</p>
      <h2>Tout ce que Capmedia fait pour vous, en direct</h2>
      <p>${societe ? `L'espace de ${echapper(societe)} : ` : 'Ici, '}chaque projet, chaque étape, chaque décision, au moment où ils avancent. Rien à demander, rien à attendre : quand quelque chose bouge, vous le voyez.</p>`,
  };
};

const ecranProjets = (projets) => {
  const liste = (projets || []).filter((p) => !p.archive).slice(0, 4);
  if (!liste.length) {
    return {
      cle: 'projets',
      visuel: `<div class="appli-icone appli-icone--vide">${icone('projets')}</div>`,
      texte: `<p class="surtitre">Vos projets</p>
        <h2>Votre premier projet arrive</h2>
        <p>Dès que l'équipe Capmedia l'ouvre, il apparaît ici avec sa feuille de route, ses versions et ses fichiers. Vous pouvez aussi en demander un depuis le rail.</p>`,
    };
  }
  const n = (projets || []).filter((p) => !p.archive).length;
  return {
    cle: 'projets',
    visuel: `<ul class="projets-accueil">${liste.map((p) => {
      const statut = STATUTS_PROJET[statutProjet(p)] || {};
      const type = (TYPES_PROJET[p.type] || {});
      return `<li>${avatarProjet(p, 'petit')}<span class="projets-accueil-texte"><b>${echapper(p.nom || '')}</b><small>${echapper([typeof type === 'string' ? type : type.libelle, p.ref].filter(Boolean).join(' · '))}</small></span><span class="pastille pastille--${echapper(statut.voile || statut.ton || 'gris')}">${echapper(statut.client || statut.libelle || '')}</span></li>`;
    }).join('')}</ul>`,
    texte: `<p class="surtitre">Vos projets</p>
      <h2>${n > 1 ? `${n} projets, un seul endroit` : 'Votre projet, à un endroit'}</h2>
      <p>Chacun a sa page : la feuille de route, les tâches, les demandes, les fichiers, les versions et les décisions. Le rail à gauche les liste ; un chiffre rouge dit quand l'un d'eux attend votre main.</p>`,
  };
};

const ecranSuivre = () => ({
  cle: 'suivre',
  visuel: `<ol class="frise-accueil">
      <li><span class="frise-accueil-n">01</span><span class="frise-accueil-i">${icone('route')}</span><span>La feuille de route<small>Les étapes, leur avancement, et les dates qui bougent avec leur motif.</small></span></li>
      <li><span class="frise-accueil-n">02</span><span class="frise-accueil-i">${icone('releases')}</span><span>Les versions<small>Ce qui est livré, sur quelle plateforme, avec ce qui change.</small></span></li>
      <li><span class="frise-accueil-n">03</span><span class="frise-accueil-i">${icone('fichiers')}</span><span>Les fichiers et les décisions<small>Maquettes, documents, ce qu'on a décidé ensemble et quand.</small></span></li>
      <li><span class="frise-accueil-n">04</span><span class="frise-accueil-i">${icone('activite')}</span><span>L'activité<small>Le fil de tout ce qui s'est passé depuis votre dernière visite.</small></span></li>
    </ol>`,
  texte: `<p class="surtitre">Suivre l'avancement</p>
    <h2>Quatre endroits, dans chaque projet</h2>
    <p>Vous n'avez rien à relancer : ce qui avance s'écrit ici, au moment où l'équipe le fait.</p>`,
});

/* Ce que « En attente de vous » contient vraiment : valider, répondre à
   une demande, décider un devis, régler une facture, débloquer un point.
   L'ancien écran n'en citait que trois et le client découvrait le reste
   au premier devis. */
const ecranAttendu = () => ({
  cle: 'attendu',
  visuel: `<div class="verdicts-accueil">
      <div><b class="verdict verdict--attente">Valider</b><span>Une maquette, un texte, une version : votre oui fait avancer le projet.</span></div>
      <div><b class="verdict verdict--demande">Répondre</b><span>Une précision sur une demande, ou un retour sur une tâche que nous attendons de vous.</span></div>
      <div><b class="verdict verdict--message">Décider un devis</b><span>Accepter ou refuser, depuis votre espace, quand un devis vous est envoyé.</span></div>
      <div><b class="verdict verdict--attente">Régler une facture</b><span>Chaque facture émise, son échéance, et comment la régler.</span></div>
      <div><b class="verdict verdict--demande">Débloquer un point</b><span>Un accès, un contenu, une décision qui manque de votre côté : on vous le dit, vous le levez.</span></div>
    </div>`,
  texte: `<p class="surtitre">Ce qu'on vous demandera</p>
    <h2>Cinq gestes, jamais plus</h2>
    <p>« Demandes », dans le rail, s'ouvre sur « En attente de vous » : tout ce qui n'avance pas sans vous, avec un chiffre rouge. Quand c'est vide, tout est entre nos mains.</p>`,
});

const ecranTests = () => ({
  cle: 'tests',
  visuel: `<div class="cases-accueil" aria-hidden="true">${['ok', 'ok', 'ok', 'ko', 'ok', 'ok', 'ok', 'na', 'ok', 'ok', 'revoir', 'ok', 'ok', 'ok', 'ok', 'ok', 'ko', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'].map((e) => `<i data-e="${e}"></i>`).join('')}</div>`,
  texte: `<p class="surtitre">Les tests</p>
    <h2>Testé avant d'être livré</h2>
    <p>Des testeurs déroulent des scénarios sur votre application, et des robots rejouent les parcours à chaque version. Vous lisez les résultats scénario par scénario, et ce que les testeurs en pensent, sans leur nom.</p>`,
});

const ecranProche = () => ({
  cle: 'proche',
  visuel: `<div class="apps-accueil" aria-hidden="true"><img src="./assets/img/app-hub.png" alt="" width="96" height="96"><span class="apps-accueil-os"><span>${icone('apple')} Mac</span><span>${icone('composants')} Windows</span><span>${icone('globe')} Web</span></span></div>`,
  texte: `<p class="surtitre">Restons proches</p>
    <h2>Sur votre ordinateur aussi</h2>
    <p>Capmedia Hub s'installe sur Mac et sur Windows en un clic, depuis le menu de votre compte ou depuis la page de connexion : le même espace, avec les notifications de votre système, et qui se met à jour tout seul. Et sur le web, à tout moment, depuis n'importe quel navigateur.</p>`,
});

const ecranFin = (session, projets) => ({
  cle: 'fin',
  visuel: logoHtml(true),
  texte: `<p class="surtitre">Tout est prêt</p>
    <h2>${(projets || []).some((p) => !p.archive) ? 'Vos projets vous attendent' : 'Votre espace est prêt'}</h2>
    <p>Vous pouvez revoir ces écrans quand vous voulez, depuis le menu de votre compte, en bas du rail. Bonne visite${prenomDe(session) ? `, ${echapper(prenomDe(session))}` : ''}.</p>`,
});

/* --------------------------------------------------------------------------
   L'ouverture
   -------------------------------------------------------------------------- */

/**
 * Renvoie { el, majProjets, fermer, entame }. `projets` est une fonction :
 * la liste peut arriver pendant que l'accueil est ouvert.
 */
/**
 * `avecTests` dit si des scénarios de test concernent ce client : c'est la
 * même condition que l'entrée Tests du rail. Sans scénario, l'écran des
 * tests n'a rien à montrer et promettrait une page vide.
 */
export const ouvrirAccueil = ({ session, projets, avecTests = () => true, surFin = null }) => {
  const moteur = ouvrirMoteur({
    service: 'Hub',
    prenom: prenomDe(session) || '',
    texte: 'Vous êtes sur Capmedia Hub, l\'espace où vous suivez vos projets avec l\'équipe Capmedia. Laissez-nous vous présenter ce que vous y trouverez.',
    ecrans: () => [ecranEspace(session), ecranProjets(projets()), ecranSuivre(), ecranAttendu(), ...(avecTests() ? [ecranTests()] : []), ecranProche(), ecranFin(session, projets())],
    surFin,
  });
  return { el: moteur.el, majProjets: () => { moteur.redessiner('projets'); moteur.redessiner('fin'); }, fermer: moteur.fermer, get entame() { return moteur.entame; } };
};
