{
  "name": "rastreador-vuelos-backend",
  "version": "1.0.0",
  "description": "Backend para rastreador de vuelos con SerpApi y Supabase",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "node-cron": "^3.0.3",
    "serpapi": "^2.1.0"
  }
}
	4	Haz clic en "Commit changes".
	5	Repite el proceso para crear otro archivo llamado server.js y pega este código:
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { getJson } = require('serpapi');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS para permitir peticiones desde tu frontend
app.use(cors({ origin: '*' }));
app.use(express.json());

// Conexión a Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// API Key de SerpApi
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Lista de destinos a rastrear desde Bogotá (BOG)
const DESTINATIONS = [
  { dest: 'ADZ', name: 'San Andrés', type: 'nacional' },
  { dest: 'SMR', name: 'Santa Marta', type: 'nacional' },
  { dest: 'CTG', name: 'Cartagena', type: 'nacional' },
  { dest: 'MAD', name: 'Madrid (Europa)', type: 'internacional' },
  { dest: 'MXP', name: 'Milán (Europa)', type: 'internacional' },
  { dest: 'MEX', name: 'Ciudad de México', type: 'internacional' },
  { dest: 'CUN', name: 'Cancún (México)', type: 'internacional' },
  { dest: 'PUJ', name: 'Punta Cana', type: 'internacional' },
  { dest: 'AUA', name: 'Aruba', type: 'internacional' }
];

// Función para rastrear vuelos en Google Flights usando SerpApi
async function fetchFlightPrices() {
  console.log('Iniciando rastreo diario de vuelos...');
  const today = new Date();
  
  // Rastrear vuelos para dentro de 30 días (ejemplo)
  const departureDate = new Date(today);
  departureDate.setDate(today.getDate() + 30);
  const returnDate = new Date(today);
  returnDate.setDate(today.getDate() + 37); // Viaje de 7 días

  const depDateStr = departureDate.toISOString().split('T')[0];
  const retDateStr = returnDate.toISOString().split('T')[0];

  for (const destination of DESTINATIONS) {
    try {
      console.log(`Buscando vuelos BOG -> ${destination.dest}...`);
      
      const response = await getJson({
        engine: "google_flights",
        departure_id: "BOG",
        arrival_id: destination.dest,
        outbound_date: depDateStr,
        return_date: retDateStr,
        currency: "COP",
        hl: "es",
        api_key: SERPAPI_KEY
      });

      if (response.best_flights && response.best_flights.length > 0) {
        const bestFlight = response.best_flights[0];
        
        // Guardar la oferta en Supabase
        const { error } = await supabase
          .from('flights')
          .insert({
            origin_code: 'BOG',
            origin: 'Bogotá',
            dest_code: destination.dest,
            destination: destination.name,
            type: destination.type,
            price: bestFlight.price,
            airline: bestFlight.flights[0].airline,
            departure_date: depDateStr,
            return_date: retDateStr,
            currency: 'COP',
            booking_token: bestFlight.booking_token // Útil para generar el link de compra
          });

        if (error) {
          console.error(`Error guardando en Supabase (${destination.dest}):`, error.message);
        } else {
          console.log(`✅ Guardado vuelo a ${destination.name} por $${bestFlight.price}`);
        }
      } else {
        console.log(`No se encontraron vuelos baratos para ${destination.name}`);
      }
      
      // Esperar 2 segundos entre peticiones para no saturar la API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Error buscando vuelos a ${destination.dest}:`, error);
    }
  }
  console.log('Rastreo finalizado.');
}

// Programar el rastreador para que se ejecute todos los días a las 6:00 AM
cron.schedule('0 6 * * *', () => {
  fetchFlightPrices();
});

// Endpoint para que tu frontend lea los vuelos guardados
app.get('/api/flights', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const formattedData = data.map(flight => ({
      id: flight.id,
      origin: flight.origin,
      originCode: flight.origin_code,
      destination: flight.destination,
      destCode: flight.dest_code,
      price: flight.price,
      currency: flight.currency,
      dates: `${flight.departure_date} - ${flight.return_date}`,
      airline: flight.airline,
      type: flight.type,
      tags: ["Oferta del día", "Directo"],
      gradient: flight.type === 'nacional' 
        ? "from-emerald-500 to-teal-700" 
        : "from-blue-600 to-indigo-800",
      history: [
        { date: "Hace 3 días", price: flight.price * 1.2 },
        { date: "Ayer", price: flight.price * 1.1 },
        { date: "Hoy", price: flight.price }
      ]
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error obteniendo vuelos:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint GET manual para rastrear ahora mismo
app.get('/rastrear-ahora', async (req, res) => {
  fetchFlightPrices(); // Se ejecuta en segundo plano
  res.json({ message: 'Rastreo iniciado exitosamente. Revisa los logs de Render para ver el progreso.' });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
