import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Workers } from './Workers'
import { Sessions } from './Sessions'
import { Dashboard } from './Dashboard'
import { Queues } from './Queues'
import type { ControlSnapshot } from '../types/control'

const data: ControlSnapshot = {
  system: {
    application: 'trafficbot',
    apiVersion: 1,
    status: 'healthy',
    redis: 'ready',
    uptimeSeconds: 10,
    platform: 'darwin',
    updatedAt: new Date().toISOString(),
    counts: { active: 1, queued: 0, completedToday: 0, failed: 0, workers: 1, capacity: 1 },
  },
  workers: [
    {
      id: 'pixel-worker',
      platform: 'android',
      architecture: 'arm64',
      runtime: 'device',
      browsers: [{ browser: 'chrome', version: '140' }],
      capacity: 1,
      active: 1,
      health: 'busy',
      status: 'online',
      version: '1.0.0',
      protocolVersion: 1,
      compatibility: 'compatible',
      rollbackAvailable: false,
      rollbackVersion: null,
      heartbeatAt: null,
      device: {
        serial: 'emulator-5554',
        model: 'Pixel 9',
        type: 'emulator',
        osVersion: '16',
      },
    },
  ],
  sessions: [
    {
      id: 's1',
      status: 'active',
      platform: 'android',
      browser: 'chrome',
      workerId: 'pixel-worker',
      profileId: 'pixel-profile',
      persistent: true,
      proxy: 'direct',
      url: 'http://localhost/fixture',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      error: null,
      attempts: 0,
      deviceSerial: 'emulator-5554',
    },
  ],
  queues: [
    {
      id: 'q1',
      platform: 'android',
      label: 'Android · Pixel 9',
      deviceSerial: 'emulator-5554',
      waiting: 2,
      active: 1,
      completed: 0,
      failed: 0,
      delayed: 0,
    },
  ],
}

describe('Workers page', () => {
  test('renders worker capabilities and Android device info', () => {
    render(<Workers data={data} search="" platform="all" connection={null} />)
    expect(screen.getByText('pixel-worker')).toBeInTheDocument()
    expect(screen.getByText('Pixel 9')).toBeInTheDocument()
  })

  test('renders browser version in capability pills', () => {
    render(<Workers data={data} search="" platform="all" connection={null} />)
    expect(screen.getByText(/chrome 140/i)).toBeInTheDocument()
  })

  test('filters workers by platform', () => {
    render(<Workers data={data} search="" platform="linux" connection={null} />)
    expect(screen.queryByText('pixel-worker')).not.toBeInTheDocument()
  })

  test('filters workers by search term', () => {
    render(<Workers data={data} search="nonexistent" platform="all" connection={null} />)
    expect(screen.queryByText('pixel-worker')).not.toBeInTheDocument()
  })

  test('shows empty state when no workers', () => {
    render(<Workers data={{ ...data, workers: [] }} search="" platform="all" connection={null} />)
    expect(screen.getByText(/No workers connected yet/i)).toBeInTheDocument()
  })
})

describe('Sessions page', () => {
  test('renders session rows', () => {
    render(<Sessions data={data} search="" status="all" platform="all" />)
    expect(screen.getByText('http://localhost/fixture')).toBeInTheDocument()
  })

  test('filters by status', () => {
    render(<Sessions data={data} search="" status="failed" platform="all" />)
    expect(screen.queryByText('http://localhost/fixture')).not.toBeInTheDocument()
  })

  test('filters by platform', () => {
    render(<Sessions data={data} search="" status="all" platform="linux" />)
    expect(screen.queryByText('http://localhost/fixture')).not.toBeInTheDocument()
  })

  test('renders persistent badge correctly', () => {
    render(<Sessions data={data} search="" status="all" platform="all" />)
    expect(screen.getByText('persistent')).toBeInTheDocument()
  })

  test('shows empty state without sessions', () => {
    render(<Sessions data={{ ...data, sessions: [] }} search="" status="all" platform="all" />)
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument()
  })
})

describe('Dashboard page', () => {
  test('renders stat cards with real counts', () => {
    render(
      <Dashboard
        data={data}
        live={true}
        owned={true}
      />
    )
    expect(screen.getByText('Active sessions')).toBeInTheDocument()
    expect(screen.getByText('Workers online')).toBeInTheDocument()
  })

  test('shows honest offline state without fabricated counts', () => {
    render(
      <Dashboard
        data={undefined}
        live={false}
        owned={false}
      />
    )
    expect(
      screen.getByText(/No workers registered/i)
    ).toBeInTheDocument()
    // All stat values show — when data is undefined
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  test('shows system health indicators', () => {
    render(
      <Dashboard
        data={data}
        live={true}
        owned={true}
      />
    )
    expect(screen.getByText('System health')).toBeInTheDocument()
    expect(screen.getByText('Worker utilization')).toBeInTheDocument()
  })
})

describe('Queues page', () => {
  test('shows normalized Android queue labels', () => {
    render(<Queues data={data} />)
    expect(screen.getByText('Android · Pixel 9')).toBeInTheDocument()
    expect(screen.getByText('emulator-5554')).toBeInTheDocument()
    // Raw queue ID should not be visible as primary label
    expect(screen.queryByText('q1')).not.toBeInTheDocument()
  })

  test('shows empty state when no queues', () => {
    render(<Queues data={{ ...data, queues: [] }} />)
    expect(screen.getByText(/No queues/i)).toBeInTheDocument()
  })

  test('shows queue stats', () => {
    render(<Queues data={data} />)
    // waiting count: 2, active: 1
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })
})
