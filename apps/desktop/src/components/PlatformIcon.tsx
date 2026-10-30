import { Monitor, LayoutGrid, Command, Smartphone, Terminal } from 'lucide-react'
import type { Platform } from '../types/control'

const LABELS: Record<Platform, string> = {
  linux: 'Linux',
  windows: 'Windows',
  macos: 'macOS',
  android: 'Android',
  ios: 'iOS',
}

export function PlatformIcon({ platform, size = 16 }: { platform: Platform; size?: number }) {
  const getIcon = () => {
    switch (platform) {
      case 'linux': return <Terminal size={size} />
      case 'windows': return <LayoutGrid size={size} />
      case 'macos': return <Command size={size} />
      case 'android':
      case 'ios': return <Smartphone size={size} />
      default: return <Monitor size={size} />
    }
  }

  return (
    <span
      aria-label={LABELS[platform]}
      title={LABELS[platform]}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {getIcon()}
    </span>
  )
}

export function platformLabel(platform: Platform): string {
  return LABELS[platform] ?? platform
}
