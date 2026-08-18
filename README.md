# Cristhiam Barber Shop

Aplicación web ligera para solicitar reservas en Cristhiam Barber Shop mediante una API desplegada en Cloudflare Workers y persistencia en Cloudflare D1. El proyecto también conserva una utilidad SQLite para pruebas locales y un flujo de despliegue desde Termux basado directamente en la API REST de Cloudflare.

> **Estado del proyecto:** MVP funcional en evolución. La persistencia de producción está diseñada para D1, pero todavía no debe presentarse como un sistema completo de agenda: faltan disponibilidad dinámica, duración de servicios, cancelaciones administrativas, autenticación y protección avanzada contra abuso.

## Propósito

El proyecto explora una arquitectura pequeña y reproducible para una barbería: el cliente envía una solicitud de reserva, el Worker valida los datos en el borde, D1 guarda la reserva y Telegram puede notificarla de forma asíncrona. La experiencia de despliegue se realiza desde Android/Termux mediante `curl` y `jq`, sin depender de Wrangler ni de ejecutar `workerd` localmente.

La referencia conceptual de esta autonomía operacional se relaciona con el artículo [Gobernanza Edge Soberana: administrando Workers sin Wrangler en Termux](https://blog.hormigasais.com/posts/gobernanza-edge-soberana-termux.html), mientras que este repositorio documenta una implementación concreta para una barbería.

## Arquitectura

    Navegador móvil
          |
          | POST /api/reservar
          v
    Cloudflare Worker ESM
          |
          +--> Cloudflare D1: reservas persistentes
          |
          +--> Telegram Bot API: notificación opcional

El navegador no decide el precio ni el código interno del servicio. El Worker recibe el nombre visible del servicio, lo valida contra un catálogo controlado por servidor y obtiene el precio confiable antes de insertar la reserva.

## Tecnologías

| Componente | Uso |
|---|---|
| HTML5, CSS3 y JavaScript | Interfaz web móvil en `public/index.html`. |
| Cloudflare Workers ESM | Validación y API de reservas en `src/worker/worker.js`. |
| Cloudflare D1 / SQLite | Persistencia distribuida mediante el binding `DB`. |
| Telegram Bot API | Notificación opcional con `ctx.waitUntil`. |
| Termux, Bash, cURL y jq | Creación de D1, migración y despliegue directo por API REST. |
| SQLite local | Utilidad de desarrollo en `scripts/local_db.py`; no es la base de producción. |

La interfaz actual es una **web móvil optimizada**. Para llamarla PWA en sentido estricto todavía sería necesario incluir, como mínimo, un manifiesto web y un service worker.

## Estructura

    CristhiamBarberShop/
    ├── public/
    │   └── index.html
    ├── src/
    │   └── worker/
    │       ├── schema.sql
    │       └── worker.js
    ├── scripts/
    │   ├── deploy-d1-termux.sh
    │   ├── deploy-worker.sh
    │   └── local_db.py
    ├── data/
    │   └── barberia.db
    ├── TERMUX-D1.md
    └── README.md

## Requisitos

Se necesita una cuenta de Cloudflare con una cuenta habilitada para D1 y Workers, un token API con permisos suficientes para leer y escribir D1 y publicar Workers Scripts, y un dispositivo Android con Termux. En Termux deben estar disponibles curl, jq, bash y, para las comprobaciones locales, Node.js.

    pkg update -y
    pkg install curl jq bash -y

El proyecto no requiere Wrangler para ejecutar el flujo documentado. Esto no significa que Wrangler sea incompatible con todos los entornos: la decisión de no utilizarlo aquí responde a la independencia operacional desde Termux y a la incompatibilidad del entorno local descrita en el artículo técnico.

## Variables de entorno

Define las variables solamente en la sesión de Termux o mediante un almacén seguro. Nunca las incluyas en Git, HTML o capturas de pantalla.

    export CF_ACCOUNT_ID="TU_ACCOUNT_ID"
    export CF_API_TOKEN="TU_TOKEN_DE_CLOUDFLARE"
    export CF_WORKER_NAME="cristhiam-barber-api"
    export CF_D1_NAME="cristhiam-barber-db"
    export ALLOWED_ORIGIN="https://TU_DOMINIO_PUBLICO"

ALLOWED_ORIGIN debe ser el origen exacto del frontend, incluyendo el protocolo y sin una barra final innecesaria. Si el frontend y el Worker comparten origen, configura el dominio público correspondiente. El script detiene la ejecución si esta variable no está definida para evitar publicar CORS abierto por accidente.

## Despliegue desde Termux

Desde la raíz del repositorio:

    cd ~/CristhiamBarberShop
    chmod +x scripts/deploy-d1-termux.sh scripts/deploy-worker.sh
    ./scripts/deploy-d1-termux.sh

El script realiza estas operaciones de forma explícita:

1. Lista las bases D1 de la cuenta y reutiliza la que coincide con CF_D1_NAME; si no existe, la crea.
2. Envía src/worker/schema.sql a POST /accounts/{account_id}/d1/database/{database_id}/query.
3. Construye metadata multipart con el binding D1 DB y el binding de texto ALLOWED_ORIGIN.
4. Publica el Worker ESM mediante PUT /accounts/{account_id}/workers/scripts/{script_name}/content.
5. Verifica success: true en cada respuesta y no imprime el token.

El archivo scripts/deploy-worker.sh se mantiene como alias para no romper el flujo anterior:

    ./scripts/deploy-worker.sh

## Secretos de Telegram

El Worker utiliza estas variables como secretos del entorno de Cloudflare, no como texto versionado:

    TELEGRAM_BOT_TOKEN
    TELEGRAM_CHAT_ID

Si no están configuradas, la reserva se guarda igualmente y la notificación se omite. Un fallo de Telegram no debe convertir una reserva ya persistida en un error para el cliente.

## Contrato de la API

### POST /api/reservar

Solicitud:

    {
      "nombre": "Juan Pérez",
      "servicio": "Corte Tradicional ($10.00)",
      "fecha": "2099-12-31T10:00"
    }

Respuesta exitosa, HTTP 201:

    {
      "status": "success",
      "data": {
        "id": "uuid",
        "cliente": "Juan Pérez",
        "servicio": "Corte Tradicional ($10.00)",
        "fecha": "2099-12-31T10:00",
        "precio": 10,
        "estado": "confirmed"
      }
    }

El Worker rechaza nombres fuera de 2–100 caracteres, servicios que no estén en el catálogo, fechas con formato inválido, fechas pasadas y horas fuera del horario configurado de 08:00 a 18:00 para San Miguel, El Salvador. El esquema D1 impide la duplicación de la franja definida por fecha; un conflicto se comunica como HTTP 409.

Las respuestas de error no deben interpretarse como una confirmación. El frontend utiliza res.ok y muestra el mensaje devuelto por el Worker.

## Persistencia y esquema

La fuente de persistencia del entorno productivo es D1 mediante env.DB. data/barberia.db y scripts/local_db.py son recursos locales de desarrollo y no se sincronizan automáticamente con D1.

El esquema actual registra identificador, cliente, servicio, precio, fecha, estado y fecha de creación. También contiene restricciones de longitud, catálogo de servicios, precio no negativo e índices de consulta.

La política de unicidad debe mantenerse alineada con el ciclo de vida de las reservas. Si se habilitan cancelaciones, la migración debe permitir reutilizar una franja cancelada mediante un índice único parcial, por ejemplo:

    CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_fecha_activa
    ON reservas (fecha)
    WHERE estado != 'cancelled';

Antes de usar esta variante en una base que ya tenga UNIQUE(fecha), debe realizarse una migración planificada: SQLite no elimina automáticamente la restricción antigua solo porque se cambie el archivo schema.sql.

## Prueba rápida

Después del despliegue, utiliza una fecha futura y el dominio real del Worker:

    curl --fail-with-body --silent --show-error \
      -X POST "https://TU_WORKER_DOMAIN/api/reservar" \
      -H 'Content-Type: application/json' \
      --data '{"nombre":"Prueba Termux","servicio":"Corte Tradicional ($10.00)","fecha":"2099-12-31T10:00"}'

Repite la misma solicitud para comprobar que el esquema responde con 409 cuando la franja ya está ocupada. No uses nombres, teléfonos ni datos personales reales durante las pruebas.

## Seguridad

El Worker valida en servidor, usa sentencias preparadas para D1, limita el tamaño del cuerpo, aplica Cache-Control: no-store a las respuestas JSON y no expone el token de Cloudflare. El origen CORS debe configurarse con ALLOWED_ORIGIN; no conviene utilizar * en producción.

La aplicación todavía necesita rate limiting o Turnstile, autenticación para operaciones administrativas, una política de privacidad visible y controles de abuso antes de operar a escala. Telegram recibe datos de la reserva cuando sus secretos están configurados, por lo que ese tratamiento debe reflejarse en la política de privacidad del negocio.

## Límites conocidos y roadmap

El MVP todavía no incluye duración de servicios, varios barberos, disponibilidad dinámica, días de cierre, cancelación y reprogramación por parte del cliente, panel administrativo, autenticación, historial de reservas, recuperación ante errores operativos ni pruebas automatizadas en CI. Estas funciones deben definirse como reglas de negocio antes de implementarse.

El orden recomendado es: primero rate limiting y política de privacidad; después modelo de horarios, duración y cancelaciones; luego panel administrativo y pruebas; finalmente mejoras PWA, analítica y automatizaciones adicionales.

## Referencias

[1]: https://blog.hormigasais.com/posts/gobernanza-edge-soberana-termux.html Gobernanza Edge Soberana: administrando Workers sin Wrangler en Termux.
[2]: https://developers.cloudflare.com/d1/get-started/ Cloudflare D1 — Getting started.
[3]: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/ Cloudflare API — Create D1 Database.
[4]: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ Cloudflare API — Query D1 Database.
[5]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/update/ Cloudflare API — Put script content.
[6]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/update/ Cloudflare API — Update script secret.
