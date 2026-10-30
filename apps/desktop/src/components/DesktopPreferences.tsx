import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { native } from '../services/control'
export function DesktopPreferences() {
  const [enabled, setEnabled] = useState(true), [error, setError] = useState('')
  useEffect(() => { if (native) void invoke<boolean>('get_close_behavior').then(setEnabled).catch(e => setError(String(e))) }, [])
  if (!native) return null
  return <section className="panel"><h2>Desktop behavior</h2><label><input type="checkbox" checked={enabled} onChange={e => { const next = e.target.checked; void invoke('set_close_behavior', { enabled: next }).then(() => setEnabled(next)).catch(e => setError(String(e))) }} />Minimize to tray when closing the window</label><p>When disabled, closing quits only after the owned controller can stop safely. Active work prevents quitting.</p>{error && <p role="alert">{error}</p>}</section>
}
