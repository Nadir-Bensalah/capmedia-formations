/* ==========================================================================
   LA CONSOLE DE TESTS

   Tous les projets d'un coup, ou un seul. C'est la différence avec un
   onglet enfermé dans un projet : quand six testeurs déroulent une
   campagne, la question n'est pas « où en est tel projet » mais « qu'est-ce
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
  EXPLICATION_A_CONFIRMER, ORIGINES_ANOMALIE, anomalieOuverte, STATUTS, TERMINES, getDoc,
  ETATS_PARCOURS, OUTILS_PARCOURS, PARCOURS_A_REGARDER, RESULTATS_PASSAGE,
  dateHeure, enDate,
  MOMENTS_AVIS, lireReponse, resumeQuestionnaire, SEUIL_AVIS, MOMENTS_ENVOYES, avisRendu,
} from '../noyau.js';
import {
  icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, agir, confirmer,
  brancherPieces, lisible, menu, reglerBarreOnglets, fermerFlottants,
} from '../ui.js';
import { reecrire } from '../routeur.js';
import * as magasin from '../magasin.js';
import {
  K, ecrire, repartir, profilsTesteurs, scenariosHumains, chargeParTesteur, controler, clesDe, lireSectionsPlan,
} from '../donnees.js';
import { ordonnerSections } from './plan-tests.js';
import { bdd, collection, doc } from '../noyau.js';
import { editer } from './editeurs.js';
import { appelServeur } from '../serveur.js';
import { filAriane } from '../coquille.js';
import { monter as monterTableau } from './tableau.js';
import { ouvrirSuiviTesteur } from './suivi-testeur.js';
import { ordonnerSections as rangerSections } from './plan-tests.js';
import { scenariosHumainsDuPlan, estSurLePlan, clesAttendues, vivierPropose, pretALancer, verdictDe, VERDICTS, NOMS_PLATEFORMES } from '../campagne-plan.js';
import {
  repartirSocle, controlerSocle, chargeSocle, retraitsConnus, proposerSocle, plafondDe, regleSocle, MOTIFS_RETRAIT, MINUTES_PAR_TEST,
} from '../repartition.js';
/* Les identifiants de test d'un testeur (campagnes/{c}/acces/{uid}). */
import { doc as docAcces, getDoc as lireAcces, setDoc as poserAcces, serverTimestamp as heureServeur } from '../noyau.js';

/* La mémoire des filtres tient dans l'adresse, pas dans le stockage : un
   lien vers « les anomalies Android de tel projet » doit pouvoir se coller
   dans un message. */
const lire = (ctx, cle, defaut) => (ctx.requete && ctx.requete[cle]) || defaut;

const poser = (cles) => {
  location.hash = adresse(cles, location.hash.split('?')[1] || '');
};

/* L'adresse de la page avec ces paramètres posés (vides : retirés). */
const adresse = (cles, depuis = '') => {
  const p = new URLSearchParams(depuis);
  Object.entries(cles).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
  const chaine = p.toString();
  return `/tests${chaine ? `?${chaine}` : ''}`;
};

/* Les onglets d'un projet, sous les chiffres et les bugs urgents : la page
   était trop longue d'un seul tenant. Le haut (chiffres, tableau, bugs à
   corriger d'urgence) reste commun ; à partir du devis, chaque sujet a son
   onglet. « humains » est l'onglet par défaut (l'adresse sans « onglet »). */
/* Une idée par onglet, dite avec les mots du client : ce que font les
   personnes, ce que font les robots, et la liste de ce qu'on vérifie. Le
   questionnaire d'appréciation est dans l'onglet des testeurs : ce sont
   leurs avis. */
const ONGLETS_TESTS = [
  { cle: 'devis', libelle: 'Le devis' },
  { cle: 'humains', libelle: 'Testeurs humains' },
  { cle: 'automatises', libelle: 'Tests par robot' },
  /* Tout ce que les tests ont relevé, robots, testeurs et équipe, avec son
     statut : « À confirmer » tant que l'équipe n'a pas tranché (règle du
     04/10/2026). */
  { cle: 'problemes', libelle: 'Problèmes' },
  { cle: 'bibliotheque', libelle: 'Ce qu\'on vérifie' },
];
const ONGLET_DEFAUT = 'humains';
/* Les anciennes adresses (« onglet=avis ») mènent au bon endroit. */
const ALIAS_ONGLET = { avis: 'humains' };
const ongletValide = (o) => {
  const v = ALIAS_ONGLET[o] || o;
  return ONGLETS_TESTS.some((x) => x.cle === v) ? v : ONGLET_DEFAUT;
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
    /* Les tickets : un problème relevé peut en avoir un, et son état dit
       où en est la correction. */
    tickets: rassembler(K.ticketsTous, K.tickets),
    /* Le devis de la campagne et ses étapes : ce que le client a acheté,
       ligne par ligne, et ce qu'il vient vérifier en premier. */
    documents: rassembler(K.documentsTous, K.documents),
    jalons: rassembler(K.jalonsTous, K.jalons),
    testeurs: magasin.lire(K.testeurs) || [],
    /* Le client ne lit pas le vivier, il lit le profil sans nom des
       testeurs de SES projets, recopié projet par projet. */
    profils: profilsTesteurs(env.session),
  };
};

/* Les avis et les passages vivent sous chaque campagne, et se lisent
   campagne par campagne : c'est la seule porte que les règles ouvrent au
   client. Le magasin garde l'identifiant du testeur (le nom du document)
   et celui de la campagne (son parent). */
/* Les traces de chaque testeur sur la campagne (premiers pas, fin de
   test, « a répondu », note du test) : l'appréciation, que l'équipe seule
   lit depuis le 08/10/2026. */
const tracesDe = (campagnes) => campagnes.flatMap((c) => (magasin.lire(K.appreciations(c.id)) || [])
  .map((a) => ({ ...avecRetour(c, a), testeur: a.id, campagne: c.id })));

/* L'avis anonyme (08/10/2026) : les réponses au questionnaire, rangées par
   le serveur sans identifiant de testeur, moment par moment. Le compte de
   chaque moment se lit toujours ; ses réponses, seulement à partir de
   SEUIL_AVIS (les règles le tiennent, l'écran le dit). Aucune réponse ne
   porte de nom ni de profil, pour l'équipe comme pour le client. */
const recusDe = (campagnes) => {
  const r = { avant: 0, apres: 0 };
  campagnes.forEach((c) => MOMENTS_ENVOYES.forEach((m) => { r[m] += Number((magasin.lire(K.avisCompteur(c.id, m)) || {}).recus) || 0; }));
  return r;
};
const avisDe = (campagnes) => campagnes.flatMap((c) => MOMENTS_ENVOYES.flatMap((m) => {
  const n = Number((magasin.lire(K.avisCompteur(c.id, m)) || {}).recus) || 0;
  if (n < SEUIL_AVIS) return [];
  return (magasin.lire(K.avisAnonymes(c.id, m)) || []).map((r) => ({ ...((r && r.reponses) || {}) }));
}));
/* La note du test (« Le test lui-même ») : nominative, pour l'équipe seule,
   relue dans equipe/retour. Elle rejoint la restitution de l'équipe sans
   nom : le nom, la fiche de la campagne le donne déjà. */
const notesTestDe = (campagnes) => tracesDe(campagnes).filter((a) => a.noteTest && typeof a.noteTest === 'object').map((a) => ({ noteTest: a.noteTest }));
/* Combien de personnes ont répondu : le plus grand des deux moments. */
const repondantsDe = (recus) => Math.max(recus.avant, recus.apres);
/* Un moment qui a des réponses, mais pas encore assez pour les montrer. */
const enAttenteDe = (recus) => MOMENTS_ENVOYES.filter((m) => recus[m] > 0 && recus[m] < SEUIL_AVIS);
/* Les remarques libres, campagne par campagne. Les anciennes, rangées dans
   l'appréciation après la fin du test, n'ont été écrites que pour
   l'équipe : elle seule les relit, marquées comme telles. */
/* La note du test et les anciennes remarques vivent à part, dans
   appreciations/{uid}/equipe/retour, que seule l'équipe lit (et le
   testeur pour lui-même) : la page les remet sur l'appréciation. Avant
   la migration, elles sont encore sur l'appréciation elle-même. */
const avecRetour = (c, a) => {
  const r = magasin.lire(K.retourTesteur(c.id, a.id));
  if (!r) return a;
  return { ...a, ...(r.noteTest ? { noteTest: r.noteTest } : {}), ...(Array.isArray(r.remarques) ? { remarques: r.remarques } : {}) };
};
const remarquesDe = (campagnes, { equipe }) => campagnes.flatMap((c) => [
  ...(magasin.lire(K.remarques(c.id)) || []).map((r) => ({ ...r, campagne: c.id })),
  ...(equipe ? (magasin.lire(K.appreciations(c.id)) || []).map((a) => avecRetour(c, a)).flatMap((a) => (Array.isArray(a.remarques) ? a.remarques : [])
    .map((r) => ({ texte: r.texte, cree: r.le, testeur: a.id, campagne: c.id, ancienne: true }))) : []),
]).filter((r) => r && r.texte).sort((a, b) => ((enDate(b.cree) || 0) - (enDate(a.cree) || 0)));
const passagesDe = (c) => (magasin.lire(K.passages(c.id)) || []);
const sectionsDuPlan = (pid) => (pid ? rangerSections(magasin.lire(K.planTests(pid)) || []) : []);

/* Comment on nomme un testeur. L'équipe lit son prénom ; le client lit un
   numéro, le MÊME partout sur la page, du vivier aux réponses libres :
   « Testeur 2 » doit désigner la même personne dans toutes les sections,
   sinon le numéro ne dit rien. Le profil reste dans la liste des testeurs
   et sous les remarques libres ; les réponses au questionnaire, elles, ne
   portent plus ni nom ni profil (avis anonyme, 08/10/2026). */
export const nommeur = (d, { equipe, pid }) => {
  const gens = (equipe ? (d.testeurs || []) : (d.profils || [])).filter((t) => (t.projets || []).includes(pid));
  const rangs = new Map(gens.map((t, i) => [t.id, i + 1]));
  const rang = (uid) => { if (!rangs.has(uid)) rangs.set(uid, rangs.size + 1); return rangs.get(uid); };
  return (uid) => {
    const t = (equipe ? (d.testeurs || []) : (d.profils || [])).find((x) => x.id === uid) || {};
    const p = equipe ? (t.profil || {}) : t;
    const appareils = (Array.isArray(p.appareils) ? p.appareils : (Array.isArray(t.appareils) ? t.appareils.filter((a) => a && a.confirme !== false) : []))
      .map((a) => [a.modele, a.os].filter(Boolean).join(' ')).filter(Boolean).slice(0, 3).join(' / ');
    const traits = [p.sexe, p.age ? `${p.age} ans` : '', p.expertise || p.fonction, appareils].filter(Boolean).join(', ');
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
/* Les chiffres du questionnaire, comptés dans sa source unique
   (questionnaire-avis.js) : ce que lit le client est ce qu'on demande au
   testeur. */
const QUESTIONNAIRE = resumeQuestionnaire();

const EXPLICATIONS = {
  'soucis': { titre: 'Bugs à corriger d\'urgence', corps: `
    <p>C'est la liste de ce qui mérite votre attention aujourd'hui, et rien d'autre. Si elle est vide, tout va bien.</p>
    <p>On y trouve trois choses : un problème bloquant ou critique pas encore corrigé, une campagne de tests qui a dépassé sa date de fin, et une campagne qui n'a aucun scénario à distribuer.</p>
    <p>Les tests robots en échec n'y sont pas listés un par un : une phrase les compte, et mène à l'onglet « Tests par robot ».</p>
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
    <p>Et un statut : à confirmer, à revérifier, confirmé, corrigé, ou fausse alerte si ce n'était finalement pas un défaut.</p>` },
  'problemes': { titre: 'Les problèmes relevés', corps: `
    <p>Tout ce que les tests ont relevé sur l'application : les tests automatiques, les testeurs et l'équipe. Rien n'est caché, et chaque problème dit où il en est.</p>
    <p><b>À confirmer</b> : relevé par les tests, en cours de vérification par l'équipe. Un test automatique peut se tromper : c'est pourquoi l'équipe reproduit chaque problème avant de le confirmer.</p>
    <p><b>À revérifier</b> : l'équipe vérifie de nouveau ce point avant de trancher. <b>Confirmé</b> : l'équipe l'a reproduit, il est réel. <b>Fausse alerte</b> : ce n'était pas un défaut de l'application.</p>
    <p>Quand une correction est lancée, le problème porte son ticket, puis passe à <b>corrigé</b>.</p>
    <p>La gravité suit la même échelle que vos tickets : <b>bloquant</b>, <b>critique</b>, <b>important</b>, <b>mineur</b>.</p>` },
  'testeurs': { titre: 'Les testeurs', corps: `
    <p>Les personnes qui utilisent l'application pour de vrai et notent ce qui cloche. Elles ne travaillent pas sur le projet : c'est justement ce qui rend leur regard utile.</p>
    <p>Chacune teste sur son propre téléphone, iPhone ou Android, et sur le web. On s'arrange pour que les vérifications importantes soient faites par au moins deux personnes sur deux systèmes différents.</p>
    <p>Côté client, les testeurs apparaissent sans leur nom ni leur adresse : on voit l'âge, le métier, l'aisance avec un téléphone et les appareils, pour savoir qui a testé quoi. Leurs réponses au questionnaire, elles, restent anonymes : aucun profil n'y est attaché.</p>` },
  'parcours': { titre: 'Les parcours automatisés', corps: `
    <p>Un parcours automatisé, c'est une vérification rejouée toute seule par un programme, à chaque nouvelle version de l'application, sans qu'un humain touche à rien. Par exemple : « créer un rappel, puis vérifier qu'il apparaît bien dans la liste ».</p>
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
    <p>La jauge montre la part de chaque état.</p>` },
  'regles': { titre: 'Les règles métier', corps: `
    <p>Une règle métier, c'est un calcul que l'application fait dans son coin, sans écran : par exemple « une tâche tous les mardis pendant deux mois, ça donne quelles dates ? ».</p>
    <p>Ces calculs se vérifient sans téléphone et sans personne qui clique : on donne une question, on compare la réponse. Ça prend une fraction de seconde, donc on peut en essayer des centaines là où un testeur humain en essaie trois. C'est pour ça qu'on compte en <b>cas essayés</b> et pas en tests.</p>
    <p>Une <b>famille</b> regroupe les cas d'une même règle. Les barres montrent combien de cas chaque famille essaie : plus la barre est longue, plus la règle est fouillée.</p>
    <p>Les états sont les mêmes que pour les parcours : <b>à écrire</b> (prévu, pas encore programmé), <b>vert</b> (tout juste), <b>rouge</b> (une réponse fausse).</p>` },
  'scenarios': { titre: 'La bibliothèque de scénarios', corps: `
    <p>Un scénario, c'est une vérification écrite pour un humain : ce qu'il doit faire dans l'application, pas à pas, et ce qu'il doit obtenir à la fin. Par exemple : « créer un anniversaire sans année de naissance, et vérifier qu'il s'affiche quand même ».</p>
    <p>La bibliothèque contient tous les scénarios du projet, rangés par partie de l'application. Une campagne pioche dedans.</p>
    <p>Trois niveaux : <b>socle</b>, les vérifications essentielles, faites par deux testeurs sur deux systèmes différents ; <b>transversal</b>, ce qui traverse toute l'application (la langue, le mode hors ligne), aussi en double ; <b>réparti</b>, le reste, fait par une seule personne.</p>` },
  'avis': { titre: 'Le questionnaire', corps: `
    <p>Les scénarios disent si l'application <b>marche</b>. Le questionnaire dit si elle <b>plaît</b>, et c'est la seconde question qui décide si les gens la gardent.</p>
    <p>Chaque testeur y répond en trois temps. ${QUESTIONNAIRE.avant} questions <b>avant de commencer</b>, en deux minutes : c'est le seul regard qu'on ne retrouve jamais, une fois qu'on connaît l'application. Une note sur le test lui-même <b>en terminant</b>, lue par l'équipe Capmedia seule. Puis ${QUESTIONNAIRE.apres} questions <b>après avoir tout déroulé</b> : ${echapper(QUESTIONNAIRE.sujetsApres)}.</p>
    <p>Ce sont exactement les questions posées au testeur, dans ses mots : la page et son questionnaire lisent la même liste.</p>
    <p>Les réponses sont <b>anonymes</b> : elles arrivent sans nom ni profil, et personne, pas même l'équipe Capmedia, ne sait qui a dit quoi. Elles ne s'affichent qu'à partir de ${SEUIL_AVIS} réponses, pour qu'aucune ne soit reconnaissable. Un testeur répond donc franchement, et c'est ce qui rend ses réponses utiles.</p>
    <p>Les notes sont des moyennes. Les réponses libres sont rendues <b>mot pour mot</b>, jamais résumées : c'est là qu'est la vraie information.</p>
    <p>Les quatre questions sur le prix ne sont pas une invention : c'est une méthode connue qui donne une <b>fourchette</b> plutôt qu'un chiffre en l'air. En dessous du bas de la fourchette, les gens se méfient de la qualité ; au-dessus du haut, ils renoncent.</p>
    <p>Quand personne n'a encore répondu, la page montre quand même toutes les questions : c'est ce qui sera demandé, et vous pouvez le lire avant que la campagne commence.</p>
    <p>À côté, les <b>remarques libres</b> : ce qu'un testeur écrit quand il veut, sur un scénario ou en général. Elles sont rendues telles quelles ; côté client, sans le nom du testeur.</p>` },
  'resultats': { titre: 'Les résultats, scénario par scénario', corps: `
    <p>Chaque fois qu'un testeur déroule un scénario, il consigne un <b>passage</b> : ce qu'il a obtenu, sur quel appareil, avec un commentaire et une capture s'il y a eu un problème.</p>
    <p><b>Réussi</b> : ça a marché comme prévu. <b>Échec</b> : ça n'a pas marché, et une preuve est jointe. <b>Sans objet</b> : le scénario ne s'appliquait pas sur cet appareil.</p>
    <p>Chaque scénario est passé sur chacune de ses plateformes, iPhone, Android ou Web. Celui qu'aucun robot ne vérifie est passé par deux personnes. Un échec fait naître une anomalie tout seul, regroupée par scénario.</p>` },
  'activite': { titre: 'Activité', corps: `
    <p>Ce qui s'est passé récemment sur tous les projets, du plus récent au plus ancien : une campagne qui change d'état, une anomalie signalée ou corrigée.</p>` },
};

/* Le petit « i » à côté d'un titre. Il n'explique rien lui-même : il
   ouvre l'explication, pour que le titre reste un titre. */
const infoBouton = (cle) => `<button class="btn-info" type="button" data-info="${echapper(cle)}" aria-label="Qu'est-ce que c'est ?" data-astuce="Qu'est-ce que c'est ?">${icone('info')}</button>`;

const projetDe = (x) => x.projet || x._parent || '';

/* Replié par défaut ; le choix est gardé d'une visite à l'autre. */
const CLE_BUGS = 'suivi:bugs-deplies';
let bugsDeplies = (() => { try { return localStorage.getItem(CLE_BUGS) === '1'; } catch (e) { return false; } })();

const dansPlateforme = (x, plateforme) => {
  if (!plateforme) return true;
  const p = x.plateformes || [];
  return p.length ? p.includes(plateforme) : true;
};

/* --------------------------------------------------------------------------
   Section 1 · Ce qui ne va pas
   -------------------------------------------------------------------------- */

/* Ce qui compte comme urgent : un problème bloquant ou critique encore
   ouvert (ni corrigé, ni fausse alerte), la même échelle que les tickets
   et les verdicts (GRAVES). « À confirmer » compris : l'équipe le tranche,
   et le client ne reçoit que ce qui n'est pas interne. */
export const GRAVITES_URGENTES = ['bloquant', 'critique'];
export const anomalieUrgente = (a) => GRAVITES_URGENTES.includes(a && a.gravite) && !['corrigee', 'sans-suite'].includes(a.statut);

const alertes = (d, { nomProjet, plateforme, pid = '' }) => {
  const soucis = [];

  /* Les anomalies qui bloquent, d'abord. Une anomalie bloquante ou
     critique non corrigée est ce qui justifie d'arrêter une campagne. */
  d.anomalies
    .filter((a) => anomalieUrgente(a) && dansPlateforme(a, plateforme))
    .sort((a, b) => ((GRAVITES_ANOMALIE[a.gravite] || {}).rang || 9) - ((GRAVITES_ANOMALIE[b.gravite] || {}).rang || 9))
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

  /* Un projet qui a des campagnes mais aucun scénario : la campagne ne
     peut rien distribuer, et ça ne se voit qu'en le cherchant. */
  const avecCampagne = new Set(d.campagnes.map((c) => projetDe(c)));
  /* Un plan de tests compte comme des scénarios : la campagne y pioche. */
  const avecScenario = new Set([...d.scenarios.map((s) => projetDe(s)), ...[...avecCampagne].filter((p) => p && sectionsDuPlan(p).length)]);
  [...avecCampagne].filter((p) => p && !avecScenario.has(p)).forEach((p) => soucis.push({
    ton: 'ambre', icone: 'bug',
    titre: 'Campagne sans aucun scénario',
    sous: `${echapper(nomProjet(p))} · la campagne n'a rien à distribuer`,
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

  /* Les tests robots rouges ou instables ne sont plus une ligne chacun :
     un par scénario et par plateforme, ils noyaient les vrais bugs (plus
     de mille lignes). Une phrase les compte et mène à « Tests par robot »,
     où ils sont listés. Elle ne compte pas dans les lignes urgentes. */
  const robots = (d.parcours || []).filter((x) => x.actif !== false && PARCOURS_A_REGARDER.includes(x.etat) && dansPlateforme(x, plateforme));
  const rouges = robots.filter((x) => x.etat === 'rouge').length;
  const instables = robots.length - rouges;
  const lienRobots = pid
    ? `<a href="#${echapper(adresse({ projet: pid, plateforme, onglet: 'automatises' }))}">voir Tests par robot</a>`
    : '<a href="#etage-machine" data-voir-robots>voir Tests par robot</a>';
  const syntheseRobots = robots.length
    ? `<p class="aide" id="robots-a-regarder" data-rouges="${rouges}" data-instables="${instables}">${pluriel(rouges, 'test robot rouge', 'tests robots rouges')}, ${pluriel(instables, 'instable', 'instables')} : ${lienRobots}.</p>`
    : '';

  if (!soucis.length) {
    return `<section class="section" style="margin-top:0">
      <div class="section-tete"><h2>Bugs à corriger d'urgence ${infoBouton('soucis')}</h2></div>
      <p class="calme">${icone('check')} Rien d'urgent : aucune anomalie bloquante ou critique ouverte, aucune campagne en retard ou vide.</p>
      ${syntheseRobots}
    </section>`;
  }

  /* Le bloc se replie ; replié, il dit combien de choses urgentes il garde. */
  const n = pluriel(soucis.length, 'ligne', 'lignes');
  return `<section class="section section--alerte" style="margin-top:0" id="bugs-urgents" data-urgents="${soucis.length}">
    <div class="section-tete">
      <div><h2>Bugs à corriger d'urgence ${infoBouton('soucis')}</h2><p class="chapo">${n} à regarder.</p></div>
      <button class="btn btn-secondaire btn-petit" type="button" data-plier-bugs aria-controls="liste-bugs" aria-expanded="${bugsDeplies}">${icone(bugsDeplies ? 'plier' : 'deplier')} ${bugsDeplies ? 'Replier' : `Voir les ${n}`}</button>
    </div>
    ${syntheseRobots}
    <div class="liste" id="liste-bugs"${bugsDeplies ? '' : ' hidden'}>${soucis.map((s) => ligne(s)).join('')}</div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Section 2 · L'avancement
   -------------------------------------------------------------------------- */

const avancement = (d, { nomProjet, plateforme, equipe }) => {
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
      ${vide({ icone: 'bug', titre: 'Aucun projet testé', texte: equipe ? 'Versez un plan de tests sur un projet pour commencer.' : 'Les tests apparaîtront ici dès qu\'ils commenceront.', compact: true })}
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
const parcoursHtml = (d, { pid, equipe, plateforme = '' }) => {
  const liste = (d.parcours || []).filter((x) => x.actif !== false && (!pid || projetDe(x) === pid) && dansPlateforme(x, plateforme))
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
    titre: `${ref(x.ref)} ${echapper(x.titre || '')}${x.mutation || x.etat !== 'vert' ? '' : ' <span class="etiquette">Sans contre-épreuve</span>'}`,
    sous: `${echapper((OUTILS_PARCOURS[x.outil] || {}).court || x.outil)}${(x.plateformes || []).length ? ` · ${echapper((x.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', '))}` : ''}${(x.scenarios || []).length ? ` · ${pluriel((x.scenarios || []).length, 'scénario', 'scénarios')}` : ''}${x.note ? ` · ${echapper(x.note.slice(0, 60))}` : ''}`,
    fin: `${pastille(ETATS_PARCOURS, x.etat || 'a-ecrire')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-parcours="${echapper(x.ref)}" data-projet-robot="${echapper(projetDe(x))}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
  });

  return `<section class="section" id="parcours">
    <div class="section-tete">
      <div><h2>Robots qui utilisent l'app ${infoBouton('parcours')}</h2><p class="chapo">${liste.length ? `${pluriel(liste.length, 'robot ouvre', 'robots ouvrent')} l'app et ${liste.length > 1 ? 'cliquent' : 'clique'} comme un humain, à chaque version${couverts ? `. Ils font ${pluriel(couverts, 'vérification', 'vérifications')} de la liste` : ''}.` : 'Ce que la machine rejouera à chaque version.'}</p></div>
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

    <p class="doctrine"><b>${eprouves} / ${liste.length}</b> avec contre-épreuve${eprouves < liste.length ? ` · contre-épreuve à faire pour ${pluriel(liste.length - eprouves, 'robot', 'robots')} : on casse l'app exprès pour vérifier que le robot le voit. Un robot qui réussit ne prouve rien tant qu'on ne l'a pas vu échouer.` : '.'}</p>

    <div class="rang couverture" style="margin:18px 0 14px">
      ${parOutil.map((g) => `<span class="puce" data-astuce="${echapper(g.f.ou)}"><b>${g.items.length}</b> ${echapper(g.f.court)}</span>`).join('')}
    </div>

    ${aVoir.length ? `<div class="liste" style="margin-bottom:14px">${aVoir.map(rangee).join('')}</div>` : ''}

    <button class="btn btn-secondaire btn-petit" type="button" data-plier-parcours aria-expanded="false">${icone('deplier')} Voir les ${pluriel(liste.length, 'robot', 'robots')}</button>
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
        <div><h2>Robots qui vérifient les calculs ${infoBouton('regles')}</h2><p class="chapo">Dates, répétitions, points : vérifiés en une fraction de seconde.</p></div>
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
    titre: `${ref(x.ref)} ${echapper(x.titre || '')}${x.mutation || x.etat !== 'vert' ? '' : ' <span class="etiquette">Sans contre-épreuve</span>'}`,
    sous: `${pluriel(Number(x.cas) || 0, 'situation essayée', 'situations essayées')}${x.cherche ? ` · ${echapper(x.cherche)}` : ''}`,
    fin: `${pastille(ETATS_REGLE, x.etat || 'a-ecrire')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-regle="${echapper(x.ref)}" data-projet-robot="${echapper(projetDe(x))}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
  });

  return `<section class="section" id="regles">
    <div class="section-tete">
      <div><h2>Robots qui vérifient les calculs ${infoBouton('regles')}</h2><p class="chapo">${pluriel(liste.length, 'test de calcul', 'tests de calcul')}. Chacun essaie beaucoup de situations : ${pluriel(cas, 'situation', 'situations')} en tout, à chaque enregistrement.</p></div>
      ${equipe && pid ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-regle="${echapper(pid)}">${icone('plus')} Nouvelle famille</button>` : ''}
    </div>

    ${barres(parFamille.map((g) => ({
      nom: g.f.libelle, n: g.cas, aide: g.f.aide,
      ton: g.items.some((r) => r.etat === 'rouge') ? 'rouge' : g.items.length && g.items.every((r) => r.etat === 'vert') ? 'vert' : '',
    })))}

    <p class="doctrine"><b>${eprouvees} / ${liste.length}</b> avec contre-épreuve · <b>${casVerts}</b> situations réussies${rouges.length ? ` · <b>${rouges.length}</b> ${rouges.length > 1 ? 'familles rouges' : 'famille rouge'}` : ''}</p>

    <p class="aide" style="margin:14px 0">Un test de calcul ne passe pas par les écrans : il pose une question au programme et vérifie la réponse, en une fraction de seconde. On peut donc essayer les ${cas} situations à chaque enregistrement, comme le 29 février sur cinquante ans, là où un robot qui clique dans l'app en essaie trois.</p>

    ${rouges.length ? `<div class="liste" style="margin-bottom:14px">${rouges.map(rangee).join('')}</div>` : ''}

    <button class="btn btn-secondaire btn-petit" type="button" data-plier-regles aria-expanded="false">${icone('deplier')} Voir les ${pluriel(liste.length, 'test de calcul', 'tests de calcul')}</button>
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
      du += clesDe(c.affectation, t.id).length;
    });
    return du;
  };

  return `<section class="section" id="testeurs">
    <div class="section-tete">
      <div><h2>Testeurs ${infoBouton('testeurs')}</h2><p class="chapo">${gens.length ? pluriel(gens.length, 'testeur inscrit', 'testeurs inscrits') : 'Aucun testeur inscrit pour l\'instant.'}</p></div>
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
   Les problèmes relevés

   Règle du 04/10/2026 : tout ce que les tests trouvent se montre, au
   Cockpit comme au Hub, et ce qui n'est pas confirmé est signalé comme
   tel. Une seule collection, celle des anomalies ; l'origine dit d'où vient
   le problème (« robot » : les tests automatiques, versés par l'outil
   bugs-importer). Le technique (fichier, ligne, preuve) vit dans un
   sous-document que seule l'équipe lit (anomalies/{id}/equipe/note) : ce
   n'est pas un champ masqué à l'écran, les règles le ferment au client.
   -------------------------------------------------------------------------- */

const rangGravite = (a) => (GRAVITES_ANOMALIE[a.gravite] || {}).rang || 9;
const dateProbleme = (a) => enDate(a.cree) || enDate(a.maj);
/* Par gravité, puis du plus récent au plus ancien. */
export const trierProblemes = (liste) => liste.slice().sort((a, b) => rangGravite(a) - rangGravite(b)
  || ((dateProbleme(b) || 0) - (dateProbleme(a) || 0))
  || String(a.titre || '').localeCompare(String(b.titre || ''), 'fr'));

/* La phrase sous un statut. « À confirmer » se dit selon l'origine. */
export const explicationStatut = (a) => ((a.statut || 'nouvelle') === 'nouvelle'
  ? (EXPLICATION_A_CONFIRMER[a.origine] || EXPLICATION_A_CONFIRMER.equipe)
  : ((STATUTS_ANOMALIE[a.statut] || {}).explication || ''));

/* Le ticket d'un problème : celui qu'il porte, sinon une demande née de lui. */
const ticketDe = (a, tickets = []) => tickets.find((t) => a.ticket && t.id === a.ticket)
  || tickets.find((t) => t.anomalie === a.id && !t.archive) || null;

/* Où en est la correction, en deux mots ; rien tant que rien n'est lancé. */
const CORRECTION = {
  ouvert: { libelle: 'Ticket ouvert', voile: 'bleu' },
  resolu: { libelle: 'Ticket résolu', voile: 'vert' },
  ferme:  { libelle: 'Ticket fermé', voile: 'gris' },
};
const correctionDe = (a, tickets) => {
  const t = ticketDe(a, tickets);
  if (!t) return a.ticket ? 'ouvert' : '';
  if (t.statut === 'resolu') return 'resolu';
  return TERMINES.includes(t.statut) ? 'ferme' : 'ouvert';
};

/* Les scénarios du plan, à plat, et le nom de chaque section. */
const ASPECTS_PLAN = ['fonctionnel', 'technique', 'ux', 'securite'];
const scenariosDuPlan = (pid) => new Map(sectionsDuPlan(pid)
  .flatMap((s) => ASPECTS_PLAN.flatMap((x) => ((s.aspects || {})[x] || []).map((sc) => [sc && sc.id, { ...sc, section: s.id }])))
  .filter(([id]) => id));
const nomsSections = (pid) => new Map(sectionsDuPlan(pid).map((s) => [s.id, s.titre || s.id]));
const sectionsDe = (a) => ((a.sections || []).length ? a.sections : (a.bloc ? [a.bloc] : []));
const nomPlateforme = (p) => (PLATEFORMES_TEST[p] || {}).libelle || p;

/* Les filtres de la liste vivent dans l'adresse, comme la plateforme. */
const FILTRES_PROBLEMES = ['gravite', 'statut', 'section', 'origine'];

const problemesHtml = (tous, { pid, equipe, filtres = {}, plateforme = '', tickets = [] }) => {
  const noms = nomsSections(pid);
  const garde = tous.filter((a) => (!filtres.gravite || a.gravite === filtres.gravite)
    && (!filtres.statut || (a.statut || 'nouvelle') === filtres.statut)
    && (!filtres.section || sectionsDe(a).includes(filtres.section))
    && (!filtres.origine || (a.origine || 'equipe') === filtres.origine));
  const liste = trierProblemes(garde);
  const filtre = FILTRES_PROBLEMES.some((f) => filtres[f]);

  /* Le compte par statut, en clair : « À confirmer 12 · Confirmé 3 ». */
  const resume = Object.entries(STATUTS_ANOMALIE)
    .map(([cle, x]) => [x.libelle, tous.filter((a) => (a.statut || 'nouvelle') === cle).length])
    .filter(([, n]) => n).map(([l, n]) => `${echapper(l)} <b>${n}</b>`).join(' · ');

  const ordre = [...noms.keys()];
  const sections = [...new Set(tous.flatMap(sectionsDe))]
    .sort((x, y) => ((ordre.indexOf(x) + 1) || 999) - ((ordre.indexOf(y) + 1) || 999) || x.localeCompare(y));
  const origines = [...new Set(tous.map((a) => a.origine || 'equipe'))];
  const choix = (nom, aria, tousLibelle, options, valeur) => `<select class="select" style="width:auto" data-filtre-probleme="${nom}" aria-label="${echapper(aria)}">
    <option value="">${echapper(tousLibelle)}</option>
    ${options.map(([v, l]) => `<option value="${echapper(v)}"${v === valeur ? ' selected' : ''}>${echapper(l)}</option>`).join('')}
  </select>`;
  const filtresHtml = `<div class="rang pb-filtres">
    ${choix('gravite', 'Gravité', 'Toutes les gravités', Object.entries(GRAVITES_ANOMALIE).map(([k, x]) => [k, x.libelle]), filtres.gravite || '')}
    ${choix('plateforme', 'Plateforme', 'Toutes les plateformes', Object.entries(PLATEFORMES_TEST).map(([k, x]) => [k, x.libelle]), plateforme || '')}
    ${choix('statut', 'Statut', 'Tous les statuts', Object.entries(STATUTS_ANOMALIE).map(([k, x]) => [k, x.libelle]), filtres.statut || '')}
    ${sections.length ? choix('section', 'Section', 'Toutes les sections', sections.map((x) => [x, noms.get(x) || x]), filtres.section || '') : ''}
    ${origines.length > 1 ? choix('origine', 'Origine', 'Toutes les origines', origines.map((x) => [x, (ORIGINES_ANOMALIE[x] || {}).libelle || x]), filtres.origine || '') : ''}
  </div>`;

  const ligneProbleme = (a) => {
    const corr = correctionDe(a, tickets);
    const quand = dateProbleme(a);
    return ligne({
      titre: echapper(a.titre || 'Problème'),
      sous: [sectionsDe(a).map((x) => noms.get(x) || x).join(', '), (a.plateformes || []).map(nomPlateforme).join(', '),
        (ORIGINES_ANOMALIE[a.origine] || ORIGINES_ANOMALIE.equipe).libelle, quand ? `relevé le ${dateCourte(quand)}` : '']
        .filter(Boolean).map(echapper).join(' · '),
      fin: `${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}${corr ? pastille(CORRECTION, corr) : ''}`,
      action: 'ouvrir-anomalie', attrs: `data-id="${echapper(a.id)}" data-probleme`,
    });
  };

  return `<section class="section" id="problemes">
    <div class="section-tete">
      <div><h2>Problèmes relevés ${infoBouton('problemes')}</h2><p class="chapo">${equipe
    ? 'Tout ce que les tests ont relevé, confirmé ou non, par gravité puis du plus récent au plus ancien. Le client lit la même liste, sans la note interne.'
    : 'Tout ce que les tests ont relevé sur votre application, confirmé ou non. Chaque problème dit où il en est.'}</p></div>
      ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-anomalie="${echapper(pid)}">${icone('plus')} Nouvelle anomalie</button>` : ''}
    </div>
    <p class="pb-explication"><b>À confirmer</b> : relevé par les tests automatiques, en cours de vérification par l'équipe.</p>
    ${resume ? `<p class="pb-compte">${resume}</p>` : ''}
    ${tous.length ? filtresHtml : ''}
    ${liste.length
    ? `${filtre || plateforme ? `<p class="aide pb-affiches">${pluriel(liste.length, 'problème affiché', 'problèmes affichés')}${plateforme ? ` sur ${echapper(nomPlateforme(plateforme))}` : ''}.</p>` : ''}<div class="liste">${liste.map(ligneProbleme).join('')}</div>`
    : `<p class="calme">${tous.length ? 'Aucun problème avec ces filtres.' : 'Aucun problème relevé pour l\'instant.'}</p>`}
  </section>`;
};

/* --------------------------------------------------------------------------
   Un projet choisi : toute la panoplie
   -------------------------------------------------------------------------- */

const unProjet = (d, { pid, nomProjet, plateforme, equipe, onglet = ONGLET_DEFAUT, filtres = {} }) => {
  const projet = d.projets.find((p) => p.id === pid);
  if (!projet) return vide({ icone: 'bug', titre: 'Projet introuvable', texte: 'Il a peut-être été archivé.' });

  const scen = d.scenarios.filter((s) => projetDe(s) === pid && s.actif !== false && dansPlateforme(s, plateforme));
  const camp = d.campagnes.filter((c) => projetDe(c) === pid)
    .sort((a, b) => ((STATUTS_CAMPAGNE[a.statut] || {}).ordre || 9) - ((STATUTS_CAMPAGNE[b.statut] || {}).ordre || 9));
  /* Tous les problèmes du projet (onglet Problèmes), et ceux des testeurs
     et de l'équipe dans l'onglet des tests humains : les relevés des tests
     automatiques n'ont rien à faire au milieu des campagnes. */
  const tousProblemes = d.anomalies.filter((a) => projetDe(a) === pid && dansPlateforme(a, plateforme));
  const ano = tousProblemes.filter((a) => a.origine !== 'robot')
    .sort((a, b) => ((GRAVITES_ANOMALIE[a.gravite] || {}).rang || 9) - ((GRAVITES_ANOMALIE[b.gravite] || {}).rang || 9));
  const problemesOuverts = tousProblemes.filter(anomalieOuverte).length;

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
  const parc = (d.parcours || []).filter((x) => x.actif !== false && projetDe(x) === pid && dansPlateforme(x, plateforme));
  /* Le chiffre de l'onglet « Tests par robot » : les tests qui utilisent
     l'app (un par scénario et par plateforme), verts sur total. Les tests
     de calcul n'y entrent pas (autre unité, comptés dans leur section), ni
     un test suspendu, qui ne tourne plus. */
  const parcCompte = parc.filter((x) => x.etat !== 'suspendu');
  const regl = (d.regles || []).filter((x) => x.actif !== false && projetDe(x) === pid);
  const casRegles = regl.reduce((n, x) => n + (Number(x.cas) || 0), 0);

  const humain = `${enCours ? `<b>${enCours}</b> ${enCours > 1 ? 'campagnes en cours' : 'campagne en cours'}` : `<b>${camp.length}</b> ${camp.length > 1 ? 'campagnes' : 'campagne'}, aucune en cours`}, <b>${gens.length}</b> ${gens.length > 1 ? 'testeurs' : 'testeur'}, <b>${ouvertes}</b> ${ouvertes > 1 ? 'anomalies ouvertes' : 'anomalie ouverte'}.`;
  /* Une seule unité pour les robots : le test, comme dans l'avancement en
     haut de page. Les « cas » d'un test de calcul ne comptent qu'à
     l'intérieur de sa fiche. */
  const reglVertes = regl.filter((x) => x.etat === 'vert').length;
  const nRobots = parc.length + regl.length;
  const machine = nRobots
    ? `${parcCompte.length ? `<b>${parcCompte.filter((x) => x.etat === 'vert').length} / ${parcCompte.length}</b> tests dans l'app au vert au dernier passage, un par scénario et par plateforme (ils ouvrent les écrans et cliquent).` : 'Aucun test dans l\'app pour l\'instant.'}${regl.length ? ` À part, <b>${reglVertes} / ${regl.length}</b> ${regl.length > 1 ? 'tests de calcul' : 'test de calcul'} au vert (dates, répétitions, points).` : ''}${parc.length > parcCompte.length ? ` ${pluriel(parc.length - parcCompte.length, 'test suspendu', 'tests suspendus')}, hors compte.` : ''}`
    : 'Aucun test par robot pour l\'instant.';
  /* Qui fait chaque vérification : un testeur (elle est dans une campagne),
     un robot (un test la couvre), ou les deux. */
  const parTesteur = new Set(camp.flatMap((c) => c.scenarios || []));
  const parRobot = new Set(parc.flatMap((x) => x.scenarios || []));
  const lesDeux = scen.filter((x) => parTesteur.has(x.ref) && parRobot.has(x.ref)).length;
  /* Avec un plan de tests, « Ce qu'on vérifie » montre le plan : ses
     scénarios, ses sections, et qui les fait. La bibliothèque d'avant le
     plan reste dessous, repliée, pour ce qui s'y rattache encore. */
  const sectionsPlan = sectionsDuPlan(pid);
  const surPlateformePlan = (x) => !plateforme || (x.plateformes || []).includes(plateforme);
  const planParSection = sectionsPlan.map((sec) => ({ sec, items: ASPECTS_PLAN.flatMap((a) => (((sec.aspects || {})[a]) || [])).filter((x) => x && x.id && surPlateformePlan(x)) }));
  const planTous = planParSection.flatMap((g) => g.items);
  const planQui = (q) => planTous.filter((x) => x.qui === q).length;
  const nPlanHumains = planTous.filter((x) => ['humain', 'les-deux'].includes(x.qui)).length;
  const avecPlan = sectionsPlan.length > 0;
  const bibliPlan = `<b>${planTous.length}</b> ${planTous.length > 1 ? 'vérifications' : 'vérification'} dans le plan de tests, rangées en <b>${sectionsPlan.length}</b> ${sectionsPlan.length > 1 ? 'sections' : 'section'} : <b>${planQui('humain')}</b> par un testeur seul, <b>${planQui('robot')}</b> par un robot seul, <b>${planQui('les-deux')}</b> par les deux. Une campagne reprend les <b>${nPlanHumains}</b> qu'un testeur fait.`;
  const bibli = `<b>${scen.length}</b> ${scen.length > 1 ? 'vérifications' : 'vérification'}, rangées en <b>${parBloc.length}</b> ${parBloc.length > 1 ? 'blocs' : 'bloc'}. Chacune dit qui la fait : un testeur, un robot, ou les deux${lesDeux ? ` (<b>${lesDeux}</b> par les deux)` : ''}.`;
  const quiFait = (x) => {
    const t = parTesteur.has(x.ref); const rb = parRobot.has(x.ref);
    const mot = t && rb ? 'Testeur et robot' : t ? 'Testeur' : rb ? 'Robot' : 'Personne encore';
    return `<span class="puce puce--mini" data-astuce="${t && rb ? 'Vérifiée par une personne pendant la campagne, et par un robot à chaque version.' : t ? 'Vérifiée par une personne pendant la campagne.' : rb ? 'Vérifiée par un robot à chaque version.' : 'Ni dans une campagne, ni couverte par un robot.'}">${mot}</span>`;
  };

  const devisProjet = devisAvecEtapes((d.documents || []).filter((x) => x.projet === pid), (d.jalons || []).filter((j) => projetDe(j) === pid), { equipe });
  const jalonsProjet = (d.jalons || []).filter((j) => projetDe(j) === pid);
  const etapesDevis = jalonsProjet.filter((j) => devisProjet.some((dv) => dv.id === j.devis));
  const etapesFaites = etapesDevis.filter((j) => j.statut === 'termine');
  const resumeDevis = `<b>${etapesFaites.length} / ${etapesDevis.length}</b> ${etapesDevis.length > 1 ? 'lignes du devis livrées' : 'ligne du devis livrée'}${devisProjet.length > 1 ? `, sur <b>${devisProjet.length}</b> devis` : ''}.`;

  /* Le questionnaire : toutes les campagnes du projet confondues. Le
     nommeur donne le même numéro à un testeur partout sur la page. */
  const nommer = nommeur(d, { equipe, pid });
  /* Ne comptent que les appréciations qui portent une réponse : des
     premiers pas ou une fin de test seuls ne sont pas un avis. */
  const avis = avisDe(camp);
  const notesTest = equipe ? notesTestDe(camp) : [];
  const recus = recusDe(camp);
  const repondants = repondantsDe(recus);
  const remarques = remarquesDe(camp, { equipe });
  const { recommande, suspect, cher } = mesuresAvis(avis);
  const nbQuestions = resumeQuestionnaire({ pourClient: !equipe }).total;
  const resumeRemarques = remarques.length ? ` <b>${remarques.length}</b> ${remarques.length > 1 ? 'remarques libres' : 'remarque libre'}.` : '';
  const resumeAvis = (repondants
    ? `<b>${repondants}</b> ${repondants > 1 ? 'testeurs ont répondu' : 'testeur a répondu'} au questionnaire, sans leur nom${recommande ? `, recommandation <b>${recommande.v.toFixed(1)}</b> sur 10` : ''}${suspect && cher ? `, prix acceptable entre <b>${suspect.median}</b> et <b>${cher.median} €</b> par mois` : ''}.${avis.length ? '' : ` Les réponses s'affichent à partir de <b>${SEUIL_AVIS}</b>.`}`
    : `Personne n'a encore répondu. Les <b>${nbQuestions}</b> questions posées à chaque testeur sont ci-dessous.`) + resumeRemarques;

  /* Les onglets et leur compte : un devis absent n'a pas d'onglet. Le
     compte dit ce qu'il y a dedans, pas ce qui va mal. */
  const comptes = {
    devis: devisProjet.length ? `${etapesFaites.length}/${etapesDevis.length}` : '',
    humains: ouvertes ? pluriel(ouvertes, 'problème', 'problèmes') : '',
    automatises: parcCompte.length ? `${parcCompte.filter((x) => x.etat === 'vert').length}/${parcCompte.length}` : '',
    problemes: problemesOuverts || '',
    bibliotheque: avecPlan ? planTous.length : scen.length,
  };
  /* Ce que dit chaque chiffre, au survol. */
  const astuces = {
    devis: 'Étapes du devis faites, sur le total des étapes',
    humains: 'Problèmes ouverts relevés par les testeurs',
    automatises: 'Verts sur total, un test par scénario et par plateforme',
    problemes: equipe ? 'Problèmes ouverts : ni corrigés, ni fausse alerte, « À confirmer » compris' : 'Problèmes ouverts : ni corrigés, ni fausse alerte',
    bibliotheque: avecPlan ? 'Scénarios du plan de tests' : 'Scénarios de la bibliothèque',
  };
  /* Un onglet vide ne se montre pas au client ; l'équipe garde « Problèmes »
     pour y poser une anomalie à la main. */
  const onglets = ONGLETS_TESTS.filter((o) => (o.cle !== 'devis' || devisProjet.length)
    && (o.cle !== 'problemes' || equipe || d.anomalies.some((a) => projetDe(a) === pid)));
  const actif = onglets.some((o) => o.cle === onglet) ? onglet : ONGLET_DEFAUT;

  const sectionCampagnes = `<section class="section" id="campagnes">
    <div class="section-tete">
      <div><h2>Campagnes ${infoBouton('campagnes')}</h2><p class="chapo">${sectionsDuPlan(pid).length ? 'Une campagne prend ses scénarios dans le plan de tests, et les répartit entre les testeurs.' : 'Une campagne pioche dans la bibliothèque : les mêmes scénarios sont rejoués d\'une version à l\'autre.'}</p></div>
      ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-campagne="${echapper(pid)}">${icone('plus')} Nouvelle campagne</button>` : ''}
    </div>
    ${camp.length ? `<div class="liste">${camp.map((c) => ligne({
      icone: 'bug', ton: c.statut === 'close' ? 'vert' : c.statut === 'en-cours' ? 'bleu' : '',
      titre: echapper(c.titre || 'Campagne'),
      sous: `${(c.scenarios || []).length ? pluriel((c.scenarios || []).length, 'vérification', 'vérifications') : 'aucune vérification'} · ${(c.testeurs || []).length ? pluriel((c.testeurs || []).length, 'testeur', 'testeurs') : 'aucun testeur'}${dateCourte(c.debut) ? ` · ${echapper(dateCourte(c.debut))}` : ''}`,
      fin: `${pastille(STATUTS_CAMPAGNE, c.statut || 'preparation')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-campagne="${echapper(c.id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
      action: 'ouvrir-campagne', attrs: `data-id="${echapper(c.id)}"`,
    })).join('')}</div>`
    : vide({ icone: 'bug', titre: 'Aucune campagne', texte: 'Une campagne prend des scénarios, les distribue aux testeurs, et garde le résultat daté.', compact: true })}
  </section>`;

  /* La section existe même vide pour l'équipe : c'est là qu'on pose une
     anomalie à la main. Pour le client, une section vide ne dit rien. */
  const sectionAnomalies = (ano.length || equipe) ? `<section class="section" id="anomalies">
    <div class="section-tete">
      <div><h2>Problèmes signalés par les testeurs ${infoBouton('anomalies')}</h2><p class="chapo">Plusieurs échecs sur le même scénario font une seule anomalie. ${equipe ? 'Un KO de testeur en crée une tout seul ; vous pouvez aussi en poser une à la main.' : ''}</p></div>
      ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-anomalie="${echapper(pid)}">${icone('plus')} Nouvelle anomalie</button>` : ''}
    </div>
    ${ano.length ? `<div class="liste">${ano.map((a) => ligne({
      icone: 'alerte', ton: (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'rouge' ? 'rouge' : (GRAVITES_ANOMALIE[a.gravite] || {}).voile === 'ambre' ? 'ambre' : '',
      titre: `${a.scenario ? `${ref(a.scenario)} ` : ''}${echapper(a.titre || 'Anomalie')}${Number(a.retours) ? ' <span class="etiquette">Revenue</span>' : ''}`,
      /* Des témoins qui ne peuvent plus rejouer (test terminé, accès clos) :
         le serveur les note dans « aVerifierEquipe », c'est à l'équipe de
         vérifier la correction. */
      sous: `${equipe && (a.aVerifierEquipe || []).length ? `<b data-a-verifier>${echapper(pluriel(a.aVerifierEquipe.length, 'passage à revérifier par l\'équipe', 'passages à revérifier par l\'équipe'))}</b> · ` : ''}${(a.temoins || a.passages || []).length ? pluriel((a.temoins || a.passages || []).length, 'témoin', 'témoins') : (a.origine === 'equipe' ? 'posée à la main' : '')}${(a.plateformes || []).length ? ` · ${echapper((a.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(', '))}` : ''}${a.description ? ` · ${echapper(String(a.description).slice(0, 70))}` : ''}`,
      fin: `${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${pastille(STATUTS_ANOMALIE, a.statut || 'nouvelle')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-anomalie="${echapper(a.id)}" aria-label="Qualifier" data-astuce="Qualifier">${icone('edit')}</button></span>` : ''}`,
      action: 'ouvrir-anomalie', attrs: `data-id="${echapper(a.id)}"`,
    })).join('')}</div>`
    : vide({ icone: 'alerte', titre: 'Aucune anomalie', texte: 'Un échec de testeur en fera une tout seul, regroupée par scénario. Vous pouvez aussi en poser une à la main.', compact: true })}
  </section>` : '';

  const sectionPlan = avecPlan ? `<section class="section" id="plan-sections" data-plan-total="${planTous.length}" data-plan-sections="${sectionsPlan.length}">
    <div class="section-tete">
      <div><h2>Le plan de tests</h2><p class="chapo">${pluriel(planTous.length, 'vérification', 'vérifications')}${plateforme ? ` sur ${echapper((PLATEFORMES_TEST[plateforme] || {}).libelle || plateforme)}` : ''}, section par section.</p></div>
      <a class="btn btn-secondaire btn-petit" href="#/tests/plan?projet=${echapper(pid)}">${icone('liste')} Ouvrir le plan</a>
    </div>
    <div class="liste liste--serree">${planParSection.map((g) => ligne({
      titre: echapper(g.sec.titre || g.sec.id),
      sous: `${pluriel(g.items.length, 'vérification', 'vérifications')}${g.items.filter((x) => x.qui === 'robot').length ? ` · ${g.items.filter((x) => x.qui === 'robot').length} par un robot seul` : ''}`,
      fin: `<span class="badge">${g.items.length}</span>`,
    })).join('')}</div>
  </section>` : '';

  const sectionScenarios = `<section class="section" id="scenarios">
    <div class="section-tete">
      <div><h2>${avecPlan ? 'La bibliothèque d\'avant le plan' : 'Les vérifications'} ${infoBouton('scenarios')}</h2><p class="chapo">${avecPlan ? 'Les scénarios écrits avant le plan, auxquels des robots et des problèmes se rattachent encore. ' : ''}Tout ce qu'on vérifie dans l'app${plateforme ? `, sur ${(PLATEFORMES_TEST[plateforme] || {}).libelle}` : ''}. ${scen.length ? pluriel(scen.length, 'vérification', 'vérifications') : 'Vide.'}</p></div>
      <div class="rang">
        ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-action="nouveau" data-genre="scenario">${icone('plus')} Nouveau scénario</button>` : ''}
        <button class="btn btn-secondaire btn-petit" type="button" data-plier-scenarios aria-expanded="false">${icone('deplier')} Voir la liste</button>
      </div>
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
                ${quiFait(s)}
                ${(s.plateformes || []).length < 3 ? `<span class="puce puce--mini">${echapper((s.plateformes || []).map((p) => (PLATEFORMES_TEST[p] || {}).court || p).join(' '))}</span>` : ''}
                ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
              </span>
            </button>
          </div>`).join('')}</div>
      </div>`).join('')}
    </div>`
    : vide({ icone: 'bug', titre: plateforme ? 'Aucun scénario sur cette plateforme' : 'Aucun scénario', texte: plateforme ? 'Changez de filtre, ou élargissez les plateformes de vos scénarios.' : equipe ? 'Écrivez-en un avec « Nouveau scénario », ou versez un plan de tests sur ce projet.' : 'Les scénarios de test apparaîtront ici dès qu\'ils seront écrits.', compact: true })}
  </section>`;

  /* Les quatre tuiles d'autrefois redisaient l'avancement avec d'autres
     unités (« passages mobiles ») : l'avancement en haut suffit. */
  void passages; void ouvertes;
  return `
  <div id="tableau-ici"></div>

  ${alertes({ ...d, anomalies: tousProblemes, campagnes: camp, parcours: parc, scenarios: scen }, { nomProjet, plateforme, pid })}

  <div class="onglets-enveloppe"><nav class="onglets" id="onglets-tests" aria-label="Sections des tests">
    ${onglets.map((o) => `<a class="onglet${o.cle === actif ? ' actif' : ''}" href="#${adresse({ projet: pid, plateforme, onglet: o.cle === ONGLET_DEFAUT ? '' : o.cle })}" data-onglet="${o.cle}">${o.libelle}${comptes[o.cle] ? `<span class="badge" data-astuce="${echapper(astuces[o.cle] || '')}">${echapper(String(comptes[o.cle]))}</span>` : ''}</a>`).join('')}
  </nav></div>

  <div id="onglet-tests" data-onglet="${actif}">
    ${actif === 'devis' ? etage('etage-devis', 'Le devis, ligne par ligne', resumeDevis, `<div style="margin-top:20px">${devisProjet.map((dv) => friseDevis(dv, jalonsProjet, { equipe, pid })).join('')}</div>`) : ''}
    ${actif === 'humains' ? `${etage('etage-humain', 'Testeurs humains', humain, `${sectionCampagnes}${sectionAnomalies}${vivierHtml({ ...d, testeurs: gens, profils: gens }, { equipe })}`)}
      ${etage('etage-avis', 'Ce que les testeurs ont pensé de l\'app', resumeAvis, `${avisHtml(avis, { nommer, equipe, recus, notesTest })}${remarquesHtml(remarques, { nommer })}`)}` : ''}
    ${actif === 'automatises' ? etage('etage-machine', 'Tests par robot', machine, `${parcoursHtml(d, { pid, equipe, plateforme })}${reglesHtml(d, { pid, equipe })}`) : ''}
    ${actif === 'problemes' ? problemesHtml(tousProblemes, { pid, equipe, filtres, plateforme, tickets: (d.tickets || []).filter((t) => t.projet === pid) }) : ''}
    ${actif === 'bibliotheque' ? etage('etage-bibli', 'Ce qu\'on vérifie', avecPlan ? bibliPlan : bibli, avecPlan ? `${sectionPlan}${sectionScenarios}` : sectionScenarios) : ''}
  </div>`;
};

/* Le plan de tests est écrit en markdown, et son gras porte du sens : il
   désigne l'option exacte à choisir dans l'application (« Type **Rappel** »).
   On le rend, et rien d'autre : le texte est échappé avant, donc aucune
   balise venue de la fiche ne peut s'ouvrir ici. */
const gras = (texte) => echapper(texte || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/* La fiche d'une anomalie : la gravité, le statut et ce qu'il veut dire,
   ce qui se passe, les cases de test concernées, et chaque témoin avec sa
   preuve. C'est ce que l'équipe lit avant de reproduire, et ce que le
   client lit pour savoir où on en est. L'équipe y tranche (confirmer,
   fausse alerte, à revérifier), y crée le ticket de correction, et lit la
   note interne (fichier, ligne, preuve), chargée à part : les règles la
   ferment au client. */
const ouvrirAnomalie = (a, { equipe, pid, scenarios, tickets = [] }) => {
  const robot = a.origine === 'robot';
  const s = (scenarios || []).find((x) => x.ref === a.scenario);
  const temoins = (a.temoins || []).slice().sort((x, y) => (enDate(y.le) || 0) - (enDate(x.le) || 0));
  const plan = scenariosDuPlan(pid);
  const noms = nomsSections(pid);
  const statut = a.statut || 'nouvelle';
  const t = ticketDe(a, tickets);
  const corr = correctionDe(a, tickets);
  const cases = (a.scenarios || []).filter(Boolean);
  const texte = (titre, v) => (v ? `<div class="groupe"><span class="etiquette-champ">${titre}</span><p class="t-corps">${echapper(v).replace(/\n/g, '<br>')}</p></div>` : '');
  const lienTicket = t ? `#/projets/${encodeURIComponent(pid)}/demandes/${encodeURIComponent(t.id)}` : '';
  const ticketHtml = t
    ? `<p class="pb-ticket">${pastille(CORRECTION, corr)} <span>Ticket${t.numero ? ` ${echapper(t.numero)}` : ''} : ${echapper((STATUTS[t.statut] || {}).client || (STATUTS[t.statut] || {}).libelle || '')}.</span></p>`
    : (corr ? `<p class="pb-ticket">${pastille(CORRECTION, corr)}</p>` : '');
  const decision = (cle, libelle) => `<button class="btn ${statut === cle ? 'btn-principal' : 'btn-secondaire'} btn-petit" type="button" data-statut-anomalie="${cle}" aria-pressed="${statut === cle}">${libelle}</button>`;
  return modale({
    titre: a.titre || 'Anomalie',
    sousTitre: robot
      ? [sectionsDe(a).map((x) => noms.get(x) || x).join(', '), 'Relevé par les tests automatiques'].filter(Boolean).join(' · ')
      : [a.scenario, (BLOCS_SCENARIO[a.bloc] || {}).libelle].filter(Boolean).join(' · '),
    feuille: true,
    corps: `<div class="pb-fiche">
      <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${pastille(GRAVITES_ANOMALIE, a.gravite || 'important')}${pastille(STATUTS_ANOMALIE, statut)}
        ${Number(a.retours) ? `<span class="etiquette">Revenue ${a.retours > 1 ? `${a.retours} fois` : 'une fois'} après correction</span>` : ''}
        ${(a.plateformes || []).map((p) => `<span class="puce">${echapper(nomPlateforme(p))}</span>`).join('')}
      </div>
      <p class="pb-explication" data-explication-statut><b>${echapper((STATUTS_ANOMALIE[statut] || {}).libelle || statut)}</b> : ${echapper(explicationStatut(a).replace(/^./, (c) => c.toLowerCase()))}</p>
      ${ticketHtml}
      <p class="aide" style="margin-bottom:16px">${echapper((GRAVITES_ANOMALIE[a.gravite] || {}).aide || '')}</p>
      ${texte('Ce qui se passe', a.obtenu)}
      ${texte('Ce qui devrait se passer', a.attendu)}
      ${texte('Pour le voir', a.etapes)}
      ${a.description ? `<div class="groupe"><span class="etiquette-champ">Ce qu'on sait</span><div class="prose"><p>${echapper(a.description).replace(/\n/g, '<br>')}</p></div></div>` : ''}
      ${s ? `<div class="groupe"><span class="etiquette-champ">Le scénario</span><p class="t-corps">${gras(s.attendu)}</p></div>` : ''}
      ${cases.length ? `<div class="groupe"><span class="etiquette-champ">${cases.length > 1 ? 'Les cases de test concernées' : 'La case de test concernée'}</span>
        <div class="liste liste--serree">${cases.map((id) => {
    const sc = plan.get(id);
    return ligne({
      titre: echapper((sc && sc.titre) || id),
      sous: echapper([id, sc ? noms.get(sc.section) || sc.section : ''].filter(Boolean).join(' · ')),
      action: 'voir-case', attrs: `data-voir-case="${echapper(id)}"`,
    });
  }).join('')}</div></div>` : ''}
      ${robot ? '' : `<div class="groupe"><span class="etiquette-champ">${temoins.length ? pluriel(temoins.length, 'témoin', 'témoins') : 'Aucun témoin'}</span>
        ${temoins.length ? `<div class="liste liste--serree">${temoins.map((x) => ligne({
          icone: 'utilisateur', ton: 'ambre',
          titre: `${echapper(nomPlateforme(x.plateforme) || 'Plateforme inconnue')}${x.appareil ? ` · ${echapper(x.appareil)}` : ''}`,
          sous: `${dateHeure(x.le) ? `${echapper(dateHeure(x.le))} · ` : ''}${echapper(x.commentaire || 'Sans commentaire')}`,
          fin: (x.preuves || []).map((c, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(c)}">${icone('image')} Preuve ${i + 1}</button>`).join(''),
        })).join('')}</div>` : `<p class="aide">Posée à la main, sans échec de testeur derrière.</p>`}
      </div>`}
      ${equipe ? `<div class="groupe pb-decision"><span class="etiquette-champ">La décision de l'équipe</span>
        <div class="rang" style="gap:8px;flex-wrap:wrap">${decision('confirmee', 'Confirmer')}${decision('sans-suite', 'Fausse alerte')}${decision('a-reverifier', 'À revérifier')}</div>
        <p class="aide">Le client voit le statut changer aussitôt.</p></div>
      <div class="groupe pb-interne" data-note-interne><span class="etiquette-champ">Note interne, équipe seule</span><p class="aide">Lecture de la note…</p></div>` : ''}
    </div>`,
    pied: `${equipe
      ? `${t ? `<a class="btn btn-secondaire" href="${lienTicket}" data-voir-ticket>Voir le ticket</a>` : `<button class="btn btn-secondaire" type="button" data-creer-ticket>Créer un ticket</button>`}<button class="btn btn-secondaire" type="button" data-qualifier>${icone('edit')} Qualifier</button>`
      /* Le client en fait une demande : elle est alors suivie comme
         n'importe quel signalement, avec le lien vers l'anomalie. Un
         problème qui a déjà son ticket mène à lui. */
      : t ? `<a class="btn btn-secondaire" href="${lienTicket}" data-voir-ticket>Voir le ticket</a>`
        : `<a class="btn btn-secondaire" href="#/projets/${echapper(pid)}/nouvelle-demande?type=bug&titre=${encodeURIComponent(String(a.titre || a.scenario || 'Anomalie').slice(0, 120))}&anomalie=${encodeURIComponent(a.id || '')}" data-demande-anomalie>${icone('demandes')} En faire une demande</a>`}<span class="pousse"></span><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
};

/* La note interne d'un problème, en texte : ce qui part dans le ticket
   (message interne) et ce que la fiche montre à l'équipe. */
const lignesNote = (n) => [
  n.source ? `Source : ${n.source}${n.graviteSource ? `, gravité d'origine « ${n.graviteSource} »` : ''}` : '',
  n.decision ? `Décision : ${n.decision}` : '',
  ...(n.constats || []).flatMap((c) => [
    `${nomPlateforme(c.plateforme || '') || 'Plateforme ?'}${c.section ? ` · ${c.section}` : ''}${c.titre ? ` · ${c.titre}` : ''}`,
    c.piste ? `  Piste : ${c.piste}` : '',
    c.obtenu ? `  Obtenu : ${c.obtenu}` : '',
    c.preuve ? `  Preuve : ${c.preuve}` : '',
  ]),
  n.texte ? `Note : ${n.texte}` : '',
].filter(Boolean);

const noteHtml = (n) => {
  if (!n) return '<p class="aide">Aucune note interne.</p>';
  return `${n.source || n.decision ? `<p class="aide">${echapper([n.source ? `Source ${n.source}` : '', n.graviteSource ? `gravité d'origine « ${n.graviteSource} »` : '', n.decision || ''].filter(Boolean).join(' · '))}</p>` : ''}
    ${(n.constats || []).map((c) => `<div class="pb-constat">
      <p><b>${echapper(nomPlateforme(c.plateforme || '') || 'Plateforme ?')}</b>${c.titre ? ` · ${echapper(c.titre)}` : ''}</p>
      ${c.piste ? `<p class="pb-piste"><span class="etiquette-champ">Piste</span> <code>${echapper(c.piste)}</code></p>` : ''}
      ${c.obtenu ? `<p class="aide">Obtenu : ${echapper(c.obtenu)}</p>` : ''}
      ${c.preuve ? `<p class="aide">Preuve : ${echapper(c.preuve)}</p>` : ''}
    </div>`).join('')}
    ${n.texte ? `<p class="t-corps">${echapper(n.texte)}</p>` : ''}`;
};

/* Le ticket de correction d'un problème : écrit pour le client (ce sont
   les textes de la fiche), la piste technique en message interne. */
const creerTicketProbleme = async (a, { pid, env, note }) => {
  const plats = a.plateformes || [];
  const titre = String(a.titre || 'Problème relevé par les tests').slice(0, 120);
  const description = [a.obtenu || a.description || titre, a.origine === 'robot' ? 'Relevé par les tests automatiques.' : ''].filter(Boolean).join('\n\n').slice(0, 6000);
  const tid = await ecrire.creerDemande(env.session, pid, {
    titre, description, type: 'bug', urgence: GRAVITES_ANOMALIE[a.gravite] ? a.gravite : 'important',
    plateforme: plats.length === 1 ? plats[0] : '',
    etapes: String(a.etapes || '').slice(0, 4000), attendu: String(a.attendu || '').slice(0, 2000), obtenu: String(a.obtenu || '').slice(0, 2000),
    anomalie: a.id,
  });
  const lignes = note ? lignesNote(note) : [];
  if (lignes.length) await ecrire.messageDemande(env.session, tid, `Né du problème ${a.id}.\n${lignes.join('\n')}`.slice(0, 6000), [], true);
  await ecrire.majAnomalie(pid, a.id, { ticket: tid });
  return tid;
};

/* Le détail d'un scénario : ce que le testeur lira, mot pour mot. */
const ouvrirScenario = (s) => {
  const niveau = NIVEAUX_SCENARIO[s.niveau] || NIVEAUX_SCENARIO.reparti;
  return modale({
    titre: s.titre, sousTitre: `${s.ref} · ${(BLOCS_SCENARIO[s.bloc] || {}).libelle || s.blocLibelle || ''}`, scenario: true,
    corps: `
      <div class="fs-etat">
        ${pastille(NIVEAUX_SCENARIO, s.niveau || 'reparti')}
        ${(s.plateformes || []).map((p) => `<span class="puce">${echapper((PLATEFORMES_TEST[p] || {}).libelle || p)}</span>`).join('')}
      </div>
      ${s.options ? `<section class="fs-bloc"><p class="fs-bloc-sur">Ce qu'il faut poser</p><p>${gras(s.options)}</p></section>` : ''}
      <section class="fs-bloc fs-bloc--attendu"><p class="fs-bloc-sur">Ce qui doit se passer</p><p>${gras(s.attendu)}</p></section>
      <p class="fs-note">${echapper(niveau.aide)}</p>
      <p class="fs-note">Un scénario où rien ne se passe est un échec, jamais une réussite.</p>`,
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
          <input class="champ" id="t-email" type="email" value="${echapper(f.email || '')}" ${neuf ? '' : 'readonly'} placeholder="karim@exemple.test">
          ${neuf ? '' : '<p class="aide">L\'adresse ne se change pas : elle est la clé de son compte.</p>'}</div>
      </div>

      <div class="groupe"><span class="etiquette-champ">Ce qu'il teste</span>
        <div class="cases-blocs">${Object.entries(PLATEFORMES_TEST).map(([cle, x]) => `
          <label class="case"><input type="checkbox" data-plateforme-t="${echapper(cle)}" ${(f.plateformes || (f.mobile ? [f.mobile, 'web'] : [])).includes(cle) ? 'checked' : ''}> ${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(x.libelle)}</label>`).join('')}</div>
        <p class="aide">C'est ce choix qui décide de ce qu'il recevra. Un scénario dont le comportement dépend du système part chez un testeur iPhone et un testeur Android : il faut donc au moins un de chaque dans une campagne, sinon la moitié du travail n'est pas payée pour rien, elle n'est simplement pas faite.</p>
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
        <input class="champ" id="t-expertise" value="${echapper(p.expertise || '')}" placeholder="Son domaine d'expertise : santé, commerce, droit..." style="margin-top:10px">
        <select class="select" id="t-aisance" style="margin-top:10px">
          <option value="">Son aisance avec le numérique</option>
          ${AISANCE.map((x) => `<option value="${echapper(x)}"${p.aisance === x ? ' selected' : ''}>${echapper(x)}</option>`).join('')}
        </select>
        <p class="aide">Il faut pouvoir distinguer un blocage causé par l'application d'un blocage causé par l'habitude. Ce profil est visible du client, jamais son nom.</p>
      </div>

      ${neuf ? '' : `<div class="groupe"><span class="etiquette-champ">Sa fiche, ses appareils</span>
        ${f.ficheValidee ? `<p class="t-petit t-ok">Fiche validée par ${echapper(f.prenom || 'le testeur')}${f.nom ? ` ${echapper(f.nom)}` : ''} le ${echapper(enDate(f.ficheValidee) ? enDate(f.ficheValidee).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')}.</p>` : '<p class="t-petit t-3">Fiche pas encore validée : il la remplit à sa première connexion.</p>'}
        ${(f.appareils || []).length ? `<div class="liste liste--serree" style="margin-top:8px">${(f.appareils || []).map((a) => `
          <div class="rang" style="justify-content:space-between;padding:6px 10px;border-radius:8px;background:var(--fond-2)">
            <span class="t-petit"><b>${echapper(a.modele || 'Appareil')}</b> · ${echapper(a.os || '')} · ${echapper(a.navigateur || '')}${a.confirme === false ? ' <span class="t-3">(pas pour tester)</span>' : ''}</span>
            <span class="t-micro t-3">${echapper(a.ecran || '')}${a.reseau ? ` · ${echapper(a.reseau)}` : ''}${enDate(a.vu) ? ` · vu le ${echapper(enDate(a.vu).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}` : ''}</span>
          </div>`).join('')}</div>` : ''}
      </div>`}

      <div class="groupe"><span class="etiquette-champ">Ses projets</span>
        <div class="cases-blocs">${projets.map((x) => `
          <label class="case"><input type="checkbox" data-projet="${echapper(x.id)}" ${(f.projets || []).includes(x.id) ? 'checked' : ''}> ${echapper(x.nom)}</label>`).join('')}</div>
      </div>`,
    /* Quatre gestes dans un pied de 520 pixels ne tiennent pas côte à côte.
       Les deux courants restent visibles, les deux rares passent sous un
       menu : renvoyer une invitation ne se fait pas tous les jours, et
       supprimer ne se rattrape pas. */
    /* Les gestes secondaires à gauche, séparés des trois qui comptent :
       au milieu du pied, les trois points se lisaient comme une étape du
       parcours normal, alors qu'ils cachent une suppression. */
    pied: `${neuf ? '' : `<button class="btn-icone" type="button" data-autres aria-label="Autres actions" data-astuce="Autres actions">${icone('points')}</button>`}
      <span class="pousse"></span>
      <button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
      ${neuf ? '' : '<button class="btn btn-doux" type="button" data-retirer>Retirer</button>'}
      <button class="btn btn-principal" type="button" data-enregistrer>${neuf ? 'Inscrire' : 'Enregistrer'}</button>`,
  });

  /* Les deux gestes rares, sous le menu : renvoyer l'invitation pour une
     boîte qui l'a perdue, et supprimer, qui ne se rattrape pas. */
  const autres = m.el.querySelector('[data-autres]');
  if (autres) autres.addEventListener('click', () => menu(autres, [
    {
      cle: 'inviter', libelle: "Renvoyer l'invitation", icone: 'envoyer',
      action: () => agir(autres, async () => {
        await appelServeur('inviterTesteur', { testeur: f.id });
        toast(`Invitation renvoyée à ${f.email || 'ce testeur'}.`);
      }),
    },
    '-',
    { cle: 'supprimer', libelle: 'Supprimer définitivement', icone: 'corbeille', danger: true, action: () => supprimerTesteur() },
  ]));

  /* Retirer : l'accès se ferme, la fiche et les résultats restent. C'est
     le geste courant, celui d'un testeur qui ne travaille plus avec nous. */
  const retirer = m.el.querySelector('[data-retirer]');
  if (retirer) retirer.addEventListener('click', async () => {
    const sur = await confirmer({
      titre: `Retirer ${f.prenom || 'ce testeur'} des testeurs ?`,
      texte: "Son accès se ferme tout de suite. Ses résultats restent : ils sont la mémoire de la campagne, et les effacer falsifierait le rapport. Vous pourrez le réinscrire plus tard.",
      ok: 'Retirer', danger: true,
    });
    if (!sur) return;
    await agir(retirer, async () => {
      await appelServeur('retirerTesteur', { testeur: f.id });
      toast('Testeur retiré. Ses résultats sont conservés.');
      m.fermer(true);
    });
  });

  /* Supprimer : tout part, compte compris. Pour un essai ou une erreur de
     saisie. Le serveur refuse si le testeur a consigné un passage. */
  const supprimerTesteur = async () => {
    const sur = await confirmer({
      titre: `Supprimer ${f.prenom || 'ce testeur'} définitivement ?`,
      texte: `Tout part : sa fiche, son compte${f.email ? ` (${f.email})` : ''}, ses résultats, ses avis, ses captures et sa place dans les campagnes. Cela ne se rattrape pas. Pour un testeur qui arrête simplement, préférez « Retirer » : ses résultats restent.`,
      ok: 'Supprimer', danger: true,
    });
    if (!sur) return;
    try {
      await appelServeur('retirerTesteur', { testeur: f.id, definitif: true });
      toast(`${f.prenom || 'Le testeur'} est supprimé, avec tout ce qui le concernait.`);
      m.fermer(true);
    } catch (e) {
      toast(lisible(e), 'erreur');
    }
  };

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
        expertise: (m.el.querySelector('#t-expertise').value || '').trim(),
        aisance: m.el.querySelector('#t-aisance').value,
      },
    };
    if (neuf) await appelServeur('inscrireTesteur', { ...donnees, email: emailV });
    else await appelServeur('majTesteur', { ...donnees, testeur: f.id });
    toast(neuf ? `${prenomV} est inscrit parmi les testeurs.` : 'Testeur enregistré.');
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
    const n = avis.map((a) => lireReponse(a, cle)).filter((x) => x !== undefined).map(Number).filter((x) => !Number.isNaN(x));
    return n.length ? { v: n.reduce((x, y) => x + y, 0) / n.length, sur: n.length } : null;
  };
  const euros = (cle) => {
    const n = avis.map((a) => Number(lireReponse(a, cle))).filter((x) => !Number.isNaN(x) && x > 0).sort((x, y) => x - y);
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

/* Une empreinte stable d'un texte (FNV-1a) : l'ordre des réponses libres. */
const empreinte = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const restitutionHtml = (avis, { toutes = false, equipe = false }) => {
  const { moyenne, euros } = mesuresAvis(avis);
  const repondu = (cle) => avis.filter((a) => lireReponse(a, cle) !== undefined);

  const questionHtml = (cle, q) => {
    const id = `${cle}.${q.cle}`;
    /* Une question réservée à l'équipe (ce qui a gêné le testeur dans la
       campagne) ne s'affiche pas chez le client, même vide. */
    if (q.equipe && !equipe) return '';
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
      avis.forEach((a) => { const v = lireReponse(a, id); if (v !== undefined) comptes[v] = (comptes[v] || 0) + 1; });
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
    /* Sans nom ni profil, et dans un ordre propre à chaque question : le
       deuxième texte d'une question n'est pas celui de la même personne que
       le deuxième de la suivante. */
    const dits = avis.map((a) => lireReponse(a, id)).filter((x) => x !== undefined)
      .map((texte) => ({ texte: String(texte), cle: empreinte(`${id}|${texte}`) })).sort((a, b) => a.cle - b.cle);
    return `<div class="avis-mesure">${enonce}
      <div class="avis-verbatims">${dits.map((x) => `
        <blockquote class="avis-verbatim">
          <p>${echapper(x.texte)}</p>
        </blockquote>`).join('')}</div>
    </div>`;
  };

  return Object.entries(FAMILLES_AVIS).filter(([, f]) => equipe || !f.equipe).map(([cle, f]) => `
    <section class="avis-famille">
      <h3 class="bloc-tete">${echapper(f.libelle)}${toutes ? `<span class="etiquette">${echapper((MOMENTS_AVIS[f.quand] || {}).libelle || '')}</span>` : ''}</h3>
      ${toutes && f.aide ? `<p class="aide" style="margin:0 0 10px">${echapper(f.aide)}</p>` : ''}
      ${f.questions.map((q) => questionHtml(cle, q)).join('')}
    </section>`).join('');
};

/* Les trois chiffres qui résument un questionnaire : qui recommande, à
   quel prix, et combien de personnes l'ont dit. */
const chiffresAvis = (avis, repondants = avis.length) => {
  const { recommande, suspect, cher } = mesuresAvis(avis);
  return `<div class="rang chiffres-tests" style="margin-bottom:22px">
    ${recommande ? `<div class="chiffre"><span class="chiffre-valeur">${recommande.v.toFixed(1)}</span><span class="chiffre-nom">recommandation sur 10</span></div>` : ''}
    ${suspect && cher ? `<div class="chiffre"><span class="chiffre-valeur">${suspect.median} à ${cher.median} €</span><span class="chiffre-nom">fourchette acceptable</span></div>` : ''}
    <div class="chiffre"><span class="chiffre-valeur">${repondants}</span><span class="chiffre-nom">${repondants > 1 ? 'testeurs ont répondu' : 'testeur a répondu'}</span></div>
  </div>
  ${suspect && cher ? `<p class="aide" style="margin-bottom:22px">En dessous de ${suspect.median} €, ils se méfient de la qualité. Au-dessus de ${cher.median} €, ils renoncent. Sur ${pluriel(suspect.sur, 'réponse', 'réponses')}, c'est une direction, pas une étude de marché.</p>` : ''}`;
};

/* Ce que dit la page de l'anonymat, et de ce qui attend le seuil. */
const anonymatHtml = (recus) => {
  const attente = enAttenteDe(recus);
  return `<p class="aide avis-anonymat" data-avis-anonymat>Les réponses arrivent sans nom ni profil : personne, pas même l'équipe Capmedia, ne sait qui a dit quoi. Elles s'affichent à partir de ${SEUIL_AVIS} réponses, pour qu'aucune ne soit reconnaissable.${attente.length ? ` <b data-avis-attente>${attente.map((m) => `${pluriel(recus[m], 'réponse', 'réponses')} ${m === 'avant' ? 'avant le test' : 'après le test'}`).join(', ')}</b>, en attente d'en avoir ${SEUIL_AVIS}.` : ''}</p>`;
};

const ouvrirAvis = (campagne, { nommer, equipe = false }) => {
  const avis = campagne._avis || [];
  const recus = campagne._recus || { avant: 0, apres: 0 };
  const repondants = repondantsDe(recus);
  const remarques = campagne._remarques || [];

  if (!avis.length && !remarques.length && !repondants) {
    return modale({
      titre: 'Ce que les testeurs en pensent', feuille: true,
      corps: vide({ icone: 'coeur', titre: 'Aucun avis pour l\'instant',
        texte: 'Le questionnaire est proposé aux testeurs avant de commencer, puis quand ils ont tout déroulé. Les remarques libres arrivent ici aussi.', compact: true }),
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
    }).fin;
  }

  return modale({
    titre: 'Ce que les testeurs en pensent',
    sousTitre: `${pluriel(repondants, 'réponse', 'réponses')}${remarques.length ? ` · ${pluriel(remarques.length, 'remarque', 'remarques')}` : ''} · ${echapper(campagne.titre || '')}`,
    feuille: true,
    corps: `${anonymatHtml(recus)}${avis.length ? chiffresAvis(avis, repondants) : ''}${avis.length || (campagne._notesTest || []).length ? restitutionHtml([...avis, ...(campagne._notesTest || [])], { equipe }) : ''}${remarquesHtml(remarques, { nommer })}`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  }).fin;
};

/* Le questionnaire sur la page : ce qui sera demandé, et ce qui a été
   répondu, toutes campagnes du projet confondues. */
const avisHtml = (avis, { equipe = false, recus = { avant: 0, apres: 0 }, notesTest = [] }) => {
  /* La restitution lit les réponses anonymes, et pour l'équipe la note du
     test ; les chiffres d'en-tête, les réponses anonymes seules. */
  const lus = [...avis, ...notesTest];
  const q = resumeQuestionnaire({ pourClient: !equipe });
  const nbQuestions = q.total;
  return `<section class="section" id="avis">
    <div class="section-tete">
      <div><h2>Le questionnaire ${infoBouton('avis')}</h2><p class="chapo">${nbQuestions} questions en ${q.familles} familles, les mêmes que celles posées au testeur. ${q.avant} avant de commencer, ${equipe ? `${q.fin} en terminant le test (pour l'équipe seule), ` : ''}${q.apres} après avoir tout déroulé. ${avis.length ? 'Les réponses libres sont rendues mot pour mot, sans nom.' : (repondantsDe(recus) ? 'Voici ce qui est demandé.' : 'Personne n\'a encore répondu : voici ce qui sera demandé.')}</p></div>
    </div>
    ${anonymatHtml(recus)}
    ${lus.length ? `${avis.length ? chiffresAvis(avis, repondantsDe(recus)) : ''}${restitutionHtml(lus, { toutes: true, equipe })}`
    : `<button class="btn btn-secondaire btn-petit" type="button" data-plier-questions aria-expanded="false">${icone('deplier')} Voir les ${nbQuestions} questions</button>
    <div id="questions-avis" hidden style="margin-top:14px">${restitutionHtml(lus, { toutes: true, equipe })}</div>`}
  </section>`;
};

/* Les remarques libres, rendues telles quelles : qui (le prénom pour
   l'équipe, « Testeur N » et son profil pour le client, par le même
   nommeur que le reste de la page), sur quoi, et quand. */
const remarquesHtml = (remarques, { nommer }) => {
  const sur = (r) => [r.scenario ? ref(r.scenario) : '', r.plateforme ? echapper((PLATEFORMES_TEST[r.plateforme] || {}).libelle || r.plateforme) : '',
    enDate(r.cree) ? echapper(dateCourte(enDate(r.cree))) : '', r.ancienne ? 'après le test, pour l\'équipe' : ''].filter(Boolean).join(' · ');
  return `<section class="section" id="remarques">
    <div class="section-tete"><div><h2>Remarques libres</h2><p class="chapo">${remarques.length
      ? `${pluriel(remarques.length, 'remarque', 'remarques')}, écrites par les testeurs quand ils le voulaient, sur un scénario ou en général. Rendues mot pour mot.`
      : 'Aucune pour l\'instant. Un testeur peut en écrire à tout moment, sur un scénario ou en général.'}</p></div></div>
    ${remarques.length ? `<div class="avis-verbatims">${remarques.map((r) => `
      <blockquote class="avis-verbatim avis-remarque">
        <p>${echapper(String(r.texte))}</p>
        <cite>${echapper(nommer(r.testeur).libelle)}${sur(r) ? ` · ${sur(r)}` : ''}</cite>
      </blockquote>`).join('')}</div>` : ''}
  </section>`;
};

/* Les résultats d'une campagne, scénario par scénario : chaque passage,
   avec qui l'a fait, sur quoi, ce qu'il a obtenu, et sa preuve. C'est ce
   que le client vient lire pendant la campagne, et il le lit en entier.
   Le profil du testeur n'y est pas répété : il figure une fois, dans la
   liste des testeurs, et la ligne dit seulement qui. */
const quandPassage = (x) => enDate(x.maj) || enDate(x.cree) || enDate(x.le);
const resultatsHtml = (c, { dedans, nommer }) => {
  const passages = passagesDe(c).slice().sort((a, b) => (quandPassage(b) || 0) - (quandPassage(a) || 0));
  const attendus = Object.keys(c.affectation || {}).reduce((n, uid) => n + clesDe(c.affectation, uid).length, 0);
  const compte = (r) => passages.filter((x) => verdictDe(x.resultat) === r).length;
  const parScenario = dedans.map((s) => ({ s, p: passages.filter((x) => x.scenario === s.ref) })).filter((x) => x.p.length);
  return `<div class="groupe" id="resultats">
    <span class="etiquette-champ">Les résultats, scénario par scénario ${infoBouton('resultats')}</span>
    ${passages.length ? `
      ${jauge([{ n: compte('reussi'), nom: 'réussis', ton: 'vert' }, { n: compte('echec'), nom: 'en échec', ton: 'rouge' }, { n: compte('sans-objet'), nom: 'sans objet', ton: 'gris' }])}
      <p class="aide" style="margin:8px 0 12px">${pluriel(passages.length, 'passage consigné', 'passages consignés')}${attendus ? ` sur ${attendus} ${attendus > 1 ? 'attendus' : 'attendu'}` : ''}.</p>
      ${parScenario.map(({ s, p }) => `<div class="resultat">
        <p class="resultat-tete">${ref(s.ref)} <span>${echapper(s.titre)}</span></p>
        <div class="liste liste--serree">${p.map((x) => {
          const qui = nommer(x.testeur);
          const v = verdictDe(x.resultat);
          const appareil = (x.contexte || {}).appareil || (x.contexte || {}).modele || '';
          return ligne({
            icone: v === 'echec' ? 'alerte' : v === 'reussi' ? 'check' : 'moins',
            ton: v === 'echec' ? 'rouge' : v === 'reussi' ? 'vert' : '',
            titre: `${echapper(qui.nom)} · ${echapper(NOMS_PLATEFORMES[x.plateforme] || x.plateforme || '')}${appareil ? ` · ${echapper(appareil)}` : ''}`,
            sous: `${dateHeure(quandPassage(x)) ? `${echapper(dateHeure(quandPassage(x)))} · ` : ''}${echapper(x.commentaire || (v === 'reussi' ? 'Comme prévu' : 'Sans commentaire'))}`,
            fin: `${pastille(VERDICTS, v)}${(x.preuves || []).map((ch, i) => `<button class="btn btn-doux btn-petit" type="button" data-piece="${echapper(ch)}">${icone('image')} Preuve ${i + 1}</button>`).join('')}`,
          });
        }).join('')}</div>
      </div>`).join('')}`
    : `<p class="aide">Aucun passage consigné pour l'instant${attendus ? ` : ${attendus} ${attendus > 1 ? 'sont attendus' : 'est attendu'}` : ''}.</p>`}
  </div>`;
};

/* Répartir à la règle du socle (08/10/2026) : l'aperçu, puis l'écriture.
   Les retraits viennent du Hub (les parcours des robots et les anomalies
   du projet, déjà dans le magasin de la page), jamais d'un fichier. Rien
   n'est écrit avant « Enregistrer ». */
const apercuSocle = async ({ c, pid, env, scenariosPlan, gens, garder, nommer, fermerFeuille }) => {
  const d = lireTout(env);
  const parcours = d.parcours.filter((x) => projetDe(x) === pid);
  const anomalies = d.anomalies.filter((x) => projetDe(x) === pid);
  const retraits = retraitsConnus({ scenarios: scenariosPlan, parcours, anomalies });
  const ids = new Set(scenariosPlan.map((x) => x.id));
  const socle = regleSocle(c) && Array.isArray(c.socle) ? c.socle.filter((x) => ids.has(x)) : proposerSocle(scenariosPlan, { retraits });
  const plafond = plafondDe(c);
  const r = repartirSocle(scenariosPlan, gens, { socle, plafond, retraits, garder, graine: c.id || '' });
  const ctl = controlerSocle(r.affectation, scenariosPlan, { socle, retraits, plafond });
  const charges = chargeSocle(r.affectation, socle);
  const total = charges.reduce((n, x) => n + x.total, 0);
  const nom = (id) => nommer(id).nom;
  const PLAT = { ios: 'iPhone', android: 'Android', web: 'Web' };
  const auxRobots = r.laisses.filter((x) => x.qui !== 'humain');
  const personne = r.laisses.filter((x) => x.qui === 'humain');
  const motifs = {};
  r.retires.forEach((x) => { motifs[x.motif] = (motifs[x.motif] || 0) + 1; });
  const socleVide = socle.filter((id) => !r.affectation || !Object.values(r.affectation).some((a) => a.cles.some((k) => k.startsWith(`${id}__`))));
  const bloque = !ctl.conforme || r.depassements.length > 0 || !Object.keys(r.affectation).length;
  const avant = Object.keys(c.affectation || {});
  const dejaFaits = Object.values(garder).reduce((n, l) => n + l.length, 0);
  const heures = (n) => `${String(Math.round(n * MINUTES_PAR_TEST / 6) / 10).replace('.', ',')} h`;
  const corps = `
    <p class="t-corps t-2" style="margin:0 0 14px">Le socle (${pluriel(socle.length, 'scénario', 'scénarios')}) chez tous, sur son téléphone et sur le web. Le reste une fois chacun, par priorité (haute, puis moyenne, puis basse), tiré au sort à priorité égale, jusqu'à ${plafond} tests par testeur (${heures(plafond)}).</p>
    <table class="tableau" data-apercu-charges>
      <thead><tr><th>Testeur</th><th>Téléphone</th><th class="droite">Socle</th><th class="droite">Reste</th><th class="droite">Dont web</th><th class="droite">Total</th><th class="droite">Heures</th></tr></thead>
      <tbody>${charges.map((x) => `<tr data-charge="${echapper(x.id)}"><td>${echapper(nom(x.id))}</td><td>${echapper(PLAT[x.telephone] || '-')}</td><td class="droite">${x.socle}</td><td class="droite">${x.reste}</td><td class="droite">${x.webN}</td><td class="droite"><b>${x.total}</b></td><td class="droite">${heures(x.total)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="aide" data-apercu-robots style="margin-top:12px">${pluriel(auxRobots.length, 'test laissé', 'tests laissés')} aux robots, faute de place sous le plafond.${personne.length ? ` ${pluriel(personne.length, 'test « humain » seul ne trouve', 'tests « humain » seuls ne trouvent')} pas de place : aucun robot ne les joue, ils attendront une autre campagne.` : ''}</p>
    ${r.retires.length ? `<p class="aide" data-apercu-retires style="margin-top:8px">${pluriel(r.retires.length, 'passage retiré', 'passages retirés')} : ${Object.keys(MOTIFS_RETRAIT).filter((k) => motifs[k]).map((k) => `${motifs[k]} ${MOTIFS_RETRAIT[k]}`).join(', ')}. Un scénario « humain » seul n'est jamais retiré.</p>` : ''}
    ${socleVide.length ? `<p class="aide" data-apercu-socle-vide style="margin-top:8px">${pluriel(socleVide.length, 'scénario du socle n\'a', 'scénarios du socle n\'ont')} aucun passage à faire (tous retirés, ou hors du téléphone des testeurs) : ${socleVide.map(echapper).join(', ')}.</p>` : ''}
    ${r.ecartes.length ? `<p class="aide" data-apercu-ecartes style="margin-top:12px">Sans téléphone dans sa fiche, donc laissé de côté : ${r.ecartes.map((id) => echapper(nom(id))).join(', ')}.</p>` : ''}
    ${r.depassements.length ? `<p class="aide t-alerte" data-apercu-depasse style="margin-top:12px">Le socle dépasse à lui seul le plafond chez ${r.depassements.map((x) => `${echapper(nom(x.id))} (${x.socle})`).join(', ')} : allégez le socle ou montez le plafond.</p>` : ''}
    ${ctl.conforme ? '' : '<p class="aide t-alerte" data-apercu-controle style="margin-top:12px">Le contrôle a trouvé un écart dans ce calcul. Rien ne sera enregistré.</p>'}
    ${avant.length ? `<p class="aide" data-apercu-ecrase style="margin-top:12px">Une répartition existe déjà (${pluriel(avant.length, 'testeur', 'testeurs')}${dejaFaits ? `, ${pluriel(dejaFaits, 'passage déjà consigné', 'passages déjà consignés')}, qui restent chez leur auteur` : ''}). Elle sera remplacée par celle-ci.</p>` : ''}`;
  const apercu = modale({
    titre: 'Aperçu de la répartition', sousTitre: c.titre || 'Campagne', large: true, corps,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
      <button class="btn btn-principal" type="button" data-enregistrer-repartition ${bloque ? 'disabled' : ''}>${avant.length ? 'Remplacer la répartition' : 'Enregistrer la répartition'}</button>`,
  });
  const valider = apercu.el.querySelector('[data-enregistrer-repartition]');
  valider.addEventListener('click', () => agir(valider, async () => {
    if (bloque) return;
    await ecrire.majCampagne(pid, c.id, {
      testeurs: Object.keys(r.affectation), affectation: r.affectation,
      regle: 'socle', socle, plafond, retraits: r.retires.map((x) => x.cle),
      repartition: {
        laissesAuxRobots: auxRobots.length, sansPersonne: personne.length, retires: r.retires.length,
        motifs: { robot: motifs.robot || 0, bug: motifs.bug || 0, webVert: motifs['web-vert'] || 0 },
        le: new Date(),
      },
    });
    toast(`${total} passages répartis entre ${pluriel(Object.keys(r.affectation).length, 'testeur', 'testeurs')}. ${pluriel(auxRobots.length, 'test laissé', 'tests laissés')} aux robots.`);
    apercu.fermer(true);
    fermerFeuille();
  }));
  await apercu.fin;
};

/* L'affectation des testeurs à une campagne.
   Le calcul propose, il ne décide pas : un testeur tombe malade, un autre
   demande un bloc précis, et aucun calcul ne prévoit cela. */
const ouvrirCampagne = async (c, { pid, env, scenarios, sections = [], nommer }) => {
  const equipe = env.role === 'equipe';
  /* Le vivier proposé : sans les retirés (sauf ceux déjà dans la
     campagne), ceux du projet d'abord. */
  const vivier = vivierPropose(magasin.lire(K.testeurs) || [], pid, c.testeurs || []);
  const retenus = c.scenarios || [];
  /* Une campagne sur le plan lit les scénarios d'humains du plan, et
     compte en passages (scénario × plateforme, deux testeurs pour un
     « humain » seul) ; une campagne d'avant lit la bibliothèque. */
  const humains = scenariosHumainsDuPlan(sections);
  const surPlan = estSurLePlan(c, humains);
  const dedans = surPlan ? humains.filter((s) => retenus.includes(s.id)) : scenarios.filter((s) => retenus.includes(s.ref));
  const doubles = surPlan
    ? [...clesAttendues(dedans).values()].reduce((a, b) => a + b, 0) - dedans.length
    : dedans.filter((s) => (NIVEAUX_SCENARIO[s.niveau] || {}).double).length;
  /* À la règle du socle, les passages sont ceux qui sont confiés, pas
     ceux que le plan permettrait ; le reste est aux robots. */
  const socleRegle = surPlan && regleSocle(c);
  const passagesConfies = Object.values(c.affectation || {}).reduce((n, e) => n + clesDe({ x: e }, 'x').length, 0);
  const bilanRepartition = c.repartition || {};

  const affectation = c.affectation || {};
  /* Le nom passe par le nommeur : prénom pour l'équipe, « Testeur N » pour
     le client, le même numéro que partout ailleurs sur la page. Sans lui,
     le client lisait l'identifiant Firebase, vingt-huit caractères. */
  /* Les premiers pas (l'accueil de l'espace Test) : consignés par le
     testeur dans son appréciation. L'équipe voit qui les a faits, le client
     aussi, sous le numéro. */
  const avis = tracesDe([c]);
  /* La fin de test : « termine » sur l'appréciation, la date de fin
     d'accès sur la campagne (fins), posée par le serveur et déplacée par
     l'équipe. Les remarques d'après ne se lisent qu'ici. */
  const charges = (c.testeurs || []).map((id) => {
    const t = vivier.find((x) => x.id === id) || { id };
    const a = avis.find((x) => x.id === id) || {};
    return {
      id, nom: nommer(id).nom, mobile: t.mobile || '', n: clesDe(affectation, id).length, accueil: Boolean(a.accueil),
      /* Le client ne lit plus l'appréciation : la fin de test, il la lit
         sur la campagne (« termines », posé par le serveur). */
      termine: enDate(a.termine) || enDate((c.termines || {})[id]), fin: enDate((c.fins || {})[id]), remarques: Array.isArray(a.remarques) ? a.remarques : [],
      /* A répondu, oui ou non : jamais quoi (l'équipe seule). */
      avisAvant: avisRendu(a, 'avant'), avisApres: avisRendu(a, 'apres'),
      noteTest: equipe && a.noteTest && a.noteTest.note ? a.noteTest : null,
    };
  });
  const jourCourt = (d) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  const etatAccesHtml = (t) => {
    if (!t.termine && !t.fin) return '';
    const passe = t.fin && t.fin.getTime() <= Date.now();
    const texte = t.termine
      ? `Terminé le ${jourCourt(t.termine)}${t.fin ? ` · accès ${passe ? 'clos depuis le' : 'jusqu\'au'} ${jourCourt(t.fin)}` : ''}`
      : `Accès ${passe ? 'clos depuis le' : 'jusqu\'au'} ${jourCourt(t.fin)}`;
    return `<span class="t-micro ${passe ? 't-3' : 't-ok'}">${echapper(texte)}</span>`;
  };

  /* Le lancement, en quatre lignes : la campagne ne part que si toutes
     sont vraies. Avant, il fallait sept gestes dans quatre fenêtres, et
     rien ne disait ce qui manquait ; passer « En cours » par la feuille
     reste possible, avec le même contrôle. */
  const enPreparation = (c.statut || 'preparation') === 'preparation';
  const pret = surPlan ? pretALancer(c, { humains }) : [];
  const lancable = surPlan && pret.every((x) => x.ok);
  const lancementHtml = equipe && enPreparation ? `<div class="groupe" data-lancement>
    <span class="etiquette-champ">Prête à lancer ?</span>
    ${surPlan ? `<div class="liste liste--serree">${pret.map((x, i) => `
      <div class="rang" style="justify-content:space-between;gap:10px;padding:6px 10px;border-radius:8px;background:var(--fond-2)" data-pret="${echapper(x.cle)}" data-ok="${x.ok ? '1' : '0'}">
        <span><span class="t-micro t-3">${i + 1}</span> ${echapper(x.libelle)}</span>
        <span class="t-petit ${x.ok ? 't-ok' : 't-3'}">${echapper(x.detail)}</span>
      </div>`).join('')}</div>
      <p class="aide">Les scénarios, la présentation et les liens se règlent dans « Modifier » ; les testeurs, avec « Répartir », ci-dessous.</p>`
      : '<p class="aide">Ce projet n\'a pas encore de plan de tests, ou la campagne reprend l\'ancienne bibliothèque : modifiez-la pour choisir les sections du plan.</p>'}
  </div>` : '';

  /* Les identifiants de test, un document par testeur
     (campagnes/{c}/acces/{uid}) : chacun ne lit que les siens, tant que
     son accès court, et le client ne les lit pas. L'ancien bloc commun de
     la campagne était lisible de tous : on le montre ici tant qu'il n'est
     pas vidé, pour le ressaisir testeur par testeur. Équipe seule. */
  const ancienBloc = String((c.acces || {}).identifiants || '').trim();
  const identifiantsHtml = equipe && charges.length ? `<div class="groupe" data-identifiants>
    <span class="etiquette-champ">Identifiants de test, par testeur</span>
    <p class="aide">Chacun ne lit que les siens, tant que son accès court. Le client ne les voit jamais. Le compte ForgeMe de test (une adresse @exemple.test, un par testeur) ouvre « Mon compte de test » dans son espace : il y change l'abonnement, remplit ou vide ce compte-là, et aucun autre.</p>
    ${charges.map((t) => `<label class="etiquette-champ" for="ident-${echapper(t.id)}" style="margin-top:8px">${echapper(t.nom)}</label>
      <textarea class="champ" id="ident-${echapper(t.id)}" rows="2" maxlength="2000" data-identifiants-de="${echapper(t.id)}" placeholder="test1@exemple.test · MotDePasse1" disabled></textarea>
      <input class="champ" type="email" style="margin-top:6px" maxlength="80" id="compte-${echapper(t.id)}" data-compte-de="${echapper(t.id)}" aria-label="Compte ForgeMe de test de ${echapper(t.nom)}" placeholder="Compte de test : t1@exemple.test" disabled>`).join('')}
    <div class="rang" style="gap:8px;margin-top:10px"><button class="btn btn-secondaire btn-petit" type="button" data-enregistrer-identifiants>Enregistrer les identifiants</button></div>
    ${ancienBloc ? `<div data-ancien-identifiants style="margin-top:12px">
      <p class="aide">L'ancien bloc commun, lisible de tous les testeurs et du client. Ressaisissez-le testeur par testeur, puis videz-le.</p>
      <p class="t-petit" style="white-space:pre-wrap;margin:6px 0;padding:6px 8px;border-radius:8px;background:var(--fond-2)">${echapper(ancienBloc)}</p>
      <button class="btn btn-fantome btn-petit" type="button" data-vider-ancien>Vider l'ancien bloc</button>
    </div>` : ''}
  </div>` : '';

  const m = modale({
    titre: c.titre || 'Campagne', sousTitre: `${(STATUTS_CAMPAGNE[c.statut] || {}).libelle || ''} · ${pluriel(dedans.length, 'scénario', 'scénarios')}`,
    feuille: true,
    corps: `
      <div class="rang chiffres-tests" style="margin-bottom:18px">
        <div class="chiffre"><span class="chiffre-valeur">${dedans.length}</span><span class="chiffre-nom">scénarios</span></div>
        <div class="chiffre"><span class="chiffre-valeur">${socleRegle ? passagesConfies : dedans.length + doubles}</span><span class="chiffre-nom">${socleRegle ? 'passages confiés' : surPlan ? 'passages' : 'passages mobiles'}</span></div>
        <div class="chiffre"><span class="chiffre-valeur">${(c.testeurs || []).length}</span><span class="chiffre-nom">testeurs</span></div>
        ${socleRegle && equipe && Number.isFinite(bilanRepartition.laissesAuxRobots) ? `<div class="chiffre" data-chiffre-robots><span class="chiffre-valeur">${bilanRepartition.laissesAuxRobots}</span><span class="chiffre-nom">laissés aux robots</span></div>` : ''}
      </div>
      ${socleRegle && equipe ? `<p class="aide" data-regle-socle style="margin:-6px 0 14px">Socle de ${pluriel((c.socle || []).length, 'scénario', 'scénarios')}, fait par tous. Plafond de ${plafondDe(c)} tests par testeur, soit ${Math.round(plafondDe(c) * MINUTES_PAR_TEST / 6) / 10} h. Le reste, une fois chacun, par priorité.${(c.retraits || []).length ? ` ${pluriel(c.retraits.length, 'passage retiré', 'passages retirés')} (bug déjà connu, ou déjà vert chez les robots sur le web).` : ''}</p>` : ''}

      ${lancementHtml}

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
          <div style="padding:8px 10px;border-radius:10px;background:var(--fond-2)">
            <div class="rang" style="justify-content:space-between">
              <span>${echapper(t.nom)}${t.mobile ? ` <span class="puce puce--mini">${echapper(NOMS_PLATEFORMES[t.mobile] || t.mobile)}</span>` : ''}${nommer(t.id).traits ? ` <span class="t-micro t-3" data-profil>${echapper(nommer(t.id).traits)}</span>` : ''}</span>
              <span class="rang" style="gap:10px;align-items:center">
                ${!equipe ? '' : t.accueil ? '<span class="pastille pastille--vert" title="A parcouru l\'accueil de son espace">Premiers pas faits</span>' : '<span class="t-micro t-3">premiers pas à faire</span>'}
                ${!equipe ? '' : `<span class="t-micro ${t.avisApres ? 't-ok' : 't-3'}" data-a-repondu="${t.avisApres ? 'oui' : 'non'}" title="Ses réponses sont anonymes : on sait seulement s'il a répondu">Avis : ${t.avisApres ? 'oui' : (t.avisAvant ? 'première impression seulement' : 'non')}</span>`}
                <span class="t-micro">${t.n ? pluriel(t.n, 'passage', 'passages') : 'rien encore'}</span>
              </span>
            </div>
            ${(t.termine || t.fin) ? `<div class="rang" style="justify-content:space-between;margin-top:6px;gap:10px;flex-wrap:wrap">
              ${etatAccesHtml(t)}
              ${equipe ? `<span class="rang" style="gap:6px">
                <button class="btn btn-fantome btn-petit" type="button" data-prolonger="${echapper(t.id)}" title="Sept jours de plus">Prolonger de 7 jours</button>
                ${t.fin && t.fin.getTime() > Date.now() ? `<button class="btn btn-fantome btn-petit" type="button" data-clore="${echapper(t.id)}">Clore l'accès</button>` : ''}
              </span>` : ''}
            </div>` : ''}
            ${equipe && t.noteTest ? `<p class="t-petit" style="margin:6px 0 0">Note du test : <b>${echapper(String(t.noteTest.note))}/5</b>${equipe && t.noteTest.commentaire ? ` · « ${echapper(String(t.noteTest.commentaire))} »` : ''}</p>` : ''}
            ${equipe && t.remarques.length ? `<div style="margin-top:8px">${t.remarques.map((r) => `<p class="t-petit" style="margin:4px 0;padding:6px 8px;border-radius:8px;background:var(--fond-3)">${echapper(String(r.texte || ''))}${enDate(r.le) ? ` <span class="t-micro t-3">· ${echapper(jourCourt(enDate(r.le)))}</span>` : ''}</p>`).join('')}</div>` : ''}
          </div>`).join('')}</div>`
          : `<p class="aide">Aucun testeur pour l'instant. ${equipe ? (vivier.length ? 'Choisissez-les ci-dessous.' : 'La liste des testeurs est vide : le serveur seul y inscrit quelqu\'un.') : 'Ils apparaîtront ici dès qu\'ils seront choisis.'}</p>`}
      </div>

      ${identifiantsHtml}

      ${resultatsHtml(c, { dedans, nommer })}

      ${equipe && vivier.length ? `<div class="groupe">
        <span class="etiquette-champ">La liste des testeurs</span>
        <div class="cases-blocs">${vivier.map((t) => `
          <label class="case"><input type="checkbox" data-testeur="${echapper(t.id)}" ${(c.testeurs || []).includes(t.id) ? 'checked' : ''}> ${echapper(t.prenom || t.email || t.id)}${t.mobile ? ` · ${echapper((PLATEFORMES_TEST[t.mobile] || {}).court || t.mobile)}` : ''}</label>`).join('')}</div>
        <p class="aide">${socleRegle || (surPlan && (c.statut || 'preparation') === 'preparation') ? 'Chacun fait son téléphone et le web. Le socle chez tous, le reste une fois chacun, par priorité, jusqu\'au plafond. Répartir montre la charge de chacun avant d\'enregistrer.' : 'Chacun fait son téléphone et le web. Un passage « humain seul » part chez deux testeurs, un passage « humain et robot » chez un seul. Répartir montre la charge de chacun avant d\'enregistrer.'}</p>
      </div>` : ''}`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>
      <button class="btn btn-secondaire" type="button" data-voir-avis>${icone('coeur')} Leur avis</button>
      ${equipe ? `<button class="btn ${lancable ? 'btn-secondaire' : 'btn-principal'}" type="button" data-repartir>${icone('eclair')} Répartir</button>` : ''}
      ${equipe && enPreparation && surPlan ? `<button class="btn btn-principal" type="button" data-lancer${lancable ? '' : ' disabled'}>Lancer la campagne</button>` : ''}`,
  });

  brancherPieces(m.el);

  /* Les identifiants : lus à l'ouverture, écrits seulement s'ils ont
     changé. Un champ qui n'a pas pu être lu reste fermé : l'écraser à
     l'aveugle effacerait ce qu'un collègue a posé. */
  const lus = new Map();
  const lusComptes = new Map();
  const champsIdent = [...m.el.querySelectorAll('[data-identifiants-de]')];
  const champCompte = (uid) => m.el.querySelector(`[data-compte-de="${CSS.escape(uid)}"]`);
  champsIdent.forEach(async (z) => {
    const uid = z.dataset.identifiantsDe;
    const zc = champCompte(uid);
    try {
      const f = await lireAcces(docAcces(bdd, 'projets', pid, 'campagnes', c.id, 'acces', uid));
      const v = f.exists() ? String((f.data() || {}).identifiants || '') : '';
      const vc = f.exists() ? String((f.data() || {}).compteTest || '') : '';
      lus.set(uid, v); z.value = v; z.disabled = false;
      lusComptes.set(uid, vc); if (zc) { zc.value = vc; zc.disabled = false; }
    } catch (e) { console.error(e); z.placeholder = 'Illisible pour l\'instant.'; }
  });
  const ecrireIdent = m.el.querySelector('[data-enregistrer-identifiants]');
  if (ecrireIdent) ecrireIdent.addEventListener('click', () => agir(ecrireIdent, async () => {
    const compteDe = (uid) => String((champCompte(uid) || {}).value || '').trim().toLowerCase();
    const changes = champsIdent.filter((z) => {
      const uid = z.dataset.identifiantsDe;
      return lus.has(uid) && (z.value.trim() !== lus.get(uid).trim() || compteDe(uid) !== (lusComptes.get(uid) || ''));
    });
    if (!changes.length) { toast('Rien n\'a changé.'); return; }
    /* Le compte de test : une adresse fictive, un seul testeur par compte. */
    const vus = new Map();
    for (const z of champsIdent) {
      const e = compteDe(z.dataset.identifiantsDe);
      if (!e) continue;
      if (!/^[a-z0-9._+-]{1,64}@exemple\.test$/.test(e)) { toast(`« ${e} » n'est pas un compte de test : une adresse @exemple.test.`, 'erreur'); return; }
      if (vus.has(e)) { toast(`« ${e} » est attribué à deux testeurs : un compte par testeur.`, 'erreur'); return; }
      vus.set(e, true);
    }
    for (const z of changes) {
      const uid = z.dataset.identifiantsDe;
      const v = z.value.trim().slice(0, 2000);
      const vc = compteDe(uid);
      await poserAcces(docAcces(bdd, 'projets', pid, 'campagnes', c.id, 'acces', uid), { identifiants: v, compteTest: vc, maj: heureServeur() });
      lus.set(uid, v); lusComptes.set(uid, vc);
    }
    toast(changes.length > 1 ? `Identifiants de ${changes.length} testeurs enregistrés.` : 'Identifiants enregistrés.');
  }));
  const viderAncien = m.el.querySelector('[data-vider-ancien]');
  if (viderAncien) viderAncien.addEventListener('click', () => agir(viderAncien, async () => {
    if (!(await confirmer({ titre: 'Vider l\'ancien bloc ?', texte: 'Les testeurs et le client ne le liront plus. Les identifiants posés testeur par testeur restent.', ok: 'Vider' }))) return;
    await ecrire.majCampagne(pid, c.id, { 'acces.identifiants': '' });
    toast('Ancien bloc vidé.');
    m.fermer(true);
  }));

  /* Lancer : la campagne passe « En cours », le début est daté si rien ne
     l'était. Le serveur prévient le client (hubCampagneEcrite). */
  const lancer = m.el.querySelector('[data-lancer]');
  if (lancer) lancer.addEventListener('click', () => agir(lancer, async () => {
    if (!lancable) { toast('Il manque encore quelque chose : voyez la liste.', 'erreur'); return; }
    await ecrire.majCampagne(pid, c.id, { statut: 'en-cours', ...(c.debut ? {} : { debut: new Date() }) });
    toast('Campagne lancée.');
    m.fermer(true);
  }));

  const voir = m.el.querySelector('[data-voir-avis]');
  if (voir) voir.addEventListener('click', () => agir(voir, async () => {
    /* Les avis de la campagne sont déjà dans le magasin, abonnés par la
       page : la feuille les lit tels quels, sans requête de plus. */
    await ouvrirAvis({ ...c, _avis: avisDe([c]), _notesTest: equipe ? notesTestDe([c]) : [], _recus: recusDe([c]), _remarques: remarquesDe([c], { equipe }) }, { nommer, equipe });
  }));

  /* L'accès d'un testeur après son test : prolonger de sept jours (depuis
     la date posée, ou depuis aujourd'hui si elle est passée), ou clore
     maintenant. La date vit sur la campagne, les règles la relisent. */
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-prolonger], [data-clore]');
    if (!b || !equipe) return;
    const uid = b.dataset.prolonger || b.dataset.clore;
    const t = charges.find((x) => x.id === uid);
    if (!t) return;
    await agir(b, async () => {
      const base = (b.dataset.prolonger && t.fin && t.fin.getTime() > Date.now()) ? t.fin.getTime() : Date.now();
      const fin = new Date(b.dataset.prolonger ? base + 7 * 24 * 3600 * 1000 : Date.now());
      try {
        await ecrire.majCampagne(pid, c.id, { [`fins.${uid}`]: fin });
        toast(b.dataset.prolonger ? `Accès de ${t.nom} prolongé jusqu'au ${jourCourt(fin)}.` : `Accès de ${t.nom} clos.`);
        m.fermer(true);
      } catch (e) { console.error(e); toast("La date n'a pas pu être changée.", 'erreur'); }
    });
  });

  /* Répartir : la règle de repartition.js, sur le plan de tests du projet
     (scénarios humains seuls). Rien n'est écrit avant l'aperçu : la charge
     de chacun, vague par vague, ce qui ne trouve personne, et ce que
     devient la répartition déjà en place. Les passages déjà consignés
     restent chez leur auteur. Le serveur inscrit ensuite chaque testeur
     au projet (hubCampagneEcrite), sans quoi il ne verrait rien. */
  const bouton = m.el.querySelector('[data-repartir]');
  if (bouton) bouton.addEventListener('click', () => agir(bouton, async () => {
    const ids = [...m.el.querySelectorAll('[data-testeur]')].filter((x) => x.checked).map((x) => x.dataset.testeur);
    if (!ids.length) { toast('Choisissez au moins un testeur.', 'erreur'); return; }
    const toutLePlan = scenariosHumains(ordonnerSections(await lireSectionsPlan(pid)));
    if (!toutLePlan.length) { toast('Le plan de tests de ce projet n\'a aucun scénario pour un humain.', 'erreur'); return; }
    /* Seulement ce que la campagne retient : ses sections, choisies dans
       la feuille. Une campagne d'avant le plan se passe d'abord sur le plan. */
    if (!estSurLePlan(c, toutLePlan)) { toast('Cette campagne reprend l\'ancienne bibliothèque : modifiez-la pour choisir les sections du plan, puis répartissez.', 'erreur'); return; }
    const scenariosPlan = toutLePlan.filter((s) => (c.scenarios || []).includes(s.id));
    /* La règle du socle pour toute campagne neuve ou en préparation ; une
       campagne lancée sous l'ancienne règle la garde jusqu'au bout. */
    const auSocle = regleSocle(c) || (c.statut || 'preparation') === 'preparation';
    const gens = ids.map((id) => {
      const t = vivier.find((x) => x.id === id) || {};
      const siennes = Array.isArray(t.plateformes) ? t.plateformes : [];
      return { id, mobile: t.mobile || '', web: !siennes.length || siennes.includes('web') };
    });
    const garder = {};
    passagesDe(c).forEach((x) => {
      if (!x.testeur || !x.scenario || !x.plateforme) return;
      (garder[x.testeur] = garder[x.testeur] || []).push(`${x.scenario}__${x.plateforme}`);
    });
    if (auSocle) { await apercuSocle({ c, pid, env, scenariosPlan, gens, garder, nommer, fermerFeuille: () => m.fermer(true) }); return; }
    const { affectation, manques, ecartes, attendus } = repartir(scenariosPlan, gens, { garder });
    const controle = controler(affectation, scenariosPlan);
    /* Un manque se voit et s'accepte ; un écart du contrôle qui n'est pas un
       manque annoncé (une clé en trop, une clé perdue) bloque l'écriture. */
    const bloque = controle.enTrop.length > 0 || controle.oubliees.length + controle.malCouvertes.length !== manques.length;
    const nom = (id) => nommer(id).nom;
    const PLAT = { ios: 'iPhone', android: 'Android', web: 'Web' };
    const charges = chargeParTesteur(affectation, scenariosPlan);
    const total = charges.reduce((n, x) => n + x.total, 0);
    const avant = Object.keys(c.affectation || {});
    const dejaFaits = passagesDe(c).length;
    const parPlateforme = (p) => manques.filter((x) => x.plateforme === p).length;
    const corps = `
      <p class="t-corps t-2" style="margin:0 0 14px">${pluriel(attendus, 'passage du plan', 'passages du plan')}, ${pluriel(total, 'affectation', 'affectations')} : un passage « humain seul » part chez deux testeurs, un passage « humain et robot » chez un seul. Chacun fait son téléphone et le web. La vague 1 réunit la priorité haute.</p>
      <table class="tableau" data-apercu-charges>
        <thead><tr><th>Testeur</th><th>Téléphone</th><th class="droite">Sur le téléphone</th><th class="droite">Web</th><th class="droite">Vague 1</th><th class="droite">Vague 2</th><th class="droite">Total</th></tr></thead>
        <tbody>${charges.map((x) => `<tr data-charge="${echapper(x.id)}"><td>${echapper(nom(x.id))}</td><td>${echapper(PLAT[x.telephone] || '-')}</td><td class="droite">${x.telephoneN}</td><td class="droite">${x.webN}</td><td class="droite">${x.vague1}</td><td class="droite">${x.vague2}</td><td class="droite"><b>${x.total}</b></td></tr>`).join('')}</tbody>
      </table>
      ${ecartes.length ? `<p class="aide" data-apercu-ecartes style="margin-top:12px">Sans téléphone dans sa fiche, donc laissé de côté : ${ecartes.map((id) => echapper(nom(id))).join(', ')}.</p>` : ''}
      ${manques.length ? `<p class="aide t-alerte" data-apercu-manques style="margin-top:12px">${pluriel(manques.length, 'passage n\'a', 'passages n\'ont')} pas tous ses testeurs${['ios', 'android', 'web'].filter(parPlateforme).map((p) => ` · ${PLAT[p]} : ${parPlateforme(p)}`).join('')}. Cochez un testeur de plus sur cette plateforme, ou acceptez ce manque.</p>` : ''}
      ${!bloque ? '' : '<p class="aide t-alerte" data-apercu-controle style="margin-top:12px">Le contrôle a trouvé un écart dans ce calcul. Rien ne sera enregistré.</p>'}
      ${avant.length ? `<p class="aide" data-apercu-ecrase style="margin-top:12px">Une répartition existe déjà (${pluriel(avant.length, 'testeur', 'testeurs')}${dejaFaits ? `, ${pluriel(dejaFaits, 'passage déjà consigné', 'passages déjà consignés')}, qui restent chez leur auteur` : ''}). Elle sera remplacée par celle-ci.</p>` : ''}`;
    const apercu = modale({
      titre: 'Aperçu de la répartition', sousTitre: c.titre || 'Campagne', large: true, corps,
      pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button>
        <button class="btn btn-principal" type="button" data-enregistrer-repartition ${bloque ? 'disabled' : ''}>${avant.length ? 'Remplacer la répartition' : 'Enregistrer la répartition'}</button>`,
    });
    const valider = apercu.el.querySelector('[data-enregistrer-repartition]');
    valider.addEventListener('click', () => agir(valider, async () => {
      await ecrire.majCampagne(pid, c.id, { testeurs: Object.keys(affectation), affectation });
      toast(`${total} passages répartis entre ${pluriel(Object.keys(affectation).length, 'testeur', 'testeurs')}.`);
      apercu.fermer(true);
      m.fermer(true);
    }));
    await apercu.fin;
  }));
  return m.fin;
};

/* -------------------------------------------------------------------------- */

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage(env.role === 'equipe' ? 'Tests' : 'Campagne de tests');
  filAriane([{ libelle: env.role === 'equipe' ? 'Tests' : 'Campagne de tests' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  const etat = {
    projet: lire(ctx, 'projet', ''),
    plateforme: lire(ctx, 'plateforme', ''),
    onglet: ongletValide(lire(ctx, 'onglet', '')),
    /* Les filtres de la liste des problèmes. */
    filtres: Object.fromEntries(FILTRES_PROBLEMES.map((f) => [f, lire(ctx, f, '')])),
  };

  let empreinte = '';
  /* Les lectures en groupe n'existent que côté équipe : les règles les lui
     réservent. Un client reçoit ses données sur les clés de ses projets, et
     s'abonner aux mauvaises laisse l'écran figé sur son premier rendu, sans
     la moindre erreur pour le dire. */
  /* Les avis et les passages du projet ouvert, campagne par campagne :
     abonnés quand la campagne apparaît, et comptés dans l'empreinte, sans
     quoi une réponse qui arrive ne redessinerait rien. */
  const boiteTableau = document.createElement('div');
  let tableau = null;
  let pidTableau = null;
  const campagnesSuivies = new Set();
  /* « campagne/testeur » : la note du test de chacun, pour l'équipe seule. */
  const retoursSuivis = new Set();
  /* L'avis anonyme : le compte de chaque moment, puis ses réponses une fois
     le seuil atteint (avant, les règles les refusent). */
  const avisSuivis = new Set();
  const clesSuivies = () => [
    ...(env.role === 'equipe'
      ? [K.projets, K.scenariosTous, K.campagnesToutes, K.anomaliesToutes, K.parcoursTous, K.reglesToutes, K.documentsTous, K.jalonsTous, K.montantsTous, K.testeurs, K.profils, K.ticketsTous]
      : [K.projets, ...(magasin.lire(K.projets) || (env.session || {}).projets || [])
          .flatMap((p) => [K.scenarios(p.id), K.campagnes(p.id), K.anomalies(p.id), K.parcours(p.id), K.regles(p.id), K.documents(p.id), K.jalons(p.id), K.montants(p.id), K.profilsTesteurs(p.id), K.planPresentation(p.id), K.tickets(p.id)])]),
    ...[...campagnesSuivies].flatMap((cid) => [...(env.role === 'equipe' ? [K.appreciations(cid)] : []), K.passages(cid), K.remarques(cid)]),
    ...avisSuivis,
    ...[...retoursSuivis].map((x) => K.retourTesteur(...x.split('/'))),
  ];

  /* Le projet ouvert : celui qu'on a choisi, ou le seul que le client ait.
     Le rendu et les gestes doivent lire la MÊME valeur, faute de quoi le
     bouton s'affiche et le clic ne fait rien, sans le moindre message. */
  const projetCourant = () => {
    if (etat.projet) return etat.projet;
    const p = magasin.lire(K.projets) || [];
    return env.role !== 'equipe' && p.length === 1 ? p[0].id : '';
  };

  /* Le fil d'Ariane de l'équipe suit le projet choisi : « Projets ›
     Atelier › Tests », comme les autres pages d'un projet (la retouche du
     Cockpit y ajoute l'accueil). Sans projet, ou pour le client, le fil
     reste celui de la page. Posé seulement quand il change : un projet
     choisi, son nom arrivé. */
  let filPose = '';
  const poserFil = (pid, nom) => {
    const fil = env.role === 'equipe' && pid && nom
      ? [{ libelle: 'Projets', chemin: '/projets' }, { libelle: nom, chemin: `/projets/${pid}` }, { libelle: 'Tests' }]
      : [{ libelle: env.role === 'equipe' ? 'Tests' : 'Campagne de tests' }];
    const cle = JSON.stringify(fil);
    if (cle === filPose) return;
    filPose = cle;
    filAriane(fil);
  };

  /* Une seule fonction pour toutes les clés : un dessin par tour, et le
     premier quand tout est là (voir « planifier », plus bas). */
  const redessiner = () => planifier();
  /* Le plan de tests du projet ouvert : la campagne y prend ses
     scénarios. Abonné comme les campagnes, quand le projet s'ouvre. */
  const plansSuivis = new Set();
  const clesDesPlans = () => [...plansSuivis].map((p) => K.planTests(p));
  const suivreCampagnes = () => {
    const pid = projetCourant();
    if (!pid) return;
    if (!plansSuivis.has(pid)) {
      plansSuivis.add(pid);
      lot.abonner(K.planTests(pid), () => collection(bdd, 'projets', pid, 'planTests'));
      lot.sur(K.planTests(pid), redessiner);
    }
    lireTout(env).campagnes.filter((c) => projetDe(c) === pid).forEach((c) => {
      if (env.role === 'equipe') {
        (c.testeurs || []).forEach((uid) => {
          const cle = `${c.id}/${uid}`;
          if (retoursSuivis.has(cle)) return;
          retoursSuivis.add(cle);
          lot.abonner(K.retourTesteur(c.id, uid), () => doc(bdd, 'projets', pid, 'campagnes', c.id, 'appreciations', uid, 'equipe', 'retour'));
          lot.sur(K.retourTesteur(c.id, uid), redessiner);
        });
      }
      MOMENTS_ENVOYES.forEach((m) => {
        const kc = K.avisCompteur(c.id, m);
        if (!avisSuivis.has(kc)) {
          avisSuivis.add(kc);
          lot.abonner(kc, () => doc(bdd, 'projets', pid, 'campagnes', c.id, 'avisAnonymes', m));
          lot.sur(kc, redessiner);
        }
        const kr = K.avisAnonymes(c.id, m);
        if (!avisSuivis.has(kr) && (Number((magasin.lire(kc) || {}).recus) || 0) >= SEUIL_AVIS) {
          avisSuivis.add(kr);
          lot.abonner(kr, () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'avisAnonymes', m, 'reponses'));
          lot.sur(kr, redessiner);
        }
      });
      if (campagnesSuivies.has(c.id)) return;
      campagnesSuivies.add(c.id);
      /* L'appréciation (traces, a répondu, note du test) : l'équipe seule.
         Le client ne la lit plus depuis l'avis anonyme. */
      if (env.role === 'equipe') {
        lot.abonner(K.appreciations(c.id), () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'appreciations'));
        lot.sur(K.appreciations(c.id), redessiner);
      }
      lot.abonner(K.passages(c.id), () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'passages'));
      lot.abonner(K.remarques(c.id), () => collection(bdd, 'projets', pid, 'campagnes', c.id, 'remarques'));
      lot.sur(K.passages(c.id), redessiner);
      lot.sur(K.remarques(c.id), redessiner);
    });
  };

  const rendre = (force = false) => {
    suivreCampagnes();
    const sceau = magasin.empreinte([...clesSuivies(), ...clesDesPlans()]) + '|' + etat.projet + '|' + etat.plateforme + '|' + etat.onglet + '|' + JSON.stringify(etat.filtres);
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    const d = lireTout(env);
    const nomProjet = (pid) => ((d.projets.find((p) => p.id === pid) || {}).nom || '');

    /* Un client qui n'a qu'un projet ne choisit rien : le sélecteur
       disparaît et son projet s'ouvre directement. */
    const seul = env.role !== 'equipe' && d.projets.length === 1 ? d.projets[0].id : '';
    const pid = projetCourant();
    poserFil(pid, nomProjet(pid));

    /* « Ce qui va être testé » : le plan de tests, section par section. En
       tête de page, avant tout le reste : c'est la première question d'un
       client (« qu'allez-vous vérifier ? »). L'équipe le voit toujours,
       elle y écrit ; le client dès que le plan d'un de ses projets existe
       (sa présentation suffit à le dire), sans quoi il ouvrirait une page
       vide. */
    const avecPlan = (id) => Boolean(magasin.lire(K.planPresentation(id)));
    const pidPlan = pid || (env.role === 'equipe' ? '' : ((d.projets.find((p) => avecPlan(p.id)) || {}).id || ''));
    const boutonPlan = (env.role === 'equipe' || (pid ? avecPlan(pid) : pidPlan))
      ? `<a class="btn btn-principal" href="#/tests/plan${pidPlan ? `?projet=${echapper(pidPlan)}` : ''}" data-plan-tests>${icone('liste')} Ce qui va être testé</a>`
      : '';

    sortie.innerHTML = `<div class="page">
      <header class="page-tete">
        <div>
          <h1>${env.role === 'equipe' ? 'Tests' : 'Campagne de tests'}</h1>
          <p class="chapo">${pid ? echapper(nomProjet(pid)) : `${pluriel(d.projets.length, 'projet', 'projets')}, ${pluriel(d.scenarios.filter((s) => s.actif !== false).length, 'scénario', 'scénarios')}`}</p>
        </div>
        ${boutonPlan ? `<div class="actions">${boutonPlan}</div>` : ''}
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
        ? unProjet(d, { pid, nomProjet, plateforme: etat.plateforme, equipe: env.role === 'equipe', onglet: etat.onglet, filtres: etat.filtres })
        : `<div id="tableau-ici"></div>
          ${alertes(d, { nomProjet, plateforme: etat.plateforme })}
          ${etage('etage-projets', 'Projets', `<b>${d.projets.length}</b> ${d.projets.length > 1 ? 'projets' : 'projet'}, <b>${d.campagnes.filter((c) => c.statut === 'en-cours').length}</b> ${d.campagnes.filter((c) => c.statut === 'en-cours').length > 1 ? 'campagnes en cours' : 'campagne en cours'}.`, avancement(d, { nomProjet, plateforme: etat.plateforme, equipe: env.role === 'equipe' }))}
          ${etage('etage-machine', 'Tests par robot', `<b>${(d.parcours || []).filter((x) => x.actif !== false).length + (d.regles || []).filter((x) => x.actif !== false).length}</b> tests par robot, tous projets confondus : <b>${(d.parcours || []).filter((x) => x.actif !== false).length}</b> utilisent l'app comme un humain, <b>${(d.regles || []).filter((x) => x.actif !== false).length}</b> vérifient des calculs.`, `${parcoursHtml(d, { pid: '', equipe: env.role === 'equipe', plateforme: etat.plateforme })}${reglesHtml(d, { pid: '', equipe: env.role === 'equipe' })}`)}
          ${env.role === 'equipe' ? etage('etage-gens', 'Testeurs', `<b>${(d.testeurs || []).length}</b> ${(d.testeurs || []).length > 1 ? 'testeurs inscrits' : 'testeur inscrit'}.`, vivierHtml(d, { equipe: true })) : ''}
          ${activite(d, { nomProjet, plateforme: etat.plateforme })}`}
    </div>`;

    /* Le tableau des tests : une section qui garde son élément, ses
       écoutes et son état (déplié ou non) quand la page se redessine. On
       la raccroche à sa place à chaque rendu. */
    const ici = sortie.querySelector('#tableau-ici');
    if (ici) {
      ici.replaceWith(boiteTableau);
      if (!tableau) tableau = monterTableau(boiteTableau, env, { projet: projetCourant, plateforme: () => etat.plateforme, ouvrirProbleme: (id, pid) => ouvrirProblemeParId(id, pid) });
      else if (`${pid}|${etat.plateforme}` !== pidTableau) tableau.rafraichir();
      pidTableau = `${pid}|${etat.plateforme}`;
    }

    reglerBarreOnglets(sortie.querySelector('#onglets-tests'));

    const sel = sortie.querySelector('#f-projet');
    /* Changer de projet ou de plateforme, c'est changer d'adresse : le
       routeur nous redonne la main par `maj`, qui redessine une seule fois.
       Redessiner ici en plus faisait deux dessins par clic. */
    if (sel) sel.addEventListener('change', (e) => { poser({ projet: e.target.value, plateforme: etat.plateforme, onglet: '' }); });
  };

  /* La fiche d'une anomalie et ses gestes : trancher, créer le ticket,
     ouvrir la case de test, lire la note interne (équipe). */
  const ficheAnomalie = (a, pid) => {
    const equipe = env.role === 'equipe';
    const d = lireTout(env);
    const tickets = (d.tickets || []).filter((t) => t.projet === pid);
    const m = ouvrirAnomalie(a, { equipe, pid, env, scenarios: d.scenarios.filter((x) => projetDe(x) === pid), tickets });
    brancherPieces(m.el);
    let note = null;
    if (equipe) {
      const boite = m.el.querySelector('[data-note-interne]');
      getDoc(doc(bdd, 'projets', pid, 'anomalies', a.id, 'equipe', 'note'))
        .then((snap) => { note = snap.exists() ? snap.data() : null; if (boite) boite.insertAdjacentHTML('beforeend', noteHtml(note)); })
        .catch(() => { if (boite) boite.insertAdjacentHTML('beforeend', '<p class="aide">La note interne est illisible.</p>'); })
        .finally(() => { const attente = boite && boite.querySelector('p.aide'); if (attente && /Lecture de la note/.test(attente.textContent)) attente.remove(); });
    }
    sur(m.el, 'click', '[data-qualifier]', async () => { m.fermer(); await editer('anomalie', env, { pid, fiche: a }); });
    sur(m.el, 'click', '[data-statut-anomalie]', async (b) => {
      const statut = b.dataset.statutAnomalie;
      if (statut === (a.statut || 'nouvelle')) return;
      await agir(b, async () => {
        await ecrire.majAnomalie(pid, a.id, { statut });
        m.fermer();
      }, `Statut : ${(STATUTS_ANOMALIE[statut] || {}).libelle || statut}.`);
    });
    sur(m.el, 'click', '[data-creer-ticket]', async (b) => {
      await agir(b, async () => {
        const tid = await creerTicketProbleme(a, { pid, env, note });
        m.fermer();
        location.hash = `#/projets/${encodeURIComponent(pid)}/demandes/${encodeURIComponent(tid)}`;
      }, 'Ticket créé, la piste technique en note interne.');
    });
    sur(m.el, 'click', '[data-voir-case]', (b) => {
      m.fermer();
      if (tableau) tableau.ouvrirCase(b.dataset.voirCase);
    });
  };

  const ouvrirProblemeParId = (id, pid) => {
    const a = lireTout(env).anomalies.find((x) => x.id === id && projetDe(x) === pid);
    if (a) ficheAnomalie(a, pid);
  };

  brancherFrise(sortie, env);
  /* Les filtres de la liste des problèmes : un changement d'adresse, comme
     la plateforme. */
  const changeFiltre = (e) => {
    const sel = e.target.closest && e.target.closest('[data-filtre-probleme]');
    if (!sel) return;
    poser({ [sel.dataset.filtreProbleme]: sel.value, onglet: 'problemes' });
  };
  sortie.addEventListener('change', changeFiltre);
  const gestes = sur(sortie, 'click', '[data-info], [data-nouvelle-anomalie], [data-editer-anomalie], [data-action="ouvrir-anomalie"], [data-plateforme], [data-scenario], [data-plier-bugs], [data-plier-scenarios], [data-plier-parcours], [data-plier-regles], [data-plier-questions], [data-nouvelle-regle], [data-editer-regle], [data-nouvelle-campagne], [data-editer-campagne], [data-action="ouvrir-campagne"], [data-nouveau-testeur], [data-action="ouvrir-testeur"], [data-nouveau-parcours], [data-editer-parcours], [data-action="nouveau"][data-genre="scenario"], [data-voir-robots]', async (el, ev) => {
    /* Vue de tous les projets : les robots sont plus bas sur la même page.
       Pas d'ancre dans l'adresse (le routeur y verrait une autre vue). */
    if (el.hasAttribute('data-voir-robots')) {
      if (ev) ev.preventDefault();
      const cible = sortie.querySelector('#etage-machine');
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
    if (el.hasAttribute('data-plier-bugs')) {
      const boite = sortie.querySelector('#liste-bugs');
      if (!boite) return;
      bugsDeplies = boite.hidden;
      boite.hidden = !bugsDeplies;
      try { localStorage.setItem(CLE_BUGS, bugsDeplies ? '1' : '0'); } catch (e) { /* stockage refusé */ }
      const n = boite.querySelectorAll('.ligne').length;
      el.setAttribute('aria-expanded', String(bugsDeplies));
      el.innerHTML = `${icone(bugsDeplies ? 'plier' : 'deplier')} ${bugsDeplies ? 'Replier' : `Voir les ${pluriel(n, 'ligne', 'lignes')}`}`;
      return;
    }
    if (el.hasAttribute('data-plier-scenarios')) {
      const boite = sortie.querySelector('#bibliotheque');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? 'Voir la liste' : 'Replier'}`;
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
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? `Voir les ${pluriel(boite.querySelectorAll('.ligne').length, 'robot', 'robots')}` : 'Replier'}`;
      return;
    }
    /* Tant que personne n'a répondu, les 35 questions restent repliées :
       elles occupaient toute la page des testeurs pour ne rien dire encore. */
    if (el.hasAttribute('data-plier-questions')) {
      const boite = sortie.querySelector('#questions-avis');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? `Voir les ${boite.querySelectorAll('.avis-question').length} questions` : 'Replier'}`;
      return;
    }
    if (el.hasAttribute('data-plier-regles')) {
      const boite = sortie.querySelector('#catalogue-regles');
      if (!boite) return;
      const ouverte = !boite.hidden;
      boite.hidden = ouverte;
      el.setAttribute('aria-expanded', String(!ouverte));
      el.innerHTML = `${icone(ouverte ? 'deplier' : 'plier')} ${ouverte ? `Voir les ${pluriel(boite.querySelectorAll('.ligne').length, 'test de calcul', 'tests de calcul')}` : 'Replier'}`;
      return;
    }
    if (el.dataset.nouvelleRegle) { await editer('regle', env, { pid: el.dataset.nouvelleRegle }); return; }
    /* Un robot ou une règle vit dans son projet : sur la vue de tous les
       projets, aucun n'est choisi, et c'est le bouton qui dit lequel
       (« data-projet-robot » : « data-projet » est déjà la case à cocher
       des projets dans la fiche d'un testeur). */
    if (el.dataset.editerRegle) {
      const pid = el.dataset.projetRobot || projetCourant();
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
      const a = lireTout(env).anomalies.find((x) => x.id === el.dataset.id && projetDe(x) === pid);
      if (a) ficheAnomalie(a, pid);
      return;
    }
    if (el.dataset.nouvelleCampagne) { await editer('campagne', env, { pid: el.dataset.nouvelleCampagne, sections: sectionsDuPlan(el.dataset.nouvelleCampagne) }); return; }
    /* L'éditeur de scénario n'avait qu'une porte : l'état vide de l'onglet
       Tests d'un projet. La bibliothèque est ici, le bouton aussi. */
    if (el.dataset.action === 'nouveau' && el.dataset.genre === 'scenario') {
      const pid = projetCourant();
      if (pid) await editer('scenario', env, { pid });
      return;
    }
    if (el.dataset.nouveauParcours) { await editer('parcours', env, { pid: el.dataset.nouveauParcours }); return; }
    if (el.dataset.editerParcours) {
      const pid = el.dataset.projetRobot || projetCourant();
      const x = lireTout(env).parcours.find((y) => y.ref === el.dataset.editerParcours && projetDe(y) === pid);
      if (x) await editer('parcours', env, { pid, fiche: x });
      return;
    }
    if (el.hasAttribute('data-nouveau-testeur')) {
      await ouvrirTesteur(null, { env, projets: magasin.lire(K.projets) || [] });
      return;
    }
    /* Un clic sur un testeur ouvre sa fiche de suivi (invitation,
       connexions, avancement) ; le formulaire, par « Modifier ». */
    if (el.dataset.action === 'ouvrir-testeur') {
      const t = (magasin.lire(K.testeurs) || []).find((x) => x.id === el.dataset.id);
      if (!t) return;
      const projets = magasin.lire(K.projets) || [];
      await ouvrirSuiviTesteur(t, {
        campagnes: lireTout(env).campagnes,
        nomProjet: (pid) => (projets.find((p) => p.id === pid) || {}).nom || '',
        modifier: () => ouvrirTesteur(t, { env, projets }),
      });
      return;
    }
    if (el.dataset.action === 'ouvrir-campagne') {
      const pid = projetCourant();
      const d = lireTout(env);
      const c = d.campagnes.find((x) => x.id === el.dataset.id && projetDe(x) === pid);
      if (c) await ouvrirCampagne(c, { pid, env, scenarios: d.scenarios.filter((x) => projetDe(x) === pid), sections: sectionsDuPlan(pid), nommer: nommeur(d, { equipe: env.role === 'equipe', pid }) });
      return;
    }
    if (el.dataset.editerCampagne) {
      const pid = projetCourant();
      const c = lireTout(env).campagnes.find((x) => x.id === el.dataset.editerCampagne && projetDe(x) === pid);
      if (c) await editer('campagne', env, { pid, fiche: c, sections: sectionsDuPlan(pid) });
      return;
    }
    poser({ projet: etat.projet, plateforme: el.dataset.plateforme, onglet: etat.onglet === ONGLET_DEFAUT ? '' : etat.onglet });
  });

  /* La liste des projets d'un client peut grandir en cours de session, quand
     l'équipe lève un rideau. On réabonne alors les clés qui viennent
     d'apparaître, faute de quoi le nouveau projet n'arriverait jamais. */
  const suivies = new Set();
  /* Les clés du tableau aussi : leur arrivée doit réveiller le premier
     dessin de la page, qui les attend. Ensuite, elles ne changent pas
     l'empreinte de la page : pas de redessin pour rien. */
  const toutesLesCles = () => [...clesSuivies(), ...clesDesPlans(), ...(tableau ? tableau.cles() : [])];
  const suivre = () => {
    toutesLesCles().forEach((c) => {
      if (suivies.has(c)) return;
      suivies.add(c);
      lot.sur(c, surChangement);
    });
  };
  /* Le tableau des tests est dans les deux vues (un projet, tous les
     projets) : on le monte avant le premier dessin, dans sa boîte encore
     détachée, pour que la page n'apparaisse qu'une fois lui aussi prêt. */
  if (!tableau) tableau = monterTableau(boiteTableau, env, { projet: projetCourant, plateforme: () => etat.plateforme, ouvrirProbleme: (id, pid) => ouvrirProblemeParId(id, pid) });
  /* Tout est là quand aucune clé suivie (campagnes comprises) ni le tableau
     n'attend plus sa première valeur. */
  const clesAttendues = () => { suivreCampagnes(); suivre(); return toutesLesCles(); };
  /* Premier dessin quand tout est là, les suivants regroupés : la page se
     peint une fois, pas une fois par clé qui arrive. */
  const planifier = magasin.dessinateur(() => { suivre(); rendre(); }, 40, clesAttendues);
  const surChangement = () => { suivre(); planifier(); };
  suivre();
  planifier();

  /* Une notification mène droit à sa fiche : « ?anomalie= » ou
     « ?campagne= » dans l'adresse ouvre l'anomalie ou la campagne dès
     qu'elle est là, une seule fois. « ?testeur= » ouvre la fiche du
     testeur (lien depuis Messages › Testeurs), équipe seule : sur la vue
     de tous les projets, le vivier complet. */
  const aOuvrir = { anomalie: lire(ctx, 'anomalie', ''), campagne: lire(ctx, 'campagne', ''), testeur: env.role === 'equipe' ? lire(ctx, 'testeur', '') : '' };
  /* Une anomalie à ouvrir vit dans l'onglet Problèmes (toutes y sont, sans
     filtre), une campagne dans celui des tests humains. */
  const viserOnglet = () => {
    if (aOuvrir.anomalie) { etat.onglet = 'problemes'; FILTRES_PROBLEMES.forEach((f) => { etat.filtres[f] = ''; }); }
    else if (aOuvrir.campagne || aOuvrir.testeur) etat.onglet = ONGLET_DEFAUT;
  };
  viserOnglet();
  let essais = 0;
  let minuteurOuvrir = null;
  /* Ouverte, la fiche ne doit pas se rouvrir au filtre suivant : le
     paramètre quitte l'adresse (réécrite sur place, sans redessiner). Sans
     cela, un clic sur une plateforme, qui part de l'adresse courante,
     ramenait « &anomalie= » et rouvrait la fiche. */
  const oublierDansAdresse = () => {
    const brut = location.hash.replace(/^#/, '');
    const [chemin, chaine = ''] = brut.split('?');
    if (chemin !== '/tests') return;
    const p = new URLSearchParams(chaine);
    if (!p.has('anomalie') && !p.has('campagne') && !p.has('testeur')) return;
    p.delete('anomalie'); p.delete('campagne'); p.delete('testeur');
    /* L'adresse dit l'onglet et les filtres qu'on voit vraiment : une
       anomalie a mené à « Problèmes », sans filtre. */
    if (etat.onglet && etat.onglet !== ONGLET_DEFAUT) p.set('onglet', etat.onglet); else p.delete('onglet');
    FILTRES_PROBLEMES.forEach((f) => { if (etat.filtres[f]) p.set(f, etat.filtres[f]); else p.delete(f); });
    reecrire(`/tests${p.toString() ? `?${p.toString()}` : ''}`);
  };
  const ouvrirDepuisAdresse = () => {
    clearTimeout(minuteurOuvrir);
    if (!aOuvrir.anomalie && !aOuvrir.campagne && !aOuvrir.testeur) return;
    essais += 1;
    const cible = aOuvrir.anomalie ? `[data-action="ouvrir-anomalie"][data-id="${CSS.escape(aOuvrir.anomalie)}"]`
      : aOuvrir.campagne ? `[data-action="ouvrir-campagne"][data-id="${CSS.escape(aOuvrir.campagne)}"]`
        : `[data-action="ouvrir-testeur"][data-id="${CSS.escape(aOuvrir.testeur)}"]`;
    const el = sortie.querySelector(cible);
    if (el) { aOuvrir.anomalie = ''; aOuvrir.campagne = ''; aOuvrir.testeur = ''; oublierDansAdresse(); el.click(); return; }
    if (essais < 20) minuteurOuvrir = setTimeout(ouvrirDepuisAdresse, 500);
  };
  ouvrirDepuisAdresse();
  /* « ?case=<scénario du plan> » : la case de test s'ouvre dans le tableau,
     une fois qu'il est dessiné. */
  const caseAOuvrir = lire(ctx, 'case', '');
  if (caseAOuvrir) {
    let n = 0;
    const essayer = () => { n += 1; if (tableau && tableau.ouvrirCase(caseAOuvrir)) return; if (n < 20) setTimeout(essayer, 500); };
    setTimeout(essayer, 300);
  }

  return {
    fin: () => { clearTimeout(minuteurOuvrir); planifier.arreter(); gestes(); sortie.removeEventListener('change', changeFiltre); lot.fin(); if (tableau) tableau.fin(); },
    /* Même adresse, autres filtres : on lit le projet et la plateforme dans
       la nouvelle adresse et on redessine en place, sans squelette ni
       retour en haut de page. */
    maj: (suite) => {
      const projet = lire(suite, 'projet', '');
      const plateforme = lire(suite, 'plateforme', '');
      let onglet = ongletValide(lire(suite, 'onglet', ''));
      let filtres = Object.fromEntries(FILTRES_PROBLEMES.map((f) => [f, lire(suite, f, '')]));
      /* Une notification ouverte depuis une autre page Tests : la fiche
         qu'elle vise s'ouvre aussi, comme à l'arrivée (« ?anomalie= »,
         « ?campagne= » étaient ignorés sur place). */
      const anomalie = lire(suite, 'anomalie', '');
      const campagne = lire(suite, 'campagne', '');
      const testeur = env.role === 'equipe' ? lire(suite, 'testeur', '') : '';
      if (anomalie || campagne || testeur) {
        aOuvrir.anomalie = anomalie; aOuvrir.campagne = anomalie ? '' : campagne; aOuvrir.testeur = anomalie || campagne ? '' : testeur; essais = 0;
        if (anomalie) { onglet = 'problemes'; filtres = Object.fromEntries(FILTRES_PROBLEMES.map((f) => [f, ''])); }
        else onglet = ONGLET_DEFAUT;
        fermerFlottants();
      }
      if (projet === etat.projet && plateforme === etat.plateforme && onglet === etat.onglet && JSON.stringify(filtres) === JSON.stringify(etat.filtres)) { ouvrirDepuisAdresse(); return; }
      etat.filtres = filtres;
      const changeOnglet = onglet !== etat.onglet;
      etat.projet = projet;
      etat.plateforme = plateforme;
      etat.onglet = onglet;
      rendre(true);
      ouvrirDepuisAdresse();
      /* Changer d'onglet quand la barre est sortie de l'écran : on la
         ramène en haut, sinon l'en-tête reste exactement où il est. */
      const barre = sortie.querySelector('#onglets-tests');
      if (changeOnglet && barre && barre.getBoundingClientRect().top < 0) barre.scrollIntoView({ block: 'start', behavior: 'instant' });
    },
  };
};
