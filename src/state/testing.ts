import { seed } from './seed.js'
import type { State } from './types.js'

// The seed without its illustrative device event, for tests that count events or expect the first new one to be EVT-001.
export function seedBare(now: number): State {
  const s = seed(now)
  return { ...s, cases: s.cases.filter((c) => c.kind !== 'event'), seq: { ...s.seq, evt: 1 } }
}
