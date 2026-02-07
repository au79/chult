#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ChultServiceStack } from '../lib/chult-service-stack';

const app = new cdk.App();

new ChultServiceStack(app, 'ChultServiceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
