#!/bin/bash
# ==========================================================================
#  CAPMEDIA CLIENT HUB · les suites navigateur, chacune sur un banc propre
#
#  Pour chaque suite : la base et les comptes de l'émulateur sont vidés, les
#  semis communs sont posés, puis ceux que la suite déclare (voir PREALABLES),
#  et la suite tourne. Une suite ne dépend ainsi jamais de ce qu'une autre a
#  laissé derrière elle.
#
#  Émulateurs requis (auth, firestore, functions, storage) et site local sur
#  8787 ; la garde du banc (lib/garde-banc.cjs) refuse de démarrer sinon.
#  Second banc : BANC_NUMERO=2 (ports décalés de 10000, site sur 18787,
#  émulateurs lancés avec la configuration que donne config-banc.cjs 2).
#
#    PLAN_DE_TESTS=<plan.md> bash fonctions-suivi/outils/banc-suites.sh <sortie> [suite ...]
#
#  PLAN_DE_TESTS : le plan de tests à importer (hors dépôt). NODE_PATH doit
#  permettre de trouver @playwright/test.
# ==========================================================================
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"
SORTIE="${1:?Usage : banc-suites.sh <dossier-de-sortie> [suite ...]}"; shift
: "${PLAN_DE_TESTS:?PLAN_DE_TESTS doit désigner le plan de tests à importer}"
# Le numéro du banc (1 par défaut, 2 pour le second banc) décale tous les
# ports de (N - 1) x 10000 : voir lib/ports-banc.cjs.
export BANC_NUMERO="${BANC_NUMERO:-1}"
D=$(( (BANC_NUMERO - 1) * 10000 ))
export FIRESTORE_EMULATOR_HOST=127.0.0.1:$((8080 + D)) FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:$((9099 + D)) FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:$((9199 + D))
export FIREBASE_EMULATOR_HUB=127.0.0.1:$((4400 + D))
export GCLOUD_PROJECT="${GCLOUD_PROJECT:-capmedia-1f90d}"
mkdir -p "$SORTIE"
cd "$RACINE" || exit 2

# Les semis propres à une suite, dans l'ordre où elle les attend.
prealables() {
  case "$1" in
    qa-parcours)
      node outils/importer-scenarios.mjs atelier "$PLAN_DE_TESTS" --vrai
      node outils/semer-trous.mjs atelier --vrai
      node outils/semer-parcours.mjs atelier --vrai
      node outils/semer-parcours-2.mjs atelier --vrai
      node outils/semer-regles.mjs atelier --vrai
      node outils/semer-robot-banc.mjs atelier ;;
    qa-devis-frise|qa-menage-hub)
      node outils/semer-etapes-devis.mjs atelier d-qa --vrai ;;
    qa-espace-testeur)
      node outils/semer-campagne.mjs "$PLAN_DE_TESTS" ;;
  esac
}

# Les déclencheurs du semis finissent de tourner avant la suite : on attend
# que les activités, les lettres et les notifications cessent d'augmenter
# (trois relevés identiques de suite, deux minutes au plus). Une attente fixe
# ne suffisait pas : un déclencheur de la suite passait derrière la file du
# semis, au-delà de la patience du test.
compte() {
  for c in activite envois; do
    curl -s -X POST -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
      "http://$FIRESTORE_EMULATOR_HOST/v1/projects/$GCLOUD_PROJECT/databases/(default)/documents:runAggregationQuery" \
      -d "{\"structuredAggregationQuery\":{\"structuredQuery\":{\"from\":[{\"collectionId\":\"$c\"}]},\"aggregations\":[{\"alias\":\"n\",\"count\":{}}]}}" | grep -o '"integerValue": *"[0-9]*"'
  done
  curl -s -X POST -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
    "http://$FIRESTORE_EMULATOR_HOST/v1/projects/$GCLOUD_PROJECT/databases/(default)/documents:runAggregationQuery" \
    -d '{"structuredAggregationQuery":{"structuredQuery":{"from":[{"collectionId":"notifications","allDescendants":true}]},"aggregations":[{"alias":"n","count":{}}]}}' | grep -o '"integerValue": *"[0-9]*"'
}
attendreLeCalme() {
  local avant="" pareil=0
  for i in $(seq 1 60); do
    local maintenant; maintenant="$(compte | tr -d ' \n')"
    if [ "$maintenant" = "$avant" ]; then pareil=$((pareil+1)); else pareil=0; fi
    [ $pareil -ge 3 ] && return 0
    avant="$maintenant"; sleep 2
  done
}

SUITES=("$@")
if [ ${#SUITES[@]} -eq 0 ]; then SUITES=($(cd "$ICI" && ls qa-*.cjs | sed 's/\.cjs$//')); fi

echec=0
for n in "${SUITES[@]}"; do
  curl -s -X DELETE "http://$FIRESTORE_EMULATOR_HOST/emulator/v1/projects/$GCLOUD_PROJECT/databases/(default)/documents" >/dev/null
  curl -s -X DELETE "http://$FIREBASE_AUTH_EMULATOR_HOST/emulator/v1/projects/$GCLOUD_PROJECT/accounts" >/dev/null
  {
    node outils/semer-suivi.mjs
    node outils/semer-campagne.mjs "$PLAN_DE_TESTS"
    node outils/semer-parcours.mjs atelier --vrai
    node outils/semer-regles.mjs atelier --vrai
    prealables "$n"
  } > "$SORTIE/$n.semis.txt" 2>&1
  attendreLeCalme
  perl -e 'alarm shift; exec @ARGV' 600 node "outils/$n.cjs" > "$SORTIE/$n.txt" 2>&1
  code=$?
  [ $code -ne 0 ] && echec=1
  echo "$n exit=$code ok=$(grep -c '^  ok' "$SORTIE/$n.txt") ecarts=$(grep -c 'ÉCART' "$SORTIE/$n.txt")"
done
exit $echec
