import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      /* כל בקשת /api מופנית לשרת ה-Express.
         timeout של 10 דקות — יצירת הדמיה גדולה יכולה להימשך זמן רב,
         והפרוקסי לא יחתוך אותה לפני הגבול הלוגי. */
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600_000, /* המתנה לקלט מהלקוח */
        proxyTimeout: 600_000, /* המתנה לתגובת ה-target (Express) */
      },
    },
  },
})
