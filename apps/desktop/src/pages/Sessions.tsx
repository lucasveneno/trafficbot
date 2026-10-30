import { useState } from 'react'
import { X } from 'lucide-react'
import type { ControlSnapshot, SessionView } from '../types/control'
import { Badge } from '../components/Badge'
import { PlatformIcon, platformLabel } from '../components/PlatformIcon'
import { StatusDot } from '../components/StatusDot'
import type { Connection } from '../services/control'
import { sessionApi } from '../services/api'
import { toast } from '../components/Toast'
import { useUI } from '../stores/ui'

const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString() : '—')
const elapsed = (ms: number | null) => {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function SessionDetailPanel({
  session,
  onClose,
  connection,
}: {
  session: SessionView
  onClose: () => void
  connection?: Connection | null
}) {
  return (
    <div className="detail-panel" role="complementary" aria-label="Session details">
      <button className="detail-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>

      <div className="detail-eyebrow">SESSION DETAILS</div>
      <div className="detail-platform-row">
        <PlatformIcon platform={session.platform} size={20} />
        <div>
          <h2 className="detail-title">Browser session</h2>
          <small className="detail-id">{session.id}</small>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => useUI.getState().setLogFilter(session.executionId || session.url)}>Search related logs</button>
        <Badge value={session.status} />
        {connection && ['active', 'queued', 'delayed', 'failed'].includes(session.status) && <button onClick={() => {
          const retry = session.status === 'failed'
          if (!confirm(`${retry ? 'Retry' : 'Stop'} this session?`)) return
          void (retry ? sessionApi.retry(connection, session.id) : sessionApi.stop(connection, session.id)).then(() => toast.success(retry ? 'Retry queued' : 'Stop requested')).catch(e => toast.error(String(e)))
        }}>{session.status === 'failed' ? 'Retry session' : 'Stop session'}</button>}
      </div>

      <div className="detail-subheader">Identity</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Session ID</dt><dd className="mono">{session.id}</dd></div>
        <div className="detail-row"><dt>URL</dt><dd className="url-wrap">{session.url}</dd></div>
        <div className="detail-row"><dt>Platform</dt><dd>{platformLabel(session.platform)}</dd></div>
        <div className="detail-row"><dt>Browser</dt><dd>{session.browser ?? 'Worker default'}</dd></div>
        <div className="detail-row"><dt>Profile ID</dt><dd>{session.profileId ?? '—'}</dd></div>
        <div className="detail-row"><dt>Profile type</dt><dd>{session.persistent ? 'Persistent' : 'Ephemeral'}</dd></div>
        <div className="detail-row"><dt>Proxy</dt><dd>{session.proxy}</dd></div>
      </div>

      <div className="detail-subheader">Execution</div>
      <ol aria-label="Session timeline">{[['Queued', session.createdAt], ['Started', session.startedAt], [session.status === 'failed' ? 'Failed' : 'Finished', session.finishedAt]].map(([label, timestamp]) => timestamp && <li key={label}>{label} · {time(timestamp)}</li>)}</ol>
      <div className="detail-section">
        <div className="detail-row"><dt>Worker</dt><dd>{session.workerId ?? 'Unassigned'}</dd></div>
        <div className="detail-row"><dt>Attempts</dt><dd>{session.attempts}</dd></div>
        <div className="detail-row"><dt>Created at</dt><dd>{time(session.createdAt)}</dd></div>
        <div className="detail-row"><dt>Started at</dt><dd>{time(session.startedAt)}</dd></div>
        <div className="detail-row"><dt>Finished at</dt><dd>{time(session.finishedAt)}</dd></div>
        <div className="detail-row"><dt>Duration</dt><dd>{elapsed(session.durationMs)}</dd></div>
      </div>

      {session.error && (
        <>
          <div className="detail-subheader error-subheader">Error</div>
          <div className="detail-section">
            <div className="error-message">{session.error}</div>
          </div>
        </>
      )}

      {session.deviceSerial && (
        <>
          <div className="detail-subheader">Android device</div>
          <div className="detail-section">
            <div className="detail-row"><dt>Serial</dt><dd className="mono">{session.deviceSerial}</dd></div>
          </div>
        </>
      )}
    </div>
  )
}

function SessionRow({
  s,
  onClick,
}: {
  s: SessionView
  onClick: () => void
}) {
  return (
    <tr>
      <td>
        <button className="text-link url-cell" onClick={onClick} title={s.url}>
          {s.url}
        </button>
        <small className="mono">{s.id.slice(-14)}</small>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={s.status} size={6} />
          <Badge value={s.status} />
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlatformIcon platform={s.platform} size={12} />
          <span>{s.platform}</span>
        </div>
        <small>{s.browser ?? 'default'}</small>
      </td>
      <td>{s.workerId ?? <span className="muted-label">unassigned</span>}</td>
      <td>{s.persistent ? <Badge value="persistent" /> : <span className="muted-label">ephemeral</span>}</td>
      <td>{s.proxy === 'configured' ? <Badge value="proxy" /> : <span className="muted-label">direct</span>}</td>
      <td className="muted-label">{time(s.startedAt)}</td>
      <td className="muted-label">{elapsed(s.durationMs)}</td>
    </tr>
  )
}

export function Sessions({
  data,
  search,
  status,
  platform,
  connection,
}: {
  data?: ControlSnapshot
  search: string
  status: string
  platform: string
  connection?: Connection | null
}) {
  const [selected, setSelected] = useState<SessionView | null>(null)
  const [browser, setBrowser] = useState('all'), [worker, setWorker] = useState('all'), [persistence, setPersistence] = useState('all')
  const [campaign, setCampaign] = useState('all')

  const all = data?.sessions ?? []
  const filtered = all.filter((s) => {
    if (status !== 'all' && s.status !== status) return false
    if (platform !== 'all' && s.platform !== platform) return false
    if (campaign !== 'all' && s.campaignId !== campaign) return false
    if (browser !== 'all' && s.browser !== browser || worker !== 'all' && s.workerId !== worker || persistence !== 'all' && s.persistent !== (persistence === 'persistent')) return false
    const q = search.toLowerCase()
    return !q || `${s.id} ${s.url} ${s.workerId ?? ''} ${s.profileId ?? ''}`.toLowerCase().includes(q)
  })

  const live = filtered.filter((s) => s.status === 'active').length
  const total = filtered.length

  return (
    <div className="page-with-detail">
      <div className="page-main">
        <div className="table-toolbar">
          <select aria-label="Campaign filter" value={campaign} onChange={e => setCampaign(e.target.value)}><option value="all">All campaigns</option>{[...new Set(all.map(s => s.campaignId).filter(Boolean))].map(c => <option key={c} value={c!}>{c}</option>)}</select>
          <select aria-label="Browser filter" value={browser} onChange={e => setBrowser(e.target.value)}><option value="all">All browsers</option>{[...new Set(all.map(s => s.browser).filter(Boolean))].map(b => <option key={b} value={b!}>{b}</option>)}</select>
          <select aria-label="Worker filter" value={worker} onChange={e => setWorker(e.target.value)}><option value="all">All workers</option>{[...new Set(all.map(s => s.workerId).filter(Boolean))].map(w => <option key={w} value={w!}>{w}</option>)}</select>
          <select aria-label="Persistence filter" value={persistence} onChange={e => setPersistence(e.target.value)}><option value="all">All profiles</option><option value="persistent">Persistent</option><option value="ephemeral">Ephemeral</option></select>
          <span className="table-count">
            {live > 0 && (
              <>
                <StatusDot status="active" size={7} />
                <span style={{ marginLeft: 6 }}>{live} active</span>
                <span className="muted-label" style={{ margin: '0 10px' }}>·</span>
              </>
            )}
            {total} session{total !== 1 ? 's' : ''}
          </span>
          {selected && (
            <span className="muted-label">{selected.url}</span>
          )}
        </div>

        <section className="panel">
          <table>
            <thead>
              <tr>
                {['Target URL / ID', 'Status', 'Platform', 'Worker', 'Profile', 'Proxy', 'Started', 'Duration'].map(
                  (h) => <th key={h}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <SessionRow key={s.id} s={s} onClick={() => setSelected(s)} />
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-hint">
              {all.length
                ? 'No sessions match the current filters.'
                : 'No sessions yet. Sessions submitted to the backend will appear here.'}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <SessionDetailPanel
          connection={connection}
          session={data?.sessions.find((s) => s.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
