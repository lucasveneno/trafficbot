export function ProgressBar({
  value,
  max,
  label,
  color,
}: {
  value: number
  max: number
  label?: string
  color?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const fill = color ?? (pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#6cabf7')

  return (
    <div className="progress-bar-wrap" aria-label={label}>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        aria-valuemin={0}
      >
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
      {label && <small className="progress-bar-label">{label}</small>}
    </div>
  )
}
