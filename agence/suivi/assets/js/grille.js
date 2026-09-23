/* ==========================================================================
   CAPMEDIA CLIENT HUB · le dessin du tableau des tests

   Le même dessin dans les trois espaces : une carte par famille, une case
   par test, une barre en haut. Ce fichier ne décide d'aucune couleur, il
   dessine celles que verdicts.js a tranchées.

   La couleur n'est jamais seule : chaque case porte un signe et une
   étiquette lue par le lecteur d'écran.
   ========================================================================== */

import { echapper } from './noyau.js';
import { ETATS_CASE } from './verdicts.js';

/* Les teintes de la barre et de la légende, par état. Les cases, elles,
   prennent leur teinte dans la feuille de style (data-e). */
const TEINTE = {
  ok: 'var(--case-ok)', fragile: 'var(--case-fragile)', casse: 'var(--case-casse)',
  cours: 'var(--case-cours)', tourne: 'var(--case-cours)', na: 'var(--case-na)', suspendu: 'var(--case-na)',
  ko: 'var(--case-casse)', revoir: 'var(--case-fragile)',
};

const libelleMin = (etat) => (ETATS_CASE[etat] || {}).libelle || etat;

/** La barre segmentée et sa légende. */
export const barreHtml = (t, { legende = true } = {}) => {
  const total = t.total || 1;
  const parts = t.ordre.filter((k) => t.compte[k] && TEINTE[k]);
  return `<div class="tb-barre" role="img" aria-label="${echapper(t.ordre.filter((k) => t.compte[k]).map((k) => `${t.compte[k]} ${libelleMin(k)}`).join(', '))}">
    ${parts.map((k) => `<i style="flex-basis:${((t.compte[k] / total) * 100).toFixed(2)}%;background:${TEINTE[k]}"></i>`).join('')}
  </div>
  ${legende ? `<div class="tb-legende">${t.ordre.filter((k) => t.compte[k]).map((k) => `<span><i class="tb-puce" data-e="${k}"></i><b>${t.compte[k]}</b> ${echapper(libelleMin(k).toLowerCase())}</span>`).join('')}</div>` : ''}`;
};

/** Une case. `vivante` : quelqu'un l'a ouverte, ou la machine la joue. */
const caseHtml = (c, { vivants, choisie }) => {
  const e = ETATS_CASE[c.etat] || {};
  const vivant = vivants && vivants.has(c.ref);
  const etiquette = `${c.ref}, ${e.libelle || c.etat}${c.revoir ? ', à revérifier' : ''}${vivant ? ', en cours en ce moment' : ''}${c.titre ? `. ${c.titre}` : ''}`;
  return `<button type="button" class="tb-case${vivant ? ' tb-case--vivante' : ''}${choisie === c.ref ? ' tb-case--choisie' : ''}" data-e="${c.etat}"${c.revoir ? ' data-revoir' : ''} data-case="${echapper(c.ref)}" aria-label="${echapper(etiquette)}" data-astuce="${echapper(`${c.ref} · ${c.titre || e.libelle || ''}`.slice(0, 90))}">${echapper(e.glyphe || '')}</button>`;
};

/* Ce qui ne va pas dans une famille, dit en mots à côté du compte. */
const alertesFamille = (f, mode) => {
  const n = (k) => f.cases.filter((c) => c.etat === k).length;
  const bouts = [];
  if (mode === 'testeur') {
    if (n('ko')) bouts.push(`<span class="tb-rouge">${n('ko')} ${n('ko') > 1 ? 'échecs' : 'échec'}</span>`);
    if (n('revoir')) bouts.push(`<span class="tb-orange">${n('revoir')} à rejouer</span>`);
  } else {
    if (n('casse')) bouts.push(`<span class="tb-rouge">${n('casse')} ${n('casse') > 1 ? 'cassés' : 'cassé'}</span>`);
    if (n('fragile')) bouts.push(`<span class="tb-orange">${n('fragile')} ${n('fragile') > 1 ? 'fragiles' : 'fragile'}</span>`);
    if (n('tourne')) bouts.push(`<span class="tb-bleu">${n('tourne')} en exécution</span>`);
  }
  return bouts.join(' · ');
};

/** Les cartes. */
export const famillesHtml = (t, { mode = 'equipe', vivants = null, choisie = '' } = {}) => `<div class="tb-familles">
  ${t.familles.map((f) => {
    const ok = f.cases.filter((c) => c.etat === 'ok').length;
    const parts = t.ordre.filter((k) => TEINTE[k]).map((k) => {
      const n = f.cases.filter((c) => c.etat === k).length;
      return n ? `<i style="flex-basis:${((n / f.cases.length) * 100).toFixed(2)}%;background:${TEINTE[k]}"></i>` : '';
    }).join('');
    const alertes = alertesFamille(f, mode);
    return `<section class="tb-famille" aria-label="${echapper(f.libelle)}">
      <div class="tb-famille-tete">
        <h3>${echapper(f.libelle)}</h3>
        <span class="tb-compte">${ok}/${f.cases.length}${alertes ? ` · ${alertes}` : ''}</span>
      </div>
      <div class="tb-mini">${parts}</div>
      <div class="tb-cases">${f.cases.map((c) => caseHtml(c, { vivants, choisie })).join('')}</div>
    </section>`;
  }).join('')}
</div>`;

/**
 * L'en-tête : de quoi on parle, où on en est, la barre, la légende.
 * `droite` : le grand chiffre ; `controles` : ce qui se choisit.
 */
export const enteteHtml = ({ surtitre = '', titre, meta = '', pourcent, sousPourcent = '', tableau, controles = '', direct = '' }) => `
<header class="tb-tete">
  <div class="tb-tete-ligne">
    <div class="tb-tete-texte">
      ${surtitre ? `<p class="surtitre">${echapper(surtitre)}</p>` : ''}
      <h2 class="tb-titre">${echapper(titre)}</h2>
      ${meta ? `<p class="tb-meta">${meta}</p>` : ''}
    </div>
    <div class="tb-pourcent">
      <b>${Number.isFinite(pourcent) ? pourcent : 0}<small> %</small></b>
      ${sousPourcent ? `<span>${sousPourcent}</span>` : ''}
    </div>
  </div>
  ${direct}
  ${barreHtml(tableau)}
  ${controles ? `<div class="tb-controles">${controles}</div>` : ''}
</header>`;
