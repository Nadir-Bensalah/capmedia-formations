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

import { friseDevis, devisAvecEtapes, brancherFrise } from './frise.js';
import {
  echapper, dateCourte, depuis, pluriel, joursAvant, parDateDesc,
  NIVEAUX_SCENARIO, BLOCS_SCENARIO, PLATEFORMES_TEST, STATUTS_CAMPAGNE,
  GRAVITES_ANOMALIE, STATUTS_ANOMALIE, FAMILLES_AVIS, FAMILLES_REGLE, ETATS_REGLE,
  ETATS_PARCOURS, OUTILS_PARCOURS, PARCOURS_A_REGARDER, RESULTATS_PASSAGE,
  dateHeure, enDate,
} from '../noyau.js';
import {
  icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, agir, confirmer,
  brancherPieces,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, repartir } from '../donnees.js';
import { bdd, collection } from '../noyau.js';
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
    regles: rassembler(K.reglesToutes, K.regles),
    /* Le devis de la campagne et ses étapes : ce que le client a acheté,
       ligne par ligne, et ce qu'il vient vérifier en premier. */
    documents: rassembler(K.documentsTous, K.documents),
    jalons: rassembler(K.jalonsTous, K.jalons),
    testeurs: magasin.lire(K.testeurs) || [],
    /* Le client ne lit pas le vivier, il lit les profils publics : le
       même testeur, sans le nom ni l'adresse. Le magasin garde le parent
       du document, qui est l'identifiant du testeur. */
    profils: (magasin.lire(K.profils) || []).filter((x) => x.id === 'profil').map((x) => ({ ...x, id: x._parent })),
  };
};

/* Les avis et les passages vivent sous chaque campagne, et se lisent
   campagne par campagne : c'est la seule porte que les règles ouvrent au
   client. Le magasin garde l'identifiant du testeur (le nom du document)
   et celui de la campagne (son parent). */
const avisDe = (campagnes) => campagnes.flatMap((c) => (magasin.lire(K.appreciations(c.id)) || [])
  .map((a) => ({ ...a, testeur: a.id, campagne: c.id })));
const passagesDe = (c) => (magasin.lire(K.passages(c.id)) || []);

/* Comment on nomme un testeur. L'équipe lit son prénom ; le client lit un
   numéro, le MÊME partout sur la page, du vivier aux réponses libres :
   « Testeur 2 » doit désigner la même personne dans toutes les sections,
   sinon le numéro ne dit rien. Le profil, lui, reste : un avis de 22 ans
   et un de 55 ans ne disent pas la même chose. */
const nommeur = (d, { equipe, pid }) => {
  const gens = (equipe ? (d.testeurs || []) : (d.profils || [])).filter((t) => (t.projets || []).includes(pid));
  const rangs = new Map(gens.map((t, i) => [t.id, i + 1]));
  const rang = (uid) => { if (!rangs.has(uid)) rangs.set(uid, rangs.size + 1); return rangs.get(uid); };
  return (uid) => {
    const t = (equipe ? (d.testeurs || []) : (d.profils || [])).find((x) => x.id === uid) || {};
    const p = equipe ? (t.profil || {}) : t;
    const traits = [p.sexe, p.age ? `${p.age} ans` : '', p.fonction].filter(Boolean).join(', ');
    const nom = equipe ? (t.prenom || t.email || 'Testeur') : `Testeur ${rang(uid)}`;
    return { nom, traits, libelle: traits ? `${nom} · ${traits}` : nom };
  };
};

/* Une lecture en groupe ne dit pas de quel projet vient le document : la
   donnée ne porte pas son chemin. Le magasin garde l'identifiant du parent
   sous « _parent », et c'est lui qui répond quand le champ manque. */
/* Une référence de test est un code : on la compose en chasse fixe. */
const ref = (r) => `<span class="ref">${echapper(r)}</span>`;

/* La jauge : plusieurs états, une seule forme. Chaque part est
   proportionnelle, et la légende porte les nombres. */
const jauge = (parts) => {
  const total = parts.reduce((n, p) => n + p.n, 0) || 1;
  return `<div class="jauge" role="img" aria-label="${echapper(parts.map((p) => `${p.n} ${p.nom}`).join(', '))}">${parts.filter((p) => p.n).map((p) => `<i data-ton="${p.ton}" style="flex-basis:${((p.n / total) * 100).toFixed(2)}%"></i>`).join('')}</div>
  <div class="jauge-legende">${parts.map((p) => `<span class="puce puce--${p.ton}"><i></i><b>${p.n}</b> ${echapper(p.nom)}</span>`).join('')}</div>`;
};

/* Les barres : une ligne par famille, la longueur dit le nombre. */
const barres = (lignes) => {
  const max = Math.max(1, ...lignes.map((l) => l.n));
  return `<div class="barres">${lignes.map((l) => `<span class="barres-nom" title="${echapper(l.aide || '')}">${echapper(l.nom)}</span><span class="barres-piste"><i data-ton="${l.ton || ''}" style="width:${((l.n / max) * 100).toFixed(1)}%"></i></span><span class="barres-val">${l.n}</span>`).join('')}</div>`;
};

/* Un étage : un surtitre, une phrase avec les chiffres en gras, puis ses
   sections. C'est la structure qui donne un repère, pas une icône. */
const etage = (id, sur, resume, corps) => `<div class="etage" id="${echapper(id)}">
  <div class="etage-tete"><span class="etage-sur">${echapper(sur)}</span><p class="etage-resume">${resume}</p></div>
  ${corps}
</div>`;

/* Ce que chaque section veut dire, expliqué à quelqu'un qui n'a jamais
   testé un logiciel. Pas de jargon : si un mot du métier est
   indispensable, il est expliqué dans la phrase qui le porte. Un client
   qui comprend sa page ne demande pas pourquoi elle est rouge. */
const EXPLICATIONS = {
  'soucis': { titre: 'Ce qui ne va pas', corps: `
    <p>C'est la liste de ce qui mérite votre attention aujourd'hui, et rien d'autre. Si elle est vide, tout va bien.</p>
    <p>On y trouve trois choses : un problème grave trouvé par un testeur et confirmé, une campagne de tests qui a dépassé sa date de fin, et un test automatique qui vient d'échouer.</p>
    <p>Quand quelque chose apparaît ici, c'est qu'il faut agir. Le reste de la page est là pour le contexte.</p>` },
  'avancement': { titre: 'Avancement', corps: `
    <p>Un projet par ligne, avec ce qu'il contient : combien de vérifications sont prévues, combien de campagnes sont en cours, et s'il reste des problèmes ouverts.</p>
    <p>Cliquez sur un projet pour voir tout le détail.</p>` },
  'campagnes': { titre: 'Les campagnes', corps: `
    <p>Une campagne, c'est une session de tests avec un début et une fin. On choisit une liste de vérifications à faire, on les distribue à des testeurs, et on note ce qu'ils ont trouvé.</p>
    <p>Elle passe par trois états : <b>en préparation</b> (on décide quoi tester et qui), <b>en cours</b> (les testeurs travaillent), puis <b>close</b> (on a le résultat, et on ne peut plus rien y changer).</p>
    <p>On refait une campagne avant chaque nouvelle version de l'application, avec les mêmes vérifications : c'est ce qui permet de voir si quelque chose qui marchait s'est cassé.</p>` },
  'anomalies': { titre: 'Les anomalies', corps: `
    <p>Une anomalie, c'est un problème réel, constaté et reproduit : l'application ne fait pas ce qu'elle devrait.</p>
    <p>Quand plusieurs testeurs échouent sur la même vérification, ça ne fait qu'une seule anomalie, pas une par personne.</p>
    <p>Chacune a une gravité : <b>bloquant</b> (on ne peut pas continuer), <b>critique</b> (une fonction importante est cassée), <b>important</b> (gênant, mais on peut contourner), <b>mineur</b> (un détail, souvent d'apparence).</p>
    <p>Et un statut : nouvelle, confirmée, corrigée, ou sans suite si ce n'était finalement pas un défaut.</p>` },
  'testeurs': { titre: 'Les testeurs', corps: `
    <p>Les personnes qui utilisent l'application pour de vrai et notent ce qui cloche. Elles ne travaillent pas sur le projet : c'est justement ce qui rend leur regard utile.</p>
    <p>Chacune teste sur son propre téléphone, iPhone ou Android, et sur le web. On s'arrange pour que les vérifications importantes soient faites par au moins deux personnes sur deux systèmes différents.</p>
    <p>Côté client, les testeurs apparaissent sans leur nom ni leur adresse : on voit l'âge, le métier, l'aisance avec un téléphone et les appareils. C'est ce qu'il faut pour lire un avis en sachant d'où il vient, et rien de plus.</p>` },
  'parcours': { titre: 'Les parcours automatisés', corps: `
    <p>Un parcours automatisé, c'est une vérification qu'un robot rejoue tout seul, à chaque nouvelle version de l'application, sans qu'un humain touche à rien. Par exemple : « créer un rappel, puis vérifier qu'il apparaît bien dans la liste ».</p>
    <p>L'intérêt : une fois écrit, il tourne à chaque fois, pour toujours. Un défaut corrigé ne peut plus revenir sans qu'on le voie.</p>
    <p>Les états, dans l'ordre :</p>
    <ul>
      <li><b>À écrire</b> : le parcours est prévu et nommé, mais le programme qui le joue n'existe pas encore. C'est une ligne sur une liste, rien ne tourne.</li>
      <li><b>Écrit</b> : le programme existe, mais il n'a pas encore été lancé sur une vraie version.</li>
      <li><b>Vert</b> : il a tourné, et tout s'est passé comme prévu.</li>
      <li><b>Rouge</b> : il a tourné, et quelque chose n'a pas marché. C'est ce qu'on cherche.</li>
      <li><b>Instable</b> : il réussit une fois, échoue la fois suivante, sans que rien n'ait changé. C'est pire que rouge, parce qu'on finit par ne plus le croire.</li>
    </ul>
    <p><b>Éprouvé par mutation</b>, ça veut dire qu'on a cassé l'application exprès pour vérifier que le parcours s'en apercevait. Un parcours vert qui n'a jamais été éprouvé ne prouve rien : peut-être qu'il ne regarde pas la bonne chose. C'est le chiffre le plus honnête de la page.</p>
    <p>La jauge montre la part de chaque état. Aujourd'hui elle est presque entièrement grise : les parcours sont prévus, pas encore écrits.</p>` },
  'regles': { titre: 'Les règles métier', corps: `
    <p>Une règle métier, c'est un calcul que l'application fait dans son coin, sans écran : par exemple « une tâche tous les mardis pendant deux mois, ça donne quelles dates ? ».</p>
    <p>Ces calculs se vérifient sans téléphone et sans robot qui clique : on donne une question, on compare la réponse. Ça prend une fraction de seconde, donc on peut en essayer des centaines là où un testeur humain en essaie trois. C'est pour ça qu'on compte en <b>cas essayés</b> et pas en tests.</p>
    <p>Une <b>famille</b> regroupe les cas d'une même règle. Les barres montrent combien de cas chaque famille essaie : plus la barre est longue, plus la règle est fouillée.</p>
    <p>Les états sont les mêmes que pour les parcours : <b>à écrire</b> (prévu, pas encore programmé), <b>vert</b> (tout juste), <b>rouge</b> (une réponse fausse).</p>` },
  'scenarios': { titre: 'La bibliothèque de scénarios', corps: `
    <p>Un scénario, c'est une vérification écrite pour un humain : ce qu'il doit faire dans l'application, pas à pas, et ce qu'il doit obtenir à la fin. Par exemple : « créer un anniversaire sans année de naissance, et vérifier qu'il s'affiche quand même ».</p>
    <p>La bibliothèque contient tous les scénarios du projet, rangés par partie de l'application. Une campagne pioche dedans.</p>
    <p>Trois niveaux : <b>socle</b>, les vérifications essentielles, faites par deux testeurs sur deux systèmes différents ; <b>transversal</b>, ce qui traverse toute l'application (la langue, le mode hors ligne), aussi en double ; <b>réparti</b>, le reste, fait par une seule personne.</p>` },
  'avis': { titre: 'Le questionnaire', corps: `
    <p>Les scénarios disent si l'application <b>marche</b>. Le questionnaire dit si elle <b>plaît</b>, et c'est la seconde question qui décide si les gens la gardent.</p>
    <p>Chaque testeur y répond deux fois. Trois questions <b>avant de commencer</b>, en deux minutes : c'est le seul regard qu'on ne retrouve jamais, une fois qu'on connaît l'application. Puis tout le reste <b>après avoir tout déroulé</b> : l'esthétique, la facilité, l'utilité, l'argent, la vitesse ressentie, et quatre questions libres.</p>
    <p>Les notes sont des moyennes. Les réponses libres sont rendues <b>mot pour mot</b>, jamais résumées : c'est là qu'est la vraie information.</p>
    <p>Les quatre questions sur le prix ne sont pas une invention : c'est une méthode connue qui donne une <b>fourchette</b> plutôt qu'un chiffre en l'air. En dessous du bas de la fourchette, les gens se méfient de la qualité ; au-dessus du haut, ils renoncent.</p>
    <p>Quand personne n'a encore répondu, la page montre quand même toutes les questions : c'est ce qui sera demandé, et vous pouvez le lire avant que la campagne commence.</p>` },
  'resultats': { titre: 'Les résultats, scénario par scénario', corps: `
    <p>Chaque fois qu'un testeur déroule un scénario, il consigne un <b>passage</b> : ce qu'il a obtenu, sur quel appareil, avec un commentaire et une capture s'il y a eu un problème.</p>
    <p><b>OK</b> : ça a marché comme prévu. <b>KO</b> : ça n'a pas marché, et une preuve est jointe. <b>NA</b> : le scénario ne s'appliquait pas sur cet appareil.</p>
    <p>Un scénario important est déroulé par deux personnes sur deux systèmes différents : il a donc deux passages. Un KO fait naître une anomalie tout seul, regroupée par scénario.</p>` },
  'activite': { titre: 'Activité', corps: `
    <p>Ce qui s'est passé récemment sur tous les projets, du plus récent au plus ancien : une campagne qui change d'état, une anomalie signalée ou corrigée.</p>` },
};

/* Le petit « i » à côté d'un titre. Il n'explique rien lui-même : il
   ouvre l'explication, pour que le titre reste un titre. */
const infoBouton = (cle) => `<button class="btn-info" type="button" data-info="${echapper(cle)}" aria-label="Qu'est-ce que c'est ?" data-astuce="Qu'est-ce que c'est ?">${icone('info')}</button>`;

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

  /* Et une campagne OUVERTE dont la sélection est vide, alors même que le
     projet a des scénarios. C'est le cas le plus traître : la campagne
     existe, elle est en cours, les testeurs sont affectés, et personne
     n'a rien à faire. Rien ne le dit tant qu'on n'ouvre pas la campagne. */
  d.campagnes
    .filter((c) => c.statut === 'en-cours' && !(c.scenarios || []).length && avecScenario.has(projetDe(c)))
    .forEach((c) => soucis.push({
      ton: 'ambre', icone: 'bug',
      titre: `${echapper(c.nom || 'Campagne')} : aucun scénario retenu`,
      sous: `${echapper(nomProjet(projetDe(c)))} · elle est en cours et n'a rien à distribuer`,
      fin: '',
    }));

  if (!soucis.length) {
    return `<section class="section" style="margin-top:0">
      <div class="section-tete"><h2>Ce qui ne va pas ${infoBouton('soucis')}</h2></div>
      <p class="calme">${icone('check')} Rien à signaler : aucune anomalie bloquante, aucune campagne en retard, aucun parcours rouge.</p>
    </section>`;
  }

  return `<section class="section section--alerte" style="margin-top:0">
    <div class="section-tete"><div><h2>Ce qui ne va pas ${infoBouton('soucis')}</h2><p class="chapo">${pluriel(soucis.length, 'point à regarder', 'points à regarder')}.</p></div></div>
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
      <div class="section-tete"><h2>Avancement ${infoBouton('avancement')}</h2></div>
      ${vide({ icone: 'bug', titre: 'Aucun projet testé', texte: 'Versez un plan de tests sur un projet pour commencer.', compact: true })}
    </section>`;
  }

  return `<section class="section">
    <div class="section-tete"><div><h2>Avancement ${infoBouton('avancement')}</h2><p class="chapo">${pluriel(lignes.length, 'projet suivi', 'projets suivis')}.</p></div></div>
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
    <div class="section-tete"><h2>Activité ${infoBouton('activite')}</h2></div>
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

  /* Cent quarante-quatre lignes à plat, personne ne les lit. On groupe par
     outil, parce que c'est l'outil qui décide où le parcours tourne et qui
     l'écrit, et on replie : ce qui doit sauter aux yeux, ce sont les
     chiffres et ce qui ne va pas, pas le catalogue. */
  const parOutil = Object.keys(OUTILS_PARCOURS)
    .map((o) => ({ cle: o, f: OUTILS_PARCOURS[o], items: liste.filter((x) => x.outil === o) }))
    .filter((g) => g.items.length);

  const aVoir = liste.filter((x) => PARCOURS_A_REGARDER.includes(x.etat));

  const rangee = (x) => ligne({
    icone: x.outil === 'playwright' ? 'globe' : x.outil === 'jest' ? 'code' : 'smartphone',
    ton: x.etat === 'vert' ? 'vert' : x.etat === 'rouge' ? 'rouge' : x.etat === 'instable' ? 'ambre' : '',
    titre: `${ref(x.ref)} ${echapper(x.titre || '')}${x.mutation || x.etat !== 'vert' ? '' : ' <span class="etiquette">Non éprouvé</span>'}`,
    sous: `${echapper((OUTILS_PARCOURS[x.outil] || {}).court || x.outil)}${(x.plateformes || []).length ? ` · ${echapper((x.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', '))}` : ''}${(x.scenarios || []).length ? ` · ${pluriel((x.scenarios || []).length, 'scénario', 'scénarios')}` : ''}${x.note ? ` · ${echapper(x.note.slice(0, 60))}` : ''}`,
    fin: `${pastille(ETATS_PARCOURS, x.etat || 'a-ecrire')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-parcours="${echapper(x.ref)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
  });

  return `<section class="section" id="parcours">
    <div class="section-tete">
      <div><h2>Parcours automatisés ${infoBouton('parcours')}</h2><p class="chapo">${liste.length ? `${pluriel(liste.length, 'parcours', 'parcours')} rejoués à chaque version${couverts ? `, couvrant ${pluriel(couverts, 'scénario', 'scénarios')}` : ''}.` : 'Ce que la machine rejouera à chaque version.'}</p></div>
      ${equipe && pid ? `<button class="btn btn-principal btn-petit" type="button" data-nouveau-parcours="${echapper(pid)}">${icone('plus')} Nouveau parcours</button>` : ''}
    </div>

    ${liste.length ? `
    ${jauge([
      { n: par.vert || 0, nom: 'au vert', ton: 'vert' },
      { n: par.rouge || 0, nom: 'rouges', ton: 'rouge' },
      { n: par.instable || 0, nom: 'instables', ton: 'ambre' },
      { n: par.ecrit || 0, nom: 'écrits', ton: 'bleu' },
      { n: (par['a-ecrire'] || 0) + (par.suspendu || 0), nom: 'à écrire', ton: 'gris' },
    ])}

    <p class="doctrine"><b>${eprouves} / ${liste.length}</b> éprouvés par mutation${eprouves < liste.length ? ` · ${pluriel(liste.length - eprouves, 'parcours n\'a pas encore été remis en défaut', 'parcours n\'ont pas encore été remis en défaut')}. Un parcours au vert ne prouve rien tant qu'on ne l'a pas vu tomber.` : '.'}</p>

    <div class="rang couverture" style="margin:18px 0 14px">
      ${parOutil.map((g) => `<span class="puce" data-astuce="${echapper(g.f.ou)}"><b>${g.items.length}</b> ${echapper(g.f.court)}</span>`).join('')}
    </div>

    ${aVoir.length ? `<div class="liste" style="margin-bottom:14px">${aVoir.map(rangee).join('')}</div>` : ''}

    <button class="btn btn-secondaire btn-petit" type="button" data-plier-parcours aria-expanded="false">${icone('deplier')} Voir les ${liste.length} parcours</button>
    <div id="catalogue-parcours" hidden style="margin-top:14px">
      ${parOutil.map((g) => `
        <div class="bloc-scenarios">
          <h3 class="bloc-tete">${echapper(g.f.libelle)}<span class="badge">${g.items.length}</span></h3>
          <p class="aide" style="margin:0 0 8px">${echapper(g.f.ou)}</p>
          <div class="liste">${g.items.map(rangee).join('')}</div>
        </div>`).join('')}
    </div>`
    : vide({ icone: 'code', titre: 'Aucun parcours',
        texte: equipe && pid ? 'Un parcours est rejoué par une machine à chaque version : c\'est ce qui empêche un défaut corrigé de revenir.' : 'Les parcours automatisés apparaîtront ici.', compact: true })}
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 3 bis · Les règles métier
   -------------------------------------------------------------------------- */

/* Mille règles ne se listent pas comme trois cents parcours. Un parcours
   se lit à l'unité, une règle vit dans une famille et n'a d'intérêt que
   par le nombre de cas qu'elle essaie. On montre donc les familles, et le
   nombre de cas en gros : c'est lui qui dit la profondeur.

   Et on dit pourquoi c'est gratuit, parce que c'est la question que le
   client pose : mille règles tournent en moins d'une minute, là où trois
   cents parcours d'interface prennent des heures. */
const reglesHtml = (d, { pid, equipe }) => {
  const liste = (d.regles || []).filter((x) => x.actif !== false && (!pid || projetDe(x) === pid));
  if (!liste.length) {
    return `<section class="section">
      <div class="section-tete">
        <div><h2>Règles métier ${infoBouton('regles')}</h2><p class="chapo">Ce que la machine vérifie en millisecondes.</p></div>
        ${equipe && pid ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-regle="${echapper(pid)}">${icone('plus')} Nouvelle famille</button>` : ''}
      </div>
      ${vide({ icone: 'code', titre: 'Aucune règle',
        texte: 'Une règle métier pure tourne en une milliseconde : on peut donc en essayer mille, là où un parcours d\'interface en essaie trois.', compact: true })}
    </section>`;
  }

  const cas = liste.reduce((n, x) => n + (Number(x.cas) || 0), 0);
  const verts = liste.filter((x) => x.etat === 'vert');
  const casVerts = verts.reduce((n, x) => n + (Number(x.cas) || 0), 0);
  const rouges = liste.filter((x) => x.etat === 'rouge');
  const eprouvees = liste.filter((x) => x.mutation).length;

  const parFamille = Object.keys(FAMILLES_REGLE)
    .map((f) => ({ cle: f, f: FAMILLES_REGLE[f], items: liste.filter((x) => x.famille === f) }))
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, cas: g.items.reduce((n, x) => n + (Number(x.cas) || 0), 0) }))
    .sort((a, b) => b.cas - a.cas);

  const rangee = (x) => ligne({
    icone: 'code',
    ton: x.etat === 'vert' ? 'vert' : x.etat === 'rouge' ? 'rouge' : '',
    titre: `${ref(x.ref)} ${echapper(x.titre || '')}${x.mutation || x.etat !== 'vert' ? '' : ' <span class="etiquette">Non éprouvée</span>'}`,
    sous: `${pluriel(Number(x.cas) || 0, 'cas essayé', 'cas essayés')}${x.cherche ? ` · ${echapper(x.cherche)}` : ''}`,
    fin: `${pastille(ETATS_REGLE, x.etat || 'a-ecrire')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-regle="${echapper(x.ref)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
  });

  return `<section class="section" id="regles">
    <div class="section-tete">
      <div><h2>Règles métier ${infoBouton('regles')}</h2><p class="chapo">${pluriel(liste.length, 'famille', 'familles')}, ${pluriel(cas, 'cas essayé', 'cas essayés')} à chaque enregistrement.</p></div>
      ${equipe && pid ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-regle="${echapper(pid)}">${icone('plus')} Nouvelle famille</button>` : ''}
    </div>

    ${barres(parFamille.map((g) => ({
      nom: g.f.libelle, n: g.cas, aide: g.f.aide,
      ton: g.items.some((r) => r.etat === 'rouge') ? 'rouge' : g.items.length && g.items.every((r) => r.etat === 'vert') ? 'vert' : '',
    })))}

    <p class="doctrine"><b>${eprouvees} / ${liste.length}</b> éprouvées par mutation · <b>${casVerts}</b> cas au vert${rouges.length ? ` · <b>${rouges.length}</b> ${rouges.length > 1 ? 'familles rouges' : 'famille rouge'}` : ''}</p>

    <p class="aide" style="margin:14px 0">Une règle métier tourne en une milliseconde : les ${cas} passent en moins d'une minute, à chaque enregistrement. C'est ce qui permet d'essayer le 29 février sur cinquante ans, ou les cent vingt-sept combinaisons de jours d'une répétition hebdomadaire, là où un parcours d'interface en essaie trois.</p>

    ${rouges.length ? `<div class="liste" style="margin-bottom:14px">${rouges.map(rangee).join('')}</div>` : ''}

    <button class="btn btn-secondaire btn-petit" type="button" data-plier-regles aria-expanded="false">${icone('deplier')} Voir les ${liste.length} familles</button>
    <div id="catalogue-regles" hidden style="margin-top:14px">
      ${parFamille.map((g) => `
        <div class="bloc-scenarios">
          <h3 class="bloc-tete">${echapper(g.f.libelle)}<span class="badge">${g.cas}</span></h3>
          <p class="aide" style="margin:0 0 8px">${echapper(g.f.aide)}</p>
          <div class="liste">${g.items.map(rangee).join('')}</div>
        </div>`).join('')}
    </div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 4 · Le vivier
   -------------------------------------------------------------------------- */

/* Qui teste, sur quoi, et où il en est. Le tableau répond à la seule
   question qui compte en cours de campagne : qui traîne, et qui a fini. */
const vivierHtml = (d, { equipe }) => {
  if (!equipe) return vivierClientHtml(d);
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

  return `<section class="section" id="testeurs">
    <div class="section-tete">
      <div><h2>Testeurs ${infoBouton('testeurs')}</h2><p class="chapo">${gens.length ? pluriel(gens.length, 'personne au vivier', 'personnes au vivier') : 'Le vivier est vide.'}</p></div>
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

/* Le même vivier vu par le client : qui teste pour lui, sans le nom ni
   l'adresse, qui ne lui ont jamais été recopiés. Il voit l'âge, la
   fonction, l'aisance, les appareils : de quoi lire un avis en sachant
   d'où il vient. Et rien à cliquer, parce qu'il n'a rien à y faire. */
const vivierClientHtml = (d) => {
  const gens = d.profils || [];
  return `<section class="section" id="testeurs">
    <div class="section-tete">
      <div><h2>Testeurs ${infoBouton('testeurs')}</h2><p class="chapo">${gens.length ? `${pluriel(gens.length, 'personne teste', 'personnes testent')} pour vous. Leur nom ne vous est pas montré : ce qui compte, c'est d'où vient chaque avis.` : 'Personne n\'est encore affecté à ce projet.'}</p></div>
    </div>
    ${gens.length ? `<div class="liste">${gens.map((p, i) => {
      const traits = [p.age ? `${p.age} ans` : '', p.fonction, p.sexe, p.aisance ? `à l'aise : ${p.aisance}` : ''].filter(Boolean).join(' · ');
      return ligne({
        icone: 'utilisateur', ton: 'bleu',
        titre: `Testeur ${i + 1}`,
        sous: echapper(traits || 'Profil non renseigné'),
        fin: (p.plateformes || (p.mobile ? [p.mobile, 'web'] : [])).map((x) => `<span class="puce puce--mini">${icone(x === 'ios' ? 'apple' : x === 'android' ? 'android' : 'globe')} ${echapper((PLATEFORMES_TEST[x] || {}).court || x)}</span>`).join(''),
      });
    }).join('')}</div>`
    : vide({ icone: 'utilisateurs', titre: 'Aucun testeur pour l\'instant', texte: 'Ils apparaîtront ici dès qu\'ils seront affectés au projet.', compact: true })}
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
  const enCours = camp.filter((c) => c.statut === 'en-cours').length;

  /* Ce que chaque étage résume, calculé ici pour que la phrase et les
     sections en dessous lisent les mêmes listes. */
  const gens = (equipe ? (d.testeurs || []) : (d.profils || [])).filter((t) => (t.projets || []).includes(pid));
  const parc = (d.parcours || []).filter((x) => x.actif !== false && projetDe(x) === pid);
  const regl = (d.regles || []).filter((x) => x.actif !== false && projetDe(x) === pid);
  const casRegles = regl.reduce((n, x) => n + (Number(x.cas) || 0), 0);
  const parcVerts = parc.filter((x) => x.etat === 'vert').length;

  const humain = `${enCours ? `<b>${enCours}</b> ${enCours > 1 ? 'campagnes en cours' : 'campagne en cours'}` : `<b>${camp.length}</b> ${camp.length > 1 ? 'campagnes' : 'campagne'}, aucune en cours`}, <b>${gens.length}</b> ${gens.length > 1 ? 'testeurs' : 'testeur'}, <b>${ouvertes}</b> ${ouvertes > 1 ? 'anomalies ouvertes' : 'anomalie ouverte'}.`;
  const machine = `<b>${parc.length}</b> parcours d'interface et <b>${casRegles}</b> cas de règles rejoués à chaque version${parc.length ? `, <b>${parcVerts}</b> ${parcVerts > 1 ? 'parcours au vert' : 'parcours au vert'}` : ''}.`;
  const bibli = `<b>${scen.length}</b> scénarios en <b>${parBloc.length}</b> blocs, soit <b>${passages}</b> passages mobiles par campagne complète.`;

  const devisProjet = devisAvecEtapes((d.documents || []).filter((x) => x.projet === pid), (d.jalons || []).filter((j) => projetDe(j) === pid));
  const jalonsProjet = (d.jalons || []).filter((j) => projetDe(j) === pid);
  const etapesDevis = jalonsProjet.filter((j) => devisProjet.some((dv) => dv.id === j.devis));
  const etapesFaites = etapesDevis.filter((j) => j.statut === 'termine');
  const resumeDevis = `<b>${etapesFaites.length} / ${etapesDevis.length}</b> ${etapesDevis.length > 1 ? 'lignes du devis livrées' : 'ligne du devis livrée'}${devisProjet.length > 1 ? `, sur <b>${devisProjet.length}</b> devis` : ''}.`;

  /* Le questionnaire : toutes les campagnes du projet confondues. Le
     nommeur donne le même numéro à un testeur partout sur la page. */
  const nommer = nommeur(d, { equipe, pid });
  const avis = avisDe(camp);
  const { recommande, suspect, cher } = mesuresAvis(avis);
  const nbQuestions = Object.values(FAMILLES_AVIS).reduce((n, f) => n + f.questions.length, 0);
  const resumeAvis = avis.length
    ? `<b>${avis.length}</b> ${avis.length > 1 ? 'testeurs ont répondu' : 'testeur a répondu'} au questionnaire${recommande ? `, recommandation <b>${recommande.v.toFixed(1)}</b> sur 10` : ''}${suspect && cher ? `, prix acceptable entre <b>${suspect.median}</b> et <b>${cher.median} €</b> par mois` : ''}.`
    : `Personne n'a encore répondu. Les <b>${nbQuestions}</b> questions posées à chaque testeur sont ci-dessous.`;

  const index = [
    ...(devisProjet.length ? [['etage-devis', 'Le devis', `${etapesFaites.length}/${etapesDevis.length}`]] : []),
    ['campagnes', 'Campagnes', camp.length],
    ...(ano.length ? [['anomalies', 'Anomalies', ano.length]] : []),
    ['testeurs', 'Testeurs', gens.length],
    ['avis', 'Questionnaire', avis.length],
    ['parcours', 'Parcours', parc.length],
    ['regles', 'Règles', casRegles],
    ['scenarios', 'Scénarios', scen.length],
  ];

  const sectionCampagnes = `<section class="section" id="campagnes">
    <div class="section-tete">
      <div><h2>Campagnes ${infoBouton('campagnes')}</h2><p class="chapo">Une campagne pioche dans la bibliothèque : les mêmes scénarios sont rejoués d'une version à l'autre.</p></div>
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
  </section>`;

  /* La section existe même vide pour l'équipe : c'est là qu'on pose une
     anomalie à la main. Pour le client, une section vide ne dit rien. */
  const sectionAnomalies = (ano.length || equipe) ? `<section class="section" id="anomalies">
    <div class="section-tete">
      <div><h2>Anomalies ${infoBouton('anomalies')}</h2><p class="chapo">Plusieurs échecs sur le même scénario font une seule anomalie. ${equipe ? 'Un KO de testeur en crée une tout seul ; vous pouvez aussi en poser une à la main.' : ''}</p></div>
      ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-anomalie="${echapper(pid)}">${icone('plus')} Nouvelle anomalie</button>` : ''}
    </div>
    ${ano.length ? `<div class="liste">${ano.map((a) => ligne({
      icone: 'alerte', ton: (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'rouge' ? 'rouge' : (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'ambre' ? 'ambre' : '',
      titre: `${a.scenario ? `${ref(a.scenario)} ` : ''}${echapper(a.titre || 'Anomalie')}${Number(a.retours) ? ' <span class="etiquette">Revenue</span>' : ''}`,
      sous: `${(a.temoins || a.passages || []).length ? pluriel((a.temoins || a.passages || []).length, 'témoin', 'témoins') : (a.origine === 'equipe' ? 'posée à la main' : '')}${(a.plateformes || []).length ? ` · ${echapper((a.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', '))}` : ''}${a.description ? ` · ${echapper(String(a.description).slice(0, 70))}` : ''}`,
      fin: `${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-anomalie="${echapper(a.id)}" aria-label="Qualifier" data-astuce="Qualifier">${icone('edit')}</button></span>` : ''}`,
      action: 'ouvrir-anomalie', attrs: `data-id="${echapper(a.id)}"`,
    })).join('')}</div>`
    : vide({ icone: 'alerte', titre: 'Aucune anomalie', texte: 'Un échec de testeur en fera une tout seul, regroupée par scénario. Vous pouvez aussi en poser une à la main.', compact: true })}
  </section>` : '';

  const sectionScenarios = `<section class="section" id="scenarios">
    <div class="section-tete">
      <div><h2>Scénarios ${infoBouton('scenarios')}</h2><p class="chapo">La bibliothèque du projet${plateforme ? `, sur ${(PLATEFORMES_TEST[plateforme] || {}).libelle}` : ''}. ${scen.length ? pluriel(scen.length, 'scénario', 'scénarios') : 'Vide.'}</p></div>
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

  return `
  <div class="rang chiffres-tests">
    <div class="chiffre"><span class="chiffre-valeur">${scen.length}</span><span class="chiffre-nom">scénarios</span></div>
    <div class="chiffre"><span class="chiffre-valeur">${passages}</span><span class="chiffre-nom">passages mobiles</span></div>
    <div class="chiffre"><span class="chiffre-valeur">${enCours}</span><span class="chiffre-nom">campagnes en cours</span></div>
    <div class="chiffre${ouvertes ? ' chiffre--alerte' : ''}"><span class="chiffre-valeur">${ouvertes}</span><span class="chiffre-nom">anomalies ouvertes</span></div>
  </div>

  <div class="tests-corps tests-corps--index">
    <div>
      ${alertes({ ...d, anomalies: ano, campagnes: camp, parcours: parc, scenarios: scen }, { nomProjet, plateforme })}
      ${devisProjet.length ? etage('etage-devis', 'Le devis, ligne par ligne', resumeDevis, `<div style="margin-top:20px">${devisProjet.map((dv) => friseDevis(dv, jalonsProjet, { equipe, pid })).join('')}</div>`) : ''}
      ${etage('etage-humain', 'Tests humains', humain, `${sectionCampagnes}${sectionAnomalies}${vivierHtml({ ...d, testeurs: gens, profils: gens }, { equipe })}`)}
      ${etage('etage-avis', 'Ce que les testeurs en pensent', resumeAvis, avisHtml(avis, { nommer }))}
      ${etage('etage-machine', 'Tests automatisés', machine, `${parcoursHtml(d, { pid, equipe })}${reglesHtml(d, { pid, equipe })}`)}
      ${etage('etage-bibli', 'Bibliothèque', bibli, sectionScenarios)}
    </div>
    <aside class="index-page" aria-label="Sur cette page">
      <span class="etage-sur">Sur cette page</span>
      ${index.map(([id, nom, n]) => `<button type="button" data-aller="${id}">${echapper(nom)}<b>${n}</b></button>`).join('')}
    </aside>
  </div>`;
};

/* Le plan de tests est écrit en markdown, et son gras porte du sens : il
   désigne l'option exacte à choisir dans l'application (« Type **Rappel** »).
   On le rend, et rien d'autre : le texte est échappé avant, donc aucune
   balise venue de la fiche ne peut s'ouvrir ici. */
const gras = (texte) => echapper(texte || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/* La fiche d'une anomalie : la gravité, l'état, ce qu'on sait, et chaque
   témoin, avec sa preuve. C'est ce que l'équipe lit avant de reproduire,
   et ce que le client lit pour savoir où on en est. */
const ouvrirAnomalie = (a, { equipe, pid, env, scenarios }) => {
  const s = (scenarios || []).find((x) => x.ref === a.scenario);
  const temoins = (a.temoins || []).slice().sort((x, y) => (enDate(y.le) || 0) - (enDate(x.le) || 0));
  return modale({
    titre: a.titre || 'Anomalie', sousTitre: [a.scenario, (BLOCS_SCENARIO[a.bloc] || {}).libelle].filter(Boolean).join(' · '), feuille: true,
    corps: `
      <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}
        ${Number(a.retours) ? `<span class="etiquette">Revenue ${a.retours > 1 ? `${a.retours} fois` : 'une fois'} après correction</span>` : ''}
        ${(a.plateformes || []).map((p) => `<span class="puce">${echapper((PLATEFORMES_TEST[p] || {}).libelle || p)}</span>`).join('')}
      </div>
      <p class="aide" style="margin-bottom:16px">${echapper((GRAVITES_ANOMALIE[a.gravite] || {}).aide || '')}</p>
      ${a.description ? `<div class="groupe"><span class="etiquette-champ">Ce qu'on sait</span><div class="prose"><p>${echapper(a.description).replace(/\n/g, '<br>')}</p></div></div>` : ''}
      ${s ? `<div class="groupe"><span class="etiquette-champ">Le scénario</span><p class="t-corps">${gras(s.attendu)}</p></div>` : ''}
      <div class="groupe"><span class="etiquette-champ">${temoins.length ? pluriel(temoins.length, 'témoin', 'témoins') : 'Aucun témoin'}</span>
        ${temoins.length ? `<div class="liste liste--serree">${temoins.map((t) => ligne({
          icone: 'utilisateur', ton: 'ambre',
          titre: `${echapper((PLATEFORMES_TEST[t.plateforme] || {}).libelle || t.plateforme || 'Plateforme inconnue')}${t.appareil ? ` · ${echapper(t.appareil)}` : ''}`,
          sous: `${t.le ? `${echapper(dateHeure(t.le))} · ` : ''}${echapper(t.commentaire || 'Sans commentaire')}`,
          fin: (t.preuves || []).map((c, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(c)}">${icone('image')} Preuve ${i + 1}</button>`).join(''),
        })).join('')}</div>` : `<p class="aide">Posée à la main, sans échec de testeur derrière.</p>`}
      </div>`,
    pied: `${equipe ? `<button class="btn btn-secondaire" type="button" data-qualifier>${icone('edit')} Qualifier</button>` : ''}<span class="pousse"></span><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
};

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
   3 · femme, 35-44 ans » suffit à comprendre qui parle sans le nommer.

   Avec « toutes », chaque question est montrée même sans réponse : c'est
   ce qui sera demandé, et le client peut le lire avant la campagne. */
const mesuresAvis = (avis) => {
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
  return { moyenne, euros, suspect: euros('argent.suspect'), cher: euros('argent.cher'), recommande: moyenne('facilite.recommande') };
};

/* Ce qu'une question attend, dit en clair : c'est ce qu'on lit quand
   personne n'a encore répondu. */
const formeDe = (q) => {
  if (q.type === 'echelle') return `Une note de 1 à 5${q.bas ? `, de « ${q.bas} » à « ${q.haut} »` : ''}`;
  if (q.type === 'note10') return 'Une note de 0 à 10';
  if (q.type === 'choix') return `Au choix : ${(q.options || []).join(', ')}`;
  if (q.type === 'euros') return 'Un montant en euros, par mois';
  return 'Une réponse libre, rendue mot pour mot';
};

const restitutionHtml = (avis, { nommer, toutes = false }) => {
  const { moyenne, euros } = mesuresAvis(avis);
  const repondu = (cle) => avis.filter((a) => a[cle] !== undefined && a[cle] !== null && a[cle] !== '');

  const questionHtml = (cle, q) => {
    const id = `${cle}.${q.cle}`;
    const enonce = `<span class="avis-question">${echapper(q.libelle)}</span>`;
    if (!repondu(id).length) {
      return toutes ? `<div class="avis-mesure avis-mesure--vide">${enonce}<span class="avis-forme">${echapper(formeDe(q))}</span></div>` : '';
    }
    if (q.type === 'echelle' || q.type === 'note10') {
      const m = moyenne(id);
      if (!m) return '';
      const part = q.type === 'note10' ? (m.v / 10) * 100 : (m.v / 5) * 100;
      return `<div class="avis-mesure">
        <div class="rang" style="justify-content:space-between;gap:12px">${enonce}<strong>${m.v.toFixed(1)}${q.type === 'note10' ? ' / 10' : ' / 5'}</strong></div>
        <div class="testeur-jauge" style="margin-top:6px"><div class="testeur-jauge-barre" style="width:${Math.round(part)}%"></div></div>
        ${q.bas ? `<div class="rang avis-bornes"><span>${echapper(q.bas)}</span><span>${echapper(q.haut || '')}</span></div>` : ''}
      </div>`;
    }
    if (q.type === 'choix') {
      const comptes = {};
      avis.forEach((a) => { const v = a[id]; if (v) comptes[v] = (comptes[v] || 0) + 1; });
      const lignes = Object.entries(comptes).sort((a, b) => b[1] - a[1]);
      return `<div class="avis-mesure">${enonce}
        <div class="rang" style="gap:8px;flex-wrap:wrap;margin-top:6px">${lignes.map(([v, n]) => `<span class="puce">${echapper(v)} <strong>${n}</strong></span>`).join('')}</div>
      </div>`;
    }
    if (q.type === 'euros') {
      const e = euros(id);
      if (!e) return '';
      return `<div class="avis-mesure">
        <div class="rang" style="justify-content:space-between;gap:12px">${enonce}<strong>${e.median} €</strong></div>
        <p class="aide" style="margin-top:4px">${e.bas === e.haut ? `${pluriel(e.sur, 'réponse', 'réponses')}` : `de ${e.bas} à ${e.haut} €, sur ${pluriel(e.sur, 'réponse', 'réponses')}`}</p>
      </div>`;
    }
    const dits = avis.map((a) => ({ texte: a[id], uid: a.testeur })).filter((x) => x.texte);
    return `<div class="avis-mesure">${enonce}
      <div class="avis-verbatims">${dits.map((x) => `
        <blockquote class="avis-verbatim">
          <p>${echapper(String(x.texte))}</p>
          <cite>${echapper(nommer(x.uid).libelle)}</cite>
        </blockquote>`).join('')}</div>
    </div>`;
  };

  return Object.entries(FAMILLES_AVIS).map(([cle, f]) => `
    <section class="avis-famille">
      <h3 class="bloc-tete">${echapper(f.libelle)}${toutes ? `<span class="etiquette">${f.quand === 'avant' ? 'Avant de commencer' : 'Après avoir tout déroulé'}</span>` : ''}</h3>
      ${toutes && f.aide ? `<p class="aide" style="margin:0 0 10px">${echapper(f.aide)}</p>` : ''}
      ${f.questions.map((q) => questionHtml(cle, q)).join('')}
    </section>`).join('');
};

/* Les trois chiffres qui résument un questionnaire : qui recommande, à
   quel prix, et combien de personnes l'ont dit. */
const chiffresAvis = (avis) => {
  const { recommande, suspect, cher } = mesuresAvis(avis);
  return `<div class="rang chiffres-tests" style="margin-bottom:22px">
    ${recommande ? `<div class="chiffre"><span class="chiffre-valeur">${recommande.v.toFixed(1)}</span><span class="chiffre-nom">recommandation sur 10</span></div>` : ''}
    ${suspect && cher ? `<div class="chiffre"><span class="chiffre-valeur">${suspect.median} à ${cher.median} €</span><span class="chiffre-nom">fourchette acceptable</span></div>` : ''}
    <div class="chiffre"><span class="chiffre-valeur">${avis.length}</span><span class="chiffre-nom">${avis.length > 1 ? 'testeurs ont répondu' : 'testeur a répondu'}</span></div>
  </div>
  ${suspect && cher ? `<p class="aide" style="margin-bottom:22px">En dessous de ${suspect.median} €, ils se méfient de la qualité. Au-dessus de ${cher.median} €, ils renoncent. Sur ${pluriel(avis.length, 'réponse', 'réponses')}, c'est une direction, pas une étude de marché.</p>` : ''}`;
};

const ouvrirAvis = (campagne, { nommer }) => {
  const avis = campagne._avis || [];

  if (!avis.length) {
    return modale({
      titre: 'Ce que les testeurs en pensent', feuille: true,
      corps: vide({ icone: 'coeur', titre: 'Aucun avis pour l\'instant',
        texte: 'Le questionnaire est proposé aux testeurs quand ils ont tout déroulé.', compact: true }),
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    }).fin;
  }

  return modale({
    titre: 'Ce que les testeurs en pensent',
    sousTitre: `${pluriel(avis.length, 'réponse', 'réponses')} · ${echapper(campagne.titre || '')}`,
    feuille: true,
    corps: `${chiffresAvis(avis)}${restitutionHtml(avis, { nommer })}`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  }).fin;
};

/* Le questionnaire sur la page : ce qui sera demandé, et ce qui a été
   répondu, toutes campagnes du projet confondues. */
const avisHtml = (avis, { nommer }) => {
  const nbQuestions = Object.values(FAMILLES_AVIS).reduce((n, f) => n + f.questions.length, 0);
  return `<section class="section" id="avis">
    <div class="section-tete">
      <div><h2>Le questionnaire ${infoBouton('avis')}</h2><p class="chapo">${nbQuestions} questions en sept familles. Trois avant de commencer, le reste après avoir tout déroulé. ${avis.length ? 'Les réponses libres sont rendues mot pour mot.' : 'Personne n\'a encore répondu : voici ce qui sera demandé.'}</p></div>
    </div>
    ${avis.length ? chiffresAvis(avis) : ''}
    ${restitutionHtml(avis, { nommer, toutes: true })}
  </section>`;
};

/* Les résultats d'une campagne, scénario par scénario : chaque passage,
   avec qui l'a fait, sur quoi, ce qu'il a obtenu, et sa preuve. C'est ce
   que le client vient lire pendant la campagne, et il le lit en entier. */
const resultatsHtml = (c, { dedans, nommer }) => {
  const passages = passagesDe(c).slice().sort((a, b) => (enDate(b.le) || 0) - (enDate(a.le) || 0));
  const attendus = Object.values(c.affectation || {}).reduce((n, r) => n + r.length, 0);
  const compte = (r) => passages.filter((x) => x.resultat === r).length;
  const parScenario = dedans.map((s) => ({ s, p: passages.filter((x) => x.scenario === s.ref) })).filter((x) => x.p.length);
  return `<div class="groupe" id="resultats">
    <span class="etiquette-champ">Les résultats, scénario par scénario ${infoBouton('resultats')}</span>
    ${passages.length ? `
      ${jauge([{ n: compte('ok'), nom: 'réussis', ton: 'vert' }, { n: compte('ko'), nom: 'échoués', ton: 'rouge' }, { n: compte('na'), nom: 'sans objet', ton: 'gris' }])}
      <p class="aide" style="margin:8px 0 12px">${pluriel(passages.length, 'passage consigné', 'passages consignés')}${attendus ? ` sur ${attendus} ${attendus > 1 ? 'attendus' : 'attendu'}` : ''}.</p>
      ${parScenario.map(({ s, p }) => `<div class="resultat">
        <p class="resultat-tete">${ref(s.ref)} <span>${echapper(s.titre)}</span></p>
        <div class="liste liste--serree">${p.map((x) => {
          const qui = nommer(x.testeur);
          const appareil = (x.contexte || {}).appareil || (x.contexte || {}).modele || '';
          return ligne({
            icone: x.resultat === 'ko' ? 'alerte' : x.resultat === 'ok' ? 'check' : 'moins',
            ton: x.resultat === 'ko' ? 'rouge' : x.resultat === 'ok' ? 'vert' : '',
            titre: `${echapper(qui.nom)} · ${echapper((PLATEFORMES_TEST[x.plateforme] || {}).libelle || x.plateforme || '')}${appareil ? ` · ${echapper(appareil)}` : ''}`,
            sous: `${x.le ? `${echapper(dateHeure(x.le))} · ` : ''}${echapper(x.commentaire || (x.resultat === 'ok' ? 'Comme prévu' : 'Sans commentaire'))}${qui.traits ? ` · <span class="t-3">${echapper(qui.traits)}</span>` : ''}`,
            fin: `${pastille(RESULTATS_PASSAGE, x.resultat || 'na')}${(x.preuves || []).map((ch, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(ch)}">${icone('image')} Preuve ${i + 1}</button>`).join('')}`,
          });
        }).join('')}</div>
      </div>`).join('')}`
    : `<p class="aide">Aucun passage consigné pour l'instant${attendus ? ` : ${attendus} ${attendus > 1 ? 'sont attendus' : 'est attendu'}` : ''}.</p>`}
  </div>`;
};

/* L'affectation des testeurs à une campagne.
   Le calcul propose, il ne décide pas : un testeur tombe malade, un autre
   demande un bloc précis, et aucun calcul ne prévoit cela. */
const ouvrirCampagne = async (c, { pid, env, scenarios, nommer }) => {
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

      ${resultatsHtml(c, { dedans, nommer })}

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

  brancherPieces(m.el);
  const voir = m.el.querySelector('[data-voir-avis]');
  if (voir) voir.addEventListener('click', () => agir(voir, async () => {
    /* Les avis de la campagne sont déjà dans le magasin, abonnés par la
       page : la feuille les lit tels quels, sans requête de plus. */
    await ouvrirAvis({ ...c, _avis: avisDe([c]) }, { nommer });
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
  /* Les avis et les passages du projet ouvert, campagne par campagne :
     abonnés quand la campagne apparaît, et comptés dans l'empreinte, sans
     quoi une réponse qui arrive ne redessinerait rien. */
  const campagnesSuivies = new Set();
  const clesSuivies = () => [
    ...(env.role === 'equipe'
      ? [K.projets, K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.parcoursTous, K.reglesToutes, K.documentsTous, K.jalonsTous, K.testeurs]
      : [K.projets, ...(magasin.lire(K.projets) || (env.session || {}).projets || [])
          .flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id), K.parcours(p.id), K.regles(p.id), K.documents(p.id), K.jalons(p.id)]), K.profils]),
    ...[...campagnesSuivies].flatMap((cid) => [K.appreciations(cid), K.passages(cid)]),
  ];

  /* Le projet ouvert : celui qu'on a choisi, ou le seul que le client ait.
     Le rendu et les gestes doivent lire la MÊME valeur, faute de quoi le
     bouton s'affiche et le clic ne fait rien, sans le moindre message. */
  const projetCourant = () => {
    if (etat.projet) return etat.projet;
    const p = magasin.lire(K.projets) || [];
    return env.role !== 'equipe' && p.length === 1 ? p[0].id : '';
  };

  const suivreCampagnes = () => {
    const pid = projetCourant();
    if (!pid) return;
    lireTout(env).campagnes.filter((c) => projetDe(c) === pid).forEach((c) => {
      if (campagnesSuivies.has(c.id)) return;
      campagnesSuivies.add(c.id);
      lot.abonner(K.appreciations(c.id), () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'appreciations'));
      lot.abonner(K.passages(c.id), () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'passages'));
      lot.sur(K.appreciations(c.id), () => rendre());
      lot.sur(K.passages(c.id), () => rendre());
    });
  };

  const rendre = (force = false) => {
    suivreCampagnes();
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
        : `${alertes(d, { nomProjet, plateforme: etat.plateforme })}
          ${etage('etage-projets', 'Projets', `<b>${d.projets.length}</b> ${d.projets.length > 1 ? 'projets' : 'projet'}, <b>${d.campagnes.filter((c) => c.statut === 'en-cours').length}</b> ${d.campagnes.filter((c) => c.statut === 'en-cours').length > 1 ? 'campagnes en cours' : 'campagne en cours'}.`, avancement(d, { nomProjet, plateforme: etat.plateforme }))}
          ${etage('etage-machine', 'Tests automatisés', `<b>${(d.parcours || []).filter((x) => x.actif !== false).length}</b> parcours et <b>${(d.regles || []).reduce((n, x) => n + (x.actif !== false ? (Number(x.cas) || 0) : 0), 0)}</b> cas de règles, tous projets confondus.`, `${parcoursHtml(d, { pid: '', equipe: env.role === 'equipe' })}${reglesHtml(d, { pid: '', equipe: env.role === 'equipe' })}`)}
          ${env.role === 'equipe' ? etage('etage-gens', 'Testeurs', `<b>${(d.testeurs || []).length}</b> ${(d.testeurs || []).length > 1 ? 'personnes au vivier' : 'personne au vivier'}.`, vivierHtml(d, { equipe: true })) : ''}
          ${activite(d, { nomProjet, plateforme: etat.plateforme })}`}
    </div>`;

    const sel = sortie.querySelector('#f-projet');
    if (sel) sel.addEventListener('change', (e) => { etat.projet = e.target.value; poser({ projet: etat.projet, plateforme: etat.plateforme }); rendre(true); });
  };

  brancherFrise(sortie, env);
  const gestes = sur(sortie, 'click', '[data-info], [data-aller], [data-nouvelle-anomalie], [data-editer-anomalie], [data-action="ouvrir-anomalie"], [data-plateforme], [data-scenario], [data-plier-scenarios], [data-plier-parcours], [data-plier-regles], [data-nouvelle-regle], [data-editer-regle], [data-nouvelle-campagne], [data-editer-campagne], [data-action="ouvrir-campagne"], [data-nouveau-testeur], [data-action="ouvrir-testeur"], [data-nouveau-parcours], [data-editer-parcours]', async (el) => {
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
    /* L'index de page ne pose pas d'ancre dans l'adresse : le routeur y
       verrait un changement de vue. On fait défiler, rien d'autre. */
    if (el.dataset.info) {
      const x = EXPLICATIONS[el.dataset.info];
      if (x) modale({ titre: x.titre, corps: `<div class="prose">${x.corps}</div>` });
      return;
    }
    if (el.dataset.aller) {
      const cible = sortie.querySelector(`#${el.dataset.aller}`);
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (el.hasAttribute('data-plier-scenarios')) {
      const boite = sortie.querySelector('#bibliotheque');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? 'Voir la bibliothèque' : 'Replier'}`;
      return;
    }
    /* Cent quarante-quatre parcours au-dessus du vivier, c'est le vivier
       qu'on ne voit plus. Ce qui est rouge ou instable reste dehors. */
    if (el.hasAttribute('data-plier-parcours')) {
      const boite = sortie.querySelector('#catalogue-parcours');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? `Voir les ${boite.querySelectorAll('.ligne').length} parcours` : 'Replier'}`;
      return;
    }
    if (el.hasAttribute('data-plier-regles')) {
      const boite = sortie.querySelector('#catalogue-regles');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? `Voir les ${boite.querySelectorAll('.ligne').length} familles` : 'Replier'}`;
      return;
    }
    if (el.dataset.nouvelleRegle) { await editer('regle', env, { pid: el.dataset.nouvelleRegle }); return; }
    if (el.dataset.editerRegle) {
      const pid = projetCourant();
      const x = lireTout(env).regles.find((y) => y.ref === el.dataset.editerRegle && projetDe(y) === pid);
      if (x) await editer('regle', env, { pid, fiche: x });
      return;
    }
    if (el.dataset.nouvelleAnomalie) { await editer('anomalie', env, { pid: el.dataset.nouvelleAnomalie }); return; }
    if (el.dataset.editerAnomalie) {
      const pid = projetCourant();
      const a = lireTout(env).anomalies.find((x) => x.id === el.dataset.editerAnomalie && projetDe(x) === pid);
      if (a) await editer('anomalie', env, { pid, fiche: a });
      return;
    }
    if (el.dataset.action === 'ouvrir-anomalie') {
      const pid = projetCourant();
      const d = lireTout(env);
      const a = d.anomalies.find((x) => x.id === el.dataset.id && projetDe(x) === pid);
      if (!a) return;
      const m = ouvrirAnomalie(a, { equipe: env.role === 'equipe', pid, env, scenarios: d.scenarios.filter((x) => projetDe(x) === pid) });
      brancherPieces(m.el);
      sur(m.el, 'click', '[data-qualifier]', async () => { m.fermer(); await editer('anomalie', env, { pid, fiche: a }); });
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
      if (c) await ouvrirCampagne(c, { pid, env, scenarios: d.scenarios.filter((x) => projetDe(x) === pid), nommer: nommeur(d, { equipe: env.role === 'equipe', pid }) });
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
