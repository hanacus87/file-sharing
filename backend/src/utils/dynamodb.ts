import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  PutCommandInput,
  GetCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { FileRecord } from '../types/models';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'filelair';

export async function saveFileRecord(record: FileRecord): Promise<void> {
  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: record,
  };

  await docClient.send(new PutCommand(params));
}

export async function getFileRecord(shareId: string): Promise<FileRecord | null> {
  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      shareId,
    },
  };

  const result = await docClient.send(new GetCommand(params));
  return (result.Item as FileRecord) || null;
}

export async function incrementDownloadCount(shareId: string): Promise<void> {
  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      shareId,
    },
    UpdateExpression: 'SET downloadCount = downloadCount + :inc',
    ExpressionAttributeValues: {
      ':inc': 1,
    },
  };

  await docClient.send(new UpdateCommand(params));
}

// Download token management
export interface DownloadToken {
  tokenId: string; // Primary key
  shareId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
  clientIp?: string;
}

export async function createDownloadToken(
  tokenId: string,
  shareId: string,
  clientIp: string,
  expirationMinutes: number = 5,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = {
    shareId: `TOKEN#${tokenId}`, // Use prefix to differentiate from file records
    tokenId,
    originalShareId: shareId, // Store the actual shareId separately
    createdAt: now,
    expiresAt: now + expirationMinutes * 60,
    used: false,
    clientIp,
  };

  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: token,
  };

  await docClient.send(new PutCommand(params));
}

export async function validateAndConsumeToken(
  tokenId: string,
  clientIp: string,
): Promise<{ valid: boolean; shareId?: string; error?: string }> {
  const now = Math.floor(Date.now() / 1000);

  // Get token
  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      shareId: `TOKEN#${tokenId}`,
    },
  };

  const result = await docClient.send(new GetCommand(params));
  const token = result.Item as any;

  if (!token) {
    return { valid: false, error: 'Invalid download token' };
  }

  // Check if already used
  if (token.used) {
    return { valid: false, error: 'Download token has already been used' };
  }

  // Check if expired
  if (token.expiresAt < now) {
    return { valid: false, error: 'Download token has expired' };
  }

  // Check IP match (optional - can be disabled for more flexibility)
  if (token.clientIp && token.clientIp !== clientIp) {
    return { valid: false, error: 'Invalid request origin' };
  }

  // Mark token as used
  const updateParams: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      shareId: `TOKEN#${tokenId}`,
    },
    UpdateExpression: 'SET used = :true, usedAt = :now',
    ConditionExpression: 'used = :false', // Ensure atomic operation
    ExpressionAttributeValues: {
      ':true': true,
      ':false': false,
      ':now': now,
    },
  };

  try {
    await docClient.send(new UpdateCommand(updateParams));
    return { valid: true, shareId: token.originalShareId }; // Return the original shareId
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return { valid: false, error: 'Download token has already been used' };
    }
    throw error;
  }
}

export async function deleteFileRecord(shareId: string): Promise<void> {
  const params: DeleteCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      shareId,
    },
  };

  await docClient.send(new DeleteCommand(params));
}
