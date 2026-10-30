import { Layers } from 'lucide-react'

export function Placeholder({ page }: { page: string }) {
  return (
    <div className="empty-panel">
      <div className="empty-icon">
        <Layers size={32} />
      </div>
      <h2>{page} — planned for milestone 2</h2>
      <p>
        This section is being built. The current release delivers{' '}
        <strong>Dashboard, Workers, Sessions, and Queues</strong> with live WebSocket updates.
      </p>
    </div>
  )
}
