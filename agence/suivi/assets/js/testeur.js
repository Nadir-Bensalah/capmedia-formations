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
  bdd, auth, doc, getDoc, getDocs, setDoc, collection, query, where, signOut,
  serverTimestamp, session, echapper, envoyerPiece,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, RESULTATS_PASSAGE, FAMILLES_AVIS,
} from './noyau.js';
import { icone, pastille, toast, agir, modale, vide } from './ui.js';

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

const etat = { campagne: null, scenarios: [], passages: new Map(), avis: null, bloc: '', reste: true };

/* -------------------------------------------------------------------------- */

const enTete = (moi, campagne) => {
  const total = etat.scenarios.length;
  const faits = etat.scenarios.filter((s) => etat.passages.has(s.ref)).length;
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

    <div class="testeur-jauge" role="img" aria-label="${faits} sur ${total}">
      <div class="testeur-jauge-barre" style="width:${part}%"></div>
    </div>
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

const rendre = (moi) => {
  const campagne = etat.campagne;
  if (!campagne) {
    racine.innerHTML = `<div class="page page--testeur">${vide({
      icone: 'bug', titre: 'Aucune campagne en cours',
      texte: 'Vous serez prévenu dès qu\'une campagne vous est confiée.',
    })}<div class="rang" style="justify-content:center;margin-top:18px"><button class="btn btn-fantome" type="button" data-sortir>Se déconnecter</button></div></div>`;
    return;
  }

  /* Rangés par bloc, dans l'ordre du plan : un testeur qui déroule les
     dates importantes d'affilée garde le contexte en tête. */
  const visibles = etat.scenarios.filter((s) => (!etat.bloc || s.bloc === etat.bloc)
    && (etat.reste ? !etat.passages.has(s.ref) : true));
  const blocs = [];
  etat.scenarios.forEach((s) => {
    let g = blocs.find((b) => b.cle === s.bloc);
    if (!g) { g = { cle: s.bloc, libelle: (BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || 'Divers', n: 0, faits: 0 }; blocs.push(g); }
    g.n += 1;
    if (etat.passages.has(s.ref)) g.faits += 1;
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

    <div class="rang testeur-filtres">
      <select class="select" id="f-bloc" style="width:auto">
        <option value="">Tous les blocs</option>
        ${blocs.map((b) => `<option value="${echapper(b.cle)}"${etat.bloc === b.cle ? ' selected' : ''}>${echapper(b.libelle)} — ${b.faits}/${b.n}</option>`).join('')}
      </select>
      <label class="case"><input type="checkbox" id="f-reste" ${etat.reste ? 'checked' : ''}> Ne montrer que ce qui reste</label>
    </div>

    ${visibles.length ? parBloc.map((g) => `
      <div class="bloc-scenarios">
        <h2 class="bloc-tete">${echapper(g.libelle)}<span class="badge">${g.items.length}</span></h2>
        <div class="liste liste--serree">${g.items.map(ligneScenario).join('')}</div>
      </div>`).join('')
      : vide({ icone: 'check', titre: etat.reste ? 'Rien ne reste ici' : 'Aucun scénario',
          texte: etat.reste ? 'Décochez « ce qui reste » pour revoir ce que vous avez déjà coché.' : 'Changez de bloc.', compact: true })}
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
  } catch (e) {
    console.error(e);
    toast("Ce résultat n'a pas pu être enregistré. Réessayez.", 'erreur');
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
   Le montage
   -------------------------------------------------------------------------- */

const charger = async (moi) => {
  /* La campagne en cours où ce testeur figure. Les règles ne lui servent
     que celles-là : une requête plus large serait refusée, pas filtrée. */
  const projets = moi.projets || [];
  for (const pid of projets) {
    let camps;
    try {
      camps = await getDocs(query(collection(bdd, 'projets', pid, 'campagnes'),
        where('testeurs', 'array-contains', moi.uid)));
    } catch (e) { continue; }
    const enCours = camps.docs.map((d) => ({ id: d.id, projet: pid, ...d.data() }))
      .find((c) => c.statut === 'en-cours');
    if (!enCours) continue;

    etat.campagne = enCours;

    /* Ses scénarios à lui : ceux que l'affectation lui a confiés, et non
       toute la campagne. Un testeur qui verrait les 173 ne saurait plus
       lesquels sont les siens. */
    const miens = new Set((enCours.affectation || {})[moi.uid] || enCours.scenarios || []);
    const tous = await getDocs(collection(bdd, 'projets', pid, 'scenarios'));
    etat.scenarios = tous.docs.map((d) => ({ ref: d.id, ...d.data() }))
      .filter((x) => x.actif !== false && miens.has(x.ref))
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    try {
      const deja = await getDocs(query(collection(bdd, 'projets', pid, 'campagnes', enCours.id, 'passages'),
        where('testeur', '==', moi.uid)));
      deja.forEach((d) => { const x = d.data(); etat.passages.set(x.scenario, x); });
    } catch (e) { /* aucun passage encore */ }

    try {
      const a = await getDoc(doc(bdd, 'projets', pid, 'campagnes', enCours.id, 'appreciations', moi.uid));
      if (a.exists()) etat.avis = a.data();
    } catch (e) { /* pas encore d'avis */ }
    return;
  }
};

const monter = async () => {
  const { utilisateur, testeur } = await session();
  if (!utilisateur || !testeur) { location.replace('./'); return; }

  await charger(testeur);
  rendre(testeur);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-sortir], [data-sur], [data-poser], [data-ouvrir], [data-avis]');
    if (!el) return;

    if (el.hasAttribute('data-sortir')) { await signOut(auth); location.replace('./'); return; }

    if (el.dataset.sur !== undefined) {
      plateformeCourante = el.dataset.sur;
      try { localStorage.setItem('suivi:testeur-plateforme', plateformeCourante); } catch (err) { /* stockage refusé */ }
      rendre(testeur);
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

    if (el.dataset.ouvrir) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.ouvrir);
      if (!s) return;
      const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
      modale({
        titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || ''}`, feuille: true,
        corps: `
          ${s.options ? `<div class="groupe"><span class="etiquette-champ">Ce qu'il faut poser</span><p class="t-corps">${echapper(s.options).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p></div>` : ''}
          <div class="groupe"><span class="etiquette-champ">Ce qui doit se passer</span><p class="t-corps">${echapper(s.attendu || '')}</p></div>
          <p class="aide">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>
          <p class="aide">${echapper(niveau.aide)}</p>`,
        pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
      });
      return;
    }

    if (el.dataset.poser) {
      const s = etat.scenarios.find((x) => x.ref === el.dataset.poser);
      if (s) await poser(s, el.dataset.resultat, testeur);
    }
  });
};

monter();
