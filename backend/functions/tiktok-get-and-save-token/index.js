/**
 *　DBへユーザーのTikTokアカウントのクライアントキーとクライアントシークレットを保存します。
 */

const { Client } = require('pg');
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { decryptText } = require('../../utils/encryption');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  try {
    const { userId } = event.pathParameters;
    const authorizationCode = event.queryString.authorizationCode;

    await pgClient.connect();

    const { clientKey, clientSecret } = await getTikTokClientKeys({ 
      pgClient, 
      userId,
    })

    const tokenMetadata = await fetchTikTokAccessTokenUrl({
      authorizationCode,
      clientKey,
      clientSecret,
    });

    if (tokenMetadata.error) {
      throw new Error(tokenMetadata.error_description);
    }

    console.log({tokenMetadata})

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'TikTokアクセストークンが保存されました',
      }),
    };
  } catch (error) {
    console.error('TikTokアクセストークン保存失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'TikTokアクセストークンの保存に失敗しました',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const getTikTokClientKeys = async ({ pgClient, userId }) => {
  const encryptionKey = await getEncryptionKeyFromSsm();

  const selectQuery = `
    SELECT client_key, encrypted_client_secret
    FROM tiktok_account
    WHERE user_id = $1
  `;
  const response = await pgClient.query(selectQuery, [
    userId,
  ]);

  const result = response.rows[0];

  const decryptedClientSecret = decryptText({
    text: result.encrypted_client_secret,
    key: encryptionKey,
  });

  return {
    clientKey: result.client_key,
    clientSecret: decryptedClientSecret,
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

    return response.Parameter.Value;
  } catch (error) {
    console.log('暗号化キー取得失敗', error);
    throw error;
  }
}

const fetchTikTokAccessTokenUrl = async ({ authorizationCode, clientKey, clientSecret }) => {
  const url = 'https://open.tiktokapis.com/v2/oauth/token/';

  const requestBody = new URLSearchParams({
    'client_key': clientKey,
    'client_secret': clientSecret,
    'code': authorizationCode,
    'grant_type': 'authorization_code',
    'redirect_uri': 'https://d32lvnv31xi4tj.cloudfront.net/tiktok-redirect',
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: requestBody
  };

  try {
    const response = await fetch(url, requestOptions);
    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(`アクセストークン取得に失敗しました ${response.status} ${response.statusText}`);
    }
    if (responseBody.error) {
      throw new Error(`アクセストークン取得に失敗しました: ${responseBody.error} - ${responseBody.error_description}`);
    }
    return responseBody;
  } catch (error) {
    console.error('アクセストークン取得失敗', error);
    throw error;
  }
}
