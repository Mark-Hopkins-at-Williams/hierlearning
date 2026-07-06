import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import http from 'http'

const translationsPath = join(process.cwd(), 'translations.json')

function translationsPlugin() {
  return {
    name: 'translations-api',
    configureServer(server) {
      server.middlewares.use('/api/translations', (req, res) => {
        if (req.method === 'GET') {
          const data = existsSync(translationsPath)
            ? readFileSync(translationsPath, 'utf-8')
            : '[]'
          res.setHeader('Content-Type', 'application/json')
          res.end(data)
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              JSON.parse(body)
              writeFileSync(translationsPath, body, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end('{"ok":true}')
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else {
          res.statusCode = 405
          res.end('Method not allowed')
        }
      })
    }
  }
}

function parseProxyPlugin() {
  return {
    name: 'parse-proxy',
    configureServer(server) {
      server.middlewares.use('/api/parse', (req, res) => {
        const opts = {
          hostname: 'localhost',
          port: 5001,
          path: '/api/parse',
          method: req.method,
          headers: { ...req.headers, host: 'localhost:5001' },
        }
        const proxy = http.request(opts, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res)
        })
        proxy.on('error', (err) => {
          res.statusCode = err.code === 'ECONNREFUSED' ? 502 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: err.code === 'ECONNREFUSED'
              ? 'Parser server not running — start it with: python server.py'
              : err.message,
          }))
        })
        req.pipe(proxy)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), translationsPlugin(), parseProxyPlugin()],
})
