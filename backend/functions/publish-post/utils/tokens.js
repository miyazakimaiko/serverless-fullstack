const encryption = require('../../../utils/encryption.js');

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

export const getTikTokTokens = async ({ pgClient, encryptionKey, userId }) => {
  const selectStatement = `
    SELECT encrypted_access_token, encrypted_refresh_token
    FROM tiktok_account
    WHERE user_id = $1
  `;

  try {
    const { rows } = await pgClient.query(selectStatement, [userId]);

    if (!rows[0] || !rows[0].encrypted_access_token || !rows[0].encrypted_refresh_token) {
      throw new Error('アクセストークンまたはリフレッシュトークンが見つかりません')
    }

    const tokenData = rows[0];

    const accessToken = encryption.decryptText({
      encryptedText: tokenData.encrypted_access_token,
      key: encryptionKey,
    });

    const refreshToken = encryption.decryptText({
      encryptedText: tokenData.encrypted_refresh_token,
      key: encryptionKey,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error('TikTokアカウントデータ取得失敗', error);
    throw error;
  }
}