import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import * as path from 'path';

export interface FrontendDeploymentProps {
  websiteBucket: s3.Bucket;
  distribution: cloudfront.Distribution;
}

export class FrontendDeployment extends Construct {
  constructor(scope: Construct, id: string, props: FrontendDeploymentProps) {
    super(scope, id);

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: props.websiteBucket,
      distribution: props.distribution,
      distributionPaths: ['/*'],
    });
  }
}
