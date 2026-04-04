import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

// ShareID generation with enhanced security
// Uses 24 bytes (192 bits) of entropy for stronger resistance against brute force
// Results in a 32 character base64url encoded string (URL-safe)
export function generateShareId(): string {
  // Generate 24 random bytes (192 bits of entropy)
  const randomData = randomBytes(24);

  // Add timestamp to ensure uniqueness and make patterns harder to predict
  const timestamp = Buffer.allocUnsafe(8);
  timestamp.writeBigInt64BE(BigInt(Date.now()), 0);

  // Combine random data with timestamp
  const combined = Buffer.concat([randomData, timestamp]);

  // Create a hash to ensure uniform distribution
  const hash = createHash('sha256').update(combined).digest();

  // Use base64url encoding (URL-safe, no padding)
  // This gives us a 43-character string from 32 bytes
  const shareId = hash.toString('base64url');

  // Return first 32 characters for a good balance of security and usability
  // This provides ~192 bits of entropy (6 bits per character * 32 characters)
  return shareId.substring(0, 32);
}

// Generate a shorter, more user-friendly share ID with moderate security
// Used when explicitly requested (e.g., for QR codes or verbal sharing)
export function generateShortShareId(): string {
  // 12 bytes = 96 bits of entropy, resulting in 16 character base64url string
  const randomData = randomBytes(12);
  return randomData.toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateS3Key(shareId: string, filename: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Sanitize filename to prevent path traversal
  const sanitizedFilename = sanitizeFilename(filename);

  // Structure: year/month/day/shareId/filename
  return `${year}/${month}/${day}/${shareId}/${sanitizedFilename}`;
}

function sanitizeFilename(filename: string): string {
  // Remove any path traversal attempts
  let sanitized = filename.replace(/\.\.\/|\.\.\\|\.\.$/g, '_');

  // Remove leading slashes/backslashes
  sanitized = sanitized.replace(/^[\/\\]+/, '');

  // Remove any remaining path separators to ensure filename only
  sanitized = sanitized.replace(/[\/\\]/g, '_');

  // Remove null bytes and other dangerous characters
  sanitized = sanitized.replace(/\x00/g, '');

  // Limit filename length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = sanitized.lastIndexOf('.');
    if (ext > 0) {
      const name = sanitized.substring(0, ext);
      const extension = sanitized.substring(ext);
      sanitized = name.substring(0, maxLength - extension.length) + extension;
    } else {
      sanitized = sanitized.substring(0, maxLength);
    }
  }

  // If filename is empty after sanitization, generate a safe default
  if (!sanitized || sanitized.trim() === '') {
    sanitized = `file_${Date.now()}`;
  }

  return sanitized;
}

// Validate ShareID format to prevent invalid requests
export function isValidShareId(shareId: string): boolean {
  // Check length (32 for standard, 16 for short)
  if (shareId.length !== 32 && shareId.length !== 16) {
    return false;
  }

  // Check if it only contains base64url characters
  const base64urlPattern = /^[A-Za-z0-9\-_]+$/;
  return base64urlPattern.test(shareId);
}

// Generate a one-time download token
// Uses 16 bytes (128 bits) of entropy for the token
export function generateDownloadToken(): string {
  const randomData = randomBytes(16);
  return randomData.toString('base64url');
}

// Validate download token format
export function isValidDownloadToken(token: string): boolean {
  // Token should be 22 characters (16 bytes base64url encoded)
  if (token.length !== 22) {
    return false;
  }

  // Check if it only contains base64url characters
  const base64urlPattern = /^[A-Za-z0-9\-_]+$/;
  return base64urlPattern.test(token);
}
