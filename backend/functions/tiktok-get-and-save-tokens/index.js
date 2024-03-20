/**
 *　TikTokのクライアントキー、クライアントシークレット、そしてTikTokから渡された認証コードを元に
 * アクセストークン、リフレッシュトークン等を取得し、DBにインサートします。
 */

const { Client } = require('pg');
const { SSMClient } = require("@aws-sdk/client-ssm");
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { decryptText } = require('../../utils/encryption');
const { getEncryptionKeyFromSsm } = require('../../utils/client-ssm');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);
  const ssmClient = new SSMClient();

  try {
    const authorizationCode = event.queryString.authorizationCode;

    await pgClient.connect();

    const tokenMetadata = await fetchTikTokTokens({
      authorizationCode,
      clientKey: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    });

    if (tokenMetadata.error) {
      throw new Error(tokenMetadata.error_description);
    }

    console.log({tokenMetadata})

    // TODO: ここでトークンをDBに保存

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'TikTokデータが保存されました',
      }),
    };
  } catch (error) {
    console.error('TikTokデータ保存失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'TikTokデータの保存に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const fetchTikTokTokens = async ({ authorizationCode, clientKey, clientSecret }) => {
  const url = 'https://open.tiktokapis.com/v2/oauth/token/';

  const requestBody = new URLSearchParams({
    'client_key': clientKey,
    'client_secret': clientSecret,
    'code': authorizationCode,
    'grant_type': 'authorization_code',
    'redirect_uri': process.env.TIKTOK_REDIRECT_URI || '',
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
