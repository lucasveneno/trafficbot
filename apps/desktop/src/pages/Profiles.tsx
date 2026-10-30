import { useEffect, useState } from 'react'
import { Trash2, Shield, X } from 'lucide-react'
import type { ProfileView } from '../types/control'
import { Badge } from '../components/Badge'
import { PlatformIcon, platformLabel } from '../components/PlatformIcon'
import type { Connection } from '../services/control'
import { profileApi } from '../services/api'

function ProfileDetailPanel({ profile, onClose, onDelete }: { profile: ProfileView; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="detail-panel" role="complementary" aria-label="Profile details">
      <button className="detail-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <div className="detail-eyebrow">BROWSER PROFILE</div>
      <div className="detail-platform-row">
        <PlatformIcon platform={profile.operatingSystem} size={20} />
        <div>
          <h2 className="detail-title">{profile.key}</h2>
          <small className="detail-id mono">{profile.id}</small>
        </div>
      </div>

      <div className="detail-subheader">Identity</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Profile key</dt><dd className="mono">{profile.key}</dd></div>
        <div className="detail-row"><dt>Source</dt><dd><Badge value={profile.source} /></dd></div>
        <div className="detail-row"><dt>OS</dt><dd>{platformLabel(profile.operatingSystem)}</dd></div>
        <div className="detail-row"><dt>Browser</dt><dd>{profile.browser}</dd></div>
        <div className="detail-row"><dt>Browser version</dt><dd>{profile.browserVersion}</dd></div>
        <div className="detail-row"><dt>OS version</dt><dd>{profile.osVersion}</dd></div>
        <div className="detail-row"><dt>Mobile</dt><dd>{profile.mobile ? 'Yes' : 'No'}</dd></div>
      </div>

      <div className="detail-subheader">Locale &amp; geography</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Locale</dt><dd>{profile.locale}</dd></div>
        <div className="detail-row"><dt>Timezone</dt><dd>{profile.timezone}</dd></div>
        <div className="detail-row"><dt>Country</dt><dd>{profile.country ?? '—'}</dd></div>
      </div>

      <div className="detail-subheader">Fingerprint</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Viewport</dt><dd>{profile.viewport.width} × {profile.viewport.height}</dd></div>
        <div className="detail-row"><dt>User-Agent</dt><dd className="ua-cell">{profile.userAgent}</dd></div>
      </div>

      {profile.deviceSerial && (
        <>
          <div className="detail-subheader">Android binding</div>
          <div className="detail-section">
            <div className="detail-row"><dt>Device serial</dt><dd className="mono">{profile.deviceSerial}</dd></div>
          </div>
        </>
      )}

      <div className="detail-subheader">Storage</div>
      <div className="detail-section">
        <div className="detail-row"><dt>Last updated</dt><dd>{profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : '—'}</dd></div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <button
          className="btn-danger"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete profile
        </button>
      </div>
    </div>
  )
}

function ProfileRow({ profile, onClick }: { profile: ProfileView; onClick: () => void }) {
  const age = profile.updatedAt
    ? Math.floor((Date.now() - new Date(profile.updatedAt).getTime()) / 86400000)
    : null

  return (
    <tr>
      <td>
        <button className="text-link" onClick={onClick}><strong className="mono">{profile.key}</strong></button>
        <small>{profile.id.slice(-14)}</small>
      </td>
      <td>
        <div className="flex-gap">
          <PlatformIcon platform={profile.operatingSystem} size={12} />
          <span>{platformLabel(profile.operatingSystem)}</span>
        </div>
      </td>
      <td>{profile.browser} {profile.browserVersion}</td>
      <td>{profile.locale} · {profile.country ?? 'any'}</td>
      <td>{profile.viewport.width} × {profile.viewport.height}</td>
      <td><Badge value={profile.source} /></td>
      <td className="muted-label">{age !== null ? (age === 0 ? 'Today' : `${age}d ago`) : '—'}</td>
    </tr>
  )
}

export function Profiles({ connection, search }: { connection: Connection | null; search: string }) {
  const [profiles, setProfiles] = useState<ProfileView[]>([])
  const [selected, setSelected] = useState<ProfileView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!connection) return
    setLoading(true)
    profileApi.list(connection)
      .then(data => { setProfiles(data); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [connection])

  const handleDelete = async () => {
    if (!connection || !selected) return
    if (!confirm(`Delete profile "${selected.key}"? The browser profile directory will be removed from disk.`)) return
    try {
      await profileApi.delete(connection, selected.key)
      setProfiles(ps => ps.filter(p => p.key !== selected.key))
      setSelected(null)
    } catch (e) {
      setError(String(e))
    }
  }

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase()
    return !q || `${p.key} ${p.browser} ${p.locale} ${p.country ?? ''} ${p.deviceSerial ?? ''}`.toLowerCase().includes(q)
  })

  return (
    <div className="page-with-detail">
      <div className="page-main">
        {error && <div className="alert alert-error">{error}</div>}

        {loading && <div className="empty-hint">Loading profiles…</div>}

        {!loading && !profiles.length && (
          <div className="empty-panel">
            <div className="empty-icon"><Shield size={32} /></div>
            <h2>No browser profiles found</h2>
            <p>Profiles are created when a session runs with <code>persistent: true</code> and a <code>profileKey</code>. They are stored in the <code>sessions/</code> data directory.</p>
          </div>
        )}

        {filtered.length > 0 && (
          <section className="panel">
            <div className="panel-header">
              <h2>Browser profiles</h2>
              <span className="muted-label">{filtered.length} of {profiles.length}</span>
            </div>
            <table>
              <thead><tr>
                {['Profile key', 'OS', 'Browser', 'Locale · Country', 'Viewport', 'Source', 'Updated'].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <ProfileRow key={p.key} profile={p} onClick={() => setSelected(p)} />
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {selected && (
        <ProfileDetailPanel
          profile={profiles.find(p => p.key === selected.key) ?? selected}
          onClose={() => setSelected(null)}
          onDelete={() => void handleDelete()}
        />
      )}
    </div>
  )
}
