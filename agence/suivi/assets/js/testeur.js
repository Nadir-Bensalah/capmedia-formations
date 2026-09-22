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
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, RESULTATS_PASSAGE, STATUTS_CAMPAGNE,
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

const etat = { campagne: null, scenarios: [], passages: new Map(), bloc: '', reste: true };

/* -------------------------------------------------------------------------- */

const enTete = (moi, campagne) => {
  const total = etat.scenarios.length;
  const faits = etat.scenarios.filter((s) => etat.passages.has(s.ref)).length;
  const part = total ? Math.round((faits / total) * 100) : 0;
  return `
  <header class="testeur-tete">
    <div class="rang" style="justify-content:space-between;align-items:center;gap:16px">
      <div style="min-width:0">
        <p class="surtitre">${echapper(campagne.titre || 'Campagne')}</p>
        <h1>Bonjour ${echapper(moi.prenom || '')}</h1>
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
    return;
  }
};

const monter = async () => {
  const { utilisateur, testeur } = await session();
  if (!utilisateur || !testeur) { location.replace('./'); return; }

  await charger(testeur);
  rendre(testeur);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-sortir], [data-sur], [data-poser], [data-ouvrir]');
    if (!el) return;

    if (el.hasAttribute('data-sortir')) { await signOut(auth); location.replace('./'); return; }

    if (el.dataset.sur !== undefined) {
      plateformeCourante = el.dataset.sur;
      try { localStorage.setItem('suivi:testeur-plateforme', plateformeCourante); } catch (err) { /* stockage refusé */ }
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
