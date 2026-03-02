export interface SessionConfig {
  id: string;
  url: string;
  userAgent: string;
  userDataDir?: string;
  viewport: { width: number; height: number };
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  durationMs: number;
}

export class Session {
  constructor(public readonly config: SessionConfig) {}
}
