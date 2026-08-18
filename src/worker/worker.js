export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/reservar' && request.method === 'POST') {
      try {
        const body = await request.json();

        if (!body.nombre || !body.fecha) {
          return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const resId = crypto.randomUUID();
        const reserva = {
          id: resId,
          cliente: body.nombre,
          servicio: body.servicio,
          fecha: body.fecha,
          timestamp: Date.now()
        };

        // Notificación opcional por Telegram si existen credenciales
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          ctx.waitUntil(
            fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: `💈 *NUEVA RESERVA - CRIS THIAM BARBER SHOP*\n\n👤 *Cliente:* ${reserva.cliente}\n✂️ *Servicio:* ${reserva.servicio}\n📅 *Fecha:* ${reserva.fecha}\n🔑 *ID:* \`${reserva.id}\``,
                parse_mode: 'Markdown'
              })
            })
          );
        }

        return new Response(JSON.stringify({ status: 'success', data: reserva }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: 'Payload JSON inválido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Cristhiam Barber Shop API Node - Active', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
};
