#!/usr/bin/env node
const dotenv = require('dotenv');
const cdk = require('aws-cdk-lib');
const { MainStack } = require('../lib/stack');

dotenv.config();

const app = new cdk.App();

const stage = process.env.AWS_STAGE;
const id = `${stage}-${process.env.APP_NAME}`.toLowerCase();

new MainStack(app, id, {
  env: { 
    account: process.env.AWS_ACCOUNT, 
    region: process.env.AWS_REGION
  },
});
