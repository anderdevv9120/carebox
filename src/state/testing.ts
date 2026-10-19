import { seed } from './seed.js'
import type { State } from './types.js'

// The seed without its illustrative device event and waiting CB-003, for tests that count events or expect the first new ones to be EVT-001 and CB-003.
export function seedBare(now: number): State {
  const s = seed(now)
  return { ...s, cases: s.cases.filter((c) => c.kind !== 'event' && c.id !== 'CB-003'), seq: { ...s.seq, cb: 3, evt: 1 } }
}
