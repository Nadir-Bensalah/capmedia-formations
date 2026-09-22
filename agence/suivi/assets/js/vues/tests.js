/* ==========================================================================
   LA CONSOLE DE TESTS

   Tous les projets d'un coup, ou un seul. C'est la différence avec un
   onglet enfermé dans un projet : quand six testeurs déroulent une
   campagne, la question n'est pas « où en est ForgeMe » mais « qu'est-ce
   qui ne va pas, quelque part ».

   L'ordre des sections n'est pas décoratif. Ce qui ne va pas vient en
   premier, parce qu'un tableau de bord qui ouvre sur ce qui va bien ne
   sert à personne. L'avancement ensuite, l'activité en dernier.

   La même vue sert au client : son sélecteur ne propose que ses projets,
   et quand il n'en a qu'un, il n'y a plus de sélecteur du tout.
   ========================================================================== */

import {
  echapper, dateCourte, depuis, pluriel, joursAvant, parDateDesc,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, STATUTS_CAMPAGNE,
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE,
} from '../noyau.js';
import {
  icone, pastille, ligne, vide, squelette, titrePage, sur, modale,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { editer } from './editeurs.js';
import { filAriane } from '../coquille.js';

/* La mémoire des filtres tient dans l'adresse, pas dans le stockage : un
   lien vers « les anomalies Android de ForgeMe » doit pouvoir se coller
   dans un message. */
const lire = (ctx, cle, defaut) => (ctx.requete && ctx.requete[cle]) || defaut;

const poser = (cles) => {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  Object.entries(cles).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
  const chaine = p.toString();
  location.hash = `/tests${chaine ? `?${chaine}` : ''}`;
};

/* --------------------------------------------------------------------------
   Ce qu'on lit, et ce qu'on en déduit
   -------------------------------------------------------------------------- */

const lireTout = (env) => {
  const equipe = env.role === 'equipe';
  const projets = (magasin.lire(K.projets) || []).filter((p) => !p.archive);

  /* Côté équipe les lectures en groupe couvrent tout ; côté client on
     rassemble projet par projet, puisque les règles refusent le groupe. */
  const rassembler = (globale, parProjet) => (equipe
    ? (magasin.lire(globale) || [])
    : projets.flatMap((p) => (magasin.lire(parProjet(p.id)) || []).map((x) => ({ ...x, projet: x.projet || p.id }))));

  return {
    projets,
    scenarios: rassembler(K.scenariosTous, K.scenarios),
    campagnes: rassembler(K.campagnesToutes, K.campagnes),
    anomalies: rassembler(K.anomaliesToutes, K.anomalies),
    testeurs: magasin.lire(K.testeurs) || [],
  };
};

/* Une lecture en groupe ne dit pas de quel projet vient le document : la
   donnée ne porte pas son chemin. Le magasin garde l'identifiant du parent
   sous « _parent », et c'est lui qui répond quand le champ manque. */
const projetDe = (x) => x.projet || x._parent || '';

const dansPlateforme = (x, plateforme) => {
  if (!plateforme) return true;
  const p = x.plateformes || [];
  return p.length ? p.includes(plateforme) : true;
};

/* --------------------------------------------------------------------------
   Section 1 · Ce qui ne va pas
   -------------------------------------------------------------------------- */

const alertes = (d, { nomProjet, plateforme }) => {
  const soucis = [];

  /* Les anomalies qui bloquent, d'abord. Une anomalie bloquante non
     corrigée est la seule chose qui justifie d'arrêter une campagne. */
  d.anomalies
    .filter((a) => a.gravite === 'bloquant' && !['corrigee', 'sans-suite'].includes(a.statut) && dansPlateforme(a, plateforme))
    .forEach((a) => soucis.push({
      ton: 'rouge', icone: 'alerte',
      titre: a.titre || 'Anomalie bloquante',
      sous: `${nomProjet(projetDe(a))} · ${(GRAVITES_ANOMALIE[a.gravite] || {}).libelle || ''}`,
      fin: pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle'),
    }));

  /* Une campagne dont la date de fin est passée sans être close : soit
     elle traîne, soit personne ne l'a refermée. Les deux se règlent. */
  d.campagnes
    .filter((c) => c.statut === 'en-cours' && c.fin && joursAvant(c.fin) < 0)
    .forEach((c) => soucis.push({
      ton: 'ambre', icone: 'horloge',
      titre: `${c.titre || 'Campagne'} dépasse sa date de fin`,
      sous: `${nomProjet(projetDe(c))} · fin prévue ${dateCourte(c.fin)}`,
      fin: pastille(STATUTS_CAMPAGNE, c.statut),
    }));

  /* Un projet qui a des campagnes mais aucun scénario : la campagne ne
     peut rien distribuer, et ça ne se voit qu'en le cherchant. */
  const avecCampagne = new Set(d.campagnes.map((c) => projetDe(c)));
  const avecScenario = new Set(d.scenarios.map((s) => projetDe(s)));
  [...avecCampagne].filter((pid) => pid && !avecScenario.has(pid)).forEach((pid) => soucis.push({
    ton: 'ambre', icone: 'bug',
    titre: 'Campagne sans aucun scénario',
    sous: `${nomProjet(pid)} · la campagne n'a rien à distribuer`,
    fin: '',
  }));

  if (!soucis.length) {
    return `<section class="section" style="margin-top:0">
      <div class="section-tete"><h2>Ce qui ne va pas</h2></div>
      ${vide({ icone: 'check', titre: 'Rien à signaler', texte: 'Aucune anomalie bloquante, aucune campagne en retard.', compact: true })}
    </section>`;
  }

  return `<section class="section" style="margin-top:0">
    <div class="section-tete"><div><h2>Ce qui ne va pas</h2><p class="chapo">${pluriel(soucis.length, 'point à regarder', 'points à regarder')}.</p></div></div>
    <div class="liste">${soucis.map((s) => ligne(s)).join('')}</div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 2 · L'avancement
   -------------------------------------------------------------------------- */

const avancement = (d, { nomProjet, plateforme }) => {
  const lignes = d.projets.map((p) => {
    const scen = d.scenarios.filter((s) => projetDe(s) === p.id && s.actif !== false && dansPlateforme(s, plateforme));
    const camp = d.campagnes.filter((c) => projetDe(c) === p.id);
    const ano = d.anomalies.filter((a) => projetDe(a) === p.id && !['corrigee', 'sans-suite'].includes(a.statut));
    return { p, scen: scen.length, camp, ano: ano.length,
      enCours: camp.filter((c) => c.statut === 'en-cours').length };
  }).filter((x) => x.scen || x.camp.length);

  if (!lignes.length) {
    return `<section class="section">
      <div class="section-tete"><h2>Avancement</h2></div>
      ${vide({ icone: 'bug', titre: 'Aucun projet testé', texte: 'Versez un plan de tests sur un projet pour commencer.', compact: true })}
    </section>`;
  }

  return `<section class="section">
    <div class="section-tete"><div><h2>Avancement</h2><p class="chapo">${pluriel(lignes.length, 'projet suivi', 'projets suivis')}.</p></div></div>
    <div class="liste">${lignes.map((x) => ligne({
      href: `#/tests?projet=${echapper(x.p.id)}${plateforme ? `&plateforme=${echapper(plateforme)}` : ''}`,
      icone: 'bug', ton: x.ano ? 'rouge' : x.enCours ? 'bleu' : '',
      titre: echapper(x.p.nom),
      sous: `${pluriel(x.scen, 'scénario', 'scénarios')}${x.camp.length ? ` · ${pluriel(x.camp.length, 'campagne', 'campagnes')}` : ' · aucune campagne'}${x.ano ? ` · ${pluriel(x.ano, 'anomalie ouverte', 'anomalies ouvertes')}` : ''}`,
      fin: x.enCours ? pastille(STATUTS_CAMPAGNE, 'en-cours') : '',
    })).join('')}</div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 3 · L'activité
   -------------------------------------------------------------------------- */

const activite = (d, { nomProjet, plateforme }) => {
  const faits = [
    ...d.campagnes.map((c) => ({ date: c.maj || c.cree, icone: 'bug',
      titre: `${c.titre || 'Campagne'} · ${(STATUTS_CAMPAGNE[c.statut] || {}).libelle || ''}`,
      sous: nomProjet(projetDe(c)) })),
    ...d.anomalies.filter((a) => dansPlateforme(a, plateforme)).map((a) => ({ date: a.maj || a.cree, icone: 'alerte',
      ton: (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'rouge' ? 'rouge' : '',
      titre: a.titre || 'Anomalie',
      sous: `${nomProjet(projetDe(a))} · ${(STATUTS_ANOMALIE[a.statut] || {}).libelle || ''}` })),
  ].filter((f) => f.date).sort(parDateDesc('date')).slice(0, 25);

  if (!faits.length) return '';

  return `<section class="section">
    <div class="section-tete"><h2>Activité</h2></div>
    <div class="liste">${faits.map((f) => ligne({
      icone: f.icone, ton: f.ton || '',
      titre: echapper(f.titre), sous: `${echapper(f.sous)} · ${echapper(depuis(f.date))}`,
    })).join('')}</div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Un projet choisi : toute la panoplie
   -------------------------------------------------------------------------- */

const unProjet = (d, { pid, nomProjet, plateforme, equipe }) => {
  const projet = d.projets.find((p) => p.id === pid);
  if (!projet) return vide({ icone: 'bug', titre: 'Projet introuvable', texte: 'Il a peut-être été archivé.' });

  const scen = d.scenarios.filter((s) => projetDe(s) === pid && s.actif !== false && dansPlateforme(s, plateforme));
  const camp = d.campagnes.filter((c) => projetDe(c) === pid)
    .sort((a, b) => ((STATUTS_CAMPAGNE[a.statut] || {}).ordre || 9) - ((STATUTS_CAMPAGNE[b.statut] || {}).ordre || 9));
  const ano = d.anomalies.filter((a) => projetDe(a) === pid)
    .sort((a, b) => ((GRAVITES_ANOMALIE[a.gravite] || {}).rang || 9) - ((GRAVITES_ANOMALIE[b.gravite] || {}).rang || 9));

  const parNiveau = { socle: 0, transversal: 0, reparti: 0 };
  scen.forEach((s) => { parNiveau[s.niveau] = (parNiveau[s.niveau] || 0) + 1; });
  const passages = parNiveau.socle * 2 + parNiveau.transversal * 2 + parNiveau.reparti;

  const parBloc = [];
  scen.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach((s) => {
    let g = parBloc.find((x) => x.cle === s.bloc);
    if (!g) { g = { cle: s.bloc, libelle: (BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || 'Divers', items: [] }; parBloc.push(g); }
    g.items.push(s);
  });

  const ouvertes = ano.filter((a) => !['corrigee', 'sans-suite'].includes(a.statut)).length;

  return `
  <div class="rang chiffres-tests">
    <div class="chiffre"><span class="chiffre-valeur">${scen.length}</span><span class="chiffre-nom">scénarios</span></div>
    <div class="chiffre"><span class="chiffre-valeur">${passages}</span><span class="chiffre-nom">passages mobiles</span></div>
    <div class="chiffre"><span class="chiffre-valeur">${camp.filter((c) => c.statut === 'en-cours').length}</span><span class="chiffre-nom">campagnes en cours</span></div>
    <div class="chiffre${ouvertes ? ' chiffre--alerte' : ''}"><span class="chiffre-valeur">${ouvertes}</span><span class="chiffre-nom">anomalies ouvertes</span></div>
  </div>

  <section class="section">
    <div class="section-tete">
      <div><h2>Campagnes</h2><p class="chapo">Une campagne pioche dans la bibliothèque : les mêmes scénarios sont rejoués d'une version à l'autre.</p></div>
      ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-campagne="${echapper(pid)}">${icone('plus')} Nouvelle campagne</button>` : ''}
    </div>
    ${camp.length ? `<div class="liste">${camp.map((c) => ligne({
      icone: 'bug', ton: c.statut === 'close' ? 'vert' : c.statut === 'en-cours' ? 'bleu' : '',
      titre: echapper(c.titre || 'Campagne'),
      sous: `${(c.scenarios || []).length ? pluriel((c.scenarios || []).length, 'scénario', 'scénarios') : 'aucun scénario'} · ${(c.testeurs || []).length ? pluriel((c.testeurs || []).length, 'testeur', 'testeurs') : 'aucun testeur'}${c.debut ? ` · ${echapper(dateCourte(c.debut))}` : ''}`,
      fin: `${pastille(STATUTS_CAMPAGNE, c.statut || 'preparation')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-campagne="${echapper(c.id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
    })).join('')}</div>`
    : vide({ icone: 'bug', titre: 'Aucune campagne', texte: 'Une campagne prend des scénarios, les distribue aux testeurs, et garde le résultat daté.', compact: true })}
  </section>

  ${ano.length ? `<section class="section">
    <div class="section-tete"><div><h2>Anomalies</h2><p class="chapo">Plusieurs échecs sur le même scénario font une seule anomalie.</p></div></div>
    <div class="liste">${ano.map((a) => ligne({
      icone: 'alerte', ton: (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'rouge' ? 'rouge' : (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'ambre' ? 'ambre' : '',
      titre: echapper(a.titre || 'Anomalie'),
      sous: `${(a.passages || []).length ? pluriel((a.passages || []).length, 'passage', 'passages') : ''}${(a.plateformes || []).length ? ` · ${echapper((a.plateformes || []).join(', '))}` : ''}`,
      fin: `${pastille(GRAVITES_ANOMALIE, a.gravite || 'mineur')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}`,
    })).join('')}</div>
  </section>` : ''}

  <section class="section">
    <div class="section-tete">
      <div><h2>Scénarios</h2><p class="chapo">La bibliothèque du projet${plateforme ? `, sur ${(PLATEFORMES_TEST[plateforme] || {}).libelle}` : ''}. ${scen.length ? pluriel(scen.length, 'scénario', 'scénarios') : 'Vide.'}</p></div>
      <button class="btn btn-secondaire btn-petit" type="button" data-plier-scenarios aria-expanded="false">${icone('deplier')} Voir la bibliothèque</button>
    </div>
    ${scen.length ? `
    <div id="bibliotheque" hidden>
    <div class="rang couverture">
      ${Object.entries(NIVEAUX_SCENARIO).map(([cle, f]) => `<span class="puce" data-astuce="${echapper(f.aide)}">${pastille(NIVEAUX_SCENARIO, cle)} ${parNiveau[cle] || 0}</span>`).join('')}
    </div>
    ${parBloc.map((g) => `
      <div class="bloc-scenarios">
        <h3 class="bloc-tete">${echapper(g.libelle)}<span class="badge">${g.items.length}</span></h3>
        <div class="liste liste--serree">${g.items.map((s) => `
          <div class="scenario${(NIVEAUX_SCENARIO[s.niveau] || {}).double ? ' scenario--double' : ''}">
            <button class="scenario-corps" type="button" data-scenario="${echapper(s.ref)}">
              <span class="scenario-ref">${echapper(s.ref)}</span>
              <span class="scenario-titre">${echapper(s.titre)}</span>
              <span class="scenario-fin">
                ${(s.plateformes || []).length < 3 ? `<span class="puce puce--mini">${echapper((s.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(' '))}</span>` : ''}
                ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
              </span>
            </button>
          </div>`).join('')}</div>
      </div>`).join('')}
    </div>`
    : vide({ icone: 'bug', titre: plateforme ? 'Aucun scénario sur cette plateforme' : 'Aucun scénario', texte: plateforme ? 'Changez de filtre, ou élargissez les plateformes de vos scénarios.' : 'Versez un plan de tests sur ce projet.', compact: true })}
  </section>`;
};

/* Le plan de tests est écrit en markdown, et son gras porte du sens : il
   désigne l'option exacte à choisir dans l'application (« Type **Rappel** »).
   On le rend, et rien d'autre : le texte est échappé avant, donc aucune
   balise venue de la fiche ne peut s'ouvrir ici. */
const gras = (texte) => echapper(texte || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/* Le détail d'un scénario : ce que le testeur lira, mot pour mot. */
const ouvrirScenario = (s) => {
  const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
  return modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || ''}`, feuille: true,
    corps: `
      <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
        ${(s.plateformes || []).map((p) => `<span class="puce">${echapper((PLATEFORMES_TEST[p] || {}).libelle || p)}</span>`).join('')}
      </div>
      <p class="aide" style="margin-bottom:20px">${echapper(niveau.aide)}</p>
      ${s.options ? `<div class="groupe"><span class="etiquette-champ">Options à poser</span><p class="t-corps">${gras(s.options)}</p></div>` : ''}
      <div class="groupe"><span class="etiquette-champ">Résultat attendu</span><p class="t-corps">${gras(s.attendu)}</p></div>
      <p class="aide" style="margin-top:18px">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  }).fin;
};

/* -------------------------------------------------------------------------- */

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Tests');
  filAriane([{ libelle: 'Tests' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  const etat = {
    projet: lire(ctx, 'projet', ''),
    plateforme: lire(ctx, 'plateforme', ''),
  };

  let empreinte = '';
  /* Les lectures en groupe n'existent que côté équipe : les règles les lui
     réservent. Un client reçoit ses données sur les clés de ses projets, et
     s'abonner aux mauvaises laisse l'écran figé sur son premier rendu, sans
     la moindre erreur pour le dire. */
  const clesSuivies = () => (env.role === 'equipe'
    ? [K.projets, K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.testeurs]
    : [K.projets, ...(magasin.lire(K.projets) || (env.session || {}).projets || [])
        .flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id)])]);

  /* Le projet ouvert : celui qu'on a choisi, ou le seul que le client ait.
     Le rendu et les gestes doivent lire la MÊME valeur, faute de quoi le
     bouton s'affiche et le clic ne fait rien, sans le moindre message. */
  const projetCourant = () => {
    if (etat.projet) return etat.projet;
    const p = magasin.lire(K.projets) || [];
    return env.role !== 'equipe' && p.length === 1 ? p[0].id : '';
  };

  const rendre = (force = false) => {
    const sceau = magasin.empreinte(clesSuivies()) + '|' + etat.projet + '|' + etat.plateforme;
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    const d = lireTout(env);
    const nomProjet = (pid) => ((d.projets.find((p) => p.id === pid) || {}).nom || '');

    /* Un client qui n'a qu'un projet ne choisit rien : le sélecteur
       disparaît et son projet s'ouvre directement. */
    const seul = env.role !== 'equipe' && d.projets.length === 1 ? d.projets[0].id : '';
    const pid = projetCourant();

    sortie.innerHTML = `<div class="page">
      <header class="page-tete">
        <div>
          <h1>Tests</h1>
          <p class="chapo">${pid ? echapper(nomProjet(pid)) : `${pluriel(d.projets.length, 'projet', 'projets')}, ${pluriel(d.scenarios.filter((s) => s.actif !== false).length, 'scénario', 'scénarios')}`}</p>
        </div>
      </header>

      <div class="rang barre-tests">
        ${!seul ? `<select class="select" id="f-projet" style="width:auto">
          <option value="">Tous les projets</option>
          ${d.projets.map((p) => `<option value="${echapper(p.id)}"${pid === p.id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}
        </select>` : ''}
        <div class="segments" role="group" aria-label="Plateforme">
          <button type="button" data-plateforme="" aria-pressed="${!etat.plateforme}">Toutes</button>
          ${Object.entries(PLATEFORMES_TEST).map(([cle, f]) => `<button type="button" data-plateforme="${echapper(cle)}" aria-pressed="${etat.plateforme === cle}">${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(f.libelle)}</button>`).join('')}
        </div>
      </div>

      ${pid
        ? unProjet(d, { pid, nomProjet, plateforme: etat.plateforme, equipe: env.role === 'equipe' })
        : `${alertes(d, { nomProjet, plateforme: etat.plateforme })}${avancement(d, { nomProjet, plateforme: etat.plateforme })}${activite(d, { nomProjet, plateforme: etat.plateforme })}`}
    </div>`;

    const sel = sortie.querySelector('#f-projet');
    if (sel) sel.addEventListener('change', (e) => { etat.projet = e.target.value; poser({ projet: etat.projet, plateforme: etat.plateforme }); rendre(true); });
  };

  const gestes = sur(sortie, 'click', '[data-plateforme], [data-scenario], [data-plier-scenarios], [data-nouvelle-campagne], [data-editer-campagne]', async (el) => {
    /* Une référence n'est unique qu'à l'intérieur d'un projet : deux plans
       de tests portent chacun leur « DI-15 ». Chercher sans le projet
       ouvrirait l'énoncé d'une autre application, sans rien dire. */
    if (el.dataset.scenario) {
      const s = lireTout(env).scenarios.find((x) => x.ref === el.dataset.scenario && projetDe(x) === projetCourant());
      if (s) ouvrirScenario(s);
      return;
    }
    /* La bibliothèque se déplie sur demande : 173 lignes au-dessus des
       campagnes, c'est la campagne qu'on ne voit plus. */
    if (el.hasAttribute('data-plier-scenarios')) {
      const boite = sortie.querySelector('#bibliotheque');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? 'Voir la bibliothèque' : 'Replier'}`;
      return;
    }
    if (el.dataset.nouvelleCampagne) { await editer('campagne', env, { pid: el.dataset.nouvelleCampagne }); return; }
    if (el.dataset.editerCampagne) {
      const pid = projetCourant();
      const c = lireTout(env).campagnes.find((x) => x.id === el.dataset.editerCampagne && projetDe(x) === pid);
      if (c) await editer('campagne', env, { pid, fiche: c });
      return;
    }
    etat.plateforme = el.dataset.plateforme;
    poser({ projet: etat.projet, plateforme: etat.plateforme });
    rendre(true);
  });

  /* La liste des projets d'un client peut grandir en cours de session, quand
     l'équipe lève un rideau. On réabonne alors les clés qui viennent
     d'apparaître, faute de quoi le nouveau projet n'arriverait jamais. */
  const suivies = new Set();
  const suivre = () => {
    clesSuivies().forEach((c) => {
      if (suivies.has(c)) return;
      suivies.add(c);
      lot.sur(c, () => { suivre(); rendre(); });
    });
  };
  suivre();
  rendre(true);

  return () => { gestes(); lot.fin(); };
};
