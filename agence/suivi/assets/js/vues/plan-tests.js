/* ==========================================================================
   CE QUI VA ÊTRE TESTÉ

   Le plan de tests d'un projet, écrit pour quelqu'un qui n'a jamais testé
   un logiciel. Il est rangé en sections (une par partie de l'application,
   plus les tests qui traversent toute l'application), et chaque section
   détaille ses scénarios selon quatre aspects : ce que l'app fait, ce qui
   se passe sous le capot, ce que l'on ressent en l'utilisant, et la
   sécurité des données.

   La même page sert aux deux côtés. Le client la lit ; l'équipe la lit et
   la corrige (un scénario, le titre et le résumé d'une section, la
   présentation du haut de page). Tout ce que le client lit ici se modifie
   donc depuis le Cockpit, y compris les phrases d'introduction : elles
   vivent dans le document « presentation », et le code ne garde que leur
   première version.

   Les données : projets/{projet}/planTests/{section}, versées par
   fonctions-suivi/outils/plan-tests-importer.mjs, puis retouchées ici.
   ========================================================================== */

import { echapper, pluriel, PLATEFORMES_TEST, bdd, collection } from '../noyau.js';
import { icone, squelette, titrePage, sur, toast, confirmer, vide, agir } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, ASPECTS_PLAN } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { feuille, champ, zone, choix } from './editeurs.js';

/* --------------------------------------------------------------------------
   Le vocabulaire
   -------------------------------------------------------------------------- */

export const GROUPES_PLAN = [
  { cle: 'demarrage', libelle: 'Démarrage et compte' },
  { cle: 'socle', libelle: 'Le socle de l\'app' },
  { cle: 'fonctionnalites', libelle: 'Les fonctionnalités' },
  { cle: 'transverse', libelle: 'Tests transverses' },
];

/* Le nom d'un aspect, et sa première explication. L'explication affichée
   est celle de la présentation du projet quand l'équipe l'a réécrite. */
export const ASPECTS = {
  fonctionnel: {
    libelle: 'Fonctionnel', court: 'Fonctionnel',
    phrase: 'L\'application fait-elle tout ce qu\'elle promet ? Chaque geste est essayé dans les cas courants, dans les cas limites et quand quelque chose tourne mal.',
  },
  technique: {
    libelle: 'Technique', court: 'Technique',
    phrase: 'Ce qui se passe sous le capot : la rapidité, la fluidité, le hors connexion, un réseau lent, les longues listes, et les plantages, remontés automatiquement à l\'équipe.',
  },
  ux: {
    libelle: 'Expérience et interface', court: 'Expérience',
    phrase: 'Est-ce facile, compréhensible et agréable ? Les libellés, les messages, les écrans vides, le thème sombre, les petits écrans.',
  },
  securite: {
    libelle: 'Sécurité et données', court: 'Sécurité',
    phrase: 'Personne d\'autre ne voit ni ne modifie vos données, une saisie piégée ne passe pas, et ce qui est supprimé l\'est vraiment.',
  },
};

const INTRO_DEFAUT = 'Voici, partie par partie, tout ce que nous vérifions dans votre application avant chaque sortie. Chaque section décrit ses scénarios : ce que l\'on fait, pas à pas, et ce que l\'on doit obtenir. Certains tests traversent toute l\'application : par exemple, un abonnement pris sur le site web doit être reconnu aussitôt sur le téléphone. La liste s\'enrichit au fil du projet.';
const PLATEFORMES_DEFAUT = 'Trois plateformes sont couvertes : l\'application iPhone (iOS), l\'application Android et le site web. Chaque scénario dit où il se déroule : un geste qui n\'existe que sur le téléphone n\'est testé que là.';

export const TYPES_PLAN = {
  normal: { libelle: 'Cas courant' },
  limite: { libelle: 'Cas limite' },
  erreur: { libelle: 'Cas d\'erreur' },
};
export const PRIORITES_PLAN = {
  haute: { libelle: 'Priorité haute', court: 'Haute', ton: 'rouge' },
  moyenne: { libelle: 'Priorité moyenne', court: 'Moyenne', ton: 'ambre' },
  basse: { libelle: 'Priorité basse', court: 'Basse', ton: '' },
};

/* Une section longue se replie : au-delà de ce nombre de scénarios
   affichés, on ne la déplie qu'à la demande. */
const SEUIL_REPLI = 6;
const TIRET = '–';

/* --------------------------------------------------------------------------
   Lire et filtrer
   -------------------------------------------------------------------------- */

const estPresentation = (d) => d.id === 'presentation' || d.genre === 'presentation';
const rangGroupe = (g) => { const i = GROUPES_PLAN.findIndex((x) => x.cle === g); return i < 0 ? 99 : i; };

const sectionsDe = (pid) => (magasin.lire(K.planTests(pid)) || [])
  .filter((d) => !estPresentation(d) && d.aspects)
  .slice()
  .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0));

const presentationDe = (pid) => (magasin.lire(K.planTests(pid)) || []).find(estPresentation) || {};

/* La recherche ignore les majuscules et les accents : « securite » trouve
   « sécurité ». */
const plat = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const scenariosDe = (section, aspect) => ((section.aspects || {})[aspect] || []).filter(Boolean);

const garder = (s, aspect, f, sectionTrouvee) => (!f.plateforme || (s.plateformes || []).includes(f.plateforme))
  && (!f.aspect || f.aspect === aspect)
  && (!f.priorite || s.priorite === f.priorite)
  && (!f.q || sectionTrouvee || plat([s.id, s.titre, s.etapes, s.attendu, ...(s.refs || [])].join(' ')).includes(f.q));

/* Les scénarios qu'une section garde sous les filtres, aspect par aspect. */
const visibles = (section, f) => {
  const sectionTrouvee = Boolean(f.q) && plat(`${section.titre} ${section.resume}`).includes(f.q);
  const parAspect = {};
  ASPECTS_PLAN.forEach((a) => { parAspect[a] = scenariosDe(section, a).filter((s) => garder(s, a, f, sectionTrouvee)); });
  return { parAspect, total: ASPECTS_PLAN.reduce((n, a) => n + parAspect[a].length, 0) };
};

/* --------------------------------------------------------------------------
   Le rendu
   -------------------------------------------------------------------------- */

const texteMultiligne = (t) => (String(t || '').trim() ? echapper(String(t).trim()).replace(/\n/g, '<br>') : TIRET);

const listePlateformes = (liste) => {
  const l = (liste || []).filter((p) => PLATEFORMES_TEST[p]);
  return l.length ? l.map((p) => PLATEFORMES_TEST[p].libelle).join(', ') : TIRET;
};

const scenarioHtml = (s, { section, equipe, refsConnues }) => {
  const prio = PRIORITES_PLAN[s.priorite];
  const type = TYPES_PLAN[s.type];
  const refs = (s.refs || []).filter(Boolean);
  return `<article class="plan-scenario" id="sc-${echapper(s.id)}" data-scenario-plan="${echapper(s.id)}">
    <div class="plan-scenario-tete">
      <span class="ref">${echapper(s.id || TIRET)}</span>
      <h4>${echapper(s.titre || TIRET)}</h4>
      ${equipe ? `<span class="rang boutons-edition">
        <button class="btn-icone" type="button" data-editer-scenario="${echapper(s.id)}" data-section="${echapper(section.id)}" aria-label="Modifier ce scénario" data-astuce="Modifier">${icone('edit')}</button>
        <button class="btn-icone" type="button" data-supprimer-scenario="${echapper(s.id)}" data-section="${echapper(section.id)}" aria-label="Supprimer ce scénario" data-astuce="Supprimer">${icone('corbeille')}</button>
      </span>` : ''}
    </div>
    <dl class="plan-scenario-detail">
      <div><dt>Étapes</dt><dd>${texteMultiligne(s.etapes)}</dd></div>
      <div><dt>Résultat attendu</dt><dd>${texteMultiligne(s.attendu)}</dd></div>
    </dl>
    <div class="plan-scenario-pied">
      <span class="puce${prio && prio.ton ? ` puce--${prio.ton}` : ''}"><i aria-hidden="true"></i>${echapper(prio ? prio.libelle : 'Priorité non précisée')}</span>
      <span>${echapper(type ? type.libelle : TIRET)}</span>
      <span>${echapper(listePlateformes(s.plateformes))}</span>
      ${refs.length ? `<span class="plan-refs">Déjà couvert par ${refs.map((r) => `<span class="ref"${refsConnues.get(r) ? ` data-astuce="${echapper(refsConnues.get(r))}"` : ''}>${echapper(r)}</span>`).join(', ')}</span>` : ''}
    </div>
  </article>`;
};

const compteursHtml = (section, v) => {
  const parts = ASPECTS_PLAN.map((a) => `<span>${echapper(ASPECTS[a].court)} <b>${v.parAspect[a].length}</b></span>`);
  return `<p class="plan-compteurs"><span><b>${v.total}</b> ${v.total > 1 ? 'scénarios' : 'scénario'}</span>${parts.join('')}<span>${echapper(listePlateformes(section.plateformes))}</span></p>`;
};

const sectionHtml = (section, { f, equipe, ouverte, refsConnues }) => {
  const v = visibles(section, f);
  const filtre = Boolean(f.plateforme || f.aspect || f.priorite || f.q);
  if (filtre && !v.total) return '';
  const longue = v.total > SEUIL_REPLI;
  const deplie = !longue || ouverte(section.id, v.total);
  /* Les aspects montrés : ceux qui ont un scénario sous les filtres. Côté
     équipe, les quatre restent (vides compris) quand rien ne filtre : c'est
     là qu'on ajoute le premier scénario d'un aspect. */
  const aspects = ASPECTS_PLAN.filter((a) => v.parAspect[a].length || (equipe && !filtre && (!f.aspect || f.aspect === a)));
  const corps = deplie ? `<div class="plan-corps" id="corps-${echapper(section.id)}">
    ${aspects.map((a) => `<div class="plan-aspect" data-aspect="${a}">
      <div class="plan-aspect-tete">
        <h3 class="bloc-tete">${echapper(ASPECTS[a].libelle)} <span class="compte-section">${v.parAspect[a].length}</span></h3>
        ${equipe ? `<button class="btn btn-fantome btn-petit" type="button" data-ajouter-scenario="${echapper(section.id)}" data-aspect="${a}">${icone('plus')} Ajouter un scénario</button>` : ''}
      </div>
      ${v.parAspect[a].length
    ? `<div class="plan-scenarios">${v.parAspect[a].map((s) => scenarioHtml(s, { section, equipe, refsConnues })).join('')}</div>`
    : '<p class="plan-aspect-vide">Aucun scénario pour l\'instant.</p>'}
    </div>`).join('')}
  </div>` : '';
  return `<section class="section plan-section" id="plan-${echapper(section.id)}" data-section-plan="${echapper(section.id)}">
    <div class="section-tete">
      <div class="plan-section-titre">
        <p class="etage-sur">Section ${echapper(String(section.ordre ?? TIRET))}</p>
        <h2>${echapper(section.titre || TIRET)}</h2>
        <p class="chapo">${echapper(section.resume || TIRET)}</p>
        ${compteursHtml(section, v)}
      </div>
      <div class="rang plan-section-gestes">
        ${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-editer-section="${echapper(section.id)}">${icone('edit')} Titre et résumé</button>` : ''}
        ${longue ? `<button class="btn btn-secondaire btn-petit" type="button" data-plier-section="${echapper(section.id)}" aria-expanded="${deplie}" aria-controls="corps-${echapper(section.id)}">${icone(deplie ? 'plier' : 'deplier')} ${deplie ? 'Replier' : `Voir les ${v.total} scénarios`}</button>` : ''}
      </div>
    </div>
    ${corps}
  </section>`;
};

const sommaireHtml = (sections, f) => `<nav class="carte plan-sommaire" aria-label="Sommaire du plan de tests">
  ${GROUPES_PLAN.map((g) => {
    const dedans = sections.filter((s) => s.groupe === g.cle);
    if (!dedans.length) return '';
    return `<div>
      <p class="etage-sur">${echapper(g.libelle)}</p>
      <ol>${dedans.map((s) => {
    const n = visibles(s, f).total;
    return `<li><a href="#" data-aller-section="${echapper(s.id)}"${n ? '' : ' class="plan-sommaire-vide"'}><span class="num">${echapper(String(s.ordre ?? TIRET))}</span><span class="nom">${echapper(s.titre || TIRET)}</span><span class="n">${n}</span></a></li>`;
  }).join('')}</ol>
    </div>`;
  }).join('')}
</nav>`;

/* La liste, groupe par groupe : un étage par groupe, un surtitre et une
   phrase aux chiffres en gras, puis ses sections. */
const listeHtml = (sections, ctx) => {
  const blocs = GROUPES_PLAN.map((g) => {
    const dedans = sections.filter((s) => s.groupe === g.cle);
    const rendues = dedans.map((s) => sectionHtml(s, ctx)).filter(Boolean);
    if (!rendues.length) return '';
    const n = dedans.reduce((t, s) => t + visibles(s, ctx.f).total, 0);
    return `<div class="etage plan-groupe" id="groupe-${g.cle}">
      <div class="etage-tete"><span class="etage-sur">${echapper(g.libelle)}</span><p class="etage-resume"><b>${rendues.length}</b> ${rendues.length > 1 ? 'sections' : 'section'}, <b>${n}</b> ${n > 1 ? 'scénarios' : 'scénario'}.</p></div>
      ${rendues.join('')}
    </div>`;
  }).filter(Boolean);
  if (!blocs.length) {
    return vide({ icone: 'recherche', titre: 'Aucun scénario ne correspond', texte: 'Changez de filtre ou de recherche.', compact: true });
  }
  return blocs.join('');
};

/* --------------------------------------------------------------------------
   Les éditeurs de l'équipe
   -------------------------------------------------------------------------- */

const CADRATIN = 'Pas de tiret cadratin : une virgule ou deux points font l\'affaire.';
const texteValide = (max, { requis = true } = {}) => (v) => {
  const t = String(v || '');
  if (requis && !t.trim()) return 'Ce champ est obligatoire.';
  if (t.length > max) return `${max} caractères au maximum.`;
  if (t.includes('\u2014')) return CADRATIN;
  return '';
};

const editerSection = (env, pid, section) => feuille({
  titre: 'La section', sousTitre: section.titre,
  corps: `${champ('titre', 'Titre', section.titre || '')}
    ${zone('resume', 'Résumé', section.resume || '', { lignes: 4, aide: 'Une ou deux phrases pour le client : ce que couvre cette section.' })}`,
  regles: { titre: texteValide(200), resume: texteValide(2000, { requis: false }) },
  enregistrer: async (d) => {
    await ecrire.majSectionPlan(pid, section.id, env.session.utilisateur.uid, { titre: d.titre, resume: d.resume });
    toast('Section enregistrée.');
    return true;
  },
});

const editerScenario = (env, pid, section, { aspect, fiche = null }) => feuille({
  titre: fiche ? 'Le scénario' : 'Nouveau scénario',
  sousTitre: fiche ? fiche.id : `${section.titre} · ${ASPECTS[aspect].libelle}`,
  corps: `
    ${choix('aspect', 'Aspect', Object.fromEntries(ASPECTS_PLAN.map((a) => [a, ASPECTS[a].libelle])), aspect, { aide: fiche ? 'Changer d\'aspect donne au scénario une nouvelle référence.' : '' })}
    ${champ('titre', 'Titre', fiche ? fiche.titre : '', { aide: 'Il se comprend sans être développeur.' })}
    ${zone('etapes', 'Étapes', fiche ? fiche.etapes : '', { lignes: 4, aide: 'Ce que l\'on fait, pas à pas.' })}
    ${zone('attendu', 'Résultat attendu', fiche ? fiche.attendu : '', { lignes: 3 })}
    <div class="groupe"><span class="etiquette-champ">Plateformes</span>
      <div class="rang" style="gap:14px;flex-wrap:wrap">${Object.entries(PLATEFORMES_TEST).map(([cle, p]) => `<label class="case"><input type="checkbox" name="plateformes" value="${echapper(cle)}" ${((fiche && fiche.plateformes) || section.plateformes || ['ios', 'android', 'web']).includes(cle) ? 'checked' : ''}> ${echapper(p.libelle)}</label>`).join('')}</div>
      <p class="aide">Seulement là où le geste existe vraiment.</p>
    </div>
    <div class="forme-rang">
      ${choix('type', 'Type', Object.fromEntries(Object.entries(TYPES_PLAN).map(([k, x]) => [k, x.libelle])), fiche ? fiche.type : 'normal')}
      ${choix('priorite', 'Priorité', Object.fromEntries(Object.entries(PRIORITES_PLAN).map(([k, x]) => [k, x.court])), fiche ? fiche.priorite : 'moyenne')}
    </div>
    ${champ('refs', 'Déjà couvert par', fiche ? (fiche.refs || []).join(', ') : '', { facultatif: true, placeholder: 'TA-12, CC-03', aide: 'Les références des scénarios de la bibliothèque qui couvrent déjà ce cas, séparées par des virgules.' })}`,
  regles: {
    titre: texteValide(300), etapes: texteValide(3000), attendu: texteValide(2000),
    refs: (v) => (String(v || '').split(',').map((x) => x.trim()).filter(Boolean).every((x) => /^[A-Za-z0-9-]{1,20}$/.test(x)) ? '' : 'Des références séparées par des virgules, par exemple TA-12, CC-03.'),
  },
  enregistrer: async (d) => {
    const plateformes = Array.isArray(d.plateformes) ? d.plateformes : (d.plateformes ? [d.plateformes] : []);
    if (!plateformes.length) { toast('Choisissez au moins une plateforme.', 'erreur'); return false; }
    const scenario = {
      titre: d.titre, etapes: d.etapes, attendu: d.attendu, plateformes,
      type: TYPES_PLAN[d.type] ? d.type : 'normal',
      priorite: PRIORITES_PLAN[d.priorite] ? d.priorite : 'moyenne',
      refs: String(d.refs || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean),
    };
    const id = await ecrire.enregistrerScenarioPlan(pid, section.id, env.session.utilisateur.uid, { ancien: fiche ? fiche.id : '', aspect: d.aspect, scenario });
    toast(fiche ? (fiche.id === id ? 'Scénario enregistré.' : `Scénario déplacé, désormais ${id}.`) : `${id} ajouté.`);
    return true;
  },
});

const editerPresentation = (env, pid, pres) => feuille({
  titre: 'La présentation', sousTitre: 'Le haut de la page, tel que le client le lit.',
  corps: `
    ${zone('intro', 'Introduction', pres.intro || INTRO_DEFAUT, { lignes: 6 })}
    ${ASPECTS_PLAN.map((a) => zone(`aspect-${a}`, ASPECTS[a].libelle, ((pres.aspects || {})[a]) || ASPECTS[a].phrase, { lignes: 3 })).join('')}
    ${zone('plateformes', 'Les plateformes', pres.plateformes || PLATEFORMES_DEFAUT, { lignes: 3 })}`,
  regles: {
    intro: texteValide(3000), plateformes: texteValide(1000),
    ...Object.fromEntries(ASPECTS_PLAN.map((a) => [`aspect-${a}`, texteValide(600)])),
  },
  enregistrer: async (d) => {
    await ecrire.enregistrerPresentationPlan(pid, env.session.utilisateur.uid, {
      intro: d.intro, plateformes: d.plateformes,
      aspects: Object.fromEntries(ASPECTS_PLAN.map((a) => [a, d[`aspect-${a}`]])),
    });
    toast('Présentation enregistrée.');
    return true;
  },
});

/* --------------------------------------------------------------------------
   La vue
   -------------------------------------------------------------------------- */

const lire = (ctx, cle, defaut = '') => (ctx.requete && ctx.requete[cle]) || defaut;

/* Les filtres tiennent dans l'adresse, comme sur la page Tests : un lien
   vers « les scénarios Android de priorité haute » se colle dans un
   message. La recherche, elle, reste dans la page. */
const adresse = (cles) => {
  const p = new URLSearchParams();
  Object.entries(cles).forEach(([k, v]) => { if (v) p.set(k, v); });
  const chaine = p.toString();
  return `/tests/plan${chaine ? `?${chaine}` : ''}`;
};

const segments = (nom, libelle, valeurs, courant) => `<div class="segments" role="group" aria-label="${echapper(libelle)}">
  ${valeurs.map(([cle, texte]) => `<button type="button" data-filtre="${nom}" data-valeur="${echapper(cle)}" aria-pressed="${courant === cle}">${texte}</button>`).join('')}
</div>`;

export const vue = async (ctx, env) => {
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Ce qui va être testé');
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  const etat = {
    projet: lire(ctx, 'projet'),
    plateforme: PLATEFORMES_TEST[lire(ctx, 'plateforme')] ? lire(ctx, 'plateforme') : '',
    aspect: ASPECTS[lire(ctx, 'aspect')] ? lire(ctx, 'aspect') : '',
    priorite: PRIORITES_PLAN[lire(ctx, 'priorite')] ? lire(ctx, 'priorite') : '',
    q: '',
    brut: '',
  };
  /* Ce que la personne a replié ou déplié elle-même, section par section :
     son choix l'emporte sur la règle (longue, donc repliée). */
  const choixRepli = new Map();
  const ouverte = (id) => (choixRepli.has(id) ? choixRepli.get(id) : Boolean(etat.q));

  const projets = () => (magasin.lire(K.projets) || []).filter((p) => !p.archive);
  const projetCourant = () => {
    if (etat.projet) return etat.projet;
    const p = projets();
    return !equipe && p.length === 1 ? p[0].id : '';
  };

  /* Les abonnements du projet ouvert : ses sections, et la bibliothèque
     (pour mettre un titre sur « déjà couvert par »). */
  const suivis = new Set();
  const suivre = (pid) => {
    if (!pid || suivis.has(pid)) return;
    suivis.add(pid);
    lot.abonner(K.planTests(pid), () => collection(bdd, 'projets', pid, 'planTests'));
    lot.abonner(K.scenarios(pid), () => collection(bdd, 'projets', pid, 'scenarios'));
    lot.sur(K.planTests(pid), () => planifier());
    lot.sur(K.scenarios(pid), () => planifier());
  };
  const cles = () => { const pid = projetCourant(); return pid ? [K.projets, K.planTests(pid), K.scenarios(pid)] : [K.projets]; };

  const refsDe = (pid) => {
    const m = new Map();
    [...(magasin.lire(K.scenarios(pid)) || []), ...(magasin.lire(K.scenariosTous) || []).filter((x) => (x.projet || x._parent) === pid)]
      .forEach((s) => { if (s.ref) m.set(s.ref, s.titre || ''); });
    return m;
  };

  const filtres = () => ({ plateforme: etat.plateforme, aspect: etat.aspect, priorite: etat.priorite, q: etat.q });

  const rendreFiltrable = () => {
    const pid = projetCourant();
    const boite = sortie.querySelector('#plan-filtrable');
    if (!pid || !boite) return;
    const sections = sectionsDe(pid);
    const f = filtres();
    const total = sections.reduce((t, s) => t + visibles(s, f).total, 0);
    const resultat = sortie.querySelector('#plan-resultat');
    if (resultat) resultat.textContent = `${pluriel(total, 'scénario affiché', 'scénarios affichés')}`;
    boite.innerHTML = `${sommaireHtml(sections, f)}<div id="plan-liste">${listeHtml(sections, { f, equipe, ouverte, refsConnues: refsDe(pid) })}</div>`;
  };

  let empreinte = '';
  const rendre = (force = false) => {
    const pid = projetCourant();
    suivre(pid);
    const sceau = `${magasin.empreinte(cles())}|${pid}|${etat.plateforme}|${etat.aspect}|${etat.priorite}`;
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    const liste = projets();
    const projet = liste.find((p) => p.id === pid);
    filAriane([{ libelle: 'Tests', chemin: pid ? `/tests?projet=${pid}` : '/tests' }, { libelle: 'Ce qui va être testé' }]);
    const selecteur = (equipe || liste.length > 1) ? `<select class="select" id="plan-projet" style="width:auto" aria-label="Projet">
        ${pid ? '' : '<option value="">Choisir un projet</option>'}
        ${liste.map((p) => `<option value="${echapper(p.id)}"${p.id === pid ? ' selected' : ''}>${echapper(p.nom || TIRET)}</option>`).join('')}
      </select>` : '';

    const tete = `<header class="page-tete">
        <div>
          <p class="surtitre">Plan de tests</p>
          <h1>Ce qui va être testé</h1>
          <p class="chapo">${echapper(projet ? projet.nom : 'Choisissez un projet')}</p>
        </div>
        <div class="actions">
          ${selecteur}
          ${equipe && pid ? `<button class="btn btn-secondaire" type="button" data-editer-presentation>${icone('edit')} Présentation</button>` : ''}
          <a class="btn btn-secondaire" href="#/tests${pid ? `?projet=${echapper(pid)}` : ''}">${icone('chevronGauche')} Retour aux tests</a>
        </div>
      </header>`;

    if (!pid) {
      sortie.innerHTML = `<div class="page plan">${tete}${vide({ icone: 'liste', titre: 'Choisissez un projet', texte: 'Le plan de tests se lit projet par projet.' })}</div>`;
      return;
    }

    /* Un autre projet vient d'être choisi : ses sections sont en route.
       On garde l'attente plutôt que d'annoncer un plan vide. */
    if (!magasin.chargee(K.planTests(pid))) {
      sortie.innerHTML = `<div class="page plan">${tete}${squelette('lignes', 4)}</div>`;
      empreinte = '';
      return;
    }
    const sections = sectionsDe(pid);
    if (magasin.erreur(K.planTests(pid)) && !sections.length) {
      sortie.innerHTML = `<div class="page plan">${tete}${vide({ icone: 'cadenas', titre: 'Ce plan n\'est pas accessible', texte: 'Réessayez dans un instant. Si cela continue, prévenez-nous.' })}</div>`;
      return;
    }
    if (!sections.length) {
      sortie.innerHTML = `<div class="page plan">${tete}${vide({ icone: 'liste', titre: 'Le plan de tests est en préparation', texte: equipe ? 'Versez-le avec l\'outil d\'import (plan-tests-importer.mjs) : les sections apparaîtront ici.' : 'Il apparaîtra ici dès qu\'il sera prêt.' })}</div>`;
      return;
    }

    const pres = presentationDe(pid);
    const fPlat = { plateforme: etat.plateforme, aspect: '', priorite: '', q: '' };
    const comptes = Object.fromEntries(ASPECTS_PLAN.map((a) => [a, sections.reduce((t, s) => t + scenariosDe(s, a).filter((x) => !fPlat.plateforme || (x.plateformes || []).includes(fPlat.plateforme)).length, 0)]));
    const total = ASPECTS_PLAN.reduce((t, a) => t + comptes[a], 0);
    const tous = sections.flatMap((s) => ASPECTS_PLAN.flatMap((a) => scenariosDe(s, a)));
    const parPlateforme = (p) => tous.filter((x) => (x.plateformes || []).includes(p)).length;
    const hautes = tous.filter((x) => x.priorite === 'haute' && (!etat.plateforme || (x.plateformes || []).includes(etat.plateforme))).length;

    sortie.innerHTML = `<div class="page plan">
      ${tete}

      <section class="carte plan-intro" aria-label="Présentation du plan">
        <p class="plan-intro-texte">${texteMultiligne(pres.intro || INTRO_DEFAUT)}</p>
        <div class="plan-aspects">
          ${ASPECTS_PLAN.map((a) => `<div class="plan-aspect-carte">
            <p class="etage-sur">${echapper(ASPECTS[a].libelle)}</p>
            <p class="plan-aspect-n">${comptes[a]}</p>
            <p class="plan-aspect-phrase">${echapper(((pres.aspects || {})[a]) || ASPECTS[a].phrase)}</p>
          </div>`).join('')}
        </div>
        <p class="plan-plateformes-texte">${texteMultiligne(pres.plateformes || PLATEFORMES_DEFAUT)}</p>
      </section>

      <div class="metriques plan-chiffres">
        <div class="metrique"><p class="metrique-valeur">${sections.length}</p><p class="metrique-libelle">Sections</p></div>
        <div class="metrique"><p class="metrique-valeur">${total}</p><p class="metrique-libelle">${etat.plateforme ? `Scénarios sur ${echapper(PLATEFORMES_TEST[etat.plateforme].libelle)}` : 'Scénarios'}</p></div>
        <div class="metrique"><p class="metrique-valeur">${hautes}</p><p class="metrique-libelle">En priorité haute</p></div>
        ${Object.entries(PLATEFORMES_TEST).map(([cle, p]) => `<div class="metrique"><p class="metrique-valeur">${parPlateforme(cle)}</p><p class="metrique-libelle">Sur ${echapper(p.libelle)}</p></div>`).join('')}
      </div>

      <div class="plan-filtres">
        ${segments('plateforme', 'Plateforme', [['', 'Toutes'], ...Object.entries(PLATEFORMES_TEST).map(([cle, p]) => [cle, `${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(p.libelle)}`])], etat.plateforme)}
        ${segments('aspect', 'Aspect', [['', 'Tous les aspects'], ...ASPECTS_PLAN.map((a) => [a, echapper(ASPECTS[a].court)])], etat.aspect)}
        ${segments('priorite', 'Priorité', [['', 'Toutes priorités'], ...Object.entries(PRIORITES_PLAN).map(([k, x]) => [k, echapper(x.court)])], etat.priorite)}
        <input class="champ plan-recherche" type="search" id="plan-recherche" placeholder="Rechercher un scénario" aria-label="Rechercher un scénario" value="${echapper(etat.brut)}">
        <span class="plan-resultat" id="plan-resultat" aria-live="polite"></span>
      </div>

      <div id="plan-filtrable"></div>
    </div>`;
    rendreFiltrable();
  };

  /* Premier dessin quand tout est là, les suivants regroupés. */
  const planifier = magasin.dessinateur(() => rendre(), 40, () => { suivre(projetCourant()); return cles(); });
  lot.sur(K.projets, () => planifier());
  suivre(projetCourant());
  planifier();

  const poser = (cles2) => {
    location.hash = adresse({ projet: etat.projet || projetCourant(), plateforme: etat.plateforme, aspect: etat.aspect, priorite: etat.priorite, ...cles2 });
  };

  /* La recherche redessine la liste seule, pas la page : le champ garde
     la main et le curseur. */
  let minuteur = null;
  const surSaisie = (e) => {
    if (!e.target || e.target.id !== 'plan-recherche') return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      etat.brut = e.target.value;
      etat.q = plat(e.target.value.trim());
      choixRepli.clear();
      rendreFiltrable();
    }, 160);
  };
  sortie.addEventListener('input', surSaisie);
  const surChoix = (e) => {
    if (e.target && e.target.id === 'plan-projet') poser({ projet: e.target.value });
  };
  sortie.addEventListener('change', surChoix);

  const sectionPar = (id) => sectionsDe(projetCourant()).find((s) => s.id === id);
  const redessinerSection = (id) => {
    const el = sortie.querySelector(`[data-section-plan="${CSS.escape(id)}"]`);
    const s = sectionPar(id);
    if (!el || !s) return;
    const html = sectionHtml(s, { f: filtres(), equipe, ouverte, refsConnues: refsDe(projetCourant()) });
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  };

  const gestes = sur(sortie, 'click', '[data-filtre], [data-aller-section], [data-plier-section], [data-editer-section], [data-ajouter-scenario], [data-editer-scenario], [data-supprimer-scenario], [data-editer-presentation]', async (el, ev) => {
    const pid = projetCourant();
    if (el.dataset.filtre) { poser({ [el.dataset.filtre]: el.dataset.valeur }); return; }
    if (el.dataset.allerSection) {
      ev.preventDefault();
      const cible = sortie.querySelector(`#plan-${CSS.escape(el.dataset.allerSection)}`);
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (el.dataset.plierSection) {
      const id = el.dataset.plierSection;
      choixRepli.set(id, el.getAttribute('aria-expanded') !== 'true');
      redessinerSection(id);
      return;
    }
    if (!equipe) return;
    if (el.hasAttribute('data-editer-presentation')) { await editerPresentation(env, pid, presentationDe(pid)); return; }
    const section = sectionPar(el.dataset.editerSection || el.dataset.ajouterScenario || el.dataset.section || '');
    if (!section) return;
    if (el.dataset.editerSection) { await editerSection(env, pid, section); return; }
    if (el.dataset.ajouterScenario) {
      choixRepli.set(section.id, true);
      await editerScenario(env, pid, section, { aspect: el.dataset.aspect || 'fonctionnel' });
      return;
    }
    const id = el.dataset.editerScenario || el.dataset.supprimerScenario;
    const aspect = ASPECTS_PLAN.find((a) => scenariosDe(section, a).some((x) => x.id === id));
    const fiche = aspect ? scenariosDe(section, aspect).find((x) => x.id === id) : null;
    if (!fiche) { toast('Ce scénario n\'existe plus.', 'erreur'); return; }
    if (el.dataset.editerScenario) { await editerScenario(env, pid, section, { aspect, fiche }); return; }
    const ok = await confirmer({ titre: `Supprimer ${id} ?`, texte: `« ${fiche.titre || id} » disparaîtra du plan, pour l'équipe comme pour le client.`, ok: 'Supprimer', danger: true });
    if (!ok) return;
    await agir(null, () => ecrire.supprimerScenarioPlan(pid, section.id, env.session.utilisateur.uid, id), `${id} supprimé.`);
  });

  return {
    fin: () => { planifier.arreter(); gestes(); lot.fin(); clearTimeout(minuteur); sortie.removeEventListener('input', surSaisie); sortie.removeEventListener('change', surChoix); },
    /* Même page, autres filtres : on redessine en place. */
    maj: (suite) => {
      const suivant = {
        projet: lire(suite, 'projet'),
        plateforme: PLATEFORMES_TEST[lire(suite, 'plateforme')] ? lire(suite, 'plateforme') : '',
        aspect: ASPECTS[lire(suite, 'aspect')] ? lire(suite, 'aspect') : '',
        priorite: PRIORITES_PLAN[lire(suite, 'priorite')] ? lire(suite, 'priorite') : '',
      };
      if (Object.keys(suivant).every((k) => suivant[k] === etat[k])) return;
      if (suivant.projet !== etat.projet) { choixRepli.clear(); etat.q = ''; etat.brut = ''; }
      Object.assign(etat, suivant);
      suivre(projetCourant());
      rendre(true);
    },
  };
};
