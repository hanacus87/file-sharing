import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse, ErrorCode } from '../types/api';
import { getFileRecord, deleteFileRecord } from '../utils/dynamodb';
import { deleteFile } from '../utils/s3';
import { verifyPassword, isValidShareId } from '../utils/crypto';
import { checkRateLimit, recordAttempt } from '../utils/rateLimiter';
import { createSecureResponse, validateEnvironment, secureLogger } from '../utils/security';
import { withCSRFProtection } from '../middleware/csrfMiddleware';

async function deleteHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers.origin || event.headers.Origin;

  try {
    validateEnvironment();

    const shareId = event.pathParameters?.shareId;

    if (!shareId) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Share ID is required', origin);
    }

    // Validate ShareID format
    if (!isValidShareId(shareId)) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid share ID format', origin);
    }

    // Get client IP for rate limiting
    const xForwardedFor = event.headers['X-Forwarded-For'] || event.headers['x-forwarded-for'];
    const clientIp = xForwardedFor
      ? xForwardedFor.split(',').at(-1)!.trim()
      : event.requestContext.identity.sourceIp || 'unknown';

    // Get file record from DynamoDB
    const fileRecord = await getFileRecord(shareId);

    if (!fileRecord) {
      return createErrorResponse(ErrorCode.FILE_NOT_FOUND, 'File not found or has expired', origin);
    }

    // Check if file has expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (fileRecord.expiresAt < currentTime) {
      return createErrorResponse(ErrorCode.FILE_NOT_FOUND, 'File has expired', origin);
    }

    // Log deletion attempt on infected files for audit trail
    if (fileRecord.scanStatus === 'infected') {
      secureLogger.info('Deletion attempt on infected file', {
        shareId: shareId.substring(0, 8) + '...',
        clientIp,
        scanStatus: fileRecord.scanStatus,
        timestamp: new Date().toISOString(),
      });
    }

    // Check password if protected
    if (fileRecord.passwordHash) {
      const body = event.body ? JSON.parse(event.body) : {};
      const password = body.password;

      if (!password) {
        return createErrorResponse(ErrorCode.INVALID_PASSWORD, 'Password is required', origin);
      }

      // Check rate limit
      const rateLimitResult = await checkRateLimit(shareId, clientIp);
      if (!rateLimitResult.allowed) {
        const message = 'Too many failed attempts. Please try again later.';
        return createErrorResponse(ErrorCode.RATE_LIMITED, message, origin, 429);
      }

      const isValidPassword = await verifyPassword(password, fileRecord.passwordHash);

      // Record attempt
      await recordAttempt(shareId, clientIp, isValidPassword);

      if (!isValidPassword) {
        return createErrorResponse(
          ErrorCode.INVALID_PASSWORD,
          'The password you entered is incorrect',
          origin,
        );
      }
    }

    // Perform deletion
    try {
      // Delete from S3 first
      await deleteFile(fileRecord.s3Key);

      // Then delete from DynamoDB
      await deleteFileRecord(shareId);

      // Log deletion for audit
      secureLogger.info('File deleted', {
        shareId: shareId.substring(0, 8) + '...',
        clientIp,
        timestamp: new Date().toISOString(),
        passwordProtected: !!fileRecord.passwordHash,
      });

      return createSecureResponse(
        200,
        {
          success: true,
          message: 'File deleted successfully',
        },
        origin,
      );
    } catch (deleteError) {
      secureLogger.error('Failed to delete file', {
        shareId: shareId.substring(0, 8) + '...',
        error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
      });

      return createErrorResponse(ErrorCode.STORAGE_ERROR, 'Failed to delete file', origin);
    }
  } catch (error) {
    // Log error without sensitive details
    console.error('Delete handler error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return createErrorResponse(
      ErrorCode.STORAGE_ERROR,
      'Failed to process deletion request',
      origin,
    );
  }
}

function createErrorResponse(
  code: ErrorCode,
  message: string,
  origin?: string,
  customStatusCode?: number,
): APIGatewayProxyResult {
  const response: ErrorResponse = {
    success: false,
    error: { code, message },
  };

  const statusCode =
    customStatusCode ||
    (code === ErrorCode.FILE_NOT_FOUND
      ? 404
      : code === ErrorCode.INVALID_PASSWORD
        ? 401
        : code === ErrorCode.RATE_LIMITED
          ? 429
          : 400);

  return createSecureResponse(statusCode, response, origin);
}

// Export with CSRF protection
export const handler = withCSRFProtection(deleteHandler);
