#!/bin/bash
# ==========================================================================
#  CAPMEDIA CLIENT HUB · rejouer un ordre de déploiement de la Gate 2 au banc
#
#  Deux arbres complets du dépôt, extraits hors du dépôt : l'ANCIEN (avant la
#  Gate 2) et le NOUVEAU. Les émulateurs sont relancés entre deux étapes avec
#  les fonctions et les règles de l'étape (les données passent de l'une à
#  l'autre par export/import) ; l'ancien site et le nouveau sont servis côte
#  à côte. À chaque étape, ordre-deploiement-gate2.cjs sonde.
#
#    bash ordre-deploiement.sh <ancien> <nouveau> <releve.json> <journal> <ordre>
#
#  <ordre> : une suite d'étapes séparées par des virgules, chacune
#  « fonctions:ancien|nouveau », « regles:ancien|nouveau », « site:ancien|nouveau »,
#  « migration », « annulation » (retour arrière) ou « sonder:<nom> ».
#  Exemple (l'ordre retenu) :
#    fonctions:nouveau,sonder:1-fonctions,migration,sonder:2-migration,
#    regles:nouveau,sonder:3-regles,site:nouveau,sonder:4-site
#
#  Les émulateurs du banc habituel doivent être arrêtés avant ; ce script
#  les laisse arrêtés en sortant.
# ==========================================================================
set -u
ANCIEN="$(cd "${1:?ancien}" && pwd)"; NOUVEAU="$(cd "${2:?nouveau}" && pwd)"
RELEVE="${3:?releve}"; JOURNAL="${4:?journal}"; ORDRE="${5:?ordre}"
ICI="$(cd "$(dirname "$0")" && pwd)"
TRAVAIL="$(mktemp -d "${ORDRE_TRAVAIL:-${TMPDIR:-/tmp}}/ordre-gate2.XXXXXX")"
# Les sockets du runtime des fonctions vivent dans TMPDIR : un chemin long
# dépasse la limite des sockets Unix. On laisse le TMPDIR du système.
unset TMPDIR
# Le CLI veut des sources relatives au fichier de configuration.
ln -s "$ANCIEN" "$TRAVAIL/ancien"; ln -s "$NOUVEAU" "$TRAVAIL/nouveau"
export GCLOUD_PROJECT=capmedia-1f90d FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
export ORDRE_JOURNAL="$JOURNAL"
FONCTIONS=ancien; REGLES=ancien; SITE=ancien; EMU_PID=""

config() {
  cat > "$TRAVAIL/firebase.json" <<EOF
{ "firestore": { "rules": "$REGLES/suivi/firestore.rules", "indexes": "nouveau/suivi/firestore.indexes.json" },
  "storage": { "rules": "$REGLES/suivi/storage.rules" },
  "functions": [{ "source": "$FONCTIONS/fonctions-suivi", "codebase": "suivi", "runtime": "nodejs20" }],
  "emulators": { "auth": { "port": 9099 }, "firestore": { "port": 8080 }, "functions": { "port": 5001 }, "storage": { "port": 9199 }, "ui": { "enabled": false }, "singleProjectMode": true } }
EOF
}
arreter() {
  if [ -n "$EMU_PID" ]; then kill -INT "$EMU_PID" 2>/dev/null; wait "$EMU_PID" 2>/dev/null; fi
  for i in $(seq 1 60); do nc -z 127.0.0.1 8080 2>/dev/null || break; sleep 1; done
  EMU_PID=""
}
demarrer() {
  config
  local import=""; [ -d "$TRAVAIL/donnees" ] && import="--import=$TRAVAIL/donnees"
  local journal="$TRAVAIL/emu-$FONCTIONS-$REGLES-$RANDOM.log"
  pushd "$TRAVAIL" >/dev/null
  firebase emulators:start --project "$GCLOUD_PROJECT" --config firebase.json --only auth,firestore,functions,storage $import --export-on-exit="$TRAVAIL/donnees" > "$journal" 2>&1 &
  EMU_PID=$!
  popd >/dev/null
  for i in $(seq 1 180); do grep -q "All emulators ready" "$journal" && return 0; sleep 1; done
  echo "émulateurs injoignables ($journal)"; exit 2
}
relancer() { arreter; demarrer; echo "== émulateurs : fonctions $FONCTIONS, règles $REGLES"; }
site() { case "$SITE" in ancien) echo "http://127.0.0.1:8788" ;; *) echo "http://127.0.0.1:8789" ;; esac; }

python3 "$ANCIEN/fonctions/outils/serveur-local.py" 8788 > "$TRAVAIL/site-ancien.log" 2>&1 & S1=$!
python3 "$NOUVEAU/fonctions/outils/serveur-local.py" 8789 > "$TRAVAIL/site-nouveau.log" 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null; arreter' EXIT

demarrer
node "$ICI/ordre-deploiement-gate2.cjs" poser "$RELEVE" || exit 1
node "$ICI/ordre-deploiement-gate2.cjs" sonder 0-avant "$(site)" "$SITE"
IFS=',' read -ra ETAPES <<< "$ORDRE"
for e in "${ETAPES[@]}"; do
  case "$e" in
    fonctions:*) FONCTIONS="${e#*:}"; relancer ;;
    regles:*) REGLES="${e#*:}"; relancer ;;
    site:*) SITE="${e#*:}" ;;
    migration) node "$NOUVEAU/fonctions-suivi/outils/migrer-gate2.mjs" --vrai | tail -25 ;;
    annulation) node "$NOUVEAU/fonctions-suivi/outils/migrer-gate2.mjs" --annuler --tout ;;
    sonder:*) node "$ICI/ordre-deploiement-gate2.cjs" sonder "${e#*:}" "$(site)" "$SITE" ;;
  esac
done
