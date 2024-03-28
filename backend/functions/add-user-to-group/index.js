/**
 * ユーザーをUserグループに加えます。
 */

import * as cognito from '@aws-sdk/client-cognito-identity-provider';
import { headers } from '../../utils/http-response.js';

const cognitoClient = new cognito.CognitoIdentityProviderClient();

export async function handler(event) {
  try {
    const { email, isAdmin } = JSON.parse(event.body);

    if (isAdmin) {
      console.error('APIからAdminユーザーの登録はできません');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'グループ登録に失敗しました',
        }),
      };
    }

    await addUserToGroup({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      email,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'ユーザーをUserグループに登録しました',
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'ユーザーグループ登録に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
}

const addUserToGroup = ({ userPoolId, email, group = 'User' }) => {
  try {
    const input = {
      UserPoolId: userPoolId,
      Username: email,
      GroupName: group,
    };
    const command = new cognito.AdminAddUserToGroupCommand(input);
    return cognitoClient.send(command);
  } catch (error) {
    console.error('Userグループ追加失敗', error);
    throw error;
  }
};
