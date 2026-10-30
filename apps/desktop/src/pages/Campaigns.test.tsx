import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { CampaignForm } from './Campaigns'
import { profileApi, proxyApi } from '../services/api'
import type { ProfileView, WorkerView } from '../types/control'
test('browser choices follow workers and an existing Android profile locks its device binding', async () => {
  const worker = { id: 'pixel', platform: 'android', architecture: 'arm64', runtime: 'device', browsers: [{ browser: 'chrome' }], capacity: 1, active: 0, health: 'healthy', heartbeatAt: null, device: { serial: 'pixel-1', type: 'physical' }, status: 'online', version: null, protocolVersion: null, compatibility: 'compatible', rollbackAvailable: false, rollbackVersion: null } as WorkerView
  vi.spyOn(profileApi, 'list').mockResolvedValue([{ key: 'pixel-profile', operatingSystem: 'android', browser: 'chrome', deviceSerial: 'pixel-1' } as ProfileView])
  vi.spyOn(proxyApi, 'list').mockResolvedValue([])
  render(<CampaignForm initial={{}} workers={[worker]} connection={{ baseUrl: 'http://127.0.0.1:4782', token: '', owned: false }} onSave={vi.fn()} onCancel={vi.fn()} busy={false} error="" />)
  expect(screen.getByLabelText('Browser')).toHaveTextContent('chrome')
  expect(screen.getByLabelText('Browser')).not.toHaveTextContent('safari')
  await waitFor(() => expect(screen.getByLabelText('Existing persistent profile')).toHaveTextContent('pixel-profile'))
  fireEvent.change(screen.getByLabelText('Existing persistent profile'), { target: { value: 'pixel-profile' } })
  expect(screen.getByLabelText('Operating system')).toBeDisabled()
  expect(screen.getByLabelText('Browser')).toBeDisabled()
  expect(screen.getByLabelText('Device')).toBeDisabled()
  expect(screen.getByLabelText('Device')).toHaveValue('pixel-1')
})
test('saves multiple targets, concurrency and a selected proxy pool', async () => {
  const id = 'bda6f878-b1d9-4f18-8d4f-3d08c1d00651'
  vi.spyOn(profileApi, 'list').mockResolvedValue([])
  vi.spyOn(proxyApi, 'list').mockResolvedValue([{ id, protocol: 'http', host: '127.0.0.1', port: 8080, enabled: true, status: 'healthy', consecutiveFailures: 0 }])
  const save = vi.fn()
  render(<CampaignForm initial={{ name: 'Test', url: 'http://localhost/one' }} workers={[]} connection={{ baseUrl: 'http://127.0.0.1:4782', token: '', owned: false }} onSave={save} onCancel={vi.fn()} busy={false} error="" />)
  fireEvent.change(screen.getByLabelText(/Target URLs/), { target: { value: 'http://localhost/one\nhttp://localhost/two' } })
  fireEvent.change(screen.getByLabelText('Concurrent sessions'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Total sessions'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Proxy selection'), { target: { value: 'pool' } })
  await waitFor(() => expect(screen.getByLabelText('Proxy pool')).toHaveTextContent('127.0.0.1'))
  const select = screen.getByLabelText('Proxy pool') as HTMLSelectElement
  select.options[0].selected = true; fireEvent.change(select)
  fireEvent.submit(screen.getByRole('button', { name: 'Save campaign' }).closest('form')!)
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ targets: ['http://localhost/one', 'http://localhost/two'], concurrency: 2, totalSessions: 4, proxyMode: 'pool', proxyIds: [id] }))
})
test('rejects non-HTTP targets before saving', () => {
  const save = vi.fn()
  render(<CampaignForm initial={{ name: 'Test', url: 'http://localhost/' }} workers={[]} connection={null} onSave={save} onCancel={vi.fn()} busy={false} error="" />)
  fireEvent.change(screen.getByLabelText(/Target URLs/), { target: { value: 'file:///private' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save campaign' }).closest('form')!)
  expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('HTTP(S)')
})
test('keeps keyboard focus inside the editor and supports Escape', () => {
  const cancel = vi.fn()
  render(<CampaignForm initial={{ name: 'Test', url: 'http://localhost/' }} workers={[]} connection={null} onSave={vi.fn()} onCancel={cancel} busy={false} error="" />)
  expect(screen.getByLabelText(/Campaign name/)).toHaveFocus()
  const save = screen.getByRole('button', { name: 'Save campaign' })
  save.focus(); fireEvent.keyDown(save, { key: 'Tab' })
  expect(screen.getAllByRole('button', { name: 'Cancel' })[0]).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(cancel).toHaveBeenCalledTimes(1)
})
