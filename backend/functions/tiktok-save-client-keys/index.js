/**
 *　ユーザーのTikTokクライアントキーとクライアントシークレットをDBにインサートします。
 */

const { Client } = require('pg');
const { SSMClient } = require("@aws-sdk/client-ssm");
const { getEncryptionKeyFromSsm } = require('../../utils/client-ssm.js');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { encryptText } = require('../../utils/encryption');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);
  const ssmClient = new SSMClient();

  try {
    const body = JSON.parse(event.body);

    if (!body.clientKey || !body.clientSecret) {
      throw new Error('clientKeyまたはclientSecretがリクエストボディから見当たりません');
    }
    const { userId } = event.pathParameters;

    const encryptionKey = await getEncryptionKeyFromSsm(ssmClient);

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
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}


