/* ==========================================================================
   CAPMEDIA CLIENT HUB · les annonces de Capmedia

   Côté client (#/annonces, en bas du rail, après Paramètres) : les annonces
   publiées qui le visent, épinglées puis plus récentes d'abord. Chacune dit
   son type (un mot teinté, sans pictogramme), sa date d'effet et son texte.
   Une annonce « tarif » porte un encart calculé pour lui, projet par
   projet : long ou court, et le prix par jour qui s'applique. Une annonce
   « indisponibilite » dit sa période. Ouvrir la page marque tout comme lu
   (profils/{uid}.annoncesLues).

   Côté Cockpit (#/annonces, zone Gestion) : créer, modifier, publier,
   retirer, épingler, choisir les clients visés, et voir l'annonce comme le
   client la lit, encart tarif compris, pour un client choisi. Les congés
   se posent ici (type « Indisponibilité »).
   ========================================================================== */

import { echapper, dateCourte, pluriel, montantHT, enDate, peut, estAdmin } from '../noyau.js';
import { icone, pastille, vide, squelette, titrePage, confirmer, toast, sur, menu, agir, modale } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, horodatage } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { feuille, champ, zone, choix as select } from './editeurs.js';
import {
  TYPES_ANNONCE, PUBLICATIONS_ANNONCE, BORNES_ANNONCE, PHRASE_LONG, PHRASE_COURT, INTRO_ANNONCES,
  estPubliee, dateFr, grilleALaDate, verdictTarif, projetsTarifables, periode, periodeTexte, parOrdreAnnonce, estNonLue, cibleTexte,
} from '../annonces-format.js';
import { grilleDe, periodeA, prix, franchise } from '../tarifs.js';

/* --- Le dessin d'une annonce, le même des deux côtés ---------------------- */

const paragraphes = (texte) => echapper(String(texte || '').trim()).split(/\n{2,}/).filter(Boolean).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');

const repereType = (a) => {
  const t = TYPES_ANNONCE[a.type] || TYPES_ANNONCE.information;
  return `<span class="annonce-type annonce-type--${echapper(t.ton)}" data-annonce-type="${echapper(a.type)}">${echapper(t.libelle)}</span>`;
};

/** L'encart d'un tarif : la grille à la date d'effet (reglages/tarifs, la
    source unique), puis une phrase par projet du lecteur, avant et après. */
const encartTarif = (a, { projets, grille }) => {
  const r = grilleALaDate(a, grille);
  const seuil = echapper(pluriel(r.seuilMois, 'mois', 'mois'));
  const grilleHtml = `<div class="annonce-tarifs">
    <div class="annonce-tarif"><p class="annonce-tarif-qui">Projets longs <span class="t-3">(plus de ${seuil})</span></p><p class="annonce-tarif-prix" data-tarif-long>${echapper(prix(r.long, grille) || '-')}<span> par jour</span></p></div>
    <div class="annonce-tarif"><p class="annonce-tarif-qui">Projets courts <span class="t-3">(moins de ${seuil})</span></p><p class="annonce-tarif-prix" data-tarif-court>${echapper(prix(r.court, grille) || '-')}<span> par jour</span></p></div>
  </div>`;
  if (!projets) return grilleHtml;
  const verdicts = projets.map((p) => verdictTarif(a, p, grille)).filter(Boolean);
  return `${grilleHtml}<div class="annonce-encart" data-encart-tarif>
    <p class="surtitre">Pour vos projets</p>
    ${verdicts.length
    ? `<ul class="annonce-verdicts">${verdicts.map((v) => `<li data-tarif-projet="${echapper(v.projet)}" data-tarif-tjm="${echapper(v.tjm)}" data-tarif-avant="${echapper(v.tjmAvant === null ? '' : v.tjmAvant)}"><span class="annonce-duree annonce-duree--${v.long ? 'long' : 'court'}">${v.long ? 'Projet long' : 'Projet court'}</span><span>${echapper(v.phrase)}</span></li>`).join('')}</ul>`
    : '<p class="t-petit t-2">Aucun projet en cours : le tarif s\'appliquera à votre prochain projet, selon sa durée.</p>'}
  </div>`;
};

const blocPeriode = (a) => {
  const p = periode(a);
  if (!p) return '';
  return `<div class="annonce-periode" data-annonce-periode>
    <p class="annonce-periode-dates">${echapper(periodeTexte(p).replace(/^./, (c) => c.toUpperCase()))}</p>
    ${p.message ? `<p class="t-petit t-2">${echapper(p.message)}</p>` : ''}
  </div>`;
};

/* Franchise en base de TVA : la grille est en euros, sans « hors taxes ».
   La première annonce de 2027 le disait ; le texte reste modifiable dans
   le Cockpit, mais le client ne lit jamais « hors taxes » sur un prix payé. */
const texteTarif = (texte, grille) => (franchise(grille) ? String(texte).replace(/\s+hors taxes\b/g, '') : texte);

/** Une annonce, telle que le client la lit. `projets` : ceux du lecteur. */
export const annonceHtml = (a, { projets = null, grille = null, nouvelle = false } = {}) => {
  const effet = dateFr(a.dateEffet);
  return `<article class="annonce carte" data-annonce="${echapper(a.id || '')}">
    <div class="annonce-tete">
      ${repereType(a)}
      ${a.epinglee ? '<span class="annonce-marque">Épinglée</span>' : ''}
      ${nouvelle ? '<span class="annonce-marque annonce-marque--neuve" data-annonce-nouvelle>Nouveau</span>' : ''}
      ${effet ? `<span class="annonce-effet" data-annonce-effet>À partir du ${echapper(effet)}</span>` : ''}
    </div>
    <h2 class="annonce-titre">${echapper(a.titre || '')}</h2>
    ${a.texte ? `<div class="prose annonce-texte">${paragraphes(a.type === 'tarif' ? texteTarif(a.texte, grille) : a.texte)}</div>` : ''}
    ${a.type === 'tarif' ? encartTarif(a, { projets, grille }) : ''}
    ${a.type === 'indisponibilite' ? blocPeriode(a) : ''}
    <p class="annonce-pied">${estPubliee(a) && enDate(a.publieLe) ? `Publiée le ${echapper(dateFr(a.publieLe))}` : (estPubliee(a) ? 'Publiée à l\'instant' : 'Brouillon, pas encore publiée')}</p>
  </article>`;
};

const introDe = () => (((magasin.lire(K.reglagesAnnonces) || {}).intro || '').trim()) || INTRO_ANNONCES;

/* ==========================================================================
   Le client
   ========================================================================== */

const vueClient = (ctx, env) => {
  const { session } = env;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  titrePage('Annonces Capmedia');
  filAriane([{ libelle: 'Accueil', chemin: '/' }, { libelle: 'Annonces Capmedia' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  const uid = session.utilisateur.uid;
  const projetsDuClient = () => projetsTarifables((magasin.lire(K.projets) || session.projets || []).filter((p) => !p.archive));
  const cles = [K.annonces, K.profil, K.projets, K.reglagesAnnonces, K.tarifs];
  /* La lecture d'avant l'ouverture : ce qui a été publié depuis porte
     « Nouveau » le temps de la visite, même une fois marqué lu. */
  let luAvant;
  let marque = false;

  const rendre = () => {
    const profil = magasin.lire(K.profil) || {};
    if (luAvant === undefined) luAvant = { annoncesLues: profil.annoncesLues || null };
    const annonces = (magasin.lire(K.annonces) || []).filter(estPubliee).slice().sort(parOrdreAnnonce);
    const projets = projetsDuClient();
    sortie.innerHTML = `<div class="page page-annonces">
      <header class="page-tete"><div>
        <h1>Annonces Capmedia</h1>
        <p class="chapo" data-annonces-intro>${echapper(introDe())}</p>
      </div></header>
      ${annonces.length
    ? `<div class="annonces-liste">${annonces.map((a) => annonceHtml(a, { projets, grille: magasin.lire(K.tarifs), nouvelle: estNonLue(a, luAvant) })).join('')}</div>`
    : vide({ icone: 'porteVoix', titre: 'Aucune annonce pour le moment', texte: 'Les nouvelles de Capmedia apparaîtront ici.' })}
    </div>`;
    /* Ouvrir la page, c'est lire : une date dans le profil, une seule
       écriture par arrivée de nouveautés. */
    const aLire = annonces.some((a) => estNonLue(a, profil));
    if (aLire && !marque) {
      marque = true;
      ecrire.marquerAnnoncesLues(uid).catch(() => {}).finally(() => { setTimeout(() => { marque = false; }, 1500); });
    }
  };

  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();
  return { fin: () => { planifier.arreter(); lot.fin(); } };
};

/* ==========================================================================
   Le Cockpit
   ========================================================================== */

/* Les sociétés choisies, dépliées en comptes : ses membres et ceux de ses
   projets. C'est cette liste que lisent les règles. */
const comptesDe = (organisations) => {
  const projets = magasin.lire(K.projets) || [];
  const orgs = magasin.lire(K.organisations) || [];
  const uids = new Set();
  organisations.forEach((oid) => {
    const o = orgs.find((x) => x.id === oid);
    ((o && o.membres) || []).forEach((u) => uids.add(u));
    projets.filter((p) => p.organisation === oid).forEach((p) => (p.membres || []).forEach((u) => uids.add(u)));
  });
  return [...uids].slice(0, 500);
};

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const editerAnnonce = (fiche = null) => {
  const orgs = (magasin.lire(K.organisations) || []).slice().sort((a, b) => String(a.entreprise || a.nom || '').localeCompare(String(b.entreprise || b.nom || '')));
  const type = fiche ? fiche.type : 'information';
  const t = (fiche && fiche.tarif) || {};
  const i = (fiche && fiche.indisponibilite) || {};
  const cible = (fiche && fiche.cible) || { tous: true, organisations: [] };
  const choisis = new Set(cible.organisations || []);
  const pour = (types, html) => `<div class="annonce-champs" data-pour-type="${types}"${types.split(' ').includes(type) ? '' : ' hidden'}>${html}</div>`;
  return feuille({
    titre: fiche ? 'L\'annonce' : 'Nouvelle annonce',
    sousTitre: 'Ce que lisent vos clients, tel quel. Le formulaire suit le type choisi.',
    corps: `
      ${select('type', 'Type', Object.fromEntries(Object.entries(TYPES_ANNONCE).map(([k, f]) => [k, f.libelle])), type)}
      ${champ('titre', 'Titre', fiche ? fiche.titre : '', { placeholder: 'Nouvelle tarification au 1er janvier 2027' })}
      ${zone('texte', 'Texte', fiche ? fiche.texte : '', { lignes: 5, aide: 'Une ligne vide sépare deux paragraphes.' })}
      ${champ('dateEffet', 'Date d\'effet', fiche ? fiche.dateEffet : '', { type: 'date', facultatif: true, aide: 'Lu « À partir du … » par le client.' })}
      ${pour('tarif', `
        <p class="surtitre" style="margin-top:6px">L'encart de chaque client</p>
        <p class="aide">Les prix viennent de la grille de tarifs (plus bas sur cette page) à la date d'effet : l'annonce n'en porte aucun.</p>
        ${zone('texteLong', 'Phrase pour un projet long', t.texteLong || PHRASE_LONG, { lignes: 2, aide: 'Les mots entre accolades sont remplacés pour chaque client : {projet} son projet, {demarrage} son début (« commencé le … »), {evolution} le changement de prix (« reste à … » ou « passe de … à … »), {tjm} le nouveau prix d\'une journée, {tjmAvant} l\'ancien, {date} la date d\'effet, {seuil} la durée en mois qui fait un projet long.' })}
        ${zone('texteCourt', 'Phrase pour un projet court', t.texteCourt || PHRASE_COURT, { lignes: 2 })}`)}
      ${pour('indisponibilite', `
        <p class="surtitre" style="margin-top:6px">La période</p>
        <div class="forme-rang">
          ${champ('du', 'Du', i.du || '', { type: 'date' })}
          ${champ('au', 'Au (inclus)', i.au || '', { type: 'date' })}
        </div>
        ${champ('message', 'Message', i.message || '', { placeholder: 'réponses sous 48 h, urgences : 06 00 00 00 00', aide: 'Le bandeau dit : « Capmedia est indisponible du … au … : » puis ce message. Il paraît sur l\'accueil et dans la bulle pendant la période et les 7 jours d\'avant.' })}`)}
      <div class="groupe">
        <span class="etiquette-champ">Clients visés</span>
        <div class="segments" role="group">
          <label class="interrupteur" style="padding:6px 8px"><input type="radio" name="cibleMode" value="tous"${cible.tous !== false ? ' checked' : ''}> Tous les clients</label>
          <label class="interrupteur" style="padding:6px 8px"><input type="radio" name="cibleMode" value="choix"${cible.tous === false ? ' checked' : ''}> Certains clients</label>
        </div>
        <div class="annonce-cible-choix" data-cible-choix${cible.tous === false ? '' : ' hidden'}>
          ${orgs.length ? orgs.map((o) => `<label class="interrupteur"><input type="checkbox" data-cible-org value="${echapper(o.id)}"${choisis.has(o.id) ? ' checked' : ''}> ${echapper(o.entreprise || o.nom || o.id)}</label>`).join('') : '<p class="t-petit t-3">Aucun client.</p>'}
        </div>
      </div>
      <div class="forme-rang">
        ${select('publication', 'Publication', Object.fromEntries(Object.entries(PUBLICATIONS_ANNONCE).map(([k, f]) => [k, f.libelle])), fiche ? fiche.publication : 'brouillon', { aide: 'Publiée : les clients visés la lisent et la reçoivent dans leurs notifications (une fois).' })}
        <div class="groupe"><span class="etiquette-champ">En haut de la page</span><label class="interrupteur" style="padding:6px 0"><input type="checkbox" name="epinglee"${fiche && fiche.epinglee ? ' checked' : ''}> Épingler</label></div>
      </div>`,
    regles: {
      titre: (v) => (!v ? 'Un titre, s\'il vous plaît.' : (v.length > BORNES_ANNONCE.titre ? `${BORNES_ANNONCE.titre} caractères au plus.` : '')),
      texte: (v) => (v && v.length > BORNES_ANNONCE.texte ? `${BORNES_ANNONCE.texte} caractères au plus.` : ''),
      texteLong: (v, d) => (d.type === 'tarif' && v && v.length > BORNES_ANNONCE.phrase ? `${BORNES_ANNONCE.phrase} caractères au plus.` : ''),
      texteCourt: (v, d) => (d.type === 'tarif' && v && v.length > BORNES_ANNONCE.phrase ? `${BORNES_ANNONCE.phrase} caractères au plus.` : ''),
      du: (v, d) => (d.type === 'indisponibilite' && !v ? 'Le premier jour, s\'il vous plaît.' : ''),
      au: (v, d) => (d.type === 'indisponibilite' && (!v || (d.du && v < d.du)) ? 'Le dernier jour, le même que le premier ou après.' : ''),
      message: (v, d) => (d.type === 'indisponibilite' && v && v.length > BORNES_ANNONCE.message ? `${BORNES_ANNONCE.message} caractères au plus.` : ''),
    },
    surMontage: (el) => {
      const montrer = () => {
        const v = el.querySelector('#ed-type').value;
        el.querySelectorAll('[data-pour-type]').forEach((b) => { b.hidden = !b.dataset.pourType.split(' ').includes(v); });
      };
      el.querySelector('#ed-type').addEventListener('change', montrer);
      el.querySelectorAll('[name="cibleMode"]').forEach((r) => r.addEventListener('change', () => {
        el.querySelector('[data-cible-choix]').hidden = el.querySelector('[name="cibleMode"]:checked').value !== 'choix';
      }));
    },
    enregistrer: async (v, _pieces, racine) => {
      const tous = v.cibleMode !== 'choix';
      const organisations = tous ? [] : [...racine.querySelectorAll('[data-cible-org]:checked')].map((x) => x.value);
      if (!tous && !organisations.length) { toast('Choisissez au moins un client, ou « Tous les clients ».', 'erreur'); return false; }
      const publiee = v.publication === 'publiee';
      const d = {
        type: v.type, titre: v.titre, texte: v.texte || '', dateEffet: v.dateEffet || '',
        publication: publiee ? 'publiee' : 'brouillon',
        publieLe: publiee ? (fiche && estPubliee(fiche) && fiche.publieLe ? fiche.publieLe : horodatage()) : null,
        epinglee: Boolean(v.epinglee),
        cible: { tous, organisations, uids: tous ? [] : comptesDe(organisations) },
        tarif: v.type === 'tarif' ? {
          texteLong: v.texteLong === PHRASE_LONG ? '' : (v.texteLong || ''), texteCourt: v.texteCourt === PHRASE_COURT ? '' : (v.texteCourt || ''),
        } : null,
        indisponibilite: v.type === 'indisponibilite' ? { du: v.du, au: v.au, message: v.message || '' } : null,
      };
      await ecrire.enregistrerAnnonce(fiche ? fiche.id : null, d);
      toast(publiee ? (fiche && estPubliee(fiche) ? 'Annonce mise à jour.' : 'Annonce publiée : les clients visés la lisent.') : 'Annonce enregistrée en brouillon.');
    },
  });
};

const editerIntro = () => feuille({
  titre: 'L\'introduction', sousTitre: 'Ce que lit le client en haut de la page « Annonces Capmedia ».',
  corps: zone('intro', 'Le texte', introDe(), { lignes: 4, aide: '600 caractères au plus. Vide : le texte par défaut revient.' }),
  regles: { intro: (v) => (v && v.length > BORNES_ANNONCE.intro ? `${BORNES_ANNONCE.intro} caractères au plus.` : '') },
  enregistrer: async (v) => { await ecrire.poserIntroAnnonces(v.intro === INTRO_ANNONCES ? '' : v.intro); toast('Introduction mise à jour.'); },
});

/* L'aperçu « comme le client », pour un client choisi : ses projets font
   l'encart du tarif. */
const apercu = (a) => {
  const orgs = (magasin.lire(K.organisations) || []).filter((o) => !a.cible || a.cible.tous !== false || (a.cible.organisations || []).includes(o.id));
  const projets = magasin.lire(K.projets) || [];
  const projetsDe = (oid) => projetsTarifables(projets.filter((p) => p.organisation === oid && !p.archive));
  const m = modale({
    titre: 'Comme le client la lit', large: true,
    corps: `${orgs.length ? `<div class="groupe" style="margin-bottom:14px"><label class="etiquette-champ" for="apercu-client">Vu par</label>
      <select class="select" id="apercu-client">${orgs.map((o) => `<option value="${echapper(o.id)}">${echapper(o.entreprise || o.nom || o.id)}</option>`).join('')}</select></div>` : '<p class="t-petit t-3" style="margin-bottom:14px">Aucun client visé : l\'aperçu montre l\'annonce seule.</p>'}
      <div class="page-annonces" data-apercu></div>`,
  });
  const dessiner = () => {
    const sel = m.el.querySelector('#apercu-client');
    m.el.querySelector('[data-apercu]').innerHTML = annonceHtml(a, { projets: sel ? projetsDe(sel.value) : null, grille: magasin.lire(K.tarifs) });
  };
  const sel = m.el.querySelector('#apercu-client');
  if (sel) sel.addEventListener('change', dessiner);
  dessiner();
};

/* --- La grille de tarifs (reglages/tarifs), source unique -------------------
   Lue par l'annonce « tarif », le calculateur et les devis. L'administrateur
   ou la finance la règle ici : seuil en mois, TVA, et des périodes (à
   partir de quelle date, prix par jour d'un projet long et d'un court). */

const ligneDePeriode = (p = {}) => `<div class="grille-periode" data-periode>
    <div class="groupe"><label class="etiquette-champ">À partir du</label><input class="champ" type="date" lang="fr-FR" data-periode-debut value="${echapper(p.debut || '')}"></div>
    <div class="groupe"><label class="etiquette-champ">Projet long (€ par jour)</label><input class="champ" type="number" min="1" max="10000" step="1" data-periode-long value="${echapper(p.long ?? '')}"></div>
    <div class="groupe"><label class="etiquette-champ">Projet court (€ par jour)</label><input class="champ" type="number" min="1" max="10000" step="1" data-periode-court value="${echapper(p.court ?? '')}"></div>
    <button class="btn-icone" type="button" data-periode-retirer aria-label="Retirer cette période" data-astuce="Retirer">${icone('corbeille')}</button>
  </div>`;

const editerGrille = () => {
  const g = grilleDe(magasin.lire(K.tarifs));
  return feuille({
    titre: 'La grille de tarifs',
    sousTitre: 'La source unique du prix d\'une journée : annonces, calculateur et devis la lisent.',
    corps: `
      <div class="forme-rang">
        ${champ('seuilMois', 'Seuil d\'un projet long (mois)', g.seuilMois, { type: 'number', attrs: 'min="1" max="24" step="1"', aide: 'Au-delà, le projet est long.' })}
        ${champ('tva', 'TVA (%)', g.tva, { type: 'number', attrs: 'min="0" max="30" step="0.1"', aide: '0 : franchise en base de TVA (micro-entreprise), le prix affiché est le prix payé.' })}
      </div>
      <p class="surtitre" style="margin-top:6px">Les périodes</p>
      <div class="grille-periodes" data-periodes>${g.periodes.map(ligneDePeriode).join('')}</div>
      <button class="btn btn-secondaire btn-petit" type="button" data-periode-ajouter>${icone('plus')} Ajouter une période</button>`,
    regles: {
      seuilMois: (v) => (Number.isInteger(v) && v >= 1 && v <= 24 ? '' : 'Un nombre de mois entre 1 et 24.'),
      tva: (v) => (typeof v === 'number' && v >= 0 && v <= 30 ? '' : 'Un taux entre 0 et 30 %.'),
    },
    surMontage: (el) => {
      el.querySelector('[data-periode-ajouter]').addEventListener('click', () => {
        const liste = el.querySelector('[data-periodes]');
        if (liste.children.length >= 12) { toast('Douze périodes au plus.', 'erreur'); return; }
        liste.insertAdjacentHTML('beforeend', ligneDePeriode());
      });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-periode-retirer]');
        if (b) b.closest('[data-periode]').remove();
      });
    },
    enregistrer: async (v, _pieces, racine) => {
      const periodes = [...racine.querySelectorAll('[data-periode]')].map((l) => ({
        debut: l.querySelector('[data-periode-debut]').value,
        long: Number(l.querySelector('[data-periode-long]').value),
        court: Number(l.querySelector('[data-periode-court]').value),
      }));
      const fautive = periodes.find((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.debut) || !(p.long > 0 && p.long <= 10000) || !(p.court > 0 && p.court <= 10000));
      if (!periodes.length || fautive) { toast('Chaque période demande une date et deux prix entre 1 et 10 000 €.', 'erreur'); return false; }
      if (new Set(periodes.map((p) => p.debut)).size !== periodes.length) { toast('Deux périodes ne peuvent pas commencer le même jour.', 'erreur'); return false; }
      periodes.sort((x, y) => x.debut.localeCompare(y.debut));
      await ecrire.poserGrilleTarifs({ seuilMois: v.seuilMois, tva: v.tva, periodes });
      toast('Grille de tarifs enregistrée : annonces, calculateur et devis la lisent.');
    },
  });
};

const sectionGrille = () => {
  const doc = magasin.lire(K.tarifs);
  const g = grilleDe(doc);
  const enVigueur = periodeA(g, new Date());
  return `<section class="section" data-grille-tarifs>
    <div class="section-tete"><h2>Grille de tarifs</h2><button class="btn btn-secondaire btn-petit" type="button" data-annonce-action="grille">Modifier la grille</button></div>
    <p class="t-petit t-2">Seuil d'un projet long : ${echapper(pluriel(g.seuilMois, 'mois', 'mois'))} · ${g.tva === 0 ? 'TVA non applicable (franchise)' : `TVA ${echapper(String(g.tva).replace('.', ','))} %`} · la source unique des annonces, du calculateur et des devis.${doc && doc.periodes ? '' : ' Grille par défaut, pas encore enregistrée.'}</p>
    <table class="grille-tarifs">
      <thead><tr><th scope="col">À partir du</th><th scope="col">Projet long</th><th scope="col">Projet court</th><th scope="col"><span class="sr-only">État</span></th></tr></thead>
      <tbody>${g.periodes.map((p) => `<tr data-grille-periode="${echapper(p.debut)}"><td>${echapper(dateFr(p.debut))}</td><td>${echapper(prix(p.long, g))} par jour</td><td>${echapper(prix(p.court, g))} par jour</td><td class="t-petit">${enVigueur && p.debut === enVigueur.debut ? '<span class="grille-en-vigueur">En vigueur</span>' : (p.debut > (enVigueur ? enVigueur.debut : '') ? '<span class="t-3">À venir</span>' : '<span class="t-3">Passée</span>')}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;
};

const ligneEquipe = (a, orgs, admin = true) => {
  const effet = dateFr(a.dateEffet);
  const p = a.type === 'indisponibilite' ? periode(a) : null;
  const r = a.type === 'tarif' ? grilleALaDate(a, magasin.lire(K.tarifs)) : null;
  const details = [
    effet ? `À partir du ${effet}` : '',
    p ? periodeTexte(p).replace(/^./, (c) => c.toUpperCase()) : '',
    r ? `grille : ${prix(r.long, magasin.lire(K.tarifs)) || '-'} long · ${prix(r.court, magasin.lire(K.tarifs)) || '-'} court · seuil ${pluriel(r.seuilMois, 'mois', 'mois')}` : '',
    cibleTexte(a, orgs),
    estPubliee(a) ? (enDate(a.publieLe) ? `publiée le ${dateCourte(a.publieLe)}` : 'publiée') : '',
  ].filter(Boolean);
  return `<li class="annonce-ligne${estPubliee(a) ? '' : ' annonce-ligne--brouillon'}" data-annonce-ligne="${echapper(a.id)}">
    <div class="annonce-ligne-corps">
      <div class="annonce-tete">${repereType(a)}${a.epinglee ? '<span class="annonce-marque">Épinglée</span>' : ''}</div>
      <p class="annonce-ligne-titre">${echapper(a.titre || '')}</p>
      <p class="t-petit t-2">${echapper(details.join(' · '))}</p>
    </div>
    <div class="annonce-ligne-gestes">
      ${pastille(PUBLICATIONS_ANNONCE, estPubliee(a) ? 'publiee' : 'brouillon')}
      ${admin ? `<button class="btn btn-petit ${estPubliee(a) ? 'btn-doux' : 'btn-secondaire'}" type="button" data-annonce-action="publier" data-id="${echapper(a.id)}">${estPubliee(a) ? 'Retirer' : 'Publier'}</button>
      <button class="btn btn-petit btn-fantome" type="button" data-annonce-action="apercu" data-id="${echapper(a.id)}">Aperçu</button>
      <button class="btn-icone" type="button" data-annonce-action="editer" data-id="${echapper(a.id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button>
      <button class="btn-icone" type="button" data-annonce-action="menu" data-id="${echapper(a.id)}" aria-label="Plus d'actions">${icone('points')}</button>` : `<button class="btn btn-petit btn-fantome" type="button" data-annonce-action="apercu" data-id="${echapper(a.id)}">Aperçu</button>`}
    </div>
  </li>`;
};

const vueEquipe = (ctx, env) => {
  const admin = estAdmin(env.session);
  const finance = admin || peut(env.session, 'finance.gerer');
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  titrePage('Annonces');
  filAriane([{ libelle: 'Annonces' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  const cles = [K.annonces, K.organisations, K.projets, K.reglagesAnnonces, K.tarifs];
  const toutes = () => (magasin.lire(K.annonces) || []).slice().sort(parOrdreAnnonce);

  const rendre = () => {
    const annonces = toutes();
    const orgs = magasin.lire(K.organisations) || [];
    const publiees = annonces.filter(estPubliee).length;
    sortie.innerHTML = `<div class="page page-annonces">
      <header class="page-tete">
        <div>
          <h1>Annonces</h1>
          <p class="chapo">Ce que Capmedia annonce à ses clients : nouveautés, compétences, changements, tarifs, congés. ${echapper(annonces.length ? `${pluriel(publiees, 'publiée', 'publiées')} sur ${annonces.length}.` : '')}</p>
        </div>
        ${admin ? `<div class="actions">
          <button class="btn btn-secondaire" type="button" data-annonce-action="intro">Modifier l'introduction</button>
          <button class="btn btn-principal" type="button" data-annonce-action="nouvelle">${icone('plus')} Nouvelle annonce</button>
        </div>` : ''}
      </header>
      ${annonces.length
    ? `<ol class="annonces-lignes">${annonces.map((a) => ligneEquipe(a, orgs, admin)).join('')}</ol>`
    : vide({ icone: 'porteVoix', titre: 'Aucune annonce', texte: 'Une nouveauté, un tarif, des congés : écrivez-la, choisissez qui la lit, publiez.', action: admin ? '<button class="btn btn-principal" type="button" data-annonce-action="nouvelle">Nouvelle annonce</button>' : '' })}
      ${finance ? sectionGrille() : ''}
    </div>`;
  };

  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();

  const gestes = sur(sortie, 'click', '[data-annonce-action]', async (el) => {
    const action = el.dataset.annonceAction;
    if (action === 'grille') { if (finance) editerGrille(); return; }
    if (action === 'apercu') { const x = toutes().find((y) => y.id === el.dataset.id); if (x) apercu(x); return; }
    if (!admin) return;
    if (action === 'nouvelle') { editerAnnonce(); return; }
    if (action === 'intro') { editerIntro(); return; }
    const a = toutes().find((x) => x.id === el.dataset.id);
    if (!a) return;
    if (action === 'editer') { editerAnnonce(a); return; }
    if (action === 'apercu') { apercu(a); return; }
    if (action === 'publier') {
      const oui = !estPubliee(a);
      if (oui && !(await confirmer({ titre: 'Publier cette annonce ?', texte: `${cibleTexte(a, magasin.lire(K.organisations) || [])} la liront et la recevront dans leurs notifications.`, ok: 'Publier' }))) return;
      await agir(el, () => ecrire.publierAnnonce(a.id, oui), oui ? 'Annonce publiée : les clients visés la lisent.' : 'Annonce retirée : les clients ne la voient plus.');
      return;
    }
    if (action === 'menu') {
      menu(el, [
        { libelle: 'Modifier', icone: 'edit', action: () => editerAnnonce(a) },
        { libelle: a.epinglee ? 'Ne plus épingler' : 'Épingler en haut', icone: 'pin', action: () => agir(null, () => ecrire.epinglerAnnonce(a.id, !a.epinglee), a.epinglee ? 'Annonce désépinglée.' : 'Annonce épinglée en haut de la page.') },
        { libelle: 'Aperçu comme le client', icone: 'externe', action: () => apercu(a) },
        '-',
        { libelle: 'Supprimer', icone: 'corbeille', danger: true, action: async () => {
          if (await confirmer({ titre: 'Supprimer cette annonce ?', texte: 'Elle disparaît pour tout le monde. Pour la cacher sans la perdre, retirez-la plutôt.', ok: 'Supprimer', danger: true })) {
            agir(null, () => ecrire.supprimerAnnonce(a.id), 'Annonce supprimée.');
          }
        } },
      ]);
    }
  });

  return { fin: () => { planifier.arreter(); gestes(); lot.fin(); } };
};

export const vue = async (ctx, env) => (env.role === 'equipe' ? vueEquipe(ctx, env) : vueClient(ctx, env));
