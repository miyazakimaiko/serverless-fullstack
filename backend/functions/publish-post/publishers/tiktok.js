import { MEDIA_EXTENSIONS, MEDIA_TYPES, STATUS, TIKTOK_PRIVACY_LEVEL_OPTIONS } from '../utils/enums.js';

const tiktokApiUrl = 'https://open.tiktokapis.com/v2';

/**
 * @description https://open.tiktokapis.com/v2/ を使用しTikTokへ投稿するためのメイン関数
 */
export const tiktokPublisher = async ({ userId, postToPublish, tokens }) => {
  try {
    if (!tokens) {
      console.log(`TikTokアカウントが登録されていません。TikTok投稿をスキップします | userId ${userId}`);
      return { 
        status: STATUS.SKIPPED,
        userId,
      }
    }
    
    const publishRes = await publishPostToTikTok({
      userId,
      accessToken: tokens.accessToken,
      postMetadata: postToPublish,
    });

    console.log(`TikTok投稿成功 | userId ${userId}`);

    return publishRes;
  } catch (error) {
    return {
      status: STATUS.FAILED,
      error,
    }
  }
}

/**
 * @description 投稿内容別に投稿方法を選別し、publish関数を呼び出す
 */
const publishPostToTikTok = async ({ userId, accessToken, postMetadata }) => {
  const { caption, extension, id: postId } = postMetadata;

  const mediaType = Object.values(MEDIA_EXTENSIONS.IMAGE).includes(postMetadata.extension) ? 'image'
    : Object.values(MEDIA_EXTENSIONS.VIDEO).includes(postMetadata.extension) ? 'video'
    : null;

  if (!mediaType) {
    throw new Error(`${postMetadata.extension} のメディアタイプが見つかりません`);
  }

  const { privacyLevelOptions } = await getCreatorMetadata({
    accessToken,
  });

  const privacyLevel = determinePrivacyLevel(privacyLevelOptions);

  let publishedRes;

  if (mediaType === MEDIA_TYPES.IMAGE) {
    publishedRes = await publishPhoto({
      userId,
      privacyLevel,
      caption,
      extension,
      postId,
      accessToken,
    });
  } else if (mediaType === MEDIA_TYPES.VIDEO) {
    publishedRes = await publishVideo({
      userId,
      privacyLevel,
      caption,
      extension,
      postId,
      accessToken,
    });
  }

  if (!publishedRes) {
    console.error('投稿レスポンスエラー');
    return { 
      status: STATUS.FAILED,
      error: '投稿レスポンスエラー',
    }
  }

  if (publishedRes.error.code !== 'ok') {
    console.error('投稿エラー', publishedRes.error.code, publishedRes.error.message);
    return { 
      status: STATUS.FAILED,
      error: publishedRes.error,
    }
  }

  return { 
    status: STATUS.COMPLETED,
  }
}

/**
 * @description 使用可能な公開基準を確認するためのクリエイターメタデータを取得
 */
const getCreatorMetadata = async ({ accessToken }) => {
  try {
    const url = `${tiktokApiUrl}/post/publish/creator_info/query/`;
  
    const mediaQueryRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const jsonRes = await mediaQueryRes.json();

    const creatorMetadata =jsonRes.data;
  
    return {
      commentDisabled: creatorMetadata.comment_disabled,
      duetDisabled: creatorMetadata.duet_disabled,
      maxVideoPostDurationSec: creatorMetadata.max_video_post_duration_sec,
      privacyLevelOptions: creatorMetadata.privacy_level_options,
      stitchDisabled: creatorMetadata.stitch_disabled
    }; 
  } catch (error) {
    console.error('クリエイターメタデータ取得失敗', error);
    throw error;
  }
}

/**
 * @description 動画を投稿
 */
const publishVideo = async ({ userId, privacyLevel, caption, extension, postId, accessToken }) => {
  const url = `${tiktokApiUrl}/post/publish/video/init/`;
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;

  const body = {
    post_info: {
      title: caption,
      privacy_level: privacyLevel,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: `https://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`,
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

/**
 * @description 画像を投稿
 */
const publishPhoto = async ({ userId, privacyLevel, caption, extension, postId, accessToken }) => {
  try {
    const url = `${tiktokApiUrl}/post/publish/content/init/`;
    const mediaBucketName = process.env.MEDIA_BUCKET_NAME;
    const imageUrl = `https://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`;
  
    const body = {
      post_info: {
        description: caption,
        privacy_level: privacyLevel,
        auto_add_music: true
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: [
          imageUrl
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
  } catch (error) {
    console.error('イメージ投稿エラー', error);
    throw error;
  }

}

/**
 * @description 使用可能な公開基準のリストから適したレベルを選別
 */
const determinePrivacyLevel = (privacyLevelOptions) => {
  // 未監査クライアントは SELF_ONLY 以外の公開基準で投稿することができません。
  // 監査を受け通過した後、この環境変数をtrueにするか、このif句を削除してください。
  // 参照: https://developers.tiktok.com/doc/content-sharing-guidelines/
  if (!process.env.TIKTOK_CLIENT_AUDITED) {
    return TIKTOK_PRIVACY_LEVEL_OPTIONS.SELF_ONLY;
  }

  if (privacyLevelOptions.includes(TIKTOK_PRIVACY_LEVEL_OPTIONS.PUBLIC_TO_EVERYONE)) {
    return TIKTOK_PRIVACY_LEVEL_OPTIONS.PUBLIC_TO_EVERYONE;
  }
  if (privacyLevelOptions.includes(TIKTOK_PRIVACY_LEVEL_OPTIONS.MUTUAL_FOLLOW_FRIENDS)) {
    return TIKTOK_PRIVACY_LEVEL_OPTIONS.MUTUAL_FOLLOW_FRIENDS;
  }
  if (privacyLevelOptions.includes(TIKTOK_PRIVACY_LEVEL_OPTIONS.SELF_ONLY)) {
    return TIKTOK_PRIVACY_LEVEL_OPTIONS.SELF_ONLY;
  }
  return;
}

