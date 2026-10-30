/** Scheduling contention is deferred, rather than charged as an execution failure. */
export class CapacityUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'CapacityUnavailable'; }
}
