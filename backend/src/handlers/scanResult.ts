import { EventBridgeEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, GetObjectTaggingCommand } from '@aws-sdk/client-s3';

const dynamoDbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);
const s3Client = new S3Client({});

const DYNAMODB_TABLE_NAME = process.env.TABLE_NAME || 'filelair';
const BUCKET_NAME = process.env.BUCKET_NAME || 'filelair-files';

interface S3TagEvent {
  version: string;
  bucket: {
    name: string;
  };
  object: {
    key: string;
    size: number;
    eTag: string;
    versionId?: string;
  };
  'request-id': string;
  requester: string;
  'source-ip-address': string;
  reason: string;
}

export async function handler(
  event: EventBridgeEvent<'Object Tags Added', S3TagEvent>,
  context: Context,
): Promise<void> {
  console.log('Processing S3 tag event:', JSON.stringify(event, null, 2));

  const { detail } = event;
  const bucketName = detail.bucket.name;
  const objectKey = detail.object.key;

  if (bucketName !== BUCKET_NAME) {
    console.log(`Event is for different bucket: ${bucketName}`);
    return;
  }

  // Extract shareId from S3 key (format: yyyy/mm/dd/{shareId}/{filename})
  const keyParts = objectKey.split('/');

  // Check if the key matches the expected format
  if (keyParts.length < 5) {
    console.error('Invalid S3 key format:', objectKey);
    return;
  }

  // shareId is at index 3 (after yyyy/mm/dd)
  const shareId = keyParts[3];

  // Validate shareId format (should be 32 character hex string)
  if (!shareId || shareId.length !== 32) {
    console.error('Invalid shareId format:', shareId);
    return;
  }

  try {
    // Get object tags to check scan result
    const tagsCommand = new GetObjectTaggingCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const tagsResponse = await s3Client.send(tagsCommand);
    const tags = tagsResponse.TagSet || [];

    // Look for GuardDuty scan result tags
    const scanStatusTag = tags.find((tag) => tag.Key === 'GuardDutyMalwareScanStatus');

    if (!scanStatusTag) {
      console.log('No scan status tag found, skipping');
      return;
    }

    if (scanStatusTag.Value === 'NO_THREATS_FOUND') {
      // File is clean
      console.log(`File ${shareId} is clean`);

      await updateFileRecord(shareId, {
        scanStatus: 'clean',
        scanDate: Date.now(),
      });
    } else {
      // Any other status is treated as infected (THREAT_DETECTED, UNSUPPORTED_FILE_TYPE, etc.)
      console.log(`File ${shareId} marked as infected. Status: ${scanStatusTag.Value}`);

      // Update DynamoDB record
      await updateFileRecord(shareId, {
        scanStatus: 'infected',
        scanDate: Date.now(),
        scanResult: JSON.stringify({
          status: scanStatusTag.Value,
        }),
      });

      // Delete file from S3
      console.log(`Deleting file from S3: ${objectKey}`);
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectKey,
        }),
      );

      console.log(`Successfully handled and deleted file ${shareId}`);
    }
  } catch (error) {
    console.error('Error processing scan result:', error);

    // Update record with error status
    try {
      await updateFileRecord(shareId, {
        scanStatus: 'error',
        scanDate: Date.now(),
        scanResult: JSON.stringify({ error: String(error) }),
      });
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    throw error;
  }
}

async function updateFileRecord(shareId: string, updates: Record<string, any>): Promise<void> {
  const updateExpression: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const placeholder = `:val${index}`;
    const namePlaceholder = `#attr${index}`;

    updateExpression.push(`${namePlaceholder} = ${placeholder}`);
    expressionAttributeNames[namePlaceholder] = key;
    expressionAttributeValues[placeholder] = value;
  });

  const command = new UpdateCommand({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { shareId },
    UpdateExpression: `SET ${updateExpression.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  await docClient.send(command);
}
