const W = 320
const H = 150
const PAD = { l: 30, r: 18, t: 10, b: 24 }

export function LineChart({ points, band }: { points: { label: string; value: number }[]; band?: [number, number] }) {
  if (!points.length) return <p className="empty">Chưa có dữ liệu</p>
  const values = points.map((p) => p.value).concat(band ?? [])
  const min = Math.min(...values) * 0.95
  const max = Math.max(...values) * 1.05
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(points.length - 1, 1)
  const y = (v: number) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / (max - min || 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Biểu đồ theo dõi">
      {band && (
        <>
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(band[1])} height={y(band[0]) - y(band[1])} fill="#e6f5ea" />
          <text x={PAD.l + 4} y={y(band[1]) + 11} fontSize="9" fill="#3ba55d">ngưỡng giả lập</text>
        </>
      )}
      {[min, (min + max) / 2, max].map((v) => (
        <text key={v} x={2} y={y(v) + 3} fontSize="9" fill="#8a7458">{Math.round(v)}</text>
      ))}
      <polyline fill="none" stroke="#f5a623" strokeWidth="2.5" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke="#e8891c" strokeWidth="2" />
          <text x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#8a7458">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}
