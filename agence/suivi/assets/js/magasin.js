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

const normaliser = (instantane) => {
  if (typeof instantane.docs !== 'undefined') {
    return instantane.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return instantane.exists() ? { id: instantane.id, ...instantane.data() } : null;
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
          if (err && err.code === 'permission-denied') console.warn(`[magasin] accès refusé sur « ${cle} »`);
          else console.error(`[magasin] écoute de « ${cle} » en échec`, err);
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

const marque = (v) => {
  if (!v) return '';
  const t = v.maj || v.date || v.cree;
  return t && typeof t.seconds === 'number' ? t.seconds : '';
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
