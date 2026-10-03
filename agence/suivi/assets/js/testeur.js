/* ==========================================================================
   L'ESPACE TESTEUR (Capmedia Test)

   Le même dessin que le Cockpit et le Hub : un rail, des pages. Le testeur y
   trouve sa campagne d'abord (où il en est, quoi faire, cocher vite), puis
   ce qui l'aide à bien tester : l'application qu'il découvre et comment
   l'installer, ses signalements et leur suite, son avis, un guide, et le
   temps qu'il a déjà donné. La première fois, l'accueil (accueil-testeur.js)
   passe devant tout : la marque, son prénom, puis sept écrans qui lui
   présentent son rôle et l'application, avant de laisser place à la
   campagne.

   Ce qu'il ne voit jamais : les autres testeurs, et leurs réponses. Un
   testeur qui lit « les cinq autres ont mis OK » met OK sans regarder.
   Ça s'appelle l'ancrage, c'est documenté, et ça ruine une campagne. Le
   cloisonnement est tenu par les règles Firestore, pas par cet écran :
   un affichage ne protège rien.
   ========================================================================== */

import {
  bdd, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, signOut, onSnapshot, effacerSecretsLocaux, enDate,
  serverTimestamp, session, echapper, envoyerPiece,
  BLOCS_SCENARIO, PLATEFORMES_TEST, RESULTATS_PASSAGE, FAMILLES_AVIS,
} from './noyau.js';
import { icone, pastille, toast, agir, modale, vide } from './ui.js';
import { monterCoquille, definirNavigation, definirEtat, filAriane, enregistrerRecherche } from './coquille.js';
import { definir, demarrer, courant, naviguer } from './routeur.js';
import { tableauTesteur, ETATS_CASE } from './verdicts.js';
import { barreHtml, famillesHtml } from './grille.js';
import { ouvrirAccueil, accueilVu, marquerAccueilVu } from './accueil-testeur.js';
import { ouvrirFiche, consignerAppareil } from './fiche-testeur.js';
import { monterBulleTesteur } from './bulle-testeur.js';

const $ = (s, r = document) => r.querySelector(s);
/* La zone où s'affiche la page courante : celle de la coquille, une fois
   montée. Avant, la porte de chargement de testeur.html. */
let racine = $('#racine');

/* Ce que la machine sait de l'appareil, et que le testeur n'a pas à taper.
   Une saisie libre donne « iphone14 », « iPhone14 Pro » et « 14 », et les
   statistiques sont mortes. On le relève à CHAQUE passage : un testeur qui
   met son téléphone à jour en pleine campagne change de contexte. */
const contexteAppareil = () => {
  const n = navigator || {};
  return {
    agent: String(n.userAgent || '').slice(0, 300),
    plateforme: String((n.userAgentData && n.userAgentData.platform) || n.platform || '').slice(0, 60),
    langue: String(n.language || '').slice(0, 12),
    ecran: `${window.screen ? window.screen.width : 0}x${window.screen ? window.screen.height : 0}`,
    densite: window.devicePixelRatio || 1,
    sombre: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
  };
};

/* Sur quoi il est en train de tester. Le contexte dit l'appareil, ceci dit
   la plateforme au sens de la campagne. Quand le scénario porte sa
   plateforme (celle de l'affectation), c'est elle qui fait foi et le
   testeur ne choisit rien. Sinon, son dernier choix, ou à défaut
   l'appareil qu'il a sous la main s'il figure dans sa fiche : un testeur
   ne doit jamais tomber sur « dites d'abord sur quoi vous testez ». */
let plateformeCourante = (() => {
  try { return localStorage.getItem('suivi:testeur-plateforme') || ''; } catch (e) { return ''; }
})();

const plateformeAppareil = () => {
  const ua = String(navigator.userAgent || '');
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'web';
};

const plateformeParDefaut = (moi) => {
  const siennes = (moi && Array.isArray(moi.plateformes)) ? moi.plateformes : [];
  const ici = plateformeAppareil();
  if (!siennes.length || siennes.includes(ici)) return ici;
  return (moi && moi.mobile) || siennes[0] || '';
};

const plateformeDe = (s) => (s && s.plateforme) || plateformeCourante;
const plateformeImposee = (s) => Boolean(s && s.plateforme);

/* Les mots du testeur, ceux du guide, de l'accueil et de la feuille :
   « Réussi, Échec, Sans objet » et « iPhone ». « OK, KO, NA » et « iOS »
   sont des mots d'équipe. Les deux jeux de clés de résultat sont compris. */
const VERDICTS_TESTEUR = {
  ok: { libelle: 'Réussi', voile: 'vert' }, reussi: { libelle: 'Réussi', voile: 'vert' },
  ko: { libelle: 'Échec', voile: 'rouge' }, echec: { libelle: 'Échec', voile: 'rouge' },
  na: { libelle: 'Sans objet', voile: 'gris' }, 'sans-objet': { libelle: 'Sans objet', voile: 'gris' },
};
const sorteVerdict = (r) => ({ reussi: 'ok', echec: 'ko', 'sans-objet': 'na' }[r] || r);
const estEchec = (r) => sorteVerdict(r) === 'ko';
const PLATEFORMES_TESTEUR = { ios: 'iPhone', android: 'Android', web: 'Web' };

/* Tableau ou liste : le tableau dit d'un coup d'œil où l'on en est, la
   liste se lit ligne à ligne. Le choix reste d'une visite à l'autre. */
let vueCourante = (() => {
  try { return localStorage.getItem('suivi:testeur-vue') || 'grille'; } catch (e) { return 'grille'; }
})();

const etat = { campagne: null, scenarios: [], passages: new Map(), avis: null, bloc: '', reste: true, charge: false };

/* -------------------------------------------------------------------------- */

/* Fait, c'est passé et pas à rejouer : un échec que l'équipe a corrigé
   revient dans ce qui reste, jusqu'à ce qu'on le rejoue. Une fois le test
   terminé, ses résultats sont figés : rien ne revient chez lui, l'équipe
   fait rejouer ailleurs. C'est la seule mesure de « fait » de l'écran :
   l'en-tête, la fin, l'avis et le bouton « J'ai terminé » la partagent. */
const fait = (ref) => {
  const p = etat.passages.get(ref);
  if (!p) return false;
  if (aTermine()) return true;
  return !(estEchec(p.resultat) && p.aRevoir === true);
};
const toutFait = () => etat.scenarios.length > 0 && etat.scenarios.every((s) => fait(s.ref));

/* --------------------------------------------------------------------------
   La fin de test

   Les scénarios se déroulent dans l'ordre : le suivant s'ouvre quand le
   précédent a un résultat (réussi, échec ou sans objet). Quand tout est
   déroulé, le testeur dit « j'ai terminé » : ses résultats se figent, le
   serveur prévient l'équipe et le client, et lui laisse sept jours d'accès
   pour ajouter ce qui lui revient après coup. Le verrou de l'ordre est
   celui de l'écran ; le gel des résultats et la fin de l'accès sont ceux
   des règles.
   -------------------------------------------------------------------------- */

const aTermine = () => Boolean(etat.avis && etat.avis.termine);

const finAcces = () => {
  const c = etat.campagne;
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!c || !uid) return null;
  return enDate((c.fins || {})[uid]) || null;
};

const dateCourte = (d) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');

/* Ouvrable : le premier de la liste, ou celui dont tous les précédents ont
   un résultat. Un échec corrigé « à rejouer » compte comme déroulé : il ne
   rebloque pas la suite. */
const ouvrable = (ref) => {
  const i = etat.scenarios.findIndex((s) => s.ref === ref);
  if (i <= 0) return true;
  return etat.scenarios.slice(0, i).every((s) => etat.passages.has(s.ref));
};

const prochain = () => etat.scenarios.find((s) => !etat.passages.has(s.ref)) || null;

/* Ce qu'il a à faire maintenant : le premier scénario qui n'est pas fait,
   à rejouer compris. Tous ceux d'avant ont un résultat : il est ouvrable. */
const aFaire = () => etat.scenarios.find((s) => !fait(s.ref)) || null;

/* Ce que le rail dit de l'accès, en bas. */
const etatAcces = () => {
  const c = etat.campagne;
  if (!c) return null;
  const fin = finAcces();
  if (aTermine()) {
    return fin
      ? { texte: `Test terminé · accès jusqu'au ${dateCourte(fin)}`, ton: 'ambre', titre: 'Vos résultats sont figés. Vous pouvez encore ajouter une remarque.' }
      : { texte: 'Test terminé', ton: 'ambre' };
  }
  if (fin) return { texte: `Accès actif jusqu'au ${dateCourte(fin)}`, ton: 'vert' };
  return { texte: 'Accès actif', ton: 'vert' };
};

const finTestHtml = () => {
  const total = etat.scenarios.length;
  if (!total) return '';
  if (aTermine()) {
    const fin = finAcces();
    return `<div class="fin-test fin-test--faite">
      <h2>Test terminé le ${echapper(dateCourte(enDate(etat.avis.termine) || new Date()))}</h2>
      <p>Vos résultats sont transmis à l'équipe Capmedia et figés. ${fin ? `Votre accès reste ouvert jusqu'au ${echapper(dateCourte(fin))} : le temps d'ajouter une remarque qui vous revient après coup.` : ''}</p>
    </div>
    ${magasinsHtml()}`;
  }
  if (toutFait()) {
    /* Un seul bouton à la fin : terminer ouvre l'avis tout seul. */
    const avisDonne = Object.keys(etat.avis || {}).some((k) => k.startsWith('esthetique.'));
    return `<div class="fin-test">
      <h2>Tout est déroulé. Il reste à le dire.</h2>
      <p>Vos résultats partent à l'équipe et sont figés. Relisez d'abord vos échecs si vous avez un doute : après, vous ne pourrez plus les changer.</p>
      <div class="actions"><button class="btn btn-principal" type="button" data-terminer>${avisDonne ? 'J\'ai terminé le test' : 'Terminer et donner mon avis'}</button></div>
    </div>`;
  }
  return '';
};

/* Après la fin : ce qui lui revient après coup. Une remarque part telle
   quelle à l'équipe, sans passer par un scénario. */
const remarquesHtml = () => {
  if (!aTermine()) return '';
  const liste = (etat.avis && Array.isArray(etat.avis.remarques)) ? etat.avis.remarques : [];
  const fin = finAcces();
  const encore = !fin || fin.getTime() > Date.now();
  return `<section class="remarques-fin">
    <div class="section-tete"><h2>Une remarque de plus&nbsp;?</h2></div>
    ${liste.length ? liste.map((r) => `<div class="remarque">${echapper(String(r.texte || ''))}<small>${enDate(r.le) ? echapper(enDate(r.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : ''}</small></div>`).join('') : ''}
    ${encore && liste.length < 20 ? `<div class="groupe">
      <textarea class="champ" id="remarque-texte" rows="3" placeholder="Ce qui vous est revenu après coup : un écran, un détail, une idée."></textarea>
      <div class="actions" style="margin-top:8px"><button class="btn btn-secondaire" type="button" data-remarque>Envoyer à l'équipe</button></div>
    </div>` : `<p class="aide">${liste.length >= 20 ? 'Vingt remarques, merci : l\'équipe a de quoi lire.' : 'Votre accès est terminé.'}</p>`}
  </section>`;
};

/* Les fiches des magasins, pour un vrai avis une fois le test fini : un
   testeur qui a passé des heures dans l'application est le mieux placé
   pour en parler là où les autres la découvrent. Seulement si l'équipe a
   posé les adresses sur la campagne. */
const magasinsHtml = () => {
  const c = etat.campagne || {};
  const m = c.magasins || {};
  const liens = [['ios', 'App Store', 'apple', m.ios], ['android', 'Play Store', 'android', m.android]].filter(([, , , u]) => /^https:\/\/[^\s"'<>]+$/.test(String(u || '')));
  if (!liens.length) return '';
  return `<div class="fin-test fin-test--magasins">
    <h2>Un vrai avis, là où les autres la découvrent</h2>
    <p>Vous connaissez ${echapper(c.application || 'l\'application')} mieux que personne maintenant. Une note et quelques mots sur le magasin de votre téléphone aident vraiment.</p>
    <div class="actions">${liens.map(([cle, libelle, ic, url]) => `<a class="btn btn-secondaire" href="${echapper(url)}" target="_blank" rel="noopener" data-magasin="${cle}">${icone(ic)} Noter sur l'${libelle}</a>`).join('')}</div>
  </div>`;
};

const terminer = async (moi) => {
  const total = etat.scenarios.length;
  if (!total || !toutFait()) { toast('Il reste des scénarios à dérouler, ou à rejouer.', 'erreur'); return; }
  /* Une note sur le TEST lui-même, pas sur l'application : c'est ce qui
     dit à l'équipe si les scénarios étaient clairs et faisables. */
  const m = modale({
    titre: 'Terminer le test', sousTitre: 'Vos résultats seront transmis et figés.',
    corps: `<p>L'équipe Capmedia reçoit votre bilan : ${compter().ok} réussi${compter().ok > 1 ? 's' : ''}, ${compter().ko} échec${compter().ko > 1 ? 's' : ''}, ${compter().na} sans objet. Vous ne pourrez plus modifier vos résultats, mais vous garderez sept jours pour ajouter une remarque.</p>
      <div class="groupe" style="margin-top:16px"><span class="etiquette-champ">Ce test était-il clair et faisable&nbsp;?</span>
        <div class="avis-echelle" role="group" aria-label="Note du test">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="avis-cran" data-note-test="${n}" aria-pressed="false">${n}</button>`).join('')}</div>
        <div class="rang avis-bornes"><span>Confus, pénible</span><span>Limpide, agréable</span></div></div>
      <div class="groupe"><label class="etiquette-champ" for="note-test-texte">Ce qui aurait rendu ce test plus facile <span class="facultatif">(facultatif)</span></label>
        <textarea class="champ" id="note-test-texte" rows="3" placeholder="Un scénario flou, une consigne manquante, un lien qui ne marchait pas…"></textarea></div>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Pas encore</button><button class="btn btn-principal" type="button" data-valider>Oui, j\'ai terminé</button>',
  });
  let note = 0;
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-note-test]');
    if (!b) return;
    note = Number(b.dataset.noteTest);
    m.el.querySelectorAll('[data-note-test]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  m.el.querySelector('[data-valider]').addEventListener('click', () => {
    if (!note) { toast('Donnez une note au test, de 1 à 5.', 'erreur'); return; }
    m.fermer({ note, commentaire: ($('#note-test-texte', m.el).value || '').trim().slice(0, 2000) });
  });
  const reponse = await m.fin;
  if (!reponse) return;
  const uid = auth.currentUser.uid;
  const chemin = `projets/${etat.campagne.projet}/campagnes/${etat.campagne.id}/appreciations/${uid}`;
  try {
    await setDoc(doc(bdd, chemin), { termine: serverTimestamp(), noteTest: { note: reponse.note, commentaire: reponse.commentaire, le: new Date() }, testeur: uid, maj: serverTimestamp() }, { merge: true });
    etat.avis = { ...(etat.avis || {}), termine: new Date(), noteTest: { note: reponse.note, commentaire: reponse.commentaire } };
    toast('Merci. Votre bilan est transmis à l\'équipe.');
    rendre(moi);
    /* Le plus utile arrive à la fin : son avis sur l'application, s'il ne
       l'a pas encore donné. */
    if (!Object.keys(etat.avis).some((k) => k.startsWith('esthetique.'))) { await ouvrirAvis(moi, 'apres'); rendre(moi); }
  } catch (e) {
    console.error(e);
    toast("La fin du test n'a pas pu être enregistrée. Réessayez.", 'erreur');
  }
};

const ajouterRemarque = async (moi, texte) => {
  const t = String(texte || '').trim();
  if (!t) { toast('Écrivez votre remarque d\'abord.', 'erreur'); return; }
  if (t.length > 4000) { toast('Une remarque tient en 4 000 caractères.', 'erreur'); return; }
  const uid = auth.currentUser.uid;
  const chemin = `projets/${etat.campagne.projet}/campagnes/${etat.campagne.id}/appreciations/${uid}`;
  const liste = [...((etat.avis && etat.avis.remarques) || []), { texte: t, le: new Date() }];
  try {
    await setDoc(doc(bdd, chemin), { remarques: liste, testeur: uid, maj: serverTimestamp() }, { merge: true });
    etat.avis = { ...(etat.avis || {}), remarques: liste };
    toast('Remarque envoyée à l\'équipe, merci.');
    rendre(moi);
  } catch (e) {
    console.error(e);
    toast("La remarque n'a pas pu être envoyée. Votre accès est peut-être terminé.", 'erreur');
  }
};

const enTete = (moi, campagne) => {
  const total = etat.scenarios.length;
  const faits = etat.scenarios.filter((s) => fait(s.ref)).length;
  const part = total ? Math.round((faits / total) * 100) : 0;
  return `
  <header class="testeur-tete">
    <div class="rang" style="justify-content:space-between;align-items:center;gap:16px">
      <div style="min-width:0">
        <!-- Le testeur arrive sur un écran qui ne ressemble ni au cockpit
             ni à l'espace client : il faut lui dire où il est et ce qu'on
             attend de lui, sinon il lit « Bonjour » et un nom de campagne
             sans comprendre son rôle. -->
        <p class="surtitre">${echapper(campagne.titre || 'Campagne en cours')}</p>
        <h1>Bonjour ${echapper(moi.prenom || '')}</h1>
      </div>
    </div>

    <div style="margin-top:14px">${barreHtml(tableauTesteur({ scenarios: etat.scenarios, passages: etat.passages, blocs: BLOCS_SCENARIO }), { legende: false })}</div>
    <p class="chapo">${aTermine() ? `Test terminé · ${faits} scénario${faits > 1 ? 's' : ''} rendu${faits > 1 ? 's' : ''}` : `${faits} sur ${total} · ${part} %`}</p>
    ${choixPlateformeHtml()}
  </header>`;
};

/* Le choix de la plateforme : seulement quand un de ses scénarios ne la
   porte pas, et jamais après la fin. Prérempli : c'est une vérification,
   pas une question. */
const choixPlateformeHtml = ({ dansFeuille = false } = {}) => {
  if (aTermine() || !etat.scenarios.some((s) => !plateformeImposee(s))) return '';
  return `<div class="t-plateforme${dansFeuille ? ' t-plateforme--feuille' : ''}">
    <span class="t-plateforme-sur">${dansFeuille ? 'Vous le faites sur' : 'Vous testez sur'}</span>
    <div class="segments" role="group" aria-label="Sur quoi vous testez">
      ${Object.keys(PLATEFORMES_TEST).map((cle) => `<button type="button" data-sur="${echapper(cle)}" aria-pressed="${plateformeCourante === cle}">${echapper(PLATEFORMES_TESTEUR[cle] || cle)}</button>`).join('')}
    </div>
  </div>`;
};

/* Le geste suivant, juste sous la jauge : le scénario qui l'attend, à un
   pouce. Le testeur ne revient au tableau que s'il le veut. */
const suiteHtml = () => {
  if (aTermine()) return '';
  const s = aFaire();
  if (!s) return finTestHtml();
  const p = etat.passages.get(s.ref);
  const rejouer = Boolean(p) && estEchec(p.resultat) && p.aRevoir === true;
  const entame = etat.scenarios.some((x) => etat.passages.has(x.ref));
  const avantFait = Object.keys(etat.avis || {}).some((k) => k.startsWith('impression.'));
  return `<section class="t-suite" aria-label="Votre prochain scénario">
    <p class="t-suite-sur">${rejouer ? 'À rejouer' : entame ? 'À vous' : 'Pour commencer'} · <span class="t-scenario-ref">${echapper(s.ref)}</span>${plateformeImposee(s) ? ` · sur ${echapper(PLATEFORMES_TESTEUR[s.plateforme] || s.plateforme)}` : ''}</p>
    <p class="t-suite-titre">${echapper(s.titre || '')}</p>
    <div class="t-suite-gestes">
      <button class="btn btn-principal" type="button" data-continuer="${echapper(s.ref)}">${entame ? 'Continuer' : 'Commencer'}</button>
      ${avantFait ? '' : `<button class="btn btn-secondaire" type="button" data-avis="avant">${entame ? 'Ma première impression' : 'D\'abord ma première impression'}</button>`}
    </div>
  </section>`;
};

const ligneScenario = (s) => {
  const p = etat.passages.get(s.ref);
  const r = p ? p.resultat : '';
  const verrou = !ouvrable(s.ref);
  const fige = aTermine();
  /* La ligne ouvre la feuille, elle ne pose aucun résultat : on ne
     répond pas sans avoir lu « Ce qui doit se passer ». */
  const rejouer = Boolean(p) && !fige && estEchec(r) && p.aRevoir === true;
  const suivant = !fige && (aFaire() || {}).ref === s.ref;
  return `
  <div class="t-scenario${r ? ` t-scenario--${sorteVerdict(r)}` : ''}${verrou ? ' t-scenario--verrou' : ''}${fige ? ' t-scenario--fige' : ''}${suivant ? ' t-scenario--suivant' : ''}" data-ref="${echapper(s.ref)}">
    <button class="t-scenario-corps" type="button" data-ouvrir="${echapper(s.ref)}"${verrou ? ' aria-disabled="true"' : ''}>
      <span class="t-scenario-ref">${echapper(s.ref)}</span>
      <span class="t-scenario-titre">${echapper(s.titre)}</span>
      ${rejouer ? '<span class="pastille pastille--ambre">À rejouer</span>' : r ? pastille(VERDICTS_TESTEUR, r) : suivant ? '<span class="pastille pastille--bleu">À vous</span>' : ''}
    </button>
  </div>`;
};

/* L'appel au questionnaire. Avant de commencer, puis quand tout est
   déroulé : un avis demandé au milieu n'a ni la fraîcheur du premier
   regard ni le recul du dernier. */
const appelAvis = () => {
  /* La première impression est proposée dans le geste suivant, tant
     qu'elle n'est pas donnée ; l'avis de fin, par le bouton de fin. Il ne
     reste ici que le cas d'un test terminé sans avis. */
  const apresFait = Object.keys(etat.avis || {}).some((k) => k.startsWith('esthetique.'));
  if (!aTermine() || apresFait) return '';
  return `<div class="fin-test fin-test--avis">
    <h2>Il reste le plus utile</h2>
    <p>Ce que vous pensez de l'application : les scénarios disent si elle marche, votre avis dit si elle plaît.</p>
    <div class="actions"><button class="btn btn-principal" type="button" data-avis="apres">Donner mon avis</button></div>
  </div>`;
};

/* La légende du testeur : ses mots à lui. L'orange n'est pas « pas
   fait » (ce serait tout orange le premier jour), c'est « rejouez ». */
const legendeTesteur = () => ['vide', 'ok', 'ko', 'revoir', 'na']
  .map((k) => `<span><i class="tb-puce" data-e="${k}"${k === 'vide' ? ' style="background:transparent;box-shadow:inset 0 0 0 1.5px var(--encre-4)"' : ''}></i>${echapper(ETATS_CASE[k].libelle)}</span>`).join('');

const pageCampagne = (moi) => {
  const campagne = etat.campagne;
  /* Sur l'icône de l'application : ce qui reste à dérouler. */
  if (window.capmediaBureau) window.capmediaBureau.compte(campagne ? etat.scenarios.filter((s) => !fait(s.ref)).length : 0);
  if (!campagne) {
    if (!etat.charge) return;
    /* Même sans campagne, il doit savoir où il est : un écran nu qui dit
       « Aucune campagne » ressemble à une erreur. Et la page s'allume
       toute seule quand l'équipe passe une campagne « en cours ». */
    racine.innerHTML = `<div class="page page--testeur">
      <header class="testeur-tete"><div class="rang" style="justify-content:space-between;align-items:center;gap:16px">
        <div><p class="surtitre">Ma campagne</p><h1>Bonjour ${echapper(moi.prenom || '')}</h1></div>
      </div></header>
      ${vide({
        icone: 'taches', titre: 'Aucune campagne en cours',
        texte: 'Vos scénarios apparaîtront ici dès qu\'une campagne vous est confiée, sans recharger la page.',
      })}</div>`;
    return;
  }

  /* Rangés par bloc, dans l'ordre du plan : un testeur qui déroule les
     dates importantes d'affilée garde le contexte en tête. */
  const visibles = etat.scenarios.filter((s) => (!etat.bloc || s.bloc === etat.bloc)
    && (etat.reste ? !fait(s.ref) : true));
  const blocs = [];
  etat.scenarios.forEach((s) => {
    let g = blocs.find((b) => b.cle === s.bloc);
    if (!g) { g = { cle: s.bloc, libelle: (BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || 'Divers', n: 0, faits: 0 }; blocs.push(g); }
    g.n += 1;
    if (fait(s.ref)) g.faits += 1;
  });

  const parBloc = [];
  visibles.forEach((s) => {
    let g = parBloc.find((b) => b.cle === s.bloc);
    if (!g) { g = { cle: s.bloc, libelle: (BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || 'Divers', items: [] }; parBloc.push(g); }
    g.items.push(s);
  });

  /* Sur un téléphone, le premier geste doit se voir sans défiler : la
     jauge, puis le scénario suivant. Les chiffres et l'astuce passent
     sous le tableau. */
  racine.innerHTML = `<div class="page page--testeur">
    ${enTete(moi, campagne)}

    ${suiteHtml()}
    ${aTermine() ? finTestHtml() : ''}
    ${appelAvis()}
    ${remarquesHtml()}

    <div class="segments t-vues" role="group" aria-label="Affichage">
      <button type="button" data-vue="grille" aria-pressed="${vueCourante === 'grille'}">Tableau</button>
      <button type="button" data-vue="liste" aria-pressed="${vueCourante === 'liste'}">Liste</button>
    </div>

    ${vueCourante === 'grille' ? `<div class="tb tb--testeur">
      <div class="tb-legende">${legendeTesteur()}</div>
      ${famillesHtml(tableauTesteur({ scenarios: etat.scenarios, passages: etat.passages, blocs: BLOCS_SCENARIO }), { mode: 'testeur' })}
      <p class="aide">${aTermine() ? 'Touchez une case pour relire un scénario.' : 'La case entourée est la vôtre. Touchez une case pour lire le scénario et poser votre résultat.'}</p>
    </div>` : `
    <div class="rang testeur-filtres">
      <select class="select" id="f-bloc" style="width:auto">
        <option value="">Tous les blocs</option>
        ${blocs.map((b) => `<option value="${echapper(b.cle)}"${etat.bloc === b.cle ? ' selected' : ''}>${echapper(b.libelle)} · ${b.faits}/${b.n}</option>`).join('')}
      </select>
      <label class="case"><input type="checkbox" id="f-reste" ${etat.reste ? 'checked' : ''}> Ne montrer que ce qui reste</label>
    </div>

    ${visibles.length ? parBloc.map((g) => `
      <div class="bloc-scenarios">
        <h2 class="bloc-tete">${echapper(g.libelle)}<span class="badge">${g.items.length}</span></h2>
        <div class="liste liste--serree">${g.items.map(ligneScenario).join('')}</div>
      </div>`).join('')
      : vide({ icone: 'check', titre: etat.reste ? 'Rien ne reste ici' : 'Aucun scénario',
          texte: etat.reste ? 'Décochez « ce qui reste » pour revoir ce que vous avez déjà coché.' : 'Changez de bloc.', compact: true })}`}

    ${etat.scenarios.some((s) => etat.passages.has(s.ref)) ? chiffresHtml() : ''}
    ${aTermine() ? '' : astuceHtml()}
  </div>`;

  const b = $('#f-bloc'); if (b) b.addEventListener('change', (e) => { etat.bloc = e.target.value; rendre(moi); });
  const r = $('#f-reste'); if (r) r.addEventListener('change', (e) => { etat.reste = e.target.checked; rendre(moi); });
  /* Dans le tableau, une case verrouillée se voit : le suivant attend le
     précédent. */
  const suivant = aTermine() ? '' : (aFaire() || {}).ref;
  racine.querySelectorAll('.tb--testeur [data-case]').forEach((el) => {
    if (!ouvrable(el.dataset.case)) el.setAttribute('data-verrou', '');
    /* La case suivante se voit d'un coup d'œil : un contour plein. */
    if (suivant && el.dataset.case === suivant) { el.setAttribute('data-suivant', ''); el.setAttribute('aria-label', `${el.getAttribute('aria-label') || ''}, à vous`); }
  });
};

/* --------------------------------------------------------------------------
   Le temps donné

   L'addition de toutes ses sessions sur la campagne, relue de la base (les
   dates sont celles du serveur), plus la session en cours qui avance à la
   seconde. Une absence de plus d'une demi-heure a déjà fermé la session
   précédente : une pause déjeuner ne compte pas.
   -------------------------------------------------------------------------- */

const temps = { sessions: [], lisible: false, arret: null, minuterie: null };

const suivreTemps = (uid) => {
  if (temps.arret) return;
  try {
    temps.arret = onSnapshot(collection(bdd, 'presences', uid, 'sessions'), (inst) => {
      temps.lisible = true;
      temps.sessions = inst.docs.map((d) => ({ id: d.id, ...d.data() }));
      afficherTemps();
    }, () => { temps.lisible = false; afficherTemps(); });
  } catch (e) { temps.lisible = false; }
  temps.minuterie = setInterval(afficherTemps, 15000);
};

/* En millisecondes, pour la campagne ouverte. */
const tempsDonne = () => {
  const c = etat.campagne;
  if (!c) return 0;
  const maintenant = Date.now();
  return temps.sessions.filter((x) => x.campagne === c.id).reduce((total, x) => {
    const debut = enDate(x.debut);
    let fin = enDate(x.vu);
    if (!debut) return total;
    /* La session en cours avance entre deux signes, tant qu'on la regarde. */
    if (x.id === presence.session && document.visibilityState === 'visible') fin = new Date(maintenant);
    return total + Math.max(0, (fin ? fin.getTime() : debut.getTime()) - debut.getTime());
  }, 0);
};

const duree = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  /* Des minutes, pas des secondes : un chronomètre qui défile à la
     seconde met une pression inutile. */
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  return `${m} min`;
};

const afficherTemps = () => {
  document.querySelectorAll('[data-chrono]').forEach((el) => {
    el.textContent = temps.lisible ? duree(tempsDonne()) : '–';
  });
  document.querySelectorAll('[data-chrono-sessions]').forEach((el) => {
    const n = temps.sessions.filter((x) => etat.campagne && x.campagne === etat.campagne.id).length;
    el.textContent = temps.lisible ? `${n} session${n > 1 ? 's' : ''}` : '';
  });
};

/* --------------------------------------------------------------------------
   Les chiffres du testeur, sous la jauge
   -------------------------------------------------------------------------- */

const compter = () => {
  const r = { ok: 0, ko: 0, na: 0, revoir: 0, reste: 0 };
  etat.scenarios.forEach((s) => {
    const p = etat.passages.get(s.ref);
    if (!p) { r.reste += 1; return; }
    if (!fait(s.ref)) { r.revoir += 1; r.reste += 1; return; }
    const k = sorteVerdict(p.resultat);
    if (r[k] !== undefined) r[k] += 1;
  });
  return r;
};

const chiffresHtml = () => {
  const r = compter();
  return `<div class="testeur-chiffres">
    <div class="testeur-chiffre testeur-chiffre--temps"><span>Temps de test</span><b data-chrono>–</b><small data-chrono-sessions></small></div>
    <div class="testeur-chiffre"><span>Réussis</span><b class="t-ok">${r.ok}</b><small>scénarios passés</small></div>
    <div class="testeur-chiffre"><span>Échecs signalés</span><b class="${r.ko + r.revoir ? 't-ko' : ''}">${r.ko + r.revoir}</b><small><a href="#/signalements">Mes signalements</a></small></div>
    <div class="testeur-chiffre"><span>À rejouer</span><b class="${r.revoir ? 't-revoir' : ''}">${r.revoir}</b><small>corrigés par l'équipe</small></div>
  </div>`;
};

/* --------------------------------------------------------------------------
   L'accueil : la première fois, devant tout ; puis à la demande

   Ce qu'il a fait est consigné dans son appréciation de la campagne (le
   document qui porte déjà ses réponses) : l'équipe lit qui a fait ses
   premiers pas, le client le lit sans les noms. Sur un autre appareil, le
   serveur fait foi : l'accueil se referme sans bruit si ce testeur l'a déjà
   parcouru, sauf s'il l'a demandé lui-même.
   -------------------------------------------------------------------------- */

let accueil = null;
/* Ceux qui attendent la fin de l'accueil : la fiche passe après lui. */
let apresAccueil = [];
const accueilFini = () => {
  const attente = apresAccueil; apresAccueil = [];
  attente.forEach((f) => { try { f(); } catch (e) { /* rien */ } });
};
const attendreAccueil = () => (accueil ? new Promise((r) => { apresAccueil.push(r); }) : Promise.resolve());

const consignerAccueil = async (moi) => {
  const c = etat.campagne;
  if (!c || (etat.avis && etat.avis.accueil)) return;
  const uid = auth.currentUser.uid;
  try {
    await setDoc(doc(bdd, 'projets', c.projet, 'campagnes', c.id, 'appreciations', uid),
      { accueil: serverTimestamp(), testeur: uid, maj: serverTimestamp() }, { merge: true });
    etat.avis = { ...(etat.avis || {}), accueil: new Date() };
  } catch (e) { console.warn('[testeur] accueil non consigné', e); }
};

const lancerAccueil = (moi, { demande = false } = {}) => {
  if (accueil) return;
  accueil = ouvrirAccueil({
    moi, campagne: etat.campagne,
    surFin: () => { accueil = null; marquerAccueilVu(moi.uid); consignerAccueil(moi); accueilFini(); },
  });
  accueil.demande = demande;
};

/* Le serveur dit qu'il l'a déjà fait (un autre appareil) : on ne le lui
   impose pas deux fois. Et l'inverse : fait ici, pas encore consigné
   (la campagne n'était pas ouverte à ce moment-là). */
const accorderAccueil = (moi) => {
  const fait = Boolean(etat.avis && etat.avis.accueil);
  if (fait && accueil && !accueil.demande && !accueil.entame) {
    accueil.fermer({ silencieux: true });
    accueil = null;
    marquerAccueilVu(moi.uid);
    accueilFini();
    return;
  }
  if (!fait && !accueil && accueilVu(moi.uid)) consignerAccueil(moi);
};

/* --------------------------------------------------------------------------
   Les astuces : une par visite, une autre à la demande
   -------------------------------------------------------------------------- */

const ASTUCES = [
  'Testez comme un vrai utilisateur pressé : double-cliquez, revenez en arrière, quittez en plein milieu.',
  'Une capture vaut mille mots. Sur iPhone : bouton latéral + volume haut. Sur Android : marche/arrêt + volume bas.',
  'Changez d\'appareil ? Vérifiez la plateforme dans la feuille du scénario : le résultat n\'a pas le même sens sur un iPhone et sur le web.',
  'Un texte coupé, un bouton trop petit, une faute : ce sont des échecs aussi. Signalez-les.',
  'Coupez le réseau quelques secondes pendant un envoi : une application sérieuse doit le dire proprement.',
  'Une case orange est à rejouer : l\'équipe a corrigé ce que vous aviez signalé. Un Réussi ferme la boucle.',
  'Vous hésitez entre Réussi et Échec ? Relisez « Ce qui doit se passer ». Si ce n\'est pas exactement ça, c\'est un échec.',
  'Passez en mode sombre sur votre téléphone et regardez les écrans à nouveau : c\'est là que les contrastes lâchent.',
  'Tournez l\'écran, agrandissez le texte dans les réglages : beaucoup de défauts se cachent là.',
  'Faites des pauses. Un regard frais trouve plus de défauts qu\'un regard fatigué.',
];
let astuce = Math.floor(Math.random() * ASTUCES.length);

const astuceHtml = () => `<aside class="astuce-testeur" aria-label="Astuce">
    <p><b>Astuce.</b> ${echapper(ASTUCES[astuce])}</p>
    <button class="btn btn-fantome btn-petit" type="button" data-astuce-suivante>Une autre</button>
  </aside>`;

/* --------------------------------------------------------------------------
   Les autres pages
   -------------------------------------------------------------------------- */

const LIENS_INSTALLATION = {
  ios: { libelle: 'iPhone', aide: 'Par TestFlight, l\'application de test d\'Apple.', icone: 'apple' },
  android: { libelle: 'Android', aide: 'Par le programme de test du Play Store.', icone: 'android' },
  web: { libelle: 'Web', aide: 'Dans votre navigateur, rien à installer.', icone: 'globe' },
};

const sansCampagne = (titre) => `<div class="page">
  <div class="page-tete"><div><p class="surtitre">Capmedia Test</p><h1>${echapper(titre)}</h1></div></div>
  ${vide({ icone: 'taches', titre: 'Aucune campagne en cours', texte: 'Cette page se remplira dès qu\'une campagne vous est confiée, sans recharger.' })}
</div>`;

/* Ses identifiants de test : les siens, posés par l'équipe dans
   campagnes/{c}/acces/{uid}, que lui seul lit. L'ancien champ commun de la
   campagne sert encore tant que rien n'est posé pour lui. Lus une fois par
   campagne, puis la page se redessine. */
const identifiantsTesteur = { cle: '', valeur: '' };
const chargerIdentifiants = async (moi) => {
  const c = etat.campagne;
  const cle = `${c.projet}/${c.id}`;
  if (identifiantsTesteur.cle === cle) return;
  identifiantsTesteur.cle = cle;
  identifiantsTesteur.valeur = '';
  try {
    const d = await getDoc(doc(bdd, 'projets', c.projet, 'campagnes', c.id, 'acces', auth.currentUser.uid));
    identifiantsTesteur.valeur = d.exists() ? String(d.data().identifiants || '') : '';
  } catch (e) { identifiantsTesteur.valeur = ''; }
  if (identifiantsTesteur.valeur && courant().chemin === '/application') rendre(moi);
};

const pageApplication = (moi) => {
  filAriane([{ libelle: 'L\'application' }]);
  const c = etat.campagne;
  if (!c) { racine.innerHTML = sansCampagne('L\'application'); return; }
  chargerIdentifiants(moi);
  const identifiants = (identifiantsTesteur.cle === `${c.projet}/${c.id}` && identifiantsTesteur.valeur) || (c.acces && c.acces.identifiants) || '';
  /* Seules les adresses https deviennent des boutons. */
  const liens = Object.fromEntries(Object.entries(c.installation || {}).filter(([, u]) => /^https:\/\/[^\s"'<>]+$/.test(String(u || ''))));
  const builds = c.builds || {};
  const plateformes = Object.keys(LIENS_INSTALLATION).filter((k) => liens[k] || builds[k]);
  racine.innerHTML = `<div class="page">
    <div class="page-tete"><div><p class="surtitre">Ce que vous testez</p><h1>${echapper(c.application || c.titre || 'L\'application')}</h1>
      <p class="chapo">${echapper(c.titre || '')}${c.fin ? ` · jusqu'au ${echapper(enDate(c.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}` : ''}</p></div></div>
    <section>
      <div class="section-tete"><h2>À quoi elle sert</h2></div>
      ${c.presentation ? `<div class="prose">${echapper(c.presentation).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}</div>`
        : '<p class="t-2">L\'équipe Capmedia n\'a pas encore écrit la présentation. Découvrez-la comme un nouvel utilisateur : c\'est justement ce regard-là qui compte.</p>'}
    </section>
    <section>
      <div class="section-tete"><h2>L'installer</h2></div>
      ${plateformes.length ? `<div class="installations">${plateformes.map((k) => {
        const f = LIENS_INSTALLATION[k];
        return `<div class="installation">
          <span class="installation-icone">${icone(f.icone)}</span>
          <div class="installation-texte"><b>${f.libelle}</b><span>${f.aide}${builds[k] ? ` Version ${echapper(builds[k])}.` : ''}</span></div>
          ${liens[k] ? `<a class="btn btn-principal btn-petit" href="${echapper(liens[k])}" target="_blank" rel="noopener">${k === 'web' ? 'Ouvrir' : 'Installer'}</a>` : '<span class="t-3 t-petit">Lien envoyé par e-mail</span>'}
        </div>`;
      }).join('')}</div>` : '<p class="t-2">Le lien d\'installation vous arrive par e-mail. Si rien n\'est arrivé, écrivez à l\'équipe.</p>'}
    </section>
    ${((c.acces && c.acces.instructions) || identifiants) ? `<section>
      <div class="section-tete"><h2>Pour entrer dans l'application</h2></div>
      ${(c.acces && c.acces.instructions) ? `<div class="prose">${echapper(c.acces.instructions).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
      ${identifiants ? `<div class="identifiants-test">
        <p class="surtitre">Vos identifiants de test</p>
        <pre class="identifiants-bloc" id="identifiants-bloc">${echapper(identifiants)}</pre>
        <div class="actions"><button class="btn btn-secondaire btn-petit" type="button" data-copier-identifiants>${icone('copier')} Copier</button></div>
        <p class="aide">Ce sont des comptes de test : rien de réel n'y passe. Ne les partagez pas.</p>
      </div>` : ''}
    </section>` : ''}
    <section>
      <div class="section-tete"><h2>Ce qu'on attend de vous</h2></div>
      ${c.consignes ? `<div class="prose">${echapper(c.consignes).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}</div>`
        : `<ul class="liste-points"><li>Dérouler les scénarios qui vous sont confiés, dans l'ordre.</li><li>Signaler chaque échec avec ce que vous avez vu et une capture.</li><li>Donner votre avis au début et à la fin : c'est lui qui dit si l'application plaît.</li></ul>`}
    </section>
    ${aTermine() ? magasinsHtml() : ''}
  </div>`;
  const copier = $('[data-copier-identifiants]');
  if (copier) copier.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(($('#identifiants-bloc') || {}).textContent || ''); toast('Identifiants copiés.'); }
    catch (e) { toast('La copie a échoué : sélectionnez le texte.', 'erreur'); }
  });
};

const pageSignalements = (moi) => {
  filAriane([{ libelle: 'Mes signalements' }]);
  if (!etat.campagne) { racine.innerHTML = sansCampagne('Mes signalements'); return; }
  const echecs = etat.scenarios
    .map((s) => ({ s, p: etat.passages.get(s.ref) }))
    .filter((x) => x.p && estEchec(x.p.resultat))
    .sort((a, b) => ((enDate(b.p.le) || 0) - (enDate(a.p.le) || 0)));
  const aRejouer = echecs.filter((x) => x.p.aRevoir === true).length;
  racine.innerHTML = `<div class="page">
    <div class="page-tete"><div><p class="surtitre">Mon travail</p><h1>Mes signalements</h1>
      <p class="chapo">${echecs.length ? `<b>${echecs.length}</b> échec${echecs.length > 1 ? 's' : ''} signalé${echecs.length > 1 ? 's' : ''}${aRejouer ? `, dont <b>${aRejouer}</b> corrigé${aRejouer > 1 ? 's' : ''} à rejouer` : ''}.` : 'Aucun échec signalé pour l\'instant.'}</p></div></div>
    ${echecs.length ? `<div class="liste">${echecs.map(({ s, p }) => `
      <button class="ligne" type="button" data-case="${echapper(s.ref)}">
        <span class="ligne-icone ligne-icone--${p.aRevoir ? 'ambre' : 'rouge'}">${icone(p.aRevoir ? 'restaurer' : 'alerte')}</span>
        <span class="ligne-corps"><span class="ligne-titre"><span class="ref">${echapper(s.ref)}</span> ${echapper(s.titre)}</span>
          <span class="ligne-sous">${p.commentaire ? `« ${echapper(p.commentaire.slice(0, 140))}${p.commentaire.length > 140 ? '…' : ''} »` : ''}${enDate(p.le) ? ` · ${echapper(enDate(p.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}` : ''}</span></span>
        <span class="ligne-fin">${p.aRevoir ? '<span class="pastille pastille--ambre">Corrigé, à rejouer</span>' : '<span class="pastille pastille--rouge">Transmis à l\'équipe</span>'}</span>
      </button>`).join('')}</div>`
      : vide({ icone: 'check', titre: 'Rien à signaler', texte: 'Quand un scénario échoue, il arrive ici avec la suite que l\'équipe lui donne.', compact: true })}
  </div>`;
  void moi;
};

const pageAvis = (moi) => {
  filAriane([{ libelle: 'Mon avis' }]);
  if (!etat.campagne) { racine.innerHTML = sansCampagne('Mon avis'); return; }
  const a = etat.avis || {};
  const avantFait = Object.keys(a).some((k) => k.startsWith('impression.'));
  const apresFait = Object.keys(a).some((k) => k.startsWith('esthetique.'));
  const note = Object.entries(a).find(([k]) => k.endsWith('.recommande'));
  const r = compter();
  const total = etat.scenarios.length;
  racine.innerHTML = `<div class="page">
    <div class="page-tete"><div><p class="surtitre">Mon travail</p><h1>Mon avis</h1>
      <p class="chapo">Les scénarios disent si l'application marche. Votre avis dit si elle plaît.</p></div></div>
    <div class="avis-moments">
      <section class="avis-moment">
        <p class="surtitre">Avant de commencer</p>
        <h2>Première impression</h2>
        <p class="t-2">Deux minutes, en découvrant l'application. Ce regard-là ne se retrouve pas ensuite.</p>
        <div class="avis-moment-pied">${avantFait ? '<span class="pastille pastille--vert">Donnée, merci</span>' : '<span class="pastille pastille--ambre">À donner</span>'}
          <button class="btn ${avantFait ? 'btn-secondaire' : 'btn-principal'} btn-petit" type="button" data-avis-page="avant">${avantFait ? 'Revoir' : 'Donner ma première impression'}</button></div>
      </section>
      <section class="avis-moment">
        <p class="surtitre">À la fin</p>
        <h2>Votre avis sur l'application</h2>
        <p class="t-2">L'esthétique, la facilité, l'utilité, et votre note sur 10. ${total ? `Vous en êtes à ${total - r.reste} scénarios sur ${total}.` : ''}</p>
        <div class="avis-moment-pied">${apresFait ? '<span class="pastille pastille--vert">Donné, merci</span>' : '<span class="pastille pastille--gris">À la fin de la campagne</span>'}
          <button class="btn ${apresFait ? 'btn-secondaire' : 'btn-principal'} btn-petit" type="button" data-avis-page="apres">${apresFait ? 'Revoir' : 'Donner mon avis'}</button></div>
      </section>
    </div>
    ${note ? `<section class="avis-note"><p class="surtitre">Votre note</p><p class="avis-note-valeur">${echapper(String(note[1]))}<small>/10</small></p><p class="t-2">Vous recommanderiez l'application à ce niveau. Vous pouvez la changer en revoyant votre avis.</p></section>` : ''}
  </div>`;
  void moi;
};

const pageGuide = () => {
  filAriane([{ libelle: 'Guide du testeur' }]);
  racine.innerHTML = `<div class="page page--guide">
    <div class="page-tete"><div><p class="surtitre">Capmedia Test</p><h1>Guide du testeur</h1>
      <p class="chapo">Tout ce qu'il faut savoir pour une campagne utile, en cinq minutes de lecture.</p></div>
      <div class="actions"><button class="btn btn-secondaire" type="button" data-accueil="revoir">Revoir les premiers pas</button></div></div>
    <section>
      <div class="section-tete"><h2>Le déroulé d'une campagne</h2></div>
      <ol class="guide-etapes">
        <li><b>Installez l'application.</b> La page <a href="#/application">L'application</a> donne le lien pour votre appareil.</li>
        <li><b>Vérifiez sur quoi vous testez.</b> iPhone, Android ou Web : la feuille de chaque scénario le dit. Changez-le si vous changez d'appareil.</li>
        <li><b>Donnez votre première impression</b>, avant de toucher à quoi que ce soit.</li>
        <li><b>Déroulez vos scénarios, dans l'ordre.</b> « Continuer », en tête de votre campagne, ouvre celui qui vous attend : lisez ce qui doit se passer, faites-le, et dites ce que vous avez obtenu. Le suivant s'ouvre aussitôt ; fermez la feuille pour faire une pause.</li>
        <li><b>Rejouez les cases orange.</b> L'équipe a corrigé ce que vous aviez signalé : votre Réussi ferme la boucle.</li>
        <li><b>Terminez, et donnez votre avis.</b> Le bouton apparaît quand tout est déroulé et rejoué : il transmet votre bilan à l'équipe, fige vos résultats, puis vous demande ce que vous pensez de l'application. Vous gardez sept jours pour ajouter une remarque.</li>
      </ol>
    </section>
    <section>
      <div class="section-tete"><h2>Réussi, Échec ou Sans objet</h2></div>
      <dl class="guide-verdicts">
        <div><dt><span class="pastille pastille--vert">Réussi</span></dt><dd>Ce qui devait se passer s'est passé, exactement.</dd></div>
        <div><dt><span class="pastille pastille--rouge">Échec</span></dt><dd>Autre chose s'est passé, ou rien du tout. Décrivez-le et joignez une capture : sans elle, l'échec ne peut pas être enregistré.</dd></div>
        <div><dt><span class="pastille pastille--gris">Sans objet</span></dt><dd>Le scénario ne s'applique pas à votre appareil (une fonction propre à l'iPhone, par exemple).</dd></div>
      </dl>
    </section>
    <section>
      <div class="section-tete"><h2>Écrire un bon signalement</h2></div>
      <ul class="liste-points">
        <li>Ce que vous avez fait, pas à pas : « J'ai touché Valider, puis Retour ».</li>
        <li>Ce que vous avez vu : « La fenêtre reste ouverte, rien ne se passe ».</li>
        <li>Une capture ou une courte vidéo : c'est elle qui permet de reproduire.</li>
        <li>Ce que vous avez vu, pas ce que vous en pensez : l'équipe cherche la cause.</li>
      </ul>
    </section>
    <section>
      <div class="section-tete"><h2>Votre temps</h2></div>
      <p>Le chronomètre additionne vos sessions sur la campagne : il avance quand la page est ouverte, et une absence de plus d'une demi-heure ouvre une nouvelle session. Vous pouvez vous arrêter à tout moment, rien n'est perdu.</p>
    </section>
    <section>
      <div class="section-tete"><h2>Toutes les astuces</h2></div>
      <ul class="liste-points">${ASTUCES.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>
    </section>
  </div>`;
};

/* Le rail : les pages, et ce qui attend sur chacune. */
const majNavigation = () => {
  const r = compter();
  const c = etat.campagne;
  const a = etat.avis || {};
  const avisDus = c ? (!Object.keys(a).some((k) => k.startsWith('impression.')) ? 1 : 0)
    + (etat.scenarios.length && !r.reste && !Object.keys(a).some((k) => k.startsWith('esthetique.')) ? 1 : 0) : 0;
  definirNavigation([
    { items: [{ chemin: '/', libelle: 'Ma campagne', icone: 'taches', exact: true, compte: c ? { total: r.reste } : 0 }] },
    {
      titre: 'Découvrir',
      items: [
        { chemin: '/application', libelle: 'L\'application', icone: 'composants' },
        { chemin: '/guide', libelle: 'Guide du testeur', icone: 'ampoule' },
      ],
    },
    {
      titre: 'Mon travail',
      items: [
        { chemin: '/signalements', libelle: 'Mes signalements', icone: 'alerte', compte: { total: r.ko + r.revoir, neuf: r.revoir } },
        { chemin: '/avis', libelle: 'Mon avis', icone: 'coeur', compte: { total: 0, neuf: avisDus } },
      ],
    },
  ]);
  definirEtat(etatAcces());
};

/* La bulle vers l'équipe, montée une fois l'espace prêt. L'adresse
   « /messages » (celle des notifications et des e-mails) l'ouvre. */
let bulle = null;

const PAGES = {
  '/': (moi) => { filAriane([{ libelle: 'Ma campagne' }]); pageCampagne(moi); },
  '/application': pageApplication,
  '/signalements': pageSignalements,
  '/avis': pageAvis,
  '/guide': pageGuide,
  '/messages': (moi) => { if (bulle) bulle.ouvrir(); naviguer('/'); void moi; },
};

const rendre = (moi) => {
  const chemin = courant().chemin;
  (PAGES[chemin] || PAGES['/'])(moi);
  majNavigation();
  afficherTemps();
};

/* --------------------------------------------------------------------------
   Consigner un résultat
   -------------------------------------------------------------------------- */

/* Un échec sans preuve n'est pas un rapport, c'est une opinion. Les règles
   le refusent côté serveur ; on le dit ici pour que le testeur le sache
   AVANT d'avoir tout tapé, et non par un message d'erreur après coup. */
/* Trois captures au plus : un écran, l'écran d'avant, une vidéo. Les
   règles en acceptent cinq ; trois suffisent à reproduire. */
const PREUVES_MAX = 3;
/* Ce que les règles du dossier des preuves acceptent : des images et des
   vidéos courantes, 10 Mo une image, 50 Mo une vidéo. Refusé ici, avec
   la raison, plutôt qu'au milieu de l'envoi. */
const TYPES_PREUVE = /^(image\/(png|jpeg|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;
const refusPreuve = (f) => {
  if (!TYPES_PREUVE.test(f.type || '')) return `« ${f.name} » : une capture (PNG, JPEG, WebP, HEIC) ou une vidéo (MP4, MOV, WebM), s'il vous plaît.`;
  const plafond = /^video\//.test(f.type) ? 50 : 10;
  if (f.size > plafond * 1024 * 1024) return `« ${f.name} » dépasse ${plafond} Mo.`;
  return '';
};

/* Sur un téléphone, le testeur teste l'application sur ce même appareil :
   il fait sa capture, revient ici et la retrouve dans ses photos. On le
   lui dit avec les gestes de SON appareil. */
const aideCapture = () => {
  const ici = plateformeAppareil();
  if (ici === 'ios') return 'Sur iPhone : bouton latéral et volume haut ensemble, revenez ici, touchez « Ajouter une capture », puis Photothèque.';
  if (ici === 'android') return 'Sur Android : marche/arrêt et volume bas ensemble, revenez ici, touchez « Ajouter une capture », puis choisissez-la dans vos photos.';
  return 'Une capture d\'écran ou une courte vidéo de ce que vous avez vu.';
};

const ouvrirEchec = (s) => {
  const m = modale({
    titre: s.titre, sousTitre: `${s.ref} · vous avez constaté un échec`, feuille: true,
    corps: `
      <div class="groupe"><span class="etiquette-champ">Ce qui était attendu</span>
        <p class="t-corps">${echapper(s.attendu || '')}</p></div>
      <div class="groupe">
        <label class="etiquette-champ" for="t-quoi">Qu'est-ce qui s'est passé&nbsp;?</label>
        <textarea class="champ" id="t-quoi" rows="4" placeholder="Rien ne se passe quand j'appuie sur Valider. La fenêtre reste ouverte."></textarea>
        <p class="aide">Décrivez ce que vous avez vu, pas ce que vous en pensez. « Rien ne se passe » est une réponse utile.</p>
      </div>
      <div class="groupe">
        <span class="etiquette-champ">Vos captures</span>
        <div class="t-preuves" data-preuves></div>
        <p class="aide">${echapper(aideCapture())} Sans capture, l'échec ne peut pas être enregistré : c'est elle qui permet de reproduire.</p>
        <p class="aide" id="t-envoi" aria-live="polite"></p>
      </div>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-valider>Enregistrer l\'échec</button>',
  });

  /* Les pièces choisies, avec leur vignette. Le vrai champ fichier est
     caché sous le bouton « Ajouter une capture » : le contrôle natif dit
     « Aucun fichier choisi » et ne montre rien de ce qui a été pris. */
  const pieces = [];
  const zone = m.el.querySelector('[data-preuves]');
  const dessiner = () => {
    zone.innerHTML = `${pieces.map((x, i) => `<div class="t-preuve">
        ${x.apercu ? `<img src="${echapper(x.apercu)}" alt="">` : `<span class="t-preuve-video">${icone('video')}</span>`}
        <span class="t-preuve-nom">${echapper(x.fichier.name)}</span>
        <button class="btn-icone t-preuve-retirer" type="button" data-retirer-preuve="${i}" aria-label="Retirer ${echapper(x.fichier.name)}">${icone('fermer')}</button>
      </div>`).join('')}
      ${pieces.length < PREUVES_MAX ? `<label class="t-preuve-ajout">
        <input class="t-preuve-fichier" id="t-preuve" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" multiple>
        ${icone('plus')}<span>${pieces.length ? 'Ajouter une autre capture' : 'Ajouter une capture'}</span>
      </label>` : ''}`;
  };
  dessiner();
  zone.addEventListener('change', (e) => {
    if (!e.target.matches('.t-preuve-fichier')) return;
    const tous = [...(e.target.files || [])];
    const refus = tous.map(refusPreuve).filter(Boolean);
    if (refus.length) toast(refus[0], 'erreur');
    const choisis = tous.filter((f) => !refusPreuve(f));
    const place = PREUVES_MAX - pieces.length;
    choisis.slice(0, place).forEach((fichier) => {
      let apercu = '';
      if (/^image\//.test(fichier.type)) { try { apercu = URL.createObjectURL(fichier); } catch (err) { apercu = ''; } }
      pieces.push({ fichier, apercu });
    });
    if (choisis.length > place) toast(`Trois captures au plus : ${place ? `les ${place} premières sont gardées` : 'retirez-en une d\'abord'}.`, 'info');
    dessiner();
  });
  zone.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer-preuve]');
    if (!b) return;
    const [x] = pieces.splice(Number(b.dataset.retirerPreuve), 1);
    if (x && x.apercu) { try { URL.revokeObjectURL(x.apercu); } catch (err) { /* rien */ } }
    dessiner();
  });
  m.fin.then(() => pieces.forEach((x) => { if (x.apercu) { try { URL.revokeObjectURL(x.apercu); } catch (err) { /* rien */ } } }));

  const bouton = m.el.querySelector('[data-valider]');
  bouton.addEventListener('click', () => agir(bouton, async () => {
    const quoi = ($('#t-quoi', m.el).value || '').trim();
    if (!quoi) { toast('Dites ce qui s\'est passé.', 'erreur'); return; }
    if (!pieces.length) { toast('Ajoutez une capture : sans elle, l\'échec ne peut pas être enregistré.', 'erreur'); return; }
    const echo = $('#t-envoi', m.el);
    const chemins = [];
    for (let i = 0; i < pieces.length; i += 1) {
      try {
        const piece = await envoyerPiece(pieces[i].fichier, `campagnes/${etat.campagne.projet}/${etat.campagne.id}/${auth.currentUser.uid}`,
          (n) => { echo.textContent = pieces.length > 1 ? `Envoi de la capture ${i + 1} sur ${pieces.length} · ${n} %` : `Envoi ${n} %`; });
        chemins.push(piece.chemin);
      } catch (e) { echo.textContent = ''; toast(String(e.message || e), 'erreur'); return; }
    }
    m.fermer({ commentaire: quoi, preuves: chemins });
  }));
  return m.fin;
};

const poser = async (s, resultat, moi) => {
  if (aTermine()) { toast('Le test est terminé : vos résultats sont figés.', 'erreur'); return; }
  if (!ouvrable(s.ref)) { toast('Les scénarios se suivent : déroulez d\'abord le précédent.', 'info'); return; }
  if (!plateformeDe(s)) { toast('Dites d\'abord sur quoi vous testez.', 'erreur'); return; }
  let extra = { commentaire: '', preuves: [] };
  if (estEchec(resultat)) {
    const rep = await ouvrirEchec(s);
    if (!rep) return;
    extra = rep;
  }

  /* L'identifiant porte l'uid : c'est lui qui rend le cloisonnement
     opposable avant service, et les règles l'exigent tel quel. */
  const uid = auth.currentUser.uid;
  const chemin = `projets/${etat.campagne.projet}/campagnes/${etat.campagne.id}/passages/${uid}__${s.ref}`;
  const passage = {
    scenario: s.ref, testeur: uid, plateforme: plateformeDe(s), resultat,
    commentaire: extra.commentaire, preuves: extra.preuves,
    contexte: contexteAppareil(), le: serverTimestamp(),
  };
  try {
    await setDoc(doc(bdd, chemin), passage);
    etat.passages.set(s.ref, passage);
    rendre(moi);
    if (estEchec(resultat)) toast('Échec enregistré, merci. On le reproduit de notre côté.');
    return true;
  } catch (e) {
    console.error(e);
    toast("Ce résultat n'a pas pu être enregistré. Réessayez.", 'erreur');
    return false;
  }
};

/* --------------------------------------------------------------------------
   Le questionnaire d'appréciation
   -------------------------------------------------------------------------- */

/* Les 173 scénarios disent si l'application marche. Ceci dit si elle
   plaît, et c'est la seconde question qui décide du chiffre d'affaires. */
const champAvis = (q, valeur) => {
  const id = `av-${q.cle}`;
  const v = valeur === undefined ? '' : valeur;
  if (q.type === 'echelle') {
    return `<div class="groupe">
      <span class="etiquette-champ">${echapper(q.libelle)}</span>
      <div class="avis-echelle" role="group">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="avis-cran" data-avis="${q.cle}" data-valeur="${n}" aria-pressed="${String(v) === String(n)}">${n}</button>`).join('')}
      </div>
      <div class="rang avis-bornes"><span>${echapper(q.bas || '')}</span><span>${echapper(q.haut || '')}</span></div>
    </div>`;
  }
  if (q.type === 'note10') {
    return `<div class="groupe">
      <span class="etiquette-champ">${echapper(q.libelle)}</span>
      <div class="avis-echelle avis-echelle--large" role="group">
        ${Array.from({ length: 11 }, (_, n) => `<button type="button" class="avis-cran" data-avis="${q.cle}" data-valeur="${n}" aria-pressed="${String(v) === String(n)}">${n}</button>`).join('')}
      </div>
      ${q.aide ? `<p class="aide">${echapper(q.aide)}</p>` : ''}
    </div>`;
  }
  if (q.type === 'choix') {
    return `<div class="groupe">
      <span class="etiquette-champ">${echapper(q.libelle)}</span>
      <div class="rang" style="gap:8px;flex-wrap:wrap">
        ${(q.options || []).map((o) => `<button type="button" class="avis-choix" data-avis="${q.cle}" data-valeur="${echapper(o)}" aria-pressed="${v === o}">${echapper(o)}</button>`).join('')}
      </div>
    </div>`;
  }
  if (q.type === 'euros') {
    return `<div class="groupe">
      <label class="etiquette-champ" for="${id}">${echapper(q.libelle)}</label>
      <div class="rang" style="gap:8px;align-items:center">
        <input class="champ" id="${id}" data-avis-champ="${q.cle}" type="number" min="0" step="0.5" inputmode="decimal" value="${echapper(String(v))}" style="max-width:140px">
        <span class="t-2">€ par mois</span>
      </div>
    </div>`;
  }
  return `<div class="groupe">
    <label class="etiquette-champ" for="${id}">${echapper(q.libelle)}</label>
    <textarea class="champ" id="${id}" data-avis-champ="${q.cle}" rows="3">${echapper(String(v))}</textarea>
  </div>`;
};

const ouvrirAvis = async (moi, quand) => {
  const uid = auth.currentUser.uid;
  const chemin = `projets/${etat.campagne.projet}/campagnes/${etat.campagne.id}/appreciations/${uid}`;
  let deja = {};
  try { const d = await getDoc(doc(bdd, chemin)); if (d.exists()) deja = d.data(); } catch (e) { /* première fois */ }

  const familles = Object.entries(FAMILLES_AVIS).filter(([, f]) => f.quand === quand);
  const reponses = { ...deja };

  const m = modale({
    titre: quand === 'avant' ? 'Avant de commencer' : 'Votre avis sur l\'application',
    sousTitre: quand === 'avant'
      ? 'Deux minutes. Ce regard-là ne se retrouve pas ensuite.'
      : 'Les scénarios disent si ça marche. Ceci dit si ça plaît.',
    feuille: true,
    corps: familles.map(([cle, f]) => `
      <section class="avis-famille">
        <h3 class="bloc-tete">${echapper(f.libelle)}</h3>
        ${f.aide ? `<p class="aide" style="margin-bottom:14px">${echapper(f.aide)}</p>` : ''}
        ${f.questions.map((q) => champAvis(q, deja[`${cle}.${q.cle}`])).join('')}
      </section>`).join(''),
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Plus tard</button><button class="btn btn-principal" type="button" data-envoyer>Enregistrer</button>',
  });

  /* Les boutons d'échelle et de choix tiennent leur valeur dans l'écran :
     ils ne sont pas des champs de formulaire, et « lireForme » ne les
     verrait pas. */
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avis]');
    if (!b) return;
    const famille = familles.find(([, f]) => f.questions.some((q) => q.cle === b.dataset.avis));
    if (!famille) return;
    reponses[`${famille[0]}.${b.dataset.avis}`] = b.dataset.valeur;
    m.el.querySelectorAll(`[data-avis="${b.dataset.avis}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  const envoyer = m.el.querySelector('[data-envoyer]');
  envoyer.addEventListener('click', () => agir(envoyer, async () => {
    m.el.querySelectorAll('[data-avis-champ]').forEach((ch) => {
      const famille = familles.find(([, f]) => f.questions.some((q) => q.cle === ch.dataset.avisChamp));
      if (!famille) return;
      const v = (ch.value || '').trim();
      if (v) reponses[`${famille[0]}.${ch.dataset.avisChamp}`] = v;
    });
    /* Fusionné, pas remplacé : les deux moments écrivent dans le même
       document, et enregistrer l'après effacerait l'avant. */
    try {
      await setDoc(doc(bdd, chemin), { ...reponses, testeur: uid, maj: serverTimestamp() }, { merge: true });
      etat.avis = reponses;
      toast('Merci, votre avis est enregistré.');
      m.fermer(true);
    } catch (e) {
      console.error(e);
      toast("Votre avis n'a pas pu être enregistré. Réessayez.", 'erreur');
    }
  }));
  return m.fin;
};

/* --------------------------------------------------------------------------
   La présence

   L'équipe voit qui est là, depuis quand, sur quel scénario, et combien de
   temps chacun a passé. Un signe toutes les trente secondes tant que la
   page est visible ; les dates sont celles du serveur, les règles refusent
   toute autre. Personne d'autre ne lit ces documents : ni le client, ni
   les autres testeurs.
   -------------------------------------------------------------------------- */

const SIGNE_MS = 30000;
/* Une absence de plus d'une demi-heure ouvre une nouvelle session : on ne
   compte pas une pause déjeuner comme du temps de test. */
const PAUSE_MS = 30 * 60000;

const presence = {
  uid: '', session: '', scenario: '', minuterie: null, cache: 0, lancee: false, campagneVue: undefined,
};

const nouvelleSession = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const ouvrirSession = async () => {
  presence.session = nouvelleSession();
  const c = etat.campagne || {};
  const base = { campagne: c.id || '', projet: c.projet || '', plateforme: plateformeCourante || '' };
  try {
    await setDoc(doc(bdd, 'presences', presence.uid), {
      ...base, scenario: presence.scenario, vue: vueCourante, session: presence.session,
      debut: serverTimestamp(), vu: serverTimestamp(), enLigne: true,
    });
    await setDoc(doc(bdd, 'presences', presence.uid, 'sessions', presence.session), {
      ...base, agent: String(navigator.userAgent || '').slice(0, 300), debut: serverTimestamp(), vu: serverTimestamp(),
    });
    presence.lancee = true;
  } catch (e) { console.warn('[presence] session non ouverte', e); }
};

const signe = async (enLigne = true) => {
  if (!presence.uid) return;
  if (!presence.lancee) { if (enLigne) await ouvrirSession(); return; }
  const c = etat.campagne || {};
  try {
    await updateDoc(doc(bdd, 'presences', presence.uid), {
      campagne: c.id || '', projet: c.projet || '', plateforme: plateformeCourante || '',
      scenario: enLigne ? presence.scenario : '', vue: vueCourante, vu: serverTimestamp(), enLigne,
    });
    await updateDoc(doc(bdd, 'presences', presence.uid, 'sessions', presence.session), {
      vu: serverTimestamp(), plateforme: plateformeCourante || '',
    });
  } catch (e) { console.warn('[presence] signe perdu', e); }
};

/* Ce qu'il regarde en ce moment : l'équipe voit la case pulser. */
const regarder = (ref) => {
  if (presence.scenario === ref) return;
  presence.scenario = ref || '';
  signe(true);
};

const demarrerPresence = (uid) => {
  presence.uid = uid;
  ouvrirSession();
  presence.minuterie = setInterval(() => { if (document.visibilityState === 'visible') signe(true); }, SIGNE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { presence.cache = Date.now(); signe(false); return; }
    if (presence.cache && Date.now() - presence.cache > PAUSE_MS) { presence.lancee = false; ouvrirSession(); }
    else signe(true);
    presence.cache = 0;
  });
  window.addEventListener('pagehide', () => { signe(false); });
};

/* --------------------------------------------------------------------------
   La feuille d'un scénario, depuis le tableau
   -------------------------------------------------------------------------- */

/* `apres` : le scénario qu'il vient de rendre, quand cette feuille
   s'enchaîne sur la précédente. Elle le lui confirme en une ligne. */
const ouvrirFeuille = (s, moi, { apres = null } = {}) => {
  const p = etat.passages.get(s.ref);
  const v = tableauTesteur({ scenarios: [s], passages: etat.passages }).familles[0].cases[0].etat;
  const fige = aTermine();
  const rang = etat.scenarios.findIndex((x) => x.ref === s.ref) + 1;
  regarder(s.ref);
  /* À rejouer après la fin : ses résultats sont figés, il ne peut plus
     rien poser. On ne lui demande donc pas de le refaire. */
  const alerte = v !== 'revoir' ? ''
    : fige ? '<section class="fs-bloc fs-bloc--alerte"><p class="fs-bloc-sur">Corrigé par l\'équipe</p><p>L\'équipe a corrigé ce que vous aviez signalé. Votre test est terminé : elle le fait vérifier de son côté, vous n\'avez rien à refaire.</p></section>'
      : '<section class="fs-bloc fs-bloc--alerte"><p class="fs-bloc-sur">À rejouer</p><p>L\'équipe a corrigé ce que vous aviez signalé. Refaites-le : un Réussi ferme la boucle, un nouvel Échec la rouvre.</p></section>';
  const plateforme = plateformeImposee(s)
    ? `<p class="fs-plateforme">À faire sur <strong>${echapper(PLATEFORMES_TESTEUR[s.plateforme] || s.plateforme)}</strong></p>`
    : fige ? '' : choixPlateformeHtml({ dansFeuille: true });
  const m = modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || ''}${rang ? ` · ${rang} sur ${etat.scenarios.length}` : ''}`, scenario: true,
    corps: `
      ${apres ? `<p class="fs-enchaine">${echapper(apres.s.ref)} enregistré : ${echapper((VERDICTS_TESTEUR[apres.resultat] || {}).libelle || '')}. Voici le suivant.</p>` : ''}
      ${alerte}
      ${p && v !== 'revoir' ? `<div class="fs-etat">${pastille(VERDICTS_TESTEUR, p.resultat)}<span class="t-2 t-petit">Votre résultat${p.commentaire ? ` · ${echapper(p.commentaire)}` : ''}.${fige ? '' : ' Vous pouvez vous corriger.'}</span></div>` : ''}
      ${s.options ? `<section class="fs-bloc"><p class="fs-bloc-sur">Ce qu'il faut faire</p><p>${echapper(s.options).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p></section>` : ''}
      <section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${echapper(s.attendu || '')}</p></section>
      ${plateforme}
      <p class="fs-note">${fige ? '<strong>Le test est terminé</strong> : ce résultat est figé.' : 'Un scénario où rien ne se passe est un échec, jamais une réussite.'}</p>
      ${apres && !fige ? '<p class="fs-note"><button class="lien-sobre" type="button" data-fermer>Faire une pause</button> : tout est enregistré, « Continuer » vous ramènera ici.</p>' : ''}`,
    pied: fige
      ? '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>'
      : Object.keys(RESULTATS_PASSAGE).map((cle) => `<button type="button" class="fs-verdict fs-verdict--${sorteVerdict(cle)}" data-feuille-poser="${cle}" aria-pressed="${Boolean(p) && p.resultat === cle}"><i aria-hidden="true"></i>${(VERDICTS_TESTEUR[cle] || {}).libelle || cle}</button>`).join(''),
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-feuille-poser]');
    if (!b) return;
    const resultat = b.dataset.feuillePoser;
    if (!plateformeDe(s)) { toast('Dites d\'abord sur quoi vous le faites : iPhone, Android ou Web.', 'erreur'); return; }
    m.fermer(true);
    const pose = await poser(s, resultat, moi);
    if (pose) enchainer(s, resultat, moi);
  });
  m.fin.then(() => regarder(''));
};

/* Après un résultat, le scénario suivant s'ouvre tout seul : c'est le
   geste qu'il fera des dizaines de fois. Fermer la feuille, c'est la
   pause. Quand il n'en reste plus, la page montre la fin. */
const enchainer = (s, resultat, moi) => {
  if (aTermine()) return;
  const suivant = aFaire();
  if (!suivant || suivant.ref === s.ref) {
    if (!suivant) toast('Tout est déroulé. Il reste à le dire, en tête de page.', 'info');
    return;
  }
  ouvrirFeuille(suivant, moi, { apres: { s, resultat } });
};

/* --------------------------------------------------------------------------
   Le montage

   Tout arrive en direct : la campagne qui passe « en cours », une
   affectation qui change, un KO que l'équipe marque « à rejouer ». Un
   testeur n'a jamais à recharger sa page.
   -------------------------------------------------------------------------- */

const ecoutes = { campagnes: [], campagne: [] };
const couper = (liste) => liste.splice(0).forEach((f) => { try { f(); } catch (e) { /* rien */ } });

const suivreCampagne = (moi, c, redessiner) => {
  couper(ecoutes.campagne);
  etat.campagne = c;
  etat.passages = new Map();
  etat.avis = null;
  if (!c) { etat.scenarios = []; if (accueil) accueil.majCampagne(null); redessiner(); return; }

  const pid = c.projet;
  /* Ses scénarios à lui : ceux que l'affectation lui a confiés, et non
     toute la campagne. Un testeur qui verrait les 173 ne saurait plus
     lesquels sont les siens. */
  const miens = () => new Set((c.affectation || {})[moi.uid] || c.scenarios || []);
  /* Les scénarios et les passages arrivent chacun de leur côté : la page
     ne se dessine qu'une fois les deux là, sinon elle apparaissait vide
     puis pleine, comme chargée deux fois. */
  const recu = { scenarios: false, passages: false };
  const dessinerSiComplet = () => { if (recu.scenarios && recu.passages) redessiner(); };
  ecoutes.campagne.push(onSnapshot(collection(bdd, 'projets', pid, 'scenarios'), (inst) => {
    const m = miens();
    etat.scenarios = inst.docs.map((d) => ({ ref: d.id, ...d.data() }))
      .filter((x) => x.actif !== false && m.has(x.ref))
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    recu.scenarios = true;
    dessinerSiComplet();
  }, (e) => { console.warn('[testeur] scénarios', e); recu.scenarios = true; dessinerSiComplet(); }));

  ecoutes.campagne.push(onSnapshot(query(collection(bdd, 'projets', pid, 'campagnes', c.id, 'passages'), where('testeur', '==', moi.uid)), (inst) => {
    etat.passages = new Map(inst.docs.map((d) => { const x = d.data(); return [x.scenario, x]; }));
    recu.passages = true;
    dessinerSiComplet();
  }, (e) => { console.warn('[testeur] passages', e); recu.passages = true; dessinerSiComplet(); }));

  getDoc(doc(bdd, 'projets', pid, 'campagnes', c.id, 'appreciations', moi.uid))
    .then((a) => { if (a.exists()) { etat.avis = a.data(); redessiner(); } accorderAccueil(moi); })
    .catch(() => { /* pas encore d'avis */ });
  if (accueil) accueil.majCampagne(c);
};

/* La campagne en cours où ce testeur figure. Les règles ne lui servent
   que celles-là : une requête plus large serait refusée, pas filtrée. */
const ecouterCampagnes = (moi, redessiner) => {
  const parProjet = new Map();
  const choisir = () => {
    const toutes = [...parProjet.values()].flat();
    /* Une campagne dont son accès est passé ne lui est plus servie : les
       règles refusent ses gestes, l'écran n'a pas à la montrer. */
    const accesPasse = (c) => { const f = enDate((c.fins || {})[moi.uid]); return Boolean(f) && f.getTime() <= Date.now(); };
    const enCours = toutes.find((c) => c.statut === 'en-cours' && !accesPasse(c)) || null;
    /* Dans l'application Mac ou Windows : une campagne qui s'ouvre pendant
       que la fenêtre est là devient une notification du système. */
    if (window.capmediaBureau && etat.charge && enCours && (!etat.campagne || etat.campagne.id !== enCours.id)) {
      window.capmediaBureau.notifier({ titre: 'Une campagne de tests vous attend', texte: enCours.titre || 'Vos scénarios sont prêts.', lien: '' });
    }
    etat.charge = true;
    const avant = etat.campagne;
    if (!enCours) { if (avant) suivreCampagne(moi, null, redessiner); else redessiner(); return; }
    const memeAffectation = avant && JSON.stringify((avant.affectation || {})[moi.uid] || []) === JSON.stringify((enCours.affectation || {})[moi.uid] || []);
    if (avant && avant.id === enCours.id && avant.projet === enCours.projet && memeAffectation) {
      etat.campagne = enCours;
      redessiner();
      return;
    }
    suivreCampagne(moi, enCours, redessiner);
  };
  const projets = moi.projets || [];
  if (!projets.length) { etat.charge = true; redessiner(); return; }
  projets.forEach((pid) => {
    ecoutes.campagnes.push(onSnapshot(query(collection(bdd, 'projets', pid, 'campagnes'), where('testeurs', 'array-contains', moi.uid)), (inst) => {
      parProjet.set(pid, inst.docs.map((d) => ({ id: d.id, projet: pid, ...d.data() })));
      choisir();
    }, () => { parProjet.set(pid, []); choisir(); }));
  });
};

const monter = async () => {
  const sess = await session();
  const { utilisateur, testeur } = sess;
  if (!utilisateur || !testeur) { location.replace('./'); return; }

  /* Un seul dessin par image : dix instantanés qui arrivent d'un coup ne
     redessinent pas dix fois. */
  let prevu = false;
  const redessiner = () => {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(() => {
      prevu = false;
      rendre(testeur);
      /* La présence part quand on sait sur quelle campagne il est : une
         session sans campagne ne dirait rien à l'équipe. Ensuite, un
         changement de campagne se signale tout de suite. */
      if (etat.charge && !presence.uid) demarrerPresence(testeur.uid);
      else if (presence.lancee && (etat.campagne || {}).id !== presence.campagneVue) signe(true);
      presence.campagneVue = (etat.campagne || {}).id;
    });
  };

  /* La coquille de la suite : le rail, la barre, la recherche. Les pages
     se dessinent dans sa zone. */
  const { vue } = monterCoquille({ session: sess, role: 'testeur', groupes: [], sortie: racine });
  racine = vue;
  racine.innerHTML = `<div class="page page--testeur"><p class="aide" style="text-align:center;margin-top:40px">Chargement de votre campagne…</p></div>`;
  if (!plateformeCourante) plateformeCourante = plateformeParDefaut(testeur);
  /* La première fois : l'accueil, devant tout, pour qu'il sache ce qu'est
     Capmedia Test avant qu'on lui demande quoi que ce soit. La campagne se
     dessine derrière pendant qu'il le lit, et l'attend à la sortie. */
  if (!accueilVu(testeur.uid)) lancerAccueil(testeur);
  /* Puis sa fiche, tant qu'il ne l'a pas validée : qui teste, sur quoi,
     depuis quel appareil. Ensuite, chaque connexion consigne l'appareil du
     jour sans rien demander. */
  const fiche = testeur.ficheValidee ? (consignerAppareil(testeur), null)
    : attendreAccueil().then(() => ouvrirFiche(testeur));
  /* La bulle vers l'équipe, en bas à droite, une fois la fiche validée :
     rien ne doit passer devant elle. */
  const monterBulle = () => { try { bulle = monterBulleTesteur({ testeur }); } catch (e) { console.warn('[testeur] bulle non montée', e); } };
  if (fiche) fiche.then(monterBulle); else monterBulle();
  document.addEventListener('suivi:accueil-revoir', () => lancerAccueil(testeur, { demande: true }));
  majNavigation();
  definir(Object.keys(PAGES).map((chemin) => ({ chemin, vue: () => { rendre(testeur); } })), { defaut: '/', cible: vue });
  demarrer();

  /* ⌘K : un scénario par sa référence ou son titre, et les pages. */
  enregistrerRecherche((terme) => [
    ...etat.scenarios.map((x) => ({ groupe: 'Mes scénarios', libelle: `${x.ref} · ${x.titre}`, sous: (BLOCS_SCENARIO[x.bloc] || {}).libelle || '', icone: 'taches', action: () => { naviguer('/'); ouvrirFeuille(x, testeur); } })),
    { groupe: 'Pages', libelle: 'L\'application', icone: 'composants', chemin: '/application' },
    { groupe: 'Pages', libelle: 'Mes signalements', icone: 'alerte', chemin: '/signalements' },
    { groupe: 'Pages', libelle: 'Mon avis', icone: 'coeur', chemin: '/avis' },
    { groupe: 'Pages', libelle: 'Guide du testeur', icone: 'ampoule', chemin: '/guide' },
  ].filter((r) => terme || r.groupe === 'Pages'));

  suivreTemps(testeur.uid);
  ecouterCampagnes(testeur, redessiner);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-sortir], [data-sur], [data-continuer], [data-ouvrir], [data-avis], [data-vue], [data-case], [data-accueil="revoir"], [data-astuce-suivante], [data-avis-page], [data-terminer], [data-remarque]');
    if (!el) return;

    if (el.dataset.accueil === 'revoir') { lancerAccueil(testeur, { demande: true }); return; }
    if (el.hasAttribute('data-terminer')) { await agir(el, () => terminer(testeur)); return; }
    if (el.hasAttribute('data-remarque')) { const z = $('#remarque-texte'); await agir(el, () => ajouterRemarque(testeur, z ? z.value : '')); return; }
    if (el.hasAttribute('data-astuce-suivante')) {
      astuce = (astuce + 1) % ASTUCES.length;
      const p = el.closest('.astuce-testeur');
      if (p) p.querySelector('p').innerHTML = `<b>Astuce.</b> ${echapper(ASTUCES[astuce])}`;
      return;
    }
    if (el.dataset.avisPage) {
      await ouvrirAvis(testeur, el.dataset.avisPage);
      rendre(testeur);
      return;
    }

    if (el.hasAttribute('data-sortir')) { await signe(false); effacerSecretsLocaux(); await signOut(auth); location.replace('./'); return; }

    if (el.dataset.vue) {
      vueCourante = el.dataset.vue;
      try { localStorage.setItem('suivi:testeur-vue', vueCourante); } catch (err) { /* stockage refusé */ }
      rendre(testeur);
      signe(true);
      return;
    }

    if (el.dataset.sur !== undefined) {
      plateformeCourante = el.dataset.sur;
      try { localStorage.setItem('suivi:testeur-plateforme', plateformeCourante); } catch (err) { /* stockage refusé */ }
      rendre(testeur);
      /* Le même choix vit aussi dans la feuille ouverte, s'il y en a une. */
      document.querySelectorAll('[data-sur]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sur === plateformeCourante)));
      signe(true);
      return;
    }

    /* Les boutons de l'échelle portent aussi « data-avis », mais ils
       vivent dans la feuille, pas dans la page : ce geste-ci ne voit que
       ceux du bandeau, et ils portent un moment, pas une clé. */
    if (el.dataset.avis === 'avant' || el.dataset.avis === 'apres') {
      await ouvrirAvis(testeur, el.dataset.avis);
      rendre(testeur);
      return;
    }

    if (el.dataset.case || el.dataset.ouvrir || el.dataset.continuer) {
      const ref = el.dataset.case || el.dataset.ouvrir || el.dataset.continuer;
      const s = etat.scenarios.find((x) => x.ref === ref);
      if (!s) return;
      /* Un scénario verrouillé se lit quand le test est terminé (tout est
         déroulé) ; avant, il attend le précédent. Un guidage, pas une
         erreur : le toast est neutre. */
      if (!ouvrable(ref) && !aTermine()) {
        const p = prochain();
        toast(p ? `Les scénarios se suivent : ${p.ref} d'abord.` : 'Les scénarios se suivent : le précédent d\'abord.', 'info');
        return;
      }
      ouvrirFeuille(s, testeur);
    }
  });
};

monter();
