import { APIGatewayProxyResult } from 'aws-lambda';

// Secure CORS origin validation
const ALLOWED_ORIGINS = [process.env.FRONTEND_URL || 'http://localhost:xxxx'];

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// Create secure response with proper CORS headers
export function createSecureResponse(
  statusCode: number,
  body: any,
  origin?: string,
): APIGatewayProxyResult {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify(body),
  };
}

// Validate required environment variables
export function validateEnvironment(): void {
  const required = ['BUCKET_NAME', 'TABLE_NAME'];
  const missing = required.filter((env) => !process.env[env]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Sanitize error messages to prevent information leakage
export function sanitizeError(error: any): string {
  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    return 'An error occurred processing your request';
  }

  // In development, return more detailed errors
  return error.message || 'Unknown error occurred';
}

// Logger that removes sensitive information
export const secureLogger = {
  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, sanitizeLogData(data));
    }
  },
  error: (message: string, error?: any) => {
    const sanitizedError = {
      message: error?.message,
      code: error?.code,
      // Only include stack trace in development
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    };
    console.error(message, sanitizedError);
  },
};

// Remove sensitive data from logs
function sanitizeLogData(data: any): any {
  if (!data) return data;

  const sensitive = ['password', 'token', 'key', 'secret', 'authorization'];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}
