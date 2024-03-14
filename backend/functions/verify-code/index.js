/**
 *　Cognitoが送信したアカウント確認コードを検証します。
 */

const { 
  CognitoIdentityProviderClient, 
  AdminConfirmSignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { headers } = require('../../utils/http-response');

const client = new CognitoIdentityProviderClient();

exports.handler = async (event) => {
  try {
    const { email, verificationCode } = JSON.parse(event.body);

    await verifyCode({
      email,
      verificationCode,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '確認コードが検証されました',
      }),
    };
  } catch (error) {
    console.error('コードの検証失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'コードの検証に失敗しました',
        error: error.message,
      }),
    };
  }
};

const verifyCode = async ({ email, verificationCode }) => {
  const command = new AdminConfirmSignUpCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: email,
    ConfirmationCode: verificationCode,
  });
  try {
    await client.send(command);
  } catch (error) {
    console.error('コードの確認失敗', error);
    throw new Error('確認コードが無効です。もう一度お試しください。');
  }
};
