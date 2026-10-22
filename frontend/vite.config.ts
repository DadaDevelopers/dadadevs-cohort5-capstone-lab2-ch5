import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from the root of the Render static site
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
