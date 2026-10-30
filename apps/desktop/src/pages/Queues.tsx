import type { ControlSnapshot, QueueView } from '../types/control'
import { PlatformIcon, platformLabel } from '../components/PlatformIcon'
import { StatusDot } from '../components/StatusDot'
import type { Platform } from '../types/control'

const PLATFORM_ORDER: Platform[] = ['linux', 'windows', 'macos', 'android', 'ios']

function QueueStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="queue-stat">
      <strong style={color && value > 0 ? { color } : undefined}>{value}</strong>
      <small>{label}</small>
    </div>
  )
}

function QueueCard({ q, compact }: { q: QueueView; compact?: boolean }) {
  const total = q.waiting + q.active + q.delayed
  const hasWork = total > 0
  return (
    <article className={`queue-card-v2 ${compact ? 'compact' : ''}`}>
      <div className="queue-card-header-v2">
        {compact && <PlatformIcon platform={q.platform} size={12} />}
        <div className="queue-card-title">
          <strong>{q.label}</strong>
          {q.deviceSerial && <small className="mono">{q.deviceSerial}</small>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={hasWork ? 'active' : 'offline'} size={6} />
          <span className="muted-label" style={{ fontSize: 10 }}>{hasWork ? `${total} pending` : 'idle'}</span>
        </div>
      </div>
      <div className="queue-stats-v2">
        <QueueStat value={q.waiting} label="waiting" />
        <QueueStat value={q.active} label="active" color="#93c5fd" />
        <QueueStat value={q.delayed} label="delayed" />
        <QueueStat value={q.failed} label="failed" color={q.failed > 0 ? '#f87171' : undefined} />
        <QueueStat value={q.completed} label="done" color="#6ee7b7" />
      </div>
    </article>
  )
}

function PlatformSection({
  platform,
  queues,
}: {
  platform: Platform
  queues: QueueView[]
}) {
  if (!queues.length) return null

  const generic = queues.find((q) => !q.deviceSerial)
  const devices = queues.filter((q) => !!q.deviceSerial)

  return (
    <section className="queue-platform-section">
      <div className="queue-platform-header">
        <PlatformIcon platform={platform} size={15} />
        <h3>{platformLabel(platform)}</h3>
        <span className="platform-count">{queues.length} queue{queues.length > 1 ? 's' : ''}</span>
      </div>

      {generic && <QueueCard q={generic} />}

      {devices.length > 0 && (
        <div className="device-queues">
          <div className="device-queues-label">Device queues</div>
          <div className="device-queues-grid">
            {devices.map((q) => (
              <QueueCard key={q.id} q={q} compact />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export function Queues({ data }: { data?: ControlSnapshot }) {
  const queues = data?.queues ?? []

  const byPlatform = new Map<Platform, QueueView[]>()
  for (const p of PLATFORM_ORDER) byPlatform.set(p, [])
  for (const q of queues) {
    const list = byPlatform.get(q.platform)
    if (list) list.push(q)
  }

  const totalWaiting = queues.reduce((s, q) => s + q.waiting, 0)
  const totalActive = queues.reduce((s, q) => s + q.active, 0)
  const totalFailed = queues.reduce((s, q) => s + q.failed, 0)

  return (
    <>
      <div className="queue-summary-bar">
        <span><StatusDot status="queued" size={7} /><b>{totalWaiting}</b> waiting</span>
        <span><StatusDot status="active" size={7} /><b>{totalActive}</b> active</span>
        {totalFailed > 0 && <span><StatusDot status="failed" size={7} /><b>{totalFailed}</b> failed</span>}
        <span className="muted-label">{queues.length} queue{queues.length !== 1 ? 's' : ''}</span>
      </div>

      {!queues.length && (
        <div className="empty-panel">
          <div className="empty-icon">📭</div>
          <h2>No queues</h2>
          <p>Queue data will appear when Redis is connected and workers are registered.</p>
        </div>
      )}

      {PLATFORM_ORDER.map((p) => (
        <PlatformSection key={p} platform={p} queues={byPlatform.get(p) ?? []} />
      ))}
    </>
  )
}
