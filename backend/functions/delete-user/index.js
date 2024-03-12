/**
 *　Cognitoからユーザーを削除します。
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
        message: 'User deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error deleting user',
        error: error.message,
      }),
    };
  }
};
