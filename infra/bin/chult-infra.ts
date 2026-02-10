#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ChultServiceStack } from '../lib/chult-service-stack';
import { ChultCloudFrontCertStack } from '../lib/chult-cloudfront-cert-stack';

const app = new cdk.App();

new ChultCloudFrontCertStack(app, 'ChultCloudFrontCertStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
});

new ChultServiceStack(app, 'ChultServiceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
