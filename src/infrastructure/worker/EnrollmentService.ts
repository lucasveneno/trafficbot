import crypto from 'node:crypto';
import IORedis from 'ioredis';
import { Config } from '../config/config';

export interface WorkerEnrollmentToken {
  id: string;
  token: string;
  expiresAt: string;
}

export class EnrollmentService {
  private static redis: IORedis | null = null;

  static initialize(redisConnection: IORedis) {
    this.redis = redisConnection;
  }

  static async generateToken(expiresInSeconds = 3600): Promise<WorkerEnrollmentToken> {
    if (!this.redis) throw new Error('EnrollmentService not initialized');
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    
    await this.redis.set(`traffic:enrollment:${token}`, JSON.stringify({ id, expiresAt }), 'EX', expiresInSeconds);
    
    return { id, token, expiresAt };
  }

  static async consumeToken(token: string): Promise<boolean> {
    if (!this.redis) throw new Error('EnrollmentService not initialized');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    return !!await this.redis.eval("local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]) end; return value", 1, `traffic:enrollment:${token}`);
  }

  static getWorkerConfig() {
    return {
      redisUrl: Config.REDIS_URL,
    };
  }
}
