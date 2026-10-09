/* ==========================================================================
   CAPMEDIA TEST · la campagne côté Cockpit, sur le plan de tests

   Aucune lecture de base, aucun écran : tout arrive en paramètre, pour que
   chaque règle se prouve sans navigateur (campagne-cockpit.test.mjs).

   Le modèle :
   - les scénarios d'un testeur viennent du plan (projets/{p}/planTests),
     ceux dont « qui » vaut humain ou les-deux ;
   - une clé de passage est « scenarioId__plateforme » ;
   - l'affectation d'un testeur est { telephone, web, cles, vague } ;
     une ancienne campagne garde la sienne en simple liste de références,
     et se lit encore ici ;
   - « humain » seul se passe par deux testeurs différents, « les-deux »
     par un seul (un robot fait l'autre moitié).

   Le calcul de la répartition n'est pas ici (repartition.js) : ce module
   ne fait que préparer ce qu'on lui donne et juger ce qu'il rend. Une
   campagne « regle: 'socle' » (08/10/2026) se juge avec controlerSocle :
   le socle chez chacun, le reste une fois, le plafond tenu, ce qui ne
   rentre pas laissé aux robots.
   ========================================================================== */

import { controlerSocle, plafondDe, regleSocle, MINUTES_PAR_TEST } from './repartition.js';

export const QUI_HUMAINS = ['humain', 'les-deux'];
const ASPECTS = ['fonctionnel', 'technique', 'ux', 'securite'];
const PLATEFORMES = ['ios', 'android', 'web'];

/* Les mots que lisent l'équipe et le client. */
export const NOMS_PLATEFORMES = { ios: 'iPhone', android: 'Android', web: 'Web' };
export const VERDICTS = {
  reussi: { libelle: 'Réussi', voile: 'vert' },
  echec: { libelle: 'Échec', voile: 'rouge' },
  'sans-objet': { libelle: 'Sans objet', voile: 'gris' },
};
/* Les passages d'avant le 03/10/2026 disaient ok, ko, na. */
const ANCIENS = { ok: 'reussi', ko: 'echec', na: 'sans-objet' };
export const verdictDe = (resultat) => ANCIENS[resultat] || (VERDICTS[resultat] ? resultat : 'sans-objet');

export const cle = (scenarioId, plateforme) => `${scenarioId}__${plateforme}`;
export const scenarioDeCle = (c) => String(c || '').split('__')[0];
export const plateformeDeCle = (c) => String(c || '').split('__')[1] || '';

/* Les scénarios d'humains du plan, dans l'ordre des sections reçues. Les
   plateformes sont celles que le scénario déclare, comme dans la
   répartition (repartition.js, passagesAttendus) : un scénario qui n'en
   déclare aucune n'attend aucun passage. */
export const scenariosHumainsDuPlan = (sections = []) => {
  const vus = new Set();
  const sortie = [];
  (sections || []).forEach((s) => {
    if (!s || !s.aspects) return;
    ASPECTS.forEach((aspect) => ((s.aspects || {})[aspect] || []).forEach((sc) => {
      if (!sc || !sc.id || !QUI_HUMAINS.includes(sc.qui) || vus.has(sc.id)) return;
      vus.add(sc.id);
      const propres = (sc.plateformes || []).filter((p) => PLATEFORMES.includes(p));
      sortie.push({
        id: sc.id, ref: sc.id, titre: sc.titre || '', qui: sc.qui, priorite: sc.priorite || '', type: sc.type || '',
        plateformes: propres, parcours: Array.isArray(sc.parcours) ? sc.parcours.slice() : [],
        section: s.id, sectionTitre: s.titre || s.id || '', groupe: s.groupe || '', aspect,
      });
    }));
  });
  return sortie;
};

/* Une campagne est « sur le plan » quand elle le dit, ou quand l'une de
   ses références est un scénario du plan. Sinon c'est une campagne
   d'avant, sur l'ancienne bibliothèque, lisible en historique. */
export const estSurLePlan = (c, humains = []) => {
  if (!c) return false;
  if (c.plan === true) return true;
  const ids = new Set(humains.map((x) => x.id));
  return (c.scenarios || []).some((r) => ids.has(r));
};

/* Les sections cochées à l'ouverture de la feuille : toutes pour une
   campagne neuve ; pour une campagne existante, celles dont elle retient
   au moins un scénario, et rien d'autre. */
export const sectionsCochees = (fiche, humains = []) => {
  if (!fiche) return new Set(humains.map((x) => x.section));
  const pris = new Set(fiche.scenarios || []);
  return new Set(humains.filter((x) => pris.has(x.id)).map((x) => x.section));
};

/* Deux sélections égales, quel que soit l'ordre. */
export const memeSelection = (a = [], b = []) => {
  const x = new Set(a); const y = new Set(b);
  return x.size === y.size && [...x].every((r) => y.has(r));
};

/* La liste des références à enregistrer. Une campagne existante dont on
   n'a touché aucune case, ou dont la sélection revient au même, rend
   null : la feuille n'écrit pas « scenarios ». C'est ce qui empêche de
   remettre une campagne sur tous les scénarios en changeant un lien
   TestFlight ou en la passant à « Close ». */
export const scenariosAEcrire = ({ fiche, touche, choisies, avant }) => {
  if (fiche && (!touche || memeSelection(choisies, avant || []))) return null;
  return choisies.slice();
};

/* Les clés que la campagne attend, avec le nombre de testeurs qu'il faut
   sur chacune. */
export const clesAttendues = (humains = []) => {
  const m = new Map();
  humains.forEach((x) => (x.plateformes || []).forEach((p) => {
    m.set(cle(x.id, p), x.qui === 'humain' ? 2 : 1);
  }));
  return m;
};

/* Les clés d'un testeur, quelle que soit la forme de son affectation. */
export const clesDe = (entree) => {
  if (Array.isArray(entree)) return entree.slice();
  if (entree && Array.isArray(entree.cles)) return entree.cles.slice();
  return [];
};
export const nombreDeCles = (affectation = {}) => Object.values(affectation || {}).reduce((n, e) => n + clesDe(e).length, 0);

/* Ce que vaut une affectation face à ce que la campagne attend :
   - oubliees : une clé que personne n'a ;
   - incompletes : une clé « humain » qu'un seul testeur a ;
   - enTrop : une clé que la campagne n'attend pas, ou confiée deux fois
     au même testeur, ou à plus de testeurs qu'il n'en faut ;
   - horsSysteme : une clé de téléphone confiée à un testeur qui a l'autre
     téléphone, ou une clé web à un testeur sans le web. */
export const bilanAffectation = (affectation = {}, humains = [], testeurs = []) => {
  const attendues = clesAttendues(humains);
  const compte = new Map();
  const enTrop = [];
  const horsSysteme = [];
  Object.entries(affectation || {}).forEach(([uid, entree]) => {
    const vues = new Set();
    const t = testeurs.find((x) => x.id === uid) || (entree && !Array.isArray(entree) ? { id: uid, telephone: entree.telephone, web: entree.web } : null);
    clesDe(entree).forEach((k) => {
      if (!attendues.has(k) || vues.has(k)) { enTrop.push(k); return; }
      vues.add(k);
      compte.set(k, (compte.get(k) || 0) + 1);
      const p = plateformeDeCle(k);
      if (t && ((p === 'web' && t.web === false) || (p !== 'web' && t.telephone !== undefined && t.telephone !== p))) horsSysteme.push(`${uid}:${k}`);
    });
  });
  const oubliees = []; const incompletes = [];
  attendues.forEach((requis, k) => {
    const n = compte.get(k) || 0;
    if (!n) oubliees.push(k);
    else if (n < requis) incompletes.push(k);
    else if (n > requis) enTrop.push(k);
  });
  return { attendues: attendues.size, oubliees, incompletes, enTrop, horsSysteme };
};

/* Les places de testeur (Nadir, 09/10/2026). Une place réserve le travail
   d'un testeur qui n'est pas encore choisi : « iPhone 1 », « Android 2 ».
   Elle vit dans la campagne (champ « places »), jamais dans la liste des
   testeurs : pas d'adresse, pas de compte, aucune lettre, aucun accès.
   La répartition la traite comme un testeur (son identifiant entre dans
   « testeurs » et « affectation »). Quand l'équipe a la vraie personne,
   le serveur (suiviAdmin, attribuerPlace) lui transfère les passages de
   la place tels quels, et l'invitation part à ce moment-là.
     places: { 'place-ios-1': { libelle, mobile: 'ios'|'android', web, rang,
               testeur?: uid, attribuee?: date } }
   Un identifiant de compte Firebase n'a jamais de tiret : « place-… » ne
   peut pas désigner une personne. */
export const PREFIXE_PLACE = 'place-';
export const estPlace = (id) => typeof id === 'string' && id.startsWith(PREFIXE_PLACE);
const RANG_MOBILE = { ios: 0, android: 1 };
export const placesDe = (c) => Object.entries((c && c.places) || {})
  .filter(([id, p]) => estPlace(id) && p && typeof p === 'object')
  .map(([id, p]) => ({ id, libelle: String(p.libelle || id), mobile: p.mobile || '', web: p.web !== false, rang: Number(p.rang) || 0, testeur: p.testeur || '' }))
  .sort((a, b) => (RANG_MOBILE[a.mobile] ?? 2) - (RANG_MOBILE[b.mobile] ?? 2) || a.rang - b.rang || a.id.localeCompare(b.id));
/* Une place sans testeur : elle bloque le lancement. */
export const placesVides = (c) => placesDe(c).filter((p) => !p.testeur);
/* Les places à ajouter : « nombre » par téléphone, numérotées après les
   existantes. Rend { id: place }, prêt à écrire sous « places ». */
export const nouvellesPlaces = (c, nombres = {}, { web = true } = {}) => {
  const existantes = placesDe(c);
  const sortie = {};
  ['ios', 'android'].forEach((m) => {
    const n = Math.max(0, Math.min(50, Math.floor(Number(nombres[m]) || 0)));
    let rang = Math.max(0, ...existantes.filter((p) => p.mobile === m).map((p) => p.rang));
    for (let i = 0; i < n; i += 1) {
      rang += 1;
      while ((c && c.places && c.places[`${PREFIXE_PLACE}${m}-${rang}`]) || sortie[`${PREFIXE_PLACE}${m}-${rang}`]) rang += 1;
      sortie[`${PREFIXE_PLACE}${m}-${rang}`] = { libelle: `${NOMS_PLATEFORMES[m]} ${rang}`, mobile: m, web: web !== false, rang };
    }
  });
  return sortie;
};

/* Le vivier proposé dans une campagne : les retirés n'y sont pas, ceux du
   projet viennent en premier. */
export const vivierPropose = (vivier = [], pid = '', dejaPris = []) => (vivier || [])
  .filter((t) => t.actif !== false || dejaPris.includes(t.id))
  .map((t, i) => ({ t, i, ici: (t.projets || []).includes(pid) ? 0 : 1 }))
  .sort((a, b) => a.ici - b.ici || a.i - b.i)
  .map((x) => x.t);

/* Avant le lancement : ce qui doit être vrai, ligne par ligne. La campagne
   ne part que si tout est vrai. */
/* Le jugement d'une campagne à la règle du socle, dans les mots de la
   liste « Prête à lancer ? ». */
const repartitionSocle = (c, dedans, repartie) => {
  const aff = c.affectation || {};
  const plafond = plafondDe(c);
  const ctl = controlerSocle(aff, dedans, { socle: c.socle || [], retraits: c.retraits || [], plafond });
  const n = (c.testeurs || []).length;
  const heures = Math.max(0, ...Object.keys(aff).map((u) => clesDe(aff[u]).length)) * MINUTES_PAR_TEST / 60;
  const ok = repartie && ctl.conforme;
  const detail = !repartie ? 'Personne n\'a encore de scénario.'
    : ctl.enTrop.length ? `${ctl.enTrop.length} ${ctl.enTrop.length > 1 ? 'passages en trop ou hors du téléphone et du web du testeur' : 'passage en trop ou hors du téléphone et du web du testeur'} : répartissez de nouveau.`
      : ctl.doublons.length ? `${ctl.doublons.length} ${ctl.doublons.length > 1 ? 'passages confiés' : 'passage confié'} deux fois hors du socle : répartissez de nouveau.`
        : ctl.socleManquant.length ? `Le socle manque chez un testeur (${ctl.socleManquant.length} ${ctl.socleManquant.length > 1 ? 'passages' : 'passage'}) : répartissez de nouveau.`
          : ctl.auDessus.length ? `${ctl.auDessus.length} ${ctl.auDessus.length > 1 ? 'testeurs dépassent' : 'testeur dépasse'} le plafond de ${plafond} tests.`
            : `${n} ${n > 1 ? 'testeurs' : 'testeur'}, ${nombreDeCles(aff)} passages, ${Math.round(heures * 10) / 10} h au plus chacun. ${ctl.laisses.length} ${ctl.laisses.length > 1 ? 'tests laissés' : 'test laissé'} aux robots.`;
  return { ok, detail };
};

export const pretALancer = (c = {}, { humains = [], testeurs = [] } = {}) => {
  const surPlan = estSurLePlan(c, humains);
  const retenus = new Set(c.scenarios || []);
  const dedans = humains.filter((x) => retenus.has(x.id));
  const aff = c.affectation || {};
  const bilan = bilanAffectation(aff, dedans, testeurs);
  const repartie = nombreDeCles(aff) > 0 && (c.testeurs || []).length > 0;
  const socle = regleSocle(c) ? repartitionSocle(c, dedans, repartie) : null;
  const inst = c.installation || {};
  const systemes = [...new Set(Object.values(aff).map((e) => (e && !Array.isArray(e) ? e.telephone : '')).filter(Boolean))];
  const liensManquants = systemes.filter((s) => !inst[s]);
  const places = placesDe(c);
  const vides = places.filter((p) => !p.testeur);
  return [
    { cle: 'scenarios', ok: surPlan && dedans.length > 0, libelle: 'Les scénarios du plan',
      detail: !surPlan ? 'La campagne reprend l\'ancienne bibliothèque : choisissez les sections du plan.' : `${dedans.length} ${dedans.length > 1 ? 'scénarios retenus' : 'scénario retenu'}.` },
    { cle: 'repartition', ok: socle ? socle.ok : repartie && !bilan.oubliees.length && !bilan.enTrop.length && !bilan.horsSysteme.length, libelle: 'Les testeurs, répartis',
      detail: socle ? socle.detail : !repartie ? 'Personne n\'a encore de scénario.' : bilan.oubliees.length ? `${bilan.oubliees.length} ${bilan.oubliees.length > 1 ? 'passages sans testeur' : 'passage sans testeur'}.` : bilan.enTrop.length ? `${bilan.enTrop.length} ${bilan.enTrop.length > 1 ? 'passages en trop' : 'passage en trop'} : répartissez de nouveau.` : bilan.horsSysteme.length ? `${bilan.horsSysteme.length} ${bilan.horsSysteme.length > 1 ? 'passages confiés' : 'passage confié'} hors du téléphone ou du web du testeur : répartissez de nouveau.` : `${(c.testeurs || []).length} ${(c.testeurs || []).length > 1 ? 'testeurs' : 'testeur'}, ${nombreDeCles(aff)} passages.` },
    ...(places.length ? [{ cle: 'places', ok: !vides.length, libelle: 'Les places de testeur',
      detail: vides.length ? `${vides.length} ${vides.length > 1 ? 'places sans testeur' : 'place sans testeur'} : attribuez-les avant de lancer.` : `${places.length} ${places.length > 1 ? 'places, chacune a son testeur' : 'place, elle a son testeur'}.` }] : []),
    { cle: 'installation', ok: repartie && !liensManquants.length && Boolean(inst.ios || inst.android || inst.web), libelle: 'Les liens d\'installation',
      detail: liensManquants.length ? `Il manque le lien ${liensManquants.map((s) => NOMS_PLATEFORMES[s] || s).join(' et ')}.` : (inst.ios || inst.android || inst.web) ? 'Chaque testeur a de quoi installer.' : 'Aucun lien pour l\'instant.' },
    { cle: 'presentation', ok: Boolean(String(c.application || '').trim()), libelle: 'La présentation aux testeurs',
      detail: String(c.application || '').trim() ? `« ${String(c.application).trim()} ».` : 'Le nom de l\'application manque.' },
  ];
};
