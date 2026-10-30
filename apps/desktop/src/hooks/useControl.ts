import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ControlEvent } from '../types/control'
import { snapshot, type Connection } from '../services/control'
import { native } from '../services/control'
import type { ControlSnapshot } from '../types/control'
export function useControl(connection: Connection | null) {
  const client = useQueryClient()
  const [live, setLive] = useState(false)
  const query = useQuery({ queryKey: ['snapshot', connection?.baseUrl], queryFn: () => snapshot(connection!), enabled: !!connection, retry: 1, refetchInterval: 10000 })
  useEffect(() => {
    if (!connection) return
    let disposed = false, socket: WebSocket, timer: ReturnType<typeof setTimeout>
    let previous: ControlSnapshot | undefined
    let lastNotice = 0
    function notify(message: string) {
      if (!native || Date.now() - lastNotice < 30000) return
      lastNotice = Date.now()
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('notify_important', { message })).catch(() => undefined)
    }
    function open() {
      socket = new WebSocket(connection!.baseUrl.replace('http:', 'ws:') + '/events', ['trafficbot', connection!.token])
      socket.onopen = () => { setLive(true); void client.invalidateQueries({ queryKey: ['snapshot', connection!.baseUrl] }) }
      socket.onmessage = message => { try { const event = JSON.parse(message.data) as ControlEvent; if (event.type === 'snapshot') {
        if (previous?.workers.some(w => !event.data.workers.some(next => next.id === w.id))) notify('A worker went offline. Open Workers to inspect its status.')
        if (previous && event.data.system.counts.failed - previous.system.counts.failed >= 5) notify('Several sessions failed since the last update. Inspect Sessions and worker logs.')
        previous = event.data
        client.setQueryData(['snapshot', connection!.baseUrl], event.data)
      } } catch { socket.close() } }
      socket.onclose = () => { setLive(false); if (!disposed) { if (previous) notify('Controller connection lost. Trafficbot is reconnecting.'); timer = setTimeout(open, 2500) } }
      socket.onerror = () => socket.close()
    }
    open()
    return () => { disposed = true; clearTimeout(timer); socket?.close(); setLive(false) }
  }, [connection, client]) // reconnect snapshots are authoritative after any missed events
  return { ...query, live }
}
