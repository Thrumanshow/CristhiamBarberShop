#!/bin/bash

# Verificar variables de entorno
if [ -z "$CF_ACCOUNT_ID" ] || [ -z "$CF_API_TOKEN" ]; then
  echo "Error: Debes exportar CF_ACCOUNT_ID y CF_API_TOKEN en tu entorno Termux."
  exit 1
fi

WORKER_NAME="cristhiam-barber-api"

echo "Desplegando Worker $WORKER_NAME a Cloudflare Edge..."

curl --fail-with-body --silent --show-error \
  -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/$WORKER_NAME/content" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F 'metadata={"main_module":"worker.js"};type=application/json' \
  -F 'worker.js=@src/worker/worker.js;type=application/javascript+module'

echo -e "\nDespliegue finalizado."
