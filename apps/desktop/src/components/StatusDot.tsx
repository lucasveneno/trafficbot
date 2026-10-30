import type { WorkerView, SessionView, SystemView } from '../types/control'

type Status = 'healthy' | 'busy' | 'offline' | 'degraded' | 'stopping' | 'queued' | 'active' | 'completed' | 'failed' | 'delayed' | 'ready' | 'unavailable' | 'live' | string

const COLOR: Record<string, string> = {
  healthy: '#6ee7b7',
  ready: '#6ee7b7',
  live: '#6ee7b7',
  completed: '#6ee7b7',
  active: '#93c5fd',
  busy: '#93c5fd',
  queued: '#fbbf24',
  delayed: '#fbbf24',
  degraded: '#fb923c',
  stopping: '#fb923c',
  failed: '#f87171',
  unavailable: '#f87171',
  offline: '#4b5563',
}

export function StatusDot({ status, size = 7 }: { status: Status; size?: number }) {
  const color = COLOR[status] ?? '#6b7280'
  return (
    <span
      aria-label={status}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: color !== '#4b5563' ? `0 0 6px ${color}55` : undefined,
      }}
    />
  )
}

export function workerStatus(w: WorkerView): Status {
  if (!w.heartbeatAt) return 'offline'
  const age = Date.now() - new Date(w.heartbeatAt).getTime()
  if (age > 60_000) return 'offline'
  return w.health
}

export function sessionStatus(s: SessionView): Status {
  return s.status
}

export function systemStatus(sys: SystemView): Status {
  if (sys.redis === 'unavailable') return 'degraded'
  return sys.status as Status
}
