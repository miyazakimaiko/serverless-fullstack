/**
 *　Cognitoからユーザーを削除します。
 * TODO: ユーザーのeventRuleも削除する
 */

const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { headers } = require('../../utils/http-response');

exports.handler = async (event) => {
  try {
    const { userId } = event.pathParameters;

    const client = new CognitoIdentityProviderClient();

    const command = new AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: userId,
    });

    await client.send(command);

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
};
