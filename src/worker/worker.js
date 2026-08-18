export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Manejo de CORS
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
        
        // Validación básica
        if (!body.nombre || !body.fecha) {
          return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Respuesta simulación de éxito
        const respuesta = {
          status: 'success',
          message: 'Reserva procesada en el Edge',
          data: {
            id: crypto.randomUUID(),
            cliente: body.nombre,
            servicio: body.servicio,
            fecha: body.fecha,
            timestamp: Date.now()
          }
        };

        return new Response(JSON.stringify(respuesta), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: 'Payload inválido' }), {
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
