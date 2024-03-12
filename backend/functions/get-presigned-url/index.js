/**
 *　クライアントからS3へ動画・画像をアップロードするための署名付きURLを発行します。
 */

const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { S3Client } = require('@aws-sdk/client-s3');
const { headers } = require('../../utils/http-response');

exports.handler = async (event) => {
  const s3Client = new S3Client();

  const userId = event.pathParameters.userId;
  const extension = event.queryStringParameters.extension;
  
  // 投稿用メディアをアップロードする際に必要なパラメータ
  const postId = event.queryStringParameters.postId;

  // Tiktokのアカウント登録の際のS3バケットの所有確認用のアップロードをする際に必要なパラメータ
  const tikTokBucketVerificationFileName = event.queryStringParameters.tikTokBucketVerificationFileName;

  let params;

  if(tikTokBucketVerificationFileName) {
    params = determineParamsForTikTokBucketVerification({ 
      userId,
      filename: tikTokBucketVerificationFileName,
      extension,
    });
  } else {
    params = determineParamsForMediaToPost({ 
      userId,
      postId,
      extension,
    });
  }

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

const determineParamsForTikTokBucketVerification = ({ userId, filename, extension }) => {
  if (extension !== 'txt') {
    throw new Error('バケットの所有確認用のファイルはtxtのみ可能です');
  }
  return {
    Bucket: process.env.MEDIA_BUCKET_NAME,
    Key: `${userId}/${filename}.${extension}`,
    Fields: {
      'Content-Type': 'text/plain'
    },
    Expires: 600,
  };
}

const determineParamsForMediaToPost = ({ userId, postId, extension }) => {
  const contentTypes = {
    jpeg : 'image/jpeg',
    mp4 : 'video/mp4',
    mp5 : 'video/mp5',
  };

  if (!Object.keys(contentTypes).includes(extension)) {
    throw new Error(`${extension}は投稿に使用できません`);
  }
  const contentType = contentTypes[extension];

  return {
    Bucket: process.env.MEDIA_BUCKET_NAME,
    Key: `${userId}/${postId}.${extension}`,
    Fields: {
      'Content-Type': contentType
    },
    Expires: 600,
  };
}