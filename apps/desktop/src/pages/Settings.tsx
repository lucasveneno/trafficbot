import { useEffect, useState } from 'react'
import { RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import type { Connection } from '../services/control'
import { settingsApi, type PublicSettings } from '../services/api'
import { DesktopUpdater } from '../components/DesktopUpdater'
import { DesktopPreferences } from '../components/DesktopPreferences'

type Row = { label: string; key: keyof PublicSettings; type: 'text' | 'bool' | 'number' }

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Session behaviour',
    rows: [
      { label: 'Max concurrent sessions', key: 'maxSessions', type: 'number' },
      { label: 'Session duration (minutes)', key: 'sessionTime', type: 'text' },
      { label: 'Headless browser', key: 'headless', type: 'bool' },
      { label: 'Stealth mode', key: 'stealthMode', type: 'bool' },
      { label: 'Human behaviour simulation', key: 'humanBehavior', type: 'bool' },
      { label: 'Behaviour intensity', key: 'behaviorIntensity', type: 'text' },
      { label: 'Behaviour model', key: 'behaviorModel', type: 'text' },
      { label: 'Persistent sessions', key: 'persistentSessions', type: 'bool' },
    ],
  },
  {
    title: 'Traffic parameters',
    rows: [
      { label: 'Default target URL', key: 'defaultUrl', type: 'text' },
      { label: 'Organic search', key: 'organicSearch', type: 'bool' },
      { label: 'Referral traffic', key: 'referrals', type: 'text' },
      { label: 'Grant geolocation', key: 'grantGeolocation', type: 'bool' },
      { label: 'Match geolocation to proxy', key: 'matchGeolocation', type: 'bool' },
    ],
  },
  {
    title: 'Infrastructure',
    rows: [
      { label: 'Redis URL', key: 'redisUrl', type: 'text' },
      { label: 'Proxy configured', key: 'proxyConfigured', type: 'bool' },
      { label: 'External IP check', key: 'externalIpCheck', type: 'bool' },
      { label: 'Sessions data directory', key: 'sessionsDataDir', type: 'text' },
    ],
  },
  {
    title: 'Runtime',
    rows: [
      { label: 'Node environment', key: 'nodeEnv', type: 'text' },
      { label: 'Log level', key: 'logLevel', type: 'text' },
    ],
  },
]

function BoolChip({ value }: { value: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
        background: value ? 'var(--green-bg)' : 'var(--elevated)',
        color: value ? 'var(--green)' : 'var(--muted)',
      }}
    >
      {value ? '✓ enabled' : '✗ disabled'}
    </span>
  )
}

export function Settings({ connection }: { connection: Connection | null }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [form, setForm] = useState<Partial<PublicSettings> | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    if (!connection) return
    setLoading(true)
    settingsApi.get(connection)
      .then(data => { setSettings(data); setForm(null); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(load, [connection])

  const handleSave = async () => {
    if (!connection || !form) return
    setSaving(true); setError('')
    try {
      const changes = Object.fromEntries(Object.entries(form).filter(([key, value]) => key !== 'proxyConfigured' && key !== 'restartRequired' && value !== settings?.[key as keyof PublicSettings]))
      const updated = await settingsApi.update(connection, changes)
      setSettings(updated)
      setForm(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const isEditing = form !== null
  const current = form ?? settings

  return (
    <>
      {settings?.restartRequired && <div role="status" className="alert alert-warn">Settings saved for the next launch. Restart the controller and affected workers when idle to apply changes.</div>}
      <DesktopPreferences />
      <div className="page-toolbar">
        <span className="muted-label">Runtime configuration. Changes to engine infrastructure require an engine restart.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {isEditing ? (
            <>
              <button className="btn-default" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </>
          ) : (
            <button className="btn-default" onClick={() => settings && setForm(settings)} disabled={!settings}>Edit settings</button>
          )}
          <button className="icon-btn" onClick={load} disabled={loading || !connection || isEditing} aria-label="Refresh settings">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {!connection && (
        <EmptyState
          icon={<SettingsIcon size={32} />}
          title="Not connected"
          description="Connect to the local engine to view runtime configuration."
        />
      )}

      {loading && !settings && <div className="empty-hint">Loading settings…</div>}

      <div className="settings-grid">
        <DesktopUpdater />
      </div>

      {current && (
        <div className="settings-grid">
          {SECTIONS.map(section => (
            <section key={section.title} className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header"><h2>{section.title}</h2></div>
              <div className="detail-section">
                {section.rows.map(row => {
                  const raw = current[row.key]
                  // proxyConfigured is strictly read-only
                  const readOnly = !isEditing || row.key === 'proxyConfigured'

                  return (
                    <div className="detail-row" key={row.key} style={{ minHeight: 32 }}>
                      <dt>{row.label}</dt>
                      <dd>
                        {readOnly ? (
                          row.type === 'bool'
                            ? <BoolChip value={Boolean(raw)} />
                            : <span className={row.key === 'redisUrl' || row.key === 'sessionsDataDir' ? 'mono' : ''} style={{ fontSize: 13 }}>{String(raw) || '—'}</span>
                        ) : row.type === 'bool' ? (
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(raw)}
                              onChange={e => setForm({ ...form, [row.key]: e.target.checked })}
                            />
                            <span>{raw ? 'enabled' : 'disabled'}</span>
                          </label>
                        ) : row.type === 'number' ? (
                          <input
                            type="number"
                            value={Number(raw)}
                            onChange={e => setForm({ ...form, [row.key]: Number(e.target.value) })}
                            style={{ width: 100 }}
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(raw)}
                            onChange={e => setForm({ ...form, [row.key]: e.target.value })}
                            style={{ width: '100%', maxWidth: 300 }}
                          />
                        )}
                      </dd>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <strong>Configuration note</strong> — Changes are validated and saved in the controller data directory for the next launch. Restart the controller and affected workers when idle. Explicit environment variables take precedence over saved settings.
          </div>
        </div>
      )}
    </>
  )
}
