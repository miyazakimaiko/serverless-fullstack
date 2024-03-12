/**
 *　データベースへユーザーの投稿メタデータを保存します。
 */

const { Client } = require('pg');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);
  
  const { userId } = event.pathParameters;
  const { caption, extension } = JSON.parse(event.body);
  
  try {
    await pgClient.connect();

    const insertQuery = `
      INSERT INTO posts (user_id, caption, extension)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `;
    const result = await pgClient.query(insertQuery, [
      userId,
      caption,
      extension,
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: '投稿情報が保存されました',
        id: result.rows[0].id,
        createdAt: result.rows[0].created_at,
      }),
    };
  } catch (error) {
    console.error('投稿情報の保存に失敗しました', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '投稿情報の保存に失敗しました',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

