import { useState, useEffect } from 'react'
import type { ControlSnapshot } from '../types/control'
import { CheckCircle2, Circle } from 'lucide-react'
import { campaignApi } from '../services/api'
import type { Connection } from '../services/control'

interface OnboardingProps {
  data?: ControlSnapshot
  connection?: Connection | null
}

export function Onboarding({ data, connection }: OnboardingProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('trafficbot_onboarded') === '1'
  )
  const [hasCampaigns, setHasCampaigns] = useState(false)

  useEffect(() => {
    if (connection && !dismissed) {
      campaignApi.list(connection).then(list => setHasCampaigns(list.length > 0)).catch(() => {})
    }
  }, [connection, dismissed])

  const isServerReady = data?.system.status === 'healthy' || data?.system.status === 'degraded'
  const isRedisReady = data?.system.redis === 'ready'
  const hasWorkers = (data?.system.counts.workers ?? 0) > 0
  const isCampaignReady = hasCampaigns

  const tasks = [
    { label: 'Control Server running', done: isServerReady },
    { label: 'Redis connected', done: isRedisReady },
    { label: 'Worker connected', done: hasWorkers },
    { label: 'Create first campaign', done: isCampaignReady },
  ]

  const doneCount = tasks.filter(t => t.done).length
  const isComplete = doneCount === tasks.length

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        localStorage.setItem('trafficbot_onboarded', '1')
        setDismissed(true)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isComplete])

  if (dismissed) return null

  return (
    <div className="onboarding-panel">
      <div className="onboarding-header">
        <h2>Welcome to Trafficbot</h2>
        <p>Complete the setup to start scheduling automated traffic sessions.</p>
      </div>

      <div className="onboarding-tasks">
        {tasks.map((task, i) => (
          <div key={i} className={`onboarding-task ${task.done ? 'done' : ''}`}>
            {task.done ? <CheckCircle2 size={16} className="task-icon done" /> : <Circle size={16} className="task-icon" />}
            <span>{task.label}</span>
          </div>
        ))}
      </div>

      <div className="onboarding-footer">
        <span className="muted-label">{doneCount} of {tasks.length} complete</span>
        <button className="btn-secondary" onClick={() => {
          localStorage.setItem('trafficbot_onboarded', '1')
          setDismissed(true)
        }}>Skip for now</button>
      </div>
    </div>
  )
}
