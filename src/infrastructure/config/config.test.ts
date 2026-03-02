import { z } from 'zod';

describe('Configuration Validation', () => {
  const ConfigSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MAX_SESSIONS: z.preprocess((a) => parseInt(a as string, 10), z.number().int().positive()).default(1),
  });

  it('should validate correct environment variables', () => {
    const mockEnv = { NODE_ENV: 'production', MAX_SESSIONS: '5' };
    const result = ConfigSchema.parse(mockEnv);
    expect(result.MAX_SESSIONS).toBe(5);
    expect(result.NODE_ENV).toBe('production');
  });

  it('should use default values for missing variables', () => {
    const result = ConfigSchema.parse({});
    expect(result.MAX_SESSIONS).toBe(1);
    expect(result.NODE_ENV).toBe('development');
  });

  it('should fail on invalid values', () => {
    const mockEnv = { MAX_SESSIONS: '-1' };
    expect(() => ConfigSchema.parse(mockEnv)).toThrow();
  });
});
