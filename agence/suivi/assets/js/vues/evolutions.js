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

import { echapper, dateCourte, pluriel, montant, montantHT, sansTaxe, estResponsable, OUVERTS, peut } from '../noyau.js';
import { franchise } from '../tarifs.js';
import { icone, pastille, vide, squelette, titrePage, confirmer, toast, sur, menu, agir, modale } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, abonnerProjet, abonnerPanier, montantDe, horodatage } from '../donnees.js';
import { photoDuPanier, dessinPhoto, libelleDemande, axePanierable, MAX_PANIER } from '../panier.js';
import { filAriane } from '../coquille.js';
import { feuille, champ, zone, choix as select } from './editeurs.js';
import {
  PLATEFORMES_AXE, APPORTS_AXE, AMPLEURS_AXE, ETATS_AXE, ETATS_AXE_CLIENT_AGIT, PUBLICATIONS_AXE, CHOIX_AXE, BORNES_AXE, joursTexte, joursValides,
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
/* Le calculateur aussi : le responsable seul, côté client (même règle). */
const avecPanier = ({ pid, env }) => env.role !== 'equipe' && estResponsable(env.session, pid);
/* Les axes du panier, tels que la page les connaît encore : publiés, et
   toujours « proposés » ou « au programme ». */
const idsPanier = (pid) => ((magasin.lire(K.panier(pid)) || {}).axes || []).map(String);

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
    panier: idsPanier(pid).filter((id) => axes.some((a) => a.id === id && axePanierable(a))),
  };
};

/* --- Le dessin d'une ligne ------------------------------------------------ */

/* L'ampleur : trois marches, une à trois pleines. Le repère tient à la
   forme, pas à un pictogramme. */
const jaugeAmpleur = (cle) => {
  const a = AMPLEURS_AXE[cle];
  if (!a) return '';
  return `<span class="axe-ampleur axe-ampleur--${echapper(cle)}"><span class="axe-marches" aria-hidden="true">${[1, 2, 3].map((n) => `<i${n <= a.marches ? ' class="pleine"' : ''}></i>`).join('')}</span>${echapper(a.libelle)}</span>`;
};

const reperes = (a, d, c) => {
  const equipe = c.env.role === 'equipe';
  const prix = voitPrix(c) ? montantDe(c.pid, `axe-${a.id}`) : null;
  const devis = a.devis && voitPrix(c) ? d.documents.find((x) => x.id === a.devis) : null;
  const etat = ETATS_AXE[a.etat || 'propose'] || ETATS_AXE.propose;
  return [
    APPORTS_AXE[a.apport] ? `<span class="axe-apport axe-apport--${echapper(APPORTS_AXE[a.apport].ton || 'bleu')}" data-astuce="${echapper(APPORTS_AXE[a.apport].aide)}">${echapper(APPORTS_AXE[a.apport].libelle)}</span>` : '',
    jaugeAmpleur(a.ampleur),
    joursValides(a.jours) ? `<span class="axe-jours" data-axe-jours data-astuce="Estimation approximative du temps de réalisation"><span class="axe-environ" aria-hidden="true">≈</span>${echapper(joursTexte(a.jours))}<span class="sr-only"> environ</span></span>` : '',
    !equipe && etat.client ? `<span class="axe-etat">${echapper(etat.client)}</span>` : '',
    /* Franchise en base de TVA : le prix payé, sans « HT ». */
    typeof prix === 'number' ? `<span class="axe-prix" data-axe-prix>${echapper((devis ? sansTaxe(devis) : franchise(magasin.lire(K.tarifs))) ? montant(prix) : montantHT(prix))}</span>` : '',
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
  const auPanier = d.panier.includes(a.id);
  const panier = peutAgir && avecPanier(c) && axePanierable(a);
  const coche = Boolean(r) || (peutAgir && (ouverts.has(a.id) || auPanier));
  const idCase = `axe-case-${a.id}`;
  return `<li class="axe${coche ? ' est-cochee' : ''}${r ? ' a-choisi' : ''}${auPanier ? ' est-au-panier' : ''}" data-axe="${echapper(a.id)}">
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
        ${panier ? `<button class="btn btn-petit ${auPanier ? 'btn-doux' : 'btn-secondaire'} axe-panier" type="button" data-axe-panier="${auPanier ? 'retirer' : 'ajouter'}" data-id="${echapper(a.id)}" aria-pressed="${auPanier ? 'true' : 'false'}">${auPanier ? 'Retirer du calculateur' : 'Ajouter au calculateur'}</button>` : ''}
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

const pageHtml = (d, c, ouverts, filtre = '') => {
  const equipe = c.env.role === 'equipe';
  const plateformes = plateformesDe(d.composants, d.axes, equipe);
  const parPlateforme = (p) => d.axes.filter((a) => (PLATEFORMES_AXE[a.plateforme] ? a.plateforme : 'general') === p);
  const aucunResponsableIci = !equipe && d.axes.length && !d.axes.some((a) => peutRepondre(a, c)) && d.axes.some((a) => ETATS_AXE_CLIENT_AGIT.includes(a.etat || 'propose'));
  /* Le calculateur reste en haut à droite pendant qu'on descend la page :
     c'est vers lui que file une ligne ajoutée. */
  const ancre = avecPanier(c) ? `<div class="panier-ancre"><button class="btn btn-secondaire panier-bouton${d.panier.length ? ' est-plein' : ''}" type="button" data-panier-ouvrir aria-label="${echapper(`Ouvrir le calculateur : ${d.panier.length} axe${d.panier.length > 1 ? 's' : ''}`)}">${icone('panier')}<span>Calculateur</span><span class="panier-compte" data-panier-compte>${d.panier.length}</span></button></div>` : '';
  const tete = `${ancre}<header class="page-tete">
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
    return `<div class="page page-axes${ancre ? ' page-axes--panier' : ''}">${tete}${vide({ icone: 'ampoule', titre: equipe ? 'Aucun axe pour le moment' : 'Bientôt ici', texte: equipe ? 'Ajoutez un axe, ou versez le fichier du projet avec axes-importer.mjs. Le client le voit une fois publié.' : 'Nos pistes pour faire grandir votre projet apparaîtront ici.' })}</div>`;
  }
  const filtres = plateformes.length > 1 ? `<div class="segments axes-filtre" role="group" aria-label="Plateforme">
      ${[['', 'Tout'], ...plateformes.map((p) => [p, PLATEFORMES_AXE[p].libelle])].map(([cle, lib]) => `<button type="button" class="segment${(filtre || '') === cle ? ' actif' : ''}" data-axe-filtre="${echapper(cle)}" aria-pressed="${(filtre || '') === cle}">${echapper(lib)}</button>`).join('')}
    </div>` : '';
  const visibles = filtre && plateformes.includes(filtre) ? [filtre] : plateformes;
  return `<div class="page page-axes${ancre ? ' page-axes--panier' : ''}">${tete}${filtres}
    ${visibles.map((p) => {
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
    texte: `Nous ouvrons un ticket « ${a.titre} » à votre nom, pour en discuter. Vous le suivez dans Tickets. Rien n'est engagé sans votre accord.`,
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
  }, 'Un ticket est ouvert à votre nom : nous revenons vers vous.');
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
        ${champ('jours', 'Jours estimés', fiche && joursValides(fiche.jours) ? fiche.jours : '', { type: 'number', facultatif: true, aide: 'Lu par le client comme « ≈ 3 jours ».', attrs: 'min="0.5" max="120" step="0.5"' })}
      </div>
      ${zone('detail', 'En savoir plus', fiche ? fiche.detail : '', { facultatif: true, lignes: 4, aide: 'Un paragraphe de plus, que le client déplie. Rien de technique.' })}
      <div class="forme-rang">
        ${select('etat', 'État', Object.fromEntries(Object.entries(ETATS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.etat : 'propose', { aide: '« Au programme » et « En place » se lisent chez le client.' })}
        ${select('publication', 'Publication', Object.fromEntries(Object.entries(PUBLICATIONS_AXE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.publication : 'brouillon', { aide: 'Publié : le client le voit.' })}
      </div>
      <div class="forme-rang">
        ${select('devis', 'Devis lié', devis, fiche ? fiche.devis : '', { vide: 'Aucun' })}
        ${finance ? champ('prix', franchise(magasin.lire(K.tarifs)) ? 'Prix (€)' : 'Prix HT (€)', typeof prix === 'number' ? prix : '', { type: 'number', facultatif: true, aide: 'Lu par le responsable du projet seulement.', attrs: 'min="0" step="1"' }) : ''}
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
        jours: joursValides(Number(v.jours)) ? Number(v.jours) : null,
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

/* --- Le calculateur ------------------------------------------------------- */

const reduit = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* La ligne ajoutée file vers le calculateur : une étiquette à son titre
   part de la ligne et se pose sur le bouton, qui rebondit une fois. Sans
   mouvement si le système le demande. */
const filerVersPanier = (depart, cible, titre) => new Promise((fini) => {
  if (!depart || !cible || reduit() || typeof document.body.animate !== 'function') { fini(); return; }
  const a = (depart.querySelector('.axe-titre') || depart).getBoundingClientRect();
  const b = cible.getBoundingClientRect();
  const fantome = document.createElement('div');
  fantome.className = 'panier-fantome';
  fantome.setAttribute('aria-hidden', 'true');
  fantome.textContent = titre;
  fantome.style.left = `${a.left}px`;
  fantome.style.top = `${a.top}px`;
  document.body.appendChild(fantome);
  const f = fantome.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (f.left + f.width / 2);
  const dy = (b.top + b.height / 2) - (f.top + f.height / 2);
  const anim = fantome.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 24}px) scale(.7)`, opacity: 0.9, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
  ], { duration: 560, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  const fin = () => { fantome.remove(); fini(); };
  anim.onfinish = fin; anim.oncancel = fin;
});
const rebondir = (el) => {
  if (!el || reduit() || typeof el.animate !== 'function') return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2, .8, .3, 1)' });
};

/* La modale du calculateur : les lignes, la somme, et « Demander un
   devis ». Elle se redessine elle-même quand on retire une ligne. */
const ouvrirPanier = (c) => {
  const { pid, env } = c;
  const lire = () => {
    const d = lireTout(pid, env);
    const axes = d.panier.map((id) => d.axes.find((a) => a.id === id)).filter(Boolean);
    return { d, axes, photo: photoDuPanier({ axes, projet: d.projet, grille: magasin.lire(K.tarifs) }) };
  };
  const corpsDe = ({ axes, photo }) => (axes.length
    ? dessinPhoto(photo, { retirer: true })
    : '<div class="panier-vide"><p class="t-corps-fort">Votre calculateur est vide.</p><p class="t-petit t-2">Cochez un axe, puis « Ajouter au calculateur » : le temps estimé et le prix s\'additionnent ici.</p></div>');
  const piedDe = ({ axes }) => `${axes.length ? '<button class="btn btn-fantome" type="button" data-panier-vider>Vider</button>' : ''}<span class="pousse"></span><button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>${axes.length ? '<button class="btn btn-principal" type="button" data-panier-demander>Demander un devis</button>' : ''}`;
  let etat = lire();
  const m = modale({ titre: 'Votre calculateur', sousTitre: `${etat.d.projet.nom || ''} · les axes que vous avez retenus`, corps: corpsDe(etat), pied: piedDe(etat), large: true });
  m.el.classList.add('voile--panier');
  const redessiner = () => { etat = lire(); m.corps.innerHTML = corpsDe(etat); m.pied.innerHTML = piedDe(etat); };
  sur(m.el, 'click', '[data-panier-retirer]', async (el) => {
    const reste = etat.d.panier.filter((id) => id !== el.dataset.panierRetirer);
    if (await agir(el, () => ecrire.poserPanier(env.session, pid, reste))) redessiner();
  });
  sur(m.el, 'click', '[data-panier-vider]', async (el) => {
    if (!(await confirmer({ titre: 'Vider le calculateur ?', texte: 'Les axes restent sur la page : vous pourrez les ajouter de nouveau.', ok: 'Vider' }))) return;
    if (await agir(el, () => ecrire.poserPanier(env.session, pid, []), 'Calculateur vidé.')) m.fermer(true);
  });
  sur(m.el, 'click', '[data-panier-demander]', async (el) => {
    const { axes } = lire();
    if (!axes.length) return;
    const ok = await confirmer({
      titre: 'Demander un devis ?',
      texte: `Nous recevons votre sélection (${axes.length} axe${axes.length > 1 ? 's' : ''}) et vous préparons un devis. Vous suivez la demande dans Devis et factures, et pouvez l'annuler tant que nous n'avons pas répondu.`,
      ok: 'Demander le devis',
    });
    if (!ok) return;
    /* La photo est prise au moment de l'envoi : ce que le client a vu. */
    const photo = photoDuPanier({ axes, projet: lire().d.projet, grille: magasin.lire(K.tarifs) });
    if (await agir(el, () => ecrire.demanderDevis(env.session, pid, { libelle: libelleDemande(photo), photo, axes: axes.map((a) => a.id) }), 'Demande envoyée : vous la suivez dans Devis et factures.')) m.fermer(true);
  });
  return m.fin;
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
  const calculateur = avecPanier(c);
  if (calculateur) abonnerPanier(lot, pid, env.session.utilisateur.uid);
  const cles = [K.projet(pid), K.composants(pid), K.axes(pid), K.axesIntro(pid), K.tickets(pid), ...(finance ? [K.montants(pid), K.documents(pid)] : []), ...(calculateur ? [K.panier(pid)] : [])];
  /* Les lignes cochées sans geste encore : un état d'écran, gardé d'un
     dessin à l'autre. Cocher ne redessine rien : la classe suffit. */
  const ouverts = new Set();
  let derniere = '';
  let filtre = '';
  let dernierFiltre = null;

  const rendre = () => {
    const d = lireTout(pid, env);
    if (d.projet === undefined && !magasin.erreur(K.projet(pid))) return;
    const emp = magasin.empreinte([...cles, K.projets]);
    if (emp === derniere && filtre === dernierFiltre) return;
    dernierFiltre = filtre;
    if (!d.projet) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`;
      derniere = emp;
      return;
    }
    titrePage(`Axes d'évolution · ${d.projet.nom}`);
    filAriane([{ libelle: equipe ? 'Projets' : 'Accueil', chemin: equipe ? '/projets' : '/' }, { libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Axes d\'évolution' }]);
    const focus = document.activeElement && sortie.contains(document.activeElement) ? document.activeElement.id : '';
    sortie.innerHTML = pageHtml(d, c, ouverts, filtre);
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
    /* Décocher une ligne du calculateur l'en retire aussi : la case dit
       « je n'en veux plus ». */
    if (d.panier.includes(id)) await agir(null, () => ecrire.poserPanier(env.session, pid, d.panier.filter((x) => x !== id)));
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
  /* Le filtre de plateforme, en haut : « Tout » par défaut. */
  const gesteFiltre = sur(sortie, 'click', '[data-axe-filtre]', (el) => { filtre = el.dataset.axeFiltre || ''; rendre(); });

  const gestesClient = sur(sortie, 'click', '[data-axe-geste]', async (el) => {
    const d = lireTout(pid, env);
    const a = d.axes.find((x) => x.id === el.dataset.id);
    if (!a || !peutRepondre(a, c)) return;
    const choix = el.dataset.axeGeste;
    if (!CHOIX_AXE[choix] || (a.reponse && a.reponse.choix === choix)) return;
    await repondre(a, choix, d, c, el);
  });

  /* Le calculateur : ajouter (la ligne file vers le bouton), retirer, ouvrir. */
  const gestesPanier = sur(sortie, 'click', '[data-axe-panier], [data-panier-ouvrir]', async (el) => {
    if (!calculateur) return;
    if (el.hasAttribute('data-panier-ouvrir')) { ouvrirPanier(c); return; }
    const d = lireTout(pid, env);
    const a = d.axes.find((x) => x.id === el.dataset.id);
    if (!a || !axePanierable(a)) return;
    if (el.dataset.axePanier === 'retirer') {
      await agir(el, () => ecrire.poserPanier(env.session, pid, d.panier.filter((x) => x !== a.id)), 'Retiré du calculateur.');
      return;
    }
    if (d.panier.includes(a.id)) return;
    if (d.panier.length >= MAX_PANIER) { toast(`Le calculateur garde ${MAX_PANIER} axes au plus.`, 'erreur'); return; }
    el.disabled = true;
    await filerVersPanier(el.closest('.axe'), sortie.querySelector('[data-panier-ouvrir]'), a.titre);
    if (await agir(null, () => ecrire.poserPanier(env.session, pid, [...d.panier, a.id]))) rebondir(sortie.querySelector('[data-panier-ouvrir]'));
    else el.disabled = false;
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
    fin: () => { planifier.arreter(); sortie.removeEventListener('change', surCase); gestesClient(); gestesPanier(); gestesEquipe(); gesteFiltre(); lot.fin(); },
  };
};

