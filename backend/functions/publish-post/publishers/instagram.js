
import { MEDIA_EXTENSIONS, STATUS } from '../utils/enums.js';

const facebookApiUrl = 'https://graph.facebook.com/v19.0';

/**
 * @descirtion https://graph.facebook.com/v19.0 を使用しインスタへ投稿
 */
export const instaPublisher = async ({ userId, postToPublish, tokens }) => {
  try {
    if (!tokens) {
      console.log(`インスタアカウントが登録されていません。インスタ投稿をスキップします | userId ${userId}`);
      return { 
        status: STATUS.SKIPPED,
        userId,
      }
    }
    
    const publishRes = await publishPostToInstagram({
      userId,
      accountId: tokens.accountId, 
      accessToken: tokens.accessToken,
      postMetadata: postToPublish,
    });
  
    if (publishRes.id) {
      console.log(`インスタ投稿成功 | userId ${userId}`);
      return { 
        status: STATUS.COMPLETED,
      }
    } else {
      return { 
        status: STATUS.FAILED,
        error: publishRes,
      }
    }
  } catch (error) {
    return { 
      status: STATUS.FAILED,
      error,
    }
  }
}

/**
 * @description インスタへの投稿の公開リクエストを送り、申請が通り次第投稿
 */
const publishPostToInstagram = async ({ userId, accountId, accessToken, postMetadata }) => {
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;
  const accountBaseUrl = `${facebookApiUrl}/${accountId}`;

  try {
    const { caption, extension, id: postId } = postMetadata;
  
    const mediaType = determineMediaType(extension);
    const urlParamKey = determineUrlParamKey(extension);
    const mediaQueryUrl = 
      `https://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`;
  
    const mediaQueryRes = await sendMediaRequest({
      baseUrl: accountBaseUrl, 
      caption,
      mediaType,
      mediaQueryUrl,
      urlParamKey,
      accessToken,
    });

    let readyToPublish;
    let statusQueryResponse;

    while (!readyToPublish) {
      statusQueryResponse = await sendMediaStatusCheckRequest({
        baseUrl: facebookApiUrl,
        containerId: mediaQueryRes.id,
        accessToken
      });
  
      // 動画を投稿する際は、sendMediaRequest を送った後投稿ができるようになるまで時間がかかるので
      // ここでチェックをしながら待ちます。準備ができたら sendMediaPublishRequest を送ります
      if (statusQueryResponse.status_code !== 'IN_PROGRESS') {
        readyToPublish = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    if (statusQueryResponse.status_code !== 'FINISHED') {
      console.error('インスタ投稿失敗', statusQueryResponse);
      throw new Error('インスタ投稿エラー');
    }
  
    return await sendMediaPublishRequest({
      baseUrl: accountBaseUrl, 
      creationId: mediaQueryRes.id, 
      accessToken,
    });
  } catch (error) {
    console.error('インスタ投稿失敗', error);
    throw error;
  }
}

/**
 * @description メディアタイプを決定
 */
const determineMediaType = (extension) => {
  if (Object.values(MEDIA_EXTENSIONS.VIDEO).includes(extension)) {
    return 'REELS';
  } else {
    return '';
  }
}

/**
 * @description 動画か画像かで変わるURLパラメータを決定
 */
const determineUrlParamKey = (extension) => {
  if (Object.values(MEDIA_EXTENSIONS.VIDEO).includes(extension)) {
    return 'video_url';
  } else {
    return 'image_url';
  }
}

/**
 * @description 投稿の公開リクエストを申請
 */
const sendMediaRequest = async ({ baseUrl, caption, mediaType, mediaQueryUrl, urlParamKey, accessToken, }) => {
  try {
    const queryParams = new URLSearchParams({
      [urlParamKey]: mediaQueryUrl,
      media_type: mediaType,
      caption,
    });

    const mediaQueryRes = await fetch(`${baseUrl}/media?${queryParams}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await mediaQueryRes.json();
  } catch (error) {
    console.error('mediaステップ失敗');
    throw error;
  }
}

/**
 * @description 投稿公開リクエスト申請のステータスチェック
 */
const sendMediaStatusCheckRequest = async ({ baseUrl, containerId, accessToken }) => {
  try {  
    const statusRes = await fetch(`${baseUrl}/${containerId}?fields=status_code`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await statusRes.json();
  } catch (error) {
    console.error('mediaステータスチェック失敗');
    throw error;
  }
}

/**
 * @description 申請の通った投稿を公開
 */
const sendMediaPublishRequest = async ({ baseUrl, creationId, accessToken }) => {
  try {
    const publishQueryParams = new URLSearchParams({
      creation_id: creationId
    });
  
    const publishRes = await fetch(`${baseUrl}/media_publish?${publishQueryParams}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await publishRes.json();
  } catch (error) {
    console.error('media_publishステップ失敗');
    throw error;
  }
}