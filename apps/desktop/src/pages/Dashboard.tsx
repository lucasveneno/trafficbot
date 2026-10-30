import { useState, useEffect } from 'react'
import { Onboarding } from '../components/Onboarding'
import { Activity, Cpu, Layers } from 'lucide-react'
import type { ControlSnapshot, WorkerView, SessionView, QueueView } from '../types/control'
import { StatCard } from '../components/StatCard'
import { StatusDot } from '../components/StatusDot'
import { ProgressBar } from '../components/ProgressBar'
import { PlatformIcon } from '../components/PlatformIcon'
import { Badge } from '../components/Badge'
import { MetricsChart, SuccessRateChart } from '../components/MetricsChart'
import { metricsApi, type MetricsBucketDto } from '../services/api'

const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString() : '—')
const elapsed = (ms: number | null) => {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function WorkerBar({ w, onClick }: { w: WorkerView; onClick: () => void }) {
  return (
    <button className="utilization-row" onClick={onClick}>
      <div className="utilization-row-header">
        <PlatformIcon platform={w.platform} size={13} />
        <strong>{w.id}</strong>
        <StatusDot status={w.health} size={6} />
      </div>
      <ProgressBar value={w.active} max={w.capacity} />
      <small className="utilization-row-note">
        {w.active} / {w.capacity} slots · {w.runtime}
      </small>
    </button>
  )
}

function QueueCard({ q }: { q: QueueView }) {
  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <PlatformIcon platform={q.platform} size={13} />
        <strong>{q.label}</strong>
      </div>
      {q.deviceSerial && <small className="queue-device">{q.deviceSerial}</small>}
      <div className="queue-stats">
        <span>
          <b>{q.waiting}</b>
          <small>waiting</small>
        </span>
        <span>
          <b>{q.active}</b>
          <small>active</small>
        </span>
        <span>
          <b>{q.failed}</b>
          <small>failed</small>
        </span>
        <span>
          <b>{q.completed}</b>
          <small>done</small>
        </span>
      </div>
    </article>
  )
}

function SessionRow({ s, onClick }: { s: SessionView; onClick: () => void }) {
  return (
    <tr>
      <td>
        <button className="text-link url-cell" onClick={onClick}>
          {s.url}
        </button>
        <small>{s.id.slice(-14)}</small>
      </td>
      <td>
        <Badge value={s.status} />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlatformIcon platform={s.platform} size={12} />
          {s.platform}
        </div>
        <small>{s.browser ?? 'default'}</small>
      </td>
      <td>{s.workerId ?? '—'}</td>
      <td>{time(s.startedAt)}</td>
      <td>{elapsed(s.durationMs)}</td>
    </tr>
  )
}

export function Dashboard({
  data,
  live,
  owned,
  connection,
}: {
  data?: ControlSnapshot
  live: boolean
  owned?: boolean
  connection?: import('../services/control').Connection | null
}) {
  const [_selectedWorker, setSelectedWorker] = useState<WorkerView | null>(null)
  const [_selectedSession, setSelectedSession] = useState<SessionView | null>(null)
  const sys = data?.system
  const recent = data?.sessions.slice(0, 8) ?? []

  const [metrics, setMetrics] = useState<MetricsBucketDto[]>([])
  const [metricsRange, setMetricsRange] = useState<'15m'|'1h'|'6h'|'24h'|'7d'>('24h')

  useEffect(() => {
    if (!connection) return
    let interval = '15m'
    let from = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (metricsRange === '15m') { interval = '1m'; from = new Date(Date.now() - 15 * 60 * 1000) }
    else if (metricsRange === '1h') { interval = '1m'; from = new Date(Date.now() - 60 * 60 * 1000) }
    else if (metricsRange === '6h') { interval = '5m'; from = new Date(Date.now() - 6 * 60 * 60 * 1000) }
    else if (metricsRange === '24h') { interval = '15m'; from = new Date(Date.now() - 24 * 60 * 60 * 1000) }
    else if (metricsRange === '7d') { interval = '1h'; from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }

    metricsApi.query(connection, from.toISOString(), new Date().toISOString(), interval)
      .then(setMetrics)
      .catch(() => undefined)
  }, [connection, metricsRange, data?.system.counts.completedToday])

  // Group queue cards: generic queues first, then android device sub-entries
  const genericQueues = data?.queues.filter((q) => !q.deviceSerial) ?? []
  const androidDeviceQueues = data?.queues.filter((q) => !!q.deviceSerial) ?? []

  return (
    <>
      <Onboarding data={data} connection={connection} />

      {/* ── Stats row ── */}
      <div className="stats-row">
        <StatCard
          label="Active sessions"
          value={sys?.counts.active}
          note="Running now"
          accent="blue"
        />
        <StatCard
          label="Queued"
          value={sys?.counts.queued}
          note="Waiting for worker"
        />
        <StatCard
          label="Completed today"
          value={sys?.counts.completedToday}
          note="UTC midnight reset"
          accent="green"
        />
        <StatCard
          label="Failed"
          value={sys?.counts.failed}
          note="Queue history"
          accent={sys?.counts.failed ? 'red' : undefined}
        />
        <StatCard
          label="Workers online"
          value={sys?.counts.workers}
          note="Heartbeat ≤ 30s"
        />
        <StatCard
          label="Total capacity"
          value={sys?.counts.capacity}
          note="Concurrent slots"
        />
      </div>

      {metrics.length > 0 && (
        <div className="dashboard-grid">
          <section className="panel" style={{ gridColumn: 'span 2' }}>
            <div className="panel-header">
              <h2>Throughput</h2>
              <select value={metricsRange} onChange={e => setMetricsRange(e.target.value as any)}>
                <option value="15m">Last 15m</option>
                <option value="1h">Last 1h</option>
                <option value="6h">Last 6h</option>
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
              </select>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <MetricsChart data={metrics} />
            </div>
          </section>
          
          <section className="panel" style={{ gridColumn: 'span 2' }}>
            <div className="panel-header">
              <h2>Success Rate</h2>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <SuccessRateChart data={metrics} />
            </div>
          </section>
        </div>
      )}

      {/* ── Two-column grid ── */}
      <div className="dashboard-grid">
        {/* Worker utilization */}
        <section className="panel">
          <div className="panel-header">
            <h2>Worker utilization</h2>
            <Cpu size={15} />
          </div>
          <div className="panel-body">
            {data?.workers.length ? (
              data.workers.map((w) => (
                <WorkerBar key={w.id} w={w} onClick={() => setSelectedWorker(w)} />
              ))
            ) : (
              <div className="empty-hint">No workers registered. Start a Trafficbot worker to see it here.</div>
            )}
          </div>
        </section>

        {/* System health */}
        <section className="panel">
          <div className="panel-header">
            <h2>System health</h2>
            <Activity size={15} />
          </div>
          <div className="panel-body">
            {[
              ['Controller', sys?.status ?? 'offline'],
              ['Redis', sys?.redis ?? 'unknown'],
              ['Event stream', live ? 'live' : 'offline'],
              ['Engine ownership', owned ? 'desktop' : 'external'],
              [
                'Uptime',
                sys ? `${Math.floor(sys.uptimeSeconds / 60)}m` : '—',
              ],
              ['Platform', sys?.platform ?? '—'],
              ['API version', sys ? `v${sys.apiVersion}` : '—'],
            ].map(([label, value]) => (
              <div className="health-row" key={label}>
                <span className="health-label">{label}</span>
                <span className="health-value">
                  {['Controller', 'Redis', 'Event stream'].includes(label as string) ? (
                    <Badge value={value as string} />
                  ) : (
                    <span className="health-text">{value}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Queue overview ── */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <h2>Queue overview</h2>
          <Layers size={15} />
        </div>
        <div className="queue-grid">
          {genericQueues.map((q) => (
            <QueueCard key={q.id} q={q} />
          ))}
          {androidDeviceQueues.map((q) => (
            <QueueCard key={q.id} q={q} />
          ))}
          {!data?.queues.length && (
            <div className="empty-hint" style={{ padding: '18px 20px' }}>
              Queue data will appear when Redis is connected.
            </div>
          )}
        </div>
      </section>

      {/* ── Recent sessions ── */}
      <section className="panel">
        <div className="panel-header">
          <h2>Recent sessions</h2>
          <span className="muted-label">Latest 8 entries</span>
        </div>
        <table>
          <thead>
            <tr>
              {['Target URL / ID', 'Status', 'Platform', 'Worker', 'Started', 'Duration'].map(
                (h) => (
                  <th key={h}>{h}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <SessionRow key={s.id} s={s} onClick={() => setSelectedSession(s)} />
            ))}
          </tbody>
        </table>
        {!recent.length && (
          <div className="empty-hint">
            No sessions yet. Sessions submitted to the backend will appear here.
          </div>
        )}
      </section>
    </>
  )
}
