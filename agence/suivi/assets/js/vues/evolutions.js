/* ==========================================================================
   CAPMEDIA CLIENT HUB · les axes d'évolution d'un projet

   Les pistes de croissance que Capmedia propose, rangées par plateforme
   (iPhone, Android, Web, Tableau de bord...) : une ligne par axe, avec sa
   case, son titre, une phrase, ce qu'il apporte et son ampleur. Elles
   remplacent les « Suggestions » : une seule page pour la même idée.

   Le client coche une ligne : ses trois gestes apparaissent. « Ça
   m'intéresse » et « À prévoir » sont gardés sur l'axe (qui, quand) ;
   « On en parle » ouvre en plus une demande à son nom. Chaque geste
   prévient l'équipe (fonction hubAxeEcrit) et reste dans l'activité.
   Décocher retire son choix.

   La réponse engage le client : elle est au responsable du projet, comme
   l'était celle des suggestions (même règle que firestore.rules). Un
   collaborateur lit les axes sans cocher. Le prix d'un axe vit dans
   montants/axe-<id> : le responsable et l'équipe seuls le lisent.

   L'équipe, dans le Cockpit, ajoute, modifie, ordonne, publie ou retire
   les axes, écrit l'introduction, et lit les réponses ligne par ligne.
   ========================================================================== */

import { echapper, dateCourte, pluriel, montantHT, estResponsable, OUVERTS, peut } from '../noyau.js';
import { icone, pastille, vide, squelette, titrePage, confirmer, toast, sur, menu, agir } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, abonnerProjet, montantDe, horodatage } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { feuille, champ, zone, choix as select } from './editeurs.js';
import {
  PLATEFORMES_AXE, APPORTS_AXE, AMPLEURS_AXE, ETATS_AXE, ETATS_AXE_CLIENT_AGIT, PUBLICATIONS_AXE, CHOIX_AXE, BORNES_AXE,
} from '../axes-format.js';

/* La conversation vit en bulle (bulle-projet.js) : on lui passe un début de phrase. */
const ouvrirBulle = (pid, texte) => document.dispatchEvent(new CustomEvent('bulle:ouvrir', { detail: { projet: pid, texte } }));

/* --- Ce qu'on lit ------------------------------------------------------- */

export const estPublie = (a) => Boolean(a) && a.publication === 'publiee';
const parOrdre = (a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0) || String(a.titre || '').localeCompare(String(b.titre || ''));

/** Qui peut cocher : le responsable ; à défaut de responsable sur le
    projet, un membre tant que la réponse est vide ou déjà la sienne. */
export const peutRepondre = (a, { pid, env }) => {
  if (!a || env.role === 'equipe' || !estPublie(a) || !ETATS_AXE_CLIENT_AGIT.includes(a.etat || 'propose')) return false;
  const uid = env.session.utilisateur.uid;
  const projet = (magasin.lire(K.projets) || env.session.projets || []).find((p) => p.id === pid) || magasin.lire(K.projet(pid));
  if (!projet) return false;
  const roles = projet.roles || {};
  if (roles[uid] === 'responsable') return true;
  if (Object.values(roles).includes('responsable')) return false;
  return !a.reponse || a.reponse.par === uid;
};

/* Le prix est de la finance : l'équipe et le responsable du projet. */
const voitPrix = ({ pid, env }) => env.role === 'equipe' || estResponsable(env.session, pid);

/** Les plateformes de la page : celles des parties du projet, puis celles
    où un axe existe, dans l'ordre de PLATEFORMES_AXE. Côté client, une
    plateforme sans axe publié n'a pas de bloc. */
const plateformesDe = (composants, axes, equipe) => {
  const parties = new Set((composants || []).map((c) => c.type).filter((t) => PLATEFORMES_AXE[t]));
  const avecAxes = new Set(axes.map((a) => (PLATEFORMES_AXE[a.plateforme] ? a.plateforme : 'general')));
  return Object.keys(PLATEFORMES_AXE).filter((p) => avecAxes.has(p) || (equipe && parties.has(p)));
};

const lireTout = (pid, env) => {
  const equipe = env.role === 'equipe';
  const axes = (magasin.lire(K.axes(pid)) || []).filter((a) => equipe || estPublie(a)).slice().sort(parOrdre);
  return {
    projet: magasin.lire(K.projet(pid)),
    composants: magasin.lire(K.composants(pid)) || [],
    axes,
    intro: ((magasin.lire(K.axesIntro(pid)) || {}).texte || '').trim(),
    tickets: magasin.lire(K.tickets(pid)) || [],
    documents: magasin.lire(K.documents(pid)) || [],
  };
};

/* --- Le dessin d'une ligne ------------------------------------------------ */

/* L'ampleur : trois marches, une à trois pleines. Le repère tient à la
   forme, pas à un pictogramme. */
const jaugeAmpleur = (cle) => {
  const a = AMPLEURS_AXE[cle];
  if (!a) return '';
  return `<span class="axe-ampleur"><span class="axe-marches" aria-hidden="true">${[1, 2, 3].map((n) => `<i${n <= a.marches ? ' class="pleine"' : ''}></i>`).join('')}</span>${echapper(a.libelle)}</span>`;
};

const reperes = (a, d, c) => {
  const equipe = c.env.role === 'equipe';
  const prix = voitPrix(c) ? montantDe(c.pid, `axe-${a.id}`) : null;
  const devis = a.devis && voitPrix(c) ? d.documents.find((x) => x.id === a.devis) : null;
  const etat = ETATS_AXE[a.etat || 'propose'] || ETATS_AXE.propose;
  return [
    APPORTS_AXE[a.apport] ? `<span class="axe-apport">${echapper(APPORTS_AXE[a.apport].libelle)}</span>` : '',
    jaugeAmpleur(a.ampleur),
    !equipe && etat.client ? `<span class="axe-etat">${echapper(etat.client)}</span>` : '',
    typeof prix === 'number' ? `<span class="axe-prix" data-axe-prix>${echapper(montantHT(prix))}</span>` : '',
    devis ? `<a class="lien axe-devis" href="#/finances/${echapper(devis.id)}">${echapper(devis.numero || 'Le devis')}</a>` : '',
  ].filter(Boolean).join('');
};

/* Ce que le client a dit, en une phrase. */
const phraseReponse = (a, d, c, { pourLui = false } = {}) => {
  const r = a.reponse;
  if (!r || !CHOIX_AXE[r.choix]) return '';
  const demande = r.demande ? d.tickets.find((t) => t.id === r.demande) : null;
  const quand = dateCourte(r.le) ? `, le ${dateCourte(r.le)}` : '';
  const lien = demande ? ` · <a class="lien" href="#/projets/${echapper(c.pid)}/demandes/${echapper(demande.id)}">${echapper(demande.numero || 'la demande')}</a>` : '';
  if (pourLui) return `${echapper(CHOIX_AXE[r.choix].fait)}${echapper(quand)}${lien}`;
  return `${echapper(r.nom || 'Le client')} : ${echapper(CHOIX_AXE[r.choix].equipe)}${echapper(quand)}${lien}`;
};

const ligneClient = (a, d, c, ouverts) => {
  const r = a.reponse && CHOIX_AXE[a.reponse.choix] ? a.reponse : null;
  const peutAgir = peutRepondre(a, c);
  const deLui = r && r.par === c.env.session.utilisateur.uid;
  const coche = Boolean(r) || (peutAgir && ouverts.has(a.id));
  const idCase = `axe-case-${a.id}`;
  return `<li class="axe${coche ? ' est-cochee' : ''}${r ? ' a-choisi' : ''}" data-axe="${echapper(a.id)}">
    <span class="axe-case">${peutAgir
    ? `<input type="checkbox" id="${echapper(idCase)}" data-axe-case="${echapper(a.id)}"${coche ? ' checked' : ''}>`
    : `<span class="axe-coche${r ? ' pleine' : ''}" aria-hidden="true"></span>`}</span>
    <div class="axe-corps">
      ${peutAgir ? `<label class="axe-titre" for="${echapper(idCase)}">${echapper(a.titre)}</label>` : `<p class="axe-titre">${echapper(a.titre)}</p>`}
      ${a.description ? `<p class="axe-texte">${echapper(a.description)}</p>` : ''}
      <div class="axe-reperes">${reperes(a, d, c)}</div>
      ${a.detail ? `<details class="axe-detail"><summary>En savoir plus</summary><div class="prose">${echapper(a.detail).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}</div></details>` : ''}
      ${peutAgir ? `<div class="axe-gestes" role="group" aria-label="${echapper(`Que voulez-vous faire de « ${a.titre} » ?`)}">
        ${Object.entries(CHOIX_AXE).map(([cle, f]) => `<button class="btn btn-petit ${r && r.choix === cle ? 'btn-principal' : 'btn-secondaire'}" type="button" data-axe-geste="${echapper(cle)}" data-id="${echapper(a.id)}" aria-pressed="${r && r.choix === cle ? 'true' : 'false'}">${echapper(f.bouton)}</button>`).join('')}
        ${r ? `<span class="axe-fait" data-axe-fait>${deLui ? phraseReponse(a, d, c, { pourLui: true }) : phraseReponse(a, d, c)}</span>` : ''}
      </div>` : (r ? `<p class="axe-fait" data-axe-fait>${phraseReponse(a, d, c)}</p>` : '')}
    </div>
  </li>`;
};

const ligneEquipe = (a, d, c, rang) => {
  const reponse = phraseReponse(a, d, c);
  return `<li class="axe axe--equipe${estPublie(a) ? '' : ' axe--brouillon'}" data-axe="${echapper(a.id)}">
    <span class="axe-rang">${String(rang).padStart(2, '0')}</span>
    <div class="axe-corps">
      <p class="axe-titre">${echapper(a.titre)}</p>
      ${a.description ? `<p class="axe-texte">${echapper(a.description)}</p>` : '<p class="axe-texte t-3">Pas encore de phrase pour le client.</p>'}
      <div class="axe-reperes">${reperes(a, d, c)}</div>
      <p class="axe-fait${reponse ? '' : ' t-3'}" data-axe-reponse>${reponse || 'Pas encore de réponse du client.'}</p>
    </div>
    <div class="axe-pilotage">
      <span class="rang" style="gap:6px">${pastille(PUBLICATIONS_AXE, estPublie(a) ? 'publiee' : 'brouillon')}${(a.etat || 'propose') !== 'propose' ? pastille(ETATS_AXE, a.etat) : ''}</span>
      <span class="rang" style="gap:2px">
        <button class="btn-icone" type="button" data-axe-action="monter" data-id="${echapper(a.id)}" aria-label="Monter" data-astuce="Monter">${icone('chevronHaut')}</button>
        <button class="btn-icone" type="button" data-axe-action="descendre" data-id="${echapper(a.id)}" aria-label="Descendre" data-astuce="Descendre">${icone('chevron')}</button>
        <button class="btn btn-petit ${estPublie(a) ? 'btn-doux' : 'btn-secondaire'}" type="button" data-axe-action="publier" data-id="${echapper(a.id)}">${estPublie(a) ? 'Retirer' : 'Publier'}</button>
        <button class="btn-icone" type="button" data-axe-action="editer" data-id="${echapper(a.id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button>
        <button class="btn-icone" type="button" data-axe-action="menu" data-id="${echapper(a.id)}" aria-label="Plus d'actions">${icone('points')}</button>
      </span>
    </div>
  </li>`;
};

/* Le compteur d'une plateforme, discret : côté client, ce qu'il a coché ;
   côté équipe, publiés, réponses, brouillons. */
const compteur = (axes, equipe) => {
  if (!axes.length) return '';
  const repondus = axes.filter((a) => a.reponse && CHOIX_AXE[a.reponse.choix]).length;
  if (!equipe) return repondus ? `${repondus} sur ${axes.length}` : pluriel(axes.length, 'piste');
  const brouillons = axes.filter((a) => !estPublie(a)).length;
  return [pluriel(axes.length, 'axe'), repondus ? pluriel(repondus, 'réponse') : '', brouillons ? pluriel(brouillons, 'brouillon') : ''].filter(Boolean).join(' · ');
};

const INTRO_PAR_DEFAUT = 'Les pistes que nous voyons pour faire grandir votre projet, plateforme par plateforme. Cochez celles qui vous parlent et dites-nous ce que vous en pensez : rien n\'est engagé tant que vous ne le décidez pas.';

const pageHtml = (d, c, ouverts) => {
  const equipe = c.env.role === 'equipe';
  const plateformes = plateformesDe(d.composants, d.axes, equipe);
  const parPlateforme = (p) => d.axes.filter((a) => (PLATEFORMES_AXE[a.plateforme] ? a.plateforme : 'general') === p);
  const aucunResponsableIci = !equipe && d.axes.length && !d.axes.some((a) => peutRepondre(a, c)) && d.axes.some((a) => ETATS_AXE_CLIENT_AGIT.includes(a.etat || 'propose'));
  const tete = `<header class="page-tete">
    <div>
      <p class="surtitre">${echapper(d.projet.nom || '')}</p>
      <h1 style="margin-top:2px">Axes d'évolution</h1>
      <p class="chapo axe-intro" data-axes-intro>${echapper(d.intro || INTRO_PAR_DEFAUT)}</p>
      ${aucunResponsableIci ? `<p class="t-petit t-3" style="margin-top:8px" data-axes-reserve>C'est le responsable du projet qui coche les axes. Une idée à partager ? <button class="axe-ecrire" type="button" data-axe-action="ecrire">Écrivez-nous</button>.</p>` : ''}
    </div>
    ${equipe ? `<div class="actions">
      <button class="btn btn-secondaire" type="button" data-axe-action="intro">Modifier l'introduction</button>
      <button class="btn btn-principal" type="button" data-axe-action="nouveau">${icone('plus')} Nouvel axe</button>
    </div>` : ''}
  </header>`;
  if (!plateformes.length) {
    return `<div class="page page-axes">${tete}${vide({ icone: 'ampoule', titre: equipe ? 'Aucun axe pour le moment' : 'Bientôt ici', texte: equipe ? 'Ajoutez un axe, ou versez le fichier du projet avec axes-importer.mjs. Le client le voit une fois publié.' : 'Nos pistes pour faire grandir votre projet apparaîtront ici.' })}</div>`;
  }
  return `<div class="page page-axes">${tete}
    ${plateformes.map((p) => {
    const axes = parPlateforme(p);
    return `<section class="section axes-bloc" data-axes-plateforme="${echapper(p)}">
      <div class="section-tete">
        <h2>${echapper(PLATEFORMES_AXE[p].libelle)}</h2>
        <span class="rang" style="gap:10px"><span class="axes-compteur" data-axes-compteur>${echapper(compteur(axes, equipe))}</span>${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-axe-action="nouveau" data-plateforme="${echapper(p)}">${icone('plus')} Ajouter</button>` : ''}</span>
      </div>
      ${axes.length ? `<ol class="axes-liste">${axes.map((a, i) => (equipe ? ligneEquipe(a, d, c, i + 1) : ligneClient(a, d, c, ouverts))).join('')}</ol>` : '<p class="t-petit t-3">Aucun axe sur cette plateforme.</p>'}
    </section>`;
  }).join('')}
  </div>`;
};

/* --- Les gestes du client -------------------------------------------------- */

const repondre = async (a, choix, d, c, bouton) => {
  const { pid, env } = c;
  if (choix !== 'en-parler') {
    return agir(bouton, () => ecrire.repondreAxe(env.session, pid, a.id, choix),
      choix === 'interesse' ? 'C\'est noté. Nous revenons vers vous avec des idées concrètes.' : 'C\'est noté : nous le préparons pour vous, sans engagement.');
  }
  const ok = await confirmer({
    titre: 'On en parle ?',
    texte: `Nous ouvrons une demande « ${a.titre} » à votre nom, pour en discuter. Vous la suivez dans Demandes. Rien n'est engagé sans votre accord.`,
    ok: 'Oui, parlons-en',
  });
  if (!ok) return false;
  /* Une demande encore ouverte, déjà née de cet axe, est reprise : jamais une seconde. */
  const deja = d.tickets.find((t) => t.axe === a.id && OUVERTS.includes(t.statut));
  const plateforme = ['ios', 'android', 'web', 'admin', 'backend', 'landing'].includes(a.plateforme) ? a.plateforme : '';
  const composant = plateforme ? ((d.composants.find((x) => x.type === plateforme) || {}).id || '') : '';
  return agir(bouton, async () => {
    const tid = deja ? deja.id : await ecrire.creerDemande(env.session, pid, {
      titre: `Axe d'évolution : ${a.titre}`.slice(0, 120),
      description: [`J'aimerais parler de l'axe « ${a.titre} ».`, a.description || ''].filter(Boolean).join('\n\n').slice(0, 6000),
      type: 'fonctionnalite', urgence: 'important', plateforme, composant, axe: a.id,
    });
    await ecrire.repondreAxe(env.session, pid, a.id, 'en-parler', tid);
  }, 'Une demande est ouverte à votre nom : nous revenons vers vous.');
};

/* --- Les gestes de l'équipe ------------------------------------------------- */

const editerAxe = (env, { pid, fiche = null, plateforme = '', d }) => {
  const finance = peut(env.session, 'finance.gerer', pid);
  const prix = fiche ? montantDe(pid, `axe-${fiche.id}`) : null;
  const devis = Object.fromEntries(d.documents.filter((x) => x.type === 'devis').map((x) => [x.id, { libelle: `${x.numero || 'Devis'}${x.libelle ? ` · ${x.libelle}` : ''}` }]));
  const ordreSuivant = d.axes.filter((a) => a.plateforme === (plateforme || 'general')).reduce((m, a) => Math.max(m, Number(a.ordre) || 0), 0) + 1;
  return feuille({
    titre: fiche ? 'L\'axe d\'évolution' : 'Nouvel axe d\'évolution',
    sousTitre: 'Une piste de croissance, en mots simples : le client la lit telle quelle.',
    corps: `
      ${select('plateforme', 'Plateforme', Object.fromEntries(Object.entries(PLATEFORMES_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.plateforme : (plateforme || 'general'))}
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Widgets sur l\'écran d\'accueil' })}
      ${zone('description', 'En une phrase', fiche ? fiche.description : '', { lignes: 2, placeholder: 'Ce que vos utilisateurs y gagnent, concrètement.' })}
      <div class="forme-rang">
        ${select('apport', 'Ce que ça apporte', Object.fromEntries(Object.entries(APPORTS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.apport : '', { vide: 'Non précisé' })}
        ${select('ampleur', 'Ampleur', Object.fromEntries(Object.entries(AMPLEURS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.ampleur : '', { vide: 'Non précisée' })}
      </div>
      ${zone('detail', 'En savoir plus', fiche ? fiche.detail : '', { facultatif: true, lignes: 4, aide: 'Un paragraphe de plus, que le client déplie. Rien de technique.' })}
      <div class="forme-rang">
        ${select('etat', 'État', Object.fromEntries(Object.entries(ETATS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.etat : 'propose', { aide: '« Au programme » et « En place » se lisent chez le client.' })}
        ${select('publication', 'Publication', Object.fromEntries(Object.entries(PUBLICATIONS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.publication : 'brouillon', { aide: 'Publié : le client le voit.' })}
      </div>
      <div class="forme-rang">
        ${select('devis', 'Devis lié', devis, fiche ? fiche.devis : '', { vide: 'Aucun' })}
        ${finance ? champ('prix', 'Prix HT (€)', typeof prix === 'number' ? prix : '', { type: 'number', facultatif: true, aide: 'Lu par le responsable du projet seulement.', attrs: 'min="0" step="1"' }) : ''}
      </div>
      ${champ('ordre', 'Ordre', fiche ? (fiche.ordre || 0) : ordreSuivant, { type: 'number', attrs: 'min="0" step="1"' })}`,
    regles: {
      titre: (v) => (!v ? 'Un titre, s\'il vous plaît.' : (v.length > BORNES_AXE.titre ? `${BORNES_AXE.titre} caractères au plus.` : '')),
      description: (v) => (v && v.length > BORNES_AXE.description ? `${BORNES_AXE.description} caractères au plus.` : ''),
      detail: (v) => (v && v.length > BORNES_AXE.detail ? `${BORNES_AXE.detail} caractères au plus.` : ''),
    },
    enregistrer: async (v) => {
      const donnees = {
        plateforme: v.plateforme, titre: v.titre, description: v.description || '', detail: v.detail || '',
        apport: v.apport || '', ampleur: v.ampleur || '', etat: v.etat || 'propose', publication: v.publication,
        devis: v.devis || '', ordre: Number(v.ordre) || 0,
      };
      let id = fiche ? fiche.id : '';
      if (fiche) {
        if (donnees.publication === 'publiee' && fiche.publication !== 'publiee') donnees.publieLe = horodatage();
        if (donnees.publication !== 'publiee') donnees.publieLe = null;
        await ecrire.majAxe(pid, fiche.id, donnees);
      } else {
        const ref = await ecrire.creerAxe(pid, donnees);
        id = ref.id;
      }
      if (finance && id && (v.prix !== null || typeof prix === 'number')) await ecrire.poserMontant(pid, `axe-${id}`, v.prix);
      toast(fiche ? 'Axe mis à jour.' : (donnees.publication === 'publiee' ? 'Axe publié : le client le voit.' : 'Axe enregistré en brouillon.'));
    },
  });
};

const editerIntro = (pid, texte) => feuille({
  titre: 'L\'introduction', sousTitre: 'Ce que lit le client en haut de la page.',
  corps: zone('texte', 'Le texte', texte || INTRO_PAR_DEFAUT, { lignes: 5, aide: '1 000 caractères au plus. Vide : le texte par défaut revient.' }),
  regles: { texte: (v) => (v && v.length > BORNES_AXE.intro ? `${BORNES_AXE.intro} caractères au plus.` : '') },
  enregistrer: async (v) => { await ecrire.poserIntroAxes(pid, v.texte === INTRO_PAR_DEFAUT ? '' : v.texte); toast('Introduction mise à jour.'); },
});

/* Monter ou descendre dans sa plateforme : on échange l'ordre avec la
   voisine ; des ordres en double ou manquants sont d'abord renumérotés. */
const deplacer = async (pid, a, axes, sens) => {
  const voisins = axes.filter((x) => x.plateforme === a.plateforme).sort(parOrdre);
  const i = voisins.findIndex((x) => x.id === a.id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= voisins.length) return;
  const ordres = voisins.map((x) => Number(x.ordre) || 0);
  const propres = ordres.every((o, k) => o > 0 && (k === 0 || o > ordres[k - 1]));
  if (!propres) await Promise.all(voisins.map((x, k) => (k === i || k === j ? null : ecrire.majAxe(pid, x.id, { ordre: k + 1 }))).filter(Boolean));
  const oa = propres ? ordres[i] : i + 1;
  const ob = propres ? ordres[j] : j + 1;
  await Promise.all([ecrire.majAxe(pid, voisins[i].id, { ordre: ob }), ecrire.majAxe(pid, voisins[j].id, { ordre: oa })]);
};

/* ==========================================================================
   La vue
   ========================================================================== */

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  const equipe = env.role === 'equipe';
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  abonnerProjet(lot, pid, env.role);
  const c = { pid, env };
  const finance = voitPrix(c);
  const cles = [K.projet(pid), K.composants(pid), K.axes(pid), K.axesIntro(pid), K.tickets(pid), ...(finance ? [K.montants(pid), K.documents(pid)] : [])];
  /* Les lignes cochées sans geste encore : un état d'écran, gardé d'un
     dessin à l'autre. Cocher ne redessine rien : la classe suffit. */
  const ouverts = new Set();
  let derniere = '';

  const rendre = () => {
    const d = lireTout(pid, env);
    if (d.projet === undefined && !magasin.erreur(K.projet(pid))) return;
    const emp = magasin.empreinte([...cles, K.projets]);
    if (emp === derniere) return;
    if (!d.projet) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`;
      derniere = emp;
      return;
    }
    titrePage(`Axes d'évolution · ${d.projet.nom}`);
    filAriane([{ libelle: equipe ? 'Projets' : 'Accueil', chemin: equipe ? '/projets' : '/' }, { libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Axes d\'évolution' }]);
    const focus = document.activeElement && sortie.contains(document.activeElement) ? document.activeElement.id : '';
    sortie.innerHTML = pageHtml(d, c, ouverts);
    if (focus) { const el = document.getElementById(focus); if (el) el.focus({ preventScroll: true }); }
    derniere = emp;
  };

  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  lot.sur(K.projets, planifier);
  planifier();

  /* Cocher, décocher. */
  const surCase = async (ev) => {
    const el = ev.target;
    if (!el || !el.matches || !el.matches('[data-axe-case]')) return;
    const id = el.dataset.axeCase;
    const ligne = el.closest('.axe');
    const d = lireTout(pid, env);
    const a = d.axes.find((x) => x.id === id);
    if (!a) return;
    if (el.checked) { ouverts.add(id); if (ligne) ligne.classList.add('est-cochee'); return; }
    if (a.reponse && CHOIX_AXE[a.reponse.choix]) {
      const ok = await confirmer({ titre: 'Retirer votre choix ?', texte: `« ${a.titre} » redevient une simple piste. Vous pourrez la recocher quand vous voudrez.`, ok: 'Retirer' });
      if (!ok) { el.checked = true; return; }
      ouverts.delete(id);
      await agir(null, () => ecrire.repondreAxe(env.session, pid, id, null), 'Votre choix est retiré.');
      return;
    }
    ouverts.delete(id);
    if (ligne) ligne.classList.remove('est-cochee');
  };
  sortie.addEventListener('change', surCase);

  const gestesClient = sur(sortie, 'click', '[data-axe-geste]', async (el) => {
    const d = lireTout(pid, env);
    const a = d.axes.find((x) => x.id === el.dataset.id);
    if (!a || !peutRepondre(a, c)) return;
    const choix = el.dataset.axeGeste;
    if (!CHOIX_AXE[choix] || (a.reponse && a.reponse.choix === choix)) return;
    await repondre(a, choix, d, c, el);
  });

  const gestesEquipe = sur(sortie, 'click', '[data-axe-action]', async (el) => {
    const d = lireTout(pid, env);
    const action = el.dataset.axeAction;
    if (action === 'ecrire') { ouvrirBulle(pid, 'À propos des axes d\'évolution : '); return; }
    if (!equipe) return;
    if (action === 'nouveau') { editerAxe(env, { pid, plateforme: el.dataset.plateforme || '', d }); return; }
    if (action === 'intro') { editerIntro(pid, d.intro); return; }
    const a = d.axes.find((x) => x.id === el.dataset.id);
    if (!a) return;
    if (action === 'editer') { editerAxe(env, { pid, fiche: a, d }); return; }
    if (action === 'publier') {
      const oui = !estPublie(a);
      await agir(el, () => ecrire.publierAxe(pid, a.id, oui), oui ? 'Axe publié : le client le voit.' : 'Axe retiré : le client ne le voit plus.');
      return;
    }
    if (action === 'monter' || action === 'descendre') { await agir(el, () => deplacer(pid, a, d.axes, action === 'monter' ? -1 : 1)); return; }
    if (action === 'menu') {
      menu(el, [
        { libelle: 'Modifier', icone: 'edit', action: () => editerAxe(env, { pid, fiche: a, d }) },
        { titre: 'État' },
        ...Object.entries(ETATS_AXE).map(([cle, f]) => ({
          cle, libelle: `${f.libelle}${cle === (a.etat || 'propose') ? '  ·  actuel' : ''}`,
          action: () => (cle === (a.etat || 'propose') ? null : agir(null, () => ecrire.majAxe(pid, a.id, { etat: cle }), `Axe « ${f.libelle.toLowerCase()} ».`)),
        })),
        '-',
        { libelle: 'Supprimer', icone: 'corbeille', danger: true, action: async () => {
          if (await confirmer({ titre: 'Supprimer cet axe ?', texte: 'Il disparaît, réponse du client comprise. Pour le cacher sans rien perdre, retirez-le plutôt.', ok: 'Supprimer', danger: true })) {
            agir(null, async () => { await ecrire.supprimerAxe(pid, a.id); if (typeof montantDe(pid, `axe-${a.id}`) === 'number') await ecrire.poserMontant(pid, `axe-${a.id}`, null); }, 'Axe supprimé.');
          }
        } },
      ]);
    }
  });

  return {
    fin: () => { planifier.arreter(); sortie.removeEventListener('change', surCase); gestesClient(); gestesEquipe(); lot.fin(); },
  };
};

