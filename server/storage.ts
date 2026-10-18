import { Redis } from '@upstash/redis'
import type { State } from '../src/state/types.js'

const KEY = 'carebox:state'
const env = process.env
// Upstash from the Vercel Marketplace sets either the UPSTASH_* or the KV_* pair.
const [url, token] = env.UPSTASH_REDIS_REST_URL
  ? [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN]
  : [env.KV_REST_API_URL, env.KV_REST_API_TOKEN]
const redis = url && token ? new Redis({ url, token }) : null

// Without Redis (local dev) the state lives as long as this process.
let memory: unknown = null

export async function loadState(): Promise<unknown> {
  return redis ? redis.get(KEY) : memory
}

export async function saveState(s: State): Promise<void> {
  if (redis) await redis.set(KEY, s)
  else memory = s
}

// tests only
export function resetMemory(): void {
  memory = null
}
