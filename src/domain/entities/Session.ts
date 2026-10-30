export interface SessionConfig {
  id: string;
  url: string;
  deviceProfile?: string;
  userDataDir?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  durationMs: number;
  intensity?: 'low' | 'medium' | 'high';
  behaviorModel?: string;
}

export class Session {
  constructor(public readonly config: SessionConfig) {}
}
