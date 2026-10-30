import { useState } from 'react'
import { Server, Download, Copy, CheckCircle, Loader2 } from 'lucide-react'
import { PlatformIcon, platformLabel } from './PlatformIcon'
import type { Platform } from '../types/control'
import { workerApi } from '../services/api'
import type { Connection } from '../services/control'

export function EnrollmentWizard({ connection, onClose, onTokenCreated }: { connection: Connection | null, onClose: () => void, onTokenCreated: (token: string) => void }) {
  const [platform, setPlatform] = useState<Platform>('linux')
  const [arch, setArch] = useState<'x64' | 'arm64'>('x64')
  const [loading, setLoading] = useState(false)
  const [enrollment, setEnrollment] = useState<{ token: string, expiresAt: string } | null>(null)

  const generate = async () => {
    if (!connection) return
    setLoading(true)
    try {
      const res = await workerApi.enrollment(connection)
      setEnrollment(res)
      onTokenCreated(res.token)
    } finally {
      setLoading(false)
    }
  }

  const copyCommand = async () => {
    if (!enrollment) return
    const cmd = platform === 'windows' 
      ? `.\\trafficbot-worker-windows-${arch}.exe enroll --token ${enrollment.token} --server http://127.0.0.1:4782`
      : `./trafficbot-worker-${platform}-${arch} enroll --token ${enrollment.token} --server http://127.0.0.1:4782`
    await navigator.clipboard.writeText(cmd)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2>Add Worker</h2>
        
        {!enrollment ? (
          <div className="form-stack" style={{ marginTop: 24 }}>
            <div className="form-group">
              <label>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['linux', 'windows', 'macos'].map((p) => (
                  <button key={p} className={`chip ${platform === p ? 'active' : ''}`} onClick={() => { setPlatform(p as Platform); if (p === 'windows') setArch('x64') }}>
                    <PlatformIcon platform={p as Platform} size={14} />
                    {platformLabel(p as Platform)}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Architecture</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['x64', 'arm64'].map((a) => (
                  <button key={a} disabled={platform === 'windows' && a === 'arm64'} className={`chip ${arch === a ? 'active' : ''}`} onClick={() => setArch(a as any)}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Connection</label>
              <div className="muted-box">
                <Server size={14} />
                <span>Control Server: local</span>
                <p>Run enrollment on this computer. For a remote worker, first forward ports 4782 and your Redis port over an authenticated SSH tunnel to the controller. Loopback addresses on a remote worker otherwise refer to that worker itself.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={generate} disabled={loading}>
                {loading && <Loader2 className="spin" size={14} />}
                Generate Setup
              </button>
            </div>
          </div>
        ) : (
          <div className="form-stack" style={{ marginTop: 24 }}>
            <div className="success-banner">
              <CheckCircle size={16} />
              <span>Enrollment token generated (expires in 1h)</span>
            </div>

            <div className="form-group">
              <label>1. Download Worker Binary</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`https://github.com/lucasveneno/trafficbot/releases/latest/download/trafficbot-worker-${platform}-${arch}${platform === 'windows' ? '.exe' : ''}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  <Download size={14} />
                  Download for {platform} ({arch})
                </a>
              </div>
            </div>

            <div className="form-group">
              <label>2. Run Enrollment Command</label>
              <div className="code-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {platform === 'windows' ? '.\\trafficbot-worker-' : './trafficbot-worker-'}{platform}-{arch}{platform === 'windows' ? '.exe' : ''} enroll --token {enrollment.token} --server http://127.0.0.1:4782
                </code>
                <button className="btn-icon" onClick={copyCommand} title="Copy command"><Copy size={14} /></button>
              </div>
            </div>

            <div className="waiting-state" style={{ marginTop: 24, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 className="spin" size={24} style={{ margin: '0 auto 12px' }} />
              <p>Waiting for worker registration...</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
