import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const foodSrc = path.resolve(__dirname, './src/modules/Food')
const servicesApi = path.resolve(__dirname, './src/services/api')
const sharedSrc = path.resolve(__dirname, './src/shared')
const coreSrc = path.resolve(__dirname, './src/core')


export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Triggering dev server refresh to clear module cache
    alias: {
      // More specific first so @food/api/* resolves to services (no backend)
      '@food/api/axios': path.resolve(servicesApi, 'axios.js'),
      '@food/api/config': path.resolve(servicesApi, 'config.js'),
      '@food/api': servicesApi,
      '@food': foodSrc,
      '@shared': sharedSrc,
      '@core': coreSrc,
      '@quickCommerce': path.resolve(__dirname, './src/modules/quickCommerce'),
      '@delivery': path.resolve(__dirname, './src/modules/DeliveryV2'),

      '@common': path.resolve(__dirname, './src/modules/common'),
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      '@emotion/react',
      '@emotion/styled',
      '@mui/material',
      '@mui/x-date-pickers',
    ],
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide'
            }
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'vendor-mui'
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts'
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase'
            }
            return 'vendor-others'
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Backend API (default 5000)
      '/api/v1': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/images': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
