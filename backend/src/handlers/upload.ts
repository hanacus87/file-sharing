import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { FileRecord, UPLOAD_CONFIG } from '../types/models';
import { UploadResponse, ErrorResponse, ErrorCode } from '../types/api';
import { validateFile } from '../utils/fileValidation';
import { generateShareId, hashPassword, generateS3Key } from '../utils/crypto';
import { saveFileRecord } from '../utils/dynamodb';
import { createPresignedUploadUrl } from '../utils/s3';
import { createSecureResponse, validateEnvironment, secureLogger } from '../utils/security';
import { validatePasswordStrength } from '../utils/passwordValidator';
import { withCSRFProtection } from '../middleware/csrfMiddleware';

async function uploadHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers.origin || event.headers.Origin;

  try {
    validateEnvironment();
    secureLogger.info('Upload handler called', {
      contentType: event.headers['content-type'] || event.headers['Content-Type'],
      userAgent: event.headers['user-agent'] || event.headers['User-Agent'],
      bodyLength: event.body?.length,
    });

    // Parse request body
    if (!event.body) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'No request body', origin);
    }

    let requestData: any;
    try {
      requestData = JSON.parse(event.body);
    } catch (e) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid JSON body', origin);
    }

    const { fileName, fileSize, contentType, password } = requestData;

    if (!fileName || !fileSize || !contentType) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Missing required fields: fileName, fileSize, contentType',
        origin,
      );
    }

    // Validate file
    const validationResult = validateFile(fileName, contentType, fileSize);
    if (!validationResult.isValid) {
      return createErrorResponse(
        validationResult.error!.code,
        validationResult.error!.message,
        origin,
      );
    }

    // Generate share ID and S3 key
    const shareId = generateShareId();
    const s3Key = generateS3Key(shareId, fileName);

    // SECURITY: Log only non-sensitive metadata
    if (process.env.NODE_ENV !== 'production') {
      console.log('Processing upload request:', {
        shareId: shareId.substring(0, 8) + '***',
        fileNameLength: fileName.length,
        fileSize,
        // Do not log actual file names or share IDs
      });
    }

    // Create presigned POST for upload (enforces ContentLengthRange on S3 side)
    const { url: uploadUrl, fields: uploadFields } = await createPresignedUploadUrl(
      s3Key,
      contentType,
    );

    // Handle password if provided
    let passwordHash: string | undefined;
    if (password) {
      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Password validation failed: ${passwordValidation.errors.join(', ')}`,
          origin,
        );
      }
      passwordHash = await hashPassword(password);
    }

    // Save to DynamoDB (with pending status)
    const currentTime = Math.floor(Date.now() / 1000);
    const expiresAt = currentTime + UPLOAD_CONFIG.expirationHours * 3600;

    const fileRecord: FileRecord = {
      shareId,
      originalFilename: fileName,
      s3Key,
      fileSize,
      mimeType: contentType,
      passwordHash,
      uploadedAt: currentTime,
      expiresAt,
      downloadCount: 0,
      scanStatus: 'pending',
    };

    await saveFileRecord(fileRecord);

    // Create response with presigned POST data
    const response: UploadResponse = {
      success: true,
      shareId,
      shareUrl: shareId,
      uploadUrl,
      uploadFields,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      fileName,
      fileSize,
    };

    return createSecureResponse(200, response, origin);
  } catch (error) {
    secureLogger.error('Upload error:', error);
    // Don't expose internal error details to client
    return createErrorResponse(ErrorCode.UPLOAD_FAILED, 'Failed to create upload URL', origin);
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

  return createSecureResponse(400, response, origin);
}

// CSRFミドルウェアでラップしてエクスポート
export const handler = withCSRFProtection(uploadHandler);
