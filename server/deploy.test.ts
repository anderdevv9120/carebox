import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

// Vercel's Node runtime transpiles each function file on its own and runs it as native ESM ("type": "module"),
// so relative imports must resolve without a bundler. Mimic that and log in through api/login.
test('api/ functions load and answer under plain Node ESM, as on Vercel', () => {
  const out = mkdtempSync(join(tmpdir(), 'carebox-vercel-'))
  try {
    for (const dir of ['api', 'server', 'src/state']) {
      for (const f of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
        const js = ts.transpileModule(readFileSync(join(ROOT, dir, f), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
        }).outputText
        const dest = join(out, dir, f.replace(/\.ts$/, '.js'))
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, js)
      }
    }
    writeFileSync(join(out, 'package.json'), '{"type":"module"}')
    symlinkSync(join(ROOT, 'node_modules'), join(out, 'node_modules'), 'junction') // @upstash/redis, as Vercel installs it
    const script = `const { POST } = await import(${JSON.stringify(new URL(`file:///${join(out, 'api/login.js').replace(/\\/g, '/')}`).href)});
const r = await POST(new Request('http://x/api/login', { method: 'POST', body: JSON.stringify({ user: 'con.gai', password: 'carebox' }) }));
console.log(r.status, (await r.json()).role)`
    const res = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: out, encoding: 'utf8',
    })
    expect(res.trim()).toBe('200 family')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}, 20_000)
