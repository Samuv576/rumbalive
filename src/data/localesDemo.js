// Locales de la DEMO: campus del Tecnológico de Antioquia, sede Robledo.
// Coordenadas medidas en sitio con el panel de calibración (precisión ±4–5 m).
// Deben coincidir con supabase/migrations/0004_seed_locales_campus.sql.
export const LOCALES_DEMO = [
  { id: 'parqueadero_arriba', nombre: 'Parqueadero arriba', lat: 6.280701, lng: -75.582633, radio_m: 35 },
  { id: 'parqueadero_abajo', nombre: 'Parqueadero abajo', lat: 6.279384, lng: -75.583152, radio_m: 35 },
  { id: 'cafeteria_principal', nombre: 'Cafetería principal', lat: 6.280119, lng: -75.583186, radio_m: 20 },
  { id: 'cafeteria_apolo11', nombre: 'Cafetería Apolo 11', lat: 6.279877, lng: -75.582287, radio_m: 20 },
];

// Centro inicial del mapa: promedio de los 4 puntos.
export const CENTRO_INICIAL = { lat: 6.280020, lng: -75.582814, zoom: 17 }
