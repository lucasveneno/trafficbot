import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { TrafficJobData } from '../../../domain/entities/SessionContract';
import { SessionConfig } from '../../../domain/entities/Session';

export interface BehaviorModel {
  readonly name: string;
  
  /**
   * Executes the behavior model on the current page.
   * @param engine The browser engine (already navigated to the target URL)
   * @param sessionData The session configuration
   * @param sessionDeadlineMs Epoch time (Date.now()) when the session must hard-stop
   */
  execute(engine: BrowserEngine, sessionData: TrafficJobData | SessionConfig, sessionDeadlineMs: number): Promise<void>;
}
