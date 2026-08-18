#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

WORKER_NAME="${CF_WORKER_NAME:-cristhiam-barber-api}"
D1_NAME="${CF_D1_NAME:-cristhiam-barber-db}"
API_BASE="https://api.cloudflare.com/client/v4"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WORKER_FILE="$ROOT_DIR/src/worker/worker.js"
SCHEMA_FILE="$ROOT_DIR/src/worker/schema.sql"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1. Instálalo con: pkg install $1 -y"
}

require_cmd curl
require_cmd jq

: "${CF_ACCOUNT_ID:?Exporta CF_ACCOUNT_ID antes de ejecutar el script.}"
: "${CF_API_TOKEN:?Exporta CF_API_TOKEN antes de ejecutar el script.}"
: "${ALLOWED_ORIGIN:?Exporta ALLOWED_ORIGIN antes de ejecutar el script (origen exacto del frontend).}"

if [[ "$ALLOWED_ORIGIN" == "*" ]]; then
  fail "ALLOWED_ORIGIN no puede ser '*'. Usa el origen exacto del frontend, ej. https://barberia.hormigasais.com"
fi

[[ -f "$WORKER_FILE" ]] || fail "No existe $WORKER_FILE"
[[ -f "$SCHEMA_FILE" ]] || fail "No existe $SCHEMA_FILE"

AUTH_HEADER="Authorization: Bearer $CF_API_TOKEN"
JSON_HEADER="Content-Type: application/json"

api_get() {
  curl --fail-with-body --silent --show-error \
    -H "$AUTH_HEADER" \
    -H "$JSON_HEADER" \
    "$1"
}

assert_success() {
  local response="$1"
  if [[ "$(jq -r '.success // false' <<< "$response")" != "true" ]]; then
    jq -c '{success,errors,messages}' <<< "$response" >&2 || true
    fail "Cloudflare API respondió success=false"
  fi
}

printf '%s\n' '== CristhiamBarberShop: despliegue D1 desde Termux =='
printf 'Cuenta: %s\n' "$CF_ACCOUNT_ID"
printf 'Worker: %s\n' "$WORKER_NAME"
printf 'D1: %s\n' "$D1_NAME"

DATABASES_RESPONSE="$(api_get "$API_BASE/accounts/$CF_ACCOUNT_ID/d1/database")"
assert_success "$DATABASES_RESPONSE"

D1_ID="$(jq -r --arg name "$D1_NAME" '.result[]? | select(.name == $name) | .uuid' <<< "$DATABASES_RESPONSE" | head -n 1)"

if [[ -z "$D1_ID" || "$D1_ID" == "null" ]]; then
  printf 'Creando base D1 %s...\n' "$D1_NAME"
  CREATE_BODY="$(jq -n --arg name "$D1_NAME" '{name:$name, jurisdiction:"us"}')"
  CREATE_RESPONSE="$(curl --fail-with-body --silent --show-error \
    -X POST "$API_BASE/accounts/$CF_ACCOUNT_ID/d1/database" \
    -H "$AUTH_HEADER" \
    -H "$JSON_HEADER" \
    --data "$CREATE_BODY")"
  assert_success "$CREATE_RESPONSE"
  D1_ID="$(jq -r '.result.uuid // .result.id // empty' <<< "$CREATE_RESPONSE")"
  [[ -n "$D1_ID" && "$D1_ID" != "null" ]] || fail "Cloudflare no devolvió el UUID de D1"
  printf 'D1 creada: %s\n' "$D1_ID"
else
  printf 'D1 existente reutilizada: %s\n' "$D1_ID"
fi

SCHEMA_SQL="$(cat "$SCHEMA_FILE")"
QUERY_BODY="$(jq -n --arg sql "$SCHEMA_SQL" '{sql:$sql,params:[]}')"
printf '%s\n' 'Aplicando esquema SQL...'
QUERY_RESPONSE="$(curl --fail-with-body --silent --show-error \
  -X POST "$API_BASE/accounts/$CF_ACCOUNT_ID/d1/database/$D1_ID/query" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  --data "$QUERY_BODY")"
assert_success "$QUERY_RESPONSE"
printf '%s\n' 'Esquema D1 aplicado correctamente.'

if [[ -n "${ALLOWED_ORIGIN:-}" ]]; then
  METADATA="$(jq -n \
    --arg db "$D1_ID" \
    --arg origin "$ALLOWED_ORIGIN" \
    '{main_module:"worker.js",bindings:[
      {name:"DB",type:"d1",id:$db},
      {name:"ALLOWED_ORIGIN",type:"plain_text",text:$origin}
    ]}')"
else
  printf '%s\n' 'ADVERTENCIA: ALLOWED_ORIGIN no está definido; se mantendrá CORS abierto (*) temporalmente.' >&2
  METADATA="$(jq -n --arg db "$D1_ID" \
    '{main_module:"worker.js",bindings:[{name:"DB",type:"d1",id:$db}]}')"
fi

printf 'Desplegando Worker %s...\n' "$WORKER_NAME"
DEPLOY_RESPONSE="$(curl --fail-with-body --silent --show-error \
  -X PUT "$API_BASE/accounts/$CF_ACCOUNT_ID/workers/scripts/$WORKER_NAME/content" \
  -H "$AUTH_HEADER" \
  -F "metadata=$METADATA;type=application/json" \
  -F "worker.js=@$WORKER_FILE;type=application/javascript+module")"
assert_success "$DEPLOY_RESPONSE"

printf '\nDespliegue completado.\n'
