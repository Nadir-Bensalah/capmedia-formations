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
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE, FAMILLES_AVIS,
  ETATS_PARCOURS, OUTILS_PARCOURS, PARCOURS_A_REGARDER,
} from '../noyau.js';
import {
  icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, agir, confirmer,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, repartir } from '../donnees.js';
import { bdd, collection, getDocs, doc, getDoc } from '../noyau.js';
import { editer } from './editeurs.js';
import { appelServeur } from '../serveur.js';
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
    parcours: rassembler(K.parcoursTous, K.parcours),
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
      titre: echapper(a.titre || 'Anomalie bloquante'),
      sous: `${echapper(nomProjet(projetDe(a)))} · ${echapper((GRAVITES_ANOMALIE[a.gravite] || {}).libelle || '')}`,
      fin: pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle'),
    }));

  /* Une campagne dont la date de fin est passée sans être close : soit
     elle traîne, soit personne ne l'a refermée. Les deux se règlent. */
  d.campagnes
    .filter((c) => c.statut === 'en-cours' && c.fin && joursAvant(c.fin) < 0)
    .forEach((c) => soucis.push({
      ton: 'ambre', icone: 'horloge',
      titre: `${echapper(c.titre || 'Campagne')} dépasse sa date de fin`,
      sous: `${echapper(nomProjet(projetDe(c)))} · fin prévue ${echapper(dateCourte(c.fin))}`,
      fin: pastille(STATUTS_CAMPAGNE, c.statut),
    }));

  /* Un parcours rouge ou instable. L'instable est le pire des deux : le
     rouge dit qu'il y a un défaut, l'instable n'apprend rien, et un
     parcours qu'on finit par ignorer ne garde plus rien. */
  (d.parcours || [])
    .filter((x) => x.actif !== false && PARCOURS_A_REGARDER.includes(x.etat))
    .forEach((x) => soucis.push({
      ton: x.etat === 'rouge' ? 'rouge' : 'ambre', icone: 'code',
      titre: `${echapper(x.ref)} · ${echapper(x.titre || '')}`,
      sous: `${echapper(nomProjet(projetDe(x)))} · ${echapper((ETATS_PARCOURS[x.etat] || {}).libelle || '')}${x.note ? ` · ${echapper(x.note.slice(0, 50))}` : ''}`,
      fin: pastille(ETATS_PARCOURS, x.etat),
    }));

  /* Un projet qui a des campagnes mais aucun scénario : la campagne ne
     peut rien distribuer, et ça ne se voit qu'en le cherchant. */
  const avecCampagne = new Set(d.campagnes.map((c) => projetDe(c)));
  const avecScenario = new Set(d.scenarios.map((s) => projetDe(s)));
  [...avecCampagne].filter((pid) => pid && !avecScenario.has(pid)).forEach((pid) => soucis.push({
    ton: 'ambre', icone: 'bug',
    titre: 'Campagne sans aucun scénario',
    sous: `${echapper(nomProjet(pid))} · la campagne n'a rien à distribuer`,
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
   Les parcours automatisés
   -------------------------------------------------------------------------- */

/* Ce que la machine rejoue à chaque version. Un parcours ne remplace pas
   un testeur, il remplace la partie répétitive de son travail : celle qui
   consiste à revérifier que ce qui marchait marche encore.

   Un parcours instable est pire qu'un parcours rouge. Le rouge dit qu'il y
   a un défaut ; l'instable n'apprend rien, et on finit par l'ignorer. Il
   remonte donc au même niveau. */
const parcoursHtml = (d, { pid, equipe }) => {
  const liste = (d.parcours || []).filter((x) => x.actif !== false && (!pid || projetDe(x) === pid))
    .sort((a, b) => ((ETATS_PARCOURS[a.etat] || {}).ordre || 9) - ((ETATS_PARCOURS[b.etat] || {}).ordre || 9) || (a.ordre || 0) - (b.ordre || 0));

  const par = {};
  liste.forEach((x) => { par[x.etat] = (par[x.etat] || 0) + 1; });
  const aRegarder = liste.filter((x) => PARCOURS_A_REGARDER.includes(x.etat)).length;
  const eprouves = liste.filter((x) => x.mutation).length;
  const couverts = new Set(liste.flatMap((x) => x.scenarios || [])).size;

  return `<section class="section">
    <div class="section-tete">
      <div><h2>Parcours automatisés</h2><p class="chapo">${liste.length ? `${pluriel(liste.length, 'parcours', 'parcours')} rejoués à chaque version${couverts ? `, couvrant ${pluriel(couverts, 'scénario', 'scénarios')}` : ''}.` : 'Ce que la machine rejouera à chaque version.'}</p></div>
      ${equipe && pid ? `<button class="btn btn-principal btn-petit" type="button" data-nouveau-parcours="${echapper(pid)}">${icone('plus')} Nouveau parcours</button>` : ''}
    </div>

    ${liste.length ? `
    <div class="rang chiffres-tests" style="margin-bottom:16px">
      <div class="chiffre"><span class="chiffre-valeur">${par.vert || 0}</span><span class="chiffre-nom">au vert</span></div>
      <div class="chiffre${aRegarder ? ' chiffre--alerte' : ''}"><span class="chiffre-valeur">${aRegarder}</span><span class="chiffre-nom">à regarder</span></div>
      <div class="chiffre"><span class="chiffre-valeur">${par['a-ecrire'] || 0}</span><span class="chiffre-nom">à écrire</span></div>
      <div class="chiffre"><span class="chiffre-valeur">${eprouves} / ${liste.length}</span><span class="chiffre-nom">éprouvés par mutation</span></div>
    </div>
    ${eprouves < liste.length ? `<p class="aide" style="margin-bottom:14px">Un parcours qui passe au vert ne prouve rien tant qu'on n'a pas vérifié qu'il sait tomber. ${pluriel(liste.length - eprouves, 'parcours n\'a pas encore été remis en défaut', 'parcours n\'ont pas encore été remis en défaut')}.</p>` : ''}

    <div class="liste">${liste.map((x) => ligne({
      icone: x.outil === 'playwright' ? 'globe' : x.outil === 'jest' ? 'code' : 'smartphone',
      ton: x.etat === 'vert' ? 'vert' : x.etat === 'rouge' ? 'rouge' : x.etat === 'instable' ? 'ambre' : '',
      titre: `${echapper(x.ref)} · ${echapper(x.titre || '')}${x.mutation ? '' : ' <span class="etiquette">Non éprouvé</span>'}`,
      sous: `${echapper((OUTILS_PARCOURS[x.outil] || {}).court || x.outil)}${(x.plateformes || []).length ? ` · ${echapper((x.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', '))}` : ''}${(x.scenarios || []).length ? ` · ${pluriel((x.scenarios || []).length, 'scénario', 'scénarios')}` : ''}${x.note ? ` · ${echapper(x.note.slice(0, 60))}` : ''}`,
      fin: `${pastille(ETATS_PARCOURS, x.etat || 'a-ecrire')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-parcours="${echapper(x.ref)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
    })).join('')}</div>`
    : vide({ icone: 'code', titre: 'Aucun parcours',
        texte: equipe && pid ? 'Un parcours est rejoué par une machine à chaque version : c\'est ce qui empêche un défaut corrigé de revenir.' : 'Les parcours automatisés apparaîtront ici.', compact: true })}
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 4 · Le vivier
   -------------------------------------------------------------------------- */

/* Qui teste, sur quoi, et où il en est. Le tableau répond à la seule
   question qui compte en cours de campagne : qui traîne, et qui a fini. */
const vivierHtml = (d, { equipe }) => {
  if (!equipe) return '';
  const gens = d.testeurs || [];

  /* Ce que chacun a rendu, toutes campagnes en cours confondues. Un
     testeur inscrit mais affecté à rien est le cas qu'on veut voir :
     c'est une place payée pour rien. */
  const charge = (t) => {
    let du = 0;
    d.campagnes.filter((c) => c.statut === 'en-cours').forEach((c) => {
      du += ((c.affectation || {})[t.id] || []).length;
    });
    return du;
  };

  return `<section class="section">
    <div class="section-tete">
      <div><h2>Testeurs</h2><p class="chapo">${gens.length ? pluriel(gens.length, 'personne au vivier', 'personnes au vivier') : 'Le vivier est vide.'}</p></div>
      <button class="btn btn-principal btn-petit" type="button" data-nouveau-testeur>${icone('plus')} Inscrire un testeur</button>
    </div>
    ${gens.length ? `<div class="liste">${gens.map((t) => {
      const p = t.profil || {};
      const traits = [p.age ? `${p.age} ans` : '', p.fonction, p.sexe].filter(Boolean).join(' · ');
      const n = charge(t);
      return ligne({
        icone: 'utilisateur', ton: t.actif === false ? '' : (n ? 'bleu' : 'ambre'),
        titre: `${echapper(t.prenom || t.email || '')}${t.actif === false ? ' <span class="etiquette">Retiré</span>' : ''}`,
        sous: `${echapper(t.email || '')}${traits ? ` · ${echapper(traits)}` : ''}`,
        fin: `${(t.plateformes || (t.mobile ? [t.mobile, 'web'] : [])).map((x) => `<span class="puce puce--mini">${icone(x === 'ios' ? 'apple' : x === 'android' ? 'android' : 'globe')} ${echapper((PLATEFORMES_TEST[x] || {}).court || x)}</span>`).join('')}
          <span class="puce${n ? '' : ' puce--vide'}">${n ? pluriel(n, 'passage', 'passages') : 'rien à faire'}</span>`,
        action: 'ouvrir-testeur', attrs: `data-id="${echapper(t.id)}"`,
      });
    }).join('')}</div>`
    : vide({ icone: 'utilisateurs', titre: 'Aucun testeur',
        texte: 'Inscrivez-en un : il recevra un code par e-mail et ne verra que les scénarios qu\'on lui confie.', compact: true })}
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
      action: 'ouvrir-campagne', attrs: `data-id="${echapper(c.id)}"`,
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

  ${parcoursHtml(d, { pid, equipe })}

  ${equipe ? vivierHtml({ ...d, testeurs: (d.testeurs || []).filter((t) => (t.projets || []).includes(pid)) }, { equipe }) : ''}

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
              <span class="scenario-marque" aria-hidden="true"></span>
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

/* Le vivier de testeurs.

   Un testeur n'est membre d'aucun projet : il ne voit que son propre
   travail, et son accès tient à la revendication que la connexion lui
   pose. L'inscrire ici ne lui ouvre donc ni les demandes ni les devis. */
const ouvrirTesteur = (fiche, { env, projets }) => {
  const neuf = !fiche;
  const f = fiche || {};
  const p = f.profil || {};
  const AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65 et plus'];
  const AISANCE = ['À l\'aise', 'Moyenne', 'Peu à l\'aise'];

  const m = modale({
    titre: neuf ? 'Inscrire un testeur' : (f.prenom || 'Le testeur'),
    sousTitre: neuf ? 'Il ne verra que son propre travail, jamais le projet.' : f.email,
    feuille: true,
    corps: `
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="t-prenom">Prénom</label>
          <input class="champ" id="t-prenom" value="${echapper(f.prenom || '')}" placeholder="Karim"></div>
        <div class="groupe"><label class="etiquette-champ" for="t-email">Adresse</label>
          <input class="champ" id="t-email" type="email" value="${echapper(f.email || '')}" ${neuf ? '' : 'readonly'} placeholder="karim@exemple.fr">
          ${neuf ? '' : '<p class="aide">L\'adresse ne se change pas : elle est la clé de son compte.</p>'}</div>
      </div>

      <div class="groupe"><span class="etiquette-champ">Ce qu'il teste</span>
        <div class="cases-blocs">${Object.entries(PLATEFORMES_TEST).map(([cle, x]) => `
          <label class="case"><input type="checkbox" data-plateforme-t="${echapper(cle)}" ${(f.plateformes || (f.mobile ? [f.mobile, 'web'] : [])).includes(cle) ? 'checked' : ''}> ${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(x.libelle)}</label>`).join('')}</div>
        <p class="aide">C'est ce choix qui décide de ce qu'il recevra. Un scénario dont le comportement dépend du système part chez un testeur iOS et un testeur Android : il faut donc au moins un de chaque dans une campagne, sinon la moitié du travail n'est pas payée pour rien, elle n'est simplement pas faite.</p>
      </div>

      <div class="groupe"><span class="etiquette-champ">Son profil</span>
        <div class="forme-rang">
          <select class="select" id="t-sexe">
            <option value="">Sexe</option>
            ${['homme', 'femme', 'autre'].map((x) => `<option value="${x}"${p.sexe === x ? ' selected' : ''}>${x}</option>`).join('')}
          </select>
          <select class="select" id="t-age">
            <option value="">Tranche d'âge</option>
            ${AGES.map((x) => `<option value="${echapper(x)}"${p.age === x ? ' selected' : ''}>${echapper(x)} ans</option>`).join('')}
          </select>
        </div>
        <input class="champ" id="t-fonction" value="${echapper(p.fonction || '')}" placeholder="Sa fonction : testeur QA, étudiante, développeur..." style="margin-top:10px">
        <select class="select" id="t-aisance" style="margin-top:10px">
          <option value="">Son aisance avec le numérique</option>
          ${AISANCE.map((x) => `<option value="${echapper(x)}"${p.aisance === x ? ' selected' : ''}>${echapper(x)}</option>`).join('')}
        </select>
        <p class="aide">Il faut pouvoir distinguer un blocage causé par l'application d'un blocage causé par l'habitude. Ce profil est visible du client, jamais son nom.</p>
      </div>

      <div class="groupe"><span class="etiquette-champ">Ses projets</span>
        <div class="cases-blocs">${projets.map((x) => `
          <label class="case"><input type="checkbox" data-projet="${echapper(x.id)}" ${(f.projets || []).includes(x.id) ? 'checked' : ''}> ${echapper(x.nom)}</label>`).join('')}</div>
      </div>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
      ${neuf ? '' : '<button class="btn btn-danger" type="button" data-retirer>Retirer du vivier</button>'}
      <button class="btn btn-principal" type="button" data-enregistrer>${neuf ? 'Inscrire' : 'Enregistrer'}</button>`,
  });

  const retirer = m.el.querySelector('[data-retirer]');
  if (retirer) retirer.addEventListener('click', async () => {
    const sur = await confirmer({
      titre: `Retirer ${f.prenom || 'ce testeur'} du vivier ?`,
      texte: "Son accès se ferme. Ses résultats restent : ils sont la mémoire de la campagne, et les effacer falsifierait le rapport.",
      ok: 'Retirer', danger: true,
    });
    if (!sur) return;
    await agir(retirer, async () => {
      await appelServeur('retirerTesteur', { testeur: f.id });
      toast('Testeur retiré. Ses résultats sont conservés.');
      m.fermer(true);
    });
  });

  const enregistrer = m.el.querySelector('[data-enregistrer]');
  enregistrer.addEventListener('click', () => agir(enregistrer, async () => {
    const prenomV = (m.el.querySelector('#t-prenom').value || '').trim();
    const emailV = (m.el.querySelector('#t-email').value || '').trim();
    if (!prenomV) { toast('Donnez-lui un prénom.', 'erreur'); return; }
    if (neuf && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailV)) { toast('Cette adresse a l\'air incomplète.', 'erreur'); return; }
    const plateformes = [...m.el.querySelectorAll('[data-plateforme-t]')].filter((x) => x.checked).map((x) => x.dataset.plateformeT);
    if (!plateformes.length) { toast('Dites ce qu\'il teste.', 'erreur'); return; }

    /* Le mobile reste, à côté des plateformes : c'est lui que la
       répartition regarde pour décider qui voit quoi sur iOS et sur
       Android. Un testeur qui ne fait que le web n'en a pas, et ne
       reçoit alors que ce qui a un sens sur le web. */
    const donnees = {
      prenom: prenomV, plateformes,
      mobile: plateformes.find((x) => x !== 'web') || '',
      projets: [...m.el.querySelectorAll('[data-projet]')].filter((x) => x.checked).map((x) => x.dataset.projet),
      profil: {
        sexe: m.el.querySelector('#t-sexe').value,
        age: m.el.querySelector('#t-age').value,
        fonction: (m.el.querySelector('#t-fonction').value || '').trim(),
        aisance: m.el.querySelector('#t-aisance').value,
      },
    };
    if (neuf) await appelServeur('inscrireTesteur', { ...donnees, email: emailV });
    else await appelServeur('majTesteur', { ...donnees, testeur: f.id });
    toast(neuf ? `${prenomV} est inscrit au vivier.` : 'Testeur enregistré.');
    m.fermer(true);
  }));
  return m.fin;
};

/* La restitution du questionnaire.

   Les moyennes disent la tendance, les réponses libres disent pourquoi.
   Ces dernières sont rendues MOT POUR MOT, jamais résumées : c'est là
   qu'est la vraie information, et un résumé la tue.

   Chez le client, les noms sont masqués et les profils restent : « Testeur
   3, femme, 35-44 ans » suffit à comprendre qui parle sans le nommer. */
const ouvrirAvis = (campagne, { env, vivier }) => {
  const equipe = env.role === 'equipe';
  const avis = campagne._avis || [];

  if (!avis.length) {
    return modale({
      titre: 'Ce que les testeurs en pensent', feuille: true,
      corps: vide({ icone: 'coeur', titre: 'Aucun avis pour l\'instant',
        texte: 'Le questionnaire est proposé aux testeurs quand ils ont tout déroulé.', compact: true }),
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    }).fin;
  }

  /* Le nom d'un testeur ne regarde que l'équipe. Le profil, lui, éclaire
     la réponse : un avis de 22 ans et un de 55 ans ne disent pas la même
     chose, et le masquer priverait le client de l'essentiel. */
  const qui = (uid, rang) => {
    const t = vivier.find((x) => x.id === uid) || {};
    const p = t.profil || {};
    const traits = [p.sexe, p.age ? `${p.age} ans` : '', p.fonction].filter(Boolean).join(', ');
    return equipe
      ? `${t.prenom || uid}${traits ? ` · ${traits}` : ''}`
      : `Testeur ${rang + 1}${traits ? ` · ${traits}` : ''}`;
  };

  const moyenne = (cle) => {
    const n = avis.map((a) => Number(a[cle])).filter((x) => !Number.isNaN(x) && x !== null);
    return n.length ? { v: n.reduce((x, y) => x + y, 0) / n.length, sur: n.length } : null;
  };

  const euros = (cle) => {
    const n = avis.map((a) => Number(a[cle])).filter((x) => !Number.isNaN(x) && x > 0).sort((x, y) => x - y);
    return n.length ? { bas: n[0], haut: n[n.length - 1], median: n[Math.floor(n.length / 2)], sur: n.length } : null;
  };

  /* La fourchette acceptable : entre ce qu'on trouve suspect et ce qu'on
     trouve cher. En dessous on doute de la qualité, au-dessus on renonce. */
  const suspect = euros('argent.suspect');
  const cher = euros('argent.cher');
  const recommande = moyenne('facilite.recommande');

  const familleHtml = (cle, f) => {
    const chiffrees = f.questions.filter((q) => ['echelle', 'note10'].includes(q.type));
    const libres = f.questions.filter((q) => q.type === 'texte');
    const choix = f.questions.filter((q) => q.type === 'choix');
    return `
    <section class="avis-famille">
      <h3 class="bloc-tete">${echapper(f.libelle)}</h3>

      ${chiffrees.map((q) => {
        const m = moyenne(`${cle}.${q.cle}`);
        if (!m) return '';
        const part = q.type === 'note10' ? (m.v / 10) * 100 : (m.v / 5) * 100;
        return `<div class="avis-mesure">
          <div class="rang" style="justify-content:space-between;gap:12px">
            <span>${echapper(q.libelle)}</span>
            <strong>${m.v.toFixed(1)}${q.type === 'note10' ? ' / 10' : ' / 5'}</strong>
          </div>
          <div class="testeur-jauge" style="margin-top:6px"><div class="testeur-jauge-barre" style="width:${Math.round(part)}%"></div></div>
        </div>`;
      }).join('')}

      ${choix.map((q) => {
        const comptes = {};
        avis.forEach((a) => { const v = a[`${cle}.${q.cle}`]; if (v) comptes[v] = (comptes[v] || 0) + 1; });
        const lignes = Object.entries(comptes).sort((a, b) => b[1] - a[1]);
        if (!lignes.length) return '';
        return `<div class="avis-mesure">
          <span class="etiquette-champ">${echapper(q.libelle)}</span>
          <div class="rang" style="gap:8px;flex-wrap:wrap;margin-top:6px">
            ${lignes.map(([v, n]) => `<span class="puce">${echapper(v)} <strong>${n}</strong></span>`).join('')}
          </div>
        </div>`;
      }).join('')}

      ${libres.map((q) => {
        const dits = avis.map((a, i) => ({ texte: a[`${cle}.${q.cle}`], uid: a.testeur, rang: i })).filter((x) => x.texte);
        if (!dits.length) return '';
        return `<div class="avis-mesure">
          <span class="etiquette-champ">${echapper(q.libelle)}</span>
          <div class="avis-verbatims">${dits.map((x) => `
            <blockquote class="avis-verbatim">
              <p>${echapper(String(x.texte))}</p>
              <cite>${echapper(qui(x.uid, x.rang))}</cite>
            </blockquote>`).join('')}</div>
        </div>`;
      }).join('')}
    </section>`;
  };

  return modale({
    titre: 'Ce que les testeurs en pensent',
    sousTitre: `${pluriel(avis.length, 'réponse', 'réponses')} · ${echapper(campagne.titre || '')}`,
    feuille: true,
    corps: `
      <div class="rang chiffres-tests" style="margin-bottom:22px">
        ${recommande ? `<div class="chiffre"><span class="chiffre-valeur">${recommande.v.toFixed(1)}</span><span class="chiffre-nom">recommandation sur 10</span></div>` : ''}
        ${suspect && cher ? `<div class="chiffre"><span class="chiffre-valeur">${suspect.median} à ${cher.median} €</span><span class="chiffre-nom">fourchette acceptable</span></div>` : ''}
        <div class="chiffre"><span class="chiffre-valeur">${avis.length}</span><span class="chiffre-nom">testeurs ont répondu</span></div>
      </div>
      ${suspect && cher ? `<p class="aide" style="margin-bottom:22px">En dessous de ${suspect.median} €, ils se méfient de la qualité. Au-dessus de ${cher.median} €, ils renoncent. Sur ${pluriel(avis.length, 'réponse', 'réponses')}, c'est une direction, pas une étude de marché.</p>` : ''}
      ${Object.entries(FAMILLES_AVIS).map(([cle, f]) => familleHtml(cle, f)).join('')}`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  }).fin;
};

/* L'affectation des testeurs à une campagne.
   Le calcul propose, il ne décide pas : un testeur tombe malade, un autre
   demande un bloc précis, et aucun calcul ne prévoit cela. */
const ouvrirCampagne = async (c, { pid, env, scenarios }) => {
  const equipe = env.role === 'equipe';
  const vivier = magasin.lire(K.testeurs) || [];
  const retenus = c.scenarios || [];
  const dedans = scenarios.filter((s) => retenus.includes(s.ref));
  const doubles = dedans.filter((s) => (NIVEAUX_SCENARIO[s.niveau] || {}).double).length;

  const affectation = c.affectation || {};
  const charges = (c.testeurs || []).map((id) => {
    const t = vivier.find((x) => x.id === id) || { id };
    return { id, nom: t.prenom || t.email || id, mobile: t.mobile || '', n: (affectation[id] || []).length };
  });

  const m = modale({
    titre: c.titre || 'Campagne', sousTitre: `${(STATUTS_CAMPAGNE[c.statut] || {}).libelle || ''} · ${pluriel(dedans.length, 'scénario', 'scénarios')}`,
    feuille: true,
    corps: `
      <div class="rang chiffres-tests" style="margin-bottom:18px">
        <div class="chiffre"><span class="chiffre-valeur">${dedans.length}</span><span class="chiffre-nom">scénarios</span></div>
        <div class="chiffre"><span class="chiffre-valeur">${dedans.length + doubles}</span><span class="chiffre-nom">passages mobiles</span></div>
        <div class="chiffre"><span class="chiffre-valeur">${(c.testeurs || []).length}</span><span class="chiffre-nom">testeurs</span></div>
      </div>

      ${(c.builds && (c.builds.ios || c.builds.android || c.builds.web)) ? `<div class="groupe">
        <span class="etiquette-champ">Builds</span>
        <div class="rang" style="gap:8px;flex-wrap:wrap">
          ${c.builds.ios ? `<span class="puce">${icone('apple')} ${echapper(c.builds.ios)}</span>` : ''}
          ${c.builds.android ? `<span class="puce">${icone('android')} ${echapper(c.builds.android)}</span>` : ''}
          ${c.builds.web ? `<span class="puce">${icone('globe')} ${echapper(c.builds.web)}</span>` : ''}
        </div></div>` : ''}

      <div class="groupe">
        <span class="etiquette-champ">Testeurs</span>
        ${charges.length ? `<div class="liste liste--serree">${charges.map((t) => `
          <div class="rang" style="justify-content:space-between;padding:8px 10px;border-radius:10px;background:var(--fond-2)">
            <span>${echapper(t.nom)}${t.mobile ? ` <span class="puce puce--mini">${echapper((PLATEFORMES_TEST[t.mobile] || {}).court || t.mobile)}</span>` : ''}</span>
            <span class="t-micro">${t.n ? pluriel(t.n, 'passage', 'passages') : 'rien encore'}</span>
          </div>`).join('')}</div>`
          : `<p class="aide">Aucun testeur pour l'instant. ${vivier.length ? 'Choisissez-les ci-dessous.' : 'Le vivier est vide : le serveur seul y inscrit quelqu\'un.'}</p>`}
      </div>

      ${equipe && vivier.length ? `<div class="groupe">
        <span class="etiquette-champ">Le vivier</span>
        <div class="cases-blocs">${vivier.map((t) => `
          <label class="case"><input type="checkbox" data-testeur="${echapper(t.id)}" ${(c.testeurs || []).includes(t.id) ? 'checked' : ''}> ${echapper(t.prenom || t.email || t.id)}${t.mobile ? ` · ${echapper((PLATEFORMES_TEST[t.mobile] || {}).court || t.mobile)}` : ''}</label>`).join('')}</div>
        <p class="aide">Chaque testeur couvre le web plus un mobile. Un scénario dont le comportement dépend du système part chez un testeur iOS et un testeur Android : c'est la seule chose qu'on paie deux fois.</p>
      </div>` : ''}`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>
      <button class="btn btn-secondaire" type="button" data-voir-avis>${icone('coeur')} Leur avis</button>
      ${equipe ? `<button class="btn btn-principal" type="button" data-repartir>${icone('eclair')} Répartir</button>` : ''}`,
  });

  const voir = m.el.querySelector('[data-voir-avis]');
  if (voir) voir.addEventListener('click', () => agir(voir, async () => {
    /* Les avis se lisent à l'ouverture, pas en permanence : ils ne
       changent qu'à la toute fin d'une campagne, et les abonner en
       continu ferait un écouteur de plus pour rien. */
    const lot = [];
    try {
      const inst = await getDocs(collection(bdd, 'projets', pid, 'campagnes', c.id, 'appreciations'));
      inst.forEach((d) => lot.push({ testeur: d.id, ...d.data() }));
    } catch (e) { toast("Les avis n'ont pas pu être lus.", 'erreur'); return; }

    /* Le client ne lit pas le vivier : le nom d'un testeur ne le regarde
       pas. Son profil, lui, éclaire la réponse, et le serveur l'a recopié
       à part, sans rien qui identifie. */
    let profils = vivier;
    if (env.role !== 'equipe') {
      profils = [];
      for (const a of lot) {
        try {
          const d = await getDoc(doc(bdd, 'testeurs', a.testeur, 'public', 'profil'));
          profils.push({ id: a.testeur, profil: d.exists() ? d.data() : {} });
        } catch (err) { profils.push({ id: a.testeur, profil: {} }); }
      }
    }
    await ouvrirAvis({ ...c, _avis: lot }, { env, vivier: profils });
  }));

  const bouton = m.el.querySelector('[data-repartir]');
  if (bouton) bouton.addEventListener('click', () => agir(bouton, async () => {
    const ids = [...m.el.querySelectorAll('[data-testeur]')].filter((x) => x.checked).map((x) => x.dataset.testeur);
    if (!ids.length) { toast('Choisissez au moins un testeur.', 'erreur'); return; }
    const gens = ids.map((id) => { const t = vivier.find((x) => x.id === id) || {}; return { id, mobile: t.mobile || 'ios' }; });
    const plan = repartir(dedans, gens);
    await ecrire.majCampagne(pid, c.id, { testeurs: ids, affectation: plan });
    const n = Object.values(plan).reduce((a, r) => a + r.length, 0);
    toast(`${n} passages répartis entre ${pluriel(ids.length, 'testeur', 'testeurs')}.`);
    m.fermer(true);
  }));
  return m.fin;
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
    ? [K.projets, K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.parcoursTous, K.testeurs]
    : [K.projets, ...(magasin.lire(K.projets) || (env.session || {}).projets || [])
        .flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id), K.parcours(p.id)])]);

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
        : `${alertes(d, { nomProjet, plateforme: etat.plateforme })}${avancement(d, { nomProjet, plateforme: etat.plateforme })}${parcoursHtml(d, { pid: '', equipe: env.role === 'equipe' })}${vivierHtml(d, { equipe: env.role === 'equipe' })}${activite(d, { nomProjet, plateforme: etat.plateforme })}`}
    </div>`;

    const sel = sortie.querySelector('#f-projet');
    if (sel) sel.addEventListener('change', (e) => { etat.projet = e.target.value; poser({ projet: etat.projet, plateforme: etat.plateforme }); rendre(true); });
  };

  const gestes = sur(sortie, 'click', '[data-plateforme], [data-scenario], [data-plier-scenarios], [data-nouvelle-campagne], [data-editer-campagne], [data-action="ouvrir-campagne"], [data-nouveau-testeur], [data-action="ouvrir-testeur"], [data-nouveau-parcours], [data-editer-parcours]', async (el) => {
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
    if (el.dataset.nouveauParcours) { await editer('parcours', env, { pid: el.dataset.nouveauParcours }); return; }
    if (el.dataset.editerParcours) {
      const pid = projetCourant();
      const x = lireTout(env).parcours.find((y) => y.ref === el.dataset.editerParcours && projetDe(y) === pid);
      if (x) await editer('parcours', env, { pid, fiche: x });
      return;
    }
    if (el.hasAttribute('data-nouveau-testeur')) {
      await ouvrirTesteur(null, { env, projets: magasin.lire(K.projets) || [] });
      return;
    }
    if (el.dataset.action === 'ouvrir-testeur') {
      const t = (magasin.lire(K.testeurs) || []).find((x) => x.id === el.dataset.id);
      if (t) await ouvrirTesteur(t, { env, projets: magasin.lire(K.projets) || [] });
      return;
    }
    if (el.dataset.action === 'ouvrir-campagne') {
      const pid = projetCourant();
      const d = lireTout(env);
      const c = d.campagnes.find((x) => x.id === el.dataset.id && projetDe(x) === pid);
      if (c) await ouvrirCampagne(c, { pid, env, scenarios: d.scenarios.filter((x) => projetDe(x) === pid) });
      return;
    }
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
