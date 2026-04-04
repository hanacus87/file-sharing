import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommandInput,
  GetObjectCommandInput,
  DeleteObjectCommandInput,
  ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { UPLOAD_CONFIG } from '../types/models';

// Initialize S3 client with explicit region
const s3Client = new S3Client({
  region: process.env.S3_AWS_REGION || 'ap-northeast-1',
});
const BUCKET_NAME = process.env.BUCKET_NAME || 'filelair-files';
const PRESIGNED_URL_EXPIRY = 300; // 5min

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  const params: PutObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  };

  await s3Client.send(new PutObjectCommand(params));
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<{ url: string; fields: Record<string, string> }> {
  try {
    // Use createPresignedPost to enforce ContentLengthRange on S3 side,
    // preventing clients from bypassing the file size limit declared in step 1.
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: BUCKET_NAME,
      Key: key,
      Conditions: [
        ['content-length-range', 1, UPLOAD_CONFIG.maxFileSize],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: PRESIGNED_URL_EXPIRY,
    });

    // SECURITY: Do not log presigned URLs as they contain temporary credentials
    if (process.env.NODE_ENV !== 'production') {
      console.log('Generated presigned upload URL for:', {
        bucket: BUCKET_NAME,
        keyPrefix: key.substring(0, 10) + '***',
        contentType: contentType,
      });
    }

    return { url, fields };
  } catch (error) {
    console.error('Error generating presigned URL', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(
      `Failed to generate upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds: number = 300, // 5min
): Promise<string> {
  // RFC 5987 compliant encoding for non-ASCII filenames
  const encodedFilename = encodeURIComponent(filename);
  const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_'); // Fallback for ASCII-only clients

  // Use both filename and filename* for maximum compatibility
  const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

  const params: GetObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: contentDisposition,
  };

  const command = new GetObjectCommand(params);
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function deleteFile(key: string): Promise<void> {
  const params: DeleteObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  await s3Client.send(new DeleteObjectCommand(params));
}

export async function listExpiredFiles(prefix: string): Promise<string[]> {
  const params: ListObjectsV2CommandInput = {
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  };

  const result = await s3Client.send(new ListObjectsV2Command(params));
  return result.Contents?.map((obj) => obj.Key!).filter(Boolean) || [];
}
