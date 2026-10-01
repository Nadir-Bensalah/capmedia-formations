/* ==========================================================================
   CAPMEDIA CLIENT HUB · le magasin
   Les données en temps réel, partagées entre les vues. Une clé, une requête
   Firestore, une écoute onSnapshot. Deux vues qui demandent la même clé
   partagent la même écoute ; la dernière à se retirer la referme.

     const arreter = abonner('taches:{projet}', () => query(...));
     sur('taches:{projet}', (taches) => rendre(taches));
     arreter();

   Les documents arrivent sous la forme { id, ...donnees }.
   ========================================================================== */

import { onSnapshot } from './noyau.js';

const entrees = new Map();

/* Une lecture en groupe rassemble les documents de tous les projets, et la
   donnée seule ne dit pas d'où elle vient : c'est le chemin qui le sait.
   On garde donc l'identifiant du parent, sous un nom que personne n'écrit
   en base, faute de quoi un scénario lu en groupe est orphelin. */
const parentDe = (ref) => {
  const p = ref && ref.parent && ref.parent.parent;
  return p ? p.id : '';
};

/* Une date posée par le serveur (« maj: serverTimestamp() ») n'est pas
   connue au moment où l'écriture part : par défaut, Firestore la livrait
   nulle dans l'instantané local, puis vraie dans celui du serveur. Deux
   instantanés différents, deux dessins, une date qui clignotait. On lit
   l'estimation locale : la date est là dès le premier, et le second ne
   diffère que de quelques millisecondes, ce que « memes » sait ignorer. */
const OPTIONS_LECTURE = { serverTimestamps: 'estimate' };
const normaliser = (instantane) => {
  if (typeof instantane.docs !== 'undefined') {
    return instantane.docs.map((d) => ({ id: d.id, ...d.data(OPTIONS_LECTURE), _parent: parentDe(d.ref) }));
  }
  return instantane.exists() ? { id: instantane.id, ...instantane.data(OPTIONS_LECTURE), _parent: parentDe(instantane.ref) } : null;
};

/* Deux valeurs sont les mêmes quand rien ne les distingue une fois
   déroulées : mêmes documents, mêmes champs, mêmes dates. Une valeur de
   Firestore (Timestamp, GeoPoint, Bytes) se compare par « isEqual » ; une
   référence, par son chemin ; ce qu'on ne sait pas comparer est tenu pour
   différent, ce qui redessine plutôt que d'oublier. Avec « tolerant », deux
   dates à moins d'une minute sont les mêmes : c'est l'estimation locale
   d'une marque du serveur, contre sa valeur vraie. */
const TOLERANCE_DATE_MS = 60000;
const memes = (a, b, tolerant = false) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (typeof a.toMillis === 'function' && typeof b.toMillis === 'function') {
    return (typeof a.isEqual === 'function' && a.isEqual(b)) || (tolerant && Math.abs(a.toMillis() - b.toMillis()) <= TOLERANCE_DATE_MS);
  }
  if (typeof a.isEqual === 'function') return typeof b.isEqual === 'function' && a.isEqual(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => memes(x, b[i], tolerant));
  }
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.prototype && proto !== null) return typeof a.path === 'string' && a.path === b.path;
  const ka = Object.keys(a); const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && memes(a[k], b[k], tolerant));
};

/* Pose une nouvelle valeur sur une clé, et ne réveille les écoutes que si
   elle change quelque chose. Le serveur confirme chaque écriture locale par
   un instantané qui, le plus souvent, ne dit rien de neuf : le magasin le
   garde (c'est la valeur vraie) mais ne le rediffuse pas, et l'écran ne se
   redessine pas pour rien. Ceux qui attendaient la première valeur sont
   servis dans tous les cas. */
const poser = (cle, e, valeur, { tolerant = false } = {}) => {
  const pareil = e.chargee && !e.erreur && memes(e.valeur, valeur, tolerant);
  e.valeur = valeur; e.chargee = true; e.erreur = null;
  if (!pareil) { diffuser(cle); return; }
  e.attentes.splice(0).forEach(({ ok }) => ok(e.valeur));
};

const obtenir = (cle) => {
  if (!entrees.has(cle)) {
    entrees.set(cle, { compte: 0, arreter: null, valeur: undefined, chargee: false, erreur: null, enAttente: false, ecouteurs: new Set(), attentes: [] });
  }
  return entrees.get(cle);
};

const diffuser = (cle) => {
  const e = entrees.get(cle);
  if (!e) return;
  e.ecouteurs.forEach((fn) => { try { fn(e.valeur, e.erreur); } catch (err) { console.error(`[magasin] écouteur de « ${cle} »`, err); } });
  e.attentes.splice(0).forEach(({ ok, ko }) => (e.erreur ? ko(e.erreur) : ok(e.valeur)));
};

/**
 * Ouvre l'écoute d'une clé. `fabrique` renvoie une requête ou une référence
 * de document. Renvoie une fonction qui retire cet abonné.
 */
export const abonner = (cle, fabrique) => {
  const e = obtenir(cle);
  e.compte += 1;
  if (!e.arreter) {
    /* Un souvenir qui s'était terminé sur une erreur ne vaut rien : on
       repart de zéro plutôt que de montrer un écran d'accès refusé périmé. */
    if (e.erreur) { e.valeur = undefined; e.chargee = false; e.erreur = null; }
    try {
      e.arreter = onSnapshot(
        fabrique(),
        (inst) => {
          /* Si l'instantané d'avant portait une écriture locale encore en
             route, celui-ci en est sans doute la confirmation : ses dates
             du serveur ne diffèrent de l'estimation que de quelques
             millisecondes, on les tient pour les mêmes. */
          const tolerant = e.enAttente;
          e.enAttente = Boolean(inst.metadata && inst.metadata.hasPendingWrites);
          poser(cle, e, normaliser(inst), { tolerant });
        },
        (err) => {
          // Un accès refusé est un cas prévu (adresse d'un projet qui n'est pas
          // le sien) : on le note sans crier. Le reste est une vraie panne.
          if (err && err.code === 'permission-denied') {
            console.warn(`[magasin] accès refusé sur « ${cle} »`);
            /* L'accès vient d'être retiré : ce qui restait en mémoire n'est
               plus à nous. On vide, sinon l'écran continue d'afficher un
               projet auquel on n'a plus droit jusqu'au rechargement. Une
               panne de réseau, elle, garde sa valeur : l'écran ne doit pas
               se vider à la première coupure. */
            e.valeur = Array.isArray(e.valeur) ? [] : null;
          } else console.error(`[magasin] écoute de « ${cle} » en échec`, err);
          e.erreur = err; e.chargee = true; diffuser(cle);
        },
      );
    } catch (err) {
      e.erreur = err; e.chargee = true; diffuser(cle);
    }
  }
  let retire = false;
  return () => {
    if (retire) return;
    retire = true;
    e.compte -= 1;
    if (e.compte <= 0) {
      /* La dernière vue part : l'écoute se referme, mais la valeur reste en
         souvenir. Au retour sur la page, elle se dessine d'un coup avec ce
         souvenir, et l'instantané qui suit ne la redessine que s'il change
         quelque chose. Sans lui, chaque retour peignait d'abord une page
         vide ou un squelette, puis la vraie page une image plus tard. */
      if (e.arreter) e.arreter();
      e.arreter = null;
      e.compte = 0;
      e.enAttente = false;
    }
  };
};

/** La valeur courante, ou undefined tant que rien n'est arrivé. */
export const lire = (cle) => (entrees.get(cle) || {}).valeur;

export const chargee = (cle) => Boolean((entrees.get(cle) || {}).chargee);

/* Une clé « en route » : quelqu'un l'écoute (ou la dérive) et sa première
   valeur n'est pas encore arrivée. Une clé que personne n'a demandée n'est
   pas en route : elle ne retient aucun dessin. */
export const enRoute = (cle) => {
  const e = entrees.get(cle);
  return Boolean(e) && !e.chargee && (Boolean(e.arreter) || e.compte > 0);
};

/** Vrai quand aucune des clés n'est encore en route. */
export const pretes = (cles) => cles.every((c) => !enRoute(c));

/** L'erreur d'une clé, ou null. Un accès refusé vaut mieux qu'un écran qui attend. */
export const erreur = (cle) => (entrees.get(cle) || {}).erreur || null;

/* Ce qui distingue deux versions d'un document. La date de modification ne
   suffit pas : une pièce comptable n'a pas de « maj », et son statut change
   sans que rien d'autre bouge. Un devis accepté, une facture payée, un
   fichier archivé ne redessinaient donc pas l'écran tant qu'un autre
   document ne changeait pas. */
/* Un passage n'a pas de « maj » mais une date « le », une présence un
   « vu » ; un parcours change d'« etat », et passe « en cours » quand un
   robot le joue. Sans eux, un OK qui remplaçait un KO sous le même
   identifiant ne redessinait pas le tableau des tests. */
const marque = (v) => {
  if (!v) return '';
  const t = v.maj || v.le || v.vu || v.date || v.cree;
  const quand = t && typeof t.seconds === 'number' ? `${t.seconds}.${t.nanoseconds || 0}` : '';
  const etat = `${v.statut || ''}${v.etat || ''}${v.resultat || ''}${v.enCours ? '~' : ''}${v.aRevoir ? '^' : ''}${v.archive ? '!' : ''}`;
  return etat ? `${quand}:${etat}` : quand;
};

/**
 * Une empreinte courte de plusieurs clés : identifiants et dates de
 * modification. Deux empreintes égales, c'est un redessin inutile.
 */
export const empreinte = (cles) => cles.map((cle) => {
  const e = entrees.get(cle);
  if (!e) return '';
  const v = e.valeur;
  if (Array.isArray(v)) return `${cle}=${v.length}:${v.map((x) => `${x.id}${marque(x)}`).join(',')}`;
  return `${cle}=${v ? `${v.id}${marque(v)}${JSON.stringify(v.pulse || '')}${v.statut || ''}${v.progression ? JSON.stringify(v.progression) : ''}` : 'x'}${e.erreur ? '!' : ''}`;
}).join('|');

/** Écoute une clé. Appelle tout de suite si une valeur existe déjà. */
export const sur = (cle, fn) => {
  const e = obtenir(cle);
  e.ecouteurs.add(fn);
  if (e.chargee) { try { fn(e.valeur, e.erreur); } catch (err) { console.error(err); } }
  return () => e.ecouteurs.delete(fn);
};

/**
 * Réveille les écoutes d'une clé sans rien changer à sa valeur.
 *
 * Sert quand une donnée dont dépend une vue arrive sur une autre clé que
 * celles qu'elle écoute : un projet ouvert en direct amène ses pièces sur
 * des clés nées après le montage de l'écran, qui ne pouvait donc pas les
 * connaître. Plutôt que de faire relire le monde à chaque vue, on frappe
 * à la porte de celles qui écoutaient déjà la liste des projets.
 */
export const reveiller = (cle) => {
  const e = entrees.get(cle);
  if (!e || !e.chargee) return;
  e.ecouteurs.forEach((fn) => { try { fn(e.valeur, e.erreur); } catch (err) { console.error(err); } });
};

/** Attend la première valeur d'une clé (déjà abonnée). */
export const attendre = (cle) => {
  const e = obtenir(cle);
  if (e.chargee) return e.erreur ? Promise.reject(e.erreur) : Promise.resolve(e.valeur);
  return new Promise((ok, ko) => e.attentes.push({ ok, ko }));
};

export const pret = (cles) => Promise.all(cles.map(attendre));

/**
 * Une clé calculée à partir d'autres : sa valeur est refaite à chaque
 * changement de l'une de ses sources. Sert au cockpit d'un agent, qui ne
 * lit pas « toutes les demandes » d'un coup (les règles le lui refusent)
 * mais celles de chacun de ses projets : la clé globale que lisent les
 * écrans est alors l'assemblage des clés par projet.
 * Renvoie une fonction qui retire la dérivation.
 */
export const deriver = (cle, sources, calcul) => {
  const e = obtenir(cle);
  e.compte += 1;
  const recalculer = () => {
    if (!sources.every((s) => chargee(s))) return;
    let valeur;
    try { valeur = calcul(); } catch (err) { e.erreur = err; e.chargee = true; diffuser(cle); return; }
    /* Une source qui bouge ne change pas toujours l'assemblage : on ne
       réveille alors personne. */
    poser(cle, e, valeur);
  };
  const retraits = sources.map((s) => sur(s, recalculer));
  if (!sources.length) { e.valeur = calcul(); e.chargee = true; diffuser(cle); }
  else recalculer();
  let retire = false;
  return () => {
    if (retire) return;
    retire = true;
    retraits.forEach((r) => r());
    e.compte -= 1;
    /* Plus personne n'écoute ni n'est abonné : la valeur reste en souvenir (voir abonner). */
  };
};

/**
 * Le dessin d'une vue au fil des données. Le premier dessin part en
 * microtâche, avant le premier affichage : quand la donnée est déjà là au
 * montage, le squelette n'est jamais peint et la page n'apparaît qu'une
 * fois. Les appels qui suivent immédiatement (les clés du magasin qui se
 * réveillent au montage, dans la même foulée) sont absorbés par ce premier
 * dessin ; plus tard, les changements sont regroupés par un court délai.
 *
 * `cles` (un tableau, ou une fonction qui le renvoie, ou une fonction qui
 * répond vrai quand tout est là) : le premier dessin attend que plus aucune
 * de ces clés ne soit en route. Dessiner avec la moitié de la donnée, puis
 * redessiner avec le reste, c'est la page qui se rend deux fois : on garde
 * le squelette et on dessine une seule fois, tout arrivé. Chaque clé qui se
 * charge rappelle « planifier » ; au-delà de `patience`, on dessine avec ce
 * qu'on a.
 *
 *   const planifier = dessinateur(rendre, 40, cles);
 *   cles.forEach((c) => lot.sur(c, planifier)); planifier();
 *   fin : planifier.arreter();
 */
export const dessinateur = (dessiner, delai = 40, cles = null, patience = 1500) => {
  let minuteur = null;
  let garde = null;
  let dessine = false;
  let prevu = false;
  let absorbe = false;
  let enAttente = false;
  let arrete = false;
  let patient = true;
  const liste = () => {
    if (!cles) return [];
    const r = Array.isArray(cles) ? cles : cles();
    return Array.isArray(r) ? r : [];
  };
  const pret = () => {
    if (!cles) return true;
    const r = Array.isArray(cles) ? cles : cles();
    return Array.isArray(r) ? pretes(r) : Boolean(r);
  };
  const planifier = () => {
    if (arrete) return;
    if (!dessine) {
      if (prevu) return;
      prevu = true;
      queueMicrotask(() => {
        prevu = false;
        if (arrete || dessine) return;
        if (patient && !pret()) {
          if (!garde) {
            garde = setTimeout(() => {
              garde = null; patient = false;
              /* On dessine avec ce qu'on a, et on dit ce qui manquait :
                 une clé qui n'arrive jamais est un défaut à corriger. */
              console.warn('[magasin] dessin sans attendre, clés encore en route :', liste().filter(enRoute).join(', ') || '(inconnues)');
              planifier();
            }, patience);
          }
          return;
        }
        clearTimeout(garde); garde = null;
        dessine = true;
        /* Ce qui arrive dans la même foulée n'a pas besoin d'un second
           dessin : la tâche suivante rouvre la porte. */
        absorbe = true;
        setTimeout(() => { absorbe = false; if (enAttente) { enAttente = false; planifier(); } }, 0);
        try { dessiner(); } catch (err) { console.error('[magasin] dessin', err); }
      });
      return;
    }
    if (absorbe) { enAttente = true; return; }
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { if (!arrete) { try { dessiner(); } catch (err) { console.error('[magasin] dessin', err); } } }, delai);
  };
  planifier.arreter = () => { arrete = true; clearTimeout(minuteur); clearTimeout(garde); };
  /* Vrai une fois le premier dessin fait. */
  planifier.dessine = () => dessine;
  return planifier;
};

/** Ferme tout. Utile au changement de session. */
export const fermerTout = () => {
  entrees.forEach((e) => { if (e.arreter) e.arreter(); });
  entrees.clear();
};

/**
 * Un lot d'abonnements et d'écoutes pour une vue : on les retire tous d'un
 * coup au départ. `lot.abonner(cle, fabrique)`, `lot.sur(cle, fn)`, `lot.fin()`.
 *
 * Une vue branche souvent la même fonction de dessin sur plusieurs clés.
 * Au montage, chaque clé déjà chargée l'appelait aussitôt, l'une après
 * l'autre : trois clés, trois reconstructions de la page à la suite, et
 * l'impression qu'elle charge deux fois. Ici, la même fonction n'est
 * appelée qu'une fois par tour, quel que soit le nombre de clés qui la
 * réveillent d'un coup (une microtâche plus tard : avant tout affichage).
 * Elle reçoit la dernière valeur venue. Une fois le lot fini, rien ne
 * dessine plus dans une vue partie.
 */
export const lot = () => {
  const retraits = [];
  const groupes = new Map();
  let vivant = true;
  const grouper = (fn) => {
    if (groupes.has(fn)) return groupes.get(fn);
    let prevu = false; let derniers = [];
    const groupe = (...args) => {
      derniers = args;
      if (prevu) return;
      prevu = true;
      queueMicrotask(() => {
        prevu = false;
        if (!vivant) return;
        try { fn(...derniers); } catch (err) { console.error('[magasin] écouteur d\'un lot', err); }
      });
    };
    groupes.set(fn, groupe);
    return groupe;
  };
  return {
    abonner(cle, fabrique) { retraits.push(abonner(cle, fabrique)); return this; },
    sur(cle, fn) { vivant = true; retraits.push(sur(cle, grouper(fn))); return this; },
    ajouter(fn) { retraits.push(fn); return this; },
    fin() { vivant = false; retraits.splice(0).forEach((r) => { try { r(); } catch (e) { /* rien */ } }); },
  };
};
