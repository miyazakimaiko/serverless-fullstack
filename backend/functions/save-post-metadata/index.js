/**
 *　ユーザーの投稿メタデータをDBにインサートします。
 * TODO: 最大20件の投稿
 */

const { Client } = require('pg');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);
    
  try {
    const { userId } = event.pathParameters;
    const { sns, caption, extension } = JSON.parse(event.body);

    await pgClient.connect();

    const insertStatement = `
      INSERT INTO post (user_id, sns, caption, extension)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `;
    const result = await pgClient.query(insertStatement, [
      userId,
      sns,
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
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

