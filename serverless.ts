import type { Serverless } from 'serverless/aws';

const serverlessConfiguration: Serverless = {
  service: {
    name: 'royalenfield-service',
  },
  frameworkVersion: '2',
  custom: {
    prune: {
      automatic: true,
      number: 3,
    },
    pseudoParameters: {
      allowReferences: false,
    },
    syncHistoryTbl: 'RoyalEnfield-SyncHistory-${self:provider.stage}',
    provision: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 2,
    },
    corsValue: {
      origin: '*',
      allowCredentials: true,
      headers: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Origin',
      ],
    },
    webpack: {
      webpackConfig: './webpack.config.js',
      includeModules: true,
    },
  },
  // Add the serverless-webpack plugin
  plugins: ['serverless-webpack', 'serverless-offline', 'serverless-prune-plugin', 'serverless-pseudo-parameters'],
  provider: {
    name: 'aws',
    runtime: 'nodejs12.x',
    region: "${opt:region, 'ap-southeast-1'}",
    stage: "${opt:stage, 'dev'}",
    apiGateway: {
      minimumCompressionSize: 1024,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      SYNC_HISTORY_TABLE: '${self:custom.syncHistoryTbl}'
    },
    iamRoleStatements: [
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:DescribeTable',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        Resource: '*',
      },
    ],
  },
  functions: {
    generateTickets: {
      handler: 'handlers/generateTickets.main',
      events: [
        {
          schedule: 'cron(0 * ? * * *)',
        },
        {
          http: {
            method: 'get',
            path: 'generate-tickets',
            cors: true,
          },
        },
      ],
    },
    resetDB: {
      handler: 'handlers/resetDB.main',
      events: [
        {
          http: {
            method: 'get',
            path: 'reset-db',
            cors: true,
          },
        },
      ],
    },
  },
  resources: {
    Resources: {
      syncHistory: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: '${self:custom.syncHistoryTbl}',
          AttributeDefinitions: [
            {
              AttributeName: 'ServiceId',
              AttributeType: 'S',
            },
          ],
          KeySchema: [
            {
              AttributeName: 'ServiceId',
              KeyType: 'HASH',
            },
          ],
          ProvisionedThroughput: '${self:custom.provision}',
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
