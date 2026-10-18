/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// `npm run dev` serves /api/* through the same handler the Vercel functions use.
const api = (): Plugin => ({
  name: 'carebox-api',
  configureServer(server) {
    server.middlewares.use('/api', (req, res, next) => {
      const run = async () => {
        const { handle } = (await server.ssrLoadModule('/server/api.ts')) as { handle: (r: Request) => Promise<Response> }
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, String(v))
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
        const r = await handle(new Request(`http://${req.headers.host}/api${req.url}`, {
          method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined,
        }))
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await r.arrayBuffer()))
      }
      run().catch(next)
    })
  },
})

export default defineConfig({
  plugins: [react(), api()],
  test: { environment: 'node' },
})
