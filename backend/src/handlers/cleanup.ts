import { ScheduledEvent } from 'aws-lambda';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

const BUCKET_NAME = process.env.BUCKET_NAME || 'filelair-files';
const TABLE_NAME = process.env.TABLE_NAME || 'filelair';

export async function handler(event: ScheduledEvent): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting cleanup job');
  }

  try {
    const currentTime = Math.floor(Date.now() / 1000);
    const threeDaysAgo = currentTime - 3 * 24 * 60 * 60; // 3 days buffer for TTL

    // Get date prefix for files older than 3 days
    const date = new Date(threeDaysAgo * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // List and delete old files from S3
    await cleanupS3Files(year, month, day);

    // Clean up any orphaned records in DynamoDB (backup to TTL)
    await cleanupOrphanedRecords(threeDaysAgo);

    if (process.env.NODE_ENV !== 'production') {
      console.log('Cleanup job completed successfully');
    }
  } catch (error) {
    console.error('Cleanup job failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      // Do not log sensitive details
    });
    throw error;
  }
}

async function cleanupS3Files(year: number, month: string, day: string): Promise<void> {
  const prefixes = [];

  // Generate prefixes for the past 7 days (to catch any missed cleanups)
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(year, parseInt(month) - 1, parseInt(day) - i);
    const checkYear = checkDate.getFullYear();
    const checkMonth = String(checkDate.getMonth() + 1).padStart(2, '0');
    const checkDay = String(checkDate.getDate()).padStart(2, '0');
    prefixes.push(`${checkYear}/${checkMonth}/${checkDay}/`);
  }

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResult = await s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        // Check each file's age
        const keysToDelete = listResult.Contents.filter((obj) => {
          if (!obj.LastModified) return false;
          const ageInSeconds = (Date.now() - obj.LastModified.getTime()) / 1000;
          return ageInSeconds > 48 * 3600; // Delete if older than 48 hours
        }).map((obj) => ({ Key: obj.Key! }));

        if (keysToDelete.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
              Objects: keysToDelete,
            },
          });

          await s3Client.send(deleteCommand);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Deleted ${keysToDelete.length} expired files from S3`);
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  }
}

async function cleanupOrphanedRecords(expiryThreshold: number): Promise<void> {
  const scanCommand = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'expiresAt < :threshold',
    ExpressionAttributeValues: {
      ':threshold': { N: expiryThreshold.toString() },
    },
    ProjectionExpression: 'shareId',
  });

  const result = await dynamoClient.send(scanCommand);

  if (result.Items && result.Items.length > 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Found ${result.Items.length} orphaned DynamoDB records`);
    }
    // DynamoDB TTL should handle these, but we log them for monitoring
  }
}
