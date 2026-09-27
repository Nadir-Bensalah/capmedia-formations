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
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, RESULTATS_PASSAGE, FAMILLES_AVIS,
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
   la plateforme au sens de la campagne : c'est lui qui choisit, parce que
   le même téléphone sert au mobile et au web. */
let plateformeCourante = (() => {
  try { return localStorage.getItem('suivi:testeur-plateforme') || ''; } catch (e) { return ''; }
})();

/* Tableau ou liste : le tableau dit d'un coup d'œil où l'on en est, la
   liste se lit ligne à ligne. Le choix reste d'une visite à l'autre. */
let vueCourante = (() => {
  try { return localStorage.getItem('suivi:testeur-vue') || 'grille'; } catch (e) { return 'grille'; }
})();

const etat = { campagne: null, scenarios: [], passages: new Map(), avis: null, bloc: '', reste: true, charge: false };

/* -------------------------------------------------------------------------- */

/* Fait, c'est passé et pas à rejouer : un KO que l'équipe a corrigé
   revient dans ce qui reste, jusqu'à ce qu'on le rejoue. */
const fait = (ref) => {
  const p = etat.passages.get(ref);
  return Boolean(p) && !(p.resultat === 'ko' && p.aRevoir === true);
};

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
  const faits = etat.scenarios.filter((s) => etat.passages.has(s.ref)).length;
  if (!total) return '';
  if (aTermine()) {
    const fin = finAcces();
    return `<div class="fin-test fin-test--faite">
      <h2>Test terminé le ${echapper(dateCourte(enDate(etat.avis.termine) || new Date()))}</h2>
      <p>Vos résultats sont transmis à l'équipe Capmedia et figés. ${fin ? `Votre accès reste ouvert jusqu'au ${echapper(dateCourte(fin))} : le temps d'ajouter une remarque qui vous revient après coup.` : ''}</p>
    </div>
    ${magasinsHtml()}`;
  }
  if (faits === total) {
    return `<div class="fin-test">
      <h2>Tout est déroulé. Il reste à le dire.</h2>
      <p>« J'ai terminé » transmet vos résultats à l'équipe et les fige. Relisez d'abord vos échecs si vous avez un doute : après, vous ne pourrez plus les changer.</p>
      <div class="actions"><button class="btn btn-principal" type="button" data-terminer>J'ai terminé le test</button></div>
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
  if (!total || etat.scenarios.some((s) => !etat.passages.has(s.ref))) { toast('Il reste des scénarios à dérouler.', 'erreur'); return; }
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
        <p class="surtitre">Ma campagne</p>
        <h1>Bonjour ${echapper(moi.prenom || '')}</h1>
        <p class="t-petit t-2" style="margin-top:2px">${echapper(campagne.titre || 'Campagne en cours')}</p>
      </div>
    </div>

    <div style="margin-top:14px">${barreHtml(tableauTesteur({ scenarios: etat.scenarios, passages: etat.passages, blocs: BLOCS_SCENARIO }), { legende: false })}</div>
    <p class="chapo">${faits} sur ${total} · ${part} %${faits === total && total ? ' · vous avez tout déroulé, merci' : ''}</p>

    <div class="segments" role="group" aria-label="Sur quoi vous testez" style="margin-top:12px">
      ${Object.entries(PLATEFORMES_TEST).map(([cle, f]) => `<button type="button" data-sur="${echapper(cle)}" aria-pressed="${plateformeCourante === cle}">${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(f.libelle)}</button>`).join('')}
    </div>
    ${!plateformeCourante ? '<p class="aide">Dites d\'abord sur quoi vous testez : le résultat n\'a pas le même sens sur un iPhone et sur le web.</p>' : ''}
  </header>`;
};

const ligneScenario = (s) => {
  const p = etat.passages.get(s.ref);
  const r = p ? p.resultat : '';
  const verrou = !ouvrable(s.ref);
  const fige = aTermine();
  return `
  <div class="t-scenario${r ? ` t-scenario--${r}` : ''}${verrou ? ' t-scenario--verrou' : ''}${fige ? ' t-scenario--fige' : ''}" data-ref="${echapper(s.ref)}">
    <button class="t-scenario-corps" type="button" data-ouvrir="${echapper(s.ref)}"${verrou ? ' aria-disabled="true" title="Déroulez d\'abord le scénario précédent"' : ''}>
      <span class="t-scenario-ref">${echapper(s.ref)}</span>
      <span class="t-scenario-titre">${echapper(s.titre)}</span>
      ${r ? pastille(RESULTATS_PASSAGE, r) : ''}
    </button>
    <div class="t-scenario-choix" role="group" aria-label="Résultat de ${echapper(s.ref)}">
      ${Object.entries(RESULTATS_PASSAGE).map(([cle, f]) => `<button type="button" class="t-choix t-choix--${cle}" data-poser="${echapper(s.ref)}" data-resultat="${cle}" aria-pressed="${r === cle}"${verrou || fige ? ' disabled' : ''}>${echapper(f.libelle)}</button>`).join('')}
    </div>
  </div>`;
};

/* L'appel au questionnaire. Avant de commencer, puis quand tout est
   déroulé : un avis demandé au milieu n'a ni la fraîcheur du premier
   regard ni le recul du dernier. */
const appelAvis = () => {
  const total = etat.scenarios.length;
  const faits = etat.scenarios.filter((s) => etat.passages.has(s.ref)).length;
  const a = etat.avis || {};
  const avantFait = Object.keys(a).some((k) => k.startsWith('impression.'));
  const apresFait = Object.keys(a).some((k) => k.startsWith('esthetique.'));

  if (!avantFait && !faits) {
    return `<div class="encart encart--attention avis-appel">
      ${icone('ampoule')}
      <div><strong>Avant de commencer, deux minutes.</strong>
      <p>Ce que vous pensez de l'application en la découvrant ne se retrouve pas ensuite.</p>
      <button class="btn btn-principal btn-petit" type="button" data-avis="avant" style="margin-top:10px">Donner ma première impression</button></div>
    </div>`;
  }
  if (total && faits === total && !apresFait) {
    return `<div class="encart encart--attention avis-appel">
      ${icone('coeur')}
      <div><strong>Vous avez tout déroulé. Merci.</strong>
      <p>Il reste le plus utile : ce que vous pensez de l'application.</p>
      <button class="btn btn-principal btn-petit" type="button" data-avis="apres" style="margin-top:10px">Donner mon avis</button></div>
    </div>`;
  }
  if (apresFait) return '';
  if (faits) {
    return `<p class="aide" style="margin-bottom:14px">Quand vous aurez tout déroulé, un questionnaire vous demandera ce que vous pensez de l'application. <button class="lien-sobre" type="button" data-avis="apres">Y répondre maintenant</button></p>`;
  }
  return '';
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
        icone: 'bug', titre: 'Aucune campagne en cours',
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

  racine.innerHTML = `<div class="page page--testeur">
    ${enTete(moi, campagne)}

    ${chiffresHtml()}
    ${finTestHtml()}
    ${remarquesHtml()}
    ${appelAvis()}
    ${aTermine() ? '' : astuceHtml()}

    <div class="segments" role="group" aria-label="Affichage" style="margin-bottom:16px">
      <button type="button" data-vue="grille" aria-pressed="${vueCourante === 'grille'}">Tableau</button>
      <button type="button" data-vue="liste" aria-pressed="${vueCourante === 'liste'}">Liste</button>
    </div>

    ${vueCourante === 'grille' ? `<div class="tb tb--testeur">
      <div class="tb-legende">${legendeTesteur()}</div>
      ${famillesHtml(tableauTesteur({ scenarios: etat.scenarios, passages: etat.passages, blocs: BLOCS_SCENARIO }), { mode: 'testeur' })}
      <p class="aide">Touchez une case pour lire le scénario et poser votre résultat.</p>
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
  </div>`;

  const b = $('#f-bloc'); if (b) b.addEventListener('change', (e) => { etat.bloc = e.target.value; rendre(moi); });
  const r = $('#f-reste'); if (r) r.addEventListener('change', (e) => { etat.reste = e.target.checked; rendre(moi); });
  /* Dans le tableau, une case verrouillée se voit : le suivant attend le
     précédent. */
  racine.querySelectorAll('.tb--testeur [data-case]').forEach((el) => {
    if (!ouvrable(el.dataset.case)) el.setAttribute('data-verrou', '');
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
  temps.minuterie = setInterval(afficherTemps, 1000);
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
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
};

const afficherTemps = () => {
  document.querySelectorAll('[data-chrono]').forEach((el) => {
    el.textContent = temps.lisible ? duree(tempsDonne()) : '–';
  });
  document.querySelectorAll('[data-chrono-sessions]').forEach((el) => {
    const n = temps.sessions.filter((x) => etat.campagne && x.campagne === etat.campagne.id).length;
    el.textContent = temps.lisible ? `${n} session${n > 1 ? 's' : ''}` : 'bientôt disponible';
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
    if (p.resultat === 'ko' && p.aRevoir === true) { r.revoir += 1; r.reste += 1; return; }
    if (r[p.resultat] !== undefined) r[p.resultat] += 1;
  });
  return r;
};

const chiffresHtml = () => {
  const r = compter();
  return `<div class="testeur-chiffres">
    <div class="testeur-chiffre testeur-chiffre--temps"><span>Temps de test</span><b data-chrono>–</b><small data-chrono-sessions></small></div>
    <div class="testeur-chiffre"><span>Réussis</span><b class="t-ok">${r.ok}</b><small>scénarios passés</small></div>
    <div class="testeur-chiffre"><span>Échecs signalés</span><b class="${r.ko ? 't-ko' : ''}">${r.ko}</b><small><a href="#/signalements">Mes signalements</a></small></div>
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
    surFin: () => { accueil = null; marquerAccueilVu(moi.uid); consignerAccueil(moi); },
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
  'Changez d\'appareil ? Changez aussi la plateforme en haut de la page : le résultat n\'a pas le même sens sur un iPhone et sur le web.',
  'Un texte coupé, un bouton trop petit, une faute : ce sont des échecs aussi. Signalez-les.',
  'Coupez le réseau quelques secondes pendant un envoi : une application sérieuse doit le dire proprement.',
  'Une case orange est à rejouer : l\'équipe a corrigé ce que vous aviez signalé. Un OK ferme la boucle.',
  'Vous hésitez entre Réussi et Échec ? Relisez « Ce qui doit se passer ». Si ce n\'est pas exactement ça, c\'est un échec.',
  'Passez en mode sombre sur votre téléphone et regardez les écrans à nouveau : c\'est là que les contrastes lâchent.',
  'Tournez l\'écran, agrandissez le texte dans les réglages : beaucoup de défauts se cachent là.',
  'Faites des pauses. Un regard frais trouve plus de défauts qu\'un regard fatigué.',
];
let astuce = Math.floor(Math.random() * ASTUCES.length);

const astuceHtml = () => `<aside class="astuce-testeur" aria-label="Astuce">
    <span class="astuce-testeur-icone">${icone('ampoule')}</span>
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
  ${vide({ icone: 'bug', titre: 'Aucune campagne en cours', texte: 'Cette page se remplira dès qu\'une campagne vous est confiée, sans recharger.' })}
</div>`;

const pageApplication = () => {
  filAriane([{ libelle: 'L\'application' }]);
  const c = etat.campagne;
  if (!c) { racine.innerHTML = sansCampagne('L\'application'); return; }
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
    ${(c.acces && (c.acces.instructions || c.acces.identifiants)) ? `<section>
      <div class="section-tete"><h2>Pour entrer dans l'application</h2></div>
      ${c.acces.instructions ? `<div class="prose">${echapper(c.acces.instructions).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
      ${c.acces.identifiants ? `<div class="identifiants-test">
        <p class="surtitre">Vos identifiants de test</p>
        <pre class="identifiants-bloc" id="identifiants-bloc">${echapper(c.acces.identifiants)}</pre>
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
    .filter((x) => x.p && x.p.resultat === 'ko')
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
        <li><b>Dites sur quoi vous testez.</b> iPhone, Android ou web, en haut de votre campagne. Changez-le si vous changez d'appareil.</li>
        <li><b>Donnez votre première impression</b>, avant de toucher à quoi que ce soit.</li>
        <li><b>Déroulez vos scénarios, dans l'ordre.</b> Chaque case du tableau en est un : touchez-la, lisez ce qui doit se passer, faites-le, et dites ce que vous avez obtenu. Le suivant s'ouvre quand le précédent a son résultat.</li>
        <li><b>Rejouez les cases orange.</b> L'équipe a corrigé ce que vous aviez signalé : votre OK ferme la boucle.</li>
        <li><b>Dites que vous avez terminé.</b> Le bouton apparaît quand tout est déroulé : il transmet votre bilan à l'équipe et fige vos résultats. Vous gardez sept jours pour ajouter une remarque.</li>
        <li><b>Donnez votre avis</b> une fois tout déroulé.</li>
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
    { items: [{ chemin: '/', libelle: 'Ma campagne', icone: 'bug', exact: true, compte: c ? { total: r.reste } : 0 }] },
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
        <label class="etiquette-champ" for="t-preuve">Une preuve</label>
        <input class="champ" id="t-preuve" type="file" accept="image/*,video/*">
        <p class="aide">Une capture ou une petite vidéo. Sans elle, l'échec ne peut pas être enregistré : c'est elle qui permet de reproduire.</p>
        <p class="aide" id="t-envoi"></p>
      </div>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-valider>Enregistrer l\'échec</button>',
  });

  const bouton = m.el.querySelector('[data-valider]');
  bouton.addEventListener('click', () => agir(bouton, async () => {
    const quoi = ($('#t-quoi', m.el).value || '').trim();
    const fichier = ($('#t-preuve', m.el).files || [])[0];
    if (!quoi) { toast('Dites ce qui s\'est passé.', 'erreur'); return; }
    if (!fichier) { toast('Joignez une preuve : sans elle, l\'échec ne peut pas être enregistré.', 'erreur'); return; }
    const echo = $('#t-envoi', m.el);
    let piece;
    try {
      piece = await envoyerPiece(fichier, `campagnes/${etat.campagne.projet}/${etat.campagne.id}/${auth.currentUser.uid}`,
        (n) => { echo.textContent = `Envoi ${n} %`; });
    } catch (e) { toast(String(e.message || e), 'erreur'); return; }
    m.fermer({ commentaire: quoi, preuves: [piece.chemin] });
  }));
  return m.fin;
};

const poser = async (s, resultat, moi) => {
  if (aTermine()) { toast('Le test est terminé : vos résultats sont figés.', 'erreur'); return; }
  if (!ouvrable(s.ref)) { toast('Déroulez d\'abord le scénario précédent.', 'erreur'); return; }
  if (!plateformeCourante) { toast('Dites d\'abord sur quoi vous testez.', 'erreur'); return; }
  let extra = { commentaire: '', preuves: [] };
  if (resultat === 'ko') {
    const rep = await ouvrirEchec(s);
    if (!rep) return;
    extra = rep;
  }

  /* L'identifiant porte l'uid : c'est lui qui rend le cloisonnement
     opposable avant service, et les règles l'exigent tel quel. */
  const uid = auth.currentUser.uid;
  const chemin = `projets/${etat.campagne.projet}/campagnes/${etat.campagne.id}/passages/${uid}__${s.ref}`;
  const passage = {
    scenario: s.ref, testeur: uid, plateforme: plateformeCourante, resultat,
    commentaire: extra.commentaire, preuves: extra.preuves,
    contexte: contexteAppareil(), le: serverTimestamp(),
  };
  try {
    await setDoc(doc(bdd, chemin), passage);
    etat.passages.set(s.ref, passage);
    rendre(moi);
    if (resultat === 'ko') toast('Échec enregistré, merci. On le reproduit de notre côté.');
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

const VERDICTS = { ok: 'Réussi', ko: 'Échec', na: 'Sans objet' };

const ouvrirFeuille = (s, moi) => {
  const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
  const p = etat.passages.get(s.ref);
  const v = tableauTesteur({ scenarios: [s], passages: etat.passages }).familles[0].cases[0].etat;
  regarder(s.ref);
  const m = modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || ''}`, scenario: true,
    corps: `
      ${v === 'revoir' ? '<section class="fs-bloc fs-bloc--alerte"><p class="fs-bloc-sur">À rejouer</p><p>L\'équipe a corrigé ce que vous aviez signalé. Refaites-le : un Réussi ferme la boucle, un nouvel Échec la rouvre.</p></section>' : ''}
      ${p && v !== 'revoir' ? `<div class="fs-etat">${pastille(RESULTATS_PASSAGE, p.resultat)}<span class="t-2 t-petit">Votre résultat${p.commentaire ? ` · ${echapper(p.commentaire)}` : ''}. Vous pouvez vous corriger.</span></div>` : ''}
      ${s.options ? `<section class="fs-bloc"><p class="fs-bloc-sur">Ce qu'il faut poser</p><p>${echapper(s.options).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p></section>` : ''}
      <section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${echapper(s.attendu || '')}</p></section>
      <p class="fs-note">Un scénario où rien ne se passe est un échec, jamais une réussite. ${echapper(niveau.aide)}</p>
      ${!plateformeCourante ? '<p class="fs-note"><strong>Dites d\'abord sur quoi vous testez</strong>, en haut de la page.</p>' : ''}
      ${aTermine() ? '<p class="fs-note"><strong>Le test est terminé</strong> : ce résultat est figé.</p>' : ''}`,
    pied: aTermine()
      ? '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>'
      : Object.keys(RESULTATS_PASSAGE).map((cle) => `<button type="button" class="fs-verdict fs-verdict--${cle}" data-feuille-poser="${cle}" aria-pressed="${p && p.resultat === cle}"><i aria-hidden="true"></i>${VERDICTS[cle]}</button>`).join(''),
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-feuille-poser]');
    if (!b) return;
    const resultat = b.dataset.feuillePoser;
    if (!plateformeCourante) { toast('Dites d\'abord sur quoi vous testez, en haut de la page.', 'erreur'); return; }
    m.fermer(true);
    await poser(s, resultat, moi);
  });
  m.fin.then(() => regarder(''));
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
  ecoutes.campagne.push(onSnapshot(collection(bdd, 'projets', pid, 'scenarios'), (inst) => {
    const m = miens();
    etat.scenarios = inst.docs.map((d) => ({ ref: d.id, ...d.data() }))
      .filter((x) => x.actif !== false && m.has(x.ref))
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    redessiner();
  }, (e) => console.warn('[testeur] scénarios', e)));

  ecoutes.campagne.push(onSnapshot(query(collection(bdd, 'projets', pid, 'campagnes', c.id, 'passages'), where('testeur', '==', moi.uid)), (inst) => {
    etat.passages = new Map(inst.docs.map((d) => { const x = d.data(); return [x.scenario, x]; }));
    redessiner();
  }, (e) => console.warn('[testeur] passages', e)));

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
  /* Sa fiche d'abord, tant qu'il ne l'a pas validée : qui teste, sur quoi,
     depuis quel appareil. Ensuite, chaque connexion consigne l'appareil du
     jour sans rien demander. */
  if (!testeur.ficheValidee) await ouvrirFiche(testeur);
  else consignerAppareil(testeur);
  /* La bulle vers l'équipe, en bas à droite. */
  try { bulle = monterBulleTesteur({ testeur }); } catch (e) { console.warn('[testeur] bulle non montée', e); }
  /* La première fois : l'accueil, devant tout. La campagne se dessine
     derrière pendant qu'il le lit, et l'attend à la sortie. */
  if (!accueilVu(testeur.uid)) lancerAccueil(testeur);
  document.addEventListener('suivi:accueil-revoir', () => lancerAccueil(testeur, { demande: true }));
  majNavigation();
  definir(Object.keys(PAGES).map((chemin) => ({ chemin, vue: () => { rendre(testeur); } })), { defaut: '/', cible: vue });
  demarrer();

  /* ⌘K : un scénario par sa référence ou son titre, et les pages. */
  enregistrerRecherche((terme) => [
    ...etat.scenarios.map((x) => ({ groupe: 'Mes scénarios', libelle: `${x.ref} · ${x.titre}`, sous: (BLOCS_SCENARIO[x.bloc] || {}).libelle || '', icone: 'bug', action: () => { naviguer('/'); ouvrirFeuille(x, testeur); } })),
    { groupe: 'Pages', libelle: 'L\'application', icone: 'composants', chemin: '/application' },
    { groupe: 'Pages', libelle: 'Mes signalements', icone: 'alerte', chemin: '/signalements' },
    { groupe: 'Pages', libelle: 'Mon avis', icone: 'coeur', chemin: '/avis' },
    { groupe: 'Pages', libelle: 'Guide du testeur', icone: 'ampoule', chemin: '/guide' },
  ].filter((r) => terme || r.groupe === 'Pages'));

  suivreTemps(testeur.uid);
  ecouterCampagnes(testeur, redessiner);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-sortir], [data-sur], [data-poser], [data-ouvrir], [data-avis], [data-vue], [data-case], [data-accueil="revoir"], [data-astuce-suivante], [data-avis-page], [data-terminer], [data-remarque]');
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

    if (el.dataset.case || el.dataset.ouvrir) {
      const ref = el.dataset.case || el.dataset.ouvrir;
      const s = etat.scenarios.find((x) => x.ref === ref);
      if (!s) return;
      /* Un scénario verrouillé se lit quand le test est terminé (tout est
         déroulé) ; avant, il attend le précédent. */
      if (!ouvrable(ref) && !aTermine()) {
        const p = prochain();
        toast(p ? `Déroulez d'abord ${p.ref} : les scénarios se suivent.` : 'Déroulez d\'abord le scénario précédent.', 'erreur');
        return;
      }
      ouvrirFeuille(s, testeur);
      return;
    }

    if (el.dataset.poser) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.poser);
      if (s) await poser(s, el.dataset.resultat, testeur);
    }
  });
};

monter();
