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

const normaliser = (instantane) => {
  if (typeof instantane.docs !== 'undefined') {
    return instantane.docs.map((d) => ({ id: d.id, ...d.data(), _parent: parentDe(d.ref) }));
  }
  return instantane.exists() ? { id: instantane.id, ...instantane.data(), _parent: parentDe(instantane.ref) } : null;
};

const obtenir = (cle) => {
  if (!entrees.has(cle)) {
    entrees.set(cle, { compte: 0, arreter: null, valeur: undefined, chargee: false, erreur: null, ecouteurs: new Set(), attentes: [] });
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
    try {
      e.arreter = onSnapshot(
        fabrique(),
        (inst) => { e.valeur = normaliser(inst); e.chargee = true; e.erreur = null; diffuser(cle); },
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
      if (e.arreter) e.arreter();
      entrees.delete(cle);
    }
  };
};

/** La valeur courante, ou undefined tant que rien n'est arrivé. */
export const lire = (cle) => (entrees.get(cle) || {}).valeur;

export const chargee = (cle) => Boolean((entrees.get(cle) || {}).chargee);

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

/** Ferme tout. Utile au changement de session. */
export const fermerTout = () => {
  entrees.forEach((e) => { if (e.arreter) e.arreter(); });
  entrees.clear();
};

/**
 * Un lot d'abonnements et d'écoutes pour une vue : on les retire tous d'un
 * coup au départ. `lot.abonner(cle, fabrique)`, `lot.sur(cle, fn)`, `lot.fin()`.
 */
export const lot = () => {
  const retraits = [];
  return {
    abonner(cle, fabrique) { retraits.push(abonner(cle, fabrique)); return this; },
    sur(cle, fn) { retraits.push(sur(cle, fn)); return this; },
    ajouter(fn) { retraits.push(fn); return this; },
    fin() { retraits.splice(0).forEach((r) => { try { r(); } catch (e) { /* rien */ } }); },
  };
};
