import type { ControlSnapshot } from '../types/control'
export interface Connection { baseUrl: string; token: string; owned: boolean }
export const native = '__TAURI_INTERNALS__' in window
export async function connect(): Promise<Connection> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('connect_engine')
}
export async function snapshot(connection: Connection): Promise<ControlSnapshot> {
  const response = await fetch(`${connection.baseUrl}/api/snapshot`, { headers: { Authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Controller unavailable (${response.status})`)
  const data = await response.json() as ControlSnapshot
  if (data.system?.application !== 'trafficbot' || data.system.apiVersion !== 1) throw new Error('Incompatible controller')
  return data
}
export async function stop(): Promise<void> { const { invoke } = await import('@tauri-apps/api/core'); await invoke('stop_engine') }
