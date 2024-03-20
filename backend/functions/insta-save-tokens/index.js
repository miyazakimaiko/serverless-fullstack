/**
 *　ユーザーのInstagram長期アクセストークンとアカウントIDをDBにインサートします。
 */

const { Client } = require('pg');
const { SSMClient } = require("@aws-sdk/client-ssm");
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');
const { encryptText } = require('../../utils/encryption');
const { getEncryptionKeyFromSsm } = require('../../utils/client-ssm.js');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);
  const ssmClient = new SSMClient();

  let queryStatement;

  try {
    const body = JSON.parse(event.body);

    if (!body.accessToken || !body.accountId) {
      throw new Error('accessToken または accountId がリクエストボディから見当たりません');
    }
    const { userId } = event.pathParameters;

    await pgClient.connect();

    const tokenExisted = await doesTokenExist({
      pgClient,
      userId,
    });

    if (tokenExisted) {
      queryStatement = `
        UPDATE insta_account 
        SET account_id = $2,
            encrypted_access_token = $3
        WHERE user_id = $1
      `;
    } else {
      queryStatement = `
        INSERT INTO insta_account 
        (user_id, account_id, encrypted_access_token)
        VALUES ($1, $2, $3)
      `;
    }

    const encryptionKey = await getEncryptionKeyFromSsm(ssmClient);

    const encryptedAccessToken = encryptText({
      text: body.accessToken,
      key: encryptionKey,
    });
  
    await pgClient.query(queryStatement, [
      userId,
      body.accountId,
      encryptedAccessToken,
    ]);

    return {
      statusCode: tokenExisted ? 200 : 201,
      headers,
      body: JSON.stringify({
        message: '登録しました',
      }),
    };
  } catch (error) {
    console.error('Instagramデータ保存失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '登録に失敗しました。再度お試しください',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const doesTokenExist = async ({ pgClient, userId }) => {
  try {
    const selectQuery = `
      SELECT * FROM insta_account
      WHERE user_id = $1
    `;
  
    const selected = await pgClient.query(selectQuery, [
      userId,
    ]);
  
    return selected.rows.length > 0;
  } catch (error) {
    console.error('セレクトクエリ失敗', error);
    throw error;
  }
}


