/* ==========================================================================
   CAPMEDIA TEST · le questionnaire, envoyé sans nom

   Le testeur répond comme avant (les mêmes questions, celles de
   questionnaire-avis.js), mais ses réponses ne s'écrivent plus dans son
   appréciation : elles partent au serveur (hubAvisTesteur), qui les range
   sans identifiant de testeur, et ne pose sur l'appréciation que « a
   répondu ». Conséquence assumée, et dite au testeur avant qu'il envoie :
   un avis envoyé ne se relit plus et ne se modifie plus, même par lui.

   Ce qu'il a commencé à remplir reste dans la page (pas dans le
   navigateur, pas dans la base) : fermer la feuille par erreur ne perd
   rien, recharger la page si.
   ========================================================================== */

import {
  auth, echapper, surEmulateur, FONCTIONS_EMULATEUR,
  FAMILLES_AVIS, estRequise, validerAvis,
} from './noyau.js';
import { modale, toast, agir } from './ui.js';

const PROJET = (window.AZ_SUIVI && window.AZ_SUIVI.firebase && window.AZ_SUIVI.firebase.projectId) || 'capmedia-1f90d';
const URL_AVIS = surEmulateur
  ? `${FONCTIONS_EMULATEUR}/${PROJET}/europe-west1/hubAvisTesteur`
  : `https://europe-west1-${PROJET}.cloudfunctions.net/hubAvisTesteur`;

/* Les brouillons, par campagne et par moment, le temps de la page. */
const brouillons = new Map();

const facultatif = '<span class="facultatif">(facultatif)</span>';

/* Une question, telle que le testeur la voit. Les attributs portent la clé
   courte de la question (« belle », « recommande »), unique dans tout le
   questionnaire, comme avant l'avis anonyme : les épreuves et les habitudes
   ne changent pas. La réponse, elle, se range sous « famille.question ». */
const champAvis = (q, id, valeur) => {
  const v = valeur === undefined ? '' : valeur;
  const fac = estRequise(q) ? '' : ` ${facultatif}`;
  const etiquette = `${echapper(q.libelle)}${fac}`;
  if (q.type === 'echelle' || q.type === 'note10') {
    const crans = q.type === 'echelle' ? [1, 2, 3, 4, 5] : Array.from({ length: 11 }, (_, n) => n);
    return `<div class="groupe" data-question="${echapper(id)}">
      <span class="etiquette-champ" id="lib-${echapper(id)}">${etiquette}</span>
      <div class="avis-echelle${q.type === 'note10' ? ' avis-echelle--large' : ''}" role="group" aria-labelledby="lib-${echapper(id)}">
        ${crans.map((n) => `<button type="button" class="avis-cran" data-avis="${echapper(q.cle)}" data-valeur="${n}" aria-pressed="${String(v) === String(n)}">${n}</button>`).join('')}
      </div>
      ${q.bas ? `<div class="rang avis-bornes"><span>${echapper(q.bas)}</span><span>${echapper(q.haut || '')}</span></div>` : ''}
      ${q.aide ? `<p class="aide">${echapper(q.aide)}</p>` : ''}
    </div>`;
  }
  if (q.type === 'choix') {
    return `<div class="groupe" data-question="${echapper(id)}">
      <span class="etiquette-champ" id="lib-${echapper(id)}">${etiquette}</span>
      <div class="rang" style="gap:8px;flex-wrap:wrap" role="group" aria-labelledby="lib-${echapper(id)}">
        ${(q.options || []).map((o) => `<button type="button" class="avis-choix" data-avis="${echapper(q.cle)}" data-valeur="${echapper(o)}" aria-pressed="${v === o}">${echapper(o)}</button>`).join('')}
      </div>
    </div>`;
  }
  const champ = `av-${q.cle}`;
  if (q.type === 'euros') {
    return `<div class="groupe" data-question="${echapper(id)}">
      <label class="etiquette-champ" for="${champ}">${etiquette}</label>
      <div class="rang" style="gap:8px;align-items:center">
        <input class="champ" id="${champ}" data-avis-champ="${echapper(q.cle)}" type="number" min="0" max="10000" step="0.5" inputmode="decimal" value="${echapper(String(v))}" style="max-width:140px">
        <span class="t-2">€ par mois</span>
      </div>
    </div>`;
  }
  return `<div class="groupe" data-question="${echapper(id)}">
    <label class="etiquette-champ" for="${champ}">${etiquette}</label>
    <textarea class="champ" id="${champ}" data-avis-champ="${echapper(q.cle)}" rows="3" maxlength="2000">${echapper(String(v))}</textarea>
  </div>`;
};

/* L'envoi : le jeton de la personne, le serveur décide. */
const envoyer = async ({ campagne, quand, reponses }) => {
  const u = auth.currentUser;
  if (!u) throw new Error('Votre session est fermée. Reconnectez-vous.');
  const jeton = await u.getIdToken();
  let r;
  try {
    r = await fetch(URL_AVIS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ projet: campagne.projet, campagne: campagne.id, moment: quand, reponses }),
    });
  } catch (e) { throw new Error('Le serveur est injoignable. Vos réponses sont gardées : réessayez.'); }
  const texte = await r.text();
  if (r.status === 409) return { deja: true };
  if (!r.ok) throw new Error(texte || 'Votre avis n\'a pas pu être enregistré. Réessayez.');
  return { ok: true };
};

/**
 * Le questionnaire d'un moment (« avant » ou « apres »). Résout true si
 * l'avis est parti (ou l'était déjà), undefined sinon.
 */
export const ouvrirAvisAnonyme = ({ campagne, quand, dejaRendu = false }) => {
  if (dejaRendu) {
    toast('Votre avis est déjà envoyé, sans votre nom : il ne se relit plus.', 'info');
    return Promise.resolve(true);
  }
  const cle = `${campagne.projet}/${campagne.id}/${quand}`;
  const reponses = { ...(brouillons.get(cle) || {}) };
  const familles = Object.entries(FAMILLES_AVIS).filter(([, f]) => f.quand === quand && !f.equipe);
  /* La clé courte d'une question vers son identifiant complet. */
  const idDe = new Map(familles.flatMap(([cleF, f]) => f.questions.map((q) => [q.cle, `${cleF}.${q.cle}`])));

  const m = modale({
    titre: quand === 'avant' ? 'Avant de commencer' : 'Votre avis sur l\'application',
    sousTitre: quand === 'avant'
      ? 'Deux minutes. Ce regard-là ne se retrouve pas ensuite.'
      : 'Les scénarios disent si ça marche. Ceci dit si ça plaît.',
    feuille: true,
    corps: `<section class="avis-anonyme" data-avis-anonyme>
        <p class="surtitre">Sans votre nom</p>
        <p>Vos réponses partent sans votre nom. L'équipe Capmedia sait seulement que vous avez répondu, jamais ce que vous avez dit, et personne ne les lit avant trois réponses. Une fois envoyées, elles ne se relisent plus et ne se modifient plus, même par vous.</p>
      </section>
      ${familles.map(([cleF, f]) => `
      <section class="avis-famille">
        <h3 class="bloc-tete">${echapper(f.libelle)}</h3>
        ${f.aide ? `<p class="aide" style="margin-bottom:14px">${echapper(f.aide)}</p>` : ''}
        ${f.questions.map((q) => champAvis(q, `${cleF}.${q.cle}`, reponses[`${cleF}.${q.cle}`])).join('')}
      </section>`).join('')}
      <p class="aide" id="avis-erreur" role="alert"></p>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Plus tard</button><button class="btn btn-principal" type="button" data-envoyer>Envoyer, sans mon nom</button>',
  });

  let parti = false;
  const lireChamps = () => {
    if (parti) return;
    m.el.querySelectorAll('[data-avis-champ]').forEach((ch) => {
      const id = idDe.get(ch.dataset.avisChamp);
      if (!id) return;
      const v = (ch.value || '').trim();
      if (v) reponses[id] = v; else delete reponses[id];
    });
    brouillons.set(cle, { ...reponses });
  };

  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avis]');
    if (!b || !idDe.has(b.dataset.avis)) return;
    reponses[idDe.get(b.dataset.avis)] = b.dataset.valeur;
    brouillons.set(cle, { ...reponses });
    m.el.querySelectorAll(`[data-avis="${CSS.escape(b.dataset.avis)}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const g = b.closest('[data-question]');
    if (g) { g.classList.remove('groupe--manque'); g.removeAttribute('aria-invalid'); }
    /* Plus rien ne manque : le message d'erreur s'efface de lui-même. */
    if (!m.el.querySelector('.groupe--manque')) { const z = m.el.querySelector('#avis-erreur'); if (z) z.textContent = ''; }
  });
  m.el.addEventListener('input', lireChamps);
  m.fin.then(lireChamps);

  const bouton = m.el.querySelector('[data-envoyer]');
  bouton.addEventListener('click', () => agir(bouton, async () => {
    lireChamps();
    const v = validerAvis(quand, reponses);
    const zone = m.el.querySelector('#avis-erreur');
    m.el.querySelectorAll('.groupe--manque').forEach((g) => { g.classList.remove('groupe--manque'); g.removeAttribute('aria-invalid'); });
    if (v.erreur) {
      (v.manquantes || []).forEach((id) => {
        const g = m.el.querySelector(`[data-question="${CSS.escape(id)}"]`);
        if (g) { g.classList.add('groupe--manque'); g.setAttribute('aria-invalid', 'true'); }
      });
      const premier = (v.manquantes || []).length ? m.el.querySelector(`[data-question="${CSS.escape(v.manquantes[0])}"]`) : null;
      if (premier) {
        premier.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        const cible = premier.querySelector('button, input, textarea');
        if (cible) cible.focus({ preventScroll: true });
      }
      zone.textContent = v.manquantes ? `${v.erreur} Les questions sans « facultatif » sont à remplir.` : v.erreur;
      return;
    }
    zone.textContent = '';
    const r = await envoyer({ campagne, quand, reponses: v.reponses });
    parti = true;
    brouillons.delete(cle);
    toast(r.deja ? 'Votre avis était déjà envoyé.' : 'Merci. Votre avis est envoyé, sans votre nom.');
    m.fermer(true);
  }));
  return m.fin;
};
