import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Sessions } from './Sessions'
import type { ControlSnapshot, SessionView } from '../types/control'
import { sessionApi } from '../services/api'
import { useUI } from '../stores/ui'

const session: SessionView = { id: 'public-session', executionId: 'internal-job', status: 'failed', workerId: 'worker-one', platform: 'linux', browser: 'chrome', profileId: null, persistent: false, proxy: 'direct', url: 'http://localhost/fixture', createdAt: '2026-10-30T12:00:00Z', startedAt: '2026-10-30T12:00:01Z', finishedAt: '2026-10-30T12:00:02Z', durationMs: 1000, attempts: 1, error: 'Session failed', campaignId: 'campaign-one' }
const connection = { baseUrl: 'http://localhost:4782', token: 'fixture', owned: true }
afterEach(() => vi.restoreAllMocks())

test('shows worker timeline, safe failure details, lazy screenshot and canonical log link', async () => {
  const diagnostics = vi.spyOn(sessionApi, 'diagnostics').mockImplementation(async (_conn, _id, screenshot) => ({ events: [{ id: 'event', sessionId: session.id, ts: session.finishedAt!, attempt: 1, phase: 'failed', message: 'Target returned HTTP 500.' }], screenshot: screenshot ? 'data:image/jpeg;base64,fixture' : undefined }))
  render(<Sessions data={{ sessions: [session] } as ControlSnapshot} search="" status="all" platform="all" connection={connection} />)
  fireEvent.click(screen.getByRole('button', { name: session.url }))
  await waitFor(() => expect(screen.getAllByText('Target returned HTTP 500.')).toHaveLength(2))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load failure screenshot' }))
  expect(await screen.findByRole('img', { name: /viewport captured/i })).toHaveAttribute('src', 'data:image/jpeg;base64,fixture')
  expect(diagnostics).toHaveBeenCalledWith(connection, session.id, true)
  fireEvent.click(screen.getByRole('button', { name: 'Search related logs' }))
  expect(useUI.getState().logFilter).toBe(session.id)
})

test('retry is disabled while request is pending', async () => {
  vi.spyOn(sessionApi, 'diagnostics').mockResolvedValue({ events: [] })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  let finish!: () => void
  const retry = vi.spyOn(sessionApi, 'retry').mockImplementation(() => new Promise(resolve => { finish = () => resolve({}) }))
  render(<Sessions data={{ sessions: [session] } as ControlSnapshot} search="" status="all" platform="all" connection={connection} />)
  fireEvent.click(screen.getByRole('button', { name: session.url }))
  fireEvent.click(screen.getByRole('button', { name: 'Retry session' }))
  expect(screen.getByRole('button', { name: 'Requesting…' })).toBeDisabled()
  expect(retry).toHaveBeenCalledTimes(1)
  finish()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry session' })).toBeEnabled())
})
