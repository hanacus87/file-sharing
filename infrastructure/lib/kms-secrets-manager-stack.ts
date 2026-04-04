import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class KMSSecretsManagerStack extends Construct {
  public readonly encryptionKey: kms.Key;
  public readonly csrfSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // カスタムKMSキーの作成
    this.encryptionKey = new kms.Key(this, 'FileLairEncryptionKey', {
      alias: 'alias/filelair-secrets',
      description: 'KMS key for FileLair secrets encryption',
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // KMSで暗号化されたSecretの作成
    this.csrfSecret = new secretsmanager.Secret(this, 'CSRFEncryptionSecret', {
      secretName: 'filelair/csrf-encryption-key',
      description: 'CSRF token encryption key (KMS encrypted)',
      encryptionKey: this.encryptionKey,
      generateSecretString: {
        passwordLength: 64,
        excludeCharacters: ' !"#$%&\'()*,-.:<>?@[\\]^_`{|}~',
      },
    });
  }

  // Lambda関数への権限付与
  grantSecretAccess(lambdaFunction: lambda.Function) {
    this.csrfSecret.grantRead(lambdaFunction);
    this.encryptionKey.grantDecrypt(lambdaFunction);
  }
}
