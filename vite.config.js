import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:https` (modo "https") activa un certificado local autofirmado: el celular lo acepta
// con una advertencia y así funciona la geolocalización del navegador (exige HTTPS).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'https' ? basicSsl() : null,
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RumbaLive',
        short_name: 'RumbaLive',
        description: 'Estado en tiempo real de la fila, el cover y el aforo de los locales.',
        theme_color: '#0b0b12',
        background_color: '#0b0b12',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ].filter(Boolean),
  // Permite abrir el servidor de desarrollo a través de un túnel (cloudflared, ngrok, VS Code Ports).
  server: { allowedHosts: true }
}))
