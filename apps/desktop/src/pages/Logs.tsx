import { useEffect, useRef, useState, useCallback } from 'react'
import { Download, Filter, Pause, Play, Trash2, FileText } from 'lucide-react'
import type { LogEntry, LogLevel } from '../types/control'
import type { Connection } from '../services/control'
import { logsApi } from '../services/api'
import { useUI } from '../stores/ui'

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'var(--red)',
  warn: 'var(--amber)',
  info: 'var(--text-dim)',
  debug: 'var(--muted)',
}

const LEVEL_BG: Record<LogLevel, string> = {
  error: 'var(--red-bg)',
  warn: 'var(--amber-bg)',
  info: 'transparent',
  debug: 'transparent',
}

function LogLine({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0

  return (
    <div
      className="log-line"
      style={{ background: LEVEL_BG[entry.level] }}
      onClick={() => hasMeta && setExpanded(e => !e)}
      role={hasMeta ? 'button' : undefined}
    >
      <span className="log-ts">{new Date(entry.ts).toLocaleTimeString()}</span>
      <span className="log-level" style={{ color: LEVEL_COLORS[entry.level] }}>{entry.level.toUpperCase()}</span>
      {entry.service && <span className="log-service">{entry.service}</span>}
      <span className="log-msg">{entry.message}</span>
      {hasMeta && !expanded && <span className="log-expand">+meta</span>}
      {hasMeta && expanded && (
        <pre className="log-meta">{JSON.stringify(entry.meta, null, 2)}</pre>
      )}
    </div>
  )
}

export function Logs({ connection }: { connection: Connection | null }) {
  const search = useUI(state => state.logFilter), setSearch = useUI(state => state.setLogFilter)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const load = useCallback(async () => {
    if (!connection || pausedRef.current) return
    try {
      const data = await logsApi.get(connection, {
        limit: 500,
        level: level === 'all' ? undefined : level,
      })
      setEntries(data)
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }, [connection, level])

  // Initial load
  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  // Poll every 3 seconds
  useEffect(() => {
    const id = setInterval(() => void load(), 3000)
    return () => clearInterval(id)
  }, [load])

  // Auto-scroll to bottom when not paused
  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, paused])

  const handleExport = () => {
    const text = entries.map(e => `[${e.ts}] [${e.level.toUpperCase()}] ${e.service ? `[${e.service}] ` : ''}${e.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `trafficbot-logs-${Date.now()}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = entries.filter(e => (level === 'all' || e.level === level) && (!search || JSON.stringify(e).toLowerCase().includes(search.toLowerCase())))

  const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 }
  for (const e of entries) counts[e.level] = (counts[e.level] ?? 0) + 1

  return (
    <div className="logs-page">
      <div className="logs-toolbar">
        <input aria-label="Search logs" placeholder="Search messages or session metadata" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex-gap">
          <Filter size={13} />
          {(['all', 'error', 'warn', 'info', 'debug'] as const).map(l => (
            <button
              key={l}
              className={`log-filter-btn ${level === l ? 'active' : ''}`}
              onClick={() => setLevel(l)}
            >
              {l === 'all' ? 'All' : l}
              {l !== 'all' && counts[l] > 0 && (
                <em className="log-count" style={{ color: LEVEL_COLORS[l] }}>{counts[l]}</em>
              )}
            </button>
          ))}
        </div>
        <div className="flex-gap">
          <span className="muted-label">{filtered.length} lines</span>
          <button className="icon-btn" onClick={() => setPaused(p => !p)} title={paused ? 'Resume' : 'Pause stream'}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button className="icon-btn" onClick={() => setEntries([])} title="Clear"><Trash2 size={14} /></button>
          <button className="icon-btn" onClick={handleExport} title="Export as .txt" disabled={!filtered.length}><Download size={14} /></button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {paused && (
        <div className="log-paused-banner">
          Stream paused — <button className="text-link" onClick={() => setPaused(false)}>resume</button>
        </div>
      )}

      <div className="logs-container" ref={containerRef}>
        {loading && !entries.length && <div className="empty-hint">Loading logs…</div>}

        {!loading && !entries.length && !error && (
          <div className="empty-panel" style={{ padding: 40 }}>
            <div className="empty-icon"><FileText size={28} /></div>
            <h2>No log entries in buffer</h2>
            <p>The in-memory log buffer holds up to 2 000 recent lines from the controller process. Entries appear here as the engine runs.</p>
          </div>
        )}

        {filtered.map((e, i) => <LogLine key={i} entry={e} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
