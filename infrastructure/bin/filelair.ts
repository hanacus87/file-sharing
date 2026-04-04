#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { FileLairStack } from '../lib/filelair-stack';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = new cdk.App();

const githubOrg = 'hanacus87';
const githubRepo = 'file-sharing';

new FileLairStack(app, 'FileLairStack', {
  githubOrg,
  githubRepo,
});
