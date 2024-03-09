const { 
  CognitoIdentityProviderClient, 
  SignUpCommand, 
  AdminAddUserToGroupCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const { headers } = require('../../utils/http-response');

const client = new CognitoIdentityProviderClient();

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);
  
    await signUp({
      clientId: process.env.COGNITO_CLIENT_ID,
      email,
      password,
    });

    await addToUserGroup({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      email,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'ユーザーを登録しました',
      }),
    };
  } catch (error) {
    console.error('ユーザー登録失敗:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'ユーザー登録に失敗しました',
        error: error.message,
      }),
    };
  }
};

const signUp = ({ clientId, password, email }) => {
  const command = new SignUpCommand({
    ClientId: clientId,
    Username: email,
    Password: password,
  });
  return client.send(command);
};

const addToUserGroup = ({ userPoolId, email }) => {
  const input = {
    UserPoolId: userPoolId,
    Username: email,
    GroupName: 'User',
  };
  const command = new AdminAddUserToGroupCommand(input);
  return client.send(command);
};
