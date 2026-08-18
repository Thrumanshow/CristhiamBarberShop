const SERVICES = new Map([
  ['Corte Tradicional ($10.00)', { code: 'corte-tradicional', price: 10.00 }],
  ['Diseño de Barba ($7.00)', { code: 'diseno-barba', price: 7.00 }],
  ['Combo Corte + Barba ($15.00)', { code: 'combo-corte-barba', price: 15.00 }]
]);

const MAX_BODY_BYTES = 4096;
const MAX_NAME_LENGTH = 100;
const BUSINESS_TIMEZONE_OFFSET = '-06:00'; // San Miguel, El Salvador.

function json(data, status, request, env) {
  const origin = request.headers.get('Origin');
  const configuredOrigin = env.ALLOWED_ORIGIN || '*';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store'
  });

  if (configuredOrigin === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin === configuredOrigin) {
    headers.set('Access-Control-Allow-Origin', configuredOrigin);
    headers.set('Vary', 'Origin');
  }

  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(JSON.stringify(data), { status, headers });
}

function parseBusinessDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}:00${BUSINESS_TIMEZONE_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'El cuerpo de la solicitud no es válido.' };
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const servicio = typeof body.servicio === 'string' ? body.servicio.trim() : '';
  const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : '';

  if (nombre.length < 2 || nombre.length > MAX_NAME_LENGTH) {
    return { error: 'El nombre debe tener entre 2 y 100 caracteres.' };
  }

  if (!SERVICES.has(servicio)) {
    return { error: 'El servicio seleccionado no está disponible.' };
  }

  const businessDate = parseBusinessDate(fecha);
  if (!businessDate || businessDate.getTime() <= Date.now()) {
    return { error: 'La fecha y hora deben ser válidas y futuras.' };
  }

  return {
    value: {
      nombre,
      servicio,
      fecha,
      serviceInfo: SERVICES.get(servicio)
    }
  };
}

async function notifyTelegram(reserva, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: [
          'NUEVA RESERVA - CRISTHIAM BARBER SHOP',
          `Cliente: ${reserva.cliente}`,
          `Servicio: ${reserva.servicio}`,
          `Fecha: ${reserva.fecha}`,
          `ID: ${reserva.id}`
        ].join('\n')
      })
    }
  );

  if (!response.ok) {
    console.error('Telegram notification failed', response.status);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return json({ status: 'ok' }, 204, request, env);
    }

    if (url.pathname !== '/api/reservar' || request.method !== 'POST') {
      return json({ error: 'Ruta no encontrada.' }, 404, request, env);
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ error: 'La base D1 no está configurada.' }, 503, request, env);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: 'La solicitud es demasiado grande.' }, 413, request, env);
    }

    try {
      const body = await request.json();
      const validation = validatePayload(body);
      if (validation.error) {
        return json({ error: validation.error }, 400, request, env);
      }

      const { nombre, servicio, fecha, serviceInfo } = validation.value;
      const id = crypto.randomUUID();
      const result = await env.DB.prepare(
        `INSERT INTO reservas (id, cliente, servicio, precio, fecha, estado)
         VALUES (?, ?, ?, ?, ?, 'confirmed')`
      ).bind(id, nombre, serviceInfo.code, serviceInfo.price, fecha).run();

      if (!result.success || result.meta?.changes !== 1) {
        console.error('D1 insert did not commit', result);
        return json({ error: 'No fue posible guardar la reserva.' }, 500, request, env);
      }

      const reserva = {
        id,
        cliente: nombre,
        servicio,
        fecha,
        precio: serviceInfo.price,
        estado: 'confirmed'
      };

      ctx.waitUntil(notifyTelegram(reserva, env));

      return json({ status: 'success', data: reserva }, 201, request, env);
    } catch (error) {
      const message = String(error?.message || error);
      if (/unique|constraint/i.test(message)) {
        return json({ error: 'La franja horaria ya está reservada.' }, 409, request, env);
      }

      console.error('Reservation error', message);
      return json({ error: 'No fue posible procesar la reserva.' }, 500, request, env);
    }
  }
};
