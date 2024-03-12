/**
 *　データベースとS3の両方から、投稿に関するデータを削除します。
 */

const { Client } = require('pg');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');

const mediaBucketName = process.env.MEDIA_BUCKET_NAME;

exports.handler = async (event) => {
  const pgClient = new Client(clientConfig);

  const { userId, postId } = event.pathParameters;

  try {
    await pgClient.connect();
    await pgClient.query('BEGIN');

    // DBから削除
    const deletionQuery = `
      DELETE
      FROM posts
      WHERE user_id = $1
      AND id = $2
    `;

    await pgClient.query(deletionQuery, [
      userId,
      postId
    ]);

    // S3から削除
    const s3Client = new S3Client();

    const { Contents: objectsToDelete } = await getAllObjectsFromMediaBucket({
      client: s3Client,
      userId,
      postId,
    })

    if (objectsToDelete) {
      for (const object of objectsToDelete) {
        await deleteObjectFromMediaBucket({
          client: s3Client,
          key: object.Key,
        });
      }
    }


    // S3から削除できたらコミット
    await pgClient.query('COMMIT');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
      }),
    };
  } catch (error) {
    console.error('投稿削除に失敗しました', error);

    await pgClient.query('ROLLBACK');

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '投稿削除に失敗しました',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
};

const getAllObjectsFromMediaBucket = async ({ client, userId, postId }) => {
  const command = new ListObjectsV2Command({
    Bucket: mediaBucketName,
    Prefix: `${userId}/${postId}`,
  });

  try {
    return await client.send(command);
  } catch (error) {
    console.log('オブジェクトキー取得に失敗しました', error);
    throw error;
  }
}


const deleteObjectFromMediaBucket = async ({ client, key }) => {
  const command = new DeleteObjectCommand({
    Bucket: mediaBucketName,
    Key: key,
  });

  try {
    return await client.send(command);
  } catch (error) {
    console.error('オブジェクト削除に失敗しました', error);
    throw error;
  }
}
