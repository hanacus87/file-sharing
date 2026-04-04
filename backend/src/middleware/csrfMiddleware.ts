import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateCSRFToken, addSecurityHeaders } from '../utils/csrf-secrets';
import { ErrorResponse, ErrorCode } from '../types/api';

export function withCSRFProtection(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // CSRF検証
    if (!(await validateCSRFToken(event))) {
      const response: ErrorResponse = {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'CSRF validation failed',
        },
      };

      return {
        statusCode: 403,
        headers: await addSecurityHeaders({
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:xxxx',
          'Access-Control-Allow-Credentials': 'true',
        }),
        body: JSON.stringify(response),
      };
    }

    // 元のハンドラーを実行
    const result = await handler(event);

    // レスポンスヘッダーにセキュリティヘッダーを追加
    result.headers = await addSecurityHeaders(result.headers || {});

    return result;
  };
}
