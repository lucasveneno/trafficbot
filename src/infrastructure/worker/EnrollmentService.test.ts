
import IORedis from 'ioredis';
import { EnrollmentService } from './EnrollmentService';

describe('EnrollmentService', () => {
  let redis: IORedis;

  beforeAll(() => {
    redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    EnrollmentService.initialize(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  test('generates and consumes a one-time token', async () => {
    const tokenData = await EnrollmentService.generateToken(60);
    expect(tokenData.token).toBeDefined();
    expect(tokenData.expiresAt).toBeDefined();

    // Consume first time succeeds
    const success = await EnrollmentService.consumeToken(tokenData.token);
    expect(success).toBe(true);

    // Consume second time fails
    const fail = await EnrollmentService.consumeToken(tokenData.token);
    expect(fail).toBe(false);
  });
});
