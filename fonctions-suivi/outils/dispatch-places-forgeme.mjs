/* ==========================================================================
   CAPMEDIA TEST · répartir la campagne ForgeMe sur six places de testeur
   (Nadir, 09/10/2026, « go dispatch »)

   Six testeurs prévus (trois iPhone, trois Android), pas encore nommés.
   Ce script fait EXACTEMENT ce que feraient deux gestes du Cockpit sur la
   campagne :
     1. « Créer les places » avec 3 iPhone et 3 Android (vues/tests.js,
        campagne-plan.js nouvellesPlaces) : iPhone 1 à 3, Android 1 à 3,
        chacune avec le web ;
     2. « Répartir » avec les six places cochées et aucun testeur inscrit,
        puis « Enregistrer la répartition » (vues/tests.js apercuSocle) :
        le plan lu comme lireSectionsPlan + ordonnerSections, les scénarios
        humains (repartition.js scenariosHumains) que la campagne retient,
        les retraits connus (parcours et anomalies lus en groupe, comme le
        magasin), le socle et le plafond de la campagne, le tirage de
        graine l'identifiant de la campagne ; le contrôle (controlerSocle)
        doit être conforme, sinon rien n'est écrit.
   Une place n'a ni adresse ni compte : aucune lettre, aucune notification,
   aucune invitation. Le script le vérifie après coup (30 s par défaut).

   À BLANC PAR DÉFAUT : la base est lue, le bilan dit ce qui serait écrit.
     node dispatch-places-forgeme.mjs                         (à blanc, émulateur)
     node dispatch-places-forgeme.mjs --vrai                  (émulateur)
     node dispatch-places-forgeme.mjs --production            (à blanc, PRODUCTION, lecture seule)
     node dispatch-places-forgeme.mjs --vrai --production     (PRODUCTION, sur ordre explicite)
     node dispatch-places-forgeme.mjs --annuler <fichier> [--production]
                 remet la campagne telle que sauvegardée, si aucune place n'a
                 été attribuée et qu'elle est toujours en préparation
     --projet=<id> --campagne=<id>   (ForgeMe et sa campagne d'octobre par défaut)

   Avant toute écriture, la campagne est sauvegardée hors du dépôt :
   ~/Capmedia/sauvegardes/campagnes/ (ou $SAUVEGARDES).
   ========================================================================== */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const JS = join(ICI, '../../agence/suivi/assets/js');
const { estSurLePlan, placesDe, nouvellesPlaces, pretALancer } = await import(join(JS, 'campagne-plan.js'));
const {
  scenariosHumains, retraitsConnus, proposerSocle, plafondDe, regleSocle, repartirSocle, controlerSocle, chargeSocle, MINUTES_PAR_TEST,
} = await import(join(JS, 'repartition.js'));

const arg = (nom) => process.argv.includes(nom);
const valeur = (nom) => (process.argv.find((a) => a.startsWith(`${nom}=`)) || '').split('=').slice(1).join('=');
const VRAI = arg('--vrai');
const PRODUCTION = arg('--production');
const ANNULER = arg('--annuler');
const PID = valeur('--projet') || '78FhJrmRu0AicxGXOfcM';
const CID = valeur('--campagne') || 'Ja6skdb7Dqt5i2RYVIGD';
const NOMBRES = { ios: 3, android: 3 };
const SUR_EMULATEUR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJET_FIREBASE = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const ATTENTE_SERVEUR_MS = Number(process.env.ATTENTE_SERVEUR_MS || 30000);

if (!SUR_EMULATEUR && !PRODUCTION) { console.error('Ni émulateur (FIRESTORE_EMULATOR_HOST) ni --production : rien n\'est lu.'); process.exit(2); }
if (PRODUCTION && SUR_EMULATEUR) { console.error('--production avec FIRESTORE_EMULATOR_HOST : contradictoire, arrêt.'); process.exit(2); }

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
initializeApp({ projectId: PROJET_FIREBASE });
const bdd = getFirestore();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(SUR_EMULATEUR ? `Émulateur ${process.env.FIRESTORE_EMULATOR_HOST}, projet ${PROJET_FIREBASE}` : `\n!!! Base de PRODUCTION ${PROJET_FIREBASE} !!!`);

/* La sauvegarde : un horodatage s'écrit { __ts: [secondes, nanos] }. */
const versJson = (v) => {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
  return v;
};
const depuisJson = (v) => {
  if (Array.isArray(v)) return v.map(depuisJson);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return new Timestamp(v.__ts[0], v.__ts[1]);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depuisJson(x)]));
  }
  return v;
};

const refC = bdd.doc(`projets/${PID}/campagnes/${CID}`);

/* --annuler : la campagne revient telle qu'elle était, si personne n'y a touché. */
if (ANNULER) {
  const fichier = process.argv[process.argv.indexOf('--annuler') + 1];
  if (!fichier || fichier.startsWith('--')) { console.error('--annuler <fichier> : le fichier de sauvegarde manque.'); process.exit(2); }
  const s = JSON.parse(readFileSync(fichier, 'utf8'));
  if (s.base !== PROJET_FIREBASE || (PRODUCTION ? s.emulateur : !s.emulateur)) { console.error(`Cette sauvegarde vient de ${s.base}${s.emulateur ? ' (émulateur)' : ''} : elle ne se remet pas ici.`); process.exit(2); }
  const ref = bdd.doc(`projets/${s.projet}/campagnes/${s.campagne}`);
  const x = (await ref.get()).data() || {};
  const attribuees = placesDe(x).filter((p) => p.testeur);
  if ((x.statut || 'preparation') !== 'preparation' || attribuees.length || (x.testeurs || []).some((u) => !String(u).startsWith('place-'))) {
    console.error(`La campagne a servi depuis (statut ${x.statut}, ${attribuees.length} place(s) attribuée(s)) : rien n'est remis.`);
    process.exit(1);
  }
  await ref.set(depuisJson(s.donnees));
  console.log(`Campagne remise telle que sauvegardée le ${s.le} : ${ref.path}`);
  process.exit(0);
}

console.log(VRAI ? 'ÉCRITURE' : 'À BLANC : rien ne sera écrit');
const projet = await bdd.doc(`projets/${PID}`).get();
if (!projet.exists) { console.error(`Projet ${PID} introuvable.`); process.exit(1); }
const lue = await refC.get();
if (!lue.exists) { console.error(`Campagne ${CID} introuvable.`); process.exit(1); }
const c = { id: lue.id, ...lue.data() };
console.log(`Projet ${PID} : ${projet.data().nom || ''}. Campagne « ${c.titre} », ${c.statut || 'preparation'}, ${(c.scenarios || []).length} scénarios, socle ${(c.socle || []).length}, plafond ${plafondDe(c)}.`);

/* Prudence : une campagne en préparation, sans testeur ni place. */
const refus = [];
if ((c.statut || 'preparation') !== 'preparation') refus.push(`statut « ${c.statut} »`);
if ((c.testeurs || []).length || Object.keys(c.affectation || {}).length) refus.push('elle a déjà des testeurs ou une affectation');
if (placesDe(c).length) refus.push('elle a déjà des places');
if (refus.length) { console.error(`Refusé : ${refus.join(' ; ')}.`); process.exit(1); }

/* 1. Les places, comme « Créer les places » (3 iPhone, 3 Android). */
const neuves = nouvellesPlaces(c, NOMBRES);
const idsPlaces = Object.keys(neuves);
const avecPlaces = { ...c, places: neuves };

/* 2. Répartir, comme le bouton : le plan, les scénarios retenus, les
   six places cochées (dans l'ordre de la liste : placesDe), aucun
   passage à garder. */
const docsPlan = (await bdd.collection(`projets/${PID}/planTests`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const GROUPES_PLAN = ['demarrage', 'socle', 'fonctionnalites', 'transverse'];
const rangGroupe = (g) => { const i = GROUPES_PLAN.indexOf(g); return i < 0 ? 99 : i; };
const ordonnees = docsPlan
  .filter((d) => d && !(d.id === 'presentation' || d.genre === 'presentation') && d.aspects)
  .slice()
  .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
const toutLePlan = scenariosHumains(ordonnees);
if (!toutLePlan.length) { console.error('Le plan n\'a aucun scénario pour un humain.'); process.exit(1); }
if (!estSurLePlan(c, toutLePlan)) { console.error('La campagne n\'est pas sur le plan.'); process.exit(1); }
const scenariosPlan = toutLePlan.filter((s) => (c.scenarios || []).includes(s.id));
const gens = placesDe(avecPlaces).map((p) => ({ id: p.id, mobile: p.mobile, web: p.web !== false }));
const passages = (await refC.collection('passages').get()).docs.map((d) => d.data());
const garder = {};
passages.forEach((x) => { if (x.testeur && x.scenario && x.plateforme) (garder[x.testeur] = garder[x.testeur] || []).push(`${x.scenario}__${x.plateforme}`); });

/* Les parcours et les anomalies, lus en groupe comme le magasin du
   Cockpit (_parent : le document au-dessus de la collection). */
const enGroupe = async (nom) => (await bdd.collectionGroup(nom).get()).docs.map((d) => ({ id: d.id, ...d.data(), _parent: (d.ref.parent.parent || {}).id || '' }));
const projetDe = (x) => x.projet || x._parent || '';
const parcours = (await enGroupe('parcours')).filter((x) => projetDe(x) === PID);
const anomalies = (await enGroupe('anomalies')).filter((x) => projetDe(x) === PID);
const retraits = retraitsConnus({ scenarios: scenariosPlan, parcours, anomalies });
const idsPlan = new Set(scenariosPlan.map((x) => x.id));
const socle = regleSocle(c) && Array.isArray(c.socle) ? c.socle.filter((x) => idsPlan.has(x)) : proposerSocle(scenariosPlan, { retraits });
const plafond = plafondDe(c);
const r = repartirSocle(scenariosPlan, gens, { socle, plafond, retraits, garder, graine: c.id || '' });
const ctl = controlerSocle(r.affectation, scenariosPlan, { socle, retraits, plafond });
const charges = chargeSocle(r.affectation, socle);
const auxRobots = r.laisses.filter((x) => x.qui !== 'humain');
const personne = r.laisses.filter((x) => x.qui === 'humain');
const motifs = {};
r.retires.forEach((x) => { motifs[x.motif] = (motifs[x.motif] || 0) + 1; });
const bloque = !ctl.conforme || r.depassements.length > 0 || !Object.keys(r.affectation).length;

const heures = (n) => `${String(Math.round(n * MINUTES_PAR_TEST / 6) / 10).replace('.', ',')} h`;
const tableau = (ch) => {
  console.log('\n  Place        Tél.      Socle  Reste  Dont web  Total  Heures');
  ch.forEach((x) => console.log(`  ${(neuves[x.id] || (avecPlaces.places || {})[x.id] || {}).libelle.padEnd(12)} ${(x.telephone === 'ios' ? 'iPhone' : 'Android').padEnd(9)} ${String(x.socle).padStart(5)}  ${String(x.reste).padStart(5)}  ${String(x.webN).padStart(8)}  ${String(x.total).padStart(5)}  ${heures(x.total).padStart(6)}`));
};
console.log(`\nLe plan : ${ordonnees.length} sections, ${toutLePlan.length} scénarios humains, ${scenariosPlan.length} retenus par la campagne.`);
console.log(`Places : ${idsPlaces.map((id) => neuves[id].libelle).join(', ')}.`);
console.log(`Retraits : ${r.retires.length} (robot ${motifs.robot || 0}, bug ${motifs.bug || 0}, web vert ${motifs['web-vert'] || 0}). Socle : ${socle.length} scénarios, ${r.socle.cles} passages.`);
tableau(charges);
console.log(`\n${auxRobots.length} tests laissés aux robots. ${personne.length} « humain » seuls sans place. Contrôle : ${ctl.conforme ? 'conforme' : `ÉCART ${JSON.stringify({ enTrop: ctl.enTrop.length, doublons: ctl.doublons.length, socleManquant: ctl.socleManquant.length, auDessus: ctl.auDessus.length })}`}. Dépassements : ${r.depassements.length}.`);
if (bloque) { console.error('\nLe contrôle bloque l\'écriture, comme dans le Cockpit : rien n\'est écrit.'); process.exit(1); }
if (!VRAI) { console.log('\nÀ blanc : rien n\'a été écrit. Ajoutez --vrai pour écrire.'); process.exit(0); }

/* --------------------------------------------------------------------------
   Écrire : sauvegarde, places, répartition, relecture, silence du serveur.
   -------------------------------------------------------------------------- */
const depart = Timestamp.now();
const lieu = process.env.SAUVEGARDES || join(homedir(), 'Capmedia', 'sauvegardes', 'campagnes');
mkdirSync(lieu, { recursive: true });
const fichier = join(lieu, `places-${PID}-${CID}-${new Date().toISOString().replace(/[:.]/g, '-')}${SUR_EMULATEUR ? '-emulateur' : ''}.json`);
const donnees = versJson(lue.data());
writeFileSync(fichier, JSON.stringify({ base: PROJET_FIREBASE, emulateur: SUR_EMULATEUR, le: new Date().toISOString(), projet: PID, campagne: CID, donnees }, null, 2));
if (JSON.stringify(JSON.parse(readFileSync(fichier, 'utf8')).donnees) !== JSON.stringify(donnees)) { console.error('La sauvegarde relue ne correspond pas : arrêt, rien n\'est écrit.'); process.exit(1); }
console.log(`\nSauvegarde : ${fichier}`);

/* Le geste « Créer les places » : un champ par place, et « maj ». */
await refC.update({ ...Object.fromEntries(idsPlaces.map((id) => [`places.${id}`, { ...neuves[id], cree: new Date() }])), maj: FieldValue.serverTimestamp() });
console.log(`Places créées : ${idsPlaces.join(', ')}`);
/* Le geste « Enregistrer la répartition », champ pour champ. */
await refC.update({
  testeurs: Object.keys(r.affectation), affectation: r.affectation,
  regle: 'socle', socle, plafond, retraits: r.retires.map((x) => x.cle),
  repartition: {
    laissesAuxRobots: auxRobots.length, sansPersonne: personne.length, retires: r.retires.length,
    motifs: { robot: motifs.robot || 0, bug: motifs.bug || 0, webVert: motifs['web-vert'] || 0 },
    le: new Date(),
  },
  maj: FieldValue.serverTimestamp(),
});

/* Relire et juger comme la fiche de la campagne. */
const x = { id: CID, ...((await refC.get()).data() || {}) };
const ecarts = [];
if (JSON.stringify((x.testeurs || []).slice().sort()) !== JSON.stringify(idsPlaces.slice().sort())) ecarts.push('testeurs');
if (JSON.stringify(x.affectation) !== JSON.stringify(r.affectation)) ecarts.push('affectation');
if (placesDe(x).length !== 6 || placesDe(x).some((p) => p.testeur)) ecarts.push('places');
const ctl2 = controlerSocle(x.affectation, scenariosPlan, { socle: x.socle, retraits: x.retraits, plafond: plafondDe(x) });
if (!ctl2.conforme) ecarts.push('contrôle');
if (ecarts.length) { console.error(`RELECTURE : écart sur ${ecarts.join(', ')}. Annuler : node ${process.argv[1]} --annuler ${fichier}${PRODUCTION ? ' --production' : ''}`); process.exit(1); }
console.log('Relue : six places, affectation identique au calcul, contrôle conforme.');
tableau(chargeSocle(x.affectation, x.socle));
console.log(`\n${x.repartition.laissesAuxRobots} tests laissés aux robots.`);
const pret = pretALancer(x, { humains: scenariosPlan });
console.log(`Prête à lancer ? ${pret.map((l) => `${l.libelle} : ${l.ok ? 'oui' : 'non'} (${l.detail})`).join(' | ')}`);

/* Le silence du serveur : rien ne part, pour personne. */
console.log(`\nAttente de la réaction du serveur (${Math.round(ATTENTE_SERVEUR_MS / 1000)} s)…`);
await pause(ATTENTE_SERVEUR_MS);
const lettres = (await bdd.collection('envois').where('cree', '>=', depart).get()).docs.map((d) => d.data())
  .filter((e) => !['code', 'connexion-equipe'].includes(e.modele));
const cloches = [];
for (const b of await bdd.collection('boites').listDocuments()) {
  const q = await b.collection('notifications').where('date', '>=', depart).get();
  q.docs.forEach((d) => cloches.push(`${b.id}: ${d.data().titre || ''}`));
}
const activites = (await bdd.collection('activite').where('projet', '==', PID).get()).docs.map((d) => d.data())
  .filter((a) => a.date && a.date.toMillis() >= depart.toMillis());
const invitations = (await bdd.collection('invitations').where('cree', '>=', depart).get()).size;
const marques = (await refC.collection('lettresTesteurs').get()).size;
const fiches = (await Promise.all(idsPlaces.map((id) => bdd.doc(`testeurs/${id}`).get()))).filter((d) => d.exists).length;
console.log(`Lettres (hors connexion de l'équipe) : ${lettres.length}${lettres.length ? ` (${lettres.map((l) => l.modele).join(', ')})` : ''}`);
console.log(`Notifications : ${cloches.length}${cloches.length ? ` (${cloches.join(' | ')})` : ''}`);
console.log(`Activités du projet : ${activites.length}${activites.length ? ` (${activites.map((a) => `${a.visibilite}: ${a.texte}`).join(' | ')})` : ''}`);
console.log(`Invitations : ${invitations}. Marques de lettre de campagne : ${marques}. Fiches de testeur au nom d'une place : ${fiches}.`);
const bruit = lettres.length + cloches.length + activites.filter((a) => a.visibilite !== 'interne').length + invitations + marques + fiches;
console.log(bruit ? `\nATTENTION : ${bruit} trace(s).` : '\nAucune lettre, aucune notification, aucune activité client, aucune invitation.');
console.log(`\nAnnuler : node fonctions-suivi/outils/dispatch-places-forgeme.mjs --annuler ${fichier}${PRODUCTION ? ' --production' : ''}`);
process.exit(bruit ? 1 : 0);
