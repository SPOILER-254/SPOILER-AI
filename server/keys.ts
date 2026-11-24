import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const runtimeSessionSecret = crypto.randomBytes(32).toString('hex');
const runtimeEncryptionKey = crypto.randomBytes(32);

function deriveEncryptionKey(raw?: string): Buffer {
  if (!raw || raw.trim().length === 0) {
    return runtimeEncryptionKey;
  }
  return crypto.createHash('sha256').update(raw.trim()).digest();
}

export const keys = {
  sessionSecret: process.env.SESSION_SECRET?.trim() || runtimeSessionSecret,
  encryptionKey: deriveEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY),
  persistentEncryptionConfigured: Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim()),
  persistentSessionSecretConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
};
