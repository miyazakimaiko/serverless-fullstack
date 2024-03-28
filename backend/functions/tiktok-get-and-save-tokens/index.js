import { Client } from 'pg';
import { SSMClient } from "@aws-sdk/client-ssm";
import { headers } from '../../utils/http-response';
import { clientConfig } from '../../utils/db';
import { encryptText } from '../../utils/encryption';
import { getEncryptionKeyFromSsm } from '../../utils/ssm';

const parameterName = process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME;

/**
 *　@description TikTokのクライアントキー、クライアントシークレット、そしてTikTokから渡された認証コードを元に
 * アクセストークン、リフレッシュトークン等を取得し、DBにインサートします。
 */
export async function handler(event) {
  const pgClient = new Client(clientConfig);
  const ssmClient = new SSMClient();

  try {
    const { userId, authorizationCode } = event.queryStringParameters;

    await pgClient.connect();

    const tokenMetadata = await fetchTikTokTokens({
      authorizationCode,
      clientKey: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    });

    if (tokenMetadata.error) {
      throw new Error(tokenMetadata.error_description);
    }

    const tokenExisted = await doesTokenExist({
      pgClient,
      userId,
    });

    await saveTokens({
      pgClient,
      ssmClient,
      userId,
      tokenExisted,
      tokenMetadata,
    })

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

/**
 * @description TikTokトークンデータをTikTokから取得
 */
const fetchTikTokTokens = async ({ authorizationCode, clientKey, clientSecret }) => {
  const url = 'https://open.tiktokapis.com/v2/oauth/token/';

  const requestBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI || '',
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

/**
 * @description TikTokトークンデータがDBに存在しているかチェック
 */
const doesTokenExist = async ({ pgClient, userId }) => {
  try {
    const selectQuery = `
      SELECT COUNT(*)
      FROM tiktok_account
      WHERE user_id = $1
    `;

    const selected = await pgClient.query(selectQuery, [
      userId,
    ]);

    return selected.rows[0].count > 0;
  } catch (error) {
    console.error('セレクトクエリ失敗', error);
    throw error;
  }
}

/**
 * @description TikTokアクセストークンを暗号化し、DBに保存
 */
const saveTokens = async ({ pgClient, ssmClient, userId, tokenExisted, tokenMetadata }) => {
  let queryStatement;

  if (tokenExisted) {
    queryStatement = `
      UPDATE tiktok_account 
      SET open_id = $1,
          encrypted_access_token = $2,
          access_expires_at = $3,
          encrypted_refresh_token = $4,
          refresh_expires_at = $5
      WHERE user_id = $6
    `;
  } else {
    queryStatement = `
      INSERT INTO tiktok_account (
        open_id,
        encrypted_access_token,
        access_expires_at,
        encrypted_refresh_token,
        refresh_expires_at,
        user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
  }

  try {
    const {
      open_id: openId,
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: refreshExpiresIn,
    } = tokenMetadata;
  
    const encryptionKey = await getEncryptionKeyFromSsm({ ssmClient, parameterName });
  
    const encryptedAccessToken = encryptText({
      text: accessToken,
      key: encryptionKey,
    });
  
    const encryptedRefreshToken = encryptText({
      text: refreshToken,
      key: encryptionKey,
    });
  
    const accessTokenExpiresIn = calculateExpirationDatetime(expiresIn);
    const refreshTokenExpiresIn = calculateExpirationDatetime(refreshExpiresIn);
  
    await pgClient.query(queryStatement, [
      openId,
      encryptedAccessToken,
      accessTokenExpiresIn,
      encryptedRefreshToken,
      refreshTokenExpiresIn,
      userId,
    ]);
  } catch (error) {
    console.error('トークン保存失敗', error);
    throw error;
  }
}

/**
 * @description expiresInSeconds を日付に変換
 */
function calculateExpirationDatetime(expiresInSeconds) {
  const currentTime = Date.now();

  const expiresInSecondsWithBuffer = expiresInSeconds - (60 * 15);
  const expiresInMilliseconds = expiresInSecondsWithBuffer * 1000;

  const expirationTimestamp = currentTime + expiresInMilliseconds;

  return new Date(expirationTimestamp);
}
