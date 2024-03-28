
import * as cognito from '@aws-sdk/client-cognito-identity-provider';
import { headers } from '../../utils/http-response.js';

/**
 *　@description Cognitoから、全てのユーザーを取得します
 */
export async function handler() {
  try {
    const client = new cognito.CognitoIdentityProviderClient();

    const command = new cognito.ListUsersCommand({ UserPoolId: process.env.USER_POOL_ID });

    const { Users } = await client.send(command);

    if (!Users) {
      throw new Error('Cognitoレスポンスエラー');
    }

    const users = Users.map(user => ({
      Username: user.Username,
      Attributes: user.Attributes?.map(attr => ({ 
        Name: attr.Name, 
        Value: attr.Value,
      })),
      UserCreateDate: user.UserCreateDate,
      UserLastModifiedDate: user.UserLastModifiedDate,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        users,
      }),
    };
  } catch (error) {
    console.error('ユーザーリスト取得失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'ユーザーリストの取得に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
}
