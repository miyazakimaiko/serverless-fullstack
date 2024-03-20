/**
 * https://open.tiktokapis.com/v2/ を使用しTikTokへ投稿します。
 */
export const main = async ({ userId, postToPublish, tokens }) => {
  try {
    if (!tokens) {
      console.log(`TikTokアカウントが登録されていません。TikTok投稿をスキップします | userId ${userId}`);
      return { 
        status: 'skipped',
        userId,
      }
    }
    
    const publishRes = await publishPostToTikTok({
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      postMetadata: postToPublish,
    });

    console.log(`TikTok投稿成功 | userId ${userId}`);

    return {
      status: 'completed',
    }
  } catch (error) {
    return {
      status: 'failed',
      error,
    }
  }
}

const publishPostToTikTok = async ({ userId, accessToken, refreshToken, postMetadata }) => {

  //   curl--location 'https://open.tiktokapis.com/v2/post/publish/video/init/' \
  //   --header 'Authorization: Bearer act.example12345Example12345Example' \
  //   --header 'Content-Type: application/json; charset=UTF-8' \
  //   --data - raw '{
  //   "post_info": {
  //     "title": "this will be a funny #cat video on your @tiktok #fyp",
  //       "privacy_level": "MUTUAL_FOLLOW_FRIENDS",
  //         "disable_duet": false,
  //           "disable_comment": true,
  //             "disable_stitch": false,
  //               "video_cover_timestamp_ms": 1000
  //   },
  //   "source_info": {
  //     "source": "PULL_FROM_URL",
  //       "video_url": "https://example.verified.domain.com/example_video.mp4",
  //   }
  // }'

  const creatorMetadata = getCreatorMetadata({
    accessToken,
  });


  const { caption, extension, postId } = postMetadata;

  if (extension) {

  }

  const publishRes = await publishVideo({
    caption,
    extension,
    postId,
    accessToken,
  });

  if (publishRes?.error !== 'ok') {
    console.error('TikTok投稿失敗:', publishRes);
    throw new Error(publishRes.message);
  }
}

const getCreatorMetadata = async ({ accessToken }) => {
  const url = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

  const mediaQueryRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return await mediaQueryRes.json();
}

const publishVideo = async ({ caption, extension, postId, accessToken }) => {
  const url = `https://open.tiktokapis.com/v2/post/publish/video/init/`;
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;

  const body = {
    post_info: {
      title: caption,
      privacy_level: 'MUTUAL_FOLLOW_FRIENDS',
      disable_duet: false,
      disable_comment: true,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: `http://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`,
    }
  }

  const publishRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return await publishRes.json();
}

const publishPhoto = async ({ caption, extension, postId, accessToken }) => {
  const url = `https://open.tiktokapis.com/v2/post/publish/content/init/`;
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;

  const body = {
    post_info: {
      title: 'test',
      description: caption,
      disable_comment: true,
      privacy_level: 'PUBLIC_TO_EVERYONE',
      auto_add_music: true
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 1,
      photo_images: [
        `http://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`
      ]
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO'
  }

  const publishRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return await publishRes.json();
}

