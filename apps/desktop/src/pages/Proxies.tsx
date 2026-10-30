import { useEffect, useState } from 'react'
import { Globe, RefreshCw, Plus, Upload, Trash2, Play, Pause } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { toast } from '../components/Toast'
import type { PublicProxyDto, ProxyCreateDto } from '../types/control'
import { Badge } from '../components/Badge'
import { StatusDot } from '../components/StatusDot'
import type { Connection } from '../services/control'
import { proxyApi } from '../services/api'

export function Proxies({ connection }: { connection: Connection | null }) {
  const [proxies, setProxies] = useState<PublicProxyDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editing, setEditing] = useState<PublicProxyDto | null>(null)

  const load = () => {
    if (!connection) return
    setLoading(true)
    proxyApi.list(connection)
      .then(data => { setProxies(data); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(load, [connection])
  const handleToggleEnable = async (p: PublicProxyDto) => {
    if (!connection) return
    try {
      await proxyApi.update(connection, p.id, { enabled: !p.enabled })
      toast.success(p.enabled ? 'Proxy disabled' : 'Proxy enabled')
      load()
    } catch (e) {
      toast.error(String(e))
    }
  }

  const handleDelete = async (p: PublicProxyDto) => {
    if (!connection) return
    if (!confirm(`Are you sure you want to delete proxy ${p.host}?`)) return
    try {
      await proxyApi.delete(connection, p.id)
      toast.success('Proxy deleted')
      load()
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <>
      <div className="page-toolbar">
        <div className="flex-gap">
          <span className="muted-label">{proxies.length} proxy source{proxies.length !== 1 ? 's' : ''} configured</span>
          <button className="icon-btn" onClick={load} disabled={loading} aria-label="Refresh proxies">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex-gap">
          <button className="btn btn-secondary" onClick={() => setShowBulkModal(true)}>
            <Upload size={14} /> Import Proxies
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Add Proxy
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !proxies.length && (
        <EmptyState
          icon={<Globe size={32} />}
          title="No proxies configured"
          description="Add an egress endpoint if your authorized testing environment requires traffic to leave through specific networks or regions."
          action={
            <>
              <button className="btn-secondary" onClick={() => setShowBulkModal(true)}>Import List</button>
              <button className="btn-primary" onClick={() => setShowAddModal(true)}>Add Proxy</button>
            </>
          }
        />
      )}

      {proxies.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Proxy</th>
                <th>Protocol</th>
                <th>Location</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Success</th>
                <th>Leases</th>
                <th>Failures</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map(p => (
                <tr key={p.id} className={!p.enabled ? 'disabled-row' : ''}>
                  <td>
                    <div className="flex-gap">
                      <button className="icon-btn" onClick={() => setEditing(p)} title="Edit proxy">Edit</button>
                      <button className="icon-btn" title="Check endpoint connectivity" onClick={() => { if (connection) void proxyApi.test(connection, p.id).then(() => { toast.success('Proxy endpoint reachable; egress authentication is checked during sessions'); load() }).catch(e => toast.error(String(e))) }}>Test</button>
                      <StatusDot status={!p.enabled ? 'offline' : p.status === 'healthy' ? 'healthy' : p.status === 'degraded' ? 'degraded' : p.status === 'unavailable' ? 'failed' : 'unknown'} size={8} />
                      <span className="mono">{p.name || p.host}</span>
                    </div>
                  </td>
                  <td><Badge value={p.protocol} /></td>
                  <td>{(p.country || p.region) ? `${p.country || ''} ${p.region ? `/ ${p.region}` : ''}` : '—'}</td>
                  <td>{p.provider || '—'}</td>
                  <td>
                    {!p.enabled ? <span className="muted-label">DISABLED</span> : 
                     p.status === 'healthy' ? <span style={{ color: 'var(--success)' }}>HEALTHY</span> :
                     p.status === 'degraded' ? <span style={{ color: 'var(--warning)' }}>DEGRADED</span> :
                     p.status === 'unavailable' ? <span style={{ color: 'var(--danger)' }}>UNAVAILABLE</span> :
                     <span className="muted-label">UNKNOWN</span>}
                  </td>
                  <td>{p.latencyMs != null ? `${p.latencyMs} ms` : '—'}</td>
                  <td>{p.successRate != null ? `${(p.successRate * 100).toFixed(1)}%` : '—'}</td>
                  <td>{p.activeLeases || 0} {p.maxConcurrentLeases ? `/ ${p.maxConcurrentLeases}` : ''}</td>
                  <td>{p.consecutiveFailures > 0 ? <span style={{ color: 'var(--danger)' }}>{p.consecutiveFailures}</span> : '0'}</td>
                  <td className="muted-label">{p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleTimeString() : '—'}</td>
                  <td>
                    <div className="flex-gap">
                      <button className="icon-btn" onClick={() => handleToggleEnable(p)} title={p.enabled ? "Disable" : "Enable"}>
                        {p.enabled ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button className="icon-btn" onClick={() => handleDelete(p)} title="Remove">
                        <Trash2 size={14} className="danger-text" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && <AddProxyModal connection={connection} onClose={() => { setShowAddModal(false); load() }} />}
      {editing && <AddProxyModal initial={editing} connection={connection} onClose={() => { setEditing(null); load() }} />}
      {showBulkModal && <BulkImportModal connection={connection} onClose={() => { setShowBulkModal(false); load() }} />}
    </>
  )
}

function AddProxyModal({ connection, onClose, initial }: { connection: Connection | null, onClose: () => void, initial?: PublicProxyDto }) {
  const [formData, setFormData] = useState<Partial<ProxyCreateDto>>({
    protocol: 'http',
    port: 8080,
    ...initial,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connection) return
    if (!formData.host || !formData.port) {
      setError('Host and port are required')
      return
    }
    setLoading(true)
    try {
      const { protocol, host, port, username, password, country, region, provider, maxConcurrentLeases } = formData
      const body = { protocol, host, port, username, password, country, region, provider, maxConcurrentLeases }
      if (initial) await proxyApi.update(connection, initial.id, body)
      else await proxyApi.create(connection, body as ProxyCreateDto)
      onClose()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Edit proxy' : 'Add proxy'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          
          <div className="form-group">
            <label>Protocol</label>
            <select value={formData.protocol} onChange={e => setFormData({ ...formData, protocol: e.target.value as any })}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Host</label>
              <input autoFocus required type="text" value={formData.host || ''} onChange={e => setFormData({ ...formData, host: e.target.value })} placeholder="192.168.1.1" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Port</label>
              <input required type="number" min="1" max="65535" value={formData.port || ''} onChange={e => setFormData({ ...formData, port: Number(e.target.value) })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username (Optional)</label>
              <input type="text" value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Password (Optional)</label>
              <input type="password" value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Country (Optional)</label>
              <input type="text" placeholder="US" value={formData.country || ''} onChange={e => setFormData({ ...formData, country: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Provider (Optional)</label>
              <input type="text" placeholder="Oxylabs" value={formData.provider || ''} onChange={e => setFormData({ ...formData, provider: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Max Concurrent Leases</label>
            <input type="number" min="1" placeholder="Unlimited" value={formData.maxConcurrentLeases || ''} onChange={e => setFormData({ ...formData, maxConcurrentLeases: e.target.value ? Number(e.target.value) : undefined })} />
            <small className="muted-label">Leave blank for no limit</small>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Proxy'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BulkImportModal({ connection, onClose }: { connection: Connection | null, onClose: () => void }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ valid: ProxyCreateDto[], invalidCount: number } | null>(null)

  const parse = () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const valid: ProxyCreateDto[] = []
    let invalidCount = 0

    for (const line of lines) {
      try {
        // Simple formats: 
        // host:port
        // user:pass@host:port
        // protocol://user:pass@host:port
        let protocol: any = 'http'
        let cleanLine = line
        
        if (cleanLine.includes('://')) {
          const parts = cleanLine.split('://')
          protocol = parts[0] as any
          cleanLine = parts[1]
        }
        
        let userpass = ''
        let hostport = cleanLine
        if (cleanLine.includes('@')) {
          const parts = cleanLine.split('@')
          userpass = parts[0]
          hostport = parts[1]
        }
        
        const [host, port] = hostport.split(':')
        const [username, password] = userpass ? userpass.split(':') : ['', '']

        if (!host || !port || isNaN(Number(port))) {
          invalidCount++
          continue
        }

        valid.push({
          protocol,
          host,
          port: Number(port),
          username: username || undefined,
          password: password || undefined,
        })
      } catch (e) {
        invalidCount++
      }
    }

    setPreview({ valid, invalidCount })
  }

  const submit = async () => {
    if (!connection || !preview) return
    setLoading(true)
    try {
      await proxyApi.bulkCreate(connection, preview.valid)
      onClose()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bulk Import Proxies</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          {!preview ? (
            <>
              <div className="form-group">
                <label>Paste proxy list</label>
                <textarea 
                  rows={10} 
                  value={text} 
                  onChange={e => setText(e.target.value)} 
                  placeholder={"host:port\nuser:pass@host:port\nhttp://user:pass@host:port"} 
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={parse} disabled={!text.trim()}>Review</button>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <p><strong>{preview.valid.length}</strong> valid proxies found.</p>
                {preview.invalidCount > 0 && (
                  <p style={{ color: 'var(--danger)' }}><strong>{preview.invalidCount}</strong> rows could not be parsed.</p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}>Back</button>
                <button type="button" className="btn btn-primary" onClick={submit} disabled={loading || preview.valid.length === 0}>
                  {loading ? 'Importing...' : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
