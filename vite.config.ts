import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves a project site at https://<user>.github.io/Giference/
// so the app must be built with that base path. Overridable via env for
// other hosts (e.g. a custom domain or Vercel where base should be '/').
const base = process.env.GIFERENCE_BASE ?? '/Giference/'

export default defineConfig({
  base,
  plugins: [react()],
})
