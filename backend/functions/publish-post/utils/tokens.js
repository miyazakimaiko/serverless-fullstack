import { getEncryptionKeyFromSsm } from '../../../utils/ssm.js';
import * as encryption from '../../../utils/encryption.js';

const parameterName = process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME;

/**
 * @description インスタのアクセストークンをDBから取得
 */
export const getInstaTokens = async ({ pgClient, encryptionKey, userId }) => {
  const selectStatement = `
    SELECT account_id, encrypted_access_token
    FROM insta_account
    WHERE user_id = $1
  `;

  try {
    const { rows } = await pgClient.query(selectStatement, [userId]);

    if (rows.length <= 0) {
      return;
    }

    if (!rows[0].account_id || !rows[0].encrypted_access_token) {
      throw new Error('アクセストークンまたはアカウントIDが見つかりません')
    }

    const tokenData = rows[0];

    const accessToken = encryption.decryptText({
      encryptedText: tokenData.encrypted_access_token,
      key: encryptionKey,
    });

    return { accessToken, accountId: tokenData.account_id };
  } catch (error) {
    console.error('インスタアカウントデータ取得失敗', error);
    throw error;
  }
}

/**
 * @description TikTokのアクセストークンをDBから取得
 */
export const getTikTokTokens = async ({ pgClient, ssmClient, encryptionKey, userId }) => {
  let accessToken, refreshToken;

  const selectStatement = `
    SELECT 
      encrypted_access_token,
      access_expires_at,
      encrypted_refresh_token,
      refresh_expires_at
    FROM tiktok_account
    WHERE user_id = $1
  `;

  try {
    const { rows } = await pgClient.query(selectStatement, [userId]);

    if (!rows[0] || !rows[0].encrypted_access_token || !rows[0].encrypted_refresh_token) {
      throw new Error('アクセストークンまたはリフレッシュトークンが見つかりません')
    }

    const tokenData = rows[0];

    accessToken = encryption.decryptText({
      encryptedText: tokenData.encrypted_access_token,
      key: encryptionKey,
    });

    refreshToken = encryption.decryptText({
      encryptedText: tokenData.encrypted_refresh_token,
      key: encryptionKey,
    });

    const accessTokenExpired = isTokenExpired(tokenData.access_expires_at);
    const refreshTokenExpired = isTokenExpired(tokenData.refresh_expires_at);

    if (accessTokenExpired && !refreshTokenExpired) {
      const response = await refreshTikTokAccessToken(refreshToken);

      await updateTikTokTokens({
        pgClient,
        ssmClient,
        userId,
        tokenMetadata: response
      });

      accessToken = response.access_token;
      refreshToken = response.refresh_token;
    } else if (accessTokenExpired && refreshTokenExpired) {
      throw new Error('アクセストークン、リフレッシュトークン共に有効期限切れです。ユーザーはUIからTikTokの再認証を行ってください');
    }
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('TikTokアカウントデータ取得失敗', error);
    throw error;
  }
}

/**
 * @description tokenExpiresAtが現在よりも過去のものかチェック
 */
const isTokenExpired = (tokenExpiresAt) => {
  const tokenExpiresAtDatetime = new Date(tokenExpiresAt);
  const currentDatetime = new Date()

  if (tokenExpiresAtDatetime < currentDatetime) {
    return true;
  }
  return false;
}

/**
 * @description TikTokアクセストークンをリフレッシュトークンでTikTokから再取得
 */
const refreshTikTokAccessToken = async (refreshToken) => {
  console.log('TikTokアクセストークン期限切れのため、再取得します');

  const url = 'https://open.tiktokapis.com/v2/oauth/token/';

  const requestBody = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || '',
    client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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
      throw new Error(`TikTokアクセストークン再取得に失敗しました ${response.status} ${response.statusText}`);
    }
    if (responseBody.error) {
      throw new Error(`TikTokアクセストークン再取得に失敗しました: ${responseBody.error} - ${responseBody.error_description}`);
    }
    console.log('TikTokアクセストークンを再取得しました');
    return responseBody;
  } catch (error) {
    console.error('TikTokアクセストークン再取得失敗', error);
    throw error;
  }
}

/**
 * @description 新しいTikTokアクセストークンを暗号化し、DBに上書き保存
 */
const updateTikTokTokens = async ({ pgClient, ssmClient, userId, tokenMetadata }) => {
  const updateStatement = `
      UPDATE tiktok_account 
      SET open_id = $1,
          encrypted_access_token = $2,
          access_expires_at = $3,
          encrypted_refresh_token = $4,
          refresh_expires_at = $5
      WHERE user_id = $6
    `;

  try {
    const {
      open_id: openId,
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: refreshExpiresIn,
    } = tokenMetadata;

    const encryptionKey = await getEncryptionKeyFromSsm({ ssmClient, parameterName });

    const encryptedAccessToken = encryption.encryptText({
      text: accessToken,
      key: encryptionKey,
    });

    const encryptedRefreshToken = encryption.encryptText({
      text: refreshToken,
      key: encryptionKey,
    });

    const accessTokenExpiresIn = calculateExpirationDatetime(expiresIn);
    const refreshTokenExpiresIn = calculateExpirationDatetime(refreshExpiresIn);

    await pgClient.query(updateStatement, [
      openId,
      encryptedAccessToken,
      accessTokenExpiresIn,
      encryptedRefreshToken,
      refreshTokenExpiresIn,
      userId,
    ]);
  } catch (error) {
    console.error('TikTokトークン上書き保存保存失敗', error);
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
