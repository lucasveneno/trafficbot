export type ProxyProtocol = 'http' | 'https' | 'socks5';

export interface ProxyRecord {
  maxConcurrentLeases?: number;
  id: string;
  name?: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  passwordEncrypted?: string;
  country?: string;
  region?: string;
  provider?: string;
  enabled: boolean;
  status: 'unknown' | 'healthy' | 'degraded' | 'unavailable';
  latencyMs?: number;
  successRate?: number;
  consecutiveFailures: number;
  lastCheckedAt?: string;
  lastUsedAt?: string;
}

export interface ProxyLease {
  leaseId: string;
  proxyId: string;
  sessionId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface PublicProxyDto {
  id: string;
  name?: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  country?: string;
  region?: string;
  provider?: string;
  enabled: boolean;
  status: string;
  latencyMs?: number;
  successRate?: number;
  consecutiveFailures: number;
  activeLeases?: number;
  maxConcurrentLeases?: number;
  lastCheckedAt?: string;
  lastUsedAt?: string;
}

export interface ProxyCreateDto {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  country?: string;
  region?: string;
  provider?: string;
  maxConcurrentLeases?: number;
  enabled?: boolean;
}
