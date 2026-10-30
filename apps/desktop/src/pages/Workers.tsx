import { useState } from 'react'
import { X, Cpu, Search } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import type { ControlSnapshot, WorkerView } from '../types/control'
import { Badge } from '../components/Badge'
import { StatusDot, workerStatus } from '../components/StatusDot'
import { ProgressBar } from '../components/ProgressBar'
import { PlatformIcon, platformLabel } from '../components/PlatformIcon'
import type { Platform } from '../types/control'
import { workerApi } from '../services/api'
import type { Connection } from '../services/control'
import { EnrollmentWizard } from '../components/EnrollmentWizard'
import { FleetUpdateModal } from '../components/FleetUpdateModal'

const PLATFORM_ORDER: Platform[] = ['linux', 'windows', 'macos', 'android', 'ios']

function heartbeatAge(at: string | null): string {
  if (!at) return 'Never'
  const s = Math.floor((Date.now() - new Date(at).getTime()) / 1000)
  if (s < 5) return 'Just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function WorkerDetailPanel({ worker, connection, onClose }: { worker: WorkerView; connection: Connection | null; onClose: () => void }) {
  const status = workerStatus(worker)
  return (
    <div className="detail-panel" role="complementary" aria-label="Worker details">
      <button className="detail-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>

      <div className="detail-eyebrow">WORKER DETAILS</div>
      <div className="detail-platform-row">
        <PlatformIcon platform={worker.platform} size={22} />
        <h2 className="detail-title">{worker.id}</h2>
      </div>
      <div style={{ marginBottom: 16 }}>
        <StatusDot status={status} size={8} />
        <span style={{ marginLeft: 6, fontSize: 12 }}>{status}</span>
      </div>

      <div className="detail-section">
        <div className="detail-row"><dt>Platform</dt><dd>{platformLabel(worker.platform)}</dd></div>
        <div className="detail-row"><dt>Architecture</dt><dd>{worker.architecture}</dd></div>
        <div className="detail-row"><dt>Runtime</dt><dd>{worker.runtime}</dd></div>
        <div className="detail-row"><dt>Version</dt><dd>{worker.version || 'Unknown'}</dd></div>
        <div className="detail-row"><dt>Compatibility</dt><dd><Badge value={worker.compatibility} /></dd></div>
        <div className="detail-row"><dt>Health</dt><dd><Badge value={worker.health} /></dd></div>
        <div className="detail-row"><dt>Last heartbeat</dt><dd>{heartbeatAge(worker.heartbeatAt)}</dd></div>
      </div>

      <div className="detail-section" style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => connection && workerApi.drain(connection, worker.id)} disabled={!connection}>Drain</button>
        {worker.status === 'disabled' ? (
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => connection && workerApi.enable(connection, worker.id)} disabled={!connection}>Enable</button>
        ) : (
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => connection && workerApi.disable(connection, worker.id)} disabled={!connection}>Disable</button>
        )}
      </div>

      {(worker.compatibility === 'update_available' || worker.compatibility === 'upgrade_required') && (
        <div className="detail-section" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {worker.compatibility === 'upgrade_required'
              ? '⚠ Upgrade required — this worker protocol is no longer compatible.'
              : `Update available`}
          </div>
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            disabled={!connection}
            onClick={() => {
              if (confirm(
                `Update worker ${worker.id}?\n\nCurrent: ${worker.version || 'unknown'}\n\n` +
                `Trafficbot will drain active sessions before updating. Active sessions will not be interrupted.`
              )) {
                connection && workerApi.update(connection, worker.id);
              }
            }}
          >
            Drain & Update
          </button>
        </div>
      )}

      {worker.rollbackAvailable && (
        <div className="detail-section" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Rollback available
            {worker.rollbackVersion && <><br/>Previous version: {worker.rollbackVersion}</>}
          </div>
          <button
            className="btn-danger"
            style={{ width: '100%', opacity: 0.9 }}
            disabled={!connection}
            onClick={() => {
              if (confirm(
                `Rollback worker ${worker.id} to ${worker.rollbackVersion || 'previous version'}?\n\n` +
                `Trafficbot will drain active sessions before rolling back.`
              )) {
                connection && workerApi.rollback(connection, worker.id);
              }
            }}
          >
            Rollback to {worker.rollbackVersion || 'previous'}
          </button>
        </div>
      )}

      {worker.compatibility === 'server_upgrade_required' && (
        <div className="detail-section" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--danger)' }}>
            ⛔ Worker protocol is newer than the Control Server supports. Upgrade the Control Server first.
          </div>
        </div>
      )}

      <div className="detail-subheader">Capacity</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Active sessions</dt><dd>{worker.active}</dd></div>
        <div className="detail-row"><dt>Max concurrent</dt><dd>{worker.capacity}</dd></div>
        <div style={{ padding: '8px 0' }}>
          <ProgressBar value={worker.active} max={worker.capacity} label={`${worker.active} / ${worker.capacity} slots used`} />
        </div>
      </div>

      <div className="detail-subheader">Browser capabilities</div>
      <div className="detail-section">
        {worker.browsers.length ? worker.browsers.map((b, i) => (
          <div className="detail-row" key={i}>
            <dt>{b.browser}</dt>
            <dd>{b.version ?? 'version unknown'}</dd>
          </div>
        )) : <div className="detail-row"><dt>—</dt><dd>No browsers detected</dd></div>}
      </div>

      {worker.device && (
        <>
          <div className="detail-subheader">Android device</div>
          <div className="detail-section">
            <div className="detail-row"><dt>Serial</dt><dd>{worker.device.serial}</dd></div>
            <div className="detail-row"><dt>Type</dt><dd>{worker.device.type}</dd></div>
            {worker.device.manufacturer && <div className="detail-row"><dt>Manufacturer</dt><dd>{worker.device.manufacturer}</dd></div>}
            {worker.device.model && <div className="detail-row"><dt>Model</dt><dd>{worker.device.model}</dd></div>}
            {worker.device.osVersion && <div className="detail-row"><dt>Android version</dt><dd>{worker.device.osVersion}</dd></div>}
            {worker.device.sdkVersion && <div className="detail-row"><dt>SDK</dt><dd>{worker.device.sdkVersion}</dd></div>}
          </div>
        </>
      )}
    </div>
  )
}

function WorkerRow({ w, onClick }: { w: WorkerView; onClick: () => void }) {
  const status = workerStatus(w)
  return (
    <tr className={`worker-row ${status}`}>
      <td>
        <button className="text-link worker-id-btn" onClick={onClick}>
          {w.id}
        </button>
        {w.device?.model && <small>{w.device.model}</small>}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={status} size={6} />
          <Badge value={w.health} />
        </div>
      </td>
      <td>{w.runtime}</td>
      <td>{w.architecture}</td>
      <td>
        <div className="browser-caps">
          {w.browsers.length
            ? w.browsers.map((b, i) => (
                <span key={i} className="browser-pill">
                  {b.browser} {b.version ?? ''}
                </span>
              ))
            : <span className="muted-label">None detected</span>}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
          <small style={{ color: 'var(--muted)' }}>{w.active} / {w.capacity}</small>
          <ProgressBar value={w.active} max={w.capacity} />
        </div>
      </td>
      <td className="muted-label">{heartbeatAge(w.heartbeatAt)}</td>
    </tr>
  )
}

function PlatformGroup({
  platform,
  workers,
  onSelect,
}: {
  platform: Platform
  workers: WorkerView[]
  onSelect: (w: WorkerView) => void
}) {
  if (!workers.length) return null
  return (
    <section className="platform-group">
      <div className="platform-group-header">
        <PlatformIcon platform={platform} size={15} />
        <h3>{platformLabel(platform)}</h3>
        <span className="platform-count">{workers.length} worker{workers.length > 1 ? 's' : ''}</span>
      </div>
      <table>
        <thead>
          <tr>
            {['Worker ID', 'Health', 'Runtime', 'Arch', 'Browsers', 'Capacity', 'Heartbeat'].map(
              (h) => <th key={h}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {workers.map((w) => (
            <WorkerRow key={w.id} w={w} onClick={() => onSelect(w)} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function Workers({
  data,
  search,
  platform: platformFilter,
  connection,
}: {
  data?: ControlSnapshot
  search: string
  platform: string
  connection: Connection | null
}) {
  const [selected, setSelected] = useState<WorkerView | null>(null)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [showFleetUpdate, setShowFleetUpdate] = useState(false)

  const allWorkers = data?.workers ?? []
  const filtered = allWorkers.filter((w) => {
    if (platformFilter !== 'all' && w.platform !== platformFilter) return false
    const q = search.toLowerCase()
    return !q || `${w.id} ${w.device?.model ?? ''} ${w.device?.serial ?? ''}`.toLowerCase().includes(q)
  })

  const byPlatform = new Map<Platform, WorkerView[]>()
  for (const p of PLATFORM_ORDER) byPlatform.set(p, [])
  for (const w of filtered) {
    const list = byPlatform.get(w.platform)
    if (list) list.push(w)
  }

  const byVersion = new Map<string, number>()
  const byCompat = { upToDate: 0, updateAvailable: 0, upgradeRequired: 0 }
  
  for (const w of allWorkers) {
    const v = w.version || 'Unknown'
    byVersion.set(v, (byVersion.get(v) ?? 0) + 1)
    
    if (w.compatibility === 'compatible') byCompat.upToDate++
    else if (w.compatibility === 'update_available') byCompat.updateAvailable++
    else if (w.compatibility === 'upgrade_required') byCompat.upgradeRequired++
  }

  return (
    <div className="page-with-detail">
      <div className="page-main">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '0 16px', marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <div><strong>Up to date:</strong> {byCompat.upToDate}</div>
            <div style={{ color: byCompat.updateAvailable ? 'var(--info)' : 'inherit' }}><strong>Updates available:</strong> {byCompat.updateAvailable}</div>
            <div style={{ color: byCompat.upgradeRequired ? 'var(--danger)' : 'inherit' }}><strong>Upgrade required:</strong> {byCompat.upgradeRequired}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setShowFleetUpdate(true)} disabled={!connection || allWorkers.length === 0}>Fleet Update</button>
            <button className="btn-primary" onClick={() => setShowEnrollment(true)}>Add Worker</button>
          </div>
        </div>
        
        {!allWorkers.length && (
          <EmptyState
            icon={<Cpu size={32} />}
            title="No workers connected yet"
            description="Workers execute browser sessions for your campaigns. Install or launch a worker and connect it to this Control Server."
            action={<button className="btn-primary" onClick={() => setShowEnrollment(true)}>Add Worker</button>}
          />
        )}
        {filtered.length === 0 && allWorkers.length > 0 && (
          <EmptyState
            icon={<Search size={32} />}
            title="No matching workers"
            description="Adjust the search or platform filter to see results."
          />
        )}
        {PLATFORM_ORDER.map((p) => (
          <PlatformGroup
            key={p}
            platform={p}
            workers={byPlatform.get(p) ?? []}
            onSelect={setSelected}
          />
        ))}
      </div>

      {selected && (
        <WorkerDetailPanel
          worker={data?.workers.find((w) => w.id === selected.id) ?? selected}
          connection={connection}
          onClose={() => setSelected(null)}
        />
      )}

      {showEnrollment && (
        <EnrollmentWizard connection={connection} onClose={() => setShowEnrollment(false)} onTokenCreated={() => {}} />
      )}

      {showFleetUpdate && connection && (
        <FleetUpdateModal connection={connection} onClose={() => setShowFleetUpdate(false)} />
      )}
    </div>
  )
}
