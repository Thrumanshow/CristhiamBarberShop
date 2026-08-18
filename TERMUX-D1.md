# Despliegue D1 desde Termux

Esta guía describe el flujo operativo de Cristhiam Barber Shop desde Android/Termux. El procedimiento usa curl, jq y la API REST de Cloudflare; no requiere instalar Wrangler ni ejecutar workerd localmente.

## Preparación

Instala las herramientas mínimas:

    pkg update -y
    pkg install bash curl jq -y

Define las variables en la sesión de Termux o en un almacén local protegido. No las incluyas en Git ni en capturas:

    export CF_ACCOUNT_ID="TU_ACCOUNT_ID"
    export CF_API_TOKEN="TU_TOKEN_CON_PERMISOS_D1_Y_WORKERS"
    export CF_WORKER_NAME="cristhiam-barber-api"
    export CF_D1_NAME="cristhiam-barber-db"
    export ALLOWED_ORIGIN="https://barberia.hormigasais.com"

ALLOWED_ORIGIN es obligatorio. Debe ser el origen exacto del frontend, con protocolo y sin barra final. El script rechaza "*" porque el Worker ya no publica CORS abierto cuando la variable falta.

## Despliegue

Desde la raíz del repositorio:

    chmod +x scripts/deploy-d1-termux.sh scripts/deploy-worker.sh
    ./scripts/deploy-d1-termux.sh

El script lista o crea la base D1, aplica src/worker/schema.sql, genera el metadata multipart con el binding DB y ALLOWED_ORIGIN, y publica src/worker/worker.js mediante PUT /accounts/{account_id}/workers/scripts/{script_name}/content.

## Verificación de preflight

El navegador debe enviar el origen real del frontend. Un preflight válido responde 204 sin cuerpo y con Access-Control-Allow-Origin igual a ALLOWED_ORIGIN:

    curl -i -X OPTIONS \
      "https://cristhiam-barber-api.chrisquionez354.workers.dev/api/reservar" \
      -H "Origin: $ALLOWED_ORIGIN" \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: Content-Type"

Un origen diferente debe recibir 403. Si falta ALLOWED_ORIGIN, el Worker y el script deben fallar; no debe aparecer Access-Control-Allow-Origin: *.

## Prueba de persistencia

Usa una fecha futura y datos de prueba:

    curl --fail-with-body --silent --show-error \
      -X POST "https://cristhiam-barber-api.chrisquionez354.workers.dev/api/reservar" \
      -H "Origin: $ALLOWED_ORIGIN" \
      -H 'Content-Type: application/json' \
      --data '{"nombre":"Prueba Termux","servicio":"Corte Tradicional ($10.00)","fecha":"2099-12-31T10:00"}'

La respuesta correcta es 201 con status: "success". Repetir la misma franja debe devolver 409 y no crear otra fila.

## Consulta administrativa

scripts/ver-reservas.sh está pensado para una sesión administrativa y requiere .env.local con CF_ACCOUNT_ID, CF_API_TOKEN y D1_ID. Debe ejecutarse solo en el dispositivo autorizado, porque imprime datos personales de reservas:

    chmod +x scripts/ver-reservas.sh
    ./scripts/ver-reservas.sh

Antes de operar con datos reales conviene proteger el archivo de entorno (chmod 600 .env.local), rotar tokens expuestos y añadir autenticación o una consulta limitada para el futuro panel administrativo.
