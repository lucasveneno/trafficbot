import { useState, useEffect } from 'react'
import { X, Play } from 'lucide-react'
import type { Connection } from '../services/control'
import { fleetApi } from '../services/api'
import { ProgressBar } from './ProgressBar'

export function FleetUpdateModal({ connection, onClose }: { connection: Connection, onClose: () => void }) {
  const [active, setActive] = useState<any>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [canaryCount, setCanaryCount] = useState(1)
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [minCapacityPct, setMinCapacityPct] = useState(50)
  
  const fetchActive = async () => {
    const data = await fleetApi.getActiveRollout(connection)
    setActive(data)
  }

  useEffect(() => {
    fetchActive()
    const timer = setInterval(fetchActive, 2000)
    return () => clearInterval(timer)
  }, [connection])

  const startRollout = async () => {
    await fleetApi.startRollout(connection, {
      targetVersion,
      canaryCount,
      maxConcurrent,
      minCapacityPct,
    })
    await fetchActive()
  }

  const stopRollout = async () => {
    await fleetApi.stopRollout(connection)
    await fetchActive()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2>Fleet Rollout Planner</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-content" style={{ padding: 20 }}>
          {active && active.state !== 'completed' && active.state !== 'failed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <strong>Status:</strong> {active.state}
              </div>
              <div>
                <strong>Target Version:</strong> {active.targetVersion}
              </div>
              <div>
                <ProgressBar 
                  value={active.completed?.length || 0} 
                  max={active.totalEligible || 1} 
                  label={`${active.completed?.length || 0} / ${active.totalEligible} updated`} 
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                In progress: {active.inProgress?.length || 0} | Failed: {active.failed?.length || 0} | Pending: {active.pending?.length || 0}
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn-danger" onClick={stopRollout}>Stop Rollout</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p>Configure a rolling update for eligible workers across the fleet.</p>
              
              <div className="form-group">
                <label>Target Version</label>
                <input 
                  type="text" 
                  value={targetVersion} 
                  onChange={e => setTargetVersion(e.target.value)} 
                  placeholder="e.g. 2.0.2" 
                />
              </div>
              
              <div className="form-group">
                <label>Canary Workers</label>
                <input 
                  type="number" 
                  value={canaryCount} 
                  onChange={e => setCanaryCount(parseInt(e.target.value))} 
                  min="0" 
                />
                <span className="help-text">Update these workers first and wait for success before continuing.</span>
              </div>
              
              <div className="form-group">
                <label>Max Concurrent</label>
                <input 
                  type="number" 
                  value={maxConcurrent} 
                  onChange={e => setMaxConcurrent(parseInt(e.target.value))} 
                  min="1" 
                />
              </div>
              
              <div className="form-group">
                <label>Min Capacity %</label>
                <input 
                  type="number" 
                  value={minCapacityPct} 
                  onChange={e => setMinCapacityPct(parseInt(e.target.value))} 
                  min="0" 
                  max="100" 
                />
                <span className="help-text">Pause rollout if online fleet capacity drops below this percentage.</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button 
                  className="btn-primary" 
                  onClick={startRollout}
                  disabled={!targetVersion.trim()}
                >
                  <Play size={16} /> Start Rollout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
