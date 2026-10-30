import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Activity,
  BarChart3,
  ChevronRight,
  Cpu,
  FileText,
  Globe,
  Layers,
  Moon,
  Power,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sun,
  Calendar,
  Zap,
} from 'lucide-react'
import { useUI } from './stores/ui'
import { useControl } from './hooks/useControl'
import { connect, native, stop, type Connection } from './services/control'
import { StatusDot } from './components/StatusDot'
import { EngineStatus } from './components/EngineStatus'
import { Dashboard } from './pages/Dashboard'
import { Workers } from './pages/Workers'
import { Sessions } from './pages/Sessions'
import { Queues } from './pages/Queues'
import { Campaigns } from './pages/Campaigns'
import { Profiles } from './pages/Profiles'
import { Proxies } from './pages/Proxies'
import { Logs } from './pages/Logs'
import { Settings } from './pages/Settings'
import { Schedules } from './pages/Schedules'
import { Placeholder } from './pages/Placeholder'

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 4000 } },
})

type Page = 'Dashboard' | 'Campaigns' | 'Sessions' | 'Workers' | 'Profiles' | 'Proxies' | 'Queues' | 'Schedules' | 'Logs' | 'Settings'

const NAV: { name: Page; icon: React.ReactNode; badge?: (d: ReturnType<typeof useControl>['data']) => number | undefined }[] = [
  { name: 'Dashboard', icon: <Activity size={16} /> },
  { name: 'Campaigns', icon: <Zap size={16} /> },
  { name: 'Sessions', icon: <BarChart3 size={16} />, badge: (d) => d?.system.counts.active || undefined },
  { name: 'Workers', icon: <Cpu size={16} />, badge: (d) => d?.system.counts.workers || undefined },
  { name: 'Profiles', icon: <Shield size={16} /> },
  { name: 'Proxies', icon: <Globe size={16} /> },
  { name: 'Queues', icon: <Layers size={16} /> },
  { name: 'Schedules', icon: <Calendar size={16} /> },
  { name: 'Logs', icon: <FileText size={16} /> },
  { name: 'Settings', icon: <SettingsIcon size={16} /> },
]

const IMPLEMENTED: Page[] = ['Dashboard', 'Campaigns', 'Sessions', 'Workers', 'Profiles', 'Proxies', 'Queues', 'Logs', 'Settings', 'Schedules']

/** Pages that need the search/platform filter bar */
const NEEDS_SEARCH: Page[] = ['Workers', 'Sessions', 'Profiles']
/** Pages that need the status filter dropdown */
const NEEDS_STATUS: Page[] = ['Sessions']
/** Pages that need the platform filter dropdown */
const NEEDS_PLATFORM: Page[] = ['Workers', 'Sessions']

function NavItem({
  item, active, onClick, badgeValue,
}: {
  item: (typeof NAV)[number]; active: boolean; onClick: () => void; badgeValue?: number
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label-text">{item.name}</span>
      {!IMPLEMENTED.includes(item.name) && <span className="nav-soon">soon</span>}
      {badgeValue != null && <em className="nav-badge">{badgeValue}</em>}
    </button>
  )
}

function Console() {
  const { page, dark, navigate, toggle } = useUI()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [platform, setPlatform] = useState('all')

  const state = useControl(connection)
  const data = state.data

  // Auto-connect in native mode
  useEffect(() => {
    if (!native) return
    let disposed = false
    void connect()
      .then((value) => { if (!disposed) setConnection(value) })
      .catch((e) => { if (!disposed) setError(String(e)) })
    return () => { disposed = true }
  }, [])

  // Listen for Tauri tray events
  useEffect(() => {
    if (!native) return
    let disposed = false
    const cleanup: (() => void)[] = []
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      for (const [event, handler] of [
        ['engine-error', (e: { payload: unknown }) => setError(String(e.payload))],
        ['engine-changed', () => { setConnection(null); client.clear(); setError('Engine state changed from tray. Reconnect to resume monitoring.') }],
      ] as const) {
        const unlisten = await listen(event, handler)
        if (disposed) unlisten()
        else cleanup.push(unlisten)
      }
    })
    return () => { disposed = true; cleanup.forEach((fn) => fn()) }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  async function handleConnect() {
    setBusy(true); setError('')
    try { setConnection(await connect()) } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }

  async function handleStop() {
    if (!confirm('Stop the desktop-owned controller? Pending work or unknown Redis state will prevent shutdown.')) return
    setBusy(true)
    try { await stop(); setConnection(null); client.clear() } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function handleRestart() {
    if (!connection?.owned || !confirm('Restart the owned controller when idle? Pending sessions will prevent restart.')) return
    setBusy(true); setError('')
    try { await stop(); setConnection(null); client.clear(); setConnection(await connect()) } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }

  function resetFilters() { setSearch(''); setStatus('all'); setPlatform('all') }

  const needsFilters = NEEDS_SEARCH.includes(page as Page)
  const updatedAt = data?.system.updatedAt
    ? `Updated ${new Date(data.system.updatedAt).toLocaleTimeString()}`
    : 'Awaiting controller'

  const pageTitle: Record<Page, string> = {
    Dashboard: 'Your browser infrastructure, at a glance.',
    Workers: 'Execution environments and device capabilities.',
    Sessions: 'Active and completed browser sessions.',
    Queues: 'BullMQ queue state across all platforms.',
    Campaigns: 'Reusable traffic campaign configurations.',
    Profiles: 'Persistent browser profile inventory.',
    Proxies: 'Proxy pool and health monitoring.',
    Schedules: 'Scheduled campaign execution.',
    Logs: 'Real-time log stream from the controller.',
    Settings: 'Controller and desktop configuration.',
  }

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity size={20} /></div>
          <div>trafficbot<small>CONTROL CENTER</small></div>
        </div>

        <div className="workspace-chip">
          <b>L</b>
          <div>Local workspace<small>Desktop · Operations</small></div>
        </div>

        <div className="nav-section-label">OPERATIONS</div>
        <nav aria-label="Main navigation">
          {NAV.filter(n => !['Settings', 'Logs'].includes(n.name)).map((item) => (
            <NavItem
              key={item.name}
              item={item}
              active={page === item.name}
              onClick={() => { navigate(item.name); resetFilters() }}
              badgeValue={item.badge?.(data)}
            />
          ))}
        </nav>

        <div className="nav-section-label" style={{ marginTop: 24 }}>SYSTEM</div>
        <nav aria-label="System navigation">
          {NAV.filter(n => ['Logs', 'Settings'].includes(n.name)).map((item) => (
            <NavItem
              key={item.name}
              item={item}
              active={page === item.name}
              onClick={() => { navigate(item.name); resetFilters() }}
              badgeValue={item.badge?.(data)}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version-info">
            <span className="sidebar-connection-dot" style={{ background: state.live && !state.error ? 'var(--green)' : 'var(--muted)' }} />
            <span>Control Server &nbsp;&middot;&nbsp; {state.live && !state.error ? 'Connected' : 'Offline'}</span>
          </div>
          <EngineStatus system={data?.system} live={state.live} owned={connection?.owned} />
        </div>
      </aside>

      {/* ── Main ── */}
      <main>
        <header className="top-bar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{page}</strong>
          </div>
          <div className="top-bar-right">
            <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <StatusDot status={state.error ? 'offline' : data?.system.status ?? 'offline'} size={7} />
            <span className="muted-label">{updatedAt}</span>
            <button aria-label="Refresh" disabled={!connection} onClick={() => void state.refetch()} className="icon-btn">
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        <div className={`content${page === 'Logs' ? ' content-logs' : ''}`}>
          {/* Page heading */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">OPERATIONS OVERVIEW</div>
              <h1>{page}</h1>
              <p>{pageTitle[page as Page]}</p>
            </div>
            <div className="page-actions">
            {native && connection?.owned && <button disabled={busy || !state.live} onClick={() => void handleRestart()}><RefreshCw size={14} />Restart engine</button>}
              {connection ? (
                <button
                  disabled={busy}
                  onClick={() => void (connection.owned ? handleStop() : undefined)}
                  className={connection.owned ? 'btn-danger' : 'btn-default'}
                  title={connection.owned ? 'Stop engine' : 'Engine connected externally'}
                >
                  <Power size={14} />
                  {busy ? 'Working…' : connection.owned ? 'Stop engine' : 'Engine connected'}
                </button>
              ) : (
                <button disabled={busy || !native} onClick={() => void handleConnect()}>
                  <Power size={14} />
                  {busy ? 'Connecting…' : 'Connect engine'}
                </button>
              )}
            </div>
          </div>

          {/* Alerts */}
          {(error || state.error) && (
            <div role="alert" className="alert alert-error">
              <strong>Unable to reach Trafficbot Control Server</strong>
              <p>The desktop application is running, but the local Control Server is not responding. Error: {error || state.error?.message}</p>
            </div>
          )}

          {!connection && !native && (
            <form
              className="connect-form"
              onSubmit={(e) => {
                e.preventDefault()
                setConnection({ baseUrl: 'http://127.0.0.1:4782', token, owned: false })
                setToken('')
              }}
            >
              <div>
                <strong>Connect to local controller</strong>
                <p>Browser preview requires the installation token. The native app connects automatically.</p>
              </div>
              <input
                type="password" aria-label="Controller token"
                placeholder="Installation token (64-char hex)"
                value={token} onChange={(e) => setToken(e.target.value)}
                required pattern="[a-f0-9]{64}"
              />
              <button type="submit" className="btn-primary">Connect</button>
            </form>
          )}

          {connection && data?.system.redis === 'unavailable' && (
            <div className="alert alert-warn" style={{ marginBottom: 20 }}>
              <strong>Redis is unavailable</strong>
              <p>The Control Server is connected, but Redis is offline. Operational data cannot be saved or read.</p>
            </div>
          )}

          {/* Search / filter bar */}
          {needsFilters && (
            <div className="filter-bar">
              <label className="filter-search">
                <Search size={13} />
                <input
                  aria-label="Search" placeholder="Search…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {NEEDS_PLATFORM.includes(page as Page) && (
                <select aria-label="Platform filter" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {['all', 'linux', 'windows', 'macos', 'android', 'ios'].map((p) => (
                    <option key={p} value={p}>{p === 'all' ? 'All platforms' : p}</option>
                  ))}
                </select>
              )}
              {NEEDS_STATUS.includes(page as Page) && (
                <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {['all', 'active', 'queued', 'completed', 'failed', 'delayed'].map((s) => (
                    <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Page router */}
          {page === 'Dashboard' && (
            <Dashboard data={data} live={state.live} owned={connection?.owned} connection={connection} />
          )}
          {page === 'Workers' && (
            <Workers data={data} search={search} platform={platform} connection={connection} />
          )}
          {page === 'Sessions' && (
            <Sessions data={data} search={search} status={status} platform={platform} connection={connection} />
          )}
          {page === 'Queues' && <Queues data={data} />}
          {page === 'Campaigns' && (
            <Campaigns
              workers={data?.workers}
              campaigns={undefined}
              connection={connection}
            />
          )}
          {page === 'Profiles' && <Profiles connection={connection} search={search} />}
          {page === 'Proxies' && <Proxies connection={connection} />}
          {page === 'Logs' && <Logs connection={connection} />}
          {page === 'Settings' && <Settings connection={connection} />}
          {page === 'Schedules' && (
            <Schedules connection={connection} redisReady={data?.system.redis === 'ready'} />
          )}
          {!IMPLEMENTED.includes(page as Page) && <Placeholder page={page} />}
        </div>

        <footer className="page-footer">
          TRAFFICBOT
          <span>Local operations · No synthetic metrics</span>
          <span>{state.live ? '● Streaming updates every 2s' : '○ Waiting for live updates'}</span>
        </footer>
      </main>
    </div>
  )
}

import { ToastContainer } from './components/Toast'

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <Console />
      <ToastContainer />
    </QueryClientProvider>
  )
}
