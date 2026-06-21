import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const ROOT_ASSETS = new Set([
  'index.html',
  'login.html',
  'background.jpg',
  'favicon.ico',
])

function serveProjectRootStatic() {
  return {
    name: 'serve-project-root-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]

        if (url === '/') {
          const landing = path.join(projectRoot, 'index.html')
          if (fs.existsSync(landing)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(fs.readFileSync(landing))
            return
          }
        }

        const fileName = url.startsWith('/') ? url.slice(1) : url
        if (!ROOT_ASSETS.has(fileName)) {
          next()
          return
        }

        const filePath = path.join(projectRoot, fileName)
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next()
          return
        }

        const ext = path.extname(filePath).toLowerCase()
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.ico': 'image/x-icon',
        }
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
        res.end(fs.readFileSync(filePath))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveProjectRootStatic()],
  server: {
    port: 5173,
    open: '/',
    fs: { allow: [projectRoot] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
