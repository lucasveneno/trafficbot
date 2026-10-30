import { useState, useCallback, useEffect } from 'react'
import { Plus, Play, Pause, Trash2, X, Zap } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import type { CampaignView, CampaignJobOptions, WorkerView, ProfileView, Platform, Browser, PublicProxyDto } from '../types/control'
import { Badge } from '../components/Badge'
import { StatusDot } from '../components/StatusDot'
import type { Connection } from '../services/control'
import { campaignApi, profileApi, proxyApi } from '../services/api'

const INTENSITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }
const time = (v: string | null) => (v ? new Date(v).toLocaleDateString() : '—')

// ── Campaign Form ─────────────────────────────────────────────────────
const EMPTY: CampaignJobOptions = {
  name: '', url: 'https://', durationMinutes: 3, intensity: 'medium', behaviorModel: 'generic',
  persistent: false, concurrency: 1, proxyMode: 'direct', schedule: { mode: 'immediate' },
}

export function CampaignForm({
  initial,
  onSave,
  onCancel,
  busy,
  error,
  workers,
  connection,
}: {
  initial: Partial<CampaignJobOptions>
  onSave: (v: CampaignJobOptions) => void
  onCancel: () => void
  busy: boolean
  error: string
  workers: WorkerView[]
  connection: Connection | null
}) {
  const [form, setForm] = useState<CampaignJobOptions>({ ...EMPTY, ...initial, proxyMode: initial.proxyMode || (initial.name ? 'auto' : 'direct') })
  const [profiles, setProfiles] = useState<ProfileView[]>([])
  const [targetsText, setTargetsText] = useState(initial.targets?.join('\n') || initial.url || '')
  const [proxies, setProxies] = useState<PublicProxyDto[]>([])
  const [proxyError, setProxyError] = useState('')
  const [validation, setValidation] = useState('')
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; document.getElementById('campaign-name')?.focus(); return () => previous?.focus() }, [])
  useEffect(() => { if (connection) void proxyApi.list(connection).then(setProxies).catch(() => setProxyError('Proxy inventory could not be loaded.')) }, [connection])
  useEffect(() => { if (connection) void profileApi.list(connection).then(setProfiles).catch(() => setProfiles([])) }, [connection])
  const bound = profiles.find(p => p.key === form.profileKey)
  const compatible = workers.filter(w => (!form.requirements?.platform || w.platform === form.requirements.platform) && (!form.requirements?.browser || w.browsers.some(b => b.browser === form.requirements?.browser)) && (!form.requirements?.deviceSerial || w.device?.serial === form.requirements.deviceSerial))
  const browsers = [...new Set(workers.filter(w => !form.requirements?.platform || w.platform === form.requirements.platform).flatMap(w => w.browsers.map(b => b.browser)))]
  const set = <K extends keyof CampaignJobOptions>(k: K, v: CampaignJobOptions[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="campaign-form-overlay">
      <div className="campaign-form-panel" role="dialog" aria-modal="true" aria-label="Campaign editor" onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel() }
        if (event.key === 'Tab') {
          const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'))
          const first = fields[0], last = fields[fields.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
        <div className="campaign-form-header">
          <h2>{initial.name ? `Edit "${initial.name}"` : 'New campaign'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><X size={18} /></button>
        </div>

        {(error || validation) && <div role="alert" className="alert alert-error">{error || validation}</div>}

        <form onSubmit={e => { e.preventDefault(); const targets = targetsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean); if (!targets.length || targets.some(value => { try { const url = new URL(value); return !['http:', 'https:'].includes(url.protocol) || !!url.username || !!url.password } catch { return true } })) { setValidation('Enter one valid HTTP(S) URL per line, without credentials.'); return } setValidation(''); onSave({ ...form, url: targets[0], targets }) }}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="campaign-platform">Operating system</label><select id="campaign-platform" disabled={!!bound} value={form.requirements?.platform || ''} onChange={e => set('requirements', { platform: (e.target.value || undefined) as Platform | undefined })}><option value="">Automatic</option>{['linux','windows','macos','android'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          <div className="form-field"><label htmlFor="campaign-browser">Browser</label><select id="campaign-browser" disabled={!!bound} value={form.requirements?.browser || ''} onChange={e => set('requirements', { ...form.requirements, browser: (e.target.value || undefined) as Browser | undefined })}><option value="">Automatic compatible browser</option>{browsers.map(b => <option key={b}>{b}</option>)}</select></div>
          {form.requirements?.platform === 'android' && <div className="form-field"><label htmlFor="campaign-device">Device</label><select id="campaign-device" disabled={!!bound?.deviceSerial} value={form.requirements.deviceSerial || ''} onChange={e => set('requirements', { ...form.requirements, deviceSerial: e.target.value || undefined })}><option value="">Automatic</option>{workers.filter(w => w.platform === 'android' && w.device).map(w => <option key={w.id} value={w.device!.serial}>{w.device!.model || w.device!.serial}</option>)}</select>{bound?.deviceSerial && <small>This profile is stored on this Android device and must resume there.</small>}</div>}
          <div className="form-field"><label htmlFor="campaign-profile">Existing persistent profile</label><select id="campaign-profile" value={bound?.key || ''} onChange={e => { const p = profiles.find(p => p.key === e.target.value); setForm(f => ({ ...f, profileKey: p?.key, persistent: !!p, concurrency: p ? 1 : f.concurrency, requirements: p ? { platform: p.operatingSystem, browser: p.browser, deviceSerial: p.deviceSerial } : undefined })) }}><option value="">Automatic / new profile</option>{profiles.map(p => <option key={p.key} value={p.key}>{p.key} · {p.operatingSystem} · {p.browser}</option>)}</select></div>
          {!compatible.length && <p role="status">No compatible workers currently available. You can save this campaign and run it when workers connect.</p>}
          <div className="form-field full">
            <label htmlFor="campaign-name">Campaign name <span className="required">*</span></label>
            <input id="campaign-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. US traffic — organic" required />
          </div>

          <div className="form-field full">
            <label htmlFor="campaign-targets">Target URLs <span className="required">*</span></label>
            <textarea id="campaign-targets" value={targetsText} aria-invalid={!!validation} onChange={e => { setValidation(''); setTargetsText(e.target.value); set('url', e.target.value.split(/\r?\n/).find(line => line.trim())?.trim() || '') }} placeholder="One HTTP(S) URL per line" required rows={4} />
            <small>Sessions rotate through these targets in order.</small>
          </div>

          <div className="form-field">
            <label>Duration (minutes)</label>
            <input type="number" min={1} max={120} value={form.durationMinutes} onChange={e => set('durationMinutes', Number(e.target.value))} />
          </div>

          <div className="form-field">
            <label htmlFor="campaign-concurrency">Concurrent sessions</label>
            <input id="campaign-concurrency" type="number" min={1} max={form.persistent ? 1 : 100} value={form.persistent ? 1 : form.concurrency || 1} disabled={form.persistent} onChange={e => set('concurrency', Number(e.target.value))} />
            {form.persistent && <small>A persistent profile runs one session at a time.</small>}
          </div>
          <div className="form-field"><label htmlFor="campaign-proxy-mode">Proxy selection</label><select id="campaign-proxy-mode" value={form.proxyMode || 'auto'} onChange={e => set('proxyMode', e.target.value as CampaignJobOptions['proxyMode'])}><option value="auto">Existing automatic selection</option><option value="direct">Direct connection</option><option value="pool">Selected proxy pool</option></select></div>
          {form.proxyMode === 'pool' && <div className="form-field full"><label htmlFor="campaign-proxies">Proxy pool</label><select id="campaign-proxies" multiple required value={form.proxyIds || []} onChange={e => set('proxyIds', Array.from(e.target.selectedOptions).map(o => o.value))}>{proxies.map(p => <option key={p.id} value={p.id} disabled={!p.enabled || p.status === 'unavailable'}>{p.name || p.provider || p.host}:{p.port} · {p.status}</option>)}</select><small>Only these proxies may be used. Unavailable or exhausted pools never fall back to a direct connection.</small>{proxyError && <p role="alert">{proxyError}</p>}</div>}
          <div className="form-field">
            <label>Intensity</label>
            <select value={form.intensity} onChange={e => set('intensity', e.target.value as 'low' | 'medium' | 'high')}>
              {(['low', 'medium', 'high'] as const).map(v => <option key={v} value={v}>{INTENSITY_LABELS[v]}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label>Behavior Model</label>
            <select value={form.behaviorModel} onChange={e => set('behaviorModel', e.target.value as any)}>
              <option value="generic">Generic Browsing</option>
              <option value="article_reader">Article Reader</option>
              <option value="infinite_scroll">Infinite Scroll</option>
              <option value="form_filler">Form Filler</option>
            </select>
          </div>

          <div className="form-field">
            <label>Browser profile key</label>
            <input disabled={!!bound} required={form.persistent} pattern="[a-zA-Z0-9_-]{1,100}" value={form.profileKey ?? ''} onChange={e => set('profileKey', e.target.value || undefined)} placeholder="Optional profile key" />
          </div>

          <div className="form-field">
            <label>Persistent profile</label>
            <label className="toggle">
              <input type="checkbox" checked={form.persistent} onChange={e => setForm(f => ({ ...f, persistent: e.target.checked, concurrency: e.target.checked ? 1 : f.concurrency }))} />
              <span>{form.persistent ? 'Yes — reuse profile across sessions' : 'No — ephemeral profile per session'}</span>
            </label>
          </div>

          <div className="form-field">
            <label>Schedule mode</label>
            <select value={form.schedule.mode} onChange={e => set('schedule', { ...form.schedule, mode: e.target.value as 'immediate' | 'interval' | 'cron' })}>
              <option value="immediate">Immediate — run target batch</option>
              <option value="interval">Interval — repeat every N ms</option>
              <option value="cron">Cron — scheduled expression</option>
            </select>
          </div>

          {form.schedule.mode !== 'immediate' && (
            <div className="form-field">
              <label>{form.schedule.mode === 'cron' ? 'Cron expression' : 'Interval (ms)'}</label>
              <input value={form.schedule.value ?? ''} onChange={e => set('schedule', { ...form.schedule, value: e.target.value })}
                placeholder={form.schedule.mode === 'cron' ? '*/30 * * * *' : '60000'} />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="campaign-total">Total sessions</label>
            <input id="campaign-total" type="number" min={1} max={10000} value={form.totalSessions ?? form.schedule.maxSessions ?? ''} onChange={e => setForm(f => ({ ...f, totalSessions: e.target.value ? Number(e.target.value) : undefined, schedule: { ...f.schedule, maxSessions: undefined } }))} placeholder={form.schedule.mode === 'immediate' ? 'One per target' : 'Unlimited'} />
          </div>

          <div className="form-field">
            <label>Description</label>
            <input value={form.description ?? ''} onChange={e => set('description', e.target.value || undefined)} placeholder="Optional notes" />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-default" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !form.name || !form.url}>
            {busy ? 'Saving…' : 'Save campaign'}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}

// ── Campaign row ──────────────────────────────────────────────────────
function CampaignRow({
  c, onEdit, onDelete, onStatus, onResumeCircuit
}: {
  c: CampaignView
  onEdit: () => void
  onDelete: () => void
  onStatus: (s: CampaignView['status']) => void
  onResumeCircuit: () => void
}) {
  const isCircuitOpen = c.circuit && c.circuit.state !== 'closed'

  return (
    <>
      <tr style={{ opacity: isCircuitOpen ? 0.7 : 1 }}>
        <td>
          <button className="text-link" onClick={onEdit}><strong>{c.name}</strong></button>
          {c.description && <small>{c.description}</small>}
        </td>
        <td>
          <div className="flex-gap">
            <StatusDot status={isCircuitOpen ? 'paused' : c.status} size={6} />
            <Badge value={isCircuitOpen ? 'circuit open' : c.status} />
          </div>
        </td>
        <td>
          <div className="url-cell" title={c.url}>{c.url}</div>
          <small>{c.targets?.length || 1} target(s) · {c.proxyMode === 'pool' ? `${c.proxyIds?.length || 0} selected proxies` : c.proxyMode === 'direct' ? 'Direct' : 'Automatic proxy'}</small>
        </td>
        <td>{c.durationMinutes}m · {c.intensity}<small>Up to {c.concurrency || 1} concurrent</small></td>
        <td>
          <div className="flex-gap">
            <span className="stat-chip green">{c.stats.totalCompleted}</span>
            <span className="stat-chip red">{c.stats.totalFailed}</span>
          </div>
          <small>Last: {time(c.stats.lastRunAt)}</small>
        </td>
        <td>{c.schedule.mode}{c.schedule.value ? ` · ${c.schedule.value}` : ''}</td>
        <td>
          <div className="row-actions">
            {c.status === 'active'
              ? <button className="icon-btn" title="Pause" onClick={() => onStatus('paused')}><Pause size={14} /></button>
              : <button className="icon-btn" title={c.status === 'completed' ? 'Run again' : 'Activate'} onClick={() => onStatus('active')}><Play size={14} /></button>}
            <button className="icon-btn danger" title="Delete" onClick={onDelete}><Trash2 size={14} /></button>
          </div>
        </td>
      </tr>
      {isCircuitOpen && c.circuit && (
        <tr className="circuit-warning-row" style={{ backgroundColor: '#fff5f5' }}>
          <td colSpan={7} style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
            <div style={{ color: '#c53030', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>Campaign paused automatically — Circuit: {c.circuit.state.toUpperCase()}</strong>
              <span>
                Failure rate: {Math.round(c.circuit.failureRate * 100)}% ({c.circuit.consecutiveFailures} consecutive failures)
              </span>
              <span>Primary failure: {c.circuit.dominantFailureCategory || 'unknown'}</span>
              {c.circuit.state === 'open' && c.circuit.nextProbeAt && (
                <span>Next health probe: {new Date(c.circuit.nextProbeAt).toLocaleTimeString()}</span>
              )}
              <div style={{ marginTop: 8 }}>
                <button onClick={onResumeCircuit} style={{ background: '#c53030', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                  Resume manually
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export function Campaigns({
  campaigns: initial,
  connection,
  workers = [],
}: {
  campaigns?: CampaignView[]
  connection: Connection | null
  workers?: WorkerView[]
}) {
  const [campaigns, setCampaigns] = useState<CampaignView[]>(initial ?? [])
  const [loaded, setLoaded] = useState(initial !== undefined)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CampaignView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Merge prop changes
  if (initial && initial !== campaigns && !showForm) setCampaigns(initial)

  useEffect(() => {
    if (!connection) return
    let disposed = false
    const fetchCampaigns = () => {
      campaignApi.list(connection)
        .then(data => { if (!disposed) { setCampaigns(data); setLoaded(true); setError('') } })
        .catch(e => { if (!disposed) setError(String(e)) })
    }
    fetchCampaigns()
    const timer = setInterval(fetchCampaigns, 5000)
    return () => { disposed = true; clearInterval(timer) }
  }, [connection])

  const openNew = () => { setEditing(null); setError(''); setShowForm(true) }
  const openEdit = (c: CampaignView) => { setEditing(c); setError(''); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  const handleSave = useCallback(async (form: CampaignJobOptions) => {
    if (!connection) return
    setBusy(true); setError('')
    try {
      if (editing) {
        const updated = await campaignApi.update(connection, editing.id, form)
        setCampaigns(cs => cs.map(c => c.id === updated.id ? updated : c))
      } else {
        const created = await campaignApi.create(connection, form)
        setCampaigns(cs => [created, ...cs])
      }
      closeForm()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [connection, editing])

  const handleStatus = useCallback(async (id: string, status: CampaignView['status']) => {
    if (!connection) return
    try {
      const updated = await campaignApi.setStatus(connection, id, status)
      setCampaigns(cs => cs.map(c => c.id === updated.id ? updated : c))
    } catch (e) {
      setError(String(e))
    }
  }, [connection])

  const handleDelete = useCallback(async (id: string) => {
    if (!connection) return
    if (!confirm('Delete this campaign? This cannot be undone.')) return
    try {
      await campaignApi.delete(connection, id)
      setCampaigns(cs => cs.filter(c => c.id !== id))
    } catch (e) {
      setError(String(e))
    }
  }, [connection])

  const handleResumeCircuit = useCallback(async (id: string) => {
    if (!connection) return
    try {
      await campaignApi.resumeCircuit(connection, id)
      // trigger immediate fetch
      campaignApi.list(connection).then(setCampaigns).catch(console.error)
    } catch (e) {
      setError(String(e))
    }
  }, [connection])

  const active = campaigns.filter(c => c.status === 'active').length
  const paused = campaigns.filter(c => c.status === 'paused').length

  return (
    <>
      {showForm && (
        <CampaignForm
          workers={workers}
          connection={connection}
          initial={editing ?? {}}
          onSave={form => void handleSave(form)}
          onCancel={closeForm}
          busy={busy}
          error={error}
        />
      )}

      <div className="page-toolbar">
        <div className="flex-gap">
          {active > 0 && <span className="flex-gap"><StatusDot status="active" size={7} /><b>{active}</b> active</span>}
          {paused > 0 && <span className="flex-gap muted-label"><b>{paused}</b> paused</span>}
          <span className="muted-label">{campaigns.length} total</span>
        </div>
        <button className="btn-primary" onClick={openNew} disabled={!connection}>
          <Plus size={14} /> New campaign
        </button>
      </div>

      {error && !showForm && <div className="alert alert-error">{error}</div>}

      {!campaigns.length ? (
        <EmptyState
          icon={<Zap size={32} />}
          title={!connection ? 'Connect to load campaigns' : error ? 'Campaigns could not be loaded' : !loaded ? 'Loading campaigns…' : 'No campaigns yet'}
          description="Create a campaign to define a target, schedule, and execution policy."
          action={
            <button className="btn-primary" onClick={openNew} disabled={!connection}><Plus size={14} /> Create Campaign</button>
          }
        />
      ) : (
        <section className="panel">
          <table>
            <thead><tr>
              {['Name', 'Status', 'Target URL', 'Duration · Intensity', 'Sessions', 'Schedule', ''].map(h => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {campaigns.map(c => (
                <CampaignRow key={c.id} c={c}
                  onEdit={() => openEdit(c)}
                  onDelete={() => void handleDelete(c.id)}
                  onStatus={s => void handleStatus(c.id, s)}
                  onResumeCircuit={() => void handleResumeCircuit(c.id)}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
