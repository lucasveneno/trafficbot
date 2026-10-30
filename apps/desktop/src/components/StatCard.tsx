export function StatCard({
  label,
  value,
  note,
  accent,
}: {
  label: string
  value: number | string | undefined | null
  note?: string
  accent?: 'green' | 'blue' | 'red' | 'yellow'
}) {
  const accentColor = {
    green: '#6ee7b7',
    blue: '#93c5fd',
    red: '#f87171',
    yellow: '#fbbf24',
  }[accent ?? 'blue']

  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value" style={accent ? { color: accentColor } : undefined}>
        {value ?? '—'}
      </strong>
      {note && <small className="stat-note">{note}</small>}
    </article>
  )
}
