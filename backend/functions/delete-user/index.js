
import * as cognito from '@aws-sdk/client-cognito-identity-provider';
import { headers } from '../../utils/http-response.js';

/**
 *　@description Cognito からユーザー を削除します
 */
export async function handler(event) {
  const cognitoClient = new cognito.CognitoIdentityProviderClient();

  try {
    const { userId } = event.pathParameters;

    await deleteCognitoUser({
      cognitoClient,
      userId,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'ユーザーを削除しました',
      }),
    };
  } catch (error) {
    console.error('ユーザー削除失敗:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'ユーザーの削除に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
}

const deleteCognitoUser = async ({ cognitoClient, userId }) => {
  try {
    const command = new cognito.AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: userId,
    });
  
    await cognitoClient.send(command);
  } catch (error) {
    console.error('Cognitoユーザー削除失敗', error);
    throw error;
  }
}