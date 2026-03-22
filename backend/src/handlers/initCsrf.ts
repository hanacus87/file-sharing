import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { generateCSRFCookie } from '../utils/csrf-secrets';
import { createSecureResponse } from '../utils/security';

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const origin = event.headers.origin || event.headers.Origin;

  try {
    // CSRFトークンとCookieを生成
    const { token, cookie } = await generateCSRFCookie();

    const response = createSecureResponse(
      200,
      {
        success: true,
        token, // クライアントが読み取れるようにトークンを返す
      },
      origin
    );

    // Set-Cookieヘッダーを追加
    if (response.headers) {
      response.headers['Set-Cookie'] = cookie;
    }

    return response;
  } catch (error) {
    console.error('Error initializing CSRF token:', error);

    return createSecureResponse(
      500,
      {
        success: false,
        error: 'Failed to initialize CSRF token',
      },
      origin
    );
  }
};