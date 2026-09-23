/* ==========================================================================
   L'ESPACE TESTEUR

   Une seule page, volontairement pauvre. Un testeur qui a six heures de
   scénarios devant lui n'a pas besoin d'un menu : il a besoin de savoir
   où il en est, quoi faire, et de cocher vite.

   Ce qu'il ne voit jamais : les autres testeurs, et leurs réponses. Un
   testeur qui lit « les cinq autres ont mis OK » met OK sans regarder.
   Ça s'appelle l'ancrage, c'est documenté, et ça ruine une campagne. Le
   cloisonnement est tenu par les règles Firestore, pas par cet écran :
   un affichage ne protège rien.
   ========================================================================== */

import {
  bdd, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, signOut, onSnapshot,
  serverTimestamp, session, echapper, envoyerPiece,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, RESULTATS_PASSAGE, FAMILLES_AVIS,
} from './noyau.js';
import { icone, pastille, toast, agir, modale, vide } from './ui.js';
import { tableauTesteur, ETATS_CASE } from './verdicts.js';
import { barreHtml, famillesHtml } from './grille.js';

const $ = (s, r = document) => r.querySelector(s);
const racine = $('#racine');

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
        <p class="surtitre">Capmedia Tests</p>
        <h1>Bonjour ${echapper(moi.prenom || '')}</h1>
        <p class="t-petit t-2" style="margin-top:2px">${echapper(campagne.titre || 'Campagne en cours')}</p>
      </div>
      <button class="btn-icone" type="button" data-sortir aria-label="Se déconnecter" data-astuce="Se déconnecter">${icone('dehors')}</button>
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
  return `
  <div class="t-scenario${r ? ` t-scenario--${r}` : ''}" data-ref="${echapper(s.ref)}">
    <button class="t-scenario-corps" type="button" data-ouvrir="${echapper(s.ref)}">
      <span class="t-scenario-ref">${echapper(s.ref)}</span>
      <span class="t-scenario-titre">${echapper(s.titre)}</span>
      ${r ? pastille(RESULTATS_PASSAGE, r) : ''}
    </button>
    <div class="t-scenario-choix" role="group" aria-label="Résultat de ${echapper(s.ref)}">
      ${Object.entries(RESULTATS_PASSAGE).map(([cle, f]) => `<button type="button" class="t-choix t-choix--${cle}" data-poser="${echapper(s.ref)}" data-resultat="${cle}" aria-pressed="${r === cle}">${echapper(f.libelle)}</button>`).join('')}
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

const rendre = (moi) => {
  const campagne = etat.campagne;
  if (!campagne) {
    if (!etat.charge) return;
    /* Même sans campagne, il doit savoir où il est : un écran nu qui dit
       « Aucune campagne » ressemble à une erreur. Et la page s'allume
       toute seule quand l'équipe passe une campagne « en cours ». */
    racine.innerHTML = `<div class="page page--testeur">
      <header class="testeur-tete"><div class="rang" style="justify-content:space-between;align-items:center;gap:16px">
        <div><p class="surtitre">Capmedia Tests</p><h1>Bonjour ${echapper(moi.prenom || '')}</h1></div>
        <button class="btn-icone" type="button" data-sortir aria-label="Se déconnecter" data-astuce="Se déconnecter">${icone('dehors')}</button>
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

    ${appelAvis()}

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

const ouvrirFeuille = (s, moi) => {
  const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
  const p = etat.passages.get(s.ref);
  const v = tableauTesteur({ scenarios: [s], passages: etat.passages }).familles[0].cases[0].etat;
  regarder(s.ref);
  const m = modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || ''}`, feuille: true,
    corps: `
      ${v === 'revoir' ? '<div class="encart encart--attention" style="margin-bottom:14px"><div><strong>À rejouer.</strong><p>L\'équipe a corrigé ce que vous aviez signalé. Refaites-le : un OK ferme la boucle, un nouvel échec la rouvre.</p></div></div>' : ''}
      ${p && v !== 'revoir' ? `<p class="aide" style="margin-bottom:12px">Votre résultat : ${pastille(RESULTATS_PASSAGE, p.resultat)}${p.commentaire ? ` · ${echapper(p.commentaire)}` : ''}. Vous pouvez vous corriger.</p>` : ''}
      ${s.options ? `<div class="groupe"><span class="etiquette-champ">Ce qu'il faut poser</span><p class="t-corps">${echapper(s.options).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p></div>` : ''}
      <div class="groupe"><span class="etiquette-champ">Ce qui doit se passer</span><p class="t-corps">${echapper(s.attendu || '')}</p></div>
      <p class="aide">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>
      <p class="aide">${echapper(niveau.aide)}</p>
      ${!plateformeCourante ? '<p class="aide"><strong>Dites d\'abord sur quoi vous testez</strong>, en haut de la page.</p>' : ''}`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>
      ${Object.entries(RESULTATS_PASSAGE).map(([cle, f]) => `<button type="button" class="btn ${cle === 'ok' ? 'btn-principal' : 'btn-secondaire'} t-choix--${cle}" data-feuille-poser="${cle}">${echapper(f.libelle)}</button>`).join('')}`,
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
  if (!c) { etat.scenarios = []; redessiner(); return; }

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
    .then((a) => { if (a.exists()) { etat.avis = a.data(); redessiner(); } })
    .catch(() => { /* pas encore d'avis */ });
};

/* La campagne en cours où ce testeur figure. Les règles ne lui servent
   que celles-là : une requête plus large serait refusée, pas filtrée. */
const ecouterCampagnes = (moi, redessiner) => {
  const parProjet = new Map();
  const choisir = () => {
    const toutes = [...parProjet.values()].flat();
    const enCours = toutes.find((c) => c.statut === 'en-cours') || null;
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
  const { utilisateur, testeur } = await session();
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

  racine.innerHTML = `<div class="page page--testeur"><p class="aide" style="text-align:center;margin-top:40px">Chargement de votre campagne…</p></div>`;
  ecouterCampagnes(testeur, redessiner);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-sortir], [data-sur], [data-poser], [data-ouvrir], [data-avis], [data-vue], [data-case]');
    if (!el) return;

    if (el.hasAttribute('data-sortir')) { await signe(false); await signOut(auth); location.replace('./'); return; }

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

    if (el.dataset.case) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.case);
      if (s) ouvrirFeuille(s, testeur);
      return;
    }

    if (el.dataset.ouvrir) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.ouvrir);
      if (!s) return;
      const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
      regarder(s.ref);
      modale({
        titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || ''}`, feuille: true,
        corps: `
          ${s.options ? `<div class="groupe"><span class="etiquette-champ">Ce qu'il faut poser</span><p class="t-corps">${echapper(s.options).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p></div>` : ''}
          <div class="groupe"><span class="etiquette-champ">Ce qui doit se passer</span><p class="t-corps">${echapper(s.attendu || '')}</p></div>
          <p class="aide">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>
          <p class="aide">${echapper(niveau.aide)}</p>`,
        pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
      }).fin.then(() => regarder(''));
      return;
    }

    if (el.dataset.poser) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.poser);
      if (s) await poser(s, el.dataset.resultat, testeur);
    }
  });
};

monter();
