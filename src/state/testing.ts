import { seed } from './seed.js'
import type { State } from './types.js'

// The seed without its illustrative device event (and the BP reading behind it) and waiting CB-003, for tests that count events or expect the first new ones to be EVT-001 and CB-003.
export function seedBare(now: number): State {
  const s = seed(now)
  const devices = s.devices.map((d) => (d.id === 'bp' ? { ...d, readings: d.readings.slice(0, -1) } : d))
  return { ...s, devices, cases: s.cases.filter((c) => c.kind !== 'event' && c.id !== 'CB-003'), seq: { ...s.seq, cb: 3, evt: 1 } }
}
