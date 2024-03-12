/**
 *　データベースへユーザーのSNSアカウントのメタデータを保存します。
 */

const { Client } = require('pg');
const crypto = require('crypto');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  try {
    const { userId } = event.pathParameters;
    const body = JSON.parse(event.body);

    const encryptionKey = await getEncryptionKeyFromSsm();
    const encryptedToken = encryptToken({
      token: body.token,
      key: encryptionKey,
    });

    console.log({encryptedToken})

    await pgClient.connect();

    const insertQuery = `
      INSERT INTO accounts (user_id, token_type, encrypted_token)
      VALUES ($1, $2, $3)
    `;
    const result = await pgClient.query(insertQuery, [
      userId,
      body.type,
      encryptedToken,
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'SNSアカウントデータが保存されました',
      }),
    };
  } catch (error) {
    console.error('SNSアカウントデータの保存に失敗しました', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'SNSアカウントデータの保存に失敗しました',
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
  
    console.log({response})
    return response.Parameter.Value;
  } catch (error) {
    console.log('暗号化キー取得失敗', error);
    throw error;
  }
}

const encryptToken = ({ token, key }) => {
  const cipher = crypto.createCipheriv('aes-256-gcm', key);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

