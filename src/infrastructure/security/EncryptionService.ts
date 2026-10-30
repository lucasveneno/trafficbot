import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export class EncryptionService {
  private key: Buffer;

  constructor() {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      // For development, use a deterministic key if not provided, but warn!
      console.warn('ENCRYPTION_KEY is not set. Using insecure default key for development.');
      this.key = Buffer.alloc(32, 'trafficbot-insecure-dev-key-1234');
    } else {
      this.key = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32), 'utf-8');
    }
  }

  encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted payload');
    const [ivHex, authTagHex, encryptedText] = parts;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const encryptionService = new EncryptionService();
