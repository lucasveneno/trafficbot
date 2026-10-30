import { useState, useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastMsg {
  id: number
  message: string
  type: ToastType
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  useEffect(() => {
    const handleAdd = (e: CustomEvent<Omit<ToastMsg, 'id'>>) => {
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, ...e.detail }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 4000)
    }

    window.addEventListener('trafficbot_toast' as any, handleAdd)
    return () => window.removeEventListener('trafficbot_toast' as any, handleAdd)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

export const toast = {
  success: (message: string) => window.dispatchEvent(new CustomEvent('trafficbot_toast', { detail: { message, type: 'success' } })),
  error: (message: string) => window.dispatchEvent(new CustomEvent('trafficbot_toast', { detail: { message, type: 'error' } })),
  info: (message: string) => window.dispatchEvent(new CustomEvent('trafficbot_toast', { detail: { message, type: 'info' } })),
}
