import { useEffect, useState, useCallback } from 'react'
import { Plus, Play, Trash2, X, Calendar, ToggleLeft, ToggleRight } from 'lucide-react'
import type { ScheduleView, ScheduleJobOptions, CampaignView } from '../types/control'
import { Badge } from '../components/Badge'
import { StatusDot } from '../components/StatusDot'
import type { Connection } from '../services/control'
import { scheduleApi, campaignApi } from '../services/api'

// ── Helpers ───────────────────────────────────────────────────────────
function relTime(iso: string | null): string {
  if (!iso) return '—'
  const delta = Date.now() - new Date(iso).getTime()
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

function absTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

function modeLabel(s: ScheduleView): string {
  switch (s.mode) {
    case 'cron': return s.expression
    case 'interval': {
      const ms = Number(s.expression)
      if (ms >= 3_600_000) return `Every ${Math.round(ms / 3_600_000)}h`
      if (ms >= 60_000) return `Every ${Math.round(ms / 60_000)}m`
      return `Every ${Math.round(ms / 1000)}s`
    }
    case 'once': return absTime(s.expression)
    default: return ''
  }
}

// ── Form ──────────────────────────────────────────────────────────────
const EMPTY: ScheduleJobOptions = {
  name: '', campaignId: '', campaignName: '', enabled: true,
  mode: 'cron', expression: '0 * * * *',
}

function ScheduleForm({
  initial, campaigns, onSave, onCancel, busy, error,
}: {
  initial: Partial<ScheduleJobOptions>
  campaigns: CampaignView[]
  onSave: (v: ScheduleJobOptions) => void
  onCancel: () => void
  busy: boolean
  error: string
}) {
  const [form, setForm] = useState<ScheduleJobOptions>({ ...EMPTY, ...initial })
  const set = <K extends keyof ScheduleJobOptions>(k: K, v: ScheduleJobOptions[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const modeHelp: Record<ScheduleJobOptions['mode'], string> = {
    cron: '5-field cron: minute hour day month weekday  (e.g. "0 9 * * 1-5" = weekdays at 9 AM)',
    interval: 'Milliseconds between runs  (e.g. 300000 = every 5 minutes)',
    once: 'ISO 8601 datetime  (e.g. 2026-12-01T09:00:00Z)',
  }

  const exampleByMode: Record<ScheduleJobOptions['mode'], string> = {
    cron: '0 * * * *',
    interval: '300000',
    once: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16),
  }

  function handleModeChange(m: ScheduleJobOptions['mode']) {
    set('mode', m)
    set('expression', exampleByMode[m])
  }

  return (
    <div className="campaign-form-overlay">
      <div className="campaign-form-panel" role="dialog" aria-label="Schedule editor">
        <div className="campaign-form-header">
          <h2>{initial.name ? `Edit "${initial.name}"` : 'New schedule'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><X size={18} /></button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-grid">
          <div className="form-field full">
            <label>Schedule name <span className="required">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Morning traffic burst" required />
          </div>

          <div className="form-field full">
            <label>Campaign <span className="required">*</span></label>
            {campaigns.length === 0 ? (
              <div className="alert alert-warn">No campaigns found. Create a campaign first.</div>
            ) : (
              <select value={form.campaignId} onChange={e => {
                const c = campaigns.find(c => c.id === e.target.value)
                if (c) { set('campaignId', c.id); set('campaignName', c.name) }
              }}>
                <option value="">— select a campaign —</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div className="form-field">
            <label>Trigger mode <span className="required">*</span></label>
            <select value={form.mode} onChange={e => handleModeChange(e.target.value as ScheduleJobOptions['mode'])}>
              <option value="cron">Cron — recurring expression</option>
              <option value="interval">Interval — repeat every N ms</option>
              <option value="once">Once — single future datetime</option>
            </select>
          </div>

          <div className="form-field">
            <label>Enabled on create</label>
            <label className="toggle">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span>{form.enabled ? 'Yes — start immediately' : 'No — create disabled'}</span>
            </label>
          </div>

          <div className="form-field full">
            <label>
              Expression <span className="required">*</span>
              <span className="muted-label" style={{ fontWeight: 400, marginLeft: 8 }}>{modeHelp[form.mode]}</span>
            </label>
            <input
              value={form.expression}
              onChange={e => set('expression', e.target.value)}
              placeholder={exampleByMode[form.mode]}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-default" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className="btn-primary"
            disabled={busy || !form.name || !form.campaignId || !form.expression}
            onClick={() => onSave(form)}
          >
            {busy ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────
function ScheduleRow({
  s, onEdit, onToggle, onRunNow, onDelete, canRun,
}: {
  s: ScheduleView
  onEdit: () => void
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
  canRun: boolean
}) {
  return (
    <tr className={s.enabled ? '' : 'row-disabled'}>
      <td>
        <button className="text-link" onClick={onEdit}><strong>{s.name}</strong></button>
        <small className="muted-label">{s.campaignName}</small>
      </td>
      <td>
        <Badge value={s.mode} />
      </td>
      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
        {modeLabel(s)}
      </td>
      <td>
        <div className="flex-gap">
          <StatusDot status={s.enabled ? (s.failCount > s.runCount / 2 ? 'degraded' : 'healthy') : 'offline'} size={6} />
          {s.enabled ? 'Active' : 'Disabled'}
        </div>
      </td>
      <td title={absTime(s.nextRunAt)}>{relTime(s.nextRunAt) === '—' ? '—' : `in ~${relTime(s.nextRunAt).replace('ago', '').trim()}`}</td>
      <td title={absTime(s.lastRunAt)}>{relTime(s.lastRunAt)}</td>
      <td>
        <div className="flex-gap">
          <span className="stat-chip green">{s.runCount}</span>
          {s.failCount > 0 && <span className="stat-chip red">{s.failCount}</span>}
        </div>
      </td>
      <td>
        <div className="row-actions">
          <button className="icon-btn" title={s.enabled ? 'Disable' : 'Enable'} onClick={onToggle}>
            {s.enabled ? <ToggleRight size={15} style={{ color: 'var(--green)' }} /> : <ToggleLeft size={15} />}
          </button>
          <button className="icon-btn" title="Run now" onClick={onRunNow} disabled={!canRun}>
            <Play size={13} />
          </button>
          <button className="icon-btn danger" title="Delete" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export function Schedules({ connection, redisReady }: { connection: Connection | null; redisReady: boolean }) {
  const [schedules, setSchedules] = useState<ScheduleView[]>([])
  const [campaigns, setCampaigns] = useState<CampaignView[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ScheduleView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [runMsg, setRunMsg] = useState('')

  // Load schedules and campaigns together on connect
  useEffect(() => {
    if (!connection) return
    Promise.all([
      scheduleApi.list(connection),
      campaignApi.list(connection),
    ]).then(([sc, ca]) => { setSchedules(sc); setCampaigns(ca) })
      .catch(e => setError(String(e)))
  }, [connection])

  const openNew  = () => { setEditing(null); setError(''); setShowForm(true) }
  const openEdit = (s: ScheduleView) => { setEditing(s); setError(''); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  const handleSave = useCallback(async (form: ScheduleJobOptions) => {
    if (!connection) return
    setBusy(true); setError('')
    try {
      if (editing) {
        const updated = await scheduleApi.update(connection, editing.id, form)
        setSchedules(ss => ss.map(s => s.id === updated.id ? updated : s))
      } else {
        const created = await scheduleApi.create(connection, form)
        setSchedules(ss => [created, ...ss])
      }
      closeForm()
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }, [connection, editing])

  const handleToggle = useCallback(async (id: string) => {
    if (!connection) return
    try {
      const updated = await scheduleApi.toggle(connection, id)
      setSchedules(ss => ss.map(s => s.id === updated.id ? updated : s))
    } catch (e) { setError(String(e)) }
  }, [connection])

  const handleRunNow = useCallback(async (id: string) => {
    if (!connection) return
    try {
      const result = await scheduleApi.runNow(connection, id)
      setRunMsg(`Session queued: ${result.sessionId.slice(-14)}`)
      setTimeout(() => setRunMsg(''), 4000)
      // Refresh the schedule's runCount
      const updated = await scheduleApi.get(connection, id)
      setSchedules(ss => ss.map(s => s.id === updated.id ? updated : s))
    } catch (e) { setError(String(e)) }
  }, [connection])

  const handleDelete = useCallback(async (id: string) => {
    if (!connection) return
    if (!confirm('Delete this schedule? The campaign itself will not be affected.')) return
    try {
      await scheduleApi.delete(connection, id)
      setSchedules(ss => ss.filter(s => s.id !== id))
    } catch (e) { setError(String(e)) }
  }, [connection])

  const active = schedules.filter(s => s.enabled).length

  return (
    <>
      {showForm && (
        <ScheduleForm
          initial={editing ?? {}}
          campaigns={campaigns}
          onSave={form => void handleSave(form)}
          onCancel={closeForm}
          busy={busy}
          error={error}
        />
      )}

      <div className="page-toolbar">
        <div className="flex-gap">
          {active > 0 && (
            <span className="flex-gap">
              <StatusDot status="healthy" size={7} /><b>{active}</b> active
            </span>
          )}
          <span className="muted-label">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''} total</span>
        </div>
        <button className="btn-primary" onClick={openNew} disabled={!connection}>
          <Plus size={14} /> New schedule
        </button>
      </div>

      {error && !showForm && <div className="alert alert-error">{error}</div>}
      {runMsg && <div className="alert alert-ok">{runMsg}</div>}

      {!schedules.length ? (
        <div className="empty-panel">
          <div className="empty-icon"><Calendar size={32} /></div>
          <h2>No schedules configured</h2>
          <p>
            Schedules automatically fire campaigns on a cron expression, a fixed interval,
            or a single future datetime. You need at least one campaign before creating a schedule.
          </p>
          <div className="schedule-help-grid">
            <div className="schedule-help-card">
              <strong>Cron</strong>
              <code>0 9 * * 1-5</code>
              <small>Weekdays at 9 AM</small>
            </div>
            <div className="schedule-help-card">
              <strong>Interval</strong>
              <code>300000</code>
              <small>Every 5 minutes</small>
            </div>
            <div className="schedule-help-card">
              <strong>Once</strong>
              <code>2026-12-01T09:00:00Z</code>
              <small>Single datetime</small>
            </div>
          </div>
          <button className="btn-primary" style={{ marginTop: 20 }} onClick={openNew} disabled={!connection || campaigns.length === 0}>
            <Plus size={14} /> New schedule
          </button>
          {campaigns.length === 0 && connection && (
            <p className="muted-label" style={{ marginTop: 10, fontSize: 11 }}>
              Create a campaign first — schedules need a campaign to run.
            </p>
          )}
        </div>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                {['Name · Campaign', 'Mode', 'Expression', 'Status', 'Next run', 'Last run', 'Runs', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <ScheduleRow
                  key={s.id}
                  s={s}
                  onEdit={() => openEdit(s)}
                  onToggle={() => void handleToggle(s.id)}
                  onRunNow={() => void handleRunNow(s.id)}
                  onDelete={() => void handleDelete(s.id)}
                  canRun={redisReady}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
