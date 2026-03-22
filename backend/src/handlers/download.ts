import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ErrorResponse, ErrorCode } from "../types/api";
import {
  getFileRecord,
  incrementDownloadCount,
  createDownloadToken,
  validateAndConsumeToken,
} from "../utils/dynamodb";
import { getPresignedDownloadUrl } from "../utils/s3";
import {
  verifyPassword,
  isValidShareId,
  generateDownloadToken,
  isValidDownloadToken,
} from "../utils/crypto";
import {
  checkRateLimit,
  recordAttempt,
  checkRateLimitGeneric,
} from "../utils/rateLimiter";
import {
  createSecureResponse,
  validateEnvironment,
  secureLogger,
} from "../utils/security";
import { withCSRFProtection } from "../middleware/csrfMiddleware";

async function downloadHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const origin = event.headers.origin || event.headers.Origin;

  try {
    validateEnvironment();

    // Check if this is a token-based download request
    const token = event.queryStringParameters?.token;
    if (token) {
      return handleTokenDownload(event, token, origin);
    }

    // Otherwise, handle regular download flow (generate token)
    const shareId = event.pathParameters?.shareId;

    if (!shareId) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Share ID is required",
        origin
      );
    }

    // Validate ShareID format
    if (!isValidShareId(shareId)) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid share ID format",
        origin
      );
    }

    // Get client IP for rate limiting
    // CloudFront appends the real client IP to the end of X-Forwarded-For,
    // so we use the last element to prevent IP spoofing via forged headers.
    const xForwardedFor = event.headers["X-Forwarded-For"] || event.headers["x-forwarded-for"];
    const clientIp = xForwardedFor
      ? xForwardedFor.split(",").at(-1)!.trim()
      : event.requestContext.identity.sourceIp || "unknown";

    // For token IP binding, use the first element (viewer IP as reported by CloudFront).
    // This is consistent across CloudFront PoPs, whereas the last element (CloudFront PoP IP)
    // can vary between step 1 (token generation) and step 2 (token consumption).
    const tokenBindIp = xForwardedFor
      ? xForwardedFor.split(",")[0].trim()
      : clientIp;

    // Apply general rate limiting to prevent ShareID enumeration
    const generalRateLimitKey = `download:${clientIp}`;
    const isGeneralAllowed = await checkRateLimitGeneric(
      generalRateLimitKey,
      60,
      20
    ); // 20 download attempts per minute per IP

    if (!isGeneralAllowed) {
      secureLogger.error("Download rate limit exceeded", {
        clientIp,
        shareId: shareId.substring(0, 8) + "...",
      });
      return createErrorResponse(
        ErrorCode.RATE_LIMITED,
        "Too many requests. Please try again later.",
        origin,
        429
      );
    }

    // Get file record from DynamoDB
    const fileRecord = await getFileRecord(shareId);

    if (!fileRecord) {
      return createErrorResponse(
        ErrorCode.FILE_NOT_FOUND,
        "File not found or has expired",
        origin
      );
    }

    // Check if file has expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (fileRecord.expiresAt < currentTime) {
      return createErrorResponse(
        ErrorCode.FILE_NOT_FOUND,
        "File has expired",
        origin
      );
    }

    // Check scan status
    if (fileRecord.scanStatus === "infected") {
      return createErrorResponse(
        ErrorCode.ACCESS_DENIED,
        "This file has been quarantined due to security concerns",
        origin,
        403
      );
    }

    if (
      fileRecord.scanStatus === "pending" ||
      fileRecord.scanStatus === "scanning"
    ) {
      return createErrorResponse(
        ErrorCode.SCAN_PENDING,
        "File is being scanned for security. Please try again in a few moments.",
        origin,
        202
      );
    }

    if (fileRecord.scanStatus === "error") {
      return createErrorResponse(
        ErrorCode.ACCESS_DENIED,
        "File scan encountered an error and access has been denied for security reasons.",
        origin,
        403
      );
    }

    // Check password if protected
    if (fileRecord.passwordHash) {
      const body = event.body ? JSON.parse(event.body) : {};
      const password = body.password;

      if (!password) {
        return createErrorResponse(
          ErrorCode.INVALID_PASSWORD,
          "Password is required",
          origin
        );
      }

      // Check rate limit
      const rateLimitResult = await checkRateLimit(shareId, clientIp);
      if (!rateLimitResult.allowed) {
        const message = "Too many failed attempts. Please try again later.";
        return createErrorResponse(
          ErrorCode.RATE_LIMITED,
          message,
          origin,
          429
        );
      }

      const isValidPassword = await verifyPassword(
        password,
        fileRecord.passwordHash
      );

      // Record attempt
      await recordAttempt(shareId, clientIp, isValidPassword);

      if (!isValidPassword) {
        return createErrorResponse(
          ErrorCode.INVALID_PASSWORD,
          "The password you entered is incorrect",
          origin
        );
      }
    }

    // Generate one-time download token instead of direct URL
    const downloadToken = generateDownloadToken();
    await createDownloadToken(downloadToken, shareId, tokenBindIp, 5); // 5 minute expiry

    // Return token instead of direct download URL
    return createSecureResponse(
      200,
      {
        success: true,
        downloadToken,
        fileName: fileRecord.originalFilename,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
      },
      origin
    );
  } catch (error) {
    // Log error without sensitive details
    console.error("Download error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      // Do not log share IDs or sensitive data
    });
    return createErrorResponse(
      ErrorCode.STORAGE_ERROR,
      "Failed to generate download link",
      origin
    );
  }
}

async function handleTokenDownload(
  event: APIGatewayProxyEvent,
  token: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  try {
    // Validate token format
    if (!isValidDownloadToken(token)) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid download token format",
        origin
      );
    }

    // Get client IP for token validation.
    // Use the first element (viewer IP) to match token creation in downloadHandler.
    const xForwardedFor = event.headers["X-Forwarded-For"] || event.headers["x-forwarded-for"];
    const clientIp = xForwardedFor
      ? xForwardedFor.split(",")[0].trim()
      : event.requestContext.identity.sourceIp || "unknown";

    // Validate and consume token
    const tokenResult = await validateAndConsumeToken(token, clientIp);

    if (!tokenResult.valid) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        tokenResult.error || "Invalid download token",
        origin
      );
    }

    // Get file record
    const fileRecord = await getFileRecord(tokenResult.shareId!);

    if (!fileRecord) {
      return createErrorResponse(
        ErrorCode.FILE_NOT_FOUND,
        "File not found or has expired",
        origin
      );
    }

    // Generate presigned URL with short expiry (5 minutes)
    const downloadUrl = await getPresignedDownloadUrl(
      fileRecord.s3Key,
      fileRecord.originalFilename,
      5 * 60 // 5 minutes
    );

    // Increment download count
    await incrementDownloadCount(tokenResult.shareId!);

    return createSecureResponse(
      200,
      {
        success: true,
        downloadUrl,
        fileName: fileRecord.originalFilename,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
      },
      origin
    );
  } catch (error) {
    secureLogger.error("Token download error:", error);
    return createErrorResponse(
      ErrorCode.STORAGE_ERROR,
      "Failed to process download",
      origin
    );
  }
}

function createErrorResponse(
  code: ErrorCode,
  message: string,
  origin?: string,
  customStatusCode?: number
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

// CSRFミドルウェアでラップしてエクスポート
export const handler = withCSRFProtection(downloadHandler);
