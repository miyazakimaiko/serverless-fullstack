/**
 *　フロントエンドからS3へ動画・画像をアップロードするための署名付きURLを発行します。
 */

const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { S3Client } = require('@aws-sdk/client-s3');
const { headers } = require('../../utils/http-response');

exports.handler = async (event) => {
  const s3Client = new S3Client();

  try {
    const { userId } = event.pathParameters;
    const { extension, postId } = event.queryStringParameters;

    const params = determineParamsForMediaToPost({
      userId,
      postId,
      extension,
    });

    const presignedUrl = await createPresignedPost(s3Client, params);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(presignedUrl),
    };
  } catch (error) {
    console.error('署名付きURLの発行に失敗しました:', error);
    throw error;
  }
}

const determineParamsForMediaToPost = ({ userId, postId, extension }) => {
  const contentTypes = {
    jpeg: 'image/jpeg',
    mp4: 'video/mp4',
    mp5: 'video/mp5',
  };

  if (!Object.keys(contentTypes).includes(extension)) {
    throw new Error(`${extension}は投稿に使用できません`);
  }
  const contentType = contentTypes[extension];

  return {
    Bucket: process.env.MEDIA_BUCKET_NAME || '',
    Key: `${userId}/${postId}.${extension}`,
    Fields: {
      'Content-Type': contentType
    },
    Expires: 600,
  };
}