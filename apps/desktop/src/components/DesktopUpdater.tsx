import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { RefreshCw, Download, AlertTriangle } from 'lucide-react'

type Status = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'restart_required' | 'up_to_date' | 'failed'

export function DesktopUpdater() {
  const [version, setVersion] = useState<string>('Unknown')
  const [status, setStatus] = useState<Status>('idle')
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error)
    checkForUpdates()
    const interval = setInterval(checkForUpdates, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const checkForUpdates = async () => {
    setStatus('checking')
    setError('')
    try {
      const update = await check()
      if (update) {
        setUpdateInfo(update)
        setStatus('available')
      } else {
        setStatus('up_to_date')
      }
    } catch (e) {
      console.error(e)
      setError(String(e))
      setStatus('failed')
    }
  }

  const installUpdate = async () => {
    if (!updateInfo) return
    setStatus('downloading')
    setError('')
    setProgress(0)
    let downloaded = 0
    let totalLength = 0
    try {
      await updateInfo.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalLength = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (totalLength > 0) {
            setProgress(Math.round((downloaded / totalLength) * 100))
          }
        } else if (event.event === 'Finished') {
          setStatus('installing')
        }
      })
      setStatus('restart_required')
    } catch (e) {
      console.error(e)
      setError(String(e))
      setStatus('failed')
    }
  }

  const applyRestart = async () => {
    try {
      // Gracefully shutdown the embedded sidecar first
      await invoke('stop_engine')
      await relaunch()
    } catch (e) {
      console.error('Failed to restart:', e)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Application Updates</h2>
        {status === 'checking' && <RefreshCw size={14} className="spin" />}
      </div>
      
      <div className="detail-section">
        <div className="detail-row">
          <dt>Current version</dt>
          <dd className="mono">{version}</dd>
        </div>
        <div className="detail-row">
          <dt>Release channel</dt>
          <dd>Stable</dd>
        </div>
        <div className="detail-row">
          <dt>Update status</dt>
          <dd>
            {status === 'idle' && 'Idle'}
            {status === 'checking' && 'Checking for updates...'}
            {status === 'up_to_date' && <span style={{ color: 'var(--green)' }}>Up to date</span>}
            {status === 'available' && <span style={{ color: 'var(--info)' }}>Update available</span>}
            {status === 'downloading' && `Downloading... ${progress}%`}
            {status === 'installing' && 'Installing...'}
            {status === 'restart_required' && <span style={{ color: 'var(--warn)' }}>Restart required</span>}
            {status === 'failed' && <span style={{ color: 'var(--danger)' }}>Failed</span>}
          </dd>
        </div>
      </div>

      <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        {status === 'failed' && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            Update installation failed. Current Trafficbot installation was preserved.
            <br />
            <small>{error}</small>
          </div>
        )}

        {status === 'available' && updateInfo && (
          <div style={{ marginBottom: 16 }}>
            <h3>Trafficbot {updateInfo.version} is available</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Released {updateInfo.date ? new Date(updateInfo.date).toLocaleDateString() : 'Unknown'}
            </p>
            {updateInfo.body && (
              <pre style={{ marginTop: 8, fontSize: 12, padding: 8, background: 'var(--bg)', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                {updateInfo.body}
              </pre>
            )}
          </div>
        )}

        {status === 'restart_required' && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle size={16} />
              <strong>Trafficbot is currently managing active operations.</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13 }}>
              Restarting the Control Server will temporarily interrupt management visibility.
              Workers will continue operating independently.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {(status === 'idle' || status === 'up_to_date' || status === 'failed' || status === 'checking') && (
            <button className="btn-default" onClick={checkForUpdates} disabled={status === 'checking'}>
              Check for Updates
            </button>
          )}
          
          {status === 'available' && (
            <button className="btn-primary" onClick={installUpdate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Download & Install
            </button>
          )}

          {status === 'restart_required' && (
            <button className="btn-primary" onClick={applyRestart}>
              Restart & Update
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
