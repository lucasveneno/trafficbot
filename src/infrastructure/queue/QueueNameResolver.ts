import { createHash } from 'crypto';
import { OperatingSystem } from '../browser/profile/BrowserProfile';

export class QueueNameResolver {
  static getPlatformQueue(platform: OperatingSystem | string): string {
    return `traffic-sessions-${platform}`;
  }

  static getAndroidDeviceQueue(serial: string): string {
    // Sanitize the serial for BullMQ safe queue name
    const sanitized = serial.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    
    // If the serial was completely non-alphanumeric, use a hash as fallback
    if (sanitized.length === 0) {
      const hash = createHash('md5').update(serial).digest('hex').substring(0, 8);
      return `traffic-sessions-android-device-${hash}`;
    }
    
    return `traffic-sessions-android-${sanitized}`;
  }
}
