import * as cognito from '@aws-sdk/client-cognito-identity-provider';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

/**
 * @description Userグループに属するユーザーを取得し、各ユーザーごとに publish-post-queue へメッセージを送信します。
 */
export async function handler() {
  try {
    const userIds = await getUserIds();
    const sqsClient = new SQSClient();

    for (const userId of userIds) {
      await addMessageToSQS({ sqsClient, userId });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'メッセージ送信完了',
      }),
    };
  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'メッセージ送信失敗',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
}

/**
 * @description Userグループに属するユーザーを取得
 */
const getUserIds = async () => {
  try {
    const client = new cognito.CognitoIdentityProviderClient();

    const command = new cognito.ListUsersInGroupCommand({ 
      UserPoolId: process.env.USER_POOL_ID,
      GroupName: 'User'
    });

    const { Users } = await client.send(command);

    if (!Users) {
      throw new Error('Cognitoレスポンスエラー');
    }

    const userIds = Users.map(user => user.Username);

    return userIds;
  } catch (error) {
    console.error('一般ユーザーIDリスト取得失敗', error);
    throw error;
  }
}

/**
 * @description メッセージをSQSに送信
 */
const addMessageToSQS = async ({ sqsClient, userId }) => {
  try {
    const messageBodyString = JSON.stringify({
      userId: userId,
    });
    const command = new SendMessageCommand({
      QueueUrl: process.env.PUBLISH_QUEUE_URL,
      MessageBody: messageBodyString,
    });

    await sqsClient.send(command);
    console.log(`SQS へ userId: ${userId} のメッセージが追加されました`);
  } catch (error) {
    console.error(`SQSへメッセージ追加失敗 userId: ${userId}:`, error);
  }
};