import { z } from 'zod';
import { browserFamilySchema, operatingSystemSchema } from '../../infrastructure/browser/profile/BrowserProfile';

export const workerPlatformSchema = operatingSystemSchema;
export type WorkerPlatform = z.infer<typeof workerPlatformSchema>;
export type BrowserFamily = z.infer<typeof browserFamilySchema>;

export const browserCapabilitySchema = z.object({
  browser: browserFamilySchema,
  version: z.string().optional(),
  executablePath: z.string().optional(),
});
export type BrowserCapability = z.infer<typeof browserCapabilitySchema>;

export const deviceCapabilitySchema = z.object({
  type: z.enum(['emulator', 'physical']),
  serial: z.string(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  sdkVersion: z.number().int().optional(),
});
export type DeviceCapability = z.infer<typeof deviceCapabilitySchema>;

export const workerCapabilitiesSchema = z.object({
  workerId: z.string(),
  heartbeatAt: z.string().datetime().optional(),
  platform: workerPlatformSchema,
  architecture: z.enum(['x64', 'arm64']),
  browsers: z.array(browserCapabilitySchema),
  containerized: z.boolean(),
  mobile: z.boolean(),
  gpuAvailable: z.boolean(),
  maxConcurrentSessions: z.number().int().positive(),
  device: deviceCapabilitySchema.optional(),
  status: z.enum(['online', 'draining', 'disabled', 'offline', 'busy']).optional(),
  version: z.string().optional(),
  protocolVersion: z.number().int().optional(),
  rollbackAvailable: z.boolean().optional(),
  rollbackVersion: z.string().nullable().optional(),
});
export type WorkerCapabilities = z.infer<typeof workerCapabilitiesSchema>;

export const sessionRequirementsSchema = z.object({
  platform: workerPlatformSchema.optional(),
  browser: browserFamilySchema.optional(),
  architecture: z.enum(['x64', 'arm64']).optional(),
  mobile: z.boolean().optional(),
  deviceSerial: z.string().optional(),
  androidVersion: z.string().optional(),
  sdkVersion: z.number().int().optional(),
});
export type SessionRequirements = z.infer<typeof sessionRequirementsSchema>;
