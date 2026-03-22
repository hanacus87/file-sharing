import * as crypto from "crypto";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent } from "aws-lambda";

// Secrets Managerクライアント（リージョン設定含む）
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || "ap-northeast-1",
  maxAttempts: 3,
});

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24時間

export async function getEncryptionKey(): Promise<Buffer> {
  const secretArn = process.env.CSRF_SECRET_ARN;
  if (!secretArn) {
    throw new Error("CSRF_SECRET_ARN environment variable not configured");
  }

  const startTime = Date.now();

  try {
    // 監査ログ: API呼び出し開始
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "SecretAccess",
        source: "SecretsManager",
        secretType: "csrf-encryption",
        action: "GetSecretValue",
      })
    );

    const command = new GetSecretValueCommand({
      SecretId: secretArn,
      VersionStage: "AWSCURRENT", // 常に最新バージョンを使用
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error("Secret value is empty");
    }

    // 監査ログ: 成功
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "SecretAccessSuccess",
        secretType: "csrf-encryption",
        versionStage: "AWSCURRENT",
        duration: Date.now() - startTime,
        kmsKeyType: response.ARN?.includes("kms") ? "custom-key" : "default",
      })
    );

    // 文字列をSHA-256でハッシュ化
    return crypto.createHash("sha256").update(response.SecretString).digest();
  } catch (error) {
    const errorObj = error as Error;
    // 監査ログ: エラー（機密情報を除外）
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "SecretAccessError",
        secretType: "csrf-encryption",
        errorType: errorObj.name || "UnknownError",
        duration: Date.now() - startTime,
      })
    );

    // エラーの再スロー
    throw new Error(
      `Failed to retrieve encryption key: ${
        errorObj.message || "Unknown error"
      }`
    );
  }
}

// CSRFトークンの暗号化（毎回新しいキーを取得）
export async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

// CSRFトークンの復号
export async function decryptToken(
  encryptedData: string
): Promise<string | null> {
  try {
    const key = await getEncryptionKey();
    const parts = encryptedData.split(":");

    if (parts.length !== 3) {
      return null;
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    const errorObj = error as Error;
    console.error(
      "Failed to decrypt CSRF token:",
      errorObj.name || "UnknownError"
    );
    return null;
  }
}

// CSRFトークンの生成とCookieの作成
export async function generateCSRFCookie(): Promise<{
  token: string;
  cookie: string;
}> {
  // ランダムなトークンを生成
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");

  // トークンを暗号化
  const encryptedToken = await encryptToken(token);

  // Cookieの作成
  const cookieOptions = [
    `${CSRF_COOKIE_NAME}=${encryptedToken}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "Path=/",
  ];

  return {
    token,
    cookie: cookieOptions.join("; "),
  };
}

// リクエストからCSRFトークンを抽出
export async function extractCSRFToken(event: APIGatewayProxyEvent): Promise<{
  cookieToken: string | null;
  headerToken: string | null;
}> {
  // Cookieからトークンを取得
  const cookies = event.headers.cookie || event.headers.Cookie || "";
  const cookieMatch = cookies.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;]+)`));
  const encryptedToken = cookieMatch ? cookieMatch[1] : null;
  const cookieToken = encryptedToken
    ? await decryptToken(encryptedToken)
    : null;

  // ヘッダーからトークンを取得
  const headerToken =
    event.headers[CSRF_HEADER_NAME] ||
    event.headers[CSRF_HEADER_NAME.toUpperCase()] ||
    null;

  return { cookieToken, headerToken };
}

// CSRF検証
export async function validateCSRFToken(
  event: APIGatewayProxyEvent
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // GET、HEAD、OPTIONSリクエストはCSRF検証をスキップ
    const method = event.httpMethod.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return true;
    }

    const { cookieToken, headerToken } = await extractCSRFToken(event);

    // 両方のトークンが存在し、一致することを確認
    if (!cookieToken || !headerToken) {
      return false;
    }

    // タイミング攻撃を防ぐため、crypto.timingSafeEqualを使用
    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);

    if (cookieBuffer.length !== headerBuffer.length) {
      return false;
    }

    const isValid = crypto.timingSafeEqual(cookieBuffer, headerBuffer);

    // 監査ログ: CSRF検証結果（個人情報を除外）
    auditLog("CSRFValidation", {
      result: isValid ? "SUCCESS" : "FAILED",
      method: event.httpMethod,
      pathPattern: sanitizePath(event.path || '/'),
      duration: Date.now() - startTime,
    });

    return isValid;
  } catch (error) {
    const errorObj = error as Error;
    auditLog("CSRFValidationError", {
      errorType: errorObj.name || "UnknownError",
      method: event.httpMethod,
      pathPattern: sanitizePath(event.path || '/'),
      duration: Date.now() - startTime,
    });
    throw error;
  }
}

// API Gatewayのレスポンスにセキュリティヘッダーを追加
export async function addSecurityHeaders(
  headers: { [key: string]: string | number | boolean },
  includeCSRF: boolean = false
): Promise<{ [key: string]: string | number | boolean }> {
  const securityHeaders: { [key: string]: string | number | boolean } = {
    ...headers,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };

  if (includeCSRF) {
    const { token, cookie } = await generateCSRFCookie();
    securityHeaders["Set-Cookie"] = cookie;
    // CSRFトークンをカスタムヘッダーで返す（クライアントが読み取れるように）
    securityHeaders["X-CSRF-Token"] = token;
  }

  return securityHeaders;
}

// 監査ログ用ヘルパー関数
export function auditLog(action: string, details: any) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "CSRF",
      action: action,
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      ...details,
    })
  );
}

// URLパスのサニタイズ（パラメータを除去）
function sanitizePath(path: string | undefined): string {
  // pathがundefinedの場合はデフォルト値を返す
  if (!path) {
    return '/';
  }
  // クエリパラメータとパスパラメータのIDを除去
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/{uuid}"
    )
    .replace(/\/\d+/g, "/{id}")
    .replace(/\?.*$/, "");
}
