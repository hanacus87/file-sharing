import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as path from 'path';
import { Construct } from 'constructs';
import { FrontendDeployment } from './frontend-deployment';
import { KMSSecretsManagerStack } from './kms-secrets-manager-stack';

export interface FileLairStackProps extends cdk.StackProps {
  githubOrg: string;
  githubRepo: string;
}

export class FileLairStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FileLairStackProps) {
    super(scope, id, props);

    // GitHub OIDC Provider
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOIDCProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // IAM Role for GitHub Actions
    const githubActionsRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: `GitHubActionsDeployRole-${props.githubRepo}`,
      assumedBy: new iam.FederatedPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.githubOrg}/${props.githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Role for GitHub Actions to deploy CDK',
    });

    // Create a custom policy with least privilege for CDK deployment
    const cdkDeployPolicy = new iam.PolicyDocument({
      statements: [
        // CloudFormation permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-image-publishing-role-${this.account}-${this.region}`,
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
          ],
        }),
      ],
    });

    githubActionsRole.attachInlinePolicy(
      new iam.Policy(this, 'CDKDeployPolicy', {
        document: cdkDeployPolicy,
      }),
    );

    // Output the role ARN for GitHub Actions secret
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: githubActionsRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions (set as AWS_ROLE_ARN secret)',
    });

    // S3 bucket for file storage
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: process.env.BUCKET_NAME || 'filelair-files',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      eventBridgeEnabled: true, // Enable EventBridge notifications
      lifecycleRules: [
        {
          id: 'delete-old-files',
          enabled: true,
          expiration: cdk.Duration.days(7), // Extra safety net
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: [process.env.FRONTEND_URL || 'http://localhost:xxxx'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag', 'x-amz-version-id'],
          maxAge: 3600,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB table for file metadata
    const filesTable = new dynamodb.Table(this, 'FilesTable', {
      tableName: process.env.TABLE_NAME || 'filelair',
      partitionKey: {
        name: 'shareId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions
    filesBucket.grantReadWrite(lambdaRole);
    filesTable.grantReadWriteData(lambdaRole);

    // KMS + Secrets Manager setup for CSRF encryption
    const kmsSecretsStack = new KMSSecretsManagerStack(this, 'KMSSecretsManager');

    // Common Lambda environment
    const environment = {
      BUCKET_NAME: filesBucket.bucketName,
      TABLE_NAME: filesTable.tableName,
      CSRF_SECRET_ARN: kmsSecretsStack.csrfSecret.secretArn,
      NODE_ENV: process.env.NODE_ENV || 'production',
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:xxxx',
      S3_AWS_REGION: process.env.S3_AWS_REGION || 'ap-northeast-1',
    };

    // Lambda functions
    const uploadFunction = new nodejs.NodejsFunction(this, 'UploadFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/upload.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        nodeModules: ['bcryptjs'],
      },
    });

    const downloadFunction = new nodejs.NodejsFunction(this, 'DownloadFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/download.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(1),
      bundling: {
        externalModules: ['@aws-sdk/*'],
        nodeModules: ['bcryptjs'],
      },
    });

    const fileInfoFunction = new nodejs.NodejsFunction(this, 'FileInfoFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/fileInfo.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/*'],
        nodeModules: ['bcryptjs'],
      },
    });

    const deleteFunction = new nodejs.NodejsFunction(this, 'DeleteFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/delete.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/*'],
        nodeModules: ['bcryptjs'],
      },
    });

    const cleanupFunction = new nodejs.NodejsFunction(this, 'CleanupFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/cleanup.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // CSRF Token Initialize Function
    const initCsrfFunction = new nodejs.NodejsFunction(this, 'InitCsrfFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/initCsrf.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // CSRF Authorizer Function
    const csrfAuthorizerFunction = new nodejs.NodejsFunction(this, 'CsrfAuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/csrfAuthorizer.ts'),
      environment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Grant KMS and Secrets Manager permissions to all Lambda functions
    const lambdaFunctions = [
      uploadFunction,
      downloadFunction,
      fileInfoFunction,
      deleteFunction,
      cleanupFunction,
      initCsrfFunction,
      csrfAuthorizerFunction,
    ];

    lambdaFunctions.forEach((func) => {
      kmsSecretsStack.grantSecretAccess(func);
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'FileSharingApi', {
      restApiName: 'fileLair API',
      defaultCorsPreflightOptions: {
        allowOrigins: [process.env.FRONTEND_URL || 'http://localhost:xxxx'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-CSRF-Token'],
        allowCredentials: true,
      },
      binaryMediaTypes: ['multipart/form-data'],
    });

    // Create CSRF Authorizer
    const csrfAuthorizer = new apigateway.RequestAuthorizer(this, 'CsrfAuthorizer', {
      handler: csrfAuthorizerFunction,
      authorizerName: 'CSRFAuthorizer',
      identitySources: [apigateway.IdentitySource.header('X-CSRF-Token')],
      resultsCacheTtl: cdk.Duration.seconds(0), // CSRFトークンをキャッシュしない
    });

    // API routes
    const apiResource = api.root.addResource('api');

    // CSRF初期化エンドポイント（認証不要）
    const initCsrfResource = apiResource.addResource('init-csrf');
    initCsrfResource.addMethod('GET', new apigateway.LambdaIntegration(initCsrfFunction));

    const uploadResource = apiResource.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadFunction), {
      authorizer: csrfAuthorizer,
    });

    const fileResource = apiResource.addResource('file').addResource('{shareId}');
    fileResource.addMethod('GET', new apigateway.LambdaIntegration(fileInfoFunction), {
      authorizer: csrfAuthorizer,
    });

    const downloadResource = apiResource.addResource('download').addResource('{shareId}');
    downloadResource.addMethod('POST', new apigateway.LambdaIntegration(downloadFunction), {
      authorizer: csrfAuthorizer,
    });

    // Delete endpoint
    const filesResource = apiResource.addResource('files').addResource('{shareId}');
    filesResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteFunction), {
      authorizer: csrfAuthorizer,
    });

    // EventBridge rule for cleanup
    const cleanupRule = new events.Rule(this, 'CleanupRule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
    });
    cleanupRule.addTarget(new targets.LambdaFunction(cleanupFunction));

    // GuardDuty Detector with S3 Protection
    const guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      dataSources: {
        s3Logs: {
          enable: true,
        },
      },
    });

    // Lambda function to process malware scan results
    const processScanResultFunction = new nodejs.NodejsFunction(this, 'ProcessScanResultFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      entry: path.join(__dirname, '../../backend/src/handlers/scanResult.ts'),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'es2022',
      },
      environment: {
        TABLE_NAME: filesTable.tableName,
        BUCKET_NAME: filesBucket.bucketName,
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant permissions to process scan result function
    filesTable.grantWriteData(processScanResultFunction);
    filesBucket.grantDelete(processScanResultFunction);
    filesBucket.grantRead(processScanResultFunction);

    // Grant KMS and Secrets Manager permissions to scan result function
    kmsSecretsStack.grantSecretAccess(processScanResultFunction);

    // EventBridge rule for S3 object tagging (malware scan results)
    const scanResultRule = new events.Rule(this, 'MalwareScanResultRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Tags Added'],
        detail: {
          bucket: {
            name: [filesBucket.bucketName],
          },
        },
      },
    });

    scanResultRule.addTarget(new targets.LambdaFunction(processScanResultFunction));

    // S3 bucket for frontend hosting
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `filelair-web`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Security headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
          xssProtection: {
            modeBlock: true,
            protection: true,
            override: true,
          },
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.amazonaws.com; frame-ancestors 'none';",
            override: true,
          },
        },
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=()',
              override: true,
            },
          ],
        },
      },
    );

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: responseHeadersPolicy,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: responseHeadersPolicy,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // Grant CloudFront OAC s3:ListBucket so S3 returns 404 (not 403) for non-existent keys,
    // enabling SPA routing via the existing 404→index.html CloudFront error response.
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:ListBucket'],
        resources: [websiteBucket.bucketArn],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      }),
    );

    // Deploy frontend files to S3
    new FrontendDeployment(this, 'FrontendDeployment', {
      websiteBucket,
      distribution,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket for website hosting',
    });
  }
}
