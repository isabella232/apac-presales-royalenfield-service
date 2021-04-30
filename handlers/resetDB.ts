import { APIGatewayProxyHandler } from 'aws-lambda';
import 'source-map-support/register';
import { DynamoDB } from 'aws-sdk';
const dynamodb = new DynamoDB({ apiVersion: '2012-08-10' });

export const main: APIGatewayProxyHandler = async (event, _context) => {
  const result = await dynamodb
    .scan({
      TableName: process.env.SYNC_HISTORY_TABLE,
    })
    .promise();

  await Promise.all(
    result.Items.map(async (item) => {
      await dynamodb
        .deleteItem({
          TableName: process.env.SYNC_HISTORY_TABLE,
          Key: {
            ServiceId: item.ServiceId,
          },
        })
        .promise();
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'success' }),
  };
};
