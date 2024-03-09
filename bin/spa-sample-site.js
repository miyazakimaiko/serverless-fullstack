#!/usr/bin/env node
const dotenv = require('dotenv');
const cdk = require('aws-cdk-lib');
const { SpaSampleSiteStack } = require('../lib/stack');

dotenv.config();

const app = new cdk.App();

const stage = process.env.AWS_STAGE;
const id = `${stage}-${process.env.APP_NAME}`.toLowerCase();

new SpaSampleSiteStack(app, id, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION
  },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
