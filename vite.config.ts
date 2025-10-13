import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from "@cloudflare/vite-plugin"

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    exclude: ['@noir-lang/noirc_abi', '@noir-lang/acvm_js'],
  },
})