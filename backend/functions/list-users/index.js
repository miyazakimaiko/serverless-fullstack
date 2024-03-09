const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { headers } = require('../../utils/http-response');

exports.handler = async (event) => {
  try {
    const client = new CognitoIdentityProviderClient();

    const command = new ListUsersCommand({ UserPoolId: process.env.USER_POOL_ID });

    const { Users } = await client.send(command);

    const users = Users.map(user => ({
      Username: user.Username,
      Attributes: user.Attributes.map(attr => ({ 
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
        error: error.message,
      }),
    };
  }
};
