import { StatusDot } from './StatusDot'
import type { SystemView } from '../types/control'

export function EngineStatus({
  system,
  live,
  owned,
}: {
  system?: SystemView
  live: boolean
  owned?: boolean
}) {
  const online = !!system && live && system.redis !== 'unavailable'
  const label = !system || !live
    ? 'Engine offline'
    : system.redis === 'unavailable'
    ? 'Redis unavailable'
    : system.status === 'stopping'
    ? 'Engine stopping'
    : system.status === 'degraded'
    ? 'Engine degraded'
    : 'Engine healthy'
  const status = !system || !live
    ? 'offline'
    : system.redis === 'unavailable'
    ? 'degraded'
    : system.status

  return (
    <div className="engine-status">
      <StatusDot status={status} size={8} />
      <span className="engine-status-label">{label}</span>
      {online && live && <span className="engine-status-live">● live</span>}
      {owned && <span className="engine-status-owned">owned</span>}
    </div>
  )
}
