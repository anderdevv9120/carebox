import { Redis } from '@upstash/redis'
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import type { State } from '../src/state/types.js'

const KEY = 'carebox:state'
const env = process.env
// Upstash from the Vercel Marketplace sets either the UPSTASH_* or the KV_* pair.
const [url, token] = env.UPSTASH_REDIS_REST_URL
  ? [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN]
  : [env.KV_REST_API_URL, env.KV_REST_API_TOKEN]
const redis = url && token ? new Redis({ url, token }) : null
const localFile = join(process.cwd(), '.carebox-state.json')

if (!redis && process.env.VERCEL) throw new Error('Configure Upstash Redis for persistent CAREBOX state on Vercel.')

// Unit tests use memory; local development uses a file that survives server restarts.
let memory: unknown = null

export async function loadState(): Promise<unknown> {
  if (redis) return redis.get(KEY)
  if (process.env.VITEST) return memory
  try {
    return JSON.parse(await readFile(localFile, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function saveState(s: State): Promise<void> {
  if (redis) return void await redis.set(KEY, s)
  if (process.env.VITEST) { memory = s; return }
  const tmp = `${localFile}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(s))
    // Windows readers or sync tools may briefly lock the destination against replacement.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, localFile)
        break
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (attempt >= 3 || (code !== 'EPERM' && code !== 'EBUSY')) throw err
        await setTimeout(50 * (attempt + 1))
      }
    }
  } finally {
    await rm(tmp, { force: true })
  }
}

// tests only
export function resetMemory(): void {
  memory = null
}
