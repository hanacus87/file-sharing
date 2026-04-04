import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { FileInfoResponse, ErrorResponse, ErrorCode } from '../types/api';
import { getFileRecord } from '../utils/dynamodb';
import { validateEnvironment, createSecureResponse, secureLogger } from '../utils/security';
import { isValidShareId } from '../utils/crypto';
import { checkRateLimitGeneric } from '../utils/rateLimiter';
import { withCSRFProtection } from '../middleware/csrfMiddleware';

async function fileInfoHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers.origin || event.headers.Origin;
  const sourceIp = event.requestContext.identity.sourceIp || 'unknown';

  try {
    validateEnvironment();
    const shareId = event.pathParameters?.shareId;

    if (!shareId) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Share ID is required', origin);
    }

    // Validate ShareID format to prevent brute force attempts with invalid formats
    if (!isValidShareId(shareId)) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid share ID format', origin);
    }

    // Apply rate limiting for file info requests to prevent enumeration attacks
    const rateLimitKey = `fileinfo:${sourceIp}`;
    const isAllowed = await checkRateLimitGeneric(rateLimitKey, 60, 30); // 30 requests per minute per IP

    if (!isAllowed) {
      secureLogger.error('File info rate limit exceeded', {
        sourceIp,
        shareId: shareId.substring(0, 8) + '...',
      });
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Too many requests. Please try again later.',
        origin,
      );
    }

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

    // Create response
    const response: FileInfoResponse = {
      success: true,
      fileName: fileRecord.originalFilename,
      fileSize: fileRecord.fileSize,
      uploadedAt: new Date(fileRecord.uploadedAt * 1000).toISOString(),
      expiresAt: new Date(fileRecord.expiresAt * 1000).toISOString(),
      isPasswordProtected: !!fileRecord.passwordHash,
    };

    return createSecureResponse(200, response, origin);
  } catch (error) {
    secureLogger.error('File info error:', error);
    return createErrorResponse(
      ErrorCode.STORAGE_ERROR,
      'Failed to retrieve file information',
      origin,
    );
  }
}

function createErrorResponse(
  code: ErrorCode,
  message: string,
  origin?: string,
): APIGatewayProxyResult {
  const response: ErrorResponse = {
    success: false,
    error: { code, message },
  };

  const statusCode = code === ErrorCode.FILE_NOT_FOUND ? 404 : 400;

  return createSecureResponse(statusCode, response, origin);
}

// CSRFミドルウェアでラップしてエクスポート
export const handler = withCSRFProtection(fileInfoHandler);
