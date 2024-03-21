/**
 * ユーザーの投稿メタデータをDBにインサートします。
 * 投稿の登録は最大で MAX_POST_COUNT 件までです。
 */

const { Client } = require('pg');
const { headers } = require('../../utils/http-response.js');
const { clientConfig } = require('../../utils/db-client.js');

const MAX_POST_COUNT = 20;

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  try {
    const { userId } = event.pathParameters;
    const { caption, extension } = JSON.parse(event.body);

    await pgClient.connect();

    const countIsBelowPostLimit = await checkPostCountLimit({
      pgClient,
      userId,
    });

    if (!countIsBelowPostLimit) {
      throw new Error(`投稿の登録は最大で${MAX_POST_COUNT}件までです`);
    }

    const saveRes = await savePost({
      pgClient, 
      userId,
      caption,
      extension,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: '投稿情報が保存されました',
        id: saveRes.rows[0].id,
        createdAt: saveRes.rows[0].created_at,
      }),
    };
  } catch (error) {
    console.error('投稿情報の保存に失敗しました', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '投稿情報の保存に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const checkPostCountLimit = async ({ pgClient, userId }) => {
  let count;

  try {
    const selectStatement = `
      SELECT COUNT(*)
      FROM post
      WHERE user_id = $1
    `;

    const selectRes = await pgClient.query(selectStatement, [
      userId,
    ]);

    if (selectRes.rows.length <= 0) {
      throw new Error('SELECT文失敗');
    }

    count = selectRes.rows[0].count;
  } catch (error) {
    console.error('投稿カウント失敗')
    throw error;
  }
  return count < MAX_POST_COUNT;
}

const savePost = async ({ pgClient, userId, caption, extension }) => {
  try {
    const insertStatement = `
      INSERT INTO post (user_id, caption, extension)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `;
  
    return await pgClient.query(insertStatement, [
      userId,
      caption,
      extension,
    ]);
  } catch (error) {
    console.error('投稿保存失敗');
    throw error;
  }
}