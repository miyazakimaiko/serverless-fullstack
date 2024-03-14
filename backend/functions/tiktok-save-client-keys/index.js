/**
 *　ユーザーのTikTokクライアントキーとクライアントシークレットをDBにインサートします。
 */

const { Client } = require('pg');
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { encryptText } = require('../../utils/encryption');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  try {
    const body = JSON.parse(event.body);

    if (!body.clientKey || !body.clientSecret) {
      throw new Error('clientKeyまたはclientSecretがリクエストボディから見当たりません');
    }
    const { userId } = event.pathParameters;

    const encryptionKey = await getEncryptionKeyFromSsm();

    const encryptedClientSecret = encryptText({
      text: body.clientSecret,
      key: encryptionKey,
    });

    await pgClient.connect();

    const insertQuery = `
      INSERT INTO tiktok_account (user_id, client_key, encrypted_client_secret)
      VALUES ($1, $2, $3)
    `;

    await pgClient.query(insertQuery, [
      userId,
      body.clientKey,
      encryptedClientSecret,
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'SNSクライアントデータが保存されました',
      }),
    };
  } catch (error) {
    console.error('SNSクライアントデータ保存失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'SNSクライアントデータの保存に失敗しました',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const getEncryptionKeyFromSsm = async () => {
  const client = new SSMClient();
  try {
    const input = {
      Name: process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME,
    };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);

    console.log({ response })
    return response.Parameter.Value;
  } catch (error) {
    console.log('暗号化キー取得失敗', error);
    throw error;
  }
}


