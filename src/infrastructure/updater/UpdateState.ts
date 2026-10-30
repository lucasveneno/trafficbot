/**
 * Update State Machine
 * Tracks every distinct phase of a worker self-update or rollback operation.
 */
export type WorkerUpdateState =
  | 'idle'
  | 'draining'
  | 'waiting_for_sessions'
  | 'fetching_manifest'
  | 'downloading'
  | 'verifying'
  | 'preparing'
  | 'installing'
  | 'restarting'
  | 'completed'
  | 'failed'
  | 'rollback_available'
  | 'rolling_back';

export interface UpdateEvent {
  workerId: string;
  updateId: string;
  state: WorkerUpdateState;
  fromVersion: string | null;
  targetVersion: string | null;
  startedAt: string;
  completedAt?: string;
  errorCode?: string;
  progress?: number; // 0–100 for download progress
}
