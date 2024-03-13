/**
 *　データベースから、指定のユーザーが保持する全投稿のメタデータを取得します。
 */

const { Client } = require('pg');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  const { userId } = event.pathParameters;
  
  try {
    await pgClient.connect();

    const selectionQuery = `
      SELECT id, caption, extension, created_at, last_posted_at
      FROM post
      WHERE user_id = $1
      ORDER BY created_at
    `;
    const result = await pgClient.query(selectionQuery, [
      userId
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        posts: result.rows,
      }),
    };
  } catch (error) {
    console.error('投稿情報の取得に失敗しました', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '投稿情報の取得に失敗しました',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
};
