import { APIGatewayRequestAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import { validateCSRFToken } from '../utils/csrf-secrets';

export const handler: APIGatewayRequestAuthorizerHandler = async (event) => {
  try {
    // API Gatewayプロキシイベントの形式に変換
    // methodArn例: arn:aws:execute-api:region:account-id:api-id/stage/METHOD/resource-path
    const arnParts = event.methodArn.split(':');
    const pathParts = arnParts[5].split('/');
    const httpMethod = pathParts[2];
    const resourcePath = pathParts.slice(3).join('/');

    const proxyEvent = {
      httpMethod: httpMethod,
      headers: event.headers || {},
      path: `/${resourcePath}`,
      requestContext: {
        identity: {
          sourceIp: event.requestContext?.identity?.sourceIp || 'unknown',
        },
      },
    } as any;

    // CSRF検証
    const isValid = await validateCSRFToken(proxyEvent);

    // 検証結果に基づいてポリシーを生成
    const policy: APIGatewayAuthorizerResult = {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: isValid ? 'Allow' : 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };

    // CSRF検証が失敗した場合、コンテキストにエラー情報を追加
    if (!isValid) {
      policy.context = {
        csrfError: 'Invalid or missing CSRF token',
      };
    }

    return policy;
  } catch (error) {
    console.error('CSRF Authorizer error:', error);

    // エラーが発生した場合は拒否
    return {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };
  }
};
