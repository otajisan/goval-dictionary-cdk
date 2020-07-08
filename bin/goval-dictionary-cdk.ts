#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { GovalDictionaryCdkStack } from '../lib/goval-dictionary-cdk-stack';

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION

const app = new cdk.App();
new GovalDictionaryCdkStack(app, 'GovalDictionaryCdkStack', {
    env: {
        account,
        region
    }
});

app.synth();