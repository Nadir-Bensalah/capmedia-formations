#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la configuration des émulateurs d'un second banc

   Le banc 1 lance ses émulateurs avec firebase.suivi.json, ports
   historiques. Un banc N (N >= 2) en reprend tout (règles, index,
   fonctions) et décale chaque port de (N - 1) x 10000, y compris ceux que
   Firebase réserve sans les écrire (hub 4400, journaux 4500, websocket de
   Firestore 9150, Eventarc 9299, Cloud Tasks 9499) : deux bancs ne se
   croisent sur aucun port.

     node fonctions-suivi/outils/config-banc.cjs 2
       -> écrit firebase.suivi.banc2.json à la racine du dépôt (non suivi)

   Les émulateurs du banc N se lancent alors avec un TMPDIR à part (le
   fichier de repérage du hub y est écrit) :
     TMPDIR=<dossier> firebase emulators:start --config firebase.suivi.banc2.json --project capmedia-1f90d
   Les suites, elles, tournent avec BANC_NUMERO=N (voir lib/ports-banc.cjs).
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');

const numero = Number(process.argv[2]);
if (!Number.isInteger(numero) || numero < 2 || numero > 5) {
  console.error('Usage : node config-banc.cjs <numero de banc, 2 à 5>');
  process.exit(2);
}
const D = (numero - 1) * 10000;
const racine = path.resolve(__dirname, '..', '..');
const source = JSON.parse(fs.readFileSync(path.join(racine, 'firebase.suivi.json'), 'utf8'));

const e = source.emulators || {};
const port = (cle, defaut) => ((e[cle] && e[cle].port) || defaut) + D;
source.emulators = {
  ...e,
  auth: { ...e.auth, port: port('auth', 9099) },
  firestore: { ...e.firestore, port: port('firestore', 8080), websocketPort: ((e.firestore && e.firestore.websocketPort) || 9150) + D },
  functions: { ...e.functions, port: port('functions', 5001) },
  storage: { ...e.storage, port: port('storage', 9199) },
  pubsub: { ...e.pubsub, port: port('pubsub', 8085) },
  ui: { enabled: true, ...e.ui, port: port('ui', 4000) },
  hub: { ...e.hub, port: port('hub', 4400) },
  logging: { ...e.logging, port: port('logging', 4500) },
  /* Eventarc et Cloud Tasks : sans port écrit, deux bancs qui démarrent
     ensemble se disputaient 9299 et 9499 (EADDRINUSE, émulateurs absents). */
  eventarc: { ...e.eventarc, port: port('eventarc', 9299) },
  tasks: { ...e.tasks, port: port('tasks', 9499) },
};

const cible = path.join(racine, `firebase.suivi.banc${numero}.json`);
fs.writeFileSync(cible, `${JSON.stringify(source, null, 2)}\n`);
console.log(cible);
