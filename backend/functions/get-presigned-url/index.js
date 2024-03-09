import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Client } from '@aws-sdk/client-s3';
const { headers } = require('../../utils/http-response');

const s3Client = new S3Client();

exports.handler = async (event) => {
  const userId = event.queryStringParameters.userId;
  const postId = event.queryStringParameters.postId;
  const extension = event.queryStringParameters.extension;

  const contentType = 
    extension === 'jpeg' ? 'image/jpeg'
    : extension === 'mp4' ? 'video/mp4'
    : extension === 'mp5' ? 'video/mp5'
    : null;

  if (!contentType) {
    return {
      statusCode: 422,
      headers,
      body: JSON.stringify({
        message: 'メディアのタイプが正しくありません',
        error: `メディアのタイプ ${extension} は受け付けていません`,
      }),
    };
  }

  const params = {
    Bucket: process.env.MEDIA_BUCKET_NAME,
    Key: `${userId}/${postId}.${extension}`,
    Expires: 1200,
    ContentType: contentType,
  };

  try {
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

